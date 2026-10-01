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
// ★ 字典必须被**真的 import**（副作用注册），否则守卫会绿而界面照旧中文——
//   扫描替换 `sweep()` 只认"已经注册过译文"的原文，没注册就一个字都不换。
//   放在这一行（其它 import 之前）是刻意的：本文件与 façade 都在模块求值阶段
//   用 t()，字典晚一步注册就会把键名当成文案。
import './i18n.js'
import { t } from '../../packages/i18n/index.js'
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
    /** 模块标题：取值器，理由见 facade.js 里同名的那一段 */
    get title() { return t('orbit.title') },
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
    /**
     * 面板空态的开场白（模块自己提供，理由见 crystal 模块里那段说明）。
     * ★ 取值器：这段 HTML 会被面板插进空态，里面的中文由 `text` 表扫描替换 ——
     *   而如果它被冻在装配时的语言上，切过语言之后再建面板就会退回旧语言。
     *   改成取值器之后每次读取都是当前语言。
     */
    get greeting() {
      return [
        '<b>我是结构化学教学智能体 · 原子轨道</b><br>',
        '我能读出当前的量子数与画法，也能把轨道摆到你面前。<br><br>',
        '试试：<br>',
        '· 「4p 有几个径向节面，各在多少 a₀」<br>',
        '· 「把 m 改成 1，切到复函数」<br>',
        '· 「sp³ 的四个轨道为什么指向正四面体」',
      ].join('')
    },
    /**
     * 系统提示词片段。
     * ★ 取值器：`buildSystem()` 每一轮都会读它，冻成常量的话切了语言之后
     *   模型收到的仍是旧语言的模块约定（而这不报错）。
     */
    get roleHint() { return t('orbit.roleHint') },
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
  /** 取值器：门户卡片与「进入{title}」都在渲染时现取 */
  get title() { return t('orbit.title') },
  /** 动作词汇表按需提供（不进常驻上下文） */
  vocabularySize: listActions().length,
}

export default createModule
