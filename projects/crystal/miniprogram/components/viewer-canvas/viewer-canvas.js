/**
 * 3D查看器画布组件
 * 封装 Three.js 场景初始化、渲染循环、触摸交互和晶体数据加载
 */
import { createScopedThreejs } from 'threejs-miniprogram'
import { buildCrystalScene, clearScene, updateWorldClipPlanes } from '../../lib/scene-builder'
import { TouchHandler } from '../../lib/touch-handler'
import { getCrystalData } from '../../lib/crystal-loader'
import { getVisualColor } from '../../data/settings.js'

/** 默认相机距离 */
const DEFAULT_RADIUS = 35.0
/** 最小缩放距离（防止穿模） */
const MIN_RADIUS = 0.5
/** 默认平移偏移 Y 轴因子（晶体偏上，避开底部控制面板） */
const DEFAULT_PAN_Y_FACTOR = 0.12

Component({
  properties: {
    /** Canvas DOM ID，多实例时避免ID冲突 */
    canvasId: {
      type: String,
      value: 'crystalCanvas'
    },
    /** 当前加载的晶体ID */
    crystalId: {
      type: String,
      value: '',
      observer: 'onCrystalIdChanged'
    },
    /** 原子图层可见 */
    showAtoms: { type: Boolean, value: true, observer: 'updateVisibility' },
    /** 线框图可见 */
    showWireframe: { type: Boolean, value: true, observer: 'updateVisibility' },
    /** 空隙图层可见 */
    showInterstices: { type: Boolean, value: false, observer: 'updateVisibility' },
    /** 八面体空隙可见 */
    showOctahedral: { type: Boolean, value: false, observer: 'updateVisibility' },
    /** 四面体空隙可见 */
    showTetrahedral: { type: Boolean, value: false, observer: 'updateVisibility' },
    /** 对称元素图层可见 */
    showSymmetry: { type: Boolean, value: false, observer: 'updateVisibility' },
    /** 化学键图层可见 */
    showBonds: { type: Boolean, value: false, observer: 'updateVisibility' },
    /** 坐标轴可见 */
    showAxes: { type: Boolean, value: true, observer: 'updateVisibility' },
    /** 体对角线可见 */
    showAuxiliaryBody: { type: Boolean, value: false, observer: 'updateVisibility' },
    /** 面对角线可见 */
    showAuxiliaryFace: { type: Boolean, value: false, observer: 'updateVisibility' },
    /** 辅助线是否显示在原子图层上方 */
    auxiliaryLineAboveAtoms: { type: Boolean, value: false, observer: 'onModelChanged' },
    /** 原子缩放系数 */
    atomScale: { type: Number, value: 1.0, observer: 'onAtomScaleChanged' },
    /** 模型类型: cpk | ballStick */
    modelType: { type: String, value: 'ballStick', observer: 'onModelChanged' },
    /** 球棍模型中棍的粗细 */
    stickRadius: { type: Number, value: 0.08, observer: 'onModelChanged' },
    /** 晶胞类型模式: conventional | primitive */
    cellDisplayMode: { type: String, value: 'conventional', observer: 'onCellDisplayModeChanged' },
    /** 整体透明度 */
    opacity: { type: Number, value: 0.0, observer: 'onAppearanceChanged' },
    /** 远处深度雾化开关 */
    depthFog: { type: Boolean, value: false, observer: 'onFogChanged' },
    /** 原子分数平移向量 [dx, dy, dz] */
    fractionalShift: { type: Array, value: [0, 0, 0], observer: 'onAppearanceChanged' },
    /** 完整晶胞模式下边界原子是否部分显示 */
    partialAtoms: { type: Boolean, value: false, observer: 'onModelChanged' },
    /** 投影模式: 固定为正交投影 */
    projection: { type: String, value: 'orthographic' },
    /** 灯光配置数组 */
    lightConfig: { type: Array, value: [], observer: 'onLightConfigChanged' },
    /** 各元素可见性: { 'Na': true, 'Cl': false, ... } */
    atomVisibility: { type: Object, value: {}, observer: 'updateVisibility' },
    /** 原子名称标签显示 */
    showAtomLabels: { type: Boolean, value: false, observer: 'updateVisibility' },
    /** 氢键显示 */
    showHydrogenBonds: { type: Boolean, value: true, observer: 'updateVisibility' },
    /** 点阵型式图层 */
    showLatticePoints: { type: Boolean, value: false, observer: 'updateVisibility' }
  },

  data: {
    loading: false
  },

  lifetimes: {
    /** 组件挂载时初始化内部状态和场景 */
    attached() {
      // 初始化内部状态（非响应式，直接挂在实例上）
      this._state = {
        THREE: null,
        canvas: null,
        renderer: null,
        scene: null,
        camera: null,
        groups: null,
        crystalRoot: null,
        currentCrystalData: null,
        touchHandler: null,
        animFrameId: 0,
        orbitQuat: null,  // 四元数轨道旋转，THREE可用后初始化
        radius: DEFAULT_RADIUS,
        target: { x: 0, y: 0, z: 0 },       // 旋转轨道中心（始终在晶胞中心）
        panOffset: { x: 0, y: -DEFAULT_RADIUS * DEFAULT_PAN_Y_FACTOR, z: 0 },
        lights: {},
        // 轨道角度追踪（避免四元数组合产生的万向节/roll问题）
        _theta: Math.PI / 4,   // 方位角（绕世界Y轴）
        _phi: Math.atan(Math.sqrt(2)),      // 极角（距Y轴），等轴测视图
        _suppressViewEvent: false  // 抑制 applyViewState 期间的事件发射，防止循环
      }
      this._initScene()
    },
    /** 组件卸载 */
    detached() {
      this._destroy()
    }
  },

  methods: {
    // ==================== 场景初始化 ====================

    /** 初始化Three.js场景 */
    _initScene() {
      const query = this.createSelectorQuery()
      query.select('#' + (this.properties.canvasId || 'crystalCanvas'))
        .node()
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            console.error('[viewer-canvas] 获取 canvas 节点失败')
            return
          }

          const canvas = res[0].node
          const THREE = createScopedThreejs(canvas)
          this._state.THREE = THREE
          this._state.canvas = canvas

          // 渲染器
          const renderer = new THREE.WebGLRenderer()
          renderer.setPixelRatio(wx.getSystemInfoSync().pixelRatio || 2)
          renderer.setSize(canvas.width, canvas.height)
          const bgColor = getVisualColor('bgColor')
          renderer.setClearColor(bgColor, 1)
          this._state.renderer = renderer

          // 场景
          const scene = new THREE.Scene()
          this._state.scene = scene

          // 相机 — 始终使用正交投影
          const aspect = canvas.width / (canvas.height || 1)
          const frustumSize = DEFAULT_RADIUS * 1.2
          const camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2, frustumSize * aspect / 2,
            frustumSize / 2, frustumSize / -2,
            0.1, 500
          )
          this._state._frustumSize = frustumSize
          this._state.camera = camera

          // 用 Y→X 顺序构建干净的四元数（避免 setFromUnitVectors 引入 roll 分量）
          // θ增加=绕Y逆时针（从上往下看），φ增加=相机下移
          this._state.orbitQuat = this._makeOrbitQuat(Math.PI / 4, Math.atan(Math.sqrt(2)))
          this._updateCameraPosition()

          // 光照
          this._setupLights(THREE, scene)

          // 手势识别器
          this._state.touchHandler = new TouchHandler()

          // 开始渲染循环
          this._animate()

          // 如果有预设晶体ID，加载
          if (this.properties.crystalId) {
            this._loadCrystal(this.properties.crystalId)
          }

          console.log('[viewer-canvas] 场景初始化完成')
        })
    },

    /** 设置默认灯光（初始化场景时调用） */
    _setupLights(THREE, scene) {
      this._state.lights = {}
      const defaultConfig = this.properties.lightConfig
      if (defaultConfig && defaultConfig.length > 0) {
        this._applyLightConfig(defaultConfig, THREE, scene)
      }
    },

    /** 根据配置数组应用灯光（增量更新，不重建场景） */
    _applyLightConfig(config, THREE, scene) {
      if (!config || !THREE) return
      const s = this._state
      if (!s.lights) s.lights = {}

      // 收集新配置中的灯光 id
      const newIds = new Set(config.map(l => l.id))

      // 移除不在新配置中的灯光
      for (const [id, light] of Object.entries(s.lights)) {
        if (!newIds.has(id) && light) {
          scene.remove(light)
          if (light.dispose) light.dispose()
          delete s.lights[id]
        }
      }

      // 更新或创建灯光
      for (const cfg of config) {
        const color = new THREE.Color(cfg.color || '#ffffff')
        let light = s.lights[cfg.id]

        if (cfg.type === 'ambient') {
          if (!light || !light.isAmbientLight) {
            if (light) { scene.remove(light); if (light.dispose) light.dispose() }
            light = new THREE.AmbientLight(color, cfg.intensity)
            scene.add(light)
            s.lights[cfg.id] = light
          } else {
            light.color.copy(color)
            light.intensity = cfg.intensity
          }
        } else {
          // 方向光
          if (!light || !light.isDirectionalLight) {
            if (light) { scene.remove(light); if (light.dispose) light.dispose() }
            light = new THREE.DirectionalLight(color, cfg.intensity)
            light.position.set(cfg.posX || 0, cfg.posY || 0, cfg.posZ || 0)
            scene.add(light)
            s.lights[cfg.id] = light
          } else {
            light.color.copy(color)
            light.intensity = cfg.intensity
            light.position.set(cfg.posX || 0, cfg.posY || 0, cfg.posZ || 0)
          }
        }
      }
    },

    /** lightConfig 属性变化时增量更新灯光 */
    onLightConfigChanged(newConfig) {
      const s = this._state
      if (!s || !s.THREE || !s.scene) return
      this._applyLightConfig(newConfig, s.THREE, s.scene)
    },

    /** 更新相机位置与朝向（纯四元数驱动，无万向节锁/翻转） */
    _updateCameraPosition() {
      const s = this._state
      if (!s.camera || !s.orbitQuat) return

      const THREE = s.THREE
      const targetVec = new THREE.Vector3(s.target.x, s.target.y, s.target.z)

      // 位置：target + orbitQuat * (0, 0, radius) + panOffset
      const orbitOffset = new THREE.Vector3(0, 0, s.radius).applyQuaternion(s.orbitQuat)
      const panVec = new THREE.Vector3(s.panOffset.x, s.panOffset.y, s.panOffset.z)
      s.camera.position.copy(targetVec).add(orbitOffset).add(panVec)

      // 相机朝向（仅用于相机位置，旋转由 crystalRoot 自身四元数控制）
      const m4 = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat),
        new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat),
        new THREE.Vector3(0, 0, 1).applyQuaternion(s.orbitQuat)
      )
      s.camera.quaternion.setFromRotationMatrix(m4)
    },

    // ==================== 渲染循环 ====================

    /** 动画循环 */
    _animate() {
      const s = this._state
      if (!s.canvas || !s.renderer || !s.scene || !s.camera) return

      s.renderer.render(s.scene, s.camera)
      s.animFrameId = s.canvas.requestAnimationFrame(() => this._animate())
    },

    // ==================== 晶体加载 ====================

    /** crystalId 属性变化时触发 */
    onCrystalIdChanged(newId) {
      if (newId && this._state && this._state.THREE) {
        this._loadCrystal(newId)
      }
    },

    /** 加载晶体数据并构建场景 */
    _loadCrystal(crystalId) {
      const s = this._state
      if (!s || !s.THREE || s._rebuilding) return
      s._rebuilding = true

      this.setData({ loading: true })

      try {
        // 从预加载Map中获取晶体数据
        const crystalData = getCrystalData(crystalId)
        if (!crystalData) {
          console.error(`[viewer-canvas] 未找到晶体数据: ${crystalId}`)
          this.setData({ loading: false })
          return
        }

        // 检测是否是晶体切换（需要重置相机）
        const isCrystalChange = s._loadedCrystalId !== crystalId
        s._loadedCrystalId = crystalId

        // 保存旧场景中的晶体旋转四元数（设置变更时保留旋转角度）
        const savedCrystalQuat = s.crystalRoot
          ? { x: s.crystalRoot.quaternion.x, y: s.crystalRoot.quaternion.y,
              z: s.crystalRoot.quaternion.z, w: s.crystalRoot.quaternion.w }
          : null

        // 清除旧场景中的晶体对象
        this._clearCrystalGroup()

        // 构建新场景（传入模型选项）
        const options = {
          modelType: this.properties.modelType,
          atomScale: this.properties.atomScale,
          stickRadius: this.properties.stickRadius,
          cellDisplayMode: this.properties.cellDisplayMode,
          opacity: this.properties.opacity,
          fractionalShift: this.properties.fractionalShift,
          partialAtoms: this.properties.partialAtoms,
          auxiliaryLineAboveAtoms: this.properties.auxiliaryLineAboveAtoms
        }
        const { crystalRoot, groups, suggestedRadius, clipPlanes, useLocalClipping } = buildCrystalScene(crystalData, s.THREE, options)
        s.groups = groups
        s.crystalRoot = crystalRoot
        s.atomsGroup = groups.atoms  // 旋转时更新世界空间裁剪平面用
        // 仅晶体切换时重置旋转，设置变更时保留旋转角度
        if (isCrystalChange || !savedCrystalQuat) {
          s.crystalRoot.quaternion.set(0, 0, 0, 1)
        } else {
          s.crystalRoot.quaternion.set(savedCrystalQuat.x, savedCrystalQuat.y, savedCrystalQuat.z, savedCrystalQuat.w)
        }
        s.currentCrystalData = crystalData

        // 添加晶体根节点到场景
        s.scene.add(crystalRoot)

        // 裁剪平面：始终使用逐材质裁剪，避免全局裁剪影响整个场景
        s.renderer.clippingPlanes = []
        s.renderer.localClippingEnabled = !!useLocalClipping

        // quaternion 可能在 buildCrystalScene 之后才恢复，需重新计算世界空间裁剪平面
        if (useLocalClipping) {
          updateWorldClipPlanes(s.atomsGroup, s.crystalRoot, s.THREE)
        }

        // 应用当前图层可见性
        this.updateVisibility()

        // 仅晶体切换时重置相机视角（使用建议距离）
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

        // 存储晶胞尺寸用于雾化计算，并应用深度雾化
        s._cellBoundingRadius = (suggestedRadius || DEFAULT_RADIUS) * 0.414 / 1.3
        if (this.properties.depthFog) {
          this._applyFog()
        }

        this.setData({ loading: false })
        this.triggerEvent('loaded', { crystalId })
        console.log(`[viewer-canvas] 晶体加载完成: ${crystalId}`)
      } catch (err) {
        console.error(`[viewer-canvas] 加载晶体失败: ${crystalId}`, err)
        this.setData({ loading: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
      s._rebuilding = false
    },

    /** 清除当前晶体渲染对象 */
    _clearCrystalGroup() {
      const s = this._state
      if (!s || !s.THREE) return

      // 清除 crystalRoot
      if (s.crystalRoot && s.scene) {
        clearScene(s.crystalRoot, s.THREE)
        s.scene.remove(s.crystalRoot)
        s.crystalRoot = null
      }

      // 清除坐标轴辅助器
      if (s.groups && s.groups.crystalAxes && s.scene) {
        clearScene(s.groups.crystalAxes, s.THREE)
        s.scene.remove(s.groups.crystalAxes)
      }

      s.groups = null
    },

    // ==================== 图层可见性 ====================

    /** 更新各图层可见性（含按元素显隐） */
    updateVisibility() {
      const s = this._state
      if (!s || !s.groups) return

      const props = this.properties
      const showLP = props.showLatticePoints

      // 点阵型式：开启时隐藏原子和标签，仅显示线框和点阵点
      if (s.groups.atoms) {
        s.groups.atoms.visible = showLP ? false : props.showAtoms
        if (!showLP && props.atomVisibility && Object.keys(props.atomVisibility).length > 0) {
          s.groups.atoms.traverse(child => {
            if (child.isMesh && child._element) {
              const elVis = props.atomVisibility[child._element]
              if (elVis !== undefined) child.visible = elVis
            }
          })
        }
      }
      if (s.groups.wireframe) s.groups.wireframe.visible = props.showWireframe
      if (s.groups.interstices) {
        if (s.groups.interstices.octahedral) s.groups.interstices.octahedral.visible = showLP ? false : props.showOctahedral
        if (s.groups.interstices.tetrahedral) s.groups.interstices.tetrahedral.visible = showLP ? false : props.showTetrahedral
      }
      if (s.groups.symmetry) s.groups.symmetry.visible = showLP ? false : props.showSymmetry
      if (s.groups.bonds) s.groups.bonds.visible = showLP ? false : props.showBonds
      if (s.groups.latticePoints) s.groups.latticePoints.visible = showLP
      if (s.groups.auxiliaryLines) {
        if (s.groups.auxiliaryLines.body) s.groups.auxiliaryLines.body.visible = props.showAuxiliaryBody
        if (s.groups.auxiliaryLines.face) s.groups.auxiliaryLines.face.visible = props.showAuxiliaryFace
      }
      if (s.groups.clipCaps) s.groups.clipCaps.visible = showLP ? false : props.showAtoms

      // 坐标轴
      if (s.groups.crystalAxes) s.groups.crystalAxes.visible = props.showAxes

      // 原子标签：点阵型式隐藏；原子关闭时联动隐藏；按元素显隐
      if (s.groups.atomLabels) {
        const atomsVisible = showLP ? false : props.showAtoms
        s.groups.atomLabels.visible = showLP ? false : (atomsVisible && props.showAtomLabels)
        if (s.groups.atomLabels.visible) {
          s.groups.atomLabels.traverse(child => {
            if (child.isSprite && child._element) {
              const elVis = props.atomVisibility[child._element]
              if (elVis !== undefined) child.visible = elVis
            }
          })
        }
      }

      // 氢键
      if (s.groups.hydrogenBonds) {
        s.groups.hydrogenBonds.visible = showLP ? false : props.showHydrogenBonds
      }
    },

    // ==================== 原子缩放 ====================

    /** 原子缩放变化 */
    onAtomScaleChanged(newScale) {
      // 原子缩放变化需要重建场景
      if (this.properties.crystalId && this._state && this._state.THREE) {
        this._loadCrystal(this.properties.crystalId)
      }
    },

    /** 模型类型或棍粗细变化 */
    onModelChanged() {
      if (this.properties.crystalId && this._state && this._state.THREE) {
        this._loadCrystal(this.properties.crystalId)
      }
    },

    /** 晶胞类型模式变化（惯用晶胞 / 素晶胞） */
    onCellDisplayModeChanged() {
      if (this.properties.crystalId && this._state && this._state.THREE) {
        this._loadCrystal(this.properties.crystalId)
      }
    },

    /** 透明度或原子平移变化（需重建场景） */
    onAppearanceChanged() {
      if (this.properties.crystalId && this._state && this._state.THREE) {
        this._loadCrystal(this.properties.crystalId)
      }
    },

    /** 深度雾化开关 */
    onFogChanged(val) {
      const s = this._state
      if (!s || !s.scene || !s.THREE) return
      if (val) {
        this._applyFog()
      } else {
        s.scene.fog = null
      }
    },

    /** 应用深度雾化（基于当前相机距离和晶胞尺寸） */
    _applyFog() {
      const s = this._state
      const cellR = s._cellBoundingRadius || 5
      // 雾在相机空间中：最近原子在 radius-cellR 处，最远在 radius+cellR 处
      // near 设在最近原子稍前（保持清晰），far 设在最远原子稍后（不完全消失）
      const fogNear = Math.max(s.radius - cellR * 1.2, 1)
      const fogFar = s.radius + cellR * 2.5
      s.scene.fog = new s.THREE.Fog(0x1a1a2e, fogNear, fogFar)
    },

    // ==================== 触摸交互 ====================

    /** 触摸开始 */
    onTouchStart(e) {
      const s = this._state
      if (!s.touchHandler) return
      // 记录触摸标识符，用于过滤越界手指（划过中缝时坐标会跳变导致翻转）
      s._touchIds = new Set(e.touches.map(t => t.identifier))
      const touches = e.touches.map(t => ({ x: t.x, y: t.y }))
      s.touchHandler.handleStart(touches)
    },

    /** 触摸移动 */
    onTouchMove(e) {
      const s = this._state
      if (!s.touchHandler || !s.camera) return

      // 过滤越过中缝的手指：坐标超出画布边界说明手指已进入另一侧画布
      const validTouches = e.touches.filter(t => {
        const inBounds = t.x >= 0 && t.x <= s.canvas.width && t.y >= 0 && t.y <= s.canvas.height
        return inBounds && (!s._touchIds || s._touchIds.has(t.identifier))
      })
      if (validTouches.length === 0) return

      const touches = validTouches.map(t => ({ x: t.x, y: t.y }))
      const result = s.touchHandler.handleMove(touches)

      if (!result || !result.type) return

      switch (result.type) {
        case 'rotate': {
          const { deltaTheta, deltaPhi } = result.data
          const THREE = s.THREE
          if (!s.crystalRoot) return
          // 绕相机局部轴旋转晶体（旋转中心 = crystalRoot 原点 = 晶胞中心）
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat).normalize()
          const qH = new THREE.Quaternion().setFromAxisAngle(up, deltaTheta)
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat).normalize()
          const qV = new THREE.Quaternion().setFromAxisAngle(right, deltaPhi)
          s.crystalRoot.quaternion.copy(qH.multiply(qV).multiply(s.crystalRoot.quaternion)).normalize()
          updateWorldClipPlanes(s.atomsGroup, s.crystalRoot, s.THREE)
          break
        }
        case 'zoom': {
          const ratio = result.data.ratio
          s._frustumSize /= ratio
          if (s._frustumSize < 0.1) s._frustumSize = 0.1
          // 缩放中心为晶胞中心：调整平移偏移以抵消视口缩放
          s.panOffset.x /= ratio
          s.panOffset.y /= ratio
          s.panOffset.z /= ratio
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
          const THREE = s.THREE
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat)
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat)
          // 平移偏移（不影响旋转中心）
          s.panOffset.x += -right.x * deltaX + up.x * deltaY
          s.panOffset.y += -right.y * deltaX + up.y * deltaY
          s.panOffset.z += -right.z * deltaX + up.z * deltaY
          this._updateCameraPosition()
          break
        }
      }

      // 双指滚转（绕视线轴旋转晶体）
      if (result.data.deltaAngle && Math.abs(result.data.deltaAngle) > 0.0001) {
        const THREE = s.THREE
        if (!s.crystalRoot) return
        const look = new THREE.Vector3(0, 0, 1).applyQuaternion(s.orbitQuat).normalize()
        const qRoll = new THREE.Quaternion().setFromAxisAngle(look, -result.data.deltaAngle)
        s.crystalRoot.quaternion.copy(qRoll.multiply(s.crystalRoot.quaternion)).normalize()
        updateWorldClipPlanes(s.atomsGroup, s.crystalRoot, s.THREE)
      }
      this._notifyViewChange()
    },
    onTouchEnd(e) {
      const s = this._state
      if (!s.touchHandler) return

      const gesture = s.touchHandler.handleEnd()

      if (gesture === 'tap' && s.scene && s.camera && s.THREE) {
        // 使用最后一个触摸点位置进行射线检测
        const touch = e.changedTouches[0]
        if (touch) {
          this._hitTest({ x: touch.x, y: touch.y })
        }
      } else if (gesture === 'doubleTap') {
        // 双击重置视角
        this.resetView()
        this.triggerEvent('resetview')
      }
    },

    // ==================== PC鼠标交互 ====================

    /** 鼠标按下 */
    onMouseDown(e) {
      const s = this._state
      if (!s._mouseState) {
        s._mouseState = { isDown: false, button: 0, lastX: 0, lastY: 0 }
      }
      s._mouseState.isDown = true
      s._mouseState.button = e.button || 0  // 0=左键, 2=右键
      s._mouseState.lastX = e.x
      s._mouseState.lastY = e.y
    },

    /** 鼠标移动（拖动旋转/平移） */
    onMouseMove(e) {
      const s = this._state
      const ms = s._mouseState
      if (!ms || !ms.isDown || !s.camera || !s.THREE) return

      const dx = e.x - ms.lastX
      const dy = e.y - ms.lastY
      ms.lastX = e.x
      ms.lastY = e.y

      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return

      const THREE = s.THREE
      // 鼠标灵敏度比触摸低
      const MOUSE_ROTATE_SENSITIVITY = 0.005
      const MOUSE_PAN_SENSITIVITY = 0.02

      if (ms.button === 0) {
        // 左键拖动：旋转晶体绕自身中心
        const deltaTheta = dx * MOUSE_ROTATE_SENSITIVITY
        const deltaPhi = dy * MOUSE_ROTATE_SENSITIVITY
        if (!s.crystalRoot) return
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat).normalize()
        const qH = new THREE.Quaternion().setFromAxisAngle(up, deltaTheta)
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat).normalize()
        const qV = new THREE.Quaternion().setFromAxisAngle(right, deltaPhi)
        s.crystalRoot.quaternion.copy(qH.multiply(qV).multiply(s.crystalRoot.quaternion)).normalize()
        updateWorldClipPlanes(s.atomsGroup, s.crystalRoot, s.THREE)
      } else if (ms.button === 2) {
        // 右键拖动：平移
        const panX = dx * MOUSE_PAN_SENSITIVITY
        const panY = -dy * MOUSE_PAN_SENSITIVITY
        const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat)
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat)
        s.panOffset.x += -camRight.x * panX + camUp.x * panY
        s.panOffset.y += -camRight.y * panX + camUp.y * panY
        s.panOffset.z += -camRight.z * panX + camUp.z * panY
        this._updateCameraPosition()
      }
      this._notifyViewChange()
    },

    /** 鼠标释放 */
    onMouseUp(e) {
      const s = this._state
      const ms = s._mouseState
      if (!ms) return

      // 判断是否为点击（位移很小）
      const dx = Math.abs(e.x - (ms._startX || e.x))
      const dy = Math.abs(e.y - (ms._startY || e.y))
      if (dx < 5 && dy < 5 && ms.button === 0 && s.scene && s.camera) {
        this._hitTest({ x: e.x, y: e.y })
      }

      ms.isDown = false
    },

    /** 鼠标滚轮缩放 */
    onMouseWheel(e) {
      const s = this._state
      if (!s.camera) return

      const delta = e.detail ? e.detail.deltaY || e.detail.wheelDelta : e.wheelDelta || -e.deltaY
      const zoomFactor = delta > 0 ? 0.9 : 1.1  // delta>0 向下滚=缩小

      if (s._frustumSize) {
        s._frustumSize *= zoomFactor
        if (s._frustumSize < 0.1) s._frustumSize = 0.1
        // 缩放中心为晶胞中心
        s.panOffset.x *= zoomFactor
        s.panOffset.y *= zoomFactor
        s.panOffset.z *= zoomFactor
        const aspect = s.canvas.width / (s.canvas.height || 1)
        s.camera.left = s._frustumSize * aspect / -2
        s.camera.right = s._frustumSize * aspect / 2
        s.camera.top = s._frustumSize / 2
        s.camera.bottom = s._frustumSize / -2
        s.camera.updateProjectionMatrix()
      }
      this._updateCameraPosition()
      this._notifyViewChange()
    },

    /** 阻止右键菜单 */
    onContextMenu(e) {
      // 小程序中通过返回false阻止默认行为
      return false
    },

    /** 射线检测点击原子 */
    _hitTest(screenPos) {
      const s = this._state
      const THREE = s.THREE

      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()

      // 获取系统信息用于坐标转换
      const sysInfo = wx.getSystemInfoSync()
      mouse.x = (screenPos.x / sysInfo.windowWidth) * 2 - 1
      mouse.y = -(screenPos.y / sysInfo.windowHeight) * 2 + 1

      raycaster.setFromCamera(mouse, s.camera)

      // 收集所有可交互对象（仅可见图层）
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
          this.triggerEvent('latticePointTap', {
            position: position,
            latticeType: obj._latticeType || '',
            latticeTypeName: obj._latticeTypeName || ''
          })
        } else if (obj._element) {
          this.triggerEvent('atomTap', {
            element: obj._element,
            position: position
          })
        } else if (obj._voidType) {
          this.triggerEvent('voidTap', {
            type: obj._voidType,
            position: obj._position || null
          })
        }
      }
    },

    // ==================== 公开方法 ====================

    /** 构建干净轨道四元数：先绕X转(phi-π/2)，再绕世界Y转theta */
    _makeOrbitQuat(theta, phi) {
      const THREE = this._state.THREE
      const qY = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), theta
      )
      const qX = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), phi - Math.PI / 2
      )
      return qY.clone().multiply(qX)
    },

    /** 获取默认平移偏移量（每次返回新对象，避免引用共享），radius 用于按比例缩放 */
    _getDefaultPanOffset(radius) {
      const r = radius || DEFAULT_RADIUS
      return { x: 0, y: -r * DEFAULT_PAN_Y_FACTOR, z: 0 }
    },

    /** 重置视角公共参数（theta、phi、orbitQuat、radius、target、panOffset） */
    _resetViewParams(theta, phi, radius) {
      const s = this._state
      s._theta = theta
      s._phi = phi
      s.orbitQuat = this._makeOrbitQuat(theta, phi)
      s.radius = radius
      s.target = { x: 0, y: 0, z: 0 }
      s.panOffset = this._getDefaultPanOffset(radius)
    },

    /** 设置指定方向的相机轨道四元数（同步角度追踪） */
    _setOrbitDirection(theta, phi) {
      const s = this._state
      if (!s.THREE) return
      s._theta = theta
      s._phi = phi
      s.orbitQuat = this._makeOrbitQuat(theta, phi)
    },

    /** 响应容器尺寸变化，更新渲染器和相机宽高比 */
    resize() {
      const s = this._state
      if (!s.renderer || !s.camera) return

      const query = this.createSelectorQuery()
      query.select('#' + (this.properties.canvasId || 'crystalCanvas'))
        .boundingClientRect()
        .exec((res) => {
          if (!res || !res[0] || res[0].width <= 0 || res[0].height <= 0) return
          const rect = res[0]
          const dpr = wx.getSystemInfoSync().pixelRatio || 2
          const w = Math.floor(rect.width * dpr)
          const h = Math.floor(rect.height * dpr)

          s.renderer.setSize(w, h)
          const aspect = w / (h || 1)

          if (s._frustumSize !== undefined) {
            s.camera.left = s._frustumSize * aspect / -2
            s.camera.right = s._frustumSize * aspect / 2
            s.camera.top = s._frustumSize / 2
            s.camera.bottom = s._frustumSize / -2
          } else {
            s.camera.aspect = aspect
          }
          s.camera.updateProjectionMatrix()
        })
    },

    /** 重置视角到默认位置 */
    resetView() {
      const s = this._state
      this._resetViewParams(Math.PI / 4, Math.atan(Math.sqrt(2)), DEFAULT_RADIUS)
      if (s._frustumSize) s._frustumSize = DEFAULT_RADIUS * 1.2
      if (s.crystalRoot) s.crystalRoot.quaternion.set(0, 0, 0, 1)
      this._updateCameraPosition()
      this._notifyViewChange()
    },

    /** 设置预设视角 */
    setView(direction) {
      const s = this._state
      let theta, phi
      switch (direction) {
        case 'top':
          theta = 0; phi = 0.05; break
        case 'front':
          theta = 0; phi = Math.PI / 2; break
        case 'side':
          theta = Math.PI / 2; phi = Math.PI / 2; break
        case 'iso':
        default:
          theta = Math.PI / 4; phi = Math.atan(Math.sqrt(2)); break
      }
      this._resetViewParams(theta, phi, DEFAULT_RADIUS)
      if (s.crystalRoot) s.crystalRoot.quaternion.set(0, 0, 0, 1)
      this._updateCameraPosition()
      this._notifyViewChange()
    },

    /** 提取当前完整视图状态快照，用于对比页面的同步传输 */
    getViewState() {
      const s = this._state
      if (!s.THREE || !s.camera) return null
      return {
        theta: s._theta,
        phi: s._phi,
        radius: s.radius,
        panOffset: { x: s.panOffset.x, y: s.panOffset.y, z: s.panOffset.z },
        crystalQuat: s.crystalRoot
          ? { x: s.crystalRoot.quaternion.x, y: s.crystalRoot.quaternion.y, z: s.crystalRoot.quaternion.z, w: s.crystalRoot.quaternion.w }
          : { x: 0, y: 0, z: 0, w: 1 },
        frustumSize: s._frustumSize || null,
        target: { x: s.target.x, y: s.target.y, z: s.target.z }
      }
    },

    /** 应用外部视图状态（联动模式下由对比页面调用），仅覆盖提供的字段 */
    applyViewState(state) {
      const s = this._state
      if (!state || !s.THREE || !s.camera) return false

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
        s.crystalRoot.quaternion.set(
          state.crystalQuat.x, state.crystalQuat.y, state.crystalQuat.z, state.crystalQuat.w
        )
        updateWorldClipPlanes(s.atomsGroup, s.crystalRoot, s.THREE)
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
    },

    /** 手势操作后通知父组件视图已变化（对比页面用此实现联动） */
    _notifyViewChange() {
      const s = this._state
      if (s._suppressViewEvent) return
      const state = this.getViewState()
      if (state) {
        this.triggerEvent('viewstatechange', state)
      }
    },

    // ==================== 销毁 ====================

    /** 清理所有资源 */
    _destroy() {
      const s = this._state
      if (s.animFrameId && s.canvas) {
        s.canvas.cancelAnimationFrame(s.animFrameId)
        s.animFrameId = 0
      }
      this._clearCrystalGroup()
      if (s.scene && s.THREE) {
        clearScene(s.scene, s.THREE)
      }
      if (s.renderer) {
        s.renderer.dispose()
      }
      s.THREE = null
      s.scene = null
      s.camera = null
      s.renderer = null
      s.canvas = null
      s.groups = null
      s.touchHandler = null
      console.log('[viewer-canvas] 资源已释放')
    }
  }
})
