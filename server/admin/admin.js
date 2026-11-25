/**
 * admin.js — 统计看板的前端逻辑
 *
 * 无构建步骤、无第三方图表库：后端给一份聚合 JSON，这里画 SVG。
 * 这样统计服务可以单独拷到服务器上运行，不依赖 apps/web 的 Vite 构建。
 */

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel))

const MODULE_META = {
  crystal: { name: '晶典在线', color: '#56b6ff' },
  orbit: { name: '轨道视界', color: '#ff8e7a' },
  symmetry: { name: '点群观鉴', color: '#b597ff' },
}

const DEVICE_LABEL = { desktop: '桌面', tablet: '平板', mobile: '手机' }
const LANG_LABEL = { zh: '中文', en: 'English' }

const METRICS = {
  activeUsers: { label: '活跃用户', color: '#56b6ff' },
  pageViews: { label: '页面浏览', color: '#78e0c8' },
  agentTurns: { label: '智能体轮次', color: '#ffc46b' },
  quizSubmits: { label: '练习提交', color: '#b597ff' },
  newUsers: { label: '新增用户', color: '#ff8e7a' },
}

const state = {
  days: 30,
  metric: 'activeUsers',
  stats: null,
  loadSeq: 0,
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString('zh-CN')
}

function fmtDuration(ms) {
  const sec = Math.max(0, Math.round(Number(ms || 0) / 1000))
  if (sec < 60) return sec + ' 秒'
  const min = Math.floor(sec / 60)
  const rest = sec % 60
  if (min < 60) return min + ' 分 ' + rest + ' 秒'
  return Math.floor(min / 60) + ' 小时 ' + (min % 60) + ' 分'
}

function fmtPct(n) {
  return (Math.round(Number(n || 0) * 10) / 10).toLocaleString('zh-CN') + '%'
}

function deltaText(cur, prev) {
  const c = Number(cur) || 0
  const p = Number(prev) || 0
  if (p === 0) return c > 0 ? '较上期为新增' : '与上期持平'
  const pct = Math.round(((c - p) / p) * 1000) / 10
  if (pct === 0) return '与上期持平'
  return '较上期 ' + (pct > 0 ? '+' : '') + pct.toLocaleString('zh-CN') + '%'
}

function deltaClass(cur, prev) {
  const c = Number(cur) || 0
  const p = Number(prev) || 0
  if (p === 0) return c > 0 ? 'up' : ''
  return c > p ? 'up' : (c < p ? 'down' : '')
}

async function api(path, options = {}) {
  const res = await fetch(path, Object.assign({ credentials: 'same-origin' }, options))
  let body = null
  try { body = await res.json() } catch (e) { /* 非 JSON */ }
  if (!res.ok) {
    const err = new Error((body && body.error) || ('HTTP ' + res.status))
    err.status = res.status
    throw err
  }
  return body
}

function setError(message) {
  const el = $('#globalError')
  if (!message) { el.hidden = true; el.textContent = ''; return }
  el.hidden = false
  el.textContent = message
}

function showLogin(message) {
  $('#dashboardView').hidden = true
  $('#loginView').hidden = false
  $('#loginError').textContent = message || ''
  const pass = $('#loginPassword')
  if (pass) pass.value = ''
  setTimeout(() => { try { $('#loginUser').focus() } catch (e) { /* ignore */ } }, 50)
}

function showDashboard() {
  $('#loginView').hidden = true
  $('#dashboardView').hidden = false
}

// ---------------------------------------------------------------------------
// 登录 / 会话
// ---------------------------------------------------------------------------
async function boot() {
  try {
    const body = await api('/api/admin/me')
    if (!body || !body.authenticated) { showLogin(''); return }
    showDashboard()
    loadStats()
  } catch (e) {
    showLogin('无法连接统计服务：' + e.message)
  }
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault()
  const btn = $('#loginBtn')
  const err = $('#loginError')
  err.textContent = ''
  const username = $('#loginUser').value.trim()
  const password = $('#loginPassword').value
  if (!username || !password) { err.textContent = '请输入账号与口令。'; return }
  btn.disabled = true
  try {
    await api('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    $('#loginPassword').value = ''
    showDashboard()
    loadStats()
  } catch (e) {
    err.textContent = e.status === 429
      ? '尝试次数过多，请十分钟后再试。'
      : (e.status === 401 ? '账号或口令不正确。' : '登录失败：' + e.message)
  } finally {
    btn.disabled = false
  }
})

$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST' }) } catch (e) { /* ignore */ }
  state.stats = null
  showLogin('')
})

// ---------------------------------------------------------------------------
// 数据加载
// ---------------------------------------------------------------------------
async function loadStats() {
  const seq = ++state.loadSeq
  const btn = $('#refreshBtn')
  btn.disabled = true
  $('#updatedAt').textContent = '正在更新…'
  setError('')
  try {
    const body = await api('/api/admin/stats?days=' + state.days)
    if (seq !== state.loadSeq) return
    if (!body || !body.stats) throw new Error('返回数据为空')
    state.stats = body.stats
    render(state.stats)
    const now = new Date()
    $('#updatedAt').textContent = '更新于 ' + now.toLocaleTimeString('zh-CN', { hour12: false })
  } catch (e) {
    if (seq !== state.loadSeq) return
    if (e.status === 401) { showLogin('登录已过期，请重新登录。'); return }
    setError('读取统计失败：' + e.message)
    $('#updatedAt').textContent = '更新失败'
  } finally {
    if (seq === state.loadSeq) btn.disabled = false
  }
}

function render(stats) {
  const o = stats.overview
  const prev = stats.previous
  const range = stats.range

  $('#rangeLabel').textContent = range.fromDay + ' — ' + range.toDay + ' · 按东八区自然日统计'
  $('#exportLink').href = '/api/admin/export.csv?days=' + state.days

  setKpi('usersTotal', fmtInt(o.usersTotal), '匿名访客 ID 去重', '')
  setKpi('activeUsers', fmtInt(o.activeUsers), deltaText(o.activeUsers, prev.activeUsers),
    deltaClass(o.activeUsers, prev.activeUsers))
  setKpi('newUsers', fmtInt(o.newUsers), deltaText(o.newUsers, prev.newUsers),
    deltaClass(o.newUsers, prev.newUsers))
  setKpi('sessions', fmtInt(o.sessions), deltaText(o.sessions, prev.sessions),
    deltaClass(o.sessions, prev.sessions))
  setKpi('pageViews', fmtInt(o.pageViews), deltaText(o.pageViews, prev.pageViews),
    deltaClass(o.pageViews, prev.pageViews))
  setKpi('agentTurns', fmtInt(o.agentTurns), deltaText(o.agentTurns, prev.agentTurns),
    deltaClass(o.agentTurns, prev.agentTurns))

  const avgEl = $('[data-kpi="avgSessionMs"] .kpi-value')
  avgEl.textContent = fmtDuration(o.avgSessionMs)
  $('[data-kpi="avgSessionMs"] .kpi-note').textContent =
    o.sessions ? '共 ' + fmtInt(o.sessions) + ' 次会话' : '暂无会话数据'

  const rateEl = $('[data-kpi="quizCorrectRate"] .kpi-value')
  rateEl.textContent = o.quizGraded ? fmtPct(o.quizCorrectRate) : '—'
  $('[data-kpi="quizCorrectRate"] .kpi-note').textContent =
    o.quizGraded ? '已判分 ' + fmtInt(o.quizGraded) + ' 次 · 答对 ' + fmtInt(o.quizCorrect) + ' 次'
      : '暂无已判分作答'

  renderChart()
  renderModules(stats.modules)
  renderRetention(stats.retention)
  renderFunnel(stats.funnel)
  renderPages(stats.pages)
  renderDistribution(stats.devices, stats.languages)
  renderTools(stats.tools)
}

function setKpi(key, value, note, cls) {
  const card = $('[data-kpi="' + key + '"]')
  if (!card) return
  $('.kpi-value', card).textContent = value
  const noteEl = $('.kpi-note', card)
  if (noteEl && note != null) {
    noteEl.textContent = note
    noteEl.className = 'kpi-note' + (cls ? ' ' + cls : '')
  }
}

// ---------------------------------------------------------------------------
// 趋势图（SVG，无第三方库）
// ---------------------------------------------------------------------------
function niceMax(value) {
  if (value <= 0) return 5
  const exp = Math.floor(Math.log10(value))
  const base = Math.pow(10, exp)
  const n = value / base
  const step = n <= 1 ? 1 : (n <= 2 ? 2 : (n <= 5 ? 5 : 10))
  return step * base
}

function renderChart() {
  const svg = $('#trendChart')
  const stats = state.stats
  if (!stats) return
  const trend = stats.trend || []
  const meta = METRICS[state.metric] || METRICS.activeUsers
  const values = trend.map((d) => Number(d[state.metric]) || 0)
  const total = values.reduce((a, b) => a + b, 0)
  const peak = values.length ? Math.max.apply(null, values) : 0
  $('#chartSummary').textContent = meta.label + ' · 峰值 ' + fmtInt(peak) + ' · 区间合计 ' + fmtInt(total)

  const W = 900
  const H = 300
  const L = 46
  const R = 18
  const T = 20
  const B = 38
  const iw = W - L - R
  const ih = H - T - B
  const max = niceMax(peak)
  const n = Math.max(1, values.length - 1)
  const x = (i) => L + (n === 0 ? iw / 2 : (i / n) * iw)
  const y = (v) => T + ih - (v / max) * ih

  let html = '<defs>'
    + '<linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0%" stop-color="' + meta.color + '" stop-opacity=".28"/>'
    + '<stop offset="100%" stop-color="' + meta.color + '" stop-opacity="0"/>'
    + '</linearGradient>'
    + '</defs>'

  for (let i = 0; i <= 4; i++) {
    const gy = T + (ih / 4) * i
    const val = Math.round(max - (max / 4) * i)
    html += '<line class="chart-grid-line" x1="' + L + '" y1="' + gy + '" x2="' + (W - R) + '" y2="' + gy + '"/>'
    html += '<text class="chart-axis-label" x="' + (L - 10) + '" y="' + (gy + 3.5) + '" text-anchor="end">'
      + escapeHtml(fmtInt(val)) + '</text>'
  }

  if (!trend.length || peak === 0) {
    html += '<text class="chart-zero" x="' + (L + iw / 2) + '" y="' + (T + ih / 2) + '" text-anchor="middle">'
      + '这段时间还没有数据</text>'
    svg.innerHTML = html
    return
  }

  const pts = values.map((v, i) => [x(i), y(v)])
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const area = line + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (T + ih)
    + ' L' + pts[0][0].toFixed(1) + ' ' + (T + ih) + ' Z'
  html += '<path class="chart-area" d="' + area + '"/>'
  html += '<path class="chart-line" d="' + line + '" style="stroke:' + meta.color + '"/>'

  const labelEvery = trend.length <= 8 ? 1 : Math.ceil(trend.length / 7)
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i]
    const d = trend[i]
    const title = d.date + ' · ' + meta.label + ' ' + fmtInt(values[i])
    if (i === pts.length - 1 || i % labelEvery === 0) {
      html += '<circle class="chart-point" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1)
        + '" r="3.2" style="stroke:' + meta.color + '"><title>' + escapeHtml(title) + '</title></circle>'
    } else {
      html += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1)
        + '" r="4" fill="transparent"><title>' + escapeHtml(title) + '</title></circle>'
    }
    if (i % labelEvery === 0 || i === pts.length - 1) {
      const label = trend.length > 14 ? d.date.slice(5) : d.date
      html += '<text class="chart-axis-label" x="' + px.toFixed(1) + '" y="' + (H - 12)
        + '" text-anchor="middle">' + escapeHtml(label) + '</text>'
    }
  }
  svg.innerHTML = html
}

// ---------------------------------------------------------------------------
// 各面板
// ---------------------------------------------------------------------------
function renderModules(rows) {
  const tbody = $('#moduleTable tbody')
  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">这段时间还没有模块使用数据</td></tr>'
    return
  }
  tbody.innerHTML = rows.map((r) => {
    const meta = MODULE_META[r.id] || { name: r.id, color: '#8aa0ba' }
    return '<tr>'
      + '<td><span class="module-name"><i class="module-dot" style="background:' + meta.color
      + ';color:' + meta.color + '"></i>' + escapeHtml(meta.name) + '</span></td>'
      + '<td>' + fmtInt(r.users) + '</td>'
      + '<td>' + fmtInt(r.pageViews) + '</td>'
      + '<td>' + fmtInt(r.agentTurns) + '</td>'
      + '<td>' + fmtInt(r.quizSubmits) + '</td>'
      + '</tr>'
  }).join('')
}

function renderRetention(ret) {
  if (!ret) return
  $('#retD1').textContent = ret.d1.eligible ? fmtPct(ret.d1.rate) : '—'
  $('#retD1Note').textContent = ret.d1.eligible
    ? ret.d1.users + ' / ' + ret.d1.eligible + ' 人在次日回访'
    : '观察窗口不足一天'
  $('#retD7').textContent = ret.d7.eligible ? fmtPct(ret.d7.rate) : '—'
  $('#retD7Note').textContent = ret.d7.eligible
    ? ret.d7.users + ' / ' + ret.d7.eligible + ' 人在第 7 日回访'
    : '观察窗口不足七天'
}

function renderFunnel(f) {
  const el = $('#funnel')
  if (!f) { el.innerHTML = ''; return }
  const total = Math.max(1, f.visitors)
  const rows = [
    ['浏览过页面', f.visitors],
    ['用过智能体', f.agentUsers],
    ['开始过练习', f.quizStartUsers],
    ['提交过作答', f.quizSubmitUsers],
  ]
  el.innerHTML = rows.map(([label, value]) => {
    const pct = Math.round((value / total) * 1000) / 10
    return '<div class="funnel-row">'
      + '<div class="funnel-top"><span>' + label + '</span><span><b>' + fmtInt(value) + '</b> · ' + fmtPct(pct) + '</span></div>'
      + '<div class="funnel-bar"><i style="width:' + Math.min(100, pct) + '%"></i></div>'
      + '</div>'
  }).join('')
}

function renderPages(rows) {
  const tbody = $('#pageTable tbody')
  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">暂无页面浏览数据</td></tr>'
    return
  }
  tbody.innerHTML = rows.map((r) => {
    const label = r.path === '/' ? '首页 /' : r.path
    return '<tr><td class="path-cell" title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</td>'
      + '<td>' + fmtInt(r.views) + '</td><td>' + fmtInt(r.users) + '</td></tr>'
  }).join('')
}

function renderBarList(el, rows, labels) {
  if (!rows || !rows.length) {
    el.innerHTML = '<p class="panel-sub">暂无数据</p>'
    return
  }
  const max = Math.max.apply(null, rows.map((r) => Number(r.sessions) || 0)) || 1
  el.innerHTML = rows.map((r) => {
    const pct = Math.round(((Number(r.sessions) || 0) / max) * 100)
    const label = (labels && labels[r.key]) || r.key
    return '<div class="bar-item">'
      + '<div class="bar-top"><span>' + escapeHtml(label) + '</span><b>' + fmtInt(r.sessions) + '</b></div>'
      + '<div class="bar-track"><i class="bar-fill" style="width:' + pct + '%"></i></div>'
      + '</div>'
  }).join('')
}

function renderDistribution(devices, languages) {
  renderBarList($('#deviceList'), devices, DEVICE_LABEL)
  renderBarList($('#langList'), languages, LANG_LABEL)
}

function renderTools(rows) {
  const el = $('#toolList')
  if (!rows || !rows.length) {
    el.innerHTML = '<p class="panel-sub">暂无工具调用数据</p>'
    return
  }
  el.innerHTML = rows.map((r) => '<span class="tool-chip"><code>' + escapeHtml(r.name)
    + '</code><b>' + fmtInt(r.calls) + '</b></span>').join('')
}

// ---------------------------------------------------------------------------
// 交互
// ---------------------------------------------------------------------------
$$('.range-tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const days = Number(btn.dataset.days) || 30
    if (days === state.days) return
    state.days = days
    $$('.range-tabs button').forEach((b) => {
      b.classList.toggle('active', b === btn)
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false')
    })
    loadStats()
  })
})

$$('#metricTabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const metric = btn.dataset.metric
    if (!METRICS[metric] || metric === state.metric) return
    state.metric = metric
    $$('#metricTabs button').forEach((b) => {
      b.classList.toggle('active', b === btn)
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false')
    })
    renderChart()
  })
})

$('#refreshBtn').addEventListener('click', () => loadStats())

// 后台只给维护者使用：离开页面时不需要保留任何前端缓存。
window.addEventListener('pageshow', (event) => {
  if (event.persisted) boot()
})

boot()
