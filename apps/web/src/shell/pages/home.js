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

/**
 * 模块 id → 一句话能力概述（展现层的内容）。
 *
 * ★ 为什么不从 descriptor 的 `capabilities` 生成：
 *   那是一份**路由用的关键词表**（"NaCl"、"CsCl"、"面心立方"…），
 *   直接铺到界面上会变成一串名词。界面要的是一句人能读懂的话，
 *   那是**表现层的职责**——所以放在这里，而不是塞进 descriptor。
 */
const MODULE_BLURB = {
  orbit: '径向分布 · 角度分布 · 节面',
  symmetry: '对称元素 · 点群 · 特征标表',
  crystal: '晶体库 · 配位环境 · 空隙分布',
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
  }

  unmount() {
    if (this._container) this._container.innerHTML = ''
    this._container = null
  }

  _render() {
    const rows = this._modules.map((m, i) => {
      const no = String(m.teachingOrder || (i + 1)).padStart(2, '0')
      const ok = this._available.has(m.id)
      const blurb = MODULE_BLURB[m.id] || ''
      const badge = ok ? '' : '<span class="pl-badge">即将接入</span>'
      return `
        <button class="pl-row${ok ? '' : ' is-locked'}" type="button" data-module="${m.id}"
                title="${ok ? '进入' + (m.title || m.id) : (m.title || m.id) + '：尚未接入本应用'}">
          <span class="pl-no">${no}</span>
          <span class="pl-name">${m.title || m.id}</span>
          <span class="pl-blurb">${blurb}</span>
          ${badge}
          <span class="pl-arrow">→</span>
        </button>`
    }).join('')

    return `
      <div class="portal">
        <header class="pl-head">
          <h1>结构化学<br><span>教学智能体</span></h1>
          <p class="pl-sub">一个中枢 · 可插拔教学模块 —— 问它问题，它会一边讲一边把画面演出来</p>
        </header>
        <nav class="pl-list">${rows}</nav>
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
          grid-template-columns: 3.2em minmax(6.5em, auto) 1fr auto auto;
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
        @media (max-width: 560px) {
          .portal { padding: 64px 22px 48px; }
          .pl-head h1 { font-size: 30px; }
          .pl-head { margin-bottom: 48px; }
          .pl-row { grid-template-columns: 2.6em 1fr auto; row-gap: 6px; }
          .pl-blurb { grid-column: 2 / -1; }
          .pl-badge { display: none; }
        }
      </style>`
  }
}

export default HomePage
