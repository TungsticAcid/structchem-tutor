#!/usr/bin/env node
/**
 * build-web.mjs —— 一键构建前端（`node tools/build-web.mjs`）。
 *
 * ★ 为什么需要它（2026-10-16 实测的坑）：
 *   Windows 上 esbuild 会在系统临时目录（`C:\Users\<你>\AppData\Local\Temp`）里建临时文件，
 *   而那个目录常被杀软/索引/其它进程占着 ⇒ 删除时报
 *     `[vite:esbuild-transpile] remove …\Temp\esbuild-xxxx: Access is denied.` ⇒ **构建失败** ✗。
 *   更糟的是：Vite 会先清空 dist，失败后 `dist` 只剩残缺文件 ✗（实测失败后只剩 26 个，
 *   正常是 31 个）——所以**失败后不要拿 dist 去部署**。
 *
 *   手动解法是每次先设环境变量：
 *     $env:TEMP="<repo>\tmp\esb"; $env:TMP=$env:TEMP
 *   但每开一个新终端都要重敲 ✗。本脚本把这件事固化：**在同一个进程里**
 *   先把 TEMP/TMP/TMPDIR 指向仓库内的 `tmp/esb`，再动态 import vite
 *   —— esbuild 是被 vite 拉起的子进程，继承的就是这里的进程环境 ✓。
 *
 * ★ 顺序很重要：环境变量必须在 `import('vite')` **之前**设好
 *   （那时 esbuild 还没被拉起）。所以这里用**动态** import，不能用顶层静态 import。
 *
 * 用法：
 *   node tools/build-web.mjs          # 等价于在 apps/web 里跑 `vite build`
 *   node tools/build-web.mjs --clean  # 先删掉 tmp/esb 再构建（临时目录被占死时用）
 */
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRATCH = join(ROOT, 'tmp', 'esb')

if (process.argv.includes('--clean')) {
  try {
    rmSync(SCRATCH, { recursive: true, force: true })
    console.log('已清空 ' + SCRATCH)
  } catch (e) {
    console.log('清空 ' + SCRATCH + ' 失败（不影响，继续）：' + e.message)
  }
}

mkdirSync(SCRATCH, { recursive: true })
if (process.env.TEMP !== SCRATCH) console.log('临时目录 → ' + SCRATCH)
process.env.TEMP = SCRATCH
process.env.TMP = SCRATCH
process.env.TMPDIR = SCRATCH

const t0 = Date.now()
const { build } = await import('vite')
await build({ root: join(ROOT, 'apps', 'web') })
console.log('\n✓ 构建完成，用时 ' + ((Date.now() - t0) / 1000).toFixed(2) + ' s')
console.log('  产物：apps/web/dist（用 `node tools/report-dist.mjs` 核对规模）')
console.log('  部署：把 apps/web/dist 整个交给 Nginx 即可（服务器不需要 Node）')
