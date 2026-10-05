/**
 * i18n.js（orbit 模块）—— 原子轨道模块的中英词典
 *
 * ---------------------------------------------------------------------------
 * 为什么这里是相对路径，而不是 `@i18n/index.js`
 * ---------------------------------------------------------------------------
 * `@i18n` 是 **vite 的别名**，Node 不认。而覆盖率守卫（`tools/check-i18n.mjs`）
 * 是**在 Node 里 import 本文件**来读"哪些原文已经被登记"的 —— 用别名的话守卫
 * 一 import 就炸（报"读不了字典"），而它只会警告后跳过，于是这块**永远显示 0 覆盖**。
 * 所以字典文件一律走相对路径。
 *
 * 本文件必须是**纯数据**：不 import DOM、不 import three、不 import 任何运行时。
 *
 * ---------------------------------------------------------------------------
 * 三张表的分工（见 packages/i18n/index.js 顶部的说明）
 * ---------------------------------------------------------------------------
 *   `text`：中文原文 → 英文。给 `sweep()` 扫 DOM 用。**键必须是 DOM 里某个文本节点
 *          或 title/placeholder/aria-label/alt 的整段内容**（首尾空白会被忽略）。
 *           判据：这段字符串是不是"原样被赋给 textContent / 写在 innerHTML 的标签之间
 *           / 赋给 title 一类属性"？是 → 进这张表，源码一个字节都不用改。
 *   `zh`/`en`：键 → 文案。给两种扫描替换做不到的情形：
 *           ① 文案里带变量（`第 3 步` 与 `第 4 步` 是两条不同原文，列不完）；
 *           ② 字符串**不进 DOM**（发给模型的工具说明、错误信息、提示词）；
 *           ③ 虽然进 DOM，但**被二次加工过**（经 markdown/KaTeX 渲染、拼在画布上、
 *              与变量拼接）—— 扫描替换只认"整段就是这一句"，加工过就匹配不上。
 *
 * ---------------------------------------------------------------------------
 * ★ 本模块为什么大量使用 ② 与 ③，而不是一律走 `text` 表
 * ---------------------------------------------------------------------------
 * 三个理由是实测出来的，不是偏好：
 *   · **画布上的字不是 DOM 文本节点**（charts.js 用 `ctx.fillText` 画坐标轴与图例）——
 *     扫描替换够不着，只能画的时候现取译文。
 *   · **经 `mdInline()` 渲染过的文案会被拆散**（`**加粗**` 变 `<b>`、`$…$` 变 KaTeX），
 *     DOM 里根本没有"整段就是这一句"的文本节点 —— 把整段登记进 `text` 表会**静默失效**。
 *   · **给模型的文案不进 DOM**（工具说明、动作 desc、错误信息），登记进 `text` 表
 *     等于自欺：守卫绿了，模型拿到的还是中文。
 *
 * `render3d / charts / chart-overlay / state-editor / reference-table` 这些移植代码里
 * 靠 `text` 表覆盖的位置，**一个字节都没动**；改过的地方都是上面那三类。
 */
import { registerDict } from '../../packages/i18n/index.js'

/**
 * 中文原文 → 英文（DOM 扫描替换用）。
 * ★ 键必须与 DOM 里**文本节点/属性值的整段内容**逐字一致（首尾空白会被忽略）。
 */
export const text = {
  // ---- 动作标签（面板的动作气泡；LAKELS 与 VOCAB.label 都用这些短标签）----
  '重算': 'Recompute',
  '恢复状态': 'Restore state',
  '设置量子数': 'Set quantum numbers',
  '设置核电荷': 'Set nuclear charge',
  '实/复轨道': 'Real/complex orbital',
  '渲染模式': 'Render mode',
  '阈值判据': 'Threshold criterion',
  '等值面阈值': 'Isosurface level',
  '粒子数': 'Particle count',
  '角度分布': 'Angular distribution',
  '视图目标': 'View target',
  '截面': 'Section',
  '截面显示': 'Section display',
  '径向曲线': 'Radial curves',
  '自动旋转': 'Auto-rotate',
  '径向标注': 'Radial marks',
  '复位视角': 'Reset camera',
  '复位截面': 'Reset section view',
  '公式高亮': 'Formula highlight',
  '设置叠加态': 'Set superposition',
  '清除叠加态': 'Clear superposition',
  '图表对象': 'Chart term',
  '相对相位': 'Relative phase',
  '放大图表讲解': 'Focus chart',
  '径向环联动': 'Link radial to 3D',
  '扫描等值面阈值': 'Sweep isosurface level',
  '轨道模型（氢型/Slater）': 'Orbital model (hydrogenic/Slater)',
  '多轨道同屏': 'Multiple orbitals',
  '改同屏轨道的颜色/显隐': 'Recolor/hide a shown orbital',
  '收起全部同屏轨道': 'Hide all extra orbitals',

  // ---- 面板空态的开场白（index.js 的 greeting，按标签切段进 DOM）----
  '我是结构化学教学智能体 · 原子轨道': "I'm the structural chemistry teaching agent · Atomic orbitals",
  '我能读出当前的量子数与画法，也能把轨道摆到你面前。':
    'I can read the current quantum numbers and drawing mode, and put the orbital in front of you.',
  '试试：': 'Try:',
  '· 「4p 有几个径向节面，各在多少 a₀」':
    '· “How many radial nodes does 4p have, and at which a₀?”',
  '· 「把 m 改成 1，切到复函数」': '· “Set m to 1 and switch to the complex solution”',
  '· 「sp³ 的四个轨道为什么指向正四面体」':
    '· “Why do the four sp³ orbitals point to a tetrahedron?”',

  // ---- 参考表弹层（reference-table.js 的 innerHTML 静态段）----
  '教材对照表': 'Textbook reference tables',
  'R 表': 'R table',
  'Y 表': 'Y table',
  '本仓库未包含这两张表格图片': 'This repository does not ship these two table images',
  '请查阅结构化学教材中对应的': 'See the corresponding table in a structural chemistry textbook:',
  '本项目参照的书目见仓库 README 的「参考书目」章节。':
    'The bibliography this project follows is listed in the repository README.',

  // ---- 态编辑器（state-editor.js）：纯 textContent / 属性赋值、未被二次加工的那些 ----
  '纯态 ψ(n,l,m)': 'Eigenstate ψ(n,l,m)',
  '自定义预设（点右侧 ✕ 可删除）': 'Custom preset (click ✕ on the right to delete)',
  '＋ 存为预设': '＋ Save as preset',
  '把当前叠加态存成一个按钮': 'Save the current superposition as a button',
  '当前为单一本征态 ψ(n,l,m)，用上方量子数滑块调节。选一个预设即可进入叠加态。':
    'Currently a single eigenstate ψ(n,l,m) — adjust it with the quantum-number sliders above. '
    + 'Pick a preset to enter a superposition.',
  '主量子数 n': 'Principal quantum number n',
  '角量子数 l': 'Azimuthal quantum number l',
  '解型': 'Solution type',
  '轨道 / m': 'Orbital / m',
  '复': 'C',
  '实': 'R',
  '系数': 'Coefficient',
  '+ 添加态': '+ Add term',
  '相对相位 φ（单位 π）': 'Relative phase φ (in units of π)',
  '手动输入（单位 π，0–2）': 'Manual input (in units of π, 0–2)',
  '力学量（解析式计算）': 'Observables (analytic)',
  '有确定值': 'definite',
  '无确定值': 'not definite',
  '含实解 → ±|m| 各半': 'contains real terms → ±|m| split evenly',
  '是否定态': 'Stationary?',
  '谱': 'spectrum',
  '是（各分量能量简并）': 'yes (all terms are degenerate)',
  '否（能量不同 → 密度随时间变）': 'no (different energies → density changes with time)',
  '当前是单一本征态：先选一个预设或构造叠加态，再存为预设':
    'Currently a single eigenstate — pick a preset or build a superposition first, then save it as a preset',
  '预设名（回车保存）': 'Preset name (Enter to save)',
  '进阶：量子态（叠加 / 杂化 / 力学量）':
    'Advanced: quantum states (superposition / hybridization / observables)',

  // ===========================================================================
  // core/ 的文案（纯计算层的**输出**：错因处方、形状描述、力学量 note、题库）
  // ===========================================================================
  // ★ 为什么这些也进 `text` 表：它们**没有变量、本身就是整句**，只是最终出现的位置
  //   不是 DOM 文本节点（进模型上下文 / 进 `#formulaNote` 的 innerHTML / 被
  //   markdown+KaTeX 拆开）。所以源码里保留中文原文、在取值处过 `t(原文)` ——
  //   运行时的 `t()` 有一条"原文即键"的回退，查的就是这张表（见 packages/i18n）。
  //   ⚠ 多行的整句**必须整条登记**（含 \n）：`tsrc()` 只做「整段」与「去首尾空白」
  //     两次查找，不做逐行回退（逐行回退只在 DOM 扫描 `sweep()` 里有）。

  // ---- core/error-diagnosis.js：错因诊断处方（cause / label / speech / avoid / followUp）----
  'E1 概念混淆': 'E1 Conceptual confusion',
  '混淆了「概率幅最大」与「概率最大」':
    'Conflating "largest probability amplitude" with "largest probability"',
  '先不急着说答案。我把 R(r) 和 D(r) 画在同一张图上了——你看它们的峰顶是不是不在同一个位置？再想想：球壳的体积随半径怎么变？':
    'Let us not rush to the answer. I have drawn R(r) and D(r) on the same plot — do you see that their peaks are not at the same place? Now think again: how does the volume of a spherical shell change with radius?',
  '不要直接说出正确答案；不要一次给出全部解释。':
    'Do not state the correct answer directly; do not give the whole explanation at once.',
  '要不要我把这个半径对应的一层"球壳"在三维里标出来？':
    'Shall I mark the shell at that radius in the 3D view?',
  'E2 公式误用': 'E2 Misuse of a formula',
  '节点计数公式记错（径向 / 角 / 总数的混淆）':
    'Node-counting formula misremembered (radial / angular / total mixed up)',
  '我把等值面阈值降下来，你看这个"套娃"结构——每两层壳之间就是一层径向节点。数一数有几层？对照公式 n−l−1 看看。':
    'I lower the isosurface threshold, and you can see the "nesting doll" structure — between every two shells lies one radial node. Count the shells and check against the formula n−l−1.',
  '不要只说"公式是 n−l−1"，要让学生**数出来**。':
    'Do not just say "the formula is n−l−1"; make the student **count** them.',
  '那角度节面呢？换个平面看看。':
    'And the angular nodal surfaces? Switch to another plane and look.',
  'E3 空间想象错误': 'E3 Spatial-imagination error',
  '把角度节面一律当成平面（忽略了锥面）':
    'Treating every angular nodal surface as a plane (ignoring the cones)',
  '我打开等高线和角度节面高亮。注意看节面的形状——它是平的一个面，还是绕着 z 轴转出来的一圈？':
    'I turn on the contours and the angular-node highlight. Look at the shape of the nodal surface — is it a flat plane, or a ring swept out around the z axis?',
  '不要用"锥面"这个词直接提示，先让学生描述看到的形状。':
    'Do not hint with the word "cone"; let the student describe the shape they see first.',
  '想想 P_l^{|m|}(cosθ)=0 解出来的 θ 是常数还是 φ 是常数？':
    'Think: when P_l^{|m|}(cosθ)=0 is solved, is θ constant or is φ constant?',
  '把 |ψ| 与 |ψ|² 的百分比读数混为一谈':
    'Conflating the percentage readings of |ψ| and |ψ|²',
  '我先把判据切到 |ψ|²、阈值设成 9%，再切成 |ψ| 看看——同一个曲面，两种读法。它们是什么关系？':
    'First I switch the criterion to |ψ|² with the threshold at 9%, then switch to |ψ| — the same surface, two readings. What is the relation between them?',
  '不要直接给出平方关系，让学生从两次读数自己推。':
    'Do not give the squared relation directly; let the student infer it from the two readings.',
  '所以同一读数下，按哪个判据得到的曲面更大？':
    'So for the same reading, which criterion gives the larger surface?',
  '把实轨道与复轨道当成两种不同的物理':
    'Treating real and complex orbitals as two different physics',
  '你看，切到复函数时密度是个环，切回实函数变成两个瓣。但它们的**能量**变了吗？想想为什么能量不变，形状却变了。':
    'Look: in the complex solution the density is a ring, and back in the real solution it becomes two lobes. But did their **energy** change? Think about why the shape changes while the energy does not.',
  '不要直接说"线性组合"，先让学生注意到能量没变这个事实。':
    'Do not say "linear combination" right away; first let the student notice that the energy did not change.',
  '既然能量一样，它们的任意组合是不是也是合法状态？':
    'Since the energies are equal, is any combination of them also a legal state?',
  '需要进一步确认学生的推理路径':
    "The student's reasoning path needs further checking",
  '先说说你是怎么想的？我想知道你推到哪一步觉得不对。':
    'Tell me how you were thinking first? I want to know at which step it stopped making sense to you.',
  '在了解学生思路前不要给任何提示。':
    "Give no hint before you understand the student's reasoning.",
  '请按 speech 的语气引导，并执行 actions；**不要直接说出正确答案**。':
    'Guide in the tone of speech and execute the actions; **do not state the correct answer directly**.',

  // ---- core/formula.js：公式卡片的标题与说明（进 #formulaNote 的 innerHTML）----
  '空间波函数实数解': 'real solution of the spatial wavefunction',
  '空间波函数复数解': 'complex solution of the spatial wavefunction',
  '1s：球对称，概率密度随半径单调衰减；没有径向节点。':
    '1s: spherically symmetric, the probability density falls off monotonically with radius; no radial nodes.',
  '（f 这七个名是惯例用法，各书用字略有出入。）':
    '(These seven f names are conventional usage, and the wording differs slightly from book to book.)',

  // ---- core/math.js：shapeDescribe 的形状名（经 queryOrbital 进模型上下文）----
  '球形': 'spherical',
  '各向同性（密度与 θ、φ 都无关）':
    'isotropic (the density is independent of both θ and φ)',
  '绕 z 轴旋转对称（密度与 φ 无关）':
    'axially symmetric about the z axis (the density is independent of φ)',
  '沿 z 轴': 'along the z axis',
  '环形（赤道环）': 'a ring (equatorial ring)',
  '哑铃形（双瓣）': 'dumbbell (two lobes)',
  '三瓣形': 'three-lobed',
  '四叶草形': 'four-lobed (clover)',
  '六瓣形': 'six-lobed',
  '八瓣形': 'eight-lobed',
  '哑铃形（双瓣）+ 赤道环': 'dumbbell (two lobes) + equatorial ring',
  '哑铃形（双瓣）+ 两个同轴环': 'dumbbell (two lobes) + two coaxial rings',

  // ---- core/observables.js：力学量的 note ----
  '维里定理：⟨T⟩ = −⟨E⟩，⟨V⟩ = 2⟨E⟩': 'Virial theorem: ⟨T⟩ = −⟨E⟩, ⟨V⟩ = 2⟨E⟩',
  'l=0 时角动量为零，夹角无定义':
    'for l=0 the angular momentum is zero, so the angle is undefined',
  '叠加态至少需要一项': 'a superposition needs at least one term',
  '各分量能量简并 → 能量有确定值，且态仍是定态':
    'all terms are degenerate in energy → the energy has a definite value and the state is still stationary',
  '各分量能量不同 → 能量无确定值（非定态）':
    'the terms have different energies → the energy has no definite value (not stationary)',
  '各分量 l 相同 → L² 有确定值': 'all terms have the same l → L² has a definite value',
  '各分量 l 不同 → L² 无确定值': 'the terms have different l → L² has no definite value',
  '含**实数解**分量（m≠0）：实解不是 L̂z 的本征函数，它在 L_z 谱上贡献 ±|m| 各 1/2，所以这类态的 ⟨L_z⟩ 恒为 0、L_z 也没有确定值。':
    'contains a **real** solution term (m≠0): a real solution is not an eigenfunction of L̂z — it contributes ±|m| with probability 1/2 each to the L_z spectrum, so such a state always has ⟨L_z⟩ = 0 and no definite L_z either.',
  '各分量 m 相同 → L_z 有确定值': 'all terms have the same m → L_z has a definite value',
  '各分量 m 不同 → L_z 无确定值，只能给谱分布与平均值':
    'the terms have different m → L_z has no definite value; only the spectrum and the mean can be given',
  '测量假设：测得本征值 a 的概率 = 对应系数模方之和；仅当所有分量本征值相同时该量才有确定值。★ L_z 的本征函数是**复数解** —— 实数解（m≠0）由 ±m 两个复解组合而来，不是它的本征函数。':
    'Measurement postulate: the probability of measuring an eigenvalue a equals the sum of the squared moduli of the corresponding coefficients; the quantity has a definite value only when all terms share the same eigenvalue. ★ The eigenfunctions of L_z are the **complex** solutions — a real solution (m≠0) is built from the two complex solutions ±m and is not an eigenfunction of it.',

  // ---- core/question-engine.js：不含变量的题干 / 选项 / 解析 / 反馈 ----
  '对 **1s** 轨道，电子出现概率最大的半径是？（单位 a₀）':
    'For the **1s** orbital, what is the most probable radius of the electron? (in a₀)',
  '0（原子核处）': '0 (at the nucleus)',
  '无限远': 'infinity',
  '1s 的 D(r) = r²R² 峰值在 **r = 1 a₀**。常见的错选是「0」——因为 R(r) 确实在原点最大，但球壳体积 ∝ r²，两者相乘后原点处为零。':
    'The peak of D(r) = r²R² for 1s is at **r = 1 a₀**. A common wrong choice is "0" — R(r) really is largest at the origin, but the shell volume is ∝ r², so their product vanishes there.',
  '没有角度节面': 'no angular nodal surfaces',
  'R(r) 的最大值出现在 r = 0，但概率最大的半径不是 0':
    'The maximum of R(r) is at r = 0, but the most probable radius is not 0',
  'R(r) 与 D(r) 的峰值半径总是相同':
    'R(r) and D(r) always peak at the same radius',
  'D(r) 的最大值一定在 r = 0': 'the maximum of D(r) is always at r = 0',
  '概率最大的半径与 n 无关': 'the most probable radius does not depend on n',
  'R(r) 在原点最大（对 l=0），但 D(r) = r²R² 含球壳体积因子 r²，其峰值在 **r ≈ n²a₀**。\n★ "概率幅最大"与"概率最大"是两件事。':
    'R(r) is largest at the origin (for l=0), but D(r) = r²R² contains the shell-volume factor r², so its peak is at **r ≈ n²a₀**.\n★ "largest amplitude" and "largest probability" are two different things.',
  '某氢原子波函数有 **一个径向节面**、**两个角度节面**。不查表，它的主量子数 n 与角量子数 l 分别是？':
    'A certain hydrogen wavefunction has **one radial nodal surface** and **two angular nodal surfaces**. Without looking anything up, what are its principal quantum number n and azimuthal quantum number l?',
  '径向节面数 = n − l − 1，角度节面数 = l。\n由角度节面 2 个 ⇒ **l = 2**；代回 n − 2 − 1 = 1 ⇒ **n = 4**。\n★ 所以该态是 **4d**。检验：总节点数 = n − 1 = 3，与 1 + 2 = 3 一致。':
    'radial nodal surfaces = n − l − 1, angular nodal surfaces = l.\nTwo angular nodal surfaces ⇒ **l = 2**; substituting back, n − 2 − 1 = 1 ⇒ **n = 4**.\n★ So the state is **4d**. Check: total nodes = n − 1 = 3, consistent with 1 + 2 = 3.',
  '**复函数**下轨道的密度为什么绕 z 轴对称？':
    'Why is the density of a **complex** solution axially symmetric about z?',
  '因为 |e^{imφ}| = 1，相位因子取模后消失':
    'because |e^{imφ}| = 1 — the phase factor disappears when the modulus is taken',
  '因为电子在绕 z 轴旋转':
    'because the electron is physically rotating about the z axis',
  '因为复函数的 l 更小': 'because a complex solution has a smaller l',
  '因为复函数没有角度节面': 'because a complex solution has no angular nodal surfaces',
  '|Y_l^m|² = N²·P²·|e^{imφ}|² = N²·P²，与 φ 无关 → 绕 z 轴旋转对称。\n实函数含 cos(mφ)/sin(mφ)，取模后仍依赖 φ → 呈定向的瓣。':
    '|Y_l^m|² = N²·P²·|e^{imφ}|² = N²·P², independent of φ → axially symmetric about z.\nA real function contains cos(mφ)/sin(mφ), which still depends on φ after taking the modulus → directed lobes.',
  '未能生成变式题': 'could not generate a variant question',
  '讲解时请按条目顺序组织，并配套 applySceneActions 把关键结论"演示"出来，而不是只念文字。':
    'When explaining, follow the order of the entries and use applySceneActions to **demonstrate** the key conclusions instead of only reading them out.',

  // ---- 费曼复述的**关键词**（匹配数据：要和学生自己打的字比）----
  // ★ 这些词是拿 `indexOf` 去比学生复述原文的，所以英文模式下必须换成英文词，
  //   否则英文复述会"一个要点都命中不了"（表现为复述不合格，且不报错）。
  'r方': 'r squared',
  '体积': 'volume',
  '球壳': 'spherical shell',
  '峰值': 'peak',
  '密度': 'density',
  '概率': 'probability',
  '节点': 'node',
  '节面': 'nodal surface',
  '径向': 'radial',
  '角': 'angular',
  '简并': 'degenerate',
  '能量相同': 'same energy',
  '同能量': 'same energy',
  '组合': 'combination',
  '叠加': 'superposition',
  '线性': 'linear',
  '相位': 'phase',
  '轴对称': 'axially symmetric',
  '符号': 'sign',
  '干涉': 'interference',
  '成键': 'bonding',
  '反键': 'antibonding',
  '增强': 'reinforce',
  '抵消': 'cancel',
  '定态': 'stationary state',
  '不随时间': 'does not change with time',
  '随时间': 'with time',
  '模方': 'squared modulus',
  '复述覆盖了全部关键概念，可判定掌握。':
    'The retell covers all the key concepts; mastery can be judged as achieved.',
  '复述缺少部分关键概念，请针对缺失项追问（不要直接说出答案）。':
    'The retell is missing some key concepts; follow up on the missing ones (do not state the answer directly).',
  '选择要练习的知识点：': 'Choose a knowledge point to practise:',
  '我懂了，出题吧 →': 'Got it, give me a question →',
  '出题中…': 'Generating…',
  '题目不存在': 'no such question',
  '✓ 答对了': '✓ Correct',
  '✗ 不对': '✗ Not quite',
  '去看结构 →': 'Show me the structure →',
  '已切换到对应结构（观察状态已预置）':
    'Switched to the corresponding structure (the viewing state is preset)',
}

/** 键 → 中文（带参数、或经二次加工、或根本不进 DOM 的那些） */
export const zh = {
  // ---- 标识 ----
  // ★ 与 descriptor 的 title 保持一致（取自参赛配图：轨道视界 / 点群观鉴 / 晶典在线）
  'orbit.title': '轨道视界',

  // ---- 模块提示词（给模型，不进 DOM；整段一条键）----
  'orbit.roleHint': [
    '你正在使用**原子轨道**模块。',
    '★ 一切数值（节点数、径向峰位、能级、简并度、力学量）**必须用 queryOrbital 取得**，',
    '  不要凭记忆或口算——"3d 有几个节面"你当然答得出，但"5g 的径向节点半径是多少"',
    '  正是本模块要解决的问题，而它与你的记忆不一致时，正确的一方永远是从结构算出来的那个。',
    '演示优先：能用 setQuantumNumbers / setIsosurfaceLevel / setSectionPlane 讲清楚的，',
    '  就不要只用文字描述。化学约定 **z 轴是量化轴**——讲角度节面时先说清这一点。',
    '讲实轨道与复轨道的区别时，切到球谐档（setViewTarget: spherical）；',
    '  讲"角度分布的 Y 与 Y² 差在哪"时用 setAngularView。',
    '★ 叠加态（setSuperposition）的教学要点是 |ψ|² 里的**干涉项**——它与"概率简单相加"的本质区别。',
    'id 必须来自工具返回值，不可编造。',
  ].join('\n'),

  // ---- 动作分组（给模型看的词汇表）----
  'orbit.group.state': '电子态',
  'orbit.group.threeD': '三维',
  'orbit.group.twoD': '二维',
  'orbit.group.formula': '公式',
  'orbit.group.super': '叠加态',
  'orbit.group.internal': '内部',

  // ---- 门面（facade.js）：错误信息与紧凑快照都进模型上下文 ----
  'orbit.facade.notOnPage': '当前不在原子轨道页面——请先打开该页面再操作',
  'orbit.facade.actionFailed': '动作执行失败',
  'orbit.facade.routeOpen': '打开原子轨道页面',
  'orbit.facade.noStateToRestore': '没有可还原的状态',
  'orbit.facade.notOnPageShort': '当前不在原子轨道页面',
  'orbit.facade.restoreFailed': '还原失败',
  'orbit.facade.detached': '（未附着页面）',
  'orbit.facade.compactHead': '【当前状态】模块 orbit · 轨道',
  'orbit.facade.view': '；视图',
  'orbit.facade.render': '；渲染',
  'orbit.facade.superTerms': '；**叠加态 {n} 个分量**',
  'orbit.facade.slaterZeta': '；**Slater 型（STO）**径向 ζ={zeta}',
  'orbit.facade.slaterNoZeta': '；**Slater 型（STO）**径向（ζ=Z/n）',
  'orbit.facade.hydrogenic': '；氢型（真实类氢）径向',
  'orbit.facade.multi': '；**多轨道同屏 {set}**（{shown}/{count} 个可见，每个一个颜色，与叠加态无关）',
  'orbit.facade.idle': '【交互】空闲',
  'orbit.facade.toggles': '；切换次数',
  'orbit.facade.recent': '；最近动作',
  'orbit.facade.none': '（无）',
  // 感知层的字段标签（进痕迹，模型读）
  'orbit.field.n': '切换主量子数',
  'orbit.field.l': '切换角量子数',
  'orbit.field.m': '切换磁量子数',
  'orbit.field.nuclearCharge': '调整核电荷',
  'orbit.field.viewTarget': '切换视图目标',
  'orbit.field.wavefunction': '实轨道/复轨道',
  'orbit.field.render': '切换渲染模式',
  'orbit.field.psiCriterion': '切换阈值判据',
  'orbit.field.levelFraction': '调整等值面阈值',
  'orbit.field.pointCount': '调整粒子数',
  'orbit.field.plane': '切换截面',
  'orbit.field.sectionMode': '切换截面显示',
  'orbit.field.angularWhich': '切换角度分布函数',
  'orbit.field.radial': '切换径向曲线',
  'orbit.field.isSuperposition': '叠加态变化',
  'orbit.field.relPhase': '调整相对相位',
  'orbit.field.chartTerm': '切换图表对象',
  'orbit.field.orbitalModel': '切换轨道模型',
  'orbit.field.orbitalSet': '切换多轨道同屏',
  'orbit.field.orbitalItems': '改动同屏轨道的颜色/显隐',
  'orbit.field.orbitalBuilding': '同屏轨道仍在生成',

  // ---- 宿主依赖清单（host-requirements.js）：装配期报给宿主的降级说明 ----
  'orbit.host.quiz': '出题引擎。缺省时 generateQuestion / 判分 / 错因诊断那 8 个 teach 类工具'
    + '**如实为空**——descriptor 里也相应地把它们放在 plannedTools。',
  'orbit.host.diagnosis': '错因诊断（通常给 core/error-diagnosis.js 的实例）。缺省时 diagnoseError 不存在。',
  'orbit.host.mastery': '掌握度模型。缺省时 updateMastery / 推荐不存在。'
    + '★ 注意它自身还需要一个 storageKey（见 modules/orbit/store/mastery.js 的 configure），'
    + '存储命名空间**必须由宿主注入**，没有缺省值。',
  'orbit.host.skills': '技能目录。费曼复述的入口要用它取评分要点；缺省时费曼类工具不存在。',

  // ---- 学情（store/mastery.js）----
  'orbit.kp.K1': '量子数与轨道命名',
  'orbit.kp.K2': '波函数与分离变量',
  'orbit.kp.K3': '径向函数辨析 R/R²/D',
  'orbit.kp.K4': '角度分布与轨道形状',
  'orbit.kp.K5': '节面与节点计数',
  'orbit.kp.K6': '波函数的实数解与复数解',
  'orbit.kp.K7': '相位与符号',
  'orbit.kp.K8': '概率诠释与 |ψ|²',
  'orbit.kp.K9': '叠加态 / 杂化 / 力学量',
  'orbit.kp.unknown': '未知知识点：{kp}',
  'orbit.kp.mastered': '已掌握',
  'orbit.kp.learning': '学习中',
  'orbit.kp.review': '待巩固',
  'orbit.kp.untouched': '未接触',
  'orbit.mastery.recommendNote': '优先推荐掌握度最低且与当前轨道关联度高的知识点',

  // ---- 动作 desc（给模型看的词汇表；**不进常驻上下文**，由 listSceneActions 按需下发）----
  'orbit.act.setQuantumNumbers.desc':
    '设置主量子数 n / 角量子数 l / 磁量子数 m。指定的量子数会被自动夹紧到合法范围'
    + '（l ≤ n−1、|m| ≤ l）。**给了任一量子数即意味着"要看这个单一本征态"**，会自动退出叠加态。',
  'orbit.act.setNuclearCharge.desc':
    '设置核电荷数 Z（1..36，类氢离子）。★ 与量子数不同，换 Z **不退出**叠加态。',
  'orbit.act.setWavefunctionMode.desc':
    '实轨道（real，方向性明确，教学常用）或复轨道（complex，m 是好量子数）。',
  'orbit.act.setRenderMode.desc':
    '粒子云（points，按 |ψ|² 重要性采样）或等值面（surface，同密度的曲面）。',
  'orbit.act.setPsiCriterion.desc':
    '等值面/粒子云按哪个量取阈值：|ψ|²（psi2，密度）或 |ψ|（psi，幅度）。',
  'orbit.act.setOrbitalModel.desc':
    '切换**径向函数**：hydrogenic = 真实类氢（默认；2s 在 r≈2a₀ 有径向节点，'
    + '所以 sp³ 的等值面外层干涉反向、形状与教材插图不同）；'
    + 'slater = Slater 型（STO；径向形式 r^(n−1)e^(−ζr)，2s 与 2p 共用、无径向节点，'
    + '于是 sp³ 退化成纯角度形状 = 教材那个干净的定向瓣）。'
    + '两者都是真实的物理模型，切换本身就是一课。'
    + '★ zeta 可选：省略则 ζ = Z/n；想用 Slater 规则给出的值就直接填（碳的 2s/2p 是 1.625）。',
  'orbit.act.setOrbitals.desc':
    '把**多个各自独立**的轨道同时画出来，每个一个颜色、可逐个开关。三条用法：\n'
    + '① **预设等价组**：`set` 取 sp3/sp2/sp 之一（sp³ 四个指向正四面体、'
    + '两两 109.47°；sp² 三个共面、120°；sp 两个成 180°），'
    + '`visible` 给要显示的下标（0 起，省略＝全显示；只想留一个看形状就写 [0]）。\n'
    + '② **把当前这个轨道加进去**：`add: true`。先设好一个轨道（滑块的纯态，'
    + '或叠加态都行）→ add → 再设下一个 → 再 add；**数量不限**，'
    + '每加一次画面上就多一张独立的面。\n'
    + '③ **一次给一批**：`items` 给一个数组，每一项可写 n/l/m（纯态）'
    + '或 terms（叠加态，形如 [{n,l,m,mode,c}]），另可带 color（"#rrggbb"）、'
    + 'label、visible。\n'
    + 'set 取 off 关闭。\n'
    + '★ 与叠加态是两回事：叠加态是**一个**态由多项组成，干涉项是物理的一部分，'
    + '只能画成**一个**面；这里是场景里挂 N 个各自独立的态，N 个面。',
  'orbit.act.setOrbitalStyle.desc':
    '改**某一个已经在同屏里**的轨道的颜色或显隐。key 取自快照的 orbitalItems 字段'
    + '（形如 `orb-2`；主轨道是 `__main__`）。'
    + '★ 这条**不重建几何**（只重涂顶点色），所以是瞬时生效的；'
    + '要加轨道 / 换轨道请用 setOrbitals。',
  'orbit.act.clearOrbitals.desc':
    '把所有**额外**同屏轨道收起来，只留当前正在编辑的那一个（等于关掉同屏）。',
  'orbit.act.setIsosurfaceLevel.desc':
    '等值面取在峰值的哪个比例上（0..1 的比值，内部走对数刻度）。'
    + '**不指定时程序会按轨道给推荐值**；一旦显式指定，此后换轨道不再套推荐值。',
  'orbit.act.setParticleCount.desc':
    '粒子云的采样点数（8000..80000）。点数越多越细腻，也越吃性能。',
  'orbit.act.setAngularView.desc':
    '角度分布图画的是 Y（球谐本身）或 Y²（概率密度）。',
  'orbit.act.setViewTarget.desc':
    '主三维视图画什么：spherical = 球谐曲面（角度部分），wave = 完整波函数（电子云/等值面）。'
    + '★ 切到球谐档会收起量子态入口（叠加态只对完整波函数有意义）。',
  'orbit.act.setSectionPlane.desc':
    '截面图取哪个坐标面：xy / xz / yz（化学约定 z 为量化轴，xz 面最常用来讲"角度节面"）。',
  'orbit.act.setSectionMode.desc':
    '截面图画什么：intensity（|ψ|² 强度）/ phase（相位，正负用颜色区分）/ contour（等值线）。',
  'orbit.act.showRadial.desc':
    '径向图显示哪几条曲线（**多选**）：R（径向波函数，有正负）、R²（径向概率密度）、'
    + 'D = r²R²（径向分布函数，讲"电子最常出现在哪"用它）。至少保留一条，否则图表空白。',
  'orbit.act.setRadialMarks.desc':
    '在径向图上标出 peak（峰值）或 zeros（节点）。**feature 可为数组**（两者同屏）；'
    + '传 null 表示清除标注。标的线**只画在当前可见的曲线**上。',
  'orbit.act.setAutoRotate.desc':
    '三维视图是否自动旋转。讲"这个轨道长什么样"时开着，方便学生看清整体形状。',
  'orbit.act.resetCamera.desc': '相机回到初始朝向与距离。',
  'orbit.act.resetSectionView.desc':
    '截面图的缩放与平移回到初始（等同图表角上那个「复位缩放」小控件）。',
  'orbit.act.setFormulaHighlight.desc':
    '按项高亮公式（R 径向 / Y 角度 / L 拉盖尔 / P 关联勒让德 / N 归一化）。'
    + '这是三维—公式—图表三向联动的中枢：讲哪一项就点亮哪一项。传 null 取消高亮。',
  'orbit.act.setSuperposition.desc':
    '把电子态设为若干本征态的线性组合。terms 是数组，每项 {n,l,m,c:{re,im}}（c 缺省为 1）。'
    + '★ 教学要点：叠加态 |ψ|² 里**有干涉项**，这正是它与"概率简单相加"的本质区别。',
  'orbit.act.clearSuperposition.desc': '回到单一本征态。',
  'orbit.act.setChartTerm.desc':
    '二维图表画叠加态的哪一份：\'super\' = 整体（**只有截面图支持**），数字 = 第 i 个分量（从 0 起）。',
  'orbit.act.linkRadialTo3D.desc':
    '在三维视图里画一个半径 = `radius`（a₀）的参考环，用来把"径向分布图上的某个半径"'
    + '**落到画面上的位置**。讲"这个峰在离核多远"时用它把二维读数与三维尺度对上。'
    + '传 0 表示清除。',
  'orbit.act.focusChart.desc':
    '把页面底部那张图放大到**浮窗**里讲（径向分布 / 截面密度 / 角度分布），'
    + '`none` 表示关掉浮窗。★ 讲底部图表时**先用它**——否则图在页面下方、'
    + '而讲解在别处，学生看不到你在说哪张。'
    + '还要注意顺序：**先换轨道、再 focusChart**；浮窗放大的是"当前"那张图。',
  'orbit.act.animateIsosurfaceLevel.desc':
    '把等值面阈值从 from 平滑推过到 to（各取 0.003..0.8 的比值）。'
    + '★ 这是讲"同心壳层"的核心手法：阈值一路降下去，内层壳依次冒出来。'
    + '**但要在截面图里讲**——三维是实体渲染，外层壳会把内层整个包住，'
    + '降阈值只会让颜色变、形状看上去还是同一个球。',
  'orbit.act.setRelPhase.desc':
    '叠加态分量的相对相位（弧度）。改变它会让干涉图样旋转/变形——是"相位是物理的"最直观的演示。',
  'orbit.act.restoreState.desc':
    '写回一整套快照（供分镜的「上一步」回退）。**不经用户通路**，是严格可逆的还原。',
  'orbit.act.recomputeOnly.desc':
    '只重算重绘，不改任何参数（叠加态系数/相位变化后触发一次）。',

  // ---- 动作 params（同样是给模型的取值域描述）----
  'orbit.act.setOrbitalModel.param.zeta': '（可选）正数',
  'orbit.act.setOrbitals.param.visible': '（可选）下标数组，如 [0,2]；省略＝全部',
  'orbit.act.setOrbitals.param.add': '（可选）true = 把当前正在编辑的轨道加进同屏',
  'orbit.act.setOrbitals.param.items': '（可选）任意轨道的数组，每项 {n,l,m,mode} 或 {terms:[…]}，'
    + '可带 color/label/visible',
  'orbit.act.setOrbitalStyle.param.key': '轨道 key（见快照 orbitalItems）',
  'orbit.act.setOrbitalStyle.param.color': '（可选）"#rrggbb" 或 [r,g,b]（0..1）',
  'orbit.act.setOrbitalStyle.param.visible': '（可选）true/false',
  'orbit.act.setParticleCount.param.count': '8000..80000（1000 的倍数）',
  'orbit.act.showRadial.param.which': '数组，元素 ∈ {list}',
  'orbit.act.setRadialMarks.param.feature': 'peak|zeros 或其数组|null',
  'orbit.act.setRadialMarks.param.target': 'R|R2|D|ALL（缺省 ALL）',
  'orbit.act.setChartTerm.param.term': 'super|整数下标',
  'orbit.act.linkRadialTo3D.param.radius': '0..200（a₀），0 表示清除',
  'orbit.act.animateIsosurfaceLevel.param.durationMs': '300..6000，缺省 1200',
  'orbit.act.setRelPhase.param.phase': '弧度数值',
  'orbit.act.restoreState.param.state': '快照对象',

  // ---- 动作参数校验的错误信息（回灌给模型，让它下一步能改对）----
  'orbit.act.err.enum': '{name} 的 {key} 只能是 {allowed}，收到 {v}',
  'orbit.act.err.int': 'setQuantumNumbers 的 {k} 必须是整数，收到 {v}',
  'orbit.act.err.negative': 'setQuantumNumbers 的 {k} 不能为负',
  'orbit.act.err.qnNeedsOne': 'setQuantumNumbers 至少要给 n / l / m 其中之一',
  'orbit.act.err.nRange': 'n 只能是 {lo}..{hi}，收到 {v}',
  'orbit.act.err.lRange': 'l 必须 ≤ n−1（n={n} 时 l ≤ {max}），收到 l={l}',
  'orbit.act.err.mRange': '|m| 必须 ≤ l（l={l} 时 |m| ≤ {l}），收到 m={m}',
  'orbit.act.err.zNeeded': 'setNuclearCharge 需要 Z',
  'orbit.act.err.zInt': 'Z 必须是整数，收到 {v}',
  'orbit.act.err.zRange': 'Z 只能是 {lo}..{hi}，收到 {v}',
  'orbit.act.err.zeta': 'setOrbitalModel 的 zeta 需要 (0, 20] 的正数'
    + '（省略则用 Z/n；碳的 2s/2p 标准值是 1.625）',
  'orbit.act.err.addOnlyTrue': 'setOrbitals 的 add 只接受 true（要把当前轨道加进去）',
  'orbit.act.err.labelEmpty': 'setOrbitals 的 label 要是非空字符串',
  'orbit.act.err.visibleArray': 'setOrbitals 的 visible 要么省略，要么是下标数组，如 [0,2]',
  'orbit.act.err.setMissingDef': '内部不一致：{setId} 在枚举里但取不到定义',
  'orbit.act.err.visibleShape': 'setOrbitals 的 visible 要是下标数组（{label} 有 {count} 个，'
    + '如 [0,2]）；只想留一个就写 [0]',
  'orbit.act.err.visibleOutOfRange': '{label} 只有 {count} 个等价轨道，下标要在 0..{max}；'
    + '收到越界的 {bad}',
  'orbit.act.err.visibleEmpty': '{label} 至少要留一个轨道可见；要全关请用 set:\'off\'',
  'orbit.act.err.fractionNeeded': 'setIsosurfaceLevel 需要 fraction（0..1 的比值）',
  'orbit.act.err.fractionRange': 'fraction 只能是 (0, 1] 内的数，收到 {v}',
  'orbit.act.err.countInt': 'setParticleCount 需要整数 count',
  'orbit.act.err.countRange': 'count 只能是 {lo}..{hi}，收到 {v}',
  'orbit.act.err.radialEnum': '径向曲线只能是 {allowed}，收到 {bad}',
  'orbit.act.err.markEnum': '标注只能是 {allowed}，收到 {bad}',
  'orbit.act.err.formulaEnum': '公式高亮只能是 {allowed} 或 null，收到 {v}',
  'orbit.act.err.termsEmpty': 'setSuperposition 需要非空的 terms 数组',
  'orbit.act.err.termsInt': 'terms 的每一项都要有整数 n / l / m，收到 {v}',
  'orbit.act.err.termsN': 'terms 里的 n 只能是 1..{max}，收到 {v}',
  'orbit.act.err.termsL': 'terms 里必须 l ≤ n−1（n={n}），收到 l={l}',
  'orbit.act.err.termsM': 'terms 里必须 |m| ≤ l（l={l}），收到 m={m}',
  'orbit.act.err.chartTerm': 'setChartTerm 的 term 只能是 \'super\' 或非负整数，收到 {v}',
  'orbit.act.err.radius': 'linkRadialTo3D 的 radius 只能是 0..200（a₀），收到 {v}',
  'orbit.act.err.focusTarget': 'focusChart 的 target 只能是 radial / section / thetaPhi / none，收到 {v}',
  'orbit.act.err.animNumbers': 'animateIsosurfaceLevel 需要数值 from 与 to（0.003..0.8 的比值）',
  'orbit.act.err.animRange': 'from/to 只能在 0.003..0.8，收到 {from} → {to}',
  'orbit.act.err.animDuration': 'durationMs 只能是 300..6000，收到 {v}',
  'orbit.act.err.phase': 'setRelPhase 需要数值 phase，收到 {v}',
  'orbit.act.err.styleKey': 'setOrbitalStyle 需要一个 key（取自快照的 orbitalItems 字段，'
    + '形如 orb-2；主轨道是 __main__）',
  'orbit.act.err.styleVisible': 'setOrbitalStyle 的 visible 要是 true/false',
  'orbit.act.err.styleNeedsOne': 'setOrbitalStyle 至少要给一项：color 或 visible'
    + '（只想关掉全部同屏请用 setOrbitals({set:"off"})）',
  'orbit.act.err.clearOrbitalsArgs': 'clearOrbitals 不接受参数（收到：{extra}）',
  'orbit.act.err.restoreNeedsState': 'restoreState 需要 state 对象',
  'orbit.act.err.unknownAction': 'orbit 模块不支持动作：{name}',
  'orbit.act.err.pickNeeded': '{name} 需要 {key}（{allowed}）',
  'orbit.act.err.colorTriple': 'color 数组要是三个 0..1 的数，如 [0.88, 0.63, 0.25]（收到 {v}）',
  'orbit.act.err.colorHex': 'color 要是 "#rrggbb" 形式（收到 {v}），'
    + '例如 "#e0a040"；也可以给 [r,g,b] 三个 0..1 的数',
  'orbit.act.err.colorType': 'color 要是 "#rrggbb" 字符串或 [r,g,b] 数组',
  'orbit.act.err.nlmInt': '{where} 的 {k} 要是 {lo}..{hi} 的整数（收到 {v}）',
  'orbit.act.err.nlmL': '{where}：l 必须 ≤ n−1（收到 n={n}、l={l}）',
  'orbit.act.err.nlmM': '{where}：|m| 必须 ≤ l（收到 l={l}、m={m}）',
  'orbit.act.err.itemsEmpty': 'setOrbitals 的 items 要是**非空**数组；每一项给 {n,l,m}（纯态）'
    + '或 {terms:[…]}（叠加态），可带 color/label/visible',
  'orbit.act.err.itemsTooMany': '同屏轨道最多 {max} 条（收到 {n}）。'
    + '每一条都要真跑一遍等值面，条数太多会把页面锁死几分钟；'
    + '教学场景里 4 条（sp³）已经够用。',
  'orbit.act.err.itemObject': '{where} 要是对象',
  'orbit.act.err.itemTermsMany': '{where}.terms 最多 8 项（收到 {n}）',
  'orbit.act.err.itemMode': '{where}.terms[{i}].mode 要是 {allowed}',
  'orbit.act.err.itemComplex': '{where}.terms[{i}].c 要是 {re, im} 两个有限数',
  'orbit.act.err.itemModeTop': '{where}.mode 要是 {allowed}',
  'orbit.act.err.itemLabel': '{where}.label 要是非空字符串',
  'orbit.act.err.itemVisible': '{where}.visible 要是 true/false',

  // ---- 态编辑器（state-editor.js）：带变量、或经 mdInline 渲染过的那些 ----
  'orbit.se.preset.pure.note':
    '单一本征态（定态）。叠加态编辑器的"原点"——任何时候都可回到这里。',
  'orbit.se.preset.degenerate.note':
    '同 n 同 l → 能量**简并** → 组合态**仍是定态**：密度是静态干涉图样，不随时间变化。',
  'orbit.se.preset.nonStationary.note':
    '能量**不同** → 非定态：密度随时间"呼吸"。★ 动画参数是**相对相位**而非真实时间'
    + '（ΔE≈10.2 eV ⇒ ν≈2.5×10¹⁵ Hz，不可可视化）。',
  'orbit.se.preset.twoP.note':
    '同 n 同 l → 简并 → 定态。两个正交的 p 轨道组合出**斜向的瓣**——杂化轨道的雏形。',
  'orbit.se.preset.sp3-1.note':
    '$\\psi = \\frac{1}{2}(s + p_x + p_y + p_z)$。四个 sp³ 完全等价，指向**正四面体**，两两夹角 109.5°。',
  'orbit.se.preset.sp3-2.note':
    '$\\psi = \\frac{1}{2}(s + p_x - p_y - p_z)$。与 sp³-1 等价且正交，指向另一个顶点。',
  'orbit.se.preset.sp3-3.note':
    '$\\psi = \\frac{1}{2}(s - p_x + p_y - p_z)$。与 sp³-1 等价且正交，指向第三个顶点。',
  'orbit.se.preset.sp3-4.note':
    '$\\psi = \\frac{1}{2}(s - p_x - p_y + p_z)$。与 sp³-1 等价且正交，指向第四个顶点。',
  'orbit.se.preset.sp2-1.note':
    '$\\psi = \\frac{1}{\\sqrt{3}}\\,s + \\sqrt{\\frac{2}{3}}\\,p_x$。三个等价轨道之一，**120° 共面**。',
  'orbit.se.preset.sp2-2.note':
    '$\\psi = \\frac{1}{\\sqrt{3}}\\,s - \\frac{1}{\\sqrt{6}}\\,p_x + \\frac{1}{\\sqrt{2}}\\,p_y$。'
    + '由 sp²-1 绕 $z$ 轴转 120° 得到。',
  'orbit.se.preset.sp2-3.note':
    '$\\psi = \\frac{1}{\\sqrt{3}}\\,s - \\frac{1}{\\sqrt{6}}\\,p_x - \\frac{1}{\\sqrt{2}}\\,p_y$。'
    + '由 sp²-1 绕 $z$ 轴转 240° 得到。',
  'orbit.se.preset.sp-1.note':
    '$\\psi = \\frac{1}{\\sqrt{2}}(s + p_z)$。两个等价轨道之一，**180°** 直线型。',
  'orbit.se.preset.sp-2.note':
    '$\\psi = \\frac{1}{\\sqrt{2}}(s - p_z)$。另一个 sp 轨道，与 sp-1 正交、恰好反向。',
  'orbit.se.deleteTitle': '删除「{label}」',
  'orbit.se.realOrbitalTitle': '实轨道（该支壳层的 {n} 个实轨道之一）',
  'orbit.se.magneticTitle': '磁量子数 m',
  'orbit.se.presetNotFound': '未找到预设：{key}',
  'orbit.se.presetCustomOnly': '内置预设不可删除（只允许删自定义预设）',
  'orbit.se.unknownPreset': '未知预设：{key}',
  'orbit.se.loaded': '已载入：{label}',
  'orbit.se.customNote': '自定义预设（{n} 个分量）',
  'orbit.se.noTerms': '当前没有叠加态分量，无法存为预设',
  'orbit.se.customDefault': '自定义态',
  'orbit.se.normHint':
    '系数按 $\\sum_i |c_i|^2 = 1$ **等比归一化**（本程序基组正交归一，故只需这一条），'
    + '因此**只有比值有物理意义**：把某项填成 0.35，落库可能是 0.37（其余项会同比例缩放），'
    + '这是归一化的必然结果。',
  'orbit.se.phaseNote':
    '$\\varphi = (E_i - E_j)\\,t/\\hbar$ 是**相对相位**，不是真实时间。'
    + '真实振荡频率约 $10^{15}$ Hz 无法可视化，而干涉图样只依赖相对相位。',
  'orbit.se.modeTipComplex':
    '该分量为**复数解**（L̂z 的本征函数，用 m 标记）—— 点击改为实数解',
  'orbit.se.modeTipReal':
    '该分量为**实数解**（不是 L̂z 的本征函数，用实轨道名标记）—— 点击改为复数解',
  'orbit.se.modeTitle':
    '该分量取波函数的实数解还是复数解。**逐项可选** —— 所以"全实""全复""实复混合"三种都表达得出来。',
  'orbit.se.pickTitle':
    '复数解用磁量子数 m 标记（m 是 L̂z 的本征值指标，对它才有意义）；'
    + '实数解用实轨道名标记（实解不是 L̂z 的本征函数，m 对它没有意义）。',
  'orbit.se.ampTitle':
    '该分量的系数（本模块只填正实数；虚部与项间相位用下面的「相对相位」表达）',

  // ---- 参考表（reference-table.js）：note 与 alt 是在 show() 里现赋的值 ----
  'orbit.reftable.R.title': '表 2.2.4　函数 R_{n,l}(r)',
  'orbit.reftable.R.note': '含核电荷 Z 的显式闭式：R₁₀ / R₂₀ / R₂₁ / R₃₀ / R₃₁ / R₃₂',
  'orbit.reftable.Y.title': '表 2.2.3　函数 Y(θ,φ) 的解',
  'orbit.reftable.Y.note': '复球谐 Y_l^m 与实球谐（Y_{p_z} / Y_{d_z²} / Y_{d_xz} …）对照',

  // ---- 图表浮窗（chart-overlay.js）----
  'orbit.overlay.title.radial': '径向分布',
  'orbit.overlay.title.section': '截面密度',
  'orbit.overlay.title.thetaPhi': '角度部分的两个因子',
  'orbit.overlay.minimize': '最小化 / 展开（只留标题栏）',
  'orbit.overlay.close': '关闭（Esc）',

  // ---- 二维图表（charts.js）：**画布上的字不是 DOM 文本节点**，扫描替换够不着 ----
  'orbit.chart.normalized': '归一化值',
  'orbit.chart.plane.xy': '*xy* 平面',
  'orbit.chart.plane.xz': '*xz* 平面',
  'orbit.chart.plane.yz': '*yz* 平面',
  'orbit.chart.nodalPlane': '本平面为节面 · |*ψ*|² ≈ 0',
  'orbit.chart.contourTitle': '等高线 |*ψ*|² · 白线 = 节面 (*ψ* = 0)',
  'orbit.chart.isoLine': '虚线 = 当前等值面（{pct}% 峰值）',
  'orbit.chart.nodalPlaneShort': '本平面为节面',
  'orbit.chart.phaseArg': '相位 arg *ψ*',
  'orbit.chart.max': '最大',
  'orbit.chart.maxDensity': '|*ψ*|² 最大 {v}',

  // ---- 三维视图（render3d.js）：错误信息回灌给模型；chip 文字在 DOM 上但带变量 ----
  'orbit.r3d.multiLabel': '轨道 {n}',
  'orbit.r3d.err.noMulti': '当前没有开启多轨道同屏',
  'orbit.r3d.err.noSpec': '缺少轨道描述',
  'orbit.r3d.err.duplicate': '已经有这个轨道了：{key}',
  'orbit.r3d.err.noSuchOrbital': '没有这个轨道：{key}（可用：{list}）',
  'orbit.r3d.err.mainNotRemovable': '主轨道不能移除；要收起全部请用 setOrbitals({set:"off"})',
  'orbit.r3d.err.building': '这一张正在生成中，等它建完再移除（界面上会显示"生成中…"）',
  'orbit.r3d.err.itemsEmpty': 'items 必须是非空数组',
  'orbit.r3d.err.unknownSet': '未知的轨道集合 {setId}（可用：{list}）',
  'orbit.r3d.err.colorTriple': 'color 必须是 0..1 的三元数组',
  'orbit.r3d.chip.removeHint': '点击移除该标注',
  'orbit.r3d.chip.ring': '参考球 r = {r} a₀  ✕',
  'orbit.r3d.chip.radialNodes': '径向节面 ×{n}',
  'orbit.r3d.chip.angularNodes': '角度节面 ×{n}',
  'orbit.r3d.chip.noNodes': '本轨道没有节面',
  'orbit.r3d.chip.highlighted': '{parts}高亮',

  // ---- 工具层（tools.js）：工具说明与参数说明都**进模型上下文**，错误信息也是 ----
  'orbit.tool.queryOrbital.desc':
    '查询轨道的确定性事实（数值一律由程序计算，不得自行口算）。'
    + 'kind 取值：nodes=节点数；radialZeros=径向节点半径；radialPeaks=径向分布峰值半径；'
    + 'angularNodes=角度节面几何；energy=能级(eV)；degeneracy=简并度；'
    + 'normalization=归一化系数；shape=形状描述；compare=两个轨道对比；'
    + 'observables=力学量总览；meanR=平均半径等；angleToZ=角动量与 z 轴夹角；'
    + 'energySplit=能级分解；hybrids=杂化轨道集合（sp³/sp²/sp）的方向、杂化成分与两两夹角。',
  'orbit.tool.queryOrbital.p.n': '主量子数 1-6',
  'orbit.tool.queryOrbital.p.l': '角量子数 0..n-1',
  'orbit.tool.queryOrbital.p.m': '磁量子数 -l..l',
  'orbit.tool.queryOrbital.p.mode': '波函数形式，默认 real',
  'orbit.tool.queryOrbital.p.a': 'kind=compare 时的第一个轨道 {n,l,m}',
  'orbit.tool.queryOrbital.p.b': 'kind=compare 时的第二个轨道 {n,l,m}',
  'orbit.tool.queryOrbital.p.set': 'kind=hybrids 时限定集合，省略则全部返回',
  'orbit.tool.err.needNL': '需要 n 与 l',
  'orbit.tool.err.needN': '需要 n',
  'orbit.tool.err.needNLM': '需要 n、l、m',
  'orbit.tool.err.needLM': '需要 l 与 m',
  'orbit.tool.err.needAB': '需要 a 与 b 两个轨道对象',
  'orbit.tool.err.unknownKind': '未知 kind：{kind}',
  'orbit.tool.err.unknownHybridSet': '未知的杂化集合 {only}（可用：{list}）',
  'orbit.tool.note.nodes': '径向节点 = n-l-1，角度节面 = l，总数 = n-1（全部由程序计算）',
  'orbit.tool.note.radialPeaks': 'D(r)=r²R² 的局部极大（可能有多个）',
  'orbit.tool.note.angularNodes': 'cones 为以 z 轴为轴的锥面（给出半顶角）；planes 为过 z 轴的平面（给出方位角）',
  'orbit.tool.note.normalization': '归一化系数由 formula.js 计算并已显示在公式区',
  'orbit.tool.note.observables': '全部由解析式给出（长度单位 a₀，角动量单位 ħ）',
  'orbit.tool.formula.meanR': '⟨r⟩ = (a₀/2)[3n² − l(l+1)]；⟨1/r⟩ = 1/(n²a₀)（与 l 无关）',
  'orbit.tool.note.meanR': '⟨r⟩ 是对全空间加权的平均距离，比"概率最大半径"(≈n²a₀) 小',
  'orbit.tool.note.angleToZ': '常见错误是用 cosθ = m/l（分母应为 √(l(l+1))）',
  'orbit.tool.generateQuestion.desc':
    '针对某个知识点出一道题。返回的题目**不含答案**——判定与解析由本地完成，你无法看到答案，也不要猜测。',
  'orbit.tool.generateQuestion.p.knowledgePoint': '知识点编号（形如 orbit:K1）',
  'orbit.tool.generateQuestion.p.difficulty': '可选难度',
  'orbit.tool.generateQuestion.p.exclude': '可选：要排除的题目 id',
  'orbit.tool.generateVariant.desc': '基于刚做过的题生成**变式题**（同知识点，只变动一个维度）。',
  'orbit.tool.explainConcept.desc': '取某个知识点的**结构化讲解**（定义、要点、例子）。',
  'orbit.tool.evaluateFeynman.desc':
    '评估学生的一次费曼式复述：对照该知识点的评分要点，指出讲对了什么、缺了什么。**不直接给答案**。',
  'orbit.tool.evaluateFeynman.p.transcript': '学生的复述原文',
  'orbit.tool.startFeynmanCheck.desc':
    '发起一次费曼式复述：给出邀请语与**评分要点**，让学生用自己的话讲一遍，之后用 evaluateFeynman 评估。',
  'orbit.tool.feynmanInvitation':
    '试着用**你自己的话**说一遍，就当我是完全没学过的同学——不要背公式，讲你理解的那个版本。',
  'orbit.tool.feynmanNote': '学生复述后调用 evaluateFeynman 评估',
  'orbit.tool.diagnoseError.desc':
    '取某个错因对应的**可视化诊断动作序列**（同一错因的处方）。'
    + '通常在 checkAnswer 已经给过诊断动作时不必重复调用。',
  'orbit.tool.updateMastery.desc': '按学生这次作答的结果，更新该知识点的掌握度。',
  'orbit.tool.updateMastery.p.delta': '掌握度增量（答对 +1 / 答错 −1 之类由本地规则定）',
  'orbit.tool.recommendNext.desc': '推荐下一个该练的知识点（依据本机学情）。',
  'orbit.tool.recommendNext.p.count': '可选：要推荐几个',
  'orbit.tool.err.kpRequired': 'knowledgePoint 必填',
  'orbit.tool.err.qidRequired': 'questionId 必填',
  'orbit.tool.err.transcriptRequired': 'transcript 必填',
  'orbit.tool.err.noQuizGenerate': '出题引擎未提供 generate/askQuestion',
  'orbit.tool.err.noQuizVariant': '出题引擎未提供 variant',
  'orbit.tool.err.noQuizExplain': '出题引擎未提供 explain',
  'orbit.tool.err.noQuizFeynman': '出题引擎未提供 evaluateFeynman',
  'orbit.tool.err.noFeynmanSkill': '费曼技能未注册（技能目录里没有 feynman）',
  'orbit.tool.err.noDiagnosis': '诊断模块未提供 diagnose',
  'orbit.tool.err.noMasteryUpdate': '学情模型未提供 update',
  'orbit.tool.err.noMasteryRecommend': '学情模型未提供 recommend',

  // ---- 预置演示脚本（demo/scripts.js）----
  // ★ 这些旁白是**多段字符串拼起来的**，而且进 DOM 之前会经 markdown 渲染、被拆成
  //   好几个文本节点 —— 扫描替换只认"整段就是这一句"，所以只能走键。
  //   zh 值 = 源码里那几段的**逐字拼接**（由 tmp/i18n/gen-orbit-demo-zh.mjs 导出，非手抄）。
  'orbit.demo.nodeDistribution.title': "同一层里，径向节点与角度节面如何此消彼长",
  'orbit.demo.nodeDistribution.s0': "先看 3s。等值面把 |ψ| 达到峰值 8% 的那些点连成一张曲面——你看到的是一个**球**，朝哪个方向看都一样。这说明它的角度部分完全没有方向性：**角度节面 0 个**。它的全部结构都藏在半径里面，一张等值面看不出来。",
  'orbit.demo.nodeDistribution.s1': "三维里看不出来——外层的壳把内层整个包住了。换个看法：把 xz 平面剖开，在剖面里标出这同一张等值面的剖线。现在我把阈值从 8% 一路降到 1.2%……看：一圈、两圈、三圈同心圆依次冒出来，像套娃一样。**每两层壳之间，就夹着一层径向节点**。数一数：三层壳，所以径向节点 2 个。",
  'orbit.demo.nodeDistribution.s2': "换成 3p。看三维：球变成了**哑铃形**，有方向性了——角度节面出现了 1 个，就是把上下两瓣分开的那个平面。再看浮窗里的剖面：同心圆少了一圈，**内层壳只剩一层**，径向节点只剩 1 个。n 没变，径向节点少了 1 个，正好补到角度上去。",
  'orbit.demo.nodeDistribution.s3': "再到 3d。三维里形状更复杂——两个瓣外面套一个环，角度节面变成 2 个（两个锥面）。剖面里呢？**内层壳一个也没有了**，径向节点 0 个。注意这三个轨道：径向节点 2、1、0，角度节面 0、1、2——**总数恒为 n − 1 = 2**。它们只是在这两者之间来回搬家。",
  'orbit.demo.nodeDistribution.s4': "那两层内壳，在径向分布函数上长什么样？回到 3s，把 D(r) = r²R(r)² 画出来：**它两次碰到零线**——这两个零点正是刚才那两层壳的分界。径向节点就是 D(r) 的零点个数，一步不多、一步不少。（3d 那边则是一次也不碰零，刚才剖面上已经看到了。）",
  'orbit.demo.nodeDistribution.s5': "小结：3s 是径向 2 个、角度 0 个；3p 是径向 1 个、角度 1 个；3d 是径向 0 个、角度 2 个。**总数恒为主量子数减一**。这就是\"同一层里 l 越大，径向节点越少、角度节面越多\"的来源。操作与讲解不再互相打断——讲快了可以点「上一步」退回重讲。",
  'orbit.demo.rVsD.title': "R(r) 与 D(r)：为什么峰值不在同一个地方",
  'orbit.demo.rVsD.s0': "先看 1s 的径向波函数 R(r)。它是一条从原点开始单调下降的曲线——**r = 0 处最大**，越往外越小。物理上这是\"离核越近越容易出现\"，听起来很合理。但这条曲线本身还不是概率：它只是波函数在径向上的那一部分。",
  'orbit.demo.rVsD.s1': "现在把 D(r) = r²R(r)² 也画上去。注意峰值挪地方了：**R 的峰在原点，D 的峰却在 r = 1 a₀**——整条曲线在原点附近反而是零。为什么会这样？看下去。",
  'orbit.demo.rVsD.s2': "我把 D 的峰值半径——1 a₀——在三维里标出来。为了让这层壳露在外面，我顺手把等值面阈值收高了一点，球就缩进去了。你看：径向图上横坐标的**一个点**，在三维里就是薄薄的一层**球壳**。原子的\"层\"就是这么来的。",
  'orbit.demo.rVsD.s3': "为什么差一个 r²？因为**概率**要拿概率密度乘上这一层的体积，而球壳体积正比于 r²。原点处密度虽然最大，但那一层几乎不占体积。于是\"最密的地方\"和\"最可能待的地方\"分了家——这正是 R(r) 与 D(r) 必须分开讲的原因。",
  'orbit.demo.complexReal.title': "实轨道与复轨道：同一个能量，两种长相",
  'orbit.demo.complexReal.s0': "先看复函数下的 2p，取 m = +1。它的密度是一个**环**——为什么是环？复解的相位是 e^{imφ}，取模之后 |e^{imφ}| = 1，方位角 φ 被彻底消掉了。绕着 z 轴转一圈，密度什么都没变，所以它一定是个轴对称的环。",
  'orbit.demo.complexReal.s1': "但 φ 并没有真的消失——它藏在**相位**里。切到 xy 截面的相位图：绕原点走一圈，颜色连续循环了一整轮，相位正好走完 **1** 个整周期。这就是 |m| = 1 的含义。不过 l = 1 的轨道里 m 只能取到 ±1，想看更大的缠绕，得换一个轨道。",
  'orbit.demo.complexReal.s2': "换成 3d，取 m = +2。还是 xy 截面、还是相位图——绕一圈，颜色循环了**两**轮。**|m| 就是绕一圈的周期数**。这里能量虽然跟着主量子数变了，但同一个 l 下 m 取几是不影响能量的：3d 的 m = 1 与 m = 2 能量完全相同，差别只在绕 z 轴的节拍。",
  'orbit.demo.complexReal.s3': "现在把这个轨道的复解切成实解。环消失了，变成有明确方向性的**瓣**。注意：**能量一点没变**（n = 3、l = 2 都没动，换掉的只是基底）。相位图上也看得出来：实解的相位只有 0 与 π 两个值、两种颜色，不再是连续缠绕的彩虹。",
  'orbit.demo.complexReal.s4': "既然能量相同（简并），它们的任意线性组合就还是同一个能量的状态。所以\"实轨道是复轨道的线性组合\"——它们不是两种不同的物理，而是同一片空间里的两组基底，看你按什么方向去切它。",
  'orbit.demo.sectionModes.title': "同一张截面，三种看法：密度 / ψ / 等高线",
  'orbit.demo.sectionModes.s0': "三维视图给的是**外部形状**，截面给的是**内部结构**。现在固定住 3d_z² 在 xz 平面上的一刀，只看截面卡上的三个档位怎么各说各的话。第一档是**密度图**：颜色越亮，|ψ|² 越大。上下两个瓣、中间一个环，看得很清楚；但正负号被平方吃掉了——这上面分不出哪块是正、哪块是负。",
  'orbit.demo.sectionModes.s1': "第二档是 **ψ 图**：直接画 ψ 本身，正负立刻分开——相邻两块**异色**。而两种颜色的交界线就是**节面**：在这个剖面上，它们是几条从原点射出去的直线。异色的地方是\"波函数在这里翻了符号\"，不是\"这里没有电子\"。",
  'orbit.demo.sectionModes.s2': "第三档是**等高线**：把等值线一条条画出来，像地形图。看这些从原点出发的直线——每一条都是一层节面。数一数就能验证节点公式：这是三个档里最适合\"数节面\"的一种看法。",
  'orbit.demo.sectionModes.s3': "同一份数据，三种画法：密度图回答\"哪里多、哪里少\"，ψ 图回答\"正负怎么分、节面在哪里\"，等高线回答\"结构分成几块几层\"。这也正是要开一个浮窗的原因——三维与剖面同屏，形状和内部才对照得起来。",
  'orbit.demo.sp3Tetrahedron.title': "杂化：为什么甲烷是正四面体",
  'orbit.demo.sp3Tetrahedron.s0': "先说一句容易被忽略的：杂化轨道**不需要新的数学**。它用的还是解氢原子那套波函数，只是把同一原子上的几个轨道按特定比例加起来。先看 2s：等值面是一个球，朝哪个方向看都一样——s 分量**完全没有方向性**。",
  'orbit.demo.sp3Tetrahedron.s1': "再看 2p_z：一个沿 z 轴的**哑铃**。方向性来自 p。那么，把一个球（s）和一个哑铃（p）按固定比例加起来，会得到什么？答案是**一瓣大、一瓣小的不对称形状**——指向被加强，背向被抵消。这就是杂化。",
  'orbit.demo.sp3Tetrahedron.s2': "这就是第一个 sp³：ψ = ½(s + p_x + p_y + p_z)。看两件事：① 大瓣指向 (1,1,1) 那个斜方向；② 背后还拖着一个小瓣，符号相反，同一半径处大小比正好 **2 : 1**。两者之间隔着一个**圆锥形节面**，半张角 109.47°——记住这个角。（这里切到 Slater 型：它的 2s 与 2p 共用径向函数、没有径向节点，形状是纯角度的，也就是教材上那个干净的瓣。氢型下 s 会把轨道撑得很胖。）",
  'orbit.demo.sp3Tetrahedron.s3': "另外三个 sp³ 是同样的组合，只把 p 的正负号换一换，指向正四面体的另外三个顶点。四个一起画出来——**正四面体**。任意两个的夹角是 109.47°，和刚才那个节锥的半张角**是同一个数**：一个杂化轨道的节锥，正好穿过另外三个的方向。这不是巧合，可以当堂用系数验算。",
  'orbit.demo.sp3Tetrahedron.s4': "关掉两个，只留一对看得更清楚：两个瓣的夹角 109.47°。四个轨道完全**等价**（s 的系数都是 +½，谁也不是特殊的那一个），而且两两**正交**——这正是它们能各自容纳一个电子、彼此不冲突的原因。甲烷的 109.5° 键角，就是这四个方向。",
  'orbit.demo.sp3Tetrahedron.s5': "同一套办法还能给出别的方向数：用一个 s 配两个 p 得到三个共面、互成 120° 的 sp²（这就是石墨与乙烯的平面）；配一个 p 得到两个成 180° 的 sp（乙炔的直线）。**s 与 p 的比例决定方向数**：1+3 得四，1+2 得三，1+1 得二。所谓\"杂化方式\"，本质上就是这个配比。",

  // ===========================================================================
  // core/ 的文案（**带变量**的那些：只能走键，登记原文换不掉）
  // ===========================================================================
  // ★ 判据：字符串里带变量（`= {n} − {l} − 1 =`）→ 必须走键；不带变量 → 进上面的
  //   `text` 表（原文即键，源码里保留中文）。混着用是有意的，见 HOWTO §4。

  // ---- core/math.js：shapeDescribe 里带变量的形状名 ----
  'orbit.shape.axisXY': '在 xy 平面内定向（{fn}{am}φ 型）',
  'orbit.shape.rings': '{n} 个同轴环（由锥形节面隔开）',
  'orbit.shape.lobes': '{n} 瓣形',
  // ★ 实/复解后缀走显式键而不是「原文即键」：' (复)' 的空白会被 trim 掉，
  //   而单字 '复' / '实' 已被 state-editor 的 text 表占用（值是 C / R）。
  'orbit.math.label.complex': ' (复)',
  'orbit.math.label.real': ' (实)',

  // ---- core/formula.js：公式标题与说明（中英的括号与语序都不同）----
  'orbit.formula.super.title': '叠加态 · {n} 个分量',
  'orbit.formula.super.sep': '、',
  'orbit.formula.super.note':
    '系数按 Σ|<i>c</i>ᵢ|² = 1 等比归一化（本程序基组正交归一，故只需这一条），'
    + '因此只有比值有物理意义；|<i>c</i>ᵢ|² 是投影到该分量的概率，'
    + '只有该分量是所测力学量的本征态时才等于"测到该本征值"的概率 —— {comps}',
  'orbit.formula.mSuffix': '（{m}）',
  'orbit.formula.title': '{orb} 轨道{m} · {mode}',
  'orbit.formula.note.ls': '{n}s：球对称分布，没有角度节面；径向节点 {nodes} 个。',
  'orbit.formula.orient.complex': '复数解绕 <i>z</i> 轴对称（环面 / 锥面），相位沿方位角缠绕。',
  'orbit.formula.orient.cos': 'cos({am}<i>φ</i>) 型：瓣在 <i>xy</i> 面内沿一个方向张开。',
  'orbit.formula.orient.sin':
    'sin({am}<i>φ</i>) 型：瓣与同 |<i>m</i>| 的 cos({am}<i>φ</i>) 型绕 <i>z</i> 轴相差 {deg}°。',
  'orbit.formula.orient.m0': '<i>m</i>=0 型：沿 <i>z</i> 轴的"橄榄"形。',
  'orbit.formula.naming.highL':
    '（{sub} 支壳层没有公认的通名 —— 高角动量轨道在文献里只按对称性分类。'
    + '这里用角度部分的直角坐标多项式标记：<i>Y</i> = {poly} / <i>r</i>{pow}。）',
  'orbit.formula.note.nodes': '径向节点 {radial} 个、角度节面 {angular} 个；{orient}{naming}',

  // ---- core/perception-snapshot.js：每轮注入给模型的感知快照 ----
  'orbit.ps.view': '【当前视图】{name}{chem}  n={n} l={l} m={m}{z}',
  'orbit.ps.zHlike': ' Z={z}（类氢，非氢原子）',
  'orbit.ps.mode': '【模式】看{target} / {wavefunction} / {render}',
  'orbit.ps.target.spherical': '球谐函数 Y',
  'orbit.ps.target.wave': '完整波函数 ψ',
  'orbit.ps.iso': '【等值面】判据 {criterion}，阈值 {pct}%',
  'orbit.ps.charts': '【图表】径向 [{radial}]；球谐判据 {angular}；截面 {plane}/{mode}{term}',
  'orbit.ps.charts.term': '；分量 径向/ΘΦ={radialTerm}、截面={sectionTerm}',
  'orbit.ps.term.superRadial': '第1个分量（这两张图不支持叠加态）',
  'orbit.ps.term.superSection': '叠加态整体',
  'orbit.ps.interaction': '【交互】空闲 {idle}s；切换次数 {toggles}；最近动作 {recent}',
  'orbit.ps.super': '【叠加态】{count} 个分量，相对相位 {phase}π：{terms}',
  'orbit.ps.demo': '【演示】#{id}（{origin}）{state} · 第 {index}/{total} 步{waiting}{next}',
  'orbit.ps.origin.unknown': '未知来源',
  'orbit.ps.playing': '播放中',
  'orbit.ps.finished': '已播完',
  'orbit.ps.waiting': '（正在等学生点「下一步」）',
  'orbit.ps.next': '；下一步：{action}',
  'orbit.ps.nextDone': '；已播完',
  'orbit.ps.demoList': '【演示清单】{list}',
  'orbit.ps.demoItem': '#{id}({steps}步{current}{label})',
  'orbit.ps.demoItem.current': '·当前',
  'orbit.ps.demoRevise': '（学生若要求改动，用 reviseDemo 并指定 demo_id 与步号，别重发整条演示）',

  // ---- core/question-engine.js：带变量的题干与解析 ----
  'orbit.qe.radialNodes.stem': '对 **{name}** 轨道，它有几个**径向节点**（球壳状节面）？',
  'orbit.qe.radialNodes.exp':
    '径向节点数 = n − l − 1 = {n} − {l} − 1 = **{radial}**。\n'
    + '（同一 {n} 层的角度节面数是 {angular}，总节点数是 {total}——三者容易混。）',
  'orbit.qe.angularNodes.stem': '对 **{name}** 轨道，它有几个**角度节面**？',
  'orbit.qe.angularNodes.exp': '角度节面数 = l = **{angular}**。',
  'orbit.qe.totalNodes.stem': '**{name}** 轨道的**总节点数**是多少？',
  'orbit.qe.totalNodes.exp':
    '总节点数 = n − 1 = **{total}**，**与 l 无关**。\n'
    + '这正是"同一层内 l 增大时，径向节点减少、角度节面增多，总数不变"的来源。',
  'orbit.qe.energy.stem': '氢原子 **{n}s** 轨道的能量约为多少 eV？（E_n = −13.6/n²）',
  'orbit.qe.energy.exp': 'E_{n} = −13.6 / {n}² = **{E} eV**。能量只依赖 n（氢原子）。',
  'orbit.qe.degeneracy.stem': '第 **n = {n}** 层共有多少个**轨道**（不计自旋）？',
  'orbit.qe.degeneracy.exp': '第 n 层的轨道数 = n² = **{d}**（含自旋则为 2n² = {d2}）。',
  'orbit.qe.radialPeak.stem': '对 **{name}** 轨道，电子出现**概率最大**的半径约为多少？（单位 a₀）',
  'orbit.qe.radialPeak.exp':
    '**注意**：要用径向分布函数 D(r) = r²R(r)² 求极值，其主峰在 **r ≈ {main} a₀**。\n'
    + '若误用 R(r) 的峰值会得到 r=0（R 在原点最大），但那里球壳体积趋于零、概率反而最小——'
    + '这正是"概率幅最大 ≠ 概率最大"的经典陷阱。',
  'orbit.qe.angGeo.both': '{cones} 个锥面 + {planes} 个平面',
  'orbit.qe.angGeo.cones': '{cones} 个锥面',
  'orbit.qe.angGeo.planes': '{planes} 个平面',
  'orbit.qe.angGeo.stem': '实轨道 **{name}** 的角度节面是什么形状？',
  'orbit.qe.angGeo.wPlanesCones': '{planes} 个锥面',
  'orbit.qe.angGeo.wConesPlanes': '{cones} 个平面',
  'orbit.qe.angGeo.wAllCones': '{n} 个锥面',
  'orbit.qe.angGeo.exp':
    '由 math.js 计算：该轨道有 **{shape}**。\n'
    + '★ 常见误解是"角度节面一律是平面"——但 P_l^{|m|}(cosθ)=0 给出的是**锥面**，'
    + '只有 cos(mφ)/sin(mφ)=0 才给出平面。',
  'orbit.qe.rVsD.stem': '对 **{name}** 轨道，下面哪句话是对的？',
  'orbit.qe.nodesReverse.opt': 'n = {n}，l = {l}',
  'orbit.qe.psiVsPsi2.stemF': '等值面判据按 **|ψ|²** 计为 **{pct}%** 时，等价于按 **|ψ|** 计多少？',
  'orbit.qe.psiVsPsi2.stemR': '等值面判据按 **|ψ|** 计为 **{pct}%** 时，等价于按 **|ψ|²** 计多少？',
  'orbit.qe.psiVsPsi2.expF':
    '|ψ| = c ⟺ |ψ|² = c²，所以 {pct}% = ({root}%)²。\n'
    + '★ 二者是**同一族曲面**，切换判据只改变读数的含义，不改变形状族。',
  'orbit.qe.psiVsPsi2.expR':
    '|ψ| = {root}% ⟹ |ψ|² = ({root}%)² = **{pct}%**。\n'
    + '★ 同一读数下按 |ψ| 计算得到的绝对阈值更小，故曲面**更大**。',
  'orbit.qe.meanRadius.stem': '氢原子 **{name}** 态电子离核的**平均距离 ⟨r⟩** 约为多少？（单位 a₀）',
  'orbit.qe.meanRadius.exp':
    '⟨r⟩ = (a₀/2)[3n² − l(l+1)] = (1/2)[3×{n}² − {l}×{l1}] = **{v} a₀**。\n'
    + '注意它比"概率最大半径"（≈n²a₀）小——因为 D(r) 的峰在远处，而 ⟨r⟩ 是对全空间加权的平均。',
  'orbit.qe.angleToZ.stem': '**复函数解** {psi} 中，电子的轨道角动量矢量与 z 轴的夹角约为？',
  'orbit.qe.angleToZ.exp':
    'cosθ = m / √(l(l+1)) = {m} / √({l}×{l1}) ⇒ θ = **{correct}**。\n'
    + '★ 常见错误是用 cosθ = m/l（把 $L_z/L$ 当成了 m/l），正确的分母是 √(l(l+1)) 而非 l。\n'
    + '特别地：m = ±l 时夹角最小但不为 0（角动量不可能与 z 轴重合）；m = 0 时夹角为 90°。\n'
    + '★ 这一问**只对复函数解成立**：L̂z 的本征态是 ψ_{n,l,m}（复解），而实解由 ±m 两个复解'
    + '组合而来，不再是 L̂z 的本征函数，谈"它的 L_z 是多少"没有意义。',
  'orbit.qe.energySplit.stem': '氢原子 **{n}s** 态电子的**势能平均值 ⟨V⟩** 约为多少 eV？（维里定理）',
  'orbit.qe.energySplit.exp':
    '维里定理（库仑势）：2⟨T⟩ = −⟨V⟩，且 ⟨E⟩ = ⟨T⟩ + ⟨V⟩。\n'
    + '由 E_{n} = −13.6/{n}² = {E} eV 得 **⟨V⟩ = 2⟨E⟩ = {V} eV**、⟨T⟩ = {T} eV。\n'
    + '★ 注意 ⟨V⟩ 是 ⟨E⟩ 的两倍（负得更多），而动能恰为 −⟨E⟩ > 0。',
  'orbit.qe.err.buildFailed': '出题失败：题目模板不可用（知识点 {kp}）',
  'orbit.qe.err.noOriginal': '找不到原题：{id}',
  'orbit.qe.card.kp': '{kp} · 难度 {difficulty}',
  'orbit.qe.agent.explain':
    '请讲解知识点 {kp}（{name}）。先用 explainConcept 取讲解稿，'
    + '再按讲解稿用 applySceneActions 把关键结论**演示**出来（不要只念文字）。'
    + '控制在 300 字以内，最后用一句话总结。',
  'orbit.qe.agent.wrong':
    '学生答错了这道题（questionId={id}，他选了第 {chosen} 项，正确是第 {correct} 项）。'
    + '请调用 diagnoseError 取得错因与诊断动作，**不要直接说出正确答案**，'
    + '而是把视图切到能揭示错误根源的状态并引导学生自己看出来。',
  'orbit.qe.agent.right':
    '学生答对了这道题（questionId={id}）。请先调用 startFeynmanCheck 邀请他用自己的话复述，'
    + '以把"识别性掌握"推进到"生成性掌握"。',

  // ---- core/question-engine.js：通道 B 概念题（存的是键，出题时现取）----
  'orbit.qe.c.k6px.stem': '**$p_x$** 轨道可以由哪两个复轨道线性组合得到？',
  'orbit.qe.c.k6px.correct': 'm = +1 与 m = −1',
  'orbit.qe.c.k6px.w1': 'm = 0 与 m = +1',
  'orbit.qe.c.k6px.w2': 'm = 0 与 m = −1',
  'orbit.qe.c.k6px.w3': 'm = +1 与 m = +1',
  'orbit.qe.c.k6px.exp':
    '实轨道是复轨道的线性组合：$p_x \\propto (Y_1^{-1} - Y_1^{+1})$。\n'
    + '因为三者能量简并，组合态仍是合法的本征态。',
  'orbit.qe.c.k6sym.stem': '为什么**复函数**的密度绕 z 轴对称，而实函数呈定向的瓣？',
  'orbit.qe.c.k6sym.correct': '复函数含 e^{imφ}，取模后 |e^{imφ}| = 1，φ 消失了',
  'orbit.qe.c.k6sym.w1': '复函数的电子在绕 z 轴旋转（经典图像）',
  'orbit.qe.c.k6sym.w2': '复函数的 l 更小',
  'orbit.qe.c.k6sym.w3': '复函数没有角度节面',
  'orbit.qe.c.k6sym.exp':
    '|Y_l^m|² = N²P²·|e^{imφ}|² = N²P²，与 φ 无关 → 绕 z 轴旋转对称。\n'
    + '实函数含 cos(mφ)/sin(mφ)，取模后仍依赖 φ → 呈定向的瓣。',
  'orbit.qe.c.k7phase.stem': '为什么说**相位**不是"多余的数学"？',
  'orbit.qe.c.k7phase.correct': '相位决定波函数如何叠加：同相增强、反相抵消，是成键/反键的根源',
  'orbit.qe.c.k7phase.w1': '相位只是计算中间量，没有物理意义',
  'orbit.qe.c.k7phase.w2': '相位对应电子的自旋方向',
  'orbit.qe.c.k7phase.w3': '相位只影响能量大小',
  'orbit.qe.c.k7phase.exp':
    '概率密度只用到 |ψ|²，但两个态叠加时 ψ = ψ₁ + ψ₂ 的干涉项依赖相对相位：\n'
    + '同相 → 增强（成键），反相 → 抵消（反键）。这是化学键的量子力学根源。',
  'orbit.qe.c.k7sign.stem': '**实函数**轨道的正负两色瓣代表什么？',
  'orbit.qe.c.k7sign.correct': '同一个波函数在不同区域取正号或负号（相位 0 或 π）',
  'orbit.qe.c.k7sign.w1': '两个不同的电子云',
  'orbit.qe.c.k7sign.w2': '两个不同的轨道',
  'orbit.qe.c.k7sign.w3': '电子的自旋两种取向',
  'orbit.qe.c.k7sign.exp':
    '实函数的相位只有 0 与 π 两种，故表现为正负两色。\n'
    + '中间隔开的那个面就是节面——相位在那里翻转。\n'
    + '它不是"两个电子"，而是同一个波函数的不同符号区域。',
  'orbit.qe.c.k7wind.stem': '复轨道 e^{imφ} 的相位绕 z 轴转一圈（φ: 0→2π）会怎样？',
  'orbit.qe.c.k7wind.correct': '相位增加 2πm，即缠绕 m 圈',
  'orbit.qe.c.k7wind.w1': '相位不变（因为 |e^{imφ}|=1）',
  'orbit.qe.c.k7wind.w2': '相位增加 2π，与 m 无关',
  'orbit.qe.c.k7wind.w3': '相位增加 πm',
  'orbit.qe.c.k7wind.exp':
    'arg = mφ，φ 走完 2π 时 arg 增加 2πm。\n'
    + '★ 用**截面卡的相位图**可以直接看到：xy 截面上绕原点一周，m=1 相位走完一周，m=2 走两周。',
  'orbit.qe.c.k7bond.stem': '为什么只用 |ψ|² 讲不清"化学键为什么形成"？',
  'orbit.qe.c.k7bond.correct': '因为成键与否取决于相位关系，|ψ|² 把相位信息丢掉了',
  'orbit.qe.c.k7bond.w1': '因为 |ψ|² 计算太复杂',
  'orbit.qe.c.k7bond.w2': '因为 |ψ|² 只适用于 s 轨道',
  'orbit.qe.c.k7bond.w3': '因为 |ψ|² 不是可观测量',
  'orbit.qe.c.k7bond.exp':
    '|ψ|² 是可观测的概率密度，但它**丢掉了相位**。\n'
    + '两个原子轨道靠近时，同相叠加使中间区域电子密度增大（成键），'
    + '反相叠加使中间出现节面（反键）——这个差别完全来自相位。',
  'orbit.qe.c.k9stat.stem': '**2ψ_{3dz²} + 3ψ_{3dxy}** 这个叠加态是定态吗？',
  'orbit.qe.c.k9stat.correct': '是定态——两个分量能量简并',
  'orbit.qe.c.k9stat.w1': '不是定态——叠加态都会随时间变化',
  'orbit.qe.c.k9stat.w2': '不是定态——因为系数不相等',
  'orbit.qe.c.k9stat.w3': '无法判断',
  'orbit.qe.c.k9stat.exp':
    '两个分量同属 n=3、l=2，**能量简并**。整体时间因子 e^{−iEt/ħ} 可提到求和号外，\n'
    + '取模后消失 → 密度**不随时间变化**，故仍是定态。\n'
    + '★ 只有**不同能量**的态叠加才是非定态。',
  'orbit.qe.c.k9lz.stem': '对叠加态 $\\psi = \\sum_i c_i \\psi_i$，测得力学量 $L_z$ 取值为 $\\hbar m$ 的概率是？',
  'orbit.qe.c.k9lz.correct': '所有 mᵢ = m 的分量的 |cᵢ|² 之和',
  'orbit.qe.c.k9lz.w1': '|cᵢ|² 的最大值',
  'orbit.qe.c.k9lz.w2': 'Σ|cᵢ|²  (恒为 1)',
  'orbit.qe.c.k9lz.w3': 'cᵢ 本身',
  'orbit.qe.c.k9lz.exp':
    '测量假设：测得本征值 a 的概率 = 对应本征态系数模方之和 P(a) = Σ_{aᵢ=a}|cᵢ|²。\n'
    + '期望值则是 ⟨Â⟩ = Σ|cᵢ|²aᵢ。',
  'orbit.qe.c.k9sp3.stem': '**sp³** 杂化轨道由哪些原子轨道组合而成？',
  'orbit.qe.c.k9sp3.correct': '一个 s 与三个 p（$p_x$, $p_y$, $p_z$）',
  'orbit.qe.c.k9sp3.w1': '一个 s 与两个 p',
  'orbit.qe.c.k9sp3.w2': '两个 s 与两个 p',
  'orbit.qe.c.k9sp3.w3': '三个 s 与一个 p',
  'orbit.qe.c.k9sp3.exp':
    '$sp^3 = \\frac{1}{2}(s + p_x + p_y + p_z)$，共 4 个等价杂化轨道，指向正四面体，夹角 109.5°。\n'
    + '★ 杂化轨道是**叠加态的特例**，系数由对称性唯一确定。',
}

/** 键 → 英文 */
export const en = {
  'orbit.title': 'Orbital Horizon',

  'orbit.roleHint': [
    'You are working in the **Atomic orbitals** module.',
    '★ Every number (node counts, radial peak positions, energy levels, degeneracy, observables)',
    '  **must be obtained with queryOrbital** — never from memory or mental arithmetic. You can of',
    '  course answer "how many nodal surfaces does 3d have", but "what is the radial node radius of 5g"',
    '  is exactly what this module exists to answer, and when it disagrees with your memory the value',
    '  computed from the structure is always the correct one.',
    'Demonstration first: whenever setQuantumNumbers / setIsosurfaceLevel / setSectionPlane can make it clear,',
    '  do not describe it in words only. The chemical convention is that **z is the quantization axis** — say so',
    '  before discussing angular nodal surfaces.',
    'When contrasting real and complex orbitals, switch to the spherical-harmonic mode (setViewTarget: spherical);',
    '  when discussing "how Y and Y² of the angular distribution differ", use setAngularView.',
    '★ The teaching point of a superposition (setSuperposition) is the **interference term** in |ψ|² — that is what',
    '  makes it fundamentally different from "simply adding probabilities".',
    'Ids must come from tool return values; never invent one.',
  ].join('\n'),

  'orbit.group.state': 'Electronic state',
  'orbit.group.threeD': '3D',
  'orbit.group.twoD': '2D',
  'orbit.group.formula': 'Formula',
  'orbit.group.super': 'Superposition',
  'orbit.group.internal': 'Internal',

  'orbit.facade.notOnPage': 'Not on the atomic orbitals page — open that page first, then act',
  'orbit.facade.actionFailed': 'Action failed',
  'orbit.facade.routeOpen': 'Open the atomic orbitals page',
  'orbit.facade.noStateToRestore': 'No state to restore',
  'orbit.facade.notOnPageShort': 'Not on the atomic orbitals page',
  'orbit.facade.restoreFailed': 'Restore failed',
  'orbit.facade.detached': '(page not attached)',
  'orbit.facade.compactHead': '[Current state] module orbit · orbital',
  'orbit.facade.view': '; view',
  'orbit.facade.render': '; render',
  'orbit.facade.superTerms': '; **superposition of {n} terms**',
  'orbit.facade.slaterZeta': '; **Slater type (STO)** radial ζ={zeta}',
  'orbit.facade.slaterNoZeta': '; **Slater type (STO)** radial (ζ=Z/n)',
  'orbit.facade.hydrogenic': '; hydrogenic (true hydrogen-like) radial',
  'orbit.facade.multi': '; **multiple orbitals on screen: {set}** ({shown}/{count} visible, one colour each, unrelated to superposition)',
  'orbit.facade.idle': '[Interaction] idle',
  'orbit.facade.toggles': '; toggle count',
  'orbit.facade.recent': '; recent actions',
  'orbit.facade.none': '(none)',
  'orbit.field.n': 'change principal quantum number',
  'orbit.field.l': 'change azimuthal quantum number',
  'orbit.field.m': 'change magnetic quantum number',
  'orbit.field.nuclearCharge': 'adjust nuclear charge',
  'orbit.field.viewTarget': 'switch view target',
  'orbit.field.wavefunction': 'real/complex orbital',
  'orbit.field.render': 'switch render mode',
  'orbit.field.psiCriterion': 'switch threshold criterion',
  'orbit.field.levelFraction': 'adjust isosurface level',
  'orbit.field.pointCount': 'adjust particle count',
  'orbit.field.plane': 'switch section plane',
  'orbit.field.sectionMode': 'switch section display',
  'orbit.field.angularWhich': 'switch angular distribution function',
  'orbit.field.radial': 'switch radial curves',
  'orbit.field.isSuperposition': 'superposition changed',
  'orbit.field.relPhase': 'adjust relative phase',
  'orbit.field.chartTerm': 'switch chart term',
  'orbit.field.orbitalModel': 'switch orbital model',
  'orbit.field.orbitalSet': 'switch multi-orbital set',
  'orbit.field.orbitalItems': 'recolour/hide a shown orbital',
  'orbit.field.orbitalBuilding': 'extra orbitals still being built',

  'orbit.host.quiz': 'Question engine. Without it the 8 teach-class tools '
    + '(generateQuestion / grading / error diagnosis) are **honestly absent** — the descriptor '
    + 'lists them under plannedTools accordingly.',
  'orbit.host.diagnosis': 'Error diagnosis (usually an instance of core/error-diagnosis.js). '
    + 'Without it diagnoseError does not exist.',
  'orbit.host.mastery': 'Mastery model. Without it updateMastery / recommendation do not exist. '
    + '★ Note it also needs a storageKey (see configure in modules/orbit/store/mastery.js) — '
    + 'the storage namespace **must be injected by the host**, there is no default.',
  'orbit.host.skills': 'Skill catalogue. The Feynman-retell entry point uses it for the rubric; '
    + 'without it the Feynman tools do not exist.',

  'orbit.kp.K1': 'Quantum numbers and orbital naming',
  'orbit.kp.K2': 'Wavefunction and separation of variables',
  'orbit.kp.K3': 'Radial functions R / R² / D',
  'orbit.kp.K4': 'Angular distribution and orbital shapes',
  'orbit.kp.K5': 'Nodal surfaces and node counting',
  'orbit.kp.K6': 'Real and complex solutions of the wavefunction',
  'orbit.kp.K7': 'Phase and sign',
  'orbit.kp.K8': 'Probabilistic interpretation and |ψ|²',
  'orbit.kp.K9': 'Superposition / hybridization / observables',
  'orbit.kp.unknown': 'Unknown knowledge point: {kp}',
  'orbit.kp.mastered': 'mastered',
  'orbit.kp.learning': 'learning',
  'orbit.kp.review': 'needs review',
  'orbit.kp.untouched': 'not started',
  'orbit.mastery.recommendNote': 'Recommend the knowledge point with the lowest mastery that is most '
    + 'relevant to the current orbital',

  // ---- Action descs (the vocabulary handed to the model) ----
  'orbit.act.setQuantumNumbers.desc':
    'Set the principal n / azimuthal l / magnetic m quantum number. The values are automatically '
    + 'clamped into the legal range (l ≤ n−1, |m| ≤ l). **Giving any quantum number means "show this '
    + 'single eigenstate"**, which exits a superposition automatically.',
  'orbit.act.setNuclearCharge.desc':
    'Set the nuclear charge Z (1..36, hydrogen-like ion). ★ Unlike the quantum numbers, changing Z '
    + 'does **not** exit a superposition.',
  'orbit.act.setWavefunctionMode.desc':
    'Real orbital (real — clear directionality, the usual choice in teaching) or complex orbital '
    + '(complex — m is then a good quantum number).',
  'orbit.act.setRenderMode.desc':
    'Particle cloud (points — importance-sampled by |ψ|²) or isosurface (surface — the surface of '
    + 'equal density).',
  'orbit.act.setPsiCriterion.desc':
    'Which quantity the isosurface/particle cloud thresholds on: |ψ|² (psi2, density) or |ψ| (psi, amplitude).',
  'orbit.act.setOrbitalModel.desc':
    'Switch the **radial function**: hydrogenic = true hydrogen-like (default; 2s has a radial node '
    + 'near r≈2a₀, so the outer lobes of an sp³ isosurface interfere with reversed sign and the shape '
    + 'differs from textbook figures); slater = Slater type (STO; radial form r^(n−1)e^(−ζr), shared '
    + 'by 2s and 2p with no radial node, so sp³ degenerates into a purely angular shape — the clean '
    + 'directional lobe of the textbook). Both are genuine physical models; switching between them is '
    + 'itself a lesson. ★ zeta is optional: omit it and ζ = Z/n; to use the value from Slater\'s rules, '
    + 'pass it directly (1.625 for carbon 2s/2p).',
  'orbit.act.setOrbitals.desc':
    'Draw **several independent** orbitals at once, one colour each, each switchable on its own. '
    + 'Three ways to use it:\n'
    + '① **Preset equivalent set**: `set` takes one of sp3/sp2/sp (sp³ — four orbitals pointing to a '
    + 'tetrahedron, 109.47° apart; sp² — three coplanar at 120°; sp — two at 180°), and `visible` gives '
    + 'the indices to show (0-based; omit for all; write [0] to keep just one and look at its shape).\n'
    + '② **Add the current orbital**: `add: true`. Set up one orbital first (a pure state from the '
    + 'sliders, or a superposition — either works) → add → set up the next → add again; **there is no '
    + 'limit**, every add puts one more independent surface on screen.\n'
    + '③ **Give a batch at once**: `items` takes an array, each entry either n/l/m (pure state) or '
    + 'terms (superposition, e.g. [{n,l,m,mode,c}]), optionally with color ("#rrggbb"), label, visible.\n'
    + 'set to off turns it off.\n'
    + '★ This is not the same thing as a superposition: a superposition is **one** state made of '
    + 'several terms, the interference term is part of the physics, and it can only be drawn as '
    + '**one** surface; here N independent states are placed in the scene, i.e. N surfaces.',
  'orbit.act.setOrbitalStyle.desc':
    'Change the colour or visibility of **one orbital already on screen**. The key comes from the '
    + 'snapshot\'s orbitalItems field (of the form `orb-2`; the main orbital is `__main__`). '
    + '★ This does **not rebuild geometry** (it only repaints vertex colours), so it takes effect '
    + 'instantly; to add or swap orbitals use setOrbitals.',
  'orbit.act.clearOrbitals.desc':
    'Hide all **extra** on-screen orbitals, keeping only the one currently being edited (equivalent '
    + 'to turning the multi-orbital mode off).',
  'orbit.act.setIsosurfaceLevel.desc':
    'At what fraction of the peak the isosurface is taken (a 0..1 ratio, mapped logarithmically '
    + 'internally). **When not given, the program picks a recommended value per orbital**; once given '
    + 'explicitly, later orbital changes no longer apply the recommendation.',
  'orbit.act.setParticleCount.desc':
    'Number of sample points in the particle cloud (8000..80000). More points look finer and cost more performance.',
  'orbit.act.setAngularView.desc':
    'Whether the angular distribution plot shows Y (the spherical harmonic itself) or Y² (the probability density).',
  'orbit.act.setViewTarget.desc':
    'What the main 3D view draws: spherical = the spherical-harmonic surface (angular part), wave = '
    + 'the full wavefunction (electron cloud / isosurface). ★ Switching to the spherical-harmonic mode '
    + 'hides the quantum-state entry (a superposition only makes sense for the full wavefunction).',
  'orbit.act.setSectionPlane.desc':
    'Which coordinate plane the section plot takes: xy / xz / yz (by chemical convention z is the '
    + 'quantization axis, and the xz plane is the usual one for discussing "angular nodal surfaces").',
  'orbit.act.setSectionMode.desc':
    'What the section plot draws: intensity (|ψ|²) / phase (colour-coded sign) / contour (contour lines).',
  'orbit.act.showRadial.desc':
    'Which curves the radial plot shows (**multi-select**): R (the radial wavefunction, with sign), '
    + 'R² (radial probability density), D = r²R² (the radial distribution function — the one to use for '
    + '"where is the electron most often"). At least one must stay, otherwise the plot is blank.',
  'orbit.act.setRadialMarks.desc':
    'Mark peak (maxima) or zeros (nodes) on the radial plot. **feature may be an array** (both at '
    + 'once); pass null to clear the marks. Marks are drawn **only on the currently visible curves**.',
  'orbit.act.setAutoRotate.desc':
    'Whether the 3D view auto-rotates. Turn it on when discussing "what does this orbital look like" '
    + 'so students can see the overall shape.',
  'orbit.act.resetCamera.desc': 'Return the camera to its initial orientation and distance.',
  'orbit.act.resetSectionView.desc':
    'Return the section plot\'s zoom and pan to the initial state (same as the "reset zoom" control in '
    + 'the corner of the chart).',
  'orbit.act.setFormulaHighlight.desc':
    'Highlight the formula term by term (R radial / Y angular / L Laguerre / P associated Legendre / '
    + 'N normalization). This is the hub of the 3D–formula–chart three-way link: whichever term you are '
    + 'discussing, light it up. Pass null to clear the highlight.',
  'orbit.act.setSuperposition.desc':
    'Set the electronic state to a linear combination of eigenstates. terms is an array, each entry '
    + '{n,l,m,c:{re,im}} (c defaults to 1). ★ The teaching point: a superposition has an **interference '
    + 'term** in |ψ|², which is exactly what separates it from "simply adding probabilities".',
  'orbit.act.clearSuperposition.desc': 'Go back to a single eigenstate.',
  'orbit.act.setChartTerm.desc':
    'Which part of the superposition the 2D charts draw: \'super\' = the whole thing (**only the '
    + 'section plot supports it**), a number = the i-th component (0-based).',
  'orbit.act.linkRadialTo3D.desc':
    'Draw a reference ring of radius `radius` (a₀) in the 3D view, to put "a radius on the radial '
    + 'distribution plot" **at its position on screen**. Use it when discussing "how far from the '
    + 'nucleus is this peak" to line the 2D reading up with the 3D scale. Pass 0 to clear.',
  'orbit.act.focusChart.desc':
    'Enlarge the chart at the bottom of the page into a **floating window** (radial distribution / '
    + 'section density / angular distribution); `none` closes the window. ★ **Use this first** when '
    + 'talking about a bottom chart — otherwise the chart is below the fold and the explanation is '
    + 'elsewhere, so students cannot tell which one you mean. Also mind the order: **change the orbital '
    + 'first, then focusChart**; the window enlarges the *current* chart.',
  'orbit.act.animateIsosurfaceLevel.desc':
    'Smoothly sweep the isosurface level from from to to (each a 0.003..0.8 ratio). ★ This is the core '
    + 'technique for teaching "concentric shells": as the threshold keeps dropping, the inner shells '
    + 'emerge one by one. **But do it in the section plot** — 3D is solid rendering and the outer shell '
    + 'wraps the inner ones completely, so lowering the threshold only changes the colour while the '
    + 'shape still looks like the same ball.',
  'orbit.act.setRelPhase.desc':
    'Relative phase (radians) of the superposition terms. Changing it rotates/deforms the interference '
    + 'pattern — the most direct demonstration that "phase is physical".',
  'orbit.act.restoreState.desc':
    'Write back a whole snapshot (used by the storyboard\'s "previous step"). **Not a user-facing '
    + 'path**; it is a strictly reversible restore.',
  'orbit.act.recomputeOnly.desc':
    'Only recompute and redraw, changing no parameter (triggered once after a superposition coefficient '
    + 'or phase change).',

  // ---- Action params ----
  'orbit.act.setOrbitalModel.param.zeta': '(optional) a positive number',
  'orbit.act.setOrbitals.param.visible': '(optional) array of indices, e.g. [0,2]; omitted = all',
  'orbit.act.setOrbitals.param.add': '(optional) true = add the orbital currently being edited to the screen',
  'orbit.act.setOrbitals.param.items': '(optional) array of arbitrary orbitals, each {n,l,m,mode} or {terms:[…]}, '
    + 'optionally with color/label/visible',
  'orbit.act.setOrbitalStyle.param.key': 'orbital key (see the snapshot\'s orbitalItems)',
  'orbit.act.setOrbitalStyle.param.color': '(optional) "#rrggbb" or [r,g,b] (0..1)',
  'orbit.act.setOrbitalStyle.param.visible': '(optional) true/false',
  'orbit.act.setParticleCount.param.count': '8000..80000 (a multiple of 1000)',
  'orbit.act.showRadial.param.which': 'array, elements ∈ {list}',
  'orbit.act.setRadialMarks.param.feature': 'peak|zeros or an array of them|null',
  'orbit.act.setRadialMarks.param.target': 'R|R2|D|ALL (default ALL)',
  'orbit.act.setChartTerm.param.term': 'super|integer index',
  'orbit.act.linkRadialTo3D.param.radius': '0..200 (a₀), 0 clears',
  'orbit.act.animateIsosurfaceLevel.param.durationMs': '300..6000, default 1200',
  'orbit.act.setRelPhase.param.phase': 'a number in radians',
  'orbit.act.restoreState.param.state': 'snapshot object',

  // ---- Action validation errors (fed back to the model so it can fix the call) ----
  'orbit.act.err.enum': '{name}: {key} must be one of {allowed}, got {v}',
  'orbit.act.err.int': 'setQuantumNumbers: {k} must be an integer, got {v}',
  'orbit.act.err.negative': 'setQuantumNumbers: {k} cannot be negative',
  'orbit.act.err.qnNeedsOne': 'setQuantumNumbers needs at least one of n / l / m',
  'orbit.act.err.nRange': 'n must be {lo}..{hi}, got {v}',
  'orbit.act.err.lRange': 'l must be ≤ n−1 (for n={n}, l ≤ {max}), got l={l}',
  'orbit.act.err.mRange': '|m| must be ≤ l (for l={l}, |m| ≤ {l}), got m={m}',
  'orbit.act.err.zNeeded': 'setNuclearCharge needs Z',
  'orbit.act.err.zInt': 'Z must be an integer, got {v}',
  'orbit.act.err.zRange': 'Z must be {lo}..{hi}, got {v}',
  'orbit.act.err.zeta': 'setOrbitalModel: zeta must be a positive number in (0, 20] '
    + '(omit it to use Z/n; the standard value for carbon 2s/2p is 1.625)',
  'orbit.act.err.addOnlyTrue': 'setOrbitals: add only accepts true (to add the current orbital)',
  'orbit.act.err.labelEmpty': 'setOrbitals: label must be a non-empty string',
  'orbit.act.err.visibleArray': 'setOrbitals: visible must be omitted or be an array of indices, e.g. [0,2]',
  'orbit.act.err.setMissingDef': 'internal inconsistency: {setId} is in the enum but has no definition',
  'orbit.act.err.visibleShape': 'setOrbitals: visible must be an array of indices ({label} has {count}, '
    + 'e.g. [0,2]); to keep just one, write [0]',
  'orbit.act.err.visibleOutOfRange': '{label} has only {count} equivalent orbitals, so indices must be in '
    + '0..{max}; got out-of-range {bad}',
  'orbit.act.err.visibleEmpty': '{label} must keep at least one orbital visible; to turn them all off use set:\'off\'',
  'orbit.act.err.fractionNeeded': 'setIsosurfaceLevel needs fraction (a 0..1 ratio)',
  'orbit.act.err.fractionRange': 'fraction must be a number in (0, 1], got {v}',
  'orbit.act.err.countInt': 'setParticleCount needs an integer count',
  'orbit.act.err.countRange': 'count must be {lo}..{hi}, got {v}',
  'orbit.act.err.radialEnum': 'radial curves must be one of {allowed}, got {bad}',
  'orbit.act.err.markEnum': 'marks must be one of {allowed}, got {bad}',
  'orbit.act.err.formulaEnum': 'formula highlight must be one of {allowed} or null, got {v}',
  'orbit.act.err.termsEmpty': 'setSuperposition needs a non-empty terms array',
  'orbit.act.err.termsInt': 'every term needs integer n / l / m, got {v}',
  'orbit.act.err.termsN': 'n inside terms must be 1..{max}, got {v}',
  'orbit.act.err.termsL': 'inside terms l must be ≤ n−1 (n={n}), got l={l}',
  'orbit.act.err.termsM': 'inside terms |m| must be ≤ l (l={l}), got m={m}',
  'orbit.act.err.chartTerm': 'setChartTerm: term must be \'super\' or a non-negative integer, got {v}',
  'orbit.act.err.radius': 'linkRadialTo3D: radius must be 0..200 (a₀), got {v}',
  'orbit.act.err.focusTarget': 'focusChart: target must be radial / section / thetaPhi / none, got {v}',
  'orbit.act.err.animNumbers': 'animateIsosurfaceLevel needs numeric from and to (0.003..0.8 ratios)',
  'orbit.act.err.animRange': 'from/to must be within 0.003..0.8, got {from} → {to}',
  'orbit.act.err.animDuration': 'durationMs must be 300..6000, got {v}',
  'orbit.act.err.phase': 'setRelPhase needs a numeric phase, got {v}',
  'orbit.act.err.styleKey': 'setOrbitalStyle needs a key (from the snapshot\'s orbitalItems field, '
    + 'of the form orb-2; the main orbital is __main__)',
  'orbit.act.err.styleVisible': 'setOrbitalStyle: visible must be true/false',
  'orbit.act.err.styleNeedsOne': 'setOrbitalStyle needs at least one of: color or visible '
    + '(to switch all of them off, use setOrbitals({set:"off"}))',
  'orbit.act.err.clearOrbitalsArgs': 'clearOrbitals takes no arguments (got: {extra})',
  'orbit.act.err.restoreNeedsState': 'restoreState needs a state object',
  'orbit.act.err.unknownAction': 'the orbit module does not support the action: {name}',
  'orbit.act.err.pickNeeded': '{name} needs {key} ({allowed})',
  'orbit.act.err.colorTriple': 'the color array must be three numbers in 0..1, e.g. [0.88, 0.63, 0.25] (got {v})',
  'orbit.act.err.colorHex': 'color must be of the form "#rrggbb" (got {v}), '
    + 'for example "#e0a040"; or give three numbers in 0..1 as [r,g,b]',
  'orbit.act.err.colorType': 'color must be a "#rrggbb" string or an [r,g,b] array',
  'orbit.act.err.nlmInt': '{where}: {k} must be an integer in {lo}..{hi} (got {v})',
  'orbit.act.err.nlmL': '{where}: l must be ≤ n−1 (got n={n}, l={l})',
  'orbit.act.err.nlmM': '{where}: |m| must be ≤ l (got l={l}, m={m})',
  'orbit.act.err.itemsEmpty': 'setOrbitals: items must be a **non-empty** array; each entry either '
    + '{n,l,m} (pure state) or {terms:[…]} (superposition), optionally with color/label/visible',
  'orbit.act.err.itemsTooMany': 'at most {max} orbitals on screen at once (got {n}). '
    + 'Each one really runs the isosurface pipeline; too many will lock the page up for minutes, and '
    + '4 (sp³) is already plenty for teaching.',
  'orbit.act.err.itemObject': '{where} must be an object',
  'orbit.act.err.itemTermsMany': '{where}.terms allows at most 8 entries (got {n})',
  'orbit.act.err.itemMode': '{where}.terms[{i}].mode must be one of {allowed}',
  'orbit.act.err.itemComplex': '{where}.terms[{i}].c must be {re, im}, two finite numbers',
  'orbit.act.err.itemModeTop': '{where}.mode must be one of {allowed}',
  'orbit.act.err.itemLabel': '{where}.label must be a non-empty string',
  'orbit.act.err.itemVisible': '{where}.visible must be true/false',

  // ---- State editor ----
  'orbit.se.preset.pure.note':
    'A single eigenstate (stationary state). The "origin" of the superposition editor — you can always come back here.',
  'orbit.se.preset.degenerate.note':
    'Same n, same l → the energies are **degenerate** → the combination is **still stationary**: the density is a static interference pattern that does not change with time.',
  'orbit.se.preset.nonStationary.note':
    'Different energies → not stationary: the density "breathes" with time. ★ The animation parameter is the '
    + '**relative phase**, not real time (ΔE≈10.2 eV ⇒ ν≈2.5×10¹⁵ Hz, not visualizable).',
  'orbit.se.preset.twoP.note':
    'Same n, same l → degenerate → stationary. Two orthogonal p orbitals combine into a **slanted lobe** — '
    + 'the germ of a hybrid orbital.',
  'orbit.se.preset.sp3-1.note':
    '$\\psi = \\frac{1}{2}(s + p_x + p_y + p_z)$. The four sp³ orbitals are completely equivalent, pointing to a '
    + '**regular tetrahedron**, 109.5° apart.',
  'orbit.se.preset.sp3-2.note':
    '$\\psi = \\frac{1}{2}(s + p_x - p_y - p_z)$. Equivalent and orthogonal to sp³-1, pointing to another vertex.',
  'orbit.se.preset.sp3-3.note':
    '$\\psi = \\frac{1}{2}(s - p_x + p_y - p_z)$. Equivalent and orthogonal to sp³-1, pointing to the third vertex.',
  'orbit.se.preset.sp3-4.note':
    '$\\psi = \\frac{1}{2}(s - p_x - p_y + p_z)$. Equivalent and orthogonal to sp³-1, pointing to the fourth vertex.',
  'orbit.se.preset.sp2-1.note':
    '$\\psi = \\frac{1}{\\sqrt{3}}\\,s + \\sqrt{\\frac{2}{3}}\\,p_x$. One of three equivalent orbitals, '
    + '**coplanar at 120°**.',
  'orbit.se.preset.sp2-2.note':
    '$\\psi = \\frac{1}{\\sqrt{3}}\\,s - \\frac{1}{\\sqrt{6}}\\,p_x + \\frac{1}{\\sqrt{2}}\\,p_y$. '
    + 'Obtained by rotating sp²-1 by 120° about $z$.',
  'orbit.se.preset.sp2-3.note':
    '$\\psi = \\frac{1}{\\sqrt{3}}\\,s - \\frac{1}{\\sqrt{6}}\\,p_x - \\frac{1}{\\sqrt{2}}\\,p_y$. '
    + 'Obtained by rotating sp²-1 by 240° about $z$.',
  'orbit.se.preset.sp-1.note':
    '$\\psi = \\frac{1}{\\sqrt{2}}(s + p_z)$. One of two equivalent orbitals, **180°**, linear.',
  'orbit.se.preset.sp-2.note':
    '$\\psi = \\frac{1}{\\sqrt{2}}(s - p_z)$. The other sp orbital, orthogonal to sp-1 and pointing exactly opposite.',
  'orbit.se.deleteTitle': 'Delete "{label}"',
  'orbit.se.realOrbitalTitle': 'Real orbital (one of the {n} real orbitals of this subshell)',
  'orbit.se.magneticTitle': 'Magnetic quantum number m',
  'orbit.se.presetNotFound': 'Preset not found: {key}',
  'orbit.se.presetCustomOnly': 'Built-in presets cannot be deleted (only custom presets can)',
  'orbit.se.unknownPreset': 'Unknown preset: {key}',
  'orbit.se.loaded': 'Loaded: {label}',
  'orbit.se.customNote': 'Custom preset ({n} terms)',
  'orbit.se.noTerms': 'There is no superposition term yet, so it cannot be saved as a preset',
  'orbit.se.customDefault': 'Custom state',
  'orbit.se.normHint':
    'The coefficients are **renormalized proportionally** so that $\\sum_i |c_i|^2 = 1$ (the basis of this '
    + 'program is orthonormal, so that is the only condition needed); therefore **only the ratios have '
    + 'physical meaning**: type 0.35 for a term and it may be stored as 0.37 (the other terms are scaled by '
    + 'the same factor). That is an inevitable consequence of normalization.',
  'orbit.se.phaseNote':
    '$\\varphi = (E_i - E_j)\\,t/\\hbar$ is the **relative phase**, not real time. The real oscillation '
    + 'frequency, about $10^{15}$ Hz, cannot be visualized, and the interference pattern depends only on the '
    + 'relative phase.',
  'orbit.se.modeTipComplex':
    'This term is a **complex solution** (an eigenfunction of L̂z, labelled by m) — click to make it real',
  'orbit.se.modeTipReal':
    'This term is a **real solution** (not an eigenfunction of L̂z, labelled by the real-orbital name) — '
    + 'click to make it complex',
  'orbit.se.modeTitle':
    'Whether this term takes the real or the complex solution of the wavefunction. **Selectable per term** — '
    + 'so "all real", "all complex" and "mixed" are all expressible.',
  'orbit.se.pickTitle':
    'Complex solutions are labelled by the magnetic quantum number m (m is the eigenvalue index of L̂z, so it '
    + 'only means something there); real solutions are labelled by the real-orbital name (a real solution is '
    + 'not an eigenfunction of L̂z, so m means nothing to it).',
  'orbit.se.ampTitle':
    'The coefficient of this term (this module only accepts positive real numbers; the imaginary part and the '
    + 'inter-term phase are expressed by the "relative phase" below)',

  // ---- Reference tables ----
  'orbit.reftable.R.title': 'Table 2.2.4　Function R_{n,l}(r)',
  'orbit.reftable.R.note': 'Explicit closed forms including the nuclear charge Z: R₁₀ / R₂₀ / R₂₁ / R₃₀ / R₃₁ / R₃₂',
  'orbit.reftable.Y.title': 'Table 2.2.3　Solutions of the function Y(θ,φ)',
  'orbit.reftable.Y.note': 'Complex spherical harmonics Y_l^m compared with the real ones '
    + '(Y_{p_z} / Y_{d_z²} / Y_{d_xz} …)',

  // ---- Chart overlay ----
  'orbit.overlay.title.radial': 'Radial distribution',
  'orbit.overlay.title.section': 'Section density',
  'orbit.overlay.title.thetaPhi': 'The two factors of the angular part',
  'orbit.overlay.minimize': 'Minimize / expand (keep the title bar only)',
  'orbit.overlay.close': 'Close (Esc)',

  // ---- 2D charts (canvas text) ----
  'orbit.chart.normalized': 'Normalized value',
  'orbit.chart.plane.xy': '*xy* plane',
  'orbit.chart.plane.xz': '*xz* plane',
  'orbit.chart.plane.yz': '*yz* plane',
  'orbit.chart.nodalPlane': 'This plane is a nodal surface · |*ψ*|² ≈ 0',
  'orbit.chart.contourTitle': 'Contours |*ψ*|² · white lines = nodal surfaces (*ψ* = 0)',
  'orbit.chart.isoLine': 'dashed = current isosurface ({pct}% of peak)',
  'orbit.chart.nodalPlaneShort': 'This plane is a nodal surface',
  'orbit.chart.phaseArg': 'phase arg *ψ*',
  'orbit.chart.max': 'max',
  'orbit.chart.maxDensity': '|*ψ*|² max {v}',

  // ---- 3D view ----
  'orbit.r3d.multiLabel': 'Orbital {n}',
  'orbit.r3d.err.noMulti': 'multiple orbitals are not currently on',
  'orbit.r3d.err.noSpec': 'missing orbital description',
  'orbit.r3d.err.duplicate': 'that orbital already exists: {key}',
  'orbit.r3d.err.noSuchOrbital': 'no such orbital: {key} (available: {list})',
  'orbit.r3d.err.mainNotRemovable': 'the main orbital cannot be removed; to hide them all use '
    + 'setOrbitals({set:"off"})',
  'orbit.r3d.err.building': 'this one is still being built — wait until it finishes to remove it '
    + '(the UI shows "building…")',
  'orbit.r3d.err.itemsEmpty': 'items must be a non-empty array',
  'orbit.r3d.err.unknownSet': 'unknown orbital set {setId} (available: {list})',
  'orbit.r3d.err.colorTriple': 'color must be a triple of numbers in 0..1',
  'orbit.r3d.chip.removeHint': 'Click to remove this annotation',
  'orbit.r3d.chip.ring': 'Reference sphere r = {r} a₀  ✕',
  'orbit.r3d.chip.radialNodes': 'radial nodes ×{n}',
  'orbit.r3d.chip.angularNodes': 'angular nodes ×{n}',
  'orbit.r3d.chip.noNodes': 'this orbital has no nodal surfaces',
  'orbit.r3d.chip.highlighted': '{parts} highlighted',

  // ---- Tools ----
  'orbit.tool.queryOrbital.desc':
    'Query deterministic facts about an orbital (every number is computed in code; never do the arithmetic '
    + 'yourself). kind values: nodes=node counts; radialZeros=radial node radii; radialPeaks=radial '
    + 'distribution peak radii; angularNodes=angular nodal surface geometry; energy=energy level (eV); '
    + 'degeneracy=degeneracy; normalization=normalization coefficient; shape=shape description; compare=compare '
    + 'two orbitals; observables=observables overview; meanR=mean radius and the like; angleToZ=angle between '
    + 'the angular momentum and the z axis; energySplit=energy breakdown; hybrids=hybrid orbital sets '
    + '(sp³/sp²/sp) — their directions, hybrid composition and mutual angles.',
  'orbit.tool.queryOrbital.p.n': 'principal quantum number 1-6',
  'orbit.tool.queryOrbital.p.l': 'azimuthal quantum number 0..n-1',
  'orbit.tool.queryOrbital.p.m': 'magnetic quantum number -l..l',
  'orbit.tool.queryOrbital.p.mode': 'wavefunction form, default real',
  'orbit.tool.queryOrbital.p.a': 'the first orbital {n,l,m} for kind=compare',
  'orbit.tool.queryOrbital.p.b': 'the second orbital {n,l,m} for kind=compare',
  'orbit.tool.queryOrbital.p.set': 'restrict the set for kind=hybrids; omitted returns all',
  'orbit.tool.err.needNL': 'n and l are required',
  'orbit.tool.err.needN': 'n is required',
  'orbit.tool.err.needNLM': 'n, l and m are required',
  'orbit.tool.err.needLM': 'l and m are required',
  'orbit.tool.err.needAB': 'a and b, two orbital objects, are required',
  'orbit.tool.err.unknownKind': 'unknown kind: {kind}',
  'orbit.tool.err.unknownHybridSet': 'unknown hybrid set {only} (available: {list})',
  'orbit.tool.note.nodes': 'radial nodes = n-l-1, angular nodal surfaces = l, total = n-1 '
    + '(all computed in code)',
  'orbit.tool.note.radialPeaks': 'local maxima of D(r)=r²R² (there may be several)',
  'orbit.tool.note.angularNodes': 'cones are cones about the z axis (half apex angle given); planes are '
    + 'planes through the z axis (azimuth given)',
  'orbit.tool.note.normalization': 'the normalization coefficient is computed by formula.js and is already '
    + 'shown in the formula area',
  'orbit.tool.note.observables': 'all given by analytic expressions (length in a₀, angular momentum in ħ)',
  'orbit.tool.formula.meanR': '⟨r⟩ = (a₀/2)[3n² − l(l+1)]; ⟨1/r⟩ = 1/(n²a₀) (independent of l)',
  'orbit.tool.note.meanR': '⟨r⟩ is the average distance weighted over all space, smaller than the '
    + '"most probable radius" (≈n²a₀)',
  'orbit.tool.note.angleToZ': 'a common mistake is to use cosθ = m/l (the denominator should be √(l(l+1)))',
  'orbit.tool.generateQuestion.desc':
    'Write a question on a given knowledge point. The returned question **contains no answer** — grading and '
    + 'the explanation are done locally; you cannot see the answer and must not guess it.',
  'orbit.tool.generateQuestion.p.knowledgePoint': 'knowledge point id (of the form orbit:K1)',
  'orbit.tool.generateQuestion.p.difficulty': 'optional difficulty',
  'orbit.tool.generateQuestion.p.exclude': 'optional: question ids to exclude',
  'orbit.tool.generateVariant.desc':
    'Generate a **variant** of a question just attempted (same knowledge point, only one dimension changed).',
  'orbit.tool.explainConcept.desc':
    'Get a **structured explanation** of a knowledge point (definition, key points, examples).',
  'orbit.tool.evaluateFeynman.desc':
    'Evaluate a student\'s Feynman-style retell: against the rubric for that knowledge point, say what was '
    + 'right and what is missing. **Do not give the answer directly**.',
  'orbit.tool.evaluateFeynman.p.transcript': 'the student\'s retell, verbatim',
  'orbit.tool.startFeynmanCheck.desc':
    'Start a Feynman-style retell: give an invitation and the **rubric**, have the student explain it in '
    + 'their own words, then assess it with evaluateFeynman.',
  'orbit.tool.feynmanInvitation':
    'Try saying it in **your own words**, as if I had never studied it — do not recite formulas, tell me the '
    + 'version you understand.',
  'orbit.tool.feynmanNote': 'After the student retells it, call evaluateFeynman to assess',
  'orbit.tool.diagnoseError.desc':
    'Get the **visual diagnostic action sequence** for an error cause (the prescription for that cause). '
    + 'Usually there is no need to call it again when checkAnswer has already returned diagnostic actions.',
  'orbit.tool.updateMastery.desc':
    'Update the mastery of that knowledge point according to the student\'s answer.',
  'orbit.tool.updateMastery.p.delta': 'mastery delta (correct +1 / wrong −1 and the like, decided by local rules)',
  'orbit.tool.recommendNext.desc':
    'Recommend the next knowledge point to practise (based on the local learning record).',
  'orbit.tool.recommendNext.p.count': 'optional: how many to recommend',
  'orbit.tool.err.kpRequired': 'knowledgePoint is required',
  'orbit.tool.err.qidRequired': 'questionId is required',
  'orbit.tool.err.transcriptRequired': 'transcript is required',
  'orbit.tool.err.noQuizGenerate': 'the question engine does not provide generate/askQuestion',
  'orbit.tool.err.noQuizVariant': 'the question engine does not provide variant',
  'orbit.tool.err.noQuizExplain': 'the question engine does not provide explain',
  'orbit.tool.err.noQuizFeynman': 'the question engine does not provide evaluateFeynman',
  'orbit.tool.err.noFeynmanSkill': 'the Feynman skill is not registered (no feynman in the skill catalogue)',
  'orbit.tool.err.noDiagnosis': 'the diagnosis module does not provide diagnose',
  'orbit.tool.err.noMasteryUpdate': 'the mastery model does not provide update',
  'orbit.tool.err.noMasteryRecommend': 'the mastery model does not provide recommend',

  // ---- Demo scripts ----
  'orbit.demo.nodeDistribution.title': 'Within one shell, how radial nodes and angular nodes trade off',
  'orbit.demo.nodeDistribution.s0': 'Start with 3s. The isosurface joins all points where |ψ| reaches 8% of '
    + 'the peak into a single surface — and what you see is a **sphere**, the same from every direction. So '
    + 'its angular part has no directionality at all: **0 angular nodes**. All of its structure is hidden '
    + 'inside the radius and cannot be seen in one isosurface.',
  'orbit.demo.nodeDistribution.s1': 'You cannot see it in 3D — the outer shell wraps the inner ones '
    + 'completely. Look at it differently: cut the xz plane open and mark the cross-section of that same '
    + 'isosurface. Now I sweep the threshold from 8% all the way down to 1.2%… Look: one ring, two rings, '
    + 'three concentric circles coming out one after another, like a nesting doll. **Between every two shells '
    + 'there lies one radial node.** Count them: three shells, so 2 radial nodes.',
  'orbit.demo.nodeDistribution.s2': 'Switch to 3p. In 3D the sphere becomes a **dumbbell** — now it has '
    + 'directionality, and 1 angular node has appeared: the plane that separates the upper and lower lobes. '
    + 'Now look at the section in the floating window: one concentric circle fewer, **only one inner shell '
    + 'left**, so only 1 radial node. n has not changed; one radial node fewer, exactly made up on the '
    + 'angular side.',
  'orbit.demo.nodeDistribution.s3': 'Now 3d. The 3D shape is more complex — two lobes wrapped by a ring — '
    + 'and the angular nodes become 2 (two cones). And in the section? **No inner shell at all**, 0 radial '
    + 'nodes. Note these three orbitals: radial nodes 2, 1, 0 and angular nodes 0, 1, 2 — **the total is '
    + 'always n − 1 = 2**. They are merely moving back and forth between the two.',
  'orbit.demo.nodeDistribution.s4': 'What do those two inner shells look like on the radial distribution '
    + 'function? Back to 3s and plot D(r) = r²R(r)²: **it touches the zero line twice** — and those two '
    + 'zeros are exactly the boundaries of the two shells we just saw. The number of radial nodes is the '
    + 'number of zeros of D(r), no more and no less. (For 3d it never touches zero at all, as we just saw in '
    + 'the section.)',
  'orbit.demo.nodeDistribution.s5': 'Summary: 3s has 2 radial and 0 angular; 3p has 1 radial and 1 angular; '
    + '3d has 0 radial and 2 angular. **The total is always the principal quantum number minus one.** That is '
    + 'where "within one shell, the larger l, the fewer radial nodes and the more angular nodes" comes from. '
    + 'Acting and explaining no longer interrupt each other — if I go too fast you can press "previous step" '
    + 'and hear it again.',
  'orbit.demo.rVsD.title': 'R(r) and D(r): why their peaks are not in the same place',
  'orbit.demo.rVsD.s0': 'First look at the radial wavefunction R(r) of 1s. It is a curve that starts at the '
    + 'origin and falls monotonically — **largest at r = 0**, smaller further out. Physically that reads as '
    + '"the closer to the nucleus the more likely", which sounds reasonable. But this curve is not yet a '
    + 'probability: it is only the radial part of the wavefunction.',
  'orbit.demo.rVsD.s1': 'Now also plot D(r) = r²R(r)². Notice that the peak has moved: **the peak of R is at '
    + 'the origin, but the peak of D is at r = 1 a₀** — and near the origin the whole curve is actually zero. '
    + 'Why is that? Read on.',
  'orbit.demo.rVsD.s2': 'Let me mark D\'s peak radius — 1 a₀ — in the 3D view. To make that shell stick out, '
    + 'I raise the isosurface threshold a little, so the ball shrinks. See: **one point** on the horizontal '
    + 'axis of the radial plot is a thin **spherical shell** in 3D. That is where the "shells" of an atom '
    + 'come from.',
  'orbit.demo.rVsD.s3': 'Why the extra r²? Because a **probability** is the probability density multiplied '
    + 'by the volume of that shell, and the volume of a spherical shell is proportional to r². The density at '
    + 'the origin is the largest, but that shell occupies almost no volume. So "the densest place" and "the '
    + 'most likely place" part company — which is exactly why R(r) and D(r) must be discussed separately.',
  'orbit.demo.complexReal.title': 'Real and complex orbitals: same energy, two appearances',
  'orbit.demo.complexReal.s0': 'Start with 2p in the complex solution, m = +1. Its density is a **ring** — '
    + 'why a ring? The phase of a complex solution is e^{imφ}, and after taking the modulus |e^{imφ}| = 1, so '
    + 'the azimuth φ is eliminated completely. Go once around the z axis and the density does not change at '
    + 'all, so it must be an axially symmetric ring.',
  'orbit.demo.complexReal.s1': 'But φ has not really disappeared — it is hidden in the **phase**. Switch to '
    + 'the phase plot of the xy section: going once around the origin, the colour cycles continuously through '
    + 'one full turn, so the phase completes exactly **1** period. That is the meaning of |m| = 1. Still, for '
    + 'l = 1 the magnetic quantum number only reaches ±1, so to see more winding we need another orbital.',
  'orbit.demo.complexReal.s2': 'Switch to 3d with m = +2. Still the xy section, still the phase plot — and '
    + 'going once around, the colour cycles **twice**. **|m| is the number of periods per turn.** The energy '
    + 'has changed with the principal quantum number, but within one l the value of m does not affect the '
    + 'energy: for 3d, m = 1 and m = 2 have exactly the same energy; only the beat around the z axis differs.',
  'orbit.demo.complexReal.s3': 'Now cut this orbital\'s complex solution into real solutions. The ring is '
    + 'gone, replaced by **lobes** with a clear direction. Notice: **the energy has not changed at all** '
    + '(n = 3 and l = 2 are untouched; only the basis changed). You can see it in the phase plot too: the '
    + 'real solution\'s phase takes only the two values 0 and π, two colours, no longer a continuously '
    + 'winding rainbow.',
  'orbit.demo.complexReal.s4': 'Since the energies are equal (degenerate), any linear combination of them is '
    + 'still a state of that same energy. So "a real orbital is a linear combination of complex orbitals" — '
    + 'they are not two different physics, but two bases of the same space, depending on which direction you '
    + 'slice it.',
  'orbit.demo.sectionModes.title': 'One section, three views: density / ψ / contours',
  'orbit.demo.sectionModes.s0': 'The 3D view gives you the **outer shape**; the section gives you the '
    + '**inner structure**. Let me fix a cut through 3d_z² in the xz plane and just watch what the three '
    + 'modes on the section card each have to say. The first is the **density plot**: the brighter the '
    + 'colour, the larger |ψ|². Two lobes above and below and one ring in the middle, perfectly clear; but '
    + 'the sign has been eaten by the square, so you cannot tell here which part is positive and which is '
    + 'negative.',
  'orbit.demo.sectionModes.s1': 'The second is the **ψ plot**: it draws ψ itself, so the signs separate '
    + 'immediately — neighbouring regions are **differently coloured**. And the boundary between the two '
    + 'colours is a **nodal surface**: in this section they are a few straight lines radiating from the '
    + 'origin. A different colour means "the wavefunction changed sign here", not "there are no electrons '
    + 'here".',
  'orbit.demo.sectionModes.s2': 'The third is the **contour plot**: the level lines are drawn one by one, '
    + 'like a topographic map. Look at these straight lines radiating from the origin — each one is a nodal '
    + 'surface. Counting them verifies the node formula: of the three modes, this is the one best suited to '
    + '"counting nodal surfaces".',
  'orbit.demo.sectionModes.s3': 'One set of data, three ways to draw it: the density plot answers "where is '
    + 'there more, where less", the ψ plot answers "how do the signs split and where are the nodal surfaces", '
    + 'and the contour plot answers "how many blocks and layers the structure is divided into". That is also '
    + 'why a floating window is opened — with the 3D view and the section on screen together, the shape and '
    + 'the interior can be compared.',
  'orbit.demo.sp3Tetrahedron.title': 'Hybridization: why methane is a tetrahedron',
  'orbit.demo.sp3Tetrahedron.s0': 'First, something easily overlooked: hybrid orbitals **need no new '
    + 'mathematics**. They still use the same wavefunctions that solve the hydrogen atom; we merely add '
    + 'several orbitals on the same atom in a particular ratio. Start with 2s: its isosurface is a sphere, '
    + 'the same from every direction — the s component has **no directionality at all**.',
  'orbit.demo.sp3Tetrahedron.s1': 'Now 2p_z: a **dumbbell** along the z axis. The directionality comes from '
    + 'p. So what do you get if you add a sphere (s) and a dumbbell (p) in a fixed ratio? The answer is an '
    + '**asymmetric shape with one big lobe and one small one** — reinforced in one direction, cancelled in '
    + 'the opposite one. That is hybridization.',
  'orbit.demo.sp3Tetrahedron.s2': 'This is the first sp³: ψ = ½(s + p_x + p_y + p_z). Watch two things: '
    + '① the big lobe points along the diagonal (1,1,1); ② behind it trails a small lobe of opposite sign, '
    + 'and at the same radius the size ratio is exactly **2 : 1**. Between them lies a **conical nodal '
    + 'surface** with a half angle of 109.47° — remember that angle. (Here I switch to the Slater type: its '
    + '2s and 2p share one radial function with no radial node, so the shape is purely angular — the clean '
    + 'lobe of the textbook. Under the hydrogenic type the s part puffs the orbital up.)',
  'orbit.demo.sp3Tetrahedron.s3': 'The other three sp³ orbitals are the same combination with the signs of '
    + 'p flipped, pointing to the other three vertices of the tetrahedron. Draw all four together — a '
    + '**regular tetrahedron**. The angle between any two is 109.47°, **the same number** as the half angle '
    + 'of that nodal cone: the nodal cone of one hybrid orbital passes exactly through the directions of the '
    + 'other three. That is no coincidence, and it can be checked in class from the coefficients.',
  'orbit.demo.sp3Tetrahedron.s4': 'Turn two off and keep just a pair, to see it more clearly: the angle '
    + 'between the two lobes is 109.47°. The four orbitals are completely **equivalent** (the s coefficient '
    + 'is +½ in all of them, so none is special) and pairwise **orthogonal** — which is exactly why each can '
    + 'hold one electron without conflicting with the others. The 109.5° bond angle of methane is these four '
    + 'directions.',
  'orbit.demo.sp3Tetrahedron.s5': 'The same recipe gives other direction counts: one s with two p gives '
    + 'three coplanar sp² orbitals at 120° (the plane of graphite and ethylene); with one p it gives two sp '
    + 'orbitals at 180° (the straight line of acetylene). **The s:p ratio determines the number of '
    + 'directions**: 1+3 gives four, 1+2 gives three, 1+1 gives two. A "hybridization scheme" is essentially '
    + 'that ratio.',

  // ===========================================================================
  // core/ —— keys with variables (registering the raw text cannot work)
  // ===========================================================================

  'orbit.shape.axisXY': 'oriented in the xy plane ({fn}{am}φ type)',
  'orbit.shape.rings': '{n} coaxial rings (separated by conical nodal surfaces)',
  'orbit.shape.lobes': '{n}-lobed',
  'orbit.math.label.complex': ' (complex)',
  'orbit.math.label.real': ' (real)',

  'orbit.formula.super.title': 'Superposition · {n} terms',
  'orbit.formula.super.sep': ', ',
  'orbit.formula.super.note':
    'The coefficients are renormalized proportionally so that Σ|<i>c</i>ᵢ|² = 1 (the basis of this program '
    + 'is orthonormal, so that is the only condition needed), so **only the ratios have physical meaning**; '
    + '|<i>c</i>ᵢ|² is the probability of projecting onto that term, and it equals the probability of '
    + '"measuring that eigenvalue" only when the term is an eigenstate of the observable being measured — {comps}',
  'orbit.formula.mSuffix': ' ({m})',
  'orbit.formula.title': '{orb} orbital{m} · {mode}',
  'orbit.formula.note.ls': '{n}s: spherically symmetric, no angular nodal surfaces; {nodes} radial nodes.',
  'orbit.formula.orient.complex':
    'The complex solution is axially symmetric about <i>z</i> (toroidal / conical), with the phase winding along the azimuth.',
  'orbit.formula.orient.cos':
    'cos({am}<i>φ</i>) type: the lobes open in one direction within the <i>xy</i> plane.',
  'orbit.formula.orient.sin':
    'sin({am}<i>φ</i>) type: its lobes are rotated by {deg}° about <i>z</i> relative to the '
    + 'cos({am}<i>φ</i>) type with the same |<i>m</i>|.',
  'orbit.formula.orient.m0': '<i>m</i>=0 type: an "olive" shape along <i>z</i>.',
  'orbit.formula.naming.highL':
    '(The {sub} subshell has no accepted common name — high-angular-momentum orbitals are classified in the '
    + 'literature only by symmetry. Here they are labelled by the Cartesian polynomial of the angular part: '
    + '<i>Y</i> = {poly} / <i>r</i>{pow}.)',
  'orbit.formula.note.nodes': '{radial} radial nodes, {angular} angular nodal surfaces; {orient}{naming}',

  'orbit.ps.view': '[Current view] {name}{chem}  n={n} l={l} m={m}{z}',
  'orbit.ps.zHlike': ' Z={z} (hydrogen-like, not hydrogen)',
  'orbit.ps.mode': '[Mode] viewing {target} / {wavefunction} / {render}',
  'orbit.ps.target.spherical': 'spherical harmonic Y',
  'orbit.ps.target.wave': 'full wavefunction ψ',
  'orbit.ps.iso': '[Isosurface] criterion {criterion}, threshold {pct}%',
  'orbit.ps.charts': '[Charts] radial [{radial}]; spherical-harmonic criterion {angular}; section {plane}/{mode}{term}',
  'orbit.ps.charts.term': '; term for radial/ΘΦ={radialTerm}, for section={sectionTerm}',
  'orbit.ps.term.superRadial': 'term #1 (these two charts do not support superpositions)',
  'orbit.ps.term.superSection': 'the whole superposition',
  'orbit.ps.interaction': '[Interaction] idle {idle}s; toggle count {toggles}; recent actions {recent}',
  'orbit.ps.super': '[Superposition] {count} terms, relative phase {phase}π: {terms}',
  'orbit.ps.demo': '[Demo] #{id} ({origin}) {state} · step {index}/{total}{waiting}{next}',
  'orbit.ps.origin.unknown': 'unknown origin',
  'orbit.ps.playing': 'playing',
  'orbit.ps.finished': 'finished',
  'orbit.ps.waiting': ' (waiting for the student to press "next step")',
  'orbit.ps.next': '; next: {action}',
  'orbit.ps.nextDone': '; finished',
  'orbit.ps.demoList': '[Demo list] {list}',
  'orbit.ps.demoItem': '#{id}({steps} steps{current}{label})',
  'orbit.ps.demoItem.current': ' ·current',
  'orbit.ps.demoRevise':
    '(if the student asks for a change, use reviseDemo with the demo_id and step number — do not resend the whole demo)',

  'orbit.qe.radialNodes.stem':
    'For the **{name}** orbital, how many **radial nodes** (spherical-shell nodal surfaces) does it have?',
  'orbit.qe.radialNodes.exp':
    'radial nodes = n − l − 1 = {n} − {l} − 1 = **{radial}**.\n'
    + '(For the same shell n = {n} the angular nodal surfaces number {angular} and the total nodes number '
    + '{total} — the three are easily confused.)',
  'orbit.qe.angularNodes.stem': 'For the **{name}** orbital, how many **angular nodal surfaces** does it have?',
  'orbit.qe.angularNodes.exp': 'angular nodal surfaces = l = **{angular}**.',
  'orbit.qe.totalNodes.stem': 'What is the **total number of nodes** of the **{name}** orbital?',
  'orbit.qe.totalNodes.exp':
    'total nodes = n − 1 = **{total}**, **independent of l**.\n'
    + 'That is exactly where "within one shell, as l grows the radial nodes decrease and the angular nodal '
    + 'surfaces increase while the total stays the same" comes from.',
  'orbit.qe.energy.stem': 'What is the energy of the hydrogen **{n}s** orbital, approximately, in eV? (E_n = −13.6/n²)',
  'orbit.qe.energy.exp': 'E_{n} = −13.6 / {n}² = **{E} eV**. For hydrogen the energy depends only on n.',
  'orbit.qe.degeneracy.stem': 'How many **orbitals** are there in the **n = {n}** shell (ignoring spin)?',
  'orbit.qe.degeneracy.exp': 'orbital count of shell n = n² = **{d}** (with spin, 2n² = {d2}).',
  'orbit.qe.radialPeak.stem':
    'For the **{name}** orbital, what is the radius of **maximum probability**, approximately? (in a₀)',
  'orbit.qe.radialPeak.exp':
    '**Note**: take the extremum of the radial distribution function D(r) = r²R(r)²; its main peak is at '
    + '**r ≈ {main} a₀**.\n'
    + 'Using the peak of R(r) by mistake gives r=0 (R is largest at the origin), but the shell volume there '
    + 'tends to zero so the probability is actually the smallest — the classic trap of '
    + '"largest amplitude ≠ largest probability".',
  'orbit.qe.angGeo.both': '{cones} cones + {planes} planes',
  'orbit.qe.angGeo.cones': '{cones} cones',
  'orbit.qe.angGeo.planes': '{planes} planes',
  'orbit.qe.angGeo.stem': 'What shape are the angular nodal surfaces of the real orbital **{name}**?',
  'orbit.qe.angGeo.wPlanesCones': '{planes} cones',
  'orbit.qe.angGeo.wConesPlanes': '{cones} planes',
  'orbit.qe.angGeo.wAllCones': '{n} cones',
  'orbit.qe.angGeo.exp':
    'Computed by math.js: this orbital has **{shape}**.\n'
    + '★ A common misconception is that "angular nodal surfaces are always planes" — but P_l^{|m|}(cosθ)=0 '
    + 'gives **cones**; only cos(mφ)/sin(mφ)=0 gives planes.',
  'orbit.qe.rVsD.stem': 'For the **{name}** orbital, which of the following statements is correct?',
  'orbit.qe.nodesReverse.opt': 'n = {n}, l = {l}',
  'orbit.qe.psiVsPsi2.stemF':
    'If the isosurface criterion reads **{pct}%** on the **|ψ|²** scale, what is the equivalent reading on the **|ψ|** scale?',
  'orbit.qe.psiVsPsi2.stemR':
    'If the isosurface criterion reads **{pct}%** on the **|ψ|** scale, what is the equivalent reading on the **|ψ|²** scale?',
  'orbit.qe.psiVsPsi2.expF':
    '|ψ| = c ⟺ |ψ|² = c², so {pct}% = ({root}%)².\n'
    + '★ The two are **the same family of surfaces**; switching the criterion only changes the meaning of the '
    + 'reading, not the family of shapes.',
  'orbit.qe.psiVsPsi2.expR':
    '|ψ| = {root}% ⟹ |ψ|² = ({root}%)² = **{pct}%**.\n'
    + '★ For the same reading, the absolute threshold computed on the |ψ| scale is smaller, so the surface is **larger**.',
  'orbit.qe.meanRadius.stem':
    'For a hydrogen atom in the **{name}** state, what is the **mean distance ⟨r⟩** of the electron from the nucleus, approximately? (in a₀)',
  'orbit.qe.meanRadius.exp':
    '⟨r⟩ = (a₀/2)[3n² − l(l+1)] = (1/2)[3×{n}² − {l}×{l1}] = **{v} a₀**.\n'
    + 'Note that it is smaller than the "most probable radius" (≈n²a₀) — D(r) peaks far out, whereas ⟨r⟩ is an '
    + 'average weighted over all space.',
  'orbit.qe.angleToZ.stem':
    'In the **complex solution** {psi}, what is the angle between the electron\'s orbital angular momentum vector and the z axis, approximately?',
  'orbit.qe.angleToZ.exp':
    'cosθ = m / √(l(l+1)) = {m} / √({l}×{l1}) ⇒ θ = **{correct}**.\n'
    + '★ A common mistake is to use cosθ = m/l (treating $L_z/L$ as m/l); the correct denominator is '
    + '√(l(l+1)), not l.\n'
    + 'In particular: for m = ±l the angle is the smallest but is not 0 (the angular momentum can never be '
    + 'parallel to z); for m = 0 the angle is 90°.\n'
    + '★ This question **only holds for the complex solutions**: the eigenstates of L̂z are ψ_{n,l,m} (complex), '
    + 'whereas a real solution is built from the two complex solutions ±m and is no longer an eigenfunction of '
    + 'L̂z, so asking "what is its L_z" is meaningless.',
  'orbit.qe.energySplit.stem':
    'For a hydrogen atom in the **{n}s** state, what is the **mean potential energy ⟨V⟩**, approximately, in eV? (virial theorem)',
  'orbit.qe.energySplit.exp':
    'Virial theorem (Coulomb potential): 2⟨T⟩ = −⟨V⟩, and ⟨E⟩ = ⟨T⟩ + ⟨V⟩.\n'
    + 'From E_{n} = −13.6/{n}² = {E} eV we get **⟨V⟩ = 2⟨E⟩ = {V} eV** and ⟨T⟩ = {T} eV.\n'
    + '★ Note that ⟨V⟩ is twice ⟨E⟩ (more negative), while the kinetic energy is exactly −⟨E⟩ > 0.',
  'orbit.qe.err.buildFailed': 'Question generation failed: the template is unusable (knowledge point {kp})',
  'orbit.qe.err.noOriginal': 'Original question not found: {id}',
  'orbit.qe.card.kp': '{kp} · difficulty {difficulty}',
  'orbit.qe.agent.explain':
    'Please explain knowledge point {kp} ({name}). First fetch the explanation script with explainConcept, '
    + 'then use applySceneActions to **demonstrate** the key conclusions from that script (do not just read the '
    + 'text out). Keep it within about 300 words and finish with a one-sentence summary.',
  'orbit.qe.agent.wrong':
    'The student answered this question incorrectly (questionId={id}; they chose option {chosen}, and the '
    + 'correct one is option {correct}). Call diagnoseError to obtain the error cause and the diagnostic '
    + 'actions, **do not state the correct answer directly**; instead switch the view to a state that exposes '
    + 'the root of the error and guide the student to see it for themselves.',
  'orbit.qe.agent.right':
    'The student answered this question correctly (questionId={id}). First call startFeynmanCheck to invite '
    + 'them to retell it in their own words, moving from recognition to generation.',

  'orbit.qe.c.k6px.stem': 'Which two complex orbitals can the **$p_x$** orbital be built from as a linear combination?',
  'orbit.qe.c.k6px.correct': 'm = +1 and m = −1',
  'orbit.qe.c.k6px.w1': 'm = 0 and m = +1',
  'orbit.qe.c.k6px.w2': 'm = 0 and m = −1',
  'orbit.qe.c.k6px.w3': 'm = +1 and m = +1',
  'orbit.qe.c.k6px.exp':
    'A real orbital is a linear combination of complex orbitals: $p_x \\propto (Y_1^{-1} - Y_1^{+1})$.\n'
    + 'Because the three are degenerate in energy, the combination is still a legal eigenstate.',
  'orbit.qe.c.k6sym.stem': 'Why is the density of a **complex** solution axially symmetric about z, while a real solution shows directed lobes?',
  'orbit.qe.c.k6sym.correct': 'the complex solution contains e^{imφ}, and after taking the modulus |e^{imφ}| = 1, so φ disappears',
  'orbit.qe.c.k6sym.w1': 'the electron in a complex solution rotates about the z axis (classical picture)',
  'orbit.qe.c.k6sym.w2': 'a complex solution has a smaller l',
  'orbit.qe.c.k6sym.w3': 'a complex solution has no angular nodal surfaces',
  'orbit.qe.c.k6sym.exp':
    '|Y_l^m|² = N²P²·|e^{imφ}|² = N²P², independent of φ → axially symmetric about z.\n'
    + 'A real function contains cos(mφ)/sin(mφ), which still depends on φ after taking the modulus → directed lobes.',
  'orbit.qe.c.k7phase.stem': 'Why is **phase** not "redundant mathematics"?',
  'orbit.qe.c.k7phase.correct':
    'phase determines how wavefunctions add up: in phase they reinforce, out of phase they cancel — the origin of bonding/antibonding',
  'orbit.qe.c.k7phase.w1': 'phase is only an intermediate quantity in the calculation and has no physical meaning',
  'orbit.qe.c.k7phase.w2': 'phase corresponds to the spin direction of the electron',
  'orbit.qe.c.k7phase.w3': 'phase only affects the magnitude of the energy',
  'orbit.qe.c.k7phase.exp':
    'The probability density only uses |ψ|², but when two states are superposed the interference term in '
    + 'ψ = ψ₁ + ψ₂ depends on the relative phase:\n'
    + 'in phase → reinforcement (bonding), out of phase → cancellation (antibonding). That is the '
    + 'quantum-mechanical origin of the chemical bond.',
  'orbit.qe.c.k7sign.stem': 'What do the two differently coloured lobes of a **real** orbital represent?',
  'orbit.qe.c.k7sign.correct': 'the same wavefunction taking a positive or negative sign in different regions (phase 0 or π)',
  'orbit.qe.c.k7sign.w1': 'two different electron clouds',
  'orbit.qe.c.k7sign.w2': 'two different orbitals',
  'orbit.qe.c.k7sign.w3': 'the two spin orientations of the electron',
  'orbit.qe.c.k7sign.exp':
    'A real function has only two phases, 0 and π, which is why it appears in two colours.\n'
    + 'The surface separating them is a nodal surface — the phase flips there.\n'
    + 'It is not "two electrons" but different sign regions of one and the same wavefunction.',
  'orbit.qe.c.k7wind.stem': 'What happens to the phase of the complex orbital e^{imφ} when you go once around the z axis (φ: 0→2π)?',
  'orbit.qe.c.k7wind.correct': 'the phase increases by 2πm, i.e. it winds m times',
  'orbit.qe.c.k7wind.w1': 'the phase does not change (because |e^{imφ}|=1)',
  'orbit.qe.c.k7wind.w2': 'the phase increases by 2π, independent of m',
  'orbit.qe.c.k7wind.w3': 'the phase increases by πm',
  'orbit.qe.c.k7wind.exp':
    'arg = mφ, so when φ completes 2π, arg increases by 2πm.\n'
    + '★ The **phase plot on the section card** shows this directly: going once around the origin in the xy '
    + 'section, m=1 completes one full turn of phase and m=2 completes two.',
  'orbit.qe.c.k7bond.stem': 'Why can |ψ|² alone not explain "why a chemical bond forms"?',
  'orbit.qe.c.k7bond.correct': 'because bonding depends on the phase relation, and |ψ|² throws the phase information away',
  'orbit.qe.c.k7bond.w1': 'because |ψ|² is too complicated to compute',
  'orbit.qe.c.k7bond.w2': 'because |ψ|² only applies to s orbitals',
  'orbit.qe.c.k7bond.w3': 'because |ψ|² is not an observable',
  'orbit.qe.c.k7bond.exp':
    '|ψ|² is the observable probability density, but it **discards the phase**.\n'
    + 'When two atomic orbitals approach, in-phase superposition raises the electron density between them '
    + '(bonding) while out-of-phase superposition creates a nodal surface there (antibonding) — the difference '
    + 'comes entirely from the phase.',
  'orbit.qe.c.k9stat.stem': 'Is the superposition **2ψ_{3dz²} + 3ψ_{3dxy}** a stationary state?',
  'orbit.qe.c.k9stat.correct': 'Yes — the two terms are degenerate in energy',
  'orbit.qe.c.k9stat.w1': 'No — every superposition changes with time',
  'orbit.qe.c.k9stat.w2': 'No — because the coefficients are unequal',
  'orbit.qe.c.k9stat.w3': 'Cannot tell',
  'orbit.qe.c.k9stat.exp':
    'Both terms belong to n=3, l=2, so they are **degenerate in energy**. The overall time factor e^{−iEt/ħ} '
    + 'can be taken outside the sum and\nvanishes after taking the modulus → the density **does not change with '
    + 'time**, so the state is still stationary.\n'
    + '★ Only a superposition of states with **different energies** is non-stationary.',
  'orbit.qe.c.k9lz.stem':
    'For the superposition $\\psi = \\sum_i c_i \\psi_i$, what is the probability of measuring the observable $L_z$ with value $\\hbar m$?',
  'orbit.qe.c.k9lz.correct': 'the sum of |cᵢ|² over all terms with mᵢ = m',
  'orbit.qe.c.k9lz.w1': 'the largest |cᵢ|²',
  'orbit.qe.c.k9lz.w2': 'Σ|cᵢ|²  (always 1)',
  'orbit.qe.c.k9lz.w3': 'cᵢ itself',
  'orbit.qe.c.k9lz.exp':
    'Measurement postulate: the probability of measuring the eigenvalue a is the sum of the squared moduli of '
    + 'the coefficients of the corresponding eigenstates, P(a) = Σ_{aᵢ=a}|cᵢ|².\n'
    + 'The expectation value is ⟨Â⟩ = Σ|cᵢ|²aᵢ.',
  'orbit.qe.c.k9sp3.stem': 'Which atomic orbitals combine to form an **sp³** hybrid orbital?',
  'orbit.qe.c.k9sp3.correct': 'one s and three p ($p_x$, $p_y$, $p_z$)',
  'orbit.qe.c.k9sp3.w1': 'one s and two p',
  'orbit.qe.c.k9sp3.w2': 'two s and two p',
  'orbit.qe.c.k9sp3.w3': 'three s and one p',
  'orbit.qe.c.k9sp3.exp':
    '$sp^3 = \\frac{1}{2}(s + p_x + p_y + p_z)$: 4 equivalent hybrid orbitals pointing to a regular '
    + 'tetrahedron, 109.5° apart.\n'
    + '★ A hybrid orbital is a **special case of a superposition**, with the coefficients fixed uniquely by symmetry.',
}

registerDict('orbit', { zh, en, text })
