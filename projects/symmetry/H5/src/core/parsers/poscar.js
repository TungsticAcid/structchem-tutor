/**
 * VASP POSCAR 文件解析器
 * 格式（VASP5）：
 *   <标题>
 *   <缩放因子>
 *   <a1> <a2> <a3>
 *   <b1> <b2> <b3>
 *   <c1> <c2> <c3>
 *   <元素1> <元素2> ...
 *   <数量1> <数量2> ...
 *   Direct | Cartesian
 *   <x> <y> <z>
 *   ...
 */
import { createCrystal, normalizeElement } from '../structure.js'

/** 3×3 矩阵求逆（行优先，返回行优先矩阵） */
function invertMatrix3(m) {
  const [a, b, c] = m[0]
  const [d, e, f] = m[1]
  const [g, h, i] = m[2]
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) return null
  const invDet = 1 / det
  return [
    [A * invDet, -(b * i - c * h) * invDet, (b * f - c * e) * invDet],
    [B * invDet, (a * i - c * g) * invDet, -(a * f - c * d) * invDet],
    [C * invDet, -(a * h - b * g) * invDet, (a * e - b * d) * invDet]
  ]
}

/** 向量长度 */
function vlen(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) }
/** 向量点积 */
function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }

/**
 * 由三个晶格基矢推导晶胞参数
 * @param {number[][]} vecs - 三个基矢（已乘缩放因子）
 * @returns {Object} { a, b, c, alpha, beta, gamma }
 */
function latticeFromVectors(vecs) {
  const [A, B, C] = vecs
  const a = vlen(A), b = vlen(B), c = vlen(C)
  const ang = (v1, v2) => {
    const cos = vdot(v1, v2) / (vlen(v1) * vlen(v2))
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI
  }
  return { a, b, c, alpha: ang(B, C), beta: ang(A, C), gamma: ang(A, B) }
}

/**
 * 解析 POSCAR 文本为晶体结构
 * @param {string} text - POSCAR 文件内容
 * @returns {Object} 晶体结构
 */
export function parsePOSCAR(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length < 8) throw new Error('POSCAR 行数不足')

  const title = lines[0]
  const scale = parseFloat(lines[1])
  if (isNaN(scale)) throw new Error('POSCAR 缩放因子无效')

  // 三个基矢
  const vecs = []
  for (let r = 0; r < 3; r++) {
    const parts = lines[2 + r].split(/\s+/).filter(Boolean).map(Number)
    if (parts.length < 3) throw new Error('POSCAR 基矢无效')
    vecs.push([parts[0] * scale, parts[1] * scale, parts[2] * scale])
  }

  // 元素行与数量行（VASP5）
  const elemLine = lines[5].split(/\s+/).filter(Boolean)
  const countLine = lines[6].split(/\s+/).filter(Boolean)
  const isVasp5 = elemLine.some(tok => /[A-Za-z]/.test(tok))
  if (!isVasp5) throw new Error('POSCAR 需为 VASP5 格式（含元素行）')

  const elements = elemLine.map(normalizeElement)
  const counts = countLine.map(Number)
  if (elements.length !== counts.length) throw new Error('POSCAR 元素与数量不匹配')

  // 坐标类型
  const coordMode = lines[7].toLowerCase()
  const isDirect = coordMode.startsWith('d') || coordMode.startsWith('f')
  const isCart = coordMode.startsWith('c') || coordMode.startsWith('k')

  const atoms = []
  const fracMatrix = invertMatrix3(vecs)
  let lineIdx = 8
  for (let ei = 0; ei < elements.length; ei++) {
    for (let n = 0; n < counts[ei]; n++) {
      if (lineIdx >= lines.length) break
      const parts = lines[lineIdx].split(/\s+/).filter(Boolean).map(Number)
      lineIdx++
      if (parts.length < 3) continue
      if (isDirect) {
        // 分数坐标归一化到 [0,1)
        atoms.push({
          element: elements[ei],
          frac: [((parts[0] % 1) + 1) % 1, ((parts[1] % 1) + 1) % 1, ((parts[2] % 1) + 1) % 1]
        })
      } else if (isCart && fracMatrix) {
        // 笛卡尔 → 分数：frac = cart · inv(M)
        const [x, y, z] = parts
        const fx = x * fracMatrix[0][0] + y * fracMatrix[1][0] + z * fracMatrix[2][0]
        const fy = x * fracMatrix[0][1] + y * fracMatrix[1][1] + z * fracMatrix[2][1]
        const fz = x * fracMatrix[0][2] + y * fracMatrix[1][2] + z * fracMatrix[2][2]
        atoms.push({
          element: elements[ei],
          frac: [((fx % 1) + 1) % 1, ((fy % 1) + 1) % 1, ((fz % 1) + 1) % 1]
        })
      } else {
        throw new Error('POSCAR 坐标类型无效或矩阵不可逆')
      }
    }
  }

  if (atoms.length === 0) throw new Error('POSCAR 未解析到原子')
  return createCrystal({ title, lattice: latticeFromVectors(vecs), atoms })
}
