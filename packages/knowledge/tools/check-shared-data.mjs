/**
 * check-shared-data.mjs — 共享数据真源的一致性守卫
 *
 * 运行：node packages/knowledge/tools/check-shared-data.mjs
 *
 * 背景：改造前同一份数据在仓库里存在多份副本，且**没有任何守卫**——
 *   晶体数据三副本是这样（已随小程序移除而消解），元素表两份也是这样
 *   （crystal/H5 与 symmetry/H5，后者文件头自陈"整表移植自 crystal"）。
 *   没有守卫的副本迟早会漂移，而且漂移不会报错——只会让两处显示不同的数值。
 *
 * 本脚本在「真源」与「各模块的本地副本」之间做逐字段比对。它守的是**过渡期**：
 * 阶段 B6 建统一壳后，模块改为直接引用真源、副本删除，届时本脚本的对应条目
 * 也随之退役（会在这里显式报出"副本已不存在"，而不是静默跳过）。
 */
import { readdirSync, readFileSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'

const HERE = new URL('.', import.meta.url)
// packages/knowledge/tools/ → 仓库根需要三级
const repo = (p) => fileURLToPath(new URL('../../../' + p, HERE))
/** Windows 下绝不能写 new URL(绝对路径)：盘符会被当成协议（d:）而报错 */
const importAbs = (absPath) => import(pathToFileURL(absPath).href)

/**
 * 加载 orbit 的自注册脚本（IIFE 挂 window.*），拿回它注册的数组。
 * 用于与迁移后的 packages/ 版本做逐字比对。
 */
function loadOrbitGlobal(relPath, globalName) {
  const src = readFileSync(repo(relPath), 'utf-8')
  let captured = []
  const win = { [globalName]: { register: (list) => { captured = list } } }
  new Function('window', src)(win)   // eslint-disable-line no-new-func
  return captured
}

let pass = 0
let fail = 0
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`) }
  else { fail++; console.log(`  ✗ ${msg}${detail ? ' — ' + detail : ''}`) }
}

console.log('═'.repeat(70))
console.log('共享数据真源 · 一致性守卫')
console.log('═'.repeat(70))

// ============================================================================
// 元素表：packages/knowledge/shared/elements.js 为真源
// ============================================================================
console.log('\n【元素表】')

const shared = await import(new URL('../shared/elements.js', HERE).href)
const SOURCE = shared.ELEMENTS
console.log(`  真源元素数：${Object.keys(SOURCE).length}`)

/** 逐字段比对一份副本，返回差异列表 */
function compareElements(copy, label) {
  const diffs = []
  const ck = Object.keys(SOURCE)
  const lk = Object.keys(copy)
  for (const k of ck) if (!lk.includes(k)) diffs.push(`缺少元素 ${k}`)
  for (const k of lk) if (!ck.includes(k)) diffs.push(`多出元素 ${k}`)
  for (const k of ck) {
    const a = SOURCE[k]
    const b = copy[k]
    if (!b) continue
    for (const f of Object.keys(a)) {
      if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) {
        diffs.push(`${label}.${k}.${f}: 真源=${JSON.stringify(a[f])} 副本=${JSON.stringify(b[f])}`)
      }
    }
  }
  return diffs
}

const COPIES = [
  { label: 'crystal', path: 'projects/crystal/H5/src/data/elements.js', pick: (m) => m.default || m.elementsData },
  { label: 'symmetry', path: 'projects/symmetry/H5/src/data/elements.js', pick: (m) => m.ELEMENTS },
]

for (const c of COPIES) {
  let mod
  try {
    mod = await importAbs(repo(c.path))
  } catch (e) {
    // ★ 副本不存在时**显式报出**，而不是静默跳过：副本消失意味着阶段 B6 的
    //   物理去重已经做了，此时应回来把这条守卫退役
    ok(false, `${c.label} 的副本可加载`, `副本已不存在或不可加载（若已完成 B6 物理去重，请退役本条守卫）：${e.message}`)
    continue
  }
  const copy = c.pick(mod)
  ok(!!copy, `${c.label} 的副本可解析出元素表`)
  if (!copy) continue
  const diffs = compareElements(copy, c.label)
  ok(diffs.length === 0, `${c.label} 的副本与真源逐字段一致（${Object.keys(copy).length} 个元素）`,
    diffs.slice(0, 6).join('; ') + (diffs.length > 6 ? ` …共 ${diffs.length} 处` : ''))
}

// 辅助函数与 symmetry 原实现行为一致（真源沿用了它们的实现）
{
  const sym = await importAbs(repo('projects/symmetry/H5/src/data/elements.js'))
  const syms = Object.keys(SOURCE)
  let mismatch = 0
  for (const s of syms) {
    if (shared.getElementColor(s) !== sym.getElementColor(s)) mismatch++
    if (shared.getElementRadius(s) !== sym.getElementRadius(s)) mismatch++
    if (shared.getCovalentRadius(s) !== sym.getCovalentRadius(s)) mismatch++
  }
  ok(mismatch === 0, '三个取值辅助函数在全部元素上与 symmetry 原实现一致', `${mismatch} 处不符`)
  ok(shared.getElementColor('Zzz') === '#cccccc', '未命中元素时颜色回退为灰色（与 symmetry 一致）')
  ok(shared.getElementRadius('Zzz') === 0.7, '未命中元素时半径回退为 0.7（与 symmetry 一致）')
  ok(shared.getElement('C') && shared.getElement('C').name === '碳', 'getElement 可取到元素')
  ok(shared.getElement('Zzz') === null, 'getElement 未命中返回 null')
}

// ============================================================================
// 晶体数据：projects/crystal/H5/src/data/crystals/ 是唯一 JS 源
//        上游权威源在 modules/crystal/data/cod/
// ============================================================================
console.log('\n【晶体数据】')
{
  const dir = repo('projects/crystal/H5/src/data/crystals')
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'))
  ok(files.length === 23, `唯一 JS 源含 ${files.length} 个晶体（应为 23）`)

  const codDir = repo('modules/crystal/data/cod')
  const cifs = readdirSync(codDir).filter((f) => f.endsWith('.cif'))
  ok(cifs.length === 23, `上游 CIF 源含 ${cifs.length} 个文件（应为 23）`)

  // 每个 JS 都能解析出 id
  let bad = []
  for (const f of files) {
    const m = await importAbs(dir + '/' + f)
    const d = m.default || m
    if (!d || !d.id) bad.push(f)
  }
  ok(bad.length === 0, '每个晶体数据都能解析出 id', bad.join(','))
}

// ============================================================================
// orbit 知识条目与通用技能：packages/ 是迁移后的家，orbit/H5 仍有旧副本
// ============================================================================
console.log('\n【orbit 知识条目与通用技能】')
{
  const { ENTRIES, registerInto: regKnowledge } = await import(new URL('../orbit/index.js', HERE).href)
  const { SKILLS, registerInto: regSkills } = await import(new URL('../../skills/common/index.js', HERE).href)

  ok(ENTRIES.length === 34, `知识条目 ${ENTRIES.length} 条（应为 34）`)
  ok(SKILLS.length === 6, `通用技能 ${SKILLS.length} 个（应为 6）`)
  ok(ENTRIES.every((e) => String(e.id).startsWith('orbit:') && String(e.kp).startsWith('orbit:')),
    '全部条目的 id 与 kp 都带 orbit: 命名空间')
  ok(SKILLS.every((s) => !String(s.name).includes(':')), '技能不带命名空间（学科无关，全模块共用）')
  ok(ENTRIES.every((e) => (e.misconceptions || []).length > 0),
    '每条知识条目都有 misconceptions（错因诊断的来源）')

  // 与 orbit/H5 旧副本逐字段比对（忽略命名空间前缀）
  const orig = loadOrbitGlobal('projects/orbit/H5/knowledge/entries/index.js', 'Knowledge')
  const origS = loadOrbitGlobal('projects/orbit/H5/skills/index.js', 'Skills')
  ok(orig.length === ENTRIES.length, `orbit/H5 旧副本条目数一致（${orig.length}）`)

  const strip = (s) => String(s).replace(/^orbit:/, '')
  let diffs = []
  for (let i = 0; i < orig.length && i < ENTRIES.length; i++) {
    const o = orig[i]
    const n = ENTRIES[i]
    if (strip(n.id) !== o.id) diffs.push(`${o.id}: id 变了 → ${n.id}`)
    if (strip(n.kp) !== o.kp) diffs.push(`${o.id}: kp 变了 → ${n.kp}`)
    for (const f of ['title', 'source', 'body']) if (o[f] !== n[f]) diffs.push(`${o.id}.${f} 不一致`)
    for (const f of ['keywords', 'misconceptions']) {
      if (JSON.stringify(o[f] || []) !== JSON.stringify(n[f] || [])) diffs.push(`${o.id}.${f} 不一致`)
    }
  }
  ok(diffs.length === 0, '知识条目与旧副本逐字一致（除命名空间前缀）',
    diffs.slice(0, 4).join('; ') + (diffs.length > 4 ? ` …共 ${diffs.length} 处` : ''))

  let sdiffs = []
  for (let i = 0; i < origS.length && i < SKILLS.length; i++) {
    const o = origS[i]
    const n = SKILLS[i]
    for (const f of ['name', 'title', 'desc', 'when', 'exit']) if (o[f] !== n[f]) sdiffs.push(`${o.name}.${f}`)
    for (const f of ['steps', 'phrases', 'cautions']) {
      if (JSON.stringify(o[f] || []) !== JSON.stringify(n[f] || [])) sdiffs.push(`${o.name}.${f}`)
    }
  }
  ok(sdiffs.length === 0, '通用技能与旧副本逐字一致', sdiffs.join('; '))
}

// ============================================================================
// 与共享核心的集成：装进目录后 清单/正文 两段式必须成立
// ============================================================================
console.log('\n【与共享核心的集成】')
{
  const { createCatalog } = await import(new URL('../../agent-core/core/catalog.js', HERE).href)
  const { buildManifestText } = await import(new URL('../../agent-core/core/conversation.js', HERE).href)
  const { registerInto: regKnowledge } = await import(new URL('../orbit/index.js', HERE).href)
  const { registerInto: regSkills } = await import(new URL('../../skills/common/index.js', HERE).href)

  const kc = createCatalog({ key: 'id' })
  const sc = createCatalog({ key: 'name' })
  const nk = regKnowledge(kc)
  const ns = regSkills(sc)
  ok(nk === 34, `知识条目装入目录 ${nk} 条`)
  ok(ns === 6, `技能装入目录 ${ns} 个`)

  // 清单：带命名空间、剔除 body、保留关键词
  const idx = kc.index()
  ok(idx.length === 34 && idx.every((e) => !('body' in e)), '清单剔除 body（渐进式披露）')
  ok(idx[0].id.startsWith('orbit:'), '清单里的 id 带命名空间', idx[0].id)

  const manifest = buildManifestText({ knowledge: kc, skills: sc })
  ok(/【知识库清单】/.test(manifest) && /【教学技能清单】/.test(manifest), '清单文本含知识库与技能库两段')
  ok(!/主量子数 n = 1,2,3/.test(manifest), '清单文本**不含**正文（正文只在 load 时进入上下文）')

  // 按需取正文
  const first = kc.load(idx[0].id)
  ok(!!first && !!first.body && first.body.length > 30, 'load 能取到正文')
  ok(Array.isArray(first.misconceptions) && first.misconceptions.length > 0, 'load 带回 misconceptions')

  // 按知识点取同组条目：filterBy('kp', 'orbit:K3')
  const kp3 = kc.filterBy('kp', 'orbit:K3')
  ok(kp3.length > 0, `filterBy('kp','orbit:K3') 取到 ${kp3.length} 条`)

  // 命名空间缺失时必须拒绝装入（而不是悄悄放进去、与别的模块撞名）
  // ★ 直接测纯校验函数，而不是往被导入的数组里塞坏数据——
  //   后者会污染模块状态，测试之间互相影响。
  const { assertNamespaced } = await import(new URL('../orbit/index.js', HERE).href)
  let threw = false
  try { assertNamespaced([{ id: 'K9-9', kp: 'K9', title: '缺命名空间' }]) } catch (e) { threw = /命名空间/.test(e.message) }
  ok(threw, '缺少命名空间的条目会被拒绝装入（而不是悄悄放进去撞名）')
  ok(assertNamespaced([{ id: 'orbit:K1-1', kp: 'orbit:K1' }]) === true, '合规条目的校验通过')
}

// ============================================================================
// symmetry 知识资产：特征标表与点群映射（packages/knowledge/symmetry/ 是真源）
// ============================================================================
console.log('\n【symmetry 知识资产】')
{
  const S = await import(new URL('../symmetry/index.js', HERE).href)
  ok(S.groupCount() === 44, `特征标表收录 ${S.groupCount()} 个群（应为 44）`)
  ok(S.listGroups().length === 44 && S.listGroups()[0] <= S.listGroups()[43], 'listGroups 有序返回全部群号')

  // 与 symmetry/H5 的副本逐群逐表示比对（数据必须一致；头部注释差异不算）
  const copy = await importAbs(repo('projects/symmetry/H5/src/symmetry/characterTables.js'))
  const a = JSON.stringify(S.CHARACTER_TABLES)
  const b = JSON.stringify(copy.CHARACTER_TABLES)
  ok(a === b, '特征标表与 symmetry/H5 副本逐群逐表示一致',
    a === b ? '' : `真源 ${Object.keys(S.CHARACTER_TABLES).length} 群 / 副本 ${Object.keys(copy.CHARACTER_TABLES).length} 群`)

  const copyG = await importAbs(repo('projects/symmetry/H5/src/symmetry/groupTable.js'))
  ok(JSON.stringify(S.POINT_GROUP_NAMES) === JSON.stringify(copyG.POINT_GROUP_NAMES),
    '点群名称表与副本一致')
  ok(JSON.stringify(S.POINT_GROUP_SYSTEM) === JSON.stringify(copyG.POINT_GROUP_SYSTEM),
    '点群→晶系映射与副本一致')

  // 结构自洽：每个群都要有 classes 与 irreps，且每个不可约表示的字符数等于类数
  const badStruct = []
  for (const [sym, t] of Object.entries(S.CHARACTER_TABLES)) {
    if (!Array.isArray(t.classes) || !Array.isArray(t.irreps)) { badStruct.push(sym + ': 缺 classes/irreps'); continue }
    for (const ir of t.irreps) {
      if (!Array.isArray(ir.characters) || ir.characters.length !== t.classes.length) {
        badStruct.push(`${sym}.${ir.label}: 字符数 ${ir.characters && ir.characters.length} ≠ 类数 ${t.classes.length}`)
      }
    }
  }
  // ★ 这条自洽性检查很重要：特征标表的**每一行字符数必须等于共轭类数**（群论基本要求）。
  //   录入错一个数不会报错，只会让约化/选择定则算出错结果。
  ok(badStruct.length === 0, '每个群的不可约表示字符数与共轭类数一致（逐条校验）',
    badStruct.slice(0, 4).join('; ') + (badStruct.length > 4 ? ` …共 ${badStruct.length} 处` : ''))

  ok(S.lookupCharacterTable('C2v') !== null && S.lookupCharacterTable('C2v').irreps.length === 4,
    'lookupCharacterTable 可取到 C2v（4 个不可约表示）')
  ok(S.lookupCharacterTable('Zzz') === null, '未知群统一返回 null（原实现返回 undefined，此处收口）')
  ok(S.CHARACTER_TABLES.Oh && S.CHARACTER_TABLES.Oh.irreps.length === 10,
    'Oh 群有 10 个不可约表示（A1g…T2u，可核对的已知事实）')
}

// ============================================================================
console.log('\n' + '═'.repeat(70))
console.log(`守卫结果：通过 ${pass} 项，失败 ${fail} 项`)
console.log('═'.repeat(70))
process.exit(fail ? 1 : 0)
