/**
 * home.js — 门户首页：结构化学 · 教学智能体
 *
 * ===========================================================================
 * 一、这一版在视觉上做了什么（2026-10-17 全面重写）
 * ===========================================================================
 * 目标：科技感 · 结构化学气质 · 本程序特色 · 足够吸睛。
 *
 * 它不是"给极简列表加装饰"，而是把首页当成一块**结构探针仪表**来组织：
 *
 *   1. **全息主视觉**（右侧 canvas）：立方八面体线框（FCC 的 12 配位多面体）
 *      + **真算出来的** 3d_z² 电子云点云 + 三条 3D 轨道环 + 原子核光晕 + 刻度环。
 *      点云不是贴图：每个点的位置来自角度函数 3cos²θ−1（见 home-visuals.js），
 *      所以"两个大瓣沿 z 轴、赤道一圈负相位"是数学事实，与轨道模块的等值面同源。
 *   2. **动态晶格背景**：整页一层低亮度 canvas —— 立方晶格线框 + 尘埃视差
 *      + 透视地面网格 + 缓慢扫过的一道扫描线。鼠标移动有轻微视差。
 *   3. **三张模块卡各带一块实时演算的演示画布**：轨道（3d_z² 电子云）、
 *      点群（甲烷 Td 球棍 + C₃ 轴）、晶体（NaCl 岩盐型晶胞）。三者都是程序
 *      算出来的几何，不是截图 —— 这是"本程序特色"的直接证据。
 *   4. **HUD 语言**：等宽小字 + 化学标识（ψ、Td·24、Fm3̄m·5.64 Å、CN 12）
 *      + 刻度环/角标/扫描线，构成"仪器"的观感。
 *   5. **深浅两套配色**：颜色全部是 CSS 令牌（--pt-*），canvas 只**读**不写死
 *      —— 切主题时页面与五块画布一起变（本仓库栽过"两份调色板"的跟头）。
 *
 * ===========================================================================
 * 二、工程约束（为什么代码长这样）
 * ===========================================================================
 * ★ 全部文案走 `t()`：本页要重画的 DOM 很多，走键就不依赖运行时扫描的时机；
 *   中文一个都不留在模板串里（模板里出现中文会被 i18n 覆盖率守卫计入分母）。
 * ★ 数学与渲染分离：几何/投影/调色板读取在 `home-visuals.js`（无 DOM、可被
 *   Node 守卫独立重算），本文件只做 DOM 与 Canvas 绘制。
 * ★ 资源必须成对释放：五块 canvas 的 rAF、ResizeObserver、IntersectionObserver、
 *   matchMedia、document 上的监听器、MutationObserver、body 上的 home-active
 *   全部在 unmount 里撤掉 —— 首页会被反复进出（每次换语言也会重挂一次）。
 * ★ 尊重 prefers-reduced-motion：不跑动画循环，只画一帧静态画面。
 * ★ 本文件的大模板串里**不许出现反引号**（本仓库已因此白屏七次）。样式单独
 *   放在 STYLE 常量里，里面只有一处 ${MONO} 字体栈插值 —— 减少模板串被截断的机会。
 */

import { t, tsrc } from '@i18n/index.js'
import {
  TAU, clamp01, rotateXYZ, project, projectOblique, createPalette, rgba,
  createSphericalCage, createNodalCones, createMethane, createLatticeScene,
  createOrbitalCloud, createDust, createBackgroundLattice,
} from './home-visuals.js'

/**
 * 模块 id → 卡片文案的键。
 * ★ 写成显式表而不是 `'shell.home.' + id + '.sub'` 拼出来：拼出来的键
 *   静态读不到，以后改文案/删模块时容易留下悬空键。
 */
const MODULE_COPY = {
  orbit: { sub: 'shell.home.orbit.sub', desc: 'shell.home.orbit.desc', tag: 'shell.home.orbit.tag' },
  symmetry: { sub: 'shell.home.symmetry.sub', desc: 'shell.home.symmetry.desc', tag: 'shell.home.symmetry.tag' },
  crystal: { sub: 'shell.home.crystal.sub', desc: 'shell.home.crystal.desc', tag: 'shell.home.crystal.tag' },
}

/** 卡片画布上角的"正在演示什么"（化学标识；变量用斜体、下标用 <sub>，见文件头排版约定） */
const MODULE_DEMO = {
  orbit: '2<i>p</i><sub><i>z</i></sub>',
  symmetry: '<i>T</i><sub>d</sub> · 24',
  // Fm3̄m 是 Hermann–Mauguin 空间群符号：**正体**，3 上有横杠（用 CSS overline 画，
  // 组合字符 3̄ 在有些字体里横杠几乎看不见）
  crystal: 'NaCl · Fm<span class="pt-bar">3</span>m',
}

/** 等宽字体栈：HUD/编号/英文小字用（正文仍走 --font-ui 令牌） */
const MONO = 'ui-monospace, "Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace'

// ---------------------------------------------------------------------------
// 画布绘制的几个基础图元（纯函数式，只碰 ctx）
// ---------------------------------------------------------------------------
function drawLine(ctx, x1, y1, x2, y2, color, width, alpha) {
  if (!(alpha > 0)) return
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawDot(ctx, x, y, r, color, alpha) {
  if (!(r > 0) || !(alpha > 0)) return
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
}

/** 径向光晕（比 shadowBlur 便宜，且在软件渲染下也稳定） */
function drawGlow(ctx, x, y, r, color, alpha) {
  if (!(r > 0) || !(alpha > 0)) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, alpha))
  g.addColorStop(0.45, rgba(color, alpha * 0.38))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
}

/** 把世界坐标点投影成画布坐标（返回 null 表示在相机后方） */
function toScreen(p, cam) {
  return project(p, cam)
}

// ---------------------------------------------------------------------------
// 页面
// ---------------------------------------------------------------------------
export class HomePage {
  /**
   * @param {Object} ctx
   * @param {Array<{id:string,title:string,teachingOrder?:number}>} ctx.modules
   * @param {Set<string>|Array<string>} [ctx.available] 已接入（可打开）的模块 id
   * @param {Function} [ctx.onOpenAgent] 打开智能体抽屉（与右下角悬浮球同一入口）
   * @param {Function} [ctx.getTheme] / [ctx.onTheme]
   * @param {Function} [ctx.getLang] / [ctx.onLang]
   * @param {Function} [ctx.onOpenSettings] 预留：本版首页不放设置入口（用户要求删过）
   */
  constructor(ctx = {}) {
    this._modules = Array.isArray(ctx.modules) ? ctx.modules.slice() : []
    this._available = new Set(ctx.available || [])
    this._container = null
    this._portal = null
    this._ui = {
      getTheme: ctx.getTheme || null,
      onTheme: ctx.onTheme || null,
      getLang: ctx.getLang || null,
      onLang: ctx.onLang || null,
      onOpenSettings: ctx.onOpenSettings || null,
      onOpenAgent: ctx.onOpenAgent || null,
    }
    // 按授课次序排（缺失的排最后，而不是抢首位）
    this._modules.sort((a, b) => {
      const oa = typeof a.teachingOrder === 'number' ? a.teachingOrder : Number.MAX_SAFE_INTEGER
      const ob = typeof b.teachingOrder === 'number' ? b.teachingOrder : Number.MAX_SAFE_INTEGER
      return oa - ob
    })

    // ---- 几何场景：只依赖确定性随机种子，刷新后画面一致（截图可对比） ----
    this._scenes = {
      bgLattice: createBackgroundLattice({ n: 4, spacing: 1 }),
      dust: createDust({ count: 150, seed: 3 }),
      // 主视觉：3d_z² 电子云 + **球坐标网格**（纬线/经线）+ **节锥**（3cos²θ−1 = 0）
      holoCloud: createOrbitalCloud('dz2', { count: 280, seed: 5, spread: 0.72 }),
      cage: createSphericalCage(),
      cones: createNodalCones(54.7356, { generatrices: 18 }),
      orbitCloud: createOrbitalCloud('pz', { count: 260, seed: 9, spread: 0.62 }),
      methane: createMethane(),
      lattice: createLatticeScene({ n: 3 }),
    }

    // ---- 动画状态（mount 时重置） ----
    this._canvas = []
    this._raf = 0
    this._stopped = true
    this._reduced = false
    this._pointer = { tx: 0, ty: 0, x: 0, y: 0 }
    this._t0 = 0
    this._palette = null
    this._resizeObs = null
    this._intersectObs = null
    this._themeObs = null
    this._mql = null
    this._cleanup = []
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------
  mount(container) {
    this._stopVisuals()
    this._container = container
    container.innerHTML = this._render()
    this._portal = container.querySelector('.portal')

    /**
     * ★ 首页悬浮球加大 + 呼吸：用 body 上的 home-active 限定作用域。
     *   悬浮球是壳的元素（在 document.body 下），不在 .portal 里，选择器够不着它。
     */
    try { document.body.classList.add('home-active') } catch (e) { /* 非浏览器环境 */ }

    this._bindEvents()
    this._startVisuals()
  }

  unmount() {
    this._stopVisuals()
    if (this._container) this._container.innerHTML = ''
    this._container = null
    this._portal = null
    try { document.body.classList.remove('home-active') } catch (e) { /* 非浏览器环境 */ }
  }

  /**
   * 语言变更：整页重挂。
   * ★ 与旧版同一判断：首页重挂只是重拼一次 innerHTML + 五块小画布，没有
   *   WebGL、没有异步流水线（轨道页那种十几秒的页面不能这么做）。
   */
  onLangChange() {
    if (this._container) this.mount(this._container)
  }

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------
  _renderSettings() {
    const seg = (kind, cur, pairs) =>
      '<span class="pt-seg">' + pairs.map(([v, label]) =>
        '<button type="button" class="pt-seg-btn' + (v === cur ? ' is-on' : '')
        + '" data-set="' + kind + '" data-v="' + v + '">' + label + '</button>').join('') + '</span>'
    const rows = []
    if (this._ui.getTheme && this._ui.onTheme) {
      rows.push('<span class="pt-set"><span class="pt-set-label">' + t('shell.home.setTheme') + '</span>'
        + seg('theme', this._ui.getTheme() || 'system', [
          ['system', t('shell.home.themeSystem')],
          ['light', t('shell.home.themeLight')],
          ['dark', t('shell.home.themeDark')],
        ]) + '</span>')
    }
    if (this._ui.getLang && this._ui.onLang) {
      rows.push('<span class="pt-set"><span class="pt-set-label">' + t('shell.home.setLang') + '</span>'
        + seg('lang', this._ui.getLang() || 'zh', [['zh', '中文'], ['en', 'English']]) + '</span>')
    }
    return rows.join('')
  }

  _renderFeats() {
    const items = [
      ['visual', 'shell.home.featVisual'],
      ['scene', 'shell.home.featScene'],
      ['deterministic', 'shell.home.featDeterministic'],
      ['modular', 'shell.home.featModular'],
    ]
    return items.map(([kind, key]) =>
      '<li class="pt-feat pt-feat--' + kind + '"><i aria-hidden="true"></i>' + t(key) + '</li>').join('')
  }

  /**
   * 一张模块卡。
   * ★ 已接入的用 `<a href="#/id">`：中键/回车/新标签页都能用，且 hash 变化由
   *   路由器接管（与用户点按钮走同一条通路）。未接入的用 `<button aria-disabled>`：
   *   点了给一次"还没接入"的轻晃反馈，而不是静默无反应。
   */
  _renderCard(m, i) {
    const copy = MODULE_COPY[m.id] || null
    const ok = this._available.has(m.id)
    const no = String(typeof m.teachingOrder === 'number' ? m.teachingOrder : (i + 1)).padStart(2, '0')
    const title = tsrc(m.title || m.id) || m.title || m.id
    const tip = ok ? t('shell.home.enter', { title }) : t('shell.home.locked', { title })
    const tag = ok ? 'a' : 'button'
    const attrs = ok
      ? 'href="#/' + m.id + '"'
      : 'type="button" aria-disabled="true"'
    const badge = ok ? '' : '<span class="pt-badge">' + t('shell.home.comingSoon') + '</span>'
    return '<' + tag + ' class="pt-card' + (ok ? '' : ' is-locked') + '" data-module="' + m.id
      + '" data-order="' + no + '" ' + attrs + ' title="' + tip + '">'
      + '<span class="pt-card-glow" aria-hidden="true"></span>'
      + '<span class="pt-card-top">'
      + '<span class="pt-card-no">' + no + '</span>'
      + '<span class="pt-card-code">' + String(m.id).toUpperCase() + ' · MODULE</span>'
      + '<span class="pt-card-arrow" aria-hidden="true">↗</span>'
      + '</span>'
      + '<span class="pt-card-visual">'
      + '<canvas class="pt-canvas pt-card-canvas" data-canvas="' + m.id + '" aria-hidden="true"></canvas>'
      + '<span class="pt-card-demo" aria-hidden="true">' + (MODULE_DEMO[m.id] || '') + '</span>'
      + '</span>'
      + '<span class="pt-card-body">'
      + '<span class="pt-card-name">' + title + '</span>'
      + (copy ? '<span class="pt-card-sub">' + t(copy.sub) + '</span>' : '')
      + (copy ? '<span class="pt-card-desc">' + t(copy.desc) + '</span>' : '')
      + '</span>'
      + '<span class="pt-card-foot">'
      + (copy ? '<span class="pt-card-tag">' + t(copy.tag) + '</span>' : '<span></span>')
      + '<span class="pt-card-enter">' + t('shell.home.enterModule')
      + ' <span class="pt-card-enter-arrow" aria-hidden="true">→</span></span>'
      + '</span>'
      + badge
      + '</' + tag + '>'
  }

  _render() {
    const lang = (this._ui.getLang && this._ui.getLang()) || 'zh'
    const cards = this._modules.map((m, i) => this._renderCard(m, i)).join('')
    const markup = `
      <div class="portal lang-${lang}" data-home-page>
        <canvas class="pt-canvas pt-canvas--bg" data-canvas="bg" aria-hidden="true"></canvas>
        <div class="pt-aurora pt-aurora--a" aria-hidden="true"></div>
        <div class="pt-aurora pt-aurora--b" aria-hidden="true"></div>
        <div class="pt-grid-bg" aria-hidden="true"></div>
        <div class="pt-scanlines" aria-hidden="true"></div>
        <div class="pt-noise" aria-hidden="true"></div>
        <div class="pt-vignette" aria-hidden="true"></div>

        <header class="pt-top">
          <div class="pt-brand">
            <span class="pt-logo" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">
                <path d="M16 3.2 27 9.4v12.4L16 28 5 21.8V9.4z"/>
                <path d="M16 9.2v13.6M9.5 12.9l13 6.2M22.5 12.9l-13 6.2" opacity=".65"/>
                <circle cx="16" cy="16" r="2.6" fill="currentColor" stroke="none"/>
              </svg>
            </span>
            <span class="pt-brand-text">
              <span class="pt-brand-name">${t('shell.home.brand')}</span>
              <span class="pt-brand-en">STRUCTURAL CHEMISTRY · AI TEACHING AGENT</span>
            </span>
          </div>
          <div class="pt-top-meta">
            <span class="pt-status"><i class="pt-dot" aria-hidden="true"></i>${t('shell.home.status')}</span>
            <span class="pt-ver">v0.1.0</span>
          </div>
        </header>

        <main class="pt-hero">
          <div class="pt-hero-copy">
            <p class="pt-kicker"><span class="pt-kicker-rule" aria-hidden="true"></span>SCENE-AWARE · HUB + 3 MODULES</p>
            <h1 class="pt-title">
              <span class="pt-title-line">${t('shell.home.titleSm')}</span>
              <span class="pt-title-line pt-title-line--accent">${t('shell.home.titleLg')}</span>
              <span class="pt-title-en">TEACHING AI AGENT</span>
            </h1>
            <p class="pt-slogan">${t('shell.home.slogan')}</p>
            <p class="pt-desc">${t('shell.home.desc')}</p>
            <div class="pt-actions">
              <button type="button" class="pt-btn pt-btn--primary" data-act="explore">
                <span>${t('shell.home.cta')}</span><span class="pt-btn-arrow" aria-hidden="true">→</span>
              </button>
              <button type="button" class="pt-btn pt-btn--ghost" data-act="ask" title="${t('shell.home.askHint')}">
                <span class="pt-btn-pulse" aria-hidden="true"></span>${t('shell.home.askAgent')}
              </button>
            </div>
            <ul class="pt-feats">${this._renderFeats()}</ul>
          </div>

          <div class="pt-visual-col">
            <div class="pt-hero-visual" role="img" aria-label="${t('shell.home.visualHint')}">
              <div class="pt-holo-ring" aria-hidden="true"></div>
              <div class="pt-holo-ring2" aria-hidden="true"></div>
              <div class="pt-holo-scan" aria-hidden="true"></div>
              <canvas class="pt-canvas pt-holo" data-canvas="holo" aria-hidden="true"></canvas>
              <div class="pt-hud pt-hud--tl" aria-hidden="true"><span class="pt-hud-k">WAVE FUNCTION</span><span class="pt-hud-v"><i>ψ</i><sub>3,2,0</sub> · 3<i>d</i><sub><i>z</i>²</sub></span></div>
              <div class="pt-hud pt-hud--tr" aria-hidden="true"><span class="pt-hud-k">NODAL CONES</span><span class="pt-hud-v"><i>θ</i> = 54.74° / 125.26°</span></div>
              <div class="pt-hud pt-hud--bl" aria-hidden="true"><span class="pt-hud-k">PHASE</span><span class="pt-hud-v"><span class="pt-phase-pos">+1</span> / <span class="pt-phase-neg">−1</span></span></div>
              <div class="pt-hud pt-hud--br" aria-hidden="true"><span class="pt-hud-k">ANGULAR PART</span><span class="pt-hud-v">|<i>Y</i>| ∝ |3cos<sup>2</sup><i>θ</i> − 1|</span></div>
            </div>
          </div>
        </main>

        <section class="pt-modules" id="pt-modules">
          <div class="pt-mod-head">
            <div class="pt-mod-title">
              <span class="pt-mod-kicker">[ MODULES 01 — 03 · TEACHING ORDER ]</span>
              <h2>${t('shell.home.modulesTitle')}<span class="pt-mod-lead">${t('shell.home.modulesLead')}</span></h2>
            </div>
            <p class="pt-mod-order">${t('shell.home.modulesOrder')}</p>
          </div>
          <div class="pt-cards">${cards}</div>
        </section>

        <footer class="pt-foot">
          <div class="pt-console">
            <span class="pt-console-title">${t('shell.home.consoleLabel')}</span>
            ${this._renderSettings()}
          </div>
          <div class="pt-foot-bottom">
            <span>${t('shell.home.footer')}</span>
            <span class="pt-foot-mono">ONE HUB · THREE MODULES · SCENE-AWARE · BYOK</span>
          </div>
        </footer>
      </div>`

    return markup + STYLE
  }

  // -------------------------------------------------------------------------
  // 事件
  // -------------------------------------------------------------------------
  _bindEvents() {
    const root = this._container
    if (!root) return

    // 1) 已接入模块用 <a href>，默认导航即可；未接入的按钮点了轻晃一下
    root.querySelectorAll('[data-module].is-locked').forEach((el) => {
      const onClick = () => {
        el.classList.remove('is-nudged')
        // 强制重排，让同一次点击里连续两次也能重新触发动画
        void el.offsetWidth
        el.classList.add('is-nudged')
        setTimeout(() => el.classList.remove('is-nudged'), 520)
      }
      el.addEventListener('click', onClick)
      this._cleanup.push(() => el.removeEventListener('click', onClick))
    })

    // 2) 「开始探索」：滚到模块区；若模块区已经在视口里，就闪一下三张卡给反馈
    const explore = root.querySelector('[data-act="explore"]')
    if (explore) {
      const onClick = () => {
        const mods = root.querySelector('#pt-modules')
        if (!mods) return
        try { mods.scrollIntoView({ behavior: this._reduced ? 'auto' : 'smooth', block: 'start' }) } catch (e) { mods.scrollIntoView() }
        // "开始探索"必须有可见反馈：页面本来就一屏放得下时，滚动是个空操作。
        // 这里给三张卡各闪一下（尊重 reduced-motion：那种情况下直接跳过）。
        if (this._reduced) return
        const cards = root.querySelectorAll('.pt-card')
        cards.forEach((card) => card.classList.remove('is-flash'))
        void mods.offsetWidth
        cards.forEach((card) => card.classList.add('is-flash'))
        setTimeout(() => cards.forEach((card) => card.classList.remove('is-flash')), 2600)
      }
      explore.addEventListener('click', onClick)
      this._cleanup.push(() => explore.removeEventListener('click', onClick))
    }

    // 3) 「问智能体」：与右下角悬浮球是同一个入口（宿主注入的回调）
    const ask = root.querySelector('[data-act="ask"]')
    if (ask) {
      const onClick = () => {
        if (this._ui.onOpenAgent) {
          this._ui.onOpenAgent()
          return
        }
        // 兜底：直接点悬浮球（回调没注入时也仍然能打开面板）
        const fab = document.querySelector('.agent-fab')
        if (fab && typeof fab.click === 'function') fab.click()
      }
      ask.addEventListener('click', onClick)
      this._cleanup.push(() => ask.removeEventListener('click', onClick))
    }

    // 4) 主题 / 语言分段控件
    root.querySelectorAll('[data-set]').forEach((el) => {
      const onClick = () => {
        const kind = el.dataset.set
        const v = el.dataset.v
        if (kind === 'theme' && this._ui.onTheme) this._ui.onTheme(v)
        if (kind === 'lang' && this._ui.onLang) this._ui.onLang(v)
        // 就地更新高亮，**不整页重渲**：重渲会把用户刚点的那一下的视觉反馈冲掉
        const row = el.parentElement
        if (row) row.querySelectorAll('.pt-seg-btn').forEach((b) => b.classList.toggle('is-on', b === el))
      }
      el.addEventListener('click', onClick)
      this._cleanup.push(() => el.removeEventListener('click', onClick))
    })

    // 5) 鼠标视差（只影响画布，不影响布局；触屏没有 pointermove 也不会有问题）
    const hero = root.querySelector('.pt-hero')
    if (hero) {
      const onMove = (ev) => {
        const r = hero.getBoundingClientRect()
        if (!(r.width > 0) || !(r.height > 0)) return
        this._pointer.tx = clamp01((ev.clientX - r.left) / r.width) * 2 - 1
        this._pointer.ty = clamp01((ev.clientY - r.top) / r.height) * 2 - 1
      }
      const onLeave = () => { this._pointer.tx = 0; this._pointer.ty = 0 }
      hero.addEventListener('pointermove', onMove)
      hero.addEventListener('pointerleave', onLeave)
      this._cleanup.push(() => {
        hero.removeEventListener('pointermove', onMove)
        hero.removeEventListener('pointerleave', onLeave)
      })
    }
  }

  // -------------------------------------------------------------------------
  // 画布：初始化 / 尺寸 / 每帧绘制
  // -------------------------------------------------------------------------
  _startVisuals() {
    if (!this._container) return
    const portal = this._portal
    if (!portal) return
    this._stopped = false
    this._t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    this._palette = this._resolvePalette()

    const list = this._container.querySelectorAll('canvas[data-canvas]')
    list.forEach((cv) => {
      const ctx = cv.getContext ? cv.getContext('2d') : null
      if (!ctx) return
      const entry = { cv, ctx, kind: cv.dataset.canvas || 'bg', w: 0, h: 0, dpr: 1, visible: true }
      this._canvas.push(entry)
    })
    this._resizeAll()

    // 尺寸变化：窗口、智能体抽屉让位、卡片换行……都靠 ResizeObserver 兜住
    if (typeof ResizeObserver === 'function') {
      this._resizeObs = new ResizeObserver(() => this._resizeAll())
      this._resizeObs.observe(portal)
      this._canvas.forEach((e) => this._resizeObs.observe(e.cv))
    }
    // 视口外的画布不画（首页滚动后背景仍在视口，但卡片会离开）
    if (typeof IntersectionObserver === 'function') {
      this._intersectObs = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          const entry = this._canvas.find((e) => e.cv === en.target)
          if (entry) entry.visible = en.isIntersecting
        })
      }, { rootMargin: '80px' })
      this._canvas.forEach((e) => this._intersectObs.observe(e.cv))
    }

    // 主题变化：重新读一遍 --pt-* 令牌（颜色真源在 CSS，不在 JS）
    if (typeof MutationObserver === 'function') {
      this._themeObs = new MutationObserver(() => {
        this._palette = this._resolvePalette()
        if (this._reduced) this._drawAll(0.6)
      })
      this._themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    }

    // 降低动效偏好：只画一帧静态画面，不启动 rAF 循环
    if (typeof matchMedia === 'function') {
      this._mql = matchMedia('(prefers-reduced-motion: reduce)')
      this._reduced = !!this._mql.matches
      const onChange = () => {
        this._reduced = !!this._mql.matches
        if (this._reduced) {
          this._stopLoop()
          this._drawAll(0.8)
        } else {
          this._startLoop()
        }
      }
      if (this._mql.addEventListener) this._mql.addEventListener('change', onChange)
      else if (this._mql.addListener) this._mql.addListener(onChange)
      this._cleanup.push(() => {
        if (this._mql.removeEventListener) this._mql.removeEventListener('change', onChange)
        else if (this._mql.removeListener) this._mql.removeListener(onChange)
      })
    }

    // 页面不可见时停掉循环（省电；切回来时从当前时间继续）
    const onVis = () => {
      if (document.hidden) this._stopLoop()
      else if (this._reduced) this._drawAll(0.8)
      else this._startLoop()
    }
    document.addEventListener('visibilitychange', onVis)
    this._cleanup.push(() => document.removeEventListener('visibilitychange', onVis))

    if (this._reduced) this._drawAll(0.8)
    else this._startLoop()
  }

  _stopVisuals() {
    this._stopLoop()
    if (this._resizeObs) { try { this._resizeObs.disconnect() } catch (e) { /* ignore */ } this._resizeObs = null }
    if (this._intersectObs) { try { this._intersectObs.disconnect() } catch (e) { /* ignore */ } this._intersectObs = null }
    if (this._themeObs) { try { this._themeObs.disconnect() } catch (e) { /* ignore */ } this._themeObs = null }
    this._cleanup.forEach((fn) => { try { fn() } catch (e) { /* ignore */ } })
    this._cleanup = []
    this._canvas = []
    this._stopped = true
  }

  _startLoop() {
    if (this._stopped) return
    if (this._raf) return
    const tick = (now) => {
      this._raf = 0
      if (this._stopped) return
      const t = Math.max(0, (now - this._t0) / 1000)
      // 指针缓动：直接赋值会让视差像"跳"，逐帧逼近才像有惯性
      this._pointer.x += (this._pointer.tx - this._pointer.x) * 0.06
      this._pointer.y += (this._pointer.ty - this._pointer.y) * 0.06
      this._drawAll(t)
      this._raf = requestAnimationFrame(tick)
    }
    this._raf = requestAnimationFrame(tick)
  }

  _stopLoop() {
    if (this._raf) {
      cancelAnimationFrame(this._raf)
      this._raf = 0
    }
  }

  _resizeAll() {
    if (!this._canvas.length) return
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2)
    this._canvas.forEach((e) => {
      const rect = e.cv.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      if (w === e.w && h === e.h && dpr === e.dpr) return
      e.w = w
      e.h = h
      e.dpr = dpr
      e.cv.width = Math.max(1, Math.round(w * dpr))
      e.cv.height = Math.max(1, Math.round(h * dpr))
    })
  }

  /** 从 CSS 令牌读画布调色板（深浅两套都由 CSS 决定，JS 不抄颜色值） */
  _resolvePalette() {
    const host = this._portal
    if (!host || typeof getComputedStyle !== 'function') {
      return createPalette(() => '', { dark: true })
    }
    const cs = getComputedStyle(host)
    const dark = document.documentElement.getAttribute('data-theme') !== 'light'
    return createPalette((name) => cs.getPropertyValue(name), { dark })
  }

  _drawAll(t) {
    if (!this._palette) this._palette = this._resolvePalette()
    const pal = this._palette
    this._canvas.forEach((e) => {
      if (!e.visible || e.w < 2 || e.h < 2) return
      if (!e.ctx) return
      e.ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0)
      e.ctx.clearRect(0, 0, e.w, e.h)
      switch (e.kind) {
        case 'bg': this._drawBg(e.ctx, e, t, pal); break
        case 'holo': this._drawHolo(e.ctx, e, t, pal); break
        case 'orbit': this._drawOrbit(e.ctx, e, t, pal); break
        case 'symmetry': this._drawSymmetry(e.ctx, e, t, pal); break
        case 'crystal': this._drawCrystal(e.ctx, e, t, pal); break
        default: break
      }
    })
  }

  // -------------------------------------------------------------------------
  // 绘制：整页背景（晶格 + 尘埃 + 透视地面 + 扫描线）
  // -------------------------------------------------------------------------
  _drawBg(ctx, e, t, pal) {
    const w = e.w
    const h = e.h
    const dark = pal.dark
    const px = this._pointer.x
    const py = this._pointer.y
    ctx.save()
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'

    // ---- 远景尘埃（视差更强：转得慢、振幅小）----
    const camDust = { w, h, focal: Math.min(w, h) * 0.85, dist: 7.4 }
    const axD = -0.08 + py * 0.05
    const ayD = t * 0.03 + px * 0.06
    for (let i = 0; i < this._scenes.dust.length; i++) {
      const p = this._scenes.dust[i]
      const pr = toScreen(rotateXYZ([p.x * 1.9, p.y * 1.9, p.z * 1.9], axD, ayD), camDust)
      if (!pr) continue
      const depth = clamp01(1 - (pr.depth - (camDust.dist - 2.6)) / 3.6)
      const tw = 0.55 + 0.45 * Math.sin(t * 0.9 + p.twinkle * TAU)
      const size = p.size * (0.5 + depth * 0.9) * (dark ? 1 : 0.8)
      drawDot(ctx, pr.x, pr.y, size, rgba(pal.node, 1), (0.05 + depth * 0.22 * tw) * (dark ? 1 : 0.7))
    }

    // ---- 立方晶格：整页的"结构"底纹 ----
    const lat = this._scenes.bgLattice
    const camL = { w, h, focal: Math.min(w, h) * 1.5, dist: 8.2 }
    const axL = -0.14 + py * 0.07
    const ayL = -t * 0.045 + px * 0.09
    const scaleL = 2.05
    const pts = lat.nodes.map((n) => toScreen(
      rotateXYZ([n.x * scaleL, n.y * scaleL, n.z * scaleL], axL, ayL), camL))
    const edgeAlpha = dark ? 0.085 : 0.15
    for (let i = 0; i < lat.edges.length; i++) {
      const a = pts[lat.edges[i][0]]
      const b = pts[lat.edges[i][1]]
      if (!a || !b) continue
      const depth = clamp01(1 - ((a.depth + b.depth) / 2 - (camL.dist - 2.4)) / 4.4)
      drawLine(ctx, a.x, a.y, b.x, b.y, rgba(pal.grid, 1), 1, edgeAlpha * (0.35 + depth * 0.65))
    }
    for (let i = 0; i < pts.length; i++) {
      const pr = pts[i]
      if (!pr) continue
      const depth = clamp01(1 - (pr.depth - (camL.dist - 2.4)) / 4.4)
      const r = (1 + depth * 1.8) * (dark ? 1 : 0.9)
      drawDot(ctx, pr.x, pr.y, r * 3.4, rgba(pal.cyan, 1), (dark ? 0.05 : 0.06) * depth)
      drawDot(ctx, pr.x, pr.y, r, rgba(pal.node, 1), (dark ? 0.38 : 0.5) * depth)
    }

    // ---- 透视地面：地平线在 80% 高度，竖线汇聚到消失点 ----
    const horizon = h * 0.8
    if (h > horizon + 20) {
      const vx = w / 2 + px * w * 0.06
      const floorAlpha = dark ? 0.075 : 0.11
      for (let i = -10; i <= 10; i++) {
        const x0 = w / 2 + i * (w / 9)
        drawLine(ctx, vx + (x0 - vx) * 0.1, horizon, x0, h + 40, rgba(pal.grid, 1), 1, floorAlpha)
      }
      for (let i = 1; i <= 6; i++) {
        const y = horizon + (h - horizon) * Math.pow(i / 6, 2.3)
        drawLine(ctx, 0, y, w, y, rgba(pal.grid, 1), 1, floorAlpha * 0.85)
      }
    }

    // ---- 缓慢下移的一道扫描线（只在深色主题；浅色下会显得像脏线）----
    if (dark) {
      const sy = ((t * 0.022) % 1) * (h + 120) - 60
      const g = ctx.createLinearGradient(0, sy - 80, 0, sy + 80)
      g.addColorStop(0, rgba(pal.cyan, 0))
      g.addColorStop(0.5, rgba(pal.cyan, 0.05))
      g.addColorStop(1, rgba(pal.cyan, 0))
      ctx.fillStyle = g
      ctx.fillRect(0, sy - 80, w, 160)
    }

    ctx.restore()
  }

  // -------------------------------------------------------------------------
  // 绘制：主视觉 —— 3d_z² 轨道全息
  //
  //   画面上的每个元素都与右上角的 HUD **一一对应**（用户问"右上角的图文对应吗"）：
  //     · 点云（青/紫按相位分色） ↔ ψ3,2,0 · 3d_z²
  //     · 两个绕 ±z 的线框圆锥     ↔ 节锥 θ = 54.74° / 125.26°（3cos²θ−1 = 0）
  //     · 青/紫两种点的颜色        ↔ 相位 +1 / −1
  //     · 球坐标网格（纬线/经线）  ↔ 角度部分 |Y| ∝ |3cos²θ−1|
  //   原先的"立方八面体 + 点群 Td"是两套不相干的对象硬凑在一起，已删。
  // -------------------------------------------------------------------------
  _drawHolo(ctx, e, t, pal) {
    const w = e.w
    const h = e.h
    const cx = w / 2
    const cy = h / 2
    const R = Math.min(w, h)
    const dark = pal.dark
    const px = this._pointer.x
    const py = this._pointer.y
    ctx.save()
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'

    // ---- 1. 外刻度环（仪器感；与化学内容无关，只是"探针"的边框）----
    const tickR = R * 0.468
    const tickRot = t * 0.05
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU + tickRot
      const major = i % 6 === 0
      const r1 = tickR + (major ? R * 0.02 : R * 0.01)
      drawLine(ctx,
        cx + Math.cos(a) * tickR, cy + Math.sin(a) * tickR,
        cx + Math.cos(a) * r1, cy + Math.sin(a) * r1,
        rgba(pal.dim, 1), 1, major ? (dark ? 0.42 : 0.5) : (dark ? 0.15 : 0.22))
    }

    // ---- 2. 相机：弱透视 + 慢速旋转（鼠标轻微视差）----
    // ★ 画面里所有 3D 元素（球坐标网格 / 节锥 / 坐标轴 / 电子云）必须共用同一组
    //   ax、ay —— 用户第 2 条要的是"图文对应"：如果点云的 z 瓣和节锥的 z 轴在屏幕上
    //   指向不同方向，那 HUD 就是在说谎。缩放 0.8 是给四角 HUD 留出安全区（原尺寸会压到字）。
    const cam = { w, h, focal: R * 1.76, dist: 5.0 }
    const ax = -0.5 + py * 0.12
    const ay = 0.22 + t * 0.12 + px * 0.2
    const P = (p) => toScreen(rotateXYZ(p, ax, ay), cam)

    // ---- 3. 球坐标网格：纬线（θ 固定）+ 经线（φ 固定）----
    const strokePolyline = (pts, color, alpha, width) => {
      ctx.beginPath()
      let started = false
      for (let i = 0; i < pts.length; i++) {
        const pr = pts[i]
        if (!pr) { started = false; continue }
        if (!started) { ctx.moveTo(pr.x, pr.y); started = true } else ctx.lineTo(pr.x, pr.y)
      }
      ctx.strokeStyle = color
      ctx.lineWidth = width || 1
      ctx.globalAlpha = alpha
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    const cage = this._scenes.cage
    for (let i = 0; i < cage.latitudes.length; i++) {
      // θ = 54.74° / 125.26° 两条纬线同时是**节锥与球面的交线**，用节点色强调
      const isNodal = i === 1 || i === 3
      strokePolyline(cage.latitudes[i].map(P),
        rgba(isNodal ? pal.amber : pal.dim, 1),
        isNodal ? (dark ? 0.4 : 0.46) : (dark ? 0.12 : 0.18), 1)
    }
    for (let i = 0; i < cage.meridians.length; i++) {
      strokePolyline(cage.meridians[i].map(P), rgba(pal.dim, 1), dark ? 0.1 : 0.16, 1)
    }

    // ---- 4. 节锥（3cos²θ−1 = 0 的两个解）：半透明锥面 + 底圆 + 母线 ----
    const cones = this._scenes.cones
    const origin = P([0, 0, 0])
    for (let ci = 0; ci < cones.cones.length; ci++) {
      const cone = cones.cones[ci]
      const rim = cone.circle.map(P)
      // 锥面：从顶点沿底圆的三角扇 —— 只描线框的话读起来像两个"圆环"，
      // 填一层低透明度后才看得出是"两个圆锥面"（这正是 HUD 上写的 NODAL CONES）
      if (origin && rim.length > 1) {
        ctx.beginPath()
        ctx.moveTo(origin.x, origin.y)
        for (let i = 0; i < rim.length; i++) {
          if (rim[i]) ctx.lineTo(rim[i].x, rim[i].y)
        }
        ctx.closePath()
        ctx.fillStyle = rgba(pal.amber, 1)
        ctx.globalAlpha = dark ? 0.05 : 0.07
        ctx.fill()
        ctx.globalAlpha = 1
      }
      strokePolyline(rim, rgba(pal.amber, 1), dark ? 0.52 : 0.58, 1)
      if (origin) {
        for (let i = 0; i < cone.lines.length; i++) {
          const tip = P(cone.lines[i][1])
          if (!tip) continue
          drawLine(ctx, origin.x, origin.y, tip.x, tip.y, rgba(pal.amber, 1), 1, dark ? 0.2 : 0.26)
        }
      }
    }

    // ---- 5. 坐标轴 + 轴标（斜体 x / y / z，正体是错的：变量必须斜体）----
    const axisLen = 1.14
    ctx.font = 'italic ' + Math.max(11, Math.round(R * 0.05)) + 'px "Times New Roman", "Cambria Math", serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const axes = [{ d: [1, 0, 0], label: 'x' }, { d: [0, 1, 0], label: 'y' }, { d: [0, 0, 1], label: 'z' }]
    for (let i = 0; i < axes.length; i++) {
      const d = axes[i].d
      const a = P([-d[0] * axisLen, -d[1] * axisLen, -d[2] * axisLen])
      const b = P([d[0] * axisLen, d[1] * axisLen, d[2] * axisLen])
      const tip = P([d[0] * (axisLen + 0.1), d[1] * (axisLen + 0.1), d[2] * (axisLen + 0.1)])
      if (a && b) drawLine(ctx, a.x, a.y, b.x, b.y, rgba(pal.dim, 1), 1, dark ? 0.26 : 0.3)
      if (tip) {
        ctx.globalAlpha = dark ? 0.85 : 0.9
        ctx.fillStyle = rgba(pal.dim, 1)
        ctx.fillText(axes[i].label, tip.x, tip.y)
        ctx.globalAlpha = 1
      }
    }

    // ---- 6. 3d_z² 电子云：两个沿 z 的大瓣 + 赤道负相位圈（相位决定颜色）----
    // ★ 与网格/节锥/坐标轴共用同一组 ax、ay（同一个坐标系），否则两个"z 方向"会在
    //   屏幕上打架 —— 那正是用户第 2 条问的"图文对应吗"。
    const cloud = this._scenes.holoCloud
    const sc = R * 0.4
    for (let i = 0; i < cloud.points.length; i++) {
      const p = cloud.points[i]
      const q = rotateXYZ([p.x, p.y, p.z], ax, ay)
      const depth = (q[2] + 1) / 2                     // 0 = 远，1 = 近
      const col = p.phase > 0 ? pal.cyan : pal.violet
      const size = R * (0.0022 + 0.0048 * depth) * (dark ? 1 : 1.45)
      drawDot(ctx, cx + q[0] * sc, cy - q[1] * sc, size, rgba(col, 1),
        (dark ? 0.3 : 0.42) + depth * (dark ? 0.58 : 0.48))
    }

    // ---- 7. 原子核：脉动光晕 + 白核 ----
    const pulse = 1 + 0.07 * Math.sin(t * 2.1)
    drawGlow(ctx, cx, cy, R * 0.17 * pulse, pal.cyan, dark ? 0.5 : 0.42)
    drawGlow(ctx, cx, cy, R * 0.09 * pulse, pal.violet, dark ? 0.35 : 0.4)
    drawGlow(ctx, cx, cy, R * 0.06 * pulse, pal.node, dark ? 0.6 : 0.5)
    drawDot(ctx, cx, cy, R * 0.014 * pulse, dark ? '#ffffff' : pal.ink, 0.95)

    ctx.restore()
  }

  // -------------------------------------------------------------------------
  // 绘制：模块卡 · 轨道（3d_z² 电子云）
  // -------------------------------------------------------------------------
  _drawOrbit(ctx, e, t, pal) {
    const w = e.w
    const h = e.h
    const cx = w / 2
    const cy = h / 2
    const m = Math.min(w, h)
    const dark = pal.dark
    const px = this._pointer.x
    const py = this._pointer.y
    ctx.save()
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'

    // 三根坐标轴（很淡，给点云一个空间参照）
    const cam = { w, h, focal: m * 1.15, dist: 3.6 }
    const ax = -0.5 + py * 0.12
    const ay = t * 0.5 + px * 0.15 + 0.4
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    for (let i = 0; i < axes.length; i++) {
      const dir = axes[i]
      const a = toScreen(rotateXYZ([dir[0] * 1.35, dir[1] * 1.35, dir[2] * 1.35], ax, ay), cam)
      const b = toScreen(rotateXYZ([-dir[0] * 1.35, -dir[1] * 1.35, -dir[2] * 1.35], ax, ay), cam)
      if (!a || !b) continue
      drawLine(ctx, a.x, a.y, b.x, b.y, rgba(pal.dim, 1), 1, dark ? 0.16 : 0.14)
    }

    const cloud = this._scenes.orbitCloud
    const axO = -0.45 + py * 0.16
    const ayO = t * 0.58 + px * 0.2 + 0.2
    const sc = m * 0.38
    for (let i = 0; i < cloud.points.length; i++) {
      const p = cloud.points[i]
      const q = rotateXYZ([p.x, p.y, p.z], axO, ayO)
      const depth = (q[2] + 1) / 2
      const col = p.phase > 0 ? pal.cyan : pal.violet
      drawDot(ctx, cx + q[0] * sc, cy - q[1] * sc, (0.9 + 1.5 * depth) * (m / (dark ? 130 : 105)),
        rgba(col, 1), (dark ? 0.26 : 0.4) + depth * (dark ? 0.6 : 0.5))
    }

    // 中心核
    drawGlow(ctx, cx, cy, m * 0.1, pal.cyan, dark ? 0.42 : 0.5)
    drawDot(ctx, cx, cy, m * 0.009, dark ? '#ffffff' : pal.ink, 0.92)
    ctx.restore()
  }

  // -------------------------------------------------------------------------
  // 绘制：模块卡 · 点群（甲烷 Td + C₃ 轴）
  // -------------------------------------------------------------------------
  _drawSymmetry(ctx, e, t, pal) {
    const w = e.w
    const h = e.h
    const cx = w / 2
    const cy = h / 2
    const m = Math.min(w, h)
    const dark = pal.dark
    const px = this._pointer.x
    const py = this._pointer.y
    ctx.save()
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'

    const mol = this._scenes.methane
    const cam = { w, h, focal: m * 1.3, dist: 3.4 }
    const ax = -0.4 + py * 0.12
    const ay = t * 0.42 + px * 0.16 + 0.5
    const rot = (p) => rotateXYZ([p[0], p[1], p[2]], ax, ay)
    const atomPts = mol.atoms.map((a) => toScreen(rot([a.x, a.y, a.z]), cam))

    // C₃ 轴：沿 C→H 方向延长，虚线（甲烷的 4 根 C₃ 轴正是 4 根 C-H 键所在直线）
    for (let i = 0; i < mol.axes.length; i++) {
      const d = mol.axes[i].dir
      const a = toScreen(rot([d[0] * 1.5, d[1] * 1.5, d[2] * 1.5]), cam)
      const b = toScreen(rot([-d[0] * 1.5, -d[1] * 1.5, -d[2] * 1.5]), cam)
      if (!a || !b) continue
      ctx.save()
      ctx.setLineDash([3, 4])
      drawLine(ctx, a.x, a.y, b.x, b.y, rgba(pal.violet, 1), 1, dark ? 0.4 : 0.4)
      ctx.restore()
    }

    // 四面体的 H–H 棱（很淡，帮学生"看见"四面体）
    for (let i = 0; i < mol.hEdges.length; i++) {
      const a = atomPts[mol.hEdges[i][0]]
      const b = atomPts[mol.hEdges[i][1]]
      if (!a || !b) continue
      drawLine(ctx, a.x, a.y, b.x, b.y, rgba(pal.violet, 1), 1, dark ? 0.13 : 0.15)
    }

    // C–H 键
    for (let i = 0; i < mol.bonds.length; i++) {
      const a = atomPts[mol.bonds[i][0]]
      const b = atomPts[mol.bonds[i][1]]
      if (!a || !b) continue
      drawLine(ctx, a.x, a.y, b.x, b.y, rgba(pal.node, 1), Math.max(1.2, m * 0.014), dark ? 0.5 : 0.55)
    }

    // 原子球：H 小（紫），C 大（冷白）；近处亮
    for (let i = 0; i < mol.atoms.length; i++) {
      const pr = atomPts[i]
      if (!pr) continue
      const isC = mol.atoms[i].el === 'C'
      const depth = clamp01(1 - (pr.depth - (cam.dist - 1)) / 2.1)
      const base = isC ? m * 0.055 : m * 0.036
      const r = base * (0.75 + depth * 0.45)
      const col = isC ? pal.node : pal.violet
      drawGlow(ctx, pr.x, pr.y, r * 2.4, col, (dark ? 0.35 : 0.34) * (0.45 + depth * 0.55))
      drawDot(ctx, pr.x, pr.y, r, rgba(col, 1), 0.88)
      drawDot(ctx, pr.x - r * 0.25, pr.y - r * 0.25, r * 0.35, dark ? '#ffffff' : pal.ink, 0.82)
    }
    ctx.restore()
  }

  // -------------------------------------------------------------------------
  // 绘制：模块卡 · 晶体（NaCl 晶胞 —— 教材式斜投影球棍图）
  //
  //   2026-10-17 用户贴了一张教材里的 NaCl 晶胞图：「最好做成这种视图，化学家喜欢用这种视图」。
  //   那种图的画法要点（也是本函数的四条约定）：
  //     · **斜投影（正交）**：正面不变形、平行线永远平行 —— 不是透视投影；
  //     · 深度轴朝右上约 38°、长度缩短一半（cabinet projection）；
  //     · 球是**带轮廓的圆**：Cl⁻ 大而浅、Na⁺ 小而深（教材惯例，与离子半径一致）；
  //     · 键是细直线；键与球放在同一张表里按深度排序（远的先画，画家算法）。
  //   不再做任何旋转动画：教材插图的价值在于"永远是一个正面的晶胞"。
  // -------------------------------------------------------------------------
  _drawCrystal(ctx, e, t, pal) {
    const w = e.w
    const h = e.h
    const cx = w / 2
    const cy = h / 2
    const m = Math.min(w, h)
    const dark = pal.dark
    const lat = this._scenes.lattice

    // 斜投影参数：与屏幕水平方向 38°、深度缩短一半（教材插图的常用比例）
    const scale = m * 0.5
    const opts = { cx, cy, scale, alpha: 0.6632251, depth: 0.5 }
    const screen = (p) => projectOblique(p, opts)

    // 教材配色：浅色球 = Cl⁻；深色球 = Na⁺。轮廓色随主题取反，保证两种底色上都清楚。
    const fillCl = dark ? rgba(pal.node, 1) : 'rgba(255,255,255,1)'
    const fillNa = dark ? rgba(pal.bg, 1) : rgba(pal.ink, 1)
    const lineCl = dark ? rgba(pal.bg, 0.95) : 'rgba(28,38,52,0.92)'
    const lineNa = dark ? rgba(pal.node, 0.82) : rgba(pal.ink, 0.95)
    const bondColor = dark ? rgba(pal.node, 0.4) : 'rgba(28,38,52,0.6)'
    const hilite = 'rgba(255,255,255,0.85)'
    // 离子半径：Cl⁻ 明显大于 Na⁺（正交/斜投影下，球的大小与深度无关）
    const rCl = scale * 0.08
    const rNa = scale * 0.052

    // 画家算法：键与球放进同一张表，按 z 从远到近画（+z = 远离观察者，朝右上）
    const items = []
    for (let i = 0; i < lat.edges.length; i++) {
      const a = lat.nodes[lat.edges[i][0]]
      const b = lat.nodes[lat.edges[i][1]]
      items.push({ kind: 'bond', z: (a.z + b.z) / 2, a, b })
    }
    for (let i = 0; i < lat.nodes.length; i++) {
      items.push({ kind: 'atom', z: lat.nodes[i].z, node: lat.nodes[i] })
    }
    items.sort((p, q) => q.z - p.z)

    for (let k = 0; k < items.length; k++) {
      const it = items[k]
      if (it.kind === 'bond') {
        const a = screen([it.a.x, it.a.y, it.a.z])
        const b = screen([it.b.x, it.b.y, it.b.z])
        drawLine(ctx, a.x, a.y, b.x, b.y, bondColor, 1, dark ? 0.8 : 0.95)
        continue
      }
      const isCl = it.node.kind === 0
      const pr = screen([it.node.x, it.node.y, it.node.z])
      const r = isCl ? rCl : rNa
      // 球面用径向渐变做一点体积感（教材插图里的球都是"有明暗的圆"，不是纯色圆）
      const grad = ctx.createRadialGradient(
        pr.x - r * 0.34, pr.y - r * 0.34, Math.max(0.5, r * 0.12),
        pr.x, pr.y, r)
      if (isCl) {
        grad.addColorStop(0, 'rgba(255,255,255,1)')
        grad.addColorStop(1, dark ? 'rgba(186,206,232,1)' : 'rgba(226,234,244,1)')
      } else {
        grad.addColorStop(0, dark ? rgba(pal.node, 0.26) : 'rgba(72,88,112,1)')
        grad.addColorStop(1, dark ? rgba(pal.bg, 1) : rgba(pal.ink, 1))
      }
      ctx.beginPath()
      ctx.arc(pr.x, pr.y, r, 0, TAU)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = isCl ? lineCl : lineNa
      ctx.lineWidth = Math.max(1, r * 0.22)
      ctx.stroke()
      if (isCl && !dark) {
        // 浅色主题的白色球面上，高光改用一道淡弧（白球 + 白高光等于没有）
        ctx.beginPath()
        ctx.arc(pr.x, pr.y, r * 0.7, Math.PI * 1.08, Math.PI * 1.6)
        ctx.strokeStyle = 'rgba(28,38,52,0.2)'
        ctx.lineWidth = Math.max(1, r * 0.1)
        ctx.stroke()
      }
      drawDot(ctx, pr.x - r * 0.32, pr.y - r * 0.32, r * 0.26, hilite, 0.85)
    }

    // 图例：教材左下角那两行"大球 Cl / 小球 Na"在小卡片里也不能省
    const lx = Math.max(8, w * 0.025)
    const ly = Math.max(12, h * 0.22)
    const lr = Math.max(2.6, rNa * 1.2)
    ctx.font = '9px "Cascadia Mono", Consolas, "Microsoft YaHei", monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = dark ? 0.78 : 0.82
    ctx.beginPath()
    ctx.arc(lx + lr, ly, lr, 0, TAU)
    ctx.fillStyle = fillCl
    ctx.fill()
    ctx.strokeStyle = lineCl
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = rgba(pal.dim, 1)
    ctx.fillText('Cl⁻', lx + lr * 2 + 5, ly)
    ctx.beginPath()
    ctx.arc(lx + lr, ly + 15, lr * 0.72, 0, TAU)
    ctx.fillStyle = fillNa
    ctx.fill()
    ctx.strokeStyle = lineNa
    ctx.stroke()
    ctx.fillStyle = rgba(pal.dim, 1)
    ctx.fillText('Na⁺', lx + lr * 2 + 5, ly + 15)
    ctx.globalAlpha = 1
    ctx.textAlign = 'start'
    ctx.textBaseline = 'alphabetic'
  }
}

// ---------------------------------------------------------------------------
// 样式（静态模板串；里面只有一处 ${MONO} 字体栈插值，不含反引号 —— 见文件头）
// ---------------------------------------------------------------------------
const STYLE = `
<style>
/* ===========================================================================
 * 首页样式 —— 结构探针 / 全息仪表
 *
 * ★ 颜色只在这里定义（作为 --pt-* 变量）。canvas 通过 getComputedStyle 读同一批
 *   变量 —— 页面与画布共用一份调色板，切主题时不会出现"页面变了、画布没变"。
 * ★ 字体：正文仍用 ui-kit 的 --font-ui（Times 优先，与全站一致）；只有 HUD/
 *   编号/英文小标签用等宽栈 —— 那是"仪器读数"的视觉语言，不是正文。
 * ★ 模板串内不许写反引号（本仓库已因此白屏七次）。
 * =========================================================================== */

.portal {
  /* ---- 画布调色板（深色 / 默认） ---- */
  --pt-cyan: #5ad8ff;
  --pt-violet: #a78bfa;
  --pt-emerald: #3fe0a4;
  --pt-amber: #ffc46b;
  --pt-node: #d6e9ff;
  --pt-grid: #2c5488;
  --pt-ink: #eaf2ff;
  --pt-dim: #8fa6c8;
  --pt-accent: #5ad8ff;
  --pt-glow-a: rgba(90, 216, 255, .17);
  --pt-glow-b: rgba(167, 139, 250, .13);
  --pt-bg: #050a15;
  --pt-card: rgba(12, 20, 38, .62);
  --pt-line: rgba(120, 170, 255, .16);
  --pt-line-strong: rgba(120, 190, 255, .34);
  --pt-soft: rgba(90, 216, 255, .1);
  --pt-title-a: #ffffff;
  --pt-title-b: #7fe4ff;
  --pt-title-c: #b9a6ff;
  --pt-btn-ink: #04101f;
  --pt-noise-opacity: .07;
  --pt-mono: ${MONO};

  position: relative;
  isolation: isolate;
  min-height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 20px clamp(20px, 3.6vw, 56px) 18px;
  /* ★ 只裁装饰层的溢出，**不能**让 .portal 成为滚动容器：
     overflow: hidden 的元素算"可滚动容器"，scrollIntoView 会把滚动落在它身上而不是文档上
     —— 表现就是"点开始探索会滚，但滚不回来、也没有页面滚动条"（用户报的第 3 条）。
     overflow: clip 只裁切、不创建滚动容器；hidden 作为旧浏览器的兜底。 */
  overflow: hidden;
  overflow: clip;
  color: var(--pt-ink);
  background:
    radial-gradient(120% 90% at 50% -10%, #0b1730 0%, transparent 60%),
    linear-gradient(180deg, var(--pt-bg) 0%, #060c1a 55%, #040812 100%);
}

[data-theme="light"] .portal {
  /* ---- 画布调色板（浅色 = 蓝图 / 实验室纸面） ---- */
  --pt-cyan: #0b74c4;
  --pt-violet: #6b4fd8;
  --pt-emerald: #0e9d6b;
  --pt-amber: #b26a00;
  --pt-node: #1d4f91;
  --pt-grid: #7d9cc4;
  --pt-ink: #0f1c33;
  --pt-dim: #4a5d7d;
  --pt-accent: #0b74c4;
  --pt-glow-a: rgba(11, 116, 196, .1);
  --pt-glow-b: rgba(107, 79, 216, .08);
  --pt-bg: #eef3fa;
  --pt-card: rgba(255, 255, 255, .72);
  --pt-line: rgba(20, 60, 120, .16);
  --pt-line-strong: rgba(20, 60, 120, .34);
  --pt-soft: rgba(11, 116, 196, .08);
  --pt-title-a: #0a1730;
  --pt-title-b: #0b74c4;
  --pt-title-c: #6b4fd8;
  --pt-btn-ink: #ffffff;
  --pt-noise-opacity: .05;
  background:
    radial-gradient(120% 90% at 50% -10%, #ffffff 0%, transparent 62%),
    linear-gradient(180deg, var(--pt-bg) 0%, #e9f0f9 55%, #e3ebf6 100%);
}

/* ---------- 背景层 ---------- */
.pt-canvas { display: block; width: 100%; height: 100%; }
.pt-canvas--bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }

.pt-aurora {
  position: absolute;
  z-index: 0;
  pointer-events: none;
  width: 60vw;
  height: 60vw;
  max-width: 900px;
  max-height: 900px;
  border-radius: 50%;
}
.pt-aurora--a {
  top: -22vw; right: -12vw;
  background: radial-gradient(closest-side, var(--pt-glow-a), transparent 72%);
  animation: pt-drift-a 26s ease-in-out infinite alternate;
}
.pt-aurora--b {
  bottom: -30vw; left: -18vw;
  background: radial-gradient(closest-side, var(--pt-glow-b), transparent 72%);
  animation: pt-drift-b 34s ease-in-out infinite alternate;
}
@keyframes pt-drift-a {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(-3vw, 2vw, 0) scale(1.08); }
}
@keyframes pt-drift-b {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(3vw, -2vw, 0) scale(1.06); }
}

/* 细网格：给"蓝图/坐标纸"的底子；用径向遮罩让边缘淡出 */
.pt-grid-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    linear-gradient(to right, var(--pt-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--pt-line) 1px, transparent 1px);
  background-size: 72px 72px;
  opacity: .5;
  -webkit-mask-image: radial-gradient(120% 90% at 50% 20%, #000 0%, transparent 78%);
  mask-image: radial-gradient(120% 90% at 50% 20%, #000 0%, transparent 78%);
}

.pt-scanlines {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: repeating-linear-gradient(to bottom, rgba(255, 255, 255, .035) 0 1px, transparent 1px 3px);
  opacity: .35;
}
[data-theme="light"] .pt-scanlines {
  background: repeating-linear-gradient(to bottom, rgba(10, 30, 60, .04) 0 1px, transparent 1px 3px);
  opacity: .4;
}

.pt-noise {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: var(--pt-noise-opacity);
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.pt-vignette {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(0, 0, 0, .38) 100%);
}
[data-theme="light"] .pt-vignette {
  background: radial-gradient(120% 100% at 50% 40%, transparent 58%, rgba(30, 60, 110, .1) 100%);
}

/* ---------- 顶栏 ---------- */
.pt-top {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--pt-line);
  animation: pt-rise .7s cubic-bezier(.2, .7, .2, 1) both;
}
.pt-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.pt-logo {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  color: var(--pt-cyan);
  border: 1px solid var(--pt-line-strong);
  border-radius: 10px;
  background: var(--pt-soft);
  box-shadow: 0 0 24px rgba(90, 216, 255, .14) inset;
}
.pt-logo svg { width: 24px; height: 24px; }
.pt-brand-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pt-brand-name { font-size: 15.5px; font-weight: 600; letter-spacing: .18em; white-space: nowrap; }
.pt-brand-en {
  font-family: var(--pt-mono);
  font-size: 8.5px;
  letter-spacing: .26em;
  color: var(--pt-dim);
  white-space: nowrap;
}
.pt-top-meta { display: flex; align-items: center; gap: 16px; flex: 0 0 auto; }
.pt-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--pt-mono);
  font-size: 10.5px;
  letter-spacing: .14em;
  color: var(--pt-dim);
  padding: 5px 10px;
  border: 1px solid var(--pt-line);
  border-radius: 999px;
  background: var(--pt-soft);
}
.pt-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--pt-emerald);
  box-shadow: 0 0 0 3px rgba(63, 224, 164, .16);
  animation: pt-pulse 2.2s ease-in-out infinite;
}
.pt-ver {
  font-family: var(--pt-mono);
  font-size: 10px;
  letter-spacing: .18em;
  color: var(--pt-dim);
  opacity: .8;
}
@keyframes pt-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 3px rgba(63, 224, 164, .16); }
  50% { opacity: .55; box-shadow: 0 0 0 6px rgba(63, 224, 164, .05); }
}

/* ---------- Hero ---------- */
.pt-hero {
  position: relative;
  z-index: 2;
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.04fr) minmax(0, .96fr);
  gap: clamp(20px, 3.2vw, 52px);
  align-items: center;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: clamp(10px, 1.8vh, 26px) 0 clamp(6px, 1.4vh, 18px);
}
.pt-hero-copy { min-width: 0; }
.pt-kicker {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 16px;
  font-family: var(--pt-mono);
  font-size: 10px;
  letter-spacing: .3em;
  color: var(--pt-cyan);
  animation: pt-rise .6s .05s cubic-bezier(.2, .7, .2, 1) both;
}
.pt-kicker-rule {
  display: inline-block;
  width: 34px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--pt-cyan));
  flex: 0 0 auto;
}
.pt-title {
  margin: 0;
  font-size: clamp(40px, 4.9vw, 74px);
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: .05em;
  animation: pt-rise .75s .12s cubic-bezier(.2, .7, .2, 1) both;
}
.pt-title-line { display: block; }
.pt-title-line--accent {
  background: linear-gradient(100deg, var(--pt-title-a) 0%, var(--pt-title-b) 46%, var(--pt-title-c) 100%);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 26px rgba(90, 216, 255, .25));
  animation: pt-sheen 9s ease-in-out infinite;
}
[data-theme="light"] .pt-title-line--accent {
  filter: drop-shadow(0 2px 18px rgba(11, 116, 196, .18));
}
@keyframes pt-sheen {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
.pt-title-en {
  display: block;
  margin-top: 12px;
  font-family: var(--pt-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: .58em;
  color: var(--pt-dim);
  text-transform: uppercase;
}
.pt-slogan {
  margin: 18px 0 0;
  font-size: clamp(15px, 1.35vw, 18px);
  letter-spacing: .08em;
  color: var(--pt-ink);
  animation: pt-rise .7s .2s cubic-bezier(.2, .7, .2, 1) both;
}
.pt-desc {
  margin: 10px 0 0;
  max-width: 42em;
  font-size: 13px;
  line-height: 1.85;
  color: var(--pt-dim);
  animation: pt-rise .7s .26s cubic-bezier(.2, .7, .2, 1) both;
}
.pt-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
  animation: pt-rise .7s .32s cubic-bezier(.2, .7, .2, 1) both;
}
.pt-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  height: 46px;
  padding: 0 22px;
  border-radius: 10px;
  border: 1px solid transparent;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: .12em;
  cursor: pointer;
  transition: transform .2s ease, box-shadow .25s ease, border-color .2s ease, background .2s ease;
}
.pt-btn:focus-visible { outline: 2px solid var(--pt-cyan); outline-offset: 3px; }
.pt-btn--primary {
  color: var(--pt-btn-ink);
  background: linear-gradient(115deg, var(--pt-cyan) 0%, #8fe6ff 45%, var(--pt-violet) 100%);
  box-shadow: 0 12px 34px rgba(90, 216, 255, .28), 0 1px 0 rgba(255, 255, 255, .5) inset;
}
.pt-btn--primary:hover { transform: translateY(-2px); box-shadow: 0 18px 40px rgba(90, 216, 255, .36), 0 1px 0 rgba(255, 255, 255, .5) inset; }
.pt-btn--primary:active { transform: translateY(0); }
.pt-btn-arrow { font-size: 16px; line-height: 1; transition: transform .2s ease; }
.pt-btn--primary:hover .pt-btn-arrow { transform: translateX(4px); }
.pt-btn--ghost {
  color: var(--pt-ink);
  background: var(--pt-soft);
  border-color: var(--pt-line-strong);
}
.pt-btn--ghost:hover { border-color: var(--pt-cyan); background: rgba(90, 216, 255, .16); transform: translateY(-2px); }
.pt-btn-pulse {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--pt-cyan);
  box-shadow: 0 0 0 0 rgba(90, 216, 255, .5);
  animation: pt-pulse-btn 2.4s ease-out infinite;
}
@keyframes pt-pulse-btn {
  0% { box-shadow: 0 0 0 0 rgba(90, 216, 255, .45); }
  70% { box-shadow: 0 0 0 8px rgba(90, 216, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(90, 216, 255, 0); }
}
.pt-feats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
  animation: pt-rise .7s .4s cubic-bezier(.2, .7, .2, 1) both;
}
.pt-feat {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px;
  border: 1px solid var(--pt-line);
  border-radius: 999px;
  background: var(--pt-soft);
  font-size: 11.5px;
  letter-spacing: .08em;
  color: var(--pt-dim);
}
.pt-feat i {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--pt-cyan);
  flex: 0 0 auto;
}
.pt-feat--scene i { background: var(--pt-cyan); }
.pt-feat--visual i { background: var(--pt-violet); }
.pt-feat--deterministic i { background: var(--pt-emerald); }
.pt-feat--modular i { background: var(--pt-amber); }

/* ---------- 主视觉（全息） ---------- */
/* 主视觉与说明条合成一列：说明条在画布**下面**按文档流排（不绝对定位），
   这样无论画布缩到多小都不会压到 HUD 或环上 —— 绝对定位的说明条在 720p
   笔记本与平板上都会与左右 HUD 叠字（实测过两轮） */
.pt-visual-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  justify-self: center;
  width: 100%;
  min-width: 0;
  animation: pt-fade 1.1s .15s cubic-bezier(.2, .7, .2, 1) both;
}
.pt-hero-visual {
  position: relative;
  width: 100%;
  max-width: min(46vh, 500px);
  aspect-ratio: 1 / 1;
}
.pt-holo { position: absolute; inset: 5%; z-index: 2; }
.pt-holo-ring {
  position: absolute;
  inset: 4%;
  z-index: 1;
  border-radius: 50%;
  border: 1px solid var(--pt-line);
  box-shadow: 0 0 60px rgba(90, 216, 255, .06) inset, 0 0 34px rgba(90, 216, 255, .05);
}
.pt-holo-ring::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, transparent 0 68%, var(--pt-cyan) 78%, transparent 88%);
  -webkit-mask-image: radial-gradient(closest-side, transparent calc(100% - 2px), #000 calc(100% - 1px));
  mask-image: radial-gradient(closest-side, transparent calc(100% - 2px), #000 calc(100% - 1px));
  animation: pt-spin 18s linear infinite;
  opacity: .55;
}
.pt-holo-ring2 {
  position: absolute;
  inset: 9.5%;
  z-index: 1;
  border-radius: 50%;
  border: 1px dashed var(--pt-line-strong);
  opacity: .5;
  animation: pt-spin-rev 46s linear infinite;
}
.pt-holo-scan {
  position: absolute;
  left: 6%;
  right: 6%;
  top: 6%;
  bottom: 6%;
  z-index: 3;
  pointer-events: none;
  overflow: hidden;
  border-radius: 50%;
}
.pt-holo-scan::before {
  content: '';
  position: absolute;
  left: 0; right: 0;
  height: 22%;
  background: linear-gradient(180deg, transparent, rgba(90, 216, 255, .07), transparent);
  animation: pt-holo-scan 6.5s linear infinite;
}
@keyframes pt-spin { to { transform: rotate(360deg); } }
@keyframes pt-spin-rev { to { transform: rotate(-360deg); } }
@keyframes pt-holo-scan {
  from { transform: translateY(-30%); }
  to { transform: translateY(480%); }
}
.pt-hud {
  position: absolute;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-family: var(--pt-mono);
  pointer-events: none;
}
.pt-hud-k { font-size: 8.5px; letter-spacing: .22em; color: var(--pt-dim); opacity: .75; }
.pt-hud-v {
  font-size: 12.5px;
  letter-spacing: .02em;
  color: var(--pt-ink);
  white-space: nowrap;
  /* 画布里的刻度环/网格可能从字后面穿过：给读数一圈与页面底色同色的浅描边，
     保证任何角度下都清楚（不能靠"把线画淡"——那是拿专业性换干净）。 */
  text-shadow: 0 0 6px var(--pt-bg), 0 0 2px var(--pt-bg);
}
/**
 * ★ 科学排版：变量用斜体衬线、数字/函数名/单位正体、上下标独立字号。
 *   用户第 5 条："2pz 的 z 不是下标，且没有斜体。检查首页，字母是否符合规范"。
 *   规则（IUPAC / ISO 80000-2 的通行写法）：
 *     · 物理量、量子数、轨道字母（p、d、ψ、θ、φ、x、y、z、Y）→ 斜体；
 *     · 数字、函数名（cos）、单位（Å）、点群符号（T 是斜体 Schoenflies 符号）、
 *       空间群（Fm3̄m 是正体 Hermann–Mauguin 符号）→ 正体；
 *     · 下标是变量时斜体（z），是数字时正体（3,2,0）。
 *   HUD/编号本身用等宽字，公式片段改用 --font-symbol（Times 优先），两者混排才像仪器读数 + 公式。
 */
.pt-hud-v i, .pt-card-demo i {
  font-family: var(--font-symbol, "Times New Roman", "Cambria Math", serif);
  font-style: italic;
  font-weight: 400;
  letter-spacing: 0;
}
.pt-hud-v sub, .pt-hud-v sup, .pt-card-demo sub, .pt-card-demo sup {
  font-size: .72em;
  line-height: 0;
  letter-spacing: 0;
}
.pt-hud-v sub i, .pt-hud-v sup i, .pt-card-demo sub i { font-family: var(--font-symbol, "Times New Roman", serif); }
.pt-phase-pos { color: var(--pt-cyan); }
.pt-phase-neg { color: var(--pt-violet); }
/* Hermann–Mauguin 的 3̄：用 overline 画横杠（组合字符在等宽字体里常被吞掉） */
.pt-bar { text-decoration: overline; text-decoration-thickness: 1px; }
.pt-hud--tl { top: 3%; left: 1%; }
.pt-hud--tr { top: 3%; right: 1%; text-align: right; align-items: flex-end; }
.pt-hud--bl { bottom: 3%; left: 1%; }
.pt-hud--br { bottom: 3%; right: 1%; text-align: right; align-items: flex-end; }

/* ---------- 模块区 ---------- */
.pt-modules {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: clamp(6px, 1.2vh, 14px) 0 0;
}
.pt-mod-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  animation: pt-rise .7s .3s cubic-bezier(.2, .7, .2, 1) both;
}
.pt-mod-kicker {
  font-family: var(--pt-mono);
  font-size: 9.5px;
  letter-spacing: .28em;
  color: var(--pt-dim);
}
.pt-mod-title h2 {
  margin: 7px 0 0;
  font-size: clamp(19px, 1.9vw, 26px);
  font-weight: 700;
  letter-spacing: .1em;
}
.pt-mod-lead {
  margin-left: 16px;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: .05em;
  color: var(--pt-dim);
}
.pt-mod-order {
  margin: 0 0 2px;
  max-width: 34em;
  text-align: right;
  font-size: 11.5px;
  letter-spacing: .06em;
  color: var(--pt-dim);
}
.pt-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 14px;
}
.pt-card {
  --pt-card-accent: var(--pt-cyan);
  --pt-card-line: rgba(90, 216, 255, .55);
  position: relative;
  display: grid;
  grid-template-rows: auto 116px auto auto;
  gap: 0;
  padding: 12px 14px 11px;
  border: 1px solid var(--pt-line);
  border-radius: 14px;
  background: linear-gradient(165deg, var(--pt-card) 0%, rgba(8, 14, 28, .42) 100%);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .18);
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  overflow: hidden;
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  transition: transform .26s cubic-bezier(.2, .7, .2, 1), border-color .26s ease, box-shadow .26s ease;
  animation: pt-rise .8s cubic-bezier(.2, .7, .2, 1) both;
}
[data-theme="light"] .pt-card {
  background: linear-gradient(165deg, rgba(255, 255, 255, .86) 0%, rgba(240, 246, 255, .7) 100%);
  box-shadow: 0 8px 24px rgba(30, 60, 110, .08);
}
.pt-card:nth-child(1) { animation-delay: .42s; }
.pt-card:nth-child(2) { animation-delay: .5s; }
.pt-card:nth-child(3) { animation-delay: .58s; }
.pt-card[data-module="orbit"] { --pt-card-accent: var(--pt-cyan); --pt-card-line: rgba(90, 216, 255, .5); }
.pt-card[data-module="symmetry"] { --pt-card-accent: var(--pt-violet); --pt-card-line: rgba(167, 139, 250, .5); }
.pt-card[data-module="crystal"] { --pt-card-accent: var(--pt-emerald); --pt-card-line: rgba(63, 224, 164, .48); }
.pt-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(90% 60% at 15% 0%, var(--pt-card-accent), transparent 60%);
  opacity: .06;
}
.pt-card::after {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--pt-card-accent), transparent);
  opacity: 0;
  transition: opacity .3s ease;
}
.pt-card:hover, .pt-card:focus-visible {
  transform: translateY(-5px);
  border-color: var(--pt-card-line);
  box-shadow: 0 22px 46px rgba(0, 0, 0, .3), 0 0 40px -18px var(--pt-card-accent);
  outline: none;
}
.pt-card:focus-visible { box-shadow: 0 0 0 2px var(--pt-card-accent), 0 22px 46px rgba(0, 0, 0, .3); }
.pt-card:hover::after, .pt-card:focus-visible::after { opacity: .9; }
.pt-card:hover .pt-card-arrow { transform: translate(2px, -2px); color: var(--pt-card-accent); }
.pt-card:hover .pt-card-canvas { filter: brightness(1.22) saturate(1.08); }
.pt-card:hover .pt-card-enter-arrow { transform: translateX(4px); }
.pt-card.is-locked { cursor: default; opacity: .72; }
.pt-card.is-locked:hover { transform: none; border-color: var(--pt-line); box-shadow: 0 10px 30px rgba(0, 0, 0, .18); }
.pt-card.is-locked:hover::after { opacity: 0; }
.pt-card.is-nudged { animation: pt-nudge .45s ease; }
/* 「开始探索」的可见反馈：三张卡各闪两次（不是 hover，不需要鼠标） */
.pt-card.is-flash { animation: pt-flash 1.1s ease 2; }
@keyframes pt-flash {
  0%, 100% { border-color: var(--pt-line); box-shadow: 0 10px 30px rgba(0, 0, 0, .18); }
  35% {
    border-color: var(--pt-card-accent);
    box-shadow: 0 0 0 1px var(--pt-card-accent), 0 18px 42px rgba(0, 0, 0, .28),
      0 0 34px -12px var(--pt-card-accent);
  }
}
@keyframes pt-nudge {
  0%, 100% { transform: translateX(0); }
  30% { transform: translateX(-5px); }
  60% { transform: translateX(4px); }
}
.pt-card-glow {
  position: absolute;
  inset: auto -30% -60% -30%;
  height: 70%;
  background: radial-gradient(closest-side, var(--pt-card-accent), transparent 70%);
  opacity: .05;
  pointer-events: none;
  transition: opacity .3s ease;
}
.pt-card:hover .pt-card-glow { opacity: .12; }
.pt-card-top {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--pt-mono);
  font-size: 9.5px;
  letter-spacing: .18em;
  color: var(--pt-dim);
}
.pt-card-no {
  display: inline-grid;
  place-items: center;
  min-width: 26px;
  height: 18px;
  padding: 0 5px;
  border: 1px solid var(--pt-card-accent);
  border-radius: 4px;
  color: var(--pt-card-accent);
  font-size: 10px;
  letter-spacing: .1em;
}
.pt-card-code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-card-arrow {
  margin-left: auto;
  font-size: 14px;
  color: var(--pt-dim);
  transition: transform .25s ease, color .25s ease;
}
.pt-card-visual {
  position: relative;
  display: block;
  margin: 6px -4px 2px;
  min-height: 0;
}
.pt-card-canvas { position: absolute; inset: 0; transition: filter .3s ease; }
.pt-card-demo {
  position: absolute;
  top: 4px;
  right: 2px;
  font-family: var(--pt-mono);
  font-size: 10.5px;
  letter-spacing: .06em;
  color: var(--pt-dim);
  opacity: .85;
}
.pt-card-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pt-card-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: .08em;
  line-height: 1.2;
}
.pt-card-sub { font-size: 12.5px; letter-spacing: .03em; color: var(--pt-card-accent); }
.pt-card-desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--pt-dim);
}
.pt-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--pt-line);
}
.pt-card-tag { font-size: 11px; letter-spacing: .06em; color: var(--pt-dim); white-space: nowrap; }
.pt-card-enter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  letter-spacing: .1em;
  color: var(--pt-card-accent);
  white-space: nowrap;
}
.pt-card-enter-arrow { transition: transform .25s ease; }
.pt-badge {
  position: absolute;
  top: 12px;
  right: 14px;
  font-family: var(--pt-mono);
  font-size: 9px;
  letter-spacing: .16em;
  color: var(--pt-dim);
  padding: 3px 8px;
  border: 1px solid var(--pt-line);
  border-radius: 999px;
}

/* ---------- 底部控制条 ---------- */
.pt-foot {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding-top: 8px;
  animation: pt-rise .7s .55s cubic-bezier(.2, .7, .2, 1) both;
}
.pt-console {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px 26px;
  padding: 7px 4px;
  border-top: 1px solid var(--pt-line);
}
.pt-console-title {
  font-family: var(--pt-mono);
  font-size: 9px;
  letter-spacing: .3em;
  color: var(--pt-dim);
  opacity: .7;
  text-transform: uppercase;
}
.pt-set { display: inline-flex; align-items: center; gap: 9px; }
.pt-set-label { font-size: 11px; letter-spacing: .08em; color: var(--pt-dim); }
.pt-seg {
  display: inline-flex;
  border: 1px solid var(--pt-line);
  border-radius: 7px;
  overflow: hidden;
  background: rgba(8, 14, 28, .3);
}
[data-theme="light"] .pt-seg { background: rgba(255, 255, 255, .6); }
.pt-seg-btn {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 5px 11px;
  font-family: inherit;
  font-size: 11.5px;
  letter-spacing: .05em;
  color: var(--pt-dim);
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.pt-seg-btn + .pt-seg-btn { border-left: 1px solid var(--pt-line); }
.pt-seg-btn:hover { color: var(--pt-ink); }
.pt-seg-btn.is-on { background: var(--pt-soft); color: var(--pt-cyan); }
.pt-seg-btn:focus-visible { outline: 2px solid var(--pt-cyan); outline-offset: -2px; }
.pt-foot-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  /* 右下角是智能体悬浮球（固定定位，72px）—— 给文字留出让位空间，别被它压住 */
  padding: 6px 84px 0 0;
  font-size: 10.5px;
  letter-spacing: .06em;
  color: var(--pt-dim);
  opacity: .72;
}
.pt-foot-mono { font-family: var(--pt-mono); letter-spacing: .18em; }

/* ---------- 入场动画 ---------- */
@keyframes pt-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pt-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---------- 首页悬浮球（作用域在 body.home-active 上） ---------- */
body.home-active .agent-fab {
  width: 64px; height: 64px;
  right: 22px; bottom: 22px;
  filter: drop-shadow(0 8px 22px rgba(26, 54, 93, .38));
  animation: pt-fab-breathe 2.6s ease-in-out infinite;
}
@keyframes pt-fab-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.07); }
}

/* ---------- 响应式 ---------- */
@media (max-width: 1080px) {
  .pt-hero {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding-top: 10px;
  }
  .pt-visual-col { order: 2; margin-top: 2px; }
  .pt-hero-visual { max-width: min(52vw, 360px); }
  .pt-hero-copy { order: 1; }
  .pt-mod-order { text-align: left; }
}
@media (max-width: 720px) {
  .portal { padding: 16px 18px 20px; }
  .pt-brand-en { display: none; }
  .pt-top { padding-bottom: 11px; }
  .pt-top-meta { gap: 10px; }
  .pt-ver { display: none; }
  .pt-kicker { font-size: 9px; letter-spacing: .2em; margin-bottom: 12px; }
  .pt-title { font-size: clamp(34px, 9.6vw, 46px); letter-spacing: .03em; }
  .pt-title-en { letter-spacing: .34em; font-size: 9.5px; }
  .pt-slogan { font-size: 14.5px; line-height: 1.7; }
  .pt-desc { font-size: 12.5px; }
  .pt-actions { margin-top: 18px; }
  .pt-btn { height: 44px; padding: 0 18px; font-size: 13px; }
  .pt-feats { gap: 6px; margin-top: 16px; }
  .pt-feat { font-size: 10.5px; padding: 4px 9px; }
  .pt-hero-visual { max-width: min(74vw, 300px); }
  .pt-hud--tl, .pt-hud--bl { left: -2%; }
  .pt-hud--tr, .pt-hud--br { right: -2%; }
  /* 手机上画布只占容器 90%，四周留白有限：底部两条 HUD 会压到点云/节锥上，
     直接收起来，只留"波函数 / 节锥"两条最关键的读数 */
  .pt-hud--bl, .pt-hud--br { display: none; }
  .pt-hud-v { font-size: 11px; }
  .pt-hud-k { font-size: 8px; }
  .pt-card { grid-template-rows: auto 112px auto auto; }
  .pt-mod-lead { display: block; margin: 6px 0 0; }
  .pt-foot-bottom { justify-content: center; text-align: center; padding-right: 0; }
  .pt-console { gap: 8px 16px; }
  .pt-console-title { width: 100%; text-align: center; }
  body.home-active .agent-fab { width: 56px; height: 56px; right: 14px; bottom: 14px; }
  .portal { padding-bottom: 92px; }
}
/* 英文排版：英文标题更长，字距收紧、字号降一档，避免在栏内折成三行；
   同时压一压纵向留白 —— 英文的同一段话说出来总要长一截，否则一屏放不下四张卡 */
.portal.lang-en .pt-title { letter-spacing: 0; font-size: clamp(32px, 3.5vw, 50px); line-height: 1.04; }
.portal.lang-en .pt-title-en { letter-spacing: .34em; font-size: 9px; margin-top: 9px; }
.portal.lang-en .pt-kicker { margin-bottom: 11px; }
.portal.lang-en .pt-slogan { font-size: 13px; letter-spacing: .02em; margin-top: 12px; }
.portal.lang-en .pt-desc { display: none; }
.portal.lang-en .pt-actions { margin-top: 16px; }
.portal.lang-en .pt-feats { margin-top: 12px; gap: 6px; }
.portal.lang-en .pt-feat { font-size: 10.5px; padding: 4px 9px; }
.portal.lang-en .pt-mod-lead { margin-left: 0; display: block; margin-top: 6px; }
.portal.lang-en .pt-mod-order { max-width: none; font-size: 11px; }
.portal.lang-en .pt-card-name { font-size: 18.5px; letter-spacing: .02em; }
/* 矮屏（笔记本常见 768–820 高）：压缩纵向留白，让模块卡与底部控制条都进一屏 */
@media (max-height: 820px) and (min-width: 1081px) {
  .pt-hero { padding: 4px 0 2px; }
  .pt-title { font-size: clamp(34px, 4vw, 56px); }
  .pt-slogan { margin-top: 10px; }
  .pt-desc { display: none; }
  .pt-actions { margin-top: 14px; }
  .pt-feats { margin-top: 12px; }
  .pt-hero-visual { max-width: min(37vh, 400px); }
  .pt-card { grid-template-rows: auto 104px auto auto; }
  .pt-mod-kicker { display: none; }
}
/* 降低动效：全部停掉，只保留静态画面（canvas 也会被 JS 冻在一帧） */
@media (prefers-reduced-motion: reduce) {
  .portal *,
  .portal *::before,
  .portal *::after {
    animation: none !important;
    transition: none !important;
  }
  body.home-active .agent-fab { animation: none; }
}
</style>`

export default HomePage
