/**
 * i18n/pages.js —— 宿主侧「模块页面」（apps/web/src/pages）的中英词典
 *
 * ===========================================================================
 * 为什么这里是相对路径，而不是 `@i18n/index.js`
 * ===========================================================================
 * `@i18n` 是 **vite 的别名**，Node 不认。而覆盖率守卫（tools/check-i18n.mjs）
 * 是**在 Node 里 import 本文件**来读「哪些原文已经被登记」的 —— 用别名的话守卫
 * 一 import 就炸（只警告、不跳过），于是本区**永远显示 0 覆盖**。
 * 所以字典文件一律走相对路径。本文件必须是**纯数据**：不 import DOM、不 import
 * three、不 import 任何运行时。
 *
 * ===========================================================================
 * 三张表怎么分工（见 packages/i18n/index.js 顶部的说明）
 * ===========================================================================
 *   `text`：中文原文 → 英文。给 `sweep()` 扫 DOM 用。**本区绝大多数文案走这张表**——
 *          pages 里是上游忠实移植的模板串（orbit/symmetry 两个 markup 文件一整份
 *          就是一个模板字符串），逐条改成 `t()` 既破坏"逐字忠实"、又极易漏。
 *
 *   `zh`/`en`：键 → 文案。只给扫描替换**做不到**的那两类：
 *             ① 原文里带变量（`第 3 步`、`{n} 种`、`核电荷数 Z = 5`）；
 *             ② 字符串**不进 DOM**（`applyAction` 返回给模型的错误信息）。
 *
 * ===========================================================================
 * 本区的三个坑（写这份表时逐一踩过，留档给后来者）
 * ===========================================================================
 * ① **守卫按"字面量"切片段，运行时按"DOM 文本节点"整段匹配** —— 两者不总是同一个
 *    粒度。字符串拼接（`'甲，' + '乙。'`）在 DOM 里是**一个**文本节点，于是：
 *      · 守卫报的是两半 → 两半都要登记（否则守卫红）；
 *      · 运行时匹配的是拼起来的整句 → 整句也要登记（否则界面照旧中文）。
 *    本表里这样的"半句 + 整句"成对出现的地方都有注释标出。
 * ② 被标签切开的句子（`… 2s 在 <i>r</i> = 2<i>a</i>₀ 处有径向节点`）在 DOM 里是
 *    多个文本节点，中文的"起"这类词在英文里没有对应字 → 译成空串（见对应条目）。
 * ③ HTML 属性若**跨字面量拼接**（`'" title="' + '中文">'`），守卫的标签扫描器看不到
 *    它，会把 `" title="中文">` 这种带语法的残片当成待译原文。这类位置改为走
 *    `t('键')` —— 让守卫看得见真实原文，运行时也对。
 */
import { registerDict } from '../../../../packages/i18n/index.js'

/** 键 → 中文。★ 只放"带变量"与"不进 DOM"的那些（其余一律进 `text` 表） */
export const zh = {
  // ---- orbit 页：带变量的动态串（原文里嵌着数字/条件，扫描替换够不着） ----
  'pages.orbit.realOrbNoName': '该支壳层没有公认的惯用名，这里用角度部分的直角坐标多项式标记',
  'pages.orbit.multiAddFull': '额外的同屏轨道最多 {max} 条（现在 {n} 条）。'
    + '每一条都要真跑一遍等值面，一张十几秒，再多会把页面锁死几分钟',
  'pages.orbit.multiAddHint': '把当前这个轨道（含叠加态）加进同屏；'
    + '加完再改量子数，就能加下一个 —— 数量不限',
  'pages.orbit.vertexCount': '{n} 顶点',
  'pages.orbit.colorPickTitle': '改这个轨道的颜色（只重涂，不重建）',
  'pages.orbit.psiHint.psi2': '阈值＝占 |<i>ψ</i>|² 峰值的比例'
    + '（{cur} |<i>ψ</i>|² ⟺ {alt} |<i>ψ</i>|）',
  'pages.orbit.psiHint.psi1': '阈值＝占 |<i>ψ</i>| 峰值的比例'
    + '（{cur} |<i>ψ</i>| ⟺ {alt} |<i>ψ</i>|²）',
  'pages.orbit.psiHint.rec': '　· 本轨道推荐 <b>{rec}</b>',
  'pages.orbit.psiHint.floor': '（已到下限）',
  'pages.orbit.psiHint.adopt': '采用',
  'pages.orbit.superTitle': '叠加态 <span class="orbit-real">{n} 个分量</span>',
  'pages.orbit.superBadge': '叠加态',
  // 右上角徽标＝「视图对象 + 波函数形式」两段。中文可以拼，英文词序不同，
  // 故两两组合各出一条（而不是把两段拼起来）。
  'pages.orbit.badge.sph.real': '球谐实数解',
  'pages.orbit.badge.sph.complex': '球谐复数解',
  'pages.orbit.badge.psi.real': '空间波函数实数解',
  'pages.orbit.badge.psi.complex': '空间波函数复数解',
  'pages.orbit.zSummary': '核电荷数 <i>Z</i> = {z}',

  // ---- orbit 页：applyAction 返回给**模型**的错误信息（不进 DOM，扫描够不着） ----
  'pages.orbit.err.missingAction': '动作缺少 action 字段',
  'pages.orbit.err.unknownAction': '未知动作：{action}',
  'pages.orbit.err.threw': '动作执行异常：{message}',
  'pages.orbit.err.invalidParams': '动作参数无效或目标不存在',

  // ---- compare 页：带变量（两侧晶体名 / 模型名 / 布局方向） ----
  'pages.compare.titleOne': '{name} - 结构对比',
  'pages.compare.cpkShort': 'CPK',
  'pages.compare.cpkFill': 'CPK空间填充',
  'pages.compare.ballStickShort': '球棍',
  'pages.compare.ballStick': '球棍模型',
  'pages.compare.toVertical': '☰竖屏',
  'pages.compare.toHorizontal': '▮横屏',
  'pages.compare.syncOn': '🔗联动',
  'pages.compare.syncOff': '🔓独立',
  'pages.compare.settings': '⚙设置',
  'pages.compare.settingsCollapse': '⚙收起',
  'pages.compare.leftPanel': '左侧设置',
  'pages.compare.rightPanel': '右侧设置',
  'pages.compare.topPanel': '上侧设置',
  'pages.compare.bottomPanel': '下侧设置',

  // ---- viewer 页：晶体名的兜底文案（进了 `${meta.name || …}`，扫描够不着） ----
  'pages.viewer.crystalFallback': '晶体结构',

  // ---- symmetry 页：空间群那两行（带变量；其余文案走对称模块自己的 i18n） ----
  'pages.symmetry.spaceGroupNo': '{number} 号空间群',
  'pages.symmetry.crystalMeta': '晶系 {system} · 点群 {point}{pearson}',
}

/** 键 → 英文 */
export const en = {
  'pages.orbit.realOrbNoName': 'This subshell has no conventional name; it is labelled by the '
    + 'Cartesian polynomial of its angular part',
  'pages.orbit.multiAddFull': 'At most {max} extra orbitals on screen (currently {n}). '
    + 'Each one really runs the isosurface pipeline, about ten seconds apiece — '
    + 'more than that would freeze the page for minutes',
  'pages.orbit.multiAddHint': 'Add the current orbital (superpositions included) to the on-screen set; '
    + 'then change the quantum numbers and add the next one — no limit on the number',
  'pages.orbit.vertexCount': '{n} vertices',
  'pages.orbit.colorPickTitle': 'Change the color of this orbital (repaint only, no rebuild)',
  'pages.orbit.psiHint.psi2': 'Threshold = fraction of the |<i>ψ</i>|² peak '
    + '({cur} |<i>ψ</i>|² ⟺ {alt} |<i>ψ</i>|)',
  'pages.orbit.psiHint.psi1': 'Threshold = fraction of the |<i>ψ</i>| peak '
    + '({cur} |<i>ψ</i>| ⟺ {alt} |<i>ψ</i>|²)',
  'pages.orbit.psiHint.rec': '　· recommended for this orbital: <b>{rec}</b>',
  'pages.orbit.psiHint.floor': '(at the lower limit)',
  'pages.orbit.psiHint.adopt': 'Use it',
  'pages.orbit.superTitle': 'Superposition <span class="orbit-real">{n} components</span>',
  'pages.orbit.superBadge': 'Superposition',
  'pages.orbit.badge.sph.real': 'Spherical harmonics · real solution',
  'pages.orbit.badge.sph.complex': 'Spherical harmonics · complex solution',
  'pages.orbit.badge.psi.real': 'Spatial wavefunction · real solution',
  'pages.orbit.badge.psi.complex': 'Spatial wavefunction · complex solution',
  'pages.orbit.zSummary': 'Nuclear charge <i>Z</i> = {z}',

  'pages.orbit.err.missingAction': 'Action is missing its action field',
  'pages.orbit.err.unknownAction': 'Unknown action: {action}',
  'pages.orbit.err.threw': 'Action threw: {message}',
  'pages.orbit.err.invalidParams': 'Invalid action parameters, or the target does not exist',

  'pages.compare.titleOne': '{name} — structure comparison',
  'pages.compare.cpkShort': 'CPK',
  'pages.compare.cpkFill': 'CPK space-filling',
  'pages.compare.ballStickShort': 'ball-and-stick',
  'pages.compare.ballStick': 'ball-and-stick model',
  'pages.compare.toVertical': '☰ Portrait',
  'pages.compare.toHorizontal': '▮ Landscape',
  'pages.compare.syncOn': '🔗 Linked',
  'pages.compare.syncOff': '🔓 Independent',
  'pages.compare.settings': '⚙ Settings',
  'pages.compare.settingsCollapse': '⚙ Collapse',
  'pages.compare.leftPanel': 'Left settings',
  'pages.compare.rightPanel': 'Right settings',
  'pages.compare.topPanel': 'Top settings',
  'pages.compare.bottomPanel': 'Bottom settings',

  'pages.viewer.crystalFallback': 'Crystal structure',

  'pages.symmetry.spaceGroupNo': 'Space group No. {number}',
  'pages.symmetry.crystalMeta': 'Crystal system {system} · point group {point}{pearson}',
}

/**
 * 中文原文 → 英文（DOM 扫描替换用）。
 *
 * ★ 键必须与 DOM 里**文本节点/属性值的整段内容**逐字一致（首尾空白由运行时裁掉）。
 *   凡是"源码里被标签切开、拼起来才是一句"的位置，本表里会出现
 *   **半句（守卫视角）+ 整句（运行时视角）**两条 —— 两条都不可少，理由见文件头 ①。
 *
 * ★ 与 symmetry 模块自己的 i18n 重叠的条目（点群观鉴那一页）刻意采用**同一份英文**，
 *   避免两套真源给出两种说法。那些节点由对称模块的 `applyStaticI18n()` 填充，
 *   本表登记它们是因为守卫按"登记过"算覆盖（详见回报里"两套 i18n"一节）。
 */
export const text = {
  // ==========================================================================
  // index.js —— 晶体库列表页
  // ==========================================================================
  '全部': 'All',
  '金属晶体': 'Metallic crystals',
  '离子晶体': 'Ionic crystals',
  '共价晶体': 'Covalent crystals',
  '分子晶体': 'Molecular crystals',
  '混合键型': 'Mixed bonding',
  '卡片组件加载失败，请刷新页面重试': 'Failed to load the card component — please refresh the page',
  '晶体结构库': 'Crystal structure library',
  '正在加载晶体预览…': 'Loading crystal previews…',
  '暂无该分类的晶体数据': 'No crystal data in this category',

  // ==========================================================================
  // viewer.js —— 晶体三维查看器
  // ==========================================================================
  '立方': 'Cubic',
  '六方': 'Hexagonal',
  '四方': 'Tetragonal',
  '正交': 'Orthorhombic',
  '单斜': 'Monoclinic',
  '三斜': 'Triclinic',
  '三方': 'Trigonal',
  '加载中...': 'Loading…',
  '对比': 'Compare',
  '八面体空隙': 'Octahedral void',
  '四面体空隙': 'Tetrahedral void',

  // ==========================================================================
  // compare.js —— 并排对比页
  // ==========================================================================
  '← 返回': '← Back',
  '↺对齐视角': '↺ Align view',
  '≡对齐样式': '≡ Align style',
  // 控制条与设置面板里**留在模板里的**那两个词（其余同类文案走 t()，见 compare.js）。
  // ★ 这两条一开始漏登记了：模板里的字面量与走 t() 的那几处**同名**，
  //   于是被守卫的"zh 值遮盖"照成了绿色警告 —— 提醒恰好是对的：扫描替换不认识
  //   zh 值，英文界面下首次渲染时它们会停在中文。登记进 text 表才是真接线。
  '⚙设置': '⚙ Settings',
  '球棍': 'ball-and-stick',
  '视角已对齐': 'Views aligned',
  '样式已对齐': 'Styles aligned',
  // 设置面板（由 _renderSettings 渲染）
  '原子': 'Atoms',
  '标签': 'Labels',
  '键': 'Bonds',
  '氢键': 'H bonds',
  '轴': 'Axes',
  '体对角': 'Body diagonal',
  '面对角': 'Face diagonal',
  '点阵型式': 'Lattice type',
  '变换晶胞原点': 'Cell origin',
  '元素筛选': 'Elements',
  '显示模型': 'Model',
  '图层': 'Layers',
  '共享设置（两侧同步）': 'Shared settings (both sides in sync)',
  '裁剪': 'Clip',

  // ==========================================================================
  // orbit-markup.js —— 原子轨道页（整份是一个模板字符串）
  // ==========================================================================
  '原子轨道三维可视化': 'Atomic orbital 3D visualization',
  '实函数': 'Real function',
  '三维视图': '3D view',
  '把节面画出来：径向节面（球壳）+ 角度节面（锥面 / 平面）':
    'Draw the nodal surfaces: radial nodes (spherical shells) + angular nodes (cones / planes)',
  '◇ 节面': '◇ Nodes',
  '重置视角': 'Reset view',
  '⟳ 复位': '⟳ Reset',
  '自动旋转': 'Auto-rotate',
  '量子数 / 显示模式': 'Quantum numbers / display mode',
  '核电荷数 Z = 1': 'Nuclear charge Z = 1',
  '核电荷数': 'Nuclear charge',
  '价类氢离子（只含一个电子）写作': 'hydrogen-like ions (a single electron) are written as',
  '——\n              1 氢 H · 2 氦离子 He⁺ · 3 锂离子 Li²⁺ · 4 铍离子 Be³⁺ · 6 碳离子 C⁵⁺ … 到 36 氪离子 Kr³⁵⁺':
    '——\n              1 hydrogen H · 2 helium ion He⁺ · 3 lithium ion Li²⁺ · 4 beryllium ion Be³⁺ · '
    + '6 carbon ion C⁵⁺ … up to 36 krypton ion Kr³⁵⁺',
  // ★ 上面那条是"整段"（含前导 `——` 与换行缩进），下面这条是**同一段的那一行**。
  //   两条都要：守卫**按行**报未覆盖（它和运行时的逐行回退同粒度），而运行时先按整个
  //   文本节点查（命中上面那条就整段换掉）。少了下一条，守卫会一直红；
  //   少了上一条，英文模式下这一段会**留中文**（多行节点整段匹配失败后逐行兜底）。
  '1 氢 H · 2 氦离子 He⁺ · 3 锂离子 Li²⁺ · 4 铍离子 Be³⁺ · 6 碳离子 C⁵⁺ … 到 36 氪离子 Kr³⁵⁺':
    '1 hydrogen H · 2 helium ion He⁺ · 3 lithium ion Li²⁺ · 4 beryllium ion Be³⁺ · 6 carbon ion C⁵⁺ · … up to 36 krypton ion Kr³⁵⁺',
  '（换': '(changing',
  '只缩放径向与能级，': 'only rescales the radial part and the energies,',
  '不改轨道形状': 'does not change the orbital shape',
  '；本模块按非相对论处理，': '; this module is non-relativistic, so',
  '越大相对论效应越显著）': 'larger Z means stronger relativistic effects)',
  '主量子数': 'Principal quantum number',
  '角量子数': 'Azimuthal quantum number',
  '磁量子数': 'Magnetic quantum number',
  '实轨道': 'Real orbitals',
  '视图对象': 'View object',
  '球谐函数': 'Spherical harmonics',
  '空间波函数': 'Spatial wavefunction',
  '球谐判据': 'Spherical-harmonic criterion',
  '|² 的曲面比 |': '|² draws a surface thinner than |',
  '| 的"瘦"': '| — the textbook "slimmer" pair',
  '波函数形式': 'Wavefunction form',
  '波函数的实数解：由 ±m 两个复数解组合而来，不再是 L̂z 的本征函数；用实轨道名标记（p_x、d_xy…）':
    'Real solution of the wavefunction: formed by combining the two complex solutions ±m; no longer '
    + 'an eigenfunction of L̂z, and labelled with real-orbital names (p_x, d_xy, …)',
  '实数解': 'Real solution',
  '波函数的复数解 ψ_{n,l,m}：L̂z 与 L̂² 的共同本征函数，用磁量子数 m 标记':
    'Complex solution ψ_{n,l,m}: a simultaneous eigenfunction of L̂z and L̂², labelled by the '
    + 'magnetic quantum number m',
  '复数解': 'Complex solution',
  '轨道模型': 'Orbital model',
  '真实类氢波函数：R(r) 是拉盖尔多项式乘 e^(−Zr/n)，2s 在 r = 2a₀ 处有一个径向节点。这是氢原子的解析解，也是知识条目与题库的基准。':
    'True hydrogenic wavefunction: R(r) is a Laguerre polynomial times e^(−Zr/n); 2s has a radial '
    + 'node at r = 2a₀. This is the analytic solution for hydrogen and the reference for the '
    + 'knowledge items and the question bank.',
  '氢型': 'Hydrogenic',
  'Slater 型轨道（STO，最小基组）：R ∝ r^(n−1)·e^(−ζr)，2s 与 2p 共用同一个径向因子、**没有径向节点**，于是形状退化成纯角度分布 —— 这正是教材上那个干净的 sp³ 四瓣。计算化学用的就是这一族基函数。':
    'Slater-type orbital (STO, minimal basis): R ∝ r^(n−1)·e^(−ζr); 2s and 2p share the same radial '
    + 'factor and **have no radial node**, so the shape reduces to a purely angular distribution — '
    + 'exactly the clean four-lobed sp³ of textbooks. This is the family of basis functions used in '
    + 'computational chemistry.',
  'Slater 型': 'Slater type',
  '（空＝': '(empty =',
  '自动': 'auto',
  '碳的 2s/2p 按 Slater 规则是 1.625（本页不自动算 σ，需手工填）':
    'By Slater rules the 2s/2p of carbon give 1.625 (this page does not compute σ automatically — enter it by hand)',
  '氢型：真实类氢，2s 在': 'Hydrogenic: the true hydrogenic solution; 2s has a radial node at',
  '₀ 处有径向节点': '₀',
  '多轨道同屏': 'Multiple orbitals on screen',
  '一次只看一个量子态（默认）': 'One quantum state at a time (default)',
  '关闭': 'Off',
  '四个等价 sp³ 同屏：指向正四面体，两两夹角 109.47°':
    'Four equivalent sp³ orbitals on screen: pointing to a regular tetrahedron, 109.47° apart',
  '三个等价 sp² 同屏：共面、互成 120°': 'Three equivalent sp² orbitals on screen: coplanar, 120° apart',
  '两个等价 sp 同屏：成 180° 直线': 'Two equivalent sp orbitals on screen: a straight 180° line',
  '自定义同屏（由「＋ 加入当前轨道」进入）': 'Custom set (entered via “＋ Add current orbital”)',
  '自定义': 'Custom',
  '同屏轨道': 'Orbitals on screen',
  '＋ 加入当前轨道': '＋ Add current orbital',
  '开启后，一组等价轨道同时显示，每个一个颜色':
    'When on, a set of equivalent orbitals is shown together, each in its own color',
  '三维渲染': '3D rendering',
  '电子云': 'Electron cloud',
  '等值面': 'Isosurface',
  '等值面判据': 'Isosurface criterion',
  '画 |ψ|² 的等值面。函数处处非负，没有正负可谈 —— 曲面为纯色。':
    'Draw the isosurface of |ψ|². The function is non-negative everywhere, so there is no sign to '
    + 'show — the surface is a single color.',
  '画 ψ 本身的等值面（有正负）。实解在此双色。':
    'Draw the isosurface of ψ itself (which has a sign). Real solutions are two-colored here.',
  '等值面阈值（%）': 'Isosurface threshold (%)',
  '阈值＝占 |ψ| 峰值的比例': 'Threshold = fraction of the |ψ| peak',
  '粒子数（万）': 'Particle count (10⁴)',
  '3p 轨道 · 波函数实数解': '3p orbital · real wavefunction solution',
  '径向分布': 'Radial distribution',
  '在选中曲线上标出峰值 / 节点半径（两类可同时开）':
    'Mark peak / node radii on the selected curve (both kinds can be on at once)',
  '峰值': 'Peaks',
  '节点': 'Nodes',
  '显示的是叠加态中的': 'Showing component',
  '分量 —— 叠加态本身请看三维视图': ' of the superposition — see the 3D view for the superposition itself',
  '各曲线分别按自身峰值归一化，故看形状与峰值位置、不比绝对高度；竖线标的是选中曲线的峰值 / 节点半径（峰值实线、节点虚线）':
    'Each curve is normalized to its own peak, so compare shapes and peak positions, not absolute '
    + 'heights; the vertical lines mark the peak / node radii of the selected curve '
    + '(solid = peak, dashed = node)',
  '角度部分的两个因子': 'The two factors of the angular part',
  ')　—　左图极角自 +': ') — left plot: polar angle from +',
  '起，右图自 +': '; right plot from +',
  // ★ 中文的"起"在英文里没有对应词（前一个节点已经写成 "from +x"）——
  //   留空串而不是留一个中文孤字。运行时会把这个节点替换成空白。
  '起': '',
  '上面三维里看到的是两者相乘的结果；这里看两个因子各自长什么样':
    'The 3D view above shows the product of the two; here you can see what each factor looks like',
  '截面': 'Section',
  '显示': 'Show',
  '按该点 |ψ|² 的大小填色：越亮 = 密度越大 = 越可能在这里找到电子':
    'Colored by |ψ|² at each point: brighter = higher density = more likely to find the electron here',
  '按该点 ψ 的相位填色：实数解只有 0 与 π 两种色（即正负），复数解绕原点一周走完整圈':
    'Colored by the phase of ψ at each point: real solutions have only two colors, 0 and π (that is, '
    + 'the two signs); complex solutions sweep a full turn around the origin',
  '|ψ|² 的等高线，白线标出节面（ψ = 0）—— 最适合用来数节面':
    'Contours of |ψ|², with white lines marking the nodal surfaces (ψ = 0) — the best view for '
    + 'counting nodes',
  '等高线': 'Contours',
  '⟲ 复位缩放': '⟲ Reset zoom',
  '电子云按 |': 'The electron cloud is sampled by |',
  '|² 重要性采样（统计上即真实的电子分布）· 等值面是同一密度的等值面 · 手机 / 平板 / 桌面自适配':
    '|² importance sampling (statistically the true electron distribution) · the isosurface is a '
    + 'surface of equal density · adapts to phone / tablet / desktop',

  // ==========================================================================
  // orbit.js —— 原子轨道页的动态文案（静态的那些在页面里由扫描替换处理）
  // ==========================================================================
  // ① 拼接句：两半（守卫）+ 整句（运行时）
  '这一支壳层没有公认的惯用名（高角动量轨道在文献里只按对称性分类），':
    'This subshell has no conventional name (high-angular-momentum orbitals are classified only by '
    + 'symmetry in the literature),',
  '故用角度部分的直角坐标多项式标记。':
    'so it is labelled by the Cartesian polynomial of its angular part.',
  '这一支壳层没有公认的惯用名（高角动量轨道在文献里只按对称性分类），故用角度部分的直角坐标多项式标记。':
    'This subshell has no conventional name (high-angular-momentum orbitals are classified only by '
    + 'symmetry in the literature), so it is labelled by the Cartesian polynomial of its angular part.',
  // 球谐判据提示（innerHTML，被 <i> 切成两个文本节点）
  '= 0 时': '= 0,',
  '是常数，两个判据画出来是同一个球面。':
    'is constant, so the two criteria draw the very same sphere.',
  '判据换成平方后，节面位置不变，只是曲面整体收缩。':
    'Squaring the criterion leaves the nodal surfaces where they are; the surface just shrinks overall.',
  // 等值面判据按钮的 title（其中一条是两半拼起来的一个属性值 → 半句 + 整句）
  '画 |ψ|² 的等值面。函数处处非负，没有正负可谈 —— 曲面为**纯色**。':
    'Draw the isosurface of |ψ|². The function is non-negative everywhere, so there is no sign to '
    + 'show — the surface is **a single color**.',
  '画 |ψ| 的等值面。复函数的非平方判据是**模**，取模后相位信息消失 —— 曲面为纯色。':
    'Draw the isosurface of |ψ|. For a complex function the non-squared criterion is the **modulus**; '
    + 'taking the modulus discards the phase — the surface is a single color.',
  '画 ψ 本身的等值面（有正负）。实解在此**双色**（按 ψ 的正负），':
    'Draw the isosurface of ψ itself (which has a sign). Real solutions are **two-colored** here '
    + '(by the sign of ψ),',
  '径向与角度节点的符号翻转都会显示出来。':
    'and the sign flips at radial and angular nodes are both visible.',
  '画 ψ 本身的等值面（有正负）。实解在此**双色**（按 ψ 的正负），径向与角度节点的符号翻转都会显示出来。':
    'Draw the isosurface of ψ itself (which has a sign). Real solutions are **two-colored** here '
    + '(by the sign of ψ), and the sign flips at radial and angular nodes are both visible.',
  // 轨道模型提示（innerHTML）
  '氢型：真实类氢（拉盖尔多项式）。2s 在':
    'Hydrogenic: the true hydrogenic solution (Laguerre polynomials). 2s has a radial node at',
  'Slater 型：': 'Slater type:',
  '，2s 与 2p 径向相同、无节点；': ', 2s and 2p share the same radial part and have no node;',
  '（手工）': '(entered by hand)',
  // 多轨道同屏的四条提示（innerHTML，含 <b>/<i>，按文本节点登记）
  '四个等价': 'Four equivalent',
  '³：指向': '³: pointing to',
  '正四面体': 'a regular tetrahedron',
  '，两两 109.47°': ', 109.47° apart',
  '三个等价': 'Three equivalent',
  '共面': 'coplanar',
  '、互成 120°': ', 120° apart',
  '两个等价': 'Two equivalent',
  '：成': ' orbitals forming a',
  '直线型': 'straight line',
  '自定义同屏：点「＋ 加入当前轨道」把此刻这个轨道（':
    'Custom set: click “＋ Add current orbital” to pin this very orbital (',
  '纯态或叠加态都行': 'an eigenstate or a superposition, either is fine',
  // ★ 这两条是同一个句子：守卫看到的是去掉行首"）"的半句，DOM 里是带"）"的整节点
  '钉进画面，再改量子数继续加 ——': 'into the view, then change the quantum numbers and keep adding —',
  '）钉进画面，再改量子数继续加 ——': 'into the view, then change the quantum numbers and keep adding —',
  '数量不限': 'no limit on the number',
  '，每行都能单独改色与显隐': ', and each row can be recolored and hidden independently',
  // 氢型下 sp³ 的提示条
  '氢型下四个瓣会叠成球状 ——': 'In the hydrogenic model the four lobes overlap into a ball —',
  '切到 Slater 型': 'switch to the Slater type',
  '形状最干净。': 'for the cleanest shape.',
  // 同屏清单的行内文案
  '生成中…': 'Building…',
  '点一下：显示 / 隐藏这个轨道': 'Click to show / hide this orbital',
  '叠加态': 'Superposition',
  '单一本征态': 'Single eigenstate',
  // 同屏轨道清单里的三个角色徽标。
  // ★ 原先是「主 / 克隆 / 独立」—— 用户明确说"看不懂"（那是实现视角的词）。
  //   改成自解释的说法；`主` 这种**单字全局键**本身也脆弱（任何地方的"主"都会命中）。
  '主面': 'Main',
  '旋转副本': 'Rotated copy',
  '独立面': 'Separate',
  '主面：正在编辑的那一个，不可移除': 'Main face: the one being edited; cannot be removed',
  '旋转副本：由主面整体旋转得到，几乎瞬间完成': 'Rotated copy: the main face rotated as a whole; appears almost instantly',
  '独立面：单独算出来的一张等值面': 'Separate face: an isosurface computed on its own',
  '未生成（当前阈值下抽不出曲面）': 'Not generated (no surface at this isovalue)',
  // 「自定义」档的按钮与提示（2026-10-05 把该档位从隐藏改为可见）
  '自定义同屏：点进来是空清单，再逐个「＋ 加入当前轨道」':
    'Custom side-by-side: you start with an empty list; add orbitals one by one with "+ Add current orbital"',
  '钉进画面，再改量子数继续加（': 'into the scene, then change the quantum numbers and keep adding (',
  '最多 12 条': 'at most 12',
  '），每行都能单独改色与显隐': '); each row can have its own colour and visibility',
  '从同屏里移除': 'Remove from the on-screen set',
  '轨道': 'Orbital',
  // 截面图的"叠加态"下拉项（整段是一个 option 文本）
  '叠加态 ψ = Σcᵢψᵢ': 'Superposition ψ = Σcᵢψᵢ',

  // ==========================================================================
  // symmetry-markup.js —— 点群观鉴页（整份是一个模板字符串）
  //
  // ★ 这一页**另有一套自己的 i18n**（modules/symmetry/i18n/index.js，data-i18n 属性 +
  //   applyStaticI18n）。带 data-i18n 的节点运行时由**那一套**填充，这里登记同一份原文
  //   是给守卫看的（守卫按"登记过"算覆盖）；英文刻意与那一套**逐字一致**，
  //   免得同一个词出现两种说法。
  // ==========================================================================
  '点群观鉴': 'Point Group Viewer',
  '选择示例': 'Choose example',
  // 下面两条在被 HTML 注释掉的"导入文件"块里（功能已注释，元素不存在于 DOM）。
  // 仍然登记：万一将来恢复该功能，译文已经就位；登记本身对运行时没有任何影响。
  '导入 XYZ / GJF / XSD / CIF / POSCAR 文件': 'Import an XYZ / GJF / XSD / CIF / POSCAR file',
  '📂 导入文件': '📂 Import file',
  '对称元素': 'Symmetry elements',
  '显示当前结构的辅助几何参考（立方体/二面角矩形），部分结构支持':
    'Show auxiliary reference geometry (cube/dihedral planes), where supported',
  '辅助几何': 'Aux geometry',
  '在原子球心显示元素符号标签': 'Show element symbols at the atom centers',
  '原子标签': 'Atom labels',
  '自定义外观与颜色': 'Customize appearance & colors',
  '设置': 'Settings',
  '原子轨道 / 稳定化子': 'Atomic orbitals / stabilizer',
  '外观设置': 'Appearance',
  '语言': 'Language',
  // ★ 语言名用**本族语**（endonym）：与壳里那条"中文"同一个约定 ——
  //   英文界面里"简体中文"仍写作「简体中文」，用户在切换前才认得要点哪个。
  '简体中文': '简体中文',
  '背景色': 'Background',
  '原子缩放': 'Atomic scale',
  '键粗细': 'Bond radius',
  '对称元素大小': 'Symmetry element size',
  '标签字号': 'Label font size',
  '旋转角速度（°/s）': 'Rotation speed (°/s)',
  '反映/反演时长（ms）': 'Reflection/inversion duration (ms)',
  '元素颜色': 'Element colors',
  '对称元素颜色': 'Symmetry element colors',
  '恢复默认设置': 'Restore defaults',
  '左键拖动旋转 · 右键拖动平移 · 滚轮缩放 · 双击复位':
    'Drag to rotate · Right-drag to pan · Wheel to zoom · Double-click to reset',
  '动画进度': 'Animation progress',
  '播放/暂停': 'Play/Pause',
  '逆变换': 'Inverse operation',
  '再次操作': 'Apply again',
  '重置变换': 'Reset transform',
  '关闭动画': 'Close animation',

  // ==========================================================================
  // symmetry.js —— 点群观鉴页的动态文案
  // ==========================================================================
  // 信息面板的空标题兜底（正常路径下由示例库的 title/titleEn 提供）
  '分子': 'Molecule',
  '晶体': 'Crystal',
}

/**
 * **快照标量串里的数据标记**（不是界面文案，运行时一个字都不翻）。
 *
 * 出处：`apps/web/src/pages/orbit.js` 的 `orbitalItems`（写）与 `parseOrbitalItems`（读）——
 * `key|名字|可见|颜色|类型` 用 `;`/`|` 连成**一条顶层标量**给感知层。其中
 * 「可见」与「类型」两栏的值就是下面这几个词。
 *
 * ★ 为什么**不**放进 `text` 表：那张表的语义是"这个中文会以文本节点出现在 DOM 上，
 *   sweep 会把它换掉"。这几个词只活在快照字符串里，进 `text` 等于谎报——
 *   而且 `显示`/`隐藏`/`项` 是很泛的词，一旦扫到 DOM 上别的同名节点会被误翻。
 * ★ 为什么不改成 ASCII：那是**数据格式变更**——已经存下来的快照（「上一步」回退、
 *   学情痕迹）会因此解析错（旧值 `隐藏` 与新比较值 `hidden` 不相等 → 隐藏项被读成可见）。
 *   这属于另一个改动，不该由一次翻译顺手做掉。
 * ★ 登记在这里，是让守卫**看得见**"这几条是有意保留的中文"，而不是漏译。
 *   守卫的口径是"出现在本模块的任何导出里即算已登记"（tools/check-i18n.mjs 的 flat()）。
 */
export const dataTokens = {
  zh: {
    'pages.orbit.token.hidden': '隐藏',
    'pages.orbit.token.shown': '显示',
    'pages.orbit.token.superPrefix': '叠加',
    'pages.orbit.token.superSuffix': '项',
    'pages.orbit.token.pure': '纯态',
  },
  en: {
    // 仅供人读：这些值运行时不会被用到，写出来是说明它们的含义
    'pages.orbit.token.hidden': 'hidden (snapshot token)',
    'pages.orbit.token.shown': 'shown (snapshot token)',
    'pages.orbit.token.superPrefix': 'superposition-of (snapshot token prefix)',
    'pages.orbit.token.superSuffix': 'terms (snapshot token suffix)',
    'pages.orbit.token.pure': 'eigenstate (snapshot token)',
  },
}

registerDict('pages', { zh, en, text })
