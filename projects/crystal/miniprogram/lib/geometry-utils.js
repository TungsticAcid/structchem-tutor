/**
 * 几何工具模块
 * 提供分数坐标→笛卡尔坐标转换、晶胞顶点计算等功能
 */

/**
 * 将分数坐标转换为笛卡尔坐标
 * @param {number[]} frac - 分数坐标 [x, y, z]
 * @param {Object} lattice - 晶胞参数 { a, b, c, alpha, beta, gamma }（角度为度）
 * @returns {{ x: number, y: number, z: number }} 笛卡尔坐标
 */
export function fractionalToCartesian(frac, lattice) {
  const { a, b, c, alpha, beta, gamma } = lattice
  const alphaRad = alpha * Math.PI / 180
  const betaRad = beta * Math.PI / 180
  const gammaRad = gamma * Math.PI / 180

  const cosAlpha = Math.cos(alphaRad)
  const cosBeta = Math.cos(betaRad)
  const cosGamma = Math.cos(gammaRad)
  const sinGamma = Math.sin(gammaRad)

  // 晶胞体积因子
  const volumeFactor = Math.sqrt(
    1 - cosAlpha * cosAlpha - cosBeta * cosBeta - cosGamma * cosGamma
    + 2 * cosAlpha * cosBeta * cosGamma
  )

  // 笛卡尔坐标变换矩阵（晶胞向量置于Cartesian空间）
  // a 沿 x 轴，b 在 xy 平面，c 在 xyz 空间
  const a1 = a
  const a2 = 0
  const a3 = 0

  const b1 = b * cosGamma
  const b2 = b * sinGamma
  const b3 = 0

  const c1 = c * cosBeta
  const c2 = c * (cosAlpha - cosBeta * cosGamma) / sinGamma
  const c3 = c * volumeFactor / sinGamma

  return {
    x: frac[0] * a1 + frac[1] * b1 + frac[2] * c1,
    y: frac[0] * a2 + frac[1] * b2 + frac[2] * c2,
    z: frac[0] * a3 + frac[1] * b3 + frac[2] * c3
  }
}

/**
 * 获取晶胞8个顶点的笛卡尔坐标
 * @param {Object} lattice - 晶胞参数
 * @returns {Array<{x:number,y:number,z:number}>} 8个顶点坐标
 */
export function getCellVertices(lattice) {
  const corners = []
  for (let i = 0; i <= 1; i++) {
    for (let j = 0; j <= 1; j++) {
      for (let k = 0; k <= 1; k++) {
        corners.push(fractionalToCartesian([i, j, k], lattice))
      }
    }
  }
  return corners
}

/**
 * 获取晶胞12条棱的顶点索引对
 * @returns {Array<[number, number]>} 棱的顶点索引对
 */
export function getCellEdges() {
  return [
    [0, 1], [0, 2], [0, 4], [1, 3], [1, 5],
    [2, 3], [2, 6], [3, 7], [4, 5], [4, 6],
    [5, 7], [6, 7]
  ]
}

/**
 * 获取晶胞中心偏移（使晶胞居中于原点）
 * @param {Object} lattice - 晶胞参数
 * @returns {{ x: number, y: number, z: number }} 中心偏移
 */
export function getCellCenteredOffset(lattice) {
  const center = fractionalToCartesian([0.5, 0.5, 0.5], lattice)
  return { x: -center.x, y: -center.y, z: -center.z }
}

/**
 * 检测晶格类型（基于惯用胞中原子的分数坐标模式）
 * @param {Object} crystalData
 * @returns {string} 'sc'|'bcc'|'fcc'|'hcp'|'diamond'|'cbase'|'other'
 */
export function detectLatticeType(crystalData) {
  const atoms = crystalData.atoms
  if (!atoms || atoms.length === 0) return 'sc'

  // 收集所有原子位置
  const allPos = []
  for (const g of atoms) {
    for (const p of g.positions) {
      allPos.push(p)
    }
  }

  const hasAtomAt = (target, tol = 0.02) => {
    return allPos.some(p =>
      Math.abs(p[0] - target[0]) < tol &&
      Math.abs(p[1] - target[1]) < tol &&
      Math.abs(p[2] - target[2]) < tol
    )
  }

  // BCC: 有体心原子 (0.5, 0.5, 0.5)
  if (hasAtomAt([0.5, 0.5, 0.5])) return 'bcc'

  // FCC/Diamond: 面心处有原子
  const hasFaceCenters = hasAtomAt([0.5, 0.5, 0.0]) || hasAtomAt([0.5, 0.0, 0.5]) || hasAtomAt([0.0, 0.5, 0.5])
  if (hasFaceCenters) {
    if (hasAtomAt([0.25, 0.25, 0.25])) return 'diamond'
    return 'fcc'
  }

  // C底心
  if (hasAtomAt([0.5, 0.5, 0.0])) return 'cbase'

  // R心六方检测：obverse (2/3,1/3,1/3)+(1/3,2/3,2/3) 或 reverse (1/3,2/3,1/3)+(2/3,1/3,2/3)
  const hasRObverse = hasAtomAt([0.6667, 0.3333, 0.3333]) || hasAtomAt([0.3333, 0.6667, 0.6667])
  const hasRReverse = hasAtomAt([0.3333, 0.6667, 0.3333]) || hasAtomAt([0.6667, 0.3333, 0.6667])
  if (hasRObverse || hasRReverse) return 'rHex'

  // 六方检测
  if (crystalData.crystalSystem === 'hexagonal' ||
    (Math.abs(crystalData.lattice.gamma - 120) < 5)) return 'hcp'

  return 'sc'
}

/**
 * 将凸多面体一个面上的顶点按环绕顺序排序（贪心最近邻）
 * @param {number[]} vertIndices - 面上的顶点索引
 * @param {Array<{x:number,y:number,z:number}>} allVerts - 所有顶点
 * @returns {number[]} 排序后的顶点索引（首尾相连成环）
 */
function orderFaceVertices(vertIndices, allVerts) {
  if (vertIndices.length <= 3) return [...vertIndices]
  const remaining = new Set(vertIndices)
  const ordered = []
  let cur = vertIndices[0]
  ordered.push(cur)
  remaining.delete(cur)
  while (remaining.size > 0) {
    let best = null
    let bestDist = Infinity
    for (const cand of remaining) {
      const dx = allVerts[cur].x - allVerts[cand].x
      const dy = allVerts[cur].y - allVerts[cand].y
      const dz = allVerts[cur].z - allVerts[cand].z
      const d = dx * dx + dy * dy + dz * dz
      if (d < bestDist) { bestDist = d; best = cand }
    }
    cur = best
    ordered.push(cur)
    remaining.delete(cur)
  }
  return ordered
}

/**
 * 从晶体数据中提取 centering 向量（用于 WS 原胞格点生成）
 * 有心格子（BCC/FCC/底心等）的格点 = 整数平移 + centering 平移
 * @param {Object} crystalData
 * @returns {Array<[number,number,number]>}
 */
export function extractCenteringVectors(crystalData) {
  const atoms = crystalData.atoms
  if (!atoms || atoms.length === 0) return []

  // 按元素收集所有位置
  const elemPositions = {}
  const allPos = []
  for (const g of atoms) {
    const elem = g.element || g.symbol
    if (!elemPositions[elem]) elemPositions[elem] = []
    for (const p of g.positions) {
      elemPositions[elem].push(p)
      allPos.push({ pos: p, elem })
    }
  }

  // 候选 centering：所有原子对之间的非整数平移
  const candidates = new Set()
  for (const { pos: p1, elem: e1 } of allPos) {
    for (const { pos: p2, elem: e2 } of allPos) {
      if (e1 !== e2) continue  // 不同元素之间不存在 centering 关系
      const t0 = ((p2[0] - p1[0]) % 1 + 1) % 1
      const t1 = ((p2[1] - p1[1]) % 1 + 1) % 1
      const t2 = ((p2[2] - p1[2]) % 1 + 1) % 1
      if (Math.abs(t0) < 0.001 && Math.abs(t1) < 0.001 && Math.abs(t2) < 0.001) continue
      candidates.add(`${t0.toFixed(5)},${t1.toFixed(5)},${t2.toFixed(5)}`)
    }
  }

  // 严格验证：centering t 必须把每个原子都映射到同元素的有效位置
  const vecs = []
  for (const s of candidates) {
    const parts = s.split(',').map(Number)
    if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0) continue

    // 检查是否有任何位置没有同元素的映射目标
    let valid = true
    for (const { pos, elem } of allPos) {
      const fx = ((pos[0] + parts[0]) % 1 + 1) % 1
      const fy = ((pos[1] + parts[1]) % 1 + 1) % 1
      const fz = ((pos[2] + parts[2]) % 1 + 1) % 1
      const hasTarget = (elemPositions[elem] || []).some(q =>
        Math.abs(q[0] - fx) < 0.01 && Math.abs(q[1] - fy) < 0.01 && Math.abs(q[2] - fz) < 0.01
      )
      if (!hasTarget) { valid = false; break }
    }
    if (valid) vecs.push(parts)
  }

  return vecs
}

/**
 * 获取W-S原胞的顶点和边（通用垂直平分面半空间交算法）
 *
 * 算法：生成所有邻近格点 → 创建垂直平分面 → 计算三面交点 →
 * 过滤满足所有半空间约束的顶点 → 按面收集顶点 → 排序 → 提取边。
 * 适用于任意晶系，无需按 Bravais 格分类硬编码。
 *
 * @returns {{ vertices, edges } | null}
 */
export function getWSCellGeometry(crystalData) {
  const { lattice } = crystalData

  // 1. 生成 [-2,2]³ 范围内所有格点（含 centering），转笛卡尔坐标
  const centerings = extractCenteringVectors(crystalData)
  const allPoints = []
  for (let di = -2; di <= 2; di++) {
    for (let dj = -2; dj <= 2; dj++) {
      for (let dk = -2; dk <= 2; dk++) {
        const bases = [[di, dj, dk]]
        for (const cv of centerings) {
          bases.push([di + cv[0], dj + cv[1], dk + cv[2]])
        }
        for (const f of bases) {
          const cart = fractionalToCartesian(f, lattice)
          const d2 = cart.x * cart.x + cart.y * cart.y + cart.z * cart.z
          if (d2 > 0.0001) allPoints.push({ x: cart.x, y: cart.y, z: cart.z, d2 })
        }
      }
    }
  }

  // 去重并取最近 N 个格点
  const unique = []
  const seen = new Set()
  for (const p of allPoints) {
    const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`
    if (!seen.has(key)) { seen.add(key); unique.push(p) }
  }
  unique.sort((a, b) => a.d2 - b.d2)
  const N = 60
  const closest = unique.slice(0, N)

  if (closest.length < 3) return null

  // 2. 创建垂直平分面：n·P + d ≤ 0，其中 n=G, d=-|G|²/2
  const planes = closest.map(p => ({
    nx: p.x, ny: p.y, nz: p.z,
    d: -p.d2 / 2
  }))

  // 3. 遍历所有三面组合，求解交点，过滤有效顶点
  const verts = []
  const VERT_EPS = 1e-5
  const vertKeys = new Set()

  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const pi = planes[i], pj = planes[j], pk = planes[k]

        // Cramer 法则解 3×3：n · x = rhs（rhs = |G|²/2 = -d）
        const a1 = pi.nx, b1 = pi.ny, c1 = pi.nz, r1 = -pi.d
        const a2 = pj.nx, b2 = pj.ny, c2 = pj.nz, r2 = -pj.d
        const a3 = pk.nx, b3 = pk.ny, c3 = pk.nz, r3 = -pk.d

        const det = a1 * (b2 * c3 - b3 * c2) - b1 * (a2 * c3 - a3 * c2) + c1 * (a2 * b3 - a3 * b2)
        if (Math.abs(det) < 1e-12) continue

        const detX = r1 * (b2 * c3 - b3 * c2) - b1 * (r2 * c3 - r3 * c2) + c1 * (r2 * b3 - r3 * b2)
        const detY = a1 * (r2 * c3 - r3 * c2) - r1 * (a2 * c3 - a3 * c2) + c1 * (a2 * r3 - a3 * r2)
        const detZ = a1 * (b2 * r3 - b3 * r2) - b1 * (a2 * r3 - a3 * r2) + r1 * (a2 * b3 - a3 * b2)

        const x = detX / det, y = detY / det, z = detZ / det

        // 检查是否满足所有半空间约束
        let valid = true
        for (const p of planes) {
          if (p.nx * x + p.ny * y + p.nz * z + p.d > VERT_EPS) { valid = false; break }
        }
        if (!valid) continue

        const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`
        if (vertKeys.has(key)) continue
        vertKeys.add(key)
        verts.push({ x, y, z })
      }
    }
  }

  if (verts.length < 4) return null

  // 4. 对每个平面收集位于其上的顶点 → 面（记录平面索引）
  const ON_PLANE_EPS = 1e-4
  const faces = []  // { planeIdx: number, vertIndices: number[] }
  for (let pi = 0; pi < planes.length; pi++) {
    const p = planes[pi]
    const faceVerts = []
    for (let vi = 0; vi < verts.length; vi++) {
      const v = verts[vi]
      if (Math.abs(p.nx * v.x + p.ny * v.y + p.nz * v.z + p.d) < ON_PLANE_EPS) {
        faceVerts.push(vi)
      }
    }
    if (faceVerts.length >= 3) faces.push({ planeIdx: pi, vertIndices: faceVerts })
  }

  // 5. 对面顶点排序并提取边
  const edgeSet = new Set()
  const usedPlanes = new Set()
  const facePlanes = []
  for (const face of faces) {
    const ordered = orderFaceVertices(face.vertIndices, verts)
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i], b = ordered[(i + 1) % ordered.length]
      edgeSet.add(a < b ? `${a}-${b}` : `${b}-${a}`)
    }
    // 收集该面对应的平面
    if (!usedPlanes.has(face.planeIdx)) {
      usedPlanes.add(face.planeIdx)
      facePlanes.push(planes[face.planeIdx])
    }
  }

  const edges = []
  for (const key of edgeSet) {
    const [v1, v2] = key.split('-').map(Number)
    edges.push([v1, v2])
  }

  return { vertices: verts, edges, facePlanes }
}

export default { fractionalToCartesian, getCellVertices, getCellEdges, getCellCenteredOffset, detectLatticeType, getWSCellGeometry, extractCenteringVectors }
