/**
 * 场景构建模块（基础版）
 * 从分子结构构建 Three.js 场景：原子球 + 球棍键
 * 原子材质/几何体参数移植自 crystal 项目 lib/scene-builder.js
 */
import * as THREE from 'three'
import { getCovalentRadius } from '../../../packages/knowledge/shared/elements.js'
import { getElementColor, getElementRadius, getAppearance } from '../data/settings.js'
import { createAtomMaterial, createBondMaterial } from './materials.js'
import { fractionalToCartesian, getCellVertices, getCellEdges, getCellCenteredOffset } from '../core/lattice.js'
import { computeCentroid } from '../core/structure.js'

/** 球棍模型中原子半径系数（移植 crystal BALL_STICK_FACTOR） */
const BALL_STICK_FACTOR = 0.3

/** 计算材质颜色的相对亮度，>0.5 用黑字否则白字 */
function textColorFor(hex) {
  const c = new THREE.Color(hex)
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  return lum > 0.5 ? '#111111' : '#ffffff'
}

/**
 * 生成原子名称标签（Sprite，放球心，大小∝半径，不超出原子球）
 * 暗色原子白字，亮色原子黑字
 * @param {string} element - 元素符号
 * @param {number} radius - 原子球半径（世界单位）
 * @param {string} color - 原子颜色（hex）
 * @returns {THREE.Sprite}
 */
function buildAtomLabelSprite(element, radius, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 128, 128)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // 原子标签仅元素符号；多字符（如 Co）字号略小
  ctx.font = `bold ${element.length > 1 ? 46 : 58}px sans-serif`
  ctx.fillStyle = textColorFor(color)
  ctx.fillText(element, 64, 64)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  const s = radius * 0.9
  sprite.scale.set(element.length >= 2 ? s * 1.5 : s, s, 1)
  sprite.renderOrder = 6
  sprite.userData = { atomLabel: true }
  return sprite
}

/**
 * 计算分子质心（原子位置的平均值）
 * @param {Array} atoms - [{ element, xyz: [x,y,z] }]
 * @returns {[number,number,number]}
 */
// ★ 定义已搬到 core/structure.js（门面也要用它，而门面不能引 render 层）。
//   这里保留再导出，页面原有 import 不必改。
export { computeCentroid } from '../core/structure.js'

/**
 * 基于共价半径自动检测化学键（距离 < rA + rB + 容差 则成键）
 * @param {Array} atoms - [{ element, xyz }]
 * @param {number} tol - 额外容差（Å）
 * @returns {Array<[number,number]>} 原子索引对
 */
export function autoDetectBonds(atoms, tol = 0.4) {
  const bonds = []
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const ri = getCovalentRadius(atoms[i].element)
      const rj = getCovalentRadius(atoms[j].element)
      const dx = atoms[i].xyz[0] - atoms[j].xyz[0]
      const dy = atoms[i].xyz[1] - atoms[j].xyz[1]
      const dz = atoms[i].xyz[2] - atoms[j].xyz[2]
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist < ri + rj + tol) {
        bonds.push([i, j])
      }
    }
  }
  return bonds
}

/**
 * 构建分子场景（原子球 + 球棍键），质心居中于原点
 * @param {Object} molecule - { atoms: [{element, xyz}], bonds?: [[i,j]] }
 * @param {Object} options - { modelType: 'ballStick'|'cpk', atomScale, opacity }
 * @returns {{ group: THREE.Group, radius: number }}
 */
export function buildMoleculeScene(molecule, options = {}) {
  const { modelType = 'ballStick', atomScale = 1.0, opacity = 0.0 } = options
  const group = new THREE.Group()

  const atoms = molecule.atoms || []
  // 质心居中
  const centroid = computeCentroid(atoms)

  // 键（优先使用显式键，否则自动检测）
  const bonds = molecule.bonds || autoDetectBonds(atoms)

  // 半径系数：球棍模型缩小，CPK 模型按范德华半径
  const sizeFactor = modelType === 'ballStick' ? BALL_STICK_FACTOR : 1.0

  // 共享几何体（与 crystal 一致：SphereGeometry(1, 32, 32)）
  const sphereGeom = new THREE.SphereGeometry(1, 32, 32)
  const matOpacity = 1.0 - opacity

  // 记录每个原子渲染后的世界位置（用于键定位）
  const positions = []

  for (const atom of atoms) {
    const color = getElementColor(atom.element)
    const r = getElementRadius(atom.element) * sizeFactor * atomScale

    // 每原子独立材质（供选中态单独虚化 / 高亮，避免按颜色缓存共享影响同色原子）
    const mat = createAtomMaterial(color, { opacity: matOpacity })

    const mesh = new THREE.Mesh(sphereGeom, mat)
    const x = atom.xyz[0] - centroid[0]
    const y = atom.xyz[1] - centroid[1]
    const z = atom.xyz[2] - centroid[2]
    mesh.position.set(x, y, z)
    mesh.scale.set(r, r, r)
    mesh.userData = { atomIndex: positions.length, element: atom.element, baseScale: r }
    group.add(mesh)
    // 原子名称标签（Sprite，球心，大小∝半径；暗/亮原子黑白字）
    const label = buildAtomLabelSprite(atom.element, r, color)
    label.position.set(x, y, z)
    label.userData = { atomLabel: true, atomIndex: positions.length }   // 关联原子序号，选中该原子时其标签不虚化
    group.add(label)
    positions.push(new THREE.Vector3(x, y, z))
  }

  // 球棍键
  if (modelType === 'ballStick' && bonds.length > 0) {
    const stickRadius = getAppearance('stickRadius') // 棍半径（可自定义）
    const cylGeom = new THREE.CylinderGeometry(stickRadius, stickRadius, 1, 8)

    for (const [i, j] of bonds) {
      if (i >= positions.length || j >= positions.length) continue
      const from = positions[i]
      const to = positions[j]
      const dir = new THREE.Vector3().subVectors(to, from)
      const len = dir.length()
      if (len < 0.001) continue

      const colorA = getElementColor(atoms[i].element)
      const colorB = getElementColor(atoms[j].element)
      const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5)
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())

      const placeCyl = (start, end, color, atomI, atomJ) => {
        const seg = new THREE.Vector3().subVectors(end, start)
        const segLen = seg.length()
        if (segLen < 0.001) return
        // 每段独立材质（供选中态虚化时逐根恢复）
        const cyl = new THREE.Mesh(cylGeom, createBondMaterial(color, { opacity: matOpacity }))
        cyl.position.copy(new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5))
        cyl.scale.set(1, segLen, 1)
        cyl.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), seg.normalize()))
        cyl.userData = { bond: true, atomPair: [atomI, atomJ] }   // 记录两端原子，供选中轨道内键保持正常
        group.add(cyl)
      }

      if (colorA !== colorB) {
        placeCyl(from, mid, colorA, i, j)
        placeCyl(mid, to, colorB, i, j)
      } else {
        placeCyl(from, to, colorA, i, j)
      }
    }
  }

  // 计算包围球半径（用于相机距离）
  let maxR = 0
  for (const p of positions) {
    const d = p.length()
    const atomR = 0
    if (d > maxR) maxR = d
  }
  const radius = Math.max(maxR + 1.5, 3.0)

  return { group, radius }
}

// ==================== 晶体场景 ====================

/**
 * 构建晶体场景（周期展开原子 + 晶胞线框），晶胞居中于原点
 * @param {Object} crystal - { lattice, atoms: [{element, frac}] }
 * @param {Object} options - { atomScale, opacity }
 * @returns {{ group: THREE.Group, radius: number }}
 */
export function buildCrystalScene(crystal, options = {}) {
  const { atomScale = 1.0, opacity = 0.0 } = options
  const group = new THREE.Group()
  const lattice = crystal.lattice

  // 晶胞居中于原点
  const offset = getCellCenteredOffset(lattice)
  const contentGroup = new THREE.Group()
  contentGroup.position.set(offset.x, offset.y, offset.z)
  group.add(contentGroup)

  // 周期展开原子（覆盖晶胞边界）
  const expanded = expandCrystalAtoms(crystal.atoms)

  // 原子渲染（球棍半径系数 0.3，与 crystal 一致）
  const sizeFactor = 0.3
  const sphereGeom = new THREE.SphereGeometry(1, 32, 32)
  const matCache = {}
  const matOpacity = 1.0 - opacity

  for (const atom of expanded) {
    const color = getElementColor(atom.element)
    const r = getElementRadius(atom.element) * sizeFactor * atomScale
    if (!matCache[color]) {
      matCache[color] = createAtomMaterial(color, { opacity: matOpacity })
    }
    const mesh = new THREE.Mesh(sphereGeom, matCache[color])
    const cart = fractionalToCartesian(atom.frac, lattice)
    mesh.position.set(cart.x, cart.y, cart.z)
    mesh.scale.set(r, r, r)
    mesh._element = atom.element
    contentGroup.add(mesh)
  }

  // 晶胞线框
  const wireframe = buildCellWireframe(lattice)
  contentGroup.add(wireframe)

  // 包围球半径 = 体对角线一半
  const diag = Math.sqrt(lattice.a * lattice.a + lattice.b * lattice.b + lattice.c * lattice.c)
  const radius = Math.max(diag / 2 + 1.5, 3.0)

  return { group, radius }
}

/** 周期展开原子到晶胞 [−tol, 1+tol) 范围（含相邻晶胞边界原子） */
function expandCrystalAtoms(atoms, tol = 0.05) {
  const lo = -tol, hi = 1 + tol
  const result = []
  const seen = new Set()
  for (const atom of atoms) {
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (let dk = -1; dk <= 1; dk++) {
          const fx = atom.frac[0] + di
          const fy = atom.frac[1] + dj
          const fz = atom.frac[2] + dk
          if (fx >= lo && fx < hi && fy >= lo && fy < hi && fz >= lo && fz < hi) {
            const key = `${fx.toFixed(4)},${fy.toFixed(4)},${fz.toFixed(4)}`
            if (!seen.has(key)) {
              seen.add(key)
              result.push({ element: atom.element, frac: [fx, fy, fz] })
            }
          }
        }
  }
  return result
}

/** 构建晶胞线框（12 条棱） */
function buildCellWireframe(lattice) {
  const vertices = getCellVertices(lattice)
  const edges = getCellEdges()
  const points = []
  for (const [i, j] of edges) {
    points.push(
      vertices[i].x, vertices[i].y, vertices[i].z,
      vertices[j].x, vertices[j].y, vertices[j].z
    )
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  const mat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 })
  return new THREE.LineSegments(geom, mat)
}

// ==================== 辅助几何（参考线框） ====================

/**
 * 构建立方体线框（辅助观察对称元素与分子几何的对应关系）
 * 以原点（分子质心居中后）为中心、边长为 2*halfSize；顶点与原子重合的视为实顶点，
 * 其余顶点用空心圆环标记，便于看出正四面体（如甲烷）只占立方体 4 个交错顶点
 * @param {number} halfSize - 立方体半边长
 * @param {Object} options - { color, atoms } atoms 用于判断顶点是否被原子占据（原始坐标）
 * @returns {THREE.Group}
 */
export function buildAuxCube(halfSize, options = {}) {
  const { color = '#78909c', atoms = [] } = options
  const group = new THREE.Group()
  const centroid = computeCentroid(atoms)
  const a = halfSize

  // 8 个顶点（索引位 0/1/2 对应 x/y/z 符号位，以原点为中心）
  const corners = []
  for (let i = 0; i < 8; i++) {
    corners.push(new THREE.Vector3(
      (i & 1 ? a : -a),
      (i & 2 ? a : -a),
      (i & 4 ? a : -a)
    ))
  }

  // 顶点是否被原子占据（甲烷的 4 个交错顶点）
  const isOccupied = corners.map(c => atoms.some(at => {
    const dx = at.xyz[0] - centroid[0] - c.x
    const dy = at.xyz[1] - centroid[1] - c.y
    const dz = at.xyz[2] - centroid[2] - c.z
    return Math.hypot(dx, dy, dz) < 0.2
  }))
  const occIdx = isOccupied.map((o, i) => o ? i : -1).filter(i => i >= 0)

  // 粗线辅助（细圆柱作线，跨平台加粗不受 WebGL linewidth 限制）
  const barRadius = a * 0.035
  const barGeom = new THREE.CylinderGeometry(barRadius, barRadius, 1, 10)
  function placeBar(p1, p2, mat) {
    const dir = new THREE.Vector3().subVectors(p2, p1)
    const len = dir.length()
    if (len < 1e-6) return
    const cyl = new THREE.Mesh(barGeom, mat)
    cyl.position.copy(new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5))
    cyl.scale.set(1, len, 1)
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
    group.add(cyl)
  }

  // 立方体 12 条棱（加粗，更明显）
  const edgeIdx = [
    [0, 1], [1, 3], [3, 2], [2, 0], // 底面 z = -a
    [4, 5], [5, 7], [7, 6], [6, 4], // 顶面 z = +a
    [0, 4], [1, 5], [2, 6], [3, 7]  // 竖直棱
  ]
  const cubeBarMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })
  for (const [i, j] of edgeIdx) placeBar(corners[i], corners[j], cubeBarMat)

  // 正四面体：占满 4 个交错顶点时，两两连线（=立方体面对角线）并涂淡色面
  if (occIdx.length >= 4) {
    // 四面体 6 条棱（面对角线），暖色突出
    const tetBarMat = new THREE.MeshBasicMaterial({ color: '#ffb74d', transparent: true, opacity: 0.85, depthWrite: false })
    for (let p = 0; p < occIdx.length; p++) {
      for (let q = p + 1; q < occIdx.length; q++) {
        placeBar(corners[occIdx[p]], corners[occIdx[q]], tetBarMat)
      }
    }
    // 4 个三角面（淡淡涂色，不遮挡分子观察）
    const faceMat = new THREE.MeshBasicMaterial({
      color: '#ffb74d', side: THREE.DoubleSide, transparent: true, opacity: 0.13, depthWrite: false,
      // forceSinglePass：否则双面半透明会被渲染两遍，0.13 实际呈现约 0.24（见 symmetry-draw.js 的说明）
      forceSinglePass: true
    })
    const triSets = []
    for (let p = 0; p < occIdx.length - 2; p++)
      for (let q = p + 1; q < occIdx.length - 1; q++)
        for (let r = q + 1; r < occIdx.length; r++) triSets.push([occIdx[p], occIdx[q], occIdx[r]])
    for (const [vi, vj, vk] of triSets) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute([
        corners[vi].x, corners[vi].y, corners[vi].z,
        corners[vj].x, corners[vj].y, corners[vj].z,
        corners[vk].x, corners[vk].y, corners[vk].z
      ], 3))
      const face = new THREE.Mesh(g, faceMat)
      face.renderOrder = 1
      group.add(face)
    }
  }

  // 立方体以原点为中心（分子质心已被 buildMoleculeScene 居中到原点），无需额外平移
  return group
}

/** 生成文字标签精灵（CanvasTexture + Sprite，供辅助几何标注用） */
function buildAngleLabel(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 80
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#546e7a'
  ctx.font = 'bold 44px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 180, 40)
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(3.6, 0.8, 1)
  sprite.renderOrder = 5
  return sprite
}

/**
 * 构建二面角双矩形辅助（帮助直观理解四原子二面角，如 H-O-O-H）
 * 两个半透明矩形共用中心键 B-C（如 O-O 轴），各包住一个端基键（A-B 与 C-D），
 * 两矩形平面夹角即四原子 A-B-C-D 的二面角（矩形夹角为二面角或其补角，
 * 由"二面角"标签直接标注扭转角数值）
 * @param {Array} atoms - 原子列表（原始坐标）
 * @param {number[]} indices - 四原子索引 [a, b, c, d]
 * @returns {THREE.Group}
 */
export function buildAuxDihedral(atoms, indices) {
  const [ia, ib, ic, id] = indices
  const group = new THREE.Group()
  const centroid = computeCentroid(atoms)

  const posOf = (i) => {
    const at = atoms[i]
    // 减质心：与 buildMoleculeScene 的原子居中一致（分子质心在原点，确保对齐）
    return new THREE.Vector3(
      at.xyz[0] - centroid[0],
      at.xyz[1] - centroid[1],
      at.xyz[2] - centroid[2]
    )
  }
  const B = posOf(ib)
  const C = posOf(ic)
  // 端基键向量（长度 = 端原子到中心键端点的距离，如 O-H 键长）
  const u1 = new THREE.Vector3().subVectors(posOf(ia), B)
  const u2 = new THREE.Vector3().subVectors(posOf(id), C)

  // 矩形 1（含 A-B 键）：B, C, C+u1, A；矩形 2（含 C-D 键）：B, C, D, B+u2
  const rects = [
    { color: '#FFA726', pts: [B, C, new THREE.Vector3().copy(C).add(u1), posOf(ia)] },
    { color: '#26C6DA', pts: [B, C, posOf(id), new THREE.Vector3().copy(B).add(u2)] }
  ]

  for (const { color, pts } of rects) {
    // 半透明四边形（两个三角形拼接）
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute([
      pts[0].x, pts[0].y, pts[0].z,
      pts[1].x, pts[1].y, pts[1].z,
      pts[2].x, pts[2].y, pts[2].z,
      pts[0].x, pts[0].y, pts[0].z,
      pts[2].x, pts[2].y, pts[2].z,
      pts[3].x, pts[3].y, pts[3].z
    ], 3))
    const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      // forceSinglePass：否则双面半透明被渲染两遍，0.22 实际呈现约 0.39（见 symmetry-draw.js 的说明）
      forceSinglePass: true
    }))
    mesh.renderOrder = 3
    group.add(mesh)

    // 边框
    const edge = new THREE.BufferGeometry().setFromPoints(pts)
    group.add(new THREE.LineLoop(edge, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 })))
  }

  // 二面角数值标注暂不显示（buildAngleLabel 保留，后续需要可恢复）
  // if (typeof document !== 'undefined') { ... 二面角计算与标签精灵 ... }

  // 矩形顶点已在质心系（与 buildMoleculeScene 原子居中一致），无需额外平移
  return group
}
