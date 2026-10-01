/**
 * packages/knowledge/crystal/index.js —— 晶体模块的知识条目
 *
 * 条目正文在 `entries/`（按知识点分文件 c1..c8，与上游同构，便于将来对照）；
 * 本文件提供「装进目录」的接线，与 `packages/knowledge/orbit/index.js` 同形。
 */
import { ALL_ENTRIES } from './entries/index.js'

export const ENTRIES = ALL_ENTRIES

export { ALL_ENTRIES }

/** 本模块的知识点命名空间前缀 */
export const NAMESPACE = 'crystal'

/**
 * 校验条目的 **id** 都带本模块的命名空间前缀。
 *
 * ★ 只查 `id`，**不查 `kp`** —— 与 orbit 那份同一判据：CLAUDE.md §一.3 的原文是
 *   「**id** 一律带命名空间」。`kp` 是模块**自己的运行时键**，要跟随该模块的既有约定：
 *     · orbit 用裸 `K1`（它的学情与题库都是裸键）
 *     · crystal 用 `crystal:C1`（它的题库矩阵 kp-crystal-matrix.js 就是带前缀的）
 *   详见 packages/knowledge/orbit/index.js 里那段更正说明。
 *
 * @throws {Error} 有条目缺前缀时抛出，并列出前几条的 id
 */
export function assertNamespaced(list) {
  const bad = (list || []).filter((e) => !String(e.id).startsWith(NAMESPACE + ':'))
  if (bad.length) {
    throw new Error(`crystal 条目 id 缺少命名空间前缀：${bad.slice(0, 3).map((e) => e.id).join(', ')}`)
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
