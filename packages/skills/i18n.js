/**
 * skills/i18n.js —— 通用教学法技能（packages/skills）的中英词典
 *
 * ---------------------------------------------------------------------------
 * 为什么这里**必须**走 `t()`，而 `text` 表一条都不用
 * ---------------------------------------------------------------------------
 * 本区的内容是**教学法技能定义**（技能名 / 适用时机 / 步骤数组 / 话术 / 退出条件
 * / 注意事项）。它们**不进 DOM**：
 *   · 清单部分（name + desc）由 `buildManifestText()` 拼进**系统提示词**发给模型；
 *   · 正文部分由模型调 `loadSkill(name)` 按需拉取，也进的是模型上下文。
 * 而 `text` 表是给运行时的 `sweep()` **扫 DOM 文本节点**用的 —— 这里没有文本节点，
 * 登记进 `text` 表只会让覆盖率守卫变绿、运行时一个字符都不会被替换（自欺）。
 * 所以本文件 `text` 表**故意留空**，全部文案走 `t()`。
 *
 * ---------------------------------------------------------------------------
 * 步骤为什么是「一条一步的键」（而不是把整份步骤用 \n 拼成一个键）
 * ---------------------------------------------------------------------------
 * 选了**方案 ①：每个步骤一条键**（`skills.feynman.step1` … ），加载时按语言组装数组。
 * 理由（前两条是硬的，后两条是维护性）：
 *   1. **形状不能变**：`steps` / `phrases` / `cautions` 在消费方是**数组**——
 *      `agent-core/core/feynman.js` 与 `modules/orbit/tools.js` 都写
 *      `(skill.steps && skill.steps.length) ? skill.steps : []` 当 rubric 用，
 *      `catalog.filterBy()` 也按值比对。把整份步骤拼成一个带 `\n` 的字符串，
 *      就要去改 `packages/agent-core/**` 与 `modules/**` —— 那在本区的写范围之外，
 *      且会破坏"数组就是数组"的契约。
 *   2. **一条一步可对照**：步骤是**可执行指令**（"先复述学生的结论"），
 *      逐条翻译才能逐条校对；整块拼接会让"第 3 步漏了"这种错误看不出来。
 *   3. 中英步骤数可能因语言习惯不同而条数一致但语序不同，逐条键让调整只动一条。
 *   4. 差异可读：将来某一步改了，diff 只有一行，而不是整块重写。
 *
 * ---------------------------------------------------------------------------
 * 接线（谁把这些键变成当前语言）
 * ---------------------------------------------------------------------------
 * `common/skills.js` 把这些键**在取值那一刻**用 `t()` 组装成字段（getter）。
 * 于是 `catalog.load('feynman')` 返回的对象永远是**当前语言**的：
 *   · `loadSkill` 的工具实现（`agent-core/app.js`）只做 `ctx.skills.load(name)` 转发，
 *     不需要改一行；模型每次加载拿到的是当下的语言。
 *   · 每轮组系统提示词时 `buildManifestText()` 现取 `desc`，切语言后**下一轮**就变。
 *
 * ★ 本文件必须是**纯数据**：只 import `registerDict`（它本身零依赖），
 *   不 import DOM / three / 任何运行时。
 */
// ★ 相对路径！守卫是在 Node 里 import 本文件来读"登记了哪些原文"的，
//   而 `@i18n` 是 vite 别名，Node 不认 —— 用别名守卫会读不了字典（只警告、不报错，
//   于是这块永远显示 0 覆盖）。
import { registerDict } from '../i18n/index.js'

/** 键 → 中文。★ 这里的中文**逐字等于**迁移前 skills.js 的原文（守卫会与上游对拍） */
export const zh = {
  // ---- feynman · 费曼式反向讲解 ----
  'skills.feynman.title': '费曼式反向讲解',
  'skills.feynman.desc': '让学生用自己的话复述，把"识别性掌握"推进到"生成性掌握"',
  'skills.feynman.when': '学生答对之后；或学生表示"好像懂了"但说不清时',
  'skills.feynman.step1': '邀请复述：明确要求"用你自己的话"，并设定听众是"完全没学过的同学"。',
  'skills.feynman.step2': '完整听完，不打断；记录表述中的关键概念。',
  'skills.feynman.step3': '定位漏洞：找出表述中**概念性**的错误或含糊（而非口误）。',
  'skills.feynman.step4': '不直接纠正，先给一个能暴露问题的**追问**或**观察动作**。',
  'skills.feynman.step5': '学生修正后，再给出标准表述作对照。',
  'skills.feynman.step6': '若复述准确，明确指出"你讲对了哪一点"——正向确认比泛泛表扬有效。',
  'skills.feynman.phrase1': '试着用你自己的话说一遍，就当我是完全没学过的同学。',
  'skills.feynman.phrase2': '不要背公式，讲你理解的那个版本。',
  'skills.feynman.phrase3': '你刚才提到「……」，这一处能再展开一点吗？',
  'skills.feynman.exit': '学生能完整、无概念错误地讲清该知识点，即可结束并记录掌握度 +2。',
  'skills.feynman.caution1': '不要在学生复述中途打断纠正（会打击表达意愿）。',
  'skills.feynman.caution2': '区分"表述不专业"与"概念错误"——前者不必纠正。',

  // ---- socratic · 苏格拉底式追问 ----
  'skills.socratic.title': '苏格拉底式追问',
  'skills.socratic.desc': '不直接给答案，用连续追问把学生逼到自己的逻辑矛盾处',
  'skills.socratic.when': '学生的结论错误但推理过程看起来"有道理"时',
  'skills.socratic.step1': '先复述学生的结论，确认理解无误。',
  'skills.socratic.step2': '找出该结论可推导出的一个**可验证的推论**。',
  'skills.socratic.step3': '把推论抛回给学生，请他判断是否成立。',
  'skills.socratic.step4': '若学生发现矛盾，顺势让他自己修正；若没有，再给一个更极端的特例。',
  'skills.socratic.step5': '每次只问一个问题，等回答后再问下一个。',
  'skills.socratic.phrase1': '按你的说法，那……应该也成立，对吗？',
  'skills.socratic.phrase2': '如果换成极端情况（如 n 很大），你的结论会变成什么？',
  'skills.socratic.phrase3': '你自己觉得哪里可能有问题？',
  'skills.socratic.exit': '学生自行修正结论，或连续两轮无法推进（此时改为直接讲解）。',
  'skills.socratic.caution1': '追问不超过 3 轮，否则会变成刁难。',
  'skills.socratic.caution2': '学生明显挫败时应及时切换为讲解模式。',

  // ---- misconception-probe · 错因探查 ----
  'skills.misconception-probe.title': '错因探查',
  'skills.misconception-probe.desc': '答错时不直接给答案，而是把视图切到能揭示错误根源的状态',
  'skills.misconception-probe.when': '学生答错，且需要判断是概念错误还是操作失误时',
  'skills.misconception-probe.step1': '不宣布对错，先问"你是怎么想的"——获取学生的推理路径。',
  'skills.misconception-probe.step2': '把学生的推理与常见误解对照，定位错因类型。',
  'skills.misconception-probe.step3': '调用 diagnoseError 取得该错因对应的**可视化诊断动作**。',
  'skills.misconception-probe.step4': '执行诊断动作，让视图呈现能暴露问题的那一面。',
  'skills.misconception-probe.step5': '引导学生自己看出矛盾，而不是指出错误。',
  'skills.misconception-probe.step6': '确认理解后，出一道同知识点的变式题验证。',
  'skills.misconception-probe.phrase1': '先说说你是怎么想的？',
  'skills.misconception-probe.phrase2': '我把它调成……的样子，你再看看？',
  'skills.misconception-probe.phrase3': '现在这个图里，你注意到了什么？',
  'skills.misconception-probe.exit': '学生能自己指出原推理的问题所在。',
  'skills.misconception-probe.caution1': '不要用"你错了"开头；先肯定推理中正确的部分。',

  // ---- worked-example · 范例精讲 ----
  'skills.worked-example.title': '范例精讲',
  'skills.worked-example.desc': '用一个完整范例示范解题思路，边讲边操控视图',
  'skills.worked-example.when': '学生首次接触某类问题，或表示"完全不会"时',
  'skills.worked-example.step1': '先给出问题，让学生有 10 秒思考（不要立刻讲）。',
  'skills.worked-example.step2': '拆解为若干小步，每步配一个视图动作。',
  'skills.worked-example.step3': '每一步都说明"为什么这样做"而非只讲"怎么做"。',
  'skills.worked-example.step4': '讲完立刻给一道只有数字不同的同类题，让学生独立完成。',
  'skills.worked-example.phrase1': '我先完整做一遍，你注意看每一步的理由。',
  'skills.worked-example.phrase2': '这一步为什么要用这个公式？',
  'skills.worked-example.exit': '学生能独立完成同类题。',
  'skills.worked-example.caution1': '范例不要超过 3 步；过长会让学生失去注意力。',

  // ---- spaced-repetition · 间隔复习 ----
  'skills.spaced-repetition.title': '间隔复习',
  'skills.spaced-repetition.desc': '依据掌握度挑选"快要遗忘"的知识点进行快速回顾',
  'skills.spaced-repetition.when': '会话开始时；或学生完成一个知识点的闭环之后',
  'skills.spaced-repetition.step1': '读取掌握度，挑选掌握度中等（既非刚学会也非完全不会）的知识点。',
  'skills.spaced-repetition.step2': '用一道快速题（不超过 30 秒可答）检验。',
  'skills.spaced-repetition.step3': '答对则掌握度 +1 并结束；答错则转入该知识点的讲解流程。',
  'skills.spaced-repetition.phrase1': '先花 20 秒回顾一下上次的内容——',
  'skills.spaced-repetition.exit': '完成检验题。',
  'skills.spaced-repetition.caution1': '每次会话最多复习 2 个知识点，不要变成考试。',

  // ---- analogy · 类比教学 ----
  'skills.analogy.title': '类比教学',
  'skills.analogy.desc': '用生活类比建立直觉，再立刻回到严格表述',
  'skills.analogy.when': '学生卡在抽象概念（如相位、叠加、简并）上时',
  'skills.analogy.step1': '给出一个生活类比，明确说明"类比的边界在哪里"。',
  'skills.analogy.step2': '用类比解释直觉层面。',
  'skills.analogy.step3': '**立刻**回到严格表述，并指出类比的失效之处。',
  'skills.analogy.step4': '用视图验证严格表述。',
  'skills.analogy.phrase1': '可以先打个比方——',
  'skills.analogy.phrase2': '但要小心，这个类比在……处就不成立了。',
  'skills.analogy.exit': '学生能在严格表述层面复述。',
  'skills.analogy.caution1': '类比必须配"失效边界"说明，否则会植入新的误解（类比教学最大的坑）。',
  'skills.analogy.caution2': '不要用类比替代严格表述。',
}

/** 键 → 英文 */
export const en = {
  // ---- feynman ----
  'skills.feynman.title': 'Feynman-style reverse explanation',
  'skills.feynman.desc': 'Have the student restate it in their own words, moving from "recognition '
    + 'mastery" to "generative mastery"',
  'skills.feynman.when': 'After the student answers correctly; or when they say they "kind of get it" '
    + 'but cannot explain it',
  'skills.feynman.step1': 'Invite a restatement: ask explicitly for "your own words" and set the audience '
    + 'as "a classmate who has never studied this".',
  'skills.feynman.step2': 'Listen all the way through without interrupting; note the key concepts in what they say.',
  'skills.feynman.step3': 'Locate the gap: find **conceptual** errors or vagueness in the restatement '
    + '(not slips of the tongue).',
  'skills.feynman.step4': 'Do not correct directly; first give a **follow-up question** or an '
    + '**observation action** that exposes the problem.',
  'skills.feynman.step5': 'Once the student has corrected it, give the standard statement for comparison.',
  'skills.feynman.step6': 'If the restatement is accurate, say explicitly which point they got right — '
    + 'specific confirmation works better than vague praise.',
  'skills.feynman.phrase1': 'Try saying it in your own words, as if I had never studied this at all.',
  'skills.feynman.phrase2': 'Do not recite formulas — give me the version you understand.',
  'skills.feynman.phrase3': 'You just mentioned "…" — could you expand on that a little?',
  'skills.feynman.exit': 'The student can explain the knowledge point completely and without conceptual '
    + 'errors; then close and record mastery +2.',
  'skills.feynman.caution1': 'Do not interrupt a restatement to correct it (it discourages them from speaking up).',
  'skills.feynman.caution2': 'Distinguish "unpolished wording" from "conceptual error" — the former needs '
    + 'no correction.',

  // ---- socratic ----
  'skills.socratic.title': 'Socratic questioning',
  'skills.socratic.desc': 'Do not give the answer; use a chain of questions to drive the student into '
    + 'their own logical contradiction',
  'skills.socratic.when': 'The conclusion is wrong but the reasoning sounds "reasonable"',
  'skills.socratic.step1': 'First restate the conclusion to confirm you understood it correctly.',
  'skills.socratic.step2': 'Find a **verifiable consequence** that follows from that conclusion.',
  'skills.socratic.step3': 'Hand the consequence back to the student and ask whether it holds.',
  'skills.socratic.step4': 'If they spot the contradiction, let them correct it themselves; if not, '
    + 'offer a more extreme special case.',
  'skills.socratic.step5': 'Ask only one question at a time, and wait for the answer before the next.',
  'skills.socratic.phrase1': 'By your reasoning, then … should also hold, right?',
  'skills.socratic.phrase2': 'In an extreme case (say n is very large), what does your conclusion become?',
  'skills.socratic.phrase3': 'Where do you yourself think there might be a problem?',
  'skills.socratic.exit': 'The student corrects the conclusion themselves, or two rounds in a row make no '
    + 'progress (then switch to direct explanation).',
  'skills.socratic.caution1': 'Do not question for more than 3 rounds, or it turns into badgering.',
  'skills.socratic.caution2': 'Switch to explanation mode promptly if the student is clearly frustrated.',

  // ---- misconception-probe ----
  'skills.misconception-probe.title': 'Misconception probe',
  'skills.misconception-probe.desc': 'When an answer is wrong, do not give the answer; switch the view to a '
    + 'state that reveals the root of the error',
  'skills.misconception-probe.when': 'The student answers incorrectly and you must tell a conceptual error '
    + 'from a slip in operation',
  'skills.misconception-probe.step1': 'Do not announce right or wrong; first ask "what was your thinking?" '
    + 'to get the reasoning path.',
  'skills.misconception-probe.step2': 'Compare that reasoning with common misconceptions to identify the '
    + 'type of error cause.',
  'skills.misconception-probe.step3': 'Call diagnoseError to obtain the **visual diagnostic actions** for '
    + 'that error cause.',
  'skills.misconception-probe.step4': 'Run the diagnostic actions so the view shows the side that exposes the problem.',
  'skills.misconception-probe.step5': 'Guide the student to see the contradiction themselves rather than '
    + 'pointing out the mistake.',
  'skills.misconception-probe.step6': 'Once understanding is confirmed, give a variant problem on the same '
    + 'knowledge point to verify it.',
  'skills.misconception-probe.phrase1': 'First tell me how you were thinking about it?',
  'skills.misconception-probe.phrase2': 'Let me set it up like this — take another look?',
  'skills.misconception-probe.phrase3': 'In this picture now, what do you notice?',
  'skills.misconception-probe.exit': 'The student can point out the problem in their original reasoning themselves.',
  'skills.misconception-probe.caution1': 'Do not start with "you are wrong"; first affirm the parts of the '
    + 'reasoning that are correct.',

  // ---- worked-example ----
  'skills.worked-example.title': 'Worked example',
  'skills.worked-example.desc': 'Demonstrate the solution approach with one complete example, narrating '
    + 'while controlling the view',
  'skills.worked-example.when': 'The student meets this kind of problem for the first time, or says they '
    + 'have "no idea"',
  'skills.worked-example.step1': 'Give the problem first and let the student think for 10 seconds '
    + '(do not start explaining at once).',
  'skills.worked-example.step2': 'Break it into several small steps, each paired with a view action.',
  'skills.worked-example.step3': 'For every step explain "why we do this", not just "how to do it".',
  'skills.worked-example.step4': 'Right afterwards give a similar problem that differs only in numbers, '
    + 'and let the student solve it alone.',
  'skills.worked-example.phrase1': 'Let me work through it once completely; watch for the reason behind '
    + 'each step.',
  'skills.worked-example.phrase2': 'Why does this step use this formula?',
  'skills.worked-example.exit': 'The student can solve a similar problem independently.',
  'skills.worked-example.caution1': 'Keep the example to no more than 3 steps; longer and the student '
    + 'loses attention.',

  // ---- spaced-repetition ----
  'skills.spaced-repetition.title': 'Spaced review',
  'skills.spaced-repetition.desc': 'Pick the knowledge points that are "about to be forgotten" according '
    + 'to mastery and review them quickly',
  'skills.spaced-repetition.when': 'At the start of a session; or after the student closes the loop on a '
    + 'knowledge point',
  'skills.spaced-repetition.step1': 'Read the mastery data and pick knowledge points at a medium level '
    + '(neither just learned nor completely unknown).',
  'skills.spaced-repetition.step2': 'Check with one quick question (answerable within 30 seconds).',
  'skills.spaced-repetition.step3': 'If correct, mastery +1 and stop; if wrong, move into the explanation '
    + 'flow for that knowledge point.',
  'skills.spaced-repetition.phrase1': 'Let us spend 20 seconds reviewing the last session first —',
  'skills.spaced-repetition.exit': 'The check question is completed.',
  'skills.spaced-repetition.caution1': 'Review at most 2 knowledge points per session; do not turn it into an exam.',

  // ---- analogy ----
  'skills.analogy.title': 'Teaching by analogy',
  'skills.analogy.desc': 'Build intuition with an everyday analogy, then return to the rigorous statement '
    + 'at once',
  'skills.analogy.when': 'The student is stuck on an abstract concept (such as phase, superposition, degeneracy)',
  'skills.analogy.step1': 'Give an everyday analogy and state explicitly "where the analogy ends".',
  'skills.analogy.step2': 'Use the analogy to explain the intuitive level.',
  'skills.analogy.step3': '**At once** return to the rigorous statement and point out where the analogy fails.',
  'skills.analogy.step4': 'Verify the rigorous statement in the view.',
  'skills.analogy.phrase1': 'Let me put it this way first —',
  'skills.analogy.phrase2': 'But be careful: this analogy does not hold once we get to …',
  'skills.analogy.exit': 'The student can restate it at the level of the rigorous statement.',
  'skills.analogy.caution1': 'An analogy must come with its "limits of validity", otherwise it plants a '
    + 'new misconception (the biggest pitfall of teaching by analogy).',
  'skills.analogy.caution2': 'Do not use an analogy as a substitute for the rigorous statement.',
}

/**
 * 中文原文 → 英文。
 * ★ **本区故意为空**：技能文案不进 DOM（清单进系统提示词、正文由 loadSkill 拉取），
 *   而这张表只有 `sweep()` 扫 DOM 文本节点时才会被查。往这里塞条目会让守卫变绿、
 *   运行时却毫无效果 —— 见本文件顶部说明。
 */
export const text = {}

registerDict('skills', { zh, en, text })
