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
// ★ 注册本区字典（纯数据 ESM，副作用即 registerDict）——工具描述与提示词都要用它。
//   缺了它，t() 查不到键会**原样把键名当文案返回**（`agent.tool.noModule`），
//   而覆盖率守卫照样绿 —— 它只读字典文件里登记了哪些原文，不看谁 import 了它。
//   （其余调用 t() 的文件也各自 import 了字典，见 core/ 与 store/ 里的同一条注释。）
import './i18n.js'
import { t, i18n } from '../i18n/index.js'
import { createPerception } from './core/perception.js'
import { createStoryboard } from './core/storyboard.js'
import { createConversation, buildManifestText, composeSystemPrompt } from './core/conversation.js'
import { createToolRegistry } from './core/tool-registry.js'
import { buildNodePrompt, listNodes, NODES } from './nodes/constraints.js'
// ★ 契约已提升为独立包（packages/module-contract/），此处用固定深度的相对路径引用
//   ——不用 alias，是为了让 packages/ 被原样复制到下游镜像时这条路径依然成立。
import { assertModuleContract } from '../module-contract/index.js'

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

  // ---------------------------------------------------------------------------
  // 中枢工具的子集**由当前模块的能力决定**
  // ---------------------------------------------------------------------------
  // ★ 为什么不是"全给，缺能力时报错"：模型看得见却调不动，会浪费一整轮
  //   （它调用、拿到错误、再想办法）；而"这个工具压根不出现"是结构性的——
  //   与 CLAUDE.md §一.1「约束靠白名单，不靠提示词劝说」同一个道理。
  //   故：模块没提供 demos → 四个演示工具不存在；没提供 listIds → navigateTo 不存在。
  const demos = ctx.demos || null
  const canDeclareIntent = typeof ctx.onIntent === 'function'

  // ---------------------------------------------------------------------------
  // 导航：由各模块**声明自己的路由**，中枢据此派生 schema 与跳转
  // ---------------------------------------------------------------------------
  /**
   * ★ 为什么不再看 `listIds` 决定"能不能导航"：那让导航能力取决于
   *   "某个模块碰巧实现了 listIds"。**orbit 没有**（它的 id 空间是 n/l/m，不是字符串清单），
   *   于是文本路由一旦把 activeId 切到 orbit，`navigateTo` 就**整个消失**——
   *   模型想带学生去看某个轨道时，手里根本没有那个工具。
   *
   * ★ 为什么取**所有模块**路由的并集、而不是当前模块的：跨模块跳转本来就是跨模块的事。
   *   在首页时 activeModule 是 crystal，但学生问"水是什么点群"要跳 `#/symmetry`。
   *   （动作 `applySceneActions` 相反——它**只作用于当前模块**，两者的边界不能混。）
   */
  const shellModules = typeof ctx.getModules === 'function' ? ctx.getModules() : []
  const routeList = [{ owner: null, target: 'home', label: t('agent.tool.navigateTo.homeLabel'), params: {}, hash: () => '#/' }]
  for (const m of shellModules) {
    const rs = (m && m.facade && m.facade.routes) || []
    for (const r of rs) if (r && r.target) routeList.push(Object.assign({ owner: m.id }, r))
  }
  const routeTargets = [...new Set(routeList.map((r) => r.target))]
  const canNavigate = routeTargets.length > 0
  /** 派生给模型的参数 schema（各 route 声明的参数取并集） */
  const routeParamProps = {}
  for (const r of routeList) {
    for (const [name, spec] of Object.entries(r.params || {})) {
      if (!routeParamProps[name]) {
        routeParamProps[name] = { type: 'string', description: (spec && spec.desc) || '' }
      }
    }
  }
  /** 该 route 所属模块的 id 清单（校验 kind:'id' 的参数）；该模块没有就跳过校验 */
  function idsOfRoute(route) {
    const owner = shellModules.find((m) => m.id === route.owner)
    const f = owner && owner.facade
    if (!f || typeof f.listIds !== 'function') return null
    try { return new Set(f.listIds()) } catch (e) { return null }
  }

  const defs = {
    read: [
      def('getSnapshot', t('agent.tool.getSnapshot.desc')),
    ],
    query: [
      def('listSceneActions', t('agent.tool.listSceneActions.desc'), {}),
      def('loadKnowledge', t('agent.tool.loadKnowledge.desc'), {
        id: { type: 'string', description: t('agent.tool.loadKnowledge.id') },
      }, ['id']),
      def('loadSkill', t('agent.tool.loadSkill.desc'), {
        name: { type: 'string', description: t('agent.tool.loadSkill.name') },
      }, ['name']),
      // 演示脚本由**模块**提供（见契约的 demos 字段）；模块没提供则本工具不存在
      ...(demos ? [def('listDemos', t('agent.tool.listDemos.desc'), {})] : []),
      // ★ 只在 route / explain 节点可见（经 constraints 的 allowExtra 单点放行）。
      //   它让"意图判断"成为**结构化的工具参数**，而不是让模型吐一段 JSON 文本再解析
      //   ——后者在模型加代码块、加解释、漏引号时会静默失败，而我们连它想说什么都拿不到。
      ...(canDeclareIntent ? [def('declareIntent', t('agent.tool.declareIntent.desc'), {
        intent: { type: 'string', description: t('agent.tool.declareIntent.intent', { nodes: listNodes().join(' / ') }) },
        confidence: { type: 'number', description: t('agent.tool.declareIntent.confidence') },
        slots: { type: 'object', description: t('agent.tool.declareIntent.slots') },
      }, ['intent', 'confidence'])] : []),
    ],
    hand: [
      def('applySceneActions', t('agent.tool.applySceneActions.desc'), {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              params: { type: 'object' },
              speech: { type: 'string', description: t('agent.tool.applySceneActions.speech') },
            },
            required: ['action', 'speech'],
          },
        },
      }, ['actions']),
      /**
       * ★ 导航能力（仅在模块提供 listIds 时存在）。
       *
       * 为什么必需：**首页（或对比页）上没有三维视图**，于是 applySceneActions 会失败
       * （工具层会明确报"当前没有可驱动的视图"）。但学生完全可能在首页提问
       * ——"讲讲 NaCl"——此时智能体应当能**带他过去**，而不是只能说"请你自己打开"。
       *
       * 与 applySceneActions 的区别：动作词汇表描述的是"**当前视图内**的操作"，
       * 而"跳到另一个页面"超出了这个范畴，故它是一个独立**工具**而非动作。
       */
      ...(canNavigate ? [def('navigateTo', t('agent.tool.navigateTo.desc'), {
        // ★ schema 从各模块声明的 routes **派生**（原先这里是硬编码的晶体语义：
        //   target 只有 home/crystal/compare、参数写死叫 crystalId——接第二个模块就失效）
        target: { type: 'string', enum: routeTargets, description: t('agent.tool.navigateTo.target') },
        ...routeParamProps,
      }, ['target'])] : []),
      // ---- 演示工具（脚本来自模块，播放能力在中枢）----
      ...(demos ? [
        def('playDemo', t('agent.tool.playDemo.desc'), {
          id: { type: 'string', description: t('agent.tool.playDemo.id') },
        }, ['id']),
        def('replayDemo', t('agent.tool.replayDemo.desc'), {
          demoId: { type: 'string', description: t('agent.tool.replayDemo.demoId') },
        }, []),
        def('reviseDemo', t('agent.tool.reviseDemo.desc'), {
          op: {
            type: 'string', enum: ['replace', 'insert', 'remove', 'jump'],
            description: t('agent.tool.reviseDemo.op'),
          },
          demoId: { type: 'string', description: t('agent.tool.reviseDemo.demoId') },
          index: { type: 'number', description: t('agent.tool.reviseDemo.index') },
          step: {
            type: 'object',
            description: t('agent.tool.reviseDemo.step'),
            properties: {
              action: { type: 'string' },
              params: { type: 'object' },
              speech: { type: 'string' },
            },
          },
        }, ['op', 'index']),
      ] : []),
    ],
    teach: [],
  }

  /** 取当前激活模块；没有则返回一个信息明确的错误结果 */
  function active() {
    const a = typeof ctx.getActive === 'function' ? ctx.getActive() : null
    if (!a || !a.facade) return null
    return a
  }
  const noModule = { error: t('agent.tool.noModule') }

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
      return k || { error: t('agent.tool.loadKnowledge.notFound', { id: p && p.id }) }
    },
    loadSkill(p) {
      const s = ctx.skills.load(p && p.name)
      return s || { error: t('agent.tool.loadSkill.notFound', { name: p && p.name }) }
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
        note: (r.note || '') + ' ' + t('agent.tool.applySceneActions.hint'),
      }
    },

    // ---- 意图声明（只在 route / explain 节点可见）----
    /**
     * 声明意图的实际记录由 createAgentApp 提供（它持有 pendingIntent 与切换节点的能力）。
     * 工具层只转发——否则"低置信度忽略"、"回退到讲解节点"这些规则要写两遍。
     */
    declareIntent(p) {
      if (typeof ctx.onIntent !== 'function') {
        return { error: t('agent.tool.declareIntent.unsupported') }
      }
      return ctx.onIntent(p)
    },

    // ---- 预置演示（零 token：内容事先编排好，播放不花额度）----
    //    脚本由**模块**提供（ctx.demos），播放能力在中枢（分镜队列）——见契约的 demos 字段。
    listDemos() {
      const list = demos.manifest()
      return {
        count: list.length,
        demos: list,
        note: t('agent.tool.listDemos.note'),
      }
    },

    async playDemo(p) {
      const id = p && p.id
      const script = demos.byId(id)
      if (!script) {
        return { error: t('agent.tool.playDemo.notFound', { id, list: demos.list().map((d) => d.id).join(' / ') }) }
      }
      const a = active()
      if (!a) return noModule
      // ★ 与 applySceneActions 同样的前置检查——入队成功 ≠ 播放成功：
      //   不查的话模型会以为演示已开始，而画面上什么都没动。
      //   判据用契约的 canApplyActions()，**不是**猜快照里的某个字段——
      //   后者正是"中枢退化成晶体中枢"的根源（见契约里该方法的 why）。
      if (typeof a.facade.canApplyActions === 'function' && !a.facade.canApplyActions()) {
        return { error: t('agent.tool.playDemo.noView') }
      }
      // origin='script'：让演示记录能区分"预置脚本回放"与"智能体现场编排"
      const r = await ctx.storyboard.applySequence(
        script.steps.map((s) => Object.assign({}, s)), { origin: 'script' },
      )
      return {
        ok: true,
        // ★ 两个 id 别混：`demoScriptId` 是**脚本**（nacl-6，固定不变），
        //   `demoId` 是本次的**分镜记录**（d1、d2…，回放时要用它）。
        demoScriptId: script.id,
        demoId: r.demoId,
        title: script.title,
        totalSteps: r.total,
        failed: r.failed,
        note: t('agent.tool.playDemo.note', { title: script.title, total: r.total, demoId: r.demoId }),
      }
    },

    replayDemo(p) {
      const r = ctx.storyboard.replay(p && p.demoId)
      if (!r || !r.ok) return { ok: false, error: (r && r.error) || t('agent.tool.replayDemo.none') }
      return {
        ok: true,
        demoId: r.demoId,
        totalSteps: r.total,
        note: t('agent.tool.replayDemo.note', { demoId: r.demoId, total: r.total }),
      }
    },

    /**
     * 修订某一条演示（replace / insert / remove / jump）。
     * ★ 工具层只做转发与回执润色——两条路径的分流、快照链的保全、快进重播
     *   都在 storyboard 里，在这里重实现一遍必然漂移。
     */
    reviseDemo(p) {
      const a = active()
      if (!a) return noModule
      const r = ctx.storyboard.reviseDemo(
        (p && p.demoId != null && p.demoId !== '') ? p.demoId : null,
        p && p.op,
        p && p.index,
        (p && p.step) || {},
      )
      if (!r || !r.ok) return { ok: false, error: (r && r.error) || t('agent.tool.reviseDemo.failed') }
      return Object.assign(r, {
        note: r.mode === 'reload'
          ? t('agent.tool.reviseDemo.noteReload', { step: r.resumedAt })
          : t('agent.tool.reviseDemo.noteInplace'),
      })
    },

    /**
     * 导航到指定页面/视图。
     *
     * ★ 只改 `location.hash`——路由与页面的创建交给宿主的路由器自己做
     *   （那才是它们的分内事；在这里手工 new 页面会绕过 unmount、泄漏资源）。
     * ★ id 的合法性由**模块**的 `listIds()` 校验（CLAUDE.md §一.2：数值一律程序算，
     *   模型不得编造 id）。中枢不猜 id 空间。
     */
    navigateTo(p) {
      if (typeof window === 'undefined' || !window.location) {
        return { error: t('agent.tool.navigateTo.noEnv') }
      }
      // ★ 变量名刻意不叫 `t`：本文件顶部 import 的 `t()` 是 i18n 取值函数，
      //   局部同名会把整段函数里的翻译调用变成"拿字符串当函数调"的运行时崩溃。
      const target = (p && p.target) || ''
      const route = routeList.find((r) => r.target === target)
      if (!route) {
        return {
          error: t('agent.tool.navigateTo.unknownTarget', {
            target: target || t('agent.tool.navigateTo.unknownTargetEmpty'),
            list: routeTargets.join(' / '),
          }),
        }
      }

      // 参数校验：id 类用**该 route 所属模块**的 id 清单（模块的 id 空间只有它自己知道）
      const ids = idsOfRoute(route)
      for (const [name, spec] of Object.entries(route.params || {})) {
        const v = p && p[name]
        if (!v) return { error: t('agent.tool.navigateTo.needParam', { target, name }) }
        if (spec && spec.kind === 'id' && ids && !ids.has(v)) {
          return { error: t('agent.tool.navigateTo.unknownId', { id: v }) }
        }
      }
      // 跨参数的约束（如"两个对象不能相同"）由 route 自己表达——中枢不猜
      if (typeof route.validate === 'function') {
        const bad = route.validate(p)
        if (bad) return { error: bad }
      }

      let hash = null
      try { hash = typeof route.hash === 'function' ? route.hash(p) : null } catch (e) { hash = null }
      if (!hash) return { error: t('agent.tool.navigateTo.incomplete', { target }) }
      window.location.hash = hash
      return { ok: true, note: route.note || t('agent.tool.navigateTo.opened', { label: route.label || target }) }
    },
  }

  return { defs, handlers }
}

/**
 * 已经报过的降级签名（`模块id|缺失键,…`）。
 * ★ 放在模块作用域而非 createAgentApp 内：宿主可能反复装配，
 *   同一条降级只该说一遍（见 createAgentApp 里的上报处）。
 */
const HOST_DEGRADE_REPORTED = new Set()

/**
 * 装配整个智能体应用。
 *
 * @param {Object}   opts
 * @param {Array}    opts.modules      [{ id, facade, defs, handlers, catalog? }]
 *                                     facade 见 packages/module-contract/index.js；
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

  /**
   * 学情模型（可选）。
   *
   * ★ 它由宿主注入（`modules/crystal/store/mastery.js` 之类的实现），中枢只把它
   *   **并进感知快照**——这样模型每轮都知道"哪些知识点已掌握、哪些反复出错"，
   *   出题与讲解才有针对性。此前学情只在模块内部用于"推荐下一题"，
   *   模型是在完全不了解学生底细的情况下出题的。
   *
   * ★ 中枢**不实现它、也不规定它的形状**：只要求有一个 `summary()` 返回可序列化的
   *   概况。学情的存储与规则是学科相关的事，属于模块。
   */
  const mastery = opts.mastery || null

  // ---------------------------------------------------------------------------
  // 契约强制校验 —— 缺必需方法就拒绝启动
  // ---------------------------------------------------------------------------
  // ★ 为什么必须在**装配期**校验，而不是只在各模块的测试里：
  //   "我注册了模块、却什么都驱动不了"这类坑，写在测试里是拦不住的——
  //   它只在"这个模块恰好没跑测试"或"新宿主忘了接某条通路"时显形。
  //   放在这里，任何宿主、任何调用路径都无法绕过（包括将来的 apps/crystal 独立壳），
  //   而且**第二个模块接进来时会自动发现缺什么**，不依赖任何人记得去查。
  //   本文件的集成测试第一版就踩过同类坑（注册了模块却看不到工具）。
  //
  // ★ 校验两条边，但**调用点不同**（别在这一层找 assertHostProvides）：
  //   · 模块**提供**的（assertModuleContract）—— 缺必需方法即拒绝启动，就在下面这个循环里
  //   · 宿主**提供**的（enforceHostRequirements）—— 在各模块自己的 `createModule` 里。
  //     放那儿是因为"宿主"的接口面正是在那里交出去的，而且模块要装进**两个**宿主
  //     （统一壳 apps/web 与它自己的独立页）——写在这一层只能覆盖前者。
  //     所以走到这里时，必需项早就在更早的地方被拦下了；这里只做**降级上报**：
  //     模块如实记下的"宿主少给了哪几样可选能力"（hostReport.degraded）值得打出来，
  //     否则"少给"就等于"永远不查"——那正是本仓库反复踩的那类坑。
  const contractReport = []
  for (const m of modules.values()) {
    const r = assertModuleContract(m.facade, { label: m.id })
    contractReport.push(r)
    if (!r.ok) {
      throw new Error(
        `模块 ${m.id} 不符合模块契约，缺少必需方法：${r.missingRequired.join('、')}\n`
        + `  契约见 packages/module-contract/index.js\n`
        + `  该模块已提供：${r.present.join('、') || '（无）'}`,
      )
    }
    for (const w of r.warnings) console.warn(`[contract] ${m.id}: ${w}`)

    // onAction 冒烟：契约要求它**返回取消函数**，否则订阅无法取消、回调会持续累积。
    // ★ 这是个可运行时验证的事实，比静态猜"函数声明了几个参数"可靠得多
    //   （后者与"是否单槽位"没有因果关系，必然误报——见契约文件里的说明）。
    if (typeof m.facade.onAction === 'function') {
      try {
        const off = m.facade.onAction(() => {})
        if (typeof off !== 'function') {
          console.warn(`[contract] ${m.id}: onAction 没有返回取消函数`
            + '——订阅将无法取消、持续累积（契约明确要求返回 off()）')
        } else {
          off()   // 立刻取消，不在装配阶段留下副作用
        }
      } catch (e) {
        console.warn(`[contract] ${m.id}: onAction 订阅时抛错：${(e && e.message) || e}`)
      }
    }
  }

  // 降级上报：一行一个模块，只在**真的少了东西**时出现。
  // ★ 刻意用 warn 而不是静默：独立页与统一壳的能力差异，应当一眼看得见。
  //   但也不抛错——可选能力缺失是设计好的降级（工具如实回"未接入"），不是故障。
  // ★ 同一进程内**每种降级只报一次**：宿主可能反复装配（测试里尤其如此——
  //   9 次装配就会打出 9 行一模一样的告警）。重复告警不是"更醒目"，
  //   而是把真问题淹掉；本仓库刚为这一点退役过一条守卫（见 check-shared-data.mjs）。
  for (const m of modules.values()) {
    const d = m.hostReport && m.hostReport.degraded
    if (!d || !d.length) continue
    const sig = m.id + '|' + d.join(',')
    if (HOST_DEGRADE_REPORTED.has(sig)) continue
    HOST_DEGRADE_REPORTED.add(sig)
    console.warn(`[host] 模块 ${m.id} 缺少可选能力：${d.join('、')}`
      + '（相应工具将如实不存在，见 modules/' + m.id + '/host-requirements.js）')
  }

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
      if (!m || !m.validate) return { err: t('agent.storyboard.unsupportedAction', { name }) }
      return m.validate(name, params)
    },
    applyStep: async (name, params) => {
      const m = modules.get(activeId)
      if (!m) return { ok: false, error: t('agent.storyboard.noModule') }
      const r = m.facade.applyActions([{ action: name, params }])
      return r.ok ? { ok: true } : { ok: false, error: (r.failed[0] || {}).error || t('agent.sb.execFailed') }
    },
    capture: () => {
      const m = modules.get(activeId)
      if (!m || !m.facade.getSnapshot) return null
      return { module: activeId, state: m.facade.getSnapshot() }
    },
    restore: (snap) => {
      if (!snap) return false
      const m = modules.get(snap.module)
      if (!m || !m.facade) return false
      // ★ 契约的 restoreState：**模块自己知道怎么还原自己**。
      //   中枢此前是"尽力恢复"——逐项枚举晶体的 13 个图层名（ALL_LAYERS）、
      //   5 个动作名与外观字段。那是把模块的内部结构抄了一份进通用核，
      //   接第二个模块时还得再抄一份轨道专属的，而且抄的过程会漏
      //   （晶体线已因此丢过视角与外观两次）。现已下移到模块。
      //
      // ★ 未提供 restoreState 时**禁用**回退能力（返回 false），而不是退回猜。
      //   这是刻意的选择：降级路径永远不会被发现是错的（它"看起来在工作"），
      //   而禁用路径第一天就会有人报"上一步点不了"。
      if (typeof m.facade.restoreState !== 'function') return false
      try {
        const r = m.facade.restoreState(snap.state)
        return !!(r && r.ok)
      } catch (e) {
        return false
      }
    },
    getDefaultPlayback: () => (settings.get().playback === 'auto' ? 'auto' : 'manual'),
  })

  // ---------------------------------------------------------------------------
  // 感知：轮询当前模块的快照做差分（零侵入：模块不必改自己的事件处理）
  // ---------------------------------------------------------------------------
  /**
   * 按**当前激活模块**构造感知层。
   *
   * ★ 必须随模块重建，不能只创建一次然后 reset：
   *   `fieldLabels` / `dwellFields` / `describeState` 在 createPerception 里是
   *   **创建时捕获**的（只有 `formatCompact` 是每次调用时从 opts 读），
   *   而这三样都是模块自己的（它的快照字段名、它有教学意义的停留字段）。
   *   切换模块只 reset 的话，第二个模块的痕迹仍会套着第一个模块的标签——
   *   表现为 orbit 的交互被标成"切换晶体"，而且**不报错**。
   *
   * ★ 配置来自模块契约的 `perception` 字段（此前写死在这个装配函数里，
   *   中枢于是成了"晶体中枢"：接第二个模块还得再写一份轨道专属的）。
   */
  function makePerception() {
    const m = modules.get(activeId)
    const cfg = (m && m.facade && m.facade.perception) || {}
    return createPerception(Object.assign({
      getState: () => {
        const mm = modules.get(activeId)
        const snap = mm ? mm.facade.getSnapshot() : { module: activeId }
        // ★ 学情并进快照（浅拷贝后再挂，不改模块自己返回的那个对象）。
        //   感知层对字段做**深度结构比较**（见 core/perception.js 的 eq），
        //   所以只要 summary() 的结果结构稳定，就不会被误判成"每轮都在变"。
        //   加不进去也不该影响感知——故 try/catch 兜住，失败即当作没有学情。
        if (mastery && typeof mastery.summary === 'function') {
          try {
            return Object.assign({}, snap, { mastery: mastery.summary() })
          } catch (e) { /* 学情摘要失败：如实降级为"没有学情"，而不是让感知整个挂掉 */ }
        }
        return snap
      },
      describeState: (s) => s,
    }, cfg))
  }
  let perception = makePerception()
  /** 是否已 start（切换模块时若已启动，新实例要接着启） */
  let started = false

  // ---------------------------------------------------------------------------
  // 工具注册表：每次按当前节点+当前模块重新裁决
  // ---------------------------------------------------------------------------
  /**
   * 处理模型的意图声明（`declareIntent` 工具）。
   *
   * ★ 为什么让意图走**工具参数**而不是让模型吐一段 JSON 文本：
   *   解析自由文本是脆的——模型会加代码块、加解释、加中文引号、漏引号，
   *   而解析失败时只能静默降级，连"它到底想说什么"都拿不到。
   *   做成工具参数后，意图就是结构化数据，参数校验由 schema 保证。
   *
   * ★ 低于阈值**保持原节点**，而不是勉强切过去：切错节点的代价是那一轮的工具集
   *   全错（比如切到 quiz 就丢掉了 applySceneActions，讲解落不到画面上）。
   */
  function handleIntent(p) {
    const intent = p && p.intent
    const confidence = Number(p && p.confidence)
    if (!intent || !NODES[intent]) {
      return { error: t('agent.intent.unknownNode', { intent, list: listNodes().join(' / ') }) }
    }
    if (!(confidence >= 0.6)) {
      return { ok: true, ignored: true, node, note: t('agent.intent.lowConfidence', { confidence, node }) }
    }
    if (intent === node) return { ok: true, node, note: t('agent.intent.same', { node }) }
    setNode(intent)
    return { ok: true, node: intent, note: t('agent.intent.switched', { intent }) }
  }

  /**
   * 中枢工具集。**随模块重建**——因为它的子集由**模块能力**决定
   * （模块没提供 demos，那四个演示工具就不存在；没提供 listIds，就没有 navigateTo）。
   * 见 createShellTools 里的说明：模型看得见却调不动，会白白浪费一轮。
   */
  function makeShell() {
    const m = modules.get(activeId)
    return createShellTools({
      getActive: () => modules.get(activeId),
      // 导航要**所有模块**的路由（跨模块跳转本来就是跨模块的事），
      // 而 applySceneActions 只作用于当前模块——两者的边界不能混。
      getModules: () => [...modules.values()],
      storyboard, knowledge, skills,
      demos: (m && m.facade && m.facade.demos) || null,
      onIntent: handleIntent,
    })
  }
  let shell = makeShell()

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
    const reg = createToolRegistry({
      tools: toolsByClass,
      handlers,
      // ★ 角色映射必须跟着**当前模块**走：它把"节点要什么意图"绑到"本模块的工具名"。
      //   漏传的症状是静默的——节点索要"出题"时拿不到本模块的出题工具，
      //   而没有任何东西会报错（详见 constraints.js 的 ROLE_SPEC 说明）。
      roles: (m && m.roles) || {},
    })
    reg.setNode(node)
    return reg
  }
  let registry = buildRegistry()

  /**
   * 换语言后**重建中枢工具**。
   *
   * ★ 为什么必需：工具描述与参数说明是 `createShellTools()` 那一刻调 `t()` 定下来的
   *   （`def()` 把结果写进定义对象），而 `registry.definitions()` 每一轮都把这些
   *   **同一批对象**原样发给模型。不重建的话，切成英文之后模型收到的仍是中文描述——
   *   这正是"守卫绿了、运行时其实没生效"的那一类。
   * ★ 只重建中枢工具与注册表：分镜队列、感知层、对话历史都不受影响
   *   （换语言不该打断正在播的演示，也不该丢上下文）。
   */
  const offLangChange = i18n.onChange(() => {
    try {
      shell = makeShell()
      registry = buildRegistry()
    } catch (e) { /* 重建失败不该影响语言切换本身 */ }
  })

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
    // ★ 感知层**随模块重建**（配置是模块自己的，见 makePerception 的说明）。
    //   先停旧的再建新的——否则旧实例的轮询定时器会继续跑，
    //   把上一个模块的状态写进一个已经没人读的对象里。
    try { perception.stop() } catch (e) { /* 未启动时 stop 可能抛，忽略 */ }
    perception = makePerception()
    if (started) perception.start()
    shell = makeShell()          // 中枢工具的子集随模块能力变（演示、导航）
    registry = buildRegistry()
    if (typeof opts.onActiveChange === 'function') opts.onActiveChange(id)
    return activeId
  }

  /**
   * 按用户这句话的内容，自动切到合适的模块。
   *
   * ★ 为什么需要它：模块原来**只靠 URL** 激活（各路由自己 setActiveModule）。
   *   而首页 `.on('/')` 不设任何模块，`activeId` 就停在"第一个注册的模块"（晶体）——
   *   于是用户在首页问"水分子是什么点群"，模型手里拿的**是晶体的工具**，
   *   `registry/modules.js` 里那个 `routeByText()` 虽然早就写好，却**零运行时调用方**。
   *   这正是"智能体只在晶体下工作"的直接原因。
   *
   * ★ 宿主可以（也应当）注入 `shouldAutoRoute` 把这件事**限制在无模块的页面上**：
   *   一旦 URL 已经把用户带到某个模块的页面上，模块归属就该由 URL 说了算——
   *   否则在 `#/orbit` 上问一句"NaCl 的配位数"会切到 crystal，
   *   而 view-registry 里注册的还是 orbit 的视图，动作会落到空气上。
   *
   * ★ 放在中枢而不是壳里包一层 send：放这里才能被 test-app 直接测到。
   *   放壳里的话这段逻辑在 Node 里不可测——"接线断了没人知道"的老问题会重现。
   */
  function maybeAutoRoute(text) {
    if (typeof opts.routeByText !== 'function') return null
    if (typeof opts.shouldAutoRoute === 'function' && !opts.shouldAutoRoute()) return null
    let hits = []
    try { hits = opts.routeByText(text) || [] } catch (e) { return null }
    if (!hits.length) return null                 // 没命中 → 保持当前模块，不瞎切
    const best = hits[0]
    if (!best || !best.module || best.module === activeId) return null
    if (!modules.has(best.module)) return null
    setActiveModule(best.module)
    return best
  }

  /** 切换决策节点（会重新裁决工具白名单） */
  function setNode(n) {
    node = n
    registry.setNode(n)
    return registry.available()
  }

  return {
    // ---- 生命周期 ----
    start() { started = true; perception.start() },
    stop() {
      started = false
      perception.stop()
      storyboard.stop()
      conversation.stop()
      // 退订语言变更（否则反复装配的宿主会积下一串没人再用的回调与注册表）
      try { offLangChange() } catch (e) { /* 忽略 */ }
    },
    // ---- 模块与节点 ----
    setActiveModule, setNode,
    get activeModule() { return activeId },
    get node() { return node },
    listModules: () => [...modules.keys()],
    // ---- 对外接口 ----
    send: (text, handlers) => {
      // ★ 先按这句话的内容决定该在哪个模块下回答，再进入对话循环。
      //   宿主可用 shouldAutoRoute 把自动路由限定在"没有模块归属的页面"上（见函数说明）。
      maybeAutoRoute(text)
      return conversation.send(text, handlers)
    },
    getTools: () => registry.available(),
    get registry() { return registry },
    // ★ 用 getter 而不是值捕获：感知层会在切模块时**重建**（配置是模块自己的），
    //   值捕获会让外部一直握着第一个模块的那个实例。
    get perception() { return perception },
    storyboard, conversation,
    /**
     * 各模块的契约合规实况（装配时已算过，此处只读返回）。
     * ★ 供实机调试把手与"各模块接入进度"展示用：
     *   `window.__chemAgent.app.contractReport()` 一眼看到谁缺什么。
     *   它同时也是"注册表那套骨架真正生效"的证据之一。
     */
    contractReport: () => contractReport,
    /** 供测试与调试：当前会发给模型的工具定义 */
    toolDefs: () => registry.definitions(),
  }
}

// ★ 这里原本有一个 `ALL_LAYERS` 常量（晶体的 13 个图层名），供 restore 时逐个关闭
//   未开的图层。它是"把模块内部结构抄进通用核"的直接证据——接第二个模块时
//   还得再抄一份轨道专属的清单，而且抄的过程会漏。
//   现已下移到模块：`modules/crystal/facade.js` 的 restoreState 用模块自己的
//   动词汇表（LAYER_PROPS）遍历，从结构上不可能抄漏。中枢不再认识任何模块的字段。

export default createAgentApp
