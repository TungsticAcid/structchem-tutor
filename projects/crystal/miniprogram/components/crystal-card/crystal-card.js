/**
 * 晶体卡片组件
 * 使用2D Canvas动态绘制晶体结构预览图
 */
import { getCrystalData } from '../../lib/crystal-loader'
import { fractionalToCartesian } from '../../lib/geometry-utils'
const elementsData = require('../../data/elements.js')

Component({
  properties: {
    crystal: {
      type: Object,
      value: {},
      observer: 'onCrystalChanged'
    }
  },

  data: {
    /** 晶系中文映射 */
    systemNames: {
      cubic: '立方晶系',
      hexagonal: '六方晶系',
      tetragonal: '四方晶系',
      orthorhombic: '正交晶系',
      monoclinic: '单斜晶系',
      triclinic: '三斜晶系',
      trigonal: '三方晶系'
    },
    /** 晶系占位图标 */
    systemIcons: {
      cubic: '◻',
      hexagonal: '⬡',
      tetragonal: '▭',
      orthorhombic: '▯',
      monoclinic: '▱',
      triclinic: '△',
      trigonal: '▲'
    },
    /** 绘制是否失败 */
    drawFailed: false
  },

  lifetimes: {
    ready() {
      // 组件就绪后绘制
      if (this.properties.crystal && this.properties.crystal.id) {
        this._drawThumbnail(this.properties.crystal)
      }
    }
  },

  methods: {
    onCrystalChanged(val) {
      this.setData({ drawFailed: false })
      if (val && val.id) {
        this._drawThumbnail(val)
      } else {
        this.setData({ drawFailed: true })
      }
    },

    /** 使用2D Canvas绘制晶体结构预览（完整晶胞模式+晶胞线框） */
    _drawThumbnail(crystalMeta) {
      const crystalData = getCrystalData(crystalMeta.id)
      if (!crystalData || !crystalData.atoms) {
        this.setData({ drawFailed: true })
        return
      }

      const canvasId = `#thumbCanvas-${crystalMeta.id}`
      const query = this.createSelectorQuery()
      query.select(canvasId)
        .node()
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            this.setData({ drawFailed: true })
            return
          }
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const w = canvas.width
          const h = canvas.height

          // 背景渐变
          const bgGrad = ctx.createLinearGradient(0, 0, w, h)
          bgGrad.addColorStop(0, '#667eea')
          bgGrad.addColorStop(1, '#764ba2')
          ctx.fillStyle = bgGrad
          ctx.fillRect(0, 0, w, h)

          // 投影变换
          const cosZ = 0.8660  // cos(30°)
          const sinZ = 0.5     // sin(30°)
          const cosX = 0.5     // cos(60°)
          const sinX = 0.8660  // sin(60°)
          function project(cart) {
            const x1 = cart.x * cosZ - cart.y * sinZ
            const y1 = cart.x * sinZ + cart.y * cosZ
            return { x: x1, y: y1 * cosX - cart.z * sinX }
          }

          const lattice = crystalData.lattice
          const BOUNDARY_TOL = 0.02

          // 完整晶胞模式：展开晶胞边界上的原子到完整晶胞
          const positions = []
          for (const atom of crystalData.atoms) {
            const posList = atom.positions || (atom.position ? [atom.position] : [])
            for (const frac of posList) {
              const onX = Math.abs(frac[0]) < BOUNDARY_TOL || Math.abs(frac[0] - 1) < BOUNDARY_TOL
              const onY = Math.abs(frac[1]) < BOUNDARY_TOL || Math.abs(frac[1] - 1) < BOUNDARY_TOL
              const onZ = Math.abs(frac[2]) < BOUNDARY_TOL || Math.abs(frac[2] - 1) < BOUNDARY_TOL

              if (onX || onY || onZ) {
                // 边界原子：生成所有等价位置
                const shifts = []
                for (let sx = 0; sx <= 1; sx++) {
                  for (let sy = 0; sy <= 1; sy++) {
                    for (let sz = 0; sz <= 1; sz++) {
                      const f = [frac[0] + sx, frac[1] + sy, frac[2] + sz]
                      if (f[0] >= -BOUNDARY_TOL && f[0] < 1 + BOUNDARY_TOL &&
                          f[1] >= -BOUNDARY_TOL && f[1] < 1 + BOUNDARY_TOL &&
                          f[2] >= -BOUNDARY_TOL && f[2] < 1 + BOUNDARY_TOL) {
                        shifts.push(f)
                      }
                    }
                  }
                }
                for (const f of shifts) {
                  const cart = fractionalToCartesian(f, lattice)
                  positions.push({ ...project(cart), element: atom.element })
                }
              } else {
                const cart = fractionalToCartesian(frac, lattice)
                positions.push({ ...project(cart), element: atom.element })
              }
            }
          }

          // 晶胞8个顶点投影
          const cellVerts = []
          for (let i = 0; i <= 1; i++) {
            for (let j = 0; j <= 1; j++) {
              for (let k = 0; k <= 1; k++) {
                const cart = fractionalToCartesian([i, j, k], lattice)
                cellVerts.push(project(cart))
              }
            }
          }
          // 12条棱边
          const edges = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]]

          if (positions.length === 0) {
            this.setData({ drawFailed: true })
            return
          }

          // 计算边界（含晶胞顶点）
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
          for (const p of positions) {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
          }
          for (const v of cellVerts) {
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x
            if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y
          }
          const rangeX = maxX - minX || 1
          const rangeY = maxY - minY || 1

          const margin = 28
          const scale = Math.min((w - margin * 2) / rangeX, (h - margin * 2) / rangeY)
          const offsetX = (w - rangeX * scale) / 2 - minX * scale
          const offsetY = (h - rangeY * scale) / 2 - minY * scale

          // 绘制晶胞线框
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'
          ctx.lineWidth = 1.2
          for (const [i, j] of edges) {
            const a = cellVerts[i], b = cellVerts[j]
            ctx.beginPath()
            ctx.moveTo(a.x * scale + offsetX, a.y * scale + offsetY)
            ctx.lineTo(b.x * scale + offsetX, b.y * scale + offsetY)
            ctx.stroke()
          }

          // 按元素分组半径排序（大原子先画）
          const elemMaxR = {}
          for (const p of positions) {
            const r = (elementsData[p.element]?.radius || 1.0) * scale * 0.35
            if (!elemMaxR[p.element] || r > elemMaxR[p.element]) elemMaxR[p.element] = r
          }
          const sorted = positions.map((p, i) => ({ ...p, i }))
          sorted.sort((a, b) => (elemMaxR[b.element] || 0) - (elemMaxR[a.element] || 0))

          for (const p of sorted) {
            const elemInfo = elementsData[p.element]
            const color = elemInfo?.color || '#fff'
            const radius = Math.max((elemInfo?.radius || 1.0) * scale * 0.35, 2.5)

            const sx = p.x * scale + offsetX
            const sy = p.y * scale + offsetY

            ctx.beginPath()
            ctx.arc(sx, sy, radius, 0, Math.PI * 2)
            const ballGrad = ctx.createRadialGradient(sx - radius * 0.25, sy - radius * 0.3, radius * 0.1, sx, sy, radius)
            ballGrad.addColorStop(0, '#ffffff')
            ballGrad.addColorStop(0.35, color)
            ballGrad.addColorStop(1, '#000000')
            ctx.fillStyle = ballGrad
            ctx.fill()
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'
            ctx.lineWidth = 0.5
            ctx.stroke()
          }

          this.setData({ drawFailed: false })
        })
    },

    onTap() {
      this.triggerEvent('select', { id: this.properties.crystal.id })
    }
  }
})
