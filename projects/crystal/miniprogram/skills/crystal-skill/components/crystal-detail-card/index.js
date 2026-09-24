/**
 * 晶体详情卡片组件
 * 展示单个晶体的完整教学信息：晶格参数、空间群、原子组成、空隙等
 *
 * 规范：
 * - 基础数据从 structuredContent 获取
 * - 渲染详情从 _meta 补充（含 formated 文本）
 * - 支持对比模式：当 _meta 含 comparison 时为对比卡片
 */
Component({
  data: {
    // 晶体基本信息
    name: '',
    formula: '',
    crystalSystemCN: '',
    categoryName: '',
    subtitle: '',
    // 教学属性
    spaceGroup: '',
    latticeType: '',
    structuralUnit: '',
    coordination: '',
    spaceUtilization: '',
    packingDescription: '',
    // 晶格参数
    latticeText: '',
    atomText: '',
    // 特性标签
    intersticeTypes: [],
    hasSymmetry: false,
    hasBonds: false,
    hasHydrogenBonds: false,
    featureList: [],
    // 对比模式
    isComparison: false,
    comparison: null,
    crystalAName: '',
    crystalBName: ''
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

        // 判断是否为对比模式
        const isComparison = !!(meta.comparison && meta.detailA && meta.detailB)

        if (isComparison) {
          // 对比模式
          this.setData({
            isComparison: true,
            comparison: meta.comparison,
            crystalAName: (sc.crystalA && sc.crystalA.name) || meta.detailA.name || '',
            crystalBName: (sc.crystalB && sc.crystalB.name) || meta.detailB.name || '',
            featureList: (meta.differences || []),
            // 展示A的信息为主
            name: meta.detailA.name || '',
            formula: meta.detailA.formula || '',
            crystalSystemCN: meta.detailA.crystalSystemCN || '',
            categoryName: meta.detailA.categoryName || '',
            subtitle: meta.detailA.subtitle || '',
            spaceGroup: meta.detailA.spaceGroup || '',
            latticeType: meta.detailA.latticeType || '',
            coordination: meta.detailA.coordination || '',
            spaceUtilization: meta.detailA.spaceUtilization || '',
            packingDescription: meta.detailA.packingDescription || '',
            latticeText: meta.detailA.latticeText || '',
            atomText: meta.detailA.atomText || '',
            intersticeTypes: meta.detailA.intersticeTypes || [],
            hasSymmetry: meta.detailA.hasSymmetry || false,
            hasBonds: meta.detailA.hasBonds || false,
            hasHydrogenBonds: meta.detailA.hasHydrogenBonds || false
          })
        } else {
          // 单晶体详情模式
          this.setData({
            isComparison: false,
            comparison: null,
            // structuredContent（Agent 可见）
            name: sc.name || meta.name || '',
            formula: sc.formula || meta.formula || '',
            crystalSystemCN: sc.crystalSystemCN || meta.crystalSystemCN || '',
            categoryName: sc.categoryName || meta.categoryName || '',
            subtitle: sc.subtitle || meta.subtitle || '',
            spaceGroup: sc.spaceGroup || meta.spaceGroup || '',
            latticeType: sc.latticeType || meta.latticeType || '',
            structuralUnit: sc.structuralUnit || meta.structuralUnit || '',
            coordination: sc.coordination || meta.coordination || '',
            spaceUtilization: sc.spaceUtilization || meta.spaceUtilization || '',
            packingDescription: sc.packingDescription || meta.packingDescription || '',
            intersticeTypes: sc.intersticeTypes || meta.intersticeTypes || [],
            hasSymmetry: sc.hasSymmetry || meta.hasSymmetry || false,
            hasBonds: sc.hasBonds || meta.hasBonds || false,
            hasHydrogenBonds: sc.hasHydrogenBonds || meta.hasHydrogenBonds || false,
            // _meta 补充（formated 文本）
            latticeText: meta.latticeText || '',
            atomText: meta.atomText || '',
            featureList: meta.featureList || []
          })
        }

        // 关联到 viewer 页面
        const crystalId = sc.id || (meta.detailA && meta.detailA.id) || meta.id
        if (crystalId) {
          this._viewCtx.setRelatedPage({ query: `crystal=${crystalId}` })
        }
      })
    }
  },

  methods: {
    /** 在3D查看器中打开 */
    onTapOpenViewer(e) {
      const crystalId = e.currentTarget.dataset.crystalId
      if (!crystalId) return
      this._modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: '在3D查看器中打开' },
          { type: 'api/call', data: { name: 'openCrystalViewer', arguments: { crystalId } } }
        ]
      })
    },

    /** 跳转到对比页面 */
    onTapCompare() {
      const dataset = this.data
      if (!dataset.isComparison || !dataset.comparison) return
      // 构造对比页面 URL（使用当前组件的两个晶体 ID）
      this._viewCtx.openDetailPage({
        url: '/pages/compare/compare'
      })
    }
  }
})
