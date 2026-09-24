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
export default {
  id: 'crystal',
  title: '晶体结构',
  scale: 'full',
  // 现状指向模块独立页；统一壳建成后改为壳内模块入口（B6）
  entry: 'projects/crystal/H5/index.html',

  // ★ 路由依据：中枢凭这张表把用户问题分派过来
  capabilities: {
    structures: ['晶体', '晶胞', '点阵', '堆积', '配位', '空隙', '空间群', '晶格',
                 'NaCl', 'CsCl', '金刚石', '石墨', '干冰', '石英', '钙钛矿',
                 '面心立方', '体心立方', '六方最密', '密堆积', '球棍模型', 'CPK'],
    symmetryInCrystal: ['对称元素', '旋转轴', '镜面', '等效点系', '布拉维'],
    structureProperty: ['同素异形体', '结构决定性质'],
  },

  knowledge: 'crystal',          // packages/knowledge/crystal/（骨架已定，44 条待写）
  skills: 'crystal',             // packages/skills/crystal/

  // ★ 已实现（2026-09-24）：模块门面与工具层已建好，见 modules/crystal/
  //   （facade.js 实现模块契约、tools.js 提供工具定义与执行、actions.js 是动作词汇表）。
  //   由 modules/crystal/tools/test-crystal-tools.mjs 对账：这里声明的名字必须都在
  //   tools.js 的 names() 里。
  tools: {
    read: ['getSnapshot'],
    query: ['listCrystals', 'getCrystalDetail', 'queryCrystal', 'listSceneActions'],
    hand: ['applySceneActions'],
    teach: [],
  },

  // 计划中（未实现，不参与白名单解析）
  plannedTools: {
    read: ['getInteractionTrace'],
    query: ['searchCrystals', 'compareCrystals'],
    // ★ highlightAtoms 目前**无法实现**：crystal 的渲染层没有高亮能力
    //   （scene-builder 里只有轴的 emissive，没有按原子高亮）。要让 grade 节点的
    //   诊断动作可用，需先在渲染层加高亮能力——这是阶段 C 的一项。
    hand: ['highlightAtoms', 'navigateTo', 'openCompareView'],
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
