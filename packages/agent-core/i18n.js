/**
 * packages/agent-core/i18n.js —— 智能体中枢（提示词 / 工具 / 节点）的中英词典
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 这一区与页面区的根本区别：这里的文案**几乎都不进 DOM**
 * ───────────────────────────────────────────────────────────────────────────
 *   · 发给模型的系统提示词与节点提示（`core/conversation.js`、`nodes/constraints.js`）
 *   · 工具描述与参数说明（`app.js`、`core/tool-registry.js`）
 *   · 感知快照文本、动作回执、错误信息（`core/perception.js`、`core/storyboard.js` …）
 * 这三类都**不是 DOM 文本节点**，扫描替换救不了它们，必须显式调 `t()`。
 * 所以本区的 `text` 表只有寥寥几条（见下方说明），绝大多数走 `zh`/`en` 两张键表。
 *
 * ★ 带变量的模板串一律走 `t('key', { name })`：
 *   `已入队 3 步（共 7 步）` 与 `已入队 4 步（共 7 步）` 在扫描替换看来是两条不同的
 *   原文，列不完；只有按键 + 占位符取才收得住。
 *
 * ★ 本文件必须是**纯数据**：不 import DOM、不 import three、不 import 任何运行时。
 *   相对路径 import 是硬要求 —— 覆盖率守卫是在 **Node** 里 import 本文件来读
 *   "登记了哪些原文"的，而 `@i18n` 是 vite 别名，Node 不认（用别名会静默变成 0 覆盖）。
 */
import { registerDict } from '../i18n/index.js'

/** 键 → 中文 */
export const zh = {
  // ==========================================================================
  // core/conversation.js —— 系统提示的清单段与截断续写
  // ==========================================================================
  'agent.manifest.knowledgeTitle':
    '【知识库清单】（正文需用 loadKnowledge(id) 按需加载，不要臆测内容）',
  // ★ 逐字保留 `｜` 与 `关键词:` —— test-core 的 `/关键词:a\/b/` 断言就吃这一串
  'agent.manifest.knowledgeLine': '{id}｜{kp}｜{title}｜关键词:{keywords}',
  'agent.manifest.skillsTitle': '【教学技能清单】（完整步骤需用 loadSkill(name) 加载）',
  'agent.snapshot.header': '【当前视图快照（实时）】',
  'agent.tool.abortedNote': '用户已中止本次循环，该动作未执行',
  'agent.noApiKey': '尚未配置 API Key，请在设置中填写你自己的模型密钥。',
  'agent.continue.truncated':
    '（上一条回复因长度上限被截断，请从中断处继续写完，不要重复已经写过的内容。'
    + '公式务必写成：行内 $…$ 不跨行，独立成行的 $$…$$ 独占一行。）',

  // ==========================================================================
  // core/feynman.js
  // ==========================================================================
  // ★ 逐字保留：test-core 断言 `error === '费曼技能未注册'`
  'agent.feynman.notRegistered': '费曼技能未注册',
  'agent.feynman.invitation':
    '试着用**你自己的话**说一遍，就当我是完全没学过的同学——不要背公式，讲你理解的那个版本。',
  'agent.feynman.note': '学生复述后调用 evaluateFeynman 评估',

  // ==========================================================================
  // core/llm-client.js —— 错误分类与人话提示（都会显示在面板上）
  // ==========================================================================
  'agent.llm.auth': 'API Key 无效或无权限，请在设置中检查。',
  'agent.llm.rateLimit': '请求过于频繁（限流），请稍后重试。',
  'agent.llm.quota': '账户余额不足，请检查模型服务账户。',
  'agent.llm.serverError': '模型服务端错误（{status}），可重试。',
  'agent.llm.httpError': '请求失败（HTTP {status}）',
  'agent.llm.network': '网络请求失败：{msg}（若为跨域问题，请确认所用服务允许浏览器直连）',
  'agent.llm.unknownError': '未知错误',
  'agent.llm.downgradeMaxTokens':
    '服务端不接受当前的输出上限（max_tokens），本次改为由服务端决定；可在设置里调小。',
  'agent.llm.downgradeStreamOptions':
    '服务端不支持 stream_options，已去掉该参数重试（代价：看不到 token 用量）。',

  // ==========================================================================
  // core/params.js —— 参数校验的拒绝理由（回灌给模型）
  // ==========================================================================
  'agent.params.enum': '{label} 应为 {allowed}，收到 {got}',
  'agent.params.string': '需要 {label}（非空字符串）',

  // ==========================================================================
  // core/perception.js —— 紧凑快照（每轮注入的 system 段）
  // ==========================================================================
  'agent.perception.state': '【当前状态】{state}',
  // ★ `空闲 0s` 这一段被 test-core 的 `/空闲 0s/` 断言吃住，改字要同步改断言
  'agent.perception.interaction': '【交互】空闲 {idle}s；切换次数 {toggles}；最近动作 {recent}',

  // ==========================================================================
  // core/storyboard.js —— 分镜队列的拒绝理由与回执
  // ==========================================================================
  'agent.sb.noPrev': '当前没有可回退的演示',
  'agent.sb.prevAuto': '自动连播中无法回退，请先切到手动逐步',
  'agent.sb.prevPlaying': '当前步骤正在播放，请稍候再回退',
  'agent.sb.prevFirst': '已经是第一步了',
  'agent.sb.overflow': '超出单条演示的步数上限（{max}），未入队',
  'agent.sb.queued': '已入队 {queued} 步（共 {total} 步）。',
  'agent.sb.queuedManual':
    /**
     * ★★ 2026-10-08 改：**先给答案**是铁律，"操作提示"只能垫在末尾。
     *
     *   十问实测（Q4/Q5/Q8/Q10）：原先这句写着「并在回复里告诉学生可以用
     *   「下一步 / 连续播放 / 停止」控制节奏」——模型于是**每轮都用这句开场**，
     *   把回答挤到后面；问"水是什么点群""比较 NaCl 和 CsCl"这种直接问题时，
     *   整篇回复就只剩操作说明 + 反问，**一个答案都没有**（394 字，群里没有一个结论）。
     *   改成"若需要可在末尾提一句"，并显式禁止用它开场。
     */
    '正在等用户点「下一步」逐步确认——请不要重复下发同样的动作。'
    + '（若需要，可在回复**末尾**补一句可用「下一步 / 连续播放 / 停止」控制节奏；'
    + '★ 不要用它开场，更不要用它占掉回答本身。）',
  'agent.sb.queuedAuto': '正在连续播放。',
  'agent.sb.execFailed': '执行失败',
  'agent.sb.noSteps': '这段演示没有可执行的步骤',
  'agent.sb.noReplay': '没有可回放的演示（还没有放过任何演示）',
  'agent.sb.noJump': '当前没有可跳转的演示',
  'agent.sb.jumpAuto': '自动连播中无法跳转，请先切到逐步',
  'agent.sb.jumpPlaying': '当前步骤正在播放，请稍候',
  'agent.sb.stepRange': '步号超出范围',
  'agent.sb.noDemo': '没有找到这条演示（现有：{ids}）',
  'agent.sb.none': '无',
  'agent.sb.indexInvalid': 'index 应为 ≥ 0 的步号',
  'agent.sb.stepRangeDemo': '步号超出范围（这条演示共 {n} 步）',
  'agent.sb.needAction': 'op={op} 需要给出 step.action',
  'agent.sb.jumpOnlyLive': '只能跳回正在播的演示',
  'agent.sb.cannotEmpty': '不能把演示删空',
  'agent.sb.unknownOp': '未知的 op：{op}',
  'agent.sb.noBefore': '还没有可恢复的演示',
  'agent.sb.restoreUnsupported': '当前视图不支持恢复',
  'agent.sb.restoreFailed': '恢复失败：{msg}',
  'agent.sb.restoreNoEffect': '恢复未生效（视图可能已切换到别的页面）',
  // ---- app.js 里给分镜引擎的两个回调（拒绝理由会回灌给模型） ----
  'agent.storyboard.unsupportedAction': '当前模块不支持动作：{name}',
  'agent.storyboard.noModule': '模块未激活',

  // ==========================================================================
  // core/tool-registry.js —— 白名单拒绝与执行异常（都会回灌给模型）
  // ==========================================================================
  // ★ `/不可用/`（test-core）与 `/quiz/`（test-core）两条断言吃的是下面这三段的拼接
  'agent.tool.notAllowed': '工具 {name} 在当前决策节点不可用',
  'agent.tool.notAllowedNode': '（节点：{node}）',
  'agent.tool.notAllowedAvailable': '。可用工具：{tools}',
  'agent.tool.notImplemented': '工具尚未实现：{name}',
  'agent.tool.badJson': '参数不是合法 JSON：{msg}',
  // ★ `/执行异常/`（test-core）吃这一段
  'agent.tool.execError': '工具执行异常：{msg}',

  // ==========================================================================
  // store/conversation-store.js
  // ==========================================================================
  'agent.store.abortedPlaceholder': '（此调用未执行完，占位以保持历史合法）',

  // ==========================================================================
  // store/demo-favorites.js
  // ==========================================================================
  // ★ 用 `t()` 而不是 `text` 表：面板把它渲染成 `'★ ' + label`（同一个文本节点），
  //   整段不等于原文，扫描替换匹配不上。
  'agent.fav.noSteps': '这条演示没有可收藏的步骤',
  'agent.fav.untitled': '未命名演示',

  // ==========================================================================
  // nodes/constraints.js —— 角色规格与八个决策节点（都进系统提示）
  // ==========================================================================
  // ---- ROLE_SPEC：角色名与一句话说明（这一层是给模型的"意图"词汇） ----
  'agent.role.quizGen.label': '出题',
  'agent.role.quizGen.desc': '生成一道题（题干+选项+答案），不改动当前画面',
  'agent.role.explainConcept.label': '概念讲解',
  'agent.role.explainConcept.desc': '对某个知识点做结构化讲解',
  'agent.role.diagnose.label': '错因诊断',
  'agent.role.diagnose.desc': '判定错因并给出诊断动作',
  'agent.role.answerCheck.label': '判卷',
  'agent.role.answerCheck.desc': '判定学生作答的正误',
  'agent.role.variant.label': '变式题',
  'agent.role.variant.desc': '围绕同一知识点生成变式题',
  'agent.role.feynmanStart.label': '发起费曼复述',
  'agent.role.feynmanEval.label': '评估费曼复述',
  'agent.role.recommend.label': '推荐下一步',
  'agent.role.learningEvent.label': '记学情',
  'agent.role.learningEvent.desc': '把一次学习事件写进学情（各模块自己的学情实现）',

  // ---- 节点提示的骨架（buildNodePrompt 的固定词） ----
  'agent.nodePrompt.heading': '【当前决策节点：{title}】',
  'agent.nodePrompt.input': '输入：{items}',
  'agent.nodePrompt.sep': '；',
  'agent.nodePrompt.output': '必须产出：{items}',
  'agent.nodePrompt.forbidden': '硬性禁令：',
  'agent.nodePrompt.fallback': '不可用时：{items}',
  'agent.nodePrompt.notes': '说明：{items}',

  // ---- route（意图分流） ----
  'agent.node.route.title': '意图分流',
  'agent.node.route.role':
    '你负责判断用户想做什么，然后转交对应节点。你自己不产生任何教学内容。',
  'agent.node.route.input0': '用户原话',
  'agent.node.route.input1': '当前场景快照',
  'agent.node.route.output': '仅输出结构化的 {intent, confidence, slots}，不输出讲解文字',
  'agent.node.route.forbid0': '不得操控视图（无 hand 授权）',
  'agent.node.route.forbid1': '不得出题（无 teach 授权）',
  'agent.node.route.forbid2': '意图不明确时必须反问澄清，禁止猜测',
  'agent.node.route.fallback': '置信度低于阈值 → 转 explain，并附一句澄清式提问',

  // ---- explain（知识讲解） ----
  'agent.node.explain.title': '知识讲解',
  'agent.node.explain.role':
    '你负责讲解知识点，并且边讲边把视图调到与该知识点对应的状态。'
    + '讲解必须落到画面上——只用文字描述结构，等于没讲。',
  'agent.node.explain.input0': '知识点 id',
  'agent.node.explain.input1': '学情画像（决定讲解深度）',
  /**
   * ★★ 2026-10-08：原来这条把步数写成"单次 4–8 个动作"，**下限也写死了** ——
   *   于是"水是什么点群"这种一句话就能答完的问题也被排成 8 步（十问实测 8/10 问
   *   都是 7–9 步）。模型是在**照规范执行**，不是它啰嗦，所以改规范。
   *   ★ 这条经 constraints.js 的 `get output()` 原样进入节点说明，所以直接改这里即可
   *     （曾想另加一个 outputNote 键——那个键没有任何消费者，等于没写）。
   */
  'agent.node.explain.output':
    '讲解文本 + 动作序列（每步含 speech 旁白）。'
    + '★ 步数按问题复杂度给：单纯的"是什么 / 有哪些"类问题 2–4 步足够；'
    + '需要建立多个新概念、或要学生自己看见"矛盾"时再用 4–8 步，不要把简单问题排满。',
  'agent.node.explain.forbid0': '★ 一切数值必须来自 queryCrystal 或知识条目，禁止口算',
  'agent.node.explain.forbid1': '引用知识条目时不得改写其中的数值',
  'agent.node.explain.forbid2': '超纲内容须明确说明「不在本课程知识库范围内」',
  'agent.node.explain.fallback':
    '知识条目缺失 → 改用晶体数据的结构化字段组织讲解，并标注数据来源',

  // ---- quiz（出题） ----
  'agent.node.quiz.title': '出题',
  'agent.node.quiz.role': '你负责生成练习题。'
    /**
     * ★★ 2026-10-08（用户报「练习时没有选项按钮，还直接暴露了答案；出练习应 Function Calling」）：
     *   模型没有调 generateQuiz，而是**自己把题干与选项写成一段文字** —— 于是
     *   ① 题目卡（带 A/B/C/D 按钮、作答与判分）根本没有出现；
     *   ② 它顺手把答案也写进了正文。
     *   generateQuiz 是**程序**出题（答案冻结、选项带错因标签），这正是本仓库"数值一律程序算"
     *   的落地方式。所以这里把话说死：题干与选项**只能**来自工具返回字段。
     */
    + '★ 题干与选项**必须**来自 generateQuiz 的返回字段（stem / options）；'
    + '**禁止**自己写题干或选项、也**禁止**在正文里写出或暗示正确答案 —— '
    + '学生要在题目卡的选项按钮上作答，答案由程序判。'
    + '正文只写一句引导语（不要复述题目）。',
  'agent.node.quiz.input0': '知识点 id',
  'agent.node.quiz.input1': '晶体 id',
  'agent.node.quiz.input2': '难度层级',
  'agent.node.quiz.output':
    '题干 + 4 选项（每项带错因标签）+ 正确答案 + 知识点归属 + presetView',
  // ★ `/不得操控当前视图/` 与 `/分离生成/` 两条断言（selftest ④）吃下面两条，改字要同步改断言
  'agent.node.quiz.forbid0': '★ 不得操控当前视图——出题时乱动画面会打断学生思考',
  'agent.node.quiz.forbid1': '数值题必须走确定性生成路径，模型不得参与数值生成',
  'agent.node.quiz.forbid2': '答案与解析必须分离生成：先冻结答案，再写解析',
  'agent.node.quiz.fallback': '确定性生成器不可用 → 只出概念题，且必须通过双源校验',
  'agent.node.quiz.notes':
    '出题节点产出的 presetView 是【数据】而非立即执行的动作，'
    + '由前端在学生点击「去看结构」时才应用。'
    + '这样既实现"做题时跳回结构验证"，又不违反"出题不动当前画面"。',

  // ---- grade（判卷与错因诊断） ----
  'agent.node.grade.title': '判卷与错因诊断',
  'agent.node.grade.role':
    '你负责判定答案并归因错因。答错时你的任务不是给答案，'
    + '而是把画面切到能让学生自己看出矛盾的状态。',
  'agent.node.grade.input0': '题目',
  'agent.node.grade.input1': '学生答案',
  'agent.node.grade.output': '正误 + 错因类型 + 诊断动作序列 + 引导话术（不得含答案明文）',
  'agent.node.grade.forbid0': '★ 答错时不直接给出答案，先执行诊断动作引导学生自己看出来',
  'agent.node.grade.forbid1': '不得用"你错了"开头',
  'agent.node.grade.forbid2': '诊断动作不得超出该题 presetView 所描述的范围',
  'agent.node.grade.fallback': '错因无法归类 → 走通用诊断（展示相关结构 + 开放式提问）',

  // ---- demo（演示编排） ----
  'agent.node.demo.title': '演示编排',
  'agent.node.demo.role': '你负责把一句教学意图编排成完整的分镜序列，让学生逐步看清。'
    /**
     * ★★ 2026-10-08 十问实测补：本节点最容易犯的错是**把"排了演示"当成"回答了"**。
     *   实测：「帮我比较一下 NaCl 和 CsCl」→ 只回了"演示已排好 6 步，看第 4–5 步"，
     *   对照结论一个都没写；「水是什么点群」→ 394 字全是操作说明与反问。
     *   学生看完演示仍然不知道答案。所以这里写明：正文先给要点，演示是**补充**。
     */
    + '★ 排演示**不等于**回答：编排序列之前，正文先用一两句话把学生问的那件事说清楚'
    + '（结论、关键数值、对照点），再排分镜；不要用"看演示"替代答案。',
  'agent.node.demo.input0': '自然语言教学意图',
  'agent.node.demo.output': '分镜队列，每步含 action + params + speech（旁白必填）',
  'agent.node.demo.forbid0': '★ 每步必须写旁白——没写旁白的那一步，学生只会看到画面莫名跳了一下',
  'agent.node.demo.forbid1': '旁白不得写成"点击下一步继续"这类操作指令（按钮本身已经说明了）',
  'agent.node.demo.forbid2': '★ 单次 2–8 步：简单问题 2–4 步，长流程分次下发，后续动作自动接在队尾',
  'agent.node.demo.fallback': '意图无法编排为动作序列 → 降级为 explain 节点',

  // ---- teach（教学法执行） ----
  'agent.node.teach.title': '教学法执行',
  'agent.node.teach.role':
    '你负责按选定教学法技能推进对话。你的纪律来自技能本身的'
    + 'when / steps / exit / cautions，而不是自己的发挥。',
  'agent.node.teach.input0': '技能名（由 route 选定或用户指定）',
  'agent.node.teach.input1': '知识点',
  'agent.node.teach.output': '按技能 steps 推进的对话；每次推进须能对应到某一步',
  'agent.node.teach.forbid0': '★ 未调用 loadSkill 取得完整步骤时，不得凭印象执行某个教学法',
  'agent.node.teach.forbid1': '苏格拉底式追问不超过 3 轮',
  'agent.node.teach.forbid2': '学生明显挫败时必须切换为讲解模式',
  'agent.node.teach.forbid3': '类比教学必须附「类比失效边界」说明，否则会植入新的误解',
  'agent.node.teach.fallback': '技能未注册 → 回退为 explain 节点',

  // ---- proactive（主动介入） ----
  'agent.node.proactive.title': '主动介入',
  'agent.node.proactive.role': '你负责依据行为数据提出帮助建议。你只提议，不执行。',
  'agent.node.proactive.input0': '行为数据（停留时长、切换次数、点击历史）',
  'agent.node.proactive.input1': '当前场景快照',
  'agent.node.proactive.output': '一条提示文本 + 建议动作（作为候选项呈现）',
  'agent.node.proactive.forbid0': '★ 不得直接执行动作，只能提议',
  'agent.node.proactive.forbid1': '同一规则 3 分钟内不重复触发',
  'agent.node.proactive.forbid2': '两次主动提示至少间隔 45 秒',
  'agent.node.proactive.forbid3': '用户可全局关闭主动提示',
  'agent.node.proactive.fallback': '本地规则未命中 → 完全静默，不唤起模型（未命中时零 token 成本）',
  'agent.node.proactive.notes':
    '这是唯一一个「本地规则先筛、命中才唤起模型」的节点。'
    + '规则引擎本身是通用的，具体规则由各模块提供。',

  // ---- compare（结构对比） ----
  'agent.node.compare.title': '结构对比',
  'agent.node.compare.role': '你负责对比两个对象的结构差异，并引导用户自己找出差异维度。',
  'agent.node.compare.input0': '两个对象 id',
  'agent.node.compare.output':
    '对比维度表 + 差异点列表 + 并排视图。'
    + '★ 维度表与差异点来自 compareCrystals({a,b})——它只查数据、**不需要三维视图**，'
    + '所以"比较 A 和 B"在任何页面上都答得出来；并排画面另用 '
    + 'navigateTo({target:"compare", crystalId, otherCrystalId})（**仅当当前已有视图时**'
    + '才考虑经 applySceneActions 下发）。',
  'agent.node.compare.forbid0': '★ 两个 id 必须来自上游工具返回的原值，禁止编造或从自然语言推断',
  'agent.node.compare.forbid1': '对比结论必须基于结构化字段，不得主观评价',
  'agent.node.compare.forbid2':
    '★ 当前没有三维视图时，**不要**用 applySceneActions 去"打开两个晶体"——'
    + '它只会返回"没有可驱动的视图"，而学生什么也没得到（实测反馈：'
    + '学生说"比较 NaCl 和 CsCl"，得到的就是这么一条报错）。'
    + '先用 compareCrystals 把数据对比讲清楚；学生要看画面时再 navigateTo 跳到对比页。',
  'agent.node.compare.fallback': '任一 id 缺失 → 先调用检索工具补全',

  // ==========================================================================
  // app.js —— 中枢工具的描述、参数说明与回执
  // ==========================================================================
  'agent.tool.getSnapshot.desc':
    '获取当前视图状态的完整快照（正在看什么、哪些图层开着、外观与视角），'
    + '含【交互痕迹】（空闲时长、切换次数、最近动作）。需要了解"用户此刻在看什么、刚才做了什么"'
    + '时必须先调用它。返回的是**当前激活模块**的状态。',
  'agent.tool.listSceneActions.desc':
    '拉取当前模块的**受控动作词汇表**（能做哪些动作、参数取值范围）。'
    + '词汇表不进常驻上下文，需要时调用本工具获取。',
  'agent.tool.loadKnowledge.desc':
    '按 id 加载知识条目正文。系统提示里只有清单（id/标题/关键词），'
    + '正文必须用本工具按需拉取——**不要臆测条目内容**。',
  'agent.tool.loadKnowledge.id': '条目 id，形如 crystal:C4-1 或 orbit:K3-1',
  'agent.tool.loadSkill.desc': '按名加载教学法技能的完整步骤。系统提示里只有技能名与一句话说明。',
  'agent.tool.loadSkill.name': '技能名，如 feynman / socratic',
  'agent.tool.listDemos.desc':
    '列出**预置的标准演示**（零 token：内容是事先编排好的，播放时不花额度）。'
    + '当学生想看某个核心教学过程、而你又不想临时编排时，先用它看有哪些可用。',
  'agent.tool.declareIntent.desc':
    '声明你判断出的用户意图，供系统切换决策节点。'
    + '**只在当前决策节点为「意图分流」时可用**。'
    + 'confidence 低于 0.6 会被忽略并回退到讲解节点。',
  'agent.tool.declareIntent.intent': '目标节点名，取值：{nodes}',
  'agent.tool.declareIntent.confidence': '0~1 的置信度',
  'agent.tool.declareIntent.slots': '可选：意图相关槽位，如 { skill: "feynman" }',
  'agent.tool.applySceneActions.desc':
    '在当前视图上播放一组动作。动作会排成**分镜队列逐步播放**：'
    + '第一步立刻执行，之后停下等用户点「下一步」。因此本工具**立即返回受理回执、不等播完**，'
    + '返回里没有 executed 是正常的。单次 4–8 个动作；**每步必须写 speech 旁白**。',
  'agent.tool.applySceneActions.speech': '这一步的旁白（必填）',
  'agent.tool.navigateTo.desc':
    '把学生带到指定的页面或晶体。当学生要看的对象不在当前页面时用它——'
    + '例如在首页问某个晶体、或需要跳到对比页。id 必须来自模块的 id 清单（工具会校验）。',
  'agent.tool.navigateTo.target': '目标页面（取值由模块声明）',
  'agent.tool.navigateTo.homeLabel': '回门户',
  'agent.tool.playDemo.desc':
    '播放一段**预置的标准演示**（零 token）。它会像 applySceneActions 那样排成'
    + '分镜队列、每步停下等你点「下一步」。适用于那几个最核心的教学过程；'
    + '学生临时提出的、脚本没覆盖的请求仍应自己编排动作。',
  'agent.tool.playDemo.id': '演示 id，来自 listDemos',
  'agent.tool.replayDemo.desc':
    '**回放**之前放过的一段演示。★ 结束或播完之后**仍然可用**——'
    + '演示记录独立于播放队列，所以停止不会让演示丢失。'
    + '学生说"再看一遍"时用它，不必重新编排动作。省略 demoId 则回放最近一次。',
  'agent.tool.replayDemo.demoId': '可选：演示记录号（如 d1）；省略则回放最近一次',
  'agent.tool.reviseDemo.desc':
    '修订**某一条**演示：替换某步 / 在某步后插入 / 删除某步 / 跳回某步。'
    + '★ 学生说"刚才那个演示第 3 步不对、换个说法、太快了"时用它——**不要**用 '
    + 'applySceneActions 把整条重发一遍：重发会开一条**新**演示，学生已经看过、'
    + '确认过的其他步骤就全丢了。'
    + '★ **已经播完的演示同样可以改**（这是最常见的情形）：程序会按整改后的完整步骤'
    + '重播、并快进到被改的那一步停下，所以其余步骤一个都不会少；'
    + '回执里的 steps 就是整改后的完整清单，用它核对。'
    + 'demoId 与步号取自 getSnapshot 的「演示播放」一行（steps[].i 即步号）。',
  'agent.tool.reviseDemo.op':
    'replace=替换某步 / insert=在该步之后插入 / remove=删除该步 / jump=跳回该步（仅在播时可用）',
  'agent.tool.reviseDemo.demoId': '要改的演示号（如 d2）；省略则改当前这条',
  'agent.tool.reviseDemo.index': '步号，从 0 起（见 getSnapshot 的 steps[].i）',
  'agent.tool.reviseDemo.step': 'op 为 replace / insert 时必填：新的那一步',
  'agent.tool.noModule': '当前没有激活任何模块（请先让用户选定要讲解的对象）',
  'agent.tool.loadKnowledge.notFound': '未找到知识条目：{id}（可用条目见系统提示中的清单）',
  'agent.tool.loadSkill.notFound': '未找到技能：{name}（可用技能见系统提示中的清单）',
  'agent.tool.applySceneActions.hint': '提示：用户点「下一步」后才会有下一步动作，中途可以「停止」。',
  'agent.tool.declareIntent.unsupported': '当前不支持意图声明（未接入路由）',
  'agent.tool.listDemos.note':
    '这些是**预置演示**（零 token：内容事先编排好，播放不花额度）。'
    + '播放后会排成分镜队列，每步停下等学生点「下一步」。',
  'agent.tool.playDemo.notFound': '未找到演示「{id}」（可用：{list}）',
  'agent.tool.playDemo.noView':
    '当前没有可驱动的视图，无法播放演示。可先用 navigateTo 把学生带到目标视图，再播放演示。',
  'agent.tool.playDemo.note':
    '正在播放「{title}」（共 {total} 步），每步停下等学生点「下一步」。'
    + '结束或播完后可用 replayDemo 重放（记录号 {demoId}）。',
  'agent.tool.replayDemo.none': '没有可回放的演示',
  'agent.tool.replayDemo.note':
    '正在回放第 {demoId} 号演示（共 {total} 步）。'
    + '若学生只是想再看某一步，也可以让他点「上一步」回到那一步。',
  'agent.tool.reviseDemo.failed': '修订失败',
  'agent.tool.reviseDemo.noteReload':
    '已按整改后的完整步骤重播，并快进到第 {step} 步停下；'
    + '请让学生点「下一步」看这一步改成了什么。',
  'agent.tool.reviseDemo.noteInplace': '已在原队列中就地修改，学生不必重看已经看过的步骤。',
  'agent.tool.navigateTo.noEnv': '当前环境不支持导航（无头测试）',
  'agent.tool.navigateTo.unknownTarget': '未知 target：{target}（可用：{list}）',
  'agent.tool.navigateTo.unknownTargetEmpty': '（空）',
  'agent.tool.navigateTo.needParam': 'target 为 {target} 时必须给 {name}',
  'agent.tool.navigateTo.unknownId': '未知 id：{id}（id 必须来自模块的 id 清单，不可编造）',
  'agent.tool.navigateTo.incomplete': 'target 为 {target} 的参数不完整，无法生成目标地址',
  'agent.tool.navigateTo.opened': '已打开：{label}',
  'agent.intent.unknownNode': '未知的决策节点：{intent}（可用：{list}）',
  'agent.intent.lowConfidence': '置信度 {confidence} 低于 0.6，保持当前节点「{node}」',
  'agent.intent.same': '已经在「{node}」节点',
  'agent.intent.switched': '已切到「{intent}」节点',

  // ==========================================================================
  // registry/descriptors/** —— 主动介入规则的一句话说明
  // ==========================================================================
  'agent.descriptor.crystal.ruleIdle': '在同一种晶体上停留较久且几乎没操作 → 建议打开空隙图层看看',
  'agent.descriptor.crystal.ruleLayer': '反复开关同一图层 → 讲解该图层的晶体学含义',
  'agent.descriptor.crystal.suggestInterstices': '要我把空隙图层打开，看看最密堆积里的空隙分布吗？',
  'agent.descriptor.crystal.compareNote': '使用通用 compare 节点，此处仅登记本模块的对象类型为 crystalId',
  'agent.descriptor.orbit.ruleM': '反复调 m 却没切过实/复模式 → 主动解释两者差别',
  // ★ 这两条不是文案，而是**感知痕迹的键**：`trace.toggleCounts` 以模块 facade 的
  //   `perception.fieldLabels` 的**值为键**（见 modules/orbit/facade.js，那边已改走 t()，
  //   且是在**创建 facade 时**求值的 ⇒ 键的语言取决于建模块那一刻的语言）。
  //   故 descriptor 里三种拼法都认（本语言标签 / 上一种语言标签 / 字段名）。
  //   ⚠️ 英文必须与 `modules/orbit/i18n.js` 的 `orbit.field.m` / `orbit.field.wavefunction`
  //   保持一致（那边改了措辞，这里要同步；不同步的症状是英文界面下该规则静默失效）。
  'agent.descriptor.orbit.toggleM': '切换磁量子数',
  'agent.descriptor.orbit.toggleWavefunction': '实轨道/复轨道',
}

/** 键 → 英文 */
export const en = {
  // ==========================================================================
  // core/conversation.js
  // ==========================================================================
  'agent.manifest.knowledgeTitle':
    '[Knowledge base index] (load entry bodies on demand with loadKnowledge(id); never guess their contents)',
  'agent.manifest.knowledgeLine': '{id} | {kp} | {title} | keywords: {keywords}',
  'agent.manifest.skillsTitle': '[Teaching skill index] (load the full steps with loadSkill(name))',
  'agent.snapshot.header': '[Current view snapshot (live)]',
  'agent.tool.abortedNote': 'The user stopped this round, so this action was not executed',
  'agent.noApiKey': 'No API key configured yet — enter your own model key in Settings.',
  'agent.continue.truncated':
    '(The previous reply was cut off by the length limit. Continue from where it stopped and '
    + 'do not repeat what you already wrote. Write every formula as: inline $…$ without a line '
    + 'break, and a display $$…$$ on its own line.)',

  // ==========================================================================
  // core/feynman.js
  // ==========================================================================
  'agent.feynman.notRegistered': 'The feynman skill is not registered',
  'agent.feynman.invitation':
    'Try saying it **in your own words**, as if I had never studied any of it — '
    + 'do not recite formulas, tell me the version you understand.',
  'agent.feynman.note': 'Call evaluateFeynman to assess the student after they restate it',

  // ==========================================================================
  // core/llm-client.js
  // ==========================================================================
  'agent.llm.auth': 'The API key is invalid or has no permission — check it in Settings.',
  'agent.llm.rateLimit': 'Too many requests (rate limited). Please retry in a moment.',
  'agent.llm.quota': 'Insufficient account balance — check the model service account.',
  'agent.llm.serverError': 'Model server error ({status}); you can retry.',
  'agent.llm.httpError': 'Request failed (HTTP {status})',
  'agent.llm.network':
    'Network request failed: {msg} (if this is a CORS problem, check that the service allows direct browser access)',
  'agent.llm.unknownError': 'unknown error',
  'agent.llm.downgradeMaxTokens':
    'The server rejected the current output limit (max_tokens); this request lets the server decide. You can lower it in Settings.',
  'agent.llm.downgradeStreamOptions':
    'The server does not support stream_options; retrying without it (downside: no token usage figures).',

  // ==========================================================================
  // core/params.js
  // ==========================================================================
  'agent.params.enum': '{label} must be one of {allowed}; got {got}',
  'agent.params.string': '{label} is required (a non-empty string)',

  // ==========================================================================
  // core/perception.js
  // ==========================================================================
  'agent.perception.state': '[Current state] {state}',
  'agent.perception.interaction':
    '[Interaction] idle {idle}s; switch counts {toggles}; recent actions {recent}',

  // ==========================================================================
  // core/storyboard.js
  // ==========================================================================
  'agent.sb.noPrev': 'There is no demonstration to step back from',
  'agent.sb.prevAuto': 'Cannot step back during continuous playback — switch to step-by-step first',
  'agent.sb.prevPlaying': 'The current step is still playing; wait a moment before stepping back',
  'agent.sb.prevFirst': 'This is already the first step',
  'agent.sb.overflow': 'Exceeds the step limit of one demonstration ({max}); not queued',
  'agent.sb.queued': 'Queued {queued} step(s) ({total} in total).',
  // ★ 英文句间要有空格，而中文这句是直接接在上一句后面的 —— 故把分隔空格放在
  //   **续句**的首字符上（两句都拼在 storyboard 的同一条 note 里）。
  'agent.sb.queuedManual':
    ' Waiting for the user to confirm each step with "Next step" — do not send the same actions '
    + 'again. (If useful, add one closing line mentioning "Next step / Continuous play / Stop"; '
    + '★ never open with it, and never let it take the place of the answer itself.)',
  'agent.sb.queuedAuto': ' Continuous playback is running.',
  'agent.sb.execFailed': 'Execution failed',
  'agent.sb.noSteps': 'This demonstration has no executable steps',
  'agent.sb.noReplay': 'There is no demonstration to replay (none has been played yet)',
  'agent.sb.noJump': 'There is no demonstration to jump within',
  'agent.sb.jumpAuto': 'Cannot jump during continuous playback — switch to step-by-step first',
  'agent.sb.jumpPlaying': 'The current step is still playing; please wait',
  'agent.sb.stepRange': 'Step number out of range',
  'agent.sb.noDemo': 'No such demonstration (available: {ids})',
  'agent.sb.none': 'none',
  'agent.sb.indexInvalid': 'index must be a step number of 0 or more',
  'agent.sb.stepRangeDemo': 'Step number out of range (this demonstration has {n} steps)',
  'agent.sb.needAction': 'op={op} requires step.action',
  'agent.sb.jumpOnlyLive': 'You can only jump within the demonstration being played',
  'agent.sb.cannotEmpty': 'A demonstration cannot be emptied',
  'agent.sb.unknownOp': 'Unknown op: {op}',
  'agent.sb.noBefore': 'There is no demonstration to restore',
  'agent.sb.restoreUnsupported': 'The current view does not support restore',
  'agent.sb.restoreFailed': 'Restore failed: {msg}',
  'agent.sb.restoreNoEffect': 'The restore had no effect (the view may have switched to another page)',
  'agent.storyboard.unsupportedAction': 'The current module does not support the action: {name}',
  'agent.storyboard.noModule': 'No module is active',

  // ==========================================================================
  // core/tool-registry.js
  // ==========================================================================
  'agent.tool.notAllowed': 'Tool {name} is not available in the current decision node',
  'agent.tool.notAllowedNode': ' (node: {node})',
  'agent.tool.notAllowedAvailable': '. Available tools: {tools}',
  'agent.tool.notImplemented': 'Tool not implemented yet: {name}',
  'agent.tool.badJson': 'Arguments are not valid JSON: {msg}',
  'agent.tool.execError': 'Tool execution error: {msg}',

  // ==========================================================================
  // store/conversation-store.js
  // ==========================================================================
  'agent.store.abortedPlaceholder': '(this call did not finish; a placeholder keeps the history valid)',

  // ==========================================================================
  // store/demo-favorites.js
  // ==========================================================================
  'agent.fav.noSteps': 'This demonstration has no step that can be saved',
  'agent.fav.untitled': 'Untitled demonstration',

  // ==========================================================================
  // nodes/constraints.js
  // ==========================================================================
  'agent.role.quizGen.label': 'question generation',
  'agent.role.quizGen.desc': 'produce one question (stem + options + answer) without touching the current view',
  'agent.role.explainConcept.label': 'concept explanation',
  'agent.role.explainConcept.desc': 'give a structured explanation of one knowledge point',
  'agent.role.diagnose.label': 'misconception diagnosis',
  'agent.role.diagnose.desc': 'determine the misconception and give diagnostic actions',
  'agent.role.answerCheck.label': 'answer checking',
  'agent.role.answerCheck.desc': 'judge whether the answer given by the student is right',
  'agent.role.variant.label': 'variant question',
  'agent.role.variant.desc': 'produce a variant question on the same knowledge point',
  'agent.role.feynmanStart.label': 'start a Feynman restatement',
  'agent.role.feynmanEval.label': 'assess a Feynman restatement',
  'agent.role.recommend.label': 'recommend the next step',
  'agent.role.learningEvent.label': 'record a learning event',
  'agent.role.learningEvent.desc': 'write one learning event into the learning record (each module has its own implementation)',

  'agent.nodePrompt.heading': '[Current decision node: {title}]',
  'agent.nodePrompt.input': 'Input: {items}',
  'agent.nodePrompt.sep': '; ',
  'agent.nodePrompt.output': 'Must produce: {items}',
  'agent.nodePrompt.forbidden': 'Hard prohibitions:',
  'agent.nodePrompt.fallback': 'If unavailable: {items}',
  'agent.nodePrompt.notes': 'Notes: {items}',

  'agent.node.route.title': 'intent routing',
  'agent.node.route.role':
    'You decide what the user wants to do and then hand it over to the matching node. '
    + 'You produce no teaching content yourself.',
  'agent.node.route.input0': 'the exact words of the user',
  'agent.node.route.input1': 'the current scene snapshot',
  'agent.node.route.output': 'only the structured {intent, confidence, slots}, no explanatory prose',
  'agent.node.route.forbid0': 'Do not control the view (no hand grant)',
  'agent.node.route.forbid1': 'Do not create questions (no teach grant)',
  'agent.node.route.forbid2': 'When the intent is unclear you must ask a clarifying question; never guess',
  'agent.node.route.fallback': 'Confidence below the threshold → hand over to explain with one clarifying question',

  'agent.node.explain.title': 'concept explanation',
  'agent.node.explain.role':
    'You explain knowledge points and, while explaining, bring the view to the state that '
    + 'matches the point. The explanation must land on the screen — describing a structure '
    + 'in words alone is not teaching it.',
  'agent.node.explain.input0': 'knowledge point id',
  'agent.node.explain.input1': 'learning profile (decides the depth of the explanation)',
  'agent.node.explain.output': 'explanatory text + an action sequence (each step with a speech narration). '
    + '★ Size the sequence to the question: a plain what/which question needs 2–4 steps; use 4–8 only when '
    + 'several new concepts must be built or the student must see a contradiction. Do not fill simple questions.',
  'agent.node.explain.forbid0': '★ Every number must come from queryCrystal or from a knowledge entry; never work it out in your head',
  'agent.node.explain.forbid1': 'When quoting a knowledge entry, do not alter the numbers in it',
  'agent.node.explain.forbid2': 'For content beyond the course, state explicitly that it is outside the knowledge base of this course',
  'agent.node.explain.fallback':
    'Knowledge entry missing → build the explanation from the structured fields of the crystal data instead, and state the data source',

  'agent.node.quiz.title': 'question generation',
  'agent.node.quiz.role': 'You generate practice questions. '
    + '★ The stem and the options MUST come from the fields returned by generateQuiz (stem / options); '
    + 'never write the stem or options yourself, and never state or hint at the correct answer in your text — '
    + 'the student answers by clicking the option buttons on the question card, and the program marks it. '
    + 'Write only one short lead-in sentence (do not restate the question).',
  'agent.node.quiz.input0': 'knowledge point id',
  'agent.node.quiz.input1': 'crystal id',
  'agent.node.quiz.input2': 'difficulty level',
  'agent.node.quiz.output':
    'question stem + 4 options (each with a misconception label) + the correct answer + knowledge point mapping + presetView',
  'agent.node.quiz.forbid0': '★ Do not move the current view — shifting the picture while generating a question breaks the concentration of the student',
  'agent.node.quiz.forbid1': 'Numeric questions must go through the deterministic generator; the model must not take part in producing the numbers',
  'agent.node.quiz.forbid2': 'Answer and explanation must be produced separately: freeze the answer first, then write the explanation',
  'agent.node.quiz.fallback': 'Deterministic generator unavailable → produce concept questions only, and they must pass the dual-source check',
  'agent.node.quiz.notes':
    'The presetView produced by the question-generation node is data, not an action executed '
    + 'immediately; the front end applies it only when the student clicks "view the structure". '
    + 'That gives "jump back to the structure to verify while answering" without breaking '
    + '"generating a question does not move the current view".',

  'agent.node.grade.title': 'answer checking and misconception diagnosis',
  'agent.node.grade.role':
    'You judge the answer and attribute the misconception. When the answer is wrong, your job '
    + 'is not to give the answer but to bring the view to a state in which the student can see '
    + 'the contradiction themselves.',
  'agent.node.grade.input0': 'the question',
  'agent.node.grade.input1': 'the answer given by the student',
  'agent.node.grade.output': 'right or wrong + misconception type + diagnostic action sequence + guiding wording (must not contain the answer itself)',
  'agent.node.grade.forbid0': '★ When the answer is wrong, do not give the answer directly: run the diagnostic actions so the student sees it themselves',
  'agent.node.grade.forbid1': 'Do not open with "you are wrong"',
  'agent.node.grade.forbid2': 'Diagnostic actions must stay within what the presetView of that question describes',
  'agent.node.grade.fallback': 'Misconception cannot be classified → use generic diagnosis (show the relevant structure + ask an open question)',

  'agent.node.demo.title': 'demonstration authoring',
  'agent.node.demo.role': 'You turn one teaching intention into a complete storyboard sequence so the student can see it step by step. '
    + '★ Queueing a demo is NOT the same as answering: before arranging the sequence, state in one or two sentences '
    + 'what the student actually asked (the conclusion, the key numbers, the points of contrast); '
    + 'never let "watch the demo" take the place of the answer.',
  'agent.node.demo.input0': 'the teaching intention in natural language',
  'agent.node.demo.output': 'a storyboard queue, each step with action + params + speech (narration is required)',
  'agent.node.demo.forbid0': '★ Every step must carry narration — without it the student just sees the picture jump for no reason',
  'agent.node.demo.forbid1': 'Narration must not be an instruction such as "click Next to continue" (the button already says that)',
  'agent.node.demo.forbid2': '★ 2–8 steps per turn: 2–4 for a simple question; split long flows into several turns, later actions are appended to the queue automatically',
  'agent.node.demo.fallback': 'The intention cannot be arranged into an action sequence → fall back to the explain node',

  'agent.node.teach.title': 'teaching-method execution',
  'agent.node.teach.role':
    'You advance the conversation according to the selected teaching skill. Your discipline '
    + 'comes from the skill itself — its when / steps / exit / cautions — not from improvisation.',
  'agent.node.teach.input0': 'skill name (chosen by route or given by the user)',
  'agent.node.teach.input1': 'knowledge point',
  'agent.node.teach.output': 'a conversation advancing along the skill steps; every advance must map to one of those steps',
  'agent.node.teach.forbid0': '★ Without calling loadSkill to get the full steps, do not run a teaching method from memory',
  'agent.node.teach.forbid1': 'Socratic questioning: no more than 3 rounds',
  'agent.node.teach.forbid2': 'Switch to explanation mode as soon as the student is clearly frustrated',
  'agent.node.teach.forbid3': 'Teaching by analogy must include where the analogy breaks down, otherwise it plants a new misconception',
  'agent.node.teach.fallback': 'Skill not registered → fall back to the explain node',

  'agent.node.proactive.title': 'proactive intervention',
  'agent.node.proactive.role': 'You propose help based on behaviour data. You only propose; you never execute.',
  'agent.node.proactive.input0': 'behaviour data (dwell time, switch counts, click history)',
  'agent.node.proactive.input1': 'the current scene snapshot',
  'agent.node.proactive.output': 'one hint text + suggested actions (presented as options)',
  'agent.node.proactive.forbid0': '★ Never execute actions directly; only propose them',
  'agent.node.proactive.forbid1': 'The same rule does not fire twice within 3 minutes',
  'agent.node.proactive.forbid2': 'At least 45 seconds between two proactive hints',
  'agent.node.proactive.forbid3': 'The user can turn proactive hints off globally',
  'agent.node.proactive.fallback': 'No local rule matched → stay completely silent and do not call the model (zero token cost when nothing matches)',
  'agent.node.proactive.notes':
    'This is the only node where local rules filter first and the model is called only on a '
    + 'match. The rule engine itself is generic; the concrete rules come from each module.',

  'agent.node.compare.title': 'structure comparison',
  'agent.node.compare.role': 'You compare the structural differences between two objects and guide the user to find the dimensions of difference themselves.',
  'agent.node.compare.input0': 'the two object ids',
  'agent.node.compare.output':
    'a comparison dimension table + a list of differences + a side-by-side view. '
    + '★ The dimension table and the differences come from compareCrystals({a,b}) — it only '
    + 'reads data and **does not need a 3D view**, so "compare A and B" is answerable on any '
    + 'page; for the side-by-side picture use '
    + 'navigateTo({target:"compare", crystalId, otherCrystalId}) (only consider sending it '
    + 'through applySceneActions **when a view already exists**).',
  'agent.node.compare.forbid0': '★ Both ids must be the original values returned by the upstream tool; never invent them or infer them from natural language',
  'agent.node.compare.forbid1': 'Comparison conclusions must rest on structured fields, not subjective judgement',
  'agent.node.compare.forbid2':
    '★ When there is no 3D view, do **not** use applySceneActions to "open the two crystals" — '
    + 'it only returns "no drivable view" and the student gets nothing (measured feedback: a '
    + 'student asked "compare NaCl and CsCl" and got exactly that error). First make the data '
    + 'comparison clear with compareCrystals; jump to the comparison page with navigateTo when '
    + 'the student wants to see the picture.',
  'agent.node.compare.fallback': 'Either id missing → call the search tool first to fill it in',

  // ==========================================================================
  // app.js
  // ==========================================================================
  'agent.tool.getSnapshot.desc':
    'A complete snapshot of the current view state (what is on screen, which layers are on, '
    + 'appearance and camera), including the [interaction trace] (idle time, switch counts, '
    + 'recent actions). Call it first whenever you need to know what the user is looking at '
    + 'right now and what they just did. It returns the state of the **currently active module**.',
  'agent.tool.listSceneActions.desc':
    'Fetch the **controlled action vocabulary** of the current module (which actions exist and '
    + 'the range of their parameters). The vocabulary is not kept in the always-on context; '
    + 'call this tool when you need it.',
  'agent.tool.loadKnowledge.desc':
    'Load the body of a knowledge entry by id. The system prompt only carries the index '
    + '(id/title/keywords); fetch the body on demand with this tool — **never guess what an '
    + 'entry says**.',
  'agent.tool.loadKnowledge.id': 'entry id, such as crystal:C4-1 or orbit:K3-1',
  'agent.tool.loadSkill.desc': 'Load the full steps of a teaching skill by name. The system prompt carries only skill names with a one-line description.',
  'agent.tool.loadSkill.name': 'skill name, such as feynman / socratic',
  'agent.tool.listDemos.desc':
    'List the **built-in standard demonstrations** (zero tokens: the content is pre-authored, '
    + 'so playing them costs no quota). Use it first to see what is available when the student '
    + 'wants to watch a core teaching process and you would rather not improvise one.',
  'agent.tool.declareIntent.desc':
    'Declare the user intent you inferred so the system can switch decision nodes. '
    + '**Available only while the current decision node is "intent routing".** A confidence '
    + 'below 0.6 is ignored and falls back to the explanation node.',
  'agent.tool.declareIntent.intent': 'target node name; one of: {nodes}',
  'agent.tool.declareIntent.confidence': 'confidence between 0 and 1',
  'agent.tool.declareIntent.slots': 'optional: intent-related slots, such as { skill: "feynman" }',
  'agent.tool.applySceneActions.desc':
    'Play a group of actions on the current view. The actions are queued as a **storyboard '
    + 'played step by step**: the first step runs immediately, then playback pauses until the '
    + 'user clicks "Next step". This tool therefore **returns an acknowledgement immediately '
    + 'and does not wait for playback to finish** — it is normal that the result has no '
    + 'executed field. Send 4–8 actions at a time, and **every step must carry a speech '
    + 'narration**.',
  'agent.tool.applySceneActions.speech': 'narration for this step (required)',
  'agent.tool.navigateTo.desc':
    'Take the student to a given page or crystal. Use it when what the student wants to see is '
    + 'not on the current page — for example asking about a crystal on the home page, or '
    + 'needing to jump to the comparison page. Any id must come from the id list of the module '
    + '(the tool validates it).',
  'agent.tool.navigateTo.target': 'target page (the allowed values are declared by the module)',
  'agent.tool.navigateTo.homeLabel': 'Back to the portal',
  'agent.tool.playDemo.desc':
    'Play a **built-in standard demonstration** (zero tokens). Like applySceneActions it turns '
    + 'into a storyboard queue and pauses at every step until the user clicks "Next step". It '
    + 'is meant for the few most central teaching processes; one-off requests not covered by a '
    + 'script should still be arranged by you.',
  'agent.tool.playDemo.id': 'demonstration id, from listDemos',
  'agent.tool.replayDemo.desc':
    '**Replay** a demonstration played earlier. It **remains available after it ends or '
    + 'finishes** — demonstration records are independent of the playback queue, so stopping '
    + 'does not lose them. Use it when the student says "show me that again"; there is no need '
    + 'to arrange the actions anew. Omit demoId to replay the most recent one.',
  'agent.tool.replayDemo.demoId': 'optional: demonstration record id (such as d1); omit to replay the most recent one',
  'agent.tool.reviseDemo.desc':
    'Revise **one** demonstration: replace a step / insert after a step / remove a step / jump '
    + 'back to a step. ★ Use it when the student says "step 3 of that demonstration is wrong, '
    + 'say it differently, that was too fast" — do **not** resend the whole thing with '
    + 'applySceneActions: resending opens a **new** demonstration and every step the student '
    + 'has already seen and confirmed is lost. '
    + '★ **A demonstration that has already finished can be revised too** (that is the most '
    + 'common case): the program replays the full revised step list and fast-forwards to the '
    + 'changed step, so no other step is lost; the steps in the acknowledgement are the '
    + 'complete revised list, use it to double-check. '
    + 'demoId and step numbers come from the "demonstration playback" line of getSnapshot '
    + '(steps[].i is the step number).',
  'agent.tool.reviseDemo.op':
    'replace=replace a step / insert=insert after that step / remove=remove that step / jump=jump back to that step (only while playing)',
  'agent.tool.reviseDemo.demoId': 'demonstration id to revise (such as d2); omit to revise the current one',
  'agent.tool.reviseDemo.index': 'step number, starting at 0 (see steps[].i in getSnapshot)',
  'agent.tool.reviseDemo.step': 'required when op is replace / insert: the new step',
  'agent.tool.noModule': 'No module is active (first let the user choose what to talk about)',
  'agent.tool.loadKnowledge.notFound': 'Knowledge entry not found: {id} (see the index in the system prompt for available entries)',
  'agent.tool.loadSkill.notFound': 'Skill not found: {name} (see the index in the system prompt for available skills)',
  'agent.tool.applySceneActions.hint': 'Note: the next action runs only after the user clicks "Next step"; they can click "Stop" at any time.',
  'agent.tool.declareIntent.unsupported': 'Intent declaration is not supported here (no router connected)',
  'agent.tool.listDemos.note':
    'These are the **built-in demonstrations** (zero tokens: the content is pre-authored, so '
    + 'playing them costs no quota). Playing one queues a storyboard and pauses at every step '
    + 'until the student clicks "Next step".',
  'agent.tool.playDemo.notFound': 'No such demonstration "{id}" (available: {list})',
  'agent.tool.playDemo.noView':
    'There is no drivable view right now, so a demonstration cannot be played. Use navigateTo '
    + 'to take the student to the target view first, then play it.',
  'agent.tool.playDemo.note':
    'Now playing "{title}" ({total} steps); it pauses at every step until the student clicks '
    + '"Next step". After it ends or finishes, replayDemo can play it again (record id {demoId}).',
  'agent.tool.replayDemo.none': 'There is no demonstration to replay',
  'agent.tool.replayDemo.note':
    'Replaying demonstration {demoId} ({total} steps). If the student only wants to see one '
    + 'step again, they can also click "Previous step" to go back to it.',
  'agent.tool.reviseDemo.failed': 'Revision failed',
  'agent.tool.reviseDemo.noteReload':
    'Replaying the full revised step list, fast-forwarded to step {step} and paused; ask the '
    + 'student to click "Next step" to see what this step became.',
  'agent.tool.reviseDemo.noteInplace': 'Changed in place in the current queue; the student does not need to watch the steps they have already seen.',
  'agent.tool.navigateTo.noEnv': 'Navigation is not supported in this environment (headless test)',
  'agent.tool.navigateTo.unknownTarget': 'Unknown target: {target} (available: {list})',
  'agent.tool.navigateTo.unknownTargetEmpty': '(empty)',
  'agent.tool.navigateTo.needParam': 'target {target} requires {name}',
  'agent.tool.navigateTo.unknownId': 'Unknown id: {id} (ids must come from the id list of the module; never invent one)',
  'agent.tool.navigateTo.incomplete': 'The parameters for target {target} are incomplete; cannot build the destination',
  'agent.tool.navigateTo.opened': 'Opened: {label}',
  'agent.intent.unknownNode': 'Unknown decision node: {intent} (available: {list})',
  'agent.intent.lowConfidence': 'Confidence {confidence} is below 0.6; staying on node "{node}"',
  'agent.intent.same': 'Already on node "{node}"',
  'agent.intent.switched': 'Switched to node "{intent}"',

  // ==========================================================================
  // registry/descriptors/**
  // ==========================================================================
  'agent.descriptor.crystal.ruleIdle': 'stayed on one crystal for a long time with almost no interaction → suggest opening the void layer',
  'agent.descriptor.crystal.ruleLayer': 'toggling the same layer back and forth → explain the crystallographic meaning of that layer',
  'agent.descriptor.crystal.suggestInterstices': 'Shall I turn on the void layer so we can look at how the voids are distributed in the closest packing?',
  'agent.descriptor.crystal.compareNote': 'uses the generic compare node; this entry only registers the object type of this module as crystalId',
  'agent.descriptor.orbit.ruleM': 'kept changing m without ever switching the real/complex mode → explain the difference proactively',
  // ⚠️ 这两条**不是普通译文，是跨区契约**：主动介入规则用它们做
  //   `trace.toggleCounts` 的**键**，而那个键由 `modules/orbit/facade.js` 的
  //   `perception.fieldLabels` 产出（`t('orbit.field.m')` / `t('orbit.field.wavefunction')`）。
  //   两份**逐字必须一致**，否则英文界面下规则静默失效（不报错、永不触发）。
  //   曾一度把它们留成中文原文 —— 那就是上面这种失效，已按 orbit 的英文值改正。
  'agent.descriptor.orbit.toggleM': 'change magnetic quantum number',
  'agent.descriptor.orbit.toggleWavefunction': 'real/complex orbital',
}

/**
 * 中文原文 → 英文（DOM 扫描替换用）。
 *
 * ★ 本区只有**一处**真正上 DOM：descriptor 的 `title` 会作为门户首页模块卡里的
 *   一个**文本节点**渲染（`首页 <span class="pl-name">${m.title}</span>`），
 *   故这几条模块名走 `text` 表；其余全部走上面的键表。
 * ★ 键必须与 DOM 里**文本节点的整段内容**逐字一致（首尾空白会被忽略）。
 */
export const text = {
  // ★ 三个模块名取自参赛配图（`比赛配图-1.pptx` 第 1 页）：
  //   轨道视界 / 点群观鉴 / 晶典在线。它们会作为**文本节点**渲染在门户首页的模块卡上。
  '轨道视界': 'Orbital Horizon',
  '点群观鉴': 'Point Group Explorer',
  '晶典在线': 'Crystal Atlas',
  '晶体场理论': 'Crystal field theory',
  // ★ 与 shell 区的同名条目重复是**刻意**的：会话默认标题以中文原文存盘，面板把它
  //   当文本节点渲染；而覆盖率守卫在 `--area agent` 下只加载本区的字典。
  //   （运行时重复登记无害——tsrc 取第一个命中的。）
  '新对话': 'New chat',
}

/**
 * 路由关键词表（**数据，不是界面文案**）。
 *
 * ★ 为什么放在字典里而不是写在 descriptor 里：
 *   `capabilities` 是 `routeByText()` 的匹配依据（`q.includes(keyword)`），
 *   它既不是 DOM 文本、也不是发给模型的文本，**翻译它没有意义**——正确做法是
 *   **双语并列**：中文用户与英文用户问同一件事，都该路由到同一个模块。
 *   于是这里存"中文|英文"的并列清单，descriptor 用 `kw()` 取出来拆成数组。
 *   （路由匹配两端都会 `toLowerCase()`，英文关键词直接写小写即可。）
 *
 * ★ 分隔符是 `|`；单词里不要出现 `|`。
 */
export const keywords = {
  'agent.kw.crystal.structures':
    '晶体|晶胞|点阵|堆积|配位|空隙|空间群|晶格|金刚石|石墨|干冰|石英|钙钛矿'
    + '|面心立方|体心立方|六方最密|密堆积|球棍模型'
    + '|crystal|unit cell|lattice|packing|coordination|void|space group'
    + '|diamond|graphite|dry ice|quartz|perovskite'
    + '|face-centered cubic|body-centered cubic|hexagonal closest packing|close packing|ball-and-stick',
  'agent.kw.crystal.symmetryInCrystal':
    '对称元素|旋转轴|镜面|等效点系|布拉维'
    + '|symmetry element|rotation axis|mirror plane|equivalent positions|bravais',
  'agent.kw.crystal.structureProperty':
    '同素异形体|结构决定性质|allotrope|structure determines properties',
  'agent.kw.orbit.orbitals':
    '原子轨道|波函数|量子数|径向分布|角度分布|节面|节点|球谐|相位|杂化|叠加态|电子云|概率密度'
    + '|atomic orbital|wave function|quantum number|radial distribution|angular distribution'
    + '|nodal plane|spherical harmonic|phase|hybridization|superposition|electron cloud|probability density',
  'agent.kw.orbit.symmetryInOrbital':
    '轨道的对称性|轴对称|相位缠绕|orbital symmetry|axial symmetry|phase winding',
  'agent.kw.orbit.quantum':
    '能级|简并|力学量|期望值|维里定理'
    + '|energy level|degeneracy|observable|expectation value|virial theorem',
  'agent.kw.symmetry.pointGroup':
    '点群|对称操作|对称元素|对称轴|镜面|反演中心|旋转轴|映轴|特征标表'
    + '|point group|symmetry operation|symmetry element|symmetry axis|mirror plane'
    + '|inversion center|improper rotation|character table',
  'agent.kw.symmetry.symmetryOps':
    '恒等|旋转|反映|反演|旋转反映|identity|reflection|inversion|rotoreflection',
  'agent.kw.symmetry.applications':
    '红外活性|拉曼活性|手性|偶极矩|分子振动'
    + '|IR active|Raman active|chirality|dipole moment|molecular vibration',
  'agent.kw.template.crystalField':
    '晶体场|配位场|分裂能|d轨道分裂|八面体场|四面体场|强场|弱场|高自旋|低自旋'
    + '|光谱化学序列|晶体场稳定化能'
    + '|crystal field|ligand field|splitting energy|d-orbital splitting|octahedral field'
    + '|tetrahedral field|strong field|weak field|high spin|low spin|spectrochemical series'
    + '|crystal field stabilization energy',
}

registerDict('agent', { zh, en, text })
