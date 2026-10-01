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
// ★ 本文件是**提示词的数据源**：`buildNodePrompt()` 把节点的 title/role/input/output/
//   forbidden/fallback/notes 拼成 system 段发给模型。这些串一个都不上 DOM，
//   故一律走 t()。
// ★ 为什么用**访问器**（`get title()`）而不是在表里直接调 t()：
//   表是模块级常量，定义时求值会把文案**冻在 import 那一刻**的语言上；而
//   `buildNodePrompt()` 是**每次请求**调用的，访问器才能取到当下语言的文案。
// ★ 自己 import 字典（副作用即 registerDict），不依赖入口替你注册
import '../i18n.js'
import { t } from '../../i18n/index.js'

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
  quizGen: {
    get label() { return t('agent.role.quizGen.label') },
    get desc() { return t('agent.role.quizGen.desc') },
  },
  explainConcept: {
    get label() { return t('agent.role.explainConcept.label') },
    get desc() { return t('agent.role.explainConcept.desc') },
  },
  diagnose: {
    get label() { return t('agent.role.diagnose.label') },
    get desc() { return t('agent.role.diagnose.desc') },
  },
  answerCheck: {
    get label() { return t('agent.role.answerCheck.label') },
    get desc() { return t('agent.role.answerCheck.desc') },
  },
  variant: {
    get label() { return t('agent.role.variant.label') },
    get desc() { return t('agent.role.variant.desc') },
  },
  feynmanStart: { get label() { return t('agent.role.feynmanStart.label') } },
  feynmanEval: { get label() { return t('agent.role.feynmanEval.label') } },
  recommend: { get label() { return t('agent.role.recommend.label') } },
  learningEvent: {
    get label() { return t('agent.role.learningEvent.label') },
    get desc() { return t('agent.role.learningEvent.desc') },
  },
}

export const NODES = {

  // --------------------------------------------------------------------------
  route: {
    get title() { return t('agent.node.route.title') },
    get role() { return t('agent.node.route.role') },
    grants: ['read', 'query'],
    // ★ 本节点的 output 要求"仅输出结构化的 {intent, confidence, slots}"，
    //   但按上面的授权，模型**无法通过工具表达意图**——它只能吐自由文本 JSON。
    //   解析自由文本是脆的：模型会加代码块、加解释、加中文引号、漏引号，
    //   而解析失败时我们又只能静默降级，连"它到底想说什么"都拿不到。
    //   故单点放行 `declareIntent`：意图成为**结构化的工具参数**，不再靠文本解析。
    //   纪律仍然成立——route 没有 hand 授权，拿不到 applySceneActions，动不了画面。
    allowExtra: ['declareIntent'],
    get input() { return [t('agent.node.route.input0'), t('agent.node.route.input1')] },
    get output() { return t('agent.node.route.output') },
    get forbidden() {
      return [
        t('agent.node.route.forbid0'),
        t('agent.node.route.forbid1'),
        t('agent.node.route.forbid2'),
      ]
    },
    get fallback() { return t('agent.node.route.fallback') },
  },

  // --------------------------------------------------------------------------
  explain: {
    get title() { return t('agent.node.explain.title') },
    get role() { return t('agent.node.explain.role') },
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
    get input() { return [t('agent.node.explain.input0'), t('agent.node.explain.input1')] },
    get output() { return t('agent.node.explain.output') },
    get forbidden() {
      return [
        t('agent.node.explain.forbid0'),
        t('agent.node.explain.forbid1'),
        t('agent.node.explain.forbid2'),
      ]
    },
    get fallback() { return t('agent.node.explain.fallback') },
  },

  // --------------------------------------------------------------------------
  quiz: {
    get title() { return t('agent.node.quiz.title') },
    get role() { return t('agent.node.quiz.role') },
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
    get input() {
      return [t('agent.node.quiz.input0'), t('agent.node.quiz.input1'), t('agent.node.quiz.input2')]
    },
    get output() { return t('agent.node.quiz.output') },
    get forbidden() {
      return [
        t('agent.node.quiz.forbid0'),
        t('agent.node.quiz.forbid1'),
        t('agent.node.quiz.forbid2'),
      ]
    },
    get fallback() { return t('agent.node.quiz.fallback') },
    get notes() { return t('agent.node.quiz.notes') },
  },

  // --------------------------------------------------------------------------
  grade: {
    get title() { return t('agent.node.grade.title') },
    get role() { return t('agent.node.grade.role') },
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
    get input() { return [t('agent.node.grade.input0'), t('agent.node.grade.input1')] },
    get output() { return t('agent.node.grade.output') },
    get forbidden() {
      return [
        t('agent.node.grade.forbid0'),
        t('agent.node.grade.forbid1'),
        t('agent.node.grade.forbid2'),
      ]
    },
    get fallback() { return t('agent.node.grade.fallback') },
  },

  // --------------------------------------------------------------------------
  demo: {
    get title() { return t('agent.node.demo.title') },
    get role() { return t('agent.node.demo.role') },
    grants: ['read', 'query', 'hand'],
    get input() { return [t('agent.node.demo.input0')] },
    get output() { return t('agent.node.demo.output') },
    get forbidden() {
      return [
        t('agent.node.demo.forbid0'),
        t('agent.node.demo.forbid1'),
        t('agent.node.demo.forbid2'),
      ]
    },
    get fallback() { return t('agent.node.demo.fallback') },
  },

  // --------------------------------------------------------------------------
  teach: {
    get title() { return t('agent.node.teach.title') },
    get role() { return t('agent.node.teach.role') },
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
    get input() { return [t('agent.node.teach.input0'), t('agent.node.teach.input1')] },
    get output() { return t('agent.node.teach.output') },
    get forbidden() {
      return [
        t('agent.node.teach.forbid0'),
        t('agent.node.teach.forbid1'),
        t('agent.node.teach.forbid2'),
        t('agent.node.teach.forbid3'),
      ]
    },
    get fallback() { return t('agent.node.teach.fallback') },
  },

  // --------------------------------------------------------------------------
  proactive: {
    get title() { return t('agent.node.proactive.title') },
    get role() { return t('agent.node.proactive.role') },
    grants: ['read', 'query'],
    // ★ 无 hand 授权——主动提示永远只给候选，由用户点击才执行
    get input() { return [t('agent.node.proactive.input0'), t('agent.node.proactive.input1')] },
    get output() { return t('agent.node.proactive.output') },
    get forbidden() {
      return [
        t('agent.node.proactive.forbid0'),
        t('agent.node.proactive.forbid1'),
        t('agent.node.proactive.forbid2'),
        t('agent.node.proactive.forbid3'),
      ]
    },
    get fallback() { return t('agent.node.proactive.fallback') },
    get notes() { return t('agent.node.proactive.notes') },
  },

  // --------------------------------------------------------------------------
  compare: {
    get title() { return t('agent.node.compare.title') },
    get role() { return t('agent.node.compare.role') },
    grants: ['read', 'query', 'hand'],
    // ★ 原先此处写 allowExtra: ['openCompareView'] —— 那是**概念混淆**：
    //   白名单管的是**工具**，而"打开对比视图"是**动作**（经 applySceneActions 下发，
    //   见 module/actions.js 的 VOCAB）。把它当工具名登记，只会让 assert-nodes 报幽灵名
    //   （因为没有任何 handler 叫这个名字）。compare 节点本就有 hand 授权，
    //   动作经由 applySceneActions 走，无需额外放行。
    get input() { return [t('agent.node.compare.input0')] },
    get output() { return t('agent.node.compare.output') },
    get forbidden() {
      return [
        t('agent.node.compare.forbid0'),
        t('agent.node.compare.forbid1'),
        t('agent.node.compare.forbid2'),
      ]
    },
    get fallback() { return t('agent.node.compare.fallback') },
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
  // ★ 循环变量刻意不叫 `t`：它会遮住上面 import 的 i18n 取值函数 `t()`
  const granted = new Set();
  for (const cls of node.grants || []) {
    for (const toolName of CORE_TOOLS[cls] || []) granted.add(toolName);
    for (const toolName of moduleTools[cls] || []) granted.add(toolName);
  }

  // 2. 按**角色**取（节点说"我要一个出题工具"，模块说"我那叫 generateQuestion"）。
  //    模块未声明该角色时**跳过**——那是"这个模块没有这个能力"，不是错误。
  for (const r of node.roles || []) {
    const toolName = roles[r];
    if (toolName) granted.add(toolName);
  }

  // 3. 额外允许（现在只用于**中枢工具**，如 declareIntent）
  for (const toolName of node.allowExtra || []) granted.add(toolName);

  // 4. 剔除
  for (const toolName of node.deny || []) granted.delete(toolName);

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

  const lines = [t('agent.nodePrompt.heading', { title: n.title }), n.role, ''];

  if (n.input?.length) lines.push(t('agent.nodePrompt.input', { items: n.input.join(t('agent.nodePrompt.sep')) }));
  if (n.output) lines.push(t('agent.nodePrompt.output', { items: n.output }));

  if (n.forbidden?.length) {
    lines.push('', t('agent.nodePrompt.forbidden'));
    n.forbidden.forEach((f, i) => lines.push(`${i + 1}. ${f}`));
  }

  if (n.fallback) lines.push('', t('agent.nodePrompt.fallback', { items: n.fallback }));
  if (n.notes) lines.push('', t('agent.nodePrompt.notes', { items: n.notes }));

  return lines.join('\n');
}

/** 列出全部节点名（供面板/调试用） */
export function listNodes() {
  return Object.keys(NODES);
}
