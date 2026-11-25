/**
 * 晶体列表首页 (H5)
 * 分类筛选 + 晶体卡片网格（响应式适配）
 */
import { router } from '../shell/router.js'
import { globalData } from '../shell/app-state.js'
import { t } from '@i18n/index.js'

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
    const activeCat = this._categories.find((c) => c.key === this._activeCategory)
    const sectionTitle = this._activeCategory === 'all'
      ? t('pages.crystal.all') : (activeCat ? activeCat.name : t('pages.crystal.all'))

    return `
    <div class="index-page">
      <div class="atlas-ambient" aria-hidden="true"></div>

      <nav data-page-topbar class="page-nav">
        <!--
          ★★ 2026-10-12（用户问：名字不是叫「轨道视界」吗）：**顶栏要写板块名**。
            板块名在门户、智能体口吻、练习选择里都是「晶典在线 / 轨道视界 / 点群观鉴」，
            而这里原先写的是「晶体结构库」——同一个东西两个名字（点群页早就写的是板块名）。
            改：标题=板块名，说明=门户卡片上那句副标题（与 home.js 的 MODULE_BLURB 同口径）。
        -->
        <span class="nav-brand">
          <span class="nav-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-linejoin="round">
              <path d="M20 4.5 34.5 12.6v14.8L20 35.5 5.5 27.4V12.6L20 4.5Z" stroke-width="1.15"/>
              <path d="M20 4.5v15.5m0 0 14.5 7.4M20 20 5.5 27.4" stroke-width=".85" opacity=".62"/>
              <circle cx="20" cy="20" r="3.1" fill="currentColor" stroke="none" opacity=".9"/>
              <circle cx="20" cy="4.5" r="1.5" fill="currentColor" stroke="none" opacity=".7"/>
              <circle cx="34.5" cy="27.4" r="1.5" fill="currentColor" stroke="none" opacity=".7"/>
              <circle cx="5.5" cy="27.4" r="1.5" fill="currentColor" stroke="none" opacity=".7"/>
            </svg>
          </span>
          <span class="nav-copy">
            <span class="page-nav__title">晶典在线</span>
          </span>
        </span>
      </nav>

      <button class="settings-entry" id="settingsBtn" type="button" aria-label="设置" title="设置">
        <span class="settings-icon">⚙</span>
      </button>

      <div class="category-bar">
        ${cats.map(c => `
        <span class="category-item${this._activeCategory === c.key ? ' active' : ''}" data-category="${c.key}">${c.name}</span>
        `).join('')}
      </div>

      <div class="crystal-list">
        <div class="atlas-section-head">
          <span class="atlas-section-title" id="atlasSectionTitle">${sectionTitle}</span>
          <span class="atlas-section-line" aria-hidden="true"></span>
          <span class="atlas-result" id="atlasResultCount">${t('pages.crystal.count', { n: filtered.length })}</span>
        </div>
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
        --atlas-max: 1240px;
        --atlas-line: var(--line, #dddddd);
        --atlas-soft: var(--line-soft, #eeeeee);
        --atlas-muted: var(--text-dim, #6b7280);
        /* 壳里两个浮动控件（回门户 / 保存图片）自带的令牌，按本页主题重新绑一次。
           否则主题切换后它们可能停在加载时的浅色值，出现"深底上白胶囊白字"。 */
        --shell-home-bg: var(--bg-2, #f5f5f5);
        --shell-home-bg-hover: var(--card-2, #fafafa);
        --shell-home-fg: var(--text, #333);
        --shell-home-line: var(--line, #ddd);
        --shell-ui-bg: var(--bg-2, #f5f5f5);
        --shell-ui-bg-hover: var(--card-2, #fafafa);
        --shell-ui-fg: var(--text, #333);
        --shell-ui-line: var(--line, #ddd);
        --shell-ui-menu-bg: var(--card, #fff);
        --shell-ui-menu-fg: var(--text, #333);
        --shell-ui-menu-dim: var(--text-dim, #666);
        --shell-ui-menu-line: var(--line, #ddd);
        --shell-ui-item-bg: var(--bg-2, #f5f5f5);
        --shell-ui-accent: var(--accent, #2563d6);
        position: relative;
        width: 100%; height: 100vh; display: flex; flex-direction: column;
        background: var(--bg, #f5f5f5); color: var(--text, #202938);
        overflow: hidden; isolation: isolate;
      }
      .index-page::before {
        content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
        background-image:
          linear-gradient(var(--atlas-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--atlas-line) 1px, transparent 1px);
        background-size: 64px 64px;
        mask-image: linear-gradient(to bottom, rgba(0,0,0,.55), transparent 30%);
        opacity: .18;
      }
      .atlas-ambient {
        position: absolute; inset: -18% -8% auto; height: 64%; z-index: -1; pointer-events: none;
        background:
          radial-gradient(42% 58% at 16% 18%, var(--accent, #2563d6), transparent 70%),
          radial-gradient(34% 48% at 86% 0%, var(--accent-2, #5b8def), transparent 72%);
        filter: blur(28px); opacity: .10;
      }
      .page-nav {
        min-height: 62px; flex-shrink: 0; z-index: 2;
        padding: calc(10px + env(safe-area-inset-top)) clamp(18px, 4vw, 44px) 10px;
        display: flex; align-items: center;
        background: var(--card, #ffffff);
        border-bottom: 1px solid var(--atlas-soft);
      }
      .nav-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .nav-mark {
        width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center;
        color: var(--accent, #2563d6); border-radius: 10px;
        background: var(--bg-2, #f5f5f5);
        border: 1px solid var(--atlas-line);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.18);
      }
      .nav-mark svg { width: 27px; height: 27px; display: block; }
      .nav-copy { display: flex; align-items: baseline; min-width: 0; }
      .page-nav__title { font-size: 17px; font-weight: 650; letter-spacing: .01em; color: var(--text, #333); white-space: nowrap; }
      .settings-entry {
        position: fixed; top: calc(14px + env(safe-area-inset-top)); right: clamp(12px, 2vw, 24px); z-index: 200;
        width: 34px; height: 34px; padding: 0; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: var(--atlas-muted); cursor: pointer;
        background: var(--card, #fff);
        border: 1px solid var(--atlas-line);
        box-shadow: 0 8px 22px -14px rgba(8, 20, 35, .45);
        transition: color .2s, border-color .2s, transform .2s;
      }
      .settings-entry:hover { color: var(--accent); border-color: var(--accent); transform: rotate(12deg); }
      .settings-icon { font-size: 17px; line-height: 1; }
      .category-bar {
        width: 100%; max-width: var(--atlas-max); margin: 0 auto; flex-shrink: 0; z-index: 1;
        padding: 14px clamp(18px, 4vw, 44px) 10px;
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap; overflow-x: auto;
        scrollbar-width: none;
      }
      .category-item {
        display: inline-block; padding: 6px 13px; border-radius: 999px;
        font-size: 12px; color: var(--atlas-muted); white-space: nowrap; flex-shrink: 0;
        border: 1px solid var(--atlas-line); background: var(--bg-2, #f5f5f5);
        cursor: pointer; transition: color .2s, border-color .2s, background .2s, box-shadow .2s;
      }
      .category-item:hover { color: var(--text); border-color: var(--accent); }
      .category-item.active {
        color: var(--on-accent, #fff);
        border-color: transparent;
        background: linear-gradient(135deg, var(--accent, #2563d6), var(--accent-2, #5b8def));
        box-shadow: 0 8px 20px -10px rgba(37, 99, 214, .55);
      }
      .crystal-list {
        flex: 1; width: 100%; max-width: var(--atlas-max); margin: 0 auto; z-index: 1;
        overflow-y: auto; padding: 2px clamp(18px, 4vw, 44px) 42px;
        scrollbar-width: thin; scrollbar-color: var(--atlas-line) transparent;
      }
      .atlas-section-head {
        display: flex; align-items: center; gap: 13px; margin: 4px 0 14px;
      }
      .atlas-section-title {
        color: var(--text); font-size: 12px; font-weight: 600; letter-spacing: .08em; white-space: nowrap;
      }
      .atlas-section-line {
        flex: 1; height: 1px;
        background: linear-gradient(90deg, var(--atlas-line), transparent);
      }
      .atlas-result { color: var(--atlas-muted); font-size: 10px; letter-spacing: .12em; white-space: nowrap; }
      .card-grid {
        display: grid; counter-reset: crystal;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 18px 16px;
      }
      .card-grid > .card-cell {
        counter-increment: crystal;
        cursor: pointer; min-width: 0;
        animation: atlasCardIn .5s cubic-bezier(.2, .75, .25, 1) both;
        animation-delay: calc(var(--i, 0) * 26ms);
      }
      @keyframes atlasCardIn {
        from { opacity: 0; transform: translateY(12px) scale(.985); }
        to { opacity: 1; transform: none; }
      }
      .list-empty {
        text-align: center; color: var(--atlas-muted); font-size: 13px;
        padding: 86px 0; grid-column: 1 / -1;
      }
      /* 打开智能体时让出右侧一条（与轨道/点群保持一致）；窄屏抽屉从底部弹出，不压缩。 */
      .page-nav, .category-bar, .crystal-list {
        transition: padding-right .24s cubic-bezier(.4, 0, .2, 1);
      }
      body.agent-open .page-nav,
      body.agent-open .category-bar,
      body.agent-open .crystal-list {
        padding-right: calc(var(--agent-w, 440px) + 16px);
      }
      @media (max-width: 900px) {
        body.agent-open .page-nav,
        body.agent-open .category-bar,
        body.agent-open .crystal-list { padding-right: 16px; }
      }
      @media (max-width: 720px) {
        .page-nav { min-height: 58px; padding-left: 16px; padding-right: 16px; }
        .nav-mark { width: 30px; height: 30px; border-radius: 9px; }
        .nav-mark svg { width: 24px; height: 24px; }
        .settings-entry { top: calc(12px + env(safe-area-inset-top)); right: 12px; width: 32px; height: 32px; }
        .category-bar { padding: 10px 16px 9px; gap: 7px; flex-wrap: nowrap; overflow-x: auto; }
        .category-item { padding: 6px 11px; font-size: 11.5px; }
        .crystal-list { padding: 0 16px 30px; }
        .atlas-section-head { margin-bottom: 11px; }
        .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      }
      @media (max-width: 380px) {
        .card-grid { gap: 10px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .card-grid > .card-cell { animation: none; }
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
    const active = this._categories.find((c) => c.key === category)
    const title = this._container.querySelector('#atlasSectionTitle')
    if (title) {
      title.textContent = category === 'all'
        ? t('pages.crystal.all') : ((active && active.name) || t('pages.crystal.all'))
    }
    const count = this._container.querySelector('#atlasResultCount')
    if (count) count.textContent = t('pages.crystal.count', { n: this._filteredCrystals.length })
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
    this._filteredCrystals.forEach((crystal, index) => {
      // 每个卡片用一个独立容器
      const cell = document.createElement('div')
      cell.className = 'card-cell'
      cell.style.setProperty('--i', String(Math.min(index, 18)))
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
        // 回退：保留同一套卡片骨架，样式仍由卡片组件/CSS 接管
        cell.innerHTML = `
        <div class="crystal-card">
          <div class="card-thumb">
            <span class="thumb-placeholder"><span class="thumb-icon">◆</span></span>
          </div>
          <div class="card-body">
            <span class="card-name">${crystal.name}</span>
            <span class="card-formula">${crystal.subtitle || crystal.formula || ''}</span>
          </div>
          <span class="card-tag">${crystal.systemName || crystal.crystalSystem || ''}</span>
        </div>`
      }
    })
  }
}
