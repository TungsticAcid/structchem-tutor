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
    ok(shellSrc2.includes('"元素"一律指对称元素'), '中文角色提示要钉住"元素=对称元素"这条术语')
    ok(shellSrc2.includes('“元素” always means a symmetry element'), '英文角色提示要有同一条术语纪律')
    // ★★ 2026-10-14（用户两条）：① 元素很多的点群别一键全显（甲烷 Td 16 个会糊）；
    //   ② 同一条演示里"先切分子、再引用新分子的元素 key"会被整批校验拒掉 ⇒ 提示要分两批。
    ok(shellSrc2.includes('不要"一键全部显示"'), '中文要点明"元素多的点群别一键全显"')
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
