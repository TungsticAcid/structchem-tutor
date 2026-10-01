/**
 * 晶体列表首页 (H5)
 * 分类筛选 + 晶体卡片网格（响应式适配）
 */
import { router } from '../adapters/router.js'
import { globalData } from '../main.js'

let CrystalCardClass = null

export class IndexPage {
  constructor() {
    this._container = null
    this._activeCategory = 'all'
    this._filteredCrystals = globalData.crystalIndex || []

    this._categories = [
      { key: 'all', name: '全部' },
      { key: 'metal', name: '金属晶体' },
      { key: 'ionic', name: '离子晶体' },
      { key: 'covalent', name: '共价晶体' },
      { key: 'molecular', name: '分子晶体' },
      { key: 'mixed', name: '混合键型' }
    ]
  }

  async mount(container) {
    this._container = container

    // ★ 先把**页面骨架**渲染出来，再等懒加载的卡片组件。
    //
    //   原实现把 `container.innerHTML = this._render()` 放在 `await import(...)`
    //   之后，于是那个 chunk 到达之前 `#app` 一直是**空的**——整个首页白屏。
    //   本地 dev／本地 preview 看不出来（chunk 是磁盘文件、近乎瞬时），
    //   但线上**首次访问**（chunk 不在浏览器缓存里）要等一个完整的 RTT：
    //   实测用 `--latency 700` 复现，空白持续了 **4.16 秒**；而刷新之所以"好了"，
    //   只是因为此时 chunk 已进 HTTP 缓存（实测反馈："打开只有顶部栏，刷新才正常"）。
    //
    //   现在的顺序：骨架（顶栏／分类栏／占位）立即出现 → 卡片组件到位后填充。
    //   懒加载的收益（主包小 5.6KB）保留，但不再阻塞首屏任何内容。
    container.innerHTML = this._render()
    this._bindEvents(container)

    if (!CrystalCardClass) {
      try {
        const mod = await import('../components/crystal-card.js')
        CrystalCardClass = mod.CrystalCard
      } catch (e) {
        // 加载失败要说出来——否则用户面对的是一片"永远加载中"的网格，
        // 而控制台之外没有任何线索（这类静默失败最难自查）。
        console.error('[index] 晶体卡片组件加载失败：', e)
        const grid = container.querySelector('#cardGrid')
        if (grid) grid.innerHTML = '<div class="list-empty">卡片组件加载失败，请刷新页面重试</div>'
        return
      }
    }
    this._renderCards()
  }

  unmount() {
    this._container = null
  }

  _render() {
    const cats = this._categories
    const filtered = this._filteredCrystals

    return `
    <div class="index-page">
      <nav class="page-nav">
        <span class="page-nav__title">晶体结构库</span>
      </nav>

      <div class="settings-entry" id="settingsBtn">
        <span class="settings-icon">⚙</span>
      </div>

      <div class="category-bar">
        ${cats.map(c => `
        <span class="category-item${this._activeCategory === c.key ? ' active' : ''}" data-category="${c.key}">${c.name}</span>
        `).join('')}
      </div>

      <div class="crystal-list">
        <div class="card-grid" id="cardGrid">
          ${filtered.length === 0
            ? `<div class="list-empty">暂无该分类的晶体数据</div>`
            /* ★ 骨架阶段的占位：卡片组件是懒加载的，先给一句话比给一个空白网格好
               （_renderCards() 会把它清掉）。见 mount 里关于首屏时序的说明。 */
            : `<div class="list-empty">正在加载晶体预览…</div>`}
        </div>
      </div>
    </div>
    <style>
      .index-page {
        width: 100%; height: 100vh; display: flex; flex-direction: column;
        background: #f5f5f5; overflow: hidden;
      }
      .page-nav {
        padding: calc(12px + env(safe-area-inset-top)) 16px 10px; background: #fff;
        display: flex; align-items: center; border-bottom: 1px solid #eee; flex-shrink: 0;
      }
      .page-nav__title { font-size: 18px; font-weight: 600; color: #333; }
      .settings-entry {
        position: fixed; top: 12px; right: 16px; z-index: 200;
        width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.95);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.12); cursor: pointer;
        margin-top: env(safe-area-inset-top);
      }
      .settings-icon { font-size: 20px; }
      .category-bar {
        flex-shrink: 0; padding: 8px 12px; background: #fff; border-bottom: 1px solid #eee;
        display: flex; gap: 8px; overflow-x: auto;
      }
      .category-item {
        display: inline-block; padding: 6px 14px; border-radius: 16px;
        font-size: 13px; color: #666; background: #f0f0f0; white-space: nowrap;
        cursor: pointer; transition: all 0.2s; flex-shrink: 0;
      }
      .category-item.active { color: #fff; background: #4285F4; }
      .crystal-list {
        flex: 1; overflow-y: auto; padding: 12px;
      }
      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 12px;
        max-width: 800px;
        margin: 0 auto;
      }
      @media (min-width: 600px) {
        .card-grid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
      }
      @media (min-width: 900px) {
        .card-grid { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
      }
      .card-grid > .card-cell {
        cursor: pointer;
        transition: transform 0.15s;
      }
      .card-grid > .card-cell:active { transform: scale(0.97); }
      .list-empty {
        text-align: center; color: #999; font-size: 14px;
        padding-top: 100px; grid-column: 1 / -1;
      }
    </style>`
  }

  _bindEvents(container) {
    container.querySelectorAll('.category-item').forEach(el => {
      el.addEventListener('click', () => {
        const category = el.dataset.category
        if (category) this._onCategoryTap(category)
      })
    })

    const settingsBtn = container.querySelector('#settingsBtn')
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => router.navigate('/settings'))
    }
  }

  _onCategoryTap(category) {
    const crystals = globalData.crystalIndex || []
    this._activeCategory = category
    this._filteredCrystals = category === 'all'
      ? crystals
      : crystals.filter(c => c.category === category)

    // 仅更新分类激活态 + 卡片网格，避免重建整页导致全部缩略图重绘
    this._container.querySelectorAll('.category-item').forEach(el => {
      el.classList.toggle('active', el.dataset.category === category)
    })
    this._renderCards()
  }

  _renderCards() {
    const grid = this._container.querySelector('#cardGrid')
    if (!grid) return

    // 清空旧卡片（分类切换时复用 grid，避免重复累加）
    grid.innerHTML = ''

    if (this._filteredCrystals.length === 0) {
      grid.innerHTML = '<div class="list-empty">暂无该分类的晶体数据</div>'
      return
    }

    // 为每个晶体创建卡片
    for (const crystal of this._filteredCrystals) {
      // 每个卡片用一个独立容器
      const cell = document.createElement('div')
      cell.className = 'card-cell'
      grid.appendChild(cell)

      // 创建 CrystalCard 组件（组件内部 select 事件负责跳转，无需容器级 click）
      try {
        const card = new CrystalCardClass({
          container: cell,
          props: { crystal },
          events: {
            select: (e) => {
              router.navigate('/viewer/' + (e.detail?.id || crystal.id))
            }
          }
        })
        card.mount(cell)
      } catch (err) {
        console.error('[index] 创建卡片失败:', crystal.id, err)
        // 回退：显示简单文本卡片
        cell.innerHTML = `
        <div class="crystal-card" style="background:#fff;border-radius:8px;padding:12px;">
          <div class="card-thumb" style="height:80px;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;border-radius:4px;">
            <span style="font-size:24px;color:rgba(255,255,255,0.6);">◆</span>
          </div>
          <div style="padding:8px 4px 4px;">
            <span style="font-size:13px;font-weight:600;color:#333;">${crystal.name}</span>
          </div>
          <span style="display:inline-block;margin:0 4px 6px;padding:2px 6px;font-size:10px;color:#4285F4;background:rgba(66,133,244,0.1);border-radius:4px;">${crystal.systemName || crystal.crystalSystem}</span>
        </div>`
      }
    }
  }
}
