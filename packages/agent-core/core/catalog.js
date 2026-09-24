/**
 * catalog.js — 通用条目目录（渐进式披露的载体）
 *
 * 知识条目与教学技能都是「一批带 id 的结构化条目」，都需要同一件事：
 * **清单进上下文、正文按需取**。本文件把这件事抽成通用机制，
 * 由 knowledge / skills 共用。
 *
 * ★ 渐进式披露在这里的具体含义：
 *     index() 只返回**剔除重字段**后的清单（进系统提示），
 *     load()  才返回完整条目（模型主动调用时才注入对话）。
 *   脚本加载 ≠ 进 LLM 上下文。
 *
 * ★ 与 orbit 原实现的两处差异（都是修正，不是等价搬运）：
 *   1. 原 knowledge.js / skills.js 是**全局单例**（各一个 window.Knowledge /
 *      window.Skills），只能有一个知识库。多模块架构需要**每模块一个目录**
 *      （总库 + 各模块库各一份，见重构计划「目标架构 · 知识库与技能库的分层」），
 *      故改为工厂 createCatalog()。
 *   2. 原 load() 用**硬编码字段白名单**返回（写死 id/kp/title/body/source/
 *      misconceptions），内容一旦新增字段就会被**静默丢弃**。这里改为
 *      load() 返回完整条目，只把重字段从 index() 里剔除——**按减法而非加法**，
 *      新增字段不会丢失。
 *
 * 来源：orbit/H5/js/agent/knowledge.js（56 行）与 skills.js（50 行），
 *       2026-09-24 迁入共享核心并泛化。
 */

/**
 * 创建一个条目目录。
 *
 * @param {Object}   [opts]
 * @param {string}   [opts.key='id']      条目标识字段名（知识用 id，技能用 name）
 * @param {string[]} [opts.heavy=['body']] 「重字段」——不放进清单、只在 load 时返回
 * @returns {{
 *   register: (list: Object[]) => number,
 *   index: () => Object[],
 *   load: (id: string) => Object|null,
 *   has: (id: string) => boolean,
 *   ids: () => string[],
 *   filterBy: (field: string, value: any) => Object[],
 *   count: () => number,
 *   clear: () => void,
 * }}
 */
export function createCatalog(opts = {}) {
  const key = opts.key || 'id'
  const heavy = new Set(opts.heavy || ['body'])

  /** @type {Map<string, Object>} 用 Map 保持插入序（原实现按 key 排序，见 ids()） */
  const items = new Map()

  /**
   * 注册条目。重复 id 后者覆盖前者（便于模块覆盖总库的同名条目）。
   * @returns {number} 本次实际新增的数量（覆盖不计入）
   */
  function register(list) {
    let added = 0
    for (const item of list || []) {
      if (!item || !item[key]) continue
      if (!items.has(item[key])) added++
      items.set(item[key], item)
    }
    return added
  }

  /** 剔除重字段，得到可放进系统提示的清单 */
  function summarize(item) {
    const out = {}
    for (const k of Object.keys(item)) {
      if (!heavy.has(k)) out[k] = item[k]
    }
    return out
  }

  /**
   * 清单（稳定排序：按 id 升序）。
   *
   * ★ 与 orbit 原实现的一处行为差异（有意为之，已核实无消费者依赖）：
   *   原 Knowledge.index() 会排序，而原 Skills.index() **不排序**（用对象插入序）。
   *   本实现统一排序，使清单顺序不受**注册顺序**影响——多模块注册进同一目录时
   *   尤其重要（否则提示内容会随模块加载次序漂移，diff 噪声大且难以复现）。
   *   已核实消费者只有 agent-core.js 的 manifestText()，它仅拼接清单，不依赖顺序；
   *   question-engine.js 走 byKnowledgePoint(=filterBy)、tool-registry.js 走 load()，
   *   两者都与顺序无关。
   */
  function index() {
    return ids().map((id) => summarize(items.get(id)))
  }

  /** 取完整条目。取不到返回 null（调用方据此回一个"未找到"而非编造内容） */
  function load(id) {
    return items.get(id) || null
  }

  function has(id) {
    return items.has(id)
  }

  /** 全部 id，升序 */
  function ids() {
    return Array.from(items.keys()).sort()
  }

  /**
   * 按某字段取子集（如按知识点 kp 取同组条目）。
   * 这替代了原实现的 byKnowledgePoint(kp)——后者把字段名写死在方法名里，
   * 换成通用过滤后，技能库按 when / 知识库按 kp 都能用同一个方法。
   */
  function filterBy(field, value) {
    return ids()
      .map((id) => items.get(id))
      .filter((item) => item[field] === value)
  }

  function count() {
    return items.size
  }

  /** 清空（模块切换或测试用） */
  function clear() {
    items.clear()
  }

  return { register, index, load, has, ids, filterBy, count, clear }
}

export default createCatalog
