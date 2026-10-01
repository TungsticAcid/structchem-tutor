/**
 * compare-tools.js — 双晶体对比（数据层）
 *
 * 回答"NaCl 和 CsCl 有什么区别"这类问题。
 *
 * ★ 为什么**先做数据层**、而不是直接上并排三维视图：
 *   这类问题的答案本质是**数据**——点阵型式（cF vs cP）、配位数（6:6 vs 8:8）、
 *   空间群、堆积方式、晶胞参数。两个模型并排摆在屏幕上**不会自动告诉学生
 *   "配位数不同"**，他们得自己数，而那恰恰是最容易数错的地方。
 *   结构化对照表 + 逐项差异点，才是直接回答"有什么区别"的东西。
 *   三维并排（`openCompareView` 动作 → 对比页）作为补充，供学生自己转着看。
 *
 * ★ 数值一律程序算：体积、密度、最近邻、晶胞原子数**全部由程序从数据算出**，
 *   与单晶体查询走的是**同一批函数**（module/tools.js），不另写一份——
 *   另写就会丢掉密度计算里的 Z 陷阱守卫（详见 tools.js）。
 *
 * ★ 字段对照要**逐项标明是否相同**：不标的话模型会自己归纳，而"看起来差不多"
 *   与"真的相同"是两回事（如 quartz 与 cristobalite 的晶系相同、点阵型式相同，
 *   但结构基元与空间群不同）。
 */

const def = (name, description, properties, required) => ({
  type: 'function',
  function: {
    name, description,
    parameters: { type: 'object', properties: properties || {}, required: required || [] },
  },
})

/** 字段的中文名（给学生看的对照表要用它，而不是 crystalSystem 这种键名） */
const FIELD_LABELS = {
  crystalSystem: '晶系',
  spaceGroup: '空间群',
  latticeType: '点阵型式',
  structuralUnit: '结构基元',
  coordination: '配位数',
  packingDescription: '堆积方式',
  spaceUtilization: '空间利用率',
  formula: '化学式',
  name: '名称',
}

/**
 * @param {Object} opts
 * @param {Object}   opts.facade  模块门面（校验 id 是否真实存在）
 * @param {Function} opts.loadData (id) => 晶体数据
 * @param {Object}   opts.compute  确定性计算（module/tools.js 的那一批，不另写）
 */
export function createCompareTools(opts = {}) {
  const { facade, loadData, compute } = opts
  if (typeof loadData !== 'function') throw new Error('createCompareTools 需要 loadData')
  if (!compute) throw new Error('createCompareTools 需要 compute（引用 module/tools.js，不得另写）')

  const defs = {
    query: [
      def('compareCrystals',
        '对比两个晶体的**结构化差异**，含逐字段对照（晶系/空间群/点阵型式/结构基元/配位数/'
        + '堆积方式）与由程序计算的数值对照（晶胞体积/密度/最近邻/晶胞原子数）。'
        + '返回里 `differences` 列出**不相同的字段**，那是"有什么区别"的直接答案。'
        + '两个 id 必须来自 listCrystals 的返回值，禁止编造。', {
        a: { type: 'string', description: '第一个晶体的 id' },
        b: { type: 'string', description: '第二个晶体的 id' },
      }, ['a', 'b']),
    ],
  }

  const handlers = {
    compareCrystals(p) {
      const idA = p && p.a
      const idB = p && p.b
      if (!idA || !idB) return { error: '需要两个晶体 id（a 与 b）' }
      if (idA === idB) return { error: '两个 id 相同，没有可对比的内容' }

      const A = loadData(idA)
      const B = loadData(idB)
      if (!A) return { error: `未找到晶体：${idA}（id 必须来自 listCrystals 的返回值）` }
      if (!B) return { error: `未找到晶体：${idB}（id 必须来自 listCrystals 的返回值）` }

      // ---- 字段对照（逐项标明异同）----
      const fields = ['formula', 'crystalSystem', 'spaceGroup', 'latticeType',
        'structuralUnit', 'coordination', 'packingDescription', 'spaceUtilization']
      const rows = fields.map((f) => ({
        field: f,
        label: FIELD_LABELS[f] || f,
        a: A[f] == null ? '' : String(A[f]),
        b: B[f] == null ? '' : String(B[f]),
        same: String(A[f] == null ? '' : A[f]) === String(B[f] == null ? '' : B[f]),
      }))

      // ---- 数值对照（全部由程序算）----
      const num = (d) => {
        const V = compute.cellVolume(d.lattice)
        const dens = compute.computeDensity(d)
        const nn = compute.nearestSameAtomDistance(d)
        return {
          atomCount: compute.atomCount(d),
          cellVolumeA3: V == null ? null : Number(V.toFixed(4)),
          density: dens && !dens.err ? dens.density : null,
          nearestNeighborA: nn && !nn.err ? nn.distance : null,
          lattice: d.lattice || null,
        }
      }
      const na = num(A)
      const nb = num(B)

      const numeric = [
        { label: '晶胞内原子数', a: na.atomCount, b: nb.atomCount, unit: '' },
        { label: '晶胞体积', a: na.cellVolumeA3, b: nb.cellVolumeA3, unit: 'Å³' },
        { label: '理论密度', a: na.density, b: nb.density, unit: 'g/cm³' },
        { label: '最近邻同种原子间距', a: na.nearestNeighborA, b: nb.nearestNeighborA, unit: 'Å' },
      ].map((r) => Object.assign(r, { same: r.a === r.b }))

      const differences = rows.filter((r) => !r.same).map((r) => r.label)

      return {
        a: { id: A.id, name: A.name, formula: A.formula },
        b: { id: B.id, name: B.name, formula: B.formula },
        rows,
        numeric,
        /** ★ "有什么区别"的直接答案：这些字段两边不同 */
        differences,
        same: rows.filter((r) => r.same).map((r) => r.label),
        note: '字段为数据原文；数值（原子数/体积/密度/最近邻）由程序计算。',
        tip: '若需并排观察，可用 openCompareView 动作打开对比视图。',
      }
    },
  }

  const names = () => defs.query.map((d) => d.function.name)
  return { defs, handlers, names }
}

export default createCompareTools
