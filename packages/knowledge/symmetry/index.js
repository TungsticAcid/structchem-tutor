/**
 * packages/knowledge/symmetry/index.js —— 分子对称性的知识资产
 *
 * 这里放两类东西，**性质不同、不要混**：
 *   · **数据**（characterTables / groupTable）：标准群论结果，44 个群的特征标表。
 *     算法（点群识别、对称元素检测）属于模块实现，在 modules/symmetry/。
 *   · **知识条目**（entries/，P1–P5）：给智能体讲的东西，与 crystal/orbit 同构。
 *
 * 为什么这些数据要放共享层而不是某个模块的源码目录：
 *   crystal 的「晶体中的对称性」与 orbit 的「轨道对称性」都要用点群记号与
 *   不可约表示，埋在 symmetry 的 src/ 下其它模块 import 不到。
 */
export { CHARACTER_TABLES, getCharacterTable } from './characterTables.js'
export { POINT_GROUP_NAMES, POINT_GROUP_SYSTEM } from './groupTable.js'

import { CHARACTER_TABLES, getCharacterTable } from './characterTables.js'
import { ALL_ENTRIES } from './entries/index.js'

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

// ============================================================================
// 知识条目（P1–P5）
// ============================================================================
export const ENTRIES = ALL_ENTRIES
export { ALL_ENTRIES }

/** 本模块的知识点命名空间前缀 */
export const NAMESPACE = 'symmetry'

/**
 * 校验条目的 **id** 都带本模块的命名空间前缀。
 *
 * ★ 只查 `id`，**不查 `kp`** —— 与 crystal / orbit 同一判据：
 *   CLAUDE.md §一.3 的原文是「**id** 一律带命名空间」。
 *   `kp` 是模块**自己的运行时键**，要跟随该模块的既有约定：
 *     · orbit 用裸 `K1`（它的学情与题库都是裸键）
 *     · crystal 用 `crystal:C1`（它的题库矩阵就是带前缀的）
 *     · symmetry 用 `symmetry:P1` —— 与 crystal 一致。本模块目前**还没有**
 *       出题引擎，等它建起来时，那里的键必须用同样的 `symmetry:P1`，
 *       否则会出现"条目挂得上、题库取不到"的静默失效。
 *
 * @throws {Error} 有条目缺前缀时抛出，并列出前几条的 id
 */
export function assertNamespaced(list) {
  const bad = (list || []).filter((e) => !String(e.id).startsWith(NAMESPACE + ':'))
  if (bad.length) {
    throw new Error(`symmetry 条目 id 缺少命名空间前缀：${bad.slice(0, 3).map((e) => e.id).join(', ')}`)
  }
  return true
}

/**
 * 把本模块条目装进一个目录（createCatalog 的返回值）。
 * @param {Object} catalog
 * @returns {number} 装入条数
 */
export function registerInto(catalog) {
  assertNamespaced(ENTRIES)
  return catalog.register(ENTRIES)
}

export default ENTRIES
