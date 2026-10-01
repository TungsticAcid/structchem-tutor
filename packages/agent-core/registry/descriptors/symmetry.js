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
  /** 授课次序（见 orbit.js 里对该字段的完整说明）。分子对称性排在原子结构之后。 */
  teachingOrder: 2,
  // 现状指向模块独立页；统一壳建成后改为壳内模块入口（B6）
  entry: '#/symmetry',  // 统一壳里的路由（旧值 projects/symmetry/H5/index.html 是独立页）

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

  // ★ 已实现（2026-10-01 修正）：此前这里是空的、而 queryPointGroup 被列在 plannedTools 里，
  //   声称"模块无智能体代码"——其实 modules/symmetry/ 的门面与工具层早已建好，
  //   只是没有人从**实现**这一侧反查过（自检 ⑤-3 当时只覆盖 orbit，现已推广到三个模块）。
  //   只列**模块专属**工具；getSnapshot / applySceneActions 等由中枢提供，见本文件上方 crystal.js 的说明。
  tools: {
    read: [],
    query: ['listExamples', 'queryPointGroup'],
    hand: [],
    teach: [],
  },

  /**
   * 计划中（阶段 C：动作词汇表扩展 + P4 计算 + 出题判分，见重构计划）。
   *
   * ★ 三个名字的**类别**要分清（此前混在一起，读起来像是"少做了三件事"）：
   *   · `getSnapshot`      —— 是**中枢提供的工具**（app.js 的 createShellTools），
   *                           任何模块都调得到，不属于"本模块待做"
   *   · `applySceneActions`—— 同上，中枢工具。本模块真正缺的不是它，
   *                           而是**更多动作**（下面 hand 那条）
   *   · `highlightAtoms`   —— 是晶体的**动作名**，不是工具名。对称性若要高亮原子，
   *                           要做的是在自己的 actions 里加这样一个动作
   */
  plannedTools: {
    read: [],
    query: ['getCharacterTable', 'detectPointGroup'],
    /**
     * ★ 本模块的画面现在**动不了**，这是**实质缺陷**——但缺的不是"工具"而是**动作**：
     *   中枢工具 `applySceneActions` 早就在了，它按当前模块的**动作词汇表**下发；
     *   而对称性的词汇表里只有 `loadExample` 一项（见 modules/symmetry/facade.js 的 VOCAB）。
     *   于是页面上的对称元素显隐、对称操作动画、原子选中，模型一个都驱动不了。
     *   阶段 C 的关键路径就是扩这张表。把它写成 plannedTools 会误导——
     *   照着去做会去新加工具，而正确的动作是加动作。
     */
    hand: [],
    teach: ['generateQuiz', 'checkAnswer', 'diagnoseError'],
  },
};
