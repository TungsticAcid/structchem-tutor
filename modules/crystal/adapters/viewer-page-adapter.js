/**
 * viewer-page-adapter.js — 把 `ViewerPage` 适配成智能体门面所需的 `view` 接口
 *
 * ★ 这是整个接入的**技术枢纽**，它解决三个必须一起解决的问题：
 *
 *   ① **门面需要 `getProps()`，而 `ViewerCanvas` 没有**（本仓库的版本缺它）。
 *      → 本适配器走 `page.getViewProps()`，它返回 ViewerPage 的两组 props 之并集
 *        （见下方"为什么不能只读 ViewerCanvas"）。
 *
 *   ② **状态的唯一真理源在 `ViewerPage._state`，而它有两个消费者**：
 *      `ViewerCanvas`（画面）与 `LayerControl`（底部控件）。若智能体绕过页面直接
 *      调 `canvas.setProps()`，**控件显示会与实际画面分叉**——用户看到"原子层开着"
 *      而画面里原子是隐藏的。门面的文件头专门警告过这类漂移："智能体以为某图层开着、
 *      其实被用户关了，这类错误极难发现"。
 *      → 本适配器的 `setProps` **一律经 `page.applyIntent()`**，那里调用的就是
 *        用户操作触发的**同一批处理器**，因此两个消费者都会被同步。
 *
 *   ③ **"用户的操作与智能体的操作走同一条通路"** —— 这是感知层能"看见"用户行为的
 *      前提（主动介入依赖它）。两条路径的交集是同一个函数，不存在两套语义。
 *
 * ★ 为什么不能只读 `ViewerCanvas.getProps()`（19 个字段）：
 *   `LayerControl` 消费的是**另一组 22 个字段**（含 crystalMeta / crystalData /
 *   showIntersticeControl / isMolecularCrystal / hasHydrogenBonds / isOrthogonalCell /
 *   equivalentSettings），这些 `ViewerCanvas` 根本不知道。更关键的是
 *   `showIntersticeControl` 直接决定控件上**有没有"八面体空隙"那个开关**——
 *   若智能体只改画布，对 hcp/fcc 之外的晶体，画面里出现了空隙而控件区找不到开关，
 *   用户无法自己关掉它。相反方向同理：用户关掉总开关后，画布是同步的
 *   （`_updateCanvasProps` 在同一处理器里被调用），但控件侧的字段只有页面知道。
 *   故走 `page.getViewProps()` 才完整。
 */
import { LAYER_PROPS } from '../actions.js'

/**
 * `ViewerCanvas` 属性名 → `ViewerPage._onLayerChange` 认的图层友好名。
 *
 * ★ 顺序即处理顺序，且**必须与 `LAYER_PROPS` 的声明序一致**：
 *   这样 `interstices`（空隙总开关）先于 `octahedral`/`tetrahedral` 处理，
 *   一次性 patch 里同时含总开关与子层时结果可预期。
 *
 * ★ `showAtomLabels` **刻意不在表内**：它走 `_onAtomLabelsToggle`，而
 *   `_onLayerChange` 的 map 里没有 `atomLabels`。若把它当普通图层传进去，
 *   会命中 `if (!key) return` —— **不报错、静默无效**。这类"看起来应该生效、
 *   实际什么也没发生"的错误最难发现，故在此显式单列。
 */
const LAYER_BY_PROP = {
  showAtoms: 'atoms',
  showBonds: 'bonds',
  showWireframe: 'wireframe',
  showInterstices: 'interstices',
  showOctahedral: 'octahedral',
  showTetrahedral: 'tetrahedral',
  showSymmetry: 'symmetry',
  showAxes: 'axes',
  showAuxiliaryBody: 'auxiliaryBody',
  showAuxiliaryFace: 'auxiliaryFace',
  showHydrogenBonds: 'hydrogenBonds',
  showLatticePoints: 'latticePoints',
}

/** 外观类属性：当前页面没有专门的 UI 处理器，直接改状态并同步两个消费者 */
const APPEARANCE_PROPS = ['atomScale', 'stickRadius', 'opacity']

/**
 * 创建一个 ViewerPage 的适配器。
 *
 * @param {Object} page ViewerPage 实例（需具备 applyIntent / getViewProps / setCrystal
 *                      与 _canvasComponent）
 * @returns {Object} 门面契约要求的 view 接口
 */
export function createViewerPageAdapter(page) {
  if (!page) throw new Error('createViewerPageAdapter 需要 page')
  for (const m of ['applyIntent', 'getViewProps', 'setCrystal']) {
    if (typeof page[m] !== 'function') {
      throw new Error(`page 缺方法 ${m}（适配器依赖它实现门面契约）`)
    }
  }

  const canvasOf = () => page._canvasComponent || null

  /**
   * 把一批属性变更落到页面上。
   *
   * ★ 只经 `page.applyIntent()`：那是"用户操作"走的同一条通路。
   *   **不要**在这里直接写 `page._canvasComponent.setProps()`——那会绕过控件同步。
   */
  function setProps(patch) {
    if (!patch || typeof patch !== 'object') return

    // 晶体切换优先（换了晶体，其余属性的语义可能随之变化）
    if (patch.crystalId != null && patch.crystalId !== page._crystalId) {
      page.setCrystal(patch.crystalId)
    }

    // 图层（按 LAYER_BY_PROP 的声明序，保证总开关先开）
    for (const [prop, layer] of Object.entries(LAYER_BY_PROP)) {
      if (prop in patch && patch[prop] !== undefined) {
        page.applyIntent({ kind: 'layer', layer, visible: !!patch[prop] })
      }
    }

    // 原子标签（单列，理由见 LAYER_BY_PROP 上方）
    if (patch.showAtomLabels !== undefined) {
      page.applyIntent({ kind: 'atomLabels', visible: !!patch.showAtomLabels })
    }

    // 按元素显隐（可能一次给多个元素）
    if (patch.atomVisibility && typeof patch.atomVisibility === 'object') {
      for (const [element, visible] of Object.entries(patch.atomVisibility)) {
        page.applyIntent({ kind: 'atomVisibility', element, visible: !!visible })
      }
    }

    // 模型类型 / 晶胞显示 / 等效点系
    if (patch.modelType !== undefined) {
      page.applyIntent({ kind: 'modelType', value: patch.modelType })
    }
    if (patch.cellDisplayMode !== undefined) {
      page.applyIntent({ kind: 'cellDisplayMode', value: patch.cellDisplayMode })
    }
    if (patch.equivalentIndex !== undefined) {
      page.applyIntent({ kind: 'equivalent', index: patch.equivalentIndex })
    }
    if (patch.auxiliaryLineAboveAtoms !== undefined) {
      page.applyIntent({ kind: 'auxAbove', value: !!patch.auxiliaryLineAboveAtoms })
    }
    if (patch.partialAtoms !== undefined) {
      page.applyIntent({ kind: 'partialAtoms', value: !!patch.partialAtoms })
    }

    // 高亮（智能体的诊断手段；null 与 [] 都表示取消高亮）
    if (patch.highlightElements !== undefined) {
      page.applyIntent({ kind: 'highlight', elements: patch.highlightElements })
    }

    // 外观（原子缩放 / 键粗细 / 透明度）
    const appearance = {}
    for (const k of APPEARANCE_PROPS) {
      if (patch[k] !== undefined) appearance[k] = patch[k]
    }
    if (Object.keys(appearance).length) {
      page.applyIntent({ kind: 'appearance', patch: appearance })
    }
  }

  return {
    // ---- 门面契约必需 ----
    getProps: () => page.getViewProps(),
    setProps,

    /**
     * 强制重建三维场景。
     *
     * ★ 为什么需要它：**视觉颜色是在建场景时读的，不是每帧读的**
     *   （`scene-builder` 通过 `getElementColor(el)` 取色，写进材质）。
     *   所以设置面板里改了背景/线框/空隙/点阵点/元素颜色之后，
     *   场景必须**重建**才能看到新配色——否则用户改完颜色以为什么也没发生。
     *
     * ★ 为什么不能借道 `setProps({ crystalId })`：`viewer-canvas` 只在
     *   **值真的变了**时才重建（`const changed = this[key] !== v; ... if (!changed) continue`），
     *   同一个 id 传进去什么也不会发生——这正是本仓库反复记过的
     *   "看起来调了、其实没生效"那一类。传别的 id 又会加载错晶体。
     *
     * ★ 为什么直接调 `_loadCrystal`（一个下划线内部方法）：
     *   `viewer-canvas.js` 没有公开的重建入口，而它是**上游的文件**——
     *   给它加公开方法会让下次同步覆盖时丢掉改动。故在这里单点承接，
     *   并如实标注这处依赖；若将来上游加了 `rebuild()`，改这一行即可。
     *   取不到画布/方法时**静默返回 false**：设置保存后画面没刷新，
     *   不该把保存这件事本身弄失败。
     *
     * @returns {boolean} 是否真的触发了重建
     */
    refreshScene() {
      const c = canvasOf()
      if (!c || typeof c._loadCrystal !== 'function') return false
      try {
        c._loadCrystal(c._crystalId)
        if (typeof c.invalidate === 'function') c.invalidate()
        return true
      } catch (e) {
        console.warn('[crystal] 场景重建失败（配色改动需重新进入页面才生效）：', e)
        return false
      }
    },

    // ---- 门面契约可选 ----
    /**
     * 视角状态（相机/缩放）。与 `getProps()` 互补：后者是图层与外观，不含视角。
     */
    getViewState: () => {
      const c = canvasOf()
      return c && typeof c.getViewState === 'function' ? c.getViewState() : null
    },

    /** 切到预置视角。★ 注意它会重置缩放与平移（ViewerCanvas 的实现如此） */
    setView: (direction) => {
      const c = canvasOf()
      if (c && typeof c.setView === 'function') c.setView(direction)
    },

    /**
     * 回设**完整的视角状态**（theta/phi/radius/panOffset/crystalQuat/frustumSize）。
     *
     * ★ 为什么需要它（而不是用 `setView` 凑合）：`setView` 只认四个预置方向、
     *   且会重置缩放与平移。而"把视图还原到演示前"要的是**精确回设**——
     *   用户可能自己转到了某个角度、放大了某个局部，那些状态 `setView` 表达不了。
     */
    setViewState: (state) => {
      const c = canvasOf()
      return c && typeof c.applyViewState === 'function' ? c.applyViewState(state) : false
    },

    resetView: () => {
      const c = canvasOf()
      if (c && typeof c.resetView === 'function') c.resetView()
    },

    /**
     * 门面用它作为 DOM 事件的宿主（`onAction` 的事件绑定）。
     * 返回 canvas 容器。
     */
    getContainer: () => {
      const c = canvasOf()
      return c && typeof c.getContainer === 'function' ? c.getContainer() : null
    },

    /** `exportViewPNG()` 用 */
    get canvas() {
      const c = canvasOf()
      return c ? c.canvas : null
    },

    /**
     * 打开双晶体并排对比。由宿主页面实现（它持有 router 与当前状态）。
     * 页面没有这个能力时**抛错**——被 facade.applyActions 捕获成 failed，
     * 模型能看见并据此回应，而不是静默什么也没发生。
     */
    openCompareWith(b) {
      if (typeof page.openCompareWith !== 'function') {
        throw new Error('当前页面不支持并排对比')
      }
      page.openCompareWith(b)
    },

    // ---- 诊断用 ----
    /** 底层页面（仅供调试把手使用，智能体不应直接碰它） */
    get page() { return page },
  }
}

export default createViewerPageAdapter
