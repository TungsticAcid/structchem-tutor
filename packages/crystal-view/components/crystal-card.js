/**
 * 晶体卡片组件 (H5)
 * 使用2D Canvas动态绘制晶体结构预览图
 */
import { BaseComponent } from '../adapters/component.js'
import { getCrystalData } from '../lib/crystal-loader.js'
import { fractionalToCartesian } from '../lib/geometry-utils.js'
import elementsData from '../data/elements.js'

/**
 * 缩略图底色按**晶系**分色，而不是所有卡片共用一块紫渐变。
 * 色相只做低饱和的矿物色，原子球仍是元素本色——这样图鉴有层次，
 * 又不会变成一张花花绿绿的色卡。
 */
const THUMB_THEMES = {
  cubic:        { from: '#17324f', to: '#070f1a', glow: 'rgba(104, 180, 255, .34)' },
  hexagonal:    { from: '#0f393a', to: '#05161b', glow: 'rgba(102, 224, 198, .30)' },
  tetragonal:   { from: '#32234e', to: '#0b0918', glow: 'rgba(190, 152, 255, .30)' },
  orthorhombic: { from: '#3b2c1b', to: '#120d08', glow: 'rgba(255, 196, 107, .26)' },
  trigonal:     { from: '#3a2235', to: '#150b13', glow: 'rgba(255, 150, 198, .26)' },
  monoclinic:   { from: '#263241', to: '#0a1119', glow: 'rgba(150, 190, 220, .24)' },
  triclinic:    { from: '#2e3028', to: '#10120c', glow: 'rgba(210, 220, 160, .24)' },
}
const DEFAULT_THUMB_THEME = THUMB_THEMES.cubic

function thumbTheme(crystal) {
  return THUMB_THEMES[crystal && crystal.crystalSystem] || DEFAULT_THUMB_THEME
}

export class CrystalCard extends BaseComponent {
  static properties = {
    crystal: { type: Object, value: {}, observer: 'onCrystalChanged' }
  }

  static data = {
    systemNames: {
      cubic: '立方晶系', hexagonal: '六方晶系', tetragonal: '四方晶系',
      orthorhombic: '正交晶系', monoclinic: '单斜晶系', triclinic: '三斜晶系', trigonal: '三方晶系'
    },
    systemIcons: {
      cubic: '◻', hexagonal: '⬡', tetragonal: '▭', orthorhombic: '▯',
      monoclinic: '▱', triclinic: '△', trigonal: '▲'
    },
    drawFailed: false
  }

  lifetimes = {
    ready() {
      if (this._props.crystal && this._props.crystal.id) {
        this._drawThumbnail(this._props.crystal)
      }
      if (this._observers && this._observers['crystal']) {
        this._observers['crystal'] = 'onCrystalChanged'
      }
    }
  }

  methods = {
    onCrystalChanged(val) {
      this.setData({ drawFailed: false })
      if (val && val.id) {
        this._drawThumbnail(val)
      } else {
        this.setData({ drawFailed: true })
      }
    },

    _drawThumbnail(crystalMeta) {
      const crystalData = getCrystalData(crystalMeta.id)
      if (!crystalData || !crystalData.atoms) {
        this.setData({ drawFailed: true })
        return
      }

      const canvasId = `thumbCanvas-${crystalMeta.id}`
      // 延迟执行，等待 DOM 渲染完成
      setTimeout(() => {
        try {
          const canvas = this._container ? this._container.querySelector('#' + canvasId) : null
          if (!canvas) {
            console.warn('[CrystalCard] 未找到canvas:', canvasId)
            this.setData({ drawFailed: true })
            return
          }

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            this.setData({ drawFailed: true })
            return
          }

          const w = canvas.width || 300
          const h = canvas.height || 200

          // 背景：按晶系分色的深矿物底 + 左上角斜向微光 + 边缘暗角。
          const theme = thumbTheme(crystalMeta)
          const bgGrad = ctx.createLinearGradient(0, 0, w * .85, h)
          bgGrad.addColorStop(0, theme.from)
          bgGrad.addColorStop(1, theme.to)
          ctx.fillStyle = bgGrad
          ctx.fillRect(0, 0, w, h)

          const glow = ctx.createRadialGradient(w * .78, h * .12, 0, w * .78, h * .12, w * .86)
          glow.addColorStop(0, theme.glow)
          glow.addColorStop(.55, 'rgba(255,255,255,0.03)')
          glow.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = glow
          ctx.fillRect(0, 0, w, h)

          // 投影变换（等距视图）
          const cosZ = 0.8660, sinZ = 0.5
          const cosX = 0.5, sinX = 0.8660
          function project(cart) {
            const x1 = cart.x * cosZ - cart.y * sinZ
            const y1 = cart.x * sinZ + cart.y * cosZ
            return { x: x1, y: y1 * cosX - cart.z * sinX }
          }

          const lattice = crystalData.lattice
          const BOUNDARY_TOL = 0.02

          // 展开晶胞原子（处理边界原子拷贝到相邻晶胞）
          const positions = []
          for (const atom of crystalData.atoms) {
            const posList = atom.positions || (atom.position ? [atom.position] : [])
            for (const frac of posList) {
              const onX = Math.abs(frac[0]) < BOUNDARY_TOL || Math.abs(frac[0] - 1) < BOUNDARY_TOL
              const onY = Math.abs(frac[1]) < BOUNDARY_TOL || Math.abs(frac[1] - 1) < BOUNDARY_TOL
              const onZ = Math.abs(frac[2]) < BOUNDARY_TOL || Math.abs(frac[2] - 1) < BOUNDARY_TOL

              if (onX || onY || onZ) {
                for (let sx = 0; sx <= 1; sx++)
                  for (let sy = 0; sy <= 1; sy++)
                    for (let sz = 0; sz <= 1; sz++) {
                      const f = [frac[0] + sx, frac[1] + sy, frac[2] + sz]
                      if (f[0] >= -BOUNDARY_TOL && f[0] < 1 + BOUNDARY_TOL &&
                          f[1] >= -BOUNDARY_TOL && f[1] < 1 + BOUNDARY_TOL &&
                          f[2] >= -BOUNDARY_TOL && f[2] < 1 + BOUNDARY_TOL) {
                        const cart = fractionalToCartesian(f, lattice)
                        positions.push({ ...project(cart), element: atom.element })
                      }
                    }
              } else {
                const cart = fractionalToCartesian(frac, lattice)
                positions.push({ ...project(cart), element: atom.element })
              }
            }
          }

          // 晶胞顶点（8个角）
          const cellVerts = []
          for (let i = 0; i <= 1; i++)
            for (let j = 0; j <= 1; j++)
              for (let k = 0; k <= 1; k++) {
                const cart = fractionalToCartesian([i, j, k], lattice)
                cellVerts.push(project(cart))
              }
          const edges = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]]

          if (positions.length === 0) {
            this.setData({ drawFailed: true })
            return
          }

          // 计算边界
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
          for (const p of positions) {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
          }
          for (const v of cellVerts) {
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x
            if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y
          }
          const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1
          const margin = 28
          const scale = Math.min((w - margin * 2) / rangeX, (h - margin * 2) / rangeY)
          const offsetX = (w - rangeX * scale) / 2 - minX * scale
          const offsetY = (h - rangeY * scale) / 2 - minY * scale

          // 绘制晶胞线框
          ctx.strokeStyle = 'rgba(255,255,255,0.28)'
          ctx.lineWidth = 1
          for (const [i, j] of edges) {
            const a = cellVerts[i], b = cellVerts[j]
            ctx.beginPath()
            ctx.moveTo(a.x * scale + offsetX, a.y * scale + offsetY)
            ctx.lineTo(b.x * scale + offsetX, b.y * scale + offsetY)
            ctx.stroke()
          }

          // 按原子半径排序绘制（小原子先画，大原子后画遮住小原子）
          const elemMaxR = {}
          for (const p of positions) {
            const r = (elementsData[p.element]?.radius || 1.0) * scale * 0.35
            if (!elemMaxR[p.element] || r > elemMaxR[p.element]) elemMaxR[p.element] = r
          }
          const sorted = positions.map((p, i) => ({ ...p, i }))
          sorted.sort((a, b) => (elemMaxR[b.element] || 0) - (elemMaxR[a.element] || 0))

          ctx.save()
          ctx.shadowColor = 'rgba(0,0,0,0.36)'
          ctx.shadowBlur = 5
          ctx.shadowOffsetY = 1.5
          for (const p of sorted) {
            const elemInfo = elementsData[p.element]
            const color = elemInfo?.color || '#fff'
            const radius = Math.max((elemInfo?.radius || 1.0) * scale * 0.35, 2.5)
            const sx = p.x * scale + offsetX, sy = p.y * scale + offsetY

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
          ctx.restore()
          // 注意：绘制成功后不要调用 setData，避免触发不必要的 DOM 重渲染
          // canvas 已经包含绘制内容，无需替换
        } catch (err) {
          console.error('[CrystalCard] 绘制缩略图失败:', crystalMeta.id, err)
          this.setData({ drawFailed: true })
        }
      }, 50)
    },

    onTap() {
      this.triggerEvent('select', { id: this._props.crystal.id })
    }
  }

  render() {
    const crystal = this._props.crystal || {}
    const d = this._data

    return `
    <div class="crystal-card" data-action="onTap">
      <div class="card-thumb">
        ${d.drawFailed ? `
        <div class="thumb-placeholder">
          <span class="thumb-icon">${d.systemIcons[crystal.crystalSystem] || '◆'}</span>
        </div>` : `
        <canvas class="thumb-canvas" id="thumbCanvas-${crystal.id}" width="300" height="200"></canvas>`}
      </div>
      <div class="card-body">
        <span class="card-name">${crystal.name || ''}</span>
        <span class="card-formula">${crystal.subtitle || crystal.formula || ''}</span>
      </div>
      <span class="card-tag">${crystal.systemName || d.systemNames[crystal.crystalSystem] || crystal.crystalSystem || ''}</span>
    </div>
    <style>
      .crystal-card {
        position: relative; overflow: hidden; cursor: pointer;
        border: 1px solid var(--line-soft, #ececec); border-radius: 16px;
        background: var(--card, #ffffff);
        box-shadow:
          0 16px 34px -26px rgba(8, 20, 35, .48),
          inset 0 1px 0 rgba(255, 255, 255, .2);
        transition: transform .3s cubic-bezier(.2, .75, .25, 1), box-shadow .3s, border-color .3s;
      }
      .crystal-card::after {
        content: counter(crystal, decimal-leading-zero);
        position: absolute; top: 11px; left: 13px; z-index: 2;
        color: rgba(255,255,255,.56); font: 9px/1 var(--font-ui, Georgia, serif);
        letter-spacing: .18em; text-shadow: 0 1px 5px rgba(0,0,0,.35);
      }
      .crystal-card:hover {
        transform: translateY(-4px);
        border-color: var(--accent, #2563d6);
        box-shadow: 0 24px 44px -28px rgba(8, 20, 35, .55);
      }
      .crystal-card:active { transform: translateY(-1px) scale(.992); }
      .card-thumb {
        position: relative; width: 100%; aspect-ratio: 3 / 2; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        background: linear-gradient(150deg, #17324f, #070f1a);
      }
      .card-thumb::after {
        content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 1;
        background:
          linear-gradient(to top, rgba(3, 9, 16, .42), transparent 42%),
          linear-gradient(118deg, rgba(255,255,255,.10), transparent 34%);
      }
      .thumb-canvas {
        width: 100%; height: 100%; display: block;
        transform: scale(1.015); transition: transform .55s cubic-bezier(.2, .75, .25, 1);
      }
      .crystal-card:hover .thumb-canvas { transform: scale(1.055); }
      .thumb-placeholder {
        display: flex; align-items: center; justify-content: center;
        width: 100%; height: 100%; position: relative;
      }
      .thumb-icon { font-size: 30px; color: rgba(255,255,255,.55); }
      .card-body {
        display: grid; gap: 3px; padding: 12px 15px 5px;
        border-top: 1px solid var(--line-soft, #eee);
      }
      .card-name {
        display: block; font-size: 15px; font-weight: 600; line-height: 1.4;
        color: var(--text, #333); letter-spacing: .01em;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .card-formula {
        display: block; font-size: 10.5px; color: var(--text-dim, #888);
        letter-spacing: .08em; line-height: 1.45;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .card-tag {
        margin: 0 15px 13px; display: inline-flex; align-items: center; gap: 5px;
        padding: 3px 8px; border-radius: 999px;
        border: 1px solid var(--line, #ddd);
        color: var(--text-dim, #7a8494); background: transparent;
        font-size: 9.5px; letter-spacing: .06em;
      }
      .card-tag::before {
        content: ""; width: 4px; height: 4px; border-radius: 50%;
        background: var(--accent, #2563d6); opacity: .72;
      }
      @media (max-width: 720px) {
        .crystal-card { border-radius: 13px; }
        .card-body { padding: 9px 11px 4px; }
        .card-name { font-size: 13.5px; }
        .card-formula { font-size: 10px; }
        .card-tag { margin: 0 11px 10px; padding: 2px 7px; font-size: 9px; }
        .crystal-card::after { top: 8px; left: 10px; font-size: 8px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .crystal-card, .thumb-canvas { transition: none; }
        .crystal-card:hover { transform: none; }
      }
    </style>`
  }
}
