#!/usr/bin/env node
/**
 * check-i18n-live.mjs —— **运行时 DOM 扫描**：英文模式下逐路由找残留中文
 *
 * ---------------------------------------------------------------------------
 * 为什么非要有这一条（而不是只看覆盖率守卫）
 * ---------------------------------------------------------------------------
 * 覆盖率守卫是**读源码**的：它能说"这条中文登记过译文"，但它**证明不了**
 * "界面上真的变了"。本仓库已经有过一次反面教材 —— 守卫给一个已经做完的模块
 * 报了 263 条，因为它的判据错了。**一个判据错了的守卫，绿与红都没有意义。**
 *
 * 所以「用户可见」的最终判据只能是这一条：把界面切到英文，打开每条路由，
 * 断言**没有任何残留的中文文本节点 / title / placeholder**。
 *
 * ---------------------------------------------------------------------------
 * 用法
 * ---------------------------------------------------------------------------
 *   node tools/check-i18n-live.mjs --url http://localhost:3100/
 *   node tools/check-i18n-live.mjs --routes /,/crystal,/orbit,/symmetry --settle 6000
 *   node tools/check-i18n-live.mjs --allow-file tmp/i18n/live-allow.json
 *
 * 退出码：0 = 全部干净；1 = 有残留（逐条列出 `路由 · 位置 · 文字`）；2 = 工具自身出错。
 *
 * ⚠️ **端口 / 实例**：本工具连的是 `--url` 指定的地址，并在 withBrowser 里校验
 *    导航落地。但"先看 vite 日志确认端口"这条纪律仍在（vite 会自动换端口）。
 *
 * ★ 判定为"可接受残留"的只有**白名单**里的字符串，且白名单要写在**报告里**
 *   （不静默放过）。默认白名单只有语言名 `中文` —— 它在英文界面里本就该是中文
 *   （endonym 惯例：用户切换前得看得懂自己点的是哪个）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { withBrowser, sleep, findBrowser, BROWSER_CANDIDATES } from './lib/browser.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = (n, d) => {
  const i = argv.indexOf('--' + n)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}
const URL_ = flag('url', 'http://localhost:3100/')
const ROUTES = flag('routes', '/,/crystal,/orbit,/symmetry').split(',').map((s) => s.trim()).filter(Boolean)
const SETTLE = +flag('settle', 5000)
const TIMEOUT = +flag('timeout', 240000)
const OUT = flag('out', 'tmp/i18n/live-report.json')
const ALLOW_FILE = flag('allow-file', '')
const STORAGE_KEY = 'chem-agent.ui-lang'
/**
 * 语言往返回合的**探针**：一对中英对照串。
 * ★ 必须选一条**确定存在**的界面文案（首页设置区的"界面风格"标签）——
 *   探针一个都没出现的话，这一步就是"空转的绿"，工具会显式判失败。
 */
const PROBE = { en: 'Interface style', zh: '界面风格' }
const ROUNDTRIP = !argv.includes('--no-roundtrip')
/** 判据 #5 那一段（画布不重建 · 要等 orbit 的等值面出来，比较慢，默认关） */
const ORBIT_SWITCH = argv.includes('--orbit-switch')
const ORBIT_SETTLE = +flag('orbit-settle', 30000)
/** 设置弹层那一段（默认开；它的文案只在弹层打开后才进 DOM） */
const SETTINGS = !argv.includes('--no-settings')

/**
 * 默认白名单：**语言名本身**。
 * ★ 这不是"漏译豁免"，而是刻意的：英文界面里把「中文」翻成 "Chinese" 会让
 *   用户在切换前看不出自己要切到哪一门语言（各家产品的惯例也是保留本族语）。
 *   `简体中文` 是点群观鉴模块自带语言下拉里的那条（同一个道理）。
 */
const DEFAULT_ALLOW = ['中文', '简体中文', 'English']
const allow = ALLOW_FILE
  ? (() => {
    try { return JSON.parse(readFileSync(resolve(REPO, ALLOW_FILE), 'utf8')) } catch (e) {
      console.error(`读不了白名单 ${ALLOW_FILE}：${e.message}`); process.exit(2)
    }
  })()
  : DEFAULT_ALLOW

if (!findBrowser()) {
  console.error('未找到 Edge/Chrome。候选：\n  ' + BROWSER_CANDIDATES.join('\n  '))
  process.exit(2)
}

/** 在页面里跑的扫描脚本：文本节点 + 用户可见属性；返回逐条明细 */
const SCAN = `(function () {
  const CJK = /[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff]/;
  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  let n;
  while ((n = w.nextNode())) {
    const t = (n.nodeValue || '').trim();
    if (!t || !CJK.test(t)) continue;
    const p = n.parentNode;
    if (p && SKIP[p.nodeName]) continue;
    out.push({ kind: 'text', tag: p ? p.nodeName : '?', text: t.slice(0, 160) });
  }
  for (const el of document.body.querySelectorAll('*')) {
    for (const a of ['title', 'placeholder', 'aria-label', 'alt']) {
      const v = el.getAttribute(a);
      if (v && CJK.test(v)) out.push({ kind: a, tag: el.nodeName, text: String(v).slice(0, 160) });
    }
  }
  return out;
})()`

/** 控制台里本轮的 error / warning（页面的，不是工具的） */
const CONSOLE = `(function () {
  return (window.__i18nLiveConsole || []).slice(-40);
})()`

let code = 0
const report = { url: URL_, lang: 'en', allow, routes: [] }

try {
  await withBrowser(
    { url: URL_, width: 1440, height: 900, timeoutMs: TIMEOUT, waitFor: 'window.__chemAgent', settleMs: 4000 },
    async ({ cdp, evaluate, waitUntil }) => {
      // 挂一个控制台收集器（**必须在切语言/换路由之前**装好，否则收不到首批报错）
      await evaluate(`(function () {
        if (window.__i18nLiveConsole) return 1;
        window.__i18nLiveConsole = [];
        const push = (lv) => (m) => { try { window.__i18nLiveConsole.push(lv + ': ' + (m.text || m.message || '')) } catch (e) {} };
        const oe = console.error, ow = console.warn;
        console.error = function () { push('error')({ text: Array.from(arguments).map(String).join(' ') }); oe.apply(console, arguments); };
        console.warn = function () { push('warning')({ text: Array.from(arguments).map(String).join(' ') }); ow.apply(console, arguments); };
        return 1;
      })()`)

      // 切到英文：**写存储 + reload**，让应用在初始化时就以 en 起来
      //   （只在运行时 setLang 不 reload，会漏掉"初始化阶段就渲染好的那部分"）
      await evaluate(`(function(){ localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, 'en'); return 1 })()`)
      await cdp.send('Page.reload', { ignoreCache: true })
      await waitUntil('window.__chemAgent', 45000)
      await sleep(1500)
      const lang = await evaluate('document.documentElement.lang')
      report.documentLang = lang.result.value
      if (lang.result.value !== 'en') {
        console.error(`⚠ <html lang> 是 ${lang.result.value}，不是 en —— 语言偏好没生效（后面的结论不可信）`)
        code = 1
      }

      for (const route of ROUTES) {
        await evaluate(`(function(){ location.hash = ${JSON.stringify('#' + route)}; return location.hash })()`)
        await sleep(SETTLE)
        const r = await evaluate(SCAN)
        const found = (r.result && r.result.value) || []
        const bad = found.filter((x) => !allow.includes(x.text))
        const allowed = found.filter((x) => allow.includes(x.text))
        const c = await evaluate(CONSOLE)
        const consoleErrs = ((c.result && c.result.value) || [])
          .filter((s) => /^error/.test(s))
        const consoleWarns = ((c.result && c.result.value) || [])
          .filter((s) => /^warning/.test(s))
        report.routes.push({ route, residual: bad.length, allowed: allowed.length, items: bad, consoleErrors: consoleErrs, consoleWarnings: consoleWarns })
        const mark = bad.length === 0 ? '✓' : '✗'
        console.log(`${mark} ${route.padEnd(12)} 残留中文 ${String(bad.length).padStart(3)} 条 · 白名单 ${allowed.length} 条 · 控制台 error ${consoleErrs.length} · warning ${consoleWarns.length}`)
        for (const b of bad.slice(0, 20)) console.log(`      [${b.kind}] <${b.tag}> ${b.text.replace(/\s+/g, ' ')}`)
        if (bad.length > 20) console.log(`      … 另有 ${bad.length - 20} 条`)
        for (const e of consoleErrs.slice(0, 5)) console.log(`      [console.error] ${e.slice(0, 200)}`)
        if (bad.length || consoleErrs.length) code = 1
      }

      // ---------------------------------------------------------------------
      // 设置弹层（`ui-kit` 区）：它的文案只在弹层**打开后**才进 DOM，
      //   而逐路由扫描永远看不到它 —— 那是"守卫绿、实机漏"最容易发生的地方。
      // ---------------------------------------------------------------------
      if (SETTINGS) {
        await evaluate(`(function(){ location.hash = '#/'; return 1 })()`)
        await sleep(1500)
        const opened = await evaluate(`(function(){
          const b = document.querySelector('[data-act="open-settings"]')
            || Array.from(document.querySelectorAll('button')).find((x) => /设置|Settings/.test(x.textContent || ''));
          if (!b) return 'no-button';
          b.click();
          return 'clicked';
        })()`)
        await sleep(1500)
        const r = await evaluate(SCAN)
        const found = (r.result && r.result.value) || []
        const bad = found.filter((x) => !allow.includes(x.text))
        report.settings = { open: opened.result.value, residual: bad.length, items: bad }
        console.log(`${bad.length === 0 ? '✓' : '✗'} 设置弹层（${opened.result.value}）  残留中文 ${bad.length} 条`)
        for (const b of bad.slice(0, 20)) console.log(`      [${b.kind}] <${b.tag}> ${b.text.replace(/\s+/g, ' ')}`)
        if (opened.result.value === 'no-button') {
          console.error('⚠ 没找到打开设置的按钮 —— 这一步没测到东西，判为失败')
          code = 1
        }
        if (bad.length) code = 1
        // 关掉，别影响后面的判据 #5
        await evaluate(`(function(){ const b = document.querySelector('.agent-sclose, [data-act="close-settings"]'); if (b) b.click(); return 1 })()`)
        await sleep(600)
      }
      // ---------------------------------------------------------------------
      // 语言**往返回合**：en → zh → en
      //
      // ★ 为什么单列这一步：`tsrc` 只认"中文原文 → 译文"，是**单向**的。
      //   少了运行时的 `restore`，切回中文时界面会**卡在英文**上 —— 不报错、不崩，
      //   而"只测英文模式有没有残留中文"这条判据**完全看不见它**。
      //   所以这里必须真的切回去、并且切回来还得到英文。
      // ---------------------------------------------------------------------
      if (ROUNDTRIP) {
        await evaluate(`(function(){ location.hash = '#/'; return 1 })()`)
        await sleep(1500)
        const probe = async () => {
          const r = await evaluate(`(function(){
            const s = document.body.innerText || '';
            return {
              en: s.indexOf(${JSON.stringify(PROBE.en)}) >= 0,
              zh: s.indexOf(${JSON.stringify(PROBE.zh)}) >= 0,
              hash: location.hash,
              appLen: (document.querySelector('#app') || {}).innerHTML ? document.querySelector('#app').innerHTML.length : 0,
              head: s.replace(/\\s+/g, ' ').slice(0, 120)
            };
          })()`)
          return (r.result && r.result.value) || { en: false, zh: false }
        }
        const setLang = (v) => evaluate(`(function(){
          if (!window.__chemAgent || !window.__chemAgent.i18n) return 'no-i18n-handle';
          window.__chemAgent.i18n.setLang(${JSON.stringify(v)}, { force: true });
          return window.__chemAgent.i18n.lang;
        })()`)

        const a = await probe()
        // ★ 2000ms 而不是 1200ms：切语言会**重挂当前路由**（`onLangChange`）再由
        //   自动扫描补翻一遍，一次重挂 + 一帧 rAF 在这台无头软件渲染的机器上
        //   偶尔会超过 1.2s —— 实测因此得到过一次**假失败**（第三个探针两个都没命中）。
        await setLang('zh'); await sleep(2000)
        const b = await probe()
        await setLang('en'); await sleep(2000)
        const c = await probe()

        const okEn1 = a.en && !a.zh
        const okZh = b.zh && !b.en
        const okEn2 = c.en && !c.zh
        report.roundtrip = { probe: PROBE, afterEnLoad: a, afterSwitchZh: b, backToEn: c, ok: okEn1 && okZh && okEn2 }
        console.log(`${okEn1 && okZh && okEn2 ? '✓' : '✗'} 语言往返回合  en=${JSON.stringify(a)} → zh=${JSON.stringify(b)} → en=${JSON.stringify(c)}`)
        console.log(`     探针：英文界面应含「${PROBE.en}」不含「${PROBE.zh}」；切 zh 后反过来；再切回 en 复原`)
        // ★ 探测串必须真的存在，否则这一步是**空转的绿**（探针都没出现过，就无从判断）
        if (!a.en && !a.zh) {
          console.error('⚠ 探针串在英文界面里一个都没出现 —— 这一步没有测到任何东西，判为失败')
          code = 1
        }
        if (!(okEn1 && okZh && okEn2)) code = 1
      }

      // ---------------------------------------------------------------------
      // 完成判据 #5：换语言**画布与图表跟着变**，但**不重建等值面**
      //
      // ★ 这条判据换过两次仪器，两次都是"工具给的是通过、其实什么也没量"：
      //   ① 最初用 `canvas.toDataURL()` 取三维画布的指纹 —— WebGL 画布在
      //      `preserveDrawingBuffer:false`（three.js 默认）下，**在 rAF 回调之外读回来是空的**，
      //      同一个 20 KB 空白 PNG 永远相等 ⇒ "不重建"是**恒真**的。
      //   ② 改成比对整页截图 —— 页面上别处一直有动画（面板悬浮球、1 Hz 兜底重绘），
      //      于是"变了"也恒真。
      //   现在：**只截三维画布那一块**（CDP 的 clip），并先**等它静止**再取前后两张。
      //   等不到静止就**如实判失败**（不静默通过）——"量不到"与"没重建"是两回事。
      // ---------------------------------------------------------------------
      if (ORBIT_SWITCH) {
        await evaluate(`(function(){ location.hash = '#/orbit'; return 1 })()`)
        await sleep(ORBIT_SETTLE)
        // 关掉自动旋转：开着的话画面一直在转，任何前后对比都不可判定
        await evaluate(`(function(){
          var cb = document.querySelector('#autoRotate');
          if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change')); }
          return 1;
        })()`)
        const clipR = await evaluate(`(function(){
          var c = document.querySelector('#viewer canvas');
          if (!c) return null;
          var r = c.getBoundingClientRect();
          return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
        })()`)
        const clip = clipR.result.value
        const cap = async () => {
          const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } })
          return createHash('sha1').update(data).digest('hex').slice(0, 12)
        }
        /** 等三维画布静止：连续 3 次截图完全相同 */
        const waitStill = async (limitSec) => {
          let prev = null; let same = 0; let last = null
          for (let i = 0; i < limitSec; i++) {
            const cur = await cap()
            last = cur
            if (cur === prev) { same++; if (same >= 2) return { ok: true, hash: cur } } else { same = 0 }
            prev = cur
            await sleep(1000)
          }
          return { ok: false, hash: last }
        }
        /** 采样一串哈希，取**众数**当"稳定画面"。
         *  ★ 为什么不是"等连续 N 张全同"：实测自动旋转关掉后画布要**先过 5 帧左右**
         *    （相机阻尼 + 流水线余波）才稳定，偶发还有 1 Hz 兜底重绘。
         *    要求"全同"会把这两种正常现象判成"一直没静止"（实测就这么假失败过一次）。
         *    取众数则只要求"多数帧是同一张画面"，同时对"真的每帧都在变"（=重建中）仍然报警。 */
        const sampleMode = async (n) => {
          const list = []
          for (let i = 0; i < n; i++) { list.push(await cap()); await sleep(1000) }
          const counts = {}
          for (const h of list) counts[h] = (counts[h] || 0) + 1
          const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
          return { mode: sorted[0][0], hits: sorted[0][1], total: n, distinct: sorted.length, list }
        }
        if (!clip) {
          console.error('⚠ /orbit 上没有找到三维画布（#viewer canvas）—— 这一步没测到东西，判为失败')
          code = 1
        } else {
          // ★ **仪器自检**：先确认"这块区域真的会变"。空白画布的截图恒定不变，
          //   而"恒定不变"恰好也是"没重建"的判据 —— 不先证明仪器看得见东西，
          //   这条判据就是恒真的（本判据换仪器就是因为前两版都恒真）。
          await evaluate(`(function(){ var cb=document.querySelector('#autoRotate'); if(cb){cb.checked=true;cb.dispatchEvent(new Event('change'))} return 1 })()`)
          await sleep(2500)
          const m1 = await cap()
          await sleep(2000)
          const m2 = await cap()
          await evaluate(`(function(){ var cb=document.querySelector('#autoRotate'); if(cb){cb.checked=false;cb.dispatchEvent(new Event('change'))} return 1 })()`)
          const instrumentOk = m1 !== m2
          report.orbitSwitchInstrument = { m1, m2, ok: instrumentOk }
          console.log(`${instrumentOk ? '✓' : '✗'} 仪器自检：打开自动旋转后该区域画面会变（${m1} → ${m2}）`)
          if (!instrumentOk) {
            console.error('⚠ 仪器自检失败：自动旋转打开后画面也没变 —— 像素判据在这里看不见东西，结论不可信')
            code = 1
            report.orbitSwitch = { clip, settled: false, reason: 'instrument-blind' }
          } else {
            await sleep(3000)
            const b = await sampleMode(10)
            const t0 = Date.now()
            await evaluate(`(function(){ window.__chemAgent.i18n.setLang('en', { force: true }); return 1 })()`)
            const switchMs = Date.now() - t0
            await sleep(1500)
            const a = await sampleMode(10)
            const stableEnough = b.hits >= 6 && a.hits >= 6
            const same = stableEnough && b.mode === a.mode
            report.orbitSwitch = { clip, before: b.mode, after: a.mode, switchMs, stableEnough, same, beforeDistinct: b.distinct, afterDistinct: a.distinct }
            if (!stableEnough) {
              console.error(`⚠ 画布在 10 次采样里没有形成稳定画面（前 ${b.hits}/10、后 ${a.hits}/10 是众数）`
                + ' —— 无法判定"换语言有没有重建几何"，判为失败（不静默通过）')
              code = 1
            } else {
              console.log(`${same && switchMs < 3000 ? '✓' : '✗'} 换语言不重建三维画布（切语言耗时 ${switchMs}ms）  ${b.mode} → ${a.mode}`
                + `（众数命中 ${b.hits}/10 → ${a.hits}/10）`)
              if (!same) {
                console.error('⚠ 三维画布在换语言前后不是同一画面 —— 几何/取景被重建（等值面流水线要十几秒，不该被语言切换触发）')
                code = 1
              }
              if (switchMs >= 3000) {
                console.error(`⚠ 切语言耗时 ${switchMs}ms —— 疑似触发了重算（等值面重建是十秒级的）`)
                code = 1
              }
            }
          }
        }
      }

      writeFileSync(resolve(REPO, OUT), JSON.stringify(report, null, 2), 'utf8')
      console.log(`\n报告已写 ${OUT}`)
    })
} catch (e) {
  console.error('check-i18n-live 自身出错：' + (e && e.message || e))
  code = 2
}

mkdirSync(dirname(resolve(REPO, OUT)), { recursive: true })
process.exit(code)
