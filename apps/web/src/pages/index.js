/**
 * 晶体列表首页 (H5)
 * 分类筛选 + 晶体卡片网格（响应式适配）
 */
import { router } from '../shell/router.js'
import { globalData } from '../shell/app-state.js'

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
        const mod = await import('@crystal/components/crystal-card.js')
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
      <nav data-page-topbar class="page-nav">
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
               （_renderCards() 会把它清掉）。见 mount 里关于首屏时序的说明。
               ★ 这里刻意**不写反引号**：本注释在模板串的 ${} 里，而覆盖率守卫的
                 词法扫描不理解 ${} 嵌套，反引号会把它的字面量边界切乱，
                 于是它把注释文字当成"待译文案"报出来（真解析没这问题）。 */
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
        /* ★ flex-wrap 与 overflow-x 并存：中文六个分类名在手机上正好一行，
         *   英文（All / Metallic crystals / Ionic crystals / Covalent crystals /
         *   Molecular crystals / Mixed bonding）会往右溢出 —— 只靠横向滚动的话，
         *   最后一个分类默认停在屏幕外，用户根本不知道还有它。
         *   换行之后全部可见；overflow-x: auto 保留，作为极窄屏的最后兜底。
         *   ⚠ 本文件整份是一个**模板字符串**：注释里写反引号会把模板截断成语法错误
         *   （本轮就这么白屏过一次，浏览器控制台报 SyntaxError: Unexpected identifier）。 */
        display: flex; gap: 8px; flex-wrap: wrap; overflow-x: auto;
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
      // ★ 设置用**弹层**，不跳页。
      //   原实现是 `router.navigate('/settings')`（crystal 应用里设置是一个独立页面）。
      //   但在统一壳里跳页会卸载当前页——库页的**分类筛选状态会丢**，学生切回来
      //   还得重新选一次分类。弹层不离开当前页。
      //   页面本身不 import 弹层实现（那会让页面依赖壳的具体 UI 库），只**发事件**，
      //   由壳决定怎么响应。
      settingsBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('agent:open-settings'))
      })
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
