/**
 * 晶面几何（纯计算，无 Three.js / DOM 依赖）
 *
 * 用户 2026-10-25：在晶典在线中「显示晶面，可以输入米勒指数或向量 UV」。
 *
 * 两个约定（也写在控制面板提示里）：
 *   1. 向量模式按**晶面法向量**解释；允许只填 u、v 两个数，w 默认 0。
 *   2. 平面统一过晶胞中心 —— 显示的是该晶面族的取向与面间距，不是外部晶体表面。
 *
 * 米勒指数 (h k l) 的法向不是直接坐标：对任意晶系都要先转成倒易矢量
 *   g = h a* + k b* + l c*，且 d = 1 / |g|。
 * 若把 (hkl) 直接当笛卡尔向量，立方晶系碰巧看不出错，六方/单斜会立刻歪掉。
 */
import { fractionalToCartesian, getCellEdges } from './geometry-utils.js'

export const PLANE_MODE_MILLER = 'miller'
export const PLANE_MODE_VECTOR = 'vector'

const EPS = 1e-7

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const len = (a) => Math.sqrt(dot(a, a))
const isFiniteVec = (a) => !!a && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z)

/** 数字显示：避免 -0、过长小数 */
function fmtNum(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  if (Object.is(n, -0) || Math.abs(n) < 1e-12) return '0'
  return String(Math.round(n * 1e6) / 1e6)
}

function fmtTriplet(values, open, close) {
  return open + values.map(fmtNum).join(' ') + close
}

/** 晶胞三条基矢（分数基 → 笛卡尔） */
export function cellBasis(lattice) {
  const e1 = fractionalToCartesian([1, 0, 0], lattice)
  const e2 = fractionalToCartesian([0, 1, 0], lattice)
  const e3 = fractionalToCartesian([0, 0, 1], lattice)
  return { e1, e2, e3 }
}

/**
 * 解析用户输入。
 * 接受 `(1 1 1)`、`1,1,1`、`[1 1 0]`、`-1 1 0`、Unicode 负号等；
 * 不接受 `(111)` 这种无分隔连写（避免把 111 误读成一个指数）。
 *
 * @returns {{ok:boolean, values?:number[], error?:string}}
 *   error: 'format' | 'zero' | 'nonInteger'
 */
export function parsePlaneInput(text, mode) {
  const normalised = String(text == null ? '' : text)
    .replace(/[−–—]/g, '-')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/,/g, ' ')
  const tokens = normalised.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { ok: false, error: 'format' }
  let nums = []
  for (const token of tokens) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return { ok: false, error: 'format' }
    const n = Number(token)
    if (!Number.isFinite(n)) return { ok: false, error: 'format' }
    nums.push(n)
  }
  const isMiller = mode !== PLANE_MODE_VECTOR
  // 常见写法 (111)/(100) 去掉括号后是一个数字：米勒模式按 3 位拆成 h/k/l。
  // 只在"一个 3 位数"时拆，避免把普通多分量输入误拆。
  if (isMiller && nums.length === 1) {
    const token = tokens[0]
    if (/^[+-]?\d{3}$/.test(token)) {
      const sign = token[0] === '-' ? -1 : 1
      const digits = token.replace(/^[+-]/, '')
      nums = digits.split('').map((d, i) => (i === 0 ? sign * Number(d) : Number(d)))
    }
  }
  if (isMiller) {
    if (nums.length !== 3) return { ok: false, error: 'format' }
    if (!nums.every((n) => Number.isInteger(n))) return { ok: false, error: 'nonInteger' }
  } else {
    if (nums.length !== 2 && nums.length !== 3) return { ok: false, error: 'format' }
  }
  const values = nums.length === 3 ? nums.slice() : [nums[0], nums[1], 0]
  if (values.every((n) => Math.abs(n) < 1e-12)) return { ok: false, error: 'zero' }
  return { ok: true, values }
}

/**
 * 把输入解析成可直接绘制的晶面描述。
 *
 * @param {string} text 用户输入
 * @param {'miller'|'vector'} mode
 * @param {{a:number,b:number,c:number,alpha:number,beta:number,gamma:number}} lattice
 * @returns {{ok:boolean, error?:string, mode:string, values?:number[],
 *   normal?:{x:number,y:number,z:number}, label?:string, spacing?:number|null}}
 */
export function resolvePlane(text, mode, lattice) {
  const m = mode === PLANE_MODE_VECTOR ? PLANE_MODE_VECTOR : PLANE_MODE_MILLER
  const parsed = parsePlaneInput(text, m)
  if (!parsed.ok) return { ok: false, error: parsed.error, mode: m }
  if (!lattice || !isFiniteVec(fractionalToCartesian([1, 1, 1], lattice))) {
    return { ok: false, error: 'format', mode: m }
  }

  const { e1, e2, e3 } = cellBasis(lattice)
  const volume = dot(e1, cross(e2, e3))
  if (!Number.isFinite(volume) || Math.abs(volume) < 1e-12) {
    return { ok: false, error: 'noIntersect', mode: m, values: parsed.values }
  }

  let rawNormal
  let spacing = null
  let label
  if (m === PLANE_MODE_MILLER) {
    const [h, k, l] = parsed.values
    // 倒易基：a*·a = 1（不乘 2π，d = 1/|g| 的单位才是 Å）
    const aStar = scale(cross(e2, e3), 1 / volume)
    const bStar = scale(cross(e3, e1), 1 / volume)
    const cStar = scale(cross(e1, e2), 1 / volume)
    rawNormal = add(add(scale(aStar, h), scale(bStar, k)), scale(cStar, l))
    const gLen = len(rawNormal)
    if (!Number.isFinite(gLen) || gLen < 1e-12) return { ok: false, error: 'zero', mode: m }
    spacing = 1 / gLen
    label = fmtTriplet(parsed.values, '(', ')')
  } else {
    const [u, v, w] = parsed.values
    rawNormal = add(add(scale(e1, u), scale(e2, v)), scale(e3, w))
    label = fmtTriplet(parsed.values, '[', ']')
  }

  const nLen = len(rawNormal)
  if (!Number.isFinite(nLen) || nLen < 1e-12) return { ok: false, error: 'zero', mode: m }
  const normal = { x: rawNormal.x / nLen, y: rawNormal.y / nLen, z: rawNormal.z / nLen }
  return { ok: true, mode: m, values: parsed.values, normal, label, spacing }
}

/**
 * 过晶胞中心的平面与晶胞平行六面体的交线多边形（中心化笛卡尔坐标）。
 *
 * @param {{x:number,y:number,z:number}} normal 平面法向（可为任意长度非零向量）
 * @param {Object} lattice
 * @returns {Array<{x:number,y:number,z:number}>|null} 按绕法向顺序排列的凸多边形
 */
export function planeCellCrossSection(normal, lattice) {
  if (!isFiniteVec(normal)) return null
  const nLen = len(normal)
  if (!Number.isFinite(nLen) || nLen < 1e-12) return null
  const n = { x: normal.x / nLen, y: normal.y / nLen, z: normal.z / nLen }

  const center = fractionalToCartesian([0.5, 0.5, 0.5], lattice)
  const corners = []
  for (let i = 0; i <= 1; i++) {
    for (let j = 0; j <= 1; j++) {
      for (let k = 0; k <= 1; k++) {
        const p = fractionalToCartesian([i, j, k], lattice)
        corners.push({ x: p.x - center.x, y: p.y - center.y, z: p.z - center.z })
      }
    }
  }
  const edges = getCellEdges()
  const tol = EPS * Math.max(1, len({ x: corners[7].x, y: corners[7].y, z: corners[7].z }))
  const pts = []
  const addPoint = (p) => {
    if (!pts.some((q) => Math.abs(q.x - p.x) < tol && Math.abs(q.y - p.y) < tol && Math.abs(q.z - p.z) < tol)) {
      pts.push(p)
    }
  }

  for (const [ia, ib] of edges) {
    const a = corners[ia]
    const b = corners[ib]
    const da = dot(n, a)
    const db = dot(n, b)
    if (Math.abs(da) < tol) addPoint(a)
    if (Math.abs(db) < tol) addPoint(b)
    if (da * db < 0) {
      const t = da / (da - db)
      addPoint({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
    }
  }
  if (pts.length < 3) return null

  let cx = 0, cy = 0, cz = 0
  for (const p of pts) { cx += p.x; cy += p.y; cz += p.z }
  const c = { x: cx / pts.length, y: cy / pts.length, z: cz / pts.length }

  // 平面内的一组正交基；选与法向最不平行的坐标轴，避免叉积退化
  const axis = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  const u = cross(n, axis)
  const uLen = len(u)
  if (uLen < 1e-12) return null
  const uu = scale(u, 1 / uLen)
  const vv = cross(n, uu)
  const sorted = pts.slice().sort((p, q) => {
    const pa = Math.atan2(dot(sub(p, c), vv), dot(sub(p, c), uu))
    const qa = Math.atan2(dot(sub(q, c), vv), dot(sub(q, c), uu))
    return pa - qa
  })
  return sorted
}

export default { parsePlaneInput, resolvePlane, planeCellCrossSection, cellBasis }
