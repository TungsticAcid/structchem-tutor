/**
 * @chem-agent/i18n —— 学科无关的国际化运行时
 *
 * 为什么单独立一个包，而不是塞进 ui-kit：
 *   `packages/ui-kit/settings-popup.js` 已经 import 了 `../agent-core/ui/dom.js`，
 *   而面板（agent-core）也要用 i18n —— 放进 ui-kit 就是 agent-core ⇄ ui-kit 成环。
 *   这个包**零依赖**，谁都能 import。
 *
 * ---------------------------------------------------------------------------
 * 两张表，各管一件事（这是本运行时的核心设计）
 * ---------------------------------------------------------------------------
 *
 *   `text`：**中文原文 → 英文**。给「扫描替换」用。
 *     界面上的静态文案（尤其是从上游忠实移植过来的那些 HTML 模板）不必逐个改写成
 *     `t('some.key')` —— 只要把中文原文列进这张表，`sweep(root)` 就会把 DOM 里的
 *     文本节点与 title/placeholder/aria-label **原样换成译文**。
 *     好处：上游模板一个字节都不用动（本仓库对移植代码有"逐字忠实"的硬要求）。
 *
 *   `zh` / `en`：**键 → 文案**。给带参数的动态串用（`t('x.steps', {n: 3})`）。
 *     中文原文里带变量时，扫描替换做不到（`第 3 步` 与 `第 4 步` 是两条不同的原文），
 *     所以这类必须走键。
 *
 * ---------------------------------------------------------------------------
 * 缺译文时的行为（刻意如此）
 * ---------------------------------------------------------------------------
 *   查不到就**原样返回中文**，不抛错、不显示 `[missing]`。
 *   理由：漏译是**覆盖率问题**，交给 `tools/check-i18n.mjs` 一次性报出来
 *   （它扫全仓、按区域列未覆盖项、非零退出码）。
 *   在运行时把漏译变成长得像 bug 的东西，只会让"到底漏了哪些"更难看清。
 */
'use strict'

/** 缺省语言。中文是默认，也是回退 —— 缺译文时界面保持中文，不会出现半英半中的乱码 */
const FALLBACK = 'zh'

/**
 * 语言偏好的存储键。
 * ★ 与壳共用同一个键（全站只有一个界面语言偏好）。
 *   对称模块另有自己的 `symmetry_viewer_lang` —— 那是它移植自上游时就带的，
 *   宿主会用这个键的值去覆盖它，所以两者不会长期分叉。
 */
export const STORAGE_KEY = 'chem-agent.ui-lang'

const LANGS = ['zh', 'en']

/** scope → { zh, en, text } */
const DICTS = new Map()

let currentLang = FALLBACK
const listeners = new Set()

// ---------------------------------------------------------------------------
// 注册与查询
// ---------------------------------------------------------------------------

/**
 * 注册一个区域的字典。**可重复注册同名 scope**（后来者覆盖）——
 * 这样热更新与"分文件追加"都不会报错。
 *
 * @param {string} scope 区域名（'shell' / 'panel' / 'ui-kit' / 'orbit' / 'crystal' / 'agent'）
 * @param {{zh?:Object, en?:Object, text?:Object}} dict
 */
export function registerDict(scope, dict) {
  if (!scope || !dict) return
  DICTS.set(scope, {
    zh: (dict && dict.zh) || {},
    en: (dict && dict.en) || {},
    text: (dict && dict.text) || {},
  })
}

/** 已注册的区域列表（守卫与调试用） */
export function registeredScopes() { return Array.from(DICTS.keys()).sort() }

function lookupKey(key, lang) {
  if (!key) return undefined
  // 先按 scope 前缀直取（'orbit.title' → scope 'orbit'），命中就不必扫全场
  const dot = key.indexOf('.')
  if (dot > 0) {
    const scoped = DICTS.get(key.slice(0, dot))
    if (scoped && scoped[lang] && scoped[lang][key] !== undefined) return scoped[lang][key]
  }
  for (const d of DICTS.values()) {
    if (d[lang] && d[lang][key] !== undefined) return d[lang][key]
  }
  return undefined
}

/**
 * 按键取文案。`{name}` 占位符会被 vars 替换。
 *
 * @param {string} key
 * @param {Object} [vars]
 * @returns {string} 查不到时回退：当前语言 → zh → **原样返回 key**
 */
export function t(key, vars) {
  if (key == null) return ''
  let s = lookupKey(key, currentLang)
  if (s === undefined) s = lookupKey(key, FALLBACK)
  // ★ 再回退到「中文原文 → 译文」表：有些文案**原文本身就是键**（动作标签、
  //   图层名、题库数据、由模块拼给面板的短标签）。少了这条回退，
  //   `t('显示/隐藏对称元素')` 会**原样返回那句中文** —— 中文模式下看着没错，
  //   英文模式下就留着中文，而且**不报错**（这类"看着对"的漏译最难发现）。
  //   `tsrc` 在中文模式下返回 null（那是刻意的：中文模式不做替换），
  //   所以这条回退不会影响中文模式任何行为。
  if (s === undefined) {
    const hit = tsrc(key)
    if (hit != null) s = hit
  }
  if (s === undefined) return key
  if (vars) {
    s = String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])))
  }
  return s
}

/**
 * 按**中文原文**取译文（扫描替换用的就是它）。
 *
 * @param {string} zhText
 * @returns {string|null} 没登记时返回 null（调用方据此**保持原文**，不要写空串）
 */
export function tsrc(zhText) {
  if (currentLang === FALLBACK) return null      // 中文模式下不做任何替换
  const s = String(zhText == null ? '' : zhText)
  if (!s) return null
  // 先试原样，再试去掉首尾空白（DOM 文本节点常带缩进）
  const trimmed = s.trim()
  if (!trimmed) return null
  for (const d of DICTS.values()) {
    if (d.text && d.text[trimmed] !== undefined) return d.text[trimmed]
  }
  return null
}

/** 这条中文原文有没有登记译文（守卫与调试用） */
export function hasText(zhText) {
  const trimmed = String(zhText == null ? '' : zhText).trim()
  if (!trimmed) return false
  for (const d of DICTS.values()) {
    if (d.text && d.text[trimmed] !== undefined) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// 语言状态
// ---------------------------------------------------------------------------

/** 跟随浏览器：以 zh 开头用中文，否则英文。**只在用户没表达过偏好时用**。 */
export function detectLang() {
  const nav = (typeof navigator !== 'undefined') && navigator
  if (!nav) return FALLBACK
  const list = (nav.languages && nav.languages.length) ? nav.languages : [nav.language]
  for (const l of list) {
    if (!l) continue
    // ★ 判断的是"首个有意义的语言标签"，而不是扫遍全表找中文：
    //   一个中英混排偏好（['en-US','zh-CN']）应当按**首选**走英文。
    return /^zh\b/i.test(l) ? 'zh' : 'en'
  }
  return FALLBACK
}

/** 读持久化的偏好；没有（或存了非法值）则跟随浏览器 */
export function loadLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (LANGS.indexOf(v) >= 0) return v
  } catch (e) { /* 无 localStorage（Node / 隐私模式）→ 跟随浏览器 */ }
  return detectLang()
}

function saveLang(v) {
  try { localStorage.setItem(STORAGE_KEY, v) } catch (e) { /* 不可用时只是不记忆 */ }
}

/** 用户有没有显式选过语言（决定要不要跟随浏览器） */
export function hasStoredLang() {
  try { return LANGS.indexOf(localStorage.getItem(STORAGE_KEY)) >= 0 } catch (e) { return false }
}

function syncHtmlLang() {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (el && el.setAttribute) el.setAttribute('lang', currentLang === 'en' ? 'en' : 'zh-CN')
}

/**
 * 语言单例。
 * ★ 事件名沿用对称模块移植过来时就在用的 `'langchange'` —— 本仓已有消费者，
 *   另起一个名字会变成两套通知机制。
 */
export const i18n = {
  get lang() { return currentLang },
  /** 语言变更的订阅；返回退订函数 */
  onChange(fn) {
    if (typeof fn !== 'function') return () => {}
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  setLang(lang, opts) {
    const v = LANGS.indexOf(lang) >= 0 ? lang : FALLBACK
    const force = !!(opts && opts.force)
    if (v === currentLang && !force) return false
    currentLang = v
    saveLang(v)
    syncHtmlLang()
    // ★ 先把上一语言的替换**还原**成中文原文，再按新语言扫一遍。
    //   缺"还原"：切回中文时界面卡在英文（tsrc 是单向的，见 restore 的说明）；
    //   缺"重扫"：切到英文时已经渲染出来的 DOM 不变。两种都**不报错**。
    //   ★ 这一步救不了走 `t()` 取的文案（它们不在 text 表里）——
    //     那些必须由订阅 `langchange` 的页面自己重渲染。
    if (typeof document !== 'undefined' && document) {
      try { restore(document) } catch (e) { /* 还原失败不该挡住语言切换 */ }
      try { sweep(document) } catch (e) { /* 扫描失败同上 */ }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: v } }))
      // ★ 再派一个 `langchange:done`？不。订阅者**自己**决定是同步重渲染还是异步。
      //   运行时只负责"通知到了"，重渲染的时机属于各页面（有的页面重建代价很大，
      //   例如 orbit 的等值面要十几秒 —— 那种页面不该在换语言时重建几何）。
    }
    for (const fn of listeners) {
      try { fn(v) } catch (e) { /* 单个订阅者异常不影响其余 */ }
    }
    // ★ **订阅者跑完再扫一遍**。理由：订阅者里最常见的一手是**同步重渲染**
    //   （重挂路由、重画控制条、重填 placeholder），而它们刚写进 DOM 的是**中文原文**；
    //   上面那次 sweep 在它们之前，扫不到这些新节点。
    //   不补这一刀的表现是"切回英文后界面还是中文，过一会儿才变"——实测：
    //   语言往返回合的第三个探针在 2 秒内仍是中文（自动扫描要等一帧 rAF）。
    //   异步重渲染（慢加载、等数据）仍由 `startAutoSweep` 兜。
    if (typeof document !== 'undefined' && document) {
      try { sweep(document) } catch (e) { /* 扫描失败不该影响语言切换 */ }
    }
    return true
  },
}

// ---------------------------------------------------------------------------
// DOM 扫描替换
// ---------------------------------------------------------------------------

/** 这些属性里的文本也要翻（都是用户能看见的） */
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt']

function translateAttrs(el) {
  if (!el || !el.getAttribute || !el.setAttribute) return 0
  let n = 0
  for (const a of ATTRS) {
    const cur = el.getAttribute(a)
    if (!cur) continue
    const hit = tsrc(cur)
    if (hit != null && hit !== cur) {
      // ★ 记下**原文与译文两样**：还原时要靠译文认领"这个值确实是我们写的"。
      //   只存原文是不够的 —— 切回中文时 `tsrc()` 已经返回 null 了，没法比对。
      try {
        if (!el.__i18nZhAttrs) el.__i18nZhAttrs = {}
        if (!el.__i18nZhAttrs[a]) el.__i18nZhAttrs[a] = { zh: cur, en: hit }
      } catch (e) { /* 只读元素：放弃记忆，仍要翻译 */ }
      el.setAttribute(a, hit)
      n++
    }
  }
  return n
}

/**
 * 就地扫描一棵子树，把登记过的中文原文换成译文。
 *
 * @param {Node|Document} [root] 省略则扫 document
 * @returns {number} 实际替换了多少处（守卫与调试用）
 */
export function sweep(root) {
  if (currentLang === FALLBACK) return 0
  const doc = (typeof document !== 'undefined') ? document : null
  const start = root || doc
  if (!start) return 0
  let n = 0
  // ★ 用 TreeWalker 而不是 querySelectorAll：前者能拿到**文本节点**，
  //   而界面文案绝大多数是"标签里直接写文字"（`<label>背景色</label>`），
  //   它们不在任何元素的 textContent 边界上，逐个元素替换会连带吃掉子元素。
  const walker = doc.createTreeWalker
    ? doc.createTreeWalker(start, 4 /* SHOW_TEXT */, null)
    : null
  if (walker) {
    const hits = []
    let node = walker.nextNode()
    while (node) {
      const parent = node.parentNode
      // script/style 里的文本不是界面文案；已替换过的不再处理
      const tag = parent && parent.nodeName ? parent.nodeName.toLowerCase() : ''
      if (tag !== 'script' && tag !== 'style' && node.__i18n !== true) {
        const raw = node.nodeValue || ''
        const hit = tsrc(raw)
        // ★ 只在**整段都是原文**（允许首尾空白）时替换。
        //   半截匹配（比如 `共 3 个轨道` 里的 `个轨道`）会把句子切成碎片，
        //   而那些位置本来就该走 t() 带参数，不该由扫描兜。
        if (hit != null && hit !== raw) { hits.push([node, raw, raw.replace(raw.trim(), hit)]) }
        else if (hit == null && raw.indexOf('\n') >= 0) {
          // ★ 多行文本节点：整段查不到时**逐行**试一次。
          //   为什么需要：一段"三行说明"在源码里常常是三个字符串拼起来的
          //   （`'甲\n' + '乙\n' + '丙'`），守卫按**行**报未覆盖、译文表也按行登记，
          //   而 DOM 里它是**一个**文本节点 —— 只做整段匹配的话，
          //   这三行永远翻不掉，且不报错（`ui-kit` 的隐私说明就是这种）。
          let changed = false
          const mapped = raw.split('\n').map((line) => {
            if (!line.trim()) return line
            const h = tsrc(line)
            if (h != null && h !== line) { changed = true; return line.replace(line.trim(), h) }
            return line
          })
          if (changed) hits.push([node, raw, mapped.join('\n')])
        }
      }
      node = walker.nextNode()
    }
    for (const [node, raw, next] of hits) {
      node.nodeValue = next
      node.__i18n = true
      node.__i18nZh = raw        // 原文留在节点上，切回中文时用（见 restore）
      n++
    }
  }
  // 元素上的属性（title / placeholder 等）
  const all = start.querySelectorAll ? start.querySelectorAll('*') : []
  for (const el of all) n += translateAttrs(el)
  if (start.nodeType === 1) n += translateAttrs(start)
  return n
}

/**
 * 就地**还原**一棵子树：把 `sweep()` 换掉的文本改回中文原文。
 *
 * ★ 为什么必须有它：`tsrc` 只认"中文原文 → 译文"，是**单向**的 ——
 *   一旦把 DOM 扫成英文，再切回中文时字典里没有"英文 → 中文"这条反路，
 *   于是界面会**卡在英文**上。表现是"切回中文没反应"，而它不报错、也不崩。
 *   记录原文（而不是做反向字典）还避开了"同一句英文对应多个中文原文"的歧义。
 *
 * ★ 只还原**我们改过的**节点：带着 `__i18nZh` 标记的。用户自己输入的内容、
 *   模型返回的正文都不会被碰。
 *
 * @param {Node|Document} [root] 省略则扫 document
 * @returns {number} 还原了多少处
 */
export function restore(root) {
  const doc = (typeof document !== 'undefined') ? document : null
  const start = root || doc
  if (!start) return 0
  let n = 0
  const walker = doc.createTreeWalker
    ? doc.createTreeWalker(start, 4 /* SHOW_TEXT */, null)
    : null
  if (walker) {
    let node = walker.nextNode()
    while (node) {
      if (node.__i18n && typeof node.__i18nZh === 'string') {
        node.nodeValue = node.__i18nZh
        node.__i18n = false
        node.__i18nZh = null
        n++
      }
      node = walker.nextNode()
    }
  }
  const all = start.querySelectorAll ? start.querySelectorAll('*') : []
  const els = start.nodeType === 1 ? [start].concat(Array.from(all)) : Array.from(all)
  for (const el of els) {
    const m = el && el.__i18nZhAttrs
    if (!m) continue
    for (const a of Object.keys(m)) {
      const rec = m[a]
      const cur = el.getAttribute && el.getAttribute(a)
      // 只有"当前值还是我们写进去的译文"时才还原 —— 页面自己重写过就不该插手
      if (cur === rec.en) { el.setAttribute(a, rec.zh); delete m[a]; n++ }
    }
    if (Object.keys(m).length === 0) { try { el.__i18nZhAttrs = null } catch (e) { /* 忽略 */ } }
  }
  return n
}

/**
 * 开一个**自动扫描**：子树有 DOM 变动就重新扫一遍。
 *
 * ★ 为什么需要它：orbit 与 crystal 两个页面是从上游**忠实移植**的，它们的渲染代码
 *   每次重算都会重写 innerHTML（图表标签、读数、提示都会变回中文）。要覆盖那些位置，
 *   只有两条路：把上游渲染代码里每一处字符串都改成 t()（破坏"逐字忠实"），
 *   或者让运行时盯着 DOM。
 *
 * ★ 为什么不会死循环：只有"命中字典"的文本才会被改写，而改写后的英文**不可能**
 *   再命中中文原文表 → 下一轮没有可写的 → 没有新 mutation。终止性由这一点保证。
 *
 * ★ 为什么用 rAF 而不是立即扫：一轮渲染常常同步改几十个节点，逐个回调扫一遍太浪费。
 *   只挂**一个**待执行的 rAF（不排队），代价与"一帧一次"同级。
 *
 * @param {Element|Document} root
 * @returns {Function} 停止函数
 */
export function startAutoSweep(root) {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  const target = root || document
  if (!target) return () => {}
  let pending = false
  let stopped = false
  const run = () => {
    pending = false
    if (stopped) return
    try { sweep(target) } catch (e) { /* 扫描失败不该影响页面 */ }
  }
  const mo = new MutationObserver(() => {
    if (pending || stopped) return
    pending = true
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else setTimeout(run, 16)
  })
  mo.observe(target, { childList: true, subtree: true, characterData: true })
  // 立刻先扫一遍（挂载时已有的内容）
  run()
  return () => { stopped = true; mo.disconnect() }
}

// 首次加载即同步 <html lang>（读持久化偏好；没有就跟浏览器）
currentLang = (typeof localStorage !== 'undefined') ? loadLang() : FALLBACK
syncHtmlLang()

export default { t, tsrc, hasText, i18n, sweep, restore, startAutoSweep, registerDict,
  registeredScopes, detectLang, loadLang, hasStoredLang, STORAGE_KEY }
