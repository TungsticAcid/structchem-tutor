/**
 * i18n-live.js —— 晶体模块**运行时**取译文的小工具（不是字典本身）
 *
 * ---------------------------------------------------------------------------
 * 为什么单独一个文件，而不是塞进 i18n.js
 * ---------------------------------------------------------------------------
 * `i18n.js` 必须是**纯数据**：覆盖率守卫（`tools/check-i18n.mjs`）在 Node 里
 * import 它、遍历它的导出对象来读"登记了哪些原文"。往里放函数会让那份遍历多出
 * 它不认识的形状。所以字典归字典、取词归取词。
 *
 * 本文件路径里含 `i18n`，守卫的 skip 规则（`/\/i18n/`）会跳过它——它本来也不该
 * 有中文原文，翻译归 i18n.js 管。
 *
 * ---------------------------------------------------------------------------
 * 两种取词的用法（与 HOWTO §4 的判据一致）
 * ---------------------------------------------------------------------------
 *   `t('key', {n})` —— **带变量**或**代码自己写的**文案。键写进 zh/en 表。
 *   `tr('中文原文')` —— **内容数据**（题库、错因库、演示旁白、图层标签这类
 *                        "中文原文本身就是键"的表）。译文写在 `text` 表里。
 *
 * ★ `tr` 是**惰性**的：它在被调用的那一刻查表，所以语言切换之后再取就拿到新语言。
 *   绝不能在模块加载时把它算好存进常量——那样切语言不会生效，而且不报错。
 */
import { t, tsrc } from '../../packages/i18n/index.js'
// ★ 副作用 import：**保证字典一定被注册**。
//   任何用 t()/tr() 的文件都会 import 本文件，所以把注册挂在这里，就不必逐个文件
//   记得加 `import './i18n.js'`。反过来（只在 index.js 里注册）会有一个静默缺陷：
//   单独 import facade.js 的测试/工具拿到的是**未注册的运行时** —— `t()` 查不到就
//   原样返回键名，于是 `facade.title` 变成字符串 'crystal.title'，而它不报错。
import './i18n.js'

export { t }

/**
 * 中文原文 → 当前语言译文。
 * ★ 中文模式下 `tsrc` 返回 null（那是刻意的：中文模式下不做替换），此处原样返回原文。
 *   查不到译文时同样返回原文——缺译是**覆盖率问题**，交给守卫报，不该在运行时炸。
 *
 * @param {string} zhText
 * @returns {string}
 */
export function tr(zhText) {
  const hit = tsrc(zhText)
  return hit == null ? zhText : hit
}

/**
 * 把对象/数组里所有字符串过一遍 `tr`（用于词汇表的 params 这类嵌套说明文字）。
 * 非字符串原样透传；键名不动（`{ layer: '图层名' }` 里的 key 是模型要用的字段名）。
 *
 * @param {*} v
 * @returns {*}
 */
export function trDeep(v) {
  if (typeof v === 'string') return tr(v)
  if (Array.isArray(v)) return v.map(trDeep)
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, x] of Object.entries(v)) out[k] = trDeep(x)
    return out
  }
  return v
}

export default { t, tr, trDeep }
