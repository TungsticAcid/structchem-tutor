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
  const tools = createSymmetryTools(facade)

  return {
    id: 'symmetry',
    title: '分子对称性',
    facade,
    defs: tools.defs,
    handlers: tools.handlers,
    /** 装配期实测的「宿主给了什么 / 少了什么」 */
    hostReport,
    /**
     * **角色映射**：本模块目前是**空的** —— 它还没有出题/判卷/学情这些教学工具。
     *
     * ★ 空不等于遗漏：节点向本模块索要"出题"时拿不到，是如实反映"本模块还没有这个能力"。
     *   覆盖缺口由 selftest 的 `KNOWN_ROLE_GAPS` 双向棘轮显式记着（多了红、少了也红），
     *   所以它不会悄悄变成"一堆没人看的豁免"。
     */
    roles: {},
    /** 动作校验（壳的分镜引擎逐调用它）—— 取值域由 facade 里的 byId 把关 */
    validate: (name, params) => facade.validateAction(name, params),
    /** 动作词汇表 */
    vocabulary: facade.vocabulary(),
    /** 动作名 → 短标签（面板的动作气泡用） */
    actionLabels: facade.actionLabels(),
    /** 模块的提示词片段（人格 + 领域约定） */
    roleHint: [
      '你正在使用**分子对称性**模块。',
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
  title: '分子对称性',
}

export default createModule
