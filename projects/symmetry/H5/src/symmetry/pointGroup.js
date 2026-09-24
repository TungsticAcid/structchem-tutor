/**
 * 分子点群识别模块
 * 流程：质心平移 → 线性分子判定 → 惯性矩特征分解 → 陀螺分类 → 对称元素检测 → 判定表归群
 * 算法参考 McUtils identify_point_group 与 pymatgen PointGroupAnalyzer
 */
import { ELEMENTS } from '../data/elements.js'
import {
  normalize, distance, dot,
  isRotation, isReflection, isInversion, isImproperRotation,
  findHighestRotationOrder, assignLabels, rotationMatrix, applyMatrix
} from './operations.js'
import { candidateAxisDirs, candidateMirrorNormals, detectAxisAt, detectAxisPair } from './detectElements.js'
import { POINT_GROUP_NAMES } from './groupTable.js'
import { generateSymmetryElements, linearSymmetryElements } from './symmetryElementGenerator.js'

/** 默认位置容差（Å），用于对称操作判定 */
const DEFAULT_TOL = 0.15

// ==================== 基础工具 ====================

/** 从分子结构提取原子（含质量），并平移到质心 */
function extractAtoms(molecule) {
  const atoms = molecule.atoms.map(a => {
    const el = ELEMENTS[a.element]
    const mass = el ? el.atomicMass : 1.0
    return { element: a.element, xyz: [...a.xyz], mass }
  })
  // 质心
  const n = atoms.length
  const c = [0, 0, 0]
  for (const a of atoms) { c[0] += a.xyz[0]; c[1] += a.xyz[1]; c[2] += a.xyz[2] }
  const centroid = [c[0] / n, c[1] / n, c[2] / n]
  // 平移到原点
  return atoms.map(a => ({ ...a, xyz: [a.xyz[0] - centroid[0], a.xyz[1] - centroid[1], a.xyz[2] - centroid[2]] }))
}

/** 计算惯性矩张量（质量加权，返回 3×3 行优先数组） */
function inertiaTensor(atoms) {
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
 * @returns {{ values: number[], vectors: number[][] }} 特征值（升序）与对应特征向量
 */
function jacobiEigen(A) {
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
  return {
    values: eig.map(e => e.value),
    vectors: eig.map(e => e.vector)
  }
}

/** 判断分子是否线性（最小惯量远小于最大惯量） */
function isLinear(inertiaValues) {
  const [i1, , i3] = inertiaValues
  return i3 > 1e-9 && i1 / i3 < 0.01
}

// ==================== 方向候选生成 ====================

/** 由主轴 axis 构造垂直平面内的一组候选方向（均匀采样，单位向量） */
function perpendicularDirections(axis, stepDeg = 15) {
  const a = normalize(axis)
  // 选一个不平行于 a 的参考向量
  let ref = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  // u1 = ref 在垂直平面的投影（归一化）
  const dotRef = a[0] * ref[0] + a[1] * ref[1] + a[2] * ref[2]
  let u1 = [ref[0] - dotRef * a[0], ref[1] - dotRef * a[1], ref[2] - dotRef * a[2]]
  u1 = normalize(u1)
  // u2 = a × u1
  const u2 = [
    a[1] * u1[2] - a[2] * u1[1],
    a[2] * u1[0] - a[0] * u1[2],
    a[0] * u1[1] - a[1] * u1[0]
  ]
  const dirs = []
  for (let deg = 0; deg < 180; deg += stepDeg) {
    const rad = deg * Math.PI / 180
    dirs.push([
      Math.cos(rad) * u1[0] + Math.sin(rad) * u2[0],
      Math.cos(rad) * u1[1] + Math.sin(rad) * u2[1],
      Math.cos(rad) * u1[2] + Math.sin(rad) * u2[2]
    ])
  }
  return dirs
}

// ==================== 对称元素检测 ====================

/** 检测垂直主轴的 C2 轴数量（3° 细采样，避免高 n Dnd 的 σd/C2 间隔过密而漏检） */
function countPerpendicularC2(atoms, axis, tol) {
  let count = 0
  const av = normalize(axis)
  const perp = candidateAxisDirs(atoms, tol).filter(dir => Math.abs(dot(normalize(dir), av)) < 0.1)
  for (const dir of perp) {
    if (isRotation(atoms, dir, 2, tol)) count++
  }
  return count
}

/** 两方向夹角（弧度，含反向取较小者） */
function angleBetweenDirs(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const na = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
  const nb = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2])
  if (na < 1e-12 || nb < 1e-12) return 0
  return Math.acos(Math.max(-1, Math.min(1, dot / (na * nb))))
}

/**
 * 检测垂直主轴的 C2 轴（5° 细采样 + 15° 方向聚类去重，返回方向数组）
 * 用于主轴方向无旋转轴但存在垂直 C2 的情形（如 H2O2 的 C2 群）
 * @param {Array} atoms
 * @param {number[]} axis - 主轴（单位向量）
 * @param {number} stepDeg - 采样步长（°）
 * @param {number} tol
 * @returns {number[][]} 聚类后的 C2 轴单位向量数组
 */
function findPerpendicularC2(atoms, axis, stepDeg = 1, tol = 0.15) {
  const dirs = []
  for (const dir of perpendicularDirections(axis, stepDeg)) {
    if (isRotation(atoms, dir, 2, tol)) dirs.push(dir)
  }
  const tolAng = 15 * Math.PI / 180
  const clusters = []
  for (const dir of dirs) {
    let found = false
    for (const c of clusters) {
      if (Math.min(angleBetweenDirs(dir, c), angleBetweenDirs(dir, c.map(v => -v))) < tolAng) {
        found = true
        break
      }
    }
    if (!found) clusters.push(dir)
  }
  return clusters
}

/** 检测法向量垂直主轴的反映面数量（3° 细采样） */
function countVerticalMirrors(atoms, axis, tol) {
  let count = 0
  const av = normalize(axis)
  const perp = candidateMirrorNormals(atoms, tol).filter(n => Math.abs(dot(normalize(n), av)) < 0.1)
  for (const n of perp) {
    if (isReflection(atoms, n, tol)) count++
  }
  return count
}

// ==================== 主识别流程 ====================

/**
 * 识别分子点群
 * @param {Object} molecule - 分子结构（{ atoms: [{element, xyz}] }）
 * @param {Object} options - { tol }
 * @returns {Object} { symbol, name, elements: [...] }
 */
export function identifyPointGroup(molecule, options = {}) {
  const tol = options.tol ?? DEFAULT_TOL
  const atoms = extractAtoms(molecule)

  // 单原子：Kh（球对称）
  if (atoms.length === 1) {
    return { symbol: 'Kh', name: '连续球对称群', elements: [] }
  }

  const inertia = inertiaTensor(atoms)
  const { values, vectors } = jacobiEigen(inertia)

  let result
  // 1. 线性分子：绕分子轴为 C∞，元素特殊处理（避免误判为有限 Cn）
  if (isLinear(values)) {
    const hasI = isInversion(atoms, tol)
    const symbol = hasI ? 'D∞h' : 'C∞v'
    const axis = normalize(vectors[0])  // 分子轴 = 最小惯量轴（绕分子轴惯量≈0）
    result = { symbol, name: POINT_GROUP_NAMES[symbol] || symbol, elements: assignLabels(linearSymmetryElements(axis, hasI)) }
  } else {
    const [i1, i2, i3] = values
    const [v1, v2, v3] = vectors

    // 2. 陀螺分类：通过特征值间距比值判断简并（比绝对容差更稳健）
    const gap12 = Math.abs(i2 - i1)
    const gap23 = Math.abs(i3 - i2)
    const scale = Math.max(i3, 1e-9)

    // 球形陀螺：三个特征值都接近
    if (gap12 < 0.01 * scale && gap23 < 0.01 * scale) {
      result = identifyHighSymmetry(atoms, tol)
    } else if (gap12 < gap23 * 0.2) {
      // 对称陀螺（扁）：i1≈i2 简并 → 主轴 v3
      result = identifySymmetricTop(atoms, v3, tol)
    } else if (gap23 < gap12 * 0.2) {
      // 对称陀螺（长）：i2≈i3 简并 → 主轴 v1
      result = identifySymmetricTop(atoms, v1, tol)
    } else {
      // 非对称陀螺（三个特征值都不简并）
      result = identifyAsymmetricTop(atoms, v1, v2, v3, tol)
    }
  }

  // C1（平凡群）仅含恒等元素 E：其特征标表首列为 E 类，元素清单与之对齐；其余点群不添加。
  if (result.symbol === 'C1' && !result.elements.some(el => el.type === 'E')) {
    result.elements = [{ type: 'E', order: 1, axis: null }, ...result.elements]
  }

  return result
}

// ==================== 对称陀螺判定 ====================

/**
 * 对称陀螺点群判定
 * @param {Array} atoms - 已平移到质心的原子
 * @param {number[]} axis - 主轴（单位向量）
 * @param {number} tol
 */
function identifySymmetricTop(atoms, axis, tol) {
  // 主轴最高阶
  const n = findHighestRotationOrder(atoms, axis, 6, tol)

  // 检测水平反映面 σh（法向量 = 主轴）
  const hasSigmaH = isReflection(atoms, axis, tol)
  // 检测垂直 C2 轴数量
  const nC2 = countPerpendicularC2(atoms, axis, tol)
  // 检测垂直反映面数量
  const nSigmaV = countVerticalMirrors(atoms, axis, tol)
  // 检测反演中心
  const hasInversion = isInversion(atoms, tol)

  let symbol
  let elementAxis = axis   // 元素收集用的主轴（n===1 且存在垂直 C2 时改为 C2 轴）
  let elementOrder = n

  if (n === 1) {
    // 主轴方向无真旋转轴：对称陀螺路径的退化分支。
    // 此时分子可能真为 C1/Cs/Ci，也可能主轴选错但存在垂直对称元素
    // （如 H2O2 的 C2、反式 H2O2 的 C2h），需检测垂直 C2 完备判定。
    const c2Dirs = findPerpendicularC2(atoms, axis, 5, tol)
    if (c2Dirs.length >= 3) {
      // 三条互相垂直的 C2：实为 D2 群（主轴未对齐，如乙烷全重叠构象）
      elementAxis = c2Dirs[0]
      elementOrder = 2
      symbol = (hasInversion || hasSigmaH) ? 'D2h' : 'D2'
    } else if (c2Dirs.length === 1) {
      // 单条垂直 C2：以它为轴细分 C2 / C2v / C2h
      const c2Axis = c2Dirs[0]
      elementAxis = c2Axis
      elementOrder = 2
      // 法线垂直于 C2 轴的反映面 = 含 C2 轴的 σv；法线沿 C2 轴的反映面 = σh
      const hasSigmaV = countVerticalMirrors(atoms, c2Axis, tol) > 0
      const hasSigmaH2 = isReflection(atoms, c2Axis, tol)
      if (hasInversion) symbol = 'C2h'            // C2 + i ⇒ C2h（i 与 σh 伴生）
      else if (hasSigmaV) symbol = 'C2v'
      else if (hasSigmaH2) symbol = 'C2h'
      else symbol = 'C2'
    } else if (hasInversion) {
      symbol = 'Ci'
    } else if (nSigmaV > 0 || hasSigmaH) {
      symbol = 'Cs'
    } else {
      // 沿主轴的旋反轴（S4/S6/S8 群；主轴无真旋转轴但可能为旋反轴）
      let sn = null
      for (const s of [8, 6, 4]) {
        if (isImproperRotation(atoms, axis, s, tol)) { sn = s; break }
      }
      if (sn) {
        symbol = `S${sn}`
        elementAxis = axis
        elementOrder = sn
      } else {
        symbol = 'C1'
      }
    }
  } else if (hasSigmaH) {
    symbol = nC2 > 0 ? `D${n}h` : `C${n}h`
  } else if (nSigmaV > 0) {
    symbol = nC2 > 0 ? `D${n}d` : `C${n}v`
  } else if (nC2 > 0) {
    symbol = `D${n}`
  } else {
    // 无 σ、无 ⊥C2：纯 Cn 或 Sn 群
    // 检测沿主轴的旋反轴 S4/S6/S8（S4²=C2、S6²=C3，主轴有真旋转轴时可能同时为旋反轴）
    let sn = null
    for (const s of [8, 6, 4]) {
      if (isImproperRotation(atoms, axis, s, tol)) { sn = s; break }
    }
    symbol = sn ? `S${sn}` : `C${n}`
  }

  return {
    symbol,
    name: POINT_GROUP_NAMES[symbol] || symbol,
    elements: collectElements(atoms, tol, { axis: elementAxis, order: elementOrder })
  }
}

// ==================== 非对称陀螺判定 ====================

/**
 * 非对称陀螺点群判定（三个主轴方向）
 */
function identifyAsymmetricTop(atoms, v1, v2, v3, tol) {
  // 检测三个主轴方向上的 C2
  const axes = [v1, v2, v3]
  const c2Axes = axes.filter(ax => isRotation(atoms, ax, 2, tol))
  const hasInversion = isInversion(atoms, tol)

  let symbol
  if (c2Axes.length >= 3) {
    // D2 或 D2h
    symbol = hasInversion ? 'D2h' : 'D2'
  } else if (c2Axes.length === 1) {
    // 单 C2 轴（可能同时为 S4 轴 → S4 群）
    const c2Axis = c2Axes[0]
    const nSigma = countVerticalMirrors(atoms, c2Axis, tol)
    const hasSigmaH = isReflection(atoms, c2Axis, tol)
    if (nSigma > 0) symbol = 'C2v'
    else if (hasSigmaH) symbol = 'C2h'
    else {
      // 无 σ：若该 C2 轴同时为 S4 轴（S4²=C2），则为 S4 群而非 C2 群
      symbol = isImproperRotation(atoms, c2Axis, 4, tol) ? 'S4' : 'C2'
    }
  } else {
    // 无 C2 轴
    if (hasInversion) symbol = 'Ci'
    else {
      // 检测是否存在反映面（遍历三个主轴 + 组合方向）
      const hasSigma = axes.some(ax => isReflection(atoms, ax, tol))
      symbol = hasSigma ? 'Cs' : 'C1'
    }
  }

  return {
    symbol,
    name: POINT_GROUP_NAMES[symbol] || symbol,
    elements: collectElements(atoms, tol, { axis: c2Axes.length === 1 ? c2Axes[0] : null, order: c2Axes.length === 1 ? 2 : 1, extraAxes: [v1, v2, v3] })
  }
}

// ==================== 高阶群判定 ====================

/**
 * 生成正二十面体的全部对称轴方向（单位向量，去重聚类）
 * 6 条 C5（沿顶点）、10 条 C3（沿面心）、15 条 C2（沿棱中点）
 * 顶点取黄金比 φ=(1+√5)/2 的经典坐标 (0,±1,±φ) 等
 * @returns {number[][]} 方向数组（每对 ± 只保留一个）
 */
function icosahedralAxes() {
  const phi = (1 + Math.sqrt(5)) / 2
  const verts = [
    [0, 1, phi], [0, 1, -phi], [0, -1, phi], [0, -1, -phi],
    [1, phi, 0], [1, -phi, 0], [-1, phi, 0], [-1, -phi, 0],
    [phi, 0, 1], [phi, 0, -1], [-phi, 0, 1], [-phi, 0, -1]
  ]
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  const edgeLen = dist(verts[0], verts[1])

  // C5：顶点方向（12 个）
  const dirs = verts.map(normalize)
  // C3：正三角形面的法线（三顶点两两相邻 → 等边面）
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      if (Math.abs(dist(verts[i], verts[j]) - edgeLen) > 1e-6) continue
      for (let k = j + 1; k < 12; k++) {
        if (Math.abs(dist(verts[i], verts[k]) - edgeLen) < 1e-6 &&
            Math.abs(dist(verts[j], verts[k]) - edgeLen) < 1e-6) {
          dirs.push(normalize([
            verts[i][0] + verts[j][0] + verts[k][0],
            verts[i][1] + verts[j][1] + verts[k][1],
            verts[i][2] + verts[j][2] + verts[k][2]
          ]))
        }
      }
    }
  }
  // C2：棱中点方向（相邻顶点对）
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      if (Math.abs(dist(verts[i], verts[j]) - edgeLen) < 1e-6) {
        dirs.push(normalize([
          verts[i][0] + verts[j][0],
          verts[i][1] + verts[j][1],
          verts[i][2] + verts[j][2]
        ]))
      }
    }
  }

  // 方向去重（含反向）
  const seen = new Set()
  const result = []
  for (const v of dirs) {
    const k = v.map(x => Math.round(x * 1000)).join(',')
    const anti = v.map(x => Math.round(-x * 1000)).join(',')
    if (seen.has(k) || seen.has(anti)) continue
    seen.add(k)
    result.push(v)
  }
  return result
}

/** 高阶群判定（球形陀螺：T/Td/Th/O/Oh/I/Ih） */
function identifyHighSymmetry(atoms, tol) {
  // 用原子几何候选方向（确定性）统计各阶真旋转轴数量（替换固定坐标轴/体对角/顶点枚举）
  let nC4 = 0, nC3 = 0, nC5 = 0
  for (const ax of candidateAxisDirs(atoms, tol)) {
    const t = detectAxisAt(atoms, ax, tol)
    if (!t) continue
    if (t.type === 'C4') nC4++
    else if (t.type === 'C3') nC3++
    else if (t.type === 'C5') nC5++
  }
  const hasInversion = isInversion(atoms, tol)

  let symbol
  let extraAxes = []
  if (nC5 >= 6) {
    // 正二十面体群 I/Ih（有 6 条 C5 轴）
    symbol = hasInversion ? 'Ih' : 'I'
    extraAxes = icosahedralAxes()
  } else if (nC4 >= 3) {
    symbol = hasInversion ? 'Oh' : 'O'
  } else if (nC3 >= 4) {
    if (hasInversion) symbol = 'Th'
    else {
      // 检测 σd 面（用几何候选法向判定，确定性）
      const hasSigma = candidateMirrorNormals(atoms, tol).some(n => isReflection(atoms, n, tol))
      symbol = hasSigma ? 'Td' : 'T'
    }
  } else {
    // 无法识别高阶群，回退到 C1
    symbol = 'C1'
  }

  return {
    symbol,
    name: POINT_GROUP_NAMES[symbol] || symbol,
    elements: collectElements(atoms, tol, { extraAxes })
  }
}

// ==================== 对称元素收集 ====================

/**
 * 检测某方向的最高阶对称轴（旋转轴 Cn 或旋反轴 Sn）
 * 阶数优先；S4 轴（其平方为 C2）标注为 S4 而非 C2
 * @param {Array} atoms
 * @param {number[]} ax - 候选轴方向（单位向量）
 * @param {number} tol
 * @returns {{type:string, order:number}|null}
 */
function detectAxis(atoms, ax, tol) {
  if (isRotation(atoms, ax, 6, tol)) return { type: 'C6', order: 6 }
  if (isRotation(atoms, ax, 5, tol)) return { type: 'C5', order: 5 }
  if (isImproperRotation(atoms, ax, 8, tol)) return { type: 'S8', order: 8 }
  if (isImproperRotation(atoms, ax, 6, tol)) return { type: 'S6', order: 6 }
  if (isRotation(atoms, ax, 4, tol)) return { type: 'C4', order: 4 }
  if (isImproperRotation(atoms, ax, 4, tol)) return { type: 'S4', order: 4 }
  if (isRotation(atoms, ax, 3, tol)) return { type: 'C3', order: 3 }
  if (isRotation(atoms, ax, 2, tol)) return { type: 'C2', order: 2 }
  return null
}

/**
 * /**
 * 收集分子对称元素（完整，由封闭生成法确定性产出）
 * 旧实现依赖（逐方向几何候选 + 主轴旋转轨道补全），对 Sn 缺失、主轴向子阶 C_n、
 * 高对称群独立 3C2、线性分子元素等会漏检；现改为（候选验证→群封闭完整操作集→投影元素），
 * 元素与点群共轭类天然一致，不依赖候选完备性。
 * @param {Array} atoms - 已平移到质心的原子
 * @param {number} tol
 * @param {Object} opts - 兼容旧签名（忽略；元素由点群结构决定）
 * @returns {Array<{type, order, axis}>}
 */
function collectElements(atoms, tol, opts = {}) {
  return assignLabels(generateSymmetryElements(atoms, tol).elements)
}
