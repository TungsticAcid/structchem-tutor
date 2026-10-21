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
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
// ★ 词汇表是**纯 JS**（不碰 DOM），可以从 Node 直接 import —— 正因如此，
//   "模型看到的动作"与"页面实现的动作"才有可能在测试里逐条比对。
import { VOCAB as orbitVOCAB } from '../../../modules/orbit/actions.js'

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

console.log('【⑪ orbit：词汇表与页面实现逐条对齐（"声明了却调不动"）】')
{
  /**
   * ★ 这一节守的是一条**本仓库反复踩**的缝：词汇表（模型看到的）与
   *   ACTIONS 表（真正执行的）之间没有任何别的检查。
   *
   *   踩过的三次，形态各不相同，但都是"同源断言只保证名字对得上、不保证调得动"：
   *     · 上游 `generateQuestion` 在 descriptor 里声明了，实现里没有；
   *     · descriptor 与**死副本**互相印证（都引同一份陈旧来源），一直绿着却什么也没守住；
   *     · 对称模块的 `listExamples` 引用了一个从未定义的常量，每次调用都抛——
   *       而没有任何测试**调用过**它。
   *
   *   词汇表这边更危险：模型是照着它下发动作的，缺一个实现意味着
   *   "模型每次用到那个能力都失败"，而失败信息还是"动作执行异常"。
   *   所以这里**双向**比对：词汇表 ⊆ 实现、实现 ⊆ 词汇表。
   */
  const orbitSrc = readFileSync(resolve(REPO, 'apps/web/src/pages/orbit.js'), 'utf8')
  const i0 = orbitSrc.indexOf('const ACTIONS = {')
  if (i0 < 0) {
    ok(false, '在 orbit.js 里找到 ACTIONS 表')
  } else {
    // 花括号配对求 ACTIONS 表本身的范围（不是"到下一个 } 为止"——
    // 表里每个动作的方法体都是花括号）
    let d = 0
    let k = orbitSrc.indexOf('{', i0)
    const start = k
    for (;;) {
      if (orbitSrc[k] === '{') d++
      else if (orbitSrc[k] === '}') { d--; if (d === 0) break }
      k++
    }
    const body = orbitSrc.slice(start + 1, k)
    const impl = new Set()
    for (const line of body.split('\n')) {
      let m = /^ {4}([A-Za-z_$][\w$]*)\s*\(/.exec(line)
      if (m) { impl.add(m[1]); continue }
      m = /^ {4}([A-Za-z_$][\w$]*)\s*:\s*function/.exec(line)
      if (m) impl.add(m[1])
    }
    const vocab = Object.keys(orbitVOCAB)
    const missing = vocab.filter((a) => !impl.has(a))
    const orphan = [...impl].filter((a) => vocab.indexOf(a) < 0).sort()
    ok(missing.length === 0, `词汇表里 ${vocab.length} 个动作，页面 ACTIONS 里**都有实现**`,
      missing.join(','))
    ok(orphan.length === 0, '页面 ACTIONS 里没有词汇表之外的动作（模型看不到的孤儿）',
      orphan.join(','))
    ok(impl.size === vocab.length,
      `两处条数相同（各 ${vocab.length} 个）`, `实现 ${impl.size} / 词汇表 ${vocab.length}`)

    // ★ 动作在 ACTIONS 表里 ≠ 用户点得到。这次真栽过一次：改动的补丁没落盘，
    //   ACTIONS 表齐全，而「＋ 加入当前轨道」按钮**根本没绑事件** ——
    //   点下去毫无反应，控制台干净，测试全绿。
    //   这两条钩子是用户进入/操控多轨道的**唯一入口**，所以显式点名。
    ok(/els\.multiAddBtn\.addEventListener/.test(orbitSrc),
      '「＋ 加入当前轨道」按钮真的绑了事件（不是只在 markup 里摆着）')
    ok(/els\.multiList\.addEventListener/.test(orbitSrc),
      '同屏轨道清单绑了事件（改色 / 显隐 / 删除）')
  }
}

console.log('【⑬ 已隐藏的功能：界面与状态两侧都不能漏（"藏一半"）】')
{
  /**
   * ★ 2026-10-10 用户要求「隐藏切换 slater 功能」。隐藏这件事有**三个**必须同时成立的部分，
   *   漏掉任何一个都会得到一种"看起来做了、其实半藏"的状态：
   *     ① markup 里确实裹了 hidden（否则面板还挂着，用户照旧能点）；
   *     ② 模型侧从词汇表撤下（`DISABLED_ACTIONS`，由 modules/orbit 的守卫 ⑦ 守）；
   *     ③ **状态兜底**：老会话 / 老快照里残留 `slater` 时页面强制回氢型 ——
   *        否则学生会一直看到 STO 形状，而界面上再也找不到开关（这类"卡住了"最难自查）。
   *
   *   这一节只守①与③（②在模块守卫里，判据同一份 `ORBITAL_MODEL_HIDDEN`）。
   */
  const markup = readFileSync(resolve(REPO, 'apps/web/src/pages/orbit-markup.js'), 'utf8')
  const orbitSrc2 = readFileSync(resolve(REPO, 'apps/web/src/pages/orbit.js'), 'utf8')
  ok(/id="orbModelFeature"\s+hidden/.test(markup),
    '轨道模型那一档在 markup 里被 hidden 包裹（不是只删掉按钮）')
  // ★ 判据必须来自**模块导出的那一份**，不能在页面里另写一个布尔量（"同一个事实两处写"）
  ok(/ORBITAL_MODEL_HIDDEN/.test(orbitSrc2) && /from '@modules\/orbit\/actions\.js'/.test(orbitSrc2),
    '页面用的是模块导出的 ORBITAL_MODEL_HIDDEN（而不是自己再写一个开关）')
  ok(/state\.orbitalModel = ORBITAL_MODEL_HIDDEN[\s\S]{0,120}'hydrogenic'/.test(orbitSrc2),
    '读控件那一步（唯一同步点）在隐藏时强制回氢型')
  ok(/silentSeg\('#orbModelSeg', 'data-model', ORBITAL_MODEL_HIDDEN \? 'hydrogenic'/.test(orbitSrc2),
    '回退（restoreState）也落到氢型 —— 否则 DOM 与 state 会当场不一致')
}

console.log('【⑫ 每个前端源文件都能被真正的解析器读通】')
{
  /**
   * ★ 这一片源码此前**从未被解析过**：test-shell 把 main.js 当文本读（正则找名字），
   *   orbit.js 只在实机里跑。于是出现过一次"全绿却整页白屏"：
   *   orbit-markup.js 那个大模板字符串的 HTML 注释里写了一个反引号，
   *   模板字符串当场被截断，后面的字成了 JS → SyntaxError，整页打不开。
   *   1389 项断言全过，一条都没红。
   *
   * ★ 用 `node --check` 而不是自己写正则找反引号：它就是 Node 真正的解析器
   *   （apps/web/package.json 有 "type":"module"，所以 .js 按 ESM 解析）。
   *   语法错、括号不配、字符串未闭合、模板字符串被截断 —— 一次全抓。
   *   （本仓库的教训：桩与自检若用自己的近似，就会在"实际能跑"的地方报红、
   *     在"实际跑不了"的地方报绿。）
   */
  const walk = (dir, out) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist') continue
      const f = resolve(dir, name)
      if (statSync(f).isDirectory()) walk(f, out)
      else if (name.endsWith('.js')) out.push(f)
    }
    return out
  }
  const files = walk(resolve(REPO, 'apps/web/src'), [])
  const broken = []
  for (const f of files) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' })
    } catch (e) {
      // ★ 要报的是**那一句 SyntaxError**，不是栈。
      //   第一版取的是 stderr 的最后两行，结果报出来的是 "at checkSyntax (...)"
      //   和 "Node.js v24.19.0" —— 一句有用的话都没有，等于把排查线索扔了。
      const lines = String(e.stderr || e.stdout || '').split('\n').map((l) => l.trim())
      const msg = lines.find((l) => /^\w*Error: /.test(l)) || lines.find((l) => l) || '(无输出)'
      const shown = f.replace(/\\/g, '/').replace(REPO.replace(/\\/g, '/') + '/', '')
      broken.push(`${shown}：${msg.slice(0, 120)}`)
    }
  }
  // ★ 断言“扫到了哪几个关键文件”而不是“扫到多少个”——
  //   后者是个拍脑袋的数字（我第一版写 > 20，而实际只有 16 个，当场就红了），
  //   而前者守的是“这个遍历真的走到了那些会白屏的文件”。
  //   两个 *-markup.js 尤其要盯住：它们整份就是一个大模板字符串，
  //   注释里混进一个反引号就当场截断（实测就是这么白屏的）。
  const critical = ['src/main.js', 'src/pages/orbit.js', 'src/pages/orbit-markup.js',
    'src/pages/symmetry.js', 'src/pages/symmetry-markup.js', 'src/pages/viewer.js',
    'src/shell/router.js']
  const rel = files.map((f) => f.replace(/\\/g, '/').replace(REPO.replace(/\\/g, '/') + '/apps/web/', ''))
  const lost = critical.filter((c) => rel.indexOf(c) < 0)
  ok(files.length >= critical.length, `扫到 ${files.length} 个前端源文件`, String(files.length))
  ok(lost.length === 0, '这些会白屏的关键文件都在扫描范围内', lost.join(','))
  ok(broken.length === 0, `全部 ${files.length} 个文件都能被解析（语法错会直接白屏）`,
    broken.slice(0, 3).join(' ｜ '))

  // ★★ 2026-10-12（用户报："在晶典在线里点练习，应显示晶典在线对应的选项"）：
  //   `currentBoardId()` 原先只做**首页路由精确匹配**，于是晶典在线的**查看页/对比页**
  //   （#/viewer/<id>、#/compare/<id>）被判成"不在任何板块" ⇒ 点「练习」弹出"先选板块"清单 ✗。
  //   守卫：子页前缀表里必须有这两条，且判定函数确实用了前缀匹配（不是又改回精确匹配）。
  const mainSrc = readFileSync(resolve(REPO, 'apps/web/src/main.js'), 'utf8')
  ok(/MODULE_SUB_ROUTES\s*=\s*\{[\s\S]{0,200}?'\/viewer\/'[\s\S]{0,80}?'\/compare\/'/.test(mainSrc),
    '板块子页前缀表登记了晶典在线的查看页/对比页')
  ok(/function currentBoardId\(\)[\s\S]{0,600}?startsWith\(/.test(mainSrc),
    'currentBoardId 同时做首页精确匹配与子页前缀匹配')

  // ★★ 2026-10-12（用户报："没配置 api key 时，点击练习会出现图中 bug"）：
  //   两个必须同时成立的点：① 练习入口先看有没有 Key（练习闭环每步都要模型，
  //   没 Key 只会留下一堆点了没反应的卡片）；② 入口先清掉上一轮的练习卡
  //   （它们受"重画时保留"保护，换板块再点会与新的清单叠成一团）。
  //   ★ 判据要**剥掉注释**再比：第一版没剥，而我刚在注释里写了那段**反面写法**做说明，
  //     棘轮当场扫到注释里的它并报红 —— 与 tokens.css 那条 prefers-color-scheme
  //     棘轮踩的是同一个坑（"解释文字本身会误报"）。
  const noComments = mainSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const startIdx = noComments.indexOf('function startPractice()')
  const practiceStart = startIdx >= 0 ? noComments.slice(startIdx, startIdx + 1600) : ''
  ok(/settings\.hasKey\(\)/.test(practiceStart), '练习入口检查了 API Key（settings.hasKey()）')
  ok(/panel\.clearPracticeCards\(\)/.test(practiceStart), '练习入口先清掉上一轮的练习卡')
  ok(/typeof hasKey\b/.test(noComments) === false,
    '没有写成 typeof 裸名 hasKey（那样会静默为假，守卫等于没写）')

  // ★★ 2026-10-12（用户："为何控制面板还在下边而不是在左边"）：
  //   查看页的控制面板在**桌面**下必须是左列且让位（窄屏才退回底部抽屉）。
  //   守卫：① 有 panel-left 的媒体查询与 --layer-panel-w 变量；
  //        ② 画布**同时**锚定 left 与 right —— 只写 left 会退化成"收缩包裹"，
  //           宽度取内层 canvas 的固有宽度（实测从窄屏切回宽屏时画布宽变成 411px ✗）；
  //        ③ 媒体查询监听在卸载时要摘掉（页面可反复挂载）。
  const viewerSrc = readFileSync(resolve(REPO, 'apps/web/src/pages/viewer.js'), 'utf8')
  const viewerNoComments = viewerSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  ok(/panel-left/.test(viewerNoComments) && /--layer-panel-w/.test(viewerNoComments),
    '查看页有"桌面左列 + 让位"的样式与变量')
  ok(/panel-left \.viewer-canvas \{ left:var\(--layer-panel-w[^}]*right:0/.test(viewerNoComments.replace(/\s+/g, ' ')),
    '左列模式下画布同时锚定 left 与 right（避免收缩包裹）')
  // ★★ 2026-10-12（用户："控制面板应该位于顶栏下方，方便使得返回按钮在左上角"）：
  //   顶栏必须横跨整宽（不许再被 --layer-panel-w 左移），面板从顶栏下沿开始。
  ok(/panel-left \.bottom-panel \{ top:var\(--top-bar-h/.test(viewerNoComments.replace(/\s+/g, ' ')),
    '左列模式下控制面板从顶栏下沿开始（--top-bar-h）')
  ok(!/panel-left \.top-bar \{ left:var\(--layer-panel-w/.test(viewerNoComments.replace(/\s+/g, ' ')),
    '顶栏不再被左列挤走（返回键留在屏幕左上角）')
  ok(/--top-bar-h/.test(viewerNoComments) && /getBoundingClientRect\(\)\.height/.test(viewerNoComments),
    '顶栏高度是量出来的（写死会在安全区/换行时错位）')
  // ★★ 2026-10-12（用户："晶胞参数变量要斜体"）：a/b/c 与 α/β/γ 是量符号 ⇒ 斜体，
  //   数字/单位/等号/度号正体（与基函数、对称元素、Z/E 同一条排版口径）。
  ok(/italicCellSymbols\(lenPart/.test(viewerNoComments) && /function italicCellSymbols\(/.test(viewerNoComments),
    '晶胞参数的量符号斜体（a/b/c、α/β/γ）')

  // ★★ 2026-10-12（用户："显示原子标签后，点击分元素控制，会使得设置中原子标签关闭，
  //   但仍显示原子标签。为何分元素控制会影响原子标签？"）：
  //   分元素控制**没碰过**原子标签 —— 它只是让组件重画一次，而 `render()` 读的是**组件 props**
  //   ⇒ 凡"改了状态却只更新画布、不回写控件"的处理器，重画后开关就退回挂载时的旧值 ✗
  //     （开关的 DOM 靠浏览器自己保持勾选 ⇒ 表面上当时还是开着的，一重画就露馅）。
  //   守卫：这几个会改变"控件自身显示值"的处理器必须回写控件。
  for (const fn of ['_onAtomLabelsToggle', '_onAuxAboveToggle', '_onPartialAtomsChange', '_onCellDisplayModeChange']) {
    const body = (viewerNoComments.match(new RegExp(fn + '\\(\\{[^)]*\\)\\s*\\{[\\s\\S]*?\\n  \\}')) || [''])[0]
    ok(body.length > 0 && /_updateLayerControl\(\)/.test(body), `状态写入要回写控件：${fn}`)
  }

  // ★★ 2026-10-12（用户："字母斜体问题"，指外观设置面板里的 4C₃ / 3C₂ / 3S₄ / 6σ）：
  //   对称元素符号的主字母/σ 斜体（与特征标表同一条口径）；
  //   **元素颜色**那组的 C / H 保持正体（元素符号按 IUPAC 惯例不斜体）——两条规则不同，别"顺手统一"。
  const symPage = readFileSync(resolve(REPO, 'apps/web/src/pages/symmetry.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  ok(/import \{[^}]*formatSymmetrySymbol[^}]*\}/.test(symPage) && /lab\.innerHTML = formatSymmetrySymbol\(label\)/.test(symPage),
    '外观设置里的对称元素颜色标签走量符号斜体（4C₃ / 6σ）')

  // ★★ 2026-10-12（用户："×1 需要上下对齐吗"）：需要 —— 计数列必须上下齐平。
  //   实测：带下标的行（σd）会把行高撑开 1.3px，计数/箭头是垂直居中 ⇒ 跟着往下跳 ✗。
  //   守卫：行内文本要有稳定行高，且 sub 不参与行高计算（line-height:0）。
  const symMarkup = readFileSync(resolve(REPO, 'apps/web/src/pages/symmetry-markup.js'), 'utf8')
  ok(/\.elem-group-header > span, #info-panel \.elem-label \{ line-height:/.test(symMarkup)
    && /\.elem-item sub \{ line-height: 0; \}/.test(symMarkup),
    '对称元素行的下标不撑行高（计数列 ×n 上下对齐）')
  ok((viewerNoComments.match(/_panelMqListener/g) || []).length >= 3,
    '媒体查询监听有注册也有摘除（反复挂载不累积）')
  // ★ 左列模式下收起/展开的箭头必须指**左右**（用户要求）：底栏那套 ▼/▲ 会指错方向。
  //   用宿主 CSS 的伪元素覆盖，不动共享组件 layer-control.js。
  ok(/panel-left \.layer-control \.toggle-arrow::after \{[^}]*content:'◀'/.test(viewerNoComments.replace(/\s+/g, ' '))
    && /panel-left \.layer-control\.collapsed \.toggle-arrow::after \{ content:'▶'/.test(viewerNoComments.replace(/\s+/g, ' ')),
    '左列模式下箭头是 ◀/▶（收起 ▶、展开 ◀）')

  // ★★ 2026-10-12（用户："对比模式的设置仍是黑色" + "支持手动更换左/右晶体、可点击跳转"）：
  //   ① 对比页的面板/控制条颜色必须走**主题令牌**（裸的 rgba(255,255,255,…)/深底色不许再有）；
  //   ② 设置里必须有两侧晶体选择器；③ 两侧标签必须绑了跳转。
  const cmpSrc = readFileSync(resolve(REPO, 'apps/web/src/pages/compare.js'), 'utf8')
  const cmpCode = cmpSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '')
  const bareLight = cmpCode.split('\n').filter((l) => {
    const t = l.trim()
    if (!/^(color|background|border(-[a-z]+)?)\s*:/.test(t)) return false
    if (!/rgba\(255,\s*255,\s*255|rgba\(20,\s*20,\s*40|rgba\(18,\s*18,\s*35/.test(t)) return false
    return !/var\(--[a-z0-9-]+,\s*rgba\(/.test(t)
  })
  ok(bareLight.length === 0, '对比页面板/控制条的颜色都包在主题令牌里（浅色主题不再是黑块）', bareLight.slice(0, 2).join(' ｜ ').slice(0, 90))
  ok(/data-crystal-side/.test(cmpCode) && /_setSideCrystal\(/.test(cmpCode), '设置里有"更换左/右晶体"的选择器与处理')
  ok(/data-side/.test(cmpCode) && /router\.navigate\('\/viewer\/'/.test(cmpCode), '两侧标签可点击跳转到对应晶体的查看页')

  // ───────────────────────────────────────────────────────────────────────────
  // ★★ 2026-10-14（用户："用户不需要知道来源、知识条目"）：
  //   模型曾把内部出处写进给学生的正文（截图那句"（来源：queryPointGroup 实测结果 +
  //   知识条目 symmetry:P2-3）"）✗。判据落在**提示词文本**上：中英两段都要有这条禁令 ——
  //   少一段就是"切到英文界面后又开始报工具名"。
  // ───────────────────────────────────────────────────────────────────────────
  {
    const shellSrc2 = readFileSync(resolve(REPO, 'apps/web/src/i18n/shell.js'), 'utf8')
    ok(shellSrc2.includes('给学生的正文里**不要**出现内部出处'), '中文角色提示要有"内部出处不进学生正文"这条')
    ok(shellSrc2.includes('Never put internal provenance into student-facing text'), '英文角色提示要有同一条')
    // ★★ 2026-10-14（用户质疑："把元素全部隐去就只剩 1 个对称元素"？）：
    //   那句话是模型现场说的（源码 0 命中 ⇒ 不是预置脚本、不在知识库），且**自相矛盾** ——
    //   本应用里"元素"指对称元素，隐去它们就什么都不剩。术语纪律必须钉在提示词里（中英各一份）。
    // ★★ 2026-10-15：中文文案的引号已统一成 「」（用户："中文段落的引号要用中文引号"），
    //   此处钉的是**提示词原文**，故跟着改。★ 英文那条仍写弯引号 “元素”，故不动 ——
    //   引号替换只作用于"引号内含汉字"的串（英文串里的引号不属于中文引用）。
    ok(shellSrc2.includes('「元素」一律指对称元素'), '中文角色提示要钉住"元素=对称元素"这条术语')
    ok(shellSrc2.includes('“元素” always means a symmetry element'), '英文角色提示要有同一条术语纪律')
    // ★★ 2026-10-14（用户两条）：① 元素很多的点群别一键全显（甲烷 Td 16 个会糊）；
    //   ② 同一条演示里"先切分子、再引用新分子的元素 key"会被整批校验拒掉 ⇒ 提示要分两批。
    ok(shellSrc2.includes('不要「一键全部显示」'), '中文要点明"元素多的点群别一键全显"')
    ok(shellSrc2.includes('never switch them all on at once'), '英文要有同一条')
    ok(shellSrc2.includes('分两批下发'), '中文要点明"先切分子再引用其元素 key 要分两批"')
    ok(shellSrc2.includes('send two batches'), '英文要有同一条')
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ★★ 2026-10-14（用户："点击新会话后，部分内容未消失"，截图里留着练习知识点选择器与题目卡）：
  //   那些卡片只存在于 DOM 里，靠"重画前摘下来、重画后接回去"活着（为了让判定卡不被抹掉）。
  //   ⇒ **新会话 / 切换会话**必须先显式清掉它们，否则空态分支照样把它们接回来 ✗。
  // ───────────────────────────────────────────────────────────────────────────
  {
    const mainSrc = readFileSync(resolve(REPO, 'apps/web/src/main.js'), 'utf8')
    const newConv = mainSrc.slice(mainSrc.indexOf("label: '新对话'"), mainSrc.indexOf("label: '新对话'") + 1400)
    ok(/panel\.clearPracticeCards\(\)[\s\S]{0,80}panel\.renderPath\(\)/.test(newConv),
      '「新对话」必须先 clearPracticeCards() 再 renderPath()（否则练习卡片残留）')
    ok(mainSrc.includes('if (panel && typeof panel.clearPracticeCards === \'function\') panel.clearPracticeCards()'),
      '「切换/删除会话」也要清掉上一段对话的 DOM 卡片')
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ★★ 2026-10-14（用户："之前数据清理了，为什么也显示已掌握"）：
  //   三份学情的键**不一样**：晶体那份由宿主注入 `chem-agent.mastery`，而点群/轨道那份是
  //   `chem-agent.symmetry.mastery` / `chem-agent.orbit.mastery`（注入值）。

  //   ⇒ 原先 `clearKeys` 只列了晶体的键、`onClearAll` 只清对话 ⇒ 清完数据再打开练习，
  //     P1 依然标着"已掌握" ✗。判据：`onClearAll` 必须**让三份学情各自 reset()**
  //     （键归模块所有，宿主不枚举键名 —— 枚举法漏一个就静默失效）。
  // ───────────────────────────────────────────────────────────────────────────
  {
    const mainSrc = readFileSync(resolve(REPO, 'apps/web/src/main.js'), 'utf8')
    const clear = mainSrc.slice(mainSrc.indexOf('onClearAll:'), mainSrc.indexOf('onClearAll:') + 600)
    ok(/for \(const m of \[mastery, orbitMastery, symMastery\]\)/.test(clear),
      '「清除本机数据」要 reset 三份学情（晶体/轨道/点群），不能只清静态键')
    ok(/typeof m\.reset === 'function'/.test(clear), 'reset 要判存在（老版本/独立部署时不出错）')
    ok(/id === 'symmetry' \? symMastery/.test(mainSrc),
      '学情路由要带上点群（否则在点群板块练了，模型的感知快照里没有学情）')
  }
  // ★★ 2026-10-12（用户："对比模式点击原子，没触发原子信息弹窗，反而使得鼠标一动晶体就跟着旋转"）：
  //   ① 对比页不许再用宿主里并不存在的 window.wx（它一抛异常就把画布的拖拽状态卡死）；
  //   ② 点原子必须弹**原子信息卡**（与查看页同一个组件）。
  ok(!/window\.wx/.test(cmpCode), '对比页不再调用宿主里不存在的 window.wx（会抛异常卡死拖拽）')
  ok(/AtomInfoPopup/.test(cmpCode) && /_onAtomTap\(/.test(cmpCode), '点原子会弹出原子信息卡（复用查看页那枚组件）')
  // ★★ 2026-10-12（用户："右边图文不对应"）：逐侧数据不许写成"算一次、两边共用"。
  //   实测：右画布渲 CsCl 而可见性是 {Cu:true}（左晶体的元素表）⇒ Cs 被当成隐藏、画面全绿 ✗。
  ok(/rightAtomVisibility = visOf\(dataB/.test(cmpCode), '元素显隐逐侧派生（右侧用右侧晶体的元素列）')
  ok(/rightEquivalentSettings = \(dataB \|\| data\)/.test(cmpCode), '原点变换选项逐侧派生')
  ok(/if \(!this\._crystalIdB\) \{\s*\n\s*s\.rightAtomVisibility/.test(cmpCode),
    '对齐样式时**只在两侧同晶体**的情况下对齐元素显隐（不同晶体不能套用）')

  // ★★ 2026-10-12（用户："没空隙显示功能的结构，设置中就不要显示空隙显示了；
  //   有氢键的结构，设置中也应可控制氢键的显隐"）：设置里的图层项必须按**逐侧能力**给，
  //   能力判据只此一处（modules/crystal/capabilities.js），查看页也不许再留白名单。
  ok(/caps\.interstices \? \[\[.Octahedral/.test(cmpCode) && /caps\.hydrogenBonds \? \[\[.HydrogenBonds/.test(cmpCode),
    '对比页设置按逐侧能力给图层项（空隙 / 氢键）')
  ok(/s\.leftCaps = crystalCaps\(/.test(cmpCode) && /s\.rightCaps = crystalCaps\(/.test(cmpCode),
    '对比页逐侧派生能力（左右各一块晶体）')

  // ★★ 2026-10-12（用户："切换晶体时……明显不一致，大小方向都不一致"）：
  //   换晶体后每一侧都会按自己的包围球重新取景，而**同一晶体模式**下换晶体让左右**同时重载**
  //   ⇒ "从另一侧取视角"必然取到中间值（实测 19.408 vs 16.382 ✗）。
  //   口径改为：**切换前记下视角，两侧落定后一起套回去**（即"换晶体时比例/方向不变"）。
  ok(/this\._viewBeforeSwitch = /.test(cmpCode) && /const vs = this\._viewBeforeSwitch/.test(cmpCode),
    '换晶体前记下当前视角（比例+方向）')
  ok(/clearTimeout\(this\._viewSyncTimer\)/.test(cmpCode) && /}, 80\)/.test(cmpCode),
    '两侧都会 fire loaded ⇒ 去抖后再套（取最后一次）')
  ok(/for \(const c of \[this\._leftCanvas, this\._rightCanvas\]\)/.test(cmpCode),
    '套给**两侧**（同一晶体模式下两侧本就该同款）')
  ok(/from '@modules\/crystal\/capabilities\.js'/.test(viewerNoComments) && !/TEACHING_STACKING_IDS/.test(viewerNoComments),
    '查看页改用共享能力模块（不再留写死的白名单）')

  // ★★ 2026-10-11（用户："浅色，晶体对比模式下，保存图片是空白的"）：
  //   壳抓图前派发 `chem-agent:before-capture` 请页面**为下一帧排一次渲染** ——
  //   对比页原先没接 ✗，而两块画布都是 `preserveDrawingBuffer:false` + 按需重绘
  //   ⇒ 抓图落在"这帧什么都没画"的时刻，存下来就是全透明空图
  //   （实测：摘掉钩子 1 色/0% 不透明；挂上钩子 1487 色/9.2% 不透明）。
  ok(/chem-agent:before-capture/.test(cmpCode) && /chem-agent:after-capture/.test(cmpCode),
    '对比页接上抓图钩子（否则保存的图片是空白）')
  ok((cmpCode.match(/invalidate\(\)/g) || []).length >= 2 && /removeEventListener\('chem-agent:before-capture'/.test(cmpCode),
    '抓图时排帧、卸载时解绑（两块画布都要）')

  // ───────────────────────────────────────────────────────────────────────────
  // 「打开保存位置」（用户："可以加一个按钮'打开图片保存位置'吗"）
  //
  // ★ 网页弹不出系统资源管理器（也拿不到目录绝对路径），所以形态是**应用内**：
  //   列出该目录里的图片、给缩略图与下载。纯逻辑抽在 shell/saved-images.js（无别名依赖）
  //   ⇒ 能在 Node 里用**假目录对象**单测（真的 FileSystemDirectoryHandle 造不出来）。
  // ───────────────────────────────────────────────────────────────────────────
  const saveSrc = readFileSync(resolve(REPO, 'apps/web/src/shell/save-image.js'), 'utf8')
  ok(/data-role="open-dir"/.test(saveSrc) && /打开保存位置/.test(saveSrc), '保存菜单里有「打开保存位置」按钮')
  ok(/listSavedImages\(/.test(saveSrc) && /shell-save-gallery/.test(saveSrc), '按钮打开的是应用内图片列表（缩略图 + 下载）')
  {
    const { listSavedImages, formatSize } = await import('../src/shell/saved-images.js')
    const mk = (name, size, ts, kind = 'file') => ({ kind, name, getFile: async () => ({ name, size, lastModified: ts }) })
    const dir = {
      async *values() {
        yield mk('b.png', 2000, 200); yield mk('a.png', 500, 100); yield mk('c.png', 3000, 300)
        yield mk('notes.txt', 10, 400); yield mk('sub', 0, 500, 'directory'); yield mk('x.jpg', 150, 50)
      },
    }
    const list = await listSavedImages(dir)
    ok(list.length === 4 && list[0].name === 'c.png' && list.every((x) => /\.(png|jpe?g)$/i.test(x.name)),
      '列出图片：过滤非图片/子目录、按时间倒序')
    ok((await listSavedImages({})).length === 0, '目录不可读时返回空数组（不抛）')
    ok((await listSavedImages(dir, { limit: 2 })).length === 2, 'limit 生效（目录可能很大）')
    ok(formatSize(2048) === '2 KB' && /MB$/.test(formatSize(3 * 1024 * 1024)), '大小显示可读')
  }

  // ★★ 2026-10-12（用户三条："返回二字超出格子" / "右侧设置无法独立修改" / "右侧设置与右侧样式不对应"）：
  //   ① 返回键不能写死 30px 宽（内容「← 返回」比它宽 ⇒ 溢出）；
  //   ② 自动对齐样式**只在首次进入双晶体模式时**做一次，且**跳出加载流程**（否则
  //      用户改右侧 ⇒ 重建 ⇒ 又 fire loaded ⇒ 立刻回弹；且重入 _loadCrystal 会被吞掉）；
  //   ③ 设置点击后要同步刷新标签（否则"图文不对应"复发）。
  ok(/\.cp-back \{[^}]*min-width:30px/.test(cmpCode.replace(/\s+/g, ' ')) && !/\.cp-back \{[^}]*[^-]width:30px/.test(cmpCode.replace(/\s+/g, ' ')),
    '返回键按内容自适应宽度（不再写死 30px 溢出一半字）')
  ok(/_styleAlignedFor/.test(cmpCode) && /setTimeout\(\(\) => \{[\s\S]{0,300}?this\._onAlignStyle\(true\)/.test(cmpCode),
    '自动对齐样式只做一次、且跳出加载流程（否则右侧改不动 / 状态与画面不一致）')
  ok(/_updateCanvases\(\)[\s\S]{0,220}?_refreshLabels\(\)/.test(cmpCode),
    '设置改动后同步刷新两侧标签（图文一致）')
  // ★★ 2026-10-12（用户："进入新对话后，仍然残留演示信息"）：宿主头部的「新对话」
  //   也必须收掉演示（面板 resetDemo），否则演示条与新对话一起留着。
  const mainSrc2 = readFileSync(resolve(REPO, 'apps/web/src/main.js'), 'utf8')
  ok(/convStore\.newSession\(\)[\s\S]{0,240}?panel\.resetDemo\(\)/.test(mainSrc2),
    '头部「新对话」会收掉演示条（不留上一段对话的演示信息）')
  // ★★ 2026-10-12（用户："切换到 NaCl 后，设置和模型的显示模型还是不一致" +
  //   随后"点击对齐样式后，设置与显示的显示模型不一致"）：对齐是**改状态**的动作，
  //   落定后必须重画设置面板，否则面板停在对齐前的高亮 ✗。
  //   ★ 重画必须放在 `_onAlignStyle` **内部**：这条路径有"点按钮"与"自动对齐"两个入口，
  //     只补其中一个就会出现"一处生效、一处不生效"（第一版就是这么漏的）。
  const alignFn = (cmpCode.match(/_onAlignStyle\(silent\) \{[\s\S]*?\n  \}/) || [''])[0]
  ok(/this\._rebuildSettingsPanel\(\)/.test(alignFn),
    '对齐样式后重画设置面板（设置 ↔ 画面 一致）')
  // ★ 标签刷新只该有**一处**实现（_refreshLabels）；数出现次数而不是"必须没有" ——
  //   第一版写成"不得出现"，而 _refreshLabels 本身正当含有这一行，守卫自己报红 ✗
  ok((cmpCode.match(/querySelector\('#leftPane \.cp-label'\)/g) || []).length === 1,
    '标签刷新收敛到 _refreshLabels()（各处不再复写一份）')
}

// ---------------------------------------------------------------------------
// ★★ 2026-10-17（首页全面重写为"结构探针 / 全息仪表"）
//
//   旧版是一条"编号列表"，小屏溢出的两个真因（列定义特异性、fit-content）
//   随旧布局一起消失；但**"窄屏不能横向溢出"这条意图必须继续守着** ——
//   新布局换了网格 / 画布 / 绝对定位的 HUD，能撑破视口的写法反而更多了：
//     · 网格项若没有 min-width: 0，画布与长文本的固有宽度会把整页顶宽；
//     · 悬浮 HUD 是绝对定位，写到视口外就是横向滚动条；
//     · 主视觉按 min(74vw, 300px) 限宽，而不是写死像素。
//   静态守卫只钉"让窄屏收窄的那些声明"；真机像素由 tmp/qa-home.mjs（独立 QA）
//   与实机截图复核（390/360 两种宽度：横向溢出 0、无元素越界）。
// ---------------------------------------------------------------------------
{
  const home = readFileSync(resolve(REPO, 'apps/web/src/shell/pages/home.js'), 'utf8')
  const flat = home.replace(/\s+/g, ' ')
  ok(/@media \(max-width: 720px\) \{/.test(flat), '首页存在小屏媒体块（max-width: 720px）')
  /**
   * ★ 720px 的媒体块现在**不止一个**（化学记号条也为窄屏单独写了一条）。
   *   所以不能取"第一个匹配"，要取**含 .pt-hero-visual 的那一块** ——
   *   否则取到的是记号条的块，主视觉限宽那条断言会假红（实测踩过）。
   */
  const blocks = home.match(/@media \(max-width: 720px\) \{[\s\S]*?\n\}/g) || []
  const block = blocks.find((b) => b.indexOf('.pt-hero-visual') >= 0) || ''
  const fb = block.replace(/\s+/g, ' ')
  ok(!!block, '小屏媒体块能被取出（不是空块）')
  ok(/\.pt-hero-visual \{ max-width: min\(74vw, 300px\)/.test(fb),
    '★ 小屏主视觉按视口宽度限宽 min(74vw, 300px)（不写死像素宽度）')
  ok(/\.pt-hero-copy \{ min-width: 0/.test(flat) && /\.pt-card-body \{ display: flex; flex-direction: column; gap: 4px; min-width: 0/.test(flat),
    '★ grid 子项显式 min-width: 0（否则画布/长文本的固有宽度会顶破视口）')
  ok(/\.pt-card \{[^}]*overflow: hidden/.test(flat), '卡片裁切内部溢出的装饰光斑（不产生横向溢出）')
  ok(/\.pt-canvas \{ display: block; width: 100%; height: 100%/.test(flat),
    '五块画布统一 width/height: 100%（跟随父容器，不写死尺寸）')
  // ★ 2026-10-20 用户复查：主视觉四角 HUD 已整体删除（图 2）。
  ok(!/class="pt-hud/.test(home), '主视觉 HUD 已按用户要求删除')
  // ★ 2026-10-20 用户复查（图 3/4）：顶部品牌块（logo + 站名 + 英文）与状态/版本号删除。
  ok(!/<header class="pt-top"/.test(home) && !/class="pt-brand/.test(home)
    && !/class="pt-status"/.test(home) && !/class="pt-ver"/.test(home),
    '顶部品牌 / 场景感知状态 / 版本号已按用户要求删除')
  // ★ 2026-10-21：用户「删掉这仨箭头」—— 三张卡页脚只保留描述文字。
  ok(!/pt-card-enter/.test(home),
    '★ 三张卡片右下角的「→」箭头已删除（markup 与 CSS 都不再引用）')
}

// ---------------------------------------------------------------------------
// ★★ 2026-10-21 首屏入场（用户两条）：
//   ① 旧「开始探索」用 pt-flash 闪两次卡片 —— 用户实测"闪两次再消失"，必须删掉；
//   ② 新设计：首屏只留大标题 + 两个按钮，点击后 FLIP 收拢、模块浮现；
//      「问智能体」直接开侧栏，不经过探索转场。
// ---------------------------------------------------------------------------
{
  const home = readFileSync(resolve(REPO, 'apps/web/src/shell/pages/home.js'), 'utf8')
  const flat = home.replace(/\s+/g, ' ')
  ok(/let homeExplored = false/.test(home)
    && /\$\{homeExplored \? ' is-explored' : ' is-intro'\}/.test(home),
    '首屏/探索态由页面内存状态 homeExplored 控制（换语言重挂不重播）')
  ok(!/\.pt-card\.is-flash/.test(home) && !/@keyframes pt-flash/.test(home),
    '★ 删除旧「开始探索」的闪卡反馈（用户报的"闪两次再消失"bug）')
  ok(/_playExploreTransition\(root\)/.test(home)
    && /const first = parts\.map\(\(el\) => el\.getBoundingClientRect\(\)\)/.test(home)
    && /el\.style\.transform = 'translate\(/.test(home)
    && /transition = 'transform \.95s/.test(home),
    '★ 首屏 → 探索态用 FLIP：标题/按钮从放大居中的 rect 过渡到最终 rect')
  // ★ 用户 2026-10-21：点开始探索后「教学智能体」的渐变色动画被重置。
  //   真因是 FLIP 对所有 mover 都写了 inline animation:none，而第二行标题的渐变动画
  //   正是 background-position animation；只能对按钮（pt-rise 用 transform）禁用。
  ok(/if \(el\.classList\.contains\('pt-btn'\)\) el\.style\.animation = 'none'/.test(home)
    && !/^\s*el\.style\.animation = 'none'$/m.test(home),
    '★ FLIP 只禁用按钮入场动画，不重置标题行的渐变动画')
  ok(/\.portal\.is-intro \.pt-deco, \.portal\.is-intro \.pt-modules \{ position: absolute/.test(flat)
    && /\.portal\.is-intro \.pt-desc, \.portal\.is-intro \.pt-visual-col \{ display: none; \}/.test(flat)
    && /\.portal\.is-intro \.pt-foot-bottom \{ visibility: hidden/.test(flat),
    '★ 首屏隐藏模块/装饰/全息图/描述；版权行隐藏但保留占位')
  ok(/\.portal\.is-intro \.pt-foot \{[^}]*left: 50%[^}]*bottom: 18px[^}]*transform: translateX\(-50%\)/.test(flat),
    '★ 首屏 footer 与第二幕同宽居中、同底边（版权行占位保证 console 垂直位置一致）')
  ok(/\.portal\.is-intro \.pt-title \{[^}]*font-size: clamp\(64px, 9\.4vw, 148px\)/.test(flat)
    && /\.portal\.is-intro \.pt-btn \{[^}]*font-size: clamp\(22px, 2\.1vw, 32px\)/.test(flat),
    '★ 首屏标题与两个按钮放大，占据页面')
  // ★ 用户 2026-10-21：英文首幕标题此前继承终版的 32–50px，显得很小；
  //   首幕单独按视口给一档（最长行 20 字符，8.4vw≈120px 仍放得下）。
  ok(/\.portal\.is-intro\.lang-en \.pt-title \{[^}]*font-size: clamp\(30px, 8\.4vw, 120px\)/.test(flat),
    '★ 英文首幕标题与中文同量级（不再继承终版小字号）')
  // ★ 用户截图：标题因居中/左对齐差异而在转场时位置突变。改为**按行 FLIP**：
  //   每行是 fit-content 盒子（文字不会在盒内跳位），首屏 margin auto 居中、终版靠左。
  ok(/\.pt-title-line \{[^}]*width: fit-content/.test(flat)
    && /\.portal\.is-intro \.pt-title-line \{[^}]*margin-left: auto/.test(flat)
    && /\.pt-title-line, \.pt-actions \.pt-btn/.test(home),
    '★ 标题按行 FLIP（fit-content 行盒 + 首屏 margin auto），不明改首尾对齐方式')
  // ★ 用户截图：首屏按钮太矮，FLIP 开始时被纵向放大再缩回 → 一开始就加高，且用 X/Y 非等比反变换。
  ok(/\.portal\.is-intro \.pt-btn \{[^}]*height: auto/.test(flat)
    && /\.portal\.is-intro \.pt-btn \{[^}]*padding: 26px clamp/.test(flat)
    && /a\.height \/ b\.height/.test(home),
    '★ 首屏按钮一开始就加高；FLIP 用宽高两个比例精确对齐，避免按钮高度突变')
  ok(/body\.home-intro \.agent-fab/.test(flat),
    '首屏连右下角智能体悬浮球也收起（"只有标题+两个按钮"）')
  ok(/@keyframes pt-home-reveal/.test(home)
    && /\.portal\.is-explored \.pt-modules \{ animation: pt-home-reveal/.test(flat),
    '探索态：模块/底栏/视觉区淡入上浮，不再闪卡')
  ok(/is-morphing/.test(home) && /classList\.remove\('is-morphing'\)/.test(home),
    '转场期间用 is-morphing 防重复点击（避免二次点击打断 FLIP）')
  // ★ 2026-10-21：「界面设定」改名「界面风格」，中英文都换；首屏也能看到同一组控件。
  {
    const shellI18n = readFileSync(resolve(REPO, 'apps/web/src/i18n/shell.js'), 'utf8')
    ok(/'shell\.home\.consoleLabel': '界面风格'/.test(shellI18n)
      && /'shell\.home\.consoleLabel': 'Interface style'/.test(shellI18n),
      '「界面设定」已改名「界面风格」（中文 + 英文同步）')
  }
}

// ---------------------------------------------------------------------------
// ★★ 2026-10-17：首页动画/画布的**生命周期守卫**（源码棘轮）
//
//   "新场景 + 旧记账"在本仓已经栽过（orbit 跨挂载的 auxGroup 缓存）；首页每次
//   进出都会重建五块 canvas 与 rAF 循环，漏掉一处就是泄漏 —— 而泄漏不会报错，
//   只会在来回切换若干次后越来越卡。这里钉住几个**必须成对出现**的调用。
// ---------------------------------------------------------------------------
{
  const home = readFileSync(resolve(REPO, 'apps/web/src/shell/pages/home.js'), 'utf8')
  ok(/cancelAnimationFrame\(this\._raf\)/.test(home), '画布 rAF 在卸载时被 cancelAnimationFrame 取消')
  ok(/ResizeObserver/.test(home) && /\.disconnect\(\)/.test(home), 'ResizeObserver / IntersectionObserver 被 disconnect')
  ok(/this\._cleanup\.forEach\(/.test(home) && /this\._cleanup = \[\]/.test(home),
    '事件监听登记在 _cleanup 里并统一撤销')
  ok(/prefers-reduced-motion: reduce/.test(home)
    && /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(home),
    '尊重 prefers-reduced-motion（CSS + JS 两处都停动画）')
  ok(/attributeFilter: \['data-theme'\]/.test(home),
    '主题切换通过 MutationObserver 重读 --pt-* 令牌（画布与页面同一套颜色）')
  ok(/getPropertyValue/.test(home), '画布颜色从 CSS 变量读取（不在 JS 里抄第二套调色板）')
  ok(/data-canvas="bg"/.test(home) && /data-canvas="holo"/.test(home), '背景与主视觉两块画布都在标记里')
}

// ---------------------------------------------------------------------------
// ★★ 2026-10-17 用户第二轮复查（5 条）。这里钉住四条**结构性**事实：
//
//   ① 晶典卡换成教材式**斜投影**（用户贴了教材 NaCl 晶胞图，说"化学家喜欢这种视图"）：
//      判据是"用了 projectOblique、不再出现透视相机参数 focal/dist、深度排序、有图例"。
//   ② `.portal` 必须是 `overflow: clip`（而不是 hidden）—— hidden 会让它成为**滚动容器**，
//      scrollIntoView 把"开始探索"的滚动落在 .portal 上，页面滚不回来（用户第 3 条）。
//   ③ 说明条「结构全息投影 / 实时演算」已按用户要求删除（第 4 条）。
//   ④ 科学排版：轨道/点群标签必须是"斜体变量 + 下标"，不能是 `2p_z` 这种下划线写法（第 5 条）；
//      主视觉 HUD 的节锥角度必须与画面里真画出来的锥线框对应（第 2 条）。
// ---------------------------------------------------------------------------
{
  const home = readFileSync(resolve(REPO, 'apps/web/src/shell/pages/home.js'), 'utf8')
  const flat = home.replace(/\s+/g, ' ')
  const crystalDraw = (home.match(/_drawCrystal\(ctx, e, t, pal\) \{[\s\S]*?\n  \}/) || [''])[0]

  ok(!!crystalDraw, '能取出 _drawCrystal（守卫没被重构甩掉）')
  ok(/projectOblique\(/.test(crystalDraw), '★ 晶典卡：教材式斜投影（projectOblique）')
  ok(!/focal:/.test(crystalDraw), '★ 晶典卡：不再有透视相机参数（focal/dist）')
  ok(/items\.sort\(/.test(crystalDraw), '★ 晶典卡：键与球按深度排序（画家算法，Canvas 没有 z-buffer）')
  ok(/Cl⁻/.test(crystalDraw) === false && /Na⁺/.test(crystalDraw) === false,
    '★ 晶典卡：离子图例（Cl⁻ / Na⁺）已按用户要求删除')
  // ★ 2026-10-21 用户：「晶典在线卡片一直有个光圈，看起来很丑」。
  //   真因是"呼吸柔光 + 被圆形 clip 的扫描光带"——两者都删掉，晶格直接落在卡片底色上。
  ok(!/drawGlow\(ctx, cx, cy, m \* 0\.46/.test(crystalDraw)
    && !/sweepT/.test(crystalDraw)
    && !/ctx\.arc\(cx, cy, m \* 0\.52/.test(crystalDraw),
    '★ 晶典卡：已删除晶格背后的圆形光斑（呼吸光 + 圆形扫描带）')

  // ★★ 2026-10-17 第三次复查：「颜色和风格按照晶典在线程序中的，只是视角按照我发的图」
  //   —— 判据不只是"看起来像"，而是**真的消费模块真源**（否则以后模块改了配色又会漂）。
  ok(/from '@crystal\/lib\/crystal-loader\.js'/.test(home)
    && /from '@crystal\/data\/settings\.js'/.test(home),
    '★ 晶典卡：颜色/尺寸读晶典在线模块的数据与设置（不另配一套配色）')
  ok(/getCrystalData\('naCl'\)/.test(home) && /getElementColor\('Cl'\)/.test(home),
    '★ 晶典卡：晶体数据用 getCrystalData、元素色用 getElementColor（尊重用户逐元素覆盖）')
  ok(/BALL_STICK_FACTOR = 0\.3/.test(crystalDraw)
    && /STICK_RADIUS_A = 0\.08/.test(crystalDraw),
    '★ 晶典卡：球棍比例来自模块常量（BALL_STICK_FACTOR 0.3 / stickRadius 0.08）')
  ok(/const midX = \(ps\.x \+ pe\.x\) \/ 2/.test(crystalDraw)
    && /rgba\(colorOf\(bKind\)/.test(crystalDraw),
    '★ 晶典卡：键是两段双色（靠 Cl 端绿、靠 Na 端蓝 —— 与晶典在线一致）')
  /**
   * ★ 2026-10-17 用户第六次复查："晶典在线的卡片不像其他两个卡片会动，缺乏一点高级感"；
   *   第一版只做了 ±2.6° 的呼吸（像素位移 ≤2px），用户随后反馈"还是不动" —— 振幅必须可感知。
   *   现在的判据：**先 3D 旋转（yaw ±18° + pitch ±3.4°）再用 projectOblique 做仿射投影**，
   *   因此"(1) 有旋转 (2) 仍走 projectOblique (3) 无透视 focal"三件事必须同时成立 ——
   *   任何一条被改掉（比如换成透视相机去"让它更动"）都会红。
   */
  ok(/const yaw = Math\.sin\(t \* 0\.38\) \* 0\.32/.test(crystalDraw)
    && /const spin = \(p\)/.test(crystalDraw)
    && /const rot = lat\.nodes\.map\(\(n\) => spin/.test(crystalDraw),
    '★ 晶典卡有动效：绕竖直轴 ±18° 缓慢摆动 + 轻微点头（旋转后仍走 projectOblique ⇒ 平行线保持平行）')

  ok(/overflow: hidden;\s*overflow: clip;/.test(flat),
    '★ .portal 用 overflow: clip（hidden 会变成滚动容器 ⇒ "开始探索"后页面滚不回来）')
  ok(!/\.pt-holo-caption/.test(home), '说明条「结构全息投影 / 实时演算」已删除（用户要求）')

  /**
   * ★ 2026-10-17 用户第五次复查："这里的 p、d 不用斜体吧" —— 对。
   *   轨道字母 s/p/d/f 是**轨道标签**（正体），斜体只留给变量（ψ、θ、Y、x/y/z 轴、Bragg 的 d）。
   *   守卫改成双向：既要有正体写法，也要确保不再包 <i>（防止排版规则又被"顺手改回去"）。
   */
  ok(/2p<sub><i>z<\/i><\/sub>/.test(home) && !/2<i>p<\/i>/.test(home)
    && /\.pt-card-demo sub i[^}]*font-family: var\(--font-symbol, "Times New Roman"/.test(flat),
    '★ 轨道卡标签：p 正体、z 作下标且用 Times 斜体（用户要求）')
  ok(/const cloud = this\._scenes\.orbitCloud/.test(home),
    '★ 轨道卡：回到 2p_z 电子云点集（用户 2026-10-20 要求回退）')
  // ★ 2026-10-20 用户复查（图 1）：TEACHING AI AGENT 与口号删除。
  ok(!/<span class="pt-title-en"/.test(home) && !/<p class="pt-slogan"/.test(home),
    'TEACHING AI AGENT / 揭秘书…口号已按截图删除')
  ok(/<i>T<\/i><sub>d<\/sub> · 24/.test(home),
    '★ 点群卡标签：Schoenflies T 斜体、d 作下标（T 是符号中的字符，惯例斜体）')
  ok(!/<i>ψ<\/i><sub>3,2,0<\/sub>/.test(home),
    '主视觉 HUD（ψ₃,₂,₀ · 3d_z² 等读数）已按用户要求整体删除')
  ok(/2<i>d<\/i> sin<i>θ<\/i>/.test(home),
    'Bragg 式里的 d 是面间距（物理量）→ 保持斜体；与轨道字母区分开')
  ok(/NODAL CONES/.test(home) && /54\.74/.test(home) && /125\.26/.test(home),
    '★ 主视觉 HUD 的"节锥"角度与画面里真画出来的锥线框对应（图文对应）')
  ok(/\.pt-hud-v i, \.pt-card-demo i \{/.test(flat)
    && /\.pt-hud-v sub, \.pt-hud-v sup, \.pt-card-demo sub, \.pt-card-demo sup \{/.test(flat),
    '公式片段有专门排版规则（斜体衬线变量 + 独立的上下标字号）')
}

// ---------------------------------------------------------------------------
// ★★ 2026-10-17 用户第四次复查：「可以多一点结构化学或化学有关的经典元素，
//   这部分作为点缀，要高级感、美观、视觉效果好」。
//
//   这里钉住的是"点缀的分寸"，不是好看不好看（那只能靠截图看）：
//     ① 纯装饰：aria-hidden + pointer-events:none，不能挡点击、不进屏幕阅读器；
//     ② 数据有出处：元素小块读模块的 elements.js，记号条里是真实空间群/点群/Miller 指数；
//     ③ 不压正文：<1360px 时整层隐藏（那时左右页边距放不下 40px 的块）。
// ---------------------------------------------------------------------------
{
  const home = readFileSync(resolve(REPO, 'apps/web/src/shell/pages/home.js'), 'utf8')
  const flat = home.replace(/\s+/g, ' ')
  ok(/class="pt-deco" aria-hidden="true"/.test(home), '化学点缀层存在且 aria-hidden')
  ok(/\.pt-deco \{[^}]*pointer-events: none/.test(flat), '点缀层 pointer-events:none（不挡点击）')
  ok(/from '@crystal\/data\/elements\.js'/.test(home) && /_renderElementTiles\(/.test(home),
    '元素小块读模块的 elements.js（不另抄一份周期表）')
  // ★ 2026-10-18 用户复查：原子序数/原子量是数字、量值 → 正体（不斜体）；
  //   原子量统一按 4 位有效数字显示（数据源每条记录精度不一，不能直接 toString）。
  ok(/<span class="pt-el-z">/.test(home) && /<span class="pt-el-mass">/.test(home)
    && !/<i class="pt-el-z"/.test(home) && !/<i class="pt-el-mass"/.test(home),
    '元素小块的原子序数/原子量用正体（数字不斜体）')
  ok(/_formatAtomicMass\(/.test(home) && /toPrecision\(4\)/.test(home),
    '原子量统一按 4 位有效数字显示（元素数据各记录精度不一，不能直接 toString）')
  // ★ 2026-10-18 用户复查：五个元素小块按**元素周期表的相对位置**摆，而不是两列堆叠。
  //   组距 p=56px、周期行距 24%（等距）：H(top 10%) / C·O(top 34%) / Na·Cl(top 58%)；
  //   C 在 O 左边 2p（相隔两个族 C→N→O），O 在 Cl 左边 1p 且高一个周期（O 第 2 周期、Cl 第 3 周期）。
  ok(/\.pt-el--H \{ left: 8px; top: 10%/.test(flat)
    && /\.pt-el--Na \{ left: 8px; top: 58%/.test(flat)
    && /\.pt-el--Cl \{ right: 8px; top: 58%/.test(flat)
    && /\.pt-el--O \{ right: 64px; top: 34%/.test(flat)
    && /\.pt-el--C \{ right: 176px; top: 34%/.test(flat),
    '★ 元素小块按周期表相对位置：H/Na 同族最左；Cl 与 Na 同周期最右；C/O 同周期且 C 隔两族在左；O 在 Cl 左上')
  ok(/pt-el--H/.test(home) && /pt-el--Cl/.test(home) && !/pt-el-stack/.test(home),
    '元素小块已从两列堆叠改为独立绝对定位（不再有 pt-el-stack）')
  ok(/@media \(max-width: 1399px\) \{\s*\.pt-el--C, \.pt-el--O \{ display: none/.test(flat),
    '窄屏（<1400px）隐藏中间行的 C/O，避免压到全息图；H/Na/Cl 仍贴边')
  ok(/@media \(max-width: 1359px\) \{\s*\.pt-deco \{ display: none/.test(flat),
    '窄屏隐藏点缀层（页边距不足时会压正文）')
  // ★ 2026-10-19 用户复查：底部控制条与卡片页脚的字号按截图要求"大一倍"（原值 ×2）。
  ok(/\.pt-card-tag \{[^}]*font-size: 22px/.test(flat)
    && /\.pt-console-title \{[^}]*font-size: 22px/.test(flat)
    && /\.pt-console-title \{[^}]*font-family: inherit/.test(flat)
    && /\.pt-set-label \{[^}]*font-size: 22px/.test(flat)
    && /\.pt-seg-btn \{[^}]*font-size: 23px/.test(flat),
    '★ 卡片页脚 / 底部控制条字体已放大；「界面风格」与「界面语言」同为 22px 同字体')
  // ★ 2026-10-21：三张卡片标题要有「有特色、非常好看」的流动特效（但仍有学术感）。
  ok(/\.pt-card-name \{[^}]*background-clip: text/.test(flat)
    && /\.pt-card-name \{[^}]*animation: pt-title-flow 7\.2s linear infinite/.test(flat)
    && /@keyframes pt-title-flow/.test(home)
    && /@keyframes pt-title-underline/.test(home)
    && /\.pt-card-name::after \{[^}]*height: 2px/.test(flat)
    && /\.pt-card-name::after \{[^}]*animation: pt-title-underline 4\.6s linear infinite/.test(flat)
    && /\.pt-card:hover \.pt-card-name::after/.test(flat),
    '卡片标题：三色流动渐变 + 字形辉光 + 2px 发光细线（hover 增强）')
  ok(/\.pt-card\[data-module="orbit"\] \{[^}]*--pt-title-2: var\(--pt-orb-red\)/.test(flat)
    && /\.pt-card\[data-module="symmetry"\] \{[^}]*--pt-title-2: var\(--pt-cyan\)/.test(flat)
    && /\.pt-card\[data-module="crystal"\] \{[^}]*--pt-title-2: var\(--pt-cyan\)/.test(flat),
    '三张卡的标题各有第二主色（orbit 经典红 / symmetry 紫 / crystal 青）')
  // ★ 用户要求：轨道视界用模块内的经典相位色（+ψ 红 / −ψ 青）——标题第二主色取相位红。
  ok(/--pt-orb-red: #ff5f5f/.test(flat) && /--pt-orb-red: #c0392b/.test(flat),
    '轨道卡标题第二主色使用轨道视界的经典相位红（深色亮红 / 浅色深红）')
  ok(/\.pt-card-formula \{[^}]*font-family: var\(--font-symbol, "Times New Roman"/.test(flat)
    && /\.pt-deco-tag--dim \{[^}]*font-family: var\(--font-symbol, "Times New Roman"/.test(flat)
    && !/\.pt-card-formula \{[^}]*var\(--pt-mono\)/.test(flat),
    '公式（三张卡片 + 布拉格式）全部改用 Times New Roman，不再混用等宽字')
  ok(/\.pt-seg \{[^}]*background: transparent/.test(flat)
    && /\.pt-seg \{[^}]*border: 1px solid var\(--pt-line\)/.test(flat)
    && /\.pt-seg-btn \+ \.pt-seg-btn \{ border-left: 1px solid var\(--pt-line\)/.test(flat)
    && /\.pt-seg-btn\.is-on \{ background: var\(--pt-soft\)/.test(flat),
    '未选中的分段按钮与页面同底色，保留淡边框/分割线，仅选中项有药丸底')
  // ★ 2026-10-20：用户要求删掉「界面风格」标签（按钮组保留，语言标签保留）。
  ok(!/shell\.home\.setTheme/.test(home) && /shell\.home\.setLang/.test(home),
    '「界面风格」标签已删除（主题按钮组与「界面语言」标签保留）')
  // ★ 2026-10-21 用户复查：三张卡片页脚文案是三个模块的正式描述（不再是"可观察/易剖析/得贯通"），
  //   右下角箭头已删除，标题保持 26px。
  ok(/\.pt-card-name \{[^}]*font-size: 26px/.test(flat)
    && !/pt-card-enter/.test(home),
    '★ 卡片标题 26px；页脚只保留描述文字，箭头已删除')
  ok(!/<span class="pt-card-sub"/.test(home),
    '卡片副标题已并入页脚（避免与页脚新文案重复）')
  {
    const shellI18n = readFileSync(resolve(REPO, 'apps/web/src/i18n/shell.js'), 'utf8')
    ok(!/微观世界可观察/.test(shellI18n)
      && !/结构规律易剖析/.test(shellI18n)
      && !/构效关系得贯通/.test(shellI18n)
      && /shell\.home\.orbit\.tag': '类氢原子轨道三维可视化'/.test(shellI18n)
      && /shell\.home\.symmetry\.tag': '分子对称性与分子点群'/.test(shellI18n)
      && /shell\.home\.crystal\.tag': '晶体结构与点阵型式'/.test(shellI18n),
      '★ 三张卡片页脚文案已按要求替换（旧的三句已删除）')
  }
  // ★ 2026-10-19 用户复查（6 张截图）：「把这些字符都删掉」—— 顶部 kicker（SCENE-AWARE…）、
  //   四个特性胶囊、化学记号条、模块副标题（一个中枢…）、授课顺序说明、三张卡片的描述句。
  //   这里钉住"排版里不再渲染它们"（CSS 里残留的死规则不算渲染）。
  ok(!/<p class="pt-kicker"/.test(home) && !/<ul class="pt-feats"/.test(home)
    && !/<div class="pt-chem-strip"/.test(home) && !/<span class="pt-mod-lead"/.test(home)
    && !/<p class="pt-mod-order"/.test(home) && !/<span class="pt-card-desc"/.test(home)
    && !/_renderFeats/.test(home),
    '★ 六处文字已删除：kicker / 特性胶囊 / 化学记号条 / 模块副标题 / 授课顺序 / 卡片描述')
  ok(/pt-deco-art--bohr/.test(home) && /<ellipse/.test(home) && /Bohr · 1913/.test(home),
    '点缀：玻尔模型线稿（轨道 + 电子）+ 年代标签')
  ok(/pt-deco-tag--tight/.test(home) && /\.pt-deco-tag--tight \{[^}]*white-space: nowrap/.test(flat),
    '短记号（σ·π·δ / Bohr·1913）强制单行 —— 用户实测发现会被折行')

  // ★ 2026-10-18：三条公式作为**卡片点缀**（不是主信息）
  ok(/const CARD_FORMULA = \{/.test(home)
    && /orbit: '<i>Ĥ<\/i><i>ψ<\/i> = <i>E<\/i><i>ψ<\/i>'/.test(home),
    '轨道卡点缀：定态薛定谔方程 Ĥψ = Eψ')
  ok(/CARD_FORMULA[\s\S]*?<i>Γ<\/i>[\s\S]*?√[\s\S]*?<i>δ<\/i>/.test(home),
    '点群卡点缀：大正交定理（Γ、√、δ 都在；按变量斜体排版）')
  ok(/crystal: '[^']*ψ[^']*e<sup>i<i>k<\/i>·<i>r<\/i><\/sup>/.test(home)
    && !/e<sup><i>ik<\/i>/.test(home),
    '晶典卡点缀：布洛赫定理 ψ_k(r) = e^{i k·r} u_k(r)；★ 虚数单位 i 正体、k/r 斜体')
  ok(/虚数单位 i /.test(home) && /虚数单位要用正体/.test(home),
    '排版规则里明确记下"虚数单位用正体"（用户 2026-10-18 复查）')
  ok(/pt-card-formula/.test(home)
    && /\.pt-card-formula \{[^}]*opacity: \.4[^}]*pointer-events: none/.test(flat)
    && /@media \(max-width: 1099px\) \{\s*\.pt-card-formula \{ display: none/.test(flat),
    '卡片公式是低透明度点缀（不拦点击；窄卡片隐藏，避免截出半行）')

  // ★ 2026-10-20 用户复查（点群观鉴）：特征标表列多、面板窄，必须有左右滚动条。
  {
    const symMarkup = readFileSync(resolve(REPO, 'apps/web/src/pages/symmetry-markup.js'), 'utf8')
    const symFlat = symMarkup.replace(/\s+/g, ' ')
    const symInfo = readFileSync(resolve(REPO, 'modules/symmetry/ui/info.js'), 'utf8')
    ok(/\.ct-body \{ overflow-x: scroll;/.test(symFlat)
      && /\.ct-table \{[^}]*width: max-content/.test(symFlat)
      && /\.ct-body::-webkit-scrollbar \{ height: 10px/.test(symFlat)
      && /\.ct-scrollbar-thumb \{/.test(symFlat)
      && /ct-scrollbar/.test(symInfo) && /pointermove/.test(symInfo),
      '★ 特征标表超出面板宽度时可横向滚动（表格 max-content + 始终可见的自定义滚动条，可拖动）')
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
