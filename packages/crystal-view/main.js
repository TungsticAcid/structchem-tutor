/**
 * 晶体结构3D可视化 H5 - 应用入口
 * 初始化路由、全局状态、加载首页
 */
import { inject } from '@vercel/analytics'
import { router } from './adapters/router.js'
import { getJSONSync, setStorageSync } from './adapters/storage.js'
import './adapters/wx-mock.js' // 初始化 wx mock

// 注入 Vercel Analytics（页面浏览统计）
inject()

// ===== 页面组件（动态导入，避免循环依赖） =====
import { IndexPage } from './pages/index.js'
import { ViewerPage } from './pages/viewer.js'
import { ComparePage } from './pages/compare.js'
import { SettingsPage } from './pages/settings.js'

// ===== 全局状态（替代 App.globalData） =====
export const globalData = {
  /** 晶体索引缓存 */
  crystalIndex: [],
  /** 已加载的晶体数据缓存 */
  crystalCache: {},
  /** 对比页面预设 */
  comparePreset: null
}

// 预加载晶体索引
async function preloadIndex() {
  try {
    const module = await import('./data/crystalIndex.js')
    globalData.crystalIndex = module.default || module
    console.log(`[App] 晶体索引已加载，共 ${globalData.crystalIndex.length} 个结构`)
  } catch (err) {
    console.error('[App] 晶体索引加载失败:', err)
  }
}

// ===== 应用启动 =====
async function bootstrap() {
  await preloadIndex()

  const appContainer = document.getElementById('app')
  router.setContainer(appContainer)

  // 注册路由
  router
    .on('/', () => new IndexPage().mount(appContainer))
    .on('/viewer/:crystal', ({ params }) => new ViewerPage(params).mount(appContainer))
    .on('/compare/:crystal', ({ params }) => new ComparePage(params).mount(appContainer))
    .on('/settings', () => new SettingsPage().mount(appContainer))

  // 如果没有 hash，默认跳转到首页
  if (!location.hash || location.hash === '#') {
    location.hash = '#/'
  }

  router.start()
}

// 启动
bootstrap().catch(err => console.error('[App] 启动失败:', err))
