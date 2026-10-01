/**
 * orbit.js — 原子轨道模块描述
 *
 * 本模块的智能体已在 projects/orbit/H5/js/agent/ 下完整实现（18 个文件、约 5600 行），
 * 是三个模块中唯一有可用智能体的。接入时的主要工作是把它的 scene-bridge 与
 * question-engine 适配到共享核心的接口（见重构计划 B1 已完成的部分与 B4）。
 *
 * ★ 工具声明的约定（B5 对账后确立，三份 descriptor 一致）：
 *   · `tools`        —— **已实现**的工具，必须是可核对的。已完成对账：
 *                       14 个名字逐一取自 projects/orbit/H5/js/agent/tool-registry.js
 *                       的 ToolRegistry.names()，并在 tools/test-core.mjs 里由
 *                       自动化用例守住（descriptor ⊆ 实际实现）。
 *   · `plannedTools` —— 设计上需要、但**尚未实现**的工具。不参与节点白名单解析
 *                       （把没实现的工具交给模型，它只会不断调用然后拿到"尚未实现"）。
 *
 *   `loadKnowledge` / `loadSkill` 不在此声明：它们由共享核心提供（CORE_TOOLS），
 *   对每个模块自动可用。
 */
// ★ 路由关键词是**数据**不是文案：中英并列表见 packages/agent-core/i18n.js 的 `keywords`。
import { keywords, zh as dictZh, en as dictEn } from '../../i18n.js'
import { t } from '../../../i18n/index.js'

/** 取一条双语关键词（`|` 分隔；见 i18n.js 的 keywords 表） */
const kw = (key) => String(keywords[key] || '').split('|').filter(Boolean)

/**
 * 感知痕迹 `toggleCounts` / `recentActions` 的键是**模块 facade 的 fieldLabels 的值**
 * （见 `modules/orbit/facade.js`），而那一份**现在也走 `t()`**，且 `fieldLabels` 是
 * **创建 facade 时求值**的 ⇒ 同一个字段的键可能是：
 *   ① 模块自己那份标签（本语言；`t('orbit.field.m')` 能取到，且自动跟随它的措辞）
 *   ② 上一种语言的标签（facade 建好之后用户换过语言）
 *   ③ 字段名本身（模块没给这个字段配标签时的兜底）
 * 三种都认，规则才不会因为换过语言而**静默失效**（不报错、规则永不触发）。
 * ★ 多认几个键只会让 `>= 阈值` 更容易命中、让 `=== 0` 更难命中，两个方向都是保守的。
 */
const traceKeys = (agentKey, fieldKey) => [
  t('orbit.field.' + fieldKey),        // 模块自己的标签；它的字典没注册时返回键名，匹配不上、无害
  dictZh[agentKey], dictEn[agentKey],
  fieldKey,
].filter(Boolean)
const countToggles = (trace, keys) => {
  const c = (trace && trace.toggleCounts) || {}
  return keys.reduce((n, k) => n + (c[k] || 0), 0)
}

export default {
  id: 'orbit',
  // ★ 模块名走 `text` 表（门户首页的模块卡把它当**文本节点**渲染），
  //   不在 descriptor 里调 t()：registerModule 的展开赋值会把访问器求值冻住。
  // ★ 名字取自参赛配图（`比赛配图-1.pptx` 第 1 页）：三门课 → 三个模块
  //   「轨道视界 / 点群观鉴 / 晶典在线」，与点群观鉴页的品牌名同一套口径。
  title: '轨道视界',
  scale: 'full',
  /**
   * 授课次序（1 = 最先讲）。
   *
   * ★ 为什么这个字段在这里、而不是宿主的展示层：
   *   "哪一章先讲"是**学科事实**，不是视觉偏好；而且它要被多处共用——
   *   首页的排列、接入的优先级、将来"模块清单"的展示都以它为准。
   *   放进宿主配置的话，加一个模块就要在"学科"与"界面"两处各写一遍。
   *
   * ★ 当前取值的依据（待按实际授课校正）：结构化学教材的通行章节顺序是
   *   量子力学基础 → **原子结构** → 双原子分子 → 分子对称性 →
   *   多原子分子 → 配合物 → 晶体结构。
   *   本仓库现有三个模块分别落在「原子结构 / 分子对称性 / 晶体结构」。
   *   ⚠️ 三本结构化学教材都是扫描件（无文字层、无 PDF 书签），目录读不出来——
   *   这是按学科常识定的**初始值**，改这一个数字即可校正，不需要动代码。
   */
  teachingOrder: 1,
  // 已接入统一壳：路由 `#/orbit`（apps/web 的 router）。
  // ★ 原值 `projects/orbit/H5/index.html` 指向的是**上游独立页**，不是本仓库的入口。
  //   orbit 接入后，壳里通过路由进入；那个独立页将来退役（重构计划 P0/P7）。
  entry: '#/orbit',

  // 中英关键词并集；不含中文的专名（sp/sp2/sp3、1s/2p/3d）直接写在这里
  capabilities: {
    orbitals: kw('agent.kw.orbit.orbitals')
      .concat(['sp', 'sp2', 'sp3', '1s', '2p', '3d']),
    symmetryInOrbital: kw('agent.kw.orbit.symmetryInOrbital'),
    quantum: kw('agent.kw.orbit.quantum'),
  },

  knowledge: 'orbit',
  skills: 'orbit',

  // 已实现：只列**模块专属**工具。
  // ★ getSnapshot / listSceneActions / applySceneActions 不在其中——它们语义与模块
  //   无关，已归中枢提供（CORE_TOOLS + packages/agent-core/app.js）。
  tools: {
    read: [],
    query: ['queryOrbital'],
    hand: [],
    /**
     * teach 类由**注入的引擎**提供实现（见 modules/orbit/tools.js 的 `if (quiz)` 等）。
     * ★ 它们在壳里是**真的挂着**的：宿主向 createOrbitModule 注入了出题引擎
     *   （core/question-engine.js）、错因诊断（core/error-diagnosis.js）、
     *   学情（store/mastery.js）与技能目录。缺任一项时对应那几个会**如实为空**，
     *   而下面的声明必须与"注入了什么"一致——自检 ⑤-3 会从**模块实现**反向核对。
     */
    teach: ['explainConcept', 'generateQuestion', 'diagnoseError', 'generateVariant',
            'startFeynmanCheck', 'evaluateFeynman', 'updateMastery', 'recommendNext'],
  },

  /**
   * 设计上需要、但**尚未实现**的工具（不参与节点白名单解析）。
   * 目前为空——orbit 的模块专属工具已全部落地到 modules/orbit/tools.js。
   */
  plannedTools: {
    teach: [],
  },

  proactiveRules: [
    {
      id: 'orbit-m-fiddling',
      get desc() { return t('agent.descriptor.orbit.ruleM') },
      /**
       * ★ 字段名要对着**感知层的实参**写（这是本仓库反复踩的一类静默失效）：
       *   `check(trace, state)` 里的 trace 是 `perception.getTrace()`，它的
       *   `toggleCounts` 以 **fieldLabels 的值**为键（见 modules/orbit/facade.js
       *   的 perception.fieldLabels），**不是动作名**。写 `setM` 会恒为 undefined——
       *   规则永不触发、不报错、功能整个是死的（晶体那两条就是这么坏掉的）。
       *   `state` 是**门面的快照**，字段名见 getSnapshot（wavefunction ✓）。
       *
       * ★ 键的**语言**不确定（见上面 `traceKeys` 的说明）：模块可能建在中文下、
       *   也可能建在英文下，用户还可能中途换过语言。故三种拼法都认；
       *   英文那两条与本文件字典里的 `agent.descriptor.orbit.toggle*` **必须与
       *   `modules/orbit/i18n.js` 的 `orbit.field.*` 保持一致**（措辞变了要同步）。
       */
      check: (trace, state) =>
        countToggles(trace, traceKeys('agent.descriptor.orbit.toggleM', 'm')) >= 6
        && countToggles(trace, traceKeys('agent.descriptor.orbit.toggleWavefunction', 'wavefunction')) === 0
        && state && state.wavefunction === 'real',
      suggest: [],
    },
  ],
};
