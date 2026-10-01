/**
 * chart-overlay.js（orbit 模块 · 渲染层）
 *
 * 图表浮窗（把某张图放大来看；与卡片共用同一份状态）
 *
 * ★ 来自上游 `orbit/H5/`。转 ESM 时只改了：全局挂载 → 模块导出、
 *   跨文件全局引用 → import、**反向依赖宿主状态的那几处 → 注入**。
 *   算法与几何处理逐字未动。
 */

// ★ 字典的副作用 import：标题与按钮的提示都走 t() 现取。
import '../i18n.js'
import { t } from '../../../packages/i18n/index.js'

/**
 * chart-overlay.js — 图表浮动窗
 *
 * 为什么需要它：分镜演示讲到"看径向分布 / 截面密度"时，那两张图在页面**底部**，
 * 学生盯着三维视图根本看不到它们 —— 讲解与画面脱节。演示驱动时把对应图表放大到
 * 浮窗里，讲解与图就同时可见了。
 *
 * 为什么不用现成的两个浮层：
 *   · reference-table.js 的 .reftable-zoom 只认 <img>，而且是"每次新建 DOM、关闭即
 *     removeChild"，没有任何引用留存 —— 做不了 resize 时重画，也做不了被脚本切换目标。
 *   · settings.js 的 .agent-overlay 是**模态**（inset:0 遮罩 + 背景模糊），会把三维视图
 *     整个挡住，而这里恰恰要"边看三维边看图"。
 *   故取后者的"惰性单例 + .show 类切换 + 只点盒子外才关"，去掉模态遮罩的视觉阻断
 *   （外加 pointer-events: none，让浮窗之外的点击穿透到三维，键盘/滚轮照常可用）。
 *
 * 内容用**新 canvas + 重绘**，不搬 DOM、也不做像素快照：
 *   · 搬 DOM 要处理"尺寸/重绘归谁管"，而 cards 的绘制函数都从 canvas 的 clientWidth
 *     读尺寸，搬来搬去容易漏掉重绘；
 *   · 快照会定格，无法支持浮窗内的缩放平移 —— 而那正是截面图刚加上的能力。
 */
const ChartOverlay = (function () {
  // ★ 浮窗要靠宿主画图与绑交互，但方向必须是**注入**而不是去全局里抓：
  //   上游写的是 `window.OrbitApp.drawChartInto` / `.attachChartInteractions`。
  let getApp = () => null;

  'use strict';


  // 浮窗支持的目标。
  // ★ 球谐函数不在其中，而且**理由已经变了**：它原先是一个独立的 three.js 小场景
  //   （单例，没法"再画一份"），现已并入主三维视图 —— 也就是说它本身就占着主舞台，
  //   不需要再被"搬到三维旁边"（那正是浮窗存在的意义，见本文件开头）。
  //   下面那张 Θ/Φ 卡片也是普通 2D canvas，已按"讲 Y = Θ·Φ 两个因子时把它弹出来"接入。
  //
  // ★ 这里存的是**翻译键**而不是标题本身：TARGETS 是模块级常量，在这里取译文会把
  //   加载时的语言固化下来（切了语言标题还是旧语言）。真正取值在 open() / refreshChrome()。
  const TARGETS = {
    radial: { titleKey: 'orbit.overlay.title.radial' },
    section: { titleKey: 'orbit.overlay.title.section' },
    // ★ 标题照抄卡片上的原文（index.html 的 .card-title）—— 学生听到什么名字，
    //   就得在界面上找得到那个名字。
    thetaPhi: { titleKey: 'orbit.overlay.title.thetaPhi' },
  };

  let overlay = null, box = null, titleEl = null, canvas = null;
  let cur = null, rafId = null, interactionsBound = false;
  // ★ 记下两个按钮：它们的 title 是 t() 现取的（不是 DOM 里的中文原文），
  //   语言切换时扫描替换够不着，得由 refreshChrome() 重写。
  let miniBtnEl = null, closeBtnEl = null;

  function el(tag, cls) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    return d;
  }

  /** 惰性单例：只建一次，之后靠 .show 类开合（与 settings.js 的 overlay 同一套路） */
  function build() {
    if (overlay) return;
    box = el('div', 'chart-overlay-box');
    const head = el('div', 'chart-overlay-head');
    titleEl = el('span', 'chart-overlay-title');
    // ★ 第 12 条：浮窗原先只能关、不能挪 —— 而它靠右停靠，智能体抽屉也在右侧，
    //   于是"边听边看"直接变成"图盖住讲解文字"。补两个能力：最小化、拖动。
    const miniBtn = el('button', 'chart-overlay-x');
    miniBtn.type = 'button';
    miniBtn.textContent = '—';
    miniBtn.title = t('orbit.overlay.minimize');
    miniBtnEl = miniBtn;
    miniBtn.addEventListener('click', () => {
      box.classList.toggle('mini');
      miniBtn.textContent = box.classList.contains('mini') ? '▢' : '—';
      scheduleRedraw();
    });
    const closeBtn = el('button', 'chart-overlay-x');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.title = t('orbit.overlay.close');
    closeBtnEl = closeBtn;
    closeBtn.addEventListener('click', close);
    const btns = el('span', 'chart-overlay-btns');
    btns.appendChild(miniBtn);
    btns.appendChild(closeBtn);
    head.appendChild(titleEl);
    head.appendChild(btns);
    canvas = el('canvas', 'chart-overlay-canvas');
    box.appendChild(head);
    box.appendChild(canvas);
    overlay = el('div', 'chart-overlay');
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    bindDrag(head, miniBtn);

    // 只观察浮窗内容盒 —— **不要**观察 body（layout.js 里有自激循环的注释警告）
    if (window.ResizeObserver) {
      new ResizeObserver(scheduleRedraw).observe(box);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) close();
    });
  }

  /**
   * 拖标题栏移动浮窗（第 12 条）。
   *
   * ★ 一旦开始拖就把它转成 `position: fixed` 并写死 left/top：浮窗平时靠 flex 停靠
   *   （抽屉打开时停左、否则停右），如果继续用 flex 定位、只改 transform，那么每次
   *   `body.agent-open` 一变，停靠点就会跳，用户拖好的位置也跟着漂。
   *   转成 fixed 之后，位置只由 left/top 决定，与停靠规则彻底解耦。
   * ★ 落到视口外要夹回来：拖到屏幕边缘之外就再也抓不到了（没有"重置位置"的入口）。
   */
  function bindDrag(head, miniBtn) {
    let drag = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target === miniBtn || (e.target.closest && e.target.closest('button'))) return;
      const r = box.getBoundingClientRect();
      box.style.position = 'fixed';
      box.style.left = r.left + 'px';
      box.style.top = r.top + 'px';
      box.style.margin = '0';
      drag = { x: e.clientX, y: e.clientY, l: r.left, t: r.top, w: r.width, h: r.height };
      head.classList.add('dragging');
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      e.preventDefault();
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const nx = drag.l + (e.clientX - drag.x);
      const ny = drag.t + (e.clientY - drag.y);
      // 至少留 60px 在视口内，别拖出去就找不回来
      const maxX = window.innerWidth - 60, maxY = window.innerHeight - 40;
      box.style.left = Math.max(-(drag.w - 60), Math.min(maxX, nx)) + 'px';
      box.style.top = Math.max(0, Math.min(maxY, ny)) + 'px';
    });
    const end = (e) => {
      if (!drag) return;
      drag = null;
      head.classList.remove('dragging');
      try { head.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      scheduleRedraw();
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }

  /** rAF 合并重画：放大后 drawSection 会做 G² 次 psiDensity（G 随缩放升到 512），
   *  拖窗口时逐帧重算会明显卡顿 */
  function scheduleRedraw() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = null; redraw(); });
  }

  function redraw() {
    if (!cur || !canvas) return;
    const A = getApp();
    if (!A || !A.drawChartInto) return;
    A.drawChartInto(cur, canvas);
  }

  /**
   * 按当前语言重写浮窗上那几处 `t()` 现取的文字（标题 + 两个按钮的 title）。
   *
   * ★ 为什么不靠 `sweep()`：标题与 title 都是 `t()` 算出来再写进 DOM 的
   *   （`TARGETS` 存的是键），它们不是"DOM 里的中文原文"，扫描替换认不出来。
   * ★ 代价：只改三个属性/一个文本节点，**不重画 canvas**。
   */
  function refreshChrome() {
    if (titleEl && cur && TARGETS[cur]) titleEl.textContent = t(TARGETS[cur].titleKey);
    if (miniBtnEl) miniBtnEl.title = t('orbit.overlay.minimize');
    if (closeBtnEl) closeBtnEl.title = t('orbit.overlay.close');
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('langchange', function () {
      try { refreshChrome(); } catch (e) { /* 换语言时重写标题失败不该影响切换本身 */ }
    });
  }

  /**
   * 打开浮窗并切到指定图表。
   * @param {'radial'|'section'} target
   */
  function open(target) {
    if (!TARGETS[target] || !getApp()) return false;
    build();
    // ★ 标题**每次都重设**（原先只在换目标时设）：切过语言之后再打开同一张图，
    //   若不重设就会一直显示上一个语言的标题 —— 而这不报错。
    cur = target;
    titleEl.textContent = t(TARGETS[target].titleKey);
    refreshChrome();
    // 打开即展开：这是"要看这张图"的显式请求，不该只给学生一条标题栏。
    // （用户自己手动最小化的状态仍然保留 —— 那是他关掉再自己打开时的偏好。）
    box.classList.remove('mini');
    const mb = box.querySelector('.chart-overlay-btns .chart-overlay-x');
    if (mb) mb.textContent = '—';
    overlay.classList.add('show');
    // 截面图在浮窗里同样可缩放/平移（sectionView 是 charts.js 的模块状态，与卡片共用）。
    // 只绑一次 —— 重复绑定会让一次拖拽走两遍。
    const A2 = getApp();
    if (!interactionsBound && A2 && A2.attachChartInteractions) {
      interactionsBound = A2.attachChartInteractions('section', canvas, scheduleRedraw);
    }
    // 尺寸要等 .show 生效、布局完成之后才量得到，故走下一帧
    scheduleRedraw();
    return true;
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('show');
    cur = null;
  }

  function isOpen() {
    return !!(overlay && overlay.classList.contains('show'));
  }

  /**
   * 注入宿主依赖（见文件顶部说明）。
   * 参数缺省时**保持原值**——分步注入时不该把没提到的项清掉。
   */
  function configure(d) {
    d = d || {};
    if (typeof d.getApp === 'function') getApp = d.getApp;
  }

  return {
    configure,
    open: open,
    close: close,
    isOpen: isOpen,
    target: () => cur,
    redraw: scheduleRedraw,
    TARGETS: TARGETS,
  };
})();

export { ChartOverlay }
export default ChartOverlay
