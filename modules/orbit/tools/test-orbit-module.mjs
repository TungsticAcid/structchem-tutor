/**
 * test-orbit-module.mjs —— orbit 模块层的回归守卫
 *
 * 与 `test-crystal-module.mjs` / `test-symmetry-module.mjs` 同级，守四件事：
 *   ① 契约合规（缺必需方法就红）
 *   ② 动作取值域：**非法参数必须被拒且说明原因**（模型据此能改对，而不是瞎试）
 *   ③ 工具定义与实现**同源**（defs 里的名字都有 handler，反之亦然）
 *   ④ 演示脚本的每一步都**可执行**（动作在词汇表里、参数过校验）
 *
 * ★ 第 ④ 条尤其值得有：演示脚本是**内容**，词汇表是**代码**，两者会各自演化。
 *   脚本里写了一个词汇表没有的动作时，症状是"点到那一步什么都不发生"——
 *   而这**不报错**。本仓库为此吃过亏（上游 `generateQuestion` 声明了没实现）。
 *
 * 用法：node modules/orbit/tools/test-orbit-module.mjs
 */
import { createModule } from '../index.js'
import { readFileSync } from 'node:fs'
import { createOrbitFacade } from '../facade.js'
import { DEMO_SCRIPTS, demoById, demoManifest } from '../demo/scripts.js'
import { VOCAB, validate, listActions } from '../actions.js'
import { assertModuleContract } from '../../../packages/module-contract/index.js'

let pass = 0
let fail = 0
const bad = []
function ok(cond, label, extra) {
  if (cond) { pass++; return }
  fail++
  bad.push(label + (extra ? '  ← ' + extra : ''))
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('orbit 模块层 · 回归守卫')
console.log('═══════════════════════════════════════════════════════════════')

// ---------------------------------------------------------------- ① 契约
console.log('【① 契约合规】')
{
  const f = createOrbitFacade()
  const snap = f.getSnapshot()
  const r = assertModuleContract(f, { snapshotFields: Object.keys(snap) })
  ok(r.ok, '模块提供全部必需方法', '缺：' + r.missingRequired.join(','))
  ok(r.warnings.length === 0, '无契约警告', r.warnings.join(' | '))
  ok(typeof f.canApplyActions() === 'boolean', 'canApplyActions 返回布尔（契约要求，不是对象）')

  // ★ 语义：没有运行时 = 受理不了。返回 true 会让模型下发一堆注定失败的动作。
  ok(f.canApplyActions() === false, '未附着运行时时 canApplyActions 为 false')

  // 附着后应变 true，且能读状态
  f.attach({ getState: () => ({ n: 3, l: 1, m: 0 }), applyAction: () => ({ ok: true }), onAction: () => () => {} })
  ok(f.canApplyActions() === true, '附着运行时后 canApplyActions 为 true')
  ok(f.getSnapshot().n === 3, '附着后快照能读到运行时的状态')
  ok(f.getSnapshot().attached === true, '快照带 attached 标记')

  // detach 后必须回到 false（页面卸载了还说自己能受理，动作就会打在空气上）
  f.detach()
  ok(f.canApplyActions() === false, 'detach 后 canApplyActions 回到 false')
  ok(f.getSnapshot().attached === false, 'detach 后快照标记为未附着')
}

// ---------------------------------------------------------------- ② 取值域
console.log('【② 动作取值域：非法参数被拒且说明原因】')
{
  // 合法值
  ok(!validate('setQuantumNumbers', { n: 3, l: 2, m: 0 }).err, '合法量子数通过')
  ok(!validate('setNuclearCharge', { Z: 6 }).err, '合法 Z 通过')
  ok(!validate('setViewTarget', { target: 'spherical' }).err, '合法视图目标通过')
  ok(!validate('focusChart', { target: 'section' }).err, '合法 focusChart 通过')
  ok(!validate('animateIsosurfaceLevel', { from: 0.08, to: 0.012 }).err, '合法阈值扫描通过')
  ok(!validate('setOrbitalModel', { model: 'slater' }).err, '合法轨道模型通过')
  ok(!validate('setOrbitalModel', { model: 'slater', zeta: 1.625 }).err, '带 ζ 的轨道模型通过')
  ok(!validate('setOrbitalModel', { model: 'hydrogenic', zeta: 20 }).err, 'ζ 取上界 20 通过（闭区间）')
  ok(!validate('setOrbitals', { set: 'sp3' }).err, '多轨道：sp³ 全开通过')
  ok(!validate('setOrbitals', { set: 'sp3', visible: [0] }).err, '多轨道：只留一个通过')
  ok(!validate('setOrbitals', { set: 'off' }).err, '多轨道：关闭通过')
  {
    // 去重 + 排序：同样的意图必须给出**同一个**标量串，否则快照每轮都在"变化"，
    // 痕迹里会凭空多出一堆噪声（感知层是按字段差分算切换次数的）。
    const v = validate('setOrbitals', { set: 'sp3', visible: [2, 0, 2] })
    ok(!v.err && JSON.stringify(v.params.visible) === '[0,2]',
      '多轨道：下标去重并排序（同样的意图 → 同样的参数）', JSON.stringify(v.params))
  }

  // 非法值：每一条都要**带上合法取值**，否则模型只能瞎试
  const cases = [
    ['setQuantumNumbers', { n: 9 }, 'n 超范围'],
    ['setQuantumNumbers', { l: 5, n: 3 }, 'l > n−1'],
    ['setQuantumNumbers', { m: 3, l: 1 }, '|m| > l'],
    ['setQuantumNumbers', {}, '一个量子数都没给'],
    ['setNuclearCharge', { Z: 99 }, 'Z 超范围'],
    ['setWavefunctionMode', { mode: 'xxx' }, '实/复轨道的非法取值'],
    ['focusChart', { target: 'xxx' }, 'focusChart 非法目标'],
    ['animateIsosurfaceLevel', { from: 9, to: 0.1 }, '扫描范围越界'],
    ['setSuperposition', { terms: [{ n: 3, l: 5, m: 0 }] }, '叠加态分量 l 越界'],
    ['setOrbitalModel', { model: 'sto' }, '轨道模型的非法取值（不是 sto，是 slater）'],
    ['setOrbitalModel', { model: 'slater', zeta: 0 }, 'ζ = 0（必须为正）'],
    ['setOrbitalModel', { model: 'slater', zeta: -1.625 }, 'ζ 为负'],
    ['setOrbitalModel', { model: 'slater', zeta: 21 }, 'ζ 超过上界 20'],
    ['setOrbitalModel', { model: 'slater', zeta: 'abc' }, 'ζ 不是数'],
    ['setOrbitals', { set: 'sp4' }, '多轨道：非法集合'],
    ['setOrbitals', { set: 'sp3', visible: [4] }, '多轨道：下标越界（sp³ 只有 0..3）'],
    ['setOrbitals', { set: 'sp2', visible: [3] }, '多轨道：sp² 只有 0..2'],
    ['setOrbitals', { set: 'sp3', visible: 'all' }, '多轨道：visible 不是数组'],
    ['setOrbitals', { set: 'sp3', visible: [] }, '多轨道：一个都不留（要全关请用 set:off）'],
    ['setOrbitals', { set: 'sp3', visible: [-1] }, '多轨道：负下标'],
    ['setOrbitals', { set: 'sp3', visible: [0.5] }, '多轨道：非整数下标'],
    ['不存在的动作', {}, '未知动作'],
  ]
  for (const [name, params, why] of cases) {
    const v = validate(name, params)
    ok(!!v.err, `拒绝：${why}`)
    ok(!!v.err && v.err.length > 8, `拒绝时说明了原因（${why}）`, (v.err || '').slice(0, 40))
  }

  // 拒绝时要指出合法值（抽查两条最典型的）
  const v1 = validate('setWavefunctionMode', { mode: 'xxx' })
  ok(/real|complex/.test(v1.err || ''), '枚举类拒绝时列出了合法取值')
  const v2 = validate('setQuantumNumbers', { n: 3, l: 5 })
  ok(/l ≤ n−1|3/.test(v2.err || ''), '关系类拒绝时说明了约束（l ≤ n−1）')
}

// ---------------------------------------------------------------- ③ 工具同源
console.log('【③ 工具定义与实现同源】')
{
  const stubQuiz = { generate() {}, variant() {}, explain() {}, askQuestion() {}, evaluateFeynman() {} }
  const m = createModule({
    quiz: stubQuiz,
    diagnosis: { diagnose() {} },
    mastery: { update() {}, recommend() {} },
    skills: { load() { return null } },
  })
  const defNames = Object.values(m.defs).flat().map((d) => d.function.name)
  const hanNames = Object.keys(m.handlers)
  ok(defNames.length > 0, `模块声明了 ${defNames.length} 个工具`)
  for (const n of defNames) ok(hanNames.indexOf(n) >= 0, `defs 里的 ${n} 有实现`)
  for (const n of hanNames) ok(defNames.indexOf(n) >= 0, `handlers 里的 ${n} 有声明（防幽灵实现）`)

  // ★ "有引擎才挂"：不注入时 teach 类必须**如实为空**，而不是给个调不动的名字
  const bare = createModule({})
  const bareNames = Object.values(bare.defs).flat().map((d) => d.function.name)
  ok(bareNames.indexOf('queryOrbital') >= 0, 'queryOrbital 不依赖注入，恒在')
  ok(bareNames.indexOf('generateQuestion') < 0, '未注入出题引擎时 generateQuestion **不存在**（如实为空）')
  ok(bareNames.indexOf('diagnoseError') < 0, '未注入诊断时 diagnoseError 不存在')
  ok(bareNames.indexOf('updateMastery') < 0, '未注入学情时 updateMastery 不存在')

  // ★ 同源断言只保证"名字对得上"，**不保证"调得动"**。
  //   对称性模块的 listExamples 就因为引用了一个从未定义的常量，
  //   每次调用都抛 ReferenceError 而长期无人发现（没有任何测试调用过它）。
  //   这里用空参数把每个工具都调一遍：允许返回 {error:…}（正常的取值域拒绝），
  //   只断言**不抛异常**。空参数最容易触发"未定义变量 / 访问了 undefined 的字段"。
  {
    const threw = []
    for (const [name, fn] of Object.entries(m.handlers)) {
      try { await fn({}) } catch (e) { threw.push(`${name}: ${e.message}`) }
    }
    ok(threw.length === 0, `★ ${Object.keys(m.handlers).length} 个工具用空参数调用都不抛异常`
      + '（允许返回 error 字段，不允许崩）', threw.join(' | '))
  }
}

// ---------------------------------------------------------------- ④ 演示可执行
console.log('【④ 演示脚本每一步都可执行】')
{
  const man = demoManifest()
  // ★ 段数改成"从 DEMO_SCRIPTS 数出来"而不是写死 4：
  //   写死时每加一段脚本都会让这条断言变红 —— 而它想守的其实是
  //   "manifest 与脚本表一致"，不是"永远只有四段"。
  //   改写成"两处数出来必须相同"，加脚本时它仍然是绿的，而对不上时照样会红。
  const scriptIds = Object.keys(DEMO_SCRIPTS)
  ok(man.length === scriptIds.length && man.length > 0,
    `manifest 与脚本表一致（${man.length} 段）`, `脚本表里有 ${scriptIds.length} 段`)
  ok(man.some((d) => d.id === 'sp3Tetrahedron'),
    '杂化那段演示在清单里（它曾整块缺失：原有四段一段都没用到杂化）')
  let totalSteps = 0
  const problems = []
  for (const id of Object.keys(DEMO_SCRIPTS)) {
    const d = demoById(id)
    ok(!!d && d.steps.length > 0, `演示 ${id} 有步骤`)
    ok(d.steps.every((s) => s.srcStep != null), `演示 ${id} 的步骤保留了原分组标记 srcStep`)
    for (const s of d.steps) {
      totalSteps++
      if (!(s.action in VOCAB)) { problems.push(`${id}→${s.action}（不在词汇表）`); continue }
      const v = validate(s.action, s.params)
      if (v.err) problems.push(`${id}→${s.action}：${v.err}`)
    }
    // 展平后每组的第一个动作必须带旁白（否则整段演示没有解说词）
    const withSpeech = d.steps.filter((s) => s.speech).length
    ok(withSpeech > 0, `演示 ${id} 有旁白（${withSpeech} 处）`)
  }
  ok(problems.length === 0, `全部 ${totalSteps} 步都可执行`, problems.slice(0, 5).join(' | '))

  // 词汇表本身自洽
  const acts = listActions()
  ok(acts.length === Object.keys(VOCAB).length, `词汇表 ${acts.length} 条，与 VOCAB 一致`)
  ok(acts.every((a) => a.label && a.group && a.desc), '每条都有 label / group / desc（后者是给模型看的）')
}

// ---------------------------------------------------------------- ⑤ 杂化轨道的事实由程序算
console.log('【⑤ queryOrbital(hybrids)：方向与夹角必须由系数反解，不许写死】')
{
  // 用与运行时**同一条**装配路径（createModule），而不是另起一个 tools 实例 ——
  // 后者会绕过模块对注入的裁决，测到的不是真正跑的那套。
  const t = { handlers: createModule({}).handlers }
  // ★ 这一节守的是 CLAUDE.md §一.2（数值一律程序算）：模型问"sp³ 的夹角多少"时，
  //   答案必须是从**当前系数**算出来的，而不是代码里写着一个 109.47。
  //   写死的话，谁改一条系数，模型嘴里还是那个老角度 —— 而且看起来完全正常。
  const EXPECT = { sp3: 109.471, sp2: 120, sp: 180 }
  const all = t.handlers.queryOrbital({ kind: 'hybrids' })
  ok(all && Array.isArray(all.hybrids) && all.hybrids.length === 3,
    'hybrids 查询返回三个集合', JSON.stringify(Object.keys(all || {})))
  for (const h of all.hybrids) {
    const want = EXPECT[h.set]
    let worst = 0
    for (const a of h.angles) worst = Math.max(worst, Math.abs(a.deg - want))
    ok(h.angles.length > 0 && worst < 0.01,
      `${h.label}：两两夹角 = ${want}°（由 direction 反解）`,
      `最大偏差 ${worst.toFixed(4)}°`)
    // 方向必须是单位矢量：反解写错（例如漏了归一化）时这条会红
    let worstNorm = 0
    for (const o of h.orbitals) {
      worstNorm = Math.max(worstNorm, Math.abs(Math.hypot(...o.direction) - 1))
    }
    ok(worstNorm < 1e-5, `${h.label}：每个方向都是单位矢量`, `最大偏差 ${worstNorm.toExponential(2)}`)
    // 杂化成分：sp³ = ¼s + ¾p，sp² = ⅓s + ⅔p，sp = ½s + ½p
    const sWant = { sp3: 0.25, sp2: 1 / 3, sp: 0.5 }[h.set]
    ok(Math.abs(h.orbitals[0].sCharacter - sWant) < 1e-6,
      `${h.label}：s 成分 = ${sWant.toFixed(4)}`, String(h.orbitals[0].sCharacter))
  }
  ok(!!t.handlers.queryOrbital({ kind: 'hybrids', set: 'sp4' }).error,
    '未知集合被拒且列出可用值')
}

// ---------------------------------------------------------------- 汇总
console.log('【⑥ 多轨道同屏：任意轨道 / 任意数量 / 逐轨道配色】')
{
  /**
   * 这一节守的是 2026-10-01 用户第 4 条反馈："多轨道同屏功能不完善……
   * 应支持自定义任意类型轨道（包括纯态和叠加态）、任意数量轨道的同屏显示。
   * 同屏功能时可改变每个轨道颜色。"
   *
   * ★ 原先只有 `set: 'sp3'|'sp2'|'sp'` 三个预设，而"任意轨道"要的是
   *   ① 纯态与叠加态都能给、② 条数不限、③ 每条一个颜色且能改。
   *   这三件事各自都需要**取值域**：量子数要满足 l ≤ n−1、颜色要能解析、
   *   条数要有上限（每一条都要真跑一遍等值面流水线）。
   *   少了取值域，模型编一个 l=5 的轨道就会一路传到数学层，症状是画面空白 —— 不报错。
   */
  const a = (name, p) => !validate(name, p).err
  const r = (name, p) => validate(name, p).err || ''

  // ---- 纯态：任意 (n,l,m) ----
  ok(a('setOrbitals', { items: [{ n: 2, l: 1, m: 0 }] }), 'items：单个纯态通过')
  ok(a('setOrbitals', { items: [{ n: 5, l: 3, m: -2 }] }), 'items：高角量子数（l=3）通过')
  ok(a('setOrbitals', { items: [{ n: 2, l: 1, m: 0, color: '#e0a040' }] }), 'items：带十六进制颜色通过')
  ok(a('setOrbitals', { items: [{ n: 2, l: 1, m: 0, color: [0.1, 0.2, 0.3] }] }),
    'items：带 [r,g,b] 颜色通过')
  ok(a('setOrbitals', { items: [{ n: 2, l: 1, m: 0, label: '我的轨道' }] }), 'items：带自定义名字通过')

  // ---- 叠加态：terms 非空即以 terms 为准 ----
  ok(a('setOrbitals', { items: [{ terms: [{ n: 3, l: 2, m: 0, c: { re: 1, im: 0 } }] }] }),
    'items：叠加态（复数系数）通过')
  ok(a('setOrbitals', {
    items: [{ terms: [
      { n: 2, l: 0, m: 0, c: { re: 1, im: 0 } },
      { n: 2, l: 1, m: 1, c: { re: 1, im: 0 } },
    ] }],
  }), 'items：两项叠加通过')

  // ---- 任意数量 ----
  ok(a('setOrbitals', { items: [{ n: 1, l: 0, m: 0 }, { n: 2, l: 1, m: 0 }, { n: 3, l: 2, m: -2 }] }),
    'items：三条同时给通过（任意数量）')
  ok(!a('setOrbitals', { items: [] }), 'items：空数组被拒（给了 items 就是要挂东西）')
  ok(/最多 12 条/.test(r('setOrbitals', { items: new Array(13).fill({ n: 1, l: 0, m: 0 }) })),
    'items：超过上限被拒**且说明为什么**（每条都要跑一遍等值面）',
    r('setOrbitals', { items: new Array(13).fill({ n: 1, l: 0, m: 0 }) }))

  // ---- 量子数取值域（负向）----
  ok(/l 必须 ≤ n−1/.test(r('setOrbitals', { items: [{ n: 2, l: 2, m: 0 }] })),
    'items：l > n−1 被拒并说明', r('setOrbitals', { items: [{ n: 2, l: 2, m: 0 }] }))
  ok(/\|m\| 必须 ≤ l/.test(r('setOrbitals', { items: [{ n: 2, l: 1, m: 3 }] })),
    'items：|m| > l 被拒并说明', r('setOrbitals', { items: [{ n: 2, l: 1, m: 3 }] }))
  ok(!!r('setOrbitals', { items: [{ n: 0, l: 0, m: 0 }] }), 'items：n=0 被拒')
  ok(!!r('setOrbitals', { items: [{ n: 2.5, l: 0, m: 0 }] }), 'items：非整数 n 被拒')
  ok(!!r('setOrbitals', { items: [{ n: 2, l: 1, m: 0, color: 'red' }] }),
    'items：颜色写成 "red" 被拒（提示可改用 "#rrggbb" 或 [r,g,b]）')
  ok(!!r('setOrbitals', { items: [{ terms: [{ n: 2, l: 1, m: 0, c: { re: 'x', im: 0 } }] }] }),
    'items：叠加态系数不是数被拒')

  // ---- 「＋ 把当前轨道加进去」 ----
  ok(a('setOrbitals', { add: true }), 'add:true 通过（把当前正在编辑的轨道加进同屏）')
  ok(a('setOrbitals', { add: true, color: '#5b9bd5' }), 'add:true 可同时指定颜色')
  ok(!a('setOrbitals', { add: false }), 'add:false 被拒（要关就用 set:"off"）')

  // ---- 逐轨道改色/显隐（**不重建几何**那条路）----
  ok(a('setOrbitalStyle', { key: 'orb-2', color: '#ff0000' }), 'setOrbitalStyle 改色通过')
  ok(a('setOrbitalStyle', { key: '__main__', visible: false }), 'setOrbitalStyle 改主轨道显隐通过')
  ok(/至少要给一项/.test(r('setOrbitalStyle', { key: 'orb-2' })),
    'setOrbitalStyle 什么都没给时被拒并说明', r('setOrbitalStyle', { key: 'orb-2' }))
  ok(/需要一个 key/.test(r('setOrbitalStyle', { color: '#ff0000' })),
    'setOrbitalStyle 缺 key 被拒并说明', r('setOrbitalStyle', { color: '#ff0000' }))
  ok(!!r('setOrbitalStyle', { key: 'orb-2', color: 'not-a-color' }), 'setOrbitalStyle 颜色非法被拒')

  ok(a('clearOrbitals', {}), 'clearOrbitals 无参数通过')
  ok(!!r('clearOrbitals', { n: 1 }), 'clearOrbitals 带参数被拒（没有可传的参数）')

  // ---- 新快照字段必须同时进"空快照"与 perception.fieldLabels ----
  // ★ 少了前者：进出页面会在痕迹里凭空多出一次变化（facade 里那段注释警告过的形态，
  //   实测就是这么发生的 —— 我加了 orbitalItems 却忘了补 EMPTY_SNAPSHOT）。
  // ★ 少了后者：痕迹里那一行是个读不懂的原始字段名。
  {
    const f6 = createOrbitFacade()
    const empty = f6.getSnapshot()
    ok('orbitalItems' in empty, '空快照里有 orbitalItems（与实机快照同形）',
      Object.keys(empty).join(','))
    ok('orbitalBuilding' in empty, '空快照里有 orbitalBuilding')
    ok(!!f6.perception.fieldLabels.orbitalItems,
      'perception 给 orbitalItems 配了可读标签')
    ok(!!f6.perception.fieldLabels.orbitalBuilding,
      'perception 给 orbitalBuilding 配了可读标签')
  }

  // ---- 词汇表自洽：每个动作都给得出**具体**的取值域说明 ----
  // ★ 判据是"给空参数时不能回落到'这个模块不支持该动作'"——那说明它在 validate 里
  //   没有 case，模型下发它只会得到一句废话，而这是**静默**的（词汇表里有、校验里没有）。
  // ★ 原先判据写成 `/^未知动作/`，而实际文案是 `orbit 模块不支持动作：…` ——
  //   **这条断言恒真**（改前改后都恒真，等于没测）。现在同时认两种措辞。
  {
    const noCase = []
    for (const name of Object.keys(VOCAB)) {
      const e = r(name, {})
      if (/未知动作|不支持动作/.test(e)) noCase.push(name)
    }
    ok(noCase.length === 0, 'VOCAB 里每个动作在 validate 里都有 case（空参数不会回落到"不支持该动作"）',
      noCase.join(','))
  }
}

// ---------------------------------------------------------------------------
// 源码棘轮：自动旋转的角速度**只能有一个数**
//
// ★ 用户报「自动旋转没反应」，真因不是没转，而是 `init()` 里那句
//   `autoRotateSpeed: 0.0035` 把构造器的默认值（0.12 rad/s）**覆盖**成了
//   0.0035 rad/s = 0.2°/s ≈ 30 分钟一圈。两处各写一个数，改一处漏一处。
//   这条断言就是钉住"不许再出现第二处"——它是纯源码检查，不需要浏览器。
// ---------------------------------------------------------------------------
{
  const raw = readFileSync(new URL('../render/render3d.js', import.meta.url), 'utf8')
  // ★ 先**剥掉注释**再判：这段说明本身就写着"原先这里是 autoRotateSpeed: 0.0035"，
  //   不剥注释的话棘轮会被自己的说明文打红（实测第一版就是这么假红的）。
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
  ok(!/autoRotateSpeed:\s*[0-9]/.test(src),
    '调用点不得覆盖 autoRotateSpeed（默认值必须真的生效）')
  ok(/autoRotateSpeed \* dt/.test(src),
    '自动旋转按**时间**推进（弧度/秒），不按帧数')
  ok(/AUTO_AXIS/.test(src) && !/setFromAxisAngle\(AXIS_Y,\s*autoRotateSpeed/.test(src),
    '自动旋转绕倾斜轴（绕竖直轴对 3p_z / s / d_z² 这些轴对称轨道是看不见的）')
}

console.log('')
console.log('═══════════════════════════════════════════════════════════════')
if (fail === 0) {
  console.log(`test-orbit-module 结果：通过 ${pass} 项，失败 0 项`)
  console.log('═══════════════════════════════════════════════════════════════')
  process.exit(0)
} else {
  console.log(`test-orbit-module 结果：通过 ${pass} 项，失败 ${fail} 项`)
  for (const b of bad.slice(0, 25)) console.log('  ✗ ' + b)
  console.log('═══════════════════════════════════════════════════════════════')
  process.exit(1)
}
