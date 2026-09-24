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
import { readdirSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'

const HERE = new URL('.', import.meta.url)
// packages/knowledge/tools/ → 仓库根需要三级
const repo = (p) => fileURLToPath(new URL('../../../' + p, HERE))
/** Windows 下绝不能写 new URL(绝对路径)：盘符会被当成协议（d:）而报错 */
const importAbs = (absPath) => import(pathToFileURL(absPath).href)

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
console.log('\n' + '═'.repeat(70))
console.log(`守卫结果：通过 ${pass} 项，失败 ${fail} 项`)
console.log('═'.repeat(70))
process.exit(fail ? 1 : 0)
