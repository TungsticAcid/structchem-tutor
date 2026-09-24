import { defineConfig } from 'vite'

// Vite 配置：使用相对路径，便于静态部署到任意子目录
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: false
  }
})
