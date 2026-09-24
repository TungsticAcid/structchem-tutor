/**
 * XYZ 文件解析器
 * 格式：
 *   <原子数>
 *   <标题行>
 *   <元素> <x> <y> <z>
 *   ...
 * 坐标单位为埃（Å），仅取第一帧
 */
import { createMolecule, normalizeElement } from '../structure.js'

/**
 * 解析 XYZ 文本为分子结构
 * @param {string} text - XYZ 文件内容
 * @returns {Object} 分子结构
 */
export function parseXYZ(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim())
  // 跳过空行
  let idx = 0
  while (idx < lines.length && lines[idx] === '') idx++
  if (idx >= lines.length) throw new Error('XYZ 文件为空')

  const nAtoms = parseInt(lines[idx], 10)
  if (isNaN(nAtoms) || nAtoms <= 0) throw new Error('XYZ 首行应为正整数原子数')

  const title = (lines[idx + 1] || '').trim()
  idx += 2

  const atoms = []
  for (let i = 0; i < nAtoms && idx < lines.length; i++, idx++) {
    const line = lines[idx]
    if (line === '') { i--; continue }
    const parts = line.split(/\s+/)
    if (parts.length < 4) continue
    const x = parseFloat(parts[1])
    const y = parseFloat(parts[2])
    const z = parseFloat(parts[3])
    if (isNaN(x) || isNaN(y) || isNaN(z)) continue
    atoms.push({ element: normalizeElement(parts[0]), xyz: [x, y, z] })
  }

  if (atoms.length === 0) throw new Error('XYZ 未解析到有效原子')
  return createMolecule({ title, atoms })
}
