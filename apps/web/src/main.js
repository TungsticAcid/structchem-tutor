/**
 * main.js — 统一壳的入口：路由 + 模块页面 + 智能体面板
 *
 * ★ 与上一版（B6 阶段那个单页壳）的区别：
 *   上一版把界面**手搓**在 index.html + 本文件里（顶栏 + 侧栏 + 一堆手写的
 *   segButton），于是晶体模块看起来与它自己的独立应用**完全不同**——
 *   而那个独立应用（crystal 项目）的界面是为教学仔细设计过的：
 *   库页有分类筛选与缩略图卡片，查看器有常驻的晶体信息面板（化学式/空间群/
 *   配位/晶胞参数）。手搓一遍只会得到一份更差的仿制品。
 *
 *   本版改为：**壳只负责路由与装配，页面来自各模块**。
 *   晶体模块的页面直接复用 `projects/crystal/H5/src/pages/`（复制到 src/pages/，
 *   仅改 import 路径），组件与工具库通过 `@crystal` 别名共享——所以视觉与交互
 *   与那个独立应用一致，不需要维护第二套。
 *
 * ★ 一条贯穿的约定（沿用）：**用户的操作与智能体的操作走同一条通路**。
 *   页面的 `applyIntent()` 是那条通路；智能体经适配器调 `setProps` 时也走它，
 *   于是感知层能"看见"用户自己点了什么（主动介入的前提）。
 *
 * ★ 装配的职责边界（本版明确下来）：
 *   壳负责**提供零件**（出题引擎、学情模型、对话存储、公式渲染器），
 *   模块负责**用零件实现能力**（teach 类工具、练习守卫）。
 *   所以"注入清单"在本文件里一目了然，而模块那边看不到任何宿主细节。
 */
import '@ui-kit/tokens.css'
import '@ui-kit/components.css'
import '@ui-kit/settings-popup.css'
import '@core/ui/panel.css'
import '@crystal/styles/global.css'
// ★ 必须排在 global.css **之后**：它的职责就是把 crystal 的令牌（--color-*）
//   映射到 ui-kit 的令牌（--bg/--text…），从而让主题切换对两边都生效。
//   顺序反了会被 global.css 的 :root 覆盖掉。
import './shell/theme-bridge.css'

import { createAgentApp } from '@core/app.js'
import { createCatalog } from '@core/core/catalog.js'
import * as LLMClient from '@core/core/llm-client.js'
import { createPanel } from '@core/ui/panel.js'
import { createSettingsStore } from '@ui-kit/settings-store.js'
import { createSettingsPopup, DEFAULT_SCHEMA, DEFAULT_GROUPS } from '@ui-kit/settings-popup.js'
import { initTheme, setTheme, getTheme, resolvedTheme, onThemeChange } from '@ui-kit/theme.js'
import { registerInto as regOrbitKnowledge } from '@knowledge/orbit/index.js'
import { registerInto as regCrystalKnowledge } from '@knowledge/crystal/index.js'
import { registerInto as regSymmetryKnowledge } from '@knowledge/symmetry/index.js'
import { registerInto as regCommonSkills } from '@skills/common/index.js'
import { createModule as createCrystalModule } from '@modules/crystal/index.js'
import { createModule as createSymmetryModule } from '@modules/symmetry/index.js'
import { createModule as createOrbitModule } from '@modules/orbit/index.js'
import { QuestionEngine as OrbitQuiz } from '@modules/orbit/core/question-engine.js'
import { MasteryModel as OrbitMastery } from '@modules/orbit/store/mastery.js'
import { ErrorDiagnosis as OrbitDiagnosis } from '@modules/orbit/core/error-diagnosis.js'
import * as crystalTools from '@modules/crystal/tools.js'
import { createQuizEngine } from '@modules/crystal/quiz/index.js'
import { createQuizUI } from '@modules/crystal/quiz/ui.js'
import { createMasteryModel } from '@modules/crystal/store/mastery.js'
import { KNOWLEDGE_POINTS } from '@modules/crystal/quiz/data/kp-crystal-matrix.js'
import { createConversationStore } from '@core/store/conversation-store.js'
import { createDemoFavorites } from '@core/store/demo-favorites.js'
import { createProactive } from '@core/proactive.js'
import { preloadKatexIdle } from '@core/ui/katex-loader.js'
import { parseFormula } from '@knowledge/shared/formula.js'
import { setVisualColor, getVisualColor } from '@crystal/data/settings.js'
import { getCrystalData } from '@crystal/lib/crystal-loader.js'
// 模块清单的来源：**registry 的 descriptor**（"将要有什么"），不是 app.listModules()（"现在能跑什么"）
import { registerAll, listModules as listDeclaredModules, collectProactiveRules, routeByText } from '@core/registry/index.js'

import { router } from './shell/router.js'
import { installHomeButton } from './shell/home-affordance.js'
import './shell/home-affordance.css'
// ★ orbit 的样式整体被作用域化到 `.orbit-page`（见该文件头部）：它的 47 个顶层类
//   选择器里有 24 个与 ui-kit 撞名、1 个与晶体页撞名，全局引入会改掉**别的页面**。
import './pages/orbit-page.css'
import { globalData } from './shell/app-state.js'
import { getCrystalAdapter } from './shell/agent-bridge.js'
import { CATALOG, crystalIndex } from './crystal-view.js'
import { HomePage } from './shell/pages/home.js'
import { IndexPage } from './pages/index.js'
import { ViewerPage } from './pages/viewer.js'
import { ComparePage } from './pages/compare.js'
import { SymmetryPage } from './pages/symmetry.js'
import { OrbitPage } from './pages/orbit.js'

const $ = (sel) => document.querySelector(sel)

// ---------------------------------------------------------------------------
// 0. 主题：**最先**初始化（早于任何渲染）
// ---------------------------------------------------------------------------
// ★ 为什么必须最先：它要把 `data-theme` 写到 <html> 上。晚于首屏渲染的话，
//   用户会看到一帧默认色再跳到目标色（闪烁）。放在这里，第一个像素就是对的。
initTheme()

// ---------------------------------------------------------------------------
// 0b. 注册全部模块描述（descriptor）
// ---------------------------------------------------------------------------
// ★ 为什么提到这么前：registry 里的内容**不止给首页用**——主动介入规则
//   （`collectProactiveRules()`）、计划中的工具清单、按文本路由的候选模块
//   全都从这里读。放在路由那一段注册，后面用到它的地方就都成了"时序凑巧"。
// ★ 它也是"注册了不等于生效"那一课的落点：在此之前 `registerAll` 零调用方，
//   descriptor 里的 capabilities/knowledge/tools/proactiveRules 一个都没被读过。
registerAll()

// ---------------------------------------------------------------------------
// 1. 惰性视图代理 —— 智能体与"当前可驱动视图"之间的稳定接口
// ---------------------------------------------------------------------------
/**
 * ★ 为什么需要代理：视图实例随路由生灭（进查看器才有），而智能体是**全局单例**
 *   （面板跨路由存活、对话历史跨页保留）。若让智能体直接持有视图实例，
 *   每次进出查看器都要重建智能体——那会**清空对话历史**，而"看到晶体时问一句、
 *   回库页想想、再进来接着问"是很自然的用法。
 *
 * ★ 拿不到适配器时**抛错**，而不是静默 no-op：错误会被 facade 的 applyActions
 *   捕获并变成 `{ok:false, failed:[{error}]}`，模型看得见它、会据此回应
 *   （"你现在不在晶体页面，先打开一个晶体"）。**静默无效**是这类集成里最难发现的
 *   失败模式——模型以为动作生效了，画面上什么都没动。
 */
function createLazyView() {
  const requireAdapter = () => {
    const a = getCrystalAdapter()
    if (!a) throw new Error('当前没有可驱动的三维视图——请先在库页打开一个晶体')
    return a
  }
  return {
    getProps: () => {
      const a = getCrystalAdapter()
      return a ? a.getProps() : EMPTY_PROPS
    },
    setProps: (p) => requireAdapter().setProps(p),
    setView: (d) => requireAdapter().setView(d),
    resetView: () => requireAdapter().resetView(),
    getViewState: () => {
      const a = getCrystalAdapter()
      return a ? a.getViewState() : null
    },
    setViewState: (s) => {
      const a = getCrystalAdapter()
      return a && typeof a.setViewState === 'function' ? a.setViewState(s) : false
    },
    getContainer: () => {
      const a = getCrystalAdapter()
      return a ? a.getContainer() : null
    },
    get canvas() {
      const a = getCrystalAdapter()
      return a ? a.canvas : null
    },
    /**
     * ★ 代理的接口面必须**跟上适配器**——facade 只认 view 上有哪些方法，
     *   漏一个不会报错，只会让对应动作永远"不被支持"（晶体线就是这么发现
     *   openCompareView 缺失的）。加适配器能力时，这里必须同步加。
     */
    openCompareWith(b) { return requireAdapter().openCompareWith(b) },
    /**
     * 强制重建三维场景（改了视觉颜色之后要调它）。
     * ★ 同样遵循"代理的接口面必须跟上适配器"：漏一个方法不会报错，
     *   只会让对应能力永远"不被支持"。取不到适配器时返回 false，不抛错——
     *   "改完颜色画面没刷新"不该把保存这件事本身弄失败。
     */
    refreshScene() {
      const a = getCrystalAdapter()
      return !!(a && typeof a.refreshScene === 'function' && a.refreshScene())
    },
  }
}

/** 无视图时的空快照（门面据此生成"当前没在看什么"的状态） */
const EMPTY_PROPS = {
  crystalId: '',
  showAtoms: false, showBonds: false, showWireframe: false, showInterstices: false,
  showOctahedral: false, showTetrahedral: false, showSymmetry: false, showAxes: false,
  showAuxiliaryBody: false, showAuxiliaryFace: false, showAtomLabels: false,
  showHydrogenBonds: false, showLatticePoints: false,
  atomVisibility: {}, atomScale: 1, stickRadius: 0.08,
  cellDisplayMode: 'conventional', opacity: 0,
}

// ---------------------------------------------------------------------------
// 2. 三维配色：**尊重用户覆盖**，不做强制写入
// ---------------------------------------------------------------------------
/**
 * ★ 这里刻意**不**做 `for (...) setVisualColor(默认值)`。
 *   上一版那样做了，后果是每个用户每次打开页面，自己调过的配色都被覆盖回默认值
 *   ——而 `@crystal/data/settings.js` 的 `getVisualColor()` 取值顺序本就是
 *   「用户覆盖 > 默认」，根本不需要外部强推。晶体线的组装代码也明确拒绝了这个做法
 *   （"那是从零新建的壳才该做的事，不该替已有用户做迁移"）。
 *   只在这里**确保默认值就位**：用户没调过时用模块默认色。
 */
void setVisualColor   // 保留引用：默认值由 @crystal/data/settings.js 自带，无需外部写入

// ---------------------------------------------------------------------------
// 3. 内容库（知识 / 技能目录）
// ---------------------------------------------------------------------------
// ★ 为什么排在模块之前：晶体模块的 teach 类工具要用**技能目录**（费曼复述评估与
//   "下一题推荐"会读它），而目录要在模块**构造时**就传进去。晚建就要靠"构造后再补"
//   这种时序依赖，那类隐式约定一旦被打乱就是静默失效。
//
// ★ 渐进式披露的分界：`heavy` 字段**不进系统提示**，只留 id/kp/标题/关键词。
//   判据是"这个字段是用来**选择哪一条**的，还是**加载后才用**的？"
//   5 条时看不出差别，44 条时会变成 130+ 条误解文本压在系统提示里。
const knowledge = createCatalog({ key: 'id', heavy: ['body', 'misconceptions'] })
const skills = createCatalog({ key: 'name', heavy: ['steps', 'phrases', 'cautions'] })
regOrbitKnowledge(knowledge)     // 42 条（id 形如 orbit:K3-1；kp 是**裸值** K3）
regCrystalKnowledge(knowledge)   // 44 条（id 形如 crystal:C1-1）
/**
 * ★ 对称性的 40 条以前**根本没在这里注册**（2026-10-01 补）。
 *   症状极其隐蔽：条目文件早就写好了、守卫也全绿，
 *   但壳里 `knowledge.load('symmetry:P3-5')` 取不到——**agent 一条都读不到**。
 *   不报错、不崩、守卫也不会红，因为守卫测的是"条目本身对不对"，
 *   而"有没有接线"是另一回事（接线由 test-app 的装配断言守）。
 */
regSymmetryKnowledge(knowledge)  // 40 条（id 形如 symmetry:P1-1）
regCommonSkills(skills)          // 6 个通用教学法

// ---------------------------------------------------------------------------
// 4. 宿主提供的零件：出题引擎 · 学情 · 对话存储 · 收藏夹
// ---------------------------------------------------------------------------
/**
 * ★ 这一节是**用户可见功能**的实际来源，缺一项就少一片能力（且多半不报错）：
 *   · 没有 `compute` → compareCrystals 不存在（双晶体数值对比没了）
 *   · 没有 `quiz`    → 8 个 teach 工具全都不存在（出题/判分/错因/费曼/推荐）
 *   · 没有 `mastery` → 模型不知道学生哪些已掌握；推荐工具会如实回"未接入"
 *   · 没有 `convStore` → 刷新后对话全丢
 *
 * ★ 确定性计算的唯一来源：**`modules/crystal/tools.js` 那一批**。
 *   出题引擎与对比工具都用它，不另写一份——密度计算里有 Z 陷阱
 *   （Z 是化学式单位数，不是晶胞原子数：NaCl 取 8 会算出 4.37 而真值 2.19，
 *   数值不荒谬所以极难发现）。另写一份就必然丢掉那个守卫。
 */
const compute = {
  cellVolume: crystalTools.cellVolume,
  atomCount: crystalTools.atomCount,
  computeDensity: crystalTools.computeDensity,
  nearestSameAtomDistance: crystalTools.nearestSameAtomDistance,
  parseFormula,
}

const quiz = createQuizEngine({ loadData: getCrystalData, compute, catalog: CATALOG })

/**
 * 掌握度模型：答对 +1 / 答错 −1 / 复述通过 +2；连续两次答对即标记已掌握。
 * ★ 只存本机（localStorage），不上传——与 BYOK 的隐私姿态一致。
 * ★ 存储键由**宿主**给出：模块的缺省值是 `crystal.mastery`（模块独立部署时的名字），
 *   而本壳的命名空间是 `chem-agent.*`。不显式传就会写成两套键，
 *   表现为"在独立版里练过的学情，在统一壳里看不到"。
 */
const mastery = createMasteryModel({ storageKey: 'chem-agent.mastery' })

/**
 * 学情按**当前模块**分派。
 * ★ 中枢的 `mastery` 是单槽位（`opts.mastery.summary()` 进感知快照），而两个模块
 *   各有自己的学情。直接传某一个，在另一个模块里就会把**别人的**学情告诉模型 ——
 *   这种错很隐蔽：模型会照着「学生已掌握晶体配位」去讲原子轨道。
 *   这里按当前激活模块选；没有对应学情就不带（返回空对象）。
 * ★ 用闭包延迟取 `app`：它在下面才创建，而 summary() 只会在装配完成之后被调用。
 */
const masteryRouter = {
  summary() {
    const id = app && app.activeModule
    const m = (id === 'crystal') ? mastery : (id === 'orbit' ? orbitMastery : null)
    try { return m ? m.summary() : {} } catch (e) { return {} }
  },
}

/**
 * 对话持久化：解决的问题是**刷新后对话就没了**。
 * 学生在晶体视图里问了一半、切页或手机锁屏后浏览器回收页面，回来时上下文全丢
 * ——这在移动端是常态。
 */
const convStore = createConversationStore({ prefix: 'chem-agent.conv' })
/** 演示收藏夹：存本机、跨会话、随时重播（见 store/demo-favorites.js） */
const demoFavorites = createDemoFavorites({ storageKey: 'chem-agent.demoFavorites' })

// ---------------------------------------------------------------------------
// 4. 模块（纯逻辑，可在 Node 测）
// ---------------------------------------------------------------------------
const crystal = createCrystalModule({
  view: createLazyView(),
  catalog: CATALOG,
  loadData: getCrystalData,
  // ★ 四个注入项：quiz/compute 决定 teach 与 compare 工具**存不存在**；
  //   mastery/skills 供费曼复述评估与"下一题推荐"用。
  //   未注入时模块会**如实返回空工具集**，而不是塞一批"尚未实现"的占位工具
  //   （把没实现的工具交给模型，它只会反复调用然后拿到错误）。
  quiz,
  compute,
  mastery,
  skills,
  /**
   * ★ 练习守卫：作答前拒绝"揭示答案"的动作（打开对称元素/空隙/点阵点等图层）。
   *   提示词只能劝，挡不住模型在 explain 节点自行下发——这道闸是结构性的：
   *   facade.applyActions 会把它们挡下来并说明原因（见 quiz/index.js 的 revealLayerSet）。
   *   学生自己在面板上开图层**不受限**（那走 applyIntent，不经这里）。
   */
  practiceGuard: () => quiz.revealLayerSet(),
})

/**
 * 分子对称性模块。
 * ★ 注意它**不接收 view** —— 与晶体模块最本质的差别。
 *   晶体的动作全落在三维视图上（所以要有 view 与惰性代理）；
 *   对称模块的动作是"换哪个分子"，那是它自己的状态。
 *   页面（SymmetryPage）在 mount 时自己构造三维视图，并订阅 facade 的变化。
 *
 * ★ 唯一注入的是**空间群分析器**（晶体示例用，2026-10-01 补）。
 *   此前它只有页面那条路：页面对 NaCl/CsCl 走 `analyzeSpaceGroup`（WASM），
 *   而门面的 `identify()` 走的是分子识别，对晶体返回 `{symbol:'ERR'}`——
 *   于是**智能体答不出"NaCl 是什么空间群"**（P5 的核心问题），
 *   而学生自己在页面上看得见答案。同一件事两条路、agent 那条没接，是本仓库
 *   反复踩过的那类缺口。现在两条路都从这一个注入点走。
 *
 * ★ 为什么**惰性**动态导入：space-group.js 依赖 @spglib/moyo-wasm 与
 *   `…moyo_wasm_bg.wasm?url`（Vite 专有后缀）。静态 import 会把 WASM 拖进首屏包，
 *   而绝大多数会话根本不会分析晶体。缓存模块对象，避免重复 import。
 */
let _spaceGroupMod = null
const loadSpaceGroup = async () => {
  if (!_spaceGroupMod) _spaceGroupMod = await import('@modules/symmetry/space-group.js')
  return _spaceGroupMod
}
const symmetry = createSymmetryModule({
  initialId: 'water',
  /** (structure) => Promise<空间群分析结果>；第一次调用时才加载 WASM */
  spaceGroup: async (structure) => (await loadSpaceGroup()).analyzeSpaceGroup(structure),
  /** 同步包装：只在 spaceGroup 已解析之后被调用（那时模块必然已加载） */
  operationsToElements: (ops) => (_spaceGroupMod
    ? _spaceGroupMod.operationsToSymmetryElements(ops) : []),
})

/**
 * 原子轨道模块。
 * ★ 与前两个模块的结构性差别：**它的运行时由页面创建**（状态住在页面的闭包里，
 *   上游的架构就是 DOM 当值的中介——见重构计划 P7）。
 *   所以这里不传 view，而是由页面在 mount 时通过 `module.attach(runtime)` 交进来。
 *   `canApplyActions()` 据此返回"运行时在不在"，见 modules/orbit/facade.js。
 *
 * ★ 出题引擎 / 学情 / 错因诊断**暂未注入**——所以 teach 类工具是**如实为空**的
 *   （descriptor 里也相应地把那 8 个放在 plannedTools，见那里的说明）。
 *   接入它们的下一步：把上游 `js/agent/question-engine.js`（719 行）与
 *   `mastery-model.js`（121 行）搬进 modules/orbit/，在这里注入。
 */
/**
 * ★ 注入清单：
 *   · quiz / diagnosis —— 决定那 8 个 teach 类工具**存不存在**（未注入则如实为空）
 *   · mastery          —— 学情（推荐与费曼评估要用）
 *   · getApp / getPanel / getSceneBridge —— 出题引擎要读当前轨道、发提示、驱动分镜
 *     （上游靠 `window.OrbitApp` 互抓；这里改成注入。用闭包延迟取，
 *      因为 `panel` / `app` / `knowledge` 都在本行之后才创建。）
 */
const orbitMastery = OrbitMastery
OrbitMastery.configure({
  // ★ 存储键由宿主给：模块的缺省值不得指向具体命名空间
  storageKey: 'chem-agent.orbit.mastery',
  getApp: () => orbit.facade.getRuntime(),
})
OrbitQuiz.configure({
  getApp: () => orbit.facade.getRuntime(),
  getPanel: () => panel,
  getSceneBridge: () => app.storyboard,
  getKnowledge: () => knowledge,
})

const orbit = createOrbitModule({
  quiz: OrbitQuiz,
  diagnosis: OrbitDiagnosis,
  mastery: orbitMastery,
  // 费曼复述的入口要用技能目录（取 feynman 技能的评分要点）
  skills,
})

// ---------------------------------------------------------------------------
// 4b. 三维背景色：**跟随界面主题**，但尊重用户的显式选择
// ---------------------------------------------------------------------------
/**
 * ★ 这一节兑现的是「两套都留，随主题切」的后半句。
 *   晶体模块的 `bgColor` 是一个**模块设置**（`getVisualColor('bgColor')`），
 *   它的默认值是白色（教材插图与投屏的惯例）——它**不知道**宿主此刻是深色还是浅色。
 *   于是只做"两套都留"的话，深色主题下会得到"深色页面里嵌一块白画布"。
 *
 * ★ 语义（凭什么决定跟不跟）：**用户没表达过偏好就跟随主题，表达过就一直接尊重**。
 *   难点在于"用户是否表达过"这件事在模块存储里看不出来——我们自己写的值
 *   和用户选的值长得一样。故把"用户改过背景色"这个**事实**记在宿主自己的
 *   settings 里（`bgColorOverridden`），而不是去猜。
 *   （这个信号由设置弹层提供：`settingsPopup.touchedExternal()` 告诉宿主
 *     本次保存里用户手改过哪些外挂字段。）
 */
const THEME_CANVAS_BG = { light: '#ffffff', dark: '#0b1020' }

/** 深色主题下的画布底色：用与页面底色同一个值，避免"画布比页面更深/更浅"的割裂感 */
function applyThemeCanvasBg(resolved) {
  if (settings.get().bgColorOverridden) return   // 用户选过 → 不碰
  const want = THEME_CANVAS_BG[resolved] || THEME_CANVAS_BG.light
  if (getVisualColor('bgColor') === want) return
  setVisualColor('bgColor', want)
  crystal.facade.refreshScene && crystal.facade.refreshScene()
}

// ---------------------------------------------------------------------------
// 5. 设置（BYOK）+ 声明式设置弹层
// ---------------------------------------------------------------------------
const settings = createSettingsStore({
  storageKey: 'chem-agent.settings',
  // ★ 「清除本机数据」必须真的清干净。学情、悬浮球位置、演示收藏是**静态键**，
  //   列出来即可；对话是**动态键**（索引 + 每个会话一个），静态列表表达不了，
  //   交给 onClearAll —— convStore 在上面已经建好，所以这里可以闭包直接用。
  //   漏了这些的表现是"点了清除，学情与对话其实还在"，且不报错。
  clearKeys: ['chem-agent.mastery', 'chem-agent.panel.fabPos', 'chem-agent.demoFavorites'],
  onClearAll: () => { try { convStore.clearAll() } catch (e) { /* 忽略 */ } },
})

const settingsPopup = createSettingsPopup({
  store: settings,
  // 智能体自身的设置 + **界面主题** + **模块自己的小参数**，用同一套声明式 schema
  schema: DEFAULT_SCHEMA.concat([
    {
      key: 'theme',
      label: '界面主题',
      type: 'select',
      options: [['system', '跟随系统'], ['dark', '深色'], ['light', '浅色']],
      hint: '晶体三维视图的背景会一并切换（白底更接近教材插图与课堂投屏）',
    },
  ], crystal.settings),
  groups: DEFAULT_GROUPS.concat([
    {
      title: '晶体模块参数（模块自己声明的）',
      keys: ['atomScale', 'stickRadius', 'opacity', 'cellDisplayMode'],
    },
    {
      // ★ 配色项由**模块**声明（见 modules/crystal/settings-visual.js），
      //   但它们的值存在模块自己的 localStorage 里，不经本 store——
      //   弹层只是那份数据的**视图**（schema 里的 get/set 外挂通道）。
      title: '三维配色（改完立即生效）',
      keys: crystal.settings.filter((x) => x.type === 'color').map((x) => x.key),
    },
    {
      title: '逐元素配色',
      keys: ['elementColors'],
    },
  ]),
  testConnection: LLMClient.testConnection,
  about: '<b>结构化学教学智能体</b><br>纯前端 · 计算层确定性求值（防幻觉）<br>'
    + '模型由使用者自备（BYOK），本工具不提供额度',
  onSaved: (s) => {
    // 主题：落到 theme.js（它管理 data-theme 与持久化）
    // ★ 两条路径共用同一个真源：theme.js 的 localStorage 键是 'chem-agent.theme'，
    //   设置面板只是它的一个入口，不另存一份（否则"改了一处、另一处没变"）。
    if (s.theme) setTheme(s.theme)
    // 模块参数要落回视图，且走动作通路（这样感知层能记进痕迹）
    try {
      crystal.facade.applyActions([
        { action: 'setAppearance', params: { atomScale: s.atomScale, stickRadius: s.stickRadius, opacity: s.opacity } },
        { action: 'setCellDisplayMode', params: { mode: s.cellDisplayMode } },
      ])
    } catch (e) { /* 不在晶体页时无视图可落，忽略——不是错误 */ }

    /**
     * ★ 用户**亲手**改过背景色 ⇒ 从此不再替他按主题覆盖。
     *   这个判断不能靠"模块存储里有没有 bgColor"——我们按主题写进去的值
     *   和用户选的值在存储里长得一模一样，分不出来。
     *   弹层的 `touchedExternal()` 给的是"本次保存里用户动过哪些外挂字段"，
     *   那才是可靠信号。
     */
    try {
      const touched = typeof settingsPopup.touchedExternal === 'function' ? settingsPopup.touchedExternal() : []
      if (touched.includes('vc_bgColor')) settings.set({ bgColorOverridden: true })
    } catch (e) { /* 拿不到改动清单时保守起见不动——保持现状不会出错 */ }

    /**
     * ★ 视觉颜色（背景/线框/空隙/点阵点/元素颜色…）**改完必须重建三维场景**：
     *   配色是在建场景时读进材质的，不是每帧读。不重建的表现是
     *   "用户改完颜色以为什么也没发生"——本仓库最典型的一类静默失效。
     */
    try { crystal.facade.refreshScene && crystal.facade.refreshScene() } catch (e) { /* 不在晶体页时无场景可重建 */ }
  },
})

// 把当前主题同步进设置面板（它的初值要反映实际状态，否则面板显示与实际不符）
settings.set({ theme: getTheme() })

// 让三维画布底色**跟随**当前主题（用户没自定义过背景色时）。
// ★ 订阅而不是只调一次：切主题时画布不重绘就会留下"页面变了、画布没变"的错位。
//   ★ 这里只处理**画布底色**；页面其余部分的颜色由 CSS 变量自己随 data-theme 变，
//     不需要 JS 参与（能交给 CSS 的就不要用 JS 转发，否则又是一个双真源）。
applyThemeCanvasBg(resolvedTheme())
onThemeChange((_theme, resolved) => applyThemeCanvasBg(resolved))

// ---------------------------------------------------------------------------
// 7. 智能体（中枢 + 模块）
// ---------------------------------------------------------------------------
/**
 * 模块 → 它在统一壳里的主页路由。
 *
 * ★ 导航是**宿主**的事：中枢只负责"该用哪个模块"，不该知道 URL 长什么样。
 *   所以中枢 via `onActiveChange(id)` 通知，由这里决定跳去哪。
 */
const MODULE_HOME_ROUTE = { crystal: '#/crystal', orbit: '#/orbit', symmetry: '#/symmetry' }

const app = createAgentApp({
  modules: [crystal, symmetry, orbit],
  settings,
  llm: LLMClient,
  knowledge,
  skills,
  // ★ 学情一并交给中枢：感知快照会带上它，模型才知道"哪些已掌握、哪些反复出错"。
  //   此前它只在模块内部用于推荐，模型每轮都在不了解学生底细的情况下出题。
  mastery: masteryRouter,
  node: 'explain',
  prompts: {
    role: '你是结构化学教学智能体，服务于结构化学课程的教与学。'
      + '你不是问答机器人，而是能感知用户在做什么、能动手把话演示出来的教学智能体——'
      + '凡是可以用三维视图演示的，都要用 applySceneActions 演示，而不是只用文字描述。',
    // ★ 数值纪律**按模块**给：原先这段写死了"必须用 queryCrystal"，
    //   而在轨道/对称性模块下那个工具根本不存在，模型照它去调只会失败。
    //   模块自己的 roleHint 已经写了各模块的数值纪律（见 modules/*/index.js）。
    moduleRoles: {
      crystal: '涉及配位数、空隙数、晶胞参数、密度等一切数值，必须用 queryCrystal 取得，不要口算。',
      orbit: '节面数、径向峰位、能级、简并度等一切数值必须用 queryOrbital 取得，不要凭记忆或口算。',
      symmetry: '点群符号与对称元素清单一律用 queryPointGroup 取得；晶体示例走空间群（同一条命令）。',
    },
  },
  /**
   * ★ 文本 → 模块的自动路由。
   *
   * 此前 `routeByText()` 已经写好却**零运行时调用方**，模块只能靠 URL 激活；
   * 而首页不设 activeModule，默认停在"第一个注册的模块"（晶体）——
   * 于是从首页问"水分子是什么点群"，模型手里拿的是**晶体的工具**。
   * 这就是"智能体只在晶体下工作"的直接原因。
   */
  routeByText: (text) => routeByText(text),
  // ★ 只在**没有模块归属**的页面上按文本路由（首页）。一旦 URL 已经带着用户
  //   进了某个模块，模块归属就该由 URL 说了算——否则在轨道页问一句晶体的问题
  //   会切走模块，而 view-registry 里注册的还是轨道视图，动作会落到空气上。
  shouldAutoRoute: () => router.currentPath === '/',
  // 让用户看得见"为什么答案换了模块"——否则会被当成 bug 报；
  // 并且**把用户带到那个模块的页面上**（否则模型在讲对称性，画面还停在首页）。
  //
  // ★ 为什么要限定 `router.currentPath === '/'`：only 在"没有模块归属"的页面上
  //   才需要这一跳。进了模块页之后，模块归属由 URL 说了算，这里的跳转会与路由打架。
  //   而且此跳**不会成环**：路由挂载时会再调 setActiveModule(同 id)，
  //   而 setActiveModule 对"值没变"是早返回的。
  //
  // （panel 在本行之后才创建，故用闭包延迟取，与 getPanel 那几处同一手法。）
  onActiveChange: (id) => {
    if (!id) return
    try {
      const mod = listDeclaredModules().find((m) => m.id === id)
      panel.addChip(`已切到「${(mod && mod.title) || id}」模块`, 'info')
    } catch (e) { /* 面板尚未就绪（装配早期）——提示可省，但绝不能因此中断切模块 */ }
    const route = MODULE_HOME_ROUTE[id]
    if (route && router.currentPath === '/') location.hash = route
  },
})

// ---------------------------------------------------------------------------
// 8. 出题与判分的界面（题目卡 / 反馈卡 /「去看结构」）
// ---------------------------------------------------------------------------
// 先声明、后创建：面板的 send 需要引用它，而它又需要面板实例。
let panel = null
let quizUI = null

/**
 * 包装 send 的 handlers：拦截工具结果，把「出题」「判分」的结果渲染成卡片。
 * 选择在装配层包装而不是改 panel.js 的内部逻辑——面板保持通用，
 * 学科相关的呈现（题目卡）留在 quiz/ui.js 里。
 */
function wrapHandlers(handlers) {
  if (!quizUI) return handlers
  const h = Object.assign({}, handlers || {})
  const orig = handlers && handlers.onToolResult
  const origDone = handlers && handlers.onDone
  h.onToolResult = (info) => {
    if (typeof orig === 'function') {
      try { orig(info) } catch (e) { /* 面板自身处理失败不应连累卡片渲染 */ }
    }
    try { quizUI.handleToolResult(info) } catch (e) {
      console.error('[agent] 题目卡渲染失败：', e)
    }
  }
  // ★ 每轮对话**结束后**把完整历史整体落盘，而不是逐条 append。
  //   理由：conversation 的历史里 tool_calls 与 tool 消息**必须成对**，
  //   逐条落盘时若用户在中途刷新，会留下悬空的 tool_calls——下次请求
  //   会被服务端判为消息格式非法（400）。整体落盘保证拿到的是完整的一轮。
  h.onDone = (summary) => {
    if (typeof origDone === 'function') {
      try { origDone(summary) } catch (e) { /* 面板的处理失败不应影响持久化 */ }
    }
    try {
      // ★ 顺序**不能反**：先落树、再按当前分支重渲染。
      //   重渲染是从树里读的（`renderPath → store.path()`）——先渲染就会渲染出
      //   还没有这一轮的旧路径，表现为"回答完之后，新消息又消失了"。
      // ★ `ensureValid()` 是防御：万一历史里有悬空的 tool_calls（中止、迁移、
      //   旧版本存档），在这里补齐占位消息，而不是让下一次请求吃一个 400。
      convStore.ensureValid()
      convStore.replaceAll(app.conversation.getHistory())
      if (panel) panel.renderPath()
    } catch (e) {
      console.warn('[agent] 对话落盘/重渲染失败（不影响当前会话）：', e)
    }
  }
  return h
}

// ---------------------------------------------------------------------------
// 9. 演示播放时把面板缩为下半屏
// ---------------------------------------------------------------------------
/**
 * ★ 为什么必需：面板的样式是 `width: min(440px, 94vw); height: 100%`——
 *   **手机上 94vw 宽、占满全高**，于是点演示时它**完全遮住三维视图**：
 *   旁白在面板里、画面在面板后面，两边都看不到，表现为"点了演示什么也没发生"。
 *   缩为下半屏后画面与旁白同屏，才谈得上"边看边读"。
 *   （对应的 CSS 在 package/agent-core/ui/panel.css 的 `agent-demo-playing` 一节）
 *   只在**播放期间**生效，停止后恢复全高（平时全高更好读对话）。
 */
function syncDemoLayout() {
  try {
    const st = app.storyboard.state()
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('agent-demo-playing', !!(st && st.playing))
    }
  } catch (e) { /* 布局切换失败不应影响演示 */ }
}
app.storyboard.onProgress(syncDemoLayout)
syncDemoLayout()

// ---------------------------------------------------------------------------
// 10. 面板（挂在 document.body，与页面容器无关，故切页不会被清掉）
// ---------------------------------------------------------------------------
panel = createPanel({
  title: '教学智能体',
  // 对话存储（分支树）：面板据此提供分支片 / 消息工具条 / 多会话 / 刷新还原
  store: convStore,
  // 演示收藏夹：动作气泡上的「☆ 收藏」与会话页里的收藏列表
  demoFavorites,
  /**
   * 悬浮球图标（apps/web/public/agent-icon.png）。
   * ★ 路径用 BASE_URL 拼，而不是写 `./agent-icon.png`：后者**相对当前页面 URL**
   *   解析，而本站是 hash 路由（`/#/viewer/fcc`）——一旦将来改成 history 路由
   *   或部署到子路径，相对路径会静默 404（只表现为"图标不显示"，不报错）。
   *   ★ 没给 iconSrc 时面板会退回文字而不是放一个 `src=''` 的 img
   *   （空 src 会让浏览器去请求当前页面 URL，每次打开吃一个 404）。
   */
  iconSrc: `${(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './'}agent-icon.png`,
  placeholder: '问晶体结构的问题，或让我演示…（Enter 发送，Shift+Enter 换行）',
  menu: [
    // ★ 「练习」= 练习闭环入口：选知识点 → 本地出题 → 题目卡作答 → 本地判分 + 错因诊断。
    //   全程**不经过模型**，所以没有 API Key 也能用。
    { label: '练习', onClick: () => startPractice() },
    { label: '设置', onClick: () => settingsPopup.open() },
    // ★ 「会话」= 多会话管理（切换 / 改名 / 删除 / 新建）。放在菜单里而不是抽屉内，
    //   因为它是"低频但必要"的操作，常驻会白白占掉消息区的空间。
    { label: '会话', onClick: () => panel.enterConvPage() },
    {
      label: '新对话',
      // ★ 「新对话」= 开一个**新会话**（旧会话留在列表里，随时切回去），
      //   而不是"清空当前会话"——清空是不可逆的，学生点错一次内容就没了。
      onClick: () => {
        try {
          app.conversation.reset()
          convStore.newSession()
          panel.renderPath()          // 路径为空 → 自动回到空态
        } catch (e) { console.warn('[agent] 新建会话失败：', e) }
      },
    },
  ],
  // 切换 / 删除会话后要把**上下文**一起换掉，否则模型还停留在上一段对话里
  syncConversation: () => {
    try {
      app.conversation.stop()
      app.conversation.setHistory(convStore.messages())
    } catch (e) { console.warn('[agent] 同步会话历史失败：', e) }
  },
  greeting: [
    '<b>我是结构化学教学智能体</b><br>',
    '我能感知你此刻在看哪个晶体，也能动手把话演示出来。<br><br>',
    '试试：<br>',
    '· 「NaCl 的密度是多少」<br>',
    '· 「打开八面体空隙，让我数一数」<br>',
    '· 「为什么 CsCl 是简单立方而不是体心立方」',
  ].join(''),
  actionLabels: crystal.actionLabels,
  sequenceToolName: 'applySceneActions',
  getShowReasoning: () => settings.get().showReasoning,
  storyboard: app.storyboard,
  // ★ 包装 send：拦截工具结果，把「出题」「判分」的结果渲染成卡片。
  send: (text, handlers) => app.send(text, wrapHandlers(handlers)),
  onStop: () => app.stop(),
  hasKey: () => settings.hasKey(),
  openSettings: () => settingsPopup.open(),
  // ★ 存储键由宿主给出（命名空间纪律：面板的缺省值不得指向某个具体产品名）
  storageKey: 'chem-agent.panel.fabPos',
})
panel.init()

// 空闲时预加载公式渲染器（277 KB，不阻塞首屏）。
// ★ 渲染器是**每次渲染时现取** `globalThis.katex` 的（见 ui/renderer.js 的 katexHtml），
//   所以这里晚加载完全没问题；若它改成构造时捕获，本行之后的公式就全退化成源码了。
preloadKatexIdle()

// 面板就绪后再建卡片层（它需要 panel 实例）
// ★ 传 `quiz` 引擎：练习模式的「看答案」要用它的**只读** `peek`
//   （不走 checkAnswer —— 那会伪造一条作答记录，见 quiz/index.js 的 peek 说明）
quizUI = createQuizUI({ panel, app, module: crystal, quiz })

// ---------------------------------------------------------------------------
// 11. 练习闭环入口
// ---------------------------------------------------------------------------
//   ★ **纯本地**：出题、判分、提示、答案全部由出题引擎与题库给出，不经过模型。
//     上一版是发一句"请讲解 X，讲完给我出几道题"等模型自由发挥，结果模型按
//     explain 节点的纪律做了演示、却没出题——学生只看到画面在动，没有题干与选项
//     （实测反馈）。练习的诉求本就是"只给学生看题目"，没有理由假手模型。
function startPractice() {
  // 知识点选择器卡片（8 个知识点 C1–C8；复用 panel.css 里现成的 .agent-picker 样式）
  const entries = Object.entries(KNOWLEDGE_POINTS)
  const btns = entries.map(([id, meta]) =>
    `<button type="button" class="agent-pick-btn" data-kp="${id}">${meta.label}</button>`
  ).join('')
  const el = panel.addCard(
    '<div class="agent-picker">'
    + '<div style="font-size:12px;color:var(--text-dim,#9aa7c6)">选择要练习的知识点：</div>'
    + btns + '</div>',
    'assistant'
  )
  // ★ 用 addCard 返回的元素引用绑定（而不是 querySelector 找回），
  //   避免"模型同轮又插一条消息导致 last-of-type 错位、按钮绑不上"的静默失效。
  el.querySelectorAll('.agent-pick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kp = btn.dataset.kp
      if (!KNOWLEDGE_POINTS[kp]) return
      // 选完后禁用全部按钮，避免重复点击开出两套练习
      el.querySelectorAll('.agent-pick-btn').forEach((b) => { b.disabled = true })
      // 本地立即出题：不需要模型，所以**不需要密钥**（练习在未配置 API Key 时也可用）
      quizUI.startPractice(kp)
    })
  })
}

// 页面发出的「打开设置」请求（页面不 import 弹层实现，只发事件——见 pages/index.js 的说明）
window.addEventListener('agent:open-settings', () => settingsPopup.open())

// ---------------------------------------------------------------------------
// 12. 主动介入
// ---------------------------------------------------------------------------
//   ★ 「本地规则先筛、命中才唤起模型」——未命中时**零 token**。
//     这不是"省一点"，而是这功能能否常态运行的前提：一个每 2.5 秒问一次模型的实现，
//     成本高到没人敢开。
//   ★ 它**只提议不执行**：建议显示成一张卡，学生点「应用」才下发动作。
//     constraints.js 的 proactive 节点没有 hand 授权，这是结构保证而非提示词约定。
const proactive = createProactive({
  // 规则来自 **registry 聚合的各模块声明**，不写死在壳里。
  // ★ 用聚合而不是"取 crystal 那一条"：规则引擎本就是通用的，规则属模块。
  //   各模块的 check 自带守卫（晶体那条先看 `state.crystal` 在不在），
  //   所以当前激活的是别的模块时，晶体规则自然不会命中，不必在这里按模块筛。
  rules: collectProactiveRules(),
  perception: app.perception,
  storyboard: app.storyboard,
  isEnabled: () => settings.get().proactive !== false,
  isBusy: () => (typeof app.conversation.isRunning === 'function' ? app.conversation.isRunning() : false),
  onSuggest: (s) => {
    const html = `
      <div class="agent-proactive">
        <div class="agent-pro-head">主动提示</div>
        <div class="agent-pro-body">${s.text}</div>
        <div class="agent-pro-btns">
          <button class="agent-pro-act" type="button">应用</button>
          <button class="agent-pro-skip" type="button">不用了</button>
        </div>
      </div>`
    const card = panel.addCard(html, 'agent-proactive-card')
    const btn = card.querySelector('.agent-pro-act')
    const skip = card.querySelector('.agent-pro-skip')
    // ★ 必须有"拒绝"这条路。只有「应用」时，学生不想采纳就只剩两个选择：
    //   点「应用」（做了他不想做的事）或无视（卡片赖在对话里，且**下一轮还会再弹**）。
    //   "不用了"= 关掉这张卡 + 把该规则的冷却重新计时——否则拒绝之后隔一个冷却周期它又来。
    if (skip) {
      skip.addEventListener('click', () => {
        card.classList.add('dismissed')
        setTimeout(() => card.remove(), 200)
        if (typeof proactive.decline === 'function') proactive.decline(s.ruleId)
      })
    }
    if (btn && (s.actions || []).length) {
      btn.addEventListener('click', () => {
        // 用户点了才执行。演示动作每步都要旁白，这里用建议文案兜底
        app.storyboard.applySequence(
          s.actions.map((a) => Object.assign({}, a, { speech: a.speech || s.text })),
          { auto: false },
        )
        btn.disabled = true
        btn.textContent = '已应用'
        if (skip) skip.style.display = 'none'
      })
    } else if (btn) {
      btn.style.display = 'none'
    }
    // 有未读时让悬浮球亮个点（学生关着面板也能察觉）
    if (typeof panel.markUnread === 'function') panel.markUnread()
  },
})
proactive.start()

// ---------------------------------------------------------------------------
// 13. 恢复上次的对话（刷新后不丢）
// ---------------------------------------------------------------------------
// ★ 要恢复**两处**：
//   · conversation 的上下文（否则模型不记得刚才说过什么）
//   · 面板的消息区（否则用户看不到刚才的对话）
//   `tool` 消息与"只含 tool_calls"的 assistant 消息**不渲染**——它们是内部协议，
//   渲染出来是一堆 JSON，对学生毫无意义。
try {
  const saved = convStore.messages()
  if (saved && saved.length) {
    app.conversation.setHistory(saved)
    // ★ 恢复渲染走面板的 `renderPath`——与"切分支""每轮结束"是**同一条**路径。
    //   原先这里只认 user/assistant 的正文，于是动作气泡、题目卡、主动提示卡
    //   刷新后全部消失（而它们恰恰是最需要跨刷新的：引用某一步、重播某条演示）。
    panel.renderPath()
    const path = convStore.path()
    if (path.length) {
      panel.addChip(`已恢复上次的对话（共 ${path.length} 条）——右上角菜单可开新会话`, 'info')
    }
  }
} catch (e) {
  console.warn('[agent] 恢复历史失败（不影响新对话）：', e)
}

// ---------------------------------------------------------------------------
// 14. 路由与页面
// ---------------------------------------------------------------------------
router.setContainer($('#app')).setFallback('/')

/**
 * ★ 「回门户」的入口统一在**壳**这一层装，而不是各页面自己加。
 *
 *   起因是一个真实的死路：对称页移植自上游的**单页应用**，它整页就是全部，
 *   原本没有也不需要"返回别处"这个概念；进了统一壳之后就成了进得去、出不来。
 *   查看器与对比页之所以没这个问题，只是**碰巧**上游自带返回箭头。
 *
 *   逐页去加会一直漏（每个新模块都要记得加一次）。而"怎么离开一条路由"
 *   本来就是路由的职责——所以出口在壳里，且页面的增删都不影响它。
 *   （实现见 shell/home-affordance.js：优先塞进页面自己的顶栏，没有顶栏才悬浮。）
 */
router.onAfterMount(() => {
  // 首页自己不需要出口
  if (router.currentPath !== '/') installHomeButton($('#app'))
})

router
  // 首页：模块入口（编号列表 · 极简学术风）
  .on('/', () => {
    const p = new HomePage({
      // 全部模块（descriptor 声明的，含尚未接入的）——按 teachingOrder 排
      modules: listDeclaredModules(),
      // 已接入的（本应用里真能打开的）：app.listModules() 返回的就是已装配的模块
      available: app.listModules(),
    })
    p.mount($('#app'))
    return p
  })
  // 晶体库
  .on('/crystal', () => {
    app.setActiveModule('crystal')
    const p = new IndexPage()
    p.mount($('#app'))
    return p
  })
  // 查看器
  .on('/viewer/:crystal', ({ params }) => {
    app.setActiveModule('crystal')
    const p = new ViewerPage(params)
    p.mount($('#app'))
    return p
  })
  // 并排对比
  .on('/compare/:crystal', ({ params, query }) => {
    app.setActiveModule('crystal')
    const p = new ComparePage(Object.assign({}, params, { b: query && query.b }))
    p.mount($('#app'))
    return p
  })
  // 原子轨道
  .on('/orbit', () => {
    // ★ 激活模块：权限与工具集随之切换（constraints 按节点+当前模块裁决）
    app.setActiveModule('orbit')
    // 面板要传给页面：量子态编辑器会用它发提示（Panel.addChip）
    const p = new OrbitPage({ module: orbit, panel })
    p.mount($('#app'))
    return p
  })
  // 分子对称性
  .on('/symmetry', () => {
    // ★ 激活对应模块：**权限与工具集随之切换**
    //   （constraints 按节点+当前模块裁决；不激活的话智能体仍以为自己在晶体模块里，
    //    会拿到 queryCrystal 而拿不到 queryPointGroup）
    app.setActiveModule('symmetry')
    const p = new SymmetryPage({ module: symmetry })
    p.mount($('#app'))
    return p
  })

// ★ 这里曾有一个 `MODULE_TITLE` 常量（模块 id → 中文标题）。
//   已删除：模块标题是 **descriptor 的内容**（`title` 字段），不该在宿主里再抄一份
//   ——两份迟早漂移，而且新增模块时得记着改两处。
//   首页现在直接读 `registry.listModules()` 的 `title`。

// 预加载晶体索引（库页与首页都要用）
try {
  globalData.crystalIndex = crystalIndex
} catch (e) {
  console.warn('[app] 晶体索引加载失败：', e)
}

// ---------------------------------------------------------------------------
// 15. 起动
// ---------------------------------------------------------------------------
router.start()
app.start()

if (!settings.hasKey()) {
  panel.addChip('尚未配置 API Key：点面板右上角「设置」填写你自己的模型密钥', 'warn')
}

// 调试用把手（只读为主，供实机验证与排查；**不含密钥**）
window.__chemAgent = {
  app, panel, crystal, symmetry, orbit, settings, router,
  // 内容与学情：实机验证"出题/判分/推荐/刷新还原"时直接查它们
  quiz, quizUI, mastery, proactive,
  store: convStore,
  favorites: demoFavorites,
  /** 当前快照（门面读的实时状态） */
  snapshot: () => crystal.facade.getSnapshot(),
  /** 当前节点的工具白名单（验证"约束靠白名单"时的直接证据） */
  tools: () => app.getTools(),
  /** 各模块的契约合规实况 */
  contractReport: () => app.contractReport(),
  getAdapter: getCrystalAdapter,
  // 主题：实机验证"切换后 data-theme 与解析结果都对"时用（也便于排查配色问题）
  theme: { set: setTheme, get: getTheme, onThemeChange },
  /** 内容库清单（验证渐进式披露：清单不含 body） */
  manifest: () => ({ knowledge: knowledge.index(), skills: skills.index() }),
  loadKnowledge: (id) => knowledge.load(id),
  /** 出题引擎的直接入口（实机验证卡片渲染时用，绕过模型） */
  generateQuiz: (opts) => quiz.generate(opts),
}
