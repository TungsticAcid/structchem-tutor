/**
 * crystal.js — 晶体结构模块描述
 *
 * 这是「大模块」的样板：完整的数据集（23 种晶体）、3D 渲染、出题引擎、专属教学法。
 * 小模块的样子见 _template-lite.js。
 *
 * ★ 工具声明的约定（B5 对账后确立，三份 descriptor 一致）：
 *   · `tools`        —— **已实现**的工具，必须可核对。
 *   · `plannedTools` —— 设计上需要、但尚未实现的工具，不参与节点白名单解析。
 *
 *   ⚠️ 本模块的智能体**尚未开始编码**（projects/crystal/H5/ 下没有任何 agent 代码），
 *      故 `tools` 为空——这是如实声明，不是遗漏。下方 12 个工具全部在 plannedTools。
 *      清单来自重构计划阶段 B6/C；`loadKnowledge`/`loadSkill` 由核心提供，无需声明。
 */
// ★ 路由关键词是**数据**，不是界面文案：`routeByText()` 拿它做子串匹配。
//   翻译它没有意义（英文用户不会打出中文关键词），正确做法是**中英并列**——
//   两语清单都存在 `packages/agent-core/i18n.js` 的 `keywords` 表里，这里取出来用。
import { keywords } from '../../i18n.js'
import { t } from '../../../i18n/index.js'

/** 取一条双语关键词（`|` 分隔；见 i18n.js 的 keywords 表） */
const kw = (key) => String(keywords[key] || '').split('|').filter(Boolean)

export default {
  id: 'crystal',
  // ★ 模块名走 `text` 表（它会作为**文本节点**渲染在门户首页的模块卡上）。
  //   刻意**不**在 descriptor 里调 t()：`registerModule()` 会对 descriptor 做
  //   展开赋值，访问器在那里就被求值冻住了，之后换语言不会更新。
  // ★ 名字取自参赛配图（见 orbit.js 的同一段说明）。
  title: '晶典在线',
  scale: 'full',
  /** 授课次序（见 orbit.js 里对该字段的完整说明）。晶体结构排在分子对称性之后。 */
  teachingOrder: 3,
  // 现状指向模块独立页；统一壳建成后改为壳内模块入口（B6）
  entry: '#/crystal',   // 统一壳里的路由（旧值 projects/crystal/H5/index.html 是独立页）

  // ★ 路由依据：中枢凭这张表把用户问题分派过来
  //   （中英关键词并集；不含中文的专名直接写在这里——任何语言下都该匹配）
  capabilities: {
    structures: kw('agent.kw.crystal.structures').concat(['NaCl', 'CsCl', 'CPK']),
    symmetryInCrystal: kw('agent.kw.crystal.symmetryInCrystal'),
    structureProperty: kw('agent.kw.crystal.structureProperty'),
  },

  knowledge: 'crystal',          // packages/knowledge/crystal/（44 条已写好：c1–c8）
  skills: 'crystal',             // packages/skills/crystal/

  // ★ 已实现（2026-09-24）：模块门面与工具层已建好，见 modules/crystal/
  //   （facade.js 实现模块契约、tools.js 提供工具定义与执行、actions.js 是动作词汇表）。
  //   由 modules/crystal/tools/test-crystal-tools.mjs 对账：这里声明的名字必须都在
  //   tools.js 的 names() 里。
  // ★ 只列**模块专属**工具。getSnapshot / listSceneActions / applySceneActions
  //   语义与模块无关，由中枢提供一次并分派给当前激活模块
  //   （见 nodes/constraints.js 的 CORE_TOOLS 与 packages/agent-core/app.js）。
  //   模块通过 facade 暴露这些能力，但不必也不该重复注册同名工具——
  //   重复注册会让模块版覆盖中枢版，而模块版通常只做校验、忘了入队，
  //   于是"动作立刻执行、没有分镜队列"，逐步播放与快照回退全失效。
  tools: {
    read: [],
    query: ['listCrystals', 'getCrystalDetail', 'queryCrystal', 'compareCrystals'],
    hand: [],
    /**
     * teach 类由**注入的出题引擎**提供实现（见 modules/crystal/teach-tools.js
     * 的 `if (opts.quiz)`）。★ 它们在前端壳里是**真的挂着**的：
     * apps/web 向 createCrystalModule 注入了 quiz / mastery / skills。
     * 缺注入时对应的那几个会如实为空——而声明必须与"注入了什么"一致，
     * 自检 ⑤-3 会从**模块实现**反向核对（不再靠手抄）。
     */
    teach: ['generateQuiz', 'checkAnswer', 'diagnoseError', 'recordLearningEvent',
            'generateVariant', 'startFeynmanCheck', 'evaluateFeynman', 'recommendNext'],
  },

  /**
   * 计划中（未实现，不参与白名单解析）。
   *
   * ★ 本清单此前严重失实（2026-10-01 修正）：把 8 个**已经实现**的 teach 工具
   *   连同 compareCrystals 一直列在这里自称"尚未实现"，另外三个名字的**类别搞错了**：
   *     · `navigateTo`       —— 是**中枢提供的工具**（见 app.js 的 createShellTools），
   *                             按本文件第 40 行的约定，中枢工具不该出现在这里
   *     · `highlightAtoms`   —— 是**动作**（在 modules/crystal/actions.js 的 VOCAB 里），
   *     · `openCompareView`    经中枢工具 `applySceneActions` 下发即可，不需要同名工具
   *   附带的那段注释"渲染层没有高亮能力"也已过时：底座同步后
   *   viewer-canvas.js 已有 `_applyHighlight()`。留在这里会让人以为功能缺失，而它并没有。
   */
  plannedTools: {
    read: ['getInteractionTrace'],
    query: ['searchCrystals'],
    hand: [],
    teach: [],
  },

  // 模块专属决策节点
  extraNodes: {
    get compare() { return { note: t('agent.descriptor.crystal.compareNote') } },
  },

  // 模块贡献的主动介入规则
  //
  // ★ 字段名有一条**静默失效**的老路，务必对着实参写：
  //   规则的签名是 `check(trace, state)`，其中
  //     · trace = 感知层的 getTrace() → { idleMs, toggleCounts, dwellMs, recentActions }
  //     · state = 模块 facade 的**快照**（不是整个感知快照）→ crystal 这里是
  //               { module, crystal, layersOn, … }，**没有** `crystalId` 这个字段
  //   本文件此前两处都对不上（用了 `state.crystalId`、`trace.actionCount`、
  //   `trace.layerToggleCounts`），后果是**两条规则永远不触发**——
  //   不报错、不告警，主动介入整个功能静默死掉。这正是本仓库反复记过的
  //   "字段名对不上不报错，只是功能没了"那一类。
  //   改字段名之前，先看 facade 的 getSnapshot() 实际返回什么。
  //
  // ★ `suggest[0]` 的形状是 `{ text, actions }`：proactive.js 里
  //   `if (!s || !s.text) { … continue }`——没有 text 的建议会被**静默丢弃**。
  //   `actions` 里写的是**动作名与参数**（不是工具调用），由分镜队列执行。
  proactiveRules: [
    {
      id: 'crystal-idle-structure',
      get desc() { return t('agent.descriptor.crystal.ruleIdle') },
      check: (trace, state) => !!(state && state.crystal && state.crystal.id)
        && (trace.idleMs || 0) > 45000 && ((trace.recentActions || []).length < 3),
      suggest: [
        {
          // ★ 这条会作为**主动提示卡**显示给学生（也进模型上下文），故走 t()
          get text() { return t('agent.descriptor.crystal.suggestInterstices') },
          actions: [
            { action: 'setLayer', params: { layer: 'interstices', visible: true } },
            { action: 'setLayer', params: { layer: 'octahedral', visible: true } },
          ],
        },
      ],
    },
    {
      id: 'crystal-layer-fiddling',
      get desc() { return t('agent.descriptor.crystal.ruleLayer') },
      check: (trace) => Object.values((trace && trace.toggleCounts) || {}).some((n) => n >= 3),
      suggest: [],
    },
  ],
};
