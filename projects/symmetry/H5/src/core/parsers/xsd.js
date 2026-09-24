/**
 * Materials Studio XSD 文件解析器
 * XSD 为 XML 格式，原子以 <Atom3d Name="..." XYZ="x,y,z" .../> 表示。
 * 支持分子（无晶胞）与晶体（含晶胞，best-effort 提取晶格向量）。
 */
import { createMolecule, createCrystal, normalizeElement } from '../structure.js'
import { cartesianToFractional } from '../lattice.js'

/**
 * 尽力提取晶格基矢（来自 <IdentityMapping>/<IdentityVector> 或 <SpaceGroup> 向量）
 * 若无法提取返回 null
 * @param {Document} doc
 * @returns {number[][]|null} 三个基矢 [A,B,C] 或 null
 */
function extractLatticeVectors(doc) {
  const all = doc.getElementsByTagName('*')
  const vectors = []
  for (const node of all) {
    const tag = node.tagName || ''
    if (!(tag === 'IdentityVector' || tag.endsWith(':IdentityVector'))) continue
    // 尝试从 XYZ 属性或 X/Y/Z 子节点读取分量
    const xyz = node.getAttribute('XYZ')
    if (xyz) {
      const parts = xyz.split(',').map(s => parseFloat(s.trim()))
      if (parts.length >= 3 && !parts.some(isNaN)) {
        vectors.push([parts[0], parts[1], parts[2]])
        continue
      }
    }
    const x = node.getAttribute('X'), y = node.getAttribute('Y'), z = node.getAttribute('Z')
    if (x != null && y != null && z != null) {
      const v = [parseFloat(x), parseFloat(y), parseFloat(z)]
      if (!v.some(isNaN)) vectors.push(v)
    }
  }
  return vectors.length >= 3 ? vectors.slice(0, 3) : null
}

/** 由基矢推导晶胞参数（与 poscar.js 相同约定） */
function latticeFromVectors(vecs) {
  const vlen = v => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
  const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const [A, B, C] = vecs
  const ang = (v1, v2) => Math.acos(Math.max(-1, Math.min(1, vdot(v1, v2) / (vlen(v1) * vlen(v2))))) * 180 / Math.PI
  return { a: vlen(A), b: vlen(B), c: vlen(C), alpha: ang(B, C), beta: ang(A, C), gamma: ang(A, B) }
}

/**
 * 解析 XSD 文本为分子或晶体结构
 * @param {string} text - XSD 文件内容
 * @returns {Object} 分子或晶体结构
 */
export function parseXSD(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('XSD 不是有效的 XML')
  }

  // 提取所有 <Atom3d>（兼容命名空间）
  const allNodes = doc.getElementsByTagName('*')
  const atomNodes = []
  for (const node of allNodes) {
    const tag = node.tagName || ''
    if (tag === 'Atom3d' || tag.endsWith(':Atom3d')) atomNodes.push(node)
  }

  if (atomNodes.length === 0) throw new Error('XSD 未找到 <Atom3d> 原子节点')

  const atoms = []
  for (const node of atomNodes) {
    const name = node.getAttribute('Name') || ''
    const xyzAttr = node.getAttribute('XYZ')
    if (!xyzAttr) continue
    const parts = xyzAttr.split(',').map(s => parseFloat(s.trim()))
    if (parts.length < 3 || parts.some(isNaN)) continue
    atoms.push({ element: normalizeElement(name), xyz: [parts[0], parts[1], parts[2]] })
  }
  if (atoms.length === 0) throw new Error('XSD 未解析到有效原子坐标')

  // 晶胞检测：若能提取晶格基矢，转为晶体（笛卡尔→分数坐标）
  const vecs = extractLatticeVectors(doc)
  if (vecs) {
    const lattice = latticeFromVectors(vecs)
    const crystalAtoms = atoms.map(a => ({ element: a.element, frac: cartesianToFractional({ x: a.xyz[0], y: a.xyz[1], z: a.xyz[2] }, lattice) }))
    return createCrystal({ lattice, atoms: crystalAtoms })
  }

  return createMolecule({ atoms })
}
