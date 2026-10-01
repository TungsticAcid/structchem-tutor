/**
 * test-knowledge.mjs — 知识条目的守卫
 *
 * 运行：node packages/knowledge/tools/test-knowledge.mjs
 *
 * ★ 本文件**早就被两处注释提及、却从未存在**（2026-10-01 补写）：
 *     · modules/crystal/quiz/data/error-causes.js:23  「见 tools/test-knowledge.mjs 的双向互引断言」
 *     · packages/knowledge/crystal/entries/c1.js:19   「tools/test-knowledge.mjs 只断言"带前缀的 id 必须真实存在"」
 *   一句不存在的守卫，比没有守卫更糟：它让人以为这件事**已经有人管**，
 *   于是 44 条晶体条目里那些 `[E-Ax]` 错因标记从写下那天起就没人核对过。
 *
 * 它守的是**在运行时静默失效**的那几类：
 *
 *   ① `kp` 写错 → `catalog.filterBy('kp', kp)` **恒返回空**。
 *      症状：该知识点的题出不出来、学情挂不上，而**不报错**。
 *      晶体的 kp 带前缀（`crystal:C1`），orbit 的是裸值（`K1`）——两种都合法，
 *      所以判据不是"格式统一"，而是"kp 与 id 必须互相咬合"（见下面 ②）。
 *
 *   ② `id` 与 `kp` 对不上 → 同一种失效，但更隐蔽（条目在清单里看得见，
 *      按知识点取却取不到）。判据：`id` 必须包含 `kp`。
 *
 *   ③ `[E-xx]` 错因标记悬空（写错一个字母，或该模块**根本没有**错因库）→
 *      诊断拿不到可执行动作，表现为"学生答错了，智能体只会说'再想想'"。
 *
 *   ④ 错因条目自己的 `kps` 指向不存在的知识点 → 反向悬空，同样静默。
 *
 * 覆盖缺口的检查（如"某知识点没有任何错因"）**只报告、不判失败**——
 * 那是内容进度问题，不是缺陷；把进度当缺陷会让守卫被当成噪声而关掉。
 */
import { fileURLToPath, pathToFileURL } from 'url'

const HERE = new URL('.', import.meta.url)
// packages/knowledge/tools/ → 仓库根是**三级**（tools → knowledge → packages → 根）。
// ★ 这里容易写错成两级：写错时拿到的是 packages/ 下的路径，报错信息里会看到
//   "...\packages\modules\crystal\..." —— 一眼就能看出层级不对。
const repo = (p) => fileURLToPath(new URL('../../../' + p, HERE))
const importAbs = (absPath) => import(pathToFileURL(absPath).href)

let pass = 0
let fail = 0
const bad = []
function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); return }
  fail++
  bad.push(label + (detail ? '  ← ' + detail : ''))
  console.log(`  ✗ ${label}${detail ? '  ← ' + detail : ''}`)
}
function section(t) { console.log(`\n【${t}】`) }

console.log('═'.repeat(70))
console.log('知识条目 · 守卫')
console.log('═'.repeat(70))

// ============================================================================
// 模块清单：id 命名空间 · 条目模块 · 可选的错因库
// ============================================================================
const MODULES = [
  {
    ns: 'crystal',
    label: '晶体结构',
    entries: await import(new URL('../crystal/index.js', HERE).href),
    // 错因库（有它才能校验 [E-xx] 标记；没有就不许出现标记）
    errorCauses: await importAbs(repo('modules/crystal/quiz/data/error-causes.js')),
  },
  {
    ns: 'orbit',
    label: '原子轨道',
    entries: await import(new URL('../orbit/index.js', HERE).href),
    errorCauses: null,
  },
  {
    ns: 'symmetry',
    label: '分子对称性',
    entries: await import(new URL('../symmetry/index.js', HERE).href),
    errorCauses: null,
  },
]

const seenIds = new Map()   // 全局唯一性

for (const mod of MODULES) {
  section(`${mod.label}（${mod.ns}）`)

  const ENTRIES = mod.entries.ENTRIES
  // ★ 没有 ENTRIES 导出 = 这个模块的知识库还没建。**不静默跳过**：
  //   静默跳过正是"看起来通过了、其实什么也没查"的来源。
  if (!Array.isArray(ENTRIES)) {
    ok(false, `${mod.ns} 导出了 ENTRIES 数组`,
      '未导出 ENTRIES —— 该模块的知识条目尚未建成（这是进度问题，但守卫必须如实报出，不能跳过）')
    continue
  }
  ok(ENTRIES.length > 0, `${mod.ns} 有条目（${ENTRIES.length} 条）`, '0 条')

  // ---- 字段齐备 ----
  const FIELD_MIN = { body: 80 }   // body 少于 80 字符基本就是占位符
  const missingField = []
  for (const e of ENTRIES) {
    for (const f of ['id', 'kp', 'title', 'keywords', 'source', 'body', 'misconceptions']) {
      const v = e[f]
      const empty = v == null || (Array.isArray(v) && v.length === 0) || String(v).trim() === ''
      if (empty) missingField.push(`${e.id || '(无 id)'}.${f}`)
    }
    if (typeof e.body === 'string' && e.body.length < FIELD_MIN.body) {
      missingField.push(`${e.id}.body 过短（${e.body.length} < ${FIELD_MIN.body}）`)
    }
  }
  ok(missingField.length === 0, '每条都有 id/kp/title/keywords/source/body/misconceptions 且非空',
    missingField.slice(0, 5).join('; ') + (missingField.length > 5 ? ` …共 ${missingField.length} 处` : ''))

  // ---- ① id 带命名空间 ----
  const badNs = ENTRIES.filter((e) => !String(e.id).startsWith(mod.ns + ':'))
  ok(badNs.length === 0, `id 都带 ${mod.ns}: 命名空间（CLAUDE.md §一.3）`,
    badNs.slice(0, 3).map((e) => e.id).join(', '))

  // ---- ② kp ↔ id 咬合：id 必须包含 kp ----
  //   ★ 这条守的是 filterBy('kp', …) 恒空的那种静默失效。
  //     不要求两者格式统一（orbit 用裸 K1、crystal 用 crystal:C1，各有其消费方），
  //     只要求"按 id 找得到、按 kp 也找得到**同一条**"。
  const kpMismatch = ENTRIES.filter((e) => !String(e.id).includes(String(e.kp)))
  ok(kpMismatch.length === 0, 'id 与 kp 互相咬合（id 包含 kp）——kp 写错会让 filterBy 恒空且不报错',
    kpMismatch.slice(0, 3).map((e) => `${e.id} / kp=${e.kp}`).join('; '))

  // ---- 每条的知识点归属自洽：同一 kp 的条目数 ----
  const byKp = new Map()
  for (const e of ENTRIES) byKp.set(e.kp, (byKp.get(e.kp) || 0) + 1)
  ok([...byKp.values()].every((n) => n >= 2),
    `每个知识点至少 2 条（当前 ${byKp.size} 个知识点）`,
    [...byKp.entries()].filter(([, n]) => n < 2).map(([k]) => k).join(', '))

  // ---- ③ id 全局唯一 ----
  const dupHere = []
  for (const e of ENTRIES) {
    if (seenIds.has(e.id)) dupHere.push(`${e.id}（与 ${seenIds.get(e.id)} 重复）`)
    else seenIds.set(e.id, mod.ns)
  }
  ok(dupHere.length === 0, 'id 在本模块内不与其它模块重复', dupHere.slice(0, 3).join('; '))

  // ---- ④ [E-xx] 错因标记必须真实存在（这就是注释里承诺的那条）----
  const tags = new Map()   // tag → 引用它的条目 id（首个）
  const untagged = []
  for (const e of ENTRIES) {
    for (const m of e.misconceptions || []) {
      // 约定：错因标记必须在**开头**，形如 `[E-A5] 把 CsCl 型…`
      const t = String(m).match(/^\s*\[([^\]]+)\]/)
      if (!t) { untagged.push(e.id); continue }
      if (!tags.has(t[1])) tags.set(t[1], e.id)
    }
  }
  if (mod.errorCauses) {
    const defined = new Set(mod.errorCauses.allCauseIds())
    const dangling = [...tags.keys()].filter((t) => !defined.has(t))
    ok(dangling.length === 0,
      `${mod.ns} 的 [E-xx] 标记都存在于错因库（${tags.size} 个被引用 / 库中 ${defined.size} 个）`,
      '悬空：' + dangling.join(', ') + '（写错一个字母，诊断就拿不到可执行动作）')

    // ---- ⑤ 反向：错因的 kps 必须指向真实存在的知识点 ----
    const kpSet = new Set(byKp.keys())
    const badKps = []
    for (const c of mod.errorCauses.ERROR_CAUSES) {
      for (const k of c.kps || []) if (!kpSet.has(k)) badKps.push(`${c.id} → ${k}`)
    }
    ok(badKps.length === 0, `${mod.ns} 的错因都挂在真实存在的知识点上`,
      badKps.length ? badKps.join('; ') + `（现存 kp：${[...kpSet].sort().join(' ')}）` : '')

    // ---- 覆盖缺口：只报告 ----
    const refByKp = new Set()
    for (const c of mod.errorCauses.ERROR_CAUSES) for (const k of c.kps || []) refByKp.add(k)
    const gaps = [...kpSet].filter((k) => !refByKp.has(k)).sort()
    const orphanTags = [...defined].filter((t) => !tags.has(t))
    console.log(`      错因覆盖：${kpSet.size - gaps.length}/${kpSet.size} 个知识点有错因`
      + (gaps.length ? `；**无错因**的知识点：${gaps.join(' ')}` : ''))
    if (orphanTags.length) {
      console.log(`      （另有 ${orphanTags.length} 条错因未被任何 misconception 引用：${orphanTags.join(' ')}`
        + ' —— 它们仍可经 kps 被出题引擎取到，故不算悬空）')
    }
  } else {
    // ★ 该模块**没有错因库**，那它一个 [E-xx] 标记都不该有：
    //   出现标记就意味着"指向一个不存在的库"，而消费方会静默拿不到动作。
    ok(tags.size === 0,
      `${mod.ns} 没有错因库，故条目里不应出现 [E-xx] 标记`,
      tags.size ? `发现 ${tags.size} 个：${[...tags.keys()].join(', ')}（需先建该模块的错因库，或改用无前缀的纯讲解式写法）` : '')
  }
  console.log(`      条目数 ${ENTRIES.length}｜知识点 ${byKp.size} 个｜`
    + `带错因标记的误解 ${tags.size} 个，纯讲解式 ${untagged.length} 处`)
}

// ============================================================================
// 与共享核心的集成（与 check-shared-data.mjs 的分工：那份管**数据真源**，
// 这份管**条目**；两者都装一次目录，确认渐进式披露的两段式成立）
// ============================================================================
section('装入目录（渐进式披露：清单不带正文，正文按需取）')
{
  const { createCatalog } = await import(new URL('../../agent-core/core/catalog.js', HERE).href)
  for (const mod of MODULES) {
    if (!Array.isArray(mod.entries.ENTRIES) || !mod.entries.registerInto) continue
    const cat = createCatalog({ key: 'id' })
    const n = mod.entries.registerInto(cat)
    const idx = cat.index()
    ok(n === mod.entries.ENTRIES.length && idx.length === n,
      `${mod.ns} 的 ${n} 条都能装进目录`)
    ok(idx.every((e) => !('body' in e)),
      `${mod.ns} 的清单剔除 body（正文只在 load 时进上下文）`)
    const first = cat.load(idx[0].id)
    ok(!!first && !!first.body, `${mod.ns} 的 load 能取到正文`)
  }
}

// ============================================================================
console.log('\n' + '═'.repeat(70))
console.log(`test-knowledge 结果：通过 ${pass} 项，失败 ${fail} 项`)
if (fail) for (const b of bad) console.log('  ✗ ' + b)
console.log('═'.repeat(70))
process.exit(fail ? 1 : 0)
