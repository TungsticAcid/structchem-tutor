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
export default {
  id: 'orbit',
  title: '原子轨道',
  scale: 'full',
  // 现状指向模块独立页；统一壳建成后改为壳内模块入口（B6）
  entry: 'projects/orbit/H5/index.html',

  capabilities: {
    orbitals: ['原子轨道', '波函数', '量子数', '径向分布', '角度分布', '节面', '节点',
               '球谐', '相位', '杂化', 'sp', 'sp2', 'sp3', '叠加态',
               '1s', '2p', '3d', '电子云', '概率密度'],
    symmetryInOrbital: ['轨道的对称性', '轴对称', '相位缠绕'],
    quantum: ['能级', '简并', '力学量', '期望值', '维里定理'],
  },

  knowledge: 'orbit',
  skills: 'orbit',

  // 已实现：只列**模块专属**工具。
  // ★ getSnapshot / listSceneActions / applySceneActions 不在其中——它们语义与模块
  //   无关，已归中枢提供（CORE_TOOLS + packages/agent-core/app.js）。
  //   orbit 的 tool-registry 里仍有这三个的实现，那是它作为独立应用时的历史遗留；
  //   阶段 B4 去全局化时不再迁移它们，只把 queryOrbital 等专属工具接过来。
  tools: {
    read: [],
    query: ['queryOrbital'],
    hand: [],
    teach: ['explainConcept', 'generateQuestion', 'diagnoseError', 'generateVariant',
            'startFeynmanCheck', 'evaluateFeynman', 'updateMastery', 'recommendNext'],
  },

  proactiveRules: [
    {
      id: 'orbit-m-fiddling',
      desc: '反复调 m 却没切过实/复模式 → 主动解释两者差别',
      check: (trace, state) =>
        (trace.toggleCounts?.setM || 0) >= 6 &&
        (trace.toggleCounts?.setWavefunctionMode || 0) === 0 &&
        state.wavefunction === 'real',
      suggest: [],
    },
  ],
};
