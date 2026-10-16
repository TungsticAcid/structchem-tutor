/**
 * check-i18n-orphans.mjs — 字典键 ↔ 源文一致性守卫（**这类陷阱本仓已栽过两次**）
 *
 * 为什么需要：知识条目的字典是"**原文即键**"（键 = 条目正文里那一行的中文原文），
 * `t()` 查不到就**静默回退中文** —— 界面看着正常，只是"没翻译"。
 *   · 第一次栽在"引号统一成「」"那轮：221 个键没同步 ⇒ 英文模式静默留中文；
 *   · 第二次栽在这一轮：改了 H₂O₂ 那几句，**键必须逐字跟着改**（含行首空格）。
 * 所以判据只有一条：**字典里的每个中文键，都必须能在对应源文件里逐字找到**。
 *
 * 检查范围（键来自哪里 ↔ 到哪里找）：
 *   packages/knowledge/<area>/i18n.js  的键 → packages/knowledge/<area>/entries/*.js
 * 用法：node packages/knowledge/tools/check-i18n-orphans.mjs
 * 退出码：0 = 全部命中；1 = 有孤儿键（打印出来，便于逐条修）
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const KNOWLEDGE = join(ROOT, 'packages', 'knowledge')

/** 从 i18n.js 里粗取"顶层字符串键"（`"…": "…"` 或 `'…': '…'` 形式，允许注释干扰） */
function dictKeys(src) {
  const keys = []
  const re = /^\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*:/gm
  let m
  while ((m = re.exec(src))) {
    const k = m[1] !== undefined ? m[1] : m[2]
    if (k) keys.push(k.replace(/\\(["'\\])/g, '$1'))
  }
  return keys
}

let orphans = 0
let checked = 0
const areas = readdirSync(KNOWLEDGE, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'shared' && d.name !== 'tools')
  .map((d) => d.name)

for (const area of areas) {
  const dictPath = join(KNOWLEDGE, area, 'i18n.js')
  const entriesDir = join(KNOWLEDGE, area, 'entries')
  let dictSrc = ''
  let entrySrc = ''
  try { dictSrc = readFileSync(dictPath, 'utf8') } catch (e) { continue }
  /**
   * ★ 条目的组织方式**不统一**（本仓现状）：crystal/symmetry 是 `entries/` 目录，
   *   而 orbit 是**单文件** `entries.js` —— 第一版只读目录，于是 orbit 的 280 个键
   *   全被误报成孤儿（"全部找不到"本身就是判据写错的信号）。
   *   两处都读，缺一不可。
   */
  try {
    const single = join(KNOWLEDGE, area, 'entries.js')
    entrySrc = readFileSync(single, 'utf8')
  } catch (e) {
    try {
      entrySrc = readdirSync(entriesDir).filter((f) => f.endsWith('.js'))
        .map((f) => readFileSync(join(entriesDir, f), 'utf8')).join('\n')
    } catch (e2) { entrySrc = '' }
  }

  const keys = dictKeys(dictSrc)
  /**
   * ★ 判据只针对**多行正文片段**（`body` 里被 `.join('\n')` 拆开的那种键）——
   *   它们正是"引号统一 / 文案改写"时最容易忘记同步的那一类：
   *   键里有对话标点（：，—— ）或有行首缩进，说明它是从**正文**里截出来的。
   *   ★ 单行标签（"正四面体群"、"线性分子群（无对称中心）"…）是**群名表**那类
   *     key→text 字典，真源不在 entries/ 里 —— 拿它们判"孤儿"会得到 400+ 个假阳性
   *     （第一版就是这么误报的）。判据必须与它要守的语义对齐。
   */
  const bodyish = (k) => /[\u4e00-\u9fff]/.test(k) && (/^ +/.test(k) || /[：，。——]/.test(k)) && k.length > 8
  const miss = keys.filter((k) => bodyish(k) && !entrySrc.includes(k))

  /**
   * ★★ 2026-10-16（**实机抓到的第二个陷阱**，比孤儿键更隐蔽）：
   *   `tsrc()`（DOM 扫描与 `t()` 的中文回退都走它）匹配前会 **`trim()`**，
   *   所以**字典键必须是 trim 后的原文**。键里带行首空格时：
   *     · 用原始行去查（带缩进）→ 查不到；用 trim 后的去查 → 也查不到（键本身带缩进）
   *     ⇒ 该行**永远翻不掉**，而且不报错 —— 本仓"看着对"的漏译。
   *   ★ 上一版守卫**抓不到它**：它只判 `entrySrc.includes(k)`，而带缩进的键
   *     在源文里当然"找得到"（原文就带缩进）⇒ 放行。判据必须再问一句：
   *     **这个键 trim 后还是不是同一个键**？
   *   ★ 例外：若**已经存在** trim 后的孪生键（本仓有 174 个这样的历史键），
   *     那这个带缩进的键只是冗余，不影响生效 —— 只报"没有孪生键"的那些。
   */
  const keySet = new Set(keys)
  const indentDead = keys.filter((k) => /^\s/.test(k) && bodyish(k) && !keySet.has(k.trim()))
  checked += keys.filter(bodyish).length
  console.log('── ' + area + '：正文型键 ' + keys.filter(bodyish).length + ' 个 · 源文里找不到 ' + miss.length
    + ' · 带缩进且无孪生键（永远翻不掉）' + indentDead.length)
  for (const k of miss) { orphans++; console.log('     ✗ 孤儿键 ' + JSON.stringify(k.slice(0, 70))) }
  for (const k of indentDead) { orphans++; console.log('     ✗ 带缩进的键（trim 后才是真键）' + JSON.stringify(k.slice(0, 70))) }
}

/**
 * ★ 棘轮：这个数只许**变小**。它的来历：本项目历史上两次"改了文案没同步键"
 *   （引号统一那轮 221 个、本轮 H₂O₂ 若干）。把当前水位记下来，
 *   以后**新增**孤儿键会当场红 —— 而历史遗留的存量不会一直挡着 CI。
 *   ★ 想彻底清零就逐个修，然后把阈值往下调。
 */
const BASELINE = Number(process.env.ORPHAN_BASELINE || 0)
if (orphans > BASELINE) {
  console.log('\n✗ 孤儿键 ' + orphans + ' 个，超过基线 ' + BASELINE + ' —— 说明有键没跟着文案改')
}
console.log('\n结果：检查 ' + checked + ' 个键 · 孤儿键 ' + orphans + ' 个（基线 ' + BASELINE + '）')
process.exit(orphans > BASELINE ? 1 : 0)
