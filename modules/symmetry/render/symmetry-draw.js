/**
 * 对称元素渲染模块
 * 将识别出的对称元素（Cn/Sn 轴、σ 面、反演中心 i）渲染为 3D 对象
 * 颜色约定沿用 crystal PRD：C2 蓝 / C3 绿 / C4 红 / C6 紫
 * 每个对称元素用独立 Group 包装，支持单独显隐与标签
 * 标签始终创建（用 visible 控制显隐），避免切换时重建场景导致视角重置
 */
import * as THREE from 'three'
import { getSymmetryElementColor } from '../data/settings.js'
// 稳定 key 的生成规则只有一处定义（与门面发布给模型的那份是同一个函数）
import { elementKeyList } from '../engine/elementNaming.js'

/**
 * 生成正 n 边形 Shape（顶点朝上）
 */
function createPolygonShape(n, r) {
  const shape = new THREE.Shape()
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
    const x = r * Math.cos(angle)
    const y = r * Math.sin(angle)
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

/** 生成空心 n 边形 Shape（内嵌同形孔，用于 Sn 旋反轴） */
function createHollowPolygonShape(n, r) {
  const outer = createPolygonShape(n, r)
  const inner = createPolygonShape(n, r * 0.55)
  outer.holes.push(inner)
  return outer
}

/** 生成透镜形（椭圆）Shape，用于 C2 轴末端符号 */
function createLensShape(r) {
  const shape = new THREE.Shape()
  shape.absellipse(0, 0, r, r * 0.5, 0, Math.PI * 2, false, 0)
  return shape
}

/**
 * 创建文字标签精灵（CanvasTexture + SpriteMaterial）
 * @param {string} text - 标签文字
 * @param {string} color - 颜色
 * @param {number} fontSize - 字号（px）
 */
function buildLabelSprite(text, color, fontSize = 40) {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 80
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 80, 40)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  const s = fontSize / 28
  sprite.scale.set(1.4 * s, 0.7 * s, 1)
  sprite.renderOrder = 5
  return sprite
}

/** 在元素数组中找主轴方向（最高阶 C 真轴单位向量），无则返回 null */
function findPrincipalAxis(elements) {
  let best = null
  for (const el of elements) {
    if (!el.type || !el.type.startsWith('C') || !el.axis) continue
    if (!best || (el.order || 0) > (best.order || 0)) best = el
  }
  return best ? new THREE.Vector3(...best.axis).normalize() : null
}

/** 面内平面标签：文字躺于反映面内（法向=normal，X 轴沿 u、Y 轴沿 v），中心在 center */
function buildInPlaneLabel(text, color, fontSize, normal, u, v, center) {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 80
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 80, 40)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthTest: false })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), mat)
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, normal))
  mesh.position.copy(center)
  mesh.renderOrder = 5
  // 记录面内基向量（局部），供运行时校正朝向（翻转/镜像、位置不变）
  mesh.userData = { inPlane: true, u: u.clone(), v: v.clone(), n: normal.clone() }
  return mesh
}

/**
 * 构建对称元素的 3D 表示
 * @param {Array} elements - [{ type, order, axis, label, labelPlain }]
 * @param {number} radius - 分子/晶胞包围球半径
 * @param {Object} options - { symmetryScale, showLabels, labelFontSize, labelMode }
 * @returns {{ group: THREE.Group, items: Array<{element, mesh, label, labelSprite}> }}
 */
export function buildSymmetryElements(elements, radius = 3, options = {}) {
  const { symmetryScale = 1.0, showLabels = false, labelFontSize = 40, labelMode = 'plain' } = options
  const group = new THREE.Group()
  const items = []

  // 轴长取 1.6×radius（半长 0.8×radius < 相机距离 radius），避免轴向观察者时前端越过相机被近平面裁掉
  const axisLength = radius * 1.6 * symmetryScale
  const mirrorSize = radius * 1.4 * symmetryScale
  // 主轴方向（最高阶 C 真轴），用于统一反映面矩形的一条边方向
  const principalDir = findPrincipalAxis(elements)

  /**
   * ★ 每个元素挂一个**稳定 key**（形如 C2#1），用的是 engine/elementNaming.js 的
   *   `elementKeyList` —— **与门面发布给模型的那份是同一个函数**。
   *   页面据此把"模型关掉的那个 key"对到场景里的对象；
   *   两边各写一份规则的话，一个小差别就会让模型关 A、页面关 B，而且不报错。
   */
  const elementKeys = elementKeyList(elements)

  for (let ei = 0; ei < elements.length; ei++) {
    const el = elements[ei]
    // 每个对称元素用独立 Group 包装，便于单独显隐
    const itemGroup = new THREE.Group()
    const color = getSymmetryElementColor(el.type)
    const labelText = el.label || el.type   // 用带 (n) 序号的 label 区分不同对称元素
    let labelSprite = null

    if (el.type === 'i') {
      buildInversionCenter(itemGroup, radius, symmetryScale)
      // 标签：原点旁固定偏移
      labelSprite = buildLabelSprite(labelText, color, labelFontSize)
      labelSprite.position.set(0.3 * symmetryScale, 0.3 * symmetryScale, 0.2 * symmetryScale)
    } else if (el.type.startsWith('sigma')) {
      const normal = new THREE.Vector3(...el.axis).normalize()
      // 矩形一条边沿"主轴在反映面内的投影"（规则统一；σh 因主轴⊥面致投影退化时回退世界轴）
      let edgeDir
      if (principalDir) {
        edgeDir = principalDir.clone().sub(normal.clone().multiplyScalar(principalDir.dot(normal)))
      }
      if (!edgeDir || edgeDir.lengthSq() < 1e-6) {
        const ref = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
        edgeDir = ref.sub(normal.clone().multiplyScalar(ref.dot(normal)))
      }
      edgeDir.normalize()
      buildMirrorPlane(itemGroup, el, mirrorSize, edgeDir)
      // 标签：面内平面标签，文字躺于反映面内（法向=面法向），置于矩形一角内侧、不压边框
      const section = new THREE.Vector3().crossVectors(normal, edgeDir).normalize()
      const edge = mirrorSize / 2
      const margin = 0.7 * symmetryScale
      const center = edgeDir.clone().multiplyScalar(edge - margin)
        .add(section.clone().multiplyScalar(edge - margin))
      labelSprite = buildInPlaneLabel(labelText, color, labelFontSize, normal, edgeDir, section, center)
    } else if (el.type === 'E') {
      // 恒等元素 E：恒等操作无空间几何，不绘制轴/面也不挂标签；保留空 Group 占位以对齐数组索引
    } else {
      buildAxis(itemGroup, el, axisLength, symmetryScale)
      // 标签：轴末端外侧
      const axis = new THREE.Vector3(...el.axis).normalize()
      labelSprite = buildLabelSprite(labelText, color, labelFontSize)
      labelSprite.position.copy(axis.clone().multiplyScalar(axisLength / 2 + 0.5 * symmetryScale))
    }

    // 标签：恒等元素无标签不挂载；其余始终创建、用 visible 控制（避免切换时重建场景）
    if (labelSprite) {
      labelSprite.visible = showLabels
      itemGroup.add(labelSprite)
    }

    group.add(itemGroup)
    items.push({
      element: el,
      // 稳定 key：门面发布给模型的是同一套（见上 elementKeys 的说明）
      key: elementKeys[ei] ? elementKeys[ei].key : null,
      mesh: itemGroup,
      label: labelText,
      labelSprite,
    })
  }

  return { group, items }
}

/** 构建反演中心（小球 + 发光） */
function buildInversionCenter(group, radius, symmetryScale = 1.0) {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(radius * 0.08, 0.08) * symmetryScale, 16, 16),
    new THREE.MeshPhongMaterial({
      color: getSymmetryElementColor('i'),
      emissive: new THREE.Color(getSymmetryElementColor('i')),
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9
    })
  )
  sphere.renderOrder = 2
  group.add(sphere)
}

/**
 * 构建反映面（半透明矩形，两条边分别沿 edgeDir 与 normal×edgeDir）
 * 显式指定矩形边方向，避免 PlaneGeometry 经 setFromUnitVectors 映射时绕法向自转不确定，
 * 导致不同反映面的矩形朝向（对角线/边中点 vs 主轴）不一致。
 */
function buildMirrorPlane(group, el, size, edgeDir) {
  const color = getSymmetryElementColor(el.type)
  const normal = new THREE.Vector3(...el.axis).normalize()
  const section = new THREE.Vector3().crossVectors(normal, edgeDir).normalize()
  const h = size / 2

  // 四角（面内正交基 edgeDir/section，中心在原点、法向 normal）
  const corners = [
    edgeDir.clone().multiplyScalar(h).add(section.clone().multiplyScalar(h)),
    edgeDir.clone().multiplyScalar(h).sub(section.clone().multiplyScalar(h)),
    edgeDir.clone().multiplyScalar(-h).sub(section.clone().multiplyScalar(h)),
    edgeDir.clone().multiplyScalar(-h).add(section.clone().multiplyScalar(h))
  ]
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute([
    corners[0].x, corners[0].y, corners[0].z,
    corners[1].x, corners[1].y, corners[1].z,
    corners[2].x, corners[2].y, corners[2].z,
    corners[0].x, corners[0].y, corners[0].z,
    corners[2].x, corners[2].y, corners[2].z,
    corners[3].x, corners[3].y, corners[3].z
  ], 3))
  const plane = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      // ★ 必须显式 single-pass：three 的 Material.forceSinglePass 默认是 **false**，
      //   而 WebGLRenderer 对「transparent + DoubleSide + !forceSinglePass」的材质会
      //   **编译并渲染两遍**（先 BackSide 再 FrontSide）。于是这里写的 0.18 实际呈现
      //   约 1−(1−0.18)² = 0.328 —— **比设计值深了近一倍**，多个面交叠就是那片"灰膜"。
      //   置 true 后 opacity 才真的是 0.18，且**不必调小 opacity**（面还在、教学信息不减）。
      forceSinglePass: true
    })
  )
  plane.renderOrder = 3
  group.add(plane)

  // 矩形边框（顶点在世界系，作为 plane 子节点随面移动）
  const edgeGeom = new THREE.BufferGeometry().setFromPoints(corners)
  plane.add(new THREE.LineLoop(edgeGeom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 })))
}

/** 构建对称轴（棱柱 + 末端 n 边形符号） */
function buildAxis(group, el, length, symmetryScale = 1.0) {
  const color = getSymmetryElementColor(el.type)
  const axis = new THREE.Vector3(...el.axis).normalize()

  // 棱柱
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045 * symmetryScale, 0.045 * symmetryScale, length, 16),
    new THREE.MeshPhongMaterial({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.85,
      depthWrite: true
    })
  )
  cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
  cyl.renderOrder = 2
  group.add(cyl)

  // 末端符号
  const symR = 0.22 * symmetryScale
  const isSn = el.type.startsWith('S')
  const isInfinity = el.order === Infinity

  if (isInfinity) {
    // C∞ 轴：两端小球标记（表示无限阶）
    const dotGeom = new THREE.SphereGeometry(symR * 0.7, 12, 12)
    const dotMat = new THREE.MeshBasicMaterial({ color })
    for (const sign of [1, -1]) {
      const dot = new THREE.Mesh(dotGeom, dotMat)
      dot.position.copy(axis.clone().multiplyScalar(sign * length / 2))
      group.add(dot)
    }
    return
  }

  let shape
  if (el.order === 2) {
    shape = createLensShape(symR)
  } else if (isSn) {
    shape = createHollowPolygonShape(el.order, symR)
  } else {
    shape = createPolygonShape(el.order, symR)
  }

  const geom = new THREE.ShapeGeometry(shape)
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: true })
  for (const sign of [1, -1]) {
    const sym = new THREE.Mesh(geom, mat)
    sym.position.copy(axis.clone().multiplyScalar(sign * length / 2))
    sym.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis)
    sym.renderOrder = 2   // 参与正常深度遮挡：前端记号可见，后端被分子遮挡
    group.add(sym)
  }
}
