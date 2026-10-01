/**
 * view-registry.js — 当前**可驱动视图**的注册表（按模块索引）
 *
 * ★ 为什么需要它：视图页实例由路由器创建（`new ViewerPage(params)`），
 *   存在 `router._currentPage` 里，**没有稳定的全局句柄**。而智能体是**全局单例**
 *   （面板跨路由存活），它必须在"此刻有没有可驱动的视图"这件事上得到明确答案。
 *
 * ★ 为什么不用 `router._currentPage` 代替：
 *   · 它的语义是"上一个页面"，不是"当前可驱动的视图"——两者在非视图页上恰好
 *     都是 null，但在切换过程中语义不同（旧页面可能已卸载、新页面尚未就绪）
 *   · 智能体对着一个已卸载的页面下发动作，是静默无效的失败（不报错、只是没反应）
 *   所以宁可要一个**语义精确**的独立注册表，而不是去复用路由器的内部字段。
 *
 * ★ 订阅用 `Set` 而非单槽位：契约的文件头专门警告过"单槽位会被后注册者静默顶掉"。
 *   面板的分镜控制条与感知层都要订阅适配器变化，必须是多订阅。
 *
 * ★ 注册/注销用**身份比对**（传入 page 实例）：因为卸载顺序不保证
 *   （可能新页面已注册、旧页面才卸载），无条件清空会把新注册项删掉。
 *
 * ★ 为什么按模块 id 索引（2026-09-30 改）：原先只有一个 `current` 槽位——
 *   那是"单模块应用"的假设。统一壳要同时挂载多个模块的视图（晶体在 viewer 页、
 *   轨道在它自己的页、对称又一处），单槽位下后注册的会顶掉先注册的。
 *   改法保留了原有的三条语义（身份比对 / 多订阅 / 订阅者异常隔离），
 *   只在外面加了一层 `moduleId → Map<page, adapter>`。
 */

/** moduleId → Map<page, adapter>。Map 的 key 就是 page 身份，天然满足"身份比对" */
const byModule = new Map()

/** 适配器变化的多订阅者们 */
const subscribers = new Set()

/**
 * 注册一个可驱动的视图页。
 * 由视图页 `mount()` 的最后一行调用（此时 canvas 已 mount、状态已初始化）。
 *
 * @param {string} moduleId  模块 id（如 'crystal'）
 * @param {Object} page      页面实例（作为身份标识）
 * @param {Object} adapter   它的适配器（把宿主页面适配成契约要求的 view 接口）
 * @returns {Object} adapter（便于链式使用）
 */
export function registerView(moduleId, page, adapter) {
  if (!moduleId) throw new Error('registerView 需要 moduleId')
  if (!page) throw new Error('registerView 需要 page')
  let m = byModule.get(moduleId)
  if (!m) byModule.set(moduleId, m = new Map())
  const replaced = m.size > 0 && !m.has(page)
  m.set(page, adapter)
  emit(moduleId, adapter, { replaced })
  return adapter
}

/**
 * 注销（由视图页 `unmount()` 的第一步调用）。
 * ★ 只在传入的 page **确实注册在该模块下**时才删——避免"新页面已注册、
 *   旧页面后卸载"的顺序把新项误删。
 *
 * @returns {boolean} 是否真的删掉了
 */
export function unregisterView(moduleId, page) {
  const m = byModule.get(moduleId)
  if (!m || !m.has(page)) return false
  m.delete(page)
  if (!m.size) byModule.delete(moduleId)
  emit(moduleId, getAdapter(moduleId))
  return true
}

/**
 * 取某模块当前的适配器（无则 null）。智能体据此判断"现在能不能动手"。
 *
 * @param {string} [moduleId]
 *   省略时：只在**恰好一个**模块注册了视图的情况下返回它；
 *   零个模块返回 null；**多于一个则抛错**。
 *   ★ 抛错而不是"静默取任意一个"——静默取任意一个会让智能体把动作下发给
 *     错误的模块，而这类错误在界面上表现为"动作好像生效了、其实是别的视图动了"。
 *   单模块部署（今天的 apps/crystal）用无参形式即可；多模块壳请显式传 id。
 */
export function getAdapter(moduleId) {
  if (moduleId != null) {
    const m = byModule.get(moduleId)
    if (!m || !m.size) return null
    // 同一模块内多页时取"最后注册的"（Map 保持插入序）
    let last = null
    for (const a of m.values()) last = a
    return last
  }
  if (byModule.size === 0) return null
  if (byModule.size === 1) {
    const only = byModule.values().next().value
    for (const a of only.values()) return a
  }
  throw new Error(
    `getAdapter() 无参调用有歧义（已注册 ${byModule.size} 个模块的视图：`
    + `${[...byModule.keys()].join(', ')}），请传入 moduleId`,
  )
}

/** 取某模块当前注册的页面实例（诊断用；智能体应只用 getAdapter） */
export function getPage(moduleId) {
  const m = byModule.get(moduleId)
  if (!m || !m.size) return null
  let last = null
  for (const p of m.keys()) last = p
  return last
}

/** 某模块是否已有可驱动的视图（省略 moduleId 则问"有没有任何视图"） */
export function hasView(moduleId) {
  if (moduleId == null) return byModule.size > 0
  const m = byModule.get(moduleId)
  return !!(m && m.size)
}

/** 已注册视图的模块 id 列表 */
export function listModulesWithView() {
  return [...byModule.keys()]
}

/**
 * 订阅适配器变化。返回取消函数。
 * @param {(adapter: Object|null, moduleId?: string) => void} cb
 */
export function onAdapterChange(cb) {
  if (typeof cb !== 'function') return () => {}
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

function emit(moduleId, adapter, meta) {
  for (const cb of [...subscribers]) {
    try { cb(adapter, moduleId, meta) } catch (e) {
      // 单个订阅者异常不应影响其余订阅者，也不该影响视图注册本身
      console.warn('[view-registry] 订阅者异常：', e)
    }
  }
}

/** 仅供测试：清空状态 */
export function _reset() {
  byModule.clear()
  subscribers.clear()
}

export default {
  registerView, unregisterView, getAdapter, getPage, hasView,
  listModulesWithView, onAdapterChange,
}
