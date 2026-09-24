/**
 * 晶体结构对比页面
 * 左右分栏展示同一晶体的两种模型，支持联动/独立交互、独立样式控制和横竖屏切换
 */
const { getCrystalData } = require('../../lib/crystal-loader')

/** 生成一侧的默认样式设置 */
function defaultSideSettings(overrides = {}) {
  return {
    modelType: 'ballStick',
    stickRadius: 0.08,
    showAtoms: true,
    showWireframe: true,
    showBonds: false,
    showAxes: true,
    showSymmetry: false,
    showInterstices: false,
    showOctahedral: false,
    showTetrahedral: false,
    showAuxiliaryBody: false,
    showAuxiliaryFace: false,
    atomScale: 1.0,
    opacity: 0.0,
    cellDisplayMode: 'conventional',
    ...overrides
  }
}

Page({
  data: {
    /** 当前晶体ID */
    crystalId: '',
    /** 晶体名称 */
    crystalName: '',
    /** 完整晶体数据（用于元素列表渲染） */
    crystalData: null,
    /** 是否显示空隙/对称控制（仅A1-A4堆积结构） */
    showIntersticeControl: false,
    /** 联动模式：true=联动同步，false=各自独立 */
    syncMode: true,
    /** 布局模式：horizontal(横屏并排) | vertical(竖屏上下) */
    layoutMode: 'vertical',
    /** 设置面板是否展开 */
    settingsExpanded: false,
    /** 防循环标志，applyViewState期间置位 */
    _syncing: false,

    // ========== 左侧独立设置 ==========
    leftModelType: 'ballStick',
    leftStickRadius: 0.08,
    leftShowAtoms: true,
    leftShowBonds: false,
    leftShowAxes: true,
    leftShowSymmetry: false,
    leftShowInterstices: false,
    leftShowOctahedral: false,
    leftShowTetrahedral: false,
    leftShowAuxiliaryBody: false,
    leftShowAuxiliaryFace: false,
    leftAtomScale: 1.0,
    leftOpacity: 0.0,
    leftCellDisplayMode: 'conventional',
    leftEquivalentIndex: 0,
    leftFractionalShift: [0, 0, 0],

    // ========== 右侧独立设置 ==========
    rightModelType: 'cpk',
    rightStickRadius: 0.08,
    rightShowAtoms: true,
    rightShowBonds: false,
    rightShowAxes: true,
    rightShowSymmetry: false,
    rightShowInterstices: false,
    rightShowOctahedral: false,
    rightShowTetrahedral: false,
    rightShowAuxiliaryBody: false,
    rightShowAuxiliaryFace: false,
    rightAtomScale: 1.0,
    rightOpacity: 0.0,
    rightCellDisplayMode: 'conventional',
    rightEquivalentIndex: 0,
    rightFractionalShift: [0, 0, 0],

    // ========== 共享设置（两侧保持一致） ==========
    auxiliaryLineAboveAtoms: false,
    depthFog: false,
    equivalentSettings: [],
    partialAtoms: false,
    lightConfig: [
      { id: 'ambient', type: 'ambient', color: '#404060', intensity: 0.6 },
      { id: 'key', type: 'directional', color: '#ffffff', intensity: 0.8, posX: 5, posY: 8, posZ: 5 },
      { id: 'fill', type: 'directional', color: '#8888ff', intensity: 0.3, posX: -3, posY: -1, posZ: -3 },
      { id: 'rim', type: 'directional', color: '#ff8888', intensity: 0.2, posX: 0, posY: 0, posZ: -5 }
    ],
    leftAtomVisibility: {},
    rightAtomVisibility: {},
    showAtomLabels: false,
    /** 是否显示空隙控制（仅A1/A3堆积结构） */
    showIntersticeControl: false,
    isMolecularCrystal: false,
    hasHydrogenBonds: false,
    leftShowHydrogenBonds: true,
    rightShowHydrogenBonds: true,
    leftShowLatticePoints: false,
    rightShowLatticePoints: false,
    leftShowAtomLabels: false,
    rightShowAtomLabels: false,
    /** 是否正交晶胞（α=β=γ=90°），允许裁剪 */
    isOrthogonalCell: true
  },

  onLoad(options) {
    const crystalId = options.crystal || 'fcc'
    const data = getCrystalData(crystalId)
    const leftAtomVisibility = {}
    const rightAtomVisibility = {}
    if (data && data.atoms) {
      for (const group of data.atoms) {
        leftAtomVisibility[group.element] = true
        rightAtomVisibility[group.element] = true
      }
    }

    const app = getApp()
    const preset = app.globalData.comparePreset || {}
    delete app.globalData.comparePreset

    const inheritKeys = [
      'ShowAtoms', 'ShowBonds', 'ShowAxes',
      'ShowInterstices',
      'ShowOctahedral', 'ShowTetrahedral', 'ShowAuxiliaryBody', 'ShowAuxiliaryFace',
      'AtomScale', 'Opacity', 'CellDisplayMode'
    ]
    const initData = {
      crystalId,
      crystalName: data ? data.name : crystalId,
      crystalData: data,
      leftModelType: 'ballStick',
      rightModelType: 'cpk',
      leftStickRadius: preset.stickRadius != null ? preset.stickRadius : 0.08,
      rightStickRadius: preset.stickRadius != null ? preset.stickRadius : 0.08,
      leftAtomVisibility: preset.atomVisibility ? { ...preset.atomVisibility } : leftAtomVisibility,
      rightAtomVisibility: preset.atomVisibility ? { ...preset.atomVisibility } : rightAtomVisibility,
      partialAtoms: preset.partialAtoms != null ? preset.partialAtoms : false
    }

    for (const key of inheritKeys) {
      if (preset[key.charAt(0).toLowerCase() + key.slice(1)] != null) {
        const val = preset[key.charAt(0).toLowerCase() + key.slice(1)]
        initData['left' + key] = val
        initData['right' + key] = val
      }
    }

    // 晶胞原点变换设置（左右独立）
    const eqSettings = data.equivalentSettings || []
    initData.equivalentSettings = eqSettings
    const defaultShift = eqSettings.length > 0 ? (eqSettings[0].shift || [0, 0, 0]) : [0, 0, 0]
    initData.leftEquivalentIndex = preset.leftEquivalentIndex != null ? preset.leftEquivalentIndex
      : (preset.equivalentIndex != null ? preset.equivalentIndex : 0)
    initData.rightEquivalentIndex = preset.rightEquivalentIndex != null ? preset.rightEquivalentIndex
      : (preset.equivalentIndex != null ? preset.equivalentIndex : 0)
    initData.leftFractionalShift = preset.leftFractionalShift || preset.fractionalShift || defaultShift
    initData.rightFractionalShift = preset.rightFractionalShift || preset.fractionalShift || defaultShift

    initData.showIntersticeControl = ['fcc', 'hcp'].includes(crystalId)
    // 正交晶胞判断
    initData.isOrthogonalCell = data.lattice && data.lattice.alpha === 90 && data.lattice.beta === 90 && data.lattice.gamma === 90

    // 分子晶体检测
    const MOLECULAR_CRYSTAL_IDS = ['co2', 'ice', 'i2', 'urea']
    const isMolecularCrystal = MOLECULAR_CRYSTAL_IDS.includes(crystalId)
    const hasHydrogenBonds = isMolecularCrystal && data.hydrogenBonds && data.hydrogenBonds.length > 0
    initData.isMolecularCrystal = isMolecularCrystal
    initData.hasHydrogenBonds = hasHydrogenBonds
    // 键默认值：分子晶体默认开，金属晶体默认关，其余默认开
    const METAL_CRYSTAL_IDS = ['fcc', 'bcc', 'hcp']
    const isMetalCrystal = METAL_CRYSTAL_IDS.includes(crystalId)
    if (isMolecularCrystal) {
      initData.leftShowBonds = true
      initData.rightShowBonds = true
      initData.leftShowHydrogenBonds = true
      initData.rightShowHydrogenBonds = true
    } else if (!isMetalCrystal) {
      initData.leftShowBonds = true
      initData.rightShowBonds = true
    }

    this._pendingViewState = preset.viewState || null
    this._canvasLoadedCount = 0

    this.setData(initData)
  },

  onCanvasLoaded() {
    this._canvasLoadedCount++
    if (this._canvasLoadedCount >= 2 && this._pendingViewState) {
      const vs = this._pendingViewState
      const rotationState = {
        theta: vs.theta,
        phi: vs.phi,
        panOffset: { x: 0, y: 0, z: 0 },
        crystalQuat: vs.crystalQuat || { x: 0, y: 0, z: 0, w: 1 }
      }
      const left = this.selectComponent('#compareLeft')
      const right = this.selectComponent('#compareRight')
      if (left && left.applyViewState) left.applyViewState(rotationState)
      if (right && right.applyViewState) right.applyViewState(rotationState)
      this._pendingViewState = null
    }
  },

  // ==================== 布局切换 ====================

  onToggleLayout() {
    const newMode = this.data.layoutMode === 'horizontal' ? 'vertical' : 'horizontal'
    this.setData({ layoutMode: newMode })
    // frustum 与画布宽度成正比：竖屏全宽保持原始大小，横屏半宽等比缩小
    setTimeout(() => {
      const left = this.selectComponent('#compareLeft')
      const right = this.selectComponent('#compareRight')
      const vs = left && left.getViewState ? left.getViewState() : null
      const currentFrustum = vs ? vs.frustumSize : null
      const scale = newMode === 'horizontal' ? 2.0 : 0.5
      const targetFrustum = currentFrustum ? currentFrustum * scale : null
      if (left) {
        if (targetFrustum && left.applyViewState) left.applyViewState({ frustumSize: targetFrustum })
        if (left.resize) left.resize()
      }
      if (right) {
        if (targetFrustum && right.applyViewState) right.applyViewState({ frustumSize: targetFrustum })
        if (right.resize) right.resize()
      }
    }, 200)
  },

  // ==================== 视图联动 ====================

  onViewStateChange(e) {
    if (!this.data.syncMode) return
    if (this.data._syncing) return

    const viewState = e.detail
    if (!viewState) return

    this.data._syncing = true

    const sourceId = e.currentTarget.id
    if (sourceId === 'compareLeft') {
      const rightCanvas = this.selectComponent('#compareRight')
      if (rightCanvas) rightCanvas.applyViewState(viewState)
    } else if (sourceId === 'compareRight') {
      const leftCanvas = this.selectComponent('#compareLeft')
      if (leftCanvas) leftCanvas.applyViewState(viewState)
    }

    this.data._syncing = false
  },

  /** 双击重置视角：联动模式下两侧均重置，非联动模式各自独立 */
  onResetView(e) {
    if (!this.data.syncMode) return  // 非联动：只重置双击侧（已自行处理）

    const sourceId = e.currentTarget.id
    if (sourceId === 'compareLeft') {
      const rightCanvas = this.selectComponent('#compareRight')
      if (rightCanvas && rightCanvas.resetView) rightCanvas.resetView()
    } else if (sourceId === 'compareRight') {
      const leftCanvas = this.selectComponent('#compareLeft')
      if (leftCanvas && leftCanvas.resetView) leftCanvas.resetView()
    }
  },

  onToggleSync() {
    const newMode = !this.data.syncMode
    this.setData({ syncMode: newMode })
    if (newMode) {
      this.onAlignViews()
    }
  },

  onAlignViews() {
    const left = this.selectComponent('#compareLeft')
    const right = this.selectComponent('#compareRight')
    if (left && right) {
      const leftState = left.getViewState()
      if (leftState) {
        right.applyViewState(leftState)
        wx.showToast({ title: '视角已对齐', icon: 'success', duration: 1000 })
      }
    }
  },

  onAlignStyle() {
    const prefix = 'left'
    const keys = [
      'ModelType', 'StickRadius', 'ShowAtoms', 'ShowBonds',
      'ShowAxes', 'ShowHydrogenBonds', 'ShowLatticePoints', 'ShowAtomLabels',
      'ShowInterstices', 'ShowOctahedral', 'ShowTetrahedral',
      'ShowAuxiliaryBody', 'ShowAuxiliaryFace', 'AtomScale', 'Opacity',
      'CellDisplayMode'
    ]
    const updates = {}
    for (const key of keys) {
      updates['right' + key] = this.data['left' + key]
    }
    updates.rightAtomVisibility = { ...this.data.leftAtomVisibility }
    updates.rightEquivalentIndex = this.data.leftEquivalentIndex
    updates.rightFractionalShift = [...this.data.leftFractionalShift]
    this.setData(updates)
    wx.showToast({ title: '样式已对齐', icon: 'success', duration: 1000 })
  },

  // ==================== 设置面板 ====================

  onToggleSettings() {
    this.setData({ settingsExpanded: !this.data.settingsExpanded })
  },

  // ==================== 左侧设置变更 ====================

  onLeftModelChange(e) {
    const type = e.currentTarget.dataset.type
    if (type && type !== this.data.leftModelType) {
      this.setData({ leftModelType: type })
    }
  },
  onLeftToggle(e) {
    const layer = e.currentTarget.dataset.layer
    const key = 'leftShow' + layer
    const newVal = !this.data[key]
    const update = { [key]: newVal }
    if (layer === 'Octahedral') {
      update.leftShowInterstices = newVal
    }
    if (layer === 'Tetrahedral') {
      update.leftShowInterstices = newVal
    }
    // 点阵型式开启时自动隐藏原子和标签
    if (layer === 'LatticePoints') {
      if (newVal) {
        update.leftShowAtoms = false
        update.leftShowAtomLabels = false
      } else {
        update.leftShowAtoms = true
      }
    }
    // 原子关闭时自动隐藏标签
    if (layer === 'Atoms' && !newVal) {
      update.leftShowAtomLabels = false
    }
    this.setData(update)
  },
  onLeftCellDisplayModeTap(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode !== this.data.leftCellDisplayMode) {
      this.setData({ leftCellDisplayMode: mode })
    }
  },
  onLeftElementToggle(e) {
    const element = e.currentTarget.dataset.element
    const vis = { ...this.data.leftAtomVisibility }
    vis[element] = !vis[element]
    this.setData({ leftAtomVisibility: vis })
  },

  // ==================== 右侧设置变更 ====================

  onRightModelChange(e) {
    const type = e.currentTarget.dataset.type
    if (type && type !== this.data.rightModelType) {
      this.setData({ rightModelType: type })
    }
  },
  onRightToggle(e) {
    const layer = e.currentTarget.dataset.layer
    const key = 'rightShow' + layer
    const newVal = !this.data[key]
    const update = { [key]: newVal }
    if (layer === 'Octahedral') {
      update.rightShowInterstices = newVal
    }
    if (layer === 'Tetrahedral') {
      update.rightShowInterstices = newVal
    }
    // 点阵型式开启时自动隐藏原子和标签
    if (layer === 'LatticePoints') {
      if (newVal) {
        update.rightShowAtoms = false
        update.rightShowAtomLabels = false
      } else {
        update.rightShowAtoms = true
      }
    }
    // 原子关闭时自动隐藏标签
    if (layer === 'Atoms' && !newVal) {
      update.rightShowAtomLabels = false
    }
    this.setData(update)
  },
  onRightCellDisplayModeTap(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode !== this.data.rightCellDisplayMode) {
      this.setData({ rightCellDisplayMode: mode })
    }
  },
  onRightElementToggle(e) {
    const element = e.currentTarget.dataset.element
    const vis = { ...this.data.rightAtomVisibility }
    vis[element] = !vis[element]
    this.setData({ rightAtomVisibility: vis })
  },

  onPartialAtomsToggle() {
    this.setData({ partialAtoms: !this.data.partialAtoms })
  },

  onLeftEquivalentSettingChange(e) {
    const idx = e.currentTarget.dataset.index
    const settings = this.data.equivalentSettings
    if (idx == null || idx >= settings.length) return
    this.setData({
      leftEquivalentIndex: idx,
      leftFractionalShift: settings[idx].shift || [0, 0, 0]
    })
  },

  onRightEquivalentSettingChange(e) {
    const idx = e.currentTarget.dataset.index
    const settings = this.data.equivalentSettings
    if (idx == null || idx >= settings.length) return
    this.setData({
      rightEquivalentIndex: idx,
      rightFractionalShift: settings[idx].shift || [0, 0, 0]
    })
  },

  onAtomLabelsToggle() {
    this.setData({ showAtomLabels: !this.data.showAtomLabels })
  },

  // ==================== 通用 ====================

  onAtomTap(e) {
    const { element } = e.detail
    if (element) {
      wx.showToast({ title: element, icon: 'none', duration: 800 })
    }
  },

  onBack() {
    wx.navigateBack()
  }
})
