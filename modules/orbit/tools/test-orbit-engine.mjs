/**
 * test-orbit-engine.mjs —— orbit 纯计算层的**对拍**测试
 *
 * ★ 为什么必须"对拍"而不是"自证"：本仓库最贵的一课是
 *   「断言要断言实现，不是名字」——self-test 与 descriptor 用同一批错名字互相印证，
 *   一直绿着却什么也没守住。所以这里不写"我认为 3d 应该有 2 个节面"这类**我的理解**，
 *   而是把**上游原文件**在 Node 里跑起来，与移植后的模块逐值比对。
 *   上游是对的（它是线上应用），移植若与它分叉就是移植错了。
 *
 * ★ 上游是全局脚本（`window.OM = (function(){…})()`），不是 ESM。
 *   故用 `vm` 造一个沙箱，把 `window` 指向沙箱自身，于是 `window.OM` 变成沙箱的全局 `OM`。
 *   这不是"模拟"——跑的是**同一份源码**。
 *
 * 用法：node modules/orbit/tools/test-orbit-engine.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')

/** 上游纯计算层的位置（可被 ORBIT_UPSTREAM 覆盖，便于换机器时指路） */
const UP = process.env.ORBIT_UPSTREAM || 'D:/xjl/program/orbit/H5'

/**
 * 上游的全局脚本要**装进同一个沙箱**——它们之间靠全局名互相引用
 * （`formula.js` 里有 4 处裸引用 `OM`，`observables.js` 也一样）。
 * 每个文件各起一个沙箱的话，第二个文件就看不见第一个挂上去的东西，
 * 表现为 `ReferenceError: OM is not defined`——而那不是移植的问题，是加载方式的问题。
 */
const sandbox = { console, Math, Date, JSON, Object, Array, Number, String, isFinite, parseFloat, parseInt }
sandbox.window = sandbox            // window.X = … ⇒ 沙箱全局 X
createContext(sandbox)

/** 在共用沙箱里执行一个上游全局脚本 */
function runScript(rel) {
  runInContext(readFileSync(resolve(UP, rel), 'utf8'), sandbox, { filename: rel })
  return sandbox
}

/**
 * ★ 上游 checkout 不在时**显式跳过**（而不是静默通过、也不是硬失败）。
 *
 *   为什么要显式：对拍需要 `D:/xjl/program/orbit/H5` 这个同级仓库，
 *   而它不是本仓库的一部分（换台机器就没有）。硬失败会让测试链在别人机器上红；
 *   静默通过则会得到"守卫一直绿着、其实什么也没比"——那正是本仓库记过最贵的教训。
 *   所以这里**打印一行醒目的跳过说明**，并让退出码保持 0。
 */
if (!existsSync(resolve(UP, 'js/math.js'))) {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('⚠ 跳过 orbit 计算层对拍：未找到上游 checkout')
  console.log(`   期望路径：${UP}`)
  console.log('   换机器时用环境变量指定：ORBIT_UPSTREAM=<path-to>/orbit/H5')
  console.log('   （这项对拍是**开发期**验证，依赖上游仓库；跳过后本层不再被守卫）')
  console.log('═══════════════════════════════════════════════════════════════')
  process.exit(0)
}

// ---- 上游：math 必须先加载（formula 依赖它挂上的 OM）----
runScript('js/math.js')
const upOM = sandbox.OM
sandbox.OM = upOM                   // 裸引用 `OM` 也要能解析
runScript('js/formula.js')
const upFormula = sandbox.Formula
runScript('js/agent/observables.js')
const upObs = sandbox.Observables

// ---- 移植版 ----
const { OM } = await import('../../orbit/core/math.js')
const { Formula } = await import('../../orbit/core/formula.js')
const { Observables } = await import('../../orbit/core/observables.js')

// ---------------------------------------------------------------------------
// 比对工具
// ---------------------------------------------------------------------------
let pass = 0
let fail = 0
const failures = []

const TOL = 1e-9

/** 深度数值比较（对象/数组递归；数字按相对容差；其余按严格相等） */
function same(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true
    if (!isFinite(a) || !isFinite(b)) return a === b
    return Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b))
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => same(x, b[i]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort()
    const kb = Object.keys(b).sort()
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false
    return ka.every((k) => same(a[k], b[k]))
  }
  return a === b
}

/**
 * 对拍一项：上游调一次、移植版调一次、比结果。
 * ★ 两边都用**同一份参数**、并且**同一段调用代码**（用 fn 名拼出来），
 *   避免"我在两边写了不同的调用"这种自己骗自己。
 */
function cmp(label, mod, upMod, fn, args) {
  let u
  let m
  let uErr = null
  let mErr = null
  try { u = upMod[fn](...args) } catch (e) { uErr = String(e && e.message) }
  try { m = mod[fn](...args) } catch (e) { mErr = String(e && e.message) }
  if (uErr || mErr) {
    if (uErr && mErr) { pass++; return }          // 两边都抛错 ⇒ 行为一致
    fail++; failures.push(`${label}: 抛错不一致（上游=${uErr || '正常'}，移植=${mErr || '正常'}）`)
    return
  }
  if (same(u, m)) { pass++; return }
  fail++
  failures.push(`${label}: 上游=${JSON.stringify(u)?.slice(0, 120)}  移植=${JSON.stringify(m)?.slice(0, 120)}`)
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('orbit 纯计算层 · 与上游对拍')
console.log('═══════════════════════════════════════════════════════════════')
console.log(`上游：${UP}`)
console.log(`移植：modules/orbit/core/`)
console.log('')

// ---------------------------------------------------------------------------
// 1. OM（波函数引擎）
// ---------------------------------------------------------------------------
console.log('【① 能级与简并度】')
for (const n of [1, 2, 3, 4, 5, 6]) {
  for (const Z of [1, 2, 3]) cmp(`energy(${n},${Z})`, OM, upOM, 'energy', [n, Z])
  cmp(`degeneracy(${n})`, OM, upOM, 'degeneracy', [n])
}

console.log('【② 径向与角度节点】')
for (let n = 1; n <= 5; n++) {
  for (let l = 0; l < n; l++) {
    cmp(`radialZeros(${n},${l})`, OM, upOM, 'radialZeros', [n, l])
    cmp(`nodes(${n},${l})`, OM, upOM, 'nodes', [n, l])
    for (const Z of [1, 2]) cmp(`shellPeakFractions(${n},${l},${Z})`, OM, upOM, 'shellPeakFractions', [n, l, Z])
    cmp(`radialPeaks(${n},${l})`, OM, upOM, 'radialPeaks', [n, l])
  }
}
for (const l of [0, 1, 2, 3]) {
  for (let m = 0; m <= l; m++) {
    for (const mode of ['real', 'complex']) {
      cmp(`angularNodes(${l},${m},${mode})`, OM, upOM, 'angularNodes', [l, m, mode])
    }
  }
}

console.log('【③ 等值面基准（isoLevelAbs）—— 取景/标尺/抽面/面板四处共用同一个出口】')
for (let n = 1; n <= 4; n++) {
  for (let l = 0; l < n; l++) {
    for (let m = 0; m <= l; m++) {
      for (const mode of ['real', 'complex']) {
        for (const fraction of [0.5, 0.9]) {
          cmp(`isoLevelAbs(${n},${l},${m},${mode},1,1,${fraction})`, OM, upOM, 'isoLevelAbs',
            [n, l, m, mode, 1, 1, fraction])
        }
      }
    }
  }
}

console.log('【④ 快速 ψ² 采样器（逐点比对）】')
for (const [n, l, m] of [[1, 0, 0], [2, 1, 0], [2, 1, 1], [3, 2, 0], [3, 2, 2], [4, 3, 1]]) {
  const uf = upOM.makePsiDensityFast(n, l, m, 'real', 30, 1)
  const mf = OM.makePsiDensityFast(n, l, m, 'real', 30, 1)
  const pts = [[0, 0, 0], [1, 0, 0], [0, 2, 0], [0, 0, 3], [1.5, 1.5, 1.5], [-2, -2, -2]]
  for (const p of pts) cmp(`psiFast(${n},${l},${m}) @ ${p}`, { f: mf }, { f: uf }, 'f', p)
}

console.log('【⑤ 形状描述与颈缩】')
for (let n = 1; n <= 4; n++) {
  for (let l = 0; l < n; l++) {
    for (let m = 0; m <= l; m++) {
      cmp(`shapeDescribe(${n},${l},${m})`, OM, upOM, 'shapeDescribe', [n, l, m])
    }
  }
}

console.log('【⑥ 叠加态（实轨道线性组合）】')
const combos = [
  { terms: [{ n: 2, l: 1, m: 0, c: 1 }, { n: 2, l: 1, m: 1, c: 1 }] },
  { terms: [{ n: 2, l: 0, m: 0, c: 1 }, { n: 3, l: 2, m: 0, c: -1 }] },
]
for (const [i, c] of combos.entries()) {
  cmp(`isStationary#${i}`, OM, upOM, 'isStationary', [c.terms])
  cmp(`superpositionExtent#${i}`, OM, upOM, 'superpositionExtent', [c.terms])
  cmp(`maxDensitySuperposition#${i}`, OM, upOM, 'maxDensitySuperposition', [c.terms, 1])
}

// ---------------------------------------------------------------------------
// 2. Formula（记号）
// ---------------------------------------------------------------------------
console.log('【⑦ 公式与记号】')
const FORMULA_STR = ['realOrbitalLabel', 'realOrbitalLabelPlain', 'orbitalLabel', 'subshellLabel']
for (const fn of FORMULA_STR) {
  if (typeof upFormula[fn] !== 'function') continue
  for (let n = 1; n <= 4; n++) {
    for (let l = 0; l < n; l++) {
      for (let m = 0; m <= l; m++) {
        cmp(`Formula.${fn}(${n},${l},${m})`, Formula, upFormula, fn, [n, l, m])
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Observables（可观测量）
// ---------------------------------------------------------------------------
console.log('【⑧ 可观测量】')
for (const fn of ['meanR', 'meanInvR', 'meanR2', 'deltaR', 'normCheck', 'angleToZ']) {
  if (typeof upObs[fn] !== 'function') continue
  for (const [n, l] of [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2]]) {
    for (const m of [0, Math.min(l, 1)]) {
      try { cmp(`Obs.${fn}(${n},${l},${m})`, Observables, upObs, fn, [n, l, m]) } catch (e) { /* 参数不符则跳过 */ }
    }
  }
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log('')
console.log('═══════════════════════════════════════════════════════════════')
if (fail === 0) {
  console.log(`对拍结果：通过 ${pass} 项，失败 0 项`)
  console.log('（每一项都是"上游算一遍、移植版算一遍、逐值相同"——不是自证）')
  console.log('═══════════════════════════════════════════════════════════════')
  process.exit(0)
} else {
  console.log(`对拍结果：通过 ${pass} 项，失败 ${fail} 项`)
  for (const f of failures.slice(0, 30)) console.log('  ✗ ' + f)
  console.log('═══════════════════════════════════════════════════════════════')
  process.exit(1)
}
