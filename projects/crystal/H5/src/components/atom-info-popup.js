/**
 * 原子信息弹窗组件 (H5)
 * 显示元素符号、名称、坐标等关键信息
 */
import { BaseComponent } from '../adapters/component.js'

export class AtomInfoPopup extends BaseComponent {
  static properties = {
    visible: { type: Boolean, value: false, observer: 'onVisibleChanged' },
    atomData: { type: Object, value: null }
  }

  static data = {
    show: false,
    animate: false
  }

  methods = {
    onVisibleChanged(val) {
      if (val) {
        this.setData({ show: true })
        setTimeout(() => this.setData({ animate: true }), 50)
      } else {
        this.setData({ animate: false })
        setTimeout(() => this.setData({ show: false }), 300)
      }
    },

    onClose() {
      this.triggerEvent('close')
    },

    onStopPropagation(e) {
      e.stopPropagation()
    }
  }

  render() {
    const d = this._data
    const atom = this._props.atomData
    if (!d.show) return '<div></div>'

    const maskClass = d.animate ? 'popup-mask animate' : 'popup-mask'
    const contentClass = d.animate ? 'popup-content slide-up' : 'popup-content'

    let bodyHtml = ''
    if (atom && atom.isVoid) {
      bodyHtml = `
        <span class="void-type-text">${atom.voidName || atom.voidType || '--'}</span>
        <div class="info-grid">
          ${atom.voidType ? `<div class="info-item"><span class="info-label">空隙类型</span><span class="info-value">${atom.voidType === 'octahedral' ? '八面体空隙' : '四面体空隙'}</span></div>` : ''}
          ${atom.position ? `<div class="info-item"><span class="info-label">分数坐标</span><span class="info-value">${atom.position}</span></div>` : ''}
        </div>`
    } else if (atom && atom.isLatticePoint) {
      bodyHtml = `
        <span class="void-type-text">点阵点</span>
        <div class="info-grid">
          ${atom.latticeTypeName ? `<div class="info-item"><span class="info-label">点阵型式</span><span class="info-value">${atom.latticeTypeName}</span></div>` : ''}
          ${atom.position ? `<div class="info-item"><span class="info-label">分数坐标</span><span class="info-value">${atom.position}</span></div>` : ''}
        </div>`
    } else if (atom) {
      bodyHtml = `
        <span class="element-symbol" style="color:${atom.color || '#fff'}">${atom.element || '--'}</span>
        <div class="info-grid">
          ${atom.name ? `<div class="info-item"><span class="info-label">元素名称</span><span class="info-value">${atom.name}</span></div>` : ''}
          ${atom.enName ? `<div class="info-item"><span class="info-label">英文名称</span><span class="info-value">${atom.enName}</span></div>` : ''}
          ${atom.atomicNumber ? `<div class="info-item"><span class="info-label">原子序数</span><span class="info-value">${atom.atomicNumber}</span></div>` : ''}
          ${atom.atomicMass ? `<div class="info-item"><span class="info-label">相对原子质量</span><span class="info-value">${atom.atomicMass}</span></div>` : ''}
          ${atom.electronConfig ? `<div class="info-item"><span class="info-label">电子排布</span><span class="info-value">${atom.electronConfig}</span></div>` : ''}
          ${atom.electronegativity ? `<div class="info-item"><span class="info-label">电负性</span><span class="info-value">${atom.electronegativity}</span></div>` : ''}
          ${atom.position ? `<div class="info-item"><span class="info-label">分数坐标</span><span class="info-value">${atom.position}</span></div>` : ''}
          ${atom.radius ? `<div class="info-item"><span class="info-label">原子半径</span><span class="info-value">${atom.radius} Å</span></div>` : ''}
        </div>`
    } else {
      bodyHtml = `<span class="no-data-text">未选中任何原子</span>`
    }

    return `
    <div class="${maskClass}" data-action="onClose">
      <div class="${contentClass}" data-action="onStopPropagation">
        <div class="popup-handle"></div>
        ${bodyHtml}
        <div class="close-btn" data-action="onClose">
          <span class="close-text">关闭</span>
        </div>
      </div>
    </div>
    <style>
      .popup-mask {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0); display: flex; align-items: flex-end;
        justify-content: center; z-index: 1000; transition: background 0.3s;
      }
      .popup-mask.animate { background: rgba(0,0,0,0.5); }
      .popup-content {
        width: 100%; background: #fff; border-radius: 16px 16px 0 0;
        padding: 12px 16px 24px; transform: translateY(100%);
        transition: transform 0.3s ease; max-width: 500px;
      }
      .popup-content.slide-up { transform: translateY(0); }
      .popup-handle {
        width: 30px; height: 3px; background: #ddd; border-radius: 2px;
        margin: 0 auto 12px;
      }
      .element-symbol {
        display: block; text-align: center; font-size: 40px; font-weight: 700; margin-bottom: 12px;
      }
      .void-type-text {
        display: block; text-align: center; font-size: 22px; font-weight: 600; color: #333; margin-bottom: 12px;
      }
      .info-grid { display: flex; flex-wrap: wrap; }
      .info-item { width: 50%; padding: 8px 0; }
      .info-label { display: block; font-size: 11px; color: #999; margin-bottom: 2px; }
      .info-value { display: block; font-size: 14px; color: #333; }
      .no-data-text {
        display: block; text-align: center; color: #999; font-size: 14px; padding: 30px 0;
      }
      .close-btn {
        text-align: center; margin-top: 12px; padding: 10px;
        background: #f5f5f5; border-radius: 6px; cursor: pointer;
      }
      .close-text { color: #666; font-size: 14px; }
    </style>`
  }
}
