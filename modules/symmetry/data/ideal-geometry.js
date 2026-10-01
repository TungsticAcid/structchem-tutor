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
