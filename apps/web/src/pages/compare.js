/**
 * 晶体结构对比页面 (H5)
 * 左右分栏展示同一晶体的两种模型，支持联动/独立交互
 */
import { ViewerCanvas } from '@crystal/components/viewer-canvas.js'
// ★ 原子信息卡与元素数据：与晶体查看页**同一套**（点原子应该看到一样的信息）
import { AtomInfoPopup } from '@crystal/components/atom-info-popup.js'
import elementsData from '@crystal/data/elements.js'
import { getCrystalData } from '@crystal/lib/crystal-loader.js'
// ★ 两侧「换晶体」的选择器要列出全部晶体：目录本来就是数据真源，不另抄一份清单
import crystalIndex from '@crystal/data/crystalIndex.js'
// ★ 能力判据只此一处（空隙图层 / 氢键 / 分子晶体），查看页也用同一份
import { crystalCaps } from '@modules/crystal/capabilities.js'
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
    /**
     * 已经"为哪块 B 晶体自动对齐过样式"。
     * ★★ 见 _onCanvasLoaded 的说明：不记住它，用户的每次右键样式改动都会被自动对齐回弹 ✗。
     */
    this._styleAlignedFor = null

    // 状态
    this._state = {
      crystalName: '', crystalNameB: '', crystalData: null, showIntersticeControl: false,
      syncMode: true,
    /**
     * ★★ 2026-10-12（用户要求）：「晶典在线对比模式在电脑端默认是（左右并排）这种模式与大小」。
     *   原先这里写死 `'vertical'`（上下排）。改为**按宽度**取默认：够宽就左右并排
     *   （两幅画布各拿半宽、整屏高，与用户截图一致）；窄屏仍上下排
     *   （否则每一侧只剩半屏宽，看不清楚）。用户随时可点控制条切换，切换逻辑没变。
     */
    layoutMode: (typeof window !== 'undefined' && window.innerWidth >= 900) ? 'horizontal' : 'vertical',
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

    // 由 _crystalId / _crystalIdB 派生界面状态（换晶体时走**同一个**方法）
    this._applyCrystalMeta()

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
    // ★ 原子信息卡也要一起卸（页面可反复挂载，不卸会累积）
    if (this._popups) {
      for (const side of Object.keys(this._popups)) {
        try { this._popups[side].popup.unmount() } catch (e) { /* 已卸 */ }
      }
      this._popups = null
    }
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
    // ★ 标签与标题统一走 _refreshLabels()：原先这段在 mount / onLangChange / 换晶体三处
    //   各写一份，改一处漏两处（本仓库的老毛病）
    this._refreshLabels()
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
        const host = this._container?.querySelector('#csHost')
        ;(host || this._container).appendChild(div.firstElementChild)
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

      <div class="cp-body">
        <!-- 设置面板（左侧抽屉）的挂载点：desktop 下它是**左列**（让位，不遮挡画布），
             窄屏下退化为底部抽屉（见下面的 CSS）。原先它被 append 到页面容器外，
             所以只能做成"盖在画布上"的浮层。 -->
        <div class="cs-host" id="csHost">${this._renderSettings()}</div>
        <div class="cp-main">
          <div class="cp-dual layout-${s.layoutMode}">
            <div class="cp-pane" id="leftPane">
              <span class="cp-label" data-side="left" title="${t('pages.compare.openCrystal')}">${s.crystalNameB
                ? `${s.crystalName} · ${modelName(s.leftModelType, true)}`
                : modelName(s.leftModelType, false)}</span>
              <div class="atom-popup-container" id="leftAtomPopup"></div>
            </div>
            <div class="cp-divider divider-${s.layoutMode}"></div>
            <div class="cp-pane" id="rightPane">
              <span class="cp-label" data-side="right" title="${t('pages.compare.openCrystal')}">${s.crystalNameB
                ? `${s.crystalNameB} · ${modelName(s.rightModelType, true)}`
                : modelName(s.rightModelType, false)}</span>
              <div class="atom-popup-container" id="rightAtomPopup"></div>
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
      </div>
    </div>
    <style>
      .compare-page { width:100vw; height:100vh; display:flex; flex-direction:column; background:#ffffff; overflow:hidden; position:relative; }
      .cp-top-bar { display:flex; align-items:center; padding:calc(12px + env(safe-area-inset-top)) 12px 8px; flex-shrink:0; z-index:20; background:linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0)); }
      .cp-back { min-width:30px; height:30px; padding:0 10px; display:flex; align-items:center; justify-content:center; border-radius:15px; background:rgba(255,255,255,0.15); color:#fff; font-size:18px; cursor:pointer; margin-right:10px; white-space:nowrap; }
      .cp-title { color:#fff; font-size:14px; font-weight:500; flex:1; }
      /* 主体：左列=设置抽屉（桌面），右侧=两幅画布 + 悬浮控制条 */
      .cp-body { flex:1; display:flex; min-height:0; position:relative; }
      .cp-main { flex:1; min-width:0; position:relative; display:flex; flex-direction:column; }
      .cp-dual { flex:1; display:flex; min-height:0; }
      .layout-horizontal { flex-direction:row; }
      .layout-vertical { flex-direction:column; }
      .cp-pane { flex:1; position:relative; overflow:hidden; min-height:0; }
      /* ★★ 2026-10-12（用户："对比模式的设置仍是黑色"）：表面与文字一律走**主题令牌**
         （浅色主题下面板/控制条是浅的），原值留在 fallback 位 ⇒ 没有宿主题时外观逐字不变。
         与晶体查看页的控制面板（components/layer-control.js）同一套做法。
         ★ 本文件是模板串：注释里**不能出现反引号**。 */
      .cp-label { position:absolute; top:8px; left:50%; transform:translateX(-50%); color:var(--text-dim, rgba(255,255,255,0.6)); font-size:11px; background:var(--card, rgba(0,0,0,0.4)); border:1px solid var(--line-soft, transparent); padding:2px 8px; border-radius:8px; z-index:5; cursor:pointer; }
      .cp-label:hover { color:var(--text, #fff); }
      .cp-divider { flex-shrink:0; background:var(--line, rgba(255,255,255,0.2)); }
      .divider-horizontal { width:1px; }
      .divider-vertical { height:1px; }
      .cp-controls { position:absolute; bottom:12px; left:50%; transform:translateX(-50%); display:flex; gap:6px; background:var(--card, rgba(20,20,40,0.94)); border-radius:20px; padding:4px 10px; z-index:25; border:1px solid var(--line, rgba(255,255,255,0.12)); }
      .cp-btn { padding:4px 8px; border-radius:10px; font-size:11px; color:var(--text-dim, rgba(255,255,255,0.7)); cursor:pointer; white-space:nowrap; transition:background 0.2s; }
      .cp-btn.active { background:rgba(66,133,244,0.28); color:var(--text, #fff); }
      /* 窄屏：设置仍是"盖在画布上"的底部抽屉（空间不够时让位反而看不清）
         ★ .cs-host 用 display:contents：它只是挂载点，真正的列由 .cs-panel 承担
           （否则多一层 div 会把 flex 布局截断，让位就不生效了）。 */
      .cs-host { display: contents; }

      /* ================= 对比页设置面板（左列 / 底部抽屉）=================
         ★★ 2026-10-12（用户要求）：电脑端设置面板放**左侧**、并且**让位**（不盖在画布上）：
            它是 cp-body 的左列（flex 项，固定 320px），画布区域自动缩到右侧，
            结构跟着 ResizeObserver 重新居中（与智能体抽屉、晶体查看页同一条机制）。
            窄屏退化为底部抽屉：空间不够时"让位"反而看不清。
         ★ 这些样式**必须放在页面常驻的 style 里**：原先它们跟着 _renderSettings() 的返回值
           一起给出，而动态注入那条路只取 firstElementChild（面板 div）⇒ style 块被丢弃 ✗，
            于是"桌面看着像左列"只是 flex 项的自然宽度，媒体查询从未生效、窄屏也跟着挤 ✗。
           教训：**样式与标记一起返回时，谁取第一个元素谁就可能把样式丢掉**。 */
      @media (min-width: 900px) {
        .cs-panel { flex:0 0 320px; width:320px; height:100%; max-height:none; overflow-y:auto; background:var(--card, rgba(18,18,35,0.97)); border-right:1px solid var(--line, rgba(255,255,255,0.12)); z-index:30; padding-bottom:8px; }
        /* 320px 的窄列里，两侧设置改为上下排 */
        .cs-cols { flex-direction:column; }
        .cs-divider-col { width:auto; height:1px; }
      }
      @media (max-width: 899px) {
        .cs-panel { position:absolute; bottom:0; left:0; right:0; background:var(--card, rgba(18,18,35,0.97)); border-top:1px solid var(--line, rgba(255,255,255,0.12)); z-index:30; max-height:55vh; overflow-y:auto; padding-bottom:60px; }
      }
      .cs-cols { display:flex; padding:8px 0; }
      .cs-col { flex:1; padding:8px; }
      .cs-divider-col { width:1px; background:var(--line, rgba(255,255,255,0.1)); flex-shrink:0; }
      .cs-col-header { display:flex; align-items:center; justify-content:center; gap:4px; padding:4px 0; border-bottom:1px solid var(--line-soft, rgba(255,255,255,0.08)); margin-bottom:4px; }
      .cs-col-dot { width:7px; height:7px; border-radius:50%; }
      .cs-col-title { color:var(--text, #fff); font-size:13px; font-weight:500; }
      .cs-section { margin-bottom:6px; }
      .cs-st { color:var(--text-dim, rgba(255,255,255,0.45)); font-size:10px; display:block; margin-bottom:2px; }
      .cs-sel { display:flex; gap:3px; }
      .cs-opt { flex:1; text-align:center; padding:4px 0; font-size:10px; color:var(--text-dim, rgba(255,255,255,0.5)); background:var(--card-2, rgba(255,255,255,0.05)); border-radius:4px; cursor:pointer; border:1px solid var(--line-soft, rgba(255,255,255,0.06)); }
      .cs-opt.active { color:var(--text, #fff); background:rgba(66,133,244,0.22); border-color:rgba(66,133,244,0.4); }
      .cs-toggles { display:flex; flex-wrap:wrap; gap:3px; }
      .cs-tog { padding:3px 5px; font-size:9px; color:var(--text-dim, rgba(255,255,255,0.45)); background:var(--card-2, rgba(255,255,255,0.05)); border-radius:3px; cursor:pointer; border:1px solid var(--line-soft, rgba(255,255,255,0.06)); }
      .cs-tog.on { color:var(--text, #fff); background:rgba(66,133,244,0.22); border-color:rgba(66,133,244,0.4); }
      .cs-shared-row { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid var(--line-soft, rgba(255,255,255,0.08)); }
      .cs-shared-label { margin:0; white-space:nowrap; }
      /* 两侧晶体选择器（见 _renderSettings 的 cs-crystal 行） */
      .cs-crystal { display:flex; gap:6px; padding:6px 12px 2px; }
      .cs-crystal select { flex:1; min-width:0; padding:4px 6px; border-radius:6px; font-size:11px; background:var(--card-2, rgba(255,255,255,0.06)); color:var(--text, #fff); border:1px solid var(--line-soft, rgba(255,255,255,0.12)); }
      .cs-crystal select:focus { outline:none; border-color:rgba(66,133,244,0.6); }
      /* 原子信息卡的挂载容器：铺满所在画布、默认不吃事件（显示时才打开 pointer-events） */
      .atom-popup-container { position:absolute; inset:0; pointer-events:none; z-index:1000; }
      /* 页内轻提示（视角/样式对齐的反馈；替代宿主里并不存在的 window.wx.showToast） */
      .cp-toast { position:absolute; left:50%; bottom:64px; transform:translateX(-50%); background:var(--card, rgba(20,20,40,0.94)); color:var(--text, #fff); border:1px solid var(--line, rgba(255,255,255,0.12)); padding:6px 14px; border-radius:14px; font-size:12px; z-index:40; pointer-events:none; }
    </style>`

    c.querySelector('#cpBack')?.addEventListener('click', () => router.back())
    c.querySelector('#cpToggleLayout')?.addEventListener('click', () => this._onToggleLayout())
    c.querySelector('#cpToggleSync')?.addEventListener('click', () => this._onToggleSync())
    c.querySelector('#cpAlignView')?.addEventListener('click', () => this._onAlignViews())
    c.querySelector('#cpAlignStyle')?.addEventListener('click', () => this._onAlignStyle())
    c.querySelector('#cpToggleSettings')?.addEventListener('click', () => this._onToggleSettings())

    /**
     * ★★ 2026-10-12（用户要求）：**点击两侧标签跳转到该晶体的查看页**。
     * ★ 标签的 pointer-events 已从 none 改回可点（见 .cp-label 的样式），
     *   否则这枚胶囊永远收不到点击。
     */
    c.querySelectorAll('.cp-label').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.side === 'right' ? (this._crystalIdB || this._crystalId) : this._crystalId
        if (id) router.navigate('/viewer/' + id)
      })
    })

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
      /**
       * 图层开关列表 —— **按该侧晶体的能力**给项（用户："没空隙显示功能的结构，设置中就不要
       * 显示空隙显示了；有氢键的结构，设置中也应可控制氢键的显隐"）。
       *
       * ★ 判据取自**晶体数据本身**（不是另抄的白名单）：
       *   · `octahedral` / `tetrahedral` 只有最密堆积（fcc / hcp）才有 ⇒ 没有就不显示这两项
       *     （在 NaCl、冰这类结构上打开了也什么都看不见 ✗）；
       *   · `hydrogenBonds` 只有真的含氢键的晶体才有 ⇒ 有才显示「氢键」这一项。
       * ★ 必须**逐侧**取：左右可能是两块不同的晶体（原先用共用的 s.isMolecularCrystal /
       *   s.hasHydrogenBonds —— 那是从**左侧**晶体派生的 ✗），且空隙项原先**无条件显示** ✗。
       */
      const caps = s[prefix + 'Caps'] || crystalCaps(prefix === 'right' ? this._crystalIdB : this._crystalId, prefix === 'right' ? (s.crystalDataB || cd) : cd)
      const toggles = [
        ['Atoms', '原子'], ['AtomLabels', '标签'],
        ...(caps.molecular ? [] : [['Bonds', '键']]),
        ...(caps.hydrogenBonds ? [['HydrogenBonds', '氢键']] : []),
        ['Axes', '轴'],
        ...(caps.interstices ? [['Octahedral', '八面体空隙'], ['Tetrahedral', '四面体空隙']] : []),
        ['AuxiliaryBody', '体对角'], ['AuxiliaryFace', '面对角'], ['LatticePoints', '点阵型式']
      ]
      // 变换晶胞原点（左右独立）
      let equivHtml = ''
      // ★ 逐侧取：右侧那块晶体的"原点变换选项"与左侧不同（同一晶体时才恰好相同）
      const sideEquiv = s[prefix + 'EquivalentSettings'] || s.equivalentSettings || []
      if (sideEquiv.length > 0) {
        const idx = s[prefix + 'EquivalentIndex'] || 0
        equivHtml = `<div class="cs-section"><span class="cs-st">变换晶胞原点</span><div class="cs-sel">`
        for (let i = 0; i < sideEquiv.length; i++) {
          equivHtml += `<span class="cs-opt${idx === i ? ' active' : ''}" data-cp-side="${prefix}" data-cp-act="equivalent" data-cp-idx="${i}">${sideEquiv[i].label}</span>`
        }
        equivHtml += `</div></div>`
      }
      // 分元素显隐（仅在原子图层开启时显示）★ 元素列同样逐侧取（右侧可能是另一块晶体）
      const sideData = (prefix === 'right' ? (s.crystalDataB || cd) : cd) || {}
      let elemHtml = ''
      if (show('ShowAtoms') && sideData.atoms) {
        const vis = s[prefix + 'AtomVisibility'] || {}
        elemHtml = `<div class="cs-section"><span class="cs-st">元素筛选</span><div class="cs-toggles">`
        for (const g of sideData.atoms) {
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

    /**
     * ★★ 2026-10-12（用户要求）：**对比模式支持手动更换左/右晶体**。
     *
     * 选项来自晶体目录本身（`crystalIndex`），不另抄一份清单 —— 目录加了新晶体这里自动有。
     * 右侧多一个「与左侧相同」：选它即退回"同一晶体 × 两种模型"的既有模式
     * （`_crystalIdB = null`），不必让用户自己去猜怎么退。
     */
    const opts = (selectedId) => crystalIndex
      .map((c) => `<option value="${c.id}"${c.id === selectedId ? ' selected' : ''}>${c.name}</option>`)
      .join('')
    const crystalHtml = `
      <div class="cs-crystal">
        <select data-crystal-side="left" title="${t('pages.compare.pickLeft')}">${opts(this._crystalId)}</select>
        <select data-crystal-side="right" title="${t('pages.compare.pickRight')}">
          <option value=""${this._crystalIdB ? '' : ' selected'}>${t('pages.compare.sameAsLeft')}</option>
          ${opts(this._crystalIdB || this._crystalId)}
        </select>
      </div>`

    return `
    <div class="cs-panel" id="csPanel">
      ${crystalHtml}
      ${sharedHtml}
      <div class="cs-cols">
        ${genSide('left', '#4285F4', isHoriz ? t('pages.compare.leftPanel') : t('pages.compare.topPanel'))}
        <div class="cs-divider-col"></div>
        ${genSide('right', '#EA4335', isHoriz ? t('pages.compare.rightPanel') : t('pages.compare.bottomPanel'))}
      </div>
    </div>`
  }

  /**
   * 换某一侧的晶体。
   *
   * ★ 只更新**该侧画布的 props**（viewer-canvas 内部按"晶体变了"就地重建几何），
   *   不调 `_render()` —— 那会重建整个 DOM（画布也一起被换掉）。这是本页的既有铁律。
   * ★ 两侧选成同一块晶体时把 B 置空：退回"同一晶体 × 两种模型"，
   *   与旧链接 / 旧行为的语义保持一致。
   */
  _setSideCrystal(side, id) {
    if (side === 'left') {
      if (id) this._crystalId = id
    } else {
      this._crystalIdB = id || null
    }
    if (this._crystalIdB === this._crystalId) this._crystalIdB = null
    this._applyCrystalMeta()
    // ★ 换晶体后新的一侧会**重新取景** ⇒ 记下"这一侧需要与另一侧对齐视角（比例）"，
    //   等它加载完立刻同步（见 _onCanvasLoaded / _syncViewFromOther）
    this._needViewSync = side
    this._updateCanvases()
    this._refreshLabels()
    // ★ 设置面板里的"元素筛选 / 原点变换"是**逐晶体**的 ⇒ 换完晶体必须重画它，
    //   否则右栏还列着上一块晶体的元素（实测：右侧已是 CsCl，元素栏却还写着 Cu）✗
    this._rebuildSettingsPanel()
  }

  /** 就地重建设置面板（不调 _render：那会重建整个 DOM、把画布也换掉） */
  _rebuildSettingsPanel() {
    if (!this._settingsExpanded || !this._container) return
    const panel = this._container.querySelector('#csPanel')
    if (!panel) return
    panel.remove()
    const div = document.createElement('div')
    div.innerHTML = this._renderSettings()
    const host = this._container.querySelector('#csHost')
    ;(host || this._container).appendChild(div.firstElementChild)
    this._bindSettingsEvents()
  }

  /** 刷新两侧标签（左上角那枚胶囊）与顶栏标题 —— 换晶体后必须跟着变 */
  _refreshLabels() {
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
  }

  /**
   * 把当前 `_crystalId` / `_crystalIdB` 派生成界面状态（名称、能力标志、可见性初值）。
   * ★ 从 mount() 里抽出来：换晶体走的是**同一条**派生逻辑，两处各写一份迟早漂开
   *   （本仓库反复记过的"同一个事实写两处"）。
   */
  _applyCrystalMeta() {
    const s = this._state
    const data = getCrystalData(this._crystalId)
    if (!data) return
    s.crystalData = data
    s.crystalName = data.name || this._crystalId
    const dataB = this._crystalIdB ? getCrystalData(this._crystalIdB) : null
    s.crystalNameB = dataB ? (dataB.name || this._crystalIdB) : ''
    s.showIntersticeControl = ['fcc', 'hcp'].includes(this._crystalId)
    s.isOrthogonalCell = data.lattice && data.lattice.alpha === 90 && data.lattice.beta === 90 && data.lattice.gamma === 90
    const MOLECULAR_IDS = ['co2', 'ice', 'i2', 'urea']
    s.isMolecularCrystal = MOLECULAR_IDS.includes(this._crystalId)
    s.hasHydrogenBonds = s.isMolecularCrystal && data.hydrogenBonds && data.hydrogenBonds.length > 0
    const METAL_IDS = ['fcc', 'bcc', 'hcp']
    const isMetal = METAL_IDS.includes(this._crystalId)
    if (s.isMolecularCrystal) {
      s.leftShowBonds = true; s.rightShowBonds = true
      s.leftShowHydrogenBonds = true; s.rightShowHydrogenBonds = true
    } else if (!isMetal) {
      s.leftShowBonds = true; s.rightShowBonds = true
    }
    s.equivalentSettings = data.equivalentSettings || []
    const defaultShift = s.equivalentSettings.length > 0 ? (s.equivalentSettings[0].shift || [0, 0, 0]) : [0, 0, 0]
    s.leftFractionalShift = defaultShift; s.rightFractionalShift = defaultShift
    /**
     * ★★ 2026-10-12（用户："右边图文不对应"）：**分元素显隐必须逐侧派生**。
     *   原先两张表都拿**左侧晶体**的原子算 ⇒ 右侧换成别的晶体后，
     *   它的可见性表里全是左晶体的元素（实测：右侧渲 CsCl，可见性却是 {Cu:true}）✗
     *   ⇒ 右侧的原子着色/显隐跟着出错，标签写着 CsCl、画面上却对不上。
     *   ★ 判据：凡是"逐侧"的数据，就不要用"只算一次、两边共用"的写法 ——
     *     同一晶体时两边一样是巧合，不同晶体时就是缺陷。
     */
    const visOf = (d) => {
      const o = {}
      if (d && d.atoms) for (const g of d.atoms) o[g.element] = true
      return o
    }
    s.leftAtomVisibility = visOf(data)
    s.rightAtomVisibility = visOf(dataB || data)
    // 变换晶胞原点：同样逐侧（左右可能是两块不同的晶体，选项本来就不同）
    s.leftEquivalentSettings = data.equivalentSettings || []
    s.rightEquivalentSettings = (dataB || data).equivalentSettings || []
    s.equivalentSettings = s.leftEquivalentSettings
    // ★ 右侧的**晶体数据**也要单独留着：设置面板里"元素筛选"那一栏要按**各侧自己的**元素列
    s.crystalDataB = dataB || data
    /**
     * ★★ 逐侧**能力**（见 modules/crystal/capabilities.js）：
     *   设置面板据此决定给哪些图层开关 —— 没有空隙数据的结构不显示空隙项，
     *   有氢键的才显示氢键项（用户："没空隙显示功能的结构…就不要显示空隙显示了；
     *   有氢键的结构…也应可控制氢键的显隐"）。
     */
    s.leftCaps = crystalCaps(this._crystalId, data)
    s.rightCaps = crystalCaps(this._crystalIdB || this._crystalId, dataB || data)
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

    /**
     * ★★ 2026-10-12（用户："对比模式点击原子，没触发原子信息弹窗"）：
     *   原先这里只调 `window.wx.showToast` —— 而 `window.wx` 在宿主里**根本不存在** ✗
     *   （微信小程序移植的残留，CLAUDE.md 待办第 14 条记着这一处），
     *   于是点击原子既不弹卡片、还抛异常把画布的拖拽状态卡住（组件侧已一并加固）。
     *   改：与晶体查看页**同一套**原子信息卡（AtomInfoPopup），左/右各一枚，
     *   点哪一侧就弹哪一侧的。
     */
    const sideAtomTap = (side) => (e) => this._onAtomTap(side, e.detail || {})

    this._leftCanvas = new ViewerCanvas({
      container: leftPane, canvasId: 'compareCanvasLeft', props: this._mkProps('left'),
      events: {
        viewstatechange: (e) => this._onViewStateChange('left', e.detail),
        loaded: () => this._onCanvasLoaded('left'),
        atomTap: sideAtomTap('left'),
        resetview: (e) => this._onResetView('left')
      }
    })
    this._leftCanvas.mount()

    this._rightCanvas = new ViewerCanvas({
      container: rightPane, canvasId: 'compareCanvasRight', props: this._mkProps('right'),
      events: {
        viewstatechange: (e) => this._onViewStateChange('right', e.detail),
        loaded: () => this._onCanvasLoaded('right'),
        atomTap: sideAtomTap('right'),
        resetview: (e) => this._onResetView('right')
      }
    })
    this._rightCanvas.mount()

    // 原子信息卡：左右各一枚，挂在各自画布容器里（与查看页同款组件）
    this._popups = {}
    for (const [side, id] of [['left', 'leftAtomPopup'], ['right', 'rightAtomPopup']]) {
      const host = this._container.querySelector('#' + id)
      if (!host) continue
      const popup = new AtomInfoPopup({
        container: host,
        props: { visible: false, atomData: null },
        events: { close: () => this._closeAtomPopup(side) }
      })
      popup.mount(host)
      this._popups[side] = { popup, host }
    }
  }

  /** 点原子：组出该原子的信息并弹卡（字段口径与晶体查看页一致） */
  _onAtomTap(side, { element, position }) {
    const entry = (this._popups || {})[side]
    if (!element || !entry) return
    const info = elementsData[element] || {}
    const pos = Array.isArray(position) && position.length >= 3
      ? '(' + position.slice(0, 3).map((v) => (((v % 1) + 1) % 1).toFixed(2)).join(', ') + ')'
      : ''
    entry.popup.setProps({
      visible: true,
      atomData: {
        element,
        name: info.name || element,
        enName: info.enName || '',
        color: info.color || '#fff',
        atomicNumber: info.atomicNumber || '',
        atomicMass: info.atomicMass || '',
        electronConfig: info.electronConfig || '',
        electronegativity: info.electronegativity || '',
        radius: info.radius || '',
        position: pos
      }
    })
    // 弹窗容器默认 pointer-events:none（不挡画布），要显示时临时打开
    entry.host.style.pointerEvents = 'auto'
  }

  _closeAtomPopup(side) {
    const entry = (this._popups || {})[side]
    if (!entry) return
    entry.popup.setProps({ visible: false })
    entry.host.style.pointerEvents = 'none'
  }

  _onCanvasLoaded(side) {
    this._canvasLoadedCount++
    /**
     * ★★ 2026-10-12（用户："对比模式切换晶体时，会出现两边比例不一致的情况，而鼠标拖动时会
     *   自动对齐比例……应该切换晶体时，新晶体自动与另一侧晶体比例保持一致"）：
     *   换晶体后新的一侧会**按自己的包围球重新取景** ⇒ 两侧 frustumSize 不同 ✗，
     *   而只有**拖动**时才走 `_onViewStateChange` 的联动同步 ⇒ 差这一步（用户描述的现象）。
     *   修法：换晶体时记下"哪一侧换了"（_needViewSync），等**那一侧**加载完（本函数）
     *   立刻把另一侧的视角（含 frustumSize，也就是比例）同步过来 —— 与拖动联动**同一条口径**。
     *   ★ 只在联动模式下做：非联动时两侧本就该各自独立。
     */
    if (side && this._needViewSync === side) {
      this._needViewSync = null
      if (this._state.syncMode) this._syncViewFromOther(side)
    }
    if (this._canvasLoadedCount < 2) return

    /**
     * ★★ 2026-10-12（用户："右侧设置无法独立修改" + "右侧设置与右侧样式不对应"）：
     *
     *   原先这里是 `if (this._crystalIdB) this._onAlignStyle(true)` —— **每次**加载都对齐 ✗：
     *     ① 用户改右侧样式 ⇒ setProps 触发重建 ⇒ 又 fire loaded ⇒ 立刻把右侧**对齐回左侧**
     *        ⇒ 右侧**永远改不动**（用户报的第 2 条）✗；
     *     ② 这行还在**加载流程内部**执行，它引发的 setProps 会重入 _loadCrystal 被吞掉
     *        ⇒ 面板（状态）写着"已对齐"，画面却还是旧样式（用户报的第 3 条）✗。
     *
     *   改法两条：**只在首次进入双晶体模式时对齐一次**，并且**跳出加载流程**再执行。
     *   · `_styleAlignedFor` 记住"已经为哪块 B 晶体对过" ⇒ 之后用户的独立修改不再被回弹；
     *   · `setTimeout(…, 0)` 让这次对齐发生在本次加载收尾之后（setProps 不再重入）。
     *   ★ 换 B 晶体时会重新对齐一次（新的一组对比，样式应当一致）。
     */
    if (this._crystalIdB && this._styleAlignedFor !== this._crystalIdB) {
      this._styleAlignedFor = this._crystalIdB
      setTimeout(() => {
        try {
          this._onAlignStyle(true)
          /**
           * ★★ 2026-10-12（用户："切换到 NaCl 后，设置和模型的显示模型还是不一致"）：
           *   自动对齐是**延迟**执行的，它改的是**状态** ——
           *   而设置面板在这之前就已经画好了（_setSideCrystal 里重画过）✗
           *   ⇒ 面板高亮着对齐前的「CPK」、画面却已经是对齐后的「球棍」✗。
           *   改：对齐之后**再重画一次设置面板**，让"设置 ↔ 状态 ↔ 画面"三者始终一致。
           */
          this._rebuildSettingsPanel()
        } catch (e) { console.warn('[compare] 自动对齐样式失败：', e) }
      }, 0)
    }

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

  /**
   * 把**另一侧**当前的视角（含比例 frustumSize）套到这一侧。
   * ★ 换晶体后立即对齐用，与"拖动时的联动同步"同一条口径（用户要的就是这个效果）。
   */
  _syncViewFromOther(side) {
    const from = side === 'left' ? this._rightCanvas : this._leftCanvas
    const to = side === 'left' ? this._leftCanvas : this._rightCanvas
    if (!from || !to || !from.getViewState || !to.applyViewState) return false
    const vs = from.getViewState()
    if (!vs) return false
    to.applyViewState(vs)
    return true
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
    // ★ 统一走 _refreshLabels()：这里原先只写"模型短名"，双晶体模式下会把**晶体名**丢掉 ✗
    //   （同一件事三处各写一份，本仓库反复踩过；收敛到一处后行为也一致了）
    this._refreshLabels()

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
        const host = this._container?.querySelector('#csHost')
        ;(host || this._container).appendChild(div.firstElementChild)
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

  /**
   * 页内轻提示。
   * ★ 替代 `window.wx.showToast` —— 那个全局在宿主里根本不存在 ✗（微信小程序移植的残留），
   *   原先这两处一走到就抛 TypeError（顶栏那句"视角已对齐/样式已对齐"从来没出现过）。
   */
  _toast(text) {
    if (!text || !this._container) return
    const el = document.createElement('div')
    el.className = 'cp-toast'
    el.textContent = text
    this._container.appendChild(el)
    setTimeout(() => { try { el.remove() } catch (e) { /* 已移除 */ } }, 1400)
  }

  _onAlignViews() {
    const ls = this._leftCanvas?.getViewState()
    if (ls && this._rightCanvas) this._rightCanvas.applyViewState(ls)
    this._toast(t('pages.compare.viewsAligned'))
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
    /**
     * ★★ 2026-10-12（用户："右边图文不对应"）：**元素显隐 / 原点变换不能无条件对齐**。
     *   它们是**逐晶体**的：两块不同的晶体，元素列（Cs/Cl vs Cu）与原点选项本来就不同。
     *   原先这里无条件 `rightAtomVisibility = { ...leftAtomVisibility }` ✗ ⇒
     *   右侧换成 CsCl 后，可见性被覆盖成左晶体的 {Cu:true} ⇒ 画面着色/显隐跟着错 ✗。
     *   只在**两侧同一晶体**时对齐这两项（那才是"同款"的意思）；两块不同晶体时留给各自派生。
     */
    if (!this._crystalIdB) {
      s.rightAtomVisibility = { ...s.leftAtomVisibility }
      s.rightEquivalentIndex = s.leftEquivalentIndex
      s.rightFractionalShift = [...s.leftFractionalShift]
    }
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

    // ★ 标签统一走 _refreshLabels()（原先这段在这里又写了一份，与 mount/onLangChange
    //   三处各写一遍 —— 本仓库的老毛病；改一处漏两处）
    this._refreshLabels()

    if (!silent) this._toast(t('pages.compare.stylesAligned'))
  }

  _onToggleSettings() {
    this._settingsExpanded = !this._settingsExpanded
    const panel = this._container.querySelector('#csPanel')
    if (panel) {
      panel.remove()
    } else if (this._settingsExpanded) {
      const tmp = document.createElement('div')
      tmp.innerHTML = this._renderSettings()
      // ★ 挂到 .cp-body 里的左列宿主 #csHost：桌面下它是"让位"的左列，不再是盖在画布上的浮层
      const host = this._container.querySelector('#csHost')
      ;(host || this._container).appendChild(tmp.firstElementChild)
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
    /**
     * ★★ 2026-10-12（用户要求）：设置里**手动更换左/右晶体**。
     * ★ 用 change 而不是 click：下拉框的点击语义是"展开选项"，
     *   选中哪一项只有 change 事件说得清（click 会在展开时就触发）。
     * ★ 面板是每次重建的（_renderSettings + 注入），所以每建成一次就重绑一次 ——
     *   与下面那个 click 委托同一个生命周期，不会累积。
     */
    panel.querySelectorAll('[data-crystal-side]').forEach((sel) => {
      sel.addEventListener('change', () => this._setSideCrystal(sel.dataset.crystalSide, sel.value))
    })
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
      // ★ 标签也要跟着刷：它写的是"该侧的模型名/晶体名"，改完样式不同步标签，
      //   就又回到用户报过的"图文不对应"（实测：右侧改成 CPK 后标签仍写「球棍」）✗
      this._refreshLabels()
      // 重建设置面板（刷新激活态与元素筛选）★ 同样挂到左列宿主 #csHost
      if (this._settingsExpanded) {
        const panel = this._container.querySelector('#csPanel')
        if (panel) {
          panel.remove()
          const div = document.createElement('div')
          div.innerHTML = this._renderSettings()
          const host = this._container.querySelector('#csHost')
          ;(host || this._container).appendChild(div.firstElementChild)
          this._bindSettingsEvents()
        }
      }
    })
  }
}
