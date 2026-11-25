/**
 * test-analytics-client.mjs — 前端埋点的无浏览器单测
 *
 * 用假 window/document/storage/fetch 验证：
 *   · 没有统计服务时健康检查失败 → 静默关闭；
 *   · 会话/访客 ID 与路由去查询串；
 *   · 上报体里**不含**提问、API Key 等字段；
 *   · 隐私开关与 DNT 生效；
 *   · 练习起止、智能体轮次的事件形状正确。
 */

import assert from 'node:assert/strict'
import { createAnalytics, pageModule, cleanPage, detectDevice } from '../src/shell/analytics.js'

let passed = 0
function ok(cond, label) {
  assert.ok(cond, label)
  passed += 1
}
function eq(a, b, label) {
  assert.deepEqual(a, b, label)
  passed += 1
}

function memoryStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
    _map: m,
  }
}

function fakeWin({ width = 1280, touch = 0, dnt = false } = {}) {
  const listeners = {}
  return {
    innerWidth: width,
    doNotTrack: dnt ? '1' : null,
    navigator: {
      maxTouchPoints: touch,
      doNotTrack: dnt ? '1' : null,
      globalPrivacyControl: false,
      sendBeacon: null,
    },
    crypto: globalThis.crypto,
    addEventListener: (name, fn) => { (listeners[name] || (listeners[name] = [])).push(fn) },
    _listeners: listeners,
  }
}

function fakeDoc() {
  return {
    visibilityState: 'visible',
    documentElement: { getAttribute: () => 'zh' },
    addEventListener: () => {},
  }
}

function fakeFetch({ healthOk = true, collectStatus = 202 } = {}) {
  const calls = []
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, opts })
    if (String(url).endsWith('/health')) {
      return {
        ok: healthOk,
        status: healthOk ? 200 : 404,
        json: async () => (healthOk ? { ok: true } : { ok: false }),
      }
    }
    return { ok: true, status: collectStatus, json: async () => ({ ok: true }) }
  }
  fetchFn.calls = calls
  return fetchFn
}

function payloads(fetchFn) {
  return fetchFn.calls
    .filter((c) => c.opts && c.opts.method === 'POST')
    .map((c) => JSON.parse(c.opts.body))
}

async function testHelpers() {
  eq(pageModule('/orbit'), 'orbit', '轨道路由 → orbit')
  eq(pageModule('/symmetry'), 'symmetry', '点群路由 → symmetry')
  eq(pageModule('/viewer/naCl'), 'crystal', '查看页 → crystal')
  eq(pageModule('/compare/naCl?b=fcc'), 'crystal', '对比页 → crystal')
  eq(pageModule('/'), null, '首页不属于模块')
  eq(cleanPage('/viewer/naCl?x=1#frag'), '/viewer/naCl', '路由去查询串与 hash')
  eq(cleanPage('https://evil.test/x'), '/', '外链路径被拒绝')
  eq(detectDevice(fakeWin({ width: 390, touch: 5 })), 'mobile', '窄屏 → mobile')
  eq(detectDevice(fakeWin({ width: 900, touch: 5 })), 'tablet', '中屏触屏 → tablet')
  eq(detectDevice(fakeWin({ width: 1280, touch: 0 })), 'desktop', '宽屏 → desktop')
}

async function testDisabledWithoutServer() {
  const win = fakeWin()
  const fetchFn = fakeFetch({ healthOk: false })
  const a = createAnalytics({
    win, doc: fakeDoc(), localStorage: memoryStorage(), sessionStorage: memoryStorage(), fetch: fetchFn,
  })
  eq(await a.init(), false, '健康检查失败时保持关闭')
  a.pageView('/orbit')
  await a.flush()
  eq(a._debug().queued, 0, '关闭状态不积压事件')
  eq(payloads(fetchFn).length, 0, '关闭状态不发 POST')
  a.setEnabled(false)
}

async function testDnt() {
  const win = fakeWin({ dnt: true })
  const fetchFn = fakeFetch()
  const a = createAnalytics({
    win, doc: fakeDoc(), localStorage: memoryStorage(), sessionStorage: memoryStorage(), fetch: fetchFn,
  })
  eq(await a.init(), false, 'DNT 时禁用')
  eq(fetchFn.calls.length, 0, 'DNT 时连健康检查都不发')
}

async function testFlow() {
  const win = fakeWin()
  const fetchFn = fakeFetch()
  const local = memoryStorage()
  const session = memoryStorage()
  const a = createAnalytics({
    win, doc: fakeDoc(), localStorage: local, sessionStorage: session, fetch: fetchFn,
    endpoint: '/api/analytics/collect',
  })
  a.pageView('/orbit?from=home')   // init 前先记下当前页
  eq(await a.init(), true, '有服务时启用')

  a.pageView('/orbit')             // 与 init 补发的初始页相同 → 去重
  a.agentTurn({
    module: 'orbit', ok: true, durationMs: 1234, toolCalls: 2,
    tools: ['queryOrbital', 'applySceneActions'], finishReason: 'stop',
    question: '这句话不能上报', apiKey: 'sk-不能上报',
  })
  a.quizStart('orbit', 'practice')
  a.quizStart('orbit', 'practice')  // 60s 内节流
  a.quizSubmit({ module: 'orbit', kind: 'choice', graded: true, correct: false })
  a.quizSubmit({ module: 'orbit', kind: 'short', graded: false, correct: true })

  await a.flush()
  const batches = payloads(fetchFn)
  ok(batches.length >= 1, '至少发出一个批次')
  const all = batches.flatMap((b) => b.events)
  const names = all.map((e) => e.name)
  ok(names.includes('session_start'), '包含 session_start')
  eq(names.filter((n) => n === 'page_view').length, 1, '初始页只记一次')
  ok(names.includes('agent_turn'), '包含 agent_turn')
  eq(names.filter((n) => n === 'quiz_start').length, 1, 'quiz_start 被节流')
  eq(names.filter((n) => n === 'quiz_submit').length, 2, '两种作答都上报')

  const agent = all.find((e) => e.name === 'agent_turn')
  eq(agent.props.toolCalls, 2, '工具调用数保留')
  eq(agent.props.tools, ['queryOrbital', 'applySceneActions'], '工具名保留')
  eq(agent.props.durationMs, 1234, '耗时保留')
  ok(!JSON.stringify(agent).includes('这句话不能上报'), '提问正文没有上报')
  ok(!JSON.stringify(agent).includes('sk-不能上报'), 'API Key 没有上报')

  const short = all.filter((e) => e.name === 'quiz_submit').find((e) => e.props.kind === 'short')
  eq(short.props.correct, null, '不判分的短答 correct=null')
  eq(short.props.graded, false, '不判分的短答 graded=false')

  const visitorId = local.getItem('chem-agent.analytics.id')
  ok(visitorId && visitorId.length >= 16, '访客 ID 已落本地')
  const sessionRaw = session.getItem('chem-agent.analytics.session')
  ok(sessionRaw && JSON.parse(sessionRaw).id, '会话 ID 已落 sessionStorage')

  a.resetIdentity()
  eq(local.getItem('chem-agent.analytics.id'), null, 'resetIdentity 清访客 ID')
  eq(session.getItem('chem-agent.analytics.session'), null, 'resetIdentity 清会话 ID')
  a.setEnabled(false)
}

async function testSettingOff() {
  let enabled = true
  const fetchFn = fakeFetch()
  const a = createAnalytics({
    win: fakeWin(), doc: fakeDoc(), localStorage: memoryStorage(), sessionStorage: memoryStorage(),
    fetch: fetchFn, isEnabled: () => enabled,
  })
  enabled = false
  eq(await a.init(), false, '隐私开关关闭时不探测服务')
  eq(fetchFn.calls.length, 0, '隐私开关关闭时零请求')
}

console.log('\n【前端埋点 · 纯函数】')
await testHelpers()
console.log('【前端埋点 · 无服务 / DNT / 隐私开关】')
await testDisabledWithoutServer()
await testDnt()
await testSettingOff()
console.log('【前端埋点 · 事件形状与去重】')
await testFlow()

console.log(`\n结果：通过 ${passed} 项，失败 0 项\n`)
