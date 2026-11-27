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
}, textGen)

registerDict('crystal', { zh, en, text })
