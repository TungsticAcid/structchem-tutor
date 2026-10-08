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
    + '★ 演示步数按问题复杂度给：单纯的"是什么 / 有哪些"类问题 2–4 步就够，不要一律排满 8 步。',
  'shell.prompt.roleCrystal': '涉及配位数、空隙数、晶胞参数、密度等一切数值，必须用 queryCrystal 取得，不要口算。',
  'shell.prompt.roleOrbit': '节面数、径向峰位、能级、简并度等一切数值必须用 queryOrbital 取得，不要凭记忆或口算。',
  'shell.prompt.roleSymmetry': '点群符号与对称元素清单一律用 queryPointGroup 取得；晶体示例走空间群（同一条命令）。',

  // ---- 带变量的动态串（扫描替换做不到，必须走键） ----
  'shell.panel.switched': '已切到「{title}」模块',
  'shell.panel.restored': '已恢复上次的对话（共 {n} 条）——右上角菜单可开新会话',
  'shell.home.enter': '进入{title}',
  'shell.home.locked': '{title}：尚未接入本应用',
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
}

/** 键 → 英文 */
export const en = {
  'shell.prompt.role': 'You are a structural chemistry teaching agent serving teaching and learning '
    + 'in a structural chemistry course. You are not a question-answering bot: you are a teaching '
    + 'agent that can perceive what the user is doing and act things out. Whenever something can be '
    + 'demonstrated in the 3D view, demonstrate it with applySceneActions instead of describing it in words only. '
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
    + '★ Size the demo to the question: a plain what/which question needs 2–4 steps, not a full 8-step sequence.',
  'shell.prompt.roleCrystal': 'For any number — coordination number, void count, cell parameters, density — '
    + 'obtain it with queryCrystal. Never compute or recall it yourself.',
  'shell.prompt.roleOrbit': 'For any number — node count, radial peak positions, energy levels, degeneracy — '
    + 'obtain it with queryOrbital. Never rely on memory or mental arithmetic.',
  'shell.prompt.roleSymmetry': 'Always obtain point-group symbols and symmetry-element lists with queryPointGroup; '
    + 'crystal examples go through the space group (same command).',

  'shell.panel.switched': 'Switched to the "{title}" module',
  'shell.panel.restored': 'Restored your previous conversation ({n} messages) — the top-right menu starts a new one',
  'shell.home.enter': 'Open {title}',
  'shell.home.locked': '{title}: not available in this app yet',
  'shell.lib.count': '{n} items',
  'shell.practice.askLlm': 'I want to practise “{kp}”. '
    + 'Call the **generateQuiz tool** to produce one question (do not write the stem or the options yourself '
    + 'and do not compute the answer) — the question card appears automatically; '
    + 'just say in one sentence what this question tests.',
  'shell.practice.toolFallback': 'The model did not call the quiz tool this turn, so generateQuiz was called directly',
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
