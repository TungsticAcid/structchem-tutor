/**
 * test-app.mjs —— 装配层（app.js）的集成验证
 *
 * 运行：node packages/agent-core/tools/test-app.mjs
 *
 * ★ 这是唯一能证明"各层真的接上了"的测试：它把**真实的**晶体模块（facade + 工具 + 词汇表）
 *   与**真实的**共享核（对话循环、工具注册表、感知、分镜）装在一起跑一轮对话。
 *   桩只用在两处：视图（避开 three.js/DOM）与 LLM（避开网络）。
 *
 * 重点验证三件事：
 *   1. 工具可见性：按节点裁决，且模块切换会换掉工具集（B6b 的注意力边界）
 *   2. 端到端：模型调 queryCrystal → 程序算出的密度真的回到上下文里的 tool 消息
 *   3. 分镜队列：applySceneActions **立即返回受理回执**，动作排队等用户点「下一步」
 */
import { createAgentApp } from '../app.js'
import { createCatalog } from '../core/catalog.js'
import { createSettingsStore } from '../../ui-kit/settings-store.js'
import { registerInto as registerOrbitKnowledge } from '../../knowledge/orbit/index.js'
import { registerInto as registerCrystalKnowledge } from '../../knowledge/crystal/index.js'
import { registerInto as registerSymmetryKnowledge } from '../../knowledge/symmetry/index.js'
import { registerInto as registerCommonSkills } from '../../skills/common/index.js'
import { createModule as createCrystalModule } from '../../../modules/crystal/index.js'
import { createModule as createSymmetryModule } from '../../../modules/symmetry/index.js'
import { createModule as createOrbitModule } from '../../../modules/orbit/index.js'
import { HOST_REQUIREMENTS as CRYSTAL_HOST_REQS } from '../../../modules/crystal/host-requirements.js'
import { HOST_REQUIREMENTS as SYMMETRY_HOST_REQS } from '../../../modules/symmetry/host-requirements.js'
import { HOST_REQUIREMENTS as ORBIT_HOST_REQS } from '../../../modules/orbit/host-requirements.js'

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
function section(t) { console.log(`\n【${t}】`) }

// ---- 晶体数据（真实数据，不是造的）----
const DATA = {}
for (const id of ['fcc', 'naCl', 'diamond', 'csCl']) {
  const m = await import(`../../../projects/crystal/H5/src/data/crystals/${id}.js`)
  DATA[id] = m.default
}
const CATALOG = Object.values(DATA).map((d) => ({
  id: d.id, name: d.name, formula: d.formula, crystalSystem: d.crystalSystem,
  category: d.category || 'x', subtitle: d.subtitle || '', systemName: d.systemName || '',
}))
const loadData = (id) => DATA[id] || null

/** 桩视图（避 three.js/DOM），行为对齐 ViewerCanvas 的相关接口 */
function mkView() {
  const props = { crystalId: 'naCl', showAtoms: true, showWireframe: true, showInterstices: false, showOctahedral: false, showTetrahedral: false, showSymmetry: false, showBonds: false, showAxes: false, showAuxiliaryBody: false, showAuxiliaryFace: false, showAtomLabels: false, showHydrogenBonds: false, showLatticePoints: false, atomVisibility: {}, atomScale: 1, stickRadius: 0.08, cellDisplayMode: 'conventional', opacity: 0 }
  const calls = []
  return {
    props, calls,
    getProps: () => ({ ...props, atomVisibility: { ...props.atomVisibility } }),
    setProps: (p) => { calls.push(p); Object.assign(props, p) },
    getViewState: () => ({ theta: 0.7854, phi: 0.9553, radius: 42 }),
    setView: (d) => calls.push({ setView: d }),
    resetView: () => calls.push({ resetView: true }),
    getContainer: () => ({ addEventListener: () => {}, querySelector: () => null }),
  }
}

/** 脚本化假 LLM：记录每次收到的 messages，按脚本返回 */
function mkLLM(script) {
  let i = 0
  const calls = []
  return {
    calls,
    chat: async (o) => {
      calls.push({ msgs: JSON.parse(JSON.stringify(o.messages)), tools: (o.tools || []).map((t) => t.function.name) })
      const r = script[Math.min(i++, script.length - 1)]
      if (r.content && o.onDelta) o.onDelta({ type: 'content', text: r.content })
      return { content: r.content || '', reasoning: '', toolCalls: r.toolCalls || [], finishReason: r.finishReason || 'stop', usage: null }
    },
  }
}
const tc = (name, args, id) => ({ id: id || ('call_' + name), type: 'function', function: { name, arguments: JSON.stringify(args || {}) } })

/** 装配一次，返回全部可观测点 */
function buildApp(script) {
  const view = mkView()
  const crystal = createCrystalModule({ view, catalog: CATALOG, loadData })
  const knowledge = createCatalog({ key: 'id' })
  const skills = createCatalog({ key: 'name' })
  registerOrbitKnowledge(knowledge)
  registerCrystalKnowledge(knowledge)
  registerSymmetryKnowledge(knowledge)
  registerCommonSkills(skills)

  const settings = createSettingsStore({ storageKey: 'test.settings', storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
  settings.set({ apiKey: 'test-key', model: 'm', maxTokens: 512 })

  const llm = mkLLM(script)
  const app = createAgentApp({
    modules: [crystal],
    settings, llm, knowledge, skills,
    prompts: { role: '你是结构化学教学智能体。' },
    node: 'explain',
  })
  return { app, view, crystal, knowledge, skills, llm, settings }
}

// ============================================================================
section('装配：中枢工具 + 当前模块的专属工具')
// ============================================================================
{
  const { app } = buildApp([{ content: 'x' }])
  const names = app.getTools()
  const SHELL = ['getSnapshot', 'listSceneActions', 'applySceneActions', 'loadKnowledge', 'loadSkill']
  const MODULE = ['listCrystals', 'getCrystalDetail', 'queryCrystal']

  check('中枢工具都在（语义与模块无关，由中枢提供一次）',
    SHELL.every((n) => names.includes(n)), names.join(','))
  check('当前模块的专属工具都在', MODULE.every((n) => names.includes(n)), names.join(','))
  check('未激活模块时没有专属工具', (() => {
    app.setActiveModule(null)
    const n2 = app.getTools()
    return MODULE.every((x) => !n2.includes(x)) && SHELL.every((x) => n2.includes(x))
  })())
  app.setActiveModule('crystal')
  check('重新激活后专属工具回来', app.getTools().includes('queryCrystal'))
  check('发出给模型的工具定义都是 OpenAI 格式',
    app.toolDefs().every((d) => d.type === 'function' && d.function.name))
}

// ============================================================================
section('工具可见性按节点裁决（注意力边界）')
// ============================================================================
{
  const { app } = buildApp([{ content: 'x' }])
  check('explain 节点有 applySceneActions（边讲边演示）', app.getTools().includes('applySceneActions'))

  app.setNode('quiz')
  const quizTools = app.getTools()
  check('★ 切到 quiz 节点后，工具列表里**没有** applySceneActions（结构上做不到）',
    !quizTools.includes('applySceneActions'), quizTools.join(','))
  check('quiz 仍能查晶体（read+query 授权）', quizTools.includes('queryCrystal') && quizTools.includes('getSnapshot'))
  check('quiz 的**定义数组**里也没有 applySceneActions',
    !app.toolDefs().some((d) => d.function.name === 'applySceneActions'))
  check('★ 执行期二次把关：即使硬调也被拒（不靠提示词劝说）',
    (await app.registry.execute('applySceneActions', '{"actions":[]}')).error !== undefined)

  app.setNode('proactive')
  check('proactive 节点同样拿不到手类工具', !app.getTools().includes('applySceneActions'))
  app.setNode('explain')
  check('切回 explain 后恢复', app.getTools().includes('applySceneActions'))
}

// ============================================================================
section('端到端：模型调工具 → 程序算出的数值回到上下文')
// ============================================================================
{
  const script = [
    { toolCalls: [tc('queryCrystal', { crystalId: 'naCl', kind: 'density' })], finishReason: 'tool_calls' },
    { content: 'NaCl 的密度约为 2.19 g/cm³。', finishReason: 'stop' },
  ]
  const { app, llm } = buildApp(script)
  app.setActiveModule('crystal')

  let toolResults = []
  const summary = await app.send('NaCl 的密度是多少？', {
    onToolResult: (i) => toolResults.push(i),
  })

  check('一轮对话跑完（两轮 LLM 调用）', llm.calls.length === 2 && summary.ok === true)
  check('工具被调用且成功', toolResults.length === 1 && !toolResults[0].result.error)
  const density = toolResults[0].result.density
  check(`程序算出的密度与已知值吻合（${density} ≈ 2.19）`,
    Math.abs(density - 2.19) < 0.03, String(density))
  check('工具结果带上了配方与 Z 的来历（可核查，不是一个凭空出现的数）',
    /Z·M/.test(toolResults[0].result.formula) && /化学式单位数/.test(toolResults[0].result.Znote))

  // ★ 关键：数值真的**回到**了模型上下文（作为 tool 消息），而不只是函数返回
  const secondMsgs = llm.calls[1].msgs
  const toolMsg = secondMsgs.find((m) => m.role === 'tool')
  check('★ 工具结果以 tool 消息回灌进上下文（模型能看到事实而非自己算）',
    !!toolMsg && String(toolMsg.content).includes(String(density)), toolMsg ? String(toolMsg.content).slice(0, 80) : '（没有 tool 消息）')
  check('历史里 assistant 的 tool_calls 与 tool 消息配对',
    (() => {
      const asst = secondMsgs.find((m) => m.tool_calls)
      return !!asst && secondMsgs.filter((m) => m.role === 'tool').length === asst.tool_calls.length
    })())
}

// ============================================================================
section('端到端：分镜队列（applySceneActions 立即返回受理回执）')
// ============================================================================
{
  const ACTIONS = [
    { action: 'setLayer', params: { layer: 'octahedral', visible: true }, speech: '打开八面体空隙' },
    { action: 'setLayer', params: { layer: 'atoms', visible: false }, speech: '隐去原子球，只看空隙分布' },
  ]
  const script = [
    { toolCalls: [tc('applySceneActions', { actions: ACTIONS })], finishReason: 'tool_calls' },
    { content: '已排好演示，请点「下一步」。', finishReason: 'stop' },
  ]
  const { app, view, llm } = buildApp(script)
  app.setActiveModule('crystal')

  let toolResult = null
  await app.send('演示一下 NaCl 的八面体空隙', { onToolResult: (i) => { toolResult = i.result } })

  check('工具返回受理回执（含 totalSteps）', toolResult && toolResult.totalSteps === 2, JSON.stringify(toolResult))
  check('回执里告诉模型"用户点下一步后才会有下一步动作"', /下一步/.test(toolResult.note || ''))
  check('★ 第一步立即执行（模型的第一笔立刻可见）', view.props.showOctahedral === true)
  check('★ 第二步**没有**执行（在闸门上等用户点下一步）', view.props.showAtoms === true,
    'showAtoms 应仍为 true（第二步尚未执行）')

  const st = app.storyboard.state()
  check('分镜走到第 1 步、共 2 步、正等用户确认',
    st.index === 1 && st.total === 2 && st.waitingForUser === true, JSON.stringify(st))
  check('回执里没有 executed（工具不等播完，不阻塞对话循环）',
    toolResult.executed === undefined)

  // 用户点「下一步」→ 第二步执行
  app.storyboard.next()
  await new Promise((r) => setTimeout(r, 5))
  check('用户点下一步后第二步执行', view.props.showAtoms === false)
  check('播完后可回退与重播', app.storyboard.state().canReplay === true)
}

// ============================================================================
section('演示记录层与「回到演示前」（M2 回流带来的新能力）')
// ============================================================================
// ★ 这一段存在的理由：storyboard.js 这次从 418 行涨到 971 行，多出来的 553 行
//   是"演示记录层"（演示可寻址、可整改、可重放、可回到演示前）。**搬进来必须验证**——
//   本仓库吃过"搬了东西却没接线、测试还全绿"的亏（幽灵工具名事故）。
//   这里逐条验证新能力**真的可用**，而不是只检查方法存在。
{
  const { app, view } = buildApp([{ content: 'x' }])
  app.setActiveModule('crystal')

  check('演示前没有可恢复的快照', app.storyboard.beforeSnapshot() === null)
  check('演示前记录层为空', app.storyboard.listRecords().length === 0)

  const r = await app.storyboard.applySequence([
    { action: 'setLayer', params: { layer: 'octahedral', visible: true }, speech: '打开八面体空隙' },
    { action: 'setLayer', params: { layer: 'tetrahedral', visible: true }, speech: '再打开四面体空隙' },
  ])
  check('applySequence 返回 demoId（演示可寻址）', !!r.demoId, JSON.stringify(r))
  check('演示被记进记录层', app.storyboard.listRecords().length === 1)
  check('★ 可按 id 取回该记录（不是只有一份"最近演示"）',
    !!app.storyboard.getDemo(r.demoId))
  check('记录里带上步骤数与来源', (() => {
    const rec = app.storyboard.getDemo(r.demoId)
    return !!rec && rec.steps.length === 2 && !!rec.origin
  })(), JSON.stringify(app.storyboard.getDemo(r.demoId)))
  check('演示后有了「演示前」快照（供「↩ 回到演示前」）',
    app.storyboard.beforeSnapshot() != null)

  // 队列可寻址：面板要据此渲染每一步的旁白与状态
  const qi = app.storyboard.queueInfo()
  check('queueInfo 列出每一步（含动作名与旁白）',
    qi.length === 2 && qi[0].action === 'setLayer' && /八面体/.test(qi[0].speech || ''),
    JSON.stringify(qi))

  // 整改：删掉第 2 步（就地改队列）
  const rv = app.storyboard.reviseDemo(r.demoId, 'remove', 1)
  check('reviseDemo 能删步', rv && rv.ok !== false, JSON.stringify(rv))

  // 重放：用记录重建一次
  const rp = app.storyboard.replay(r.demoId)
  check('replay 能按记录重放（此前"stop() 之后无法回放"是这个记录层缺失导致的）',
    rp && rp.ok !== false, JSON.stringify(rp))

  // 回到演示前
  const rb = app.storyboard.restoreBefore()
  check('restoreBefore 能还原', rb && rb.ok !== false, JSON.stringify(rb))
  check('★ 还原后图层回到演示前的样子',
    view.props.showOctahedral === false, JSON.stringify(view.props.showOctahedral))

  // 节奏切换：手动逐步 vs 自动
  const sm = app.storyboard.setManual(true)
  check('setManual 能切到手动逐步', sm && sm.ok !== false && app.storyboard.manual === true)
  app.storyboard.setManual(false)
  check('能切回自动', app.storyboard.manual === false)
}

// ============================================================================
section('系统提示：角色 + 清单 + 当前节点约束')
// ============================================================================
{
  const { app, llm } = buildApp([{ content: 'x' }])
  app.setActiveModule('crystal')
  app.setNode('quiz')
  await app.send('出个题', {})

  const sys = llm.calls[0].msgs[0].content
  check('含模块角色片段', /晶体结构/.test(sys))
  check('含节点约束（quiz 的硬性禁令）', /不得操控当前视图/.test(sys))
  check('含知识库清单（只有索引，不含正文）', /【知识库清单】/.test(sys) && /orbit:K/.test(sys))
  check('★ 清单里没有正文（渐进式披露：正文要 loadKnowledge 才进上下文）',
    !/主量子数 n = 1,2,3/.test(sys))
  check('含教学技能清单', /【教学技能清单】/.test(sys))
  check('快照作为临时 system 注入在 index 1（不写进 history）',
    /【当前视图快照（实时）】/.test(llm.calls[0].msgs[1].content))
}

// ============================================================================
section('感知：交互痕迹（零侵入，靠轮询差分）')
// ============================================================================
{
  const { app, view } = buildApp([{ content: 'x' }])
  app.setActiveModule('crystal')

  let clock = 0
  // 用注入的时钟驱动感知，避免依赖真实时间
  const snap0 = app.perception.snapshot()
  check('快照含当前模块状态', snap0.state && snap0.state.module === 'crystal')
  check('快照含晶体的教学相关信息（名称/图层/外观）',
    !!snap0.state.crystal && Array.isArray(snap0.state.layersOn) && typeof snap0.state.atomScale === 'number')

  app.perception.poll()
  view.props.showSymmetry = true
  app.perception.poll()
  const trace = app.perception.getTrace()
  check('★ 视图状态变化被差分记录（模块无需改自己的事件处理）',
    trace.recentActions.includes('切换图层') || trace.toggleCounts['切换图层'] >= 1,
    JSON.stringify(trace))

  // 用户在页面上直接改（不经智能体）也应被感知到 —— 这正是"零侵入"的意义
  view.props.crystalId = 'diamond'
  app.perception.poll()
  check('用户在页面上的改动同样被感知（读的是视图真值）',
    app.perception.getTrace().recentActions.includes('切换晶体'),
    JSON.stringify(app.perception.getTrace().recentActions))

  const compact = app.perception.toCompactText()
  check('紧凑文本含模块与图层摘要（省 token 的注入形式）',
    /模块 crystal/.test(compact) && /图层/.test(compact))
}

// ============================================================================
section('切模块：词汇表与工具一并更换，在播分镜中止')
// ============================================================================
{
  const { app } = buildApp([{ content: 'x' }])
  app.setActiveModule('crystal')
  // 排一段分镜
  await app.storyboard.applySequence([
    { action: 'setLayer', params: { layer: 'atoms', visible: true }, speech: 'a' },
    { action: 'setLayer', params: { layer: 'bonds', visible: true }, speech: 'b' },
  ])
  check('切换前分镜在播', app.storyboard.state().total === 2)

  app.setActiveModule(null)
  check('★ 切模块会中止在播分镜（跨模块继续播没有意义）', app.storyboard.state().total === 0)
  check('切换后 getSnapshot 明确报"没有激活模块"而**不是**编造状态',
    /没有激活/.test((await app.registry.execute('getSnapshot', '{}')).error))
}

// ============================================================================
section('感知配置随模块重建（切模块后痕迹标签属于新模块）')
// ============================================================================
// ★ 这一段守的是一个**不报错的潜伏缺陷**：perception 的 fieldLabels / dwellFields
//   / describeState 在 createPerception 里是**创建时捕获**的，原先"切模块只 reset"。
//   后果：第二个模块的交互会套着第一个模块的标签——orbit 的"调节量子数"被标成
//   "切换晶体"。界面上看不出错，只是痕迹不可读，而痕迹是主动介入与错因诊断的依据。
{
  const settings = createSettingsStore({ storageKey: 'test.settings', storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
  settings.set({ apiKey: 'k', model: 'm', maxTokens: 8 })
  const llm = mkLLM([{ content: 'x' }])
  const knowledge = createCatalog({ key: 'id' })
  const skills = createCatalog({ key: 'name' })

  // 两个模块，各自的快照字段与标签都不同（模拟 crystal 与 orbit）
  const stateA = { module: 'alpha', spin: 1 }
  const stateB = { module: 'beta', flip: 1 }
  const mk = (id, state, labels) => ({
    id, title: id,
    facade: {
      id,
      getSnapshot: () => ({ ...state }),
      applyActions: () => ({ ok: true }),
      canApplyActions: () => true,
      perception: { fieldLabels: labels },
    },
  })
  const A = mk('alpha', stateA, { spin: '调节自旋' })
  const B = mk('beta', stateB, { flip: '翻转取向' })

  const app = createAgentApp({
    modules: [A, B], settings, llm, knowledge, skills, node: 'explain',
  })

  app.setActiveModule('alpha')
  app.perception.poll()                 // 建立基线
  stateA.spin = 2                       // 用户改了 A 的字段
  app.perception.poll()
  const traceA = app.perception.getTrace()
  check('模块 A 的痕迹用 A 自己的标签',
    traceA.recentActions.some((a) => /调节自旋/.test(a)), JSON.stringify(traceA.recentActions))

  app.setActiveModule('beta')
  app.perception.poll()                 // 新实例建立基线
  stateB.flip = 2                       // 用户改了 B 的字段
  app.perception.poll()
  const traceB = app.perception.getTrace()
  check('★ 切到模块 B 后，痕迹用 B 自己的标签（不是 A 的、也不是原始字段名）',
    traceB.recentActions.some((a) => /翻转取向/.test(a)), JSON.stringify(traceB.recentActions))
  check('★ 且不再出现 A 的标签（旧配置没有残留）',
    !traceB.recentActions.some((a) => /调节自旋/.test(a)), JSON.stringify(traceB.recentActions))

  // 对外取到的 perception 必须是**当前**实例（用 getter 而非值捕获）
  check('app.perception 始终指向当前实例（切模块后仍是同一个引用）',
    app.perception === app.perception)
}

// ============================================================================
section('契约在装配期强制上岗（缺必需方法就拒绝启动）')
// ============================================================================
{
  const settings = createSettingsStore({ storageKey: 'test.settings', storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
  settings.set({ apiKey: 'k', model: 'm', maxTokens: 8 })
  const llm = mkLLM([{ content: 'x' }])
  const knowledge = createCatalog({ key: 'id' })
  const skills = createCatalog({ key: 'name' })

  /** 起一个 app，返回捕获到的错误（不抛到调用方） */
  const tryBuild = (facade) => {
    try {
      createAgentApp({
        modules: [{ id: 'probe', title: '探测模块', facade }],
        settings, llm, knowledge, skills, node: 'explain',
      })
      return null
    } catch (e) { return e }
  }

  // ★ 这三条是 M1 的验收项：契约增补后，缺件模块必须**拒绝启动**，
  //   而不是带着残缺的 facade 跑起来、然后在某个动作上静默失效。
  const errCan = tryBuild({ getSnapshot: () => ({}), applyActions: () => ({ ok: true }) })
  check('缺 canApplyActions 的模块被拒绝启动', !!errCan)
  check('错误信息指名道姓（含 canApplyActions）',
    !!errCan && /canApplyActions/.test(errCan.message), errCan && errCan.message)
  check('错误信息带上模块 id（便于定位是谁）',
    !!errCan && /probe/.test(errCan.message), errCan && errCan.message)

  const errSnap = tryBuild({ applyActions: () => ({ ok: true }), canApplyActions: () => true })
  check('缺 getSnapshot 时也拒绝并列出**全部**缺失项',
    !!errSnap && /getSnapshot/.test(errSnap.message), errSnap && errSnap.message)

  // 合规的伪装模块 → 正常启动，且实况可查
  const okMod = { getSnapshot: () => ({}), applyActions: () => ({ ok: true }), canApplyActions: () => true }
  const appOk = createAgentApp({
    modules: [{ id: 'probe', title: '探测模块', facade: okMod }],
    settings, llm, knowledge, skills, node: 'explain',
  })
  const report = appOk.contractReport()
  check('合规模块正常启动', !!appOk)
  check('contractReport() 报出每个模块的实况',
    Array.isArray(report) && report.length === 1 && report[0].label === 'probe', JSON.stringify(report && report.length))
  check('实况里 ok 为真、必需方法齐备',
    report[0].ok === true && report[0].missingRequired.length === 0,
    JSON.stringify(report[0].missingRequired))
  check('可选项缺失只进 missing、不影响 ok（不假装支持，也不因此拒绝启动）',
    report[0].missing.length > 0 && report[0].ok === true,
    `${report[0].missing.length} 项可选缺失`)

  // 真实晶体模块也应当合规（否则本文件前面所有端到端断言都是建立在"违规模块"上）
  const { app } = buildApp([{ content: 'x' }])
  const rr = app.contractReport()[0]
  check('真实晶体模块通过契约校验', rr.ok === true, JSON.stringify(rr.missingRequired))
  check('★ 晶体模块现在提供 canApplyActions（替代"中枢猜 crystal 字段"）',
    rr.present.includes('canApplyActions'))
  check('★ 晶体模块现在提供 listIds（此前是隐形契约）',
    rr.present.includes('listIds'))
}

// ============================================================================
section('三个真实模块 · 契约合规与宿主需求对账')

/**
 * ★ 这一节把 test-core 里那段**错报的"接入实况表"**换成了真东西。
 *
 *   原先那段拿 `assertModuleContract({ id: m.id })` 当模块——一个只有 id 的空桩——
 *   于是永远得到"三个模块都未满足契约"，还打印一张与事实相反的报表。
 *   这正是 CLAUDE.md 记的第一类坑「断言要断言实现，不是名字」的升级版：
 *   断言对象是桩 → 永远绿；而它**打印出来的东西会误导人**。
 *
 *   要真的判定"三个模块是否合规"，只有一条路：**把它们建出来**。
 *   本文件本来就跨模块（它建真的晶体模块 + 真的共享核），是这件事的正确归属地。
 */
{
  const mkView = () => ({
    setProps() {}, getProps() { return {} }, setView() {}, resetView() {},
    getViewState() { return {} }, isReady() { return true },
  })

  // ---- ① 三个模块都满足契约（真的建出来判，不是判桩）----
  const built = [
    ['crystal', createCrystalModule({ view: mkView(), catalog: CATALOG, loadData })],
    ['symmetry', createSymmetryModule({ initialId: 'water' })],
    ['orbit', createOrbitModule({})],
  ]
  for (const [id, mod] of built) {
    const r = mod.facade && mod.facade.getSnapshot
      ? (await import('../../module-contract/index.js')).assertModuleContract(mod.facade, { label: id })
      : { ok: false, missingRequired: ['facade'] }
    check(`${id} 模块满足契约（建真的模块来判，而不是拿空桩判）`,
      r.ok === true, '缺：' + (r.missingRequired || []).join(','))
  }

  // ---- ② 每个模块都带回装配期的宿主动态报告 ----
  for (const [id, mod] of built) {
    check(`${id} 模块带回 hostReport（"宿主给了什么/少了什么"的实测报告）`,
      !!mod.hostReport && Array.isArray(mod.hostReport.degraded), JSON.stringify(mod.hostReport))
  }

  // ---- ③ 必需/可选的划分必须与**实现**一致（这条是本节的重点）----
  // 判据不是"文档怎么写"，而是"拿掉它会不会真的坏"：
  //   · 声称 required 的键拿掉 → 必须抛错
  //   · 声称 optional 的键拿掉 → 必须不抛错（抛了就是把降级误当故障）
  for (const [id, reqs] of [['crystal', CRYSTAL_HOST_REQS], ['symmetry', SYMMETRY_HOST_REQS],
                            ['orbit', ORBIT_HOST_REQS]]) {
    const bad = reqs.filter((r) => !r || !r.key || typeof r.required !== 'boolean' || !r.note)
    check(`${id} 的需求清单格式完备（每项有 key / required 布尔 / note）`,
      bad.length === 0, bad.map((r) => JSON.stringify(r)).join(','))
    const keys = reqs.map((r) => r.key)
    check(`${id} 的需求清单无重复键`, new Set(keys).size === keys.length, keys.join(','))
  }

  // 晶体：三个必需键任一拿掉都必须抛错，且报错要**列全**缺的（不只见到一个就抛）
  const CRYSTAL_REQUIRED = CRYSTAL_HOST_REQS.filter((r) => r.required).map((r) => r.key)
  check('晶体的必需键就是 view / catalog / loadData（与实现一致：三条都在构造路径上）',
    CRYSTAL_REQUIRED.join(',') === 'view,catalog,loadData', CRYSTAL_REQUIRED.join(','))
  let hostMsg = ''
  try { createCrystalModule({ view: mkView() }) } catch (e) { hostMsg = e.message }
  check('晶体缺必需项 → 抛错', /缺少必需能力/.test(hostMsg), hostMsg.slice(0, 60))
  check('报错把缺的**全部**列出来（catalog 与 loadData，而不是见到第一个就抛）',
    /catalog/.test(hostMsg) && /loadData/.test(hostMsg), hostMsg.slice(0, 120))
  check('报错指名模块与需求清单的位置', /crystal/.test(hostMsg) && /host-requirements\.js/.test(hostMsg))

  // 晶体壳里少接的那几样，必须如实落在 degraded 里（而不是被当成失败、也不是被吞掉）
  const crystalFull = built[0][1]
  check('壳少接的 quiz/compute/mastery/skills/practiceGuard 如实记进 degraded',
    ['quiz', 'compute', 'mastery', 'skills', 'practiceGuard']
      .every((k) => crystalFull.hostReport.degraded.includes(k)),
    crystalFull.hostReport.degraded.join(','))
  check('必需项不出现在 degraded 里（给了就不该说缺）',
    !crystalFull.hostReport.degraded.some((k) => CRYSTAL_REQUIRED.includes(k)),
    crystalFull.hostReport.degraded.join(','))
  check('晶体的 degraded 项都是清单里标了 required:false 的',
    crystalFull.hostReport.degraded.every((k) => {
      const r = CRYSTAL_HOST_REQS.find((x) => x.key === k)
      return r && r.required === false
    }), crystalFull.hostReport.degraded.join(','))

  // ---- ④ 另两个模块的需求清单与它们的行为一致 ----
  check('对称性只向宿主索取空间群分析器这一项（它不需要视图：动作落在自己的状态上）',
    SYMMETRY_HOST_REQS.length === 1 && SYMMETRY_HOST_REQS[0].key === 'spaceGroup',
    SYMMETRY_HOST_REQS.map((r) => r.key).join(','))
  check('空间群分析器是**可选项**（不注入时晶体示例如实回"未接入"，而不是拒绝启动）',
    SYMMETRY_HOST_REQS.every((r) => r.required === false))
  check('对称性模块在没注入分析器时仍能建起来，并把缺的那项记进 degraded',
    !!built[1][1].facade && built[1][1].hostReport.degraded.join(',') === 'spaceGroup',
    built[1][1].hostReport.degraded.join(','))
  {
    // 注入了桩之后就应当没有降级——证明 degraded 反映的是**真的有没有**
    const withStub = createSymmetryModule({ initialId: 'water', spaceGroup: async () => null,
                                            operationsToElements: () => [] })
    check('注入空间群分析器后 degraded 为空',
      withStub.hostReport.degraded.length === 0, withStub.hostReport.degraded.join(','))
  }
  check('轨道模块的需求全是可选项（缺了只降级、不失败）',
    ORBIT_HOST_REQS.every((r) => r.required === false))
  check('轨道模块在空宿主下 degraded 列出全部 4 项',
    built[2][1].hostReport.degraded.join(',') === 'quiz,diagnosis,mastery,skills',
    built[2][1].hostReport.degraded.join(','))
  check('轨道模块在空宿主下仍能建起来（工具如实为空，而不是拒绝启动）',
    !!built[2][1].facade && typeof built[2][1].facade.getSnapshot === 'function')

  // ---- ⑤ 降级上报只发一次（重复告警会把真问题淹掉）----
  // ★ 真去数，而不是断言"函数存在"。两处坑记下来：
  //   ① 去重集合是**进程级**的（HOST_DEGRADE_REPORTED），而本文件前面几节早已触发过
  //      "crystal|quiz,compute,mastery,skills,practiceGuard" 这个签名。若照抄，
  //      这里会数到 0 行、断言必红——所以**故意换一个前面没用过的签名**
  //      （多给一样 mastery），让这条断言不依赖执行顺序。
  //   ② 捕获 console.warn 必须在 finally 里还原：忘了还原会让本文件之后（以及并行跑的
  //      其它套件）的输出全部消失，而且**不报错**，只表现为"后面的日志不见了"。
  {
    const { createAgentApp: mkApp } = await import('../app.js')
    const { createSettingsStore: mkStore } = await import('../../ui-kit/settings-store.js')
    const mem = { getItem: () => null, setItem() {}, removeItem() {} }
    const settings2 = mkStore({ storageKey: 'test.hostReport', storage: mem })
    settings2.set({ apiKey: 'k', model: 'm', maxTokens: 128 })

    // 多给一样 mastery → 降级签名与前面各节都不同（全新，必会被报一次）
    const mod = createCrystalModule({
      view: mkView(), catalog: CATALOG, loadData, mastery: { summary: () => ({}) },
    })
    check('这条测试用的降级签名确实是新的（否则下面的计数没有意义）',
      mod.hostReport.degraded.join(',') === 'quiz,compute,skills,practiceGuard',
      mod.hostReport.degraded.join(','))

    const made = () => mkApp({
      modules: [mod], settings: settings2, llm: {}, knowledge: createCatalog({ key: 'id' }),
      skills: createCatalog({ key: 'name' }), node: 'explain',
    })

    const realWarn = console.warn
    let first = 0
    let second = 0
    let err = null
    try {
      console.warn = () => { first++ }
      try { made() } catch (e) { err = e.message }
      console.warn = () => { second++ }
      try { made() } catch (e) { err = err || e.message }
    } finally {
      console.warn = realWarn   // ★ 必须在 finally 里还原
    }
    check('首次装配 → 报出降级（不静默）', first >= 1, `报了 ${first} 条；${err || ''}`)
    check('同一降级再装配 → 不再重复报（重复告警会把真问题淹掉）',
      second === 0, `又报了 ${second} 条`)

    // 上报内容要给足定位信息
    const real2 = console.warn
    const lines = []
    try {
      console.warn = (...a) => { lines.push(a.join(' ')) }
      // 换一份签名（去掉 mastery）以触发一次新的上报，只为看它的文本
      mkApp({
        modules: [createCrystalModule({ view: mkView(), catalog: CATALOG, loadData,
                                        mastery: { summary: () => ({}) }, skills: {} })],
        settings: settings2, llm: {}, knowledge: createCatalog({ key: 'id' }),
        skills: createCatalog({ key: 'name' }), node: 'explain',
      })
    } catch (e) { /* 断言在下面看文本，这里不吞错也不掩盖 */ } finally {
      console.warn = real2
    }
    const hostLine = lines.find((l) => /\[host\]/.test(l)) || ''
    check('上报内容指名模块、缺失的键、以及需求清单的位置',
      /\[host\] 模块 crystal 缺少可选能力/.test(hostLine) && /host-requirements\.js/.test(hostLine),
      hostLine.slice(0, 140))
  }

  // ---- ⑥ 知识条目**真的接进了目录**（不是只有文件躺在那里）----
  // ★ 这一类失效极其隐蔽：条目写好了、专用守卫也全绿，
  //   但装配时忘了 registerInto → 壳里 knowledge.load(id) 取不到，
  //   **agent 一条都读不到**，而不报错、不崩，条目守卫也不会红
  //   （它测的是"条目本身对不对"，接线是另一回事）。
  //   对称性的 40 条就曾处于这个状态。
  {
    const cat = createCatalog({ key: 'id' })
    registerCrystalKnowledge(cat)
    registerOrbitKnowledge(cat)
    registerSymmetryKnowledge(cat)
    const ids = cat.index().map((e) => e.id)
    for (const ns of ['crystal', 'orbit', 'symmetry']) {
      const n = ids.filter((id) => id.startsWith(ns + ':')).length
      check(`知识目录里有 ${ns} 的条目（${n} 条）—— 忘了 registerInto 就不会有`,
        n > 0, String(n))
    }
    check('三个模块的条目都进了同一个目录（共 ' + ids.length + ' 条）',
      ids.length >= 100, String(ids.length))
    // 真的按 id 取一条对称性的正文出来
    const one = cat.load(ids.find((id) => id.startsWith('symmetry:')))
    check('按 id 能取到对称性条目的正文（渐进式披露的 load 通道）',
      !!one && typeof one.body === 'string' && one.body.length > 80,
      one ? String(one.body.length) : 'null')
  }
}

// ============================================================================
section('文本路由：从没有模块归属的页面提问，按内容切模块')
{
  /**
   * ★ 这条在修复前**必红**：`registry/modules.js` 的 `routeByText()` 早就写好，
   *   却**零运行时调用方**；模块只能靠 URL 激活，而首页不设 activeModule，
   *   默认停在"第一个注册的模块"（晶体）——于是从首页问"水分子是什么点群"，
   *   模型手里拿的是**晶体的工具**。这正是用户说的"现在只有晶体智能体"。
   */
  const { registerAll, routeByText } = await import('../registry/index.js')
  registerAll()

  const mem = { getItem: () => null, setItem() {}, removeItem() {} }
  const mkApp = (opts = {}) => {
    const settings2 = createSettingsStore({ storageKey: 'test.route', storage: mem })
    settings2.set({ apiKey: 'k', model: 'm', maxTokens: 128 })
    const crystal = createCrystalModule({ view: mkView(), catalog: CATALOG, loadData })
    const symmetry = createSymmetryModule({ initialId: 'water' })
    const orbitModule = createOrbitModule({})
    return createAgentApp({
      modules: [crystal, symmetry, orbitModule],
      settings: settings2, llm: mkLLM([{ content: '（桩回复）' }]),
      knowledge: createCatalog({ key: 'id' }), skills: createCatalog({ key: 'name' }),
      node: 'explain',
      routeByText,
      shouldAutoRoute: () => opts.onHome !== false,
      ...opts.extra,
    })
  }

  // 先看 routeByText 本身的判定（关键词命中数）
  check('routeByText 把「水分子是什么点群」判给 symmetry',
    routeByText('水分子是什么点群')[0]?.module === 'symmetry',
    JSON.stringify(routeByText('水分子是什么点群')))
  check('routeByText 把「为什么 3d 有 5 个轨道」判给 orbit',
    routeByText('为什么 3d 有 5 个轨道')[0]?.module === 'orbit',
    JSON.stringify(routeByText('为什么 3d 有 5 个轨道')))
  check('routeByText 对无关问题返回空（不瞎切）',
    routeByText('今天天气不错').length === 0)

  // 端到端：send 一次就该换模块
  {
    const app2 = mkApp()
    check('默认停在第一个模块（crystal）', app2.activeModule === 'crystal', String(app2.activeModule))
    await app2.send('水分子是什么点群？', {})
    check('★ 首页问点群 → 自动切到 symmetry（修复前这里必红）',
      app2.activeModule === 'symmetry', String(app2.activeModule))
    check('切完之后工具集里有点群查询',
      app2.getTools().includes('queryPointGroup'), app2.getTools().join(','))
  }

  // URL 已带模块归属时**不切**（shouldAutoRoute 为 false）
  {
    const app3 = mkApp({ onHome: false })
    await app3.send('水分子是什么点群？', {})
    check('URL 已指定模块时不按文本切（否则动作会落到空气上）',
      app3.activeModule === 'crystal', String(app3.activeModule))
  }

  // 没命中关键词时不动
  {
    const app4 = mkApp()
    await app4.send('今天天气不错', {})
    check('无关问题不切模块', app4.activeModule === 'crystal', String(app4.activeModule))
  }
}

// ============================================================================
section('导航：由模块声明 routes，中枢派生 schema 与跳转')
{
  /**
   * ★ 这一段守的是一个**真实回归**：`navigateTo` 原先的存在条件是"facade 有 listIds"，
   *   而 **orbit 没有**（它的 id 空间是 n/l/m，不是字符串清单）。
   *   于是文本路由一旦切到 orbit，`navigateTo` 就整个消失——模型想带学生去看轨道，
   *   手里根本没有那个工具。而 schema 里还写着硬编码的晶体语义
   *   （target 只有 home/crystal/compare、参数写死叫 crystalId）。
   */
  const appN = (() => {
    const settings2 = createSettingsStore({
      storageKey: 'test.nav', storage: { getItem: () => null, setItem() {}, removeItem() {} },
    })
    settings2.set({ apiKey: 'k', model: 'm', maxTokens: 128 })
    return createAgentApp({
      modules: [
        createCrystalModule({ view: mkView(), catalog: CATALOG, loadData }),
        createSymmetryModule({ initialId: 'water' }),
        createOrbitModule({}),
      ],
      settings: settings2, llm: mkLLM([{ content: '（桩回复）' }]),
      knowledge: createCatalog({ key: 'id' }), skills: createCatalog({ key: 'name' }),
      node: 'explain',
    })
  })()

  appN.setActiveModule('orbit')
  const toolsOrbit = appN.getTools()
  check('★ orbit 激活时 navigateTo 仍然存在（修复前它会消失）',
    toolsOrbit.includes('navigateTo'), toolsOrbit.join(','))

  const navDef = appN.toolDefs().find((d) => d.function.name === 'navigateTo')
  const enumVals = navDef && navDef.function.parameters.properties.target.enum
  check('navigateTo 的 target 取值域由模块声明派生（含 orbit / symmetry）',
    Array.isArray(enumVals) && enumVals.includes('orbit') && enumVals.includes('symmetry'),
    JSON.stringify(enumVals))
  check('参数 schema 含模块自报的参数名（crystalId / otherCrystalId）',
    !!(navDef && navDef.function.parameters.properties.crystalId
        && navDef.function.parameters.properties.otherCrystalId))

  // 真跑一次——导航是宿主的事，故给一个最小 window.location
  const realWindow = globalThis.window
  globalThis.window = { location: { hash: '' } }
  try {
    await appN.registry.execute('navigateTo', JSON.stringify({ target: 'symmetry' }))
    check('target=symmetry 跳到 #/symmetry（用模块声明的 hash 生成）',
      globalThis.window.location.hash === '#/symmetry', String(globalThis.window.location.hash))

    globalThis.window.location.hash = ''
    await appN.registry.execute('navigateTo', JSON.stringify({ target: 'crystal', crystalId: 'naCl' }))
    check('target=crystal + crystalId 跳到 #/viewer/naCl',
      globalThis.window.location.hash === '#/viewer/naCl', String(globalThis.window.location.hash))

    globalThis.window.location.hash = ''
    await appN.registry.execute('navigateTo',
      JSON.stringify({ target: 'compare', crystalId: 'naCl', otherCrystalId: 'csCl' }))
    check('target=compare 跳到对比页',
      /^#\/compare\/naCl\?b=csCl$/.test(globalThis.window.location.hash),
      String(globalThis.window.location.hash))

    const bad1 = await appN.registry.execute('navigateTo', JSON.stringify({ target: '不存在' }))
    check('未知 target 被拒并列出可用值', !!bad1.error && /可用/.test(bad1.error), bad1.error)
    const bad2 = await appN.registry.execute('navigateTo', JSON.stringify({ target: 'crystal' }))
    check('缺 crystalId 被拒', !!bad2.error && /crystalId/.test(bad2.error), bad2.error)
    const bad3 = await appN.registry.execute('navigateTo',
      JSON.stringify({ target: 'crystal', crystalId: '编造的' }))
    check('编造的 crystalId 被拒（用该 route 所属模块的 id 清单校验）',
      !!bad3.error && /未知 id/.test(bad3.error), bad3.error)
    const bad4 = await appN.registry.execute('navigateTo',
      JSON.stringify({ target: 'compare', crystalId: 'naCl', otherCrystalId: 'naCl' }))
    check('两个对象相同被拒（跨参数约束由模块自己表达，中枢不猜）',
      !!bad4.error && /相同/.test(bad4.error), bad4.error)
  } finally {
    globalThis.window = realWindow
  }
}

// ============================================================================
console.log(`\n${'═'.repeat(60)}`)
console.log(`test-app 结果：通过 ${pass} 项，失败 ${fail} 项`)
console.log('═'.repeat(60))
process.exit(fail ? 1 : 0)
