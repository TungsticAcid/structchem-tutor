/**
 * 晶面渲染（Three.js）
 *
 * 只负责把 `plane-geometry.js` 算出的中心化多边形变成场景组：
 *   · 半透明填充面
 *   · 一圈亮色轮廓
 *   · 一根短法向箭头（提示 hkl / UVW 指的是法线方向）
 *
 * ★ 切片平面是**过晶胞中心**的，所以多边形坐标已经以晶胞中心为原点；
 *   调用方应把本组直接挂到 `crystalRoot`（它本身就是绕晶胞中心旋转的）。
 */
import { planeCellCrossSection } from './plane-geometry.js'

const DEFAULT_COLOR = 0x00bcd4
const DEFAULT_ARROW_COLOR = 0xffab00

/**
 * @param {Object} crystalData
 * @param {{x:number,y:number,z:number}} normal 归一化或任意非零法向
 * @param {Object} THREE three 命名空间
 * @param {{color?:number, arrowColor?:number}} [options]
 * @returns {Object|null} THREE.Group；无有效截面时返回 null
 */
export function buildLatticePlaneGroup(crystalData, normal, THREE, options = {}) {
  if (!crystalData || !crystalData.lattice || !normal || !THREE) return null
  const points = planeCellCrossSection(normal, crystalData.lattice)
  if (!points || points.length < 3) return null

  const color = options.color != null ? options.color : DEFAULT_COLOR
  const arrowColor = options.arrowColor != null ? options.arrowColor : DEFAULT_ARROW_COLOR
  const group = new THREE.Group()
  group.name = 'latticePlane'
  group.userData.isLatticePlane = true

  // 质心三角扇：交线多边形是凸的，直接以质心为中心扇形三角化
  let cx = 0, cy = 0, cz = 0
  for (const p of points) { cx += p.x; cy += p.y; cz += p.z }
  const center = { x: cx / points.length, y: cy / points.length, z: cz / points.length }
  const vertices = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    vertices.push(center.x, center.y, center.z, a.x, a.y, a.z, b.x, b.y, b.z)
  }
  const fillGeo = new THREE.BufferGeometry()
  fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  fillGeo.computeVertexNormals()
  const fillMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const fill = new THREE.Mesh(fillGeo, fillMat)
  fill.renderOrder = 3
  group.add(fill)

  const loopPts = points.map((p) => new THREE.Vector3(p.x, p.y, p.z))
  loopPts.push(loopPts[0].clone())
  const lineGeo = new THREE.BufferGeometry().setFromPoints(loopPts)
  const lineMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  })
  const line = new THREE.Line(lineGeo, lineMat)
  line.renderOrder = 4
  group.add(line)

  // 法向箭头：长度按晶胞尺寸取，避免大晶胞里短得看不见
  const lattice = crystalData.lattice
  const cellSize = Math.max(Number(lattice.a) || 0, Number(lattice.b) || 0, Number(lattice.c) || 0)
  const arrowLen = Math.max(0.5, cellSize * 0.28)
  const dir = new THREE.Vector3(normal.x, normal.y, normal.z)
  if (dir.lengthSq() > 1e-12) {
    dir.normalize()
    const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), arrowLen, arrowColor, arrowLen * 0.16, arrowLen * 0.09)
    arrow.line.material.transparent = true
    arrow.line.material.opacity = 0.95
    arrow.cone.material.transparent = true
    arrow.cone.material.opacity = 0.95
    // 法向箭头从晶胞中心出发，真实位置在原子球内部；关掉深度测试让它作为"指示器"始终可见
    arrow.line.material.depthTest = false
    arrow.cone.material.depthTest = false
    arrow.line.renderOrder = 6
    arrow.cone.renderOrder = 6
    group.add(arrow)
  }

  return group
}

export default { buildLatticePlaneGroup }
