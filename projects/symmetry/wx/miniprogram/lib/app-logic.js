/**
 * 结构 → 对称信息 编排模块（由 H5 main.js 的识别/命名/默认显隐逻辑提取）
 * 输入分子结构，输出 info（标题/化学式/点群/特征标表）与带 defaultVisible 的对称元素数组。
 * 供 viewer 页面调用，也便于把 3D 与逻辑解耦。
 */
import { identifyPointGroup } from './symmetry/pointGroup.js'
import { getCharacterTable } from './symmetry/characterTables.js'
import { findPrincipal, typeRank, refineSymmetryElements } from './symmetry/elementNaming.js'
import { computeCentroid } from './scene-builder.js'
import { groupName } from './i18n.js'

/**
 * 计算某点群默认应显示的对称元素 index 集合
 * 规则：有主轴的群默认只显示主轴；Cs 默认显示反映面；Ci 默认显示反演中心；
 *       Sn 群默认显示旋反轴；T/O/I 高阶群无单一主轴，默认显示全部。
 */
function computeDefaultVisibleIndices(symbol, elements) {
  const p = findPrincipal(elements)
  if (p) return new Set([p.index])
  if (symbol === 'Cs') {
    return new Set(elements.map((el, i) => el.type.startsWith('sigma') ? i : -1).filter(i => i >= 0))
  }
  if (symbol === 'Ci') {
    return new Set(elements.map((el, i) => el.type === 'i' ? i : -1).filter(i => i >= 0))
  }
  if (symbol && symbol.startsWith('S')) {
    return new Set(elements.map((el, i) => el.type.startsWith('S') ? i : -1).filter(i => i >= 0))
  }
  // T/Td/Th/O/Oh/I/Ih 等：无单一主轴，默认显示全部
  return new Set(elements.map((_, i) => i))
}

/** 应用默认显隐：返回带 defaultVisible 标记的元素数组 */
function applyDefaultVisibility(symbol, elements) {
  const set = computeDefaultVisibleIndices(symbol, elements)
  return elements.map((el, i) => ({ ...el, defaultVisible: set.has(i) }))
}

/**
 * 计算结构对称信息
 * @param {Object} structure - 分子结构
 * @returns {{ info: Object, symmetryElements: Array }}
 */
export function computeStructureInfo(structure) {
  const result = identifyPointGroup(structure)
  // 专业命名（σh/σv/σd、C2′/C2″、C2v 坐标、D2h 坐标、高阶群 σh/σd）+ 同共轭类序号
  const namedElems = refineSymmetryElements(result.symbol, result.elements, structure.atoms, computeCentroid(structure.atoms))
  const symmetryElements = applyDefaultVisibility(result.symbol, namedElems)
  const info = {
    title: structure.title || '分子',
    formula: structure.formula || '',
    groupSymbol: result.symbol,
    groupName: groupName(result.symbol),
    meta: '',
    elements: symmetryElements,
    characterTable: getCharacterTable(result.symbol)
  }
  return { info, symmetryElements }
}

/** 初始视角对齐方向：主轴（无主轴取对称面法向），供 viewer-canvas 对齐 */
export function computeAlignDir(symmetryElements) {
  const p = findPrincipal(symmetryElements)
  if (p && p.el.axis) return p.el.axis
  const sig = symmetryElements.find(el => el.type && el.type.startsWith('sigma') && el.axis)
  return sig ? sig.axis : null
}

export default { computeStructureInfo, computeAlignDir }
