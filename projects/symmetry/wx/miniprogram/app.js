// app.js
App({
  onLaunch() {
    // 系统信息（供画布尺寸/安全区计算）
    let info = {}
    try {
      info = (wx.getSystemInfoSync && wx.getSystemInfoSync()) || {}
    } catch (e) { /* ignore */ }
    this.globalData = {
      system: info,
      pixelRatio: info.pixelRatio || 2,
      windowWidth: info.windowWidth || 375,
      windowHeight: info.windowHeight || 667,
      safeArea: info.safeArea || {},
      statusBarHeight: info.statusBarHeight || 0
    }
  },
  globalData: {}
})
