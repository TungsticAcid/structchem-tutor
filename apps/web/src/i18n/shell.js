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
    + '凡是可以用三维视图演示的，都要用 applySceneActions 演示，而不是只用文字描述。',
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
  'shell.practice.askLlm': '给我出一道关于「{kp}」的练习题。'
    + '请用工具取题与答案（不要自己口算），只把题干与选项给我，先不要公布答案。',
  /**
   * ★ 面板开场白：**统一身份**（用户报「三个板块的智能体没有综合成为一个总智能体」）。
   *   由宿主（main.js 的 greeting）统一给出，模块只接自己的示例问题。
   *   同 `shell.practice.askLlm`：这是 `t()` 的键，不在 text 表里。
   */
  'shell.panel.greetHead': '我是结构化学教学智能体',
  'shell.panel.greetScope': '我覆盖三个板块：轨道视界 · 点群观鉴 · 晶典在线 —— '
    + '问到哪个就切到哪个，不用你操心现在该找谁。',
  'shell.panel.greetInModule': '我是**一个**智能体，覆盖三个板块；当前在「{title}」这一块。',
  // 保存图片：失败时拼了错误信息，只能走 t()（见 shell/save-image.js 的说明）
  'shell.save.failed': '保存失败：{msg}',
}

/** 键 → 英文 */
export const en = {
  'shell.prompt.role': 'You are a structural chemistry teaching agent serving teaching and learning '
    + 'in a structural chemistry course. You are not a question-answering bot: you are a teaching '
    + 'agent that can perceive what the user is doing and act things out. Whenever something can be '
    + 'demonstrated in the 3D view, demonstrate it with applySceneActions instead of describing it in words only.',
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
  'shell.practice.askLlm': 'Give me a practice question about “{kp}”. '
    + 'Use the tools to build the question and the answer (do not compute it yourself); '
    + 'show me only the question and the options, and do not reveal the answer yet.',
  'shell.panel.greetHead': "I'm the structural chemistry teaching agent",
  'shell.panel.greetScope': 'I cover all three modules — Orbital Horizon · Point Group Explorer · '
    + 'Crystal Atlas. Ask about any of them and I switch to the right one.',
  'shell.panel.greetInModule': "I'm one agent covering all three modules; right now I'm on “{title}”.",
  'shell.save.failed': 'Save failed: {msg}',
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
  '保存图片': 'Save image',
  '另存为…': 'Save as…',
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
    'A context-aware teaching agent — reveal · inspire · guide',
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
