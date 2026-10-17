#!/usr/bin/env node
/**
 * test-home-visuals.mjs — 首页视觉引擎（home-visuals.js）的**纯数学守卫**
 *
 * ★ 为什么要这个文件：首页的五块画布在 Node 里画不出来（没有 Canvas），
 *   但"画出来的东西对不对"里有一半是**数学事实**，完全可以在无头环境里独立重算：
 *     · 甲烷的 C-H 键长是否相等、H-C-H 夹角是否 109.47°、C₃ 轴是否就是 C-H 方向？
 *     · 3d_z² 点云的相位符号是否真的等于 3cos²θ−1 的符号？节锥的 θ 是否是 arccos(1/√3)？
 *     · 教材式晶胞图的斜投影是否真的"平行线保持平行、深度缩短一半"？
 *     · 球坐标网格的点是否都在单位球面上（HUD 写 θ、φ 的前提）？
 *     · 投影在两套坐标系里是否自洽（原点落在画面中心、相机后方返回 null）？
 *     · 同一个随机种子是否给出同一片星空（截图可比对）？
 *   这些算错了，画面上**看不出来**（点云照样有形状），但教学上就是错的。
 *   渲染层（颜色、发光、布局）由真实浏览器截图验证（tools/screenshot.mjs + QA 脚本）。
 *
 * 用法：node apps/web/tools/test-home-visuals.mjs
 */
import {
  rotateXYZ, project, projectOblique, createPRNG, createSphericalCage,
  createNodalCones, createMethane, createLatticeScene, createOrbitalCloud,
  orbitalAngular, createDust, createBackgroundLattice, parseColor, rgba,
  mixColor, createPalette, angleBetween, length, normalize, TAU,
} from '../src/shell/pages/home-visuals.js'

let pass = 0
let fail = 0
const bad = []
function ok(cond, label, detail) {
  if (cond) { pass++; return true }
  fail++
  bad.push(label + (detail ? '（' + detail + '）' : ''))
  return false
}
function near(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps }

// ---------------------------------------------------------------------------
// ① 教材式斜投影（cabinet）：正面不变形、平行线保持平行
//
//   2026-10-17 用户贴了教材里的 NaCl 晶胞图："最好做成这种视图，化学家喜欢用这种视图"。
//   那种图是**正交/斜投影**，不是透视 —— 判据就是"平行线永远平行"。
// ---------------------------------------------------------------------------
{
  const opts = { cx: 100, cy: 60, scale: 50, alpha: 0.6632251, depth: 0.5 }
  const o = projectOblique([0, 0, 0], opts)
  ok(o.x === 100 && o.y === 60, '斜投影：原点落在中心')
  // 正面（z = 0）与正交投影一致：x 向右、y 向上（y 轴翻转在投影里做）
  const p0 = projectOblique([0.5, 0.25, 0], opts)
  ok(near(p0.x, 100 + 25) && near(p0.y, 60 - 12.5), '斜投影：z = 0 的正面不缩短（x 右、y 上）')
  // +z 朝右上偏移（教材的深度轴方向），depth 返回 z 供画家算法排序
  const pz = projectOblique([0, 0, 1], opts)
  ok(pz.x > 100 && pz.y < 60, '+z 朝右上（教材的深度轴方向）')
  ok(near(pz.depth, 1), '斜投影：depth = z（画家算法用）')
  // 平行线保持平行：两条同向等长线段的投影位移相同（与位置无关）→ 透视投影不成立
  const a1 = projectOblique([-0.3, -0.2, 0.1], opts)
  const b1 = projectOblique([0.2, 0.1, 0.4], opts)
  const a2 = projectOblique([0.4, -0.3, -0.2], opts)
  const b2 = projectOblique([0.9, 0, 0.1], opts)
  ok(near(b1.x - a1.x, b2.x - a2.x) && near(b1.y - a1.y, b2.y - a2.y),
    '斜投影：平行线保持平行（正交性质；透视投影不成立）')
  // cabinet：深度轴缩短为一半
  const q1 = projectOblique([0, 0, 0], opts)
  const q2 = projectOblique([0, 0, 2], opts)
  ok(Math.abs(Math.hypot(q2.x - q1.x, q2.y - q1.y) - 2 * 50 * 0.5) < 1e-9,
    'cabinet：深度轴缩短为一半（2 单位深度 → 屏幕上 1 个单位长度）')
}

// ---------------------------------------------------------------------------
// ② 球坐标网格与 d_z² 节锥（主视觉 HUD 的"图文对应"靠它们成立）
// ---------------------------------------------------------------------------
{
  const cage = createSphericalCage()
  ok(cage.latitudes.length === 5 && cage.meridians.length === 4,
    '球坐标网格：5 条纬线 + 4 条经线', cage.latitudes.length + '/' + cage.meridians.length)
  ok(cage.latitudes.every((line) => line.every((p) => near(Math.hypot(p[0], p[1], p[2]), 1))),
    '球坐标网格：纬线上的点都在单位球面上')
  ok(cage.meridians.every((line) => line.every((p) => near(Math.hypot(p[0], p[1], p[2]), 1))),
    '球坐标网格：经线上的点都在单位球面上')
  // θ = 54.7356° / 125.2644° 两条纬线：z = ±1/√3 —— 它们就是节锥与球面的交线
  ok(near(cage.latitudes[1][0][2], 1 / Math.sqrt(3), 1e-6)
    && near(cage.latitudes[3][0][2], -1 / Math.sqrt(3), 1e-6),
    '球坐标网格：θ = 54.74° / 125.26° 两条纬线的 z = ±1/√3（节锥交线）')
  ok(cage.meridians[0].some((p) => near(Math.abs(p[2]), 1)),
    '球坐标网格：经线经过南北极（是绕过 z 轴的大圆）')

  const cones = createNodalCones()
  const theta0 = Math.acos(1 / Math.sqrt(3)) * 180 / Math.PI
  ok(Math.abs(cones.thetaDeg - theta0) < 1e-9, '节锥：半锥角 = arccos(1/√3) = 54.7356°',
    cones.thetaDeg.toFixed(6) + '° / ' + theta0.toFixed(6) + '°')
  ok(near(cones.z, 1 / Math.sqrt(3), 1e-9) && near(cones.radius, Math.sqrt(2 / 3), 1e-9),
    '节锥：z = cos θ = 1/√3，底圆半径 = sin θ = √(2/3)')
  ok(cones.cones.length === 2 && cones.cones[0].sign === 1 && cones.cones[1].sign === -1,
    '节锥：±z 两个圆锥（3cos²θ−1 = 0 的两个解）')
  const onZero = (p) => Math.abs(3 * p[2] * p[2] - 1) < 1e-9
  ok(cones.cones.every((c) => c.circle.every((p) => onZero(p)
    && near(Math.hypot(p[0], p[1], p[2]), 1))),
    '节锥：底圆上的点满足 3cos²θ−1 = 0 且在单位球面上')
  ok(cones.cones.every((c) => c.lines.length === 12
    && c.lines.every((seg) => near(Math.hypot(seg[0][0], seg[0][1], seg[0][2]), 0))),
    '节锥：12 条母线都从原点出发')
}

// ---------------------------------------------------------------------------
// ② 甲烷 Td：键长 / 键角 / C₃ 轴
// ---------------------------------------------------------------------------
{
  const mol = createMethane()
  ok(mol.atoms.length === 5 && mol.atoms.filter((a) => a.el === 'H').length === 4,
    '甲烷：1 个 C + 4 个 H')
  ok(mol.bonds.length === 4 && mol.hEdges.length === 6, '甲烷：4 根 C-H 键 + 6 条 H-H 棱',
    mol.bonds.length + '/' + mol.hEdges.length)
  const c = mol.atoms[0]
  ok(c.x === 0 && c.y === 0 && c.z === 0, '甲烷：碳在原点（对称中心）')
  ok(mol.atoms.slice(1).every((a) => near(Math.hypot(a.x, a.y, a.z), 1)),
    '甲烷：4 根 C-H 键等长（归一化到 1）')
  // H-C-H 夹角 = 109.47°（正四面体角）
  const hs = mol.atoms.slice(1)
  let minAngle = Math.PI, maxAngle = 0
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const a = angleBetween([hs[i].x, hs[i].y, hs[i].z], [hs[j].x, hs[j].y, hs[j].z])
      minAngle = Math.min(minAngle, a)
      maxAngle = Math.max(maxAngle, a)
    }
  }
  const deg = (rad) => rad * 180 / Math.PI
  ok(Math.abs(deg(minAngle) - 109.4712) < 0.01 && Math.abs(deg(maxAngle) - 109.4712) < 0.01,
    '甲烷：6 个 H-C-H 夹角全为 109.47°（正四面体）', deg(minAngle).toFixed(4) + '°~' + deg(maxAngle).toFixed(4) + '°')
  // 4 根 C₃ 轴 = 4 个 C→H 方向
  ok(mol.axes.length === 4 && mol.axes.every((ax) => ax.label === 'C₃'), '甲烷：4 根 C₃ 轴')
  ok(mol.axes.every((ax, i) => angleBetween(ax.dir, [hs[i].x, hs[i].y, hs[i].z]) < 1e-9),
    '甲烷：C₃ 轴方向与 C→H 方向逐一重合（不是随手编的方向）')
  // 轴两两不平行（正四面体的 4 条体对角线方向）
  let distinct = true
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (angleBetween(mol.axes[i].dir, mol.axes[j].dir) < 0.1) distinct = false
    }
  }
  ok(distinct, '甲烷：4 根 C₃ 轴两两不平行')
}

// ---------------------------------------------------------------------------
// ③ NaCl 岩盐型点阵：交替格点 + 最近邻键
// ---------------------------------------------------------------------------
{
  const lat = createLatticeScene({ n: 3 })
  ok(lat.nodes.length === 27, 'NaCl：3×3×3 = 27 个格点', 'got ' + lat.nodes.length)
  ok(lat.edges.length === 54, 'NaCl：54 条最近邻键（3 方向 × 18）', 'got ' + lat.edges.length)
  ok(lat.nodes.every((n) => length([n.x, n.y, n.z]) <= 1 + 1e-9),
    'NaCl：所有格点在单位球内（角点恰在球面）')
  const corner = lat.nodes.find((n) => near(length([n.x, n.y, n.z]), 1))
  ok(!!corner, 'NaCl：角点归一化到单位球面')
  ok(lat.edges.every(([i, j]) => lat.nodes[i].kind !== lat.nodes[j].kind),
    'NaCl：每条键连接的是不同种类的离子（Na–Cl 交替）')
  ok(lat.nodes.some((n) => n.kind === 0) && lat.nodes.some((n) => n.kind === 1),
    'NaCl：两套子晶格都存在')
  // 偶数格点 14 个（27 个里 (i+j+k) 偶 = 0,2 → 14），奇数 13 个
  ok(lat.nodes.filter((n) => n.kind === 0).length === 14
    && lat.nodes.filter((n) => n.kind === 1).length === 13,
    'NaCl：14 / 13 交替格点计数（与 (i+j+k) 奇偶一致）')
}

// ---------------------------------------------------------------------------
// ④ 轨道角度函数与点云
// ---------------------------------------------------------------------------
{
  // 先验函数值（都是解析式，直接手算）
  ok(orbitalAngular('pz', [0, 0, 1]) === 1 && orbitalAngular('pz', [0, 0, -1]) === -1,
    'p_z：沿 ±z 的角度函数为 ±1（两瓣相位相反）')
  ok(near(orbitalAngular('dz2', [0, 0, 1]), 2) && near(orbitalAngular('dz2', [0, 0, 0]), -1),
    'd_z²：z 方向 3cos²θ−1 = 2，赤道 = −1（大瓣正、腰部负）')
  ok(near(orbitalAngular('s', [0.3, -0.5, 0.7]), 1), 's：角度部分是常数（球）')
  ok(near(orbitalAngular('dxy', [Math.SQRT1_2, Math.SQRT1_2, 0]), 1),
    'd_xy：xy 平面 45° 方向 = 1（四瓣）')

  for (const kind of ['s', 'pz', 'dz2', 'dxy']) {
    const cloud = createOrbitalCloud(kind, { count: 400, seed: 42 })
    ok(cloud.points.length === 400, kind + '：点数 = count')
    ok(cloud.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
      && Number.isFinite(p.phase)), kind + '：没有 NaN 坐标')
    ok(cloud.points.every((p) => Math.hypot(p.x, p.y, p.z) <= 1 + 1e-9),
      kind + '：所有点半径 ≤ 1')
    ok(cloud.points.every((p) => p.phase === 1 || p.phase === -1), kind + '：相位只有 ±1')
    // 相位必须等于角度函数的符号（抽 50 个点独立重算）
    let signOk = true
    for (const p of cloud.points.slice(0, 50)) {
      const r = Math.hypot(p.x, p.y, p.z)
      if (r < 1e-9) continue
      const dir = [p.x / r, p.y / r, p.z / r]
      const want = orbitalAngular(kind, dir) >= 0 ? 1 : -1
      if (p.phase !== want) signOk = false
    }
    ok(signOk, kind + '：点云相位 = 角度函数符号（抽 50 点独立重算）')
  }

  // d_z² 的形状判据：z 方向的点必为正相位，赤道方向的点必为负相位
  const dz2 = createOrbitalCloud('dz2', { count: 800, seed: 7 })
  const nearAxis = dz2.points.filter((p) => Math.abs(p.z) > 0.9 * Math.hypot(p.x, p.y, p.z))
  const nearEquator = dz2.points.filter((p) => Math.abs(p.z) < 0.15 * Math.hypot(p.x, p.y, p.z))
  ok(nearAxis.length > 0 && nearAxis.every((p) => p.phase === 1),
    'd_z²：z 轴附近的点全为 +1 相位')
  ok(nearEquator.length > 0 && nearEquator.every((p) => p.phase === -1),
    'd_z²：赤道附近的点全为 −1 相位')
  // 确定性
  const a = createOrbitalCloud('pz', { count: 8, seed: 5 }).points[0]
  const b = createOrbitalCloud('pz', { count: 8, seed: 5 }).points[0]
  const c2 = createOrbitalCloud('pz', { count: 8, seed: 6 }).points[0]
  ok(a.x === b.x && a.y === b.y && a.z === b.z, '点云：同种子逐点一致（截图可比对）')
  ok(a.x !== c2.x || a.y !== c2.y, '点云：换种子会变')
}

// ---------------------------------------------------------------------------
// ⑤ 三维旋转与透视投影
// ---------------------------------------------------------------------------
{
  // 旋转保长
  const p = [0.3, -0.7, 0.5]
  for (const [ax, ay] of [[0, 0], [0.4, 0], [0, 1.1], [-0.7, 2.4]]) {
    ok(near(length(rotateXYZ(p, ax, ay)), length(p), 1e-12),
      `旋转保长（ax=${ax}, ay=${ay}）`)
  }
  // 偏航 90°：x̂ → −ẑ（公式与渲染层同一份，独立复算一遍）
  const q = rotateXYZ([1, 0, 0], 0, Math.PI / 2)
  ok(near(q[0], 0) && near(q[2], -1), '偏航 90°：x̂ → −ẑ', q.map((v) => v.toFixed(3)).join(','))
  // 俯仰 90°：ŷ → ẑ
  const r = rotateXYZ([0, 1, 0], Math.PI / 2, 0)
  ok(near(r[1], 0) && near(r[2], 1), '俯仰 90°：ŷ → ẑ', r.map((v) => v.toFixed(3)).join(','))

  const cam = { w: 400, h: 300, focal: 200, dist: 4 }
  const o = project([0, 0, 0], cam)
  ok(!!o && near(o.x, 200) && near(o.y, 150), '投影：原点落在画面中心')
  ok(!!o && near(o.depth, 4) && near(o.scale, 50), '投影：深度 = dist，比例 = focal / dist')
  const right = project([1, 1, 0], cam)
  ok(!!right && right.x > 200 && right.y < 150, '投影：+x 向右、+y 向上（画布 y 轴翻转）')
  ok(project([0, 0, 4], cam) === null, '投影：眼睛后方的点返回 null（不画镜像点）')
  // 透视：同样 x 偏移，越远越小
  const nearPt = project([1, 0, 2], cam)
  const farPt = project([1, 0, 0], cam)
  ok(!!nearPt && !!farPt && (nearPt.x - 200) > (farPt.x - 200), '透视：远的点投影更靠近中心')
}

// ---------------------------------------------------------------------------
// ⑥ 背景点阵 / 尘埃 / PRNG
// ---------------------------------------------------------------------------
{
  const lat = createBackgroundLattice({ n: 4, spacing: 1 })
  ok(lat.nodes.length === 64, '背景晶格：4³ = 64 个节点', 'got ' + lat.nodes.length)
  ok(lat.edges.length === 144, '背景晶格：最近邻棱 144 条（3×4²×3）', 'got ' + lat.edges.length)
  ok(lat.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)),
    '背景晶格：坐标都是有限数')
  // 边只连相邻格点（距离 = spacing）
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  ok(lat.edges.every(([i, j]) => near(dist(lat.nodes[i], lat.nodes[j]), 1)),
    '背景晶格：每条棱连接相邻格点（距离 = spacing）')

  const dust = createDust({ count: 120, seed: 2 })
  ok(dust.length === 120, '尘埃：数量正确')
  ok(dust.every((p) => { const r = Math.hypot(p.x, p.y, p.z); return r >= 1.2 - 1e-9 && r <= 3.2 + 1e-9 }),
    '尘埃：半径落在 [1.2, 3.2] 的远景球壳里')
  ok(dust.every((p) => p.size > 0), '尘埃：每颗都有正的大小')

  const rand = createPRNG(123)
  const vals = Array.from({ length: 5 }, () => rand())
  ok(vals.every((v) => v >= 0 && v < 1), 'PRNG：输出在 [0, 1)')
  const rand2 = createPRNG(123)
  ok(Array.from({ length: 5 }, () => rand2()).every((v, i) => v === vals[i]),
    'PRNG：同类子给出同一序列（确定性）')
}

// ---------------------------------------------------------------------------
// ⑦ 颜色：CSS 变量 → 画布调色板
// ---------------------------------------------------------------------------
{
  ok(parseColor('#abc') && parseColor('#abc').r === 0xaa && parseColor('#abc').g === 0xbb,
    'parseColor：#rgb 展开正确')
  const hex = parseColor('#0b74c4')
  ok(hex && hex.r === 11 && hex.g === 116 && hex.b === 196 && hex.a === 1, 'parseColor：#rrggbb 正确')
  ok(parseColor('rgb(1, 2, 3)').b === 3, 'parseColor：rgb() 正确')
  ok(parseColor('rgba(10, 20, 30, 0.5)').a === 0.5, 'parseColor：rgba() 的 alpha 正确')
  ok(parseColor('not-a-color') === null && parseColor(null) === null, 'parseColor：坏值返回 null（不产生 NaN）')
  ok(rgba({ r: 10, g: 20, b: 30 }, 0.5) === 'rgba(10,20,30,0.500)', 'rgba() 输出格式稳定', rgba({ r: 10, g: 20, b: 30 }, 0.5))
  const mixed = mixColor({ r: 0, g: 0, b: 0 }, { r: 100, g: 100, b: 100 }, 0.5)
  ok(mixed.r === 50 && mixed.g === 50, 'mixColor：中点为两色均值')
  // CSS 变量缺失 → 回退到内置默认值（而不是黑/NaN）
  const pal = createPalette(() => '', { dark: true })
  ok(pal.dark === true && pal.cyan.r > 0 && pal.cyan.g > 0 && pal.cyan.b > 0,
    'createPalette：变量缺失时回退到内置默认色')
  const pal2 = createPalette((name) => (name === '--pt-cyan' ? '#123456' : ''), { dark: false })
  ok(pal2.cyan.r === 0x12 && pal2.cyan.g === 0x34 && pal2.cyan.b === 0x56 && pal2.dark === false,
    'createPalette：从 CSS 变量读出颜色（单一真源）')
  // 半透明与 normalize 的边界
  ok(normalize([0, 0, 0]) === null, 'normalize：零向量返回 null（不产生 NaN）')
  ok(near(length(normalize([3, 4, 0])), 1), 'normalize：单位化')
  ok(TAU === Math.PI * 2, 'TAU 常量正确')
}

console.log('')
console.log('═══════════════════════════════════════════════════════════════')
if (fail === 0) {
  console.log(`test-home-visuals 结果：通过 ${pass} 项，失败 0 项`)
  console.log('═══════════════════════════════════════════════════════════════')
  process.exit(0)
} else {
  console.log(`test-home-visuals 结果：通过 ${pass} 项，失败 ${fail} 项`)
  for (const b of bad.slice(0, 30)) console.log('  ✗ ' + b)
  console.log('═══════════════════════════════════════════════════════════════')
  process.exit(1)
}
