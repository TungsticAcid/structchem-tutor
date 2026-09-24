/**
 * modules/crystal/index.js —— 晶体结构模块
 *
 * 这一层是「模块」在本仓库里的家（目标结构见重构计划「目标结构」）：
 *   modules/<模块id>/   模块实现：数据 · 视图 · 动作词汇表 · 设置表
 *
 * 本文件只做**纯逻辑**的再导出，不 import 视图实现（three.js / DOM）——
 * 因此可以在 Node 里直接测试。视图的构造在 view.js（浏览器专用），装配在 apps/web。
 */
import { createCrystalFacade } from './facade.js'
import { createCrystalTools } from './tools.js'
import { VOCAB, validate as rawValidate, listActions } from './actions.js'

export { createCrystalFacade } from './facade.js'
export { createCrystalTools } from './tools.js'
export {
  VOCAB, LAYER_PROPS, LAYER_NOTES, VIEW_DIRECTIONS, VIEW_NOTES,
  CELL_MODES, CELL_MODE_NOTES, APPEARANCE_RANGES,
  validate, listActions,
} from './actions.js'

/**
 * 装配本模块，交给统一壳使用。
 *
 * ★ 返回的是一个**完整模块包**：壳拿到它就能装配智能体，不必了解晶体模块的内部结构。
 *   其中 `validate` 已绑定好 crystalIds —— 因为壳的分镜引擎调用的是 `validate(name, params)`
 *   两参形式，而"id 必须真实存在"这条校验需要知道有哪些合法 id。
 *
 * @param {Object} opts
 * @param {Object} opts.view     ViewerCanvas 实例（或同接口替身）
 * @param {Array}  [opts.catalog] 晶体索引（crystalIndex）
 * @param {Function} [opts.loadData] (id) => 晶体数据对象
 * @returns {{id, title, facade, defs, handlers, validate, vocabulary, catalog, settings, roleHint}}
 */
export function createModule(opts = {}) {
  const catalog = opts.catalog || []
  const facade = createCrystalFacade(opts)
  const tools = createCrystalTools({ facade, loadData: opts.loadData, catalog })
  const crystalIds = new Set(catalog.map((c) => c.id))

  return {
    id: 'crystal',
    title: '晶体结构',
    facade,
    defs: tools.defs,
    handlers: tools.handlers,
    /** 已绑定 id 校验的动作校验（壳的分镜引擎逐调用它） */
    validate: (name, params) => rawValidate(name, params, { crystalIds }),
    /** 动作词汇表（壳用它标注 animated/concept，并按需 listSceneActions 暴露给模型） */
    vocabulary: VOCAB,
    /** 模块自己的小参数（声明式，可直接喂 ui-kit 的 settings-popup） */
    settings: facade.settings,
    /** 模块的提示词片段（人格 + 领域约定） */
    roleHint: [
      '你正在使用**晶体结构**模块。你的讲解必须落到画面上——只用文字描述结构，等于没讲。',
      '晶体有晶体学轴，"沿 a 轴看""从 [111] 方向看"是教学语言的一部分，请用 setView 配合。',
      '涉及配位数、空隙数、晶胞参数、密度等一切数值，必须用 queryCrystal 取得，**不要口算**。',
      '点阵型式、空间群这类字段请用 getCrystalDetail 取数据原文；若学生问的晶体不在库中，先 listCrystals 取合法 id。',
    ].join('\n'),
    catalog,
  }
}

/** 模块自述（供 registry 与壳展示） */
export const MODULE_INFO = {
  id: 'crystal',
  title: '晶体结构',
  /** 动作词汇表按需提供（不进常驻上下文） */
  vocabularySize: listActions().length,
}

export default createModule
