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
console.log(`\n${'═'.repeat(60)}`)
console.log(`test-core 结果：通过 ${pass} 项，失败 ${fail} 项`)
console.log('═'.repeat(60))
process.exit(fail ? 1 : 0)
