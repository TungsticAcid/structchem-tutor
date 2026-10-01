/**
 * 对称元素封闭生成器（生成元 + 群封闭生成法）
 * 思路：用原子几何候选 + 惯性主轴构造候选对称操作（允许漏检/多检），
 *       取其中"最接近真对称"者作为生成元，做群的封闭复合直至闭合，得到完整点群操作集；
 *       再把操作集按"轴方向/法向 × 阶"投影回对称元素。
 * 关键性质：
 *  - 群封闭性会自动补全候选漏检的对称元素（只要少数生成元生成了整个群）；
 *  - 也会"出清"误检候选（其复合不能通过对称性验证）；
 *  - 点群是输出而非输入——对未知点群分子同样可行。
 */
import * as ops from './operations.js'
import { candidateAxisDirs, candidateMirrorNormals } from './detectElements.js'
import { inertiaTensor, jacobiEigen, extractAtomsCentered } from './inertia.js'

const {
  matMul, identityMatrix, rotationMatrix, reflectionMatrix, inversionMatrix, improperRotationMatrix,
  isSymmetryOperation, isRotation, isReflection, isInversion, isImproperRotation,
  normalize, det3, trace3, rotationToAxisAngle, refineNormal
} = ops

/** 方向规范化键（± 视为同一，用于轴/法向无向去重） */
function dirKey(v) {
  const n = normalize(v)
  let s = 1
  for (const x of n) { if (Math.abs(x) > 1e-6) { s = x < 0 ? -1 : 1; break } }
  return [n[0] * s, n[1] * s, n[2] * s].map(x => Math.round(x * 60)).join(',')
}

/**
 * 矩阵语义等价去重键（量化到 1e-3）：
 *  - 真实对称操作矩阵浮点追踪累积误差 ~1e-6，量化后同键（同一操作的不同计算路径合并）。
 *  - 群封闭复合若产生"接近恒等"的微小旋转矩阵（阶数千，元素差 ~1e-4），量化后与恒等同键 → 合并，
 *    不会把它当作新元素继续复合（否则群封闭逐步放大而无限膨胀）。
 *  - 真正不同的对称操作（如 C3 与 C3²、σ 与 C）矩阵元素差 >0.1 > 0.0005，必然不同键。
 */
function matKey(m) {
  return m.map(x => Math.round(x * 1e3)).join(',')
}

/** 两方向夹角（弧度，含反向取较小者——轴/法向无向） */
function angleBetween(a, b) {
  const na = Math.hypot(...a), nb = Math.hypot(...b)
  if (na < 1e-12 || nb < 1e-12) return 0
  const c = Math.abs((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (na * nb))
  return Math.acos(Math.max(-1, Math.min(1, c)))
}

/**
 * 方向按夹角分组（15°，± 视为同一）：同一条真实轴/面附近的多个微变体方向归为一组，
 * 避免每个微变体都被当作独立候选（那会把同一操作判为多个不同矩阵而致群封闭膨胀）。
 * @returns {Array<{rep:number[], members:number[][]}>}
 */
function groupDirs(dirs, tolAng = 15 * Math.PI / 180) {
  const groups = []
  for (const d of dirs) {
    if (Math.hypot(...d) < 1e-9) continue
    let found = false
    for (const g of groups) {
      if (angleBetween(d, g.rep) < tolAng) { g.members.push(d); found = true; break }
    }
    if (!found) groups.push({ rep: normalize(d), members: [normalize(d)] })
  }
  return groups
}

/** 方向去重（± 视为同一） */
function dedupeDirs(dirs) {
  const seen = new Set()
  const out = []
  for (const v of dirs) {
    if (Math.hypot(...v) < 1e-9) continue
    const k = dirKey(v)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(normalize(v))
  }
  return out
}

/**
 * 收集候选方向：惯性主轴 + 原子几何候选（单原子/原子对中点/三点轴/面法向）。
 * 高对称方向（甲烷体对角、C60 的 C5/C3/C2、SF6 的坐标/体对角/面对角）均由原子几何候选覆盖，
 * 无需引入固定"标准取向/二十面体"方向——那会污染低对称分子（把无意义方向误判为近对称，
 * 导致群封闭膨胀）。允许候选方向偶有遗漏：只要生成元能生成整个群，封闭化即补全。
 * @returns {number[][]} 候选方向（单位向量）
 */
function collectCandidateDirs(atoms) {
  const dirs = []
  const push = (v) => { if (v && Math.hypot(...v) > 1e-9) dirs.push(v) }
  const { vectors } = jacobiEigen(inertiaTensor(atoms))
  for (const v of vectors) push(v)
  for (const v of candidateAxisDirs(atoms)) push(v)
  for (const v of candidateMirrorNormals(atoms)) push(v)
  return dedupeDirs(dirs)
}

/**
 * 矩阵作为对称操作的"匹配余量"：每个原子（同元素、容差内）双射匹配到最近目标，
 * 返回各原子最大匹配距离；若任一原子无法匹配（>tol）返回 Infinity。
 * 真实对称操作的匹配余量≈0，而"近对称轴/面"（方向偏 0.05°~数度仍勉强通过容差）余量>0.01，
 * 据此可选出每组内最接近真对称方向的代表，剔除误收的近对称候选。
 */
function symmetryResidual(atoms, matrix, tol) {
  const n = atoms.length
  const used = new Array(n).fill(false)
  let maxd = 0
  for (let i = 0; i < n; i++) {
    const tp = ops.applyMatrix(matrix, atoms[i].xyz)
    let best = Infinity, bj = -1
    for (let j = 0; j < n; j++) {
      if (used[j] || atoms[j].element !== atoms[i].element) continue
      const d = Math.hypot(tp[0] - atoms[j].xyz[0], tp[1] - atoms[j].xyz[1], tp[2] - atoms[j].xyz[2])
      if (d < best) { best = d; bj = j }
    }
    if (bj < 0 || best > tol) return Infinity
    used[bj] = true
    if (best > maxd) maxd = best
  }
  return maxd
}

/**
 * 构造生成元池：只收"高置信"的对称操作作为生成元。
 * 方向按 15° 分组，组内对每个成员方向测各阶，选「匹配余量最小」者作为该组的代表生成元：
 * 这样同一真实轴/面附近的微变体合并成一个，且一定选中"最接近真对称"的方向（余量≈0），
 * 彻底剔除"近对称但非真"的假操作——它们正是群封闭膨胀（产生近恒等假矩阵）与误检出的源头。
 * 每方向只取「最高真旋转阶 C_n」「最高旋反阶 S_n」「σ」：子阶（如 C4²=C2）由群封闭自动生成。
 */
function buildGenerators(atoms, tol) {
  const genTol = Math.min(tol, 0.05)
  const gens = []
  const seen = new Set()
  const add = (m) => {
    if (!isSymmetryOperation(atoms, m, genTol)) return
    const k = matKey(m)
    if (seen.has(k)) return
    seen.add(k)
    gens.push(m)
  }
  add(identityMatrix())
  for (const grp of groupDirs(collectCandidateDirs(atoms))) {
    let bestC = null, bestS = null, bestSig = null
    // 代表选择：优先匹配余量小；余量相当（都≈0，即都是真对称）时取更高阶（避免误选子阶作生成元）
    const better = (r, order, cur) =>
      cur === null || r < cur.r - 1e-9 || (Math.abs(r - cur.r) <= 1e-9 && order > cur.order)
    for (const dir of grp.members) {
      const ax = normalize(dir)
      for (const k of [6, 5, 4, 3, 2]) {
        const m = rotationMatrix(ax, 2 * Math.PI / k)
        const r = symmetryResidual(atoms, m, genTol)
        if (better(r, k, bestC)) bestC = { m, r, order: k }
      }
      for (const k of [10, 8, 6, 5, 4, 3]) {
        const m = improperRotationMatrix(ax, k)
        const r = symmetryResidual(atoms, m, genTol)
        if (better(r, k, bestS)) bestS = { m, r, order: k }
      }
      const mr = reflectionMatrix(ax)
      const rs = symmetryResidual(atoms, mr, genTol)
      if (!bestSig || rs < bestSig.r) bestSig = { m: mr, r: rs }
    }
    if (bestC && bestC.r < genTol) add(bestC.m)
    if (bestS && bestS.r < genTol) add(bestS.m)
    if (bestSig && bestSig.r < genTol) add(bestSig.m)
  }
  add(inversionMatrix())
  return gens
}

/**
 * 群封闭生成：从生成元出发，反复复合并用对称性验证，直至操作集闭合。
 * 有限点群阶数 ≤ 120；若独立矩阵数超过上限（如 200），说明假生成元混入，主动放弃避免无限增殖。
 * @param {Array} atoms - 质心系原子
 * @param {number[][]} generators - 已验证的生成元
 * @param {number} tol
 * @returns {number[][]} 完整点群操作集（矩阵）
 */
function closeGroup(atoms, generators, tol) {
  const vTol = Math.min(tol, 0.06)   // 复合验证用较严容差：真群元匹配≈0，拒"接近某操作"的假矩阵（它是多检/膨胀之源）
  const group = []
  const seen = new Set()
  const push = (m) => {
    if (!isSymmetryOperation(atoms, m, vTol)) return false   // 群封闭性：复合必须仍是对称操作
    const k = matKey(m)
    if (seen.has(k)) return false
    if (group.length >= 200) throw new Error('群封闭生成超过上限（疑似假生成元混入）')
    seen.add(k)
    group.push(m)
    return true
  }
  const gens = []
  for (const g of generators) if (push(g)) gens.push(g)
  // BFS：group 中每个元素 × 每个生成元，不断吸收新元素直至闭合（有限群必然收敛）
  for (let i = 0; i < group.length; i++) {
    const g = group[i]
    for (const h of gens) push(matMul(g, h))
  }
  return group
}

// ==================== 操作集 → 对称元素 ====================

/**
 * 由完整点群操作集投影对称元素。
 * 关键：不直接凭单个矩阵的 trace 推阶（那会把 S_n 的高次幂误判为低阶 S_m，如 S10³→S3），
 * 而是从操作集中提取（轴方向/法向），再对每个方向**重测各阶** isRotation/isImproperRotation/isReflection
 * （用严格容差），得到该方向真实存在的对称元素。同一几何方向的 C_n 与其子阶（C6 与 C3、C2）为独立
 * 共轭类 → 都列出；真旋转轴与旋反轴同轴 → 分别列出（拆列）。
 * @param {Array} atoms - 质心系原子
 * @param {number[][]} ops - 完整点群操作集
 * @param {number} tol
 * @returns {Array<{type, order, axis}>}
 */
function projectElements(atoms, ops, tol) {
  const genTol = Math.min(tol, 0.05)
  const rotDirs = []
  const improDirs = []
  const sigNormals = []
  let hasInv = false
  for (const m of ops) {
    const det = det3(m)
    const tr = trace3(m)
    if (det > 0) {
      const r = rotationToAxisAngle(m)
      if (r && Math.hypot(...r.axis) > 1e-9) rotDirs.push(normalize(r.axis))
    } else if (Math.abs(tr + 3) < 0.05) {
      hasInv = true
    } else if (Math.abs(tr - 1) < 0.05) {
      sigNormals.push(normalize(refineNormal(m)))
    } else {
      const r = rotationToAxisAngle(m.map(v => -v))   // -M 为纯旋转 → 旋反轴方向
      if (r && Math.hypot(...r.axis) > 1e-9) improDirs.push(normalize(r.axis))
    }
  }
  const elements = []
  const seen = new Set()
  // 旋转轴：同一几何方向各阶（C6/C3/C2）独立成类，都列出
  for (const grp of groupDirs(rotDirs)) {
    for (const k of [6, 5, 4, 3, 2]) {
      let ax = null
      for (const d of grp.members) if (isRotation(atoms, normalize(d), k, genTol)) { ax = normalize(d); break }
      if (!ax) continue
      const key = 'C' + k + '|' + dirKey(ax)
      if (seen.has(key)) continue
      seen.add(key)
      elements.push({ type: 'C' + k, order: k, axis: ax })
    }
  }
  // 旋反轴：同一几何方向各阶（如 D6h 主轴向的 S6 与 S3）独立成类，都列出（isImproperRotation 会过滤不存在的阶）
  for (const grp of groupDirs(improDirs)) {
    for (const k of [10, 8, 6, 5, 4, 3]) {
      let ax = null
      for (const d of grp.members) if (isImproperRotation(atoms, normalize(d), k, genTol)) { ax = normalize(d); break }
      if (!ax) continue
      const key = 'S' + k + '|' + dirKey(ax)
      if (seen.has(key)) continue
      seen.add(key)
      elements.push({ type: 'S' + k, order: k, axis: ax })
    }
  }
  // 反映面：按法向去重（σ_h/σ_v/σ_d 交由命名层细分）
  for (const grp of groupDirs(sigNormals)) {
    let ax = null
    for (const d of grp.members) if (isReflection(atoms, normalize(d), genTol)) { ax = normalize(d); break }
    if (!ax) continue
    const key = 'sigma|' + dirKey(ax)
    if (!seen.has(key)) { seen.add(key); elements.push({ type: 'sigma', order: 1, axis: ax }) }
  }
  if (hasInv) elements.push({ type: 'i', order: 1, axis: null })
  return elements
}

// ==================== 线性分子（无限群特判） ====================

/**
 * 线性分子对称元素（C∞v / D∞h）：
 *  - 主旋转轴 C∞（分子轴）
 *  - 无穷多竖直面 ∞σv（含分子轴的平面）
 *  - D∞h 额外：反演 i、∞C2（垂直分子轴）、2S∞（旋反）
 * @param {number[]} axis - 分子轴单位向量
 * @param {boolean} hasInversion - 是否有对称中心（→D∞h）
 * @returns {Array}
 */
export function linearSymmetryElements(axis, hasInversion) {
  const el = [{ type: 'C∞', order: Infinity, axis }]
  el.push({ type: 'sigma_v', order: 1, axis: perpendicularTo(axis) })  // 竖直面代表（∞σv，法向取任意⊥分子轴方向）
  if (hasInversion) {
    el.push({ type: 'sigma_h', order: 1, axis })                        // 垂直分子轴的水平面（D∞h）
    el.push({ type: 'i', order: 1, axis: null })
    el.push({ type: 'C2', order: 2, axis: perpendicularTo(axis) })      // ∞C2（垂直轴）
    el.push({ type: 'S∞', order: Infinity, axis })                      // 2S∞
  }
  return el
}

/** 与轴垂直的任一单位向量 */
function perpendicularTo(a) {
  const n = normalize(a)
  const ref = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const d = ref[0] * n[0] + ref[1] * n[1] + ref[2] * n[2]
  return normalize([ref[0] - d * n[0], ref[1] - d * n[1], ref[2] - d * n[2]])
}

// ==================== 主入口 ====================

/**
 * 从分子几何确定性地生成完整对称元素清单（点群为输出）
 * @param {Object|Array} molecule - 分子结构（{atoms:[{element,xyz}]}）或已质心系原子数组
 * @param {number} [tol] - 位置容差
 * @returns {{ elements: Array, groupOps: number[][], groupOrder: number, linear: boolean }}
 */
export function generateSymmetryElements(molecule, tol = 0.15) {
  const atoms = Array.isArray(molecule)
    ? molecule
    : extractAtomsCentered(molecule)
  // 线性分子：无法有限封闭，按 C∞v / D∞h 特判
  const { values, vectors } = jacobiEigen(inertiaTensor(atoms))
  if (values[2] > 1e-9 && values[0] / values[2] < 0.01) {
    const axis = normalize(vectors[0])      // 最小惯量轴 = 分子轴
    const hasI = isInversion(atoms, tol)
    return { elements: linearSymmetryElements(axis, hasI), groupOps: [], groupOrder: Infinity, linear: true }
  }
  const generators = buildGenerators(atoms, tol)
  const groupOps = closeGroup(atoms, generators, tol)
  return { elements: projectElements(atoms, groupOps, tol), groupOps, groupOrder: groupOps.length, linear: false }
}
