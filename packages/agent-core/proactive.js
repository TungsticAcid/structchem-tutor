/**
 * proactive.js — 主动介入（`proactive` 节点）
 *
 * 这是唯一一个**本地规则先筛、命中才唤起模型**的节点。
 * 未命中时零 token——不是"省一点"，而是这个功能能否常态运行的前提：
 * 一个每 2.5 秒就问一次模型"要不要提醒学生"的实现，成本会高到没人敢开。
 *
 * ★ 纪律（都来自参考实现的实测经验，逐条都有代价）：
 *   · 同一规则 3 分钟内不重复触发
 *   · 两次主动提示至少间隔 45 秒（否则会变成骚扰）
 *   · **一次只发一条**（三条同时弹出来，学生只会全关掉）
 *   · 正在对话、正在播演示时不打扰
 *   · 用户可全局关闭
 *
 * ★ 与"提议不执行"的强约束配合：本模块**只提议**（把建议交给面板显示成卡片），
 *   真正的动作由学生点「应用」后经 `applySceneActions` 下发。
 *   `constraints.js` 的 proactive 节点没有 hand 授权，这是结构保证。
 */

/** 轮询间隔：比感知的 500ms 慢得多——主动提示不需要那么灵敏，而它要跑一辈子 */
const TICK_MS = 2500
/** 同一规则的冷却 */
const COOLDOWN_MS = 3 * 60 * 1000
/** 两次提示之间的全局最小间隔 */
const GLOBAL_MIN_INTERVAL = 45 * 1000

/**
 * @param {Object} deps
 * @param {Array}  deps.rules       模块贡献的规则（descriptor.proactiveRules）
 * @param {Object} deps.perception  感知层（取 trace 与快照）
 * @param {Object} deps.storyboard  演示队列（在播时不打扰）
 * @param {Function} deps.onSuggest (suggestion) => void  面板据此显示一张建议卡
 * @param {Function} [deps.isBusy]  额外判断"此刻不该打扰"（如正在对话）
 * @param {Function} [deps.isEnabled] 用户是否开启了主动提示
 * @param {number} [deps.tickMs]
 */
export function createProactive(deps = {}) {
  const rules = deps.rules || []
  const perception = deps.perception
  const storyboard = deps.storyboard
  if (!perception) throw new Error('createProactive 需要 deps.perception')
  if (typeof deps.onSuggest !== 'function') throw new Error('createProactive 需要 deps.onSuggest')

  const tickMs = deps.tickMs || TICK_MS
  let timer = null
  let lastGlobalAt = 0
  /** ruleId → 上次触发时间 */
  const lastFiredAt = Object.create(null)
  /** 已触发过的规则计数（供诊断） */
  const firedCount = Object.create(null)

  /** 这次 tick 检出的建议（供测试直接驱动，不必等定时器） */
  function evaluate(now = Date.now()) {
    if (!rules.length) return null
    if (typeof deps.isEnabled === 'function' && !deps.isEnabled()) return null
    // 正在播演示时不打扰：学生正看着分镜，弹一条建议只会打断
    if (storyboard && typeof storyboard.state === 'function') {
      const st = storyboard.state()
      if (st && st.playing) return null
    }
    if (typeof deps.isBusy === 'function' && deps.isBusy()) return null
    if (now - lastGlobalAt < GLOBAL_MIN_INTERVAL) return null

    const trace = perception.getTrace ? perception.getTrace() : {}
    const full = perception.snapshot ? perception.snapshot() : {}
    // 规则的第二个参数是**视图状态**（facade 的快照），不是整个感知快照
    const state = full.state || {}

    for (const r of rules) {
      if (!r || !r.id || typeof r.check !== 'function') continue
      if (now - (lastFiredAt[r.id] || 0) < COOLDOWN_MS) continue

      let hit = false
      try { hit = !!r.check(trace, state) } catch (e) {
        // 规则自身写错（如字段名对不上）不应影响其他规则，也不该让整个 tick 崩
        console.warn(`[proactive] 规则 ${r.id} 的 check 抛错：`, e)
        continue
      }
      if (!hit) continue

      const s = (r.suggest && r.suggest[0]) || null
      // 没有建议动作的规则（如"记录但不提示"）只标记已触发，不打扰学生
      if (!s || !s.text) { lastFiredAt[r.id] = now; continue }

      lastFiredAt[r.id] = now
      lastGlobalAt = now
      firedCount[r.id] = (firedCount[r.id] || 0) + 1
      return { ruleId: r.id, text: s.text, actions: s.actions || [], desc: r.desc || '' }
    }
    return null
  }

  function tick() {
    const s = evaluate()
    if (s) {
      try { deps.onSuggest(s) } catch (e) { console.warn('[proactive] onSuggest 抛错：', e) }
    }
  }

  function start() {
    if (timer || !rules.length) return
    timer = setInterval(tick, tickMs)
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null }
  }
  /** 用户手动关闭 / 重新开启时清掉冷却，让提示能立刻生效 */
  function resetCooldown() {
    lastGlobalAt = 0
    for (const k of Object.keys(lastFiredAt)) delete lastFiredAt[k]
  }

  /**
   * 学生点了「不用了」：把该规则的冷却**从这一刻重新计时**。
   *
   * ★ 只把卡片关掉是不够的：规则的下次触发只看"距上次触发过了多久"，所以拒绝之后
   *   隔一个冷却周期它又会弹出来——学生的感受是"我说了不要，它还在问"。
   *   这里把"上次触发时间"改写为现在，于是完整冷却从**拒绝那一刻**重新开始。
   *   同样也要刷新全局间隔：否则紧接着另一条规则会立刻补上一张卡。
   */
  function decline(ruleId) {
    const t = Date.now()
    if (ruleId) lastFiredAt[ruleId] = t
    lastGlobalAt = t
    return !!ruleId
  }

  return {
    start, stop, tick, evaluate, resetCooldown, decline,
    get running() { return !!timer },
    _firedCount: firedCount,
    _lastGlobalAt: () => lastGlobalAt,
  }
}

export default createProactive
