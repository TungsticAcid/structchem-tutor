/**
 * @chem-agent/viewer —— 共享三维外壳
 *
 * 职责边界（别放错地方）：
 *   · 只放**学科无关**的三维基础件：相机控制器、指针手势、通用几何
 *   · 不放任何模块的场景内容（原子球/键/晶胞线框的具体画法）——那些进 modules/<id>
 *   · 不放智能体运行时（那个在 packages/agent-core）
 *
 * ★ three.js 版本统一在 **0.170**。改造前三者各异：
 *     orbit r147（vendored 全局构建）· crystal ^0.170.0 · symmetry ^0.160.0
 *   本包以 0.170 为 peerDependency。orbit 的 r147 需在阶段 B4（去全局化）时
 *   一并迁移；它用到的 MeshPhongMaterial / Vector3 / Quaternion / Matrix4 /
 *   PerspectiveCamera 都是稳定 API，风险主要在 PlaneGeometry 这类改名。
 *
 * 用法（相机部分）：
 *   import * as THREE from 'three'
 *   import { createQuatOrbit } from '@chem-agent/viewer/camera.js'
 *   const ctl = createQuatOrbit({ THREE, camera, dom, mode: 'camera' })
 *   // 每帧：ctl.update()
 */

export { createQuatOrbit, CAMERA_DEFAULTS } from './camera.js'
export { createGestureInput } from './gestures.js'
export {
  fractionalToCartesian,
  getCellVertices,
  getCellEdges,
  getCellCenteredOffset,
  detectLatticeType,
} from './geometry.js'
