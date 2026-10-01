/**
 * library.js — 晶体库：卡片网格（复用 crystal 项目自己的 CrystalCard）
 *
 * ★ 为什么复用 CrystalCard 而不是自己画一遍：
 *   它的缩略图是**程序绘制的**（用真实晶体数据算坐标，2D canvas 画球与线），
 *   而不是预生成的图片——所以任何新增晶体都自动有缩略图，也不需要维护 23 张 png。
 *   自己再画一遍只会得到两套不一致的缩略图风格。
 *
 * ★ 视觉沿用 crystal 项目的语言（浅色、卡片、分类筛选条），与查看器页一致。
 */

import { CrystalCard } from '@crystal/components/crystal-card.js'
import crystalIndex from '@crystal/data/crystalIndex.js'
// ★ 只有带变量的读数走 t()（`{n} 种`）；分类名等静态文案留在模板里交给扫描替换。
import { t } from '@i18n/index.js'

/** 分类筛选（顺序即展示顺序；`null` 表示"全部"） */
const CATEGORIES = [
  { key: null, label: '全部' },
  { key: 'metal', label: '金属晶体' },
  { key: 'ionic', label: '离子晶体' },
  { key: 'covalent', label: '共价晶体' },
  { key: 'molecular', label: '分子晶体' },
  { key: 'mixed', label: '混合键型' },
]

export class LibraryPage {
  constructor(ctx = {}) {
    this._ctx = ctx
    this._category = null
    this._cards = []
    this._container = null
  }

  mount(container) {
    this._container = container
    container.innerHTML = this._render()
    container.querySelectorAll('[data-cat]').forEach((el) => {
      el.addEventListener('click', () => {
        this._category = el.dataset.cat === '' ? null : el.dataset.cat
        this._renderCards()
        // 更新筛选条的选中态
        container.querySelectorAll('[data-cat]').forEach((b) => {
          const on = (b.dataset.cat === '' ? null : b.dataset.cat) === this._category
          b.classList.toggle('active', on)
        })
      })
    })
    this._renderCards()
  }

  unmount() {
    // ★ 卡片自己持有 2D canvas 与定时器，必须逐个卸载
    for (const c of this._cards) { try { c.unmount() } catch (e) { /* 单个失败不该阻断其余 */ } }
    this._cards = []
    if (this._container) this._container.innerHTML = ''
    this._container = null
  }

  /** 语言变更：只需重算那个走 `t()` 的读数（分类名等静态文案由运行时扫描替换） */
  onLangChange() {
    if (this._container) this._renderCards()
  }

  /** 按当前分类重建卡片（先清空，避免叠加） */
  _renderCards() {
    const grid = this._container && this._container.querySelector('.card-grid')
    if (!grid) return
    for (const c of this._cards) { try { c.unmount() } catch (e) { /* 忽略 */ } }
    this._cards = []
    grid.innerHTML = ''

    const list = this._category
      ? crystalIndex.filter((c) => c.category === this._category)
      : crystalIndex

    for (const meta of list) {
      const cell = document.createElement('div')
      cell.className = 'card-cell'
      grid.appendChild(cell)
      const card = new CrystalCard({ props: { crystal: meta } })
      card.mount(cell)
      this._cards.push(card)
    }
    const count = this._container.querySelector('#libCount')
    // ★ 原文里带数字 ⇒ 必须走 `t('key', {n})`：扫描替换对不了变量
    //   （"12 种"与"3 种"是两条不同原文，字典里列不完）。
    if (count) count.textContent = t('shell.lib.count', { n: list.length })
  }

  _render() {
    const chips = CATEGORIES.map((c) => {
      const on = c.key === this._category
      return `<button class="lib-chip${on ? ' active' : ''}" type="button" data-cat="${c.key || ''}">${c.label}</button>`
    }).join('')

    return `
      <div class="lib-page">
        <div class="lib-nav">
          <button class="lib-back" type="button" id="libBack" title="返回首页">←</button>
          <span class="lib-title">晶体结构库</span>
          <span class="lib-count" id="libCount"></span>
        </div>
        <div class="lib-chips">${chips}</div>
        <div class="card-grid" id="cardGrid"></div>
      </div>
      <style>
        .lib-page { max-width: 1180px; margin: 0 auto; padding: 18px 22px 40px; }
        .lib-nav { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .lib-back {
          width: 34px; height: 34px; border-radius: 50%; border: 1px solid #e5e7eb;
          background: #fff; color: #374151; font-size: 16px; cursor: pointer; flex: none;
          display: flex; align-items: center; justify-content: center;
          transition: background .15s ease;
        }
        .lib-back:hover { background: #f3f4f6; }
        .lib-title { font-size: 18px; font-weight: 600; color: #1f2937; }
        .lib-count { font-size: 12px; color: #9ca3af; margin-left: auto; }
        .lib-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
        .lib-chip {
          padding: 6px 14px; border-radius: 999px; border: 1px solid #e5e7eb;
          background: #fff; color: #4b5563; font-size: 13px; cursor: pointer; font-family: inherit;
          transition: all .15s ease;
        }
        .lib-chip:hover { border-color: #bfdbfe; color: #1d4ed8; }
        .lib-chip.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
        .card-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px;
        }
        @media (min-width: 720px) { .card-grid { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); } }
        .card-cell { transition: transform .16s ease; }
        .card-cell:active { transform: scale(.97); }
      </style>`
  }
}

export default LibraryPage
