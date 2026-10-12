/**
 * modules/symmetry/index.js — 分子对称性模块
 *
 * 这一层是「模块」在本仓库里的家：
 *   modules/<模块id>/   模块实现：引擎 · 数据 · 动作词汇表 · 工具
 *
 * ★ 本文件只做**纯逻辑**的再导出，不 import 任何视图实现（three.js / DOM）——
 *   因此整个模块可以在 Node 里直接测试。这是本模块与晶体模块的一个结构性差别：
 *   晶体的动作全落在三维视图上，而对称性的核心能力（识别点群）**根本不需要视图**。
 */
import { createSymmetryFacade } from './facade.js'
import { createSymmetryTools } from './tools.js'
// ★ 必须**import 进来**，而不只是 re-export：`export { X } from '…'` 只把 X 转发出去，
//   不在本模块作用域里绑定名字——下面 createModule 里要用到它。
import { EXAMPLES } from './data/examples-index.js'
// 装配期校验「宿主有没有给够」——本模块的清单刻意为空，理由见该文件
import { enforceHostRequirements } from '../../packages/module-contract/index.js'
import { HOST_REQUIREMENTS } from './host-requirements.js'

export { createSymmetryFacade } from './facade.js'
export { createSymmetryTools } from './tools.js'
export { identifyPointGroup } from './engine/pointGroup.js'
export { EXAMPLES } from './data/examples-index.js'

/**
 * 装配本模块，交给统一壳使用。
 *
 * @param {Object} opts
 * @param {string}   [opts.initialId] 初始示例 id
 * @returns {{id, title, facade, defs, handlers, validate, vocabulary, actionLabels,
 *            roleHint, examples, hostReport}}
 *
 * ★ 此处原先还声明了一个 `[opts.onChange]`「状态变化回调（宿主用它驱动视图重绘）」——
 *   它是个**幽灵参数**：两处文档有声明，实现里零处读取，壳里零处传参。
 *   已删除，而不是"补上实现"：facade 已有 `subscribe`（并作为契约可选方法 `onAction`
 *   暴露），再开一条单槽位回调，只会把"后注册者静默顶掉先注册者"的老坑重演一遍。
 */
export function createModule(opts = {}) {
  // 本模块的宿主需求清单为空（它不依赖视图、动作全落在自己的状态上）——
  // 调用仍然保留：将来要向宿主索取什么，只有这一个地方可写。
  const hostReport = enforceHostRequirements('symmetry', opts, HOST_REQUIREMENTS)
  const facade = createSymmetryFacade(opts)
  /**
   * ★★ 2026-10-12（用户第 7 条）：把**出题引擎与学情模型**传进工具层 ——
   *   注入了才有 `generateQuestion / explainConcept / recommendNext / updateMastery`
   *   这四个教学工具；没注入就**如实为空**（与轨道同一套约定）。
   */
  const tools = createSymmetryTools(facade, { quiz: opts.quiz, mastery: opts.mastery })

  return {
    id: 'symmetry',
    title: '点群观鉴',
    facade,
    defs: tools.defs,
    handlers: tools.handlers,
    /** 装配期实测的「宿主给了什么 / 少了什么」 */
    hostReport,
    /**
     * **角色映射**（节点按角色名向模块要"干这件事的工具"）。
     *
     * ★★ 2026-10-12（用户第 7 条）：本模块补齐了**练习闭环**的四项角色；
     *   **费曼自检（feynmanStart / feynmanEval）还没有** —— 由 selftest 的
     *   `KNOWN_ROLE_GAPS` 双向棘轮显式记着（多了红、少了也红）。
     * ★ 这张表是**静态**的（与轨道一致）：它声明的是"模块在完整装配下能提供什么"，
     *   而装载后是否有真工具由 `createSymmetryTools(facade, {quiz, mastery})` 决定 ——
     *   **没注入 quiz 时那四个工具如实不存在**（模型拿到的是空清单，而不是调不动的名字）。
     *   之所以不能写成 `opts.quiz ? {...} : {}`：无头自检（selftest）不注入引擎，
     *   那样算出来的"能力缺口"会随装配方式漂移，棘轮就失去意义。
     */
    roles: {
      quizGen: 'generateQuestion',
      explainConcept: 'explainConcept',
      recommend: 'recommendNext',
      learningEvent: 'updateMastery',
    },
    /** 动作校验（壳的分镜引擎逐调用它）—— 取值域由 facade 里的 byId 把关 */
    validate: (name, params) => facade.validateAction(name, params),
    /** 动作词汇表 */
    vocabulary: facade.vocabulary(),
    /** 动作名 → 短标签（面板的动作气泡用） */
    actionLabels: facade.actionLabels(),
    /** 模块的提示词片段（人格 + 领域约定） */
    /** 面板空态的开场白（模块自己提供，理由见 crystal 模块里那段说明）。 */
    greeting: [
      '<b>我是结构化学教学智能体 · 点群观鉴</b><br>',
      '我能识别分子与晶体的点群、列出对称元素，也能把对称操作演出来。<br><br>',
      '试试：<br>',
      '· 「水分子是什么点群，有哪些对称元素」<br>',
      '· 「只显示主轴，然后播放这个对称操作」<br>',
      '· 「苯的 C₂′ 与 C₂″ 有什么区别」',
    ].join(''),
    roleHint: [
      '你正在使用**点群观鉴**模块。',
      '★ 点群符号与对称元素清单**一律用 queryPointGroup 取得**，不要凭记忆判断——',
      '  "水是 C2v"你当然记得，但"联苯是 D2h 还是 D2d"这类正是本模块要解决的问题，',
      '  而它与你的记忆不一致时，正确的一方永远是从结构算出来的那个。',
      '讲解时常与群论概念（对称元素、共轭类、不可约表示）配合；特征标表数据在知识库里。',
      'id 必须来自 listExamples 的返回值，不可编造。',
    ].join('\n'),
    /**
     * 示例的**完整数据**（含 structure 对象）。
     * ★ 为什么不放进 getSnapshot：快照每轮都被深拷贝做差分，把整个结构塞进去
     *   会让快照体积暴涨（而差分机制对每个变化字段都要记时长）。
     *   页面需要结构对象来建模，那属于"宿主直接读数据"，不走快照。
     */
    examples: EXAMPLES,
  }
}

/** 模块自述（供 registry 与壳展示） */
export const MODULE_INFO = {
  id: 'symmetry',
  title: '点群观鉴',
}

export default createModule
