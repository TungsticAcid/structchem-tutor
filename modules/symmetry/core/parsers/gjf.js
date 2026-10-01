/**
 * Gaussian 输入文件（.gjf / .com）解析器
 * 格式示例：
 *   %chk=xxx.chk
 *   # hf/6-31g(d)
 *
 *   Title line
 *
 *   0 1
 *   C  0.000000  0.000000  0.000000
 *   H  1.000000  0.000000  0.000000
 *   ...
 *
 * 坐标默认单位为埃（Å）。Z-matrix 格式暂不支持。
 */
import { createMolecule, normalizeElement } from '../structure.js'

/**
 * 解析 GJF 文本为分子结构
 * @param {string} text - GJF 文件内容
 * @returns {Object} 分子结构
 */
export function parseGJF(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim())

  // 1. 跳过 % 与 # 开头的头部指令行
  let idx = 0
  while (idx < lines.length) {
    const l = lines[idx]
    if (l.startsWith('%') || l.startsWith('#') || l === '') { idx++; continue }
    break
  }

  // 2. 跳过标题行（第一个非空非指令行）
  if (idx < lines.length) idx++

  // 3. 定位「电荷 自旋多重度」行（两个独立数字）
  let coordStart = -1
  let title = ''
  for (let i = idx; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/).filter(Boolean)
    if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
      coordStart = i + 1
      break
    }
  }
  if (coordStart < 0) throw new Error('GJF 未找到「电荷 自旋多重度」行')

  // 4. 解析原子坐标块
  const atoms = []
  for (let i = coordStart; i < lines.length; i++) {
    const line = lines[i]
    if (line === '' || line.startsWith('!')) continue
    const parts = line.split(/\s+/).filter(Boolean)
    if (parts.length === 0) continue
    // 不足 4 段说明进入其它段（connectivity / 参数 / Z-matrix 变量），停止
    if (parts.length < 4) break
    const x = parseFloat(parts[1])
    const y = parseFloat(parts[2])
    const z = parseFloat(parts[3])
    if (isNaN(x) || isNaN(y) || isNaN(z)) break
    atoms.push({ element: normalizeElement(parts[0]), xyz: [x, y, z] })
  }

  if (atoms.length === 0) {
    throw new Error('GJF 未解析到原子坐标（Z-matrix 格式暂不支持）')
  }
  return createMolecule({ title, atoms })
}
