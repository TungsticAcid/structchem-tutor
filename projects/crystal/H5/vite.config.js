import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],
  root: '.',
  base: './',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
