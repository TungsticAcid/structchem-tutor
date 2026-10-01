/**
 * hybrids.js（orbit 模块 · **纯计算层**）
 *
 * 杂化轨道（sp³ / sp² / sp）的**唯一定义处**：系数、颜色、以及——最关键的一项——
 * 「第 k 个等价轨道是第 0 个的哪个旋转」。
 *
 * ★ 为什么从渲染层搬到这里（2026-10-01）：
 *   原先 `sp3 / sp2 / sp` 三个生成函数住在 `render/state-editor.js` 里。那没问题，
 *   直到「多轨道同屏」要由**动作词汇表**驱动 —— `modules/orbit/actions.js` 是
 *   模块层，必须能在 Node 里 import（不能牵进任何视图实现）。
 *   同一组系数若有第二份定义，两边迟早分叉：界面上的 sp³-2 与智能体画的 sp³-2
 *   会是两个不同的东西，而这**不会报错**。
 *   搬到这里之后：state-editor 与多轨道渲染都从本文件取，只有一份。
 *
 * ★ 本文件不引用 DOM、不引用 three，可在 Node 里直接测。
 */

// ---------------------------------------------------------------------------
// 归一化常数
// ---------------------------------------------------------------------------
const S = 1 / Math.SQRT2           // 1/√2  —— sp 的 s 系数
const S3 = 1 / Math.sqrt(3)        // 1/√3  —— sp² 的 s 系数
const S23 = Math.sqrt(2 / 3)       // √(2/3)—— sp² 的 p 系数

/**
 * 生成一个 sp³ 杂化轨道：ψ = ½(s + sₓ·p_x + s_y·p_y + s_z·p_z)。
 *
 * ★ s 的系数**恒为 +½**，只有三个 p 的符号在变。这是正四面体四个方向的正确构造：
 *   p 矢量取 (1,1,1)、(1,−1,−1)、(−1,1,−1)、(−1,−1,1) 时，四个杂化轨道两两正交
 *   （⟨hᵢ|hⱼ⟩ = ¼(1 + dᵢ·dⱼ) = 0，因为 dᵢ·dⱼ = −1），大瓣夹角 109.47°。
 *
 *   若让 s 也跟着翻符号（这里原先就是如此），会出两个错：① 四个轨道不再正交；
 *   ② 大瓣方向由"s 与 p 的相对符号"决定，s 一翻号，大瓣就偏到正四面体之外的
 *   方向去了。而提示文字写的却是正确公式——界面上说的和画出来的对不上，
 *   这种"注释对了、代码错了"的错最难发现。
 */
function sp3(sx, sy, sz) {
  const h = 0.5
  return [
    { n: 2, l: 0, m: 0, mode: 'real', c: { re: h, im: 0 } },          // s：四个轨道完全一致
    { n: 2, l: 1, m: 0, mode: 'real', c: { re: h * sz, im: 0 } },     // p_z（m=0）
    { n: 2, l: 1, m: 1, mode: 'real', c: { re: h * sx, im: 0 } },     // p_x（m=+1）
    { n: 2, l: 1, m: -1, mode: 'real', c: { re: h * sy, im: 0 } },    // p_y（m=−1）
  ]
}

/**
 * 生成第 index 个 sp² 杂化轨道（index = 0/1/2）：
 *   ψ = (1/√3)s + √(2/3)(cosθ·p_x + sinθ·p_y)，θ = index × 120°。
 * 三个轨道共面、两两 120°，且两两正交。
 */
function sp2(index) {
  const th = index * 2 * Math.PI / 3
  return [
    { n: 2, l: 0, m: 0, mode: 'real', c: { re: S3, im: 0 } },
    { n: 2, l: 1, m: 1, mode: 'real', c: { re: S23 * Math.cos(th), im: 0 } },
    { n: 2, l: 1, m: -1, mode: 'real', c: { re: S23 * Math.sin(th), im: 0 } },
  ]
}

/** 生成一个 sp 杂化轨道：ψ = (1/√2)(s + sz·p_z)，sz = ±1 得到方向相反的两个 */
function sp(sz) {
  return [
    { n: 2, l: 0, m: 0, mode: 'real', c: { re: S, im: 0 } },
    { n: 2, l: 1, m: 0, mode: 'real', c: { re: S * sz, im: 0 } },
  ]
}

// ---------------------------------------------------------------------------
// 等价轨道的颜色
//
// ★ 四个面同屏时**必须按轨道区分底色**：若都走相位色，画面上就是四组一模一样的
//   红/青瓣，分不清哪个是哪个 —— "同屏"反而比单个更看不懂。
// ★ 刻意避开相位色的红(#EE2C2C)与青(#2CEEEE)：混在一起会让人以为那是相位信息。
// ★ 这些是 **sRGB** 三元组，与 math.js 的其余配色同一约定 —— 转换只发生在
//   写顶点属性的那个边界上（见 render3d.js 的 srgbToLinearArray）。
// ---------------------------------------------------------------------------
const PALETTE = {
  amber: [0.878, 0.627, 0.251],   // 琥珀
  blue: [0.357, 0.608, 0.835],    // 天蓝
  green: [0.498, 0.690, 0.412],   // 草绿
  violet: [0.639, 0.475, 0.839],  // 紫
}

/**
 * 轨道集合定义。
 *
 * `rotation(i)` 给出**把第 0 个等价轨道映到第 i 个的旋转**（轴 + 角，弧度）。
 * 这不是"顺手抄个矩阵"——它是"多轨道同屏只需算一份标量场"的**全部依据**：
 * 因为 ψᵢ(x) = ψ₀(Rᵢ⁻¹x)（s 在旋转下不变、三个 p 按矢量变换），
 * 所以第 i 个的等值面 = 第 0 个的等值面绕同一条轴转同一个角。
 * 该恒等式由 test-orbit-core.mjs 逐点数值对拍钉住（随机方向、误差 < 1e-12）。
 */
const HYBRID_SETS = [
  {
    id: 'sp3',
    label: 'sp³',
    count: 4,
    // 正四面体的四个方向；s 系数恒为 +½
    dirs: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
    terms: (i) => {
      const d = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]][i]
      return sp3(d[0], d[1], d[2])
    },
    labels: ['sp³-1', 'sp³-2', 'sp³-3', 'sp³-4'],
    colors: [PALETTE.amber, PALETTE.blue, PALETTE.green, PALETTE.violet],
    /**
     * 180° 绕 **保持 +1 的那个轴**。
     *
     * ★ 这里写错过一次，而且形态很典型：先写成了"绕**翻号**的那个轴转"
     *   （`d.indexOf(-1)`）。对角阵 diag(1,−1,−1) 是绕 x 轴转 180°，x 是那个
     *   **不变号**的分量；取成 y 轴就得到 diag(−1,1,−1)，是**另一个**旋转。
     *   几何上它一样"看起来像正四面体"——四个瓣、四个方向、四种颜色，
     *   谁也不会怀疑它不是 sp³，但它与第 0 个不是同一个轨道。
     *   由 test-orbit-core ⑫ 的逐点对拍抓住（偏差 9.9e-2）。
     *
     * diag(sx,sy,sz) 把 (1,1,1) 映到 (sx,sy,sz)；四个方向里 −1 的个数是 0 或 2，
     * 故 det = +1 —— **是正当的旋转**，不是镜像。
     * （这一点必须保住：镜像会把左手的四面体映成右手的，画出来就不是同一个分子了。）
     */
    rotation: (i) => {
      if (i === 0) return { axis: [1, 0, 0], angle: 0 }
      const d = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]][i]
      const k = d.indexOf(1)          // 不变号的那个轴 —— 旋转轴
      const axis = [0, 0, 0]
      axis[k] = 1
      return { axis, angle: Math.PI }
    },
  },
  {
    id: 'sp2',
    label: 'sp²',
    count: 3,
    terms: (i) => sp2(i),
    labels: ['sp²-1', 'sp²-2', 'sp²-3'],
    colors: [PALETTE.amber, PALETTE.blue, PALETTE.green],
    /** 绕 z 轴转 i×120° */
    rotation: (i) => ({ axis: [0, 0, 1], angle: i * 2 * Math.PI / 3 }),
  },
  {
    id: 'sp',
    label: 'sp',
    count: 2,
    terms: (i) => sp(i === 0 ? 1 : -1),
    labels: ['sp-1', 'sp-2'],
    colors: [PALETTE.amber, PALETTE.blue],
    /** +z 转到 −z：绕 x 轴 180° */
    rotation: (i) => (i === 0 ? { axis: [1, 0, 0], angle: 0 } : { axis: [1, 0, 0], angle: Math.PI }),
  },
]

/** 集合 id 列表（词汇表校验用） */
function hybridSetIds() { return HYBRID_SETS.map((s) => s.id) }

/** 按 id 取集合定义；未知 id 返回 null（调用方据此报错，不要抛） */
function hybridSet(id) {
  for (const s of HYBRID_SETS) if (s.id === id) return s
  return null
}

/** 第 i 个等价轨道的项（未知集合/越界返回 null） */
function hybridTerms(id, i) {
  const s = hybridSet(id)
  if (!s || !(i >= 0 && i < s.count)) return null
  return s.terms(i)
}

/** 第 i 个的旋转（把第 0 个映到它） */
function hybridRotation(id, i) {
  const s = hybridSet(id)
  if (!s || !(i >= 0 && i < s.count)) return null
  return s.rotation(i)
}

/** 第 i 个的颜色（sRGB 三元组） */
function hybridColor(id, i) {
  const s = hybridSet(id)
  if (!s || !(i >= 0 && i < s.count)) return null
  return s.colors[i].slice()
}

/**
 * 负瓣的颜色：同色相压暗。
 *
 * ★ 为什么不是"负瓣用另一种颜色"：那样每个轨道就有两个无关的颜色，
 *   四个轨道同屏会出现八种颜色，反而分不清哪些属于同一个轨道。
 *   压暗保持"这个是同一个轨道"的直觉，同时留住正负号这个教学信息。
 */
function darken(rgb, k) {
  const f = (typeof k === 'number' && k > 0 && k < 1) ? k : 0.45
  return [rgb[0] * f, rgb[1] * f, rgb[2] * f]
}

export const Hybrids = {
  SETS: HYBRID_SETS,
  PALETTE,
  setIds: hybridSetIds,
  set: hybridSet,
  terms: hybridTerms,
  rotation: hybridRotation,
  color: hybridColor,
  darken,
  // 单个生成器也导出：state-editor 的 PRESETS 直接用它们，保持一份定义
  sp3, sp2, sp,
}
