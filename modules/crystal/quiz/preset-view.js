/**
 * preset-view.js — 预置观察状态：把「题目」与「三维结构」绑起来
 *
 * 每道题携带一个 `presetView`，学生在反馈卡上点「去看结构」时跳回三维视图，
 * 并**预置好能回答这道题的观察状态**。这是"练习—结构双向闭环"的实现，
 * 也是赛事要求"区别于纯问答型大模型"的硬指标之一。
 *
 * ★ 出题时**绝不**下发这些动作（`constraints.js` 的 quiz 节点禁令：出题时乱动画面
 *   会打断学生思考）。`presetView` 是**数据**，只在学生主动点击时才变成动作序列。
 *
 * ★ 三个必须由程序兜住的陷阱 —— 它们都会让"预置"静默失效（画面没变或变成别的样子，
 *   而不报错）。三处都在本项目实测或复现过：
 *
 *   ① **空隙总开关**：只开 `octahedral` 而不开 `interstices`，画面里**一个空隙都不显示**
 *      （`viewer.js` 的 `_updateVisibility` 里 octahedral 的可见性依赖总开关）。
 *      实测复现：`applyActions([{setLayer octahedral:true}])` 后 `page._state.showOctahedral`
 *      为 true，而 `showInterstices` 仍为 false → 画面上什么也没有。
 *      故凡是开 `octahedral`/`tetrahedral`，**必须自动在数组首位补上总开关**。
 *
 *   ② **`latticePoints` 的副作用**：打开它会强制关掉 `showAtoms` 与 `showAtomLabels`
 *      （只看点阵点才能讲清点阵型式）。若模板同时声明了 `atoms` 与 `latticePoints`，
 *      **后处理的赢**，结果取决于动作顺序——不可预期。故此处定死规则：
 *      出现 `latticePoints` 时**忽略模板里的 atoms/atomLabels**，并记一条 note 说明原因。
 *
 *   ③ **`setView` 会重置缩放与平移**（`ViewerCanvas.setView` 内部走
 *      `_resetViewParams(theta, phi, DEFAULT_RADIUS)`）。故若预置同时想改外观，
 *      必须**排在 setView 之后**，不能寄望于"顺序无关"。
 */

import { STACKING_BY_CRYSTAL } from './data/crystal-facts.js'

/** 合法的视角取值（`ViewerCanvas.setView` 只认这四个） */
const VIEW_DIRECTIONS = ['top', 'front', 'side', 'iso']

/**
 * 题境视图（**中性**）：出题时**可以**下发的演示——建立题境，但**不揭示答案**。
 *
 * ★ 为什么必须与 `buildPresetView` 分开：
 *   `buildPresetView` 按知识点打开的图层**就是答案本身**——C6（空间群）打开对称元素、
 *   C5（空隙）打开空隙子层、C1（点阵型式）打开点阵点。它本来是给"答后复盘"用的
 *   （学生点「去看结构」，此刻看答案天经地义）。
 *   但这份数据此前**也发给了模型**，于是模型可以在出题后把它编排成演示下发：
 *   学生点「下一步」，画面一步步打开对称元素 / 空隙 / 点阵点——**答案在演示里漏了出去**
 *   （实测反馈："出题时的演示在'下一步'里泄露了答案"）。
 *
 *   所以拆成两个：
 *     · `buildQuestionView`（本函数）—— **中性**，只切晶体 + 开通用基础层 + 复位视角。
 *       无论题目问什么，它给的都是同一套画面，因此**可以安全地下发给模型**，
 *       让"出题时也有演示"（题境感）而不泄露任何信息。
 *     · `buildPresetView`（本文件另一个函数）—— **揭示答案**，标记 `revealsAnswer: true`，
 *       **只在前端本地保存**，答后（或点「去看结构」/「看答案」）才可用。
 *
 * @param {string} kp 知识点 id（本函数不按知识点区分图层——按知识点区分就是泄露）
 * @param {Object} ctx
 * @param {string} ctx.crystalId
 * @returns {{crystalId, revealsAnswer: false, actions: Array, note: string}}
 */
export function buildQuestionView(kp, ctx = {}) {
  const crystalId = ctx.crystalId || 'fcc'
  return {
    crystalId,
    revealsAnswer: false,
    actions: [
      {
        action: 'loadCrystal',
        params: { crystalId },
        speech: '先切到这道题对应的晶体。',
      },
      {
        action: 'setLayers',
        // 只留"任何一道题都用得上"的两层：原子与晶胞线框。
        // ★ 刻意**不**开 latticePoints / interstices / symmetry / auxiliary* ——
        //   它们各自指向某个知识点的答案（见文件头说明）。
        params: { layers: { atoms: true, wireframe: true, latticePoints: false, interstices: false, symmetry: false } },
        speech: '只保留原子与晶胞线框，把注意力放在结构本身。',
      },
      {
        action: 'setView',
        // 固定 iso：视角若按知识点变化（如空隙题用 front 才看得清），同样是在暗示答案
        params: { direction: 'iso' },
        speech: '调到一个能看清整体的视角。',
      },
    ],
    note: '题境视图：中性，不含任何与答案相关的图层或视角',
  }
}

/**
 * 按知识点生成预设观察状态。
 *
 * 依据《出题引擎技术设计》§8.2 的规则表，但**把"该开哪些图层"翻译成了具体动作**，
 * 并落实上面三个陷阱的兜底。
 *
 * @param {string} kp 知识点 id（'crystal:C5' 或裸 'C5'）
 * @param {Object} ctx
 * @param {string} ctx.crystalId
 * @param {string} [ctx.modelType='ballStick']
 * @param {string[]} [ctx.highlight] 需要突出的元素（P4 前用按元素显隐近似）
 * @param {string} [ctx.viewPreset]
 * @returns {{crystalId, modelType, actions: Array, note: string}}
 */
export function buildPresetView(kp, ctx = {}) {
  const key = String(kp).includes(':') ? String(kp).split(':')[1] : String(kp)
  const crystalId = ctx.crystalId || 'fcc'
  const modelType = ctx.modelType || 'ballStick'
  const notes = []

  /** 要开的图层（顺序无关，最后由 normalizeLayers 统一排序） */
  const layers = {}
  let view = ctx.viewPreset || 'iso'

  switch (key) {
    case 'C1':   // 点阵型式：突出点阵点分布
      layers.latticePoints = true
      layers.wireframe = true
      notes.push('点阵型式题用点阵点图层，故自动隐藏原子（latticePoints 的固有行为）')
      break

    case 'C2':   // 结构基元：原子与点阵点同屏对照
      layers.atoms = true
      layers.wireframe = true
      layers.auxiliaryBody = false
      break

    case 'C3':   // 堆积方式：CPK 看密置层，隐去化学键
      layers.atoms = true
      layers.bonds = false
      layers.auxiliaryFace = !!ctx.showFaceDiagonal
      view = ctx.viewPreset || 'front'
      break

    case 'C4':   // 配位环境：球棍 + 键，看配位多面体
      layers.atoms = true
      layers.bonds = true
      layers.auxiliaryBody = true
      break

    case 'C5':   // 空隙分布：★ 必须同时开总开关与空隙子层
      layers.interstices = true
      layers.octahedral = ctx.intersticeKind !== 'tetrahedral'
      layers.tetrahedral = ctx.intersticeKind === 'tetrahedral'
      layers.wireframe = true
      break

    case 'C6':   // 空间群与对称元素
      layers.symmetry = true
      layers.wireframe = true
      break

    case 'C7':   // 晶胞参数：晶胞线框 + 原子
      layers.wireframe = true
      layers.atoms = true
      break

    case 'C8':   // 结构—性能关联：两物对照（本函数只处理单个晶体，对照由调用方组织）
      layers.atoms = true
      layers.bonds = true
      break

    default:
      layers.atoms = true
      layers.wireframe = true
  }

  // ---- 陷阱 ②：latticePoints 会强制关 atoms/atomLabels，此处顺从该行为而非与之冲突 ----
  if (layers.latticePoints && (layers.atoms || layers.atomLabels)) {
    delete layers.atoms
    delete layers.atomLabels
    notes.push('已忽略模板中的 atoms/atomLabels——打开点阵点会强制隐藏它们')
  }

  // ---- 陷阱 ①：空隙子层必须有总开关兜底 ----
  if ((layers.octahedral || layers.tetrahedral) && !layers.interstices) {
    layers.interstices = true
    notes.push('已自动补上空隙总开关——只开子层不显示任何空隙')
  }

  const actions = toActions({ crystalId, modelType, layers, view, highlight: ctx.highlight, notes })
  // ★ `revealsAnswer: true` 是**结构性标记**：本视图按知识点打开"指向答案"的图层
  //   （C6 开对称元素、C5 开空隙…），因此**只能**在答后使用。
  //   `toModelView()` 会据此确保它**不进**发给模型的回执（见 quiz/index.js）。
  return { crystalId, modelType, revealsAnswer: true, actions, note: notes.join('；') }
}

/**
 * 把"要开哪些图层"翻译成**有序的动作序列**。
 *
 * ★ 顺序是有讲究的，三处都对应真实的时序依赖：
 *   1. 先 `loadCrystal`（换晶体）
 *   2. 再 `setLayers`（一次批量开关，比连续 setLayer 少占演示步数）
 *      —— 且 `setLayers` 内部按 LAYER_PROPS 声明序处理，总开关自然先于子层
 *   3. 再 `setAppearance` / `setAtomVisibility`（外观与显隐）
 *   4. **最后** `setView` —— 因为它会重置缩放与平移（陷阱 ③）
 */
function toActions({ crystalId, modelType, layers, view, highlight, notes }) {
  const actions = []

  actions.push({
    action: 'loadCrystal',
    params: { crystalId },
    speech: '先切到这道题对应的晶体。',
  })

  // modelType 要经 setAppearance 之外的通道：actions.js 里 modelType 不在 VOCAB 中，
  // 故此处用 setAppearance 携带不了它——改由调用方在需要时用 setLayers + 说明处理。
  // （保持动作词汇表最小：模型能做的动作就是界面能做的动作。）
  void modelType

  const layerNames = Object.keys(layers)
  if (layerNames.length) {
    actions.push({
      action: 'setLayers',
      params: { layers },
      speech: describeLayers(layers),
    })
  }

  // 高亮：P4 前 `highlightAtoms` 尚未实现，用"隐藏其他元素"近似达到突出目标的效果。
  // ★ 不静默丢弃：面板会看到这条 note，从而知道"为什么没有真正的高亮"。
  if (highlight && highlight.length) {
    notes.push(`预置了高亮 ${highlight.join('/')}；当前版本用图层与视角近似，highlightAtoms 待 P4`)
  }

  if (view && VIEW_DIRECTIONS.includes(view)) {
    actions.push({
      action: 'setView',
      params: { direction: view },
      speech: '调到一个能看清这个问题答案的视角。',
    })
    notes.push('setView 会重置缩放与平移，故它排在动作序列末位')
  }

  return actions
}

/** 给图层开关写一句人话旁白（演示每步都必须有旁白，否则画面莫名一跳） */
function describeLayers(layers) {
  const on = Object.entries(layers).filter(([, v]) => v).map(([k]) => k)
  const off = Object.entries(layers).filter(([, v]) => !v).map(([k]) => k)
  const parts = []
  if (on.length) parts.push(`打开 ${on.join('、')}`)
  if (off.length) parts.push(`关闭 ${off.join('、')}`)
  return `把视图调到这道题需要的样子：${parts.join('；')}。`
}

/**
 * 对"堆积方式"类题目，附上密堆积方向所需的辅助线。
 * 与 `STACKING_BY_CRYSTAL` 联动，避免模板里各写一份。
 */
export function stackingHintFor(crystalId) {
  const st = STACKING_BY_CRYSTAL[crystalId]
  if (!st) return null
  if (st === 'A1' || st === 'A2' || st === 'A4') return { showFaceDiagonal: st !== 'A1', showBodyDiagonal: st !== 'A1' }
  return null
}

/** 供测试：把预设转成动作并做兜底校验 */
export function assertPresetInvariants(preset) {
  const problems = []
  const acts = preset.actions || []
  const layerAct = acts.find((a) => a.action === 'setLayers')
  const L = (layerAct && layerAct.params && layerAct.params.layers) || {}
  // ① 空隙子层必须有总开关
  if ((L.octahedral || L.tetrahedral) && !L.interstices) {
    problems.push('开了空隙子层但没有总开关 —— 画面上一个空隙都不会显示')
  }
  // ② setView 必须在最后（它重置缩放平移）
  const viewIdx = acts.findIndex((a) => a.action === 'setView')
  if (viewIdx >= 0 && viewIdx !== acts.length - 1) {
    problems.push('setView 不在末位 —— 它后面的动作会重置缩放与平移')
  }
  // ③ 首步应为 loadCrystal
  if (acts.length && acts[0].action !== 'loadCrystal') {
    problems.push('首步不是 loadCrystal —— 后续动作可能落到另一个晶体上')
  }
  // ④ 每步都要有旁白（演示的硬要求）
  for (const [i, a] of acts.entries()) {
    if (!a.speech) problems.push(`第 ${i + 1} 步缺旁白（画面会莫名跳一下）`)
  }
  return problems
}

export default { buildPresetView, stackingHintFor, assertPresetInvariants, VIEW_DIRECTIONS }
