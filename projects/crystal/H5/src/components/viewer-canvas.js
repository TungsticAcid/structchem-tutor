/**
 * 3D查看器画布组件 (H5)
 * 封装 Three.js 场景初始化、渲染循环、触摸/鼠标交互和晶体数据加载
 * 从小程序版转换，替换 createScopedThreejs 为标准 Three.js
 */
import * as THREE from 'three'
import { buildCrystalScene, clearScene, updateWorldClipPlanes } from '../lib/scene-builder.js'
import { TouchHandler } from '../lib/touch-handler.js'
import { getCrystalData } from '../lib/crystal-loader.js'
import { getVisualColor } from '../data/settings.js'

/** 默认相机距离 */
const DEFAULT_RADIUS = 35.0
/** 最小缩放距离 */
const MIN_RADIUS = 0.5
/** 默认平移偏移 Y 轴因子（晶体偏上，避开底部控制面板） */
const DEFAULT_PAN_Y_FACTOR = 0.12

/** 需要重建场景的属性（几何/模型变化） */
const REBUILD_PROPS = ['modelType', 'atomScale', 'stickRadius', 'cellDisplayMode', 'opacity', 'fractionalShift', 'partialAtoms', 'auxiliaryLineAboveAtoms']
/** 仅需更新可见性的属性（无需重建场景） */
const VISIBILITY_PROPS = ['showAtoms', 'showWireframe', 'showInterstices', 'showOctahedral', 'showTetrahedral', 'showSymmetry', 'showBonds', 'showAxes', 'showAuxiliaryBody', 'showAuxiliaryFace', 'atomVisibility', 'showAtomLabels', 'showHydrogenBonds', 'showLatticePoints']

export class ViewerCanvas {
  constructor(options = {}) {
    this._container = options.container
    this._events = options.events || {}
    this._canvasId = options.canvasId || 'crystalCanvas'
    this.canvas = null

    // 属性（从 options.props 或默认值）
    const props = options.props || {}
    this._crystalId = props.crystalId || ''
    this._showAtoms = props.showAtoms !== undefined ? props.showAtoms : true
    this._showWireframe = props.showWireframe !== undefined ? props.showWireframe : true
    this._showInterstices = props.showInterstices || false
    this._showOctahedral = props.showOctahedral || false
    this._showTetrahedral = props.showTetrahedral || false
    this._showSymmetry = props.showSymmetry || false
    this._showBonds = props.showBonds !== undefined ? props.showBonds : false
    this._showAxes = props.showAxes !== undefined ? props.showAxes : true
    this._showAuxiliaryBody = props.showAuxiliaryBody || false
    this._showAuxiliaryFace = props.showAuxiliaryFace || false
    this._auxiliaryLineAboveAtoms = props.auxiliaryLineAboveAtoms || false
    this._atomScale = props.atomScale != null ? props.atomScale : 1.0
    this._modelType = props.modelType || 'ballStick'
    this._stickRadius = props.stickRadius != null ? props.stickRadius : 0.08
    this._cellDisplayMode = props.cellDisplayMode || 'conventional'
    this._opacity = props.opacity != null ? props.opacity : 0.0
    this._depthFog = props.depthFog || false
    this._fractionalShift = props.fractionalShift || [0, 0, 0]
    this._partialAtoms = props.partialAtoms || false
    this._lightConfig = props.lightConfig || []
    this._atomVisibility = props.atomVisibility || {}
    this._showAtomLabels = props.showAtomLabels || false
    this._showHydrogenBonds = props.showHydrogenBonds !== undefined ? props.showHydrogenBonds : true
    this._showLatticePoints = props.showLatticePoints || false

    // 内部状态
    this._state = {
      canvas: null,
      renderer: null,
      scene: null,
      camera: null,
      groups: null,
      crystalRoot: null,
      currentCrystalData: null,
      touchHandler: null,
      animFrameId: 0,
      orbitQuat: null,
      radius: DEFAULT_RADIUS,
      target: { x: 0, y: 0, z: 0 },
      panOffset: { x: 0, y: -DEFAULT_RADIUS * DEFAULT_PAN_Y_FACTOR, z: 0 },
      lights: {},
      _theta: Math.PI / 4,
      _phi: Math.atan(Math.sqrt(2)),
      _suppressViewEvent: false,
      _loadedCrystalId: null,
      _rebuilding: false,
      _frustumSize: null,
      _cellBoundingRadius: null,
      _mouseState: null,
      _touchIds: null
    }

    this._loading = false
  }

  /**
   * 设置属性并智能增量更新
   * 模型类变化 → 重建场景；可见性类变化 → 仅更新图层可见性；灯光变化 → 增量更新灯光
   */
  setProps(updates) {
    let needsRebuild = false
    let needsVisibility = false
    let needsLight = false

    for (const [k, v] of Object.entries(updates)) {
      const key = '_' + k
      if (!this.hasOwnProperty(key)) continue
      const changed = this[key] !== v
      this[key] = v
      if (!changed) continue
      if (k === 'crystalId') needsRebuild = true
      else if (REBUILD_PROPS.includes(k)) needsRebuild = true
      else if (k === 'lightConfig') needsLight = true
      else if (VISIBILITY_PROPS.includes(k)) needsVisibility = true
    }

    // 场景未就绪时（mount 前）不做增量处理，_loadCrystal 会读取最新属性
    if (!this._state.scene) return
    if (needsLight) this._applyLightConfig(this._lightConfig)
    if (needsRebuild) {
      this._loadCrystal(this._crystalId)
    } else if (needsVisibility) {
      this._updateVisibility()
    }
  }

  /** 挂载 */
  mount() {
    this._initScene()
  }

  /** 卸载 */
  unmount() {
    this._destroy()
  }

  /** 获取容器 */
  getContainer() {
    return this._container
  }

  // ==================== 场景初始化 ====================

  _initScene() {
    const container = this._container
    if (!container) return

    // 查找或创建 canvas
    let canvas = container.querySelector('canvas.webgl-canvas')
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.className = 'webgl-canvas'
      canvas.style.cssText = 'width:100%;height:100%;display:block;'
      container.appendChild(canvas)
    }
    this.canvas = canvas

    const s = this._state
    s.canvas = canvas

    // 调整 canvas 尺寸
    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 2
      const cssW = Math.floor(rect.width)
      const cssH = Math.floor(rect.height)
      // 物理像素（渲染缓冲）
      const w = Math.floor(cssW * dpr)
      const h = Math.floor(cssH * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        if (s.renderer) {
          // 传入 CSS 逻辑尺寸，updateStyle=false 保持 canvas 的 100% 布局；
          // 渲染缓冲由 setPixelRatio(dpr) 自动换算为物理尺寸，避免 dpr 双重相乘
          s.renderer.setSize(cssW, cssH, false)
          // 更新相机宽高比
          if (s.camera && s._frustumSize !== undefined) {
            const aspect = w / (h || 1)
            s.camera.left = s._frustumSize * aspect / -2
            s.camera.right = s._frustumSize * aspect / 2
            s.camera.top = s._frustumSize / 2
            s.camera.bottom = s._frustumSize / -2
            s.camera.updateProjectionMatrix()
          }
        }
      }
    }

    // 渲染器
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio || 2)
    const bgColor = getVisualColor('bgColor')
    renderer.setClearColor(bgColor, 1)
    s.renderer = renderer

    // 场景
    const scene = new THREE.Scene()
    s.scene = scene

    // 相机 - 正交投影
    resize()
    const aspect = canvas.width / (canvas.height || 1)
    const frustumSize = DEFAULT_RADIUS * 1.2
    s._frustumSize = frustumSize
    const camera = new THREE.OrthographicCamera(
      frustumSize * aspect / -2, frustumSize * aspect / 2,
      frustumSize / 2, frustumSize / -2,
      0.1, 500
    )
    s.camera = camera

    // 轨道四元数
    s.orbitQuat = this._makeOrbitQuat(Math.PI / 4, Math.atan(Math.sqrt(2)))
    this._updateCameraPosition()

    // 光照
    this._setupLights()

    // 手势识别
    s.touchHandler = new TouchHandler()

    // 事件绑定
    this._bindEvents(canvas)

    // 起渲染：按需重绘 + 1 Hz 兜底（见 invalidate 的注释）
    this.invalidate()
    this._startRenderSweep()

    // 加载晶体
    if (this._crystalId) {
      this._loadCrystal(this._crystalId)
    }

    // 监听尺寸变化
    this._resizeObserver = new ResizeObserver(() => resize())
    this._resizeObserver.observe(container)

    console.log('[viewer-canvas] 场景初始化完成')
  }

  /** 事件绑定 */
  _bindEvents(canvas) {
    // 触摸事件
    canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false })
    canvas.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false })
    canvas.addEventListener('touchend', (e) => this._onTouchEnd(e))

    // 鼠标事件
    canvas.addEventListener('mousedown', (e) => this._onMouseDown(e))
    canvas.addEventListener('mousemove', (e) => this._onMouseMove(e))
    canvas.addEventListener('mouseup', (e) => this._onMouseUp(e))
    canvas.addEventListener('wheel', (e) => this._onMouseWheel(e), { passive: false })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  _setupLights() {
    const s = this._state
    s.lights = {}
    if (this._lightConfig && this._lightConfig.length > 0) {
      this._applyLightConfig(this._lightConfig)
    }
  }

  _applyLightConfig(config) {
    const s = this._state
    if (!config || !s.scene) return
    if (!s.lights) s.lights = {}

    const newIds = new Set(config.map(l => l.id))
    for (const [id, light] of Object.entries(s.lights)) {
      if (!newIds.has(id) && light) {
        s.scene.remove(light)
        if (light.dispose) light.dispose()
        delete s.lights[id]
      }
    }

    for (const cfg of config) {
      const color = new THREE.Color(cfg.color || '#ffffff')
      let light = s.lights[cfg.id]

      if (cfg.type === 'ambient') {
        if (!light || !light.isAmbientLight) {
          if (light) { s.scene.remove(light); if (light.dispose) light.dispose() }
          light = new THREE.AmbientLight(color, cfg.intensity)
          s.scene.add(light)
          s.lights[cfg.id] = light
        } else {
          light.color.copy(color)
          light.intensity = cfg.intensity
        }
      } else {
        if (!light || !light.isDirectionalLight) {
          if (light) { s.scene.remove(light); if (light.dispose) light.dispose() }
          light = new THREE.DirectionalLight(color, cfg.intensity)
          light.position.set(cfg.posX || 0, cfg.posY || 0, cfg.posZ || 0)
          s.scene.add(light)
          s.lights[cfg.id] = light
        } else {
          light.color.copy(color)
          light.intensity = cfg.intensity
          light.position.set(cfg.posX || 0, cfg.posY || 0, cfg.posZ || 0)
        }
      }
    }
    this.invalidate()
  }

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
    this.invalidate()   // 相机是唯一会动的量，这里是绝大多数重绘的来源
  }

  // ==================== 渲染：按需重绘 ====================

  /**
   * 请求重绘（脏标记）。
   *
   * ★ 原先这里是一个**无条件 requestAnimationFrame 递归**：每帧渲染，渲染完立刻
   *   排下一帧，界面完全静止时也在满速重绘。后果有两层：
   *     · 真机上一直烧 GPU 与电量（页面放着不动也不例外）
   *     · 在**软件渲染**下（无头截图用的 SwiftShader、或没装驱动的机器）等于
   *       拿 CPU 当 GPU 用——实测把 CPU 打满，验证过程本身成了事故
   *   现在改为按需：谁改了画面谁调 invalidate()，多次调用合并到下一帧渲染一次。
   *
   *   调用点集中在 6 个"改画面"的方法里：_loadCrystal / _updateVisibility /
   *   _updateCameraPosition / _applyLightConfig / _applyFog / resize。
   *   相机运动的路径全部经过 _updateCameraPosition，故拖拽/滚轮/切视角均已覆盖。
   */
  invalidate() {
    const s = this._state
    if (!s.renderer || !s.scene || !s.camera) return
    if (s.animFrameId) return                    // 已排队，合并到同一帧
    s.animFrameId = requestAnimationFrame(() => {
      s.animFrameId = 0
      const st = this._state
      if (!st.renderer || !st.scene || !st.camera) return
      st.renderer.render(st.scene, st.camera)
    })
  }

  /**
   * 低频兜底重绘（1 Hz）。
   *
   * ★ 故意保留这个"保险"，而不是完全相信按需渲染：按需的前提是**每个改画面的地方
   *   都调了 invalidate()**。万一漏一处，表现是"画面停住不更新"——那比费 CPU
   *   更难发现、也更糟。每秒补一帧的代价可忽略（相比 60 帧是 60 倍降幅），
   *   换来的是"即使漏了一处也不会僵住"。
   */
  _startRenderSweep() {
    if (this._sweepId) return
    this._sweepId = setInterval(() => this.invalidate(), 1000)
  }

  // ==================== 晶体加载 ====================

  _loadCrystal(crystalId) {
    const s = this._state
    if (!s || s._rebuilding) return
    s._rebuilding = true
    this._loading = true

    // 更新 loading 状态
    if (this._container) {
      const mask = this._container.querySelector('.loading-mask')
      if (mask) mask.style.display = 'flex'
    }

    try {
      const crystalData = getCrystalData(crystalId)
      if (!crystalData) {
        console.error(`[viewer-canvas] 未找到晶体数据: ${crystalId}`)
        this._loading = false
        return
      }

      const isCrystalChange = s._loadedCrystalId !== crystalId
      s._loadedCrystalId = crystalId

      const savedCrystalQuat = s.crystalRoot
        ? { x: s.crystalRoot.quaternion.x, y: s.crystalRoot.quaternion.y,
            z: s.crystalRoot.quaternion.z, w: s.crystalRoot.quaternion.w }
        : null

      this._clearCrystalGroup()

      const options = {
        modelType: this._modelType,
        atomScale: this._atomScale,
        stickRadius: this._stickRadius,
        cellDisplayMode: this._cellDisplayMode,
        opacity: this._opacity,
        fractionalShift: this._fractionalShift,
        partialAtoms: this._partialAtoms,
        auxiliaryLineAboveAtoms: this._auxiliaryLineAboveAtoms
      }
      const { crystalRoot, groups, suggestedRadius, clipPlanes, useLocalClipping } = buildCrystalScene(crystalData, THREE, options)
      s.groups = groups
      s.crystalRoot = crystalRoot
      s.atomsGroup = groups.atoms

      if (isCrystalChange || !savedCrystalQuat) {
        s.crystalRoot.quaternion.set(0, 0, 0, 1)
      } else {
        s.crystalRoot.quaternion.set(savedCrystalQuat.x, savedCrystalQuat.y, savedCrystalQuat.z, savedCrystalQuat.w)
      }
      s.currentCrystalData = crystalData

      s.scene.add(crystalRoot)

      s.renderer.clippingPlanes = []
      s.renderer.localClippingEnabled = !!useLocalClipping

      if (useLocalClipping) {
        updateWorldClipPlanes(s.atomsGroup, s.crystalRoot, THREE)
      }

      this._updateVisibility()

      if (isCrystalChange) {
        this._resetViewParams(Math.PI / 4, Math.atan(Math.sqrt(2)), suggestedRadius || DEFAULT_RADIUS)
        if (s._frustumSize) {
          s._frustumSize = (suggestedRadius || DEFAULT_RADIUS) * 1.2
          const aspect = s.canvas.width / (s.canvas.height || 1)
          s.camera.left = s._frustumSize * aspect / -2
          s.camera.right = s._frustumSize * aspect / 2
          s.camera.top = s._frustumSize / 2
          s.camera.bottom = s._frustumSize / -2
          s.camera.updateProjectionMatrix()
        }
        this._updateCameraPosition()
      }

      s._cellBoundingRadius = (suggestedRadius || DEFAULT_RADIUS) * 0.414 / 1.3
      if (this._depthFog) {
        this._applyFog()
      }

      this._loading = false
      this._triggerEvent('loaded', { crystalId })
      console.log(`[viewer-canvas] 晶体加载完成: ${crystalId}`)
    } catch (err) {
      console.error(`[viewer-canvas] 加载晶体失败: ${crystalId}`, err)
      this._loading = false
    }
    s._rebuilding = false

    if (this._container) {
      const mask = this._container.querySelector('.loading-mask')
      if (mask) mask.style.display = 'none'
    }
    this.invalidate()
  }

  _clearCrystalGroup() {
    const s = this._state
    if (!s) return
    if (s.crystalRoot && s.scene) {
      clearScene(s.crystalRoot, THREE)
      s.scene.remove(s.crystalRoot)
      s.crystalRoot = null
    }
    if (s.groups && s.groups.crystalAxes && s.scene) {
      clearScene(s.groups.crystalAxes, THREE)
      s.scene.remove(s.groups.crystalAxes)
    }
    s.groups = null
  }

  // ==================== 图层可见性 ====================

  _updateVisibility() {
    const s = this._state
    if (!s || !s.groups) return

    const showLP = this._showLatticePoints

    if (s.groups.atoms) {
      s.groups.atoms.visible = showLP ? false : this._showAtoms
      if (!showLP && this._atomVisibility && Object.keys(this._atomVisibility).length > 0) {
        s.groups.atoms.traverse(child => {
          if (child.isMesh && child._element) {
            const elVis = this._atomVisibility[child._element]
            if (elVis !== undefined) child.visible = elVis
          }
        })
      }
    }
    if (s.groups.wireframe) s.groups.wireframe.visible = this._showWireframe
    if (s.groups.interstices) {
      if (s.groups.interstices.octahedral) s.groups.interstices.octahedral.visible = showLP ? false : this._showOctahedral
      if (s.groups.interstices.tetrahedral) s.groups.interstices.tetrahedral.visible = showLP ? false : this._showTetrahedral
    }
    if (s.groups.symmetry) s.groups.symmetry.visible = showLP ? false : this._showSymmetry
    if (s.groups.bonds) s.groups.bonds.visible = showLP ? false : this._showBonds
    if (s.groups.latticePoints) s.groups.latticePoints.visible = showLP
    if (s.groups.auxiliaryLines) {
      if (s.groups.auxiliaryLines.body) s.groups.auxiliaryLines.body.visible = this._showAuxiliaryBody
      if (s.groups.auxiliaryLines.face) s.groups.auxiliaryLines.face.visible = this._showAuxiliaryFace
    }
    if (s.groups.clipCaps) s.groups.clipCaps.visible = showLP ? false : this._showAtoms
    if (s.groups.crystalAxes) s.groups.crystalAxes.visible = this._showAxes

    if (s.groups.atomLabels) {
      const atomsVisible = showLP ? false : this._showAtoms
      s.groups.atomLabels.visible = showLP ? false : (atomsVisible && this._showAtomLabels)
      if (s.groups.atomLabels.visible) {
        s.groups.atomLabels.traverse(child => {
          if (child.isSprite && child._element) {
            const elVis = this._atomVisibility[child._element]
            if (elVis !== undefined) child.visible = elVis
          }
        })
      }
    }

    if (s.groups.hydrogenBonds) {
      s.groups.hydrogenBonds.visible = showLP ? false : this._showHydrogenBonds
    }
    this.invalidate()
  }

  /** 公共: 更新可见性（由外部调用） */
  updateVisibility() { this._updateVisibility() }

  /** 原子缩放变化 - 需重建 */
  onAtomScaleChanged() { if (this._crystalId) this._loadCrystal(this._crystalId) }
  /** 模型类型变化 */
  onModelChanged() { if (this._crystalId) this._loadCrystal(this._crystalId) }
  /** 晶胞模式变化 */
  onCellDisplayModeChanged() { if (this._crystalId) this._loadCrystal(this._crystalId) }
  /** 透明度/平移变化 */
  onAppearanceChanged() { if (this._crystalId) this._loadCrystal(this._crystalId) }

  /** 深度雾化 */
  onFogChanged(val) {
    const s = this._state
    if (!s || !s.scene) return
    if (val) this._applyFog()
    else s.scene.fog = null
  }

  _applyFog() {
    const s = this._state
    const cellR = s._cellBoundingRadius || 5
    // 雾在相机空间中：最近原子在 radius-cellR 处，最远在 radius+cellR 处
    // near 设在最近原子稍前（保持清晰），far 设在最远原子稍后（不完全消失）
    const fogNear = Math.max(s.radius - cellR * 1.2, 1)
    const fogFar = s.radius + cellR * 2.5
    // 雾颜色跟随用户自定义背景色（与渲染器背景保持一致）
    const bgColor = getVisualColor('bgColor') || '#eeeeee'
    const bgHex = parseInt(bgColor.replace('#', ''), 16)
    s.scene.fog = new THREE.Fog(bgHex, fogNear, fogFar)
    this.invalidate()
  }

  // ==================== 触摸交互 ====================

  _onTouchStart(e) {
    e.preventDefault()
    const s = this._state
    if (!s.touchHandler) return
    s._touchIds = new Set(Array.from(e.touches).map(t => t.identifier))
    const touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))
    s.touchHandler.handleStart(touches)
  }

  _onTouchMove(e) {
    e.preventDefault()
    const s = this._state
    if (!s.touchHandler || !s.camera) return

    const rect = s.canvas.getBoundingClientRect()
    const validTouches = Array.from(e.touches).filter(t => {
      const inBounds = t.clientX >= rect.left && t.clientX <= rect.right &&
                       t.clientY >= rect.top && t.clientY <= rect.bottom
      return inBounds && (!s._touchIds || s._touchIds.has(t.identifier))
    })
    if (validTouches.length === 0) return

    const touches = validTouches.map(t => ({ x: t.clientX, y: t.clientY }))
    const result = s.touchHandler.handleMove(touches)
    if (!result || !result.type) return

    this._handleGestureResult(result)
  }

  _onTouchEnd(e) {
    const s = this._state
    if (!s.touchHandler) return
    const gesture = s.touchHandler.handleEnd()

    if (gesture === 'tap' && s.scene && s.camera) {
      const touch = e.changedTouches[0]
      if (touch) this._hitTest({ x: touch.clientX, y: touch.clientY })
    } else if (gesture === 'doubleTap') {
      this.resetView()
      this._triggerEvent('resetview')
    }
  }

  _handleGestureResult(result) {
    const s = this._state
    switch (result.type) {
      case 'rotate': {
        const { deltaTheta, deltaPhi } = result.data
        if (!s.crystalRoot) return
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat).normalize()
        const qH = new THREE.Quaternion().setFromAxisAngle(up, deltaTheta)
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat).normalize()
        const qV = new THREE.Quaternion().setFromAxisAngle(right, deltaPhi)
        s.crystalRoot.quaternion.copy(qH.multiply(qV).multiply(s.crystalRoot.quaternion)).normalize()
        updateWorldClipPlanes(s.atomsGroup, s.crystalRoot, THREE)
        break
      }
      case 'zoom': {
        const ratio = result.data.ratio
        s._frustumSize /= ratio
        if (s._frustumSize < 0.1) s._frustumSize = 0.1
        s.panOffset.x /= ratio; s.panOffset.y /= ratio; s.panOffset.z /= ratio
        const aspect = s.canvas.width / (s.canvas.height || 1)
        s.camera.left = s._frustumSize * aspect / -2
        s.camera.right = s._frustumSize * aspect / 2
        s.camera.top = s._frustumSize / 2
        s.camera.bottom = s._frustumSize / -2
        s.camera.updateProjectionMatrix()
        this._updateCameraPosition()
        break
      }
      case 'pan': {
        const { deltaX, deltaY } = result.data
        const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat)
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat)
        s.panOffset.x += -camRight.x * deltaX + camUp.x * deltaY
        s.panOffset.y += -camRight.y * deltaX + camUp.y * deltaY
        s.panOffset.z += -camRight.z * deltaX + camUp.z * deltaY
        this._updateCameraPosition()
        break
      }
    }

    if (result.data.deltaAngle && Math.abs(result.data.deltaAngle) > 0.0001) {
      if (!s.crystalRoot) return
      const look = new THREE.Vector3(0, 0, 1).applyQuaternion(s.orbitQuat).normalize()
      const qRoll = new THREE.Quaternion().setFromAxisAngle(look, -result.data.deltaAngle)
      s.crystalRoot.quaternion.copy(qRoll.multiply(s.crystalRoot.quaternion)).normalize()
      updateWorldClipPlanes(s.atomsGroup, s.crystalRoot, THREE)
    }
    this._notifyViewChange()
  }

  // ==================== 鼠标交互 ====================

  _onMouseDown(e) {
    const s = this._state
    s._mouseState = { isDown: true, button: e.button || 0, lastX: e.clientX, lastY: e.clientY, _startX: e.clientX, _startY: e.clientY }
  }

  _onMouseMove(e) {
    const s = this._state
    const ms = s._mouseState
    if (!ms || !ms.isDown || !s.camera) return

    const dx = e.clientX - ms.lastX
    const dy = e.clientY - ms.lastY
    ms.lastX = e.clientX; ms.lastY = e.clientY

    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return

    const MOUSE_ROTATE_SENSITIVITY = 0.005
    const MOUSE_PAN_SENSITIVITY = 0.02

    if (ms.button === 0 && s.crystalRoot) {
      const deltaTheta = dx * MOUSE_ROTATE_SENSITIVITY
      const deltaPhi = dy * MOUSE_ROTATE_SENSITIVITY
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat).normalize()
      const qH = new THREE.Quaternion().setFromAxisAngle(up, deltaTheta)
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat).normalize()
      const qV = new THREE.Quaternion().setFromAxisAngle(right, deltaPhi)
      s.crystalRoot.quaternion.copy(qH.multiply(qV).multiply(s.crystalRoot.quaternion)).normalize()
      updateWorldClipPlanes(s.atomsGroup, s.crystalRoot, THREE)
    } else if (ms.button === 2) {
      // 右键拖动：平移（dy 屏幕向下为正，场景应跟随鼠标 → panY 取正）
      const panX = dx * MOUSE_PAN_SENSITIVITY
      const panY = dy * MOUSE_PAN_SENSITIVITY
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat)
      const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat)
      s.panOffset.x += -camRight.x * panX + camUp.x * panY
      s.panOffset.y += -camRight.y * panX + camUp.y * panY
      s.panOffset.z += -camRight.z * panX + camUp.z * panY
      this._updateCameraPosition()
    }
    this._notifyViewChange()
  }

  _onMouseUp(e) {
    const s = this._state
    const ms = s._mouseState
    if (!ms) return

    const dx = Math.abs(e.clientX - (ms._startX || e.clientX))
    const dy = Math.abs(e.clientY - (ms._startY || e.clientY))
    if (dx < 5 && dy < 5 && ms.button === 0 && s.scene && s.camera) {
      this._hitTest({ x: e.clientX, y: e.clientY })
    }
    ms.isDown = false
  }

  _onMouseWheel(e) {
    e.preventDefault()
    const s = this._state
    if (!s.camera) return

    const delta = e.deltaY
    const zoomFactor = delta > 0 ? 1.1 : 0.9

    if (s._frustumSize) {
      s._frustumSize *= zoomFactor
      if (s._frustumSize < 0.1) s._frustumSize = 0.1
      s.panOffset.x *= zoomFactor; s.panOffset.y *= zoomFactor; s.panOffset.z *= zoomFactor
      const aspect = s.canvas.width / (s.canvas.height || 1)
      s.camera.left = s._frustumSize * aspect / -2
      s.camera.right = s._frustumSize * aspect / 2
      s.camera.top = s._frustumSize / 2
      s.camera.bottom = s._frustumSize / -2
      s.camera.updateProjectionMatrix()
    }
    this._updateCameraPosition()
    this._notifyViewChange()
  }

  // ==================== 射线检测 ====================

  _hitTest(screenPos) {
    const s = this._state
    const canvas = s.canvas
    const rect = canvas.getBoundingClientRect()

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    mouse.x = ((screenPos.x - rect.left) / rect.width) * 2 - 1
    mouse.y = -((screenPos.y - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(mouse, s.camera)

    const targets = []
    if (s.groups && s.groups.atoms && s.groups.atoms.visible) {
      s.groups.atoms.traverse(child => {
        if (child.isMesh && child._element) targets.push(child)
      })
    }
    if (s.groups && s.groups.polyhedra && s.groups.polyhedra.visible) {
      s.groups.polyhedra.traverse(child => {
        if (child.isMesh && child._element) targets.push(child)
      })
    }
    if (s.groups && s.groups.interstices) {
      for (const typeGroup of Object.values(s.groups.interstices)) {
        if (typeGroup && typeGroup.visible) {
          typeGroup.traverse(child => {
            if (child.isSprite && child._voidType) targets.push(child)
          })
        }
      }
    }
    if (s.groups && s.groups.latticePoints && s.groups.latticePoints.visible) {
      s.groups.latticePoints.traverse(child => {
        if (child.isMesh && child._element === '_latticePoint') targets.push(child)
      })
    }

    const intersects = raycaster.intersectObjects(targets)
    if (intersects.length > 0) {
      const obj = intersects[0].object
      const position = obj._position || null

      if (obj._element === '_latticePoint') {
        this._triggerEvent('latticePointTap', {
          position, latticeType: obj._latticeType || '',
          latticeTypeName: obj._latticeTypeName || ''
        })
      } else if (obj._element) {
        this._triggerEvent('atomTap', { element: obj._element, position })
      } else if (obj._voidType) {
        this._triggerEvent('voidTap', { type: obj._voidType, position: obj._position || null })
      }
    }
  }

  // ==================== 视角方法 ====================

  _makeOrbitQuat(theta, phi) {
    const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), theta)
    const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), phi - Math.PI / 2)
    return qY.clone().multiply(qX)
  }

  _getDefaultPanOffset(radius) {
    const r = radius || DEFAULT_RADIUS
    return { x: 0, y: -r * DEFAULT_PAN_Y_FACTOR, z: 0 }
  }

  _resetViewParams(theta, phi, radius) {
    const s = this._state
    s._theta = theta; s._phi = phi
    s.orbitQuat = this._makeOrbitQuat(theta, phi)
    s.radius = radius
    s.target = { x: 0, y: 0, z: 0 }
    s.panOffset = this._getDefaultPanOffset(radius)
  }

  resetView() {
    const s = this._state
    this._resetViewParams(Math.PI / 4, Math.atan(Math.sqrt(2)), DEFAULT_RADIUS)
    if (s._frustumSize) s._frustumSize = DEFAULT_RADIUS * 1.2
    if (s.crystalRoot) s.crystalRoot.quaternion.set(0, 0, 0, 1)
    this._updateCameraPosition()
    this._notifyViewChange()
  }

  setView(direction) {
    const s = this._state
    let theta, phi
    switch (direction) {
      case 'top': theta = 0; phi = 0.05; break
      case 'front': theta = 0; phi = Math.PI / 2; break
      case 'side': theta = Math.PI / 2; phi = Math.PI / 2; break
      case 'iso': default: theta = Math.PI / 4; phi = Math.atan(Math.sqrt(2)); break
    }
    this._resetViewParams(theta, phi, DEFAULT_RADIUS)
    if (s.crystalRoot) s.crystalRoot.quaternion.set(0, 0, 0, 1)
    this._updateCameraPosition()
    this._notifyViewChange()
  }

  getViewState() {
    const s = this._state
    if (!s.camera) return null
    return {
      theta: s._theta, phi: s._phi, radius: s.radius,
      panOffset: { x: s.panOffset.x, y: s.panOffset.y, z: s.panOffset.z },
      crystalQuat: s.crystalRoot
        ? { x: s.crystalRoot.quaternion.x, y: s.crystalRoot.quaternion.y, z: s.crystalRoot.quaternion.z, w: s.crystalRoot.quaternion.w }
        : { x: 0, y: 0, z: 0, w: 1 },
      frustumSize: s._frustumSize || null,
      target: { x: s.target.x, y: s.target.y, z: s.target.z }
    }
  }

  /**
   * 读取当前**属性状态**（只读快照）。
   *
   * ★ 为什么需要它：智能体侧的 facade 必须读视图的**真实**状态，而不是自己维护
   *   一份副本——因为页面上的图层控件也在改同一批属性，副本会漂移。
   *   `getViewState()` 给的是视角/相机状态，不含图层与外观，二者互补。
   *
   * 返回的是浅拷贝（atomVisibility 再拷一层），调用方改它不会影响视图。
   */
  getProps() {
    return {
      crystalId: this._crystalId,
      showAtoms: this._showAtoms,
      showWireframe: this._showWireframe,
      showInterstices: this._showInterstices,
      showOctahedral: this._showOctahedral,
      showTetrahedral: this._showTetrahedral,
      showSymmetry: this._showSymmetry,
      showBonds: this._showBonds,
      showAxes: this._showAxes,
      showAuxiliaryBody: this._showAuxiliaryBody,
      showAuxiliaryFace: this._showAuxiliaryFace,
      showAtomLabels: this._showAtomLabels,
      showHydrogenBonds: this._showHydrogenBonds,
      showLatticePoints: this._showLatticePoints,
      atomVisibility: Object.assign({}, this._atomVisibility),
      atomScale: this._atomScale,
      stickRadius: this._stickRadius,
      cellDisplayMode: this._cellDisplayMode,
      opacity: this._opacity,
    }
  }

  applyViewState(state) {
    const s = this._state
    if (!state || !s.camera) return false

    s._suppressViewEvent = true

    if (state.theta != null) s._theta = state.theta
    if (state.phi != null) s._phi = state.phi
    if (state.radius != null) s.radius = state.radius
    if (state.panOffset != null) s.panOffset = { x: state.panOffset.x, y: state.panOffset.y, z: state.panOffset.z }
    if (state.target != null) s.target = { x: state.target.x, y: state.target.y, z: state.target.z }

    if (state.theta != null && state.phi != null) {
      s.orbitQuat = this._makeOrbitQuat(state.theta, state.phi)
    }

    if (s.crystalRoot && state.crystalQuat) {
      s.crystalRoot.quaternion.set(state.crystalQuat.x, state.crystalQuat.y, state.crystalQuat.z, state.crystalQuat.w)
      updateWorldClipPlanes(s.atomsGroup, s.crystalRoot, THREE)
    }

    if (state.frustumSize != null && s._frustumSize !== undefined) {
      s._frustumSize = state.frustumSize
      const aspect = s.canvas.width / (s.canvas.height || 1)
      s.camera.left = s._frustumSize * aspect / -2
      s.camera.right = s._frustumSize * aspect / 2
      s.camera.top = s._frustumSize / 2
      s.camera.bottom = s._frustumSize / -2
      s.camera.updateProjectionMatrix()
    }

    this._updateCameraPosition()
    s._suppressViewEvent = false
    return true
  }

  _notifyViewChange() {
    const s = this._state
    if (s._suppressViewEvent) return
    const state = this.getViewState()
    if (state) this._triggerEvent('viewstatechange', state)
  }

  /** 调整尺寸 */
  resize() {
    // ResizeObserver handles this
  }

  // ==================== 事件发射 ====================

  _triggerEvent(name, detail = {}) {
    const handler = this._events[name]
    if (handler) handler({ detail })
    // 同时触发 DOM 自定义事件
    if (this._container) {
      this._container.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }))
    }
  }

  // ==================== 销毁 ====================

  _destroy() {
    if (this._sweepId) { clearInterval(this._sweepId); this._sweepId = 0 }
    const s = this._state
    if (s.animFrameId) {
      cancelAnimationFrame(s.animFrameId)
      s.animFrameId = 0
    }
    this._clearCrystalGroup()
    if (s.scene) clearScene(s.scene, THREE)
    if (s.renderer) s.renderer.dispose()
    if (this._resizeObserver) this._resizeObserver.disconnect()
    s.renderer = null; s.scene = null; s.camera = null; s.canvas = null
    s.groups = null; s.touchHandler = null
    console.log('[viewer-canvas] 资源已释放')
  }
}
