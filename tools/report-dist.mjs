#!/usr/bin/env node
/**
 * report-dist.mjs —— 打印构建产物的**真实**规模，供申请表 / 安全检查材料 / 部署文档引用。
 *
 * ★ 为什么要有这个脚本（2026-10-16）：
 *   登记表与安全检查材料里要写"产物多大"，而这些数字**写在四份文档里** ✗。
 *   构建产物随功能变化（本次实测：早期 28 个文件 / 4.09 MB ⇒ 现在 31 个文件 / 5.40 MB），
 *   文档里的数字一飘，交上去的材料就与实物不符 ✗。
 *   ⇒ 以本脚本输出为准，文档只写"以 `node tools/report-dist.mjs` 为准（当前 …）"。
 *
 * 用法：node tools/report-dist.mjs
 */
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(ROOT, 'apps', 'web', 'dist')

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

let files = []
try {
  files = walk(DIST)
} catch (e) {
  console.error('还没有构建产物：先跑 `cd apps/web && npx vite build`（Windows 上见 docs/部署-龙蜥.md §1）')
  process.exit(1)
}

const sizes = files.map((f) => ({ f, size: statSync(f).size }))
const total = sizes.reduce((s, x) => s + x.size, 0)
const mb = (n) => (n / 1024 / 1024).toFixed(2)

console.log('产物目录 = apps/web/dist')
console.log('文件数   = ' + files.length)
console.log('合计     = ' + mb(total) + ' MB')
console.log('')
console.log('最大的 6 个文件：')
for (const x of sizes.sort((a, b) => b.size - a.size).slice(0, 6)) {
  console.log('  ' + (x.size / 1024).toFixed(1).padStart(8) + ' KB  ' + relative(DIST, x.f))
}

const wasm = sizes.filter((x) => x.f.endsWith('.wasm'))
console.log('')
console.log('WebAssembly = ' + (wasm.length ? wasm.map((x) => relative(DIST, x.f) + ' (' + (x.size / 1024).toFixed(0) + ' KB)').join(', ') : '无'))
console.log('顶层条目    = ' + readdirSync(DIST).join(', '))
console.log('')
console.log('★ 部署要点：服务器上只需这个目录（不需要 node_modules、不需要 Node 进程）；')
console.log('  `.wasm` 的 Content-Type 必须是 application/wasm（见 docs/部署-龙蜥.md §4）。')
