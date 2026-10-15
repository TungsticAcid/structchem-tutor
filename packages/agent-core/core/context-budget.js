/**
 * core/context-budget.js — **上下文预算与压缩**（纯函数，无依赖，便于单测）
 *
 * 为什么需要它（2026-10-15 用户："完善…上下文管理压缩机制"）：
 *   在此之前，发送给模型的 messages 是 `[system] + history` **全量** ——
 *   历史只增不减。一次教学会话几十轮之后：
 *     · 每轮都在为**早已讲完的内容**付 token（用户按量付费）；
 *     · 到某个点直接撞模型的上下文上限 ⇒ 请求报错，而界面上看不出原因；
 *     · 模型注意力被稀释，回答质量下降（"记得上一次课、忘了刚才那句"）。
 *
 * 设计取舍（明确写下来，免得后人以为它比实际聪明）：
 *   · **不做 LLM 摘要**：那要额外一次模型调用（还要花钱、还会失败、还可能摘要出错），
 *     而本项目的教学上下文里真正"必须记得"的事实（当前分子/轨道、学情）已经由
 *     快照（`getSnapshotText`）每轮重采并注入 —— 摘要能带来的增量很小。
 *   · 所以做的是**有界保留**：保留最近 N 条（按 token 预算），更早的折叠成一条说明。
 *     说明里明确告诉模型"更早的对话已不在上下文里"，避免它以为自己记得全部。
 *   · **压缩点必须安全**：`tool` 消息必须紧跟在带对应 `tool_calls` 的 assistant 消息之后，
 *     否则多数服务端会直接报 400。本模块只在"user 消息"或"不含 tool_calls 的 assistant
 *     消息"处切分，并把切点之后的整段原样保留（绝不切在工具链中间）。
 */

/**
 * 粗略 token 估算。
 * ★ 刻意不引入 tokenizer：本项目的用途是"别爆上下文"，量级对就够；
 *   中英混排下 1 token ≈ 2 个字符（中文约 1.5、英文约 4，取中间偏保守）。
 */
export function estimateTokens(text) {
  const s = typeof text === 'string' ? text : ''
  return Math.ceil(s.length / 2)
}

/** 一条消息的估算开销（含角色/结构开销） */
export function messageTokens(m) {
  if (!m) return 0
  let n = 4 + estimateTokens(m.content)
  if (Array.isArray(m.tool_calls)) {
    for (const tc of m.tool_calls) {
      n += 12 + estimateTokens(tc && tc.function && tc.function.name)
        + estimateTokens(tc && tc.function && tc.function.arguments)
    }
  }
  return n
}

/**
 * 找一个**安全的切分点**：返回下标 i，表示 `history.slice(i)` 可以整段保留。
 *
 * 安全 = 该处不落在"assistant(tool_calls) → tool"这条链中间：
 *   · `history[i].role === 'user'` ⇒ 安全；
 *   · `history[i].role === 'assistant'` 且**没有 tool_calls** ⇒ 安全；
 *   · 其余（tool / 带 tool_calls 的 assistant）⇒ 不安全，往前挪。
 *
 * @param {Array} history
 * @param {number} maxTokens 允许保留的 token 预算
 * @returns {number} 切分点下标（0 表示完全不用压缩）
 */
export function safeCutIndex(history, maxTokens) {
  const list = history || []
  let used = 0
  let cut = list.length
  for (let i = list.length - 1; i >= 0; i--) {
    // ★ 先判断"能否从这里切开"，再决定要不要把这轮算进预算：
    //   切点由"从这里到末尾"构成，所以先从末尾往前累加。
    used += messageTokens(list[i])
    const m = list[i]
    const isUser = m && m.role === 'user'
    const isPlainAssistant = m && m.role === 'assistant' && !(Array.isArray(m.tool_calls) && m.tool_calls.length)
    if (used > maxTokens && (isUser || isPlainAssistant)) {
      // 这一刻起"再往前就超预算" ⇒ 切在这里（i 本身保留）
      cut = i
      break
    }
    cut = i
  }
  return cut
}

/**
 * 组装发送给模型的 messages（含压缩）。
 *
 * @param {Object} o
 * @param {string} o.system               系统提示（必给）
 * @param {Array}  o.history              会话历史（不含 system）
 * @param {string} [o.snapshotText]       就近快照（作为第二条 system 注入，不写入历史）
 * @param {number} [o.maxHistoryTokens]   历史部分的 token 预算（<=0 表示不压缩）
 * @param {Function} [o.elidedNote]       (n) => string 折叠说明；缺省用中文文案
 * @returns {{messages:Array, compressed:boolean, dropped:number, kept:number, tokens:number}}
 */
export function buildMessages(o) {
  const opts = o || {}
  const history = Array.isArray(opts.history) ? opts.history : []
  const budget = Number(opts.maxHistoryTokens)
  const system = opts.system || ''

  const totalTokens = (list) => list.reduce((n, m) => n + messageTokens(m), 0)

  if (!(budget > 0) || totalTokens(history) <= budget) {
    const messages = [{ role: 'system', content: system }]
    if (opts.snapshotText) messages.push({ role: 'system', content: opts.snapshotText })
    return {
      messages: messages.concat(history),
      compressed: false, dropped: 0, kept: history.length, tokens: totalTokens(history),
    }
  }

  let cut = safeCutIndex(history, budget)
  // ★ 全都要丢时至少留最后一条（否则上下文里只剩系统提示，等于失忆）
  if (cut >= history.length && history.length) cut = history.length - 1
  const kept = history.slice(cut)
  const dropped = cut
  /**
   * 折叠说明的文案**由调用方注入**（`elidedNote`）。
   * ★ 本模块是纯函数、无 i18n 依赖（便于单测），所以这里不留硬编中文 ——
   *   i18n 守卫会（正确地）把它算作"插值外的静态文案"并拒绝。真源在
   *   `conversation.js` 里用 `t('agent.context.elided', { n })` 取。
   * ★ 兜底串也不含中文：它是给"忘了注入"的调用方一个英文提示，
   *   而不是悄悄漏一句中文到英文界面上。
   */
  const note = typeof opts.elidedNote === 'function'
    ? opts.elidedNote(dropped)
    : `[Context compressed] The earlier ${dropped} messages are no longer in context.`

  const messages = [{ role: 'system', content: system }]
  if (opts.snapshotText) messages.push({ role: 'system', content: opts.snapshotText })
  if (dropped > 0) messages.push({ role: 'system', content: note })
  return {
    messages: messages.concat(kept),
    compressed: dropped > 0, dropped, kept: kept.length, tokens: totalTokens(kept),
  }
}

export default { estimateTokens, messageTokens, safeCutIndex, buildMessages }
