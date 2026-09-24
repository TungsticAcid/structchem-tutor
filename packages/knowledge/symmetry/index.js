/**
 * packages/knowledge/symmetry/index.js —— 分子对称性的知识资产
 *
 * 这里放的是**数据**（标准群论结果），不是算法。算法（点群识别、对称元素检测）
 * 属于模块实现，在阶段 C 迁入 modules/symmetry/。
 *
 * 为什么这两份数据要放共享层而不是某个模块的源码目录：
 *   crystal 的「晶体中的对称性」与 orbit 的「轨道对称性」都要用点群记号与
 *   不可约表示，埋在 symmetry 的 src/ 下其它模块 import 不到。
 */
export { CHARACTER_TABLES, getCharacterTable } from './characterTables.js'
export { POINT_GROUP_NAMES, POINT_GROUP_SYSTEM } from './groupTable.js'

import { CHARACTER_TABLES, getCharacterTable } from './characterTables.js'

/**
 * 取某个点群的特征标表，**取不到时返回 null**（而不是 undefined）。
 * 统一返回 null 是为了与共享核心的 catalog.load() 一致——调用方只需判一种空值，
 * 不必同时防 undefined 与 null。原实现返回 undefined，这里收口。
 *
 * @param {string} symbol 点群符号，如 'C2v'、'Oh'
 * @returns {{classes: string[], irreps: Array}|null}
 */
export function lookupCharacterTable(symbol) {
  const t = getCharacterTable(symbol)
  return t || null
}

/** 全部已收录的点群符号（升序，便于展示与比对） */
export function listGroups() {
  return Object.keys(CHARACTER_TABLES).sort()
}

/** 收录的群数（供对账：原实现称 44 个） */
export function groupCount() {
  return Object.keys(CHARACTER_TABLES).length
}
