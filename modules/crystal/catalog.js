/**
 * module/catalog.js — 晶体索引 → 模块目录形状的**唯一**映射
 *
 * ★ 为什么单独抽出来：这段映射原先在 `assemble.js`（生产装配）与
 *   `tools/_fixtures.mjs`（测试装配）里**各写了一份、逐字相同**。
 *   两处重复的映射迟早会漂移，而漂移的表现是"测试里晶体有 category、生产里没有"
 *   这类只在某一条分支上才显形的问题——正是"测试装配必须与生产一致"那条教训的
 *   又一个落点（本仓库为此已经踩过 5 次，症状都是**不报错**）。
 *
 * ★ 这里的 `|| 'other'` / `|| ''` 不是随手写的默认值：模块的快照与动作校验都假定
 *   这些字段存在（`category` 用于分类筛选、`systemName` 用于界面文案），
 *   缺字段会让筛选项静默消失，所以在这里一次性补齐。
 */
import crystalIndex from '../../projects/crystal/H5/src/data/crystalIndex.js'

/**
 * 把晶体索引映射成模块需要的目录形状。
 * @param {Array} [index] 缺省用全局的 crystalIndex（便于测试注入别的索引）
 */
export function buildCatalog(index) {
  return (index || crystalIndex).map((c) => ({
    id: c.id,
    name: c.name,
    formula: c.formula,
    crystalSystem: c.crystalSystem,
    category: c.category || 'other',
    subtitle: c.subtitle || '',
    systemName: c.systemName || '',
  }))
}

/** 生产用的目录（模块与出题引擎共用同一份） */
export const CATALOG = buildCatalog()

export default CATALOG
