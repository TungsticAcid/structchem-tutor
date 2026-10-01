/**
 * snapshot-hashes.mjs — 给若干目录建立「逐文件 sha256 清单」
 *
 * ★ 用途有两次，故做成通用工具：
 *   · M0（回流前基线）：记录 chem-agent 真源与两个下游的当前状态，
 *     事后用它证明「回流是忠实的、没有顺手改坏别的东西」。
 *   · M7（漂移守卫）：比对真源与下游镜像，发现「改了真源忘了同步」
 *     或「有人直接改了下游」。
 *
 * ★ 一条纪律（本仓库反复强调）：**任何文件比对，先规范化行尾**。
 *   本项目在 Windows 上开发，两侧换行可能是 CRLF 或 LF；
 *   不规范化会把「仅行尾不同」误读成「整文件内容分叉」——
 *   这个坑本仓库已经重犯过一次（见 CLAUDE.md §四 与 docs/orbit变更待评估.md）。
 *   故本脚本的哈希对象是**规范化行尾后的内容**，并在输出里同时记下原始字节数，
 *   便于区分「只是行尾不同」与「真的改了」。
 *
 * 用法：
 *   node tools/snapshot-hashes.mjs --out tmp/baseline.json \
 *        --source chem-agent:packages --source chem-agent:modules \
 *        --source crystal-agent:D:/xjl/program/crystal/H5/src/agent \
 *        --source orbit-js:D:/xjl/program/orbit/H5/js
 *
 * 参数：
 *   --out <file>            输出 JSON 路径（默认 tmp/hash-snapshot.json）
 *   --source <label>:<dir>  要快照的目录，label 是清单里的键；可重复
 *   --ext <a,b,c>           只收这些扩展名（默认 js,mjs,cjs,ts,css,html,json,md）
 *   --quiet                 不打印逐目录统计
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')

/** 一律跳过的目录名（依赖、构建产物、版本库内部） */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vite', 'coverage', '__pycache__'])

/** 默认收集的扩展名 */
const DEFAULT_EXTS = ['js', 'mjs', 'cjs', 'ts', 'css', 'html', 'json', 'md']

/** 解析命令行参数 */
function parseArgs(argv) {
  const opts = { out: join(REPO, 'tmp', 'hash-snapshot.json'), sources: [], exts: DEFAULT_EXTS, quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') opts.out = resolve(argv[++i])
    else if (a === '--ext') opts.exts = argv[++i].split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--quiet') opts.quiet = true
    else if (a === '--source') {
      const v = argv[++i] ?? ''
      const at = v.indexOf(':')
      if (at <= 0) throw new Error(`--source 需要 label:dir 形式，收到：${v}`)
      opts.sources.push({ label: v.slice(0, at), dir: resolve(v.slice(at + 1)) })
    } else {
      throw new Error(`未知参数：${a}`)
    }
  }
  return opts
}

/**
 * 规范化行尾：CRLF / CR → LF。
 * ★ 这是本脚本存在的理由之一——只比字节会把行尾差异当成内容差异。
 */
function normalizeEol(text) {
  return text.replace(/\r\n?/g, '\n')
}

/** 递归收集目录下的目标文件（相对路径，正斜杠分隔，排序稳定） */
function collectFiles(root, exts) {
  const out = []
  const allowed = new Set(exts.map((e) => (e.startsWith('.') ? e.slice(1) : e)))
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return // 目录不存在或不可读：静默跳过由调用方负责报告
    }
    for (const ent of entries) {
      const full = join(dir, ent.name)
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(full)
      } else if (ent.isFile()) {
        const ext = extname(ent.name).slice(1).toLowerCase()
        if (allowed.has(ext)) out.push(full)
      }
    }
  }
  walk(root)
  // 按相对路径排序，保证同一份输入永远产出同一份清单（便于 diff）
  return out
    .map((f) => ({ full: f, rel: relative(root, f).split('\\').join('/') }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
}

/** 计算单个文件的「规范化后 sha256」与字节统计 */
function hashFile(full) {
  const raw = readFileSync(full)
  const norm = normalizeEol(raw.toString('utf8'))
  return {
    sha256: createHash('sha256').update(norm, 'utf8').digest('hex'),
    bytes: raw.length,
    bytesNorm: Buffer.byteLength(norm, 'utf8'),
    eol: raw.includes(0x0d) ? 'crlf' : 'lf',
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.sources.length) {
    console.error('至少需要一个 --source label:dir')
    process.exit(2)
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    // ★ 记录判据，避免后人误以为比的是原始字节
    hashOf: 'sha256(规范化行尾后的 UTF-8 文本)',
    repo: REPO,
    sources: {},
  }

  for (const { label, dir } of opts.sources) {
    let exists = true
    try { statSync(dir) } catch { exists = false }

    if (!exists) {
      // ★ 目录不存在时**显式记录**，绝不静默略过——
      //   「静默跳过会让『没写测试』看起来像『测试通过』」（本仓库的既有纪律）。
      snapshot.sources[label] = { dir, missing: true, count: 0, files: {} }
      console.error(`⚠ ${label}: 目录不存在 —— ${dir}`)
      continue
    }

    const files = collectFiles(dir, opts.exts)
    const map = {}
    let crlf = 0
    for (const { full, rel } of files) {
      const h = hashFile(full)
      map[rel] = { sha256: h.sha256, bytes: h.bytes, eol: h.eol }
      if (h.eol === 'crlf') crlf++
    }
    snapshot.sources[label] = { dir, missing: false, count: files.length, crlfCount: crlf, files: map }
    if (!opts.quiet) {
      console.error(`✓ ${label}: ${files.length} 个文件（其中 CRLF ${crlf} 个）`)
    }
  }

  mkdirSync(dirname(opts.out), { recursive: true })
  writeFileSync(opts.out, JSON.stringify(snapshot, null, 2), 'utf8')
  console.error(`\n基线已写入：${opts.out}`)
}

main()
