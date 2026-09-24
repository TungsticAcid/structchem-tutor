/**
 * 群操作生成与原子轨道/稳定化子计算（需求11）
 * 由点群的对称元素生成完整对称操作矩阵集，作用于原子，求：
 *  - orbit（轨道）：该原子在群作用下的等价原子集合（群论概念，非量子化学）
 *  - stabilizer（稳定化子）：保持该原子不动的对称操作子群
 */
import {
  identityMatrix, rotationMatrix, reflectionMatrix, inversionMatrix, improperRotationMatrix,
  matMul, isSymmetryOperation, applyMatrix, distance, normalize
} from './operations.js'

/** 原子质心平移至原点（纯位置平均值） */
function centroidAtoms(atoms) {
  const n = atoms.length
  let cx = 0, cy = 0, cz = 0
  for (const a of atoms) { cx += a.xyz[0]; cy += a.xyz[1]; cz += a.xyz[2] }
  cx /= n; cy /= n; cz /= n
  return atoms.map(a => ({ element: a.element, xyz: [a.xyz[0] - cx, a.xyz[1] - cy, a.xyz[2] - cz] }))
}

/** 矩阵行列式（3×3 行优先） */
function det3(m) {
  return m[0] * (m[4] * m[8] - m[5] * m[7])
    - m[1] * (m[3] * m[8] - m[5] * m[6])
    + m[2] * (m[3] * m[7] - m[4] * m[6])
}

/** 矩阵迹（3×3） */
function trace3(m) { return m[0] + m[4] + m[8] }

/** 矩阵 k 次幂（连续乘法） */
function matPow(m, k) {
  let r = identityMatrix()
  for (let i = 0; i < k; i++) r = matMul(m, r)
  return r
}

/** 由矩阵推断对称操作名（用于稳定化子展示：E / Cn / σ / i / Sn） */
function opName(m) {
  const det = det3(m)
  const tr = trace3(m)
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  if (det > 0) {
    const ang = Math.acos(clamp((tr - 1) / 2, -1, 1))
    if (ang < 1e-6) return 'E'
    const order = Math.round(2 * Math.PI / ang)
    return 'C' + order
  } else {
    if (Math.abs(tr - 1) < 1e-6) return 'σ'
    if (Math.abs(tr + 3) < 1e-6) return 'i'
    const n = Math.round(2 * Math.PI / Math.acos(clamp((tr + 1) / 2, -1, 1)))
    return 'S' + n
  }
}

/**
 * 生成点群的完整对称操作集合（真正作用于原子的操作，去重）
 * @param {Array} atoms - [{ element, xyz }]
 * @param {Array} elements - 识别出的对称元素 [{ type, order, axis }]
 * @param {number} tol - 位置容差
 * @returns {Array<{matrix:number[], name:string}>}
 */
export function generateGroupOperations(atoms, elements, tol = 0.15) {
  const cAtoms = centroidAtoms(atoms)
  const candidates = []
  const seen = new Set()
  const add = (m, elementIndex) => {
    const key = m.map(v => Math.round(v * 1000)).join(',')
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({ matrix: m, elementIndex })
  }

  add(identityMatrix(), -1)

  // 各轴向各幂次旋转 / 旋反（记录来源对称元素索引）
  elements.forEach((el, idx) => {
    if (!el.axis) return
    if (el.type.startsWith('C') && el.order && el.order !== Infinity) {
      for (let k = 1; k < el.order; k++) add(rotationMatrix(el.axis, 2 * Math.PI * k / el.order), idx)
    } else if (el.type.startsWith('S') && el.order && el.order !== Infinity) {
      // S_n 作为群元的阶：n 偶为 n，n 奇为 2n（如 S₃ 的幂含 S₃³=i、S₃⁵=S₃⁻¹）
      const sOrder = el.order % 2 === 0 ? el.order : 2 * el.order
      const sn = improperRotationMatrix(el.axis, el.order)
      for (let k = 1; k < sOrder; k++) add(matPow(sn, k), idx)
    }
  })
  // 反映面
  elements.forEach((el, idx) => { if (el.type.startsWith('sigma') && el.axis) add(reflectionMatrix(el.axis), idx) })
  // 反演中心
  elements.forEach((el, idx) => { if (el.type === 'i') add(inversionMatrix(), idx) })

  // 过滤为真正对称操作，并命名
  return candidates
    .filter(c => isSymmetryOperation(cAtoms, c.matrix, tol))
    .map(c => ({ matrix: c.matrix, name: opName(c.matrix), elementIndex: c.elementIndex }))
}

/** 找与 p 距离最近、同元素、容差内的原子索引 */
function nearestAtom(atoms, p, element, tol) {
  let best = -1, bestD = tol
  for (let j = 0; j < atoms.length; j++) {
    if (atoms[j].element !== element) continue
    const d = distance(p, atoms[j].xyz)
    if (d < bestD) { bestD = d; best = j }
  }
  return best
}

/**
 * 求某原子的轨道（等价位置）
 * @returns {number[]} 等价原子索引数组
 */
export function orbit(atoms, ops, index, tol = 0.15) {
  const cAtoms = centroidAtoms(atoms)
  const set = new Set([index])
  for (const op of ops) {
    const p = applyMatrix(op.matrix, cAtoms[index].xyz)
    const j = nearestAtom(cAtoms, p, cAtoms[index].element, tol)
    if (j >= 0) set.add(j)
  }
  return Array.from(set).sort((a, b) => a - b)
}

/** 数字→Unicode 下标（C₂/C₃/S₄） */
function subNum(n) {
  const m = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' }
  return String(n).split('').map(c => m[c] || c).join('')
}

/** 群元专业名（E 或按信息面板中的对称元素命名，含序号）：σᵥ(1)/σd/C₂′(2)/σᵥ(xz)等 */
function professionalOpName(op, elements) {
  if (op.elementIndex === undefined || op.elementIndex < 0) return 'E'
  const elem = elements[op.elementIndex]
  if (!op.name) return 'E'
  const elLabel = (elem && elem.label) || (elem && elem.name) || ''
  if (op.name.startsWith('C')) {
    const o = parseInt(op.name.slice(1), 10)
    if (elem && elem.order === o && elLabel) return elLabel      // 同阶时用面板名（保留序号/撇/C₂(x)）
    return 'C' + subNum(o)                                       // 幂次按操作阶（C₆²=C₃）
  }
  if (op.name === 'σ') return elLabel || 'σ'
  if (op.name === 'i') return 'i'
  if (op.name.startsWith('S')) return 'S' + subNum(parseInt(op.name.slice(1), 10))
  return op.name
}

/**
 * 求某原子的稳定化子（保持不动的操作子群）
 * @param {Array} elements - 对称元素数组（含 refine 后的 name，用于 σᵥ/σd 专业名）
 * @returns {{ indexSet: Set<number>, names: string[] }} 保持该原子的对称元素索引集合 + 专业群元名列表
 */
export function stabilizer(atoms, ops, index, elements = [], tol = 0.15) {
  const cAtoms = centroidAtoms(atoms)
  const indexSet = new Set()
  const names = []
  for (const op of ops) {
    const p = applyMatrix(op.matrix, cAtoms[index].xyz)
    if (distance(p, cAtoms[index].xyz) < tol) {
      names.push(professionalOpName(op, elements))
      if (op.elementIndex !== undefined && op.elementIndex >= 0) indexSet.add(op.elementIndex)
    }
  }
  return { indexSet, names }
}
