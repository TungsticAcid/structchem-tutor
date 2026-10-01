/**
 * 全局设置存储模块（localStorage 持久化）
 * 移植 crystal data/settings.js 的设计：用户覆盖优先于默认值
 */
import { ELEMENTS } from '../../../packages/knowledge/shared/elements.js'

const STORAGE_KEY = 'symmetry_viewer_settings'

/** 默认视觉颜色（背景、线框、各对称元素类型） */
const DEFAULT_VISUAL_COLORS = {
  bgColor: '#eeeeee',
  wireframeColor: '#000000',
  axisC2: '#2196F3',     // 二重轴 蓝
  axisC3: '#4CAF50',     // 三重轴 绿
  axisC4: '#F44336',     // 四重轴 红
  axisC5: '#FF9800',     // 五重轴 橙
  axisC6: '#9C27B0',     // 六重轴 紫
  axisS4: '#E91E63',     // 四重旋反 玫红
  axisS5: '#FF7043',     // 五重旋反 深橙
  axisS6: '#9C27B0',     // 六重旋反 紫
  axisS8: '#7E57C2',     // 八重旋反 紫
  axisS3: '#FFB300',     // 三重旋反 琥珀
  axisS10: '#8E24AA',    // 十重旋反 紫
  axisSInf: '#607D8B',   // 线性旋反 蓝灰
  axisCInf: '#607D8B',   // 线性分子轴 蓝灰
  sigma: '#42A5F5',      // 对称面 蓝
  sigmaV: '#42A5F5',     // σv 蓝
  sigmaD: '#66BB6A',     // σd 绿
  sigmaH: '#EF5350',     // σh 红
  inversionColor: '#888888' // 反演中心 灰
}

/** 默认外观参数 */
const DEFAULT_APPEARANCE = {
  modelType: 'ballStick',
  atomScale: 1.0,
  stickRadius: 0.1,       // 球棍模型棍半径
  symmetryScale: 1.0,     // 对称元素整体缩放
  labelFontSize: 40,      // 对称元素标签字号
  labelMode: 'plain',     // 标签记法：'primed' 加撇 / 'plain' 不加撇（默认不加撇）
  animAngularSpeed: 60,   // 旋转动画角速度（°/s）
  animDuration: 3000,     // 反映/反演动画时长（ms）
  opacity: 0.0
}

/** 读取设置（返回原始对象，可能为空） */
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

/** 保存设置 */
function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('[settings] 保存失败:', e)
  }
}

/**
 * 获取视觉颜色（用户覆盖优先于默认值）
 * @param {string} key - 颜色键（如 'axisC2'、'bgColor'）
 * @returns {string} 十六进制颜色
 */
export function getVisualColor(key) {
  const settings = loadSettings()
  if (settings.visualColors && settings.visualColors[key]) {
    return settings.visualColors[key]
  }
  return DEFAULT_VISUAL_COLORS[key] || '#cccccc'
}

/** 设置视觉颜色 */
export function setVisualColor(key, color) {
  const settings = loadSettings()
  if (!settings.visualColors) settings.visualColors = {}
  settings.visualColors[key] = color
  saveSettings(settings)
}

/**
 * 用户是否**显式改过**某个键。
 *
 * ★ 为什么需要这个信号：画布底色要**跟随界面主题**（深浅两套），但用户一旦自己挑过颜色，
 *   就该一直接尊重——"没表达过偏好就跟随，表达过就不动"。
 *   难点在于"改过没有"从**值**本身看不出来：我们按主题写的值和用户挑的值长得一样。
 *   所以把"用户改过"当成一个**事实**单独记下来，而不是每次去猜。
 */
export function isUserOverridden(key) {
  const s = loadSettings()
  return !!(s.overridden && s.overridden[key])
}

/** 记下"用户显式改过这个键"。由设置面板的色彩控件在用户动手时调用。 */
export function markUserOverride(key) {
  const s = loadSettings()
  if (!s.overridden) s.overridden = {}
  s.overridden[key] = true
  saveSettings(s)
}

/** 获取所有视觉颜色（含默认） */
export function getAllVisualColors() {
  const settings = loadSettings()
  const user = (settings.visualColors) || {}
  const result = {}
  for (const key of Object.keys(DEFAULT_VISUAL_COLORS)) {
    result[key] = user[key] || DEFAULT_VISUAL_COLORS[key]
  }
  return result
}

/**
 * 获取元素有效颜色（用户覆盖 > 默认 CPK）
 * @param {string} element - 元素符号
 * @returns {string} 十六进制颜色
 */
export function getElementColor(element) {
  const settings = loadSettings()
  if (settings.elementColors && settings.elementColors[element]) {
    return settings.elementColors[element]
  }
  const el = ELEMENTS[element]
  return el ? el.color : '#cccccc'
}

/** 设置元素颜色覆盖 */
export function setElementColor(element, color) {
  const settings = loadSettings()
  if (!settings.elementColors) settings.elementColors = {}
  settings.elementColors[element] = color
  saveSettings(settings)
}

/** 获取元素半径（默认范德华半径，暂不支持覆盖） */
export function getElementRadius(element) {
  const el = ELEMENTS[element]
  return el ? (el.radius || 0.7) : 0.7
}

/**
 * 获取对称元素颜色（按元素类型映射到视觉颜色键，支持自定义）
 * @param {string} type - 对称元素类型（'C2'/'S4'/'sigma_v'/'i' 等）
 * @returns {string} 十六进制颜色
 */
export function getSymmetryElementColor(type) {
  switch (type) {
    case 'C2': return getVisualColor('axisC2')
    case 'C3': return getVisualColor('axisC3')
    case 'C4': return getVisualColor('axisC4')
    case 'C5': return getVisualColor('axisC5')
    case 'C6': return getVisualColor('axisC6')
    case 'S4': return getVisualColor('axisS4')
    case 'S5': return getVisualColor('axisS5')
    case 'S6': return getVisualColor('axisS6')
    case 'S8': return getVisualColor('axisS8')
    case 'S3': return getVisualColor('axisS3')
    case 'S10': return getVisualColor('axisS10')
    case 'S∞': return getVisualColor('axisSInf')
    case 'C∞': return getVisualColor('axisCInf')
    case 'sigma_v': return getVisualColor('sigmaV')
    case 'sigma_d': return getVisualColor('sigmaD')
    case 'sigma_h': return getVisualColor('sigmaH')
    case 'sigma': return getVisualColor('sigma')
    case 'i': return getVisualColor('inversionColor')
    default: return '#cccccc'
  }
}

/** 获取外观参数 */
export function getAppearance(key) {
  const settings = loadSettings()
  if (settings.appearance && settings.appearance[key] !== undefined) {
    return settings.appearance[key]
  }
  return DEFAULT_APPEARANCE[key]
}

/** 设置外观参数 */
export function setAppearance(key, value) {
  const settings = loadSettings()
  if (!settings.appearance) settings.appearance = {}
  settings.appearance[key] = value
  saveSettings(settings)
}

/** 重置所有设置（清除 localStorage） */
export function resetSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    console.error('[settings] 重置失败:', e)
  }
}
