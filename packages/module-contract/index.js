/**
 * module-contract — 模块契约：一个教学模块要接入统一智能体，必须提供什么
 *
 * ★ **为什么契约是一个独立的包，而不是 agent-core 的一部分**
 *   （2026-09-30 重构时从 packages/agent-core/contract/ 提升出来）
 *
 *   契约是「模块」与「中枢」**双方共同依赖的第三方**。放在 agent-core 里时，
 *   "模块依赖中枢"在物理上不可回避——模块为了实现契约，必须 import 中枢的目录。
 *   而目标是「模块能独立成应用」：把 modules/crystal/ 拷到任意空目录，它只应依赖
 *   (1) 契约与其他共享包的公开入口 (2) 自己目录内的相对路径 (3) three。
 *
 *   独立成包后，依赖图变成：
 *        模块 ──→ 契约 ←── 中枢            （双方都只认识契约，互不认识）
 *   这正是"低耦合、通过合适接口调用"的结构保证。
 *
 * ★ 为什么需要一份**可执行的**契约（而不只是一段文档）：三个模块的内部结构差异极大——
 *   · crystal 的 `viewer-canvas.js` 是 894 行的类、状态在实例字段里，
 *     `main.js` 只管路由；它没有任何"动作"层，视图变化靠直接改 Three.js 对象
 *   · orbit 的 `main.js` 有 `OrbitApp` facade（getState/applyAction/onAction/
 *     exportViewPNG），是全项目唯一已成型的模块契约，本契约以它为蓝本
 *   · symmetry 的 `main.js` 是 744 行不导出任何东西的单体，连状态都取不到
 *   若只写一段文档说"请实现这些方法"，三者仍会各写各的。故把契约做成
 *   **可校验的函数**：模块自己能在开发期 assertModuleContract(自己的 facade)，
 *   立刻看到缺什么；中枢在装配期强制校验，缺必需方法就拒绝启动。
 *
 * ★ 契约的分工（别混淆）：
 *   · 契约管**能力**：这个模块能读什么状态、能被人怎样驱动、能导出什么
 *   · constraints.js 管**权限**：哪个决策节点能调用哪些工具
 *   模块只声明能力，权限由节点裁决——模块无法自行越权（CLAUDE.md §一.1）。
 *
 * ★ 方向的补充（2026-09-30 新增）：本契约是「模块 → 中枢」（模块**提供**什么）。
 *   模块要装进两个宿主，还需要一份反向的「宿主 → 模块」（模块**需要**什么），
 *   见 `HOST_REQUIREMENTS_SHAPE` 与 `assertHostProvides`。
 *
 * 参考蓝本：projects/orbit/H5/js/main.js 的 OrbitApp facade（第 479–537 行）。
 */

/**
 * 必需：缺任何一个，模块就无法被智能体驱动。
 *
 * ★ 中枢在**装配期**强制校验这一组（createAgentApp 内，缺一即抛）——
 *   这不是"开发期建议"，是启动的前提条件。
 */
export const REQUIRED_METHODS = [
  {
    name: 'getSnapshot',
    kind: 'function',
    sig: '() => Object',
    why: '感知的入口。智能体每轮对话前都要知道"用户此刻在看什么"。'
      + '返回值会被 core/perception.js 深拷贝后差分，故可返回活引用或嵌套对象。'
      + '★ 返回值必须**足以还原**当前状态（见 restoreState）——'
      + '演示的「上一步」靠它。只返回人类可读的摘要会在还原时静默失效。',
  },
  {
    name: 'applyActions',
    kind: 'function',
    sig: '(actions: Array<{action, params, speech?}>) => { ok, error?, accepted? } | Promise<同>',
    why: '唯一的"动手"途径。动作**必须**经此方法进入模块，才能被分镜队列编排、'
      + '被快照回退、被 speech 旁白串起来。模块内部直接改视图而不走这里，'
      + '学生就会看到"画面莫名跳了一下"，而且用户收不掉它——'
      + '见 DESIGN_PRINCIPLES 的 agent-action-must-be-reversible。',
  },
  {
    name: 'canApplyActions',
    kind: 'function',
    sig: '() => boolean',
    why: '入队动作前的**前置条件**：此刻能否受理动作。'
      + '★ 没有它，中枢只能靠猜快照里的字段——晶体线正是这么栽的：'
      + '它的 app.js 用 `!!(snap && snap.crystal && snap.crystal.id)` 判断'
      + '"有没有可驱动视图"，而那是**晶体的字段名**。接第二个模块时它恒为假'
      + '（orbit 的快照里没有 crystal），于是 orbit 的动作永远被拒，'
      + '报的还是"没有可驱动的三维视图"这种**指向错误的原因**。'
      + '★ 语义是「此刻能否受理动作」，不是「有没有三维视图」：'
      + '纯计算模块恒返回 true，画面类模块在拿不到视图适配器时返回 false。'
      + '名字必须描述契约层的事实，不是实现层的事实。'
      + '★ 为什么不复用 getSnapshot 里的一个标志位：core/perception.js 的'
      + 'diffStates() 遍历 Object.keys(cur)，任何字段变化都会被写进'
      + 'recentActions 并**重置 lastChangeAt**。而"有没有视图"是**路由态**，'
      + '每次进出查看器都翻转一次——那会挤占 recentActions（上限 12，模型只看这个），'
      + '并把 idleMs 假重置，直接弄哑「空闲超过 45 秒才提示」这类主动介入规则。',
  },
]

/** 可选：有则更好，没有则对应能力不可用（应如实报告，不要假装支持） */
export const OPTIONAL_METHODS = [
  {
    name: 'getInteractionTrace',
    kind: 'function',
    sig: '() => { idleMs, toggleCounts, dwellMs, recentActions }',
    why: '若不提供，感知层仍能从 getSnapshot 的差分得到痕迹（那是默认路径）；'
      + '提供它可给出更精确的停留时长与切换计数。',
  },
  {
    name: 'highlightAtoms',
    kind: 'function',
    sig: '(ids: string[]) => { ok }',
    why: '错因诊断要用（"高亮这几个原子让学生自己看出矛盾"）。'
      + 'grade 节点的诊断动作依赖它。',
  },
  {
    name: 'navigateTo',
    kind: 'function',
    sig: '(target: {route: string, params?: Object}) => { ok }',
    why: '跨视图跳转（如出题后"去看结构"）。compare 节点与 presetView 依赖它。'
      + '★ 目标的取值范围由 descriptor 的 `routes` 声明（中枢据此生成工具 schema）；'
      + 'id 类参数由 `listIds()` 在运行期校验——见 CLAUDE.md §一.2「数值一律程序算」。',
  },
  {
    name: 'exportViewPNG',
    kind: 'function',
    sig: '() => dataURL',
    why: '录制演示素材与埋点截图用。',
  },
  {
    name: 'onAction',
    kind: 'function',
    sig: '(cb) => off()',
    why: '订阅视图变化。★ 实现必须支持**多个订阅者**（返回取消函数），'
      + '单槽位会被后注册者静默顶掉——orbit 的 SceneBridge 就踩过这个坑。'
      + '（assertModuleContract 会检查它的 arity：只声明一个参数的实现高度可疑。）',
  },
  {
    name: 'restoreState',
    kind: 'function',
    sig: '(state: Object) => { ok: boolean, error?: string }',
    why: '把视图整体回设到某份快照所描述的状态（分镜的「上一步」「回到演示前」用它）。'
      + 'state 就是 getSnapshot() 曾经返回过的那个对象（或其子集）。'
      + '★ 为什么不让中枢按动作清单逐个下发：晶体线实测，逐 setLayer 会产生 13+ 次'
      + 'applyIntent，每次触发控件同步与场景重建 → 「回到演示前」变成一次可见的抖动；'
      + '模块整体回设可以一次到位。且还原**不是用户行为**，不该记进交互痕迹。'
      + '★ 它的实现约束（务必遵守）：必须走与用户操作**相同的通路**，'
      + '不得直接写视图实例字段——否则会出现"智能体恢复得了、用户的控件收不掉"，'
      + '见 DESIGN_PRINCIPLES 的 state-restore-must-share-user-path。'
      + '★ 未提供时中枢**禁用**回退能力（「上一步」按钮置灰），而不是降级成猜：'
      + '降级路径永远不会被发现是错的（它"看起来在工作"），'
      + '而禁用路径第一天就会有人报"上一步点不了"。',
  },
  {
    name: 'setViewState',
    kind: 'function',
    sig: '(state: Object) => boolean',
    why: '回设视角（相机朝向/缩放）。此前它是**隐形依赖**：晶体线的 app.js 一直在调'
      + '`facade.setViewState`，而契约里没有这个名字——于是"是否支持"只能靠运行时试。'
      + '显式化之后，中枢可以据此决定快照里要不要带视角。',
  },
  {
    name: 'listIds',
    kind: 'function',
    sig: '(kind?: string) => string[]',
    why: 'id 的**取值域**，供中枢校验模型给的 id 是否真实存在'
      + '（CLAUDE.md §一.2：数值一律程序算，模型不得口算/编造）。'
      + 'kind 缺省返回全部。晶体模块现有 `crystalIds()` 已实现这个语义，'
      + '但契约里没有它——它被 navigateTo 与 tools.js 悄悄依赖着，属于隐形契约，'
      + '此次一并显式化。不提供则跳过校验（而不是猜一个集合）。',
  },
  {
    name: 'sceneVocabulary',
    kind: 'value',
    sig: 'Object 或 () => Promise<Object>',
    why: '动作词汇表。**不进常驻上下文**，由 listSceneActions 一类工具按需拉取'
      + '（这是 token 效率的关键，见重构计划 B6b 的两层工具设计）。',
  },
  {
    name: 'settings',
    kind: 'value',
    sig: 'Array<字段声明>',
    why: '模块自己的小参数（动画速度、标签字号、原子缩放、元素颜色…）。'
      + '用 ui-kit 的 settings-popup 声明式 schema 表达，同一份 schema 既渲染'
      + '设置面板，也可导出为 listModuleSettings 的返回内容。',
  },
  {
    name: 'prompts',
    kind: 'value',
    sig: '{ role?: string, nodeOverrides?: Object }',
    why: '模块的系统提示片段（人格、动作速查、示范脚本）。'
      + '节点约束由 constraints.js 保证，提示里只补"此刻该怎么做"。'
      + '★ 双语：`{ zh: {...}, en: {...} }`，由中枢按当前语言取用。',
  },
  {
    name: 'perception',
    kind: 'value',
    sig: '{ fieldLabels?, dwellFields?, describeState?, formatCompact? }',
    why: '感知层的**模块配置**。core/perception.js 的接口是 '
      + 'createPerception({getState, fieldLabels, dwellFields, describeState, formatCompact})，'
      + '其中 getState 由中枢提供（它知道"当前是哪个模块"），后四项**只有模块知道**'
      + '（字段名来自模块自己的快照形状、dwellFields 是有教学意义的少数几个、'
      + 'formatCompact 要读模块自己的字段）。'
      + '★ 键必须是**快照里真实存在的字段名**——晶体线第一版写了 `crystalId`，'
      + '而快照字段叫 `crystal`（对象），于是"用户换了晶体"不被识别，'
      + '痕迹里只会出现一堆原始字段名；**字段名对不上不报错**，'
      + '只是痕迹变得不可读，这类错极难发现。',
  },
  {
    name: 'demos',
    kind: 'value',
    sig: '{ list: () => Array, byId: (id) => Object|null, manifest: () => Array }',
    why: '模块自己的**预置演示脚本**（零 token 的分镜脚本：每步是 {action, params, speech}）。'
      + '★ 为什么脚本在模块、而播放能力在中枢：脚本内容（"NaCl 六步演示"、"以 Cu 型看空隙"）'
      + '是学科专属的，播放（分镜队列、逐步闸门、回放、整改）与学科无关。'
      + '晶体线的 app.js 把 DEMO_SCRIPTS 直接 import 进中枢，它自己的注释也承认'
      + '"接入第二个模块时应下移到模块层"——否则中枢每接一个模块就要多带一份脚本。'
      + '★ 提供它，中枢的 listDemos / playDemo / replayDemo / reviseDemo 才存在；'
      + '不提供则这四个工具**不出现**（而不是出现后报错）。',
  },
]

/** 全部方法名（供快速查找） */
export const ALL_METHODS = [...REQUIRED_METHODS, ...OPTIONAL_METHODS].map((m) => m.name)

/** 名字 → 声明（含 kind），避免各处手写名字清单导致漂移 */
export const METHOD_BY_NAME = new Map(
  [...REQUIRED_METHODS, ...OPTIONAL_METHODS].map((m) => [m.name, m]),
)

/**
 * 宿主必须提供什么 —— 模块向宿主声明的**反向依赖**。
 *
 * ★ 为什么需要这份反向声明：契约只说"模块提供什么"，那是「模块 → 中枢」的方向。
 *   但模块要能装进**两个宿主**（统一壳 apps/web、独立应用 apps/crystal），
 *   它必须能声明"我需要宿主给我什么"——否则装配细节会被迫写进模块的装配代码里。
 *   晶体线的 assemble.js 正是这么退化的：模块的装配代码里写着宿主的
 *   localStorage 键名（`clearKeys: ['crystal.agent.mastery', …]`）、
 *   宿主图标路径（`import.meta.env.BASE_URL`）、宿主的调试全局名（`window.__crystalAgent`）。
 *
 * ★ 与 `settings` / `sceneVocabulary` 的区别：那些是模块**提供**的值，
 *   这份是模块**索取**的接口。方向相反，放在模块的 `host-requirements.js` 里。
 */
export const HOST_REQUIREMENTS_SHAPE = {
  view: '视图句柄。★ 核心要求不是有 getProps/setProps，而是 '
    + '「setProps 必须走宿主自己的意图通路」——这保证"用户操作与智能体操作'
    + '走同一条通路"这条既有约定在新宿主里仍然成立（晶体线由 page.applyIntent 保证）。',
  storage: '存储命名空间。★ 必须是宿主注入的参数，且**缺省值不得指向任何具体命名空间**'
    + '（应直接 throw）。理由：晶体线两份装配各自写了白名单式的「清除本机数据」，'
    + '两个模块在同一壳里跑时必然"清了一半"，且互不知道对方存在；'
    + '而 ui/panel.js 的缺省值 `chem-agent.panel.fabPos` 恰好等于壳实际用的键，'
    + '会与壳共享悬浮球位置。',
  navigate: '导航能力。模块不 import 路由；它只声明"我需要能跳到这些目标"。',
  loadData: '数据加载。宿主决定数据从哪来（动态 import / fetch / 内存）。',
  theme: '主题与配色。★ 契约：模块给**默认值**，宿主给**用户覆盖**，'
    + '宿主绝不把模块默认值写回用户存储——晶体线的 apps/web 曾每次打开都强制覆盖'
    + '用户调过的配色，而晶体线的 assemble.js 明确拒绝了这个做法。',
  panel: '面板能力（卡片 / 提示条 / 未读标记等）。',
}

/**
 * 校验宿主是否满足模块声明的需求。
 *
 * 与 assertModuleContract 对称：那个查模块**提供**的，这个查宿主**提供**的。
 * 两者都在**装配期**调用，让"漏了一个能力"从"某个功能永远静默不生效"
 * 变成"启动时指名道姓地报错"。
 *
 * ★ 调用点各自不同，别找错地方：
 *   · assertModuleContract   → 中枢 `packages/agent-core/app.js` 的 createAgentApp
 *   · assertHostProvides      → 各模块自己的 `createModule`（经 enforceHostRequirements），
 *     因为"宿主"的接口面正是在那里交出去的，且模块要装进两个宿主（壳 + 独立页）
 *
 * 本函数是**纯函数**（只报告，不抛错），便于测试与复用；
 * 要"缺了就拒绝启动"的语义请用下面的 enforceHostRequirements。
 *
 * @param {Object} host       宿主提供的接口集合（如 { view, storage, navigate, ... }）
 * @param {Array}  requirements  模块声明的需求，形如
 *        [{ key:'view', required:true, note:'…' }, ...]
 * @returns {{ok:boolean, missing:string[], present:string[], degraded:string[]}}
 *   ★ 三者是一个**划分**：清单里每个键恰好落进其中一个（不多不少）。
 *   · present  —— 宿主**确实提供了**（值非 null/undefined）
 *   · missing  —— 必需项缺失（ok 为 false 的充要条件）
 *   · degraded —— **非必需项**缺失。不是错误（降级是设计好的），但宿主应当**知道**
 *     自己拿到的是一个"少了某些能力的"模块。
 *
 * ★ present 曾经把"缺席但不算失败"的可选项也塞了进来（`else if (…) present.push(key)`），
 *   于是它会**谎报**宿主提供了其实没给的东西——三桶也就成了重叠的两桶。
 *   一直没人发现，因为从没有人检查过这三者的关系。
 *   现在由 test-core 的"划分完备且不重叠"断言守着（写错就会红，已验证）。
 *
 * ★ 为什么要有 degraded 这一栏：只报 missing 的话，"非必需"就等于"永远不查"——
 *   而这恰恰是本仓库反复踩的那类坑（某个工具静默不存在，谁都不知道）。
 *   补上它之后，独立页与统一壳的能力差异变成一行可读的清单。
 */
export function assertHostProvides(host, requirements) {
  const list = Array.isArray(requirements) ? requirements : []
  const missing = []
  const present = []
  const degraded = []
  for (const req of list) {
    const key = typeof req === 'string' ? req : req && req.key
    if (!key) continue
    const value = host ? host[key] : undefined
    if (value != null) { present.push(key); continue }
    // 缺席：必需项算失败；可选项算降级（**不再同时计入 present**）
    if (typeof req === 'object' && req.required === false) degraded.push(key)
    else missing.push(key)
  }
  return { ok: missing.length === 0, missing, present, degraded }
}

/**
 * 模块在自己的 `createModule()` 开头调用它 —— 把「宿主没给必需能力」
 * 从"某个功能永远静默不生效"变成**启动时指名道姓地报错**。
 *
 * ★ 为什么调用点是 `createModule`，而不是中枢的 `createAgentApp`：
 *   模块要装进**两个**宿主（统一壳 `apps/web` 与模块自己的独立页）。校验写在
 *   中枢里只能覆盖前者；写在 `createModule` 里，两个宿主、以及将来任何新宿主
 *   都**必经**这里——这是"结构性约束"而非"记得去查"。
 *
 * ★ 与 HOST_REQUIREMENTS_SHAPE 的分工：那份是**给宿主看的说明**（每个键是什么意思、
 *   契约上有什么讲究）；各模块的 `host-requirements.js` 是**该模块的实际需求清单**
 *   （要哪几个键、必需还是可选）。两者不是一处：说明是文档，清单是被执行的代码。
 *
 * @param {string} moduleId      模块 id（用于报错时指名道姓）
 * @param {Object} host          createModule 收到的 opts（宿主给的接口面）
 * @param {Array}  requirements  host-requirements.js 导出的清单
 * @param {Function} [onDegrade] 可选：收到降级清单时回调（宿主可据此打日志/上报）
 * @returns {{ok:boolean, missing:string[], present:string[], degraded:string[]}}
 * @throws 必需项缺失时抛错（消息里列全缺了什么、以及去哪补）
 */
export function enforceHostRequirements(moduleId, host, requirements, onDegrade) {
  const r = assertHostProvides(host, requirements)
  if (!r.ok) {
    // 报错里带上每一条的 note：否则宿主只知道"缺 view"，不知道 view 该长什么样
    const detail = r.missing.map((k) => {
      const req = (requirements || []).find((x) => x && x.key === k)
      return `  · ${k}${req && req.note ? '：' + req.note : ''}`
    }).join('\n')
    throw new Error(
      `模块 ${moduleId} 的宿主缺少必需能力：${r.missing.join('、')}\n`
      + detail + '\n'
      + `  需求清单见 modules/${moduleId}/host-requirements.js\n`
      + '  契约见 packages/module-contract/index.js 的 HOST_REQUIREMENTS_SHAPE',
    )
  }
  if (typeof onDegrade === 'function' && r.degraded.length) onDegrade(r.degraded)
  return r
}

/**
 * 接入过程中反复踩到、且**跨模块普适**的设计原则。
 *
 * 每条都是从一次真实故障里提炼的，迁移时不要只看代码、不看这些理由——
 * 否则重写一遍还会再犯。
 */
export const DESIGN_PRINCIPLES = [
  {
    id: 'agent-action-must-be-reversible',
    title: '智能体下发的可见状态，必须能被用户撤回',
    detail: '动作改变了用户看得见的东西时，**必须同时更新该状态的界面表征**。'
      + '否则会出现"智能体画得出来，用户却收不掉"——界面上明明看得见那条标注，'
      + '但没有任何控件反映它、也没有入口关掉它。',
    origin: 'orbit 的 highlightRadialFeature 原先直接调 Charts.setRadialHighlight()，'
      + '绕过了界面状态；智能体标出峰值线后就再没人能取消。'
      + '改为走 applyAction({action:"setRadialMarks"})，由模块动作层同时更新图表与面板控件。',
  },
  {
    id: 'geometric-annotation-follows-series',
    title: '几何标注要跟随它所标注的系列显隐',
    detail: '图上的标注线（节点、极值）与它所标注的曲线，若显隐各自独立，'
      + '就会出现"关了曲线却还留着它的标注"。标注的可见性应由所属系列的可见性派生。',
    origin: 'orbit 的径向图：曲线能开关，标线却只由动作驱动、界面上没有入口。'
      + '修正为 computeMarks() 只标**当前可见曲线**的半径，并对 R 与 D 的重复零点去重'
      + '（D = r²R²，两者零点完全相同，画两遍只会叠成一条）。',
  },
  {
    id: 'multi-mesh-appearance-update',
    title: '几何若由多块网格构成，任何全局外观变更都必须遍历全部网格',
    detail: '同一个可见物体可能由多块网格拼成（例如全局粗网格 + 局部精细化补片）。'
      + '改着色 / 材质 / 可见性时只遍历主网格，表现是"只改了一半"——'
      + '一部分变色、另一部分保持旧色，看起来像渲染坏了。',
    origin: 'orbit 的 4pz + 等值面阈值=1：切三维着色后外层壳变色、内层壳不变。'
      + '根因是局部精细化的补片是另一块网格（fineObj），着色时漏了重涂它。',
  },
  {
    id: 'one-control-many-scenes',
    title: '同一个视觉开关若作用于多处场景，必须一并作用',
    detail: '页面上有多个三维小场景时，"绕着自己转"这类开关应由**一个**控件统一控制，'
      + '而不是各自写死。写死的那一个用户永远关不掉。',
    origin: 'orbit 的角度分布小场景在 init 时写死 setAutoRotate(true)，'
      + '用户没有任何入口关掉它。改为一个开关同时作用于主视图与小场景。',
  },
  {
    id: 'state-restore-must-share-user-path',
    title: '整体回设必须与用户操作走同一条通路',
    detail: '模块的 restoreState 内部只能经"用户操作也会经"的那个入口'
      + '（applyIntent / setProps 所在的同一层）写状态，不得直接改视图实例字段。'
      + '否则回退之后控件显示与实际画面分叉：智能体恢复得了、用户的控件收不掉。',
    origin: '晶体线 viewer-page-adapter 的核心设计（"用户的操作与智能体的操作'
      + '走同一条通路"），以及 restore 漏掉视角与外观两次真实故障——'
      + '每次都表现为"回退后留下一个半新半旧的视图，比完全不回退更难察觉"。',
  },
]

/** 取某条设计原则（供文档与开发期提示引用） */
export function designPrinciple(id) {
  return DESIGN_PRINCIPLES.find((p) => p.id === id) || null
}

/**
 * 校验一个模块 facade 是否符合契约。
 *
 * @param {Object} facade
 * @param {Object} [opts]
 * @param {string} [opts.label]  模块名（用于错误信息）
 * @returns {{ok: boolean, label: string, missing: string[], missingRequired: string[],
 *            present: string[], warnings: string[]}}
 */
export function assertModuleContract(facade, opts = {}) {
  const label = opts.label || (facade && (facade.id || facade.title)) || '(未命名模块)'
  const missing = []
  const present = []
  const warnings = []

  if (!facade || typeof facade !== 'object') {
    return {
      ok: false,
      label,
      missing: ALL_METHODS.slice(),
      missingRequired: REQUIRED_METHODS.map((m) => m.name),
      present: [],
      warnings: ['facade 不是对象'],
    }
  }

  // ★ 判定依据来自方法声明里的 `kind`，而**不是**手写的名字清单。
  //   旧版这里写的是 `m === 'sceneVocabulary' || m === 'settings' || m === 'prompts'`——
  //   加一个新字段就要记得改这一行，忘了就静默误判。本仓库已为同类问题栽过多次
  //   （"同一件事写在多处、漂移不报错"），故改为数据驱动。
  for (const m of ALL_METHODS) {
    const decl = METHOD_BY_NAME.get(m)
    const kind = decl ? decl.kind : 'function'
    const provided = kind === 'value' ? facade[m] != null : typeof facade[m] === 'function'
    if (provided) present.push(m)
    else missing.push(m)
  }

  const missingRequired = REQUIRED_METHODS.map((m) => m.name).filter((n) => missing.includes(n))

  // 常见实现错误的提醒（不是硬性失败，但值得当场指出）
  //
  // ★ 这里**刻意移除了**一条旧的启发式：`facade.onAction.length === 1` →
  //   警告"可能是单槽位实现"。它给出的判定依据（函数声明了几个参数）
  //   与它想防的问题（内部用单槽位保存回调）**没有因果关系**——
  //   `onAction(cb) { subscribers.add(cb); return () => … }` 是自然写法，
  //   多订阅同样只需要一个参数。实测本仓库唯一的正经实现（crystal facade）
  //   就被它误报。
  //   一条必然误报的警告比没有警告更糟：它会让真正要紧的警告（如"缺 restoreState"）
  //   淹没在噪声里，读者很快学会无视全部 [contract] 输出。
  //   本仓库对此有明确教训——"自检与实现用同一批错名字互相印证，一直绿着却什么也没守住"。
  //
  //   真正的检查放在**装配期用运行时验证**：见 app.js 的 onAction 冒烟
  //   （订阅一次、检查是否返回取消函数、随即取消）。那才是可判的事实。
  if (facade.applyActions && !facade.getSnapshot) {
    warnings.push('有 applyActions 但没有 getSnapshot：分镜队列无法在每步前抓快照，'
      + '「上一步」将无法精确还原。')
  }
  if (facade.sceneVocabulary == null && facade.applyActions) {
    warnings.push('缺 sceneVocabulary：模型只能靠猜动作名。')
  }
  if (facade.restoreState == null && facade.applyActions) {
    warnings.push('缺 restoreState：「上一步」「回到演示前」将被**禁用**（按钮置灰）。'
      + '这是刻意的不降级——中枢不会去猜怎么还原你的视图。')
  }
  // 感知配置的键必须是快照里真实存在的字段名（对不上不报错，只是痕迹不可读）
  if (facade.perception && typeof facade.getSnapshot === 'function' && opts.snapshotFields) {
    const known = new Set(opts.snapshotFields)
    for (const k of Object.keys(facade.perception.fieldLabels || {})) {
      if (!known.has(k)) {
        warnings.push(`perception.fieldLabels 里的 "${k}" 不在快照字段中`
          + `（快照字段：${[...known].join(', ')}）——"字段名对不上不报错"，`
          + '只会让交互痕迹变得不可读。')
      }
    }
  }

  return {
    ok: missingRequired.length === 0,
    label,
    missing,
    missingRequired,
    present,
    warnings,
  }
}

/** 契约的文本说明（供文档与开发期打印） */
export function describeContract() {
  const lines = ['模块契约', '═'.repeat(60), '', '必需：']
  for (const m of REQUIRED_METHODS) lines.push(`  ${m.name}${m.sig}`, `      ${m.why}`, '')
  lines.push('可选：')
  for (const m of OPTIONAL_METHODS) lines.push(`  ${m.name}${m.sig}`, `      ${m.why}`, '')
  lines.push('宿主需求（模块 → 宿主的反向声明）：')
  for (const [k, why] of Object.entries(HOST_REQUIREMENTS_SHAPE)) lines.push(`  ${k}`, `      ${why}`, '')
  lines.push('设计原则（从真实故障里提炼，跨模块普适）：')
  for (const p of DESIGN_PRINCIPLES) {
    lines.push(`  [${p.id}] ${p.title}`, `      ${p.detail}`, `      由来：${p.origin}`, '')
  }
  return lines.join('\n')
}

export default {
  assertModuleContract, assertHostProvides, enforceHostRequirements,
  describeContract, designPrinciple,
  REQUIRED_METHODS, OPTIONAL_METHODS, ALL_METHODS, METHOD_BY_NAME,
  DESIGN_PRINCIPLES, HOST_REQUIREMENTS_SHAPE,
}
