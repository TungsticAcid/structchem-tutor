/**
 * 3D查看器画布组件 (H5)
 * 封装 Three.js 场景初始化、渲染循环、触摸/鼠标交互和晶体数据加载
 * 从小程序版转换，替换 createScopedThreejs 为标准 Three.js
 */
import * as THREE from 'three'
// ★ 环境反射用。three 自带这个程序化生成的"室内环境"（一块带几盏灯的方盒），
//   无需外部 HDR 图片、不增网络请求、无授权问题。
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
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

/**
 * 取景留白系数：可视**竖直**高度 = 2 · 拟合半径 · VIEW_FIT_MARGIN / min(1, 宽高比)
 *
 * ★ 为什么不能只写「半径 × 常数」（原先正是写死的 `× 1.2`）：
 *   正交相机的 `frustumSize` 是**竖直**方向的可见高度（`top/bottom = ±frustumSize/2`），
 *   水平方向是 `frustumSize × aspect`。于是——
 *     · 宽屏（aspect > 1）：水平比竖直宽松，**竖直是紧的那一边**，常数写法看不出问题；
 *     · 窄屏（aspect < 1，手机竖屏）：水平才是紧的那一边，模型会被**左右切掉**。
 *   除以 `min(1, aspect)` 之后两边都装得下，且总是让"紧的那一边"正好贴上留白线。
 *
 * ★ 系数取小了会顶到画布边缘。实测（NaCl，1414×807，aspect 1.752；
 *   量的是"高饱和像素的包围盒占画布的比例"）：
 *     · 0.60（＝原来的 `× 1.2`）：模型高占画布 **0.408**、宽占 **0.205** —— 明显偏小；
 *     · 0.45：模型高占 **0.529**、宽占 **0.273**，包围盒 y 97..523
 *       （顶栏在 40 以内、底部说明面板从约 540 开始，两边都还留得住）。
 *   再小就会顶到顶栏或底部说明面板（画布是整屏的，面板是**盖在上面**的，
 *   模型不会因此被裁，但会被面板挡掉 —— 那比偏小更糟）。
 */
const VIEW_FIT_MARGIN = 0.45

/** 需要重建场景的属性（几何/模型变化） */
const REBUILD_PROPS = ['modelType', 'atomScale', 'stickRadius', 'cellDisplayMode', 'opacity', 'fractionalShift', 'partialAtoms', 'auxiliaryLineAboveAtoms']
/** 仅需更新可见性的属性（无需重建场景） */
const VISIBILITY_PROPS = ['showAtoms', 'showWireframe', 'showInterstices', 'showOctahedral', 'showTetrahedral', 'showSymmetry', 'showBonds', 'showAxes', 'showAuxiliaryBody', 'showAuxiliaryFace', 'atomVisibility', 'showAtomLabels', 'showHydrogenBonds', 'showLatticePoints']

/**
 * 仅需改材质的高亮属性（**不重建场景**）。
 *
 * ★ 为什么单列一类：高亮只是把命中元素的原子材质 `emissive` 点亮，几何完全不变。
 *   若归入 REBUILD_PROPS，每次高亮都会重建整个晶体（32×32 球面几何 + 全部原子），
 *   在移动端是明显卡顿；而诊断动作恰恰要求快——学生正等着看画面变化。
 */
const HIGHLIGHT_PROPS = ['highlightElements']

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
    /** 需要高亮的元素符号数组（null = 不高亮）。见 HIGHLIGHT_PROPS 的说明 */
    this._highlightElements = props.highlightElements || null
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
    let needsHighlight = false

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
      else if (HIGHLIGHT_PROPS.includes(k)) needsHighlight = true
    }

    // 场景未就绪时（mount 前）不做增量处理，_loadCrystal 会读取最新属性
    if (!this._state.scene) return
    if (needsLight) this._applyLightConfig(this._lightConfig)
    if (needsRebuild) {
      this._loadCrystal(this._crystalId)
    } else if (needsVisibility) {
      this._updateVisibility()
    } else if (needsHighlight) {
      this._applyHighlight(this._highlightElements)
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

  /**
   * 渲染像素比（**加上限**）。
   *
   * ★ 为什么要加上限：CPK 空间填充模型的球接近相切、几乎铺满画面，
   *   填充率本来就很高。再按设备 DPR 无上限地渲染，等于每帧要填 `DPR²` 倍的像素——
   *   DPR=2 是 4 倍、DPR=3 是 9 倍。实测对比页的**下方窗口**（默认 CPK）
   *   明显比上方（球棍模型、球缩小到 0.3 倍）卡，根源就在这里。
   *
   * ★ 1.5 是清晰度与性能的折中：球体边缘仍平滑（比 1.0 明显好），
   *   而填充量降到 DPR=2 时的 56%。若要进一步压，可降到 1.25。
   */
  _renderDpr() {
    const raw = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    return Math.min(raw, 1.5)
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
      // ★ touch-action:none —— 让浏览器**完全不处理**画布上的默认触摸手势（滚动/下拉刷新/
      //   双击缩放），全部交给 JS 的 touchmove（旋转/平移）。缺了它，画布继承 body 的
      //   `touch-action: manipulation`，浏览器会把"从上往下拖"判成下拉刷新（pull-to-refresh），
      //   即使 touchmove 里 preventDefault 也拦不住（手势已被浏览器接管）。
      canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;'
      container.appendChild(canvas)
    }
    this.canvas = canvas

    const s = this._state
    s.canvas = canvas

    // 调整 canvas 尺寸
    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = this._renderDpr()
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
    renderer.setPixelRatio(this._renderDpr())
    const bgColor = getVisualColor('bgColor')
    renderer.setClearColor(bgColor, 1)
    s.renderer = renderer

    // 场景
    const scene = new THREE.Scene()
    s.scene = scene

    // ★ 环境反射 —— 原子材质是 PBR（MeshStandardMaterial），金属成像依赖它。
    //   必须在场景就绪后、几何构建前建立（材质创建时才会关联到 scene.environment）。
    this._setupEnvironment(s)

    // 相机 - 正交投影
    resize()
    const aspect = canvas.width / (canvas.height || 1)
    const frustumSize = 2 * DEFAULT_RADIUS * VIEW_FIT_MARGIN / Math.min(1, aspect)
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

    // 按下仍绑在画布上（要的是"从画布开始拖"）
    canvas.addEventListener('mousedown', (e) => this._onMouseDown(e))

    // ★ 移动与抬起绑在 **window**，不是 canvas。
    //   拖出画布范围再松开时，canvas 收不到 mouseup，`_mouseState.isDown` 会一直停在 true
    //   —— 此后**不按任何键移动鼠标，画面也照样跟着走**（右键平移尤其明显：右键拖出画布
    //   松开后手已经松开、视图仍随鼠标走，看起来像"触发了某种手势"）。实测复现过：
    //   在画布外 mouseup 之后再空移一次，panOffset 仍在变。
    //   ★ 绑 window 的代价是**必须自己解绑**：canvas 上的监听随元素一起消失，
    //     window 上的不会——不解绑就会每进出一次 viewer 多留一份（见 _destroy）。
    this._onMouseMoveWin = (e) => this._onMouseMove(e)
    this._onMouseUpWin = (e) => this._onMouseUp(e)
    // 失焦（Alt+Tab、系统菜单抢焦点等）同样收不到 mouseup，一并复位，避免"卡住"再现
    this._onBlurWin = () => {
      const ms = this._state._mouseState
      if (ms) ms.isDown = false
    }
    window.addEventListener('mousemove', this._onMouseMoveWin)
    window.addEventListener('mouseup', this._onMouseUpWin)
    window.addEventListener('blur', this._onBlurWin)

    canvas.addEventListener('wheel', (e) => this._onMouseWheel(e), { passive: false })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  /**
   * 建立**环境反射**（金属质感的关键）。
   *
   * ★ 为什么必须做：原子材质已改为 MeshStandardMaterial（PBR）。
   *   **金属的漫反射为 0，成像全靠反射环境**——没有环境贴图时，metalness 越高
   *   球体越黑，看起来像"渲染坏了"而不是"不够金属"。这是 PBR 的物理性质，
   *   不是调参能解决的。
   *
   * ★ 为什么用 RoomEnvironment 而不是 HDR 文件：three 自带，程序化生成，
   *   无外部资源、无网络请求、无授权问题。反射内容是抽象的室内光斑——
   *   对"让球看起来是金属"这个目的足够，且比纯渐变自然。
   *
   * ★ 失败不致命：环境贴图依赖 PMREM（预滤波辐照度贴图）能力，极老的设备可能
   *   不支持。此处降级为"保持原样 + 一次警告"，而不是让晶体整体渲染不出来。
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
      console.warn('[viewer-canvas] 环境贴图生成失败，金属质感将退化为普通高光：', e)
    }
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
   *   都调了 invalidate()**。每秒补一帧的代价可忽略（相比 60 帧是 60 倍降幅），
   *   换来的是"即使漏了一处也不会僵住"。
   *
   *   ⚠️ **但别把兜底当成"漏了也安全"**——这是实测踩到的：旋转路径曾漏掉
   *   `invalidate()`（它不动相机，是唯一不经过 `_updateCameraPosition` 的路径），
   *   兜底让它表现为"**一顿一顿**"而**不是**"停住"。也就是说，兜底把"缺陷"降级
   *   成了"性能问题"；而"卡"这个现象几乎不会让人联想到"少了一次重绘"，
   *   于是它比"完全不动"**更难查**（那次从触摸的强制布局一路查到渲染触发）。
   *   结论：新增任何"改画面"的路径，仍必须自己调 `invalidate()`——兜底只保不死，不保正确。
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
          // ★ 与初始化那处**同一个式子**（口径见 VIEW_FIT_MARGIN 的说明）。
          //   两处曾各自写死 `× 1.2`：一处改了另一处没改，就会出现
          //   "首屏正常、一换晶体就变样"，而且看起来像是晶体数据的问题。
          const fr = suggestedRadius || DEFAULT_RADIUS
          const aspect = s.canvas.width / (s.canvas.height || 1)
          s._frustumSize = 2 * fr * VIEW_FIT_MARGIN / Math.min(1, aspect)
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

  /**
   * 应用元素高亮（**只改材质，不重建场景**）。
   *
   * ★ 为什么改 `emissive` 而不是改 `color`：元素色是教学信息（学生靠颜色认元素），
   *   改掉它就丢了这个信息。`emissive` 是在原色之上"点亮"，既突出又不改变身份。
   *   `scene-builder` 的 `buildAtoms` 建材质时已按 `highlightElements` 设过初始值，
   *   这里负责**运行期切换**（供诊断动作动态改，无需重建）。
   *
   * ★ 材质是**按元素共享**的（每个元素一份 interior/boundary），所以改一次就影响
   *   该元素的全部原子——这正是"按元素高亮"想要的效果，也意味着这个循环很便宜
   *   （元素种类数，而非原子数）。
   *
   * @param {string[]|null} elements 要高亮的元素符号；传 null/[] 取消全部高亮
   */
  _applyHighlight(elements) {
    const s = this._state
    const atomsGroup = s.groups && s.groups.atoms
    if (!atomsGroup) return
    const on = new Set(elements || [])
    const touched = new Set()
    for (const mesh of atomsGroup.children) {
      const el = mesh._element
      if (!el || touched.has(el)) continue          // 每个元素只处理一次（材质共享）
      touched.add(el)
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        if (!m || !m.color) continue
        if (on.has(el)) {
          // 用元素自身颜色作为发光色——比统一白光自然，也保留了元素身份
          if (!m.emissive) m.emissive = new THREE.Color(0x000000)
          m.emissive.copy(m.color)
          m.emissiveIntensity = 0.45
        } else if (m.emissive) {
          m.emissive.setHex(0x000000)
          m.emissiveIntensity = 0
        }
        m.needsUpdate = true
      }
    }
    this.invalidate()
  }

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
    // ★ 兜底值要与 DEFAULT_VISUAL_COLORS.bgColor 一致（现为白）——
    //   不一致时"取不到配置"的机器上会出现一层浅灰雾，看起来像渲染发白。
    const bgColor = getVisualColor('bgColor') || '#ffffff'
    const bgHex = parseInt(bgColor.replace('#', ''), 16)
    s.scene.fog = new THREE.Fog(bgHex, fogNear, fogFar)
    this.invalidate()
  }

  // ==================== 触摸交互 ====================

  _onTouchStart(e) {
    e.preventDefault()
    const s = this._state
    if (!s.touchHandler) return
    // ★ 在这里缓存 canvas 的屏幕矩形（一次手势取一次）。
    //
    //   原先 `_onTouchMove` 里**每帧**调 `getBoundingClientRect()` —— 那是
    //   **强制同步布局**（浏览器必须先算完布局才能返回尺寸），而触摸拖拽每秒
    //   触发几十次。症状正是"哪边拖哪边卡、单页拖也卡"：只有被拖的那一侧走这条路径；
    //   而**鼠标拖从来不卡**，因为 `_onMouseMove` 里没有这个调用（两套事件处理器）。
    //
    //   一次触摸手势期间 canvas 不会移动，故取一次即可；下次手势会重新取，
    //   所以横竖屏切换之类的布局变化不会用到陈旧值。
    s._canvasRect = s.canvas.getBoundingClientRect()
    s._touchIds = new Set(Array.from(e.touches).map(t => t.identifier))
    const touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))
    s.touchHandler.handleStart(touches)
  }

  _onTouchMove(e) {
    e.preventDefault()
    const s = this._state
    if (!s.touchHandler || !s.camera) return

    // ★ 用缓存值，不要每帧调 getBoundingClientRect（见 _onTouchStart 的说明）。
    //   兜底那一次是为了"手势起点没经过 _onTouchStart"的边缘情形（如程序化派发事件）。
    const rect = s._canvasRect || (s._canvasRect = s.canvas.getBoundingClientRect())
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
        // ★ 与 `_onMouseMove` 同源的问题：这条路径**不动相机**，必须自己触发重绘，
        //   否则画面只能靠 1 Hz 兜底更新——手感就是"旋转一顿一顿"。
        this.invalidate()
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
    // 抑制按下之后的**浏览器默认动作**（原生拖拽、文字选择的起手）——拖拽时视野两侧的
    // 面板上有大量文字，不抑制的话拖动会顺带拉起一片选择高亮。
    // ★ 它管不到浏览器/扩展层面的**鼠标手势**（那是应用拦不到的），
    //   只能保证"应用自己这一侧不再产生额外动作"。
    e.preventDefault()
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
    // ★ **旋转是唯一"不动相机"的画面变更路径**：它改的是 `crystalRoot.quaternion`，
    //   因此不经过 `_updateCameraPosition`，也就没人调 `invalidate()`。
    //   漏掉它的后果**不是**"画面不动"——1 Hz 兜底重绘会补上一帧——而是
    //   **每秒只更新一帧**，表现为"旋转一顿一顿"。那个兜底"保险"恰好把它
    //   掩盖成"卡"而不是"停"，所以从现象上很难联想到是"漏了一次 invalidate"。
    this.invalidate()
    this._notifyViewChange()
  }

  _onMouseUp(e) {
    const s = this._state
    const ms = s._mouseState
    if (!ms) return

    const dx = Math.abs(e.clientX - (ms._startX || e.clientX))
    const dy = Math.abs(e.clientY - (ms._startY || e.clientY))
    // ★ 抬起现在绑在 window 上（见 _bindEvents），所以"点一下看原子"这个动作要自己判定
    //   落点是否还在画布内：否则从画布上按下、在下方控制面板上松开也会去射线检测，
    //   在画布之外弹出原子信息卡。
    const r = s.canvas ? s.canvas.getBoundingClientRect() : null
    const inside = r && e.clientX >= r.left && e.clientX <= r.right
      && e.clientY >= r.top && e.clientY <= r.bottom
    if (inside && dx < 5 && dy < 5 && ms.button === 0 && s.scene && s.camera) {
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
    // ★ 环境贴图是 RenderTarget（占显存），必须显式释放。
    //   它与 renderer 同生命周期，但 dispose() 不会连带释放它。
    if (s.envRT) { s.envRT.dispose(); s.envRT = null }
    if (s.renderer) s.renderer.dispose()
    if (this._resizeObserver) this._resizeObserver.disconnect()
    // ★ window 上的监听必须显式摘掉：它们不随 canvas 元素一起消失，漏摘就会每进出
    //   一次 viewer 多留一份——旧实例还会继续响应鼠标移动（表现为"拖一下动了两个视图"）。
    if (this._onMouseMoveWin) window.removeEventListener('mousemove', this._onMouseMoveWin)
    if (this._onMouseUpWin) window.removeEventListener('mouseup', this._onMouseUpWin)
    if (this._onBlurWin) window.removeEventListener('blur', this._onBlurWin)
    this._onMouseMoveWin = this._onMouseUpWin = this._onBlurWin = null
    s.renderer = null; s.scene = null; s.camera = null; s.canvas = null
    s.groups = null; s.touchHandler = null
    console.log('[viewer-canvas] 资源已释放')
  }
}
