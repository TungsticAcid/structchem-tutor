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
 * @returns {{ indexSet: Set<number>, names: string[], symbol?: string, count?: number, infinite?: boolean }}
 *          保持该原子的对称元素索引集合 + 专业群元名列表（+ 无限群时的群符号）
 */
export function stabilizer(atoms, ops, index, elements = [], tol = 0.15) {
  const cAtoms = centroidAtoms(atoms)
  const p0 = cAtoms[index].xyz

  /**
   * ★★ 无限群（C∞v / D∞h）必须**走封闭形式**，不能用有限代表元穷举。
   *
   *   用户报「C∞v 群原子的稳定化子是否应包含 C∞v」——答案是**应该**，而原先算错了：
   *   `generateGroupOperations` 对 `order === Infinity` 的 C∞ 轴**一个群元都不产生**
   *   （见本文件下方那条 `el.order !== Infinity` 的守卫），而 ∞σᵥ 只给一个代表面。
   *   于是这里只能在一个被截断的有限集合里筛，HCN 的三个原子都被算成 `{E, σᵥ}`（= Cs）。
   *
   *   正确的群论结论（线性分子）：
   *   · C∞v 的分子必为线性，**所有核都在 C∞ 轴上**（非平凡旋转的固定点集就是它的轴，
   *     每个核都要被所有 C∞ 旋转固定）⇒ 绕轴任意角度的旋转、任一含轴的 σᵥ
   *     都固定轴上每一点 ⇒ **每个原子的稳定化子都是整个 C∞v（阶 ∞）**。
   *     这就是教科书里的"位置对称性 = C∞v"。
   *   · D∞h 的**中心原子**（在 σh 面上）→ 整个 D∞h；**末端原子** → C∞v
   *     （σh / i / ∞C₂′ / S∞ 把末端原子映到**另一个**原子上，不属于它的稳定化子）。
   *   ★ 判据只认"原子是否在轴上"：轴外原子在 C∞v 下不可实现，所以只有这两支。
   */
  const cInf = elements.find((el) => el && el.type === 'C∞' && el.axis)
  if (cInf) {
    const ax = normalize(cInf.axis)
    // 原子到"过原点的轴"的距离
    const d = p0[0] * ax[0] + p0[1] * ax[1] + p0[2] * ax[2]
    const off = Math.hypot(p0[0] - d * ax[0], p0[1] - d * ax[1], p0[2] - d * ax[2])
    if (off < tol) {
      const hasInversion = elements.some((el) => el && el.type === 'i')
      const onSigmaH = Math.abs(d) < tol
      const infinite = hasInversion && onSigmaH
      const indexSet = new Set()
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        if (!el) continue
        const ty = el.type || ''
        // C∞ 与任一 σᵥ（含轴的平面）都固定**轴上每一点** ⇒ 无条件属于稳定化子
        if (ty === 'C∞' || ty === 'sigma_v') { indexSet.add(i); continue }
        // σh / i / S∞ / ∞C₂′ 只固定**中心原子**（落在 σh 面上的那个）：
        // 末端原子会被它们映到"另一个原子"上，不属于它的稳定化子。
        // （infinite 就是"有 i 且在 σh 面上"⇒ 中心原子）
        if (infinite) indexSet.add(i)
      }
      return {
        indexSet,
        names: [infinite ? 'D∞h' : 'C∞v'],
        symbol: infinite ? 'D∞h' : 'C∞v',
        count: Infinity,
        infinite: true,
      }
    }
  }

  const indexSet = new Set()
  const names = []
  for (const op of ops) {
    const p = applyMatrix(op.matrix, cAtoms[index].xyz)
    if (distance(p, cAtoms[index].xyz) < tol) {
      names.push(professionalOpName(op, elements))
      if (op.elementIndex !== undefined && op.elementIndex >= 0) indexSet.add(op.elementIndex)
    }
  }
  return { indexSet, names, count: names.length }
}
