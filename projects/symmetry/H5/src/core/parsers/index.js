/**
 * 文件解析统一入口
 * 按扩展名（优先）+ 内容嗅探（回退）自动探测格式并解析
 */
import { parseXYZ } from './xyz.js'
import { parseGJF } from './gjf.js'
import { parseXSD } from './xsd.js'
import { parseCIF } from './cif.js'
import { parsePOSCAR } from './poscar.js'

/** 扩展名 → 格式映射 */
const EXT_MAP = {
  xyz: 'xyz',
  gjf: 'gjf',
  com: 'gjf',
  xsd: 'xsd',
  cif: 'cif',
  vasp: 'poscar',
  poscar: 'poscar',
  contcar: 'poscar'
}

/** 支持的文件扩展名（用于 UI 文件选择器 accept 属性） */
export const SUPPORTED_EXTENSIONS = ['.xyz', '.gjf', '.com', '.xsd', '.cif', '.vasp', '.poscar']

/**
 * 解析结构文本（自动探测格式）
 * @param {string} text - 文件内容
 * @param {string} filename - 文件名（可选，用于扩展名探测）
 * @returns {Object} 分子或晶体结构
 */
export function parseStructure(text, filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  const format = EXT_MAP[ext] || detectFormat(text)

  switch (format) {
    case 'xyz': return parseXYZ(text)
    case 'gjf': return parseGJF(text)
    case 'xsd': return parseXSD(text)
    case 'cif': return parseCIF(text)
    case 'poscar': return parsePOSCAR(text)
    default: throw new Error('无法识别的文件格式')
  }
}

/**
 * 内容嗅探（无扩展名时的回退）
 * @param {string} text
 * @returns {string} 格式标识
 */
function detectFormat(text) {
  const t = text.trim()
  if (t.startsWith('<')) return 'xsd'
  if (t.startsWith('data_') || t.startsWith('_cell_') || t.slice(0, 200).includes('_cell_length_a')) return 'cif'
  const firstLine = t.split(/\r?\n/)[0].trim()
  if (/^\d+$/.test(firstLine)) return 'xyz'
  // 含 % 或 # 开头的头部 → 大概率 GJF
  if (t.startsWith('%') || t.startsWith('#')) return 'gjf'
  return 'poscar'
}
