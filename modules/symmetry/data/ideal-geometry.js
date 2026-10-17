/**
 * ideal-geometry.js —— **按几何参数生成**的分子坐标（不是手敲的）
 *
 * ★ 为什么要有这个文件：
 *   示例里有一批大分子（CCCBDB 无实验几何、`STRUCTURE_SOURCES.md` 记作
 *   "理想对称构建"）。它们原先是一行行**手敲的 XYZ 坐标**，而手敲 35 行、
 *   60 行坐标出错太容易 —— 实测就出过：三苯甲烷的三个苯环**全接反了**，
 *   环的对位碳落在中心碳上（距离 0.10 Å），本该成键的异位碳却在 2.90 Å 外。
 *   它**不会报错**：画面看起来就是"三苯甲烷"，只是三个环飘在外面。
 *
 *   改成按参数生成之后，键长是**构造出来的**，不靠人眼核对；
 *   而且"生成出来是不是想要求的那个点群"可以交给引擎去验（见 test 里的守卫）。
 *
 * ★ 生成器返回 **XYZ 文本**（与手敲的那批同一个入口 `parseStructure`），
 *   这样示例表那边一行都不用改。
 */

const D = Math.PI / 180

/** 向量小工具（本文件是纯计算，不引 three） */
const unit = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n] }
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
]
/** Rodrigues 旋转：把 v 绕 axis 转 ang 弧度 */
function rotate(v, axis, ang) {
  const k = unit(axis), c = Math.cos(ang), s = Math.sin(ang)
  const kv = cross(k, v), kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2]
  return v.map((x, i) => x * c + kv[i] * s + k[i] * kd * (1 - c))
}

/** 原子表 → XYZ 文本（首行原子数、次行注释） */
export function toXyz(atoms, comment) {
  const lines = atoms.map(([el, p]) =>
    `${el} ${p[0].toFixed(4)} ${p[1].toFixed(4)} ${p[2].toFixed(4)}`)
  return [String(atoms.length), comment, ...lines].join('\n')
}

/**
 * 三苯甲烷 C₁₉H₁₆（C₃）。
 *
 * 构造：中心碳在原点，C–H 沿 −z；另外三条 C–C 取正四面体的其余三个方向
 * （与 −z 夹角 109.47°）。每个苯环是边长 `cc` 的**正六边形**，异位碳
 * 距中心 `cIps`；环平面相对"C→异位"方向倾 `beta`，再绕该方向扭 `gamma`
 * ——**γ 就是螺旋桨角**：
 *   · γ = 0   每个环都有一个镜面 → 整个分子是 **C₃ᵥ**
 *   · γ ≠ 0   镜面被扭掉，只剩 **C₃**（真实三苯甲烷就是这样）
 * 两种都由引擎的点群识别验证过（γ=0 → C3v、γ=32° → C3）。
 *
 * @param {number} beta  环平面倾角（弧度）
 * @param {number} gamma 螺旋桨扭转角（弧度）
 */
export function buildTriphenylmethaneXyz({ beta = 20 * D, gamma = 32 * D, cc = 1.39, ch = 1.08, cIps = 1.52, cH = 1.09 } = {}) {
  const atoms = [['C', [0, 0, 0]], ['H', [0, 0, -cH]]]
  const polar = Math.acos(1 / 3)          // 正四面体：C→异位 与 +z 的夹角
  const s0 = Math.sin(polar), c0 = Math.cos(polar)
  for (let i = 0; i < 3; i++) {
    const az = i * 120 * D
    const ur = [s0 * Math.cos(az), s0 * Math.sin(az), c0]   // 径向
    const ut = [-Math.sin(az), Math.cos(az), 0]             // 切向
    const us = cross(ur, ut)                                // 与两者正交
    const ipso = mul(ur, cIps)
    // 环内 ipso→para 方向：以径向为主，叠加倾角 beta 与螺旋桨角 gamma
    const dir = unit(add(
      mul(ur, Math.cos(beta)),
      mul(add(mul(us, Math.cos(gamma)), mul(ut, Math.sin(gamma))), Math.sin(beta)),
    ))
    const nrm = unit(cross(ur, dir))                        // 环平面法向
    // ★ 环心在异位碳的**外侧**（+dir），顶点从 180° 起画：
    //   异位–对位相距 2·cc ≈ 2.78 Å，而中心到异位只有 1.52 Å ——
    //   环只能往外长。若把环心放到内侧，对位碳会**越过分子中心**，
    //   有的碳直接落到离中心 0.1–0.5 Å 的地方（"最短原子间距"那条检查抓到的）。
    const ringCenter = add(ipso, mul(dir, cc))
    const ring = []
    for (let k = 0; k < 6; k++) {
      ring.push(add(ringCenter, mul(rotate(dir, nrm, (k + 3) * 60 * D), cc)))
    }
    for (const p of ring) atoms.push(['C', p])
    // 除异位碳（k=0）外，每个环碳挂一个 H，方向为"离开环心"
    for (let k = 1; k < 6; k++) {
      atoms.push(['H', add(ring[k], mul(unit(add(ring[k], mul(ringCenter, -1))), ch))])
    }
  }
  return toXyz(atoms, '三苯甲烷 C19H16 (C3)')
}

/**
 * 环八硫 S₈（D₄d，皇冠构象）。
 *
 * 由 **S–S 键长**与 **∠S–S–S** 解出皇冠的半径 `r` 与半高 `h`：
 *   8 个硫交替位于 z = ±h，方位角相隔 45°。
 *   键长：  (2r·sin22.5°)² + (2h)² = bond²
 *   键角：  cos(angle) = [ r²((cos45°−1)² − sin²45°) + (2h)² ] / bond²
 *   两式相减即得 r²，再回代得 h。
 *
 * ★ 为什么不再手敲：原先那份坐标是 r=2.100、h=0.860，算出来 S–S = **2.354 Å**，
 *   而同一份文档里写的参数是 **2.06 Å** —— 手敲坐标与注释对不上，且**不报错**。
 *   现在键长与键角是**输入**，坐标是解出来的，两者不可能再背离。
 */
export function buildS8Xyz({ bond = 2.06, angleDeg = 108 } = {}) {
  const half = 22.5 * D, c45 = Math.cos(45 * D)
  const a = 2 * Math.sin(half)          // 键长的横向系数：L² = (a·r)² + (2h)²
  const k = (c45 - 1) * (c45 - 1) - Math.sin(45 * D) ** 2   // 键角里的 r² 系数
  const cosA = Math.cos(angleDeg * D)
  const L2 = bond * bond
  // a²r² + 4h² = L² ;  k·r² + 4h² = cosA·L²  ⇒  (a²−k) r² = L²(1−cosA)
  const r = Math.sqrt(L2 * (1 - cosA) / (a * a - k))
  const h = Math.sqrt(Math.max(0, (L2 - a * a * r * r)) / 4)
  const atoms = []
  for (let i = 0; i < 8; i++) {
    const az = i * 45 * D
    atoms.push(['S', [r * Math.cos(az), r * Math.sin(az), (i % 2 ? 1 : -1) * h]])
  }
  return toXyz(atoms, '环八硫 S8 (D4d)')
}

/**
 * 三乙二胺合钴 [Co(en)₃]³⁺（D₃，手性螺旋桨）。
 *
 * ★ 为什么"按 GJF 重构"而不是直接抄 GJF 坐标：
 *   源文件 `D3-CoIIIen3.gjf`（CoC₆N₆H₂₄，D₃）给出的是一份**未经优化的初始猜测**：
 *   · 用本项目的点群识别（容差 0.15 Å）判出来的点群是 **C1**，不是 D3；
 *   · 不同螯合环上的两个 N 之间只有 **2.15 Å**（N···N 严重重叠）；
 *   · 有 N–H 氢指向相邻碳（H···C 1.31 Å、∠H–N–C ≈ 61°），不是四面体胺。
 *   这样的坐标直接放进教学视图，会展示一个"化学上不成立、对称性也不对"的结构。
 *   所以这里**沿用 GJF 的组成与连接关系**（Co + 3 条 en：Co–N、N–C、C–C、N–H、C–H 全保留），
 *   按标准几何**重构为严格的 D₃ 模型**：C₃ 轴沿 z、C₂ 轴沿 x，三个 en 由 C₃ 生成、
 *   每个 en 自身满足 C₂（N↔N、C↔C、H↔H），因此点群严格是 D₃（引擎已复算确认）。
 *
 * 参数（Å / 度）：
 *   Co–N 1.96 · 螯合咬角 ∠N–Co–N 83.5 · N–C 1.48 · C–C 1.53 · N–H 1.02 · C–H 1.09
 *   en 环为 gauche 构象（N–C–C–N 二面角 ≈ 45°；配体间最短 H···H ≈ 2.14 Å，无重叠）
 *
 * ★ "N 对的取向"（PHI1=30°）是按"反位 N–Co–N 接近 180°"选的：本模型给出 ≈174.6°，
 *   与八面体配位的反位角一致；RING 控制 C–C 键的褶皱方向，25° 时二面角 ≈45°。
 */
export function buildCoen3Xyz() {
  const R = 1.96            // Co–N
  const BITE = 83.5         // N–Co–N 螯合咬角
  const NC = 1.48, CC = 1.53, NH = 1.02, CH = 1.09
  const PHI1 = 30           // N1 在 C₂ 坐标系里的方位角（决定反位角）
  const RING = 25           // C–C 键绕 C₂ 轴的放置角（决定 en 环褶皱）
  const H_HALF = 53.5       // H–X–H / X–H 方向半角（≈ 107° 的 H–N–H、H–C–H）

  // ---- 六个 N：C₂ 轴 = x，N1/N2 关于 x 对称；另两对由 C₃ 生成 ----
  const a = R * Math.cos(BITE / 2 * D)
  const rho = R * Math.sin(BITE / 2 * D)
  const b = a * Math.tan(PHI1 * D)
  const c = Math.sqrt(Math.max(rho * rho - b * b, 0))
  const N1 = [a, b, c]
  const N2 = [a, -b, -c]

  // ---- 两条 C（C1↔C2 由 C₂ 对称；N–C、C–C 解出 x 坐标）----
  const rad = CC / 2
  const yc = rad * Math.cos(RING * D)
  const zc = rad * Math.sin(RING * D)
  const xc = a + Math.sqrt(Math.max(NC * NC - (yc - b) ** 2 - (zc - c) ** 2, 0))
  const C1 = [xc, yc, zc]
  const C2 = [xc, -yc, -zc]

  // ---- H：给"已有两条键"的中心补另外两条四面体方向 ----
  const placeH = (u1, u2) => {
    const bis = unit(mul(add(u1, u2), -1))
    const perp = unit(cross(u1, u2))
    const f = H_HALF * D
    return [
      unit(add(mul(bis, Math.cos(f)), mul(perp, Math.sin(f)))),
      unit(add(mul(bis, Math.cos(f)), mul(perp, -Math.sin(f)))),
    ]
  }
  // N1 上有 Co 与 C1 两条键
  const [hn1, hn2] = placeH(unit(mul(N1, -1)), unit(sub(C1, N1)))
  // C1 上有 N1 与 C2 两条键
  const [hc1, hc2] = placeH(unit(sub(N1, C1)), unit(sub(C2, C1)))
  const Hn1a = add(N1, mul(hn1, NH))
  const Hn1b = add(N1, mul(hn2, NH))
  const Hc1a = add(C1, mul(hc1, CH))
  const Hc1b = add(C1, mul(hc2, CH))

  // C₂ 对称（以 x 轴转 180°）：(x,y,z) → (x,−y,−z)
  const c2 = (p) => [p[0], -p[1], -p[2]]

  // 一个 en 配体（12 个原子）：N1 端、C1、C2、N2 端；H 由 C₂ 生成
  const lig0 = [
    ['N', N1], ['H', Hn1a], ['H', Hn1b],
    ['C', C1], ['H', Hc1a], ['H', Hc1b],
    ['C', C2], ['H', c2(Hc1a)], ['H', c2(Hc1b)],
    ['N', N2], ['H', c2(Hn1a)], ['H', c2(Hn1b)],
  ]

  // ---- 三条 en 由 C₃（绕 z 转 120°）生成；Co 在原点 ----
  const atoms = [['Co', [0, 0, 0]]]
  for (let k = 0; k < 3; k++) {
    const th = k * 120 * D
    for (const [el, p] of lig0) atoms.push([el, rotate(p, [0, 0, 1], th)])
  }
  return toXyz(atoms, '三乙二胺合钴 [Co(en)3]3+ C6H24CoN6 (D3)')
}
