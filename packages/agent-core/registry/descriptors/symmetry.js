/**
 * symmetry.js — 分子对称性模块描述
 *
 * ★ 本模块当前状态（2026-09-24 实测）：
 *   · 引擎是**真实的高质量资产**：点群识别 46 个群、特征标表 44 个群，
 *     无 DOM 依赖、Node 可跑，且有断言 19 个分子的回归测试
 *     （projects/symmetry/H5/test/verify-logic.mjs，从小程序副本移来）。
 *   · 但**零智能体、零知识条目、零工具贡献**——接入成本高于另两个模块。
 *   · 它的知识域与 crystal 在"对称性"上重叠，是总知识库 shared 应优先建设的原因。
 *
 * ★ 工具声明的约定（B5 对账后确立，三份 descriptor 一致）：
 *   `tools` 只放**已实现**的工具；未实现的进 `plannedTools`，不参与白名单解析。
 *   故本模块 tools 为空——如实声明。
 *
 * ★ `plannedCapabilities`：`capabilities` 是路由依据（描述"该问我什么"），
 *   其中尚未实现的能力必须在此登记，以免被误认为已可用。对账时发现的偏差正是
 *   这里：`applications`（红外/拉曼活性、手性、偶极矩、分子振动）此前只有声明、
 *   没有任何代码。用户已确认红外与拉曼纳入范围（重构计划阶段 C 的 P4），故保留
 *   声明并在此登记为待实现。
 */
export default {
  id: 'symmetry',
  title: '分子对称性',
  scale: 'full',
  // 现状指向模块独立页；统一壳建成后改为壳内模块入口（B6）
  entry: 'projects/symmetry/H5/index.html',

  capabilities: {
    pointGroup: ['点群', '对称操作', '对称元素', '对称轴', '镜面', '反演中心',
                 '旋转轴', '映轴', 'C2v', 'D3h', 'Td', 'Oh', '特征标表'],
    symmetryOps: ['恒等', '旋转', '反映', '反演', '旋转反映'],
    applications: ['红外活性', '拉曼活性', '手性', '偶极矩', '分子振动'],
  },

  /** 已声明但尚未实现的能力（用于路由，但回答会失败）。补齐见重构计划阶段 C。 */
  plannedCapabilities: ['applications'],

  knowledge: 'symmetry',
  skills: 'symmetry',

  // 已实现：暂无（模块无智能体代码）
  tools: {},

  // 计划中（阶段 C：接口层 + P4 计算 + 出题判分，见重构计划）
  plannedTools: {
    read: ['getSnapshot'],
    query: ['queryPointGroup', 'getCharacterTable', 'detectPointGroup'],
    // ★ hand 目前为空是**实质缺陷**：本模块有最丰富的可视化（对称元素显隐、
    //   对称操作动画、原子高亮），却因为没做接口层而连自己的画面都动不了。
    //   阶段 C 的关键路径就是补这一层。
    hand: ['applySceneActions', 'highlightAtoms'],
    teach: ['generateQuiz', 'checkAnswer', 'diagnoseError'],
  },
};
