/**
 * test-crystal-quiz.mjs —— 晶体出题引擎的**防泄题守卫**。
 *
 * ★ 为什么需要这一片：出题引擎此前**没有任何测试**，而它承载着三条防线
 *   （`toModelView` 脱敏、`check` 的答案边界、`revealLayerSet` 练习守卫）。
 *   对照：对称模块有 test-symmetry-quiz.mjs、轨道有 test-orbit-engine.mjs；
 *   而对称那条断言的是"答案下标落在 [0,4)" —— 那是测它**有效**，不是测它**没发出去**。
 *
 * ★ 判据一律**独立重算**，不问被测代码"你对不对"：
 *   · 反演攻击脚本自己重写一份 LCG（**不 import** `shuffleWithSeed`，否则是同源断言）；
 *   · 并且**先做仪器自检** —— 先用合成数据证明这套脚本真能算出正确答案，
 *     再去断言它算不出真题的答案。（本仓库反复栽在"判据恒真/恒假"上。）
 *
 * ★ 每个阶段用**独立的引擎实例**：`bank` 与"已作答"状态是跨题共享的，共用一个实例时
 *   前一阶段留下的未作答题会持续贡献禁图层，把后一阶段的判据淹没（本文件第一版就踩了）。
 */
import { createQuizEngine } from '../quiz/index.js'
import { createTeachTools } from '../teach-tools.js'
import { CATALOG } from '../catalog.js'
import { getCrystalData } from '../../../projects/crystal/H5/src/lib/crystal-loader.js'
import { parseFormula } from '../../../packages/knowledge/shared/formula.js'
import * as crystalTools from '../tools.js'

let pass = 0
let fail = 0
const bad = []
function ok(cond, msg) {
  if (cond) { pass++ } else { fail++; bad.push(msg) }
}

// 与宿主（apps/web/src/main.js）同款的装配——**共用同一份 compute**，
// 不另写一份，否则测的就不是产品实际跑的那个引擎。
const compute = {
  cellVolume: crystalTools.cellVolume,
  atomCount: crystalTools.atomCount,
  computeDensity: crystalTools.computeDensity,
  nearestSameAtomDistance: crystalTools.nearestSameAtomDistance,
  parseFormula,
}
/** 造一个干净的引擎实例（每个阶段一个，避免跨阶段的 bank 状态互相干扰） */
const freshEngine = () => createQuizEngine({ loadData: getCrystalData, compute, catalog: CATALOG })

const FORBIDDEN = ['answerIndex', 'answerText', 'explanation', 'presetView', 'diagnosticHint', 'answerFrozen']
/** 回执里是否出现这些字段名（带引号精确匹配，避免 revealsAnswer 之类误伤） */
function leaks(obj) {
  const s = JSON.stringify(obj)
  return FORBIDDEN.filter((f) => s.indexOf('"' + f + '"') >= 0)
}
/** 从 presetView 里取出"揭示答案会打开哪些图层" */
function presetLayers(pv) {
  const out = []
  for (const a of ((pv && pv.actions) || [])) {
    if (a.action === 'setLayers') {
      for (const [k, v] of Object.entries(a.params.layers || {})) if (v) out.push(k)
    } else if (a.action === 'setLayer' && a.params.visible !== false) out.push(a.params.layer)
  }
  return out
}

// ---------------------------------------------------------------------------
console.log('【① 出题回执不含答案】—— 引擎层与工具层各测一遍')
{
  const quiz = freshEngine()
  const teach = createTeachTools({ quiz })
  let madeEngine = 0
  let madeTool = 0
  for (let i = 0; i < 240; i++) {
    const kp = 'crystal:C' + (1 + (i % 8))
    const r = quiz.generate({ kp })
    if (r && !r.error) {
      madeEngine++
      const hit = leaks(r)
      if (hit.length) ok(false, `引擎回执含答案字段 ${hit.join(',')}`)
    }
    // 工具层：模型真正拿到的那一份（tools.js 的 generateQuiz 会再包一层 instruction）
    const tr = teach.handlers.generateQuiz({ kp })
    if (tr && !tr.error) {
      madeTool++
      const hit = leaks(tr)
      if (hit.length) ok(false, `generateQuiz 工具回执含答案字段 ${hit.join(',')}`)
    }
  }
  ok(madeEngine > 120, `引擎出题成功率过低：${madeEngine}/240`)
  ok(madeTool > 120, `工具层出题成功率过低：${madeTool}/240`)
}

// ---------------------------------------------------------------------------
console.log('【② 从题目 id 反演答案】—— 先验证攻击脚本，再断言它算不出来')

/**
 * 独立重写一份与 templates.js 同款的 LCG 洗牌。
 * 返回"洗牌后各位置的原始下标"——正确答案洗牌前恒在 index 0，
 * 于是 `perm.indexOf(0)` 就是攻击者预测的 answerIndex。
 */
function lcgPerm(n, seed) {
  const arr = []
  for (let i = 0; i < n; i++) arr.push(i)
  let s = (seed >>> 0) || 1
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t
  }
  return arr
}
{
  // ---- 仪器自检：这套脚本对"我按同一规则手造的题"必须能算出正确答案 ----
  let selfOk = 0
  for (let seed = 1; seed <= 60; seed++) {
    const items = ['A', 'B', 'C', 'D']   // A = 正确答案，位于 index 0
    let s = (seed >>> 0) || 1
    for (let i = items.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0
      const j = s % (i + 1)
      const t = items[i]; items[i] = items[j]; items[j] = t
    }
    if (items.indexOf('A') === lcgPerm(4, seed).indexOf(0)) selfOk++
  }
  ok(selfOk === 60,
    `攻击脚本自检失败：60 次里只有 ${selfOk} 次算对 —— 判据本身不可信，后面的结论也不能用`)

  // ---- 主判据：拿 id 当种子去反演，命中率必须落到"瞎猜"的水平 ----
  const quiz = freshEngine()
  let attacked = 0
  let hit = 0
  for (let i = 0; i < 400; i++) {
    const kp = 'crystal:C' + (1 + (i % 8))
    const r = quiz.generate({ kp })
    if (!r || r.error) continue
    const m = /^q-(\d+)$/.exec(r.id)          // 只有数据题形如 q-N；qb-N / q-vN 不走这条
    if (!m) continue
    const full = quiz._bank.get(r.id)
    if (!full) continue
    attacked++
    if (lcgPerm(4, Number(m[1])).indexOf(0) === full.answerIndex) hit++
  }
  ok(attacked > 150, `样本太少：${attacked}`)
  // ★ 修复前 id 就是种子，命中率 100%；分开之后命中只可能来自"猜对"（约 25%）。
  //   判据取 50% —— 容得下抽样波动，又能在 id 变回种子时立刻报警。
  ok(attacked > 0 && hit / attacked < 0.5,
    `从 id 反演出了答案：${hit}/${attacked}（${(100 * hit / attacked).toFixed(1)}%）—— id 又变成洗牌种子了？`)
}

// ---------------------------------------------------------------------------
console.log('【③ check 的两条路径】—— 模型拿不到答案；判定即作答，守卫随之放行')
{
  const quiz = freshEngine()
  let tested = 0
  let modelLeak = 0
  let guardStuck = 0
  let repeatBlocked = 0
  for (let i = 0; i < 300 && tested < 30; i++) {
    const r = quiz.generate({ kp: 'crystal:C6' })   // C6 的 presetView 会揭示答案
    if (!r || r.error) continue
    const layers = presetLayers(quiz._bank.get(r.id).presetView)
    const model = quiz.check({ questionId: r.id, chosenIndex: 0 })   // 不传 by ⇒ 模型路径
    if (!model || model.error) continue
    tested++
    if (leaks(model).length) modelLeak++
    // ★ 判定即"学生作答"，守卫随之放行该题的图层。若判定完仍被禁，说明 `answered`
    //   没跟上 —— 学生答过了却打不开（本文件第一版正是这么写错的：只给学生路径置位）。
    const after = quiz.revealLayerSet()
    if (layers.length && layers.every((k) => after.has(k))) guardStuck++
    // 同一题再判一次必须被拒（`correct` 是可枚举信号，连调 4 次等于试出答案）
    const again = quiz.check({ questionId: r.id, chosenIndex: 1 })
    if (again && again.error) repeatBlocked++
  }
  ok(tested > 5, `C6 样本太少：${tested}`)
  ok(modelLeak === 0, `模型路径的 check 回执含答案字段：${modelLeak}/${tested}`)
  ok(guardStuck === 0, `判定后该题仍被禁图层：${guardStuck}/${tested}（answered 没跟上，学生答过也打不开）`)
  ok(repeatBlocked === tested, `模型路径可对同一题重复判定：${tested - repeatBlocked}/${tested} 没被拦住`)

  // ---- 学生路径：答案与解析必须**给全**（反馈卡要渲染），判定仍是纯下标比较 ----
  const rs = quiz.generate({ kp: 'crystal:C6' })
  if (rs && !rs.error) {
    const stu = quiz.check({ questionId: rs.id, chosenIndex: 0, by: 'student' })
    ok(!stu.error && stu.answerIndex >= 0 && typeof stu.answerText === 'string'
      && typeof stu.explanation === 'string' && stu.presetView !== undefined,
      '学生路径的 check 没有返回答案/解析/预设视图 —— 题目卡的反馈会渲染不出来')
    ok(stu.correct === (0 === quiz._bank.get(rs.id).answerIndex),
      '判定结果与下标比较不符 —— 判分路径被改动了？')
  } else {
    ok(false, 'C6 出不了题，③ 的学生路径没测到')
  }
}

// ---------------------------------------------------------------------------
console.log('【④ 纯邻近值题型的干扰项】—— 不允许存在固定的可反推倍比')
{
  const quiz = freshEngine()
  const patterns = new Set()
  let n7 = 0
  for (let i = 0; i < 400 && n7 < 60; i++) {
    const r = quiz.generate({ kp: 'crystal:C7' })
    if (!r || r.error) continue
    const full = quiz._bank.get(r.id)
    if (!full) continue
    const nums = full.options.map((o) => parseFloat(String(o.text)))
    if (nums.some((v) => !isFinite(v))) continue        // 非纯数值题（含错因干扰项）跳过
    const ans = nums[full.answerIndex]
    if (!(ans > 0)) continue
    n7++
    patterns.add(nums.filter((_, j) => j !== full.answerIndex)
      .map((v) => (v / ans).toFixed(2)).sort().join(','))
  }
  ok(n7 > 10, `C7 纯数值题样本太少：${n7}`)
  // ★ 修复前固定为 [0.5, 2, 0.75, 1.5]，四个选项的集合恒为 {v, 0.5v, 0.75v, 2v}：
  //   逐个假设"我是答案"，只有一个是使其余三个恰好等于它的 0.5/0.75/2 倍 —— 答案可反推。
  ok(!patterns.has('0.50,0.75,2.00'), '出现了原来那组固定倍比 0.5 / 0.75 / 2 —— 答案可被直接反推')
  ok(patterns.size >= 3, `干扰项倍比只有 ${patterns.size} 种模式 —— 仍是写死的`)
}

// ---------------------------------------------------------------------------
console.log(`\n通过 ${pass}；失败 ${fail}`)
if (bad.length) {
  console.log('失败项：')
  bad.slice(0, 20).forEach((m) => console.log('  ✗ ' + m))
}
process.exit(fail ? 1 : 0)
