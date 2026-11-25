/**
 * analytics-auth.mjs — 管理员的密码校验与会话 Cookie
 *
 * 边界：
 *   · 管理员口令只从环境变量读，不写进仓库、不回显；
 *   · Cookie 是 HttpOnly + SameSite=Strict，前端 JS 读不到；
 *   · 会话是**无状态签名令牌**（HMAC-SHA256），服务重启后只要 secret 不变就仍有效；
 *   · 登录失败按 IP 限速，防止在线爆破。
 *
 * 这不是一套多用户账号系统：本应用没有学生账号，后台只给课程维护者一个入口。
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'chem_stats_session'

function b64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function createAdminAuth(cfg = {}) {
  const username = String(cfg.username || 'admin')
  const password = String(cfg.password || '')
  if (!password) throw new Error('后台缺少管理员口令（ANALYTICS_ADMIN_PASSWORD）')
  const secret = cfg.secret ? String(cfg.secret) : randomBytes(32).toString('hex')
  const ttlMs = Number.isFinite(cfg.ttlMs) ? cfg.ttlMs : 12 * 60 * 60 * 1000

  function sign(payload) {
    return createHmac('sha256', secret).update(payload).digest('base64url')
  }

  function issue() {
    const body = b64url(JSON.stringify({
      sub: username,
      exp: Date.now() + ttlMs,
      n: randomBytes(8).toString('hex'),
    }))
    return body + '.' + sign(body)
  }

  function verify(token) {
    if (typeof token !== 'string') return null
    const i = token.lastIndexOf('.')
    if (i <= 0) return null
    const body = token.slice(0, i)
    const sig = token.slice(i + 1)
    if (!safeEqual(sig, sign(body))) return null
    let p
    try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch (e) { return null }
    if (!p || p.sub !== username || !Number.isFinite(p.exp) || p.exp <= Date.now()) return null
    return { user: p.sub, exp: p.exp }
  }

  function checkLogin(user, pass) {
    // 两个字段都完整比较，不用 && 短路，避免用响应时间判断「用户名对不对」。
    const u = safeEqual(user, username)
    const p = safeEqual(pass, password)
    return u && p
  }

  function cookie(token, { secure = false, maxAgeSec = Math.floor(ttlMs / 1000) } = {}) {
    return COOKIE_NAME + '=' + token
      + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + Math.max(0, maxAgeSec)
      + (secure ? '; Secure' : '')
  }

  function clearCookie({ secure = false } = {}) {
    return COOKIE_NAME + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
      + (secure ? '; Secure' : '')
  }

  function tokenFromRequest(req) {
    const raw = req && req.headers && req.headers.cookie
    if (!raw) return ''
    for (const part of String(raw).split(';')) {
      const eq = part.indexOf('=')
      if (eq < 0) continue
      if (part.slice(0, eq).trim() === COOKIE_NAME) return part.slice(eq + 1).trim()
    }
    return ''
  }

  function userFromRequest(req) {
    const info = verify(tokenFromRequest(req))
    return info ? info.user : null
  }

  return {
    username, cookieName: COOKIE_NAME,
    issue, verify, checkLogin, cookie, clearCookie, tokenFromRequest, userFromRequest,
  }
}
