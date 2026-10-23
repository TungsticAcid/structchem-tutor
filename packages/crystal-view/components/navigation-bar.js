/**
 * 导航栏组件 (H5)
 * 简化版，去掉微信胶囊按钮相关逻辑
 */
import { BaseComponent } from '../adapters/component.js'

export class NavigationBar extends BaseComponent {
  static properties = {
    title: { type: String, value: '' },
    back: { type: Boolean, value: true },
    color: { type: String, value: 'black' },
    background: { type: String, value: '#FFF' }
  }

  static data = {
    displayStyle: '',
    show: true
  }

  methods = {
    back() {
      history.back()
      this.triggerEvent('back', { delta: 1 })
    }
  }

  render() {
    const p = this._props
    const d = this._data

    // 颜色映射
    const textColor = p.color || '#000'
    const bg = p.background || '#fff'

    return `
    <nav class="nav-bar" style="color: ${textColor}; background: ${bg}; ${d.displayStyle}">
      <div class="nav-bar__left">
        ${p.back ? `
        <div class="nav-bar__back-btn" data-tap="back">
          <span class="nav-bar__back-icon"></span>
        </div>` : '<slot name="left"></slot>'}
      </div>
      <div class="nav-bar__center">
        <span class="nav-bar__title">${p.title || ''}</span>
      </div>
      <div class="nav-bar__right">
        <slot name="right"></slot>
      </div>
    </nav>
    <style>
      .nav-bar {
        position: relative; top: 0; left: 0; width: 100%;
        height: 44px; display: flex; flex-direction: row; align-items: center;
        justify-content: center; padding-top: env(safe-area-inset-top);
        box-sizing: border-box; z-index: 100; flex-shrink: 0;
      }
      .nav-bar__left {
        position: relative; padding-left: 16px; display: flex;
        flex-direction: row; align-items: center; height: 100%;
      }
      .nav-bar__back-btn {
        padding: 11px 18px 11px 16px; margin: -11px -18px -11px -16px; cursor: pointer;
      }
      .nav-bar__back-icon {
        display: block; width: 12px; height: 24px;
        background-color: currentColor;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='24' viewBox='0 0 12 24'%3E%3Cpath fill-opacity='.9' fill-rule='evenodd' d='M10 19.438L8.955 20.5l-7.666-7.79a1.02 1.02 0 0 1 0-1.42L8.955 3.5 10 4.563 2.682 12 10 19.438z'/%3E%3C/svg%3E") no-repeat 50% 50%;
        -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='24' viewBox='0 0 12 24'%3E%3Cpath fill-opacity='.9' fill-rule='evenodd' d='M10 19.438L8.955 20.5l-7.666-7.79a1.02 1.02 0 0 1 0-1.42L8.955 3.5 10 4.563 2.682 12 10 19.438z'/%3E%3C/svg%3E") no-repeat 50% 50%;
        mask-size: cover; -webkit-mask-size: cover;
      }
      .nav-bar__center {
        font-size: 17px; text-align: center; position: relative;
        display: flex; align-items: center; justify-content: center;
        font-weight: bold; flex: 1; height: 100%;
      }
      .nav-bar__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nav-bar__right { position: relative; display: flex; align-items: center; height: 100%; padding-right: 16px; }
    </style>`
  }
}
