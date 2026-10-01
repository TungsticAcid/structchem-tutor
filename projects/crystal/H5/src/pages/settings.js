/**
 * 全局设置页面 (H5)
 * 元素颜色自定义 + 视觉颜色设置
 */
import elementsData from '../data/elements.js'
import {
  getElementColorOverrides, setElementColor, resetElementColors,
  getAllVisualColors, setVisualColor, resetVisualColors
} from '../data/settings.js'
import { router } from '../adapters/router.js'
// ★ 相对路径而不是 `@i18n/index.js` 别名：本文件同时被统一壳（有别名）与
//   `projects/crystal/H5` 独立页（**没有**别名）引用，只有相对路径两边都认。
import { t, tsrc } from '../../../../../packages/i18n/index.js'

/** 「周期表 / 列表」切换按钮上的字（提到模板串外面，扫描替换才够得着，见 HOWTO §4） */
const VIEW_MODE_LABELS = { grid: '周期表', list: '列表' }

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

const PRESET_COLORS = [
  '#EA4335', '#FBBC04', '#34A853', '#4285F4', '#8E24AA',
  '#FF6D00', '#00ACC1', '#7CB342', '#1E88E5', '#D81B60',
  '#6D4C41', '#546E7A', '#F4511E', '#43A047', '#8E24AA',
  '#ffffff', '#cccccc', '#888888', '#444444', '#000000'
]

const PT_POS = {
  'H':[1,1],'He':[1,18],'Li':[2,1],'Be':[2,2],'B':[2,13],'C':[2,14],'N':[2,15],'O':[2,16],'F':[2,17],'Ne':[2,18],
  'Na':[3,1],'Mg':[3,2],'Al':[3,13],'Si':[3,14],'P':[3,15],'S':[3,16],'Cl':[3,17],'Ar':[3,18],
  'K':[4,1],'Ca':[4,2],'Sc':[4,3],'Ti':[4,4],'V':[4,5],'Cr':[4,6],'Mn':[4,7],'Fe':[4,8],'Co':[4,9],'Ni':[4,10],'Cu':[4,11],'Zn':[4,12],'Ga':[4,13],'Ge':[4,14],'As':[4,15],'Se':[4,16],'Br':[4,17],'Kr':[4,18],
  'Rb':[5,1],'Sr':[5,2],'Y':[5,3],'Zr':[5,4],'Nb':[5,5],'Mo':[5,6],'Tc':[5,7],'Ru':[5,8],'Rh':[5,9],'Pd':[5,10],'Ag':[5,11],'Cd':[5,12],'In':[5,13],'Sn':[5,14],'Sb':[5,15],'Te':[5,16],'I':[5,17],'Xe':[5,18],
  'Cs':[6,1],'Ba':[6,2],'La':[6,3],'Hf':[6,4],'Ta':[6,5],'W':[6,6],'Re':[6,7],'Os':[6,8],'Ir':[6,9],'Pt':[6,10],'Au':[6,11],'Hg':[6,12],'Tl':[6,13],'Pb':[6,14],'Bi':[6,15],'Po':[6,16],'At':[6,17],'Rn':[6,18],
  'Fr':[7,1],'Ra':[7,2],'Ac':[7,3],'Rf':[7,4],'Db':[7,5],'Sg':[7,6],'Bh':[7,7],'Hs':[7,8],'Mt':[7,9],'Ds':[7,10],'Rg':[7,11],'Cn':[7,12],'Nh':[7,13],'Fl':[7,14],'Mc':[7,15],'Lv':[7,16],'Ts':[7,17],'Og':[7,18],
  'Ce':[8,3],'Pr':[8,4],'Nd':[8,5],'Pm':[8,6],'Sm':[8,7],'Eu':[8,8],'Gd':[8,9],'Tb':[8,10],'Dy':[8,11],'Ho':[8,12],'Er':[8,13],'Tm':[8,14],'Yb':[8,15],'Lu':[8,16],
  'Th':[9,3],'Pa':[9,4],'U':[9,5],'Np':[9,6],'Pu':[9,7],'Am':[9,8],'Cm':[9,9],'Bk':[9,10],'Cf':[9,11],'Es':[9,12],'Fm':[9,13],'Md':[9,14],'No':[9,15],'Lr':[9,16]
}

const PT_GROUP_LABELS = ['1','2','','','','','','','','','','','13','14','15','16','17','18']

export class SettingsPage {
  constructor() {
    this._container = null
    this._viewMode = 'grid'
    this._pickerVisible = false
    this._pickerTarget = null // { type: 'element'|'visual', key }
    this._customColor = '#cccccc'
    this._elements = []
    this._visualColors = []
    this._ptGrid = []
  }

  mount(container) {
    this._container = container
    this._loadData()
    this._render()
  }

  unmount() {
    this._container = null
  }

  _loadData() {
    const overrides = getElementColorOverrides()
    this._elements = Object.entries(elementsData).map(([symbol, data]) => ({
      symbol, name: data.name, defaultColor: data.color,
      currentColor: overrides[symbol] || data.color, hasOverride: !!overrides[symbol]
    }))

    const allColors = getAllVisualColors()
    this._visualColors = VISUAL_COLOR_KEYS.map(item => ({
      ...item, color: allColors[item.key] || '#cccccc'
    }))

    this._buildPtGrid()
  }

  _buildPtGrid() {
    const elemMap = {}
    for (const el of this._elements) elemMap[el.symbol] = el
    const grid = []
    for (let r = 1; r <= 9; r++) {
      const row = []
      for (let c = 1; c <= 18; c++) row.push(null)
      grid.push(row)
    }
    for (const el of this._elements) {
      const pos = PT_POS[el.symbol]
      if (pos) grid[pos[0]-1][pos[1]-1] = el
    }
    this._ptGrid = grid
  }

  _render() {
    if (!this._container) return
    const c = this._container
    c.innerHTML = ''

    // 页面结构
    c.innerHTML = `
    <div class="settings-page">
      <nav class="page-nav">
        <span class="nav-back" id="backBtn">← 返回</span>
        <span class="nav-title">全局设置</span>
      </nav>
      <div class="settings-scroll" id="settingsScroll"></div>
      ${this._renderPicker()}
    </div>
    <style>
      .settings-page { width:100%;height:100vh;display:flex;flex-direction:column;background:#f5f5f5; overflow:hidden; }
      .page-nav {
        padding: calc(12px + env(safe-area-inset-top)) 16px 10px; background:#fff;
        display:flex; align-items:center; gap:12px; border-bottom:1px solid #eee; flex-shrink:0;
      }
      .nav-back { color:#4285F4; font-size:15px; cursor:pointer; }
      .nav-title { font-size:17px; font-weight:600; color:#333; }
      .settings-scroll { flex:1; overflow-y:auto; padding-bottom:40px; }
    </style>`

    // 事件
    c.querySelector('#backBtn').addEventListener('click', () => router.back())

    // 渲染内容
    const scroll = c.querySelector('#settingsScroll')
    scroll.innerHTML = this._renderContent()

    this._bindContentEvents(scroll)
  }

  _renderContent() {
    // 视觉颜色
    let visualHtml = this._visualColors.map(v => `
      <div class="visual-color-row" data-visual="${v.key}">
        <span class="visual-color-label">${v.label}</span>
        <div class="visual-color-right">
          <span class="visual-color-swatch" style="background:${v.color}"></span>
          <span class="visual-color-hex">${v.color}</span>
        </div>
      </div>`).join('')

    // 元素颜色
    let elemHtml
    if (this._viewMode === 'grid') {
      elemHtml = this._elements.map(el => `
        <div class="color-item${el.hasOverride ? ' has-override' : ''}" data-element="${el.symbol}">
          <span class="color-swatch" style="background:${el.currentColor}">
            <span class="color-symbol" style="color:${el.currentColor === '#ffffff' || el.currentColor === '#cccccc' ? '#333' : '#fff'}">${el.symbol}</span>
          </span>
          <span class="color-name">${el.name}</span>
        </div>`).join('')
    } else {
      // 周期表视图
      let ptHtml = '<div class="pt-container">'
      // 族标签
      ptHtml += '<div class="pt-row pt-group-labels">'
      for (const label of PT_GROUP_LABELS) {
        ptHtml += `<span class="pt-group-cell">${label}</span>`
      }
      ptHtml += '</div>'
      // 主体
      for (let ri = 0; ri < this._ptGrid.length; ri++) {
        ptHtml += `<div class="pt-row${ri === 7 ? ' pt-fblock-sep' : ''}">`
        for (let ci = 0; ci < this._ptGrid[ri].length; ci++) {
          const cell = this._ptGrid[ri][ci]
          if (cell) {
            ptHtml += `<span class="pt-cell pt-has-element${cell.hasOverride ? ' pt-has-override' : ''}" data-element="${cell.symbol}" style="background:${cell.currentColor}">
              <span class="pt-cell-symbol" style="color:${cell.currentColor === '#ffffff' || cell.currentColor === '#cccccc' ? '#333' : '#fff'}">${cell.symbol}</span>
            </span>`
          } else {
            ptHtml += '<span class="pt-cell pt-empty"></span>'
          }
        }
        ptHtml += '</div>'
      }
      ptHtml += '</div>'
      elemHtml = ptHtml
    }

    return `
    <div class="section">
      <div class="section-header">
        <span class="section-title">视觉颜色</span>
        <span class="reset-btn" id="resetVisualBtn">恢复默认</span>
      </div>
      <p class="section-desc">自定义3D视图中的背景、线框、空隙等颜色</p>
      <div class="visual-color-list">${visualHtml}</div>
    </div>
    <div class="section">
      <div class="section-header">
        <span class="section-title">元素颜色</span>
        <span class="reset-btn" id="resetElemBtn">恢复默认</span>
        <span class="view-toggle" id="viewToggleBtn">${VIEW_MODE_LABELS[this._viewMode] || VIEW_MODE_LABELS.list}</span>
      </div>
      <p class="section-desc">点击元素可自定义其在3D视图中的显示颜色</p>
      <div class="color-${this._viewMode === 'grid' ? 'grid' : 'pt'}">${elemHtml}</div>
    </div>
    <style>
      .section { margin:12px; background:#fff; border-radius:8px; padding:12px; }
      .section-header { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
      .section-title { font-size:16px; font-weight:600; color:#333; }
      .section-desc { font-size:12px; color:#999; margin-bottom:8px; }
      .reset-btn { font-size:12px; color:#4285F4; cursor:pointer; margin-left:auto; }
      .view-toggle { font-size:12px; color:#4285F4; cursor:pointer; }
      .visual-color-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f0f0f0; cursor:pointer; }
      .visual-color-label { font-size:14px; color:#333; }
      .visual-color-right { display:flex; align-items:center; gap:6px; }
      .visual-color-swatch { width:24px; height:24px; border-radius:4px; border:1px solid #ddd; }
      .visual-color-hex { font-size:12px; color:#666; font-family:monospace; }
      .color-grid { display:flex; flex-wrap:wrap; gap:6px; }
      .color-item {
        width:calc(25% - 4.5px); text-align:center; padding:6px 2px; border-radius:6px;
        cursor:pointer; transition:background 0.2s;
      }
      .color-item.has-override { background:rgba(66,133,244,0.08); }
      .color-item:hover { background:rgba(0,0,0,0.04); }
      .color-swatch {
        display:flex; align-items:center; justify-content:center; width:36px; height:36px;
        border-radius:50%; margin:0 auto 4px; border:1px solid rgba(0,0,0,0.1);
      }
      .color-symbol { font-size:12px; font-weight:700; }
      .color-name { font-size:10px; color:#666; }
      .pt-container { overflow-x:auto; }
      .pt-row { display:flex; }
      .pt-group-labels { margin-bottom:2px; }
      .pt-group-cell { width:20px; text-align:center; font-size:8px; color:#999; }
      .pt-cell { width:20px; height:20px; display:flex; align-items:center; justify-content:center; border:1px solid #eee; font-size:7px; }
      .pt-empty { background:#fafafa; }
      .pt-has-element { cursor:pointer; }
      .pt-has-override { box-shadow:inset 0 0 0 1px #4285F4; }
      .pt-cell-symbol { font-weight:600; }
      .pt-fblock-sep { margin-top:4px; }
      /* Picker */
      .picker-overlay { position:fixed; top:0;left:0;right:0;bottom:0; background:rgba(0,0,0,0.5); z-index:1000; display:flex; align-items:center; justify-content:center; }
      .picker-dialog { background:#fff; border-radius:12px; padding:20px; width:300px; max-width:90vw; }
      .picker-title { display:block; text-align:center; font-size:16px; font-weight:600; color:#333; margin-bottom:12px; }
      .preset-colors { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
      .preset-swatch { width:30px; height:30px; border-radius:50%; border:2px solid #eee; cursor:pointer; }
      .custom-color-row { display:flex; align-items:center; gap:6px; margin-bottom:12px; }
      .custom-label { font-size:13px; color:#666; white-space:nowrap; }
      .custom-input { flex:1; height:32px; border:1px solid #ddd; border-radius:4px; padding:0 8px; font-size:13px; }
      .custom-apply-btn { padding:6px 14px; background:#4285F4; color:#fff; border-radius:4px; font-size:13px; cursor:pointer; }
      .picker-reset { text-align:center; padding:8px; font-size:13px; color:#999; cursor:pointer; margin-bottom:4px; }
      .picker-close { text-align:center; padding:8px; font-size:14px; color:#4285F4; cursor:pointer; }
    </style>`
  }

  _renderPicker() {
    if (!this._pickerVisible) return ''
    const target = this._pickerTarget || {}
    // ★ 标题里带变量（颜色名 / 元素符号），扫描替换够不着 → 必须走 `t()`。
    //   这条在**点击那一刻**才求值，所以换语言后下次打开就是新语言，不存在"卡住"。
    //   ★ 颜色名本身是**数据字段**、也在 `text` 表里：它嵌进变量位后不再经过 DOM
    //     扫描，故先用 `tsrc()` 翻一道（中文模式下回 null，原样用中文）。
    const title = target.type === 'visual'
      ? t('h5.settings.pickVisualColor', { label: tsrc(target.label) || target.label })
      : t('h5.settings.pickElementColor', { key: target.key || '' })

    return `
    <div class="picker-overlay" id="pickerOverlay">
      <div class="picker-dialog" id="pickerDialog">
        <span class="picker-title">${title}</span>
        <div class="preset-colors">
          ${PRESET_COLORS.map(c => `<span class="preset-swatch" data-color="${c}" style="background:${c}"></span>`).join('')}
        </div>
        <div class="custom-color-row">
          <span class="custom-label">自定义</span>
          <input class="custom-input" id="customColorInput" type="text" maxlength="7" value="${this._customColor}" placeholder="#RRGGBB" />
          <span class="custom-apply-btn" id="customApplyBtn">确定</span>
        </div>
        <div class="picker-reset" id="pickerResetBtn">重置为默认颜色</div>
        <div class="picker-close" id="pickerCloseBtn">取消</div>
      </div>
    </div>`
  }

  _bindContentEvents(scroll) {
    // 视觉颜色点击
    scroll.querySelectorAll('.visual-color-row').forEach(el => {
      el.addEventListener('click', () => {
        const key = el.dataset.visual
        const item = this._visualColors.find(v => v.key === key)
        this._showPicker('visual', key, item?.label, item?.color)
      })
    })

    // 元素点击（网格视图）
    scroll.querySelectorAll('.color-item[data-element]').forEach(el => {
      el.addEventListener('click', () => {
        const symbol = el.dataset.element
        const item = this._elements.find(e => e.symbol === symbol)
        this._showPicker('element', symbol, undefined, item?.currentColor)
      })
    })

    // 周期表视图元素点击
    scroll.querySelectorAll('.pt-has-element[data-element]').forEach(el => {
      el.addEventListener('click', () => {
        const symbol = el.dataset.element
        const item = this._elements.find(e => e.symbol === symbol)
        this._showPicker('element', symbol, undefined, item?.currentColor)
      })
    })

    // 视图切换
    const viewToggle = scroll.querySelector('#viewToggleBtn')
    if (viewToggle) {
      viewToggle.addEventListener('click', () => {
        this._viewMode = this._viewMode === 'grid' ? 'periodicTable' : 'grid'
        this._render()
      })
    }

    // 重置按钮
    scroll.querySelector('#resetVisualBtn')?.addEventListener('click', () => {
      if (confirm('确定要恢复所有视觉元素的默认颜色吗？')) {
        resetVisualColors()
        this._loadData()
        this._render()
      }
    })
    scroll.querySelector('#resetElemBtn')?.addEventListener('click', () => {
      if (confirm('确定要恢复所有元素的默认颜色吗？')) {
        resetElementColors()
        this._loadData()
        this._render()
      }
    })
  }

  _showPicker(type, key, label, color) {
    this._pickerVisible = true
    this._pickerTarget = { type, key, label }
    this._customColor = color || '#cccccc'
    this._render()

    // 绑定 picker 事件
    const c = this._container
    c.querySelector('#pickerOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'pickerOverlay') this._closePicker()
    })
    c.querySelector('#pickerCloseBtn')?.addEventListener('click', () => this._closePicker())

    c.querySelectorAll('.preset-swatch').forEach(el => {
      el.addEventListener('click', () => this._applyColor(el.dataset.color))
    })
    c.querySelector('#customApplyBtn')?.addEventListener('click', () => {
      const input = c.querySelector('#customColorInput')
      if (input) this._applyColor(input.value.trim())
    })
    c.querySelector('#pickerResetBtn')?.addEventListener('click', () => {
      if (this._pickerTarget?.type === 'visual') {
        setVisualColor(this._pickerTarget.key, '')
      } else if (this._pickerTarget?.type === 'element') {
        setElementColor(this._pickerTarget.key, '')
      }
      this._closePicker()
      this._loadData()
      this._render()
    })
  }

  _applyColor(color) {
    if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      alert('请输入有效的十六进制颜色 (#RRGGBB)')
      return
    }
    const target = this._pickerTarget
    if (target?.type === 'visual') {
      setVisualColor(target.key, color)
    } else if (target?.type === 'element') {
      setElementColor(target.key, color)
    }
    this._closePicker()
    this._loadData()
    this._render()
  }

  _closePicker() {
    this._pickerVisible = false
    this._pickerTarget = null
    this._render()
  }
}
