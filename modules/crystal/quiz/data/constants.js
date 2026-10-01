/**
 * constants.js — 出题引擎的**内置知识常量**
 *
 * 这里放的是"晶体学的固定结论"，它们**不由晶胞数据决定**，而是学科事实。
 * 数据里能算的是另一回事：`interstices` 字段给的是**晶胞内**的空隙位置数，
 * 而"每个球周围有几个空隙"是堆积方式的固有性质（见下方 INTERSTICE_PER_SPHERE）。
 *
 * ★ 两个必须区分的问法（设计文档点名为最容易出错处）：
 *
 *     「Cu 型晶胞中含有几个八面体空隙？」 → 读数据 → fcc 是 **4**
 *     「Cu 型中每个球周围有几个八面体空隙？」 → 查本表 → **6**
 *
 *   两者数值不同、来源不同。混淆会出**错误题目**，而答案是"程序算出来的"
 *   所以更容易被信任——比模型幻觉更隐蔽。故两处来源在代码里必须显式分开：
 *   前者走 `queryCrystal({kind:'interstices'})`（读数据），后者走本表。
 *
 * ★ 数值一律程序算的延伸：**连常量也程序算**。
 *   空间利用率写成 `π/(3√2)` 而不是 `74.05`——前者可从第一原理验证，
 *   后者是"抄来的数"（抄错不会报错）。且公式值能与数据里的 `spaceUtilization`
 *   字段交叉校验：相符才出题，不符说明晶格参数或半径数据有误。
 */

// ============================================================================
// 堆积方式（A1–A4）
// ============================================================================

/**
 * 空间利用率（等径球模型的理论值）。
 *
 * 推导（以 A1 为例）：面心立方中，球沿面对角线相切 → 4r = a√2 → 球半径
 * r = a√2/4。晶胞含 4 个球，故
 *     η = 4·(4/3)πr³ / a³ = (16/3)π·(a√2/4)³/a³ = π/(3√2) ≈ 0.7405
 * A2 沿体对角线相切（4r = a√3，晶胞 2 球）、A4 沿体对角线 1/4 处相切。
 */
export const SPACE_UTILIZATION = {
  A1: Math.PI / (3 * Math.SQRT2),          // 0.74048 —— 立方最密（fcc）
  A2: Math.sqrt(3) * Math.PI / 8,          // 0.68017 —— 体心（bcc）
  A3: Math.PI / (3 * Math.SQRT2),          // 0.74048 —— 六方最密（hcp），与 A1 相同
  A4: Math.sqrt(3) * Math.PI / 16,         // 0.34009 —— 金刚石型
}

/** 以百分比表示（保留两位，出题与展示用） */
export const SPACE_UTILIZATION_PCT = Object.fromEntries(
  Object.entries(SPACE_UTILIZATION).map(([k, v]) => [k, +(v * 100).toFixed(2)]),
)

/**
 * 堆积方式总表。
 *
 * `layerSequence`：密堆积的层序，A1 是 ABCABC…、A3 是 ABAB…。
 *   这是 A1 与 A3 唯一的结构差别，也是最常被记混的一处。
 * `packingDirection`：密堆积方向（球沿之相切的方向）
 * `latticeType`：对应的点阵型式记号
 */
export const STACKING = {
  A1: {
    name: '立方最密堆积',
    layerSequence: 'ABCABC…',
    packingDirection: '面对角线方向（a⟨110⟩），4r = a√2',
    latticeType: 'cF',
    example: 'Cu、Ag、Au、Al',
    cellsPerBall: 4,
  },
  A2: {
    name: '体心立方堆积',
    layerSequence: '（非密堆积，无密置层）',
    packingDirection: '体对角线方向（a⟨111⟩），4r = a√3',
    latticeType: 'cI',
    example: 'α-Fe、W、Mo、碱金属',
    cellsPerBall: 2,
  },
  A3: {
    name: '六方最密堆积',
    layerSequence: 'ABAB…',
    packingDirection: 'c 轴方向，4r = a√(8/3)（即 a·2√2/√3）',
    latticeType: 'hP',
    example: 'Mg、Zn、Ti',
    cellsPerBall: 2,
  },
  A4: {
    name: '金刚石型堆积',
    layerSequence: '（sp³ 四面体骨架，非密堆积）',
    packingDirection: '体对角线 1/4 处，4r = a√3/4',
    latticeType: 'cF',
    example: '金刚石、Si、Ge',
    cellsPerBall: 8,
  },
}

// ============================================================================
// 空隙数（★ 与数据字段是两个量，不可混用）
// ============================================================================

/**
 * **每个球周围**的空隙数 —— 这是堆积方式的固有性质，不由晶胞数据决定。
 *
 * 与数据里的 `interstices` 字段（**晶胞内**的位置数）是两回事：
 *   A1 晶胞含 4 个球、8 个四面体空隙位置、4 个八面体空隙位置
 *   （数目之比 = 2:1:1）
 * 而"每个球周围"= 8 个四面体 + 6 个八面体（这是教材上的结论）。
 *
 * 两者由同一个几何事实导出，但数值不同，问法与答案来源必须一一绑定。
 */
export const INTERSTICE_PER_SPHERE = {
  A1: { tetrahedral: 8, octahedral: 6 },
  A3: { tetrahedral: 8, octahedral: 6 },
}

/**
 * 晶胞内空隙位置数与球数之比（用于与数据字段交叉校验）。
 * A1：球 4 个，四面体位置 8 个、八面体位置 4 个 → 1 : 2 : 1。
 */
export const INTERSTICE_RATIO = {
  A1: { spheres: 1, tetrahedral: 2, octahedral: 1 },
  A3: { spheres: 1, tetrahedral: 2, octahedral: 1 },
}

// ============================================================================
// 配位构型
// ============================================================================

/**
 * 配位数 → 配位多面体名称。
 *
 * ★ 为什么需要它：数据里的 `coordination` 字段已结构化（`元素:配位数(配位原子)`），
 *   但**没有"配位构型"这一列**——这是信息缺失，不是格式问题，正则解决不了。
 *   本表是按配位数查构型的**通用规则**，可覆盖本库全部晶体。
 *
 * 注意 12 配位有两种构型（面心立方最密与六方最密的中文习惯叫法不同），
 * 故按堆积方式区分。
 */
export const POLYHEDRON_BY_CN = {
  2: '直线形',
  3: '平面三角形',
  4: '正四面体',
  6: '正八面体',
  8: '立方体',
}

/** 12 配位：按堆积方式区分（古巴邻接 vs 反立方八面体） */
export const POLYHEDRON_CN12 = {
  A1: '立方最密堆积配位（反立方八面体）',
  A3: '六方最密堆积配位（反立方八面体）',
}

/** 分子晶体的配位数描述前缀（数据里这四条不是数值而是说明） */
export const NO_CLASSIC_CN_PREFIX = '无经典配位数'

// ============================================================================
// 点阵型式
// ============================================================================

/** 14 种布拉维点阵：记号 → 中文名。用于点阵型式题与合法性校验。 */
export const BRAVAIS = {
  aP: '简单三斜', aS: '简单三斜（另一种描述）',
  mP: '简单单斜', mC: '底心单斜',
  oP: '简单正交', oC: '底心正交', oI: '体心正交', oF: '面心正交',
  tP: '简单四方', tI: '体心四方',
  hP: '简单六方', hR: 'R 心六方（菱面体）',
  cP: '简单立方', cI: '体心立方', cF: '面心立方',
}

/** 晶胞内点阵点数（与 tools/check-crystal-data.mjs 的映射一致） */
export const LATTICE_POINTS = {
  aP: 1, aS: 2,
  mP: 1, mC: 2,
  oP: 1, oC: 2, oI: 2, oF: 4,
  tP: 1, tI: 2,
  hP: 1, hR: 3,
  cP: 1, cI: 2, cF: 4,
}

/** 空间群首字母 → 允许的点阵记号首字母（用于自洽性校验） */
export const SG_TO_LATTICE_LETTER = { P: 'P', I: 'I', F: 'F', C: 'C', A: 'A', R: 'R' }

// ============================================================================
// 晶体系统
// ============================================================================

/** 七个晶系的晶胞参数特征 */
export const CRYSTAL_SYSTEMS = {
  cubic: { name: '立方', rules: 'a = b = c，α = β = γ = 90°' },
  tetragonal: { name: '四方', rules: 'a = b ≠ c，α = β = γ = 90°' },
  orthorhombic: { name: '正交', rules: 'a ≠ b ≠ c，α = β = γ = 90°' },
  hexagonal: { name: '六方', rules: 'a = b ≠ c，α = β = 90°，γ = 120°' },
  trigonal: { name: '三方', rules: 'a = b = c，α = β = γ ≠ 90°（菱面体轴）' },
  monoclinic: { name: '单斜', rules: 'a ≠ b ≠ c，α = γ = 90° ≠ β' },
  triclinic: { name: '三斜', rules: 'a ≠ b ≠ c，α ≠ β ≠ γ ≠ 90°' },
}

export default {
  SPACE_UTILIZATION, SPACE_UTILIZATION_PCT, STACKING,
  INTERSTICE_PER_SPHERE, INTERSTICE_RATIO,
  POLYHEDRON_BY_CN, POLYHEDRON_CN12, NO_CLASSIC_CN_PREFIX,
  BRAVAIS, LATTICE_POINTS, SG_TO_LATTICE_LETTER, CRYSTAL_SYSTEMS,
}
