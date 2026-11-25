/**
 * test-analytics.mjs — 统计服务回归测试
 *
 * 覆盖四层：
 *   ① 事件白名单（任意 props 不进库、路径去查询串）
 *   ② SQLite 计数（会话时长、练习正确率、幂等）
 *   ③ HTTP 边界（同源、登录、Cookie、限流入口、未授权）
 *   ④ CSV / 看板页面（不泄漏访客 ID、CSP 存在）
 *
 * 不启动外部服务、不依赖网络。运行：node server/tools/test-analytics.mjs
 */

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAnalyticsStore } from '../analytics-store.mjs'
import { createAnalyticsApp } from '../analytics-server.mjs'
import { normalizeEvent, normalizeBatch, cleanPath, moduleFromPath } from '../analytics-events.mjs'

let passed = 0
function ok(cond, label) {
  assert.ok(cond, label)
  passed += 1
}
function eq(a, b, label) {
  assert.deepEqual(a, b, label)
  passed += 1
}

const VISITOR = 'visitor-aaaaaaaa'
const SESSION = 'session-aaaaaaaa'
let seq = 0
function ev(name, props = {}, opts = {}) {
  seq += 1
  return {
    eventId: opts.eventId || 'event-' + String(seq).padStart(12, '0'),
    visitorId: opts.visitorId || VISITOR,
    sessionId: opts.sessionId || SESSION,
    name,
    props,
    // 故意夹带敏感字段：服务端必须忽略
    question: '学生提问正文不应入库',
    apiKey: 'sk-test-not-a-real-key',
  }
}
const at = (iso) => new Date(iso).getTime()

function testEvents() {
  const r = normalizeEvent({
    eventId: 'event-aaaaaaaaaaaa', visitorId: VISITOR, sessionId: SESSION,
    name: 'page_view', props: { path: '/viewer/naCl?secret=1#x', module: 'symmetry' },
  })
  ok(r.ok, '合法的 page_view 被接受')
  eq(r.event.page, '/viewer/naCl', '路径去掉查询串与 hash')
  eq(r.event.module, 'crystal', '模块以路径为准（不让客户端伪造）')
  eq(cleanPath('https://evil.test/x'), '/', '外链路径被拒绝')
  eq(moduleFromPath('/compare/naCl?b=fcc'), 'crystal', '对比页归晶体模块')
  eq(moduleFromPath('/orbit'), 'orbit', '轨道页归轨道模块')

  ok(!normalizeEvent({ name: 'evil_event' }).ok, '未知事件名被拒绝')
  ok(!normalizeEvent({
    eventId: 'x', visitorId: VISITOR, sessionId: SESSION, name: 'page_view',
  }).ok, '过短的 eventId 被拒绝')
  const badProps = normalizeEvent(ev('agent_turn', {
    ok: true, toolCalls: 9999, tools: ['queryOrbital', '<script>', 'a', 'b', 'c'],
    question: '不应保存', apiKey: 'sk-x',
  }))
  ok(badProps.ok, 'agent_turn 被接受')
  ok(badProps.event.props.toolCalls === 100, 'toolCalls 被夹到上限')
  eq(badProps.event.props.tools, ['queryOrbital'], '非法工具名被过滤')
  ok(!('question' in badProps.event.props), '任意敏感字段不进 props')
  ok(!('apiKey' in badProps.event.props), 'API Key 不进 props')

  const batch = normalizeBatch([
    ev('page_view', { path: '/orbit', module: 'orbit' }),
    { name: 'evil_event' },
  ])
  eq(batch.events.length, 1, '批内坏事件被剔除，好的保留')
  eq(batch.rejected, ['unknown_event'], '坏事件给出原因')
}

function testStore() {
  const store = createAnalyticsStore({ file: ':memory:' })
  const t0 = at('2026-11-23T10:00:00+08:00')
  store.ingestBatch([
    ev('session_start', { path: '/orbit', lang: 'zh', device: 'desktop' }),
    ev('page_view', { path: '/orbit', module: 'orbit' }),
    ev('agent_turn', { module: 'orbit', ok: true, toolCalls: 2, tools: ['queryOrbital', 'applySceneActions'] }),
    ev('quiz_start', { module: 'orbit', source: 'practice' }),
    ev('quiz_submit', { module: 'orbit', kind: 'choice', graded: true, correct: true }),
  ], t0)

  // 10 分钟后同一会话：一次作答错误、一次短答（不判分）
  const t1 = t0 + 10 * 60 * 1000
  store.ingestBatch([
    ev('page_view', { path: '/orbit', module: 'orbit' }),
    ev('quiz_submit', { module: 'orbit', kind: 'choice', graded: true, correct: false }),
    ev('quiz_submit', { module: 'orbit', kind: 'short', graded: false, correct: null }),
  ], t1)

  const s = store.stats(30, t1 + 1000)
  eq(s.overview.usersTotal, 1, '累计用户 1')
  eq(s.overview.activeUsers, 1, '区间活跃用户 1')
  eq(s.overview.pageViews, 2, '页面浏览 2')
  eq(s.overview.agentTurns, 1, '智能体轮次 1')
  eq(s.overview.toolCalls, 2, '工具调用 2')
  eq(s.overview.quizSubmits, 3, '练习提交 3（含不判分的短答）')
  eq(s.overview.quizGraded, 2, '已判分 2')
  eq(s.overview.quizCorrectRate, 50, '正确率 50%')
  eq(s.overview.avgSessionMs, 10 * 60 * 1000, '平均会话时长 10 分钟')
  eq(s.modules.length, 1, '模块聚合只有 1 个模块')
  eq(s.modules[0].id, 'orbit', '模块 id 正确')
  eq(s.modules[0].quizSubmits, 3, '模块练习提交数正确')

  // 同一 eventId 重放：不重复计数
  const dup = ev('quiz_submit', { module: 'orbit', kind: 'choice', graded: true, correct: true },
    { eventId: 'event-fixed-duplicate' })
  store.ingestBatch([dup], t1 + 1000)
  store.ingestBatch([dup], t1 + 2000)
  eq(store.stats(30, t1 + 3000).overview.quizSubmits, 4, '重复 eventId 只算一次')

  // 次日回访 → D1 留存；用同一 visitor 新会话
  const t2 = at('2026-11-24T09:00:00+08:00')
  store.ingestBatch([
    ev('session_start', { path: '/symmetry', lang: 'en', device: 'mobile' },
      { eventId: 'event-day2-start', sessionId: 'session-bbbbbbbb' }),
    ev('page_view', { path: '/symmetry', module: 'symmetry' },
      { eventId: 'event-day2-page', sessionId: 'session-bbbbbbbb' }),
  ], t2)
  const s2 = store.stats(30, at('2026-11-25T12:00:00+08:00'))
  eq(s2.overview.usersTotal, 1, '同一访客回访不增加累计用户')
  eq(s2.overview.sessions, 2, '两次会话')
  eq(s2.retention.d1.eligible, 1, 'D1 有一个已过观察窗口的 cohort')
  eq(s2.retention.d1.rate, 100, '次日留存 100%')
  eq(s2.devices.find((d) => d.key === 'desktop').sessions, 1, '设备聚合：桌面 1 次')
  eq(s2.languages.find((d) => d.key === 'en').sessions, 1, '语言聚合：英文 1 次')

  const csv = store.exportCsv(30, at('2026-11-25T12:00:00+08:00'))
  ok(csv.includes('date,active_users'), 'CSV 有表头')
  ok(csv.includes('orbit'), 'CSV 有模块行')
  ok(!csv.includes(VISITOR) && !csv.includes(SESSION), 'CSV 不含访客/会话 ID')

  // 清理：只保留最近 30 天
  const pruned = store.prune(30, at('2026-11-25T12:00:00+08:00'))
  ok(pruned.cutoff > 0, ' prune 返回 cutoff')
  store.close()
}

async function testHttp() {
  const dir = mkdtempSync(join(tmpdir(), 'chem-analytics-test-'))
  const staticDir = join(dir, 'dist')
  mkdirSync(staticDir)
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>site</title>')
  const store = createAnalyticsStore({ file: join(dir, 'stats.sqlite') })
  const app = createAnalyticsApp({
    store, adminUser: 'admin', adminPassword: 'test-password-123',
    sessionSecret: 'test-secret', staticDir,
  })
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const port = app.server.address().port
  const base = 'http://127.0.0.1:' + port

  try {
    let res = await fetch(base + '/api/analytics/health')
    eq(res.status, 200, '健康检查 200')
    const health = await res.json()
    eq(health.ok, true, '健康检查 ok')

    // 跨源收集被拒绝
    res = await fetch(base + '/api/analytics/collect', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.test' },
      body: JSON.stringify({ events: [ev('page_view', { path: '/orbit' })] }),
    })
    eq(res.status, 403, '跨源收集被拒绝')

    // 正常收集
    const now = Date.now()
    res = await fetch(base + '/api/analytics/collect', {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}',
    })
    eq(res.status, 415, '非 JSON 收集请求 415')

    res = await fetch(base + '/api/analytics/collect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    })
    eq(res.status, 400, '坏 JSON 400')

    res = await fetch(base + '/api/analytics/collect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [], pad: 'x'.repeat(130 * 1024) }),
    })
    eq(res.status, 413, '超大请求体 413')

    res = await fetch(base + '/api/analytics/collect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          ev('session_start', { path: '/orbit', lang: 'zh', device: 'desktop' }),
          ev('page_view', { path: '/orbit', module: 'orbit' }),
          ev('agent_turn', { module: 'orbit', ok: true, toolCalls: 1, tools: ['queryOrbital'] }),
        ],
      }),
    })
    eq(res.status, 202, '收集接口 202')
    const collected = await res.json()
    eq(collected.accepted, 3, '收集 3 条')

    res = await fetch(base + '/api/admin/me')
    eq(res.status, 200, '未登录的 me 不报 401（避免登录页刷控制台错误）')
    eq((await res.json()).authenticated, false, '未登录的 me 明确返回 authenticated:false')

    res = await fetch(base + '/api/admin/stats?days=30')
    eq(res.status, 401, '未登录读统计 401')

    res = await fetch(base + '/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    })
    eq(res.status, 401, '错误口令 401')

    res = await fetch(base + '/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'test-password-123' }),
    })
    eq(res.status, 200, '正确口令 200')
    const setCookie = res.headers.get('set-cookie') || ''
    ok(/HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie), '会话 Cookie 带 HttpOnly/SameSite')
    const cookie = setCookie.split(';')[0]

    res = await fetch(base + '/api/admin/me', { headers: { Cookie: cookie } })
    eq(res.status, 200, '带 Cookie 的 me 200')

    res = await fetch(base + '/api/admin/stats?days=30', { headers: { Cookie: cookie } })
    eq(res.status, 200, '带 Cookie 读统计 200')
    const statsBody = await res.json()
    eq(statsBody.stats.overview.pageViews, 1, '后台读到页面浏览 1')
    ok(!JSON.stringify(statsBody).includes(VISITOR), '统计响应不含访客 ID')

    res = await fetch(base + '/api/admin/export.csv?days=30', { headers: { Cookie: cookie } })
    eq(res.status, 200, 'CSV 导出 200')
    const csv = await res.text()
    ok(!csv.includes(VISITOR), 'CSV 不含访客 ID')

    // 登录爆破限速：同一 IP 十分钟内第 9 次失败应 429。
    let lastStatus = 0
    for (let i = 0; i < 9; i++) {
      res = await fetch(base + '/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong-' + i }),
      })
      lastStatus = res.status
    }
    eq(lastStatus, 429, '连续失败触发登录限速 429')

    res = await fetch(base + '/admin')
    eq(res.status, 200, '后台页面 200')
    const html = await res.text()
    ok(html.includes('用户数据统计'), '后台页面标题存在')
    ok(/default-src 'self'/.test(res.headers.get('content-security-policy') || ''), '后台带 CSP')

    res = await fetch(base + '/api/admin/collect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    eq(res.status, 404, '未知 API 404')

    res = await fetch(base + '/api/admin/logout', { method: 'POST', headers: { Cookie: cookie } })
    eq(res.status, 200, '退出 200')
    ok(/Max-Age=0/.test(res.headers.get('set-cookie') || ''), '退出清 Cookie')

    res = await fetch(base + '/')
    eq(res.status, 200, '静态首页 200')
    ok((await res.text()).includes('site'), '静态首页内容正确')
  } finally {
    await new Promise((resolve) => app.server.close(resolve))
    store.close()
    try { rmSync(dir, { recursive: true, force: true }) } catch (e) { /* ignore */ }
  }
}

console.log('\n【统计服务 · 事件白名单】')
testEvents()
console.log('【统计服务 · SQLite 聚合】')
testStore()
console.log('【统计服务 · HTTP 边界】')
await testHttp()
console.log(`\n结果：通过 ${passed} 项，失败 0 项\n`)
