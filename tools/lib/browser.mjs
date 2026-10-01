/**
 * lib/browser.mjs —— 起一个无头 Edge/Chrome、连 CDP、**保证收尾**的最小封装
 *
 * 为什么单独抽出来而不是在每个工具里各写一遍：
 *   下面这三道保险都是**踩出来的**，而"手抄一份"正是会悄悄丢掉它们的方式 ——
 *   `screenshot.mjs` 自己的注释里就写着"不依赖调用方记得"。复制出的第二份迟早
 *   只剩一份有保险，而出事时（CPU 打满、截到别人的页面）没有任何提示。
 *
 * 三道保险：
 *   ① **空闲调试端口 + 导航后校验落地地址**：写死端口会连到**更早的实例**上，
 *      于是"截我的应用"实际截的是另一个页面，且全程不报错。
 *   ② **硬超时**：到时无条件关浏览器并退出 —— "忘了关"正是上次 CPU 打满的直接原因。
 *   ③ **profile 放系统临时目录，且在 finally 里删**：放仓库内会在 Windows 上
 *      因文件被占用而 EPERM，还会留下几百 MB 的目录。
 *
 * 另外提供 `throttleRaf()`：截图前把 rAF **节流**（不是冻死）。
 * 换成空函数会让"按需渲染"的应用画面全空 —— 渲染本身就发生在 rAF 回调里。
 */
import { spawn } from 'child_process'
import { existsSync, rmSync } from 'fs'
import { createServer } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]

/** 找一个能用的浏览器可执行文件；找不到返回 null（调用方决定怎么报错） */
export function findBrowser() {
  return EDGE_CANDIDATES.find((p) => existsSync(p)) || null
}

export const BROWSER_CANDIDATES = EDGE_CANDIDATES

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 找一个**真正空闲**的调试端口（从 start 起试） */
export async function freePort(start) {
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

export async function waitForCDP(port, timeoutMs = 15000) {
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

/** 极简 CDP 会话（Node 18+ 自带 WebSocket，故不需要 puppeteer） */
export function connect(url) {
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

const PROFILE = join(tmpdir(), 'chem-agent-edge-profile')

/** 页面在本次会话里产生的 error / 异常（去重后的字符串数组） */
export function pageErrors(cdp) {
  const errs = cdp.events
    .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map((e) => e.params.entry.text)
  const exs = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => 'exception: ' + String(e.params.exceptionDetails.exception?.description || '').slice(0, 200))
  return [...new Set([...errs, ...exs])]
}

/** 截图前把 rAF 节流到 250ms（**不能**换成空函数，理由见文件头） */
export async function throttleRaf(cdp) {
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
}

/**
 * 起浏览器 → 导航并校验落地 → 把上下文交给 `fn` → **无论如何**收尾。
 *
 * ★ 收尾（关进程 + 删 profile）**两处都做**：`finally` 里一次，硬超时处理器里再一次。
 *   只在 finally 做的话，硬超时那条路会绕过它（超时处理器是 process.exit）。
 *
 * ★ 硬超时到点会 **process.exit(3)** —— 这是刻意的：它是"不依赖调用方自觉"的那道保险，
 *   做成可捕获的异常就等于把责任推回给调用方，而那正是它要防的事。
 *
 * @param {Object} o
 * @param {string} o.url          要打开的地址（导航后会校验落地地址与它一致）
 * @param {Function} fn           `async (ctx) => any`，ctx = { cdp, sleep, waitUntil, evaluate }
 * @returns {Promise<any>}        fn 的返回值
 */
export async function withBrowser(o, fn) {
  const {
    url, width = 1440, height = 900, timeoutMs = 60000,
    port = 9222, waitFor = '', settleMs = 3500, pollMs = 250,
  } = o
  const browser = findBrowser()
  if (!browser) {
    const e = new Error('未找到 Edge/Chrome。候选路径：\n  ' + EDGE_CANDIDATES.join('\n  '))
    e.code = 'NO_BROWSER'
    throw e
  }
  try { rmSync(PROFILE, { recursive: true, force: true }) } catch (e) { /* 残留无妨 */ }

  // ★ 端口不能写死：9222 可能被**更早的实例**占着，连接会打到它身上，
  //   于是"打开我的应用"实际打开的是另一个页面，而且全程不报错。
  const dbg = await freePort(port)
  const proc = spawn(browser, [
    '--headless=new',
    `--remote-debugging-port=${dbg}`,
    `--user-data-dir=${PROFILE}`,
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--window-size=${width},${height}`,
    url,
  ], { stdio: 'ignore', detached: false })

  let closed = false
  const shutdown = () => {
    if (closed) return
    closed = true
    try { proc.kill() } catch (e) { /* 忽略 */ }
    try { rmSync(PROFILE, { recursive: true, force: true }) } catch (e) { /* 忽略 */ }
  }
  const killer = setTimeout(() => {
    console.error(`硬超时 ${timeoutMs}ms：无条件关闭浏览器`)
    shutdown()
    process.exit(3)
  }, timeoutMs)

  let cdp = null
  try {
    const page = await waitForCDP(dbg)
    cdp = connect(page.webSocketDebuggerUrl)
    await cdp.ready
    await cdp.send('Runtime.enable')
    await cdp.send('Log.enable')
    await cdp.send('Page.enable')

    await cdp.send('Page.navigate', { url })
    // ★ 即使端口是空闲的，落地校验仍必要：万一连上的不是自己启动的浏览器，
    //   导航会把页面变成要的那个；而 href 校验会在"导不过去"时**明确报错**，
    //   而不是悄悄操作了别人的页面。
    {
      const t0 = Date.now()
      let landed = false
      while (Date.now() - t0 < 15000) {
        const r = await cdp.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true })
        if (String(r.result?.value || '').startsWith(url)) { landed = true; break }
        await sleep(pollMs)
      }
      if (!landed) throw new Error(`导航未落地：期望 ${url}（实际停留在他处，拒绝继续）`)
    }

    const waitUntil = async (expr, t = 15000) => {
      const t0 = Date.now()
      while (Date.now() - t0 < t) {
        const r = await cdp.send('Runtime.evaluate', { expression: '!!(' + expr + ')', returnByValue: true })
        if (r.result && r.result.value) return true
        await sleep(pollMs)
      }
      return false
    }
    const evaluate = (expr) => cdp.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    })

    if (waitFor) {
      const okd = await waitUntil(waitFor, Math.max(settleMs, 45000))
      if (!okd) console.error(`警告：等待 ${waitFor} 超时，仍继续（结果可能是加载中的中间态）`)
      else console.error(`就绪：${waitFor}`)
    } else {
      await sleep(settleMs)
    }

    return await fn({ cdp, sleep, waitUntil, evaluate, port: dbg })
  } finally {
    clearTimeout(killer)
    try { cdp && cdp.close() } catch (e) { /* 忽略 */ }
    shutdown()
    await sleep(300)
  }
}
