/**
 * test-context-budget.mjs — 上下文压缩机制的守卫
 *
 * ★ 判据全部是**行为**（输入 → 输出消息的形状），不看源码：
 *   ① 不超预算时：一条不动（压缩必须是"不够才动"）
 *   ② 超预算时：**最近的若干条原样保留**（教学的连续性靠它）
 *   ③ ★ 最重要的一条：**绝不切断"assistant(tool_calls) → tool"配对**
 *      —— 切在中间会让服务端直接 400（这是压缩最容易写错的地方）
 *   ④ 折叠后确实释放了预算（不是"标注了但没省"）
 *   ⑤ 被丢掉的条数如实写进说明（模型据此知道自己失忆的范围）
 *   ⑥ 快照仍作为 system 注入、且**不进历史**
 */
import {
  estimateTokens, messageTokens, safeCutIndex, buildMessages,
} from '../core/context-budget.js'

let ok = 0
let bad = 0
function check(name, cond, detail) {
  if (cond) { ok++; console.log('  ✓ ' + name) } else { bad++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')) }
}

const LONG = '这是一段很长的教学说明。'.repeat(60)      // ≈ 720 字符 ≈ 360 token
const SYS = '系统提示'

function turn(i) {
  return [
    { role: 'user', content: '第' + i + '问：' + LONG },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'c' + i, type: 'function', function: { name: 'getSnapshot', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'c' + i, content: JSON.stringify({ ok: true, view: 'orbit', i }) },
    { role: 'assistant', content: '第' + i + '答：' + LONG },
  ]
}

// ── ① 不超预算 ⇒ 一条不动 ───────────────────────────────────────────────────
{
  const h = turn(1).concat(turn(2))
  const r = buildMessages({ system: SYS, history: h, maxHistoryTokens: 100000 })
  check('① 预算充足时一条不动（未压缩）', r.compressed === false && r.messages.length === h.length + 1,
    `compressed=${r.compressed} messages=${r.messages.length} 期望=${h.length + 1}`)
  check('① 系统提示在第一位', r.messages[0].role === 'system' && r.messages[0].content === SYS)
}

// ── ② 超预算 ⇒ 保留最近若干条 ───────────────────────────────────────────────
const big = []
for (let i = 1; i <= 12; i++) big.push(...turn(i))
{
  const r = buildMessages({ system: SYS, history: big, maxHistoryTokens: 1200 })
  const kept = r.messages.filter((m) => m.role !== 'system')
  check('② 超预算时确实压缩了', r.compressed === true && r.dropped > 0,
    `compressed=${r.compressed} dropped=${r.dropped}`)
  check('② 保留的是**末尾**那一段（最近的教学上下文）', (() => {
    const lastKept = kept[kept.length - 1]
    const lastHist = big[big.length - 1]
    return lastKept && lastHist && lastKept.content === lastHist.content
  })(), '最后一条应与历史的最后一条逐字相同')
  check('② 至少保留了一条（不会只剩系统提示）', kept.length >= 1, `kept=${kept.length}`)
}

// ── ③ ★ 工具配对不被切断 ─────────────────────────────────────────────────────
{
  const r = buildMessages({ system: SYS, history: big, maxHistoryTokens: 900 })
  const msgs = r.messages
  // 每个带 tool_calls 的 assistant 后面必须紧跟其 tool 消息（按 id 对齐）
  let broken = 0
  const ids = new Set()
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      for (const tc of m.tool_calls) {
        const nxt = msgs[i + 1]
        const paired = nxt && nxt.role === 'tool' && nxt.tool_call_id === tc.id
        if (!paired) broken++
        ids.add(tc.id)
      }
    }
    if (m.role === 'tool' && !ids.has(m.tool_call_id)) broken++   // 前面没有对应 tool_calls
  }
  check('③ ★ 压缩后 assistant(tool_calls) 与 tool 仍逐对配对', broken === 0, `断裂 ${broken} 处`)
}

// ── ④ 确实释放了预算 ────────────────────────────────────────────────────────
{
  const before = big.reduce((n, m) => n + messageTokens(m), 0)
  const r = buildMessages({ system: SYS, history: big, maxHistoryTokens: 1200 })
  check('④ 压缩后 token 明显下降', r.tokens < before / 3, `before=${before} after=${r.tokens}`)
}

// ── ⑤ 说明里如实写了被丢掉的条数 ─────────────────────────────────────────────
{
  // ★ 按**真实调用方**的方式注入文案（conversation.js 传的是 t('agent.context.elided', {n})）：
  //   本模块是纯函数、不留硬编中文，文案由宿主给（见模块里那段说明）。
  const noteOf = (n) => '【上下文压缩】更早的 ' + n + ' 条对话已不在上下文里（只保留最近的部分）。'
  const r = buildMessages({ system: SYS, history: big, maxHistoryTokens: 1200, elidedNote: noteOf })
  const note = r.messages.find((m) => m.role === 'system' && m.content !== SYS)
  check('⑤ 折叠说明带着"丢掉多少条"的数字', !!note && note.content.indexOf(String(r.dropped)) >= 0,
    note ? note.content.slice(0, 60) : '(没有说明)')
  check('⑤ 说明明确告知"不在上下文里"', !!note && /不在上下文里/.test(note.content))
  check('⑤ 没注入文案时用英文兜底（不会悄悄漏中文到英文界面）',
    (() => {
      const d = buildMessages({ system: SYS, history: big, maxHistoryTokens: 1200 })
      const n = d.messages.find((m) => m.role === 'system' && m.content !== SYS)
      return !!n && !/[\u4e00-\u9fa5]/.test(n.content)
    })())
}

// ── ⑥ 快照：作为 system 注入，但不算进历史 ───────────────────────────────────
{
  const h = turn(1)
  const r = buildMessages({ system: SYS, history: h, snapshotText: '【快照】甲烷 Td', maxHistoryTokens: 100000 })
  check('⑥ 快照作为第二条 system 注入', r.messages[1].role === 'system' && r.messages[1].content.indexOf('甲烷') >= 0)
  check('⑥ 快照不进历史（不留痕在 history 里）', !h.some((m) => String(m.content).indexOf('甲烷') >= 0))
  check('⑥ 快照在最前，历史消息顺序不变', r.messages.slice(2).map((m) => m.role).join(',') === h.map((m) => m.role).join(','))
}

// ── ⑦ 边界：空历史 / 单条 / 关闭压缩 ────────────────────────────────────────
{
  const r0 = buildMessages({ system: SYS, history: [], maxHistoryTokens: 100 })
  check('⑦ 空历史：不崩、只有系统提示', r0.messages.length === 1 && r0.compressed === false)
  const one = buildMessages({ system: SYS, history: [{ role: 'user', content: LONG }], maxHistoryTokens: 1 })
  check('⑦ 单条超预算时仍保留它（不死板地清零）', one.messages.filter((m) => m.role === 'user').length === 1)
  const off = buildMessages({ system: SYS, history: big, maxHistoryTokens: 0 })
  check('⑦ maxHistoryTokens<=0 ⇒ 关闭压缩', off.compressed === false && off.messages.length === big.length + 1)
}

// ── ⑧ safeCutIndex 的安全性（单独守，便于定位） ──────────────────────────────
{
  const cut = safeCutIndex(big, 100)
  const m = big[cut]
  const safe = m && (m.role === 'user' || (m.role === 'assistant' && !(Array.isArray(m.tool_calls) && m.tool_calls.length)))
  check('⑧ 切分点只落在 user / 无 tool_calls 的 assistant 上', !!safe,
    m ? `切点是 ${m.role}${m.tool_calls ? '(带 tool_calls)' : ''}` : '越界')
  check('⑧ estimateTokens 单调且对空串为 0', estimateTokens('') === 0 && estimateTokens('abc') > 0)
}

console.log('\n结果：通过 ' + ok + ' 项，失败 ' + bad + ' 项')
process.exit(bad ? 1 : 0)
