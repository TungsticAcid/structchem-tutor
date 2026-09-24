/**
 * 全局设置存储模块
 * 使用 wx.Storage 持久化用户偏好（元素颜色等）
 */
const elementsData = require('./elements.js')

const STORAGE_KEY = 'crystal_settings'

/** 加载设置 */
function loadSettings() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

/** 保存设置 */
function saveSettings(settings) {
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('[settings] 保存失败:', e)
  }
}

/** 获取元素的有效颜色（用户覆盖 > 默认） */
function getElementColor(element) {
  const settings = loadSettings()
  if (settings.elementColors && settings.elementColors[element]) {
    return settings.elementColors[element]
  }
  const elem = elementsData[element]
  return elem ? elem.color : '#cccccc'
}

/** 设置元素颜色覆盖 */
function setElementColor(element, color) {
  const settings = loadSettings()
  if (!settings.elementColors) settings.elementColors = {}
  settings.elementColors[element] = color
  saveSettings(settings)
}

/** 获取所有元素颜色覆盖 */
function getElementColorOverrides() {
  const settings = loadSettings()
  return settings.elementColors || {}
}

/** 重置所有颜色覆盖 */
function resetElementColors() {
  const settings = loadSettings()
  settings.elementColors = {}
  saveSettings(settings)
}

/** 获取完整的元素颜色映射（含默认值） */
function getFullColorMap() {
  const overrides = getElementColorOverrides()
  const map = {}
  for (const [sym, data] of Object.entries(elementsData)) {
    map[sym] = overrides[sym] || data.color
  }
  return map
}

// ==================== 视觉颜色设置 ====================

/** 默认视觉颜色 */
const DEFAULT_VISUAL_COLORS = {
  bgColor: '#eeeeee',
  wireframeColor: '#000000',
  octahedralColor: '#FFB74D',
  tetrahedralColor: '#4FC3F7',
  latticePointColor: '#333333',
  auxiliaryLineBodyColor: '#FFD54F',
  auxiliaryLineFaceColor: '#90CAF9',
  hydrogenBondColor: '#FFAB40'
}

/** 获取视觉颜色设置 */
function getVisualColor(key) {
  const settings = loadSettings()
  if (settings.visualColors && settings.visualColors[key]) {
    return settings.visualColors[key]
  }
  return DEFAULT_VISUAL_COLORS[key] || '#cccccc'
}

/** 设置视觉颜色 */
function setVisualColor(key, color) {
  const settings = loadSettings()
  if (!settings.visualColors) settings.visualColors = {}
  settings.visualColors[key] = color
  saveSettings(settings)
}

/** 获取所有视觉颜色（含默认值） */
function getAllVisualColors() {
  const settings = loadSettings()
  const userColors = settings.visualColors || {}
  const result = {}
  for (const key of Object.keys(DEFAULT_VISUAL_COLORS)) {
    result[key] = userColors[key] || DEFAULT_VISUAL_COLORS[key]
  }
  return result
}

/** 重置视觉颜色 */
function resetVisualColors() {
  const settings = loadSettings()
  settings.visualColors = {}
  saveSettings(settings)
}

module.exports = {
  loadSettings,
  saveSettings,
  getElementColor,
  setElementColor,
  getElementColorOverrides,
  resetElementColors,
  getFullColorMap,
  getVisualColor,
  setVisualColor,
  getAllVisualColors,
  resetVisualColors,
  DEFAULT_VISUAL_COLORS
}
