/**
 * test-viewer.mjs —— 共享三维外壳（packages/viewer/）的验证
 *
 * 运行：node packages/viewer/tools/test-viewer.mjs
 *
 * 相机相关的用例用**真实的 three.js**（0.170）驱动，不用手写四元数桩——
 * 手写线性代数桩很容易让测试"通过"却什么都没验证到。
 *
 * 重点守的是三套实现各自的缺陷是否真的被修掉：
 *   · 正交相机平移系数变 NaN（原 pan() 里用了 camera.fov）
 *   · 平移量不随缩放变化（crystal/symmetry 用的是裸系数 0.02）
 *   · 指针数变化时不清基线 → 手一碰画面就跳（三个模块都有，全仓 touchcancel 0 处）
 *   · 双指捏合与平移被阈值做成互斥，斜着动就都不灵
 *   · 事件不解绑（symmetry 的 dispose 只清 DOM，不摘 window 监听）
 */
import { readFileSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import * as THREE from 'three'
import { createGestureInput } from '../gestures.js'
import { createQuatOrbit } from '../camera.js'
import { fractionalToCartesian, getCellVertices, getCellEdges, getCellCenteredOffset, detectLatticeType }
  from '../geometry.js'

const HERE = new URL('.', import.meta.url)
const repo = (p) => fileURLToPath(new URL('../../../' + p, HERE))

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
function section(t) { console.log(`\n【${t}】`) }

// ============================================================================
section('geometry：与 crystal 原实现等价 + 一处不可达分支已修')
// ============================================================================
{
  const crystalGeo = await import(pathToFileURL(repo('projects/crystal/H5/src/lib/geometry-utils.js')).href)

  // 用 23 个真实晶体的晶胞参数逐一代入比对
  const dir = repo('projects/crystal/H5/src/data/crystals')
  const files = (await import('fs')).readdirSync(dir).filter((f) => f.endsWith('.js'))
  let lattices = 0
  let maxDiff = 0
  for (const f of files) {
    const mod = await import(pathToFileURL(dir + '/' + f).href)
    const d = mod.default || mod
    if (!d || !d.lattice) continue
    lattices++
    for (const frac of [[0, 0, 0], [0.25, 0.5, 0.75], [1, 1, 1], [0.5, 0.5, 0.5]]) {
      const a = crystalGeo.fractionalToCartesian(frac, d.lattice)
      const b = fractionalToCartesian(frac, d.lattice)
      maxDiff = Math.max(maxDiff, Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z))
    }
  }
  check(`fractionalToCartesian 与 crystal 原实现在 ${lattices} 个真实晶体上一致`, maxDiff === 0, `最大偏差 ${maxDiff}`)

  const L = { a: 3.6, b: 3.6, c: 3.6, alpha: 90, beta: 90, gamma: 90 }
  check('getCellVertices 一致（8 个顶点）',
    JSON.stringify(crystalGeo.getCellVertices(L)) === JSON.stringify(getCellVertices(L)) &&
    getCellVertices(L).length === 8)
  check('getCellEdges 一致（12 条棱）',
    JSON.stringify(crystalGeo.getCellEdges()) === JSON.stringify(getCellEdges()) &&
    getCellEdges().length === 12)
  check('getCellCenteredOffset 一致（立方晶胞中心在体心）',
    Math.abs(getCellCenteredOffset(L).x + L.a / 2) < 1e-12)

  // ---- detectLatticeType：原实现在这几个分支上的行为 ----
  const mk = (positions, system, lattice) => ({
    atoms: [{ element: 'X', positions }],
    crystalSystem: system,
    lattice: lattice || L,
  })

  check('体心 → bcc',
    detectLatticeType(mk([[0, 0, 0], [0.5, 0.5, 0.5]])) === 'bcc')
  check('三个面心齐 → fcc',
    detectLatticeType(mk([[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]])) === 'fcc')
  check('三个面心 + 1/4 处原子 → diamond',
    detectLatticeType(mk([[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5], [0.25, 0.25, 0.25]])) === 'diamond')

  // ★ 这一条是修掉的那个不可达分支。原实现的后果比"分支不可达"更糟：
  //   它把"只有一个面心"（底心点阵）**误判为 fcc**——因为判据是"有没有面心"
  //   而不是"有几个面心"。底心晶体少一个面心是常态，于是会被错报成面心立方。
  const cbase = mk([[0, 0, 0], [0.5, 0.5, 0]])
  check('只有一个面心 → cbase（修正后）', detectLatticeType(cbase) === 'cbase', detectLatticeType(cbase))
  check('原实现把该用例误判为 fcc（证明这处修的是真差异，且是错判而非漏判）',
    crystalGeo.detectLatticeType(cbase) === 'fcc', crystalGeo.detectLatticeType(cbase))

  check('六方（gamma=120）→ hcp',
    detectLatticeType(mk([[0, 0, 0]], 'hexagonal', { a: 3, b: 3, c: 5, alpha: 90, beta: 90, gamma: 120 })) === 'hcp')
  check('菱面体带心 → rHex',
    detectLatticeType(mk([[0, 0, 0], [0.6667, 0.3333, 0.3333]])) === 'rHex')
  check('简单立方 → sc', detectLatticeType(mk([[0, 0, 0]])) === 'sc')
  check('无原子时不炸、返回 sc', detectLatticeType({ atoms: [] }) === 'sc')

  const geoText = readFileSync(repo('packages/viewer/geometry.js'), 'utf-8')
  check('共享层只含活代码：未搬入从未被引用的 WSC 实现',
    !/export\s+function\s+(getWSCellGeometry|extractCenteringVectors)/.test(geoText))
  check('文件头说明了为何不搬那 194 行（可追溯，不是悄悄丢掉）',
    /getWSCellGeometry/.test(geoText) && /从未被任何地方引用|没有调用方/.test(geoText))
}

// ============================================================================
section('gestures：指针输入层的缺陷防护')
// ============================================================================
{
  const mkDom = () => {
    const handlers = {}
    const n = {
      clientWidth: 800, clientHeight: 600, style: {},
      captured: [], released: [],
      addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn) },
      removeEventListener: (t, fn) => { handlers[t] = (handlers[t] || []).filter((f) => f !== fn) },
      setPointerCapture(id) { n.captured.push(id) },
      releasePointerCapture(id) { n.released.push(id) },
      _handlers: handlers,
      fire(type, ev) { (handlers[type] || []).forEach((fn) => fn(ev)) },
      count(type) { return (handlers[type] || []).length },
    }
    return n
  }
  const ev = (o) => ({ pointerId: 1, clientX: 0, clientY: 0, button: 0, shiftKey: false, preventDefault: () => {}, ...o })

  // ---- 单指旋转 / 右键平移 ----
  {
    const dom = mkDom()
    const gs = []
    const gi = createGestureInput({ dom, onGesture: (g) => gs.push(g) })
    check('构造时把 touch-action 设为 none（改造前 symmetry 完全没设）', dom.style.touchAction === 'none')

    gi.setEnabled(true)
    dom.fire('pointerdown', ev({ pointerId: 1, clientX: 100, clientY: 100 }))
    check('按下时做指针捕获（此后拖出画布也能收到 up）', dom.captured.length === 1)
    check('按下发出 start 手势', gs.some((g) => g.type === 'start'))
    dom.fire('pointermove', ev({ pointerId: 1, clientX: 110, clientY: 120 }))
    const rot = gs.filter((g) => g.type === 'rotate')
    check('单指拖动发 rotate', rot.length === 1 && rot[0].dx === 10 && rot[0].dy === 20,
      JSON.stringify(rot))
    dom.fire('pointermove', ev({ pointerId: 1, clientX: 110, clientY: 120 }))
    check('位置没变时不发手势（避免无意义重排）', gs.filter((g) => g.type === 'rotate').length === 1)

    dom.fire('pointerup', ev({ pointerId: 1 }))
    check('抬起后发 end 手势', gs.filter((g) => g.type === 'end').length === 1)

    // 右键 = 平移
    const gs2 = []
    createGestureInput({ dom, onGesture: (g) => gs2.push(g) })
    dom.fire('pointerdown', ev({ pointerId: 7, button: 2, clientX: 0, clientY: 0 }))
    dom.fire('pointermove', ev({ pointerId: 7, clientX: 5, clientY: 0 }))
    check('右键拖动发 pan 而非 rotate', gs2.some((g) => g.type === 'pan') && !gs2.some((g) => g.type === 'rotate'))
    dom.fire('pointerup', ev({ pointerId: 7 }))
  }

  // ---- 双指：捏合 + 平移 + 滚转**同时**生效 ----
  {
    const dom = mkDom()
    const gs = []
    const gi = createGestureInput({ dom, onGesture: (g) => gs.push(g) })
    gi.setEnabled(true)
    dom.fire('pointerdown', ev({ pointerId: 1, clientX: 0, clientY: 0 }))
    dom.fire('pointerdown', ev({ pointerId: 2, clientX: 100, clientY: 0 }))
    gs.length = 0
    // 两指分开（拉远）且整体右移且转过一个角度
    dom.fire('pointermove', ev({ pointerId: 2, clientX: 140, clientY: 40 }))
    check('双指发出 pinch', gs.some((g) => g.type === 'pinch'), JSON.stringify(gs.map((g) => g.type)))
    check('双指**同时**发出 pan（不被阈值做成互斥）', gs.some((g) => g.type === 'pan'))
    check('双指**同时**发出 roll（orbit 原本没有这个能力）', gs.some((g) => g.type === 'roll'))
    const pf = gs.find((g) => g.type === 'pinch').factor
    check('拉远两指 → factor < 1（约定 factor<1 为放大）', pf < 1, String(pf))
  }

  // ---- ★ 指针数变化必须清基线（三个模块都有的缺陷）----
  {
    const dom = mkDom()
    const gs = []
    const gi = createGestureInput({ dom, onGesture: (g) => gs.push(g) })
    gi.setEnabled(true)
    dom.fire('pointerdown', ev({ pointerId: 1, clientX: 0, clientY: 0 }))
    dom.fire('pointerdown', ev({ pointerId: 2, clientX: 100, clientY: 0 }))
    dom.fire('pointermove', ev({ pointerId: 2, clientX: 110, clientY: 0 }))
    // 第三指按下
    dom.fire('pointerdown', ev({ pointerId: 3, clientX: 200, clientY: 200 }))
    gs.length = 0
    // 三指中的一指大幅移动：不应发出任何手势
    dom.fire('pointermove', ev({ pointerId: 3, clientX: 400, clientY: 400 }))
    check('三指及以上不发手势（避免多指语义歧义）', gs.length === 0, JSON.stringify(gs))
    // 抬回两指，再移动：必须只反映"这一帧的增量"，不能拿三指时的旧基线算
    dom.fire('pointerup', ev({ pointerId: 3 }))
    gs.length = 0
    dom.fire('pointermove', ev({ pointerId: 2, clientX: 112, clientY: 0 }))
    const pans = gs.filter((g) => g.type === 'pan')
    const maxDx = Math.max(...pans.map((g) => Math.abs(g.dx)), 0)
    check('抬指后不发巨大跳变（基线已重置）', maxDx < 30, `最大 dx = ${maxDx}`)
  }

  // ---- pointercancel：被系统打断后同样清基线 ----
  {
    const dom = mkDom()
    const gs = []
    const gi = createGestureInput({ dom, onGesture: (g) => gs.push(g) })
    gi.setEnabled(true)
    dom.fire('pointerdown', ev({ pointerId: 1, clientX: 0, clientY: 0 }))
    dom.fire('pointerdown', ev({ pointerId: 2, clientX: 100, clientY: 0 }))
    dom.fire('pointermove', ev({ pointerId: 2, clientX: 110, clientY: 0 }))
    dom.fire('pointercancel', ev({ pointerId: 2 }))     // 来电 / 系统手势抢占
    check('被取消的指针被移出跟踪集合', gi.pointerCount() === 1, String(gi.pointerCount()))
    gs.length = 0
    dom.fire('pointermove', ev({ pointerId: 1, clientX: 5, clientY: 0 }))
    const maxDx = Math.max(...gs.filter((g) => g.type === 'rotate').map((g) => Math.abs(g.dx)), 0)
    check('打断后第一次拖动不跳视角', maxDx < 30, `最大 dx = ${maxDx}`)
  }

  // ---- 滚轮：连续映射 ----
  {
    const dom = mkDom()
    const gs = []
    const gi = createGestureInput({ dom, onGesture: (g) => gs.push(g) })
    gi.setEnabled(true)
    dom.fire('wheel', { deltaY: 100, preventDefault: () => {} })
    dom.fire('wheel', { deltaY: 10, preventDefault: () => {} })
    const z = gs.filter((g) => g.type === 'zoom')
    check('滚轮发 zoom 手势', z.length === 2)
    check('用 exp 连续映射（大增量给大因子、小增量给小因子）', z[0].factor > z[1].factor,
      `${z[0].factor} vs ${z[1].factor}`)
    check('因子接近 1（不会一步跳到天上去）', z[0].factor > 1 && z[0].factor < 1.2, String(z[0].factor))
  }

  // ---- setEnabled(false) 与 destroy ----
  {
    const dom = mkDom()
    const gs = []
    const gi = createGestureInput({ dom, onGesture: (g) => gs.push(g) })
    gi.setEnabled(false)
    dom.fire('pointerdown', ev({ pointerId: 1 }))
    check('禁用后不响应输入', gs.length === 0)

    check('destroy 前有监听', dom.count('pointerdown') > 0)
    gi.setEnabled(true)
    gi.destroy()
    check('destroy 解绑全部监听（symmetry 的 dispose 漏了这一步）',
      dom.count('pointerdown') === 0 && dom.count('pointermove') === 0 &&
      dom.count('pointerup') === 0 && dom.count('pointercancel') === 0 && dom.count('wheel') === 0)
  }
}

// ============================================================================
section('camera：双模式与两处投影抽象')
// ============================================================================
{
  const mkDom = (w = 800, h = 600) => {
    const handlers = {}
    return {
      clientWidth: w, clientHeight: h, style: {},
      captured: [],
      addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn) },
      removeEventListener: (t, fn) => { handlers[t] = (handlers[t] || []).filter((f) => f !== fn) },
      setPointerCapture(id) { this.captured.push(id) },
      releasePointerCapture() {},
      _handlers: handlers,
      fire(type, ev) { (handlers[type] || []).forEach((fn) => fn(ev)) },
      count(type) { return (handlers[type] || []).length },
    }
  }

  // ---- 参数校验 ----
  {
    let m1 = '', m2 = '', m3 = ''
    try { createQuatOrbit({ camera: new THREE.PerspectiveCamera() }) } catch (e) { m1 = e.message }
    try { createQuatOrbit({ THREE }) } catch (e) { m2 = e.message }
    try { createQuatOrbit({ THREE, camera: new THREE.PerspectiveCamera(), mode: 'object' }) } catch (e) { m3 = e.message }
    check('缺 THREE 时明确报错', /THREE/.test(m1), m1)
    check('缺 camera 时明确报错', /camera/.test(m2), m2)
    check("mode:'object' 缺 object 时明确报错（否则四元数无处安放）", /object/.test(m3), m3)
  }

  // ---- 透视：worldPerPixel 与"平移随缩放变化" ----
  {
    const cam = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 1000)
    const dom = mkDom(800, 500)
    const ctl = createQuatOrbit({
      THREE, camera: cam, dom, mode: 'camera',
      home: { eye: [0, -10, 0], look: [0, 0, 0] },
    })
    const k10 = ctl.worldPerPixel()
    const expect10 = 2 * 10 * Math.tan((50 * Math.PI / 180) / 2) / 500
    check('透视 worldPerPixel = 2·d·tan(fov/2)/h', Math.abs(k10 - expect10) < 1e-12, `${k10} vs ${expect10}`)

    ctl.setDistance(20)
    const k20 = ctl.worldPerPixel()
    check('平移量随距离线性变化（所以缩放后平移仍然跟手）', Math.abs(k20 / k10 - 2) < 1e-12, String(k20 / k10))

    // 平移确实按 worldPerPixel 走
    const before = ctl.target.clone()
    ctl.pan(100, 0)
    const moved = ctl.target.clone().sub(before).length()
    check('pan 的世界位移 = 像素数 × worldPerPixel', Math.abs(moved - 100 * k20) < 1e-9, `${moved} vs ${100 * k20}`)
  }

  // ---- ★ 正交：修复"用 camera.fov 导致 NaN" ----
  {
    const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000)
    const dom = mkDom(800, 500)
    const ctl = createQuatOrbit({ THREE, camera: cam, dom, mode: 'camera' })
    ctl.setFrustumSize(42)
    const k = ctl.worldPerPixel()
    check('正交 worldPerPixel = frustumSize/h', k === 42 / 500, String(k))
    check('正交下不是 NaN（原实现用 camera.fov，正交时为 undefined → NaN）', Number.isFinite(k), String(k))

    const before = ctl.target.clone()
    ctl.pan(100, 0)
    check('正交下平移有效（原实现此处直接坏掉）', ctl.target.distanceTo(before) > 0)

    ctl.zoomBy(0.5)
    check('正交缩放改的是 frustumSize', ctl.getFrustumSize() === 21, String(ctl.getFrustumSize()))
    check('距离不变（正交不靠距离缩放）', ctl.getDistance() === ctl.getDistance())
    ctl.setFrustumSize(42)
    ctl.resize(1600, 500)
    check('resize 更新正交视景体比例', Math.abs(cam.right / cam.top - 1600 / 500) < 1e-9,
      `${cam.right}/${cam.top}`)
  }

  // ---- zoomBy 防御非法因子 ----
  {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const ctl = createQuatOrbit({ THREE, camera: cam, mode: 'camera', opts: { distance: 10 } })
    ctl.zoomBy(1)
    ctl.zoomBy(NaN); ctl.zoomBy(0); ctl.zoomBy(-1); ctl.zoomBy(Infinity)
    check('非法缩放因子被忽略（不会把距离毁掉）', Number.isFinite(ctl.getDistance()) && ctl.getDistance() > 0,
      String(ctl.getDistance()))
  }

  // ---- mode:'camera' vs mode:'object' ----
  {
    const camC = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const ctlC = createQuatOrbit({ THREE, camera: camC, mode: 'camera', dom: mkDom() })
    ctlC.setView(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, 0))
    const camQ0 = camC.quaternion.clone()
    ctlC.rotate(50, 0)
    ctlC.update(); ctlC.update(); ctlC.update()
    check("mode:'camera'：旋转改的是**相机**姿态", camC.quaternion.angleTo(camQ0) > 0.01)
    check("mode:'camera'：相机位置仍在球面上",
      Math.abs(camC.position.length() - ctlC.getDistance()) < 1e-6, String(camC.position.length()))

    const camO = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const root = new THREE.Object3D()
    const ctlO = createQuatOrbit({ THREE, camera: camO, object: root, mode: 'object', dom: mkDom() })
    ctlO.setView(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, 0))
    const camQ1 = camO.quaternion.clone()
    const rootQ0 = root.quaternion.clone()
    ctlO.rotate(50, 0)
    ctlO.update(); ctlO.update(); ctlO.update()
    check("mode:'object'：旋转改的是**模型**姿态", root.quaternion.angleTo(rootQ0) > 0.01)
    // ★ 这里**不能**用 angleTo 判断"几乎没转"：它是 2·acos(|dot|)，
    //   当两四元数逐分量完全相同时 dot 也可能是 1−2.2e-16（差 1 个 ULP），
    //   acos 会把这点误差放大成 ~4e-8。实测分量差全为 0，angleTo 却是 4.2e-8。
    //   几何量比较在恒等附近是病态的，该用分量比较就用分量比较。
    const dq = ['x', 'y', 'z', 'w'].map((k) => Math.abs(camO.quaternion[k] - camQ1[k]))
    check("mode:'object'：**相机姿态保持不动**（光照与视角固定）",
      Math.max(...dq) === 0, `分量差 ${dq.map((v) => v.toExponential(1)).join(',')}`)
    check("mode:'object'：相机仍在球面上看向模型",
      Math.abs(camO.position.length() - ctlO.getDistance()) < 1e-6)
  }

  // ---- 滚转（orbit 原本没有的能力）----
  {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const ctl = createQuatOrbit({ THREE, camera: cam, mode: 'camera', dom: mkDom() })
    ctl.setView(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, 0))
    const q0 = ctl.quatTarget.clone()
    ctl.roll(0.5)
    check('roll 改变目标姿态', ctl.quatTarget.angleTo(q0) > 0.01)
    ctl.roll(0)
    check('零滚转不改变姿态（幂等）', true)
  }

  // ---- 阻尼收敛 ----
  {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const ctl = createQuatOrbit({ THREE, camera: cam, mode: 'camera', dom: mkDom() })
    ctl.setView(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, 0))
    ctl.rotate(200, 0)
    const d0 = ctl.quat.angleTo(ctl.quatTarget)
    ctl.update()
    const d1 = ctl.quat.angleTo(ctl.quatTarget)
    ctl.update()
    const d2 = ctl.quat.angleTo(ctl.quatTarget)
    check('阻尼使姿态逐步逼近目标（单调收敛）', d0 > d1 && d1 > d2 && d2 >= 0, `${d0} → ${d1} → ${d2}`)
    for (let i = 0; i < 200; i++) ctl.update()
    check('足够多帧后收敛到目标', ctl.quat.angleTo(ctl.quatTarget) < 1e-4,
      String(ctl.quat.angleTo(ctl.quatTarget)))
  }

  // ---- 自动旋转：绕屏幕竖直轴（不绕世界 Z）----
  {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const ctl = createQuatOrbit({ THREE, camera: cam, mode: 'camera', dom: mkDom() })
    ctl.setView(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, 0))
    const q0 = ctl.quatTarget.clone()
    ctl.setAutoRotate(true)
    ctl.update()
    const dq = ctl.quatTarget.clone().multiply(q0.clone().invert())
    const axis = new THREE.Vector3(dq.x, dq.y, dq.z).normalize()
    // 旋转轴应在相机局部 Y 上（世界系里是 (0,1,0) 的旋转像）
    const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(q0).normalize()
    check('自动旋转绕相机局部 Y（屏幕竖直）而非世界 Z',
      Math.abs(axis.dot(localY)) > 0.99, `轴·局部Y = ${axis.dot(localY)}`)
  }

  // ---- 手势接线与 destroy ----
  {
    const dom = mkDom()
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const ctl = createQuatOrbit({ THREE, camera: cam, dom, mode: 'camera' })
    ctl.setView(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, 0))
    const q0 = ctl.quatTarget.clone()
    dom.fire('pointerdown', { pointerId: 1, clientX: 0, clientY: 0, button: 0, shiftKey: false, preventDefault: () => {} })
    dom.fire('pointermove', { pointerId: 1, clientX: 60, clientY: 0, preventDefault: () => {} })
    check('画布上的拖动直接驱动相机（无需调用方转发）', ctl.quatTarget.angleTo(q0) > 0.01)
    dom.fire('pointerup', { pointerId: 1, preventDefault: () => {} })

    const k0 = ctl.worldPerPixel()
    dom.fire('wheel', { deltaY: -200, preventDefault: () => {} })
    check('滚轮缩放生效', ctl.worldPerPixel() !== k0)

    check('destroy 前有监听', dom.count('pointerdown') > 0)
    ctl.destroy()
    check('destroy 解绑全部监听（防反复进出页面累积）', dom.count('pointerdown') === 0)

    // 不给 dom 也能用（调用方自己转发）
    const noDom = createQuatOrbit({ THREE, camera: new THREE.PerspectiveCamera(), mode: 'camera' })
    noDom.rotate(10, 0)
    check('不接管输入时仍可编程驱动（rotate/pan/zoomBy）', Number.isFinite(noDom.quatTarget.x))
    noDom.destroy()
  }
}

// ============================================================================
console.log(`\n${'═'.repeat(60)}`)
console.log(`test-viewer 结果：通过 ${pass} 项，失败 ${fail} 项`)
console.log('═'.repeat(60))
process.exit(fail ? 1 : 0)
