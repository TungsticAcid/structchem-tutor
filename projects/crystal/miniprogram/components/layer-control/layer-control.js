/**
 * 图层控制面板组件
 * 提供图层开关、原子大小滑块、透明度滑块和预设视角按钮
 */
Component({
  properties: {
    showAtoms: { type: Boolean, value: true },
    showWireframe: { type: Boolean, value: true },
    showInterstices: { type: Boolean, value: false },
    showOctahedral: { type: Boolean, value: false },
    showTetrahedral: { type: Boolean, value: false },
    showSymmetry: { type: Boolean, value: false },
    showBonds: { type: Boolean, value: false },
    showAxes: { type: Boolean, value: true },
    showAuxiliaryBody: { type: Boolean, value: false },
    showAuxiliaryFace: { type: Boolean, value: false },
    auxiliaryLineAboveAtoms: { type: Boolean, value: false },
    modelType: { type: String, value: 'ballStick' },
    cellDisplayMode: { type: String, value: 'conventional' },
    partialAtoms: { type: Boolean, value: false },
    crystalMeta: { type: Object, value: null },
    /** 晶体原始数据（含 atoms 列表，用于元素独立开关渲染） */
    crystalData: { type: Object, value: null },
    /** 是否显示空隙控制（仅A1-A4教学堆积） */
    showIntersticeControl: { type: Boolean, value: false },
    /** 各元素可见性 */
    atomVisibility: { type: Object, value: {} },
    /** 原子名称标签显示 */
    showAtomLabels: { type: Boolean, value: false },
    /** 是否为分子晶体（无化学键开关，默认开启） */
    isMolecularCrystal: { type: Boolean, value: false },
    /** 氢键显示开关 */
    showHydrogenBonds: { type: Boolean, value: true },
    /** 是否有氢键（决定是否显示氢键开关） */
    hasHydrogenBonds: { type: Boolean, value: false },
    /** 点阵型式图层开关 */
    showLatticePoints: { type: Boolean, value: false },
    /** 是否正交晶胞（α=β=γ=90°） */
    isOrthogonalCell: { type: Boolean, value: true },
    /** 变换晶胞原点选项列表 */
    equivalentSettings: { type: Array, value: [] },
    /** 当前变换晶胞原点索引 */
    equivalentIndex: { type: Number, value: 0 }
  },

  data: {
    expanded: true,
    elementsExpanded: false
  },

  methods: {
    togglePanel() {
      this.setData({ expanded: !this.data.expanded })
    },

    onToggle(e) {
      const layer = e.currentTarget.dataset.layer
      const value = e.detail.value
      this.triggerEvent('layerchange', { layer, value })
    },

    onToggleElements() {
      this.setData({ elementsExpanded: !this.data.elementsExpanded })
    },

    onAtomLabelsToggle(e) {
      this.triggerEvent('atomlabelstoggle', { value: e.detail.value })
    },

    onAtomVisibilityToggle(e) {
      const element = e.currentTarget.dataset.element
      const value = e.detail.value
      this.triggerEvent('atomvisibilitychange', { element, value })
    },

    onReset() {
      this.triggerEvent('viewchange', { view: 'reset' })
    },

    onModelTypeTap(e) {
      const type = e.currentTarget.dataset.type
      if (type !== this.properties.modelType) {
        this.triggerEvent('modeltypechange', { value: type })
      }
    },

    onCellModeTap(e) {
      const mode = e.currentTarget.dataset.mode
      if (mode !== this.properties.cellDisplayMode) {
        this.triggerEvent('celldisplaymodechange', { value: mode })
      }
    },

    onAuxiliaryAboveToggle(e) {
      this.triggerEvent('auxiliaryabovetoggle', { value: e.detail.value })
    },

    onPartialAtomsToggle(e) {
      this.triggerEvent('partialatomschange', { value: e.detail.value })
    },

    onLatticePointsToggle(e) {
      const value = e.detail.value
      this.triggerEvent('layerchange', { layer: 'latticePoints', value })
    },

    onEquivalentTap(e) {
      const idx = parseInt(e.currentTarget.dataset.index)
      if (idx !== this.properties.equivalentIndex) {
        this.triggerEvent('equivalentsettingchange', { index: idx })
      }
    }
  }
})
