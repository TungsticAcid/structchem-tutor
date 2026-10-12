/**
 * test-symmetry-quiz.mjs —— 点群练习闭环（题库 + 流程）的守卫。
 *
 * ★ 这一片守的是**用户第 7 条**补出来的东西（点群练习套用轨道流程）：题库的每道题
 *   都必须"答案真的对"。而"对不对"不能问出题引擎自己（那就成了同源断言）——
 *   所以这里**独立重算**：拿题目里的 exampleId 回到 `identifyPointGroup` /
 *   `generateGroupOperations` / `getCharacterTable` 再算一遍，与答案下标所指的选项比对。
 *
 * ★ 本仓库在"同源断言骗过自己"上栽过（descriptor 与死副本互相印证、一直绿着却什么都没守），
 *   所以下面每一类题都写了**独立判据**，而不是断言"引擎说它对"。
 */
import { QuestionEngine as Q } from '../core/question-engine.js'
import { EXAMPLES } from '../data/examples-index.js'
import { identifyPointGroup } from '../engine/pointGroup.js'
import { generateGroupOperations } from '../engine/groupOperations.js'
import { getCharacterTable, CHARACTER_TABLES } from '../engine/characterTables.js'

let pass = 0
let fail = 0
const bad = []
function ok(cond, msg) {
  if (cond) { pass++ } else { fail++; bad.push(msg) }
}
const byId = new Map(EXAMPLES.map((e) => [e.id, e]))

// ---------------------------------------------------------------- ① 形状
console.log('【① 每个知识点都能出题，且题目形状合法】')
const KPS = ['P1', 'P2', 'P3', 'P4', 'P5']
const N = 120
const samples = {}
for (const kp of KPS) {
  let made = 0
  for (let i = 0; i < N; i++) {
    const q = Q.generate(kp)
    if (!q || q.error) continue
    made++
    if (!samples[kp]) samples[kp] = q
    if (q.options.length !== 4) { ok(false, `${kp} 选项数不是 4`); break }
    if (new Set(q.options.map(String)).size !== 4) { ok(false, `${kp} 选项有重复：${JSON.stringify(q.options)}`); break }
    if (!(q.answerIndex >= 0 && q.answerIndex < 4)) { ok(false, `${kp} answerIndex 越界`); break }
    if (!q.stem || !q.explanation) { ok(false, `${kp} 题干或讲评为空`); break }
    if (!q.cite) { ok(false, `${kp} 缺 cite（讲评要能回到知识条目）`); break }
  }
  ok(made >= N * 0.9, `${kp} 出题成功率过低：${made}/${N}`)
}

// ---------------------------------------------------------------- ② 独立重算：点群 / 群阶 / 元素数
console.log('【② P1/P2 的答案用引擎独立重算一遍】')
let checkedGroup = 0
let checkedOrder = 0
let checkedCount = 0
for (let i = 0; i < 400; i++) {
  const q = Q.generate('P2')
  if (!q || q.error) continue
  const ex = q.exampleId ? byId.get(q.exampleId) : null
  if (!ex) continue
  const r = identifyPointGroup(ex.structure)
  if (q.stem.indexOf('属于哪个点群') >= 0) {
    const ans = q.options[q.answerIndex]
    ok(ans === r.symbol, `点群题答案不符：${ex.id} 应为 ${r.symbol}，选项给的是 ${ans}`)
    checkedGroup++
  } else if (q.stem.indexOf('阶是多少') >= 0) {
    const order = generateGroupOperations(ex.structure.atoms, r.elements).length
    ok(String(q.options[q.answerIndex]) === String(order),
      `群阶题答案不符：${ex.id} 应为 ${order}，选项给的是 ${q.options[q.answerIndex]}`)
    // 无限群不得出阶题（阶是 ∞，代表元算出来的数是个假数字）
    ok(String(r.symbol).indexOf('∞') < 0, `无限群混进了"阶"的题目：${r.symbol}`)
    checkedOrder++
  }
}
for (let i = 0; i < 400; i++) {
  const q = Q.generate('P1')
  if (!q || q.error || !q.exampleId) continue
  const ex = byId.get(q.exampleId)
  if (!ex) continue
  const r = identifyPointGroup(ex.structure)
  if (q.stem.indexOf('几个对称元素') >= 0) {
    ok(String(q.options[q.answerIndex]) === String(r.elements.length),
      `元素数题答案不符：${ex.id} 应为 ${r.elements.length}，选项给的是 ${q.options[q.answerIndex]}`)
    ok(String(r.symbol).indexOf('∞') < 0, `无限群混进了"元素数"的题目：${r.symbol}`)
    checkedCount++
  }
  if (q.stem.indexOf('几重轴') >= 0) {
    const axes = r.elements.filter((e) => /^C\d+$/.test(e.type)).map((e) => Number(e.type.slice(1)))
    const n = axes.length ? Math.max.apply(null, axes) : null
    if (n != null) {
      const ans = String(q.options[q.answerIndex])
      ok(ans.indexOf(String(n)) >= 0, `主轴题答案不符：${ex.id} 最高 {n}=${n}，选项给的是 ${ans}`)
    }
  }
}
ok(checkedGroup > 20, `点群题抽查样本太少：${checkedGroup}`)
ok(checkedOrder > 20, `群阶题抽查样本太少：${checkedOrder}`)
ok(checkedCount > 20, `元素数题抽查样本太少：${checkedCount}`)

// ---------------------------------------------------------------- ③ 独立重算：特征标表（P3/P4）
console.log('【③ P3/P4 的答案回到特征标表核对】')
const symbols = Object.keys(CHARACTER_TABLES)
/** 从题干里认出点群符号（题干里必然出现一个表里的符号） */
function symbolIn(stem) {
  const hit = symbols.filter((s) => stem.indexOf(s) >= 0)
  hit.sort((a, b) => b.length - a.length)
  return hit[0] || null
}
let checkedIr = 0
let checkedRaman = 0
for (let i = 0; i < 400; i++) {
  const q = Q.generate('P4')
  if (!q || q.error) continue
  const sym = symbolIn(q.stem)
  if (!sym) continue
  const tb = getCharacterTable(sym)
  if (!tb) continue
  const ans = String(q.options[q.answerIndex])
  /**
   * ★ 判据顺序不能反：**互斥题的题干里也有"红外活性"四个字**
   *   （"它的红外活性与拉曼活性是什么关系？"），先判红外就会把互斥题当成红外题。
   *   所以按"题目**特有**的措辞"分流：互斥 → 红外 → 拉曼。
   */
  if (q.stem.indexOf('互斥') >= 0 && q.exampleId) {
    const ex = byId.get(q.exampleId)
    const r = identifyPointGroup(ex.structure)
    const hasI = r.elements.some((e) => e.type === 'i')
    const isMutex = ans.indexOf('互斥') === 0
    ok(hasI === isMutex, `互斥题答案与"有没有 i"矛盾：${ex.id} hasI=${hasI}，答案=${ans}`)
  } else if (q.stem.indexOf('哪个不可约表示是**红外活性**的') >= 0) {
    const row = tb.irreps.filter((r) => r.label === ans)[0]
    ok(!!row && String(row.linear || '').trim() !== '', `红外活性题答案 ${ans} 在 ${sym} 里线性栏其实为空`)
    checkedIr++
  } else if (q.stem.indexOf('哪个不可约表示是**拉曼活性**的') >= 0) {
    const row = tb.irreps.filter((r) => r.label === ans)[0]
    ok(!!row && String(row.quadratic || '').trim() !== '', `拉曼活性题答案 ${ans} 在 ${sym} 里二次项栏其实为空`)
    checkedRaman++
  }
}
ok(checkedIr > 20, `红外活性题抽查太少：${checkedIr}`)
ok(checkedRaman > 10, `拉曼活性题抽查太少：${checkedRaman}`)

let checkedChar = 0
for (let i = 0; i < 400; i++) {
  const q = Q.generate('P3')
  if (!q || q.error) continue
  const sym = symbolIn(q.stem)
  if (!sym) continue
  const tb = getCharacterTable(sym)
  // ★ 正则要从"中文标点之后"起捕：中文之间**没有空格**，用 \S+ 会把
  //   "的特征标表里，A1" 整段吞进去（第一版就是这么写错的）。
  const m = /，(\S+)\s*这一行在\s*(\S+)\s*这一列上的特征标/.exec(q.stem)
  if (!m) continue
  const ir = tb.irreps.filter((r) => r.label === m[1])[0]
  const ci = tb.classes.indexOf(m[2])
  if (!ir || ci < 0) { ok(false, `特征标题的"行/列"在表里找不到：${q.stem}`); continue }
  ok(String(ir.characters[ci]) === String(q.options[q.answerIndex]),
    `特征标题答案不符：${sym} ${m[1]}×${m[2]} 应为 ${ir.characters[ci]}，选项给的是 ${q.options[q.answerIndex]}`)
  checkedChar++
}
ok(checkedChar > 20, `特征标题抽查太少：${checkedChar}`)

// 不可约表示归属题：答案那一行的线性栏必须真的含题干里的轴向
let checkedLinear = 0
for (let i = 0; i < 400; i++) {
  const q = Q.generate('P3')
  if (!q || q.error || q.stem.indexOf('一次函数') < 0) continue
  const sym = symbolIn(q.stem)
  const axis = /\s(\w)\s方向的一次函数/.exec(q.stem)
  if (!sym || !axis) continue
  const tb = getCharacterTable(sym)
  const ans = String(q.options[q.answerIndex])
  const row = tb.irreps.filter((r) => r.label === ans)[0]
  ok(!!row && String(row.linear || '').split(/[,，\s]+/).indexOf(axis[1]) >= 0,
    `不可约表示归属题答案不符：${sym} 的 ${axis[1]} 不在 ${ans} 的线性栏里`)
  checkedLinear++
}
ok(checkedLinear > 20, `归属题抽查太少：${checkedLinear}`)

// ---------------------------------------------------------------- ④ P5 概念题的答案要对得上知识条目
console.log('【④ P5 三道概念题的答案与知识条目一致】')
const P5_EXPECT = {
  '晶体结构中比分子多出的那一类对称操作': '平移',
  '把一个空间群里的平移操作全部去掉': '点群',
  '空间群符号里的 2₁': '螺旋轴',
}
const p5seen = {}
for (let i = 0; i < 200; i++) {
  const q = Q.generate('P5')
  if (!q || q.error) continue
  for (const key of Object.keys(P5_EXPECT)) {
    if (q.stem.indexOf(key) >= 0) {
      p5seen[key] = true
      ok(String(q.options[q.answerIndex]).indexOf(P5_EXPECT[key]) >= 0,
        `P5 题「${key}」的答案应为含「${P5_EXPECT[key]}」，实际是「${q.options[q.answerIndex]}」`)
    }
  }
}
ok(Object.keys(p5seen).length === 3, `P5 三道题没都覆盖到：${Object.keys(p5seen).join(' / ')}`)

// ---------------------------------------------------------------- ⑤ 去重与错误路径
console.log('【⑤ 同一次练习里不重复出同一道；错误路径要如实】')
const a = Q.generate('P2')
const b = Q.generate('P2', null, [a.id])
ok(a.id !== b.id, '传入 exclude 后仍返回了同一道题')
ok(!!Q.generate('PX').error, '未知知识点要返回 error，而不是抛异常')
ok(!!Q.generate('P1').cite, '题目要带 cite')

// 判定路径：本地比较（不经过模型）
const q0 = Q.generate('P2')
const right = Q.answer(q0.id, q0.answerIndex)
ok(right && right.correct === true, 'answer() 判对失败')
const wrongIdx = (q0.answerIndex + 1) % 4
const wrong = Q.answer(q0.id, wrongIdx)
ok(wrong && wrong.correct === false, 'answer() 判错失败')
ok(!!Q.answer('q-does-not-exist', 0).error, '不存在的题号要返回 error')

console.log(`\n结果：通过 ${pass} 项，失败 ${fail} 项`)
if (fail) {
  bad.slice(0, 12).forEach((m) => console.log('  ✗ ' + m))
  process.exit(1)
}
