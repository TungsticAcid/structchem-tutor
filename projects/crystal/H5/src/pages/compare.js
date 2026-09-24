/**
 * 晶体结构对比页面 (H5)
 * 左右分栏展示同一晶体的两种模型，支持联动/独立交互
 */
import { ViewerCanvas } from '../components/viewer-canvas.js'
import { getCrystalData } from '../lib/crystal-loader.js'
import { router } from '../adapters/router.js'
import { globalData } from '../main.js'

function defaultSideSettings(overrides = {}) {
  return {
    modelType: 'ballStick', stickRadius: 0.08, showAtoms: true,
    showWireframe: true, showBonds: false, showAxes: true,
    showSymmetry: false, showInterstices: false, showOctahedral: false,
    showTetrahedral: false, showAuxiliaryBody: false, showAuxiliaryFace: false,
    atomScale: 1.0, opacity: 0.0, cellDisplayMode: 'conventional', ...overrides
  }
}

export class ComparePage {
  constructor(params = {}) {
    this._crystalId = params.crystal || 'fcc'
    this._container = null
    this._leftCanvas = null
    this._rightCanvas = null
    this._canvasLoadedCount = 0
    this._pendingViewState = null
    this._syncing = false
    this._settingsExpanded = false

    // 状态
    this._state = {
      crystalName: '', crystalData: null, showIntersticeControl: false,
      syncMode: true, layoutMode: 'vertical',
      leftModelType: 'ballStick', leftStickRadius: 0.08, leftShowAtoms: true,
      leftShowBonds: false, leftShowAxes: true, leftShowInterstices: false,
      leftShowOctahedral: false, leftShowTetrahedral: false, leftShowAuxiliaryBody: false,
      leftShowAuxiliaryFace: false, leftAtomScale: 1.0, leftOpacity: 0.0,
      leftCellDisplayMode: 'conventional', leftEquivalentIndex: 0, leftFractionalShift: [0,0,0],
      rightModelType: 'cpk', rightStickRadius: 0.08, rightShowAtoms: true,
      rightShowBonds: false, rightShowAxes: true, rightShowInterstices: false,
      rightShowOctahedral: false, rightShowTetrahedral: false, rightShowAuxiliaryBody: false,
      rightShowAuxiliaryFace: false, rightAtomScale: 1.0, rightOpacity: 0.0,
      rightCellDisplayMode: 'conventional', rightEquivalentIndex: 0, rightFractionalShift: [0,0,0],
      auxiliaryLineAboveAtoms: false, depthFog: false, equivalentSettings: [],
      partialAtoms: false,
      lightConfig: [
        { id: 'ambient', type: 'ambient', color: '#ffffff', intensity: 0.82 },
        { id: 'key', type: 'directional', color: '#ffffff', intensity: 0.85, posX: 5, posY: 8, posZ: 5 },
        { id: 'fill', type: 'directional', color: '#ffffff', intensity: 0.45, posX: -3, posY: -1, posZ: -3 },
        { id: 'rim', type: 'directional', color: '#ffbb99', intensity: 0.4, posX: 0, posY: 0, posZ: -5 }
      ],
      leftAtomVisibility: {}, rightAtomVisibility: {},
      leftShowAtomLabels: false, rightShowAtomLabels: false,
      leftShowHydrogenBonds: true, rightShowHydrogenBonds: true,
      leftShowLatticePoints: false, rightShowLatticePoints: false,
      isMolecularCrystal: false, hasHydrogenBonds: false, isOrthogonalCell: true
    }
  }

  mount(container) {
    this._container = container

    const data = getCrystalData(this._crystalId)
    if (data) {
      const s = this._state
      s.crystalData = data
      s.crystalName = data.name || this._crystalId
      s.showIntersticeControl = ['fcc', 'hcp'].includes(this._crystalId)
      s.isOrthogonalCell = data.lattice && data.lattice.alpha === 90 && data.lattice.beta === 90 && data.lattice.gamma === 90
      const MOLECULAR_IDS = ['co2','ice','i2','urea']
      s.isMolecularCrystal = MOLECULAR_IDS.includes(this._crystalId)
      s.hasHydrogenBonds = s.isMolecularCrystal && data.hydrogenBonds && data.hydrogenBonds.length > 0
      const METAL_IDS = ['fcc','bcc','hcp']
      const isMetal = METAL_IDS.includes(this._crystalId)

      if (s.isMolecularCrystal) {
        s.leftShowBonds = true; s.rightShowBonds = true
        s.leftShowHydrogenBonds = true; s.rightShowHydrogenBonds = true
      } else if (!isMetal) {
        s.leftShowBonds = true; s.rightShowBonds = true
      }

      s.equivalentSettings = data.equivalentSettings || []
      const defaultShift = s.equivalentSettings.length > 0 ? (s.equivalentSettings[0].shift || [0,0,0]) : [0,0,0]
      s.leftFractionalShift = defaultShift; s.rightFractionalShift = defaultShift

      const leftVis = {}, rightVis = {}
      if (data.atoms) {
        for (const g of data.atoms) { leftVis[g.element] = true; rightVis[g.element] = true }
      }
      s.leftAtomVisibility = leftVis; s.rightAtomVisibility = rightVis
    }

    // 应用预设
    const preset = globalData.comparePreset
    if (preset) {
      delete globalData.comparePreset
      if (preset.viewState) this._pendingViewState = preset.viewState
      // 继承属性
      for (const k of ['atomScale','opacity','cellDisplayMode','partialAtoms','showAtoms','showBonds','showAxes','showInterstices','showOctahedral','showTetrahedral','showAuxiliaryBody','showAuxiliaryFace']) {
        if (preset[k] != null) {
          this._state['left' + k.charAt(0).toUpperCase() + k.slice(1)] = preset[k]
          this._state['right' + k.charAt(0).toUpperCase() + k.slice(1)] = preset[k]
        }
      }
      if (preset.modelType) {
        this._state.leftModelType = 'ballStick'; this._state.rightModelType = 'cpk'
      }
      if (preset.atomVisibility) {
        this._state.leftAtomVisibility = { ...preset.atomVisibility }
        this._state.rightAtomVisibility = { ...preset.atomVisibility }
      }
      // 继承变换晶胞原点选择（左右独立，默认同步）
      if (preset.equivalentIndex != null) {
        this._state.leftEquivalentIndex = preset.equivalentIndex
        this._state.rightEquivalentIndex = preset.equivalentIndex
      }
      if (preset.fractionalShift) {
        this._state.leftFractionalShift = [...preset.fractionalShift]
        this._state.rightFractionalShift = [...preset.fractionalShift]
      }
    }

    this._render()
    this._initCanvases()
  }

  unmount() {
    if (this._leftCanvas) { this._leftCanvas.unmount(); this._leftCanvas = null }
    if (this._rightCanvas) { this._rightCanvas.unmount(); this._rightCanvas = null }
    this._container = null
  }

  _render() {
    const c = this._container
    const s = this._state

    c.innerHTML = `
    <div class="compare-page">
      <div class="cp-top-bar">
        <span class="cp-back" id="cpBack">← 返回</span>
        <span class="cp-title">${s.crystalName} - 结构对比</span>
      </div>

      <div class="cp-dual layout-${s.layoutMode}">
        <div class="cp-pane" id="leftPane">
          <span class="cp-label">${s.leftModelType === 'cpk' ? 'CPK空间填充' : '球棍模型'}</span>
        </div>
        <div class="cp-divider divider-${s.layoutMode}"></div>
        <div class="cp-pane" id="rightPane">
          <span class="cp-label">${s.rightModelType === 'cpk' ? 'CPK空间填充' : '球棍模型'}</span>
        </div>
      </div>

      <div class="cp-controls">
        <span class="cp-btn" id="cpToggleLayout">${s.layoutMode === 'horizontal' ? '☰竖屏' : '▮横屏'}</span>
        <span class="cp-btn${s.syncMode ? ' active' : ''}" id="cpToggleSync">${s.syncMode ? '🔗联动' : '🔓独立'}</span>
        <span class="cp-btn" id="cpAlignView">↺对齐视角</span>
        <span class="cp-btn" id="cpAlignStyle">≡对齐样式</span>
        <span class="cp-btn${this._settingsExpanded ? ' active' : ''}" id="cpToggleSettings">⚙设置</span>
      </div>
    </div>
    ${this._renderSettings()}
    <style>
      .compare-page { width:100vw; height:100vh; display:flex; flex-direction:column; background:#eeeeee; overflow:hidden; }
      .cp-top-bar { display:flex; align-items:center; padding:calc(12px + env(safe-area-inset-top)) 12px 8px; flex-shrink:0; z-index:20; background:linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0)); }
      .cp-back { width:30px; height:30px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(255,255,255,0.15); color:#fff; font-size:18px; cursor:pointer; margin-right:10px; }
      .cp-title { color:#fff; font-size:14px; font-weight:500; flex:1; }
      .cp-dual { flex:1; display:flex; min-height:0; }
      .layout-horizontal { flex-direction:row; }
      .layout-vertical { flex-direction:column; }
      .cp-pane { flex:1; position:relative; overflow:hidden; min-height:0; }
      .cp-label { position:absolute; top:8px; left:50%; transform:translateX(-50%); color:rgba(255,255,255,0.5); font-size:11px; background:rgba(0,0,0,0.4); padding:2px 8px; border-radius:8px; z-index:5; pointer-events:none; }
      .cp-divider { flex-shrink:0; background:rgba(255,255,255,0.2); }
      .divider-horizontal { width:1px; }
      .divider-vertical { height:1px; }
      .cp-controls { position:absolute; bottom:12px; left:50%; transform:translateX(-50%); display:flex; gap:6px; background:rgba(20,20,40,0.94); border-radius:20px; padding:4px 10px; z-index:25; border:1px solid rgba(255,255,255,0.12); }
      .cp-btn { padding:4px 8px; border-radius:10px; font-size:11px; color:rgba(255,255,255,0.7); cursor:pointer; white-space:nowrap; transition:background 0.2s; }
      .cp-btn.active { background:rgba(66,133,244,0.3); color:#fff; }
    </style>`

    c.querySelector('#cpBack')?.addEventListener('click', () => router.back())
    c.querySelector('#cpToggleLayout')?.addEventListener('click', () => this._onToggleLayout())
    c.querySelector('#cpToggleSync')?.addEventListener('click', () => this._onToggleSync())
    c.querySelector('#cpAlignView')?.addEventListener('click', () => this._onAlignViews())
    c.querySelector('#cpAlignStyle')?.addEventListener('click', () => this._onAlignStyle())
    c.querySelector('#cpToggleSettings')?.addEventListener('click', () => this._onToggleSettings())

    // 如果设置面板已展开（由 _renderSettings 内联渲染），需要重新绑定事件
    if (this._settingsExpanded) {
      setTimeout(() => this._bindSettingsEvents(), 0)
    }
  }

  _renderSettings() {
    if (!this._settingsExpanded) return ''
    const s = this._state
    const cd = s.crystalData || {}

    const genSide = (prefix, sideLabel, layoutTitle) => {
      const show = (k) => s[prefix + k]
      // 图层开关列表（分子晶体隐藏"键"开关，有氢键时显示氢键开关）
      const toggles = [
        ['Atoms', '原子'], ['AtomLabels', '标签'],
        ...(s.isMolecularCrystal ? [] : [['Bonds', '键']]),
        ...(s.hasHydrogenBonds ? [['HydrogenBonds', '氢键']] : []),
        ['Axes', '轴'], ['Octahedral', '八面体空隙'], ['Tetrahedral', '四面体空隙'],
        ['AuxiliaryBody', '体对角'], ['AuxiliaryFace', '面对角'], ['LatticePoints', '点阵型式']
      ]
      // 变换晶胞原点（左右独立）
      let equivHtml = ''
      if (s.equivalentSettings && s.equivalentSettings.length > 0) {
        const idx = s[prefix + 'EquivalentIndex'] || 0
        equivHtml = `<div class="cs-section"><span class="cs-st">变换晶胞原点</span><div class="cs-sel">`
        for (let i = 0; i < s.equivalentSettings.length; i++) {
          equivHtml += `<span class="cs-opt${idx === i ? ' active' : ''}" data-cp-side="${prefix}" data-cp-act="equivalent" data-cp-idx="${i}">${s.equivalentSettings[i].label}</span>`
        }
        equivHtml += `</div></div>`
      }
      // 分元素显隐（仅在原子图层开启时显示）
      let elemHtml = ''
      if (show('ShowAtoms') && cd.atoms) {
        const vis = s[prefix + 'AtomVisibility'] || {}
        elemHtml = `<div class="cs-section"><span class="cs-st">元素筛选</span><div class="cs-toggles">`
        for (const g of cd.atoms) {
          elemHtml += `<span class="cs-tog${vis[g.element] !== false ? ' on' : ''}" data-cp-side="${prefix}" data-cp-act="elementToggle" data-cp-el="${g.element}">${g.element}</span>`
        }
        elemHtml += `</div></div>`
      }
      return `
      <div class="cs-col">
        <div class="cs-col-header"><span class="cs-col-dot" style="background:${sideLabel==='左'?'#4285F4':'#EA4335'}"></span><span class="cs-col-title">${layoutTitle}</span></div>
        <div class="cs-section"><span class="cs-st">显示模型</span>
          <div class="cs-sel">
            <span class="cs-opt${show('ModelType')==='ballStick'?' active':''}" data-cp-side="${prefix}" data-cp-act="model" data-cp-val="ballStick">球棍</span>
            <span class="cs-opt${show('ModelType')==='cpk'?' active':''}" data-cp-side="${prefix}" data-cp-act="model" data-cp-val="cpk">CPK</span>
          </div>
        </div>
        ${equivHtml}
        ${elemHtml}
        <div class="cs-section"><span class="cs-st">图层</span>
          <div class="cs-toggles">
            ${toggles.map(([k, l]) => `<span class="cs-tog${show('Show'+k)?' on':''}" data-cp-side="${prefix}" data-cp-act="toggle" data-cp-layer="${k}">${l}</span>`).join('')}
          </div>
        </div>
      </div>`
    }

    const isHoriz = s.layoutMode === 'horizontal'
    // 共享设置（两侧同步）
    const sharedHtml = s.isOrthogonalCell ? `
      <div class="cs-shared-row">
        <span class="cs-st cs-shared-label">共享设置（两侧同步）</span>
        <span class="cs-tog${s.partialAtoms ? ' on' : ''}" data-cp-act="partialAtoms">裁剪</span>
      </div>` : ''

    return `
    <div class="cs-panel" id="csPanel">
      ${sharedHtml}
      <div class="cs-cols">
        ${genSide('left', '左', isHoriz ? '左侧设置' : '上侧设置')}
        <div class="cs-divider-col"></div>
        ${genSide('right', '右', isHoriz ? '右侧设置' : '下侧设置')}
      </div>
    </div>
    <style>
      .cs-panel { position:absolute; bottom:0; left:0; right:0; background:rgba(18,18,35,0.97); border-top:1px solid rgba(255,255,255,0.12); z-index:30; max-height:55vh; overflow-y:auto; padding-bottom:60px; }
      .cs-cols { display:flex; padding:8px 0; }
      .cs-col { flex:1; padding:8px; }
      .cs-divider-col { width:1px; background:rgba(255,255,255,0.1); flex-shrink:0; }
      .cs-col-header { display:flex; align-items:center; justify-content:center; gap:4px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.08); margin-bottom:4px; }
      .cs-col-dot { width:7px; height:7px; border-radius:50%; }
      .cs-col-title { color:#fff; font-size:13px; font-weight:500; }
      .cs-section { margin-bottom:6px; }
      .cs-st { color:rgba(255,255,255,0.45); font-size:10px; display:block; margin-bottom:2px; }
      .cs-sel { display:flex; gap:3px; }
      .cs-opt { flex:1; text-align:center; padding:4px 0; font-size:10px; color:rgba(255,255,255,0.5); background:rgba(255,255,255,0.05); border-radius:4px; cursor:pointer; border:1px solid rgba(255,255,255,0.06); }
      .cs-opt.active { color:#fff; background:rgba(66,133,244,0.3); border-color:rgba(66,133,244,0.4); }
      .cs-toggles { display:flex; flex-wrap:wrap; gap:3px; }
      .cs-tog { padding:3px 5px; font-size:9px; color:rgba(255,255,255,0.4); background:rgba(255,255,255,0.05); border-radius:3px; cursor:pointer; border:1px solid rgba(255,255,255,0.06); }
      .cs-tog.on { color:#fff; background:rgba(66,133,244,0.3); border-color:rgba(66,133,244,0.4); }
      .cs-shared-row { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid rgba(255,255,255,0.08); }
      .cs-shared-label { margin:0; white-space:nowrap; }
    </style>`
  }

  /** 生成某一侧 viewer-canvas 的完整 props（增量更新与初始化共用） */
  _mkProps(side) {
    const s = this._state
    return {
      crystalId: this._crystalId,
      modelType: s[side + 'ModelType'], stickRadius: s[side + 'StickRadius'],
      showAtoms: s[side + 'ShowAtoms'], showWireframe: true,
      showInterstices: s[side + 'ShowInterstices'],
      showOctahedral: s[side + 'ShowOctahedral'],
      showTetrahedral: s[side + 'ShowTetrahedral'],
      showSymmetry: false, showBonds: s[side + 'ShowBonds'],
      showHydrogenBonds: s[side + 'ShowHydrogenBonds'],
      showAxes: s[side + 'ShowAxes'],
      showAuxiliaryBody: s[side + 'ShowAuxiliaryBody'],
      showAuxiliaryFace: s[side + 'ShowAuxiliaryFace'],
      auxiliaryLineAboveAtoms: s.auxiliaryLineAboveAtoms,
      atomScale: s[side + 'AtomScale'], opacity: s[side + 'Opacity'],
      cellDisplayMode: s[side + 'CellDisplayMode'],
      fractionalShift: s[side + 'FractionalShift'],
      partialAtoms: s.partialAtoms,
      lightConfig: s.lightConfig,
      atomVisibility: s[side + 'AtomVisibility'],
      showAtomLabels: s[side + 'ShowAtomLabels'],
      showLatticePoints: s[side + 'ShowLatticePoints'],
      depthFog: s.depthFog
    }
  }

  /** 增量更新两侧画布（不销毁重建，由 setProps 内部智能处理） */
  _updateCanvases() {
    if (this._leftCanvas) this._leftCanvas.setProps(this._mkProps('left'))
    if (this._rightCanvas) this._rightCanvas.setProps(this._mkProps('right'))
  }

  _initCanvases() {
    const s = this._state
    const leftPane = this._container.querySelector('#leftPane')
    const rightPane = this._container.querySelector('#rightPane')

    const onAtomTap = (e) => {
      const el = e.detail?.element
      if (el) window.wx.showToast({ title: el, icon: 'none', duration: 800 })
    }

    this._leftCanvas = new ViewerCanvas({
      container: leftPane, canvasId: 'compareCanvasLeft', props: this._mkProps('left'),
      events: {
        viewstatechange: (e) => this._onViewStateChange('left', e.detail),
        loaded: () => this._onCanvasLoaded(),
        atomTap: onAtomTap,
        resetview: (e) => this._onResetView('left')
      }
    })
    this._leftCanvas.mount()

    this._rightCanvas = new ViewerCanvas({
      container: rightPane, canvasId: 'compareCanvasRight', props: this._mkProps('right'),
      events: {
        viewstatechange: (e) => this._onViewStateChange('right', e.detail),
        loaded: () => this._onCanvasLoaded(),
        atomTap: onAtomTap,
        resetview: (e) => this._onResetView('right')
      }
    })
    this._rightCanvas.mount()
  }

  _onCanvasLoaded() {
    this._canvasLoadedCount++
    if (this._canvasLoadedCount >= 2 && this._pendingViewState) {
      const vs = this._pendingViewState
      const rotationState = { theta: vs.theta, phi: vs.phi, panOffset: { x:0,y:0,z:0 }, crystalQuat: vs.crystalQuat || { x:0,y:0,z:0,w:1 } }
      this._leftCanvas?.applyViewState(rotationState)
      this._rightCanvas?.applyViewState(rotationState)
      this._pendingViewState = null
    }
  }

  _onViewStateChange(source, viewState) {
    if (!this._state.syncMode || this._syncing) return
    this._syncing = true
    if (source === 'left') this._rightCanvas?.applyViewState(viewState)
    else this._leftCanvas?.applyViewState(viewState)
    this._syncing = false
  }

  _onResetView(source) {
    // 非联动模式下各自独立重置（已在 viewer-canvas 自行处理）
    if (!this._state.syncMode) return
    // 联动模式下双击一侧时同步重置另一侧
    if (source === 'left') this._rightCanvas?.resetView()
    else this._leftCanvas?.resetView()
  }

  _onToggleLayout() {
    const s = this._state
    const newMode = s.layoutMode === 'horizontal' ? 'vertical' : 'horizontal'
    s.layoutMode = newMode

    // 平滑切换：不销毁画布，只更新CSS布局和调整frustum
    const dual = this._container?.querySelector('.cp-dual')
    const divider = this._container?.querySelector('.cp-divider')
    if (dual) {
      dual.classList.remove('layout-horizontal', 'layout-vertical')
      dual.classList.add('layout-' + newMode)
    }
    if (divider) {
      divider.classList.remove('divider-horizontal', 'divider-vertical')
      divider.classList.add('divider-' + newMode)
    }

    // frustum 与画布宽度成正比：竖屏全宽保持原始大小，横屏半宽等比缩小
    const scale = newMode === 'horizontal' ? 2.0 : 0.5
    const vs = this._leftCanvas?.getViewState()
    const targetFrustum = vs?.frustumSize ? vs.frustumSize * scale : null

    // 更新布局标签文字
    const newLabelText = newMode === 'horizontal' ? '☰竖屏' : '▮横屏'
    const toggleBtn = this._container?.querySelector('#cpToggleLayout')
    if (toggleBtn) toggleBtn.textContent = newLabelText

    // 更新画布标签
    const leftLabel = this._container?.querySelector('#leftPane .cp-label')
    const rightLabel = this._container?.querySelector('#rightPane .cp-label')
    if (leftLabel) leftLabel.textContent = s.leftModelType === 'cpk' ? 'CPK空间填充' : '球棍模型'
    if (rightLabel) rightLabel.textContent = s.rightModelType === 'cpk' ? 'CPK空间填充' : '球棍模型'

    // 延迟等CSS布局生效后调整frustum并resize
    setTimeout(() => {
      if (targetFrustum) {
        this._leftCanvas?.applyViewState({ frustumSize: targetFrustum })
        this._rightCanvas?.applyViewState({ frustumSize: targetFrustum })
      }
      this._leftCanvas?.resize()
      this._rightCanvas?.resize()
    }, 200)

    // 如果设置面板已展开，重建它以更新列标题（左/右 → 上/下）
    if (this._settingsExpanded) {
      const panel = this._container?.querySelector('#csPanel')
      if (panel) {
        panel.remove()
        const div = document.createElement('div')
        div.innerHTML = this._renderSettings()
        this._container.appendChild(div.firstElementChild)
        this._bindSettingsEvents()
      }
    }
  }

  _onToggleSync() {
    this._state.syncMode = !this._state.syncMode
    const btn = this._container.querySelector('#cpToggleSync')
    if (btn) {
      btn.className = 'cp-btn' + (this._state.syncMode ? ' active' : '')
      btn.textContent = this._state.syncMode ? '🔗联动' : '🔓独立'
    }
    if (this._state.syncMode) this._onAlignViews()
  }

  _onAlignViews() {
    const ls = this._leftCanvas?.getViewState()
    if (ls && this._rightCanvas) this._rightCanvas.applyViewState(ls)
    window.wx.showToast({ title: '视角已对齐', icon: 'success', duration: 1000 })
  }

  _onAlignStyle() {
    const s = this._state
    const keys = ['ModelType','StickRadius','ShowAtoms','ShowBonds','ShowAxes','ShowHydrogenBonds','ShowLatticePoints','ShowAtomLabels','ShowInterstices','ShowOctahedral','ShowTetrahedral','ShowAuxiliaryBody','ShowAuxiliaryFace','AtomScale','Opacity','CellDisplayMode']
    for (const k of keys) s['right' + k] = s['left' + k]
    s.rightAtomVisibility = { ...s.leftAtomVisibility }
    s.rightEquivalentIndex = s.leftEquivalentIndex
    s.rightFractionalShift = [...s.leftFractionalShift]
    // 增量更新右侧画布（不销毁重建）
    if (this._rightCanvas) this._rightCanvas.setProps(this._mkProps('right'))
    window.wx.showToast({ title: '样式已对齐', icon: 'success', duration: 1000 })
  }

  _onToggleSettings() {
    this._settingsExpanded = !this._settingsExpanded
    const panel = this._container.querySelector('#csPanel')
    if (panel) {
      panel.remove()
    } else if (this._settingsExpanded) {
      const tmp = document.createElement('div')
      tmp.innerHTML = this._renderSettings()
      this._container.appendChild(tmp.firstElementChild)
      this._bindSettingsEvents()
    }
    // 更新按钮样式
    const btn = this._container.querySelector('#cpToggleSettings')
    if (btn) {
      btn.className = 'cp-btn' + (this._settingsExpanded ? ' active' : '')
      btn.textContent = this._settingsExpanded ? '⚙收起' : '⚙设置'
    }
  }

  _bindSettingsEvents() {
    const panel = this._container.querySelector('#csPanel')
    if (!panel) return
    panel.addEventListener('click', (e) => {
      const el = e.target.closest('[data-cp-act]')
      if (!el) return
      const { cpSide, cpAct, cpLayer, cpVal, cpIdx, cpEl } = el.dataset
      const s = this._state
      if (cpAct === 'model') {
        s[cpSide + 'ModelType'] = cpVal
      } else if (cpAct === 'toggle') {
        s[cpSide + 'Show' + cpLayer] = !s[cpSide + 'Show' + cpLayer]
      } else if (cpAct === 'equivalent') {
        const idx = parseInt(cpIdx, 10)
        const settings = s.equivalentSettings
        if (idx >= 0 && idx < settings.length) {
          s[cpSide + 'EquivalentIndex'] = idx
          s[cpSide + 'FractionalShift'] = settings[idx].shift || [0, 0, 0]
        }
      } else if (cpAct === 'elementToggle') {
        const vis = { ...(s[cpSide + 'AtomVisibility'] || {}) }
        vis[cpEl] = !vis[cpEl]
        s[cpSide + 'AtomVisibility'] = vis
      } else if (cpAct === 'partialAtoms') {
        s.partialAtoms = !s.partialAtoms
      }
      // 增量更新画布（不销毁重建，由 setProps 智能处理）
      this._updateCanvases()
      // 重建设置面板（刷新激活态与元素筛选）
      if (this._settingsExpanded) {
        const panel = this._container.querySelector('#csPanel')
        if (panel) { panel.remove(); const div = document.createElement('div'); div.innerHTML = this._renderSettings(); this._container.appendChild(div.firstElementChild); this._bindSettingsEvents() }
      }
    })
  }
}
