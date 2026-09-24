/**
 * 全局设置页面
 * 支持元素颜色自定义（网格视图 & 周期表视图）
 */
const elementsData = require('../../data/elements.js')
const { getElementColorOverrides, setElementColor, resetElementColors, getAllVisualColors, setVisualColor, resetVisualColors } = require('../../data/settings.js')

/** 视觉颜色配置项 */
const VISUAL_COLOR_KEYS = [
  { key: 'bgColor', label: '背景颜色' },
  { key: 'wireframeColor', label: '晶胞线框颜色' },
  { key: 'octahedralColor', label: '八面体空隙颜色' },
  { key: 'tetrahedralColor', label: '四面体空隙颜色' },
  { key: 'latticePointColor', label: '点阵点颜色' },
  { key: 'auxiliaryLineBodyColor', label: '体对角线颜色' },
  { key: 'auxiliaryLineFaceColor', label: '面对角线颜色' },
  { key: 'hydrogenBondColor', label: '氢键颜色' }
]

/** 预设颜色选项 */
const PRESET_COLORS = [
  '#EA4335', '#FBBC04', '#34A853', '#4285F4', '#8E24AA',
  '#FF6D00', '#00ACC1', '#7CB342', '#1E88E5', '#D81B60',
  '#6D4C41', '#546E7A', '#F4511E', '#43A047', '#8E24AA',
  '#ffffff', '#cccccc', '#888888', '#444444', '#000000'
]

/** 元素在周期表中的位置 {symbol: [row, col]} */
const PT_POS = {
  // Row 1
  'H':  [1, 1], 'He': [1, 18],
  // Row 2
  'Li': [2, 1], 'Be': [2, 2], 'B':  [2, 13], 'C':  [2, 14], 'N':  [2, 15],
  'O':  [2, 16], 'F':  [2, 17], 'Ne': [2, 18],
  // Row 3
  'Na': [3, 1], 'Mg': [3, 2], 'Al': [3, 13], 'Si': [3, 14], 'P':  [3, 15],
  'S':  [3, 16], 'Cl': [3, 17], 'Ar': [3, 18],
  // Row 4
  'K':  [4, 1], 'Ca': [4, 2], 'Sc': [4, 3], 'Ti': [4, 4], 'V':  [4, 5],
  'Cr': [4, 6], 'Mn': [4, 7], 'Fe': [4, 8], 'Co': [4, 9], 'Ni': [4, 10],
  'Cu': [4, 11], 'Zn': [4, 12], 'Ga': [4, 13], 'Ge': [4, 14], 'As': [4, 15],
  'Se': [4, 16], 'Br': [4, 17], 'Kr': [4, 18],
  // Row 5
  'Rb': [5, 1], 'Sr': [5, 2], 'Y':  [5, 3], 'Zr': [5, 4], 'Nb': [5, 5],
  'Mo': [5, 6], 'Tc': [5, 7], 'Ru': [5, 8], 'Rh': [5, 9], 'Pd': [5, 10],
  'Ag': [5, 11], 'Cd': [5, 12], 'In': [5, 13], 'Sn': [5, 14], 'Sb': [5, 15],
  'Te': [5, 16], 'I':  [5, 17], 'Xe': [5, 18],
  // Row 6
  'Cs': [6, 1], 'Ba': [6, 2], 'La': [6, 3], 'Hf': [6, 4], 'Ta': [6, 5],
  'W':  [6, 6], 'Re': [6, 7], 'Os': [6, 8], 'Ir': [6, 9], 'Pt': [6, 10],
  'Au': [6, 11], 'Hg': [6, 12], 'Tl': [6, 13], 'Pb': [6, 14], 'Bi': [6, 15],
  'Po': [6, 16], 'At': [6, 17], 'Rn': [6, 18],
  // Row 7
  'Fr': [7, 1], 'Ra': [7, 2], 'Ac': [7, 3], 'Rf': [7, 4], 'Db': [7, 5],
  'Sg': [7, 6], 'Bh': [7, 7], 'Hs': [7, 8], 'Mt': [7, 9], 'Ds': [7, 10],
  'Rg': [7, 11], 'Cn': [7, 12], 'Nh': [7, 13], 'Fl': [7, 14], 'Mc': [7, 15],
  'Lv': [7, 16], 'Ts': [7, 17], 'Og': [7, 18],
  // Lanthanides (row 8, cols 3-17)
  'Ce': [8, 3], 'Pr': [8, 4], 'Nd': [8, 5], 'Pm': [8, 6], 'Sm': [8, 7],
  'Eu': [8, 8], 'Gd': [8, 9], 'Tb': [8, 10], 'Dy': [8, 11], 'Ho': [8, 12],
  'Er': [8, 13], 'Tm': [8, 14], 'Yb': [8, 15], 'Lu': [8, 16],
  // Actinides (row 9, cols 3-17)
  'Th': [9, 3], 'Pa': [9, 4], 'U':  [9, 5], 'Np': [9, 6], 'Pu': [9, 7],
  'Am': [9, 8], 'Cm': [9, 9], 'Bk': [9, 10], 'Cf': [9, 11], 'Es': [9, 12],
  'Fm': [9, 13], 'Md': [9, 14], 'No': [9, 15], 'Lr': [9, 16]
}

/** 周期表列标签（IUPAC 1-18族） */
const PT_GROUP_LABELS = ['1', '2', '', '', '', '', '', '', '', '', '', '', '13', '14', '15', '16', '17', '18']

Page({
  data: {
    /** 元素颜色列表 [{symbol, name, defaultColor, currentColor, hasOverride}] */
    elements: [],
    /** 视图模式: 'grid' | 'periodicTable' */
    viewMode: 'grid',
    /** 周期表数据：二维数组 row→col→element或null */
    ptGrid: [],
    /** 族标签 */
    ptGroupLabels: PT_GROUP_LABELS,
    /** 颜色选择器状态 */
    pickerVisible: false,
    pickerElement: null,
    pickerVisualKey: '',
    pickerVisualLabel: '',  // 视觉颜色弹窗标题
    presetColors: PRESET_COLORS,
    customColor: '',
    visualColors: []       // [{key, label, color}]
  },

  onShow() {
    this._loadElements()
    this._loadVisualColors()
  },

  /** 加载视觉颜色设置 */
  _loadVisualColors() {
    const allColors = getAllVisualColors()
    const visualColors = VISUAL_COLOR_KEYS.map(item => ({
      ...item,
      color: allColors[item.key] || '#cccccc'
    }))
    this.setData({ visualColors })
  },

  /** 加载元素列表及颜色覆盖 */
  _loadElements() {
    const overrides = getElementColorOverrides()
    const list = Object.entries(elementsData).map(([symbol, data]) => ({
      symbol,
      name: data.name,
      defaultColor: data.color,
      currentColor: overrides[symbol] || data.color,
      hasOverride: !!overrides[symbol]
    }))
    this.setData({
      elements: list,
      ptGrid: this._buildPtGrid(list)
    })
  },

  /** 构建周期表二维网格 */
  _buildPtGrid(elements) {
    const elemMap = {}
    for (const el of elements) {
      elemMap[el.symbol] = el
    }
    // 9行 × 18列
    const grid = []
    for (let r = 1; r <= 9; r++) {
      const row = []
      for (let c = 1; c <= 18; c++) {
        row.push(null)
      }
      grid.push(row)
    }
    for (const el of elements) {
      const pos = PT_POS[el.symbol]
      if (pos) {
        grid[pos[0] - 1][pos[1] - 1] = el
      }
    }
    return grid
  },

  /** 切换视图模式 */
  onToggleView() {
    const next = this.data.viewMode === 'grid' ? 'periodicTable' : 'grid'
    this.setData({ viewMode: next })
  },

  /** 点击元素打开颜色选择器 */
  onElementTap(e) {
    const symbol = e.currentTarget.dataset.symbol
    const item = this.data.elements.find(el => el.symbol === symbol)
    this.setData({
      pickerVisible: true,
      pickerElement: symbol,
      pickerVisualKey: '',
      pickerVisualLabel: '',
      customColor: item ? item.currentColor : '#cccccc'
    })
  },

  /** 选择预设颜色 */
  onPresetColorTap(e) {
    const color = e.currentTarget.dataset.color
    this._applyColor(color)
  },

  /** 自定义颜色输入 */
  onCustomColorInput(e) {
    this.setData({ customColor: e.detail.value })
  },

  /** 应用自定义颜色 */
  onCustomColorApply() {
    const color = this.data.customColor.trim()
    if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
      this._applyColor(color)
    } else {
      wx.showToast({ title: '请输入有效的十六进制颜色 (#RRGGBB)', icon: 'none' })
    }
  },

  /** 点击视觉颜色行打开选择器 */
  onVisualColorTap(e) {
    const { key, label } = e.currentTarget.dataset
    const item = this.data.visualColors.find(v => v.key === key)
    this.setData({
      pickerVisible: true,
      pickerElement: null,
      pickerVisualKey: key,
      pickerVisualLabel: label,
      customColor: item ? item.color : '#cccccc'
    })
  },

  /** 重置单个视觉颜色 */
  onResetVisualColor() {
    const key = this.data.pickerVisualKey
    if (!key) return
    setVisualColor(key, '')
    this.setData({ pickerVisible: false, pickerVisualKey: '', pickerVisualLabel: '' })
    this._loadVisualColors()
    wx.showToast({ title: '视觉颜色已重置', icon: 'success', duration: 1000 })
  },

  /** 重置所有视觉颜色 */
  onResetAllVisualColors() {
    wx.showModal({
      title: '重置视觉颜色',
      content: '确定要恢复所有视觉元素的默认颜色吗？',
      success: (res) => {
        if (res.confirm) {
          resetVisualColors()
          this._loadVisualColors()
          wx.showToast({ title: '已恢复默认视觉颜色', icon: 'success' })
        }
      }
    })
  },

  /** 应用颜色到选中元素或视觉颜色 */
  _applyColor(color) {
    // 视觉颜色模式
    if (this.data.pickerVisualKey) {
      const key = this.data.pickerVisualKey
      setVisualColor(key, color)
      this.setData({ pickerVisible: false, pickerVisualKey: '', pickerVisualLabel: '' })
      this._loadVisualColors()
      wx.showToast({ title: '视觉颜色已更新', icon: 'success', duration: 1000 })
      return
    }
    // 元素颜色模式
    const symbol = this.data.pickerElement
    if (!symbol) return
    setElementColor(symbol, color)
    this.setData({ pickerVisible: false, pickerElement: null })
    this._loadElements()
    wx.showToast({ title: `${symbol} 颜色已更新`, icon: 'success', duration: 1000 })
  },

  /** 重置单个元素颜色 */
  onResetElement(e) {
    const symbol = e.currentTarget.dataset.symbol
    setElementColor(symbol, '')  // 空字符串清除覆盖
    this._loadElements()
    wx.showToast({ title: `${symbol} 颜色已重置`, icon: 'success', duration: 1000 })
  },

  /** 重置所有颜色 */
  onResetAll() {
    wx.showModal({
      title: '重置所有颜色',
      content: '确定要恢复所有元素的默认颜色吗？',
      success: (res) => {
        if (res.confirm) {
          resetElementColors()
          this._loadElements()
          wx.showToast({ title: '已恢复默认颜色', icon: 'success' })
        }
      }
    })
  },

  /** 关闭颜色选择器 */
  onPickerClose(e) {
    // 仅在点击遮罩层本身（而非弹窗内容）时关闭
    if (e && e.target !== e.currentTarget) return
    this.setData({ pickerVisible: false, pickerElement: null, pickerVisualKey: '', pickerVisualLabel: '' })
  },

  /** 阻止点击事件冒泡到遮罩层（空操作） */
  preventTap() {},

  /** 返回 */
  onBack() {
    wx.navigateBack()
  }
})
