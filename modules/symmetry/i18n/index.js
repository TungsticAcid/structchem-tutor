/**
 * 国际化模块（中英双语）
 * 单例 + t()；语言持久化 localStorage；切换时派发 'langchange' 事件。
 * 术语采用晶体学/群论标准表述：symmetry elements / character table / principal axis /
 * mirror plane / inversion center / improper rotation axis / stabilizer / orbit 等。
 */
import { POINT_GROUP_NAMES, POINT_GROUP_SYSTEM } from '../engine/groupTable.js'
// ★ 把本区的字典**注册进共享运行时**：统一壳用 `startAutoSweep(document.body)` 扫 DOM，
//   而它只认真实注册过的字典。不注册的表现是"壳里别的页面都变了、点群观鉴页没变"，
//   并且**不报错**。`packages/i18n` 零依赖，不会引入新的环。
import { registerDict } from '../../../packages/i18n/index.js'

const LANG_KEY = 'symmetry_viewer_lang'

/**
 * 界面文案（zh 为默认，亦作回退）
 *
 * ★ 导出它**只是为了让覆盖率守卫看得见**（`tools/check-i18n.mjs` 靠 import 字典模块
 *   来读"哪些中文原文已被登记"）。不导出的话守卫读到的是一个空字典 —— 于是它会
 *   把已经做完的对称模块报成 263 条未覆盖，而**一个对已完成区域误报的守卫只会被忽略**。
 *   行为上没有任何变化：模块内部照旧用 MESSAGES。
 */
export const MESSAGES = {
  zh: {
    brand: '点群观鉴',
    hint: '左键拖动旋转 · 右键拖动平移 · 滚轮缩放 · 双击复位',
    'tool.symmetry': '对称元素',
    'tool.labels': '标签',
    'tool.aux': '辅助几何',
    'tool.auxTitle': '显示当前结构的辅助几何参考（立方体/二面角矩形），部分结构支持',
    'tool.atomLabel': '原子标签',
    'tool.settings': '设置',
    'tool.settingsTitle': '自定义外观与颜色',
    'ex.molecule': '分子示例',
    'ex.crystal': '晶体示例',
    'info.symSection': '对称元素',
    'info.none': '（无）',
    'ct.title': '特征标表',
    'ct.irreps': '不可约表示',
    'ct.linear': '线性 & 旋转',
    'ct.quad': '二次函数',
    'set.title': '外观设置',
    'set.lang': '语言',
    'set.bg': '背景色',
    'set.atomScale': '原子缩放',
    'set.stick': '键粗细',
    'set.symScale': '对称元素大小',
    'set.labelFont': '标签字号',
    'set.elemColorSec': '元素颜色',
    'set.symColorSec': '对称元素颜色',
    'set.reset': '恢复默认设置',
    'set.emptyHint': '（加载分子后可设置）',
  // ★ 与上一条分开：分子**已经**加载、只是这个点群里除 E 之外没有别的对称元素时用这句
  //   （用户报：C1 点群下显示"加载分子后可设置"不合理 —— 分子明明已经打开了）
  'set.noSymElementHint': '这个点群里除恒等操作 E 之外没有其他对称元素，没有可着色的对象',
    'anim.playTitle': '播放对称操作动画',
    'anim.toggle': '播放/暂停',
    'anim.reset': '重置变换',
    'anim.inverse': '逆变换',
    'anim.again': '再次操作',
    'anim.close': '关闭动画',
    'anim.progress': '动画进度',
    'anim.speed': '旋转角速度（°/s）',
    'anim.dur': '反映/反演时长（ms）',
    'orb.title': '等价原子 / 稳定化子',
    'orb.orbit': '等价原子',
    'orb.stabilizer': '稳定化子',
    'orb.order': '群阶',
    'orb.hint': '单击原子查看其群论轨道与稳定化子',
    'elem.C2': '二重旋转轴', 'elem.C3': '三重旋转轴', 'elem.C4': '四重旋转轴',
    'elem.C5': '五重旋转轴', 'elem.C6': '六重旋转轴', 'elem.C∞': '分子主轴（无限阶）',
    'elem.S4': '四重旋反轴', 'elem.S5': '五重旋反轴', 'elem.S6': '六重旋反轴', 'elem.S8': '八重旋反轴',
    'elem.sigma': '对称面', 'elem.sigma_v': '竖直对称面', 'elem.sigma_d': '对角对称面', 'elem.sigma_h': '水平对称面',
    'elem.i': '反演中心', 'elem.E': '恒等元素'
  },
  en: {
    brand: 'Point Group Explorer',
    hint: 'Drag to rotate · Right-drag to pan · Wheel to zoom · Double-click to reset',
    'tool.symmetry': 'Symmetry elements',
    'tool.labels': 'Labels',
    'tool.aux': 'Aux geometry',
    'tool.auxTitle': 'Show auxiliary reference geometry (cube/dihedral planes), where supported',
    'tool.atomLabel': 'Atom labels',
    'tool.settings': 'Settings',
    'tool.settingsTitle': 'Customize appearance & colors',
    'ex.molecule': 'Molecule examples',
    'ex.crystal': 'Crystal examples',
    'info.symSection': 'Symmetry elements',
    'info.none': '(none)',
    'ct.title': 'Character table',
    'ct.irreps': 'Irreducible reps.',
    'ct.linear': 'Linear & rotation',
    'ct.quad': 'Quadratic',
    'set.title': 'Appearance',
    'set.lang': 'Language',
    'set.bg': 'Background',
    'set.atomScale': 'Atomic scale',
    'set.stick': 'Bond radius',
    'set.symScale': 'Symmetry element size',
    'set.labelFont': 'Label font size',
    'set.elemColorSec': 'Element colors',
    'set.symColorSec': 'Symmetry element colors',
    'set.reset': 'Restore defaults',
    'set.emptyHint': '(load a molecule to customize)',
  'set.noSymElementHint': 'This point group has no symmetry elements other than the identity E, so there is nothing to colour',
    'anim.playTitle': 'Play symmetry operation animation',
    'anim.toggle': 'Play/Pause',
    'anim.reset': 'Reset transform',
    'anim.inverse': 'Inverse operation',
    'anim.again': 'Apply again',
    'anim.close': 'Close animation',
    'anim.progress': 'Animation progress',
    'anim.speed': 'Rotation speed (°/s)',
    'anim.dur': 'Reflection/inversion duration (ms)',
    'orb.title': 'Equivalent atoms / stabilizer',
    'orb.orbit': 'Equivalent atoms',
    'orb.stabilizer': 'Stabilizer',
    'orb.order': 'order',
    'elem.C2': 'twofold rotation axis', 'elem.C3': 'threefold rotation axis', 'elem.C4': 'fourfold rotation axis',
    'elem.C5': 'fivefold rotation axis', 'elem.C6': 'sixfold rotation axis', 'elem.C∞': 'principal axis (infinite order)',
    'elem.S4': 'fourfold improper rotation axis', 'elem.S5': 'fivefold improper rotation axis',
    'elem.S6': 'sixfold improper rotation axis', 'elem.S8': 'eightfold improper rotation axis',
    'elem.sigma': 'mirror plane', 'elem.sigma_v': 'vertical mirror plane', 'elem.sigma_d': 'dihedral mirror plane', 'elem.sigma_h': 'horizontal mirror plane',
    'elem.i': 'inversion center', 'elem.E': 'identity element'
  }
}

/** 点群英文名（zh 通返回上 groupTable 的中文名） */
const EN_GROUP_NAMES = {
  'C1': 'Trivial / identity group', 'Ci': 'Inversion group', 'Cs': 'Mirror group',
  'C2': 'twofold rotation group', 'C3': 'threefold rotation group', 'C4': 'fourfold rotation group', 'C6': 'sixfold rotation group',
  'C2v': 'C₂ᵥ group (twofold rotation + vertical mirrors)', 'C3v': 'C₃ᵥ group (threefold rotation + vertical mirrors)',
  'C4v': 'C₄ᵥ group (fourfold rotation + vertical mirrors)', 'C6v': 'C₆ᵥ group (sixfold rotation + vertical mirrors)',
  'C2h': 'C₂ₕ group (twofold rotation + horizontal mirror)', 'C3h': 'C₃ₕ group (threefold rotation + horizontal mirror)',
  'C4h': 'C₄ₕ group (fourfold rotation + horizontal mirror)', 'C6h': 'C₆ₕ group (sixfold rotation + horizontal mirror)',
  'D2': 'dihedral group', 'D3': 'dihedral group', 'D4': 'dihedral group', 'D6': 'dihedral group',
  'D2h': 'D₂ₕ group (dihedral + horizontal mirror)', 'D3h': 'D₃ₕ group (dihedral + horizontal mirror)',
  'D4h': 'D₄ₕ group (dihedral + horizontal mirror)', 'D6h': 'D₆ₕ group (dihedral + horizontal mirror)',
  'D2d': 'D₂d group (dihedral + diagonal mirrors)', 'D3d': 'D₃d group (dihedral + diagonal mirrors)',
  'D4d': 'D₄d group (dihedral + diagonal mirrors)', 'D6d': 'D₆d group (dihedral + diagonal mirrors)',
  'S4': 'fourfold improper rotation group', 'S6': 'sixfold improper rotation group', 'S8': 'eightfold improper rotation group',
  'C5': 'fivefold rotation group', 'C5v': 'C₅ᵥ group (fivefold rotation + vertical mirrors)',
  'C5h': 'C₅ₕ group (fivefold rotation + horizontal mirror)',
  'D5': 'dihedral group (5-fold)', 'D5h': 'D₅ₕ group (dihedral + horizontal mirror)', 'D5d': 'D₅d group (dihedral + diagonal mirrors)',
  'T': 'tetrahedral rotation group', 'Td': 'full tetrahedral group', 'Th': 'tetrahedral with inversion group',
  'O': 'octahedral rotation group', 'Oh': 'full octahedral group',
  'I': 'icosahedral rotation group', 'Ih': 'full icosahedral group',
  'C∞v': 'linear group (non-centrosymmetric)', 'D∞h': 'linear group (centrosymmetric)', 'Kh': 'spherical group (free atom)'
}

/**
 * 中文原文 → 英文（**扫描替换**与 `tr()` 用的那张表）
 *
 * ---------------------------------------------------------------------------
 * 为什么本模块要再有一张 text 表（已经有 MESSAGES 了）
 * ---------------------------------------------------------------------------
 * `MESSAGES` 是**键 → 文案**，只有写 `t('tool.labels')` 的地方才用得上。
 * 而本模块（以及从上游移植来的 markup）里有大量**中文原文直接写在代码/模板里**的位置：
 * 动作词汇表的 `label`/`desc`、工具的 `description`、错误信息、示例名……
 * 逐条改成 `t('key')` 会动到上百处、把移植代码的"逐字忠实"破坏掉。
 * 于是沿用本仓统一的另一条路：**中文原文 → 译文**，取值时 `tr()` 惰性查表。
 *
 * ★ 点群名与晶系名是**派生**出来的（见下面），不是手抄的 ——
 *   手抄一份会与 `groupTable.js` 漂移，而那份漂移没有任何守卫。
 */
const groupText = {}
for (const [symbol, zhName] of Object.entries(POINT_GROUP_NAMES)) {
  // EN_GROUP_NAMES 里没有的符号就跳过（宁可漏译也不要造一个假名字）
  if (zhName && EN_GROUP_NAMES[symbol]) groupText[zhName] = EN_GROUP_NAMES[symbol]
}
/** 晶系名（`POINT_GROUP_SYSTEM` 的值域只有 7 个，手写一次比派生更清楚） */
const SYSTEM_TEXT = {
  '三斜': 'Triclinic', '单斜': 'Monoclinic', '正交': 'Orthorhombic',
  '四方': 'Tetragonal', '三方': 'Trigonal', '六方': 'Hexagonal', '立方': 'Cubic',
}

export const text = Object.assign(
  {},
  groupText,
  SYSTEM_TEXT,
  {
    // ---- 结构默认标题（`createMolecule` / `createCrystal` 的兜底）----
    '分子': 'Molecule',
    '晶体': 'Crystal',

    // ---- 内置示例的显示名（与 examples-index.js 的 titleEn 一致）----
    '甲烷': 'Methane',
    '过氧化氢': 'Hydrogen peroxide',
    '苯': 'Benzene',
    '氨': 'Ammonia',
    '水': 'Water',
    '二氧化碳': 'Carbon dioxide',
    '氢氰酸': 'Hydrogen cyanide',
    '乙烯': 'Ethylene',
    '氯溴甲烷': 'Bromochloromethane',
    '(E)-1,2-二氯乙烯': '(E)-1,2-Dichloroethene',
    '三氟化硼': 'Boron trifluoride',
    '四氟化氙': 'Xenon tetrafluoride',
    '丙二烯': 'Allene (propadiene)',
    '乙烷（交叉式构象）': 'Ethane (staggered)',
    '六氟化硫': 'Sulfur hexafluoride',
    '五氟化碘': 'Iodine pentafluoride',
    '一溴一氯一氟甲烷': 'Bromochlorofluoromethane',
    '茂': 'Cyclopentadienyl anion',
    '环八硫': 'Octasulfur',
    '二茂铁': 'Ferrocene',
    '富勒烯': 'Buckminsterfullerene',
    '联苯（扭曲构象）': 'Biphenyl (twisted)',
    '内消旋酒石酸': 'meso-Tartaric acid',
    '三苯甲烷': 'Triphenylmethane',
    '三乙二胺合钴': 'Tris(ethylenediamine)cobalt',
    'NaCl（岩盐）': 'NaCl (rock salt)',
    'CsCl（氯化铯）': 'CsCl (caesium chloride)',
    // XYZ 注释行（数据，不进界面；给了英文等价值以免将来被哪个入口直接显示出来）
    '三苯甲烷 C19H16 (C3)': 'Triphenylmethane C19H16 (C3)',
    '环八硫 S8 (D4d)': 'Octasulfur S8 (D4d)',

    // ---- 特征标表的列标题 ----
    'd 轨道': 'd orbitals',
    'd, g…（偶）': 'd, g… (even)',
    'p, f…（奇）': 'p, f… (odd)',
    '连续球对称群': 'Continuous spherical symmetry group',

    // ---- 动作词汇表：label 给用户（动作气泡），desc/params/group 给模型 ----
    '切换分子': 'Switch molecule',
    '结构': 'Structure',
    '切换到指定示例分子。id 必须来自 listExamples 的返回值，不可编造。':
      'Switch to a given example molecule. The id must come from listExamples; never invent one.',
    '显示/隐藏对称元素': 'Show/hide symmetry elements',
    '显示': 'Show',
    '对称元素的**总开关**。关掉后所有轴/面/中心都不画（逐个显隐见 setElementVisible）。':
      'Master switch for symmetry elements. When off, no axis/plane/center is drawn (per-element control: setElementVisible).',
    '显示/隐藏对称元素标签': 'Show/hide symmetry element labels',
    'C₂、σv 这类文字标签的开关。讲"哪个是主轴"时打开更有用。':
      'Toggles text labels such as C₂ and σv. Useful when explaining which axis is the principal one.',
    '显示/隐藏辅助几何': 'Show/hide auxiliary geometry',
    '立方体/二面角等辅助线框——用来展示"四面体方向""二面角"这类空间关系。':
      'Auxiliary wireframes (cube / dihedral planes) for showing spatial relations such as tetrahedral directions and dihedral angles.',
    '显示/隐藏原子标签': 'Show/hide atom labels',
    '在原子球心显示元素符号。': 'Show element symbols at the centre of each atom.',
    '逐个显隐对称元素': 'Show/hide one symmetry element',
    '显示或隐藏**某一个**对称元素。key 必须来自 queryPointGroup 返回的 elements[].key':
      'Show or hide **one** symmetry element. The key must come from elements[].key returned by queryPointGroup',
    '（形如 C2#1、sigma#2），**不可编造**。讲"只留主轴"时用它逐个关掉其余的。':
      '(of the form C2#1, sigma#2) — never invent one. Use it to turn off all but the principal axis.',
    '一键全显/全隐': 'Show/hide all at once',
    '把所有对称元素一起显示或隐藏。比逐个下发省一轮。':
      'Show or hide every symmetry element at once — saves a round compared with doing it one by one.',
    '播放对称操作': 'Play symmetry operation',
    '演示': 'Demonstration',
    '把**某一个**对称元素对应的操作演出来（分子会沿该操作运动回原位）。':
      'Animate the operation of **one** symmetry element (the molecule moves along it and returns to its original position).',
    'key 必须来自 queryPointGroup 的 elements[].key。':
      'The key must come from elements[].key returned by queryPointGroup.',
    '停止动画': 'Stop animation',
    '停止正在播放的对称操作动画。': 'Stop the symmetry-operation animation that is playing.',
    '选中/取消选中原子': 'Select/deselect an atom',
    '选中某个原子后，页面会显示它的**等价原子**（能被对称操作互相映到的那些）':
      'Selecting an atom makes the page show its **equivalent atoms** (those mapped onto each other by symmetry operations)',
    '与**稳定化子**（让它保持不动的那些操作）。key 为 null 表示取消选中。':
      'and its **stabilizer** (the operations that leave it fixed). A null key deselects.',
    '原子 key 来自 queryPointGroup 或页面上点选的结果。':
      'Atom keys come from queryPointGroup or from clicking in the page.',
    '切换界面语言': 'Switch interface language',
    '外观': 'Appearance',
    '中英文切换。': 'Switch between Chinese and English.',

    // ---- 感知/痕迹里给模型的字段标签与状态串 ----
    // ★ 模块名与页面品牌名统一为「点群观鉴」（取自参赛配图；此前两处叫法不同）
    '点群观鉴': 'Point Group Explorer',
    '打开点群观鉴页面': 'Open the Point Group Explorer page',
    '点群变化': 'Point group changed',
    '对称元素开关': 'Symmetry element switch',
    '对称元素标签': 'Symmetry element labels',
    '辅助几何': 'Auxiliary geometry',
    '原子标签': 'Atom labels',
    '对称元素逐个显隐': 'Per-element visibility',
    '选中原子': 'Selected atom',
    '播放对称操作': 'Played symmetry operation',
    '播放计数': 'Playback count',
    '界面语言': 'Interface language',
    '【当前状态】模块 symmetry': '[Current state] module symmetry',
    '；点群': '; point group',
    '（未识别）': '(not identified)',
    '；对称元素': '; symmetry elements',
    '个': 'items',
    '（**当前已整体隐藏**）': '(**currently hidden as a whole**)',
    '；其中隐藏了：': '; hidden among them: ',
    '；选中原子': '; selected atom',
    '【交互】空闲': '[Interaction] idle',
    '；切换次数': '; switch count',
    '；最近动作': '; recent actions',
    '（无）': '(none)',

    // ---- 模块入口（greeting 进 DOM；roleHint 进模型上下文）----
    '我是结构化学教学智能体 · 点群观鉴': "I'm the structural chemistry teaching agent · Point Group Explorer",
    '我能识别分子与晶体的点群、列出对称元素，也能把对称操作演出来。':
      'I can identify the point group of molecules and crystals, list their symmetry elements, and act out symmetry operations.',
    '试试：': 'Try:',
    '· 「水分子是什么点群，有哪些对称元素」': '· "What point group is water, and which symmetry elements does it have?"',
    '· 「只显示主轴，然后播放这个对称操作」': '· "Show only the principal axis, then play that symmetry operation"',
    '· 「苯的 C₂′ 与 C₂″ 有什么区别」': '· "What is the difference between the C₂′ and C₂″ axes of benzene?"',
    '你正在使用**点群观鉴**模块。': 'You are working in the **Point Group Explorer** module.',
    '★ 点群符号与对称元素清单**一律用 queryPointGroup 取得**，不要凭记忆判断——':
      '★ Always obtain point-group symbols and symmetry-element lists with queryPointGroup; never decide from memory —',
    '"水是 C2v"你当然记得，但"联苯是 D2h 还是 D2d"这类正是本模块要解决的问题，':
      'you of course remember that water is C2v, but questions like "is biphenyl D2h or D2d" are exactly what this module settles,',
    '而它与你的记忆不一致时，正确的一方永远是从结构算出来的那个。':
      'and when it disagrees with your memory, the one computed from the structure is always right.',
    '讲解时常与群论概念（对称元素、共轭类、不可约表示）配合；特征标表数据在知识库里。':
      'When explaining, tie it to group-theory concepts (symmetry elements, conjugacy classes, irreducible representations); character-table data lives in the knowledge base.',
    'id 必须来自 listExamples 的返回值，不可编造。':
      'The id must come from listExamples; never invent one.',

    // ---- 工具描述（给模型）----
    '列出内置的示例分子/晶体（id、名称、化学式）。学生要分析某个结构的对称性时，':
      'List the built-in example molecules/crystals (id, name, formula). When a student wants a structure\'s symmetry,',
    '先用它拿到合法的 id——**id 必须来自本工具的返回值，不可编造**。':
      'use this first to get a valid id — **the id must come from this tool; never invent one**.',
    '识别某个结构的**点群**，并给出它全部对称元素（类型、阶数、方向）。':
      'Identify a structure\'s **point group** and list all its symmetry elements (type, order, direction).',
    '★ 若该结构是**晶体**（示例里的 NaCl / CsCl），返回的是**空间群**':
      '★ If the structure is a **crystal** (NaCl / CsCl among the examples), what comes back is a **space group**',
    '（符号、编号、晶系、点群），因为晶体的周期性与分子不是一回事。':
      '(symbol, number, crystal system, point group), because a crystal\'s periodicity is not the same thing as a molecule.',
    '返回的一切都由程序算出，直接引用即可，**不要自己判断点群或空间群**。':
      'Everything returned is computed in code — quote it directly and **never judge the point group or space group yourself**.',
    '省略 id 则用当前选中的那个。': 'Omit id to use the currently selected structure.',
    '示例 id（来自 listExamples）；省略则用当前选中的': 'Example id (from listExamples); omit to use the currently selected one',
    'id 必须来自本返回值，不可编造。': 'The id must come from this return value; never invent one.',
    '注意 kind：molecule 用点群识别，crystal（NaCl / CsCl）用空间群识别——':
      'Mind the kind: molecule goes through point-group identification, crystal (NaCl / CsCl) through space group —',
    '晶体是无限周期结构，没有分子点群，两者不是一回事。':
      'a crystal is an infinite periodic structure and has no molecular point group; the two are not the same thing.',
    '晶体走**空间群**（描述无限周期结构），而不是分子点群（描述有限的分子骨架）。':
      'For a crystal, use the **space group** (describing an infinite periodic structure), not the molecular point group (describing a finite molecular framework).',
    '空间群编号与符号由 spglib 从晶胞算出，可直接引用。':
      'The space-group number and symbol are computed by spglib from the unit cell — quote them directly.',
    '讲解时注意区分：点群是空间群去掉平移成分之后剩下的那部分。':
      'When explaining, keep the distinction: the point group is what remains of the space group after removing translations.',
    '点群符号与对称元素清单均由程序识别所得，可直接引用。':
      'Both the point-group symbol and the symmetry-element list are produced by the program — quote them directly.',
    '要让画面动起来，用 applySceneActions 下发动作，元素/原子的 key 就取上面的':
      'To make the view move, send actions with applySceneActions; take element/atom keys from the',
    'elementKeys / atoms —— **不要自己编造 key**。':
      'elementKeys / atoms above — **never invent keys**.',
    '若要向学生解释"为什么是这个点群"，可结合 elements 里各元素的类型与方向来讲。':
      'To explain "why this point group" to a student, use the type and direction of each element in elements.',

    // ---- 宿主注入要求（装配期诊断，给宿主/开发者看）----
    '晶体示例的空间群分析器 (structure) => Promise<{number, hmSymbol, pointGroup,':
      'Space-group analyser for crystal examples, (structure) => Promise<{number, hmSymbol, pointGroup,',
    'crystalSystem, pearsonSymbol, operations}>，外加可选的 operationsToElements。':
      'crystalSystem, pearsonSymbol, operations}>, plus an optional operationsToElements.',
    '★ 为什么必须是注入：实现它的 modules/symmetry/space-group.js 依赖 @spglib/moyo-wasm，':
      '★ Why it must be injected: the implementation in modules/symmetry/space-group.js depends on @spglib/moyo-wasm',
    '且用 `…moyo_wasm_bg.wasm?url` 这种 **Vite 专有的导入后缀**，在 Node 里无法静态导入。':
      'and uses the **Vite-only import suffix** `…moyo_wasm_bg.wasm?url`, which Node cannot import statically.',
    '缺省时不报错，但**晶体示例只能回"未接入"**——':
      'It does not error when absent, but **crystal examples can only answer "not wired up"** —',
    '（此前缺省的表现更糟：identify() 返回 {symbol:"ERR"}，模型会把它当成一个真的点群符号。）':
      '(the previous default was worse: identify() returned {symbol:"ERR"}, which the model took for a real point-group symbol.)',

    // ---- 动作校验里的静态错误（动态的那几条走 t()，见 facade.js）----
    'loadExample 需要 id（字符串）': 'loadExample needs id (a string)',
    '——key 必须来自 queryPointGroup 的 elements[].key，不可编造':
      '— the key must come from elements[].key returned by queryPointGroup; never invent one',
    "setLanguage 需要 lang（'zh' 或 'en'）": "setLanguage needs lang ('zh' or 'en')",
    'selectAtom 的 key 需要字符串或 null': 'selectAtom needs key to be a string or null',
    '当前没有选中的结构（先用 listExamples 挑一个）':
      'No structure is selected yet (pick one with listExamples first)',
    '本宿主未接入空间群分析器（spaceGroup），无法识别晶体的空间群。':
      'This host has no space-group analyser (spaceGroup) injected, so the crystal space group cannot be identified.',
    '★ 这**不是**"该结构没有对称性"，而是能力未接入——':
      '★ This is **not** "the structure has no symmetry" — the capability is simply not wired up —',
    '请如实告诉学生"晶体空间群识别在当前环境不可用"，不要凭记忆给一个空间群符号。':
      'Tell the student honestly that "crystal space-group identification is unavailable in this environment"; never give a space-group symbol from memory.',
    '识别失败': 'Identification failed',
    '（当前无对称元素）': '(no symmetry elements at present)',
  },
)

/**
 * 带参数的动态错误串（走键）。
 * ★ 模板串里带变量的位置**扫描替换做不到** —— "未知示例 id：benzene" 与
 *   "未知示例 id：water" 是两条不同原文，字典里列不完。所以这几条必须走 `t()`。
 */
Object.assign(MESSAGES.zh, {
  'sym.err.bool': '{name} 需要 {field}（true 或 false）',
  'sym.err.unknownExample': '未知示例 id：{id}（可用：{list} …）',
  'sym.err.unknownExampleStrict': '未知示例 id：{id}（id 必须来自 listExamples 的返回值）',
  'sym.err.noSelection': '当前没有选中的结构（先用 listExamples 挑一个，或让学生打开一个）',
  'sym.err.needKey': '{name} 需要 key（字符串），可用：{list}',
  'sym.err.unknownElementKey': '未知对称元素 key：{key}（可用：{list}）',
  'sym.err.unknownAtomKey': '未知原子 key：{key}（可用：{list}）——key 来自 queryPointGroup 的 atoms，不可编造',
  'sym.err.unsupportedAction': '当前模块不支持动作：{name}',
  'sym.err.notCrystal': '{title} 是分子，不是晶体——请用点群识别（不带 kind 的那条路）',
  'sym.err.spaceGroupFailed': '空间群分析失败：{title}',
})
Object.assign(MESSAGES.en, {
  'sym.err.bool': '{name} needs {field} (true or false)',
  'sym.err.unknownExample': 'Unknown example id: {id} (available: {list} …)',
  'sym.err.unknownExampleStrict': 'Unknown example id: {id} (the id must come from listExamples)',
  'sym.err.noSelection': 'No structure is selected yet (pick one with listExamples, or have the student open one)',
  'sym.err.needKey': '{name} needs key (a string); available: {list}',
  'sym.err.unknownElementKey': 'Unknown symmetry-element key: {key} (available: {list})',
  'sym.err.unknownAtomKey': 'Unknown atom key: {key} (available: {list}) — keys come from queryPointGroup\'s atoms; never invent one',
  'sym.err.unsupportedAction': 'This module does not support the action: {name}',
  'sym.err.notCrystal': '{title} is a molecule, not a crystal — use point-group identification (the path without kind)',
  'sym.err.spaceGroupFailed': 'Space-group analysis failed: {title}',
})

registerDict('symmetry', { zh: MESSAGES.zh, en: MESSAGES.en, text })

/**
 * 中文原文 → 当前语言译文（**惰性**：在被调用的那一刻查表）。
 * ★ 中文模式下原样返回；查不到也原样返回（缺译是覆盖率问题，交给守卫报，不该在运行时炸）。
 */
export function tr(zhText) {
  if (currentLang === 'zh') return zhText
  const hit = text[String(zhText == null ? '' : zhText)]
  return hit === undefined ? zhText : hit
}

/** 深度映射对象/数组里的字符串（键名不动 —— 键名是模型要用的字段名） */
export function trDeep(v) {
  if (typeof v === 'string') return tr(v)
  if (Array.isArray(v)) return v.map(trDeep)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v)) out[k] = trDeep(v[k])
    return out
  }
  return v
}

/** 从 localStorage 读取语言 */
function loadLang() {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return v === 'en' || v === 'zh' ? v : 'zh'
  } catch (e) {
    return 'zh'
  }
}

let currentLang = loadLang()

/** 同步 <html lang> */
function syncHtml() {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', currentLang === 'zh' ? 'zh-CN' : 'en')
}

export const i18n = {
  get lang() { return currentLang },
  setLang(lang) {
    if (lang !== currentLang) {
      currentLang = lang
      try { localStorage.setItem(LANG_KEY, lang) } catch (e) { /* ignore */ }
      syncHtml()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('langchange'))
      }
    }
  }
}

/**
 * 取当前语言文本（缺失回退 zh，再回退 key）。
 *
 * ★ 必须支持 `{name}` 占位符 —— 与 `packages/i18n` 的 `t()` **同签名**。
 *   本模块原来只有 `t(key)` 一个参数，于是"把带变量的错误串改成 t('k', {n})"之后
 *   **占位符原样留在文案里**（`未知对称元素 key：{key}（可用：{list}）`），
 *   而它不报错、只是文案变得不可读。`test-symmetry-module.mjs` 抓到了这一处。
 *
 * @param {string} key
 * @param {Object} [vars] 形如 `{ id, list }`，替换文案里的 `{id}` / `{list}`
 * @returns {string} 查不到时回退：当前语言 → zh → key
 */
export function t(key, vars) {
  if (key == null) return ''
  let s = MESSAGES[currentLang] && MESSAGES[currentLang][key] !== undefined
    ? MESSAGES[currentLang][key]
    : (MESSAGES.zh[key] !== undefined ? MESSAGES.zh[key] : key)
  if (vars && typeof s === 'string') {
    s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])))
  }
  return s
}

/** 点群名（zh 用 groupTable 中文；en 用英文映射） */
export function groupName(symbol) {
  if (!symbol) return ''
  return currentLang === 'en' ? (EN_GROUP_NAMES[symbol] || symbol) : (POINT_GROUP_NAMES[symbol] || symbol)
}

/**
 * 群符号 HTML 化（Schönflies 记号：主字母斜体、下标数字/字母正体）
 * 'C3v' → <i>C</i><sub>3v</sub>；'D∞h' → <i>D</i><sub>∞h</sub>
 */
export function formatGroupSymbol(symbol) {
  if (!symbol) return '—'
  const m = String(symbol).match(/^([A-Za-z])(.*)$/)
  if (!m) return symbol
  return `<i>${m[1]}</i><sub>${m[2]}</sub>`
}

/** 不可约表示符号 HTML 化（主字母斜体、下标正体）'E1u' → <i>E</i><sub>1u</sub> */
export function formatIrrepLabel(label) {
  const m = String(label).match(/^([A-Za-z])(.*)$/)
  if (!m) return label
  return `<i>${m[1]}</i><sub>${m[2]}</sub>`
}

/**
 * 基函数 / 对称元素里的**坐标变量斜体**（用户报：「部分该斜体的字母没有斜体，比如 z」）。
 *
 * 排版惯例（与教材一致）：
 *   · 坐标变量 **x / y / z 斜体**；旋转记号 **R 斜体**（其下标也是变量，同样斜体）
 *   · 数字、上标、括号、逗号、正负号**正体** —— `x²−y²` 里只有 x、y 斜体，`2` 与 `−` 正体
 *   · **不动**轨道符号（`s` / `d 轨道` / `p, f…（奇）`）：它们是轨道名不是坐标变量，
 *     是否斜体属学派差异，本页明确保持正体
 *
 * ★ 为什么要一个函数而不是各处手写 `<i>`：基函数串有 40 多个群、上百种组合
 *   （`z` / `x, Ry` / `(x²-y²,xy)` / `2z²-x²-y²` …），手写必漏。这里按字符类别统一处理，
 *   并且**同一页**里基函数列与对称元素框（`σᵥ(xz)`、`C₂(x)`）走同一条规则，
 *   不会再出现"同一个 x 一处斜体、一处正体"。
 *
 * ★ 返回的是 HTML：调用方必须用 `innerHTML`（原先用 textContent，所以怎么改都不生效）。
 *   输入串来自内置点群数据（字符集只有 `" ()+,-2Rdfgpsxyz²…偶奇轨道（）"`，无 `<>&`），
 *   转义只是保险。
 */
export function formatBasisFunctions(s) {
  if (s == null || s === '') return ''
  const esc = String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  // 先把 Rx/Ry/Rz 摘出来（否则 R 后面的 x/y/z 会被下面的规则单独包起来）
  const subs = []
  let t = esc.replace(/R([xyz])/g, (_, c) => { subs.push(c); return '\u0000' + (subs.length - 1) + '\u0000' })
  t = t.replace(/([xyz])/g, '<i>$1</i>')
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => '<i>R</i><sub><i>' + subs[+i] + '</i></sub>')
}

const SUB_DIGITS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' }
/** 化学式数字 → Unicode 下标（C12H10 → C₁₂H₁₀，上标 ⁻/³⁺ 保留）—— 纯文本即可显示（title/tooltip 也生效） */
export function formatFormulaU(f) {
  return String(f).replace(/(\d+)/g, d => d.split('').map(c => SUB_DIGITS[c] || c).join(''))
}

/** 遍历页面 [data-i18n] 元素填充当前语言文本 */
export function applyStaticI18n() {
  if (typeof document === 'undefined') return
  syncHtml()
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')
    const val = t(key)
    if (val !== key) el.textContent = val
  })
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title')
    const val = t(key)
    if (val !== key) el.title = val
  })
}

// 首次加载即同步 <html lang>
if (typeof window !== 'undefined') syncHtml()
