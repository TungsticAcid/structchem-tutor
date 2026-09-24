/**
 * threejs-miniprogram 适配封装
 * 封装 createScopedThreejs 初始化，提供统一的 THREE 实例获取方式
 */
import { createScopedThreejs } from 'threejs-miniprogram'

/** 全局 THREE 实例缓存 */
let _THREE = null

/**
 * 获取与 canvas 绑定的 Three.js 作用域实例
 * @param {Object} canvas - 通过 createSelectorQuery 获取的 canvas 节点
 * @returns {Object} THREE 作用域
 */
export function getThree(canvas) {
  if (!_THREE) {
    _THREE = createScopedThreejs(canvas)
  }
  return _THREE
}

/**
 * 重置 THREE 实例（用于页面切换时清理）
 */
export function resetThree() {
  _THREE = null
}

export default { getThree, resetThree }
