/**
 * home.js — 门户首页：导航栏 · Hero 主视觉 · 三张核心功能卡片 · 设置区 · 页脚
 *
 * ★ 为什么需要一个首页：统一壳的定位是「一个中枢 + N 个可插拔教学模块」。
 *   没有首页时，打开就直接进某一个模块的视图——那是"单模块应用"的形态，
 *   用户无从知道还有别的模块，将来接入新模块也无处安放入口。
 *
 * ★ 模块清单的来源是 **registry 的 descriptor**，不是 `app.listModules()`。
 *   两者问的是不同的问题：
 *     · `app.listModules()`      → 「现在**能跑**什么」（已装配的）
 *     · `registry.listModules()` → 「**将要**有什么」（声明过的，三个都在）
 *   门户要回答后者，所以必须用后者——这也正是它显示三张卡而不是一张的原因。
 *
 * ★ 次序按 `teachingOrder`（descriptor 里的字段），**不是** id 的字母序。
 *   正确的依据是结构化学的授课顺序（原子结构 → 分子对称性 → 晶体结构）。
 *
 * ★★ 2026-10-14 改版（用户给了完整设计规范：学术专业风、低饱和、三卡并列、
 *   保留全部功能入口）：从"编号列表"升级为「导航栏 + Hero + 三卡 + 设置 + 页脚」。
 *   · 配色走**页面作用域令牌**（`--pt-*`，浅深两套写在一处），不散落字面量 ——
 *     本仓库栽过"同一份浅色调色板写两处"（第 6 轮）与"页面里 60 处硬编码颜色"（第 9 项待办）。
 *   · 文案一律走 `t()`/`tsrc()`（键在 apps/web/src/i18n/shell.js 的 zh/en 两张表里）：
 *     新加的静态文案**不赌**运行时扫描的时机（`☆ 收藏这次演示` 那颗按钮就栽过）。
 *   · **保留全部原有入口与行为钩子**：`data-module`（进模块）、`data-set`/`data-v`
 *     （界面风格 / 界面语言）、`data-act="open-settings"`（完整设置）、`is-locked` +
 *     `is-nudged`（未接入模块的如实弱化）—— 换皮不换契约，宿主与守卫都不用改。
 *   · 规范里的「帮助文档 / 关于我们」**没有渲染**：本应用没有这两个页面，
 *     渲染一个点了没反应的链接正是本仓库反复记为缺陷的形态（见 _renderSettings 注释）。
 */
// ★ 只有"带变量的提示语"必须走 t()；这里为了**不赌扫描时机**，新文案一律显式 t()。
//   ★ 这里用 `@i18n` 别名（与 main.js 一致）：本文件只被 vite 加载。
//     守卫在 Node 里 import 的是**字典文件**，那些才必须走相对路径。
import { t, tsrc } from '@i18n/index.js'

/**
 * 模块 id → 一句话能力概述（展现层的内容）。
 *
 * ★ 为什么不从 descriptor 的 `capabilities` 生成：
 *   那是一份**路由用的关键词表**（"NaCl"、"CsCl"、"面心立方"…），
 *   直接铺到界面上会变成一串名词。界面要的是一句人能读懂的话，
 *   那是**表现层的职责**——所以放在这里，而不是塞进 descriptor。
 *
 * ★ 这一段文案**取自参赛配图**（`比赛配图-1.pptx` 第 1 页的模块卡副标题）：
 *   轨道视界「类氢原子轨道三维可视化」· 点群观鉴「分子对称性与分子点群」·
 *   晶典在线「晶体结构与点阵型式」。门户与配图口径一致，评审对照时不会两套说法。
 */
const MODULE_BLURB_KEY = {
  orbit: 'shell.home.orbit.sub',
  symmetry: 'shell.home.symmetry.sub',
  crystal: 'shell.home.crystal.sub',
}

/**
 * 模块 id → 卡片上那句"学完之后能做什么"（可观察 / 易剖析 / 得贯通）。
 * ★ 与副标题分工不同：副标题说"这里面有什么"，这一句说"学完能做什么"。
 */
const MODULE_TAGLINE_KEY = {
  orbit: 'shell.home.orbit.tag',
  symmetry: 'shell.home.symmetry.tag',
  crystal: 'shell.home.crystal.tag',
}

/** 模块 id → 一句话描述（规范里给的整句，卡片正文用） */
const MODULE_DESC_KEY = {
  orbit: 'shell.home.orbit.desc',
  symmetry: 'shell.home.symmetry.desc',
  crystal: 'shell.home.crystal.desc',
}

/**
 * 模块 id → 卡片图标（内联 SVG，24×24 线稿）。
 * ★ 用 `currentColor` 上色 ⇒ 跟随卡片标题色，本身不写死颜色。
 * ★ 不引第三方图标库：三种图标各十来行，引一个库只为三个图标不划算。
 */
const MODULE_ICON = {
  // 轨道视界：原子核 + 两条倾斜轨道
  orbit: '<circle cx="12" cy="12" r="2.4"/>'
    + '<ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-28 12 12)"/>'
    + '<ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(28 12 12)"/>',
  // 点群观鉴：中心原子 + 两个配体 + 镜面虚线
  symmetry: '<circle cx="12" cy="12" r="2.6"/>'
    + '<circle cx="4.6" cy="6" r="1.7"/><circle cx="19.4" cy="18" r="1.7"/>'
    + '<path d="M6 6.8 18 17.2M6 17.2 18 6.8"/>'
    + '<path d="M12 2.5v19" stroke-dasharray="3 3"/>',
  // 晶典在线：立方晶胞线稿
  crystal: '<path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z"/>'
    + '<path d="M4 7.6 12 12l8-4.4M12 12v8.8"/>',
}

export class HomePage {
  /**
   * @param {Object} ctx
   * @param {Array<{id:string,title:string,teachingOrder?:number}>} ctx.modules
   *        全部模块（来自 `registry.listModules()`，已按 teachingOrder 排好或由此处再排一次）
   * @param {Set<string>|Array<string>} [ctx.available]
   *        已接入（可在本应用里打开的）模块 id
   * @param {string} [ctx.theme] 当前主题（'dark' | 'light'），仅用于日志诊断
   */
  constructor(ctx = {}) {
    this._modules = Array.isArray(ctx.modules) ? ctx.modules.slice() : []
    this._available = new Set(ctx.available || [])
    this._theme = ctx.theme || 'dark'
    this._container = null
    /**
     * 首页上的设置回调（都由宿主提供）。
     *
     * ★ 为什么这些设置放在首页而不是只藏在智能体面板里：
     *   「界面风格」与「界面语言」是**与具体模块无关**的偏好，用户第一次打开应用
     *   就会想调；而面板（⚙）要先进对话、还只在一处。实测本仓库此前**根本没有**
     *   主题的界面入口 —— 只有 `window.__chemAgent.theme` 这个调试把手。
     * ★ 全部可选：没给就**不渲染那一行**，而不是渲染一个点了没反应的控件
     *   （"看起来能用、其实没接"是本仓库反复记为缺陷的形态）。
     */
    this._ui = {
      getTheme: ctx.getTheme || null,
      onTheme: ctx.onTheme || null,
      getLang: ctx.getLang || null,
      onLang: ctx.onLang || null,
      onOpenSettings: ctx.onOpenSettings || null,
      /**
       * ★★ 2026-10-14（用户："智能体入口要醒目"）：
       *   智能体是这个应用的核心入口，而原先首页上**只有右下角那颗悬浮球** ——
       *   第一眼看不出"这里可以提问"。⇒ 首页出一个显式主按钮（按钮文案带图标的
       *   「问智能体」），并把悬浮球在首页**放大 + 加一圈呼吸光环**（低强度，符合
       *   "科研工具不做炫目动画"的规范）。
       *   ★ 宿主没给回调时**不渲染**这个按钮（不给点了没反应的控件）。
       */
      onOpenAgent: ctx.onOpenAgent || null,
    }
    // ★ 按授课次序排（缺失的排到最后，而不是排到最前——"没标注"不该抢占首位）
    this._modules.sort((a, b) => {
      const oa = typeof a.teachingOrder === 'number' ? a.teachingOrder : Number.MAX_SAFE_INTEGER
      const ob = typeof b.teachingOrder === 'number' ? b.teachingOrder : Number.MAX_SAFE_INTEGER
      return oa - ob
    })
  }

  mount(container) {
    this._container = container
    container.innerHTML = this._render()
    /**
     * ★ `body.home-active`：首页自己在场时挂上，用来**只在这一页**放大智能体悬浮球
     *   （悬浮球是壳的元素、不在 .portal 里，作用域选择器够不着它）。
     *   ★ 不放进路由：路由只认"挂载了哪个页面"，加页面专属的身体类会让它知道太多；
     *     页面自己加、自己撤（unmount 里移除），谁的生命周期谁负责。
     */
    try { document.body.classList.add('home-active') } catch (e) { /* 非浏览器环境 */ }
    container.querySelectorAll('[data-module]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.module
        if (el.classList.contains('is-locked')) {
          // 未接入：给一句如实的说明，而不是静默无反应
          el.classList.add('is-nudged')
          setTimeout(() => el.classList.remove('is-nudged'), 600)
          return
        }
        // 用 hash 跳转，让路由器接管（不要在这里 new 页面——那会绕过 unmount）
        window.location.hash = '#/' + id
      })
    })

    // ---- 设置区：分段控件（界面风格 / 界面语言）与打开完整设置 ----
    this._container.querySelectorAll('[data-set]').forEach((el) => {
      el.addEventListener('click', () => {
        const kind = el.dataset.set
        const v = el.dataset.v
        if (kind === 'theme' && this._ui.onTheme) this._ui.onTheme(v)
        if (kind === 'lang' && this._ui.onLang) this._ui.onLang(v)
        // 就地更新高亮，**不整页重渲** —— 重渲会把用户刚点的那一下的视觉反馈冲掉，
        // 看着像"点了没反应"。主题/语言生效后页面自己会跟着变。
        el.parentElement.querySelectorAll('.pl-seg-btn')
          .forEach((b) => b.classList.toggle('is-on', b === el))
      })
    })
    const openBtn = this._container.querySelector('[data-act="open-settings"]')
    if (openBtn && this._ui.onOpenSettings) {
      openBtn.addEventListener('click', () => this._ui.onOpenSettings())
    }
    // 「开始探索」：滚到功能卡片区（真实行为，不是装饰）
    const cta = this._container.querySelector('[data-act="scroll-cards"]')
    if (cta) {
      cta.addEventListener('click', () => {
        const cards = this._container.querySelector('.pt-cards')
        if (cards && cards.scrollIntoView) cards.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
    // 「问智能体」：打开智能体抽屉（与右下角悬浮球同一入口）
    const ask = this._container.querySelector('[data-act="open-agent"]')
    if (ask && this._ui.onOpenAgent) {
      ask.addEventListener('click', () => {
        try { this._ui.onOpenAgent() } catch (e) { console.warn('[agent] 打开智能体失败：', e) }
      })
    }
  }

  unmount() {
    if (this._container) this._container.innerHTML = ''
    this._container = null
    // ★ 与 mount 成对：撤离时把"首页在场"这个标记拿掉（否则悬浮球会一直保持首页那套放大样式）
    try { document.body.classList.remove('home-active') } catch (e) { /* 非浏览器环境 */ }
  }

  /**
   * 语言变更时重挂自己。
   *
   * ★ 本页文案全程走 `t()`，值在渲染那一刻算出来（DOM 扫描够不着），所以语言一变
   *   必须重挂。★ 首页重挂的代价只是拼一次 innerHTML，没有 WebGL、没有异步流水线，
   *   所以直接重挂（轨道页那种"重建要十几秒"的页面**不能**这么做，见 router._notifyLang）。
   */
  onLangChange() {
    if (this._container) this.mount(this._container)
  }

  /**
   * 首页底部的设置区（界面与模型设置）。
   *
   * ★ 只渲染**真的接上了**的行：回调没给就不出这一行，而不是给出一个
   *   点了没反应的控件 —— 后者正是本仓库反复记为缺陷的形态。
   */
  _renderSettings() {
    const segOf = (kind, cur, pairs) => pairs.map(([v, label]) =>
      '<button type="button" class="pl-seg-btn' + (v === cur ? ' is-on' : '') +
      '" data-set="' + kind + '" data-v="' + v + '">' + label + '</button>').join('')
    const rows = []
    if (this._ui.getTheme && this._ui.onTheme) {
      rows.push('<div class="pl-set-row"><span class="pl-set-label">' + t('shell.home.setTheme') + '</span>'
        + '<span class="pl-seg">' + segOf('theme', this._ui.getTheme() || 'system',
          [['system', t('shell.home.themeSystem')], ['light', t('shell.home.themeLight')],
            ['dark', t('shell.home.themeDark')]]) + '</span></div>')
    }
    if (this._ui.getLang && this._ui.onLang) {
      rows.push('<div class="pl-set-row"><span class="pl-set-label">' + t('shell.home.setLang') + '</span>'
        + '<span class="pl-seg">' + segOf('lang', this._ui.getLang() || 'zh',
          [['zh', '中文'], ['en', 'English']]) + '</span></div>')
    }
    if (this._ui.onOpenSettings) {
      rows.push('<div class="pl-set-row"><span class="pl-set-label">' + t('shell.home.setModel') + '</span>'
        + '<button type="button" class="pl-set-link" data-act="open-settings">'
        + t('shell.home.openSettings') + '</button></div>')
    }
    if (!rows.length) return ''
    return '<section class="pt-settings"><h2 class="pt-settings-title">'
      + t('shell.home.settingsTitle') + '</h2>' + rows.join('') + '</section>'
  }

  _render() {
    const cards = this._modules.map((m) => {
      const ok = this._available.has(m.id)
      const title = tsrc(m.title || m.id) || m.title || m.id
      const tip = ok
        ? t('shell.home.enter', { title })
        : t('shell.home.locked', { title })
      const badge = ok ? '' : '<span class="pt-badge">' + t('shell.home.comingSoon') + '</span>'
      const icon = MODULE_ICON[m.id] || MODULE_ICON.crystal
      return `
        <button class="pt-card${ok ? '' : ' is-locked'}" type="button" data-module="${m.id}"
                title="${tip}">
          <span class="pt-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"
                 stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
          </span>
          <span class="pt-card-title">${title}${badge}</span>
          <span class="pt-card-sub">${t(MODULE_BLURB_KEY[m.id] || '')}</span>
          <span class="pt-card-desc">${t(MODULE_DESC_KEY[m.id] || '')}</span>
          <span class="pt-card-tag">${t(MODULE_TAGLINE_KEY[m.id] || '')} →</span>
        </button>`
    }).join('')

    const heroArt = `
      <svg class="pt-art" viewBox="0 0 560 380" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="ptLobe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity=".18"/>
            <stop offset="100%" stop-color="currentColor" stop-opacity=".04"/>
          </linearGradient>
          <radialGradient id="ptS" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="currentColor" stop-opacity=".16"/>
            <stop offset="100%" stop-color="currentColor" stop-opacity=".02"/>
          </radialGradient>
        </defs>
        <circle class="pt-art-soft" cx="205" cy="120" r="86" fill="url(#ptS)"/>
        <circle class="pt-art-line" cx="205" cy="120" r="86" stroke-opacity=".45"/>
        <path class="pt-art-lobe" d="M360 150c0-42 22-72 44-72s44 30 44 72-22 72-44 72-44-30-44-72z"
              fill="url(#ptLobe)"/>
        <path class="pt-art-line" d="M360 150c0-42 22-72 44-72s44 30 44 72-22 72-44 72-44-30-44-72z"
              stroke-opacity=".55"/>
        <path class="pt-art-lobe" d="M448 150c0-42 22-72 44-72s44 30 44 72-22 72-44 72-44-30-44-72z"
              fill="url(#ptLobe)"/>
        <path class="pt-art-line" d="M448 150c0-42 22-72 44-72s44 30 44 72-22 72-44 72-44-30-44-72z"
              stroke-opacity=".55"/>
        <g class="pt-art-line" stroke-opacity=".5">
          <path d="M96 268 176 312l84-46-80-44z"/>
          <path d="M96 268v88l84 46 80-46v-88M180 268v88"/>
          <path d="M176 312 260 356M180 268 260 222"/>
        </g>
        <g class="pt-art-dot" fill="currentColor" fill-opacity=".5">
          <circle cx="96" cy="268" r="3"/><circle cx="176" cy="312" r="3"/>
          <circle cx="260" cy="266" r="3"/><circle cx="180" cy="268" r="3"/>
          <circle cx="260" cy="356" r="3"/><circle cx="96" cy="356" r="3"/>
          <circle cx="420" cy="60" r="3"/><circle cx="500" cy="120" r="3"/>
          <circle cx="380" cy="240" r="3"/><circle cx="520" cy="230" r="3"/>
        </g>
      </svg>`

    return `
      <div class="portal">
        <header class="pt-bar">
          <span class="pt-brand">
            <svg class="pt-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.3" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z"/>
              <path d="M4 7.6 12 12l8-4.4M12 12v8.8"/>
              <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>
            </svg>
            <span class="pt-brand-name">${t('shell.home.brand')}</span>
          </span>
        </header>

        <section class="pt-hero">
          <div class="pt-hero-text">
            <h1 class="pt-title">
              <span class="pt-title-sm">${t('shell.home.titleSm')}</span>
              <span class="pt-title-lg">${t('shell.home.titleLg')}</span>
            </h1>
            <p class="pt-sub">${t('shell.home.sub')}</p>
            <p class="pt-slogan">${t('shell.home.slogan')}</p>
            <p class="pt-desc">${t('shell.home.desc')}</p>
            <div class="pt-cta-row">
              <button class="pt-cta" type="button" data-act="scroll-cards">${t('shell.home.cta')}</button>
              ${this._ui.onOpenAgent ? '<button class="pt-cta pt-cta-agent" type="button" data-act="open-agent">'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"'
                + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                + '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.1'
                + 'A8.3 8.3 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/></svg>'
                + t('shell.home.askAgent') + '</button>' : ''}
            </div>
            <p class="pt-ask-hint">${this._ui.onOpenAgent ? t('shell.home.askHint') : ''}</p>
          </div>
          <div class="pt-hero-art">${heroArt}</div>
        </section>

        <section class="pt-cards">${cards}</section>

        ${this._renderSettings()}

        <footer class="pt-foot">${t('shell.home.footer')}</footer>
      </div>
      <style>
        /**
         * 配色：**页面作用域令牌**，浅深两套写在一处。
         * 规范给的：主色 #1A365D（深蓝）· 辅助 #6395CC（浅蓝）·
         * 背景 #F7F8FA / #161B22 · 正文 #333 / #E5E7EB · 次要 #6B7280。
         * ★ 深色下把主色换成"深蓝的亮化版"，否则深蓝字压在深底上读不出来。
         */
        .portal {
          --pt-ink: #1a365d;
          --pt-ink-2: #6395cc;
          --pt-bg: #f7f8fa;
          --pt-body: #333333;
          --pt-dim: #6b7280;
          --pt-card: #ffffff;
          --pt-line: rgba(26, 54, 93, .12);
          --pt-line-soft: rgba(26, 54, 93, .07);
          --pt-shadow: 0 1px 2px rgba(16, 24, 40, .04), 0 8px 24px rgba(16, 24, 40, .05);
          --pt-shadow-hover: 0 2px 6px rgba(16, 24, 40, .07), 0 16px 40px rgba(16, 24, 40, .10);

          min-height: 100vh; box-sizing: border-box;
          background: var(--pt-bg);
          color: var(--pt-body);
          /* 思源黑体优先，回落到系统无衬线；化学式/英文交给后续字体栈 */
          font-family: "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei",
                       "Segoe UI", system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        [data-theme="dark"] .portal {
          --pt-ink: #dbe6f7;
          --pt-ink-2: #6395cc;
          --pt-bg: #161b22;
          --pt-body: #e5e7eb;
          --pt-dim: #9aa4b2;
          --pt-card: #1c232e;
          --pt-line: rgba(255, 255, 255, .14);
          --pt-line-soft: rgba(255, 255, 255, .07);
          --pt-shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 10px 28px rgba(0, 0, 0, .3);
          --pt-shadow-hover: 0 2px 8px rgba(0, 0, 0, .35), 0 18px 44px rgba(0, 0, 0, .42);
        }

        /* ---------- 顶部导航栏 ---------- */
        .pt-bar {
          display: flex; align-items: center; justify-content: space-between;
          height: 60px; padding: 0 40px;
          background: color-mix(in srgb, var(--pt-card) 88%, transparent);
          border-bottom: 1px solid var(--pt-line-soft);
        }
        .pt-brand { display: inline-flex; align-items: center; gap: 10px; color: var(--pt-ink); }
        .pt-logo { width: 26px; height: 26px; }
        .pt-brand-name { font-size: 16px; font-weight: 700; letter-spacing: .02em; }

        /* ---------- Hero 主视觉 ---------- */
        .pt-hero {
          display: grid; grid-template-columns: minmax(320px, 1fr) minmax(280px, 1fr);
          gap: 40px; align-items: center;
          max-width: 1200px; margin: 0 auto; padding: 72px 40px 56px;
        }
        .pt-title { margin: 0; display: flex; flex-direction: column; line-height: 1.08; }
        .pt-title-sm { font-size: 38px; font-weight: 700; color: var(--pt-ink); letter-spacing: .01em; }
        .pt-title-lg {
          font-size: 60px; font-weight: 800; color: var(--pt-ink);
          letter-spacing: .01em; margin-top: 6px;
        }
        .pt-sub {
          margin: 22px 0 0; font-size: 19px; font-weight: 600; color: var(--pt-ink);
          letter-spacing: .01em;
        }
        .pt-slogan { margin: 10px 0 0; font-size: 14px; color: var(--pt-dim); letter-spacing: .06em; }
        .pt-desc {
          margin: 18px 0 0; font-size: 13.5px; line-height: 2; color: var(--pt-dim);
          max-width: 46em;
        }
        .pt-cta-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 30px; }
        .pt-cta {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 13px 30px; border-radius: 999px;
          background: transparent; color: var(--pt-ink); border: 1px solid var(--pt-line);
          font: inherit; font-size: 15px; font-weight: 600; letter-spacing: .04em;
          cursor: pointer; transition: background .18s ease, transform .18s ease,
            border-color .18s ease, box-shadow .18s ease;
        }
        .pt-cta:hover { border-color: var(--pt-ink-2); color: var(--pt-ink); transform: translateY(-1px); }
        .pt-cta svg { width: 17px; height: 17px; }
        /* ★ 智能体入口：主按钮（实心深蓝 + 光环），且比「开始探索」更抢眼 */
        .pt-cta-agent {
          background: #1a365d; color: #fff; border-color: #1a365d;
          box-shadow: 0 6px 18px rgba(26, 54, 93, .28);
        }
        .pt-cta-agent:hover { background: #24467a; border-color: #24467a; color: #fff; }
        [data-theme="dark"] .portal .pt-cta-agent { background: #2f5b96; border-color: #2f5b96; }
        [data-theme="dark"] .portal .pt-cta-agent:hover { background: #3a6cad; }
        .pt-ask-hint { margin: 10px 0 0; font-size: 12.5px; color: var(--pt-dim); letter-spacing: .02em; }

        /**
         * 首页上把智能体悬浮球**放大 + 加一圈呼吸光环**（只在本页生效）。
         * ★ 悬浮球是壳的元素（body 下的 .agent-fab），不在 .portal 里，所以用 body 上的
         *   home-active（由本页 mount/unmount 挂/撤）来限定作用域。
         * ★ 动画强度按规范压到最低：只做 2.6s 的柔和呼吸，不做粒子/旋转。
         */
        body.home-active .agent-fab {
          width: 72px; height: 72px;
          right: 26px; bottom: 26px;
          filter: drop-shadow(0 8px 22px rgba(26, 54, 93, .35));
          animation: pt-fab-breathe 2.6s ease-in-out infinite;
        }
        @keyframes pt-fab-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        @media (prefers-reduced-motion: reduce) {
          body.home-active .agent-fab { animation: none; }
        }
        .pt-hero-art { color: var(--pt-ink-2); }
        .pt-art { width: 100%; height: auto; max-height: 380px; }
        .pt-art-line { fill: none; stroke: currentColor; stroke-width: 1.2; }
        .pt-art-lobe { stroke: currentColor; stroke-width: 1.2; }

        /* ---------- 三张核心功能卡片 ---------- */
        .pt-cards {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(248px, 1fr));
          gap: 20px; max-width: 1200px; margin: 0 auto; padding: 0 40px 8px;
        }
        .pt-card {
          display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
          padding: 26px 24px 22px; border-radius: 14px; text-align: left;
          background: var(--pt-card); border: 1px solid var(--pt-line-soft);
          box-shadow: var(--pt-shadow); color: var(--pt-body);
          font: inherit; cursor: pointer;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }
        .pt-card:hover {
          transform: translateY(-3px); box-shadow: var(--pt-shadow-hover);
          border-color: var(--pt-ink-2);
        }
        .pt-card.is-locked { opacity: .62; cursor: default; }
        .pt-card.is-locked:hover { transform: none; box-shadow: var(--pt-shadow); border-color: var(--pt-line-soft); }
        .pt-card.is-nudged { animation: pt-nudge .6s ease; }
        @keyframes pt-nudge {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .pt-icon { color: var(--pt-ink); }
        .pt-icon svg { width: 30px; height: 30px; display: block; }
        .pt-card-title {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 19px; font-weight: 700; color: var(--pt-ink);
        }
        .pt-badge {
          font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 999px;
          color: var(--pt-dim); border: 1px solid var(--pt-line);
        }
        .pt-card-sub { font-size: 13px; color: var(--pt-dim); }
        .pt-card-desc { font-size: 13px; line-height: 1.9; color: var(--pt-body); }
        .pt-card-tag {
          margin-top: auto; padding: 4px 12px; border-radius: 999px;
          background: var(--pt-line-soft); color: var(--pt-ink); font-size: 12px;
        }

        /* ---------- 设置区 ---------- */
        .pt-settings {
          max-width: 1200px; margin: 44px auto 0; padding: 0 40px;
        }
        .pt-settings-title {
          margin: 0 0 14px; font-size: 13px; font-weight: 600;
          color: var(--pt-dim); letter-spacing: .08em;
        }
        .pl-set-row {
          display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
          padding: 13px 0; border-top: 1px solid var(--pt-line-soft);
        }
        .pl-set-label { flex: 0 0 9em; font-size: 13px; color: var(--pt-dim); }
        .pl-seg { display: inline-flex; gap: 6px; }
        .pl-seg-btn {
          padding: 6px 14px; border-radius: 8px; cursor: pointer; font: inherit; font-size: 13px;
          background: transparent; color: var(--pt-body); border: 1px solid var(--pt-line);
          transition: background .16s ease, color .16s ease, border-color .16s ease;
        }
        .pl-seg-btn:hover { border-color: var(--pt-ink-2); color: var(--pt-ink); }
        .pl-seg-btn.is-on {
          background: var(--pt-ink); color: var(--pt-card); border-color: var(--pt-ink);
          font-weight: 600;
        }
        .pl-set-link {
          padding: 6px 14px; border-radius: 8px; cursor: pointer; font: inherit; font-size: 13px;
          background: transparent; color: var(--pt-ink-2); border: 1px solid var(--pt-ink-2);
          transition: background .16s ease, color .16s ease;
        }
        .pl-set-link:hover { background: var(--pt-ink-2); color: #fff; }

        /* ---------- 页脚 ---------- */
        .pt-foot {
          max-width: 1200px; margin: 40px auto 0; padding: 22px 40px 34px;
          border-top: 1px solid var(--pt-line-soft);
          font-size: 12.5px; color: var(--pt-dim); text-align: center;
        }

        /* ---------- 窄屏 ---------- */
        @media (max-width: 900px) {
          .pt-bar { padding: 0 20px; }
          .pt-hero { grid-template-columns: 1fr; padding: 44px 20px 34px; gap: 18px; }
          .pt-title-sm { font-size: 28px; }
          .pt-title-lg { font-size: 40px; }
          .pt-hero-art { order: -1; }
          .pt-art { max-height: 220px; }
          .pt-cards { padding: 0 20px; }
          .pt-settings, .pt-foot { padding-left: 20px; padding-right: 20px; }
        }
      </style>`
  }
}

export default HomePage
