/**
 * templates.js — 题型模板库与干扰项生成
 *
 * 每个模板 = 一个**确定性生成器**：给定（知识点, 晶体, 难度）就产出一道题，
 * 答案由程序从晶体数据算出（通道 A），模型完全不参与数值。
 *
 * ★ 干扰项不是随机数，而是**从典型错误认知反推出来的**（见 data/error-causes.js）。
 *   这样每个错误选项都携带诊断信息：学生选了它，我们就知道他错在哪一类，
 *   而不是只知道"他错了"。三类策略按优先级：
 *     ① 错因反推 —— 该知识点有对应错因时首选，干扰项就是这个错因的产物
 *     ② 邻近值   —— 无明确错因时用（必须仍在合理量级内，不能出现荒谬数）
 *     ③ 邻近概念 —— 选项是概念而非数值时用（如点阵型式的几种记号）
 *
 * ★ 答案与解析**分离生成**：先冻结 `answerValue`，再拿它作只读输入填解析模板。
 *   实现顺序在本文件里体现为 build() 的两段：computeAnswer() → fillExplanation()。
 *   若让解析与答案一起"即兴生成"，答案错时解析会替它编出自洽理由。
 */

import { t, tr } from '../i18n-live.js'
import {
  SPACE_UTILIZATION_PCT, STACKING, INTERSTICE_PER_SPHERE,
  POLYHEDRON_BY_CN, POLYHEDRON_CN12, LATTICE_POINTS,
} from './data/constants.js'
import {
  STACKING_BY_CRYSTAL, canAskStacking, parseCoordination, coordinationOf,
} from './data/crystal-facts.js'
import { causesForKnowledgePoint } from './data/error-causes.js'
import { buildPresetView } from './preset-view.js'

// ============================================================================
// 工具：数的表示与选项构造
// ============================================================================

/** 数值格式化：整数不带小数点，小数保留指定位数（去掉尾随零） */
function num(v, digits = 4) {
  if (!Number.isFinite(v)) return String(v)
  if (Number.isInteger(v)) return String(v)
  return String(Number(v.toFixed(digits)))
}

/** 选项去重：按归一化文本判重（避免"6"与"6.0"同时出现） */
function uniqOptions(list) {
  const seen = new Set()
  const out = []
  for (const o of list) {
    const key = String(o.text).replace(/\s+/g, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(o)
  }
  return out
}

/**
 * 洗牌并确定 answerIndex。
 * ★ 用可复现的伪随机（种子由调用方给），这样同一道题在重放时选项顺序一致
 *   —— 否则"学生上次选的是 B"这类记录会失去意义。
 */
function shuffleWithSeed(items, seed) {
  const arr = items.slice()
  let s = (seed >>> 0) || 1
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t
  }
  return arr
}

/**
 * 组装最终题目：给定正确答案与干扰项，产出 4 选项 + answerIndex。
 */
function assemble({ correctText, distractors, seed, ...rest }) {
  // 干扰项最多取 3 个；不足时用邻近值补齐由各模板负责
  const wrong = uniqOptions(distractors.filter((d) => String(d.text).replace(/\s+/g, '')
    !== String(correctText).replace(/\s+/g, ''))).slice(0, 3)
  const all = [{ text: correctText, correct: true, errorCause: null }, ...wrong]
  const shuffled = shuffleWithSeed(all, seed)
  const answerIndex = shuffled.findIndex((o) => o.correct)
  return Object.assign(rest, {
    options: shuffled.map(({ text, errorCause }) => ({ text, errorCause: errorCause || null })),
    answerIndex,
    answerText: correctText,
  })
}

/** 从错因库取干扰项（策略 ①） */
function distractorsFromCauses(kp, { excludeValue, limit = 3 } = {}) {
  const causes = causesForKnowledgePoint(kp)
  const out = []
  for (const c of causes) {
    if (c.distractor == null) continue
    // ★ 干扰项的文本可能来自错因库（如 E-A5 的「体心立方(cI)」），那是文案、要过 tr()；
    //   数值型干扰项（distractor 是数字）不受影响。
    const text = typeof c.distractor === 'number' ? num(c.distractor) : tr(String(c.distractor))
    if (excludeValue != null && text === num(excludeValue)) continue
    out.push({ text, errorCause: c.id })
    if (out.length >= limit) break
  }
  return out
}

/** 邻近值干扰项（策略 ②）：在答案附近取几个合理值 */
function nearValues(value, { digits = 4, factors = [0.5, 2, 0.75, 1.5] } = {}) {
  const out = []
  for (const f of factors) {
    const v = Number((value * f).toFixed(digits))
    if (v > 0) out.push({ text: num(v, digits), errorCause: null })
  }
  return out
}

// ============================================================================
// 题型模板
// ============================================================================

/**
 * 每个模板：
 *   id / kp / topic / difficulty
 *   applies(data)  → 该晶体能否出这个题（**适用域必须是显式的**）
 *   build({data, compute, seed}) → { question } 或 { error }
 */
export const TEMPLATES = [

  // --------------------------------------------------------------------------
  // C1 点阵型式
  // --------------------------------------------------------------------------
  {
    id: 'c1-lattice-type', kp: 'crystal:C1', topic: 'latticeType', difficulty: 'L1',
    applies: (d) => !!d.latticeType,
    build({ data, seed }) {
      const ans = data.latticeType
      // 干扰项：邻近概念（其他点阵记号），并优先使用错因 E-A5（CsCl 的情况）
      const causes = distractorsFromCauses('crystal:C1')
      const others = ['体心立方(cI)', '面心立方(cF)', '简单立方(cP)', '简单六方(hP)', '体心四方(tI)']
        .filter((t) => t !== ans)
        .map((t) => ({ text: t, errorCause: null }))
      const q = assemble({
        ...{},
        correctText: ans,
        distractors: causes.concat(others),
        seed,
        kp: 'crystal:C1', topic: 'latticeType', difficulty: 'L1',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.1', { p1: (tr(data.name)), p2: (tr(data.formula)) }),
        answerValue: ans, answerKind: null,
        source: 'data',
      })
      q.answerValue = ans
      // 解析（答案已冻结，只读引用）
      q.explanationParts = {
        answer: ans,
        spaceGroup: data.spaceGroup,
        note: t('crystal.t.quiz-templates.2', { p1: (data.spaceGroup), p2: (String(data.spaceGroup)[0]) }),
      }
      q.presetView = buildPresetView('crystal:C1', { crystalId: data.id })
      return { question: q }
    },
  },

  {
    id: 'c1-crystal-system', kp: 'crystal:C1', topic: 'crystalSystem', difficulty: 'L1',
    applies: (d) => !!d.crystalSystem,
    build({ data, seed }) {
      const map = { cubic: '立方', hexagonal: '六方', tetragonal: '四方', orthorhombic: '正交', monoclinic: '单斜', triclinic: '三斜', trigonal: '三方' }
      // ★ 选项文本取自常量表，逐项过 tr()（表是模块级常量，切语言不会自己变）
      const ans = tr(map[data.crystalSystem] || data.crystalSystem)
      const q = assemble({
        correctText: ans,
        distractors: Object.values(map).map(tr).filter((x) => x !== ans).map((text) => ({ text, errorCause: null })),
        seed,
        kp: 'crystal:C1', topic: 'crystalSystem', difficulty: 'L1',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.3', { p1: (tr(data.name)), p2: (tr(data.formula)) }),
        answerKind: null, source: 'data',
      })
      q.answerValue = ans
      q.explanationParts = { answer: ans, lattice: JSON.stringify(data.lattice || {}) }
      q.presetView = buildPresetView('crystal:C1', { crystalId: data.id })
      return { question: q }
    },
  },

  // --------------------------------------------------------------------------
  // C2 结构基元
  // --------------------------------------------------------------------------
  {
    id: 'c2-cells-per-unit', kp: 'crystal:C2', topic: 'structuralUnitAtoms', difficulty: 'L2',
    applies: (d) => !!d.structuralUnit,
    build({ data, seed, compute }) {
      // 结构基元含几个原子 = 化学式里的原子数
      const counts = compute.parseFormula(data.structuralUnit || data.formula)
      const n = Object.values(counts).reduce((a, b) => a + b, 0)
      if (!(n > 0)) return { error: t('crystal.t.quiz-templates.4', { p1: (data.structuralUnit) }) }
      const q = assemble({
        correctText: num(n),
        distractors: nearValues(n).concat([{ text: num(n + 1), errorCause: null }]),
        seed,
        kp: 'crystal:C2', topic: 'structuralUnitAtoms', difficulty: 'L2',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.5', { p1: (tr(data.name)), p2: (data.structuralUnit) }),
        answerValue: n, answerKind: 'count', source: 'data',
      })
      q.explanationParts = { answer: n, unit: data.structuralUnit }
      q.presetView = buildPresetView('crystal:C2', { crystalId: data.id })
      return { question: q }
    },
  },

  {
    id: 'c2-atoms-in-cell', kp: 'crystal:C2', topic: 'atomsInCell', difficulty: 'L2',
    applies: () => true,
    build({ data, seed, compute }) {
      const n = compute.atomCount(data)
      if (!(n > 0)) return { error: '晶胞内没有原子' }
      const q = assemble({
        correctText: num(n),
        // 错因 E-B3：把顶点/面心原子整个算进去（常见错法）
        distractors: distractorsFromCauses('crystal:C2').concat(nearValues(n)),
        seed,
        kp: 'crystal:C2', topic: 'atomsInCell', difficulty: 'L2',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.6', { p1: (tr(data.name)) }),
        answerValue: n, answerKind: 'count', source: 'data',
      })
      q.explanationParts = { answer: n, groups: (data.atoms || []).map((g) => `${g.element}×${(g.positions || []).length}`).join(' + ') }
      q.presetView = buildPresetView('crystal:C2', { crystalId: data.id })
      return { question: q }
    },
  },

  // --------------------------------------------------------------------------
  // C3 堆积方式
  // --------------------------------------------------------------------------
  {
    id: 'c3-stacking', kp: 'crystal:C3', topic: 'stacking', difficulty: 'L2',
    // ★ 只有 4 个单质晶体能出——多元素结构没有 A1–A4 的答案（见 crystal-facts.js）
    applies: (d) => canAskStacking(d.id),
    build({ data, seed }) {
      const st = STACKING_BY_CRYSTAL[data.id]
      const info = STACKING[st]
      // ★ 选项文本是"代号 + 名字"拼出来的，而名字（立方最密堆积…）来自常量表。
      //   名字必须**单独**过 tr()：整串换个键做不到（每次内容不同），把常量表
      //   预先翻好也做不到（表是模块级常量，切语言不会变）。
      const stackName = (code, name) => t('crystal.q.stackingOption', { code, name: tr(name) })
      const q = assemble({
        correctText: stackName(st, info.name),
        distractors: Object.entries(STACKING)
          .filter(([k]) => k !== st)
          .map(([k, v]) => ({ text: stackName(k, v.name), errorCause: k === 'A1' && st === 'A3' ? 'E-A2' : null })),
        seed,
        kp: 'crystal:C3', topic: 'stacking', difficulty: 'L2',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.7', { p1: (tr(data.name)), p2: (tr(data.formula)) }),
        answerValue: st, answerKind: null, stacking: st, source: 'data',
      })
      q.explanationParts = { answer: stackName(st, info.name), layerSequence: info.layerSequence, example: tr(info.example) }
      q.presetView = buildPresetView('crystal:C3', { crystalId: data.id })
      return { question: q }
    },
  },

  {
    id: 'c3-space-utilization', kp: 'crystal:C3', topic: 'spaceUtilization', difficulty: 'L2',
    applies: (d) => canAskStacking(d.id),
    build({ data, seed }) {
      const st = STACKING_BY_CRYSTAL[data.id]
      const pct = SPACE_UTILIZATION_PCT[st]
      const q = assemble({
        correctText: `${num(pct, 2)}%`,
        distractors: Object.entries(SPACE_UTILIZATION_PCT)
          .filter(([k]) => k !== st)
          .map(([k, v]) => ({ text: `${num(v, 2)}%`, errorCause: null })),
        seed,
        kp: 'crystal:C3', topic: 'spaceUtilization', difficulty: 'L2',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.8', { p1: (tr(data.name)), p2: (st) }),
        answerValue: pct, answerKind: 'percentage', stacking: st, source: 'data',
      })
      q.explanationParts = { answer: `${num(pct, 2)}%`, stacking: st, formula: '对于 A1：4r = a√2 ⇒ η = π/(3√2)' }
      q.presetView = buildPresetView('crystal:C3', { crystalId: data.id })
      return { question: q }
    },
  },

  // --------------------------------------------------------------------------
  // C4 配位环境
  // --------------------------------------------------------------------------
  {
    id: 'c4-coordination-number', kp: 'crystal:C4', topic: 'coordinationNumber', difficulty: 'L2',
    // ★ 只对有经典配位数的晶体出（分子晶体的那一列是"无经典配位数"，走概念题）
    applies: (d) => parseCoordination(d.coordination).kind === 'classic',
    build({ data, seed }) {
      const parsed = parseCoordination(data.coordination)
      const first = parsed.entries[0]
      if (!first) return { error: '该晶体没有可用的配位数条目' }
      const q = assemble({
        correctText: num(first.cn),
        distractors: distractorsFromCauses('crystal:C4').concat(
          parsed.entries.filter((e) => e.cn !== first.cn).map((e) => ({ text: num(e.cn), errorCause: null })),
        ),
        seed,
        kp: 'crystal:C4', topic: 'coordinationNumber', difficulty: 'L2',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.9', { p1: (tr(data.name)), p2: (first.element) }),
        answerValue: first.cn, answerKind: 'count', source: 'data',
      })
      q.explanationParts = { answer: first.cn, element: first.element, neighbors: first.neighbors }
      q.presetView = buildPresetView('crystal:C4', { crystalId: data.id })
      return { question: q }
    },
  },

  {
    id: 'c4-polyhedron', kp: 'crystal:C4', topic: 'polyhedron', difficulty: 'L2',
    applies: (d) => parseCoordination(d.coordination).kind === 'classic',
    build({ data, seed }) {
      const parsed = parseCoordination(data.coordination)
      const first = parsed.entries[0]
      const info = coordinationOf(data, first.element)
      if (!info || !info.polyhedron || info.polyhedron.startsWith('（')) {
        return { error: t('crystal.t.quiz-templates.10', { p1: (first.element) }) }
      }
      const all = Object.values(POLYHEDRON_BY_CN).concat(Object.values(POLYHEDRON_CN12))
      const answer = tr(info.polyhedron)
      const q = assemble({
        correctText: answer,
        distractors: all.map(tr).filter((x) => x !== answer).map((text) => ({ text, errorCause: info.cn === 4 ? 'E-D1' : null })),
        seed,
        kp: 'crystal:C4', topic: 'polyhedron', difficulty: 'L2',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.11', { p1: (tr(data.name)), p2: (first.element), p3: (info.cn) }),
        answerValue: answer, answerKind: null, source: 'data',
      })
      q.explanationParts = { answer, cn: info.cn, neighbors: info.neighbors }
      q.presetView = buildPresetView('crystal:C4', { crystalId: data.id })
      return { question: q }
    },
  },

  // --------------------------------------------------------------------------
  // C5 空隙分布（★ 两个问法必须分开）
  // --------------------------------------------------------------------------
  {
    id: 'c5-interstices-in-cell', kp: 'crystal:C5', topic: 'intersticesInCell', difficulty: 'L3',
    // ★ 只有 fcc/hcp 有 interstices 数据（数据覆盖现状）
    applies: (d) => {
      const it = d.interstices || {}
      return ((it.octahedral && it.octahedral.positions) || []).length > 0
        || ((it.tetrahedral && it.tetrahedral.positions) || []).length > 0
    },
    build({ data, seed }) {
      const it = data.interstices || {}
      const oct = ((it.octahedral && it.octahedral.positions) || []).length
      const tet = ((it.tetrahedral && it.tetrahedral.positions) || []).length
      const kind = oct > 0 ? 'octahedral' : 'tetrahedral'
      const n = kind === 'octahedral' ? oct : tet
      const kindName = kind === 'octahedral' ? tr('正八面体') : tr('正四面体')
      const q = assemble({
        correctText: num(n),
        // ★ 错因 E-B1：用"每个球周围"的数目作答（6 或 8）——这是最高危的混淆
        distractors: distractorsFromCauses('crystal:C5').concat(nearValues(n)),
        seed,
        kp: 'crystal:C5', topic: 'intersticesInCell', intersticeKind: kind, difficulty: 'L3',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.12', { p1: (tr(data.name)), p2: (kindName) }),
        answerValue: n, answerKind: 'count', source: 'data',
      })
      q.explanationParts = {
        answer: n, kindName,
        other: kind === 'octahedral' ? t('crystal.t.quiz-templates.13', { p1: (tet) }) : t('crystal.t.quiz-templates.14', { p1: (oct) }),
        warn: t('crystal.t.quiz-templates.15'),
      }
      q.presetView = buildPresetView('crystal:C5', { crystalId: data.id, intersticeKind: kind })
      return { question: q }
    },
  },

  {
    id: 'c5-interstice-per-sphere', kp: 'crystal:C5', topic: 'intersticePerSphere', difficulty: 'L3',
    // ★ 只有 A1/A3（最密堆积）有"每个球周围"的定值
    applies: (d) => {
      const st = STACKING_BY_CRYSTAL[d.id]
      return st === 'A1' || st === 'A3'
    },
    build({ data, seed }) {
      const st = STACKING_BY_CRYSTAL[data.id]
      // 交替问四面体/八面体，避免同一晶体反复考同一个数
      const kind = (data.id === 'fcc') ? 'octahedral' : 'tetrahedral'
      const n = INTERSTICE_PER_SPHERE[st][kind]
      const kindName = kind === 'octahedral' ? tr('正八面体') : tr('正四面体')
      const q = assemble({
        correctText: num(n),
        distractors: distractorsFromCauses('crystal:C5', { excludeValue: n }).concat(nearValues(n)),
        seed,
        kp: 'crystal:C5', topic: 'intersticePerSphere', intersticeKind: kind, stacking: st, difficulty: 'L3',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.16', { p1: (tr(data.name)), p2: (kindName) }),
        answerValue: n, answerKind: 'count', source: 'data',
      })
      q.explanationParts = {
        answer: n, kindName, stacking: st,
        // ★ 这两条是常量表里的原文，最终会被拼进解析 —— 在这里过 tr()，
        //   否则英文解析里会夹一句中文（不报错，只是读起来突然跳语言）。
        contrast: kind === 'octahedral'
          ? tr('（对比：晶胞内只有 4 个八面体空隙位置）')
          : tr('（对比：晶胞内有 8 个四面体空隙位置）'),
      }
      q.presetView = buildPresetView('crystal:C5', { crystalId: data.id, intersticeKind: kind })
      return { question: q }
    },
  },

  // --------------------------------------------------------------------------
  // C6 空间群与对称元素
  // --------------------------------------------------------------------------
  {
    id: 'c6-space-group', kp: 'crystal:C6', topic: 'spaceGroup', difficulty: 'L1',
    applies: (d) => !!d.spaceGroup,
    build({ data, seed }) {
      const ans = data.spaceGroup
      const others = ['Fm-3m', 'Pm-3m', 'Im-3m', 'Fd-3m', 'Pa-3', 'R-3m', 'P6₃/mmc', 'Pnma', 'C2/c']
        .filter((x) => x !== ans)
      const q = assemble({
        correctText: ans,
        distractors: others.map((t) => ({ text: t, errorCause: null })),
        seed,
        kp: 'crystal:C6', topic: 'spaceGroup', difficulty: 'L1',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.17', { p1: (tr(data.name)), p2: (tr(data.formula)) }),
        answerValue: ans, answerKind: null, source: 'data',
      })
      q.explanationParts = { answer: ans, latticeType: data.latticeType }
      q.presetView = buildPresetView('crystal:C6', { crystalId: data.id })
      return { question: q }
    },
  },

  {
    id: 'c6-symmetry-axes', kp: 'crystal:C6', topic: 'symmetryAxisTypes', difficulty: 'L2',
    applies: (d) => !!(d.symmetry && Array.isArray(d.symmetry.axes) && d.symmetry.axes.length),
    build({ data, seed }) {
      const axes = (data.symmetry && data.symmetry.axes) || []
      const types = [...new Set(axes.map((a) => a.type))]
      const n = types.length
      const q = assemble({
        correctText: num(n),
        distractors: nearValues(n).concat([{ text: num(axes.length), errorCause: null }]),
        seed,
        kp: 'crystal:C6', topic: 'symmetryAxisTypes', difficulty: 'L2',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.18', { p1: (tr(data.name)) }),
        answerValue: n, answerKind: 'count', source: 'data',
      })
      q.explanationParts = {
        answer: n, types: types.map(tr).join(t('crystal.quiz.listSep')),
        total: t('crystal.t.quiz-templates.19', { p1: (axes.length), p2: (n) }),
      }
      q.presetView = buildPresetView('crystal:C6', { crystalId: data.id })
      return { question: q }
    },
  },

  // --------------------------------------------------------------------------
  // C7 晶胞参数
  // --------------------------------------------------------------------------
  {
    id: 'c7-cell-volume', kp: 'crystal:C7', topic: 'cellVolume', difficulty: 'L2',
    applies: (d) => !!d.lattice,
    build({ data, seed, compute }) {
      const V = compute.cellVolume(data.lattice)
      if (V == null) return { error: '晶胞参数非法，算不出体积' }
      const v = Number(V.toFixed(4))
      const q = assemble({
        correctText: `${num(v)} Å³`,
        distractors: nearValues(v).map((d) => ({ text: `${d.text} Å³`, errorCause: null })),
        seed,
        kp: 'crystal:C7', topic: 'cellVolume', difficulty: 'L2',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.20', { p1: (tr(data.name)), p2: (tr(data.formula)) }),
        answerValue: v, answerKind: 'volume', source: 'data',
      })
      q.explanationParts = { answer: `${num(v)} Å³`, lattice: data.lattice, formula: 'V = abc√(1−cos²α−cos²β−cos²γ+2cosαcosβcosγ)' }
      q.presetView = buildPresetView('crystal:C7', { crystalId: data.id })
      return { question: q }
    },
  },

  {
    id: 'c7-density', kp: 'crystal:C7', topic: 'density', difficulty: 'L3',
    applies: () => true,
    build({ data, seed, compute }) {
      const r = compute.computeDensity(data)
      if (r.err) return { error: r.err }
      const v = r.density
      const q = assemble({
        correctText: `${num(v)} g/cm³`,
        distractors: distractorsFromCauses('crystal:C7').concat(
          nearValues(v).map((d) => ({ text: `${d.text} g/cm³`, errorCause: null })),
        ),
        seed,
        kp: 'crystal:C7', topic: 'density', difficulty: 'L3',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.21', { p1: (tr(data.name)), p2: (tr(data.formula)) }),
        answerValue: v, answerKind: 'density', source: 'data',
      })
      q.explanationParts = {
        answer: `${num(v)} g/cm³`, Z: r.Z, Znote: r.Znote,
        molarMass: r.molarMass, volume: r.volumeA3,
      }
      q.presetView = buildPresetView('crystal:C7', { crystalId: data.id })
      return { question: q }
    },
  },

  {
    id: 'c7-nearest-neighbor', kp: 'crystal:C7', topic: 'nearestNeighbor', difficulty: 'L3',
    applies: (d) => !!d.lattice && (d.atoms || []).length > 0,
    build({ data, seed, compute }) {
      const r = compute.nearestSameAtomDistance(data)
      if (r.err) return { error: r.err }
      const v = r.distance
      const q = assemble({
        correctText: `${num(v)} Å`,
        distractors: distractorsFromCauses('crystal:C7').concat(
          nearValues(v).map((d) => ({ text: `${d.text} Å`, errorCause: null })),
        ),
        seed,
        kp: 'crystal:C7', topic: 'nearestNeighbor', difficulty: 'L3',
        crystalId: data.id,
        stem: t('crystal.t.quiz-templates.22', { p1: (tr(data.name)), p2: (r.element) }),
        answerValue: v, answerKind: 'distance', source: 'data',
      })
      q.explanationParts = { answer: `${num(v)} Å`, element: r.element, note: r.note }
      q.presetView = buildPresetView('crystal:C7', { crystalId: data.id })
      return { question: q }
    },
  },
]

// ============================================================================
// 解析填充（★ 答案已冻结，此处只读引用它）
// ============================================================================

/**
 * 用模板给出的数据填出解析文本。
 *
 * ★ 三段式（《出题引擎技术设计》§4.4）：
 *   ① 为什么正确项对  ② 错项逐个分析  ③ 结构指引（引导去看三维）
 * ★ 函数签名刻意要求传入 `frozen`（已冻结的答案），而不是让模板自己再算一遍
 *   —— 那样一旦两处算法有差，解析就会与答案矛盾。
 */
export function fillExplanation(q, frozen) {
  const p = q.explanationParts || {}
  const lines = []

  // ① 正误说明
  lines.push(t('crystal.t.quiz-templates.23', { p1: (frozen.answerText) }))
  if (q.topic === 'density' && p.Z != null) {
    lines.push(t('crystal.t.quiz-templates.24', { p1: (p.Znote || `Z = ${p.Z}`), p2: (p.molarMass), p3: (p.volume) }))
  } else if (q.topic === 'cellVolume' && p.formula) {
    lines.push(t('crystal.t.quiz-templates.25', { p1: (tr(p.formula)) }))
  } else if (q.topic === 'spaceUtilization' && p.formula) {
    lines.push(t('crystal.t.quiz-templates.26', { p1: (tr(p.formula)) }))
  } else if (q.topic === 'stacking' && p.layerSequence) {
    lines.push(t('crystal.t.quiz-templates.27', { p1: (p.answer), p2: (p.layerSequence), p3: (p.example) }))
  } else if (q.topic === 'intersticePerSphere' && p.contrast) {
    lines.push(t('crystal.t.quiz-templates.28', { p1: (p.contrast) }))
  } else if (q.topic === 'intersticesInCell' && p.warn) {
    lines.push(p.warn)
  } else if (q.topic === 'symmetryAxisTypes' && p.total) {
    lines.push(p.total)
  } else if (q.topic === 'coordinationNumber' && p.neighbors) {
    lines.push(t('crystal.t.quiz-templates.29', { p1: (p.element), p2: (p.neighbors) }))
  } else if (q.topic === 'polyhedron' && p.neighbors) {
    lines.push(t('crystal.t.quiz-templates.30', { p1: (p.cn), p2: (p.neighbors) }))
  } else if (q.topic === 'latticeType' && p.spaceGroup) {
    lines.push(p.note)
  } else if (q.topic === 'structuralUnitAtoms' && p.unit) {
    lines.push(t('crystal.t.quiz-templates.31', { p1: (p.unit) }))
  } else if (q.topic === 'atomsInCell' && p.groups) {
    lines.push(t('crystal.t.quiz-templates.32', { p1: (p.groups) }))
  }

  // ② 错项逐个分析（**带错因标签的干扰项**才有分析价值）
  const wrongAnalysis = []
  for (const [i, o] of (q.options || []).entries()) {
    if (i === q.answerIndex || !o.errorCause) continue
    const c = causesForKnowledgePoint(q.kp).find((x) => x.id === o.errorCause)
    if (c) wrongAnalysis.push(t('crystal.t.quiz-templates.33', { p1: (o.text), p2: (tr(c.oneLine)) }))
  }
  if (wrongAnalysis.length) {
    lines.push('')
    lines.push(...wrongAnalysis)
  }

  // ③ 结构指引
  if (q.presetView) {
    lines.push('')
    lines.push(tr('👉 点下方「去看结构」，我把视图调到能看清这个答案的状态。'))
  }

  return lines.join('\n')
}

export default { TEMPLATES, fillExplanation }
