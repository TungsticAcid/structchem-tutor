/**
 * theme.js — 主题运行时（暗 / 浅 / 跟随系统）
 *
 * ★ tokens.css 已经定义好了两套令牌，注释里也写明了用法：
 *     `:root`                    → 暗色
 *     `[data-theme="light"]`     → 浅色
 *     `@media (prefers-color-scheme: light) { :root:not([data-theme]) { … } }`
 *   也就是说**机制早就设计好了**（"模块不写死颜色，壳在 <html> 上设 data-theme
 *   即可整体切换"），缺的只是运行时。本文件补上它。
 *
 * ★ 三种取值，而不是两种：
 *     'system' → **移除** `data-theme` 属性，交给 CSS 的媒体查询决定
 *     'dark'   → 显式 data-theme="dark"
 *     'light'  → 显式 data-theme="light"
 *   'system' 是默认值。这样"跟随系统"不需要我们在 JS 里读媒体查询再转发——
 *   那会引入一帧的闪烁（JS 执行前页面已按默认色画了一次），
 *   而让 CSS 自己判断就没有这个问题。
 *
 * ★ 为什么要派发事件：主题切换后，**用 JS 画的 canvas 不会自己重绘**
 *   （三维视图的 clearColor、缩略图、图表都是）。它们订阅 `themechange`
 *   自行重绘。这一点在本仓库是有先例的：晶体线的语言切换也走 `langchange` 事件，
 *   而不是满页重载。
 */

/** localStorage 键（带命名空间，避免与模块的键撞） */
const THEME_KEY = 'chem-agent.theme'

/** 合法取值 */
export const THEMES = ['system', 'dark', 'light']

/** 当前取值（'system' | 'dark' | 'light'） */
let current = 'system'

/** 主题变化的订阅者（多订阅：三维视图、缩略图、图表都要重绘） */
const subscribers = new Set()

/** 从 localStorage 读取（读不到或非法则回落 'system'） */
function loadTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return THEMES.includes(v) ? v : 'system'
  } catch (e) {
    // 隐私模式等场景下 localStorage 可能不可用——不影响功能，只是不记忆
    return 'system'
  }
}

/**
 * 把取值落到 DOM 上。
 * ★ 'system' 时**删除**属性（而不是设成 "system"）——CSS 的
 *   `:root:not([data-theme])` 正是靠"属性不存在"来生效的。
 */
function applyToDom(theme) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (theme === 'system') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', theme)
}

/** 实际生效的颜色模式（把 'system' 解析成 'dark' 或 'light'）——诊断与 canvas 重绘要用 */
export function resolvedTheme() {
  if (current !== 'system') return current
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  // CSS 的兜底是暗色（`:root` 就是暗色），故无媒体查询时按暗色报
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** 取当前设置值（'system' | 'dark' | 'light'，**不是**解析后的） */
export function getTheme() {
  return current
}

/**
 * 设置主题。
 * @param {'system'|'dark'|'light'} theme
 */
export function setTheme(theme) {
  if (!THEMES.includes(theme)) {
    console.warn(`[theme] 未知取值「${theme}」，忽略（合法值：${THEMES.join(' / ')}）`)
    return current
  }
  if (theme === current) return current
  current = theme
  try { localStorage.setItem(THEME_KEY, theme) } catch (e) { /* 不可用时只是不记忆 */ }
  applyToDom(theme)
  emit()
  return current
}

/** 在 'dark' 与 'light' 之间切换（'system' 视作其解析结果再切换） */
export function toggleTheme() {
  return setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark')
}

/**
 * 订阅主题变化。返回取消函数。
 * ★ 用 Set 而非单槽位——多个 canvas 都要重绘，单槽位会被后注册者静默顶掉
 *   （契约里对 onAction 有同样的警告）。
 * @param {(theme: string, resolved: string) => void} cb
 */
export function onThemeChange(cb) {
  if (typeof cb !== 'function') return () => {}
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

function emit() {
  const resolved = resolvedTheme()
  for (const cb of [...subscribers]) {
    try { cb(current, resolved) } catch (e) {
      // 单个订阅者异常不应影响其余订阅者
      console.warn('[theme] 订阅者异常：', e)
    }
  }
}

/** 仅供测试：重置状态 */
export function _reset() {
  current = 'system'
  subscribers.clear()
}

/**
 * 初始化：读持久化的取值并应用；同时监听系统主题变化。
 *
 * ★ 系统主题变化时**只在 'system' 模式下**通知订阅者：
 *   用户显式选了暗色，就不该因为系统切到浅色而重绘。
 *   （CSS 由媒体查询自动处理，我们这边只需管 canvas。）
 */
export function initTheme() {
  current = loadTheme()
  applyToDom(current)
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onSys = () => { if (current === 'system') emit() }
    // addEventListener 在旧 Safari 上不存在，退回 addListener
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onSys)
    else if (typeof mq.addListener === 'function') mq.addListener(onSys)
  }
  emit()
  return current
}

export default { initTheme, setTheme, getTheme, toggleTheme, resolvedTheme, onThemeChange, THEMES }
