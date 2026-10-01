/**
 * packages/ui-kit/i18n.js —— 共享构件与设置弹层的中英词典
 *
 * ---------------------------------------------------------------------------
 * 为什么这里是相对路径 import，而不是 `@i18n/index.js`
 * ---------------------------------------------------------------------------
 * 覆盖率守卫（`tools/check-i18n.mjs`）**在 Node 里 import 本文件**来读"登记了哪些原文"，
 * 而 `@i18n` 是 vite 别名、Node 不认 —— 用别名会让守卫读不了这本字典
 * （它只警告后跳过，于是这一区永远显示 0 覆盖）。所以字典文件一律走相对路径。
 *
 * 本文件必须**纯数据**：不 import DOM、不 import 任何运行时。
 *
 * ---------------------------------------------------------------------------
 * 为什么 `text` 表在这里是**主力**
 * ---------------------------------------------------------------------------
 * 设置弹层的文案最终都以**文本节点**出现在 DOM 上（`el('div', { text: '数据与隐私' })`），
 * 而应用层已经在 `document.body` 上开了 `startAutoSweep` —— 登记进 `text` 表即生效，
 * 弹层源码一个字节都不用改。
 *
 * ★ 例外：**拼出来的**那几条（`'✓ 连接成功（模型：' + name + '）· 已保存到本机'`、
 *   `'✗ ' + msg`）整段是运行时才成形的，扫描替换对不上 ⇒ 那几处必须走 `t('key', {...})`。
 */
import { registerDict } from '../i18n/index.js'

export const zh = {
  'uikit.testOk': '✓ 连接成功（模型：{model}）· 已保存到本机',
  'uikit.testFail': '✗ {msg}',
  'uikit.testFailFallback': '失败',
  'uikit.configuredHint': '已配置：{mask}　留空则保持不变',
  'uikit.picked': '{label}：取色后立即生效',
  'uikit.confirmClear': '将清除本机的设置、学情与埋点数据，且不可恢复。确定？',
  'uikit.cleared': '已清除。页面将刷新。',
}

export const en = {
  'uikit.testOk': '✓ Connected (model: {model}) · saved on this device',
  'uikit.testFail': '✗ {msg}',
  'uikit.testFailFallback': 'Failed',
  'uikit.configuredHint': 'Configured: {mask} — leave blank to keep it',
  'uikit.picked': '{label}: takes effect immediately after picking',
  'uikit.confirmClear': 'This clears local settings, learning progress and analytics data, and cannot be undone. Continue?',
  'uikit.cleared': 'Cleared. The page will reload.',
}

/** 中文原文 → 英文（DOM 扫描替换用） */
export const text = {
  // ---- 模型服务 ----
  '接入点 endpoint': 'Endpoint',
  '任何 OpenAI 兼容服务均可。只填域名或 /v1 会自动补全为 /chat/completions。':
    'Any OpenAI-compatible service works. A bare domain or /v1 is completed to /chat/completions automatically.',
  '留空则保持不变': 'Leave blank to keep the current key',
  '仅存本机，不上传服务器': 'Stored on this device only; never uploaded',
  '模型名': 'Model name',
  '填服务商文档里的模型名（本工具默认 deepseek-flash）。各家命名不同、且会随版本变化':
    "The model name from your provider's docs (this tool defaults to deepseek-flash). Naming differs between providers and changes over time",
  '推理强度 effort': 'Reasoning effort',
  '服务端默认': 'Server default',
  'low（快）': 'low (fast)',
  'max（强）': 'max (strongest)',
  '可选；部分服务不支持则忽略': 'Optional; ignored by services that do not support it',
  '输出上限 max_tokens': 'Max output tokens',
  '思考 + 正文共用。推理模型提问较长时若出现"没有正文"，把它调大':
    'Shared by reasoning and answer text. If a reasoning model shows "no answer text" on longer prompts, raise it.',
  '显示"思考中"过程': 'Show the "thinking" process',
  '启用主动服务（在检测到困惑时主动介入）': 'Enable proactive help (step in when confusion is detected)',
  '动画速度': 'Animation speed',
  '演示播放方式': 'Demonstration playback',
  '手动：每步停下，点「下一步」继续': 'Manual: pause at each step and continue with "Next"',
  '自动：按节奏连续播放': 'Auto: play continuously at a steady pace',
  '手动适合跟着讲解走；自动适合一次性放完。演示条上可临时切换。':
    'Manual suits explaining along the way; auto suits playing it all at once. Switchable from the demo bar.',
  '模型服务（改一次就不动）': 'Model service (set once, rarely changed)',
  '教学偏好（可能每次教学都调）': 'Teaching preferences (may change every session)',

  // ---- 配色 ----
  '点一个格子选中元素，再取色': 'Click a cell to select an element, then pick a color',
  '先点一个格子选中元素': 'Click a cell first to select an element',
  '恢复默认配色': 'Restore default colors',
  '已恢复默认配色': 'Default colors restored',

  // ---- 弹层标题与操作 ----
  '设置': 'Settings',
  '测试连接': 'Test connection',
  // ★ `测试中…` 是**直接赋给 DOM 文本节点**的（`testMsg.textContent = '测试中…'`），
  //   所以它属于这张表，而不是 `zh` 键表 —— 从前的版本把它登记成键，
  //   守卫只能报它"靠 zh 值遮盖"，运行时要靠扫描替换、却查不到它。
  '测试中…': 'Testing…',
  '数据与隐私': 'Data & privacy',
  '· 学情与设置只存本机浏览器（localStorage），不上传。':
    '· Learning progress and settings stay in this browser (localStorage); nothing is uploaded.',
  '· 对话内容不落库；只保留结构化动作序列用于复现与审计。':
    '· Conversation content is not persisted; only the structured action sequence is kept, for replay and audit.',
  '· API Key 只发往你填写的接入点，不经过任何第三方中转。':
    '· Your API key goes only to the endpoint you entered, with no third-party relay.',
  '清除本机全部数据': 'Clear all local data',
  '将清除本机的设置、学情与埋点数据，且不可恢复。确定？':
    'This clears local settings, learning progress and analytics data, and cannot be undone. Continue?',
  '已清除。页面将刷新。': 'Cleared. The page will reload.',
  '关于': 'About',
  '保存': 'Save',
  '（未配置）': '(not configured)',
}

registerDict('ui-kit', { zh, en, text })
