#!/usr/bin/env node
/**
 * screenshot.mjs — 在**真实浏览器**里截屏、取控制台报错、执行表达式
 *
 * 用途：验证"构建通过"之外的实机表现。WebGL 渲染、CSS 布局、面板交互这些
 * 构建测不到的东西，只能这样看。
 *
 * 用法（默认假设 dev server 已在 3001 端口）：
 *   node tools/screenshot.mjs                          # 截屏到 tmp/shot.png
 *   node tools/screenshot.mjs --out a.png --width 1440 --height 900
 *   node tools/screenshot.mjs --console                # 取控制台 error/warning
 *   node tools/screenshot.mjs --eval "document.title"
 *   node tools/screenshot.mjs --wait-for "window.__chemAgent" \
 *        --before "(async () => { …先改状态… })()" --out tmp/x.png
 *
 * ★ 浏览器控制（空闲端口 / 导航落地校验 / 硬超时 / profile 收尾 / rAF 节流）
 *   已抽到 `tools/lib/browser.mjs`。抽它的理由**不是省行数**，而是那几道保险
 *   正是手抄时会悄悄丢掉的东西 —— 复制出的第二份迟早只剩一份有保险。
 *
 * ⚠️ **三种模式是互斥分支，混用会被静默忽略**：内部是
 *   `if (--console) … else if (--eval) … else { …--before…截图… }`。
 *   所以 **`--before` 只在截图分支生效** —— 与 `--eval` 同用时它**不执行**，
 *   拿到的是"没改过状态"的结果，看起来就像"那个功能不存在"。
 *   需要"先改状态再取数"时，把改动**内联进 `--eval` 的表达式**（async IIFE 即可）。
 *
 * ⚠️ **`--before` 要写成"会被调用的表达式"，不是函数本身**：
 *   写 `--before "async () => {...}"` 时，CDP 求值得到的**是一个函数对象**，
 *   它从不执行 —— 于是两次截图逐字节相同，而工具**不报错**。
 *   正确写法是 `--before "(async () => {...})()"`（末尾两个括号）。
 *   本工具会在检测到求值结果是函数时**显式警告**（这条是实测踩出来的）。
 */
import { mkdirSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import {
  withBrowser, sleep, throttleRaf, pageErrors, findBrowser, BROWSER_CANDIDATES,
} from './lib/browser.mjs'

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
const WIDTH = +flag('width', 1440)
const HEIGHT = +flag('height', 900)
/**
 * 轮询等待条件成立（如 --wait-for "window.__chemAgent"）。
 * ★ 比固定 sleep 可靠得多：软件渲染下"着色器编译 + 场景构建"的耗时波动很大，
 *   实测 4 秒能就绪、6 秒反而没就绪——固定 sleep 会把这种波动变成假故障。
 */
const WAIT_FOR = flag('wait-for', '')
const WAIT = +flag('wait', 3500)
const BEFORE = flag('before', '')
const HARD_TIMEOUT = +flag('timeout', 60000)

if (!findBrowser()) {
  console.error('未找到 Edge/Chrome。可用的候选路径：\n  ' + BROWSER_CANDIDATES.join('\n  '))
  process.exit(1)
}

let code = 0

try {
  await withBrowser(
    { url: URL_, width: WIDTH, height: HEIGHT, timeoutMs: HARD_TIMEOUT, waitFor: WAIT_FOR, settleMs: WAIT },
    async ({ cdp, evaluate }) => {
      // ★ 放在 finally 里，**三种模式都覆盖**：否则 eval 失败时只看到"未定义"，
      //   而真正的原因（模块加载失败、Vite 重载等）留在事件流里没人看。
      //   而且事件流只在会话内有效 —— 等 withBrowser 收尾之后就取不到了。
      try {
        if (has('console')) {
        await cdp.send('Page.reload', { ignoreCache: true })
        await sleep(WAIT + 1500)
        const all = cdp.events
          .filter((e) => e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params.entry.level))
          .map((e) => `${e.params.entry.level}: ${e.params.entry.text}`)
          .concat(cdp.events
            .filter((e) => e.method === 'Runtime.exceptionThrown')
            .map((e) => 'exception: ' + (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text)))
        console.log(all.length ? all.join('\n') : '（无 error / warning）')
        code = all.length ? 2 : 0
        return
      }

      if (has('eval')) {
        const r = await evaluate(flag('eval'))
        if (r.exceptionDetails) {
          console.error('求值异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
          code = 1
        } else {
          console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value, null, 1))
        }
        return
      }

      // ---- 截图分支（★ --before 只在这里生效）----
      if (BEFORE) {
        const r0 = await evaluate(BEFORE)
        // ★ 求值结果是个**函数**说明调用方写的是 `async () => {…}` 而不是 `(async () => {…})()`：
        //   那个函数从不执行，于是"先改状态再截图"变成了"直接截图"，两张图逐字节相同，
        //   而工具不报错。实测踩过一次，差点据此判定"改动没生效"。这里显式喊出来。
        if (r0.result && r0.result.type === 'function') {
          console.error('⚠ --before 求值得到一个**函数**，它不会被调用 —— 请写成 `(async () => {…})()`（末尾两个括号）')
          code = 1
        }
        if (r0.exceptionDetails) {
          console.error('--before 执行异常: ' + String(r0.exceptionDetails.exception?.description || '').slice(0, 160))
        }
        await sleep(1200)   // 等切换后的场景重建与渲染落地
      }
      await throttleRaf(cdp)
      await sleep(800)      // 至少等到一帧节流后的渲染落地
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
      mkdirSync(dirname(OUT), { recursive: true })
      writeFileSync(OUT, Buffer.from(data, 'base64'))
      console.log('已写 ' + OUT)
      } finally {
        const errs = pageErrors(cdp)
        if (errs.length) {
          console.error('--- 页面错误 ---')
          for (const x of errs) console.error('  ' + x)
        }
      }
    })
} catch (e) {
  console.error(String(e.message || e))
  code = 1
}

process.exit(code)
