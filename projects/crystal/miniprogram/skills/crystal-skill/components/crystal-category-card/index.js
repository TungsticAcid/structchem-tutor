/**
 * 晶体分类/推荐卡片组件
 * 两种模式：
 * 1. 分类模式：展示全部分类及每类数量（getCrystalCategories）
 * 2. 推荐模式：展示精选晶体列表（getRecommendedCrystals）
 *
 * 规范：
 * - 基础数据从 structuredContent 获取
 * - 渲染详情从 _meta 补充
 */
Component({
  data: {
    // 模式：'categories' | 'recommended'
    mode: 'recommended',
    title: '精选推荐',
    // 分类数据
    categories: [],
    totalCategories: 0,
    totalCrystals: 0,
    // 推荐晶体
    items: [],
    total: 0,
    scenario: '',
    scenarioLabel: ''
  },

  lifetimes: {
    created() {
      this._modelCtx = wx.modelContext.getContext(this)
      this._viewCtx = wx.modelContext.getViewContext(this)
      const { NotificationType } = wx.modelContext
      this._modelCtx.on(NotificationType.Result, (data) => {
        const result = data && data.result ? data.result : {}
        const sc = result.structuredContent || {}
        const meta = result._meta || {}

        // 判断数据模式：有 categories 字段为分类模式，有 items 为推荐模式
        const isCategoriesMode = !!(sc.categories && sc.categories.length > 0)
        const isRecommendedMode = !!(sc.items && sc.items.length > 0)

        if (isCategoriesMode) {
          // 分类模式
          const viewCategories = (meta.categories && meta.categories.length > 0)
            ? meta.categories
            : sc.categories
          this.setData({
            mode: 'categories',
            title: '晶体分类',
            categories: viewCategories,
            totalCategories: sc.totalCategories || viewCategories.length,
            totalCrystals: sc.totalCrystals || 0
          })
        } else if (isRecommendedMode) {
          // 推荐模式
          const viewItems = (meta.viewItems && meta.viewItems.length > 0)
            ? meta.viewItems
            : sc.items
          this.setData({
            mode: 'recommended',
            title: sc.scenario && sc.scenario !== 'default'
              ? `${meta.scenarioLabel || ''}推荐`
              : '精选推荐',
            items: viewItems,
            total: sc.total || viewItems.length,
            scenario: sc.scenario || '',
            scenarioLabel: meta.scenarioLabel || ''
          })
        }
      })
    }
  },

  methods: {
    /** 点击分类 */
    onTapCategory(e) {
      const cat = e.currentTarget.dataset.category
      if (!cat || !cat.key) return
      this._modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: `查看${cat.name}` },
          { type: 'api/call', data: { name: 'searchCrystals', arguments: { keyword: cat.name } } }
        ]
      })
    },

    /** 点击推荐晶体 → 查看详情 */
    onTapCrystal(e) {
      const item = e.currentTarget.dataset.item
      if (!item || !item.id) return
      this._modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: `查看${item.name}的详细信息` },
          { type: 'api/call', data: { name: 'getCrystalDetail', arguments: { crystalId: item.id } } }
        ]
      })
    },

    /** 点击推荐晶体 → 直接查看3D */
    onTapView3D(e) {
      const item = e.currentTarget.dataset.item
      if (!item || !item.id) return
      this._modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: `查看${item.name}的3D结构` },
          { type: 'api/call', data: { name: 'openCrystalViewer', arguments: { crystalId: item.id } } }
        ]
      })
    },

    /** 跳转到首页 */
    onTapBrowseAll() {
      this._viewCtx.openDetailPage({
        url: '/pages/index/index'
      })
    }
  }
})
