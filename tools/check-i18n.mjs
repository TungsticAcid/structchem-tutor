/**
 * check-i18n.mjs —— i18n 覆盖率守卫
 *
 * ---------------------------------------------------------------------------
 * 它解决什么问题
 * ---------------------------------------------------------------------------
 * "全面完成 i18n" 在这种规模下（全仓约三千条用户可见中文、散在六十多个文件里）
 * 靠人眼枚举是**不可能兑现**的承诺：漏掉几处的表现是"英文界面里夹着几行中文"，
 * 不报错、不崩、界面看着还挺正常 —— 正是本仓库反复记的那类缺陷。
 *
 * 所以这条守卫把"漏没漏"变成一个可执行的判据：**扫描 → 分类 → 报未覆盖 → 非零退出**。
 * 翻译工作由它驱动收敛，而不是靠自觉。
 *
 * ---------------------------------------------------------------------------
 * 分类规则（判据要写清楚，否则"全绿"没意义）
 * ---------------------------------------------------------------------------
 *   ① **开发者文案**：`console.*(…)` 与 `new Error(…)` 里的串。
 *      它们不进界面、也不进模型上下文，**不算未覆盖**。
 *      —— 这条是**规则豁免**，不是一份手工豁免清单；清单会腐坏，规则不会。
 *   ①′ **几何数据**：XYZ 文本块（首行原子数 + 若干 `元素 x y z` 行）。
 *      中文只出现在**注释行**里（`甲烷 CH4 (Td)`），而界面显示的名字取自示例库的
 *      `title`/`titleEn`（见 `apps/web/src/pages/symmetry.js` 的 `structureTitle`）——
 *      也就是说这行中文**不进界面**。同理 `ideal-geometry.js` 里生成坐标时传的标题行。
 *      判据是**结构**（能不能解析成坐标表），不是"哪个文件"——所以新增示例不必再来改守卫。
 *   ② **已覆盖**：该串出现在某本字典的 `text` 表里（扫描替换认得它），
 *      或者作为 `zh` 值登记过（键式取值认得它），或者它是 `t('…')` / `tsrc('…')`
 *      的**键/实参**（即：这个位置本来就走了 i18n 接口）。
 *   ③ **未覆盖**：其余全部。**只要有一条，退出码 1。**
 *
 * ---------------------------------------------------------------------------
 * 为什么注释里的中文要单独排除
 * ---------------------------------------------------------------------------
 * 本仓的中文注释远多于中文文案（orbit.js 一处就 749 行注释中文）。
 * 把注释算进分母，报出来的数字会被噪声淹没，真正要看的那几条反而看不见。
 *
 * 用法：
 *   node tools/check-i18n.mjs              # 报未覆盖，有则退出 1
 *   node tools/check-i18n.mjs --list 40    # 每区最多列 40 条未覆盖
 *   node tools/check-i18n.mjs --area orbit # 只看某个区域
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')

const LIST = (() => {
  const i = process.argv.indexOf('--list')
  return (i >= 0 && process.argv[i + 1]) ? +process.argv[i + 1] : 12
})()
const ONLY = (() => {
  const i = process.argv.indexOf('--area')
  return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : null
})()
/**
 * `--json <path>`：把每个区域的未覆盖项**逐条**写成 JSON（含真实全文，不是截断的预览）。
 * ★ 为什么需要它：翻译工作要按区域分派出去，接手的人得拿到**完整的原文**。
 *   终端里那份是 `slice(0,64)` 的预览，照它去翻译会翻出半截句子。
 */
const JSONOUT = (() => {
  const i = process.argv.indexOf('--json')
  return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : null
})()

const CJK = /[㐀-䶿一-鿿豈-﫿]/

// ---------------------------------------------------------------------------
// 几何数据判定
//
// XYZ 文本块（**结构判据**，不看文件名 —— 新增示例不必回来改守卫）：
//   首行是原子数，其后每行是 `元素 x y z`，中间可以夹一行注释（标题）。
//   中文只会出现在那行注释里，而它**不进界面**（界面用示例库的 title / titleEn，
//   见 `apps/web/src/pages/symmetry.js` 的 `structureTitle`）。
// ★ 为什么单列：对称模块的 i18n 已做完，守卫却报 263 条 —— 其中 24 条就是这种
//   整块 XYZ 文本。**一个对已完成区域误报的守卫只会被忽略**，所以改的是守卫，
//   不是去"翻译"一份坐标数据。
// ---------------------------------------------------------------------------
const XYZ_ATOM_LINE = /^[A-Za-z]{1,3}(?:\s+-?\d+(?:\.\d+)?){3}$/
function isGeometryPayload(s) {
  const lines = String(s).split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 4 || !/^\d+$/.test(lines[0])) return false
  const declared = +lines[0]
  if (!(declared >= 2 && declared <= 500)) return false
  let coord = 0
  for (const l of lines.slice(1)) if (XYZ_ATOM_LINE.test(l)) coord++
  return coord >= declared
}

// ---------------------------------------------------------------------------
// 可译片段提取（**这条决定了守卫报的到底是不是"用户看得见的字"**）
//
// ★ 为什么不能拿整个字符串字面量当单位：
//   壳与模块页面里有大量 HTML 模板串，例如
//     `<span class="pl-badge">即将接入</span>`
//   整串登记进字典**运行时一个字符都不会被替换**（sweep 看的是 DOM 文本节点
//   "即将接入"，不是带标签的整串）。拿它当单位，报出来的数就不是"漏译条数"，
//   而是"有多少个模板串" —— 那样的守卫只能靠把整段 HTML 抄进字典来变绿，
//   属于**自欺**。
//
// ★ 规则（都是"什么不是文案"，不是豁免清单）：
//   · `<style>…</style>` / `<script>…</script>` 里的内容：样式与脚本，不是文案
//     （壳的首页整页 CSS 就写在一个模板串里，其中还有中文注释）。
//   · `/* … */` 注释：同上。
//   · HTML 标签本身不算文案，但标签里的 `title/placeholder/aria-label/alt`
//     属性值是**用户看得见的**（工具提示），所以单独取出来。
//   · 标签之外的部分按"整段"看：它和 DOM 文本节点一一对应，正是 `text` 表的粒度。
//
// ★ 含 `${…}` 的片段照原样返回：它**扫描替换做不到**（"第 3 步"与"第 4 步"是
//   两条不同原文），必须改写走 `t('key', {n})`。守卫不为它开后门 ——
//   登记整段进字典只会让守卫变绿而运行时照旧是中文。
// ---------------------------------------------------------------------------
const ATTR_RE = /\b(?:title|placeholder|aria-label|alt)\s*=\s*"([^"]*)"/g
// ★ 只把"**像标签**的 `<…>`"当标签：`<\/?[a-zA-Z]…`。
//   原先写的是 `<[^>]*>`，于是正文里的数学比较（`⟨T⟩ > 0`、`E < 0`、`n < 5`）
//   也会被当成标签 —— 整段被切碎、末行成了半句话，守卫于是报出**运行时不可达**的
//   假键（实测在轨道知识库 `K9-6` 上发生过，那边为此多登记了 2 条）。
const TAG_RE = /<\/?[a-zA-Z][^>]*>/g

/**
 * 把一个**含 `${…}` 的片段**拆成两类，判据与运行时对齐：
 *
 *   · `staticCjk`：插值**之外**的中文。运行时的文本节点里这段是"拼"出来的
 *     （`共 ${n} 种` → `共 3 种`），扫描替换永远对不上 ⇒ **只能改写成 `t('key', {n})`**。
 *     所以这些片段一律报未覆盖（登记进字典是自欺：运行时确实换不掉）。
 *   · `innerLits`：插值**内部**的字符串字面量，例如
 *     `${cond ? '八面体空隙' : '四面体空隙'}` —— 它在运行时**就是**那个文本节点的值，
 *     扫描替换认得它 ⇒ 只要登记过就算覆盖。
 *
 * ★ 这条区分是被实测逼出来的：`atom-info-popup.js` 里正是
 *   `${atom.voidType === 'octahedral' ? '八面体空隙' : '四面体空隙'}`，
 *   按"整片含 `${` 就报"会冤枉它，按"整片登记"又会骗自己。
 */
function classifyInterpolated(seg) {
  const staticCjk = []
  const innerLits = []
  let i = 0
  const n = seg.length
  let plain = ''
  while (i < n) {
    if (seg[i] === '$' && seg[i + 1] === '{') {
      if (plain.trim()) staticCjk.push(plain.trim())
      plain = ''
      let j = i + 2
      let d = 1
      while (j < n && d > 0) {
        if (seg[j] === '{') d++
        else if (seg[j] === '}') { d--; if (d === 0) break }
        j++
      }
      const body = seg.slice(i + 2, j)
      const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g
      let m
      while ((m = re.exec(body))) {
        const lit = m[1] !== undefined ? m[1] : m[2]
        const decoded = lit.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c))
        if (decoded.trim()) innerLits.push(decoded.trim())
      }
      i = j + 1
      continue
    }
    plain += seg[i]
    i++
  }
  if (plain.trim()) staticCjk.push(plain.trim())
  return { staticCjk, innerLits }
}

function translatableSegments(lit) {
  let s = String(lit)
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  // ★ HTML 注释不是文案（`<!-- 晶体信息 -->` 之类）。不剥掉的话，改完 `TAG_RE`
  //   之后注释里的中文会被当成待译原文 —— 那是**运行时不可达**的假键。
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const out = []
  // ★ **按行切**：运行时查表是逐行的（知识库的 `localizeText` 先 `split('\n')`；
  //   运行时的 `sweep` 对多行文本节点也有逐行回退）。守卫不按行切就会出现两种错：
  //   ① 一段正文里出现 `< 0`（数学比较）时，`TAG_RE` 把它当标签，整段被**切成两片**，
  //      其中一片的末行成了半句话（实测：`orbit:K9-6` 的 `★ 因为 E`）；
  //   ② 要求把**含 \n 的整段**登记进字典 —— 而运行时先拆行，那些整段键**永远命不中**，
  //      属于"守卫逼出来的假键"（实测：轨道知识库为此多登记了 35 条）。
  // ★ 两步走，顺序不能反：
  //   ① **先按标签切**（在整串上做，**不能先按行切**）—— 标签会跨行
  //      （`<button` 换行后跟 `title="…">文案</button>`）。先按行切的话，第二行的
  //      `title="…">文案` 既不是标签也不是属性，会被整段当成"待译原文"
  //      （实测：14 个 `title="…"` 与 1 条 option 文案因此报错，而它们本来都有译文）。
  //   ② **再按行切**标签之间的文本 —— 运行时查表是逐行的（知识库 `localizeText`
  //      先 split，`sweep` 对多行文本节点也有逐行回退）。
  {
    let last = 0
    let m
    TAG_RE.lastIndex = 0
    while ((m = TAG_RE.exec(s))) {
      for (const line of s.slice(last, m.index).split('\n')) {
        const t = line.trim()
        if (t) out.push(t)
      }
      ATTR_RE.lastIndex = 0
      let a
      while ((a = ATTR_RE.exec(m[0]))) { const v = a[1].trim(); if (v) out.push(v) }
      last = TAG_RE.lastIndex
    }
    for (const line of s.slice(last).split('\n')) {
      const t = line.trim()
      if (t) out.push(t)
    }
  }
  return out.filter((x) => CJK.test(x))
}

// ---------------------------------------------------------------------------
// 扫描范围
//
// ★ 每个区域给一个"这片的文案归谁管"的说明 —— 出现未覆盖时，要能一眼看出该去哪个
//   字典文件里加条目，而不是对着一个文件路径发愣。
// ---------------------------------------------------------------------------
const AREAS = [
  { id: 'shell', label: '统一壳', dict: 'apps/web/src/i18n/shell.js',
    roots: ['apps/web/src/main.js', 'apps/web/src/shell'],
    skip: [/\/i18n\//] },
  { id: 'panel', label: '智能体面板', dict: 'packages/agent-core/ui/i18n.js',
    roots: ['packages/agent-core/ui'],
    skip: [/\/i18n\.js$/] },
  { id: 'ui-kit', label: '共享构件与设置弹层', dict: 'packages/ui-kit/i18n.js',
    roots: ['packages/ui-kit'],
    skip: [/\/i18n\.js$/, /\/tools\//] },
  // ★ 扫描根要覆盖**全部**中枢源码。曾经漏掉 `route.js` / `proactive.js` /
  //   `view-registry.js`（它们里的中文**没有任何区管**），而漏掉的表现是
  //   "守卫全绿、那三个文件照旧中文" —— 一个漏了扫描根的守卫是最沉默的那种错。
  //   另：原表里写的 `tool-registry.js` **并不存在**（真实路径是 core/tool-registry.js），
  //   不存在的根会被 walkFiles 静默跳过，所以那种笔误一直没被发现。
  { id: 'agent', label: '智能体中枢（提示词/工具/节点）', dict: 'packages/agent-core/i18n.js',
    roots: ['packages/agent-core/core', 'packages/agent-core/nodes',
      'packages/agent-core/registry', 'packages/agent-core/store',
      'packages/agent-core/app.js', 'packages/agent-core/route.js',
      'packages/agent-core/proactive.js', 'packages/agent-core/view-registry.js'],
    skip: [/\/i18n\.js$/] },
  { id: 'skills', label: '通用教学法', dict: 'packages/skills/i18n.js',
    roots: ['packages/skills'], skip: [/\/i18n\.js$/] },
  { id: 'knowledge', label: '知识条目', dict: 'packages/knowledge/i18n.js',
    roots: ['packages/knowledge'], skip: [/\/i18n\.js$/, /\/tools\//, /\.md$/] },
  // ★ `modules/orbit/core/` **不能跳过**：那里虽然以纯计算为主，但 `formula.js` /
  //   `math.js` 的 `shapeDescribe` 会生成**画在画布上的中文**
  //   （`径向节点 1 个、角度节面 1 个；`、`=0 型：沿 z 轴的"橄榄"形。`）。
  //   原先的 skip 里有 `/core/`，于是这些**永远不报** —— 实机（英文模式）才看见它们。
  //   "计算层里没有文案"是个想当然的假设，而守卫的扫描根一旦漏了，就再也听不到反对意见。
  { id: 'orbit', label: '轨道模块', dict: 'modules/orbit/i18n.js',
    roots: ['modules/orbit'],
    skip: [/\/i18n\.js$/, /\/tools\//] },
  { id: 'crystal', label: '晶体模块', dict: 'modules/crystal/i18n.js',
    roots: ['modules/crystal'],
    skip: [/\/i18n/, /\/tools\//, /\/data\/cod\//] },
  // ★ 上游复用代码**单独一本字典**：它与 modules/crystal 是两块各一千条上下的活，
  //   共用一本字典会让两边必须轮流写同一个文件（并行时就是冲突）。
  //   分开之后写范围不相交，谁也挡不住谁。
  { id: 'crystal-h5', label: '晶体上游复用代码', dict: 'modules/crystal/i18n-h5.js',
    roots: ['projects/crystal/H5/src'], skip: [] },
  { id: 'symmetry', label: '对称模块', dict: 'modules/symmetry/i18n/index.js',
    roots: ['modules/symmetry'], skip: [/\/i18n\//, /\/tools\//] },
  { id: 'pages', label: '模块页面（宿主侧）', dict: 'apps/web/src/i18n/pages.js',
    roots: ['apps/web/src/pages'], skip: [] },
].filter((a) => !ONLY || a.id === ONLY)

// ---------------------------------------------------------------------------
// 字符串字面量扫描
//
// ★ 为什么必须自己写词法扫描，而不是几行正则：
//   `grep -P "['\"][^'\"]*[一-鿿]"` 会把**行尾注释**当成字符串
//   （闭合引号之后跟 `// 中文` 照样匹配）。实测 raw 与去注释后的数字能差 40%，
//   拿 raw 当分母做覆盖率，报出来的都是噪声。
//   一次性写个状态机，注释/字符串/模板串一次分清楚。
// ---------------------------------------------------------------------------

/**
 * @param {string} src
 * @returns {Array<{text:string, line:number, dev:boolean}>}
 */
function scanLiterals(src) {
  const out = []
  let i = 0
  let line = 1
  const n = src.length
  // 括号深度 → 该层是不是"开发者文案"上下文
  const ctx = []
  let depth = 0

  const isDevCtx = (idx) => {
    // 往回看 80 个字符，判断这个 `(` 属于 console.* 还是 new Error(
    const w = src.slice(Math.max(0, idx - 80), idx)
    return /console\s*\.\s*[\w$]+\s*$/.test(w) || /\bnew\s+Error\s*$/.test(w)
  }

  /**
   * 上一个有意义的字符（跳过空白与注释）——**用来判断 `/` 是除号还是正则字面量**。
   *
   * ★ 为什么必须判：本文件是手写词法扫描，而正则字面量里**可以出现引号**
   *   （`/['"]/`、`/'/`）。不认正则的话，扫描器会把 `/` 当成除号、把正则里的 `'`
   *   当成字符串开头，于是**从这里开始的整段代码都被当成一个字符串吞掉** ——
   *   报出来的"未覆盖文案"是源码片段，而真正的中文被吞进那个假字符串里漏掉。
   *   实测在 `packages/agent-core/ui/renderer.js` 上就发生了（那条"文案"里带着
   *   `// 引用块` 这样的代码）。
   */
  let lastSig = ''
  /** 上一个标识符（判断 `return /re/`、`case /re/` 这类） */
  let lastWord = ''

  /** 正则字面量扫描：处理转义与字符类 `[…]`，返回结束位置（已越过 flags） */
  const skipRegex = (start) => {
    let j = start + 1
    let inClass = false
    while (j < n) {
      const ch = src[j]
      if (ch === '\\') { j += 2; continue }
      if (ch === '\n') return start + 1   // 正则不跨行：说明判断错了，退回
      if (ch === '[') inClass = true
      else if (ch === ']') inClass = false
      else if (ch === '/' && !inClass) { j++; break }
      j++
    }
    while (j < n && /[a-z]/i.test(src[j])) j++   // flags
    return j
  }

  /** 这个位置上的 `/` 是不是正则开头 */
  const regexAllowed = () => {
    if (!lastSig) return true
    if ('(,=:[!&|?{};+-*%^~<>'.includes(lastSig)) return true
    if (lastSig === '\n') return true
    if (/^(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/.test(lastWord)) return true
    return false
  }

  const bump = (ch) => {
    if (!/\s/.test(ch)) {
      lastSig = ch
      if (/[A-Za-z0-9_$]/.test(ch)) {
        // 累积标识符：从当前位置往回取
        let k = i
        while (k > 0 && /[A-Za-z0-9_$]/.test(src[k - 1])) k--
        lastWord = src.slice(k, i + 1)
      } else {
        lastWord = ''
      }
    }
  }

  /**
   * 把一个转义序列解码成它**在运行时的实际字符**。
   *
   * ★ 为什么必须解码，而不是"把反斜杠后面的字符原样收下"：
   *   原先的写法把 `\n` 收成了字母 `n`，于是守卫报的键是 `…100%n或视为…`，
   *   而 DOM 里的文本节点是**真换行** —— 译文表按守卫的键登记，运行时永远命不中，
   *   且**双方都不报错**。实测在 `projects/crystal/H5/src/data/crystals/fluorite.js`
   *   与 `nias.js` 的 `packingDescription` 上发生过（那位译者被迫登记了两个键）。
   *
   * @param {string} ch 反斜杠后面的字符
   * @returns {string} 它代表的字符
   */
  const unescape = (ch) => {
    switch (ch) {
      case 'n': return '\n'
      case 't': return '\t'
      case 'r': return '\r'
      case '0': return '\0'
      case 'b': return '\b'
      case 'f': return '\f'
      case 'v': return '\v'
      default: return ch           // \\ \' \" \` \uXXXX \$ … 一律原样（`\u` 少见，不解释）
    }
  }

  /**
   * 跳过一段 `${ … }` 插值（**不改变 buf**，只负责把深度走完、把行号数对）。
   *
   * ★ 为什么必须有：模板串里可以嵌模板串（`` `${c ? `<b>x</b>` : ''}` ``）。
   *   不认插值内部状态的话，扫描器会在内层反引号处错位 —— 之后**整段代码被当成
   *   一个字符串吞掉**或反过来，于是**真中文既没被报出、也没被登记**。
   *   实测：`projects/crystal/H5/src/components/layer-control.js` 的 9 个信息标签、
   *   `atom-info-popup.js` 的 9 个 `info-label` 全部因此隐形，而守卫显示 100% 覆盖。
   *   **一个会漏报的守卫比没有守卫更糟**（它给的是"通过"）。
   *
   * @param {number} from `${` 之后的位置
   * @returns {number} 与 `${` 配对的 `}` 之后的位置
   */
  const skipInterp = (from) => {
    let j = from
    let d = 1
    while (j < n) {
      const ch = src[j]
      if (ch === '\n') { line++; j++; continue }
      if (ch === '{') { d++; j++; continue }
      if (ch === '}') { d--; j++; if (d === 0) return j; continue }
      if (ch === "'" || ch === '"' || ch === '`') {
        // 插值里可以再有字符串/模板串：跳过它们（同样要处理转义）
        const q = ch
        j++
        while (j < n) {
          if (src[j] === '\\') { if (src[j + 1] === '\n') line++; j += 2; continue }
          if (src[j] === '\n') { line++; if (q !== '`') break; j++; continue }
          if (src[j] === q) { j++; break }
          j++
        }
        continue
      }
      if (ch === '/' && src[j + 1] === '/') { while (j < n && src[j] !== '\n') j++; continue }
      if (ch === '/' && src[j + 1] === '*') {
        j += 2
        while (j < n && !(src[j] === '*' && src[j + 1] === '/')) { if (src[j] === '\n') line++; j++ }
        j += 2
        continue
      }
      j++
    }
    return j
  }

  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]

    if (c === '\n') { line++; lastSig = '\n'; i++; continue }

    // ---- 注释 ----
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') i++; continue }
    if (c === '/' && c2 === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++ }
      i += 2
      continue
    }

    // ---- 正则字面量（必须在字符串之前判，见 regexAllowed 的说明）----
    if (c === '/' && regexAllowed()) {
      i = skipRegex(i)
      lastSig = '/'      // 正则整体当作一个"值"，后面不能再跟正则
      lastWord = ''
      continue
    }

    // ---- 括号深度（用于判定 dev 上下文）----
    if (c === '(') { depth++; ctx[depth] = isDevCtx(i); i++; bump(c); continue }
    if (c === ')') { ctx[depth] = false; depth--; i++; bump(c); continue }

    // ---- 字符串 / 模板串 ----
    if (c === '\'' || c === '"' || c === '`') {
      const quote = c
      const startLine = line
      i++
      let buf = ''
      while (i < n) {
        const ch = src[i]
        if (ch === '\\') {
          // 行继续（反斜杠 + 真换行）：不产生字符，只数行
          if (src[i + 1] === '\n') { line++; i += 2; continue }
          buf += unescape(src[i + 1])
          i += 2
          continue
        }
        if (ch === '\n') {
          line++
          if (quote !== '`') break
          buf += '\n'
          i++
          continue
        }
        // 模板串里的插值：整段原样收进 buf（含 `${` 与 `}`），但状态要正确走完
        if (quote === '`' && ch === '$' && src[i + 1] === '{') {
          const end = skipInterp(i + 2)
          buf += src.slice(i, end)
          i = end
          continue
        }
        if (ch === quote) { i++; break }
        buf += ch
        i++
      }
      if (CJK.test(buf)) {
        let dev = false
        for (let d = 1; d <= depth; d++) if (ctx[d]) { dev = true; break }
        out.push({ text: buf, line: startLine, dev, geo: !dev && isGeometryPayload(buf) })
      }
      lastSig = quote
      lastWord = ''
      continue
    }

    bump(c)
    i++
  }
  return out
}

// ---------------------------------------------------------------------------
// 字典
// ---------------------------------------------------------------------------

const coveredText = new Map()  // 区域 id → Set(中文原文)（**该区自己的** text 表登记的）
const coveredKeys = new Set()  // 键名（t('…') 的实参）—— 键是全仓唯一的标识符，全局共享
/** 键 → 文案（分语言）。用于下面的**跨区契约断言**（那种失效不报错、只是功能死掉） */
const valuesByLang = { zh: new Map(), en: new Map() }

/**
 * 区域 id → Set(中文原文)：**只由该区 zh/en 表的"值"** 遮盖的那些。
 *
 * ★ 为什么不干脆把它们算作未覆盖：历史原因 + 判据稳定。
 *   原判据（"作为 zh 值登记过也算已覆盖"）背后是一个成立的前提：
 *   中文出现在 `zh` 表的值里，说明有一条 `t('某个键')` 会产出它。
 *   但那条通路**证明不了**"源码里那一条字面量也走了 t()" —— 于是它可能是一处
 *   没接线的兜底字面量，被同区字典的值**遮盖**成绿色。
 *   这类遮盖**不当作失败**（否则区域之间会因为一条共用文案来回改），
 *   但要**逐条报出来**，让收尾的人能一条条确认"它真的接线了"。
 */
const shadowedText = new Map()
function shadowSet(areaId) {
  if (!shadowedText.has(areaId)) shadowedText.set(areaId, new Set())
  return shadowedText.get(areaId)
}

/** 取某区的 text 覆盖集（懒建） */
function textSet(areaId) {
  if (!coveredText.has(areaId)) coveredText.set(areaId, new Set())
  return coveredText.get(areaId)
}

// ---------------------------------------------------------------------------
// 遍历
// ---------------------------------------------------------------------------

function walkFiles(root, skip, out = []) {
  const abs = resolve(REPO, root)
  if (!existsSync(abs)) return out
  const st = statSync(abs)
  if (st.isFile()) { out.push(abs); return out }
  for (const name of readdirSync(abs)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    const p = resolve(abs, name)
    const rel = relative(REPO, p).replace(/\\/g, '/')
    if (skip.some((re) => re.test('/' + rel))) continue
    if (statSync(p).isDirectory()) walkFiles(relative(REPO, p), skip, out)
    else if (/\.(js|mjs)$/.test(name)) out.push(p)
  }
  return out
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  // 字典是纯数据 ESM，直接 import；`?t=` 绕过缓存以便同一进程内重复读
  //
  // ★ **按区域归属**两样东西（这条是 2026-10-01 修的，起因是一个真缺陷）：
  //   · text 覆盖：**只认该区自己那本字典**。
  //     原先 `covered` 是一个全局集合，于是 skills 区登记了「先说说你是怎么想的？」
  //     之后，crystal 区里**逐字相同**的那一条也被判成"已覆盖" —— 而它在晶体模块
  //     里并没有接线（是 `out.followUp` 的兜底字面量，进模型上下文），
  //     英文界面下仍然是中文。**跨区同名原文互相遮盖**，守卫绿得没有意义。
  //   · 键：仍然全局。键（`orbit.title`）本来就是全仓唯一标识符，不与区域绑定。
  const dictOwners = new Map()   // 字典文件 → 区域 id（一个字典可被多区共用，故存数组）
  for (const a of AREAS) {
    if (!dictOwners.has(a.dict)) dictOwners.set(a.dict, [])
    dictOwners.get(a.dict).push(a.id)
  }
  for (const [f, owners] of dictOwners) {
    const p = resolve(REPO, f)
    if (!existsSync(p)) continue
    let mod = null
    try {
      mod = await import('file://' + p.replace(/\\/g, '/'))
    } catch (e) {
      console.error(`⚠ 读不了字典 ${f}：${e.message}`)
      continue
    }
    // ★ 字典有两种外形，都要认：
    //   · 扁平：`export const zh = {...}; export const en = {...}; export const text = {...}`
    //   · 分片：`export const MESSAGES = { zh: {...}, en: {...} }`（对称模块就是这种，
    //     它移植自上游时就是这个形状——**不改它**，让守卫去适配既有实现，
    //     而不是为了守卫好看去动一个已经跑通的东西）
    //   · 汇总：知识库把三本译文表各自具名导出（`crystalText` / `orbitText` / `symmetryText`）
    //
    //   判据只看**键**：键里带中文 ⇒ 这是 text 表的一条（原文 → 译文）；
    //   键不带中文 ⇒ 这是一个翻译键。**值一律不看** ——
    //   从前把"值含中文"也算作已覆盖，于是 `zh` 表成了 text 表的替身，
    //   而 `zh` 的值只有走 `t('对应的键')` 时才会被用到，压根不是"扫描替换认得它"。
    const flat = (obj, lang) => {
      for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined) continue
        if (typeof v === 'string') {
          if (CJK.test(k)) {
            // text 表的一条：键就是中文原文（运行时扫描替换认得它）
            for (const o of owners) textSet(o).add(k)
          } else {
            coveredKeys.add(k)
            if (lang) valuesByLang[lang].set(k, v)
            // `zh` 表的值：说明有一条 `t('键')` 会产出它 ⇒ 也算已覆盖，
            //   但**单独记一份**（见 shadowedText 的说明：它可能遮盖一处没接线的字面量）
            if (CJK.test(v)) for (const o of owners) shadowSet(o).add(v)
          }
        } else if (typeof v === 'object' && !Array.isArray(v)) {
          // 分片外形（{zh:{…}, en:{…}}）再下钻一层；下钻后键仍是最终键
          // ★ 下钻时**把语言带下去**：分片外形里 `zh`/`en` 是**对象键**，不是文案键，
          //   不带下去的话跨区契约断言就查不到任何值（而它只会"静默通过"）。
          flat(v, lang || (k === 'zh' || k === 'en' ? k : ''))
        }
      }
    }
    for (const [name, part] of Object.entries(mod || {})) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) continue
      // ★ 用**导出名**判断语言（`export const zh = {...}`）——这是扁平外形；
      //   分片外形（`MESSAGES = { zh, en }`）由 flat 内部按对象键判断。
      flat(part, (name === 'zh' || name === 'en') ? name : '')
    }
  }

  // ---------------------------------------------------------------------------
  // 跨区契约断言：**同一个字符串在两个区各自定义，必须逐字一致**
  //
  // ★ 为什么值得单列：本仓有一类失效是"两边各写一份，英文改了一边"——
  //   主动介入规则拿 `perception.fieldLabels` 的**值**当 `trace.toggleCounts` 的键，
  //   而规则写在另一个区的 descriptor 里。两边不一致时**不报错**，
  //   表现只是"这条规则永不触发"（晶体那两条就这么坏掉过一次）。
  // ---------------------------------------------------------------------------
  // ★ 只在**全仓模式**下做这条断言：`--area X` 会按 AREAS 过滤字典，
  //   于是"另一半"按构造就不会被 import，报"查不到键"是必然的假红
  //   —— 假红和假绿一样有害（会让人开始忽略这条输出）。
  const CONTRACTS = ONLY ? [] : [
    ['agent.descriptor.orbit.toggleM', 'orbit.field.m',
      '主动介入规则用 fieldLabels 的值当 toggleCounts 的键（见 descriptors/orbit.js）'],
    ['agent.descriptor.orbit.toggleWavefunction', 'orbit.field.wavefunction',
      '同上'],
  ]
  let contractBad = 0
  for (const lang of ['zh', 'en']) {
    for (const [a, b, why] of CONTRACTS) {
      const va = valuesByLang[lang].get(a)
      const vb = valuesByLang[lang].get(b)
      if (va === undefined || vb === undefined) {
        console.error(`⚠ 跨区契约查不到键：${lang} 里的 ${va === undefined ? a : b}（${why}）`)
        contractBad++
      } else if (va !== vb) {
        console.error(`✗ 跨区契约不一致（${lang}）：${a} = ${JSON.stringify(va)} ≠ ${b} = ${JSON.stringify(vb)} —— ${why}`)
        contractBad++
      }
    }
  }
  if (contractBad === 0 && CONTRACTS.length) {
    console.log(`跨区契约 ${CONTRACTS.length} 组 · 中英各一次 · 全部一致 ✓\n`)
  }

  const allText = new Set()
  for (const s of coveredText.values()) for (const x of s) allText.add(x)

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('i18n 覆盖率 · 全仓中文文案scan')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`字典已登记 ${allText.size} 条中文原文（按区域归属）/ ${coveredKeys.size} 个键`)
  console.log('')

  let totalUncovered = 0
  const rows = []

  for (const area of AREAS) {
    const files = walkFiles(area.roots[0], area.skip)
    for (const extra of area.roots.slice(1)) walkFiles(extra, area.skip, files)
    let tot = 0
    let dev = 0
    let geo = 0
    let ok = 0
    const bad = []
    const shadowHit = []
    for (const abs of new Set(files)) {
      let src = ''
      try { src = readFileSync(abs, 'utf8') } catch (e) { continue }
      const rel = relative(REPO, abs).replace(/\\/g, '/')
      for (const lit of scanLiterals(src)) {
        tot++
        if (lit.dev) { dev++; continue }
        if (lit.geo) { geo++; continue }
        // 已覆盖：片段登记过（text 表的键、某条 zh 值），或它本身就是某个键
        const segs = translatableSegments(lit.text)
        if (segs.length === 0) { ok++; continue }
        const own = coveredText.get(area.id)
        const sh = shadowedText.get(area.id)
        const inOwn = (seg) => !!(own && own.has(seg))
        const inKeys = (seg) => coveredKeys.has(seg)
        const satisfied = (seg) => inOwn(seg) || inKeys(seg) || !!(sh && sh.has(seg))

        // ★ **整串登记**也是一条合法通路：运行时的 `sweep()` 先按**整个文本节点**查
        //   （`tsrc(raw)`），命中就直接替换 —— 所以把一整段多行文本原样登记进 `text`
        //   表，英文模式下真的会整段换掉。守卫按行切只是为了"漏了一行也能报出来"，
        //   不能反过来要求把整段拆成行键（那样会逼出**运行时用不到**的假键）。
        //   ⚠ 含 `${}` 的字面量**不给这条后门**：插值外的静态中文拼接后运行时对不上，
        //     登记整串只会让守卫变绿而界面照旧中文（那是自欺，见 classifyInterpolated）。
        const whole = lit.text.trim()
        if (whole.indexOf('${') < 0 && satisfied(whole)) { ok++; continue }

        // 把每个片段摊平成"必须满足的条目"：
        //   · 不含 `${}` 的片段 → 它本身就是运行时的文本节点，登记过即可
        //   · 含 `${}` 的片段 → **插值之外**的中文只能改写走 t()（登记不算，见 classifyInterpolated）；
        //                       **插值之内**的字符串字面量才是运行时的文本节点，登记过即可
        const needed = []
        const forced = []
        for (const seg of segs) {
          if (seg.indexOf('${') < 0) { needed.push(seg); continue }
          const { staticCjk, innerLits } = classifyInterpolated(seg)
          for (const s of staticCjk) if (CJK.test(s)) forced.push(s)
          for (const l of innerLits) if (CJK.test(l)) needed.push(l)
        }
        if (forced.length === 0) {
          const miss = needed.filter((seg) => !satisfied(seg))
          if (miss.length === 0) {
            // 整条都"登记过"，但如果其中有片段**只**靠 zh 值遮盖，就记一笔备查
            const shadowOnly = needed.filter((seg) => !inOwn(seg) && !inKeys(seg) && sh && sh.has(seg))
            if (shadowOnly.length) shadowHit.push({ file: rel, line: lit.line, segs: shadowOnly })
            ok++
            continue
          }
          for (const seg of miss) bad.push({ file: rel, line: lit.line, text: seg })
          continue
        }
        // 插值外的静态中文：登记也换不掉，必须改写
        for (const f of forced) bad.push({ file: rel, line: lit.line, text: f, why: 'interp' })
        for (const seg of needed.filter((s) => !satisfied(s))) bad.push({ file: rel, line: lit.line, text: seg })
      }
    }
    totalUncovered += bad.length
    rows.push({ area, tot, dev, geo, ok, bad, shadowHit })
    const pct = tot ? Math.round((ok / Math.max(1, tot - dev - geo)) * 100) : 100
    const mark = bad.length === 0 ? '✓' : '✗'
    console.log(`${mark} ${area.id.padEnd(12)} ${area.label.padEnd(22)} `
      + `可译 ${String(tot - dev - geo).padStart(4)} · 已覆盖 ${String(ok).padStart(4)} `
      + `(${String(pct).padStart(3)}%) · 开发 ${String(dev).padStart(3)} · 几何 ${String(geo).padStart(3)} · 未覆盖 ${bad.length}`
      + (shadowHit.length ? ` · ⚠靠 zh 值遮盖 ${shadowHit.length}` : ''))
    if (shadowHit.length) {
      for (const s of shadowHit.slice(0, Math.min(LIST, 5))) {
        console.log(`      ⚠ ${s.file}:${s.line}  只由本区 zh/en 的**值**遮盖（请在收尾时确认它真的接了线）：`
          + s.segs.join(' | ').slice(0, 80))
      }
      if (shadowHit.length > 5) console.log(`      … 另有 ${shadowHit.length - 5} 条同类遮盖`)
    }
    if (bad.length && LIST > 0) {
      for (const b of bad.slice(0, LIST)) {
        console.log('      ' + `${b.file}:${b.line}  ${b.text.replace(/\s+/g, ' ').slice(0, 64)}`
          + (b.why === 'interp' ? '   ← 插值外的静态中文：只能改写成 t(\'key\', {…})，登记进字典不算' : ''))
      }
      if (bad.length > LIST) console.log(`      … 另有 ${bad.length - LIST} 条`)
    }
  }

  if (JSONOUT) {
    const out = { generatedAt: new Date().toISOString(), areas: {} }
    for (const r of rows) {
      out.areas[r.area.id] = {
        label: r.area.label,
        dict: r.area.dict,
        total: r.tot, dev: r.dev, ok: r.ok, uncovered: r.bad.length,
        items: r.bad.map((b) => ({ file: b.file, line: b.line, text: b.text })),
      }
    }
    const abs = resolve(REPO, JSONOUT)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, JSON.stringify(out, null, 2), 'utf8')
    console.log(`\n（未覆盖全文已写入 ${JSONOUT}）`)
  }

  console.log('')
  console.log('───────────────────────────────────────────────────────────────')
  if (totalUncovered === 0 && contractBad === 0) {
    console.log('全部中文文案都已覆盖 ✓')
    process.exit(0)
  }
  if (contractBad) console.log(`跨区契约有 ${contractBad} 处不一致 —— 见上面的 ✗。`)
  if (totalUncovered) console.log(`未覆盖合计 ${totalUncovered} 条 —— 把它们加进各区字典后再跑一次。`)
  console.log('（字典位置见 tools/check-i18n.mjs 顶部的 AREAS 表：每区一行 dict 路径）')
  process.exit(1)
}

main().catch((e) => {
  console.error('check-i18n 自身出错：' + (e && e.stack || e))
  process.exit(2)
})
