/**
 * test-orbit-core.mjs —— orbit 纯计算层的**常驻守卫**（不依赖上游 checkout）
 *
 * ★ 与 `test-orbit-engine.mjs` 的分工：
 *   · 那个是**对拍**——把上游原文件在沙箱里跑起来逐值比对，最强，但需要
 *     `D:/xjl/program/orbit/H5` 这个同级仓库，换台机器就没有。
 *   · 本文件是**常驻**——只依赖本仓库，任何地方都能跑，所以进 `npm test`。
 *
 * ★ 断言的是**教科书常量**，不是"我自己算出来的数"。
 *   本仓库最贵的一课是「断言要断言实现，不是名字」——把当前输出冻结成期望值，
 *   等于让实现给自己出题。这里每一条期望值都能在教材里查到出处：
 *     · 氢原子能级 E_n = −13.6 eV / n²
 *     · 径向节点数 = n − l − 1；角向节点数 = l
 *     · 1s：⟨r⟩ = 1.5 a₀、Δr = √3/2 a₀、⟨r²⟩ = 3 a₀²
 *     · 2p 径向分布峰值在 r = 4 a₀
 *     · 3p 的径向节点在 r = 6 a₀
 *     · d_z² 的两个节锥在 θ = arccos(±1/√3) ≈ 54.74° 与 125.26°（"魔角"）
 *   实现若与这些冲突，那一定是实现错了——这正是断言该有的方向。
 */
const { OM } = await import('../core/math.js')
const { Formula } = await import('../core/formula.js')
const { Sched } = await import('../core/sched.js')
const { Observables } = await import('../core/observables.js')
const { ErrorDiagnosis } = await import('../core/error-diagnosis.js')
const { Perception } = await import('../core/perception-snapshot.js')
// 源码级断言要用（⑩ 的第三组：render3d 依赖 window，无法 import 后直接断言）
import { readFileSync } from 'fs'

let pass = 0
let fail = 0
const bad = []

function ok(cond, label, extra) {
  if (cond) { pass++; return }
  fail++
  bad.push(label + (extra ? '  ← ' + extra : ''))
}

function near(a, b, tol, label) {
  const good = typeof a === 'number' && typeof b === 'number'
    && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
  ok(good, label, `期望 ${b}，实际 ${a}`)
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('orbit 纯计算层 · 常驻守卫（教科书常量）')
console.log('═══════════════════════════════════════════════════════════════')

// ---------------------------------------------------------------- ① 能级
console.log('【① 氢原子能级 Eₙ = −13.6 eV / n²】')
for (const n of [1, 2, 3, 4, 5, 6]) {
  near(OM.energy(n), -13.6 / (n * n), 1e-12, `energy(${n})`)
}
// 类氢：Z 的标度是 Z²
near(OM.energy(1, 2), -13.6 * 4, 1e-12, 'energy(1, Z=2)（He⁺，应为 4 倍）')
near(OM.energy(2, 3), -13.6 * 9 / 4, 1e-12, 'energy(2, Z=3)（Li²⁺）')

// ---------------------------------------------------------------- ② 简并度
console.log('【② 简并度 = n²】')
for (const n of [1, 2, 3, 4, 5]) ok(OM.degeneracy(n) === n * n, `degeneracy(${n}) = ${n * n}`)

// ---------------------------------------------------------------- ③ 节点
console.log('【③ 节点数：径向 n−l−1、角向 l】')
for (let n = 1; n <= 5; n++) {
  for (let l = 0; l < n; l++) {
    const nd = OM.nodes(n, l)
    ok(nd && nd.radial === n - l - 1, `nodes(${n},${l}).radial = ${n - l - 1}`, JSON.stringify(nd))
    ok(nd && nd.angular === l, `nodes(${n},${l}).angular = ${l}`, JSON.stringify(nd))
    ok(nd && nd.total === n - 1, `nodes(${n},${l}).total = n−1`, JSON.stringify(nd))
    ok(OM.radialZeros(n, l).length === n - l - 1, `radialZeros(${n},${l}) 个数 = n−l−1`)
  }
}
// 具体位置：3p 的径向节点在 r = 6 a₀（氢原子）
const z31 = OM.radialZeros(3, 1)
near(z31[0], 6, 1e-9, 'radialZeros(3,1)[0] = 6 a₀')
// 1s 无径向节点
ok(OM.radialZeros(1, 0).length === 0, 'radialZeros(1,0) 为空')

// ---------------------------------------------------------------- ④ 角度节点
console.log('【④ 角向节面几何】')
const a10 = OM.angularNodes(1, 0, 'real')
near(a10.cones[0], Math.PI / 2, 1e-12, 'p_z 节锥在 θ=90°')
const a20 = OM.angularNodes(2, 0, 'real')
const magic = Math.acos(1 / Math.sqrt(3))
near(a20.cones[0], magic, 1e-12, 'd_z² 节锥 1 在魔角 arccos(1/√3)')
near(a20.cones[1], Math.PI - magic, 1e-12, 'd_z² 节锥 2 在 π−魔角')
ok(a20.cones.length === 2, 'd_z² 有两个节锥')

// ---------------------------------------------------------------- ⑤ 径向分布
console.log('【⑤ 径向分布函数 D(r)=r²R²】')
near(OM.radialPeaks(1, 0)[0], 1, 1e-3, '1s 峰值在 r = 1 a₀（玻尔半径）')
near(OM.radialPeaks(2, 1)[0], 4, 1e-3, '2p 峰值在 r = 4 a₀')
// 2s：D(r) = r²(1−r/2)²e^{−r} ⇒ dD/dr = 0 给 r² − 6r + 4 = 0 ⇒ r = 3 ± √5
// ★ 一开始我把这里写成 r = 2+√5，是**我的解析值记错了**（重解一遍才看清）。
//   这正是"断言教科书常量"的价值：它逼我把推导做对，而不是把实现当前的输出抄下来。
{
  const pk = OM.radialPeaks(2, 0)
  ok(pk.length >= 2, '2s 的径向分布有两个极值（内外各一）', JSON.stringify(pk))
  const has = (x) => pk.some((v) => Math.abs(v - x) < 1e-3)
  ok(has(3 - Math.sqrt(5)), '2s 内侧极值在 r = 3−√5 a₀', JSON.stringify(pk))
  ok(has(3 + Math.sqrt(5)), '2s 外侧极值在 r = 3+√5 a₀', JSON.stringify(pk))
}
const f10 = OM.shellPeakFractions(1, 0)
ok(Array.isArray(f10) && f10.length === 1 && Math.abs(f10[0] - 1) < 1e-9, '1s 只有一个壳层峰且占比为 1')

// ---------------------------------------------------------------- ⑥ 可观测量
console.log('【⑥ 可观测量（1s 的解析值）】')
near(Observables.meanR(1, 0, 0), 1.5, 1e-9, '1s 的 ⟨r⟩ = 1.5 a₀')
near(Observables.meanInvR(1, 0, 0), 1, 1e-9, '1s 的 ⟨1/r⟩ = 1 a₀⁻¹')
near(Observables.meanR2(1, 0, 0), 3, 1e-9, '1s 的 ⟨r²⟩ = 3 a₀²')
near(Observables.deltaR(1, 0, 0), Math.sqrt(3) / 2, 1e-9, '1s 的 Δr = √3/2 a₀')
// 2s 的 ⟨1/r⟩ 应对应 −E = 13.6/4 = 3.4（维里定理：⟨1/r⟩ = −2E，单位 a.u.）
near(Observables.meanInvR(2, 0, 0), 0.25, 1e-6, '2s 的 ⟨1/r⟩ = 1/(4) a₀⁻¹')

// ---------------------------------------------------------------- ⑦ 端点与形状
console.log('【⑦ 数值端点（防"跑得动但全 NaN"）】')
for (const [n, l] of [[1, 0], [3, 2], [4, 3]]) {
  const v = OM.shellPeakFractions(n, l)
  ok(Array.isArray(v) && v.every((x) => isFinite(x)), `shellPeakFractions(${n},${l}) 全为有限数`)
}
const iso = OM.isoLevelAbs(2, 1, 0, 'real', 1, 1, 0.9)
ok(isFinite(iso) && iso > 0, 'isoLevelAbs(2p, 90%) 为正的有限数', String(iso))

// ---------------------------------------------------------------- ⑧ 导出面
console.log('【⑧ 各模块的导出面（防止"加载成功但少了东西"）】')
ok(typeof OM.psi === 'function' || typeof OM.psiReal === 'function' || Object.keys(OM).length > 40,
  `OM 导出 ${Object.keys(OM).length} 项`, String(Object.keys(OM).length))
ok(Object.keys(Formula).length > 5, `Formula 导出 ${Object.keys(Formula).length} 项`)
ok(Object.keys(Sched).length >= 3, `Sched 导出 ${Object.keys(Sched).length} 项`)
ok(Object.keys(Observables).length >= 10, `Observables 导出 ${Object.keys(Observables).length} 项`)

// ---------------------------------------------------------------- ⑨ 注入端口
console.log('【⑨ 注入端口：未注入要"降级"而不是抛错】')
ok(typeof ErrorDiagnosis.configure === 'function', 'ErrorDiagnosis.configure 存在')
ok(typeof Perception.configure === 'function', 'Perception.configure 存在')
try {
  const snap = Perception.snapshot()
  ok(snap === null || typeof snap === 'object', '未注入 getState 时 snapshot 不抛错')
} catch (e) {
  ok(false, '未注入 getState 时 snapshot 不抛错', String(e && e.message))
}
try {
  Perception.configure({ getState: () => ({ n: 3, l: 2, m: 0, wavefunction: 'real', Z: 1 }) })
  const snap = Perception.snapshot()
  ok(snap && typeof snap === 'object' && snap.orbital, '注入后 snapshot 返回轨道信息', JSON.stringify(snap).slice(0, 80))
} catch (e) {
  ok(false, '注入后 snapshot 可用', String(e && e.message))
}

// ---------------------------------------------------------------- ⑩ 色彩空间
console.log('【⑩ 色彩空间：顶点色必须转成线性，否则整幅画面被洗白】')
{
  // ★ 这一节守的是一次**移植回归**，不是审美偏好：
  //   上游跑在 three r144 上（ColorManagement 默认**关闭**，顶点色不做任何转换），
  //   移植到 r170 后默认**开启** —— 同一份 sRGB 数值被当作线性值再编码一次，
  //   颜色整体变浅发灰。症状是"看着灰蒙蒙"，**不报错、不崩、其余断言全绿**。
  const THREE = await import('three')

  // ① 传递函数必须与 three 内部逐位一致（常量被改动时这条会红）
  {
    const c = new THREE.Color()
    let maxErr = 0
    for (let i = 0; i <= 1000; i++) {
      const v = i / 1000
      c.setRGB(v, v, v, THREE.SRGBColorSpace)
      maxErr = Math.max(maxErr, Math.abs(c.r - OM.srgbToLinear(v)))
    }
    ok(maxErr < 1e-12, 'srgbToLinear 与 three 的 SRGBToLinear 逐位一致',
      `1001 个采样点，最大偏差 ${maxErr.toExponential(3)}`)
  }

  // ② 往返：math.js 产出的 sRGB 色 → 转线性 → 用 three 编码回 sRGB，必须**原样还原**
  //    （这条就是"渲染层该做的事"的契约；漏做或多做都会被它抓住）
  {
    const back = { r: 0, g: 0, b: 0 }
    const roundTrip = (rgb) => {
      const lin = OM.srgbToLinearArray(rgb.slice ? rgb.slice() : Array.from(rgb))
      const t = new THREE.Color().setRGB(lin[0], lin[1], lin[2], THREE.LinearSRGBColorSpace)
      t.getRGB(back, THREE.SRGBColorSpace)
      return [back.r, back.g, back.b]
    }
    const samples = [
      ['s 轨道色', OM.lColor(0)],
      ['p 轨道色', OM.lColor(1)],
      ['相位色（正瓣）', OM.phaseColor(0, 0.8)],
      ['相位色（负瓣）', OM.phaseColor(Math.PI, 0.8)],
      ['中灰（低密度点云）', [0.5, 0.5, 0.52]],
    ]
    let worst = 0; let which = ''
    for (const [name, rgb] of samples) {
      const r = roundTrip(rgb)
      const e = Math.max(Math.abs(r[0] - rgb[0]), Math.abs(r[1] - rgb[1]), Math.abs(r[2] - rgb[2]))
      if (e > worst) { worst = e; which = name }
    }
    // ★ 容差为什么是 1e-4 而不是 1e-9：three 的 LinearToSRGB 用的是
    //   `Math.pow(c, 0.41666)`（1/2.4 的**截断**值），所以它自己的正反变换并不完全互逆，
    //   往返本身就有 ~6e-6 的固有偏差（实测 p 轨道色 6.21e-6）。
    //   这个量级仍然足以抓住"方向写反"（那会差 ~0.2，见下一条反向对照）。
    ok(worst < 1e-4, 'sRGB → 线性 → sRGB 往返无损（转换方向没写反）',
      `最大偏差 ${worst.toExponential(2)}（${which}）；three 自身正反变换的固有偏差约 6e-6`)

    // ★ 反向对照：**不做转换**时会差多少 —— 这就是被修掉的那个症状的量化
    const c = new THREE.Color().setRGB(0.30, 0.60, 0.90, THREE.LinearSRGBColorSpace)
    c.getRGB(back, THREE.SRGBColorSpace)
    const drift = Math.abs(back.r - 0.30)
    ok(drift > 0.2, '★ 不转换时会被显著洗白（0.30 → 显示成更高的值），证明这一步是必需的',
      `不转换则 0.30 显示成 ${back.r.toFixed(3)}，偏差 ${drift.toFixed(3)}`)
  }

  // ③ 源码级不变量：render3d 里**每一处** color 顶点属性写入都必须过转换。
  //    ★ 为什么要源代码级：render3d.js 依赖 window，无法在 Node 里 import 后直接断言；
  //      而"新加了一个 color 属性却忘了转换"是本项目最可能的下一次回归 ——
  //      它不报错，只是那一块几何被洗白。
  {
    const src = readFileSync(new URL('../render/render3d.js', import.meta.url), 'utf-8')
    const writes = (src.match(/setAttribute\('color'/g) || []).length
    const conv = (src.match(/srgbToLinearArray\(/g) || []).length
    ok(writes > 0, `render3d.js 里有 ${writes} 处 color 顶点属性写入`, '一处都没有？那这条守卫的前提就不成立')
    ok(writes === conv,
      `★ 每处 color 写入都过了色彩空间转换（${writes} 处写入 / ${conv} 处转换）`,
      '有写入点没转换 —— 那处几何会被洗白，而且**不会报错**')
  }
}

// ---------------------------------------------------------------- ⑪ 轨道模型
console.log('【⑪ 轨道模型：氢型 / Slater 型（STO），以及它为何决定了 sp³ 的画法】')
{
  // ★ 这一节把一条**物理主张**钉死：真实的类氢 2s 有径向节点、而 STO 没有，
  //   这正是同一组 sp³ 系数画出来形状不同的原因（也是"教材那个干净的定向瓣
  //   从哪来"的答案）。谁改了 radialR 或系数约定，这里会先红。
  ok(OM.getRadialModel().model === 'hydrogenic',
    '默认是氢型轨道（与知识条目里"2s 有一个径向节点"一致）', OM.getRadialModel().model)

  // ① 氢型 2s 的径向节点在 r = 2a₀
  {
    const z = OM.radialZeros(2, 0, 1)
    ok(z.length === 1 && Math.abs(z[0] - 2) < 1e-6,
      '氢型 2s 的径向节点在 r = 2a₀', JSON.stringify(z))
  }

  OM.setRadialModel('slater')
  ok(OM.getRadialModel().model === 'slater', '能切到 Slater 型')

  // ② STO 的 2s **没有**径向节点 —— 这就是它给出干净方向瓣的原因
  {
    const z = OM.radialZeros(2, 0, 1)
    ok(z.length === 0, '★ STO 的 2s 没有径向节点（教材那个干净 sp³ 瓣的来源）', JSON.stringify(z))
  }

  // ③ STO 的径向形式与 l 无关 → 2s 与 2p 共用同一个径向因子
  {
    const ratio = (r) => OM.radialR(2, 0, r, 1) / OM.radialR(2, 1, r, 1)
    const vals = [1, 4, 9].map(ratio)
    ok(vals.every((v) => Math.abs(v - 1) < 1e-12),
      '★ STO 的 2s 与 2p 径向形式**完全相同**（比值恒为 1）',
      vals.map((v) => v.toFixed(12)).join(' / '))
  }

  // ④ sp³ 的 ψ(+d)/ψ(−d) 在任何 r 上都恰好是 −2 —— 纯角度形状
  {
    const terms = [
      { n: 2, l: 0, m: 0, mode: 'real', c: { re: 0.5, im: 0 } },
      { n: 2, l: 1, m: 1, mode: 'real', c: { re: 0.5, im: 0 } },
      { n: 2, l: 1, m: -1, mode: 'real', c: { re: 0.5, im: 0 } },
      { n: 2, l: 1, m: 0, mode: 'real', c: { re: 0.5, im: 0 } },
    ]
    const d = [1, 1, 1].map((v) => v / Math.sqrt(3))
    const neg = d.map((v) => -v)
    const toSph = (v) => [Math.acos(Math.max(-1, Math.min(1, v[2]))), Math.atan2(v[1], v[0])]
    const psi = (r, dir) => {
      const [t, p] = toSph(dir)
      return OM.psiSuperposition(terms, r, t, p, null, 1).re
    }
    let worst = 0
    for (const r of [1, 2, 3, 5, 8, 12]) {
      const a = psi(r, d); const b = psi(r, neg)
      worst = Math.max(worst, Math.abs(a / b + 2))
    }
    ok(worst < 1e-9,
      '★ STO 下 sp³ 的 ψ(+d)/ψ(−d) 在任何 r 上都恰好是 −2（纯角度形状 = 教材那个瓣）',
      `最大偏差 ${worst.toExponential(2)}`)
  }

  // ⑤ 切回氢型必须**完全复原**（切换不留残留状态）
  OM.setRadialModel('hydrogenic')
  {
    const z = OM.radialZeros(2, 0, 1)
    ok(z.length === 1 && Math.abs(z[0] - 2) < 1e-6,
      '★ 切回氢型后径向节点回来了（切换不留残留状态）', JSON.stringify(z))
    ok(Math.abs(OM.radialR(2, 0, 2, 1)) < 1e-12,
      '切回后 R₂₀ 在节点处确实为 0（不是"看起来像"）', String(OM.radialR(2, 0, 2, 1)))
  }

  // ⑥ ζ 可手工覆盖（想用 Slater 规则的值时直接填）
  {
    OM.setRadialModel('slater', 1.625)      // 碳的 2s/2p 标准值
    ok(OM.getRadialModel().zeta === 1.625, 'ζ 可以被手工覆盖（如碳的 1.625）')
    const atZeta = OM.radialR(2, 0, 1, 6)
    OM.setRadialModel('slater')             // 回到默认 ζ = Z/n = 3
    const atDefault = OM.radialR(2, 0, 1, 6)
    ok(Math.abs(atZeta - atDefault) > 1e-6,
      'ζ 不同则取值不同（覆盖真的生效了，不是摆设）', `${atZeta.toFixed(6)} vs ${atDefault.toFixed(6)}`)
    OM.setRadialModel('hydrogenic')         // 复位，别影响后面的用例
  }
}

// ---------------------------------------------------------------- ⑫ 等价轨道互为旋转
console.log('【⑫ 等价杂化轨道互为旋转 —— "多轨道同屏只需算一份标量场"的全部依据】')
{
  // ★ 这一节守的不是"某个数对不对"，而是一条**被拿来做性能优化的物理主张**：
  //   四个 sp³ 等值面同屏，若老老实实算 4 份 68³ 标量场、抽 4 次面，
  //   在本环境里就是 4×(10–15 s)。之所以能只算一份、其余靠旋转几何体得到，
  //   唯一依据就是  ψᵢ(x) = ψ₀(Rᵢ⁻¹x)（s 在旋转下不变，三个 p 按矢量变换）。
  //   这条一旦不成立，画面就是**错的**，而且看起来完全正常——四个瓣、四种颜色、
  //   指向四个方向，谁也不会怀疑它其实不是 sp³。
  const { Hybrids } = await import('../core/hybrids.js')

  /** Rodrigues：由轴 + 角构造 3×3 旋转矩阵（行主序，作用在列向量上） */
  function rot(axis, angle) {
    const n = Math.hypot(axis[0], axis[1], axis[2]) || 1
    const [x, y, z] = [axis[0] / n, axis[1] / n, axis[2] / n]
    const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c
    return [
      [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
      [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
      [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
    ]
  }
  const apply = (M, v) => [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ]
  const det3 = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
    - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
    + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])

  const toSph = (v) => [Math.acos(Math.max(-1, Math.min(1, v[2]))), Math.atan2(v[1], v[0])]
  const evalTerms = (terms, r, dir) => {
    const [t, p] = toSph(dir)
    return OM.psiSuperposition(terms, r, t, p, null, 1).re
  }

  // 固定的伪随机方向（写死种子，避免"这次绿下次红"）
  const dirs = []
  let seed = 20261001
  for (let i = 0; i < 12; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    const u = (seed / 2147483648) * 2 - 1
    seed = (seed * 1103515245 + 12345) % 2147483648
    const ph = (seed / 2147483648) * 2 * Math.PI
    const s = Math.sqrt(Math.max(0, 1 - u * u))
    dirs.push([s * Math.cos(ph), s * Math.sin(ph), u])
  }

  for (const set of Hybrids.SETS) {
    const t0 = Hybrids.terms(set.id, 0)
    // ① 旋转必须是**正当旋转**（det = +1）。若是镜像，画出来是四面体的镜像分子。
    let worstDet = 0
    for (let i = 0; i < set.count; i++) {
      const R = Hybrids.rotation(set.id, i)
      worstDet = Math.max(worstDet, Math.abs(det3(rot(R.axis, R.angle)) - 1))
    }
    ok(worstDet < 1e-12, `${set.id}：${set.count} 个旋转的 det 都 = +1（不是镜像）`,
      `最大偏差 ${worstDet.toExponential(2)}`)

    // ② ★ 主断言：ψᵢ(x) = ψ₀(Rᵢ⁻¹x)，逐点
    let worst = 0; let where = ''
    for (let i = 1; i < set.count; i++) {
      const ti = Hybrids.terms(set.id, i)
      const R = Hybrids.rotation(set.id, i)
      const Rinv = rot(R.axis, -R.angle)
      for (const d of dirs) {
        for (const r of [0.7, 2, 5, 11]) {
          const a = evalTerms(ti, r, d)                 // 第 i 个在点 x 上的值
          const b = evalTerms(t0, r, apply(Rinv, d))    // 第 0 个在 R⁻¹x 上的值
          const e = Math.abs(a - b)
          if (e > worst) { worst = e; where = `${set.id}-${i + 1}, r=${r}` }
        }
      }
    }
    ok(worst < 1e-12,
      `★ ${set.id}：ψᵢ(x) ≡ ψ₀(Rᵢ⁻¹x)（${dirs.length} 方向 × 4 个半径）—— 等值面可以靠旋转得到`,
      `最大偏差 ${worst.toExponential(2)}（${where}）`)

    // ③ 两两正交：⟨hᵢ|hⱼ⟩ = 0（基函数正交归一，故系数向量点积即可）
    let worstDot = 0
    for (let i = 0; i < set.count; i++) {
      for (let j = i + 1; j < set.count; j++) {
        const a = Hybrids.terms(set.id, i), b = Hybrids.terms(set.id, j)
        let dot = 0
        for (const t of a) {
          const m = b.find((u) => u.n === t.n && u.l === t.l && u.m === t.m && u.mode === t.mode)
          if (m) dot += t.c.re * m.c.re + t.c.im * m.c.im
        }
        worstDot = Math.max(worstDot, Math.abs(dot))
      }
    }
    ok(worstDot < 1e-12, `${set.id}：${set.count} 个轨道两两正交（⟨hᵢ|hⱼ⟩ = 0）`,
      `最大 |⟨hᵢ|hⱼ⟩| = ${worstDot.toExponential(2)}`)

    // ④ 归一化：Σ|c|² = 1（否则"每个轨道一个电子"这句话就不成立）
    let worstNorm = 0
    for (let i = 0; i < set.count; i++) {
      let n2 = 0
      for (const t of Hybrids.terms(set.id, i)) n2 += t.c.re * t.c.re + t.c.im * t.c.im
      worstNorm = Math.max(worstNorm, Math.abs(n2 - 1))
    }
    ok(worstNorm < 1e-12, `${set.id}：每个轨道都归一化（Σ|c|² = 1）`,
      `最大偏差 ${worstNorm.toExponential(2)}`)

    // ⑥ 轨道数必须等于**化学事实**：sp³ 四个、sp² 三个、sp 两个。
    //
    // ★ 这一条是补写的，起因是一次**故障注入没有变红**：我把 sp3 的 count 改成 3，
    //   107 项断言全绿。原因是上面那些检查全是"在 count 给定的范围内自洽"——
    //   正交、归一、互为旋转，只检查 3 个也全都成立。缺的正是"到底该有几个"。
    //   而它的失效形态很轻：画面上少一个瓣，看起来仍然像"一组杂化轨道"。
    const EXPECT = { sp3: 4, sp2: 3, sp: 2 }
    ok(set.count === EXPECT[set.id], `${set.id} 的等价轨道数 = ${EXPECT[set.id]}`,
      `实际 ${set.count}`)
    ok(set.labels.length === set.count && set.colors.length === set.count,
      `${set.id}：labels / colors 与 count 一致（各 ${set.count} 个）`,
      `labels ${set.labels.length}、colors ${set.colors.length}`)
    ok(Hybrids.terms(set.id, set.count - 1) !== null && Hybrids.terms(set.id, set.count) === null,
      `${set.id}：可取的下标正好是 0..${set.count - 1}（不重不漏）`)

    // ⑤ 颜色：每个轨道一种、互不相同，且**避开相位色的红与青**
    const cols = []
    for (let i = 0; i < set.count; i++) cols.push(Hybrids.color(set.id, i))
    let minDist = Infinity
    for (let i = 0; i < cols.length; i++) {
      for (let j = i + 1; j < cols.length; j++) {
        minDist = Math.min(minDist, Math.hypot(
          cols[i][0] - cols[j][0], cols[i][1] - cols[j][1], cols[i][2] - cols[j][2]))
      }
    }
    ok(minDist > 0.2, `${set.id}：${set.count} 个轨道色两两可分辨`, `最近的一对距离 ${minDist.toFixed(3)}`)
    // ★ 与相位色（红 0.933,0.173,0.173 / 青 0.173,0.933,0.933）必须离得开：
    //   混在一起会让人以为那片颜色是"相位的正负"，而它其实只是"哪个轨道"。
    const phase = [[0.933, 0.173, 0.173], [0.173, 0.933, 0.933]]
    let clash = Infinity
    for (const c of cols) for (const p of phase) {
      clash = Math.min(clash, Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]))
    }
    ok(clash > 0.3, `${set.id}：轨道色与相位色（红/青）不撞车`, `最近距离 ${clash.toFixed(3)}`)
  }

  // ⑥ 未知集合要**返回 null 而不是抛**（调用方据此报错，让模型看到原因）
  ok(Hybrids.terms('sp4', 0) === null, '未知集合 id 返回 null（不抛）')
  ok(Hybrids.terms('sp3', 9) === null, '越界下标返回 null')
  ok(Hybrids.rotation('sp3', -1) === null, '负下标返回 null')
  ok(Hybrids.setIds().join(',') === 'sp3,sp2,sp', '集合 id 清单稳定（sp3,sp2,sp）', Hybrids.setIds().join(','))
}

// ---------------------------------------------------------------- 汇总
console.log('')
console.log('═══════════════════════════════════════════════════════════════')
if (fail === 0) {
  console.log(`test-orbit-core 结果：通过 ${pass} 项，失败 0 项`)
  console.log('═══════════════════════════════════════════════════════════════')
  process.exit(0)
} else {
  console.log(`test-orbit-core 结果：通过 ${pass} 项，失败 ${fail} 项`)
  for (const b of bad.slice(0, 25)) console.log('  ✗ ' + b)
  console.log('═══════════════════════════════════════════════════════════════')
  process.exit(1)
}
