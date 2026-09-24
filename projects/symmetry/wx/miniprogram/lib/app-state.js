/**
 * 小程序全局状态与事件总线
 * 替代 H5 的 window.dispatchEvent(new CustomEvent('langchange')) / 全局变量。
 * 页面通过 bus.on/off 订阅，bus.emit 通知；currentStructure 等共享状态由 viewer 页持有。
 */
const listeners = {}

export const bus = {
  /**
   * 订阅事件
   * @param {string} evt - 事件名（'langchange' | 'structure' | 'appearance' | ...）
   * @param {Function} fn - 回调
   * @returns {Function} 取消订阅函数
   */
  on(evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn)
    return () => {
      const arr = listeners[evt] || []
      const i = arr.indexOf(fn)
      if (i >= 0) arr.splice(i, 1)
    }
  },

  /** 触发事件 */
  emit(evt, data) {
    const arr = listeners[evt] || []
    for (const fn of arr.slice()) {
      try { fn(data) } catch (e) { console.error('[bus]', evt, e) }
    }
  },

  /** 清空某事件所有监听（页面卸载时防止内存泄漏） */
  offAll(evt) { delete listeners[evt] }
}

export default { bus }
