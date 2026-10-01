/**
 * 晶体结构对比页面 (H5)
 * 左右分栏展示同一晶体的两种模型，支持联动/独立交互
 */
import { ViewerCanvas } from '@crystal/components/viewer-canvas.js'
import { getCrystalData } from '@crystal/lib/crystal-loader.js'
import { router } from '../shell/router.js'
import { globalData } from '../shell/app-state.js'
import { registerViewerPage, unregisterViewerPage } from '../shell/agent-bridge.js'
import { createComparePageAdapter } from '@modules/crystal/adapters/compare-page-adapter.js'
// ★ 别名 `@i18n`（vite）——页面代码走别名，**字典文件**才走相对路径（守卫要能 import 它）。
import { t } from '@i18n/index.js'

/**
 * 模型名的两种叫法（长 / 短）。
 *
 * ★ 为什么要走 `t()` 而不是进 `text` 表：这里的位置是**带变量的模板串**
 *   （`${晶体名} · ${模型名}`），守卫按"整段原文"要求登记，而运行时那一段的
 *   文字是拼出来的 —— 扫描替换匹配不到。这类必须显式取键。
 * ★ 两种叫法都要翻译：面板按钮写「球棍模型」，两侧标签在双晶体模式下写「球棍」。
 */
function modelName(m, short) {
  if (m === 'cpk') return t(short ? 'pages.compare.cpkShort' : 'pages.compare.cpkFill')
  return t(short ? 'pages.compare.ballStickShort' : 'pages.compare.ballStick')
}

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
    // ★ 双晶体并排：右侧可选**另一个**晶体（`#/compare/naCl?b=csCl`）。
    //   缺省为 null ⇒ 回到原来的"同一晶体 × 两种模型"模式，旧链接与旧行为照常工作。
    //   用 query 参数而不是新路由模式，是为了不破坏已有链接。
    this._crystalIdB = params.b || null
    this._container = null
    this._leftCanvas = null
    this._rightCanvas = null
    this._canvasLoadedCount = 0
    this._pendingViewState = null
    this._syncing = false
    this._settingsExpanded = false

    // 状态
    this._state = {
      crystalName: '', crystalNameB: '', crystalData: null, showIntersticeControl: false,
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
      // ★ 高亮元素（两侧共享）：由智能体的 highlightAtoms 动作设置，见 applyIntent。
      //   各画布按元素符号匹配点亮自己含有的元素（"高亮 Na 和 Cs"左亮 Na、右亮 Cs）。
      highlightElements: null,
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
      // ★ 双晶体模式：右侧的晶体名。无第二个晶体时为空串 ⇒ 页面退回
      //   "同一晶体 × 两种模型"的原有显示，旧链接与旧行为完全不受影响。
      const dataB = this._crystalIdB ? getCrystalData(this._crystalIdB) : null
      s.crystalNameB = dataB ? (dataB.name || this._crystalIdB) : ''
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

    // 调试把手（只读为主）：对比页有两个 canvas，诊断"两侧不一致"这类问题时
    // 需要直接读它们的视角状态。与 `window.__crystalAgent` 同样的用途。
    if (typeof window !== 'undefined') window.__comparePage = this

    // ★ 注册为智能体可驱动的视图：对比页此前不注册，智能体在对比页时
    //   getAdapter() 返回 null（表现为"当前没有可驱动的三维视图"）。注册后
    //   highlightAtoms 等动作即可落到对比页（见 compare-page-adapter）。
    registerViewerPage(this, createComparePageAdapter(this))
  }

  unmount() {
    unregisterViewerPage(this)
    if (typeof window !== 'undefined' && window.__comparePage === this) window.__comparePage = null
    if (this._leftCanvas) { this._leftCanvas.unmount(); this._leftCanvas = null }
    if (this._rightCanvas) { this._rightCanvas.unmount(); this._rightCanvas = null }
    this._container = null
  }

  /**
   * 智能体受控动作的落点（经 compare-page-adapter.setProps 调用）。
   *
   * ★ 目前只支持 highlight（高亮是智能体在对比页做可视化诊断的主要手段）。
   *   其余 kind 未接入——但 adapter.setProps 已在传入未知字段时抛错，
   *   模型能通过 failed 知道"这个动作对比页不支持"，而不是静默失效。
   */
  applyIntent(intent) {
    if (!intent || intent.kind !== 'highlight') return
    this._state.highlightElements = (intent.elements && intent.elements.length) ? intent.elements : null
    this._updateCanvases()
  }

  /**
   * 当前视图状态（供感知层 getSnapshot 读）。以**左侧主晶体**为口径，
   * 附上对比页特有的双晶体信息与高亮。
   */
  getViewProps() {
    const s = this._state
    return {
      mode: 'compare',
      crystalId: this._crystalId,
      crystalIdB: this._crystalIdB,
      crystalName: s.crystalName,
      crystalNameB: s.crystalNameB,
      highlightElements: s.highlightElements,
      // 左侧作为主口径（感知层按它判断"当前在看哪个晶体"）
      modelType: s.leftModelType,
      atomScale: s.leftAtomScale,
      stickRadius: s.leftStickRadius,
      opacity: s.leftOpacity,
      cellDisplayMode: s.leftCellDisplayMode,
      atomVisibility: s.leftAtomVisibility,
      showAtoms: s.leftShowAtoms,
      showBonds: s.leftShowBonds,
      showInterstices: s.leftShowInterstices,
      showOctahedral: s.leftShowOctahedral,
      showTetrahedral: s.leftShowTetrahedral,
      showSymmetry: false,
      showAxes: s.leftShowAxes,
      showAuxiliaryBody: s.leftShowAuxiliaryBody,
      showAuxiliaryFace: s.leftShowAuxiliaryFace,
      showAtomLabels: s.leftShowAtomLabels,
      showHydrogenBonds: s.leftShowHydrogenBonds,
      showLatticePoints: s.leftShowLatticePoints,
    }
  }

  /**
   * 语言变更时由路由调用（见 shell/router.js 的 `_notifyLang`）。
   *
   * ★ 只重画**走 `t()` 取值**的那几处（标题 / 两侧标签 / 控制条 / 设置面板的列标题）：
   *   它们的值在渲染那一刻就算死了，DOM 扫描替换够不着。
   *   静态文案（"图层""元素筛选"…）由运行时的 restore + sweep 处理，这里不重复。
   * ★ **绝不重建画布**：两个 ViewerCanvas 的几何与语言无关，重建它们纯属浪费，
   *   而且会丢掉当前视角与联动状态。
   */
  onLangChange() {
    const s = this._state
    const tEl = this._container?.querySelector('.cp-title')
    if (tEl) {
      tEl.textContent = s.crystalNameB
        ? `${s.crystalName} vs ${s.crystalNameB}`
        : t('pages.compare.titleOne', { name: s.crystalName })
    }
    const lL = this._container?.querySelector('#leftPane .cp-label')
    const lR = this._container?.querySelector('#rightPane .cp-label')
    if (lL) {
      lL.textContent = s.crystalNameB
        ? `${s.crystalName} · ${modelName(s.leftModelType, true)}`
        : modelName(s.leftModelType, false)
    }
    if (lR) {
      lR.textContent = s.crystalNameB
        ? `${s.crystalNameB} · ${modelName(s.rightModelType, true)}`
        : modelName(s.rightModelType, false)
    }
    const btnLayout = this._container?.querySelector('#cpToggleLayout')
    if (btnLayout) {
      btnLayout.textContent = s.layoutMode === 'horizontal'
        ? t('pages.compare.toVertical') : t('pages.compare.toHorizontal')
    }
    const btnSync = this._container?.querySelector('#cpToggleSync')
    if (btnSync) btnSync.textContent = s.syncMode ? t('pages.compare.syncOn') : t('pages.compare.syncOff')
    const btnSet = this._container?.querySelector('#cpToggleSettings')
    if (btnSet) {
      btnSet.textContent = this._settingsExpanded
        ? t('pages.compare.settingsCollapse') : t('pages.compare.settings')
    }
    // 设置面板开着时重建它：四列标题（左/右 · 上/下）是 t() 取的，不重建就停在旧语言。
    // 面板里其余静态文案会被 startAutoSweep 补扫（它盯着 document.body）。
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

  _render() {
    const c = this._container
    const s = this._state

    c.innerHTML = `
    <div class="compare-page">
      <div data-page-topbar class="cp-top-bar">
        <span class="cp-back" id="cpBack">← 返回</span>
        <span class="cp-title">${s.crystalNameB
          ? `${s.crystalName} vs ${s.crystalNameB}`
          : t('pages.compare.titleOne', { name: s.crystalName })}</span>
      </div>

      <div class="cp-dual layout-${s.layoutMode}">
        <div class="cp-pane" id="leftPane">
          <span class="cp-label">${s.crystalNameB
            ? `${s.crystalName} · ${modelName(s.leftModelType, true)}`
            : modelName(s.leftModelType, false)}</span>
        </div>
        <div class="cp-divider divider-${s.layoutMode}"></div>
        <div class="cp-pane" id="rightPane">
          <span class="cp-label">${s.crystalNameB
            ? `${s.crystalNameB} · ${modelName(s.rightModelType, true)}`
            : modelName(s.rightModelType, false)}</span>
        </div>
      </div>

      <div class="cp-controls">
        <span class="cp-btn" id="cpToggleLayout">${s.layoutMode === 'horizontal'
          ? t('pages.compare.toVertical') : t('pages.compare.toHorizontal')}</span>
        <span class="cp-btn${s.syncMode ? ' active' : ''}" id="cpToggleSync">${s.syncMode
          ? t('pages.compare.syncOn') : t('pages.compare.syncOff')}</span>
        <span class="cp-btn" id="cpAlignView">↺对齐视角</span>
        <span class="cp-btn" id="cpAlignStyle">≡对齐样式</span>
        <span class="cp-btn${this._settingsExpanded ? ' active' : ''}" id="cpToggleSettings">⚙设置</span>
      </div>
    </div>
    ${this._renderSettings()}
    <style>
      .compare-page { width:100vw; height:100vh; display:flex; flex-direction:column; background:#ffffff; overflow:hidden; position:relative; }
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

    /**
     * 生成一侧的设置列。
     *
     * ★ 第 2 个参数原先是 `'左'/'右'` 两个字面量，只用来挑圆点颜色
     *   （`sideLabel==='左'?'#4285F4':'#EA4335'`）—— 那是**用中文当枚举值**：
     *   它既不该被翻译，又会污染覆盖率清单（守卫把它算成待译文案）。
     *   现在直接传颜色，中文枚举随之消失。
     */
    const genSide = (prefix, sideColor, layoutTitle) => {
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
        <div class="cs-col-header"><span class="cs-col-dot" style="background:${sideColor}"></span><span class="cs-col-title">${layoutTitle}</span></div>
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
        ${genSide('left', '#4285F4', isHoriz ? t('pages.compare.leftPanel') : t('pages.compare.topPanel'))}
        <div class="cs-divider-col"></div>
        ${genSide('right', '#EA4335', isHoriz ? t('pages.compare.rightPanel') : t('pages.compare.bottomPanel'))}
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
      // ★ 右侧在有第二个晶体时用它，否则与左侧同晶体（原"双模型对比"模式）
      crystalId: (side === 'right' && this._crystalIdB) ? this._crystalIdB : this._crystalId,
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
      depthFog: s.depthFog,
      highlightElements: s.highlightElements
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
    if (this._canvasLoadedCount < 2) return

    // ★ **对比两个不同晶体时，样式默认对齐**（静默，不弹提示）。
    //
    //   本页有两种用途，对"样式是否该一致"的要求正好相反：
    //     · 同一晶体的**双模型对比**（球棍 vs CPK）——两侧样式**刻意不同**，那才是重点；
    //     · **两个不同晶体**的对比——样式必须一致，否则"一个球棍一个 CPK"，
    //       学生分不清看到的差异是来自晶体本身还是来自显示方式（实测反馈）。
    //   区分依据就是"有没有第二个晶体"（`_crystalIdB`）：有则对齐，无则保持独立。
    //   （原先只能手动点「样式对齐」——功能是有的，但学生不知道要点那一下。）
    if (this._crystalIdB) this._onAlignStyle(true)

    if (this._pendingViewState) {
      const vs = this._pendingViewState
      const rotationState = { theta: vs.theta, phi: vs.phi, panOffset: { x:0,y:0,z:0 }, crystalQuat: vs.crystalQuat || { x:0,y:0,z:0,w:1 } }
      this._leftCanvas?.applyViewState(rotationState)
      this._rightCanvas?.applyViewState(rotationState)
      this._pendingViewState = null
    }

    // ★ 统一两侧的**视景体（缩放）**。
    //
    //   双晶体模式下两个晶体的尺寸不同，各自的默认视景体也不同——实测
    //   NaCl 是 20.97、CsCl 是 16.9。于是两侧缩放不同，**旋转同样的角度
    //   在屏幕上看起来幅度不同**，学生会觉得"两侧转起来不一致"（就是这样被报出来的）。
    //
    //   「对齐样式」按设计只管样式（模型/图层/外观）、不管缩放，而用户点它的期望是
    //   "让两侧可以对照着看"——缩放不同就没法对照。故这里在**两侧都加载完之后自动统一**，
    //   不必等用户去点按钮。
    //
    //   取较大的那个：宁可两侧都略远（完整可见），也不要一侧被裁掉。
    const rL = this._leftCanvas && this._leftCanvas._state ? this._leftCanvas._state.radius : null
    const rR = this._rightCanvas && this._rightCanvas._state ? this._rightCanvas._state.radius : null
    if (rL && rR && Math.abs(rL - rR) > 0.01) {
      const r = Math.max(rL, rR)
      this._leftCanvas.applyViewState({ radius: r })
      this._rightCanvas.applyViewState({ radius: r })
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
    const newLabelText = newMode === 'horizontal' ? t('pages.compare.toVertical') : t('pages.compare.toHorizontal')
    const toggleBtn = this._container?.querySelector('#cpToggleLayout')
    if (toggleBtn) toggleBtn.textContent = newLabelText

    // 更新画布标签
    const leftLabel = this._container?.querySelector('#leftPane .cp-label')
    const rightLabel = this._container?.querySelector('#rightPane .cp-label')
    if (leftLabel) leftLabel.textContent = modelName(s.leftModelType, false)
    if (rightLabel) rightLabel.textContent = modelName(s.rightModelType, false)

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
      btn.textContent = this._state.syncMode ? t('pages.compare.syncOn') : t('pages.compare.syncOff')
    }
    if (this._state.syncMode) this._onAlignViews()
  }

  _onAlignViews() {
    const ls = this._leftCanvas?.getViewState()
    if (ls && this._rightCanvas) this._rightCanvas.applyViewState(ls)
    window.wx.showToast({ title: '视角已对齐', icon: 'success', duration: 1000 })
  }

  /**
   * 把右侧的样式对齐到左侧。
   *
   * @param {boolean} [silent] 静默模式（不弹提示）——"对比两个不同晶体"时**初始化
   *        就调它**，此时弹一个"样式已对齐"很突兀（学生还没做任何操作）。
   */
  _onAlignStyle(silent) {
    const s = this._state
    const keys = ['ModelType','StickRadius','ShowAtoms','ShowBonds','ShowAxes','ShowHydrogenBonds','ShowLatticePoints','ShowAtomLabels','ShowInterstices','ShowOctahedral','ShowTetrahedral','ShowAuxiliaryBody','ShowAuxiliaryFace','AtomScale','Opacity','CellDisplayMode']
    for (const k of keys) s['right' + k] = s['left' + k]
    s.rightAtomVisibility = { ...s.leftAtomVisibility }
    s.rightEquivalentIndex = s.leftEquivalentIndex
    s.rightFractionalShift = [...s.leftFractionalShift]
    // 增量更新右侧画布（不销毁重建）
    if (this._rightCanvas) this._rightCanvas.setProps(this._mkProps('right'))

    // ★ 同时对齐**视景体（缩放）**。
    //   样式对了但缩放不同，"对照着看"仍然做不到——实测双晶体模式下
    //   NaCl 与 CsCl 的默认视景体差 4 个单位（20.97 vs 16.9），旋转同样的角度
    //   在屏幕上看起来幅度不同，会被当成"两侧不一致"。
    //   （这不是与「对齐视角」重复：那个按钮对齐的是完整的相机状态含转向，
    //     这里只统一"看得见多大范围"这一项，因为它是"样式可比"的前提。）
    const rL = this._leftCanvas && this._leftCanvas._state ? this._leftCanvas._state.radius : null
    const rR = this._rightCanvas && this._rightCanvas._state ? this._rightCanvas._state.radius : null
    if (rL && rR && Math.abs(rL - rR) > 0.01) {
      const r = Math.max(rL, rR)
      this._leftCanvas.applyViewState({ radius: r })
      this._rightCanvas.applyViewState({ radius: r })
    }

    // ★ 只刷新**两侧的模型标签**，不调 `_render()`——那会重建整个 DOM（画布也一起被
    //   销毁重建），把上面"增量更新右侧画布"的意义抵消掉。
    //   漏掉这一步的表现是：样式其实已经对齐了，但标签还写着「NaCl · 球棍 / CsCl · CPK」，
    //   学生（以及验证脚本）都会以为没生效（实测就是被这里绊住的）。
    const lL = this._container?.querySelector('#leftPane .cp-label')
    const lR = this._container?.querySelector('#rightPane .cp-label')
    if (lL) {
      lL.textContent = this._crystalIdB
        ? `${s.crystalName} · ${modelName(s.leftModelType, true)}`
        : modelName(s.leftModelType, false)
    }
    if (lR) {
      lR.textContent = this._crystalIdB
        ? `${s.crystalNameB} · ${modelName(s.rightModelType, true)}`
        : modelName(s.rightModelType, false)
    }

    if (!silent) window.wx.showToast({ title: '样式已对齐', icon: 'success', duration: 1000 })
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
      btn.textContent = this._settingsExpanded ? t('pages.compare.settingsCollapse') : t('pages.compare.settings')
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
