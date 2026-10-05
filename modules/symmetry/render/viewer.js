/**
 * 3D 查看器主类
 * 负责 Three.js 场景初始化、四元数轨道相机、渲染循环与鼠标交互
 * 交互逻辑移植自 crystal 项目 components/viewer-canvas/viewer-canvas.js（Web 化）
 */
import * as THREE from 'three'
// ★ 环境贴图：原子球换成 PBR 之后，"金属感"有一半来自**反射周围环境**；
//   没有它，`metalness 0.55` 的球会发黑发脏（晶体模块的同一段注释也这么说）。
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { setupLights, DEFAULT_LIGHT_CONFIG } from './materials.js'
import { getVisualColor } from '../data/settings.js'

/** 默认相机距离 */
const DEFAULT_RADIUS = 35.0
/** 最小正交视锥尺寸（防穿模） */
const MIN_FRUSTUM = 0.1
/** 旋转灵敏度 */
const MOUSE_ROTATE_SENSITIVITY = 0.005
/** 平移灵敏度 */
const MOUSE_PAN_SENSITIVITY = 0.02

export class SymmetryViewer {
  /**
   * @param {HTMLElement} container - 挂载容器
   */
  constructor(container) {
    this.container = container
    this._state = {
      scene: null,
      camera: null,
      renderer: null,
      root: null,          // 场景内容根节点（旋转作用于此）
      lights: [],
      orbitQuat: null,     // 相机轨道四元数
      radius: DEFAULT_RADIUS,
      target: { x: 0, y: 0, z: 0 },
      panOffset: { x: 0, y: 0, z: 0 },
      frustumSize: DEFAULT_RADIUS * 1.2,
      theta: Math.PI / 4,
      phi: Math.atan(Math.sqrt(2)),
      mouseState: { isDown: false, button: 0, lastX: 0, lastY: 0, startX: 0, startY: 0, lastTapTime: 0 }
    }
    this._init()
  }

  // ==================== 初始化 ====================

  _init() {
    const s = this._state
    const width = this.container.clientWidth || window.innerWidth
    const height = this.container.clientHeight || window.innerHeight

    // 渲染器
    /**
     * ★ 2026-10-06：加 `alpha: true`，只为**导出透明背景的图片**。
     *   原先 `alpha` 缺省为 false ⇒ 画布没有 alpha 通道，`setClearAlpha(0)` 也不会透明，
     *   存下来的 PNG 永远带着一层底色（用户要的是"和轨道视界一样没有底色"）。
     *   ★ 屏幕上观感不变：下面 `setClearColor(bgColor, 1)` 的 alpha 仍是 1（不透明），
     *     只有抓图那一刻才临时把它设成 0（见 apps/web/src/pages/symmetry.js 的监听）。
     */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    // ★ 上限 1.5、缺值取 1：原写法 `window.devicePixelRatio || 2` 有两处毛病——
    //   ① 无上限：3x 屏上渲染缓冲是逻辑尺寸的 3 倍，拖慢且让细线发糊；
    //   ② `|| 2` 在 devicePixelRatio 为 0/undefined 时**反而放大两倍**（本该是 1）。
    //   与 crystal 的写法对齐（projects/crystal/H5/src/components/viewer-canvas.js）。
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setSize(width, height)
    renderer.setClearColor(getVisualColor('bgColor'), 1)
    this.container.appendChild(renderer.domElement)
    s.renderer = renderer

    // 场景
    s.scene = new THREE.Scene()

    // ★ 环境贴图（与晶体模块同一手法、同一参数）：原子球是 PBR 材质，
    //   金属度的观感依赖"反射到了什么"。用 RoomEnvironment 现场烘一张 PMREM，
    //   失败就降级（保持原样 + 一次警告），绝不让整页渲染不出来。
    this._setupEnvironment(s)

    // 灯光
    s.lights = setupLights(s.scene, DEFAULT_LIGHT_CONFIG)

    // 内容根节点
    s.root = new THREE.Group()
    s.scene.add(s.root)

    // 相机（正交投影）
    const aspect = width / (height || 1)
    const frustum = s.frustumSize
    s.camera = new THREE.OrthographicCamera(
      frustum * aspect / -2, frustum * aspect / 2,
      frustum / 2, frustum / -2,
      0.1, 500
    )

    // 轨道四元数
    s.orbitQuat = this._makeOrbitQuat(s.theta, s.phi)
    this._updateCameraPosition()

    // 事件监听
    this._bindEvents()

    // 渲染循环
    renderer.setAnimationLoop(() => this._animate())
  }

  /** 构建干净轨道四元数：先绕 X 转 (phi-π/2)，再绕世界 Y 转 theta（避免万向节锁） */
  _makeOrbitQuat(theta, phi) {
    const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), theta)
    const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), phi - Math.PI / 2)
    return qY.clone().multiply(qX)
  }

  /** 更新相机位置与朝向（纯四元数驱动） */
  _updateCameraPosition() {
    const s = this._state
    if (!s.camera || !s.orbitQuat) return

    const targetVec = new THREE.Vector3(s.target.x, s.target.y, s.target.z)
    const orbitOffset = new THREE.Vector3(0, 0, s.radius).applyQuaternion(s.orbitQuat)
    const panVec = new THREE.Vector3(s.panOffset.x, s.panOffset.y, s.panOffset.z)
    s.camera.position.copy(targetVec).add(orbitOffset).add(panVec)

    const m4 = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat),
      new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat),
      new THREE.Vector3(0, 0, 1).applyQuaternion(s.orbitQuat)
    )
    s.camera.quaternion.setFromRotationMatrix(m4)
  }

  /** 更新正交视锥（缩放） */
  /**
   * 由"建议半径"算视锥的**竖直**全高。
   *
   * ★ 为什么不能用 `半径 × 常数`（原先写死 ×1.2）：`suggestedRadius` 来自场景构建器，
   *   它等于"最远原子的距心距离 **+ 1.5 Å 留白**"，所以分子**直径 ≈ 2×(半径−1.5)**，
   *   而 ×1.2 给出的视高只有 1.2×半径 —— **比直径还小**，大分子直接溢出视口。
   *   实测：苯、三苯甲烷都溢出；小分子因为构建器有 3.0 的下限才没露馅。
   * ★ 除以 min(1, aspect)：正交相机的 frustumSize 是**竖直**全高，水平是 frustumSize×aspect。
   *   宽屏时竖直是紧的那一边、窄屏时水平才是 —— 取 min 让两边都装得下
   *   （与晶体取景那处是同一套修法）。
   */
  _frustumFor(radius) {
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    const aspect = w / (h || 1)
    const fitR = Math.max(0.5, radius - 1.5)      // 去掉构建器加的那 1.5 Å 留白
    return 2 * fitR * 1.25 / Math.min(1, aspect)
  }

  _updateFrustum() {
    const s = this._state
    const width = this.container.clientWidth || window.innerWidth
    const height = this.container.clientHeight || window.innerHeight
    const aspect = width / (height || 1)
    const f = s.frustumSize
    s.camera.left = f * aspect / -2
    s.camera.right = f * aspect / 2
    s.camera.top = f / 2
    s.camera.bottom = f / -2
    s.camera.updateProjectionMatrix()
  }

  // ==================== 渲染循环 ====================

  _animate() {
    const s = this._state
    if (!s.renderer || !s.scene || !s.camera) return
    s.renderer.render(s.scene, s.camera)
    if (this._frameHook) this._frameHook()
  }

  /** 注册每帧交互钩子（用于运行时校正，如 σ 标签朝向） */
  setFrameHook(fn) { this._frameHook = fn }

  /** 相机世界基向量：up / right / look（屏幕法线方向） */
  getViewBasis() {
    const s = this._state
    const q = s.orbitQuat
    return {
      up: new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize(),
      right: new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize(),
      look: new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize()
    }
  }

  // ==================== 场景内容 ====================

  /**
   * 设置场景内容（替换原有内容）
   * @param {THREE.Group} group - 待展示的根组
   * @param {number} suggestedRadius - 建议包围球半径（用于相机距离）
   * @param {Object} options - { preserveView } 为真时保留当前视角（同一结构改设置时）
   */
  setContent(group, suggestedRadius, options = {}) {
    const { preserveView = false } = options
    const s = this._state
    // 清除旧内容
    this._clearRoot()

    if (group) s.root.add(group)

    // 保存当前结构的建议半径（双击复位用）
    if (suggestedRadius) this._currentRadius = suggestedRadius

    // 切换结构时重置视角；同一结构改设置时保留视角
    if (suggestedRadius) {
      const grew = suggestedRadius > (s._framedRadius || 0)
      if (!preserveView) {
        this._resetView(Math.PI / 4, Math.atan(Math.sqrt(2)), suggestedRadius)
        s.frustumSize = this._frustumFor(suggestedRadius)
        this._updateFrustum()
        s._framedRadius = suggestedRadius
      } else if (grew) {
        /**
         * ★ `preserveView` 该保留的是**视角**（θ/φ/pan），不是**取景窗**。
         *   页面在改「原子缩放 / 对称元素大小」时传的就是它 —— 内容变大了而视锥不变，
         *   边上直接被裁（用户报的"模型显示不全"就是这么来的）。
         *   相机距离也要一并抬：正交投影下距离不影响成像大小，但**近平面会切内容**，
         *   内容伸到相机后面就彻底消失（轴端标签正是这样不见的）。
         *   ★ 只"增大"不"减小"：内容变小时保持原取景，免得滑块往回拖时画面反复缩放。
         */
        s.frustumSize = this._frustumFor(suggestedRadius)
        this._updateFrustum()
        if (suggestedRadius > s.radius) s.radius = suggestedRadius
        s._framedRadius = suggestedRadius
      }
    }
    this._updateCameraPosition()
  }

  /** 清除根节点内容并释放几何体/材质 */
  _clearRoot() {
    const s = this._state
    if (!s.root) return
    s.root.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
        else child.material.dispose()
      }
    })
    while (s.root.children.length > 0) {
      s.root.remove(s.root.children[0])
    }
  }

  /** 重置视角参数 */
  _resetView(theta, phi, radius) {
    const s = this._state
    s.theta = theta
    s.phi = phi
    s.orbitQuat = this._makeOrbitQuat(theta, phi)
    s.radius = radius || DEFAULT_RADIUS
    // ★ 记下"当前视锥是按哪个半径拟合的"：`setContent` 靠它判断
    //   `preserveView` 时内容有没有变大到需要重算取景（见那里的说明）。
    s._framedRadius = s.radius
    s.target = { x: 0, y: 0, z: 0 }
    s.panOffset = { x: 0, y: -s.radius * 0.12, z: 0 }
  }

  /** 公开：重置视角（用当前结构的建议半径，避免过小/过大），并恢复主轴正对屏幕的初始朝向 */
  resetView() {
    const radius = this._currentRadius || DEFAULT_RADIUS
    this._resetView(Math.PI / 4, Math.atan(Math.sqrt(2)), radius)
    this._state.frustumSize = this._frustumFor(radius)
    this._updateFrustum()
    this._updateCameraPosition()
    if (this._state.root) {
      // 双击复位：若曾做过主轴对齐，则恢复到"主轴垂直屏幕 / 对称面平行屏幕"的朝向
      if (this._alignDir) this.alignToView(this._alignDir)
      else this._state.root.quaternion.set(0, 0, 0, 1)
    }
  }

  // ==================== 鼠标交互 ====================

  _bindEvents() {
    const dom = this.container

    dom.addEventListener('mousedown', (e) => this._onMouseDown(e))
    window.addEventListener('mousemove', (e) => this._onMouseMove(e))
    window.addEventListener('mouseup', (e) => this._onMouseUp(e))
    dom.addEventListener('wheel', (e) => this._onWheel(e), { passive: false })
    dom.addEventListener('contextmenu', (e) => e.preventDefault())
    dom.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false })
    dom.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false })
    dom.addEventListener('touchend', (e) => this._onTouchEnd(e))
    window.addEventListener('resize', () => this.resize())
  }

  _onMouseDown(e) {
    const ms = this._state.mouseState
    ms.isDown = true
    ms.button = e.button || 0
    ms.lastX = e.clientX
    ms.lastY = e.clientY
    ms.startX = e.clientX
    ms.startY = e.clientY
  }

  _onMouseMove(e) {
    const s = this._state
    const ms = s.mouseState
    if (!ms.isDown || !s.camera) return

    const prevX = ms.lastX
    const prevY = ms.lastY
    const dx = e.clientX - prevX
    const dy = e.clientY - prevY
    ms.lastX = e.clientX
    ms.lastY = e.clientY

    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return

    if (ms.button === 0) {
      if (!s.root) return
      // 绕相机 up/right 轴旋转（dx/dy 驱动）
      const deltaTheta = dx * MOUSE_ROTATE_SENSITIVITY
      const deltaPhi = dy * MOUSE_ROTATE_SENSITIVITY
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat).normalize()
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat).normalize()
      const qH = new THREE.Quaternion().setFromAxisAngle(up, deltaTheta)
      const qV = new THREE.Quaternion().setFromAxisAngle(right, deltaPhi)
      s.root.quaternion.copy(qH.multiply(qV).multiply(s.root.quaternion)).normalize()

      // 绕 look 轴滚转（极角变化驱动，同时依赖 x、y；详见 theory 推导）
      const center = this._projectOrigin()
      const r0x = prevX - center.x, r0y = prevY - center.y
      const r1x = e.clientX - center.x, r1y = e.clientY - center.y
      const d0 = Math.hypot(r0x, r0y), d1 = Math.hypot(r1x, r1y)
      if (d0 > 5 && d1 > 5) {
        let deltaAngle = Math.atan2(r1y, r1x) - Math.atan2(r0y, r0x)
        if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI
        if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI
        this._applyRoll(deltaAngle)
      }
    } else if (ms.button === 2) {
      // 右键：平移
      const panX = dx * MOUSE_PAN_SENSITIVITY
      const panY = dy * MOUSE_PAN_SENSITIVITY
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat)
      const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat)
      s.panOffset.x += -camRight.x * panX + camUp.x * panY
      s.panOffset.y += -camRight.y * panX + camUp.y * panY
      s.panOffset.z += -camRight.z * panX + camUp.z * panY
      this._updateCameraPosition()
    }
  }

  _onMouseUp(e) {
    const s = this._state
    const ms = s.mouseState
    const dx = Math.abs(e.clientX - ms.startX)
    const dy = Math.abs(e.clientY - ms.startY)
    if (dx < 5 && dy < 5 && ms.button === 0) {
      const now = Date.now()
      if (now - ms.lastTapTime < 300) {
        // 双击：复位视角
        this.resetView()
        ms.lastTapTime = 0
      } else {
        ms.lastTapTime = now
        this._onTap(e.clientX, e.clientY)
      }
    }
    ms.isDown = false
  }

  _onWheel(e) {
    const s = this._state
    e.preventDefault()
    const delta = e.deltaY > 0 ? 1 : -1
    const zoomFactor = delta > 0 ? 1.1 : 0.9

    if (s.frustumSize !== undefined) {
      s.frustumSize *= zoomFactor
      if (s.frustumSize < MIN_FRUSTUM) s.frustumSize = MIN_FRUSTUM
      s.panOffset.x *= zoomFactor
      s.panOffset.y *= zoomFactor
      s.panOffset.z *= zoomFactor
      this._updateFrustum()
    }
    this._updateCameraPosition()
  }

  /** 点击回调：委托给原子拾取处理器（由 main.js 注册） */
  _onTap(clientX, clientY) {
    if (this._onAtomTap) this._onAtomTap(clientX, clientY)
  }

  /** 将分子中心（3D 原点）投影到视口坐标（与 clientX/clientY 对齐） */
  _projectOrigin() {
    const s = this._state
    const v = new THREE.Vector3(s.target.x, s.target.y, s.target.z).project(s.camera)
    const rect = s.renderer.domElement.getBoundingClientRect()
    return {
      x: rect.left + (v.x + 1) / 2 * rect.width,
      y: rect.top + (1 - v.y) / 2 * rect.height
    }
  }

  /** 绕视线轴（屏幕法线）滚转内容根节点 */
  _applyRoll(deltaAngle) {
    const s = this._state
    if (!s.root || Math.abs(deltaAngle) < 1e-5) return
    const look = new THREE.Vector3(0, 0, 1).applyQuaternion(s.orbitQuat).normalize()
    const qRoll = new THREE.Quaternion().setFromAxisAngle(look, -deltaAngle)
    s.root.quaternion.copy(qRoll.multiply(s.root.quaternion)).normalize()
  }

  // ==================== 触摸交互（移动端） ====================

  _onTouchStart(e) {
    const touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))
    this._state.touchState = { touches, lastTouches: touches }
  }

  _onTouchMove(e) {
    const s = this._state
    const ts = s.touchState
    if (!ts || !s.camera) return
    e.preventDefault()

    const touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))

    if (touches.length === 1 && ts.lastTouches.length === 1) {
      // 单指：旋转
      const dx = touches[0].x - ts.lastTouches[0].x
      const dy = touches[0].y - ts.lastTouches[0].y
      const deltaTheta = dx * MOUSE_ROTATE_SENSITIVITY
      const deltaPhi = dy * MOUSE_ROTATE_SENSITIVITY
      if (s.root) {
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat).normalize()
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat).normalize()
        const qH = new THREE.Quaternion().setFromAxisAngle(up, deltaTheta)
        const qV = new THREE.Quaternion().setFromAxisAngle(right, deltaPhi)
        s.root.quaternion.copy(qH.multiply(qV).multiply(s.root.quaternion)).normalize()
      }
    } else if (touches.length === 2 && ts.lastTouches.length === 2) {
      // 双指：缩放 + 平移
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
      const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      const curDist = dist(touches[0], touches[1])
      const lastDist = dist(ts.lastTouches[0], ts.lastTouches[1])

      if (lastDist > 1) {
        const ratio = curDist / lastDist
        s.frustumSize /= ratio
        if (s.frustumSize < MIN_FRUSTUM) s.frustumSize = MIN_FRUSTUM
        s.panOffset.x /= ratio; s.panOffset.y /= ratio; s.panOffset.z /= ratio
        this._updateFrustum()
      }

      const curMid = mid(touches[0], touches[1])
      const lastMid = mid(ts.lastTouches[0], ts.lastTouches[1])
      const dx = curMid.x - lastMid.x
      const dy = curMid.y - lastMid.y
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat)
      const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat)
      s.panOffset.x += (-camRight.x * dx + camUp.x * dy) * MOUSE_PAN_SENSITIVITY
      s.panOffset.y += (-camRight.y * dx + camUp.y * dy) * MOUSE_PAN_SENSITIVITY
      s.panOffset.z += (-camRight.z * dx + camUp.z * dy) * MOUSE_PAN_SENSITIVITY
      this._updateCameraPosition()

      // 双指滚转：两指连线角度变化 → 绕视线轴
      const lastAngle = Math.atan2(ts.lastTouches[1].y - ts.lastTouches[0].y, ts.lastTouches[1].x - ts.lastTouches[0].x)
      const curAngle = Math.atan2(touches[1].y - touches[0].y, touches[1].x - touches[0].x)
      let deltaAngle = curAngle - lastAngle
      if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI
      if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI
      this._applyRoll(deltaAngle)
    }

    ts.lastTouches = touches
  }

  _onTouchEnd() {
    this._state.touchState = null
  }

  // ==================== 尺寸调整 ====================

  resize() {
    const s = this._state
    const width = this.container.clientWidth || window.innerWidth
    const height = this.container.clientHeight || window.innerHeight
    s.renderer.setSize(width, height)
    this._updateFrustum()
  }

  /** 设置背景色（无需重建场景） */
  setBackground(color) {
    if (this._state.renderer) this._state.renderer.setClearColor(color, 1)
  }

  /** 获取场景内容根节点（供动画系统引用分子组 / 原子拾取） */
  getRoot() {
    return this._state.root
  }

  /**
   * 初始视角对齐：把给定方向（分子轴 / 面法向，root 局部系）旋转到屏幕法线方向，
   * 使主轴垂直屏幕 / 对称面平行屏幕。dir 为 null 时复位 root 旋转换为恒等。
   * 仅应在首次加载（preserveView=false 时）调用，避免覆盖用户已调的视角。
   */
  alignToView(dir) {
    const s = this._state
    if (!s.root) return
    this._alignDir = dir ? dir.slice() : null   // 记录对齐方向，供 resetView 复用
    if (!dir) { s.root.quaternion.set(0, 0, 0, 1); return }
    const look = new THREE.Vector3(0, 0, 1).applyQuaternion(s.orbitQuat).normalize()
    const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize()
    s.root.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(d, look)).normalize()
  }

  /** 注册原子点击处理器（main.js 注入） */
  setAtomTapHandler(fn) {
    this._onAtomTap = fn
  }

  /**
   * 射线拾取原子：将视口坐标投影为射线，命中带 userData.atomIndex 的 mesh
   * @returns {number|null} 命中原子索引，否则 null
   */
  pickAtom(clientX, clientY) {
    const s = this._state
    if (!s.camera || !s.root) return null
    const rect = s.renderer.domElement.getBoundingClientRect()
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), s.camera)
    const meshes = []
    s.root.traverse(o => {
      if (o.isMesh && o.userData && o.userData.atomIndex !== undefined) meshes.push(o)
    })
    const hits = raycaster.intersectObjects(meshes, false)
    if (hits.length) return hits[0].object.userData.atomIndex
    return null
  }

  /**
   * 生成环境贴图（PMREM）。移植自 `projects/crystal/H5/src/components/viewer-canvas.js:344-355`。
   *
   * ★ 为什么用 try/catch 包住：`PMREMGenerator` 需要 WebGL 渲染器与浮点纹理支持，
   *   老设备/软件渲染下可能失败。失败时的正确行为是"退化回直射高光"，
   *   而不是让整个三维视图白屏 —— 金属感是观感，渲染不出来才是故障。
   */
  _setupEnvironment(s) {
    if (!s.renderer || !THREE.PMREMGenerator) return
    try {
      const pmrem = new THREE.PMREMGenerator(s.renderer)
      // fromScene 的第二个参数是模糊度：越大反射越柔（0.04 接近打磨金属）
      s.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
      s.scene.environment = s.envRT.texture
      pmrem.dispose()          // pmrem 本身用完即弃；环境贴图在 s.envRT 里
    } catch (e) {
      console.warn('[symmetry-viewer] 环境贴图生成失败，金属质感将退化为普通高光：', e)
    }
  }

  /** 销毁并释放资源 */
  dispose() {
    const s = this._state
    s.renderer.setAnimationLoop(null)
    this._clearRoot()
    for (const light of s.lights) s.scene.remove(light)
    // ★ 环境贴图是显存里的 RT，不 dispose 会随每次进出点群页累积（route 反复挂载）
    if (s.envRT) {
      try { s.envRT.dispose() } catch (e) { /* 已经释放过 */ }
      if (s.scene) s.scene.environment = null
      s.envRT = null
    }
    s.renderer.dispose()
    if (s.renderer.domElement && s.renderer.domElement.parentNode) {
      s.renderer.domElement.parentNode.removeChild(s.renderer.domElement)
    }
  }
}
