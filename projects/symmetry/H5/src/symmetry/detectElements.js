/**
 * 确定性对称元素检测模块（参考 SYVA 的原子几何候选法）
 * 与"方向网格采样"不同：对称方向候选由原子几何构造（单原子/原子对/三点），
 * 每个候选用对称性原语验证。任何真实对称方向必由某组同类原子确定，因此候选完备、无漏检。
 */
import * as ops from './operations.js'
const {
  cross, dot, normalize, applyMatrix, distance, findHighestRotationOrder,
  rotationMatrix, reflectionMatrix, inversionMatrix, improperRotationMatrix,
  isRotation, isReflection, isInversion, isImproperRotation, isSymmetryOperation
} = ops

/** 最小旋转角容差（rad）*/
const ANG_TOL = 6 * Math.PI / 180   // 6° 聚类容差

/** 归一化后把方向规范化符号（使首个显著分量为正，用于 ± 方向去重） */
function canonDir(v) {
  const n = normalize(v)
  let s = 1
  for (const x of n) { if (Math.abs(x) > 1e-6) { s = x < 0 ? -1 : 1; break } }
  return [n[0] * s, n[1] * s, n[2] * s]
}

/** 方向快速哈希 key（± 视为同一，用于初步去重） */
function dirKey(v) {
  const c = canonDir(v)
  return c.map(x => Math.round(x * 60)).join(',')
}

/** 两方向夹角（含反向取较小者，轴/法向无向） */
function angleBetween(a, b) {
  const dotv = Math.abs(dot(a, b))
  return Math.acos(Math.max(-1, Math.min(1, dotv / (Math.hypot(...a) * Math.hypot(...b)))))
}

/** 方向聚类去重（15° 容差，含反向）；先哈希初去重再逐对聚类 */
function clusterDirs(dirs, angleTol = 15 * Math.PI / 180) {
  const uniq = []
  const seen = new Set()
  for (const d of dirs) {
    const n = normalize(d)
    if (n[0]**2 + n[1]**2 + n[2]**2 < 1e-12) continue
    const k = dirKey(n)
    if (seen.has(k)) continue
    seen.add(k)
    uniq.push(n)
  }
  const clusters = []
  for (const d of uniq) {
    let found = false
    for (const c of clusters) {
      if (angleBetween(d, c) < angleTol) { found = true; break }
    }
    if (!found) clusters.push(d)
  }
  return clusters
}

/** 点是否在过原点、法向 n 的平面上（|n·p| 容差） */
function onPlaneThroughOrigin(n, p, tol) {
  return Math.abs(dot(n, p)) < tol
}

/**
 * 旋转轴候选方向（质心系，origins）：
 *  - 单原子方向（原子在轴上）
 *  - 两原子(同类)中点方向（C2 轴）
 *  - 三点(同类)旋转轴：轴 = cross(b-a, c-b)，阶由两边夹角确定
 * 返回聚类去重后的候选方向数组
 */
export function candidateAxisDirs(atoms, tol = 0.15) {
  const dirs = []
  const classAtoms = groupByElement(atoms)
  for (const grp of classAtoms) {
    const P = grp.atoms
    // 单原子方向
    for (const a of P) {
      if (Math.hypot(...a.xyz) > tol) dirs.push(a.xyz)
    }
    // 两原子中点方向（C2）—— 同类原子对（对称轴/面支撑常是对位成分，非仅相邻键对）
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        const m = [(P[i].xyz[0] + P[j].xyz[0]) / 2, (P[i].xyz[1] + P[j].xyz[1]) / 2, (P[i].xyz[2] + P[j].xyz[2]) / 2]
        if (Math.hypot(...m) > tol) dirs.push(m)
      }
    }
    // 三点旋转轴（C_m）
    if (P.length >= 3) {
      for (let i = 0; i < P.length - 2; i++) {
        const a = P[i].xyz
        for (let j = i + 1; j < P.length - 1; j++) {
          const b = P[j].xyz
          const v1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
          for (let k = j + 1; k < P.length; k++) {
            const c = P[k].xyz
            const v2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
            const ax = cross(v1, v2)
            const an = Math.hypot(...ax)
            if (an < 1e-9) continue
            const ang = Math.acos(Math.max(-1, Math.min(1, dot(v1, v2) / (Math.hypot(...v1) * Math.hypot(...v2)))))
            if (Math.abs(ang) < 1e-6) continue
            const m = Math.round(2 * Math.PI / ang)
            if (Math.abs(m * ang - 2 * Math.PI) < 0.5) dirs.push(ax)
          }
        }
      }
    }
  }
  return clusterDirs(dirs)
}

/**
 * 反映面法向候选：每对同类原子构造三个候选法向（两点连线 / 过原点面法向 / 二者叉积），
 * 仅保留"过质心（原点）"者。返回聚类去重后的法向候选。
 */
export function candidateMirrorNormals(atoms, tol = 0.15) {
  const normals = []
  const classAtoms = groupByElement(atoms)
  for (const grp of classAtoms) {
    const P = grp.atoms
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        const p1 = P[i].xyz, p2 = P[j].xyz
        const p0 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2]
        const v1 = normalize([p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]])
        const v2 = normalize(cross(p1, p2))
        for (const v of [v1, v2, normalize(cross(v1, v2))]) {
          if (Math.hypot(...v) < 1e-9) continue
          if (onPlaneThroughOrigin(v, p0, tol)) normals.push(v)
        }
      }
    }
  }
  return clusterDirs(normals)
}

/** 按元素分类原子（保持每一类） */
function groupByElement(atoms) {
  const map = new Map()
  for (const a of atoms) {
    if (!map.has(a.element)) map.set(a.element, [])
    map.get(a.element).push(a)
  }
  return Array.from(map.values()).map(list => ({ atoms: list }))
}

/**
 * 检测某方向的对称轴对：同一方向分别测真旋转轴（C6…C2）与旋反轴（S10/S8/S6/S4），
 * 同一条轴可同时是真 Cₙ 与旋反 Sₙ（如面心轴既是 C₃ 又是 S₆）。
 * @returns {{ c: {type,order}|null, s: {type,order}|null }}
 */
export function detectAxisPair(atoms, dir, tol = 0.15) {
  const ax = normalize(dir)
  let c = null
  for (const k of [6, 5, 4, 3, 2]) {
    if (isRotation(atoms, ax, k, tol)) { c = { type: 'C' + k, order: k }; break }
  }
  let s = null
  for (const k of [10, 8, 6, 4]) {
    if (isImproperRotation(atoms, ax, k, tol)) { s = { type: 'S' + k, order: k }; break }
  }
  return { c, s }
}

/** 检测某候选方向的对称轴（真轴优先；供只需"一种代表"的调用，如高阶计数） */
export function detectAxisAt(atoms, dir, tol = 0.15) {
  const p = detectAxisPair(atoms, dir, tol)
  return p.c || p.s
}

/**
 * 确定性检测全部对称元素：由原子几何候选方向 + 对称性验证
 * @param {Array} atoms - 质心系原子 [{ element, xyz }]
 * @returns {Array<{type, order, axis}>}
 */
export function detectAllSymmetryElements(atoms, tol = 0.15) {
  const elements = []
  const seenAxis = new Set()
  const seenNormal = new Set()

  // 旋轴 / 旋反轴
  const axisDirs = candidateAxisDirs(atoms, tol)
  for (const dir of axisDirs) {
    const t = detectAxisAt(atoms, dir, tol)
    if (!t) continue
    const k = dirKey(dir)
    const anti = dirKey(dir.map(x => -x))
    if (seenAxis.has(k) || seenAxis.has(anti)) continue
    seenAxis.add(k); seenAxis.add(anti)
    elements.push({ type: t.type, order: t.order, axis: dir })
  }

  // 反映面
  const normals = candidateMirrorNormals(atoms, tol)
  for (const n of normals) {
    if (!isReflection(atoms, n, tol)) continue
    const k = dirKey(n)
    const anti = dirKey(n.map(x => -x))
    if (seenNormal.has(k) || seenNormal.has(anti)) continue
    seenNormal.add(k); seenNormal.add(anti)
    elements.push({ type: 'sigma', order: 1, axis: n })
  }

  // 反演中心
  if (isInversion(atoms, tol)) {
    elements.push({ type: 'i', order: 1, axis: null })
  }

  return elements
}
