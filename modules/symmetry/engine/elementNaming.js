/**
 * 对称元素命名模块
 * 依据特征标表风格为对称元素提供：单元素名（行标签 / 3D Sprite）、类符号（组头）。
 * 需求：不区分同一共轭类内的多个元素（不加撇），仅按特征标表类命名；
 *       单元素名用 Unicode 下标（C₂/S₄/σᵥ），兼容 3D Sprite（canvas 无法用 HTML <sub>）。
 */

/** 单元素特征标表名（Unicode 下标；d/h 无稳定下标码位，用正体小写） */
const SINGLE_NAMES = {
  'C2': 'C₂', 'C3': 'C₃', 'C4': 'C₄', 'C5': 'C₅', 'C6': 'C₆',
  'S3': 'S₃', 'S4': 'S₄', 'S5': 'S₅', 'S6': 'S₆', 'S8': 'S₈', 'S10': 'S₁₀', 'C∞': 'C∞', 'S∞': 'S∞',
  'sigma': 'σ', 'sigma_v': 'σᵥ', 'sigma_d': 'σd', 'sigma_h': 'σh',
  'i': 'i', 'E': 'E'
}

/**
 * 单元素名（供行标签 / 3D Sprite）
 * @param {string} type - 对称元素类型（'C2'/'sigma_v'/'i' 等）
 * @returns {string}
 */
export function singleElementName(type) {
  return SINGLE_NAMES[type] || type
}

/**
 * 对称元素的**稳定 key 清单**（按给定顺序）。
 *
 * ★ 这套 key 是**模块与页面之间的约定**：模型下发 `setElementVisible({key})` 时用它
 *   指认"哪一个"，页面用它把 key 对到场景里的对象。**必须只有这一处定义**——
 *   两边各写一份的话，一个小差别（比如 `#` 与 `_`）会让模型关掉 A 而页面去关 B，
 *   而且**不报错**。
 *
 * ★ 为什么不用数组下标：下标是**临时 id**——水换成氨之后 index 3 指的东西完全不同。
 *   把它交给模型等于让它编造 id（CLAUDE.md §一.2 明令禁止）。
 *
 * @param {Array} elements 识别出的元素数组（顺序即显示顺序）
 * @returns {Array<{key:string,label:string,type:string,order:number}>}
 */
export function elementKeyList(elements) {
  const counts = {}
  return (elements || []).map((el) => {
    const t = el.type || 'unknown'
    counts[t] = (counts[t] || 0) + 1
    return {
      key: `${t}#${counts[t]}`,
      label: el.labelPlain || el.label || singleElementName(t),
      type: t,
      order: el.order || 1,
    }
  })
}

/**
 * **默认显隐策略**：某点群下默认应显示哪些对称元素（返回 key 的集合）。
 *
 * ★ 为什么它在模块里而不在页面里（2026-10-01 搬过来）：
 *   这是 `(点群符号, 元素列表)` 的**纯函数**，属于"对称元素讲什么"的语义，
 *   与 DOM 无关。原先它在 `pages/symmetry.js` 里——于是"默认显示哪些"
 *   这个事实**页面独占**，模块不知道；而显示状态一旦要由模块持有（模型要能驱动），
 *   两者必然打架：模块说"显示"，页面的默认策略说"藏起来"。
 *
 * 规则（沿用页面里的既有策略，未做改动）：
 *   · 有主轴的群 → 只显示主轴（教学上先看主轴，其余逐个打开）
 *   · Cs → 显示反映面；Ci → 显示反演中心；Sn 群 → 显示旋反轴
 *   · T/O/I 高阶群无单一主轴 → 全部显示
 *
 * @param {string} symbol 点群符号
 * @param {Array} elements 元素数组
 * @returns {Set<string>} 默认可见的 key
 */
export function defaultVisibleKeys(symbol, elements) {
  const keys = elementKeyList(elements)
  const visible = new Set()
  const addWhere = (pred) => {
    for (let i = 0; i < keys.length; i++) if (pred(elements[i], i)) visible.add(keys[i].key)
  }
  // 有主轴 → 只显示主轴（其余让学生逐个打开，教学上是"先看清主轴"）
  const p = findPrincipal(elements)
  if (p && keys[p.index]) { visible.add(keys[p.index].key); return visible }
  if (symbol === 'Cs') { addWhere((el) => String(el.type).startsWith('sigma')); return visible }
  if (symbol === 'Ci') { addWhere((el) => el.type === 'i'); return visible }
  if (symbol && String(symbol).startsWith('S')) { addWhere((el) => String(el.type).startsWith('S')); return visible }
  // T/O/I 高阶群：无单一主轴，全部显示
  for (const k of keys) visible.add(k.key)
  return visible
}

/**
 * 类符号（信息面板组头）：同 type 数量 + 单元素名，count>1 时前置数字前缀
 * 如 3σᵥ、2C₄、C₂、i；count=1 时不带数字（特征标表对单元素类不带前缀）
 * @param {string} type - 对称元素类型
 * @param {number} count - 该 type 元素数量
 * @returns {string}
 */
export function getElementClassName(type, count) {
  const name = singleElementName(type)
  return count > 1 ? `${count}${name}` : name
}

/**
 * 元素类型排序权重（点群判断规则顺序，小者在前）
 * 主轴 → σh → ⊥C2 / 旋反轴 → σv → σd → 反演中心 i
 * @param {string} type - 对称元素类型
 * @param {number} order - 阶数（用于 C 轴按阶数高者优先）
 * @param {boolean} isPrincipal - 是否为主轴（强制排最前）
 * @returns {number}
 */
export function typeRank(type, order = 0, isPrincipal = false) {
  if (isPrincipal) return 0
  if (type === 'C∞') return 0
  if (type === 'E') return 9           // 恒等元素：平凡群仅含此项，置于主轴区之后
  if (type === 'i') return 400
  if (type.startsWith('sigma')) {
    if (type === 'sigma_h') return 100
    if (type === 'sigma_d') return 250
    return 200                       // sigma_v / sigma
  }
  if (type.startsWith('S')) return 150  // 旋反轴（S4/S6/S8）
  if (type.startsWith('C')) return 50 - order  // 阶数越大 rank 越小 → 高阶轴在前
  return 300
}

// ==================== 专业命名精修（σh / σv / σd、C2′/C2″、坐标标注） ====================

import { CHARACTER_TABLES } from './characterTables.js'

function vecNorm(v) {
  const n = Math.hypot(v[0], v[1], v[2])
  return n < 1e-12 ? null : [v[0] / n, v[1] / n, v[2] / n]
}
function vAngle(a, b) {
  const na = Math.hypot(a[0], a[1], a[2]), nb = Math.hypot(b[0], b[1], b[2])
  if (na < 1e-12 || nb < 1e-12) return 0
  const dot = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (na * nb)
  return Math.acos(Math.max(-1, Math.min(1, Math.abs(dot))))
}
function vCross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** 数字→Unicode 下标（C₄/C₂/S₄） */
function subNum(n) {
  const m = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' }
  return String(n).split('').map(c => m[c] || c).join('')
}

/** 把方向 x 经"最小旋转 a→b"变换后的向量（Rodrigues） */
function rotateDirTo(a, b, x) {
  const u = vecNorm(a), v = vecNorm(b)
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
  const ax = vCross(u, v), s = Math.hypot(...ax)
  if (s < 1e-9) return [x[0], x[1], x[2]]
  const c = dot, sin = s
  const k = ax.map(t => t / s)
  const kx = vCross(k, x), kd = k[0] * x[0] + k[1] * x[1] + k[2] * x[2]
  return [
    x[0] * c + kx[0] * sin + k[0] * kd * (1 - c),
    x[1] * c + kx[1] * sin + k[1] * kd * (1 - c),
    x[2] * c + kx[2] * sin + k[2] * kd * (1 - c)
  ]
}

/** 点群特征标表类名是否含某子类（如 'σd'、'C2″'） */
function groupHasClass(symbol, sub) {
  const ct = CHARACTER_TABLES[symbol]
  return !!(ct && ct.classes.some(c => c.includes(sub)))
}

/** 在垂直主轴 P 的水平面内，沿 dir 方向（±）是否存在原子 */
function hasAtomAlong(atoms, center, P, dir, tolDeg = 15) {
  const tol = tolDeg * Math.PI / 180
  return atoms.some(a => {
    const d = [a.xyz[0] - center[0], a.xyz[1] - center[1], a.xyz[2] - center[2]]
    // 去掉沿主轴分量 → 水平投影
    const dotP = d[0] * P[0] + d[1] * P[1] + d[2] * P[2]
    const h = [d[0] - dotP * P[0], d[1] - dotP * P[1], d[2] - dotP * P[2]]
    if (Math.hypot(...h) < 1e-6) return false
    return vAngle(h, dir) < tol
  })
}

/**
 * 精修对称元素命名（专业、按特征标表惯例）：
 *  - σh：水平面；竖直面按"面内水平方向是否含原子"分 σv / σd；
 *  - 垂直 C2 轴按"轴向是否含原子"分 C2′ / C2″；
 *  - C2v 两个竖直面用坐标标注 σv(xz)/σv(yz)；D2/D2h 用坐标标注 C2(x)…、σ(xy)…；
 *  - 高阶群（T/O/I）与无主轴群用固定表。
 * @returns {Array} 元素数组（每项带 el.name，el.type 已按判定修正为 sigma_v/sigma_d）
 */
export function refineSymmetryElements(symbol, elements, atoms, center) {
  const HIGH = ['T', 'Td', 'Th', 'O', 'Oh', 'I', 'Ih']
  const COORD = ['D2', 'D2h']
  const isHigh = HIGH.includes(symbol)

  // 主轴 = 最高阶 C 轴方向（高阶群无单一主轴，绕过）
  let P = null
  let best = -1
  for (const el of elements) {
    if (isHigh) break
    if (!el.type || !el.type.startsWith('C') || !el.axis) continue
    const o = el.order === Infinity ? 99 : (el.order || 0)
    if (o > best) { best = o; P = vecNorm(el.axis) }
  }

  const nameOf = (el) => {
    if (el.type === 'i') return 'i'
    if (el.type.startsWith('sigma')) {
      const n = vecNorm(el.axis)
      if (!n) return 'σ'
      if (isHigh) {                                   // 高阶群：Ih/I→σ；Oh→坐标法向 σh / 对角 σd
        if (symbol === 'Ih' || symbol === 'I') return 'σ'
        const isCoord = Math.abs(n[0]) > 0.9 || Math.abs(n[1]) > 0.9 || Math.abs(n[2]) > 0.9
        return (groupHasClass(symbol, 'σh') && isCoord) ? 'σh' : 'σd'
      }
      if (COORD.includes(symbol)) {                    // D2/D2h 坐标 σ(xy)/σ(xz)/σ(yz)
        if (Math.abs(n[2]) > 0.7) return 'σ(xy)'
        if (Math.abs(n[1]) > 0.7) return 'σ(xz)'
        if (Math.abs(n[0]) > 0.7) return 'σ(yz)'
      }
      if (P && vAngle(n, P) < 0.1) return 'σh'        // 水平面（法向∥主轴）
      if (!P) return 'σ'                               // 无主轴（Cs 等）：单面，无 σv/σd 之分
      if (symbol === 'C2v' && P) {                     // C2v 坐标：把面法向旋到"主轴→z"约定系再判 x/y
        const np = rotateDirTo(P, [0, 0, 1], n)
        return (Math.abs(np[0]) >= Math.abs(np[1])) ? 'σᵥ(yz)' : 'σᵥ(xz)'
      }
      const inPlane = vecNorm(vCross(n, P))
      const hasAtom = inPlane != null && hasAtomAlong(atoms, center, P, inPlane)
      const hasV = groupHasClass(symbol, 'σv'), hasD = groupHasClass(symbol, 'σd')
      if (hasV && hasD) return hasAtom ? 'σᵥ' : 'σd'
      if (hasV) return 'σᵥ'
      if (hasD) return 'σd'
      return hasAtom ? 'σᵥ' : 'σd'
    }
    if (el.type.startsWith('C')) {
      const a = vecNorm(el.axis)
      if (!a) return 'C'
      if (COORD.includes(symbol)) {                    // D2/D2h：三条 C2 全部坐标标注
        if (Math.abs(a[0]) > 0.7) return 'C₂(x)'
        if (Math.abs(a[1]) > 0.7) return 'C₂(y)'
        if (Math.abs(a[2]) > 0.7) return 'C₂(z)'
      }
      if (P && vAngle(a, P) > 0.1) {                  // 垂直 C2
        const hasAtom = hasAtomAlong(atoms, center, P, a)
        const hasPrime = groupHasClass(symbol, 'C2′'), hasDPrime = groupHasClass(symbol, 'C2″')
        if (hasPrime && hasDPrime) return hasAtom ? 'C₂′' : 'C₂″'
        if (hasPrime) return 'C₂′'
        if (hasDPrime) return 'C₂″'
      }
      return 'C' + (el.order === Infinity ? '∞' : subNum(parseInt(el.type.slice(1), 10)))
    }
    if (el.type.startsWith('S')) {
      const o = el.type.slice(1)
      return o === '∞' ? 'S∞' : 'S' + subNum(parseInt(o, 10))
    }
    return el.type
  }

  // 先给基础名，再按"同 name 视为同共轭类"加同类序号 (n)；type 依名称修正（σh/σv/σd）
  const named = elements.map(el => {
    const name = nameOf(el)
    let type = el.type
    if (name === 'σh') type = 'sigma_h'
    else if (name.startsWith('σ') && name.includes('d')) type = 'sigma_d'
    else if (name.startsWith('σ')) type = 'sigma_v'
    return { ...el, type, name, labelPlain: name }
  })
  const countByName = {}
  for (const el of named) countByName[el.name] = (countByName[el.name] || 0) + 1
  const seenByName = {}
  return named.map(el => {
    const total = countByName[el.name] || 1
    let label = el.name
    if (total > 1) {
      const k = (seenByName[el.name] || 0) + 1
      seenByName[el.name] = k
      label = `${el.name}(${k})`
    }
    return { ...el, label }
  })
}

// ==================== 共轭类命名（需求：不同共轭类不同名，同类多元素加 (n)） ====================

function normVec(v) {
  const n = Math.hypot(v[0], v[1], v[2])
  return n < 1e-12 ? [0, 0, 0] : [v[0] / n, v[1] / n, v[2] / n]
}

/** 两方向夹角（含反向取较小者，轴/面法向无向） */
function angleBetween(a, b) {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2])
  const na = Math.hypot(a[0], a[1], a[2])
  const nb = Math.hypot(b[0], b[1], b[2])
  if (na < 1e-12 || nb < 1e-12) return 0
  return Math.acos(Math.max(-1, Math.min(1, dot / (na * nb))))
}

/** 用 3×3 矩阵作用于方向向量 */
function applyDir(m, dir) {
  return [
    m[0] * dir[0] + m[1] * dir[1] + m[2] * dir[2],
    m[3] * dir[0] + m[4] * dir[1] + m[5] * dir[2],
    m[6] * dir[0] + m[7] * dir[1] + m[8] * dir[2]
  ]
}

/**
 * 按共轭类为对称元素分配标签：
 *  - 同一共轭类内多个元素 → base(1)、base(2)…
 *  - 同基名但多个不同共轭类 → 用撇号区分（σᵥ、σᵥ′、σᵥ″）
 *  - 单个元素不加任何后缀
 * @param {Array} elements - [{ type, axis }]
 * @param {Array} ops - 群操作 [{ matrix, name }]（groupOperations.generateGroupOperations 输出）
 * @returns {Array} 带 label/labelPlain 的元素数组
 */
export function assignConjugateLabels(elements, ops, tolDeg = 5) {
  const tolRad = tolDeg * Math.PI / 180
  const classes = []              // { type, members:[idx] }
  const classId = new Array(elements.length).fill(-1)

  elements.forEach((el, idx) => {
    if (el.type === 'i' || !el.axis) {
      classId[idx] = classes.length
      classes.push({ type: el.type, members: [idx] })
      return
    }
    const dir = normVec(el.axis)
    for (let ci = 0; ci < classes.length; ci++) {
      const c = classes[ci]
      if (c.type !== el.type || c.type === 'i') continue
      // 若 el 的方向可由某 class 成员方向经群操作搬运得到，则二者共轭（同类）
      const conj = c.members.some(mi => {
        const md = normVec(elements[mi].axis)
        return ops.some(op => angleBetween(applyDir(op.matrix, md), dir) < tolRad)
      })
      if (conj) { c.members.push(idx); classId[idx] = ci; return }
    }
    classId[idx] = classes.length
    classes.push({ type: el.type, members: [idx] })
  })

  // 同基名（type）多个共轭类 → 类用撇号区分；类内多元素用 (k)
  const tSeen = {}
  const classNumber = {}
  classes.forEach((c, ci) => {
    const t = tSeen[c.type] || 0
    tSeen[c.type] = t + 1
    classNumber[ci] = t
  })
  const memberK = {}
  return elements.map((el, idx) => {
    const ci = classId[idx]
    const c = classes[ci]
    const base = singleElementName(c.type)
    const t = classNumber[ci]
    const classLabel = base + (t > 0 ? "'".repeat(t) : '')
    const within = (memberK[ci] || 0) + 1
    memberK[ci] = within
    const label = c.members.length > 1 ? `${classLabel}(${within})` : classLabel
    return { ...el, label, labelPlain: base }
  })
}

/**
 * 在元素数组中查找主轴（最高阶 C 真轴，含 C∞）
 * @param {Array} elements - [{ type, order, ... }]
 * @returns {{ el: Object, index: number }|null}
 */
export function findPrincipal(elements) {
  let best = null
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (!el.type || !el.type.startsWith('C')) continue
    if (!best || (el.order || 0) > (best.el.order || 0)) best = { el, index: i }
  }
  return best
}
