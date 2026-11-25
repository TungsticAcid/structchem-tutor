/**
 * analytics-events.mjs — 埋点事件的**白名单与归一化**
 *
 * 设计原则（与统计服务的安全边界直接相关）：
 *   1. 只接受**固定事件名**与**固定字段**。服务端不保存任意 JSON —— 否则将来某个
 *      客户端把题干/API Key/邮箱顺手塞进 props，就会在无人察觉的情况下落库。
 *   2. 不保存 IP、User-Agent、Referer、完整 URL。设备与语言在客户端粗化为
 *      desktop/mobile/tablet 与 zh/en 后才上报；路径只保留到路由（去掉查询串与 hash）。
 *   3. 时间戳一律用**服务端收到的时刻**。客户端时钟不可信，且这样不会因为某台
 *      机器时间错乱而把统计打成未来/过去。
 *   4. 每条事件带 eventId，数据库唯一约束负责幂等：网络重试、sendBeacon 与
 *      fetch 同时到达都不会重复计数。
 */

export const EVENT_NAMES = Object.freeze([
  'session_start',
  'page_view',
  'agent_turn',
  'quiz_start',
  'quiz_submit',
])

const NAME_SET = new Set(EVENT_NAMES)
export const MODULES = Object.freeze(['crystal', 'orbit', 'symmetry'])
const MODULE_SET = new Set(MODULES)
const DEVICES = new Set(['desktop', 'tablet', 'mobile'])
const LANGS = new Set(['zh', 'en'])
const ERROR_KINDS = new Set(['no_key', 'auth', 'network', 'rate_limit', 'server', 'aborted', 'error'])
const QUIZ_KINDS = new Set(['choice', 'judge', 'short', 'unknown'])
const QUIZ_SOURCES = new Set(['practice', 'agent'])

const ID_RE = /^[A-Za-z0-9_-]{16,80}$/
const TOOL_RE = /^[A-Za-z][A-Za-z0-9_]{1,48}$/

/** 去掉控制字符、压缩空白、截断。长度按 Unicode 码点算，避免把 emoji 劈成半个。 */
export function cleanText(value, max = 120) {
  if (value == null) return ''
  const s = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return Array.from(s).slice(0, max).join('')
}

/**
 * 只保留「一条路由」的信息：去掉查询串与 hash，并拒绝包含协议/反斜杠的输入。
 * 路由参数（晶体 id）保留——它是教学资源名，不含个人信息。
 */
export function cleanPath(value) {
  // 先去掉查询串/hash，再判形态：路径本身是白名单，查询串一律丢弃。
  const s = cleanText(value, 120).split('#')[0].split('?')[0]
  if (!s) return '/'
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\')) return '/'
  return s.slice(0, 100) || '/'
}

/** 由路径推断所属模块（客户端也会报，但服务端再兜一次，避免 module 为空）。 */
export function moduleFromPath(path) {
  const p = cleanPath(path)
  if (p === '/orbit' || p.startsWith('/orbit/')) return 'orbit'
  if (p === '/symmetry' || p.startsWith('/symmetry/')) return 'symmetry'
  if (p === '/crystal' || p.startsWith('/crystal/')) return 'crystal'
  if (p.startsWith('/viewer/') || p.startsWith('/compare/')) return 'crystal'
  return null
}

function cleanId(value) {
  return typeof value === 'string' && ID_RE.test(value) ? value : ''
}

function bool(value) {
  return value === true || value === 1 || value === '1'
}

function finiteInt(value, min, max, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function cleanTools(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    const s = cleanText(item, 48)
    if (TOOL_RE.test(s) && !out.includes(s)) out.push(s)
    if (out.length >= 12) break
  }
  return out
}

/**
 * 归一化一条事件。
 * @returns {{ok:true,event:Object}|{ok:false,reason:string}}
 */
export function normalizeEvent(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'event_not_object' }
  }
  const name = cleanText(raw.name, 32)
  if (!NAME_SET.has(name)) return { ok: false, reason: 'unknown_event' }

  const eventId = cleanId(raw.eventId)
  const visitorId = cleanId(raw.visitorId)
  const sessionId = cleanId(raw.sessionId)
  if (!eventId) return { ok: false, reason: 'bad_event_id' }
  if (!visitorId) return { ok: false, reason: 'bad_visitor_id' }
  if (!sessionId) return { ok: false, reason: 'bad_session_id' }

  const props = (raw.props && typeof raw.props === 'object' && !Array.isArray(raw.props)) ? raw.props : {}
  const out = { name, module: null, page: null, props: {} }
  out.eventId = eventId
  out.visitorId = visitorId
  out.sessionId = sessionId

  const module = cleanText(props.module, 16)
  if (MODULE_SET.has(module)) out.module = module

  switch (name) {
    case 'session_start': {
      out.props.lang = LANGS.has(props.lang) ? props.lang : 'zh'
      out.props.device = DEVICES.has(props.device) ? props.device : 'desktop'
      out.page = cleanPath(props.path)
      out.module = out.module || moduleFromPath(out.page)
      out.props.path = out.page
      break
    }
    case 'page_view': {
      out.page = cleanPath(props.path)
      out.module = out.module || moduleFromPath(out.page)
      out.props.path = out.page
      break
    }
    case 'agent_turn': {
      out.props.ok = bool(props.ok)
      out.props.aborted = bool(props.aborted)
      const ek = cleanText(props.errorKind, 24)
      out.props.errorKind = ERROR_KINDS.has(ek) ? ek : (out.props.ok ? '' : 'error')
      out.props.durationMs = finiteInt(props.durationMs, 0, 30 * 60 * 1000)
      out.props.toolCalls = finiteInt(props.toolCalls, 0, 100)
      out.props.tools = cleanTools(props.tools)
      out.props.finishReason = cleanText(props.finishReason, 32)
      break
    }
    case 'quiz_start': {
      const source = cleanText(props.source, 16)
      out.props.source = QUIZ_SOURCES.has(source) ? source : 'practice'
      break
    }
    case 'quiz_submit': {
      const kind = cleanText(props.kind, 16)
      out.props.kind = QUIZ_KINDS.has(kind) ? kind : 'unknown'
      out.props.graded = bool(props.graded)
      out.props.correct = out.props.graded ? bool(props.correct) : null
      break
    }
    default:
      return { ok: false, reason: 'unknown_event' }
  }

  // 极小概率的伪造：客户端给 module 与路径矛盾时以路径为准。
  if (out.page) {
    const byPath = moduleFromPath(out.page)
    if (byPath) out.module = byPath
  }
  return { ok: true, event: out }
}

/** 归一化一批事件。无效项单独剔除，不连累整批。 */
export function normalizeBatch(rawEvents, now = Date.now()) {
  const list = Array.isArray(rawEvents) ? rawEvents : []
  const events = []
  const rejected = []
  for (const raw of list.slice(0, 40)) {
    const r = normalizeEvent(raw, now)
    if (r.ok) events.push(r.event)
    else rejected.push(r.reason)
  }
  return { events, rejected }
}

export const __test__ = {
  cleanText, cleanPath, moduleFromPath, ID_RE,
}
