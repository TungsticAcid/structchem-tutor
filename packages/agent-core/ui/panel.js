/**
 * panel.js — 智能体面板：悬浮球 + 侧边抽屉 + 消息渲染 + 分镜控制条
 *
 * 悬浮球设计要求：
 *   · 可拖动、位置记忆、松手贴边吸附 —— 避免遮挡三维视图
 *   · 拖动与点击分离（位移超阈值判为拖动，不触发展开）
 *   · 有未读的主动提示时显示小圆点
 *
 * ★ 保留的坑位（都对应真实故障）：
 *   1. **流式正文用 rAF 合帧**：每个 token 都重解析整段 + 重排 KaTeX 会很卡，
 *      且中间态（公式只写了一半）本来就不该显示。
 *   2. **finish 前必须先掐掉排队中的那一帧**：否则 finish 已把正文刷好并清空
 *      pendingText，随后那一帧才执行，用空字符串再刷一次 —— 界面被刷成空泡。
 *      这是"模型没有输出"的一种成因，纯属自己造成的。
 *   3. **finish 时用非流式渲染兜一次**：万一最后一条公式没闭合（被截断），
 *      流式模式会整段吞掉它。
 *   4. **绝不留空白气泡**：正文为空时必须说清是哪一种情况，并把证据
 *      （finish_reason + token 用量）一并打出来，否则只能靠猜。
 *   5. **抽屉开合后要触发重绘**：径向/截面是手绘 Canvas，只在下次绘制时按
 *      clientWidth 重设位图尺寸，不触发就"看着发虚"。
 *   6. **分镜控制条存在的理由**：三维视图在抽屉外面，没有这条，用户只会看到
 *      画面自己在变，既不知道演到第几步、这一步在讲什么，也没有「下一步」可按。
 *
 * 来源：orbit/H5/js/agent/panel.js（783 行）的通用部分。抽掉了 orbit 私有内容：
 * 标题/图标/菜单/placeholder/问候语/ACTION_LABEL，以及对 window.Settings /
 * AgentCore / SceneBridge / QuestionEngine / DemoMode 的直接引用，全部改为配置注入。
 */

import { el, clear } from './dom.js'
import { createRenderer } from './renderer.js'

/** 抽屉开合过渡时长（毫秒）。重绘延时要略大于它 */
const LAYOUT_TRANSITION_MS = 240

/**
 * 创建面板。
 *
 * @param {Object} cfg
 * @param {Object} cfg.doc            document（可注入，便于测试）
 * @param {string} [cfg.title]        抽屉标题
 * @param {string} [cfg.iconSrc]      悬浮球图标
 * @param {string} [cfg.placeholder]  输入框提示
 * @param {Array}  [cfg.menu]         标题栏按钮 [{ label, onClick, cls }]
 * @param {Function|string} [cfg.greeting] 空态内容（返回 HTML 字符串）
 * @param {Object} [cfg.actionLabels] 动作名 → 中文名（有值才显示动作气泡）
 * @param {Function} [cfg.describeAction] 自定义动作描述 (name, params) => string
 * @param {string} [cfg.sequenceToolName='applySceneActions'] 承载"一次多动作"的工具名
 * @param {Function} [cfg.getShowReasoning] () => boolean
 * @param {string} [cfg.storageKey]   悬浮球位置记忆的键
 * @param {Object} [cfg.storyboard]   分镜引擎（提供 onProgress/prev/next/autoPlay/stop/replay/state）
 * @param {Function} [cfg.send]       (userText, handlers) => Promise —— 通常是 conversation.send
 * @param {Function} [cfg.hasKey]     () => boolean
 * @param {Function} [cfg.openSettings]
 * @param {Function} [cfg.afterLayoutChange] 开合抽屉后的重绘钩子
 */
export function createPanel(cfg = {}) {
  const doc = cfg.doc || (typeof document !== 'undefined' ? document : null)
  if (!doc) throw new Error('createPanel 需要 document（或用 cfg.doc 注入）')

  // 本地别名：把注入的 document 传给 el()，使注入真正生效
  // （否则调用方以为注入了，实际仍在用全局 document）
  const E = (tag, attrs, children) => el(tag, attrs, children, doc)

  const R = createRenderer({ katex: cfg.katex })
  const escapeHtml = R.escapeHtml
  const renderRich = R.renderRich

  const POS_KEY = cfg.storageKey || 'chem-agent.panel.fabPos'
  const SEQ_TOOL = cfg.sequenceToolName || 'applySceneActions'
  const ACTION_LABEL = cfg.actionLabels || {}
  const getShowReasoning = cfg.getShowReasoning || (() => true)
  const afterLayoutChange = cfg.afterLayoutChange || (() => {
    // 复用主控制器已有的 window resize 通路（它会 resize 三维并重绘全部图表）
    setTimeout(() => window.dispatchEvent(new Event('resize')), LAYOUT_TRANSITION_MS + 40)
  })

  let fab, drawer, msgBox, inputEl, sendBtn, stopBtn, dot
  let demoBar, demoIdx, demoText, demoNextHint
  let demoPrev, demoNext, demoAuto, demoStop, demoReplay, demoDismiss
  let layoutRedrawTimer = null
  let demoHideTimer = null
  let cur = null
  let disposed = false
  let offProgress = null

  // ---------------------------------------------------------------------------
  // 构建 UI
  // ---------------------------------------------------------------------------
  function build() {
    // ---- 悬浮球 ----
    fab = E('div', { class: 'agent-fab', title: cfg.fabTitle || '教学智能体（可拖动）' }, [
      // 图标为位图设计稿；圆形裁切会自然去掉四角的多余元素
      E('img', { class: 'agent-fab-img', src: cfg.iconSrc || '', alt: 'AI' }),
    ])
    dot = E('span', { class: 'agent-fab-dot' })
    fab.appendChild(dot)
    doc.body.appendChild(fab)

    // ---- 抽屉 ----
    drawer = E('div', { class: 'agent-drawer' })

    const head = E('div', { class: 'agent-head' })
    head.appendChild(E('span', { class: 'agent-head-title', text: cfg.title || '教学智能体' }))

    const acts = E('div', { class: 'agent-head-acts' })
    const mkBtn = (label, fn, cls) => {
      const b = E('button', { class: 'agent-tbtn ' + (cls || ''), text: label })
      b.onclick = fn
      return b
    }
    for (const m of (cfg.menu || [])) acts.appendChild(mkBtn(m.label, m.onClick, m.cls))
    acts.appendChild(mkBtn('✕', () => close(), 'agent-x'))
    head.appendChild(acts)
    drawer.appendChild(head)

    msgBox = E('div', { class: 'agent-msgs' })
    drawer.appendChild(msgBox)

    // ---- 演示分镜控制条 ----
    demoBar = E('div', { class: 'agent-demo hidden' })
    const demoTop = E('div', { class: 'agent-demo-top' })
    demoIdx = E('span', { class: 'agent-demo-idx', text: '' })
    const demoBtns = E('span', { class: 'agent-demo-btns' })
    const mkAct = (label, fn, cls) => {
      const b = E('button', { class: 'agent-btn sm ' + (cls || ''), text: label, type: 'button' })
      b.onclick = fn
      return b
    }
    const SB = cfg.storyboard
    demoPrev = mkAct('◀ 上一步', () => SB && SB.prev())
    demoNext = mkAct('下一步 ▶', () => SB && SB.next(), 'primary')
    demoAuto = mkAct('连续播放', () => SB && SB.autoPlay())
    demoStop = mkAct('■ 停止', () => SB && SB.stop(), 'stop')
    demoReplay = mkAct('↻ 重新演示', () => SB && SB.replay(), 'primary')
    demoDismiss = mkAct('结束', () => SB && SB.stop())
    ;[demoPrev, demoNext, demoAuto, demoStop, demoReplay, demoDismiss].forEach((b) => demoBtns.appendChild(b))
    demoTop.appendChild(demoIdx)
    demoTop.appendChild(demoBtns)
    demoText = E('div', { class: 'agent-demo-text', text: '' })
    demoNextHint = E('div', { class: 'agent-demo-hint hidden', text: '' })
    demoBar.appendChild(demoTop)
    demoBar.appendChild(demoText)
    demoBar.appendChild(demoNextHint)
    drawer.appendChild(demoBar)

    // ---- 输入区 ----
    const foot = E('div', { class: 'agent-foot' })
    inputEl = E('textarea', {
      class: 'agent-input-text', rows: '1',
      placeholder: cfg.placeholder || '问相关的问题，或让我演示…（Enter 发送，Shift+Enter 换行）',
    })
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() }
    })
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto'
      inputEl.style.height = Math.min(120, inputEl.scrollHeight) + 'px'
    })
    sendBtn = E('button', { class: 'agent-btn primary', text: '发送' })
    sendBtn.onclick = doSend
    stopBtn = E('button', { class: 'agent-btn stop hidden', text: '■ 停止' })
    stopBtn.onclick = () => { if (cfg.onStop) cfg.onStop() }
    foot.appendChild(inputEl)
    foot.appendChild(E('div', { class: 'agent-foot-btns' }, [stopBtn, sendBtn]))
    drawer.appendChild(foot)

    doc.body.appendChild(drawer)
    bindFabDrag()
    restoreFabPos()
    renderEmptyState()
  }

  // ---------------------------------------------------------------------------
  // 悬浮球拖动（拖动与点击分离 + 贴边吸附 + 位置记忆）
  // ---------------------------------------------------------------------------
  function bindFabDrag() {
    let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0

    fab.addEventListener('pointerdown', (e) => {
      dragging = true; moved = false
      sx = e.clientX; sy = e.clientY
      const r = fab.getBoundingClientRect()
      ox = r.left; oy = r.top
      if (fab.setPointerCapture) fab.setPointerCapture(e.pointerId)
      e.preventDefault()
    })
    fab.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const dx = e.clientX - sx, dy = e.clientY - sy
      if (!moved && Math.hypot(dx, dy) > 5) moved = true   // 超过阈值才算拖动
      if (!moved) return
      const w = fab.offsetWidth, h = fab.offsetHeight
      const x = Math.min(window.innerWidth - w - 4, Math.max(4, ox + dx))
      const y = Math.min(window.innerHeight - h - 4, Math.max(4, oy + dy))
      fab.style.left = x + 'px'
      fab.style.top = y + 'px'
      fab.style.right = 'auto'
      fab.style.bottom = 'auto'
    })
    fab.addEventListener('pointerup', () => {
      if (!dragging) return
      dragging = false
      if (!moved) { toggle(); return }        // 没移动 → 视为点击
      snapToEdge()
      saveFabPos()
    })
  }

  /** 松手后贴边吸附，避免长期停在视图中央遮挡 */
  function snapToEdge() {
    const w = fab.offsetWidth
    const r = fab.getBoundingClientRect()
    const cx = r.left + w / 2
    const toLeft = cx < window.innerWidth / 2
    fab.style.transition = 'left .18s ease'
    fab.style.left = (toLeft ? 10 : window.innerWidth - w - 10) + 'px'
    setTimeout(() => { fab.style.transition = '' }, 200)
  }

  function saveFabPos() {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({
        left: fab.style.left, top: fab.style.top, right: fab.style.right, bottom: fab.style.bottom,
      }))
    } catch (e) { /* 隐私模式等场景忽略 */ }
  }

  function restoreFabPos() {
    let p = null
    try { p = JSON.parse(localStorage.getItem(POS_KEY) || 'null') } catch (e) { p = null }
    if (p && p.left != null) {
      fab.style.left = p.left; fab.style.top = p.top
      fab.style.right = 'auto'; fab.style.bottom = 'auto'
      // 窗口尺寸变化后可能跑到屏外，钳回来
      const r = fab.getBoundingClientRect()
      if (r.left > window.innerWidth - 20 || r.top > window.innerHeight - 20) {
        fab.style.left = ''; fab.style.top = ''; fab.style.right = ''; fab.style.bottom = ''
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 开合
  // ---------------------------------------------------------------------------
  function redrawAfterLayout() {
    clearTimeout(layoutRedrawTimer)
    layoutRedrawTimer = setTimeout(afterLayoutChange, LAYOUT_TRANSITION_MS + 40)
  }

  function open(o) {
    drawer.classList.add('show')
    // ★ 让主布局侧移压缩，而不是把控制面板盖住
    doc.body.classList.add('agent-open')
    dot.classList.remove('show')
    // 由演示自动唤出时不要抢焦点——用户此刻的注意力在三维视图上
    if (!o || o.focus !== false) inputEl.focus()
    redrawAfterLayout()
  }
  function close() {
    drawer.classList.remove('show')
    doc.body.classList.remove('agent-open')
    redrawAfterLayout()
  }
  function toggle() { drawer.classList.contains('show') ? close() : open() }
  function markUnread() { if (!drawer.classList.contains('show')) dot.classList.add('show') }

  // ---------------------------------------------------------------------------
  // 消息渲染
  // ---------------------------------------------------------------------------
  function addMsg(html, cls) {
    const m = E('div', { class: 'agent-msg ' + (cls || ''), html })
    msgBox.appendChild(m)
    scrollDown()
    return m
  }
  function scrollDown() { msgBox.scrollTop = msgBox.scrollHeight }

  function addUser(text) { addMsg(escapeHtml(text), 'user') }

  /** 助手消息：思考折叠 + 流式正文 */
  function beginAssistant() {
    const wrap = E('div', { class: 'agent-msg assistant' })
    const think = E('details', { class: 'agent-think' })
    think.appendChild(E('summary', { text: '思考中…' }))
    const thinkBody = E('div', { class: 'agent-think-body' })
    think.appendChild(thinkBody)
    if (!getShowReasoning()) think.classList.add('hidden')
    const body = E('div', { class: 'agent-text' })
    wrap.appendChild(think)
    wrap.appendChild(body)
    msgBox.appendChild(wrap)
    scrollDown()

    let pendingText = ''
    let rafId = 0
    const raf = cfg.requestAnimationFrame || ((fn) => requestAnimationFrame(fn))
    const caf = cfg.cancelAnimationFrame || ((id) => cancelAnimationFrame(id))
    const flush = (streaming) => {
      rafId = 0
      body.innerHTML = renderRich(pendingText, { streaming })
      scrollDown()
    }

    return {
      wrap,
      setReasoning(text) { thinkBody.textContent = text; scrollDown() },
      setContent(text) {
        pendingText = text
        if (rafId) return
        rafId = raf(() => flush(true))
      },
      finish(o) {
        o = o || {}
        // ★ 先掐掉排队中的那一帧再收尾，否则它随后会用空串再刷一次 → 空泡
        if (rafId) { caf(rafId); rafId = 0 }
        // 收尾时用**非流式**渲染兜一次：万一最后一条公式没闭合（被截断），
        // 流式模式会把它整段吞掉，这里补显
        if (pendingText) { flush(false); pendingText = '' }

        const hasThink = !!thinkBody.textContent.trim()
        const sum = think.querySelector('summary')
        // ★ 绝不留给用户一个空白气泡
        if (!o.hasContent) {
          // ★ 把证据一并打出来：finish_reason 与 token 用量，否则只能靠猜
          const diag = []
          if (o.finishReason) diag.push('finish_reason: ' + o.finishReason)
          const u = o.usage || {}
          if (u.completion_tokens != null) {
            const det = u.completion_tokens_details || {}
            diag.push('输出 ' + u.completion_tokens + ' tokens'
              + (det.reasoning_tokens != null ? '（其中思考 ' + det.reasoning_tokens + '）' : ''))
          }
          if (u.prompt_tokens != null) diag.push('输入 ' + u.prompt_tokens + ' tokens')
          const tail = diag.length ? '<br><span class="agent-diag">' + escapeHtml(diag.join('　·　')) + '</span>' : ''

          let why
          if (o.finishReason === 'length') {
            why = '模型这次没有输出正文：输出被长度上限截断。'
              + '可在「设置 → 输出上限 max_tokens」调大后重试。'
          } else if (o.finishReason === 'tool_calls') {
            why = '模型这次只发起了动作调用，没写正文。动作可能已经排进演示队列了，看一下上面的动作气泡。'
          } else {
            why = '模型这次没有返回正文'
            why += hasThink ? '（只输出了思考内容）' : '（连思考内容也没有，可能是服务端返回异常）'
            why += '。可以再问一次，或换一个模型试试。'
          }
          body.innerHTML = '<div class="agent-warn">' + escapeHtml(why) + tail + '</div>'
        }
        think.removeAttribute('open')
        if (!hasThink) { think.classList.add('hidden') }
        else {
          sum.textContent = o.hasContent ? '已思考（点击展开）' : '模型实际输出的思考内容（点击展开）'
          // 没正文时把思考展开，让用户至少还能看到模型干了什么
          if (!o.hasContent) think.setAttribute('open', '')
        }
      },
      setError(text) { body.innerHTML = '<span class="agent-err">' + escapeHtml(text) + '</span>' },
    }
  }

  /** 动作气泡：把"智能体动了什么"显式呈现出来 */
  function addActionBubble(name, argsOrActions, result) {
    const ok = !(result && result.error)
    const d = E('details', { class: 'agent-action ' + (ok ? '' : 'bad') })

    // 承载"一次多动作"的工具，实际内容在 actions 数组里——那才是"智能体动的手"
    const acts = (name === SEQ_TOOL && Array.isArray(argsOrActions))
      ? argsOrActions
      : [{ action: name, params: argsOrActions }]

    const lines = acts.map((a) => describeAction(a.action, a.params || a))
    d.appendChild(E('summary', {
      html: '<span class="agent-act-dot"></span>' + escapeHtml(lines[0]) +
        (lines.length > 1 ? '<span class="agent-act-more">等 ' + lines.length + ' 个动作</span>' : ''),
    }))
    const body = E('div', { class: 'agent-act-body' })
    body.textContent = lines.join('\n') +
      (result ? '\n\n返回：' + JSON.stringify(result).slice(0, 400) : '')
    d.appendChild(body)
    msgBox.appendChild(d)
    scrollDown()
    return d
  }

  /** 动作的中文描述（可由 cfg.describeAction 完全接管，或靠 actionLabels 查表） */
  function describeAction(name, args) {
    if (typeof cfg.describeAction === 'function') return cfg.describeAction(name, args)
    const label = ACTION_LABEL[name] || name
    if (args && Object.keys(args).length) {
      const kv = Object.keys(args).map((k) => k + '=' + JSON.stringify(args[k])).join(' ')
      return label + '（' + kv + '）'
    }
    return label
  }

  function addChip(text, cls) {
    addMsg('<span class="agent-chip ' + (cls || '') + '">' + escapeHtml(text) + '</span>', 'chip-row')
  }

  function renderEmptyState() {
    clear(msgBox)
    const g = typeof cfg.greeting === 'function' ? cfg.greeting() : cfg.greeting
    addMsg('<div class="agent-hello">' + (g || '') + '</div>', 'assistant')
  }

  // ---------------------------------------------------------------------------
  // 发送
  // ---------------------------------------------------------------------------
  async function doSend() {
    const text = inputEl.value.trim()
    if (!text) return
    if (cfg.hasKey && !cfg.hasKey()) {
      addMsg('<span class="agent-err">尚未配置 API Key。请点右上角「设置」填写你自己的模型密钥（BYOK，本工具不提供额度）。</span>', 'assistant')
      if (cfg.openSettings) cfg.openSettings()
      return
    }
    inputEl.value = ''
    inputEl.style.height = 'auto'
    addUser(text)
    return runAgent(text)
  }

  /**
   * 跑一轮对话，并把过程映射到界面上。
   * 这是面板与对话循环之间唯一的接缝，也是"过程可视化"的全部所在。
   */
  async function runAgent(userText) {
    if (typeof cfg.send !== 'function') throw new Error('createPanel 需要 cfg.send')
    cur = beginAssistant()
    let reasoning = '', content = ''
    let lastBubble = null
    let truncated = false
    stopBtn.classList.remove('hidden')
    sendBtn.disabled = true

    const r = await cfg.send(userText, {
      onDelta(ev) {
        if (ev.type === 'reasoning') { reasoning += ev.text; cur.setReasoning(reasoning) }
        else if (ev.type === 'content') { content += ev.text; cur.setContent(content) }
      },
      // 截断之类的"非错误但需要说一声"的情况
      onNotice(n) {
        if (!n) return
        if (n.kind === 'truncated') {
          truncated = true
          addChip('输出触发长度上限，正在接着写…', 'warn')
        } else if (n.kind === 'truncated_giveup') {
          addChip('输出仍被截断，已停止续写；可在「设置 → 输出上限」调大后重试', 'warn')
        } else if (n.kind === 'param_downgrade') {
          addChip(n.text, 'warn')
        }
      },
      onToolCall(info) {
        // 只有"动手"的工具才显示气泡；查询/知识类属内部行为，静默
        if (info.name === SEQ_TOOL) {
          lastBubble = addActionBubble(SEQ_TOOL, (info.args && info.args.actions) || [])
        } else if (ACTION_LABEL[info.name]) {
          lastBubble = addActionBubble(info.name, info.args)
        }
      },
      onToolResult(info) {
        if (info.name !== SEQ_TOOL || !lastBubble) return
        const failed = info.result && info.result.failed
        if (failed && failed.length) {
          lastBubble.classList.add('bad')
          const s = lastBubble.querySelector('summary')
          if (s && s.insertAdjacentHTML) {
            s.insertAdjacentHTML('beforeend',
              '<span class="agent-act-err">· ' + failed.length + ' 个动作未执行</span>')
          }
        }
        lastBubble = null
      },
      onDone(summary) {
        cur.finish({
          hasContent: !!content.trim(),
          truncated,
          finishReason: summary && summary.finishReason,
          usage: summary && summary.usage,
        })
        if (summary && summary.aborted) addChip('已停止（本次循环剩余动作已丢弃）', 'warn')
      },
      onError(err) {
        cur.finish({ hasContent: true })     // 错误另行显示，别让 finish 再补一条"没正文"
        if (err.kind === 'no_key') {
          cur.setError('尚未配置 API Key，请点「设置」填写。')
          if (cfg.openSettings) cfg.openSettings()
        } else if (err.kind === 'auth') {
          cur.setError(err.message + '（点「设置」检查密钥）')
        } else {
          cur.setError('出错了：' + err.message)
        }
      },
    })

    stopBtn.classList.add('hidden')
    sendBtn.disabled = false
    cur = null
    return r
  }

  // ---------------------------------------------------------------------------
  // 演示分镜控制条（订阅分镜引擎的播放进度）
  //
  // 三种状态的显示逻辑：
  //   step    —— 第 i 步已执行完 → 显示这一步的旁白（用户对照刚看到的画面）
  //   waiting —— 停在闸门上 → 额外预告"下一步要做什么"，据此决定点不点
  //   auto    —— 连播中 → 收起「下一步 / 连播」，只留「停止」
  // ---------------------------------------------------------------------------
  function setBarMode(m) {
    if (!demoBar) return
    demoBar.classList.toggle('manual', m === 'manual')
    demoBar.classList.toggle('auto', m === 'auto')
    demoBar.classList.toggle('done', m === 'done')
    const isManual = (m === 'manual')
    const isDone = (m === 'done')
    demoPrev.classList.toggle('hidden', !(isManual || isDone))   // 结束后也能退回去重看
    demoNext.classList.toggle('hidden', !isManual)
    demoAuto.classList.toggle('hidden', !isManual)
    demoStop.classList.toggle('hidden', isDone)
    demoReplay.classList.toggle('hidden', !isDone)
    demoDismiss.classList.toggle('hidden', !isDone)
  }

  function renderStep(evt) {
    if (!demoBar) return
    clearTimeout(demoHideTimer)
    demoBar.classList.remove('hidden', 'bad')
    demoIdx.textContent = '第 ' + evt.index + '/' + evt.total + ' 步' + (evt.ok === false ? '（未执行）' : '')
    demoText.textContent = evt.speech || evt.label
    demoText.classList.toggle('muted', !evt.speech)
    if (evt.ok === false) demoBar.classList.add('bad')
    if (evt.manual === false) {
      setBarMode('auto')
    } else {
      setBarMode('manual')
      // 刚执行完这一步还没到闸门，此时不能回退（回退会与正在播放的动作打架）
      demoPrev.disabled = true
    }
  }

  function renderWaiting(evt) {
    if (!demoBar) return
    demoIdx.textContent = '已完成 ' + evt.index + '/' + evt.total + ' 步'
    setBarMode('manual')
    demoPrev.disabled = !evt.canPrev
    const nx = evt.next || {}
    demoNextHint.classList.remove('hidden')
    demoNextHint.textContent = '下一步：' + (nx.speech || nx.label || '')
  }

  /** 退回上一步之后：显示"这一步还没执行"，预告即将重播的那一步 */
  function renderBack(evt) {
    if (!demoBar) return
    demoBar.classList.remove('hidden', 'done', 'bad')
    demoIdx.textContent = '已退回 · 已完成 ' + evt.index + '/' + evt.total + ' 步'
    setBarMode('manual')
    demoPrev.disabled = !(evt.index > 0)
    const st = evt.step || {}
    demoText.textContent = st.speech || st.label || '（已回到上一步之前）'
    demoText.classList.toggle('muted', false)
    demoNextHint.classList.remove('hidden')
    demoNextHint.textContent = '下一步（重播）：' + (st.label || '')
  }

  function renderAuto(evt) {
    setBarMode('auto')
    demoIdx.textContent = '连续播放中 ' + evt.index + '/' + evt.total
    demoNextHint.classList.add('hidden')
  }

  function renderQueued(evt) {
    if (!demoBar) return
    demoBar.classList.remove('hidden')
    demoIdx.textContent = '已完成 ' + (evt.index || 0) + '/' + evt.total + ' 步 · 新增 ' + evt.added + ' 步'
    // 追加后"下一步"可能是刚入队的那一条，重新预告一次（否则预告会停留在旧的那条）
    const sb = cfg.storyboard
    const st = (sb && sb.state) ? sb.state() : null
    const nx = st && st.pending && st.pending[0]
    if (nx && demoBar.classList.contains('manual')) {
      demoNextHint.classList.remove('hidden')
      demoNextHint.textContent = '下一步：' + (nx.speech || nx.action)
    }
  }

  /** 播完：**不自动收起**，把「上一步 / 重新演示」留在手边 */
  function renderDone(evt) {
    if (!demoBar) return
    clearTimeout(demoHideTimer)
    demoNextHint.classList.add('hidden')
    demoBar.classList.remove('hidden')
    setBarMode('done')
    demoPrev.disabled = !(evt.canPrev !== false && evt.total > 0)
    demoIdx.textContent = '演示完成'
    demoText.textContent = '共 ' + ((evt && evt.total) || 0) + ' 步 · 可重新演示，或退回去重看某一步'
    demoText.classList.add('muted')
  }

  function hideBar() {
    if (!demoBar) return
    clearTimeout(demoHideTimer)
    demoNextHint.classList.add('hidden')
    demoBar.classList.add('hidden')
  }

  function bindStoryboardProgress() {
    const sb = cfg.storyboard
    if (!sb || typeof sb.onProgress !== 'function') return
    offProgress = sb.onProgress((evt) => {
      if (!evt || disposed) return
      switch (evt.phase) {
        case 'step':
          // 手动演示的第一帧就要让用户看见控制条，否则他会不知道要动手
          if (evt.manual !== false && !drawer.classList.contains('show')) open({ focus: false })
          renderStep(evt)
          break
        case 'waiting': renderWaiting(evt); break
        case 'back': renderBack(evt); break
        case 'replay':
          clearTimeout(demoHideTimer)
          demoBar.classList.remove('hidden', 'done')
          demoIdx.textContent = '重新演示 · 共 ' + evt.total + ' 步'
          demoText.textContent = '从头开始'
          demoText.classList.add('muted')
          break
        case 'auto': renderAuto(evt); break
        case 'queued': renderQueued(evt); break
        case 'done': renderDone(evt); break
        case 'stopped': hideBar(); break
        default: break
      }
    })
  }

  function init() {
    build()
    bindStoryboardProgress()
    window.addEventListener('resize', () => {
      const r = fab.getBoundingClientRect()
      if (r.left > window.innerWidth - 20) snapToEdge()
    })
  }

  /** 卸载：解绑订阅，避免反复进出页面时累积（分镜引擎的 onProgress 返回取消函数） */
  function destroy() {
    disposed = true
    if (typeof offProgress === 'function') { offProgress(); offProgress = null }
  }

  return {
    init, destroy, open, close, toggle, markUnread, renderEmptyState,
    addMsg, addUser, addChip, addActionBubble, beginAssistant, runAgent, send: doSend,
    renderRich,
    /** 供测试/调试取用内部节点 */
    nodes: () => ({ fab, drawer, msgBox, inputEl, sendBtn, stopBtn, dot, demoBar }),
    setInput: (v) => { inputEl.value = v },
  }
}

export default createPanel
