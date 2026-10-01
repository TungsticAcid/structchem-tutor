/**
 * entries/index.js — 晶体模块的知识条目汇总
 *
 * 按知识点分文件（c1.js、c2.js…），此处只做汇总。
 * 分批推进时**只动对应那一批**，其余不受影响。
 *
 * 当前进度见 ../README（本模块的待写清单与进度表）。
 */

import { C1_ENTRIES } from './c1.js'
import { C2_ENTRIES } from './c2.js'
import { C3_ENTRIES } from './c3.js'
import { C4_ENTRIES } from './c4.js'
import { C5_ENTRIES } from './c5.js'
import { C6_ENTRIES } from './c6.js'
import { C7_ENTRIES } from './c7.js'
import { C8_ENTRIES } from './c8.js'

/** 全部已写条目（顺序即 id 序，便于比对） */
export const ALL_ENTRIES = [].concat(
  C1_ENTRIES,
  C2_ENTRIES,
  C3_ENTRIES,
  C4_ENTRIES,
  C5_ENTRIES,
  C6_ENTRIES,
  C7_ENTRIES,
  C8_ENTRIES,
)

export default ALL_ENTRIES
