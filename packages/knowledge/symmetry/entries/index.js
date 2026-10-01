/**
 * entries/index.js —— 对称性模块知识条目的汇总
 *
 * 按知识点分文件（p1..p5），与 crystal/entries/ 的组织方式同构。
 * 分文件的理由：单个知识点内部的条目互为上下文（写完 P1 再写 P2 时，
 * 引用关系看得见）；而且将来若要按知识点做渐进式披露，边界现成。
 *
 * ★ 一次改动的纪律：加条目时**同时**改两处——
 *   ① 本文件对应的 import 与展开；
 *   ② packages/knowledge/tools/test-knowledge.mjs 会立刻核对
 *      id 命名空间、kp↔id 咬合、字段齐全。漏了任何一条它都会红。
 */
import { P1_ENTRIES } from './p1.js'
import { P2_ENTRIES } from './p2.js'
import { P3_ENTRIES } from './p3.js'
import { P4_ENTRIES } from './p4.js'
import { P5_ENTRIES } from './p5.js'

/** 全部条目（顺序即知识点顺序 P1 → P5） */
export const ALL_ENTRIES = [
  ...P1_ENTRIES,   // 对称操作与对称元素
  ...P2_ENTRIES,   // 分子点群
  ...P3_ENTRIES,   // 特征标表与不可约表示
  ...P4_ENTRIES,   // 对称性与分子性质
  ...P5_ENTRIES,   // 晶体中的对称性
]

/** 按知识点分组（供"某个知识点下有哪些条目"的查询） */
export const BY_KP = ALL_ENTRIES.reduce((acc, e) => {
  (acc[e.kp] = acc[e.kp] || []).push(e)
  return acc
}, {})

export { P1_ENTRIES, P2_ENTRIES, P3_ENTRIES, P4_ENTRIES, P5_ENTRIES }

export default ALL_ENTRIES
