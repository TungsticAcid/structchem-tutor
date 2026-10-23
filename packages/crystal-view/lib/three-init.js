/**
 * Three.js 初始化模块
 * 替代小程序版 three-adapter.js + threejs-miniprogram
 * 提供标准 H5 环境下的 Three.js 初始化
 */
import * as THREE from 'three'

/**
 * 为指定 canvas 初始化 Three.js 渲染器
 * @param {HTMLCanvasElement} canvas
 * @returns {{ THREE, renderer, scene, camera }}
 */
export function initThree(canvas) {
  // WebGL 渲染器
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: false
  })

  // 创建场景
  const scene = new THREE.Scene()

  return { THREE, renderer, scene }
}

/**
 * 返回全局 THREE 对象（用于其他模块）
 */
export function getGlobalThree() {
  return THREE
}

export { THREE }
export default { initThree, getGlobalThree, THREE }
