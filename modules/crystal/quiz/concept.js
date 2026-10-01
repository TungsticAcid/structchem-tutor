/**
 * concept.js — 通道 B：概念题（人工写定 + 错因反推 → **组装**）
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ★ 为什么通道 B 是"组装"而不是"生成"
 * ═══════════════════════════════════════════════════════════════════════
 * 通道 A（数据驱动题）的全部价值在于：**答案物理上不可能错**——数值由计算层算出，
 * 模型连碰都碰不到。通道 B 若也做成"生成器"，就等于给"答案对不对"新开一个风险面，
 * 而那正是这个项目最不该引入的东西（一条算错的题会被学生当作标准答案记住）。
 *
 * 所以这里**不生成任何文本**，只做组装：
 *   · 题干、正确答案 —— 来自 `data/concept-questions.js`（人工写定，可核对出处）
 *   · 干扰项         —— 同一份数据里的"常见误解"原文，并挂上对应的**错因 id**
 * 模型与计算层都不参与 → 通道 B 从**工程问题**降级成一个**内容问题**：
 * 要更多概念题，就写更多条目，不需要动代码。
 *
 * ★ 干扰项挂错因 id 是关键：`check()` 答错时能从选项上直接取到错因，
 *   从而给出"把能揭示矛盾的那个视图切出来"的诊断动作——与通道 A 的机制完全一致。
 *   挂了一个错因库里不存在的 id 时**降级为 null**（宁可没有诊断动作，
 *   也不要给出与错误无关的动作）。
 */

import { CONCEPT_QUESTIONS } from './data/concept-questions.js'
import { causeById } from './data/error-causes.js'

/**
 * 线性同余洗牌（与 `templates.js` 同款算法）。
 * ★ 必须**可复现**：题目选项的顺序要能由 seed 唯一确定，否则"学生上次选的是 B"
 *   这类信息在重放时就失去意义（本仓库的通道 A 已经为此用了同款 LCG）。
 */
function shuffleWithSeed(items, seed) {
  const out = items.slice()
  let s = (Number(seed) || 1) >>> 0
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/** 该知识点（可选指定题型）有没有概念题可用 */
export function hasConcept(kp, topic) {
  return CONCEPT_QUESTIONS.some((q) => q.kp === kp && (!topic || q.topic === topic))
}

/** 概念题池里有哪些知识点 / 题型（供 capabilities 与报错信息用） */
export function conceptTopics(kp) {
  return CONCEPT_QUESTIONS.filter((q) => q.kp === kp).map((q) => q.topic)
}

/**
 * 组装一道概念题。
 *
 * @param {Object}   opts
 * @param {string}   opts.kp
 * @param {string}   [opts.topic]
 * @param {number}   [opts.seed]
 * @param {string[]} [opts.exclude] 已出过的**题干**（避免同一次会话里反复出同一道）
 * @returns {Object} 与通道 A 同形的题对象（`options` 每项带 `errorCause`），或 `{ error }`
 */
export function buildConcept(opts = {}) {
  const kp = opts.kp
  let pool = CONCEPT_QUESTIONS.filter((q) => q.kp === kp)
  if (opts.topic) {
    const f = pool.filter((q) => q.topic === opts.topic)
    if (!f.length) {
      const avail = pool.map((q) => q.topic).join('、')
      return { error: `知识点 ${kp} 没有概念题型「${opts.topic}」${avail ? `（可用：${avail}）` : ''}` }
    }
    pool = f
  }
  if (!pool.length) return { error: `知识点 ${kp} 暂无概念题` }

  // 排除已出过的：按题干比对。★ 全出过时**允许重复**——宁可偶尔重复一道，
  //   也不能出现"出不了题"把教学流程卡死（与通道 A 的兜底同一取舍）。
  const seen = new Set(opts.exclude || [])
  const fresh = pool.filter((q) => !seen.has(q.stem))
  const list = fresh.length ? fresh : pool

  const seed = (Number(opts.seed) || Date.now()) >>> 0
  const pick = list[seed % list.length]

  // 选项：正确项固定放在 raw[0]，洗牌后用 order 反查下标（避免"洗牌后忘记同步答案"）
  const raw = [{ text: pick.correct, correct: true, errorCause: null }]
    .concat(pick.wrong.map((w) => ({
      text: w.text,
      correct: false,
      // 错因 id 无效时降级为 null：宁可没有诊断动作，也不要给错动作
      errorCause: (w.causeId && causeById(w.causeId)) ? w.causeId : null,
    })))
  const order = shuffleWithSeed(raw.map((_, i) => i), seed)
  const options = order.map((i) => raw[i])
  const answerIndex = order.indexOf(0)

  const q = {
    kp,
    topic: pick.topic,
    difficulty: pick.difficulty || 'core',
    stem: pick.stem,
    options,
    answerIndex,
    answerText: pick.correct,
    // ★ 字符串答案：`selfcheck.js` 的量级检查只在 `typeof answerValue === 'number'`
    //   时生效，故概念题天然跳过那一项，不需要给它编一个假的数值。
    answerValue: pick.correct,
    answerKind: 'concept',
    explanation: pick.exp,
    source: 'concept',
    origin: 'B',
    conceptSource: pick.source,
  }
  // 与通道 A 一致的"冻结答案"约定：判分只比较下标，解析不得与答案矛盾
  q.answerFrozen = { answerText: q.answerText, answerValue: q.answerValue }
  return q
}

export default buildConcept
