/**
 * crystal.js — 晶体结构模块描述
 *
 * 这是「大模块」的样板：完整的数据集、3D 渲染、出题引擎、专属教学法。
 * 小模块的样子见 _template-lite.js。
 */
export default {
  id: 'crystal',
  title: '晶体结构',
  scale: 'full',
  entry: 'projects/crystal/H5/index.html',

  // ★ 路由依据：中枢凭这张表把用户问题分派过来
  capabilities: {
    structures: ['晶体', '晶胞', '点阵', '堆积', '配位', '空隙', '空间群', '晶格',
                 'NaCl', 'CsCl', '金刚石', '石墨', '干冰', '石英', '钙钛矿',
                 '面心立方', '体心立方', '六方最密', '密堆积', '球棍模型', 'CPK'],
    symmetryInCrystal: ['对称元素', '旋转轴', '镜面', '等效点系', '布拉维'],
    structureProperty: ['同素异形体', '结构决定性质'],
  },

  knowledge: 'crystal',          // packages/knowledge/crystal/
  skills: 'crystal',             // packages/skills/crystal/

  // 本模块贡献的工具（权限由 nodes/constraints.js 裁决，模块无权自行放行）
  tools: {
    read: ['getSceneSnapshot', 'getInteractionTrace'],
    query: ['searchCrystals', 'getCrystalDetail', 'compareCrystals', 'queryCrystal'],
    hand: ['applySceneActions', 'highlightAtoms', 'navigateTo', 'openCompareView'],
    teach: ['generateQuiz', 'checkAnswer', 'diagnoseError', 'recordLearningEvent'],
  },

  // 模块专属决策节点
  extraNodes: {
    compare: { note: '使用通用 compare 节点，此处仅登记本模块的对象类型为 crystalId' },
  },

  // 模块贡献的主动介入规则
  proactiveRules: [
    {
      id: 'crystal-idle-structure',
      desc: '在同一晶体上停留较久且无操作 → 建议打开空隙图层',
      check: (trace, state) => state.crystalId && trace.idleMs > 45000 && trace.actionCount < 3,
      suggest: [
        { action: 'applySceneActions', params: { actions: [
          { action: 'toggleLayer', params: { layer: 'interstices' },
            speech: '最密堆积结构里空隙分布容易记混，打开看看。' },
        ] } },
      ],
    },
    {
      id: 'crystal-layer-fiddling',
      desc: '反复开关同一图层 → 解释该图层的晶体学含义',
      check: (trace) => Object.values(trace.layerToggleCounts || {}).some((n) => n >= 3),
      suggest: [],
    },
  ],
};
