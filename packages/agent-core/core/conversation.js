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

/** 默认最大轮数 */
export const DEFAULT_MAX_ROUNDS = 6
/**
 * 被长度上限截断时允许「接着写」的次数。
 * 给 2 次足够补完一段长推导，又不至于把一轮对话拖成没完没了的续写。
 */
export const DEFAULT_MAX_CONTINUES = 2

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
      lines.push('【知识库清单】（正文需用 loadKnowledge(id) 按需加载，不要臆测内容）')
      lines.push(idx.map((e) => `${e.id}｜${e.kp}｜${e.title}｜关键词:${(e.keywords || []).join('/')}`).join('\n'))
    }
  }
  const s = catalogs.skills
  if (s && typeof s.index === 'function') {
    const sk = s.index()
    if (sk.length) {
      lines.push('【教学技能清单】（完整步骤需用 loadSkill(name) 加载）')
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
  } = opts
  for (const [k, v] of Object.entries({ llm, buildSystem, getSettings, getTools, executeTool })) {
    if (v == null) throw new Error(`createConversation 需要 opts.${k}`)
  }
  const maxRounds = opts.maxRounds == null ? DEFAULT_MAX_ROUNDS : opts.maxRounds
  const maxContinues = opts.maxContinues == null ? DEFAULT_MAX_CONTINUES : opts.maxContinues

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
      const err = new Error('尚未配置 API Key，请在设置中填写你自己的模型密钥。')
      err.kind = 'no_key'
      H.onError(err)
      return { ok: false, error: err.message, kind: 'no_key' }
    }

    const executedTools = []
    let rounds = 0
    let continues = 0                    // 因长度截断而「接着写」的次数（有上限）
    // 留证据：空正文到底是怎么来的，靠这两个字段才能说清，而不是猜
    let lastFinishReason = null
    let lastUsage = null

    try {
      while (rounds < maxRounds) {
        if (aborted) break
        rounds++

        // ① 每轮重采快照（关键：工具可能已改变视图）
        let snapshotText = ''
        if (typeof getSnapshotText === 'function') {
          const t = getSnapshotText()
          if (t) snapshotText = '【当前视图快照（实时）】\n' + t
        }

        // ② 组装 messages
        const msgs = [{ role: 'system', content: buildSystem() }].concat(history)

        // 把快照作为一条临时的 system 注入（**不写入 history**，避免累积膨胀）
        if (snapshotText) {
          msgs.splice(1, 0, { role: 'system', content: snapshotText })
        }

        // ③ 调用（流式）
        // 记录本轮"流式吐出来的"思考长度，供第 ④ 步按差额补发
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

        if (aborted) break

        lastFinishReason = out.finishReason
        lastUsage = out.usage

        // 补发没流式吐出来的思考内容（只补差额，避免与已流出的部分重复）
        if (out.reasoning && out.reasoning.length > streamedReasoning.length) {
          const rest = out.reasoning.slice(streamedReasoning.length)
          H.onDelta({ type: 'reasoning', text: rest })
        }

        // 记录 assistant 消息（含工具调用），保持历史完整
        const asstMsg = { role: 'assistant', content: out.content || '' }
        // ★ 思考内容只**存档、不上行**（projection 会剥掉它）：存下来是为了刷新之后
        //   「思考」折叠区与"没有正文"的诊断说明能一字不差地重现——原先它随刷新丢失。
        if (streamedReasoning) asstMsg.reasoning = streamedReasoning
        if (out.toolCalls.length) {
          asstMsg.tool_calls = out.toolCalls.map((t) => ({
            id: t.id, type: 'function',
            function: { name: t.function.name, arguments: t.function.arguments },
          }))
        }
        history.push(asstMsg)
        if (out.content) H.onMessage({ role: 'assistant', content: out.content })

        // ⑤ 无工具调用 → 结束（截断的情况见第 ⑥ 步，要先处理掉）
        const truncated = out.finishReason === 'length'
        if (!out.toolCalls.length && !truncated) break

        // 逐个执行工具；若用户中止，**丢弃剩余未执行的调用**
        for (let i = 0; i < out.toolCalls.length; i++) {
          if (aborted) {
            // ★ 未执行的调用也要回灌一条结果，否则历史里 tool_calls 与 tool 消息不配对，
            //   下一次请求会被服务端判为格式非法（见文件头第 4 条）
            for (let k = i; k < out.toolCalls.length; k++) {
              history.push({
                role: 'tool', tool_call_id: out.toolCalls[k].id,
                content: JSON.stringify({ aborted: true, note: '用户已中止本次循环，该动作未执行' }),
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

        // ⑥ 长度截断（见文件头第 5 条）
        if (truncated) {
          H.onNotice({ kind: 'truncated', round: rounds, continues })
          if (continues < maxContinues) {
            continues++
            history.push({
              role: 'user',
              origin: 'continuation',
              content: '（上一条回复因长度上限被截断，请从中断处继续写完，不要重复已经写过的内容。'
                + '公式务必写成：行内 $…$ 不跨行，独立成行的 $$…$$ 独占一行。）',
            })
            continue
          }
          H.onNotice({ kind: 'truncated_giveup', continues })
          break
        }

        // 继续下一轮，让模型看到工具结果后再决定
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
