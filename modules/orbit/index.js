/**
 * index.js（orbit 模块）—— 原子轨道
 *
 * 这一层是「模块」在本仓库里的家：
 *   modules/orbit/
 *     core/     纯计算层（math / formula / sched / observables / error-diagnosis / perception-snapshot）
 *     render/   渲染与页面级 UI（render3d / charts / chart-overlay / layout / state-editor / reference-table）
 *     actions.js  动作词汇表与取值域
 *     facade.js   智能体门面（模块契约的实现）
 *     tools.js    模块专属工具
 *
 * ★ 本文件只做**纯逻辑**的再导出，不 import 任何视图实现——
 *   `render/` 那几个文件在浏览器里才能加载（render3d 要 three、layout 要 document），
 *   页面按需 import 它们，模块层不碰。因此本模块可以在 Node 里直接测试。
 *
 * ★ 与另两个模块的结构性差别：orbit 的运行时**由页面创建**（状态住在页面的闭包里，
 *   见 facade.js 的说明）。所以这里多一个 `attach/detach` 通路，而不是自己去 new 什么。
 */
import { createOrbitFacade } from './facade.js'
import { createOrbitTools } from './tools.js'
import { VOCAB, listActions, labels as actionLabels } from './actions.js'
// 装配期校验「宿主有没有给够」——本模块全是可选项（降级是设计好的），理由见该文件
import { enforceHostRequirements } from '../../packages/module-contract/index.js'
import { HOST_REQUIREMENTS } from './host-requirements.js'

export { createOrbitFacade } from './facade.js'
export { createOrbitTools } from './tools.js'
export { OM } from './core/math.js'
export { Formula } from './core/formula.js'
export { Observables } from './core/observables.js'
export { ErrorDiagnosis } from './core/error-diagnosis.js'
export { Perception } from './core/perception-snapshot.js'
export {
  VOCAB, ENUMS, RANGES, LABELS, validate, listActions, labels as actionLabels,
} from './actions.js'

/**
 * 装配本模块，交给统一壳使用。
 *
 * @param {Object} opts
 * @param {Object} [opts.quiz]      出题引擎（未给则教学类工具**如实为空**）
 * @param {Object} [opts.mastery]   掌握度模型
 * @param {Object} [opts.skills]    技能目录
 * @param {Object} [opts.diagnosis] 错因诊断（通常给 core/error-diagnosis.js 的实例）
 * @returns {{id, title, facade, defs, handlers, validate, vocabulary, actionLabels,
 *            roleHint, attach, detach, hostReport}}
 */
export function createModule(opts = {}) {
  // 本模块的宿主需求全是可选项（缺了只降级、不失败），所以这里恒不抛错；
  // 它的实际价值是把"少给的能力"记进 hostReport.degraded，让壳如实报出来。
  const hostReport = enforceHostRequirements('orbit', opts, HOST_REQUIREMENTS)
  const facade = createOrbitFacade(opts)
  const tools = createOrbitTools({
    facade,
    quiz: opts.quiz,
    mastery: opts.mastery,
    skills: opts.skills,
    diagnosis: opts.diagnosis,
  })

  return {
    id: 'orbit',
    title: '原子轨道',
    facade,
    defs: tools.defs,
    handlers: tools.handlers,
    /** 装配期实测的「宿主给了什么 / 少了什么」 */
    hostReport,
    /**
     * **角色映射**：见 modules/crystal/index.js 里那段说明。
     *
     * ★ 本模块的两个名字与晶体**不同**，这正是当初缺陷的来源：
     *   · 出题：orbit 叫 `generateQuestion`，晶体叫 `generateQuiz`
     *     → 白名单写死 `generateQuiz` 时，orbit 的出题节点**没有出题工具**。
     *   · 记学情：orbit 叫 `updateMastery`，晶体叫 `recordLearningEvent`
     *     → 白名单写死后者时，orbit 的学情**不落盘**（不报错）。
     *   两条都是"名字不同 → 静默失效"，改用角色后不会再发生。
     *
     * ★ 没有 `answerCheck`：orbit 没有判卷工具（如实不声明）。
     */
    roles: {
      quizGen: 'generateQuestion',
      explainConcept: 'explainConcept',
      diagnose: 'diagnoseError',
      variant: 'generateVariant',
      feynmanStart: 'startFeynmanCheck',
      feynmanEval: 'evaluateFeynman',
      recommend: 'recommendNext',
      learningEvent: 'updateMastery',
    },
    /** 动作校验（壳的分镜引擎逐调用它）—— 取值域由 actions.js 把关 */
    validate: (name, params) => facade.validate(name, params),
    /** 动作词汇表（壳用它标注 animated/concept，并按需 listSceneActions 暴露给模型） */
    vocabulary: VOCAB,
    /** 动作名 → 短标签（面板的动作气泡用） */
    actionLabels: actionLabels(),
    /** 模块的提示词片段（人格 + 领域约定） */
    /** 面板空态的开场白（模块自己提供，理由见 crystal 模块里那段说明）。 */
    greeting: [
      '<b>我是结构化学教学智能体 · 原子轨道</b><br>',
      '我能读出当前的量子数与画法，也能把轨道摆到你面前。<br><br>',
      '试试：<br>',
      '· 「4p 有几个径向节面，各在多少 a₀」<br>',
      '· 「把 m 改成 1，切到复函数」<br>',
      '· 「sp³ 的四个轨道为什么指向正四面体」',
    ].join(''),
    roleHint: [
      '你正在使用**原子轨道**模块。',
      '★ 一切数值（节点数、径向峰位、能级、简并度、力学量）**必须用 queryOrbital 取得**，',
      '  不要凭记忆或口算——"3d 有几个节面"你当然答得出，但"5g 的径向节点半径是多少"',
      '  正是本模块要解决的问题，而它与你的记忆不一致时，正确的一方永远是从结构算出来的那个。',
      '演示优先：能用 setQuantumNumbers / setIsosurfaceLevel / setSectionPlane 讲清楚的，',
      '  就不要只用文字描述。化学约定 **z 轴是量化轴**——讲角度节面时先说清这一点。',
      '讲实轨道与复轨道的区别时，切到球谐档（setViewTarget: spherical）；',
      '  讲"角度分布的 Y 与 Y² 差在哪"时用 setAngularView。',
      '★ 叠加态（setSuperposition）的教学要点是 |ψ|² 里的**干涉项**——它与"概率简单相加"的本质区别。',
      'id 必须来自工具返回值，不可编造。',
    ].join('\n'),
    /**
     * 页面挂载时把运行时交进来；卸载时交还。
     * ★ 暴露在模块包上（而不只是门面上）是为了让壳的装配代码一眼看到
     *   "这个模块需要页面来喂"——它与另两个模块的差别就在这里。
     */
    attach: (rt) => facade.attach(rt),
    detach: () => facade.detach(),
  }
}

/** 模块自述（供 registry 与壳展示） */
export const MODULE_INFO = {
  id: 'orbit',
  title: '原子轨道',
  /** 动作词汇表按需提供（不进常驻上下文） */
  vocabularySize: listActions().length,
}

export default createModule
