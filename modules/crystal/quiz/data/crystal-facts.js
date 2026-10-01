/**
 * crystal-facts.js — 从**数据字段**到**可出题的语义**的桥梁
 *
 * 两件事：
 *   ① 堆积方式映射（哪些晶体属于 A1–A4，以及为什么只有它们能出堆积题）
 *   ② `coordination` 字段的解析器（数据已结构化，但字段里没有"配位构型"）
 */

import { tr } from '../../i18n-live.js'
import {
  POLYHEDRON_BY_CN, POLYHEDRON_CN12, NO_CLASSIC_CN_PREFIX,
} from './constants.js'

// ============================================================================
// ① 堆积方式映射
// ============================================================================

/**
 * 晶体 id → 堆积方式。
 *
 * ★ **只有这 4 个晶体能出"堆积方式"题**，这不是遗漏而是学科事实：
 *   A1–A4 是**等径球密堆积**的分类，描述的是**单质**（同种原子）的堆积。
 *   NaCl、CsCl 这类多元素结构没有"哪种堆积方式"的答案——它们的正确讲法是
 *   "阴离子按 X 方式堆积、阳离子填入其某种空隙"（见下方 `sublattice`）。
 *   把 A1 标签套到 NaCl 上，是把"点阵型式"与"堆积方式"两个概念混为一谈，
 *   正是 C1/C3 要辨析的经典错误。
 *
 * 这与《参赛执行清单》§5.2 的能力矩阵一致：K3（堆积方式）一列只有
 * fcc / bcc / hcp / diamond 四个晶体是强关联（●）。
 */
export const STACKING_BY_CRYSTAL = {
  fcc: 'A1',
  bcc: 'A2',
  hcp: 'A3',
  diamond: 'A4',
}

/**
 * 复合结构中"子晶格"的堆积方式（用于讲解，**不用于出 A1–A4 的题**）。
 * 数值与表述依据各晶体数据的 `packingDescription` 字段。
 */
export const SUBLATTICE_STACKING = {
  naCl: { anion: 'A1（Cl⁻ 按立方最密堆积）', cationSites: '正八面体空隙' },
  csCl: { anion: '简单立方（Cl⁻ 按简单立方堆积）', cationSites: '立方体空隙' },
  zincBlende: { anion: 'A1（S²⁻ 按立方最密堆积）', cationSites: '正四面体空隙（占 1/2）' },
  wurtzite: { anion: 'A3（S²⁻ 按六方最密堆积）', cationSites: '正四面体空隙（占 1/2）' },
  fluorite: { cation: 'A1（Ca²⁺ 按立方最密堆积）', anionSites: '正四面体空隙（全占）' },
  cdi2: { anion: 'A1（I⁻ 按立方最密堆积）', cationSites: '正八面体空隙（占 1/2，层状）' },
  nias: { anion: 'A3（As 按六方最密堆积）', cationSites: '正八面体空隙（全占）' },
  rutile: { anion: '（Ti⁴⁺ 按畸变六方最密堆积）', cationSites: '正八面体空隙（占 1/2）' },
}

/** 该晶体能否出"堆积方式"题 */
export function canAskStacking(crystalId) {
  return Object.prototype.hasOwnProperty.call(STACKING_BY_CRYSTAL, crystalId)
}

// ============================================================================
// ② coordination 字段解析
// ============================================================================

/**
 * 解析 `coordination` 字段。
 *
 * 字段的实际格式（2026-09-22 数据核查后已全量统一）：
 *   · 有经典配位数：`元素:配位数(配位原子)`，多元素用 `;` 分隔（20 条）
 *     例：`Cs⁺:8(Cl⁻); Cl⁻:8(Cs⁺)`
 *   · 分子晶体：`无经典配位数（分子晶体，…）`（4 条：co2 / i2 / ice / urea）
 *
 * ★ 两处特例必须容忍（但不能因此放宽到"什么都接受"）：
 *   · `graphite`：`C:3(层内C-C共价键，层间为范德华力)` —— 括号内是**描述**而非配位原子。
 *     即"配位数 3"是**层内**配位数，与分子晶体的"无经典配位数"是两回事
 *     （这是 C4 的一个易错点，已写入错因库）。
 *   · `perovskite`：`O²⁻:4(2Ca²⁺+2Ti⁴⁺)` —— 括号内是**复合表达式**。
 *   两者都只需取「元素」与「数字」，括号内容原样保留作"近邻描述"。
 *
 * ★ 解析失败**必须报告**，不能静默丢弃：丢掉一条就等于少一个可出题的晶体，
 *   而"少"不会报错，只会让题库悄悄变窄。故返回 `unparsed` 供调用方断言。
 *
 * @param {string} text
 * @returns {{ kind:'classic'|'molecular'|'empty', entries: Array, note: string, unparsed: string[] }}
 */
export function parseCoordination(text) {
  const s = (text == null ? '' : String(text)).trim()
  if (!s) return { kind: 'empty', entries: [], note: '字段为空', unparsed: [] }

  if (s.startsWith(NO_CLASSIC_CN_PREFIX)) {
    return {
      kind: 'molecular',
      entries: [],
      note: s.slice(NO_CLASSIC_CN_PREFIX.length).replace(/^[（(]|[）)]$/g, ''),
      unparsed: [],
    }
  }

  const entries = []
  const unparsed = []
  for (const part of s.split(';')) {
    const p = part.trim()
    if (!p) continue
    // 元素（可含上标电荷号） : 数字 （ 任意内容 ）
    const m = p.match(/^([^:：]+)[:：]\s*(\d+)\s*[（(]([^）)]*)[）)]\s*$/)
    if (!m) { unparsed.push(p); continue }
    entries.push({
      element: m[1].trim(),
      cn: Number(m[2]),
      neighbors: m[3].trim(),
      /** 括号内是否只是描述（如石墨的"层内C-C共价键，层间为范德华力"） */
      descriptive: /[一-鿿]/.test(m[3]),
    })
  }

  return {
    kind: entries.length ? 'classic' : 'unparsed',
    entries,
    note: '',
    unparsed,
  }
}

/**
 * 取某晶体中某元素的配位数与配位构型。
 *
 * ★ 配位构型不在数据字段里（信息缺失，不是格式问题），故按配位数查通用规则表；
 *   12 配位需按堆积方式区分（fcc 与 hcp 的中文习惯叫法不同）。
 *
 * @param {Object} crystalData
 * @param {string} element 元素符号（可带电荷号，如 `Na⁺`）
 * @returns {{cn:number, polyhedron:string, neighbors:string}|null}
 */
export function coordinationOf(crystalData, element) {
  const parsed = parseCoordination(crystalData && crystalData.coordination)
  if (parsed.kind !== 'classic') return null

  // 元素匹配要容忍电荷号差异：数据里是 `Na⁺`，调用方可能传 `Na`
  const bare = (x) => String(x).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, '')
  const hit = parsed.entries.find((e) => e.element === element)
    || parsed.entries.find((e) => bare(e.element) === bare(element))
  if (!hit) return null

  // ★ 构型名来自**常量表**（模块级对象，切语言不会自己变），所以在返回前过一遍 tr()。
  //   这里是唯一的出口：调用方（templates.js / teach-tools.js）拿到的一律是当前语言。
  let polyhedron = POLYHEDRON_BY_CN[hit.cn] || ''
  if (hit.cn === 12) {
    const st = STACKING_BY_CRYSTAL[crystalData.id]
    polyhedron = POLYHEDRON_CN12[st] || '最密堆积配位'
  }
  if (!polyhedron && hit.descriptive) {
    // 括号内是描述而非配位原子（如石墨的层内配位）——此时不宜给多面体名
    polyhedron = '（非经典配位多面体）'
  }
  polyhedron = polyhedron ? tr(polyhedron) : ''

  return {
    cn: hit.cn,
    polyhedron,
    neighbors: hit.neighbors,
    /** 说明该配位数是否适用于"层内"这类限定语境 */
    scoped: hit.descriptive ? hit.neighbors : '',
  }
}

export default { STACKING_BY_CRYSTAL, SUBLATTICE_STACKING, canAskStacking, parseCoordination, coordinationOf }
