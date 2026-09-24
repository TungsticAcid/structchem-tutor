/**
 * packages/knowledge/orbit/index.js —— 原子轨道模块的知识条目
 *
 * 条目正文在 entries.js；本文件提供「装进目录」的接线，避免调用方关心细节。
 */
import { ENTRIES } from './entries.js'

export { ENTRIES }

/** 本模块的知识点命名空间前缀 */
export const NAMESPACE = 'orbit'

/**
 * 校验条目都带本模块的命名空间前缀。
 * ★ 命名空间在这里被**强制**：条目 id 与 kp 必须是 `orbit:...`，否则在共享核心的
 *   多模块目录里会与其它模块撞名——这是 CLAUDE.md §一.3 的硬约定，
 *   所以在这里校验，而不是靠约定自觉。
 * @throws {Error} 有条目缺前缀时抛出，并列出前几条的 id
 */
export function assertNamespaced(list) {
  const bad = (list || []).filter(
    (e) => !String(e.id).startsWith(NAMESPACE + ':') || !String(e.kp).startsWith(NAMESPACE + ':'),
  )
  if (bad.length) {
    throw new Error(`orbit 条目缺少命名空间前缀：${bad.slice(0, 3).map((e) => e.id).join(', ')}`)
  }
  return true
}

/**
 * 把本模块条目装进一个目录（createCatalog 的返回值）。
 * @param {ReturnType<import('../../agent-core/core/catalog.js').createCatalog>} catalog
 * @returns {number} 装入条数
 */
export function registerInto(catalog) {
  assertNamespaced(ENTRIES)
  return catalog.register(ENTRIES)
}

export default ENTRIES
