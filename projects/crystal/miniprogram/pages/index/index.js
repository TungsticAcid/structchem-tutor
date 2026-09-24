// 晶体列表首页
const crystalIndex = require('../../data/crystalIndex.js')

Page({
  data: {
    crystals: crystalIndex,
    activeCategory: 'all',
    categories: [
      { key: 'all', name: '全部' },
      { key: 'metal', name: '金属晶体' },
      { key: 'ionic', name: '离子晶体' },
      { key: 'covalent', name: '共价晶体' },
      { key: 'molecular', name: '分子晶体' },
      { key: 'mixed', name: '混合键型' }
    ],
    filteredCrystals: crystalIndex
  },

  /** 分类切换 */
  onCategoryTap(e) {
    const category = e.currentTarget.dataset.key
    const filtered = category === 'all'
      ? crystalIndex
      : crystalIndex.filter(c => c.category === category)
    this.setData({
      activeCategory: category,
      filteredCrystals: filtered
    })
  },

  /** 点击晶体卡片，跳转到查看器 */
  onCrystalTap(e) {
    const crystalId = e.detail.id
    wx.navigateTo({
      url: `/pages/viewer/viewer?crystal=${crystalId}`
    })
  },

  /** 打开设置页面 */
  onSettingsTap() {
    wx.navigateTo({
      url: '/pages/settings/settings'
    })
  }
})
