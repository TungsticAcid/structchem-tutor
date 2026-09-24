/**
 * 场景构建模块
 * 从晶体JSON数据构建Three.js场景图，支持CPK/球棍两种模型
 */
import { fractionalToCartesian, getCellVertices, getCellEdges, getCellCenteredOffset, detectLatticeType } from './geometry-utils'
import elementsData from '../data/elements.js'
import { getElementColor as getUserElementColor, getVisualColor } from '../data/settings.js'

/** 球棍模型中原子半径系数 */
const BALL_STICK_FACTOR = 0.3
/** 化学键判定倍数（距离 < 最小距离 × 此系数 → 成键） */
const BOND_DISTANCE_RATIO = 1.15
/**
 * 配位层判定倍数：某元素对的最小距离 > 全局最小距离 × 此系数时，
 * 认为是次近邻/第二配位层，不予成键（解决 NaCl 中 Na-Na 误连等问题）
 */
const SAME_SHELL_RATIO = 1.12
/** 边界判定容差 */
const BOUNDARY_TOL = 0.02

/**
 * 创建 Web Canvas（替代 wx.createOffscreenCanvas）
 * 优先使用 OffscreenCanvas，不支持时回退到普通 Canvas
 * @param {Object} options - { width, height }
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function createWebCanvas(options = {}) {
  const { width = 128, height = 64 } = options
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height)
    }
  } catch (e) { /* 回退 */ }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * 从晶体数据构建完整3D场景
 */
export function buildCrystalScene(crystalData, THREE, options = {}) {
  const { modelType = 'ballStick', atomScale = 1.0, stickRadius = 0.08,
          cellDisplayMode = 'conventional', opacity = 0.0, fractionalShift = [0, 0, 0],
          partialAtoms = false } = options

  // 向后兼容：旧的 cellMode='motif'/'fullCell' 映射
  const mode = (options.cellMode === 'motif' || options.cellMode === 'fullCell')
    ? 'conventional' : cellDisplayMode

  // 双层 Group：外层负责旋转（世界原点=晶胞中心），内层负责偏移定位
  const crystalRoot = new THREE.Group()
  const offset = getCellCenteredOffset(crystalData.lattice)
  const contentGroup = new THREE.Group()
  contentGroup.position.set(offset.x, offset.y, offset.z)
  crystalRoot.add(contentGroup)

  // 计算原子缩放因子（CPK 空间填充模型使用晶体数据中的 cpkScale 缩放显示）
  const sizeFactor = modelType === 'ballStick' ? BALL_STICK_FACTOR : (crystalData.cpkScale || 1.0)
  const activeScale = atomScale * sizeFactor

  // 估计算数坐标中最大原子半径（用于展开相邻晶胞原子）
  let maxFracR = 0
  for (const g of crystalData.atoms) {
    const fr = estimateFractionalRadius(g, crystalData.lattice, sizeFactor, atomScale)
    if (fr > maxFracR) maxFracR = fr
  }

  // 应用分数平移（仅移动原子，格子不动）
  // 分子晶体：以分子整体为单位平移，避免撕裂分子
  const isMolecular = crystalData._molecularCrystal === true
  let shiftedAtoms
  if (isMolecular && fractionalShift && (fractionalShift[0] !== 0 || fractionalShift[1] !== 0 || fractionalShift[2] !== 0)) {
    shiftedAtoms = applyMolecularFractionalShift(crystalData.atoms, fractionalShift, crystalData.covalentBonds || [])
  } else {
    shiftedAtoms = applyFractionalShift(crystalData.atoms, fractionalShift)
  }

  // 统一使用平行六面体惯用胞展开
  const pad = partialAtoms ? maxFracR : 0
  let atoms, molecularExpandedBonds = null, molecularExpandedHBonds = null
  if (isMolecular) {
    const expanded = expandMolecularAtoms(shiftedAtoms, crystalData)
    atoms = expanded.atomGroups
    molecularExpandedBonds = expanded.expandedBonds
    molecularExpandedHBonds = expanded.expandedHBonds
  } else {
    atoms = expandAtomsToCell(shiftedAtoms, pad, crystalData)
  }

  // 裁剪平面位于晶体笛卡尔空间（contentGroup 局部帧）
  // miniprogram 的 WebGLClipping 仅用视图矩阵变换平面，因此须提供世界空间平面
  const needClipPlanes = partialAtoms
  const allClipPlanes = needClipPlanes ? getCellClipPlanes(crystalData, offset, THREE, mode) : null
  const clipPlanes = allClipPlanes || []
  const doPerAtomClipping = allClipPlanes && allClipPlanes.length > 0

  const groups = {}

  // 构建原子
  groups.atoms = buildAtoms(atoms, crystalData.lattice, THREE, activeScale, opacity, partialAtoms)
  contentGroup.add(groups.atoms)

  // 原子名称标签（始终构建，通过 visible 控制显示）
  groups.atomLabels = buildAtomLabels(atoms, crystalData.lattice, THREE, { sizeFactor, atomScale, opacity })
  if (groups.atomLabels) contentGroup.add(groups.atomLabels)

  // 世界空间裁剪：存储晶体笛卡尔原始平面和偏移，旋转时更新共享材质
  if (doPerAtomClipping) {
    groups.atoms.userData.cartClipPlanes = allClipPlanes
    groups.atoms.userData.clipOffset = offset
    applyWorldClipPlanes(groups.atoms, crystalRoot, THREE)
  }

  // 球棍模型：化学键（手动裁剪 + 端盖，仅非边界原子处截断）
  if (modelType === 'ballStick') {
    const bondData = { ...crystalData, atoms, _fractionalShift: fractionalShift }
    if (molecularExpandedBonds) {
      bondData._expandedBonds = molecularExpandedBonds
    }
    groups.bonds = buildBondCylinders(bondData, crystalData.lattice, THREE, stickRadius, opacity)
    if (groups.bonds) contentGroup.add(groups.bonds)

    // 氢键：独立分组，以晶胞边界截断
    if (molecularExpandedHBonds && molecularExpandedHBonds.length > 0) {
      bondData._expandedHBonds = molecularExpandedHBonds
      groups.hydrogenBonds = buildHydrogenBondLines(bondData, crystalData.lattice, THREE)
      if (groups.hydrogenBonds) contentGroup.add(groups.hydrogenBonds)
    }
  }

  // 线框
  groups.wireframe = buildWireframe(crystalData.lattice, THREE, crystalData, mode)
  contentGroup.add(groups.wireframe)

  // 辅助线（体对角线 + 面对角线，独立分组）
  groups.auxiliaryLines = buildAuxiliaryLines(crystalData.lattice, THREE, {
    aboveAtoms: options.auxiliaryLineAboveAtoms || false
  })
  if (groups.auxiliaryLines) {
    if (groups.auxiliaryLines.body) contentGroup.add(groups.auxiliaryLines.body)
    if (groups.auxiliaryLines.face) contentGroup.add(groups.auxiliaryLines.face)
  }

  groups.interstices = buildInterstices(crystalData.interstices, crystalData.lattice, THREE, opacity, fractionalShift)
  if (groups.interstices) {
    for (const [type, typeGroup] of Object.entries(groups.interstices)) {
      if (typeGroup) contentGroup.add(typeGroup)
    }
  }

  // 对称元素
  groups.symmetry = buildSymmetry(crystalData.symmetry, crystalData.lattice, THREE)
  if (groups.symmetry) contentGroup.add(groups.symmetry)

  // 点阵点（始终构建，通过 visible 控制显示）
  groups.latticePoints = buildLatticePoints(crystalData, crystalData.lattice, THREE, mode)
  if (groups.latticePoints) {
    contentGroup.add(groups.latticePoints)
  }

  // 坐标轴（晶体轴）
  groups.crystalAxes = buildCrystalAxesHelper(THREE, crystalData.lattice)
  contentGroup.add(groups.crystalAxes)

  // 裁剪面填充cap（仅原子，不含空隙）：仅晶胞裁剪启用时
  if (partialAtoms && allClipPlanes) {
    groups.clipCaps = buildClippingCaps(atoms, crystalData.lattice, offset, THREE, sizeFactor, atomScale, allClipPlanes)
    if (groups.clipCaps) {
      contentGroup.add(groups.clipCaps)
      // cap 与原子共享同一套裁剪平面，统一由 clipMaterials 管理旋转更新
      if (groups.clipCaps.userData.capMaterials) {
        groups.atoms.userData.clipMaterials.push(...groups.clipCaps.userData.capMaterials)
      }
    }
  }

  const suggestedRadius = computeSuggestedRadius(crystalData)

  const useLocalClipping = allClipPlanes && allClipPlanes.length > 0

  return { crystalRoot, groups, suggestedRadius, clipPlanes, useLocalClipping }
}

// ==================== 晶胞裁剪平面 ====================

/**
 * 由任意凸多面体的顶点和面索引构建裁剪平面数组
 * 对每个面取前3个不共线顶点求法向量，用中心点判断朝向（法向量指向多面体内部）
 * @param {Array<{x:number,y:number,z:number}>} worldVerts - 世界空间顶点
 * @param {Array<number[]>} faceIndices - 每个面的顶点索引数组
 * @param {{x:number,y:number,z:number}} center - 多面体中心（世界空间）
 * @param {Object} THREE
 * @returns {THREE.Plane[]}
 */
function buildConvexPolyhedronClipPlanes(worldVerts, faceIndices, center, THREE) {
  const planes = []
  for (const indices of faceIndices) {
    if (indices.length < 3) continue
    // 取前3个不共线顶点计算法向量
    const va = worldVerts[indices[0]]
    let vb = null, vc = null
    for (let i = 1; i < indices.length - 1; i++) {
      vb = worldVerts[indices[i]]
      vc = worldVerts[indices[i + 1]]
      const e1x = vb.x - va.x, e1y = vb.y - va.y, e1z = vb.z - va.z
      const e2x = vc.x - va.x, e2y = vc.y - va.y, e2z = vc.z - va.z
      const crossLen = Math.sqrt(
        Math.pow(e1y * e2z - e1z * e2y, 2) +
        Math.pow(e1z * e2x - e1x * e2z, 2) +
        Math.pow(e1x * e2y - e1y * e2x, 2)
      )
      if (crossLen > 1e-10) break
      vb = null; vc = null
    }
    if (!vb || !vc) continue

    const e1x = vb.x - va.x, e1y = vb.y - va.y, e1z = vb.z - va.z
    const e2x = vc.x - va.x, e2y = vc.y - va.y, e2z = vc.z - va.z
    let nx = e1y * e2z - e1z * e2y
    let ny = e1z * e2x - e1x * e2z
    let nz = e1x * e2y - e1y * e2x
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (len < 1e-10) continue
    nx /= len; ny /= len; nz /= len

    // 确保法向量指向多面体内部
    // dx/dy/dz 是从面顶点指向中心，若 n·d < 0 则法向量向外，需翻转
    const dx = center.x - va.x, dy = center.y - va.y, dz = center.z - va.z
    if (nx * dx + ny * dy + nz * dz < 0) { nx = -nx; ny = -ny; nz = -nz }

    planes.push(new THREE.Plane(
      new THREE.Vector3(nx, ny, nz), -(nx * va.x + ny * va.y + nz * va.z)
    ))
  }
  return planes
}

/**
 * 根据晶体数据和显示模式获取裁剪用几何体
 * @param {Object} crystalData
 * @param {string} mode - 'conventional' | 'primitive'
 * @returns {{ vertices, faces, center }}
 */
function getCellClippingGeometry(crystalData, mode = 'conventional') {
  const { lattice } = crystalData

  // 统一使用标准平行六面体（6面）
  const corners = getCellVertices(lattice)
  const paraFaces = [
    [0, 2, 4, 6], [1, 3, 5, 7],
    [0, 1, 4, 5], [2, 3, 6, 7],
    [0, 1, 2, 3], [4, 5, 6, 7]
  ]
  const paraCenter = fractionalToCartesian([0.5, 0.5, 0.5], lattice)
  return { vertices: corners, faces: paraFaces, center: paraCenter }
}

/** 获取晶胞裁剪平面（晶体笛卡尔坐标空间，即 contentGroup 局部帧） */
function getCellClipPlanes(crystalData, offset, THREE, mode = 'conventional') {
  const geom = getCellClippingGeometry(crystalData, mode)
  // 顶点和中心已在晶体笛卡尔空间中（getCellVertices 输出 Cartesian）——
  // 匹配 contentGroup 局部帧，供 localClippingEnabled 裁剪使用
  return buildConvexPolyhedronClipPlanes(geom.vertices, geom.faces, geom.center, THREE)
}

/**
 * 将世界空间裁剪平面应用到原子和 cap 的所有共享材质
 * miniprogram 的 WebGLClipping 仅用视图矩阵变换平面（无模型矩阵），
 * 因此 material.clippingPlanes 须提供世界空间平面。
 * 晶体笛卡尔平面 → 世界空间：normal' = R(normal), constant' = constant - normal·offset
 * @param {THREE.Group} atomsGroup - 原子组（含 userData.clipMaterials/cartClipPlanes/clipOffset）
 * @param {THREE.Group} crystalRoot - 晶体根节点（提供旋转四元数）
 * @param {Object} THREE - Three.js 实例
 */
function applyWorldClipPlanes(atomsGroup, crystalRoot, THREE) {
  const clipMaterials = atomsGroup.userData.clipMaterials
  const cartPlanes = atomsGroup.userData.cartClipPlanes
  const offset = atomsGroup.userData.clipOffset
  if (!clipMaterials || !cartPlanes || !offset) return

  const R = crystalRoot.quaternion
  const offsetVec = new THREE.Vector3(offset.x, offset.y, offset.z)
  const worldPlanes = cartPlanes.map(p => {
    const normal = p.normal.clone().applyQuaternion(R)
    const constant = p.constant - p.normal.dot(offsetVec)
    return new THREE.Plane(normal, constant)
  })

  for (const mat of clipMaterials) {
    mat.clippingPlanes = worldPlanes
    mat.clipIntersection = false
    mat.clipShadows = true
    mat.needsUpdate = true
  }
}

/**
 * 旋转时更新原子共享材质的世界空间裁剪平面
 * 由 viewer-canvas 在 crystalRoot 旋转后调用
 * @param {THREE.Group} atomsGroup
 * @param {THREE.Group} crystalRoot
 * @param {Object} THREE
 */
export function updateWorldClipPlanes(atomsGroup, crystalRoot, THREE) {
  if (!atomsGroup || !crystalRoot) return
  applyWorldClipPlanes(atomsGroup, crystalRoot, THREE)
}

// ==================== 辅助函数 ====================

/** 对原子位置应用分数平移（平移后归一化到[0,1)） */
function applyFractionalShift(atomGroups, shift) {
  if (!shift || (shift[0] === 0 && shift[1] === 0 && shift[2] === 0)) return atomGroups
  return atomGroups.map(group => ({
    ...group,
    positions: group.positions.map(pos => [
      ((pos[0] + shift[0]) % 1 + 1) % 1,
      ((pos[1] + shift[1]) % 1 + 1) % 1,
      ((pos[2] + shift[2]) % 1 + 1) % 1
    ])
  }))
}

/**
 * 分子晶体的分数平移——以分子整体为单位
 * 分子中心移出晶胞 [0,1) 后整个分子一起包裹，保持内部结构不变
 */
function applyMolecularFractionalShift(atomGroups, shift, covalentBonds) {
  if (!shift || (shift[0] === 0 && shift[1] === 0 && shift[2] === 0)) return atomGroups

  // Step 1: 展开所有原子，建立 ID→原子 映射
  const allAtoms = []
  for (let gi = 0; gi < atomGroups.length; gi++) {
    const g = atomGroups[gi]
    for (let pi = 0; pi < g.positions.length; pi++) {
      allAtoms.push({
        id: g.ids && g.ids[pi] ? g.ids[pi] : null,
        element: g.element,
        position: [...g.positions[pi]],
        groupIndex: gi,
        posIndex: pi
      })
    }
  }
  const atomById = {}
  for (const a of allAtoms) { if (a.id != null) atomById[a.id] = a }

  // Step 2: 从共价键构建分子图
  const adj = {}
  for (const a of allAtoms) { if (a.id != null) adj[a.id] = [] }
  for (const bond of (covalentBonds || [])) {
    const aId = typeof bond.from === 'string' ? bond.from : bond[0]
    const bId = typeof bond.to === 'string' ? bond.to : bond[1]
    if (adj[aId] && adj[bId]) {
      adj[aId].push(bId)
      adj[bId].push(aId)
    }
  }

  // Step 3: BFS 识别分子（连通分量）
  const visited = new Set()
  const molecules = []
  for (const a of allAtoms) {
    if (a.id == null || visited.has(a.id) || !adj[a.id]) continue
    const comp = []
    const stack = [a.id]
    visited.add(a.id)
    while (stack.length > 0) {
      const vid = stack.pop()
      comp.push(atomById[vid])
      for (const w of adj[vid] || []) {
        if (!visited.has(w)) { visited.add(w); stack.push(w) }
      }
    }
    molecules.push(comp)
  }

  // 收集未参与任何共价键的孤立原子
  const molAtomIds = new Set()
  for (const mol of molecules) {
    for (const a of mol) molAtomIds.add(a.id)
  }
  const orphanAtoms = allAtoms.filter(a => a.id == null || !molAtomIds.has(a.id))

  // Step 4: 对每个分子，计算中心 → 应用 shift → 确定包裹 → 统一平移
  const shiftsForAtom = {}  // id -> [dx, dy, dz] 该原子的净位移
  for (const mol of molecules) {
    // 计算分子几何中心（最小镜像约定，以第一个原子为参考，与 expandMolecularAtoms 一致）
    const refAtom = mol[0]
    const relSum = [0, 0, 0]
    for (const atom of mol) {
      for (let k = 0; k < 3; k++) {
        let d = atom.position[k] - refAtom.position[k]
        d = ((d + 0.5) % 1 + 1) % 1 - 0.5
        relSum[k] += d
      }
    }
    const center = [0, 0, 0]
    for (let k = 0; k < 3; k++) {
      center[k] = ((refAtom.position[k] + relSum[k] / mol.length) % 1 + 1) % 1
    }

    // 对中心应用 shift，确定包裹
    const shiftedCenter = [0, 0, 0]
    const wrap = [0, 0, 0]
    const effectiveShift = [0, 0, 0]
    for (let k = 0; k < 3; k++) {
      shiftedCenter[k] = center[k] + shift[k]
      wrap[k] = Math.floor(shiftedCenter[k])
      effectiveShift[k] = shift[k] - wrap[k]
    }

    // 分子内所有原子统一加 effectiveShift
    for (const atom of mol) {
      shiftsForAtom[atom.id] = effectiveShift
    }
  }

  // Step 5: 重建各 group 的 positions 数组
  const newPositions = {}  // groupIndex -> [[x,y,z], ...]
  for (const atom of allAtoms) {
    const delta = shiftsForAtom[atom.id] || shift  // 孤立原子用原始逐原子 shift
    const newPos = [
      ((atom.position[0] + delta[0]) % 1 + 1) % 1,
      ((atom.position[1] + delta[1]) % 1 + 1) % 1,
      ((atom.position[2] + delta[2]) % 1 + 1) % 1
    ]
    if (!newPositions[atom.groupIndex]) newPositions[atom.groupIndex] = []
    newPositions[atom.groupIndex][atom.posIndex] = newPos
  }

  return atomGroups.map((group, gi) => ({
    ...group,
    positions: newPositions[gi] || group.positions
  }))
}

/** 根据晶胞参数计算建议相机距离 */
function computeSuggestedRadius(crystalData) {
  const { a, b, c } = crystalData.lattice
  const diag = Math.sqrt(a * a + b * b + c * c)
  const boundingRadius = diag / 2
  let maxAtomRadius = 0
  if (crystalData.atoms) {
    for (const group of crystalData.atoms) {
      if (group.radius > maxAtomRadius) maxAtomRadius = group.radius
    }
  }
  const effectiveRadius = boundingRadius + maxAtomRadius
  return Math.max(effectiveRadius / 0.414 * 1.3, 6.0)
}

// ==================== 完整晶胞原子展开 ====================

function expandAtomsToCell(atomGroups, padFrac = 0, crystalData, mode = 'conventional') {
  const TOLERANCE = 0.05
  const lo = -TOLERANCE - padFrac
  const hi = 1 + TOLERANCE + padFrac
  const result = []

  for (const group of atomGroups) {
    const expandedPositions = []
    const seen = new Set()

    for (const pos of group.positions) {
      for (let di = -2; di <= 2; di++) {
        for (let dj = -2; dj <= 2; dj++) {
          for (let dk = -2; dk <= 2; dk++) {
            const fx = pos[0] + di
            const fy = pos[1] + dj
            const fz = pos[2] + dk
            if (fx >= lo && fx < hi &&
                fy >= lo && fy < hi &&
                fz >= lo && fz < hi) {
              const key = `${fx.toFixed(5)},${fy.toFixed(5)},${fz.toFixed(5)}`
              if (!seen.has(key)) {
                seen.add(key)
                expandedPositions.push([parseFloat(fx.toFixed(5)), parseFloat(fy.toFixed(5)), parseFloat(fz.toFixed(5))])
              }
            }
          }
        }
      }
    }

    result.push({ ...group, positions: expandedPositions })
  }

  return result
}

/**
 * 分子晶体原子展开（新ID机制）：
 *   原子通过 id 标识，共价键通过原子 id 引用，键随分子整体展开，
 *   分子间氢键通过周期性镜像搜索独立展开。
 *   旧格式（无 ids）自动回退到坐标匹配的旧逻辑。
 * @param {Array} atomGroups - 原子分组（含 positions 及可选的 ids 数组）
 * @param {Object} crystalData - 完整晶体数据
 * @returns {{ atomGroups: Array, expandedBonds: Array|null }}
 */
function expandMolecularAtoms(atomGroups, crystalData) {
  const TOL = 0.02
  const lattice = crystalData.lattice

  // ====== 检测是否使用新ID格式 ======
  const hasIds = atomGroups.some(g => g.ids && g.ids.length > 0)
  if (!hasIds) {
    // 旧格式回退：通过坐标匹配
    return expandMolecularAtomsLegacy(atomGroups, crystalData)
  }

  // ====== Step 1: 构建原子ID映射 ======
  /** @type {Array<{id:string, element:string, position:number[], groupIndex:number, posIndex:number}>} */
  const allAtoms = []
  for (let gi = 0; gi < atomGroups.length; gi++) {
    const g = atomGroups[gi]
    for (let pi = 0; pi < g.positions.length; pi++) {
      allAtoms.push({
        id: g.ids[pi],
        element: g.element,
        position: g.positions[pi],
        color: g.color,
        radius: g.radius,
        groupIndex: gi,
        posIndex: pi
      })
    }
  }
  const atomById = {}
  for (const a of allAtoms) atomById[a.id] = a

  // ====== Step 2: 从共价键构建分子图 ======
  const covalentBonds = crystalData.covalentBonds || []
  const adj = {}
  for (const a of allAtoms) adj[a.id] = []
  for (const bond of covalentBonds) {
    const aId = typeof bond.from === 'string' ? bond.from : bond[0]
    const bId = typeof bond.to === 'string' ? bond.to : bond[1]
    if (adj[aId] && adj[bId]) {
      adj[aId].push(bId)
      adj[bId].push(aId)
    }
  }

  // ====== Step 3: 识别分子（连通分量） ======
  const visited = new Set()
  const molecules = []  // 每个分子 = [{id, element, position, ...}]
  for (const a of allAtoms) {
    if (visited.has(a.id) || !adj[a.id]) continue
    const comp = []
    const stack = [a.id]
    visited.add(a.id)
    while (stack.length > 0) {
      const vid = stack.pop()
      comp.push(atomById[vid])
      for (const w of adj[vid] || []) {
        if (!visited.has(w)) { visited.add(w); stack.push(w) }
      }
    }
    molecules.push(comp)
  }

  // ====== Step 4: 确定每个分子的展开平移向量 ======
  // 分子晶体中，分子是不可分割的整体。同时用分子质心和各原子位置判断晶胞位置，
  // 取边界数更高者：对称分子（I₂、CO₂）质心在格点，极性分子（H₂O、尿素）重原子在格点。
  //   3个边界坐标 → 顶点 → 8 份（{0,1}³）
  //   2个边界坐标 → 棱上 → 4 份（沿棱方向不动，另两维 {0,1} 组合）
  //   1个边界坐标 → 面上 → 2 份（面内不动，法向 {0,1}）
  //   0个边界坐标 → 体内 → 1 份
  const isOnBoundaryVal = (v) => Math.abs(v) < TOL || Math.abs(v - 1) < TOL

  const moleculeMeta = molecules.map(mol => {
    // 计算分子质心（最小镜像约定，以第一个原子为参考）
    const refAtom = mol[0]
    const relSum = [0, 0, 0]
    for (const atom of mol) {
      for (let k = 0; k < 3; k++) {
        let d = atom.position[k] - refAtom.position[k]
        d = ((d + 0.5) % 1 + 1) % 1 - 0.5
        relSum[k] += d
      }
    }
    const center = [0, 0, 0]
    for (let k = 0; k < 3; k++) {
      center[k] = ((refAtom.position[k] + relSum[k] / mol.length) % 1 + 1) % 1
    }

    // 质心的边界检测
    const centerBoundaryAxes = []
    for (let k = 0; k < 3; k++) {
      if (isOnBoundaryVal(center[k])) centerBoundaryAxes.push(k)
    }

    // 各原子的边界检测，取最大值
    let bestAtomBoundaryAxes = []
    let bestAtomIdx = 0
    for (let ai = 0; ai < mol.length; ai++) {
      const axes = []
      for (let k = 0; k < 3; k++) {
        if (isOnBoundaryVal(mol[ai].position[k])) axes.push(k)
      }
      if (axes.length > bestAtomBoundaryAxes.length) {
        bestAtomBoundaryAxes = axes
        bestAtomIdx = ai
      }
    }

    // 选择边界数更高的方案：质心 vs 最佳原子
    let maxBound, boundaryAxes, anchorType, anchorIdx
    if (centerBoundaryAxes.length >= bestAtomBoundaryAxes.length) {
      maxBound = centerBoundaryAxes.length
      boundaryAxes = centerBoundaryAxes
      anchorType = 'center'
      anchorIdx = -1
    } else {
      maxBound = bestAtomBoundaryAxes.length
      boundaryAxes = bestAtomBoundaryAxes
      anchorType = 'atom'
      anchorIdx = bestAtomIdx
    }

    const shifts = []
    if (maxBound === 3) {
      for (let dx = 0; dx <= 1; dx++)
        for (let dy = 0; dy <= 1; dy++)
          for (let dz = 0; dz <= 1; dz++)
            shifts.push([dx, dy, dz])
    } else if (maxBound === 2) {
      const [a1, a2] = boundaryAxes
      for (let v1 = 0; v1 <= 1; v1++)
        for (let v2 = 0; v2 <= 1; v2++) {
          const s = [0, 0, 0]
          s[a1] = v1; s[a2] = v2
          shifts.push(s)
        }
    } else if (maxBound === 1) {
      const axis = boundaryAxes[0]
      for (let v = 0; v <= 1; v++) {
        const s = [0, 0, 0]
        s[axis] = v
        shifts.push(s)
      }
    } else {
      shifts.push([0, 0, 0])
    }
    return { shifts, center, anchorType, anchorIdx }
  })

  // ====== Step 4b: 最小镜像归一化 + 按平移向量生成所有原子副本 ======
  /** @type {Array<{id:string, element:string, position:number[], color:string, radius:number, _molIdx:number, _shift:number[]}>} */
  const expandedAtoms = []

  for (let mi = 0; mi < molecules.length; mi++) {
    const mol = molecules[mi]
    const { shifts, center, anchorType, anchorIdx } = moleculeMeta[mi]

    // 选择锚定点：质心或最佳边界原子
    const anchorPos = anchorType === 'center' ? center : mol[anchorIdx].position

    // 计算每个原子相对锚定点的最小镜像位移
    const relPositions = mol.map(atom => {
      const rel = [0, 0, 0]
      for (let k = 0; k < 3; k++) {
        let d = atom.position[k] - anchorPos[k]
        d = ((d + 0.5) % 1 + 1) % 1 - 0.5
        rel[k] = d
      }
      return rel
    })

    for (const [dx, dy, dz] of shifts) {
      const anchorShifted = [
        anchorPos[0] + dx,
        anchorPos[1] + dy,
        anchorPos[2] + dz
      ]

      for (let ai = 0; ai < mol.length; ai++) {
        const atom = mol[ai]
        const rel = relPositions[ai]
        expandedAtoms.push({
          id: atom.id,
          element: atom.element,
          position: [
            parseFloat((anchorShifted[0] + rel[0]).toFixed(5)),
            parseFloat((anchorShifted[1] + rel[1]).toFixed(5)),
            parseFloat((anchorShifted[2] + rel[2]).toFixed(5))
          ],
          color: atom.color,
          radius: atom.radius,
          _molIdx: mi,
          _shift: [dx, dy, dz]
        })
      }
    }
  }

  // 去重
  const seen = new Set()
  const deduped = []
  for (const a of expandedAtoms) {
    const key = `${a.id}|${a.position[0].toFixed(5)},${a.position[1].toFixed(5)},${a.position[2].toFixed(5)}`
    if (!seen.has(key)) { seen.add(key); deduped.push(a) }
  }

  // ====== Step 5: 生成展开后的共价键 ======
  const expandedBonds = []
  for (const bond of covalentBonds) {
    const aId = typeof bond.from === 'string' ? bond.from : bond[0]
    const bId = typeof bond.to === 'string' ? bond.to : bond[1]
    const bondColor = bond.color || '#808080'

    const aAtoms = deduped.filter(x => x.id === aId)
    const bAtoms = deduped.filter(x => x.id === bId)

    for (const a of aAtoms) {
      for (const b of bAtoms) {
        // 同一分子、相同平移 → 匹配
        if (a._molIdx === b._molIdx &&
            a._shift[0] === b._shift[0] &&
            a._shift[1] === b._shift[1] &&
            a._shift[2] === b._shift[2]) {
          expandedBonds.push({
            from: [...a.position],
            to: [...b.position],
            fromColor: a.color || bondColor,
            toColor: b.color || bondColor,
            dashed: false
          })
        }
      }
    }
  }

  // ====== Step 6: 生成分子间氢键（周期性镜像搜索，独立于共价键） ======
  const hydrogenBonds = crystalData.hydrogenBonds || []
  const expandedHBonds = []
  // 索引：展开后每个 id 对应的所有位置
  const expandedById = {}
  for (const a of deduped) {
    if (!expandedById[a.id]) expandedById[a.id] = []
    expandedById[a.id].push(a)
  }

  for (const hb of hydrogenBonds) {
    const hId = typeof hb.from === 'string' ? hb.from : hb[0]
    const oId = typeof hb.to === 'string' ? hb.to : hb[1]
    const hbColor = hb.color || '#64B5F6'

    const hAtoms = expandedById[hId] || []
    const oAtoms = expandedById[oId] || []
    if (hAtoms.length === 0 || oAtoms.length === 0) continue

    // 生成O原子的周期性镜像（±1胞）
    const oImages = []
    for (const o of oAtoms) {
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          for (let dk = -1; dk <= 1; dk++) {
            oImages.push({
              position: [o.position[0] + di, o.position[1] + dj, o.position[2] + dk],
              origO: o
            })
          }
        }
      }
    }

    // 每个H原子找最近的O镜像（H键距离阈值 ~2.2Å）
    for (const h of hAtoms) {
      const hCart = fractionalToCartesian(h.position, lattice)
      let bestO = null, bestDist = Infinity, bestImgPos = null

      for (const oImg of oImages) {
        const oCart = fractionalToCartesian(oImg.position, lattice)
        const dx = hCart.x - oCart.x, dy = hCart.y - oCart.y, dz = hCart.z - oCart.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < bestDist) { bestDist = dist; bestO = oImg.origO; bestImgPos = oImg.position }
      }

      // H…O 氢键距离通常在 1.6~2.2Å 之间
      if (bestO && bestDist > 0.5 && bestDist < 2.2) {
        expandedHBonds.push({
          from: [...h.position],
          to: [parseFloat(bestImgPos[0].toFixed(5)), parseFloat(bestImgPos[1].toFixed(5)), parseFloat(bestImgPos[2].toFixed(5))],
          fromColor: hbColor,
          toColor: hbColor
        })
      }
    }
  }

  // ====== Step 7: 转换为旧 atomGroups 格式（兼容后续处理） ======
  const elemGroups = {}
  for (const a of deduped) {
    const elem = a.element
    if (!elemGroups[elem]) {
      elemGroups[elem] = { element: elem, color: a.color, radius: a.radius, positions: [] }
    }
    elemGroups[elem].positions.push(a.position)
  }
  const resultGroups = Object.values(elemGroups)

  return { atomGroups: resultGroups, expandedBonds, expandedHBonds }
}

/**
 * 旧版分子晶体展开（坐标匹配，回退兼容）
 */
function expandMolecularAtomsLegacy(atomGroups, crystalData) {
  const bonds = crystalData.bonds || []
  const TOL = 0.02

  // 构建原子ID映射：groupIndex:positionIndex → { groupIndex, positionIndex, position }
  const atomById = new Map()
  for (let gi = 0; gi < atomGroups.length; gi++) {
    for (let pi = 0; pi < atomGroups[gi].positions.length; pi++) {
      const id = `${gi}:${pi}`
      atomById.set(id, { groupIndex: gi, positionIndex: pi, position: atomGroups[gi].positions[pi] })
    }
  }

  // 根据分数坐标查找对应的原子ID
  const findAtomId = (fracPos) => {
    let bestId = null, bestDist = Infinity
    for (const [id, atom] of atomById) {
      const p = atom.position
      const dist = Math.sqrt((p[0] - fracPos[0]) ** 2 + (p[1] - fracPos[1]) ** 2 + (p[2] - fracPos[2]) ** 2)
      if (dist < TOL && dist < bestDist) { bestDist = dist; bestId = id }
    }
    return bestId
  }

  // 根据化学键构建邻接表（仅共价键，跳过分子间氢键等虚线键）
  const adj = new Map()
  for (const [id] of atomById) adj.set(id, [])
  for (const bond of bonds) {
    if (bond.dashed) continue  // 跳过分子间弱键（如氢键），仅用共价键判定分子
    const ai = findAtomId(bond.from)
    const bi = findAtomId(bond.to)
    if (ai && bi && ai !== bi) {
      adj.get(ai).push(bi)
      adj.get(bi).push(ai)
    }
  }

  // 通过图遍历识别连通分量（分子）
  const visited = new Set()
  const molecules = []
  for (const [id] of atomById) {
    if (visited.has(id)) continue
    const comp = []
    const stack = [id]
    visited.add(id)
    while (stack.length > 0) {
      const v = stack.pop()
      comp.push(v)
      for (const w of (adj.get(v) || [])) {
        if (!visited.has(w)) { visited.add(w); stack.push(w) }
      }
    }
    molecules.push(comp)
  }

  // 判断坐标是否在晶胞边界上
  const isOnBoundary = (v) => Math.abs(v) < TOL || Math.abs(v - 1) < TOL

  // ====== 为每个分子计算展开平移向量（同新机制的 vertex/edge/face/interior 分类） ======
  const moleculeMeta = molecules.map(comp => {
    // 找出分子中包含最多边界坐标的锚定原子
    let maxBound = 0, boundaryAxes = [], anchorId = null
    for (const id of comp) {
      const a = atomById.get(id)
      if (!a) continue
      const axes = []
      for (let k = 0; k < 3; k++) {
        if (isOnBoundary(a.position[k])) axes.push(k)
      }
      if (axes.length > maxBound) {
        maxBound = axes.length
        boundaryAxes = axes
        anchorId = id
      }
    }

    const shifts = []
    if (maxBound === 3) {
      for (let dx = 0; dx <= 1; dx++)
        for (let dy = 0; dy <= 1; dy++)
          for (let dz = 0; dz <= 1; dz++)
            shifts.push([dx, dy, dz])
    } else if (maxBound === 2) {
      const [a1, a2] = boundaryAxes
      for (let v1 = 0; v1 <= 1; v1++)
        for (let v2 = 0; v2 <= 1; v2++) {
          const s = [0, 0, 0]
          s[a1] = v1; s[a2] = v2
          shifts.push(s)
        }
    } else if (maxBound === 1) {
      const axis = boundaryAxes[0]
      for (let v = 0; v <= 1; v++) {
        const s = [0, 0, 0]
        s[axis] = v
        shifts.push(s)
      }
    } else {
      shifts.push([0, 0, 0])
    }
    return { shifts, anchorId }
  })

  // ====== 最小镜像归一化 + 按分子整体展开 ======
  // 构建逐原子收集结构：groupIndex → positionIndex → [位置数组]
  const collected = []
  for (let gi = 0; gi < atomGroups.length; gi++) {
    collected.push([])
    for (let pi = 0; pi < atomGroups[gi].positions.length; pi++) {
      collected[gi].push([])
    }
  }

  for (let mi = 0; mi < molecules.length; mi++) {
    const comp = molecules[mi]
    const { shifts, anchorId } = moleculeMeta[mi]
    const anchor = anchorId ? atomById.get(anchorId) : null

    // 计算每个原子相对锚定原子的最小镜像位移
    const relPositions = new Map()
    if (anchor) {
      for (const id of comp) {
        const a = atomById.get(id)
        if (!a) continue
        const rel = [0, 0, 0]
        for (let k = 0; k < 3; k++) {
          let d = a.position[k] - anchor.position[k]
          d = ((d + 0.5) % 1 + 1) % 1 - 0.5
          rel[k] = d
        }
        relPositions.set(id, rel)
      }
    }

    for (const [dx, dy, dz] of shifts) {
      const anchorShifted = anchor ? [
        anchor.position[0] + dx,
        anchor.position[1] + dy,
        anchor.position[2] + dz
      ] : [dx, dy, dz]

      for (const id of comp) {
        const a = atomById.get(id)
        if (!a) continue
        const rel = relPositions.get(id) || [0, 0, 0]
        const fx = parseFloat((anchorShifted[0] + rel[0]).toFixed(5))
        const fy = parseFloat((anchorShifted[1] + rel[1]).toFixed(5))
        const fz = parseFloat((anchorShifted[2] + rel[2]).toFixed(5))
        collected[a.groupIndex][a.positionIndex].push([fx, fy, fz])
      }
    }
  }

  // 去重并构建结果
  const result = []
  for (let gi = 0; gi < atomGroups.length; gi++) {
    const group = atomGroups[gi]
    const expandedPositions = []
    const seen = new Set()

    for (let pi = 0; pi < group.positions.length; pi++) {
      for (const pos of collected[gi][pi]) {
        const key = `${pos[0].toFixed(5)},${pos[1].toFixed(5)},${pos[2].toFixed(5)}`
        if (!seen.has(key)) {
          seen.add(key)
          expandedPositions.push(pos)
        }
      }
    }

    result.push({ ...group, positions: expandedPositions })
  }

  return { atomGroups: result, expandedBonds: null }
}

/** 估算原子在分数坐标中的近似半径 */
function estimateFractionalRadius(atomGroup, lattice, sizeFactor, atomScale) {
  const r = (atomGroup.radius || 1.0) * sizeFactor * atomScale
  const avgAxis = (lattice.a + lattice.b + lattice.c) / 3
  return r / (avgAxis || 1)
}

/** 六边形底面6个顶点（笛卡尔坐标），缓存避免重复计算 */
let _hexVertsCache = null
/** 判断原子是否在晶胞边界上 */
function isOnBoundary(f) {
  return Math.abs(f[0]) < BOUNDARY_TOL || Math.abs(f[0] - 1) < BOUNDARY_TOL ||
         Math.abs(f[1]) < BOUNDARY_TOL || Math.abs(f[1] - 1) < BOUNDARY_TOL ||
         Math.abs(f[2]) < BOUNDARY_TOL || Math.abs(f[2] - 1) < BOUNDARY_TOL
}

/**
 * 构建裁剪面填充（cap disc）：为边界原子在与晶胞面相切处生成彩色圆片
 * cap 与原子共享裁剪平面，使得顶点处仅显示 1/4 圆，棱中点处仅显示 1/2 圆
 */
function buildClippingCaps(atomGroups, lattice, offset, THREE, sizeFactor, atomScale, clipPlanes) {
  const group = new THREE.Group()
  if (!clipPlanes || clipPlanes.length === 0) return group

  const capMaterials = {}  // element → shared MeshBasicMaterial

  for (const atomGroup of atomGroups) {
    const positions = atomGroup.positions
    if (!positions || positions.length === 0) continue

    const atomColor = getUserElementColor(atomGroup.element) || atomGroup.color || '#cccccc'
    const cartR = (atomGroup.radius || 1.0) * sizeFactor * atomScale

    // 共享 cap 材质：每个元素仅创建一个材质实例，裁剪平面由 applyWorldClipPlanes 统一管理
    if (!capMaterials[atomGroup.element]) {
      capMaterials[atomGroup.element] = new THREE.MeshBasicMaterial({
        color: atomColor,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false
      })
    }
    const capMat = capMaterials[atomGroup.element]

    for (let i = 0; i < positions.length; i++) {
      const cart = fractionalToCartesian(positions[i], lattice)
      const atomCenter = new THREE.Vector3(cart.x, cart.y, cart.z)

      for (const plane of clipPlanes) {
        const dist = plane.distanceToPoint(atomCenter)
        if (Math.abs(dist) >= cartR) continue
        const capR = Math.sqrt(Math.max(0, cartR * cartR - dist * dist))
        if (capR < 0.005) continue

        const capGeom = new THREE.CircleGeometry(capR, 16)
        const capMesh = new THREE.Mesh(capGeom, capMat)

        // cap 偏移 0.02 防止 z-fighting，renderOrder = 1 确保在原子之后渲染
        capMesh.position.copy(atomCenter.clone().addScaledVector(plane.normal, -dist + 0.02))

        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1), plane.normal.clone()
        )
        capMesh.quaternion.copy(q)
        capMesh.renderOrder = 1
        group.add(capMesh)
      }
    }
  }

  // 将 cap 材质引用存入 userData，供 buildCrystalScene 并入 clipMaterials 统一管理
  group.userData.capMaterials = Object.values(capMaterials)
  return group
}

// ==================== 原子渲染 ====================

function buildAtoms(atomGroups, lattice, THREE, sizeFactor, opacity = 0.0, partialAtoms = false) {
  const group = new THREE.Group()
  const sharedMaterials = {}
  const sharedGeom = new THREE.SphereGeometry(1, 32, 32)
  // 边界裁剪材质（仅 partialAtoms 启用时加入裁剪列表）
  const clipMaterials = []

  for (const atomGroup of atomGroups) {
    const positions = atomGroup.positions
    if (!positions || positions.length === 0) continue

    const atomColor = getUserElementColor(atomGroup.element) || atomGroup.color || '#ffffff'
    // 提亮材质颜色：Phong 材质下 diffuse = 材质色 × 光照，深色元素色会被光照进一步压暗。
    // 结合白色环境光（viewer 默认 lightConfig），让球体呈现接近元素原色/截面的亮度。
    const brightenedColor = new THREE.Color(atomColor).offsetHSL(0, 0, 0.06)
    const scale = (atomGroup.radius || 1.0) * sizeFactor

    // 为每个元素创建两种材质：内部材质（无裁剪）和边界材质（可裁剪）
    if (!sharedMaterials[atomGroup.element]) {
      const matOpts = {
        color: brightenedColor,
        // H5 增强高光：让球体更有光泽（小程序为 shininess 30 / specular 0x222222）
        shininess: 60,
        specular: new THREE.Color(0x666666)
      }
      const matOpacity = 1.0 - opacity
      if (matOpacity < 1.0) {
        matOpts.transparent = true
        matOpts.opacity = matOpacity
        matOpts.depthWrite = matOpacity > 0.5
      }
      const interiorMat = new THREE.MeshPhongMaterial(matOpts)
      const boundaryMat = new THREE.MeshPhongMaterial(matOpts)
      sharedMaterials[atomGroup.element] = { interior: interiorMat, boundary: boundaryMat }
      if (partialAtoms) {
        clipMaterials.push(boundaryMat)
      }
    }
    const mats = sharedMaterials[atomGroup.element]

    for (let i = 0; i < positions.length; i++) {
      const mesh = new THREE.Mesh(sharedGeom, (partialAtoms && isOnCellBoundary(positions[i])) ? mats.boundary : mats.interior)
      const cart = fractionalToCartesian(positions[i], lattice)
      mesh.position.set(cart.x, cart.y, cart.z)
      mesh.scale.set(scale, scale, scale)
      mesh._element = atomGroup.element
      mesh._positionIndex = i
      mesh._position = [...positions[i]]
      group.add(mesh)
    }
  }

  group.userData.sharedMaterials = sharedMaterials
  group.userData.clipMaterials = clipMaterials
  return group
}

/** 判断分数坐标是否在晶胞边界上（含外部扩展原子） */
function isOnCellBoundary(fracPos, tol = 0.02) {
  for (const c of fracPos) {
    if (c <= tol || c >= 1 - tol) return true
  }
  return false
}

// ==================== 原子标签精灵 ====================

/**
 * 根据颜色计算对比色（用于标签文字）
 * 亮度 > 0.5 返回深色，否则返回亮色
 */
function getContrastColor(hexColor) {
  const r = parseInt(hexColor.slice(1, 3), 16) / 255
  const g = parseInt(hexColor.slice(3, 5), 16) / 255
  const b = parseInt(hexColor.slice(5, 7), 16) / 255
  // 相对亮度公式（sRGB）
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.5 ? '#1a1a1a' : '#f0f0f0'
}

/**
 * 为每个原子创建文字标签精灵（显示元素名称）
 * 每种元素共享一个 canvas 纹理，Sprite 始终面向相机
 */
function buildAtomLabels(atomGroups, lattice, THREE, options = {}) {
  const group = new THREE.Group()
  const { sizeFactor = 1.0, atomScale = 1.0, opacity = 0.0 } = options

  // 为每种元素创建离屏 canvas 纹理（共享）
  const elementMaterials = {}
  for (const atomGroup of atomGroups) {
    const elem = atomGroup.element
    if (elementMaterials[elem]) continue

    // 根据原子颜色计算对比色（亮色背景用深色文字，暗色背景用亮色文字）
    const atomColor = atomGroup.color || '#ffffff'
    const textColor = getContrastColor(atomColor)

    try {
      const canvas = createWebCanvas({ width: 128, height: 64 })
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = textColor
      ctx.font = 'bold 36px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(elem, 64, 32)

      const texture = new THREE.CanvasTexture(canvas)
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter

      const matOpacity = 1.0 - opacity
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: matOpacity,
        depthTest: false,
        depthWrite: false
      })
      elementMaterials[elem] = material
    } catch (e) {
      console.warn('[scene-builder] 创建标签纹理失败:', e)
      return group
    }
  }

  for (const atomGroup of atomGroups) {
    const material = elementMaterials[atomGroup.element]
    if (!material) continue

    for (const pos of atomGroup.positions) {
      const sprite = new THREE.Sprite(material)
      const cart = fractionalToCartesian(pos, lattice)
      sprite.position.set(cart.x, cart.y, cart.z)
      sprite.scale.set(1.5, 0.75, 1)
      sprite._element = atomGroup.element
      group.add(sprite)
    }
  }

  return group
}

// ==================== 线框 ====================

function buildWireframe(lattice, THREE, crystalData, mode = 'conventional') {
  // 统一使用标准平行六面体线框
  const vertices = getCellVertices(lattice)
  const edges = getCellEdges()

  const points = []
  for (const [i, j] of edges) {
    if (i < vertices.length && j < vertices.length) {
      points.push(
        vertices[i].x, vertices[i].y, vertices[i].z,
        vertices[j].x, vertices[j].y, vertices[j].z
      )
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))

  const wireframeColor = getVisualColor('wireframeColor')
  const material = new THREE.LineBasicMaterial({
    color: wireframeColor,
    linewidth: 1,
    transparent: true,
    opacity: 0.6
  })

  return new THREE.LineSegments(geom, material)
}

// ==================== 辅助线 ====================

/** 体对角线顶点对（顶点索引按 getCellVertices 的遍历顺序） */
const BODY_DIAGONAL_PAIRS = [[0, 7], [1, 6], [2, 5], [3, 4]]

/** 面对角线顶点对（6个面，每面2条对角线） */
const FACE_DIAGONAL_PAIRS = [
  [0, 3], [1, 2],   // x=0 面
  [4, 7], [5, 6],   // x=1 面
  [0, 5], [1, 4],   // y=0 面
  [2, 7], [3, 6],   // y=1 面
  [0, 6], [2, 4],   // z=0 面
  [1, 7], [3, 5]    // z=1 面
]

/**
 * 构建辅助线（体对角线 + 面对角线），使用虚线显示
 * @param {Object} lattice - 晶胞参数
 * @param {Object} THREE - Three.js 实例
 * @param {Object} options - { aboveAtoms: boolean, cellVertices?: Array }
 * @returns {{ body: Group, face: Group } | null}
 */
function buildAuxiliaryLines(lattice, THREE, options = {}) {
  const vertices = getCellVertices(lattice)
  const bodyColor = getVisualColor('auxiliaryLineBodyColor')
  const faceColor = getVisualColor('auxiliaryLineFaceColor')

  function addDashedLine(i, j, dashSize, gapSize, color, targetGroup) {
    const a = vertices[i]
    const b = vertices[j]
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute([
      a.x, a.y, a.z, b.x, b.y, b.z
    ], 3))

    const mat = new THREE.LineDashedMaterial({
      color: color,
      dashSize: dashSize,
      gapSize: gapSize,
      linewidth: 1
    })
    const line = new THREE.Line(geom, mat)
    line.computeLineDistances()
    targetGroup.add(line)
  }

  const bodyGroup = new THREE.Group()
  for (const [i, j] of BODY_DIAGONAL_PAIRS) {
    addDashedLine(i, j, 0.5, 0.3, bodyColor, bodyGroup)
  }

  const faceGroup = new THREE.Group()
  for (const [i, j] of FACE_DIAGONAL_PAIRS) {
    addDashedLine(i, j, 0.3, 0.2, faceColor, faceGroup)
  }

  if (options.aboveAtoms) {
    [bodyGroup, faceGroup].forEach(g => {
      g.renderOrder = 999
      g.traverse(child => {
        if (child.material) {
          child.material.depthTest = false
          child.material.depthWrite = false
        }
      })
    })
  }

  return { body: bodyGroup, face: faceGroup }
}

// ==================== 空隙 ====================

function buildInterstices(interstices, lattice, THREE, opacity = 0.0, fractionalShift = [0, 0, 0]) {
  if (!interstices) return null

  const matOpacity = Math.max(0, 0.5 - opacity / 2)
  const octaColor = getVisualColor('octahedralColor')
  const tetraColor = getVisualColor('tetrahedralColor')

  // 对空隙数据应用分数平移
  const shiftedInterstices = {}
  for (const [type, data] of Object.entries(interstices)) {
    shiftedInterstices[type] = {
      ...data,
      positions: data.positions ? data.positions.map(pos => [
        ((pos[0] + fractionalShift[0]) % 1 + 1) % 1,
        ((pos[1] + fractionalShift[1]) % 1 + 1) % 1,
        ((pos[2] + fractionalShift[2]) % 1 + 1) % 1
      ]) : []
    }
  }

  const TOLERANCE = 0.05
  const lo = -TOLERANCE
  const hi = 1 + TOLERANCE

  const result = {}

  for (const [type, data] of Object.entries(shiftedInterstices)) {
    if (!data.positions || data.positions.length === 0) continue

    // 展开空隙位置到整胞
    let positions = data.positions
    const expanded = []
    const seen = new Set()
    for (const pos of data.positions) {
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          for (let dk = -1; dk <= 1; dk++) {
            const fx = pos[0] + di
            const fy = pos[1] + dj
            const fz = pos[2] + dk
            if (fx >= lo && fx < hi && fy >= lo && fy < hi && fz >= lo && fz < hi) {
              const key = `${fx.toFixed(5)},${fy.toFixed(5)},${fz.toFixed(5)}`
              if (!seen.has(key)) {
                seen.add(key)
                expanded.push([parseFloat(fx.toFixed(5)), parseFloat(fy.toFixed(5)), parseFloat(fz.toFixed(5))])
              }
            }
          }
        }
      }
    }
    positions = expanded

    const typeGroup = new THREE.Group()
    const voidColor = type === 'octahedral' ? octaColor : tetraColor
    const isOcta = type === 'octahedral'
    const symbolScale = (data.radius || 0.4) * 2

    // 创建空隙精灵：八面体→同心圆，四面体→*号
    const spriteMat = isOcta
      ? createOctaVoidSprite(voidColor, THREE, matOpacity, symbolScale)
      : createVoidSpriteMaterial('*', voidColor, THREE, matOpacity)

    for (let i = 0; i < positions.length; i++) {
      const sprite = new THREE.Sprite(spriteMat)
      const cart = fractionalToCartesian(positions[i], lattice)
      sprite.position.set(cart.x, cart.y, cart.z)
      sprite.scale.set(symbolScale, symbolScale, 1)
      sprite.renderOrder = 1
      sprite._voidType = type
      sprite._position = positions[i]
      sprite._positionIndex = i
      typeGroup.add(sprite)
    }

    result[type] = typeGroup
  }

  return result
}

/**
 * 创建空隙精灵材质（Canvas 纹理 + SpriteMaterial）
 */
function createVoidSpriteMaterial(symbol, color, THREE, opacity) {
  try {
    const canvas = createWebCanvas({ width: 64, height: 64 })
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = color || '#ffffff'
    ctx.font = 'bold 52px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(symbol, 32, 32)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter

    return new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: opacity,
      depthTest: true,
      depthWrite: false
    })
  } catch (e) {
    console.warn('[scene-builder] 创建空隙精灵失败:', e)
    return new THREE.SpriteMaterial({ color: color })
  }
}

/** 创建八面体空隙精灵材质（同心圆） */
function createOctaVoidSprite(color, THREE, opacity, scale) {
  try {
    const canvas = createWebCanvas({ width: 64, height: 64 })
    const ctx = canvas.getContext('2d')
    const cx = 32, cy = 32
    // 外圆
    ctx.beginPath()
    ctx.arc(cx, cy, 22, 0, Math.PI * 2)
    ctx.strokeStyle = color || '#ffffff'
    ctx.lineWidth = 4
    ctx.stroke()
    // 内圆
    ctx.beginPath()
    ctx.arc(cx, cy, 10, 0, Math.PI * 2)
    ctx.fillStyle = color || '#ffffff'
    ctx.fill()

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter

    return new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: opacity,
      depthTest: true,
      depthWrite: false
    })
  } catch (e) {
    console.warn('[scene-builder] 创建八面体空隙精灵失败:', e)
    return new THREE.SpriteMaterial({ color: color })
  }
}

// ==================== 点阵点 ====================

/**
 * 从晶体数据中显式声明的 latticeType 字符串提取内部代码
 * 优先使用此方法，避免分子晶体等原子不在格点位置时自动检测失败
 * @param {Object} crystalData
 * @returns {string|null} 内部代码或 null
 */
function getExplicitLatticeType(crystalData) {
  const lt = (crystalData.latticeType || '').toLowerCase()
  if (!lt) return null
  if (lt.includes('底心') || lt.includes('oc') || lt.includes('c心') || lt.includes('oa') || lt.includes('ob')) return 'cbase'
  if (lt.includes('体心') || lt.includes('ci') || lt.includes('bcc')) return 'bcc'
  if (lt.includes('面心') || lt.includes('cf') || lt.includes('fcc')) return 'fcc'
  if (lt.includes('r心') || lt.includes('rhex')) return 'rHex'
  if (lt.includes('六方') || lt.includes('hp')) return 'hcp'
  if (lt.includes('金刚石') || lt.includes('diamond')) return 'diamond'
  return null
}

/**
 * 自动检测点阵型式并构建点阵点显示
 * @param {Object} crystalData
 * @param {Object} lattice
 * @param {Object} THREE
 * @param {string} mode - 'conventional' | 'primitive'
 */
function buildLatticePoints(crystalData, lattice, THREE, mode = 'conventional') {
  const group = new THREE.Group()

  // 优先使用数据文件中显式声明的点阵型式，自动检测作为回退
  const latticeType = getExplicitLatticeType(crystalData) || detectLatticeType(crystalData)
  const pointRadius = 0.15
  const userLpColor = getVisualColor('latticePointColor')
  const pointOpacity = 0.7

  const sphereGeom = new THREE.SphereGeometry(1, 12, 12)
  const material = new THREE.MeshPhongMaterial({
    color: userLpColor,
    transparent: true,
    opacity: pointOpacity,
    depthWrite: true,
    emissive: new THREE.Color(0x111111),
    emissiveIntensity: 0.5
  })

  const latticeTypeNames = {
    'sc': '简单立方 P', 'bcc': '体心立方 I', 'fcc': '面心立方 F',
    'diamond': '金刚石型 F', 'hcp': '六方 H', 'cbase': '底心 C',
    'rHex': 'R心六方', 'other': '未知'
  }

  // 显示所有点阵点：8顶点 + 体心/面心/底心
  const displayPositions = []
  for (let i = 0; i <= 1; i++)
    for (let j = 0; j <= 1; j++)
      for (let k = 0; k <= 1; k++)
        displayPositions.push([i, j, k])

  if (latticeType === 'bcc') displayPositions.push([0.5, 0.5, 0.5])
  if (latticeType === 'fcc' || latticeType === 'diamond') {
    displayPositions.push([0.5, 0.5, 0.0], [0.5, 0.0, 0.5], [0.0, 0.5, 0.5],
      [0.5, 0.5, 1.0], [0.5, 1.0, 0.5], [1.0, 0.5, 0.5])
  }
  if (latticeType === 'cbase') {
    displayPositions.push([0.5, 0.5, 0.0], [0.5, 0.5, 1.0])
  }
  // R心六方：obverse (2/3,1/3,1/3)+(1/3,2/3,2/3) 或 reverse (1/3,2/3,1/3)+(2/3,1/3,2/3)
  if (latticeType === 'rHex') {
    // 自动判断 obverse 还是 reverse
    const hasReverse = crystalData.atoms.some(g =>
      g.positions.some(p =>
        Math.abs(p[0] - 0.3333) < 0.05 && Math.abs(p[1] - 0.6667) < 0.05 && Math.abs(p[2] - 0.3333) < 0.05
      )
    )
    if (hasReverse) {
      displayPositions.push([0.3333, 0.6667, 0.3333], [0.6667, 0.3333, 0.6667])
    } else {
      displayPositions.push([0.6667, 0.3333, 0.3333], [0.3333, 0.6667, 0.6667])
    }
  }

  for (const pos of displayPositions) {
    const mesh = new THREE.Mesh(sphereGeom, material)
    const cart = fractionalToCartesian(pos, lattice)
    mesh.position.set(cart.x, cart.y, cart.z)
    mesh.scale.set(pointRadius, pointRadius, pointRadius)
    mesh.renderOrder = 1
    mesh._element = '_latticePoint'
    mesh._position = [...pos]
    mesh._latticeType = latticeType
    mesh._latticeTypeName = latticeTypeNames[latticeType] || latticeType
    group.add(mesh)
  }

  return group
}

// ==================== 球棍模型 - 键圆柱体 ====================

/**
 * 将晶体数据中显式定义的键展开到完整晶胞范围
 * @param {Array} explicitBonds - crystalData.bonds 数组
 * @param {Object} lattice - 晶胞参数
 * @returns {Array} 展开后的键列表 {{from, to, fromColor, toColor, color}}
 */
function expandExplicitBonds(explicitBonds, lattice, fractionalShift) {
  // 宽搜索范围确保能找到正确的最近周期镜像
  const lo = -0.5, hi = 1.5
  const bondMap = new Map()
  const shift = fractionalShift && (fractionalShift[0] !== 0 || fractionalShift[1] !== 0 || fractionalShift[2] !== 0)
    ? fractionalShift : null

  for (const bond of explicitBonds) {
    let from = bond.from.slice ? [...bond.from] : bond.from
    let to = bond.to.slice ? [...bond.to] : bond.to
    // 应用分数平移：键端点与原子同步移动
    if (shift) {
      for (let k = 0; k < 3; k++) {
        from[k] = ((from[k] + shift[k]) % 1 + 1) % 1
        to[k] = ((to[k] + shift[k]) % 1 + 1) % 1
      }
    }
    const color = bond.color || '#cccccc'
    const fromColor = bond.from_color || bond.fromColor || color
    const toColor = bond.to_color || bond.toColor || color

    // 分别生成 from 和 to 的周期镜像（范围 [-2, 2] 确保覆盖）
    const fromImages = [], toImages = []
    for (let di = -2; di <= 2; di++) {
      for (let dj = -2; dj <= 2; dj++) {
        for (let dk = -2; dk <= 2; dk++) {
          const fx = from[0] + di, fy = from[1] + dj, fz = from[2] + dk
          if (fx >= lo && fx < hi && fy >= lo && fy < hi && fz >= lo && fz < hi) {
            fromImages.push([fx, fy, fz])
          }
          const tx = to[0] + di, ty = to[1] + dj, tz = to[2] + dk
          if (tx >= lo && tx < hi && ty >= lo && ty < hi && tz >= lo && tz < hi) {
            toImages.push([tx, ty, tz])
          }
        }
      }
    }

    // 寻找最短笛卡尔距离的周期镜像对
    let bestFrom = null, bestTo = null, bestDist = Infinity
    for (const fi of fromImages) {
      const fc = fractionalToCartesian(fi, lattice)
      for (const ti of toImages) {
        const tc = fractionalToCartesian(ti, lattice)
        const dist = (fc.x - tc.x) ** 2 + (fc.y - tc.y) ** 2 + (fc.z - tc.z) ** 2
        if (dist < bestDist) {
          bestDist = dist
          bestFrom = fi; bestTo = ti
        }
      }
    }

    if (bestFrom && bestTo) {
      // 归一化：将 from 端点平移到 [0, 1) 范围，保持键向量不变
      for (let k = 0; k < 3; k++) {
        const w = -Math.floor(bestFrom[k])
        bestFrom[k] += w
        bestTo[k] += w
      }

      // 辅助函数：添加去重后的键条目
      const addBond = (f, t) => {
        const key = [
          `${f[0].toFixed(4)},${f[1].toFixed(4)},${f[2].toFixed(4)}`,
          `${t[0].toFixed(4)},${t[1].toFixed(4)},${t[2].toFixed(4)}`
        ].sort().join('|')
        if (!bondMap.has(key)) {
          bondMap.set(key, {
            from: [parseFloat(f[0].toFixed(4)), parseFloat(f[1].toFixed(4)), parseFloat(f[2].toFixed(4))],
            to: [parseFloat(t[0].toFixed(4)), parseFloat(t[1].toFixed(4)), parseFloat(t[2].toFixed(4))],
            fromColor, toColor,
            dashed: bond.dashed || false
          })
        }
      }

      addBond(bestFrom, bestTo)

      // 若 to 端点在晶胞可见范围外，生成反向键副本
      // 反向键将 to 归一化到 [0,1)，同时平移 from，保持键向量不变
      const TOL = 0.02
      let toOutside = false
      for (let k = 0; k < 3; k++) {
        if (bestTo[k] < -TOL || bestTo[k] >= 1 + TOL) {
          toOutside = true; break
        }
      }
      if (toOutside) {
        const wf = [...bestFrom], wt = [...bestTo]
        for (let k = 0; k < 3; k++) {
          const w = -Math.floor(wt[k])
          wf[k] += w; wt[k] += w
        }
        // 仅当平移后的 from 在原子展开范围内时才添加（有对应原子显示）
        const EXPAND_LO = -0.06, EXPAND_HI = 1.06
        let fromInRange = true
        for (let k = 0; k < 3; k++) {
          if (wf[k] < EXPAND_LO || wf[k] >= EXPAND_HI) { fromInRange = false; break }
        }
        if (fromInRange) {
          addBond(wf, wt)
        }
      }
    }
  }
  return Array.from(bondMap.values())
}

function buildBondCylinders(crystalData, lattice, THREE, stickRadius, opacity = 0.0) {
  // 优先使用预展开的键（分子晶体ID机制），其次使用显式定义的键，最后自动检测
  let bonds
  if (crystalData._expandedBonds) {
    bonds = crystalData._expandedBonds
  } else if (crystalData.bonds && crystalData.bonds.length > 0) {
    bonds = expandExplicitBonds(crystalData.bonds, lattice, crystalData._fractionalShift)
  } else {
    bonds = autoDetectBonds(crystalData, lattice)
  }
  if (bonds.length === 0) return null

  const group = new THREE.Group()
  const matOpacity = 1.0 - opacity
  const materialCache = {}

  function makeMat(color) {
    if (!materialCache[color]) {
      const opt = { color, shininess: 20 }
      if (matOpacity < 1.0) {
        opt.transparent = true
        opt.opacity = matOpacity
        opt.depthWrite = matOpacity > 0.5
      }
      materialCache[color] = new THREE.MeshPhongMaterial(opt)
    }
    return materialCache[color]
  }

  const cylGeom = new THREE.CylinderGeometry(stickRadius, stickRadius, 1, 8)

  function placeCyl(start, end, mat) {
    const segDir = new THREE.Vector3().subVectors(end, start)
    const segLen = segDir.length()
    if (segLen < 0.001) return
    const segMid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
    const segOrient = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), segDir.normalize()
    )
    const cyl = new THREE.Mesh(cylGeom, mat)
    cyl.position.copy(segMid)
    cyl.scale.set(1, segLen, 1)
    cyl.quaternion.copy(segOrient)
    group.add(cyl)
  }

  // 晶胞面裁剪平面
  const facePlanes = getCellFacePlanes(lattice, THREE)
  const TOL = 0.02

  const insideCell = (p) =>
    p[0] >= -TOL && p[0] < 1 + TOL &&
    p[1] >= -TOL && p[1] < 1 + TOL &&
    p[2] >= -TOL && p[2] < 1 + TOL

  // 判断分数坐标是否在晶胞边界上（原子完全可见，键不应在此处截断）
  const isOnBoundary = (p) =>
    Math.abs(p[0]) < TOL || Math.abs(p[0] - 1) < TOL ||
    Math.abs(p[1]) < TOL || Math.abs(p[1] - 1) < TOL ||
    Math.abs(p[2]) < TOL || Math.abs(p[2] - 1) < TOL

  // 计算线段与晶胞面的交点（取从 insidePt → outsidePt 方向上最近的交点）
  function findFaceIntersection(insidePt, outsidePt) {
    let bestT = Infinity
    let bestPoint = null
    let bestPlane = null
    const dir = new THREE.Vector3().subVectors(outsidePt, insidePt)
    const dirLen = dir.length()
    if (dirLen < 1e-6) return null

    for (const plane of facePlanes) {
      const nd = plane.normal.dot(dir)
      if (Math.abs(nd) < 1e-6) continue
      const t = -plane.distanceToPoint(insidePt) / nd
      if (t >= -0.001 && t <= 1.001 && t < bestT) {
        bestT = t
        bestPoint = insidePt.clone().addScaledVector(dir, t)
        bestPlane = plane
      }
    }
    if (bestPoint) {
      return { point: bestPoint, normal: bestPlane.normal.clone() }
    }
    return null
  }

  // 分子晶体键不裁剪，直接绘制完整圆柱
  const isMolecularBonds = !!crystalData._expandedBonds

  for (const bond of bonds) {
    // 分子晶体：化学键可超出晶胞线框，不裁剪
    if (isMolecularBonds) {
      const fromCartM = fractionalToCartesian(bond.from, lattice)
      const toCartM = fractionalToCartesian(bond.to, lattice)
      const fromVecM = new THREE.Vector3(fromCartM.x, fromCartM.y, fromCartM.z)
      const toVecM = new THREE.Vector3(toCartM.x, toCartM.y, toCartM.z)
      const totalLen = new THREE.Vector3().subVectors(toVecM, fromVecM).length()
      if (totalLen < 0.001) continue
      if (bond.dashed) {
        const lineGeom = new THREE.BufferGeometry()
        lineGeom.setAttribute('position', new THREE.Float32BufferAttribute([
          fromVecM.x, fromVecM.y, fromVecM.z,
          toVecM.x, toVecM.y, toVecM.z
        ], 3))
        const dashColor = bond.fromColor || '#64B5F6'
        const lineMatOpts = { color: dashColor, dashSize: 0.15, gapSize: 0.10, linewidth: 1 }
        if (matOpacity < 1.0) {
          lineMatOpts.transparent = true
          lineMatOpts.opacity = matOpacity
          lineMatOpts.depthWrite = matOpacity > 0.5
        }
        const lineMat = new THREE.LineDashedMaterial(lineMatOpts)
        const line = new THREE.Line(lineGeom, lineMat)
        line.computeLineDistances()
        group.add(line)
      } else if (bond.fromColor !== bond.toColor) {
        const mid = new THREE.Vector3().addVectors(fromVecM, toVecM).multiplyScalar(0.5)
        placeCyl(fromVecM, mid, makeMat(bond.fromColor))
        placeCyl(mid, toVecM, makeMat(bond.toColor))
      } else {
        placeCyl(fromVecM, toVecM, makeMat(bond.fromColor))
      }
      continue
    }

    const fromInside = insideCell(bond.from)
    const toInside = insideCell(bond.to)

    // 两端都在晶胞外：跳过
    if (!fromInside && !toInside) continue

    const fromCart = fractionalToCartesian(bond.from, lattice)
    const toCart = fractionalToCartesian(bond.to, lattice)
    const fromVec = new THREE.Vector3(fromCart.x, fromCart.y, fromCart.z)
    const toVec = new THREE.Vector3(toCart.x, toCart.y, toCart.z)
    const bondDir = new THREE.Vector3().subVectors(toVec, fromVec).normalize()

    if (bond.dashed) {
      // 虚线键：使用 Line 渲染，手动截断
      let lineFrom = fromVec, lineTo = toVec
      if (fromInside !== toInside) {
        const hit = findFaceIntersection(fromInside ? fromVec : toVec, fromInside ? toVec : fromVec)
        if (hit) {
          lineFrom = fromInside ? fromVec : hit.point
          lineTo = fromInside ? hit.point : toVec
        } else {
          continue
        }
      }
      const lineGeom = new THREE.BufferGeometry()
      lineGeom.setAttribute('position', new THREE.Float32BufferAttribute([
        lineFrom.x, lineFrom.y, lineFrom.z,
        lineTo.x, lineTo.y, lineTo.z
      ], 3))
      const dashColor = bond.fromColor || '#64B5F6'
      const lineMatOpts = { color: dashColor, dashSize: 0.15, gapSize: 0.10, linewidth: 1 }
      if (matOpacity < 1.0) {
        lineMatOpts.transparent = true
        lineMatOpts.opacity = matOpacity
        lineMatOpts.depthWrite = matOpacity > 0.5
      }
      const lineMat = new THREE.LineDashedMaterial(lineMatOpts)
      const line = new THREE.Line(lineGeom, lineMat)
      line.computeLineDistances()
      group.add(line)
      continue
    }

    // 两端均在晶胞内：直接绘制完整圆柱
    if (fromInside && toInside) {
      const totalLen = new THREE.Vector3().subVectors(toVec, fromVec).length()
      if (totalLen < 0.001) continue
      if (bond.fromColor !== bond.toColor) {
        const mid = new THREE.Vector3().addVectors(fromVec, toVec).multiplyScalar(0.5)
        placeCyl(fromVec, mid, makeMat(bond.fromColor))
        placeCyl(mid, toVec, makeMat(bond.toColor))
      } else {
        placeCyl(fromVec, toVec, makeMat(bond.fromColor))
      }
      continue
    }

    // 一端在晶胞内、一端在外：截断并加端盖
    const insidePt = fromInside ? fromVec : toVec
    const outsidePt = fromInside ? toVec : fromVec
    const insideColor = fromInside ? bond.fromColor : bond.toColor

    const hit = findFaceIntersection(insidePt, outsidePt)
    if (!hit) continue

    // 绘制截断后的圆柱段
    const segLen = new THREE.Vector3().subVectors(hit.point, insidePt).length()
    if (segLen > 0.001) {
      const segMid = new THREE.Vector3().addVectors(insidePt, hit.point).multiplyScalar(0.5)
      const segDir = new THREE.Vector3().subVectors(hit.point, insidePt).normalize()
      const segOrient = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), segDir
      )
      const cyl = new THREE.Mesh(cylGeom, makeMat(insideColor))
      cyl.position.copy(segMid)
      cyl.scale.set(1, segLen, 1)
      cyl.quaternion.copy(segOrient)
      group.add(cyl)
    }
  }

  return group
}

/**
 * 构建氢键虚线（六方向超胞展开后以晶胞边界截断）
 * 氢键独立于共价键分组，支持单独控制显隐
 * @param {Object} crystalData - 含 _expandedHBonds 的晶体数据
 * @param {Object} lattice
 * @param {Object} THREE
 * @returns {THREE.Group | null}
 */
function buildHydrogenBondLines(crystalData, lattice, THREE) {
  const hBonds = crystalData._expandedHBonds
  if (!hBonds || hBonds.length === 0) return null

  const group = new THREE.Group()
  const facePlanes = getCellFacePlanes(lattice, THREE)
  const TOL = 0.02
  const insideCell = (p) =>
    p[0] >= -TOL && p[0] < 1 + TOL &&
    p[1] >= -TOL && p[1] < 1 + TOL &&
    p[2] >= -TOL && p[2] < 1 + TOL

  // 计算线段与晶胞面的交点
  function findFaceIntersection(fromCart, toCart) {
    let bestT = Infinity
    let bestPoint = null
    const dir = new THREE.Vector3().subVectors(toCart, fromCart)
    const dirLen = dir.length()
    if (dirLen < 1e-6) return null
    for (const plane of facePlanes) {
      const nd = plane.normal.dot(dir)
      if (Math.abs(nd) < 1e-6) continue
      const t = -plane.distanceToPoint(fromCart) / nd
      if (t >= -0.001 && t <= 1.001 && t < bestT) {
        bestT = t
        bestPoint = fromCart.clone().addScaledVector(dir, t)
      }
    }
    return bestPoint || null
  }

  for (const bond of hBonds) {
    const fromInside = insideCell(bond.from)
    const toInside = insideCell(bond.to)
    if (!fromInside && !toInside) continue

    const fromCart = fractionalToCartesian(bond.from, lattice)
    const toCart = fractionalToCartesian(bond.to, lattice)
    const fromVec = new THREE.Vector3(fromCart.x, fromCart.y, fromCart.z)
    const toVec = new THREE.Vector3(toCart.x, toCart.y, toCart.z)

    let lineFrom = fromVec
    let lineTo = toVec

    if (fromInside !== toInside) {
      const hit = findFaceIntersection(fromInside ? fromVec : toVec, fromInside ? toVec : fromVec)
      if (hit) {
        if (fromInside) { lineTo = hit } else { lineFrom = hit }
      } else {
        continue
      }
    }

    const lineGeom = new THREE.BufferGeometry()
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute([
      lineFrom.x, lineFrom.y, lineFrom.z,
      lineTo.x, lineTo.y, lineTo.z
    ], 3))
    const dashColor = getVisualColor('hydrogenBondColor') || bond.fromColor || '#FFAB40'
    const lineMat = new THREE.LineDashedMaterial({
      color: dashColor,
      dashSize: 0.15,
      gapSize: 0.10,
      linewidth: 1,
      transparent: true,
      opacity: 0.7,
      depthWrite: true
    })
    const line = new THREE.Line(lineGeom, lineMat)
    line.computeLineDistances()
    group.add(line)
  }

  return group.children.length > 0 ? group : null
}

/**
 * 自动检测化学键——最近邻距离聚类法
 *
 * 对每种元素对(A, B)，找到最近邻距离 d_min，
 * 只连接距离 < d_min × BOND_DISTANCE_RATIO 的原子对。
 * 此方法对共价键、离子键、金属键均有效，
 * 不会因共价半径定义不同而产生过多或过少的键。
 */
function autoDetectBonds(crystalData, lattice) {
  // 展平所有原子
  const allAtoms = []
  for (const group of crystalData.atoms) {
    const color = group.color || '#cccccc'
    for (let i = 0; i < group.positions.length; i++) {
      allAtoms.push({
        element: group.element,
        position: group.positions[i],
        color: color,
        cart: fractionalToCartesian(group.positions[i], lattice)
      })
    }
  }

  // 生成周期性镜像（26个相邻晶胞）
  const periodicImages = []
  for (const atom of allAtoms) {
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (let dk = -1; dk <= 1; dk++) {
          if (di === 0 && dj === 0 && dk === 0) continue
          const fracPos = [
            atom.position[0] + di,
            atom.position[1] + dj,
            atom.position[2] + dk
          ]
          periodicImages.push({
            element: atom.element,
            position: fracPos,
            color: atom.color,
            cart: fractionalToCartesian(fracPos, lattice),
            isImage: true,
            originalPos: atom.position
          })
        }
      }
    }
  }

  const expandedAtoms = [...allAtoms, ...periodicImages]

  const cartDist = (a, b) => {
    const dx = a.cart.x - b.cart.x
    const dy = a.cart.y - b.cart.y
    const dz = a.cart.z - b.cart.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  // === 第一步：按元素对收集所有距离 ===
  /** @type {Map<string, number[]>} key = "ElA|ElB"（排序后的元素对） */
  const pairDistances = new Map()

  for (let i = 0; i < allAtoms.length; i++) {
    for (let j = 0; j < expandedAtoms.length; j++) {
      if (allAtoms[i] === expandedAtoms[j]) continue
      const dist = cartDist(allAtoms[i], expandedAtoms[j])
      if (dist < 0.01 || dist > 5.0) continue  // 忽略自身和过远

      const elPair = [allAtoms[i].element, expandedAtoms[j].element].sort().join('|')
      if (!pairDistances.has(elPair)) {
        pairDistances.set(elPair, [])
      }
      pairDistances.get(elPair).push(dist)
    }
  }

  // === 第二步：对每种元素对计算最小距离 ===
  /** @type {Map<string, number>} key = "ElA|ElB" */
  const pairMinDist = new Map()
  for (const [pair, dists] of pairDistances) {
    dists.sort((a, b) => a - b)
    // 取第1百分位的距离作为最小距离（避免非成键对淹没真实键长）
    const idx = Math.max(1, Math.floor(dists.length * 0.01))
    pairMinDist.set(pair, dists[idx])
  }

  // === 第2.5步：排除次近邻元素对（第二配位层） ===
  // 计算全局最小距离，某元素对的最小距离若显著大于它，则不是化学键
  let globalMinDist = Infinity
  for (const d of pairMinDist.values()) {
    if (d < globalMinDist) globalMinDist = d
  }
  const bondablePairs = new Set()
  for (const [pair, d] of pairMinDist) {
    if (d <= globalMinDist * SAME_SHELL_RATIO) {
      bondablePairs.add(pair)
    }
  }

  // === 第三步：基于最小距离判定成键 ===
  const bonds = []
  const bondSet = new Set()

  for (let i = 0; i < allAtoms.length; i++) {
    for (let j = 0; j < expandedAtoms.length; j++) {
      if (allAtoms[i] === expandedAtoms[j]) continue
      const dist = cartDist(allAtoms[i], expandedAtoms[j])
      if (dist < 0.01) continue

      const elPair = [allAtoms[i].element, expandedAtoms[j].element].sort().join('|')
      if (!bondablePairs.has(elPair)) continue
      const minDist = pairMinDist.get(elPair)
      if (minDist === undefined) continue

      if (dist < minDist * BOND_DISTANCE_RATIO) {
        const pos1 = allAtoms[i].position
        const pos2 = expandedAtoms[j].position
        const key = [
          `${pos1[0].toFixed(4)},${pos1[1].toFixed(4)},${pos1[2].toFixed(4)}`,
          `${pos2[0].toFixed(4)},${pos2[1].toFixed(4)},${pos2[2].toFixed(4)}`
        ].sort().join('|')

        if (!bondSet.has(key)) {
          bondSet.add(key)
          bonds.push({
            from: pos1,
            to: pos2,
            fromColor: allAtoms[i].color || '#cccccc',
            toColor: expandedAtoms[j].color || '#cccccc'
          })
        }
      }
    }
  }

  // === 第四步：保留所有键，由 buildBondCylinders 负责裁剪 ===
  return bonds
}

/**
 * 获取晶胞6个面的裁剪平面（Cartesian坐标，法向量指向晶胞内部）
 * @param {Object} lattice
 * @param {Object} THREE
 * @returns {THREE.Plane[]}
 */
function getCellFacePlanes(lattice, THREE) {
  const vertices = getCellVertices(lattice)
  const faceIndices = [
    [0, 2, 4, 6], [1, 3, 5, 7],
    [0, 1, 4, 5], [2, 3, 6, 7],
    [0, 1, 2, 3], [4, 5, 6, 7]
  ]
  const center = fractionalToCartesian([0.5, 0.5, 0.5], lattice)
  return buildConvexPolyhedronClipPlanes(vertices, faceIndices, center, THREE)
}

// ==================== 对称元素 ====================

function buildSymmetry(symmetry, lattice, THREE) {
  if (!symmetry) return null

  const group = new THREE.Group()

  // 将晶体学方向/法线向量转换为笛卡尔方向
  const crystalDirToCart = (dir) => {
    const cart = fractionalToCartesian(dir, lattice)
    return new THREE.Vector3(cart.x, cart.y, cart.z).normalize()
  }

  if (symmetry.axes) {
    for (const axis of symmetry.axes) {
      const dir = crystalDirToCart(axis.direction)
      const length = 2.5
      const cylinderGeom = new THREE.CylinderGeometry(0.04, 0.04, length, 16)
      const material = new THREE.MeshPhongMaterial({
        color: axis.color || '#ffffff',
        emissive: new THREE.Color(axis.color || '#ffffff'),
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.8,
        depthWrite: true
      })

      const cylinder = new THREE.Mesh(cylinderGeom, material)
      const pos = axis.position || [0, 0, 0]
      const cartPos = fractionalToCartesian(pos, lattice)
      cylinder.position.set(cartPos.x, cartPos.y, cartPos.z)
      cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      cylinder.renderOrder = 2
      group.add(cylinder)
    }
  }

  if (symmetry.mirrors) {
    for (const mirror of symmetry.mirrors) {
      const normal = crystalDirToCart(mirror.normal)
      const size = 3.0
      const planeGeom = new THREE.PlaneGeometry(size, size)
      // THREE.Color 不支持 rgba 格式，提取纯色部分，alpha 由 material.opacity 控制
      const mirrorColor = (mirror.color || 'rgba(255,255,255,0.3)').replace(/rgba?\((\d+),\s*(\d+),\s*(\d+).*\)/, 'rgb($1,$2,$3)')
      const material = new THREE.MeshBasicMaterial({
        color: mirrorColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.2,
        depthWrite: false
      })

      const plane = new THREE.Mesh(planeGeom, material)
      plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
      plane.position.copy(normal.clone().multiplyScalar(mirror.distance || 0))
      plane.renderOrder = 3
      group.add(plane)

      const edgeGeom = new THREE.EdgesGeometry(planeGeom)
      const edgeLine = new THREE.LineSegments(
        edgeGeom,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
      )
      plane.add(edgeLine)
    }
  }

  return group
}

// ==================== 坐标轴 ====================

function buildCrystalAxesHelper(THREE, lattice) {
  const arrowLength = 1.2
  const headLength = 0.15
  const headWidth = 0.08

  const crystalGroup = new THREE.Group()
  const aDir = fractionalToCartesian([1, 0, 0], lattice || { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 })
  const bDir = fractionalToCartesian([0, 1, 0], lattice || { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 })
  const cDir = fractionalToCartesian([0, 0, 1], lattice || { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 })
  const crystalDirs = [
    { color: 0xff0000, dir: new THREE.Vector3(aDir.x, aDir.y, aDir.z).normalize() },
    { color: 0x00ff00, dir: new THREE.Vector3(bDir.x, bDir.y, bDir.z).normalize() },
    { color: 0x0000ff, dir: new THREE.Vector3(cDir.x, cDir.y, cDir.z).normalize() }
  ]
  for (const axis of crystalDirs) {
    const arrow = new THREE.ArrowHelper(
      axis.dir,
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      axis.color,
      headLength,
      headWidth
    )
    crystalGroup.add(arrow)
  }
  crystalGroup.position.set(0.3, 0.3, 0.3)

  return crystalGroup
}

// ==================== 清理 ====================

export function clearScene(obj, THREE) {
  if (!obj) return
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
  while (obj.children.length > 0) {
    obj.remove(obj.children[0])
  }
}

export default { buildCrystalScene, clearScene }
