/**
 * perception.js — 感知快照（智能体的「眼」）
 *
 * 职责：把当前视图状态 + **交互痕迹** 序列化成结构化对象，供 LLM 决策。
 *
 * ★ 三条必须保住的设计（来自 orbit 原实现，都是踩过坑的结论）：
 *   1. 交互痕迹靠**轮询 getState() 差分**得到，因此**无需侵入任何现有事件处理**。
 *      新增一个受控参数不必去改视图代码——这在多模块下尤其重要。
 *   2. 只记录「动作类型 + 时间戳 + 数值」，**绝不记录任何输入文本**（隐私合规）。
 *   3. 快照每次对话前**实时生成、不缓存**——用户可能刚自己操作过视图再提问，
 *      缓存会让模型对着过时画面讲解。
 *
 * ★ 与 orbit 原实现的差异：原文件把 orbit 的状态形状写死在 snapshot() 里
 *   （orbital/mode/isosurface/charts…）并硬编码了 FIELD_LABEL 与「n/l/m 记停留」。
 *   这里把这三处抽成模块配置（describeState / fieldLabels / dwellFields），
 *   使核心不含任何学科内容，同时用默认值保证不配置也能跑。
 *
 * 来源：orbit/H5/js/agent/perception-snapshot.js（168 行），2026-09-24 迁入。
 */

/** 采样周期（毫秒） */
export const DEFAULT_POLL_MS = 500
/** 最近动作保留条数 */
export const DEFAULT_MAX_RECENT = 12
/** 每个控件保留最近几次停留时长 */
export const DEFAULT_DWELL_KEEP = 6

/**
 * 创建感知器。
 *
 * @param {Object}   opts
 * @param {Function} opts.getState      必需：取模块当前状态（通常是模块契约的 getSnapshot）。
 *                                      可返回活引用或嵌套对象——感知器会深拷贝后再差分
 * @param {Object}   [opts.fieldLabels] 状态字段 → 动作名，用于让痕迹可读（未知字段用原字段名）
 * @param {string[]} [opts.dwellFields] 需要记录「上个值被停留多久」的字段（一般是有教学意义的少数几个）
 * @param {Function} [opts.describeState] 模块自定义快照主体：(state) => Object。默认原样返回
 * @param {Function} [opts.formatCompact] 模块自定义紧凑文本：(snapshot) => string。默认为通用渲染
 * @param {number}   [opts.pollMs]
 * @param {number}   [opts.maxRecent]
 * @param {number}   [opts.dwellKeep]
 * @param {Function} [opts.now]         时间源，默认 Date.now（可注入以便测试）
 */
export function createPerception(opts = {}) {
  const getState = opts.getState
  if (typeof getState !== 'function') {
    throw new Error('createPerception 需要 opts.getState —— 没有它感知器取不到视图状态')
  }
  const fieldLabels = opts.fieldLabels || {}
  const dwellFields = new Set(opts.dwellFields || [])
  const describeState = opts.describeState || ((s) => s)
  const pollMs = opts.pollMs == null ? DEFAULT_POLL_MS : opts.pollMs
  const maxRecent = opts.maxRecent == null ? DEFAULT_MAX_RECENT : opts.maxRecent
  const dwellKeep = opts.dwellKeep == null ? DEFAULT_DWELL_KEEP : opts.dwellKeep
  const now = opts.now || Date.now

  const trace = {
    recentActions: [],   // [{ a, from, to, at }]
    toggleCounts: {},    // { setM: 8, ... }
    dwellMs: {},         // { m: [9000, 7000, ...] }
    lastChangeAt: now(),
  }

  let prev = null
  let timer = null

  /**
   * 深拷贝。**必须做**，原因是一个静默失败模式：
   * 原实现假定 getState() 返回新对象（orbit 的确实返回对象字面量），
   * 若某个模块返回**自己的活状态对象**，则 prev 与 cur 是同一个引用，
   * diffStates 永远算出「无变化」——痕迹恒为空，且不报任何错。
   * 深拷贝后无论模块返回活引用还是嵌套对象，差分都成立。
   */
  function deepClone(v) {
    if (Array.isArray(v)) return v.map(deepClone)
    if (v && typeof v === 'object') {
      const out = {}
      for (const k of Object.keys(v)) out[k] = deepClone(v[k])
      return out
    }
    return v
  }

  /** 值比较：数组与普通对象按内容比，其余按 === */
  function eq(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => eq(v, b[i]))
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a)
      const kb = Object.keys(b)
      return ka.length === kb.length && ka.every((k) => eq(a[k], b[k]))
    }
    return a === b
  }

  /** 差分出变化的字段 */
  function diffStates(a, b) {
    const out = []
    for (const k of Object.keys(b)) {
      if (!eq(a[k], b[k])) out.push({ key: k, from: a[k], to: b[k] })
    }
    return out
  }

  function poll() {
    const raw = getState()
    if (!raw) return
    const cur = deepClone(raw)   // 见 deepClone 的注释：防「返回活引用 → 痕迹恒空」
    const t = now()

    if (prev) {
      const changes = diffStates(prev, cur)
      if (changes.length) {
        const held = t - trace.lastChangeAt   // 上一个状态被保持了多久
        for (const ch of changes) {
          const label = fieldLabels[ch.key] || ch.key
          trace.toggleCounts[label] = (trace.toggleCounts[label] || 0) + 1
          trace.recentActions.push({ a: label, from: ch.from, to: ch.to, at: t })
          // 记录「上一个值」的停留时长——对"卡在某个取值上反复切换"这类诊断最有意义
          if (dwellFields.has(ch.key)) {
            const arr = trace.dwellMs[ch.key] || (trace.dwellMs[ch.key] = [])
            arr.push(held)
            if (arr.length > dwellKeep) arr.shift()
          }
        }
        if (trace.recentActions.length > maxRecent) {
          trace.recentActions.splice(0, trace.recentActions.length - maxRecent)
        }
        trace.lastChangeAt = t
      }
    } else {
      trace.lastChangeAt = t
    }
    prev = cur
  }

  function start() {
    if (timer) return
    poll()
    timer = setInterval(poll, pollMs)
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null }
  }

  /** 清空痕迹（切换模块或开始新一轮会话时用） */
  function reset() {
    trace.recentActions = []
    trace.toggleCounts = {}
    trace.dwellMs = {}
    trace.lastChangeAt = now()
    prev = null
  }

  /** 交互痕迹（供主动服务规则与快照共用） */
  function getTrace() {
    return {
      idleMs: now() - trace.lastChangeAt,
      toggleCounts: Object.assign({}, trace.toggleCounts),
      dwellMs: JSON.parse(JSON.stringify(trace.dwellMs)),
      recentActions: trace.recentActions.map((r) => r.a),
    }
  }

  /**
   * 生成完整快照。
   * @param {Object} [extra] 附加外部信息（如学情 mastery），合并到快照顶层
   */
  function snapshot(extra) {
    const state = getState() || {}
    const snap = {
      state: describeState(state),
      interaction: getTrace(),
    }
    if (extra) Object.assign(snap, extra)
    return snap
  }

  /** 通用紧凑文本（模块可覆写以做得更省 token / 更可读） */
  function defaultFormatCompact(snap) {
    const s = snap || snapshot()
    const it = s.interaction || {}
    return [
      '【当前状态】' + JSON.stringify(s.state),
      '【交互】空闲 ' + Math.round((it.idleMs || 0) / 1000) + 's' +
        '；切换次数 ' + JSON.stringify(it.toggleCounts || {}) +
        '；最近动作 ' + (it.recentActions || []).join('→'),
    ].join('\n')
  }

  function toCompactText(snap) {
    return (opts.formatCompact || defaultFormatCompact)(snap || snapshot())
  }

  return { start, stop, poll, reset, getTrace, snapshot, toCompactText }
}

export default createPerception
