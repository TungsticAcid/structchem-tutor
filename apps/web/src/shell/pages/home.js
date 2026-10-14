/**
 * home.js — 门户首页：导航栏 · Hero 主视觉（含自有渲染图拼贴）· 三张核心卡片 · 设置区 · 页脚
 *
 * ★ 为什么需要一个首页：统一壳的定位是「一个中枢 + N 个可插拔教学模块」。
 *   没有首页时，打开就直接进某一个模块的视图——那是"单模块应用"的形态，
 *   用户无从知道还有别的模块，将来接入新模块也无处安放入口。
 *
 * ★ 模块清单的来源是 **registry 的 descriptor**，不是 `app.listModules()`：
 *   前者回答「**将要**有什么」（声明过的，三个都在），后者只回答「现在能跑什么」。
 *
 * ★ 次序按 `teachingOrder`（结构化学授课顺序：原子结构 → 分子对称性 → 晶体结构）。
 *
 * ★★ 2026-10-14 改版，两轮用户要求都在这里落地：
 *   第一轮：学术专业风、导航栏 + Hero + 三卡 + 设置 + 页脚、保留全部功能入口。
 *   第二轮（本轮）：① **字体要大**（面向各年龄段师生，最小 15.5px、大标题 70px）；
 *     ② **要有色彩与艺术性**（按模块给低饱和强调色 + 柔光背景 + 渐变大标题）；
 *     ③ **用自己的渲染图**（C₆₀ 含主轴与垂直轴 / 3d_xy 轨道 / 立方 ZnS-CPK，
 *        透明底 PNG 放 `apps/web/public/home/`，页面上以半透明错落拼贴呈现）；
 *     ④ **一屏显示完、不留大空白**（实测 1440×900 下页面高 = 视口高）。
 *
 * ★ 三条工程约束（沿用仓库既有判据）：
 *   · 配色写成**页面作用域令牌**（`--pt-*`，浅深两套写在一处），不散落字面量；
 *   · 文案**一律走 `t()`**（键在 apps/web/src/i18n/shell.js 的 zh/en 两张表）——
 *     不赌运行时 DOM 扫描的时机（`☆ 收藏这次演示` 那颗按钮栽过）；
 *   · **保留全部行为钩子**：`data-module` / `data-set`+`data-v` / `.pl-seg-btn` /
 *     `data-act` / `is-locked`+`is-nudged` ⇒ 宿主与既有守卫不用改。
 *   ★ 规范里的「帮助文档 / 关于我们」**没有渲染**：本应用没有这两个页面，
 *     渲染一个点了没反应的链接正是本仓库反复记为缺陷的形态。
 */
import { t, tsrc } from '@i18n/index.js'

/**
 * 模块 id → 一句话能力概述（展现层的内容）。
 * ★ 文案**取自参赛配图**（`比赛配图-1.pptx` 第 1 页的模块卡副标题），门户与配图口径一致。
 */
const MODULE_BLURB_KEY = {
  orbit: 'shell.home.orbit.sub',
  symmetry: 'shell.home.symmetry.sub',
  crystal: 'shell.home.crystal.sub',
}

/** 模块 id → "学完能做什么"（可观察 / 易剖析 / 得贯通） */
const MODULE_TAGLINE_KEY = {
  orbit: 'shell.home.orbit.tag',
  symmetry: 'shell.home.symmetry.tag',
  crystal: 'shell.home.crystal.tag',
}

/** 模块 id → 整句描述（卡片正文） */
const MODULE_DESC_KEY = {
  orbit: 'shell.home.orbit.desc',
  symmetry: 'shell.home.symmetry.desc',
  crystal: 'shell.home.crystal.desc',
}

/**
 * 模块 id → 卡片图标（内联 SVG 线稿，`currentColor` 上色 ⇒ 跟随该模块的强调色）。
 * ★ 不引第三方图标库：三种图标各十来行，引一个库只为三个图标不划算。
 */
const MODULE_ICON = {
  orbit: '<circle cx="12" cy="12" r="2.4"/>'
    + '<ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-28 12 12)"/>'
    + '<ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(28 12 12)"/>',
  symmetry: '<circle cx="12" cy="12" r="2.6"/>'
    + '<circle cx="4.6" cy="6" r="1.7"/><circle cx="19.4" cy="18" r="1.7"/>'
    + '<path d="M6 6.8 18 17.2M6 17.2 18 6.8"/>'
    + '<path d="M12 2.5v19" stroke-dasharray="3 3"/>',
  crystal: '<path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z"/>'
    + '<path d="M4 7.6 12 12l8-4.4M12 12v8.8"/>',
}

/**
 * Hero 右侧的**自有渲染图**拼贴（透明底 PNG，由应用自己的查看器抓出来）。
 * ★ 放 `apps/web/public/home/`，用 `/home/xxx.png` 访问。
 * ★ `mount` 里给它们挂 error 监听：图不在就整块撤掉，绝不显示破图。
 */
const HERO_ART = [
  { src: '/home/3dxy.png', cls: 'pt-art-a' },
  { src: '/home/c60.png', cls: 'pt-art-b' },
  { src: '/home/zns.png', cls: 'pt-art-c' },
]

export class HomePage {
  /**
   * @param {Object} ctx
   * @param {Array<{id:string,title:string,teachingOrder?:number}>} ctx.modules
   * @param {Set<string>|Array<string>} [ctx.available] 已接入（可在本应用里打开的）模块 id
   * @param {string} [ctx.theme] 当前主题，仅用于日志诊断
   */
  constructor(ctx = {}) {
    this._modules = Array.isArray(ctx.modules) ? ctx.modules.slice() : []
    this._available = new Set(ctx.available || [])
    this._theme = ctx.theme || 'dark'
    this._container = null
    /**
     * 首页上的设置回调（都由宿主提供）。
     * ★ 全部可选：没给就**不渲染那一行**，而不是渲染一个点了没反应的控件。
     * ★ `onOpenAgent`：本轮加「问智能体」主按钮用（与右下角悬浮球同一入口）。
     */
    this._ui = {
      getTheme: ctx.getTheme || null,
      onTheme: ctx.onTheme || null,
      getLang: ctx.getLang || null,
      onLang: ctx.onLang || null,
      onOpenSettings: ctx.onOpenSettings || null,
      onOpenAgent: ctx.onOpenAgent || null,
    }
    // ★ 按授课次序排（缺失的排到最后——"没标注"不该抢占首位）
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
     * `body.home-active`：首页在场时挂上，用来**只在这一页**放大智能体悬浮球
     * （悬浮球是壳的元素，不在 .portal 里，作用域选择器够不着它）。
     * ★ 不放进路由：路由只该知道"挂载了哪个页面"，加页面专属的身体类会让它知道太多。
     */
    try { document.body.classList.add('home-active') } catch (e) { /* 非浏览器环境 */ }

    // ★ 自有渲染图缺失时整块撤掉（不显示破图）——见 HERO_ART 注释
    container.querySelectorAll('.pt-shot').forEach((img) => {
      img.addEventListener('error', () => { const w = img.closest('.pt-shot-wrap'); if (w) w.remove() })
    })

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
        // 就地更新高亮，**不整页重渲** —— 重渲会把用户刚点的那一下的视觉反馈冲掉。
        el.parentElement.querySelectorAll('.pl-seg-btn')
          .forEach((b) => b.classList.toggle('is-on', b === el))
      })
    })
    const openBtn = this._container.querySelector('[data-act="open-settings"]')
    if (openBtn && this._ui.onOpenSettings) {
      openBtn.addEventListener('click', () => this._ui.onOpenSettings())
    }
    // 「开始探索」：滚到功能卡片区（真实行为）
    const cta = this._container.querySelector('[data-act="scroll-cards"]')
    if (cta) {
      cta.addEventListener('click', () => {
        const cards = this._container.querySelector('.pt-cards')
        if (cards && cards.scrollIntoView) cards.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
    // ★ 与 mount 成对：撤离时把"首页在场"这个标记拿掉（否则悬浮球一直保持首页放大样式）
    try { document.body.classList.remove('home-active') } catch (e) { /* 非浏览器环境 */ }
  }

  /**
   * 语言变更时重挂自己。
   * ★ 本页文案全程走 `t()`，值在渲染那一刻算出来（DOM 扫描够不着），所以语言一变必须重挂。
   *   首页重挂只是拼一次 innerHTML，没有 WebGL、没有异步流水线（轨道页那种不能这么做）。
   */
  onLangChange() {
    if (this._container) this.mount(this._container)
  }

  /** 设置区（界面与模型设置）：只渲染**真的接上了**的行 */
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
      const tip = ok ? t('shell.home.enter', { title }) : t('shell.home.locked', { title })
      const badge = ok ? '' : '<span class="pt-badge">' + t('shell.home.comingSoon') + '</span>'
      const icon = MODULE_ICON[m.id] || MODULE_ICON.crystal
      return `
        <button class="pt-card pt-card-${m.id}${ok ? '' : ' is-locked'}" type="button"
                data-module="${m.id}" title="${tip}">
          <span class="pt-card-head">
            <span class="pt-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                   stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
            </span>
            <span class="pt-card-title">${title}${badge}</span>
          </span>
          <span class="pt-card-sub">${t(MODULE_BLURB_KEY[m.id] || '')}</span>
          <span class="pt-card-desc">${t(MODULE_DESC_KEY[m.id] || '')}</span>
          <span class="pt-card-tag">${t(MODULE_TAGLINE_KEY[m.id] || '')} →</span>
        </button>`
    }).join('')

    const shots = HERO_ART.map((a) =>
      '<span class="pt-shot-wrap ' + a.cls + '">'
      + '<img class="pt-shot" src="' + a.src + '" alt="" aria-hidden="true"></span>').join('')

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
            <div class="pt-cta-row">
              <button class="pt-cta pt-cta-agent" type="button" data-act="open-agent">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.1
                           A8.3 8.3 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/>
                </svg>${t('shell.home.askAgent')}</button>
              <button class="pt-cta" type="button" data-act="scroll-cards">${t('shell.home.cta')}</button>
            </div>
            <p class="pt-desc">${t('shell.home.desc')}</p>
          </div>
          <div class="pt-hero-art" aria-hidden="true">
            <span class="pt-glow"></span>
            ${shots}
          </div>
        </section>

        <section class="pt-cards">${cards}</section>

        ${this._renderSettings()}

        <footer class="pt-foot">${t('shell.home.footer')}</footer>
      </div>
      <style>
        /**
         * 配色：**页面作用域令牌**，浅深两套写在一处（本仓库栽过"同一份调色板写两处"）。
         * 本轮按用户要求"要有色彩、有艺术性"：主色仍是深蓝，但**每个模块一个低饱和强调色**，
         * 再加一层极淡的柔光背景与渐变大标题 —— 不出现高饱和艳色，保持科研工具的克制感。
         */
        .portal {
          --pt-ink: #16305a;
          --pt-ink-2: #5b8fc9;
          --pt-bg: #f5f7fb;
          --pt-body: #2f3640;
          --pt-dim: #5b6472;
          --pt-card: #ffffff;
          --pt-line: rgba(22, 48, 90, .14);
          --pt-line-soft: rgba(22, 48, 90, .08);
          --pt-shadow: 0 1px 2px rgba(16, 24, 40, .05), 0 10px 26px rgba(16, 24, 40, .06);
          --pt-shadow-hover: 0 2px 8px rgba(16, 24, 40, .08), 0 18px 44px rgba(16, 24, 40, .12);
          --pt-orbit: #6a5acd;
          --pt-symmetry: #1f9c8a;
          --pt-crystal: #c1802c;

          min-height: 100vh; box-sizing: border-box;
          background: var(--pt-bg);
          color: var(--pt-body);
          font-family: "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei",
                       "Segoe UI", system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        [data-theme="dark"] .portal {
          --pt-ink: #e3ecfb;
          --pt-ink-2: #74a6e0;
          --pt-bg: #141a22;
          --pt-body: #e8ebf0;
          --pt-dim: #a8b2c0;
          --pt-card: #1b232e;
          --pt-line: rgba(255, 255, 255, .16);
          --pt-line-soft: rgba(255, 255, 255, .08);
          --pt-shadow: 0 1px 2px rgba(0, 0, 0, .32), 0 10px 28px rgba(0, 0, 0, .3);
          --pt-shadow-hover: 0 2px 8px rgba(0, 0, 0, .38), 0 18px 46px rgba(0, 0, 0, .44);
          --pt-orbit: #9b8cf0;
          --pt-symmetry: #4fc9b5;
          --pt-crystal: #e0ab5e;
        }

        /* ---------- 顶部导航栏 ---------- */
        .pt-bar {
          display: flex; align-items: center; justify-content: space-between;
          height: 52px; padding: 0 40px;
          background: color-mix(in srgb, var(--pt-card) 86%, transparent);
          border-bottom: 1px solid var(--pt-line-soft);
        }
        .pt-brand { display: inline-flex; align-items: center; gap: 12px; color: var(--pt-ink); }
        .pt-logo { width: 30px; height: 30px; }
        .pt-brand-name { font-size: 19px; font-weight: 700; letter-spacing: .02em; }

        /* ---------- Hero ---------- */
        .pt-hero {
          position: relative;
          display: grid; grid-template-columns: minmax(360px, 1fr) minmax(340px, 1fr);
          gap: 20px; align-items: center;
          max-width: 1320px; margin: 0 auto; padding: 10px 40px 8px;
          background:
            radial-gradient(720px 320px at 82% 8%, color-mix(in srgb, var(--pt-ink-2) 12%, transparent), transparent 70%),
            radial-gradient(560px 300px at 12% 92%, color-mix(in srgb, var(--pt-orbit) 9%, transparent), transparent 72%);
          border-radius: 0 0 22px 22px;
        }
        .pt-title { margin: 0; display: flex; flex-direction: column; line-height: 1.0; }
        .pt-title-sm { font-size: 44px; font-weight: 700; color: var(--pt-ink); letter-spacing: .01em; }
        .pt-title-lg {
          font-size: 70px; font-weight: 800; letter-spacing: .01em; margin-top: 4px;
          background: linear-gradient(96deg, var(--pt-ink) 0%, var(--pt-ink-2) 92%);
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
          color: var(--pt-ink);
        }
        .pt-sub { margin: 12px 0 0; font-size: 23px; font-weight: 600; color: var(--pt-ink); }
        .pt-slogan { margin: 6px 0 0; font-size: 16.5px; color: var(--pt-dim); letter-spacing: .04em; }
        .pt-desc { margin: 8px 0 0; font-size: 16px; line-height: 1.7; color: var(--pt-dim); max-width: 40em; }
        .pt-cta-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 14px; }
        .pt-cta {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 15px 34px; border-radius: 999px;
          background: transparent; color: var(--pt-ink); border: 1.5px solid var(--pt-line);
          font: inherit; font-size: 18px; font-weight: 700; letter-spacing: .03em;
          cursor: pointer; transition: background .18s ease, transform .18s ease,
            border-color .18s ease, box-shadow .18s ease;
        }
        .pt-cta:hover { border-color: var(--pt-ink-2); transform: translateY(-1px); }
        .pt-cta svg { width: 20px; height: 20px; }
        .pt-cta-agent {
          background: linear-gradient(96deg, #16305a 0%, #2f6ba8 100%);
          color: #fff; border-color: transparent;
          box-shadow: 0 10px 26px rgba(22, 48, 90, .3);
        }
        .pt-cta-agent:hover { filter: brightness(1.08); color: #fff; }
        [data-theme="dark"] .portal .pt-cta-agent {
          background: linear-gradient(96deg, #2b5b93 0%, #4f8fd0 100%);
        }

        /* ---------- Hero 右侧：自有渲染图错落拼贴 ---------- */
        .pt-hero-art { position: relative; height: 208px; }
        .pt-glow {
          position: absolute; inset: 6% 6% 10% 10%; border-radius: 50%;
          background: radial-gradient(closest-side, color-mix(in srgb, var(--pt-ink-2) 16%, transparent), transparent);
        }
        .pt-shot-wrap { position: absolute; display: block; }
        .pt-shot {
          display: block; width: 100%; height: auto;
          /* PNG 已是透明底，这里再压一档不透明度，做"淡入背景"的观感 */
          opacity: .84;
        }
        .pt-art-a { right: 2%; top: 0; width: 72%; }
        .pt-art-b { left: 0; top: 20%; width: 34%; }
        .pt-art-c { right: 0; bottom: 0; width: 36%; }
        .pt-shot-wrap { animation: pt-float 7s ease-in-out infinite; }
        .pt-art-b { animation-delay: -2.2s; }
        .pt-art-c { animation-delay: -4.4s; }
        @keyframes pt-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-7px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pt-shot-wrap { animation: none; }
        }

        /* ---------- 三张核心卡片 ---------- */
        .pt-cards {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 16px; max-width: 1320px; margin: 2px auto 0; padding: 0 40px;
        }
        .pt-card {
          position: relative; overflow: hidden;
          display: flex; flex-direction: column; align-items: flex-start; gap: 7px;
          padding: 13px 20px 12px; border-radius: 16px; text-align: left;
          background: var(--pt-card); border: 1px solid var(--pt-line-soft);
          box-shadow: var(--pt-shadow); color: var(--pt-body); font: inherit; cursor: pointer;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }
        /* 每张卡一条强调色顶边（"有色彩"用在这一处，克制且成体系） */
        .pt-card::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 4px; }
        .pt-card-orbit::before { background: var(--pt-orbit); }
        .pt-card-symmetry::before { background: var(--pt-symmetry); }
        .pt-card-crystal::before { background: var(--pt-crystal); }
        .pt-card-orbit .pt-icon { color: var(--pt-orbit); }
        .pt-card-symmetry .pt-icon { color: var(--pt-symmetry); }
        .pt-card-crystal .pt-icon { color: var(--pt-crystal); }
        .pt-card:hover { transform: translateY(-3px); box-shadow: var(--pt-shadow-hover); }
        .pt-card-orbit:hover { border-color: var(--pt-orbit); }
        .pt-card-symmetry:hover { border-color: var(--pt-symmetry); }
        .pt-card-crystal:hover { border-color: var(--pt-crystal); }
        .pt-card.is-locked { opacity: .6; cursor: default; }
        .pt-card.is-locked:hover { transform: none; box-shadow: var(--pt-shadow); border-color: var(--pt-line-soft); }
        .pt-card.is-nudged { animation: pt-nudge .6s ease; }
        @keyframes pt-nudge {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .pt-card-head { display: flex; align-items: center; gap: 12px; }
        .pt-icon svg { width: 34px; height: 34px; display: block; }
        .pt-card-title {
          display: inline-flex; align-items: center; gap: 10px;
          font-size: 24px; font-weight: 700; color: var(--pt-ink);
        }
        .pt-badge {
          font-size: 15.5px; font-weight: 500; padding: 3px 10px; border-radius: 999px;
          color: var(--pt-dim); border: 1px solid var(--pt-line);
        }
        .pt-card-sub { font-size: 16px; font-weight: 600; color: var(--pt-dim); }
        .pt-card-desc { font-size: 15.5px; line-height: 1.75; color: var(--pt-body); }
        .pt-card-tag {
          margin-top: auto; padding: 6px 14px; border-radius: 999px;
          background: var(--pt-line-soft); color: var(--pt-ink); font-size: 15.5px;
        }

        /* ---------- 设置区 ---------- */
        .pt-settings { max-width: 1320px; margin: 6px auto 0; padding: 0 40px; }
        .pt-settings-title {
          margin: 0 0 2px; font-size: 15.5px; font-weight: 700;
          color: var(--pt-dim); letter-spacing: .06em;
        }
        .pl-set-row {
          display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
          padding: 3px 0; border-top: 1px solid var(--pt-line-soft);
        }
        .pl-set-row:first-of-type { border-top: 0; }
        .pl-set-label { flex: 0 0 8.5em; font-size: 16px; color: var(--pt-dim); }
        .pl-seg { display: inline-flex; gap: 8px; }
        .pl-seg-btn {
          padding: 6px 15px; border-radius: 10px; cursor: pointer; font: inherit; font-size: 16px;
          background: transparent; color: var(--pt-body); border: 1px solid var(--pt-line);
          transition: background .16s ease, color .16s ease, border-color .16s ease;
        }
        .pl-seg-btn:hover { border-color: var(--pt-ink-2); color: var(--pt-ink); }
        .pl-seg-btn.is-on {
          background: var(--pt-ink); color: var(--pt-card); border-color: var(--pt-ink); font-weight: 700;
        }
        .pl-set-link {
          padding: 6px 15px; border-radius: 10px; cursor: pointer; font: inherit; font-size: 16px;
          background: transparent; color: var(--pt-ink-2); border: 1px solid var(--pt-ink-2);
          transition: background .16s ease, color .16s ease;
        }
        .pl-set-link:hover { background: var(--pt-ink-2); color: #fff; }

        /* ---------- 页脚 ---------- */
        .pt-foot {
          max-width: 1320px; margin: 6px auto 0; padding: 8px 40px 10px;
          border-top: 1px solid var(--pt-line-soft);
          font-size: 15px; color: var(--pt-dim); text-align: center;
        }

        /* ---------- 窄屏 ---------- */
        @media (max-width: 1000px) {
          .pt-bar { padding: 0 20px; }
          .pt-hero { grid-template-columns: 1fr; padding: 18px 20px 16px; }
          .pt-hero-art { height: 220px; order: -1; }
          .pt-title-sm { font-size: 32px; }
          .pt-title-lg { font-size: 46px; }
          .pt-sub { font-size: 19px; }
          .pt-cards { padding: 0 20px; }
          .pt-settings, .pt-foot { padding-left: 20px; padding-right: 20px; }
        }
      </style>`
  }
}

export default HomePage
