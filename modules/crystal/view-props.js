/**
 * view-props.js — 晶体模块的**默认视图属性**
 *
 * ★ 为什么需要单独一份：`ViewerCanvas` 的每个属性都有"什么都不传"的兜底，
 *   而那个兜底不等于"合理默认"。最要命的一条是光照：
 *
 *     this._lightConfig = props.lightConfig || []      // ← 空数组
 *     _setupLights() { if (this._lightConfig.length > 0) { ... } }   // ← 于是什么都不做
 *
 *   结果是场景里**一盏灯都没有**，而晶体的原子材质是 `MeshPhongMaterial` ——
 *   没有光源时 Phong 一律渲染成纯黑。表现为"原子没有颜色"且"没有质感"，
 *   但材质里的颜色其实是正确的（Na #6596f9 / Cl #3bbc5e，只是照不亮）。
 *   这两个看似不同的问题，根因是同一个：集成时漏传了光。
 *
 *   同理还有 showAxes（不传则晶体轴不显示）、depthFog、showHydrogenBonds 等。
 *
 * ★ 为什么放在模块层而不是应用入口：这些是**晶体模块的合理默认**，
 *   换一个壳（网页/小程序/其它前端）都应该一样。放应用入口会导致
 *   每接一个新宿主就要重新列一遍，漏一项就出现上面那种"看似图形问题、
 *   实为配置缺失"的故障。
 *
 * 数值来源：projects/crystal/H5/src/pages/viewer.js 的 _getDefaultState()，
 * 即该模块作为独立应用时用的那一套（已验证过的观感）。
 */

/**
 * 三维视图的视觉配色覆盖。
 *
 * ★ **背景为什么改用深色**（原独立应用是浅灰 #eeeeee）——这是按数据定的，不是审美偏好：
 *   统计 103 个元素的 CPK 色相对亮度发现分布是**不对称**的：
 *     · 亮度过高（>0.85）的有 **13 个**，其中 **氢是纯白 #FFFFFF（1.00）**，
 *       而冰与尿素（本库 23 种晶体里带氢的两个）都含氢 → 浅底上白球几乎看不见
 *     · 亮度过低（<0.15）的只有 **1 个**（Fr），且不在本库晶体中
 *   即"浅底丢的元素多、深底丢的元素少"。深底还与统一壳的深色主题一致，
 *   顺带解决了浅灰画布压在深色卡片里的割裂感。
 *
 *   附带收益：晶胞线框与晶轴原本是浅灰线，压在浅灰底上本就发闷，换深底后对比清楚。
 */
export const DEFAULT_VISUAL_COLORS = {
  bgColor: '#101629',
}

/** 光照：环境光 + 主光 + 补光 + 轮廓光。缺任何一盏都会明显影响立体感 */
export const DEFAULT_LIGHT_CONFIG = [
  { id: 'ambient', type: 'ambient', color: '#ffffff', intensity: 0.82 },
  { id: 'key', type: 'directional', color: '#ffffff', intensity: 0.85, posX: 5, posY: 8, posZ: 5 },
  { id: 'fill', type: 'directional', color: '#ffffff', intensity: 0.45, posX: -3, posY: -1, posZ: -3 },
  // 轮廓光偏暖，用来把背光侧从背景里"勾"出来——晶体的立体感很大一部分靠它
  { id: 'rim', type: 'directional', color: '#ffbb99', intensity: 0.4, posX: 0, posY: 0, posZ: -5 },
]

/** 视图默认属性。合并到 ViewerCanvas 的 props 里 */
export const DEFAULT_VIEW_PROPS = {
  crystalId: 'naCl',

  // ---- 光照与投影 ----
  lightConfig: DEFAULT_LIGHT_CONFIG,
  depthFog: false,               // 讲课时不加雾：雾会削弱远处原子的清晰度

  // ---- 模型与晶胞 ----
  modelType: 'ballStick',
  cellDisplayMode: 'conventional',
  atomScale: 1.0,
  stickRadius: 0.08,
  opacity: 0.0,                  // 0 = 不透明
  fractionalShift: [0, 0, 0],
  partialAtoms: false,

  // ---- 图层 ----
  showAtoms: true,
  showWireframe: true,
  showAxes: true,                // ★ 默认打开：晶轴是"沿 a 轴看"这类教学语言的参照
  showInterstices: false,
  showOctahedral: false,
  showTetrahedral: false,
  showSymmetry: false,
  showBonds: false,
  showAuxiliaryBody: false,
  showAuxiliaryFace: false,
  auxiliaryLineAboveAtoms: false,
  showAtomLabels: false,
  showHydrogenBonds: true,       // 有氢键的晶体默认显示（冰、尿素）
  showLatticePoints: false,
  atomVisibility: {},
}

export default { DEFAULT_VIEW_PROPS, DEFAULT_VISUAL_COLORS, DEFAULT_LIGHT_CONFIG }
