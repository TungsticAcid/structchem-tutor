/**
 * facade.js — 晶体模块的智能体门面（模块契约的实现）
 *
 * 契约见 packages/module-contract/index.js（原在 agent-core/contract/，2026-09-30 提为独立包
 * —— 契约是模块与中枢共同依赖的第三方，放在中枢里会让"模块依赖中枢"不可回避）。
 * crystal 原先完全没有这一层
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
import { t, tr, trDeep } from './i18n-live.js'
import { VOCAB, LAYER_PROPS, LAYER_LABELS, LAYER_NOTES, VIEW_DIRECTIONS, CELL_MODES, APPEARANCE_RANGES, validate as validateAction, listActions } from './actions.js'
// 演示脚本是**模块自己的内容**（"NaCl 六步演示"、"以 Cu 型看空隙"…）。
// 播放能力（分镜队列）在中枢，二者分得很干净——见契约的 demos 字段说明。
import { DEMO_SCRIPTS, demoById, demoManifest } from './demo/scripts.js'

/**
 * 该动作是否打开了"练习中不该打开"的图层；是则返回那个图层的友好名。
 *
 * ★ 只认**打开**（`true` / 省略 visible）——关闭图层不泄露任何东西，
 *   反而是把画面复位到中性题境所必需的（见 quiz/preset-view.js 的 buildQuestionView）。
 */
function bannedLayerHit(name, p, banned) {
  if (name === 'setLayer') {
    return (p.visible !== false && banned.has(p.layer)) ? p.layer : null
  }
  if (name === 'setLayers') {
    for (const [k, v] of Object.entries(p.layers || {})) {
      if (v && banned.has(k)) return k
    }
  }
  return null
}

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
    if (typeof view[m] !== 'function') throw new Error(t('crystal.t.facade.1', { p1: (m) }))
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
      cellDisplayModeNote: props.cellDisplayMode === 'primitive' ? tr('当前显示原胞（最小重复单元）') : tr('当前显示惯用晶胞（教材上画的那个）'),
      hiddenElements,
      view: viewState
        ? { theta: round(viewState.theta), phi: round(viewState.phi), radius: round(viewState.radius) }
        : null,
      // ★ 完整视角状态（含 crystalQuat / panOffset / frustumSize）：上面的 `view` 是
      //   给人看/给模型读的**简化版**（只要角度与距离）；而"回到演示前"要**精确回设**，
      //   少一项都会留下"半新半旧"的相机状态。两者并存：简化版供感知，完整版供还原。
      viewState: viewState || null,
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
  function applyActions(actions, o = {}) {
    const list = Array.isArray(actions) ? actions : [{ action: actions && actions.action, params: actions && actions.params }]
    const applied = []
    const failed = []
    // ★ 练习守卫：未作答的题目里，"揭示答案"要打开哪些图层（空集 ⇒ 不限制）。
    //   每次调用算一次即可——它只依赖本地题库状态。
    // ★ `o.bypassGuard` 供**还原**路径使用（"回到演示前"）：那是在恢复**用户自己的**
    //   状态（快照里本就是他调好的图层），不是模型在泄题；若不放行，用户原本开着的
    //   图层会被守卫挡回去，恢复就成了"半新半旧"。调用方只有 app.js 的 restore。
    let banned = null
    if (!o.bypassGuard && typeof opts.practiceGuard === 'function') {
      try {
        const s = opts.practiceGuard()
        if (s && s.size) banned = s
      } catch (e) { banned = null }
    }
    for (const a of list) {
      const name = a && a.action
      // ★ 一并告知"当前是哪个晶体"：openCompareView 要据此拒绝"与自己对比"
      const v = validateAction(name, (a && a.params) || {}, {
        crystalIds,
        currentCrystalId: (view.getProps && view.getProps().crystalId) || '',
      })
      if (v.err) { failed.push({ action: name, error: v.err }); continue }

      // ★ 练习中拒绝泄题动作。理由写清楚，好让模型知道**为什么**被拒、以及正确做法。
      if (banned) {
        const hit = bannedLayerHit(name, v.params, banned)
        if (hit) {
          failed.push({
            action: name,
            error: t('crystal.t.facade.2', { p1: (LAYER_LABELS[hit] || hit) })
              + '它正是这道题要考的内容，画面一开就等于把答案说出来了。请先让学生作答；作答之后可引导学生点「去看结构」，那时再看不受限。',
          })
          continue
        }
      }

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
      // "谁在顶点、谁在体心"——同一结构的等价画法，用来把要讲的那个离子放到体心
      case 'setEquivalentOrigin':
        view.setProps({ equivalentIndex: p.index })
        return
      case 'setAtomVisibility': {
        const cur = (view.getProps().atomVisibility) || {}
        view.setProps({ atomVisibility: Object.assign({}, cur, { [p.element]: p.visible }) })
        return
      }
      case 'setAppearance':
        view.setProps(Object.assign({}, p))
        return
      case 'highlightAtoms':
        // ★ 空数组 ⇒ null（取消全部高亮）。视图侧约定：null/[] 都表示"没有高亮"，
        //   但传 null 比传 [] 更明确（后续若加"高亮历史"之类也容易分辨）。
        view.setProps({ highlightElements: (p.elements && p.elements.length) ? p.elements : null })
        return
      case 'openCompareView':
        // 并排对比是"跳转 + 预置视图"，由宿主页面实现（它才持有 router 与当前状态）。
        // 非 viewer 页没有这个能力时**明确报错**，而不是静默什么也不做。
        if (typeof view.openCompareWith !== 'function') {
          throw new Error('当前视图不支持并排对比（需先打开一个晶体）')
        }
        view.openCompareWith(p.b)
        return
      default:
        throw new Error('未实现的动作：' + name)
    }
  }

  return {
    // ---- 标识 ----
    id: 'crystal',
    get title() { return t('crystal.title') },

    // ---- 契约必需 ----
    getSnapshot,
    applyActions,

    /**
     * 此刻能否受理动作。
     *
     * ★ 晶体模块的动作**全部落在三维视图上**（loadCrystal / setLayer / setView …），
     *   故"能否受理"等价于"视图是否可用"。
     *
     * ★ 刻意**不**写成 `!!getSnapshot().crystal` —— 那是"用户是否已打开某个晶体"，
     *   属于**内容**状态而非**能力**状态。两者的差别在具体场景里会显形：
     *   学生刚进首页、一个晶体都没打开时，`loadCrystal` 恰恰是最该被受理的动作；
     *   若用内容状态当闸门，中枢会在学生说"打开 NaCl"时回一句"当前没有可驱动的视图"。
     *   这个"用内容状态猜能力状态"的错，晶体线的 app.js 正是这么犯的
     *   （`!!(snap && snap.crystal && snap.crystal.id)`），接第二个模块时恒为假。
     */
    canApplyActions() {
      // 视图对象在构造时已校验存在；若它自报就绪状态则采信，否则视为可用。
      if (typeof view.isReady === 'function') return !!view.isReady()
      return true
    },
    /**
     * 把视图整体回设到某份快照所描述的状态（分镜的「上一步」「回到演示前」用它）。
     *
     * ★ 为什么这个方法必须在**模块**里，而不是中枢里：
     *   原先它是中枢 app.js 的一段代码，里面逐个枚举了晶体的 13 个图层名
     *   （`ALL_LAYERS`）、5 个动作名与晶体专属的外观字段名——那是把模块的内部结构
     *   抄了一份进通用核。后果有两个：
     *     ① 中枢每接一个模块就要长一节（接 orbit 时要再加一段轨道专属的枚举）
     *     ② 枚举清单会**漏**。晶体线已踩过两次：视角静默不恢复、外观与按元素显隐
     *        整块漏掉。每次都表现为"回退后留下一个半新半旧的视图，比完全不回退更难察觉"。
     *   搬进模块后，还原用模块自己的词汇表（`LAYER_PROPS`），不存在"抄漏"的可能。
     *
     * ★ 实现走 `applyActions` 而不是直接改视图字段：
     *   这样与用户操作、与智能体操作共用同一条通路（校验、动作词汇表、订阅通知都一致），
     *   符合 DESIGN_PRINCIPLES 的 state-restore-must-share-user-path。
     *
     * ★ `bypassGuard: true`：还原是恢复**用户自己的**状态（快照里本就是他调好的图层），
     *   不是模型在泄题。不放行的话，用户原本开着的图层会被练习守卫挡回去，
     *   恢复就成了"半新半旧"——这正是本方法要根治的那类症状。
     *
     * @param {Object} state  getSnapshot() 曾经返回过的那个对象（或其子集）
     * @returns {{ok:boolean, error?:string}}
     */
    restoreState(state) {
      if (!state || typeof state !== 'object') return { ok: false, error: '没有可还原的状态' }
      const actions = []
      // ① 晶体本身
      if (state.crystal && state.crystal.id && crystalIds.has(state.crystal.id)) {
        actions.push({ action: 'loadCrystal', params: { crystalId: state.crystal.id } })
      }
      // ② 图层：快照里只列"开着的"，其余一律关。
      //    用 LAYER_PROPS（模块自己的词汇表）遍历，而不是中枢抄来的一份清单。
      const on = new Set(state.layersOn || [])
      for (const friendly of Object.keys(LAYER_PROPS)) {
        actions.push({ action: 'setLayer', params: { layer: friendly, visible: on.has(friendly) } })
      }
      // ③ 外观（可逆的标量）
      const appearance = {}
      for (const k of ['atomScale', 'stickRadius', 'opacity']) {
        if (typeof state[k] === 'number') appearance[k] = state[k]
      }
      if (Object.keys(appearance).length) actions.push({ action: 'setAppearance', params: appearance })
      // ④ 晶胞显示（惯用/原胞）
      if (state.cellDisplayMode) {
        actions.push({ action: 'setCellDisplayMode', params: { mode: state.cellDisplayMode } })
      }
      // ⑤ 按元素显隐：快照记的是"被隐藏的元素"。
      //    要还原就得知道**现在**隐藏了哪些（可能被用户改过），故取两边并集：
      //    快照里隐藏的 → 保持隐藏；现在隐藏、但快照里没隐藏的 → 显回来。
      //    （动作签名是单个元素 `{element, visible}`，故逐个下发。）
      if (Array.isArray(state.hiddenElements)) {
        const cur = (view.getProps && view.getProps().atomVisibility) || {}
        const hiddenThen = new Set(state.hiddenElements)
        const union = new Set([...Object.keys(cur).filter((k) => cur[k] === false), ...hiddenThen])
        for (const el of union) {
          actions.push({ action: 'setAtomVisibility', params: { element: el, visible: !hiddenThen.has(el) } })
        }
      }
      const r = applyActions(actions, { bypassGuard: true })
      if (!r.ok) return { ok: false, error: (r.failed[0] || {}).error || tr('还原失败') }
      // ⑥ 视角：**完整**回设（四元数 / 平移 / 视锥）。
      //    只恢复角度与距离是不够的——正交取景的 frustumSize、拖拽平移量都在其中，
      //    少一项就会留下一个"角度转对了、但缩放与位置不对"的相机。
      if (state.viewState) {
        try {
          if (typeof view.setViewState === 'function') view.setViewState(state.viewState)
        } catch (e) { /* 视角还原失败不该让整个回退失败——图层已经回去了 */ }
      }
      return { ok: true }
    },
    /**
     * 感知层的模块配置（见契约的 `perception` 字段）。
     *
     * ★ 键必须是**快照里真实存在的字段名**。第一版曾写成 `crystalId`，
     *   而快照字段叫 `crystal`（对象）——于是"用户换了晶体"不被识别成一次切换，
     *   痕迹里只剩一堆原始字段名。**字段名对不上不报错**，只是痕迹变得不可读，
     *   这类错很难发现；现由 assertModuleContract({ snapshotFields }) 在开发期守住。
     *
     * ★ 用 getter 现建：`fieldLabels` 是**给模型读的**痕迹标签（"用户切了晶体"），
     *   在装配那一刻定死会让切语言后的痕迹仍是旧语言。中枢每次激活模块都读一次它。
     */
    get perception() {
      return trDeep({
      fieldLabels: {
        crystal: '切换晶体',
        layersOn: '切换图层',
        cellDisplayMode: '切换晶胞显示',
        view: '调整视角',
        hiddenElements: '按元素显隐',
        atomScale: '调整原子缩放',
        stickRadius: '调整键粗细',
      },
      // ★ 停留时长此前是**空数组**——机制在、恒为空，于是"在同一个晶体上反复切图层
      //   却始终没打开空隙"这类教学信号完全丢失。填上真正有教学意义的**少数几个**：
      //   不是全填，因为 dwellMs 会为每个变化字段保留最近 6 次的时长，全填等于白撑大快照。
      dwellFields: ['crystal', 'layersOn', 'cellDisplayMode'],
      formatCompact: (snap) => {
        const s = (snap && snap.state) || {}
        const it = (snap && snap.interaction) || {}
        // ★ 这两行是**拼出来的**（模块名/图层清单/计数都是变量），扫描替换够不着，
        //   所以走带占位符的键。见 packages/i18n 顶部"两张表"的说明。
        return [
          t('crystal.perception.state', {
            module: (s.module || 'crystal'),
            crystal: (s.crystal ? ' · ' + tr(s.crystal.name || s.crystal.id) : ''),
            layers: ((s.layersOn || []).join(',') || t('crystal.common.none')),
          }),
          t('crystal.perception.interaction', {
            idle: Math.round((it.idleMs || 0) / 1000),
            toggles: JSON.stringify(it.toggleCounts || {}),
            recent: ((it.recentActions || []).join('→') || t('crystal.common.none')),
          }),
        ].join('\n')
      },
      })
    },
    /**
     * 模块自己的**预置演示脚本**（零 token：不经过模型，直接进分镜队列）。
     * 中枢据此提供 listDemos / playDemo / replayDemo / reviseDemo 四个工具。
     * 见契约的 demos 字段说明——脚本属模块、播放属中枢。
     */
    demos: {
      // ★ 演示脚本的标题与旁白是**模块自己的内容**，既要进模型上下文（listDemos /
      //   playDemo 的工具结果），也要显示在面板上。统一在这里过语言：脚本保持中文原文，
      //   取用时按当前语言翻（`trDeep` 查不到的原样返回，不会误伤 id/步骤号）。
      list: () => trDeep(DEMO_SCRIPTS),
      byId: (id) => trDeep(demoById(id)),
      /** 清单（给模型看的：只有 id/标题/知识点/步数，**不含每步动作**——渐进式披露） */
      manifest: () => trDeep(demoManifest()),
    },

    /**
     * 回设完整视角状态（"回到演示前"用）。
     * ★ 不走 applyActions：视角不是一个"动作"，也没有"答案相关性"，
     *   因此既不必过校验与夹紧，也不该被练习守卫拦。
     */
    setViewState: (s) => (view.setViewState ? view.setViewState(s) : false),

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
      list: () => trDeep(listActions()),
      /** 图层教学说明（**给模型**，也作界面悬浮说明）——取用时过语言（见下 getter） */
      get layerNotes() { return trDeep(LAYER_NOTES) },
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
    validate: (name, params) => trDeep(validateAction(name, params, {
      crystalIds,
      currentCrystalId: (view.getProps && view.getProps().crystalId) || '',
    })),
    /** 可用晶体 id 列表（对应工具 listCrystals 的数据源） */
    crystalIds: () => [...crystalIds],
    /**
     * 契约的 `listIds` —— id 的**取值域**，供中枢校验模型给的 id 是否真实存在
     * （CLAUDE.md §一.2：数值一律程序算，模型不得口算或编造）。
     * ★ 与 crystalIds() 是同一个东西。保留两个名字是过渡期的刻意选择：
     *   crystalIds() 已被 tools.js 与既有测试引用；listIds 是契约里的正式名字
     *   （它此前是一处**隐形契约**——被 navigateTo 与 tools.js 悄悄依赖，却没写进契约）。
     *   待引用点都改用契约名后，crystalIds() 即可删除。
     */
    listIds: () => [...crystalIds],

    /**
     * 本模块声明的前端路由（契约的可选值 `routes`）。
     *
     * ★ 为什么必须由模块声明：`navigateTo` 原先在中枢里**硬编码了晶体语义**——
     *   target 只有 home/crystal/compare，参数写死叫 crystalId。
     *   接第二个模块时，那个工具要么失效、要么把学生带到**错误的路由**上去
     *   （实测：在对称性下它拿到 `water` 会去跳 `#/viewer/water`，那是晶体的路由）。
     *
     * ★ 现在中枢从各模块的声明**派生** schema 与跳转，不必知道任何模块的路由长什么样。
     *   `params` 里 `kind:'id'` 的参数会用**该模块自己的** `listIds()` 校验——
     *   模块的 id 空间只有模块自己知道。
     */
    // ★ getter：中枢按各模块的声明**派生**导航工具的 schema（label / desc 都是
    //   给模型看的），每次重建注册表都读一次它 —— 切语言后派生的那份就是新语言。
    get routes() {
      return trDeep([
      {
        target: 'crystal',
        label: '打开某个晶体的视图',
        params: { crystalId: { kind: 'id', desc: '晶体 id（来自 listCrystals）' } },
        hash: (p) => '#/viewer/' + encodeURIComponent(p.crystalId),
      },
      {
        target: 'compare',
        label: '并排对比两个晶体',
        params: {
          crystalId: { kind: 'id', desc: '第一个晶体 id' },
          otherCrystalId: { kind: 'id', desc: '第二个晶体 id（不能与第一个相同）' },
        },
        // 跨参数的约束由**模块自己**表达：中枢不知道"两个晶体相同"为什么没意义
        validate: (p) => (p.crystalId === p.otherCrystalId ? tr('两个对象相同，没有可对比的内容') : null),
        hash: (p) => `#/compare/${encodeURIComponent(p.crystalId)}?b=${encodeURIComponent(p.otherCrystalId)}`,
      },
      ])
    },
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
