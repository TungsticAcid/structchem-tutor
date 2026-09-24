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

/** 图层的教学含义（写进词汇表给模型看，也用于设置面板的说明） */
export const LAYER_NOTES = {
  atoms: '原子球（分子晶体显示为球棍）',
  bonds: '化学键（分子晶体的共价键）',
  wireframe: '晶胞线框',
  interstices: '空隙总开关（关掉则下面两类都不可见）',
  octahedral: '正八面体空隙',
  tetrahedral: '正四面体空隙',
  symmetry: '对称元素（旋转轴、镜面、反演中心）',
  axes: '晶轴（a/b/c 方向）',
  auxiliaryBody: '辅助几何-体（如甲烷的立方体参照）',
  auxiliaryFace: '辅助几何-面（如四面体的面）',
  atomLabels: '原子标签',
  hydrogenBonds: '氢键',
  latticePoints: '点阵点（打开后隐藏原子、只显示点阵）',
}

/** 预置视角（ViewerCanvas.setView 支持的方向） */
export const VIEW_DIRECTIONS = ['top', 'front', 'side', 'iso']
export const VIEW_NOTES = {
  top: '俯视（沿 c 轴看）',
  front: '正视（沿 a 轴看）',
  side: '侧视（沿 b 轴看）',
  iso: '等轴测（同时看到三个轴，最常用）',
}

/** 晶胞显示模式 */
export const CELL_MODES = ['conventional', 'primitive']
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
 *   group    分组（面板上按此归类）
 *   desc     一句话说明（给模型看）
 *   params   参数形状说明（给模型看，不参与校验）
 *   animated 是否需要逐帧播放（本模块目前没有动画类动作）
 */
export const VOCAB = {
  loadCrystal: {
    group: '结构',
    desc: '切换到指定晶体。id 必须来自 searchCrystals / listCrystals 返回的原值',
    params: { crystalId: 'string' },
  },
  setLayer: {
    group: '图层',
    desc: '开关一个图层（原子、化学键、空隙、对称元素、点阵点…）',
    params: { layer: Object.keys(LAYER_PROPS).join('|'), visible: 'boolean' },
  },
  setLayers: {
    group: '图层',
    desc: '一次开关多个图层（比连续调 setLayer 少占一步演示）',
    params: { layers: '{ [layer]: boolean }' },
  },
  setView: {
    group: '视角',
    desc: '切到预置视角',
    params: { direction: VIEW_DIRECTIONS.join('|') },
  },
  resetView: {
    group: '视角',
    desc: '复位视角与缩放',
    params: {},
  },
  setCellDisplayMode: {
    group: '结构',
    desc: '切换惯用晶胞 / 原胞',
    params: { mode: CELL_MODES.join('|') },
  },
  setAtomVisibility: {
    group: '图层',
    desc: '按元素显示或隐藏原子（讲"A 离子在哪些位置"时很有用）',
    params: { element: 'string（元素符号，如 Na）', visible: 'boolean' },
  },
  setAppearance: {
    group: '外观',
    desc: '调整原子缩放 / 键粗细 / 透明度。越界值会被夹到允许区间',
    params: {
      atomScale: `number ${APPEARANCE_RANGES.atomScale.join('~')}`,
      stickRadius: `number ${APPEARANCE_RANGES.stickRadius.join('~')}`,
      opacity: `number ${APPEARANCE_RANGES.opacity.join('~')}`,
    },
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
        return { err: `未知晶体 id：${id}（id 必须来自检索工具返回的原值，不可编造）` }
      }
      return { params: { crystalId: id } }
    }
    case 'setLayer': {
      const layer = p.layer
      if (!Object.prototype.hasOwnProperty.call(LAYER_PROPS, layer)) {
        return { err: `未知图层：${layer}（可用：${Object.keys(LAYER_PROPS).join('/')}）` }
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
          return { err: `未知图层：${k}` }
        }
        out[k] = v !== false
      }
      if (!Object.keys(out).length) return { err: 'layers 不能为空对象' }
      return { params: { layers: out } }
    }
    case 'setView': {
      if (VIEW_DIRECTIONS.indexOf(p.direction) < 0) {
        return { err: `direction 应为 ${VIEW_DIRECTIONS.join('/')}` }
      }
      return { params: { direction: p.direction } }
    }
    case 'resetView':
      return { params: {} }
    case 'setCellDisplayMode': {
      if (CELL_MODES.indexOf(p.mode) < 0) return { err: `mode 应为 ${CELL_MODES.join('/')}` }
      return { params: { mode: p.mode } }
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
        if (v == null) return { err: `${k} 非法（应为 ${range[0]}~${range[1]} 的数值）` }
        out[k] = v
      }
      if (!Object.keys(out).length) {
        return { err: `至少要给一项：${Object.keys(APPEARANCE_RANGES).join(' / ')}` }
      }
      return { params: out }
    }
    default:
      return { err: `未知动作：${name}（可用动作见 listSceneActions）` }
  }
}

/** 列出全部动作（供 listSceneActions 工具与面板使用） */
export function listActions() {
  return Object.entries(VOCAB).map(([action, v]) => ({
    action,
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

export default { VOCAB, LAYER_PROPS, LAYER_NOTES, VIEW_DIRECTIONS, CELL_MODES, APPEARANCE_RANGES, validate, listActions }
