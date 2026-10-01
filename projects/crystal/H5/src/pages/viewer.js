/**
 * 3D 查看器页面 (H5)
 * 组合 viewer-canvas、layer-control 和 atom-info-popup
 */
import { ViewerCanvas } from '../components/viewer-canvas.js'
import { LayerControl } from '../components/layer-control.js'
import { AtomInfoPopup } from '../components/atom-info-popup.js'
import { getCrystalData } from '../lib/crystal-loader.js'
import elementsData from '../data/elements.js'
import { router } from '../adapters/router.js'
import { globalData } from '../main.js'

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

function formatPosition(pos) {
  if (!pos || pos.length < 3) return ''
  const nx = ((pos[0] % 1) + 1) % 1
  const ny = ((pos[1] % 1) + 1) % 1
  const nz = ((pos[2] % 1) + 1) % 1
  return '(' + formatFrac(nx) + ', ' + formatFrac(ny) + ', ' + formatFrac(nz) + ')'
}

function formatLatticeConstText(crystalSystem, lattice) {
  if (!lattice) return ''
  // 长度统一保留 2 位小数（与小程序版一致）
  const fmt = v => v.toFixed(2)
  const fmtAng = v => v.toFixed(1).replace(/\.0$/, '') + '°'
  const a = fmt(lattice.a), b = fmt(lattice.b), c = fmt(lattice.c)
  const abEq = Math.abs(lattice.a - lattice.b) < 0.001
  const acEq = Math.abs(lattice.a - lattice.c) < 0.001
  const bcEq = Math.abs(lattice.b - lattice.c) < 0.001
  let lenPart
  if (abEq && acEq) lenPart = 'a=b=c=' + a + ' Å'
  else if (abEq) lenPart = 'a=b=' + a + ' Å, c=' + c + ' Å'
  else if (acEq) lenPart = 'a=c=' + a + ' Å, b=' + b + ' Å'
  else if (bcEq) lenPart = 'a=' + a + ' Å, b=c=' + b + ' Å'
  else lenPart = 'a=' + a + ' Å, b=' + b + ' Å, c=' + c + ' Å'

  const alpha = fmtAng(lattice.alpha), beta = fmtAng(lattice.beta), gamma = fmtAng(lattice.gamma)
  const alBeEq = Math.abs(lattice.alpha - lattice.beta) < 0.1
  const alGaEq = Math.abs(lattice.alpha - lattice.gamma) < 0.1
  const beGaEq = Math.abs(lattice.beta - lattice.gamma) < 0.1
  let angPart
  if (alBeEq && alGaEq) angPart = 'α=β=γ=' + fmtAng(lattice.alpha)
  else if (alBeEq) angPart = 'α=β=' + fmtAng(lattice.alpha) + ', γ=' + gamma
  else if (alGaEq) angPart = 'α=γ=' + fmtAng(lattice.alpha) + ', β=' + beta
  else if (beGaEq) angPart = 'α=' + alpha + ', β=γ=' + beta
  else angPart = 'α=' + alpha + ', β=' + beta + ', γ=' + gamma

  return lenPart + ', ' + angPart
}

const CRYSTAL_SYSTEM_MAP = {
  'cubic': '立方', 'hexagonal': '六方', 'tetragonal': '四方',
  'orthorhombic': '正交', 'monoclinic': '单斜', 'triclinic': '三斜', 'trigonal': '三方'
}

const TEACHING_STACKING_IDS = ['fcc', 'hcp']

/** 没有晶体名时的兜底标题（提到模板串外面，扫描替换才够得着，见 HOWTO §4） */
const DEFAULT_CRYSTAL_TITLE = '晶体结构'

export class ViewerPage {
  constructor(params = {}) {
    this._crystalId = params.crystal || 'fcc'
    this._container = null
    this._canvasComponent = null

    // 页面状态
    this._state = {
      crystalData: null,
      showAtoms: true, showWireframe: true, showInterstices: false,
      showOctahedral: false, showTetrahedral: false, showSymmetry: false,
      showBonds: false, showAxes: true, showAuxiliaryBody: false,
      showAuxiliaryFace: false, auxiliaryLineAboveAtoms: false,
      atomScale: 1.0, opacity: 0.0, modelType: 'ballStick',
      stickRadius: 0.08, cellDisplayMode: 'conventional',
      depthFog: false, fractionalShift: [0, 0, 0], partialAtoms: false,
      projection: 'orthographic',
      lightConfig: [
        { id: 'ambient', type: 'ambient', color: '#ffffff', intensity: 0.82 },
        { id: 'key', type: 'directional', color: '#ffffff', intensity: 0.85, posX: 5, posY: 8, posZ: 5 },
        { id: 'fill', type: 'directional', color: '#ffffff', intensity: 0.45, posX: -3, posY: -1, posZ: -3 },
        { id: 'rim', type: 'directional', color: '#ffbb99', intensity: 0.4, posX: 0, posY: 0, posZ: -5 }
      ],
      atomVisibility: {},
      showAtomLabels: false, showIntersticeControl: false,
      isMolecularCrystal: false, hasHydrogenBonds: false,
      showHydrogenBonds: true, showLatticePoints: false,
      crystalMeta: null, popupVisible: false, popupData: null,
      isOrthogonalCell: true, equivalentSettings: [], equivalentIndex: 0
    }
  }

  mount(container) {
    this._container = container

    // 加载晶体数据
    const data = getCrystalData(this._crystalId)
    if (data) {
      this._initFromData(data)
    }

    // 渲染 HTML
    container.innerHTML = this._renderHTML()

    // 绑定事件
    this._bindEvents(container)

    // 初始化图层控制面板组件
    this._initLayerControl()

    // 初始化原子信息弹窗组件
    this._initAtomPopup()

    // 初始化 3D 画布
    const canvasContainer = container.querySelector('#viewerCanvasContainer')
    if (canvasContainer) {
      this._canvasComponent = new ViewerCanvas({
        container: canvasContainer,
        canvasId: 'crystalCanvas',
        props: this._getCanvasProps(),
        events: {
          atomTap: (e) => this._onAtomTap(e.detail),
          voidTap: (e) => this._onVoidTap(e.detail),
          latticePointTap: (e) => this._onLatticePointTap(e.detail),
          loaded: () => {},
          viewstatechange: () => {}
        }
      })
      this._canvasComponent.mount()
    }

    // 恢复数据（viewer-canvas mount 后需要的元数据）
    this._crystalName = data?.name || this._crystalId
    const titleEl = container.querySelector('#crystalTitle')
    if (titleEl) titleEl.textContent = this._crystalName
  }

  unmount() {
    if (this._canvasComponent) {
      this._canvasComponent.unmount()
      this._canvasComponent = null
    }
    if (this._layerControl) {
      this._layerControl.unmount()
      this._layerControl = null
    }
    if (this._popup) {
      this._popup.unmount()
      this._popup = null
    }
    this._container = null
  }

  _initFromData(data) {
    const s = this._state
    s.crystalData = data
    const lattice = data.lattice

    const atomVisibility = {}
    if (data.atoms) {
      for (const group of data.atoms) atomVisibility[group.element] = true
    }

    const showIntersticeControl = TEACHING_STACKING_IDS.includes(this._crystalId)
    const MOLECULAR_CRYSTAL_IDS = ['co2', 'ice', 'i2', 'urea']
    const isMolecularCrystal = MOLECULAR_CRYSTAL_IDS.includes(this._crystalId)
    const METAL_CRYSTAL_IDS = ['fcc', 'bcc', 'hcp']
    const isMetalCrystal = METAL_CRYSTAL_IDS.includes(this._crystalId)
    const showBonds = isMolecularCrystal ? true : (isMetalCrystal ? false : true)
    const hasHydrogenBonds = isMolecularCrystal && data.hydrogenBonds && data.hydrogenBonds.length > 0
    const isOrthogonalCell = lattice && lattice.alpha === 90 && lattice.beta === 90 && lattice.gamma === 90

    Object.assign(s, {
      atomVisibility, showIntersticeControl, showBonds,
      isMolecularCrystal, hasHydrogenBonds, isOrthogonalCell,
      fractionalShift: data.equivalentSettings && data.equivalentSettings.length > 0
        ? (data.equivalentSettings[0].shift || [0, 0, 0]) : [0, 0, 0],
      equivalentSettings: data.equivalentSettings || [],
      crystalMeta: {
        name: data.name || '', formula: data.formula || '',
        crystalSystem: CRYSTAL_SYSTEM_MAP[data.crystalSystem] || data.crystalSystem || '',
        spaceGroup: data.spaceGroup || '', latticeType: data.latticeType || '',
        structuralUnit: data.structuralUnit || '', coordination: data.coordination || '',
        spaceUtilization: data.spaceUtilization || '', packingDescription: data.packingDescription || '',
        latticeConstText: lattice ? formatLatticeConstText(data.crystalSystem, lattice) : ''
      }
    })
  }

  _getCanvasProps() {
    const s = this._state
    return {
      crystalId: this._crystalId,
      showAtoms: s.showAtoms, showWireframe: s.showWireframe,
      showInterstices: s.showInterstices, showOctahedral: s.showOctahedral,
      showTetrahedral: s.showTetrahedral, showSymmetry: s.showSymmetry,
      showBonds: s.showBonds, showAxes: s.showAxes,
      showAuxiliaryBody: s.showAuxiliaryBody, showAuxiliaryFace: s.showAuxiliaryFace,
      auxiliaryLineAboveAtoms: s.auxiliaryLineAboveAtoms,
      atomScale: s.atomScale, modelType: s.modelType,
      stickRadius: s.stickRadius, cellDisplayMode: s.cellDisplayMode,
      opacity: s.opacity, depthFog: s.depthFog,
      fractionalShift: s.fractionalShift, partialAtoms: s.partialAtoms,
      lightConfig: s.lightConfig, atomVisibility: s.atomVisibility,
      showAtomLabels: s.showAtomLabels, showHydrogenBonds: s.showHydrogenBonds,
      showLatticePoints: s.showLatticePoints
    }
  }

  _renderHTML() {
    const s = this._state
    const meta = s.crystalMeta || {}

    return `
    <div class="viewer-page">
      <!-- 3D画布容器 -->
      <div class="viewer-canvas" id="viewerCanvasContainer">
        <div class="loading-mask" style="display:flex;">
          <div class="loading-spinner"></div>
          <span class="loading-text">加载中...</span>
        </div>
      </div>

      <!-- 顶部标题栏 -->
      <div class="top-bar">
        <div class="back-btn" id="backBtn"><span class="back-icon">←</span></div>
        <span class="crystal-title" id="crystalTitle">${meta.name || DEFAULT_CRYSTAL_TITLE}</span>
      </div>

      <!-- 对比按钮 -->
      <div class="compare-fab" id="compareBtn"><span class="compare-text">对比</span></div>

      <!-- 底部控制面板 -->
      <div class="bottom-panel" id="layerControlPanel"></div>

      <!-- 原子信息弹窗 -->
      <div class="atom-popup-container" id="atomPopup"></div>
    </div>
    <style>
      .viewer-page { width:100vw; height:100vh; position:relative; overflow:hidden; background:#eeeeee; }
      .viewer-canvas { position:absolute; top:0; left:0; width:100%; height:100%; }
      .loading-mask {
        position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(238,238,238,0.9);
        display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:100;
      }
      .loading-spinner {
        width:30px; height:30px; border:2px solid rgba(0,0,0,0.15);
        border-top-color:#4285F4; border-radius:50%; animation:spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform:rotate(360deg); } }
      .loading-text { color:rgba(0,0,0,0.6); font-size:13px; margin-top:10px; }
      .top-bar {
        position:absolute; top:0; left:0; right:0; display:flex; align-items:center;
        padding: calc(12px + env(safe-area-inset-top)) 12px 10px;
        background:linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0)); z-index:10;
      }
      .back-btn {
        width:30px; height:30px; display:flex; align-items:center; justify-content:center;
        border-radius:50%; background:rgba(255,255,255,0.15); margin-right:10px; cursor:pointer; flex-shrink:0;
      }
      .back-icon { color:#fff; font-size:18px; }
      .crystal-title { color:#fff; font-size:15px; font-weight:500; flex:1; }
      .compare-fab {
        position:absolute; top:calc(60px + env(safe-area-inset-top)); right:12px; z-index:10;
        padding:6px 14px; border-radius:14px; background:rgba(66,133,244,0.35);
        border:1px solid rgba(66,133,244,0.5); cursor:pointer;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);
      }
      .compare-fab:active { background:rgba(66,133,244,0.55); }
      .compare-text { color:#fff; font-size:13px; font-weight:500; }
      .bottom-panel { position:absolute; bottom:0; left:0; right:0; z-index:10; }
      .atom-popup-container { position:absolute; top:0; left:0; right:0; bottom:0; pointer-events:none; z-index:1000; }
    </style>`
  }

  _bindEvents(container) {
    // 返回按钮
    container.querySelector('#backBtn')?.addEventListener('click', () => router.back())

    // 对比按钮
    container.querySelector('#compareBtn')?.addEventListener('click', () => {
      const preset = { ...this._state }
      const canvas = this._canvasComponent
      if (canvas) {
        const vs = canvas.getViewState()
        if (vs) preset.viewState = { theta: vs.theta, phi: vs.phi, crystalQuat: vs.crystalQuat || { x:0,y:0,z:0,w:1 } }
      }
      globalData.comparePreset = preset
      router.navigate('/compare/' + this._crystalId)
    })
  }

  _initLayerControl() {
    const panel = this._container?.querySelector('#layerControlPanel')
    if (!panel) return
    this._layerControl = new LayerControl({
      container: panel,
      props: this._getLayerControlProps(),
      events: {
        layerchange: (e) => this._onLayerChange(e.detail),
        modeltypechange: (e) => this._onModelTypeChange(e.detail),
        atomvisibilitychange: (e) => this._onAtomVisibilityChange(e.detail),
        atomlabelstoggle: (e) => this._onAtomLabelsToggle(e.detail),
        auxiliaryabovetoggle: (e) => this._onAuxAboveToggle(e.detail),
        partialatomschange: (e) => this._onPartialAtomsChange(e.detail),
        equivalentsettingchange: (e) => this._onEquivalentChange(e.detail),
        celldisplaymodechange: (e) => this._onCellDisplayModeChange(e.detail)
      }
    })
    this._layerControl.mount(panel)
  }

  /** 供 LayerControl 组件使用的全部属性 */
  _getLayerControlProps() {
    const s = this._state
    return {
      showAtoms: s.showAtoms, showWireframe: s.showWireframe,
      showInterstices: s.showInterstices, showOctahedral: s.showOctahedral,
      showTetrahedral: s.showTetrahedral, showSymmetry: s.showSymmetry,
      showBonds: s.showBonds, showAxes: s.showAxes,
      showAuxiliaryBody: s.showAuxiliaryBody, showAuxiliaryFace: s.showAuxiliaryFace,
      auxiliaryLineAboveAtoms: s.auxiliaryLineAboveAtoms,
      modelType: s.modelType, cellDisplayMode: s.cellDisplayMode,
      partialAtoms: s.partialAtoms, crystalMeta: s.crystalMeta, crystalData: s.crystalData,
      showIntersticeControl: s.showIntersticeControl, atomVisibility: s.atomVisibility,
      showAtomLabels: s.showAtomLabels, isMolecularCrystal: s.isMolecularCrystal,
      showHydrogenBonds: s.showHydrogenBonds, hasHydrogenBonds: s.hasHydrogenBonds,
      showLatticePoints: s.showLatticePoints, isOrthogonalCell: s.isOrthogonalCell,
      equivalentSettings: s.equivalentSettings, equivalentIndex: s.equivalentIndex
    }
  }

  /** 状态变化后同步 LayerControl 组件显示 */
  _updateLayerControl() {
    if (this._layerControl) {
      this._layerControl.setProps(this._getLayerControlProps())
    }
  }

  // ===== 事件处理 =====

  _onLayerChange({ layer, value }) {
    const map = {
      atoms: 'showAtoms', wireframe: 'showWireframe', interstices: 'showInterstices',
      octahedral: 'showOctahedral', tetrahedral: 'showTetrahedral', symmetry: 'showSymmetry',
      bonds: 'showBonds', hydrogenBonds: 'showHydrogenBonds', axes: 'showAxes',
      auxiliaryBody: 'showAuxiliaryBody', auxiliaryFace: 'showAuxiliaryFace',
      latticePoints: 'showLatticePoints'
    }
    const key = map[layer]
    if (!key) return
    this._state[key] = value

    // 联动
    if (layer === 'latticePoints') {
      if (value) { this._state.showAtoms = false; this._state.showAtomLabels = false }
      else this._state.showAtoms = true
    }
    if (layer === 'atoms' && !value) this._state.showAtomLabels = false

    this._updateCanvasProps()
    this._updateLayerControl()
  }

  _onModelTypeChange({ value }) {
    this._state.modelType = value
    this._updateCanvasProps()
    this._updateLayerControl()
  }

  _onAtomVisibilityChange({ element, value }) {
    this._state.atomVisibility = { ...this._state.atomVisibility, [element]: value }
    this._updateCanvasProps()
    this._updateLayerControl()
  }

  _onAtomLabelsToggle({ value }) {
    this._state.showAtomLabels = value
    this._updateCanvasProps()
  }

  _onAuxAboveToggle({ value }) {
    this._state.auxiliaryLineAboveAtoms = value
    this._updateCanvasProps()
  }

  _onPartialAtomsChange({ value }) {
    this._state.partialAtoms = value
    this._updateCanvasProps()
  }

  _onEquivalentChange({ index }) {
    const settings = this._state.equivalentSettings
    if (index >= 0 && index < settings.length) {
      this._state.equivalentIndex = index
      this._state.fractionalShift = settings[index].shift || [0, 0, 0]
      this._updateCanvasProps()
      this._updateLayerControl()
    }
  }

  _onCellDisplayModeChange({ value }) {
    this._state.cellDisplayMode = value
    this._updateCanvasProps()
  }

  _updateCanvasProps() {
    const c = this._canvasComponent
    if (!c) return
    // 增量更新：setProps 内部按属性类型智能处理（模型类重建、可见性类仅刷新、灯光增量更新）
    c.setProps({ ...this._getCanvasProps() })
  }

  _onAtomTap({ element, position }) {
    const elemInfo = elementsData[element] || {}
    this._state.popupVisible = true
    this._state.popupData = {
      element, name: elemInfo.name || element, enName: elemInfo.enName || '',
      color: elemInfo.color || '#fff', atomicNumber: elemInfo.atomicNumber || '',
      atomicMass: elemInfo.atomicMass || '', electronConfig: elemInfo.electronConfig || '',
      electronegativity: elemInfo.electronegativity || '', radius: elemInfo.radius || '',
      position: formatPosition(position)
    }
    this._openPopup()
  }

  _onVoidTap({ type, position }) {
    const voidNameMap = { 'octahedral': '八面体空隙', 'tetrahedral': '四面体空隙' }
    this._state.popupVisible = true
    this._state.popupData = { isVoid: true, voidType: type, voidName: voidNameMap[type] || type, position: formatPosition(position) }
    this._openPopup()
  }

  _onLatticePointTap({ position, latticeTypeName }) {
    this._state.popupVisible = true
    this._state.popupData = { isLatticePoint: true, latticeTypeName: latticeTypeName || '', position: formatPosition(position) }
    this._openPopup()
  }

  _initAtomPopup() {
    const popupContainer = this._container?.querySelector('#atomPopup')
    if (!popupContainer) return
    this._popup = new AtomInfoPopup({
      container: popupContainer,
      props: { visible: false, atomData: null },
      events: {
        close: () => this._closePopup()
      }
    })
    this._popup.mount(popupContainer)
  }

  _openPopup() {
    this._state.popupVisible = true
    if (this._popup) this._popup.setProps({ visible: true, atomData: this._state.popupData })
    // 启用弹窗容器的点击事件（覆盖CSS中的 pointer-events:none）
    const popupContainer = this._container?.querySelector('#atomPopup')
    if (popupContainer) popupContainer.style.pointerEvents = 'auto'
  }

  _closePopup() {
    this._state.popupVisible = false
    if (this._popup) this._popup.setProps({ visible: false })
    // 恢复 pointer-events:none，让触摸事件穿透到画布
    const popupContainer = this._container?.querySelector('#atomPopup')
    if (popupContainer) popupContainer.style.pointerEvents = 'none'
  }
}
