/**
 * 全局设置存储模块
 * 使用 localStorage 持久化用户偏好（元素颜色等）
 */
import elementsData from './elements.js'

const STORAGE_KEY = 'crystal_settings'

/** 加载设置 */
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

/**
 * 默认视觉颜色（**白底黑线**）。
 *
 * ★ 为什么是白底：教材插图与课堂投屏的惯例是白底——投到教室屏幕上不会变成一大块深色，
 *   打印/截图进讲义也不必反色。这是**产品选择**，不是配色偏好。
 *
 * ★ 曾经的顾虑与实测结论：原注释据 CPK 色亮度统计（亮度 > 0.85 的元素有 13 个、
 *   氢是纯白）判断"浅底上白球看不见"，因而选了深底。**实测（ice 白底截图）不成立**：
 *   原子球是带光照的 `MeshPhongMaterial`，球面有高光与阴影，纯白球在白底上依然有
 *   清晰的灰色轮廓 —— 那条论证只算了**平色亮度**，没算光照带来的明暗。
 *   故白底不会丢失任何元素。
 *
 * ★ 配套调整（白底上浅色 = 看不见，而"看不见"会被误读成"没渲染"）：
 *   · 线框 / 点阵点原为浅色（#cccccc / #e0e0e0）→ 改黑与深灰
 *   · 对称元素的镜面原为 `rgba(255,255,255,0.3)`（为深底设计）→ 晶体数据一并改为
 *     `rgba(60,60,60,0.35)`，材质不透明度 0.2 → 0.3（见 scene-builder 的 buildSymmetry）
 *
 * ★ 已自定义过配色的用户不受影响：getVisualColor 的取值顺序是「用户覆盖 > 默认」。
 */
const DEFAULT_VISUAL_COLORS = {
  // ★ 白底黑线（教材插图与投屏的惯例）：背景白、晶胞线框黑。
  //   配套项一并调深——白底上浅色等于看不见，而"看不见"会被误读成"没渲染"：
  //   · latticePointColor 原为 #e0e0e0（浅灰），白底上几乎不可见
  //   · 对称元素的镜面/边线是硬编码的白（见 scene-builder 的 buildSymmetry）
  bgColor: '#ffffff',
  wireframeColor: '#000000',
  // ★ 以下五项原是为**深底**选的浅色，白底上对比度只有 1.4–2.0（近乎看不见）。
  //   按 Material 的深色档**保持色相压暗**，与白底的对比度提到 3.5–6.0。
  //   判据是 WCAG 对比度（见下方注释）：改色前后各算一遍，不靠肉眼估。
  octahedralColor: '#E65100',        // 橙 900（原 #FFB74D 橙 200）
  tetrahedralColor: '#0277BD',       // 浅蓝 800（原 #4FC3F7 浅蓝 200）
  latticePointColor: '#424242',      // 深灰（原 #e0e0e0 浅灰，白底几乎不可见）
  auxiliaryLineBodyColor: '#F57F17', // 琥珀 900（原 #FFD54F 琥珀 200）
  // ★ 上面这条对比度 2.65，**刻意不再加深**：黄色在白底上天然难辨，再深就成橄榄褐；
  //   而体对角线是**虚线参考几何**，本该"看得见但不抢眼"——与原子球争视觉反而不好。
  //   与之配对的是面对角线（蓝 800），两者色相相距足够远，不会混淆。
  auxiliaryLineFaceColor: '#1565C0', // 蓝 800（原 #90CAF9 蓝 200）
  hydrogenBondColor: '#EF6C00'       // 橙 800（原 #FFAB40 橙 300）
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

export {
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
