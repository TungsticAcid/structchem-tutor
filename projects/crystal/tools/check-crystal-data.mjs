/**
 * 晶体数据自检脚本
 *
 * 用途：每次增删晶体或修改数据后运行，校验数据自洽性与格式合规性。
 * 运行：node projects/crystal/tools/check-crystal-data.mjs
 *       （可从仓库任意位置运行——路径以脚本自身位置为锚点）
 *
 * 设计说明：
 *   脚本用**自身所在位置**解析数据路径，不依赖 process.cwd()。
 *
 * 历史与现状：
 *   原脚本同时校验三份副本（H5 版 + 小程序两份），因为三者内容必须一致。
 *   两套微信小程序已于 2026-09-24 从本仓库移除，故**「副本一致性」检查已废止**
 *   —— 晶体数据现存唯一 JS 源。上游权威源（23 个 CIF）在
 *   modules/crystal/data/cod/。
 *
 * 背景：见 activity/数据核查报告.md 与 modules/crystal/data/cod/COD_COMPARISON_REPORT.md。
 *      数据中曾发现若干自洽性问题（如石英的结构基元误写为方石英的值、
 *      wurtzite 的结构基元错误），故建立此自动检查。
 *
 * TODO（阶段 B7 单源化时）：增加「JS 数据 ↔ 上游 CIF」的交叉校验。
 *   今天检查项只校验数据**自洽**，不校验数据**正确**——三副本一致性检查更是
 *   只保证三份一样。有了 CIF 上游，才有可能把校验从「自洽」提升到「对得上」。
 */
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

// ============================================================================
// 配置
// ============================================================================

/** 晶体数据目录（相对 ROOT）。现存唯一 JS 源 */
const SOURCE = 'H5/src/data/crystals'

/**
 * 脚本所在目录的上一级，即 projects/crystal/。
 * 用脚本自身位置而非 process.cwd()，否则从别的目录运行会找不到数据
 * （这正是原实现的缺陷：从仓库根运行会报「副本目录不存在」）。
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url))

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

function loadCrystal(file) {
  const text = readFileSync(join(ROOT, SOURCE, file), 'utf-8')
  // 剥离模块语法，得到纯对象字面量
  const body = text
    .replace(/^\s*export\s+default\s*/, '')
    .replace(/^\s*module\.exports\s*=\s*/, '')
    .replace(/;\s*$/, '')
  return { data: eval(`(${body})`), body } // eslint-disable-line no-eval
}

function main() {
  // --- 数据目录存在性 ---
  // 打印解析后的绝对路径，便于诊断路径问题（而不是只报一个相对路径）
  const dataDir = join(ROOT, SOURCE)
  if (!existsSync(dataDir)) {
    console.log(`✗ 晶体数据目录不存在：${dataDir}`)
    process.exit(1)
  }

  // --- 逐晶体校验 ---
  const files = readdirSync(dataDir).filter((f) => f.endsWith('.js')).sort()
  for (const f of files) {
    const { data } = loadCrystal(f)
    checkCrystal(f.replace('.js', ''), data)
  }

  // --- 输出报告 ---
  const errors = problems.filter((p) => p.level === 'error')
  const warns = problems.filter((p) => p.level === 'warn')

  console.log('═'.repeat(70))
  console.log(`晶体数据自检报告`)
  console.log('═'.repeat(70))
  console.log(`数据源：${SOURCE}`)
  console.log(`晶体总数：${files.length}`)

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
