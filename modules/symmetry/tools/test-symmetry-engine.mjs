/**
 * test-symmetry-engine.mjs — symmetry 引擎的纯逻辑回归（Node，无需 DOM/浏览器）
 *
 * 跑什么：对内置示例库里的 19 个分子做点群识别，逐条比对预期符号。
 * 为什么重要：这是**搬运后正确性的唯一凭据**。引擎从
 *   `projects/symmetry/H5/src/{symmetry,core,data}/` 搬到 `modules/symmetry/`，
 *   相对路径改了、elements 的真源换了——只靠"文件复制成功"证明不了它还对。
 *
 * ★ 与旧测试（`projects/symmetry/H5/test/verify-logic.mjs`）的区别：
 *   它 import 的是**旧位置**。若照抄过来测的还是旧副本，那会变成**假绿**——
 *   测的不是搬过来的那份。所以本文件的 import 一律指向 `modules/symmetry/`。
 *
 * ★ 支持 `--break <case>` 注入一个错误（把该案例的预期值改掉），用来确认
 *   断言真的会红。本仓库的纪律：**凡有「通过」的检查，先看它红过一次再信任它**。
 *
 * 运行：
 *   node modules/symmetry/tools/test-symmetry-engine.mjs
 *   node modules/symmetry/tools/test-symmetry-engine.mjs --break water   # 演示它会红
 */
import { identifyPointGroup } from '../engine/pointGroup.js'
import { EXAMPLES } from '../data/examples-index.js'
// 渲染层的不变量断言（见文末"渲染材质不变量"一节）——这三个都能在 Node 里 import
import * as THREE from 'three'
import { buildSymmetryElements } from '../render/symmetry-draw.js'
import { buildAuxCube, buildAuxDihedral } from '../render/scene-builder.js'

/** 19 个分子案例：id → 期望的点群符号 */
const CASES = {
  methane: 'Td',
  benzene: 'D6h',
  ammonia: 'C3v',
  water: 'C2v',
  sf6: 'Oh',
  c60: 'Ih',
  ferrocene: 'D5d',
  corannulene: 'C5v',
  ch2brcl: 'Cs',
  chclfbr: 'C1',
  h2o2: 'C2',
  allene: 'D2d',
  ethane: 'D3d',
  co2: 'D∞h',
  hcn: 'C∞v',
  bf3: 'D3h',
  xef4: 'D4h',
  ethylene: 'D2h',
  'meso-tartaric': 'Ci',
}

// ---- 造红入口：把指定案例的期望值改成不可能的值 ----
const breakIdx = process.argv.indexOf('--break')
const breakCase = breakIdx >= 0 ? process.argv[breakIdx + 1] : null
if (breakCase) {
  if (!(breakCase in CASES)) {
    console.error(`--break 的案例名「${breakCase}」不在清单里（可用：${Object.keys(CASES).join(', ')}）`)
    process.exit(2)
  }
  CASES[breakCase] = '__故意写错的期望值__'
  console.log(`（造红模式：把 ${breakCase} 的期望值改成了不可能的值——本应看到它变红）\n`)
}

let pass = 0
let fail = 0
for (const [id, expected] of Object.entries(CASES)) {
  const ex = EXAMPLES.find((e) => e.id === id)
  if (!ex) { console.log(`✗ ${id.padEnd(16)} 示例不存在`); fail++; continue }
  let got
  try {
    got = identifyPointGroup(ex.structure).symbol
  } catch (e) {
    got = 'ERR:' + ((e && e.message) || e)
  }
  const ok = got === expected
  console.log(`${ok ? '✓' : '✗'} ${id.padEnd(16)} 期望 ${String(expected).padEnd(8)} 实际 ${String(got).padEnd(8)}`)
  if (ok) pass++; else fail++
}

// ---------------------------------------------------------------- 渲染材质不变量
// ★ 为什么要有这一节：three 的 WebGLRenderer 对「transparent + DoubleSide +
//   forceSinglePass=false」的材质会**编译并渲染两遍**（先 BackSide 再 FrontSide）。
//   于是写 0.18 的反映面实际呈现约 1−(1−0.18)² = 0.328 —— **比设计值深近一倍**，
//   多个面交叠就是那片"灰膜"；而它**不报错**，只是难看。
//   修法是把 forceSinglePass 显式置 true，**不是**把 opacity 调小（那会削掉教学表达：
//   对称面本身就是那一课的内容）。
{
  /** 本文件原先只有内联的 pass/fail，这里补一个带 detail 的助手（新增的分节要用） */
  const check = (label, cond, detail) => {
    console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? '  ← ' + detail : ''}`)
    if (cond) pass++; else fail++
  }

  // ★ 极小的 canvas 桩：**只为让 buildSymmetryElements 的标签精灵构造跑过去**
  //   （它无条件建标签，用 visible 控制显隐，所以躲不开）。本节的断言全部落在
  //   **材质参数**上，与这个桩无关——它不参与任何检查。
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '', font: '', textAlign: '', textBaseline: '', fillText() {},
        }),
      }),
    }
  }

  const mats = []
  const collect = (obj) => { obj.traverse((o) => { if (o.material) mats.push(o.material) }); return obj }

  // σ 反映面（symmetry-draw.js）—— 返回的是 { group, items }，取 group 来遍历
  collect(buildSymmetryElements([
    { type: 'C2', order: 2, axis: [0, 0, 1] },
    { type: 'sigma', order: 1, axis: [1, 0, 0] },
    { type: 'sigma', order: 1, axis: [0, 1, 0] },
  ], 3).group)
  // 立方体辅助几何的三角面、二面角矩形（scene-builder.js 的两条支路）
  const cubeAtoms = []
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) cubeAtoms.push({ xyz: [x * 2, y * 2, z * 2] })
  collect(buildAuxCube(2, { atoms: cubeAtoms }))
  collect(buildAuxDihedral(cubeAtoms, [0, 1, 2, 3]))

  // ★ 范围限定为**半透明**（opacity < 1）的双面片：opacity=1 的（如标签面）
  //   渲染两遍在视觉上无影响，不该被这条断言牵连——判据要精确，否则守卫会被当成噪声。
  const dbl = mats.filter((m) => m.transparent === true && m.side === THREE.DoubleSide && m.opacity < 1)
  // ★ 先确认"真的收集到了"，否则下面两条会在空集上平凡通过（假绿）
  check(`收集到 ${dbl.length} 个半透明双面材质（少于 3 个说明本节前提不成立）`, dbl.length >= 3,
    `全部材质 ${mats.length} 个；实际收集 ${dbl.length} 个`)

  const bad = dbl.filter((m) => m.forceSinglePass !== true)
  check('★ 每个半透明双面材质都显式 forceSinglePass（否则被渲染两遍，opacity 实际翻倍）',
    bad.length === 0, bad.length ? `${bad.length} 个没设：opacity=${bad.map((m) => m.opacity).join(',')}` : '')

  // ★ 防止后来的人"用调小 opacity 来让上面那条变绿"——那等于拿教学表达换观感
  const thin = dbl.filter((m) => m.opacity < 0.10)
  check('单遍化之后 opacity 仍保教学可读下限（不得靠调小 opacity 来减淡）',
    thin.length === 0, thin.map((m) => m.opacity).join(','))
}

console.log(`\n通过 ${pass}/${pass + fail}`)
if (breakCase && fail === 0) {
  // 造红模式下若无失败，说明断言本身失效了（这正是它要防的）
  console.error('⚠ 造红模式下竟然全过——说明这条断言没有真的在检查点群结果')
}
process.exit(fail > 0 ? 1 : 0)
