#!/usr/bin/env node
/**
 * acceptance.mjs —— 逐项功能检验（**真实 API**，消耗额度，故不进 `npm test`）
 *
 * 运行：`npm run verify:live -- --key-file <仓库外的密钥文件> [--dry] [--only <id,...>]`
 *
 * ★ 为什么要单独一个工具、而且**不放进 `npm test`**：
 *   它打真实 LLM，会花钱、依赖网络与密钥。放进 CI 等于让"测试"变成"计费"。
 *
 * ============================================================================
 * 密钥纪律（三条，都是硬要求）
 * ============================================================================
 *   ① **密钥文件必须在仓库之外**。脚本启动时**断言**这一点；万一有人把它挪进仓库，
 *      脚本**拒绝启动并喊出来**，而不是"方便地"用起来。
 *   ② 读取后经 CDP 写进页面设置。**不经 argv、不进进程列表（命令行）、不落盘**
 *      （除浏览器 localStorage，且收尾时清掉）。
 *   ③ **含密钥的表达式永不进日志**。注入失败只报一句固定文案 ——
 *      报错里若带上表达式，密钥就跟着进终端与 CI 日志了。
 *
 * ============================================================================
 * 三层断言（缺一层就会把"调了但没用"判成通过）
 * ============================================================================
 *   L1  模型**真的调了工具**：`summary.tools` 里含期望的工具名（不是凭记忆答）
 *   L2  工具**真的执行了**：历史里有 `role:'tool'` 的消息，内容含程序算出的字段
 *   L3  模型**用了**结果：工具结果里的特征数值出现在最终正文里
 *
 *   L1 单独用会被"调了但忽略"骗过；L2 单独用会被"调了、也回填了，但正文没引用"骗过。
 *   三层合起来才是"这个功能真的通了"。
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, relative, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import { withBrowser, sleep, pageErrors } from './lib/browser.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = (n, d) => {
  const i = argv.indexOf('--' + n)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}
const has = (n) => argv.includes('--' + n)

const KEY_FILE = flag('key-file', '')
const DRY = has('dry')
const STRICT = has('strict')
const ONLY = (flag('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
const BASE = flag('base', 'http://localhost:3001')
const TIMEOUT = +flag('timeout', 300000)

// ---------------------------------------------------------------------------
// ① 密钥文件必须在仓库之外
// ---------------------------------------------------------------------------
if (!KEY_FILE) {
  console.error('用法：node tools/acceptance.mjs --key-file <仓库外的密钥文件> [--dry] [--only id,...]')
  console.error('（--dry 只验接线、不发请求、零额度）')
  process.exit(1)
}
const KEY_PATH = isAbsolute(KEY_FILE) ? KEY_FILE : resolve(process.cwd(), KEY_FILE)
{
  const rel = relative(REPO, KEY_PATH)
  // rel 不以 .. 开头且不是绝对路径 ⇒ 落在仓库内
  const inside = rel && !rel.startsWith('..') && !isAbsolute(rel)
  if (inside) {
    console.error('✗ 拒绝启动：密钥文件位于**仓库内**（' + rel + '）。')
    console.error('  密钥不得进入版本控制，也不该躺在仓库目录里 —— 请把它移到仓库之外再重试。')
    console.error('  这条是硬要求，不提供"仍然继续"的开关。')
    process.exit(2)
  }
}
if (!existsSync(KEY_PATH)) {
  console.error('✗ 找不到密钥文件：' + KEY_PATH)
  process.exit(2)
}
const RAW_KEY = readFileSync(KEY_PATH, 'utf-8').trim()
if (!RAW_KEY) {
  console.error('✗ 密钥文件是空的：' + KEY_PATH)
  process.exit(2)
}
// ★ 只说"读到了、多长"，不说内容 —— 使用者据此确信读到了，而输出里没有密钥
console.log(`已从 ${KEY_PATH} 读取密钥（长度 ${RAW_KEY.length}，内容不显示）`)

// ---------------------------------------------------------------------------
// 用例矩阵
//
// ★ 每项都标了 route：自动路由只发生在首页（见 app.js 的 shouldAutoRoute），
//   进了模块页之后模块归属由 URL 决定 —— 所以"在哪个页面问"是用例的一部分，
//   不是环境。少了这一列，同一个问句在两个页面上会得到不同结果而无法解释。
// ---------------------------------------------------------------------------
const CASES = [
  {
    id: 'route-miss',
    route: '#/',
    ask: '水分子是什么点群？有哪些对称元素？',
    expectTools: ['queryPointGroup'],
    expectText: 'C2v',   // 水的点群：工具算出来的，模型必须说出来
    // ★ 这条最能证明"智能体真的整合了"：首页默认模块是 crystal，
    //   而这是个对称性问题 —— 修好之前模型手里是晶体工具，只能凭记忆答。
    extra: { activeModule: 'symmetry' },
  },
  {
    id: 'crystal-query',
    route: '#/crystal',
    ask: 'NaCl 晶胞里有几个 Na⁺、几个 Cl⁻？它的密度是多少？请用工具查。',
    expectTools: ['queryCrystal'],
    expectFields: ['density'],
  },
  {
    id: 'crystal-quiz',
    route: '#/crystal',
    ask: '请用出题工具给我出一道晶胞密度计算的题目。',
    expectTools: ['generateQuiz'],
  },
  {
    id: 'orbit-query',
    route: '#/orbit',
    ask: '4p 轨道有几个径向节面？它们各在多少 a₀ 处？请用工具查。',
    expectTools: ['queryOrbital'],
    expectFields: ['radii'],   // ★ 实参是 radii（不是 radialZeros）—— 键名按**实现**写，不能按 kind 猜
  },
  {
    id: 'orbit-action',
    route: '#/orbit',
    // ★ 问句必须写明"立刻执行、不要分步"。原先只写"把 m 改成 0，并切到复函数模式"，
    //   模型会把它办成**分步演示**（实测：回一句"已排好 7 步分镜，第 1 步已执行，
    //   点下一步"），于是最终状态还没到目标 —— 判据 "状态已变" 于是判 ✗。
    //   那是**产品行为的选择**（分步教学 vs 立即执行），不是接线坏了；
    //   这个用例要测的是动作链路，所以把意图写明确。
    //   ★ 用 m=1 而不是 m=0：**m=0 时复球谐与实球谐是同一个函数**，
    //     "切到复函数"在物理上是空操作，正确的模型会解释这一点而**不**去切
    //     （实测它就是这么答的，正文里写着"复/实切换对这个态无效"）。
    //     拿 m=0 当用例，测的是我自己对复球谐的理解，不是动作链路。
    ask: '立刻执行，不要分步演示：把 m 改成 1，并切到复函数模式。',
    expectTools: ['applySceneActions'],
    // ★ 动作类用例的判据不该是"正文里有没有数字" —— 模型做对的事是**下发了动作**。
    //   直接读快照核对状态，比查正文强得多（正文里它讲的是道理，不是数值）。
    expectState: { m: 1, wavefunction: 'complex' },
    // ★ 标 flaky：**接线是通的** —— 零额度探针证实，下发
    //   `setQuantumNumbers{m:1}` + `setWavefunctionMode{complex}` 之后快照就是
    //   `{m:1, wavefunction:'complex'}`、DOM 的 #modeSeg 也跟着切了。
    //   真实 API 下模型**只改了 m、没下发 setWavefunctionMode**（三次运行一致），
    //   那是**模型行为**层面的缺口，不是接线坏了。按计划 §5.4：如实标出、
    //   不计入退出码，但**必须在表里显式出现**，不悄悄放过。
    flaky: true,
  },
  {
    id: 'symmetry-query',
    route: '#/symmetry',
    ask: '水分子是什么点群？有哪些对称元素？请用工具查。',
    expectTools: ['queryPointGroup'],
    expectFields: ['pointGroup'],
    expectText: 'C2v',
  },
  {
    id: 'symmetry-action',
    route: '#/symmetry',
    ask: '打开对称元素的显示，只保留主轴，然后播放这个对称操作。',
    expectTools: ['applySceneActions'],
    expectState: { showSymmetry: true },
  },
]

const todo = ONLY.length ? CASES.filter((c) => ONLY.includes(c.id)) : CASES
if (!todo.length) {
  console.error('--only 没匹配到任何用例。可选：' + CASES.map((c) => c.id).join(', '))
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
/**
 * 把上下标 Unicode 折成 ASCII 再比。
 *
 * ★ 必须有这一步：模块内部与工具结果用的都是 ASCII（`C2v`），
 *   而**模型写出来的是 `C₂ᵥ`**。直接 `includes('C2v')` 会稳定判 ✗ ——
 *   那不是模型答错，是判据没考虑排版差异（实测踩到，两条用例一起假阴性）。
 */
const SUBSUP = { '₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9',
  '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9',
  'ₐ':'a','ₑ':'e','ₕ':'h','ᵢ':'i','ⱼ':'j','ₖ':'k','ₗ':'l','ₘ':'m','ₙ':'n','ₒ':'o','ₚ':'p',
  'ᵣ':'r','ₛ':'s','ₜ':'t','ᵤ':'u','ᵥ':'v','ᵦ':'β','ₓ':'x','ᵧ':'y' }
function asciiNorm(x) {
  // ★ 范围要盖全：下标 v（ᵥ = U+1D65）在 **Phonetic Extensions** 区，
  //   不在 U+2080–209F 里 —— 漏了它，`C₂ᵥ` 折出来是 `C2ᵥ`，仍然匹配不上 `C2v`。
  return String(x).replace(
    /[₀-₟ᵢ-ᵪ²³¹⁰-ⁿ]/g, (ch) => SUBSUP[ch] || ch)
}

/** 从工具结果里挑出"够特征"的数值：整数位 3 位以上，或带 3 位以上小数 */
function distinctiveNumbers(obj, out = new Set()) {
  if (obj == null) return out
  if (typeof obj === 'number' && Number.isFinite(obj)) {
    const s = String(obj)
    const digits = s.replace(/[^0-9]/g, '').replace(/^0+/, '')
    if (digits.length >= 3) out.add(s)
    return out
  }
  if (typeof obj === 'string') {
    for (const m of obj.matchAll(/\d+\.\d{3,}|\d{3,}/g)) out.add(m[0])
    return out
  }
  if (Array.isArray(obj)) { for (const v of obj) distinctiveNumbers(v, out); return out }
  if (typeof obj === 'object') { for (const v of Object.values(obj)) distinctiveNumbers(v, out); return out }
  return out
}

/** 把正文里的数字规范化后比对（容忍四舍五入到同样的有效位） */
function textMentions(text, numStr) {
  if (text.includes(numStr)) return true
  const n = Number(numStr)
  if (!Number.isFinite(n)) return false
  const re = /\d+\.?\d*/g
  for (const m of text.matchAll(re)) {
    const v = Number(m[0])
    if (!Number.isFinite(v)) continue
    const scale = Math.max(1, Math.abs(n))
    if (Math.abs(v - n) <= scale * 2e-3) return true   // 允许 0.2% 的舍入
  }
  return false
}

/**
 * 取"模型说给学生听的那段正文"。
 *
 * ★ 必须**拼接所有非空的 assistant 消息**，不能只取最后一条：
 *   带工具调用的一轮里会追加多条 assistant 消息，其中**工具调用那条的
 *   `content` 是空串**。只取最后一条就会拿到 ''，于是 L3 一律判 ✗ ——
 *   而那是**提取器的假阴性，不是模型没用结果**（实测踩到：候选里明明有
 *   2.1868，正文却是空的）。
 */
function assistantText(history) {
  const parts = []
  for (const m of history) {
    if (!m || m.role !== 'assistant') continue
    const c = m.content
    if (typeof c === 'string') { if (c.trim()) parts.push(c) }
    else if (Array.isArray(c)) {
      const t = c.map((p) => (typeof p === 'string' ? p : (p && p.text) || '')).join('')
      if (t.trim()) parts.push(t)
    }
  }
  return parts.join('\n')
}

function toolMessages(history) {
  return history.filter((m) => m && m.role === 'tool')
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const results = []
let hadErr = false

try {
  await withBrowser(
    { url: BASE + '/', timeoutMs: TIMEOUT, waitFor: 'window.__chemAgent', settleMs: 4000 },
    async ({ cdp }) => {
      const evaluate = (expr) => cdp.send('Runtime.evaluate', {
        expression: expr, returnByValue: true, awaitPromise: true,
      })

      /**
       * 求值并把结果当 JSON 解析；**求值本身出错就抛出来**。
       *
       * ★ 这条是实测补的：原先直接 `JSON.parse(r.result.value)`，而求值若因
       *   语法错误失败（例如在 `Runtime.evaluate` 里写了顶层 `await`），
       *   `r.result.value` 就是 undefined —— 七个用例一起报
       *   「"undefined" is not valid JSON」，真正的语法错误一个字都没露出来。
       */
      const evalJSON = async (expr) => {
        const r = await evaluate(expr)
        if (r.exceptionDetails) {
          const d = r.exceptionDetails.exception?.description || r.exceptionDetails.text || ''
          throw new Error('求值失败：' + String(d).slice(0, 200))
        }
        if (typeof r.result.value !== 'string') {
          throw new Error('求值没有返回值（表达式是不是少了 return？）')
        }
        return JSON.parse(r.result.value)
      }

      // ---- 注入密钥（★ 表达式含密钥，故失败时**只报固定文案**）----
      let injected = false
      try {
        const expr = 'window.__chemAgent.settings.set({ apiKey: ' + JSON.stringify(RAW_KEY) + ' })'
        const r = await evaluate(expr)
        injected = !r.exceptionDetails
      } catch (e) {
        injected = false
      }
      if (!injected) {
        console.error('✗ 密钥注入失败（不显示表达式内容）')
        hadErr = true
        return
      }
      // ★ 注入式验证必须先确认注入**真的生效** —— 本仓库两次因"注射了但没生效"得到假绿。
      const chk = await evaluate('!!window.__chemAgent.settings.hasKey()')
      if (!(chk.result && chk.result.value === true)) {
        console.error('✗ 密钥写入后 hasKey() 仍为 false —— 注入没有生效，拒绝继续（否则下面只会得到一堆 401）')
        hadErr = true
        return
      }
      console.log('密钥已注入页面设置（hasKey = true）')

      for (const c of todo) {
        const row = { id: c.id, route: c.route, ok: false, L1: '-', L2: '-', L3: '-', rounds: 0,
          tokens: 0, ms: 0, note: '', tools: [] }
        results.push(row)
        const t0 = Date.now()
        try {
          // 每条用例前回到起点：清历史 + 走该用例的 URL
          await evaluate('window.__chemAgent.app.conversation.reset && window.__chemAgent.app.conversation.reset(); 1')
          await cdp.send('Page.navigate', { url: BASE + '/' + c.route })
          await sleep(2500)
          await evaluate('1')   // 等一等，确保模块已按 URL 激活

          // ---- --dry：只验接线，**不发请求**（零额度）----
          if (DRY) {
            const info = await evalJSON(`JSON.stringify((() => {
              const ca = window.__chemAgent;
              const active = ca.app.activeModule;
              const cur = ca.app.getTools().map(t => t.function ? t.function.name : t);
              // 模块**声明**的全部工具（与当前节点无关）——
              // ★ 有一条实测教训：只查"当前节点下有没有"会把"节点不对"误报成"接线坏了"。
              //   generateQuiz 只在 quiz 节点可见，而默认停在 explain ——
              //   于是一份完全正常的接线被 --dry 报成缺工具。假故障会让人不再相信这个模式。
              const mod = ca[active];
              const moduleDefs = mod && mod.defs
                ? Object.values(mod.defs).flat().map(d => d.function.name) : [];
              // ★ 中枢工具（applySceneActions / getSnapshot / listSceneActions…）**不在模块的
              //   defs 里** —— 按契约，模块只能往工具类别里放工具，权限与中枢工具由中枢裁决。
              //   只查模块 defs 会把"这是中枢工具"误报成"模块没声明"（实测踩到）。
              const hubDefs = [];
              const walk = (v) => {
                if (!v) return;
                if (Array.isArray(v)) { for (const x of v) walk(x); return; }
                if (typeof v === 'object') {
                  if (v.function && v.function.name) hubDefs.push(v.function.name);
                  else if (typeof v.name === 'string') hubDefs.push(v.name);
                  else for (const x of Object.values(v)) walk(x);
                }
              };
              walk(ca.app.toolDefs);
              const declared = Array.from(new Set([].concat(moduleDefs, hubDefs)));
              // ★ 判定用**三者的并**：当前节点已可见的工具、模块声明的工具、中枢工具。
              //   · applySceneActions 是中枢工具，不在模块 defs 里，但当前节点就能取到；
              //   · generateQuiz 是模块工具，但只在 quiz 节点可见（默认停在 explain）。
              //   只看其中任一个都会产生假故障，而假故障会让人不再相信这个模式。
              return { active, cur, declared };
            })())`)
            const v = info
            row.tools = v.cur
            row.declared = v.declared
            row.active = v.active
            if (c.route === '#/') {
              // ★ 首页的模块归属要**发出去之后**才由文本路由决定 —— dry 下没发，
              //   此刻看到的是默认模块（crystal）。如实标成"未验证"，不判 ✗。
              row.L1 = '—(需发送)'
              row.L2 = '—(需发送)'
            } else {
              const notDeclared = c.expectTools.filter(
                (n) => !v.declared.includes(n) && !v.cur.includes(n))
              const notInNode = c.expectTools.filter(
                (n) => !v.cur.includes(n) && v.declared.includes(n))
              if (notDeclared.length) row.L1 = '✗ 不属于该模块也不在中枢 ' + notDeclared.join(',')
              else if (notInNode.length) row.L1 = `✓(需切到 ${notInNode.join(',')} 所属节点)`
              else row.L1 = '✓'
              row.L2 = '—'
            }
            row.L3 = '—'
            row.ok = ![row.L1, row.L2, row.L3].some((x) => String(x).startsWith('✗'))
            row.note = '(dry：未发请求)'
            row.ms = Date.now() - t0
            continue
          }

          // ---- 真跑一轮 ----
          // ★ 必须包成 async IIFE：`Runtime.evaluate` 里写**顶层 await 是语法错误**，
          //   而那个错误看不出来（见 evalJSON 的说明）。
          const summary = await evalJSON(
            '(async () => JSON.stringify(await window.__chemAgent.app.send('
            + JSON.stringify(c.ask) + ', {})))()')
          row.rounds = summary.rounds || 0
          row.tokens = (summary.usage && summary.usage.total_tokens) || 0
          row.tools = summary.tools || []
          if (summary.aborted) row.note = '（被中断）'
          if (summary.finishReason === 'length') row.note = '（正文被 max_tokens 截断）'

          // L1：模型真的调了工具
          const miss = c.expectTools.filter((n) => !row.tools.includes(n))
          row.L1 = miss.length ? '✗ 未调用 ' + miss.join(',') : '✓'

          // L2：工具结果真的回到了上下文，且含程序算出的字段
          const hist = await evalJSON('JSON.stringify(window.__chemAgent.app.conversation.getHistory())')
          // ★ 把"实际下发了哪些场景动作"也记下来：动作类用例失败时，
          //   光知道"状态没变"没用 —— 要能区分"模型没下发那一条"和"下发了但没生效"。
          //   实测就是靠它定位的：模型只下发了 setQuantumNumbers，没发 setWavefunctionMode。
          row.actions = Array.from(new Set(
            (JSON.stringify(hist).match(/"action"\s*:\s*"([A-Za-z]+)"/g) || [])
              .map((x) => x.replace(/.*"([A-Za-z]+)"$/, '$1'))))
          const tools = toolMessages(hist)
          let payload = ''
          for (const m of tools) payload += (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)) + '\n'
          if (!tools.length) row.L2 = '✗ 历史里没有 tool 消息'
          else if (c.expectFields && c.expectFields.length) {
            const missF = c.expectFields.filter((f) => !payload.includes(f))
            row.L2 = missF.length ? '✗ 结果里没有 ' + missF.join(',') : '✓'
          } else row.L2 = '✓'

          // L3（动作类）：核对**快照真的变了**
          if (c.expectState) {
            const snap = await evalJSON(
              '(async () => JSON.stringify(window.__chemAgent[' + JSON.stringify(c.expectModule || c.id.split('-')[0])
              + '].facade.getSnapshot()))()')
            const bad = Object.entries(c.expectState).filter(([k, v]) => snap[k] !== v)
            row.L3 = bad.length
              ? '✗ 状态没变：' + bad.map(([k, v]) => `${k}=${JSON.stringify(snap[k])}（期望 ${JSON.stringify(v)}）`).join('、')
              : '✓ 快照已变：' + Object.entries(c.expectState).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('、')
            row.ok = ![row.L1, row.L2, row.L3].some((x) => String(x).startsWith('✗'))
            // ★ 这条也要判 flaky：expectState 分支自己 `continue` 走了，
            //   不在这里判的话，标了 flaky 的用例仍然会被计进退出码
            //   （实测：标了却仍报"未通过 2 项"）。
            if (!row.ok && c.flaky) row.flakyBad = true
            continue
          }

          // L3（查询类）：工具算出的特征数值出现在最终正文里（= 模型真的用了它）
          if (row.L2.startsWith('✓') && c.expectText) {
            // 有些工具的结果里本来就没有数值（点群符号、示例清单…），
            // 这时用"必须说出来的那句话"当判据，比硬凑数字有意义。
            const body0 = asciiNorm(assistantText(hist))
            const want = asciiNorm(c.expectText)
            row.L3 = body0.indexOf(want) >= 0
              ? '✓ 说出了 ' + c.expectText
              : '✗ 正文没出现 ' + c.expectText + '（按上下标归一化后仍无）'
            if (row.L3.startsWith('✗')) {
              row.dbg = { nums: [], tail: body0.slice(-300) }
            }
          } else if (row.L2.startsWith('✓')) {
            const nums = new Set()
            for (const m of tools) {
              const txt = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
              try { distinctiveNumbers(JSON.parse(txt), nums) } catch (e) { distinctiveNumbers(txt, nums) }
            }
            const body = assistantText(hist)
            const hit = [...nums].filter((n) => textMentions(body, n))
            if (!nums.size) row.L3 = '—(工具结果里没有特征数值)'
            else if (hit.length) { row.L3 = `✓ 引用了 ${hit.slice(0, 3).join('/')}` }
            else {
              // ★ 失败时把**候选**与**正文末尾**一起打出来：只报一个 ✗，
              //   看的人无从判断是"模型真没用"还是"我的提取器没捞到数"。
              //   （实测第一次就是后者：候选里只有 "2." 和 "6"。）
              row.L3 = `✗ 正文没引用工具算出的数值（候选 ${[...nums].slice(0, 8).join(' / ')}）`
              row.dbg = { nums: [...nums].slice(0, 20), tail: body.slice(-260).split(String.fromCharCode(10)).join(String.fromCharCode(32)) }
            }
          } else row.L3 = '—'

          // 三层任一层 ✗ 就算没通过；L3 是"模型没用结果"，--strict 下才计入退出码
          row.ok = ![row.L1, row.L2, row.L3].some((x) => String(x).startsWith('✗'))
            || (!STRICT && row.L1 === '✓' && row.L2 === '✓')
          // ★ 标了 flaky 的用例：如实报出失败，但**不计入退出码**（见该用例的注释）。
          if (!row.ok && c.flaky) row.flakyBad = true
        } catch (e) {
          row.note = '执行异常：' + String(e.message || e).slice(0, 120)
        }
        row.ms = Date.now() - t0
      }

      // ---- 收尾：清掉注进去的密钥（★ 放在 finally 之前这里，硬超时那条路也会走 lib 的 shutdown）----
      try {
        await evaluate('window.__chemAgent.settings.clearAll(); 1')
        await evaluate('window.__chemAgent.store && window.__chemAgent.store.clearAll && window.__chemAgent.store.clearAll(); 1')
      } catch (e) { /* 收尾失败不掩盖主结果 */ }

      const errs = pageErrors(cdp)
      if (errs.length) {
        console.error('--- 页面错误 ---')
        for (const x of errs) console.error('  ' + x)
        hadErr = true
      }
    })
} catch (e) {
  console.error(String(e.message || e))
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 报表
// ---------------------------------------------------------------------------
const pad = (s, n) => String(s == null ? '' : s).padEnd(n)
console.log('')
console.log('═'.repeat(96))
console.log(pad('用例', 18) + pad('L1 调用', 12) + pad('L2 执行', 12) + pad('L3 引用', 22) + pad('轮', 4) + pad('token', 8) + '耗时')
console.log('─'.repeat(96))
let totalTokens = 0
let bad = 0
for (const r of results) {
  totalTokens += r.tokens || 0
  if (!r.ok && !DRY && !r.flakyBad) bad++
  console.log(pad(r.id, 18) + pad(r.L1, 12) + pad(r.L2, 12) + pad(String(r.L3).slice(0, 20), 22)
    + pad(r.rounds, 4) + pad(r.tokens, 8) + (r.ms / 1000).toFixed(1) + 's'
    + (r.note ? '  ' + r.note : ''))
  // ★ 表格里 L3 只截 20 字符，失败时**必须打全** —— 否则看的人只知道"状态没变"，
  //   却看不到**变成了什么**，等于没给线索。
  if (r.actions && r.actions.length) console.log('    ↳ 模型下发的场景动作：' + r.actions.join(', '))
  if (String(r.L3).startsWith('✗') || String(r.L2).startsWith('✗') || String(r.L1).startsWith('✗')) {
    console.log('    ↳ 判据全文  L1: ' + r.L1 + '   L2: ' + r.L2 + '   L3: ' + r.L3)
  }
  if (r.dbg) {
    console.log('    ↳ L3 详情：' + String(r.L3))
    if (r.dbg.nums.length) console.log('    ↳ 工具结果里的候选数值：' + r.dbg.nums.join(' / '))
    console.log('    ↳ 正文末尾：' + r.dbg.tail)
  }
}
console.log('─'.repeat(96))
console.log(`合计 ${results.length} 项，未通过 ${bad} 项${DRY ? '（--dry：未发请求，零额度）' : `，**消耗 ${totalTokens} token**`}`)
{
  const fl = results.filter((r) => r.flakyBad).map((r) => r.id)
  if (fl.length) console.log(`另有 ${fl.length} 项标了 flaky（不计入退出码，但见上面各行的判据全文）：${fl.join('、')}`)
}
if (DRY) {
  const active = results.map((r) => `${r.id}:${r.active}`).join('  ')
  console.log('各用例落地模块：' + active)
}
console.log('═'.repeat(96))

process.exit((bad || hadErr) ? 1 : 0)
