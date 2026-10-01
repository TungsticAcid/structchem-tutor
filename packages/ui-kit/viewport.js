/**
 * viewport.js — 视口自适应：让三维画布"正好"落在窗口里
 *
 * 为什么需要它：
 *   三维视图的高度原先写死在 CSS 里（clamp(280px, 44vh, 470px)）。写死有两个毛病：
 *     · 在不同窗口高度下，画布要么撑不下、要么下方留一大片空白；
 *     · 44vh 没有减去顶栏、卡片标题、内边距这些固定开销，所以"高度 = 窗口高"
 *       这个直觉上的等式从来就不成立。
 *
 * 做法：
 *   1. 量出画布顶端在**文档**中的位置（该值与画布自身高度无关 → 不会自激）；
 *   2. 用"真实可见高度 − 画布顶端位置 − 底部余量"作为画布高度；
 *   3. 通过 CSS 变量 --viewer-h 下发，CSS 侧写 `height: var(--viewer-h, 44vh)`，
 *      变量没算出来之前还能用视口单位兜底（渐进增强，不是硬编码）。
 *
 * ★ 多端注意：地址栏收起/展开会改变 innerHeight，但 visualViewport.height
 *   才是用户**真正看得到**的那块区域，所以优先用它。这是"适应不同浏览器"的实质。
 *
 * 来源：orbit/H5/js/layout.js（105 行），2026-09-24 迁入并把选择器提为配置
 *（原实现硬编码 #viewer 与 ['.topbar', '.viewer-card .card-head']）。
 */

/** 极端窗口下的保底：再小三维视图就没法用了 */
export const MIN_VIEWER_H = 220
/** 画布底边与窗口底边之间留一点呼吸空间 */
export const BOTTOM_GAP = 10
/** 高度变化小于此值就不折腾（避免反复触发重排） */
export const MIN_CHANGE = 2
/**
 * 面板等高在 ≤ 这个宽度下不启用：那时栅格已切成单列，面板在三维视图**下面**，
 * 钉死高度只会让它变成一个带滚动条的窄条。
 */
export const PANEL_SYNC_MIN_W = 1024

/**
 * 创建视口适配器。
 *
 * @param {Object}   opts
 * @param {string}   [opts.viewerSelector='#viewer']   三维画布的宿主元素
 * @param {string[]} [opts.chromeSelectors]            「会改变画布顶端位置、又不受画布高度影响」的元素
 * @param {string}   [opts.cssVar='--viewer-h']
 * @param {number}   [opts.minHeight]
 * @param {number}   [opts.bottomGap]
 * @param {Object}   [opts.doc]  document（可注入）
 * @param {Object}   [opts.win]  window（可注入）
 */
export function createViewport(opts = {}) {
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null)
  const win = opts.win || (typeof window !== 'undefined' ? window : null)
  if (!doc || !win) throw new Error('createViewport 需要 document 与 window（或注入 opts.doc/opts.win）')

  const viewerSelector = opts.viewerSelector || '#viewer'
  const chromeSelectors = opts.chromeSelectors || ['.topbar']
  const cssVar = opts.cssVar || '--viewer-h'
  const minHeight = opts.minHeight == null ? MIN_VIEWER_H : opts.minHeight
  const bottomGap = opts.bottomGap == null ? BOTTOM_GAP : opts.bottomGap
  // 面板等高（--panel-h）：面板与三维卡片**等高**，内部自己滚。
  // ★ 这是移植时**丢掉的一半** —— 上游 layout.js 有，本文件当初只搬了 --viewer-h。
  //   少了它，面板会跟着自己的内容无限变高（我们的面板比上游多两组控件），
  //   把同一行里的三维卡片留在 44vh 的兜底高度上。
  const panelSelector = opts.panelSelector || '.viewer-card'
  const panelCssVar = opts.panelCssVar || '--panel-h'
  const panelSyncMinW = opts.panelSyncMinWidth == null ? PANEL_SYNC_MIN_W : opts.panelSyncMinWidth
  const raf = opts.requestAnimationFrame || ((fn) => win.requestAnimationFrame(fn))
  const caf = opts.cancelAnimationFrame || ((id) => win.cancelAnimationFrame(id))

  let lastH = 0
  let lastPanelH = 0
  let rafId = null
  let ro = null
  let started = false

  /** 用户真正能看到的高度（优先 visualViewport，回退 innerHeight） */
  function visibleHeight() {
    const vv = win.visualViewport
    const h = (vv && vv.height) || win.innerHeight || 0
    return Math.round(h)
  }

  /** 量出画布顶端在文档中的纵坐标；量不到就返回 null */
  function viewerTopInDocument() {
    const el = doc.querySelector(viewerSelector)
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (!r || (r.width === 0 && r.height === 0)) return null   // 还没布局
    return Math.round(r.top + (win.scrollY || win.pageYOffset || 0))
  }

  function apply() {
    rafId = null
    const vh = visibleHeight()
    const top = viewerTopInDocument()
    if (!vh || top == null) return

    // 画布高度 = 可见高度 − 画布顶端位置 − 底部余量
    // （顶端位置里已经包含顶栏、布局内边距、卡片内边距、卡片标题这些固定开销）
    let h = vh - top - bottomGap
    h = Math.max(minHeight, Math.round(h))
    if (Math.abs(h - lastH) >= MIN_CHANGE) {
      lastH = h
      doc.documentElement.style.setProperty(cssVar, h + 'px')
    }
    // ★ 必须放在设 --viewer-h **之后**，且**不能**跟着上面那个 if 一起 return ——
    //   窗口只变窄不变高时 --viewer-h 不变，但面板高度仍可能需要重算
    //   （宽度一变就可能跨过 PANEL_SYNC_MIN_W 这条线）。
    //   上游的注释专门写了这条；本文件移植时正是把它写成了提前 return。
    syncPanelHeight()
  }

  /**
   * 让右侧面板与三维卡片**等高**。
   *
   * 量 `.viewer-card` 的实际高度下发给 `--panel-h`；CSS 侧只写
   * `height: var(--panel-h, auto)`，变量没算出来时按内容排布（渐进增强）。
   *
   * ★ 为什么不会自激（这是本函数唯一的风险点）：
   *   面板高度是从三维卡片**单向**量出来的，而 `.viewer-card` 带 `align-self: start`
   *   —— 它不会被同一行里更高的面板拉伸。所以"面板→栅格行高→三维卡片"这条回路
   *   在结构上就不存在。若哪天有人去掉那个 align-self，这里会开始振荡。
   * ★ 只在布局完成、拿到非零高度时才写，否则会把 --panel-h 钉成 0。
   */
  function syncPanelHeight() {
    const root = doc.documentElement
    if (win.innerWidth <= panelSyncMinW) {
      if (lastPanelH !== -1) { lastPanelH = -1; root.style.removeProperty(panelCssVar) }
      return
    }
    const card = doc.querySelector(panelSelector)
    if (!card) return
    // 上一步刚设过 --viewer-h，这里 getBoundingClientRect 会强制一次同步布局，
    // 所以读到的就是算完后的新高度（不需要等下一帧）。
    const h = Math.round(card.getBoundingClientRect().height)
    if (h < minHeight) return          // 还没布局 / 退化状态，别写
    if (Math.abs(h - lastPanelH) < MIN_CHANGE) return
    lastPanelH = h
    root.style.setProperty(panelCssVar, h + 'px')
  }

  /** 合并到下一帧再算，避免 resize 风暴里反复重排 */
  function schedule() {
    if (rafId) return
    rafId = raf(apply)
  }

  /**
   * 监视那些"会改变画布顶端位置、又不受画布高度影响"的元素。
   * ★ 刻意不观察 body —— 改画布高度会改 body 高度，观察 body 会形成自激循环。
   *   顶栏与卡片标题行的高度只由窗口宽度决定，观察它们是安全的。
   */
  function observeChrome() {
    if (!win.ResizeObserver) return
    ro = new win.ResizeObserver(schedule)
    for (const sel of chromeSelectors) {
      const el = doc.querySelector(sel)
      if (el) ro.observe(el)
    }
  }

  function destroy() {
    // ★ 离页时**必须**清掉这两个变量：它们是写在 documentElement 上的全局量，
    //   留着会让下一个页面（比如点群页）顶着上一个页面的画布高度。
    try {
      doc.documentElement.style.removeProperty(cssVar)
      doc.documentElement.style.removeProperty(panelCssVar)
    } catch (e) { /* 忽略 */ }
    if (ro) { ro.disconnect(); ro = null }
    win.removeEventListener('resize', schedule)
    win.removeEventListener('orientationchange', schedule)
    win.removeEventListener('load', schedule)
    if (win.visualViewport) win.visualViewport.removeEventListener('resize', schedule)
    started = false
  }

  function init() {
    if (started) return
    started = true
    schedule()
    win.addEventListener('resize', schedule)
    win.addEventListener('orientationchange', schedule)
    if (win.visualViewport) {
      // 移动端地址栏收放 / 软键盘弹出走的是这条路径
      win.visualViewport.addEventListener('resize', schedule)
    }
    observeChrome()
    // 字体/KaTeX 加载完成后布局可能微调，补算一次
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(schedule).catch(() => {})
    win.addEventListener('load', schedule)
  }

  return { init, destroy, apply, schedule, visibleHeight,
    debug: () => ({ viewerH: lastH, panelH: lastPanelH, vh: visibleHeight() }) }
}

export default createViewport
