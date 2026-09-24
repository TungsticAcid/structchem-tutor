/**
 * constraints.js — 决策节点约束规格表
 *
 * ★ 本文件是整个智能体的纪律中枢。核心思想：
 *
 *   每个决策节点的能力边界由「工具白名单」定义，而不是靠提示词劝说。
 *   工具在【注册阶段】就按节点过滤——模型看不到不允许的工具，结构上无法越权。
 *
 *   对比：
 *     ✗ 软约束：提示词里写「出题时请不要操控视图」→ 模型可能不遵守
 *     ✓ 硬约束：出题节点的工具列表里根本没有 applySceneActions → 做不到
 *
 *   凡是能用权限表达的约束，都不该用文字表达。
 *
 * 节点划分依据：一次完整的教学交互会经过哪些"决策点"。
 * 每个节点只做一件事，其输入、输出、工具、禁令都在此声明。
 */

// ============================================================================
// 工具分类
// ============================================================================

/**
 * 共享核心**实际提供**的工具，按类别分组。
 *
 * 这些工具由核心自己实现，因此对每个模块都可用，不需要模块声明。
 * 目前只有知识/技能目录的按需加载两项。
 *
 * ★ B5 对账（2026-09-24）修正的一处偏差——值得记住它的成因：
 *   此处原名 TOOL_CLASSES，列的是 `getSceneSnapshot` / `queryCrystal` /
 *   `generateQuiz` / `checkAnswer` 等一套**抽象能力名**，而它们在任何一个模块里
 *   都没有实现。后果是每个节点解析出的工具清单里都混着一批幽灵名字。
 *   自检之所以一直是绿的，是因为**它和 descriptor 犯了同一个错**：
 *   它断言「受限节点**不含**某名字」（幽灵名字当然也不含，断言成立）、
 *   「授权节点**含**某名字」（含的是幽灵名字，而非某模块真的实现了它）。
 *   测试与被测对象用同一批错名字，于是互相印证。
 *
 *   现在这里只列核心确实实现了的工具；其余一律由模块在注册时用 `tools` 声明，
 *   且只声明**已验证实现**的（未实现的进 `plannedTools`）。声明与实现因此
 *   在结构上必须对齐，tool-registry 的 missing() 也能把偏差报出来。
 */
export const CORE_TOOLS = {
  read: [],
  query: ['loadKnowledge', 'loadSkill'],
  hand: [],
  teach: [],
}

/**
 * 命名建议（**设计意图，不是已实现的工具名**）：同类工具跨模块宜用一致的动词前缀，
 * 便于模型把在一个模块里学到的用法迁移到另一个模块。
 *
 *   read  ：getSnapshot / getInteractionTrace / getLearningProfile
 *   query ：query<Domain> / search<Domain> / get<Domain>Detail / compare<Domain>
 *   hand  ：applySceneActions / highlightAtoms / navigateTo
 *   teach ：generateQuiz / checkAnswer / diagnoseError / evaluateExplanation / recordLearningEvent
 *
 * 各模块按此约定命名自己的工具，但仍须在 descriptor 的 `tools` 里如实声明。
 * （例如 orbit 实际用的是 generateQuestion 而非 generateQuiz——约定是建议，声明是事实。）
 */

/** 取某几类核心工具的全集 */
export function toolsOf(...classes) {
  return classes.flatMap((c) => CORE_TOOLS[c] || [])
}

// ============================================================================
// 八个决策节点
// ============================================================================

/**
 * 节点规格字段说明：
 *   role       该节点是什么（写进系统提示的角色段）
 *   grants     工具类别授权：read / query / hand / teach
 *   allowExtra 在授权类别之外额外允许的具体工具
 *   deny       从授权类别中剔除的具体工具
 *   input      输入边界
 *   output     输出契约（模型必须产出什么）
 *   forbidden  硬性禁令（违反即为缺陷，需在评测中拦截）
 *   fallback   失败/不可用时的降级行为
 */
export const NODES = {

  // --------------------------------------------------------------------------
  route: {
    title: '意图分流',
    role: '你负责判断用户想做什么，然后转交对应节点。你自己不产生任何教学内容。',
    grants: ['read', 'query'],
    input: ['用户原话', '当前场景快照'],
    output: '仅输出结构化的 {intent, confidence, slots}，不输出讲解文字',
    forbidden: [
      '不得操控视图（无 hand 授权）',
      '不得出题（无 teach 授权）',
      '意图不明确时必须反问澄清，禁止猜测',
    ],
    fallback: '置信度低于阈值 → 转 explain，并附一句澄清式提问',
  },

  // --------------------------------------------------------------------------
  explain: {
    title: '知识讲解',
    role: '你负责讲解知识点，并且边讲边把视图调到与该知识点对应的状态。'
        + '讲解必须落到画面上——只用文字描述结构，等于没讲。',
    grants: ['read', 'query', 'hand'],
    input: ['知识点 id', '学情画像（决定讲解深度）'],
    output: '讲解文本 + 动作序列（每步含 speech 旁白），单次 4–8 个动作',
    forbidden: [
      '★ 一切数值必须来自 queryCrystal 或知识条目，禁止口算',
      '引用知识条目时不得改写其中的数值',
      '超纲内容须明确说明「不在本课程知识库范围内」',
    ],
    fallback: '知识条目缺失 → 改用晶体数据的结构化字段组织讲解，并标注数据来源',
  },

  // --------------------------------------------------------------------------
  quiz: {
    title: '出题',
    role: '你负责生成练习题。',
    grants: ['read', 'query'],
    // ★ 注意：quiz 节点没有任何 hand 授权——它动不了画面
    input: ['知识点 id', '晶体 id', '难度层级'],
    output: '题干 + 4 选项（每项带错因标签）+ 正确答案 + 知识点归属 + presetView',
    forbidden: [
      '★ 不得操控当前视图——出题时乱动画面会打断学生思考',
      '数值题必须走确定性生成路径，模型不得参与数值生成',
      '答案与解析必须分离生成：先冻结答案，再写解析',
    ],
    fallback: '确定性生成器不可用 → 只出概念题，且必须通过双源校验',
    notes: '出题节点产出的 presetView 是【数据】而非立即执行的动作，'
         + '由前端在学生点击「去看结构」时才应用。'
         + '这样既实现"做题时跳回结构验证"，又不违反"出题不动当前画面"。',
  },

  // --------------------------------------------------------------------------
  grade: {
    title: '判卷与错因诊断',
    role: '你负责判定答案并归因错因。答错时你的任务不是给答案，'
        + '而是把画面切到能让学生自己看出矛盾的状态。',
    grants: ['read', 'query', 'hand', 'teach'],
    deny: ['applySceneActions'],   // 只能用诊断动作，不能自由操控
    allowExtra: ['getDiagnosisActions'],
    input: ['题目', '学生答案'],
    output: '正误 + 错因类型 + 诊断动作序列 + 引导话术（不得含答案明文）',
    forbidden: [
      '★ 答错时不直接给出答案，先执行诊断动作引导学生自己看出来',
      '不得用"你错了"开头',
      '诊断动作不得超出该题 presetView 所描述的范围',
    ],
    fallback: '错因无法归类 → 走通用诊断（展示相关结构 + 开放式提问）',
  },

  // --------------------------------------------------------------------------
  demo: {
    title: '演示编排',
    role: '你负责把一句教学意图编排成完整的分镜序列，让学生逐步看清。',
    grants: ['read', 'query', 'hand'],
    input: ['自然语言教学意图'],
    output: '分镜队列，每步含 action + params + speech（旁白必填）',
    forbidden: [
      '★ 每步必须写旁白——没写旁白的那一步，学生只会看到画面莫名跳了一下',
      '旁白不得写成"点击下一步继续"这类操作指令（按钮本身已经说明了）',
      '单次 4–8 步；长流程分次下发，后续动作自动接在队尾',
    ],
    fallback: '意图无法编排为动作序列 → 降级为 explain 节点',
  },

  // --------------------------------------------------------------------------
  teach: {
    title: '教学法执行',
    role: '你负责按选定教学法技能推进对话。你的纪律来自技能本身的'
        + 'when / steps / exit / cautions，而不是自己的发挥。',
    grants: ['read', 'query', 'hand'],
    allowExtra: ['evaluateExplanation'],
    input: ['技能名（由 route 选定或用户指定）', '知识点'],
    output: '按技能 steps 推进的对话；每次推进须能对应到某一步',
    forbidden: [
      '★ 未调用 loadSkill 取得完整步骤时，不得凭印象执行某个教学法',
      '苏格拉底式追问不超过 3 轮',
      '学生明显挫败时必须切换为讲解模式',
      '类比教学必须附「类比失效边界」说明，否则会植入新的误解',
    ],
    fallback: '技能未注册 → 回退为 explain 节点',
  },

  // --------------------------------------------------------------------------
  proactive: {
    title: '主动介入',
    role: '你负责依据行为数据提出帮助建议。你只提议，不执行。',
    grants: ['read', 'query'],
    // ★ 无 hand 授权——主动提示永远只给候选，由用户点击才执行
    input: ['行为数据（停留时长、切换次数、点击历史）', '当前场景快照'],
    output: '一条提示文本 + 建议动作（作为候选项呈现）',
    forbidden: [
      '★ 不得直接执行动作，只能提议',
      '同一规则 3 分钟内不重复触发',
      '两次主动提示至少间隔 45 秒',
      '用户可全局关闭主动提示',
    ],
    fallback: '本地规则未命中 → 完全静默，不唤起模型（未命中时零 token 成本）',
    notes: '这是唯一一个「本地规则先筛、命中才唤起模型」的节点。'
         + '规则引擎本身是通用的，具体规则由各模块提供。',
  },

  // --------------------------------------------------------------------------
  compare: {
    title: '结构对比',
    role: '你负责对比两个对象的结构差异，并引导用户自己找出差异维度。',
    grants: ['read', 'query', 'hand'],
    allowExtra: ['openCompareView'],
    input: ['两个对象 id'],
    output: '对比维度表 + 差异点列表 + 并排视图',
    forbidden: [
      '★ 两个 id 必须来自上游工具返回的原值，禁止编造或从自然语言推断',
      '对比结论必须基于结构化字段，不得主观评价',
    ],
    fallback: '任一 id 缺失 → 先调用检索工具补全',
  },
};

// ============================================================================
// 运行时接口
// ============================================================================

/**
 * 解析某节点实际可用的工具清单。
 *
 * ★ 结果只含**已实现**的工具：核心实际提供的（CORE_TOOLS）∪ 本模块声明为
 *   `tools` 的（descriptor 里未实现的那些放在 `plannedTools`，不参与解析——
 *   把没实现的工具交给模型，它只会不断调用然后拿到"尚未实现"）。
 *
 * @param {string} nodeName  节点名
 * @param {Object} [moduleTools] 当前模块贡献的**已实现**工具，形如
 *        { read: [...], query: [...], hand: [...], teach: [...] }
 * @returns {string[]} 该节点可调用的工具名列表
 */
export function resolveTools(nodeName, moduleTools = {}) {
  const node = NODES[nodeName];
  if (!node) throw new Error(`未知决策节点：${nodeName}`);

  // 1. 按授权类别取工具（核心提供的 + 当前模块贡献的）
  const granted = new Set();
  for (const cls of node.grants || []) {
    for (const t of CORE_TOOLS[cls] || []) granted.add(t);
    for (const t of moduleTools[cls] || []) granted.add(t);
  }

  // 2. 额外允许
  for (const t of node.allowExtra || []) granted.add(t);

  // 3. 剔除
  for (const t of node.deny || []) granted.delete(t);

  return [...granted].sort();
}

/**
 * 生成该节点的系统提示片段。
 *
 * 与 orbit 的 `_nodePrompt` 钩子对应——那里预留了接口但从未赋值，
 * 这里是它的正式实现。
 *
 * @param {string} nodeName
 * @param {Object} [ctx] 上下文，如 { moduleTitle, knowledgePoints }
 */
export function buildNodePrompt(nodeName, ctx = {}) {
  const n = NODES[nodeName];
  if (!n) throw new Error(`未知决策节点：${nodeName}`);

  const lines = [`【当前决策节点：${n.title}】`, n.role, ''];

  if (n.input?.length) lines.push(`输入：${n.input.join('；')}`);
  if (n.output) lines.push(`必须产出：${n.output}`);

  if (n.forbidden?.length) {
    lines.push('', '硬性禁令：');
    n.forbidden.forEach((f, i) => lines.push(`${i + 1}. ${f}`));
  }

  if (n.fallback) lines.push('', `不可用时：${n.fallback}`);
  if (n.notes) lines.push('', `说明：${n.notes}`);

  return lines.join('\n');
}

/** 列出全部节点名（供面板/调试用） */
export function listNodes() {
  return Object.keys(NODES);
}
