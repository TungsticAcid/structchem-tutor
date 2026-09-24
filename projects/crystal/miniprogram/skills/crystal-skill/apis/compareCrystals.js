/**
 * 对比晶体 API
 * 对比两个晶体的结构特征，展示差异信息
 *
 * 规范：
 * - content：「事实陈述 + 业务动作」两段式
 * - structuredContent：对比结果
 * - _meta：组件渲染用数据
 */
const { getCrystalDetailInfo, findCrystalById } = require('../utils/crystal-search.js')

async function compareCrystals({ crystalIdA, crystalIdB } = {}) {
  try {
    if (!crystalIdA || !crystalIdB) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: '缺少对比所需的晶体 ID。两个 crystalId 都必须提供。禁止编造 ID。正确出口：先调用 searchCrystals 分别获取两个晶体的 ID，或引导用户明确要对比的晶体名。'
        }]
      }
    }

    if (crystalIdA === crystalIdB) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: '两个晶体 ID 相同，无法进行有意义的对比。请引导用户选择两个不同的晶体。'
        }]
      }
    }

    const detailA = getCrystalDetailInfo(crystalIdA)
    const detailB = getCrystalDetailInfo(crystalIdB)

    if (!detailA || !detailB) {
      const missing = !detailA ? crystalIdA : crystalIdB
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `未找到晶体 ${missing} 的数据。禁止编造 ID。正确出口：调用 searchCrystals 获取有效 crystalId。`
        }]
      }
    }

    // 构建对比差异列表
    const differences = []
    if (detailA.category !== detailB.category) {
      differences.push(`分类不同：${detailA.categoryName} vs ${detailB.categoryName}`)
    }
    if (detailA.crystalSystem !== detailB.crystalSystem) {
      differences.push(`晶系不同：${detailA.crystalSystemCN} vs ${detailB.crystalSystemCN}`)
    }
    if (detailA.latticeType !== detailB.latticeType) {
      differences.push(`点阵型式不同：${detailA.latticeType} vs ${detailB.latticeType}`)
    }
    if (detailA.coordination !== detailB.coordination) {
      differences.push(`配位数不同：${detailA.coordination} vs ${detailB.coordination}`)
    }
    if (detailA.spaceUtilization !== detailB.spaceUtilization) {
      differences.push(`空间利用率不同：${detailA.spaceUtilization} vs ${detailB.spaceUtilization}`)
    }
    if (detailA.structuralUnit !== detailB.structuralUnit) {
      differences.push(`结构基元不同：${detailA.structuralUnit} vs ${detailB.structuralUnit}`)
    }
    if (detailA.packingDescription !== detailB.packingDescription) {
      differences.push(`堆积方式不同：${detailA.packingDescription} vs ${detailB.packingDescription}`)
    }

    // 原子组成差异
    const atomsA = detailA.atomSummary.map(a => a.element).sort().join('')
    const atomsB = detailB.atomSummary.map(a => a.element).sort().join('')
    if (atomsA !== atomsB) {
      differences.push(`元素组成不同：${detailA.atomSummary.map(a => `${a.element}×${a.count}`).join('、')} vs ${detailB.atomSummary.map(a => `${a.element}×${a.count}`).join('、')}`)
    }

    if (differences.length === 0) {
      differences.push('两个晶体在关键结构特征上高度相似，建议在3D查看器中直观对比。')
    }

    const comparison = {
      sameCategory: detailA.category === detailB.category,
      sameCrystalSystem: detailA.crystalSystem === detailB.crystalSystem,
      sameLatticeType: detailA.latticeType === detailB.latticeType,
      differences
    }

    return {
      isError: false,
      content: [{
        type: 'text',
        text: `已完成「${detailA.name}」与「${detailB.name}」的对比分析。${differences.length > 0 ? `主要差异：${differences.slice(0, 3).join('；')}` : '两者结构特征相似'}。接下来为用户展示对比详情卡片，用简短话术引导用户在3D查看器中直观对比，或点击"并排对比"跳转到对比页面，禁止以纯文本或 markdown 列表另行展开详情。`
      }],
      structuredContent: {
        crystalA: {
          id: detailA.id,
          name: detailA.name,
          formula: detailA.formula,
          crystalSystem: detailA.crystalSystem,
          crystalSystemCN: detailA.crystalSystemCN,
          category: detailA.category,
          categoryName: detailA.categoryName,
          spaceGroup: detailA.spaceGroup,
          coordination: detailA.coordination,
          spaceUtilization: detailA.spaceUtilization,
          packingDescription: detailA.packingDescription
        },
        crystalB: {
          id: detailB.id,
          name: detailB.name,
          formula: detailB.formula,
          crystalSystem: detailB.crystalSystem,
          crystalSystemCN: detailB.crystalSystemCN,
          category: detailB.category,
          categoryName: detailB.categoryName,
          spaceGroup: detailB.spaceGroup,
          coordination: detailB.coordination,
          spaceUtilization: detailB.spaceUtilization,
          packingDescription: detailB.packingDescription
        },
        comparison
      },
      _meta: {
        detailA,
        detailB,
        comparison,
        differences
      }
    }
  } catch (err) {
    console.error('[compareCrystals] error', err)
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `对比失败：${err.message || '未知错误'}。请引导用户稍后重试。`
      }]
    }
  }
}

module.exports = compareCrystals
