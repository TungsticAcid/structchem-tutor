/**
 * actions.js — 晶体模块的受控动作词汇表与参数校验
 *
 * ★ 这是 crystal **原先完全缺失的一层**。crystal 的 `viewer-canvas.js` 是 894 行的
 *   类、状态在实例字段里，页面通过 `setProps()` 直接改它——没有任何"动作"概念。
 *   于是智能体无法驱动它（不知道能做什么、也不知道参数合法范围）。
 *
 * ★ 两条项目硬约定在这里落地：
 *   · 参数取值域由**程序校验**（CLAUDE.md §一.2）：越界值被夹紧或拒绝，
 *     而不是写在提示词里说"请不要传负数"
 *   · 词汇表**不进常驻上下文**：模型需要时用 listSceneActions 一类工具按需拉取
 *     （这是 token 效率的关键，见重构计划 B6b 的两层工具设计）
 *
 * ★ 本文件刻意**不 import 任何 three.js / DOM 相关模块**：它只有数据与纯函数，
 *   因此可在 Node 里直接测试（facade.js 同理，它通过参数接收 view，不 import 视图实现）。
 */
import { t, tr, i18n } from './i18n-live.js'
import { clamp } from '../../packages/agent-core/core/params.js'

/** 图层友好名 → ViewerCanvas 的属性名。取名的原则是"模型说起来自然" */
export const LAYER_PROPS = {
  atoms: 'showAtoms',
  bonds: 'showBonds',
  wireframe: 'showWireframe',
  interstices: 'showInterstices',
  octahedral: 'showOctahedral',
  tetrahedral: 'showTetrahedral',
  symmetry: 'showSymmetry',
  axes: 'showAxes',
  auxiliaryBody: 'showAuxiliaryBody',
  auxiliaryFace: 'showAuxiliaryFace',
  atomLabels: 'showAtomLabels',
  hydrogenBonds: 'showHydrogenBonds',
  latticePoints: 'showLatticePoints',
}

/** 图层短标签（面板按钮用）。与 LAYER_NOTES 的区别：这里是按钮上的两三个字，
 *  后者是悬浮说明。★ 面板上不该显示 `hydrogenBonds` 这种键名——
 *  用户看不懂，而键名是给代码用的。
 *
 *  ★★ 2026-12-02（用户："统一成「点阵型式」"）：这些标签必须与**界面上那个开关**的
 *    文字一致 —— 学生听到「打开点阵型式」要能一眼找到那个开关。上游图层面板的用词是
 *    「点阵型式 / 坐标轴 / 体对角线 / 面对角线」（见 crystal-view/components/layer-control.js），
 *    本表原来写的是「点阵点 / 晶轴 / 辅助体 / 辅助面」：同一件事两个名字，学生找不到按钮。
 *    ⇒ 一律跟随界面上已有的写法。
 *  ★ `auxiliaryBody` 不是"某个辅助的物体"，而是**体对角线**（画面上那条辅助线）；
 *    原先旁白里的"关闭辅助体"既没说明白是什么，也没说明白为什么，是这次反馈的直接来源。
 */
export const LAYER_LABELS = {
  atoms: '原子',
  bonds: '化学键',
  wireframe: '晶胞线框',
  interstices: '空隙',
  octahedral: '八面体空隙',
  tetrahedral: '四面体空隙',
  symmetry: '对称元素',
  axes: '坐标轴',
  auxiliaryBody: '体对角线',
  auxiliaryFace: '面对角线',
  atomLabels: '原子标签',
  hydrogenBonds: '氢键',
  latticePoints: '点阵型式',
}

/** 图层的教学含义（写进词汇表给模型看，也用于设置面板的说明） */
export const LAYER_NOTES = {
  atoms: '原子球（分子晶体显示为球棍）',
  bonds: '化学键（分子晶体的共价键）',
  wireframe: '晶胞线框',
  interstices: '空隙总开关（关掉则下面两类都不可见）',
  // ★ 这两个是**空隙位置标记**，不是"配位多面体"。实测模型会把 octahedral 当成
  //   "把配位八面体画出来"用在 NaCl 上——那既没有数据、也不是它的语义。
  octahedral: '正八面体空隙（空隙位置标记，不是配位多面体）',
  tetrahedral: '正四面体空隙（空隙位置标记，不是配位多面体）',
  symmetry: '对称元素（旋转轴、镜面、反演中心）',
  axes: '坐标轴（a/b/c 方向）',
  auxiliaryBody: '体对角线（辅助线：按晶体类型画出的立方体体对角线）',
  auxiliaryFace: '面对角线（辅助线：面上那条对角线）',
  atomLabels: '原子标签',
  hydrogenBonds: '氢键',
  latticePoints: '点阵型式（打开后隐藏原子、只显示点阵）',
}

/** 预置视角（ViewerCanvas.setView 支持的方向）。★ 这些英文名是**动作参数值**，
 *  会出现在给模型看的词汇表里，不要改；界面按钮用下面的 VIEW_LABELS */
export const VIEW_DIRECTIONS = ['top', 'front', 'side', 'iso']

/** 视角按钮的中文短标签（注意与 VIEW_NOTES 分工：短标签上按钮，长句作悬浮说明） */
export const VIEW_LABELS = { top: '俯视', front: '正视', side: '侧视', iso: '等轴' }
export const VIEW_NOTES = {
  top: '俯视（沿 c 轴看）',
  front: '正视（沿 a 轴看）',
  side: '侧视（沿 b 轴看）',
  iso: '等轴测（同时看到三个轴，最常用）',
}

/** 晶胞显示模式 */
export const CELL_MODES = ['conventional', 'primitive']
export const CELL_MODE_LABELS = {
  conventional: '惯用晶胞',
  primitive: '原胞',
}
export const CELL_MODE_NOTES = {
  conventional: '惯用晶胞（教材上画的那个）',
  primitive: '原胞（最小的重复单元）',
}

/** 外观参数的取值范围 —— 由程序夹紧，不靠提示词约束 */
export const APPEARANCE_RANGES = {
  atomScale: [0.3, 2.0],
  stickRadius: [0.02, 0.3],
  opacity: [0.0, 0.9],
}

/**
 * 动作词汇表。
 * 字段含义与 orbit 的 VOCAB 保持一致（同一套读取方，见 core/storyboard.js）：
 *   label    短标签（面板的动作气泡用它，比如「切换图层」）
 *   group    分组（面板上按此归类）
 *   desc     一句话说明（给模型看）
 *   params   参数形状说明（给模型看，不参与校验）
 *   animated 是否需要逐帧播放（本模块目前没有动画类动作）
 */
export const VOCAB = {
  loadCrystal: {
    label: '切换晶体',
    group: '结构',
    // ★ 只许点名**真实存在**的工具：这段 desc 会经 listSceneActions 喂给模型，
    //   此前写的是 "id 必须来自 searchCrystals / listCrystals"——而 searchCrystals
    //   根本不存在（它在 descriptor 的 plannedTools 里）。模型照着这句话会去调一个
    //   不存在的名字，白费一轮。给模型看的文本里出现的每个名字都必须能调得动。
    desc: '切换到指定晶体。id 必须来自 listCrystals 返回的原值（或 getCrystalDetail 查过的）',
    params: { crystalId: 'string' },
  },
  setLayer: {
    label: '切换图层',
    group: '图层',
    desc: '开关一个图层（原子、化学键、空隙、对称元素、点阵点…）',
    params: { layer: Object.keys(LAYER_PROPS).join('|'), visible: 'boolean' },
  },
  setLayers: {
    label: '批量切换图层',
    group: '图层',
    desc: '一次开关多个图层（只改列出的键，未列出的保持原状；演示开始应先 resetLayers 建基线）',
    params: { layers: '{ [layer]: boolean }' },
  },
  resetLayers: {
    label: '重置图层',
    group: '图层',
    desc: '恢复干净教学基线：关掉空隙/对称元素/点阵点/标签/辅助几何，只留原子、晶胞线框与晶轴；演示开始先调它，避免继承上一画面的特殊图层',
    params: {},
  },
  setView: {
    label: '切换视角',
    group: '视角',
    desc: '切到预置视角',
    params: { direction: VIEW_DIRECTIONS.join('|') },
  },
  resetView: {
    label: '复位视角',
    group: '视角',
    desc: '复位视角与缩放',
    params: {},
  },
  setCellDisplayMode: {
    label: '切换晶胞显示',
    group: '结构',
    desc: '切换惯用晶胞 / 原胞',
    params: { mode: CELL_MODES.join('|') },
  },
  setAtomVisibility: {
    label: '按元素显隐',
    group: '图层',
    desc: '按元素显示或隐藏原子（讲「A 离子在哪些位置」时很有用）',
    params: { element: 'string（元素符号，如 Na）', visible: 'boolean' },
  },
  setAppearance: {
    label: '调整外观',
    group: '外观',
    desc: '调整原子缩放 / 键粗细 / 透明度。透明度 0~0.5（0.9 几乎看不见），演示结束请恢复 0；越界值会被夹到允许区间',
    params: {
      atomScale: `number ${APPEARANCE_RANGES.atomScale.join('~')}`,
      stickRadius: `number ${APPEARANCE_RANGES.stickRadius.join('~')}`,
      opacity: `number ${APPEARANCE_RANGES.opacity.join('~')}`,
    },
  },
  /**
   * ★ 「可解释的晶体学动作」的一个例子：高亮不是"把球涂成红色"这种通用操作，
   *   而是"把某个元素的原子点亮"——它服务于**配位环境、等效点系**这类概念，
   *   是 grade 节点做可视化诊断的主要手段（"高亮中心球周围的配位原子"）。
   *
   *   实现用材质 emissive 而非改 color：元素色本身是教学信息，不能丢。
   */
  highlightAtoms: {
    label: '高亮元素',
    group: '图层',
    desc: '高亮指定元素的原子（发光突出，**不改变元素本身的颜色**）。传空数组可取消全部高亮。用于讲解配位环境、等效点系等概念',
    params: { elements: 'string[]（元素符号数组，如 ["Na","Cl"]）' },
  },
  /**
   * 并排对比：把当前晶体与另一个晶体放到对比页左右并排。
   * 用于"NaCl 和 CsCl 有什么区别"这类问题——数据由 compareCrystals 给出，
   * 这个动作负责把两个结构**摆到学生眼前**。
   */
  openCompareView: {
    label: '并排对比',
    group: '结构',
    desc: '把两块晶体并排显示（跳转到对比视图）。a 可选（不给用当前晶体）；在库页/首页没有当前晶体时必须给 a。两个 id 都须真实存在且不相同',
    params: { a: 'string（第一个晶体 id，可省略）', b: 'string（第二个晶体的 id）' },
  },
  /**
   * ★ **切换晶胞原点**（"谁在顶点、谁在体心"）。
   *
   *   CsCl 型这类晶体有两种**等价**的画法：顶点为 Cs⁺（Cl⁻ 在体心）或顶点为 Cl⁻
   *   （Cs⁺ 在体心）。结构是同一个，但**数配位时差别很大**：
   *   学生要数"Cs⁺ 周围有几个 Cl⁻"，就该让 Cs⁺ 落在**体心**——否则画面中心那个是
   *   Cl⁻，他数出来的是 Cl⁻ 的配位，**眼睛看到的与耳朵听到的对不上**（实测反馈）。
   *   所以"讲谁的配位就让谁到体心"是该动作的主要用法。
   *
   *   可选值由晶体数据给出（`data/crystals/csCl.js` 的 `equivalentSettings`），
   *   本动作只负责选一项；`getCrystalDetail` 会把那张表原样返回给模型。
   */
  setEquivalentOrigin: {
    label: '切换晶胞原点',
    group: '结构',
    desc: '切换等价的晶胞原点表示（如 CsCl 的「顶点为 Cs⁺」/「顶点为 Cl⁻」）。★ 要数某个离子的配位时，先把它**切到体心**再数——中心那个原子才是「被数的那个」',
    params: { index: 'int ≥ 0（equivalentSettings 的下标，0 起）' },
  },
}

/**
 * 校验并归一化参数。
 *
 * ★ 约定（与 core/storyboard 一致）：返回 `{ params }` 表示通过且已归一化；
 *   返回 `{ err }` 表示参数不合法，该步**不入队、不占用户的一次点击**。
 *
 * @param {string} name
 * @param {Object} p 原始参数
 * @param {Object} [ctx] { crystalIds?: Set<string> } 用于校验 id 是否真实存在
 *                      —— id 必须来自上游工具的原值，禁止编造（descriptor 的禁令）
 * @returns {{params: Object} | {err: string}}
 */
export function validate(name, p, ctx = {}) {
  p = p || {}
  switch (name) {
    case 'loadCrystal': {
      const id = p.crystalId
      if (typeof id !== 'string' || !id) return { err: '需要 crystalId（字符串）' }
      if (ctx.crystalIds && !ctx.crystalIds.has(id)) {
        return { err: t('crystal.t.actions.1', { p1: (id) }) }
      }
      return { params: { crystalId: id } }
    }
    case 'setLayer': {
      const layer = p.layer
      if (!Object.prototype.hasOwnProperty.call(LAYER_PROPS, layer)) {
        return { err: t('crystal.t.actions.2', { p1: (layer), p2: (Object.keys(LAYER_PROPS).join('/')) }) }
      }
      return { params: { layer, visible: p.visible !== false } }
    }
    case 'setLayers': {
      const layers = p.layers
      if (!layers || typeof layers !== 'object' || Array.isArray(layers)) {
        return { err: 'layers 应为 { 图层名: 布尔 } 对象' }
      }
      const out = {}
      for (const [k, v] of Object.entries(layers)) {
        if (!Object.prototype.hasOwnProperty.call(LAYER_PROPS, k)) {
          return { err: t('crystal.t.actions.3', { p1: (k) }) }
        }
        out[k] = v !== false
      }
      if (!Object.keys(out).length) return { err: 'layers 不能为空对象' }
      return { params: { layers: out } }
    }
    case 'resetLayers':
      return { params: {} }
    case 'setView': {
      if (VIEW_DIRECTIONS.indexOf(p.direction) < 0) {
        return { err: t('crystal.t.actions.4', { p1: (VIEW_DIRECTIONS.join('/')) }) }
      }
      return { params: { direction: p.direction } }
    }
    case 'resetView':
      return { params: {} }
    case 'setCellDisplayMode': {
      if (CELL_MODES.indexOf(p.mode) < 0) return { err: t('crystal.t.actions.5', { p1: (CELL_MODES.join('/')) }) }
      return { params: { mode: p.mode } }
    }
    case 'setEquivalentOrigin': {
      const i = Math.round(Number(p.index))
      if (!Number.isFinite(i) || i < 0) {
        return { err: 'index 应为 ≥ 0 的整数（equivalentSettings 的下标，见 getCrystalDetail）' }
      }
      // ★ 上界不在这里判：可选原点**随晶体而异**（多数晶体只有一项），
      //   由视图层按当前晶体实际有几项来夹——在这里写死一个上界只会误伤。
      return { params: { index: i } }
    }
    case 'setAtomVisibility': {
      const el = p.element
      if (typeof el !== 'string' || !el.trim()) return { err: '需要 element（元素符号）' }
      return { params: { element: el.trim(), visible: p.visible !== false } }
    }
    case 'setAppearance': {
      const out = {}
      for (const [k, range] of Object.entries(APPEARANCE_RANGES)) {
        if (p[k] == null) continue
        const v = clamp(p[k], range[0], range[1])
        if (v == null) return { err: t('crystal.t.actions.6', { p1: (k), p2: (range[0]), p3: (range[1]) }) }
        out[k] = v
      }
      if (!Object.keys(out).length) {
        return { err: t('crystal.t.actions.7', { p1: (Object.keys(APPEARANCE_RANGES).join(' / ')) }) }
      }
      return { params: out }
    }
    case 'highlightAtoms': {
      const els = p.elements
      if (!Array.isArray(els)) {
        return { err: 'elements 应为元素符号数组，如 ["Na"]；传空数组可取消高亮' }
      }
      // 只保留非空字符串并去重；空数组是合法输入（表示取消高亮）
      const clean = [...new Set(els.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))]
      if (els.length && !clean.length) {
        return { err: 'elements 里没有有效的元素符号' }
      }
      return { params: { elements: clean } }
    }
    case 'openCompareView': {
      const b = p.b
      if (typeof b !== 'string' || !b) return { err: '需要 b（第二个晶体的 id）' }
      if (ctx.crystalIds && !ctx.crystalIds.has(b)) {
        return { err: t('crystal.t.actions.8', { p1: (b) }) }
      }
      /**
       * ★ 2026-11-27：新增可选 `a`（第一个晶体）。库页/首页没有"当前晶体"，
       *   只给 b 的话宿主无从知道左边该放谁（用户正是在库页问 NaCl 与 CsCl 的对比）。
       */
      const a = (typeof p.a === 'string' && p.a) ? p.a : ''
      if (a && ctx.crystalIds && !ctx.crystalIds.has(a)) {
        return { err: t('crystal.t.actions.8', { p1: (a) }) }
      }
      const left = a || ctx.currentCrystalId || ''
      // 与另一边相同则没有可对比的内容——在动作层就拦下，免得跳到"左右一样"的页面
      if (left && left === b) {
        return { err: '第二个晶体与当前晶体相同，没有可对比的内容' }
      }
      return { params: a ? { a, b } : { b } }
    }
    default:
      return { err: t('crystal.t.actions.9', { p1: (name) }) }
  }
}

/** 列出全部动作（供 listSceneActions 工具与面板使用） */
export function listActions() {
  return Object.entries(VOCAB).map(([action, v]) => ({
    action,
    label: v.label,
    group: v.group,
    desc: v.desc,
    params: v.params,
    animated: !!v.animated,
    // 把可选值也附上——模型据此就不必猜枚举，也不必先把整张表都塞进上下文
    options: action === 'setLayer' ? Object.keys(LAYER_PROPS)
      : action === 'setLayers' ? Object.keys(LAYER_PROPS)
        : action === 'setView' ? VIEW_DIRECTIONS
          : action === 'setCellDisplayMode' ? CELL_MODES
            : undefined,
  }))
}

/** 动作名 → 短标签（面板的动作气泡与 describeAction 用） */
export function labels() {
  const out = {}
  for (const [k, v] of Object.entries(VOCAB)) out[k] = v.label
  return out
}

// ---------------------------------------------------------------------------
// 参数 → 人话
// ---------------------------------------------------------------------------
/**
 * 列表连接符。中文「、」，英文「, 」。
 * ★ 这个必须跟着语言走：拿中文的「、」去拼英文列表，会得到
 *   「atoms、unit-cell wireframe」——不报错，只是看着像没翻完。
 */
function joinList(items) {
  return items.join(i18n.lang === 'en' ? ', ' : '、')
}

/**
 * 图层 id → 面板/旁白里的**短语**。
 *
 * 中文：`atoms` → 「原子图层」（用户明确要求：说「原子图层」「晶胞线框图层」）
 * 英文：`atoms` → 「atoms」（句子里的首字母小写，后缀交给模板）
 *
 * ★ 参数键名（atoms / wireframe / auxiliaryBody）**不给人看**：它们是给模型调工具用的。
 *   要改的是"说话的那一侧"，见 describeAction 与 quiz/preset-view.js。
 */
export function layerPhrase(id) {
  const label = tr(LAYER_LABELS[id] || id)
  if (i18n.lang === 'en') return label.charAt(0).toLowerCase() + label.slice(1)
  return t('crystal.t.actions.layerSuffix', { p1: label })
}

/**
 * `{ layer: boolean }` → 「打开原子图层、晶胞线框图层；关闭体对角线」。
 *
 * @param {Object}  layers
 * @param {Object}  [opts]
 * @param {boolean} [opts.onlyOn=false] 只讲"打开"的那几层。
 *        ★ 旁白只用 true 的那一侧：把「关闭体对角线」写进演示旁白，学生既不知道
 *          体对角线是什么，也不知道它本来就没开（等于在描述一个没发生的变化）。
 */
export function layersPhrase(layers, opts = {}) {
  const entries = Object.entries(layers || {})
  const of = (want) => entries.filter(([, v]) => want ? !!v : !v).map(([k]) => layerPhrase(k))
  const parts = []
  const on = of(true)
  if (on.length) parts.push(t('crystal.t.actions.layerOn', { p1: joinList(on) }))
  if (!opts.onlyOn) {
    const off = of(false)
    if (off.length) parts.push(t('crystal.t.actions.layerOff', { p1: joinList(off) }))
  }
  // ★ 分句符也要跟语言走：中文「；」夹在英文句子中间会读成"没翻完"。
  return parts.join(i18n.lang === 'en' ? '; ' : '；')
}

/**
 * 动作 → **人话**（面板的动作气泡用）。
 *
 * ★★ 2026-12-02（用户："动作气泡也改一下"）：气泡原先直接把参数按 `k=v` 打出来，
 *   于是界面上出现 `显示/隐藏图层（layers={"atoms":true,...}）` —— 参数名、原始
 *   JSON、还把**没被改动**的 false 项一并列出来。学生读不懂，也读不出"到底动了什么"。
 *
 * 返回 `null` 表示"这个动作没有专门格式化"，由面板回退到它自己的「标签（k=v）」——
 * 半懂的动作宁可显示原始参数，也不要编一句可能不准的人话（诊断信息失真更糟）。
 *
 * @param {string}   name
 * @param {Object}   params
 * @param {Object}   [opts]
 * @param {Function} [opts.crystalName] (id) => 晶体显示名（缺省用 id 本身）
 * @returns {string|null}
 */
export function describeAction(name, params, opts = {}) {
  const v = VOCAB[name]
  if (!v) return null
  const p = params || {}
  const label = tr(v.label)
  const nameOf = (id) => {
    if (!id) return ''
    try { return (typeof opts.crystalName === 'function' && opts.crystalName(id)) || String(id) } catch (e) { return String(id) }
  }

  let detail = ''
  switch (name) {
    case 'loadCrystal':
      detail = nameOf(p.crystalId)
      break
    case 'setLayer':
      detail = p.layer ? layersPhrase({ [p.layer]: p.visible !== false }) : ''
      break
    case 'setLayers':
      detail = layersPhrase(p.layers || {})
      break
    case 'setView':
      detail = p.direction ? tr(VIEW_LABELS[p.direction] || p.direction) : ''
      break
    case 'setCellDisplayMode':
      detail = p.mode ? tr(CELL_MODE_LABELS[p.mode] || p.mode) : ''
      break
    case 'setAtomVisibility':
      detail = p.element
        ? t(p.visible === false ? 'crystal.t.actions.hideElem' : 'crystal.t.actions.showElem', { p1: p.element })
        : ''
      break
    /**
     * 外观：参数只有三个，但**键名是英文**（atomScale / stickRadius / opacity）。
     * 演示里"把原子调透明"是很常见的一步，气泡若写 `opacity=0.4`，学生仍然读不懂。
     */
    case 'setAppearance': {
      const NAMES = { atomScale: '原子缩放', stickRadius: '键粗细', opacity: '透明度' }
      const parts = Object.keys(NAMES)
        .filter((k) => p[k] != null)
        .map((k) => t('crystal.t.actions.appearanceItem', { p1: tr(NAMES[k]), p2: String(p[k]) }))
      if (!parts.length) return null
      detail = parts.join(i18n.lang === 'en' ? ', ' : '、')
      break
    }
    case 'highlightAtoms': {
      const els = Array.isArray(p.elements) ? p.elements.filter(Boolean) : []
      detail = els.length
        ? t('crystal.t.actions.highlight', { p1: joinList(els) })
        : t('crystal.t.actions.highlightOff')
      break
    }
    case 'openCompareView': {
      const a = nameOf(p.a)
      const b = nameOf(p.b)
      detail = a && b ? t('crystal.t.actions.comparePair', { p1: a, p2: b }) : (b || a || '')
      break
    }
    // resetLayers / resetView 没有参数，标签本身就说清了
    case 'resetLayers':
    case 'resetView':
      detail = ''
      break
    default:
      return null
  }
  return detail ? t('crystal.t.actions.describe', { p1: label, p2: detail }) : label
}

export default { VOCAB, LAYER_PROPS, LAYER_LABELS, LAYER_NOTES, VIEW_DIRECTIONS, VIEW_LABELS, CELL_MODES, CELL_MODE_LABELS, APPEARANCE_RANGES, validate, listActions, labels, layerPhrase, layersPhrase, describeAction }
