/**
 * formula.js — 化学式解析与摩尔质量计算
 *
 * ★ 为什么在共享层：它是**学科通用的纯函数**，且已经被两处需要：
 *   · 晶体数据自检脚本（校验 coordination 格式、结构基元原子数）
 *   · 晶体模块的 queryCrystal 工具（算密度 ρ = Z·M/(N_A·V) 需要摩尔质量）
 *   原先只写在自检脚本里（未导出）。放在这里，两边共用一份，避免解析器被复制两份后
 *   对同一个式子给出不同结果——那类分歧不会报错，只会让密度悄悄算错。
 *
 * 来源：projects/crystal/tools/check-crystal-data.mjs 的 normalizeSubscripts /
 * parseFormula（第 63–121 行），2026-09-24 抽出，逻辑未改。
 */
import { ELEMENTS } from './elements.js'

/** 阿伏加德罗常数（CODATA 2018 定义值，与教材一致） */
export const AVOGADRO = 6.02214076e23

/** 将 Unicode 下标数字转为 ASCII，如 H₂O → H2O */
export function normalizeSubscripts(s) {
  return String(s == null ? '' : s).replace(/[₀-₉]/g, (ch) => String(ch.charCodeAt(0) - 0x2080))
}

/**
 * 解析化学式，返回各元素原子数。支持嵌套括号，如 [(NH₂)₂CO]₂。
 *
 * ★ 只认「大写字母开头的元素符号 + 可选小写续字母 + 可选数字」这一套写法，
 *   遇到别的字符（如 ≫、·、空格）跳过。因此 `NaCl(岩盐)型` 这类带中文的字符串
 *   也能解析出 { Na: 1, Cl: 1 }——中文不会被误当成元素。
 *
 * @param {string} formula
 * @returns {Record<string, number>} 元素符号 → 原子数
 */
export function parseFormula(formula) {
  const s = normalizeSubscripts(formula)
  const counts = {}

  function merge(target, source, mult) {
    for (const [el, n] of Object.entries(source)) {
      target[el] = (target[el] || 0) + n * mult
    }
  }

  function expand(str) {
    const out = {}
    let i = 0
    while (i < str.length) {
      const ch = str[i]
      if (ch === '(' || ch === '[') {
        // 找到配对的右括号（同时跟踪两种括号的嵌套深度）
        let depth = 1
        let j = i + 1
        while (j < str.length && depth > 0) {
          if (str[j] === '(' || str[j] === '[') depth++
          else if (str[j] === ')' || str[j] === ']') depth--
          if (depth === 0) break
          j++
        }
        const inner = str.slice(i + 1, j)
        // 读取组后的数字倍数
        let k = j + 1
        let num = ''
        while (k < str.length && /\d/.test(str[k])) num += str[k++]
        merge(out, expand(inner), num ? parseInt(num, 10) : 1)
        i = k
      } else if (/[A-Z]/.test(ch)) {
        let el = ch
        let j = i + 1
        if (j < str.length && /[a-z]/.test(str[j])) el += str[j++]
        let num = ''
        while (j < str.length && /\d/.test(str[j])) num += str[j++]
        out[el] = (out[el] || 0) + (num ? parseInt(num, 10) : 1)
        i = j
      } else {
        i++ // 跳过 ≫ 等非化学式字符
      }
    }
    return out
  }

  return expand(s)
}

/**
 * 由元素计数求摩尔质量（g/mol）。
 *
 * @param {Record<string,number>} counts
 * @param {Object} [elements] 元素表（默认用共享真源）
 * @returns {{mass: number, unknown: string[]}} mass=0 且 unknown 非空时表示有未识别的元素，
 *          调用方**必须**据此拒绝出结果，而不是拿 0 去算密度
 */
export function molarMass(counts, elements) {
  const table = elements || ELEMENTS
  let mass = 0
  const unknown = []
  for (const [el, n] of Object.entries(counts || {})) {
    const e = table[el]
    if (!e || typeof e.atomicMass !== 'number') { unknown.push(el); continue }
    mass += e.atomicMass * n
  }
  return { mass, unknown }
}

/** 化学式 → 摩尔质量（便捷封装） */
export function formulaMass(formula, elements) {
  return molarMass(parseFormula(formula), elements)
}

export default { AVOGADRO, normalizeSubscripts, parseFormula, molarMass, formulaMass }
