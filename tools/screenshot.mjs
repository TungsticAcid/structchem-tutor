#!/usr/bin/env node
/**
 * screenshot.mjs — 在**真实浏览器**里截屏、取控制台报错、执行表达式
 *
 * 用途：验证"构建通过"之外的实机表现。WebGL 渲染、CSS 布局、面板交互这些
 * 构建测不到的东西，只能这样看。
 *
 * 为什么自己写而不用 puppeteer/playwright：Node 18+ 自带 WebSocket，
 * 而这里只需要"起浏览器 → 连 CDP → 求值/截图 → 收尾"。
 * 装一个几十 MB 的浏览器运行时只为看一张图，不划算；系统里已经有 Edge（Chromium 内核）。
 *
 * 用法（默认假设 dev server 已在 3001 端口）：
 *   node tools/screenshot.mjs                          # 截屏到 tmp/shot.png
 *   node tools/screenshot.mjs --out a.png --width 1440 --height 900
 *   node tools/screenshot.mjs --console                # 取控制台 error/warning
 *   node tools/screenshot.mjs --eval "document.title"
 *   node tools/screenshot.mjs --eval "window.__chemAgent.view.getProps()"
 *
 * ★ 无头模式下 WebGL 需要软件渲染（SwiftShader），否则 canvas 是空白——
 *   故默认带 --enable-unsafe-swiftshader --use-angle=swiftshader。
 *
 * ⚠️ **软件渲染 + 动画循环 = CPU 炸弹**。这是真实事故，不是理论风险：
 *   一次验证把 CPU 打满，而当时页面只是一个静态的晶体。原因是渲染循环在
 *   无条件满速重绘（60fps × 1440×900 全用 CPU 算）。事后已把渲染改为按需重绘，
 *   但本工具仍做两道保险，不依赖调用方"记得"：
 *     1. 截图前**冻结动画循环**（把 requestAnimationFrame 换成空函数，
 *        正在排队的回调跑完最后一遍后自然终止）——不冻结就可能整机满载
 *     2. 全程硬超时，到时无条件关浏览器（不给"忘了关"留机会）
 */
import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { createServer } from 'net'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ---- 参数 ----
const argv = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt
}
const has = (name) => argv.includes('--' + name)
const URL_ = flag('url', 'http://localhost:3001/')
const OUT = resolve(REPO, flag('out', 'tmp/shot.png'))
// OUT 落在仓库 tmp/ 下（开发产物，便于直接查看）；该目录已在 .gitignore 里
const W = +flag('width', 1440)
const H = +flag('height', 900)
const WAIT = +flag('wait', 3500)
/**
 * 轮询等待条件成立（如 --wait-for "window.__chemAgent"）。
 * ★ 比固定 sleep 可靠得多：软件渲染下"着色器编译 + 场景构建"的耗时波动很大，
 *   实测 4 秒能就绪、6 秒反而没就绪——固定 sleep 会把这种波动变成假故障。
 */
const WAIT_FOR = flag('wait-for', '')
/**
 * 截图**之前**执行的表达式（如切换晶体）。
 * ★ 需要它是因为每次工具调用都是**新开一个浏览器**：先在一次调用里切晶体、
 *   再在下一次调用里截图，切的晶体早随浏览器关闭丢了（实测踩到，三张图全是默认晶体）。
 *   把"准备状态"和"截图"放进同一次会话才能截到想截的东西。
 */
const BEFORE = flag('before', '')
const PORT = +flag('port', 9222)

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]
const browser = EDGE_CANDIDATES.find((p) => existsSync(p))
if (!browser) {
  console.error('未找到 Edge/Chrome。可用的候选路径：\n  ' + EDGE_CANDIDATES.join('\n  '))
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 找一个**真正空闲**的调试端口（从 start 起试）。见 main() 里那段踩坑说明。 */
async function freePort(start) {
  for (let p = start; p < start + 50; p++) {
    const ok = await new Promise((res) => {
      const srv = createServer()
      srv.once('error', () => res(false))
      srv.once('listening', () => srv.close(() => res(true)))
      srv.listen(p, '127.0.0.1')
    })
    if (ok) return p
  }
  throw new Error(`从 ${start} 起找不到空闲端口`)
}

async function waitForCDP(port, timeoutMs = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await r.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch (e) { /* 还没起来 */ }
    await sleep(300)
  }
  throw new Error(`CDP 超时：${port} 上的浏览器没起来（Edge 首次运行卡在配置初始化？）`)
}

/** 极简 CDP 会话 */
function connect(url) {
  const ws = new WebSocket(url)
  let id = 0
  const pending = new Map()
  const events = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    } else if (msg.method) events.push(msg)
  })
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')))
  })
  return {
    ready, events,
    send(method, params = {}) {
      const myId = ++id
      return new Promise((res, rej) => {
        pending.set(myId, { resolve: res, reject: rej })
        ws.send(JSON.stringify({ id: myId, method, params }))
      })
    },
    close: () => ws.close(),
  }
}

/**
 * 浏览器 profile 放**系统临时目录**，不放仓库内。
 * ★ 一开始放在仓库的 tmp/ 下，结果 Windows 下文件被浏览器占用后 rmSync 直接 EPERM，
 *   而且一度在仓库里留下了一个几百 MB 的浏览器 profile 目录。
 */
const profile = join(tmpdir(), 'chem-agent-edge-profile')

async function main() {
  // 清上一次的残留；失败不算致命（可能仍被上次的浏览器占着），故不抛
  try { rmSync(profile, { recursive: true, force: true }) } catch (e) { /* 忽略 */ }
  // 输出目录可能不存在（tmp/ 不入库，新克隆的仓库里没有）
  mkdirSync(dirname(OUT), { recursive: true })

  // ★ 端口不能写死。实测踩到过：9222 被一个**更早的实例**占着，我的连接打到了它身上，
  //   于是"截图我的应用"实际截的是另一个页面（orbit 的 8765），而且全程不报错——
  //   这是最难发现的一类错误：结果看起来正常，只是不是你要的那个。
  const port = await freePort(PORT)

  const proc = spawn(browser, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--window-size=${W},${H}`,
    URL_,
  ], { stdio: 'ignore', detached: false })

  let code = 0
  // ★ 硬超时：无论卡在哪一步，到时无条件关浏览器并退出。
  //   "忘了关"正是上次 CPU 被打满的直接原因——不依赖调用方自觉。
  const HARD_TIMEOUT = +flag('timeout', 60000)
  const killer = setTimeout(() => {
    console.error(`硬超时 ${HARD_TIMEOUT}ms：无条件关闭浏览器`)
    try { proc.kill() } catch (e) { /* 忽略 */ }
    try { rmSync(profile, { recursive: true, force: true }) } catch (e) { /* 忽略 */ }
    process.exit(3)
  }, HARD_TIMEOUT)
  try {
    const page = await waitForCDP(port)
    const cdp = connect(page.webSocketDebuggerUrl)
    await cdp.ready
    await cdp.send('Runtime.enable')
    await cdp.send('Log.enable')
    await cdp.send('Page.enable')

    /**
     * ★ 显式导航并校验落地地址。
     *   即便端口已经选了空闲的，这一步仍是必要的保险：万一连上的不是自己启动的浏览器，
     *   导航会把页面变成我要的那个；而 href 校验则会在"导不过去"时**明确报错**，
     *   而不是悄悄截了别人的页面。
     */
    await cdp.send('Page.navigate', { url: URL_ })
    {
      const t0 = Date.now()
      let landed = false
      while (Date.now() - t0 < 15000) {
        const r = await cdp.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true })
        if (String(r.result?.value || '').startsWith(URL_)) { landed = true; break }
        await sleep(250)
      }
      if (!landed) throw new Error(`导航未落地：期望 ${URL_}（实际停留在他处，拒绝继续——否则会截错页面）`)
    }

    /** 轮询到条件为真（或超时） */
    async function waitUntil(expr, timeoutMs) {
      const t0 = Date.now()
      while (Date.now() - t0 < timeoutMs) {
        const r = await cdp.send('Runtime.evaluate', { expression: '!!(' + expr + ')', returnByValue: true })
        if (r.result && r.result.value) return true
        await sleep(250)
      }
      return false
    }

    if (WAIT_FOR) {
      const okd = await waitUntil(WAIT_FOR, Math.max(WAIT, 45000))
      if (!okd) console.error(`警告：等待 ${WAIT_FOR} 超时，仍继续（结果可能是加载中的中间态）`)
      else console.error(`就绪：${WAIT_FOR}`)
    }

    if (has('console')) {
      await cdp.send('Page.reload', { ignoreCache: true })
      await sleep(WAIT + 1500)
      const errs = cdp.events
        .filter((e) => e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params.entry.level))
        .map((e) => `${e.params.entry.level}: ${e.params.entry.text}`)
      const ex = cdp.events
        .filter((e) => e.method === 'Runtime.exceptionThrown')
        .map((e) => 'exception: ' + (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text))
      const all = [...errs, ...ex]
      console.log(all.length ? all.join('\n') : '（无 error / warning）')
      code = all.length ? 2 : 0
    } else if (has('eval')) {
      const expr = flag('eval')
      if (!WAIT_FOR) await sleep(WAIT)
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) {
        console.error('求值异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
        code = 1
      } else {
        console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value, null, 1))
      }
    } else {
      if (!WAIT_FOR) await sleep(WAIT)
      if (BEFORE) {
        const r0 = await cdp.send('Runtime.evaluate', { expression: BEFORE, returnByValue: true, awaitPromise: true })
        if (r0.exceptionDetails) console.error('--before 执行异常: ' + String(r0.exceptionDetails.exception?.description || '').slice(0, 160))
        await sleep(1200)   // 等切换后的场景重建与渲染落地
      }
      /**
       * ★ 截图前把 rAF **节流**（不是冻死）。
       *
       * 这里踩过一个会产出假故障的坑：最初写成把 requestAnimationFrame 换成空函数
       * "冻结动画循环"——对**连续 rAF** 的应用有效（排队的那个回调跑完最后一遍就停），
       * 但对**按需渲染**的应用是致命的：渲染本身就发生在 rAF 回调里，
       * 换成空函数等于让"谁改了画面谁请求重绘"永远得不到执行，画面直接空了。
       * 当时差点据此判断"我的渲染修复把晶体弄没了"。
       *
       * 改为节流：rAF 走 setTimeout(250ms)，于是渲染照常发生但最多 4 fps，
       * CPU 被压住，而应用仍能画出正确画面。cancelAnimationFrame 一并换成
       * clearTimeout —— 两者必须配对，否则应用的销毁逻辑会清错定时器。
       */
      await cdp.send('Runtime.evaluate', {
        expression: `(function () {
          if (window.__rafThrottled) return;
          window.__rafThrottled = true;
          window.requestAnimationFrame = function (cb) {
            return setTimeout(function () { cb(performance.now()); }, 250);
          };
          window.cancelAnimationFrame = function (id) { clearTimeout(id); };
        })(); 0`,
        returnByValue: true,
      }).catch(() => {})
      await sleep(800)   // 至少等到一帧节流后的渲染落地
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(OUT, Buffer.from(data, 'base64'))
      console.log('已写 ' + OUT)
    }
    // ★ 任何模式下都把控制台错误带出来：否则 eval 失败时只看到"未定义"，
    //   而真正的原因（模块加载失败、Vite 重载等）留在事件流里没人看。
    //   异常描述含换行堆栈，这里截断到 200 字符即可（诊断用，不必完整堆栈）
    const errs = cdp.events
      .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
      .map((e) => e.params.entry.text)
    const exs = cdp.events
      .filter((e) => e.method === 'Runtime.exceptionThrown')
      .map((e) => 'exception: ' + String(e.params.exceptionDetails.exception?.description || '').slice(0, 200))
    if (errs.length || exs.length) {
      console.error('--- 页面错误 ---')
      for (const x of [...new Set([...errs, ...exs])]) console.error('  ' + x)
    }
    cdp.close()
  } catch (e) {
    console.error(String(e.message || e))
    code = 1
  } finally {
    clearTimeout(killer)
    try { proc.kill() } catch (e) { /* 忽略 */ }
    await sleep(300)
    try { rmSync(profile, { recursive: true, force: true }) } catch (e) { /* 忽略 */ }
  }
  process.exit(code)
}

main()
