/**
 * 对称操作教学动画模块
 * 核心约定：动画一律从"当前各组矩阵 C"出发（首次 C=I，播完 A 烘焙 A·I，再播 B 从 A 起、过渡到 B·A）。
 * 原生分子在 animGroup 内做对称运动，半透明 ghost 定格初始位置作对比；被操作对称元素本征不动为基准，
 * 其余对称元素与辅助几何随之变换。
 * 结束语义：自然播完 → 把最终矩阵烘焙到各组（停留于操作结果，进度条保留，可继续 ↻/⏮/⏭）；✕ → 复位 C=I 并收起。
 * 控制：▶/⏸ 播放暂停、↻ 重新播放（复位重播）、⏮ 逆变换（动画到 M⁻¹·C）、⏭ 再次操作（动画到 M·C）、进度拖拽（即暂停）。
 */
import * as THREE from 'three'
import { getAppearance } from '../data/settings.js'

// ==================== 控件引用（一次性绑定） ====================
const ctl = { wrap: null, input: null, toggle: null, reset: null, inverse: null, again: null, close: null, bound: false }

function ensureControls() {
  if (ctl.bound) return
  ctl.bound = true
  ctl.wrap = document.getElementById('anim-progress-wrap')
  ctl.input = document.getElementById('anim-progress')
  ctl.toggle = document.getElementById('anim-toggle')
  ctl.reset = document.getElementById('anim-reset')
  ctl.inverse = document.getElementById('anim-inverse')
  ctl.again = document.getElementById('anim-again')
  ctl.close = document.getElementById('anim-close')

  // 拖拽进度 → 自动暂停
  ctl.input && ctl.input.addEventListener('input', () => {
    if (!currentAnim) { ctl.input.value = 0; return }
    currentAnim.t = parseFloat(ctl.input.value) / 100
    currentAnim.playing = false
    refreshToggle()
  })
  // ✕：仅收起进度条，保留当前变换状态（不重置）
  ctl.close && ctl.close.addEventListener('click', () => closeProgressOnly())
  // ▶/⏸
  ctl.toggle && ctl.toggle.addEventListener('click', () => {
    if (currentAnim) currentAnim.playing = !currentAnim.playing
    else if (lastPlay) resetAndPlay(lastPlay)
    refreshToggle()
  })
  // ⟲ 重置变换：复位各组到初始（恒等），进度回起点（保留进度条）
  ctl.reset && ctl.reset.addEventListener('click', () => resetTransformState())
  // ⏭ 再次操作：从当前 C 动画到 M·C
  ctl.again && ctl.again.addEventListener('click', () => {
    if (currentAnim) { currentAnim.t = 1; currentAnim.setMatrix(1); finishAnimation(currentAnim) }
    else if (lastState === 'finished' && lastPlay) startComposite(1)
    else if (lastPlay) resetAndPlay(lastPlay)
    refreshToggle()
  })
  // ⏮ 逆变换：从当前 C 动画到 M⁻¹·C
  ctl.inverse && ctl.inverse.addEventListener('click', () => {
    if (currentAnim) { currentAnim.t = 1; currentAnim.setMatrix(1); finishAnimation(currentAnim) }
    else if (lastState === 'finished' && lastPlay) startComposite(-1)
    else if (lastPlay) resetAndPlay(lastPlay)
    refreshToggle()
  })
}

function refreshToggle() {
  if (ctl.toggle) ctl.toggle.textContent = (currentAnim && currentAnim.playing) ? '⏸' : '▶'
}

// ==================== 几何/矩阵工具 ====================

/** 反射插值矩阵：M(t) = I - 2t·nnᵀ（t:0→1 从恒等渐变为完整反射；反映自逆） */
function reflectInterpMatrix(normal, t) {
  const n = normal.normalize()
  const x = n.x, y = n.y, z = n.z
  return new THREE.Matrix4().fromArray([
    1 - 2 * t * x * x, -2 * t * x * y, -2 * t * x * z, 0,
    -2 * t * x * y, 1 - 2 * t * y * y, -2 * t * y * z, 0,
    -2 * t * x * z, -2 * t * y * z, 1 - 2 * t * z * z, 0,
    0, 0, 0, 1
  ])
}

/** 反演插值矩阵：M(t) = (1-2t)·I（等比缩放，t=1 反演；反演自逆） */
function invertInterpMatrix(t) {
  return new THREE.Matrix4().makeScale(1 - 2 * t, 1 - 2 * t, 1 - 2 * t)
}

/**
 * 对称操作插值矩阵（相对恒等 I 到操作；sign=+1 正向 / -1 逆向）
 * rotate/improper 的旋转分量按 sign 反向；reflect/invert 自逆，sign 无影响。
 */
function opMatrixAt(progress, type, axis, rotN, sign, reflectStart) {
  const twoPiN = 2 * Math.PI / rotN
  if (type === 'rotate') {
    return new THREE.Matrix4().makeRotationAxis(axis, sign * twoPiN * progress)
  } else if (type === 'reflect') {
    return reflectInterpMatrix(axis, progress)
  } else if (type === 'invert') {
    return invertInterpMatrix(progress)
  } else { // improper：先旋转 sign·2π/n，再叠加反映插值
    if (progress < reflectStart) {
      return new THREE.Matrix4().makeRotationAxis(axis, sign * twoPiN * (progress / reflectStart))
    } else {
      const p = (progress - reflectStart) / (1 - reflectStart)
      const rotM = new THREE.Matrix4().makeRotationAxis(axis, sign * twoPiN)
      return reflectInterpMatrix(axis, p).multiply(rotM)
    }
  }
}

/** 3×3 行列式（three Matrix4 列优先，取左上旋转部分） */
function det3(m) {
  const e = m.elements
  return e[0] * (e[5] * e[10] - e[6] * e[9])
    - e[4] * (e[1] * e[10] - e[2] * e[9])
    + e[8] * (e[1] * e[6] - e[2] * e[5])
}

/** 克隆分子为半透明 ghost（共享几何，独立半透明材质，定格初始位） */
function cloneGhost(group) {
  const ghost = group.clone(true)
  ghost.traverse(o => {
    if (o.isMesh) {
      o.material = o.material.clone()
      o.material.transparent = true
      o.material.opacity = 0.25
      o.material.depthWrite = false
      o.renderOrder = 1
    }
  })
  return ghost
}

/** 复位组变换为恒等（恢复自动更新） */
function resetGroupTransform(g) {
  if (!g) return
  g.matrixAutoUpdate = true
  g.matrix.identity()
  g.position.set(0, 0, 0)
  g.quaternion.set(0, 0, 0, 1)
  g.scale.set(1, 1, 1)
}

/** 构建 Sn 旋反映动画中展示的"反映面"镜面（法向=axis、过原点、半透明镜面 + 边框） */
function buildSnMirror(axis, radius) {
  const size = (radius || 3) * 1.5
  const geo = new THREE.PlaneGeometry(size, size)
  const mat = new THREE.MeshBasicMaterial({
    color: 0x8f7cff, side: THREE.DoubleSide, transparent: true, opacity: 0.12, depthWrite: false
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis).normalize())
  mesh.renderOrder = 2
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x9a8cff, transparent: true, opacity: 0.7 })
  mesh.add(new THREE.LineLoop(new THREE.EdgesGeometry(geo), edgeMat))
  return { mesh, mat, edgeMat }
}

/** 移除 Sn 旋反映动画的"反映面"镜面 */
function removeSnMirror(a) {
  if (a && a.snMirror) { a.root.remove(a.snMirror.mesh); a.snMirror = null }
}

/** 直接设置组矩阵（关闭自动更新——把最终矩阵烘焙到组） */
function setGroupMatrix(g, m) {
  if (!g) return
  g.matrixAutoUpdate = false
  g.matrix.copy(m)
  g.matrixWorldNeedsUpdate = true
}

/** 把分子从 animGroup 移回 root、清除 ghost 与 animGroup（对称元素/辅助几何始终留在 root，不处理） */
function detachToRoot(a) {
  if (a.moleculeGroup && a.animGroup === a.moleculeGroup.parent) { a.animGroup.remove(a.moleculeGroup); a.root.add(a.moleculeGroup) }
  if (a.ghost) a.root.remove(a.ghost)
  if (a.animGroup && a.animGroup.parent) a.animGroup.parent.remove(a.animGroup)
}

function hideProgress() {
  if (ctl.wrap) ctl.wrap.hidden = true
  if (ctl.input) ctl.input.value = 0
}

// ==================== 状态 ====================
let currentAnim = null
let lastPlay = null
let lastState = null   // 'preparing' | 'finished' | 'stopped'

/** 清除当前动画：把 animGroup 当前变换烘焙到各组（保留当前结构为下次起点），detach */
function clearCurrentAnim() {
  const a = currentAnim
  if (!a) return
  if (a.raf) cancelAnimationFrame(a.raf)
  const m = a.animGroup.matrix.clone()
  if (a.moleculeGroup) setGroupMatrix(a.moleculeGroup, m.clone().multiply(a.moleculeGroup.matrix.clone()))
  detachToRoot(a)
  removeSnMirror(a)
  currentAnim = null
}

/** 关闭动画：仅收起进度条，把当前变换结果保留（烘焙到组，不复位），以便继续 ⏮/⏭ 复合 */
function closeProgressOnly() {
  clearCurrentAnim()
  hideProgress()
  if (lastPlay) lastState = 'finished'
  refreshToggle()
}

/** 重置变换状态：复位各组到初始恒等（进度回起点、保留进度条），不自动播放 */
function resetTransformState() {
  const a = currentAnim
  if (a) { if (a.raf) cancelAnimationFrame(a.raf); detachToRoot(a); removeSnMirror(a); currentAnim = null }
  if (lastPlay) {
    resetGroupTransform(lastPlay.moleculeGroup)
    resetGroupTransform(lastPlay.symmetryGroup)
    resetGroupTransform(lastPlay.auxGroup)
  }
  if (ctl.input) ctl.input.value = 0
  lastState = 'stopped'
  refreshToggle()
}

/** 停止/清理并复位所有组为恒等 + 收起进度条（✕ / 切换结构 / 播新动画前的完整复位） */
function stopCurrentAnimation() {
  clearCurrentAnim()
  if (lastPlay) {
    resetGroupTransform(lastPlay.moleculeGroup)
    resetGroupTransform(lastPlay.symmetryGroup)
    resetGroupTransform(lastPlay.auxGroup)
  }
  hideProgress()
  lastState = 'stopped'
  refreshToggle()
}

/** 动画自然播完：烘焙最终矩阵到各组（停留于操作结果），保留进度条 */
function finishAnimation(a) {
  clearCurrentAnim()
  lastState = 'finished'
  if (ctl.input) ctl.input.value = 100
  refreshToggle()
}

/** 复位后播放（用于 ↻ 重新播放、▶ 完成态重播） */
function resetAndPlay(lastP) {
  resetGroupTransform(lastP.moleculeGroup)
  resetGroupTransform(lastP.symmetryGroup)
  resetGroupTransform(lastP.auxGroup)
  playSymmetryAnimation(lastP, 1)
}

/** 复合动画：从当前 C 播放到 M^sign·C（sign=+1 再次操作 / -1 逆变换） */
function startComposite(sign) {
  if (!lastPlay) return
  playSymmetryAnimation(lastPlay, sign)
}

/**
 * 播放对称操作动画（从当前各组矩阵 C 出发，首次 C=I；结果烘焙为 M^sign·C）
 * @param {Object} opts - { root, moleculeGroup, symmetryGroup, auxGroup, element }
 * @param {number} sign - +1 正向操作 / -1 逆向（自逆元素如反映/反演不受影响）
 */
export function playSymmetryAnimation({ root, moleculeGroup, symmetryGroup, auxGroup, element }, sign = 1) {
  clearCurrentAnim()   // 清旧动画，保留各组当前矩阵（C）作为新动画起点
  if (!root || !moleculeGroup || !element) return
  // 恒等元素 E：恒等操作不改变分子，无可演示，直接无操作
  if (element.type === 'E') return
  ensureControls()

  lastPlay = { root, moleculeGroup, symmetryGroup, auxGroup, element }
  lastState = 'preparing'

  const angularSpeed = getAppearance('animAngularSpeed') || 60   // °/s
  const baseDuration = getAppearance('animDuration') || 3000      // ms

  const type = element.type === 'i' ? 'invert'
    : element.type.startsWith('sigma') ? 'reflect'
    : element.type.startsWith('S') ? 'improper'
    : 'rotate'

  // 当前组矩阵 C（上一次变换结果）。对称元素 A 已被 C 重排，其"当前操作"= 共轭 C·A·C⁻¹，
  // 即轴/法向经 C 变换后做同一角度操作。注意 C 若为镜像（det=−1），共轭会翻转旋转方向，
  // 故旋转分量有效符号需乘上 det(C)。
  const cMat = moleculeGroup.matrix.clone()
  const detC = det3(cMat)
  const signEff = sign * (detC > 0 ? 1 : -1)
  const axis0 = element.axis ? new THREE.Vector3(...element.axis).normalize() : new THREE.Vector3(0, 0, 1)
  const axis = axis0.clone().applyMatrix4(cMat).normalize()
  const rotN = element.order === Infinity ? 6 : (element.order || 2)
  // 分子包围半径（供 Sn 镜面尺寸）
  const molRadius = new THREE.Box3().setFromObject(moleculeGroup).getBoundingSphere(new THREE.Sphere()).radius || 3

  // 时长（与 sign 无关）
  let dur, reflectStart = 1
  if (type === 'rotate') dur = (360 / rotN) / angularSpeed * 1000
  else if (type === 'reflect' || type === 'invert') dur = baseDuration
  else {
    const rotDur = (360 / rotN) / angularSpeed * 1000
    dur = rotDur + baseDuration
    reflectStart = rotDur / dur
  }

  // 构建容器：分子 + 对称集合 + 辅助几何整体进入 animGroup（保留各自当前矩阵 C 作为起点）
  const animGroup = new THREE.Group()
  animGroup.matrixAutoUpdate = false
  root.remove(moleculeGroup)
  animGroup.add(moleculeGroup)
  // 对称元素/辅助几何始终留在 root（固定操作基准，动画全程不动）；仅分子进 animGroup
  const ghost = cloneGhost(moleculeGroup)
  root.add(ghost)
  root.add(animGroup)

  // Sn 旋反映动画：额外展示"反映面"镜面（法向=主轴、过原点），随 progress 变亮
  let snMirror = null
  if (type === 'improper') {
    const sm = buildSnMirror(axis, molRadius)
    root.add(sm.mesh)
    snMirror = sm
  }

  if (ctl.wrap) ctl.wrap.hidden = false
  if (ctl.input) ctl.input.value = 0

  const state = {
    raf: null, animGroup, moleculeGroup, symmetryGroup, auxGroup, ghost, root, dur, axis,
    type, element, reflectStart, rotN, sign: signEff, t: 0, playing: true, setMatrix: null, snMirror
  }

  state.setMatrix = (progress) => {
    animGroup.matrix.copy(opMatrixAt(progress, type, axis, rotN, signEff, reflectStart))
    animGroup.matrixWorldNeedsUpdate = true
  }

  let last = performance.now()
  const loop = (now) => {
    const dt = now - last
    last = now
    if (state.playing) {
      state.t += dt / dur
      if (state.t >= 1) { state.t = 1; state.setMatrix(1); finishAnimation(state); return }
    }
    state.setMatrix(state.t)
    // Sn 镜面：进入反映阶段时变亮（提示"现在穿过镜面反映"）
    if (state.snMirror) {
      state.snMirror.mat.opacity = state.t >= state.reflectStart ? 0.4 : 0.12
    }
    if (ctl.input) ctl.input.value = state.t * 100
    state.raf = requestAnimationFrame(loop)
  }
  state.raf = requestAnimationFrame(loop)

  currentAnim = state
  refreshToggle()
}

/** 当前是否有动画在播 */
export function isAnimating() { return !!currentAnim }

/** 停止当前动画并复位（供外部清除，如切换结构/选中原子时） */
export function stopAnimation() { stopCurrentAnimation() }
