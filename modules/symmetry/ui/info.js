/**
 * 信息面板渲染模块
 * 展示结构信息、点群/空间群符号与对称元素清单（按共轭类分组，可展开独立控制显隐 + 播放动画）
 */
import { getSymmetryElementColor } from '../data/settings.js'
import { singleElementName, typeRank, findPrincipal } from '../engine/elementNaming.js'
import { t, formatGroupSymbol, formatIrrepLabel, formatFormulaU } from '../i18n/index.js'

/** 对称元素类型 → 教学说明（组头 tooltip；i18n 提供中英） */
function typeHint(type) {
  return t('elem.' + type)
}

/** 特征标表类名/符号 → 带下标的 HTML（C2→C₂、σᵥ、S₄、2C₂′、σᵥ(xz)） */
function formatClassSymbol(s) {
  return String(s)
    .replace(/([CS])(\d+)/g, '$1<sub>$2</sub>')   // C2→C₂、S4→S₄
    .replace(/σ([vdh])/g, 'σ<sub>$1</sub>')         // σv/σd/σh → σᵥ/σd/σh（下标）
}

/**
 * 渲染信息面板
 * @param {Object} info - { title, formula, groupSymbol, groupName, meta, elements, characterTable }
 * @param {Object} callbacks - { onToggle(index, visible), onPlay(index) }
 */
export function renderInfo(info, callbacks = {}) {
  document.getElementById('struct-title').textContent = info.title || '—'
  document.getElementById('struct-formula').textContent = formatFormulaU(info.formula || '')
  document.getElementById('group-symbol').innerHTML = formatGroupSymbol(info.groupSymbol)
  document.getElementById('group-name').textContent = info.groupName || ''
  document.getElementById('group-meta').textContent = info.meta || ''

  // ==================== 对称元素列表（按共轭类折叠分组） ====================
  const listEl = document.getElementById('elements-list')
  listEl.innerHTML = ''

  const elements = info.elements || []
  if (elements.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'elem-item'
    empty.textContent = t('info.none')
    listEl.appendChild(empty)
  }

  // 恒等元素 E：无空间几何，作为静态说明行列出（无显隐勾选 / 动画按钮 / 3D 标签）
  const identityElems = elements.filter(el => el.type === 'E')
  for (const el of identityElems) {
    const item = document.createElement('div')
    item.className = 'elem-item'
    item.title = typeHint(el.type)
    const dot = document.createElement('span')
    dot.className = 'elem-dot'
    dot.style.background = getSymmetryElementColor(el.type)
    const lab = document.createElement('span')
    lab.className = 'elem-label'
    lab.textContent = el.label || singleElementName(el.type)
    item.append(dot, lab)
    listEl.appendChild(item)
  }
  // 参与分组/交互的仅非恒等元素；index 保留原始下标，与 3D items / onToggle / onPlay 对齐
  const interactive = []
  elements.forEach((el, i) => { if (el.type !== 'E') interactive.push({ el, index: i }) })

  // 主轴（最高阶 C 真轴）— 排序置顶
  const principal = findPrincipal(elements)

  // 按「共轭类」（el.name 专业类名，如 σᵥ/σd/σᵥ(xz)）分组，按点群判断规则排序
  const groupMap = new Map()
  const order = []
  interactive.forEach(({ el, index }) => {
    const key = el.name || singleElementName(el.type)
    if (!groupMap.has(key)) {
      const rank = typeRank(el.type, el.order || 0, !!principal && el.type === principal.el.type)
      groupMap.set(key, { className: key, type: el.type, rank, count: 0, items: [] })
      order.push(key)
    }
    const g = groupMap.get(key)
    g.count++
    g.items.push({ el, index })
  })
  order.sort((a, b) => groupMap.get(a).rank - groupMap.get(b).rank)

  for (const className of order) {
    const g = groupMap.get(className)
    const color = getSymmetryElementColor(g.type)

    // 组头（点击折叠/展开）
    const header = document.createElement('div')
    header.className = 'elem-group-header'
    header.title = typeHint(g.type)
    const dot = document.createElement('span')
    dot.className = 'elem-dot'
    dot.style.background = color
    const nameSpan = document.createElement('span')
    nameSpan.textContent = className
    const count = document.createElement('span')
    count.className = 'elem-count'
    count.textContent = `×${g.count}`
    const arrow = document.createElement('span')
    arrow.className = 'elem-arrow'
    arrow.textContent = '▸'
    header.append(dot, nameSpan, count, arrow)

    // 组体（默认折叠，展开后每个个体 checkbox + 播放按钮）
    const body = document.createElement('div')
    body.className = 'elem-group-body'
    body.hidden = true
    for (const { el, index } of g.items) {
      const row = document.createElement('div')
      row.className = 'elem-item'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = el.defaultVisible !== false
      const lab = document.createElement('span')
      lab.className = 'elem-label'
      lab.textContent = el.label || singleElementName(el.type)
      // 播放按钮：仅当前可见（勾选）的行显示，隐藏行预留同尺寸占位
      const play = document.createElement('button')
      play.className = 'elem-play'
      play.textContent = '▶'
      play.title = t('anim.playTitle')
      const setPlayVisible = () => { play.style.visibility = cb.checked ? 'visible' : 'hidden' }
      setPlayVisible()
      play.addEventListener('click', (e) => {
        e.stopPropagation()
        if (callbacks.onPlay) callbacks.onPlay(index)
      })
      cb.addEventListener('change', () => {
        if (callbacks.onToggle) callbacks.onToggle(index, cb.checked)
        setPlayVisible()
      })
      row.append(cb, lab, play)
      body.appendChild(row)
    }

    header.addEventListener('click', () => {
      body.hidden = !body.hidden
      arrow.textContent = body.hidden ? '▸' : '▾'
    })

    listEl.appendChild(header)
    listEl.appendChild(body)
  }

  // ==================== 特征标表（默认折叠） ====================
  renderCharacterTable(info.characterTable, callbacks)
}

/**
 * 渲染特征标表折叠区
 * @param {Object|null} ct - { classes, irreps } 或 null
 */
function renderCharacterTable(ct, callbacks = {}) {
  const wrap = document.getElementById('character-table-wrap')
  if (!wrap) return
  wrap.innerHTML = ''

  if (!ct) {
    wrap.style.display = 'none'
    return
  }
  wrap.style.display = 'block'

  const header = document.createElement('div')
  header.className = 'ct-header'
  header.textContent = t('ct.title') + ' ▸'
  const body = document.createElement('div')
  body.className = 'ct-body'
  body.hidden = true
  header.addEventListener('click', () => {
    body.hidden = !body.hidden
    header.textContent = t('ct.title') + ' ' + (body.hidden ? '▸' : '▾')
  })

  // 表格
  const table = document.createElement('table')
  table.className = 'ct-table'
  const thead = document.createElement('thead')
  const htr = document.createElement('tr')
  const th0 = document.createElement('th')
  th0.textContent = t('ct.irreps')
  htr.appendChild(th0)
  for (const cls of ct.classes) {
    const th = document.createElement('th')
    th.innerHTML = formatClassSymbol(cls)
    htr.appendChild(th)
  }
  const thBasis = document.createElement('th')
  thBasis.textContent = t('ct.linear')
  htr.appendChild(thBasis)
  const thQuad = document.createElement('th')
  thQuad.textContent = t('ct.quad')
  htr.appendChild(thQuad)
  thead.appendChild(htr)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  for (const irrep of ct.irreps) {
    const tr = document.createElement('tr')
    const tdLabel = document.createElement('td')
    tdLabel.className = 'ct-irrep'
    tdLabel.innerHTML = formatIrrepLabel(irrep.label)
    tr.appendChild(tdLabel)
    for (const ch of irrep.characters) {
      const td = document.createElement('td')
      td.textContent = ch
      tr.appendChild(td)
    }
    const tdLinear = document.createElement('td')
    tdLinear.className = 'ct-basis'
    tdLinear.textContent = irrep.linear || ''
    tr.appendChild(tdLinear)
    const tdQuad = document.createElement('td')
    tdQuad.className = 'ct-basis'
    tdQuad.textContent = irrep.quadratic || ''
    tr.appendChild(tdQuad)
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)

  body.appendChild(table)
  wrap.appendChild(header)
  wrap.appendChild(body)
}
