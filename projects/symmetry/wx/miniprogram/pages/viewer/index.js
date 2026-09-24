// pages/viewer/index.js — 主查看器页（Figure 2/3/4 + TOC 底部五页签）
import { EXAMPLES, getExample } from '../../data/examples.js'
import { computeStructureInfo } from '../../lib/app-logic.js'
import { buildPanelData } from '../../lib/panel-data.js'
import { computeAtomOrbit } from '../../lib/orbit-info.js'
import { formatFormulaU } from '../../lib/i18n.js'
import { i18n, t } from '../../lib/i18n.js'
import { bus } from '../../lib/app-state.js'
import { animation as animCtl } from '../../lib/animation.js'
import { getVisualColor, setVisualColor, getElementColor, setElementColor, getAppearance, setAppearance, resetSettings } from '../../lib/settings.js'
import { getUniqueElements } from '../../lib/structure.js'
import { identifyPointGroup } from '../../lib/symmetry/pointGroup.js'

// ==================== 点群族排序（H5 main.js 同款） ====================
function familyOrder(symbol) {
  if (symbol === 'Cs') return 6
  if (symbol === 'Ci') return 7
  if (symbol === 'C1' || symbol === 'C∞v') return 0
  if (symbol.startsWith('D')) return 1
  if (symbol.startsWith('T')) return 2
  if (symbol.startsWith('O')) return 3
  if (symbol.startsWith('I')) return 4
  if (symbol.startsWith('S')) return 5
  if (symbol.startsWith('C')) return 0
  return 8
}
function subOrder(symbol) {
  if (symbol.endsWith('h')) return 1
  if (symbol.endsWith('v') || symbol.endsWith('d')) return 2
  return 0
}
function orderNumber(symbol) {
  const m = symbol.match(/^[CSTDIK]\D*(\d+)/)
  if (m) return parseInt(m[1], 10)
  if (symbol.includes('∞')) return 99
  return 0
}
function pointGroupSortKey(symbol) {
  return familyOrder(symbol) * 1000 + subOrder(symbol) * 100 + orderNumber(symbol)
}

/** 示例显示名（带化学式下标与点群） */
function exampleName(ex) {
  const l = i18n.lang === 'en' ? ['(', ')'] : ['（', '）']
  const title = i18n.lang === 'en' ? (ex.titleEn || ex.title) : ex.title
  return `${title}${l[0]}${formatFormulaU(ex.formula)}${l[1]}`
}

Page({
  data: {
    lang: 'zh',
    tab: 'elements',
    panel: null,
    ctOpen: false,
    // 侧栏宽 / 收起
    sidebarWidthPx: 200,
    sidebarCollapsed: false,
    // 颜色弹窗
    colorPopup: { open: false, kind: 'bg', element: '', key: '', hex: '#ffffff' },
    // WXML 文案
    str: {},
    tabs: [],
    // 分子库
    moleculeNames: [],
    moleculeIndex: 0,
    library: [],
    // 3D 绑定
    structure: null,
    symmetryElements: [],
    // 显隐开关
    showSymmetry: true,
    showLabels: false,
    showAux: false,
    showAtomLabels: false,
    // 原子轨道
    orbit: { visible: false, orbLabels: [], stabNames: [], order: 0 },
    // 动画
    anim: { visible: false, progress: 0, playing: false, toggleChar: '▶' },
    // 设置
    settingsOpen: false,
    setBg: '#eeeeee',
    setAtomScale: 1.0, setAtomScaleVal: '1.0',
    setStickRadius: 0.1, setStickRadiusVal: '0.10',
    setSymScale: 1.0, setSymScaleVal: '1.0',
    setLabelFont: 40, setLabelFontVal: '40',
    setAnimSpeed: 60, setAnimSpeedVal: '60',
    setAnimDuration: 3000, setAnimDurationVal: '3000',
    elementColors: [],
    symColors: [],
    palette: ['#ffffff', '#eeeeee', '#2196F3', '#4CAF50', '#F44336', '#FF9800', '#9C27B0', '#E91E63', '#7E57C2', '#FFB300', '#8E24AA', '#607D8B', '#42A5F5', '#66BB6A', '#EF5350', '#888888']
  },

  _busOff: null,
  _lastPct: -1,

  onLoad() {
    this._buildLibrary()
    // 默认选中第一个示例（不加晶体，默认 molecular 列表第一位）
    const first = EXAMPLES[0]
    if (first) this._selectExample(first.id)
  },

  onReady() {
    // 动画进度回调 → 更新底部进度条（每帧，仅整数百分比变化时 setData）
    this._lastPct = -1
    animCtl.setOnChange((s) => {
      const pct = Math.round(s.progress)
      if (s.visible !== this.data.anim.visible || s.playing !== this.data.anim.playing || s.toggleChar !== this.data.anim.toggleChar || pct !== this._lastPct) {
        this._lastPct = pct
        this.setData({ anim: { visible: s.visible, progress: s.progress, playing: s.playing, toggleChar: s.toggleChar } })
      }
    })
    // 语言切换
    this._busOff = bus.on('langchange', () => this._onLangChange())
    this._applyToolbarI18n()
  },

  onUnload() {
    if (this._busOff) this._busOff()
    animCtl.stop()
  },

  _applyToolbarI18n() {
    this.setData({
      lang: i18n.lang,
      str: {
        symSection: t('info.symSection'),
        ctTitle: t('ct.title'),
        molecTitle: t('ex.molecule'),
        orbit: t('orb.orbit'),
        stabilizer: t('orb.stabilizer'),
        order: t('orb.order'),
        close: '✕',
        animProgress: t('anim.progress'),
        setTitle: t('set.title'),
        setLang: t('set.lang'),
        setBg: t('set.bg'),
        setAtomScale: t('set.atomScale'),
        setStick: t('set.stick'),
        setSymScale: t('set.symScale'),
        setLabelFont: t('set.labelFont'),
        animSpeed: t('anim.speed'),
        animDur: t('anim.dur'),
        elemColorSec: t('set.elemColorSec'),
        symColorSec: t('set.symColorSec'),
        setEmptyHint: t('set.emptyHint'),
        setReset: t('set.reset'),
        labels: t('tool.labels'),
        aux: t('tool.aux'),
        atomLabel: t('tool.atomLabel'),
        about: t('about')
      },
      tabs: [
        { key: 'molecules', label: t('nav.molecules') },
        { key: 'elements', label: t('nav.elements') },
        { key: 'operations', label: t('nav.operations') },
        { key: 'pointgroup', label: t('nav.pointgroup') },
        { key: 'more', label: t('nav.more') }
      ]
    })
  },

  // ==================== 分子库 ====================

  /** 构建分子库（按点群族排序分组）与 picker 名称数组 */
  _buildLibrary() {
    const ordered = EXAMPLES.map(ex => {
      const sym = identifyPointGroup(ex.structure).symbol
      return { ex, sym, order: pointGroupSortKey(sym) }
    }).sort((a, b) => a.order - b.order)

    const groups = []
    const names = []
    for (const { ex, sym } of ordered) {
      groups.push({ sym, name: exampleName(ex), id: ex.id })
      names.push(`${sym}  ${exampleName(ex)}`)
    }
    this.setData({ library: groups, moleculeNames: names })
  },

  // ==================== 选中示例 ====================

  _selectExample(id) {
    const ex = getExample(id)
    if (!ex) return
    const { info, symmetryElements } = computeStructureInfo(ex.structure)
    const panel = buildPanelData(info)
    const idx = this.data.library.findIndex(g => g.id === id)
    this.setData({
      structure: ex.structure,
      symmetryElements,
      panel,
      moleculeIndex: idx >= 0 ? idx : 0,
      orbit: { visible: false, orbLabels: [], stabNames: [], order: 0 }
    })
  },

  onPickerChange(e) {
    const i = e.detail.value
    const item = this.data.library[i]
    if (item) this._selectExample(item.id)
  },

  onLibraryTap(e) {
    const id = e.currentTarget.dataset.id
    if (id) { this._selectExample(id); this.setData({ tab: 'elements' }) }
  },

  // ==================== 页签切换 ====================

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    const patch = { tab }
    // Point Group 页签默认展开特征标表，便于查看
    if (tab === 'pointgroup') patch.ctOpen = true
    if (tab === 'more') patch.settingsOpen = true
    else patch.settingsOpen = false
    this.setData(patch)
  },

  onCtHeader() { this.setData({ ctOpen: !this.data.ctOpen }) },

  // ==================== 侧栏：拖宽 / 收起 ====================

  onSidebarDragStart(e) {
    const t = e.touches[0]
    this._dragStart = { x: t.clientX, w: this.data.sidebarWidthPx, collapsed: this.data.sidebarCollapsed }
  },
  onSidebarDragMove(e) {
    const d = this._dragStart
    if (!d) return
    const dx = e.touches[0].clientX - d.x
    const MIN = 180, MAX = 360
    let w = Math.max(MIN, Math.min(MAX, d.w + dx))
    this.setData({ sidebarWidthPx: Math.round(w), sidebarCollapsed: false })
  },
  onSidebarDragEnd() { this._dragStart = null },
  onSidebarCollapse() { this.setData({ sidebarCollapsed: !this.data.sidebarCollapsed }) },

  // ==================== 颜色选择（弹窗） ====================

  onColorRowTap(e) {
    const d = e.currentTarget.dataset
    this.setData({
      colorPopup: { open: true, kind: d.kind, element: d.element || '', key: d.key || '', hex: d.hex || '#ffffff' }
    })
  },
  onColorPick(e) { this._applyColor(e.currentTarget.dataset.color, true) },
  onColorHexInput(e) { this._applyColor(e.detail.value, false) },
  onColorPopupClose() { this.setData({ 'colorPopup.open': false }) },

  _applyColor(hex, close) {
    const p = this.data.colorPopup
    // 输入未完成时不落库（仅更新输入框显示），合法 6 位 hex 才应用
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) { this.setData({ 'colorPopup.hex': hex }); return }
    const patch = { 'colorPopup.hex': hex.toLowerCase() }
    let needRebuild = false
    if (p.kind === 'bg') {
      setVisualColor('bgColor', hex)
      patch.setBg = hex
      const v = this.selectComponent('#viewer')
      if (v) v.setBackground(hex)
    } else if (p.kind === 'element') {
      setElementColor(p.element, hex)
      const list = this.data.elementColors.map(c => c.element === p.element ? { ...c, color: hex } : c)
      patch.elementColors = list
      needRebuild = true
    } else if (p.kind === 'sym') {
      setVisualColor(p.key, hex)
      const list = this.data.symColors.map(c => c.key === p.key ? { ...c, color: hex } : c)
      patch.symColors = list
      needRebuild = true
    }
    if (close) patch['colorPopup.open'] = false
    this.setData(patch)
    if (needRebuild) this._reload()
  },

  // ==================== 显隐开关 ====================

  onToggle(e) {
    const key = e.currentTarget.dataset.key
    const val = e.detail.value
    const patch = {}
    patch[key] = val
    this.setData(patch)
  },

  // ==================== 对称元素树 ====================

  onGroupHeader(e) {
    const i = e.currentTarget.dataset.index
    const groups = this.data.panel.groups.slice()
    groups[i].open = !groups[i].open
    this.setData({ 'panel.groups': groups })
  },

  onElementCheck(e) {
    const index = e.currentTarget.dataset.index
    const checked = e.detail.value
    const viewer = this.selectComponent('#viewer')
    if (viewer) viewer.setElementVisible(index, checked)
    // 同步回写面板数据，避免重渲染时 checkbox 状态回弹
    const groups = this.data.panel.groups.slice()
    for (let gi = 0; gi < groups.length; gi++) {
      const items = groups[gi].items.slice()
      let hit = false
      for (let ii = 0; ii < items.length; ii++) {
        if (items[ii].index === index) { items[ii].checked = checked; hit = true; break }
      }
      if (hit) { groups[gi].items = items; break }
    }
    this.setData({ 'panel.groups': groups })
  },

  onElementPlay(e) {
    const index = e.currentTarget.dataset.index
    const el = this.data.symmetryElements[index]
    this._stopOrbit()
    const viewer = this.selectComponent('#viewer')
    if (viewer && el) viewer.playSymmetryOperation(el)
    this.setData({ tab: 'operations' })
  },

  // ==================== 原子选中 / 轨道 ====================

  onAtomTap(e) {
    const { index } = e.detail
    if (index === null || index === undefined) { this._stopOrbit(); return }
    const structure = this.data.structure
    const els = this.data.symmetryElements
    if (!structure || structure.kind !== 'molecule') return
    const viewer = this.selectComponent('#viewer')
    if (viewer) viewer.stopAnimation()
    const { orb, orbLabels, stabNames, stabIndexSet } = computeAtomOrbit(structure, els, index)
    if (viewer) viewer.setAtomHighlight(index, orb, stabIndexSet)
    this.setData({
      orbit: { visible: true, orbLabels, stabNames, order: stabNames.length }
    })
  },

  _stopOrbit() {
    const viewer = this.selectComponent('#viewer')
    if (viewer) { viewer.stopAnimation(); viewer.clearAtomHighlight() }
    this.setData({ orbit: { visible: false, orbLabels: [], stabNames: [], order: 0 } })
  },

  onOrbitClose() { this._stopOrbit() },

  // ==================== 动画控制 ====================

  onAnimToggle() { animCtl.toggle() },
  onAnimReset() { animCtl.reset() },
  onAnimInverse() { animCtl.inverse() },
  onAnimAgain() { animCtl.again() },
  onAnimClose() { animCtl.close() },

  // ==================== 设置 ====================

  onLangChange(e) {
    i18n.setLang(Number(e.detail.value) === 1 ? 'en' : 'zh')
  },

  noop() {},

  _onLangChange() {
    this._buildLibrary()
    if (this.data.panel) {
      // 重算当前结构信息（群名/库/文案随语言变）
      const cur = this.data.library[this.data.moleculeIndex]
      if (cur) this._selectExample(cur.id)
    }
    this._applyToolbarI18n()
  },

  onSetBg(e) {
    const v = e.detail.value
    setVisualColor('bgColor', v)
    this.setData({ setBg: v })
    const viewer = this.selectComponent('#viewer')
    if (viewer) viewer.setBackground(v)
  },

  onPickBg(e) {
    const v = e.currentTarget.dataset.color
    setVisualColor('bgColor', v)
    this.setData({ setBg: v })
    const viewer = this.selectComponent('#viewer')
    if (viewer) viewer.setBackground(v)
  },

  onSetAtomScale(e) {
    const v = parseFloat(e.detail.value)
    setAppearance('atomScale', v)
    this.setData({ setAtomScale: v, setAtomScaleVal: v.toFixed(1) })
  },
  onSetStickRadius(e) {
    const v = parseFloat(e.detail.value)
    setAppearance('stickRadius', v)
    this.setData({ setStickRadius: v, setStickRadiusVal: v.toFixed(2) })
  },
  onSetSymScale(e) {
    const v = parseFloat(e.detail.value)
    setAppearance('symmetryScale', v)
    this.setData({ setSymScale: v, setSymScaleVal: v.toFixed(1) })
  },
  onSetLabelFont(e) {
    const v = parseInt(e.detail.value, 10)
    setAppearance('labelFontSize', v)
    this.setData({ setLabelFont: v, setLabelFontVal: String(v) })
  },
  onSetAnimSpeed(e) {
    const v = parseInt(e.detail.value, 10)
    setAppearance('animAngularSpeed', v)
    this.setData({ setAnimSpeed: v, setAnimSpeedVal: String(v) })
  },
  onSetAnimDuration(e) {
    const v = parseInt(e.detail.value, 10)
    setAppearance('animDuration', v)
    this.setData({ setAnimDuration: v, setAnimDurationVal: String(v) })
  },

  onSetElementColor(e) {
    const el = e.currentTarget.dataset.element
    const v = e.detail.value
    setElementColor(el, v)
    this._reload()
  },
  onSetSymColor(e) {
    const key = e.currentTarget.dataset.key
    const v = e.detail.value
    setVisualColor(key, v)
    this._reload()
  },

  onPickElementColor(e) {
    const el = e.currentTarget.dataset.element
    const v = e.currentTarget.dataset.color
    setElementColor(el, v)
    this._openSettings()
    this._reload()
  },
  onPickSymColor(e) {
    const key = e.currentTarget.dataset.key
    const v = e.currentTarget.dataset.color
    setVisualColor(key, v)
    this._openSettings()
    this._reload()
  },
  onSettingsOpen() { this._openSettings() },
  onSettingsClose() { this.setData({ settingsOpen: false }) },

  _openSettings() {
    this._buildSettings()
    this.setData({
      settingsOpen: true,
      setBg: getVisualColor('bgColor'),
      setAtomScale: getAppearance('atomScale'),
      setStickRadius: getAppearance('stickRadius'),
      setSymScale: getAppearance('symmetryScale'),
      setLabelFont: getAppearance('labelFontSize'),
      setAnimSpeed: getAppearance('animAngularSpeed'),
      setAnimDuration: getAppearance('animDuration'),
      lang: i18n.lang
    })
  },

  _buildSettings() {
    const structure = this.data.structure
    const elements = this.data.symmetryElements || []
    const elemList = structure ? getUniqueElements(structure) : []
    const elemColors = elemList.map(el => ({ element: el, color: getElementColor(el) }))
    // 对称元素颜色：按当前结构实际存在的类型
    const seen = {}
    const symTypes = []
    for (const el of elements) {
      if (el.type === 'E') continue
      if (!seen[el.type]) { seen[el.type] = 1; symTypes.push(el.type) }
    }
    const symColorKeys = {
      C2: 'axisC2', C3: 'axisC3', C4: 'axisC4', C5: 'axisC5', C6: 'axisC6',
      S4: 'axisS4', S5: 'axisS5', S6: 'axisS6', S8: 'axisS8', S3: 'axisS3', S10: 'axisS10', 'S∞': 'axisSInf', 'C∞': 'axisCInf',
      sigma: 'sigma', sigma_v: 'sigmaV', sigma_d: 'sigmaD', sigma_h: 'sigmaH', i: 'inversionColor'
    }
    const symColors = symTypes.map(type => ({
      label: type, type,
      key: symColorKeys[type] || type,
      color: getVisualColor(symColorKeys[type] || type)
    }))
    this.setData({ elementColors: elemColors, symColors })
  },

  _reload() {
    // 外观/颜色变化 → 组件按当前参数重建（保留视角）
    const viewer = this.selectComponent('#viewer')
    if (viewer) viewer.rebuild()
  },

  onResetSettings() {
    resetSettings()
    this._openSettings()
    // 颜色等非绑定外观项需显式重建（保留视角）
    this._reload()
  }
})
