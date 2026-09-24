/**
 * crystal-view.js — 构造晶体模块的三维视图（**浏览器专用**）
 *
 * ★ 单独一个文件的理由：`modules/crystal/` 里的纯逻辑（facade / tools / actions）
 *   刻意不 import three.js 与 DOM，因此能在 Node 里测试。视图构造是唯一需要
 *   真浏览器的部分，故隔离在这里，由应用入口调用。
 *
 * ★ 过渡期说明：视图与数据仍来自 `projects/crystal/H5/src/`（被复用的原项目代码）。
 *   阶段 B6 之后会逐步收进 `modules/crystal/views/`，届时本文件只剩薄薄一层转发。
 */
import { ViewerCanvas } from '@crystal/components/viewer-canvas.js'
import { getCrystalData, getAllCrystalIds } from '@crystal/lib/crystal-loader.js'
import crystalIndex from '@crystal/data/crystalIndex.js'
import elements from '@crystal/data/elements.js'

export { getCrystalData, getAllCrystalIds, crystalIndex }

/** 晶体索引 → 模块需要的目录形状（补上 category/systemName，缺省给空串） */
export const CATALOG = crystalIndex.map((c) => ({
  id: c.id,
  name: c.name,
  formula: c.formula,
  crystalSystem: c.crystalSystem,
  category: c.category || 'other',
  subtitle: c.subtitle || '',
  systemName: c.systemName || '',
}))

/**
 * 创建并挂载三维视图。
 * @param {Object} opts
 * @param {HTMLElement} opts.container
 * @param {Object} [opts.props] 初始属性（crystalId 等）
 */
export function createCrystalView(opts) {
  const view = new ViewerCanvas({
    container: opts.container,
    canvasId: opts.canvasId || 'crystalCanvas',
    props: Object.assign({ crystalId: 'naCl' }, opts.props || {}),
  })
  view.mount()
  return view
}

/** 元素表（面板配色、原子信息弹窗会用到） */
export { elements }
