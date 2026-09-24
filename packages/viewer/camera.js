/**
 * camera.js — 四元数相机控制器（相机轨道 / 模型旋转 双模式）
 *
 * ★ 骨架来自 orbit/H5/js/render3d.js 的 createQuatOrbit（第 43–204 行）——
 *   它是三个模块里**唯一与宿主解耦**的实现（签名 (camera, dom, opts)，
 *   且在同项目内被实例化两次验证过：主场景 fov 50 / 角分布小场景 fov 45），
 *   并自带 Pointer Events、pointercancel、阻尼、连续滚轮、几何精确平移。
 *
 * ★ 两种模式，刻意都保留（不是历史包袱，是两种有效范式）：
 *   · mode:'camera' —— 拖拽转的是**观察者**。轨道模块用：世界不动，绕着看。
 *   · mode:'object' —— 拖拽转的是**模型**。晶体/分子用：相机与光照固定，
 *     转动模型。晶体有晶体学轴，"沿 a 轴看"是教学语言的一部分，
 *     若改成转相机，模型姿态就不再携带"标准朝向"这个信息。
 *   两者的差异只有一行：把结果四元数写进 camera 还是写进 object。
 *
 * ★ 两处投影抽象（改造前是一行 `camera.fov` 引发的 NaN 崩溃）：
 *   原 pan() 里写 `2 * distance * Math.tan(camera.fov * Math.PI / 180 / 2) / h`，
 *   而正交相机的 `camera.fov` 是 undefined → 平移系数变 NaN → 平移直接坏掉。
 *   抽成 worldPerPixel() 之后，透视与正交共用同一条路径。
 *   顺带修掉另一个缺陷：crystal/symmetry 的平移用的是**裸系数**（0.02），
 *   所以平移量不随缩放变化——缩到很小时平移会突然变得极其迟钝。
 *
 * ★ 阻尼与自动旋转都绕**相机局部 Y（屏幕竖直）**，不绕世界 Z。
 *   用世界 Z 的话，相机俯仰到极点附近时世界 Z 与视线重合，"左右拖"会退化成
 *   绕视线的滚转，用户感到左右反向。代价是允许累积滚转（trackball 的固有特性）。
 */
import { createGestureInput } from './gestures.js'

/** 默认参数。rotateSpeed=1 的含义是"划过一个屏宽 = 转 360°" */
export const CAMERA_DEFAULTS = {
  rotateSpeed: 1.0,
  zoomSpeed: 1.0,
  damping: 0.18,
  autoRotateSpeed: 0.0035,
  distance: 5,
  minDistance: 0.05,
  maxDistance: 500,
  /** 正交相机的视景体高度（世界单位）。改造前 crystal 与 symmetry 都写死 42 */
  frustumSize: 42,
}

/**
 * 创建相机控制器。
 *
 * @param {Object} opts
 * @param {Object} opts.THREE      three.js 命名空间（注入以便测试与多端）
 * @param {Object} opts.camera     相机（透视或正交均可）
 * @param {Object} [opts.object]   mode:'object' 时被旋转的根对象（需有 .quaternion）
 * @param {string} [opts.mode='camera']
 * @param {Object} [opts.dom]      手势输入的元素；不给则不接管输入（可自行调用 rotate/pan/zoomBy）
 * @param {Object} [opts.input]    已创建的手势输入层（不给且给了 dom 则内部创建）
 * @param {Object} [opts.home]     { eye:[x,y,z], look:[x,y,z] }
 * @param {Object} [opts.opts]     覆盖 CAMERA_DEFAULTS
 */
export function createQuatOrbit(o = {}) {
  const THREE = o.THREE
  if (!THREE) throw new Error('createQuatOrbit 需要 opts.THREE')
  const camera = o.camera
  if (!camera) throw new Error('createQuatOrbit 需要 opts.camera')
  const mode = o.mode === 'object' ? 'object' : 'camera'
  const object = o.object || null
  if (mode === 'object' && !object) {
    throw new Error("mode:'object' 需要 opts.object —— 否则四元数无处安放")
  }

  const cfg = Object.assign({}, CAMERA_DEFAULTS, o.opts || {})
  const isOrtho = !!camera.isOrthographicCamera

  const quat = new THREE.Quaternion()          // 当前姿态（相机或模型，取决于 mode）
  const quatTarget = new THREE.Quaternion()    // 阻尼目标
  /** mode:'object' 下相机的固定基准姿态；mode:'camera' 下等于 quat */
  const orbitQuat = new THREE.Quaternion()
  const target = new THREE.Vector3(0, 0, 0)    // 注视点（也是平移的作用对象）
  const homeEye = new THREE.Vector3(0, -4, 3)
  const homeLook = new THREE.Vector3(0, 0, 0)
  let distance = cfg.distance
  let minDistance = cfg.minDistance
  let maxDistance = cfg.maxDistance
  let frustumSize = cfg.frustumSize
  let autoRotate = false
  let enabled = true
  // 用户是否手动动过镜头。动过之后窗口尺寸变化**不再**自动重新取景——
  // 否则用户刚调好的视角会被"好心"地重置掉
  let userAdjusted = false

  const AXIS_Z = new THREE.Vector3(0, 0, 1)
  const AXIS_X = new THREE.Vector3(1, 0, 0)
  const AXIS_Y = new THREE.Vector3(0, 1, 0)
  const _v = new THREE.Vector3()
  const _right = new THREE.Vector3()
  const _up = new THREE.Vector3()
  const _qYaw = new THREE.Quaternion()
  const _qPitch = new THREE.Quaternion()
  const _qRoll = new THREE.Quaternion()
  const _tmp = new THREE.Vector3()

  // ---------------------------------------------------------------------------
  // 投影抽象：两条口子让透视与正交共用同一条路径
  // ---------------------------------------------------------------------------

  /** 一个屏幕像素对应多少世界单位。用于平移，使拖拽"跟手"且随缩放自动缩放 */
  function worldPerPixel() {
    const h = (o.dom && o.dom.clientHeight) || 1
    if (isOrtho) return frustumSize / h
    // 透视：视锥在注视点所在平面的高度 = 2·d·tan(fov/2)
    return 2 * distance * Math.tan((camera.fov * Math.PI) / 180 / 2) / h
  }

  /** 按当前视口与 frustumSize 重算正交视景体（正交相机必须显式维护它） */
  function applyFrustum(w, h) {
    if (!isOrtho) return
    const aspect = (w && h) ? w / h : (camera.aspect || 1)
    const half = frustumSize / 2
    camera.left = -half * aspect
    camera.right = half * aspect
    camera.top = half
    camera.bottom = -half
    camera.updateProjectionMatrix()
  }

  /** 缩放：透视改 distance，正交改 frustumSize —— 这是第二处抽象 */
  function zoomBy(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return
    if (isOrtho) {
      frustumSize = Math.min(frustumSize * factor, maxDistance * 10)
      frustumSize = Math.max(frustumSize, minDistance)
      applyFrustum()
    } else {
      distance = Math.min(maxDistance, Math.max(minDistance, distance * factor))
    }
    userAdjusted = true
  }

  // ---------------------------------------------------------------------------
  // 姿态与位置
  // ---------------------------------------------------------------------------

  /** 把当前 quat/distance/target 应用到相机（与 mode 无关，mode 只决定 quat 归谁） */
  function apply() {
    if (mode === 'object') {
      object.quaternion.copy(quat)
      camera.quaternion.copy(orbitQuat)
    } else {
      camera.quaternion.copy(quat)
    }
    // 相机位置 = 注视点 + 朝向基准的 +Z 方向 × 距离
    // （相机局部 +Z 由注视点指向相机，与 three 沿 -Z 观察的约定一致）
    _v.set(0, 0, 1).applyQuaternion(mode === 'object' ? orbitQuat : quat).multiplyScalar(distance)
    camera.position.copy(target).add(_v)
    camera.updateMatrixWorld()
  }

  /** 由「眼睛位置 + 注视点」设定视角（z 向上）。同时成为新的"归位"视角 */
  function setView(eye, look) {
    homeEye.copy(eye); homeLook.copy(look)
    target.copy(look)
    distance = eye.distanceTo(look)
    const m = new THREE.Matrix4().lookAt(eye, look, AXIS_Z)
    quat.setFromRotationMatrix(m)
    quatTarget.copy(quat)
    if (mode === 'object') {
      // 模型视角下：把相机基准姿态设为该朝向，模型姿态重置为单位
      orbitQuat.copy(quat)
      quat.identity(); quatTarget.identity()
    }
    apply()
  }

  /**
   * 单指拖拽旋转。偏航绕**相机局部 Y（屏幕竖直）**、俯仰绕局部 X，两者右乘。
   * 见文件头：不能绕世界 Z，否则极点附近左右反向。
   */
  function rotate(dx, dy) {
    if (!enabled) return
    const w = (o.dom && o.dom.clientWidth) || 1
    const h = (o.dom && o.dom.clientHeight) || 1
    const yawAngle = -2 * Math.PI * dx / w * cfg.rotateSpeed
    const pitchAngle = -2 * Math.PI * dy / h * cfg.rotateSpeed
    _qPitch.setFromAxisAngle(AXIS_X, pitchAngle)
    _qYaw.setFromAxisAngle(AXIS_Y, yawAngle)
    quatTarget.multiply(_qPitch).multiply(_qYaw).normalize()
    userAdjusted = true
  }

  /** 双指滚转（绕视线）——orbit 原本没有这个能力，从 crystal/symmetry 并进来 */
  function roll(dAngle) {
    if (!enabled || !dAngle) return
    const viewAxis = mode === 'object' ? AXIS_Z.applyQuaternion(orbitQuat) : AXIS_Z.applyQuaternion(quat)
    _qRoll.setFromAxisAngle(viewAxis.clone().normalize(), dAngle)
    quatTarget.premultiply(_qRoll).normalize()
    userAdjusted = true
  }

  /** 拖拽平移：沿相机屏幕平面移动注视点，每像素的世界位移由 worldPerPixel 给出 */
  function pan(dx, dy) {
    if (!enabled) return
    const k = worldPerPixel()
    const basis = mode === 'object' ? orbitQuat : quat
    _right.set(1, 0, 0).applyQuaternion(basis)
    _up.set(0, 1, 0).applyQuaternion(basis)
    target.addScaledVector(_right, -dx * k)   // 向右拖 → 场景右移
    target.addScaledVector(_up, dy * k)
    userAdjusted = true
  }

  /**
   * 最佳视角对齐（best-view）：把世界方向 d 转到正对相机。
   * 晶体/分子常用（"沿 [111] 看"、"把主轴对准屏幕"）。源自 symmetry 的 alignToView。
   * @param {Array|Object} direction 世界方向（数组或 Vector3）
   */
  function alignTo(direction) {
    const d = Array.isArray(direction) ? _tmp.set(direction[0], direction[1], direction[2]) : direction
    if (!d || d.lengthSq() === 0) return false
    const look = new THREE.Vector3(0, 0, 1)
    if (mode === 'object') look.applyQuaternion(orbitQuat)
    const q = new THREE.Quaternion().setFromUnitVectors(d.clone().normalize(), look.normalize())
    quatTarget.copy(q)
    userAdjusted = true
    return true
  }

  // ---------------------------------------------------------------------------
  // 每帧：自动旋转 + 阻尼插值
  // ---------------------------------------------------------------------------
  function update() {
    if (autoRotate && !dragging) {
      // 自动旋转同样绕相机局部 Y（屏幕竖直）→ 视觉上始终水平自转，与拖拽一致
      _qYaw.setFromAxisAngle(AXIS_Y, cfg.autoRotateSpeed)
      quatTarget.multiply(_qYaw).normalize()
    }
    if (quat.angleTo(quatTarget) > 1e-5) {
      quat.slerp(quatTarget, cfg.damping)     // 球面插值：平滑且无奇异
    } else {
      quat.copy(quatTarget)
    }
    apply()
  }

  // ---------------------------------------------------------------------------
  // 输入接线（也可不给 dom，由调用方自己把事件转发到 rotate/pan/zoomBy/roll）
  // ---------------------------------------------------------------------------
  let dragging = false
  let input = o.input || null
  if (!input && o.dom) {
    input = createGestureInput({
      dom: o.dom,
      setTouchAction: true,
      onGesture: (g) => {
        switch (g.type) {
          case 'rotate': rotate(g.dx, g.dy); break
          case 'pan': pan(g.dx, g.dy); break
          case 'pinch': zoomBy(g.factor); break
          case 'roll': roll(g.dAngle); break
          case 'zoom': zoomBy(g.factor); break
          case 'start': dragging = true; break
          case 'end': dragging = false; break
          default: break
        }
      },
    })
  }

  if (o.home) setView(new THREE.Vector3(...o.home.eye), new THREE.Vector3(...(o.home.look || [0, 0, 0])))
  apply()

  return {
    update, setView, apply, alignTo, rotate, pan, roll, zoomBy, worldPerPixel,
    target, quat, quatTarget,
    setAutoRotate: (v) => { autoRotate = !!v },
    setEnabled: (v) => { enabled = !!v; if (input && input.setEnabled) input.setEnabled(v) },
    setDistance: (d) => { distance = Math.min(maxDistance, Math.max(minDistance, d)); apply() },
    getDistance: () => distance,
    setFrustumSize: (f) => { frustumSize = f; applyFrustum() },
    getFrustumSize: () => frustumSize,
    setLimits: (lo, hi) => { minDistance = lo; maxDistance = hi },
    resetHome: () => { userAdjusted = false; setView(homeEye, homeLook) },
    isUserAdjusted: () => userAdjusted,
    /** 窗口尺寸变化时调用：正交相机要重算视景体 */
    resize: (w, h) => { applyFrustum(w, h) },
    /** 供模块在页面切后台再回来时强制复位手势基线（防"回来第一下就跳"） */
    resetInput: () => { if (input && input.reset) input.reset() },
    destroy: () => { if (input && input.destroy) input.destroy() },
    mode,
  }
}

export default createQuatOrbit
