/**
 * modules/crystal/index.js —— 晶体结构模块
 *
 * 这一层是「模块」在本仓库里的家（目标结构见重构计划「目标结构」）：
 *   modules/<模块id>/   模块实现：数据 · 视图 · 动作词汇表 · 设置表
 *
 * 本文件只做**纯逻辑**的再导出，不 import 视图实现（three.js / DOM）——
 * 因此可以在 Node 里直接测试。视图的构造在 view.js（浏览器专用），装配在 apps/web。
 *
 * ★ 工具分四类合并（read / query / hand / teach）。前三类由本模块自己的 tools.js 提供，
 *   **teach 类与 part of query 类由外部注入的引擎提供**：
 *     · quiz    —— 出题/判分/诊断/学情（`modules/crystal/quiz/`）
 *     · compute —— 双晶体数值对比要用的确定性计算
 *   未注入时**如实为空**，而不是塞一批"尚未实现"的占位工具：把没实现的工具交给模型，
 *   它只会反复调用然后拿到错误，比根本不提供更糟。
 */
// ★ 副作用 import：把本模块的中英词典注册进 i18n 运行时（见 i18n.js 顶部的说明）。
//   放在最前面，是为了让下面任何一次 t()/tr() 调用都已经有字典可用。
import './i18n.js'
// ★ 上游复用代码（projects/crystal/H5/src/**）是**另一本**字典：两块各三百条上下，
//   共用一本会让两边轮流写同一个文件（并行时就是冲突）。见 i18n-h5.js 顶部说明。
import './i18n-h5.js'
import { t, tr, trDeep } from './i18n-live.js'
import { createCrystalFacade } from './facade.js'
import { createCrystalTools } from './tools.js'
import { createTeachTools } from './teach-tools.js'
import { createCompareTools } from './compare-tools.js'
import { VOCAB, validate as rawValidate, listActions, labels as actionLabels } from './actions.js'
// 视觉颜色与逐元素配色的声明式 schema（值的真源在模块自己的存储里，见该文件）
import { visualSettings } from './settings-visual.js'
// 装配期校验「宿主有没有给够」——方向与 facade 相反，见 host-requirements.js
import { enforceHostRequirements } from '../../packages/module-contract/index.js'
import { HOST_REQUIREMENTS } from './host-requirements.js'

export { createCrystalFacade } from './facade.js'
export { createCrystalTools } from './tools.js'
export { createTeachTools } from './teach-tools.js'
export { createCompareTools } from './compare-tools.js'
export {
  VOCAB, LAYER_PROPS, LAYER_LABELS, LAYER_NOTES, VIEW_DIRECTIONS, VIEW_LABELS, VIEW_NOTES,
  CELL_MODES, CELL_MODE_NOTES, APPEARANCE_RANGES,
  validate, listActions, labels as actionLabels,
} from './actions.js'

/**
 * 装配本模块，交给统一壳使用。
 *
 * ★ 返回的是一个**完整模块包**：壳拿到它就能装配智能体，不必了解晶体模块的内部结构。
 *   其中 `validate` 已绑定好 crystalIds —— 因为壳的分镜引擎调用的是 `validate(name, params)`
 *   两参形式，而"id 必须真实存在"这条校验需要知道有哪些合法 id。
 *
 * @param {Object} opts
 * @param {Object} opts.view     ViewerCanvas 实例（或同接口替身）—— **必需**，缺则抛错
 * @param {Array}  opts.catalog  晶体索引（crystalIndex）—— **必需**，缺则任何 id 都判为"未知"
 * @param {Function} opts.loadData (id) => 晶体数据对象 —— **必需**（tools.js 构造时即要求）
 * @param {Object} [opts.quiz]   createQuizEngine 的返回值。给了它才会挂上 teach 类工具
 *                               （出题/判分/诊断/学情）；不给则模块只有 query 类工具。
 * @param {Object} [opts.compute] 确定性计算（**必须是 tools.js 那一批**，见下）
 * @param {Object} [opts.mastery] 掌握度模型（费曼复述评估与推荐要用）
 * @param {Object} [opts.skills]  技能目录（同上）
 * @param {Function} [opts.practiceGuard] () => Set<图层名>：练习未作答时不许打开的图层
 * @returns {{id, title, facade, defs, handlers, validate, vocabulary, catalog, settings,
 *            roleHint, hostReport}}
 *          其中 `hostReport` 是装配期"宿主给了什么/少了什么"的实测报告
 *          （{ok, missing, present, degraded}）——壳用它把降级如实报出来
 */
export function createModule(opts = {}) {
  // ★ 第一件事：核对宿主给够了没有。必需项缺失**直接抛错**（不启动），
  //   可选缺失则记进 hostReport.degraded 交给壳去报——见 host-requirements.js。
  //   放在最前面，是为了让报错指名道姓地说"模块 crystal 的宿主缺 X"，
  //   而不是等 facade 构造时才抛出"需要 opts.view"（那只说了缺一个键、不说还缺别的）。
  // ★ 装配期核对"宿主给够了没有"。**过一遍 trDeep**：degraded 的说明文字会经
  //   壳显示给用户，而它在装配那一刻才被读出来——放过它就会在英文界面里留中文。
  const hostReport = trDeep(enforceHostRequirements('crystal', opts, HOST_REQUIREMENTS))
  const catalog = opts.catalog || []
  const facade = createCrystalFacade(opts)
  const tools = createCrystalTools({ facade, loadData: opts.loadData, catalog })
  const crystalIds = new Set(catalog.map((c) => c.id))

  // ★ teach 类工具（出题/判分/诊断/学情）由 quiz 引擎提供实现。
  //   未注入 quiz 时保持为空数组——**如实为空**，而不是塞一批"尚未实现"的占位工具
  //   （把没实现的工具交给模型，它只会反复调用然后拿到错误）。
  const teach = opts.quiz
    ? createTeachTools({
      quiz: opts.quiz,
      facade,
      // 掌握度模型与技能目录：费曼复述与推荐要用
      // （缺省时对应工具会如实回"未接入"，而不是给一个假结果）
      mastery: opts.mastery,
      skills: opts.skills,
    })
    : { defs: { teach: [] }, handlers: {} }

  // ★ 双晶体对比（数据层）。需要 compute 才能做数值对照——而 compute 必须是
  //   tools.js 那一批（密度里有 Z 陷阱守卫，另写一份就会丢）。
  const cmp = opts.compute
    ? createCompareTools({ facade, loadData: opts.loadData, compute: opts.compute })
    : { defs: { query: [] }, handlers: {} }

  /** 合并 read/query/hand/teach 四类（facade 已在上面绑定） */
  const mergeByClass = (cls) => [].concat(
    (tools.defs[cls] || []),
    (teach.defs[cls] || []),
    (cmp.defs[cls] || []),
  )
  const defs = {
    read: mergeByClass('read'),
    query: mergeByClass('query'),
    hand: mergeByClass('hand'),
    teach: mergeByClass('teach'),
  }
  const handlers = Object.assign({}, tools.handlers, teach.handlers, cmp.handlers)

  /**
   * 把工具结果里的中文文案换成当前语言。
   *
   * ★ 为什么要在**这一层**兜：工具结果是**发给模型**的（也有一部分被面板原样显示），
   *   它们不在 DOM 文本节点上，`sweep()` 够不着；而逐条改成 `t()` 意味着每个 handler
   *   的每个返回字段都要改一遍——那种"逐处修"正是会漏的类型（漏了不报错，
   *   只是英文界面里夹着中文）。
   *   放在模块边界上一次做完，新增 handler 自动被覆盖。
   * ★ `trDeep` 只替换**登记过**的原文（查不到的原样返回），所以工具返回的**数据**
   *   （晶胞参数、元素符号、晶体数据里的字段）不会被误伤。
   */
  function wrapByLang(fn) {
    return function wrapped(...args) {
      const r = fn.apply(this, args)
      if (r && typeof r.then === 'function') return r.then((v) => trDeep(v))
      return trDeep(r)
    }
  }
  const handlersI18n = {}
  for (const [name, fn] of Object.entries(handlers)) {
    handlersI18n[name] = typeof fn === 'function' ? wrapByLang(fn) : fn
  }

  /**
   * 工具定义（schema）里的 description 同样是给模型看的文案。
   *
   * ★ 用 getter：工具注册表**每次重建**（切模块、切节点）都会读一次 `defs`，
   *   在这里过语言，切到英文后新注册的那一份就是英文；若在装配时定死，切语言
   *   只会换掉界面，模型看到的描述仍停在旧语言（不报错，只是不一致）。
   */
  const defsRaw = {
    read: mergeByClass('read'),
    query: mergeByClass('query'),
    hand: mergeByClass('hand'),
    teach: mergeByClass('teach'),
  }

  return {
    id: 'crystal',
    /**
     * 模块名。★ 用 **getter** 而不是字面量：壳会把它塞进「已切到「X」模块」这类
     * 句子里（`t('shell.panel.switched', { title: mod.title })`），若在装配那一刻
     * 定死，切语言后句子里的模块名会留在旧语言。
     */
    get title() { return t('crystal.title') },
    facade,
    get defs() { return trDeep(defsRaw) },
    handlers: handlersI18n,
    /** 装配期实测的「宿主给了什么 / 少了什么」（壳据此报出降级，测试据此做断言） */
    hostReport,
    /**
     * **角色映射**：把"节点想要的意图"绑到"本模块实际的工具名"。
     *
     * ★ 为什么需要它：节点白名单原先直接写工具名，而那些名字是**各模块不同**的
     *   （晶体 `generateQuiz` vs 轨道 `generateQuestion`）。写死一个名字，
     *   另一个模块在那些节点上就**静默地**拿不到工具——不报错、不崩、自检也绿
     *   （自检用的是所有模块工具的并集）。
     *   改成角色后，中枢不必知道任何模块的工具名，加第四个模块也不用改 `constraints.js`。
     *
     * ★ 没声明的角色 = 本模块**没有**这个能力（如 crystal 没有 explainConcept），
     *   这是如实为空，不是遗漏。覆盖缺口由 selftest 的 KNOWN_ROLE_GAPS 双向棘轮守着。
     */
    roles: {
      quizGen: 'generateQuiz',
      diagnose: 'diagnoseError',
      answerCheck: 'checkAnswer',
      variant: 'generateVariant',
      feynmanStart: 'startFeynmanCheck',
      feynmanEval: 'evaluateFeynman',
      recommend: 'recommendNext',
      learningEvent: 'recordLearningEvent',
    },
    /**
     * 已绑定 id 校验的动作校验（壳的分镜引擎逐调用它）。
     *
     * ★ `currentCrystalId` 必须与 facade 内部那次调用**传得一致**——
     *   两处用的是同一个 `validate()`，但上下文各自拼装。少传一个字段不会报错，
     *   只会让某条校验规则在一处生效、在另一处失效（openCompareView 的
     *   "与自己对比"就是这么第一次漏掉的：facade 里拦住了，模块包暴露的入口没拦）。
     */
    validate: (name, params) => trDeep(rawValidate(name, params, {
      crystalIds,
      currentCrystalId: (opts.view && opts.view.getProps && opts.view.getProps().crystalId) || '',
    })),
    /** 动作词汇表（壳用它标注 animated/concept，并按需 listSceneActions 暴露给模型） */
    vocabulary: VOCAB,
    /** 动作名 → 短标签（面板的动作气泡用；不该在应用入口里硬编码） */
    actionLabels: actionLabels(),
    /**
     * 模块的设置项（声明式，可直接喂 ui-kit 的 settings-popup）。
     * ★ 两段拼起来：`facade.settings` 是"影响三维视图的参数"（原子缩放/键粗细/
     *   透明度/晶胞显示），`visualSettings()` 是"配色"（背景/线框/空隙/点阵点… +
     *   逐元素颜色）。分开是因为后者外挂到模块自己的 localStorage，
     *   而前者走宿主的设置通路——两者的真源不同，混在一处会看不清谁存到哪。
     */
    settings: [].concat(facade.settings || [], visualSettings()),
    /** 模块的提示词片段（人格 + 领域约定） */
    /**
     * 面板空态的开场白（**由模块提供**，见 apps/web/src/main.js 的 greeting）。
     *
     * ★ 为什么放在模块里而不是壳里：这段文字一多半是"我能为你做什么"的**示例问题**，
     *   而每个模块的示例天然不同。写在壳里就会出现"在原子轨道页上被建议去问 NaCl 密度"
     *   ——本轮用户报的"智能体打开时的提示词全是晶体的"就是这个。
     *   与 roleHint 同一套思路：模块自己的话由模块说。
     */
    greeting: [
      // ★ 不再自称「我是结构化学教学智能体 · 晶体结构」——身份由**宿主**统一给出
      //   （见 main.js 的 greeting：一个智能体覆盖三个板块）。模块只负责"自己的示例问题"。
      '我能感知你此刻在看哪个晶体，也能动手把话演示出来。<br><br>',
      '试试：<br>',
      '· 「NaCl 的密度是多少」<br>',
      '· 「打开八面体空隙，让我数一数」<br>',
      '· 「为什么 CsCl 是简单立方而不是体心立方」',
    ].join(''),
    roleHint: ROLE_HINT_LINES.map(tr).join('\n'),
    catalog,
  }
}

/**
 * 领域守则（**给模型**，不进 DOM）。
 *
 * ★ 逐行一个字符串、而不是拼成一个大字符串：切语言时要按当前语言**逐行**取译文
 *   （`map(tr)`，tr 是惰性的，见 i18n-live.js）。原文登记在 i18n.js 的 `text` 表。
 * ★ 每行必须是**单一字面量**：tr 是按"整段原文"查表的，跨 `+` 拼接的两截
 *   单独登记会查不到（原文对不上），而这一点不会报错、只会静默回退中文。
 * ★ 用 getter 暴露：`buildSystem()` 每轮都读一次，切语言后下一轮即是新语言。
 */
const ROLE_HINT_LINES = [
  '你正在使用**晶体结构**模块。你的讲解必须落到画面上——只用文字描述结构，等于没讲。',
  '晶体有晶体学轴，"沿 a 轴看""从 [111] 方向看"是教学语言的一部分，请用 setView 配合。',
  '涉及配位数、空隙数、晶胞参数、密度等一切数值，必须用 queryCrystal 取得，**不要口算**。',
  '',
  '★ 下面几条是**给你自己的操作守则**——照着做，但**不要原样念给学生**；对学生要用大白话（括号里是给学生的示范说法，可参照、不必照抄）。',
  '',
  '· 图层之间有依赖，开了一个可能挡住另一个：打开「点阵点」会**隐藏原子球**。讲完点阵要继续讲原子排布时，先把它关掉。（对学生："我们先把点阵点收起来，好看清楚原子。"）',
  '· 「空隙总开关」关掉后，八面体/四面体两类空隙都会不见。',
  '· 空隙只有**最密堆积**才有数据：要讲空隙就先 loadCrystal 换到 fcc（Cu 型）或 hcp（Mg 型）；在 NaCl、CsCl 这类离子上打开空隙图层，什么也不会出现。（对学生："NaCl 的离子不是最密堆积，我们换到 Cu 来看它的空隙。"）',
  '· 数配位之前，先让"要数的那个离子"落到画面**中心**。CsCl 有两种等价画法，默认中心是 Cl⁻——若你要讲 Cs⁺ 的配位，先用 setEquivalentOrigin 把 Cs⁺ 换到体心，否则学生数出来的是 Cl⁻ 的配位。（对学生："我们把 Cs⁺ 放到中间，这样数它周围有几个 Cl⁻ 就一目了然。"）',
  '· 每一步只让画面上留下这一步需要的东西，用完的图层就撤掉。',
  '',
  '（图层清单见 listSceneActions 的 layerNotes；晶胞原点选项见 getCrystalDetail 的 equivalentSettings。）',
  '点阵型式、空间群这类字段请用 getCrystalDetail 取数据原文；若学生问的晶体不在库中，先 listCrystals 取合法 id。',
]

/** 模块自述（供 registry 与壳展示） */
export const MODULE_INFO = {
  id: 'crystal',
  get title() { return t('crystal.title') },
  /** 动作词汇表按需提供（不进常驻上下文） */
  vocabularySize: listActions().length,
}

export default createModule
