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
 * @param {Object} [cfg.store]        对话存储（分支树）。给了它才有「分支切换 / 多会话 /
 *                                    消息工具条 / 刷新后卡片仍在」；不给时退化成单条线。
 */
export function createPanel(cfg = {}) {
  const doc = cfg.doc || (typeof document !== 'undefined' ? document : null)
  if (!doc) throw new Error('createPanel 需要 document（或用 cfg.doc 注入）')

  // 本地别名：把注入的 document 传给 el()，使注入真正生效
  // （否则调用方以为注入了，实际仍在用全局 document）
  const E = (tag, attrs, children) => el(tag, attrs, children, doc)

  // ---------------------------------------------------------------------------
  // 取词函数（i18n 接缝）
  // ---------------------------------------------------------------------------
  /**
   * ★ 面板**绝不 import i18n** —— 它被 chem-agent 之外的宿主复用，把 `@i18n`
   *   变成硬依赖，就等于把"可复用组件"降级成"只能在本产品里跑"。
   *   宿主可以注入 `cfg.t`（与 packages/i18n 的 `t` 同签名：`(key, vars) => string`，
   *   支持 `{name}` 占位符）。
   *
   * ★ 没注入时回退到"就地填占位符"，而面板交给 T 的键**就是那句中文原文**
   *   （`'第 {index}/{total} 步'`）—— 于是老宿主拿到的字符串与改造前**逐字节相同**。
   *
   * ★ 为什么回退**不是** `(s) => s`：那样 `T('第 {index}/{total} 步', {…})` 会把
   *   带大括号的模板原样返回，老宿主的界面直接变成一堆 `{index}` —— "行为不变"
   *   就不成立了。回退必须自己把占位符填掉。
   */
  const fillVars = (s, vars) => {
    const str = String(s == null ? '' : s)
    if (!vars) return str
    return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])))
  }
  const T = (typeof cfg.t === 'function') ? cfg.t : fillVars

  const R = createRenderer({ katex: cfg.katex })
  const escapeHtml = R.escapeHtml
  const renderRich = R.renderRich

  /**
   * 悬浮球位置的存储键。
   *
   * ★ **必须由宿主注入，没有缺省值**（契约 HOST_REQUIREMENTS_SHAPE.storage）。
   *   原先缺省是 `chem-agent.panel.fabPos` —— 那**恰好等于壳实际用的键**，
   *   于是「忘了注入」不会有任何症状，只会让组件与壳悄悄共享一个存储项。
   *   而同一台机器上跑两个壳（apps/web 与某个模块的独立页）时，
   *   两者的悬浮球位置会互相覆盖，且**谁都查不出来**。
   *
   * ★ 「随便取个中性名当缺省」不算修好：那只是把「悄悄共享」换成「悄悄各存各的」，
   *   同样查不出来。所以这里**直接抛错**。
   */
  if (!cfg.storageKey) {
    throw new Error('createPanel 需要 cfg.storageKey：存储命名空间必须由宿主注入'
      + '（契约 HOST_REQUIREMENTS_SHAPE.storage 要求缺省值不得指向任何具体命名空间）。'
      + '例如：storageKey: \'chem-agent.panel.fabPos\'')
  }
  const POS_KEY = cfg.storageKey
  const SEQ_TOOL = cfg.sequenceToolName || 'applySceneActions'
  const ACTION_LABEL = cfg.actionLabels || {}
  /**
   * 分镜引擎的**顶层**别名。
   *
   * ★ 这里必须有一份：`setBarMode` 与 `applyProgress` 在 `build()` **之外**，
   *   而原先只有 `build()` 里那个 `const SB = cfg.storyboard` —— 于是它们在
   *   `SB.state()` 那一行抛 `ReferenceError: SB is not defined`。
   *   症状很隐蔽：控制条的按钮显隐都已经改完了（那几行在抛错点之前），
   *   只有最后一行「↩ 回到演示前」的显隐没执行，异常却会顺着
   *   `onProgress` 回调抛回分镜引擎。测试也抓不到（离线测试从不触发进度事件）。
   */
  const SB = cfg.storyboard || null
  const getShowReasoning = cfg.getShowReasoning || (() => true)
  // 对话存储（分支树）。为 null 时面板仍可用，只是没有分支片/多会话/消息工具条。
  const store = cfg.store || null
  // 演示收藏夹（存本机）。为 null 时只是没有「收藏」按钮与收藏列表。
  const favorites = cfg.demoFavorites || null
  const afterLayoutChange = cfg.afterLayoutChange || (() => {
    // 复用主控制器已有的 window resize 通路（它会 resize 三维并重绘全部图表）
    setTimeout(() => window.dispatchEvent(new Event('resize')), LAYOUT_TRANSITION_MS + 40)
  })

  let fab, drawer, msgBox, inputEl, sendBtn, stopBtn, dot
  let headTitleEl
  let demoBar, demoIdx, demoText, demoNextHint
  let demoPrev, demoNext, demoAuto, demoManual, demoStop, demoReplay, demoRestore, demoDismiss
  let layoutRedrawTimer = null
  let demoHideTimer = null
  let cur = null
  let disposed = false
  let offProgress = null
  /**
   * 最近一次分镜进度事件。
   * ★ 换语言时要拿它把控制条**按新语言重画一遍** —— 步号/旁白提示是 `t()` 现算的，
   *   已经写进 DOM 的那份 `第 3/6 步` 不会被扫描替换回头（它不在 text 表里）。
   *   不重画的表现是"切了语言，控制条还是旧语言"，而且**不报错**。
   */
  let lastProgress = null

  // ---------------------------------------------------------------------------
  // 构建 UI
  // ---------------------------------------------------------------------------
  function build() {
    // ---- 悬浮球 ----
    fab = E('div', { class: 'agent-fab', title: cfg.fabTitle || T('教学智能体（可拖动）') }, [
      // 图标为位图设计稿；圆形裁切会自然去掉四角的多余元素。
      // ★ 没给 iconSrc 时**不建 img**，退回文字——而不是放一个 `src=''` 的 img。
      //   空 src 会让浏览器把"当前页面 URL"当成图片地址去请求，于是每次打开
      //   都报一个 404（实测踩到：悬浮球显示成破图）。图标是宿主**可选**提供的，
      //   不该因为没提供就报错。
      cfg.iconSrc
        ? E('img', { class: 'agent-fab-img', src: cfg.iconSrc, alt: '' })
        : E('span', { class: 'agent-fab-text', text: cfg.fabText || 'AI' }),
    ])
    dot = E('span', { class: 'agent-fab-dot' })
    fab.appendChild(dot)
    doc.body.appendChild(fab)

    // ---- 抽屉 ----
    drawer = E('div', { class: 'agent-drawer' })

    // ★ 可调整大小：电脑端拖**左边缘**调宽度、手机端拖**顶边缘**调高度。
    //   拖拽直接改 CSS 变量 --agent-w / --agent-h，晶体视图经
    //   `body.agent-open .viewer-page` 的 calc() 自动跟随，无需 JS 布局。
    const resizeHandle = E('div', { class: 'agent-resize', title: '拖拽调整大小' })
    drawer.appendChild(resizeHandle)
    {
      let dragging = false
      const isMobile = () => !!(doc.defaultView && doc.defaultView.matchMedia
        && doc.defaultView.matchMedia('(max-width: 640px)').matches)
      const pt = (e) => {
        if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
        return { x: e.clientX, y: e.clientY }
      }
      const onMove = (e) => {
        if (!dragging) return
        e.preventDefault()
        const { x, y } = pt(e)
        const vw = doc.defaultView ? doc.defaultView.innerWidth : 0
        const vh = doc.defaultView ? doc.defaultView.innerHeight : 0
        if (isMobile()) {
          // 手机端：高度 = 屏幕底到拖拽点（夹在 30vh–90vh）
          const h = Math.max(30, Math.min(90, Math.round((vh - y) / vh * 100)))
          doc.documentElement.style.setProperty('--agent-h', h + 'vh')
        } else {
          // 电脑端：宽度 = 屏幕右缘到拖拽点（夹在 280px–90vw）
          const w = Math.max(280, Math.min(vw * 0.9, Math.round(vw - x)))
          doc.documentElement.style.setProperty('--agent-w', w + 'px')
        }
      }
      const onUp = () => {
        if (!dragging) return
        dragging = false
        // ★ 松手后恢复过渡：拖拽期间给它设了 `agent-resizing`（去掉 transition），
        //   否则每帧都触发 0.24s 的动画，滑块跟手但画面滞后、看起来"拖不动"
        if (doc.body) doc.body.classList.remove('agent-resizing')
        redrawAfterLayout()   // 拖完重新取景（晶体视图尺寸已变）
      }
      resizeHandle.addEventListener('mousedown', () => {
        dragging = true
        if (doc.body) doc.body.classList.add('agent-resizing')
      })
      resizeHandle.addEventListener('touchstart', (e) => {
        dragging = true
        if (doc.body) doc.body.classList.add('agent-resizing')
        e.preventDefault()
      }, { passive: false })
      doc.addEventListener('mousemove', onMove)
      doc.addEventListener('touchmove', onMove, { passive: false })
      doc.addEventListener('mouseup', onUp)
      doc.addEventListener('touchend', onUp)
    }

    const head = E('div', { class: 'agent-head' })
    headTitleEl = E('span', { class: 'agent-head-title', text: cfg.title || T('教学智能体') })
    head.appendChild(headTitleEl)

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
    demoPrev = mkAct('◀ 上一步', () => SB && SB.prev())
    demoNext = mkAct('下一步 ▶', () => SB && SB.next(), 'primary')
    demoAuto = mkAct('连续播放', () => SB && SB.autoPlay())
    // ★ 「⏸ 逐步」是**连播切回逐步的唯一出口**。没有它，学生点过一次「连续播放」
    //   之后，此后所有演示都只能一路播完——界面上再没有任何按钮能把节奏改回来
    //   （orbit 实测过这条：manual 只降不升）。
    demoManual = mkAct('⏸ 逐步', () => SB && SB.setManual && SB.setManual(true))
    demoStop = mkAct('■ 停止', () => SB && SB.stop(), 'stop')
    demoReplay = mkAct('↻ 重新演示', () => SB && SB.replay(), 'primary')
    // ★ 「收起」只隐藏这条控制条，**不动播放状态**。原先它调的是 stop()，于是学生
    //   "看完顺手收起"之后就再也重播不了（队列被清空了）——那条演示其实还在记录里，
    //   只是界面上已经没有入口把它放回来。
    demoDismiss = mkAct('收起', () => hideBar())
    /**
     * 「↩ 回到演示前」——一键把视图还原到这一轮演示**开始之前**的样子。
     *
     * ★ 为什么需要它：演示会改动学生费心调好的图层、外观与视角，还可能跳到别的页面
     *   （`openCompareView` 会跳去对比页）。播完之后他要的是"刚才那个样子"。
     *   「上一步」做不到这件事——它一次只退一格，且演示 `stop()` 之后快照就被清空了。
     *
     * ★ 恢复前必须**先 stop()**：否则循环还在跑，恢复完的下一步又会把画面改回去。
     * ★ 演示若跳到过别的页面，要先按快照里的 `route` 跳回来再恢复
     *   （视图状态是落在**那个页面**上的，在别的页面上恢复不了）。
     */
    demoRestore = mkAct('↩ 回到演示前', async () => {
      if (!SB) return
      SB.stop()
      const snap = typeof SB.beforeSnapshot === 'function' ? SB.beforeSnapshot() : null
      const cur = (typeof location !== 'undefined') ? location.hash : ''
      if (snap && snap.route && cur && snap.route !== cur) {
        location.hash = snap.route
        // 等路由把页面换回来并注册新的适配器（`registerViewerPage` 在 mount 末尾）
        await new Promise((r) => setTimeout(r, 320))
      }
      const r = SB.restoreBefore()
      addChip(r.ok ? '已回到演示前的状态' : T('恢复失败：{error}', { error: r.error }), r.ok ? 'info' : 'warn')
      if (r.ok) hideBar()
    })
    ;[demoPrev, demoNext, demoAuto, demoManual, demoStop, demoReplay, demoRestore, demoDismiss]
      .forEach((b) => demoBtns.appendChild(b))
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
      placeholder: cfg.placeholder || T('问相关的问题，或让我演示…（Enter 发送，Shift+Enter 换行）'),
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
  function addMsg(html, cls, mid) {
    const m = E('div', { class: 'agent-msg ' + (cls || ''), html })
    // ★ 记住它对应树里的哪个节点：重答 / 编辑重问 / 分支片都靠它定位。
    //   不传 mid 时行为与从前完全一致（面板可以脱离分支树单独使用）。
    if (mid) m.dataset.mid = mid
    msgBox.appendChild(m)
    scrollDown()
    return m
  }
  function scrollDown() { msgBox.scrollTop = msgBox.scrollHeight }

  /**
   * 往消息流追加一张**卡片**（任意 HTML），返回元素引用。
   *
   * ★ 为什么需要它，而不是让调用方自己 document.querySelector 找回卡片元素：
   *   参考实现的题目卡是这么做的——`document.querySelector('.agent-msg.assistant:last-of-type')`
   *   拿到刚插入的元素再绑定选项按钮。那个写法有个致命脆弱点：
   *   一旦模型在同一轮里又插了一条 assistant 消息（完全可能，它可能先说一句再出题），
   *   `last-of-type` 就指向了**别的元素**，四个选项按钮全部绑不上——
   *   而**页面不报错、只是点了没反应**。这类"看起来正常、实际失效"的故障最难查。
   *   `addCard` 直接返回元素引用，从根上消灭这个失败模式。
   *
   * @param {string} html
   * @param {string} [cls] 附加类名
   * @returns {HTMLElement}
   */
  function addCard(html, cls, opts) {
    const el = E('div', { class: 'agent-card' + (cls ? ' ' + cls : '') })
    el.innerHTML = html
    msgBox.appendChild(el)
    scrollDown()
    // ★ **持久化展示卡**的能力已就绪：`role:'card'` 节点留在对话链上、参与路径，
    //   但被 `projection()` 过滤掉——于是"卡片能持久化"与"卡片不污染协议历史"
    //   可以同时成立。
    //   ⚠️ 但**当前没有调用方传 `opts.kind`**，这是刻意的：题目卡/反馈卡的交互
    //   （点选项判分）在恢复时**无法重新绑定事件**，持久化之后只会变成一个
    //   "能点、但点了没反应"的陷阱——那正是本仓库记过的、最难排查的一类故障。
    //   要真正启用，得同时提供"卡片恢复钩子"（由 quiz/ui.js 注册一个重建函数）。
    if (opts && opts.kind && store && typeof store.appendCard === 'function') {
      const raw = String(html)
      store.appendCard(opts.kind, Object.assign({}, opts.meta || {}, {
        html: raw.length > 8192 ? raw.slice(0, 8192) : raw,
      }))
    }
    return el
  }

  function addUser(text, mid) { return addMsg(escapeHtml(text), 'user', mid) }

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
            diag.push(T('输出 {n} tokens', { n: u.completion_tokens })
              + (det.reasoning_tokens != null ? T('（其中思考 {n}）', { n: det.reasoning_tokens }) : ''))
          }
          if (u.prompt_tokens != null) diag.push(T('输入 {n} tokens', { n: u.prompt_tokens }))
          const tail = diag.length ? '<br><span class="agent-diag">' + escapeHtml(diag.join('　·　')) + '</span>' : ''

          let why
          if (o.finishReason === 'length') {
            why = T('模型这次没有输出正文：输出被长度上限截断。可在「设置 → 输出上限 max_tokens」调大后重试。')
          } else if (o.finishReason === 'tool_calls') {
            why = T('模型这次只发起了动作调用，没写正文。动作可能已经排进演示队列了，看一下上面的动作气泡。')
          } else {
            // ★ 有思考 / 连思考都没有：两条都是**完整句子**，不拼半截
            //   （拼半截的话译文语序会错位，而且扫描替换也对不上）
            why = hasThink
              ? T('模型这次没有返回正文（只输出了思考内容）。可以再问一次，或换一个模型试试。')
              : T('模型这次没有返回正文（连思考内容也没有，可能是服务端返回异常）。可以再问一次，或换一个模型试试。')
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

  /**
   * 动作气泡：把"智能体动了什么"显式呈现出来。
   *
   * ★ 每一行是**独立元素**（`.agent-act-row[data-i]`），而不是一整块 textContent
   *   ——因为要按行挂「引用」按钮：气泡渲染的是模型给的**原始**动作数组，而队列里
   *   只有校验通过的部分，两者会错位；第 i 行究竟属于演示的第几步，由工具回执里的
   *   `perAction[i]` 给出（见 enrichActionBubble）。
   */
  function addActionBubble(name, argsOrActions, result) {
    const ok = !(result && result.error)
    const d = E('details', { class: 'agent-action ' + (ok ? '' : 'bad') })

    // 承载"一次多动作"的工具，实际内容在 actions 数组里——那才是"智能体动的手"
    const acts = (name === SEQ_TOOL && Array.isArray(argsOrActions))
      ? argsOrActions
      : [{ action: name, params: argsOrActions }]
    d._acts = acts                        // 供 enrichActionBubble 逐行挂按钮

    const lines = acts.map((a) => describeAction(a.action, a.params || a))
    d.appendChild(E('summary', {
      html: '<span class="agent-act-dot"></span>' + escapeHtml(lines[0]) +
        (lines.length > 1 ? '<span class="agent-act-more">' + escapeHtml(T('等 {n} 个动作', { n: lines.length })) + '</span>' : ''),
    }))
    const body = E('div', { class: 'agent-act-body' })
    // 逐一行（带序号，便于与「演示 #N 的第 M 步」对照）
    acts.forEach((a, i) => {
      body.appendChild(E('div', { class: 'agent-act-row', 'data-i': String(i) }, [
        E('span', { class: 'agent-act-txt', text: (i + 1) + '. ' + lines[i] }),
      ]))
    })
    if (result) {
      body.appendChild(E('div', {
        class: 'agent-act-ret',
        text: T('返回：{v}', { v: JSON.stringify(result).slice(0, 400) }),
      }))
    }
    d.appendChild(body)
    d._body = body
    msgBox.appendChild(d)
    scrollDown()
    return d
  }

  /**
   * 把工具回执里的 `perAction` / `demoId` 落到气泡上：
   *   · 校验失败的那一行标出「未执行：原因」
   *   · 每一行挂「引用」按钮（把"演示 #N 的第 M 步"写进输入框）
   *   · 气泡底部挂「↻ 重播这个演示」
   *
   * ★ 为什么按钮要挂在**行**上：学生最容易产生的错位感是"我明明说的是第 3 步，
   *   它却改了第 5 步"。让他直接点那一行的「引用」，括号里的步号由 `perAction` 算出，
   *   就不会指错；而这段文本随工具回执存档，**刷新之后引用依然准确**。
   */
  function enrichActionBubble(d, result) {
    if (!d || !d._acts || !result || !d._body) return
    const perAction = result.perAction
    const demoId = result.demoId
    const total = result.totalSteps
    const rows = d._body.querySelectorAll('.agent-act-row')
    for (let i = 0; i < rows.length; i++) {
      const pa = Array.isArray(perAction) ? perAction[i] : null
      if (pa && pa.ok === false) {
        rows[i].classList.add('skipped')
        rows[i].appendChild(E('span', {
          class: 'agent-act-skip',
          text: T('未执行：{reason}', { reason: pa.error || T('参数不合法') }),
        }))
        continue
      }
      if (!demoId) continue
      // perAction 给的是绝对步号；它缺失时退回"行号即步号"（两者通常一致）
      const stepIndex = (pa && pa.stepIndex != null) ? pa.stepIndex : i
      const btn = E('button', {
        class: 'agent-act-btn', text: '引用', type: 'button',
        title: '引用这一步提整改意见',
      })
      btn.onclick = () => quoteStep(d._acts[i], { demoId, stepIndex, total })
      rows[i].appendChild(btn)
    }
    if (!demoId) return
    const foot = E('div', { class: 'agent-act-foot' })
    const rb = E('button', { class: 'agent-act-btn', text: '↻ 重播这个演示', type: 'button' })
    rb.onclick = () => { const SB = cfg.storyboard; if (SB && SB.replay) SB.replay(demoId) }
    foot.appendChild(rb)
    // ★ 「收藏」是**人的判断**——哪条演示值得反复看，程序猜不出来（见 store/demo-favorites.js）。
    //   存的是**步骤清单**而不是画面截图，所以以后回放仍然是对的（截图会过时）。
    if (favorites) {
      const fb = E('button', {
        class: 'agent-act-btn', text: '☆ 收藏', type: 'button',
        title: '把这条演示存到本机，之后随时可重播',
      })
      fb.onclick = () => {
        const SB = cfg.storyboard
        const rec = SB && SB.getDemo ? SB.getDemo(demoId) : null
        if (!rec || !rec.steps || !rec.steps.length) { fb.textContent = '演示已失效'; return }
        const r = favorites.save('', rec.steps.map((s) => ({
          action: s.name || s.action, params: s.params, speech: s.speech,
        })), { origin: rec.origin })
        fb.textContent = r.ok ? '★ 已收藏' : '（收藏失败）'
        fb.disabled = true
      }
      foot.appendChild(fb)
    }
    // ★ 挂到气泡**外面**（作为它的下一个兄弟），而不是 details 内部。
    //   动作气泡默认是**折叠**的（`<details>` 只露出一行摘要），把按钮塞在里面
    //   等于没放——学生看不到「重播」「收藏」，反馈就是"放不了之前的演示"
    //   （实测：按钮一直在，只是藏起来了）。
    if (d.parentNode && d.parentNode.insertBefore) d.parentNode.insertBefore(foot, d.nextSibling)
    else d._body.appendChild(foot)
  }

  /**
   * 把"引用这一步"写成一句**可寻址**的话放进输入框，学生接着写整改意见即可。
   * ★ 写的是结构化指认（演示 #N 的第 M 步），不是自然语言转述：模型据此能精确
   *   调到 `reviseDemo` 的 demoId 与 index，不必猜。
   */
  function quoteStep(act, opts) {
    if (!inputEl) return
    const demoId = opts && opts.demoId
    const stepIndex = (opts && opts.stepIndex) || 0
    const total = (opts && opts.total) || '?'
    const what = act ? describeAction(act.action, act.params || act) : ''
    const n = String(demoId).replace(/^d/, '')
    // ★ 整句一次成型：拆成 `'已演示 #' + n + ' 的第 ' ...` 那种写法，译文语序没法处理
    inputEl.value = T('【整改演示】演示 #{id} 的第 {index} 步（共 {total} 步）{what}', {
      id: n, index: stepIndex + 1, total,
      what: what ? T('「{what}」', { what }) : '',
    }) + '\n' + T('我想改成：')
    inputEl.focus()
    if (inputEl.setSelectionRange) {
      const p = inputEl.value.length
      inputEl.setSelectionRange(p, p)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 分支 / 会话 / 消息工具条
  //
  // ★ 这一组能力都建立在"对话是一棵树"之上（见 store/conversation-store.js）：
  //   · 编辑某条提问 = 从它那里**分叉**（原分支一个字节不删）
  //   · 切换分支 = 把叶指针移过去，然后按新路径整体重渲染
  //   · 复制原文 = 取**存档里的源文本**，绝不从 DOM 反解析
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 复制到剪贴板。
   * ★ 走"隐藏 textarea + execCommand"降级而不是只用 `navigator.clipboard`：后者要求
   *   secure context，而本工具定位是纯前端、可 `file://` 直接打开——在那里
   *   `navigator.clipboard` 是 undefined，直接调用会**静默失败**（按钮点了没反应）。
   * @returns {boolean}
   */
  function copyText(text, btn) {
    const t = String(text == null ? '' : text)
    let ok = false
    try {
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        navigator.clipboard.writeText(t)
        ok = true
      }
    } catch (e) { ok = false }
    if (!ok) {
      try {
        const ta = E('textarea', { class: 'agent-copy-src' })
        ta.value = t
        doc.body.appendChild(ta)
        ta.select()
        ok = !!(doc.execCommand && doc.execCommand('copy'))
        doc.body.removeChild(ta)
      } catch (e) { ok = false }
    }
    if (btn && btn.textContent != null) {
      const old = btn.textContent
      btn.textContent = ok ? '已复制' : '复制失败'
      setTimeout(() => { btn.textContent = old }, 1200)
    }
    return ok
  }

  /**
   * 给一条消息挂工具条（复制 / 编辑重问 / 另起分支 / 重答）。
   * @param {HTMLElement} wrap    消息元素
   * @param {string} mid          节点 id（树里的）
   * @param {'user'|'assistant'} role
   * @param {string} srcText      **存档里的源文本**（不是 DOM 文本）
   */
  function attachActs(wrap, mid, role, srcText) {
    if (!wrap || !srcText || !store) return
    const bar = E('div', { class: 'agent-msg-acts' })
    const mk = (label, fn, title) => {
      const b = E('button', { class: 'agent-act-btn', text: label, type: 'button', title: title || label })
      b.onclick = fn
      return b
    }
    // ★ 复制的是**源文本**：DOM 里是 KaTeX 渲染后的 HTML，`textContent` 会把
    //   `$\frac{1}{2}$` 变成 `21`——公式源码彻底丢失，而学生复制它正是为了贴到作业里。
    bar.appendChild(mk('复制', (ev) => copyText(srcText, ev && ev.target), '复制原文（含公式源码）'))
    if (role === 'user') {
      bar.appendChild(mk('编辑重问', () => editUserMsg(mid, srcText), '改一下这句，从它这里重新问'))
      bar.appendChild(mk('另起分支', () => forkInto(mid), '保留这句，在它之后另开一条分支'))
    } else if (role === 'assistant') {
      bar.appendChild(mk('重答', () => reanswer(mid), '让模型重新回答这一条'))
    }
    wrap.appendChild(bar)
  }

  /**
   * 有回合在跑就先停掉。
   * ★ 切分支 / 编辑重问 / 重答**都必须先停**：否则旧回合结束时的那次"整体落盘"，
   *   会按**新的**叶指针把尾巴接上去——接错线且不报错。
   */
  function stopRunning() {
    try { if (cfg.onStop) cfg.onStop() } catch (e) { /* 停不下来也不该阻断后续操作 */ }
  }

  /** 把某条提问填回输入框，并把叶指针退到它的父节点（= 从那里重新问） */
  function editUserMsg(mid, text) {
    if (!store) return
    const n = store.nodeById(mid)
    if (!n) return
    stopRunning()
    inputEl.value = text || n.content || ''
    store.branchFrom(n.parent)
    renderPath()
    inputEl.focus()
    if (inputEl.setSelectionRange) {
      const p = inputEl.value.length
      inputEl.setSelectionRange(p, p)
    }
    addChip('已把这句填回输入框——改完发送，原来的回答会作为另一条分支保留', 'info')
  }

  /** 另起分支：保留这句，在它**之后**开一条新的（原来的回答不删） */
  function forkInto(mid) {
    if (!store) return
    stopRunning()
    store.branchFrom(mid)
    renderPath()
    addChip('已在这条之后另开一条分支——接着说即可（原来的仍在）', 'info')
  }

  /** 重答：回到这条回答**对应的那次提问**，把同一句话重发一次 */
  function reanswer(mid) {
    if (!store || typeof cfg.send !== 'function') return
    const path = store.path()
    const i = path.findIndex((x) => x.id === mid)
    if (i < 0) return
    let ask = null
    for (let k = i; k >= 0; k--) {
      if (path[k].role === 'user' && path[k].origin !== 'continuation') { ask = path[k]; break }
    }
    if (!ask) return
    stopRunning()
    // ★ 从**提问本身**分叉（而不是提问的父节点）：这样"提问"是两条分支的公共前缀，
    //   树里只有**一个**提问节点，旧回答与新回答作为它的两个儿子并列——这正是"重答"
    //   的语义（重新回答这一个问题）。
    //   若从提问**之前**分叉，提问会被重新 append 一遍，树里出现两个相同的提问，
    //   新回答看起来是"接着旧对话聊"，而不是"重答"（实测反馈）。
    store.branchFrom(ask.id)
    renderPath()
    // ★ 发起重答：不重复发"提问"，而是给一条**不显示**的内部指令。
    //   origin:'internal' 的消息进协议历史（模型据此知道"上面这个问题要重答"），
    //   但 renderPath 不渲染它（见 renderPath 对 internal 的跳过）——学生看到的是
    //   连续的"提问 → 新回答"，中间不会冒出一句奇怪的话。
    cfg.send(T('（请重新回答我上面的那个问题，给出一份全新的回答。）'), { origin: 'internal' })
  }

  /** 某条分支有多长（从它往下走到底） */
  function countBranch(nodeId) {
    let n = 1
    let cur = nodeId
    let guard = 0
    while (guard++ < 500) {
      const kids = store.childrenOf(cur)
      if (!kids.length) break
      cur = kids[kids.length - 1]
      n++
    }
    return n
  }

  /**
   * 分支切换片：在一个分叉点处列出各条分支，点一下就切过去。
   * ★ 为什么必须有它：切到另一条分支后，原来那个分叉点就不在**当前路径**上了，
   *   只靠消息区**找不到回去的路**。所以分叉片留它所在的那条线上，作为回程标记。
   */
  function branchBar(fork) {
    const bar = E('div', { class: 'agent-branch-bar' })
    const kids = fork.children || []
    bar.appendChild(E('span', {
      class: 'agent-branch-label',
      text: T('⑂ 这处分出 {n} 条：', { n: kids.length }),
    }))
    const onPath = new Set(store.path().map((x) => x.id))
    kids.forEach((cid, i) => {
      const n = store.nodeById(cid)
      if (!n) return
      const tip = String(n.content || '').replace(/\s+/g, ' ').slice(0, 14) || T('（无正文）')
      const isCur = onPath.has(cid)
      const chip = E('button', {
        class: 'agent-branch-chip' + (isCur ? ' active' : ''),
        text: T('{i}. {tip} · {n} 条', { i: i + 1, tip, n: countBranch(cid) }),
        type: 'button',
        title: isCur ? '当前正在这条分支上' : '切到这条分支',
      })
      if (isCur) chip.disabled = true
      else {
        chip.onclick = () => {
          stopRunning()
          store.switchLeaf(cid)
          renderPath()
        }
      }
      bar.appendChild(chip)
    })
    return bar
  }

  /**
   * 从当前分支的历史重建**演示记录**（幂等）。
   * ★ 抽出来是因为它必须与 renderPath 同步执行：对话历史是"模型下发过哪些动作"
   *   的唯一来源，而"刷新后还能重播/引用"完全依赖它。
   */
  function syncDemosFromPath(path) {
    const SB = cfg.storyboard
    if (!SB || typeof SB.syncDemosFromHistory !== 'function') return
    const list = []
    for (const n of (path || [])) {
      if (n.role !== 'tool') continue
      let res = null
      try { res = JSON.parse(n.content || 'null') } catch (e) { res = null }
      if (!res || !res.demoId) continue
      let acts = null
      for (const m of (path || [])) {
        if (m.role !== 'assistant' || !Array.isArray(m.tool_calls)) continue
        const tc = m.tool_calls.find((t) => t && t.id === n.tool_call_id)
        if (!tc) continue
        try {
          const a = JSON.parse((tc.function && tc.function.arguments) || '{}')
          acts = a.actions || null
        } catch (e) { acts = null }
        break
      }
      if (!acts) continue
      list.push({ demoId: res.demoId, actions: acts, origin: 'agent', ts: n.ts })
    }
    try { SB.syncDemosFromHistory(list) } catch (e) { /* 重建失败不该影响渲染 */ }
  }

  /**
   * 按**当前分支**整体重渲染消息区。
   *
   * ★ 为什么需要它：有了分支之后，"消息区"不再是只能追加的——切分支要整体换一遍。
   *   刷新后的恢复也走同一条路。原先那段恢复逻辑写在 assemble.js 里，只认
   *   user/assistant 的**正文字段**，于是动作气泡、题目卡、主动提示卡**刷新后全部消失**；
   *   这里改为同时还原 tool 消息（重建动作气泡，含「引用」与「重播」）与卡片。
   *
   * @param {Object} [tree] 省略则从 store 现取
   */
  function renderPath(tree) {
    if (!store && !tree) return
    const t = tree || { path: store.path(), forks: store.forkPoints() }
    const path = t.path || []

    // tool_call_id → { name, args }：重建动作气泡要用
    const calls = new Map()
    for (const n of path) {
      if (n.role !== 'assistant' || !Array.isArray(n.tool_calls)) continue
      for (const tc of n.tool_calls) {
        if (!tc || !tc.id) continue
        let args = {}
        try { args = JSON.parse((tc.function && tc.function.arguments) || '{}') } catch (e) { args = {} }
        calls.set(tc.id, { name: tc.function && tc.function.name, args })
      }
    }
    // 分叉点 → 它的孩子
    const forkMap = new Map()
    for (const f of (t.forks || [])) forkMap.set(f.id || '__root__', f)

    msgBox.innerHTML = ''
    const rootFork = forkMap.get('__root__')
    if (rootFork) msgBox.appendChild(branchBar(rootFork))
    if (!path.length) { renderEmptyState(); return }

    for (const n of path) {
      if (n.role === 'user') {
        // 内部消息不渲染成学生提问：continuation（截断续写提示）、internal（面板代发
        // 的指令，如"重答"）——否则刷新后它们看起来像学生自己说的话。
        if (n.origin === 'continuation' || n.origin === 'internal') continue
        attachActs(addUser(n.content, n.id), n.id, 'user', n.content)
      } else if (n.role === 'assistant') {
        if (n.content) attachActs(addMsg(renderRich(n.content), 'assistant', n.id), n.id, 'assistant', n.content)
      } else if (n.role === 'tool') {
        const c = calls.get(n.tool_call_id)
        if (!c) continue
        // ★ `applySceneActions`（SEQ_TOOL）是**工具名**、不在 actionLabels 表里——
        //   它走的是"承载一次多动作"那条单独分支（见 onToolCall）。
        //   漏掉这个例外，刷新后**所有动作气泡都会被跳过**（而界面只是"什么都没有"，
        //   不报错）——这条被实机验证抓到过。
        if (c.name !== SEQ_TOOL && !ACTION_LABEL[c.name]) continue
        let res = null
        try { res = JSON.parse(n.content || 'null') } catch (e) { res = null }
        const acts = c.args && Array.isArray(c.args.actions) ? c.args.actions : c.args
        const bubble = addActionBubble(c.name, acts, res)
        if (bubble) enrichActionBubble(bubble, res)
      } else if (n.role === 'card') {
        if (n.meta && n.meta.html) addCard(n.meta.html, 'agent-card-' + (n.kind || 'card'))
      }
      const f = forkMap.get(n.id)
      if (f) msgBox.appendChild(branchBar(f))
    }
    scrollDown()
    // ★ 演示记录从历史重建（幂等）。**必须留在渲染路径末尾**：它正是"刷新后
    //   仍能重播 / 仍能引用某一步"的唯一来源。
    syncDemosFromPath(path)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 会话页（多会话）
  // ───────────────────────────────────────────────────────────────────────────

  /** 会话页容器（懒创建；不进抽屉的常规流，靠 .show 滑入） */
  let convPage = null

  function fmtTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  /**
   * 会话页：列出本机的会话，可切换 / 改名 / 删除 / 新建。
   *
   * ★ 为什么要有独立一页而不是塞进消息流：一是会话可能有二十个，塞进去会把对话挤没；
   *   二是"切换会话"是一次**整体替换**（换文档、换历史、换渲染），与消息流的语义不同。
   */
  function enterConvPage() {
    if (!store || typeof store.sessions !== 'function') {
      addChip('当前未接入对话存储，无法管理会话', 'warn')
      return
    }
    if (!convPage) { convPage = buildConvPage(); drawer.appendChild(convPage) }
    renderConvList()
    renderFavList()
    convPage.classList.add('show')
  }
  function leaveConvPage() { if (convPage) convPage.classList.remove('show') }

  function buildConvPage() {
    const page = E('div', { class: 'agent-conv-page' })
    const head = E('div', { class: 'agent-conv-head' })
    head.appendChild(E('span', { class: 'agent-conv-title', text: '会话' }))
    const back = E('button', { class: 'agent-act-btn', text: '返回', type: 'button' })
    back.onclick = () => leaveConvPage()
    head.appendChild(back)
    page.appendChild(head)
    page.appendChild(E('div', {
      class: 'agent-conv-sec-t',
      text: '全部会话（只存本机，不上传）',
    }))
    const list = E('div', { class: 'agent-conv-list' })
    page.appendChild(list)
    // ★ 收藏的演示：与"会话"并列的一个分区——两者都是"存本机、随时取用"的东西，
    //   放在同一页里，学生想"再看一遍那条好的"时只有一个地方要记。
    if (favorites) {
      page.appendChild(E('div', { class: 'agent-conv-sec-t', text: '收藏的演示（点一下重播）' }))
      const favList = E('div', { class: 'agent-conv-list agent-fav-list' })
      page.appendChild(favList)
      page._favList = favList
    }
    const foot = E('div', { class: 'agent-conv-foot' })
    const add = E('button', { class: 'agent-btn sm primary', text: '＋ 新会话', type: 'button' })
    add.onclick = () => {
      stopRunning()
      store.newSession()
      if (cfg.syncConversation) cfg.syncConversation()
      renderPath()
      renderConvList()
    }
    foot.appendChild(add)
    page.appendChild(foot)
    page._list = list
    return page
  }

  function renderConvList() {
    const box = convPage && convPage._list
    if (!box) return
    box.innerHTML = ''
    const list = store.sessions()
    if (!list.length) {
      box.appendChild(E('div', { class: 'agent-conv-empty', text: '还没有会话' }))
      return
    }
    for (const s of list) {
      const row = E('div', { class: 'agent-conv-row' + (s.active ? ' active' : '') })
      const left = E('div', { class: 'agent-conv-left' }, [
        E('div', { class: 'agent-conv-t', text: s.title || '新对话' }),
        E('div', {
          class: 'agent-conv-meta',
          text: T('{n} 个节点 · {at}{cur}', {
            n: s.count || 0,
            at: fmtTime(s.at),
            cur: s.active ? T('· 当前') : '',
          }),
        }),
      ])
      left.onclick = () => {
        if (s.active) return
        stopRunning()
        store.switchSession(s.id)
        if (cfg.syncConversation) cfg.syncConversation()
        renderPath()
        renderConvList()
      }
      row.appendChild(left)

      const acts = E('div', { class: 'agent-conv-acts' })
      const rn = E('button', { class: 'agent-act-btn', text: '改名', type: 'button' })
      rn.onclick = (ev) => {
        if (ev && ev.stopPropagation) ev.stopPropagation()
        const v = window.prompt(T('会话名称'), s.title || '')
        if (v != null) { store.renameSession(s.id, v); renderConvList() }
      }
      const del = E('button', { class: 'agent-act-btn', text: '删除', type: 'button' })
      del.onclick = (ev) => {
        if (ev && ev.stopPropagation) ev.stopPropagation()
        if (!window.confirm(T('删除这个会话？不可恢复。'))) return
        stopRunning()
        store.deleteSession(s.id)
        if (cfg.syncConversation) cfg.syncConversation()
        renderPath()
        renderConvList()
      }
      acts.appendChild(rn)
      acts.appendChild(del)
      row.appendChild(acts)
      box.appendChild(row)
    }
  }

  /** 收藏的演示列表（点一下即重播） */
  function renderFavList() {
    const box = convPage && convPage._favList
    if (!box || !favorites) return
    box.innerHTML = ''
    const list = favorites.list()
    if (!list.length) {
      box.appendChild(E('div', {
        class: 'agent-conv-empty',
        text: '还没有收藏——演示时点动作气泡上的「☆ 收藏」即可',
      }))
      return
    }
    for (const f of list) {
      const row = E('div', { class: 'agent-conv-row' })
      const left = E('div', { class: 'agent-conv-left' }, [
        E('div', { class: 'agent-conv-t', text: '★ ' + f.label }),
        E('div', { class: 'agent-conv-meta', text: T('{n} 步 · {at}', { n: f.steps.length, at: fmtTime(f.at) }) }),
      ])
      left.onclick = () => {
        const SB = cfg.storyboard
        if (!SB || typeof SB.loadDemo !== 'function') return
        stopRunning()
        leaveConvPage()                 // 收起会话页，让学生看见画面
        const r = SB.loadDemo(f.steps, { origin: 'favorite', reason: 'favorite' })
        if (!r || !r.ok) addChip(T('无法播放这条收藏：{error}', { error: (r && r.error) || '' }), 'warn')
      }
      row.appendChild(left)
      const acts = E('div', { class: 'agent-conv-acts' })
      const del = E('button', { class: 'agent-act-btn', text: '删除', type: 'button' })
      del.onclick = (ev) => {
        if (ev && ev.stopPropagation) ev.stopPropagation()
        favorites.remove(f.key)
        renderFavList()
      }
      acts.appendChild(del)
      row.appendChild(acts)
      box.appendChild(row)
    }
  }

  /** 动作的中文描述（可由 cfg.describeAction 完全接管，或靠 actionLabels 查表） */
  function describeAction(name, args) {
    if (typeof cfg.describeAction === 'function') return cfg.describeAction(name, args)
    // ★ 标签要**单独过一遍 T**：`T()` 在查不到键时会回退到"中文原文 → 译文"表，
    //   而动作标签正是"原文即键"的那类（登记在各模块的 text 表里）。
    //   不过这一遍的话，英文模式下会得到 `显示/隐藏对称元素（key="C2#1"）` 这种半中半英。
    const label = T(ACTION_LABEL[name] || name)
    if (args && Object.keys(args).length) {
      const kv = Object.keys(args).map((k) => k + '=' + JSON.stringify(args[k])).join(' ')
      // ★ 括号也得走键：中文用全角「（）」、英文用半角「()」并且前面要有空格。
      //   键写成 `（{kv}）` 是为了**没有注入 T 时逐字节不变**（回退实现是就地填占位符）。
      return label + T('（{kv}）', { kv })
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
              '<span class="agent-act-err">· ' + escapeHtml(T('{n} 个动作未执行', { n: failed.length })) + '</span>')
          }
        }
        // ★ 把回执里的 perAction / demoId 落到气泡上：逐行「引用」+ 底部「重播这个演示」。
        //   少了这一步，"演示可寻址"在界面上就没有落点——学生看到的是 6 行动作，
        //   却没法指着其中一行说"我要改这一步"。
        enrichActionBubble(lastBubble, info.result)
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
          cur.setError(T('{message}（点「设置」检查密钥）', { message: err.message }))
        } else {
          cur.setError(T('出错了：{message}', { message: err.message }))
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
    demoBar.classList.toggle('stopped', m === 'stopped')
    const isManual = (m === 'manual')
    const isDone = (m === 'done')
    const isStopped = (m === 'stopped')
    demoPrev.classList.toggle('hidden', !(isManual || isDone))   // 结束后也能退回去重看
    demoNext.classList.toggle('hidden', !isManual)
    demoAuto.classList.toggle('hidden', !isManual)
    // 「⏸ 逐步」只在**连播中**显示：它要解决的正是"连播中想改回逐步却无路可走"
    demoManual.classList.toggle('hidden', isManual || isDone || isStopped)
    demoStop.classList.toggle('hidden', isDone || isStopped)
    demoReplay.classList.toggle('hidden', !isDone)
    demoDismiss.classList.toggle('hidden', !(isDone || isStopped))
    // 「↩ 回到演示前」：只要**捕获到过**演示前状态就显示 —— 播放中、播完、被停止都算。
    //   它不看 phase（`done` / `auto` / `manual` 都可能需要退回去），故直接问 storyboard。
    const canBack = !!(SB && typeof SB.state === 'function' && SB.state().canRestoreBefore)
    if (demoRestore) demoRestore.classList.toggle('hidden', !canBack)
  }

  function renderStep(evt) {
    if (!demoBar) return
    clearTimeout(demoHideTimer)
    demoBar.classList.remove('hidden', 'bad')
    demoIdx.textContent = T('第 {index}/{total} 步', { index: evt.index, total: evt.total })
      + (evt.ok === false ? T('（未执行）') : '')
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
    demoIdx.textContent = T('已完成 {index}/{total} 步', { index: evt.index, total: evt.total })
    setBarMode('manual')
    demoPrev.disabled = !evt.canPrev
    const nx = evt.next || {}
    demoNextHint.classList.remove('hidden')
    demoNextHint.textContent = T('下一步：{text}', { text: nx.speech || nx.label || '' })
  }

  /** 退回上一步之后：显示"这一步还没执行"，预告即将重播的那一步 */
  function renderBack(evt) {
    if (!demoBar) return
    demoBar.classList.remove('hidden', 'done', 'bad')
    demoIdx.textContent = T('已退回 · 已完成 {index}/{total} 步', { index: evt.index, total: evt.total })
    setBarMode('manual')
    demoPrev.disabled = !(evt.index > 0)
    // ★ 主文字显示"现在**停在**哪儿"（`at`），而不是"下一步要重播什么"（`step`）。
    //   若两者是同一句旁白，退回前后文字不变，学生会以为"上一步没生效"（实测反馈）。
    const at = evt.at || {}
    demoText.textContent = at.speech || at.label || T('（回到最开始）')
    demoText.classList.toggle('muted', false)
    demoNextHint.classList.remove('hidden')
    const st = evt.step || {}
    demoNextHint.textContent = T('下一步（重播）：{label}', { label: st.label || '' })
  }

  function renderAuto(evt) {
    setBarMode('auto')
    demoIdx.textContent = T('连续播放中 {index}/{total}', { index: evt.index, total: evt.total })
    demoNextHint.classList.add('hidden')
  }

  function renderQueued(evt) {
    if (!demoBar) return
    demoBar.classList.remove('hidden')
    demoIdx.textContent = T('已完成 {index}/{total} 步 · 新增 {added} 步',
      { index: evt.index || 0, total: evt.total, added: evt.added })
    // 追加后"下一步"可能是刚入队的那一条，重新预告一次（否则预告会停留在旧的那条）
    const sb = cfg.storyboard
    const st = (sb && sb.state) ? sb.state() : null
    const nx = st && st.pending && st.pending[0]
    if (nx && demoBar.classList.contains('manual')) {
      demoNextHint.classList.remove('hidden')
      demoNextHint.textContent = T('下一步：{text}', { text: nx.speech || nx.action })
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
    demoText.textContent = T('共 {total} 步 · 可重新演示，或退回去重看某一步', { total: (evt && evt.total) || 0 })
    demoText.classList.add('muted')
  }

  function hideBar() {
    if (!demoBar) return
    clearTimeout(demoHideTimer)
    demoNextHint.classList.add('hidden')
    demoBar.classList.add('hidden')
  }

  /**
   * 把一次分镜进度事件落到控制条上。
   *
   * ★ 抽成独立函数（而不是写在订阅回调里）是为了**换语言时能重放**：
   *   控制条上的步号与提示是 `t()` 现算的，DOM 里的那份不会被扫描替换回头。
   *
   * @param {Object} evt
   * @param {boolean} [isReplay] 重放（换语言）时不抢焦点、不自动开抽屉
   */
  function applyProgress(evt, isReplay) {
    if (!evt || disposed) return
    lastProgress = evt
    switch (evt.phase) {
      case 'step':
        // 手动演示的第一帧就要让用户看见控制条，否则他会不知道要动手
        if (!isReplay && evt.manual !== false && !drawer.classList.contains('show')) open({ focus: false })
        renderStep(evt)
        break
      case 'waiting': renderWaiting(evt); break
      case 'back': renderBack(evt); break
      case 'replay':
        clearTimeout(demoHideTimer)
        demoBar.classList.remove('hidden', 'done')
        demoIdx.textContent = T('重新演示 · 共 {total} 步', { total: evt.total })
        demoText.textContent = '从头开始'
        demoText.classList.add('muted')
        break
      case 'auto': renderAuto(evt); break
      case 'queued': renderQueued(evt); break
      case 'done': renderDone(evt); break
      case 'stopped':
        // ★ 停止后**不直接隐藏**控制条：演示已经改动了画面（图层/外观/视角，
        //   还可能跳去了别的页面），而"学生中途不想看了"恰恰是最想退回去的时刻。
        //   保留一条只含「↩ 回到演示前」与「收起」的窄条；没有可恢复状态才真隐藏。
        if (SB && typeof SB.state === 'function' && SB.state().canRestoreBefore) {
          demoBar.classList.remove('hidden', 'bad')
          demoIdx.textContent = '演示已停止'
          demoText.textContent = ''
          demoNextHint.classList.add('hidden')
          setBarMode('stopped')
        } else {
          hideBar()
        }
        break
      default: break
    }
  }

  function bindStoryboardProgress() {
    const sb = cfg.storyboard
    if (!sb || typeof sb.onProgress !== 'function') return
    offProgress = sb.onProgress((evt) => applyProgress(evt, false))
  }

  // ---------------------------------------------------------------------------
  // 语言切换：面板自己重画（**不重建 DOM、绝不清空对话**）
  // ---------------------------------------------------------------------------
  /**
   * 应用层换语言时会在 `window` 上派发 `'langchange'`（见 packages/i18n 的 setLang）。
   *
   * ★ 面板**为什么要自己听**：静态文案会被应用层的 `startAutoSweep(document.body)`
   *   扫描替换掉，但**走 `T()` 现算的那些不会** —— 步号 `第 3/6 步`、会话元信息
   *   `3 个节点 · 09-30 12:00`、分支片 `⑂ 这处分出 2 条：` 一写进 DOM 就定死了，
   *   它们不在 text 表里，扫描永远认不出。不重画的表现是"切了语言这几处还是旧语言"，
   *   而且**不报错**。
   *
   * ★ 这里**绝不重建对话**：不调 `renderPath()` —— 那会丢掉不在 store 里的卡片
   *   （题目卡就属于这种），也会打断正在流式输出的那一轮。只重画面板自己拥有、
   *   且不承载历史的那几块。
   */
  function onLangChange() {
    if (disposed) return
    // ① 面板兜底的标题与输入框提示。
    //    ★ 宿主给了 cfg.title / cfg.fabTitle / cfg.placeholder 时，那是**宿主的**
    //      字符串（由它自己或全局扫描负责），面板不越权改写它。
    if (!cfg.title && headTitleEl) headTitleEl.textContent = T('教学智能体')
    if (!cfg.fabTitle && fab) fab.title = T('教学智能体（可拖动）')
    if (!cfg.placeholder && inputEl) {
      inputEl.placeholder = T('问相关的问题，或让我演示…（Enter 发送，Shift+Enter 换行）')
    }
    // ② 空态：**只有当消息区里只剩问候语**时才重画 —— 有对话历史就一个字都不动
    if (msgBox && isOnlyGreeting()) renderEmptyState()
    // ③ 会话页 / 收藏列表（标题、节点数、时间都是 T() 现算的）
    if (convPage && convPage.classList.contains('show')) { renderConvList(); renderFavList() }
    // ④ 分镜控制条：把最后一次进度事件按新语言重放一遍
    if (lastProgress) applyProgress(lastProgress, true)
  }

  /** 消息区里是否**只有**空态问候语（据此判断"换语言重画空态"是安全的） */
  function isOnlyGreeting() {
    if (!msgBox || !msgBox.children || msgBox.children.length !== 1) return false
    const only = msgBox.children[0]
    return !!(only && typeof only.querySelector === 'function' && only.querySelector('.agent-hello'))
  }

  function init() {
    build()
    bindStoryboardProgress()
    window.addEventListener('resize', () => {
      const r = fab.getBoundingClientRect()
      if (r.left > window.innerWidth - 20) snapToEdge()
    })
    // ★ 语言切换：静态文案由应用层的扫描替换管，`T()` 现算的那几块得自己重画
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('langchange', onLangChange)
    }
  }

  /** 卸载：解绑订阅，避免反复进出页面时累积（分镜引擎的 onProgress 返回取消函数） */
  function destroy() {
    disposed = true
    if (typeof offProgress === 'function') { offProgress(); offProgress = null }
    // ★ 有些宿主（含测试里的 DOM 桩）没有 removeEventListener，缺了要静默跳过，
    //   不能因为解绑而抛错
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('langchange', onLangChange)
    }
  }

  return {
    init, destroy, open, close, toggle, markUnread, renderEmptyState,
    addMsg, addUser, addChip, addActionBubble, beginAssistant, runAgent, send: doSend,
    addCard,
    renderRich,
    // 分支 / 会话 / 消息工具条（都建立在"对话是一棵树"之上）
    renderPath, attachActs, copyText, editUserMsg, reanswer, forkInto, branchBar,
    enterConvPage, leaveConvPage,
    /** 供测试/调试取用内部节点 */
    nodes: () => ({ fab, drawer, msgBox, inputEl, sendBtn, stopBtn, dot, demoBar, convPage }),
    setInput: (v) => { inputEl.value = v },
  }
}

export default createPanel
