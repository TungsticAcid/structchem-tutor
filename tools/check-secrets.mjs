/**
 * check-secrets.mjs —— 「仓库里不许有密钥」的常驻守卫
 *
 * ---------------------------------------------------------------------------
 * 它是怎么来的
 * ---------------------------------------------------------------------------
 * 2026-10-01 用户提出「检查仓库中，有 API 密钥」后做的一次性排查。排查结论是**没有泄露**，
 * 但排查本身是靠人肉跑几条 grep —— 那种东西下个月就没人记得跑了。
 * 所以把它固化成守卫，进 `npm test`。
 *
 * ---------------------------------------------------------------------------
 * ★ 它绝不回显密钥内容
 * ---------------------------------------------------------------------------
 * 这条是**硬纪律**，不是风格偏好：密钥一旦进了 CI 日志 / 终端回滚缓冲 / 聊天记录，
 * 就算代码里删掉了也等于已经泄露。
 * 所以本文件所有输出一律经过 `mask()`：只给「前 4 位 + 长度」。
 * 前 4 位足够让人认出"是哪一个密钥"，但不足以使用它。
 * **改这个文件时不要为了"方便排查"把原值打出来。**
 *
 * ---------------------------------------------------------------------------
 * 判据
 * ---------------------------------------------------------------------------
 *   ✗ 失败（退出 1）：
 *     · 任何**被 git 跟踪**的文件里出现密钥形态的**字面量**；
 *     · 任何文件名像密钥文件（*.env / apikey* / secret* …）**且被跟踪**。
 *       —— 这两条是"已经进版本库"，必须立刻处理。
 *
 *   ⚠ 警告（不失败）：
 *     · 未被跟踪、但躺在仓库目录里的密钥文件。
 *       用户自己的 key 放这儿是常见做法，且 .gitignore 挡住了它 —— 不是错误。
 *       但它**只靠一条忽略规则**挡着，所以每次都要提醒一遍：
 *       更稳的做法是把它放到仓库之外（`tools/acceptance.mjs` 也正是这么要求的）。
 *
 *   ✓ 放行：
 *     · 造出来的测试值（`sk-abcdefghijklmnop` 这种连续字母/重复字符/含 fake|test|dummy）。
 *       没有这条例外，`test-ui-kit.mjs` 里那两个掩码测试值会让守卫永远红着 —— 而一个
 *       永远红的守卫等于没有守卫。
 *     · `ANTHROPIC_API_KEY` 这类**环境变量名**（只有名字没有值）。
 *
 * 用法：node tools/check-secrets.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 密钥形态。宁可多报（人再筛），不要漏报。 */
const PATTERNS = [
  ['sk- 令牌', /sk-[A-Za-z0-9_-]{16,}/g, null],
  ['Bearer 令牌', /Bearer\s+([A-Za-z0-9._-]{20,})/g, 1],
  ['赋值式密钥', /(?:api[_-]?key|apikey|access[_-]?token|secret[_-]?key|auth[_-]?token|appsecret)\s*[:=]\s*['"`]([^'"`]{16,})['"`]/gi, 1],
  ['JSON 密钥字段', /"(?:api_?key|apiKey|secret|token)"\s*:\s*"([^"]{16,})"/g, 1],
]

const KEYISH_NAME = /(^|\/)(\.env(\..+)?|apikey|api[-_]?key|secrets?|credentials?|\.npmrc|\.git-credentials)$/i

/** 只给前 4 位 + 长度 —— 够认人，不够用 */
function mask(s) {
  const v = String(s)
  return `${v.slice(0, 4)}${'*'.repeat(8)}（长度 ${v.length}）`
}

/**
 * 明显是"造出来的"测试值。
 * ★ 这条例外必须存在：`packages/ui-kit/tools/test-ui-kit.mjs` 里有两个掩码测试值
 *   （测试断言"掩码不含原文中段"），它们会命中 `sk-` 形态。没有例外，守卫永远红 ——
 *   而永远红的守卫会被绕过、被注释掉、被加进忽略名单，最后什么也守不住。
 */
function looksSynthetic(v) {
  const s = String(v)
  // 占位词：`sk-originalkey123456` 这种，字面就写着"我不是真的"
  if (/fake|test|dummy|sample|example|placeholder|your[-_]?key|original|changeme|abc123|xxx/i.test(s)) return true
  const body = s.replace(/^sk-/, '')
  // 重复同一字符
  if (/^(.)\1{7,}$/.test(body)) return true
  // 连续递增/递减段：`abcdefghijklmnop`（16 位连号）是人手造的典型特征，
  // 而随机密钥出现 10 位以上连号的概率可以忽略。
  let run = 1
  let best = 1
  for (let i = 1; i < body.length; i++) {
    const d = body.charCodeAt(i) - body.charCodeAt(i - 1)
    run = (d === 1 || d === -1) ? run + 1 : 1
    if (run > best) best = run
  }
  if (best >= 10) return true
  // 纯数字且含 6 位以上连号（`123456`）
  if (/^\d+$/.test(body) && /(?:012345|123456|234567|345678|456789|567890)/.test(body)) return true
  return false
}

/**
 * 命中的"值"其实是**代码**（不是密钥）。
 *
 * ★ 这条不是锦上添花：`tools/acceptance.mjs` 里那行
 *     `'…settings.set({ apiKey: ' + JSON.stringify(RAW_KEY) + ' })'`
 *   是**字符串拼接**，赋值式正则会把 `' + JSON.stringify(RAW_KEY) + '` 整段当成"值"。
 *   而真实密钥是**一个不含空白与括号的 token** —— 这条判据既简单又不会漏掉真的。
 */
function looksLikeCode(v) {
  return /[\s+(){}[\]$<>'"]/.test(String(v)) || /\.\w+\(/.test(String(v))
}

function walk(dir, out, depth = 0) {
  if (depth > 12) return out
  let names = []
  try { names = readdirSync(dir) } catch { return out }
  for (const n of names) {
    if (n === 'node_modules' || n === '.git' || n === 'dist' || n === '.venv') continue
    const p = resolve(dir, n)
    let st = null
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) walk(p, out, depth + 1)
    else out.push(p)
  }
  return out
}

function gitTracked() {
  const s = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' })
  return new Set(s.split('\n').map((x) => x.trim()).filter(Boolean))
}

let fails = 0
let warns = 0
const fail = (msg) => { fails++; console.log('  ✗ ' + msg) }
const warn = (msg) => { warns++; console.log('  ⚠ ' + msg) }

console.log('═══════════════════════════════════════════════════════════════')
console.log('密钥守卫 · 仓库里不许有密钥（输出一律打码）')
console.log('═══════════════════════════════════════════════════════════════')

const tracked = gitTracked()
const files = walk(REPO, [])
const rel = (p) => relative(REPO, p).replace(/\\/g, '/')

// ---- ① 文件名像密钥文件 ----
console.log('【① 文件名像密钥文件的】')
{
  let n = 0
  for (const p of files) {
    const r = rel(p)
    if (!KEYISH_NAME.test('/' + r)) continue
    n++
    if (tracked.has(r)) fail(`**已被 git 跟踪**：${r}`)
    else warn(`${r}（未跟踪；只靠 .gitignore 挡着 —— 更稳的做法是移到仓库之外）`)
  }
  if (!n) console.log('  （无）')
}

// ---- ② 内容里的密钥形态 ----
console.log('【② 文件内容里命中密钥形态的】')
{
  const TEXT = /\.(js|mjs|cjs|json|txt|md|html|css|yml|yaml|env|sh|ps1|py|ts|xml|properties|ini|cfg|conf|log)$/i
  let n = 0
  for (const p of files) {
    const r = rel(p)
    if (!TEXT.test(r) && !/\.env/i.test(r)) continue
    // ★ 跳过自己：本文件顶部就写着那几条**正则字面量**（`/sk-[A-Za-z0-9_-]{16,}/`），
    //   而 `sk-[A-Za-z0-9_-]{16,}` 本身恰好符合它自己的规则 —— 第一次跑就命中了自己。
    //   这类"守卫扫到自己"的假阳性很常见，处理方式是**明着自跳**并写下来，
    //   而不是把规则改松（改松会连带漏掉真的）。
    if (r === 'tools/check-secrets.mjs') continue
    let src = ''
    try {
      const st = statSync(p)
      if (st.size > 4 * 1024 * 1024) continue
      src = readFileSync(p, 'utf8')
    } catch { continue }
    const isTracked = tracked.has(r)
    for (const [label, re, grp] of PATTERNS) {
      const full = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
      let m
      let guard = 0
      while ((m = full.exec(src)) !== null && guard++ < 50) {
        const val = (grp == null) ? m[0] : (m[grp] !== undefined ? m[grp] : m[0])
        if (looksSynthetic(val)) continue
        if (looksLikeCode(val)) continue
        n++
        const ln = src.slice(0, m.index).split('\n').length
        const line = `${r}:${ln}  [${label}]  ${mask(val)}`
        if (isTracked) fail(`${line}  ← **已被 git 跟踪**`)
        else warn(`${line}（未跟踪）`)
      }
    }
  }
  if (!n) console.log('  （无）')
}

console.log('')
console.log('───────────────────────────────────────────────────────────────')
if (fails) {
  console.log(`失败 ${fails} 项${warns ? `（另有 ${warns} 条警告）` : ''} —— 密钥进了版本库，必须立刻处理：`)
  console.log('  · 先把它从文件里删掉，并把对应密钥在服务商处**作废重发**（历史里的旧值已经不可信）；')
  console.log('  · 再考虑 `git filter-repo` 清历史 —— 但**换密钥优先于清历史**。')
  process.exit(1)
}
console.log(`通过（无密钥入库）${warns ? `；另有 ${warns} 条警告，见上` : ''}`)
process.exit(0)
