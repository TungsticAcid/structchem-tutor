/**
 * geometry.js — 晶体几何工具（纯数学，无平台依赖）
 *
 * 来源：crystal/H5/src/lib/geometry-utils.js（310 行），2026-09-24 迁入共享层。
 *
 * ★ 只搬「活的」函数。原文件里另有 194 行从未被任何地方引用：
 *   `getWSCellGeometry`（维格纳-赛兹胞：把最近邻中垂面两两求交、拼出多面体）
 *   与 `extractCenteringVectors`（提取带心平移矢量）。已核实两件事：
 *     · 全项目只有**具名导入**（scene-builder 与 crystal-card），默认导出的那个
 *       对象从未被 import，因此这两个函数没有调用方
 *     · 无任何 WSC / 维格纳-赛兹 相关引用
 *   它们是"写了但没接线"的代码，放进共享层只会增加维护面，故不搬。
 *   若将来要显示 WSC，那段算法仍在 crystal 原文件与 git 历史里可取。
 *
 * ★ 修掉了 `detectLatticeType` 里一处**不可达分支**（原第 112 行）：
 *   原逻辑先算 `hasFaceCenters = hasAtomAt([.5,.5,0]) || hasAtomAt([.5,0,.5]) || hasAtomAt([0,.5,.5])`，
 *   只要其中一个面心有原子就返回 diamond/fcc；随后又写
 *   `if (hasAtomAt([0.5, 0.5, 0.0])) return 'cbase'` —— 而该条件此时必然为假，
 *   于是 `cbase`（底心）**永远不可能被返回**。
 *   正确判据是数面心**个数**：三个面心齐 = 面心立方/金刚石；只有一个 = 底心。
 *   影响范围：23 个晶体都带显式 `latticeType`，该函数只作兜底，故今天不改变
 *   任何可观察行为——但留着它意味着将来某天会静默给出错的点阵型式。
 */

/**
 * 分数坐标 → 笛卡尔坐标。
 * @param {number[]} frac [x, y, z]
 * @param {{a,b,c,alpha,beta,gamma}} lattice 晶胞参数（角度为度）
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
      + 2 * cosAlpha * cosBeta * cosGamma,
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
    z: frac[0] * a3 + frac[1] * b3 + frac[2] * c3,
  }
}

/** 晶胞 8 个顶点的笛卡尔坐标（顺序与 getCellEdges 的索引对应） */
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

/** 晶胞 12 条棱的顶点索引对 */
export function getCellEdges() {
  return [
    [0, 1], [0, 2], [0, 4], [1, 3], [1, 5],
    [2, 3], [2, 6], [3, 7], [4, 5], [4, 6],
    [5, 7], [6, 7],
  ]
}

/** 晶胞中心偏移（使晶胞居中于原点） */
export function getCellCenteredOffset(lattice) {
  const center = fractionalToCartesian([0.5, 0.5, 0.5], lattice)
  return { x: -center.x, y: -center.y, z: -center.z }
}

/**
 * 从原子坐标推断点阵型式（**兜底用**：晶体数据通常自带 `latticeType`）。
 *
 * @param {Object} crystalData
 * @returns {'sc'|'bcc'|'fcc'|'diamond'|'cbase'|'hcp'|'rHex'}
 */
export function detectLatticeType(crystalData) {
  const atoms = crystalData.atoms
  if (!atoms || atoms.length === 0) return 'sc'

  const allPos = []
  for (const g of atoms) {
    for (const p of g.positions) allPos.push(p)
  }

  const hasAtomAt = (target, tol = 0.02) => allPos.some((p) =>
    Math.abs(p[0] - target[0]) < tol &&
    Math.abs(p[1] - target[1]) < tol &&
    Math.abs(p[2] - target[2]) < tol)

  if (hasAtomAt([0.5, 0.5, 0.5])) return 'bcc'

  // ★ 数面心个数，而不是"有没有面心"——见文件头说明的不可达分支修正
  const faceCenters = [
    hasAtomAt([0.5, 0.5, 0.0]),
    hasAtomAt([0.5, 0.0, 0.5]),
    hasAtomAt([0.0, 0.5, 0.5]),
  ].filter(Boolean).length

  if (faceCenters === 3) {
    if (hasAtomAt([0.25, 0.25, 0.25])) return 'diamond'
    return 'fcc'
  }
  if (faceCenters === 1) return 'cbase'   // 只有一面带心 = 底心点阵

  const hasRObverse = hasAtomAt([0.6667, 0.3333, 0.3333]) || hasAtomAt([0.3333, 0.6667, 0.6667])
  const hasRReverse = hasAtomAt([0.3333, 0.6667, 0.3333]) || hasAtomAt([0.6667, 0.3333, 0.6667])
  if (hasRObverse || hasRReverse) return 'rHex'

  if (crystalData.crystalSystem === 'hexagonal' ||
      (crystalData.lattice && Math.abs(crystalData.lattice.gamma - 120) < 5)) return 'hcp'

  return 'sc'
}

export default {
  fractionalToCartesian,
  getCellVertices,
  getCellEdges,
  getCellCenteredOffset,
  detectLatticeType,
}
