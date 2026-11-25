#!/usr/bin/env node
/**
 * index.mjs — 统计服务启动入口
 *
 * 用法：
 *   ANALYTICS_ADMIN_PASSWORD='...' npm run analytics
 *   或在仓库根目录放 `.env`（已被 .gitignore 忽略），再 `npm run analytics`
 *
 * 环境变量见 .env.example 与 server/README.md。
 */

import { resolve } from 'node:path'
import { createAnalyticsStore } from './analytics-store.mjs'
import { createAnalyticsApp } from './analytics-server.mjs'

function positiveInt(value, fallback, min = 1, max = 65535) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function loadConfig(env = process.env) {
  const password = env.ANALYTICS_ADMIN_PASSWORD
  if (!password || String(password).length < 8) {
    throw new Error(
      '缺少 ANALYTICS_ADMIN_PASSWORD（至少 8 位）。\n'
      + '  PowerShell:  $env:ANALYTICS_ADMIN_PASSWORD="换成你的口令"; npm run analytics\n'
      + '  或复制 .env.example 为 .env 后填写，再运行 npm run analytics',
    )
  }
  const dataDir = resolve(env.ANALYTICS_DATA_DIR || 'data/analytics')
  return {
    host: env.HOST || '127.0.0.1',
    port: positiveInt(env.PORT, 8787),
    dataDir,
    dbFile: resolve(env.ANALYTICS_DB || resolve(dataDir, 'analytics.sqlite')),
    staticDir: env.ANALYTICS_STATIC_DIR ? resolve(env.ANALYTICS_STATIC_DIR) : resolve('apps/web/dist'),
    adminUser: env.ANALYTICS_ADMIN_USER || 'admin',
    adminPassword: String(password),
    sessionSecret: env.ANALYTICS_SESSION_SECRET || '',
    sessionTtlMs: positiveInt(env.ANALYTICS_SESSION_HOURS, 12, 1, 24 * 30) * 60 * 60 * 1000,
    tzOffsetMinutes: Number(env.ANALYTICS_TZ_OFFSET_MINUTES || 480),
  }
}

async function main() {
  let cfg
  try { cfg = loadConfig() } catch (e) {
    console.error('\n[analytics] ' + e.message + '\n')
    process.exitCode = 1
    return
  }

  const store = createAnalyticsStore({
    file: cfg.dbFile,
    tzOffsetMinutes: cfg.tzOffsetMinutes,
  })
  try { store.prune(730) } catch (e) { console.warn('[analytics] 清理旧数据失败：', e.message) }

  const app = createAnalyticsApp({
    store,
    adminUser: cfg.adminUser,
    adminPassword: cfg.adminPassword,
    sessionSecret: cfg.sessionSecret,
    sessionTtlMs: cfg.sessionTtlMs,
    staticDir: cfg.staticDir,
  })

  app.server.listen(cfg.port, cfg.host, () => {
    const base = `http://${cfg.host === '0.0.0.0' ? '127.0.0.1' : cfg.host}:${cfg.port}`
    console.log('')
    console.log('  结构化学教学智能体 · 用户统计服务')
    console.log('  ─────────────────────────────────')
    console.log(`  后台看板   ${base}/admin`)
    console.log(`  健康检查   ${base}/api/analytics/health`)
    console.log(`  数据库     ${cfg.dbFile}`)
    console.log(`  静态目录   ${cfg.staticDir}`)
    console.log('')
    if (!cfg.sessionSecret) {
      console.warn('  ⚠ 未设置 ANALYTICS_SESSION_SECRET：服务重启后管理员需要重新登录。')
    }
    console.log('  按 Ctrl+C 停止。')
    console.log('')
  })

  let closing = false
  const shutdown = (signal) => {
    if (closing) return
    closing = true
    console.log(`\n[analytics] 收到 ${signal}，正在关闭…`)
    app.server.close(() => {
      try { store.close() } catch (e) { /* ignore */ }
      process.exit(0)
    })
    setTimeout(() => process.exit(0), 3000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main()
