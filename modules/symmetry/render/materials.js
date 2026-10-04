/**
 * 材质与光照模块
 *
 * ★ 更正（2026-10-01）：本行原先写"原子材质参数与四灯布局均移植自 crystal 项目，
 *   保证视觉一致"——**与事实不符**。实测两边的取值差别很大（见下），
 *   而这句注释恰恰是那种"看着挺有道理、于是没人去核对"的文档分叉。
 *   现在按 crystal 的**实际默认值**对齐（`modules/crystal/view-props.js:47-52`）。
 */
import * as THREE from 'three'

/**
 * 默认光照配置。
 *
 * ★ 2026-10-01 按 crystal 的实际默认值对齐。改动前后：
 *
 *   | 灯      | 原值（旧版 crystal 配色）        | 现值（crystal 当前默认）      |
 *   |---------|----------------------------------|-------------------------------|
 *   | ambient | **#404060**（深蓝灰）@0.6        | **#ffffff**（白）@**0.82**    |
 *   | key     | #ffffff @0.8                     | #ffffff @0.85                 |
 *   | fill    | **#8888ff**（蓝）@0.3            | **#ffffff**（白）@**0.45**    |
 *   | rim     | **#ff8888**（红）@0.2            | **#ffbb99**（暖白）@0.4       |
 *
 * 环境光只有原来的约 1/5，且把整个场景往**蓝紫**方向染——这是"发闷"的主因之一
 * （另一个是双面半透明被渲染两遍，见 symmetry-draw.js 的 forceSinglePass 说明）。
 *
 * ★ 注意：灯**不落盘**（`data/settings.js` 只存 visualColors/elementColors/appearance），
 *   所以这次改动会改变**所有**用户的观感，包括那些存过设置的人。
 *   但背景色不同——用户若在设置里调过背景色，那个值会一直覆盖主题跟随（见 viewer.js）。
 */
export const DEFAULT_LIGHT_CONFIG = [
  { id: 'ambient', type: 'ambient', color: '#ffffff', intensity: 0.82 },
  { id: 'key', type: 'directional', color: '#ffffff', intensity: 0.85, posX: 5, posY: 8, posZ: 5 },
  { id: 'fill', type: 'directional', color: '#ffffff', intensity: 0.45, posX: -3, posY: -1, posZ: -3 },
  { id: 'rim', type: 'directional', color: '#ffbb99', intensity: 0.4, posX: 0, posY: 0, posZ: -5 }
]

/** 默认背景色（移植 crystal 的 bgColor） */
export const DEFAULT_BG_COLOR = '#eeeeee'

/**
 * 根据配置数组在场景中创建灯光（返回灯光数组，供销毁时清理）
 * @param {THREE.Scene} scene
 * @param {Array} config - 灯光配置数组
 * @returns {THREE.Light[]}
 */
export function setupLights(scene, config = DEFAULT_LIGHT_CONFIG) {
  const lights = []
  for (const cfg of config) {
    const color = new THREE.Color(cfg.color || '#ffffff')
    if (cfg.type === 'ambient') {
      const light = new THREE.AmbientLight(color, cfg.intensity)
      scene.add(light)
      lights.push(light)
    } else {
      // 方向光
      const light = new THREE.DirectionalLight(color, cfg.intensity)
      light.position.set(cfg.posX || 0, cfg.posY || 0, cfg.posZ || 0)
      scene.add(light)
      lights.push(light)
    }
  }
  return lights
}

/**
 * 创建原子材质（**PBR**：MeshStandardMaterial，参数与晶体模块一致）
 *
 * ★ 2026-10-05 从 MeshPhongMaterial 换成 MeshStandardMaterial（用户报"原子球缺少金属光泽"）。
 *   根因不是光源 —— 本页与晶体页的四灯配置逐字相同（见本文件 setupLights 与
 *   `modules/crystal/view-props.js`）；差别只有两条：
 *   ① 材质模型：Phong 只有"直射高光"，而 `specular` 缺省值是 `0x222222`（极暗），
 *      实拍下来就是一层很弱的塑料高光，怎么调 shininess 都出不来金属感；
 *   ② **没有环境贴图**：金属感的一半来自"反射周围环境"，而 Phong 根本没有 envMap 通道。
 *   晶体页那套（`projects/crystal/H5/src/lib/scene-builder.js:1102-1136`）就是
 *   Standard + `metalness 0.55 / roughness 0.32 / envMapIntensity 1.0`，
 *   配套 `scene.environment`（见 `render/viewer.js` 的 `_setupEnvironment`）。
 *
 * ★ 必须**成对**改：只换材质不加环境贴图，metalness 0.55 的球会因为
 *   "金属没有漫反射、又没东西可反射"而发黑发脏（晶体那边的注释也这么写着）。
 *
 * @param {string} color - 十六进制颜色
 * @param {Object} opts - { opacity: 0~1 的透明度（1=不透明），metalness, roughness, envMapIntensity }
 * @returns {THREE.MeshStandardMaterial}
 */
export function createAtomMaterial(color, opts = {}) {
  const matOpts = {
    color: color,
    // ★ 用**元素原色**，不做提亮：PBR 下亮度由 metalness/roughness 与环境反射共同决定，
    //   再手工提亮会让深色元素被洗白，而元素色本身是教学信息（学生靠颜色认元素）。
    metalness: opts.metalness ?? 0.55,
    roughness: opts.roughness ?? 0.32,
    envMapIntensity: opts.envMapIntensity ?? 1.0,
  }
  // 透明度处理：与 crystal buildAtoms 一致
  const matOpacity = opts.opacity ?? 1.0
  if (matOpacity < 1.0) {
    matOpts.transparent = true
    matOpts.opacity = matOpacity
    matOpts.depthWrite = matOpacity > 0.5
  }
  return new THREE.MeshStandardMaterial(matOpts)
}

/**
 * 创建键（球棍）材质
 * @param {string} color - 十六进制颜色
 * @param {Object} opts - { opacity }
 * @returns {THREE.MeshPhongMaterial}
 */
export function createBondMaterial(color, opts = {}) {
  const matOpts = { color: color, shininess: 20 }
  const matOpacity = opts.opacity ?? 1.0
  if (matOpacity < 1.0) {
    matOpts.transparent = true
    matOpts.opacity = matOpacity
    matOpts.depthWrite = matOpacity > 0.5
  }
  return new THREE.MeshPhongMaterial(matOpts)
}
