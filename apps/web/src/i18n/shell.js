/**
 * i18n/shell.js —— 统一壳（门户首页 · 路由 · 面板接线 · 顶栏）的中英词典
 *
 * ---------------------------------------------------------------------------
 * 为什么这里是 `import '../../../..'` 这种相对路径，而不是 `@i18n/index.js`
 * ---------------------------------------------------------------------------
 * `@i18n` 是 **vite 的别名**，Node 不认。而覆盖率守卫（`tools/check-i18n.mjs`）
 * 是**在 Node 里 import 本文件**来读"哪些原文已经被登记"的 —— 用别名的话守卫
 * 一 import 就炸（报"读不了字典"），而它只会警告后跳过，于是这块**永远显示 0 覆盖**。
 * 所以字典文件一律走相对路径。
 *
 * 本文件必须是**纯数据**：不 import DOM、不 import three、不 import 任何运行时。
 *
 * ---------------------------------------------------------------------------
 * 两张表的分工（见 packages/i18n/index.js 顶部的说明）
 * ---------------------------------------------------------------------------
 *   `text`：中文原文 → 英文。给 `sweep()` 扫 DOM 用。**壳里的 DOM 文案走这张表**，
 *          这样模板串不用改成一条条 `t()`。
 *   `zh`/`en`：键 → 文案。给两种扫描替换做不到的情形：
 *             ① 原文里带变量（`已切到「X」模块`）；② 字符串**不进 DOM**
 *                （发给模型的系统提示词）—— 那类必须显式调 `t()`。
 */
import { registerDict } from '../../../../packages/i18n/index.js'

/** 键 → 中文（带参数或不进 DOM 的那些） */
export const zh = {
  // ---- 发给模型的系统提示词。★ 不进 DOM，也不该被扫描替换 ----
  'shell.prompt.role': '你是结构化学教学智能体，服务于结构化学课程的教与学。'
    + '你不是问答机器人，而是能感知用户在做什么、能动手把话演示出来的教学智能体——'
    + '凡是可以用三维视图演示的，都要用 applySceneActions 演示，而不是只用文字描述。'
    /**
     * ★★ 2026-10-12 用户截图：设置里明明勾了"显示思考"，展开一看**思考过程是英文的**
     *   （正文是中文）—— 学生点开思考块读到的是一段与界面语言不一致的英文推理。
     *   界面语言由宿主的 i18n 决定（中文/English 两套），所以这里只说一件事：
     *   **思考过程与回答用同一种语言**，别让"能看懂的正文"配"看不懂的思考"。
     *   ★ 不改模型的思维自由，只钉语言：推理可以跳跃、可以试错，但要用学生看得懂的语言写出来。
     */
    + '★ 思考过程（reasoning）与正文**必须用同一种语言**：面向中文界面时，推理也用简体中文写，'
    + '不要用英文思考——学生会点开思考块看，英文推理等于把最关键的那一段藏起来。'
    /**
     * ★★ 2026-10-08 十问实测后补的两条铁律（用户要求"检查是否符合学生的学习规律"）。
     *
     *   「能用演示就要演示」这句话**被模型过度执行**了：问"水是什么点群""比较 NaCl 和 CsCl"
     *   这类直接问题时，它排一段 8–9 步的演示、再加两三句反问，**正文里一个答案都没有**
     *   （实测 Q4 全文 394 字，没有结论；Q8 只列了演示步骤）。学生看完不知道答案，
     *   而且反问的难度**高于**他问的问题——学习的坡度是反的。
     *   所以这里把次序写死：**先答案，后演示**；演示是手段，不是回答。
     *   ★ 步数也一并约束：单纯"是什么"类问题 2–4 步足够（原先一律排满 8 步，
     *     实测每问 13k–24k tokens、7–9 步，认知负荷与成本都偏高）。
     */
    + '★ 次序不能倒：学生问"是什么 / 有哪些 / 为什么 / 对不对"时，正文**必须先用一两句话给出直接答案**'
    + '（结论 + 关键数值或符号，数值取自工具），**然后**才排演示。'
    + '演示是加深理解的手段，**不能代替回答**——只排演示、不给结论，学生看完仍然不知道答案。'
    + '★ 反问的难度不得高于学生问的问题：他问"是什么"，就先告诉他是什么，再视情况追问。'
    /**
     * ★★ 同一个十问里，"我这样想对吗？"这一问最典型：模型给了两张数据的对比表、
     *   却**始终没有说"对不对"**（学生看完仍然不确定自己的理解错在哪）。
     *   这正是"符合学生学习规律"的底线：先给判定，再给证据。
     */
    + '★ 学生问"这样想对吗 / 我理解得对不对"时，**第一句必须是明确判定**（对 / 不对 / 部分对），'
    + '紧接着指出"对在哪、错在哪"；不要只摆数据让他自己下结论。'
    /**
     * ★★ 2026-10-08（用户问："3p_z 与水的对称性有关吗"，动作却只涉及水分子，这对吗？）：
     *   一次只能有一个板块在台上（模块切换是路由级的），两板块的画面**不可能同屏**。
     *   原先模型只演示了对称性一侧，正文也没说"3p_z 在轨道视界、要不要切过去看"——
     *   学生看着水分子的动画读 3p_z 的哑铃，两边对不上。
     */
    + '★ 跨板块的问题（同时涉及两个板块，例如"3p_z 与水的对称性有关吗"）：'
    + '两个板块的画面**不能同屏**，所以正文里必须说清**本次演示的是哪一侧**、'
    + '另一侧的关键结论用文字给出，并**主动提出**可以切到另一个板块再演示一遍；'
    + '不要只演示一侧就当作两件事都演示过了。'
    + '★ 演示步数按问题复杂度给：单纯的"是什么 / 有哪些"类问题 2–4 步就够，不要一律排满 8 步。'
    /**
     * ★★ 2026-10-13（用户报：模型把"清单里没有过氧化氢"读成"超纲/不在知识库范围内"）：
     *   知识清单**按知识点**组织（C1–C8 / P1–P5 / K1–K9），清单里只给 id/标题/关键词，
     *   而**分子名往往只出现在正文里** ⇒ 按分子名搜清单必然落空 ✗，据此断言"超纲"就错了 ✗。
     *   （其实 H₂O₂ 就在 symmetry:P2-3 / P2-7 里。）与 loadKnowledge 的工具描述同一口径。
     */
    + '★ 查知识时注意：清单是**按知识点**组织的，标题/关键词里未必有分子名。'
    + '按分子名搜不到就改按**主题**搜（如「Cₙ 群」「判群流程」「构象与点群」），'
    + '并说明这条知识在哪个知识点里；**不要**因此说"超纲 / 不在知识库范围内"。'
    /**
     * ★★ 2026-10-14（用户："用户不需要知道来源、知识条目"）：
     *   模型把内部出处写进了给学生的正文（截图里那句"（来源：queryPointGroup 实测结果 +
     *   知识条目 symmetry:P2-3）"）✗ —— 学生不需要、也读不懂工具名与条目 id；
     *   而"数值必须来自程序"这条纪律本身是**给审核/开发看的**，不是给学生看的。
     *   ⇒ 明确：**要交代依据，用学科语言**；内部 id / 工具名 / 字段名留在正文之外。
     */
    + '★ 给学生的正文里**不要**出现内部出处：工具名（如 queryPointGroup）、'
    + '知识条目 id（如 symmetry:P2-3）、快照字段名。要交代依据就用**学科语言**'
    + '（"按点群判定规则""由结构算出"）；内部 id 是给程序与审核看的，不进正文。'
    /**
     * ★★ 2026-10-14（用户质疑："把元素全部隐去就只剩 1 个对称元素"？）：
     *   那句话是模型现场说的（全仓源码里 0 命中 ⇒ 不是预置脚本、也不在知识库），
     *   而它**自相矛盾** ✗：本应用里"元素"一律指**对称元素**，把对称元素全隐去就什么都不剩了。
     *   模型想说的是"画面上只画出 1 个对称元素、而群阶是 2"（H₂O₂ 是 C₂：1 个元素 / 2 个操作 ✓）。
     *   ⇒ 钉住术语：**"元素"只指对称元素，"原子"才指原子**；讲"操作数≠元素数"时说清
     *     "E 也是操作、但 E 不占任何对称元素"。
     */
    + '★ 术语要一致：本应用里**"元素"一律指对称元素**，**"原子"**才指原子。'
    + '讲"操作数 ≠ 元素数"时别写成"把元素全部隐去…"（隐去对称元素就什么都不剩，句子自相矛盾）；'
    + '要说"画面上只画出 **1 个**对称元素（那根 C₂ 轴），而它的群阶是 **2** —— '
    + '因为 E 也是一个操作，而 E 不占任何对称元素"。',
  'shell.prompt.roleCrystal': '涉及配位数、空隙数、晶胞参数、密度等一切数值，必须用 queryCrystal 取得，不要口算。',
  'shell.prompt.roleOrbit': '节面数、径向峰位、能级、简并度等一切数值必须用 queryOrbital 取得，不要凭记忆或口算。',
  /**
   * ★★ 2026-10-14（用户两条）：① "甲烷对称元素全部显示出来有点乱，智能体应避免把对称元素
   *   很多的点群的所有对称元素同时列出"；② 图 2 里"先切分子、再引用新分子的元素 key"被拒。
   *
   *   ②的真因（已实测复现）：演示是**整批**先校验、再执行的，而校验用的是**当前**分子 ——
   *   所以 [切换分子 → 显示全部 → 播放 C5#1] 这一步会按**旧分子**（甲烷）的元素表校验 ✗
   *   （可用列表正是甲烷的 C2#1..3 / C3#1..4 / S4#1..3 / sigma_d#1..6）。
   *   ⇒ 解决办法是**分两批**：先切分子，等它真生效后再下发引用新分子元素的那几步。
   */
  'shell.prompt.roleSymmetry': '点群符号与对称元素清单一律用 queryPointGroup 取得；晶体示例走空间群（同一条命令）。'
    + '★ 对称元素多的点群（甲烷 Td 有 16 个）**不要"一键全部显示"** —— 画面会糊成一片；'
    + '按**族**演示（四根 C₃ → 三根 C₂ → 三根 S₄ → 六个 σ_d），或只显示正在讲的那一类。'
    + '★ 同一条演示里**先"切换分子"、再引用该分子特有的元素 key** 会被拒（整批校验用的是**当前**分子的元素表）；'
    + '要引用新分子的元素，请**分两批下发**：先切分子，确认生效后再排引用它元素的那几步。',

  // ---- 带变量的动态串（扫描替换做不到，必须走键） ----
  'shell.panel.switched': '已切到「{title}」模块',
  'shell.panel.restored': '已恢复上次的对话（共 {n} 条）——右上角菜单可开新会话',
  'shell.home.enter': '进入{title}',
  'shell.home.locked': '{title}：尚未接入本应用',
  /**
   * ★★ 2026-10-14 首页改版（用户给了完整设计规范）：导航栏 / Hero / 三卡 / 设置 / 页脚。
   *   文案**全部走键**（不赌运行时扫描的时机）—— 见 shell/pages/home.js 顶部说明。
   */
  'shell.home.brand': '结构化学教学智能体',
  'shell.home.titleSm': '结构化学',
  'shell.home.titleLg': '教学智能体',
  'shell.home.sub': '场景感知式 AI 教学智能体',
  'shell.home.slogan': '揭秘微观结构 · 启发深度思考 · 引导自主学习',
  'shell.home.desc': '面向结构化学课程，提供原子轨道可视化、分子点群分析、晶体点阵解析，'
    + '将抽象微观结构三维化，辅助课堂教学与自主研习。',
  'shell.home.cta': '开始探索',
  'shell.home.askAgent': '问智能体',
  'shell.home.askHint': '有课程问题直接问它 —— 它一边讲，一边把画面调出来。',
  'shell.home.settingsTitle': '界面与模型设置',
  'shell.home.setTheme': '界面风格',
  'shell.home.themeSystem': '跟随系统',
  'shell.home.themeLight': '浅色',
  'shell.home.themeDark': '深色',
  'shell.home.setLang': '界面语言',
  'shell.home.setModel': '模型与教学偏好',
  'shell.home.openSettings': '打开设置（API Key · 模型 · 教学偏好）→',
  'shell.home.comingSoon': '即将接入',
  /**
   * ★★ 2026-10-14（用户："现在还没有申请下软著"）：
   *   原先页脚写的是「© 2026 结构化学教学智能体 | …」——`©` 容易被读成"已登记/已获著作权"，
   *   而软件著作权**尚未申请下来**。改成像"署名 + 年份"那样的中性表述，不暗示任何登记状态。
   */
  'shell.home.footer': '结构化学教学智能体 · 2026 | 面向结构化学课程的教学科研工具',
  'shell.home.orbit.sub': '类氢原子轨道三维可视化',
  'shell.home.orbit.desc': '直观观测 s/p/d/f 轨道的三维形态、相位与截面，把抽象波函数可视化。',
  'shell.home.orbit.tag': '微观世界可观察',
  'shell.home.symmetry.sub': '分子对称性与分子点群',
  'shell.home.symmetry.desc': '识别对称操作，判定分子点群，拆解对称元素，理解分子结构规律。',
  'shell.home.symmetry.tag': '结构规律易剖析',
  'shell.home.crystal.sub': '晶体结构与点阵型式',
  'shell.home.crystal.desc': '解析晶胞与点阵类型，可视化晶体堆积，打通结构—性质关联。',
  'shell.home.crystal.tag': '构效关系得贯通',
  'shell.lib.count': '{n} 种',
  /**
   * ★ 练习改由模型出题（用户报「练习功能应由 LLM 出题」）。
   *   这条是替用户**发出**的请求原文，走的正是普通对话通路 —— 所以它在 zh/en 表里，
   *   不在 text 表里（text 表是"DOM 上的中文原文→英文"的扫描替换表，塞错了地方会静默失效）。
   *   ★ 明确要求"用工具取题与答案、不要口算"：本仓库的硬约定是数值一律程序算。
   */
  'shell.practice.askLlm': '我要练「{kp}」这个知识点。'
    + '请**调用 generateQuiz 工具**出一道题（不要自己写题干或选项、不要口算答案）——'
    + '题目卡会自动出现，你只需用一句话说明这道题考什么。',
  /** ★ 2026-10-08：模型没走工具时，宿主直接函数调用出题引擎兜底，并如实告诉学生 */
  'shell.practice.toolFallback': '模型这一轮没有调用出题工具，已直接调用 generateQuiz 生成题目',
  /**
   * ★★ 2026-10-12：练习入口按板块分流（用户截图：在点群观鉴里点练习，列的是晶体知识点）。
   *   三个板块的练习能力本来不同 ⇒ 分开说，不假装每个板块都有题库。
   */
  'shell.practice.chooseBoard': '选择要练习的板块：',
  'shell.practice.board.crystal': '晶典在线 · 晶体结构',
  'shell.practice.board.orbit': '轨道视界 · 原子轨道',
  /** ★ 用户反馈："这里少了点群在线" —— 点群也有题库了，选板块时必须列出 */
  'shell.practice.board.symmetry': '点群观鉴 · 分子对称性',
  'shell.practice.boardCrystalTitle': '晶典在线 · 晶体结构 —— 选择要练习的知识点：',
  'shell.practice.noBank': '「点群观鉴」还没有自己的题库（出题要有数值化的判据与错因库，这个板块的数据还在建）'
    + '—— 你可以先直接问我，或去下面两个板块练。',
  'shell.practice.orbitFailed': '轨道题库没能启动（出题引擎未就绪），请稍后再试。',
  /** ★ 用户第 7 条：点群题库补齐后，同样的启动失败也要如实说 */
  'shell.practice.symFailed': '点群题库没能启动（出题引擎未就绪），请稍后再试。',
  /**
   * ★★ 2026-10-12（用户报："没配置 api key 时，点击练习会出现图中 bug"）：
   *   练习闭环每一步都要模型（讲解 → 出题 → 判分），没配 Key 时点进来只会
   *   留下一堆点了没反应的卡片 ✗。改成**一张**能照着做的卡片：说清原因 + 一个直接打开设置的按钮。
   */
  'shell.practice.needKey': '练习需要先配置 API Key —— 出题、讲解与判分都要靠模型完成。点下面的按钮填写即可。',
  'shell.practice.openSettings': '去设置里填写 API Key',
  /**
   * ★★ 2026-10-12（用户第 1 条）：面板输入框提示**按板块**说 —— 原先写死"晶体结构"，
   *   站在轨道/点群板块里也照旧这么说。末尾那句操作提示四个板块相同，就重复写进去
   *   （组装成一个完整句子最省事：它是 DOM 属性，英文侧也要逐条对应）。
   */
  'shell.panel.ph.home': '问结构化学的问题，或让我演示…（Enter 发送，Shift+Enter 换行）',
  'shell.panel.ph.crystal': '问晶体结构的问题，或让我演示…（Enter 发送，Shift+Enter 换行）',
  'shell.panel.ph.orbit': '问原子轨道的问题，或让我演示…（Enter 发送，Shift+Enter 换行）',
  'shell.panel.ph.symmetry': '问分子对称性的问题，或让我演示…（Enter 发送，Shift+Enter 换行）',
  /** ★ 用户第 2 条：配好 Key 后给一句明确的成功回执（红字同时被撤掉） */
  'shell.panel.keyReady': 'API Key 已配置，可以开始提问了',
  /**
   * ★ 面板开场白：**统一身份**（用户报「三个板块的智能体没有综合成为一个总智能体」）。
   *   由宿主（main.js 的 greeting）统一给出，模块只接自己的示例问题。
   *   同 `shell.practice.askLlm`：这是 `t()` 的键，不在 text 表里。
   */
  'shell.panel.greetHead': '我是结构化学教学智能体',
  'shell.panel.greetScope': '我覆盖三个板块：轨道视界 · 点群观鉴 · 晶典在线 —— '
    + '问到哪个就切到哪个，不用你操心现在该找谁。',
  // ★ 强调用 <b>，**不**用 Markdown 的 `**`：这段是 innerHTML，`**` 会**原样显示**
  //   （用户报「『我是**一个**智能体』去掉 **」）。凡是进 innerHTML 的文案都适用这一条。
  'shell.panel.greetInModule': '我是<b>同一个</b>智能体，覆盖三个板块；当前在「{title}」这一块。',
  // 保存图片：失败时拼了错误信息，只能走 t()（见 shell/save-image.js 的说明）
  'shell.save.failed': '保存失败：{msg}',
  'shell.save.failedCapture': '抓图失败：画布还没画好，稍等一下再试',
  'shell.save.savedTo': '已保存到「{dir}」',
  'shell.save.dirDenied': '没有写入该文件夹的权限，已改为放到下载目录',
  /**
   * ★★ 2026-10-08：Chromium 的 NotAllowedError（"The request is not allowed by the user agent
   *   or the platform in the current context"）原先**原样甩给用户**（英文异常），
   *   而它其实有明确的可操作含义：授权过期 / 平台限制 / 内置浏览器不支持。
   *   现在换成能照着做的中文说明 + 下载兜底。
   */
  'shell.save.notAllowed': '浏览器没有允许写入该位置（授权可能已过期，或这个浏览器不支持该功能）——可点「设置保存位置…」重新授权',
  'shell.save.noSpace': '磁盘空间不足，没能写入',
  'shell.save.fellBackToDownload': '已改为放到浏览器下载目录',
  'shell.save.downloaded': '已放到浏览器下载目录（可在菜单里设置保存位置）',
  'shell.save.saved': '已保存',
  'shell.save.dirSet': '保存位置已设为「{dir}」',
  'shell.save.noDirApi': '本浏览器不支持选文件夹，已放到下载目录',
  'shell.save.noDirApiHint': '本浏览器不支持选择保存位置，图片会放到下载目录',
  'shell.save.currentDir': '保存位置：{dir}',
  'shell.save.pickFirst': '还没设置保存位置 —— 点「保存图片」时会先让你选一个文件夹',
  // 「打开保存位置」（应用内）：网页无法弹出系统资源管理器，只能列出来给你看
  'shell.save.galleryTitle': '保存位置「{dir}」里的图片',
  'shell.save.galleryEmpty': '这个文件夹里还没有保存过图片',
  'shell.save.galleryCount': '共 {n} 张',
  'shell.save.download': '下载',
  'shell.save.close': '关闭',
  'shell.save.reopenDir': '或点「设置保存位置…」重新选一次',
}

/** 键 → 英文 */
export const en = {
  'shell.prompt.role': 'You are a structural chemistry teaching agent serving teaching and learning '
    + 'in a structural chemistry course. You are not a question-answering bot: you are a teaching '
    + 'agent that can perceive what the user is doing and act things out. Whenever something can be '
    + 'demonstrated in the 3D view, demonstrate it with applySceneActions instead of describing it in words only. '
    + '★ Reasoning and the reply MUST be written in the same language: when the interface is in Chinese, '
    + 'reason in Simplified Chinese — never in English. Students open the thinking block, so reasoning in a '
    + 'different language hides the most important part. '
    + '★ Never invert the order: when the student asks what / which / why / whether, the reply MUST open '
    + 'with a direct answer in one or two sentences (conclusion plus the key numbers or symbols, taken from '
    + 'the tools) and only then queue the demo. A demo is a means of deepening understanding, NOT a substitute '
    + 'for the answer — a demo without a conclusion leaves the student without an answer. '
    + '★ A follow-up question must never be harder than the question asked: if they ask "what is it", tell them first. '
    + '★ A cross-module question (touching two modules, e.g. "is 3p_z related to the symmetry of water"): the two views '
    + 'CANNOT be on screen at the same time, so say clearly which side you are demonstrating, give the other side\'s '
    + 'key conclusion in words, and offer to switch to the other module and demonstrate it as well — never present one '
    + 'side as if both had been shown. '
    + '★ When the student asks "is my reasoning right / did I get it right", the FIRST sentence must be an explicit '
    + 'verdict (right / wrong / partly right), immediately followed by what is right and what is wrong — never just '
    + 'lay out data and let them draw their own conclusion. '
    + '★ Size the demo to the question: a plain what/which question needs 2–4 steps, not a full 8-step sequence. '
    + '★ When looking things up: the knowledge index is organised **by knowledge point**, and its '
    + 'titles/keywords need not contain molecule names. If a molecule name finds nothing, search by '
    + '**topic** instead (e.g. “Cₙ groups”, “point-group workflow”, “conformation and point group”) and '
    + 'say which knowledge point covers it — do not call something out of scope just because a molecule '
    + 'name is not in the index. '
    + '★ Never put internal provenance into student-facing text: no tool names (queryPointGroup), no '
    + 'knowledge-entry ids (symmetry:P2-3), no snapshot field names. To justify a claim, use subject '
    + 'language ("by the point-group rules", "computed from the structure"): those ids are for the '
    + 'programme and for review, not for the student. '
    + '★ Keep the terminology straight: in this app **“元素” always means a symmetry element**; an atom '
    + 'is **“原子”**. When contrasting the number of operations with the number of elements, never write '
    + '“hide all the elements and only one element is left” (hiding the symmetry elements leaves nothing — '
    + 'the sentence contradicts itself). Say instead: “only **one** symmetry element is drawn (the C₂ '
    + 'axis), yet the group order is **2** — because E is an operation too, and E occupies no symmetry '
    + 'element.”',
  'shell.prompt.roleCrystal': 'For any number — coordination number, void count, cell parameters, density — '
    + 'obtain it with queryCrystal. Never compute or recall it yourself.',
  'shell.prompt.roleOrbit': 'For any number — node count, radial peak positions, energy levels, degeneracy — '
    + 'obtain it with queryOrbital. Never rely on memory or mental arithmetic.',
  'shell.prompt.roleSymmetry': 'Always obtain point-group symbols and symmetry-element lists with queryPointGroup; '
    + 'crystal examples go through the space group (same command). '
    + '★ For element-rich point groups (methane Td has 16 elements) **never switch them all on at once** — '
    + 'the view turns to mush; demonstrate **family by family** (four C₃ → three C₂ → three S₄ → six σ_d), '
    + 'or show only the family you are talking about. '
    + '★ Inside one demo, **switching molecule first and then referencing that molecule\'s element keys** '
    + 'is rejected (a batch is validated against the **current** molecule\'s element table); to reference a '
    + 'new molecule\'s elements, **send two batches**: switch molecule first, then queue the steps that use '
    + 'its element keys.',

  'shell.panel.switched': 'Switched to the "{title}" module',
  'shell.panel.restored': 'Restored your previous conversation ({n} messages) — the top-right menu starts a new one',
  'shell.home.enter': 'Open {title}',
  'shell.home.locked': '{title}: not available in this app yet',
  // ★ 2026-10-14 首页改版（与 zh 表逐键对应）
  'shell.home.brand': 'Structural Chemistry Teaching AI Agent',
  'shell.home.titleSm': 'Structural Chemistry',
  'shell.home.titleLg': 'Teaching AI Agent',
  'shell.home.sub': 'Scene-aware AI Teaching Agent',
  'shell.home.slogan': 'Reveal microscopic structures · Inspire in-depth thinking · Guide autonomous learning',
  'shell.home.desc': 'For structural chemistry courses: atomic-orbital visualization, molecular '
    + 'point-group analysis and crystal-lattice analysis — rendering abstract microscopic structures '
    + 'in 3D to assist classroom teaching and self-study.',
  'shell.home.cta': 'Start exploring',
  'shell.home.askAgent': 'Ask the agent',
  'shell.home.askHint': 'Ask course questions directly — it explains and brings the view up as it goes.',
  'shell.home.settingsTitle': 'Interface & model settings',
  'shell.home.setTheme': 'Interface style',
  'shell.home.themeSystem': 'System',
  'shell.home.themeLight': 'Light',
  'shell.home.themeDark': 'Dark',
  'shell.home.setLang': 'Language',
  'shell.home.setModel': 'Model & teaching preferences',
  'shell.home.openSettings': 'Open settings (API key · model · teaching preferences) →',
  'shell.home.comingSoon': 'Coming soon',
  'shell.home.footer': 'Structural Chemistry Teaching AI Agent · 2026 | A teaching and research '
    + 'tool for structural chemistry courses',
  'shell.home.orbit.sub': '3D visualization of hydrogenic orbitals',
  'shell.home.orbit.desc': 'Observe the 3D shapes, phases and cross-sections of s/p/d/f orbitals — '
    + 'making abstract wavefunctions visible.',
  'shell.home.orbit.tag': 'Observe the microscopic world',
  'shell.home.symmetry.sub': 'Molecular symmetry and point groups',
  'shell.home.symmetry.desc': 'Identify symmetry operations, determine point groups and break down '
    + 'symmetry elements to grasp the rules of molecular structure.',
  'shell.home.symmetry.tag': 'Uncover structural principles',
  'shell.home.crystal.sub': 'Crystal structures and lattice types',
  'shell.home.crystal.desc': 'Analyze unit cells and lattice types, visualize crystal packing and '
    + 'connect structure with properties.',
  'shell.home.crystal.tag': 'Master structure–effect correlations',
  'shell.lib.count': '{n} items',
  'shell.practice.askLlm': 'I want to practise “{kp}”. '
    + 'Call the **generateQuiz tool** to produce one question (do not write the stem or the options yourself '
    + 'and do not compute the answer) — the question card appears automatically; '
    + 'just say in one sentence what this question tests.',
  'shell.practice.toolFallback': 'The model did not call the quiz tool this turn, so generateQuiz was called directly',
  'shell.practice.chooseBoard': 'Choose a module to practise:',
  'shell.practice.board.crystal': 'Crystal Online · crystal structures',
  'shell.practice.board.orbit': 'Orbital Horizon · atomic orbitals',
  'shell.practice.board.symmetry': 'Point Group Explorer · molecular symmetry',
  'shell.practice.boardCrystalTitle': 'Crystal Online · crystal structures — choose a knowledge point to practise:',
  'shell.practice.noBank': 'Point Group Explorer does not have its own question bank yet (generating questions needs '
    + 'numeric criteria and a misconception library, and that data is still being built) — '
    + 'ask me directly, or practise in one of the two modules below.',
  'shell.practice.orbitFailed': 'The orbital question bank could not start (the quiz engine is not ready) — please try again later.',
  'shell.practice.symFailed': 'The point-group question bank could not start (the quiz engine is not ready) — please try again later.',
  'shell.practice.needKey': 'Practising needs an API key first — asking questions, explaining and marking all rely on the model. Use the button below to fill it in.',
  'shell.practice.openSettings': 'Enter the API key in Settings',
  'shell.panel.ph.home': 'Ask a structural chemistry question, or let me demonstrate… (Enter to send, Shift+Enter for a new line)',
  'shell.panel.ph.crystal': 'Ask about crystal structures, or let me demonstrate… (Enter to send, Shift+Enter for a new line)',
  'shell.panel.ph.orbit': 'Ask about atomic orbitals, or let me demonstrate… (Enter to send, Shift+Enter for a new line)',
  'shell.panel.ph.symmetry': 'Ask about molecular symmetry, or let me demonstrate… (Enter to send, Shift+Enter for a new line)',
  'shell.panel.keyReady': 'API key configured — you can start asking questions',
  'shell.panel.greetHead': "I'm the structural chemistry teaching agent",
  'shell.panel.greetScope': 'I cover all three modules — Orbital Horizon · Point Group Explorer · '
    + 'Crystal Atlas. Ask about any of them and I switch to the right one.',
  'shell.panel.greetInModule': "I'm <b>one and the same</b> agent across all three modules; right now on “{title}”.",
  'shell.save.failed': 'Save failed: {msg}',
  'shell.save.failedCapture': 'Capture failed: the canvas is not ready yet — try again in a moment',
  'shell.save.savedTo': 'Saved to “{dir}”',
  'shell.save.dirDenied': 'No write permission for that folder — saved to the download folder instead',
  'shell.save.notAllowed': 'The browser did not allow writing to that location (the permission may have expired, or this browser does not support it) — use "Set save location…" to grant it again',
  'shell.save.noSpace': 'Not enough disk space to write the file',
  'shell.save.fellBackToDownload': 'saved to the browser download folder instead',
  'shell.save.downloaded': 'Saved to the browser download folder (you can set a location in this menu)',
  'shell.save.saved': 'Saved',
  'shell.save.dirSet': 'Save location set to “{dir}”',
  'shell.save.noDirApi': 'This browser cannot pick a folder — saved to the download folder',
  'shell.save.noDirApiHint': 'This browser cannot choose a save location; images go to the download folder',
  'shell.save.currentDir': 'Save location: {dir}',
  'shell.save.pickFirst': 'No save location yet — the first save will ask you to pick a folder',
  // “Open save location” (in-app): a web page cannot open the OS file manager, so we list the images instead
  'shell.save.galleryTitle': 'Images in “{dir}”',
  'shell.save.galleryEmpty': 'No images have been saved to this folder yet',
  'shell.save.galleryCount': '{n} image(s)',
  'shell.save.download': 'Download',
  'shell.save.close': 'Close',
  'shell.save.reopenDir': 'or click “Set save location…” to choose again',
}

/**
 * 中文原文 → 英文（DOM 扫描替换用）。
 * ★ 键必须与 DOM 里**文本节点的整段内容**逐字一致（首尾空白会被忽略）。
 */
export const text = {
  // ---- 设置弹层的 schema（main.js 声明，弹层渲染） ----
  '界面主题': 'Interface theme',
  '跟随系统': 'System',
  '深色': 'Dark',
  '浅色': 'Light',
  '晶体三维视图的背景会一并切换（白底更接近教材插图与课堂投屏）':
    'The 3D crystal view background switches with it (a white background is closer to textbook figures and classroom projection)',
  '晶体模块参数': 'Crystal module parameters',
  '三维配色': '3D colors',
  '逐元素配色': 'Per-element colors',

  // ---- 设置弹层的「关于」 ----
  '结构化学教学智能体': 'Structural Chemistry Teaching Agent',
  '纯前端 · 计算层确定性求值（防幻觉）': 'Pure front-end · deterministic computation layer (anti-hallucination)',
  '模型由使用者自备（BYOK），本工具不提供额度': 'Model supplied by the user (BYOK); this tool provides no quota',

  // ---- 智能体面板的宿主配置 ----
  '教学智能体': 'Teaching Agent',
  '问晶体结构的问题，或让我演示…（Enter 发送，Shift+Enter 换行）':
    'Ask about crystal structures, or ask me to demonstrate… (Enter sends, Shift+Enter for a new line)',
  '练习': 'Practice',
  '设置': 'Settings',
  '会话': 'Conversations',
  '新对话': 'New chat',
  '我是结构化学教学智能体': "I'm the structural chemistry teaching agent",
  '直接问就行——我能查数据、也能把结论演示到画面上。':
    'Just ask — I can look data up and demonstrate the conclusion on screen.',
  '选择要练习的知识点：': 'Choose a knowledge point to practice:',
  // ---- 保存图片（shell/save-image.js）----
  '把当前视图保存成图片': 'Save the current view as an image',
  '图片': 'Image',
  '隐藏文字内容': 'Hide text content',
  '透明背景': 'Transparent background',
  '勾上 = 图片没有底色（透明的，可直接贴到课件任意背景上）；取消 = 用当前页面的底色铺一层':
    'Checked = no background colour (transparent, ready to paste onto any slide); '
    + 'unchecked = fill with the page background',
  '保存图片': 'Save image',
  '另存为…': 'Save as…',
  '设置保存位置…': 'Set save location…',
  '打开保存位置': 'Open save location',
  '抓图失败：画布还没画好，稍等一下再试': 'Capture failed: the canvas is not ready yet — try again in a moment',
  '已保存到浏览器的下载目录': 'Saved to the browser download folder',
  '本浏览器不支持选保存位置，已放到下载目录':
    'This browser cannot choose a save location; the file went to the download folder',
  'PNG 图片': 'PNG image',
  '已保存': 'Saved',
  '主动提示': 'Proactive hint',
  '应用': 'Apply',
  '不用了': 'Not now',
  '已应用': 'Applied',
  '尚未配置 API Key：点面板右上角「设置」填写你自己的模型密钥':
    'No API key configured yet — open Settings (top-right of the panel) and enter your own model key',

  // ---- 返回门户（每一条非首页路由都会装） ----
  '返回门户（首页）': 'Back to the portal (home)',
  '门户': 'Portal',
  '(无 hash)': '(no hash)',

  // ---- 门户首页 ----
  // ★ 副标题与三句标语取自参赛配图（`比赛配图-1.pptx` 第 1 页）。
  // ★★ 2026-10-05：英文版**刻意比中文短**（用户报"英文模式下首页三个标题字太多"）。
  //   中文一个词 2–4 字，英文同样的意思往往要 4–8 个词 —— 直译过来每一行都要折成
  //   两三行，门户从"三行清单"变成"一屏文字"。所以英文侧按"一行放得下"来写，
  //   不追求与中文逐词对应。
  '类氢原子轨道三维可视化': 'Hydrogen-like orbitals in 3D',
  '分子对称性与分子点群': 'Symmetry and point groups',
  '晶体结构与点阵型式': 'Crystal structures and lattices',
  '微观世界可观察': 'The microscopic world, visible',
  '结构规律易剖析': 'Structural rules, dissected',
  '构效关系得贯通': 'Structure–property links',
  '场景感知式 AI 教学智能体 —— 揭秘微观结构 · 启发深度思考 · 引导自主学习':
    'A context-aware AI teaching agent — reveal · inspire · guide',
  '径向分布 · 角度分布 · 节面': 'Radial distribution · angular distribution · nodal surfaces',
  '对称元素 · 点群 · 特征标表': 'Symmetry elements · point groups · character tables',
  '晶体库 · 配位环境 · 空隙分布': 'Crystal library · coordination environment · void distribution',
  // 设置弹层的第一组（界面语言 / 界面主题）——它由宿主声明，故登记在壳这一区
  '界面': 'Interface',
  '界面风格': 'Interface style',
  '界面语言': 'Interface language',
  // ★ 语言名用**本族语**（endonym）：英文界面里"中文"仍写作「中文」，这是惯例，
  //   也避免用户在切换前看不懂自己要点哪个。
  '中文': '中文',
  '全站生效：切完页面与图表一起变，不会重算几何': 'Applies app-wide: pages and charts update together, geometry is not recomputed',
  '模型与教学偏好': 'Model & teaching preferences',
  '打开设置（API Key · 模型 · 教学偏好）→': 'Open settings (API key · model · teaching preferences) →',
  '即将接入': 'Coming soon',
  '结构化学': 'Structural Chemistry',
  '一个中枢 · 可插拔教学模块 —— 问它问题，它会一边讲一边把画面演出来':
    'One hub · pluggable teaching modules — ask a question and it explains while acting it out on screen',
  '纯前端 · 数值由程序计算（防幻觉）· 模型由使用者自备（BYOK）':
    'Pure front-end · numbers computed in code (anti-hallucination) · model supplied by the user (BYOK)',

  // ---- 晶体结构库（壳内的旧入口） ----
  '全部': 'All',
  '金属晶体': 'Metallic crystals',
  '离子晶体': 'Ionic crystals',
  '共价晶体': 'Covalent crystals',
  '分子晶体': 'Molecular crystals',
  '混合键型': 'Mixed bonding',
  '返回首页': 'Back to home',
  '晶体结构库': 'Crystal structure library',

  // ---- 路由 ----
  '页面不存在': 'Page not found',
}

registerDict('shell', { zh, en, text })
