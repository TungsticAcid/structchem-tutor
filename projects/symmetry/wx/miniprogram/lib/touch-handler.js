/**
 * 触摸手势识别模块
 * 支持：旋转（单指滑动）、缩放（双指捏合）、平移（双指同向滑动）、点击（短触）
 */

/** 两次点击最大间隔（ms） */
const TAP_TIMEOUT = 250
/** 点击最大位移（px） */
const TAP_DISTANCE_THRESHOLD = 10
/** 旋转灵敏度 */
const ROTATE_SENSITIVITY = 0.005
/** 缩放灵敏度 */
const ZOOM_SENSITIVITY = 0.01
/** 平移灵敏度 */
const PAN_SENSITIVITY = 0.01
/** 滚转灵敏度 */
const ROLL_SENSITIVITY = 0.8

export class TouchHandler {
  constructor() {
    this._startTouches = []
    this._lastTouches = []
    this._lastTapTime = 0
    this._gestureState = null // 'rotate' | 'zoom' | 'pan' | null
  }

  /**
   * 计算两指间距
   * @param {Array} touches
   * @returns {number}
   */
  _getDistance(touches) {
    if (touches.length < 2) return 0
    const dx = touches[0].x - touches[1].x
    const dy = touches[0].y - touches[1].y
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * 计算两指中点
   * @param {Array} touches
   * @returns {{ x: number, y: number }}
   */
  _getMidpoint(touches) {
    if (touches.length < 2) return { x: touches[0]?.x || 0, y: touches[0]?.y || 0 }
    return {
      x: (touches[0].x + touches[1].x) / 2,
      y: (touches[0].y + touches[1].y) / 2
    }
  }

  /**
   * 计算两指连线角度（弧度）
   * @param {Array} touches
   * @returns {number}
   */
  _getAngle(touches) {
    if (touches.length < 2) return 0
    return Math.atan2(touches[1].y - touches[0].y, touches[1].x - touches[0].x)
  }

  /**
   * 处理触摸开始
   * @param {Array} touches - 触摸点数组 [{x, y}, ...]
   */
  handleStart(touches) {
    this._startTouches = touches.map(t => ({ x: t.x, y: t.y }))
    this._lastTouches = this._startTouches
    this._gestureState = null
  }

  /**
   * 处理触摸移动
   * @param {Array} touches - 当前触摸点数组
   * @returns {Object|null} 手势事件 { type, delta, ... } 或 null
   */
  handleMove(touches) {
    if (!this._startTouches.length) return null

    const currentTouches = touches.map(t => ({ x: t.x, y: t.y }))
    const result = { type: null, data: {} }

    if (touches.length === 1) {
      // 单指：旋转
      const dx = currentTouches[0].x - this._lastTouches[0].x
      const dy = currentTouches[0].y - this._lastTouches[0].y
      result.type = 'rotate'
      result.data = {
        deltaTheta: dx * ROTATE_SENSITIVITY,
        deltaPhi: dy * ROTATE_SENSITIVITY
      }
    } else if (touches.length === 2) {
      // 双指：缩放/平移 + 滚转（可同时）
      const startDist = this._getDistance(this._lastTouches)
      const currentDist = this._getDistance(currentTouches)
      const distChange = currentDist - startDist

      // 两指连线角度变化 → 滚转
      const lastAngle = this._getAngle(this._lastTouches)
      const currentAngle = this._getAngle(currentTouches)
      let angleChange = currentAngle - lastAngle
      // 处理 π 到 -π 的跨越
      if (angleChange > Math.PI) angleChange -= Math.PI * 2
      if (angleChange < -Math.PI) angleChange += Math.PI * 2
      const deltaAngle = angleChange * ROLL_SENSITIVITY

      if (Math.abs(distChange) > 3) {
        // 缩放
        result.type = 'zoom'
        result.data = {
          delta: distChange * ZOOM_SENSITIVITY,
          ratio: startDist > 0 ? currentDist / startDist : 1,
          deltaAngle
        }
      } else {
        // 平移
        const lastMid = this._getMidpoint(this._lastTouches)
        const currentMid = this._getMidpoint(currentTouches)
        result.type = 'pan'
        result.data = {
          deltaX: (currentMid.x - lastMid.x) * PAN_SENSITIVITY,
          deltaY: (currentMid.y - lastMid.y) * PAN_SENSITIVITY,
          deltaAngle
        }
      }
    }

    this._lastTouches = currentTouches
    return result
  }

  /**
   * 处理触摸结束，检测是否为点击
   * @returns {string|null} 'tap' | null
   */
  handleEnd() {
    if (this._startTouches.length === 1 && this._lastTouches.length === 1) {
      const dx = this._lastTouches[0].x - this._startTouches[0].x
      const dy = this._lastTouches[0].y - this._startTouches[0].y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < TAP_DISTANCE_THRESHOLD) {
        const now = Date.now()
        const isDoubleTap = (now - this._lastTapTime) < TAP_TIMEOUT
        this._lastTapTime = now
        return isDoubleTap ? 'doubleTap' : 'tap'
      }
    }

    this._startTouches = []
    this._lastTouches = []
    this._gestureState = null
    return null
  }
}

export default { TouchHandler }
