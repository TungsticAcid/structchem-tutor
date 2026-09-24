/**
 * 3D 查看器页面
 * 组合 viewer-canvas、layer-control 和 atom-info-popup 组件
 */
const elementsData = require('../../data/elements.js')
const { getCrystalData } = require('../../lib/crystal-loader')

/** 将小数分数坐标转为分数字符串 */
function formatFrac(val) {
  if (val == null) return '0'
  const sign = val < 0 ? -1 : 1
  let v = Math.abs(val)
  const commonDens = [1, 2, 3, 4, 6, 8, 12]
  for (const d of commonDens) {
    for (let n = 0; n <= d; n++) {
      if (Math.abs(v - n / d) < 0.005) {
        const prefix = sign < 0 ? '-' : ''
        if (n === 0) return '0'
        if (n === d) return prefix + '1'
        return prefix + n + '/' + d
      }
    }
  }
  return (sign < 0 ? '-' : '') + v.toFixed(3)
}

/** 将坐标数组转为分数字符串 */
function formatPosition(pos) {
  if (!pos || pos.length < 3) return ''
  // 归一化到 [0, 1) 范围
  const nx = ((pos[0] % 1) + 1) % 1
  const ny = ((pos[1] % 1) + 1) % 1
  const nz = ((pos[2] % 1) + 1) % 1
  return '(' + formatFrac(nx) + ', ' + formatFrac(ny) + ', ' + formatFrac(nz) + ')'
}

/** 格式化晶胞参数文本——长度和角度始终显示，相等值用等号连接 */
function formatLatticeConstText(crystalSystem, lattice) {
  if (!lattice) return ''
  // 长度统一保留 2 位小数
  const fmt = v => v.toFixed(2)
  const fmtAng = v => v.toFixed(1).replace(/\.0$/, '') + '°'
  const a = fmt(lattice.a), b = fmt(lattice.b), c = fmt(lattice.c)
  const alpha = fmtAng(lattice.alpha), beta = fmtAng(lattice.beta), gamma = fmtAng(lattice.gamma)

  // 长度部分：相等值用等号连接
  const abEq = Math.abs(lattice.a - lattice.b) < 0.001
  const acEq = Math.abs(lattice.a - lattice.c) < 0.001
  const bcEq = Math.abs(lattice.b - lattice.c) < 0.001
  let lenPart
  if (abEq && acEq) {
    lenPart = 'a=b=c=' + a + ' Å'
  } else if (abEq) {
    lenPart = 'a=b=' + a + ' Å, c=' + c + ' Å'
  } else if (acEq) {
    lenPart = 'a=c=' + a + ' Å, b=' + b + ' Å'
  } else if (bcEq) {
    lenPart = 'a=' + a + ' Å, b=c=' + b + ' Å'
  } else {
    lenPart = 'a=' + a + ' Å, b=' + b + ' Å, c=' + c + ' Å'
  }

  // 角度部分：始终显示，相等值用等号连接
  const alBeEq = Math.abs(lattice.alpha - lattice.beta) < 0.1
  const alGaEq = Math.abs(lattice.alpha - lattice.gamma) < 0.1
  const beGaEq = Math.abs(lattice.beta - lattice.gamma) < 0.1
  let angPart
  if (alBeEq && alGaEq) {
    angPart = 'α=β=γ=' + fmtAng(lattice.alpha)
  } else if (alBeEq) {
    angPart = 'α=β=' + fmtAng(lattice.alpha) + ', γ=' + gamma
  } else if (alGaEq) {
    angPart = 'α=γ=' + fmtAng(lattice.alpha) + ', β=' + beta
  } else if (beGaEq) {
    angPart = 'α=' + alpha + ', β=γ=' + beta
  } else {
    angPart = 'α=' + alpha + ', β=' + beta + ', γ=' + gamma
  }

  return lenPart + ', ' + angPart
}

/** 晶系中英文映射 */
const CRYSTAL_SYSTEM_MAP = {
  'cubic': '立方',
  'hexagonal': '六方',
  'tetragonal': '四方',
  'orthorhombic': '正交',
  'monoclinic': '单斜',
  'triclinic': '三斜',
  'trigonal': '三方'
}

/** A1-A4 教学堆积结构的晶体ID，这些结构显示空隙开关 */
const TEACHING_STACKING_IDS = ['fcc', 'hcp']

Page({
  data: {
    /** 当前晶体ID */
    crystalId: '',
    /** 当前晶体数据 */
    crystalData: null,
    /** 图层状态 */
    showAtoms: true,
    showWireframe: true,
    showInterstices: false,
    showOctahedral: false,
    showTetrahedral: false,
    showSymmetry: false,
    showBonds: false,
    showAxes: true,
    showAuxiliaryBody: false,
    showAuxiliaryFace: false,
    auxiliaryLineAboveAtoms: false,
    atomScale: 1.0,
    opacity: 0.0,
    /** 模型类型: cpk | ballStick */
    modelType: 'ballStick',
    /** 球棍粗细 */
    stickRadius: 0.08,
    /** 晶胞类型模式: conventional | primitive */
    cellDisplayMode: 'conventional',
    depthFog: false,
    fractionalShift: [0, 0, 0],
    partialAtoms: false,
    /** 投影模式固定为正交投影 */
    projection: 'orthographic',
    lightConfig: [
      { id: 'ambient', type: 'ambient', color: '#404060', intensity: 0.6 },
      { id: 'key', type: 'directional', color: '#ffffff', intensity: 0.8, posX: 5, posY: 8, posZ: 5 },
      { id: 'fill', type: 'directional', color: '#8888ff', intensity: 0.3, posX: -3, posY: -1, posZ: -3 },
      { id: 'rim', type: 'directional', color: '#ff8888', intensity: 0.2, posX: 0, posY: 0, posZ: -5 }
    ],
    /** 各元素可见性: { 'Na': true, 'Cl': false, ... } */
    atomVisibility: {},
    /** 原子名称标签显示 */
    showAtomLabels: false,
    /** 是否显示空隙控制（仅A1/A3堆积结构） */
    showIntersticeControl: false,
    /** 是否为分子晶体（化学键默认开启且不可关闭） */
    isMolecularCrystal: false,
    /** 是否有氢键 */
    hasHydrogenBonds: false,
    /** 氢键显示开关 */
    showHydrogenBonds: true,
    /** 点阵型式图层开关 */
    showLatticePoints: false,
    /** 变换晶胞原点选项 */
    equivalentSettings: [],
    /** 当前变换晶胞原点索引 */
    equivalentIndex: 0,
    /** 晶体元信息（晶系、空间群等） */
    crystalMeta: null,
    /** 弹窗状态 */
    popupVisible: false,
    popupData: null,
    /** 是否正交晶胞（α=β=γ=90°），允许裁剪 */
    isOrthogonalCell: true
  },

  onLoad(options) {
    const crystalId = options.crystal || 'fcc'
    this.setData({ crystalId })
    this._loadCrystalMeta(crystalId)
  },

  onReady() {
    // 页面就绪
  },

  onUnload() {
    // 页面卸载，viewer-canvas 的 detached 会自动清理
  },

  /** 加载晶体元数据（用于控制面板显示和弹窗） */
  _loadCrystalMeta(crystalId) {
    const data = getCrystalData(crystalId)
    if (data) {
      const lattice = data.lattice

      // 初始化各元素可见性
      const atomVisibility = {}
      if (data.atoms) {
        for (const group of data.atoms) {
          atomVisibility[group.element] = true
        }
      }

      // 判断是否显示空隙控制（仅A1/A3堆积结构）
      const showIntersticeControl = TEACHING_STACKING_IDS.includes(crystalId)

      // 分子晶体：化学键默认开启且不可关闭
      const MOLECULAR_CRYSTAL_IDS = ['co2', 'ice', 'i2', 'urea']
      const isMolecularCrystal = MOLECULAR_CRYSTAL_IDS.includes(crystalId)
      // 金属晶体默认不显示键，分子晶体默认显示，其余非分子晶体默认显示
      const METAL_CRYSTAL_IDS = ['fcc', 'bcc', 'hcp']
      const isMetalCrystal = METAL_CRYSTAL_IDS.includes(crystalId)
      const showBonds = isMolecularCrystal ? true : (isMetalCrystal ? false : true)
      // 检测是否有氢键
      const hasHydrogenBonds = isMolecularCrystal && data.hydrogenBonds && data.hydrogenBonds.length > 0
      // 仅正交晶胞（α=β=γ=90°）允许裁剪
      const isOrthogonalCell = lattice && lattice.alpha === 90 && lattice.beta === 90 && lattice.gamma === 90

      this.setData({
        crystalData: data,
        atomVisibility,
        showIntersticeControl,
        showInterstices: false,
        showBonds,
        isMolecularCrystal,
        hasHydrogenBonds,
        isOrthogonalCell,
        equivalentSettings: data.equivalentSettings || [],
        equivalentIndex: 0,
        fractionalShift: data.equivalentSettings && data.equivalentSettings.length > 0
          ? (data.equivalentSettings[0].shift || [0, 0, 0]) : [0, 0, 0],
        crystalMeta: {
          name: data.name || '',
          crystalSystem: CRYSTAL_SYSTEM_MAP[data.crystalSystem] || data.crystalSystem || '',
          crystalSystemRaw: data.crystalSystem || '',
          spaceGroup: data.spaceGroup || '',
          formula: data.formula || '',
          latticeType: data.latticeType || '',
          structuralUnit: data.structuralUnit || '',
          coordination: data.coordination || '',
          spaceUtilization: data.spaceUtilization || '',
          packingDescription: data.packingDescription || '',
          latticeConst: lattice ? {
            a: lattice.a, b: lattice.b, c: lattice.c,
            alpha: lattice.alpha, beta: lattice.beta, gamma: lattice.gamma
          } : null,
          latticeConstText: lattice ? formatLatticeConstText(data.crystalSystem, lattice) : ''
        }
      })
    }
  },

  /** 图层开关变化 */
  onLayerChange(e) {
    const { layer, value } = e.detail
    const layerMap = {
      atoms: 'showAtoms',
      wireframe: 'showWireframe',
      interstices: 'showInterstices',
      octahedral: 'showOctahedral',
      tetrahedral: 'showTetrahedral',
      symmetry: 'showSymmetry',
      bonds: 'showBonds',
      hydrogenBonds: 'showHydrogenBonds',
      latticePoints: 'showLatticePoints',
      axes: 'showAxes',
      auxiliaryBody: 'showAuxiliaryBody',
      auxiliaryFace: 'showAuxiliaryFace'
    }
    const key = layerMap[layer]
    if (key) {
      const update = { [key]: value }
      // 点阵型式开启时自动隐藏原子和标签
      if (layer === 'latticePoints') {
        if (value) {
          update.showAtoms = false
          update.showAtomLabels = false
        } else {
          update.showAtoms = true
        }
      }
      // 原子关闭时自动隐藏标签
      if (layer === 'atoms' && !value) {
        update.showAtomLabels = false
      }
      this.setData(update)
    }
  },

  /** 单元素可见性切换 */
  onAtomVisibilityChange(e) {
    const { element, value } = e.detail
    const atomVisibility = { ...this.data.atomVisibility, [element]: value }
    this.setData({ atomVisibility })
  },

  /** 原子大小变化 */
  onScaleChange(e) {
    this.setData({ atomScale: e.detail.value })
  },

  /** 透明度变化 */
  onOpacityChange(e) {
    this.setData({ opacity: e.detail.value })
  },

  /** 视角变化 */
  onViewChange(e) {
    const canvas = this.selectComponent('#viewerCanvas')
    if (canvas) {
      if (e.detail.view === 'reset') {
        canvas.resetView()
      } else {
        canvas.setView(e.detail.view)
      }
    }
  },

  /** 原子被点击 */
  onAtomTap(e) {
    const { element, position } = e.detail
    const elemInfo = elementsData[element] || {}

    this.setData({
      popupVisible: true,
      popupData: {
        element: element,
        name: elemInfo.name || element,
        enName: elemInfo.enName || '',
        color: elemInfo.color || '#fff',
        atomicNumber: elemInfo.atomicNumber || '',
        atomicMass: elemInfo.atomicMass || '',
        electronConfig: elemInfo.electronConfig || '',
        electronegativity: elemInfo.electronegativity || '',
        radius: elemInfo.radius || '',
        position: formatPosition(position)
      }
    })
  },

  /** 空隙被点击 */
  onVoidTap(e) {
    const { type, position } = e.detail
    const voidNameMap = {
      'octahedral': '八面体空隙',
      'tetrahedral': '四面体空隙'
    }

    this.setData({
      popupVisible: true,
      popupData: {
        isVoid: true,
        voidType: type,
        voidName: voidNameMap[type] || type,
        position: formatPosition(position)
      }
    })
  },

  /** 点阵点被点击 */
  onLatticePointTap(e) {
    const { position, latticeTypeName } = e.detail
    this.setData({
      popupVisible: true,
      popupData: {
        isLatticePoint: true,
        latticeTypeName: latticeTypeName || '',
        position: formatPosition(position)
      }
    })
  },

  /** 原子信息弹窗关闭 */
  onPopupClose() {
    this.setData({ popupVisible: false })
  },

  /** 模型类型变化 */
  onModelTypeChange(e) {
    this.setData({ modelType: e.detail.value })
  },

  /** 棍粗细变化 */
  onStickRadiusChange(e) {
    this.setData({ stickRadius: e.detail.value })
  },

  /** 晶胞类型模式变化（惯用晶胞 / 素晶胞） */
  onCellDisplayModeChange(e) {
    this.setData({ cellDisplayMode: e.detail.value })
  },

  /** 透明度变化 */
  onOpacityChangeHandler(e) {
    this.setData({ opacity: e.detail.value })
  },

  /** 深度雾化切换 */
  onDepthFogChange(e) {
    this.setData({ depthFog: e.detail.value })
  },

  /** 原子平移变化 */
  onFractionalShiftChange(e) {
    this.setData({ fractionalShift: e.detail.value })
  },

  /** 部分原子显示变化 */
  onPartialAtomsChange(e) {
    this.setData({ partialAtoms: e.detail.value })
  },

  /** 变换晶胞原点 */
  onEquivalentSettingChange(e) {
    const idx = e.detail.index
    const settings = this.data.equivalentSettings
    if (idx >= 0 && idx < settings.length) {
      this.setData({
        equivalentIndex: idx,
        fractionalShift: settings[idx].shift || [0, 0, 0]
      })
    }
  },

  /** 灯光配置变化 */
  onLightConfigChange(e) {
    this.setData({ lightConfig: e.detail.value })
  },

  /** 原子标签开关 */
  onAtomLabelsToggle(e) {
    this.setData({ showAtomLabels: e.detail.value })
  },

  /** 辅助线显示在原子上方切换 */
  onAuxiliaryAboveChange(e) {
    this.setData({ auxiliaryLineAboveAtoms: e.detail.value })
  },

  /** 跳转到对比页面 */
  onCompare() {
    const app = getApp()
    const preset = {
      showAtoms: this.data.showAtoms,
      showWireframe: this.data.showWireframe,
      showBonds: this.data.showBonds,
      showAxes: this.data.showAxes,
      showSymmetry: this.data.showSymmetry,
      showInterstices: this.data.showInterstices,
      showOctahedral: this.data.showOctahedral,
      showTetrahedral: this.data.showTetrahedral,
      showAuxiliaryBody: this.data.showAuxiliaryBody,
      showAuxiliaryFace: this.data.showAuxiliaryFace,
      atomScale: this.data.atomScale,
      opacity: this.data.opacity,
      cellDisplayMode: this.data.cellDisplayMode,
      projection: this.data.projection,
      stickRadius: this.data.stickRadius,
      partialAtoms: this.data.partialAtoms,
      modelType: this.data.modelType,
      atomVisibility: this.data.atomVisibility,
      showAtomLabels: this.data.showAtomLabels,
      equivalentIndex: this.data.equivalentIndex,
      fractionalShift: this.data.fractionalShift
    }
    const canvas = this.selectComponent('#viewerCanvas')
    if (canvas) {
      const vs = canvas.getViewState()
      if (vs) {
        preset.viewState = {
          theta: vs.theta,
          phi: vs.phi,
          crystalQuat: vs.crystalQuat || { x: 0, y: 0, z: 0, w: 1 }
        }
      }
    }
    app.globalData.comparePreset = preset
    wx.navigateTo({
      url: '/pages/compare/compare?crystal=' + this.data.crystalId
    })
  },

  /** 返回首页 */
  onBack() {
    wx.navigateBack()
  }
})
