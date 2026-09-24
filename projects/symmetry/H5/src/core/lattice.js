/**
 * 晶格几何工具模块
 * 分数坐标↔笛卡尔坐标转换、晶胞顶点/棱计算
 * 算法移植自 crystal 项目 lib/geometry-utils.js（补充分数↔笛卡尔的逆变换）
 */

/**
 * 将分数坐标转换为笛卡尔坐标
 * 晶体学标准约定：a 沿 x 轴，b 在 xy 平面，c 在三维空间
 * @param {number[]} frac - 分数坐标 [x, y, z]
 * @param {Object} lattice - { a, b, c, alpha, beta, gamma }（角度为度）
 * @returns {{ x: number, y: number, z: number }}
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

  // 晶胞基矢（行向量变换矩阵）
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
 * 构建分数→笛卡尔的 3×3 变换矩阵（行优先）
 * cart = frac · M
 * @param {Object} lattice
 * @returns {number[][]} 3×3 矩阵
 */
function getCartMatrix(lattice) {
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

  return [
    [a, 0, 0],
    [b * cosGamma, b * sinGamma, 0],
    [c * cosBeta, c * (cosAlpha - cosBeta * cosGamma) / sinGamma, c * volumeFactor / sinGamma]
  ]
}

/** 3×3 矩阵求逆（返回行优先矩阵） */
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

/**
 * 将笛卡尔坐标转换为分数坐标（分数→笛卡尔的逆变换）
 * @param {{x:number,y:number,z:number}} cart - 笛卡尔坐标
 * @param {Object} lattice
 * @returns {number[]} 分数坐标 [x, y, z]
 */
export function cartesianToFractional(cart, lattice) {
  const M = getCartMatrix(lattice)
  const invM = invertMatrix3(M)
  if (!invM) return [0, 0, 0]
  // frac = cart · inv(M)
  return [
    cart.x * invM[0][0] + cart.y * invM[1][0] + cart.z * invM[2][0],
    cart.x * invM[0][1] + cart.y * invM[1][1] + cart.z * invM[2][1],
    cart.x * invM[0][2] + cart.y * invM[1][2] + cart.z * invM[2][2]
  ]
}

/**
 * 获取晶胞 8 个顶点的笛卡尔坐标（遍历顺序 i,j,k = 0/1）
 * @param {Object} lattice
 * @returns {Array<{x:number,y:number,z:number}>}
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
 * 获取晶胞 12 条棱的顶点索引对
 * @returns {Array<[number, number]>}
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
 * @param {Object} lattice
 * @returns {{x:number,y:number,z:number}}
 */
export function getCellCenteredOffset(lattice) {
  const center = fractionalToCartesian([0.5, 0.5, 0.5], lattice)
  return { x: -center.x, y: -center.y, z: -center.z }
}
