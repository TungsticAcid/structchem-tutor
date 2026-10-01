/**
 * facade.js — 分子对称性模块的智能体门面（模块契约的实现）
 *
 * 契约见 `packages/module-contract/index.js`。本模块是**第一个 `canApplyActions()`
 * 恒返回 true 的模块**——它不需要三维视图就能算对称性：
 *
 * ★ 这一点在契约里被专门讨论过。`canApplyActions` 的语义是"此刻能否受理动作"，
 *   **不是**"有没有三维视图"。晶体模块两者恰好重合（它的动作全落在视图上），
 *   而对称模块不是：
 *     · "水分子是什么点群" → 纯计算，**任何时候都能答**
 *     · "把对称元素画到画面上" → 需要视图
 *   若照抄晶体那句 `!!snapshot.xxx`，对称模块会在没有视图时连"算点群"都拒绝——
 *   而那正是它最有价值的能力。
 *
 * ★ 状态由模块自己持有（当前选中哪个示例），而不是向视图要。
 *   理由同上：识别点群只依赖结构数据，与"画布上现在画着什么"无关。
 *   视图（如果接了）是它的一个**消费者**，不是它的状态源。
 */
import { identifyPointGroup } from './engine/pointGroup.js'
// ★ key 的生成规则**只有那一处定义**（页面把 key 对到场景对象时用的是同一个函数）
import { elementKeyList, defaultVisibleKeys } from './engine/elementNaming.js'
import { EXAMPLES } from './data/examples-index.js'

/**
 * 创建分子对称性模块门面。
 *
 * @param {Object}   [opts]
 * @param {string}   [opts.initialId]  初始示例 id（缺省取第一个）
 *
 * ★ 此处原先还写着 `[opts.onChange] 状态变化回调（宿主用它驱动视图重绘）`——
 *   那是**幽灵参数**：有声明、无实现、无传参。已删。
 *   真正的通知通路是下面的 `subscribe`（并作为契约可选方法 `onAction` 暴露，
 *   页面在 mount 时订阅它重绘）。不再另开一条单槽位回调：
 *   两条通路并存时，后注册者会静默顶掉先注册者，而订阅是 Set、天然允许多个。
 */
export function createSymmetryFacade(opts = {}) {
  const byId = new Map(EXAMPLES.map((e) => [e.id, e]))
  let currentId = (opts.initialId && byId.has(opts.initialId))
    ? opts.initialId
    : (EXAMPLES[0] && EXAMPLES[0].id) || null

  /**
   * 宿主注入的空间群分析器（晶体示例用）与其配套的"操作 → 对称元素"转换。
   *
   * ★ 二者都来自 `modules/symmetry/space-group.js`，而那个文件依赖 WASM 与
   *   Vite 的 `?url` 导入后缀，**在 Node 里无法静态导入**。所以走注入：
   *   模块层保持可在 Node 测试，浏览器由 apps/web 接线。
   *   未注入时 identifyCrystal 会**如实回"未接入"**（而不是"识别失败"）。
   */
  const analyzeCrystal = typeof opts.spaceGroup === 'function' ? opts.spaceGroup : null
  const operationsToElements = typeof opts.operationsToElements === 'function'
    ? opts.operationsToElements : null

  /** 识别结果的缓存：结构不变就不重算（点群识别不便宜） */
  let cachedFor = null
  let cached = null

  // ---------------------------------------------------------------------------
  // 显示状态：**由模块持有，页面是它的渲染视图**
  // ---------------------------------------------------------------------------
  /**
   * ★ 这些状态原先散落在**页面闭包**里（`let showSymmetry = true` …），
   *   于是页面上那 20 多项功能全是"给人用的"——模型一个都改不动
   *   （`applyOne` 的 default 分支直接抛"未实现的动作"）。
   *
   * 搬到模块里之后同时解决三件事：
   *   ① 模型能驱动（动作进 VOCAB，经中枢的 applySceneActions 下发）；
   *   ② 人点按钮**也走同一条通路**（`facade.applyActions`），
   *      于是"模型改了状态、按钮显示的还是旧的"这类分叉在结构上不可能发生；
   *   ③ 模块层仍然**不 import 任何视图实现**——它只存"意图"，谁来画与它无关，
   *      于是它依然能在 Node 里直接测（这是本模块的结构性约束）。
   *
   * ★ 字段必须是**顶层标量**：`packages/agent-core/core/perception.js` 的
   *   `diffStates` 只比顶层键，嵌套对象会让痕迹退化成"每轮都说 visible 变了"，
   *   而痕迹正是主动介入规则的触发源。所以隐藏项存成**排序后的字符串**。
   */
  const display = {
    showSymmetry: true,
    showLabels: false,
    showAux: false,
    showAtomLabels: false,
    /** 隐藏的对称元素 key（默认全显示，故记"隐藏的"更省） */
    hidden: new Set(),
    selectedAtomKey: null,
    playingKey: null,
    /** ★ 播放用 token 防回声：动作是纯状态变更，模块**不能**等动画播完（动画属视图层）。
     *  页面比对 token，**新 token 才播**；播完回调 notePlaybackDone(token) 收尾。 */
    playToken: 0,
    language: 'zh',
  }

  /**
   * 状态变化的多订阅者。
   * ★ 用 Set 而非单槽位——页面要重绘、将来的三维视图也要重绘，
   *   单槽位会被后注册者静默顶掉（契约里对 onAction 有同样的警告）。
   */
  const subscribers = new Set()
  function emitChange() {
    const snap = getSnapshot()
    for (const cb of [...subscribers]) {
      try { cb(snap) } catch (e) { /* 单个订阅者异常不该影响其余 */ }
    }
  }

  /**
   * 订阅状态变化。返回取消函数。
   * @param {(snapshot: Object) => void} cb
   */
  function subscribe(cb) {
    if (typeof cb !== 'function') return () => {}
    subscribers.add(cb)
    return () => subscribers.delete(cb)
  }

  /** 对当前结构做点群识别（带缓存） */
  function analyze() {
    const ex = currentId ? byId.get(currentId) : null
    if (!ex) return null
    if (cachedFor === currentId && cached) return cached
    try {
      cached = identifyPointGroup(ex.structure)
      cachedFor = currentId
    } catch (e) {
      // 识别失败不该让整个模块失效——如实记下失败原因，让模型据此回应
      cached = { symbol: 'ERR', name: '识别失败', elements: [], error: (e && e.message) || String(e) }
      cachedFor = currentId
    }
    return cached
  }

  /**
   * 对称元素的**稳定 key 清单**（给动作取值域与模型用）。
   *
   * ★ 规则本身在 `engine/elementNaming.js` 的 `elementKeyList` —— **只有那一处定义**，
   *   页面把 key 对到场景对象时用的是**同一个函数**。两边各写一份的话，
   *   一个小差别就会让模型关掉 A、页面去关 B，而且不报错。
   */
  function listSymmetryElements() {
    const a = analyze()
    const els = (a && a.elements) || []
    const def = defaultVisibleKeys(a ? a.symbol : null, els)
    return elementKeyList(els).map((e) => ({ ...e, defaultVisible: def.has(e.key) }))
  }

  /**
   * 按**默认显隐策略**重置隐藏集。
   * ★ 每次换结构都要调：换了分子，元素集合整个变了，旧的 hidden 里
   *   可能存着"这个分子根本没有的元素"，那是查不出来的脏状态。
   */
  function syncHiddenFromDefaults() {
    const a = analyze()
    const els = (a && a.elements) || []
    const def = defaultVisibleKeys(a ? a.symbol : null, els)
    display.hidden = new Set(elementKeyList(els).map((e) => e.key).filter((k) => !def.has(k)))
  }

  /**
   * 原子清单（稳定 key = `atom#索引`）。
   *
   * ★ 为什么模型需要一个**原子 key**：`selectAtom` 要指认"哪个原子"。
   *   索引本身可以（原子顺序是结构自带的、不随对称性分析变化），
   *   但**必须由模块发布**而不是让模型自己数——CLAUDE.md §一.2：
   *   "id 必须来自工具返回值，不可编造"。包一层 `atom#` 是为了让人一眼看出
   *   它是"引用的原子"而不是一个裸数字。
   */
  function listAtoms() {
    const ex = currentId ? byId.get(currentId) : null
    const atoms = (ex && ex.structure && ex.structure.atoms) || []
    return atoms.map((a, i) => ({
      key: `atom#${i}`,
      element: a.element || '',
      index: i,
    }))
  }

  /** 当前合法的元素 key 集合 */
  function elementKeys() {
    return new Set(listSymmetryElements().map((e) => e.key))
  }

  /** 只读状态快照。★ 字段名要与 perception 的 fieldLabels 对得上（对不上不报错，只是痕迹不可读） */
  function getSnapshot() {
    const ex = currentId ? byId.get(currentId) : null
    const a = analyze()
    return {
      module: 'symmetry',
      example: ex ? { id: ex.id, title: ex.title, formula: ex.formula || '' } : null,
      // 识别结果：模型据此回答"是什么点群"，数值/符号一律来自程序（CLAUDE.md §一.2）
      pointGroup: a ? a.symbol : null,
      pointGroupName: a ? a.name : null,
      symmetryElementCount: a && a.elements ? a.elements.length : 0,
      symmetryElements: a && a.elements
        ? a.elements.map((el) => el.labelPlain || el.label || el.type)
        : [],
      // 可选：有自定义结构时（将来支持用户上传 xyz）
      source: 'builtin',
      // ---------------------------------------------------------------------
      // 显示状态（**顶层标量**，见 display 那段说明）
      // ---------------------------------------------------------------------
      showSymmetry: display.showSymmetry,
      showLabels: display.showLabels,
      showAux: display.showAux,
      showAtomLabels: display.showAtomLabels,
      /** 隐藏的对称元素 key，排序后拼成字符串（标量，可差分；空串表示全显示） */
      hiddenElements: [...display.hidden].sort().join(','),
      selectedAtomKey: display.selectedAtomKey,
      playingKey: display.playingKey,
      /** 播放计数：页面比对它决定"要不要真的播一遍"（同一个操作连播两次时 playingKey 不变，
       *  只有 token 变——没有它就会出现"第二次点了没反应"） */
      playToken: display.playToken,
      language: display.language,
    }
  }

  /** 单个已校验动作 → 状态变更 */
  function applyOne(name, p) {
    switch (name) {
      case 'loadExample': {
        if (!byId.has(p.id)) throw new Error(`未知示例 id：${p.id}`)
        currentId = p.id
        cachedFor = null           // 换了结构，缓存作废
        // ★ 换结构后按**默认显隐策略**重置：元素集合整个变了，
        //   旧的 key 可能指向"这个分子根本没有的元素"——那种脏状态查不出来。
        //   注意不能只 clear()（那会变成"全部显示"，与默认策略不符）。
        syncHiddenFromDefaults()
        display.selectedAtomKey = null
        display.playingKey = null
        return
      }
      case 'setSymmetryVisible': display.showSymmetry = p.visible; return
      case 'setLabelsVisible': display.showLabels = p.visible; return
      case 'setAuxVisible': display.showAux = p.visible; return
      case 'setAtomLabelsVisible': display.showAtomLabels = p.visible; return
      case 'setElementVisible': {
        if (p.visible) display.hidden.delete(p.key)
        else display.hidden.add(p.key)
        return
      }
      case 'setAllElementsVisible': {
        if (p.visible) display.hidden.clear()
        else for (const e of listSymmetryElements()) display.hidden.add(e.key)
        return
      }
      case 'playOperation': {
        display.playingKey = p.key
        display.playToken += 1     // 页面比对 token，**新 token 才播**（防回声）
        return
      }
      case 'stopAnimation': {
        display.playingKey = null
        display.playToken += 1     // 同样递增：页面据此知道"该停了"
        return
      }
      case 'selectAtom': display.selectedAtomKey = p.key; return
      case 'setLanguage': display.language = p.lang; return
      default:
        throw new Error('未实现的动作：' + name)
    }
  }

  /** 动作词汇表（给 listSceneActions 用；**不进常驻上下文**） */
  const VOCAB = {
    loadExample: {
      label: '切换分子',
      group: '结构',
      desc: '切换到指定示例分子。id 必须来自 listExamples 的返回值，不可编造。',
      params: { id: 'string' },
      animated: false,
    },
    // ---- 显示开关（原先这些只有页面上的复选框能用，模型改不动）----
    setSymmetryVisible: {
      label: '显示/隐藏对称元素',
      group: '显示',
      desc: '对称元素的**总开关**。关掉后所有轴/面/中心都不画（逐个显隐见 setElementVisible）。',
      params: { visible: 'boolean' },
      animated: false,
    },
    setLabelsVisible: {
      label: '显示/隐藏对称元素标签',
      group: '显示',
      desc: 'C₂、σv 这类文字标签的开关。讲"哪个是主轴"时打开更有用。',
      params: { visible: 'boolean' },
      animated: false,
    },
    setAuxVisible: {
      label: '显示/隐藏辅助几何',
      group: '显示',
      desc: '立方体/二面角等辅助线框——用来展示"四面体方向""二面角"这类空间关系。',
      params: { visible: 'boolean' },
      animated: false,
    },
    setAtomLabelsVisible: {
      label: '显示/隐藏原子标签',
      group: '显示',
      desc: '在原子球心显示元素符号。',
      params: { visible: 'boolean' },
      animated: false,
    },
    setElementVisible: {
      label: '逐个显隐对称元素',
      group: '显示',
      desc: '显示或隐藏**某一个**对称元素。key 必须来自 queryPointGroup 返回的 elements[].key'
        + '（形如 C2#1、sigma#2），**不可编造**。讲"只留主轴"时用它逐个关掉其余的。',
      params: { key: 'string', visible: 'boolean' },
      animated: false,
    },
    setAllElementsVisible: {
      label: '一键全显/全隐',
      group: '显示',
      desc: '把所有对称元素一起显示或隐藏。比逐个下发省一轮。',
      params: { visible: 'boolean' },
      animated: false,
    },
    // ---- 动画 ----
    playOperation: {
      label: '播放对称操作',
      group: '演示',
      desc: '把**某一个**对称元素对应的操作演出来（分子会沿该操作运动回原位）。'
        + 'key 必须来自 queryPointGroup 的 elements[].key。',
      params: { key: 'string' },
      animated: true,
    },
    stopAnimation: {
      label: '停止动画',
      group: '演示',
      desc: '停止正在播放的对称操作动画。',
      params: {},
      animated: false,
    },
    // ---- 结构 ----
    selectAtom: {
      label: '选中/取消选中原子',
      group: '结构',
      desc: '选中某个原子后，页面会显示它的**等价原子**（能被对称操作互相映到的那些）'
        + '与**稳定化子**（让它保持不动的那些操作）。key 为 null 表示取消选中。'
        + '原子 key 来自 queryPointGroup 或页面上点选的结果。',
      params: { key: 'string|null' },
      animated: false,
    },
    setLanguage: {
      label: '切换界面语言',
      group: '外观',
      desc: '中英文切换。',
      params: { lang: "'zh' | 'en'" },
      animated: false,
    },
  }

  /** 参数校验：取值域由程序把关（CLAUDE.md §一.2） */
  function validate(name, params) {
    const p = params || {}
    /** 布尔类开关的公共校验 */
    const boolOf = (field) => {
      if (typeof p[field] !== 'boolean') return { err: `${name} 需要 ${field}（true 或 false）` }
      return null
    }
    switch (name) {
      case 'loadExample': {
        const id = p.id
        if (!id || typeof id !== 'string') return { err: 'loadExample 需要 id（字符串）' }
        if (!byId.has(id)) {
          return { err: `未知示例 id：${id}（可用：${[...byId.keys()].slice(0, 8).join(' / ')} …）` }
        }
        return { params: { id } }
      }
      case 'setSymmetryVisible':
      case 'setLabelsVisible':
      case 'setAuxVisible':
      case 'setAtomLabelsVisible':
      case 'setAllElementsVisible': {
        const bad = boolOf('visible')
        return bad || { params: { visible: p.visible } }
      }
      case 'setElementVisible': {
        const keys = elementKeys()
        if (!p.key || typeof p.key !== 'string') {
          return { err: `setElementVisible 需要 key（字符串），可用：${[...keys].join(' / ') || '（当前无对称元素）'}` }
        }
        if (!keys.has(p.key)) {
          return { err: `未知对称元素 key：${p.key}（可用：${[...keys].join(' / ')}）`
            + '——key 必须来自 queryPointGroup 的 elements[].key，不可编造' }
        }
        const bad = boolOf('visible')
        return bad || { params: { key: p.key, visible: p.visible } }
      }
      case 'playOperation': {
        const keys = elementKeys()
        if (!p.key || typeof p.key !== 'string') {
          return { err: `playOperation 需要 key（字符串），可用：${[...keys].join(' / ') || '（当前无对称元素）'}` }
        }
        if (!keys.has(p.key)) {
          return { err: `未知对称元素 key：${p.key}（可用：${[...keys].join(' / ')}）` }
        }
        return { params: { key: p.key } }
      }
      case 'stopAnimation':
        return { params: {} }
      case 'selectAtom': {
        if (p.key === null || p.key === undefined) return { params: { key: null } }
        if (typeof p.key !== 'string') return { err: 'selectAtom 的 key 需要字符串或 null' }
        const atomKeys = listAtoms().map((a) => a.key)
        if (!atomKeys.includes(p.key)) {
          return { err: `未知原子 key：${p.key}（可用：${atomKeys.slice(0, 12).join(' / ')}`
            + `${atomKeys.length > 12 ? ' …' : ''}）——key 来自 queryPointGroup 的 atoms，不可编造` }
        }
        return { params: { key: p.key } }
      }
      case 'setLanguage': {
        if (p.lang !== 'zh' && p.lang !== 'en') return { err: "setLanguage 需要 lang（'zh' 或 'en'）" }
        return { params: { lang: p.lang } }
      }
      default:
        return { err: `当前模块不支持动作：${name}` }
    }
  }

  /** 动作列表（按需拉取，供工具 listSceneActions） */
  function listActions() {
    return Object.entries(VOCAB).map(([action, v]) => ({
      action, label: v.label, group: v.group, desc: v.desc, params: v.params, animated: !!v.animated,
    }))
  }

  // 构造时按默认显隐策略初始化一次隐藏集——否则第一帧的"可见性"
  // 与页面按同一策略画出来的会不一致（两边各算一次，必然有一天分叉）。
  syncHiddenFromDefaults()

  return {
    // ---- 标识 ----
    id: 'symmetry',
    title: '分子对称性',

    // ---- 契约必需 ----
    getSnapshot,
    applyActions(actions) {
      const list = Array.isArray(actions) ? actions : [{ action: actions && actions.action, params: actions && actions.params }]
      const applied = []
      const failed = []
      for (const a of list) {
        const name = a && a.action
        const v = validate(name, (a && a.params) || {})
        if (v.err) { failed.push({ action: name, error: v.err }); continue }
        try {
          applyOne(name, v.params)
          applied.push({ action: name, params: v.params })
        } catch (e) {
          failed.push({ action: name, error: (e && e.message) || String(e) })
        }
      }
      if (applied.length) emitChange()
      return { ok: failed.length === 0, applied, failed }
    },
    /**
     * ★ 恒为 true —— 本模块的动作是**纯状态变更**（换哪个分子），
     *   不需要任何视图就能完成。这是它与晶体模块最本质的区别，
     *   也是契约里"canApplyActions 的语义是能否受理、不是有没有视图"那句话的实证。
     */
    canApplyActions() { return true },

    // ---- 契约可选 ----
    /** id 的取值域（供中枢校验模型给的 id，CLAUDE.md §一.2） */
    listIds() { return [...byId.keys()] },
    /**
     * 本模块声明的前端路由（契约的可选值 `routes`）。
     * ★ 没有它，`navigateTo` 在中枢里就只有晶体语义——在对称性模块下要么消失、
     *   要么把学生带到晶体的路由上去（实测发生过：拿到 `water` 去跳 `#/viewer/water`）。
     */
    routes: [
      {
        target: 'symmetry',
        label: '打开分子对称性页面',
        params: {},
        hash: () => '#/symmetry',
      },
    ],
    sceneVocabulary: {
      vocabulary: VOCAB,
      list: () => listActions(),
      layerNotes: {},
    },
    perception: {
      // ★ 键必须是快照里真实存在的字段名（对不上不报错，只是痕迹不可读）
      //   下面这些与 getSnapshot() 里新增的显示状态字段**逐一对应**，
      //   由 assertModuleContract({ snapshotFields }) 在开发期守住。
      fieldLabels: {
        example: '切换分子',
        pointGroup: '点群变化',
        showSymmetry: '对称元素开关',
        showLabels: '对称元素标签',
        showAux: '辅助几何',
        showAtomLabels: '原子标签',
        hiddenElements: '对称元素逐个显隐',
        selectedAtomKey: '选中原子',
        playingKey: '播放对称操作',
        playToken: '播放计数',
        language: '界面语言',
      },
      dwellFields: ['example', 'selectedAtomKey'],
      formatCompact: (snap) => {
        const s = (snap && snap.state) || {}
        const it = (snap && snap.interaction) || {}
        return [
          '【当前状态】模块 symmetry'
            + (s.example ? ' · ' + s.example.title : '')
            + '；点群 ' + (s.pointGroup || '（未识别）')
            + '；对称元素 ' + (s.symmetryElementCount || 0) + ' 个'
            + (s.showSymmetry === false ? '（**当前已整体隐藏**）' : '')
            + (s.hiddenElements ? '；其中隐藏了：' + s.hiddenElements : '')
            + (s.selectedAtomKey ? '；选中原子 ' + s.selectedAtomKey : ''),
          '【交互】空闲 ' + Math.round((it.idleMs || 0) / 1000) + 's'
            + '；切换次数 ' + JSON.stringify(it.toggleCounts || {})
            + '；最近动作 ' + ((it.recentActions || []).join('→') || '（无）'),
        ].join('\n')
      },
    },

    // ---- 供工具层使用（不属于契约）----
    /**
     * 状态变化订阅（多订阅，返回取消函数）。
     * ★ 契约里的可选方法 `onAction` 就是它——本模块没有"视图动作"，
     *   状态变化的通知就是它的等价物。页面与（将来的）三维视图都订阅它。
     */
    subscribe,
    onAction: subscribe,
    /** 动作校验（壳的分镜引擎按 `(name, params)` 两参形式调用） */
    validateAction: (name, params) => {
      const v = validate(name, params)
      return v.err ? v : { params: v.params }
    },
    /** 动作词汇表原对象 */
    vocabulary: () => VOCAB,
    /** 动作名 → 短标签（面板的动作气泡用） */
    actionLabels: () => Object.fromEntries(Object.entries(VOCAB).map(([k, v]) => [k, v.label])),
    /**
     * 全部示例（给 listExamples 工具）。
     * ★ `kind` 取的是示例自己的 `category` —— 此前写的是 `e.kind || 'molecule'`，
     *   而示例根本没有 `kind` 字段，于是**两个晶体也被报成 molecule**。
     *   模型据此会拿分子的问法去问晶体，而"晶体没有分子点群"这件事它看不出来。
     *   取值只有两种：`molecule` / `crystal`。
     */
    listExamples: () => EXAMPLES.map((e) => ({
      id: e.id,
      title: e.title,
      formula: e.formula || '',
      kind: e.category || 'molecule',
    })),
    /**
     * 对称元素的**稳定 key 清单**（给模型与动作取值域用）。
     * ★ 与 `identify()` 的 elements 是同一批，只是多了稳定的 key——
     *   模型据此指认"关掉第几个"，而不是猜数组下标（下标换结构就变意思）。
     */
    listSymmetryElements,
    /** 原子清单（key = atom#索引）；模型据此指认"选中哪个原子" */
    listAtoms,
    /**
     * 动画播完了（页面调它收尾）。
     *
     * ★ **不是契约方法、不进 VOCAB**——模型看不到它，它是页面与模块之间的私有约定。
     *   与现有的 `identify` / `listExamples` / `currentId` 同类。
     *   ★ 为什么要它：动作是纯状态变更，模块**不能**等动画播完（动画属视图层，
     *     模块层连 three 都不 import）。页面播完回来说一声，状态才算真正落定。
     */
    notePlaybackDone(token) {
      if (token !== display.playToken) return false   // 过期的回执（中途又播了别的）——忽略
      display.playingKey = null
      emitChange()
      return true
    },
    /** 对当前（或指定）示例做完整识别（给 queryPointGroup 工具） */
    identify(id) {
      if (id && id !== currentId) {
        if (!byId.has(id)) return null
        currentId = id
        cachedFor = null
      }
      const ex = currentId ? byId.get(currentId) : null
      if (!ex) return null
      // ★ 晶体示例**如实标出来**，不要返回 {symbol:'ERR', name:'识别失败'}——
      //   那个 'ERR' 是本次修复前实际发生过的事：它被上层当成一个**真的点群符号**
      //   传出去了（`queryPointGroup` 会如实回报"点群 = ERR"）。
      //   调用方看到 kind==='crystal' 就知道该走 identifyCrystal()。
      if (ex.category === 'crystal') {
        return {
          id: currentId, title: ex.title, kind: 'crystal',
          symbol: null, name: null, elements: [],
        }
      }
      const a = analyze()
      if (!a) return null
      return {
        id: currentId,
        title: ex.title,
        kind: 'molecule',
        symbol: a.symbol,
        name: a.name,
        elements: (a.elements || []).map((el) => ({
          type: el.type, order: el.order,
          label: el.labelPlain || el.label || el.type,
          axis: el.axis || null,
        })),
      }
    },
    /** 当前选中的示例 id */
    currentId: () => currentId,

    /**
     * 该示例是不是**晶体**（晶体走空间群识别，不走分子点群识别）。
     *
     * ★ 为什么要有这个判断：示例里混着 26 个分子与 2 个晶体（NaCl / CsCl）。
     *   在此之前 `identify()` 对晶体返回的是 `{symbol:'ERR', name:'识别失败'}` ——
     *   页面能答（它另走了一条 WASM 分支），而**智能体不能**：
     *   `queryPointGroup({id:'nacl'})` 拿到的是"识别失败"。
     *   于是"NaCl 的点群/空间群是什么"这个 P5 的核心问题，模型答不出来，
     *   而这正是本仓库反复强调的那类缺口——**同一件事有两条路，agent 那条没接**。
     */
    isCrystal(id) {
      const ex = byId.get(id || currentId)
      return !!(ex && ex.category === 'crystal')
    },

    /**
     * 晶体示例的空间群识别。**异步**，且需要宿主注入分析器。
     *
     * ★ 为什么必须由宿主注入、不能在模块里直接 import：
     *   `modules/symmetry/space-group.js` 依赖 `@spglib/moyo-wasm`，且用
     *   `…/moyo_wasm_bg.wasm?url` 这种 **Vite 专有的导入后缀**——
     *   在 Node 里根本无法静态导入（会直接抛 ERR_MODULE_NOT_FOUND）。
     *   模块层要保持"能在 Node 里跑、能被测试"，所以走注入，
     *   与晶体模块的 quiz / compute 是同一模式。
     *
     * ★ 未注入时的返回**必须说清是"未接入"而不是"识别失败"**：
     *   两者对模型的含义完全不同——前者是"换个方式回答或如实告知学生"，
     *   后者是"这个结构没有对称性"（错的）。
     *
     * @param {string} [id] 示例 id；省略则用当前选中的
     * @returns {Promise<Object>} 成功时形如
     *   { id, title, kind:'crystal', spaceGroupNumber, spaceGroupSymbol, pointGroup,
     *     crystalSystem, pearsonSymbol, elementCount, elements }
     */
    async identifyCrystal(id) {
      if (id && id !== currentId) {
        if (!byId.has(id)) {
          return { error: `未知示例 id：${id}（id 必须来自 listExamples 的返回值）` }
        }
        currentId = id
        cachedFor = null
      }
      const ex = currentId ? byId.get(currentId) : null
      if (!ex) return { error: '当前没有选中的结构（先用 listExamples 挑一个）' }
      if (ex.category !== 'crystal') {
        return { error: `${ex.title} 是分子，不是晶体——请用点群识别（不带 kind 的那条路）` }
      }
      if (typeof analyzeCrystal !== 'function') {
        return {
          error: '本宿主未接入空间群分析器（spaceGroup），无法识别晶体的空间群。'
            + '★ 这**不是**"该结构没有对称性"，而是能力未接入——'
            + '请如实告诉学生"晶体空间群识别在当前环境不可用"，不要凭记忆给一个空间群符号。',
        }
      }
      const r = await analyzeCrystal(ex.structure)
      if (!r) return { error: `空间群分析失败：${ex.title}` }
      const els = typeof operationsToElements === 'function' ? operationsToElements(r.operations) : []
      return {
        id: currentId,
        title: ex.title,
        kind: 'crystal',
        spaceGroupNumber: r.number,
        spaceGroupSymbol: r.hmSymbol,
        pointGroup: r.pointGroup,
        crystalSystem: r.crystalSystem,
        pearsonSymbol: r.pearsonSymbol || '',
        elementCount: els.length,
        elements: (els || []).map((el) => ({
          type: el.type, order: el.order,
          label: el.labelPlain || el.label || el.type,
          axis: el.axis || null,
        })),
      }
    },
  }
}

export default createSymmetryFacade
