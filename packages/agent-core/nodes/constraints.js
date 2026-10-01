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
 * 中枢（shell）**实际提供**的工具，按类别分组。
 *
 * ★ 划分依据是**语义是否与模块无关**：
 *   · 「当前视图状态是什么」（getSnapshot）
 *   · 「当前模块能做哪些动作」（listSceneActions）
 *   · 「把动作排成分镜队列」（applySceneActions）
 *   · 「按 id 取知识正文 / 按名取技能步骤」（loadKnowledge / loadSkill）
 *   这几件事对任何模块都是同一个意思，故由中枢实现一次、分派给当前激活的模块；
 *   模块只提供**模块专属**的工具（queryCrystal / queryOrbital 之类）。
 *
 *   这个划分是被两个具体问题逼出来的：
 *     · 命名冲突：crystal 与 orbit 都有"取当前视图快照"的需求，各实现一遍就会出现
 *       两个同名工具（或被迫加丑陋前缀）
 *     · 行为分叉：模块各自实现 applySceneActions 时，容易只做校验而忘了入队，
 *       于是"动作立刻执行、没有分镜队列"——分镜队列、快照回退、逐步闸门全都要重写
 *
 * ★ 与 CORE_TOOLS 原名 TOOL_CLASSES 的那次修正（见下）不冲突：那次修的是
 *   "列了一批没人实现的名字"，这次是把"语义与模块无关、且确实有人实现"的工具
 *   归到中枢名下。
 */
/**
 * 中枢（shell）**实际提供**的工具，按类别分组。
 *
 * ★ 本表必须与 `app.js` 的 `createShellTools` **逐名对齐**。
 *
 *   此前的漂移：表里只登记了 5 个，而中枢实际提供了 10 个——`declareIntent`、
 *   `listDemos`、`playDemo`、`replayDemo`、`navigateTo`、`reviseDemo` 都没登记。
 *   之所以一直没有暴露问题，是因为 `buildRegistry()` 把 shell 的定义与模块的定义
 *   **按类合并**后一并交给注册表，于是授权实际是"**按类全放行**"：表里少写名字
 *   不影响谁能用，但也意味着**未登记的那几个不被任何断言覆盖**——对账断言
 *   （`assert-nodes`）只遍历这张表。
 *
 *   登记完整之后，"幽灵名"统计才真正覆盖全部中枢工具。**新增中枢工具时，
 *   这里与 app.js 必须同时改。**
 */
export const CORE_TOOLS = {
  read: ['getSnapshot'],
  query: ['listSceneActions', 'loadKnowledge', 'loadSkill', 'listDemos', 'declareIntent'],
  hand: ['applySceneActions', 'playDemo', 'replayDemo', 'reviseDemo', 'navigateTo'],
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
 *   roles      按**角色**授权（见下方 ROLE_SPEC）——节点表达"我要一个出题工具"，
 *              由**当前模块**决定它叫 `generateQuiz`（晶体）还是 `generateQuestion`（轨道）
 *   allowExtra 在授权类别之外额外允许的具体工具（**只用于中枢工具**，如 declareIntent）
 *   deny       从授权类别中剔除的具体工具
 *   input      输入边界
 *   output     输出契约（模型必须产出什么）
 *   forbidden  硬性禁令（违反即为缺陷，需在评测中拦截）
 *   fallback   失败/不可用时的降级行为
 *
 * ★ 为什么要有 `roles`（2026-10-01）：
 *   `allowExtra` 里原先写的是**晶体专名的工具名**，而工具名各模块不同 ——
 *   `quiz` 节点放行的是 `generateQuiz`，而 orbit 的同类工具叫 `generateQuestion`。
 *   后果是**静默的**：orbit 下"出题"节点一个出题工具都拿不到（只剩 queryOrbital），
 *   不报错、不崩、selftest 也绿（它用的是所有模块工具的**并集**，并集里两个名字都在）。
 *
 *   补字面名只是修好今天这一个症状，加第四个模块还要再补一次，漏了依旧是静默失效。
 *   改成角色后，模块自己声明"我的出题工具叫什么"，中枢不必知道任何模块的工具名。
 *
 * ★ `roles` 与 `grants` 的分工：类别粒度太粗（给 `teach` 节点加 'teach' 类会连带
 *   放开 checkAnswer，教学法节点顺手判卷——与 quiz 节点那段的道理相同）；
 *   字面名粒度太细（写死了模块名字）。角色正好是"意图"这一层。
 */
export const ROLE_SPEC = {
  quizGen: { label: '出题', desc: '生成一道题（题干+选项+答案），不改动当前画面' },
  explainConcept: { label: '概念讲解', desc: '对某个知识点做结构化讲解' },
  diagnose: { label: '错因诊断', desc: '判定错因并给出诊断动作' },
  answerCheck: { label: '判卷', desc: '判定学生作答的正误' },
  variant: { label: '变式题', desc: '围绕同一知识点生成变式题' },
  feynmanStart: { label: '发起费曼复述' },
  feynmanEval: { label: '评估费曼复述' },
  recommend: { label: '推荐下一步' },
  learningEvent: { label: '记学情', desc: '把一次学习事件写进学情（各模块自己的学情实现）' },
}

export const NODES = {

  // --------------------------------------------------------------------------
  route: {
    title: '意图分流',
    role: '你负责判断用户想做什么，然后转交对应节点。你自己不产生任何教学内容。',
    grants: ['read', 'query'],
    // ★ 本节点的 output 要求"仅输出结构化的 {intent, confidence, slots}"，
    //   但按上面的授权，模型**无法通过工具表达意图**——它只能吐自由文本 JSON。
    //   解析自由文本是脆的：模型会加代码块、加解释、加中文引号、漏引号，
    //   而解析失败时我们又只能静默降级，连"它到底想说什么"都拿不到。
    //   故单点放行 `declareIntent`：意图成为**结构化的工具参数**，不再靠文本解析。
    //   纪律仍然成立——route 没有 hand 授权，拿不到 applySceneActions，动不了画面。
    allowExtra: ['declareIntent'],
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
    // ★ explain 也放行 declareIntent（与 route 节点一样）。
    //   本地关键词未命中时**不该**把节点切到 route 去"问一次意图"——route 只有
    //   read+query，那一轮就拿不到 applySceneActions，"讲解要落到画面上"在首轮就失效。
    //   这条设计缺陷是被 tools/test-agent-core.mjs 当场抓出的（发"帮我打开化学键"
    //   未命中关键词 → 工具集缩到最小 → showBonds 没生效）。
    //   正确做法：模型在 explain 下照常工作，若识别出更强的意图再请求切换。
    allowExtra: ['declareIntent'],
    // ★ 概念讲解：角色而不是工具名——orbit 有 explainConcept，crystal 没有（它不声明即可）。
    //   原先 explain 节点**没有**这一项，于是 orbit 的 explainConcept 只在判卷节点可见。
    roles: ['explainConcept'],
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
    //
    // ★ 单点放行**出题**这一个角色，而**不是**给 grants 加 'teach'：
    //   后者会连带把 checkAnswer 一起放开，出题节点就获得了判卷能力——
    //   它可能"顺手"把答案判了，绕过学生作答这一环。
    //   「能用权限表达的就不要用文字表达」在这里的具体含义就是：
    //   想让出题节点能出题但不能判卷，唯一的正确做法是单点放行。
    //
    // ★ 用**角色**而不是工具名（2026-10-01）：原先这里写的是 `generateQuiz`——
    //   那是**晶体专名**。orbit 的同类工具叫 `generateQuestion`，于是 orbit 下这个
    //   节点一个出题工具都拿不到，而**没有任何东西会红**。现在由模块自己声明
    //   "我的出题工具叫什么"（见各模块 createModule 的 roles）。
    roles: ['quizGen'],
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
    // ★ 只能用诊断动作，不能自由操控。`reviseDemo` 也必须一并挡掉：它是 hand 类，
    //   而 hand 类是**按类全放行**的——不显式 deny 就会自动落到本节点，
    //   而"整改演示"与"判卷时不许乱动画面"直接冲突（学生正看着诊断动作，画面不该被改）。
    deny: ['applySceneActions', 'reviseDemo'],
    // ★ 工具名修正（迁入本仓库时）：原写作 getDiagnosisActions，而
    //   descriptor 的 plannedTools 与 skills/common 的 misconception-probe 步骤
    //   用的都是 `diagnoseError`。三处不一致，只有这里用了那个不存在的名字
    //   —— 白名单写着幽灵名，模型看不到它，诊断节点就拿不到诊断工具。
    allowExtra: ['diagnoseError'],
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
    // ★ 工具名修正（迁入本仓库时）：原写作 evaluateExplanation，与实际命名
    //   （orbit 的 evaluateFeynman，晶体侧费曼复述也用同一名字）不一致。
    //   费曼复述是参赛演示脚本的场景 D，故它与其配套工具都要单点放行：
    //   startFeynmanCheck 发起、evaluateFeynman 评估、recordLearningEvent 记学情、
    //   recommendNext 推荐下一步。
    //
    // ★ 改成**角色**（2026-10-01）：其中 `recordLearningEvent` 是**晶体专名**——
    //   orbit 的同类工具叫 `updateMastery`，于是"记学情"在 orbit 下永远拿不到
    //   （不报错，只是学情不落盘）。其余三个名字两侧恰好相同，但一并角色化，
    //   免得下一个模块再踩同一个坑。
    roles: ['feynmanStart', 'feynmanEval', 'recommend', 'learningEvent'],
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
    // ★ 原先此处写 allowExtra: ['openCompareView'] —— 那是**概念混淆**：
    //   白名单管的是**工具**，而"打开对比视图"是**动作**（经 applySceneActions 下发，
    //   见 module/actions.js 的 VOCAB）。把它当工具名登记，只会让 assert-nodes 报幽灵名
    //   （因为没有任何 handler 叫这个名字）。compare 节点本就有 hand 授权，
    //   动作经由 applySceneActions 走，无需额外放行。
    input: ['两个对象 id'],
    output: '对比维度表 + 差异点列表 + 并排视图。'
      + '★ 维度表与差异点来自 compareCrystals({a,b})——它只查数据、**不需要三维视图**，'
      + '所以"比较 A 和 B"在任何页面上都答得出来；并排画面另用 '
      + 'navigateTo({target:"compare", crystalId, otherCrystalId})（**仅当当前已有视图时**'
      + '才考虑经 applySceneActions 下发）。',
    forbidden: [
      '★ 两个 id 必须来自上游工具返回的原值，禁止编造或从自然语言推断',
      '对比结论必须基于结构化字段，不得主观评价',
      '★ 当前没有三维视图时，**不要**用 applySceneActions 去"打开两个晶体"——'
        + '它只会返回"没有可驱动的视图"，而学生什么也没得到（实测反馈：'
        + '学生说"比较 NaCl 和 CsCl"，得到的就是这么一条报错）。'
        + '先用 compareCrystals 把数据对比讲清楚；学生要看画面时再 navigateTo 跳到对比页。',
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
 * @param {Object} [roles] 当前模块的**角色映射**，形如
 *        { quizGen: 'generateQuiz', learningEvent: 'recordLearningEvent' }。
 *        ★ 必须传**当前模块那一份**，不能传所有模块的并集——角色是每模块各自的绑定，
 *          并集会让 A 模块的角色解析出 B 模块的工具名。
 * @returns {string[]} 该节点可调用的工具名列表
 */
export function resolveTools(nodeName, moduleTools = {}, roles = {}) {
  const node = NODES[nodeName];
  if (!node) throw new Error(`未知决策节点：${nodeName}`);

  // 1. 按授权类别取工具（核心提供的 + 当前模块贡献的）
  const granted = new Set();
  for (const cls of node.grants || []) {
    for (const t of CORE_TOOLS[cls] || []) granted.add(t);
    for (const t of moduleTools[cls] || []) granted.add(t);
  }

  // 2. 按**角色**取（节点说"我要一个出题工具"，模块说"我那叫 generateQuestion"）。
  //    模块未声明该角色时**跳过**——那是"这个模块没有这个能力"，不是错误。
  for (const r of node.roles || []) {
    const t = roles[r];
    if (t) granted.add(t);
  }

  // 3. 额外允许（现在只用于**中枢工具**，如 declareIntent）
  for (const t of node.allowExtra || []) granted.add(t);

  // 4. 剔除
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
