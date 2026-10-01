/**
 * 几何工具模块
 * 提供分数坐标→笛卡尔坐标转换、晶胞顶点计算等功能
 * 纯 JS 无平台依赖，直接从小程序版本转换
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

  const volumeFactor = Math.sqrt(
    1 - cosAlpha * cosAlpha - cosBeta * cosBeta - cosGamma * cosGamma
    + 2 * cosAlpha * cosBeta * cosGamma
  )

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
 */
export function getCellCenteredOffset(lattice) {
  const center = fractionalToCartesian([0.5, 0.5, 0.5], lattice)
  return { x: -center.x, y: -center.y, z: -center.z }
}

/**
 * 检测晶格类型
 */
export function detectLatticeType(crystalData) {
  const atoms = crystalData.atoms
  if (!atoms || atoms.length === 0) return 'sc'

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

  if (hasAtomAt([0.5, 0.5, 0.5])) return 'bcc'

  const hasFaceCenters = hasAtomAt([0.5, 0.5, 0.0]) || hasAtomAt([0.5, 0.0, 0.5]) || hasAtomAt([0.0, 0.5, 0.5])
  if (hasFaceCenters) {
    if (hasAtomAt([0.25, 0.25, 0.25])) return 'diamond'
    return 'fcc'
  }

  if (hasAtomAt([0.5, 0.5, 0.0])) return 'cbase'

  const hasRObverse = hasAtomAt([0.6667, 0.3333, 0.3333]) || hasAtomAt([0.3333, 0.6667, 0.6667])
  const hasRReverse = hasAtomAt([0.3333, 0.6667, 0.3333]) || hasAtomAt([0.6667, 0.3333, 0.6667])
  if (hasRObverse || hasRReverse) return 'rHex'

  if (crystalData.crystalSystem === 'hexagonal' ||
    (Math.abs(crystalData.lattice.gamma - 120) < 5)) return 'hcp'

  return 'sc'
}

/**
 * Pearson 符号的**第二个字母 = 带心方式** → 内部代码（决定点阵点画在哪几个位置）。
 * P 简单 / I 体心 / F 面心 / C 底心（A、B 同为单面带心）/ R 菱形。
 */
const PEARSON_CENTERING = { p: 'sc', i: 'bcc', f: 'fcc', c: 'cbase', a: 'cbase', b: 'cbase', r: 'rHex' }

/**
 * 从晶体数据里读**点阵型式**（= 点阵点该画在哪些位置）。
 *
 * ★ 以数据里的 **Pearson 符号**为准：`简单立方(cP)` 里的 `cP` 把"晶系字母 + 带心字母"
 *   都编码了，取第二个字母就是带心方式。这比逐个匹配中文名可靠得多 ——
 *   "简单立方／简单四方／简单六方"的带心方式**都是 P**、点阵点都只在八个顶点上，
 *   靠中文关键字永远列不全（原实现就是这么漏的，见下）。
 *
 * ★ 实测踩过（用户报「CsCl 点阵点有问题」）：原判据只有 底心／体心／面心／r心／六方／金刚石
 *   六支，**没有 P**，于是 CsCl 的 `简单立方(cP)` 读到 null，回落到按**原子位置**的启发式
 *   `detectLatticeType()` —— 它看见体心有 Cs⁺ 就判成 `bcc`，点阵点在**体心**画了一个出来。
 *   而"CsCl 的点阵点只在顶点、体心没有"恰恰是这个工具要教的那一点：画错等于把要纠正的
 *   错误结论当成了正确答案。
 *   同一原因还让 co2／perovskite／pyrite／rutile 等共 6 个晶体画错（23 个里 7 个走了启发式）。
 *
 * @returns {string|null} 内部代码；null 表示数据没写、需要调用方回落到启发式
 */
export function getExplicitLatticeType(crystalData) {
  const lt = (crystalData.latticeType || '').toLowerCase()
  if (!lt) return null

  // ① Pearson 符号优先（括号里恰好两个字母，取第二个 = 带心字母）
  const pearson = lt.match(/\(\s*[a-z]([a-z])\s*\)/)
  if (pearson) {
    const code = PEARSON_CENTERING[pearson[1]]
    if (code) return code
  }

  // ② 数据没写 Pearson 符号时，退回中文关键字（判据保持原样，勿删）
  if (lt.includes('底心') || lt.includes('oc') || lt.includes('c心') || lt.includes('oa') || lt.includes('ob')) return 'cbase'
  if (lt.includes('体心') || lt.includes('ci') || lt.includes('bcc')) return 'bcc'
  if (lt.includes('面心') || lt.includes('cf') || lt.includes('fcc')) return 'fcc'
  if (lt.includes('r心') || lt.includes('rhex')) return 'rHex'
  if (lt.includes('六方') || lt.includes('hp')) return 'hcp'
  if (lt.includes('金刚石') || lt.includes('diamond')) return 'diamond'
  return null
}

/**
 * 惯用晶胞里**要显示的点阵点位置**（分数坐标）。
 *
 * ★ 为什么把这段从渲染器里抽出来：它决定"画出来对不对"，而判据本身是纯几何、不碰 three。
 *   抽出来之后 `tools/check-crystal-data.mjs` 就能拿**数据自己声明的 Pearson 符号**
 *   跟它直接对账 —— 这两边原先各有一套知识（数据守卫的表说 cP 每个晶胞 1 个点阵点，
 *   渲染器却按自己那套画），互不相干，于是 CsCl 画错了很久没人发现。
 *
 * ★ 显示的是**惯用晶胞的 8 个顶点 + 带心位置**，不是"每个晶胞含几个点阵点"：
 *   前者是给人看的画面约定（cF 画 14 个球），后者是化学计量（cF 每胞 4 个）。两者别混。
 *
 * @param {string} latticeType 内部代码（sc/bcc/fcc/diamond/cbase/rHex/hcp）
 * @param {Object} crystalData 用来判定 R 心是 obverse 还是 reverse
 * @returns {number[][]} 分数坐标列表
 */
export function latticePointPositions(latticeType, crystalData = {}) {
  const pos = []
  for (let i = 0; i <= 1; i++)
    for (let j = 0; j <= 1; j++)
      for (let k = 0; k <= 1; k++) pos.push([i, j, k])

  if (latticeType === 'bcc') pos.push([0.5, 0.5, 0.5])
  if (latticeType === 'fcc' || latticeType === 'diamond') {
    pos.push([0.5, 0.5, 0.0], [0.5, 0.0, 0.5], [0.0, 0.5, 0.5],
      [0.5, 0.5, 1.0], [0.5, 1.0, 0.5], [1.0, 0.5, 0.5])
  }
  if (latticeType === 'cbase') pos.push([0.5, 0.5, 0.0], [0.5, 0.5, 1.0])
  // R 心六方：obverse (2/3,1/3,1/3)+(1/3,2/3,2/3) 或 reverse (1/3,2/3,1/3)+(2/3,1/3,2/3)
  if (latticeType === 'rHex') {
    const near = (p, x, y, z) => Math.abs(p[0] - x) < 0.05 && Math.abs(p[1] - y) < 0.05 && Math.abs(p[2] - z) < 0.05
    const hasReverse = (crystalData.atoms || []).some(g => g.positions.some(p => near(p, 0.3333, 0.6667, 0.3333)))
    if (hasReverse) pos.push([0.3333, 0.6667, 0.3333], [0.6667, 0.3333, 0.6667])
    else pos.push([0.6667, 0.3333, 0.3333], [0.3333, 0.6667, 0.6667])
  }
  return pos
}

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

export function extractCenteringVectors(crystalData) {
  const atoms = crystalData.atoms
  if (!atoms || atoms.length === 0) return []

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

  const candidates = new Set()
  for (const { pos: p1, elem: e1 } of allPos) {
    for (const { pos: p2, elem: e2 } of allPos) {
      if (e1 !== e2) continue
      const t0 = ((p2[0] - p1[0]) % 1 + 1) % 1
      const t1 = ((p2[1] - p1[1]) % 1 + 1) % 1
      const t2 = ((p2[2] - p1[2]) % 1 + 1) % 1
      if (Math.abs(t0) < 0.001 && Math.abs(t1) < 0.001 && Math.abs(t2) < 0.001) continue
      candidates.add(`${t0.toFixed(5)},${t1.toFixed(5)},${t2.toFixed(5)}`)
    }
  }

  const vecs = []
  for (const s of candidates) {
    const parts = s.split(',').map(Number)
    if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0) continue

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

export function getWSCellGeometry(crystalData) {
  const { lattice } = crystalData

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

  const planes = closest.map(p => ({
    nx: p.x, ny: p.y, nz: p.z,
    d: -p.d2 / 2
  }))

  const verts = []
  const VERT_EPS = 1e-5
  const vertKeys = new Set()

  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const pi = planes[i], pj = planes[j], pk = planes[k]

        const a1 = pi.nx, b1 = pi.ny, c1 = pi.nz, r1 = -pi.d
        const a2 = pj.nx, b2 = pj.ny, c2 = pj.nz, r2 = -pj.d
        const a3 = pk.nx, b3 = pk.ny, c3 = pk.nz, r3 = -pk.d

        const det = a1 * (b2 * c3 - b3 * c2) - b1 * (a2 * c3 - a3 * c2) + c1 * (a2 * b3 - a3 * b2)
        if (Math.abs(det) < 1e-12) continue

        const detX = r1 * (b2 * c3 - b3 * c2) - b1 * (r2 * c3 - r3 * c2) + c1 * (r2 * b3 - r3 * b2)
        const detY = a1 * (r2 * c3 - r3 * c2) - r1 * (a2 * c3 - a3 * c2) + c1 * (a2 * r3 - a3 * r2)
        const detZ = a1 * (b2 * r3 - b3 * r2) - b1 * (a2 * r3 - a3 * r2) + r1 * (a2 * b3 - a3 * b2)

        const x = detX / det, y = detY / det, z = detZ / det

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

  const ON_PLANE_EPS = 1e-4
  const faces = []
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

  const edgeSet = new Set()
  const usedPlanes = new Set()
  const facePlanes = []
  for (const face of faces) {
    const ordered = orderFaceVertices(face.vertIndices, verts)
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i], b = ordered[(i + 1) % ordered.length]
      edgeSet.add(a < b ? `${a}-${b}` : `${b}-${a}`)
    }
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

export default { fractionalToCartesian, getCellVertices, getCellEdges, getCellCenteredOffset, detectLatticeType, getExplicitLatticeType, latticePointPositions, getWSCellGeometry, extractCenteringVectors }
