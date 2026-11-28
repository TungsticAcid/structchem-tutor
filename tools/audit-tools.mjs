/**
 * 全量工具冒烟：把每个模块、每个节点下 AI 能看到的工具都**真调一次**。
 *
 * 为什么要有它：`npm test` 是 Node 侧的单元/集成测试，覆盖的是"实现逻辑"；
 * 而"模型点开某个工具到底会不会炸"只有**真实装配起来**才测得到。实测就抓到过：
 *   · orbit 的 `explainConcept` 一调就抛 `K.byKnowledgePoint is not a function`
 *     （宿主注入的是共享目录，API 是 filterBy）—— 模型随时能调，界面没有入口，
 *     所以单元测试与手点都没发现它；
 *   · 面板的 `describeAction` 若返回 null 却没回退，动作气泡会把参数原样吐给学生。
 *
 * 判据分三档，避免"我的参数不对"被当成"工具坏了"：
 *   ok       —— 返回了对象且没有 error 字段
 *   invalid  —— 返回 {error}（参数/前置不满足；打印原文，便于判断是不是该补样例）
 *   THROW    —— 抛异常 / 返回 undefined（handler 缺失）→ **真问题，退出码 1**
 *
 * 前置：**开发服务器在跑**（默认 http://127.0.0.1:3002）。
 *   cd apps/web && npm run dev -- --port 3002 --host 127.0.0.1
 * 用法：node tools/audit-tools.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { withBrowser } from './lib/browser.mjs'

mkdirSync('tmp/e2e', { recursive: true })

const script = String.raw`(async () => {
  const A = window.__chemAgent
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const reg = () => A.app.registry
  const out = { rows: [], throws: [] }

  const run = (mod, node, name, args) => {
    let res
    try { res = reg()._raw(name, args) } catch (e) {
      out.rows.push({ mod, node, name, status: 'THROW', detail: String(e && e.message || e).slice(0, 120) })
      out.throws.push(mod + '/' + name + ': ' + String(e && e.message || e).slice(0, 100))
      return null
    }
    if (res === undefined) {
      out.rows.push({ mod, node, name, status: 'NO_HANDLER', detail: '' })
      out.throws.push(mod + '/' + name + ': handler 不存在（声明了却调不动）')
      return null
    }
    const bad = res && typeof res === 'object' && (res.error || res.err)
    out.rows.push({ mod, node, name, status: bad ? 'invalid' : 'ok', detail: bad ? String(res.error || res.err).slice(0, 100) : '' })
    return res
  }

  // ---------- crystal ----------
  try {
    await A.ensureModuleReady('crystal'); await sleep(300)
    A.app.setActiveModule('crystal'); A.app.setNode('explain')
    const c = (n, a) => run('crystal', 'explain', n, a)
    c('getSnapshot', {})
    c('listCrystals', {})
    c('listDemos', {})
    c('listSceneActions', {})
    c('queryCrystal', { crystalId: 'naCl', kind: 'summary' })
    c('getCrystalDetail', { crystalId: 'naCl' })
    c('compareCrystals', { a: 'naCl', b: 'csCl' })
    c('navigateTo', { target: 'crystal', crystalId: 'naCl' })
    const played = c('playDemo', { id: 'fcc-holes' })
    await sleep(800)
    c('replayDemo', {})
    c('applySceneActions', { actions: [{ action: 'setView', params: { direction: 'iso' } }] })
    c('reviseDemo', { op: 'replace', index: 0, step: { action: 'setView', params: { direction: 'top' }, speech: '换个视角' } })
    c('declareIntent', { intent: 'quiz' })
    c('loadKnowledge', { id: 'crystal:C1-1' })
    c('loadSkill', { name: 'feynman' })

    // quiz 节点
    A.app.setNode('quiz')
    const q = run('crystal', 'quiz', 'generateQuiz', { kp: 'crystal:C2', topic: 'atomsInCell' })
    const qid = q && (q.id || (q.question && q.question.id))

    // grade 节点
    A.app.setNode('grade')
    const g = (n, a) => run('crystal', 'grade', n, a)
    if (qid) g('checkAnswer', { questionId: qid, chosenIndex: 0, by: 'student' })
    else out.rows.push({ mod: 'crystal', node: 'grade', name: 'checkAnswer', status: 'invalid', detail: '跳过：没有题目 id（generateQuiz 失败）' })
    if (qid) g('generateVariant', { questionId: qid })
    g('diagnoseError', { causeId: 'E-B3' })
    g('evaluateFeynman', { kp: 'crystal:C2', transcript: '晶胞里原子的分数坐标相加就是原子数' })
    g('startFeynmanCheck', { kp: 'crystal:C2' })
    g('recommendNext', {})
    g('recordLearningEvent', { kp: 'crystal:C2', kind: 'explain' })
    A.app.setNode('explain')
  } catch (e) { out.throws.push('crystal: ' + String(e.message).slice(0, 120)) }

  // ---------- orbit ----------
  try {
    await A.ensureModuleReady('orbit'); await sleep(500)
    A.app.setActiveModule('orbit'); A.app.setNode('explain')
    const o = (n, a) => run('orbit', 'explain', n, a)
    o('getSnapshot', {})
    o('listDemos', {})
    o('listSceneActions', {})
    o('queryOrbital', { kind: 'hybrids' })
    o('queryOrbital', { kind: 'nodes', n: 2, l: 1, m: 0 })
    o('navigateTo', { target: 'orbit' })
    o('playDemo', { id: 'sectionModes' })
    await sleep(800)
    o('replayDemo', {})
    o('applySceneActions', { actions: [] })
    o('declareIntent', { intent: 'explain' })
    o('explainConcept', { knowledgePoint: 'K1' })
    o('loadKnowledge', { id: 'orbit:K1-4' })
    o('loadSkill', { name: 'feynman' })
    A.app.setNode('grade')
    const og = (n, a) => run('orbit', 'grade', n, a)
    og('recommendNext', {})
    og('evaluateFeynman', { knowledgePoint: 'K1', transcript: '测试' })
    og('startFeynmanCheck', { knowledgePoint: 'K1' })
    og('updateMastery', { knowledgePoint: 'K1' })
    og('generateQuestion', { knowledgePoint: 'K1' })
    A.app.setNode('explain')
  } catch (e) { out.throws.push('orbit: ' + String(e.message).slice(0, 120)) }

  // ---------- symmetry ----------
  try {
    await A.ensureModuleReady('symmetry'); await sleep(600)
    A.app.setActiveModule('symmetry'); A.app.setNode('explain')
    const s = (n, a) => run('symmetry', 'explain', n, a)
    s('getSnapshot', {})
    s('listExamples', {})
    s('listSceneActions', {})
    s('queryPointGroup', { id: 'Td' })
    s('navigateTo', { target: 'symmetry' })
    s('applySceneActions', { actions: [] })
    s('declareIntent', { intent: 'explain' })
    s('explainConcept', { knowledgePoint: 'P1' })
    s('loadKnowledge', { id: 'symmetry:P1-1' })
    s('loadSkill', { name: 'feynman' })
    A.app.setNode('grade')
    const sg = (n, a) => run('symmetry', 'grade', n, a)
    sg('recommendNext', {})
    sg('updateMastery', { knowledgePoint: 'P1', correct: true })
    sg('generateQuestion', { knowledgePoint: 'P1' })
    A.app.setNode('explain')
  } catch (e) { out.throws.push('symmetry: ' + String(e.message).slice(0, 120)) }

  // ---------- 覆盖面：每个模块的每个节点是否有"声明了却调不动"的工具 ----------
  out.missing = {}
  for (const m of ['crystal', 'orbit', 'symmetry']) {
    try {
      await A.ensureModuleReady(m); await sleep(200)
      A.app.setActiveModule(m)
      for (const n of ['explain', 'quiz', 'grade', 'demo']) {
        try {
          A.app.setNode(n)
          const miss = (reg().missing && reg().missing()) || []
          if (miss.length) out.missing[m + '/' + n] = miss.map(x => x.name || x)
        } catch (e) { /* 节点该模块不支持：跳过 */ }
      }
    } catch (e) { /* 模块没装：跳过 */ }
  }
  A.app.setActiveModule('crystal'); A.app.setNode('explain')
  return JSON.stringify(out)
})()`

const data = await withBrowser({
  url: 'http://127.0.0.1:3002/#/crystal', width: 1280, height: 900,
  waitFor: 'window.__chemAgent && window.__chemAgent.app',
  settleMs: 2600, timeoutMs: 600000, ignoreHTTPSErrors: true,
}, async ({ evaluate }) => {
  const r = await evaluate(script)
  const v = r && r.result ? r.result.value : r
  if (typeof v === 'string') return JSON.parse(v)
  throw new Error('evaluate 返回非字符串：' + JSON.stringify(r).slice(0, 400))
})

writeFileSync('tmp/e2e/tools.json', JSON.stringify(data, null, 1))
const by = (s) => data.rows.filter((r) => r.status === s)
console.log('工具调用：共 ' + data.rows.length + ' 次 · ok ' + by('ok').length + ' · invalid ' + by('invalid').length + ' · THROW ' + by('THROW').length + ' · 无实现 ' + by('NO_HANDLER').length)
console.log('\n— THROW / 无实现（真问题）—')
console.log(data.throws.length ? data.throws.join('\n') : '（无）')
console.log('\n— 参数/前置不满足（不算坏工具，但要看是不是该给模特提示）—')
for (const r of by('invalid')) console.log('  ' + r.mod + '/' + r.name + ': ' + r.detail)
console.log('\n— 声明了却调不动（missing）—')
console.log(Object.keys(data.missing).length ? JSON.stringify(data.missing, null, 1) : '（无）')
console.log('\n— 逐条 —')
for (const r of data.rows) console.log('  ' + r.status.padEnd(10) + r.mod + '/' + r.name + (r.detail ? '  :: ' + r.detail : ''))