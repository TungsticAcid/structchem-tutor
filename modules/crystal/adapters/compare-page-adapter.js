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
   * 把一批属性变更落到页面上。当前只支持高亮——这是智能体在对比页的核心诊断手段。
   * 其余字段（图层 / 显隐 / 外观）ComparePage 尚未接入，遇到时抛错。
   */
  function setProps(patch) {
    if (!patch || typeof patch !== 'object') return
    if (patch.highlightElements !== undefined) {
      page.applyIntent({ kind: 'highlight', elements: patch.highlightElements })
    }
    // ★ 其余字段暂不支持时**明确抛错**：facade.applyActions 会捕获成 failed，
    //   模型能看见并据此回应，而不是"我以为图层开了、其实什么都没发生"。
    for (const k of Object.keys(patch)) {
      if (k !== 'highlightElements') {
        throw new Error(`对比页暂不支持动作参数 ${k}（当前只支持高亮元素）`)
      }
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
     * 对比页本身已经是对比视图，不再"打开"对比——明确告知。
     */
    openCompareWith(b) {
      throw new Error('已在对比视图（当前页面本身就是并排对比）')
    },

    // ---- 诊断用 ----
    get page() { return page },
  }
}

export default createComparePageAdapter
