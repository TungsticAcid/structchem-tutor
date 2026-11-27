/**
 * compare-page-adapter.js — 把 `ComparePage`（双晶体并排页）适配成智能体门面所需的 view 接口
 *
 * ★ 为什么要有它：智能体的受控动作通过「惰性视图代理 → 当前 adapter」落到页面，
 *   而 `ComparePage` 此前**没有注册**到 view-registry，于是智能体在对比页时
 *   `getAdapter()` 返回 null —— 表现为"返回 {error: 当前没有可驱动的三维视图}"
 *   （实测反馈）。注册本适配器后，智能体在对比页也能驱动画面。
 *
 * ★ 与 viewer-page-adapter 的差异：
 *   · ComparePage 有**两个画布**（左主晶体 / 右对比晶体），没有单一的 `_canvasComponent`；
 *   · 高亮（highlightElements）两侧**共享同一份**状态，但各画布只点亮自己含有的元素
 *     （ViewerCanvas 按元素符号匹配），所以"高亮 Na 和 Cs"会左亮 Na、右亮 Cs，正好用于对比配位。
 *
 * ★ 权限口径：本适配器只**如实暴露 ComparePage 已实现的能力**。目前聚焦"高亮"
 *   （highlightElements 是智能体在对比页做可视化诊断的主要手段）；其余动作（图层、
 *   显隐、外观）ComparePage 暂未接入智能体驱动，遇到时**明确抛错**而非静默忽略。
 */

/**
 * 创建 ComparePage 的适配器。
 *
 * @param {Object} page ComparePage 实例（需具备 applyIntent / getViewProps）
 * @returns {Object} 门面契约要求的 view 接口
 */
export function createComparePageAdapter(page) {
  if (!page) throw new Error('createComparePageAdapter 需要 page')
  for (const m of ['applyIntent', 'getViewProps']) {
    if (typeof page[m] !== 'function') {
      throw new Error(`ComparePage 缺方法 ${m}（适配器依赖它实现门面契约）`)
    }
  }

  /** 左侧画布（主晶体）。视角操作以它为准；右侧随同步模式联动。 */
  const canvasOf = () => page._leftCanvas || null

  /**
   * 对比页能接的 viewer 风格属性。★ 默认**两侧同改**：
   *   "两侧都不显示化学键，再在 Cu 一侧打开八面体空隙"是最常见的对照教学，
   *   而 NaCl 侧没有空隙数据，打开也什么都不画 —— 于是同改不会造成误导。
   *   需要逐侧差异时，学生自己在控制面板上单独调。
   */
  const SIDE_PROPS = new Set([
    'showAtoms', 'showWireframe', 'showInterstices', 'showOctahedral', 'showTetrahedral',
    'showBonds', 'showAxes', 'showLatticePoints', 'showAtomLabels', 'showHydrogenBonds',
    'showAuxiliaryBody', 'showAuxiliaryFace',
    'atomScale', 'stickRadius', 'opacity', 'cellDisplayMode', 'atomVisibility',
  ])

  function setProps(patch) {
    if (!patch || typeof patch !== 'object') return
    if (patch.highlightElements !== undefined) {
      page.applyIntent({ kind: 'highlight', elements: patch.highlightElements })
    }
    const rest = {}
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'highlightElements') continue
      // 只切左侧晶体：右侧那块不动，会造成"左右不是同一组对比"的错觉
      if (k === 'crystalId') {
        const cur = page.getViewProps().crystalId
        if (v === cur) continue
        throw new Error('对比页不能单独换左侧晶体；请用 openCompareView({ a, b }) 指定这一组')
      }
      if (!SIDE_PROPS.has(k)) {
        throw new Error(`对比页暂不支持动作参数 ${k}（可用：图层 / 外观 / 元素高度）`)
      }
      rest[k] = v
    }
    if (Object.keys(rest).length) {
      page.applySideProps('left', rest)
      page.applySideProps('right', rest)
    }
  }

  return {
    // ---- 门面契约必需 ----
    getProps: () => page.getViewProps(),
    setProps,

    // ---- 门面契约可选 ----
    getViewState: () => {
      const c = canvasOf()
      return c && typeof c.getViewState === 'function' ? c.getViewState() : null
    },

    /** 切到预置视角（两侧同步，保持"同一视角对比"的意义） */
    setView: (direction) => {
      const c = canvasOf()
      if (c && typeof c.setView === 'function') c.setView(direction)
      const r = page._rightCanvas
      if (r && typeof r.setView === 'function') r.setView(direction)
    },

    resetView: () => {
      const c = canvasOf()
      if (c && typeof c.resetView === 'function') c.resetView()
      const r = page._rightCanvas
      if (r && typeof r.resetView === 'function') r.resetView()
    },

    /**
     * 回设视角状态。★ 对比页**只回设左侧**（主口径），右侧随同步模式联动——
     *   若强行分别回设两侧，等于把用户的"独立模式"选择也覆盖掉。
     */
    setViewState: (state) => {
      const c = canvasOf()
      return c && typeof c.applyViewState === 'function' ? c.applyViewState(state) : false
    },

    /** 门面用它作为 DOM 事件的宿主（onAction 的事件绑定） */
    getContainer: () => {
      const c = canvasOf()
      return c && typeof c.getContainer === 'function' ? c.getContainer() : null
    },

    get canvas() {
      const c = canvasOf()
      return c ? c.canvas : null
    },

    /**
     * 在对比页内换第二块晶体（右耳侧）。
     * ★ 页面自己会走路由重建：右侧画布、设置面板、标签、能力判据都要按新晶体重建。
     */
    openCompareWith(b) {
      page.openCompareWith(b)
    },

    /** 逐侧还原（「回到演示前」用）：对比页两侧状态本就不同，只能一侧一侧地回设 */
    applySideProps(side, patch) {
      return page.applySideProps(side, patch)
    },

    // ---- 诊断用 ----
    get page() { return page },
  }
}

export default createComparePageAdapter
