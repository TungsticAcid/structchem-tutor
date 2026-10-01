/**
 * 晶体空间群识别模块
 * 封装 @spglib/moyo-wasm（spglib 团队 moyo 的 WASM 绑定），
 * 纯前端判定空间群编号、Hermann-Mauguin 符号、晶系、点群与对称操作
 */
import init, { analyze_cell, space_group_type } from '@spglib/moyo-wasm'
import wasmUrl from '@spglib/moyo-wasm/moyo_wasm_bg.wasm?url'
import { ELEMENTS } from '../../packages/knowledge/shared/elements.js'
import { operationsToSymmetryElements } from './engine/operations.js'

export { operationsToSymmetryElements }

/** 初始化 Promise（单例，避免重复加载 WASM） */
let _initPromise = null
function ensureInit() {
  if (!_initPromise) _initPromise = init({ module_or_path: wasmUrl })
  return _initPromise
}

/**
 * 晶胞参数 → 行优先基矢（9 个分量）
 * 约定：a 沿 x，b 在 xy 平面，c 在三维空间（与 lattice.js 一致）
 * @param {Object} lattice - { a, b, c, alpha, beta, gamma }
 * @returns {number[]} 行优先基矢
 */
function latticeToBasis(lattice) {
  const { a, b, c, alpha, beta, gamma } = lattice
  const ar = alpha * Math.PI / 180
  const br = beta * Math.PI / 180
  const gr = gamma * Math.PI / 180
  const ca = Math.cos(ar), cb = Math.cos(br), cg = Math.cos(gr), sg = Math.sin(gr)
  const V = Math.sqrt(1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg)
  return [
    a, 0, 0,
    b * cg, b * sg, 0,
    c * cb, c * (ca - cb * cg) / sg, c * V / sg
  ]
}

/** 元素符号 → 原子序数 */
function elementToNumber(symbol) {
  const el = ELEMENTS[symbol]
  return el ? el.atomicNumber : 0
}

/**
 * 分析晶体空间群
 * @param {Object} crystal - 晶体结构（{ lattice, atoms: [{element, frac}] }）
 * @param {Object} options - { symprec }
 * @returns {Promise<Object>} 空间群识别结果
 */
export async function analyzeSpaceGroup(crystal, options = {}) {
  await ensureInit()
  const symprec = options.symprec ?? 0.01

  const cell = {
    lattice: { basis: latticeToBasis(crystal.lattice) },
    positions: crystal.atoms.map(a => a.frac),
    numbers: crystal.atoms.map(a => elementToNumber(a.element))
  }

  const dataset = analyze_cell(JSON.stringify(cell), symprec, 'Standard')

  // 空间群类型描述（晶系、几何晶体类=点群）
  let crystalSystem = ''
  let pointGroup = ''
  try {
    const t = space_group_type(dataset.number)
    crystalSystem = t.crystal_system
    pointGroup = t.geometric_crystal_class
  } catch (e) {
    // 忽略类型查询失败
  }

  return {
    number: dataset.number,
    hmSymbol: (dataset.hm_symbol || '').replace(/\s+/g, ''),
    hallNumber: dataset.hall_number,
    pearsonSymbol: dataset.pearson_symbol,
    crystalSystem,
    pointGroup,
    operations: dataset.operations || [],
    wyckoffs: dataset.wyckoffs || [],
    siteSymmetries: dataset.site_symmetry_symbols || []
  }
}
