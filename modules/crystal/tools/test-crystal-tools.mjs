/**
 * test-crystal-tools.mjs —— 晶体模块工具层的验证
 *
 * 运行：node modules/crystal/tools/test-crystal-tools.mjs
 *
 * ★ 本文件最重要的一组断言是**把程序算出的数值与独立已知值比对**：
 *   密度的真值来自手册/教材，不来自本代码的任何中间量。这样才真正验证了
 *   「数值一律程序算」，而不是"自己算的自己再确认一遍"。
 */
import { createCrystalFacade } from '../facade.js'
import { createCrystalTools, computeDensity, cellVolume, atomCount, nearestSameAtomDistance } from '../tools.js'
import { listActions } from '../actions.js'

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
function section(t) { console.log(`\n【${t}】`) }

// ---- 真实晶体数据（23 个中的 4 个，覆盖 1/2/3 元素与两种点阵）----
const DATA = {}
for (const id of ['fcc', 'naCl', 'diamond', 'csCl', 'perovskite', 'ice']) {
  const m = await import(`../../../projects/crystal/H5/src/data/crystals/${id}.js`)
  DATA[id] = m.default
}
const CATALOG = Object.values(DATA).map((d) => ({
  id: d.id, name: d.name, formula: d.formula, crystalSystem: d.crystalSystem, category: 'x', subtitle: d.subtitle || '',
}))

function mkView() {
  const props = { crystalId: 'fcc', showAtoms: true, showWireframe: true, showInterstices: false, showOctahedral: false, showTetrahedral: false, showSymmetry: false, showBonds: false, showAxes: false, showAuxiliaryBody: false, showAuxiliaryFace: false, showAtomLabels: false, showHydrogenBonds: false, showLatticePoints: false, atomVisibility: {}, atomScale: 1, stickRadius: 0.08, cellDisplayMode: 'conventional', opacity: 0 }
  return {
    props,
    getProps: () => ({ ...props, atomVisibility: { ...props.atomVisibility } }),
    setProps: (p) => Object.assign(props, p),
    getViewState: () => ({ theta: 0, phi: 0, radius: 42 }),
    setView: () => {}, resetView: () => {}, getContainer: () => ({ addEventListener: () => {} }),
  }
}

const facade = createCrystalFacade({ view: mkView(), catalog: CATALOG, loadData: (id) => DATA[id] || null })
const T = createCrystalTools({ facade, loadData: (id) => DATA[id] || null, catalog: CATALOG })

// ============================================================================
section('数值由程序算 —— 与独立已知值比对')
// ============================================================================
{
  // 密度真值取自手册/教材；容差 0.03（理想晶胞与实测值的正常差异）
  const KNOWN_DENSITY = {
    fcc: { want: 8.93, note: 'Cu 理想值（实测 8.96，差异来自缺陷与晶粒）' },
    naCl: { want: 2.19, note: 'NaCl 手册值 2.165（此处 a=5.62 略大于实测 5.6402）' },
    diamond: { want: 3.52, note: '金刚石手册值 3.51' },
    csCl: { want: 3.99, note: 'CsCl 手册值 3.99' },
  }
  for (const [id, { want, note }] of Object.entries(KNOWN_DENSITY)) {
    const r = computeDensity(DATA[id])
    const ok = r.density != null && Math.abs(r.density - want) < 0.03
    check(`${id} 密度 ${r.density} g/cm³ ≈ 已知 ${want}`, ok, `${note}｜实得 ${r.density}`)
  }

  // ★ 回归：Z 是**化学式单位数**，不是晶胞原子数。
  //   NaCl 晶胞含 8 个原子但只有 4 个 NaCl 单位；取 8 会算出 4.37（真值 2.19），
  //   而 4.37 本身不荒谬，所以这处写错极难发现——故单列一条钉住。
  const z = (id) => computeDensity(DATA[id]).Z
  check('★ NaCl 的 Z = 4（化学式单位数），不是 8（晶胞原子数）', z('naCl') === 4, String(z('naCl')))
  check('CsCl 的 Z = 1（晶胞含 2 原子 = 1 个 CsCl 单位）', z('csCl') === 1, String(z('csCl')))
  check('fcc Cu 的 Z = 4（单元素，Z 等于晶胞原子数）', z('fcc') === 4, String(z('fcc')))
  check('金刚石的 Z = 8', z('diamond') === 8, String(z('diamond')))
  check('Znote 里交代了 Z 的来历（可核查，而不是一个凭空出现的数）',
    /化学式单位数/.test(computeDensity(DATA.naCl).Znote))

  // 晶胞体积：立方晶胞应等于 a³
  const V = cellVolume(DATA.fcc.lattice)
  check('立方晶胞体积 = a³', Math.abs(V - Math.pow(3.615, 3)) < 1e-9, String(V))
  // 六方晶胞（ice 是六方？用 quartz/ice 验证通用公式不炸即可）
  check('非立方晶胞也能算体积', (() => {
    const v = cellVolume(DATA.ice.lattice)
    return v != null && v > 0
  })())

  // 最近邻距离：立方晶系的两个解析解（不来自本代码的任何中间量）
  const nnFcc = nearestSameAtomDistance(DATA.fcc)
  check(`fcc 最近邻 = a/√2 = ${(3.615 / Math.SQRT2).toFixed(4)} Å`,
    Math.abs(nnFcc.distance - 3.615 / Math.SQRT2) < 0.002, String(nnFcc.distance))
  const nnDia = nearestSameAtomDistance(DATA.diamond)
  check(`金刚石最近邻 = a√3/4 = ${(3.567 * Math.sqrt(3) / 4).toFixed(4)} Å（键长 1.545 是教材经典数值）`,
    Math.abs(nnDia.distance - 3.567 * Math.sqrt(3) / 4) < 0.002, String(nnDia.distance))
  check('最近邻的说明里交代了计入周期性镜像（否则边界原子会系统性偏大）',
    /镜像/.test(nnFcc.note))

  // 原子数：数据里坐标条数之和
  check('fcc 晶胞原子数 = 4', atomCount(DATA.fcc) === 4)
  check('naCl 晶胞原子数 = 8（4 Na + 4 Cl）', atomCount(DATA.naCl) === 8)
}

// ============================================================================
section('Z 不自洽时必须报错，而不是四舍五入')
// ============================================================================
{
  // 构造一个"晶胞内容与化学式对不上"的数据：化学式 NaCl（每单位 2 原子）但晶胞有 3 个原子
  const bad = { id: 'bad', formula: 'NaCl', lattice: { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 },
    atoms: [{ element: 'Na', positions: [[0, 0, 0]] }, { element: 'Cl', positions: [[0.5, 0.5, 0.5], [0.5, 0, 0]] }] }
  const r = computeDensity(bad)
  check('晶胞内容与化学式对不上时返回 err（不给出貌似合理的错数）',
    !!r.err && /不是整数/.test(r.err), JSON.stringify(r))
  check('错误信息指明了数据核查报告的对应检查项',
    /结构基元自洽性|数据核查报告/.test(r.err))

  const noLattice = computeDensity({ id: 'x', formula: 'Cu', atoms: [] })
  check('缺晶胞参数时报错', !!noLattice.err)
  const weird = computeDensity({ id: 'x', formula: 'Xx2', lattice: { a: 3, b: 3, c: 3, alpha: 90, beta: 90, gamma: 90 }, atoms: [{ element: 'Xx', positions: [[0, 0, 0]] }] })
  check('化学式含未知元素时拒绝出结果（并列出未知元素）',
    !!weird.err && Array.isArray(weird.unknownElements) && weird.unknownElements.includes('Xx'))
}

// ============================================================================
section('工具定义（OpenAI function-calling 格式）')
// ============================================================================
{
  const all = Object.entries(T.defs).flatMap(([cls, list]) => list.map((d) => ({ cls, d })))
  check('每个工具都有 type=function 与 function.name/description/parameters',
    all.every(({ d }) => d.type === 'function' && d.function.name && d.function.description && d.function.parameters))
  check('工具名不重复', new Set(T.names()).size === T.names().length)
  check('四个类别都在（read/query/hand/teach）',
    ['read', 'query', 'hand', 'teach'].every((c) => c in T.defs))

  const hand = T.defs.hand.find((d) => d.function.name === 'applySceneActions')
  check('出题/动手类工具的参数 schema 要求每步写 speech（否则学生看到画面莫名跳一下）',
    hand.function.parameters.properties.actions.items.required.includes('speech'))
  check('applySceneActions 的描述里写明"入队 + 立即返回"（不阻塞对话循环）',
    /立即返回|不等播完/.test(hand.function.description))

  const q = T.defs.query.find((d) => d.function.name === 'queryCrystal')
  check('queryCrystal 的 kind 是枚举（模型不必猜）', Array.isArray(q.function.parameters.properties.kind.enum))
  check('queryCrystal 的描述里点明"一律由程序计算，不得口算"',
    /程序计算|不得口算/.test(q.function.description))
}

// ============================================================================
section('工具执行：错误归一化为结果，不抛异常')
// ============================================================================
{
  const r1 = T.handlers.getCrystalDetail({ crystalId: '编造的' })
  check('不存在的晶体 id 返回 error 结果（不抛异常）', !!r1.error && /未找到/.test(r1.error))
  check('错误信息提示 id 必须来自检索工具的原值', /listCrystals|原值/.test(r1.error))

  const r2 = T.handlers.queryCrystal({ crystalId: '不存在的', kind: 'density' })
  check('queryCrystal 对不存在的 id 同样返回 error', !!r2.error)

  const r3 = T.handlers.queryCrystal({ crystalId: 'fcc', kind: '不存在的kind' })
  check('未知 kind 返回 error', !!r3.error && /未知 kind/.test(r3.error))

  // 各 kind 都应给出可用结果
  for (const kind of ['summary', 'cellVolume', 'density', 'nearestNeighbor', 'atoms', 'interstices']) {
    const r = T.handlers.queryCrystal({ crystalId: 'naCl', kind })
    check(`kind=${kind} 有结果且无 error`, !r.error, JSON.stringify(r).slice(0, 120))
  }

  const list = T.handlers.listCrystals({})
  check('listCrystals 返回 id 与元信息', list.crystals.length > 0 && !!list.crystals[0].id)
  check('listCrystals 明确提示"id 请原样使用，不要改写或推断"', /原样|不要改写/.test(list.note))

  const det = T.handlers.getCrystalDetail({ crystalId: 'fcc' })
  check('getCrystalDetail 原样返回数据字段（不推导）',
    det.latticeType === DATA.fcc.latticeType && det.coordination === DATA.fcc.coordination)
  check('字段原文字段都带"未做推导"的说明', /未做推导/.test(det.note))

  const sum = T.handlers.queryCrystal({ crystalId: 'fcc', kind: 'summary' })
  check('summary 同时给出数据原文与程序算出的量，并标明哪些是算的',
    sum.atomCount === 4 && sum.cellVolumeA3 > 0 && /由程序计算/.test(sum.note))
}

// ============================================================================
section('applySceneActions：只校验与转发，不自己实现队列')
// ============================================================================
{
  const r = T.handlers.applySceneActions({ actions: [
    { action: 'setLayer', params: { layer: 'octahedral', visible: true }, speech: '打开八面体空隙' },
    { action: 'setLayer', params: { layer: '不存在的层' }, speech: 'x' },
    { action: 'loadCrystal', params: { crystalId: '编造' }, speech: 'y' },
  ] })
  check('合法动作进 checked，非法动作进 failed（分开报，不整批回滚）',
    r.checked.length === 1 && r.failed.length === 2, JSON.stringify(r))
  check('checked 里带上 speech', r.checked[0].speech === '打开八面体空隙')
  check('注明队列由分镜引擎负责（工具层不重复实现）', /分镜/.test(r.note))

  const r2 = T.handlers.applySceneActions({ actions: [] })
  check('空动作数组不报错', r2.count === 0 && r2.failed.length === 0)
  const r3 = T.handlers.applySceneActions({})
  check('缺 actions 参数不抛异常', r3.count === 0)

  const vocab = T.handlers.listSceneActions({})
  check('listSceneActions 返回词汇表与图层说明',
    vocab.actions.length === listActions().length && Object.keys(vocab.layerNotes).length > 0)
}

// ============================================================================
section('与 descriptor 对账：声明的工具必须真的实现')
// ============================================================================
{
  const { default: descriptor } = await import('../../../packages/agent-core/registry/descriptors/crystal.js')
  const actual = new Set(T.names())
  const declared = Object.values(descriptor.tools || {}).flat()
  const notImplemented = declared.filter((n) => !actual.has(n))
  check('crystal descriptor 的 tools 里没有"声明了却没实现"的名字',
    notImplemented.length === 0, '未实现：' + notImplemented.join(','))
  check('descriptor 不再声明已实现工具之外的东西（plannedTools 单独放）',
    Object.values(descriptor.plannedTools || {}).flat().every((n) => !actual.has(n)),
    '既在 tools 又在 plannedTools：' +
      Object.values(descriptor.plannedTools || {}).flat().filter((n) => actual.has(n)).join(','))
  console.log('      模块已实现工具：' + [...actual].sort().join(', '))
}

// ============================================================================
console.log(`\n${'═'.repeat(60)}`)
console.log(`test-crystal-tools 结果：通过 ${pass} 项，失败 ${fail} 项`)
console.log('═'.repeat(60))
process.exit(fail ? 1 : 0)
