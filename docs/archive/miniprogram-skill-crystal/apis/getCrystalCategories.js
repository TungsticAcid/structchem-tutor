/**
 * 获取分类列表 API
 * 返回全部晶体分类及每类代表样品
 *
 * 规范：
 * - content：「事实陈述 + 业务动作」两段式
 * - structuredContent：分类结构数据
 * - _meta：组件渲染用数据
 */
const { getCategoryList } = require('../utils/crystal-search.js')
const crystalIndex = require('../../data/crystalIndex.js')

async function getCrystalCategories() {
  try {
    const categories = getCategoryList()
    const totalCrystals = crystalIndex.length

    // structuredContent：Agent 理解分类
    const structuredCategories = categories.map(c => ({
      key: c.key,
      name: c.name,
      count: c.count,
      samples: c.samples
    }))

    // _meta：组件渲染用
    const viewCategories = categories.map(c => ({
      ...c
    }))

    return {
      isError: false,
      content: [{
        type: 'text',
        text: `晶体结构库共 ${totalCrystals} 种晶体，分为 ${categories.length} 个分类：${categories.map(c => `${c.name}(${c.count}种)`).join('、')}。接下来为用户展示分类卡片，用简短话术引导用户点击感兴趣的分类查看具体晶体列表，禁止以纯文本或 markdown 列表另行展开。`
      }],
      structuredContent: {
        categories: structuredCategories,
        totalCategories: categories.length,
        totalCrystals
      },
      _meta: {
        categories: viewCategories,
        totalCategories: categories.length,
        totalCrystals
      }
    }
  } catch (err) {
    console.error('[getCrystalCategories] error', err)
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `获取分类失败：${err.message || '未知错误'}。请引导用户说出感兴趣的晶体名进行搜索。`
      }]
    }
  }
}

module.exports = getCrystalCategories
