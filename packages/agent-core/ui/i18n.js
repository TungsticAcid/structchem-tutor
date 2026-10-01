/**
 * i18n.js —— 智能体面板（packages/agent-core/ui）的中英词典
 *
 * ---------------------------------------------------------------------------
 * 为什么这里是相对路径，而不是 `@i18n/index.js`
 * ---------------------------------------------------------------------------
 * `@i18n` 是 **vite 的别名**，Node 不认。而覆盖率守卫（tools/check-i18n.mjs）
 * 是**在 Node 里 import 本文件**来读"哪些原文已经被登记"的 —— 用别名守卫一 import
 * 就炸（报"读不了字典"），而它只会警告后跳过，于是这块永远显示 0 覆盖。
 * 所以字典文件一律走相对路径。
 *
 * 本文件必须是**纯数据**：不 import DOM、不 import three、不 import 任何运行时
 * 之外的东西。
 *
 * ---------------------------------------------------------------------------
 * ★★ 本词典最特别的一条：zh / en 的**键就是带 {占位符} 的中文原文** ★★
 * ---------------------------------------------------------------------------
 * 面板（`panel.js`）是**被 chem-agent 之外的宿主复用的组件**，所以它**不能**
 * `import '@i18n/index.js'` —— 那会把 i18n 变成硬依赖，破坏"面板可被别的宿主复用"。
 * 它只认宿主注入的 `cfg.t`，并在没注入时**回退到自己填占位符**：
 *
 *     第 3/6 步   ← 回退（老宿主）与注入后（中文模式）**逐字节相同**
 *     Step 3/6    ← 注入后（英文模式）
 *
 * 要让"回退结果"与"中文模式下的 t() 结果"都是那句中文，键就只能**是那句中文本身**
 * （带 `{index}` 这类占位符）。于是这里：
 *
 *   `zh` 表：`'第 {index}/{total} 步': '第 {index}/{total} 步'`  —— 看着像自我映射，
 *            但它**是必需的**：`t()` 先按键查表，查不到就直接返回键且**不做占位符替换**
 *            （见 packages/i18n/index.js 的 t）。缺了这一条，中文模式下界面会显示
 *            带着 `{index}` 大括号的半成品，而且**不报错**。
 *   `en` 表：同一个键 → 英文文案。
 *
 * 守卫把"键里带中文"的条目一律当作 text 表的一条（原文 → 译文）来记，所以这些键
 * 同时也让 `panel.js` 里那些键字面量算作"已覆盖" —— 这是对的：那个位置**真的**
 * 走了 i18n 接口。
 *
 * ---------------------------------------------------------------------------
 * 两张表的分工
 * ---------------------------------------------------------------------------
 *   `text`：中文原文 → 英文。给 `sweep()` 扫 DOM 用（面板挂在 document.body 上，
 *          应用层的 `startAutoSweep(document.body)` 盯着它）。**整段显示的静态文案
 *          走这张表，源码一个字节都不用改。**
 *   `zh`/`en`：键 → 文案。给两种扫描替换做不到的情形：
 *              ① 原文里**带变量**（`第 3 步` / `第 4 步` 是两条不同原文）；
 *              ② 字符串**不进 DOM**（`window.prompt` / `window.confirm` 的提示、
 *                 发给模型的"重答"指令、动作气泡里的拼串）。
 */
import { registerDict } from '../../../packages/i18n/index.js'

/**
 * 键 → 中文。
 * ★ 键 = 带 `{占位符}` 的中文原文（理由见文件头），**一个字都不能改**：
 *   改键就必须同步改 `panel.js` 里的调用处，否则 `t()` 查不到、静默回退成键本身。
 */
export const zh = {
  // ---- 动作气泡里"标签 + 参数"的那个括号（见 panel.js 的 describeAction）----
  // ★ 键写成 `（{kv}）`（**全角括号**）是刻意的：没有注入 `cfg.t` 时，
  //   面板的回退实现是"就地填占位符"，于是它输出 `label（k=v）` ——
  //   与改造前的字符串拼接**逐字节相同**（老宿主的行为不变）。
  '（{kv}）': '（{kv}）',
  // ---- 宿主没给就由面板自己兜底的文案（给了 cfg.title / cfg.placeholder 时不走这里）----
  '教学智能体': '教学智能体',
  '教学智能体（可拖动）': '教学智能体（可拖动）',
  '问相关的问题，或让我演示…（Enter 发送，Shift+Enter 换行）':
    '问相关的问题，或让我演示…（Enter 发送，Shift+Enter 换行）',

  // ---- 演示控制条：步号与旁白提示（每次事件现算，扫描替换够不着）----
  '恢复失败：{error}': '恢复失败：{error}',
  '第 {index}/{total} 步': '第 {index}/{total} 步',
  '（未执行）': '（未执行）',
  '已完成 {index}/{total} 步': '已完成 {index}/{total} 步',
  '已完成 {index}/{total} 步 · 新增 {added} 步': '已完成 {index}/{total} 步 · 新增 {added} 步',
  '下一步：{text}': '下一步：{text}',
  '已退回 · 已完成 {index}/{total} 步': '已退回 · 已完成 {index}/{total} 步',
  '（回到最开始）': '（回到最开始）',
  '下一步（重播）：{label}': '下一步（重播）：{label}',
  '连续播放中 {index}/{total}': '连续播放中 {index}/{total}',
  '共 {total} 步 · 可重新演示，或退回去重看某一步': '共 {total} 步 · 可重新演示，或退回去重看某一步',
  '重新演示 · 共 {total} 步': '重新演示 · 共 {total} 步',

  // ---- 动作气泡：一次多动作的摘要 / 回执 / 校验失败 ----
  '等 {n} 个动作': '等 {n} 个动作',
  '返回：{v}': '返回：{v}',
  '未执行：{reason}': '未执行：{reason}',
  '参数不合法': '参数不合法',
  '{n} 个动作未执行': '{n} 个动作未执行',

  // ---- 「引用这一步」写进输入框的那句话（textarea 的 value，不是文本节点）----
  '【整改演示】演示 #{id} 的第 {index} 步（共 {total} 步）{what}':
    '【整改演示】演示 #{id} 的第 {index} 步（共 {total} 步）{what}',
  '「{what}」': '「{what}」',
  '我想改成：': '我想改成：',
  // ★ 发给模型的内部指令（`origin:'internal'` 的消息不渲染给学生看）
  '（请重新回答我上面的那个问题，给出一份全新的回答。）':
    '（请重新回答我上面的那个问题，给出一份全新的回答。）',

  // ---- 空正文的诊断（finish 时拼出来的，含 finish_reason 与 token 用量）----
  '模型这次没有输出正文：输出被长度上限截断。可在「设置 → 输出上限 max_tokens」调大后重试。':
    '模型这次没有输出正文：输出被长度上限截断。可在「设置 → 输出上限 max_tokens」调大后重试。',
  '模型这次只发起了动作调用，没写正文。动作可能已经排进演示队列了，看一下上面的动作气泡。':
    '模型这次只发起了动作调用，没写正文。动作可能已经排进演示队列了，看一下上面的动作气泡。',
  '模型这次没有返回正文（只输出了思考内容）。可以再问一次，或换一个模型试试。':
    '模型这次没有返回正文（只输出了思考内容）。可以再问一次，或换一个模型试试。',
  '模型这次没有返回正文（连思考内容也没有，可能是服务端返回异常）。可以再问一次，或换一个模型试试。':
    '模型这次没有返回正文（连思考内容也没有，可能是服务端返回异常）。可以再问一次，或换一个模型试试。',
  '输出 {n} tokens': '输出 {n} tokens',
  '（其中思考 {n}）': '（其中思考 {n}）',
  '输入 {n} tokens': '输入 {n} tokens',
  '出错了：{message}': '出错了：{message}',
  '{message}（点「设置」检查密钥）': '{message}（点「设置」检查密钥）',

  // ---- 分支片 / 会话页 / 收藏列表的拼串 ----
  '⑂ 这处分出 {n} 条：': '⑂ 这处分出 {n} 条：',
  '（无正文）': '（无正文）',
  '{i}. {tip} · {n} 条': '{i}. {tip} · {n} 条',
  '{n} 个节点 · {at}{cur}': '{n} 个节点 · {at}{cur}',
  '· 当前': '· 当前',
  '{n} 步 · {at}': '{n} 步 · {at}',
  '无法播放这条收藏：{error}': '无法播放这条收藏：{error}',
  '会话名称': '会话名称',
  '删除这个会话？不可恢复。': '删除这个会话？不可恢复。',
}

/** 键 → 英文（键与 `zh` 完全一致，少的键在英文界面下会静默显示中文 —— 守卫只报未覆盖的源码字面量，不报缺译） */
export const en = {
  // ---- 动作气泡里"标签 + 参数"的那个括号（英文用半角、前面留一个空格）----
  '（{kv}）': ' ({kv})',
  // ---- 面板自己兜底的文案 ----
  '教学智能体': 'Teaching Agent',
  '教学智能体（可拖动）': 'Teaching agent (draggable)',
  '问相关的问题，或让我演示…（Enter 发送，Shift+Enter 换行）':
    'Ask a question, or ask me to demonstrate… (Enter sends, Shift+Enter for a new line)',

  // ---- 演示控制条 ----
  '恢复失败：{error}': 'Restore failed: {error}',
  '第 {index}/{total} 步': 'Step {index}/{total}',
  '（未执行）': ' (not executed)',
  '已完成 {index}/{total} 步': 'Completed {index}/{total} steps',
  '已完成 {index}/{total} 步 · 新增 {added} 步': 'Completed {index}/{total} steps · {added} added',
  '下一步：{text}': 'Next: {text}',
  '已退回 · 已完成 {index}/{total} 步': 'Stepped back · completed {index}/{total} steps',
  '（回到最开始）': '(back to the beginning)',
  '下一步（重播）：{label}': 'Next (replay): {label}',
  '连续播放中 {index}/{total}': 'Auto-playing {index}/{total}',
  '共 {total} 步 · 可重新演示，或退回去重看某一步':
    '{total} steps in total · replay from the start, or step back to review one',
  '重新演示 · 共 {total} 步': 'Replaying · {total} steps',

  // ---- 动作气泡 ----
  '等 {n} 个动作': '{n} actions',
  '返回：{v}': 'Result: {v}',
  '未执行：{reason}': 'Not executed: {reason}',
  '参数不合法': 'invalid parameters',
  '{n} 个动作未执行': '{n} actions were not executed',

  // ---- 「引用这一步」----
  '【整改演示】演示 #{id} 的第 {index} 步（共 {total} 步）{what}':
    '[Revise demo] demo #{id}, step {index} of {total} {what}',
  '「{what}」': '"{what}"',
  '我想改成：': 'I want to change it to: ',
  '（请重新回答我上面的那个问题，给出一份全新的回答。）':
    '(Please answer my previous question again, with a completely fresh answer.)',

  // ---- 空正文的诊断 ----
  '模型这次没有输出正文：输出被长度上限截断。可在「设置 → 输出上限 max_tokens」调大后重试。':
    'The model produced no text this time: the output was cut off by the length limit. '
    + 'Raise "Settings → max output tokens max_tokens" and try again.',
  '模型这次只发起了动作调用，没写正文。动作可能已经排进演示队列了，看一下上面的动作气泡。':
    'The model only issued action calls this time and wrote no text. The actions may already be '
    + 'queued for the demo — look at the action bubbles above.',
  '模型这次没有返回正文（只输出了思考内容）。可以再问一次，或换一个模型试试。':
    'The model returned no text this time (it only produced reasoning). '
    + 'Ask again, or try a different model.',
  '模型这次没有返回正文（连思考内容也没有，可能是服务端返回异常）。可以再问一次，或换一个模型试试。':
    'The model returned no text this time (no reasoning either — the server response may be faulty). '
    + 'Ask again, or try a different model.',
  '输出 {n} tokens': 'output {n} tokens',
  '（其中思考 {n}）': ' ({n} of them reasoning)',
  '输入 {n} tokens': 'input {n} tokens',
  '出错了：{message}': 'Something went wrong: {message}',
  '{message}（点「设置」检查密钥）': '{message} (open Settings to check your key)',

  // ---- 分支片 / 会话页 / 收藏列表 ----
  '⑂ 这处分出 {n} 条：': '⑂ {n} branches fork here:',
  '（无正文）': '(no text)',
  '{i}. {tip} · {n} 条': '{i}. {tip} · {n} nodes',
  '{n} 个节点 · {at}{cur}': '{n} nodes · {at}{cur}',
  '· 当前': ' · current',
  '{n} 步 · {at}': '{n} steps · {at}',
  '无法播放这条收藏：{error}': 'Cannot play this saved demo: {error}',
  '会话名称': 'Conversation name',
  '删除这个会话？不可恢复。': 'Delete this conversation? This cannot be undone.',
}

/**
 * 中文原文 → 英文（DOM 扫描替换用）。
 * ★ 键必须与 DOM 里**文本节点的整段内容**（或 title/placeholder 属性值）逐字一致
 *   ——首尾空白会被忽略，中间一个字都不能差。
 * ★ 只登记"整段就是这一句"的静态文案。带变量的一律走 zh/en 的键，
 *   因为运行时的文本节点是拼出来的（`共 3 个动作`），扫描永远对不上。
 */
export const text = {
  // ---- 面板自己兜底的文案 ----
  // ★ 这三条**同时**登记在 zh/en 表里（见上），这是刻意的双保险：
  //   · 注入了 cfg.t → `T()` 在**渲染那一刻**就取到当前语言（切语言也靠面板重画）；
  //   · 只加载了字典、没注入 cfg.t → 扫描替换仍然认得它们（属性值也在扫描范围内）。
  //   少任何一条通路都不会报错，只会"这几处一直是中文"。
  '教学智能体': 'Teaching Agent',
  '教学智能体（可拖动）': 'Teaching agent (draggable)',
  '问相关的问题，或让我演示…（Enter 发送，Shift+Enter 换行）':
    'Ask a question, or ask me to demonstrate… (Enter sends, Shift+Enter for a new line)',

  // ---- 悬浮球与抽屉骨架 ----
  '拖拽调整大小': 'Drag to resize',
  '发送': 'Send',

  // ---- 演示控制条 ----
  '◀ 上一步': '◀ Previous',
  '下一步 ▶': 'Next ▶',
  '连续播放': 'Auto-play',
  '⏸ 逐步': '⏸ Step by step',
  '■ 停止': '■ Stop',
  '↻ 重新演示': '↻ Replay',
  '收起': 'Collapse',
  '↩ 回到演示前': '↩ Back to before the demo',
  '已回到演示前的状态': 'Restored the state from before the demo',
  '演示完成': 'Demo finished',
  '演示已停止': 'Demo stopped',
  '从头开始': 'From the beginning',

  // ---- 助手消息 ----
  '思考中…': 'Thinking…',
  '已思考（点击展开）': 'Thought (click to expand)',
  '模型实际输出的思考内容（点击展开）': "The model's actual reasoning output (click to expand)",
  '输出触发长度上限，正在接着写…': 'Output hit the length limit; continuing…',
  '输出仍被截断，已停止续写；可在「设置 → 输出上限」调大后重试':
    'The output is still truncated, so continuation stopped. Raise "Settings → max output tokens" and try again',
  '已停止（本次循环剩余动作已丢弃）': 'Stopped (the remaining actions of this run were discarded)',
  '尚未配置 API Key。请点右上角「设置」填写你自己的模型密钥（BYOK，本工具不提供额度）。':
    'No API key configured yet. Open Settings (top-right) and enter your own model key '
    + '(BYOK; this tool provides no quota).',
  '尚未配置 API Key，请点「设置」填写。':
    'No API key configured yet — open Settings and enter one.',

  // ---- 动作气泡上的按钮与状态 ----
  '引用': 'Quote',
  '引用这一步提整改意见': 'Quote this step and describe what to change',
  '↻ 重播这个演示': '↻ Replay this demo',
  '☆ 收藏': '☆ Save',
  '把这条演示存到本机，之后随时可重播':
    'Save this demo on this device so you can replay it anytime',
  '演示已失效': 'This demo is no longer available',
  '★ 已收藏': '★ Saved',
  '（收藏失败）': '(save failed)',

  // ---- 消息工具条 ----
  '复制': 'Copy',
  '复制原文（含公式源码）': 'Copy the source text (including formula source)',
  '已复制': 'Copied',
  '复制失败': 'Copy failed',
  '编辑重问': 'Edit and re-ask',
  '改一下这句，从它这里重新问': 'Change this line and ask again from here',
  '另起分支': 'Branch here',
  '保留这句，在它之后另开一条分支': 'Keep this line and start a new branch after it',
  '重答': 'Answer again',
  '让模型重新回答这一条': 'Ask the model to answer this one again',
  '已把这句填回输入框——改完发送，原来的回答会作为另一条分支保留':
    'Put this line back in the input box — edit and send; the original answer is kept as another branch',
  '已在这条之后另开一条分支——接着说即可（原来的仍在）':
    'Started a new branch after this one — just keep talking (the original is still there)',

  // ---- 分支片 ----
  '当前正在这条分支上': 'You are currently on this branch',
  '切到这条分支': 'Switch to this branch',

  // ---- 会话页 ----
  '当前未接入对话存储，无法管理会话':
    'Conversation storage is not connected, so sessions cannot be managed',
  '会话': 'Conversations',
  '返回': 'Back',
  '全部会话（只存本机，不上传）':
    'All conversations (stored on this device only, never uploaded)',
  '收藏的演示（点一下重播）': 'Saved demos (click to replay)',
  '＋ 新会话': '+ New conversation',
  '还没有会话': 'No conversations yet',
  '新对话': 'New chat',
  '改名': 'Rename',
  '删除': 'Delete',
  '还没有收藏——演示时点动作气泡上的「☆ 收藏」即可':
    'Nothing saved yet — click "☆ Save" on an action bubble during a demo',
}

registerDict('panel', { zh, en, text })
