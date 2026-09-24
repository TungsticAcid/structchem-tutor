/**
 * 原子轨道 / 稳定化子计算（由 H5 main.js selectAtom 的等价原子 + 稳定化子逻辑抽取）
 * 供单击原子时高亮并展示轨道成员与稳定化子子群。
 */
import { generateGroupOperations, orbit, stabilizer } from './symmetry/groupOperations.js'

/** 原子序号（该原子是第几个同元素原子，1-based），用于标注 O1/O2… */
function atomOrdinal(atoms, index) {
  let c = 0
  for (let i = 0; i <= index; i++) if (atoms[i].element === atoms[index].element) c++
  return c
}

/**
 * 计算某原子的等价原子（轨道）与稳定化子
 * @param {Object} structure - 分子结构
 * @param {Array} elements - 带专业命名的对称元素数组
 * @param {number} index - 选中的原子索引
 * @param {number} tol - 操作容差
 * @returns {{ orb: Array<number>, stabNames: Array<string>, stabIndexSet: Set<number> }}
 */
export function computeAtomOrbit(structure, elements, index, tol = 0.15) {
  const atoms = structure.atoms
  const ops = generateGroupOperations(atoms, elements, tol)
  const orb = orbit(atoms, ops, index, tol)
  const stab = stabilizer(atoms, ops, index, elements, tol)
  const lab = i => `${atoms[i].element}${atomOrdinal(atoms, i)}`
  return {
    orb,
    orbLabels: orb.map(lab),
    stabNames: stab.names,
    stabIndexSet: stab.indexSet
  }
}

export default { computeAtomOrbit }
