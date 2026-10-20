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
  mixColor, parseColor, createSphericalCage, createNodalCones, createMethane,
  createLatticeScene, createOrbitalCloud, createDust, createBackgroundLattice,
} from './home-visuals.js'
// ★ 晶典卡的配色/尺寸不另配一套：直接读**晶典在线模块自己的**数据与设置
//   （元素色尊重用户在设置里的覆盖；半径/晶格常数来自 naCl 的晶体数据）。
//   含义见 _resolveCrystalStyle 的注释。
import { getCrystalData } from '@crystal/lib/crystal-loader.js'
import { getElementColor } from '@crystal/data/settings.js'
// ★ 装饰用的元素小块（原子序数 / 相对原子质量）也读模块的元素数据 —— 不另抄一份周期表。
import elementsData from '@crystal/data/elements.js'

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

/** 卡片画布上角的"正在演示什么"（化学标识；见文件头排版约定。
 *  ★ 2026-10-17 用户第五次复查：`p`、`d` 这类**轨道字母不斜体** ——
 *    它们是轨道标签（s/p/d/f），不是物理量；斜体的只能是变量（ψ、θ、Y、n、l、m、x/y/z 轴）。 */
const MODULE_DEMO = {
  orbit: '2p<sub>z</sub>',
  symmetry: '<i>T</i><sub>d</sub> · 24',
  // Fm3̄m 是 Hermann–Mauguin 空间群符号：**正体**，3 上有横杠（用 CSS overline 画，
  // 组合字符 3̄ 在有些字体里横杠几乎看不见）
  crystal: 'NaCl · Fm<span class="pt-bar">3</span>m',
}

/**
 * 三张卡片里各放一条**公式点缀**（用户：「薛定谔方程改到轨道视界卡片……点群观鉴卡片放一个
 * 大正交定理公式，晶典在线卡片上放一个布洛赫定理的公式。不用太突出，公式只是作为点缀」）。
 *
 * 排版沿用项目规则：变量（ψ、E、R、h、d、k、r、u…）用斜体衬线；Γ 作为表示符号也按斜体；
 * 运算符/常数（Σ、√、e、**虚数单位 i**）保持正体。放在卡片视觉区左下角，低透明度、不拦点击。
 */
const CARD_FORMULA = {
  // 定态薛定谔方程
  orbit: '<i>Ĥ</i><i>ψ</i> = <i>E</i><i>ψ</i>',
  // 大正交定理（Great Orthogonality Theorem）—— 两行排版：长公式在小卡片里一行会挤成噪点
  symmetry: 'Σ<sub><i>R</i></sub> <i>Γ</i><sup>(<i>i</i>)</sup>(<i>R</i>)<sub><i>mn</i></sub>'
    + ' <i>Γ</i><sup>(<i>j</i>)</sup>(<i>R</i>)<sub><i>m′n′</i></sub><sup>*</sup>'
    + '<br>= (<i>h</i>/√(<i>d</i><sub><i>i</i></sub><i>d</i><sub><i>j</i></sub>))'
    + '<i>δ</i><sub><i>ij</i></sub><i>δ</i><sub><i>mm′</i></sub><i>δ</i><sub><i>nn′</i></sub>',
  // 布洛赫定理 —— ★ 虚数单位 i 用**正体**（它是 √−1，不是变量），k、r 仍斜体
  crystal: '<i>ψ</i><sub><i>k</i></sub>(<i>r</i>) = e<sup>i<i>k</i>·<i>r</i></sup>'
    + '<i>u</i><sub><i>k</i></sub>(<i>r</i>)',
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
      + (CARD_FORMULA[m.id]
        ? '<span class="pt-card-formula pt-card-formula--' + m.id + '" aria-hidden="true">'
          + CARD_FORMULA[m.id] + '</span>'
        : '')
      + '</span>'
      + '<span class="pt-card-body">'
      + '<span class="pt-card-name">' + title + '</span>'
      + '</span>'
      + '<span class="pt-card-foot">'
      + (copy ? '<span class="pt-card-tag">' + t(copy.tag) + '</span>' : '<span></span>')
      + '<span class="pt-card-enter" aria-label="' + t('shell.home.enterModule') + '">'
      + '<span class="pt-card-enter-arrow" aria-hidden="true">→</span></span>'
      + '</span>'
      + badge
      + '</' + tag + '>'
  }

  /**
   * 首页两侧的**化学点缀**：元素小块 + 结构式线稿 + 经典符号。
   *
   * ★ 定位：装饰（`aria-hidden`、`pointer-events:none`、低透明度、只放在页面留白里），
   *   目的是让整页"有结构化学的味道"，而不是往界面上堆信息 —— 所以：
   *     · 元素数据不另抄：原子序数/相对原子质量直接读模块的 elements.js（改一处全站一致）；
   *     · 图形只有线稿（苯环、晶胞），颜色只用主题的 --pt-dim/--pt-line，保持灰阶高级感；
   *     · 窄屏（<1360px）整层隐藏：那时页面左右留白不足，放上去会压到正文。
   *
   * ★ 2026-10-18 用户复查：五个元素小块要**按元素周期表的相对位置**摆，而不是两列堆叠：
   *   H 在左上、Na 在左下（同一竖列，都在界面最左），Cl 在界面最右且与 Na 同高；
   *   O 在 Cl 的左上方、高度在 H 与 Na 之间；C 在 O 左边（与 O 同一行）。
   *   位置写在 CSS 的 `.pt-el--H/--Na/--C/--O/--Cl` 里（top 用百分比，随页面高度缩放）。
   */
  _renderElementTiles(symbols) {
    return symbols.map((sym) => {
      const el = elementsData && elementsData[sym]
      if (!el) return ''
      // ★ 原子序数 / 原子量都是数字、量值 —— 按排版规则用**正体**（这里是 <span>，不斜体）。
      const mass = this._formatAtomicMass(el.atomicMass)
      return '<span class="pt-el pt-el--' + sym + '" data-el="' + sym + '">'
        + '<span class="pt-el-z">' + el.atomicNumber + '</span>'
        + '<b class="pt-el-sym">' + sym + '</b>'
        + '<span class="pt-el-mass">' + mass + '</span>'
        + '</span>'
    }).join('')
  }

  /**
   * 原子量统一按 **4 位有效数字**显示（H 1.008 · C 12.01 · O 16.00 · Na 22.99 · Cl 35.45）。
   * ★ 用户问"为什么原子量的有效数字位数不同"：因为数据源 elements.js 每条记录本身的精度不一
   *   （1.008 / 12.011 / 15.999 / 22.990 / 35.45），直接 toString() 就会 1.008、12.011、22.99 混排。
   *   这里统一到 4 位有效数字：1.008 的 4 位是 1,0,0,8（所以有 3 位小数），12.01 的 4 位是
   *   1,2,0,1（2 位小数）—— 小数位不同是有效数字规则决定的，不是排版错误。
   */
  _formatAtomicMass(v) {
    if (typeof v !== 'number' || !isFinite(v)) return ''
    return v.toPrecision(4)
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

        <div class="pt-deco" aria-hidden="true">
          ${this._renderElementTiles(['H'])}
          ${this._renderElementTiles(['Na'])}
          ${this._renderElementTiles(['C'])}
          ${this._renderElementTiles(['O'])}
          ${this._renderElementTiles(['Cl'])}
          <div class="pt-deco-col pt-deco-col--l">
            <svg class="pt-deco-art" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.1">
              <path d="M50 12 82 31v38L50 88 18 69V31z"/>
              <circle cx="50" cy="50" r="20"/>
              <circle cx="50" cy="12" r="1.8" fill="currentColor" stroke="none"/>
              <circle cx="82" cy="31" r="1.8" fill="currentColor" stroke="none"/>
              <circle cx="82" cy="69" r="1.8" fill="currentColor" stroke="none"/>
              <circle cx="50" cy="88" r="1.8" fill="currentColor" stroke="none"/>
              <circle cx="18" cy="69" r="1.8" fill="currentColor" stroke="none"/>
              <circle cx="18" cy="31" r="1.8" fill="currentColor" stroke="none"/>
            </svg>
            <span class="pt-deco-tag">C<sub>6</sub>H<sub>6</sub></span>
            <span class="pt-deco-tag pt-deco-tag--dim pt-deco-tag--tight"><i>σ</i> · <i>π</i> · <i>δ</i></span>
            <svg class="pt-deco-art pt-deco-art--bohr" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.1">
              <circle cx="50" cy="50" r="3.4" fill="currentColor" stroke="none"/>
              <ellipse cx="50" cy="50" rx="38" ry="15"/>
              <ellipse cx="50" cy="50" rx="38" ry="15" transform="rotate(60 50 50)"/>
              <ellipse cx="50" cy="50" rx="38" ry="15" transform="rotate(120 50 50)"/>
              <circle cx="88" cy="50" r="2.2" fill="currentColor" stroke="none"/>
              <circle cx="69" cy="83" r="2.2" fill="currentColor" stroke="none"/>
              <circle cx="31" cy="83" r="2.2" fill="currentColor" stroke="none"/>
            </svg>
            <span class="pt-deco-tag pt-deco-tag--tight">Bohr · 1913</span>
          </div>
          <div class="pt-deco-col pt-deco-col--r">
            <svg class="pt-deco-art" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.1">
              <path d="M22 36h44v44H22z"/>
              <path d="M38 20h44v44H38z"/>
              <path d="M22 36l16-16M66 36l16-16M66 80l16-16M22 80l16-16"/>
              <circle cx="22" cy="36" r="2.2" fill="currentColor" stroke="none"/>
              <circle cx="66" cy="36" r="2.2" fill="currentColor" stroke="none"/>
              <circle cx="66" cy="80" r="2.2" fill="currentColor" stroke="none"/>
              <circle cx="22" cy="80" r="2.2" fill="currentColor" stroke="none"/>
              <circle cx="38" cy="20" r="2.2" fill="currentColor" stroke="none"/>
              <circle cx="82" cy="20" r="2.2" fill="currentColor" stroke="none"/>
              <circle cx="82" cy="64" r="2.2" fill="currentColor" stroke="none"/>
              <circle cx="38" cy="64" r="2.2" fill="currentColor" stroke="none"/>
            </svg>
            <span class="pt-deco-tag">NaCl<br>Fm<span class="pt-bar">3</span>m</span>
            <span class="pt-deco-tag pt-deco-tag--dim">2<i>d</i> sin<i>θ</i><br>= <i>n</i><i>λ</i></span>
          </div>
        </div>

        <main class="pt-hero">
          <div class="pt-hero-copy">
            <h1 class="pt-title">
              <span class="pt-title-line">${t('shell.home.titleSm')}</span>
              <span class="pt-title-line pt-title-line--accent">${t('shell.home.titleLg')}</span>
            </h1>
            <p class="pt-desc">${t('shell.home.desc')}</p>
            <div class="pt-actions">
              <button type="button" class="pt-btn pt-btn--primary" data-act="explore">
                <span>${t('shell.home.cta')}</span><span class="pt-btn-arrow" aria-hidden="true">→</span>
              </button>
              <button type="button" class="pt-btn pt-btn--ghost" data-act="ask" title="${t('shell.home.askHint')}">
                <span class="pt-btn-pulse" aria-hidden="true"></span>${t('shell.home.askAgent')}
              </button>
            </div>
          </div>

          <div class="pt-visual-col">
            <div class="pt-hero-visual" role="img" aria-label="${t('shell.home.visualHint')}">
              <div class="pt-holo-ring" aria-hidden="true"></div>
              <div class="pt-holo-ring2" aria-hidden="true"></div>
              <div class="pt-holo-scan" aria-hidden="true"></div>
              <canvas class="pt-canvas pt-holo" data-canvas="holo" aria-hidden="true"></canvas>
            </div>
          </div>
        </main>

        <section class="pt-modules" id="pt-modules">
          <div class="pt-mod-head">
            <div class="pt-mod-title">
              <span class="pt-mod-kicker">[ MODULES 01 — 03 · TEACHING ORDER ]</span>
              <h2>${t('shell.home.modulesTitle')}</h2>
            </div>
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
    this._crystalStyle = this._resolveCrystalStyle()
    const host = this._portal
    if (!host || typeof getComputedStyle !== 'function') {
      return createPalette(() => '', { dark: true })
    }
    const cs = getComputedStyle(host)
    const dark = document.documentElement.getAttribute('data-theme') !== 'light'
    return createPalette((name) => cs.getPropertyValue(name), { dark })
  }

  /**
   * 晶典卡的配色与尺寸 —— 真源是**晶典在线模块自己**（用户 2026-10-17 第三次复查：
   * 「颜色和风格按照晶典在线程序中的，只是视角按照我发的图」）。
   *
   *   · 元素颜色：`getElementColor()`（模块的设置入口，尊重用户逐元素覆盖）；
   *   · 原子半径：NaCl 晶体数据里的 `radius`（= 离子半径：Cl⁻ 1.81 > Na⁺ 1.02，
   *     所以卡片上**绿球比蓝球大** —— 与晶典在线一致，不是反过来的）；
   *   · 晶格常数：`data.lattice.a`（5.62 Å）。
   * 取不到时用模块默认值兜底（数值与原数据一致），绝不悄悄换成另一套配色。
   */
  _resolveCrystalStyle() {
    let data = null
    try { data = getCrystalData('naCl') } catch (e) { data = null }
    const groups = (data && Array.isArray(data.atoms)) ? data.atoms : []
    const clGroup = groups.find((g) => g.element === 'Cl') || { color: '#34A853', radius: 1.81 }
    const naGroup = groups.find((g) => g.element === 'Na') || { color: '#4285F4', radius: 1.02 }
    let clHex = clGroup.color
    let naHex = naGroup.color
    try { clHex = getElementColor('Cl') || clHex } catch (e) { /* 用数据里的颜色 */ }
    try { naHex = getElementColor('Na') || naHex } catch (e) { /* 同上 */ }
    const asColor = (hex, fallback) => parseColor(hex) || parseColor(fallback) || { r: 136, g: 136, b: 136, a: 1 }
    const latticeA = data && data.lattice && typeof data.lattice.a === 'number' ? data.lattice.a : 5.62
    return {
      clColor: asColor(clHex, '#34A853'),
      naColor: asColor(naHex, '#4285F4'),
      clRadius: typeof clGroup.radius === 'number' ? clGroup.radius : 1.81,
      naRadius: typeof naGroup.radius === 'number' ? naGroup.radius : 1.02,
      latticeA,
    }
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
  // 绘制：模块卡 · 晶体（NaCl —— **晶典在线的元素配色/球棍风格** + 教材图的视角）
  //
  //   用户 2026-10-17 第三次复查：「颜色和风格按照晶典在线程序中的，只是视角按照我发的图」。
  //   因此：
  //     · 视角：保持教材图的 cabinet 斜投影（projectOblique：正面不变形、平行线平行、
  //       深度轴 38° 缩短一半）；
  //     · 颜色/尺寸：**不另配一套**，直接与晶典在线的场景构建器同一份真源 ——
  //         - 元素色 = getElementColor('Cl'/'Na')（模块设置，尊重用户的逐元素覆盖）
  //         - 原子半径 = NaCl 晶体数据里的 radius（离子半径：Cl⁻ 1.81 > Na⁺ 1.02，
  //           所以卡片上**绿球比蓝球大**，与晶典在线一致）
  //         - 球棍比例 = scene-builder 的 BALL_STICK_FACTOR 0.3、stickRadius 0.08
  //         - 键是**两段双色**（靠 Cl 一侧 Cl 色、靠 Na 一侧 Na 色）—— 模块就是这样画的；
  //     · 球面按 MeshStandardMaterial 的金属感（metalness .55 / roughness .32）用
  //       径向渐变近似：左上高光 → 本色 → 右下暗边 + 镜面高光点。
  //   模块文件：projects/crystal/H5/src/{data/settings.js, data/crystals/naCl.js, lib/scene-builder.js}
  // -------------------------------------------------------------------------
  _drawCrystal(ctx, e, t, pal) {
    const w = e.w
    const h = e.h
    const cx = w / 2
    const cy = h / 2
    const m = Math.min(w, h)
    const dark = pal.dark
    const style = this._crystalStyle || this._resolveCrystalStyle()
    const lat = this._scenes.lattice

    // ---- 动效（用户反馈"还是不动"：振幅必须调到肉眼可感知）----
    //   ★ 怎么动都不引入透视：**先做 3D 旋转，再用 projectOblique 做仿射投影** ——
    //     仿射保持平行线（没有近大远小），所以教材图那种"平行投影"的观感不丢。
    //     绕竖直轴 ±18° 缓慢摆动（≈16 s 一周期）、绕水平轴 ±3.4° 轻微点头，
    //     再叠加呼吸（角度/深度/缩放/浮动）—— 一眼就能看出晶格在转，但不会"透视歪掉"。
    const yaw = Math.sin(t * 0.38) * 0.32
    const pitch = Math.sin(t * 0.27 + 1.1) * 0.06
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw)
    const cpit = Math.cos(pitch), spit = Math.sin(pitch)
    const spin = (p) => {
      const x1 = p[0] * cyaw - p[2] * syaw
      const z1 = p[0] * syaw + p[2] * cyaw
      return [x1, p[1] * cpit - z1 * spit, p[1] * spit + z1 * cpit]
    }
    const breathe = Math.sin(t * 0.55)                 // ≈ 11.4 s 一个来回
    const breathe2 = Math.sin(t * 0.42 + 1.3)          // ≈ 15 s，与上面错相
    const scale = m * (0.5 + breathe * 0.012)
    const opts = {
      cx,
      cy: cy + breathe2 * 2.4,
      scale,
      alpha: 0.6632251 + breathe * 0.03,
      depth: 0.5 + breathe2 * 0.05,
    }
    const screen = (p) => projectOblique(p, opts)
    // 旋转后的节点位置（画家算法的深度必须用**旋转后**的 z）
    const rot = lat.nodes.map((n) => spin([n.x, n.y, n.z]))

    // ---- 尺寸：全部从模块常量/数据换算（不手写像素比例）----
    // 卡片格点间距 = 1/√3 × scale；NaCl 最近邻距离 = a/2（岩盐型：Cl 在 0、Na 在 a/2）
    const neighborPx = scale / Math.sqrt(3)
    const pxPerA = neighborPx / (style.latticeA / 2)      // 每 Å 对应多少屏幕像素
    const BALL_STICK_FACTOR = 0.3                           // scene-builder.js 同名常量
    const STICK_RADIUS_A = 0.08                             // view-props 的 stickRadius 默认值
    const rCl = style.clRadius * BALL_STICK_FACTOR * pxPerA
    const rNa = style.naRadius * BALL_STICK_FACTOR * pxPerA
    const bondW = Math.max(1, 2 * STICK_RADIUS_A * pxPerA)
    const colorOf = (kind) => (kind === 0 ? style.clColor : style.naColor)
    const radiusOf = (kind) => (kind === 0 ? rCl : rNa)

    /** 金属球面：左上高光 → 本色 → 右下暗边（近似模块的 MeshStandardMaterial 观感） */
    const sphereFill = (pr, r, base) => {
      const g = ctx.createRadialGradient(
        pr.x - r * 0.38, pr.y - r * 0.38, Math.max(0.6, r * 0.08),
        pr.x, pr.y, r * 1.06)
      g.addColorStop(0, rgba(mixColor(base, { r: 255, g: 255, b: 255, a: 1 }, 0.62), 1))
      g.addColorStop(0.42, rgba(base, 1))
      g.addColorStop(1, rgba(mixColor(base, { r: 0, g: 0, b: 0, a: 1 }, 0.42), 1))
      return g
    }

    // 柔光脉动：卡片里没有独立光源，用一层很淡的呼吸光把晶格"托"起来（与另外两张卡的辉光同语言）
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.7 + 0.4)
    drawGlow(ctx, cx, cy, m * 0.46, pal.accent, dark ? 0.06 + pulse * 0.06 : 0.04 + pulse * 0.035)

    // 画家算法：键与球放进同一张表，按 z 从远到近画（+z = 远离观察者，朝右上）
    const items = []
    for (let i = 0; i < lat.edges.length; i++) {
      const ia = lat.edges[i][0]
      const ib = lat.edges[i][1]
      items.push({ kind: 'bond', z: (rot[ia][2] + rot[ib][2]) / 2, a: ia, b: ib })
    }
    for (let i = 0; i < lat.nodes.length; i++) {
      items.push({ kind: 'atom', z: rot[i][2], node: i })
    }
    items.sort((p, q) => q.z - p.z)

    for (let k = 0; k < items.length; k++) {
      const it = items[k]
      if (it.kind === 'bond') {
        const ps = screen(rot[it.a])
        const pe = screen(rot[it.b])
        const midX = (ps.x + pe.x) / 2
        const midY = (ps.y + pe.y) / 2
        // 模块的键 = 两根半截圆柱：靠哪端就用哪个元素的颜色（双色键是晶典在线的特征之一）
        const aKind = lat.nodes[it.a].kind
        const bKind = lat.nodes[it.b].kind
        drawLine(ctx, ps.x, ps.y, midX, midY, rgba(colorOf(aKind), 1), bondW, 1)
        drawLine(ctx, midX, midY, pe.x, pe.y, rgba(colorOf(bKind), 1), bondW, 1)
        continue
      }
      const node = lat.nodes[it.node]
      const pr = screen(rot[it.node])
      const base = colorOf(node.kind)
      // 每个球自己的相位：高光在球面上**缓慢绕圈**（金属球在环境光里转动）+ 轻微呼吸
      const glint = t * 0.55 + (node.x * 2.1 + node.y * 1.7 + node.z)
      const r = radiusOf(node.kind) * (1 + 0.012 * Math.sin(t * 0.85 + k * 1.3))
      ctx.beginPath()
      ctx.arc(pr.x, pr.y, r, 0, TAU)
      ctx.fillStyle = sphereFill(pr, r, base)
      ctx.fill()
      drawDot(ctx, pr.x + r * 0.34 * Math.cos(glint), pr.y + r * 0.34 * Math.sin(glint),
        r * 0.2, 'rgba(255,255,255,0.85)', 0.78 + 0.18 * Math.sin(glint * 1.7))
    }

    // 扫描光带：每 ~6 s 从左上到右下掠过一次，只扫晶格所在的圆形区域（卡片的"高级感"细节）
    const sweepT = (t * 0.16) % 1
    if (sweepT > 0.02 && sweepT < 0.98) {
      const sweepX = cx + (sweepT * 2 - 1) * m * 0.72
      const sw = m * 0.22
      const sg = ctx.createLinearGradient(sweepX - sw, cy - m * 0.6, sweepX + sw, cy + m * 0.6)
      sg.addColorStop(0, 'rgba(255,255,255,0)')
      sg.addColorStop(0.5, dark ? 'rgba(150,220,255,0.16)' : 'rgba(37,99,214,0.075)')
      sg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, m * 0.52, 0, TAU)
      ctx.clip()
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'
      ctx.fillStyle = sg
      ctx.fillRect(cx - m * 0.6, cy - m * 0.6, m * 1.2, m * 1.2)
      ctx.restore()
    }

    // ---- 图例已按用户要求删除（2026-10-20）----

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

/* ---------- 化学点缀层（装饰，不是信息） ----------
 * 放在左右两条页边距里：元素小块 + 结构式线稿 + 经典符号。
 * 只做低透明度灰阶（--pt-dim / --pt-line），不抢正文；<1360px 整层隐藏（那时没有页边距）。
 * pointer-events:none + aria-hidden：纯装饰，不可点、不进屏幕阅读器。
 */
.pt-deco {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  padding: 0 8px;
  pointer-events: none;
}
.pt-deco-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 40px;
  /* 底部多留一截：右下角是固定的智能体悬浮球，别让最下面的记号落到它下面 */
  padding: 12vh 0 24vh;
}
.pt-deco-col > * { animation: pt-float 10s ease-in-out infinite alternate; }
.pt-deco-col > *:nth-child(2) { animation-duration: 13s; animation-delay: -4s; }
.pt-deco-col > *:nth-child(3) { animation-duration: 11.5s; animation-delay: -7s; }
.pt-deco-col > *:nth-child(4) { animation-duration: 14s; animation-delay: -2s; }
.pt-deco-col > *:nth-child(5) { animation-duration: 12.5s; animation-delay: -5.5s; }
/* ★ 元素小块按周期表位置独立定位后，左列只剩线稿/记号 ——
 *   收成上半段的一小簇，避开 H（~11%）与 Na（~58%）两个元素小块。 */
.pt-deco-col--l {
  justify-content: flex-start;
  gap: 11px;
  padding-top: 20vh;
  padding-bottom: 28vh;
}
@keyframes pt-float {
  from { transform: translateY(-4px); }
  to { transform: translateY(5px); }
}

/* ★ 2026-10-18 用户复查：五个元素小块按**元素周期表的相对位置**摆放（不是两列堆叠）。
 *   坐标按"组（列）/周期（行）"给：组距 p = 56px，周期行距 = 24%（等间距）。
 *     · H：第 1 周期、第 1 族 —— 左上（left:8px; top:10%）
 *     · C：第 2 周期、第 14 族 —— C 与 O 同周期，相隔**两个族**（C→N→O），故 C 在 O 左边 2p
 *     · O：第 2 周期、第 16 族 —— Cl 左边 1p、上边一个周期
 *     · Cl：第 3 周期、第 17 族 —— 界面最右（right:8px），与 Na 同周期同高
 *     · Na：第 3 周期、第 1 族 —— 界面最左（left:8px; top:58%），与 H 同族同列
 *   H 与 Na 之间空出一行（第 2 周期第 1 族是 Li，未画出）；Na 与 Cl 同高（都是第 3 周期）。 */
.pt-el {
  position: absolute;
  z-index: 1;
  display: grid;
  grid-template-rows: auto 1fr auto;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 3px 2px 4px;
  box-sizing: border-box;
  border: 1px solid var(--pt-line);
  border-radius: 4px;
  background: rgba(12, 20, 38, .18);
  color: var(--pt-dim);
  opacity: .72;
  animation: pt-float 10s ease-in-out infinite alternate;
}
.pt-el--H { left: 8px; top: 10%; animation-delay: -1.5s; }
.pt-el--Na { left: 8px; top: 58%; animation-delay: -6s; }
.pt-el--C { right: 176px; top: 34%; animation-delay: -3.5s; }
.pt-el--O { right: 64px; top: 34%; animation-delay: -7.5s; }
.pt-el--Cl { right: 8px; top: 58%; animation-delay: -4.5s; }
/* 窄屏时页面边缘留白变窄：中间行的 C/O 先隐藏，避免压到全息图（H/Na/Cl 仍贴边） */
@media (max-width: 1399px) {
  .pt-el--C, .pt-el--O { display: none; }
}
[data-theme="light"] .pt-el { background: rgba(255, 255, 255, .35); }
/* ★ 原子序数 / 原子量是数字、量值 → **正体**（不斜体）；元素符号是正体衬线字母。 */
.pt-el-z {
  justify-self: start;
  font: 7.5px/1 var(--pt-mono);
  font-style: normal;
  letter-spacing: .04em;
}
.pt-el-sym {
  font-family: var(--font-symbol, "Times New Roman", serif);
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
  color: var(--pt-ink);
  opacity: .82;
}
.pt-el-mass {
  font: 6.5px/1 var(--pt-mono);
  font-style: normal;
  letter-spacing: .02em;
  opacity: .8;
}

.pt-deco-art { width: 40px; height: 40px; color: var(--pt-dim); opacity: .38; }
.pt-deco-art--bohr { opacity: .42; }

/* 化学记号：页边距只有 ~60px，所以做成最多两行的小字（竖排会让式子更难读） */
.pt-deco-tag {
  max-width: 40px;
  font-family: var(--pt-mono);
  font-size: 8.5px;
  line-height: 1.45;
  letter-spacing: .06em;
  color: var(--pt-dim);
  opacity: .62;
  text-align: center;
  white-space: normal;
}
.pt-deco-tag--dim { opacity: .46; }
/* ★ 用户实测发现「σ · π · δ」被 max-width 折成了两行 —— 短记号强制单行，字号略收小 */
.pt-deco-tag--tight {
  max-width: none;
  font-size: 7.5px;
  letter-spacing: .02em;
  opacity: .58;
  white-space: nowrap;
}
.pt-deco-tag i { font-family: var(--font-symbol, "Times New Roman", serif); font-style: italic; letter-spacing: 0; }
.pt-deco-tag sub { font-size: .7em; }
@media (max-width: 1359px) {
  .pt-deco { display: none; }
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
  padding: clamp(6px, 1vh, 16px) 0 clamp(2px, .6vh, 8px);
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
 * ★ 科学排版：变量用斜体衬线、数字/函数名/单位/常数正体、上下标独立字号。
 *   用户第 5 条："2pz 的 z 不是下标，且没有斜体。检查首页，字母是否符合规范"；
 *   2026-10-18 又补一条："虚数单位要用正体"。
 *   规则（IUPAC / ISO 80000-2 的通行写法）：
 *     · 物理量、量子数、轨道字母（p、d、ψ、θ、φ、x、y、z、Y）→ 斜体；
 *     · 数字、函数名（cos）、单位（Å）、点群符号（T 是斜体 Schoenflies 符号）、
 *       空间群（Fm3̄m 是正体 Hermann–Mauguin 符号）、**虚数单位 i / 自然常数 e** → 正体；
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
  padding: clamp(4px, .8vh, 10px) 0 0;
}
/**
 * 化学记号条：一行极淡的空间群 / 点群符号，压在 hero 与模块区之间。
 * 它是"结构化学词典"式的细节 —— 不承担信息，只定调子；两侧渐变细线把它收进版心。
 */
.pt-chem-strip {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 0 8px;
  color: var(--pt-dim);
  opacity: .74;
}
.pt-chem-strip-rule {
  flex: 1 1 auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--pt-line), transparent);
}
.pt-chem-strip-items {
  font-family: var(--pt-mono);
  font-size: 9.5px;
  letter-spacing: .22em;
  white-space: nowrap;
}
.pt-chem-strip-items i { font-family: var(--font-symbol, "Times New Roman", serif); font-style: italic; letter-spacing: 0; }
.pt-chem-strip-items sub { font-size: .66em; line-height: 0; }
@media (max-width: 720px) {
  .pt-chem-strip { display: none; }
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
  grid-template-rows: auto 100px auto auto;
  gap: 0;
  padding: 10px 14px 9px;
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
/**
 * 卡片里的公式点缀（薛定谔 / 大正交定理 / 布洛赫定理）。
 * ★ 用户要求"不用太突出，公式只是作为点缀，重点是美观" ⇒ 8px 等宽 + 低透明度 + 左下角，
 *   不参与信息层级、不拦点击；窄卡片（<1100px 时一列变窄）直接隐藏，避免截出来半行。
 */
.pt-card-formula {
  position: absolute;
  left: 3px;
  bottom: 4px;
  max-width: calc(100% - 6px);
  overflow: hidden;
  white-space: normal;
  font-family: var(--pt-mono);
  font-size: 9px;
  line-height: 1.5;
  letter-spacing: .01em;
  color: var(--pt-dim);
  opacity: .42;
  pointer-events: none;
  transition: opacity .3s ease;
}
.pt-card-formula--symmetry { font-size: 8px; }
.pt-card:hover .pt-card-formula { opacity: .6; }
.pt-card-formula i {
  font-family: var(--font-symbol, "Times New Roman", serif);
  font-style: italic;
  letter-spacing: 0;
}
.pt-card-formula sub, .pt-card-formula sup { font-size: .72em; line-height: 0; letter-spacing: 0; }
@media (max-width: 1099px) {
  .pt-card-formula { display: none; }
}
.pt-card-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pt-card-name {
  font-size: 26px;
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
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 4px 10px;
  margin-top: 6px;
  padding-top: 5px;
  border-top: 1px solid var(--pt-line);
}
.pt-card-tag {
  grid-column: 1 / -1;
  font-size: 22px;
  letter-spacing: .04em;
  line-height: 1.35;
  color: var(--pt-dim);
  white-space: normal;
}
.pt-card-enter {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  justify-self: end;
  font-size: 23px;
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
  padding-top: 4px;
  animation: pt-rise .7s .55s cubic-bezier(.2, .7, .2, 1) both;
}
.pt-console {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px 28px;
  padding: 3px 4px;
  border-top: 1px solid var(--pt-line);
}
.pt-console-title {
  font-family: var(--pt-mono);
  font-size: 18px;
  letter-spacing: .24em;
  color: var(--pt-dim);
  opacity: .7;
  text-transform: uppercase;
}
.pt-set { display: inline-flex; align-items: center; gap: 12px; }
.pt-set-label { font-size: 22px; letter-spacing: .08em; color: var(--pt-dim); }
.pt-seg {
  display: inline-flex;
  border: 0;
  border-radius: 7px;
  overflow: visible;
  background: transparent;
  gap: 2px;
}
.pt-seg-btn {
  appearance: none;
  border: 0;
  border-radius: 7px;
  background: transparent;
  padding: 9px 18px;
  font-family: inherit;
  font-size: 23px;
  letter-spacing: .05em;
  color: var(--pt-dim);
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
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
  padding: 4px 84px 0 0;
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
.portal.lang-en .pt-card-name { font-size: 24px; letter-spacing: .02em; }
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
