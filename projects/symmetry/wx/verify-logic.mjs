/**
 * 纯逻辑回归自测（Node 环境，无微信依赖）
 * 直接导入小程序移植后的纯模块（symmetry/、core、data/examples.js），
 * 对内置示例分子跑点群识别，断言结果与 H5 一致。
 * 运行：node wx/verify-logic.mjs
 */
import { identifyPointGroup } from './miniprogram/lib/symmetry/pointGroup.js'
import { EXAMPLES } from './miniprogram/data/examples.js'

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
  'meso-tartaric': 'Ci'
}

// id → 语义别名映射
const ID_ALIAS = {
  'meso-tartaric': 'meso-tartaric',
  h2o2: 'h2o2',
  'trans-dce': 'trans-dce'
}

let pass = 0
let fail = 0
for (const [alias, expected] of Object.entries(CASES)) {
  const id = ID_ALIAS[alias] || alias
  const ex = EXAMPLES.find(e => e.id === id)
  if (!ex) { console.log(`✗ ${alias}: 示例不存在`); fail++; continue }
  let got
  try {
    const result = identifyPointGroup(ex.structure)
    got = result.symbol
  } catch (e) {
    got = 'ERR:' + e.message
  }
  const ok = got === expected
  console.log(`${ok ? '✓' : '✗'} ${alias.padEnd(14)} 期望 ${expected.padEnd(6)} 实际 ${String(got).padEnd(6)}`)
  if (ok) pass++; else fail++
}

console.log(`\n通过 ${pass}/${pass + fail}`)
process.exit(fail > 0 ? 1 : 0)
