/**
 * 推荐晶体 API
 * 按场景返回精选晶体列表，用于模糊意图和首页推荐
 *
 * 规范：
 * - content：「事实陈述 + 业务动作」两段式
 * - structuredContent：供 Agent 理解推荐内容（含推荐理由）
 * - _meta：组件渲染用数据
 */
const { getRecommendedCrystals: getRecommended, CATEGORY_CN } = require('../utils/crystal-search.js')

async function getRecommendedCrystals({ scenario = 'default' } = {}) {
  try {
    // 验证 scenario 取值
    const validScenarios = ['default', 'metal', 'ionic', 'covalent', 'molecular', 'mixed']
    const safeScenario = validScenarios.includes(scenario) ? scenario : 'default'

    const results = getRecommended(safeScenario)

    if (results.length === 0) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: '当前场景暂无推荐晶体。请引导用户尝试其他分类或直接说出感兴趣的晶体名。'
        }]
      }
    }

    const scenarioLabel = safeScenario === 'default' ? '精选推荐' : (CATEGORY_CN[safeScenario] || safeScenario)

    // structuredContent：Agent 理解推荐内容
    const items = results.map(c => ({
      id: c.id,
      name: c.name,
      formula: c.formula,
      crystalSystem: c.crystalSystem,
      category: c.category,
      subtitle: c.subtitle || '',
      systemName: c.systemName || '',
      categoryName: c.categoryName || '',
      recommendationReason: c.recommendationReason
    }))

    // _meta：组件渲染用
    const viewItems = results.map(c => ({
      id: c.id,
      name: c.name,
      formula: c.formula,
      crystalSystem: c.crystalSystem,
      category: c.category,
      subtitle: c.subtitle || '',
      systemName: c.systemName || '',
      categoryName: c.categoryName || '',
      recommendationReason: c.recommendationReason
    }))

    return {
      isError: false,
      content: [{
        type: 'text',
        text: `已为你精选了 ${results.length} 个${scenarioLabel}晶体结构。接下来为用户展示晶体推荐卡片，用简短话术引导用户点击感兴趣的晶体查看详情或3D结构，禁止以纯文本或 markdown 列表列出晶体名和参数。`
      }],
      structuredContent: {
        items,
        total: results.length,
        scenario: safeScenario
      },
      _meta: {
        viewItems,
        scenario: safeScenario,
        scenarioLabel
      }
    }
  } catch (err) {
    console.error('[getRecommendedCrystals] error', err)
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `推荐失败：${err.message || '未知错误'}。请引导用户直接说出感兴趣的晶体名或分类。`
      }]
    }
  }
}

module.exports = getRecommendedCrystals
