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
