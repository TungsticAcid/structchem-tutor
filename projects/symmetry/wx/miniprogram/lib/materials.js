/**
 * 材质与光照模块（小程序版）
 * 原子材质参数与四灯布局移植自 H5（crystal 同源），保证视觉一致。
 * THREE 取自 three-context（与 canvas 绑定的 scoped three）。
 */
import { THREE } from './three-context.js'

/** 默认光照配置（移植 crystal pages/viewer/viewer.js 的 lightConfig） */
export const DEFAULT_LIGHT_CONFIG = [
  { id: 'ambient', type: 'ambient', color: '#404060', intensity: 0.6 },
  { id: 'key', type: 'directional', color: '#ffffff', intensity: 0.8, posX: 5, posY: 8, posZ: 5 },
  { id: 'fill', type: 'directional', color: '#8888ff', intensity: 0.3, posX: -3, posY: -1, posZ: -3 },
  { id: 'rim', type: 'directional', color: '#ff8888', intensity: 0.2, posX: 0, posY: 0, posZ: -5 }
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
 * 创建原子材质（MeshPhongMaterial，参数与 crystal 一致）
 * @param {string} color - 十六进制颜色
 * @param {Object} opts - { opacity: 0~1 的透明度（1=不透明），shininess, specular }
 * @returns {THREE.MeshPhongMaterial}
 */
export function createAtomMaterial(color, opts = {}) {
  const matOpts = {
    color: color,
    shininess: opts.shininess ?? 30,
    specular: new THREE.Color(opts.specular ?? 0x222222)
  }
  // 透明度处理：与 crystal buildAtoms 一致
  const matOpacity = opts.opacity ?? 1.0
  if (matOpacity < 1.0) {
    matOpts.transparent = true
    matOpts.opacity = matOpacity
    matOpts.depthWrite = matOpacity > 0.5
  }
  return new THREE.MeshPhongMaterial(matOpts)
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
