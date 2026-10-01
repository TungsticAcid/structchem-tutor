/**
 * 惯性工具模块（点群识别与对称元素生成共用，避免对称检测↔点群判定的循环依赖）
 * 提供：质心平移+质量提取、惯性矩张量、Jacobi 特征分解、线性判定、惯量主轴。
 */
import { ELEMENTS } from '../../../packages/knowledge/shared/elements.js'

/** 默认位置容差（Å），用于对称操作判定 */
export const DEFAULT_TOL = 0.15

/**
 * 从分子结构提取原子（含质量），并平移到质心（原点）
 * @param {Object} molecule - 分子结构（{ atoms: [{element, xyz}] }）
 * @returns {Array<{element:string, xyz:number[], mass:number}>}
 */
export function extractAtomsCentered(molecule) {
  const raw = molecule.atoms.map(a => {
    const el = ELEMENTS[a.element]
    const mass = el ? el.atomicMass : 1.0
    return { element: a.element, xyz: [...a.xyz], mass }
  })
  const n = raw.length
  const c = [0, 0, 0]
  for (const a of raw) { c[0] += a.xyz[0]; c[1] += a.xyz[1]; c[2] += a.xyz[2] }
  const centroid = [c[0] / n, c[1] / n, c[2] / n]
  return raw.map(a => ({ ...a, xyz: [a.xyz[0] - centroid[0], a.xyz[1] - centroid[1], a.xyz[2] - centroid[2]] }))
}

/**
 * 计算惯性矩张量（质量加权，返回 3×3 行优先数组）
 * @param {Array} atoms - [{ element, xyz, mass }]
 * @returns {number[]} 3×3 行优先对称矩阵
 */
export function inertiaTensor(atoms) {
  let Ixx = 0, Iyy = 0, Izz = 0, Ixy = 0, Ixz = 0, Iyz = 0
  for (const a of atoms) {
    const [x, y, z] = a.xyz
    const m = a.mass
    Ixx += m * (y * y + z * z)
    Iyy += m * (x * x + z * z)
    Izz += m * (x * x + y * y)
    Ixy -= m * x * y
    Ixz -= m * x * z
    Iyz -= m * y * z
  }
  return [Ixx, Ixy, Ixz, Ixy, Iyy, Iyz, Ixz, Iyz, Izz]
}

/**
 * 3×3 对称矩阵的 Jacobi 特征分解
 * @param {number[]} A - 3×3 行优先对称矩阵
 * @returns {{ values: number[], vectors: number[][] }} 特征值（升序）与对应特征向量（列）
 */
export function jacobiEigen(A) {
  const a = [...A]
  // 特征向量初始为单位矩阵（列向量）
  const V = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  const MAX_ITER = 100

  for (let iter = 0; iter < MAX_ITER; iter++) {
    // 找最大非对角元素（上三角）
    let p = 0, q = 1
    let max = Math.abs(a[1])
    if (Math.abs(a[2]) > max) { max = Math.abs(a[2]); p = 0; q = 2 }
    if (Math.abs(a[5]) > max) { max = Math.abs(a[5]); p = 1; q = 2 }
    if (max < 1e-12) break

    const app = a[p * 3 + p]
    const aqq = a[q * 3 + q]
    const apq = a[p * 3 + q]

    // 旋转角
    const theta = 0.5 * Math.atan2(2 * apq, aqq - app)
    const c = Math.cos(theta)
    const s = Math.sin(theta)

    // 更新 a 的对角与非对角元素
    a[p * 3 + p] = c * c * app - 2 * s * c * apq + s * s * aqq
    a[q * 3 + q] = s * s * app + 2 * s * c * apq + c * c * aqq
    a[p * 3 + q] = 0
    a[q * 3 + p] = 0

    for (let k = 0; k < 3; k++) {
      if (k === p || k === q) continue
      const akp = a[k * 3 + p]
      const akq = a[k * 3 + q]
      a[k * 3 + p] = c * akp - s * akq
      a[p * 3 + k] = a[k * 3 + p]
      a[k * 3 + q] = s * akp + c * akq
      a[q * 3 + k] = a[k * 3 + q]
    }

    // 更新特征向量
    for (let i = 0; i < 3; i++) {
      const vip = V[i * 3 + p]
      const viq = V[i * 3 + q]
      V[i * 3 + p] = c * vip - s * viq
      V[i * 3 + q] = s * vip + c * viq
    }
  }

  // 提取特征值与特征向量（列）
  const eig = [0, 1, 2].map(i => ({ value: a[i * 3 + i], vector: [V[i], V[3 + i], V[6 + i]] }))
  eig.sort((x, y) => x.value - y.value)
  return { values: eig.map(e => e.value), vectors: eig.map(e => e.vector) }
}

/**
 * 判断分子是否线性（最小惯量远小于最大惯量）
 * @param {number[]} inertiaValues - 三个特征值（升序）
 * @returns {boolean}
 */
export function isLinear(inertiaValues) {
  const [i1, , i3] = inertiaValues
  return i3 > 1e-9 && i1 / i3 < 0.01
}

/**
 * 计算分子惯量主轴（特征值升序 + 对应主轴方向）
 * @param {Object} molecule - 分子结构
 * @returns {{ values: number[], vectors: number[][] }} 主轴（v1=最小惯量轴，v3=最大惯量轴）
 */
export function principalAxes(molecule) {
  const atoms = extractAtomsCentered(molecule)
  return jacobiEigen(inertiaTensor(atoms))
}
