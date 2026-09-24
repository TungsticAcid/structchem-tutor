/**
 * modules/crystal/index.js —— 晶体结构模块
 *
 * 这一层是「模块」在本仓库里的家（目标结构见重构计划「目标结构」）：
 *   modules/<模块id>/   模块实现：数据 · 视图 · 动作词汇表 · 设置表
 *
 * 本文件只做**纯逻辑**的再导出，不 import 视图实现（three.js / DOM）——
 * 因此可以在 Node 里直接测试。视图的构造在 view.js（浏览器专用），装配在 apps/web。
 */
export { createCrystalFacade } from './facade.js'
export {
  VOCAB, LAYER_PROPS, LAYER_NOTES, VIEW_DIRECTIONS, VIEW_NOTES,
  CELL_MODES, CELL_MODE_NOTES, APPEARANCE_RANGES,
  validate, listActions,
} from './actions.js'

import { createCrystalFacade } from './facade.js'
import { listActions } from './actions.js'

/**
 * 装配本模块的门面。
 * @param {Object} opts 见 createCrystalFacade（view / catalog / loadData）
 */
export function createModule(opts) {
  return createCrystalFacade(opts)
}

/** 模块自述（供 registry 与壳展示） */
export const MODULE_INFO = {
  id: 'crystal',
  title: '晶体结构',
  /** 动作词汇表按需提供（不进常驻上下文） */
  vocabularySize: listActions().length,
}

export default createModule
