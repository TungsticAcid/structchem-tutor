/**
 * selfcheck.js — 题目自校验（生成后自动执行）
 *
 * 任一项不通过就**丢弃并换参数重生成**，绝不把"存疑的题"交给学生。
 *
 * ★ 为什么通道 A（程序算出的题）也要校验：
 *   答案由程序算，确实不会错；但**解析是模板填充的**——模板若写错
 *   （例如把"每个球周围 6 个"写成"晶胞内 6 个"），解析就会为**正确答案**
 *   编出一套错误的理由。这种错比答案错更难发现，因为答案是"程序算出来的"，
 *   反而更容易被信任。故第 ⑥ 项专门校验解析与答案的一致性。
 *
 * ★ 第 ⑦ 项（与内置知识表交叉校验）是最后一道防线：
 *   例如程序算出 A1 的空间利用率若为 68%，说明晶格参数或半径数据有误 ——
 *   此时应当**报错而不是出题**。数据错了却照常出题，等于把错误写进学生的答案记忆里。
 */

import { SPACE_UTILIZATION_PCT, INTERSTICE_PER_SPHERE } from './data/constants.js'

/** 数值答案的合理量级（超出即视为算出异常，不出题） */
const SANITY = {
  density: { min: 0.1, max: 30, unit: 'g/cm³' },     // 最重的金属锇约 22.6
  volume: { min: 1, max: 5000, unit: 'Å³' },          // 最大晶胞（尿素等）约 1500
  distance: { min: 0.5, max: 10, unit: 'Å' },         // 最短的 H–H 约 0.74
  count: { min: 1, max: 200 },                        // 晶胞内原子数上限（尿素 96）
  angle: { min: 1, max: 360 },
  ratio: { min: 0, max: 100 },
  percentage: { min: 0, max: 100, unit: '%' },
}

/**
 * 校验一道题。
 *
 * @param {Object} q          题目对象（见 templates.js 的形状）
 * @param {Object} [ctx]
 * @param {Object} [ctx.expected] 由程序算出的**冻结答案**（用于与 q.answerValue 比对）
 * @returns {{ok:boolean, problems:string[]}}
 */
export function selfCheck(q, ctx = {}) {
  const problems = []

  // ---- ① 结构完整性 ----
  if (!q || typeof q !== 'object') return { ok: false, problems: ['题目对象为空'] }
  if (!q.stem || typeof q.stem !== 'string') problems.push('题干为空')
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    problems.push(`选项数应为 4，实际 ${Array.isArray(q.options) ? q.options.length : '非数组'}`)
  }
  if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) {
    problems.push(`answerIndex 非法：${q.answerIndex}`)
  }

  // ---- ② 选项互不相同（去重后仍须 4 个）----
  if (Array.isArray(q.options)) {
    const texts = q.options.map((o) => normalize(o && o.text))
    if (new Set(texts).size !== texts.length) {
      problems.push('存在重复选项')
    }
    // ---- ③ 恰好一个正确 ----
    const rightCount = q.options.filter((o) => o && o.correct === true).length
    // 允许"只有 answerIndex 标记正确"的写法；但若用了 correct 标记就必须恰好一个
    if (rightCount > 0 && rightCount !== 1) {
      problems.push(`被标记为正确的选项有 ${rightCount} 个（应恰好 1 个）`)
    }
    if (rightCount === 1) {
      const idx = q.options.findIndex((o) => o && o.correct === true)
      if (idx !== q.answerIndex) {
        problems.push(`correct 标记的下标(${idx})与 answerIndex(${q.answerIndex})不一致`)
      }
    }
  }

  // ---- ④ 数值答案的量级合理 ----
  if (q.answerKind && q.answerValue != null && typeof q.answerValue === 'number') {
    const s = SANITY[q.answerKind]
    if (s) {
      if (!Number.isFinite(q.answerValue)) problems.push('答案是 NaN/Infinity')
      else if (q.answerValue < s.min || q.answerValue > s.max) {
        problems.push(`答案 ${q.answerValue} 超出 ${q.answerKind} 的合理量级 [${s.min}, ${s.max}]${s.unit ? ' ' + s.unit : ''}`)
      }
    }
  }

  // ---- ⑤ 答案与冻结值一致（防止"算一遍、填另一遍"的时序错误）----
  if (ctx.expected && q.answerValue != null && q.answerValue !== ctx.expected.value) {
    problems.push(`题目答案(${q.answerValue})与程序冻结的答案(${ctx.expected.value})不一致`)
  }

  // ---- ⑥ 解析不得与答案矛盾（★ 模板写错时唯一的拦截点）----
  if (q.explanation) {
    const bad = checkExplanationAgainstAnswer(q)
    problems.push(...bad)
  }

  // ---- ⑦ 与内置知识表交叉校验 ----
  const x = crossCheckKnowledge(q)
  problems.push(...x)

  return { ok: problems.length === 0, problems }
}

/**
 * ⑥ 解析中出现的数值 token，必须等于答案，或落在允许的常量白名单里。
 *
 * ★ 为什么需要它：解析是模板填的。若模板里手写了一个数字（比如把"6 个八面体空隙"
 *   写成 8），而正确答案是 6，解析就会**为正确答案编出错误理由**——
 *   学生看完解析会更糊涂，且我们无从察觉。
 */
function checkExplanationAgainstAnswer(q) {
  const problems = []
  const text = String(q.explanation || '')
  // 提取解析里的独立数字（排除化学式下标、晶胞参数等显然不是答案的量）
  const nums = [...text.matchAll(/(?<![\d.²³⁰-⁹])(\d+(?:\.\d+)?)(?![\d.])/g)]
    .map((m) => Number(m[1]))
  const allowed = new Set([
    Number(q.answerValue),
    // 常量白名单：学科上必然出现、且不可能与答案混淆的数
    4, 6, 8, 12, 2, 1, 3, 74.05, 68.02, 34.01, 90, 180, 360, 100, 0.5,
    8.314, 6.022, 23, 24, 32, 16, 14, 35.5, 58.5, 56, 40,
  ])
  for (const n of nums) {
    if (!allowed.has(n)) {
      problems.push(`解析中出现数值 ${n}，既不是答案也不在常量白名单里——模板可能写错了`)
    }
  }
  return problems
}

/**
 * ⑦ 与内置知识表交叉校验。
 *
 * 目前覆盖两类最危险的题：
 *   · 空间利用率：程序若算出 68% 而堆积方式是 A1，说明数据有误
 *   · 空隙数：必须与 INTERSTICE_PER_SPHERE 一致（"每个球周围"问法）
 */
function crossCheckKnowledge(q) {
  const problems = []

  if (q.answerKind === 'percentage' && q.topic === 'spaceUtilization' && q.stacking) {
    const expect = SPACE_UTILIZATION_PCT[q.stacking]
    if (expect != null && Math.abs(Number(q.answerValue) - expect) > 0.05) {
      problems.push(
        `空间利用率与内置知识表不符：程序算出 ${q.answerValue}%，而 ${q.stacking} 的理论值是 ${expect}%`
        + ' —— 这通常意味着晶格参数或原子半径数据有误，应报错而非出题')
    }
  }

  if (q.topic === 'intersticePerSphere' && q.stacking && q.intersticeKind) {
    const expect = (INTERSTICE_PER_SPHERE[q.stacking] || {})[q.intersticeKind]
    if (expect != null && Number(q.answerValue) !== expect) {
      problems.push(
        `"每个球周围的${q.intersticeKind}空隙数" = ${q.answerValue}，`
        + `与内置知识表（${q.stacking} 为 ${expect}）不符`)
    }
  }

  return problems
}

/** 归一化选项文本（去空白、全角转半角数字），用于去重比较 */
function normalize(s) {
  return String(s == null ? '' : s)
    .replace(/\s+/g, '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .trim()
}

/** 供测试与调用方复用的量级表 */
export { SANITY }

export default { selfCheck, SANITY }
