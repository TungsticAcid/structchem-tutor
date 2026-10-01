/**
 * store/mastery.js — 掌握度追踪与知识点推荐
 *
 * 规则刻意**简单可解释**（避免黑箱）：
 *   答对 +1　答错 −1　费曼复述通过 +2
 *   连续 2 次答对同一知识点 → 标记「已掌握」；一旦答错则重置连对并取消已掌握。
 *
 * 数据只存本机（localStorage），不上传——与 BYOK 的隐私姿态一致。
 *
 * ★ 迁移自 orbit/H5/js/agent/mastery-model.js（121 行），做了四处**必要**的改动：
 *
 *   ① **IIFE → ESM**（本仓库是模块化项目）。
 *   ② **依赖注入 storage**：orbit 直接用 `localStorage`，本版从参数收
 *      （默认仍是 localStorage，但测试可注入桩——Node 里没有 localStorage）。
 *   ③ **学科耦合点替换**：orbit 的 KP_META 里每个知识点带 `orbital`（轨道参数
 *      `{n,l,m}`），推荐时按"与当前轨道的关联度"排序。晶体侧对应的是
 *      **与当前晶体的关联度**。
 *   ④ **不硬编码关联关系**：orbit 把 9 个知识点的轨道写死在 KP_META 里，
 *      本版**从能力矩阵（kp-crystal-matrix）动态推导**——那份矩阵已是
 *      "知识点 × 晶体"的权威判断，再抄一份必然漂移。
 */

import { crystalsForKnowledgePoint, KNOWLEDGE_POINTS } from '../quiz/data/kp-crystal-matrix.js'

/** 一个知识点的初始记录 */
function blank() {
  return { score: 0, right: 0, wrong: 0, streak: 0, mastered: false, lastAt: 0 }
}

/**
 * @param {Object} [opts]
 * @param {string} [opts.storageKey='crystal.mastery']
 * @param {Object} [opts.storage] 具备 getItem/setItem/removeItem 的存储（缺省用 localStorage）
 * @param {Object} [opts.meta] 知识点元信息（缺省用 kp-crystal-matrix 的 KNOWLEDGE_POINTS）
 */
export function createMasteryModel(opts = {}) {
  // ★ 同 panel.js：存储键**必须由宿主注入**，没有缺省值。
  //   「中性缺省名」不算修好——只是把「悄悄共享」换成「悄悄各存各的」，两者都查不出来。
  if (!opts.storageKey) {
    throw new Error('createMasteryModel 需要 opts.storageKey：'
      + '存储命名空间必须由宿主注入（契约 HOST_REQUIREMENTS_SHAPE.storage）')
  }
  const storageKey = opts.storageKey
  const meta = opts.meta || KNOWLEDGE_POINTS
  const storage = opts.storage
    || (typeof localStorage !== 'undefined' ? localStorage : null)

  let state = null

  function load() {
    if (state) return state
    let saved = null
    try { saved = storage ? JSON.parse(storage.getItem(storageKey) || 'null') : null } catch (e) { saved = null }
    state = (saved && typeof saved === 'object') ? saved : {}
    for (const kp of Object.keys(meta)) {
      if (!state[kp]) state[kp] = blank()
    }
    return state
  }

  function save() {
    try { if (storage) storage.setItem(storageKey, JSON.stringify(state)) } catch (e) { /* 隐私模式/配额满 */ }
  }

  /**
   * 更新某知识点的掌握度。
   * @param {string} kp 知识点 id（'crystal:C5' 或裸 'C5'）
   * @param {number} delta +1 答对 / −1 答错 / +2 复述通过
   */
  function update(kp, delta) {
    const key = normalize(kp)
    load()
    if (!state[key]) return { error: `未知知识点：${kp}` }
    const s = state[key]
    const d = Number(delta) || 0
    s.score += d
    s.lastAt = Date.now()
    if (d > 0) {
      s.right++
      s.streak++
      if (s.streak >= 2) s.mastered = true     // 连续两次答对视为掌握
    } else if (d < 0) {
      s.wrong++
      s.streak = 0
      s.mastered = false                        // 答错即取消"已掌握"——那说明之前是侥幸
    }
    save()
    return { knowledgePoint: key, score: s.score, mastered: s.mastered, streak: s.streak, delta: d }
  }

  /** 总览（进快照，供模型判断学情） */
  function summary() {
    load()
    const out = {}
    for (const kp of Object.keys(meta)) {
      out[kp] = { score: state[kp].score, mastered: state[kp].mastered }
    }
    return out
  }

  /** 给模型看的紧凑文本（一行式，省 token） */
  function toText() {
    load()
    return Object.keys(meta).map((kp) => {
      const s = state[kp]
      const tag = s.mastered ? '已掌握' : (s.score > 0 ? '学习中' : (s.wrong ? '待巩固' : '未接触'))
      return `${kp}(${(meta[kp] && meta[kp].label) || kp}):${tag}/${s.score}`
    }).join('；')
  }

  /**
   * 「与当前晶体的关联度」——决定掌握度相同时先补哪个知识点。
   * ★ 从能力矩阵推导，不另维护一份映射表。
   */
  function relevanceOf(kp, crystalId) {
    if (!crystalId) return 0
    const strong = crystalsForKnowledgePoint(kp)                          // 强关联
    if (strong.includes(crystalId)) return 2
    const all = crystalsForKnowledgePoint(kp, { strongOnly: false })       // 含弱关联
    return all.includes(crystalId) ? 1 : 0
  }

  /**
   * 推荐下一个该练的知识点：掌握度最低者优先，同分时优先与当前晶体关联度高的。
   *
   * @param {number} [count=1]
   * @param {string} [currentCrystalId] 当前正在看的晶体（用于算关联度）
   */
  function recommend(count, currentCrystalId) {
    load()
    const list = Object.keys(meta).map((kp) => {
      const s = state[kp]
      return {
        kp,
        name: (meta[kp] && meta[kp].label) || kp,
        score: s.score,
        mastered: s.mastered,
        relevance: relevanceOf(kp, currentCrystalId),
      }
    }).filter((x) => !x.mastered)

    list.sort((a, b) => (a.score !== b.score ? a.score - b.score : b.relevance - a.relevance))

    const n = Math.max(1, Math.min(count || 1, 3))
    return {
      recommended: list.slice(0, n),
      note: '优先推荐掌握度最低、且与当前晶体关联度高的知识点',
      empty: list.length === 0 ? '全部知识点都已掌握' : '',
    }
  }

  function metaOf(kp) { return meta[normalize(kp)] || null }
  function allKnowledgePoints() { return Object.keys(meta) }

  function reset() {
    state = null
    try { if (storage) storage.removeItem(storageKey) } catch (e) { /* ignore */ }
    load(); save()
  }

  function normalize(kp) {
    const s = String(kp || '').trim()
    return s.includes(':') ? s : `crystal:${s}`
  }

  return { update, summary, toText, recommend, meta: metaOf, allKnowledgePoints, reset, load }
}

export default createMasteryModel
