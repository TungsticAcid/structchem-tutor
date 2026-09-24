/**
 * 3D 分子查看器画布组件（小程序版）
 * 由 crystal 的 viewer-canvas 改造：将晶体加载替换为分子场景 + 对称元素 + 辅助几何；
 * 复用其 正交相机/四元数轨道/触摸&鼠标交互/射线拾取/渲染循环（同步调用动画 tick）。
 */
import { initThree, resetThree } from '../../lib/three-context.js'
import { TouchHandler } from '../../lib/touch-handler.js'
import { DEFAULT_LIGHT_CONFIG } from '../../lib/materials.js'
import { getVisualColor } from '../../lib/settings.js'
import { buildMoleculeScene, buildAuxCube, buildAuxDihedral } from '../../lib/scene-builder.js'
import { buildSymmetryElements } from '../../lib/symmetry-draw.js'
import { tick as animationTick } from '../../lib/animation.js'
import { animation as animCtl } from '../../lib/animation.js'

/** 默认相机距离 */
const DEFAULT_RADIUS = 35.0
/** 最小正交视锥尺寸（防穿模） */
const MIN_FRUSTUM = 0.1
/** 默认平移偏移 Y 轴因子（分子偏上，避开底部面板） */
const DEFAULT_PAN_Y_FACTOR = 0.12
/** 旋转灵敏度 */
const ROTATE_SENSITIVITY = 0.005
/** 平移灵敏度 */
const PAN_SENSITIVITY = 0.02

Component({
  properties: {
    /** Canvas DOM ID */
    canvasId: { type: String, value: 'moleculeCanvas' },
    /** 分子结构对象（{ kind:'molecule', title, formula, atoms, aux }） */
    structure: { type: Object, value: null, observer: 'onStructureChanged' },
    /** 对称元素元数据数组（由页面识别后传入） */
    symmetryElements: { type: Array, value: [], observer: 'onElementsChanged' },
    /** 球棍模型 */
    modelType: { type: String, value: 'ballStick' },
    /** 原子缩放系数 */
    atomScale: { type: Number, value: 1.0, observer: 'onAppearanceChanged' },
    /** 对称元素整体缩放 */
    symmetryScale: { type: Number, value: 1.0, observer: 'onAppearanceChanged' },
    /** 标签字号 */
    labelFontSize: { type: Number, value: 40, observer: 'onAppearanceChanged' },
    /** 对称元素图层显示 */
    showSymmetry: { type: Boolean, value: true, observer: 'updateVisibility' },
    /** 对称元素标签显示 */
    showLabels: { type: Boolean, value: false, observer: 'updateVisibility' },
    /** 辅助几何显示 */
    showAux: { type: Boolean, value: false, observer: 'updateVisibility' },
    /** 原子名称标签显示 */
    showAtomLabels: { type: Boolean, value: false, observer: 'updateVisibility' }
  },

  data: { loading: false },

  lifetimes: {
    attached() {
      this._state = {
        THREE: null, canvas: null, renderer: null, scene: null, camera: null,
        root: null,             // 场景内容根（旋转作用于此；含分子+对称+辅助）
        moleculeGroup: null,    // 分子组
        symmetryGroup: null,    // 对称元素组
        symmetryItems: [],      // [{ element, mesh, label, labelSprite }]
        auxGroup: null,         // 辅助几何组
        atomMeshes: [],         // 供拾取/高亮
        bondMeshes: [],
        touchHandler: null,
        animFrameId: 0,
        orbitQuat: null,
        radius: DEFAULT_RADIUS,
        target: { x: 0, y: 0, z: 0 },
        panOffset: { x: 0, y: -DEFAULT_RADIUS * DEFAULT_PAN_Y_FACTOR, z: 0 },
        _frustumSize: DEFAULT_RADIUS * 1.2,
        _alignDir: null,
        lights: {}
      }
      this._fadeStack = {}   // 材质虚化栈：记录被虚化材质原始状态，便于精确恢复
      this._initScene()
    },
    detached() { this._destroy() }
  },

  methods: {
    // ==================== 场景初始化 ====================

    _initScene() {
      const query = this.createSelectorQuery()
      query.select('#' + (this.properties.canvasId || 'moleculeCanvas'))
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            console.error('[viewer-canvas] 获取 canvas 节点失败')
            return
          }
          const canvas = res[0].node
          const s = this._state
          s._cssW = res[0].width || canvas.width || 300   // CSS 像素宽（用于命中测试）
          s._cssH = res[0].height || canvas.height || 300
          // 用 three-context 的 initThree，让 render 模块（scene-builder/symmetry-draw/animation）共享同一 THREE
          const THREE = initThree(canvas)
          s.THREE = THREE
          s.canvas = canvas

          // 渲染器（r108 适配版本用 sRGBEncoding 对齐 H5 r160 的色彩）
          const renderer = new THREE.WebGLRenderer({ antialias: true })
          if ('outputEncoding' in renderer && THREE.sRGBEncoding !== undefined) {
            renderer.outputEncoding = THREE.sRGBEncoding
          }
          renderer.setPixelRatio((wx.getSystemInfoSync && wx.getSystemInfoSync().pixelRatio) || 2)
          renderer.setSize(canvas.width, canvas.height)
          renderer.setClearColor(getVisualColor('bgColor'), 1)
          s.renderer = renderer

          // 场景
          const scene = new THREE.Scene()
          s.scene = scene

          // 相机 — 正交投影
          const aspect = canvas.width / (canvas.height || 1)
          const fr = s._frustumSize
          const camera = new THREE.OrthographicCamera(
            fr * aspect / -2, fr * aspect / 2,
            fr / 2, fr / -2,
            0.1, 500
          )
          s.camera = camera

          // 轨道四元数（等轴测初始视角）
          s.orbitQuat = this._makeOrbitQuat(Math.PI / 4, Math.atan(Math.sqrt(2)))
          this._updateCameraPosition()

          // 内容根
          s.root = new THREE.Group()
          scene.add(s.root)

          // 灯光
          this._setupLights(THREE, scene)

          // 手势
          s.touchHandler = new TouchHandler()

          // 渲染循环
          this._animate()

          // 若已有结构（属性先于 canvas 就绪下发），加载
          if (this.properties.structure) this._buildScene(false)
          else if (this._pendingStructure) {
            const p = this._pendingStructure
            this._pendingStructure = null
            this.properties.structure = p   // 拿到渲染参数后再消费
            this._buildScene(false)
          }
          console.log('[viewer-canvas] 场景初始化完成')
        })
    },

    _setupLights(THREE, scene) {
      const s = this._state
      s.lights = {}
      for (const cfg of DEFAULT_LIGHT_CONFIG) {
        const color = new THREE.Color(cfg.color || '#ffffff')
        if (cfg.type === 'ambient') {
          const light = new THREE.AmbientLight(color, cfg.intensity)
          scene.add(light)
          s.lights[cfg.id] = light
        } else {
          const light = new THREE.DirectionalLight(color, cfg.intensity)
          light.position.set(cfg.posX || 0, cfg.posY || 0, cfg.posZ || 0)
          scene.add(light)
          s.lights[cfg.id] = light
        }
      }
    },

    _makeOrbitQuat(theta, phi) {
      const THREE = this._state.THREE
      const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), theta)
      const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), phi - Math.PI / 2)
      return qY.clone().multiply(qX)
    },

    _updateCameraPosition() {
      const s = this._state
      if (!s.camera || !s.orbitQuat) return
      const THREE = s.THREE
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
    },

    _updateFrustum() {
      const s = this._state
      if (!s.camera || !s.canvas) return
      const aspect = s.canvas.width / (s.canvas.height || 1)
      s.camera.left = s._frustumSize * aspect / -2
      s.camera.right = s._frustumSize * aspect / 2
      s.camera.top = s._frustumSize / 2
      s.camera.bottom = s._frustumSize / -2
      s.camera.updateProjectionMatrix()
    },

    // ==================== 渲染循环 ====================

    _animate() {
      const s = this._state
      if (!s.canvas || !s.renderer || !s.scene || !s.camera) return
      s.renderer.render(s.scene, s.camera)
      // 每帧校正 σ 反映面标签朝向
      this._fixSigmaLabels()
      // 动画 tick（now 为 rAF 时间戳）
      if (animationTick) animationTick(Date.now())
      s.animFrameId = s.canvas.requestAnimationFrame(() => this._animate())
    },

    /** 相机世界基向量：up / right / look */
    getViewBasis() {
      const s = this._state
      if (!s.orbitQuat) return { up: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } }
      const THREE = s.THREE
      return {
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat).normalize(),
        right: new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat).normalize(),
        look: new THREE.Vector3(0, 0, 1).applyQuaternion(s.orbitQuat).normalize()
      }
    },

    /** 每帧校正 σ 反映面标签朝向：位置不变但朝向按观察者自适应（翻转/镜像，保持正读） */
    _fixSigmaLabels() {
      const s = this._state
      const THREE = s.THREE
      if (!THREE || !s.symmetryItems) return
      const basis = this.getViewBasis()
      const _q = new THREE.Quaternion()
      const _m = new THREE.Matrix4()
      for (const item of s.symmetryItems) {
        const lm = item.labelSprite
        if (!lm || !lm.userData || !lm.userData.inPlane) continue
        const ud = lm.userData
        lm.parent.getWorldQuaternion(_q)
        const vw = ud.v.clone().applyQuaternion(_q)
        const nw = ud.n.clone().applyQuaternion(_q)
        const flip = vw.dot(basis.up) < 0
        const mirror = nw.dot(basis.look) < 0
        const u = ud.u.clone(), v = ud.v.clone()
        if (flip) { u.multiplyScalar(-1); v.multiplyScalar(-1) }
        lm.quaternion.setFromRotationMatrix(_m.makeBasis(u, v, ud.n))
        lm.scale.x = mirror ? -1 : 1
      }
    },

    // ==================== 场景构建 ====================

    // 新结构：重建（reset 视角）
    onStructureChanged() {
      if (this._state && this._state.THREE) this._buildScene(false)
      else this._pendingStructure = this.properties.structure
    },

    // 元素集随结构一起下发：由 onStructureChanged 统一重建，此处不重复
    onElementsChanged() { /* 空：避免与结构变更双重建 */ },

    // 外观/几何参数变化：重建但保留当前视角（同一结构微调）
    onAppearanceChanged() {
      if (this._state && this._state.THREE && this.properties.structure) this._buildScene(true)
    },

    /** 显式重建（页面在颜色等改完后调用，保留视角） */
    rebuild() {
      if (this._state && this._state.THREE && this.properties.structure) this._buildScene(true)
    },

    /** 构建/重建分子 + 对称元素 + 辅助几何场景
     *  @param {boolean} preserveView - 为真时保留当前旋转/平移视角（同一结构微调）；否则对齐主轴并复位 */
    _buildScene(preserveView) {
      const s = this._state
      const props = this.properties
      const structure = props.structure
      if (!s || !s.THREE || !structure) return
      const THREE = s.THREE

      // 保存旧位姿（同一结构微调时保留视角）
      const prevQuat = preserveView && s.root ? s.root.quaternion.clone() : null
      const prevPan = preserveView ? { ...s.panOffset } : null
      const prevFrustum = preserveView ? s._frustumSize : null

      // 清除旧内容
      this._clearRoot()

      // 分子场景
      const { group: molGroup, radius } = buildMoleculeScene(structure, {
        modelType: props.modelType,
        atomScale: props.atomScale,
        showAtomLabels: props.showAtomLabels
      })
      s.moleculeGroup = molGroup
      s.root.add(molGroup)
      s.radius = radius
      s._frustumSize = radius * 1.2
      this._updateFrustum()

      // 收集原子/键 mesh（供选中态虚化）
      s.atomMeshes = []
      s.bondMeshes = []
      molGroup.traverse(o => {
        if (o.isMesh) {
          if (o.userData && o.userData.atomIndex !== undefined) s.atomMeshes.push(o)
          else if (o.userData && o.userData.bond) s.bondMeshes.push(o)
        }
      })

      // 对称元素
      const symResult = buildSymmetryElements(props.symmetryElements || [], radius, {
        symmetryScale: props.symmetryScale,
        showLabels: props.showLabels,
        labelFontSize: props.labelFontSize
      })
      s.symmetryGroup = symResult.group
      s.symmetryItems = symResult.items
      // 按"对称元素"开关全显（面板 checkbox 可逐项隐藏）
      const elements = props.symmetryElements || []
      for (let i = 0; i < s.symmetryItems.length; i++) {
        s.symmetryItems[i].mesh.visible = props.showSymmetry
      }
      s.root.add(symResult.group)

      // 辅助几何
      s.auxGroup = null
      if (structure.aux && structure.kind === 'molecule') {
        if (structure.aux.type === 'cube') s.auxGroup = buildAuxCube(structure.aux.halfSize, { atoms: structure.atoms })
        else if (structure.aux.type === 'dihedral') s.auxGroup = buildAuxDihedral(structure.atoms, structure.aux.indices)
        if (s.auxGroup) { s.auxGroup.visible = props.showAux; s.root.add(s.auxGroup) }
      }

      if (preserveView) {
        // 同一结构微调：保留视角（旧四元数/平移/视锥）
        if (prevQuat) s.root.quaternion.copy(prevQuat)
        if (prevPan) s.panOffset = prevPan
        if (prevFrustum) { s._frustumSize = prevFrustum; this._updateFrustum() }
      } else {
        // 新结构：先复位位姿，再按主轴对齐（主轴垂直屏幕 / 对称面平行屏幕）
        s.panOffset = this._getDefaultPanOffset(radius)
        s.root.quaternion.set(0, 0, 0, 1)
        this._alignInitialView(elements)
      }
      this._updateCameraPosition()
      this.triggerEvent('loaded', {})
    },

    _alignInitialView(elements) {
      const s = this._state
      const THREE = s.THREE
      if (!THREE || !s.root) return
      let dir = null
      // 主轴（最高阶 C 真轴）
      let best = null
      for (const el of elements) {
        if (el && el.type && el.type.startsWith('C') && el.axis && (!best || (el.order || 0) > (best.order || 0))) best = el
      }
      if (best && best.axis) dir = best.axis
      else {
        const sig = elements.find(el => el && el.type && el.type.startsWith('sigma') && el.axis)
        if (sig) dir = sig.axis
      }
      this._alignDir = dir ? dir.slice() : null
      if (dir) {
        const look = new THREE.Vector3(0, 0, 1).applyQuaternion(s.orbitQuat).normalize()
        const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize()
        s.root.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(d, look)).normalize()
      }
    },

    _getDefaultPanOffset(radius) {
      const r = radius || DEFAULT_RADIUS
      return { x: 0, y: -r * DEFAULT_PAN_Y_FACTOR, z: 0 }
    },

    /** 清除根节点内容并释放材质 */
    _clearRoot() {
      const s = this._state
      const THREE = s.THREE
      if (!s.root) return
      if (THREE) {
        s.root.traverse((child) => {
          if (child.geometry) child.geometry.dispose()
          if (child.material) {
            if (THREE && Array.isArray(child.material)) child.material.forEach(m => m.dispose())
            else if (child.material && child.material.dispose) child.material.dispose()
          }
        })
      }
      while (s.root.children.length > 0) s.root.remove(s.root.children[0])
      s.moleculeGroup = null
      s.symmetryGroup = null
      s.symmetryItems = []
      s.auxGroup = null
      s.atomMeshes = []
      s.bondMeshes = []
    },

    // ==================== 显隐切换 ====================

    updateVisibility() {
      const s = this._state
      if (!s) return
      const props = this.properties
      if (s.symmetryGroup) {
        s.symmetryGroup.visible = props.showSymmetry
        // 元素级可见：开关全显（面板 checkbox 再逐项隐藏）
        if (s.symmetryItems) {
          for (let i = 0; i < s.symmetryItems.length; i++) {
            s.symmetryItems[i].mesh.visible = props.showSymmetry
          }
        }
      }
      if (s.symmetryItems) {
        for (const item of s.symmetryItems) {
          if (item.labelSprite) item.labelSprite.visible = props.showLabels && props.showSymmetry
        }
      }
      if (s.auxGroup) s.auxGroup.visible = props.showAux
      if (s.moleculeGroup) {
        s.moleculeGroup.traverse(o => {
          if (o.userData && o.userData.atomLabel) o.visible = props.showAtomLabels
        })
      }
    },

    // ==================== 公开方法（页面调用） ====================

    /** 单个对称元素显隐 */
    setElementVisible(index, visible) {
      const s = this._state
      if (s && s.symmetryItems[index]) s.symmetryItems[index].mesh.visible = visible
    },

    /** 获取内容根（供动画模块引用分子组） */
    getRoot() { return this._state.root },

    /** 复位视角（回主轴正对屏幕） */
    resetView() {
      const s = this._state
      const r = s.radius || DEFAULT_RADIUS
      s.panOffset = this._getDefaultPanOffset(r)
      this._updateCameraPosition()
      if (this._alignDir) {
        const THREE = s.THREE
        const look = new THREE.Vector3(0, 0, 1).applyQuaternion(s.orbitQuat).normalize()
        const d = new THREE.Vector3(this._alignDir[0], this._alignDir[1], this._alignDir[2]).normalize()
        s.root.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(d, look)).normalize()
      } else {
        s.root.quaternion.set(0, 0, 0, 1)
      }
      this._notifyViewChange()
    },

    setBackground(color) {
      const s = this._state
      if (s.renderer) s.renderer.setClearColor(color, 1)
    },

    resize() {
      const s = this._state
      if (!s.renderer || !s.camera) return
      const query = this.createSelectorQuery()
      query.select('#' + this.properties.canvasId).boundingClientRect().exec((res) => {
        if (!res || !res[0] || res[0].width <= 0 || res[0].height <= 0) return
        const rect = res[0]
        s._cssW = rect.width
        s._cssH = rect.height
        // 传 CSS 尺寸；setPixelRatio 已设，渲染器内部按设备像素比放大 buffer
        s.renderer.setSize(rect.width, rect.height)
        this._updateFrustum()
      })
    },

    // ==================== 触摸交互 ====================

    onTouchStart(e) {
      const s = this._state
      if (!s.touchHandler) return
      s._touchIds = new Set(e.touches.map(t => t.identifier))
      const touches = e.touches.map(t => ({ x: t.x, y: t.y }))
      s.touchHandler.handleStart(touches)
    },

    onTouchMove(e) {
      const s = this._state
      if (!s.touchHandler || !s.camera) return
      const validTouches = e.touches.filter(t => {
        const inBounds = t.x >= 0 && t.x <= s._cssW && t.y >= 0 && t.y <= s._cssH
        return inBounds && (!s._touchIds || s._touchIds.has(t.identifier))
      })
      if (validTouches.length === 0) return
      const touches = validTouches.map(t => ({ x: t.x, y: t.y }))
      const result = s.touchHandler.handleMove(touches)
      if (!result || !result.type) return
      const THREE = s.THREE
      switch (result.type) {
        case 'rotate': {
          const { deltaTheta, deltaPhi } = result.data
          if (!s.root) return
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat).normalize()
          const qH = new THREE.Quaternion().setFromAxisAngle(up, deltaTheta)
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat).normalize()
          const qV = new THREE.Quaternion().setFromAxisAngle(right, deltaPhi)
          s.root.quaternion.copy(qH.multiply(qV).multiply(s.root.quaternion)).normalize()
          break
        }
        case 'zoom': {
          const ratio = result.data.ratio
          s._frustumSize /= ratio
          if (s._frustumSize < MIN_FRUSTUM) s._frustumSize = MIN_FRUSTUM
          s.panOffset.x /= ratio
          s.panOffset.y /= ratio
          s.panOffset.z /= ratio
          this._updateFrustum()
          this._updateCameraPosition()
          break
        }
        case 'pan': {
          const { deltaX, deltaY } = result.data
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat)
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat)
          s.panOffset.x += -right.x * deltaX + up.x * deltaY
          s.panOffset.y += -right.y * deltaX + up.y * deltaY
          s.panOffset.z += -right.z * deltaX + up.z * deltaY
          this._updateCameraPosition()
          break
        }
      }
      // 双指滚转（绕视线轴旋转内容）
      if (result.data && result.data.deltaAngle && Math.abs(result.data.deltaAngle) > 0.0001) {
        const look = new THREE.Vector3(0, 0, 1).applyQuaternion(s.orbitQuat).normalize()
        const qRoll = new THREE.Quaternion().setFromAxisAngle(look, -result.data.deltaAngle)
        s.root.quaternion.copy(qRoll.multiply(s.root.quaternion)).normalize()
      }
      this._notifyViewChange()
    },

    onTouchEnd(e) {
      const s = this._state
      if (!s.touchHandler) return
      const gesture = s.touchHandler.handleEnd()
      if (gesture === 'tap' && s.scene && s.camera) {
        const touch = e.changedTouches[0]
        if (touch) this._hitTest({ x: touch.x, y: touch.y })
      } else if (gesture === 'doubleTap') {
        this.resetView()
      }
    },

    // ==================== PC鼠标交互 ====================

    onMouseDown(e) {
      const s = this._state
      if (!s._mouseState) s._mouseState = { isDown: false, button: 0, lastX: 0, lastY: 0, startX: 0, startY: 0 }
      const ms = s._mouseState
      ms.isDown = true
      ms.button = e.button || 0
      ms.lastX = e.x; ms.lastY = e.y
      ms.startX = e.x; ms.startY = e.y
    },

    onMouseMove(e) {
      const s = this._state
      const ms = s._mouseState
      if (!ms || !ms.isDown || !s.camera) return
      const THREE = s.THREE
      const dx = e.x - ms.lastX, dy = e.y - ms.lastY
      ms.lastX = e.x; ms.lastY = e.y
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      if (ms.button === 0) {
        const deltaTheta = dx * ROTATE_SENSITIVITY
        const deltaPhi = dy * ROTATE_SENSITIVITY
        if (!s.root) return
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat).normalize()
        const qH = new THREE.Quaternion().setFromAxisAngle(up, deltaTheta)
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat).normalize()
        const qV = new THREE.Quaternion().setFromAxisAngle(right, deltaPhi)
        s.root.quaternion.copy(qH.multiply(qV).multiply(s.root.quaternion)).normalize()
      } else if (ms.button === 2) {
        const panX = dx * PAN_SENSITIVITY, panY = -dy * PAN_SENSITIVITY
        const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orbitQuat)
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(s.orbitQuat)
        s.panOffset.x += -camRight.x * panX + camUp.x * panY
        s.panOffset.y += -camRight.y * panX + camUp.y * panY
        s.panOffset.z += -camRight.z * panX + camUp.z * panY
        this._updateCameraPosition()
      }
      this._notifyViewChange()
    },

    onMouseUp(e) {
      const s = this._state
      const ms = s._mouseState
      if (!ms) return
      const dx = Math.abs(e.x - ms.startX), dy = Math.abs(e.y - ms.startY)
      if (dx < 5 && dy < 5 && ms.button === 0 && s.scene && s.camera) this._hitTest({ x: e.x, y: e.y })
      ms.isDown = false
    },

    onMouseWheel(e) {
      const s = this._state
      if (!s.camera) return
      const delta = e.detail ? (e.detail.deltaY || e.detail.wheelDelta) : 1
      const zoomFactor = delta > 0 ? 0.9 : 1.1
      s._frustumSize *= zoomFactor
      if (s._frustumSize < MIN_FRUSTUM) s._frustumSize = MIN_FRUSTUM
      s.panOffset.x *= zoomFactor
      s.panOffset.y *= zoomFactor
      s.panOffset.z *= zoomFactor
      this._updateFrustum()
      this._updateCameraPosition()
      this._notifyViewChange()
    },

    /** 阻止右键菜单 */
    onContextMenu() { return false },

    /** 射线检测点击原子 */
    _hitTest(screenPos) {
      const s = this._state
      if (!s.THREE || !s.camera) return
      const THREE = s.THREE
      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()
      const cw = s._cssW || s.canvas.width || 300
      const ch = s._cssH || s.canvas.height || 300
      mouse.x = (screenPos.x / cw) * 2 - 1
      mouse.y = -(screenPos.y / ch) * 2 + 1
      raycaster.setFromCamera(mouse, s.camera)
      const targets = s.atomMeshes.filter(m => m.visible)
      const hits = raycaster.intersectObjects(targets)
      if (hits.length > 0) {
        const idx = hits[0].object.userData.atomIndex
        this.triggerEvent('atomTap', { index: idx, element: hits[0].object.userData.element })
      } else {
        this.triggerEvent('atomTap', { index: null })
      }
    },

    _notifyViewChange(e) { /* 预留：联动/状态上报 */ },

    /** 高亮选中原子，虚化其余原子/键/对称元素/辅助几何/标签 */
    setAtomHighlight(index, orbSet, stabIndexSet) {
      const s = this._state
      const THREE = s.THREE
      if (!THREE) return
      this._clearFades()
      const orb = new Set(orbSet || [])
      for (const mesh of s.atomMeshes) {
        const ai = mesh.userData.atomIndex
        if (ai === index) {
          mesh.scale.setScalar(mesh.userData.baseScale * 1.3)
          mesh.renderOrder = 2
        } else if (orb.has(ai)) {
          mesh.scale.setScalar(mesh.userData.baseScale)
          mesh.renderOrder = 1
        } else {
          mesh.scale.setScalar(mesh.userData.baseScale)
          this._applyFade(mesh.material, 0.15)
          mesh.renderOrder = 1
        }
      }
      for (const b of s.bondMeshes) {
        const pair = b.userData.atomPair
        const orbBond = pair && orb.has(pair[0]) && orb.has(pair[1])
        if (!orbBond) this._applyFade(b.material, 0.1)
        b.renderOrder = 0
      }
      const stab = stabIndexSet || new Set()
      for (let i = 0; i < s.symmetryItems.length; i++) {
        if (stab.has(i)) continue
        s.symmetryItems[i].mesh.traverse(o => { if (o.material) this._applyFade(o.material, 0.12) })
      }
      if (s.auxGroup) s.auxGroup.traverse(o => { if (o.material) this._applyFade(o.material, 0.15) })
      if (s.moleculeGroup) {
        s.moleculeGroup.traverse(o => {
          if (o.userData && o.userData.atomLabel && !orb.has(o.userData.atomIndex)) this._applyFade(o.material, 0.12)
        })
      }
    },

    /** 清除选中态：恢复缩放/材质 */
    clearAtomHighlight() {
      const s = this._state
      this._clearFades()
      for (const mesh of s.atomMeshes) { if (mesh.userData) mesh.scale.setScalar(mesh.userData.baseScale); mesh.renderOrder = 0 }
      for (const b of s.bondMeshes) b.renderOrder = 0
    },

    _applyFade(mat, opacity) {
      if (!mat) return
      if (!this._fadeStack[mat.uuid]) {
        this._fadeStack[mat.uuid] = { mat, opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite }
      }
      mat.transparent = true
      mat.depthWrite = false
      mat.opacity = opacity
      if (mat.needsUpdate !== undefined) mat.needsUpdate = true
    },

    _clearFades() {
      for (const uuid of Object.keys(this._fadeStack)) {
        const rec = this._fadeStack[uuid]
        if (rec.mat) {
          rec.mat.opacity = rec.opacity
          rec.mat.transparent = rec.transparent
          rec.mat.depthWrite = rec.depthWrite
          if (rec.mat.needsUpdate !== undefined) rec.mat.needsUpdate = true
        }
      }
      this._fadeStack = {}
    },

    // ==================== 对称操作动画（页面调用） ====================

    /** 播放某对称元素的教学动画 */
    playSymmetryOperation(element) {
      const s = this._state
      if (!s || !s.moleculeGroup || !element) return
      animCtl.play({ root: s.root, moleculeGroup: s.moleculeGroup, symmetryGroup: s.symmetryGroup, auxGroup: s.auxGroup, element })
    },

    /** 停止当前动画并复位（切换结构/选中原子前调用） */
    stopAnimation() {
      animCtl.stop()
    },

    // ==================== 销毁 ====================

    _destroy() {
      const s = this._state
      if (s.animFrameId && s.canvas) { s.canvas.cancelAnimationFrame(s.animFrameId); s.animFrameId = 0 }
      this._clearRoot()
      if (s.scene && s.THREE) s.scene.traverse(o => { if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose && m.dispose()); else if (o.material.dispose) o.material.dispose() } })
      if (s.renderer) s.renderer.dispose()
      s.THREE = null; s.scene = null; s.camera = null; s.renderer = null; s.canvas = null; s.root = null
      s.touchHandler = null
      resetThree()
    }
  }
})
