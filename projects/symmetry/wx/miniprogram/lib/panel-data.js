/**
 * 信息面板数据构建（由 H5 ui/info.js 的"共轭类分组 + 特征标表"逻辑改造）
 * 输出 WXML 友好的嵌套数据（对称元素分组树 + 特征标表），供 viewer 页面绑定渲染。
 * 群符号/类名/不可约表示的斜体+下标用 HTML 字符串，经 <rich-text nodes> 渲染。
 */
import { getSymmetryElementColor } from './settings.js'
import { singleElementName, typeRank, findPrincipal } from './symmetry/elementNaming.js'
import { t, formatGroupSymbol, formatIrrepLabel, formatFormulaU } from './i18n.js'

/** 特征标表类名/符号 → 带下标的 HTML（C2→C₂、σᵥ、S₄、2C₂′、σᵥ(xz)） */
function formatClassSymbol(s) {
  return String(s)
    .replace(/([CS])(\d+)/g, '$1<sub>$2</sub>')   // C2→C₂、S4→S₄
    .replace(/σ([vdh])/g, 'σ<sub>$1</sub>')         // σv/σd/σh → σᵥ/σd/σh（下标）
}

/**
 * 构建信息面板数据
 * @param {Object} info - { title, formula, groupSymbol, groupName, meta, elements, characterTable }
 * @returns {Object} WXML 数据
 */
export function buildPanelData(info) {
  const elements = info.elements || []
  const principal = findPrincipal(elements)

  // 恒等元素 E：无空间几何，作为静态说明行列出（无显隐勾选 / 动画按钮）
  const identity = []
  for (const el of elements) {
    if (el.type === 'E') {
      identity.push({ label: el.label || singleElementName(el.type), color: getSymmetryElementColor(el.type) })
    }
  }

  // 参与分组/交互的仅非恒等元素；index 保留原始下标（与 3D items / toggle / play 对齐）
  const interactive = []
  elements.forEach((el, i) => { if (el.type !== 'E') interactive.push({ el, index: i }) })

  // 按「共轭类」（el.name 专业类名）分组，按点群判断规则排序
  const groupMap = new Map()
  const order = []
  interactive.forEach(({ el, index }) => {
    const key = el.name || singleElementName(el.type)
    if (!groupMap.has(key)) {
      const rank = typeRank(el.type, el.order || 0, !!principal && el.type === principal.el.type)
      groupMap.set(key, { name: key, type: el.type, rank, count: 0, items: [] })
      order.push(key)
    }
    const g = groupMap.get(key)
    g.count++
    g.items.push({ el, index })
  })
  order.sort((a, b) => groupMap.get(a).rank - groupMap.get(b).rank)

  const groups = order.map((name) => {
    const g = groupMap.get(name)
    const color = getSymmetryElementColor(g.type)
    return {
      name: g.name,
      color,
      count: g.count,
      items: g.items.map(({ el, index }) => ({
        label: el.label || singleElementName(el.type),
        index,
        checked: true   // 默认全部显示；用户可逐项取消（配合"对称元素"开关全显）
      }))
    }
  })

  // 特征标表（折叠区）
  const ct = info.characterTable
  let characterTable = { has: false }
  if (ct) {
    characterTable = {
      has: true,
      header: [
        { key: 'label', html: t('ct.irreps') },
        ...ct.classes.map(c => ({ key: 'cls', html: formatClassSymbol(c) })),
        { key: 'linear', html: t('ct.linear') },
        { key: 'quad', html: t('ct.quad') }
      ],
      rows: ct.irreps.map(ir => ({
        labelHtml: formatIrrepLabel(ir.label),
        chars: ir.characters.map(String),
        linear: ir.linear || '',
        quadratic: ir.quadratic || ''
      }))
    }
  }

  return {
    title: info.title || '—',
    formula: formatFormulaU(info.formula || ''),
    groupSymbolHtml: formatGroupSymbol(info.groupSymbol),
    groupName: info.groupName || '',
    meta: info.meta || '',
    identity,
    groups,
    // 汇总（供"更多/关于"展示）
    totalElements: interactive.length,
    classCount: groups.length,
    characterTable
  }
}

export default { buildPanelData }
