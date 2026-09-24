/**
 * gestures.js — 指针输入 → 手势识别（统一鼠标 / 触摸 / 触控笔）
 *
 * ★ 为什么要单独一层：改造前三个模块各写各的输入处理，缺陷各不相同——
 *   · orbit 用 Pointer Events（支持触控笔与混合输入），但只处理 1/2 指，
 *     第三指按下时不清基线，抬回两指会跳视角；也没有双指滚转
 *   · crystal 用 touch* + mouse* **两套**（因此不支持触控笔），触摸平移灵敏度
 *     被写成鼠标的一半（0.01 vs 0.02），同一手势两种手感；mouseup 只绑在画布上，
 *     拖到画布外松开会让 isDown 永远为真（"幽灵拖拽"）
 *   · symmetry 同样两套，且完全没设 touch-action
 *   合到一层后，这些差异一次性地消失：Pointer Events 天然统一三种输入设备，
 *   且 pointercancel + 指针捕获天然覆盖"拖出画布""被系统打断"两种情况。
 *
 * ★ 一条贯穿的设计：**指针数变化时必须清基线**。
 *   所有"下一帧的增量"都以上一帧的基线相减得到，而基线只在指针数不变时才有意义。
 *   第二指按下、第三指按下、任一指抬起、被系统打断——这四种情况下若不重置基线，
 *   下一次 move 会用一个陈旧基线算出巨大的增量，表现为"手一碰画面就跳一下"。
 *   这是三个模块**都**有的缺陷（全仓 touchcancel 出现 0 次），也是本文件里
 *   最需要注意的一处。
 *
 * 输出的是**手势**而非原始事件，相机层不需要知道指针的事。
 */

/**
 * 创建手势输入层。
 *
 * @param {Object}   opts
 * @param {Element}  opts.dom      接收输入的画布元素
 * @param {Function} opts.onGesture (g) => void，g 形如：
 *        { type:'rotate', dx, dy }
 *        { type:'pan',    dx, dy }
 *        { type:'pinch',  factor }         factor < 1 = 放大
 *        { type:'roll',   dAngle }         弧度
 *        { type:'zoom',   factor }         滚轮/触控板
 *        { type:'start' | 'end' }
 * @param {boolean}  [opts.enabled]
 * @param {boolean}  [opts.setTouchAction=true] 是否把 touch-action 设为 none
 *        （不设的话手势会与页面滚动打架；改造前 symmetry 完全没设、crystal 设成了
 *         manipulation——那个值**不禁用**单指滚动，等于没设）
 */
export function createGestureInput(opts = {}) {
  const dom = opts.dom
  if (!dom) throw new Error('createGestureInput 需要 opts.dom')
  const emit = typeof opts.onGesture === 'function' ? opts.onGesture : () => {}

  let enabled = opts.enabled !== false
  const pointers = new Map()          // pointerId → { x, y }
  let mode = null                     // 'rotate' | 'pan'
  let lastX = 0, lastY = 0
  let lastPinch = 0, lastMid = null, lastAngle = 0
  /**
   * 多指基线是否已建立。
   * ★ 必须用独立标志，**不能**用 `lastAngle !== 0` 之类的"值哨兵"——
   *   两指初始连线恰好水平时角度就是 0，那会把"已初始化"误判为"未初始化"，
   *   于是第一次拖动算不出滚转（我第一版正是这么写的，被测试抓出来了）。
   */
  let multiReady = false
  const bindings = []                 // [事件名, 处理函数] —— 供 destroy 解绑

  // ★ touch-action:none 是手势能正常工作的前提，不是可选项
  if (opts.setTouchAction !== false && dom.style) dom.style.touchAction = 'none'

  function on(name, fn, opt) {
    dom.addEventListener(name, fn, opt)
    bindings.push([name, fn, opt])
  }

  /**
   * 把基线**同步**到当前指针位置。
   *
   * ★ 这里区分「同步」与「清空」很关键——我第一版写成了清空，结果是双指手势
   *   完全失效：第二指按下时把 lastPinch 清零，随后第一次 move 判断
   *   `lastPinch > 0` 为假，捏合永远算不出比例。
   *   正确语义是：指针集合一变，就以**此刻的位置**为新基线，之后每一帧算增量。
   *   这样既保证增量有意义，又能消掉"手一碰画面就跳"（因为新基线来自当前位置，
   *   而不是上一帧的陈旧位置）。
   */
  function syncBaselines() {
    const ps = [...pointers.values()]
    if (ps.length === 1) {
      lastX = ps[0].x; lastY = ps[0].y
      lastPinch = 0; lastMid = null; lastAngle = 0
      multiReady = false
    } else if (ps.length === 2) {
      const [a, b] = ps
      lastPinch = Math.hypot(a.x - b.x, a.y - b.y)
      lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      lastAngle = Math.atan2(b.y - a.y, b.x - a.x)
      multiReady = true
    } else {
      // 3 指及以上：清掉多指基线；等抬回 2 指时再同步一次（届时不会跳）
      lastPinch = 0; lastMid = null; lastAngle = 0
      multiReady = false
    }
  }

  function onDown(e) {
    if (!enabled) return
    // 指针捕获：此后 move/up 都会送到本元素，**即使指针移出画布**。
    // 这一条就消掉了 crystal 的"幽灵拖拽"（它的 mouseup 只绑在画布上，
    // 拖到外面松开就永远收不到 up，isDown 卡在 true）。
    if (dom.setPointerCapture) { try { dom.setPointerCapture(e.pointerId) } catch (err) { /* 忽略 */ } }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.size === 1) {
      mode = (e.button === 2) || e.shiftKey ? 'pan' : 'rotate'   // 右键 / Shift+拖 = 平移
      lastX = e.clientX; lastY = e.clientY
      emit({ type: 'start' })
    } else {
      // 第二指及以上：停止单指拖拽，并以此刻位置为新基线
      mode = null
      syncBaselines()
    }
  }

  function onMove(e) {
    if (!enabled || !pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const ps = [...pointers.values()]

    if (ps.length === 1 && mode) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY
      lastX = e.clientX; lastY = e.clientY
      if (dx || dy) emit({ type: mode, dx, dy })
      return
    }

    if (ps.length === 2) {
      const [a, b] = ps
      const pinch = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const angle = Math.atan2(b.y - a.y, b.x - a.x)

      // 捏合与平移**同时**生效：改造前 crystal 用阈值把两者做成互斥
      // （`|distChange| > 3` 才算缩放，否则算平移），结果是"两指斜着动就都不灵"。
      // orbit 的做法是两个都发，手感明显更好，这里沿用。
      if (multiReady) {
        if (lastPinch > 0 && pinch > 0) {
          const factor = lastPinch / pinch
          if (Math.abs(factor - 1) > 1e-4) emit({ type: 'pinch', factor })
        }
        if (lastMid) {
          const dx = mid.x - lastMid.x, dy = mid.y - lastMid.y
          if (dx || dy) emit({ type: 'pan', dx, dy })
        }
        // 双指滚转：crystal 与 symmetry 有、orbit 没有，是实打实的能力差异
        let d = angle - lastAngle
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        if (Math.abs(d) > 1e-4) emit({ type: 'roll', dAngle: d })
      }
      lastPinch = pinch; lastMid = mid; lastAngle = angle
    }
    // 3 指及以上：只更新位置，不发手势；基线已在 onDown 里重置过，
    // 因此从 3 指抬回 2 指时不会用陈旧基线（orbit 的缺陷正在这里）
  }

  function onUp(e) {
    if (!pointers.has(e.pointerId)) return
    pointers.delete(e.pointerId)
    if (dom.releasePointerCapture) { try { dom.releasePointerCapture(e.pointerId) } catch (err) { /* 忽略 */ } }
    syncBaselines()
    if (pointers.size === 0) { mode = null; emit({ type: 'end' }) }
  }

  function onWheel(e) {
    if (!enabled) return
    e.preventDefault()
    // 连续映射（exp）而非一刀切：改造前 crystal/symmetry 用 `deltaY>0?1.1:0.9`，
    // 忽略 deltaY 幅值且不处理 deltaMode —— 触控板双指滑动会连续触发几十次，
    // 缩放速度失控。exp 对鼠标格进与触控板小增量都平顺。
    emit({ type: 'zoom', factor: Math.exp(e.deltaY * 0.001) })
  }

  on('pointerdown', onDown)
  on('pointermove', onMove)
  on('pointerup', onUp)
  on('pointercancel', onUp)          // ★ 被系统打断（来电、手势抢占）时必须复位
  on('lostpointercapture', onUp)     // 兜底：捕获被浏览器收回
  on('wheel', onWheel, { passive: false })
  on('contextmenu', (e) => e.preventDefault())   // 右键留给平移

  return {
    setEnabled: (v) => {
      enabled = !!v
      if (!enabled) { pointers.clear(); mode = null; syncBaselines() }
    },
    /** 外部强制复位（如页面切到后台再回来）。不会发 end 手势。 */
    reset: () => { pointers.clear(); mode = null; syncBaselines() },
    pointerCount: () => pointers.size,
    destroy: () => {
      for (const [name, fn, opt] of bindings) dom.removeEventListener(name, fn, opt)
      bindings.length = 0
      pointers.clear()
    },
  }
}

export default createGestureInput
