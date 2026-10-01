/**
 * params.js — 参数校验与归一化的小工具
 *
 * ★ 为什么值得单独一个文件：CLAUDE.md §一.2 有一条硬约定——
 *   **参数取值域由程序校验，不由提示词约束**。凡是"模型可能传越界值"的地方，
 *   都要走夹紧或拒绝，而不是在提示词里写"请不要传负数"。
 *   每个模块的动作校验都需要这几件事，故集中在这里，避免各写一遍、各夹错一处。
 *
 * 约定（与 core/storyboard 的 validate 契约一致）：
 *   校验函数返回 `{ params }` 表示通过且已归一化，返回 `{ err }` 表示拒绝。
 *   被拒绝的步骤**不入队、不占用户的一次点击**。
 *
 * 来源：orbit/H5/js/agent/scene-bridge.js 的 clampInt / clampNum（第 354–361 行），
 * 2026-09-24 抽到共享层并补齐枚举校验。
 */
// ★ 拒绝理由会作为工具结果回灌给模型（"模型不得口算"的配套：告诉它哪里错了），
//   故走 t()。注意 `label` 是**调用方给的字段名**（多半是英文 key，如 'mode'），
//   翻译的是句式而不是字段名。
// ★ 自己 import 字典：`modules/crystal/actions.js` 直接引用本文件（不经 app.js）
import '../i18n.js'
import { t } from '../../i18n/index.js'

/**
 * 夹紧到区间。非有限值返回 null（调用方据此判"非法"并回 err，而不是悄悄取默认）。
 * @returns {number|null}
 */
export function clamp(v, lo, hi) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.min(hi, Math.max(lo, n))
}

/** 夹紧为整数 */
export function clampInt(v, lo, hi) {
  const n = clamp(v, lo, hi)
  return n == null ? null : Math.round(n)
}

/** 数值校验 + 默认值：非法时用默认值（用于"可选参数"） */
export function clampOr(v, lo, hi, fallback) {
  const n = clamp(v, lo, hi)
  return n == null ? fallback : n
}

/**
 * 枚举校验。
 * @param {*} v
 * @param {string[]} allowed
 * @returns {string|null} 合法则原样返回，否则 null
 */
export function pickEnum(v, allowed) {
  return allowed.indexOf(v) >= 0 ? v : null
}

/**
 * 生成"枚举校验 + 明确错误信息"的结果对象。
 * 用法：`const m = requireEnum(p.mode, CELL_MODES, 'mode'); if (m.err) return m; ...`
 * @returns {{value: string} | {err: string}}
 */
export function requireEnum(v, allowed, label) {
  const m = pickEnum(v, allowed)
  if (m == null) {
    return { err: t('agent.params.enum', { label, allowed: allowed.join('/'), got: JSON.stringify(v) }) }
  }
  return { value: m }
}

/** 生成"必填字符串"的结果对象（会 trim，空串视为缺失） */
export function requireString(v, label) {
  if (typeof v !== 'string' || !v.trim()) return { err: t('agent.params.string', { label }) }
  return { value: v.trim() }
}

export default { clamp, clampInt, clampOr, pickEnum, requireEnum, requireString }
