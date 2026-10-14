/**
 * home.js — 门户首页：编号列表 · 极简学术风
 *
 * ★ 为什么需要一个首页：统一壳的定位是「一个中枢 + N 个可插拔教学模块」。
 *   没有首页时，打开就直接进某一个模块的视图——那是"单模块应用"的形态，
 *   用户无从知道还有别的模块，将来接入新模块也无处安放入口。
 *
 * ★ 模块清单的来源是 **registry 的 descriptor**，不是 `app.listModules()`。
 *   两者问的是不同的问题：
 *     · `app.listModules()`      → 「现在**能跑**什么」（已装配的，今天只有一个）
 *     · `registry.listModules()` → 「**将要**有什么」（声明过的，三个都在）
 *   门户要回答后者，所以必须用后者——这也正是它显示三行而不是一行的原因。
 *
 * ★ 次序按 `teachingOrder`（descriptor 里的字段），**不是** id 的字母序。
 *   现在若按 id 排会得到 crystal → orbit → symmetry，那只是巧合；
 *   正确的依据是结构化学的授课顺序（原子结构 → 分子对称性 → 晶体结构）。
 *
 * ★ 呈现：编号列表，不用卡片、不放缩略图与大图标。
 *   那是与卡片式不同的一套语言——"高级"来自留白、对齐、层次，不是来自装饰。
 *   未接入的模块**如实弱化标注**（而不是藏起来、也不是假可点）：
 *   让人看得到完整蓝图，同时不误以为它已经能用。
 */
// ★ 只有"带变量的提示语"走 t()（扫描替换对不了变量）；
//   纯静态文案仍留在模板里交给扫描替换 —— 见文件内 onLangChange 的说明。
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
const MODULE_BLURB = {
  orbit: '类氢原子轨道三维可视化',
  symmetry: '分子对称性与分子点群',
  crystal: '晶体结构与点阵型式',
}

/**
 * 模块 id → 配图底部那句"学生得到什么"。
 *
 * ★ 与上面的副标题分工不同：副标题说的是"这里面有什么"，这一句说的是
 *   **学完之后能做什么**（可观察 / 易剖析 / 得贯通）。行内两段并列显示。
 */
const MODULE_TAGLINE = {
  orbit: '微观世界可观察',
  symmetry: '结构规律易剖析',
  crystal: '构效关系得贯通',
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
  }

  unmount() {
    if (this._container) this._container.innerHTML = ''
    this._container = null
  }

  /**
   * 语言变更时重挂自己。
   *
   * ★ 静态文案（"界面风格""即将接入"…）不需要这一手 —— 运行时的 `restore` + `sweep`
   *   已经把它们换好了。需要重挂的是**走 `t()` 取值**的那几处：
   *   行的 `title` 提示（"进入晶体结构"/"…：尚未接入本应用"）与列表与提示语 ——
   *   它们的值在渲染那一刻算出来，DOM 扫描够不着（见 packages/i18n 的两张表说明）。
   * ★ 首页重挂的代价只是拼一次 innerHTML，没有 WebGL、没有异步流水线，所以直接重挂。
   *   （轨道页那种"重建要十几秒"的页面**不能**这么做，见 router._notifyLang。）
   */
  onLangChange() {
    if (this._container) this.mount(this._container)
  }

  /**
   * 首页底部的设置区（界面风格 · 界面语言 · 打开完整设置）。
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
      rows.push('<div class="pl-set-row"><span class="pl-set-label">界面风格</span>'
        + '<span class="pl-seg">' + segOf('theme', this._ui.getTheme() || 'system',
          [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]) + '</span></div>')
    }
    if (this._ui.getLang && this._ui.onLang) {
      // ★ 这里原来还有一句「全站生效：切完页面与图表一起变，不会重算几何」——
      //   已删。理由：它是**给实现者看的**（当初 i18n 刚落地时的必要说明），
      //   对用户既不是选择依据、也不是操作指引；而"不会重算几何"这种话
      //   用户本来就不该操心（重不重建是我们的实现细节）。
      //   真正需要可发现性的是"**哪里**还能换语言" → 设置弹层里也放了一项。
      rows.push('<div class="pl-set-row"><span class="pl-set-label">界面语言</span>'
        + '<span class="pl-seg">' + segOf('lang', this._ui.getLang() || 'zh',
          [['zh', '中文'], ['en', 'English']]) + '</span></div>')
    }
    if (this._ui.onOpenSettings) {
      rows.push('<div class="pl-set-row"><span class="pl-set-label">模型与教学偏好</span>'
        + '<button type="button" class="pl-set-link" data-act="open-settings">'
        + '打开设置（API Key · 模型 · 教学偏好）→</button></div>')
    }
    return rows.length ? '<div class="pl-settings">' + rows.join('') + '</div>' : ''
  }

  _render() {
    const rows = this._modules.map((m, i) => {
      const no = String(m.teachingOrder || (i + 1)).padStart(2, '0')
      const ok = this._available.has(m.id)
      const blurb = MODULE_BLURB[m.id] || ''
      const tagline = MODULE_TAGLINE[m.id] || ''
      const badge = ok ? '' : '<span class="pl-badge">即将接入</span>'
      // ★ 提示语里带模块名 ⇒ **必须走键**（扫描替换对不了变量）；
      //   而 `即将接入` 之类的纯静态文案仍留在模板里，交给扫描替换 —— 少一处键。
      // ★ 模块名（descriptor 的 `title`）本身是**中文原文**，虽然登记在 agent 区的
      //   `text` 表里，但**嵌进句子之后就不再是独立的文本节点**，扫描替换够不着它 ——
      //   不翻一道会得到 "Open「晶体结构」" 这种半英半中。
      const title = tsrc(m.title || m.id) || m.title || m.id
      const tip = ok
        ? t('shell.home.enter', { title })
        : t('shell.home.locked', { title })
      return `
        <button class="pl-row${ok ? '' : ' is-locked'}" type="button" data-module="${m.id}"
                title="${tip}">
          <span class="pl-no">${no}</span>
          <span class="pl-name">${m.title || m.id}</span>
          <span class="pl-blurb">${blurb}</span>
          <span class="pl-tag">${tagline}</span>
          ${badge}
          <span class="pl-arrow">→</span>
        </button>`
    }).join('')

    return `
      <div class="portal">
        <header class="pl-head">
          <h1>结构化学<br><span>教学智能体</span></h1>
          <p class="pl-sub">场景感知式 AI 教学智能体 —— 揭秘微观结构 · 启发深度思考 · 引导自主学习</p>
        </header>
        <nav class="pl-list">${rows}</nav>
        ${this._renderSettings()}
        <footer class="pl-foot">纯前端 · 数值由程序计算（防幻觉）· 模型由使用者自备（BYOK）</footer>
      </div>
      <style>
        /* ---- 极简学术风：留白、对齐、层次；不用卡片、不放装饰 ---- */
        .portal {
          min-height: 100vh; box-sizing: border-box;
          display: flex; flex-direction: column; justify-content: center;
          max-width: 720px; margin: 0 auto;
          padding: 96px 32px 64px;
          /* 用令牌，随主题切换（见 ui-kit/theme.js） */
          color: var(--text, #e8ecf7);
        }
        .pl-head { margin-bottom: 72px; }
        .pl-head h1 {
          font-size: 40px; line-height: 1.28; font-weight: 300;
          letter-spacing: .14em; margin: 0;
          color: var(--text, #e8ecf7);
        }
        .pl-head h1 span { font-weight: 600; }
        .pl-sub {
          margin: 20px 0 0; font-size: 13px; line-height: 1.9;
          letter-spacing: .04em; color: var(--text-dim, #9aa7c6);
        }
        .pl-list { display: flex; flex-direction: column; }
        /* 每一行：序号 / 名称 / 概述 / 箭头；用细线分隔，不用边框盒 */
        .pl-row {
          display: grid;
          grid-template-columns: 3.2em minmax(6.5em, auto) 1fr auto auto auto;
          align-items: baseline; gap: 20px;
          padding: 22px 4px;
          background: none; border: 0; font: inherit; text-align: left;
          color: inherit; cursor: pointer;
          border-top: 1px solid var(--line, rgba(255,255,255,.10));
          transition: padding-left .22s ease, color .22s ease, opacity .22s ease;
        }
        .pl-row:last-of-type { border-bottom: 1px solid var(--line, rgba(255,255,255,.10)); }
        .pl-row:hover { padding-left: 14px; color: var(--accent, #7c9cf5); }
        .pl-row:hover .pl-arrow { transform: translateX(6px); opacity: 1; }
        .pl-row:hover .pl-blurb { color: var(--accent, #7c9cf5); }
        .pl-no {
          font-size: 12px; font-variant-numeric: tabular-nums;
          letter-spacing: .12em; color: var(--text-dim, #9aa7c6);
          transition: color .22s ease;
        }
        .pl-row:hover .pl-no { color: var(--accent, #7c9cf5); }
        .pl-name { font-size: 19px; font-weight: 500; letter-spacing: .04em; }
        .pl-blurb {
          font-size: 12.5px; letter-spacing: .02em;
          color: var(--text-dim, #9aa7c6);
          transition: color .22s ease;
        }
        /* 「学生得到什么」那一句：比概述更弱一档（它是结论，不是内容清单）。
           与配图底部三块一一对应：微观世界可观察 / 结构规律易剖析 / 构效关系得贯通。 */
        .pl-tag {
          font-size: 11.5px; letter-spacing: .08em;
          color: var(--text-dim, #9aa7c6); opacity: .7;
          white-space: nowrap;
        }
        .pl-row:hover .pl-tag { color: var(--accent, #7c9cf5); opacity: 1; }
        .pl-arrow {
          font-size: 15px; color: var(--accent, #7c9cf5); opacity: .5;
          transition: transform .22s ease, opacity .22s ease;
        }
        /* 未接入：弱化 + 如实标注。可变淡，但**仍然可读**——它是蓝图的一部分 */
        .pl-row.is-locked { cursor: default; }
        .pl-row.is-locked .pl-name,
        .pl-row.is-locked .pl-blurb,
        .pl-row.is-locked .pl-no { opacity: .55; }
        .pl-row.is-locked:hover { padding-left: 4px; color: inherit; }
        .pl-row.is-locked:hover .pl-arrow { transform: none; opacity: .22; }
        .pl-row.is-locked:hover .pl-blurb { color: var(--text-dim, #9aa7c6); }
        .pl-badge {
          font-size: 11px; letter-spacing: .08em; padding: 2px 8px;
          border: 1px solid var(--line, rgba(255,255,255,.14));
          border-radius: 999px; color: var(--text-dim, #9aa7c6);
          white-space: nowrap;
        }
        /* 点了未接入的行：轻微晃一下，给一个"这里现在还没有"的反馈 */
        .pl-row.is-nudged { animation: pl-nudge .4s ease; }
        @keyframes pl-nudge {
          0%, 100% { padding-left: 4px; }
          35% { padding-left: 12px; }
          70% { padding-left: 7px; }
        }
        .pl-foot {
          margin-top: 64px; font-size: 11.5px; letter-spacing: .06em;
          color: var(--text-dim, #9aa7c6); opacity: .75;
        }
        /* ---- 设置区：与模块列表同一套"极简学术风"，不另做卡片 ---- */
        .pl-settings {
          margin-top: 56px; padding-top: 28px;
          border-top: 1px solid var(--line-soft, rgba(255,255,255,.08));
          display: flex; flex-direction: column; gap: 14px;
        }
        .pl-set-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .pl-set-label {
          min-width: 7.5em; font-size: 12px; letter-spacing: .08em;
          color: var(--text-dim, #9aa7c6);
        }
        .pl-seg { display: inline-flex; border: 1px solid var(--line, #2a3558); border-radius: 8px; overflow: hidden; }
        .pl-seg-btn {
          appearance: none; background: transparent; border: 0; cursor: pointer;
          color: var(--text-dim, #9aa7c6); font-size: 12.5px; padding: 6px 12px;
          font-family: inherit; transition: background .15s, color .15s;
        }
        .pl-seg-btn + .pl-seg-btn { border-left: 1px solid var(--line, #2a3558); }
        .pl-seg-btn:hover { color: var(--text, #e8ecf7); }
        .pl-seg-btn.is-on { background: var(--active, #2b3d6b); color: var(--text, #e8ecf7); }
        .pl-set-hint { font-size: 11.5px; color: var(--text-dim, #9aa7c6); opacity: .8; }
        .pl-set-link {
          appearance: none; background: transparent; border: 0; padding: 0; cursor: pointer;
          color: var(--accent, #55c2ff); font-size: 12.5px; font-family: inherit;
          text-decoration: underline; text-underline-offset: 3px;
        }
        .pl-set-link:hover { filter: brightness(1.2); }
        @media (max-width: 560px) {
          .portal { padding: 64px 22px 48px; }
          .pl-head h1 { font-size: 30px; }
          .pl-head { margin-bottom: 48px; }
          .pl-row { grid-template-columns: 2.6em 1fr auto; row-gap: 6px; }
          .pl-blurb { grid-column: 2 / -1; }
          .pl-tag { display: none; }
          .pl-badge { display: none; }
        }
      </style>`
  }
}

export default HomePage
