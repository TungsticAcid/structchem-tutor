/**
 * 图层控制面板组件 (H5)
 * 提供图层开关、模型类型选择、元素独立控制等功能
 */
import { BaseComponent } from '../adapters/component.js'

/**
 * 控制面板外壳（`.layer-control`）的样式。
 *
 * ★ 为什么是**一份常量**：这条规则原先在两条渲染路径里各写了一遍字面量
 *   （面板折叠态与展开态各一处）。改一处、另一处不变，就会出现
 *   "展开之前是对的、展开之后颜色跳一下"——而两边看起来都像是有意为之。
 *
 * ★ 为什么是**恒深色**、不跟主题翻转：浅色主题下页面与画布都会变白，
 *   而这一条与其上的文字若跟着变白，面板里的浅色文字会落到白底上
 *   （实测对比度 1.4:1）。所以它跟的是外壳调色板 `--chrome-*` ——
 *   与智能体面板同一族表面，那些面板也是恒深色的。
 * ★ 以前写的是私有字面量 `rgba(30,30,50,0.95)`：与 `--chrome-card` 是同一块颜色
 *   却各写一份，正是"两套视觉真源"的残留。
 * ★ 末尾保留原值作 fallback：独立页（`projects/crystal/H5` 单独跑、没有宿主题）
 *   下外观逐字不变。
 * ★ 容器**必须显式声明 color**：只绑变量不够 —— 变量生效 ≠ 结果正确，
 *   继承来的 `color` 在深底上可能仍是深色（这条在设计令牌那轮踩过一次）。
 */
const LAYER_CONTROL_BASE_CSS = `
      .layer-control {
        background: var(--chrome-card, rgba(30,30,50,0.95));
        border-top: 1px solid var(--chrome-line, rgba(255,255,255,0.1));
        color: var(--chrome-text, #ffffff);
        transition: all 0.3s;
      }
      .panel-toggle { display: flex; align-items: center; justify-content: center; padding: 8px; gap: 4px; cursor: pointer; }
      .toggle-arrow { color: var(--chrome-text-dim, rgba(255,255,255,0.5)); font-size: 10px; }
      .toggle-label-text { color: var(--chrome-text-dim, rgba(255,255,255,0.7)); font-size: 12px; }
`

export class LayerControl extends BaseComponent {
  static properties = {
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
    crystalData: { type: Object, value: null },
    showIntersticeControl: { type: Boolean, value: false },
    atomVisibility: { type: Object, value: {} },
    showAtomLabels: { type: Boolean, value: false },
    isMolecularCrystal: { type: Boolean, value: false },
    showHydrogenBonds: { type: Boolean, value: true },
    hasHydrogenBonds: { type: Boolean, value: false },
    showLatticePoints: { type: Boolean, value: false },
    isOrthogonalCell: { type: Boolean, value: true },
    equivalentSettings: { type: Array, value: [] },
    equivalentIndex: { type: Number, value: 0 },
    // ★ 「外观」两个滑块读的就是这两个值，**必须在这里声明**。
    //   基类构造函数只拷贝**已声明**的键（见 adapters/component.js），而 setProps()
    //   却照单全收 —— 漏声明就会被静默丢掉：首渲染 `_props.atomScale` 是 undefined，
    //   滑块回落到 min 显示成「0.30」、滑柄贴最左，拖动一次或切一次显示模型才自愈成
    //   真实的「1.00」。默认值要与 viewer.js `_state` 的一致（1.0 / 0.0）。
    atomScale: { type: Number, value: 1.0 },
    opacity: { type: Number, value: 0.0 }
  }

  static data = {
    expanded: true,
    elementsExpanded: false
  }

  methods = {
    togglePanel() {
      this.setData({ expanded: !this._data.expanded })
    },

    onToggle(e) {
      const layer = e.currentTarget.dataset.layer
      const checked = e.target.checked
      // 按图层分发到不同事件（与小程序版行为一致）
      if (layer === 'atomLabels') {
        this.triggerEvent('atomlabelstoggle', { value: checked })
      } else if (layer === 'partialAtoms') {
        this.triggerEvent('partialatomschange', { value: checked })
      } else if (layer === 'auxAbove') {
        this.triggerEvent('auxiliaryabovetoggle', { value: checked })
      } else {
        this.triggerEvent('layerchange', { layer, value: checked })
      }
    },

    onToggleElements() {
      this.setData({ elementsExpanded: !this._data.elementsExpanded })
    },

    onAtomLabelsToggle(e) {
      this.triggerEvent('atomlabelstoggle', { value: e.target.checked })
    },

    onAtomVisibilityToggle(e) {
      const element = e.currentTarget.dataset.element
      const checked = e.target.checked
      this.triggerEvent('atomvisibilitychange', { element, value: checked })
    },

    onModelTypeTap(e) {
      const type = e.currentTarget.dataset.type
      if (type !== this._props.modelType) {
        this.triggerEvent('modeltypechange', { value: type })
      }
    },

    onCellModeTap(e) {
      const mode = e.currentTarget.dataset.mode
      if (mode !== this._props.cellDisplayMode) {
        this.triggerEvent('celldisplaymodechange', { value: mode })
      }
    },

    onAuxiliaryAboveToggle(e) {
      this.triggerEvent('auxiliaryabovetoggle', { value: e.target.checked })
    },

    onPartialAtomsToggle(e) {
      this.triggerEvent('partialatomschange', { value: e.target.checked })
    },

    onLatticePointsToggle(e) {
      this.triggerEvent('layerchange', { layer: 'latticePoints', value: e.target.checked })
    },

    onEquivalentTap(e) {
      const idx = parseInt(e.currentTarget.dataset.index)
      if (idx !== this._props.equivalentIndex) {
        this.triggerEvent('equivalentsettingchange', { index: idx })
      }
    },

    /**
     * 外观滑块（原子缩放 / 原子透明度）。
     *
     * ★ 为什么要给它：对称元素、空隙这些"辅助几何"常被不透明的原子球挡住，
     *   而此前原子透明度只有智能体能改（`setAppearance` 动作），**用户没有入口**——
     *   学生想看清一条四重轴，除了问智能体别无他法（实测反馈）。
     *   `input` 事件边走边发（拖动时实时看到效果），预览值走 `_preview` 由页面回填。
     */
    onAppearanceInput(e) {
      const key = e.currentTarget.dataset.key
      const v = Number(e.target.value)
      if (!Number.isFinite(v)) return
      this.triggerEvent('appearancechange', { patch: { [key]: v } })
    }
  }

  /** 辅助: 生成 toggle 开关 HTML */
  _toggleRow(label, layer, checked, color = '#4285F4', indent = false) {
    return `
    <div class="toggle-row${indent ? ' toggle-indent' : ''}">
      <span class="toggle-label">${label}</span>
      <label class="toggle-switch">
        <input type="checkbox" ${checked ? 'checked' : ''} data-layer="${layer}" data-change="onToggle" />
        <span class="toggle-slider" style="--toggle-color: ${color}"></span>
      </label>
    </div>`
  }

  /** 辅助: 生成外观滑块 HTML（原子缩放 / 原子透明度） */
  _sliderRow(label, key, value, min, max, step, hint) {
    const v = Number.isFinite(Number(value)) ? Number(value) : min
    // 透明度按百分数显示（0~90%），比 0.35 这种小数直观
    const showPct = key === 'opacity'
    const disp = showPct ? Math.round(v * 100) + '%' : v.toFixed(2)
    return `
    <div class="slider-row">
      <div class="slider-head">
        <span class="toggle-label">${label}</span>
        <span class="slider-val" data-val-for="${key}">${disp}</span>
      </div>
      <input type="range" class="appearance-range" data-key="${key}" data-input="onAppearanceInput"
             min="${min}" max="${max}" step="${step}" value="${v}"
             style="--fill: ${showPct ? (v / 0.9) * 100 : (v - min) / (max - min) * 100}%" />
      ${hint ? `<div class="slider-hint">${hint}</div>` : ''}
    </div>`
  }

  render() {
    const p = this._props
    const d = this._data
    const meta = p.crystalMeta || {}
    const cd = p.crystalData || {}

    if (!d.expanded) {
      return `
      <div class="layer-control collapsed">
        <div class="panel-toggle" data-action="togglePanel">
          <span class="toggle-arrow">▲</span>
          <span class="toggle-label-text">控制面板</span>
        </div>
      </div>
      <style>
${LAYER_CONTROL_BASE_CSS}
      </style>`
    }

    // 生成元素独立控制
    let elemControls = ''
    if (cd.atoms) {
      elemControls = `
      <div class="toggle-row element-section-header" data-action="onToggleElements">
        <div class="element-section-left">
          <span class="toggle-label">分元素控制</span>
          <span class="element-count-text">（${cd.atoms.length}种）</span>
        </div>
        <span class="element-expand-arrow">${d.elementsExpanded ? '▼' : '▶'}</span>
      </div>`
      if (d.elementsExpanded) {
        for (const atomGroup of cd.atoms) {
          const checked = p.atomVisibility[atomGroup.element] !== false
          elemControls += `
          <div class="toggle-row element-toggle-row">
            <span class="element-color-dot" style="background-color:${atomGroup.color}"></span>
            <span class="toggle-label element-label">${atomGroup.element}</span>
            <label class="toggle-switch">
              <input type="checkbox" ${checked ? 'checked' : ''} data-element="${atomGroup.element}" data-change="onAtomVisibilityToggle" />
              <span class="toggle-slider" style="--toggle-color:#4285F4"></span>
            </label>
          </div>`
        }
      }
    }

    // 模型选择器
    const modelHtml = `
    <div class="control-section">
      <span class="section-title">显示模型</span>
      <div class="model-selector">
        <div class="model-option ${p.modelType === 'cpk' ? 'active' : ''}" data-type="cpk" data-action="onModelTypeTap">CPK</div>
        <div class="model-option ${p.modelType === 'ballStick' ? 'active' : ''}" data-type="ballStick" data-action="onModelTypeTap">球棍</div>
      </div>
    </div>`

    // 外观（原子缩放 / 原子透明度）
    //   ★ 透明度是"看清辅助几何"的主要手段：对称元素、空隙、点阵点都在原子球
    //     的内部/背后，原子不透明时它们基本看不见（实测反馈）。
    const appearanceHtml = `
    <div class="control-section">
      <span class="section-title">外观</span>
      ${this._sliderRow('原子缩放', 'atomScale', p.atomScale, 0.3, 2.0, 0.05)}
      ${this._sliderRow('原子透明度', 'opacity', p.opacity, 0, 0.9, 0.05, '调高可看清被原子挡住的对称元素、空隙')}
    </div>`

    // 空隙控制
    let intersticeHtml = ''
    if (p.showIntersticeControl) {
      intersticeHtml = `
      ${this._toggleRow('八面体空隙', 'octahedral', p.showOctahedral, '#FFB74D')}
      ${this._toggleRow('四面体空隙', 'tetrahedral', p.showTetrahedral, '#4FC3F7')}`
    }

    // 氢键
    let hbondHtml = ''
    if (p.hasHydrogenBonds) {
      hbondHtml = this._toggleRow('氢键', 'hydrogenBonds', p.showHydrogenBonds, '#64B5F6', true)
    }

    // 辅助线选项
    let auxAboveHtml = ''
    if (p.showAuxiliaryBody || p.showAuxiliaryFace) {
      auxAboveHtml = `
      <div class="toggle-row toggle-indent">
        <span class="toggle-label" style="font-size:11px;">显示在原子上方</span>
        <label class="toggle-switch">
          <input type="checkbox" ${p.auxiliaryLineAboveAtoms ? 'checked' : ''} data-layer="auxAbove" data-change="onToggle" />
          <span class="toggle-slider" style="--toggle-color:#FFD54F"></span>
        </label>
      </div>`
    }

    // 变换晶胞原点
    let equivalentHtml = ''
    if (p.equivalentSettings && p.equivalentSettings.length > 0) {
      equivalentHtml = `
      <div class="control-section">
        <span class="section-title">变换晶胞原点</span>
        <div class="model-selector">`
      for (let idx = 0; idx < p.equivalentSettings.length; idx++) {
        const item = p.equivalentSettings[idx]
        equivalentHtml += `
          <div class="model-option ${p.equivalentIndex === idx ? 'active' : ''}" data-index="${idx}" data-action="onEquivalentTap">${item.label}</div>`
      }
      equivalentHtml += `</div></div>`
    }

    // 裁剪控制
    let clipHtml = ''
    if (p.isOrthogonalCell && !p.isMolecularCrystal) {
      clipHtml = this._toggleRow('晶胞裁剪', 'partialAtoms', p.partialAtoms, '#4285F4')
    }

    return `
    <div class="layer-control expanded">
      <div class="panel-toggle" data-action="togglePanel">
        <span class="toggle-arrow">▼</span>
        <span class="toggle-label-text">控制面板</span>
      </div>
      <div class="panel-body" data-scroll-keep>
        <!-- 晶体信息 -->
        <div class="control-section" style="${meta.name ? '' : 'display:none'}">
          <span class="section-title">晶体信息</span>
          <div class="crystal-info">
            ${meta.formula ? `<span class="info-line">化学式：${meta.formula}</span>` : ''}
            ${meta.crystalSystem ? `<span class="info-line">晶系：${meta.crystalSystem}</span>` : ''}
            ${meta.spaceGroup ? `<span class="info-line">空间群：${meta.spaceGroup}</span>` : ''}
            ${meta.latticeType ? `<span class="info-line">点阵型式：${meta.latticeType}</span>` : ''}
            ${meta.structuralUnit ? `<span class="info-line">结构基元：${meta.structuralUnit}</span>` : ''}
            ${meta.coordination ? `<span class="info-line">配位数：${meta.coordination}</span>` : ''}
            ${meta.spaceUtilization ? `<span class="info-line">空间利用率：${meta.spaceUtilization}</span>` : ''}
            ${meta.packingDescription ? `<span class="info-line">堆积方式：${meta.packingDescription}</span>` : ''}
            ${meta.latticeConstText ? `<span class="info-line">晶胞参数：${meta.latticeConstText}</span>` : ''}
          </div>
        </div>

        ${modelHtml}

        <div class="control-section">
          <span class="section-title">图层显示</span>
          ${this._toggleRow('原子', 'atoms', p.showAtoms)}
          ${elemControls}
          ${this._toggleRow('原子标签', 'atomLabels', p.showAtomLabels)}
          ${this._toggleRow('点阵型式', 'latticePoints', p.showLatticePoints, '#FF6D00')}
          ${intersticeHtml}
          ${!p.isMolecularCrystal ? this._toggleRow('化学键', 'bonds', p.showBonds) : ''}
          ${hbondHtml}
          ${this._toggleRow('坐标轴', 'axes', p.showAxes)}
          ${this._toggleRow('体对角线', 'auxiliaryBody', p.showAuxiliaryBody, '#FFD54F')}
          ${this._toggleRow('面对角线', 'auxiliaryFace', p.showAuxiliaryFace, '#90CAF9')}
          ${auxAboveHtml}
        </div>

        ${equivalentHtml}

        <div class="control-section">${clipHtml}</div>

        ${appearanceHtml}
      </div>
    </div>
    <style>
${LAYER_CONTROL_BASE_CSS}
      .panel-body { padding: 0 12px 16px; max-height: 250px; overflow-y: auto; }
      .control-section { margin-bottom: 12px; }
      .section-title { display: block; color: rgba(255,255,255,0.5); font-size: 11px; margin-bottom: 6px; }
      .toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }

      /* 外观滑块（原子缩放 / 原子透明度） */
      .slider-row { padding: 4px 0 8px; }
      .slider-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
      .slider-val { color: rgba(255,255,255,0.8); font-size: 11px; font-variant-numeric: tabular-nums; }
      .slider-hint { color: rgba(255,255,255,0.38); font-size: 10.5px; line-height: 1.5; margin-top: 3px; }
      .appearance-range {
        -webkit-appearance: none; appearance: none;
        width: 100%; height: 4px; border-radius: 2px; outline: none; cursor: pointer;
        /* --fill 由渲染时按当前值给出，左段高亮、右段灰 —— 原生 range 在深色面板上几乎看不见轨道 */
        background: linear-gradient(to right, #4285F4 0%, #4285F4 var(--fill, 50%), rgba(255,255,255,0.15) var(--fill, 50%), rgba(255,255,255,0.15) 100%);
      }
      .appearance-range::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 14px; height: 14px; border-radius: 50%;
        background: #fff; border: 2px solid #4285F4; cursor: pointer;
      }
      .appearance-range::-moz-range-thumb {
        width: 12px; height: 12px; border-radius: 50%;
        background: #fff; border: 2px solid #4285F4; cursor: pointer;
      }
      .toggle-indent { padding-left: 12px; }
      .toggle-label { color: rgba(255,255,255,0.85); font-size: 13px; }
      .element-section-header { padding: 5px 0; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 2px; cursor: pointer; }
      .element-section-left { display: flex; align-items: center; gap: 4px; }
      .element-count-text { color: rgba(255,255,255,0.35); font-size: 11px; }
      .element-expand-arrow { color: rgba(255,255,255,0.4); font-size: 10px; }
      .element-toggle-row { padding-left: 12px; padding-top: 2px; padding-bottom: 2px; }
      .element-toggle-row .toggle-label { flex: 1; font-size: 12px; color: rgba(255,255,255,0.75); }
      .element-color-dot { width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; border: 1px solid rgba(255,255,255,0.3); flex-shrink: 0; }
      .crystal-info { padding: 4px 0; }
      .info-line { display: block; color: rgba(255,255,255,0.7); font-size: 12px; line-height: 1.8; }
      .model-selector { display: flex; gap: 4px; }
      .model-option {
        flex: 1; text-align: center; padding: 7px 0; border-radius: 6px;
        background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5); font-size: 12px;
        transition: all 0.2s; cursor: pointer;
      }
      .model-option.active { background: rgba(66,133,244,0.2); color: #4285F4; font-weight: 500; }
      /* Toggle Switch */
      .toggle-switch { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
      .toggle-switch input { opacity: 0; width: 0; height: 0; }
      .toggle-slider {
        position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(255,255,255,0.15); border-radius: 11px; transition: 0.2s;
      }
      .toggle-slider::before {
        content: ''; position: absolute; height: 18px; width: 18px; left: 2px; bottom: 2px;
        background: #fff; border-radius: 50%; transition: 0.2s;
      }
      .toggle-switch input:checked + .toggle-slider { background: var(--toggle-color, #4285F4); }
      .toggle-switch input:checked + .toggle-slider::before { transform: translateX(18px); }
    </style>`
  }
}
