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
 *   7. **"本轮没写正文"要在回合内就说得可照做**（task-2）：一轮里模型可能连走好几个
 *      "只想动手"的回合，攒到整轮结束才报一句像出错的话，学生那时已无事可做；
 *      而"前面某回合已经写过正文"时又不该报 —— 判据是本轮**所有回合**的正文累计为空
 *      （见 runAgent 的 roundTextChars）。实时提示可撤销：后面写出正文就撤掉。
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
   * ★★ 2026-10-15（用户："恢复会话后，之前的演示会失效，无法收藏和重播"）：
   *   **带演示回执的工具** —— 它们的共同点是回执里有 `demoId`，
   *   因此面板要在气泡底部挂「↻ 重播这个演示」「☆ 收藏」。
   *
   *   为什么必须显式列出：下面渲染动作气泡的判据是
   *   `c.name !== SEQ_TOOL && !ACTION_LABEL[c.name]` ⇒ `continue`，
   *   而 `playDemo` / `replayDemo` 是**演示工具**、天然不在动作词汇表里
   *   ⇒ 刷新后它们的气泡被整条跳过，学生连按钮都看不到（"以前放过的演示没法重播"）。
   *   ★ 这类工具"一次调用播一整条脚本"，参数形状与 `applySceneActions` 不同
   *     （`{id}` / `{demoId}` 而不是 `{actions}`），所以它们的**步骤来自回执**
   *     （app.js 在回执里多带了 `actions`，见那里的说明）。
   */
  const DEMO_TOOLS = cfg.demoToolNames || ['playDemo', 'replayDemo']
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
let demoFav
  let demoPrev, demoNext, demoAuto, demoManual, demoStop, demoReplay, demoRestore, demoDismiss
  let layoutRedrawTimer = null
  let demoHideTimer = null
  let cur = null
  /**
   * ★★ 2026-10-12（用户第 3 条）：**一轮是否正在跑**。
   *
   *   提问到回答之间，面板里的"用户气泡 + 正在流式的助手气泡"是**DOM 里唯一的一份**
   *   （对话树要等这一轮结束才写入 store）。所以这期间的任何"重画"都会把它们抹掉：
   *   学生看到的正是"提问后跳转一下，面板空白了；思考结束只剩问题"。
   *   ⇒ 运行期间的重画一律**推迟**到这一轮收尾（见下面的 pendingRender）。
   */
  let running = false
  let pendingRender = false
  /**
   * ★★ 2026-10-14（task-2）：**本轮"只动手、没写正文"的实时提示元素**（可撤销）。
   *
   *   它不是"留在消息区里的一句结论"，而是一条**进行中的状态**：一旦本轮后面某个回合
   *   写出了正文，它就不再成立 —— 那时若不撤掉，学生会看到"还没写讲解"压在已经写好的
   *   讲解上面（提示与事实相反，比没有提示更伤）。撤销通路见 clearNoTextNote。
   */
  let noTextNoteEl = null
/** 在途气泡护栏的短重试状态（见 renderPath 里那段注释） */
const pendingRetry = { n: 0, timer: 0 }
/** 在途标记的看门狗（一次性；见 renderPath 里那段注释：按请求计数永远到不了上限） */
let pendingWatchdog = 0
/**
 * 看门狗本次该等多久（毫秒）。**回合结束之后**只需一个很短的兜底，
 * 不再是固定 12 秒 —— 那是"回合结束后要等 12–24 秒才恢复重画"的真因（见 armPendingWatchdog）。
 */
const PENDING_WATCHDOG_IDLE_MS = 12000
const PENDING_WATCHDOG_TURN_ENDED_MS = 1400
/** 正文流式结束的时刻（用于给"演示阶段"留出重试窗口） */
let finishedAt = 0
/**
 * ★★ 2026-10-14（task-3 第 ①/② 项）：**这一轮**真的结束的时刻。
 *
 *   两条都用它，且都必须与 `running` 分开看：
 *   · ① 看门狗要知道"回合已经结束"，才能把兜底等待从 12 秒缩短到 ~1.4 秒；
 *   · ② 演示条要知道"回合还没结束"，才不会在只有一个批次播完时显示「演示完成」。
 *
 *   为什么不用 `finishedAt`：那是**正文流式结束**的时刻，而上游实测已经证明
 *   "正文流式结束 ≠ 演示阶段结束"（finish() 里那条教训）——拿它当回合结束的判据，
 *   演示阶段就会被当成"回合已完"，回到同一个坑里。
 */
let turnEndedAt = 0
/** ④ 最近一次 queued 事件带的新增步数：并入**下一条 step** 的文案（否则同 tick 内被覆盖，学生看不到） */
let pendingAdded = 0
/** ② 最近一次 done 事件；回合结束后要拿它把演示条从"等待后续"补画成终态 */
let lastDemoDoneEvt = null
/** ② 演示条是否正处在"本批播完、回合还在跑 ⇒ 不显示终态"的中间态 */
let demoBarAwaiting = false
/**
 * ③ 重画思考块时的**展开意图**：`null` = 老行为（展开）；`false` = 这一块是"前面的回合"，收起。
 *   见 thinkBlock 的说明 —— 用它而不是给 thinkBlock 加形参，是为了不动上游那条结构断言。
 */
let thinkOpenHint = null
  let disposed = false
  let offProgress = null
  /**
   * 最近一次分镜进度事件。
   * ★ 换语言时要拿它把控制条**按新语言重画一遍** —— 步号/旁白提示是 `t()` 现算的，
   *   已经写进 DOM 的那份 `第 3/6 步` 不会被扫描替换回头（它不在 text 表里）。
   *   不重画的表现是"切了语言，控制条还是旧语言"，而且**不报错**。
   */
  let lastProgress = null
/**
 * ★★ 2026-10-12（用户："退出演示，新建会话后，仍有演示残留"）：
 *   `'stopped'` 分支是**故意**保留一条「↩ 回到演示前」窄条的（学生中途不想看了，
 *   那正是想退回去的时刻）。但**新会话之后**这条窄条不该再回来 —— 上一段对话的演示
 *   与新建的对话无关。原先只靠"先 stop 再 hideBar"的顺序保证，一旦停止事件**晚到**
 *   （或再次发出）窄条就会回来 ✗。这里用一个抑制标志把它**结构性**地挡住：
 *   · `resetDemo()`（新会话）把它置 true；
 *   · 只有**新的**演示开始（queued/replay/step/auto/waiting）才解除。
 */
let demoSuppressed = false
/** 最近一步的旁白：演示完成时保留它，别让"共 N 步…"把最后一步的说明顶掉（用户报过） */
let lastDemoSpeech = ''
/** 最近一条演示的 id：演示条上的「☆ 收藏这次演示」要用它（由进度事件带来） */
let lastDemoId = null

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
    /**
     * ★★ 2026-10-11（用户："演示动作无法收藏"）：
     *   收藏原先只挂在**消息气泡**里 —— 气泡默认是折叠的，学生看完演示往往根本找不到它 ✗。
     *   演示条就在眼前，把收藏也放上来（收藏的那条演示 = **最近一次**演示，
     *   由分镜的进度事件带来 `demoId`）。
     */
    demoFav = null
    if (favorites) {
      /**
       * ★ 标签用短款「☆ 收藏」（与气泡上那颗同一文案）：演示条一行有 9 颗按钮，
       *   长标签（"☆ 收藏这次演示"）在窄面板下会把这一行挤爆（实测溢出被裁 ✗）。
       *   语义靠 tooltip 补齐，不必写进标签。
       */
      demoFav = mkAct(T('☆ 收藏'), () => {
        // ★ 先用手上攒的 id；没有就问分镜"最近一条是谁"（进度事件并非每个阶段都带 demoId）
        const id = lastDemoId || (SB && typeof SB.latestDemoId === 'function' ? SB.latestDemoId() : null)
        if (!id) return
        const ok = saveDemoToFavorites(id)
        if (demoFav) { demoFav.textContent = ok ? '★ 已收藏' : T('（收藏失败）'); demoFav.disabled = !!ok }
      })
    }
    ;[demoPrev, demoNext, demoAuto, demoManual, demoStop, demoReplay, demoRestore, demoDismiss]
      .forEach((b) => demoBtns.appendChild(b))
    if (demoFav) demoBtns.appendChild(demoFav)
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
    /**
     * ★★ 2026-10-08：设置里选「显示思考中过程」时，思考块**默认展开**。
     *
     *   用户报「设置中选了显示思考中，但实际使用时并不显示」——原先只控制**是否渲染**这个
     *   `<details>`，而它默认是**收起**的：屏幕上只有一个「▸ 思考中…」，思考内容一个字都看不到。
     *   设置的名字是"显示…过程"，那就该真的看得见；不想看的人把它关掉即可（关 = 整块不渲染）。
     */
    const showReasoning = getShowReasoning()
    if (!showReasoning) think.classList.add('hidden')
    else think.open = true
    /**
     * ★★ 2026-10-14（task-3 第 ③ 项）：**"已被显式收起的块，finish 不得再展开"**。
     *
     *   实测（真机，修前）：回合边界 `collapseThinking()` 把 `think.open` 置 false，紧接着
     *   `finish({hasContent:true})` 里那句"设置了显示过程就展开"又把它 `setAttribute('open','')`
     *   ⇒ 刚收起的块被当场展开 ✗。界面上的症状是块标题写着「点击展开」而内容是展开的。
     *
     *   判据不能是"现在 open 不 open"（那是**结果**，正是被我们自己上一步改掉的东西），
     *   而必须是"有没有人**显式**收起过它"—— 所以这里记**意图**：
     *     · `collapseThinking()` 置 collapsed = true（回合结束、前面那些块）；
     *     · `beginAssistant()` 时块是展开的（学生正看着这一块在写）⇒ collapsed = false。
     *   `finish()` 只对"没被显式收起的块"重新展开，于是：
     *     · 中间回合那些块 → 保持收起（标题仍写「点击展开」，与状态一致）；
     *     · 当前正在写的这一块 → 照旧保持展开 ✓。
     */
    let collapsed = false
    const setExpanded = (v) => {
      try { if (v) think.setAttribute('open', ''); else think.removeAttribute('open') } catch (e) { /* 无 DOM 桩 */ }
    }
    const body = E('div', { class: 'agent-text' })
    wrap.appendChild(think)
    wrap.appendChild(body)
    msgBox.appendChild(wrap)
    /**
     * ★★ 2026-10-14（用户选方案 B："保护在途气泡"）：
     *   这个气泡**只存在于 DOM 里** —— 对话树要等一轮结束才写入。在此之前任何一次
     *   `renderPath()`（从树重建整个消息区）都会把它连同思考块一起抹掉；而演示条与动作
     *   气泡是 DOM-only 节点、会被 `restoreDomOnly()` 接回 ⇒ 屏幕上"只剩演示"。
     *   所以打一个**在途标记**：`renderPath` 见到它就只记待办、不重画（见那里的护栏）；
     *   本轮回调 finish() 里撤掉标记，标记撤掉后再重画。
     */
    if (wrap.dataset) wrap.dataset.pending = '1'   // ★ 无 DOM 桩（test-core）里没有 dataset ⇒ 必须防
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
      /** ★ A 方案：回合结束后把这一块的思考**折叠**（否则多轮下来满屏都是展开的思考，回答被挤下去） */
      collapseThinking() {
        collapsed = true      // ★ 记**意图**：finish() 不得再把这块展开（见上面 collapsed 的说明）
        try { think.open = false } catch (e) { /* 无 DOM 桩 */ }
        setExpanded(false)
      },
      setContent(text) {
        pendingText = text
        if (rafId) return
        rafId = raf(() => flush(true))
      },
      finish(o) {
        o = o || {}
        // ★ 先掐掉排队中的那一帧再收尾，否则它随后会用空串再刷一次 → 空泡
        if (rafId) { caf(rafId); rafId = 0 }
        /**
         * ★★ 2026-10-14 更正（用户实测截图：第一张有思考块 + 切换提示，第二张只剩动作条与演示）：
         *   **不能在这里撤标记** ✗ —— 正文流式结束 ≠ 这一轮结束：紧接着还有**动作/演示阶段**
         *   （用户图上「已完成 1/2 步」）。若此时撤标记，演示期间任何一次重画（从对话树重建，
         *   而 store 里可能还没有这条回答）仍会把思考块与回答抹掉 —— 正是「只剩演示」。
         *   标记改由 stopRunning() 撤（那一处才是"这一轮/这条队列真的结束"的出口）。
         */
        finishedAt = Date.now()
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
          } else if (o.finishReason === 'tool_calls' && o.hadAction === false) {
            /**
             * ★★ 2026-10-14（task-2）："只动手没写正文"这条既要**可照做**，也不能**瞎说**。
             *   本轮一次动作都没下发（只在后台查了知识/快照）时，说"动作已排进上面的演示队列"
             *   是假话 ⇒ 分成两支，两支都给出学生真正能做的下一步。
             */
            why = T('模型这次只在后台查了资料，没写正文。可以直接追问要结论，或再发一条让它把讲解补上。')
          } else if (o.finishReason === 'tool_calls') {
            why = T('模型这次只发起了动作调用，没写正文（动作已排进上面的演示队列）。可以直接追问要结论，或再发一条让它把讲解补上。')
          } else if (o.hadAction) {
            /**
             * ★★ 2026-10-15（用户报："询问问题后，智能体的回复很多只有思考"）——真机复现的这一支：
             *   模型整轮都在排演示/看画面，一个回合都没写正文（实测有 6 轮 / 9 次调用 /
             *   5780 字思考、0 个回合写正文的形态），面板上只剩折叠的「已思考」。
             *   原先这里落到最后那句通用文案（"只输出了思考内容…换一个模型试试"），
             *   它**说错了原因**：不是模型不会写，而是它把这一轮花在演示上了。
             *   ⇒ 如实说清 + 给出学生真正能做的下一步。
             * ★ 判据用 `o.hadAction`（本轮确实下发过动作）而不是猜 finish_reason：
             *   `finish_reason` 在流式实现里可能缺失，而"有没有动手"是我们自己数出来的事实。
             * ★ 措辞只断言**我们真的知道的事**（这一轮排了演示、没写正文），
             *   **不**声称"额度已经用尽" —— 面板看不到轮数的真实消耗，
             *   而"轮数用尽"这一支已经由对话循环**结构性地**补了一轮（见 conversation.js）。
             */
            why = T('模型这一轮把精力都花在了查看画面与排演示上，没写正文回答。可以点上面的「下一步」先看演示，再追问一句要结论；或者把问题问得更直接（例如「直接告诉我答案是…」）。')
          } else {
            // ★ 有思考 / 连思考都没有：两条都是**完整句子**，不拼半截
            //   （拼半截的话译文语序会错位，而且扫描替换也对不上）
            why = hasThink
              ? T('模型这次没有返回正文（只输出了思考内容）。可以再问一次，或换一个模型试试。')
              : T('模型这次没有返回正文（连思考内容也没有，可能是服务端返回异常）。可以再问一次，或换一个模型试试。')
          }
          body.innerHTML = '<div class="agent-warn">' + escapeHtml(why) + tail + '</div>'
        }
        /**
         * ★★ 2026-10-08 修（用户报「设置里选了显示思考中，实际却不显示」）：
         *
         *   原先这里**无条件**收起思考块，且"这一轮没有思考内容"时**整块藏掉**。
         *   于是：模型（或某一轮）没返回 reasoning 时，用户选了"显示"也一个字都看不到 ——
         *   界面上没有任何解释，看起来就是"设置没生效"。
         *   现在分三种情况，且**都以设置为准**：
         *     · 关 → 收起或藏掉（用户明确不想看）
         *     · 开 + 有思考 → 保持展开（"显示过程"就该看得见过程）
         *     · 开 + 没思考 → **如实说明**这一轮没有思考内容，而不是默默藏掉
         */
        think.removeAttribute('open')
        if (!hasThink) {
          if (showReasoning) {
            think.classList.remove('hidden')
            sum.textContent = T('本轮没有思考内容')
            thinkBody.textContent = T('（该模型或这一轮没有返回思考内容——换一个会输出思考的模型，或再问一次，就可能有了）')
          } else {
            think.classList.add('hidden')
          }
        } else {
          sum.textContent = o.hasContent ? T('已思考（点击展开）') : T('模型实际输出的思考内容（点击展开）')
          // 没正文时把思考展开，让用户至少还能看到模型干了什么；设置了"显示过程"时也保持展开
          /**
           * ★★ 2026-10-14（task-3 第 ③ 项）：`&& !collapsed` 是本轮修的核心。
           *   没有它，回合边界那句 collapseThinking() 会在同一次 finish() 里被这行**当场撤销**
           *   （实测：块标题写着「点击展开」，而内容是展开的）。仍然展开的只有两种块：
           *   · 本轮**当前**正在写的这一块（它从没被显式收起 ⇒ collapsed=false）；
           *   · 没写正文时那一块（让学生至少看到模型干了什么，老语义保留）。
           */
          if ((!o.hasContent || showReasoning) && !collapsed) setExpanded(true)
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
      /**
       * ★★ 2026-10-08：**题目类工具的返回不能原样打出来**（用户报「练习…还直接暴露了答案」）。
       *
       *   `generateQuiz` 的返回里**带着冻结的正确答案**（题目卡上「看答案」按钮用的就是它）。
       *   而这一行原先把整个 JSON 截 400 字贴在界面上 —— 题目还没做，答案已经摊在眼前。
       *   判据：返回体里有"标准答案/判分依据"的工具，界面只报**它做了什么**，不报内容。
       *   哪些算敏感由宿主注入（`cfg.isSensitiveTool`），面板不硬编码业务工具名。
       */
      const sensitive = typeof cfg.isSensitiveTool === 'function' && cfg.isSensitiveTool(name)
      /**
       * ★ 场景动作（SEQ_TOOL）走**结构化摘要**，不贴 JSON ——
       *   它的回执里带着给模型看的行为规范（见 seqSummary 的说明），贴出来学生会看到
       *   "请不要重复下发同样的动作"这种内部指令 ✗（用户报："动作里有很多提示词"）。
       */
      body.appendChild(E('div', {
        class: 'agent-act-ret',
        text: name === SEQ_TOOL
          ? seqSummary(result)
          : (sensitive
              ? T('返回：{v}', { v: T('（题目已生成，答案已冻结——在下面的题目卡里作答即可，这里不显示答案）') })
              : T('返回：{v}', { v: JSON.stringify(result).slice(0, 400) })),
      }))
    }
    d.appendChild(body)
    d._body = body
    msgBox.appendChild(d)
    scrollDown()
    return d
  }

  /**
   * 场景动作（SEQ_TOOL）回执在**界面上**的摘要。
   *
   * ★★ 2026-10-11（用户："动作里有很多提示词"）：
   *   回执里带着**给模型看的**行为规范（"正在等用户点「下一步」…请不要重复下发同样的动作…
   *   若需要可在回复**末尾**补一句…"）。那段话**必须留在回执里** ——
   *   模型写回复前读到的最后一段话就是它，第 9 轮实测"把要求放进回执"才改得动模型行为 ✓。
   *   但它**不该显示给学生** ✗：界面上看到的应该只是"智能体做了什么"。
   *   ⇒ 这里只报：排了几步、受理几步、失败几步、逐步还是连播。
   */
  function seqSummary(r) {
    const res = r || {}
    const total = res.totalSteps || res.queued || 0
    const failed = Array.isArray(res.failed) ? res.failed.length : 0
    const manual = res.manual === false ? T('（自动连播）') : ''
    return T('已排好 {n} 步演示{manual}：点「下一步」逐步确认，或「连续播放」一次看完', { n: total, manual })
      + (failed ? ' · ' + T('{n} 个动作未执行', { n: failed }) : '')
  }

  /**
   * 把某条演示存进收藏夹 —— 气泡里的「☆ 收藏」与演示条里的「☆ 收藏这次演示」**共用一处**。
   *
   * ★★ 2026-10-08：收藏**必须连模块归属一起存**。
   *   只存 action/params/speech 的后果：在轨道板块收藏的演示，切到晶体板块再点播放 ——
   *   步骤被拿去套**晶体**的词汇表，于是要么报"不支持的动作"，要么同名动作**静默落到另一个板块**。
   *   现在每步带 `module`（记录里也有），播放前宿主会把该板块的页面叫回来。
   *
   * @param {string} demoId
   * @returns {boolean} 是否收藏成功（演示记录已不在 ⇒ false）
   */
  function saveDemoToFavorites(demoId) {
    if (!favorites || !demoId) return false
    const rec = SB && SB.getDemo ? SB.getDemo(demoId) : null
    if (!rec || !rec.steps || !rec.steps.length) return false
    const r = favorites.save('', rec.steps.map((s) => ({
      action: s.name || s.action, params: s.params, speech: s.speech,
      module: s.module || rec.module || null,
    })), { origin: rec.origin, module: rec.module || null })
    return !!(r && r.ok)
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
  function enrichActionBubble(d, result, acts, module) {
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
    /**
     * ★★ 2026-10-12（用户："演示为什么不能重新播放或收藏？"）：
     *
     *   分镜记录是**内存态**的（storyboard 里的 demos Map）—— 刷新 / 换页重建之后就没了，
     *   而下面这两个按钮点的正是 `SB.getDemo(demoId)` / `SB.replay(demoId)` ✗
     *   ⇒ 点「☆ 收藏」显示"演示已失效"、点「↻ 重播这个演示」毫无反应。
     *   而**步骤其实还在存档里**（助手消息的 `tool_calls.args.actions`）⇒ 记录缺失时
     *   用**只登记、不播放**的 `registerDemo` 把它补回去。
     *   ★ 为什么不能顺手用 `loadDemo`：它会 stop() 并**立刻播放** ——
     *     那样每次重画历史都会自动播一遍演示 ✗（"补记录"与"播放"必须是两件事）。
     */
    const SB0 = cfg.storyboard
    if (acts && acts.length && SB0 && typeof SB0.getDemo === 'function'
      && typeof SB0.registerDemo === 'function' && !SB0.getDemo(demoId)) {
      try { SB0.registerDemo(acts, { demoId, origin: 'history', module: module || null }) } catch (e) { /* 校验不过就保持失效 */ }
    }
    const foot = E('div', { class: 'agent-act-foot' })
    const rb = E('button', { class: 'agent-act-btn', text: '↻ 重播这个演示', type: 'button' })
    rb.onclick = async () => {
      const SB = cfg.storyboard
      if (!SB || !SB.replay) return
      /**
       * ★ 与收藏同一条规矩：重播前先把**这条记录所属的板块**叫回来。
       *   历史记录是跨板块的（在轨道页放过的演示，切到晶体页仍列在会话历史里），
       *   不先切回去，动作会被拿去套此刻模块的词汇表。
       */
      const rec = SB.getDemo ? SB.getDemo(demoId) : null
      const mod = (rec && rec.module) || null
      if (mod && typeof cfg.ensureSceneModule === 'function') {
        try { await cfg.ensureSceneModule(mod) } catch (e) { /* 宿主失败：继续按原样播 */ }
      }
      SB.replay(demoId)
    }
    foot.appendChild(rb)
    // ★ 「收藏」是**人的判断**——哪条演示值得反复看，程序猜不出来（见 store/demo-favorites.js）。
    //   存的是**步骤清单**而不是画面截图，所以以后回放仍然是对的（截图会过时）。
    if (favorites) {
      const fb = E('button', {
        class: 'agent-act-btn', text: '☆ 收藏', type: 'button',
        title: '把这条演示存到本机，之后随时可重播',
      })
      fb.onclick = () => {
        const ok = saveDemoToFavorites(demoId)
        fb.textContent = ok ? '★ 已收藏' : '演示已失效'
        fb.disabled = ok
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
   * ★★ 2026-10-14（task-2 的第二半 —— 用户"问题仍然存在"的真因之一）：
   *   在途标记的看门狗改为**只在回合已经不在跑的时候才动手**。
   *
   * 为什么需要它：在途标记有可能**没人来撤** —— stopRunning() 只在分支切换/新会话等路径
   *   被调用，正常收尾不走它 ⇒ 标记长期留着 ⇒ 之后的重画被永久推迟（换会话、空态刷新都被
   *   挡住）。上一版因此加了一个 12 秒一次性看门狗。
   *
   * 上一版的错（4032e1e 引入，实测复现）：它**不看这一轮是否还在跑**，到期就撤标记并强制
   *   renderPath()。而演示阶段可以很长（用户截图里的"已完成 1/3 步"），那时 running 仍为
   *   真、回答还在 DOM 里 ⇒ 这次强制重建把它抹掉；重建是从对话树读的，于是屏幕上只剩
   *   用户气泡 + 动作条 + 演示条（正是用户报的那张图）。
   *
   * 改法（两条判据，都有对照）：
   *   · running === true（这一轮还在跑，含动作/演示阶段）⇒ **不撤标记、不重建**，把到期
   *     时间往后顺延一个周期（不是取消保护，只是别在回合中途动手）。
   *   · running === false 且标记仍过期 ⇒ 撤标记并重建（"标记永远没人撤"的兜底仍然有效）。
   *
   * 为什么顺延后不会卡死：running 只由 runAgent 的开头/收尾改，而收尾**一定会执行**
   *   （cfg.send 无论正常返回还是抛错都走到那两行）⇒ 顺延有限次后必然有一次看见 running 为假。
   */
  function armPendingWatchdog() {
    if (pendingWatchdog) return          // 已经挂上了，不重复挂
    /**
     * ★★ 2026-10-14（task-3 第 ① 项）：**看门狗现在有两个触发条件**。
     *
     *   实测（真机，修前）：`stopRunning()` 在**正常回合结束**这条路上从不被调用，于是收尾
     *   那次 `renderPath()` 见到在途标记就推迟，标记本身一直挂着 ⇒ 只有 12 秒后的看门狗
     *   才会撤标记并重画。学生看到的是"回答完了，但整片消息 12–24 秒才恢复"。
     *
     *   两个条件各自的语义（都发生在 running === false 时）：
     *     · `turnEndedAt` 有值 —— **回合至少结束过一次**。此时绝大多数在途标记都该被撤了
     *       （收尾那次 endTurnRepaint() 已经当场撤过一遍），剩下的只可能是"回合结束后才冒出来
     *       的孤儿标记" ⇒ 只等一个很短的兜底（~1.4 秒）就撤标记并重画。
     *     · `turnEndedAt` 为空 —— 页面加载期那种"还没有回合"的孤立标记 ⇒ 12 秒。
     *
     *   ★ running 仍为真（含演示阶段）时一律只顺延，**绝不在回合中途撤标记**（4032e1e
     *     那条实测教训原样保留）。
     */
    const delay = (running || !turnEndedAt) ? PENDING_WATCHDOG_IDLE_MS : PENDING_WATCHDOG_TURN_ENDED_MS
    pendingWatchdog = setTimeout(() => {
      pendingWatchdog = 0
      /**
       * ★ 还在跑 ⇒ 只顺延，不动标记、不重建。这一条是 4032e1e 修的核心：
       *   "标记过期"与"可以重建"是两件事，前者成立不代表后者成立。
       */
      if (running) { armPendingWatchdog(); return }
      if (msgBox && typeof msgBox.querySelectorAll === 'function') {
        const stale = msgBox.querySelectorAll('[data-pending]')
        for (let i = 0; i < stale.length; i++) if (stale[i].dataset) delete stale[i].dataset.pending
      }
      renderPath()
      /**
       * ★★ "标记永远没人撤"的兜底**没有取消** —— 只是它的等待时间随回合状态变短：
       *   回合已经结束 ⇒ 1.4 秒内必然撤一次标记并重画；还没有任何回合（页面加载期的孤立标记）
       *   ⇒ 老规矩 12 秒。两条路都不会让界面永久停在不重画上。
       */
    }, delay)
  }

  /**
   * ★★ 2026-10-14（task-3 第 ① 项）：**回合结束这一步**（runAgent 收尾调用）。
   *
   *   为什么必须有它：正常回合结束时没有任何人撤在途标记（`stopRunning()` 只在分支切换/
   *   新会话/停止那几条路上被调用）⇒ 收尾那次重画被推迟，界面要等看门狗（12 秒，甚至
   *   两次到期 24 秒）才恢复。这里做三件事：
   *     ① 记下"回合已结束"（`turnEndedAt`）—— 演示条的第 ② 项也靠它；
   *     ② 撤掉在途标记，让**重画立刻**发生（大多数情况下这就是全部所需）；
   *     ③ 顺手把演示条从"等待后续"补画成终态（本批播完、回合也结束了 ⇒ 才是真的完成）。
   *
   *   ★ 刻意**不**复用 stopRunning()：那个还会调 `cfg.onStop()`（中止对话循环）。
   *     回合已经结束了，再去中止它是多余的动作；这里只要"撤标记 + 重画"这两件正事。
   *   ★ 判定必须在 `running = false` **之后**：`running` 是"重画让不让过"的另一把锁
   *     （见 renderPath），回合没标结束就补画会被它挡住，白补一次。
   */
  function endTurnRepaint() {
    pendingRender = false
    if (msgBox && typeof msgBox.querySelectorAll === 'function') {
      const live = msgBox.querySelectorAll('[data-pending]')
      for (let i = 0; i < live.length; i++) if (live[i].dataset) delete live[i].dataset.pending
    }
    try { renderPath() } catch (e) { /* 重画失败不影响这一轮的返回 */ }
    finalizeDemoBar()
  }

  /**
   * 有回合在跑就先停掉。
   * ★ 切分支 / 编辑重问 / 重答**都必须先停**：否则旧回合结束时的那次"整体落盘"，
   *   会按**新的**叶指针把尾巴接上去——接错线且不报错。
   */
  function stopRunning() {
    /**
     * ★★ 2026-10-14（方案 B 的更正）：**这里才是撤"在途标记"的地方** —— 正文流式结束后
     *   还有动作/演示阶段（用户截图里的「已完成 1/2 步」），标记必须撑到这条队列真的结束。
     *   撤掉之后，随后的一次 renderPath 就会把 store 里的回答正常画出来。
     *   ★ 外层还有重试上限兜底：万一某个流程没走到这里，也不会让界面一直不重画。
     */
    if (msgBox && typeof msgBox.querySelectorAll === 'function') {
      const live = msgBox.querySelectorAll('[data-pending]')
      for (let i = 0; i < live.length; i++) if (live[i].dataset) delete live[i].dataset.pending
    }
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
      let origin = 'agent'
      let label = ''
      for (const m of (path || [])) {
        if (m.role !== 'assistant' || !Array.isArray(m.tool_calls)) continue
        const tc = m.tool_calls.find((t) => t && t.id === n.tool_call_id)
        if (!tc) continue
        const fn = (tc.function && tc.function.name) || ''
        try {
          const a = JSON.parse((tc.function && tc.function.arguments) || '{}')
          /**
           * ★★ 2026-10-15（用户："恢复会话后，之前的演示会失效，无法收藏和重播"）——第二个漏点：
           *   这里原先**只认 `applySceneActions` 的 `actions` 字段** ✗，而"播放预置演示"
           *   走的是 `playDemo({id})` —— 它的**参数里没有** actions。于是用「演示」入口
           *   放的那类演示刷新后**根本重建不出来**（实测记录数 0、连重播按钮都没有），
           *   而学生刚看过它。
           *   ⇒ 步骤的**真源是回执**：app.js 的 playDemo/replayDemo 回执里带
           *     `actions`（当时真正播的那一份）与 `title`。参数里的 actions 优先
           *     （applySceneActions 就是那样），否则用回执的。
           */
          if (Array.isArray(a.actions) && a.actions.length) acts = a.actions
          if (Array.isArray(res.actions) && res.actions.length) acts = acts || res.actions
          if (fn === 'playDemo') origin = 'script'
          if (res.title) label = String(res.title)
        } catch (e) { acts = null }
        break
      }
      if (!acts || !acts.length) continue
      list.push({ demoId: res.demoId, actions: acts, origin, label, ts: n.ts })
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
  /**
   * 造一个"思考"折叠块（重渲染路径与流式路径共用同一套外壳与文案）。
   * @param {string} text 思考正文；空串 = 这一轮**确实没有**思考内容（见下）
   */
  function thinkBlock(text) {
    const d = E('details', { class: 'agent-think' })
    const body = E('div', { class: 'agent-think-body' })
    /**
     * ★★ 2026-10-14（task-3 第 ③ 项的第二半）：重画路径要能说"这一块是**前面**那一块，
     *   应当收起"。用一个**模块级的意图变量**（`thinkOpenHint`）传这层意思，
     *   而不是给 thinkBlock 加第二个形参 —— 后者会让上游那条结构断言
     *   （`hasReasoning) el.insertBefore(thinkBlock(n.reasoning), el.firstChild)`）
     *   在本轮四个改动里变成"需要跟着改的测试"，而它钉的其实是**位置**（思考块在最前面）。
     *   默认 null = 老行为（展开），所以其它调用点语义不变。
     */
    const open = thinkOpenHint === null ? true : !!thinkOpenHint
    if (text) {
      if (open) d.setAttribute('open', '')
      d.appendChild(E('summary', { text: open ? T('思考过程（点击收起）') : T('已思考（点击展开）') }))
      body.textContent = text
    } else {
      // 空串是**有意义的**：conversation.js 现在连空思考也存（老数据则是没有这个字段）
      if (open) d.setAttribute('open', '')
      d.appendChild(E('summary', { text: T('本轮没有思考内容') }))
      body.textContent = T('（该模型或这一轮没有返回思考内容——换一个会输出思考的模型，或再问一次，就可能有了）')
    }
    d.appendChild(body)
    return d
  }

  function renderPath(tree) {
    /**
     * ★★ 2026-10-12（用户第 3 条）：**一轮跑着的时候不许重画消息区**。
     *   重画是从**对话树**里读的，而这一轮还没写进树 —— 途中重画会渲染出上一轮的路径
     *   （或空态），把"刚问的那句 + 正在流式的回答"一起抹掉；流式回调随后写进
     *   已经脱落的节点，于是屏幕上什么都没有。记一个待办，这一轮收尾时补画。
     *   ★ 收尾那次（main.js 的 onDone → renderPath）正落在这里，所以推迟是安全的：
     *     它会紧接着在本轮结束时执行一次（见 runAgent 末尾）。
     */
    if (running) { pendingRender = true; return }
    /**
     * ★★ 2026-10-14（用户第 3 次报："刚发完消息显示思考中和思维链，但出现演示后其他部分就看不到了；
     *   切换板块后新输出不显示，演示出来之后连之前的输出和切换提示也不见了"）—— 方案 B。
     *
     *   `running` 那条护栏只挡住"运行**期间**"的重画 ✗；真正的空档在本轮**刚结束**那一下：
     *   收尾会 renderPath()，而回答要等对话层**异步**写进 store ⇒ 两者赛跑，store 里还没有那条
     *   回答时重画就把它抹掉；演示条/动作气泡是 DOM-only、会被 restoreDomOnly() 接回 ⇒ 屏幕只剩演示 ✗。
     *
     *   判据：消息区里只要还有**带在途标记**的气泡（正在流式的那条，见它的创建处），就先不重画 ——
     *   记待办 + **短重试**（最多约 2 秒），标记一撤（finish）或超时即正常重画。绝不会卡死。
     */
    if (msgBox && typeof msgBox.querySelector === 'function' && msgBox.querySelector('[data-pending]')) {
      pendingRender = true
      if (!pendingWatchdog) {
        armPendingWatchdog()
      }
      return
    }
    pendingRetry.n = 0
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

    /**
     * ★★ 2026-10-12（用户第 7 条，实机跑点群练习时抓到）：
     *   **只存在于 DOM 里的东西，重画时要留着。**
     *
     *   对话树只存文本协议（user/assistant/tool），而下面这些是**本地渲染的界面**：
     *     · 题目卡与讲评卡（练习闭环里由出题引擎直接插进面板，不是工具返回）
     *     · 提示条（chip）
     *   `msgBox.innerHTML = ''` 会把它们一起抹掉 —— 症状是"学生答完题，模型一开口，
     *   题目卡和判定结果就消失了"。而按钮的 onclick 就挂在**这些节点**上，
     *   所以这里保留**原节点**（不是复制），重画后按原顺序接到末尾：交互仍然有效。
     *
     *   ★ 为什么要接到末尾而不是插回原位：面板不记录它们的位置（它们不在树里），
     *     而"留在屏幕上、能继续点"才是学生要的；顺序在最下方不影响阅读。
     *   ★ 同一套规则也用在**空态刷新**上（见 `domOnlyNodes`）：从门户点「练习 → 某板块」时
     *     路由挂载会重画空态，而刚开出的知识点选择器正是这种卡片 ——
     *     不保留就会"跳过去了，但什么也没出现"。
     */
    const keep = domOnlyNodes()

    msgBox.innerHTML = ''
    const rootFork = forkMap.get('__root__')
    if (rootFork) msgBox.appendChild(branchBar(rootFork))
    if (!path.length) {
      renderEmptyState()
      // 空路径时也要把卡片接回去（例如"新对话"之后仍想看到刚出的那道题）
      restoreDomOnly(keep)
      return
    }

    for (const n of path) {
      if (n.role === 'user') {
        // 内部消息不渲染成学生提问：continuation（截断续写提示）、internal（面板代发
        // 的指令，如"重答"）——否则刷新后它们看起来像学生自己说的话。
        if (n.origin === 'continuation' || n.origin === 'internal') continue
        attachActs(addUser(n.content, n.id), n.id, 'user', n.content)
      } else if (n.role === 'assistant') {
        /**
         * ★★ 2026-10-14（task-2 用户"问题仍然存在"截图的核心真因）：
         *   **有思考就必须渲染，不能因为"正文为空"整条跳过。**
         *
         *   原先这里是 `if (n.content)` 一刀切：content 为空的 assistant 节点**整条不渲染**
         *   （连它的思考块一起丢）。而 108583e 改成"一个 LLM 回合一个思考块"之后，一轮里的
         *   前几个回合（只想一下、再调工具）**本来就没有正文** ⇒ 任何一次从对话树重建
         *   （收尾落盘后、刷新、切分支、看门狗到期的强制重画）都会把这些思考块丢掉 ✗。
         *   用户看到的就是"用户气泡 + 动作条 + chip + 演示条都在，思考块一个都没有、
         *   正文也没有"（正文那一轮常常也是"只排了演示、还没写讲解"，见 showNoTextNote）。
         *
         *   判据（三条，逐一对应一种节点）：
         *     · 有正文 → 正文气泡（照旧）
         *     · 无正文但有思考 → **只画思考块的气泡**（这正是修复点）
         *     · 都为空 → 只在**路径末条**上如实说明"本轮没有思考内容"（老语义保留：
         *       免得整段历史每轮都挂一句废话），其余不渲染，免得留一屏空气泡
         *
         *   ★ 刻意**不**写"没有正文"之类的空正文占位：那句话是 finish() 的实时诊断
         *     （见 showNoTextNote 的注释与 onDone 的 hasContent 判定），重建路径不该再补一份 ——
         *     它会把"这一轮其实只是先排了演示"渲染成一屏假报错。
         */
        const hasBody = !!(n.content && String(n.content).trim())
        const hasReasoning = !!n.reasoning
        const isLast = n === path[path.length - 1]
        if (hasBody || hasReasoning || isLast) {
          /**
           * ★★ 注意 `attachActs` **没有返回值**（它只往气泡里挂按钮条）。
           *   本轮实测：写成 `const el = attachActs(...)` 得到 undefined，
           *   随后 `el.insertBefore` 抛 TypeError —— 异常被上层吞掉，界面看起来一切正常，
           *   只有思考块永远不出现（"改了但没生效"的典型）。所以要**先拿元素、再挂按钮**。
           */
          const el = addMsg(hasBody ? renderRich(n.content) : '', 'assistant', n.id)
          if (hasBody) attachActs(el, n.id, 'assistant', n.content)
          /**
           * ★★ 2026-10-08：**重渲染路径也要还原思考块**。
           *
           *   原先这条路径只渲染正文 —— 于是一轮结束后（会话落盘 → renderPath 重建列表）
           *   思考块**当场消失**：流式时能看到、回答一完成就没了。用户报的
           *   「设置了显示思考中，实际却不显示」就是这个（不是设置没生效，是块被重建掉了）。
           *   · 有思考内容 + 设置为显示 → 展开的折叠块
           *   · 没有思考内容（reasoning 为空串，见 conversation.js 的说明）+ 设置为显示
           *     → 只在**最后一条**助手消息上如实说明，免得整段历史每轮都挂一句废话
           *   · 设置为不显示 → 一律不加
           */
          if (getShowReasoning() && el) {
            /**
             * ★★ 2026-10-14（task-3 第 ③ 项的第二半 —— 真机实测才暴露的那一半）：
             *   `thinkBlock()` 原先**无条件**展开每一块，于是"回合边界已经把前面的块收起了"
             *   这件事在**重画**时被整个抹掉：一轮结束 → 落盘 → renderPath 重建 →
             *   屏幕上又是 6 个全展开的思考块（真机实测：`thinks=[{open:true}×6]`），
             *   而块标题写着「点击收起」——正是用户报的那个"折叠不生效"。
             *   ⇒ 重画路径也要认同一个意图：**只有当前（最后）那一块展开**，前面的一律收起。
             *     `isLast` 已经有（它就是"正在写/刚写完的那一条"）。
             *   ★ 保留 `thinkOpenHint` 这个**模块级意图变量**而不是直接给 thinkBlock 传第二个实参：
             *     设计上它是"重画路径想怎么画"这件事的单一出口；顺带让上游那条结构断言
             *     （`hasReasoning) el.insertBefore(thinkBlock(n.reasoning), el.firstChild)`）
             *     在本轮四个改动里保持字面不变 —— 那条断言钉的正是"思考块必须在最前面"。
             */
            const prevHint = thinkOpenHint
            thinkOpenHint = isLast
            try {
              if (hasReasoning) el.insertBefore(thinkBlock(n.reasoning), el.firstChild)
              else if (isLast) el.insertBefore(thinkBlock(''), el.firstChild)
            } finally { thinkOpenHint = prevHint }
          }
        }
      } else if (n.role === 'tool') {
        const c = calls.get(n.tool_call_id)
        if (!c) continue
        // ★ `applySceneActions`（SEQ_TOOL）是**工具名**、不在 actionLabels 表里——
        //   它走的是"承载一次多动作"那条单独分支（见 onToolCall）。
        //   漏掉这个例外，刷新后**所有动作气泡都会被跳过**（而界面只是"什么都没有"，
        //   不报错）——这条被实机验证抓到过。
        // ★ 演示工具（playDemo/replayDemo）是**第二个例外**，理由见 DEMO_TOOLS 的定义。
        const isDemoTool = DEMO_TOOLS.indexOf(c.name) >= 0
        if (c.name !== SEQ_TOOL && !isDemoTool && !ACTION_LABEL[c.name]) continue
        let res = null
        try { res = JSON.parse(n.content || 'null') } catch (e) { res = null }
        /**
         * 动作清单的来源按工具分两种：
         *   · `applySceneActions`：参数里就带着（`{actions:[…]}`）；
         *   · **演示工具**：参数里只有脚本 id，真正的步骤在**回执**里
         *     （app.js 的 playDemo/replayDemo 回执带 `actions`）。
         */
        const argsActs = c.args && Array.isArray(c.args.actions) ? c.args.actions : null
        const resActs = res && Array.isArray(res.actions) ? res.actions : null
        const acts = argsActs || resActs || (isDemoTool ? [] : c.args)
        const bubble = addActionBubble(c.name, acts, res)
        // ★ 带上 acts 与模块归属：记录缺失时要用它们把分镜记录补回来（见 enrichActionBubble）
        if (bubble) enrichActionBubble(bubble, res, acts, (c.args && c.args.module) || null)
      } else if (n.role === 'card') {
        if (n.meta && n.meta.html) addCard(n.meta.html, 'agent-card-' + (n.kind || 'card'))
      }
      const f = forkMap.get(n.id)
      if (f) msgBox.appendChild(branchBar(f))
    }
    /**
     * 把重画前摘下来的 DOM-only 节点接回末尾（见上面 `keep` 的说明）：
     * 题目卡 / 讲评卡 / 提示条不在对话树里，不接回去就等于"学生答完题、模型一开口，
     * 判定与题目卡凭空消失"。★ 是**原节点**，所以按钮的 onclick 仍然有效。
     */
    restoreDomOnly(keep)
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
      // ★ 新会话不该带着上一段对话的演示条（用户报的"新对话后仍残留演示信息"）
      resetDemo()
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
      /**
       * ★ 行里显示**它属于哪个板块**：收藏是跨会话、跨板块的清单，
       *   不标出来学生点了才发现"播不出来/播到别处"（用户问的正是这个行为）。
       *   标题由宿主注入（`cfg.moduleTitle(id)`）——面板不认识模块注册表。
       * ★ 归属存在**条目顶层** `f.module`（store 的 schema）；`f.meta.module` 与
       *   `f.steps[0].module` 是兼容旧数据的兜底（旧条目没有这个字段）。
       */
      const favMod = f.module || (f.meta && f.meta.module) || (f.steps[0] && f.steps[0].module) || null
      const favModTitle = (favMod && typeof cfg.moduleTitle === 'function') ? (cfg.moduleTitle(favMod) || '') : ''
      const left = E('div', { class: 'agent-conv-left' }, [
        E('div', { class: 'agent-conv-t', text: '★ ' + f.label }),
        E('div', {
          class: 'agent-conv-meta',
          text: T('{n} 步 · {at}', { n: f.steps.length, at: fmtTime(f.at) })
            + (favModTitle ? ' · ' + favModTitle : ''),
        }),
      ])
      left.onclick = async () => {
        const SB = cfg.storyboard
        if (!SB || typeof SB.loadDemo !== 'function') return
        stopRunning()
        leaveConvPage()                 // 收起会话页，让学生看见画面
        /**
         * ★★ 2026-10-08：**回放前先把这条收藏所属的板块叫回来**。
         *
         *   收藏是跨会话、跨板块的清单：在轨道板块收藏的演示，切到晶体板块再点播放，
         *   原先会把轨道的动作拿去套晶体的词汇表 —— 要么报"不支持的动作"，
         *   要么同名动作**悄悄落到另一个板块**（用户问的正是这个行为）。
         *   现在先切回它自己的板块，再装载；画面与旁白同屏，才不会"听着讲解、看着别处"。
         *   ★ 宿主没提供该能力时按原样播放（不假装成功）。
         */
        const mod = f.module || (f.meta && f.meta.module) || (f.steps[0] && f.steps[0].module) || null
        if (mod && typeof cfg.ensureSceneModule === 'function') {
          try { await cfg.ensureSceneModule(mod) } catch (e) { /* 宿主失败：继续按原样播 */ }
        }
        const r = SB.loadDemo(f.steps, { origin: 'favorite', reason: 'favorite', module: mod })
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

  /**
   * 提示条的**创建序**（单调递增）。
   * ★ 只用于"同一锚点上的多条提示条"排序 —— 它们在重画后共享同一个落点，
   *   没有它就分不出谁先谁后（真机实测：先切点群、后切轨道，屏上轨道那条反而在下）。
   */
  let chipOrder = 0

  function addChip(text, cls) {
    /**
     * ★★ 2026-10-15（用户："'已切到点群观鉴模块'被放到了最下面"）：
     *   **锚点必须在"创建这一刻"记下来**，不能等重画时再回头推断。
     *
     *   为什么：重画前会先把在途标记（`data-pending`）撤掉、或先把气泡摘下来，
     *   那些"这一刻"的信息在快照时**已经不存在了** —— 实测：把判据写成"快照时还有没有
     *   在途气泡"，探针里只要先撤标记就整条失效（提示条照样落到最下面）。
     *
     *   记什么：`chipsAfterMid` = "我出现时**已经落盘**的消息条数"。
     *   这个数在一轮之内是常量（本轮的消息要等本轮结束才落盘），而重画之后
     *   "已落盘的消息"恰好就是**前 N 条** ⇒ 提示条插在第 N 条之后，
     *   就落在"提交过的内容之后、本轮回答之前"，顺序与发生顺序一致。
     *
     *   ★ 只在**确实有在途气泡**时记（说明这一轮还没落盘、才有"要越过的回答"）；
     *     回合结束后才产生的提示条没有这个语境，留末尾才是对的（老语义）。
     */
    const el = addMsg('<span class="agent-chip ' + (cls || '') + '">' + escapeHtml(text) + '</span>', 'chip-row')
    try {
      if (el && el.dataset) {
        /**
         * ★ 这一步只**内部计算**：先数一遍"此刻已落盘的消息条数"。
         *   `hasPending` 决定**要不要把这个位置当锚点用**：
         *     · 有在途气泡（这一轮已经在跑）⇒ 用它 —— 提示条要落在本轮回答之前；
         *     · 没有在途气泡但**存在一条还没落盘的提问气泡**（例：模型调 navigateTo
         *       切板块发生在 doSend 之后、runAgent 之前）⇒ 也必须用 ——
         *       否则它会落到"提问 → 回答"之后，读起来像回答完了才切板块（真机实测）。
         *     · 两者都没有（回合结束后才产生的通知）⇒ 不记，留末尾才是老语义。
         */
        let committed = 0
        for (const cand of msgBox.children) {
          if (cand !== el && cand.dataset && cand.dataset.mid) committed++
        }
        const hasPending = !!(msgBox && typeof msgBox.querySelector === 'function' && msgBox.querySelector('[data-pending]'))
        const tail = el.previousElementSibling
        const openUserBubble = !!(tail && tail.dataset && !tail.dataset.mid
          && tail.classList && tail.classList.contains('agent-msg') && tail.classList.contains('user'))
        if (hasPending || openUserBubble) {
          el.dataset.chipsAfterMid = String(committed)
          /**
           * ★★ 2026-10-15（真机实测抓到）：**同一个锚点上会有多条提示条**——
           *   例如"已切到「点群观鉴」模块"与"已切到「轨道视界」模块"都发生在
           *   "还没有任何落盘消息"的时刻（并列在第一问下面），只有锚点就**分不出先后**，
           *   后插的那条会挤到前面。⇒ 再记一个单调递增的**创建序**，同锚点时按它排序。
           */
          el.dataset.chipOrder = String(++chipOrder)
        }
      }
    } catch (e) { /* 拿不到位置就退回老行为（末尾），不影响提示本身 */ }
    // ★ 返回元素：调用方常需要给它挂标记/绑定（本仓库踩过"只为了副作用的函数被当返回值用"）。
    return el
  }

  /**
   * ★★ 2026-10-14（task-2）：**回合边界上的可行动提示** —— 本轮到目前为止一个字的正文都没写。
   *
   * 为什么放在回合边界（onToolCall），而不是等 onDone：
   *   模型一轮里可能连走好几个"只想动手"的回合（用户实测 5 个）。攒到整轮结束才说，
   *   学生看到的是"演示都排完了/播完了，才冒出来一句像报错的话"，那时他已无事可做。
   *   在回合边界上说，他当轮就能决定：继续等下一轮，还是直接追问要结论。
   *
   * 为什么是**可撤销**的活提示：
   *   同一轮的后面某个回合完全可能把讲解写出来 —— 那时这句提示就是假话，必须撤掉
   *   （见 clearNoTextNote 的调用点：正文到达 / 本轮结束 / 出错）。
   *
   * 为什么用普通 chip 而不是 warn：
   *   它不是错误，只是一个进行中的状态；黄底红字正是上一版被读成"出错了"的原因。
   *
   * 幂等：同一轮里第二次、第三次调用不会再加一张（noTextNoteEl 已存在就直接返回）。
   */
  function showNoTextNote() {
    if (noTextNoteEl) return
    const el = addChip(T('它这一轮只排了演示、还没写讲解：可以继续等它下一轮，或直接追问要结论。'))
    noTextNoteEl = el
    // ★ 打一个稳定标记：验收脚本/探针据此认出"这条是那条实时提示"，不必猜文案
    if (el && el.setAttribute) el.setAttribute('data-note', 'only-actions')
  }

  /** 撤掉上面那条实时提示（写出正文 / 本轮结束 / 出错时都要撤，见各自调用点） */
  function clearNoTextNote() {
    const el = noTextNoteEl
    noTextNoteEl = null
    if (!el) return
    try {
      /**
       * ★ 先 el.remove()（真实 DOM 最直接），没有它再退回 msgBox.removeChild(el)。
       *   为什么必须留第二条路：test-core 的 DOM 桩**既没有 remove() 也没有 parentNode**，
       *   只写第一条的话，"撤掉"这件事在桩里永远不发生 —— 于是它**没法被验证**，
       *   而"没法被验证的撤销"正是本项目最怕的那种半成品（提示会与事实相反地挂着）。
       *   parentNode 那种判存在在这里不够用：桩里它根本不存在，真实 DOM 里却一定有。
       */
      if (typeof el.remove === 'function') el.remove()
      else if (msgBox && typeof msgBox.removeChild === 'function') msgBox.removeChild(el)
    } catch (e) { /* 已经不在消息区里（例如重画过）：静默，忽略 */ }
  }

  /**
   * 消息区里"只存在于 DOM、不在对话树里"的节点：题目卡 / 讲评卡 / 知识点选择器 / 提示条。
   *
   * ★★ 2026-10-12（用户反馈"这里少了点群在线"时顺带抓到的那条路径）：
   *   从门户点「练习 → 点群观鉴」时，`goPracticeOn` 先切路由，路由挂载钩子随后
   *   `renderEmptyState()`；若会话是空的，它会把刚开出的知识点选择器**一起清掉** ——
   *   学生看到的是"跳过去了，但面板里什么都没有"。
   *   所以"保留 DOM-only 节点"这条规则必须同时用在**重画**与**空态刷新**上，
   *   而不是只在其中一条路径里写一遍。
   */
  function domOnlyNodes() {
    if (!msgBox) return []
    /**
     * ★★ 2026-10-13（用户："回答问题后，智能体给出小追问，但是几个板块的显示顺序有误"）：
     *
     *   卡片是**按时间**出现的（知识点选择器 → 题目卡 → 判定卡），而重画后原先一律
     *   `appendChild` 到**末尾** ✗ ⇒ 中间但凡又来了新消息（比如小追问那一轮），
     *   这些卡片就整块**掉到最下面**，面板顺序与发生顺序相反 ✗。
     *
     *   ⇒ 收的时候顺带记下"它**前面最近一条消息**的 mid"（`addMsg` 落的 `dataset.mid`），
     *     重画后按这个锚点插回原位；锚点找不到（那条消息被删/换分支）才退回末尾。
     */
    /**
     * ★★ 2026-10-15（用户："'已切到点群观鉴模块'被放到了最下面"）：
     *   `afterMid`（"插在某条已落盘消息之后"）只覆盖"前面已有落盘消息"的情形。
     *   **中途产生的提示条**前面**一条落盘消息都没有**：本轮的用户提问（面板不传 mid）
     *   与正在流式的助手气泡（mid 要等这一轮结束才有）都还没有 mid ⇒ 向后扫一无所获，
     *   重画后一律 appendChild 到末尾 —— 顺序成了"…回答 → 提示条"，
     *   而事实是"…→ 切换板块 → 回答" ✗（用户截图里它就在最下面）。
     *
     *   ⇒ 再取一个**逻辑位置**：`committedBefore` = "创建这一刻已落盘的消息条数"
     *     （由 `addChip` 在创建时算好、挂在 `data-chipsAfterMid` 上，见那里的说明）。
     *     这个数在一轮之内是**常量**（本轮的消息要等本轮结束才落盘），而重画之后
     *     "已落盘的消息"恰好就是**前 `committedBefore` 条** ⇒ 把提示条插在第
     *     `committedBefore` 条消息**之后**，就落在"提交过的内容之后、本轮回答之前"，
     *     顺序与发生顺序一致。
     *
     *   ★ 为什么要"创建时记"而不是"快照时现推"：重画前会先撤在途标记/摘气泡，
     *     那些信息到快照时刻**已经不存在了** —— 实测：写成"快照时还有没有在途气泡"，
     *     只要先撤标记就整条判据失效，提示条照样落到最下面。
     */
    const wrap = (el) => {
      let afterMid = null
      for (let p = el.previousElementSibling; p; p = p.previousElementSibling) {
        if (p.dataset && p.dataset.mid) { afterMid = p.dataset.mid; break }
      }
      /**
       * ★ 位置优先取**创建时**记下的 `data-chipsAfterMid`（见 addChip 的说明）；
       *   没有这个标记（老节点，或提示条创建时本来就没有"要越过的回答"）时，
       *   才退回"快照时现推"——两条路都拿不到就留末尾（老语义）。
       */
      let committedBefore = NaN
      if (!afterMid && el.dataset && el.dataset.chipsAfterMid !== undefined) {
        committedBefore = Number(el.dataset.chipsAfterMid)
      } else if (!afterMid) {
        const hasPending = !!(msgBox && typeof msgBox.querySelector === 'function' && msgBox.querySelector('[data-pending]'))
        if (hasPending) {
          committedBefore = 0
          for (let p = el.previousElementSibling; p; p = p.previousElementSibling) {
            if (p.dataset && p.dataset.mid) committedBefore++
          }
        }
      }
      return { el, afterMid, committedBefore, chipOrder: (el.dataset && el.dataset.chipOrder) ? Number(el.dataset.chipOrder) : NaN }
    }
    return Array.from(msgBox.children)
      /**
       * ★★ 2026-10-14（用户："演示出来之后，连**切换到「点群观鉴」**字样也不见了"）：
       *   这里原先只认「.agent-chip-row」✗，而 addChip 建出来的元素类名是
       *   **agent-msg chip-row** ⇒ 所有提示条（切换板块、未配置 Key、截断警告…）都**不在**
       *   "重画保留"之列 ⇒ 任何一次 renderPath / 空态刷新都会把它们抹掉 —— 用户说的就是这个。
       *   改用 .chip-row（两种命名都覆盖；这些 chip 都没有 mid、不在对话树里，不会与重画重复）。
       */
      /**
       * ★★ 2026-10-15（用户："'出题吧'按钮先出现后消失"）——**这一类 bug 的第 N 次**：
       *
       *   原先这里是"**硬编类名白名单**"：`.chip-row` 或含
       *   `.agent-q / .agent-fb / .agent-opt / .agent-goto / .agent-pick-btn`。
       *   而"出题吧"按钮的类名是 **`.agent-go-quiz`**（见 orbit / symmetry 两个
       *   question-engine 的 `P.addMsg(...)`）—— 它**不在名单里** ⇒ 任何一次重画
       *   （模型下一轮开口、看门狗兜底、切分支、刷新空态）都把它 `innerHTML = ''` 抹掉，
       *   而它又**不在对话树里**，抹掉就再也回不来 ✗。实测：重画前 1 个 → 重画后 **0 个**，
       *   同一批的 `.agent-pick-btn` / `.agent-opt` 因为恰好在名单里而存活。
       *
       *   ⇒ 判据从"**类名白名单**"改成"**结构性判据**"：**凡是没有 mid 的消息区直接子元素**，
       *     就是"只存在于 DOM、不在对话树里"的节点（提示条 / 卡片 / 题目卡 / 按钮），
       *     一律保留。理由：对话树里的消息**一定有 mid**（`addMsg` 里落的），
       *     所以"没有 mid"精确等价于"不在树里"。
       *   ★ 两个已确认安全的地方：`branchBar`（分支片）与题目卡都是按需重建、不在此列；
       *     而空态问候语 `.agent-hello` 是**空路径**下画的，重画消息时也不该重复出现 ——
       *     故 `renderEmptyState` 给它打 `data-nav="1"`，这里显式排除。
       *
       *   ★ 这条教训值得单独记：**用白名单描述"哪些要留"，迟早漏**（本次是第 4 次：
       *     先是只认 `.agent-chip-row`、再补 `.agent-pick-btn`…每次都是"用户报了一个、
       *     我补一个类名"）。改成"按结构判定"之后，新加的任何交互节点**自动**被保住。
       */
      .filter((el) => !(el.dataset && el.dataset.mid) && !(el.dataset && el.dataset.nav))
      .map(wrap)
  }

  /**
   * 把 `domOnlyNodes()` 收下来的卡片**按原位**接回去（见它的注释）。
   * ★ 不用 `querySelector` 拼属性选择器：mid 里可能带引号/方括号，直接遍历比对更稳。
   * ★ 同一个锚点后面原本可能有多张卡（题目卡 + 判定卡）⇒ 依次插在**上一张之后**，
   *   否则 `anchor.after()` 会把它们弄成倒序。
   */
  function restoreDomOnly(list) {
    if (!msgBox) return
    /**
     * ★★ 2026-10-15：游标必须**记住它属于哪个锚点**（`cursorKey`），不能只记元素。
     *
     *   原先只留 `cursor`，于是"上一张卡"与"本张卡"的锚点**不同**时也会拿它当参照
     *   （注释里那条 `cursor === anchor || FOLLOWING` 是"同一锚点连续多张卡"的优化）。
     *   现在锚点有**两类**（afterMid 向后 / beforeMid 向前），混在一起会出现
     *   "本题的提示条被插到上一条锚点旁边"这类静默错位。用 key 一比就不会串。
     */
    let cursor = null
    let cursorKey = null
    /** 最近一次"按创建序插入"的那条的创建序（同锚点排序用，见 addChip 的 chipOrder） */
    let lastOrder = NaN
    const findMid = (mid) => {
      if (!mid) return null
      for (const cand of msgBox.children) {
        if (cand.dataset && cand.dataset.mid === mid) return cand
      }
      return null
    }
    for (const item of (list || [])) {
      const el = item && item.el
      if (!el) continue
      const afterKey = item.afterMid ? 'a:' + item.afterMid : null
      /**
       * ★ 逻辑位置兜底（见 domOnlyNodes 里 committedBefore 的说明）：
       *   插在"重画后的第 `committedBefore` 条已落盘消息**之后**"——
       *   也就是**本轮回答之前**。用户报的"提示条掉到最下面"正是靠它复原顺序。
       */
      const posKey = (!afterKey && Number.isFinite(item.committedBefore)) ? 'm:' + item.committedBefore : null
      const key = afterKey || posKey
      const anchor = afterKey ? findMid(item.afterMid) : null
      if (!anchor && posKey) {
        /**
         * ★ 先按"落盘消息"数：第 `committedBefore` 条**已落盘**消息之后，
         *   就是"提交过的内容之后、本轮回答之前"。
         */
        let seen = 0
        let pre = null
        for (const cand of msgBox.children) {
          if (cand.dataset && cand.dataset.mid) {
            if (seen === item.committedBefore) { pre = cand; break }
            seen++
          }
        }
        /**
         * ★ 一条落盘消息都还没有时（例如**全新会话里的第一问**：面板给用户气泡不传
         *   mid，本轮回答也还没落盘）⇒ 退到"**提问气泡**"（`.agent-msg.user`）——
         *   它在本轮回答之前，正是提示条该待的位置。实测：不做这一步，提示条会掉到
         *   本轮回答**下面**（用户截图里的样子）。
         */
        if (!pre) {
          for (const cand of msgBox.children) {
            if (cand.classList && cand.classList.contains('user') && cand.classList.contains('agent-msg')) { pre = cand; break }
          }
        }
        /**
         * ★ 同一位置的多条提示条要**接在上一张之后**（`after()` 会把它们弄成倒序）。
         * ★ `pre` 仍为空 ⇒ 退回落末尾，与老行为一致。
         */
        if (pre && pre.parentNode === msgBox) {
          /**
           * ★ 同一落点上的多条提示条要**按创建序**排（真机实测：先切点群、后切轨道，
           *   两条都落在"第一问下面"，只看锚点会分不出先后、后插的挤到前面）。
           *   当前游标落在同一锚点上、且游标的创建序更小 ⇒ 接在它后面；
           *   否则退到"锚点之后"（不同锚点/乱序时不会串）。
           */
          const sameRun = cursor && cursorKey === key && cursor.parentNode === msgBox
            && Number.isFinite(item.chipOrder) && Number.isFinite(lastOrder)
            && item.chipOrder > lastOrder
          ;(sameRun ? cursor : pre).after(el)
          cursor = el; cursorKey = key; lastOrder = item.chipOrder
          continue
        }
      }
      if (!anchor) { msgBox.appendChild(el); cursor = el; cursorKey = null; continue }
      const sameRun = cursor && cursorKey === key && cursor.parentNode === msgBox
        && (cursor === anchor || (anchor.compareDocumentPosition(cursor) & Node.DOCUMENT_POSITION_FOLLOWING))
      ;(sameRun ? cursor : anchor).after(el)
      cursor = el; cursorKey = key
    }
  }

  function renderEmptyState() {
    /**
     * ★★ 2026-10-12（用户第 3 条）：**一轮跑着的时候不许清空消息区**。
     *
     *   空态 = "清空 + 画问候语"。而提问到回答之间，用户气泡与正在流式的助手气泡
     *   **只存在于 DOM 里**（对话树要等这一轮结束才写入 store）—— 这期间清一次，
     *   学生就再也看不到自己问的那句和正在写的回答（用户报："跳转后显示空白"）。
     *   推迟到这一轮收尾再画。
     */
    if (running) { pendingRender = true; return }
    /**
     * ★★ 2026-10-14（方案 B 的另一半）：空态刷新是"清空 + 画问候语"，同样是**整片重画**。
     *   用户报的那条路径（提问中途切板块 → 路由挂载钩子 → 空态刷新）走的正是这里 ⇒
     *   在途气泡护栏必须**两条路都装**，只装 renderPath 等于没修（用户第 3 次报的就是它）。
     */
    if (msgBox && typeof msgBox.querySelector === 'function' && msgBox.querySelector('[data-pending]')) {
      pendingRender = true
      if (!pendingWatchdog) {
        armPendingWatchdog()
      }
      return
    }
    pendingRetry.n = 0
    const keep = domOnlyNodes()          // 卡片/提示条不在树里，见 domOnlyNodes 的说明
    clear(msgBox)
    const g = typeof cfg.greeting === 'function' ? cfg.greeting() : cfg.greeting
    /**
     * ★ 2026-10-15：空态问候语打 `data-nav="1"`。
     *   它**是由本函数按需画的**（空路径才画），不是"只在 DOM 里的交互节点"——
     *   若被当成后者收进 keep 再接回去，就会**重复出现一条问候语**
     *   （renderPath 空路径分支正是"先 renderEmptyState() 再 restoreDomOnly(keep)"）。
     *   `domOnlyNodes()` 的判据里显式排除 `data-nav`，见那里的说明。
     *   ★ 加这个标记**不能省掉空态分支里"先摘再画"的顺序**：keep 是在清空**之前**收的，
     *     所以必须靠这个标记把它排除掉。
     */
    const hello = addMsg('<div class="agent-hello">' + (g || '') + '</div>', 'assistant')
    if (hello && hello.dataset) hello.dataset.nav = '1'
    restoreDomOnly(keep)
  }

  // ---------------------------------------------------------------------------
  // 发送
  // ---------------------------------------------------------------------------
  async function doSend() {
    const text = inputEl.value.trim()
    if (!text) return
    if (cfg.hasKey && !cfg.hasKey()) {
      const m = addMsg('<span class="agent-err">尚未配置 API Key。请点右上角「设置」填写你自己的模型密钥（BYOK，本工具不提供额度）。</span>', 'assistant')
      /**
       * ★★ 2026-10-12（用户第 2 条）："配置好 API Key、连接成功后，红字应消掉"。
       *   这条红字是**消息**（进了消息区就一直在），原先没有"配好之后清掉"的通路 ——
       *   于是学生配好 Key、一切正常了，屏幕上还挂着一句"尚未配置 API Key"。
       *   这里给它一个稳定标记，配好 Key 时由 `clearNoKeyNotices()` 一并撤掉。
       */
      if (m) { m.classList.add('agent-nokey'); m.setAttribute('data-nokey', '1') }
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
    running = true
    clearNoTextNote()   // ★ 上一轮若因为异常路径留下过实时提示，进新的这一轮先清掉
    let reasoning = '', content = ''
    let roundClosed = false   // ★ A 方案：上一个 LLM 回合是否已闭合（见 onToolCall / onDelta）
    /**
     * ★★ 2026-10-14（task-2）：**本轮所有回合**的正文累计长度 —— "本轮没写正文"的唯一判据。
     *
     *   一个回合一个气泡之后，"最后一个回合没写正文"变成常态（它往往只是又调了一次工具），
     *   而前面早已把讲解写出来了。只看最后一个回合，就会把"答得挺好"报成"没写正文" ✗。
     *   累加发生在 onToolCall 里**清零 content 之前**（见那里），判定在 onDone。
     */
    let roundTextChars = 0
    /** ★ 本轮是否真的下发过动作：决定措辞能不能说"动作已排进上面的演示队列"（见 onDone / finish） */
    let turnHadAction = false
    let lastBubble = null
    let truncated = false
    stopBtn.classList.remove('hidden')
    sendBtn.disabled = true

    const r = await cfg.send(userText, {
      onDelta(ev) {
        /**
         * ★★ 2026-10-14（用户选 A："只要显示一次思考，但显示'新增 3 步'" ⇒ 一个回合一个块）：
         *   一轮里模型常走**多个 LLM 回合**（想 → 调工具 → 再想 → 再调工具 …）。原先整轮共用
         *   一个气泡，三次思考被 `reasoning +=` 累加进同一块 ⇒ 界面上"只显示一次思考"，与
         *   "新增 3 步"对不上 ✗。改：**按需建气泡** —— 回合边界（onToolCall）会把 cur 置空，
         *   于是下一回合的第一条增量会**新起一个气泡**，每个回合自成一块 ✓。
         */
        if (!cur || roundClosed) { cur = beginAssistant(); roundClosed = false }
        if (ev.type === 'reasoning') { reasoning += ev.text; cur.setReasoning(reasoning) }
        else if (ev.type === 'content') {
          content += ev.text
          cur.setContent(content)
          /**
           * ★★ 2026-10-14（task-2）：正文已经在写了 ⇒ "这一轮还没写讲解"的实时提示不再成立，
           *   当场撤掉。否则屏幕上会同时出现"还没写讲解"和它下面那段讲解（提示与事实相反）。
           */
          if (content.trim()) clearNoTextNote()
        }
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
        // ★ 本回合是不是真的"动了手"（与动作气泡同一判据）：没动手就不能说"排了演示"
        const isAction = info.name === SEQ_TOOL || !!ACTION_LABEL[info.name]
        if (isAction) turnHadAction = true
        /**
         * ★★ 2026-10-14（A 方案）：**一次工具调用 = 这一回合结束** ⇒
         *   收尾当前气泡（思考块折叠、正文定格），并把两个累加器清零，让下一回合**新起一块**；
         *   这样"想了几轮"在界面上就是"几个思考块"，与回执里的"新增 N 步"一一对应 ✓。
         *   ★ 置空 cur 后，若下一回合没有任何增量（例如直接结束），就不会多出一个空气泡 ✓。
         */
        if (cur) {
          /**
           * ★★ 2026-10-14（task-2）：**先把本回合的正文长度并进本轮累计，再清零 content**。
           *   判据因此是"本轮所有回合的正文都为空"，而不是"最后一个回合没写" ——
           *   后者才是那个会误报的写法（前面写过正文、最后一回合只调了工具）。
           */
          roundTextChars += content.trim().length
          cur.collapseThinking()
          cur.finish({ hasContent: true })
          // ★ 只标记"本回合已闭合"，**不置空 cur** —— onDone 还要用最后一个气泡收尾；
          //   置空会让"在工具调用处就结束"的轮次抛 Cannot read properties of null ✗（实测踩到）。
          roundClosed = true
          reasoning = ''
          content = ''
        }
        /**
         * ★★ 2026-10-14（task-2）：**在回合边界就交出可行动的提示**，不再攒到 onDone。
         *   · 判据 = 本回合没写正文 且 本轮累计正文仍为空（前提：本回合真的排了动作）；
         *   · 同一轮只说一次（showNoTextNote 幂等，五次工具调用不会变成五条提示）；
         *   · 后面某回合写出正文时由 onDelta 撤掉（那时它就不成立了）。
         */
        if (isAction && roundTextChars === 0) showNoTextNote()
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
        enrichActionBubble(lastBubble, info.result,
          (info.args && info.args.actions) || info.acts || null,
          (info.args && info.args.module) || info.module || null)
        lastBubble = null
      },
      onDone(summary) {
        /**
         * ★★ 2026-10-14（task-2）：**判据 = 本轮所有回合的正文累计为空**（不是最后一个回合）。
         *   一个回合一个气泡之后，多回合轮次的最后一回合常常确实没写正文（它只是又调了一次工具），
         *   而讲解早已在**前面某个回合**写出来了 —— 只看最后一个回合就会误报"没写正文" ✗。
         */
        const turnChars = roundTextChars + content.trim().length
        /**
         * 实时提示的使命到此为止：本轮已经结束，它那句"可以继续等它下一轮"不再成立。
         * 空正文这件事的**最终**说明（连 finish_reason / token 用量这类证据）由 finish()
         * 写在最后一个气泡里 —— 同一件事在屏幕上只留一份，不重复说。
         */
        clearNoTextNote()
        cur.finish({
          hasContent: turnChars > 0,
          truncated,
          finishReason: summary && summary.finishReason,
          usage: summary && summary.usage,
          hadAction: turnHadAction,
        })
        if (summary && summary.aborted) addChip('已停止（本次循环剩余动作已丢弃）', 'warn')
        /**
         * ★★ 2026-10-14（task-3 第 ① 项）：**在这里记下"这一轮真的结束了"**。
         *
         *   这一句就是第 ① 项"不要等 12–24 秒才恢复重画"的判据来源：runAgent 收尾据此
         *   撤在途标记、当场补画一次，并把看门狗的兜底等待缩短到 ~1.4 秒（见 endTurnRepaint）。
         *   刻意记在 `onDone`（正常收尾）而**不是** `onError`（出错）里：
         *   · 出错时那个在途气泡里写的正是**错误信息本身**（cur.setError），此刻撤标记重画会
         *     把它抹掉，学生连"出错了"都看不到 ✗ —— 老行为（等看门狗）反而更安全。
         *   ★ 判据不能放在 finish() 里：正文流式结束 ≠ 回合结束（finish() 里那条实测教训）。
         */
        turnEndedAt = Date.now()
      },
      onError(err) {
        clearNoTextNote()   // ★ 出错时那条"还没写讲解"的实时提示不再成立，先撤掉再说别的
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
    running = false
    /**
     * ★★ 2026-10-12（用户第 3 条）：本轮流式期间**别人要求重画过**，现在补上。
     *   典型来源：提问中途换板块 —— 路由挂载钩子会重画空态/消息列表。
     *   期间不能真画（会清掉正在流式的气泡），故记一个待办，到这里再执行。
     */
    if (pendingRender) {
      pendingRender = false
      try { renderPath() } catch (e) { /* 重画失败不影响这一轮的返回 */ }
    }
    /**
     * ★★ 2026-10-14（task-3 第 ①/② 项）：**回合结束的收尾**（只走正常结束这条路）。
     *
     *   · ① 撤在途标记 + 当场重画 ⇒ 学生不必等看门狗（12 秒、甚至两次到期 24 秒）；
     *   · ② 把演示条从"本批播完、回合还在跑"的中间态补画成终态（真·演示完成）。
     *   ★ onError 那条路不设 `turnEndedAt` ⇒ 这里整体跳过：错误气泡必须留在屏幕上，
     *     而它只存在于 DOM 里（重画会抹掉它）。老行为（等看门狗）在出错时反而更安全。
     */
    if (turnEndedAt) {
      try { endTurnRepaint() } catch (e) { /* 收尾重画失败不影响这一轮的返回 */ }
    }
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
    /**
     * ★★ 2026-10-14（task-3 第 ④ 项）：**"新增 K 步"并进这一步的文案**。
     *
     *   真因（实测）：`emitProgress(queued)`（"已完成 N/M 步 · 新增 K 步"）与紧接着的
     *   `emitProgress(step)` 落在**同一个 tick** 里，queued 那行字被 step **当场覆盖**，
     *   学生根本来不及看见 ✗（DOM 证据：MutationObserver 只录到一个文字值）。
     *   ⇒ 不再指望"那行字能被看到"，而是把这条信息**带进后面那条一定会渲染的 step 行**：
     *     `新增 3 步 · 第 1/7 步`。
     *   ★ 只消费一次（pendingAdded 用完即清）：后续步骤不该继续声称"新增"。
     */
    const added = pendingAdded
    pendingAdded = 0
    /**
     * ★ 文案复用**已登记的键**：`已完成 {index}/{total} 步 · 新增 {added} 步` 就是 queued
     *   那条用过的注册文案（见 i18n.js 的"演示控制条"一节）。为什么不新写一条
     *   `新增 {n} 步`：那需要同时改 `packages/agent-core/ui/i18n.js`（另一条写范围），
     *   而本任务只许动 panel.js / storyboard.js —— 复用注册键既不动别的文件，
     *   也不会有"英文界面里冒出中文"的窟窿（i18n:check 会逐条报出来）。
     *   语义也正好：`index-1` 就是"这一步之前已经走完的步数"，added 是本批新增。
     */
    demoIdx.textContent = (added > 0
      ? T('已完成 {index}/{total} 步 · 新增 {added} 步',
        { index: Math.max(0, (evt.index || 1) - 1), total: evt.total, added })
      : T('第 {index}/{total} 步', { index: evt.index, total: evt.total }))
      + (evt.ok === false ? T('（未执行）') : '')
    demoText.textContent = evt.speech || evt.label
    // ★ 记下"这一步说了什么"：演示完成时要把最后一步的旁白留着（用户报过它被顶掉）
    lastDemoSpeech = evt.speech || evt.label || ''
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
    /**
     * ★★ 2026-10-14（task-3 第 ④ 项）：先按原样把这句中间文案写进去（事件语义不变、
     *   换语言重放也照旧），同时**记下新增步数** —— 它会被下一条 step 的文案带上
     *   （见 renderStep 里那段说明：同一 tick 内这句一定会被覆盖，所以必须并进下一行）。
     */
    pendingAdded = Number(evt.added) > 0 ? Number(evt.added) : 0
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

  /**
   * ★★ 2026-10-14（task-3 第 ② 项）："本批播完、但回合还在跑"时的演示条文案。
   *
   *   实测（真机，修前）：auto 模式下**第一个批次只有 1 步**时，队列一播完就发出 done ⇒
   *   演示条当场显示「演示完成 / 共 1 步」，而模型同一轮稍后还会下发下一批（约 11 秒后
   *   才到）⇒ 学生盯着一个**说错话的终态**，然后它突然又变成"第 1/7 步"。
   *   判据：`running === true` 时这条演示**还没有结束**，就不许出现"演示完成"这个词。
   *   ★ 刻意**不**改分镜引擎去猜"还会不会再发一批"：storyboard 只知道"队列播完了"，
   *     那是回合层的知识（runAgent 的 running）。引擎只把歧义**显式报出来**
   *     （`queueDrained`，见 storyboard 里那段说明）。
   */
  function renderDoneProvisional(evt) {
    if (!demoBar) return
    lastDemoDoneEvt = evt || { total: qTotalOf(evt) }
    demoBarAwaiting = true
    clearTimeout(demoHideTimer)
    demoBar.classList.remove('hidden')
    setBarMode('done')
    /**
     * ★ 用**已登记的键**说"队列走完了、但这一轮还没结束"：不出现"演示完成"这个终态词，
     *   也不新造未登记的文案（理由同 renderStep 里那段）。`index` 取队列总步数 ⇒ `N/N`。
     */
    demoIdx.textContent = T('已完成 {index}/{total} 步', { index: qTotalOf(evt), total: qTotalOf(evt) })
    demoText.textContent = lastDemoSpeech || ''
    demoText.classList.toggle('muted', !lastDemoSpeech)
    /**
     * 提示行**保持隐藏**：中间态不能出现"共 N 步 · 可重新演示…"这类**终态**提示
     *   （那等于换个位置再说一次"演完了"）。回合真正结束后由 finalizeDemoBar 补上。
     */
    demoNextHint.classList.add('hidden')
  }

  /**
   * 队列总步数（终态文案用）。
   * ★ 优先问分镜要**此刻**的 total：done 事件里的 total 是那一刻的快照，而串行批次会续写
   *   同一条队列（第一批 1 步 + 第二批 6 步 ⇒ 真的共 7 步）。回合结束时队列已经不再变，
   *   问到的就是终值 —— 否则学生会看到"共 1 步"这个假终值（正是 task-3 第 ② 项的场景）。
   * ★ 桩 / 老事件没有 total 时回落到 0，绝不抛错。
   */
  function qTotalOf(evt) {
    const sb = cfg.storyboard
    const st = (sb && typeof sb.state === 'function') ? sb.state() : null
    if (st && Number(st.total) > 0) return Number(st.total)
    return (evt && evt.total) || 0
  }

  /**
   * 播完：**不自动收起**，把「上一步 / 重新演示」留在手边。
   *
   * ★★ 2026-10-14（task-3 第 ② 项）：**回合还在跑时不许把它当终态显示**（见 renderDoneProvisional）；
   *   回合确实结束了才画终态。判据是 `running`，不是"这个事件到没到"——事件到得早，
   *   终态就该晚一点画。
   *   ★ 还要看"这条 done 是不是**连播自己排空了队列**"（`queueDrained`，见 storyboard 的说明）：
   *     · queueDrained=true（连播走完）⇒ 模型**同一轮**里很可能还会再发一批 ⇒ 回合没结束
   *       就不是终态（这正是"第一批只 1 步 ⇒ 瞬时「共 1 步」"那个缺陷）。
   *     · queueDrained=false（手动模式走完）⇒ 学生一步一步看到底了，这就是终态，不必等回合。
   *     ★ 老事件没有这个字段时按 `false` 处理：宁可显示终态，也不要把一句已经确定的话拖着不画。
   *   ★ `force` = true：**回合结束**那条路（finalizeDemoBar）要求无条件画终态，不再看 running。
   */
  function renderDone(evt, force) {
    if (!demoBar) return
    const drained = evt && evt.queueDrained === true
    if (!force && running && drained) { renderDoneProvisional(evt); return }
    demoBarAwaiting = false
    lastDemoDoneEvt = null
    clearTimeout(demoHideTimer)
    demoNextHint.classList.add('hidden')
    demoBar.classList.remove('hidden')
    setBarMode('done')
    demoPrev.disabled = !(evt && evt.canPrev !== false && qTotalOf(evt) > 0)
    demoIdx.textContent = '演示完成'
    /**
     * ★★ 2026-10-11（用户："到了第五步，第五步的描述文字就没了"）：
     *   原先这里把主文字**换成**"共 N 步 · 可重新演示…" ✗ —— 学生看完演示，
     *   最后一步到底说了什么被顶掉了（而那往往正是结论）。
     *   ⇒ 完成时**保留最后一步的旁白**，把"共 N 步…"挪到下面那行提示里。
     */
    if (lastDemoSpeech) {
      demoText.textContent = lastDemoSpeech
      demoText.classList.remove('muted')
      demoNextHint.classList.remove('hidden')
      demoNextHint.textContent = T('共 {total} 步 · 可重新演示，或退回去重看某一步', { total: qTotalOf(evt) })
    } else {
      demoText.textContent = T('共 {total} 步 · 可重新演示，或退回去重看某一步', { total: qTotalOf(evt) })
      demoText.classList.add('muted')
    }
  }

  /**
   * ★ 回合真正结束后，把"等后续"的中间态补画成终态。
   *   ★ 幂等：没有处在中间态时什么都不做（endTurnRepaint 每轮都会调它）。
   *   ★ 这一步必须由**回合结束**驱动：done 事件到手时回合往往还没结束，
   *     那时没有任何后续进度事件会把演示条再画一次。
   */
  function finalizeDemoBar() {
    if (!demoBarAwaiting) return
    demoBarAwaiting = false
    const evt = lastDemoDoneEvt || {}
    lastDemoDoneEvt = null
    renderDone(evt, true)
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
    // ★ 记下最近一条演示的 id：演示条上的「☆ 收藏这次演示」用它（气泡里那条路要展开才能看到）
    if (evt.demoId) lastDemoId = evt.demoId
    /**
     * ★ 新会话之后的"停止"事件不该把演示条叫回来（见 demoSuppressed 的说明）；
     * 任何意味着"新演示开始"的阶段都会解除抑制。
     */
    if (evt.phase === 'stopped') {
      if (demoSuppressed) { hideBar(); return }
    } else {
      demoSuppressed = false
    }
    /**
     * ★★ 2026-10-14（task-3 第 ② 项）：**任何新的进度事件都说明"这条演示还在走"**
     *   ⇒ 撤掉"本批播完、等待后续"的中间态（终态补画是给回合结束用的，不是给新批次用的）。
     *   ★ stopped 是例外：它是"演示被结束"，此时那条中间态自然失效，但不必再补画终态 ——
     *     stopped 分支自己会把演示条画成"演示已停止"。
     */
    if (evt.phase !== 'done') {
      demoBarAwaiting = false
      lastDemoDoneEvt = null
    }
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
    /**
     * 撤掉所有"尚未配置 API Key"的提示（消息 + 提示条）。
     *
     * ★★ 2026-10-12（用户第 2 条）：配好 Key 之后那句红字必须消失 —— 它不是状态灯，
     *   而是一条**留在消息区里的消息**，不主动撤就永远挂着，看起来像"还没配好"。
     * @returns {number} 撤掉了几处
     */
    /**
     * 「新对话」时把演示相关的东西一并收掉。
     *
     * ★★ 2026-10-12（用户："进入新对话后，仍然残留演示信息"）：
     *   新会话只换了对话上下文，演示条还挂着上一段对话的「演示已停止」✗ ——
     *   新对话里再点「重新演示」，播的是**上一段对话**的演示，学生根本不知道它从哪来。
     *   ⇒ 新会话就该把演示停掉并收起控制条。
     *   ★ 这与「收起」不同：那个只藏条、**保留回放能力**（看完顺手收起还能再放）；
     *     新会话是"换了一段对话"，上一段的演示不该跟过来。
     * @returns {boolean} 是否真的收掉了一条在显示的演示条
     */
    resetDemo: () => {
      const wasActive = !!(demoBar && !demoBar.classList.contains('hidden'))
      /**
       * ★ 必须在 `SB.stop()` **之前**置抑制位：stop 会**同步**发出 `'stopped'`，
       *   而那条分支是"故意显示窄条"的 —— 先置位才能把它挡住。
       * ★ 顺带覆盖"停止事件晚到 / 再次发出"的情形（用户报的正是"新建会话后仍有残留"）。
       */
      demoSuppressed = true
      try { if (SB && typeof SB.stop === 'function') SB.stop() } catch (e) { /* 忽略 */ }
      hideBar()
      return wasActive
    },
    clearNoKeyNotices: () => {
      let n = 0
      doc.querySelectorAll('.agent-nokey').forEach((el) => { el.remove(); n++ })
      return n
    },
    /**
     * 撤掉**上一轮练习**留在面板里的卡片（知识点清单 / 选板块 / 题目卡 / 讲评卡）。
     *
     * ★★ 2026-10-12（用户截图：面板里"晶典在线的知识点清单"与"点群观鉴的 P1–P5 清单"
     *   上下叠在一起，还挂着上一轮的开始按钮）：
     *   练习相关的卡片都属于**只存在于 DOM 的节点**（见 domOnlyNodes 的说明），
     *   它们被"重画时保留"这条规则保护着 —— 而在**换板块再点练习**时，
     *   上一份清单没人撤 ⇒ 两份叠着 ✗。点击「练习」的语义就是"重新开始练"，
     *   所以入口处先把这些卡片清掉。
     * @returns {number} 撤掉了几张
     */
    clearPracticeCards: () => {
      // ★ domOnlyNodes() 现在返回 { el, afterMid }（为了按原位接回）—— 这里要取 `.el`，
      //   否则 el.remove 会抛异常、被 catch 吞掉 ⇒ 卡片清不掉而**看起来没报错**。
      const kept = domOnlyNodes()
      kept.forEach((it) => { try { it.el.remove() } catch (e) { /* 已脱落 */ } })
      return kept.length
    },
    /** 按当前板块换输入框提示（见 main.js 的分板块提示语） */
    setPlaceholder: (text) => { if (text) inputEl.placeholder = text },
    /** 输入框提示的当前值（供验证脚本断言） */
    placeholder: () => inputEl.placeholder,
    // 分支 / 会话 / 消息工具条（都建立在"对话是一棵树"之上）
    renderPath, attachActs, copyText, editUserMsg, reanswer, forkInto, branchBar,
    enterConvPage, leaveConvPage,
    /** 供测试/调试取用内部节点 */
    nodes: () => ({ fab, drawer, msgBox, inputEl, sendBtn, stopBtn, dot, demoBar, convPage }),
    setInput: (v) => { inputEl.value = v },
    /**
     * 走**与点「发送」完全相同**的入口跑一轮（读输入框 → runAgent）。
     *
     * ★★ 2026-10-15：加它是为了让实机验证能走真路径。此前验证脚本只能
     *   `app.send(text)` —— 那**不接面板的 handlers**，于是这一轮不落盘、不渲染，
     *   看起来像"发了没反应"（我自己就被它骗过一轮：等了 185 秒、store 里 0 条）。
     *   有了它，"真实一轮"可以端到端验证（含落盘、气泡、演示条）。
     */
    send: () => doSend(),
  }
}

export default createPanel
