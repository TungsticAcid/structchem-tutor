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
import { registerInto as registerCommonSkills } from '../../skills/common/index.js'
import { createModule as createCrystalModule } from '../../../modules/crystal/index.js'

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
  registerCommonSkills(skills)

  const settings = createSettingsStore({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
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
console.log(`\n${'═'.repeat(60)}`)
console.log(`test-app 结果：通过 ${pass} 项，失败 ${fail} 项`)
console.log('═'.repeat(60))
process.exit(fail ? 1 : 0)
