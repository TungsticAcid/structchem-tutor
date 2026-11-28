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
import { getCrystalData } from '../../../packages/crystal-view/lib/crystal-loader.js'
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
// ★★ 2026-11-27（实测：问「出一道空间利用率题」→ 出题引擎自校验失败，
//   报「选项数量应为 4 个，实际只给出 3 个」）：
//   真因是干扰项取自 SPACE_UTILIZATION_PCT 的其余条目，而 **A1 与 A3 都是 74.05%**
//   —— 撞上正确答案后被去重，只剩 3 个选项；A2 的干扰项里也有两个 74.05，同样只剩 3 个。
//   这条守卫按"每一种堆积方式"逐个出题：必须 4 个互不相同的选项、答案下标指向正确那个。
{
  const THEORY = { A1: 74.05, A2: 68.02, A3: 74.05, A4: 34.01 }
  const CASES = [['fcc', 'A1'], ['bcc', 'A2'], ['hcp', 'A3'], ['diamond', 'A4']]
  for (const [crystalId, stacking] of CASES) {
    const quiz = freshEngine()
    const q = quiz.generate({ kp: 'crystal:C3', topic: 'spaceUtilization', crystalId })
    ok(!!q && !q.error, `空间利用率题能出出来（${crystalId}/${stacking}）：${(q && q.error) || ''}`)
    if (q && !q.error) {
      // ★ `generate()` 返回的是**给模型看的**视图（不含答案，这是刻意的）：
      //   要看答案必须用 peek —— 它是纯读取，不伪造作答。
      const full = quiz.peek(q.id)
      const opts = full.options || []
      ok(opts.length === 4, `${crystalId}: 选项必须是 4 个（实际 ${opts.length}）`)
      ok(new Set(opts).size === opts.length, `${crystalId}: 选项不能有重复值（${opts.join(' / ')}）`)
      const ans = String(opts[full.answerIndex] || '')
      ok(ans.indexOf(String(THEORY[stacking])) === 0,
        `${crystalId}: 正确答案应是 ${THEORY[stacking]}%（实际 ${ans}）`)
    }
  }
}

// ---------------------------------------------------------------------------
// ★★ 2026-11-28（用户："C2 的原题是哪来的"）：
//   计数型题目（结构基元含几个原子 / 晶胞原子数 / 空隙数 / 对称轴类型数）
//   曾用**倍率**生成干扰项，于是出现 "0.6 个原子""0.8 个原子"这种荒谬选项；
//   C2 的"晶胞原子数"还会把错因库里的**概念文案**（`C（1 个原子）`）当选项。
//   守卫：计数题的 4 个选项必须是**互不相同的正整数**。
{
  const COUNT_CASES = [
    ['crystal:C2', 'structuralUnitAtoms'],
    ['crystal:C2', 'atomsInCell'],
    ['crystal:C5', 'intersticesInCell'],
    ['crystal:C5', 'intersticePerSphere'],
    ['crystal:C6', 'symmetryAxisTypes'],
  ]
  for (const [kp, topic] of COUNT_CASES) {
    let checked = 0
    let bad = null
    for (let i = 0; i < 12 && !bad; i++) {
      const quiz = freshEngine()
      const r = quiz.generate({ kp, topic })
      if (!r || r.error) { bad = '出题失败：' + ((r && r.error) || ''); break }
      const opts = r.options.map((o) => (typeof o === 'string' ? o : o.text))
      if (opts.length !== 4) { bad = '选项不是 4 个：' + opts.join('/'); break }
      if (new Set(opts).size !== opts.length) { bad = '选项重复：' + opts.join('/'); break }
      const nonInt = opts.filter((t) => !/^\d+$/.test(String(t).trim()))
      if (nonInt.length) { bad = '出现非整数选项：' + opts.join(' / '); break }
      // 答案也必须是正整数（peek 才拿得到）
      const full = quiz.peek(r.id)
      const ans = String(opts[full.answerIndex] || '')
      if (!/^\d+$/.test(ans) || Number(ans) <= 0) { bad = '答案不是正整数：' + ans; break }
      checked++
    }
    ok(!bad && checked >= 10, `${topic}：计数题选项必须是互不相同的正整数（${bad || 'checked ' + checked}）`)
  }
}

// ---------------------------------------------------------------------------
// 演示旁白不得出现**参数名**（用户 2026-12-02 看演示条："这里的 atoms、wireframe 等，
// 中文使用者不一定看得懂，并且这个像是参数名，可能不适合直接给用户看"）
// ---------------------------------------------------------------------------
/**
 * ★ 判据是"旁白里不许出现图层**键名**"，而不是"必须出现某个中文字"：
 *   前者是这条缺陷的定义（键名是给代码和模型用的），后者会把任何措辞改动判红。
 *   ★ 键名清单**从 LAYER_PROPS 现取**，不手抄：将来加图层时，新键名自动纳入检查。
 *   ★ 用 `\b` 词边界 + 大小写敏感：中文句子里的英文单词只可能是被误拼进去的键名，
 *     而 `atoms` 这种复数形式不会在正常中文里出现。
 */
{
  const { LAYER_PROPS, LAYER_LABELS } = await import('../actions.js')
  const { buildPresetView, buildQuestionView } = await import('../quiz/preset-view.js')
  const LAYER_IDS = Object.keys(LAYER_PROPS)
  const keyPattern = new RegExp('\\b(' + LAYER_IDS.join('|') + ')\\b')

  const samples = []
  for (const kp of ['crystal:C1', 'crystal:C2', 'crystal:C3', 'crystal:C4', 'crystal:C5', 'crystal:C6', 'crystal:C7', 'crystal:C8']) {
    for (const crystalId of ['fcc', 'naCl', 'diamond']) {
      samples.push([kp + '/' + crystalId, buildPresetView(kp, { crystalId })])
    }
  }
  samples.push(['题境视图', buildQuestionView('crystal:C2', { crystalId: 'fcc' })])

  const offenders = []
  let labelled = 0
  for (const [tag, pv] of samples) {
    for (const step of (pv.actions || [])) {
      const speech = String(step.speech || '')
      const hit = keyPattern.exec(speech)
      if (hit) offenders.push(`${tag} → "${speech}"（含键名 ${hit[1]}）`)
      if (step.action === 'setLayers') labelled++
    }
  }
  ok(labelled >= samples.length - 1,
    `样本里应当几乎每条预设都有一步 setLayers（实际 ${labelled}/${samples.length}）`)
  ok(offenders.length === 0,
    '★ 图层开关的旁白里出现参数键名（学生看不懂；应当过 LAYER_LABELS）：'
    + offenders.slice(0, 3).join(' | '))

  // 反面：中文标签本身必须真的进了句子（否则上面那条可以靠"删掉整段旁白"通过）
  const c2 = buildPresetView('crystal:C2', { crystalId: 'fcc' })
  const c2Speech = (c2.actions.find((a) => a.action === 'setLayers') || {}).speech || ''
  ok(c2Speech.includes(LAYER_LABELS.atoms) && c2Speech.includes(LAYER_LABELS.wireframe),
    `C2 的旁白应当用中文图层名（期望含「${LAYER_LABELS.atoms}」「${LAYER_LABELS.wireframe}」，实际 "${c2Speech}"）`)
  ok(/打开|关闭/.test(c2Speech), `旁白应当是"打开…/关闭…"的人话（实际 "${c2Speech}"）`)
}

// ---------------------------------------------------------------------------
console.log(`\n通过 ${pass}；失败 ${fail}`)
if (bad.length) {
  console.log('失败项：')
  bad.slice(0, 20).forEach((m) => console.log('  ✗ ' + m))
}
process.exit(fail ? 1 : 0)
