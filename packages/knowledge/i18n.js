/**
 * packages/knowledge/i18n.js —— 知识库的国际化：字典 + **按语言取条目**
 *
 * ---------------------------------------------------------------------------
 * 为什么知识库不能只靠"字典 + DOM 扫描"
 * ---------------------------------------------------------------------------
 * 知识条目**不进 DOM** —— 它们是这样流动的：
 *   ① `catalog.index()` 的清单进**系统提示**（渐进式披露：只给标题与关键词）；
 *   ② 模型调 `loadKnowledge(id)` 时 `catalog.load(id)` 的正文进**对话上下文**。
 * 两条路都不经过浏览器，`sweep()` 一个字也换不到。所以知识库必须
 * **在取条目的那一刻按语言映射**（下面的 `localizeEntry` / `wrapCatalogForLang`）。
 *
 * ---------------------------------------------------------------------------
 * 为什么译文放在 `text` 表里（而不是给条目加 `…En` 字段）
 * ---------------------------------------------------------------------------
 * 两件事决定了这个选择：
 *   · **条目正文的粒度是"一行"**：`body` 是 `[...].join('\n')`，守卫扫到的就是
 *     数组里的每个元素。译文表按"整行原文"做键，与守卫、与运行时**三者粒度一致**。
 *   · 加 `…En` 字段意味着**同一份内容在源码里出现两次**（中英各一份），
 *     而守卫要变绿还得再把中文原文登记一次 —— 那就是三份。
 * 代价是译文与条目不在同一个文件里。为此把每本译文表放在**对应模块的目录下**
 * （`crystal/i18n.js` / `orbit/i18n.js` / `symmetry/i18n.js`），就近可查。
 *
 * ★ 本文件必须能被 Node 直接 import（守卫在 Node 里读它）⇒ **纯数据 + 相对路径**。
 */

import { registerDict } from '../i18n/index.js'
import { ELEMENTS } from './shared/elements.js'
import { entryText as crystalText } from './crystal/i18n.js'
import { entryText as orbitText } from './orbit/i18n.js'
import { entryText as symmetryText } from './symmetry/i18n.js'

// ---------------------------------------------------------------------------
// 一、从**既有真源**派生出来的译文（不手抄，避免第二份数据）
// ---------------------------------------------------------------------------

/**
 * 元素名：`elements.js` 里每个元素**本来就有 `enName`** —— 直接派生即可。
 *
 * ★ 为什么不是手写 103 条：手写就是在真源旁边再放一份会漂移的副本，
 *   而这份副本没有任何守卫。派生出来的表**不可能与真源不一致**。
 */
const elementText = {}
for (const el of Object.values(ELEMENTS)) {
  if (el && el.name && el.enName) elementText[el.name] = el.enName
}

// ---------------------------------------------------------------------------
// 二、译文表（三个模块各一本，本文件只做汇总）
// ---------------------------------------------------------------------------

/**
 * 中文原文 → 英文。
 * ★ 顺序即优先级：后者覆盖前者（三本表之间不应有重键；有重键说明有内容在两边重复定义）。
 */
export const text = Object.assign(
  {},
  elementText,
  symmetryText,
  orbitText,
  crystalText,
)

// ★ 用具名导出把三本表**暴露给覆盖率守卫**：守卫 import 本文件后，
//   会遍历所有导出值并下钻对象，从而把每条中文原文算作"已登记"。
//   少了这三个导出，守卫就看不见译文表 —— 那正是它给对称模块误报 263 条的原因。
export { crystalText, orbitText, symmetryText }

registerDict('knowledge', { zh: {}, en: {}, text })

// ---------------------------------------------------------------------------
// 三、按语言取条目
// ---------------------------------------------------------------------------

/** 当前语言（不 import @i18n 的 i18n 单例，避免在 Node 下触发它的 DOM 副作用） */
let lang = 'zh'

/** 语言变更时由宿主调用（见 `wrapCatalogForLang`） */
export function setKnowledgeLang(v) { lang = (v === 'en') ? 'en' : 'zh' }
export function getKnowledgeLang() { return lang }

/**
 * 查一行译文。**先原样、再 trim**（后者保留缩进）。
 *
 * ★ 为什么要两段查找：条目正文在源码里为对齐写过缩进，而那些缩进**属于字符串内容**
 *   （`body` 是数组 `join('\n')`，元素里带前导空格）。守卫报未覆盖时给的是
 *   `trim()` 之后的片段，词典作者自然按 trim 后的原文登记 ——
 *   只做原样查找的话，**带缩进的那几十行会静默失效**（守卫绿、英文模式下照旧中文）。
 *   实测：晶体条目里有 61 行带缩进。反过来（只做 trim 查找）也会丢掉缩进排版。
 *   所以两段都要：命中哪一个都算，trim 命中时把缩进原样保留下来。
 *
 * @param {string} line
 * @returns {string|null}
 */
function lookupLine(line) {
  if (text[line] !== undefined) return text[line]
  const trimmed = line.trim()
  if (trimmed && text[trimmed] !== undefined) return line.replace(trimmed, text[trimmed])
  return null
}

/**
 * 把**一整段可含换行的文本**逐行映射；单行文本走整串映射。
 *
 * ★ 为什么要分两种：`body` 是 `[...].join('\n')` 的结果，译文表里按**行**登记，
 *   整串去查表必然查不到（守卫看到的就是行）。而 `title` 这种单行文本直接查即可。
 *
 * @param {string} s
 * @returns {string} 查不到的行**原样保留**（不显示 [missing]，见 packages/i18n 的说明）
 */
function localizeText(s) {
  if (typeof s !== 'string' || !s) return s
  if (s.indexOf('\n') < 0) {
    const hit = lookupLine(s)
    return hit == null ? s : hit
  }
  return s.split('\n').map((line) => {
    if (!line) return line
    const hit = lookupLine(line)
    return hit == null ? line : hit
  }).join('\n')
}

/**
 * 深度映射一个条目：所有字符串都过一遍译文表，数组与嵌套对象跟着下钻。
 *
 * ★ 为什么深度而不是逐字段白名单：`catalog.js` 有意写成"按减法"（`load()` 返回完整
 *   条目），知识条目将来新增字段时不该在这里被**静默丢掉**。
 *   `id` / `kp` 里没有中文，查表查不到 → 原样返回，不受影响。
 */
function localizeDeep(v) {
  if (typeof v === 'string') return localizeText(v)
  if (Array.isArray(v)) return v.map(localizeDeep)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v)) out[k] = localizeDeep(v[k])
    return out
  }
  return v
}

/**
 * 按当前语言取一个条目。中文模式下**原样返回**（不做任何拷贝，省得白花内存）。
 * @param {Object} entry
 */
export function localizeEntry(entry) {
  if (!entry || lang === 'zh') return entry
  return localizeDeep(entry)
}

/**
 * 包一层目录：`index()` / `load()` / `filterBy()` 都按当前语言返回。
 *
 * ★ 为什么不改 `catalog.js`：它是**通用**目录（技能库也用它），把"知识条目怎么翻"
 *   塞进去就是把学科细节漏进共享内核。包一层的代价只有一个 5 行的转发对象，
 *   而 `register` 原样透传 —— 注册时机与内容完全不变。
 *
 * @param {ReturnType<import('../agent-core/core/catalog.js').createCatalog>} catalog
 */
export function wrapCatalogForLang(catalog) {
  return {
    register: (list) => catalog.register(list),
    index: () => catalog.index().map(localizeEntry),
    load: (id) => localizeEntry(catalog.load(id)),
    has: (id) => catalog.has(id),
    ids: () => catalog.ids(),
    filterBy: (field, value) => catalog.filterBy(field, value).map(localizeEntry),
    count: () => catalog.count(),
    clear: () => catalog.clear(),
  }
}

export default { text, localizeEntry, wrapCatalogForLang, setKnowledgeLang, getKnowledgeLang }
