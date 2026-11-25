/**
 * analytics-server.mjs — 统计服务（HTTP 入口）
 *
 * 只做三件事：
 *   1. 接收前端匿名埋点（`/api/analytics/collect`，同源、限流、字段白名单）；
 *   2. 给后台看板提供聚合数据（`/api/admin/stats`，需管理员登录）；
 *   3. 在未额外配置 Nginx 时，也能直接托管构建产物与 `/admin` 页面。
 *
 * 生产部署推荐：
 *   Nginx 继续托管 `apps/web/dist`，只把 `/api/` 与 `/admin` 反代到本进程
 *   （见 server/README.md）。这样静态资源仍由 Nginx 直接出，Node 只处理 JSON。
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAdminAuth } from './analytics-auth.mjs'

const ADMIN_DIR = fileURLToPath(new URL('./admin/', import.meta.url))
const MAX_BODY = 128 * 1024
const MAX_EVENTS = 40

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

/** 简单的滑动窗口限流器（按进程内存；重启即清零）。 */
function createRateLimiter() {
  const buckets = new Map()
  function hit(key, limit, windowMs, now = Date.now()) {
    let b = buckets.get(key)
    if (!b || now >= b.reset) {
      b = { count: 0, reset: now + windowMs }
      buckets.set(key, b)
    }
    b.count += 1
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now >= v.reset) buckets.delete(k)
    }
    return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), reset: b.reset }
  }
  function reset(key) { buckets.delete(key) }
  return { hit, reset }
}

function clientKey(req) {
  // 默认监听 127.0.0.1，由 Nginx 反代。若把反代传来的真实地址也算成同一个 key，
  // 全校学生会被并成一个人，240 次/分钟的埋点配额几分钟就会打满。
  // 服务不直接对公网开放，故可以信任反向代理写入的 X-Forwarded-For 第一段。
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  if (xff) return xff.slice(0, 64)
  return String((req.socket && req.socket.remoteAddress) || 'unknown')
}

function securityHeaders(res, { admin = false } = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  if (admin) {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; "
      + 'frame-ancestors \'none\'')
  }
}

function json(res, status, body, extraHeaders = {}) {
  const data = JSON.stringify(body)
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  }, extraHeaders))
  res.end(data)
}

function text(res, status, body, headers = {}) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  }, headers))
  res.end(body)
}

function readJson(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0
    let tooLarge = false
    const chunks = []
    req.on('data', (chunk) => {
      if (tooLarge) return
      size += chunk.length
      if (size > MAX_BODY) {
        // 不 destroy：先把已到的字节读完/丢弃，让 413 能正常写回客户端。
        tooLarge = true
        chunks.length = 0
        reject(Object.assign(new Error('body_too_large'), { status: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) return
      if (!chunks.length) return resolvePromise({})
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (e) {
        reject(Object.assign(new Error('bad_json'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    const o = new URL(origin)
    return o.host === req.headers.host
  } catch (e) {
    return false
  }
}

function isSecure(req) {
  return !!(req.socket && req.socket.encrypted)
    || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
}

function safeStaticPath(root, pathname) {
  let decoded
  try { decoded = decodeURIComponent(pathname) } catch (e) { return null }
  if (decoded.includes('\0')) return null
  const target = resolve(root, '.' + decoded)
  const base = resolve(root)
  if (target !== base && !target.startsWith(base + sep)) return null
  return target
}

async function serveFile(req, res, file, { admin = false, cache = 'no-cache' } = {}) {
  try {
    const stat = await readFile(file)
    const ext = extname(file).toLowerCase()
    securityHeaders(res, { admin })
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.length,
      'Cache-Control': cache,
    })
    res.end(req.method === 'HEAD' ? undefined : stat)
    return true
  } catch (e) {
    return false
  }
}

async function serveAdmin(req, res, pathname) {
  if (pathname === '/admin' || pathname === '/admin/') {
    return serveFile(req, res, resolve(ADMIN_DIR, 'index.html'), { admin: true, cache: 'no-store' })
  }
  if (pathname === '/admin/admin.css' || pathname === '/admin/admin.js') {
    return serveFile(req, res, resolve(ADMIN_DIR, pathname.slice('/admin/'.length)), {
      admin: true, cache: 'no-cache',
    })
  }
  return false
}

async function serveStatic(req, res, pathname, root) {
  if (!root || !existsSync(root)) {
    if (pathname === '/') {
      text(res, 200,
        '结构化学教学智能体 · 统计服务已启动\n\n'
        + '后台看板： /admin\n'
        + '若要让本进程同时托管前端，请设置 ANALYTICS_STATIC_DIR（例如 apps/web/dist）。\n')
      return true
    }
    return false
  }
  const target = safeStaticPath(root, pathname)
  if (!target) { text(res, 403, 'Forbidden'); return true }
  const isHtml = pathname === '/' || pathname.endsWith('/') || pathname.endsWith('.html')
  const candidates = isHtml ? [resolve(target, 'index.html'), target] : [target]
  for (const file of candidates) {
    const cache = pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : (isHtml ? 'no-store' : 'no-cache')
    if (await serveFile(req, res, file, { cache })) return true
  }
  // hash 路由不需要 history fallback；只有真正的页面导航才回 index.html。
  if (!extname(pathname)) {
    return serveFile(req, res, resolve(root, 'index.html'), { cache: 'no-store' })
  }
  return false
}

/**
 * @param {Object} cfg
 * @param {Object} cfg.store         createAnalyticsStore 的返回值
 * @param {string} cfg.adminPassword
 * @param {string} [cfg.adminUser='admin']
 * @param {string} [cfg.sessionSecret]
 * @param {string} [cfg.staticDir]
 * @param {number} [cfg.sessionTtlMs]
 */
export function createAnalyticsApp(cfg = {}) {
  const store = cfg.store
  if (!store) throw new Error('createAnalyticsApp 需要 store')
  const auth = createAdminAuth({
    username: cfg.adminUser || 'admin',
    password: cfg.adminPassword,
    secret: cfg.sessionSecret,
    ttlMs: cfg.sessionTtlMs,
  })
  const limiter = createRateLimiter()
  const staticDir = cfg.staticDir ? resolve(cfg.staticDir) : ''

  async function handler(req, res) {
    const url = new URL(req.url || '/', 'http://localhost')
    const pathname = url.pathname

    if (req.method === 'GET' && pathname === '/api/analytics/health') {
      return json(res, 200, {
        ok: true, service: 'chem-agent-analytics', version: 1, now: Date.now(),
      })
    }

    if (pathname === '/api/analytics/collect') {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' })
      if (!sameOrigin(req)) return json(res, 403, { ok: false, error: 'bad_origin' })
      const rl = limiter.hit('collect:' + clientKey(req), 240, 60 * 1000)
      if (!rl.ok) return json(res, 429, { ok: false, error: 'rate_limited' }, { 'Retry-After': '60' })
      if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) {
        return json(res, 415, { ok: false, error: 'json_required' })
      }
      let body
      try { body = await readJson(req) } catch (e) {
        return json(res, e.status || 400, { ok: false, error: e.message })
      }
      if (!body || !Array.isArray(body.events) || body.events.length === 0 || body.events.length > MAX_EVENTS) {
        return json(res, 400, { ok: false, error: 'bad_events' })
      }
      try {
        const r = store.ingestBatch(body.events, Date.now())
        return json(res, 202, { ok: true, accepted: r.accepted, rejected: r.rejected })
      } catch (e) {
        console.error('[analytics] ingest failed:', e)
        return json(res, 500, { ok: false, error: 'ingest_failed' })
      }
    }

    if (pathname === '/api/admin/login') {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' })
      if (!sameOrigin(req)) return json(res, 403, { ok: false, error: 'bad_origin' })
      const key = 'login:' + clientKey(req)
      const rl = limiter.hit(key, 8, 10 * 60 * 1000)
      if (!rl.ok) {
        return json(res, 429, { ok: false, error: 'too_many_attempts' }, { 'Retry-After': '600' })
      }
      let body
      try { body = await readJson(req) } catch (e) {
        return json(res, e.status || 400, { ok: false, error: e.message })
      }
      const user = String((body && body.username) || '')
      const pass = String((body && body.password) || '')
      if (!auth.checkLogin(user, pass)) {
        // 故意不区分「用户名错」与「口令错」。
        return json(res, 401, { ok: false, error: 'invalid_credentials' })
      }
      limiter.reset(key)
      const token = auth.issue()
      return json(res, 200, { ok: true, user: auth.username }, {
        'Set-Cookie': auth.cookie(token, { secure: isSecure(req) }),
      })
    }

    if (pathname === '/api/admin/logout') {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' })
      return json(res, 200, { ok: true }, {
        'Set-Cookie': auth.clearCookie({ secure: isSecure(req) }),
      })
    }

    if (pathname === '/api/admin/me') {
      if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' })
      const user = auth.userFromRequest(req)
      // 未登录不是错误：返回 200 + authenticated:false，后台页面据此显示登录框。
      // 若这里回 401，浏览器控制台每次打开登录页都会留一条红色的资源错误。
      if (!user) return json(res, 200, { ok: true, authenticated: false, user: null })
      return json(res, 200, { ok: true, authenticated: true, user })
    }

    if (pathname === '/api/admin/stats') {
      if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' })
      const user = auth.userFromRequest(req)
      if (!user) return json(res, 401, { ok: false, error: 'unauthorized' })
      const days = Number(url.searchParams.get('days') || 30)
      try {
        return json(res, 200, { ok: true, stats: store.stats(days, Date.now()) })
      } catch (e) {
        console.error('[analytics] stats failed:', e)
        return json(res, 500, { ok: false, error: 'stats_failed' })
      }
    }

    if (pathname === '/api/admin/export.csv') {
      if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' })
      const user = auth.userFromRequest(req)
      if (!user) return json(res, 401, { ok: false, error: 'unauthorized' })
      const days = Number(url.searchParams.get('days') || 30)
      const csv = store.exportCsv(days, Date.now())
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Length': Buffer.byteLength(csv),
        'Content-Disposition': 'attachment; filename="chem-agent-stats.csv"',
        'Cache-Control': 'no-store',
      })
      return res.end(csv)
    }

    if (pathname.startsWith('/api/')) return json(res, 404, { ok: false, error: 'not_found' })

    if (await serveAdmin(req, res, pathname)) return
    if (staticDir && await serveStatic(req, res, pathname, staticDir)) return

    text(res, 404, 'Not Found')
  }

  const server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((e) => {
      console.error('[analytics] request failed:', e)
      if (!res.headersSent) json(res, 500, { ok: false, error: 'internal_error' })
      else res.end()
    })
  })

  return { server, handler, auth, staticDir }
}
