/**
 * vite.config.js — 统一前端的构建配置
 *
 * ★ 两个关键设置，都是因为**源码不在本应用的根目录下**：
 *
 *   1. `server.fs.allow` 指到仓库根。Vite 默认只允许访问 workspace root 下的文件，
 *      而我们要 import ../../packages（共享核）、../../modules（模块实现）、
 *      ../../projects/crystal/H5/src（crystal 的视图与数据）。不放开会在 dev server
 *      报 403（构建时不受此限）。
 *
 *   2. 别名把三个来源区分清楚。不做别名也能跑（相对路径很长），但别名让
 *      "这是共享层 / 这是模块 / 这是被复用的原项目代码" 一眼可辨——
 *      后者是过渡期的形态，B4/B6 完成后会逐步收进 modules/。
 */
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'

const repo = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  base: './',
  server: {
    port: 3001,
    open: false,
    fs: { allow: [repo] },
  },
  resolve: {
    alias: {
      // 共享层（学科无关）
      '@core': fileURLToPath(new URL('../../packages/agent-core', import.meta.url)),
      '@ui-kit': fileURLToPath(new URL('../../packages/ui-kit', import.meta.url)),
      '@viewer': fileURLToPath(new URL('../../packages/viewer', import.meta.url)),
      '@knowledge': fileURLToPath(new URL('../../packages/knowledge', import.meta.url)),
      '@skills': fileURLToPath(new URL('../../packages/skills', import.meta.url)),
      // 模块实现
      '@modules': fileURLToPath(new URL('../../modules', import.meta.url)),
      // 过渡期：被复用的原项目代码（B4/B6 后逐步收进 modules/）
      '@crystal': fileURLToPath(new URL('../../projects/crystal/H5/src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
})
