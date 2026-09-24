/**
 * 获取晶体详情 API
 * 返回晶体的完整教学信息：晶格参数、空间群、原子组成、空隙、对称性等
 *
 * 规范：
 * - content：「事实陈述 + 业务动作」两段式
 * - structuredContent：供 Agent 理解的关键信息（精简）
 * - _meta：组件渲染用数据（含全部字段），Agent 不可见
 */
const { getCrystalDetailInfo, findCrystalById, CRYSTAL_SYSTEM_CN } = require('../utils/crystal-search.js')

/** 格式化晶格参数为可读文本 */
function formatLatticeText(lattice) {
  if (!lattice) return ''
  // 长度统一保留 2 位小数，角度统一保留 1 位小数
  const fmt = v => v.toFixed(2)
  const parts = [`a=${fmt(lattice.a)}Å`, `b=${fmt(lattice.b)}Å`, `c=${fmt(lattice.c)}Å`]
  parts.push(`α=${lattice.alpha.toFixed(1)}°`, `β=${lattice.beta.toFixed(1)}°`, `γ=${lattice.gamma.toFixed(1)}°`)
  return parts.join(', ')
}

async function getCrystalDetail({ crystalId } = {}) {
  try {
    if (!crystalId) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: '缺少 crystalId。禁止编造 ID 再次调用本接口。正确出口：先调用 searchCrystals 或 getRecommendedCrystals 获取可用 crystalId。'
        }]
      }
    }

    const meta = findCrystalById(crystalId)
    if (!meta) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `未在晶体库中找到 crystalId=${crystalId} 的晶体记录。禁止编造其他 ID 再次调用本接口，禁止从用户自然语言推断 ID。正确出口：调用 searchCrystals 或 getRecommendedCrystals 获取有效的 crystalId。`
        }]
      }
    }

    const detail = getCrystalDetailInfo(crystalId)
    if (!detail) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `无法加载晶体「${meta.name}」的详细数据。请引导用户尝试其他晶体。`
        }]
      }
    }

    // 构建教学角度的描述文本
    const latticeText = formatLatticeText(detail.lattice)
    const atomText = detail.atomSummary
      .map(a => `${a.element}×${a.count}`)
      .join('、')
    const featureList = []
    if (detail.spaceGroup) featureList.push(`空间群：${detail.spaceGroup}`)
    if (detail.latticeType) featureList.push(`点阵型式：${detail.latticeType}`)
    if (detail.coordination) featureList.push(`配位数：${detail.coordination}`)
    if (detail.spaceUtilization) featureList.push(`空间利用率：${detail.spaceUtilization}`)
    if (detail.packingDescription) featureList.push(`堆积方式：${detail.packingDescription}`)
    if (detail.intersticeTypes.length > 0) featureList.push(`空隙类型：${detail.intersticeTypes.join('、')}`)

    return {
      isError: false,
      // content：事实陈述 + 业务动作
      content: [{
        type: 'text',
        text: `已加载晶体「${detail.name}（${detail.formula}）」的详细信息。${featureList.join('；')}。晶格参数：${latticeText}。接下来为用户展示晶体详情卡片，用简短话术引导用户点击卡片上的"在3D查看器中打开"按钮查看三维结构，禁止以纯文本或 markdown 列表另行展开详情。`
      }],
      // structuredContent：Agent 理解的关键信息
      structuredContent: {
        id: detail.id,
        name: detail.name,
        formula: detail.formula,
        crystalSystem: detail.crystalSystem,
        crystalSystemCN: detail.crystalSystemCN,
        category: detail.category,
        categoryName: detail.categoryName,
        subtitle: detail.subtitle,
        spaceGroup: detail.spaceGroup,
        latticeType: detail.latticeType,
        structuralUnit: detail.structuralUnit,
        coordination: detail.coordination,
        spaceUtilization: detail.spaceUtilization,
        packingDescription: detail.packingDescription,
        lattice: detail.lattice,
        atomSummary: detail.atomSummary,
        intersticeTypes: detail.intersticeTypes,
        hasSymmetry: detail.hasSymmetry,
        hasBonds: detail.hasBonds,
        hasHydrogenBonds: detail.hasHydrogenBonds
      },
      // _meta：组件渲染用全量数据
      _meta: {
        ...detail,
        latticeText,
        atomText,
        featureList
      }
    }
  } catch (err) {
    console.error('[getCrystalDetail] error', err)
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `获取晶体详情失败：${err.message || '未知错误'}。请引导用户稍后重试。`
      }]
    }
  }
}

module.exports = getCrystalDetail
