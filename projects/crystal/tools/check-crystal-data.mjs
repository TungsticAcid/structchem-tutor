/**
 * 晶体数据自检脚本
 *
 * 用途：每次增删晶体或修改数据后运行，校验数据自洽性与格式合规性。
 * 运行：node tools/check-crystal-data.mjs
 *
 * 设计说明：
 *   本脚本同时校验三份副本（H5 版 + 小程序的两份），因为三者内容必须保持一致，
 *   仅模块语法不同（export default vs module.exports）。
 *
 * 背景：见 activity/数据核查报告.md。数据中曾发现若干自洽性问题
 *       （如石英的结构基元误写为方石英的值），故建立此自动检查。
 */
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

// ============================================================================
// 配置
// ============================================================================

/** 三份内容必须一致的副本。keepPrefix 用于剥离各自的模块语法后比对 */
const COPIES = [
  { name: 'H5', dir: 'H5/src/data/crystals', exportPrefix: 'export default' },
  { name: '小程序', dir: 'crystal/data/crystals', exportPrefix: 'module.exports =' },
  { name: '小程序-skill', dir: 'crystal/skills/data/crystals', exportPrefix: 'module.exports =' },
]

const ROOT = process.cwd()

/** 点阵型式记号 → 晶胞内点阵点数 */
const LATTICE_POINTS = {
  aP: 1, aS: 2,
  mP: 1, mC: 2,
  oP: 1, oC: 2, oI: 2, oF: 4,
  tP: 1, tI: 2,
  hP: 1, hR: 3,
  cP: 1, cI: 2, cF: 4,
}

/** 空间群首字母 → 允许的点阵记号首字母 */
const SG_TO_LATTICE = { P: 'P', I: 'I', F: 'F', C: 'C', A: 'A', R: 'R' }

/** 内置空间利用率知识表（等径球模型），用于与数据字段交叉校验 */
const SPACE_UTILIZATION = { cF: 74.05, hP: 74.05, cI: 68.02 }

// ============================================================================
// 化学式解析
// ============================================================================

/** 将 Unicode 下标数字转为 ASCII，如 H₂O → H2O */
function normalizeSubscripts(s) {
  return s.replace(/[₀-₉]/g, (ch) => String(ch.charCodeAt(0) - 0x2080))
}

/**
 * 解析化学式，返回各元素原子数。支持嵌套括号，如 [(NH₂)₂CO]₂。
 * @param {string} formula
 * @returns {Record<string, number>}
 */
function parseFormula(formula) {
  const s = normalizeSubscripts(formula)
  const counts = {}

  function merge(target, source, mult) {
    for (const [el, n] of Object.entries(source)) {
      target[el] = (target[el] || 0) + n * mult
    }
  }

  function expand(str) {
    const out = {}
    let i = 0
    while (i < str.length) {
      const ch = str[i]
      if (ch === '(' || ch === '[') {
        // 找到配对的右括号（同时跟踪两种括号的嵌套深度）
        let depth = 1
        let j = i + 1
        while (j < str.length && depth > 0) {
          if (str[j] === '(' || str[j] === '[') depth++
          else if (str[j] === ')' || str[j] === ']') depth--
          if (depth === 0) break
          j++
        }
        const inner = str.slice(i + 1, j)
        // 读取组后的数字倍数
        let k = j + 1
        let num = ''
        while (k < str.length && /\d/.test(str[k])) num += str[k++]
        merge(out, expand(inner), num ? parseInt(num, 10) : 1)
        i = k
      } else if (/[A-Z]/.test(ch)) {
        let el = ch
        let j = i + 1
        if (j < str.length && /[a-z]/.test(str[j])) el += str[j++]
        let num = ''
        while (j < str.length && /\d/.test(str[j])) num += str[j++]
        out[el] = (out[el] || 0) + (num ? parseInt(num, 10) : 1)
        i = j
      } else {
        i++ // 跳过 ≫ 等非化学式字符
      }
    }
    return out
  }

  return expand(s)
}

// ============================================================================
// 校验逻辑
// ============================================================================

/** results: 问题列表 {level: 'error'|'warn', crystal, message} */
const problems = []

function report(level, crystal, message) {
  problems.push({ level, crystal, message })
}

/**
 * 统一 coordination 格式：
 *   有经典配位数 → 「元素:配位数(配位原子)」，多项以 '; ' 分隔
 *   分子晶体     → 「无经典配位数（…）」
 */
function checkCoordinationFormat(crystal, value) {
  const MOLECULAR = /^无经典配位数（.+）$/
  if (MOLECULAR.test(value)) return
  const parts = value.split('; ')
  for (const part of parts) {
    if (!/^[^:]+:\d+\(.+\)$/.test(part)) {
      report('error', crystal, `coordination 格式不合规：「${part}」（应为「元素:配位数(配位原子)」）`)
    }
  }
}

/** 校验单个晶体数据对象的全部检查项 */
function checkCrystal(crystal, d) {
  const atoms = d.atoms || []
  const cellCounts = {}
  for (const a of atoms) {
    cellCounts[a.element] = (cellCounts[a.element] || 0) + a.positions.length
  }
  const cellTotal = Object.values(cellCounts).reduce((s, n) => s + n, 0)

  // --- 1. latticeType 格式与点阵点数 ---
  const m = /\(([a-z])([A-Z])\)/.exec(d.latticeType || '')
  if (!m) {
    report('error', crystal, `latticeType 无法解析点阵记号：${d.latticeType}`)
    return
  }
  const code = m[1] + m[2]
  const points = LATTICE_POINTS[code]
  if (points === undefined) {
    report('warn', crystal, `未知点阵记号 ${code}，无法校验点阵点数`)
  }

  // --- 2. 点阵记号 vs 空间群首字母 ---
  const sg = String(d.spaceGroup || '')
  const expect = SG_TO_LATTICE[sg[0]]
  if (expect && expect !== m[2]) {
    report('error', crystal,
      `点阵型式与空间群不符：latticeType 记号为 ${m[2]}，但空间群 ${sg} 首字母为 ${sg[0]}`)
  }

  // --- 3. 结构基元自洽性：结构基元原子数 × 点阵点数 == 晶胞原子数 ---
  if (points !== undefined && d.structuralUnit) {
    const unitCounts = parseFormula(d.structuralUnit)
    const unitElements = Object.keys(unitCounts).sort().join(',')
    const cellElements = Object.keys(cellCounts).sort().join(',')
    if (unitElements !== cellElements) {
      report('error', crystal,
        `结构基元与晶胞的元素种类不符：基元为 [${unitElements}]，晶胞为 [${cellElements}]`)
    } else {
      for (const el of Object.keys(unitCounts)) {
        const expected = unitCounts[el] * points
        if (expected !== cellCounts[el]) {
          report('error', crystal,
            `结构基元自洽性不通过：${el} 应为 ${unitCounts[el]} × ${points}(点阵点) = ${expected}，` +
            `但晶胞实际含 ${cellCounts[el]} 个。请核对 structuralUnit 取值`)
        }
      }
    }
  }

  // --- 4. 化学式与原子组成一致 ---
  if (d.formula) {
    const fCounts = parseFormula(d.formula)
    const fElements = Object.keys(fCounts).filter((e) => fCounts[e] > 0).sort().join(',')
    const cElements = Object.keys(cellCounts).sort().join(',')
    if (fElements !== cElements) {
      report('warn', crystal,
        `formula 与 atoms 的元素种类不一致：formula 为 [${fElements}]，atoms 为 [${cElements}]`)
    }
  }

  // --- 5. coordination 格式 ---
  checkCoordinationFormat(crystal, String(d.coordination || ''))

  // --- 6. 空间利用率交叉校验 ---
  if (d.spaceUtilization) {
    const known = SPACE_UTILIZATION[code]
    const actual = parseFloat(String(d.spaceUtilization).replace('%', ''))
    if (known !== undefined && Math.abs(actual - known) > 1) {
      report('error', crystal,
        `空间利用率与点阵型式不符：${code} 应为 ${known}%，数据为 ${d.spaceUtilization}`)
    }
  }

  // --- 7. 分数坐标范围 ---
  for (const a of atoms) {
    for (const p of a.positions) {
      if (p.some((v) => v < 0 || v >= 1)) {
        report('warn', crystal, `原子 ${a.element} 的分数坐标超出 [0,1)：[${p}]`)
        break
      }
    }
  }

  // --- 8. 晶胞非空 ---
  if (cellTotal === 0) report('error', crystal, '晶胞中没有任何原子')
}

// ============================================================================
// 主流程
// ============================================================================

function loadCrystal(dir, file) {
  const text = readFileSync(join(ROOT, dir, file), 'utf-8')
  // 剥离模块语法，得到纯对象字面量
  const body = text
    .replace(/^\s*export\s+default\s*/, '')
    .replace(/^\s*module\.exports\s*=\s*/, '')
    .replace(/;\s*$/, '')
  return { data: eval(`(${body})`), body } // eslint-disable-line no-eval
}

function main() {
  // --- 副本存在性 ---
  for (const c of COPIES) {
    if (!existsSync(join(ROOT, c.dir))) {
      console.log(`✗ 副本目录不存在：${c.dir}`)
      process.exit(1)
    }
  }

  // --- 副本一致性 ---
  const baseDir = COPIES[0].dir
  const files = readdirSync(join(ROOT, baseDir)).filter((f) => f.endsWith('.js')).sort()
  let mismatch = 0
  for (const f of files) {
    const bodies = COPIES.map((c) => loadCrystal(c.dir, f).body.replace(/\s/g, ''))
    if (new Set(bodies).size !== 1) {
      report('error', f.replace('.js', ''), '三份副本内容不一致')
      mismatch++
    }
  }

  // --- 逐晶体校验 ---
  for (const f of files) {
    const { data } = loadCrystal(baseDir, f)
    checkCrystal(f.replace('.js', ''), data)
  }

  // --- 输出报告 ---
  const errors = problems.filter((p) => p.level === 'error')
  const warns = problems.filter((p) => p.level === 'warn')

  console.log('═'.repeat(70))
  console.log(`晶体数据自检报告`)
  console.log('═'.repeat(70))
  console.log(`晶体总数：${files.length}`)
  console.log(`副本一致性：${mismatch === 0 ? '✓ 三份完全一致' : `✗ ${mismatch} 个文件不一致`}`)

  if (errors.length) {
    console.log(`\n【必须修复 ${errors.length} 项】`)
    for (const p of errors) console.log(`  ✗ [${p.crystal}] ${p.message}`)
  }
  if (warns.length) {
    console.log(`\n【提示 ${warns.length} 项】`)
    for (const p of warns) console.log(`  ! [${p.crystal}] ${p.message}`)
  }
  if (!errors.length && !warns.length) {
    console.log('\n✓ 全部检查项通过')
  }
  console.log('═'.repeat(70))

  process.exit(errors.length ? 1 : 0)
}

main()
