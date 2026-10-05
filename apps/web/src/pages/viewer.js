/**
 * 3D 查看器页面 (H5)
 * 组合 viewer-canvas、layer-control 和 atom-info-popup
 */
import { ViewerCanvas } from '@crystal/components/viewer-canvas.js'
import { LayerControl } from '@crystal/components/layer-control.js'
import { AtomInfoPopup } from '@crystal/components/atom-info-popup.js'
import { getCrystalData } from '@crystal/lib/crystal-loader.js'
import elementsData from '@crystal/data/elements.js'
import { router } from '../shell/router.js'
import { globalData } from '../shell/app-state.js'
// ★ 智能体接入：本页是唯一"可被智能体驱动的视图"，故在 mount/unmount 时向注册表登记/注销。
//   注册表的存在是因为 ViewerPage 实例由路由器创建、没有稳定的全局句柄（见 view-registry.js）。
import { registerViewerPage, unregisterViewerPage } from '../shell/agent-bridge.js'
import { createViewerPageAdapter } from '@modules/crystal/adapters/viewer-page-adapter.js'
// ★ 别名 `@i18n`（vite）——页面代码走别名，**字典文件**才走相对路径（守卫要能 import 它）。
//   本文件里没有名为 t 的局部变量，可以直接用 t()。
import { t } from '@i18n/index.js'

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
      isOrthogonalCell: true, equivalentSettings: [], equivalentIndex: 0,
      /** 需要高亮的元素（null = 无）。由智能体的 highlightAtoms 动作设置，见 applyIntent */
      highlightElements: null
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

    /**
     * ★ 「保存图片」抓图前请它**先渲染一帧**。
     *
     *   这个画布是 `preserveDrawingBuffer: false` + **按需重绘**（改了才画，另有 1 Hz 兜底）。
     *   抓图正好落在"这一帧什么都没画"的时刻时，缓冲里是空的 ——
     *   存下来的就是一张**空白图**（用户报的「晶典在线保存的图片是空的」）。
     *   壳在抓图前派发 `chem-agent:before-capture`，这里调 `invalidate()` 排一帧渲染，
     *   壳再等两层 rAF 才读，于是拿到的必定是刚画好的那一帧。
     */
    this._onBeforeCapture = () => {
      try { if (this._canvasComponent && typeof this._canvasComponent.invalidate === 'function') this._canvasComponent.invalidate() }
      catch (e) { /* 画布还没就绪：让壳按原样抓 */ }
    }
    window.addEventListener('chem-agent:before-capture', this._onBeforeCapture)

    // 恢复数据（viewer-canvas mount 后需要的元数据）
    this._crystalName = data?.name || this._crystalId
    const titleEl = container.querySelector('#crystalTitle')
    if (titleEl) titleEl.textContent = this._crystalName

    // ★ 登记为"当前可驱动的视图"（必须在最后一行：此时 canvas 已 mount、状态已就绪）。
    //   智能体通过它拿到适配器；非 viewer 页时该注册表为空，智能体的 hand 类动作
    //   会回一句"当前没有激活任何模块"，而不是对着空气下发动作（静默无效）。
    registerViewerPage(this, createViewerPageAdapter(this))
  }

  unmount() {
    // ★ 第一步就注销：晚于卸载会让智能体短暂地对着一个已销毁的页面下发动作
    unregisterViewerPage(this)
    // ★ 抓图前渲染那一帧的监听也要摘掉：页面可反复挂载，不摘会累积
    if (this._onBeforeCapture) {
      window.removeEventListener('chem-agent:before-capture', this._onBeforeCapture)
      this._onBeforeCapture = null
    }
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

  /**
   * 语言变更时由路由调用（见 shell/router.js 的 `_notifyLang`）。
   *
   * ★ 本页只有**一处**文案是走 `t()` 取值的（标题的兜底"晶体结构"），其余全是静态文案
   *   ——那些由运行时的 restore + sweep 处理，这里不必重复劳动。
   * ★ 只改一个文本节点，**不重建画布**：三维几何与语言无关，重建纯属浪费
   *   （本仓库对"换语言重建几何"有过明确的禁令）。
   */
  onLangChange() {
    const meta = this._state.crystalMeta
    if (!meta || meta.name) return       // 有晶体名时不碰（那是数据，不是文案）
    const el = this._container?.querySelector('#crystalTitle')
    if (el) el.textContent = t('pages.viewer.crystalFallback')
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
      showLatticePoints: s.showLatticePoints,
      highlightElements: s.highlightElements
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
      <div data-page-topbar class="top-bar">
        <div class="back-btn" id="backBtn"><span class="back-icon">←</span></div>
        <span class="crystal-title" id="crystalTitle">${meta.name || t('pages.viewer.crystalFallback')}</span>
      </div>

      <!-- 对比按钮 -->
      <div class="compare-fab" id="compareBtn"><span class="compare-text">对比</span></div>

      <!-- 底部控制面板 -->
      <div class="bottom-panel" id="layerControlPanel"></div>

      <!-- 原子信息弹窗 -->
      <div class="atom-popup-container" id="atomPopup"></div>
    </div>
    <style>
      .viewer-page { width:100vw; height:100vh; position:relative; overflow:hidden; background:#ffffff; }
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
        celldisplaymodechange: (e) => this._onCellDisplayModeChange(e.detail),
        appearancechange: (e) => this._onAppearanceChange(e.detail)
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
      equivalentSettings: s.equivalentSettings, equivalentIndex: s.equivalentIndex,
      // 外观滑块（控制面板的"外观"区）。★ 必须传——不传则 setProps 会把滑块拉回 undefined，
      //   表现为"拖完一动就弹回原位"。
      atomScale: s.atomScale, opacity: s.opacity
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

  /**
   * 外观滑块（原子缩放 / 原子透明度）。
   * ★ 与智能体的 `setAppearance` 动作落到同一批状态字段上 —— 两条路径一致，
   *   不会出现"用户调了、快照里还是旧值"的漂移。
   */
  _onAppearanceChange({ patch }) {
    if (!patch) return
    Object.assign(this._state, patch)
    this._updateCanvasProps()
    // 拖动过程中**不重渲染控件**（那会把 range 元素的焦点/拖动状态打断）；
    // 只更新数值显示，其余等松手后由 setProps 收敛。
    this._updateAppearanceReadout(patch)
  }

  /** 拖动中只刷新滑块旁的数值文字（不重建 DOM） */
  _updateAppearanceReadout(patch) {
    const panel = this._container?.querySelector('#layerControlPanel')
    if (!panel) return
    for (const [key, v] of Object.entries(patch)) {
      const el = panel.querySelector(`[data-val-for="${key}"]`)
      if (!el) continue
      el.textContent = key === 'opacity' ? Math.round(v * 100) + '%' : Number(v).toFixed(2)
      const range = panel.querySelector(`.appearance-range[data-key="${key}"]`)
      if (range) {
        const min = Number(range.min), max = Number(range.max)
        range.style.setProperty('--fill', ((v - min) / (max - min) * 100) + '%')
      }
    }
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

  /**
   * 打开与**另一个晶体**的并排对比。
   *
   * 供智能体的 `openCompareView` 动作调用（它是动作，经 applySceneActions 下发）。
   * 复用页面既有的"对比"按钮逻辑：把当前视图状态存进 `globalData.comparePreset`，
   * 让对比页能接着现在的视角，而不是回到默认角度。
   *
   * ★ 用 query 参数（`?b=`）而不是新路由模式：不破坏已有链接，
   *   且对比页缺省仍走原来的"同一晶体 × 两种模型"。
   *
   * @param {string} otherId 第二个晶体的 id（已由动作层校验过合法性）
   */
  openCompareWith(otherId) {
    if (!otherId || otherId === this._crystalId) return false
    const preset = { ...this._state }
    const c = this._canvasComponent
    if (c) {
      const vs = c.getViewState()
      if (vs) {
        preset.viewState = {
          theta: vs.theta, phi: vs.phi,
          crystalQuat: vs.crystalQuat || { x: 0, y: 0, z: 0, w: 1 },
        }
      }
    }
    globalData.comparePreset = preset
    router.navigate('/compare/' + this._crystalId + '?b=' + encodeURIComponent(otherId))
    return true
  }

  // ==================== 智能体接入（供适配器调用） ====================

  /**
   * 受控状态写入漏斗 —— **智能体的操作与用户的操作在此汇合**。
   *
   * ★ 为什么是"复用既有的 8 个处理器"而不是另写一套 setProps：
   *   那些处理器里已经编码了本页的联动规则，重写必然与之分叉：
   *     · `_onLayerChange` 里打开 `latticePoints` 会**强制关掉** `showAtoms` 与
   *       `showAtomLabels`（只看点阵点才讲得清点阵型式）；关掉时又把 `showAtoms` 打开
   *     · `_onLayerChange` 里关掉 `atoms` 会**连带关掉** `showAtomLabels`
   *     · `_onEquivalentChange` 里 `fractionalShift` 取自 `equivalentSettings[index].shift`，
   *       不是直接赋值
   *   另写一套就会漏掉这些，表现为"智能体改了、画面也对，但控件状态不对"——
   *   或反之。两条路径走同一个函数，才谈得上"不分叉"。
   *
   * @param {Object} intent
   *   { kind:'layer',           layer, visible }
   *   { kind:'atomLabels',      visible }
   *   { kind:'modelType',       value }
   *   { kind:'atomVisibility',  element, visible }
   *   { kind:'cellDisplayMode', value }
   *   { kind:'equivalent',      index }
   *   { kind:'auxAbove',        value }
   *   { kind:'partialAtoms',    value }
   *   { kind:'appearance',      patch: { atomScale?, stickRadius?, opacity? } }
   *   { kind:'view',            direction } 或 { kind:'view', reset:true }
   */
  applyIntent(intent) {
    const it = intent || {}
    switch (it.kind) {
      case 'layer':
        this._onLayerChange({ layer: it.layer, value: !!it.visible })
        return
      case 'atomLabels':
        this._onAtomLabelsToggle({ value: !!it.visible })
        return
      case 'modelType':
        this._onModelTypeChange({ value: it.value })
        return
      case 'atomVisibility':
        this._onAtomVisibilityChange({ element: it.element, value: !!it.visible })
        return
      case 'cellDisplayMode':
        this._onCellDisplayModeChange({ value: it.value })
        return
      case 'equivalent':
        this._onEquivalentChange({ index: it.index })
        return
      case 'auxAbove':
        this._onAuxAboveToggle({ value: !!it.value })
        return
      case 'partialAtoms':
        this._onPartialAtomsChange({ value: !!it.value })
        return
      case 'appearance':
        // 外观类：面板的"外观"滑块走 _onAppearanceChange，智能体的 setAppearance 动作
        // 落到同一批状态字段上（两条路径一致，见 _onAppearanceChange 的说明）
        Object.assign(this._state, it.patch || {})
        this._updateCanvasProps()
        this._updateLayerControl()
        return
      case 'highlight':
        // 高亮同样没有 UI 控件（它是智能体的诊断手段），直接改状态转发给画布。
        // ★ 画布侧有专门的 HIGHLIGHT_PROPS 分类，只改材质不重建场景
        this._state.highlightElements = (it.elements && it.elements.length) ? it.elements : null
        this._updateCanvasProps()
        return
      case 'view':
        // 视角不属 _state（它归 ViewerCanvas 保管），故直通画布
        if (it.reset) this._canvasComponent?.resetView()
        else if (it.direction) this._canvasComponent?.setView(it.direction)
        return
      default:
        console.warn('[viewer] 未知 intent：', it.kind)
    }
  }

  /**
   * 切换到另一个晶体 —— **不重建页面**。
   *
   * ★ 为什么不让智能体改 hash 走路由：路由切换会 `unmount` 本页并新建一个 ViewerPage
   *   （见 adapters/router.js 的 `container.innerHTML = ''`）。后果是分镜队列里已存的
   *   快照指向一个**死页面**、注册表里的适配器失效、「上一步」回退到不存在的状态。
   *   而"讲解时换一个晶体对比"是极常见的教学动作，必须能平滑完成。
   *
   * ★ 复用 `_initFromData` 而不是自己拼状态：那里编码了魔尔晶体/金属晶体/氢键/正交晶胞
   *   等一串判定（showBonds 的默认值、isMolecularCrystal、hasHydrogenBonds、
   *   equivalentSettings 的初值），复现它等于复制一份会漂移的逻辑。
   *
   * @returns {boolean} 是否切换成功（未知 id 返回 false，不静默失败）
   */
  setCrystal(id) {
    const data = getCrystalData(id)
    if (!data) return false
    this._crystalId = id
    this._initFromData(data)
    this._state.equivalentIndex = 0
    // `_getCanvasProps()` 里带 crystalId，其变化会让 ViewerCanvas 走 needsRebuild 分支
    // （内部会重置视角与视景体），这条通路已经存在，不需要额外通知画布
    this._updateCanvasProps()
    this._updateLayerControl()
    const titleEl = this._container?.querySelector('#crystalTitle')
    if (titleEl) titleEl.textContent = data.name || id
    return true
  }

  /**
   * 供适配器读取的**组合快照**：画布侧 props ∪ 控件侧 props。
   *
   * ★ 为什么取并集而不是只读 ViewerCanvas：控件消费的 22 个字段里有
   *   `crystalMeta` / `showIntersticeControl` / `isMolecularCrystal` /
   *   `hasHydrogenBonds` / `isOrthogonalCell` / `equivalentSettings`——这些画布不知道，
   *   但它们决定控件上有没有某个开关。只读画布会让智能体在"控件侧"失明。
   *
   * ★ 也不用 ViewerCanvas.getProps()：它只返回 19 个字段，缺 lightConfig / depthFog /
   *   fractionalShift / partialAtoms / auxiliaryLineAboveAtoms / projection——
   *   而这些会进「上一步」的回退快照，缺了它们回退就不完整。
   */
  getViewProps() {
    return Object.assign({}, this._getCanvasProps(), this._getLayerControlProps())
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
