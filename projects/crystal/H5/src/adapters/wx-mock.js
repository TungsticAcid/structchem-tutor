/**
 * 微信 API Mock
 * 提供 toast、modal 等 UI 反馈的 H5 等价实现
 */

import { getStorageSync as _getStorageSync, setStorageSync as _setStorageSync } from './storage.js'

/** 全局 Toast 容器 */
let _toastContainer = null

function getToastContainer() {
  if (!_toastContainer) {
    _toastContainer = document.createElement('div')
    _toastContainer.className = 'wx-toast-container'
    _toastContainer.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 10000; pointer-events: none;
    `
    document.body.appendChild(_toastContainer)
  }
  return _toastContainer
}

/**
 * 显示 Toast 提示
 */
export function showToast(options = {}) {
  const { title = '', icon = 'none', duration = 1500 } = (typeof options === 'string') ? { title: options } : options

  const container = getToastContainer()
  const toast = document.createElement('div')
  toast.className = 'wx-toast'
  toast.style.cssText = `
    background: rgba(0,0,0,0.78); color: #fff; font-size: 14px;
    padding: 10px 20px; border-radius: 8px; text-align: center;
    white-space: nowrap; pointer-events: none;
    animation: wxToastIn 0.2s ease;
  `
  if (icon === 'success') {
    toast.textContent = '✓ ' + title
  } else if (icon === 'error') {
    toast.textContent = '✗ ' + title
  } else {
    toast.textContent = title
  }
  container.appendChild(toast)

  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = 'opacity 0.2s'
    setTimeout(() => toast.remove(), 200)
  }, duration)
}

/**
 * 显示模态对话框
 */
export function showModal(options = {}) {
  const { title = '', content = '', success } = options

  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); z-index: 10001;
    display: flex; align-items: center; justify-content: center;
  `
  const dialog = document.createElement('div')
  dialog.style.cssText = `
    background: #fff; border-radius: 12px; width: 280px; overflow: hidden;
  `
  if (title) {
    const titleEl = document.createElement('div')
    titleEl.style.cssText = `
      text-align: center; font-size: 17px; font-weight: 600; padding: 20px 16px 8px;
    `
    titleEl.textContent = title
    dialog.appendChild(titleEl)
  }
  const contentEl = document.createElement('div')
  contentEl.style.cssText = `
    text-align: center; font-size: 14px; color: #666; padding: 12px 16px 20px;
  `
  contentEl.textContent = content
  dialog.appendChild(contentEl)

  const btnRow = document.createElement('div')
  btnRow.style.cssText = `
    display: flex; border-top: 1px solid #eee;
  `
  const cancelBtn = document.createElement('div')
  cancelBtn.style.cssText = `
    flex: 1; text-align: center; padding: 12px; font-size: 16px; color: #999; cursor: pointer;
    border-right: 1px solid #eee;
  `
  cancelBtn.textContent = '取消'
  cancelBtn.onclick = () => {
    overlay.remove()
    if (success) success({ confirm: false, cancel: true })
  }
  const confirmBtn = document.createElement('div')
  confirmBtn.style.cssText = `
    flex: 1; text-align: center; padding: 12px; font-size: 16px; color: #4285F4; cursor: pointer;
    font-weight: 600;
  `
  confirmBtn.textContent = '确定'
  confirmBtn.onclick = () => {
    overlay.remove()
    if (success) success({ confirm: true, cancel: false })
  }
  btnRow.appendChild(cancelBtn)
  btnRow.appendChild(confirmBtn)
  dialog.appendChild(btnRow)
  overlay.appendChild(dialog)

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove()
      if (success) success({ confirm: false, cancel: true })
    }
  })
  document.body.appendChild(overlay)
}

/**
 * 获取系统信息 Mock
 */
export function getSystemInfoSync() {
  return {
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 2,
    platform: /android/i.test(navigator.userAgent) ? 'android'
      : /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'devtools',
    model: '',
    system: ''
  }
}

/**
 * 获取设备信息（用于 navigation-bar 平台检测）
 */
export function getDeviceInfo() {
  return {
    platform: /android/i.test(navigator.userAgent) ? 'android'
      : /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'devtools'
  }
}

/**
 * 获取窗口信息
 */
export function getWindowInfo() {
  return {
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    safeArea: {
      top: 0,
      bottom: 0
    }
  }
}

/**
 * 模拟 wx.getMenuButtonBoundingClientRect（Web 中无胶囊按钮，返回近似的右上角区域）
 */
export function getMenuButtonBoundingClientRect() {
  return {
    left: window.innerWidth - 100,
    top: 8,
    width: 87,
    height: 32,
    right: window.innerWidth - 13,
    bottom: 40
  }
}

/**
 * 创建离屏 Canvas
 * 优先使用 OffscreenCanvas，不支持时回退到普通 Canvas
 */
export function createOffscreenCanvas(options = {}) {
  const { type = '2d', width = 128, height = 64 } = options
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height)
    }
  } catch (e) { /* 回退 */ }

  // 回退：创建普通 canvas
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * 存储 API（暴露为 wx.setStorageSync/getStorageSync 的兼容接口）
 * 实际由 settings.js 使用 storage.js 直接操作
 */

/** 存储读取 */
function getStorageSync(key) {
  return _getStorageSync(key)
}

/** 存储写入 */
function setStorageSync(key, value) {
  _setStorageSync(key, value)
}

// 导出全局 wx 对象用于兼容
const wx = {
  getStorageSync,
  setStorageSync,
  getSystemInfoSync,
  getDeviceInfo,
  getWindowInfo,
  getMenuButtonBoundingClientRect,
  createOffscreenCanvas,
  showToast,
  showModal,
  navigateTo: (options) => {
    const url = typeof options === 'string' ? options : options.url
    if (url) {
      const hashPath = url.replace(/^\//, '')
      location.hash = '#/' + hashPath
    }
  },
  navigateBack: (options = {}) => {
    history.back()
  }
}

// 挂载到 window（便于直接调用）
window.wx = wx

export { getStorageSync, setStorageSync }
export default wx
