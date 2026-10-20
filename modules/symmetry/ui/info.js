/**
 * 信息面板渲染模块
 * 展示结构信息、点群/空间群符号与对称元素清单（按共轭类分组，可展开独立控制显隐 + 播放动画）
 */
import { getSymmetryElementColor } from '../data/settings.js'
import { singleElementName, typeRank, findPrincipal } from '../engine/elementNaming.js'
import { t, formatGroupSymbol, formatIrrepLabel, formatFormulaU, formatBasisFunctions, formatSymmetrySymbol } from '../i18n/index.js'

/** 对称元素类型 → 教学说明（组头 tooltip；i18n 提供中英） */
function typeHint(type) {
  return t('elem.' + type)
}

/**
 * 特征标表类名/符号 → 带下标的 HTML（C2→C₂、σᵥ、S₄、2C₂′、σᵥ(xz)）
 * ★★ 2026-10-12（用户："还有特征标表"）：这里原先只加下标、**不斜体** ✗ ——
 *   而群符号与不可约表示早就斜体了 ⇒ 同一张表里 C 一处斜体一处正体。
 *   现在统一走 formatSymmetrySymbol（下标 + 主字母/σ 斜体 + 坐标斜体，**一条规则**）。
 *   ★ 下标**不能**在这里先插：formatSymmetrySymbol 内部第一步会**转义 HTML**，
 *     先插的 `<sub>` 会被转义成 `&lt;sub&gt;` 直接显示在界面上（实测踩到过）✗
 *     —— 下标规则已并入 italicizeSymmetrySymbols，在转义之后执行。
 */
function formatClassSymbol(s) {
  return formatSymmetrySymbol(s)
}

/**
 * 这一**族**元素是不是**无穷多个**（只管"个数"，与"阶"无关）。
 *
 * ★★ 2026-10-12（用户问「∞C₂×∞ 是啥意思」）——
 *   那句话确实读不通：名字与计数**各说了一遍 ∞**，而且混了两种不同的 ∞：
 *     · `C∞` / `S∞` 里的 ∞ 说的是**阶**（绕它转任意角度都是对称操作）⇒ **只有一根**；
 *     · 而 σᵥ / C₂′ 在 C∞v / D∞h 里是**真的有无穷多根**。
 *   所以这里把判据收紧成"**只有个数**"这一件事：
 *     · 线型群里 σᵥ 有无穷多个（任一含分子轴的平面都是）⇒ true
 *     · D∞h 里垂直主轴的 C₂ 亦然 ⇒ true
 *     · **C∞ / S∞ 返回 false**（它们是"阶无穷的一根轴"，不是"无穷多根轴"）
 *     · σh 与 i 在 D∞h 里**各只有一个** ⇒ false（把它们算成无限是另一种内容错误）
 *   ★ 只跟"个数"有关，所以清单里**不再**给名字加 `∞` 前缀（那是把"个数"塞进名字，
 *     与计数列重复）；特征标表的写法 `∞σᵥ / ∞C₂` 改由组头 tooltip 交代，
 *     两处口径仍然对得上，学生不会以为矛盾。
 */
export function isInfiniteFamily(type, elements) {
  const linear = (elements || []).some((e) => e && e.type === 'C∞')
  if (!linear) return false
  return type === 'sigma_v' || type === 'C2'
}

/**
 * 特征标表 / 教科书里对"无穷多"的写法（tooltip 用）：σᵥ → ∞σᵥ，C₂′ → ∞C₂′。
 * 只有真正无穷多的族才有这个写法；C∞ / S∞ 本身就是符号，不在此列。
 */
export function infiniteFamilyNotation(type, elements) {
  if (!isInfiniteFamily(type, elements)) return ''
  return type === 'sigma_v' ? '∞σᵥ' : '∞C₂′'
}

/**
 * 立体描述符 E / Z（以及同类的 R / S）在分子名里**用斜体**。
 *
 * ★★ 2026-10-12（用户贴图："Z，E需要斜体"）：
 *   IUPAC 的规矩是——**描述符字母斜体、位次与括号正体**：
 *     (E)-1,2-二氯乙烯 → (<i>E</i>)-1,2-二氯乙烯
 *     (2E,4Z)-…        → (2<i>E</i>,4<i>Z</i>)-…      （数字正体，字母斜体）
 *   ★ 只在该括号**整段都是描述符**时才动手（`(E)`、`(2E,4Z)`、`(1R,2S)`），
 *     所以 `(CH₃)₂`、`（C₂H₂Cl₂）` 这类化学式括号不会被误斜体。
 *   ★ 位次里的中文全角括号也认（数据里目前是半角，认两种不必改数据）。
 */
export function formatStereodescriptors(name) {
  const s = String(name == null ? '' : name)
  const RE = /^([（(])((?:\d*[EZRS])(?:,\s*\d*[EZRS])*)([）)])/
  const m = s.match(RE)
  if (!m) return s
  const inner = m[2].replace(/(\d*)([EZRS])/g, (_, num, letter) => num + '<i>' + letter + '</i>')
  return m[1] + inner + m[3] + s.slice(m[0].length)
}

/**
 * 渲染信息面板
 * @param {Object} info - { title, formula, groupSymbol, groupName, meta, elements, characterTable }
 * @param {Object} callbacks - { onToggle(index, visible), onPlay(index) }
 */
export function renderInfo(info, callbacks = {}) {
  /** 各组「勾选态 ↔ 模块状态」的同步函数（见函数末尾的 syncVisibility） */
  const syncers = []
  // ★ innerHTML：立体描述符要斜体（(E)-… → (<i>E</i>)-…），见 formatStereodescriptors
  document.getElementById('struct-title').innerHTML = formatStereodescriptors(info.title || '—')
  document.getElementById('struct-formula').textContent = formatFormulaU(info.formula || '')
  document.getElementById('group-symbol').innerHTML = formatGroupSymbol(info.groupSymbol)
  document.getElementById('group-name').textContent = info.groupName || ''
  document.getElementById('group-meta').textContent = info.meta || ''

  // ==================== 对称元素列表（按共轭类折叠分组） ====================
  const listEl = document.getElementById('elements-list')
  listEl.innerHTML = ''

  const elements = info.elements || []
  if (elements.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'elem-item'
    empty.textContent = t('info.none')
    listEl.appendChild(empty)
  }

  // 恒等元素 E：无空间几何，作为静态说明行列出（无显隐勾选 / 动画按钮 / 3D 标签）
  const identityElems = elements.filter(el => el.type === 'E')
  for (const el of identityElems) {
    const item = document.createElement('div')
    item.className = 'elem-item'
    item.title = typeHint(el.type)
    const dot = document.createElement('span')
    dot.className = 'elem-dot'
    dot.style.background = getSymmetryElementColor(el.type)
    const lab = document.createElement('span')
    lab.className = 'elem-label'
    // ★ 对称元素符号：主字母斜体（formatSymmetrySymbol 内含坐标斜体），见其注释
    lab.innerHTML = formatSymmetrySymbol(el.label || singleElementName(el.type))
    item.append(dot, lab)
    listEl.appendChild(item)
  }

/** 参与分组/交互的仅非恒等元素；index 保留原始下标，与 3D items / onToggle / onPlay 对齐 */
  const interactive = []
  elements.forEach((el, i) => { if (el.type !== 'E') interactive.push({ el, index: i }) })

  // 主轴（最高阶 C 真轴）— 排序置顶
  const principal = findPrincipal(elements)

  // 按「共轭类」（el.name 专业类名，如 σᵥ/σd/σᵥ(xz)）分组，按点群判断规则排序
  const groupMap = new Map()
  const order = []
  interactive.forEach(({ el, index }) => {
    const key = el.name || singleElementName(el.type)
    if (!groupMap.has(key)) {
      const rank = typeRank(el.type, el.order || 0, !!principal && el.type === principal.el.type)
      groupMap.set(key, { className: key, type: el.type, rank, count: 0, items: [] })
      order.push(key)
    }
    const g = groupMap.get(key)
    g.count++
    g.items.push({ el, index })
  })
  order.sort((a, b) => groupMap.get(a).rank - groupMap.get(b).rank)

  for (const className of order) {
    const g = groupMap.get(className)
    const color = getSymmetryElementColor(g.type)
    /**
     * 这一族是不是**无穷多个**（只管个数，见 `isInfiniteFamily` 的说明）。
     * ★ 名字与计数**只用这一条判据**，且**各说一件事**：
     *   名字里的 ∞ 只能是符号本身（C∞ / S∞ 的"阶无穷"）；
     *   计数列的 ∞ 只表示"个数无穷多"。
     *   原先两处都写 ∞ ⇒ 出现「∞C₂ ×∞」这种读不通的行（用户问"这是啥意思"）。
     */
    const infFamily = isInfiniteFamily(g.type, elements)

    // 组头（点击折叠/展开）
    const header = document.createElement('div')
    header.className = 'elem-group-header'
    // tooltip：常规类型说明 + （无穷多时）特征标表里的写法 —— 两处口径对得上
    const notation = infiniteFamilyNotation(g.type, elements)
    header.title = notation
      ? typeHint(g.type) + ' ' + t('elem.infFamilyHint', { notation })
      : typeHint(g.type)
    const dot = document.createElement('span')
    dot.className = 'elem-dot'
    dot.style.background = color
    const nameSpan = document.createElement('span')
    // ★ innerHTML：坐标变量要斜体（σᵥ(yz) → σᵥ(<i>y</i><i>z</i>)）
    //   **不再加 ∞ 前缀**：∞ 只出现在"名字本身含 ∞ 的符号"（C∞ / S∞）与计数列里。
    nameSpan.innerHTML = formatSymmetrySymbol(className)
    const count = document.createElement('span')
    count.className = 'elem-count'
    /**
     * 计数列的两种含义必须分清（用户问「∞C₂×∞ 是啥意思」时查出来的）：
     *   · `×∞` —— 这一族**有无穷多个**（C∞v 的 σᵥ、D∞h 的 C₂′）；
     *   · `×1`  —— **一根**（C∞、S∞ 就是各一根：它们的 ∞ 是**阶**，不是个数）。
     *   ★ 原先 `isInfiniteElement('C∞')` 也返回 true ⇒ 显示「C∞ ×∞」，
     *     那是把"阶无穷"当成了"无穷多根"，属于**内容错误**（C∞v 只有一根分子轴）。
     * ★★ 也不能写成 `×1` 的那一类（早先的缺陷）：C∞v 的 σᵥ 有无穷多个，
     *   而生成器只给一个代表面 ⇒ 学生会以为只有一个镜面。
     */
    count.textContent = infFamily ? '×∞' : `×${g.count}`
    const arrow = document.createElement('span')
    arrow.className = 'elem-arrow'
    arrow.textContent = '▸'
    /**
     * ★★ 2026-10-13（用户："支持对同类对称元素全选"）：
     *   组头加一个**同选**复选框：一下把 σᵥ(1)(2)(3) 一起勾上/取消 ✗
     *   原先只能逐个点 ✗（NH₃ 的 3 个 σᵥ、D3h 的多个 C₂′ 都要点很多下）。
     *   · 走的是**同一批动作**（每个个体一次 `onToggle`）⇒ 与单个勾选同源，没有第二条真源；
     *   · 三态：全勾 = 勾、全不勾 = 空、混杂 = 半选（indeterminate），一眼能看出"这类没全开"。
     *
     * ★★ 2026-10-13 补（用户："左边一个有复选框一个没有，不太对称"）：
     *   我第一版加了"这一类 >1 个才显示"的条件 ✗ —— 于是 C₃（×1）那一行少了这一格，
     *   圆点/名字/计数整列**左移**，两行对不齐 ✗。用户看的就是这个。
     *   ⇒ 改成**每行都留这一格**（×1 的那一行，勾上/取消就是选中它自己，语义仍然对）。
     *     对不齐的根子不在"要不要控件"，而在"**有没有占位**" —— 布局别让内容决定。
     */
    const items = g.items || []
    const groupCb = document.createElement('input')
    groupCb.type = 'checkbox'
    groupCb.className = 'elem-group-cb'
    groupCb.title = t('elem.selectAllSame')
    groupCb.checked = items.every(({ el }) => el.defaultVisible !== false)
    groupCb.indeterminate = items.some(({ el }) => el.defaultVisible !== false) && !groupCb.checked
    // ★ 点它不该顺手折叠/展开这一组（组头自己的 click 会做那件事）
    groupCb.addEventListener('click', (e) => e.stopPropagation())
    groupCb.addEventListener('change', () => {
      const on = groupCb.checked
      for (const { index } of items) {
        if (callbacks.onToggle) callbacks.onToggle(index, on)
      }
      syncGroupCb()
    })
    header.append(groupCb, dot, nameSpan, count, arrow)

    // 组体（默认折叠，展开后每个个体 checkbox + 播放按钮）
    const body = document.createElement('div')
    body.className = 'elem-group-body'
    body.hidden = true
    const childCbs = []
    /**
     * 每个子行的"勾选态 → 播放按钮显隐"。
     *
     * ★★ 2026-10-14（用户："现在只有 C₃ 有（▶），σ 之前有，现在没了"）：
     *   ▶ 的显隐规则是"仅当前可见（勾选）的行显示，隐藏行留同尺寸占位"（见下），
     *   而它原先只在**建行时**与**子勾选框自己的 change** 里算过 ✗ ——
     *   从**状态**灌回来的那条路（`syncers`，勾选框从模块状态同步）只改 `checked`、
     *   不碰 ▶ ⇒ NH₃ 的 σᵥ 默认隐藏、建行时 ▶ 被藏起来，之后无论怎么勾选都**再也不出现** ✗
     *   （用户截图：σᵥ(1)(2)(3) 三行都勾着，却一个 ▶ 也没有）。
     *   ⇒ 与 childCbs 同序存一份同步函数，两条路都调它 —— 同一条规则只留一处实现。
     */
    const childRowSync = []
    /**
     * 组级复选框的三态：全勾 / 全不勾 / 半选。
     * ★ 每次任何一个子项变了都重算一次 —— 否则学生手动取消了 σᵥ(2)，
     *   组头还显示"全选"，看起来像坏了。
     */
    const syncGroupCb = () => {
      if (!groupCb) return
      const checked = childCbs.filter((c) => c.checked).length
      groupCb.checked = checked === childCbs.length && childCbs.length > 0
      groupCb.indeterminate = checked > 0 && checked < childCbs.length
    }
    for (const { el, index } of g.items) {
      const row = document.createElement('div')
      row.className = 'elem-item'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = el.defaultVisible !== false
      childCbs.push(cb)
      const lab = document.createElement('span')
      lab.className = 'elem-label'
      // ★ 对称元素符号：主字母斜体（formatSymmetrySymbol 内含坐标斜体），见其注释
    lab.innerHTML = formatSymmetrySymbol(el.label || singleElementName(el.type))
      // 播放按钮：仅当前可见（勾选）的行显示，隐藏行预留同尺寸占位
      const play = document.createElement('button')
      play.className = 'elem-play'
      play.textContent = '▶'
      play.title = t('anim.playTitle')
      const setPlayVisible = () => { play.style.visibility = cb.checked ? 'visible' : 'hidden' }
      setPlayVisible()
      childRowSync.push(setPlayVisible)
      play.addEventListener('click', (e) => {
        e.stopPropagation()
        if (callbacks.onPlay) callbacks.onPlay(index)
      })
      cb.addEventListener('change', () => {
        if (callbacks.onToggle) callbacks.onToggle(index, cb.checked)
        setPlayVisible()
        syncGroupCb()          // 手动改了某一项 ⇒ 组头的三态要跟着重算（否则显示"全选"像坏了）
      })
      row.append(cb, lab, play)
      body.appendChild(row)
    }

    header.addEventListener('click', () => {
      body.hidden = !body.hidden
      arrow.textContent = body.hidden ? '▸' : '▾'
    })

    if (groupCb) syncGroupCb()

    listEl.appendChild(header)
    listEl.appendChild(body)
    syncers.push((hidden, keyOfIndex) => {
      for (let k = 0; k < childCbs.length; k++) {
        /**
         * ★ 这一份元素对象**没有 `key`** —— key（`sigma_v#1` 这种稳定 id）住在页面的 items 上，
         *   本层只按**下标**与它们对齐。所以同步时由**页面**给出"索引 → key"的映射 ✗
         *   （第一版直接读 `el.key` ⇒ 永远 undefined ⇒ 状态改了、勾选框纹丝不动，实测抓到的）。
         */
        const idx = g.items[k] && g.items[k].index
        const key = typeof keyOfIndex === 'function' ? keyOfIndex(idx) : null
        childCbs[k].checked = !(key && hidden.has(key))
        // ★ 勾选态一变，▶ 的显隐必须跟着走（用户报的正是"σ 的 ▶ 没了"）
        if (childRowSync[k]) childRowSync[k]()
      }
      syncGroupCb()
    })
  }

  // ==================== 特征标表（默认折叠） ====================
  renderCharacterTable(info.characterTable, callbacks)

  /**
   * ★★ 2026-10-13：把"模块状态里的隐藏集合"灌回**勾选框**。
   *   原先只有 3D 画面跟着状态走 ✓、复选框停在**建 DOM 时**的初值 ✗ ——
   *   于是模型（或别的入口）隐藏了某个元素，面板上的勾还打着 ⇒ 图文不一致。
   *   现在页面每次 renderFromState 都调它一次，勾选态与真源一致。
   * @param {Set<string>} hidden 隐藏元素的稳定 key 集合
   * @param {(index:number)=>string|null} [keyOfIndex]
   *        索引 → 稳定 key。★ 必须由**页面**给：这份元素对象里没有 `key`
   *        （key 住在页面的 items 上，info 层只按**下标**与它们对齐）。
   */
  return {
    syncVisibility(hidden, keyOfIndex) {
      const h = hidden instanceof Set ? hidden : new Set()
      for (const fn of syncers) fn(h, keyOfIndex)
    },
  }
}

/**
 * 渲染特征标表折叠区
 * @param {Object|null} ct - { classes, irreps } 或 null
 */
function renderCharacterTable(ct, callbacks = {}) {
  const wrap = document.getElementById('character-table-wrap')
  if (!wrap) return
  wrap.innerHTML = ''

  if (!ct) {
    wrap.style.display = 'none'
    return
  }
  wrap.style.display = 'block'

  const header = document.createElement('div')
  header.className = 'ct-header'
  header.textContent = t('ct.title') + ' ▸'
  const body = document.createElement('div')
  body.className = 'ct-body'
  body.hidden = true
  header.addEventListener('click', () => {
    body.hidden = !body.hidden
    header.textContent = t('ct.title') + ' ' + (body.hidden ? '▸' : '▾')
    // 表格是在折叠状态下渲染的（clientWidth=0），展开后必须重新量一次，
    // 否则自定义滚动条会一直停在 hidden（实测：展开后 scrollWidth 396 > clientWidth 300，
    // 但 syncBar 仍按两次 0 宽判定"不需要滚动"）。
    requestAnimationFrame(syncBar)
  })

  // 表格
  const table = document.createElement('table')
  table.className = 'ct-table'
  const thead = document.createElement('thead')
  const htr = document.createElement('tr')
  const th0 = document.createElement('th')
  th0.textContent = t('ct.irreps')
  htr.appendChild(th0)
  for (const cls of ct.classes) {
    const th = document.createElement('th')
    th.innerHTML = formatClassSymbol(cls)
    htr.appendChild(th)
  }
  const thBasis = document.createElement('th')
  thBasis.textContent = t('ct.linear')
  htr.appendChild(thBasis)
  const thQuad = document.createElement('th')
  thQuad.textContent = t('ct.quad')
  htr.appendChild(thQuad)
  thead.appendChild(htr)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  for (const irrep of ct.irreps) {
    const tr = document.createElement('tr')
    const tdLabel = document.createElement('td')
    tdLabel.className = 'ct-irrep'
    tdLabel.innerHTML = formatIrrepLabel(irrep.label)
    tr.appendChild(tdLabel)
    for (const ch of irrep.characters) {
      const td = document.createElement('td')
      td.textContent = ch
      tr.appendChild(td)
    }
    const tdLinear = document.createElement('td')
    tdLinear.className = 'ct-basis'
    // ★ 基函数列：x/y/z 与 R 要斜体（原先 textContent，怎么改都不生效）
  tdLinear.innerHTML = formatBasisFunctions(irrep.linear || '')
    tr.appendChild(tdLinear)
    const tdQuad = document.createElement('td')
    tdQuad.className = 'ct-basis'
    tdQuad.innerHTML = formatBasisFunctions(irrep.quadratic || '')
    tr.appendChild(tdQuad)
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)

  body.appendChild(table)
  wrap.appendChild(header)
  wrap.appendChild(body)

  // ★★ 2026-10-20（用户："特征标表会存在文字太宽显示不开的情况，应有左右滚动条"）：
  //   Windows 的 overlay 滚动条平时是"悬停才出现"的（实测 offsetHeight===clientHeight，
  //   即浏览器根本没给滚动条留位置），只靠原生滚动条用户会以为不能滚。这里在表体下面
  //   **画一条始终可见的自定义滚动条**，并支持拖动/点击跳转；原生滚动仍然保留
  //   （触控板横滑、Shift+滚轮照样生效）。
  const bar = document.createElement('div')
  bar.className = 'ct-scrollbar'
  bar.setAttribute('role', 'scrollbar')
  bar.setAttribute('aria-orientation', 'horizontal')
  const thumb = document.createElement('div')
  thumb.className = 'ct-scrollbar-thumb'
  bar.appendChild(thumb)
  wrap.appendChild(bar)

  const maxScroll = () => Math.max(0, body.scrollWidth - body.clientWidth)
  const syncBar = () => {
    const max = maxScroll()
    if (max <= 0) { bar.hidden = true; return }
    bar.hidden = false
    const trackW = bar.clientWidth
    const ratio = body.clientWidth / Math.max(1, body.scrollWidth)
    const thumbW = Math.max(28, Math.round(trackW * ratio))
    const travel = Math.max(0, trackW - thumbW)
    const x = max > 0 ? (body.scrollLeft / max) * travel : 0
    thumb.style.width = thumbW + 'px'
    thumb.style.transform = 'translateX(' + x + 'px)'
    bar.setAttribute('aria-valuenow', String(Math.round(body.scrollLeft)))
    bar.setAttribute('aria-valuemax', String(max))
  }

  body.addEventListener('scroll', syncBar, { passive: true })
  let dragging = false
  let dragX = 0
  let dragLeft = 0
  let dragTravel = 0
  thumb.addEventListener('pointerdown', (e) => {
    dragging = true
    dragX = e.clientX
    dragLeft = body.scrollLeft
    const trackW = bar.clientWidth
    const ratio = body.clientWidth / Math.max(1, body.scrollWidth)
    dragTravel = Math.max(0, trackW - Math.max(28, Math.round(trackW * ratio)))
    try { thumb.setPointerCapture(e.pointerId) } catch { /* 老浏览器忽略 */ }
    e.preventDefault()
  })
  thumb.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const max = maxScroll()
    if (dragTravel <= 0 || max <= 0) return
    body.scrollLeft = dragLeft + ((e.clientX - dragX) * max) / dragTravel
  })
  const endDrag = () => { dragging = false }
  thumb.addEventListener('pointerup', endDrag)
  thumb.addEventListener('pointercancel', endDrag)
  bar.addEventListener('pointerdown', (e) => {
    if (e.target === thumb) return
    const rect = bar.getBoundingClientRect()
    const max = maxScroll()
    const ratio = body.clientWidth / Math.max(1, body.scrollWidth)
    const thumbW = Math.max(28, Math.round(rect.width * ratio))
    const travel = Math.max(1, rect.width - thumbW)
    const x = Math.min(travel, Math.max(0, e.clientX - rect.left - thumbW / 2))
    body.scrollLeft = (x / travel) * max
  })
  requestAnimationFrame(syncBar)
}
