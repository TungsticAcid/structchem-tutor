/**
 * i18n.js —— 晶体模块的中英词典
 *
 * ---------------------------------------------------------------------------
 * 为什么用**相对路径**而不是 `@i18n/index.js`
 * ---------------------------------------------------------------------------
 * `@i18n` 是 vite 的别名，Node 不认；而覆盖率守卫（`tools/check-i18n.mjs`）
 * 是**在 Node 里 import 本文件**来读"登记了哪些原文"的 —— 用别名的话守卫
 * 一 import 就报"读不了字典"，而它只警告后跳过，于是 crystal 区会**永远显示 0 覆盖**。
 *
 * 本文件只做**汇总与注册**，纯数据：不 import DOM、不 import three、不 import 运行时。
 * 三张表分别来自：
 *   · `i18n-gen.js`   —— 由"英文清单 + 源码里的中文原文"生成（`text` 表的主体）
 *   · `i18n-keys.js`  —— 由 extract-vars / gen-keys 生成的**带变量**串（zh + en）
 *   · 本文件下方       —— 少量手写条目（键式，或生成器看不见的位置）
 *
 * ---------------------------------------------------------------------------
 * 两张表的分工（详见 packages/i18n/index.js 顶部）
 * ---------------------------------------------------------------------------
 *   `text`：中文原文 → 英文。给 `tsrc()` / DOM 扫描替换（sweep）用。**键必须与
 *           源码里的字面量逐字节一致**（含 `**`、全角标点、上下标）。
 *   `zh`/`en`：键 → 文案。给带变量的 `t('key', { p1 })` 用 —— 那种串每次值都不同，
 *           扫描替换救不了。
 *
 * ★ 生成文件**不要手改**：改 `tmp/i18n/en/*.txt` 或 `tmp/i18n/en-vars.txt` 后重跑
 *   `node tmp/i18n/gen-text.mjs` 与 `node tmp/i18n/gen-keys.mjs`。
 */
import { registerDict } from '../../packages/i18n/index.js'
import { text as textGen } from './i18n-gen.js'
import { zh as zhGen, en as enGen } from './i18n-keys.js'

/** 键 → 中文（手写部分：生成器看不见的位置，或本文件自身的键） */
export const zh = Object.assign({
  // ★ 与 descriptor 的 title 保持一致（取自参赛配图）
  'crystal.title': '晶典在线',

  // ---- 代码里拼出来的短标签 ----
  'crystal.common.none': '（无）',
  'crystal.quiz.toDiagnose': '待诊断',
  'crystal.quiz.uncategorized': '未归类',
  'crystal.quiz.judgeTrue': '正确',
  'crystal.quiz.judgeFalse': '错误',
  'crystal.quiz.pointSep': '；',
  'crystal.quiz.listSep': '、',
  'crystal.quiz.availTopics': '（可用：{list}）',

  // ---- 拼出来的名字 / 标签（整串换键做不到，见各自的调用点）----
  'crystal.q.stackingOption': '{code}（{name}）',
  'crystal.elem.item': '{sym} {name}（{n}号）',

  // ---- 感知层给模型看的紧凑状态（facade.perception.formatCompact）----
  'crystal.perception.state': '【当前状态】模块 {module}{crystal}；图层 {layers}',
  'crystal.perception.interaction': '【交互】空闲 {idle}s；切换次数 {toggles}；最近动作 {recent}',
  'crystal.perception.appearance': '【外观】原子缩放 {scale}；透明度 {opacity}',

  // ---- 练习界面的拼装句（quiz/ui.js）----
  'crystal.t.ui.1': '判分失败：{p1}',
  'crystal.t.ui.2': '错因：{p1}',
  'crystal.t.ui.3': '错因类型：{p1}（{p2}）。',
  'crystal.t.ui.4': '可参考的引导话术：{p1}',
  'crystal.t.ui.5': '有 {p1} 个动作没被接受',
  'crystal.t.ui.6': '开始练习：{p1}（共 3 种题型轮换，随时可退出）',
  'crystal.t.ui.7': '练习结束：共作答 {p1} 题，答对 {p2} 题',
  'crystal.t.ui.8': '第 {p1} 题',
  'crystal.t.ui.9': '你的作答：{p1}',
  'crystal.t.ui.10': '要点：{p1}',

  // ★ 用户报「NaCl 演示打开了八面体空隙」：拒绝时给出正确的替代演示。
  'crystal.t.facade.4': '当前是 {p1}：它不是最密堆积，没有 {p2} 的可显示数据，打开也不会有内容。'
    + '想看 Cl⁻ 的八面体空隙，请用「并排对比」：一侧放 NaCl、另一侧放 Cu（fcc），两侧都关掉化学键，'
    + '在 Cu 一侧打开八面体空隙——这些空隙的位置正好对应 NaCl 中的 Na⁺。',
  'crystal.t.facade.7': '★ 另外注意：octahedral / tetrahedral 是「空隙位置」标记，不是「配位多面体」。'
    + '要讲某个离子的配位环境，请用 highlightAtoms 高亮中心离子与其近邻，或用 setAtomVisibility 隐去同号离子；'
    + '不要把空隙图层当作配位多面体。',
  'crystal.t.facade.6': '当前视图不支持并排对比（需先打开一个晶体，或带上第一个晶体的 id：openCompareView({a, b})）。',
  'crystal.t.facade.5': '透明度 {p1}% 会让原子几乎不可见，后面讲什么都看不清。'
    + '演示中请用 30%~50% 的透明度，并在讲解结束时恢复为 0；更透的效果请让学生自己在控制面板调。',
}, zhGen)

/** 键 → 英文 */
export const en = Object.assign({
  'crystal.title': 'Crystal Atlas',

  'crystal.common.none': '(none)',
  'crystal.quiz.toDiagnose': 'to be diagnosed',
  'crystal.quiz.uncategorized': 'unclassified',
  'crystal.quiz.judgeTrue': 'True',
  'crystal.quiz.judgeFalse': 'False',
  'crystal.quiz.pointSep': '; ',
  'crystal.quiz.listSep': ', ',
  'crystal.quiz.availTopics': ' (available: {list})',

  'crystal.q.stackingOption': '{code} ({name})',
  'crystal.elem.item': '{sym} {name} (No. {n})',

  'crystal.perception.state': '[State] module {module}{crystal}; layers {layers}',
  'crystal.perception.interaction': '[Interaction] idle {idle}s; toggles {toggles}; recent actions {recent}',
  'crystal.perception.appearance': '[Appearance] atom scale {scale}; opacity {opacity}',

  'crystal.t.ui.1': 'Marking failed: {p1}',
  'crystal.t.ui.2': 'Error cause: {p1}',
  'crystal.t.ui.3': 'Error-cause type: {p1} ({p2}).',
  'crystal.t.ui.4': 'A guiding remark you may use: {p1}',
  'crystal.t.ui.5': '{p1} actions were not accepted',
  'crystal.t.ui.6': 'Starting practice: {p1} (three question types rotate; you can leave at any time)',
  'crystal.t.ui.7': 'Practice finished: {p1} questions attempted, {p2} correct',
  'crystal.t.ui.8': 'Question {p1}',
  'crystal.t.ui.9': 'Your answer: {p1}',
  'crystal.t.ui.10': 'Key points: {p1}',

  'crystal.t.facade.4': 'Current crystal: {p1}. It is not a closest-packed structure and has no data for {p2}; '
    + 'opening that layer would show nothing. To show the Cl⁻ octahedral voids, use "Compare side by side": '
    + 'NaCl on one side, Cu (fcc) on the other, turn bonds off on both sides, and open octahedral voids on the Cu side — '
    + 'those void positions correspond exactly to the Na⁺ positions in NaCl.',
  'crystal.t.facade.7': '★ Also note: octahedral / tetrahedral mark **void positions**, not a coordination polyhedron. '
    + 'To show an ion\u2019s coordination environment, highlight the central ion and its neighbours with highlightAtoms, '
    + 'or hide the same-charge ions with setAtomVisibility — do not use the void layers as a coordination polyhedron.',
  'crystal.t.facade.6': 'The current view cannot open a side-by-side comparison. Open a crystal first, '
    + 'or pass the first crystal id: openCompareView({a, b}).',
  'crystal.t.facade.5': 'Opacity {p1}% would make the atoms almost invisible, so nothing after it can be seen. '
    + 'Use 30%–50% during a demonstration and restore it to 0 at the end; for stronger transparency, let the student '
    + 'adjust the control panel directly.',
}, enGen)

/**
 * 中文原文 → 英文。
 * ★ 绝大部分条目由 `tmp/i18n/gen-text.mjs` 生成（键直接取自源码字面量，
 *   逐字节一致是构造出来的，不是校对出来的）；这里只补生成器看不见的零头。
 *
 * ★ 下面两条是**手写补的**：它们正文里带 `{id, name, ...}` / `({questionId, chosenIndex})`
 *   这种**字面大括号**（不是模板插值），生成器把它们误判成"含变量的串"而跳过。
 *   它们是普通字符串，扫描替换认得，所以进 `text` 表即可。
 */
export const text = Object.assign({
  // ★ 守卫改成"按行切片段 + 只把 `<字母` 当标签"之后，这一行从"被当成 HTML 标签吞掉"
  //   变成必须登记（它是宿主注入清单里的说明，装配期给人看）。
  '() => Set<图层名>：练习未作答时不许打开的图层。★ 缺省时**没有这道闸**——这是刻意的：它不是「能力」，是宿主自己要不要设的纪律。但宿主应当知道，不给它就没有结构性防护（提示词劝不住模型）。':
    '() => Set<layer name>: layers that must not be opened while a practice question is unanswered. ★ When absent there is **no such gate** — deliberately: it is not a "capability" but a discipline the host chooses to impose. The host should know, however, that without it there is no structural protection (prompts do not stop the model).',
  '晶体索引（crystalIndex：[{id, name, ...}]）。模块用它校验 id 合法性、生成 id 清单（listIds）。缺了它，openCrystal 会把每一个 id 都判为「未知」，模块看起来在跑，其实一句都答不上来。':
    'The crystal index (crystalIndex: [{id, name, ...}]). The module uses it to validate ids and to build the id list (listIds). Without it, openCrystal judges every id "unknown": the module looks like it is running but cannot answer a single question.',
  '答案已由程序算定并冻结在本地。请把题干与 4 个选项原样呈现给学生，**不要猜测或提示答案**；学生作答后调用 checkAnswer({questionId, chosenIndex})，判定与解析由本地完成。★ questionView 可以下发作「题境演示」（它只切晶体、开原子与线框）；但**作答前不得打开对称元素 / 空隙 / 点阵点 / 辅助几何等图层**——那会让学生从画面上直接读出答案，等于泄题。':
    'The answer has been computed in code and frozen locally. Present the stem and the 4 options to the student exactly as given — **do not guess or hint at the answer**; once the student answers, call checkAnswer({questionId, chosenIndex}) and the marking and explanation are done locally. ★ questionView may be sent as a "question-setting demonstration" (it only switches crystal and shows atoms and bonds); but **before the student answers you must not open layers such as symmetry elements / interstices / lattice points / auxiliary geometry** — that would let them read the answer straight off the screen, which gives it away.',
  // ★ 周期表分区的位置表标签（`periodic-layout.js` 的 PERIODIC_ROW_LABELS）
  '镧系': 'Lanthanides',
  '锕系': 'Actinides',
  // ★ 「逐元素配色」改周期表时改动了标签与 hint（去掉"（103 个元素）"、说明改成按周期表点选）。
  //   原键由生成器写进 `i18n-gen.js`，改文案后新串必须在**本区**重新登记
  //   （守卫按区域算覆盖，跨区同名不互相遮盖）。
  '逐元素配色': 'Per-element colors',
  '按周期表点一个元素选中它，再取色即生效；可只恢复选中的那一个，也可清空全部自定义':
    'Click an element on the periodic table to select it, then pick a colour; you can reset just the selected element, or clear all customisations.',
  '当前晶体': 'the current crystal',
  '先调出 NaCl，并关掉与离子配位无关的图层，只留原子、化学键与晶胞框。':
    'Bring up NaCl first, and turn off the layers unrelated to ionic coordination — keep only atoms, bonds, and the cell frame.',
  'id 请原样使用，不要改写或推断。interstices=true 才有空隙图层；NaCl 等非最密堆积没有空隙数据，要讲 Cl⁻ 八面体空隙请用 Cu（fcc）做并排对比。':
    'Use ids exactly as returned; do not rewrite or infer them. Only interstices=true crystals have void layers; '
    + 'NaCl and other non-closest-packed structures have no void data — to teach the Cl⁻ octahedral voids, compare with Cu (fcc) side by side.',
  '以上为数据字段原文，未做推导。interstices=false 表示没有空隙图层；NaCl 等非最密堆积要讲 Cl⁻ 八面体空隙，请用 Cu（fcc）并排对比。':
    'The fields above are verbatim data, not derived. interstices=false means there is no void layer; '
    + 'for the Cl⁻ octahedral voids in NaCl and other non-closest-packed structures, compare with Cu (fcc) side by side.',
  '一次开关多个图层（只改列出的键，未列出的保持原状；演示开始应先 resetLayers 建基线）':
    'Toggle several layers at once (only the listed keys change; call resetLayers first to establish a clean demo baseline).',
  '重置图层': 'Reset layers',
  '恢复干净教学基线：关掉空隙/对称元素/点阵点/标签/辅助几何，只留原子、晶胞线框与晶轴；演示开始先调它，避免继承上一画面的特殊图层':
    'Restore a clean teaching baseline: turn off voids, symmetry elements, lattice points, labels and auxiliary geometry, '
    + 'leaving only atoms, the cell wireframe and axes. Call it first so a demo does not inherit special layers from the previous view.',
  '调整原子缩放 / 键粗细 / 透明度。透明度 0~0.5（0.9 几乎看不见），演示结束请恢复 0；越界值会被夹到允许区间':
    'Adjust atom scale, bond radius and opacity. Opacity is 0–0.5 (0.9 is almost invisible); restore it to 0 at the end of a demo. Out-of-range values are clamped.',
  '调整透明度': 'Adjust opacity',
  '对比页暂不支持只换左侧晶体——请重新打开这一组对比':
    'The compare page cannot swap only the left crystal — please reopen this comparison.',
  '可选：指定题型。C1 latticeType；C2 structuralUnitAtoms / atomsInCell；C3 stacking / spaceUtilization；C4 coordinationNumber / polyhedron；C5 intersticesInCell / intersticePerSphere；C6 spaceGroup；C7 cellVolume / density / nearestNeighbor；C8 structureProperty':
    'Optional: which question type. C1 latticeType; C2 structuralUnitAtoms / atomsInCell; C3 stacking / spaceUtilization; '
    + 'C4 coordinationNumber / polyhedron; C5 intersticesInCell / intersticePerSphere; C6 spaceGroup; '
    + 'C7 cellVolume / density / nearestNeighbor; C8 structureProperty',
  // ---- 空间利用率题的干扰项错因（答错时用来诊断"是怎么算错的"）----
  '把最密堆积的 74.05% 当成了本题的答案（A1 与 A3 相同）':
    'Took the closest-packing value 74.05% as the answer (A1 and A3 share it).',
  '按体心立方（4r = a√3）算的': 'Computed it as body-centred cubic (4r = a√3).',
  '按简单立方（π/6，球沿棱相切）算的': 'Computed it as simple cubic (π/6, spheres touching along the edge).',
  '按金刚石型（4r = a√3/4）算的': 'Computed it as the diamond type (4r = a√3/4).',
  '把球半径当成 a/4 算的（面心立方的关系记反了）':
    'Took the sphere radius as a/4 (the face-centred-cubic relation was inverted).',
  '正八面体空隙（空隙位置标记，不是配位多面体）':
    'Octahedral void (a void-position marker, not a coordination polyhedron)',
  '正四面体空隙（空隙位置标记，不是配位多面体）':
    'Tetrahedral void (a void-position marker, not a coordination polyhedron)',
  // ---- 预置演示「借 Cu 型看 NaCl 的八面体空隙」 ----
  '借 Cu 型看 NaCl 的八面体空隙': 'Reading NaCl\u2019s octahedral voids through Cu (fcc)',
  'NaCl 本身没有空隙图层：用 Cu（fcc）的八面体空隙位置对应 Na⁺，是讲岩盐型结构的标准做法':
    'NaCl itself has no void layer; using the octahedral-void positions of Cu (fcc) to mark the Na⁺ sites is the standard way to teach the rock-salt structure.',
  'NaCl 不是最密堆积，本身没有空隙图层。要讲 Cl⁻ 围成的八面体空隙，用并排对比：左边 NaCl，右边 Cu 型。':
    'NaCl is not a closest-packed structure and has no void layer of its own. To show the octahedral voids formed by Cl⁻, compare side by side: NaCl on the left, Cu on the right.',
  '两侧都关掉化学键——接下来要看的不是成键，而是"球与球之间有没有位置"。':
    'Turn bonds off on both sides — what we need to see next is not bonding but whether there is a site between the spheres.',
  '打开空隙图层与八面体空隙。注意左侧 NaCl 不会出现任何空隙标记——它没有这类数据；右侧 Cu 出现了。':
    'Turn on the void layer and octahedral voids. Note that the left (NaCl) shows no void marks at all — it has no such data; the right (Cu) does.',
  '把 Cu 的原子缩小一点，空隙位置更清楚；这些八面体空隙在晶胞里正好是 4 个。':
    'Shrink the Cu atoms a little so the void positions are clearer; there are exactly four octahedral voids in the cell.',
  '★ 关键对应：Cu 的八面体空隙位置，正好是 NaCl 中 Na⁺ 所在的位置。把 Na 高亮，与右侧的空隙标记对照着看。':
    '★ The key correspondence: the octahedral-void positions in Cu are exactly where the Na⁺ ions sit in NaCl. Highlight Na and read it against the void marks on the right.',
  '所以 NaCl 的 6 配位可以这样理解：Cl⁻ 按立方最密堆积排列，Na⁺ 填满其中全部八面体空隙——空隙全填，就是岩盐型。':
    'So NaCl\u2019s six-fold coordination reads like this: Cl⁻ forms a cubic closest packing and Na⁺ fills all of its octahedral voids — all voids filled is the rock-salt type.',
  '把两块晶体并排显示（跳转到对比视图）。a 可选（不给用当前晶体）；在库页/首页没有当前晶体时必须给 a。两个 id 都须真实存在且不相同':
    'Show two crystals side by side (jumps to the compare view). `a` is optional (defaults to the current crystal); '
    + 'on the library page or the portal, where there is no current crystal, you must pass `a`. Both ids must exist and differ.',
  'string（第一个晶体 id，可省略）': 'string (first crystal id, optional)',
  // ---- 2026-12-02：图层标签与动作气泡的"人话" ----
  // ★ 图层标签一律跟随**界面上那个开关**的写法：上游图层面板写「坐标轴 / 体对角线 /
  //   面对角线 / 点阵型式」，本模块原来写「晶轴 / 辅助体 / 辅助面 / 点阵点」——
  //   同一件事两个名字，学生听到旁白也找不到按钮。
  '坐标轴': 'Axes',
  '坐标轴（a/b/c 方向）': 'Axes (the a/b/c directions)',
  '体对角线（辅助线：按晶体类型画出的立方体体对角线）':
    'Body diagonal (an auxiliary line: the cube body diagonal drawn for this structure)',
  '面对角线（辅助线：面上那条对角线）':
    'Face diagonal (an auxiliary line: the diagonal across one face)',
  '点阵型式（打开后隐藏原子、只显示点阵）':
    'Lattice type (switching it on hides the atoms and shows only the lattice points)',
  // 这条是 assertPresetInvariants 的诊断文案（测试用），登记进本区以保持覆盖率 100%
  '旁白里出现了图层参数名：': 'the narration contains a layer parameter id:',
  '透明度': 'Opacity',
  // ---- E-UNC：错项没有登记错因时的通用诊断（2026-12-02）----
  '未归类的错解（按通用诊断处理）': 'Unclassified wrong answer (handled with the generic diagnosis)',
  '这道题的错项没有登记具体错因——说明错误不在"典型误区"里，需要回到结构本身重看一遍':
    'This wrong option has no registered cause — the mistake is not one of the classic misconceptions, '
    + 'so go back to the structure itself and look again',
  '这个选项不对。先把画面调回"能看清这一步"的状态，再一步步重数/重看，比猜更可靠。':
    'That option is not right. Bring the view back to a state where this step is visible, then recount and '
    + 're-check step by step — more reliable than guessing.',
  '先把图层恢复干净：只留原子与晶胞线框。':
    'Restore a clean set of layers first: keep only the atoms and the cell wireframe.',
  '回到等轴视角，先看清整个晶胞。': 'Return to the isometric view and take in the whole cell first.',
  '打开原子标签，逐个位置对着数一遍。': 'Turn on atom labels and count position by position.',
  '不要说「这题很简单」或直接给答案；要让学生自己重数一遍':
    'Do not say "this one is easy" or give the answer away; let the student recount it themselves',
  '你刚才是怎么数的？从哪一个位置开始？': 'How did you count just now? Which position did you start from?',
}, textGen)

registerDict('crystal', { zh, en, text })
