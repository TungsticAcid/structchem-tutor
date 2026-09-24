/**
 * tools.js — 晶体模块的工具定义与执行（契约的"能力面"）
 *
 * 分工：`packages/agent-core/core/tool-registry.js` 提供机制（按节点白名单过滤、
 * 执行期二次把关、错误归一化）；本文件提供**定义与实现**。模块只声明自己贡献什么
 * 工具，谁有权限调用由 nodes/constraints.js 裁决（CLAUDE.md §一.1）。
 *
 * ★ 「数值一律程序算」在本文件的落点（CLAUDE.md §一.2）：
 *   晶胞体积、密度、最近邻距离**全部由程序从晶体数据算出**，模型不得口算、也不得记忆。
 *   工具返回的是事实，模型只负责组织语言。返回里带上 formula/单位/中间量，
 *   是为了让"这个数是怎么来的"可核查——出了问题能定位到算法，而不是只能怀疑模型。
 *
 * ★ 本文件不 import three.js/DOM，可在 Node 里测试（几何计算来自 packages/viewer/geometry.js，
 *   那是纯数学）。
 */
import { fractionalToCartesian } from '../../packages/viewer/geometry.js'
import { parseFormula, molarMass, AVOGADRO } from '../../packages/knowledge/shared/formula.js'
import { LAYER_PROPS, listActions } from './actions.js'

/** 1 Å³ = 1e-24 cm³（密度换算用） */
const ANG3_TO_CM3 = 1e-24

/** 晶胞体积（通用三斜公式，立方/六方等都自动退化） */
export function cellVolume(lattice) {
  const { a, b, c, alpha, beta, gamma } = lattice
  const rad = (d) => (d * Math.PI) / 180
  const ca = Math.cos(rad(alpha)); const cb = Math.cos(rad(beta)); const cg = Math.cos(rad(gamma))
  const f = 1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg
  if (!(f > 0)) return null
  return a * b * c * Math.sqrt(f)
}

/** 晶胞内原子总数（= Σ positions.length，即该晶胞实际含多少原子） */
export function atomCount(crystalData) {
  let n = 0
  for (const g of crystalData.atoms || []) n += (g.positions || []).length
  return n
}

/**
 * 密度 ρ = Z·M / (N_A·V)
 *
 * ★ Z 是**化学式单位数**，不是晶胞内的原子数 —— 这是本函数最容易写错的一处，
 *   而错了不会报错、只会给出一个"看起来合理"的错数：
 *     NaCl 晶胞含 8 个原子（4 Na + 4 Cl），但只有 **4 个 NaCl 单位**。
 *     取 8 会算出 4.37 g/cm³（真值 2.19）——数值本身不荒谬，所以极难发现。
 *   故 Z = 晶胞原子数 ÷ 每个化学式单位的原子数。
 *
 * ★ 摩尔质量用数据里的化学式求。若化学式里有元素表查不到的元素，
 *   **拒绝出结果**（返回 {err}），而不是拿一个缺项的摩尔质量去算——
 *   那同样会给出"看起来合理"的错数。
 *
 * @param {Object} crystalData
 * @returns {Object} 成功时含 density/Z/molarMass/volumeA3/formula/unit/formulaLatex
 */
export function computeDensity(crystalData) {
  const lat = crystalData.lattice
  if (!lat) return { err: '该晶体数据没有晶胞参数，无法算密度' }
  const V = cellVolume(lat)
  if (!V || !(V > 0)) return { err: '晶胞参数非法（体积为 0 或负）' }

  const formula = crystalData.formula || (crystalData.name || '').replace(/型$/, '')
  const counts = parseFormula(formula)
  const { mass, unknown } = molarMass(counts)
  if (unknown.length) {
    return { unknownElements: unknown, err: `化学式 ${formula} 含元素表中的未知元素：${unknown.join(', ')}` }
  }
  if (!(mass > 0)) return { err: `化学式 ${formula} 解析不出元素` }

  // 每个化学式单位含几个原子（NaCl → 2，Cu → 1）
  const atomsPerFormula = Object.values(counts).reduce((a, b) => a + b, 0)
  if (!(atomsPerFormula > 0)) return { err: `化学式 ${formula} 解析不出原子数` }

  const cellAtoms = atomCount(crystalData)
  if (!(cellAtoms > 0)) return { err: '晶胞内没有原子' }
  const Z = cellAtoms / atomsPerFormula
  if (!Number.isInteger(Z)) {
    // 不为整数说明"晶胞内容"与"化学式"对不上——这本身是数据问题，必须报出来而不是四舍五入
    return { err: `晶胞内 ${cellAtoms} 个原子 ÷ 每单位 ${atomsPerFormula} 个原子 = ${Z}，不是整数：`
      + `说明数据里的化学式与晶胞内容对不上（见 数据核查报告.md 的结构基元自洽性检查）` }
  }

  const density = (Z * mass) / (AVOGADRO * V * ANG3_TO_CM3)
  return {
    density: +density.toFixed(4),
    formula: 'ρ = Z·M/(N_A·V)',
    Z,
    Znote: `Z = ${Z}（化学式单位数 = 晶胞内 ${cellAtoms} 个原子 ÷ 每单位 ${atomsPerFormula} 个原子）`,
    molarMass: +mass.toFixed(3),
    volumeA3: +V.toFixed(4),
    crystalFormula: formula,
    unit: 'g/cm³',
    formulaLatex: '\\rho = \\dfrac{Z M}{N_A V}',
  }
}

/**
 * 最近邻的同种原子间距（Å）。
 *
 * ★ 必须考虑周期性镜像：晶胞边界上的原子，其最近邻常常在相邻晶胞里。
 *   只在单个晶胞内找会系统性地偏大——这是这类题最常见的错法，故把
 *   {-1,0,1}³ 的镜像位移都算进来。
 *
 * @param {Object} crystalData
 * @param {string} [element] 指定元素（缺省取数据里第一种）
 */
export function nearestSameAtomDistance(crystalData, element) {
  const lat = crystalData.lattice
  if (!lat) return { err: '缺少晶胞参数' }
  const groups = (crystalData.atoms || []).filter((g) => !element || g.element === element)
  if (!groups.length) return { err: `数据里没有元素 ${element}` }

  const origin = fractionalToCartesian([0, 0, 0], lat)
  const toCart = (f) => {
    const p = fractionalToCartesian(f, lat)
    return { x: p.x - origin.x, y: p.y - origin.y, z: p.z - origin.z }
  }

  let best = Infinity
  const shifts = []
  for (const di of [-1, 0, 1]) for (const dj of [-1, 0, 1]) for (const dk of [-1, 0, 1]) shifts.push([di, dj, dk])

  for (const g of groups) {
    const pts = (g.positions || []).map(toCart)
    for (let i = 0; i < pts.length; i++) {
      for (let j = 0; j < pts.length; j++) {
        for (const s of shifts) {
          if (i === j && s[0] === 0 && s[1] === 0 && s[2] === 0) continue  // 自己不算邻居
          const dx = pts[j].x + s[0] * toCart([1, 0, 0]).x + s[1] * toCart([0, 1, 0]).x + s[2] * toCart([0, 0, 1]).x - pts[i].x
          const dy = pts[j].y + s[0] * toCart([1, 0, 0]).y + s[1] * toCart([0, 1, 0]).y + s[2] * toCart([0, 0, 1]).y - pts[i].y
          const dz = pts[j].z + s[0] * toCart([1, 0, 0]).z + s[1] * toCart([0, 1, 0]).z + s[2] * toCart([0, 0, 1]).z - pts[i].z
          const d2 = dx * dx + dy * dy + dz * dz
          if (d2 > 1e-9 && d2 < best) best = d2
        }
      }
    }
    break  // 只看第一种（或指定）元素：同种原子间距才有意义
  }
  if (!isFinite(best)) return { err: '算不出最近邻距离（原子数不足或坐标异常）' }
  return { distance: +Math.sqrt(best).toFixed(4), unit: 'Å', element: groups[0].element,
    note: '已计入 {-1,0,1}³ 的周期性镜像——边界原子的最近邻常在相邻晶胞里，只在本胞内找会系统性偏大' }
}

/**
 * 创建本模块的工具定义与执行表。
 *
 * @param {Object}   opts
 * @param {Object}   opts.facade     createCrystalFacade 的返回值
 * @param {Function} opts.loadData   (crystalId) => 晶体数据对象
 * @param {Array}    [opts.catalog]  晶体索引
 */
export function createCrystalTools(opts = {}) {
  const facade = opts.facade
  if (!facade) throw new Error('createCrystalTools 需要 opts.facade')
  const loadData = opts.loadData
  if (typeof loadData !== 'function') throw new Error('createCrystalTools 需要 opts.loadData')
  const catalog = opts.catalog || []

  const def = (name, description, properties, required) => ({
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties: properties || {}, required: required || [] } },
  })

  const defs = {
    read: [
      def('getSnapshot', '获取当前视图状态的完整快照：正在看哪个晶体、哪些图层开着、外观参数与视角。'
        + '需要了解"用户此刻在看什么"时必须先调用它。'),
    ],
    query: [
      def('listCrystals', '列出全部可用的晶体（id / 名称 / 化学式 / 晶系 / 类别）。'
        + '用于回答"有哪些晶体"以及**取得合法 id**——id 必须来自本工具返回的原值，禁止编造。', {
        category: { type: 'string', description: '可选：按类别筛选（metal/ionic/covalent/molecular）' },
      }),
      def('getCrystalDetail', '取某个晶体的结构化字段：点阵型式、空间群、配位、结构基元、空间利用率等。'
        + '这些是**数据里既有的字段**，原样返回，不做推导。', {
        crystalId: { type: 'string', description: '晶体 id，必须来自 listCrystals 的返回值' },
      }, ['crystalId']),
      def('queryCrystal', '查询晶体的**确定性数值**（一律由程序计算，不得口算）。'
        + 'kind 取值：'
        + 'summary=字段汇总；cellVolume=晶胞体积(Å³)；density=密度(g/cm³，ρ=Z·M/(N_A·V))；'
        + 'nearestNeighbor=最近邻同种原子间距(Å，已计入周期性镜像)；'
        + 'atoms=晶胞内原子数与元素清单；interstices=空隙位置与数量。', {
        crystalId: { type: 'string', description: '晶体 id，必须来自 listCrystals 的返回值' },
        kind: { type: 'string', enum: ['summary', 'cellVolume', 'density', 'nearestNeighbor', 'atoms', 'interstices'] },
        element: { type: 'string', description: 'nearestNeighbor 用：指定元素符号，缺省取数据里第一种' },
      }, ['crystalId', 'kind']),
      def('listSceneActions', '拉取**受控动作词汇表**（能做哪些动作、参数取值范围）。'
        + '词汇表不进常驻上下文，需要时调用本工具获取。', {}),
    ],
    hand: [
      def('applySceneActions', '在当前视图上播放一组动作。动作会排成**分镜队列逐步播放**：'
        + '第一步立刻执行，之后停下等用户点「下一步」。因此本工具**立即返回受理回执、不等播完**。'
        + '单次 4–8 个动作；每步必须写 speech 旁白（用户据此判断这一步在做什么）。', {
        actions: {
          type: 'array',
          description: '动作数组，每项 { action, params, speech, holdMs? }。可用动作见 listSceneActions',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              params: { type: 'object' },
              speech: { type: 'string', description: '这一步的旁白（必填）' },
            },
            required: ['action', 'speech'],
          },
        },
      }, ['actions']),
    ],
    teach: [],
  }

  const handlers = {
    getSnapshot() {
      return { snapshot: facade.getSnapshot() }
    },

    listCrystals(p) {
      const list = catalog
        .filter((c) => !p || !p.category || c.category === p.category)
        .map((c) => ({ id: c.id, name: c.name, formula: c.formula, crystalSystem: c.crystalSystem, category: c.category, subtitle: c.subtitle }))
      return { count: list.length, crystals: list,
        note: 'id 请原样使用，不要改写或推断' }
    },

    getCrystalDetail(p) {
      const d = loadData(p.crystalId)
      if (!d) return { error: `未找到晶体：${p.crystalId}（id 必须来自 listCrystals 的返回值）` }
      return {
        id: d.id, name: d.name, formula: d.formula,
        crystalSystem: d.crystalSystem, spaceGroup: d.spaceGroup,
        latticeType: d.latticeType, structuralUnit: d.structuralUnit,
        coordination: d.coordination, spaceUtilization: d.spaceUtilization,
        packingDescription: d.packingDescription, description: d.description,
        note: '以上为数据字段原文，未做推导',
      }
    },

    queryCrystal(p) {
      const d = loadData(p.crystalId)
      if (!d) return { error: `未找到晶体：${p.crystalId}（id 必须来自 listCrystals 的返回值）` }
      switch (p.kind) {
        case 'summary': {
          const vol = cellVolume(d.lattice)
          return {
            id: d.id, name: d.name, formula: d.formula,
            crystalSystem: d.crystalSystem, spaceGroup: d.spaceGroup,
            latticeType: d.latticeType, structuralUnit: d.structuralUnit,
            coordination: d.coordination, spaceUtilization: d.spaceUtilization,
            lattice: d.lattice,
            atomCount: atomCount(d),
            cellVolumeA3: vol == null ? null : +vol.toFixed(4),
            note: '数值字段中 atomCount 与 cellVolumeA3 由程序计算，其余为数据原文',
          }
        }
        case 'cellVolume': {
          const V = cellVolume(d.lattice)
          if (V == null) return { error: '晶胞参数非法，算不出体积' }
          return { volumeA3: +V.toFixed(4), unit: 'Å³', formula: 'V = abc√(1−cos²α−cos²β−cos²γ+2cosαcosβcosγ)',
            note: '通用三斜公式，立方/四方/六方等自动退化' }
        }
        case 'density': {
          const r = computeDensity(d)
          return r.err ? { error: r.err, unknownElements: r.unknownElements } : r
        }
        case 'nearestNeighbor':
          return nearestSameAtomDistance(d, p.element)
        case 'atoms': {
          const groups = (d.atoms || []).map((g) => ({ element: g.element, count: (g.positions || []).length }))
          return { total: atomCount(d), byElement: groups,
            note: '这是该晶胞实际含有的原子数（数据里的坐标即为晶胞内容）' }
        }
        case 'interstices': {
          const it = d.interstices || {}
          const oct = (it.octahedral && it.octahedral.positions) || []
          const tet = (it.tetrahedral && it.tetrahedral.positions) || []
          return {
            octahedral: oct.length, tetrahedral: tet.length,
            positions: { octahedral: oct, tetrahedral: tet },
            unit: '分数坐标',
            note: '数量为该晶胞内的位置条目数；"每个球周围有几个空隙"是另一个量，见 C5 的辨析',
          }
        }
        default:
          return { error: `未知 kind：${p.kind}` }
      }
    },

    listSceneActions() {
      return { actions: facade.sceneVocabulary.list(), layerNotes: facade.sceneVocabulary.layerNotes }
    },

    applySceneActions(p) {
      // 这里只做**校验与转发**：真正的"入队 + 逐步播放"由共享分镜引擎负责
      // （core/storyboard.js）。工具层不该自己实现队列——否则回退/快照/闸门都要重写一遍。
      const actions = (p && p.actions) || []
      const checked = []
      const failed = []
      for (const a of actions) {
        const v = facade.validate(a && a.action, (a && a.params) || {})
        if (v.err) failed.push({ action: a && a.action, error: v.err })
        else checked.push({ action: a.action, params: v.params, speech: a.speech })
      }
      return { checked, failed, count: checked.length,
        note: '已校验，交由分镜引擎入队；每步执行前会存快照以便「上一步」精确回退' }
    },
  }

  /** 工具名清单（供对账：descriptor 声明的名字必须都在这里） */
  const names = () => Object.values(defs).flat().map((d) => d.function.name)

  return { defs, handlers, names }
}

export default createCrystalTools
