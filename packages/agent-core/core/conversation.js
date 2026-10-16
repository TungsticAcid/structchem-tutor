/**
 * conversation.js — 对话循环（ReAct）
 *
 * 流程（最多 maxRounds 轮）：
 *   ① 采集感知快照          ← ★ 每轮都重新采集
 *   ② 组装 messages（system = 基础契约 + 工具契约 + 知识/技能清单 + 就近提示）
 *   ③ LLM 流式调用
 *   ④ 解析增量（reasoning / content / tool_calls）
 *   ⑤ 有 tool_calls → 本地执行 → 结果回灌 → continue；无 → 结束
 *
 * ★ 六个必须做对的细节（每一个都对应一次真实故障）：
 *   1. **每轮重采快照**：工具真的改了视图，沿用旧快照会让模型重复下发已生效的动作。
 *   2. **动作按分镜队列播放**：applySceneActions 只入队并立即返回，逐步播放由用户点
 *      「下一步」驱动，故工具不会阻塞对话循环。
 *   3. **只发工具调用时 content 为空**：此时面板只显示动作气泡，不是故障。
 *   4. **中止时补发占位 tool 消息**：模型可能一次返回 5 个工具调用，用户在第 2 个时
 *      叫停——剩余 3 个不执行是对的，但历史里必须为它们补上 tool 消息，否则
 *      tool_calls 与 tool 消息不配对，下一次请求会被服务端判为消息格式非法。
 *   5. **`finish_reason === 'length'` 要显式续写**：不处理会有两种静默故障——正文
 *      写了一半就没了；更糟的是推理模型把预算全烧在思考阶段，正文一个字都没写，
 *      界面只出现一个空白气泡，而错误信息一条都没有。续写要有次数上限。
 *   6. **思考内容可能不走流式**：有些服务只在最终 payload 里给 reasoning_content，
 *      那样面板上的"思考"永远是空的，故按差额补发一次。
 *
 * ★ 用户控制权：任何时刻可 stop()，并**丢弃尚未执行的剩余工具调用**。
 *   丢弃剩余调用是"退出权"能否真正生效的关键——继续执行后 3 个就违背了用户意图。
 *
 * 来源：orbit/H5/js/agent/agent-core.js 的 send/stop/reset（第 143–341 行）与
 * manifestText（第 35–52 行）。抽掉了 orbit 的角色提示与动作速查表（改为注入
 * buildSystem），以及它对 window.Settings / ToolRegistry / Perception / LLMClient /
 * SceneBridge 的直接引用（改为注入）。
 */
// ★ 本文件产出的每一段文字都会进**模型上下文**（系统提示、清单、截断续写提示、
//   中止占位回执），不会作为 DOM 文本节点出现 ⇒ 全部走 t()，`text` 表在这里无用。
// ★ 自己 import 字典（副作用即 registerDict），不依赖入口替你注册：
//   本文件被 `packages/knowledge/tools/check-shared-data.mjs` 这类**不经 app.js** 的
//   调用方直接 import 过——少了这一行，t() 查不到键会**原样返回键名**当文案，
//   而守卫照样绿（它只读字典文件里登记了哪些原文）。
import '../i18n.js'
import { t } from '../../i18n/index.js'
import { buildMessages } from './context-budget.js'

/** 默认最大轮数 */
export const DEFAULT_MAX_ROUNDS = 6
/**
 * 被长度上限截断时允许「接着写」的次数。
 * 给 2 次足够补完一段长推导，又不至于把一轮对话拖成没完没了的续写。
 */
export const DEFAULT_MAX_CONTINUES = 2
/**
 * 轮数用尽而整轮**一个字正文都没写**时，是否允许再要一轮"只写正文"的收尾。
 *
 * ★★ 2026-10-15（用户报："询问问题后，智能体的回复很多只有思考"）——真机复现：
 *   问"把甲烷 Td 的对称元素全部演示给我看，同时逐个解释"，模型连走 **6 个** LLM 回合
 *   （9 次工具调用，5780 字思考），**0 个回合写了正文**，正好撞上 maxRounds=6 ⇒
 *   循环结束。面板上因此只剩 5 个「已思考（点击展开）」折叠块，学生看不到任何回答 ✗。
 *
 *   这是"循环的出口"的问题，不是模型不会写：它只是把预算全花在"看画面/排演示"上。
 *   所以出口必须先要一句结论 —— 与提示词里那条"先答案后演示"是同一条铁律，
 *   只是这里用**结构**保证它（提示词管不住的，就得由循环兜住）。
 *
 * ★ 这一轮是**最后的**一轮：`while (rounds < maxRounds)` 已经为假，不会再循环，
 *   所以既不会无限续下去，也没有"多给几轮工具调用"的副作用。
 * ★ 给这一轮发的指令显式要求**不要调用任何工具**：否则模型很可能又去调一个工具，
 *   拿到 `tool_calls` 后历史里就要配上 tool 消息，而循环已经结束 —— 学生仍然没有正文。
 */
const FINAL_ANSWER_ROUNDS = 1

/**
 * 历史部分的 **token 预算**：超过它就压缩（见 core/context-budget.js）。
 *
 * ★★ 2026-10-15（用户："完善…上下文管理压缩机制"）：
 *   取 24000 而不是贴着模型上限：系统提示 + 工具定义 + 快照本身就要吃掉几千，
 *   再留出这一轮的回答空间。宁可早一点折叠旧历史，也不要在某一轮突然报
 *   "上下文超限"——那种失败学生完全看不懂，而且发生在会话正长、正投入的时候。
 * ★ 设成 0/负数可关闭压缩（测试用）。
 */
export const DEFAULT_MAX_HISTORY_TOKENS = 24000

/**
 * 组装「清单」部分：知识库与技能库只放索引，正文由模型按需拉取。
 * 这是渐进式披露在系统提示里的落点——清单体量小、可常驻；
 * 正文（body / 完整步骤）进上下文要靠 loadKnowledge / loadSkill。
 *
 * @param {Object} [catalogs]
 * @param {ReturnType<import('./catalog.js').createCatalog>} [catalogs.knowledge]
 * @param {ReturnType<import('./catalog.js').createCatalog>} [catalogs.skills]
 * @returns {string}
 */
export function buildManifestText(catalogs = {}) {
  const lines = []
  const k = catalogs.knowledge
  if (k && typeof k.index === 'function') {
    const idx = k.index()
    if (idx.length) {
      lines.push(t('agent.manifest.knowledgeTitle'))
      lines.push(idx.map((e) => t('agent.manifest.knowledgeLine', {
        id: e.id, kp: e.kp, title: e.title, keywords: (e.keywords || []).join('/'),
      })).join('\n'))
    }
  }
  const s = catalogs.skills
  if (s && typeof s.index === 'function') {
    const sk = s.index()
    if (sk.length) {
      lines.push(t('agent.manifest.skillsTitle'))
      lines.push(sk.map((x) => `${x.name}｜${x.desc}`).join('\n'))
    }
  }
  return lines.join('\n\n')
}

/**
 * 拼装系统提示：角色契约 + 清单 + 当前节点的就近提示。
 * 三段式是刻意的——节点约束由结构（工具白名单）保证，提示里只补"此刻该怎么做"。
 */
export function composeSystemPrompt(parts = {}) {
  return [parts.role, parts.manifest, parts.nodePrompt].filter(Boolean).join('\n\n')
}

/**
 * 创建对话循环。
 *
 * @param {Object}   opts
 * @param {Object}   opts.llm             必需：{ chat(opts) } — 见 core/llm-client.js
 * @param {Function} opts.buildSystem     必需：() => string 完整系统提示
 * @param {Function} opts.getSettings     必需：() => { apiKey, model, maxTokens, endpoint, ... }
 * @param {Function} opts.getTools        必需：() => 工具定义数组（**已按节点白名单过滤**）
 * @param {Function} opts.executeTool     必需：(name, argsJson) => Promise<result>
 * @param {Function} [opts.getSnapshotText] () => string 紧凑快照文本，每轮重采；返回空串则不注入
 * @param {Function} [opts.onAbort]       可选：stop() 时通知模块停掉自己的动画/演示
 * @param {number}   [opts.maxRounds]
 * @param {number}   [opts.maxContinues]
 */
export function createConversation(opts = {}) {
  const {
    llm, buildSystem, getSettings, getTools, executeTool, getSnapshotText, onAbort,
    beginToolRound, endToolRound,
  } = opts
  for (const [k, v] of Object.entries({ llm, buildSystem, getSettings, getTools, executeTool })) {
    if (v == null) throw new Error(`createConversation 需要 opts.${k}`)
  }
  const maxRounds = opts.maxRounds == null ? DEFAULT_MAX_ROUNDS : opts.maxRounds
  const maxContinues = opts.maxContinues == null ? DEFAULT_MAX_CONTINUES : opts.maxContinues
  /** 历史 token 预算（见 DEFAULT_MAX_HISTORY_TOKENS）；<=0 关闭压缩 */
  const maxHistoryTokens = opts.maxHistoryTokens == null ? DEFAULT_MAX_HISTORY_TOKENS : opts.maxHistoryTokens

  let history = []          // 会话历史（OpenAI messages 格式，不含 system）
  let abortCtrl = null
  let running = false
  let aborted = false

  /**
   * 发一轮对话。
   * @param {string} userText
   * @param {Object} handlers
   *   onDelta(evt)        流式增量 {type:'reasoning'|'content'|'tool_call_start', text}
   *   onToolCall(info)    即将执行工具 {name, args, round}
   *   onToolResult(info)  工具执行完 {name, args, result, round}
   *   onMessage(msg)      追加一条完整消息（供面板渲染）
   *   onNotice(notice)    非错误但要告知用户的事（参数降级、截断…）
   *   onDone(summary)     本轮结束
   *   onError(err)        出错
   */
  async function send(userText, handlers) {
    handlers = handlers || {}
    if (running) stop()                  // 新一轮先中止上一轮
    aborted = false
    running = true
    abortCtrl = new AbortController()

    const H = {
      onDelta: handlers.onDelta || (() => {}),
      onToolCall: handlers.onToolCall || (() => {}),
      onToolResult: handlers.onToolResult || (() => {}),
      onMessage: handlers.onMessage || (() => {}),
      onNotice: handlers.onNotice || (() => {}),
      onDone: handlers.onDone || (() => {}),
      onError: handlers.onError || (() => {}),
    }

    // origin 供展示层区分"学生真的问了"与"面板/系统代发"：否则刷新之后，内部消息
    // （截断续写提示、面板代发的指令）会被渲染成一条**可编辑的学生提问**。
    if (userText) {
      history.push({
        role: 'user',
        content: userText,
        origin: (handlers && handlers.origin) || 'user',
      })
    }

    const settings = getSettings() || {}
    if (!settings.apiKey) {
      running = false
      // ★ 这条虽然写在 `new Error(...)` 里（守卫按规则把它算作开发者文案），
      //   但它会经 onError 显示在面板上，属于**用户看得见**的提示，故照样翻译。
      const err = new Error(t('agent.noApiKey'))
      err.kind = 'no_key'
      H.onError(err)
      return { ok: false, error: err.message, kind: 'no_key' }
    }

    const executedTools = []
    let rounds = 0
    let continues = 0                    // 因长度截断而「接着写」的次数（有上限）
    /**
     * 整轮是否已经写过正文（任何一个回合都算）。
     * ★ 判据是"**整轮**"而不是"最后一轮"：中间回合写过讲解、最后那个回合只调了工具，
     *   是完全正常的形态（见 panel.js 的 roundTextChars 同一条判据）。
     */
    let wroteText = false
    // 留证据：空正文到底是怎么来的，靠这两个字段才能说清，而不是猜
    let lastFinishReason = null
    let lastUsage = null

    try {
      /**
       * 发一次 LLM 请求并把流式增量转给面板。
       *
       * ★ 抽出来是为了让"正常回合"与"补要正文的收尾回合"**只有一处**实现：
       *   两处各写一遍的话，`streamedReasoning` 的累加口径、onNotice 的抑制、aborted
       *   的短路只要有一样漂了，就会变成"某一条路下思考凭空多出一段/少一段"这种
       *   静默差别（本仓库最怕的那类）。
       *
       * @returns {Promise<{out: Object, streamedReasoning: string}>}
       */
      async function askOnce(msgs) {
        let streamedReasoning = ''
        const out = await llm.chat({
          settings,
          maxTokens: settings.maxTokens,
          messages: msgs,
          tools: getTools(),
          signal: abortCtrl.signal,
          onNotice: (n) => { if (!aborted) H.onNotice(n) },
          onDelta: (ev) => {
            if (aborted) return
            if (ev.type === 'reasoning') streamedReasoning += ev.text
            H.onDelta(ev)
          },
        })
        return { out, streamedReasoning }
      }

      /**
       * 采一次"就近快照"（每次组装 messages 前重采：工具可能已改变视图）。
       * ★ 局部变量刻意不叫 `t`：它会遮住上面 import 的 i18n 取值函数 `t()`。
       */
      const takeSnapshot = () => {
        if (typeof getSnapshotText !== 'function') return ''
        const snapText = getSnapshotText()
        return snapText ? t('agent.snapshot.header') + '\n' + snapText : ''
      }

      /**
       * 组装发送给模型的 messages（**含上下文压缩**，见 core/context-budget.js）。
       *
       * ★★ 2026-10-15（用户："完善会话保存管理机制，以及上下文管理压缩机制"）：
       *   此前这里是 `[{system}].concat(history)` —— 历史只增不减，长会话会
       *   ① 每轮都为早已讲完的内容付费 ② 迟早撞上下文上限 ③ 稀释注意力。
       *   现在统一走 `buildMessages`：超过预算时保留最近的若干条，更早的折叠成一条
       *   **明确告知模型"已不在上下文里"** 的说明（不做 LLM 摘要，理由见该模块头注释）。
       *   ★ 快照仍作为**第二条 system** 注入、**不写入 history**（避免累积膨胀）。
       */
      const assemble = (hist) => buildMessages({
        system: buildSystem(),
        history: hist,
        snapshotText: takeSnapshot(),
        maxHistoryTokens: maxHistoryTokens,
        elidedNote: (n) => t('agent.context.elided', { n }),
      }).messages

      while (rounds < maxRounds) {
        if (aborted) break
        rounds++

        // ① 组装 messages（快照在 assemble 内部按当前视图重采，并作为第二条 system 注入）
        const msgs = assemble(history)

        // ③ 调用（流式）
        // 记录本轮"流式吐出来的"思考长度，供第 ④ 步按差额补发
        const { out, streamedReasoning } = await askOnce(msgs)

        if (aborted) break

        lastFinishReason = out.finishReason
        lastUsage = out.usage
        // ★ 只要**任何**一个回合写了非空白正文，整轮就算"回答过了"（尾部收尾判据用）
        if (out.content && out.content.trim()) wroteText = true

        // 补发没流式吐出来的思考内容（只补差额，避免与已流出的部分重复）
        if (out.reasoning && out.reasoning.length > streamedReasoning.length) {
          const rest = out.reasoning.slice(streamedReasoning.length)
          H.onDelta({ type: 'reasoning', text: rest })
        }
        /**
         * ★★ 2026-10-14（task-2）：**本回合的思考以"最少丢"为准**——
         *   `streamedReasoning` 只装了**流式吐出来**的那部分；有些服务端不在流里给思考，
         *   只在最终 payload 的 `reasoning` 里给（本文件第 6 条坑说的就是它）。
         *   原先只取 `streamedReasoning`，于是那种服务下"只有思考、没有正文"的回合
         *   存档里是一片空白 ⇒ 刷新后连"本轮没有思考内容"都无处可依 ✗。
         *   ⇒ 流式那份为空时退回 payload 那份（两者都有时以流式为准，避免重复计数）。
         */
        const roundReasoning = streamedReasoning || out.reasoning || ''
        // 记录 assistant 消息（含工具调用），保持历史完整
        const asstMsg = { role: 'assistant', content: out.content || '' }
        // ★ 思考内容只**存档、不上行**（projection 会剥掉它）：存下来是为了刷新之后
        //   「思考」折叠区与"没有正文"的诊断说明能一字不差地重现——原先它随刷新丢失。
        // ★★ 2026-10-08：**空串也要存**（`reasoning: ''`）。区别很重要：
        //   "没有这个字段" = 老数据/没记录过；"空串" = 这一轮**确实没有思考内容**。
        //   界面据此如实说明"本轮没有思考内容"，而不是默默什么都不显示
        //   （用户报"设置了显示思考中，实际却不显示"，根因正是这里没记录 + 重渲染丢块）。
        asstMsg.reasoning = roundReasoning
        if (out.toolCalls.length) {
          asstMsg.tool_calls = out.toolCalls.map((t) => ({
            id: t.id, type: 'function',
            function: { name: t.function.name, arguments: t.function.arguments },
          }))
        }
        history.push(asstMsg)
        /**
         * ★★ 2026-10-14（task-2 用户"问题仍然存在"的第二个真因）：
         *   **每一条 assistant 回合都要回传面板**，不能只在"有正文"时才回传。
         *
         *   原先这里是 `if (out.content) H.onMessage(...)`，注释上半句的理由是"只发工具调用时
         *   content 为空，此时面板只显示动作气泡"——那在"整轮共用一个气泡"的时代成立 ✗。
         *   108583e 改成"一个 LLM 回合一个思考块"之后，**只有最后一个回合才有正文**：
         *   前面那些"只想一下、再调工具"的回合**必须**各自有一个气泡承载自己的思考块，
         *   否则它们只活在流式时的 DOM 里，任何一次从对话树重建就全没了。
         *
         *   ★ 为什么"有思考"也要回传：`content` 为空但 `reasoning` 非空的回合正是上面那种
         *     回合的主要形态（它不是"什么都没有"）。面板据此画"只含思考块的气泡"，
         *     而不是空气泡 —— 空正文的说明由 finish() 那一侧负责（见 panel.js）。
         *   ★ 判据用"有正文或有思考"，而不是无条件回传：两者都没有的回合没有可展示的内容，
         *     回传只会让面板多一个空气泡。
         */
        if (out.content || roundReasoning) {
          H.onMessage({ role: 'assistant', content: out.content || '', reasoning: roundReasoning })
        }

        // ⑤ 无工具调用 → 结束（截断的情况见第 ⑥ 步，要先处理掉）
        const truncated = out.finishReason === 'length'
        if (!out.toolCalls.length && !truncated) break

        // 逐个执行工具；若用户中止，**丢弃剩余未执行的调用**
        //
        // ★ 执行这批 tool_calls 之前**冻结工具白名单快照**（见 tool-registry.js 的
        //   freezeRound）：同一批里"先调 declareIntent 切节点、紧接着调用新节点才有的
        //   工具"于是不成立 —— 节点切换只对**下一轮**生效。
        //   少了它，"模型看不到不允许的工具、结构上无法越权"就断在这里；
        //   审计实证的通路正是：在 quiz 节点先切到 demo、再调 applySceneActions。
        if (typeof beginToolRound === 'function') beginToolRound()
        try {
          for (let i = 0; i < out.toolCalls.length; i++) {
            if (aborted) {
              // ★ 未执行的调用也要回灌一条结果，否则历史里 tool_calls 与 tool 消息不配对，
              //   下一次请求会被服务端判为格式非法（见文件头第 4 条）
              for (let k = i; k < out.toolCalls.length; k++) {
                history.push({
                  role: 'tool', tool_call_id: out.toolCalls[k].id,
                  content: JSON.stringify({ aborted: true, note: t('agent.tool.abortedNote') }),
                })
              }
              break
            }
            const tc = out.toolCalls[i]
            const name = tc.function.name
            let args = {}
            try { args = JSON.parse(tc.function.arguments || '{}') } catch (e) { args = {} }

            H.onToolCall({ name, args, round: rounds })
            const result = await executeTool(name, tc.function.arguments)
            executedTools.push(name)
            H.onToolResult({ name, args, result, round: rounds })

            history.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
          }
        } finally {
          if (typeof endToolRound === 'function') endToolRound()
        }

        // ⑥ 长度截断（见文件头第 5 条）
        if (truncated) {
          H.onNotice({ kind: 'truncated', round: rounds, continues })
          if (continues < maxContinues) {
            continues++
            history.push({
              role: 'user',
              origin: 'continuation',
              content: t('agent.continue.truncated'),
            })
            continue
          }
          H.onNotice({ kind: 'truncated_giveup', continues })
          break
        }

        // 继续下一轮，让模型看到工具结果后再决定
      }

      /**
       * ★★ 2026-10-15：**轮数用尽却一个字正文都没写** ⇒ 再要一轮"只写正文"的收尾。
       *
       * 真机复现（见 FINAL_ANSWER_ROUNDS 的说明）：模型 6 个回合全用在工具调用上，
       * 循环到上限就结束，面板上只剩一排折叠的「已思考」，学生拿不到任何回答。
       *
       * ★ 只在"整轮都没写过正文 **且** 这一轮确实动过手"时补：什么都不做就结束的
       *   （比如模型直接说"我不懂"）不是这个形态，不该再补一轮。
       * ★ 补的这一轮**不写进 while 条件**，而是给历史追加一条明确的收尾指令后
       *   再判一次 —— 条件写在 while 里会让"每次都不写正文"的模型把轮数无限拖长。
       */
      if (!aborted && !wroteText && executedTools.length) {
        H.onNotice({ kind: 'no_text_final_round' })
        history.push({ role: 'user', origin: 'continuation', content: t('agent.continue.finalAnswer') })
        rounds++
        const msgs = assemble(history)
        /**
         * ★ 工具定义**照旧**交给模型，但收尾指令明确禁止调用它们。
         *   为什么不干脆传空数组：那样服务端对"openai 兼容"的实现要求各不相同
         *   （有的把空 tools 当成格式错误），而指令＋下面的处理已经足够兜住。
         */
        const { out, streamedReasoning } = await askOnce(msgs)
        if (!aborted) {
          lastFinishReason = out.finishReason
          lastUsage = out.usage
          const roundReasoning = streamedReasoning || out.reasoning || ''
          const asstMsg = { role: 'assistant', content: out.content || '', reasoning: roundReasoning }
          if (out.toolCalls.length) {
            /**
             * ★ 模型还是去调工具了（指令没能拦住）。这里**必须**为每个 tool_call
             *   补一条 tool 结果消息：否则历史里 tool_calls 与 tool 消息不配对，
             *   下一次请求会被服务端判为格式非法（见文件头第 4 条）。
             *   ★ 但**不执行**这些调用 —— 这一轮的目的就是"要一句正文"，
             *     真去改画面反而是学生没要的副作用。（指令里已要求不要调用。）
             */
            asstMsg.tool_calls = out.toolCalls.map((call) => ({
              id: call.id, type: 'function',
              function: { name: call.function.name, arguments: call.function.arguments },
            }))
            history.push(asstMsg)
            for (const call of out.toolCalls) {
              history.push({
                role: 'tool', tool_call_id: call.id,
                content: JSON.stringify({ skipped: true, note: t('agent.tool.skippedNote') }),
              })
            }
          } else {
            history.push(asstMsg)
          }
          if (out.content || roundReasoning) {
            H.onMessage({ role: 'assistant', content: out.content || '', reasoning: roundReasoning })
          }
        }
      }

      running = false
      const summary = { ok: true, rounds, tools: executedTools, aborted, finishReason: lastFinishReason, usage: lastUsage }
      H.onDone(summary)
      return summary

    } catch (err) {
      running = false
      if (err && err.name === 'AbortError') {
        const summary = { ok: true, rounds, tools: executedTools, aborted: true, finishReason: lastFinishReason, usage: lastUsage }
        H.onDone(summary)
        return summary
      }
      H.onError(err)
      return { ok: false, error: err.message, kind: err.kind }
    }
  }

  /**
   * 中止当前循环。
   * ★ 必须同时做到三件事：中止 LLM 请求、停止动画、丢弃未执行的工具调用。
   */
  function stop() {
    aborted = true
    if (abortCtrl) { try { abortCtrl.abort() } catch (e) { /* ignore */ } }
    if (typeof onAbort === 'function') { try { onAbort() } catch (e) { /* ignore */ } }
  }

  function reset() {
    stop()
    history = []
    running = false
  }

  return {
    send, stop, reset,
    isRunning: () => running,
    getHistory: () => history.slice(),
    /** 供测试/调试：直接注入历史（如从存档恢复会话） */
    setHistory: (h) => { history = (h || []).slice() },
  }
}

export default createConversation
