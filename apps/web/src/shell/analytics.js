/**
 * analytics.js — 前端匿名使用统计
 *
 * 只上报**计数型**事实：
 *   · 哪个路由被打开；
 *   · 智能体跑了一轮（耗时、工具调用数、成功/失败），不带上提问与回答；
 *   · 哪次练习开始/提交（对错），不带题干、选项与答案。
 *
 * 绝不读取或上报：API Key、对话正文、localStorage 里的学情/收藏、User-Agent、
 * Referer、IP（服务端也不落 IP）。标识只有两个随机 UUID：
 *   visitorId  —— 存在 localStorage，用于「用户数 / 留存」；
 *   sessionId  —— 存在 sessionStorage，用于「会话数 / 时长」。
 *
 * 默认同源 `/api/analytics/*`。若站点是纯静态部署（没有统计服务），启动时的
 * 健康检查会失败，埋点自动保持关闭——不会每页刷 404，也不会影响主功能。
 *
 * 用户可在「设置 → 隐私 → 匿名使用统计」关闭；Do Not Track / GPC 也直接禁用。
 */

const VISITOR_KEY = 'chem-agent.analytics.id'
const SESSION_KEY = 'chem-agent.analytics.session'
const SESSION_STARTED_KEY = 'chem-agent.analytics.started'
const FLUSH_MS = 5000
const MAX_QUEUE = 100
const MAX_BATCH = 20
const QUIZ_START_THROTTLE_MS = 60 * 1000

const ALLOWED_MODULES = new Set(['crystal', 'orbit', 'symmetry'])

/** 从 hash 路由推断模块；与后台的模块名保持一致。 */
export function pageModule(path) {
  const p = String(path || '/').split('?')[0]
  if (p === '/orbit' || p.startsWith('/orbit/')) return 'orbit'
  if (p === '/symmetry' || p.startsWith('/symmetry/')) return 'symmetry'
  if (p === '/crystal' || p.startsWith('/crystal/')) return 'crystal'
  if (p.startsWith('/viewer/') || p.startsWith('/compare/')) return 'crystal'
  return null
}

/** 只保留路由，绝不把查询串带到服务端。 */
export function cleanPage(path) {
  const p = String(path || '/').split('#')[0].split('?')[0]
  if (!p.startsWith('/') || p.startsWith('//') || p.includes('\\')) return '/'
  return p.slice(0, 100) || '/'
}

export function detectDevice(win) {
  const w = Number(win && win.innerWidth) || 0
  const touch = Number(win && win.navigator && win.navigator.maxTouchPoints) || 0
  if (w && w < 720) return 'mobile'
  if (w && w < 1080 && touch) return 'tablet'
  return 'desktop'
}

function randomId(cryptoObj) {
  try {
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID()
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      const bytes = new Uint8Array(16)
      cryptoObj.getRandomValues(bytes)
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch (e) { /* fall through */ }
  return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
}

function storageGet(storage, key) {
  try { return storage ? storage.getItem(key) : null } catch (e) { return null }
}

function storageSet(storage, key, value) {
  try { if (storage) storage.setItem(key, value) } catch (e) { /* 隐私模式/配额满：只留内存态 */ }
}

function readLang(doc) {
  try {
    const lang = doc && doc.documentElement && doc.documentElement.getAttribute('lang')
    if (lang && lang.toLowerCase().startsWith('en')) return 'en'
  } catch (e) { /* ignore */ }
  return 'zh'
}

/**
 * @param {Object} [cfg]
 * @param {Object} [cfg.win]          window（测试可注入）
 * @param {Object} [cfg.doc]          document
 * @param {Object} [cfg.localStorage]
 * @param {Object} [cfg.sessionStorage]
 * @param {Function} [cfg.isEnabled]  返回 false 时整体禁用
 * @param {string} [cfg.endpoint]
 * @param {string} [cfg.health]
 * @param {Function} [cfg.fetch]
 * @param {number} [cfg.now]
 */
export function createAnalytics(cfg = {}) {
  const win = cfg.win || (typeof window !== 'undefined' ? window : null)
  const doc = cfg.doc || (typeof document !== 'undefined' ? document : null)
  const local = cfg.localStorage || (win && win.localStorage) || null
  const sessionStore = cfg.sessionStorage || (win && win.sessionStorage) || null
  const fetchFn = cfg.fetch || (win && win.fetch ? win.fetch.bind(win) : null)
  const now = cfg.now || (() => Date.now())
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
  const endpoint = cfg.endpoint || env.VITE_ANALYTICS_ENDPOINT || '/api/analytics/collect'
  const health = cfg.health || env.VITE_ANALYTICS_HEALTH
    || endpoint.replace(/\/collect\/?$/, '/health')

  const api = {
    enabled: false,
    _queue: [],
    _flushing: false,
    _timer: null,
    _retry: null,
    _lastPage: null,
    _lastPageAt: 0,
    _lastRequestedPage: null,
    _quizStartAt: Object.create(null),
    _bound: false,
  }

  function blockedByPrivacy() {
    try {
      const nav = win && win.navigator
      if (!nav) return true
      if (nav.doNotTrack === '1' || win.doNotTrack === '1' || nav.msDoNotTrack === '1') return true
      if (nav.globalPrivacyControl === true) return true
    } catch (e) { /* ignore */ }
    return false
  }

  function allowed() {
    if (blockedByPrivacy()) return false
    if (typeof cfg.isEnabled === 'function') {
      try { return cfg.isEnabled() !== false } catch (e) { return false }
    }
    return true
  }

  function ensureVisitorId() {
    let id = storageGet(local, VISITOR_KEY)
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(id || '')) {
      id = randomId(win && win.crypto)
      storageSet(local, VISITOR_KEY, id)
    }
    return id
  }

  function ensureSession() {
    const raw = storageGet(sessionStore, SESSION_KEY)
    if (raw) {
      try {
        const s = JSON.parse(raw)
        if (s && /^[A-Za-z0-9_-]{16,80}$/.test(s.id || '')) return s
      } catch (e) { /* 重建 */ }
    }
    const s = { id: randomId(win && win.crypto), startedAt: now() }
    storageSet(sessionStore, SESSION_KEY, JSON.stringify(s))
    storageSet(sessionStore, SESSION_STARTED_KEY, '')
    return s
  }

  function sessionInfo() {
    return ensureSession()
  }

  function event(name, props) {
    if (!api.enabled) return false
    const s = sessionInfo()
    const e = {
      eventId: randomId(win && win.crypto),
      visitorId: ensureVisitorId(),
      sessionId: s.id,
      name,
      props: props || {},
    }
    api._queue.push(e)
    if (api._queue.length > MAX_QUEUE) api._queue.splice(0, api._queue.length - MAX_QUEUE)
    if (api._queue.length >= 10) flush()
    else schedule()
    return true
  }

  function schedule() {
    if (api._timer || !api.enabled) return
    api._timer = setTimeout(() => {
      api._timer = null
      flush()
    }, FLUSH_MS)
    // Node/测试桩可能没有 unref；有就避免占住进程。
    if (api._timer && typeof api._timer.unref === 'function') api._timer.unref()
  }

  function scheduleRetry() {
    if (api._retry || !api.enabled) return
    api._retry = setTimeout(() => {
      api._retry = null
      flush()
    }, 15000)
    if (api._retry && typeof api._retry.unref === 'function') api._retry.unref()
  }

  function requeue(batch) {
    // 保留 eventId：即使服务端其实已经写入、只是响应丢了，唯一约束会去重。
    api._queue = batch.concat(api._queue).slice(0, MAX_QUEUE)
    scheduleRetry()
  }

  function beacon(batch) {
    try {
      if (!win || !win.navigator || typeof win.navigator.sendBeacon !== 'function') return false
      const body = JSON.stringify({ events: batch })
      const blob = new Blob([body], { type: 'application/json' })
      return win.navigator.sendBeacon(endpoint, blob) === true
    } catch (e) { return false }
  }

  function flush(preferBeacon = false) {
    if (!api.enabled || api._flushing || !api._queue.length) return Promise.resolve()
    if (!fetchFn && !(preferBeacon && win && win.navigator && win.navigator.sendBeacon)) {
      return Promise.resolve()
    }
    if (api._timer) { clearTimeout(api._timer); api._timer = null }

    const batch = api._queue.slice(0, MAX_BATCH)
    api._queue = api._queue.slice(batch.length)

    if (preferBeacon && beacon(batch)) return Promise.resolve()

    if (!fetchFn) { requeue(batch); return Promise.resolve() }
    api._flushing = true
    return fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
      credentials: 'same-origin',
    }).then((res) => {
      if (res && (res.status === 202 || res.status === 200 || res.status === 204)) return
      // 4xx 是格式/权限问题，重发也不会成功；直接丢弃，避免堵住后面的批次。
      if (res && res.status >= 400 && res.status < 500 && res.status !== 429) return
      requeue(batch)
    }).catch(() => {
      requeue(batch)
    }).finally(() => {
      api._flushing = false
      if (api._queue.length >= MAX_BATCH) {
        setTimeout(() => flush(), 80)
      } else if (api._queue.length) {
        schedule()
      }
    })
  }

  function onHidden() {
    if (doc && doc.visibilityState === 'hidden') flush(true)
  }

  function bindLifecycle() {
    if (api._bound || !win || !win.addEventListener) return
    api._bound = true
    if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onHidden)
    win.addEventListener('pagehide', () => flush(true))
    win.addEventListener('online', () => flush())
  }

  async function init() {
    if (api.enabled || !allowed()) return false
    if (!fetchFn || !win) return false
    try {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 1800) : null
      const res = await fetchFn(health, {
        method: 'GET',
        credentials: 'same-origin',
        signal: ctrl ? ctrl.signal : undefined,
      })
      if (timer) clearTimeout(timer)
      if (!res || !res.ok) return false
      const body = await res.json()
      if (!body || body.ok !== true) return false
    } catch (e) {
      return false
    }

    api.enabled = true
    bindLifecycle()
    const s = sessionInfo()
    if (storageGet(sessionStore, SESSION_STARTED_KEY) !== s.id) {
      storageSet(sessionStore, SESSION_STARTED_KEY, s.id)
      event('session_start', {
        path: api._lastRequestedPage || '/',
        lang: readLang(doc),
        device: detectDevice(win),
      })
    }
    if (api._lastRequestedPage) api.pageView(api._lastRequestedPage)
    schedule()
    return true
  }

  api.init = init

  api.pageView = function pageView(path) {
    const p = cleanPage(path)
    api._lastRequestedPage = p
    if (!api.enabled) return false
    const t = now()
    // 同一路由的重复挂载（首次 hash 归一、语言重挂、点当前导航）不重复计一次浏览。
    // 去重键是**上一次浏览的路由**，所以 A → B → A 仍会记两次 A。
    if (p === api._lastPage) return false
    api._lastPage = p
    api._lastPageAt = t
    return event('page_view', { path: p, module: pageModule(p) })
  }

  api.quizStart = function quizStart(module, source) {
    if (!ALLOWED_MODULES.has(module)) return false
    const t = now()
    const last = api._quizStartAt[module] || 0
    if (t - last < QUIZ_START_THROTTLE_MS) return false
    api._quizStartAt[module] = t
    return event('quiz_start', {
      module,
      source: source === 'agent' ? 'agent' : 'practice',
    })
  }

  api.quizSubmit = function quizSubmit(info = {}) {
    const module = info.module
    if (!ALLOWED_MODULES.has(module)) return false
    const graded = info.graded !== false
    return event('quiz_submit', {
      module,
      kind: info.kind || 'unknown',
      graded,
      correct: graded ? !!info.correct : null,
    })
  }

  api.agentTurn = function agentTurn(info = {}) {
    const toolCalls = Math.max(0, Math.min(100, Number(info.toolCalls) || 0))
    const tools = Array.isArray(info.tools) ? info.tools.slice(0, 12) : []
    return event('agent_turn', {
      module: ALLOWED_MODULES.has(info.module) ? info.module : null,
      ok: info.ok !== false,
      aborted: !!info.aborted,
      errorKind: info.ok === false ? (info.errorKind || 'error') : '',
      durationMs: Math.max(0, Math.min(30 * 60 * 1000, Number(info.durationMs) || 0)),
      toolCalls,
      tools,
      finishReason: String(info.finishReason || '').slice(0, 32),
    })
  }

  api.flush = flush
  api.setEnabled = function setEnabled(on) {
    if (!on) {
      api.enabled = false
      api._queue = []
      // 重新打开后，同一路由应当重新计一次浏览（否则用户会以为开关没生效）。
      api._lastPage = null
      api._lastPageAt = 0
      if (api._timer) { clearTimeout(api._timer); api._timer = null }
      if (api._retry) { clearTimeout(api._retry); api._retry = null }
      return
    }
    if (!api.enabled) init()
  }

  api.resetIdentity = function resetIdentity() {
    try { local && local.removeItem(VISITOR_KEY) } catch (e) { /* ignore */ }
    try { sessionStore && sessionStore.removeItem(SESSION_KEY) } catch (e) { /* ignore */ }
    try { sessionStore && sessionStore.removeItem(SESSION_STARTED_KEY) } catch (e) { /* ignore */ }
    api._queue = []
    api._lastPage = null
    api._lastPageAt = 0
    api._quizStartAt = Object.create(null)
  }

  /** 供测试 / 诊断：不暴露用户标识，只给队列长度与启用状态。 */
  api._debug = () => ({ enabled: api.enabled, queued: api._queue.length, endpoint })

  return api
}
