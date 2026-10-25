/**
 * 晶面几何自检（纯计算，不需要 Three.js / DOM）
 * 运行：node packages/crystal-view/tools/test-plane-geometry.mjs
 */
import {
  resolvePlane,
  planeCellCrossSection,
  parsePlaneInput,
  cellBasis,
  PLANE_MODE_MILLER,
  PLANE_MODE_VECTOR,
} from '../lib/plane-geometry.js'

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`) }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
const norm = (a) => Math.sqrt(dot(a, a))

const cubic = { a: 5.62, b: 5.62, c: 5.62, alpha: 90, beta: 90, gamma: 90 }
// 石墨：a=b=2.46 Å，c=6.70 Å，γ=120°（六方）
const hex = { a: 2.46, b: 2.46, c: 6.70, alpha: 90, beta: 90, gamma: 120 }

console.log('\n【解析输入】')
{
  check('括号 + 空格写法', parsePlaneInput('(1 1 1)', PLANE_MODE_MILLER).values.join(',') === '1,1,1')
  check('逗号写法', parsePlaneInput('1, -1, 0', PLANE_MODE_MILLER).values.join(',') === '1,-1,0')
  check('Unicode 负号归一', parsePlaneInput('−1 1 0', PLANE_MODE_MILLER).values[0] === -1)
  check('向量允许两个分量（w 默认 0）',
    parsePlaneInput('1 2', PLANE_MODE_VECTOR).ok === true
    && parsePlaneInput('1 2', PLANE_MODE_VECTOR).values.join(',') === '1,2,0')
  check('米勒拒绝两个分量', parsePlaneInput('1 1', PLANE_MODE_MILLER).error === 'format')
  check('米勒拒绝小数', parsePlaneInput('1.5 1 1', PLANE_MODE_MILLER).error === 'nonInteger')
  check('拒绝非数字', parsePlaneInput('h k l', PLANE_MODE_MILLER).error === 'format')
  check('拒绝全零', parsePlaneInput('0 0 0', PLANE_MODE_MILLER).error === 'zero')
}

console.log('\n【立方晶系：米勒面法向与面间距】')
{
  const r100 = resolvePlane('(1 0 0)', PLANE_MODE_MILLER, cubic)
  check('(100) 可解析', r100.ok === true)
  check('(100) 法向平行 a 轴', r100.ok && near(Math.abs(r100.normal.x), 1) && near(r100.normal.y, 0) && near(r100.normal.z, 0))
  check('(100) d = a = 5.620 Å', r100.ok && near(r100.spacing, 5.62, 1e-6), r100.spacing)

  const r111 = resolvePlane('(1 1 1)', PLANE_MODE_MILLER, cubic)
  const d111 = 5.62 / Math.sqrt(3)
  check('(111) 法向为 [1,1,1]/√3',
    r111.ok && near(r111.normal.x, 1 / Math.sqrt(3)) && near(r111.normal.y, 1 / Math.sqrt(3)) && near(r111.normal.z, 1 / Math.sqrt(3)))
  check('(111) d = a/√3 = 3.2447 Å', r111.ok && near(r111.spacing, d111, 1e-6), r111.spacing)
  check('(111) 标签', r111.label === '(1 1 1)')

  const rNeg = resolvePlane('(-1 1 0)', PLANE_MODE_MILLER, cubic)
  check('负指数可用', rNeg.ok === true && rNeg.normal.x < 0 && rNeg.normal.y > 0)
}

console.log('\n【六方晶系：米勒不是直接向量】')
{
  const r = resolvePlane('(1 0 0)', PLANE_MODE_MILLER, hex)
  const { e1, e2 } = cellBasis(hex)
  const g = r.normal ? { x: r.normal.x / r.spacing, y: r.normal.y / r.spacing, z: r.normal.z / r.spacing } : null
  check('六方 (100) 可解析', r.ok === true)
  check('倒易矢量满足 g·a=1、g·b=0',
    g && near(dot(g, e1), 1, 1e-6) && near(dot(g, e2), 0, 1e-6),
    g ? `${dot(g, e1)}, ${dot(g, e2)}` : '')
  check('六方 (100) 法向不等于直接 a 方向',
    r.ok && !(near(r.normal.x, 1) && near(r.normal.y, 0) && near(r.normal.z, 0)))

  const v = resolvePlane('[1 0 0]', PLANE_MODE_VECTOR, hex)
  check('向量 [100] 法向平行 a 轴',
    v.ok && near(v.normal.x, 1) && near(v.normal.y, 0) && near(v.normal.z, 0))
  check('向量模式不显示面间距', v.spacing === null)
}

console.log('\n【晶胞截面】')
{
  const r100 = resolvePlane('(1 0 0)', PLANE_MODE_MILLER, cubic)
  const poly100 = planeCellCrossSection(r100.normal, cubic)
  check('(100) 截面是四边形', !!poly100 && poly100.length === 4, poly100 && poly100.length)
  check('(100) 截面所有点 x=0（过中心）',
    poly100 && poly100.every((p) => near(p.x, 0)))
  check('(100) 截面在晶胞内（|x|,|y|,|z| ≤ a/2）',
    poly100 && poly100.every((p) => Math.abs(p.x) <= 5.62 / 2 + 1e-6 && Math.abs(p.y) <= 5.62 / 2 + 1e-6 && Math.abs(p.z) <= 5.62 / 2 + 1e-6))

  const r111 = resolvePlane('(1 1 1)', PLANE_MODE_MILLER, cubic)
  const poly111 = planeCellCrossSection(r111.normal, cubic)
  check('(111) 截面是六边形', !!poly111 && poly111.length === 6, poly111 && poly111.length)
  check('(111) 截面所有点满足 n·p=0',
    poly111 && poly111.every((p) => near(dot(r111.normal, p), 0, 1e-6)))

  const vec = resolvePlane('[1 1 0]', PLANE_MODE_VECTOR, cubic)
  const polyVec = planeCellCrossSection(vec.normal, cubic)
  check('向量 [110] 截面也是四边形', !!polyVec && polyVec.length === 4, polyVec && polyVec.length)

  const hpoly = planeCellCrossSection(resolvePlane('(1 0 0)', PLANE_MODE_MILLER, hex).normal, hex)
  check('六方晶胞截面顶点数 ≥ 3', !!hpoly && hpoly.length >= 3)
  check('六方晶胞截面所有点满足 n·p=0',
    hpoly && hpoly.every((p) => near(dot(resolvePlane('(1 0 0)', PLANE_MODE_MILLER, hex).normal, p), 0, 1e-6)))
  check('六方晶胞截面无 NaN',
    hpoly && hpoly.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)))
}

console.log('\n【失败模式】')
{
  check('非法晶格返回错误而不是抛异常',
    resolvePlane('(1 1 1)', PLANE_MODE_MILLER, null).ok === false)
  check('零法向无截面', planeCellCrossSection({ x: 0, y: 0, z: 0 }, cubic) === null)
  check('空输入返回 format', resolvePlane('', PLANE_MODE_MILLER, cubic).error === 'format')
}

console.log(`\n结果：通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
