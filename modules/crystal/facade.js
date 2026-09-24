/**
 * facade.js — 晶体模块的智能体门面（模块契约的实现）
 *
 * 契约见 packages/agent-core/contract/module-contract.js。crystal 原先完全没有这一层
 * ——它的页面直接调 `viewer.setProps()`，智能体无从驱动。本文件把「能读什么状态、
 * 能被人怎样驱动」显式化。
 *
 * ★ 三条设计决定（都不是随手写的）：
 *
 *   1. **不 import 视图实现**，通过参数接收 `view`。因此本文件可以在 Node 里用桩测试，
 *      也不会把 three.js/DOM 拖进纯逻辑的测试环境。
 *
 *   2. **状态读视图的真实值，不维护副本**。crystal 页面上的图层控件也在改同一批属性，
 *      门面若自己存一份副本，它与实际画面就会漂移——而漂移的表现是"智能体以为
 *      某图层开着、其实被用户关了"，这类错误极难发现。故用 `view.getProps()` 现读。
 *
 *   3. **onAction 走 DOM 自定义事件，不用 `view._events`**。后者是**单槽位**
 *      （`this._events[name]` 一个名字只存一个回调），后注册者会静默顶掉先注册者——
 *      契约里专门警告过这件事。DOM 事件天然支持多订阅，且返回取消函数。
 */
import { VOCAB, LAYER_PROPS, LAYER_NOTES, VIEW_DIRECTIONS, CELL_MODES, APPEARANCE_RANGES, validate as validateAction, listActions } from './actions.js'

/**
 * 创建晶体模块门面。
 *
 * @param {Object}   opts
 * @param {Object}   opts.view      ViewerCanvas 实例（或同接口的替身）：
 *                                  必需 setProps / getProps / setView / resetView / getViewState / getContainer
 * @param {Array}    [opts.catalog] 晶体索引（crystalIndex），用于校验 id 与取元信息
 * @param {Function} [opts.loadData] (crystalId) => 晶体数据对象（可选）。
 *                                  给了它，快照里会带上元素清单与原子数
 */
export function createCrystalFacade(opts = {}) {
  const view = opts.view
  if (!view) throw new Error('createCrystalFacade 需要 opts.view')
  for (const m of ['setProps', 'getProps', 'setView', 'resetView', 'getViewState']) {
    if (typeof view[m] !== 'function') throw new Error(`view 缺方法 ${m}（门面依赖它实现模块契约）`)
  }
  const catalog = opts.catalog || []
  const byId = new Map(catalog.map((c) => [c.id, c]))
  const crystalIds = new Set(byId.keys())
  const loadData = typeof opts.loadData === 'function' ? opts.loadData : null

  // ---- 事件订阅：数组而非单槽位（见文件头第 3 条）----
  const subscribers = new Set()
  let domBound = false
  function bindDom() {
    if (domBound) return
    const host = view.getContainer && view.getContainer()
    if (!host || typeof host.addEventListener !== 'function') return
    domBound = true
    // 视图自身派发的自定义事件（viewstatechange / loaded / resetview / atomTap …）
    for (const name of ['viewstatechange', 'loaded', 'resetview', 'atomTap', 'voidTap', 'latticePointTap']) {
      host.addEventListener(name, (e) => {
        emit({ type: name, detail: e && e.detail })
      })
    }
  }
  function emit(evt) {
    for (const cb of [...subscribers]) {
      try { cb(evt) } catch (e) { /* 单个订阅者异常不应影响视图 */ }
    }
  }

  /** 只读状态快照。★ 现读视图，不缓存 */
  function getSnapshot() {
    const props = view.getProps ? view.getProps() : {}
    const viewState = view.getViewState ? view.getViewState() : null
    const id = props.crystalId || ''
    const meta = byId.get(id) || null

    // 只列出**开着的**图层，让快照更短；但把空隙总开关单独标明，
    // 因为关掉它会让 octahedral/tetrahedral 都不可见（易被误读成"空隙没有"）
    const layers = {}
    for (const [friendly, prop] of Object.entries(LAYER_PROPS)) {
      if (props[prop]) layers[friendly] = true
    }
    const hiddenElements = Object.entries(props.atomVisibility || {})
      .filter(([, v]) => v === false).map(([k]) => k)

    const snap = {
      module: 'crystal',
      crystal: meta
        ? { id, name: meta.name, formula: meta.formula, crystalSystem: meta.crystalSystem, systemName: meta.systemName, subtitle: meta.subtitle }
        : (id ? { id } : null),
      layersOn: Object.keys(layers),
      // 空隙总开关关着时，上面两项即使为真也不可见——单列出来以免误读
      intersticesMasterOn: !!props.showInterstices,
      atomScale: props.atomScale,
      stickRadius: props.stickRadius,
      cellDisplayMode: props.cellDisplayMode,
      cellDisplayModeNote: props.cellDisplayMode === 'primitive' ? '当前显示原胞（最小重复单元）' : '当前显示惯用晶胞（教材上画的那个）',
      hiddenElements,
      view: viewState
        ? { theta: round(viewState.theta), phi: round(viewState.phi), radius: round(viewState.radius) }
        : null,
    }
    if (loadData && id) {
      try {
        const d = loadData(id)
        if (d) {
          snap.atoms = (d.atoms || []).map((g) => ({
            element: g.element, count: (g.positions || []).length,
          }))
          snap.formula = d.formula
        }
      } catch (e) { /* 取不到数据不致命，快照少两项而已 */ }
    }
    return snap
  }

  /**
   * 应用动作。每个动作先校验（参数错则拒绝并说明原因），再落到视图。
   * 返回形状与 core/storyboard 的 applyStep 约定一致。
   */
  function applyActions(actions) {
    const list = Array.isArray(actions) ? actions : [{ action: actions && actions.action, params: actions && actions.params }]
    const applied = []
    const failed = []
    for (const a of list) {
      const name = a && a.action
      const v = validateAction(name, (a && a.params) || {}, { crystalIds })
      if (v.err) { failed.push({ action: name, error: v.err }); continue }
      try {
        applyOne(name, v.params)
        applied.push({ action: name, params: v.params })
      } catch (e) {
        failed.push({ action: name, error: (e && e.message) || String(e) })
      }
    }
    return { ok: failed.length === 0, applied, failed }
  }

  /** 单个已校验动作 → 视图调用 */
  function applyOne(name, p) {
    switch (name) {
      case 'loadCrystal':
        view.setProps({ crystalId: p.crystalId })
        return
      case 'setLayer':
        view.setProps({ [LAYER_PROPS[p.layer]]: p.visible })
        return
      case 'setLayers': {
        const patch = {}
        for (const [friendly, visible] of Object.entries(p.layers)) patch[LAYER_PROPS[friendly]] = visible
        view.setProps(patch)
        return
      }
      case 'setView':
        view.setView(p.direction)
        return
      case 'resetView':
        view.resetView()
        return
      case 'setCellDisplayMode':
        view.setProps({ cellDisplayMode: p.mode })
        return
      case 'setAtomVisibility': {
        const cur = (view.getProps().atomVisibility) || {}
        view.setProps({ atomVisibility: Object.assign({}, cur, { [p.element]: p.visible }) })
        return
      }
      case 'setAppearance':
        view.setProps(Object.assign({}, p))
        return
      default:
        throw new Error('未实现的动作：' + name)
    }
  }

  return {
    // ---- 标识 ----
    id: 'crystal',
    title: '晶体结构',

    // ---- 契约必需 ----
    getSnapshot,
    applyActions,

    // ---- 契约可选 ----
    onAction(cb) {
      if (typeof cb !== 'function') return () => {}
      subscribers.add(cb)
      bindDom()
      return () => subscribers.delete(cb)
    },
    sceneVocabulary: {
      vocabulary: VOCAB,
      /** 按需拉取（**不进常驻上下文**）—— 对应工具 listSceneActions */
      list: () => listActions(),
      layerNotes: LAYER_NOTES,
    },
    /** 模块自己的小参数（声明式 schema，可直接喂给 ui-kit 的 settings-popup） */
    settings: [
      { key: 'atomScale', label: '原子缩放', type: 'range', min: APPEARANCE_RANGES.atomScale[0], max: APPEARANCE_RANGES.atomScale[1], step: 0.1, unit: '×', hint: '讲密堆积时调小一点更容易看清层序' },
      { key: 'stickRadius', label: '键粗细', type: 'range', min: APPEARANCE_RANGES.stickRadius[0], max: APPEARANCE_RANGES.stickRadius[1], step: 0.01, hint: '分子晶体的化学键' },
      { key: 'opacity', label: '原子透明度', type: 'range', min: APPEARANCE_RANGES.opacity[0], max: APPEARANCE_RANGES.opacity[1], step: 0.05, hint: '调高能看到内部结构' },
      { key: 'cellDisplayMode', label: '晶胞显示', type: 'select', options: CELL_MODES.map((m) => [m, m === 'primitive' ? '原胞' : '惯用晶胞']) },
    ],
    exportViewPNG() {
      const c = view.canvas || (view.getContainer && view.getContainer() && view.getContainer().querySelector && view.getContainer().querySelector('canvas'))
      if (!c || typeof c.toDataURL !== 'function') return null
      try { return c.toDataURL('image/png') } catch (e) { return null }
    },

    // ---- 供工具层使用（不属于契约）----
    /** 动作校验（工具层可直接用，避免重复实现） */
    validate: (name, params) => validateAction(name, params, { crystalIds }),
    /** 可用晶体 id 列表（对应工具 listCrystals 的数据源） */
    crystalIds: () => [...crystalIds],
    /** 晶体元信息查询（对应工具 getCrystalDetail） */
    detailOf: (id) => byId.get(id) || null,
    /** 视角取值说明（供提示词与设置面板） */
    viewDirections: VIEW_DIRECTIONS,
  }
}

function round(v) {
  return typeof v === 'number' ? +v.toFixed(4) : v
}

export default createCrystalFacade
