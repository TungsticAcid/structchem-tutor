/**
 * 小程序 scoped Three.js 上下文
 * 用 ES Module 活绑定导出 THREE：在 canvas 初始化（initThree）后，各 render 模块
 * 通过 `import { THREE } from './three-context.js'` 读到的即是与 canvas 绑定的 THREE。
 * 仅主查看器一个画布，故用单例。
 */
import { createScopedThreejs } from 'threejs-miniprogram'

/** 与 canvas 绑定的 scoped three（未初始化时为 null） */
export let THREE = null

/**
 * 用 canvas 节点初始化 scoped three
 * @param {Object} canvas - wx.createSelectorQuery().select('#webgl').node() 得到的节点
 * @returns {Object} THREE
 */
export function initThree(canvas) {
  THREE = createScopedThreejs(canvas)
  return THREE
}

/** 获取当前 THREE（未初始化返回 null） */
export function getThree() { return THREE }

/** 重置单例（组件销毁/页面卸载时清理） */
export function resetThree() { THREE = null }

export default { THREE, initThree, getThree, resetThree }
