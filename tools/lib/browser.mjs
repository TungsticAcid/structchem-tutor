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
import { spawn, spawnSync } from 'child_process'
import { existsSync, readdirSync, rmSync, statSync } from 'fs'
import { createServer } from 'net'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

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

/**
 * 浏览器 profile 目录。
 *
 * ★ **每个进程一个**（带上 pid）——固定路径会让**两个会话同时跑浏览器工具时互相挤**：
 *   实测过两次 `CDP 超时：… 上的浏览器没起来`，退出码 1、看着像代码坏了，
 *   而真实原因是另一路并发验证正占着同一个 profile 目录。
 *
 * ★★ 2026-10-31：旧注释里“finally 与硬超时里各删一次所以不会留垃圾”**不成立**：
 *   `proc.kill()` 只杀主进程，Edge 的 renderer/gpu/crashpad 子进程还持有 profile 文件，
 *   紧接着 rmSync 必然 EBUSY/EPERM，而旧代码把异常吞掉了 ⇒ 每跑一次留一个目录。
 *   现在：关整个进程树 → 等主进程退出 → 5×200ms 退避删除；失败必须打日志。
 */
const PROFILE_PREFIX = 'chem-agent-edge-profile-'
const PROFILE = join(tmpdir(), `${PROFILE_PREFIX}${process.pid}`)
const STALE_PROFILE_MS = 24 * 60 * 60 * 1000

/**
 * 删除 profile 目录（退避重试）。
 * Windows 上 Edge 子进程释放文件有延迟，单次 rmSync 常 EBUSY/EPERM，不能静默吞。
 *
 * @returns {Promise<boolean>} 最终是否删掉
 */
async function removeProfileDir(dir, label) {
  let lastErr = null
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 0 })
      return true
    } catch (e) {
      lastErr = e
      if (attempt < 5) await sleep(200)
    }
  }
  console.error(
    `[browser] 清理 profile 失败（${label}，已重试 5 次）：${dir}\n`
    + `          ${lastErr && (lastErr.code || '')} ${lastErr && lastErr.message ? lastErr.message : lastErr}`
  )
  return false
}

/**
 * 启动清扫：删掉 %TEMP% 下超过 24h 的 chem-agent-edge-profile-*。
 * 只清本工具自己的前缀，且只清“老目录”，避免误删并发运行中的 profile。
 */
async function cleanupStaleProfiles() {
  const root = tmpdir()
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch (e) {
    console.error(`[browser] 扫描 profile 目录失败：${root} — ${e.message}`)
    return
  }
  const cutoff = Date.now() - STALE_PROFILE_MS
  let removed = 0
  let failed = 0
  for (const ent of entries) {
    if (!ent.isDirectory() || !ent.name.startsWith(PROFILE_PREFIX)) continue
    const dir = join(root, ent.name)
    let mtimeMs
    try {
      mtimeMs = statSync(dir).mtimeMs
    } catch (e) {
      continue
    }
    if (mtimeMs >= cutoff) continue
    if (await removeProfileDir(dir, 'stale')) removed++
    else failed++
  }
  if (removed > 0 || failed > 0) {
    console.error(`[browser] 启动清扫旧 profile：删除 ${removed} 个${failed ? `，失败 ${failed} 个` : ''}`)
  }
}

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

/** 结束浏览器整个进程树（Windows 用 taskkill /T /F；其它平台退回 kill） */
function killBrowserTree(proc) {
  if (!proc || !proc.pid) return
  if (process.platform === 'win32') {
    const exe = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe')
    try {
      const r = spawnSync(existsSync(exe) ? exe : 'taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      if (r.error) {
        console.error(`[browser] taskkill 启动失败：${r.error.message}`)
      } else if (r.status !== 0 && proc.exitCode === null) {
        console.error(`[browser] taskkill /PID ${proc.pid} /T /F 返回 ${r.status}`)
      }
    } catch (e) {
      console.error(`[browser] taskkill 异常：${e.message}`)
    }
    // taskkill 失败时至少再杀主进程一次（不覆盖上面的日志）
    if (proc.exitCode === null) {
      try { proc.kill('SIGKILL') } catch (e) { /* 已退出 */ }
    }
  } else {
    try { proc.kill('SIGKILL') } catch (e) { /* 已退出 */ }
  }
}

/** 等子进程真正退出（有界）；返回是否在时限内退出 */
function waitForExit(proc, timeoutMs) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    let settled = false
    const done = (v) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(v)
    }
    const timer = setTimeout(() => done(false), timeoutMs)
    proc.once('exit', () => done(true))
    proc.once('error', () => done(false))
    // 检查与挂监听之间进程恰好退出时，exit 事件可能已经错过
    if (proc.exitCode !== null || proc.signalCode !== null) done(true)
  })
}

/**
 * 起浏览器 → 导航并校验落地 → 把上下文交给 `fn` → **无论如何**收尾。
 *
 * ★ 收尾（关进程 + 删 profile）**两处都做**：`finally` 里一次，硬超时处理器里再一次。
 *   只在 finally 做的话，硬超时那条路会绕过它（超时处理器是 process.exit）。
 *
 * ★ 硬超时到点会 **process.exit(3)** —— 这是刻意的：它是"不依赖调用方自觉"的那道保险，
 *   做成可捕获的异常就等于把责任推回给调用方，而那正是它要防的事。
 *   ★ 2026-10-31：退出前先 await 关进程树 + 删 profile；否则硬超时又会留下目录。
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
    /**
     * ★★ 2026-10-15：允许指定 profile 目录，并且**保留**它（不删）。
     *
     *   为什么需要：默认 profile 是"一次性"的（每次启动前删、关闭后删），
     *   于是**跨浏览器重启**的持久化（localStorage / IndexedDB）根本测不到 ——
     *   而"收藏的演示是否还在"恰恰是这类问题。
     *   用法：两次 withBrowser 传同一个目录，第二次读第一次写下的东西。
     *   ★ 传了它就不要并发跑（Chromium 不允许两个实例共用同一 user-data-dir）。
     */
    profileDir = null,
  } = o
  const PROFILE_ACTIVE = profileDir ? resolve(profileDir) : PROFILE
  const KEEP_PROFILE = !!profileDir
  const browser = findBrowser()
  if (!browser) {
    const e = new Error('未找到 Edge/Chrome。候选路径：\n  ' + EDGE_CANDIDATES.join('\n  '))
    e.code = 'NO_BROWSER'
    throw e
  }
  // ★ 2026-10-31：先清扫历史残留（>24h 的旧 profile），再清本进程的残留。
  //   旧代码只删当前 pid 的目录，历史目录永远不会被回收（实测 TEMP 里积压 418 个）。
  await cleanupStaleProfiles()
  // 一次性 profile 才需要先清掉残留；保留型（profileDir）绝不清 —— 它就是被测状态本身
  if (!KEEP_PROFILE) await removeProfileDir(PROFILE_ACTIVE, 'pre-run')

  // ★ 端口不能写死：9222 可能被**更早的实例**占着，连接会打到它身上，
  //   于是"打开我的应用"实际打开的是另一个页面，而且全程不报错。
  const dbg = await freePort(port)
  const proc = spawn(browser, [
    '--headless=new',
    `--remote-debugging-port=${dbg}`,
    `--user-data-dir=${PROFILE_ACTIVE}`,
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--window-size=${width},${height}`,
    url,
  ], { stdio: 'ignore', detached: false })

  let cdp = null
  let shutdownPromise = null
  /**
   * 关整个进程树 → 等主进程退出 → 带重试删除 profile。
   * 返回同一个 Promise，保证 finally 与硬超时并发调用时只执行一次。
   */
  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise
    shutdownPromise = (async () => {
      try { if (cdp) cdp.close() } catch (e) { /* 忽略 */ }
      cdp = null
      killBrowserTree(proc)
      const exited = await waitForExit(proc, 5000)
      if (!exited) console.error(`[browser] 进程 ${proc.pid} 在 5s 内未退出，仍尝试清理 profile`)
      // ★ 保留型 profile（profileDir）不删：它就是被测状态（收藏、会话、学情都在里面）
      if (!KEEP_PROFILE) await removeProfileDir(PROFILE_ACTIVE, 'post-run')
    })()
    return shutdownPromise
  }
  const killer = setTimeout(() => {
    console.error(`硬超时 ${timeoutMs}ms：无条件关闭浏览器`)
    shutdown().catch((e) => console.error(`[browser] 硬超时收尾失败：${e.message}`))
      .finally(() => process.exit(3))
  }, timeoutMs)

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
    // ★ 必须 await：关进程树/等退出/删 profile 都是异步收尾；不 await 就又会留下目录
    try {
      await shutdown()
    } catch (e) {
      console.error(`[browser] 收尾失败：${e.message}`)
    }
  }
}
