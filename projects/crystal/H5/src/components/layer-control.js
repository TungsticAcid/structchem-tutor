/**
 * 图层控制面板组件 (H5)
 * 提供图层开关、模型类型选择、元素独立控制等功能
 */
import { BaseComponent } from '../adapters/component.js'

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
    equivalentIndex: { type: Number, value: 0 }
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
        .layer-control { background: rgba(30,30,50,0.95); border-top: 1px solid rgba(255,255,255,0.1); transition: all 0.3s; }
        .panel-toggle { display: flex; align-items: center; justify-content: center; padding: 8px; gap: 4px; cursor: pointer; }
        .toggle-arrow { color: rgba(255,255,255,0.5); font-size: 10px; }
        .toggle-label-text { color: rgba(255,255,255,0.7); font-size: 12px; }
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
      </div>
    </div>
    <style>
      .layer-control { background: rgba(30,30,50,0.95); border-top: 1px solid rgba(255,255,255,0.1); transition: all 0.3s; }
      .panel-toggle { display: flex; align-items: center; justify-content: center; padding: 8px; gap: 4px; cursor: pointer; }
      .toggle-arrow { color: rgba(255,255,255,0.5); font-size: 10px; }
      .toggle-label-text { color: rgba(255,255,255,0.7); font-size: 12px; }
      .panel-body { padding: 0 12px 16px; max-height: 250px; overflow-y: auto; }
      .control-section { margin-bottom: 12px; }
      .section-title { display: block; color: rgba(255,255,255,0.5); font-size: 11px; margin-bottom: 6px; }
      .toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
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
