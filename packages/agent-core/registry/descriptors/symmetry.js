/**
 * symmetry.js — 分子对称性模块描述（既有实现，尚无智能体）
 *
 * ★ 本模块目前没有智能体代码（projects/symmetry/ 下无 agent 目录），
 *   是三个模块中最需要新建的一个。它的知识域与 crystal 在"对称性"上重叠，
 *   是总知识库 shared 应优先建设的原因。
 */
export default {
  id: 'symmetry',
  title: '分子对称性',
  scale: 'full',
  entry: 'projects/symmetry/H5/index.html',

  capabilities: {
    pointGroup: ['点群', '对称操作', '对称元素', '对称轴', '镜面', '反演中心',
                 '旋转轴', '映轴', 'C2v', 'D3h', 'Td', 'Oh', '特征标表'],
    symmetryOps: ['恒等', '旋转', '反映', '反演', '旋转反映'],
    applications: ['红外活性', '拉曼活性', '手性', '偶极矩', '分子振动'],
  },

  knowledge: 'symmetry',
  skills: 'symmetry',

  tools: {
    read: [],
    query: ['loadKnowledge', 'loadSkill'],
    hand: [],
    teach: [],
  },
};
