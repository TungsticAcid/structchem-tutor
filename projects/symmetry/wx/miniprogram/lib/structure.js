/**
 * 统一结构模型
 * 抽象分子与晶体两种结构，供识别与渲染共用
 *
 * 分子结构：
 *   { kind: 'molecule', title: '甲烷', formula: 'CH4',
 *     atoms: [{ element: 'C', xyz: [x,y,z] }, ...],  // 笛卡尔坐标（Å）
 *     bonds: [[i,j], ...] }                          // 可选，原子索引对
 *
 * 晶体结构：
 *   { kind: 'crystal', title: 'NaCl', formula: 'NaCl',
 *     lattice: { a, b, c, alpha, beta, gamma },      // 晶胞参数（长度 Å，角度 °）
 *     atoms: [{ element: 'Na', frac: [x,y,z] }, ...],// 分数坐标
 *     cell: 'conventional' | 'primitive' }
 */

/**
 * 创建分子结构对象
 * @param {Object} opts - { title, formula, atoms, bonds }
 * @returns {Object} 分子结构
 */
export function createMolecule({ title = '分子', formula = '', atoms = [], bonds = null }) {
  return { kind: 'molecule', title, formula, atoms, bonds }
}

/**
 * 创建晶体结构对象
 * @param {Object} opts - { title, formula, lattice, atoms, cell }
 * @returns {Object} 晶体结构
 */
export function createCrystal({ title = '晶体', formula = '', lattice = null, atoms = [], cell = 'conventional' }) {
  return { kind: 'crystal', title, formula, lattice, atoms, cell }
}

/**
 * 获取结构的原子总数
 * @param {Object} structure - 分子或晶体结构
 * @returns {number}
 */
export function getAtomCount(structure) {
  return structure && structure.atoms ? structure.atoms.length : 0
}

/**
 * 获取结构中出现的所有元素（去重）
 * @param {Object} structure
 * @returns {string[]}
 */
export function getUniqueElements(structure) {
  const set = new Set()
  if (structure && structure.atoms) {
    for (const a of structure.atoms) set.add(a.element)
  }
  return Array.from(set)
}

/**
 * 规范化元素符号：首字母大写、其余小写，并去除数字后缀/括号
 * 例如 'C1'→'C'、'cl'→'Cl'、'CL'→'Cl'、'C(1)'→'C'
 * @param {string} sym - 原始符号
 * @returns {string} 规范元素符号
 */
export function normalizeElement(sym) {
  if (!sym) return ''
  const m = String(sym).trim().match(/[A-Za-z]+/)
  if (!m) return String(sym).trim()
  const letters = m[0]
  return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase()
}

/**
 * 根据元素列表推导化学式（按元素符号排序的简化式）
 * @param {Object} structure
 * @returns {string}
 */
export function deriveFormula(structure) {
  if (structure && structure.formula) return structure.formula
  const counts = {}
  if (structure && structure.atoms) {
    for (const a of structure.atoms) {
      counts[a.element] = (counts[a.element] || 0) + 1
    }
  }
  return Object.keys(counts).sort().map(el => counts[el] > 1 ? `${el}${counts[el]}` : el).join('')
}
