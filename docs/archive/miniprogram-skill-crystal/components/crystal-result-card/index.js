/**
 * 晶体搜索结果卡片组件
 * 展示 searchCrystals 返回的晶体列表
 *
 * 规范：
 * - 基础数据从 structuredContent 获取（Agent 语义筛选后下发）
 * - 组件渲染用字段从 _meta 补充
 */
Component({
  data: {
    title: '搜索结果',
    items: [],
    total: 0,
    keyword: ''
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
        // 优先使用 _meta.viewItems，fallback 到 structuredContent.items
        const viewItems = (meta.viewItems && meta.viewItems.length > 0)
          ? meta.viewItems
          : (sc.items || [])
        this.setData({
          items: viewItems,
          total: sc.total || viewItems.length,
          keyword: sc.keyword || meta.keyword || '',
          title: sc.keyword
            ? `"${sc.keyword}" 搜索结果`
            : '搜索结果'
        })
        // 关联首页
        if (sc.keyword) {
          this._viewCtx.setRelatedPage({
            query: `keyword=${encodeURIComponent(sc.keyword)}`
          })
        }
      })
    }
  },

  methods: {
    /** 点击查看3D结构 */
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

    /** 点击查看详情 */
    onTapDetail(e) {
      const item = e.currentTarget.dataset.item
      if (!item || !item.id) return
      this._modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: `查看${item.name}的详细信息` },
          { type: 'api/call', data: { name: 'getCrystalDetail', arguments: { crystalId: item.id } } }
        ]
      })
    },

    /** 跳转到首页（全部晶体） */
    onTapMore() {
      this._viewCtx.openDetailPage({
        url: '/pages/index/index'
      })
    }
  }
})
