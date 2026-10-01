/**
 * CIF（Crystallographic Information File）解析器
 * 解析晶胞参数与原子坐标（分数坐标），供空间群识别与渲染
 */
import { createCrystal, normalizeElement } from '../structure.js'

/**
 * 解析 CIF 文本为晶体结构
 * @param {string} text - CIF 文件内容
 * @returns {Object} 晶体结构
 */
export function parseCIF(text) {
  // 按行处理（忽略首行可能的 data_ 块名）
  const lines = text.split(/\r?\n/)

  const lattice = { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 }
  let hasCell = false
  const atoms = []
  let title = ''

  // 辅助：读取单值键
  const cellKeys = {
    '_cell_length_a': 'a', '_cell_length_b': 'b', '_cell_length_c': 'c',
    '_cell_angle_alpha': 'alpha', '_cell_angle_beta': 'beta', '_cell_angle_gamma': 'gamma'
  }

  // 提取值（去括号不确定度如 5.64(2)）
  const extractNum = (s) => {
    const m = String(s).match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/)
    return m ? parseFloat(m[0]) : NaN
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    // 数据块名
    if (line.startsWith('data_')) {
      if (!title) title = line.slice(5)
      continue
    }
    // 化学式
    if (line.startsWith('_chemical_formula_sum') || line.startsWith('_chemical_formula_structural')) {
      const parts = line.split(/\s+/)
      if (parts.length >= 2 && !title) title = parts.slice(1).join(' ')
      continue
    }

    // 晶胞参数
    if (line.startsWith('_cell_')) {
      const parts = line.split(/\s+/)
      const key = parts[0]
      if (cellKeys[key] && parts.length >= 2) {
        const v = extractNum(parts[1])
        if (!isNaN(v)) {
          lattice[cellKeys[key]] = v
          hasCell = true
        }
      }
      continue
    }

    // 原子循环：loop_ 后跟 _atom_site_ 列
    if (line.startsWith('loop_')) {
      // 收集列名
      const colNames = []
      let j = i + 1
      while (j < lines.length && lines[j].trim().startsWith('_')) {
        colNames.push(lines[j].trim())
        j++
      }
      // 若为原子循环
      if (colNames.some(c => c.startsWith('_atom_site_'))) {
        const idxLabel = colNames.findIndex(c => c === '_atom_site_label' || c === '_atom_site_type_symbol')
        const idxSymbol = colNames.findIndex(c => c === '_atom_site_type_symbol')
        const idxFx = colNames.findIndex(c => c === '_atom_site_fract_x')
        const idxFy = colNames.findIndex(c => c === '_atom_site_fract_y')
        const idxFz = colNames.findIndex(c => c === '_atom_site_fract_z')

        // 若没有 fract 坐标但有 Cartn 坐标（暂不支持转换，报错提示）
        if (idxFx < 0 || idxFy < 0 || idxFz < 0) {
          if (colNames.some(c => c.includes('_Cartn_'))) {
            throw new Error('CIF 仅支持分数坐标（_atom_site_fract_*），不支持笛卡尔坐标')
          }
          i = j - 1
          continue
        }

        // 读数据行
        let k = j
        while (k < lines.length) {
          const dline = lines[k].trim()
          if (!dline || dline.startsWith('loop_') || dline.startsWith('_') || dline.startsWith('data_')) break
          const parts = dline.split(/\s+/).filter(Boolean)
          if (parts.length >= 4) {
            const sym = idxSymbol >= 0 ? parts[idxSymbol] : parts[idxLabel]
            const x = extractNum(parts[idxFx])
            const y = extractNum(parts[idxFy])
            const z = extractNum(parts[idxFz])
            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
              atoms.push({
                element: normalizeElement(sym),
                frac: [((x % 1) + 1) % 1, ((y % 1) + 1) % 1, ((z % 1) + 1) % 1]
              })
            }
          }
          k++
        }
        i = k - 1
        continue
      }
      i = j - 1
      continue
    }
  }

  if (!hasCell) throw new Error('CIF 未解析到晶胞参数')
  if (atoms.length === 0) throw new Error('CIF 未解析到原子坐标')
  return createCrystal({ title: title || '晶体', lattice, atoms })
}
