/**
 * home-visuals.js — 首页视觉引擎的**纯计算层**（没有任何 DOM 依赖）
 *
 * ★ 为什么把这层单独拆出来：
 *   首页要画五块画布（背景晶格 / 主视觉全息 / 三张模块演示卡）。画布代码在
 *   `home.js` 里，但"点云从哪来、多面体有几条棱、投影公式对不对"是**可测的数学**——
 *   而 Canvas 渲染本身在 Node 里测不了。把数学抽到这里，守卫
 *   （apps/web/tools/test-home-visuals.mjs）就能在无头环境里**独立重算**每条几何事实：
 *   立方八面体 12 顶点 24 棱、C-H 键长与 109.47°、轨道点云的相位与半径、投影的不变量。
 *   渲染层则交给真实浏览器截图验证（tools/screenshot.mjs + QA 脚本）。
 *
 * ★ 为什么不用 three.js：
 *   首页只需要"点 / 线 / 光晕"这三种图元，而 three 会把一个 WebGL 上下文、着色器编译
 *   和上百 KB 运行时拖进首屏。Canvas2D 的加色混合（globalCompositeOperation = 'lighter'）
 *   在深色底上做发光点阵反而更可控，也没有"软件渲染下 WebGL 起不来"的风险。
 *   本文件因此只有纯数学，一个 `three` 符号都不出现。
 *
 * ★ 坐标约定（全文件统一，别处不要再定义第二套）：
 *   · 世界坐标 y 轴向上；相机在 +z 方向，朝原点看
 *   · `rotateXYZ(p, ax, ay)` 先绕世界 Y 轴转 ay（偏航），再绕相机 X 轴转 ax（俯仰）
 *   · `project()` 返回**画布像素坐标**与深度；深度越小的点越靠近相机（越亮）
 *   · 所有几何体都归一化到半径 ≈ 1 的单位球内，尺寸由渲染层的 focal 决定
 */

export const TAU = Math.PI * 2

/** 四面体的 4 个顶点方向（正四面体） */
const TETRA_DIRS = [
  [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1],
]

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
export function lerp(a, b, t) { return a + (b - a) * t }
export function clamp01(v) { return clamp(v, 0, 1) }

/** 单位化；零向量返回 null（调用方一律要处理"没有方向"的情况，别让它静默变 NaN） */
export function normalize(v) {
  const n = Math.hypot(v[0], v[1], v[2])
  if (!(n > 1e-12)) return null
  return [v[0] / n, v[1] / n, v[2] / n]
}

export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
export function length(v) { return Math.hypot(v[0], v[1], v[2]) }

/** 两个方向之间的夹角（弧度；用 |a||b| 防越界，acos 才不会返回 NaN） */
export function angleBetween(a, b) {
  const na = length(a), nb = length(b)
  if (!(na > 1e-12) || !(nb > 1e-12)) return NaN
  return Math.acos(clamp(dot(a, b) / (na * nb), -1, 1))
}

/**
 * 把世界坐标点转到相机坐标：先绕 Y（偏航 ay），再绕 X（俯仰 ax）。
 * ★ 旋转顺序写在这里**一处**，所有渲染函数共用 —— 两个地方各写一套，
 *   就会出现"背景晶格与主视觉转的方向不一样"这种只有动起来才看得出的缺陷。
 */
export function rotateXYZ(p, ax, ay) {
  const cy = Math.cos(ay), sy = Math.sin(ay)
  const cx = Math.cos(ax), sx = Math.sin(ax)
  const x1 = p[0] * cy + p[2] * sy
  const z1 = -p[0] * sy + p[2] * cy
  const y2 = p[1] * cx - z1 * sx
  const z2 = p[1] * sx + z1 * cx
  return [x1, y2, z2]
}

/**
 * 透视投影。
 *
 * @param {number[]} p 相机坐标下的点（先过 `rotateXYZ`）
 * @param {{w:number,h:number,focal:number,dist:number}} cam
 * @returns {{x:number,y:number,depth:number,scale:number}|null}
 *          点落在相机后方（depth <= 1e-6）时返回 null，而不是给出一个镜像坐标。
 */
export function project(p, cam) {
  const depth = cam.dist - p[2]
  if (!(depth > 1e-6) || !Number.isFinite(depth)) return null
  const scale = cam.focal / depth
  return {
    x: cam.w / 2 + p[0] * scale,
    y: cam.h / 2 - p[1] * scale,
    depth,
    scale,
  }
}

/** 确定性伪随机（mulberry32）：同一种子每次刷新得到同一片星空 —— 截图可比对 */
export function createPRNG(seed) {
  let a = (seed >>> 0) || 1
  return function rand() {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 斜面投影 / 斜投影（cabinet projection）—— 化工与教材插图最常用的"晶胞"画法。
 *
 * ★ 为什么不用透视：2026-10-17 用户贴了一张教材里的 NaCl 晶胞图，说"最好做成这种视图，
 *   化学家喜欢用这种视图"。那种图的特征是：**正面是正方形、平行线永远平行**（正交投影），
 *   深度轴朝右上约 35–45°、长度缩短一半左右（cabinet）。透视投影会让近面大、远面小，
 *   小卡片里看起来就像"歪的笼子"。
 *
 * ★ 与 `rotateXYZ + project` 的区别：那套是"相机旋转 + 透视"，适合全息主视觉；
 *   这套是**作图法**，正面不变形、深度方向固定，是教科书插图的语言。
 *
 * @param {number[]} p 世界坐标 [x, y, z]（y 向上；+z 向屏幕里/右上）
 * @param {{cx:number, cy:number, scale:number, alpha?:number, depth?:number}} opts
 *        alpha = 深度轴与屏幕水平方向的夹角（默认 38°）；depth = 深度缩短系数（默认 0.5）
 * @returns {{x:number, y:number, depth:number}} depth 越大越远（画家算法先画远的）
 */
export function projectOblique(p, opts) {
  const cx = opts.cx || 0
  const cy = opts.cy || 0
  const scale = opts.scale || 1
  const alpha = typeof opts.alpha === 'number' ? opts.alpha : 0.6632251   // 38°
  const depth = typeof opts.depth === 'number' ? opts.depth : 0.5
  return {
    x: cx + (p[0] + p[2] * Math.cos(alpha) * depth) * scale,
    y: cy - (p[1] + p[2] * Math.sin(alpha) * depth) * scale,
    depth: p[2],
  }
}

/**
 * 球坐标网格（纬线 + 经线）—— 主视觉的"参考坐标系"，与 ψ(r,θ,φ) 的坐标一一对应。
 *
 * ★ 为什么用它替换原来的"随便倾斜的三条轨道环"：用户的第 2 条反馈是"右上角的图文对应吗"。
 *   球坐标网格的每一条线都确实对应一个 (θ, φ)，HUD 上写 θ、φ 时就不是装饰了。
 *   其中 θ = 54.74° / 125.26° 两条纬线正好是 d_z² 的**节锥**与球面的交线（3cos²θ−1 = 0）。
 *
 * @param {{latitudes?:number[], meridians?:number[], steps?:number}} [opts] 角度单位为度
 * @returns {{latitudes:number[][][], meridians:number[][][]}} 每条线是一串 [x,y,z] 点
 */
export function createSphericalCage(opts = {}) {
  const latDeg = opts.latitudes || [30, 54.7356, 90, 125.2644, 150]
  const merDeg = opts.meridians || [0, 45, 90, 135]
  const steps = Math.max(12, opts.steps || 72)
  const toRad = Math.PI / 180
  const latitudes = latDeg.map((deg) => {
    const th = deg * toRad
    const z = Math.cos(th)
    const r = Math.sin(th)
    const line = []
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * TAU
      line.push([r * Math.cos(a), r * Math.sin(a), z])
    }
    return line
  })
  const meridians = merDeg.map((deg) => {
    const phi = deg * toRad
    const dx = Math.cos(phi)
    const dy = Math.sin(phi)
    const line = []
    for (let i = 0; i <= steps; i++) {
      const th = (i / steps) * TAU
      line.push([Math.sin(th) * dx, Math.sin(th) * dy, Math.cos(th)])
    }
    return line
  })
  return { latitudes, meridians }
}

/**
 * d_z² 的节锥（nodal cones）：3cos²θ − 1 = 0 的两个解。
 *
 * ★ 这是"真算出来的"几何：θ₀ = arccos(1/√3) ≈ 54.7356°，绕 ±z 各一个圆锥面。
 *   锥面与单位球面的交线是两条纬线（z = ±1/√3），从原点出发的母线是锥面的直纹。
 *   主视觉里把它画成线框，HUD 上写 54.74° / 125.26° —— 图文严格对应。
 *
 * @param {number} [thetaDeg] 半锥角（默认 arccos(1/√3)）
 * @param {{generatrices?:number, steps?:number}} [opts]
 * @returns {{thetaDeg:number, z:number, radius:number,
 *            cones:Array<{sign:number, circle:number[][], lines:Array<number[][]>}>}}
 */
export function createNodalCones(thetaDeg, opts = {}) {
  const deg = typeof thetaDeg === 'number' ? thetaDeg : 54.735610317245346
  const th = deg * Math.PI / 180
  const z0 = Math.cos(th)
  const r0 = Math.sin(th)
  const gens = Math.max(3, opts.generatrices || 12)
  const steps = Math.max(12, opts.steps || 72)
  const cones = [1, -1].map((sign) => {
    const circle = []
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * TAU
      circle.push([r0 * Math.cos(a), r0 * Math.sin(a), sign * z0])
    }
    const lines = []
    for (let i = 0; i < gens; i++) {
      const a = (i / gens) * TAU
      lines.push([[0, 0, 0], [r0 * Math.cos(a), r0 * Math.sin(a), sign * z0]])
    }
    return { sign, circle, lines }
  })
  return { thetaDeg: deg, z: z0, radius: r0, cones }
}

/**
 * 甲烷（CH4，Td）的球棍模型 + 对称元素。
 *
 * ★ 为什么是甲烷：它是点群模块的默认分子（Td · 群阶 24），也是轨道页 sp³ 那一段的
 *   教科书例子。首页卡片画它，与两个模块的口径一致。
 *
 * @param {{bond?:number}} [opts] 键长（默认 1；渲染层再按 focal 缩放）
 * @returns {{
 *   atoms:Array<{x:number,y:number,z:number,el:'C'|'H'}>,
 *   bonds:number[][], hEdges:number[][],
 *   axes:Array<{dir:number[],label:string}>
 * }}
 */
export function createMethane() {
  const bond = 1
  const dirs = TETRA_DIRS.map((d) => normalize(d))
  const atoms = [{ x: 0, y: 0, z: 0, el: 'C' }]
  for (const d of dirs) atoms.push({ x: d[0] * bond, y: d[1] * bond, z: d[2] * bond, el: 'H' })
  // 键：C(0)–H(1..4)
  const bonds = [[0, 1], [0, 2], [0, 3], [0, 4]]
  // 四面体的 6 条 H–H 棱（画得很淡，用来"看见"四面体本身）
  const hEdges = []
  for (let i = 1; i <= 4; i++) for (let j = i + 1; j <= 4; j++) hEdges.push([i, j])
  // 对称元素：4 条 C₃ 轴 = C→H 方向（甲烷中每根 C-H 键都在一根 C₃ 轴上）。
  // ★ 不画 C₂/σd：卡片尺寸下画多了只会糊成一团；C₃ 是学生最先要认的那个。
  const axes = dirs.map((d) => ({ dir: d, label: 'C₃' }))
  return { atoms, bonds, hEdges, axes, bond }
}

/**
 * 岩盐型（NaCl，Fm3̄m）晶胞点阵。
 *
 * ★ 表示方式：3×3×3 个格点，按 (i+j+k) 奇偶分成两套互穿的面心立方 —— 这正是
 *   NaCl 结构的"两种离子交替排列"（也是 CsCl 型在简单立方上的可视化差别所在）。
 *   相邻格点（沿 x/y/z 相距 1）之间连键，画的都是最近邻 Na–Cl 接触。
 *
 * @param {{n?:number}} [opts] n = 每边格点数（默认 3，即一个完整晶胞 + 边界原子）
 * @returns {{nodes:Array<{x:number,y:number,z:number,kind:0|1}>, edges:number[][], half:number}}
 */
export function createLatticeScene(opts = {}) {
  const n = Math.max(2, Math.min(5, opts.n || 3))
  const half = (n - 1) / 2
  const nodes = []
  const index = new Map()
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        index.set(i + ',' + j + ',' + k, nodes.length)
        nodes.push({
          x: i - half,
          y: j - half,
          z: k - half,
          kind: (i + j + k) % 2,
        })
      }
    }
  }
  const edges = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const a = index.get(i + ',' + j + ',' + k)
        if (i + 1 < n) edges.push([a, index.get((i + 1) + ',' + j + ',' + k)])
        if (j + 1 < n) edges.push([a, index.get(i + ',' + (j + 1) + ',' + k)])
        if (k + 1 < n) edges.push([a, index.get(i + ',' + j + ',' + (k + 1))])
      }
    }
  }
  // 归一化到半径 ~1（立方体对角半长 = half*√3，于是角上的点在单位球面上）
  const norm = half * Math.sqrt(3) || 1
  for (const p of nodes) { p.x /= norm; p.y /= norm; p.z /= norm }
  return { nodes, edges, half, size: n }
}

/**
 * 轨道电子云点云。
 *
 * ★ 这是"真算出来的形状"，不是一张贴图：给定球坐标方向，按该方向的角度函数取值作为
 *   半径采样点。所以 s / p_z / d_z² 的瓣数、节面方向都是数学事实 —— 学生看到的是
 *   与轨道页同一族函数（本函数只做角度部分，径向部分用"壳层内均匀采样"近似）。
 *
 * @param {'s'|'pz'|'dz2'|'dxy'} kind
 * @param {{count?:number, seed?:number, spread?:number}} [opts]
 *        spread = 0.65 表示点在 65%–100% 的半径范围内散布（让点云有体积感）
 * @returns {{kind:string, points:Array<{x:number,y:number,z:number,phase:number}>, maxRadius:number}}
 *          phase = +1 / -1（波函数符号）；s 轨道恒为 +1
 */
export function createOrbitalCloud(kind, opts = {}) {
  const count = Math.max(8, Math.min(2000, opts.count || 220))
  const spread = typeof opts.spread === 'number' ? clamp(opts.spread, 0.2, 0.98) : 0.7
  const rand = createPRNG(opts.seed || 7)
  const points = []
  let maxRadius = 0
  for (let i = 0; i < count; i++) {
    // 球面均匀采样：z 均匀，方位角均匀
    const z = rand() * 2 - 1
    const phi = rand() * TAU
    const rho = Math.sqrt(Math.max(0, 1 - z * z))
    const dir = [rho * Math.cos(phi), rho * Math.sin(phi), z]
    const ang = orbitalAngular(kind, dir)
    // 半径：角度函数绝对值 / 该函数的峰值（保证点云落在单位球内），再乘一个
    // 0.3–1 的随机厚度。★ 不除以峰值的话，d_z² 的 |3cos²θ−1| 最大是 2，
    //   点会被画到半径 2 处 —— 主视觉里那两瓣就会戳出全息环（测试里断言过 ≤ 1）。
    const r = (Math.abs(ang) / orbitalPeak(kind)) * (1 - spread + spread * Math.sqrt(rand()))
    const p = [dir[0] * r, dir[1] * r, dir[2] * r]
    points.push({ x: p[0], y: p[1], z: p[2], phase: ang >= 0 ? 1 : -1 })
    maxRadius = Math.max(maxRadius, r)
  }
  return { kind, points, maxRadius }
}

/**
 * 角度部分（未归一化；只关心形状与符号）。
 *   s   : 常数（球）
 *   pz  : cosθ  → 沿 z 的两个瓣
 *   dz2 : 3cos²θ − 1 → 沿 z 两个大瓣 + 赤道附近一圈负相位
 *   dxy : sin²θ·sin2φ → 四瓣（xy 平面内）
 */
export function orbitalAngular(kind, dir) {
  const x = dir[0], y = dir[1], z = dir[2]
  switch (kind) {
    case 's': return 1
    case 'pz': return z
    case 'dz2': return 3 * z * z - 1
    case 'dxy': {
      const rho = Math.hypot(x, y)
      if (rho < 1e-9) return 0
      return rho * rho * (2 * x * y) / (rho * rho)   // = 2xy，写成显式方向式便于读
    }
    default: return z
  }
}

/**
 * 每种角度函数在单位方向上的峰值（用来把点云归一化到单位球内）。
 *   s: 1 · p_z: |cosθ| ≤ 1 · d_z²: |3cos²θ−1| ≤ 2 · d_xy: |2xy| ≤ 1（单位球上）
 */
export function orbitalPeak(kind) {
  return kind === 'dz2' ? 2 : 1
}

/**
 * 背景"点阵尘埃"：半径 1.2–3.2 的球壳里撒点，给远景一层视差与纵深。
 * @returns {Array<{x:number,y:number,z:number,size:number,twinkle:number}>}
 */
export function createDust(opts = {}) {
  const count = Math.max(0, Math.min(600, opts.count || 140))
  const rand = createPRNG(opts.seed || 11)
  const out = []
  for (let i = 0; i < count; i++) {
    const z = rand() * 2 - 1
    const phi = rand() * TAU
    const rho = Math.sqrt(Math.max(0, 1 - z * z))
    const r = 1.2 + rand() * 2.0
    out.push({
      x: rho * Math.cos(phi) * r,
      y: z * r,
      z: rho * Math.sin(phi) * r,
      size: 0.5 + rand() * 1.6,
      twinkle: rand(),
    })
  }
  return out
}

/**
 * 背景立方晶格：n×n×n 个格点 + 最近邻连线，作为"晶体结构"的抽象底纹。
 * 与 `createLatticeScene` 的区别：这个只为了视觉纵深，不区分元素种类、不归一化到 1。
 *
 * @returns {{nodes:Array<{x:number,y:number,z:number}>, edges:number[][], size:number}}
 */
export function createBackgroundLattice(opts = {}) {
  const n = Math.max(2, Math.min(6, opts.n || 4))
  const spacing = opts.spacing || 1
  const half = (n - 1) / 2
  const nodes = []
  const index = new Map()
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        index.set(i + ',' + j + ',' + k, nodes.length)
        nodes.push({ x: (i - half) * spacing, y: (j - half) * spacing, z: (k - half) * spacing })
      }
    }
  }
  const edges = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const a = index.get(i + ',' + j + ',' + k)
        if (i + 1 < n) edges.push([a, index.get((i + 1) + ',' + j + ',' + k)])
        if (j + 1 < n) edges.push([a, index.get(i + ',' + (j + 1) + ',' + k)])
        if (k + 1 < n) edges.push([a, index.get(i + ',' + j + ',' + (k + 1))])
      }
    }
  }
  return { nodes, edges, size: n }
}

// ---------------------------------------------------------------------------
// 颜色
// ---------------------------------------------------------------------------

/**
 * 解析 CSS 颜色串。支持 #rgb / #rrggbb / rgb() / rgba()（以及 'transparent'）。
 * 解析失败返回 null —— 调用方据此回退到内置默认值，而不是把 NaN 写进画布。
 */
export function parseColor(str) {
  if (typeof str !== 'string') return null
  const s = str.trim()
  if (!s) return null
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  let m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) {
    const h = m[1]
    return {
      r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1,
    }
  }
  m = /^#([0-9a-f]{6})$/i.exec(s)
  if (m) {
    const h = m[1]
    return {
      r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1,
    }
  }
  m = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i.exec(s)
  if (m) {
    return {
      r: clamp(Math.round(+m[1]), 0, 255),
      g: clamp(Math.round(+m[2]), 0, 255),
      b: clamp(Math.round(+m[3]), 0, 255),
      a: m[4] === undefined ? 1 : clamp(+m[4], 0, 1),
    }
  }
  return null
}

/** { r,g,b } + alpha → 'rgba(...)' */
export function rgba(c, a) {
  const alpha = a == null ? (c.a == null ? 1 : c.a) : a
  return 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + clamp01(alpha).toFixed(3) + ')'
}

/** 两个颜色按 t 线性混合（用于按深度做远处的暗化） */
export function mixColor(a, b, t) {
  const k = clamp01(t)
  return {
    r: lerp(a.r, b.r, k),
    g: lerp(a.g, b.g, k),
    b: lerp(a.b, b.b, k),
    a: lerp(a.a == null ? 1 : a.a, b.a == null ? 1 : b.a, k),
  }
}

/**
 * 从 CSS 自定义属性里读出整套画布调色板。
 *
 * ★ 为什么颜色不写在 JS 里：深浅两套主题的颜色是 **CSS 令牌**（home.js 的样式里
 *   定义 --pt-*）。JS 再抄一份，切主题时画布就会"页面变了、画布没变"——本仓库
 *   在"两份调色板"上栽过（tokens.css 的第三套配色）。这里只做读取，真源永远在 CSS。
 *
 * @param {(name:string)=>string} getVar 返回 CSS 变量原始串的函数（通常是 getPropertyValue）
 * @param {{dark?:boolean}} [opts]
 */
export function createPalette(getVar, opts = {}) {
  const v = (name, fallback) => parseColor(getVar(name)) || parseColor(fallback) || { r: 255, g: 255, b: 255, a: 1 }
  return {
    dark: opts.dark !== false,
    cyan: v('--pt-cyan', '#5ad6ff'),
    violet: v('--pt-violet', '#a78bfa'),
    emerald: v('--pt-emerald', '#3fe0a4'),
    amber: v('--pt-amber', '#ffc46b'),
    // 轨道视界的经典正相位红（+ψ）；负相位继续用 cyan
    orbRed: v('--pt-orb-red', '#ff5f5f'),
    node: v('--pt-node', '#a8d8ff'),
    grid: v('--pt-grid', '#2a4a7a'),
    ink: v('--pt-ink', '#eaf2ff'),
    accent: v('--pt-accent', '#5ad6ff'),
    dim: v('--pt-dim', '#8fa6c8'),
    bg: v('--pt-bg', '#050a15'),
  }
}

export default {
  TAU, clamp, lerp, clamp01, normalize, dot, cross, length, angleBetween,
  rotateXYZ, project, projectOblique, createPRNG, createSphericalCage, createNodalCones,
  createMethane, createLatticeScene, createOrbitalCloud, orbitalAngular, createDust,
  createBackgroundLattice, parseColor, rgba, mixColor, createPalette,
}
