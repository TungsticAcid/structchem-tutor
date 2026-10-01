/**
 * 对称操作模块
 * 提供 3D 向量/矩阵运算、旋转/反映/反演/旋反操作的矩阵表示，
 * 以及"某操作是否为分子对称操作"的判定（双射匹配）。
 */

import { singleElementName } from './elementNaming.js'

// ==================== 向量运算 ====================

/** 向量点积 */
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/** 向量叉积 */
export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

/** 向量模长 */
export function norm(a) {
  return Math.sqrt(dot(a, a))
}

/** 向量归一化（零向量返回 [0,0,0]） */
export function normalize(a) {
  const n = norm(a)
  if (n < 1e-12) return [0, 0, 0]
  return [a[0] / n, a[1] / n, a[2] / n]
}

/** 两点欧氏距离 */
export function distance(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

// ==================== 矩阵运算 ====================

/** 矩阵乘向量（3×3 行优先 × 3 向量） */
export function applyMatrix(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
  ]
}

/** 矩阵乘矩阵（两个 3×3 行优先，返回行优先扁平数组） */
export function matMul(A, B) {
  const r = new Array(9)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = A[i * 3 + 0] * B[0 * 3 + j] + A[i * 3 + 1] * B[1 * 3 + j] + A[i * 3 + 2] * B[2 * 3 + j]
    }
  }
  return r
}

/** 3×3 单位矩阵 */
export function identityMatrix() {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1]
}

// ==================== 对称操作矩阵 ====================

/**
 * 绕任意轴旋转的旋转矩阵（Rodrigues 公式）
 * @param {number[]} axis - 旋转轴单位向量
 * @param {number} angle - 旋转角（弧度）
 * @returns {number[]} 3×3 行优先矩阵
 */
export function rotationMatrix(axis, angle) {
  const [x, y, z] = normalize(axis)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const t = 1 - c
  return [
    t * x * x + c,       t * x * y - s * z,   t * x * z + s * y,
    t * x * y + s * z,   t * y * y + c,       t * y * z - s * x,
    t * x * z - s * y,   t * y * z + s * x,   t * z * z + c
  ]
}

/**
 * 反映矩阵（关于法向量为 normal、过原点的平面）
 * M = I - 2·n·nᵀ
 * @param {number[]} normal - 平面法向量（会自动归一化）
 * @returns {number[]} 3×3 行优先矩阵
 */
export function reflectionMatrix(normal) {
  const [x, y, z] = normalize(normal)
  return [
    1 - 2 * x * x, -2 * x * y,    -2 * x * z,
    -2 * x * y,    1 - 2 * y * y, -2 * y * z,
    -2 * x * z,    -2 * y * z,    1 - 2 * z * z
  ]
}

/** 反演矩阵（中心反演，I = -Identity） */
export function inversionMatrix() {
  return [-1, 0, 0, 0, -1, 0, 0, 0, -1]
}

/**
 * 旋反操作矩阵（绕轴旋转 2π/n 后关于垂直平面反映）
 * Sn = σh · Cn（σh 法向量与轴同向）
 * @param {number[]} axis - 轴单位向量
 * @param {number} n - 阶数
 * @returns {number[]} 矩阵
 */
export function improperRotationMatrix(axis, n) {
  const rot = rotationMatrix(axis, 2 * Math.PI / n)
  const refl = reflectionMatrix(axis)
  return matMul(refl, rot)
}

// ==================== 对称操作检测 ====================

/**
 * 检测某变换矩阵是否为原子集合的对称操作
 * 判定：变换后每个原子都能（同元素、容差内）双射匹配到原始原子
 * @param {Array} atoms - [{ element, xyz }]
 * @param {number[]} matrix - 3×3 变换矩阵
 * @param {number} tol - 位置容差（Å）
 * @returns {boolean}
 */
export function isSymmetryOperation(atoms, matrix, tol = 0.15) {
  const n = atoms.length
  const used = new Array(n).fill(false)

  for (let i = 0; i < n; i++) {
    const tp = applyMatrix(matrix, atoms[i].xyz)
    let bestJ = -1
    let bestDist = tol
    for (let j = 0; j < n; j++) {
      if (used[j] || atoms[j].element !== atoms[i].element) continue
      const d = distance(tp, atoms[j].xyz)
      if (d < bestDist) {
        bestDist = d
        bestJ = j
      }
    }
    if (bestJ < 0) return false
    used[bestJ] = true
  }
  return true
}

/**
 * 检测绕某轴的旋转是否构成对称操作
 * @param {Array} atoms
 * @param {number[]} axis - 轴单位向量
 * @param {number} n - 旋转阶数（绕轴转 2π/n）
 * @param {number} tol
 * @returns {boolean}
 */
export function isRotation(atoms, axis, n, tol = 0.15) {
  return isSymmetryOperation(atoms, rotationMatrix(axis, 2 * Math.PI / n), tol)
}

/**
 * 检测关于某法向平面的反映是否构成对称操作
 * @param {Array} atoms
 * @param {number[]} normal - 平面法向量
 * @param {number} tol
 * @returns {boolean}
 */
export function isReflection(atoms, normal, tol = 0.15) {
  return isSymmetryOperation(atoms, reflectionMatrix(normal), tol)
}

/**
 * 检测中心反演是否构成对称操作
 * @param {Array} atoms
 * @param {number} tol
 * @returns {boolean}
 */
export function isInversion(atoms, tol = 0.15) {
  return isSymmetryOperation(atoms, inversionMatrix(), tol)
}

/**
 * 检测绕某轴的旋反操作（Sn）是否构成对称操作
 * @param {Array} atoms
 * @param {number[]} axis
 * @param {number} n
 * @param {number} tol
 * @returns {boolean}
 */
export function isImproperRotation(atoms, axis, n, tol = 0.15) {
  return isSymmetryOperation(atoms, improperRotationMatrix(axis, n), tol)
}

/**
 * 在给定轴上检测最高阶旋转轴
 * 依次测试 n = maxOrder, maxOrder-1, ..., 2，返回第一个成立的 n（含旋转本身与恒等）
 * @param {Array} atoms
 * @param {number[]} axis
 * @param {number} maxOrder - 最高测试阶数
 * @param {number} tol
 * @returns {number} 最高阶 n（1 表示无真旋转轴，仅恒等）
 */
export function findHighestRotationOrder(atoms, axis, maxOrder = 6, tol = 0.15) {
  for (let n = maxOrder; n >= 2; n--) {
    if (isRotation(atoms, axis, n, tol)) return n
  }
  return 1
}

// ==================== 空间群操作 → 对称元素 ====================

/** 3×3 矩阵行列式（行优先） */
export function det3(m) {
  return m[0] * (m[4] * m[8] - m[5] * m[7])
    - m[1] * (m[3] * m[8] - m[5] * m[6])
    + m[2] * (m[3] * m[7] - m[4] * m[6])
}

/** 3×3 矩阵迹 */
export function trace3(m) {
  return m[0] + m[4] + m[8]
}

/** 判断是否为近似单位矩阵 */
function isIdentityMatrix(m, tol = 1e-6) {
  return Math.abs(m[0] - 1) < tol && Math.abs(m[4] - 1) < tol && Math.abs(m[8] - 1) < tol &&
    Math.abs(m[1]) < tol && Math.abs(m[2]) < tol && Math.abs(m[3]) < tol &&
    Math.abs(m[5]) < tol && Math.abs(m[6]) < tol && Math.abs(m[7]) < tol
}

/**
 * 从旋转矩阵推导旋转轴与角度
 * @param {number[]} m - 3×3 行优先旋转矩阵
 * @returns {{axis:number[], angle:number}|null}
 */
export function rotationToAxisAngle(m) {
  const tr = trace3(m)
  const cos = Math.max(-1, Math.min(1, (tr - 1) / 2))
  const angle = Math.acos(cos)
  if (angle < 1e-6) return null  // 恒等

  let axis
  if (Math.abs(angle - Math.PI) < 1e-6) {
    // 180° 旋转：R = 2uuᵀ - I，从对角线得 |u_i|，非对角元定符号
    let x = Math.sqrt(Math.max(0, (m[0] + 1) / 2))
    let y = Math.sqrt(Math.max(0, (m[4] + 1) / 2))
    let z = Math.sqrt(Math.max(0, (m[8] + 1) / 2))
    if (x > 1e-6) {
      if (m[1] < 0) y = -y  // R_xy = 2 x y
      if (m[2] < 0) z = -z  // R_xz = 2 x z
    } else if (y > 1e-6) {
      if (m[5] < 0) z = -z  // R_yz = 2 y z（x=0 时）
    }
    axis = normalize([x, y, z])
  } else {
    // 一般情况：轴 = 反对称部分
    axis = normalize([m[7] - m[5], m[2] - m[6], m[3] - m[1]])
  }
  return { axis, angle }
}

/** 精化反映面法向量符号（利用非对角元 R_ij = -2 n_i n_j） */
export function refineNormal(m) {
  const abs = [
    Math.sqrt(Math.max(0, (1 - m[0]) / 2)),
    Math.sqrt(Math.max(0, (1 - m[4]) / 2)),
    Math.sqrt(Math.max(0, (1 - m[8]) / 2))
  ]
  const n = [...abs]
  // R = I - 2nnᵀ，R_ij = -2 n_i n_j（i≠j），用非对角元确定相对符号
  if (abs[0] > 1e-6) {
    if (m[1] > 0) n[1] = -n[1]  // R_xy > 0 → n_x n_y < 0
    if (m[2] > 0) n[2] = -n[2]
  } else if (abs[1] > 1e-6) {
    if (m[5] > 0) n[2] = -n[2]  // R_yz > 0 → n_y n_z < 0（n_x=0 时）
  }
  return normalize(n)
}

/** 两向量夹角（弧度，含反向判断时取较小者） */
function angleBetween(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const na = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
  const nb = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2])
  if (na < 1e-12 || nb < 1e-12) return 0
  return Math.acos(Math.max(-1, Math.min(1, dot / (na * nb))))
}

/**
 * 方向聚类去重（含反向），每个方向保留最高阶项
 * @param {Array} items - [{ axis, type, order }]
 * @param {number} angleTol - 角度容差（弧度）
 * @returns {Array} 聚类后每类保留最高阶的项
 */
function clusterMaxOrder(items, angleTol = 1e-3) {
  const clusters = []
  for (const item of items) {
    let found = false
    for (const c of clusters) {
      const d = Math.min(angleBetween(item.axis, c.axis), angleBetween(item.axis, c.axis.map(v => -v)))
      if (d < angleTol) {
        found = true
        if (item.order > c.order) {
          c.order = item.order
          c.type = item.type
          c.axis = item.axis
        }
        break
      }
    }
    if (!found) clusters.push({ axis: [...item.axis], type: item.type, order: item.order })
  }
  return clusters
}

/** 方向聚类去重（含反向），返回代表方向 */
function clusterDirections(dirs, angleTol = 1e-3) {
  const clusters = []
  for (const dir of dirs) {
    let found = false
    for (const c of clusters) {
      const d = Math.min(angleBetween(dir, c), angleBetween(dir, c.map(v => -v)))
      if (d < angleTol) { found = true; break }
    }
    if (!found) clusters.push([...dir])
  }
  return clusters
}

/**
 * 从空间群对称操作推导点群级对称元素（忽略平移分量）
 * 旋转轴 Cn 与旋反轴 Sn 分别聚类去重，同一方向保留最高阶
 * @param {Array} operations - [{ rotation: number[9], translation: number[3] }]
 * @returns {Array<{type, order, axis}>}
 */
export function operationsToSymmetryElements(operations) {
  const rotations = []   // 旋转轴 { axis, type, order }
  const improper = []    // 旋反轴 { axis, type, order }
  const normals = []     // 反映面法向量
  let hasInversion = false

  for (const op of operations) {
    const m = op.rotation
    if (isIdentityMatrix(m)) continue

    const det = det3(m)
    const tr = trace3(m)

    if (det > 0) {
      // 纯旋转 Cn
      const r = rotationToAxisAngle(m)
      if (!r) continue
      const order = Math.round(2 * Math.PI / r.angle)
      if (order >= 2) rotations.push({ axis: r.axis, type: `C${order}`, order })
    } else {
      if (Math.abs(tr - 1) < 1e-6) {
        // 反映（det=-1, trace=1）
        normals.push(refineNormal(m))
      } else if (Math.abs(tr + 3) < 1e-6) {
        // 反演（det=-1, trace=-3）
        hasInversion = true
      } else {
        // 旋反 Sn：trace = 2cos(2π/n) - 1 → n = 2π / acos((trace+1)/2)
        const cosVal = (tr + 1) / 2
        const n = Math.round(2 * Math.PI / Math.acos(Math.max(-1, Math.min(1, cosVal))))
        if (n >= 3) {
          const r = rotationToAxisAngle(m.map(v => -v))
          if (r) improper.push({ axis: r.axis, type: `S${n}`, order: n })
        }
      }
    }
  }

  const elements = []
  for (const a of clusterMaxOrder(rotations)) elements.push({ type: a.type, order: a.order, axis: a.axis })
  for (const a of clusterMaxOrder(improper)) elements.push({ type: a.type, order: a.order, axis: a.axis })
  for (const n of clusterDirections(normals)) elements.push({ type: 'sigma', order: 1, axis: n })
  if (hasInversion) elements.push({ type: 'i', order: 1, axis: null })
  return assignLabels(elements)
}

// ==================== 对称元素标签记法 ====================

/**
 * 为对称元素分配专业记法标签
 * 单元素名（Unicode 下标），不区分同一共轭类内多个元素（不加撇）
 * @param {Array} elements - [{ type, ... }]
 * @returns {Array} 带 label/labelPlain 字段的元素数组
 */
export function assignLabels(elements) {
  // 同共轭类（按 type 近似）多个元素时，名称后加 (1)(2)… 序号；单个不加
  const countByType = {}
  for (const el of elements) countByType[el.type] = (countByType[el.type] || 0) + 1
  const seenByType = {}
  return elements.map(el => {
    const base = singleElementName(el.type)
    const total = countByType[el.type] || 1
    let label = base
    if (total > 1) {
      const k = (seenByType[el.type] || 0) + 1
      seenByType[el.type] = k
      label = `${base}(${k})`
    }
    return { ...el, label, labelPlain: base }
  })
}
