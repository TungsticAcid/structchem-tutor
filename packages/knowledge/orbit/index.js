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
 * 校验条目的 **id** 都带本模块的命名空间前缀。
 *
 * ★ 只查 `id`，**不查 `kp`** —— 这一条是 2026-10-01 更正的，值得说清：
 *
 *   CLAUDE.md §一.3 的原文是「**id** 一律带命名空间」。当初这个守卫顺手把 `kp` 也
 *   纳进来了，于是它**强制**了 `kp: 'orbit:K1'`。后果不是"更安全"，而是埋了个静默缺陷：
 *   `kp` 是各模块**自己的运行时键**——orbit 的学情模型（store/mastery.js 的 KP_META）
 *   与出题引擎（core/question-engine.js 的题库映射）里写的都是裸 `K1`。
 *   模型从知识清单里读到 `orbit:K1`、再传给 generateQuestion，会得到
 *   "未知知识点：orbit:K1"；学情也会因键对不上而**恒为空**。**两件事都不报错**，
 *   只表现为"功能没反应"。
 *
 *   判据不是"凡是标识符就加前缀"，而是**与消费方的键一致**：
 *     · `id`  —— 本仓库的检索键（loadKnowledge 按它取正文），跨模块共用一个目录 ⇒ 必须带前缀
 *     · `kp`  —— 模块运行时自己的键 ⇒ 跟随该模块的既有约定
 *         orbit 用裸 K1（本模块运行时如此）；crystal 用 crystal:C1（它的题库矩阵如此）
 *
 * @throws {Error} 有条目缺前缀时抛出，并列出前几条的 id
 */
export function assertNamespaced(list) {
  const bad = (list || []).filter((e) => !String(e.id).startsWith(NAMESPACE + ':'))
  if (bad.length) {
    throw new Error(`orbit 条目 id 缺少命名空间前缀：${bad.slice(0, 3).map((e) => e.id).join(', ')}`)
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
