/**
 * 搜索晶体 API
 * 按关键词检索晶体——支持晶体名、化学式、结构类型、分类、晶系
 *
 * 规范（参考 WeStoreCafe Demo 最佳实践）：
 * - content：「事实陈述 + 业务动作」两段式 + 禁止纯文本列详情
 * - structuredContent：供 Agent 理解屏幕内容（精简，不含纯渲染字段）
 * - _meta：组件渲染用数据，Agent 不可见
 */
const { searchCrystals: searchUtil, findCrystalById } = require('../utils/crystal-search.js')

async function searchCrystals({ keyword } = {}) {
  try {
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: '缺少搜索关键词。禁止编造关键词再次调用本接口。正确出口：询问用户想查找什么晶体（如晶体名、化学式、分类），或调用 getRecommendedCrystals 为用户推荐。'
        }]
      }
    }

    const results = searchUtil(keyword.trim())

    if (results.length === 0) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `未找到与「${keyword}」匹配的晶体结构。请引导用户尝试以下方式：(1) 换个关键词（如化学式、晶系名称）；(2) 调用 getRecommendedCrystals 浏览全部晶体；(3) 调用 getCrystalCategories 按分类浏览。禁止编造晶体 ID 重试。`
        }]
      }
    }

    // structuredContent：Agent 理解搜索结果（精简）
    const items = results.map(c => ({
      id: c.id,
      name: c.name,
      formula: c.formula,
      crystalSystem: c.crystalSystem,
      category: c.category,
      subtitle: c.subtitle || '',
      systemName: c.systemName || '',
      categoryName: c.categoryName || ''
    }))

    // _meta：组件渲染用（含全量信息）
    const viewItems = results.map(c => ({
      id: c.id,
      name: c.name,
      formula: c.formula,
      crystalSystem: c.crystalSystem,
      category: c.category,
      subtitle: c.subtitle || '',
      systemName: c.systemName || '',
      categoryName: c.categoryName || ''
    }))

    return {
      isError: false,
      // content：事实陈述 + 业务动作 + 禁止纯文本
      content: [{
        type: 'text',
        text: `已找到 ${results.length} 个与「${keyword}」匹配的晶体结构（共 ${results.length} 个）。接下来为用户展示晶体搜索结果卡片，用简短话术引导用户点击卡片上的"查看3D"或"查看详情"按钮，禁止以纯文本或 markdown 列表列出晶体名和参数。`
      }],
      structuredContent: {
        items,
        total: results.length,
        keyword: keyword.trim()
      },
      _meta: {
        viewItems,
        keyword: keyword.trim()
      }
    }
  } catch (err) {
    console.error('[searchCrystals] error', err)
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `搜索失败：${err.message || '未知错误'}。请引导用户稍后重试或换个关键词。`
      }]
    }
  }
}

module.exports = searchCrystals
