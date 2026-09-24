/**
 * app.js — 智能体装配：把「一个中枢 + N 个可插拔模块」拼成一个可运行的整体
 *
 * ★ 这一层解决的核心问题是**工具可见性**。有两个来源的工具：
 *   1. **中枢提供的**（模块无关）：getSnapshot / applySceneActions / listSceneActions /
 *      loadKnowledge / loadSkill —— 它们的语义与具体模块无关，由中枢实现一次，
 *      分派给"当前激活的模块"
 *   2. **模块提供的**（模块专属）：queryCrystal / listCrystals / queryOrbital …
 *      —— 只在**该模块被激活时**可见
 *
 *   这个划分不是风格选择，而是被两件事逼出来的：
 *     · 命名冲突：crystal 与 orbit 都有 `getSnapshot` 这个概念。若各模块自带，
 *       模型会看到两个同名工具（或被迫加前缀变成 crystal__getSnapshot 这种丑名字）
 *     · 注意力边界：把别的模块的工具一起摆出来，模型会答非所问地跨模块乱调。
 *       仅在 explain/compare 这类确实需要联动的节点上显式放开（见 B6b 约束 2）
 *
 *   ⚠️ 与重构计划 B6b 的一处偏差，需记明：B6b 写的是"工具名一律带模块前缀"。
 *      实际实现改为"中枢工具不带前缀 + 模块专属工具仅在激活时可见"——因为
 *      OpenAI 的 function name 只允许 [a-zA-Z0-9_-]，点号不合法，而下划线前缀
 *      会让名字变丑且对模型不友好。可见性隔离比名字前缀更能达到同一目的
 *      （防止误调），且不牺牲可读性。若将来确有跨模块同时可见的需要，
 *      再加 `模块id_工具名` 的前缀也不迟。
 *
 * ★ 本文件不碰 DOM：面板与视图由调用方注入。因此整条装配链路可以在 Node 里无头测试
 *   （见 tools/test-app.mjs）——那是唯一能证明"各层真的接上了"的办法。
 */
import { createPerception } from './core/perception.js'
import { createStoryboard } from './core/storyboard.js'
import { createConversation, buildManifestText, composeSystemPrompt } from './core/conversation.js'
import { createToolRegistry } from './core/tool-registry.js'
import { buildNodePrompt } from './nodes/constraints.js'

/**
 * 中枢提供的模块无关工具。
 *
 * @param {Object} ctx
 * @param {Function} ctx.getActive    () => 当前模块的 { facade } （可为 null）
 * @param {Object}   ctx.storyboard   core/storyboard 的实例
 * @param {Object}   ctx.knowledge    knowledge 目录（core/catalog）
 * @param {Object}   ctx.skills       skills 目录（core/catalog）
 */
export function createShellTools(ctx) {
  const def = (name, description, properties, required) => ({
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties: properties || {}, required: required || [] } },
  })

  const defs = {
    read: [
      def('getSnapshot', '获取当前视图状态的完整快照（正在看什么、哪些图层开着、外观与视角），'
        + '含【交互痕迹】（空闲时长、切换次数、最近动作）。需要了解"用户此刻在看什么、刚才做了什么"'
        + '时必须先调用它。返回的是**当前激活模块**的状态。'),
    ],
    query: [
      def('listSceneActions', '拉取当前模块的**受控动作词汇表**（能做哪些动作、参数取值范围）。'
        + '词汇表不进常驻上下文，需要时调用本工具获取。', {}),
      def('loadKnowledge', '按 id 加载知识条目正文。系统提示里只有清单（id/标题/关键词），'
        + '正文必须用本工具按需拉取——**不要臆测条目内容**。', {
        id: { type: 'string', description: '条目 id，形如 crystal:C4-1 或 orbit:K3-1' },
      }, ['id']),
      def('loadSkill', '按名加载教学法技能的完整步骤。系统提示里只有技能名与一句话说明。', {
        name: { type: 'string', description: '技能名，如 feynman / socratic' },
      }, ['name']),
    ],
    hand: [
      def('applySceneActions', '在当前视图上播放一组动作。动作会排成**分镜队列逐步播放**：'
        + '第一步立刻执行，之后停下等用户点「下一步」。因此本工具**立即返回受理回执、不等播完**，'
        + '返回里没有 executed 是正常的。单次 4–8 个动作；**每步必须写 speech 旁白**。', {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              params: { type: 'object' },
              speech: { type: 'string', description: '这一步的旁白（必填）' },
            },
            required: ['action', 'speech'],
          },
        },
      }, ['actions']),
    ],
    teach: [],
  }

  /** 取当前激活模块；没有则返回一个信息明确的错误结果 */
  function active() {
    const a = typeof ctx.getActive === 'function' ? ctx.getActive() : null
    if (!a || !a.facade) return null
    return a
  }
  const noModule = { error: '当前没有激活任何模块（请先让用户选定要讲解的对象）' }

  const handlers = {
    getSnapshot() {
      const a = active()
      if (!a) return noModule
      return { snapshot: a.facade.getSnapshot(), 演示播放: ctx.storyboard.state() }
    },
    listSceneActions() {
      const a = active()
      if (!a) return noModule
      return { actions: a.facade.sceneVocabulary.list(), layerNotes: a.facade.sceneVocabulary.layerNotes }
    },
    loadKnowledge(p) {
      const k = ctx.knowledge.load(p && p.id)
      return k || { error: `未找到知识条目：${p && p.id}（可用条目见系统提示中的清单）` }
    },
    loadSkill(p) {
      const s = ctx.skills.load(p && p.name)
      return s || { error: `未找到技能：${p && p.name}（可用技能见系统提示中的清单）` }
    },
    async applySceneActions(p) {
      const a = active()
      if (!a) return noModule
      // 校验由模块自己负责（它才知道参数取值范围），队列由分镜引擎负责。
      // 工具层**只做转发**——否则回退/快照/闸门都要再实现一遍。
      const actions = (p && p.actions) || []
      const r = await ctx.storyboard.applySequence(actions)
      return {
        queued: r.queued || 0,
        accepted: r.accepted || 0,
        failed: r.failed,
        overflow: r.overflow,
        manual: r.manual,
        totalSteps: r.total,
        note: (r.note || '') + ' 提示：用户点「下一步」后才会有下一步动作，中途可以「停止」。',
      }
    },
  }

  return { defs, handlers }
}

/**
 * 装配整个智能体应用。
 *
 * @param {Object}   opts
 * @param {Array}    opts.modules      [{ id, facade, defs, handlers, catalog? }]
 *                                     facade 见 contract/module-contract.js；
 *                                     defs/handlers 由模块的 tools.js 提供
 * @param {Object}   opts.settings    ui-kit 的 settings store
 * @param {Object}   opts.llm         core/llm-client
 * @param {Object}   opts.knowledge   knowledge 目录（core/catalog 实例）
 * @param {Object}   opts.skills      skills 目录
 * @param {Object}   [opts.panel]     面板（core/ui/panel）；无头测试可不给
 * @param {string}   [opts.node]      初始决策节点（默认 explain）
 * @param {Object}   [opts.prompts]   { role, moduleRoles: { [id]: string } }
 * @param {Function} [opts.onActiveChange] (moduleId|null) => void
 */
export function createAgentApp(opts = {}) {
  const settings = opts.settings
  const llm = opts.llm
  if (!settings) throw new Error('createAgentApp 需要 opts.settings')
  if (!llm) throw new Error('createAgentApp 需要 opts.llm')

  const modules = new Map((opts.modules || []).map((m) => [m.id, m]))
  const knowledge = opts.knowledge
  const skills = opts.skills
  /**
   * 当前激活的模块。
   * ★ 默认取第一个注册的模块：单模块部署不该强制调用方先显式激活一次
   *   （否则"我注册了模块却什么工具都看不到"是个很容易踩的坑——本文件的集成测试
   *   第一版就踩了）。null 表示"刻意不激活"，此时模块专属工具全部不可见。
   */
  let activeId = (opts.modules && opts.modules.length) ? opts.modules[0].id : null
  let node = opts.node || 'explain'

  // ---------------------------------------------------------------------------
  // 分镜引擎：回退靠快照，不靠反向执行（动作带副作用）
  // ---------------------------------------------------------------------------
  const storyboard = createStoryboard({
    vocabulary: {},                       // 由 setActiveModule 换成当前模块的词汇表
    validate: (name, params) => {
      const m = modules.get(activeId)
      if (!m || !m.validate) return { err: `当前模块不支持动作：${name}` }
      return m.validate(name, params)
    },
    applyStep: async (name, params) => {
      const m = modules.get(activeId)
      if (!m) return { ok: false, error: '模块未激活' }
      const r = m.facade.applyActions([{ action: name, params }])
      return r.ok ? { ok: true } : { ok: false, error: (r.failed[0] || {}).error || '执行失败' }
    },
    capture: () => {
      const m = modules.get(activeId)
      if (!m || !m.facade.getSnapshot) return null
      return { module: activeId, state: m.facade.getSnapshot() }
    },
    restore: (snap) => {
      if (!snap) return false
      // 快照只存"当前状态"无法反向恢复（动作带副作用），故模块需要能整体回设。
      // 目前模块尚未提供 restoreState 能力时，退回为**尽力恢复**：
      // 把快照里记录的图层/外观逐项设回去（这些是可逆的标量/布尔属性）。
      const m = modules.get(snap.module)
      if (!m || !m.facade.applyActions) return false
      const s = snap.state || {}
      const actions = []
      if (s.crystal && s.crystal.id) actions.push({ action: 'loadCrystal', params: { crystalId: s.crystal.id } })
      for (const layer of s.layersOn || []) actions.push({ action: 'setLayer', params: { layer, visible: true } })
      // 关掉快照里没开的图层（逐个，避免误关总开关）
      for (const layer of ALL_LAYERS) {
        if (!(s.layersOn || []).includes(layer)) actions.push({ action: 'setLayer', params: { layer, visible: false } })
      }
      const r = m.facade.applyActions(actions)
      return r.ok
    },
    getDefaultPlayback: () => (settings.get().playback === 'auto' ? 'auto' : 'manual'),
  })

  // ---------------------------------------------------------------------------
  // 感知：轮询当前模块的快照做差分（零侵入：模块不必改自己的事件处理）
  // ---------------------------------------------------------------------------
  const perception = createPerception({
    getState: () => {
      const m = modules.get(activeId)
      return m ? m.facade.getSnapshot() : { module: activeId }
    },
    // ★ 键必须是**快照里真实存在的字段名**。我第一版写了 `crystalId`，
    //   而晶体模块的快照字段叫 `crystal`（对象）——于是"用户换了晶体"不会被识别成
    //   loadCrystal，痕迹里只会出现一堆原始字段名。字段名对不上不会报错，
    //   只是痕迹变得不可读，这类错很难发现。
    fieldLabels: {
      crystal: '切换晶体',
      layersOn: '切换图层',
      cellDisplayMode: '切换晶胞显示',
      view: '调整视角',
      hiddenElements: '按元素显隐',
      atomScale: '调整原子缩放',
      stickRadius: '调整键粗细',
    },
    dwellFields: [],
    describeState: (s) => s,
    formatCompact: (snap) => {
      const s = (snap && snap.state) || {}
      const it = (snap && snap.interaction) || {}
      return [
        '【当前状态】模块 ' + (s.module || activeId || '（无）')
          + (s.crystal ? ' · ' + (s.crystal.name || s.crystal.id) : '')
          + '；图层 ' + ((s.layersOn || []).join(',') || '（无）'),
        '【交互】空闲 ' + Math.round((it.idleMs || 0) / 1000) + 's'
          + '；切换次数 ' + JSON.stringify(it.toggleCounts || {})
          + '；最近动作 ' + ((it.recentActions || []).join('→') || '（无）'),
      ].join('\n')
    },
  })

  // ---------------------------------------------------------------------------
  // 工具注册表：每次按当前节点+当前模块重新裁决
  // ---------------------------------------------------------------------------
  const shell = createShellTools({ getActive: () => modules.get(activeId), storyboard, knowledge, skills })

  function buildRegistry() {
    const m = modules.get(activeId)
    const toolsByClass = {}
    for (const cls of ['read', 'query', 'hand', 'teach']) {
      toolsByClass[cls] = [].concat(
        (shell.defs[cls] || []),
        m && m.defs ? (m.defs[cls] || []) : [],
      )
    }
    const handlers = Object.assign({}, shell.handlers, (m && m.handlers) || {})
    const reg = createToolRegistry({ tools: toolsByClass, handlers })
    reg.setNode(node)
    return reg
  }
  let registry = buildRegistry()

  // ---------------------------------------------------------------------------
  // 对话循环
  // ---------------------------------------------------------------------------
  const conversation = createConversation({
    llm,
    getSettings: () => settings.get(),
    getTools: () => registry.definitions(),
    executeTool: (name, argsJson) => registry.execute(name, argsJson),
    getSnapshotText: () => (activeId ? perception.toCompactText() : ''),
    buildSystem: () => {
      const m = modules.get(activeId)
      const manifest = buildManifestText({ knowledge, skills })
      const roleParts = [
        opts.prompts && opts.prompts.role,
        m && opts.prompts && opts.prompts.moduleRoles ? opts.prompts.moduleRoles[m.id] : (m && m.roleHint),
      ].filter(Boolean).join('\n\n')
      return composeSystemPrompt({
        role: roleParts,
        manifest,
        nodePrompt: buildNodePrompt(node),
      })
    },
    onAbort: () => storyboard.stop(),
  })

  /**
   * 激活一个模块。
   * ★ 切换时必须重建工具注册表与分镜词汇表——否则模型仍会看到上一个模块的工具，
   *   而动作也会被送去上一个模块校验。
   */
  function setActiveModule(id) {
    if (id != null && !modules.has(id)) throw new Error(`未注册的模块：${id}`)
    if (activeId === id) return activeId
    storyboard.stop()                       // 换模块时中止在播的演示，避免跨模块串台
    activeId = id
    const m = modules.get(id)
    storyboard.setVocabulary ? storyboard.setVocabulary((m && m.vocabulary) || {}) : null
    perception.reset()
    registry = buildRegistry()
    if (typeof opts.onActiveChange === 'function') opts.onActiveChange(id)
    return activeId
  }

  /** 切换决策节点（会重新裁决工具白名单） */
  function setNode(n) {
    node = n
    registry.setNode(n)
    return registry.available()
  }

  return {
    // ---- 生命周期 ----
    start() { perception.start() },
    stop() { perception.stop(); storyboard.stop(); conversation.stop() },
    // ---- 模块与节点 ----
    setActiveModule, setNode,
    get activeModule() { return activeId },
    get node() { return node },
    listModules: () => [...modules.keys()],
    // ---- 对外接口 ----
    send: (text, handlers) => conversation.send(text, handlers),
    getTools: () => registry.available(),
    get registry() { return registry },
    perception, storyboard, conversation,
    /** 供测试与调试：当前会发给模型的工具定义 */
    toolDefs: () => registry.definitions(),
  }
}

/** 全部图层名（供 restore 时逐个关闭未开的图层） */
const ALL_LAYERS = [
  'atoms', 'bonds', 'wireframe', 'interstices', 'octahedral', 'tetrahedral',
  'symmetry', 'axes', 'auxiliaryBody', 'auxiliaryFace', 'atomLabels',
  'hydrogenBonds', 'latticePoints',
]

export default createAgentApp
