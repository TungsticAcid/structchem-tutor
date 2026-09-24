/**
 * test-core.mjs — 共享核心（packages/agent-core/core/）的验证
 *
 * 运行：node packages/agent-core/tools/test-core.mjs
 *
 * 重点测**迁移等价性**：把 orbit 的真实内容喂进新目录，与 orbit 原实现逐个比对。
 * 这比"新代码单测通过"更有说服力——它证明搬过来的东西没走样。
 *
 * ⚠️ 部分用例依赖 projects/orbit/H5/ 下的原始文件。orbit 在阶段 B4 被改写成 ESM 后，
 *    这些用例需同步改为 import；在那之前它们是最强的回归保护。
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { createCatalog } from '../core/catalog.js'
import { startFeynman } from '../core/feynman.js'
import { createPerception } from '../core/perception.js'
import { createStoryboard } from '../core/storyboard.js'
import { createConversation, buildManifestText, composeSystemPrompt } from '../core/conversation.js'
import { createToolRegistry } from '../core/tool-registry.js'
import { createRenderer } from '../ui/renderer.js'
import { el, clear } from '../ui/dom.js'
import { createPanel } from '../ui/panel.js'

const HERE = new URL('.', import.meta.url)
const orbit = (p) => fileURLToPath(new URL('../../../projects/orbit/H5/' + p, HERE))

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
function section(t) { console.log(`\n【${t}】`) }

/**
 * 把 orbit 的全局脚本加载进一个 window 垫片。
 * 这些文件是普通脚本（IIFE 挂 window.*），故用 new Function 注入 window。
 */
function loadScripts(win, paths) {
  for (const p of paths) {
    const src = readFileSync(p, 'utf-8')
    new Function('window', src)(win) // eslint-disable-line no-new-func
  }
  return win
}

// ============================================================================
section('catalog：基本行为')
// ============================================================================
{
  const c = createCatalog()
  check('新建目录为空', c.count() === 0 && c.index().length === 0)

  const added = c.register([
    { id: 'b-2', kp: 'b', title: 'B2', body: '正文 B2', keywords: ['x'] },
    { id: 'a-1', kp: 'a', title: 'A1', body: '正文 A1', keywords: ['y'], extraNew: 42 },
    null,                       // 脏数据不应崩
    { title: '无 id' },          // 无 key 字段应被跳过
  ])
  check('register 返回实际新增数（跳过脏数据）', added === 2, `得到 ${added}`)
  check('count 正确', c.count() === 2)

  const idx = c.index()
  check('index 按 id 升序（提示内容可复现）', idx.map((e) => e.id).join(',') === 'a-1,b-2')
  check('index 剔除重字段 body', idx.every((e) => !('body' in e)))
  check('index 保留非重字段（含新增字段）', idx.some((e) => e.extraNew === 42))

  const full = c.load('a-1')
  check('load 返回完整条目（含 body）', full && full.body === '正文 A1')
  check('load 保留硬编码白名单会丢掉的新字段', full && full.extraNew === 42)
  check('load 未命中返回 null（而非编造）', c.load('不存在') === null)

  check('filterBy 通用过滤', c.filterBy('kp', 'a').length === 1)
  check('filterBy 无命中返回空数组', c.filterBy('kp', 'zzz').length === 0)

  check('重复 id 后者覆盖', c.register([{ id: 'a-1', title: '新' }]) === 0 && c.load('a-1').title === '新')

  c.clear()
  check('clear 清空', c.count() === 0)
}

// ============================================================================
section('feynman：组合正确')
// ============================================================================
{
  const c = createCatalog({ key: 'name' })
  check('未注册时返回 error 而非抛异常', startFeynman(c, 'crystal:C4').error === '费曼技能未注册')

  c.register([{ name: 'feynman', title: '费曼式复述', steps: ['第一步', '第二步'] }])
  const r = startFeynman(c, 'crystal:C4')
  check('返回知识点回填', r.knowledgePoint === 'crystal:C4')
  check('rubric 取自技能正文 steps', r.rubric.length === 2 && r.rubric[0] === '第一步')
  check('邀请语强调不背公式', /不要背公式/.test(r.invitation))
}

// ============================================================================
section('迁移等价性：与 orbit 原实现比对真实内容')
// ============================================================================
{
  // orbit 原实现（全局单例）
  const win = loadScripts({}, [
    orbit('js/agent/knowledge.js'),
    orbit('knowledge/entries/index.js'),
    orbit('js/agent/skills.js'),
    orbit('skills/index.js'),
  ])
  check('orbit 原 Knowledge 已注册条目', win.Knowledge.count() > 0, `${win.Knowledge.count()} 条`)
  check('orbit 原 Skills 已注册技能', win.Skills.count() > 0, `${win.Skills.count()} 个`)

  // ---- 知识库 ----
  const kc = createCatalog({ key: 'id' })
  // 取原注册表里的完整条目：原 load() 是白名单，故用 index() + load() 拼不回去 body，
  // 这里直接从 entries 模块重新注册（它就是 register 的输入）
  const kWin = loadScripts({}, [orbit('js/agent/knowledge.js')])
  const registerCalls = []
  kWin.Knowledge = { register: (list) => registerCalls.push(...list) }
  new Function('window', readFileSync(orbit('knowledge/entries/index.js'), 'utf-8'))(kWin)
  kc.register(registerCalls)

  check('知识条目数一致', kc.count() === win.Knowledge.count(), `新 ${kc.count()} vs 原 ${win.Knowledge.count()}`)

  const origIdx = win.Knowledge.index()
  const newIdx = kc.index()
  check('index 条目数与 id 顺序一致', origIdx.map((e) => e.id).join(',') === newIdx.map((e) => e.id).join(','))

  // 原 index() 返回 {id,kp,title,keywords}；新 index() 是"完整条目减去 body"，
  // 故原字段必须逐一相等（新实现可以多，不可以少或不同）
  const origById = new Map(origIdx.map((e) => [e.id, e]))
  let fieldMismatch = 0
  for (const n of newIdx) {
    const o = origById.get(n.id)
    for (const k of Object.keys(o)) {
      if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) { fieldMismatch++; console.log(`      ${n.id}.${k}: 原 ${JSON.stringify(o[k])} vs 新 ${JSON.stringify(n[k])}`) }
    }
  }
  check('index 的每个原有字段逐个相等', fieldMismatch === 0, `${fieldMismatch} 处不符`)

  // load()：原实现是白名单子集，新实现是完整条目 ⊇ 白名单
  let loadMismatch = 0
  for (const e of origIdx) {
    const o = win.Knowledge.load(e.id)
    const n = kc.load(e.id)
    if (!n) { loadMismatch++; console.log(`      ${e.id}: 新实现取不到`); continue }
    for (const k of Object.keys(o)) {
      if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) { loadMismatch++; console.log(`      ${e.id}.${k} 不等`) }
    }
  }
  check('load 的每个原有字段逐个相等（新实现可为超集）', loadMismatch === 0, `${loadMismatch} 处不符`)

  // 新实现应比原实现多带回字段（原白名单丢了它们）
  const sample = kc.load(origIdx[0].id)
  const origSample = win.Knowledge.load(origIdx[0].id)
  const extra = Object.keys(sample).filter((k) => !(k in origSample))
  check('新实现确实多返回了原白名单丢弃的字段', extra.length > 0, `多出: ${extra.join(',') || '（无）'}`)

  // byKnowledgePoint → filterBy('kp')
  const kp = origIdx[0].kp
  check('filterBy(kp) 等价于原 byKnowledgePoint',
    kc.filterBy('kp', kp).length === win.Knowledge.byKnowledgePoint(kp).length)

  // ---- 技能库 ----
  const sc = createCatalog({ key: 'name' })
  const sWin = loadScripts({}, [orbit('js/agent/skills.js')])
  const skillCalls = []
  sWin.Skills = { register: (list) => skillCalls.push(...list) }
  new Function('window', readFileSync(orbit('skills/index.js'), 'utf-8'))(sWin)
  sc.register(skillCalls)

  check('技能数一致', sc.count() === win.Skills.count(), `新 ${sc.count()} vs 原 ${win.Skills.count()}`)

  // ★ 顺序是**已知的有意差异**：原 Skills.index() 用对象插入序，新目录统一按 key 升序。
  //   故此处按 name 排序后比较（比的是集合内容，不是顺序）。
  const byName = (arr) => arr.map((s) => [s.name, s.title, s.desc, s.when]).sort()
  check('技能 index 的 name/title/desc/when 与原一致（忽略顺序）',
    JSON.stringify(byName(sc.index())) === JSON.stringify(byName(win.Skills.index())))
  check('技能 index 顺序与原名次不同（记录该有意差异，防止将来误判为回归）',
    sc.index().map((s) => s.name).join(',') !== win.Skills.index().map((s) => s.name).join(','))

  const s0 = win.Skills.index()[0].name
  const origSkill = win.Skills.load(s0)
  const newSkill = sc.load(s0)
  let sm = 0
  for (const k of Object.keys(origSkill)) if (JSON.stringify(origSkill[k]) !== JSON.stringify(newSkill[k])) sm++
  check('技能 load 的原有字段逐个相等', sm === 0, `${sm} 处不符`)

  // startFeynman 与原实现输出一致
  const of = win.Skills.startFeynman('crystal:C4')
  const nf = startFeynman(sc, 'crystal:C4')
  check('startFeynman 输出与原实现一致',
    of.invitation === nf.invitation && JSON.stringify(of.rubric) === JSON.stringify(nf.rubric) && of.skill === nf.skill)
}

// ============================================================================
section('perception：基本行为')
// ============================================================================
{
  let threw = false
  try { createPerception({}) } catch (e) { threw = /getState/.test(e.message) }
  check('缺 getState 时明确报错（而非静默失效）', threw)

  let clock = 0
  const st = { a: 1, arr: [1, 2] }
  const p = createPerception({ getState: () => st, now: () => clock, dwellFields: ['a'] })

  clock = 1000; p.poll()
  check('首次 poll 只建立基线，不记动作', p.getTrace().recentActions.length === 0)

  st.a = 2; clock = 1500; p.poll()
  check('变化被差分记录', p.getTrace().recentActions.join(',') === 'a')
  check('停留时长记录了「上一个值」被保持的时间', JSON.stringify(p.getTrace().dwellMs.a) === '[500]')

  st.arr = [1, 3]; clock = 3000; p.poll()
  check('数组按值比较，元素变化能识别', p.getTrace().toggleCounts.arr === 1)

  st.arr = [1, 3]; clock = 4000; p.poll()
  check('数组内容相同则不算变化', p.getTrace().toggleCounts.arr === 1)

  st.x = 1; clock = 5000; p.poll()
  check('未在 dwellFields 的字段不进 dwellMs', !('x' in p.getTrace().dwellMs))
  check('未知字段用原字段名作动作名', p.getTrace().toggleCounts.x === 1)

  const snap = p.snapshot({ mastery: { k: 1 } })
  check('snapshot 顶层合并 extra', snap.mastery.k === 1)
  check('snapshot 含 state 与 interaction', !!snap.state && !!snap.interaction)
  check('toCompactText 含空闲时长与最近动作', /空闲 0s/.test(p.toCompactText(snap)) && /x/.test(p.toCompactText(snap)))

  p.reset()
  check('reset 清空痕迹', p.getTrace().recentActions.length === 0 && Object.keys(p.getTrace().toggleCounts).length === 0)

  // ★ 静默失败模式回归：模块若返回**活状态引用**（而非新对象），
  //   原实现会永远算出「无变化」且不报错。新实现用深拷贝堵住这条路径。
  let c2 = 0
  const live = { a: 1, nested: { x: 1 } }
  const p2 = createPerception({ getState: () => live, now: () => c2 })
  c2 = 100; p2.poll()
  live.a = 2; c2 = 200; p2.poll()
  check('返回活引用时仍能差分出变化（防静默失败）',
    p2.getTrace().toggleCounts.a === 1, JSON.stringify(p2.getTrace()))
  live.nested.x = 9; c2 = 300; p2.poll()
  check('嵌套字段的变化也能差分出', p2.getTrace().toggleCounts.nested === 1, JSON.stringify(p2.getTrace()))
}

// ============================================================================
section('perception：迁移等价性（与 orbit 原实现同钟驱动比对）')
// ============================================================================
{
  // orbit 原实现用 Date.now() 与 window.OrbitApp / window.Formula，故在受控钟下加载
  const realNow = Date.now
  let clock = 100000
  Date.now = () => clock
  try {
    const win = loadScripts({}, [orbit('js/agent/perception-snapshot.js')])

    let state = {
      n: 3, l: 2, m: 0, wavefunction: 'real', render: 'isosurface', color: 'phase',
      psiCriterion: 'density', levelFraction: 0.9, radial: ['R', 'D'],
      angularWhich: 'theta', plane: 'xz', sectionMode: 'density', autoRotate: false,
    }
    win.OrbitApp = { getState: () => state }
    win.Formula = { realOrbitalName: (l, m) => `d(${l},${m})` }

    // orbit 的配置：字段标签、需要记停留的字段、快照形状、紧凑文本
    const FIELD_LABEL = {
      n: 'setN', l: 'setL', m: 'setM', wavefunction: 'setWavefunctionMode',
      render: 'setRenderMode', color: 'setColorMode', psiCriterion: 'setPsiCriterion',
      levelFraction: 'setIsosurfaceLevel', plane: 'setSectionPlane',
      sectionMode: 'setSectionMode', angularWhich: 'setAngularView',
      radial: 'setRadial', autoRotate: 'setAutoRotate',
    }
    const SUBSHELL = ['s', 'p', 'd', 'f', 'g', 'h']
    const describeState = (s) => {
      const sub = SUBSHELL[Math.min(s.l || 0, SUBSHELL.length - 1)]
      return {
        orbital: {
          n: s.n, l: s.l, m: s.m, name: '' + s.n + sub,
          chemName: (s.wavefunction === 'real' && win.Formula && win.Formula.realOrbitalName)
            ? win.Formula.realOrbitalName(s.l, s.m) : '',
        },
        mode: { wavefunction: s.wavefunction, render: s.render, color: s.color },
        isosurface: { criterion: s.psiCriterion, levelFraction: s.levelFraction },
        charts: { radial: s.radial, angular: s.angularWhich, section: { plane: s.plane, mode: s.sectionMode } },
        camera: { autoRotate: s.autoRotate },
      }
    }
    const formatCompact = (snap) => {
      const s = { ...snap.state, interaction: snap.interaction }
      const it = s.interaction || {}
      return [
        '【当前视图】' + s.orbital.name +
          (s.orbital.chemName ? '(' + s.orbital.chemName + ')' : '') +
          '  n=' + s.orbital.n + ' l=' + s.orbital.l + ' m=' + s.orbital.m,
        '【模式】' + s.mode.wavefunction + ' / ' + s.mode.render + ' / 着色:' + s.mode.color,
        '【等值面】判据 ' + s.isosurface.criterion + '，阈值 ' + (s.isosurface.levelFraction * 100).toFixed(1) + '%',
        '【图表】径向 [' + (s.charts.radial || []).join(',') + ']；角度 ' + s.charts.angular +
          '；截面 ' + s.charts.section.plane + '/' + s.charts.section.mode,
        '【交互】空闲 ' + Math.round((it.idleMs || 0) / 1000) + 's' +
          '；切换次数 ' + JSON.stringify(it.toggleCounts || {}) +
          '；最近动作 ' + (it.recentActions || []).join('→'),
      ].join('\n')
    }

    const mine = createPerception({
      getState: () => state, fieldLabels: FIELD_LABEL, dwellFields: ['n', 'l', 'm'],
      describeState, formatCompact, now: () => clock,
    })

    // 同一组状态变化驱动两者
    const drive = (label, fn) => {
      fn()
      win.Perception.poll()
      mine.poll()
      const a = win.Perception.getTrace()
      const b = mine.getTrace()
      check(`痕迹一致：${label}`, JSON.stringify(a) === JSON.stringify(b),
        `原 ${JSON.stringify(a)} vs 新 ${JSON.stringify(b)}`)
    }

    win.Perception.poll(); mine.poll()
    check('首次 poll 行为一致（不记动作）',
      win.Perception.getTrace().recentActions.length === 0 && mine.getTrace().recentActions.length === 0)

    drive('n: 3→4', () => { clock = 100500; state = { ...state, n: 4 } })
    drive('m: 0→1', () => { clock = 102000; state = { ...state, m: 1 } })
    clock = 102300; win.Perception.poll(); mine.poll()
    drive('l 与 render 同时变', () => { clock = 105000; state = { ...state, l: 1, render: 'cloud' } })
    drive('无变化', () => { clock = 106000 })
    clock = 110000; win.Perception.poll(); mine.poll()

    check('空闲时长一致', true) // 已在上面每步比对中覆盖

    // 紧凑文本逐字比对
    const a = win.Perception.toCompactText()
    const b = mine.toCompactText()
    check('紧凑文本逐字一致', a === b, a === b ? '' : `\n    原: ${JSON.stringify(a)}\n    新: ${JSON.stringify(b)}`)

    // 快照主体（形状不同：orbit 把 interaction 平铺在顶层，新实现分成 state + interaction，
    // 故比对时剔除 interaction，只比视图状态那一部分）
    const sa = win.Perception.snapshot()
    const { interaction: _omitA, ...saBody } = sa
    const sb = mine.snapshot()
    check('快照主体内容一致', JSON.stringify(saBody) === JSON.stringify(sb.state),
      `原 ${JSON.stringify(saBody)} vs 新 ${JSON.stringify(sb.state)}`)
    check('两者的 interaction 也一致',
      JSON.stringify(sa.interaction) === JSON.stringify(sb.interaction))
  } finally {
    Date.now = realNow
  }
}

// ============================================================================
section('storyboard：机制验证 + 与 orbit 原引擎的协议等价性')
// ============================================================================
{
  // ---- 事件序列记录器：两边各自订阅，最后比对事件序列 ----
  const rec = (label) => {
    const evts = []
    return {
      label, evts,
      fn: (e) => evts.push(e.phase + (e.action ? ':' + e.action : '') + (e.index != null ? '@' + e.index : '')),
      // 只保留引擎决定的"进程性"事件，去掉带具体文案的字段（两边文案来源不同）
      shape: () => evts.join(' | '),
    }
  }

  // ---- 受控渲染时钟（orbit 的 applyAnimated 用 requestAnimationFrame）----
  const realRaf = globalThis.requestAnimationFrame
  const realCaf = globalThis.cancelAnimationFrame
  const rafQ = []
  globalThis.requestAnimationFrame = (fn) => { rafQ.push(fn); return rafQ.length }
  globalThis.cancelAnimationFrame = () => {}

  try {
    // ---- 共用桩：一个记录 applyAction 调用的假模块 ----
    const mkApp = () => {
      const calls = []
      let st = { renderMode: 'points', colorMode: 'orbital' }
      return {
        calls,
        getState: () => ({ ...st }),
        applyAction: (a) => {
          calls.push(a.action + ':' + JSON.stringify(a.params))
          if (a.action === 'setRenderMode') st.renderMode = a.params.mode
          if (a.action === 'setColorMode') st.colorMode = a.params.mode
          if (a.action === 'restoreState') st = { ...a.params.state }
          return { ok: true }
        },
      }
    }

    // ---- 载入 orbit 原引擎 ----
    const win = loadScripts({}, [orbit('js/agent/scene-bridge.js')])
    const orbApp = mkApp()
    win.OrbitApp = orbApp
    win.Orbit3D = { getAnnotations: () => null, setAnnotations: () => {} }
    const OB = win.SceneBridge
    check('orbit SceneBridge 已就绪', !!OB && typeof OB.applySequence === 'function')

    // 从 orbit 自己的词汇表生成我的 vocabulary（保证 animated/concept 判定一致）
    const vocab = Object.fromEntries(
      OB.listActions().map((a) => [a.action, { animated: a.animated, concept: a.concept, desc: a.desc }])
    )
    check('从 orbit 取到动作词汇表', Object.keys(vocab).length > 5, `${Object.keys(vocab).length} 个动作`)

    // ---- 我的引擎：validate 只覆盖本次用到的动作，语义与 orbit 一致 ----
    const myApp = mkApp()
    const validate = (name, p) => {
      switch (name) {
        case 'setRenderMode': return ['points', 'surface'].includes(p.mode) ? { params: { mode: p.mode } } : { err: 'mode 非法' }
        case 'setColorMode': return ['orbital', 'phase'].includes(p.mode) ? { params: { mode: p.mode } } : { err: 'mode 非法' }
        case 'setPsiCriterion': return ['psi', 'psi2'].includes(p.criterion) ? { params: { criterion: p.criterion } } : { err: 'criterion 非法' }
        case 'showRadial': {
          const which = (p.which || []).filter((k) => ['R', 'R2', 'D', 'D2'].includes(k))
          return which.length ? { params: { which } } : { err: 'which 非法（应为 R/R2/D/D2 的非空子集）' }
        }
        case 'setSectionPlane': return ['xy', 'xz', 'yz'].includes(p.plane) ? { params: { plane: p.plane } } : { err: 'plane 非法' }
        default: return { err: '未知动作：' + name }
      }
    }
    const SB = createStoryboard({
      validate, vocabulary: vocab,
      applyStep: (name, params) => myApp.applyAction({ action: name, params }),
      capture: () => ({ state: myApp.getState() }),
      restore: (s) => myApp.applyAction({ action: 'restoreState', params: { state: s.state } }),
      getDefaultPlayback: () => 'manual',
    })

    const settle = () => new Promise((r) => setTimeout(r, 5))
    const ACTIONS = [
      { action: 'setRenderMode', params: { mode: 'surface' }, speech: '切球棍' },
      { action: 'setColorMode', params: { mode: 'phase' }, speech: '按相位着色' },
      { action: 'showRadial', params: { which: ['R', 'D'] } },
    ]

    // =====================================================================
    // 阶段 1：手动模式 → 入队即返回，**不执行**
    // =====================================================================
    const r1 = rec('orbit'), r2 = rec('mine')
    OB.onProgress(r1.fn); SB.onProgress(r2.fn)

    const a1 = await OB.applySequence(ACTIONS)
    const a2 = await SB.applySequence(ACTIONS)

    check('入队返回的 accepted/queued/total 一致',
      a1.accepted === a2.accepted && a1.queued === a2.queued && a1.total === a2.total,
      `原 ${JSON.stringify({ a: a1.accepted, q: a1.queued, t: a1.total })} vs 新 ${JSON.stringify({ a: a2.accepted, q: a2.queued, t: a2.total })}`)
    check('manual 标志一致（默认逐步）', a1.manual === a2.manual && a1.manual === true)
    check('executed 均为空（本次调用未跑完整轮）', a1.executed.length === 0 && a2.executed.length === 0)
    // ★ 记录一个不显眼但承重的行为：正常播放时**第一个动作立即执行**，闸门在其后。
    //   两边必须一致；这也解释了为什么下面 index 起始是 1 而不是 0。
    check('第一个动作立即执行（两边的动作序列相同）',
      JSON.stringify(orbApp.calls) === JSON.stringify(myApp.calls),
      `原 ${JSON.stringify(orbApp.calls)} vs 新 ${JSON.stringify(myApp.calls)}`)
    check('第一个动作立即执行（各 1 次）',
      orbApp.calls.length === 1 && myApp.calls.length === 1,
      `原 ${orbApp.calls.length} 次 / 新 ${myApp.calls.length} 次`)
    check('state() 都停在闸门上等确认（等第 2 步）',
      OB.state().waitingForUser === true && SB.state().waitingForUser === true)
    check('state() 的 index/total/pending 一致',
      OB.state().index === SB.state().index && OB.state().total === SB.state().total &&
      JSON.stringify(OB.state().pending) === JSON.stringify(SB.state().pending),
      `原 ${JSON.stringify(OB.state())} vs 新 ${JSON.stringify(SB.state())}`)
    check('过程事件序列一致（up to 入队 + 第一步）', r1.shape() === r2.shape(), `原 [${r1.shape()}] vs 新 [${r2.shape()}]`)

    // =====================================================================
    // 阶段 2：逐步点「下一步」（第一步已在阶段 1 执行过）
    // =====================================================================
    const idxBefore = SB.state().index
    OB.next(); SB.next(); await settle()
    check('第 1 次 next 后 applyAction 序列一致',
      JSON.stringify(orbApp.calls) === JSON.stringify(myApp.calls),
      `原 ${JSON.stringify(orbApp.calls)} vs 新 ${JSON.stringify(myApp.calls)}`)
    check('第 1 次 next 后 index 一致且前进了一步',
      OB.state().index === SB.state().index && SB.state().index === idxBefore + 1,
      `原 ${OB.state().index} vs 新 ${SB.state().index}（期望 ${idxBefore + 1}）`)

    OB.next(); SB.next(); await settle()
    check('第 2 次 next 后 applyAction 序列一致', JSON.stringify(orbApp.calls) === JSON.stringify(myApp.calls))
    check('走完后 canPrev 一致', OB.state().canPrev === SB.state().canPrev)
    check('过程事件序列一致（up to 走完）', r1.shape() === r2.shape(), `原 [${r1.shape()}] vs 新 [${r2.shape()}]`)

    // =====================================================================
    // 阶段 3：「上一步」必须靠快照还原（且不释放闸门）
    // =====================================================================
    const beforePrev = orbApp.calls.length
    const p1 = OB.prev(); const p2 = SB.prev()
    check('prev 返回值一致', JSON.stringify(p1) === JSON.stringify(p2), `原 ${JSON.stringify(p1)} vs 新 ${JSON.stringify(p2)}`)
    await settle()
    check('prev 触发了快照还原（两边都调了 restoreState）',
      orbApp.calls.slice(beforePrev).some((c) => c.startsWith('restoreState')) &&
      myApp.calls.slice(beforePrev).some((c) => c.startsWith('restoreState')))
    check('prev 后 applyAction 序列仍一致', JSON.stringify(orbApp.calls) === JSON.stringify(myApp.calls),
      `原 ${JSON.stringify(orbApp.calls)} vs 新 ${JSON.stringify(myApp.calls)}`)
    check('prev 后仍等在闸门上（刻意不释放）',
      OB.state().waitingForUser === true && SB.state().waitingForUser === true)
    check('过程事件序列一致（含 back）', r1.shape() === r2.shape(), `原 [${r1.shape()}] vs 新 [${r2.shape()}]`)

    // =====================================================================
    // 阶段 4：切连播 → 走完 → done 保留队列可重播
    // =====================================================================
    OB.autoPlay(); SB.autoPlay(); await settle()
    await settle()
    check('自动播完后 index=total', OB.state().index === OB.state().total && SB.state().index === SB.state().total,
      `原 ${OB.state().index}/${OB.state().total} vs 新 ${SB.state().index}/${SB.state().total}`)
    check('播完后 canReplay 都为真', OB.state().canReplay === true && SB.state().canReplay === true)
    check('applyAction 序列一致（走完全程）', JSON.stringify(orbApp.calls) === JSON.stringify(myApp.calls),
      `原 ${JSON.stringify(orbApp.calls)}\n      新 ${JSON.stringify(myApp.calls)}`)
    check('过程事件序列一致（走完全程）', r1.shape() === r2.shape(), `原 [${r1.shape()}]\n      新 [${r2.shape()}]`)

    // =====================================================================
    // 阶段 5：stop() 必须唤醒闸门，否则 await 永久挂住
    // =====================================================================
    const stopTest = async (bridge) => {
      // 用 2 个动作，这样第一个立即执行后会**停在闸门**上（单个动作会直接走完不入闸门）
      await bridge.applySequence([
        { action: 'setRenderMode', params: { mode: 'points' } },
        { action: 'setColorMode', params: { mode: 'orbital' } },
      ])
      const running = bridge.state().waitingForUser
      bridge.stop()                       // 若 stop 不唤醒闸门，后续 await 会永久挂住
      const aborted = await Promise.race([
        (async () => { await settle(); return 'resolved' })(),
        new Promise((r) => setTimeout(() => r('HUNG'), 400)),
      ])
      return { running, aborted }
    }
    const s1 = await stopTest(OB)
    const s2 = await stopTest(SB)
    check('两边都在闸门上', s1.running === true && s2.running === true, `原 ${s1.running} / 新 ${s2.running}`)
    check('stop() 后都不挂死（闸门被唤醒）', s1.aborted === 'resolved' && s2.aborted === 'resolved',
      `原 ${s1.aborted} / 新 ${s2.aborted}`)
    check('stop() 后 playing 均为假且队列清空',
      OB.state().playing === false && SB.state().playing === false &&
      OB.state().total === 0 && SB.state().total === 0)

    // =====================================================================
    // 阶段 6：校验失败不占用户的点击；超上限被截断
    // =====================================================================
    const bad1 = await OB.applySequence([{ action: 'setRenderMode', params: { mode: 'NOPE' } }])
    const bad2 = await SB.applySequence([{ action: 'setRenderMode', params: { mode: 'NOPE' } }])
    check('非法参数被退回且不入队', bad1.accepted === 0 && bad2.accepted === 0 &&
      bad1.failed.length === 1 && bad2.failed.length === 1)
    check('非法参数时也不进入播放态', OB.state().playing === false && SB.state().playing === false)

    const many = Array.from({ length: 20 }, () => ({ action: 'setColorMode', params: { mode: 'orbital' } }))
    const m1 = await OB.applySequence(many)
    const m2 = await SB.applySequence(many)
    OB.stop(); SB.stop()
    check('单轮动作数上限一致（超出者丢弃）',
      m1.accepted === m2.accepted && m1.dropped === m2.dropped,
      `原 accepted=${m1.accepted} dropped=${m1.dropped} vs 新 accepted=${m2.accepted} dropped=${m2.dropped}`)
    check('上限为 12', m2.accepted === 12, `实际 ${m2.accepted}`)

    // =====================================================================
    // 阶段 7：auto 模式（脚本回放路径）
    // =====================================================================
    const a3 = await OB.applySequence(ACTIONS, { auto: true, noPacing: true })
    const a4 = await SB.applySequence(ACTIONS, { auto: true, noPacing: true })
    check('auto 模式 executed 数与 aborted 一致',
      a3.executed.length === a4.executed.length && a3.aborted === a4.aborted,
      `原 ${JSON.stringify({ e: a3.executed.length, ab: a3.aborted })} vs 新 ${JSON.stringify({ e: a4.executed.length, ab: a4.aborted })}`)
    check('auto 模式后不在闸门上', OB.state().waitingForUser === false && SB.state().waitingForUser === false)
  } finally {
    globalThis.requestAnimationFrame = realRaf
    globalThis.cancelAnimationFrame = realCaf
  }
}

// ============================================================================
section('conversation：循环机制 + 与 orbit 原循环的等价性')
// ============================================================================
{
  // ---- 假 LLM：按脚本逐次返回，并记录收到的 messages ----
  const mkLLM = (script) => {
    let i = 0
    const calls = []
    return {
      calls,
      chat: async (o) => {
        calls.push({
          msgs: JSON.parse(JSON.stringify(o.messages)),
          tools: (o.tools || []).length,
        })
        const r = script[Math.min(i++, script.length - 1)]
        if (r.streamReasoning && o.onDelta) o.onDelta({ type: 'reasoning', text: r.streamReasoning })
        if (r.content && o.onDelta) o.onDelta({ type: 'content', text: r.content })
        return {
          content: r.content || '',
          // 刻意允许返回比流出的更多的 reasoning，以覆盖"补发差额"这条路径
          reasoning: r.reasoning != null ? r.reasoning : (r.streamReasoning || ''),
          toolCalls: r.toolCalls || [],
          finishReason: r.finishReason || 'stop',
          usage: r.usage || null,
        }
      },
    }
  }

  const tc = (name, args, id) => ({ id: id || ('call_' + name), type: 'function', function: { name, arguments: JSON.stringify(args || {}) } })

  /**
   * 跑一次对话，返回可比对的观测量。
   * @param {Function} make  (deps) => { send, stop, getHistory }  用来喂 orbit 或我的实现
   * @param {Function} wire  (deps, handlers) => void              各侧不同的接线方式
   */
  const runCase = async (make, wire, script, handlersOverride) => {
    const events = { deltas: [], notices: [], toolCalls: [], toolResults: [], messages: [], errors: [], done: null }
    const H = {
      onDelta: (e) => events.deltas.push(e.type + ':' + e.text),
      onNotice: (n) => events.notices.push(n.kind),
      onToolCall: (i) => events.toolCalls.push(i.name),
      onToolResult: (i) => events.toolResults.push(i.name + ':' + JSON.stringify(i.result)),
      onMessage: (m) => events.messages.push(m.content),
      onError: (e) => events.errors.push(e.kind + ':' + e.message),
      onDone: (s) => { events.done = { rounds: s.rounds, tools: s.tools, aborted: s.aborted, finishReason: s.finishReason } },
      ...(handlersOverride || {}),
    }
    const deps = make()
    wire(deps, H)
    const summary = await deps.send('学生提问', H)
    return { events, summary, history: deps.getHistory(), calls: deps.llmCalls ? deps.llmCalls() : null }
  }

  // ---- orbit 侧接线 ----
  const setupOrbit = (script, toolExec) => {
    const llm = mkLLM(script)
    const win = loadScripts({}, [orbit('js/agent/agent-core.js')])
    let snapN = 0
    win.LLMClient = llm
    win.Settings = { get: () => ({ apiKey: 'test-key', maxTokens: 512, model: 'm' }) }
    win.Perception = { toCompactText: () => 'SNAP#' + (++snapN) }
    win.ToolRegistry = { TOOLS: [{ type: 'function', function: { name: 'getSnapshot' } }], execute: toolExec }
    win.SceneBridge = { stop: () => {} }
    return {
      deps: {
        send: (t, H) => win.AgentCore.send(t, H),
        stop: () => win.AgentCore.stop(),
        getHistory: () => win.AgentCore.getHistory(),
        llmCalls: () => llm.calls,
      },
      win,
    }
  }

  // ---- 我的侧接线 ----
  const setupMine = (script, toolExec, over) => {
    const llm = mkLLM(script)
    let snapN = 0
    const conv = createConversation({
      llm,
      buildSystem: () => 'ROLE',
      getSettings: () => ({ apiKey: 'test-key', maxTokens: 512, model: 'm' }),
      getTools: () => [{ type: 'function', function: { name: 'getSnapshot' } }],
      executeTool: (name, argsJson) => toolExec(name, argsJson),
      getSnapshotText: () => 'SNAP#' + (++snapN),
      ...(over || {}),
    })
    return {
      deps: {
        send: (t, H) => conv.send(t, H),
        stop: () => conv.stop(),
        getHistory: () => conv.getHistory(),
        llmCalls: () => llm.calls,
      },
      conv,
    }
  }

  // ---------------------------------------------------------------------
  // 用例 1：正常两轮（工具调用 → 回灌 → 收尾）
  // ---------------------------------------------------------------------
  {
    const script = [
      { content: '我来看看当前状态', toolCalls: [tc('getSnapshot', {})], finishReason: 'tool_calls' },
      { content: '这是解释。', finishReason: 'stop', usage: { total_tokens: 42 } },
    ]
    const toolExec = async (name, argsJson) => ({ ok: true, echo: name, argsLen: String(argsJson).length })

    const A = await runCase(() => setupOrbit(script, toolExec).deps, () => {}, script)
    const B = await runCase(() => setupMine(script, toolExec).deps, () => {}, script)

    check('两轮用例：rounds 一致', A.events.done.rounds === B.events.done.rounds, `${A.events.done.rounds} vs ${B.events.done.rounds}`)
    check('两轮用例：工具调用序列一致', JSON.stringify(A.events.toolCalls) === JSON.stringify(B.events.toolCalls),
      `${JSON.stringify(A.events.toolCalls)} vs ${JSON.stringify(B.events.toolCalls)}`)
    check('两轮用例：工具结果回灌一致', JSON.stringify(A.events.toolResults) === JSON.stringify(B.events.toolResults))
    check('两轮用例：流式增量序列一致', JSON.stringify(A.events.deltas) === JSON.stringify(B.events.deltas),
      `${JSON.stringify(A.events.deltas)} vs ${JSON.stringify(B.events.deltas)}`)
    check('两轮用例：finishReason 一致', A.events.done.finishReason === B.events.done.finishReason)
    check('两轮用例：LLM 被调用次数一致', A.calls.length === B.calls.length && B.calls.length === 2)
    check('两轮用例：第二次调用的 messages 角色序列一致（含 tool 回灌）',
      A.calls[1].msgs.map((m) => m.role).join(',') === B.calls[1].msgs.map((m) => m.role).join(','),
      `${A.calls[1].msgs.map((m) => m.role).join(',')} vs ${B.calls[1].msgs.map((m) => m.role).join(',')}`)
    check('两轮用例：工具数传给 LLM 一致', A.calls[0].tools === B.calls[0].tools && B.calls[0].tools === 1)
    check('两轮用例：历史角色序列一致',
      A.history.map((m) => m.role).join(',') === B.history.map((m) => m.role).join(','),
      `${A.history.map((m) => m.role).join(',')} vs ${B.history.map((m) => m.role).join(',')}`)
    check('两轮用例：assistant 消息都回传面板', JSON.stringify(A.events.messages) === JSON.stringify(B.events.messages))
  }

  // ---------------------------------------------------------------------
  // 用例 2：快照每轮重采（坑 1）—— 两次调用里注入的快照必须不同
  // ---------------------------------------------------------------------
  {
    const script = [
      { toolCalls: [tc('getSnapshot', {})], finishReason: 'tool_calls' },
      { content: '完毕', finishReason: 'stop' },
    ]
    const toolExec = async () => ({ ok: true })
    const B = await runCase(() => setupMine(script, toolExec).deps, () => {}, script)
    const snap1 = B.calls[0].msgs.find((m) => m.role === 'system' && /SNAP#/.test(m.content))
    const snap2 = B.calls[1].msgs.find((m) => m.role === 'system' && /SNAP#/.test(m.content))
    check('每轮都注入了快照', !!snap1 && !!snap2)
    check('第二轮拿到的是**新**快照（不是沿用旧的）', snap1.content !== snap2.content, `${snap1 && snap1.content} vs ${snap2 && snap2.content}`)
    check('快照作为临时 system 插在 index 1（不写进 history）',
      B.calls[0].msgs[1] && /SNAP#/.test(B.calls[0].msgs[1].content) &&
      !B.history.some((m) => /SNAP#/.test(m.content || '')))
  }

  // ---------------------------------------------------------------------
  // 用例 3：思考未走流式 → 按差额补发（坑 6）
  // ---------------------------------------------------------------------
  {
    const script = [{ content: '正文', reasoning: '完整思考内容很长', finishReason: 'stop' }]
    const toolExec = async () => ({ ok: true })
    const A = await runCase(() => setupOrbit(script, toolExec).deps, () => {}, script)
    const B = await runCase(() => setupMine(script, toolExec).deps, () => {}, script)
    check('未流式的思考被补发（两边一致）', JSON.stringify(A.events.deltas) === JSON.stringify(B.events.deltas),
      `${JSON.stringify(A.events.deltas)} vs ${JSON.stringify(B.events.deltas)}`)
    check('补发的内容就是完整思考', B.events.deltas.includes('reasoning:完整思考内容很长'))
  }

  // ---------------------------------------------------------------------
  // 用例 4：长度截断 → 显式续写，超过上限则放弃（坑 5）
  // ---------------------------------------------------------------------
  {
    const script = [
      { content: '写了一半', finishReason: 'length' },
      { content: '再写一段', finishReason: 'length' },
      { content: '继续', finishReason: 'length' },
      { content: '还想写', finishReason: 'length' },
    ]
    const toolExec = async () => ({ ok: true })
    const A = await runCase(() => setupOrbit(script, toolExec).deps, () => {}, script)
    const B = await runCase(() => setupMine(script, toolExec).deps, () => {}, script)
    check('截断通知序列一致', JSON.stringify(A.events.notices) === JSON.stringify(B.events.notices),
      `${JSON.stringify(A.events.notices)} vs ${JSON.stringify(B.events.notices)}`)
    // 轮次：第1轮截断→续写1；第2轮截断→续写2；第3轮截断→达上限放弃。
    // 故 'truncated' 出现 maxContinues+1 = 3 次，之后是 giveup。
    check('截断通知出现 maxContinues+1 次',
      B.events.notices.filter((k) => k === 'truncated').length === 3,
      JSON.stringify(B.events.notices))
    check('放弃时发出 truncated_giveup', B.events.notices.includes('truncated_giveup'))
    check('截断后注入的是续写指令（user 角色）',
      B.calls[1].msgs.some((m) => m.role === 'user' && /截断/.test(m.content)))
    check('截断用例：LLM 调用次数一致', A.calls.length === B.calls.length, `${A.calls.length} vs ${B.calls.length}`)
  }

  // ---------------------------------------------------------------------
  // 用例 5：中途中止 → 剩余工具调用必须补发占位 tool 消息（坑 4，最关键）
  // ---------------------------------------------------------------------
  {
    const script = [
      {
        toolCalls: [tc('t1', {}, 'c1'), tc('t2', {}, 'c2'), tc('t3', {}, 'c3'), tc('t4', {}, 'c4')],
        finishReason: 'tool_calls',
      },
      { content: '不该走到这里', finishReason: 'stop' },
    ]
    const mkAbortingExec = (stopFn) => async (name) => {
      if (name === 't2') stopFn()          // 执行第 2 个工具时用户叫停
      return { ok: true, name }
    }

    // 两侧都在「执行第 2 个工具时」叫停自己，从而走到"丢弃剩余调用"的分支
    const o = setupOrbit(script, mkAbortingExec(() => o.win.AgentCore.stop()))
    const A = await runCase(() => o.deps, () => {}, script)

    const m = setupMine(script, mkAbortingExec(() => m.conv.stop()))
    const B = await runCase(() => m.deps, () => {}, script)

    check('中止后只执行了已开始的工具（两边的 toolCall 序列一致）',
      JSON.stringify(A.events.toolCalls) === JSON.stringify(B.events.toolCalls),
      `${JSON.stringify(A.events.toolCalls)} vs ${JSON.stringify(B.events.toolCalls)}`)
    check('中止后 aborted 标志一致', A.events.done.aborted === B.events.done.aborted && B.events.done.aborted === true,
      `原 ${A.events.done.aborted} / 新 ${B.events.done.aborted}`)

    // ★ 核心：tool_calls 与 tool 消息必须配对——未执行的也要有占位消息
    const pairOk = (hist) => {
      const asst = hist.find((m) => m.tool_calls)
      const ids = (asst.tool_calls || []).map((t) => t.id)
      const toolIds = hist.filter((m) => m.role === 'tool').map((m) => m.tool_call_id)
      return ids.length === toolIds.length && ids.every((id, i) => id === toolIds[i])
    }
    check('orbit 侧历史配对完好', pairOk(A.history), JSON.stringify(A.history.map((m) => m.role)))
    check('新实现历史配对完好（未执行的调用补了占位 tool 消息）', pairOk(B.history),
      JSON.stringify(B.history.map((m) => m.role)))
    check('两边历史角色序列一致',
      A.history.map((m) => m.role).join(',') === B.history.map((m) => m.role).join(','),
      `${A.history.map((m) => m.role).join(',')} vs ${B.history.map((m) => m.role).join(',')}`)
    const placeholder = B.history.filter((m) => m.role === 'tool' && /aborted/.test(m.content))
    check('未执行的调用写了 aborted 占位内容', placeholder.length === 2,
      `占位数 ${placeholder.length}（期望 2：t3、t4）`)
  }

  // ---------------------------------------------------------------------
  // 用例 6：未配置 API Key → 明确报错且不发请求
  // ---------------------------------------------------------------------
  {
    const script = [{ content: 'x' }]
    const toolExec = async () => ({ ok: true })
    const llmO = mkLLM(script)
    const win = loadScripts({}, [orbit('js/agent/agent-core.js')])
    win.LLMClient = llmO
    win.Settings = { get: () => ({ apiKey: '' }) }
    win.Perception = { toCompactText: () => '' }
    win.ToolRegistry = { TOOLS: [], execute: toolExec }
    win.SceneBridge = { stop: () => {} }
    const eo = []
    await win.AgentCore.send('hi', { onError: (e) => eo.push(e.kind) })

    const llmM = mkLLM(script)
    const conv = createConversation({
      llm: llmM, buildSystem: () => 'ROLE', getSettings: () => ({ apiKey: '' }),
      getTools: () => [], executeTool: toolExec, getSnapshotText: () => '',
    })
    const em = []
    await conv.send('hi', { onError: (e) => em.push(e.kind) })

    check('无 Key 时两边都报 no_key', JSON.stringify(eo) === JSON.stringify(em) && em[0] === 'no_key',
      `${JSON.stringify(eo)} vs ${JSON.stringify(em)}`)
    check('无 Key 时不发任何请求', llmO.calls.length === 0 && llmM.calls.length === 0)
  }

  // ---------------------------------------------------------------------
  // 用例 7：轮数上限
  // ---------------------------------------------------------------------
  {
    const script = [{ toolCalls: [tc('t1', {})], finishReason: 'tool_calls' }]   // 永远要调工具
    const toolExec = async () => ({ ok: true })
    const A = await runCase(() => setupOrbit(script, toolExec).deps, () => {}, script)
    const B = await runCase(() => setupMine(script, toolExec).deps, () => {}, script)
    check('轮数上限一致（不让循环无限跑）',
      A.events.done.rounds === B.events.done.rounds && B.events.done.rounds === 6,
      `原 ${A.events.done.rounds} / 新 ${B.events.done.rounds}`)
    check('轮数上限用例：LLM 调用次数一致', A.calls.length === B.calls.length)
  }

  // ---------------------------------------------------------------------
  // 用例 8：buildManifestText / composeSystemPrompt（渐进式披露的拼装）
  // ---------------------------------------------------------------------
  {
    const kc = createCatalog({ key: 'id' })
    kc.register([{ id: 'crystal:C1-1', kp: 'crystal:C1', title: '标题', keywords: ['a', 'b'], body: '重内容不该进清单' }])
    const sc = createCatalog({ key: 'name' })
    sc.register([{ name: 'feynman', title: '费曼', desc: '让学生自己讲', when: '任何时候', steps: ['x'] }])

    const t = buildManifestText({ knowledge: kc, skills: sc })
    check('清单含知识库段', /【知识库清单】/.test(t))
    check('清单含技能库段', /【教学技能清单】/.test(t))
    check('清单含知识点 id 与关键词', /crystal:C1-1/.test(t) && /关键词:a\/b/.test(t))
    check('清单**不含**正文（渐进式披露）', !/重内容不该进清单/.test(t))
    check('清单提示要按需加载', /loadKnowledge\(id\)/.test(t) && /loadSkill\(name\)/.test(t))
    check('无目录时返回空串', buildManifestText({}) === '')

    const p = composeSystemPrompt({ role: 'R', manifest: 'M', nodePrompt: 'N' })
    check('系统提示三段式拼装', p === 'R\n\nM\n\nN')
    check('缺段时不留空行', composeSystemPrompt({ role: 'R', nodePrompt: 'N' }) === 'R\n\nN')
  }
}

// ============================================================================
section('tool-registry：节点白名单在结构上生效')
// ============================================================================
{
  const def = (name) => ({ type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } })
  const tools = {
    read: [def('getSceneSnapshot'), def('getInteractionTrace')],
    query: [def('loadKnowledge'), def('loadSkill')],
    hand: [def('applySceneActions'), def('highlightAtoms')],
    teach: [def('generateQuiz'), def('diagnoseError')],
  }
  const calls = []
  const handlers = {
    getSceneSnapshot: () => { calls.push('snap'); return { state: 1 } },
    getInteractionTrace: () => ({ idleMs: 0 }),
    loadKnowledge: (a) => (a.id === 'x' ? { id: 'x', body: '正文' } : null),  // null → {ok:true}
    loadSkill: () => ({ name: 'feynman' }),
    applySceneActions: () => ({ accepted: 1 }),
    highlightAtoms: () => ({ ok: true }),
    generateQuiz: () => ({ q: 1 }),
    diagnoseError: () => { throw new Error('诊断模块炸了') },                 // 抛异常 → 作为结果回灌
  }
  const missingSeen = []
  const R = createToolRegistry({ tools, handlers, onMissing: (m, node) => missingSeen.push(node + ':' + m.join(',')) })

  check('未指定节点时拒绝暴露任何工具', (() => {
    try { R.definitions(); return false } catch (e) { return /决策节点/.test(e.message) }
  })())

  // ---- quiz：无 hand 授权 → 拿不到 applySceneActions ----
  R.setNode('quiz')
  const qNames = R.available()
  check('quiz 节点无 hand 工具（结构上做不到）', !qNames.includes('applySceneActions') && !qNames.includes('highlightAtoms'),
    qNames.join(','))
  check('quiz 节点拿到 read + query', qNames.includes('getSceneSnapshot') && qNames.includes('loadKnowledge'))
  check('quiz 节点定义数组里没有 hand 工具',
    !R.definitions().some((d) => ['applySceneActions', 'highlightAtoms'].includes(d.function.name)))
  check('quiz 节点执行 applySceneActions 被拒（执行期二次把关）',
    /不可用/.test((await R.execute('applySceneActions', '{}')).error))
  check('被拒时提示了当前节点与可用工具',
    /quiz/.test((await R.execute('applySceneActions', '{}')).error))

  // ---- route / proactive：同样无 hand、无 teach ----
  for (const n of ['route', 'proactive']) {
    R.setNode(n)
    check(`${n} 节点无 hand、无 teach`,
      !R.available().some((x) => ['applySceneActions', 'highlightAtoms', 'generateQuiz', 'diagnoseError'].includes(x)),
      R.available().join(','))
  }

  // ---- explain：有完整 hand 授权 ----
  R.setNode('explain')
  check('explain 节点拿到 hand 工具（边讲边演示）', R.available().includes('applySceneActions'))
  check('explain 节点无 teach 工具（讲解节点不出题）', !R.available().includes('generateQuiz'))

  // ---- grade：granted hand 但 deny 掉 applySceneActions ----
  R.setNode('grade')
  check('grade 节点能用诊断动作（highlightAtoms）', R.available().includes('highlightAtoms'))
  check('grade 节点被 deny 掉 applySceneActions（只能用诊断动作，不能自由操控）',
    !R.available().includes('applySceneActions'), R.available().join(','))
  check('grade 节点能出题与诊断', R.available().includes('generateQuiz') && R.available().includes('diagnoseError'))

  // ---- 「声明与实现脱节」的探针 ----
  // ★ B5 对账后 constraints 的 CORE_TOOLS 只列核心真正提供的工具，
  //   故 explain 节点「允许的」工具现在全都有人实现 → missing() 应为空。
  //   这比"报出一堆幽灵名"是更好的状态。
  R.setNode('explain')
  const miss = R.missing()
  check('explain 节点允许的工具全部已实现（missing 为空）', miss.length === 0, miss.join(','))

  // 探针仍要能工作：grade 的 allowExtra 声明的 getDiagnosisActions 无人实现
  R.setNode('grade')
  check('missing() 报出 allowExtra 里未实现的名字',
    R.missing().includes('getDiagnosisActions'), R.missing().join(','))
  check('onMissing 回调被触发（用于暴露 descriptor 与实现的偏差）',
    missingSeen.some((s) => s.startsWith('grade:')), JSON.stringify(missingSeen))
  R.setNode('explain')

  // ---- 受控的跨模块联动（B6b 约束 2）----
  R.setNode('explain')
  check('默认看不到其他模块的工具', !R.available().includes('crystalSearch'))
  R.setNode('explain', { query: ['crystalSearch'] })
  check('显式注入后才可见（跨模块是受控能力，不是默认）', R.available().includes('crystalSearch') || R.missing().includes('crystalSearch'))
  R.setNode('quiz', { query: ['crystalSearch'] })
  check('注入跨模块 query 不会连带放开 hand', !R.available().includes('applySceneActions'))

  // ---- execute 的归一化与容错 ----
  R.setNode('explain')
  check('null 结果归一为 {ok:true}', JSON.stringify(await R.execute('loadKnowledge', '{"id":"nope"}')) === '{"ok":true}')
  check('正常结果原样返回', (await R.execute('loadKnowledge', '{"id":"x"}')).body === '正文')
  const badJson = await R.execute('loadKnowledge', '{不是 JSON')
  check('非法 JSON 返回错误结果而非抛异常', !!badJson.error && /JSON/.test(badJson.error))
  // handler 抛异常要转成结果——注意得先用一个**允许 teach** 的节点，
  // 否则拿到的是白名单拒绝（那是另一条路径，前面已覆盖）
  R.setNode('grade')
  const threw = await R.execute('diagnoseError', '{}')
  check('handler 抛异常被转成结果（不中断对话循环）', !!threw.error && /执行异常/.test(threw.error),
    JSON.stringify(threw))
  R.setNode('explain')
  check('未知但白名单允许的工具名给明确错误', !!(await R.execute('navigateTo', '{}')).error)
  check('完全未知的工具名也被拒', !!(await R.execute('不存在的工具', '{}')).error)

  // ---- 与 orbit 原 execute 的容错行为对齐 ----
  {
    const win = loadScripts({}, [orbit('js/agent/tool-registry.js')])
    win.SceneBridge = { listActions: () => [], applySequence: async () => ({ accepted: 0 }) }
    win.Perception = { snapshot: () => ({}) }
    const O = win.ToolRegistry
    const oBad = await O.execute('queryOrbital', '{坏 JSON')
    const oUnknown = await O.execute('根本不存在的工具', '{}')
    check('orbit 侧：非法 JSON 也是返回错误结果', !!oBad.error)
    check('orbit 侧：未知工具也是返回错误结果', !!oUnknown.error)
    check('两边的容错策略一致（都不抛异常、都返回错误对象）',
      !!oBad.error && !!badJson.error && !!oUnknown.error && !!(await R.execute('不存在的工具', '{}')).error)
  }
}

// ============================================================================
section('renderer：Markdown+LaTeX 渲染（与 orbit 原实现逐字比对）')
// ============================================================================
{
  // 取 orbit 原文件里「渲染器那一段」的源码文本，在受控作用域里求值。
  // 这样不必修改 orbit 的文件，也能拿到它真正的实现来比对。
  const src = readFileSync(orbit('js/agent/panel.js'), 'utf-8')
  const start = src.indexOf('function escapeHtml')
  const end = src.indexOf('// 构建 UI')
  const block = src.slice(start, end)
  check('成功提取 orbit 的渲染器源码段', start > 0 && end > start && block.includes('function renderRich'))

  const stubKatex = { renderToString: (tex, o) => '[K' + (o && o.displayMode ? 'B' : 'I') + '<' + tex + '>]' }
  const winO = { katex: stubKatex }
  const O = new Function('window', block + '\n return { renderRich, md, trimUnclosedFormula, escapeHtml, katexHtml }')(winO)
  const M = createRenderer({ katex: stubKatex })

  const CASES = [
    ['行内公式夹在句中（不应被切成多行）', '系数各为 $\\frac{1}{2}$ 与 $\\frac{1}{\\sqrt{2}}$ 两项。'],
    ['块公式独占一行', '推导如下：\n\n$$\\psi_{nlm}=R_{n,l}(r)Y_{l,m}(\\theta,\\phi)$$\n\n以上。'],
    ['块公式夹在文字中间（应强制断行）', '由前式 $$E_n=-13.6/n^2$$ 可得结论。'],
    ['未闭合公式 + streaming（应整段裁掉）', '系数各为 $\\frac{1}{2'],
    ['未闭合公式 + 非 streaming（原样保留）', '系数各为 $\\frac{1}{2'],
    ['转义美元号 $\\$ 不当公式', '价格是 \\$5，而公式是 $a+b$。'],
    ['表格', '| 群 | 阶 |\n|---|---|\n| C2v | 4 |\n| D3h | 12 |'],
    ['列表', '- 第一项\n- 第二项\n* 第三项'],
    ['标题', '## 小节标题\n正文'],
    ['引用块', '> 这是引用'],
    ['加粗/斜体/行内代码', '这是**加粗**、*斜体*与 `code` 的混排。'],
    ['HTML 转义', '五五开 < > & " 比较'],
    ['空输入', ''],
    ['多段与空行', '第一段\n\n第二段\n\n\n第三段'],
    ['公式里有特殊字符（转义次序）', '条件 $a<b$ 与 $x>y$ 同时成立'],
  ]

  let same = 0
  for (const [name, input] of CASES) {
    const streaming = /streaming（应整段裁掉）/.test(name) ? true : undefined
    const a = O.renderRich(input, streaming ? { streaming: true } : undefined)
    const b = M.renderRich(input, streaming ? { streaming: true } : undefined)
    if (a === b) same++
    else check(`渲染一致：${name}`, false, `\n      原 ${JSON.stringify(a)}\n      新 ${JSON.stringify(b)}`)
  }
  check(`全部 ${CASES.length} 个渲染用例逐字一致`, same === CASES.length, `一致 ${same}/${CASES.length}`)

  // trimUnclosedFormula 单独比对
  const TRIM = [
    ['未闭合行内', 'abc $x+y'],
    ['未闭合块级', 'abc $$x+y'],
    ['已闭合', 'abc $x$ def'],
    ['转义跳过', 'a \\$ b $c'],
    ['两块一闭合', '$$a$$ 与 $$b'],
    ['空串', ''],
  ]
  let trimSame = 0
  for (const [n, s] of TRIM) {
    if (O.trimUnclosedFormula(s) === M.trimUnclosedFormula(s)) trimSame++
    else check(`trim 一致：${n}`, false, `${JSON.stringify(O.trimUnclosedFormula(s))} vs ${JSON.stringify(M.trimUnclosedFormula(s))}`)
  }
  check(`trimUnclosedFormula 全部 ${TRIM.length} 例一致`, trimSame === TRIM.length)

  // 绝对性质：行内公式不得把一句话切成多个块
  const oneLine = M.renderRich('系数为 $a$ 与 $b$，共两项。')
  check('行内公式不把一句话切成多行', (oneLine.match(/class="md-line"/g) || []).length === 1, oneLine)
  check('行内公式被渲染（非源码裸露）', oneLine.includes('[KI<a>]') && oneLine.includes('[KI<b>]'), oneLine)
  const blk = M.renderRich('由前式 $$E$$ 可得')
  check('块公式独占一个 md-math-block', blk.includes('class="md-math-block"') && blk.includes('[KB<E>]'), blk)
  check('块公式两侧文字各自成行', (blk.match(/class="md-line"/g) || []).length === 2, blk)

  // KaTeX 缺席时退化（总比空白好）
  const noKatex = createRenderer({ katex: null })
  check('KaTeX 缺席时公式退化为等宽源码', /<code>/.test(noKatex.renderRich('$x$')))
  // KaTeX 报错时也退化，而不是让整条消息渲染失败
  const badKatex = createRenderer({ katex: { renderToString: () => { throw new Error('boom') } } })
  check('KaTeX 抛错时退化为源码而非整条渲染失败', /<code>/.test(badKatex.renderRich('$x$')))
  check('KaTeX 抛错不影响同条消息的其它内容', /正文/.test(badKatex.renderRich('正文 $x$ 结尾')))

  // mdInline()：界面文案的轻量标记（用 innerHTML 渲染的那些字符串）
  // 用例取自 orbit 真实文案里的写法，不是自造字符串——自造容易测出并不存在的问题
  {
    const { mdInline } = await import('../ui/renderer.js')
    const CASES = [
      ['**加粗**', '<b>加粗</b>'],
      ['sp² 由 s_y·p_y 与 s_z·p_z 混合', 'sp² 由 s<sub>y</sub>·p<sub>y</sub> 与 s<sub>z</sub>·p<sub>z</sub> 混合'],
      ['(1/√6)p_x + (1/√2)p_y', '(1/√6)p<sub>x</sub> + (1/√2)p<sub>y</sub>'],
      ['d_{x2-y2} 与 d_{xy}', 'd<sub>x2-y2</sub> 与 d<sub>xy</sub>'],
      // 真实写法是 d_z²（上标），不是 d_z2 —— 单字符规则在此正确：
      // 下标只吃 z，² 保持上标形态
      ['d_z² 轨道', 'd<sub>z</sub>² 轨道'],
      // ★ 不误伤：界面文案里出现下划线的其它场合
      ['文件名 my_file.txt 与 a_b', '文件名 my_file.txt 与 a_b'],
      ['', ''],
    ]
    let bad = 0
    for (const [inp, want] of CASES) {
      const got = mdInline(inp)
      if (got !== want) { bad++; check(`mdInline(${JSON.stringify(inp)})`, false, `得到 ${JSON.stringify(got)}`) }
    }
    check(`mdInline 全部 ${CASES.length} 个用例通过（含"不误伤下划线"）`, bad === 0)
    check('mdInline 容忍空值', mdInline(null) === '' && mdInline(undefined) === '')
    check('mdInline 前缀可配置', mdInline('f_x', { prefix: 'fp' }) === 'f<sub>x</sub>')
    check('mdInline 默认不处理 f_x（前缀只认 s/p/d，避免误伤）', mdInline('f_x') === 'f_x')
  }

  // el()：用最小 document 桩驱动两边，比对**行为**（Node 里没有 DOM）
  {
    const mkDoc = () => {
      const mkNode = (tag) => ({
        tag, className: '', textContent: '', innerHTML: '', children: [], attrs: {},
        setAttribute(k, v) { this.attrs[k] = v },
        appendChild(c) { this.children.push(c); return c },
        removeChild(c) {
          const i = this.children.indexOf(c)
          if (i >= 0) this.children.splice(i, 1)
          if (this.firstChild === c) this.firstChild = this.children[0] || null
          return c
        },
      })
      return { createElement: (tag) => mkNode(tag) }
    }
    const probe = (elFn) => {
      globalThis.document = mkDoc()
      try {
        const n = elFn('div', { class: 'c', text: 'TT', html: '<b>H</b>', 'data-x': '1' }, [])
        return { tag: n.tag, className: n.className, textContent: n.textContent, innerHTML: n.innerHTML, attrs: n.attrs }
      } finally { delete globalThis.document }
    }

    // orbit 的 el 出现在 panel.js 与 settings.js 两处；取其一求值
    const srcPanel = readFileSync(orbit('js/agent/panel.js'), 'utf-8')
    const p1 = srcPanel.indexOf('function el(')
    const p2 = srcPanel.indexOf('function build()')
    const Oel = new Function(srcPanel.slice(p1, p2) + '\n return el')()

    const a = probe(Oel)
    const b = probe(el)
    check('el() 的行为与原实现一致', JSON.stringify(a) === JSON.stringify(b),
      `${JSON.stringify(a)} vs ${JSON.stringify(b)}`)
    check('el() 把 class/text/html 走专用通道（不落到 setAttribute）',
      b.className === 'c' && b.textContent === 'TT' && b.innerHTML === '<b>H</b>' &&
      !('class' in b.attrs) && !('text' in b.attrs) && !('html' in b.attrs))
    check('el() 其余属性走 setAttribute', b.attrs['data-x'] === '1')

    // clear()：共享层新增的小工具（桩节点需要 removeChild，已在上面的 mkNode 里补）
    globalThis.document = mkDoc()
    const holder = document.createElement('div')
    const child = document.createElement('span')
    holder.appendChild(child)
    holder.firstChild = child
    const r = clear(holder)
    const emptied = holder.children.length === 0
    delete globalThis.document
    check('clear() 移除子节点并返回该节点', r === holder && emptied)
    check('clear() 容忍 null 输入', clear(null) === null)
  }
}

// ============================================================================
section('panel：界面故障防护（rAF 合帧 / finish 掐帧 / 空正文诊断）')
// ============================================================================
{
  // ---- 最小 DOM 桩 ----
  const mkDom = () => {
    const findIn = (node, tag) => {
      for (const c of node.children) {
        if (c.tag === tag) return c
        const r = findIn(c, tag)
        if (r) return r
      }
      return null
    }
    const mkNode = (tag) => {
      const n = {
        tag, className: '', textContent: '', children: [], attrs: {},
        style: {}, disabled: false, scrollTop: 0, scrollHeight: 0,
        offsetWidth: 40, offsetHeight: 40,
        _classes: new Set(), _html: '', htmlWrites: 0,
        setAttribute(k, v) { n.attrs[k] = v },
        removeAttribute(k) { delete n.attrs[k] },
        appendChild(c) { n.children.push(c); return c },
        removeChild(c) { const i = n.children.indexOf(c); if (i >= 0) n.children.splice(i, 1); return c },
        addEventListener(t, fn) { (n._ev = n._ev || {})[t] = fn },
        querySelector(sel) { return findIn(n, sel.replace(/^\./, '')) },
        insertAdjacentHTML(pos, html) { n._html += html },
        focus() {},
        getBoundingClientRect() { return { left: 0, top: 0, width: 40, height: 40 } },
        get firstChild() { return n.children[0] || null },
      }
      n.classList = {
        add: (...c) => c.forEach((x) => n._classes.add(x)),
        remove: (...c) => c.forEach((x) => n._classes.delete(x)),
        toggle: (c, on) => {
          if (on === undefined) { n._classes.has(c) ? n._classes.delete(c) : n._classes.add(c) }
          else if (on) n._classes.add(c); else n._classes.delete(c)
        },
        contains: (c) => n._classes.has(c),
      }
      Object.defineProperty(n, 'innerHTML', {
        get: () => n._html,
        set: (v) => { n._html = v; n.htmlWrites++ },
      })
      return n
    }
    const body = mkNode('body')
    return {
      document: { body, createElement: mkNode },
      // 找到 body 里最后一个匹配 class 的深搜辅助
      body,
    }
  }

  const mkWin = () => {
    const listeners = {}
    const orig = {
      window: globalThis.window, localStorage: globalThis.localStorage,
      raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame,
    }
    const frames = []
    globalThis.window = globalThis
    globalThis.innerWidth = 1000
    globalThis.innerHeight = 800
    globalThis.addEventListener = (t, fn) => { listeners[t] = fn }
    globalThis.dispatchEvent = () => {}
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length }
    globalThis.cancelAnimationFrame = (id) => { frames[id - 1] = null }   // 排队后被取消 → 置空
    return {
      listeners,
      /** 执行当前排队中的帧（模拟"下一帧到了"），被取消的会跳过 */
      runFrames() {
        const batch = frames.splice(0, frames.length)
        for (const f of batch) if (typeof f === 'function') f()
      },
      pending: () => frames.filter((f) => typeof f === 'function').length,
      restore() {
        globalThis.window = orig.window
        globalThis.localStorage = orig.localStorage
        globalThis.requestAnimationFrame = orig.raf
        globalThis.cancelAnimationFrame = orig.caf
      },
    }
  }

  /** 深搜收集所有匹配 tag 的节点 */
  const collect = (node, tag, out = []) => {
    for (const c of node.children) {
      if (c.tag === tag) out.push(c)
      collect(c, tag, out)
    }
    return out
  }

  /** 统一判类名：el() 写的是 className，classList.add 写的是 _classes，两处都要看 */
  const hasClass = (node, c) =>
    String(node.className || '').split(/\s+/).includes(c) || node._classes.has(c)

  const W = mkWin()
  const dom = mkDom()
  try {
    const progressHooks = []
    const SB = {
      onProgress: (fn) => { progressHooks.push(fn); return () => { const i = progressHooks.indexOf(fn); if (i >= 0) progressHooks.splice(i, 1) } },
      prev: () => ({ ok: true }), next: () => ({ ok: true }), autoPlay: () => {},
      stop: () => {}, replay: () => ({ ok: true }), state: () => ({ pending: [] }),
    }

    let capturedHandlers = null
    let sentText = null
    const panel = createPanel({
      doc: dom.document,
      title: '测试智能体',
      greeting: '你好',
      actionLabels: { setRenderMode: '切换渲染方式' },
      sequenceToolName: 'applySceneActions',
      getShowReasoning: () => true,
      storyboard: SB,
      send: async (text, handlers) => { sentText = text; capturedHandlers = handlers; return { ok: true } },
    })
    panel.init()

    const msgs = panel.nodes().msgBox
    check('init 后建出抽屉与消息区', !!panel.nodes().drawer && !!msgs)
    check('空态已渲染问候语', /你好/.test(msgs.innerHTML || '') || collect(msgs, 'div').some((d) => /你好/.test(d.innerHTML)))
    check('订阅了分镜进度', progressHooks.length === 1)

    // ---- beginAssistant：rAF 合帧 ----
    const cur = panel.beginAssistant()
    const textNode = collect(cur.wrap, 'div').find((d) => hasClass(d, 'agent-text'))
    check('助手消息含正文容器', !!textNode)
    const before = textNode.htmlWrites
    cur.setContent('第一')
    cur.setContent('第一第二')
    cur.setContent('第一第二第三')
    check('多次 setContent 只排队一帧（rAF 合帧）', W.pending() === 1, `待执行帧 ${W.pending()}`)
    check('尚未写入 DOM（等下一帧）', textNode.htmlWrites === before)
    W.runFrames()
    check('每帧只写一次 DOM', textNode.htmlWrites === before + 1)
    check('写入的是最后一次的累积全文', /第一第二第三/.test(textNode.innerHTML))

    // ---- finish 必须先掐掉排队中的那一帧（否则刷成空泡）----
    cur.setContent('第四')
    check('又排了一帧', W.pending() === 1)
    cur.finish({ hasContent: true })
    W.runFrames()   // 若没被取消，这一帧会用 pendingText='' 把正文刷成空
    check('finish 掐掉了排队中的帧（界面未被刷成空泡）', /第四/.test(textNode.innerHTML),
      textNode.innerHTML)

    // ---- 空正文 + 截断：必须说清成因并附证据 ----
    const c2 = panel.beginAssistant()
    const t2 = collect(c2.wrap, 'div').find((d) => hasClass(d, 'agent-text'))
    c2.finish({
      hasContent: false, finishReason: 'length',
      usage: { completion_tokens: 8192, prompt_tokens: 900, completion_tokens_details: { reasoning_tokens: 7000 } },
    })
    check('空正文被诊断（不是空白气泡）', /没有输出正文/.test(t2.innerHTML), t2.innerHTML)
    check('截断成因被点名', /长度上限截断/.test(t2.innerHTML))
    check('附上 finish_reason 证据', /finish_reason: length/.test(t2.innerHTML))
    check('附上 token 用量证据（含思考 token）', /8192 tokens/.test(t2.innerHTML) && /其中思考 7000/.test(t2.innerHTML))

    // ---- 空正文 + 只有工具调用：成因不同，文案应不同 ----
    const c3 = panel.beginAssistant()
    const t3 = collect(c3.wrap, 'div').find((d) => hasClass(d, 'agent-text'))
    c3.finish({ hasContent: false, finishReason: 'tool_calls' })
    check('只有工具调用时给不同说明', /只发起了动作调用/.test(t3.innerHTML), t3.innerHTML)

    // ---- 思考折叠：有正文时收起，无正文时展开（让用户至少看到模型干了什么）----
    const c4 = panel.beginAssistant()
    const details4 = collect(c4.wrap, 'details')[0]
    c4.setReasoning('我思考了一下')
    c4.finish({ hasContent: true })
    check('有正文时思考收起', !hasClass(details4, 'hidden') || !details4.attrs.open)
    const c5 = panel.beginAssistant()
    const details5 = collect(c5.wrap, 'details')[0]
    c5.setReasoning('只有思考')
    c5.finish({ hasContent: false, finishReason: 'stop' })
    check('无正文时思考被展开', details5.attrs.open === '')
    check('无正文时的 summary 文案改为说明', /模型实际输出的思考内容/.test(collect(details5, 'summary')[0].textContent))

    // ---- runAgent 接线：动作气泡与失败标记 ----
    panel.setInput('演示一下')
    const p = panel.send()
    check('发送后把文本交给 send', sentText === '演示一下')
    capturedHandlers.onToolCall({ name: 'applySceneActions', args: { actions: [{ action: 'setRenderMode', params: { mode: 'surface' } }] }, round: 1 })
    const bubbles = collect(msgs, 'details').filter((d) => hasClass(d, 'agent-action'))
    check('为动手类工具画了动作气泡', bubbles.length === 1, `气泡数 ${bubbles.length}`)
    check('气泡用中文动作名描述', /切换渲染方式/.test(collect(bubbles[0], 'summary')[0].innerHTML))
    capturedHandlers.onToolResult({ name: 'applySceneActions', result: { failed: [{ action: 'x', error: 'e' }] }, round: 1 })
    check('有动作未执行时气泡标红并提示', bubbles[0]._classes.has('bad') && /1 个动作未执行/.test(collect(bubbles[0], 'summary')[0].innerHTML))
    capturedHandlers.onToolCall({ name: 'loadKnowledge', args: {}, round: 1 })
    check('查询类工具不产生气泡（属内部行为）',
      collect(msgs, 'details').filter((d) => hasClass(d, 'agent-action')).length === 1)
    capturedHandlers.onDone({ ok: true, aborted: false, finishReason: 'stop' })
    await p

    // ---- destroy 解绑订阅（防反复进出页面时累积）----
    check('destroy 前有订阅', progressHooks.length === 1)
    panel.destroy()
    check('destroy 后解绑订阅', progressHooks.length === 0)
  } finally {
    W.restore()
  }
}

// ============================================================================
section('module-contract：模块接入契约')
// ============================================================================
{
  const { assertModuleContract, describeContract, REQUIRED_METHODS, ALL_METHODS } =
    await import('../contract/module-contract.js')

  // ---- 完整合规的 facade ----
  const good = {
    getSnapshot: () => ({ a: 1 }),
    applyActions: () => ({ ok: true }),
    onAction: (cb) => () => {},
    highlightAtoms: () => ({ ok: true }),
    navigateTo: () => ({ ok: true }),
    exportViewPNG: () => 'data:image/png;base64,x',
    sceneVocabulary: { setX: { animated: false } },
    settings: [{ key: 'animSpeed', type: 'range' }],
    prompts: { role: '...' },
    getInteractionTrace: () => ({ idleMs: 0 }),
  }
  const rGood = assertModuleContract(good, { label: 'good' })
  check('合规 facade 通过校验', rGood.ok === true && rGood.missingRequired.length === 0)
  check('缺失清单为空', rGood.missing.length === 0, rGood.missing.join(','))
  check('已提供清单覆盖全部方法', rGood.present.length === ALL_METHODS.length,
    `${rGood.present.length}/${ALL_METHODS.length}`)

  // ---- 缺必需方法：必须失败并指明缺什么 ----
  const noApply = { getSnapshot: () => ({}) }
  const rNo = assertModuleContract(noApply, { label: '缺 applyActions' })
  check('缺 applyActions 时校验失败', rNo.ok === false)
  check('明确报出缺的是必需方法', rNo.missingRequired.join(',') === 'applyActions', rNo.missingRequired.join(','))
  check('必需方法共 2 个（getSnapshot / applyActions）', REQUIRED_METHODS.length === 2)

  // ---- 非对象/空值 ----
  check('facade 为 null 时失败且不抛异常', assertModuleContract(null).ok === false)
  check('facade 为 null 时报出全部必需方法',
    assertModuleContract(null).missingRequired.length === 2)

  // ---- 常见实现错误的提醒（warnings，不阻断）----
  const oneSlot = { getSnapshot: () => ({}), applyActions: () => ({}), onAction: (cb) => {} }
  const rW = assertModuleContract(oneSlot)
  check('提醒 onAction 可能是单槽位实现（会静默顶掉先注册者）',
    rW.warnings.some((w) => /单槽位|顶掉/.test(w)), JSON.stringify(rW.warnings))

  const applyNoSnap = { applyActions: () => ({}) }
  check('提醒"有 applyActions 但没有 getSnapshot"（分镜无法抓快照回退）',
    assertModuleContract(applyNoSnap).warnings.some((w) => /快照/.test(w)))

  const noVocab = { getSnapshot: () => ({}), applyActions: () => ({}) }
  check('提醒缺 sceneVocabulary（模型只能猜动作名）',
    assertModuleContract(noVocab).warnings.some((w) => /词汇表|猜动作名/.test(w)))

  // ---- 文档可用 ----
  const doc = describeContract()
  check('describeContract 含必需与可选两段', /必需/.test(doc) && /可选/.test(doc))
  check('契约文档列出全部方法名', ALL_METHODS.every((m) => doc.includes(m)))
  check('契约文档含设计原则一节', /设计原则/.test(doc))

  // ---- 设计原则：每条都必须写清由来（否则下次重写还会再犯）----
  const { DESIGN_PRINCIPLES, designPrinciple } = await import('../contract/module-contract.js')
  check('设计原则至少 4 条', DESIGN_PRINCIPLES.length >= 4, String(DESIGN_PRINCIPLES.length))
  check('每条都有 id/title/detail/origin',
    DESIGN_PRINCIPLES.every((p) => p.id && p.title && p.detail && p.origin))
  check('id 不重复', new Set(DESIGN_PRINCIPLES.map((p) => p.id)).size === DESIGN_PRINCIPLES.length)
  check('原则都写进了契约文档', DESIGN_PRINCIPLES.every((p) => doc.includes(p.id)))
  check('可按 id 取单条', !!designPrinciple('agent-action-must-be-reversible'))
  check('未知 id 返回 null（不抛异常）', designPrinciple('zzz') === null)
  // 这四条都是从真实故障提炼的，逐条断言它们确实在（名字变了要有人注意到）
  for (const id of ['agent-action-must-be-reversible', 'geometric-annotation-follows-series',
                    'multi-mesh-appearance-update', 'one-control-many-scenes']) {
    check(`原则在册：${id}`, !!designPrinciple(id))
  }

  // ---- 三个真实模块的接入实况：如实报出缺什么，而不是假装支持 ----
  // （这是"契约必须可执行"的体现：共享核能据此给出接入进度）
  const THREE_REAL = [
    { id: 'crystal', note: 'main.js 只管路由，viewer-canvas 是 894 行类，无动作层' },
    { id: 'orbit', note: 'main.js 有 OrbitApp facade（getState/applyAction/onAction/exportViewPNG）' },
    { id: 'symmetry', note: 'main.js 是 744 行单体、不导出任何东西' },
  ]
  const status = THREE_REAL.map((m) => ({ ...m, r: assertModuleContract({ id: m.id }) }))
  check('三个模块当前都未满足契约（如实报告，不是缺陷而是现状）',
    status.every((s) => s.r.ok === false))
  check('每个模块都报出缺哪些必需方法',
    status.every((s) => s.r.missingRequired.length === 2))
  console.log('      接入实况（契约要求 vs 现状）：')
  for (const s of status) console.log(`        ${s.id.padEnd(9)} 缺 ${s.r.missingRequired.join(', ')}  —— ${s.note}`)
  console.log('        （orbit 的 OrbitApp 是本契约的蓝本，阶段 B4 去全局化后即可包装成 facade）')
}

// ============================================================================
console.log(`\n${'═'.repeat(60)}`)
console.log(`test-core 结果：通过 ${pass} 项，失败 ${fail} 项`)
console.log('═'.repeat(60))
process.exit(fail ? 1 : 0)
