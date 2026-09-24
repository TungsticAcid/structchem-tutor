/**
 * 打开3D查看器 API
 * 导航到晶体三维可视化页面
 *
 * 规范：
 * - 本 API 本质是导航动作，不返回卡片组件
 * - 成功后直接跳转页面，只需告知 Agent 导航结果
 */
const { findCrystalById } = require('../utils/crystal-search.js')

async function openCrystalViewer({ crystalId } = {}) {
  try {
    if (!crystalId) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: '缺少 crystalId。禁止编造 ID。正确出口：先调用 searchCrystals 或 getRecommendedCrystals 获取可用 crystalId。'
        }]
      }
    }

    const crystal = findCrystalById(crystalId)
    if (!crystal) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `未找到 crystalId=${crystalId} 的晶体。禁止编造 ID。正确出口：调用 searchCrystals 或 getRecommendedCrystals 获取有效 crystalId。`
        }]
      }
    }

    // 注：SKILL API 运行在隔离的 JS 上下文中，无法调用 wx.navigateTo。
    // 页面跳转由 Agent 根据 page-meta.json 和 structuredContent 自动生成文字链完成。
    return {
      isError: false,
      content: [{
        type: 'text',
        text: `点击下方链接打开「${crystal.name}（${crystal.formula}）」的3D结构查看器，你可以在页面中旋转、缩放模型，切换CPK/球棍显示模式，控制原子、键、线框、空隙、对称元素等图层的显示。`
      }],
      structuredContent: {
        crystalId,
        name: crystal.name,
        formula: crystal.formula,
        pagePath: 'pages/viewer/viewer',
        query: { crystal: crystalId }
      },
      _meta: {
        crystalId,
        name: crystal.name
      }
    }
  } catch (err) {
    console.error('[openCrystalViewer] error', err)
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `导航到3D查看器失败：${err.message || '未知错误'}。请引导用户手动点击首页的晶体卡片进入查看。`
      }]
    }
  }
}

module.exports = openCrystalViewer
