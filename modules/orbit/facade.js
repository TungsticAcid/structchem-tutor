/**
 * facade.js（orbit 模块）—— 智能体门面（模块契约的实现）
 *
 * 契约见 `packages/module-contract/index.js`。
 *
 * ★ 与另两个模块的结构性差别：**orbit 的动作必须落到页面上**。
 *   `n/l/m` 这些状态当前住在页面的闭包里（`apps/web/src/pages/orbit.js`），
 *   而且动作实现里到处在读控件、写控件——上游的架构就是这样（DOM 是当前的真值中介，
 *   见重构计划 P7）。所以这里采用**惰性附着**：页面挂载时把运行时交给模块
 *   （`attach(rt)`），卸载时交还（`detach()`）。这与 crystal 的惰性视图代理是同一个思路，
 *   只是代理的是"整个运行时"而不是"三维视图"。
 *
 * ★ `canApplyActions()` 据此返回"运行时在不在"。
 *   说明一处**与重构计划 P3 的偏差**：计划写的是"orbit 恒真"。
 *   但按契约的原意（"此刻能否受理动作"），没有运行时就是受理不了——
 *   返回 true 只会让模型下发一堆注定失败的动作，然后收到一串错误。
 *   等 P7 把 state 从 DOM 搬进模块之后，这里才能真正恒真。
 */
import { VOCAB, validate as rawValidate, listActions, labels as actionLabels } from './actions.js'
// 预置演示脚本是**模块自己的内容**（零 token 的分镜脚本）。
// 播放能力（队列、逐步闸门、回放、整改）在中枢——脚本属模块、播放属中枢。
import { DEMO_SCRIPTS, demoById, demoManifest } from './demo/scripts.js'

/** 无运行时时的空快照（门面据此生成"当前没在看轨道"的状态） */
const EMPTY_SNAPSHOT = {
  module: 'orbit',
  attached: false,
  n: null, l: null, m: null,
  nuclearCharge: null,
  viewTarget: null,
  wavefunction: null,
  render: null,
  psiCriterion: null,
  levelFraction: null,
  pointCount: null,
  plane: null,
  sectionMode: null,
  angularWhich: null,
  radial: [],
  autoRotate: false,
  relPhase: 0,
  chartTerm: 'super',
  // ★ 这两个必须与"有运行时"那条分支**同形**：真实快照里 `terms` 被删掉、
  //   换成 `termCount` 与 `isSuperposition`（数组逐轮深拷贝会把快照撑大）。
  //   两条分支字段集不一致时，感知层的差分会在"进/出页面"时凭空多出几个变化，
  //   痕迹里就出现一堆噪声——而契约的 assertModuleContract({snapshotFields})
  //   正是拿空快照的字段去核对 fieldLabels 的，这条警告就是它报出来的。
  termCount: 0,
  isSuperposition: false,
  // 轨道模型同理必须同形：切模型会改变等值面的**形状**（氢型 2s 有径向节点、STO 没有），
  // 两条分支字段集不一致时，进出页面会在痕迹里凭空多出一次「轨道模型变化」。
  orbitalModel: 'hydrogenic',
  orbitalZeta: null,
  // 多轨道同屏同理必须同形（见上）。
  orbitalSet: 'off',
  orbitalCount: 0,
  orbitalVisible: '',
  orbitalShown: 0,
}

/**
 * 创建 orbit 模块门面。
 *
 * @param {Object} [opts]
 * @returns {Object} 契约合规的门面
 */
export function createOrbitFacade(opts = {}) {
  /** 页面注入的运行时（含 getState / applyAction / onAction / exportViewPNG …） */
  let runtime = null

  /**
   * 订阅者集合。
   * ★ 用 Set 而非单槽位——面板要刷动作气泡、感知层要记痕迹，
   *   单槽位会被后注册者静默顶掉（契约里对 onAction 有同样的警告）。
   * ★ 运行时换掉时（切页再回来）要把订阅转过去，否则页面重建后订阅就断了。
   */
  const subscribers = new Set()
  let detachRuntimeSub = null

  function emit(action, result) {
    for (const cb of [...subscribers]) {
      try { cb(action, result) } catch (e) { /* 单个订阅者异常不影响其余 */ }
    }
  }

  /**
   * 附着页面运行时。页面 mount 时调用。
   * @param {Object} rt
   */
  function attach(rt) {
    if (!rt || typeof rt.applyAction !== 'function') return false
    detachRuntimeSub && detachRuntimeSub()
    runtime = rt
    // 把运行时的动作通知转成本门面的通知（多对多：一个运行时 → N 个门面订阅者）
    detachRuntimeSub = typeof rt.onAction === 'function'
      ? (rt.onAction((a) => emit(a, null)) || null)
      : null
    return true
  }

  /** 解除附着。页面 unmount 时调用——否则会握着已经销毁的 DOM。 */
  function detach() {
    detachRuntimeSub && detachRuntimeSub()
    detachRuntimeSub = null
    runtime = null
  }

  /** 只读状态快照（供感知层） */
  function getSnapshot() {
    if (!runtime) return Object.assign({}, EMPTY_SNAPSHOT)
    let s = {}
    try { s = runtime.getState() || {} } catch (e) { s = {} }
    const snap = Object.assign({ module: 'orbit', attached: true }, s)
    // ★ 契约的 `perception.fieldLabels` 键必须是快照里**真实存在**的字段名。
    //   `terms` 是数组、逐轮深拷贝会让快照体积暴涨，故只报"有几个分量"。
    snap.termCount = Array.isArray(snap.terms) ? snap.terms.length : 0
    snap.isSuperposition = snap.termCount > 1
    delete snap.terms
    return snap
  }

  return {
    // ---- 标识 ----
    id: 'orbit',
    title: '原子轨道',

    // ---- 契约必需 ----
    getSnapshot,
    applyActions(actions) {
      const list = Array.isArray(actions) ? actions : [actions]
      const applied = []
      const failed = []
      for (const a of list) {
        const name = a && a.action
        const v = rawValidate(name, (a && a.params) || {})
        if (v.err) { failed.push({ action: name, error: v.err }); continue }
        if (!runtime) {
          failed.push({ action: name, error: '当前不在原子轨道页面——请先打开该页面再操作' })
          continue
        }
        let r
        try { r = runtime.applyAction({ action: name, params: v.params }) }
        catch (e) { failed.push({ action: name, error: (e && e.message) || String(e) }); continue }
        if (r && r.ok === false) { failed.push({ action: name, error: r.error || '动作执行失败' }); continue }
        applied.push({ action: name, params: v.params })
      }
      return { ok: failed.length === 0, applied, failed }
    },
    /**
     * 此刻能否受理动作 = **页面运行时在不在**。
     * 见文件头关于"与计划 P3 偏差"的说明。
     */
    canApplyActions() { return !!runtime },

    // ---- 契约可选 ----
    /**
     * 本模块声明的前端路由（契约的可选值 `routes`）。
     *
     * ★ 这一条同时修掉一个**真实回归**：`navigateTo` 原先的存在条件是
     *   "facade 有 `listIds`"（见 app.js 的 canNavigate），而**本模块没有 `listIds`**
     *   （它的 id 空间就是 n/l/m，不是一份字符串清单）。
     *   于是文本路由一旦把 activeId 切到 orbit，`navigateTo` 就**整个消失**了——
     *   模型想"带学生去看某个轨道"时手里根本没有那个工具。
     *   改成由 routes 声明之后，导航能力不再依赖某个模块碰巧实现了 listIds。
     */
    routes: [
      {
        target: 'orbit',
        label: '打开原子轨道页面',
        params: {},
        hash: () => '#/orbit',
      },
    ],
    /**
     * 把状态整体回设到某份快照（分镜的「上一步」「回到演示前」用它）。
     * ★ 走上游自己的 `restoreState` 动作：它刻意**只改控件与 state、不触发重算**
     *   （重算由 applyAction 统一做一次），否则一次回退会连着重算七八遍。
     */
    restoreState(state) {
      if (!state || typeof state !== 'object') return { ok: false, error: '没有可还原的状态' }
      if (!runtime) return { ok: false, error: '当前不在原子轨道页面' }
      const r = this.applyActions([{ action: 'restoreState', params: { state } }])
      return r.ok ? { ok: true } : { ok: false, error: (r.failed[0] || {}).error || '还原失败' }
    },
    onAction(cb) {
      if (typeof cb !== 'function') return () => {}
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    sceneVocabulary: {
      vocabulary: VOCAB,
      /** 按需拉取（**不进常驻上下文**）—— 对应工具 listSceneActions */
      list: () => listActions(),
      // orbit 没有 crystal 那种"图层之间有依赖"的问题（各控件相互独立），故为空
      layerNotes: {},
    },
    /**
     * 模块自己的**预置演示脚本**（零 token：不经过模型，直接进分镜队列）。
     * 中枢据此提供 listDemos / playDemo / replayDemo / reviseDemo 四个工具；
     * **不提供则这四个工具不出现**（而不是出现后报错）。
     *
     * ★ `byId` 返回的 steps 已经**展平**成"一步一动作"——上游脚本的"一步"是
     *   「一句旁白 + 一组动作」，而分镜队列的"一步"是一个动作。展平在 demo/scripts.js
     *   里做，理由也写在那边。
     */
    demos: {
      list: () => DEMO_SCRIPTS,
      byId: (id) => demoById(id),
      /** 清单（给模型看的：只有 id/标题/知识点/步数，**不含每步动作**——渐进式披露） */
      manifest: () => demoManifest(),
    },
    /**
     * 感知层的模块配置。
     * ★ 键必须是快照里真实存在的字段名（对上不了不报错，只是痕迹变得不可读）。
     */
    perception: {
      fieldLabels: {
        n: '切换主量子数',
        l: '切换角量子数',
        m: '切换磁量子数',
        nuclearCharge: '调整核电荷',
        viewTarget: '切换视图目标',
        wavefunction: '实轨道/复轨道',
        render: '切换渲染模式',
        psiCriterion: '切换阈值判据',
        levelFraction: '调整等值面阈值',
        pointCount: '调整粒子数',
        plane: '切换截面',
        sectionMode: '切换截面显示',
        angularWhich: '切换角度分布函数',
        radial: '切换径向曲线',
        isSuperposition: '叠加态变化',
        relPhase: '调整相对相位',
        chartTerm: '切换图表对象',
        orbitalModel: '切换轨道模型',
        orbitalSet: '切换多轨道同屏',
      },
      // ★ 停留时长只填**少数几个真正有教学意义**的：dwellMs 会为每个字段保留最近 6 次，
      //   全填等于白撑大快照。
      dwellFields: ['n', 'l', 'm', 'viewTarget'],
      formatCompact: (snap) => {
        const s = (snap && snap.state) || {}
        const it = (snap && snap.interaction) || {}
        const orb = (s.n == null) ? '（未附着页面）' : `${s.n}${['s', 'p', 'd', 'f'][s.l] || '?'}${s.m}`
        return [
          '【当前状态】模块 orbit · 轨道 ' + orb
            + '；视图 ' + (s.viewTarget || '—')
            + '；渲染 ' + (s.render || '—')
            + (s.isSuperposition ? `；**叠加态 ${s.termCount} 个分量**` : '')
            + (s.orbitalModel === 'slater'
              ? `；**Slater 型（STO）**径向${s.orbitalZeta ? ` ζ=${s.orbitalZeta}` : '（ζ=Z/n）'}`
              : '；氢型（真实类氢）径向')
            // 多轨道档要显式说出来：模型若不知道它是开着的，就解释不了
            // "为什么画面上有四个瓣、而且不是叠加态"（两者长得很像）。
            // ★ 这一句必须**拼在同一行**里（上面那行末尾不能有逗号）——
            //   多一个逗号它就变成数组的第二个元素，会被 join 换到下一行去。
            + (s.orbitalSet && s.orbitalSet !== 'off'
              ? '；**多轨道同屏 ' + s.orbitalSet + '**（' + s.orbitalShown + '/' + s.orbitalCount
                + ' 个可见，每个一个颜色，与叠加态无关）'
              : ''),
          '【交互】空闲 ' + Math.round((it.idleMs || 0) / 1000) + 's'
            + '；切换次数 ' + JSON.stringify(it.toggleCounts || {})
            + '；最近动作 ' + ((it.recentActions || []).join('→') || '（无）'),
        ].join('\n')
      },
    },
    exportViewPNG() {
      if (!runtime || typeof runtime.exportViewPNG !== 'function') return null
      try { return runtime.exportViewPNG() } catch (e) { return null }
    },

    // ---- 供工具层与宿主使用（不属于契约）----
    /** 页面挂载时把运行时交进来 */
    attach,
    /** 页面卸载时交还 */
    detach,
    /** 运行时是否就绪（诊断用） */
    get attached() { return !!runtime },
    /** 直接取运行时（工具层要用 drawChartInto 一类的能力） */
    getRuntime: () => runtime,
    /** 动作校验（工具层可直接用，避免重复实现） */
    validate: (name, params) => rawValidate(name, params),
    /** 动作词汇表原对象 */
    vocabulary: () => VOCAB,
    /** 动作名 → 短标签 */
    actionLabels: () => actionLabels(),
    /** 当前是否在叠加态（工具层与提示词用） */
    isSuperposition: () => {
      const s = getSnapshot()
      return !!s.isSuperposition
    },
  }
}

export default createOrbitFacade
