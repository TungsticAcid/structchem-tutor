/**
 * test-shell.mjs —— 统一壳自身逻辑的回归守卫
 *
 * 目前守护的是一件**用户报过的真实故障**：进得去、出不来（死路）。
 * 起因是移植进来的对称页来自上游的**单页应用**，原本没有"返回别处"这个概念。
 * 这类问题的可怕之处在于它**不报错**——页面渲染得好好的，只是没有出口。
 *
 * ★ DOM 桩要**忠实**，这是本仓库付过代价的地方（见 test-core.mjs 里那段
 *   "桩原先只按 tag 比对，于是 `querySelector('.agent-act-row')` 会去找标签名"）。
 *   本文件的选择器匹配支持 `.class` / `#id` / `[attr]` 三种形式——
 *   因为 `installHomeButton` 三种都用了，桩若只认其中一种，
 *   测试就会在"实际能跑"的地方报红、或在"实际跑不了"的地方报绿。
 *
 * 用法：node apps/web/tools/test-shell.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')

// ---------------------------------------------------------------------------
// 忠实的最小 DOM 桩
// ---------------------------------------------------------------------------
let created = []

function matches(node, sel) {
  sel = sel.trim()
  if (sel.startsWith('.')) {
    const c = sel.slice(1)
    return String(node.className || '').split(/\s+/).includes(c) || node._classes.has(c)
  }
  if (sel.startsWith('#')) return node.attrs.id === sel.slice(1)
  if (sel.startsWith('[')) {
    const m = /^\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(sel)
    if (!m) return false
    if (!(m[1] in node.attrs)) return false
    return m[2] === undefined || node.attrs[m[1]] === m[2]
  }
  return node.tag === sel
}

function findIn(node, sel) {
  for (const c of node.children) {
    if (matches(c, sel)) return c
    const r = findIn(c, sel)
    if (r) return r
  }
  return null
}

function findAllIn(node, sel, out = []) {
  for (const c of node.children) {
    if (matches(c, sel)) out.push(c)
    findAllIn(c, sel, out)
  }
  return out
}

function mkEl(tag) {
  const n = {
    tag, className: '', textContent: '', innerHTML: '', children: [], attrs: {}, title: '',
    type: '', _classes: new Set(), _ev: {},
    setAttribute(k, v) {
      n.attrs[k] = String(v)
      if (k === 'class') n.className = String(v)
    },
    getAttribute(k) { return n.attrs[k] === undefined ? null : n.attrs[k] },
    removeAttribute(k) { delete n.attrs[k] },
    appendChild(c) { n.children.push(c); return c },
    insertBefore(c, ref) {
      const i = ref ? n.children.indexOf(ref) : -1
      if (i < 0) n.children.unshift(c)
      else n.children.splice(i, 0, c)
      return c
    },
    removeChild(c) { const i = n.children.indexOf(c); if (i >= 0) n.children.splice(i, 1); return c },
    addEventListener(t, fn) { n._ev[t] = fn },
    querySelector(sel) { return findIn(n, sel) },
    querySelectorAll(sel) { return findAllIn(n, sel) },
    get firstChild() { return n.children[0] || null },
  }
  n.classList = {
    add: (...c) => c.forEach((x) => n._classes.add(x)),
    remove: (...c) => c.forEach((x) => n._classes.delete(x)),
    contains: (c) => n._classes.has(c),
  }
  return n
}

globalThis.document = {
  createElement(tag) { const e = mkEl(tag); created.push(e); return e },
}
let hashSet = null
globalThis.location = {
  get hash() { return hashSet || '' },
  set hash(v) { hashSet = v },
}

// ---------------------------------------------------------------------------
// 被测模块（必须在装好全局之后 import）
// ---------------------------------------------------------------------------
const { installHomeButton } = await import('../src/shell/home-affordance.js')

// ---------------------------------------------------------------------------
// 断言
// ---------------------------------------------------------------------------
let pass = 0
let fail = 0
const bad = []
function ok(cond, label, extra) {
  if (cond) { pass++; return }
  fail++
  bad.push(label + (extra ? '  ← ' + extra : ''))
}

/** 造一个页面根；`spec` 描述它有哪些元素 */
function mkRoot(spec) {
  const root = mkEl('div')
  for (const s of spec) {
    const el = mkEl('div')
    if (s.cls) el.setAttribute('class', s.cls)
    if (s.id) el.setAttribute('id', s.id)
    // 任意属性（⑩ 要造带 data-page-topbar 的根）
    if (s.attrs) for (const [k, v] of Object.entries(s.attrs)) el.setAttribute(k, v)
    root.appendChild(el)
  }
  return root
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('统一壳 · 回门户入口（防"进得去出不来"）')
console.log('═══════════════════════════════════════════════════════════════')

// ---- ① 有顶栏 → 插进顶栏的最前面 ----
console.log('【① 有顶栏：装进顶栏的第一项】')
{
  const root = mkRoot([{ cls: 'page-nav' }])
  const nav = root.querySelector('.page-nav')
  const title = mkEl('span')
  nav.appendChild(title)
  const r = installHomeButton(root)
  ok(r === true, '返回 true（装上了）')
  ok(!!root.querySelector('[data-shell-home]'), '页面上出现了 [data-shell-home]')
  ok(nav.firstChild && nav.firstChild.attrs['data-shell-home'] !== undefined,
    '它是顶栏的**第一项**（排在标题前）', nav.children.map((c) => c.tag).join(','))
}

// ---- ② 另一种顶栏也能命中 ----
console.log('【② 另一种顶栏（#toolbar）也能命中】')
{
  const root = mkRoot([{ id: 'toolbar' }])
  ok(installHomeButton(root) === true, 'toolbar 页面也装上了')
  ok(root.querySelector('#toolbar').firstChild.attrs['data-shell-home'] !== undefined, '插进了 toolbar')
}

// ---- ③ 页面自带返回 → 不插手 ----
console.log('【③ 页面自带返回控件时不重复装】')
for (const own of [{ cls: 'back-btn' }, { cls: 'cp-back' }, { id: 'backBtn' }, { id: 'cpBack' }]) {
  const root = mkRoot([{ cls: 'top-bar' }, own])
  const r = installHomeButton(root)
  ok(r === false, `已有 ${own.cls || own.id} 时不装`, String(r))
  ok(!root.querySelector('[data-shell-home]'), `已有 ${own.cls || own.id} 时页面上没有第二个按钮`)
}

// ---- ④ 没有顶栏 → 悬浮兜底（**这一条是"永远有出路"的保证**）----
console.log('【④ 没有顶栏时退化为悬浮（保证永远有出路）】')
{
  const root = mkRoot([])
  const r = installHomeButton(root)
  ok(r === true, '没有任何顶栏结构时仍然装上了', String(r))
  const btn = root.querySelector('[data-shell-home]')
  ok(!!btn, '按钮存在')
  ok(btn && btn._classes.has('shell-home--float'), '带了 --float 类（固定悬浮）')
}

// ---- ⑤ 幂等：同一次挂载里被调两次不重复装 ----
console.log('【⑤ 幂等】')
{
  const root = mkRoot([{ cls: 'page-nav' }])
  ok(installHomeButton(root) === true, '第一次装上')
  ok(installHomeButton(root) === false, '第二次返回 false')
  ok(root.querySelectorAll('[data-shell-home]').length === 1, '页面上仍只有一个按钮')
}

// ---- ⑥ 顶栏优先级 ----
console.log('【⑥ 多个顶栏时按优先级选】')
{
  const root = mkRoot([{ cls: 'top-bar' }, { cls: 'page-nav' }])
  installHomeButton(root)
  ok(root.querySelector('.page-nav').firstChild.attrs['data-shell-home'] !== undefined,
    '优先 .page-nav（顺序在前）')
  ok(root.querySelector('.top-bar').querySelector('[data-shell-home]') === null,
    '没有插进 .top-bar')
}

// ---- ⑦ 点击后回到门户 ----
console.log('【⑦ 点击 → 回门户】')
{
  const root = mkRoot([{ cls: 'page-nav' }])
  installHomeButton(root)
  const btn = root.querySelector('[data-shell-home]')
  hashSet = '#/symmetry'
  ok(typeof btn._ev.click === 'function', '绑了 click')
  btn._ev.click()
  ok(hashSet === '#/', '点击后 hash 变成 #/', hashSet)
}

// ---- ⑧ 健壮性 ----
console.log('【⑧ 健壮性】')
{
  ok(installHomeButton(null) === false, 'root 为 null 时返回 false 而不抛错')
  ok(installHomeButton(undefined) === false, 'root 为 undefined 时返回 false')
}

// ---- ⑨ 装配层确实注册了这个钩子（静态检查，防止"模块写好了但没接线"）----
console.log('【⑨ 装配层确实接了线】')
{
  /**
   * ★ 这里只能做静态检查，必须说清它的局限：
   *   它证明的是"main.js 里出现了 onAfterMount + installHomeButton"这两个名字，
   *   **不证明**它们在运行时真的被调用。运行时行为由上面 ①–⑧ 与实机验证覆盖。
   *   （本仓库的教训：自检与实现用同一批错名字会互相印证——所以这里不把它当成
   *     "接线正确"的证据，只当成"有人把这一行删了"的粗筛。）
   */
  const main = readFileSync(resolve(REPO, 'apps/web/src/main.js'), 'utf8')
  ok(/onAfterMount\(/.test(main), 'main.js 注册了 onAfterMount 钩子')
  ok(/installHomeButton/.test(main), 'main.js 引用了 installHomeButton')
  ok(/currentPath !== '\/'/.test(main), '首页被排除（首页不需要出口）')
}

// ---- ⑩ 每个页面的顶栏都能被锚点命中（防"下一个页面又忘了"）----
console.log('【⑩ 每个页面都有可命中的顶栏】')
{
  /**
   * ★ 这一节来自一次真实事故（2026-10-01）：orbit 的顶栏类名是 **`topbar`**（无连字符），
   *   而 ANCHORS 表里写的是 **`.top-bar`**（有连字符）—— 差一个字符，四个锚点全部落空，
   *   按钮退化成 `position:fixed` 悬浮，**压在 ⚛ logo 与页面标题上**。
   *
   *   ★ 它为什么长期没被发现：**按钮仍然在、仍然点得动**。失效的是"按钮该在哪儿"，
   *     而那个失效没有任何反馈。所以修法不能只是"补一个 `.topbar`"——那样下一个页面
   *     还会踩。现在要求每个页面**显式声明** `data-page-topbar`，本节的职责就是：
   *     ① 逐页确认源码里有这个声明；② 运行时确认带该标记的页面不会退化成悬浮；
   *     ③ 确认"退化成悬浮"这件事本身**发得出声音**（否则它永远是个哑巴失效）。
   */
  const PAGES = [
    ['apps/web/src/pages/orbit-markup.js', 'orbit'],
    ['apps/web/src/pages/symmetry-markup.js', 'symmetry'],
    ['apps/web/src/pages/index.js', 'crystal 库页'],
    ['apps/web/src/pages/viewer.js', 'crystal 查看器'],
    ['apps/web/src/pages/compare.js', 'crystal 对比页'],
  ]
  for (const [file, name] of PAGES) {
    let src = ''
    try { src = readFileSync(resolve(REPO, file), 'utf-8') } catch (e) { /* 下面会报） */ }
    ok(/data-page-topbar/.test(src), `${name}：顶栏显式声明了 data-page-topbar`,
      src ? `${file} 里找不到该属性（新页面请照做）` : `${file} 读不到`)
  }

  // 运行时：带该标记的根，按钮必须**装进去**而不是悬浮
  {
    const root = mkRoot([{ attrs: { 'data-page-topbar': '' } }])
    installHomeButton(root)
    ok(!root.querySelector('.shell-home--float'),
      '带 data-page-topbar 的页面，按钮装进顶栏（不退化为悬浮）', '退化了 —— 锚点没生效')
    // 用父子关系直接判（桩的选择器只支持单一形式，不支持后代组合；
    // 生产代码也只用单一选择器，没必要为测试扩桩）
    const bar = root.querySelector('[data-page-topbar]')
    const btn = root.querySelector('[data-shell-home]')
    ok(!!bar && !!btn && bar.children.indexOf(btn) >= 0,
      '按钮确实是顶栏的**子元素**（而不是碰巧没加 float 类）',
      `bar=${!!bar} btn=${!!btn}`)
  }

  // 兜底分支必须**发得出声音**
  {
    location.hash = '#/test-float-warn'   // 换一个 hash，避免被去重挡掉
    const root = mkRoot([])
    const realWarn = console.warn
    let warned = 0
    try { console.warn = () => { warned++ }; installHomeButton(root) } finally { console.warn = realWarn }
    ok(warned >= 1, '没有可命中顶栏时会 warn（实机 --console 能把它变成红，而不是哑巴失效）',
      `warn 了 ${warned} 次`)
  }
}

console.log('')
console.log('═══════════════════════════════════════════════════════════════')
if (fail === 0) {
  console.log(`test-shell 结果：通过 ${pass} 项，失败 0 项`)
  console.log('═══════════════════════════════════════════════════════════════')
  process.exit(0)
} else {
  console.log(`test-shell 结果：通过 ${pass} 项，失败 ${fail} 项`)
  for (const b of bad.slice(0, 20)) console.log('  ✗ ' + b)
  console.log('═══════════════════════════════════════════════════════════════')
  process.exit(1)
}
