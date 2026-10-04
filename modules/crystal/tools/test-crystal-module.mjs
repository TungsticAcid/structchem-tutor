/**
 * test-crystal-module.mjs —— 晶体模块门面的验证
 *
 * 运行：node modules/crystal/tools/test-crystal-module.mjs
 *
 * ★ 用**桩视图**驱动，不 import 真实的 ViewerCanvas（那要 three.js 与 DOM）。
 *   门面刻意设计成通过参数接收 view，就是为了这件事。
 *
 * 重点守三类容易做错的地方：
 *   1. 状态必须**现读视图**，不能自己维护副本（否则与页面控件改动的实际画面漂移）
 *   2. onAction 必须支持**多订阅**（crystal 自己的 `_events` 是单槽位，会互相顶掉）
 *   3. 参数越界与编造 id 必须被**程序拒绝**，而不是靠提示词约束
 */
import { createCrystalFacade } from '../facade.js'
import { validate, listActions, LAYER_PROPS } from '../actions.js'
import { assertModuleContract } from '../../../packages/module-contract/index.js'
// ★ 模块名要**对着 descriptor 断言**，而不是在测试里再抄一份字面量：
//   抄一份的下场是"改名字要改两处"，而漏掉一处的表现是测试红得莫名其妙
//   （本轮：模块名按参赛配图从「晶体结构」改成「晶典在线」，这条断言就是唯一被它打红的地方）。
//   真正的判据是**门户上只有一个名字** —— 也就是 descriptor 与实现一致。
import crystalDescriptor from '../../../packages/agent-core/registry/descriptors/crystal.js'
// ★ 逐元素配色的周期表布局：位置表与元素表是两份数据，必须在本测试里对账
import elementsData from '../../../projects/crystal/H5/src/data/elements.js'
import { PERIODIC_POS, PERIODIC_COLS, PERIODIC_ROWS, PERIODIC_GAP_ROW } from '../periodic-layout.js'
import { elementColorItems } from '../settings-visual.js'

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
function section(t) { console.log(`\n【${t}】`) }

/** 桩视图：行为对齐 ViewerCanvas 的相关接口，并记录收到的 setProps 调用 */
function mkView(init = {}) {
  const props = Object.assign({
    crystalId: 'fcc', showAtoms: true, showWireframe: true, showInterstices: false,
    showOctahedral: false, showTetrahedral: false, showSymmetry: false, showBonds: false,
    showAxes: false, showAuxiliaryBody: false, showAuxiliaryFace: false,
    showAtomLabels: false, showHydrogenBonds: false, showLatticePoints: false,
    atomVisibility: {}, atomScale: 1.0, stickRadius: 0.08, cellDisplayMode: 'conventional', opacity: 0,
  }, init)
  const listeners = {}
  const calls = []
  const container = {
    addEventListener: (n, fn) => { (listeners[n] = listeners[n] || []).push(fn) },
    removeEventListener: () => {},
    querySelector: () => null,
  }
  return {
    props, calls, listeners,
    canvas: { toDataURL: () => 'data:image/png;base64,STUB' },
    getProps: () => ({ ...props, atomVisibility: { ...props.atomVisibility } }),
    setProps: (patch) => { calls.push(patch); Object.assign(props, patch) },
    getViewState: () => ({ theta: 0.7854, phi: 0.9553, radius: 42 }),
    setView: (d) => { calls.push({ setView: d }) },
    resetView: () => { calls.push({ resetView: true }) },
    getContainer: () => container,
    /** 模拟"用户在页面上自己动了控件" */
    userChanges: (patch) => Object.assign(props, patch),
    /** 模拟视图派发自定义事件 */
    fire: (name, detail) => (listeners[name] || []).forEach((fn) => fn({ detail })),
  }
}

const CATALOG = [
  { id: 'fcc', name: 'Cu型晶体', formula: 'Cu', crystalSystem: 'cubic', category: 'metal', subtitle: 'A1立方最密堆积(FCC)', systemName: '立方晶系' },
  { id: 'naCl', name: 'NaCl(岩盐)型', formula: 'NaCl', crystalSystem: 'cubic', category: 'ionic', subtitle: '', systemName: '立方晶系' },
]

// ============================================================================
section('契约合规')
// ============================================================================
{
  let threw = ''
  try { createCrystalFacade({}) } catch (e) { threw = e.message }
  check('缺 view 时明确报错', /view/.test(threw), threw)

  const badView = { setProps: () => {} }
  try { createCrystalFacade({ view: badView }) } catch (e) { threw = e.message }
  check('view 缺必要方法时明确报错（并指名缺哪个）', /getProps/.test(threw), threw)

  const view = mkView()
  const F = createCrystalFacade({ view, catalog: CATALOG })
  const r = assertModuleContract(F, { label: 'crystal' })
  check('门面通过模块契约校验（必需方法齐备）', r.ok === true, r.missingRequired.join(','))
  check('缺 highlightAtoms 被报为缺失（而非假装支持）', r.missing.includes('highlightAtoms'), r.missing.join(','))
  check('门面 id/title 与 descriptor 一致（门户上只有一个名字）',
    F.id === crystalDescriptor.id && F.title === crystalDescriptor.title,
    `facade="${F.title}" descriptor="${crystalDescriptor.title}"`)
}

// ============================================================================
section('getSnapshot：必须现读视图，不能维护副本')
// ============================================================================
{
  const view = mkView()
  const F = createCrystalFacade({
    view, catalog: CATALOG,
    loadData: (id) => (id === 'fcc' ? { formula: 'Cu', atoms: [{ element: 'Cu', positions: [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]] }] } : null),
  })
  const s1 = F.getSnapshot()
  check('带上晶体元信息（名称/化学式/晶系）',
    s1.crystal && s1.crystal.name === 'Cu型晶体' && s1.crystal.formula === 'Cu' && s1.crystal.crystalSystem === 'cubic')
  check('图层只列开着的', s1.layersOn.includes('atoms') && s1.layersOn.includes('wireframe') && !s1.layersOn.includes('octahedral'))
  check('带上原子数与元素（用于"这个晶胞里有几个原子"这类问题）',
    s1.atoms && s1.atoms[0].element === 'Cu' && s1.atoms[0].count === 4)
  check('带上视角状态', !!s1.view && typeof s1.view.theta === 'number')
  check('惯用晶胞有说明', /惯用晶胞/.test(s1.cellDisplayModeNote))

  // ★ 关键：用户在页面上自己改了图层 → 门面必须立刻反映（而不是拿着旧副本）
  view.userChanges({ showOctahedral: true, crystalId: 'naCl' })
  const s2 = F.getSnapshot()
  check('用户在页面上改动后，快照立刻反映（无副本漂移）',
    s2.layersOn.includes('octahedral') && s2.crystal.id === 'naCl',
    JSON.stringify({ layers: s2.layersOn, id: s2.crystal.id }))
  check('切到原胞时的说明会变', (() => {
    view.userChanges({ cellDisplayMode: 'primitive' })
    return /原胞/.test(F.getSnapshot().cellDisplayModeNote)
  })())

  // 空隙总开关关着时单列出来（否则 octal/tetra 为真却看不见，容易被误读）
  view.userChanges({ showInterstices: false, showOctahedral: true })
  check('空隙总开关单独标明（避免"以为开着其实看不见"）',
    F.getSnapshot().intersticesMasterOn === false)
}

// ============================================================================
section('applyActions：校验在前、落到视图在后')
// ============================================================================
{
  const view = mkView()
  const F = createCrystalFacade({ view, catalog: CATALOG })

  const ok1 = F.applyActions([{ action: 'setLayer', params: { layer: 'octahedral', visible: true } }])
  check('合法动作被应用', ok1.ok === true && ok1.applied.length === 1)
  check('动作真的落到了视图（setProps 收到了对应属性）',
    view.props.showOctahedral === true, JSON.stringify(view.calls))

  const bad1 = F.applyActions([{ action: 'setLayer', params: { layer: '不存在的层' } }])
  check('未知图层被拒（带可用值提示）', bad1.ok === false && /未知图层/.test(bad1.failed[0].error))
  const bad2 = F.applyActions([{ action: 'loadCrystal', params: { crystalId: '编造的id' } }])
  check('编造的晶体 id 被拒（descriptor 明令禁止编造 id）',
    bad2.ok === false && /不可编造|未知晶体/.test(bad2.failed[0].error))
  const bad3 = F.applyActions([{ action: '根本不存在' }])
  check('未知动作被拒', bad3.ok === false && /未知动作/.test(bad3.failed[0].error))

  // 一批里既有合法又有非法：合法的照做，非法的单独报错（不整批回滚）
  const mix = F.applyActions([
    { action: 'setLayers', params: { layers: { atoms: true, bonds: true } } },
    { action: 'setView', params: { direction: '不存在的方向' } },
  ])
  check('混合批次：合法项生效、非法项单独报错',
    mix.applied.length === 1 && mix.failed.length === 1 && view.props.showBonds === true)

  check('setLayers 批量落到视图', view.props.showAtoms === true && view.props.showBonds === true)

  // setAtomVisibility 必须与已有记录合并，而不是整体覆盖
  view.userChanges({ atomVisibility: { Na: true, Cl: true } })
  F.applyActions([{ action: 'setAtomVisibility', params: { element: 'Cl', visible: false } }])
  check('setAtomVisibility 与已有记录合并（不覆盖其它元素）',
    view.props.atomVisibility.Na === true && view.props.atomVisibility.Cl === false,
    JSON.stringify(view.props.atomVisibility))

  // 外观越界被夹紧
  F.applyActions([{ action: 'setAppearance', params: { atomScale: 99 } }])
  check('外观参数越界被夹到上限（程序夹紧，不靠提示词）', view.props.atomScale === 2.0, String(view.props.atomScale))
  F.applyActions([{ action: 'setAppearance', params: { opacity: -5 } }])
  check('负值被夹到下限', view.props.opacity === 0)
  check('纯非数值被拒', F.applyActions([{ action: 'setAppearance', params: {} }]).ok === false)

  // 视角与复位
  F.applyActions([{ action: 'setView', params: { direction: 'iso' } }])
  check('setView 落到视图', view.calls.some((c) => c.setView === 'iso'))
  F.applyActions([{ action: 'resetView', params: {} }])
  check('resetView 落到视图', view.calls.some((c) => c.resetView === true))
}

// ============================================================================
section('onAction：必须支持多订阅（crystal 自身的 _events 是单槽位）')
// ============================================================================
{
  const view = mkView()
  const F = createCrystalFacade({ view, catalog: CATALOG })
  const got1 = []
  const got2 = []
  const off1 = F.onAction((e) => got1.push(e.type))
  F.onAction((e) => got2.push(e.type))
  check('onAction 返回取消函数', typeof off1 === 'function')

  view.fire('viewstatechange', { theta: 1 })
  check('★ 两个订阅者都收到（不是单槽位互相顶掉）',
    got1.length === 1 && got2.length === 1, `got1=${JSON.stringify(got1)} got2=${JSON.stringify(got2)}`)

  off1()
  view.fire('loaded', { crystalId: 'fcc' })
  check('取消订阅后不再收到，另一个仍收到', got1.length === 1 && got2.length === 2)

  view.fire('atomTap', { element: 'Na' })
  check('原子拾取事件也转发（用于"点哪个原子"这类追问）', got2.includes('atomTap'))
  check('非函数订阅者被安全忽略', typeof F.onAction(null) === 'function')
}

// ============================================================================
section('其余契约方法')
// ============================================================================
{
  const view = mkView()
  const F = createCrystalFacade({ view, catalog: CATALOG })

  check('sceneVocabulary 可列出全部动作', F.sceneVocabulary.list().length === listActions().length)
  check('sceneVocabulary 的 list 带可选值（模型不必猜枚举）',
    F.sceneVocabulary.list().find((a) => a.action === 'setView').options.length === 4)
  check('图层说明齐备（每个图层都有教学含义）',
    Object.keys(LAYER_PROPS).every((k) => !!F.sceneVocabulary.layerNotes[k]))
  // ★ 界面按钮不该显示 atoms / hydrogenBonds 这种键名——用户看不懂。
  //   这条断言保证"新增图层却忘了加中文标签"会当场失败。
  {
    const { LAYER_LABELS, VIEW_LABELS, VIEW_DIRECTIONS } = await import('../actions.js')
    const noLabel = Object.keys(LAYER_PROPS).filter((k) => !LAYER_LABELS[k])
    check('每个图层都有中文短标签（按钮不显示英文键名）', noLabel.length === 0, noLabel.join(','))
    check('每个视角方向都有中文短标签',
      VIEW_DIRECTIONS.every((d) => !!VIEW_LABELS[d]), VIEW_DIRECTIONS.filter((d) => !VIEW_LABELS[d]).join(','))
    check('图层短标签与教学含义说明分工清楚（短标签更短）',
      Object.keys(LAYER_PROPS).every((k) => LAYER_LABELS[k].length <= 6))
  }

  const st = F.settings
  check('settings 是声明式 schema（可直接喂 settings-popup）',
    Array.isArray(st) && st.every((f) => f.key && f.type))
  check('settings 覆盖三个外观参数与晶胞模式',
    ['atomScale', 'stickRadius', 'opacity', 'cellDisplayMode'].every((k) => st.some((f) => f.key === k)))

  check('exportViewPNG 有画布时返回 dataURL', /^data:image/.test(F.exportViewPNG()))
  const noCanvas = mkView()
  delete noCanvas.canvas
  check('无画布时返回 null（不抛异常）', createCrystalFacade({ view: noCanvas, catalog: CATALOG }).exportViewPNG() === null)

  check('detailOf 取晶体元信息', F.detailOf('naCl').formula === 'NaCl' && F.detailOf('zzz') === null)
  check('crystalIds 列出全部 id', F.crystalIds().length === 2)
  check('门面自带 validate（工具层可复用，不必再实现一份）',
    F.validate('setView', { direction: 'top' }).params.direction === 'top')
}

// ============================================================================
section('动作词汇表本身')
// ============================================================================
{
  const acts = listActions()
  check('每个动作都有 group/desc/params', acts.every((a) => a.group && a.desc && a.params !== undefined))
  check('动作名不重复', new Set(acts.map((a) => a.action)).size === acts.length)
  check('validate 对空参数给出明确 err（而非抛异常）',
    typeof validate('setView', {}).err === 'string')
  check('validate 未传 ctx 时不校验 id 存在性（宽松模式，供非 agent 场景用）',
    validate('loadCrystal', { crystalId: '任意' }).params.crystalId === '任意')
}

// ============================================================================
section('逐元素配色的周期表布局（位置表与元素表必须逐符号咬合）')
// ============================================================================
{
  // ★ 为什么守这个：位置表（`periodic-layout.js`）与元素表是**两份数据**，
  //   漏一个符号的表现是"周期表上凭空少一个格子"——不报错，也不会有人想到是位置表。
  //   反过来，位置表里多出来的符号会画出一个**点不动的空格子**。
  const items = elementColorItems()
  const syms = Object.keys(elementsData)
  check('元素表是 103 个元素（H…Lr）', syms.length === 103, String(syms.length))
  const missing = syms.filter((s) => !PERIODIC_POS[s])
  check('每个元素都能在周期表上定位（无遗漏）', missing.length === 0, missing.join(','))
  const extra = Object.keys(PERIODIC_POS).filter((s) => !syms.includes(s))
  check('位置表里没有元素表之外的符号', extra.length === 0, extra.join(','))

  const seen = new Set()
  let bad = 0
  for (const s of syms) {
    const p = PERIODIC_POS[s]
    if (!p || p[0] < 1 || p[0] > PERIODIC_ROWS || p[1] < 1 || p[1] > PERIODIC_COLS) { bad++; continue }
    const k = p[0] + ':' + p[1]
    if (seen.has(k)) bad++
    seen.add(k)
  }
  check('行列都在范围内且无两个元素抢同一格', bad === 0, `异常 ${bad} 个`)
  check('f 区下挂两行、主表留出空隙行',
    PERIODIC_GAP_ROW === 8 && PERIODIC_POS.La[0] === 6 && PERIODIC_POS.Ce[0] === 9
    && PERIODIC_POS.Ac[0] === 7 && PERIODIC_POS.Th[0] === 10)
  check('镧系/锕系各 14 个元素',
    syms.filter((s) => PERIODIC_POS[s][0] === 9).length === 14
    && syms.filter((s) => PERIODIC_POS[s][0] === 10).length === 14)

  check('配色项带上了周期表要用的 name/period/group',
    items.length === 103
    && items.every((it) => it.period >= 1 && it.group >= 1 && typeof it.name === 'string'))
  check('配色项按原子序数排序（周期表的阅读顺序）',
    items.every((it, i) => i === 0 || it.order >= items[i - 1].order))
  // 氢是近白色底 —— 弹层要据此给深色字（readableOn），这里只保证这一格真的存在
  const h = items.find((it) => it.key === 'H')
  check('氢在 (1,1)', !!h && h.period === 1 && h.group === 1)
}

// ============================================================================
console.log(`\n${'═'.repeat(60)}`)
console.log(`test-crystal-module 结果：通过 ${pass} 项，失败 ${fail} 项`)
console.log('═'.repeat(60))
process.exit(fail ? 1 : 0)
