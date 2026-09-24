/**
 * 离屏 2D canvas 创建（小程序版，替代 document.createElement('canvas')）
 * 用于绘制对称元素/原子名称的文字精灵，再喂给 THREE.CanvasTexture。
 */
/**
 * 创建离屏 2D canvas（绘图用）
 * @param {number} width - 像素宽
 * @param {number} height - 像素高
 * @returns {Object} 支持 getContext('2d') 的 canvas
 */
export function createTextCanvas(width, height) {
  try {
    if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
      return wx.createOffscreenCanvas({ type: '2d', width, height })
    }
  } catch (e) {
    console.warn('[canvas] createOffscreenCanvas 失败, 降级:', e)
  }
  // 极低端环境兜底：返回带 2d 上下文的伪画布（可能无法作为纹理，则外部 try/catch 禁用标签）
  return { width, height, getContext: () => null }
}

export default { createTextCanvas }
