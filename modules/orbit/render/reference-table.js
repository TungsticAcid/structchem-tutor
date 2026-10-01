/**
 * reference-table.js（orbit 模块 · 页面功能）
 *
 * 参考表弹层（查表用）。**自包含**——不引用任何跨文件全局。
 *
 * ★ 来自上游 `orbit/H5/js/agent/reference-table.js`：它放在 agent/ 下，
 *   但只是页面上的一块 UI（同理见 state-editor.js 的说明）。
 */
/**
 * reference-table.js — 教材对照表（R 表 / Y 表）
 *
 * 与动态公式【互补而非替代】：
 *   · 动态公式随 (n,l,m) 变化、支持按项高亮（三向联动的基础）
 *   · 教材表是完整对照表、采用教材惯例形式（含核电荷 Z、显式闭式系数）
 * 呈现上遵守"主打优先"原则：默认收起，展开才占空间；智能体可主动调出。
 *
 * 本模块依赖 assets/ref/ 下的两张表格图片，这两张图**未随仓库分发**
 * （静态资源的取舍见 .gitignore）。图片缺失时面板给出说明而不是裂图。
 */
// ★ 字典的副作用 import：TABLES 的标题/说明都走 t() 现取（它们是 img.alt 与
//   textContent，不是 DOM 里原样写死的中文，扫描替换够不着）。
import '../i18n.js'
import { t } from '../../../packages/i18n/index.js'

const ReferenceTable = (function () {
  'use strict';

  const TABLES = {
    R: {
      src: 'assets/ref/R-table.jpg',
      title: 'orbit.reftable.R.title',
      source: 'orbit.reftable.R.title',
      note: 'orbit.reftable.R.note',
    },
    Y: {
      src: 'assets/ref/Y-table.jpg',
      title: 'orbit.reftable.Y.title',
      source: 'orbit.reftable.Y.title',
      note: 'orbit.reftable.Y.note',
    },
  };

  let panel = null;

  function build() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'reftable-panel';
    panel.innerHTML =
      '<div class="reftable-head">' +
      '  <span class="reftable-title">教材对照表</span>' +
      '  <div class="reftable-tabs">' +
      '    <button class="seg-btn" data-t="R">R 表</button>' +
      '    <button class="seg-btn" data-t="Y">Y 表</button>' +
      '  </div>' +
      '  <button class="agent-tbtn reftable-close">✕</button>' +
      '</div>' +
      '<div class="reftable-note"></div>' +
      '<div class="reftable-body">' +
      '  <img class="reftable-img" alt="" />' +
      '  <div class="reftable-fallback hidden"></div>' +
      '</div>';

    panel.querySelector('.reftable-close').onclick = hide;
    panel.querySelectorAll('.reftable-tabs .seg-btn').forEach(function (b) {
      b.onclick = function () { show(b.getAttribute('data-t')); };
    });
    // 点击图片放大（降级状态下图片是隐藏的，此时不该触发）
    panel.querySelector('.reftable-img').onclick = function () {
      const img = panel.querySelector('.reftable-img');
      if (img.classList.contains('hidden') || !img.naturalWidth) return;
      const ov = document.createElement('div');
      ov.className = 'reftable-zoom';
      const big = document.createElement('img');
      big.src = img.src;
      ov.appendChild(big);
      ov.onclick = function () { document.body.removeChild(ov); };
      document.body.appendChild(ov);
    };

    // 挂在公式卡片内（默认收起时不占空间）
    const host = document.querySelector('.formula-card') || document.body;
    host.appendChild(panel);
    return panel;
  }

  function show(which) {
    const p = build();
    // ★ 局部变量不叫 `t`：本模块的 `t` 是 i18n 的取值函数，同名会把译文取值弄坏。
    const tb = TABLES[which] || TABLES.R;
    p.querySelectorAll('.reftable-tabs .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-t') === which);
    });
    p.querySelector('.reftable-note').textContent = tr(tb.note);

    const img = p.querySelector('.reftable-img');
    const fb = p.querySelector('.reftable-fallback');
    // ★ 图片不存在时**不能甩一个裂图**——别人克隆仓库后打开这个面板，
    //   看到的第一眼就是它。给一句说明 + 去哪查的指引。
    //   注意：onerror 必须在设 src **之前**挂好，否则回调来不及接上。
    img.onerror = function () {
      img.classList.add('hidden');
      fb.classList.remove('hidden');
      fb.innerHTML =
        '<div class="reftable-fb-title">本仓库未包含这两张表格图片</div>' +
        '<div class="reftable-fb-body">' +
        '请查阅结构化学教材中对应的 <b>' + escapeText(tr(tb.source)) + '</b>。<br>' +
        '本项目参照的书目见仓库 README 的「参考书目」章节。' +
        '</div>';
    };
    img.onload = function () {
      img.classList.remove('hidden');
      fb.classList.add('hidden');
    };
    img.classList.remove('hidden');
    fb.classList.add('hidden');
    img.alt = tr(tb.title);
    img.src = tb.src;
    p.classList.add('show');
    p.dataset.current = which;
  }

  /** 取译文：TABLES 里存的是**键**（见文件顶部说明），真正取值在用的那一刻 */
  function tr(key) { return t(key) }

  /**
   * 语言切换后重写面板上那几处现取的文字。
   * ★ 面板若开着，说明与 alt 都是 t() 写进去的，扫描替换够不着；
   *   ★ 顺带重挂一次 onerror 也没必要 —— 换一次说明即可，路径不变。
   */
  function refreshChrome() {
    if (!panel || !panel.classList.contains('show')) return;
    const which = panel.dataset.current || 'R';
    const tb = TABLES[which] || TABLES.R;
    panel.querySelector('.reftable-note').textContent = tr(tb.note);
    panel.querySelector('.reftable-img').alt = tr(tb.title);
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('langchange', function () {
      try { refreshChrome(); } catch (e) { /* 换语言时重写参考表失败不该影响切换本身 */ }
    });
  }

  function escapeText(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function hide() { if (panel) panel.classList.remove('show'); }

  /** 由动作 showReferenceTable 调用 */
  function toggle(p) {
    if (p && p.which) {
      if (p.open === false && (!panel || panel.dataset.current === p.which)) return hide();
      return show(p.which);
    }
    if (panel && panel.classList.contains('show')) hide();
    else show('R');
  }

  return { toggle, show, hide };
})();

export { ReferenceTable }
export default ReferenceTable
