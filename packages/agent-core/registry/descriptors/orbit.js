/**
 * orbit.js — 原子轨道模块描述（既有实现，待接入）
 *
 * 本模块的智能体已在 projects/orbit/H5/js/agent/ 下完整实现，
 * 接入时主要工作是把它的 scene-bridge 与 question-engine 适配到共享核心的接口。
 */
export default {
  id: 'orbit',
  title: '原子轨道',
  scale: 'full',
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

  tools: {
    read: ['getSceneSnapshot', 'getInteractionTrace'],
    query: ['queryOrbital', 'loadKnowledge', 'loadSkill'],
    hand: ['applySceneActions'],
    teach: ['generateQuiz', 'checkAnswer', 'diagnoseError', 'evaluateExplanation'],
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
