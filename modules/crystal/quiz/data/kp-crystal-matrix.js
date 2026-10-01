/**
 * kp-crystal-matrix.js — 知识点 × 晶体 的能力矩阵
 *
 * 用途：出题引擎据此选题（"C5 空隙分布该用哪些晶体出题？"）与推荐（"学生在 C3 上
 * 薄弱，优先用哪几个晶体练？"）。
 *
 * ★ 这张表**不是新造的**，是《参赛执行清单》§5.2 已有的逐格人工判断的抄录
 *   （原表标注：● 强关联 = 该晶体是讲此知识点的优选载体；○ 弱关联）。
 *   文档原文即写明它"作为智能体选题与推荐的数据源"。
 *
 * `strong`：该晶体是讲这个知识点的**优选载体**——出题时优先选它。
 * `weak`：可以出，但不是最佳载体。
 *
 * ★ 为什么必须显式标注而不是"所有晶体对所有知识点都可出"：
 *   题型的**适用域**受数据与学科双重限制。例如堆积方式题只对 4 个单质晶体成立
 *   （见 quiz/data/crystal-facts.js 的说明）；空隙数题只有 fcc/hcp 有数据。
 *   若不加限制地出题，会产出大量"看似合理但学科上无意义"的题目。
 */

/** 8 个知识点的元信息（编号为 crystal:C1–C8，与知识库条目一致） */
export const KNOWLEDGE_POINTS = {
  'crystal:C1': { label: '点阵型式', difficulty: 'basic' },
  'crystal:C2': { label: '结构基元', difficulty: 'basic' },
  'crystal:C3': { label: '堆积方式', difficulty: 'core' },
  'crystal:C4': { label: '配位环境', difficulty: 'core' },
  'crystal:C5': { label: '空隙分布', difficulty: 'hard' },
  'crystal:C6': { label: '空间群与对称元素', difficulty: 'hard' },
  'crystal:C7': { label: '晶胞参数', difficulty: 'basic' },
  'crystal:C8': { label: '结构—性能关联', difficulty: 'extended' },
}

/**
 * 矩阵：晶体 id → { 'crystal:C1': 'strong'|'weak', … }
 * 抄自《参赛执行清单》§5.2（原表用 ● / ○ 标记）。
 */
export const KP_CRYSTAL_MATRIX = {
  // ---- 金属 ----
  fcc:            { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'strong', C6: 'weak',   C7: 'strong', C8: 'strong' },
  bcc:            { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'weak',   C6: 'weak',   C7: 'strong', C8: 'strong' },
  hcp:            { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'strong', C6: 'weak',   C7: 'strong', C8: 'strong' },
  // ---- 离子 ----
  naCl:           { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'strong', C6: 'strong', C7: 'strong', C8: 'weak' },
  csCl:           { C1: 'strong', C2: 'strong', C3: 'weak',   C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'weak' },
  fluorite:       { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'strong', C6: 'strong', C7: 'strong', C8: 'weak' },
  perovskite:     { C1: 'strong', C2: 'strong', C3: 'weak',   C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'strong' },
  reo3:           { C1: 'strong', C2: 'strong', C3: 'weak',   C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'weak' },
  pyrite:         { C1: 'strong', C2: 'strong', C3: 'weak',   C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'weak' },
  // ---- 共价 ----
  diamond:        { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'strong' },
  zincBlende:     { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'strong', C6: 'strong', C7: 'strong', C8: 'weak' },
  wurtzite:       { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'strong', C6: 'strong', C7: 'strong', C8: 'weak' },
  rutile:         { C1: 'strong', C2: 'strong', C3: 'weak',   C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'weak' },
  nias:           { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'strong', C6: 'strong', C7: 'strong', C8: 'weak' },
  quartz:         { C1: 'strong', C2: 'strong', C3: 'weak',   C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'strong' },
  cristobalite:   { C1: 'strong', C2: 'strong', C3: 'weak',   C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'strong' },
  // ---- 分子 ----
  co2:            { C1: 'strong', C2: 'strong', C3: 'weak',   C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'weak' },
  ice:            { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'strong' },
  i2:             { C1: 'strong', C2: 'strong', C3: 'weak',   C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'weak' },
  urea:           { C1: 'strong', C2: 'strong', C3: 'weak',   C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'weak' },
  // ---- 混合键型 ----
  graphite:       { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'strong' },
  rhomboGraphite: { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'weak',   C6: 'strong', C7: 'strong', C8: 'strong' },
  cdi2:           { C1: 'strong', C2: 'strong', C3: 'strong', C4: 'strong', C5: 'strong', C6: 'strong', C7: 'strong', C8: 'weak' },
}

/** 取矩阵里某晶体的记录（键名补上 crystal: 前缀，便于与知识点 id 对齐） */
function rowOf(crystalId) {
  const row = KP_CRYSTAL_MATRIX[crystalId]
  if (!row) return null
  const out = {}
  for (const [c, v] of Object.entries(row)) out[`crystal:${c}`] = v
  return out
}

/**
 * 取某知识点下的晶体，按关联强度排序（strong 在前）。
 *
 * @param {string} kp 知识点 id，如 'crystal:C5'（也接受裸编号 'C5'）
 * @param {Object} [opts]
 * @param {boolean} [opts.strongOnly=true] 只要强关联的
 * @returns {string[]} 晶体 id 列表
 */
export function crystalsForKnowledgePoint(kp, opts = {}) {
  const key = String(kp).includes(':') ? String(kp) : `crystal:${kp}`
  const strongOnly = opts.strongOnly !== false
  const strong = []
  const weak = []
  for (const id of Object.keys(KP_CRYSTAL_MATRIX)) {
    const row = rowOf(id)
    if (!row || !row[key]) continue
    ;(row[key] === 'strong' ? strong : weak).push(id)
  }
  return strongOnly ? strong : strong.concat(weak)
}

/** 取某晶体强关联的知识点 */
export function knowledgePointsForCrystal(crystalId) {
  const row = rowOf(crystalId)
  if (!row) return []
  return Object.keys(row).filter((k) => row[k] === 'strong')
}

/** 矩阵自洽性检查（供测试断言）：id 集合须与数据完全一致，无多无少 */
export function matrixCrystalIds() {
  return Object.keys(KP_CRYSTAL_MATRIX)
}

export default {
  KNOWLEDGE_POINTS, KP_CRYSTAL_MATRIX,
  crystalsForKnowledgePoint, knowledgePointsForCrystal, matrixCrystalIds,
}
