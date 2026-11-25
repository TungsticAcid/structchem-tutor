/**
 * analytics-store.mjs — SQLite 事件库与聚合查询
 *
 * 为什么用 Node 内置的 `node:sqlite`：
 *   · 统计是**多用户、跨天**的聚合，JSONL + 每次全量扫描会随使用量线性变慢；
 *   · 不引入 better-sqlite3 这类原生扩展，部署端不需要编译工具链；
 *   · 单文件数据库便于备份/归档，适合学校一台小服务器。
 *
 * 运行要求：Node >= 22.13（`node:sqlite` 已可无需实验开关使用；本仓库在 Node 24 验证）。
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { normalizeBatch } from './analytics-events.mjs'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_SESSION_MS = 4 * 60 * 60 * 1000
const MAX_RANGE_DAYS = 365

function asPlain(row) {
  return row ? Object.assign({}, row) : null
}

function clampDays(days) {
  const n = Number(days)
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_RANGE_DAYS, Math.round(n))) : 30
}

/**
 * @param {Object} cfg
 * @param {string} cfg.file           SQLite 文件路径（测试可用 ':memory:'）
 * @param {number} [cfg.tzOffsetMinutes=480] 统计日界所用时区偏移（默认东八区）
 */
export function createAnalyticsStore(cfg = {}) {
  const file = cfg.file || ':memory:'
  const tzOffsetMs = (Number.isFinite(cfg.tzOffsetMinutes) ? cfg.tzOffsetMinutes : 480) * 60 * 1000
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true })

  const db = new DatabaseSync(file)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS visitors (
      id          TEXT PRIMARY KEY,
      first_seen  INTEGER NOT NULL,
      last_seen   INTEGER NOT NULL,
      sessions    INTEGER NOT NULL DEFAULT 0,
      lang        TEXT,
      device      TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      visitor_id  TEXT NOT NULL,
      started_at  INTEGER NOT NULL,
      last_seen   INTEGER NOT NULL,
      lang        TEXT,
      device      TEXT,
      module      TEXT,
      entry_path  TEXT,
      page_views  INTEGER NOT NULL DEFAULT 0,
      agent_turns INTEGER NOT NULL DEFAULT 0,
      quiz_starts INTEGER NOT NULL DEFAULT 0,
      quiz_submits INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id   TEXT NOT NULL UNIQUE,
      ts         INTEGER NOT NULL,
      day        TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      name       TEXT NOT NULL,
      module     TEXT,
      page       TEXT,
      props      TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
    CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);
    CREATE INDEX IF NOT EXISTS idx_events_name_ts ON events(name, ts);
    CREATE INDEX IF NOT EXISTS idx_events_visitor_ts ON events(visitor_id, ts);
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
  `)

  const q = {
    visitor: db.prepare('SELECT id, sessions FROM visitors WHERE id = ?'),
    insertVisitor: db.prepare(`
      INSERT INTO visitors (id, first_seen, last_seen, sessions, lang, device)
      VALUES (?, ?, ?, 1, ?, ?)
    `),
    touchVisitor: db.prepare(`
      UPDATE visitors
         SET last_seen = ?,
             sessions = sessions + ?,
             lang = COALESCE(lang, ?),
             device = COALESCE(device, ?)
       WHERE id = ?
    `),
    session: db.prepare('SELECT id, started_at, module FROM sessions WHERE id = ?'),
    insertSession: db.prepare(`
      INSERT INTO sessions (id, visitor_id, started_at, last_seen, lang, device, module, entry_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    touchSession: db.prepare(`
      UPDATE sessions
         SET last_seen = ?,
             lang = COALESCE(lang, ?),
             device = COALESCE(device, ?),
             module = COALESCE(module, ?)
       WHERE id = ?
    `),
    countSessionEvent: db.prepare(`
      UPDATE sessions
         SET page_views = page_views + ?,
             agent_turns = agent_turns + ?,
             quiz_starts = quiz_starts + ?,
             quiz_submits = quiz_submits + ?
       WHERE id = ?
    `),
    insertEvent: db.prepare(`
      INSERT OR IGNORE INTO events (event_id, ts, day, visitor_id, session_id, name, module, page, props)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
  }

  /** 本地统计日：用固定偏移换算，避免服务器系统时区影响。 */
  function dayKey(ts) {
    return new Date(ts + tzOffsetMs).toISOString().slice(0, 10)
  }

  function startOfDay(ts) {
    const shifted = ts + tzOffsetMs
    return Math.floor(shifted / DAY_MS) * DAY_MS - tzOffsetMs
  }

  /** 把一批**已归一化**的事件写入；返回真正新增的条数。 */
  function ingest(normalizedEvents, now = Date.now()) {
    const events = normalizedEvents || []
    if (!events.length) return { accepted: 0, sessions: 0 }

    let accepted = 0
    let newSessions = 0
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const e of events) {
        const ts = now
        const day = dayKey(ts)
        const props = e.props || {}
        const lang = props.lang || null
        const device = props.device || null

        let visitor = asPlain(q.visitor.get(e.visitorId))
        let isNewVisitor = false
        if (!visitor) {
          isNewVisitor = true
          q.insertVisitor.run(e.visitorId, ts, ts, lang, device)
          visitor = { id: e.visitorId, sessions: 1 }
        }

        let session = asPlain(q.session.get(e.sessionId))
        const isNewSession = !session
        if (!session) {
          newSessions += 1
          q.insertSession.run(
            e.sessionId, e.visitorId, ts, ts, lang, device,
            e.module || null, e.page || null,
          )
          session = { id: e.sessionId, started_at: ts, module: e.module || null }
        } else {
          q.touchSession.run(ts, lang, device, e.module || null, e.sessionId)
        }

        q.touchVisitor.run(ts, (isNewSession && !isNewVisitor) ? 1 : 0, lang, device, e.visitorId)

        const result = q.insertEvent.run(
          e.eventId, ts, day, e.visitorId, e.sessionId, e.name,
          e.module || null, e.page || null, JSON.stringify(props),
        )
        if (Number(result.changes) > 0) {
          accepted += 1
          if (e.name === 'page_view') {
            q.countSessionEvent.run(1, 0, 0, 0, e.sessionId)
          } else if (e.name === 'agent_turn') {
            q.countSessionEvent.run(0, 1, 0, 0, e.sessionId)
          } else if (e.name === 'quiz_start') {
            q.countSessionEvent.run(0, 0, 1, 0, e.sessionId)
          } else if (e.name === 'quiz_submit') {
            q.countSessionEvent.run(0, 0, 0, 1, e.sessionId)
          }
        }
      }
      db.exec('COMMIT')
    } catch (err) {
      try { db.exec('ROLLBACK') } catch (e) { /* ignore */ }
      throw err
    }
    return { accepted, sessions: newSessions }
  }

  /** 网络入口：先归一化，再写库。 */
  function ingestBatch(rawEvents, now = Date.now()) {
    const { events, rejected } = normalizeBatch(rawEvents, now)
    const r = ingest(events, now)
    return { accepted: r.accepted, rejected, sessions: r.sessions }
  }

  // -------------------------------------------------------------------------
  // 聚合
  // -------------------------------------------------------------------------
  function scalar(sql, params = []) {
    const row = asPlain(db.prepare(sql).get(...params))
    if (!row) return 0
    const v = row.v
    return v == null ? 0 : Number(v)
  }

  /** 一个时间段的 KPI。`from` 含、`to` 不含。 */
  function totals(from, to) {
    const activeUsers = scalar(
      'SELECT COUNT(DISTINCT visitor_id) AS v FROM events WHERE ts >= ? AND ts < ?', [from, to],
    )
    const newUsers = scalar(
      'SELECT COUNT(*) AS v FROM visitors WHERE first_seen >= ? AND first_seen < ?', [from, to],
    )
    const sessions = scalar(
      'SELECT COUNT(*) AS v FROM sessions WHERE started_at >= ? AND started_at < ?', [from, to],
    )
    const pageViews = scalar(
      "SELECT COUNT(*) AS v FROM events WHERE ts >= ? AND ts < ? AND name = 'page_view'", [from, to],
    )
    const agentTurns = scalar(
      "SELECT COUNT(*) AS v FROM events WHERE ts >= ? AND ts < ? AND name = 'agent_turn'", [from, to],
    )
    const agentErrors = scalar(
      "SELECT COUNT(*) AS v FROM events WHERE ts >= ? AND ts < ? AND name = 'agent_turn' "
      + "AND json_extract(props, '$.ok') = 0", [from, to],
    )
    const toolCalls = scalar(
      "SELECT COALESCE(SUM(COALESCE(json_extract(props, '$.toolCalls'), 0)), 0) AS v "
      + "FROM events WHERE ts >= ? AND ts < ? AND name = 'agent_turn'", [from, to],
    )
    const quizStarts = scalar(
      "SELECT COUNT(*) AS v FROM events WHERE ts >= ? AND ts < ? AND name = 'quiz_start'", [from, to],
    )
    const quizSubmits = scalar(
      "SELECT COUNT(*) AS v FROM events WHERE ts >= ? AND ts < ? AND name = 'quiz_submit'", [from, to],
    )
    const quizGraded = scalar(
      "SELECT COUNT(*) AS v FROM events WHERE ts >= ? AND ts < ? AND name = 'quiz_submit' "
      + "AND json_extract(props, '$.graded') = 1", [from, to],
    )
    const quizCorrect = scalar(
      "SELECT COUNT(*) AS v FROM events WHERE ts >= ? AND ts < ? AND name = 'quiz_submit' "
      + "AND json_extract(props, '$.graded') = 1 AND json_extract(props, '$.correct') = 1", [from, to],
    )
    const sessionRow = asPlain(db.prepare(`
      SELECT COUNT(*) AS n,
             COALESCE(AVG(CASE WHEN last_seen > started_at
                               THEN MIN(last_seen - started_at, ?) END), 0) AS avg_ms,
             COALESCE(SUM(CASE WHEN last_seen > started_at
                               THEN MIN(last_seen - started_at, ?) ELSE 0 END), 0) AS total_ms
        FROM sessions
       WHERE started_at >= ? AND started_at < ?
    `).get(MAX_SESSION_MS, MAX_SESSION_MS, from, to))

    return {
      activeUsers,
      newUsers,
      returningUsers: Math.max(0, activeUsers - newUsers),
      sessions,
      sessionSamples: Number(sessionRow && sessionRow.n) || 0,
      avgSessionMs: Math.round(Number(sessionRow && sessionRow.avg_ms) || 0),
      totalSessionMs: Math.round(Number(sessionRow && sessionRow.total_ms) || 0),
      pageViews,
      agentTurns,
      agentErrors,
      toolCalls,
      quizStarts,
      quizSubmits,
      quizGraded,
      quizCorrect,
      quizCorrectRate: quizGraded ? Math.round((quizCorrect / quizGraded) * 1000) / 10 : 0,
    }
  }

  function trend(from, to) {
    const rows = db.prepare(`
      SELECT day,
             COUNT(DISTINCT visitor_id) AS activeUsers,
             SUM(CASE WHEN name = 'page_view' THEN 1 ELSE 0 END) AS pageViews,
             SUM(CASE WHEN name = 'agent_turn' THEN 1 ELSE 0 END) AS agentTurns,
             SUM(CASE WHEN name = 'quiz_start' THEN 1 ELSE 0 END) AS quizStarts,
             SUM(CASE WHEN name = 'quiz_submit' THEN 1 ELSE 0 END) AS quizSubmits
        FROM events
       WHERE ts >= ? AND ts < ?
       GROUP BY day
       ORDER BY day
    `).all(from, to)
    const byDay = new Map(rows.map((r) => [r.day, asPlain(r)]))

    const newRows = db.prepare(`
      SELECT day, COUNT(*) AS newUsers FROM (
        SELECT CASE WHEN first_seen >= ? AND first_seen < ? THEN
          strftime('%Y-%m-%d', (first_seen + ?) / 1000.0, 'unixepoch')
        END AS day
        FROM visitors WHERE first_seen >= ? AND first_seen < ?
      ) WHERE day IS NOT NULL GROUP BY day
    `).all(from, to, tzOffsetMs, from, to)
    const newByDay = new Map(newRows.map((r) => [r.day, Number(r.newUsers) || 0]))

    const sessionRows = db.prepare(`
      SELECT day, COUNT(*) AS sessions FROM (
        SELECT strftime('%Y-%m-%d', (started_at + ?) / 1000.0, 'unixepoch') AS day
        FROM sessions WHERE started_at >= ? AND started_at < ?
      ) GROUP BY day
    `).all(tzOffsetMs, from, to)
    const sessionByDay = new Map(sessionRows.map((r) => [r.day, Number(r.sessions) || 0]))

    const out = []
    for (let ts = startOfDay(from); ts <= startOfDay(to - 1); ts += DAY_MS) {
      const day = dayKey(ts)
      const r = byDay.get(day) || {}
      out.push({
        date: day,
        activeUsers: Number(r.activeUsers) || 0,
        newUsers: newByDay.get(day) || 0,
        sessions: sessionByDay.get(day) || 0,
        pageViews: Number(r.pageViews) || 0,
        agentTurns: Number(r.agentTurns) || 0,
        quizStarts: Number(r.quizStarts) || 0,
        quizSubmits: Number(r.quizSubmits) || 0,
      })
    }
    return out
  }

  function modules(from, to) {
    const rows = db.prepare(`
      SELECT module,
             COUNT(DISTINCT visitor_id) AS users,
             COUNT(DISTINCT session_id) AS sessions,
             SUM(CASE WHEN name = 'page_view' THEN 1 ELSE 0 END) AS pageViews,
             SUM(CASE WHEN name = 'agent_turn' THEN 1 ELSE 0 END) AS agentTurns,
             SUM(CASE WHEN name = 'quiz_start' THEN 1 ELSE 0 END) AS quizStarts,
             SUM(CASE WHEN name = 'quiz_submit' THEN 1 ELSE 0 END) AS quizSubmits
        FROM events
       WHERE ts >= ? AND ts < ? AND module IS NOT NULL
       GROUP BY module
       ORDER BY users DESC, pageViews DESC
    `).all(from, to)
    return rows.map((r) => ({
      id: r.module,
      users: Number(r.users) || 0,
      sessions: Number(r.sessions) || 0,
      pageViews: Number(r.pageViews) || 0,
      agentTurns: Number(r.agentTurns) || 0,
      quizStarts: Number(r.quizStarts) || 0,
      quizSubmits: Number(r.quizSubmits) || 0,
    }))
  }

  function pages(from, to) {
    return db.prepare(`
      SELECT page,
             COUNT(*) AS views,
             COUNT(DISTINCT visitor_id) AS users
        FROM events
       WHERE ts >= ? AND ts < ? AND name = 'page_view' AND page IS NOT NULL
       GROUP BY page
       ORDER BY views DESC, page
       LIMIT 20
    `).all(from, to).map((r) => ({
      path: r.page, views: Number(r.views) || 0, users: Number(r.users) || 0,
    }))
  }

  function groupedSessions(column, from, to) {
    return db.prepare(`
      SELECT ${column} AS key,
             COUNT(*) AS sessions,
             COUNT(DISTINCT visitor_id) AS users
        FROM sessions
       WHERE started_at >= ? AND started_at < ? AND ${column} IS NOT NULL
       GROUP BY ${column}
       ORDER BY sessions DESC
    `).all(from, to).map((r) => ({
      key: r.key, sessions: Number(r.sessions) || 0, users: Number(r.users) || 0,
    }))
  }

  /** 工具调用排行：agent_turn 的 props.tools 是去重后的工具名数组。 */
  function tools(from, to) {
    const rows = db.prepare(`
      SELECT props FROM events
       WHERE ts >= ? AND ts < ? AND name = 'agent_turn'
       ORDER BY ts DESC
       LIMIT 20000
    `).all(from, to)
    const counts = new Map()
    for (const row of rows) {
      let p = {}
      try { p = JSON.parse(row.props) } catch (e) { continue }
      for (const name of Array.isArray(p.tools) ? p.tools : []) {
        counts.set(name, (counts.get(name) || 0) + 1)
      }
    }
    return Array.from(counts, ([name, calls]) => ({ name, calls }))
      .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name))
      .slice(0, 12)
  }

  function funnel(from, to) {
    const row = asPlain(db.prepare(`
      SELECT
        COUNT(DISTINCT CASE WHEN name = 'page_view' THEN visitor_id END) AS visitors,
        COUNT(DISTINCT CASE WHEN name = 'agent_turn' THEN visitor_id END) AS agentUsers,
        COUNT(DISTINCT CASE WHEN name = 'quiz_start' THEN visitor_id END) AS quizStartUsers,
        COUNT(DISTINCT CASE WHEN name = 'quiz_submit' THEN visitor_id END) AS quizSubmitUsers
      FROM events WHERE ts >= ? AND ts < ?
    `).get(from, to)) || {}
    return {
      visitors: Number(row.visitors) || 0,
      agentUsers: Number(row.agentUsers) || 0,
      quizStartUsers: Number(row.quizStartUsers) || 0,
      quizSubmitUsers: Number(row.quizSubmitUsers) || 0,
    }
  }

  /**
   * 留存：按首次访问日分组，D1 = 首访次日仍有事件，D7 = 第 7 日仍有事件。
   * 只统计「观察窗口已经过完」的 cohort，避免把今天刚来的用户算成流失。
   */
  function retention(from, to) {
    const dayRows = db.prepare(`
      SELECT visitor_id, day FROM events WHERE ts >= ? AND ts < ?
    `).all(from - 8 * DAY_MS, to)
    const activeDays = new Map()
    for (const r of dayRows) {
      let set = activeDays.get(r.visitor_id)
      if (!set) { set = new Set(); activeDays.set(r.visitor_id, set) }
      set.add(r.day)
    }
    const cohort = db.prepare(`
      SELECT id, first_seen FROM visitors WHERE first_seen >= ? AND first_seen < ?
    `).all(from, to)
    const endDay = dayKey(to - 1)
    const addDays = (day, n) => {
      const d = new Date(day + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + n)
      return d.toISOString().slice(0, 10)
    }
    let d1Eligible = 0, d1 = 0, d7Eligible = 0, d7 = 0
    for (const v of cohort) {
      const firstDay = dayKey(v.first_seen)
      const active = activeDays.get(v.id) || new Set()
      if (firstDay < endDay) {
        d1Eligible += 1
        if (active.has(addDays(firstDay, 1))) d1 += 1
      }
      if (firstDay <= addDays(endDay, -7)) {
        d7Eligible += 1
        if (active.has(addDays(firstDay, 7))) d7 += 1
      }
    }
    const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)
    return {
      cohort: cohort.length,
      d1: { rate: pct(d1, d1Eligible), users: d1, eligible: d1Eligible },
      d7: { rate: pct(d7, d7Eligible), users: d7, eligible: d7Eligible },
    }
  }

  /** 管理看板一次取全。 */
  function stats(days = 30, now = Date.now()) {
    const n = clampDays(days)
    // 含「当前这一毫秒」：事件与查询同毫秒时不应被右开区间漏掉。
    const to = now + 1
    const today = dayKey(now)
    const from = startOfDay(now) - (n - 1) * DAY_MS
    const prevFrom = from - n * DAY_MS
    const overview = totals(from, to)
    const previous = totals(prevFrom, from)

    // 累计用户是「到现在为止」，不受时间窗影响。
    const usersTotal = scalar('SELECT COUNT(*) AS v FROM visitors')

    return {
      range: {
        days: n,
        from,
        to,
        fromDay: dayKey(from),
        toDay: today,
        timeZoneOffsetMinutes: tzOffsetMs / 60000,
      },
      overview: Object.assign({ usersTotal }, overview),
      previous,
      trend: trend(from, to),
      modules: modules(from, to),
      pages: pages(from, to),
      devices: groupedSessions('device', from, to),
      languages: groupedSessions('lang', from, to),
      tools: tools(from, to),
      funnel: funnel(from, to),
      retention: retention(from, to),
      generatedAt: now,
    }
  }

  /** 汇总 CSV（不含任何访客/会话 ID）。 */
  function exportCsv(days = 30, now = Date.now()) {
    const s = stats(days, now)
    const lines = [
      'date,active_users,new_users,sessions,page_views,agent_turns,quiz_starts,quiz_submits',
    ]
    for (const d of s.trend) {
      lines.push([
        d.date, d.activeUsers, d.newUsers, d.sessions, d.pageViews,
        d.agentTurns, d.quizStarts, d.quizSubmits,
      ].join(','))
    }
    lines.push('')
    lines.push('module,users,sessions,page_views,agent_turns,quiz_starts,quiz_submits')
    for (const m of s.modules) {
      lines.push([m.id, m.users, m.sessions, m.pageViews, m.agentTurns, m.quizStarts, m.quizSubmits].join(','))
    }
    return lines.join('\n') + '\n'
  }

  /** 老数据清理（默认保留两年）。 */
  function prune(days = 730, now = Date.now()) {
    const cutoff = now - Math.max(30, days) * DAY_MS
    db.prepare('DELETE FROM events WHERE ts < ?').run(cutoff)
    db.prepare('DELETE FROM sessions WHERE last_seen < ?').run(cutoff)
    db.prepare('DELETE FROM visitors WHERE last_seen < ?').run(cutoff)
    return { cutoff }
  }

  function close() {
    try { db.close() } catch (e) { /* ignore */ }
  }

  return {
    file, ingest, ingestBatch, stats, exportCsv, prune, close,
    dayKey, startOfDay,
    _db: db,
  }
}
