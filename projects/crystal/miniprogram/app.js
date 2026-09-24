// 晶体结构3D可视化小程序
App({
  globalData: {
    /** 晶体索引缓存 */
    crystalIndex: [],
    /** 已加载的晶体数据缓存 */
    crystalCache: {}
  },

  onLaunch() {
    // 预加载晶体索引
    try {
      const index = require('./data/crystalIndex.js')
      this.globalData.crystalIndex = index
      console.log(`[App] 晶体索引已加载，共 ${index.length} 个结构`)
    } catch (err) {
      console.error('[App] 晶体索引加载失败:', err)
    }
  }
})
