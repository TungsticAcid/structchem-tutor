/**
 * orbit.js —— 原子轨道的页面（壳里的一页）
 *
 * ★ 本文件是**上游 `orbit/H5/js/main.js` 的忠实移植**（1505 行）。
 *   与对称页同一条理由：手写一遍必然丢功能（用户那句「对称性功能少了好多」就是教训）。
 *   这里只做三处必要改造：
 *     ① IIFE → `bootOrbitPage(deps)`，可随路由反复挂载/卸载
 *     ② 跨文件全局引用（Charts / Orbit3D / Formula / OM / Sched / StateEditor …）→ import
 *     ③ **反向依赖收口**：上游靠 `window.OrbitApp` 互抓，现在改由页面注入给
 *        Orbit3D / ChartOverlay / StateEditor；facade 通过 `deps.onReady` 交给壳
 *
 * ★ 页面与模块的分界：**这里只放「看得见摸得着」的东西**（DOM、控件、事件）。
 *   智能体要用的动作词汇表与工具在 `modules/orbit/`。
 */

import { ORBIT_HTML } from './orbit-markup.js'
// KaTeX 是懒加载的（277 KB）；本页首帧可能还没到，故要用它的加载器做补画
import { loadKatex } from '@core/ui/katex-loader.js'
/**
 * 宿主 i18n（`@i18n` 是 vite 别名；**字典文件**才走相对路径 —— 守卫要在 Node 里 import 它）。
 *
 * ★ 为什么是 `hostT` 而不是 `t`：本文件里 `t` 这个名字**已被多处局部变量占用**
 *   （`const t = state.terms || []`、`const t = p.target`、`for (const t of x)`）。
 *   `import { t }` 不会报错，但那些作用域里的 `t(...)` 会打到数组/字符串上 ——
 *   静默失效或抛异常。别名之后一眼能看出"这是宿主的翻译函数"，
 *   与轨道模块自己的文案表（modules/orbit/i18n.js）也不是一回事。
 */
import { t as hostT } from '@i18n/index.js'

// 视口自适应：算出 --viewer-h / --panel-h（见 packages/ui-kit/viewport.js）
import { createViewport } from '@ui-kit/viewport.js'
// ★ 主题变更订阅：二维图表的颜色画在像素里，必须靠它重画（见 bootOrbitPage 里那处注释）
import { onThemeChange } from '@ui-kit/theme.js'
import { OM } from '@modules/orbit/core/math.js'
// 等价轨道集合（sp³/sp²/sp）的唯一定义 —— 与动作词汇表、渲染层共用
import { Hybrids } from '@modules/orbit/core/hybrids.js'
import { Sched } from '@modules/orbit/core/sched.js'
import { Formula } from '@modules/orbit/core/formula.js'
import { Orbit3D } from '@modules/orbit/render/render3d.js'
import { Charts } from '@modules/orbit/render/charts.js'
import { ChartOverlay } from '@modules/orbit/render/chart-overlay.js'
import { StateEditor } from '@modules/orbit/render/state-editor.js'
import { ReferenceTable } from '@modules/orbit/render/reference-table.js'
// ★ 同屏轨道条数的上限**只此一份**：动作层（模型下发）与界面（「＋」按钮）共用它。
//   两处各写一个数的必然结局是漂开，而漂开的症状是"模型加不上去、用户却能一路加到冻死"。
import { MAX_MULTI_ORBITALS } from '@modules/orbit/actions.js'

/**
 * main.js — 主控制器：绑定 UI、管理状态、节流重绘
 *
 * 数据流：控件 change → readState() 收窄/夹紧量子数 → recompute()
 *        → 更新 3D（粒子云或等值面）→ 更新 2D 图表 → 更新 KaTeX 公式。
 * 交互：滑块用 120ms 防抖；分段按钮即时重算。
 */
/**
 * 启动页面逻辑（上游 main.js 的正文）。
 *
 * @param {Object}   [deps]
 * @param {Element}  [deps.root]  页面容器（markup 已注入其中）
 * @param {Object}   [deps.panel] 智能体面板（量子态编辑器发提示要用 addChip）
 * @returns {{facade:Object, dispose:Function}}
 */
export function bootOrbitPage(deps = {}) {
  // ★ 上游在这里写 `'use strict';`（它是 IIFE，参数列表是空的）。
  //   改成 `bootOrbitPage(deps = {})` 之后，**默认参数属于"非简单参数列表"**，
  //   再写 use strict 指令会直接语法报错（"Illegal 'use strict' directive in
  //   function with non-simple parameter list"）。ESM 本来就是严格模式，删掉即可。

  // ★ 页面根：`$` 优先在它里面找，找不到才回落 document。
  //   上游是整页脚本，`document.querySelector` 天经地义；进了统一壳之后，
  //   别的页面或智能体面板也可能有同名 id——先在页面内找是更稳的默认。
  const root = (deps && deps.root) || null;

  // ---- 状态 ----------------------------------------------------------------
  const state = {
    // ★ 核电荷数 Z（类氢）：Z=1 氢原子、2 氦离子 He⁺、3 锂离子 Li²⁺。
    //   类氢与氢只差一条标度关系（r → r/Z、E ∝ Z²），角度部分与 Z 无关 ——
    //   所以引入 Z 没有改变任何公式的形状，只是把"这个原子带几份核电荷"接进来。
    Z: 1,
    n: 3, l: 1, m: 0,
    // ★ 三维里"看什么"：'wave' = 完整波函数 ψ（等值面 / 粒子云）；
    //   'spherical' = 角度部分 Y 的球谐曲面。两者在 render3d.js 里是**两套几何**
    //   （ψ 走标量场 + marching tetrahedra，Y 走极坐标曲面直接三角化），所以切档
    //   不是换个着色，而是换一条重建路径，且各自有各自的取景尺度。
    viewTarget: 'wave',
    mode: 'real',            // 'real' | 'complex'
    renderMode: 'surface',   // 'points' | 'surface'（默认等值面）
    // ★ 这里原先有 colorMode 字段（「三维着色」开关）。用户第 5 条把那个开关删了 ——
    //   着色不是独立选项，而是**判据的推论**（画 |ψ|² 就没有正负可谈）。
    //   现在由 deriveColorMode() 现算，不进 state、不进任何快照。
    // ★ 下面两个都是**首帧就被覆盖的初值**，不是"默认值"的来源 —— 别在这里找默认：
    //   · level —— 首帧 recompute() 里 readFromControls() 先从 #levelSlider 读进来，
    //     紧接着 applyRecommendedLevel() 又按**当前轨道的推荐阈值**改写（见该函数）。
    //     所以首屏真正显示的阈值是"3p 在当前判据下的推荐值"，不是这个字面量。
    //     （推荐算法为什么取"最弱壳峰值的 40%"见 recommendedLevelRaw 的说明。）
    //   · psiCrit —— 首帧由 #psiSeg 上带 active 的那个按钮决定。
    //   结论：**改默认要改 index.html 的 DOM**。这里写的只是"DOM 读不到"时的兜底。
    level: 0.21787703073446649,   // 等值面阈值（占峰值的比值）＝ 3p 在 ψ 判据下的推荐值
    psiCrit: 'psi',               // 等值面判据：'psi' 按 |ψ| 计 | 'psi2' 按 |ψ|² 计
    pointCount: 50000,
    plane: 'xz',             // 截面平面
    sectionMode: 'intensity',// 'intensity' | 'phase' | 'contour'
    angWhich: 'Y',           // 球谐档判据：'Y' | 'Y2'（球谐曲面画 |Y| 还是 |Y|²）
    radial: ['R', 'R2', 'D'],   // D² 已移除（零点与峰值和 D 完全相同，见 charts.js 的说明）
    // ★ 叠加态（辅助功能）：terms 为空时退化为单一本征态 ψ_{n,l,m}
    terms: [],               // [{n,l,m,mode,c:{re,im}}]
    relPhase: 0,             // 相对相位 φ（≠ 真实时间，见方案 §5.3）
    // ★ 2D 图表画哪一份（第 G 批）：'super' = 叠加态整体（**只有截面图支持** ——
    //   Θ/Φ 卡与径向分布画不了叠加态，Σcᵢψᵢ 未必能因子化出角度部分），
    //   0/1/2… = 叠加态中的第 i 个分量。没有叠加态时这个字段不起作用（画滑块上的纯态）。
    chartTerm: 'super',
    // ★ 轨道模型（2026-10-01）：'hydrogenic'（真实类氢，**默认**）| 'slater'（Slater 型 / STO）。
    //   两者都是真实的物理模型，差别在**径向有没有节点**：
    //   · 氢型 2s 在 r≈2a₀ 有径向节点 → sp³ 的等值面外层干涉反向、形状与教材不同
    //   · STO 的径向形式是 r^(n−1)e^(−ζr)，2s 与 2p **共用** → 剩下纯角度形状 = 教材那个瓣
    //   默认氢型是为了与知识条目里"2s 有一个径向节点"的表述一致。
    // 多轨道同屏。档位：'off' 关闭 · 'sp3'/'sp2'/'sp' 预设集合 · 'custom' 自定义列表。
    // ★ orbitalVisible 由 state 持有、轨道清单只是它的渲染视图 —— 那一行是按
    //   当前集合**生成**的（sp³ 四个、sp² 三个），生成之前没有 DOM 可读。
    //   **只对预设档有意义**：自定义档的显隐逐个记在 orbitals[i].visible 上。
    orbitalSet: 'off',
    orbitalVisible: [],
    /**
     * 自定义同屏里的**额外**轨道（**不含**主轨道），任意数量。
     *
     * ★ 主轨道为什么不在这里：主轨道被定义为"页面当前正在编辑的那个"（n/l/m 或叠加态）。
     *   把它也塞进数组，用户拖一下滑块就会出现两种选择，两种都错：
     *     ① 数组里那份冻结的不变 → 画面与滑块对不上（**画面在说谎**，且不报错）；
     *     ② 跟着滑块变 → 数组里用户选的颜色/标签被悄悄改掉。
     *   分开之后语义是干净的：主轨道跟随编辑，额外轨道是用户"按 + 钉住"的副本。
     *
     * ★ 每项是**冻结副本**：{ key, label, color:[r,g,b], visible, terms, n, l, m, mode, mode_real }。
     *   terms 非空表示这一项本身是个叠加态（"任意类型轨道"里就包含它）。
     */
    orbitals: [],
    /** 自定义档里主轨道的颜色（null = 还没定过，用调色板第一色） */
    orbitalMainColor: null,
    orbitalMainVisible: true,
    /**
     * 预设档下**逐项改过的颜色**：{ 'sp3-2': [r,g,b], … }。
     *
     * ★ 为什么预设档不能像自定义档那样直接记在 items 上：预设的条目是 `multiRenderSpec()`
     *   现从 `Hybrids` 展开的，**不进 state**（这样 `set: 'sp3'` 与 Hybrids 的定义
     *   永远只有一份真源）。所以用户的改动需要一个覆盖层，而不是去改那份定义。
     */
    orbitalColorOverride: {},
    orbitalSeq: 0,           // 生成稳定 key 用的自增序号（key 要跨重建稳定，不能用数组下标）
    orbitalModel: 'hydrogenic',
    orbitalZeta: null,       // STO 的 ζ；null = 用 Z/n（想用 Slater 规则的值就直接填）
  };
  let lastFieldKey = null;
  let lastMultiKey = null;      // 上次下发给 render3d 的多轨道规格（避免逐帧重建克隆）
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  // ---- DOM ----------------------------------------------------------------
  const $ = (s) => ((root && root.querySelector(s)) || document.querySelector(s));
  const els = {
    zSlider: $('#zSlider'), zInput: $('#zInput'),
    nSlider: $('#nSlider'), nInput: $('#nInput'),
    lSlider: $('#lSlider'), lInput: $('#lInput'),
    mSlider: $('#mSlider'), mInput: $('#mInput'), mSet: $('#mSet'),
    realOrbSet: $('#realOrbSet'), realOrbSeg: $('#realOrbSeg'), realOrbHint: $('#realOrbHint'),
    levelSlider: $('#levelSlider'), levelInput: $('#levelInput'), levelSet: $('#levelSet'), psiHint: $('#psiHint'),
    psiCritSet: $('#psiCritSet'), psiSeg: $('#psiSeg'),
    orbZetaSet: $('#orbZetaSet'), orbZetaInput: $('#orbZetaInput'), orbModelHint: $('#orbModelHint'),
    multiListSet: $('#multiListSet'), multiList: $('#multiList'), multiAddBtn: $('#multiAddBtn'),
    multiHint: $('#multiHint'),
    pointCountSlider: $('#pointCountSlider'), pointCountInput: $('#pointCountInput'), pointSet: $('#pointSet'),
    thetaPhiChart: $('#thetaPhiChart'),
    targetSeg: $('#targetSeg'), yCritSet: $('#yCritSet'),
    yCritSeg: $('#yCritSeg'), yCritHint: $('#yCritHint'),
    orbitTitle: $('#orbitTitle'), modeBadge: $('#modeBadge'),
    formulaTitle: $('#formulaTitle'), formulaBox: $('#formulaBox'), formulaNote: $('#formulaNote'),
    radialChart: $('#radialChart'), sectionChart: $('#sectionChart'), sectionCard: $('#sectionCard'),
    viewer: $('#viewer'),
  };

  // ---- 通用工具 ------------------------------------------------------------
  function activeValue(segId, attr) {
    const active = $(segId + ' .seg-btn.active');
    return active ? active.getAttribute(attr) : null;
  }
  function setActive(btn) {
    const seg = btn.parentElement;
    seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  }
  // 单选分段按钮组
  function bindSeg(segId, attr) {
    $(segId).addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      setActive(btn);
      readFromControls();
      recompute();
    });
  }

  // ---- 从控件读取（并夹紧） -------------------------------------------------
  // 同步依赖滑块的范围：l 上限随 n，m 范围随 l；超界立即夹紧。
  // 在滑块 input 时立即调用，避免"值超过旧上限被浏览器预夹紧再更新范围"的时序问题。
  function syncRanges() {
    const n = +els.nSlider.value;
    const maxL = Math.min(n - 1, 5);
    els.lSlider.max = maxL;
    els.lInput.max = maxL;
    if (+els.lSlider.value > maxL) els.lSlider.value = maxL;
    const l = +els.lSlider.value;
    els.mSlider.min = -l;
    els.mSlider.max = l;
    els.mInput.min = -l;
    els.mInput.max = l;
    if (+els.mSlider.value > l) els.mSlider.value = l;
    if (+els.mSlider.value < -l) els.mSlider.value = -l;
    // 滑块是唯一真值来源；数字框只是它的另一种呈现
    els.nInput.value = n;
    els.lInput.value = l;
    els.mInput.value = els.mSlider.value;
    els.zInput.value = els.zSlider.value;      // Z 的范围固定 1–3，不随 n/l/m 变，回写即可
    [els.nInput, els.lInput, els.mInput, els.zInput].forEach((el) => el.classList.remove('invalid'));
  }

  /**
   * 实轨道选择器：按当前 l 列出该支壳层的全部实轨道。
   *
   * ★ 为什么实档不用 m 滑块：m 是**复**球谐 Y_l^m 的本征值指标，而实数解由 ±m 两个
   *   复解线性组合而来，**不再是 L̂z 的本征函数**（这是量子力学的基本事实）。用它给实轨道当名字，
   *   等于把一个它不再拥有的量子数贴上去。所以实档直接选"哪个实轨道"，按钮上的字
   *   就是它的名字（p_x、d_{xy}、f_{z³}…）；g、h 没有公认名，改用直角坐标多项式。
   *
   * 顺序取化学惯例 m = 0, +1, −1, +2, −2, …（cos 型在前、sin 型在后）。
   * 只在 l 变化时重建按钮，其余只同步选中态 —— 重建会打断点击反馈与键盘焦点。
   */
  let realOrbL = -1;
  /** 阈值扫描的 rAF 句柄（同一时刻只允许一条扫描在跑） */
  let levelSweepRaf = null;
/** 主题变更的退订函数（dispose 时必须调，否则页面卸载后仍会重画到已销毁的画布上） */
let offTheme = null;
  function syncRealOrbitButtons() {
    const l = state.l;
    if (l !== realOrbL) {
      realOrbL = l;
      const order = [0];
      for (let mm = 1; mm <= l; mm++) { order.push(mm, -mm); }
      els.realOrbSeg.innerHTML = order.map(function (mm) {
        const named = !!Formula.realOrbitalName(l, mm);
        // ★ 用 HTML 版：l≥4 的标签是直角坐标多项式（含 x^{4} 这类记号），
        //   直接塞纯文本会原样显示成 "x^{4}"。
        return '<button class="seg-btn" data-m="' + mm + '"' +
          // ★ 这里走 hostT 而不是进 text 表：这个 title 是**跨字面量拼接**的属性
          //   （`'…"' + ' title="…"' + '>'`），守卫的标签扫描器看不到整条标签，
          //   会把 `" title="中文"` 这样的带语法残片当成原文报出来。走键之后
          //   守卫看得见真实原文，运行时也拿得到译文。
          (named ? '' : ' title="' + hostT('pages.orbit.realOrbNoName') + '"') +
          '>' + Formula.realOrbitalLabelHtml(l, mm) + '</button>';
      }).join('');
      // 没有惯用名的支壳层给一句说明，否则学生会以为程序忘了起名
      els.realOrbHint.textContent = (l >= 4)
        ? '这一支壳层没有公认的惯用名（高角动量轨道在文献里只按对称性分类），'
          + '故用角度部分的直角坐标多项式标记。'
        : '';
    }
    const btns = els.realOrbSeg.querySelectorAll('.seg-btn');
    for (let i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', +btns[i].dataset.m === state.m);
    }
  }

  /**
   * 切换「视图对象」的连带规则（第 9 条）：**球谐档没有叠加态可言**。
   *
   * ★ 理由：叠加态描述的是**完整波函数** ψ = Σcᵢψᵢ，而球谐曲面画的是**角度部分** Y。
   *   render3d 在球谐档只拿 l/m/mode 去画（见 updateViewer 的 sph 分支），各分量的 n
   *   被整块丢弃 —— 二者只有在各分量 n 相同时才能对上，而内置预设 ψ_1s+ψ_2s 恰恰是
   *   n 不同的那一类。保留叠加态就会出现"三维画着某个单一 l 的曲面、公式却写着多分量
   *   叠加"的当场矛盾。故切到球谐档即清掉叠加态（与"拖 n/l/m 自动退出"同一层保护），
   *   并把量子态入口收起来。
   * ★ 切回波函数档**不自动恢复** —— 那是有意的（叠加态已被清空），界面上写明了。
   */
  function applyViewTargetRules() {
    const sph = (activeValue('#targetSeg', 'data-target') || 'wave') === 'spherical';
    if (sph) exitSuperposition();
    if (StateEditor && StateEditor.setAvailable) StateEditor.setAvailable(!sph);
  }

  /**
   * 三维着色 —— **由判据推导**，不再是一个独立开关（用户第 5 条把那个开关删掉了）。
   *
   * ★ 为什么可以推导：着色回答的是"用什么颜色编码这个标量场"，而**判据已经决定了
   *   标量场是什么** —— 画 |ψ|² 时函数处处非负，本就没有正负可谈；画 ψ（或 Y）
   *   时才谈得上符号。原先两者各是一个开关，于是制造出"看不见的选项决定可见画面"：
   *   判据按钮只在等值面档显示，而电子云档的颜色照样由它决定。
   *
   *   判据**非平方** + **实数解** → 'phase'（按 sign 双色）
   *   其余一切情况（任何复数解、判据为平方时） → 'orbital'（支壳层纯色）
   *
   * ★ 复数解永远纯色：复解的 arg ψ 是绕 z 轴**连续缠绕**的，不是两个值 ——
   *   用"双色"去编码它只能编出两个值，是错的。（原先那圈"彩虹"随开关一并去掉。）
   * ★ s 轨道**不特判**：1s 的 ψ 处处为正，按 sign 着色自然得到纯色；
   *   而 2s/3s 有径向节点、ψ 确实变号，那时内外壳异色是**物理**（与 4p 三层壳同一个
   *   现象），不该因为"它是 s 轨道"就压掉。
   *
   * @returns {'orbital'|'phase'} 供 render3d / math / charts 消费（它们的形参保持不变）
   */
  function deriveColorMode() {
    const sph = (state.viewTarget === 'spherical');
    const crit = sph ? state.angWhich : state.psiCrit;
    const squared = sph ? (crit === 'Y2') : (crit === 'psi2');
    return (!squared && state.mode === 'real') ? 'phase' : 'orbital';
  }

  /**
   * 球谐判据（|Y| / |Y|²）的提示与可用性 —— **按 l 变**。
   *
   * ★ 第 6 条：这段提示原先写死成"|Y|² 的曲面比 |Y| 的瘦（教材所谓"相切的鸡蛋"）"，
   *   而"两个相切的球面/鸡蛋"是 **p 轨道（l=1）** 才有的形状。l=0 的学生看到的是一个
   *   球，却被告诉"这是相切的鸡蛋"—— 说明文字与眼前的图形当场矛盾。
   *   l=0 时 Y 是常数，|Y| 与 |Y|² 只差一个正的比例因子，两个判据画出来一模一样，
   *   所以按钮一并禁用（留着能点却毫无变化，比没有更糟）。
   */
  function syncYCritHint() {
    if (!els.yCritHint || !els.yCritSeg) return;
    const l = state.l;
    const degenerate = (l === 0);
    els.yCritSeg.querySelectorAll('.seg-btn').forEach((b) => { b.disabled = degenerate; });
    // ★ 只留**必要且两档都成立**的一句：原先 l≥1 时写的是"两个相切的球面变成两个相切的椭球"，
    //   而那是**实数解**才有的形状（复数解画出来是绕 z 轴的旋转体，不是相切的蛋）。
    //   具体形状留给智能体按学生提问去讲，面板上不铺陈。
    // ★ 用 innerHTML：l 与 Y 是变量 / 函数名，要斜体（用户第 5 条）。
    els.yCritHint.innerHTML = degenerate
      ? '<i>l</i> = 0 时 <i>Y</i> 是常数，两个判据画出来是同一个球面。'
      : '判据换成平方后，节面位置不变，只是曲面整体收缩。';
  }

  /**
   * 「等值面判据」两个按钮的**文案**随波函数形式变（第 4 条）。
   *
   *   实数解 → 「|ψ|²」「ψ」：实函数本身带符号，那个绝对值竖线是多余的 ——
   *            而且竖线会误导（看起来像"模"这个只在复函数里才有的操作）。
   *   复数解 → 「|ψ|²」「|ψ|」：复函数的非平方判据**就是模**，竖线是实质信息。
   *
   * ★ 同一组按钮在两个子档下叫法不同，不是笔误：它们指的本来就是两个量。
   * ★ 用 innerHTML 改而不是 textContent：ψ 是函数名，按数学排版惯例要**斜体**
   *   （用户第 5 条：判据按钮里的 ψ 与 Y 都没有斜体）。
   * ★ 按钮上的字要跟着 mode 走，而 mode 有三条改动路径（界面点击、智能体动作、
   *   restoreState 回退），在 updateViewer 里每次重算时同步一次最省事、也不会漏。
   */
  let lastPsiCritMode = null;
  function syncPsiCritLabels() {
    if (!els.psiSeg || state.mode === lastPsiCritMode) return;
    lastPsiCritMode = state.mode;
    const btns = els.psiSeg.querySelectorAll('.seg-btn');
    if (btns.length < 2) return;
    const cx = (state.mode === 'complex');
    btns[0].innerHTML = '|<i>ψ</i>|²';
    btns[0].title = '画 |ψ|² 的等值面。函数处处非负，没有正负可谈 —— 曲面为**纯色**。';
    btns[1].innerHTML = cx ? '|<i>ψ</i>|' : '<i>ψ</i>';
    btns[1].title = cx
      ? '画 |ψ| 的等值面。复函数的非平方判据是**模**，取模后相位信息消失 —— 曲面为纯色。'
      : '画 ψ 本身的等值面（有正负）。实解在此**双色**（按 ψ 的正负），'
        + '径向与角度节点的符号翻转都会显示出来。';
  }

  /**
   * 轨道模型控件的界面同步：ζ 输入行的显隐 + 提示文案。
   *
   * ★ 为什么要单抽一个函数：Slater 档才需要 ζ，而"现在是哪一档"有三条改动路径
   *   （界面点击、智能体动作、restoreState 回退）。把它挂在 `readFromControls` 上
   *   （每次 recompute 都经过）就只剩一个同步点——不会出现"动作已经切到 Slater 了、
   *   ζ 输入框还藏着"，那类不同步既不报错也不好复现。
   * ★ 提示文案里把**当前生效的 ζ** 写出来（自动时是 Z/n）：ζ 是 Slater 型唯一的参数，
   *   不显示它，用户就分不清"我填了没生效"和"本来就是自动的"。
   */
  function syncOrbModelUI() {
    const slater = (state.orbitalModel === 'slater');
    if (els.orbZetaSet) els.orbZetaSet.style.display = slater ? '' : 'none';
    if (!els.orbModelHint) return;
    if (!slater) {
      els.orbModelHint.innerHTML = '氢型：真实类氢（拉盖尔多项式）。2s 在 <i>r</i> = 2<i>a</i>₀ 处有径向节点';
      return;
    }
    const auto = (state.orbitalZeta == null);
    const zeta = auto ? (state.Z || 1) / (state.n || 1) : state.orbitalZeta;
    els.orbModelHint.innerHTML = 'Slater 型：<i>R</i> ∝ <i>r</i><sup><i>n</i>−1</sup>'
      + '<i>e</i><sup>−<i>ζr</i></sup>，2s 与 2p 径向相同、无节点；'
      + '<i>ζ</i> = ' + (+zeta.toFixed(4)) + (auto ? '（= <i>Z</i>/<i>n</i>）' : '（手工）');
  }

  /**
   * 多轨道同屏控件的界面同步：复选框行（按集合生成）+ 提示文案。
   *
   * ★ 清单行是**生成**的（预设四个/三个、自定义任意多个），故用 `multiListBuiltFor`
   *   记住它是为哪份清单建的；清单没变就不重建 —— 重建会丢掉正在拖动的取色器。
   * ★ 点击**不直接改画面**，只改 state 再 recompute：与其余控件同一套数据流，
   *   于是"模型改了状态、界面没跟上"这一整类不同步在这里也不会发生。
   */
  const MULTI_HINT = {
    off: '开启后，一组等价轨道同时显示，每个一个颜色',
    // ★ 「数量不限」是**假话**：动作层与界面都卡在 MAX_MULTI_ORBITALS（12）上
    //   （见上面的 `full` 判断）。这里写死 12 与那个常量同值 —— 改一处要一起改；
    //   写"不限"会让用户加到第 13 条时以为程序坏了。
    custom: '自定义同屏：点「＋ 加入当前轨道」把此刻这个轨道（<b>纯态或叠加态都行</b>）'
      + '钉进画面，再改量子数继续加（<b>最多 12 条</b>），每行都能单独改色与显隐',
    sp3: '四个等价 <i>sp</i>³：指向<b>正四面体</b>，两两 109.47°',
    sp2: '三个等价 <i>sp</i>²：<b>共面</b>、互成 120°',
    sp: '两个等价 <i>sp</i>：成 <b>180°</b> 直线型',
  };
  let multiListBuiltFor = null;
  let multiListTimer = 0;   // 「生成中…」的低频轮询（额外轨道是排队建的）
  /** 已经轮询了多少轮（600ms 一轮）—— 用来给"真的抽不出曲面"设一个上限 */
  let multiPollRounds = 0;
  /** 轮询上限（600ms × 300 = 3 分钟） */
  const MULTI_POLL_MAX = 300;
  /** 超过这么多轮还没顶点，就不再假称"生成中"，改说"未生成"（50 轮 ≈ 30 秒） */
  const MULTI_POLL_GIVEUP = 50;

  /**
   * 渲染"同屏轨道"清单：每一行 = 一个轨道（色块 / 名字 / 显隐 / 移除）。
   *
   * ★ 预设档与自定义档**共用这一个清单**，不再各做一套控件。两套的失效方式不一样
   *   （预设那套是下标、自定义是 key），而"两套各写一遍"必然有一边漏掉某个功能 ——
   *   比如只给自定义档做配色，预设档就只能看不能改色。
   */
  function syncMultiUI() {
    const setId = state.orbitalSet;
    const custom = (setId === 'custom');
    const def = (custom || setId === 'off') ? null : Hybrids.set(setId);
    const show = !!(def || custom);
    if (els.multiListSet) els.multiListSet.style.display = show ? '' : 'none';
    if (els.multiAddBtn) {
      // ★ 界面这条路也要有上限，而且要与动作层**同一个数**：直接 import 那个常量，
      //   不在页面里另写一个 12。两处各写一个数的必然结局是它们会漂开，
      //   而漂开的症状是"模型加不上去、用户却能一路加到页面冻死"。
      const full = state.orbitals.length >= MAX_MULTI_ORBITALS;
      els.multiAddBtn.disabled = full;
      // ★ 带变量的提示（上限 / 现有条数）必须走 t()：扫描替换按"整段文本"匹配，
      //   而这里每改一次数字就是一条新原文，列不完。
      els.multiAddBtn.title = full
        ? hostT('pages.orbit.multiAddFull', { max: MAX_MULTI_ORBITALS, n: state.orbitals.length })
        : hostT('pages.orbit.multiAddHint');
    }
    if (els.multiHint) {
      let html = MULTI_HINT[custom ? 'custom' : setId] || MULTI_HINT.off;
      // ★ 氢型下必须点破一件事：STO 与类氢的 sp³ 在**低阈值**下都是"胖"的
      //   （前瓣张角正好是 109.47°、后瓣 70.53°，两个连在一起近似球），
      //   四个叠在一起看着就是四个球 —— 用户会以为"杂化根本没画出来"。
      //   这不是 bug，是这两个模型的等值面在低阈值下本来就长这样；
      //   换成 Slater 型形状会干净得多（2s 与 2p 共用径向因子、无径向节点）。
      if ((def || custom) && state.orbitalModel === 'hydrogenic') {
        html += '　<span class="multi-tip">氢型下四个瓣会叠成球状 —— '
          + '<a href="#" data-model="slater">切到 Slater 型</a>形状最干净。</span>';
      }
      els.multiHint.innerHTML = html;
      const tipLink = els.multiHint.querySelector('a[data-model]');
      if (tipLink) {
        tipLink.addEventListener('click', (ev) => {
          ev.preventDefault();
          ACTIONS.setOrbitalModel({ model: tipLink.getAttribute('data-model') });
          recompute();
        });
      }
    }
    if (!els.multiList) return;
    const sig = setId + '|' + (state.orbitals.map(function (o) {
      return o.key + o.visible + rgbToHex(o.color) + o.label;
    }).join(',')) + '|' + state.orbitalVisible.join(',')
      + '|' + state.orbitalMainVisible + '|' + rgbToHex(state.orbitalMainColor || ORB_PALETTE[0])
      + '|' + pendingCount();
    if (multiListBuiltFor === sig) return;
    multiListBuiltFor = sig;

    const rows = [];
    const spec = multiRenderSpec();
    // ★ 「还有行没落定」= 得继续轮询。见下面轮询条件的说明。
    let anyUnresolved = false;
    // ★ 等够久还没建出来，就不再假称"生成中"，如实说"没抽出来"（见下面的第三态）。
    const giveUp = multiPollRounds > MULTI_POLL_GIVEUP;
    if (spec) {
      spec.items.forEach(function (it, i) {
        const info = (Orbit3D.multiInfo ? Orbit3D.multiInfo() : null) || {};
        const state0 = info.items && info.items[i] ? info.items[i] : null;
        const hasVerts = !!(state0 && state0.verts);
        // 渲染层正在建这一张（或队里还有活），与"压根没人建"是两回事
        const active = (info.building === it.key) || (info.pending > 0);
        const pending = !hasVerts && !(giveUp && !active);
        if (pending) anyUnresolved = true;
        const label = it.label || '';
        const tag = hasVerts
          // ★ 「N 顶点」是**一个**文本节点：数字与"顶点"拼在一起，扫描替换匹配不到 →
          //   必须走 t()（中文"顶点"在英文里是复数形式，也不能只换半边）。
          ? '<span class="orb-state">' + hostT('pages.orbit.vertexCount', { n: state0.verts || 0 }) + '</span>'
          : (pending
            ? '<span class="orb-state is-building">生成中…</span>'
            // ★ 第三态：没人建、也没顶点 ⇒ 这个阈值下真的抽不出曲面。
            //   原先一律说"生成中…"，那是**假话**，用户会一直等一个永远不来的东西。
            : '<span class="orb-state is-empty">未生成（当前阈值下抽不出曲面）</span>');
        // ★ 三个标签是**实现视角**的词（主 / 克隆 / 独立），界面上没有图例 ——
        //   用户明确说"看不懂"。改成自解释的说法 + 悬浮说明。
        const role = (i === 0) ? '主面' : (it.rotation ? '旋转副本' : '独立面');
        const roleTip = (i === 0)
          ? '主面：正在编辑的那一个，不可移除'
          : (it.rotation
            ? '旋转副本：由主面整体旋转得到，几乎瞬间完成'
            : '独立面：单独算出来的一张等值面');
        rows.push('<div class="orb-row' + (it.visible === false ? ' is-off' : '') + '" data-key="'
          + it.key + '">'
          + '<label class="orb-eye" title="点一下：显示 / 隐藏这个轨道">'
          + '<input type="checkbox" data-act="vis"' + (it.visible === false ? '' : ' checked')
          + '></label>'
          + '<input type="color" class="orb-color" data-act="color" value="'
          + rgbToHex(it.color) + '" title="' + hostT('pages.orbit.colorPickTitle') + '">'
          + '<span class="orb-label" title="' + (it.terms ? '叠加态' : '单一本征态') + '">'
          + labelHtmlOf(label) + '</span>'
          + '<span class="orb-badge" title="' + roleTip + '">' + role
          + '</span>'
          + tag
          + (i === 0 ? '' : '<button class="orb-del" data-act="del" title="从同屏里移除">×</button>')
          + '</div>');
      });
    }
    els.multiList.innerHTML = rows.join('');

    // ★ 额外轨道是**排队一张张建**的（这个环境下一张 10–15 秒）。不轮询的话
    //   "生成中…"会一直挂着 —— 用户看到的就是"点了没反应"，而它其实正在建。
    //   用低频定时器而不是 rAF：这里要的是"隔一阵对一次账"，不是逐帧动画，
    //   而 rAF 循环正是本仓库记过的 CPU 炸弹（软件渲染下尤其）。
    //
    // ★★ 2026-10-05 修：轮询条件原先写的是 `pendingCount() > 0`（队列非空），
    //   而 sp³/sp²/sp 的额外轨道是 **clone**（复制主面几何 + 旋转），**队列本来就是空的**
    //   ⇒ `pendingCount()` 恒为 0 ⇒ **从来不轮询** ⇒ 四行永远停在点击那一刻的快照上，
    //   一直写着"生成中…"，而面其实几百毫秒就建好了（实测：随便做一次无关操作，
    //   四行立刻全变成"N 顶点"）。用户报的"一直显示生成中"就是这个。
    //   现在按"**还有行没落定**"轮询 —— 那才是"要不要再看一眼"的真正判据。
    if (multiListTimer) { clearTimeout(multiListTimer); multiListTimer = 0; }
    if (anyUnresolved && multiPollRounds < MULTI_POLL_MAX) {
      multiPollRounds += 1;
      multiListTimer = setTimeout(function () {
        multiListTimer = 0;
        multiListBuiltFor = null;
        syncMultiUI();
      }, 600);
    } else {
      // ★ 上限只防"真的抽不出曲面"时定时器永远跑；一旦不再有未落定的行就清零，
      //   下次用户再加轨道时预算重新计。
      multiPollRounds = 0;
    }
  }

  /**
   * 恢复一整套视图状态（供演示「上一步」回退使用）。  /**
   * 数字框键入提交：解析 → 类型/范围校验 → 合法则写回滑块并即时重算；
   * 非法（空、非整数、越界）只标红提示，不改变当前状态。
   */
  function commitNumber(el, which) {
    const raw = el.value.trim();
    const v = Number(raw);
    if (raw === '' || !Number.isFinite(v) || !Number.isInteger(v)) { el.classList.add('invalid'); return; }
    let lo, hi, slider;
    if (which === 'z') { lo = +els.zSlider.min; hi = +els.zSlider.max; slider = els.zSlider; }   // 同样从控件读，避免两处各写一份
    else if (which === 'n') { lo = 1; hi = 6; slider = els.nSlider; }
    else if (which === 'l') { lo = 0; hi = Math.min(+els.nSlider.value - 1, 5); slider = els.lSlider; }
    else { lo = -(+els.lSlider.value); hi = +els.lSlider.value; slider = els.mSlider; }
    if (v < lo || v > hi) { el.classList.add('invalid'); return; }
    el.classList.remove('invalid');
    slider.value = v;
    syncRanges();
    recompute();                     // 键入后立即生效
  }

  function readFromControls() {
    syncRanges();                       // 先确保依赖滑块范围正确
    state.Z = +els.zSlider.value;
    state.n = +els.nSlider.value;
    state.l = +els.lSlider.value;
    state.m = +els.mSlider.value;

    state.viewTarget = activeValue('#targetSeg', 'data-target') || 'wave';
    state.mode = activeValue('#modeSeg', 'data-mode') || 'real';
    // ★ 轨道模型（氢型 / Slater 型）在这里**统一落到数学层**，是唯一的同步点。
    //   理由与 `psiCrit` 一样：模型有三条改动路径（界面点击、智能体动作、restoreState 回退），
    //   而 recompute() 每次都先走本函数，所以只在这里写一次就不会漏。
    //   ★ 界面是**唯一真源**：动作只负责改控件（与 setPsiCriterion 同一套写法），
    //     不在动作里另调一次 OM.setRadialModel —— 否则"动作改了数学层、控件没跟上"
    //     和"控件是真源"两套语义并存，迟早分叉。
    state.orbitalModel = activeValue('#orbModelSeg', 'data-model') || 'hydrogenic';
    {
      // ζ 只在 Slater 档有意义。氢型档把它记为 null（而不是保留旧值），
      // 否则它会被算进等值面指纹 `fieldKeyOf`，切档时凭空多出一次重算。
      const raw = els.orbZetaInput ? els.orbZetaInput.value.trim() : '';
      const z = Number(raw);
      state.orbitalZeta = (state.orbitalModel === 'slater' && raw !== '' && Number.isFinite(z)
        && z > 0 && z <= 20) ? z : null;
      OM.setRadialModel(state.orbitalModel, state.orbitalZeta === null ? undefined : state.orbitalZeta);
      syncOrbModelUI();
    }
    // ---- 多轨道同屏 --------------------------------------------------------
    // ★ 集合从静态的 #multiSeg 读（与其余控件同一套读法）。
    // ★ **可见集合不在这里读**：那一行复选框是按当前集合**生成**的，而重建发生在
    //   本函数的下半段 —— 在这里读会在"刚换集合、行还没重建"的那一帧读到空的旧行，
    //   于是"切到 sp³ 只显示了 sp³-1"（一行都没勾上）。改可见集合的只有动作，
    //   它自己写 state（见 ACTIONS.setOrbitals）。
    // ★ 两条入口（界面点集合、模型下发集合）都必须让"换集合＝全开"这一条成立：
    //   界面这边靠 state.orbitalSet 与 DOM 不一致来发现；动作那边自己先把
    //   state.orbitalSet 认下来，于是不会被误判成"刚换集合"而清空它指定的 visible。
    {
      const setId = activeValue('#multiSeg', 'data-s') || 'off';
      if (setId !== state.orbitalSet) {
        state.orbitalSet = setId;
        const def = (setId === 'off' || setId === 'custom') ? null : Hybrids.set(setId);
        state.orbitalVisible = def ? def.labels.map((_, i) => i) : [];
        // ★ 离开自定义档就把额外轨道清掉：留着它们等于"档位是 sp³、画面里还挂着
        //   用户先前加的 2s"——快照说一套、画面是另一套，而且不报错。
        //   （切换档位是用户的明确意图，清空比"悄悄继续画"诚实。）
        if (setId !== 'custom' && state.orbitals.length) state.orbitals = [];
        // ★ 覆盖色跟着一起清：它记的是"上一组里某一项的颜色"，
        //   而新一组的 key 恰好可能是同一个（sp2-1 与 sp3-1 不同，但换回同一组时
        //   用户多半期望看到**原始配色**，就像换了一套牌）——
        //   留着会让"切走再切回来"意外保留改过的颜色，与"重新选一组"的意图相反。
        state.orbitalColorOverride = {};
        multiListBuiltFor = null;
      }
    }
    syncMultiUI();
    state.renderMode = activeValue('#renderSeg', 'data-mode') || 'surface';
    state.level = levelFromSlider(+els.levelSlider.value);
    //   兜底值要与 index.html 上带 active 的按钮一致（那是默认的真源，见 state 的说明）
    state.psiCrit = activeValue('#psiSeg', 'data-mode') || 'psi';
    // ★ 第 2 条：**电子云只在判据取 |ψ|² 时有意义**（"电子云"就是按 |ψ|² 重要性采样出的
    //   点云，它的概念依附于 |ψ|²）。判据取 ψ 时没有"电子云"可言 —— 拉回等值面，
    //   并把控件也切过去，免得 DOM 显示"电子云"而画面画的是等值面。
    //   ★ 只切控件、不回写判据；用户切回 |ψ|² 时按"默认等值面"呈现（那一组会重新出现）。
    //   ⚠️ **必须放在 state.psiCrit 读进来之后**：放在 renderMode 那一行下面时，
    //      state.psiCrit 还是上一轮的旧值，判据刚切到 ψ 的这一帧不会回落
    //      （实测就是如此：判据已是 ψ，渲染方式仍停在 points）。
    if (state.psiCrit === 'psi' && state.renderMode !== 'surface') {
      state.renderMode = 'surface';
      setSeg('#renderSeg', 'data-mode', 'surface');
    }
    state.pointCount = +els.pointCountSlider.value;
    state.plane = activeValue('#planeSeg', 'data-p') || 'xz';
    state.sectionMode = activeValue('#phaseSeg', 'data-mode') || 'intensity';
    state.angWhich = activeValue('#yCritSeg', 'data-k') || 'Y';
    state.radial = Array.from(document.querySelectorAll('#radialSeg .seg-btn.active')).map((b) => b.getAttribute('data-k'));
    // 实轨道按钮要与 state.m 保持一致（智能体改 m、拖滑块、点按钮三条路都会走到这里）
    syncRealOrbitButtons();
  }

  function updateOutputs() {
    // 数字框只是滑块的"另一种呈现"：每次重算都同步一次，智能体通过动作改了
    // 阈值/粒子数时输入框也会跟着走（正在输入的那只不覆盖，否则会打断键入）。
    syncNumBox(els.levelInput, state.level * 100);
    syncNumBox(els.pointCountInput, state.pointCount / 10000);
    // 提示两种判据的换算（|ψ| = f ⟺ |ψ|² = f²，故同一读数下 |ψ| 判据得到更大的面），
    // 并给出该轨道的推荐值。百分比按量级取小数位 —— 低端可达 0.02%。
    const pct = (x) => {
      const p = x * 100;
      return (p >= 10 ? p.toFixed(1) : (p >= 1 ? p.toFixed(2) : p.toFixed(3))) + '%';
    };
    const f = state.level;
    const rec = recommendedLevel(state.n, state.l, state.psiCrit);
    // 推荐值被下限顶住时要说出来：4s/5s/6s 的"看全所有壳"推荐值低于下限 0.3%，
    // 直接显示 0.300% 会让学生以为那就是该轨道的推荐值。
    const atFloor = rec > recommendedLevelRaw(state.n, state.l, state.psiCrit) + 1e-12;
    // ★ 用 innerHTML：推荐值后面挂一个「采用」内联按钮（提示行会随每次重算重建，
    //   所以按钮的点击靠事件委托绑定，见 init 里的 psiHint 监听）。内容全是自产数字，
    //   无注入面。
    // ★ 整条提示都走 t()：里面嵌着**换算出来的百分比**（同一句话每拖一下滑块就是一条
    //   新原文），扫描替换按整段匹配，救不了。`{cur}` / `{alt}` 是当前判据与换算值，
    //   中文与英文的句式差别（"占…峰值的比例"）也在译文里一次解决。
    els.psiHint.innerHTML = ((state.psiCrit === 'psi2')
      ? hostT('pages.orbit.psiHint.psi2', { cur: pct(f), alt: pct(Math.sqrt(f)) })
      : hostT('pages.orbit.psiHint.psi1', { cur: pct(f), alt: pct(f * f) }))
      + hostT('pages.orbit.psiHint.rec', { rec: pct(rec) })
      + (atFloor ? hostT('pages.orbit.psiHint.floor') : '')
      + '<button type="button" class="link-btn" id="levelRecBtn">' + hostT('pages.orbit.psiHint.adopt') + '</button>';

    // ★ 这里原先有一段"l = 0 时禁用相位色并把选择拉回支壳层色"。开关删除后这段
    //   没有存在余地了：着色由 deriveColorMode 推导，判据非平方 + 实数解就是双色，
    //   s 轨道也不例外 —— 1s 的 ψ 处处为正，按 sign 着色自然得到纯色；
    //   2s/3s 有径向节点、确实变号，那时内外壳异色是物理，不该被压掉。
  }

  // ---- 等值面阈值：对数刻度 + 按轨道推荐值 --------------------------------
  /**
   * 阈值滑块的刻度映射。
   * ★ 为什么用对数：可用范围跨 2.4 个数量级，线性刻度下低端（0.3%–1%）只占滑块行程的
   *   百分之几、根本拖不到；而低端恰恰是最需要精细控制的区域（"要看到所有节面"的阈值
   *   常常在 1% 以下）。故滑块用 0–1000 的整数刻度，等比映射到 [LEVEL_MIN, LEVEL_MAX]。
   *
   * ★ 量程的选取（0.3% – 80%）：
   *   · 下限原为 0.02%，实测**用不到那么低**：各轨道"看全所有壳层"所需的阈值最低是
   *     6s 的 0.04%，而 0.04% 下画出来是一团弥散的巨球、教学上反而不如只看内几层。
   *     0.3% 已经能覆盖到 3s 的三层壳（最弱壳峰值 0.46% > 0.3%），是"够用且不空转"的位置。
   *   · 中点 = √(0.003 × 0.8) = **4.9%**。取对数刻度就要看中点落在哪 —— 原来的
   *     0.02%–80% 中点是 1.26%，等于把滑块正中间浪费在了几乎没人用的量级上；
   *     现在中点落在 5% 附近，也就是 3p/4p/4d 这些常用轨道推荐值（4.75% / 1.69% / 7.6%）
   *     的左右，手感与直觉一致。
   */
  const LEVEL_MIN = 0.003, LEVEL_MAX = 0.80;           // 占峰值的比值（0.3% – 80%）
  const LEVEL_LOG_SPAN = Math.log(LEVEL_MAX) - Math.log(LEVEL_MIN);
  const levelFromSlider = (v) => Math.exp(Math.log(LEVEL_MIN) + (v / 1000) * LEVEL_LOG_SPAN);
  const levelToSlider = (f) => Math.round(1000 * (Math.log(f) - Math.log(LEVEL_MIN)) / LEVEL_LOG_SPAN);

  // 用户是否"明确指定过"阈值（拖过滑块 / 改过数字框 / 智能体下发过 setSurfaceLevel 或
  // restoreState）。置位后换轨道就不再套用推荐值 —— 否则会盖掉智能体演示里明确设的值。
  let levelUserAdjusted = false;
  let lastOrbKeyForLevel = null;                        // 上次套用推荐值时的轨道标识

  /**
   * 该轨道的推荐等值面阈值（占峰值的比值，按**当前判据**给出）。
   *
   * 依据：等值面沿 |Y| 最大的方向能否出现，只看该壳的 max R(r)² 够不够高。实测各壳
   *   峰值占比 —— 3p 100/11.9、4p 100/11.1/4.2、5d 100/17.4/8.1、4s 100/1.8/0.42/0.18。
   *   默认的 10% 只对 3p（恰好是默认轨道）勉强成立：4p 会切掉第三层壳、3s 只显示
   *   1.4% 的概率（看起来是个光滑小球），与"展示节面"的教学目标直接冲突。
   *
   * 取最弱壳峰值的 40%：既保证**每一层壳都显示得出来**（0.4 < 1），又留出形态余地
   * （贴着峰值取会让最外壳缩成一个点）。单壳轨道没有"看全节面"的约束，沿用 10%。
   *
   * 下限 0.04% 是防呆而非妥协：n ≤ 6 时实测最弱壳峰值 ≥ 0.05%，所以 0.04% 仍然显示
   * 得出所有壳，只是不让推荐值无限逼近滑块下限。
   */
  function recommendedLevelRaw(n, l, psiCrit) {
    // ★ 判据换算必须先于**每一条**返回路径 —— 包括下面几条兜底。
    //   原先只有最后一行做了 Math.sqrt，于是"单壳轨道"（n−l−1 = 0：1s / 2p / 3d / 4f…）
    //   走 `fr.length <= 1` 那条提前返回时**绕过了换算**：读数恒为 10%，
    //   而 10% 的 |ψ| 与 10% 的 |ψ|² 是**两张相差约 5 倍的面**。
    //   症状：切判据时推荐值不跟着变、画面却变了（用户实测 3d_z² 发现）。
    const toCrit = (f) => ((psiCrit === 'psi') ? Math.sqrt(f) : f);
    if (!OM || !OM.shellPeakFractions) return toCrit(0.10);
    let fr;
    try { fr = OM.shellPeakFractions(n, l, state.Z); } catch (e) { return toCrit(0.10); }
    if (!fr || fr.length <= 1) return toCrit(0.10);     // 单壳：没有"看全所有壳"的约束
    const rec = Math.max(0.0004, Math.min(0.8, 0.4 * Math.min.apply(null, fr)));
    return toCrit(rec);
  }

  /**
   * 推荐值（截断到滑块量程内）。★ 与 recommendedLevelRaw 分开是必要的：
   * 4s/5s/6s 的"看全所有壳"推荐值（0.074% / 0.04%）已经低于新的下限 0.3%，
   * 截断后与原始值不同 —— 提示行要据此显示"（已到下限）"，而不是把一个被顶住的
   * 数字当成真正的推荐值报给学生。
   */
  function recommendedLevel(n, l, psiCrit) {
    const raw = recommendedLevelRaw(n, l, psiCrit);
    return Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, raw));
  }

  /**
   * 把推荐阈值写进 state 与滑块。只在"用户没明确指定过"时调用。
   * ★ 此处**直接赋值、不派发 input 事件** —— 派发会触发滑块监听里的
   *   levelUserAdjusted = true，等于自己把自己锁死（推荐值只生效一次）。
   */
  function applyRecommendedLevel() {
    state.level = recommendedLevel(state.n, state.l, state.psiCrit);
    if (els.levelSlider) els.levelSlider.value = levelToSlider(state.level);
  }

  /** 把数值写回数字框 */
  function syncNumBox(el, v) {
    if (!el || document.activeElement === el) return;
    // ★ 精度按量级取：阈值低端可到 0.3%，固定一位小数会把它舍成 0.3 与 0.4 之间跳
    //   （"0.0"既看不出是多少，再键入还会被判非法）；粒子数（万）0.8–8 两位足够。
    const av = Math.abs(v);
    const digits = (av >= 10) ? 1 : (av >= 1 ? 2 : 3);
    const s = String(+v.toFixed(digits));
    if (el.value !== s) el.value = s;
  }

  /**
   * 把数字框绑到滑块上（lo/hi 是**数字框**的单位，换算函数负责两个方向）。
   *
   * ★ 与量子数不同，这两个量键入时必须**防抖**：改阈值会触发等值面重建（约 250ms），
   *   逐字符重建会让输入卡顿；改粒子数则要重采样数万个点。所以键入中只防抖重算，
   *   回车/失焦立即提交。
   */
  function bindNumToSlider(input, slider, toSlider, lo, hi) {
    if (!input || !slider) return;
    const valid = () => {
      const raw = input.value.trim();
      const v = Number(raw);
      if (raw === '' || !Number.isFinite(v) || v < lo || v > hi) { input.classList.add('invalid'); return null; }
      input.classList.remove('invalid');
      return v;
    };
    input.addEventListener('input', () => {
      const v = valid();
      if (v == null) return;
      setSlider(slider, toSlider(v));
      scheduleUpdate();                    // 键入中：防抖
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const v = valid();
      if (v != null) { setSlider(slider, toSlider(v)); scheduleUpdate(0); }
      input.blur();
    });
    input.addEventListener('blur', () => {
      const v = valid();
      if (v != null) { setSlider(slider, toSlider(v)); scheduleUpdate(0); }
    });
  }

  // ---- 主重算 ---------------------------------------------------------------
  function recompute() {
    readFromControls();
    syncZZoneSummary();          // 折叠区标题上的 Z 跟着走（见该函数的说明）
    // ★ 换轨道时套用该轨道的推荐阈值（用户/智能体明确指定过就不动，见 levelUserAdjusted）。
    //   必须放在 readFromControls 之后：那时 n/l/m 已是新值，而 level 刚被滑块覆盖成旧值，
    //   正需要在这里改掉。
    // ★ 轨道标识**含 psiCrit**：判据变了、而阈值还处在"推荐值"状态时，也要跟着切到
    //   新判据下的推荐值 —— 于是**同一张面保留下来**，只有读数与着色变
    //   （|ψ| = √f ⟺ |ψ|² = f，见 math.js 的 isoLevelAbs）。
    //   若用户手动调过（levelUserAdjusted 为真），则保持读数不变 —— 那时"同一读数、
    //   两张不同大小的面"本身就是有教学意义的对照，正是 setPsiCriterion 要演示的东西。
    const orbKey = state.n + ',' + state.l + ',' + state.m + ',' + state.mode + ',' + state.psiCrit;
    if (orbKey !== lastOrbKeyForLevel) {
      lastOrbKeyForLevel = orbKey;
      if (!levelUserAdjusted) applyRecommendedLevel();
    }
    updateOutputs();
    updateViewer();
    // ★ 拖动中**不重画 2D 图与公式**。它们是同步的一整块（三张 Canvas + KaTeX），
    //   而拖动时用户盯的是三维视图 —— 留着它们，等于让"拖动中的每一次重算"都背上
    //   这一坨固定开销，帧间隔会从 17ms 掉到 30ms 以上，三维的流畅正是被这几张图拖垮的。
    //   松手（disarmPreview）会立刻以全档重算一次，那时一并补齐 —— 图上不会有残留的
    //   旧读数，因为它们在拖动期间本来也来不及跟上 100ms 一次的刷新。
    if (!window.__ORBIT_PREVIEW__) { updateCharts(); updateFormula(); }
  }

  /** 当前该用哪个网格分辨率：拖动中走粗档（见 armPreview），其余走全档 */
  function currentGridRes() {
    const preview = !!window.__ORBIT_PREVIEW__;
    return preview ? (isMobile ? 30 : 40) : (isMobile ? 46 : 68);
  }

  /**
   * 两组叠加项是否**数值等价**（顺序无关）。
   *
   * ★ 为什么要按数值比而不是比引用：terms 会经过 setSuperposition、复制、
   *   归一化等好几道手，同一个态拿到的绝不是同一个数组对象。
   */
  function sameTerms(a, b) {
    const x = a || [], y = b || [];
    if (x.length !== y.length) return false;
    if (!x.length) return true;
    const key = (t) => t.n + ',' + t.l + ',' + t.m + ',' + (t.mode || 'real');
    const m = new Map(y.map((t) => [key(t), t]));
    for (const t of x) {
      const u = m.get(key(t));
      if (!u) return false;
      if (Math.abs(t.c.re - u.c.re) > 1e-9 || Math.abs(t.c.im - u.c.im) > 1e-9) return false;
    }
    return true;
  }

  function currentFieldKey() {
    const sig = (state.terms || []).map(function (t) {
      return t.n + ',' + t.l + ',' + t.m + ',' + t.c.re.toFixed(3) + ',' + t.c.im.toFixed(3);
    }).join('|');
    // ★ Z 必须进 key —— 不进就会"换了 Z 画面不变"（走缓存复用分支）
    // ★ **分辨率也必须进 key**：拖动中与松手后是两张不同粗细的网格，键里不带分辨率，
    //   松手后就会命中缓存、把那张 40³ 的粗场赖在画面上不走（与当初"Z 漏出缓存键"
    //   是同一个错，只是这次漏的是网格）。
    // ★ **轨道模型同样必须进 key**（2026-10-01）：它是 ψ 的第三个自由度。
    //   漏了它的症状比前两次更隐蔽 —— 切换按钮点了没反应，而**反方向却是好的**
    //   （氢型→Slater 恰好要让盒子变大，被扩展逻辑兜住了），于是看起来像随机失灵。
    //   一句话判据：**凡是能让同一组 (n,l,m) 画出不同画面的输入，都得进这个键。**
    const rm = OM.getRadialModel();
    return 'Z' + state.Z + '-R' + currentGridRes() + '-' + state.n + '-' + state.l + '-' + state.m
      + '-' + state.mode + '-' + state.psiCrit
      + '-M' + rm.model + (rm.zeta == null ? '' : '@' + rm.zeta)
      + (sig ? '-S:' + sig + '@' + state.relPhase : '');
  }

  // ---------------------------------------------------------------------------
  // 拖动中的粗渲染
  //
  // ★ 为什么需要：一次全分辨率重建即使切成小片，也要跨十几帧才长出来。拖着阈值/量子数
  //   滑块时，画面因此一直落在"上一帧的旧面"上，跟手感差。拖动中改用 40³ 且不做局部
  //   精细化（单元数约为全档的 1/5），松手后再以 68³ 补一次。
  //
  // ★ **只认真人事件**（e.isTrusted）。程序化写 value 同样会派发 input，而它不会再触发
  //   change —— 不分青红皂白地置位，标志就会一直挂着，细颈补片从此不再出现（踩过）。
  //
  // ★ 再加一条**兜底解档**：置位时重置一个 400ms 定时器，超时即解档并补一次全分辨率。
  //   这样即使 change 没来（键盘方向键、触摸被系统吞掉、程序化写入），也能自愈 ——
  //   不至于把画面永久留在粗档上。
  // ---------------------------------------------------------------------------
  const PREVIEW_TIMEOUT_MS = 400;
  const PREVIEW_THROTTLE_MS = 100;   // 拖动中重算的最小间隔（见 scheduleUpdate）
  let previewTimer = null;
  let previewThrottleId = null;

  function armPreview(e) {
    // ★ 只认真人事件：程序化写 value 同样会派发 input，而它不会再触发 change，
    //   认了它标志就会一直挂着。
    // ★ **不带事件对象时放行** —— 那是内部代码（如量子态编辑器的相位滑块）显式要求降档，
    //   此时由它自己在松手时调 disarmPreview。
    if (e && !e.isTrusted) return;
    window.__ORBIT_PREVIEW__ = true;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(disarmPreview, PREVIEW_TIMEOUT_MS);
  }

  /**
   * 解档并补一次全分辨率重建。
   * @param {boolean} [refresh] 是否顺带触发一次刷新；传 false 由调用方自己刷。
   */
  function disarmPreview(refresh) {
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
    if (!window.__ORBIT_PREVIEW__) return;
    window.__ORBIT_PREVIEW__ = false;
    // 缓存键里含分辨率，故这一次刷新会走重建分支、以全档重算一遍
    // （同时取消掉在飞的粗档重建 —— 见 render3d.js 的 rebuildSurface）。
    if (refresh !== false) scheduleUpdate();
  }

  function updateViewer() {
    // ★ 两个档位是两条独立的重建路径，不是一个开关的两个分支：
    //   'spherical' 画极坐标曲面 r = |Y|（解析形状，直接三角化）；
    //   'wave'      画 ψ 的等值面（标量场 + marching tetrahedra）或粒子云。
    //   所以这里用 if/else 而不是在渲染模式里再加一个维度。
    const sph = (state.viewTarget === 'spherical');
    // 着色由判据推导（见 deriveColorMode），本函数内算一次传下去。
    const cm = deriveColorMode();
    if (sph) {
      // 球谐曲面是**纯角度函数**，与 Z 无关 —— 所以这一档不传 Z，也不需要传。
      // ★ 着色仍要传：实数解取 Y 判据时按 sign(Y) 双色，其余（含 |Y|²、含一切复数解）纯色。
      Orbit3D.updateAngular(state.l, state.m, state.mode, state.angWhich, cm);
    } else if (state.renderMode === 'surface') {
      const key = currentFieldKey();
      if (key !== lastFieldKey) {
        // 拖动滑块时用较低分辨率预览（一帧要重建一次等值面，全分辨率会跟不动），
        // 松手后 __ORBIT_PREVIEW__ 复位、缓存键随之变化，会以全分辨率重建一次
        // 并补上局部精细化（见下面的 armPreview / disarmPreview）。
        Orbit3D.updateSurface(state.n, state.l, state.m, state.mode, currentGridRes(), state.level,
          cm, state.psiCrit, state.terms, state.relPhase, state.Z);
        lastFieldKey = key;
      } else {
        // 仅阈值/着色变化：复用已缓存的标量场与网格。
        // ★ 判据变化会走上面那条重建路径（currentFieldKey 含 psiCrit），而判据一变
        //   deriveColorMode 往往也跟着变 —— 两条路径都要把新色传下去，否则会出现
        //   "判据改了、面重建了，颜色还是上一套"。
        Orbit3D.setSurfaceLevel(state.level, cm, state.psiCrit);
      }
    } else {
      const cloud = (state.terms && state.terms.length)
        ? OM.samplePointsSuperposition(state.terms, state.pointCount, cm,
            state.terms.map(function (t, i) { return i * state.relPhase; }), state.Z)
        : OM.samplePoints(state.n, state.l, state.m, state.mode, state.pointCount, cm, state.Z);
      Orbit3D.updateCloud(cloud);
    }
    // ---- 多轨道同屏 --------------------------------------------------------
    // ★ 前提：主面必须**就是**第 0 个等价轨道（其余几个是它的旋转克隆）。
    //   用户拖一下 n/l/m 滑块会走 exitSuperposition 把 terms 清空，前提当场失效，
    //   画面就变成"一个普通轨道 + 三个 sp³ 克隆"—— 四个瓣都在，看起来很正常，
    //   **没有任何东西会报错**。所以在这里核对前提，失效就如实关掉（控件同步回"关闭"）。
    //   ★ 自定义档**没有**这个前提（下面那一句只在预设档跑，见 multiRenderSpec）。
    if (state.orbitalSet !== 'off' && state.orbitalSet !== 'custom') {
      const set0 = Hybrids.terms(state.orbitalSet, 0);
      if (set0 && !sameTerms(state.terms, set0)) ACTIONS.setOrbitals({ set: 'off' });
    }
    // ★ 只在**规格指纹**变了才下发：setMultiOrbitals 会重建几何（克隆复制顶点、
    //   额外轨道重跑等值面），逐帧调用等于每帧重跑十几秒的流水线。
    //   换面引起的变化不在这里管 —— 那条路走 done → multiAfterRebuild。
    {
      const spec = multiRenderSpec();
      const mKey = multiKeyOf(spec);
      if (mKey !== lastMultiKey) {
        lastMultiKey = mKey;
        Orbit3D.setMultiOrbitals(spec);
      }
    }
    Orbit3D.setVisibility(sph ? 'spherical' : state.renderMode);
    Orbit3D.setAutoRotate($('#autoRotate').checked);
    // 右栏参数组：按「档位 + 渲染模式」显示当下真正起作用的那一组，其余收起来。
    els.yCritSet.style.display       = sph ? '' : 'none';
    // ★ 第 2 条：「三维渲染」（电子云 / 等值面）只在判据取 |ψ|² 时出现。
    //   电子云是**按 |ψ|² 重要性采样出的点云**，这个概念依附于 |ψ|² —— 判据取 ψ 时
    //   留着它既没有对应的画面，也会和 readFromControls 里的强制回落打架。
    document.getElementById('renderGroup').style.display =
      (sph || state.psiCrit === 'psi') ? 'none' : '';
    // 「等值面判据」整组只在波函数档出现（球谐档有自己的 #yCritSet，两者是同一个
    // 概念的两个化身，值域不同）。
    // ★ 它**不能**再挂在 #levelSet 里（原先如此）：#levelSet 只在"等值面"渲染模式下
    //   显示，于是电子云档下判据按钮不可见 —— 而判据恰恰是电子云颜色的来源，
    //   等于让一个看不见的选项决定可见画面。提到这一层后两档都能选。
    els.psiCritSet.style.display     = sph ? 'none' : '';
    // 截面卡只在波函数档出现（第 8 条）：它的采样源恒是**含径向的完整 ψ**，
    // 而球谐档的三维画的是 Y —— 只改标签会变成"写着 Y、画的是 ψ"，收起更诚实。
    // ★ 顺带把它的浮窗也关掉：浮窗是独立于卡片存在的一层，卡片藏了它却还开着，
    //   就等于把那张"图文不符"的图留在屏幕上（正是这一条要避免的）。
    if (els.sectionCard) els.sectionCard.style.display = sph ? 'none' : '';
    if (sph && ChartOverlay && ChartOverlay.isOpen
        && ChartOverlay.target() === 'section') {
      ChartOverlay.close();
    }
    // 判据按钮的文案随实/复解变（第 4 条：实解不写绝对值符号）
    syncPsiCritLabels();
    if (sph) syncYCritHint();
    els.levelSet.style.display = (!sph && state.renderMode === 'surface') ? '' : 'none';
    els.pointSet.style.display = (!sph && state.renderMode === 'points') ? '' : 'none';
    // ★ 「磁量子数 m」与「实轨道」**互斥显示**：m 是复解的本征值指标，实解不用它
    //   （理由见 syncRealOrbitButtons 的说明）。两档各留一个，避免出现"两个控件说的是
    //   同一件事、却可能对不上"的局面。
    const realMode = (state.mode === 'real');
    els.mSet.style.display = realMode ? 'none' : '';
    els.realOrbSet.style.display = realMode ? '' : 'none';
    if (realMode) syncRealOrbitButtons();
  }

  /**
   * 2D 图表当前该画哪一份（第 G 批）。
   *
   * ★ 三张 2D 图的能力**不一样**，不能一律对待：
   *   · 径向分布、Θ/Φ 卡 —— 画不了叠加态。Σcᵢψᵢ 只有在各分量 n 相同时才能因子化出
   *     角度部分，一般做不到（内置预设 ψ_1s+ψ_2s 恰恰不是）。所以它们只能画**某一个分量**。
   *   · 截面密度 —— **可以**直接画叠加态：在平面上求 |ψ_super|² 即可，
   *     densitySuperposition 已经算得动。这是四张图里唯一能真正画出叠加态的那张。
   * 原先三张图一律画滑块上的纯态，与三维画的叠加态对不上，而界面上没有任何提示 ——
   * 学生看着"三维是叠加态、2D 图是另一个轨道"，无从察觉。
   */
  function chartTermState(allowSuper) {
    const t = state.terms || [];
    if (!t.length) {
      return { kind: 'pure', idx: -1, n: state.n, l: state.l, m: state.m, mode: state.mode };
    }
    if (allowSuper && state.chartTerm === 'super') {
      return { kind: 'super', idx: -1, terms: t, n: state.n, l: state.l, m: state.m, mode: state.mode };
    }
    let idx = (state.chartTerm === 'super') ? 0 : Number(state.chartTerm);
    if (!Number.isFinite(idx) || idx < 0 || idx >= t.length) idx = 0;
    const x = t[idx];
    return { kind: 'term', idx: idx, terms: t, n: x.n, l: x.l, m: x.m, mode: x.mode || 'real' };
  }

  /** 分量选择器：有叠加态才出现；选项按各分量**自己的解型**取标记（实项名字 / 复项 m） */
  function syncChartTermBars() {
    const t = state.terms || [];
    const has = t.length > 0;
    const labelOf = (x, i) => {
      const md = x.mode || 'real';
      const nm = (md === 'real' && Formula && Formula.realOrbitalLabelPlain)
        ? Formula.realOrbitalLabelPlain(x.l, x.m) : '';
      return '#' + (i + 1) + ' ' + x.n +
        (md === 'real' && nm ? nm : '（m=' + (x.m > 0 ? '+' + x.m : x.m) + '）');
    };
    const cur = (state.chartTerm === 'super') ? 'super' : String(state.chartTerm);
    [['#radialTermBar', '#radialTermSel', false],
      ['#thetaPhiTermBar', '#thetaPhiTermSel', false],
      ['#sectionTermBar', '#sectionTermSel', true]].forEach(function (spec) {
      const bar = $(spec[0]), sel = $(spec[1]);
      if (!bar || !sel) return;
      bar.style.display = has ? '' : 'none';
      if (!has) { sel.innerHTML = ''; return; }
      let html = '';
      // ★ 这里原写「叠加态 ψ = Σcᵢψᵢ（本图可直接画）」——括号里那句是**实现视角的自述**
      //   （"这张图支持叠加态"），用户在截面图的术语下拉里看到它只会觉得莫名其妙：
      //   能选就说明能画，不能选就不会出现在这个列表里。已删。
      if (spec[2]) html += '<option value="super">叠加态 ψ = Σcᵢψᵢ</option>';
      t.forEach(function (x, i) { html += '<option value="' + i + '">' + labelOf(x, i) + '</option>'; });
      sel.innerHTML = html;
      // 不支持叠加态的图：当前选的是 'super' 时落到第 1 个分量（state.chartTerm 不动，
      // 这样从截面图切回来时仍记得"要看叠加态"）
      sel.value = (spec[2] || cur !== 'super') ? cur : '0';
      sel.onchange = function () {
        state.chartTerm = (sel.value === 'super') ? 'super' : Number(sel.value);
        updateCharts();
      };
    });
  }

  /**
   * 让图表**浮动窗**跟着上面的卡片一起刷新。
   *
   * ★ 为什么需要它：浮窗是 chart-overlay.js 自建的一层 canvas（不在 els.* 里），
   *   它自己的重画事件源只有「打开 / resize / 拖动结束 / 最小化切换」——
   *   **"状态变了"不在其中**。于是这里横切一刀：卡片换到新轨道了，浮窗却没人管，
   *   停在旧帧上。用户实测的正是这个：演示《R(r) 与 D(r)》切了量子数，
   *   弹出的径向浮窗纹丝不动，而底下的卡片已经换成新轨道了 ——
   *   同一张图在两个地方长得不一样，比不画更误导。
   *   （facade 的 drawChartInto 本来就是从 state 现读的，只要喊一声它就跟得上。）
   * ★ 走 ChartOverlay.redraw（内部 rAF 合并）：一帧内喊多次只重画一次；
   *   且 isOpen 为假时零开销，所以两条收口都可以无条件喊。
   */
  function syncChartOverlay() {
    if (ChartOverlay && ChartOverlay.isOpen()) ChartOverlay.redraw();
  }

  function updateCharts() {
    syncChartTermBars();
    const rt = chartTermState(false);        // 径向与 Θ/Φ：不支持叠加态，落到某个分量
    const st = chartTermState(true);         // 截面：支持叠加态
    Charts.drawRadial(els.radialChart, rt.n, rt.l, state.radial, state.Z);
    // Θ/Φ 卡片画的是 Y 的**两个因子**（不随 |Y|/|Y|² 判据变 —— 判据改的是三维里
    // 那张曲面的轮廓，而"Y = Θ·Φ"这个分解关系与判据无关）。
    // ★ 它的**着色**跟着判据派生（见 deriveColorMode），与三维视图同源：
    //   原先这张卡自作主张"是复解就彩虹"，而三维可能选的是支壳层色，两处对不上。
    Charts.drawThetaPhi(els.thetaPhiChart, rt.l, rt.m, rt.mode, deriveColorMode());
    Charts.drawSection(els.sectionChart, st.n, st.l, st.m, st.mode, state.plane, state.sectionMode, state.Z,
      (st.kind === 'super') ? st.terms : null, state.relPhase,
      state.psiCrit, state.level);   // 后两个参数供「等值面对应的那条线」换算阈值
    // 换轨道 / 换平面都会改变"这一面是不是节面"，光标与触摸策略要跟着变（第 11 条）
    syncSectionUI();
    // 浮窗与卡片同源（同一份 state），收口处统一喊一声，别让它各自漂移
    syncChartOverlay();
  }

  /**
   * 只重绘截面图（不牵动其余两张），并同步「复位缩放」小控件的显隐。
   * 缩放/平移时用它而不是 updateCharts —— 后者会顺带重算径向与角度图，纯属浪费。
   */
  function redrawSection() {
    const st = chartTermState(true);
    Charts.drawSection(els.sectionChart, st.n, st.l, st.m, st.mode, state.plane, state.sectionMode, state.Z,
      (st.kind === 'super') ? st.terms : null, state.relPhase,
      state.psiCrit, state.level);   // 后两个参数供「等值面对应的那条线」换算阈值
    // ★ 节面上不显示「复位缩放」小控件 —— 那上面本来就没有可缩放的内容（第 11 条）
    const chip = $('#sectionResetChip');
    const s = Charts.sectionState();
    if (chip) chip.style.display = (!s.nodal && s.userAdjusted) ? '' : 'none';
    // 这条收口也一样：缩放/平移/复位只重画截面，但浮窗若正开着截面图，它同样要跟。
    // （attachChartInteractions 的 onChange 也传了一个 onRedraw，两者重复无害 ——
    //   重画是 rAF 合并的，且这样写就不必依赖"谁记得传回调"这句口头约定。）
    syncChartOverlay();
  }

  /**
   * 给任意 canvas 绑上"截面图"的缩放 / 平移 / 复位交互。
   * 抽成函数是因为**卡片与浮动窗要对同一个视图状态**（charts.js 的 sectionView）做同样的
   * 操作 —— 绑两遍时逻辑必须一致，否则两处的缩放手感会漂移。
   * UX 口径照抄三维视图（render3d.js 的 createQuatOrbit）：滚轮缩放、拖拽平移、双击复位。
   * @param {HTMLCanvasElement} cv
   * @param {Function} onChange 视图变化后调用（重画该 canvas）
   * @returns {boolean} 是否绑定成功
   */
  /**
   * 截面图"节面"状态下的界面收尾（第 11 条）。
   * ★ 主守卫在 charts.js 的数据入口（zoomSection / panSection 一进门就 return false），
   *   这里只做两件数据层看不到的事：把光标还原、放开触摸滚动 —— 否则节面上拖动会被
   *   "抓住"却毫无响应，看着像卡死。
   * ★ 必须**集中一处**同步，因为"节面与否"会在三条路变化：换截面平面（updateCharts）、
   *   缩放平移（attachSectionView 的 onChange）、换轨道。原先只在 attachSectionView 里
   *   同步，换平面时就漏了 —— 实测换到 2p_z 的 xy 截面后光标仍是 grab。
   */
  const sectionCanvases = [];                 // 卡片图 + 浮窗图（同一份视图状态）
  function registerSectionCanvas(cv) {
    if (cv && sectionCanvases.indexOf(cv) < 0) sectionCanvases.push(cv);
    syncSectionUI();
  }
  function syncSectionUI() {
    const nodal = !!Charts.sectionState().nodal;
    sectionCanvases.forEach((cv) => {
      cv.style.cursor = nodal ? 'default' : 'grab';
      cv.style.touchAction = nodal ? 'auto' : 'none';
    });
  }

  function attachSectionView(cv, onChange) {
    if (!cv) return false;
    const halfE = () => OM.rExtent(state.n, state.l, state.Z) * 1.05;
    let drag = null;
    // ★ 多点触控：单指拖动平移，**双指捏合缩放**（与三维视图同一套手势约定）。
    //   原先只有 wheel 能缩放 —— 桌面没问题，但触屏上就完全没法放大截面图，
    //   而"放大看暗部"恰恰是这张图的主要用法。故补上捏合。
    const pointers = new Map();
    let lastPinch = 0, lastMid = null;

    const changed = () => { onChange(); syncSectionUI(); };
    registerSectionCanvas(cv);

    /** 屏幕坐标 → 截面平面坐标（用作缩放锚点："放大指针底下这一块"） */
    function toPlane(clientX, clientY) {
      const r = cv.getBoundingClientRect();
      const hu = halfE() / Charts.sectionState().scale;
      return {
        u: Charts.sectionState().cu + ((clientX - r.left) / Math.max(1, r.width) - 0.5) * 2 * hu,
        v: Charts.sectionState().cv + ((clientY - r.top) / Math.max(1, r.height) - 0.5) * 2 * hu,
      };
    }

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const a = toPlane(e.clientX, e.clientY);
      if (Charts.zoomSection(Math.exp(-e.deltaY * 0.0015), a.u, a.v)) changed();
    }, { passive: false });

    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // 节面：整片空白没什么可拖动/缩放的，不进入手势（否则光标会变 grabbing 却毫无响应）
      if (Charts.sectionState().nodal) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (pointers.size === 2) {
        drag = null;                     // 双指落下即转入缩放，不再平移
        const p = [...pointers.values()];
        lastPinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        lastMid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      } else {
        drag = { x: e.clientX, y: e.clientY };
        cv.style.cursor = 'grabbing';
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const p = [...pointers.values()];
        const pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
        let dirty = false;
        if (lastPinch > 0 && pinch > 0) {
          const a = toPlane(mid.x, mid.y);
          if (Charts.zoomSection(pinch / lastPinch, a.u, a.v)) dirty = true;
        }
        lastPinch = pinch; lastMid = mid;
        if (dirty) changed();
        return;
      }
      if (!drag) return;
      const st = Charts.sectionState();
      // 每像素对应多少平面坐标：视窗全宽 2·E/scale 铺满画布宽度
      const k = (2 * halfE() / st.scale) / Math.max(1, cv.clientWidth);
      // 指针右移 → 内容跟着右移 → 视窗中心左移，故取负号
      Charts.panSection(-(e.clientX - drag.x) * k, -(e.clientY - drag.y) * k);
      drag = { x: e.clientX, y: e.clientY };
      changed();
    });
    const endDrag = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) { lastPinch = 0; lastMid = null; }
      if (!drag) return;
      drag = null;
      cv.style.cursor = 'grab';
      try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener("dblclick", () => { Charts.resetSectionView(); changed(); });
    return true;
  }

  function bindSectionView() {
    attachSectionView(els.sectionChart, redrawSection);
    const chip = $('#sectionResetChip');
    if (chip) chip.addEventListener('click', () => { Charts.resetSectionView(); redrawSection(); });
  }

  // 公式高亮状态（由 agent 的 setFormulaHighlight 动作驱动）
  // 'R' 径向 | 'F' 方位角 Φ | 'T' 极角 Θ | 'P' 勒让德多项式 | 'Y' 角度部分 | null 无
  // ★ 原先还有 'L'（拉盖尔）与 'N'（归一化常数）—— 第 8 条把这两个量**直接代入**了
  //   R 行，公式里不再有独立的 N_{n,l} 与 L_k 片段，这两个高亮部位随之取消。
  let formulaHighlight = null;

  /**
   * 渲染公式区。
   *
   * ★ 上游是整页 `<script>` 引入 KaTeX，`katex` 是全局，所以它可以裸写。
   *   统一壳里 KaTeX 是**懒加载**的（277 KB，见 `packages/agent-core/ui/katex-loader.js`
   *   与 apps/web/src/main.js 的 preloadKatexIdle）——首次进入本页时它**可能还没到**。
   *
   *   三个必须处理的点：
   *     ① 用 `window.katex` 而不是裸 `katex`：后者在没有时抛 ReferenceError，
   *        会把**整个 updateFormula 打断**——连带后面的颜色标注、右上角符号都不画了。
   *        （实测：控制台报 "ReferenceError: katex is not defined" 就是这个。）
   *     ② 没到就先按等宽文本显示源码，而不是留一片空白——"看得见但没排版"
   *        比"什么都没有"更容易判断成"正在加载"。
   *     ③ KaTeX 到位后**自动补画一次**：否则要等下一次 recompute 才正确，
   *        而 recompute 可能很久不发生（页面静止时不会）。
   */
  let katexPending = false;
  function renderFormula(latex) {
    const K = (typeof window !== 'undefined' && window.katex) || null;
    if (K && typeof K.render === 'function') {
      try {
        // trust:true 是 \htmlClass 生效的前提（用于按项高亮）
        K.render(latex, els.formulaBox, { throwOnError: false, displayMode: true, trust: true });
        return;
      } catch (e) { /* 落回下面的降级 */ }
    }
    els.formulaBox.textContent = latex;
    if (katexPending) return;
    katexPending = true;
    loadKatex().then((k) => {
      katexPending = false;
      if (k) { try { updateFormula() } catch (e) { /* 补画失败不影响已显示的内容 */ } }
    }).catch(() => { katexPending = false });
  }

  function updateFormula() {
    // ★ 叠加态要单独出公式：否则公式区还停在"上一个单一本征态"，
    //   与三维视图里真正画出来的东西对不上。
    const sup = (state.terms && state.terms.length)
      ? Formula.buildSuperposition(state.terms) : null;
    const f = sup || Formula.buildPsi(state.n, state.l, state.m, state.mode, { highlight: formulaHighlight });
    els.formulaTitle.innerHTML = f.titleHtml || f.title;   // 用 HTML 版：实轨道名要真下标（第 2 条）
    els.formulaNote.innerHTML = f.note;   // ★ innerHTML：说明里的变量要斜体（见 buildNote）
    // trust:true 是 \htmlClass 生效的前提（用于按项高亮）
    renderFormula(f.latex);
    if (sup) {
      // ★ 这里必须自己写空格：.orbit-real 已不再带 margin-left（见 style.css 的说明），
      //   否则"叠加态"与"N 个分量"会挤成一团。
      // ★ 走 t()：分量数是变量，且 `<span class="orbit-real">` 那段**必须留着**
      //   （见下面关于空格的说明），故整条 HTML 进译文表、数字用占位符。
      els.orbitTitle.innerHTML = hostT('pages.orbit.superTitle', { n: state.terms.length });
      els.modeBadge.textContent = hostT('pages.orbit.superBadge');
      return;
    }
    // 右上角：显示**当前正在看的那个数学对象的符号**，而不是轨道名。
    // ★ 为什么必须分档：球谐档三维里画的是 Y（纯角度函数，与 n 无关），
    //   波函数档画的才是 ψ。原先两档都写轨道名（`3d_z²` / `3p_{m=+2}`）——
    //   名字没交代"看的是哪个量"，于是出现"三维里画的是 Y、顶栏却写 3p_z"的图文不符。
    //   符号的唯一构造出口在 Formula.symbolHtml（由它决定 n 该不该出现、
    //   多级下标怎么套、复解连写还是实解用轨道名）。
    els.orbitTitle.innerHTML = Formula.symbolHtml(
      state.n, state.l, state.m, state.mode, state.viewTarget);
    // 徽标也跟着档位走：顶栏写着 Y 而徽标写"波函数实数解"是同一类图文不符。
    // 「空间波函数」与面板上那个按钮**逐字一致**（第 3 条改的名）—— 同一件事两处叫法不同，
    // 正是这一批要清掉的那类毛病。
    // ★ 徽标是"视图对象 + 波函数形式"两段拼起来的：中文可以直接接，
    //   英文词序与空格不同（"Spatial wavefunction · real solution"），
    //   所以按**组合**取键，而不是把两段译文粘起来。
    els.modeBadge.textContent = hostT('pages.orbit.badge.'
      + (state.viewTarget === 'spherical' ? 'sph' : 'psi') + '.'
      + (state.mode === 'real' ? 'real' : 'complex'));
  }

  // ---- 节流 ---------------------------------------------------------------
  let debounceId = null;
  /**
   * 排一次重算。
   *
   * ★ 拖动中必须用**节流**，不能用下面那条防抖。防抖的语义是"等输入停下来再说"，
   *   而拖动时每 16–45ms 就有一次 input，定时器被一再推后、**一次都不会触发** ——
   *   整个拖动过程中画面纹丝不动（实测：拖动期间帧率漂亮得可疑，一查根本没在算，
   *   分辨率采样全程停在拖动前的值）。节流保证每 PREVIEW_THROTTLE_MS 至少算一次，
   *   这才是用户要的"拖动时粗渲染、看得见在动"。
   *   2D 图与 KaTeX 的重算也跟着这一次走 —— 所以节流间隔不能取太小，
   *   它是"拖动时的刷新率"与"每帧留给渲染的余量"之间的取舍。
   */
  function scheduleUpdate(ms) {
    if (ms == null && window.__ORBIT_PREVIEW__) {
      if (previewThrottleId) return;                 // 还在节流窗口内：并到那一次
      previewThrottleId = setTimeout(function () {
        previewThrottleId = null;
        recompute();
      }, PREVIEW_THROTTLE_MS);
      return;
    }
    clearTimeout(debounceId);
    debounceId = setTimeout(recompute, ms == null ? 120 : ms);
  }

  /**
   * 让「进阶」折叠区展开后，新露出来的内容自动滚进可视区（第 2 条）。
   *
   * ★ 为什么需要：面板高度被钉成与三维卡片等高（见 layout.js 的 --panel-h），内容超出时
   *   由 .panel-body **内部**滚动。折叠区默认收起，展开那一瞬间新内容往往落在可视区之下 ——
   *   学生点了"进阶：三维着色"，看到的却还是原来那几行，以为点了没反应。
   *
   * ★ 两个实现细节：
   *   ① `toggle` 事件**不冒泡**，没法用事件委托，只能给每个折叠区各绑一次
   *      （静态的在这里绑，动态建的 #advZone 由 state-editor.js 建完后调本函数）；
   *   ② 必须等下一帧再量尺寸 —— 展开动作本身要触发布局，当帧量到的还是展开前的旧高度。
   */
  function bindAdvScroll(d) {
    if (!d) return;
    d.addEventListener('toggle', function () {
      if (!d.open) return;
      requestAnimationFrame(function () {
        const body = d.closest('.panel-body');
        if (!body) return;
        const over = d.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom;
        if (over > 0) body.scrollTop += over + 10;   // +10 留一点余白，别贴着底边
      });
    });
  }

  /**
   * 把当前 Z 写回「核电荷数」折叠区的标题。
   *
   * ★ 为什么必须写：Z 收进折叠区后，summary 是学生判断"这是哪个原子"的**唯一线索**。
   *   Z 会静默改掉所有尺度与能级（r → r/Z、E ∝ Z²），标题上不写出来，
   *   学生改过一次再折回去，就再也想不起来画面为什么和刚才不一样了。
   */
  let lastZSummary = '';
  function syncZZoneSummary() {
    const sm = document.querySelector('#zZone summary');
    if (!sm) return;
    const z = (state.Z || 1);
    // ★ 带变量（Z 的当前值）→ 走 t()。缓存键就用渲染出来的整串：
    //   换语言后译文变了，比较自然不相等，会重画一次（这正是我们要的）。
    const txt = hostT('pages.orbit.zSummary', { z: z });
    if (txt === lastZSummary) return;      // recompute 走得很频繁，值没变就别碰 DOM
    lastZSummary = txt;
    // ★ 变量 Z 用斜体（与面板上「核电荷数 Z」那个 label 同一口径）；数字不斜
    //   —— 斜体已经写在译文里（`<i>Z</i>`），这里整段按 HTML 写进去。
    sm.innerHTML = txt;
  }

  // ---- 事件绑定 -----------------------------------------------------------
  function bindEvent() {
    // 量子数滑块（n/l 变更需先同步依赖范围内的，再异步重算）。
    // Z 也走同一条通路 —— 它与 n/l/m 一样是"改了就整场重算"的参数。
    [els.zSlider, els.nSlider, els.lSlider, els.mSlider].forEach((el) => {
      el.addEventListener('input', () => {
        // ★ 拖 n/l/m 与"用动作设量子数"是同一个意图（要看这个单一本征态），
        //   所以走同一层保护；Z 不指定本征态，故不退出叠加态（见 exitSuperposition）。
        if (el !== els.zSlider) exitSuperposition();
        syncRanges();
        scheduleUpdate();
      });
    });
    // 实轨道按钮组：实档下取代 m 滑块。
    // ★ 不写进 state 里另立一份"实轨道"真值 —— 它仍然是 m，只是换了个呈现方式。
    //   另立一份就会出现两套状态互相追着改的经典问题（谁是真值、谁该跟谁走）。
    els.realOrbSeg.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      exitSuperposition();               // 与拖 m 滑块同一意图：要看单一本征态
      els.mSlider.value = btn.dataset.m;
      readFromControls();
      recompute();
    });
    // 量子数数字框：键入即校验；回车提交；失焦时把非法输入还原为当前真值
    const numBind = (el, which) => {
      el.addEventListener('input', () => commitNumber(el, which));
      el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { commitNumber(el, which); el.blur(); } });
      el.addEventListener('blur', () => syncRanges());
    };
    numBind(els.zInput, 'z');
    numBind(els.nInput, 'n');
    numBind(els.lInput, 'l');
    numBind(els.mInput, 'm');
    // 等值阈值 / 粒子数：滑块仍是真值来源，数字框用更贴近显示的"人类单位"
    // （百分比 / 万），换算在绑定时给。
    // 阈值：数字框用"百分比"作人类单位，滑块是 0–1000 的对数刻度（见 levelFromSlider）
    bindNumToSlider(els.levelInput, els.levelSlider, (v) => levelToSlider(v / 100), 0.3, 80);
    bindNumToSlider(els.pointCountInput, els.pointCountSlider, (v) => v * 10000, 0.8, 8);
    // ★ 任何一次阈值输入都算"用户明确指定过"：此后换轨道不再自动套推荐值，免得盖掉
    //   智能体演示里明确设的阈值。（setSlider 也会派发 input，故数字框那条路径一并覆盖）
    els.levelSlider.addEventListener('input', () => { levelUserAdjusted = true; scheduleUpdate(); });
    els.pointCountSlider.addEventListener('input', () => scheduleUpdate());

    // ★ 拖动中降档粗渲染（见 armPreview 的说明）。绑在会触发**等值面重建**的五个滑块上：
    //   量子数四个 + 阈值。粒子数滑块不绑 —— 它只重采样点云，不建等值面，没有可降的档。
    //   change 是范围控件"松手"最可靠的信号；pointerup 让画面更早回到全档；
    //   真按不出来时还有 armPreview 里的 400ms 兜底定时器。
    [els.zSlider, els.nSlider, els.lSlider, els.mSlider, els.levelSlider].forEach((el) => {
      if (!el) return;
      el.addEventListener('input', armPreview);
      el.addEventListener('change', disarmPreview);
      el.addEventListener('pointerup', disarmPreview);
      el.addEventListener('pointercancel', disarmPreview);
    });
    // 「采用推荐值」是提示行里的内联按钮；用**事件委托**，因为 hint 每次重算都会重建
    // （直接给按钮绑 onclick 会在第一次重建后失效）。
    if (els.psiHint) {
      els.psiHint.addEventListener('click', (e) => {
        if (!e.target || e.target.id !== 'levelRecBtn') return;
        levelUserAdjusted = false;          // 交回自动模式并立刻套用
        applyRecommendedLevel();
        updateOutputs();
        scheduleUpdate(0);
      });
    }
    bindSectionView();          // 截面图：滚轮缩放 / 拖拽平移 / 双击复位
    // 径向图的特征标注：**峰值与节点可同时标注**（第 17 条），点一下切换该按钮。
    // 仍走动作通路 —— 图表状态与按钮亮灭只由 setRadialMarks 一处回写，避免两处各改一半。
    const markSeg = $('#radialMarkSeg');
    if (markSeg) {
      markSeg.addEventListener('click', (e) => {
        const btn = e.target.closest('.seg-btn');
        if (!btn) return;
        const next = [];
        markSeg.querySelectorAll('.seg-btn').forEach((b) => {
          const on = (b === btn) ? !b.classList.contains('active') : b.classList.contains('active');
          if (on) next.push(b.getAttribute('data-m'));
        });
        facade.applyAction({ action: 'setRadialMarks', params: { target: 'ALL', feature: next } });
      });
    }
    // 单选分段
    // ★ 波函数形式（实/复解）现在走通用 bindSeg 就行：着色不再是独立开关，
    //   而是由判据推导（见 deriveColorMode）—— 换了实/复解，recompute 里
    //   updateViewer 自然会以新的派生色重画。原先这里要手工"重置为该档默认色"
    //   并且必须抢在 readFromControls 之前，那套顺序约束随开关一起消失了。
    bindSeg('#modeSeg', 'data-mode');
    bindSeg('#renderSeg', 'data-mode');
    bindSeg('#psiSeg', 'data-mode');
    bindSeg('#orbModelSeg', 'data-model');
    // ★ 这一组**不能**用通用 bindSeg：那条路只做 "readFromControls + recompute"，
    //   而切到 sp³ 还要求把状态编辑器的预设载成 sp³-1（主面必须就是第 0 个
    //   等价轨道，其余三个是它的旋转克隆）。通用绑定不载预设，于是 updateViewer
    //   里的"前提核对"当场判失效、把档位改回 off —— 表现就是**点了没反应**
    //   （而提示条与复选框行已经更新，看着像只坏了一半）。
    //   改成走动作，与模型下发走同一条通路，也顺带修掉"人机两条路"的分叉。
    $('#multiSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      ACTIONS.setOrbitals({ set: btn.getAttribute('data-s') });
      recompute();
    });

    // ---- 同屏轨道清单：加 / 改色 / 显隐 / 移除 --------------------------------
    // ★ 改色与显隐**不重建几何**（渲染层的 setMultiColor / setMultiVisible 只重涂顶点色），
    //   所以这里**不调用 recompute** —— 一次 recompute 会重跑十几秒的等值面，
    //   而"改个颜色要等十几秒"最容易被当成卡死。
    //   代价是 updateViewer 里的"规格指纹"要手工刷新（见 applyOrbitalColor 的注释），
    //   否则下一次重算会以为规格变了、把整组面重建一遍。
    if (els.multiAddBtn) {
      els.multiAddBtn.addEventListener('click', () => {
        ACTIONS.setOrbitals({ add: true });
        recompute();
      });
    }
    if (els.multiList) {
      const rowKey = (el) => {
        const row = el.closest('.orb-row');
        return row ? row.getAttribute('data-key') : null;
      };
      els.multiList.addEventListener('change', (e) => {
        const chk = e.target.closest('input[data-act="vis"]');
        if (!chk) return;
        const key = rowKey(chk);
        if (!key) return;
        // 至少留一个可见：全关掉等于"关闭同屏"，而那是另一个意图 ——
        // 在这里悄悄替他关掉整组，用户会以为点错了。
        if (!chk.checked) {
          const spec = multiRenderSpec();
          const shown = spec ? spec.items.filter((it) => it.visible !== false).length : 0;
          if (shown <= 1) { chk.checked = true; return; }
        }
        applyOrbitalVisible(key, chk.checked);
        multiListBuiltFor = null;
        syncMultiUI();
      });
      els.multiList.addEventListener('input', (e) => {
        const inp = e.target.closest('input[data-act="color"]');
        if (!inp) return;
        const key = rowKey(inp);
        const rgb = hexToRgb(inp.value);
        if (!key || !rgb) return;
        applyOrbitalColor(key, rgb);
        multiListBuiltFor = null;
        syncMultiUI();
      });
      els.multiList.addEventListener('click', (e) => {
        const del = e.target.closest('.orb-del');
        if (!del) return;
        const key = rowKey(del);
        if (!key || key === '__main__') return;
        state.orbitals = state.orbitals.filter((o) => o.key !== key);
        if (!state.orbitals.length) {
          // 额外轨道清空就回到"只看当前这一个"：留着 custom 档却挂着空清单，
          // 是个说不清的状态（档位说自定义、清单里什么也没有）。
          state.orbitalSet = 'off';
          setSeg('#multiSeg', 'data-s', 'off');
        }
        multiListBuiltFor = null;
        // ★ 移除走**增量**（渲染层只拆组里那一份）：走 recompute 会整组重建，
        //   删掉一个反而要等剩下几个各建一遍 —— 与本意相反。
        const r = Orbit3D.removeMultiOrbital ? Orbit3D.removeMultiOrbital(key) : { ok: false };
        if (r && r.ok) { lastMultiKey = multiKeyOf(multiRenderSpec()); syncMultiUI(); }
        else recompute();
      });
    }
    // 轨道模型的 ζ：不是整数，用不了 commitNumber（它按整数校验），故单独绑。
    // ★ 非法值**直接 return、不重算**——否则 readFromControls 会把非法文本读成 null（自动），
    //   于是"输入框里还是乱码、状态已经悄悄回自动"，用户根本不知道发生了什么。
    //   标红 + 状态不动，是唯一能让人看懂的行为。
    if (els.orbZetaInput) {
      const applyZeta = () => {
        const raw = els.orbZetaInput.value.trim();
        const z = Number(raw);
        if (raw !== '' && (!Number.isFinite(z) || z <= 0 || z > 20)) {
          els.orbZetaInput.classList.add('invalid');
          return;
        }
        els.orbZetaInput.classList.remove('invalid');
        readFromControls();
        recompute();
      };
      els.orbZetaInput.addEventListener('change', applyZeta);
      els.orbZetaInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyZeta(); });
    }
    bindSeg('#phaseSeg', 'data-mode');
    bindSeg('#planeSeg', 'data-p');
    // 视图对象：切到球谐档要连带退出叠加态并收起量子态入口（第 9 条，理由见 applyViewTargetRules）
    $('#targetSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      setActive(btn);
      applyViewTargetRules();
      readFromControls();
      recompute();
    });
    bindSeg('#yCritSeg', 'data-k');
    // 径向多选（保证至少一个激活）
    $('#radialSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      // 若这是唯一激活项则不允许取消，否则按需求 toggle
      const activeNow = document.querySelectorAll('#radialSeg .seg-btn.active').length;
      if (btn.classList.contains('active') && activeNow === 1) return;
      btn.classList.toggle('active');
      readFromControls();
      recompute();
    });
    // 通用
    // 节面显示（第 18 条）：一枚按钮一次点亮两类节面（径向球壳 + 角度锥/平面），再点清除。
    // ★ 节面属于"画上去的辅助几何"，不在 OrbitApp 的 state 里（见 render3d 的
    //   getAnnotations/setAnnotations），所以这里与智能体走的是**同一个** render3d 函数；
    //   按钮亮态由 setAuxChangeHandler 广播同步 —— 清除它的入口不止一个（按钮、画布
    //   左上角的标签、智能体的 spotlightNodes），各处自己同步必然会漏。
    const nodeBtn = $('#nodeBtn');
    if (nodeBtn) {
      Orbit3D.setAuxChangeHandler(function () {
        const cur = Orbit3D.getAnnotations().spotlight;
        nodeBtn.classList.toggle('active', !!(cur && cur.types && cur.types.length));
      });
      nodeBtn.addEventListener('click', function () {
        const cur = Orbit3D.getAnnotations().spotlight;
        const on = !(cur && cur.types && cur.types.length);
        Orbit3D.spotlightNodes(['radial', 'angular'], on);
      });
    }
    $('#autoRotate').addEventListener('change', () => Orbit3D.setAutoRotate($('#autoRotate').checked));
    $('#resetView').addEventListener('click', () => Orbit3D.resetView());
    // 窗口缩放
    window.addEventListener('resize', () => {
      Orbit3D.resize(els.viewer.clientWidth, els.viewer.clientHeight);
      updateCharts();
    });
    // ---------------------------------------------------------------------------
    // 主题切换 → 重画二维图表
    //
    // ★ 为什么必须显式接这一根线：三维视口是 `alpha: true` 的透明画布，底色由 CSS
    //   （`.viewer` 的渐变）决定 —— 变量一变它自己就跟着变，不用管。
    //   但**二维图表把颜色画进了像素里**，CSS 管不到：不重画的话，浅色主题下
    //   网格、坐标、数值标注仍是"给深底选的浅灰蓝"，白底上直接看不见（不报错）。
    //   `updateCharts()` 会在重画时按当前主题取色（见 charts.js 的 ink()）。
    // ---------------------------------------------------------------------------
    offTheme = onThemeChange(() => { try { updateCharts() } catch (e) { /* 图表还没建好，忽略 */ } });
  }

  // ---- 动画循环 -----------------------------------------------------------
  // ★ 只有一个渲染器：球谐曲面合并进主场景后，不再有第二套 render。
  //   （漏删这里的 renderAngular() 会让 rAF 链在第一帧就抛错断掉 —— 画面定格、
  //   自动旋转失效，而首帧看起来完全正常，是个很难发现的形态。）
  function animate() {
    Orbit3D.render();
    // ★ 长任务的小片在这里推进（见 sched.js）—— 放在 render **之后**，
    //   所以相机阻尼与自动旋转永远先走完，重建再慢也不会让画面停住。
    //   每片自带预算，超了就让出，下一帧接着算。
    if (Sched) Sched.tick();
    requestAnimationFrame(animate);
  }

  // ---- 对外门面（供 agent 层使用）------------------------------------------
  // 设计原则：agent 层不直接操作 DOM / Three.js，一律经由这里的受控动作；
  // 每个动作最终翻译为「对现有控件的设置 + recompute()」，最大化复用既有逻辑。
  // 交互痕迹的采集不在这里做——由 perception-snapshot 轮询 getState() 差分得到，
  // 因此**无需改动任何现有事件处理**（零侵入）。

  /** 程序化设置滑块（会触发既有的 input 处理链） */
  function setSlider(el, v) {
    if (!el) return false;
    const nv = Number(v);
    if (!Number.isFinite(nv)) return false;
    el.value = nv;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  // ---------------------------------------------------------------------------
  // 多轨道同屏的条目工具
  // ---------------------------------------------------------------------------

  /** 与渲染层同一个调色板（见 core/hybrids.js 的 PALETTE）——界面上的默认色 */
  const ORB_PALETTE = [
    [0.878, 0.627, 0.251], [0.357, 0.608, 0.835], [0.498, 0.690, 0.412],
    [0.639, 0.475, 0.839], [0.850, 0.450, 0.450], [0.450, 0.750, 0.750],
  ];

  /** [0..1]×3 → '#rrggbb'（快照里用十六进制：可读、可解析、也便于人眼核对） */
  function rgbToHex(c) {
    const h = (x) => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, '0');
    return '#' + h(c[0]) + h(c[1]) + h(c[2]);
  }
  function hexToRgb(str) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(String(str || '').trim());
    if (!m) return null;
    const v = parseInt(m[1], 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }

  /**
   * 轨道的**纯文本**名字（界面清单与快照共用）。
   * ★ 为什么不复用 Formula.symbolHtml：那是 HTML/LaTeX 记号（`d_{z^2}`、带 <sub>），
   *   放进清单行与快照标量串里既不好读也不便解析。名字只用来**认人**。
   */
  function orbitalLabel(n, l, m, terms, mode) {
    if (terms && terms.length) {
      return terms.map(function (t) { return orbitalLabel(t.n, t.l, t.m, null, t.mode); })
        .join('+');
    }
    if (mode && mode !== 'real') return n + '(l=' + l + ',m=' + m + ')';
    // 下标次序与教材一致：p 按 z/x/y，d 与 f 按 m = −l … +l
    const NAMES = {
      0: ['s'],
      1: ['p_z', 'p_x', 'p_y'],                                        // m = 0 / +1 / −1
      2: ['d_xy', 'd_yz', 'd_z2', 'd_xz', 'd_x2-y2'],                  // m = −2 … +2
      3: ['f_y(3x2-y2)', 'f_xyz', 'f_yz2', 'f_z3', 'f_xz2',
        'f_z(x2-y2)', 'f_x(x2-3y2)'],
    };
    const row = NAMES[l];
    if (!row) return n + '(l=' + l + ',m=' + m + ')';
    const idx = (l === 1) ? (m === 0 ? 0 : (m > 0 ? 1 : 2)) : (m + l);
    return n + (row[idx] || ('(l=' + l + ',m=' + m + ')'));
  }

  /**
   * 清单行里的**显示用**名字：把 `_z` / `_xy` / `_z2` 这些下标段包进 `<sub>`。
   *
   * ★ 为什么不能直接印 `orbitalLabel()` 的结果：那个函数产出的是**纯文本**
   *   （`3p_z`、`3d_z2`、`4f_z3`），它同时被快照标量串、日志、模型上下文消费 ——
   *   那些通道必须保持纯文本。所以只在**渲染清单行**这一步转成 HTML。
   * ★ 用正则而不是另写一套名字表：名字表有两份就一定会漂开（这次改的正是这一类）。
   */
  function labelHtmlOf(label) {
    return String(label || '').replace(/_([A-Za-z][A-Za-z0-9]*)/g, '<sub>$1</sub>');
  }

  /** 当前正在编辑的那个轨道（主轨道）的一个**冻结副本**；terms 非空即为叠加态 */
  function currentOrbitalCopy(key, color) {
    const terms = (state.terms && state.terms.length)
      ? state.terms.map(function (t) {
        return { n: t.n, l: t.l, m: t.m, mode: t.mode || 'real',
          c: { re: t.c.re, im: t.c.im } };
      })
      : null;
    return {
      key: key,
      label: orbitalLabel(state.n, state.l, state.m, state.terms, state.mode),
      color: color,
      visible: true,
      terms: terms,
      n: state.n, l: state.l, m: state.m, mode: state.mode,
    };
  }

  /** 还没被占用的调色板色（都用过就循环取） */
  function nextOrbitalColor() {
    const used = state.orbitals.map(function (o) { return rgbToHex(o.color); });
    used.push(rgbToHex(state.orbitalMainColor || ORB_PALETTE[0]));
    for (let i = 0; i < ORB_PALETTE.length; i++) {
      if (used.indexOf(rgbToHex(ORB_PALETTE[i])) < 0) return ORB_PALETTE[i].slice();
    }
    return ORB_PALETTE[state.orbitals.length % ORB_PALETTE.length].slice();
  }

  /**
   * 合成下发给渲染层的规格（`items[0]` = 主轨道，其余 = 额外轨道）。
   *
   * ★ 渲染层的约定是"第 0 项就是主面"，所以主轨道必须**由这里补在最前面** ——
   *   两层的约定因此一致，不必在渲染层再写一条"自定义档特殊处理"。
   *   额外轨道不带 rotation → 渲染层会**逐张真建**（任意轨道都画得出来，代价是慢）。
   */
  function multiRenderSpec() {
    if (state.orbitalSet === 'off') return null;
    const items = [];
    if (state.orbitalSet === 'custom') {
      items.push({
        key: '__main__',
        label: orbitalLabel(state.n, state.l, state.m, state.terms, state.mode),
        color: (state.orbitalMainColor || ORB_PALETTE[0]).slice(),
        visible: state.orbitalMainVisible !== false,
      });
      state.orbitals.forEach(function (o) {
        items.push({
          key: o.key, label: o.label, color: o.color.slice(),
          visible: o.visible !== false, terms: o.terms,
        });
      });
    } else {
      const def = Hybrids.set(state.orbitalSet);
      if (!def) return null;
      for (let i = 0; i < def.count; i++) {
        const k = def.id + '-' + i;
        items.push({
          key: k,
          label: def.labels[i],
          // 用户改过就用他改的（见 state.orbitalColorOverride 的说明）
          color: state.orbitalColorOverride[k] || Hybrids.color(def.id, i),
          visible: state.orbitalVisible.indexOf(i) >= 0,
          // 第 0 个不建克隆 —— 它**就是**主面（渲染层同理）
          rotation: (i === 0) ? null : Hybrids.rotation(def.id, i),
        });
      }
    }
    return { items: items };
  }

  /**
   * 规格的指纹。
   * ★ 为什么必须把颜色与 terms 也编进去：`setMultiOrbitals` 会**重建几何**（克隆复制顶点、
   *   额外轨道重跑等值面）。指纹漏掉某一维，那一维的变化要么不下发（改了没反应），
   *   要么每帧都下发（每帧复制几万个顶点）。
   * ★ 而"只改颜色/显隐"走的是 setMultiColor / setMultiVisible（只重涂），
   *   它们不重建几何 —— 所以那两条路要**手工把这个指纹刷新**（见 pushMultiSpec）。
   */
  function multiKeyOf(spec) {
    if (!spec) return 'off';
    return spec.items.map(function (it) {
      return [it.key, it.visible === false ? '0' : '1',
        it.color ? rgbToHex(it.color) : '-',
        it.rotation ? 'r' : 'b',
        it.terms ? it.terms.map(function (t) {
          return t.n + '.' + t.l + '.' + t.m + '.' + (t.mode || 'real');
        }).join('+') : 'main',
      ].join(':');
    }).join('|');
  }

  /** 还没建完的同屏轨道数（额外轨道是排队一张张建的，界面据此显示进度） */
  function pendingCount() {
    const info = (Orbit3D.multiInfo ? Orbit3D.multiInfo() : null) || {};
    return info.pending || 0;
  }

  /**
   * 把快照里的 `orbitalItems` 标量串解析回额外轨道数组（供「上一步」回退）。
   *
   * ★ 为什么能从这么少的字段还原：额外轨道用的**就是**页面自己那套 (n,l,m,mode,terms)
   *   与颜色，没有别的私有状态。所以"key|名字|可见|颜色|状态|类型"里真正需要还原的是
   *   key / 颜色 / 可见；名字与 terms 得从**当前 state** 反推不出来 —— 故这里只还原
   *   能还原的，还原不了的（terms）留空并在标签上标明，**不编造**。
   * ★ 只在自定义档调用；预设档的 items 由 Hybrids 展开，本来就与快照无关。
   */
  function parseOrbitalItems(str) {
    if (typeof str !== 'string' || !str) return [];
    return str.split(';').filter(Boolean).map(function (row) {
      const f = row.split('|');
      if (f.length < 5 || f[0] === '__main__') return null;
      const rgb = hexToRgb(f[3]);
      return {
        key: f[0],
        label: f[1] || '轨道',
        visible: f[2] !== '隐藏',
        color: rgb || ORB_PALETTE[0].slice(),
        terms: null,                    // 快照标量里没有 terms，不猜
        n: null, l: null, m: null, mode: 'real',
      };
    }).filter(Boolean);
  }

  /** 把当前规格推给渲染层（并记下指纹，避免 updateViewer 再推一次） */
  function pushMultiSpec() {
    const spec = multiRenderSpec();
    lastMultiKey = multiKeyOf(spec);
    Orbit3D.setMultiOrbitals(spec);
  }

  /**
   * 按 key 改一项的颜色（**只重涂**，不重建几何）。
   *
   * ★ 三条路必须**分开写**，不能合成一句 `state.orbitals.find(...)`：
   *   预设档的 `state.orbitals` 是空的（条目由 Hybrids 现展开），
   *   合成一句就会在预设档恒返回 false —— 整块"改某个轨道的颜色"哑掉而不报错。
   *   实测踩到：点掉 sp³ 的第 4 项，`orbitalVisible` 纹丝不动。
   */
  function applyOrbitalColor(key, rgb) {
    const isPreset = (state.orbitalSet !== 'off' && state.orbitalSet !== 'custom');
    if (key === '__main__') state.orbitalMainColor = rgb.slice();
    else if (isPreset) state.orbitalColorOverride[key] = rgb.slice();
    else {
      const o = state.orbitals.filter(function (x) { return x.key === key; })[0];
      if (!o) return false;
      o.color = rgb.slice();
    }
    Orbit3D.setMultiColor(key, rgb);
    lastMultiKey = multiKeyOf(multiRenderSpec());   // 指纹跟着走，免得下次重算又推一遍
    return true;
  }

  /** 按 key 改一项的显隐（**只改 visible**，不重建几何）。三条路同 applyOrbitalColor */
  function applyOrbitalVisible(key, visible) {
    const v = !!visible;
    const isPreset = (state.orbitalSet !== 'off' && state.orbitalSet !== 'custom');
    if (key === '__main__') state.orbitalMainVisible = v;
    else if (isPreset) {
      // 预设档的显隐是**下标数组**（快照的 orbitalVisible 与「上一步」都靠它）
      const def = Hybrids.set(state.orbitalSet);
      const i = def ? def.labels.map(function (_, k) { return def.id + '-' + k; }).indexOf(key) : -1;
      if (i < 0) return false;
      const at = state.orbitalVisible.indexOf(i);
      if (v && at < 0) state.orbitalVisible.push(i);
      if (!v && at >= 0) state.orbitalVisible.splice(at, 1);
      state.orbitalVisible.sort(function (a, b) { return a - b; });
    } else {
      const o = state.orbitals.filter(function (x) { return x.key === key; })[0];
      if (!o) return false;
      o.visible = v;
    }
    Orbit3D.setMultiVisible(key, v);
    lastMultiKey = multiKeyOf(multiRenderSpec());
    return true;
  }

  /** 程序化选中某个分段按钮 */
  function setSeg(segId, attr, val) {
    const btn = document.querySelector(segId + ' .seg-btn[' + attr + '="' + val + '"]');
    if (!btn) return false;
    setActive(btn);
    return true;
  }

  /**
   * 退出叠加态，回到"当前滑块的纯态"。返回是否真的退出了。
   *
   * ★ 两条入口必须共用它：受控动作 `setQuantumNumbers` 与**界面上的 n/l/m 滑块**。
   *   原先只有动作路径有这层保护（那里的注释写得很清楚："指定了具体量子数即意味着
   *   要看这个单一本征态"），滑块路径没有 —— 于是"设好叠加态后拖一下滑块"会出现：
   *   三维与公式仍是叠加态（terms 优先于 n/l/m），而三张 2D 图已经变成纯态图
   *   （charts.js 不支持叠加态），三者当场矛盾。
   *   **同一个建模意图走两条入口却有两种行为**，就是这类错位的来源。
   */
  function exitSuperposition() {
    if (!(state.terms && state.terms.length)) return false;
    state.terms = []; state.relPhase = 0;
    state.chartTerm = 'super';                 // 分量选择器随之复位（第 G 批）
    if (StateEditor && StateEditor.clear) StateEditor.clear();
    return true;
  }

  /**
   * 把当前正在编辑的轨道钉进同屏（界面上「＋」按钮与 `setOrbitals({add:true})` 走这条）。
   *
   * ★ 为什么用「钉住此刻的副本」而不是"让额外轨道跟着滑块走"：跟着走就意味着所有轨道
   *   永远画同一个态 —— 那正是"多轨道同屏"要避免的事。用户的操作序列就是
   *   设好一个 → 加进去 → 再设下一个 → 再加，所以每一份必须是**当时那个态**的快照。
   */
  function actAddCurrentOrbital(opt) {
    const o = (opt && typeof opt === 'object') ? opt : {};
    const color = Array.isArray(o.color) ? o.color.slice() : nextOrbitalColor();
    const wasCustom = (state.orbitalSet === 'custom');
    const info = (Orbit3D.multiInfo ? Orbit3D.multiInfo() : null) || {};
    // ★ 渲染层的清单里含**主轨道**，所以"加之前的那一份"长度应当是
    //   state.orbitals.length + 1。对上才走增量 —— 对不上说明清单已经不同步，
    //   那时宁可全量重建一次（慢但正确），也不要在一个错误的基线上追加。
    const incremental = wasCustom && info.setId === 'custom'
      && Array.isArray(info.items) && info.items.length === state.orbitals.length + 1;
    if (!wasCustom) {
      // 从预设档或关闭档进自定义：主轨道就是**此刻**正在编辑的那个，不另起炉灶
      state.orbitalSet = 'custom';
      state.orbitals = [];
      state.orbitalMainColor = state.orbitalMainColor || ORB_PALETTE[0].slice();
      state.orbitalMainVisible = true;
      setSeg('#multiSeg', 'data-s', 'custom');
    }
    state.orbitalSeq += 1;
    const item = currentOrbitalCopy('orb-' + state.orbitalSeq, color);
    if (o.label) item.label = o.label;
    if (o.visible === false) item.visible = false;
    state.orbitals.push(item);
    multiListBuiltFor = null;
    // ★ 已经在自定义档、且渲染层的清单**正是加之前的那一份**时，走**增量**
    //   （渲染层只建新增的这一张）。全量重建会让"再加一个"按已有数量线性变慢 ——
    //   每个面十几秒的话，加到第四个就是几分钟，用户看到的是"点了没反应"。
    if (incremental && Orbit3D.addMultiOrbital) {
      const r = Orbit3D.addMultiOrbital(item);
      if (r && r.ok) { lastMultiKey = multiKeyOf(multiRenderSpec()); return true; }
    }
    pushMultiSpec();
    return true;
  }

  /**
   * 一次性给出任意多条同屏轨道（模型用的"强力通路"）。
   *
   * ★ 语义：`items` 是**额外的**同屏轨道；主轨道仍是页面当前正在编辑的那个。
   *   这与渲染层的约定（items[0] 就是主面）是一致的 —— 主轨道由页面补在最前面，
   *   所以两层不必各写一条"自定义档特殊处理"。
   * ★ 每条可以是纯态（给 n/l/m）也可以是叠加态（给 terms）。给 terms 时以 terms 为准。
   */
  function actSetOrbitalItems(items) {
    const list = items.filter(function (it) { return it && typeof it === 'object'; });
    if (!list.length) return false;
    state.orbitalSet = 'custom';
    setSeg('#multiSeg', 'data-s', 'custom');
    if (!state.orbitalMainColor) state.orbitalMainColor = ORB_PALETTE[0].slice();
    /**
     * ★ 必须**边建边挂**，不能 `state.orbitals = list.map(...)`。
     *   `nextOrbitalColor()`（见上文）扫的是 `state.orbitals` 与主色 —— 在 `map()`
     *   里调用它时 `state.orbitals` 还是**旧数组**，于是"一次给多条"时每一项都拿到
     *   同一个"没被占用的颜色"：实测一次给 3p_z + 3d_z² 两条，后两条都是 `#5b9bd5`，
     *   同屏两个同色轨道根本分不清谁是谁（同屏的**唯一**身份线索就是颜色）。
     *   先把空数组挂上去，每建一条就 push，下一条就能看到上一条占用的色。
     */
    const built = [];
    state.orbitals = built;
    list.forEach(function (it) {
      state.orbitalSeq += 1;
      const terms = Array.isArray(it.terms) && it.terms.length
        ? it.terms.map(function (t) {
          return { n: t.n, l: t.l, m: t.m, mode: t.mode || 'real',
            c: t.c || { re: 1, im: 0 } };
        })
        : null;
      const n = it.n, l = it.l, m = it.m;
      built.push({
        key: it.key || ('orb-' + state.orbitalSeq),
        label: it.label || orbitalLabel(n, l, m, terms, it.mode),
        color: Array.isArray(it.color) ? it.color.slice() : nextOrbitalColor(),
        visible: it.visible !== false,
        terms: terms,
        n: n, l: l, m: m, mode: it.mode || 'real',
      });
    });
    multiListBuiltFor = null;
    return true;
  }

  // 动作表：每个动作用最朴素的方式驱动既有控件
  const ACTIONS = {
    // 仅供"只重算、不改参数"的场景（如叠加态系数/相位变化后触发一次重绘）
    recomputeOnly() { return true; },

    /**
     * 切换轨道模型：氢型（真实类氢，默认）/ Slater 型（STO）。
     *
     * ★ 这是**全局**切换：ψ、密度、三张 2D 图、节点与峰值全部经数学层的 `radialR`
     *   取径向，所以只在这一处改就够——不存在"三维换了、2D 图没换"这种分叉。
     *
     * ★ 换模型必须让等值面**重算**。render3d 的 `fieldKeyOf` 已经把模型算进指纹，
     *   否则会出现"模型换了、画面纹丝不动"——那类失效不报错，最难发现。
     */
    setOrbitalModel(p) {
      const m = (p && p.model) || 'hydrogenic';
      // ★ 只改控件，不直接调 OM.setRadialModel —— 与 setPsiCriterion 同一套写法。
      //   数学层的落点唯一在 `readFromControls`（applyAction 末尾会 recompute 一次，
      //   而 recompute 第一步就是 readFromControls）。两处都写就会有两套真源。
      if (!setSeg('#orbModelSeg', 'data-model', m)) return false;
      if (els.orbZetaInput) {
        const z = (p && typeof p.zeta === 'number' && p.zeta > 0) ? p.zeta : null;
        els.orbZetaInput.value = (z == null) ? '' : String(z);
        els.orbZetaInput.classList.remove('invalid');
      }
      return true;
    },

    /**
     * 多轨道同屏：把一组**等价**杂化轨道同时画出来（sp³ 四个 / sp² 三个 / sp 两个）。
     *
     * ★ 与叠加态是两回事：叠加态是**一个**态由多项组成，|Σcᵢψᵢ|² 只有一个函数，
     *   干涉项是物理的一部分，拆成 N 个面是错的（那条路径一个字节没动）。
     *   这里是场景里挂 N 个**各自独立**的态。
     * ★ 主面 = 第 0 个等价轨道，其余几个是它的**旋转克隆**（见 core/hybrids.js 与
     *   test-orbit-core ⑫ 的逐点对拍）。所以这里必须顺手把预设切成 `<集合>-1`：
     *   否则主面还是个不相干的普通轨道，画面就成了"一个别的面 + 三个 sp³ 克隆"，
     *   而且**不会报错**（四个瓣都在，只是其中一个不对）。
     */
    setOrbitals(p) {
      // ---- 路径 A：任意轨道列表（模型/demo 直接给 items；页面把主轨道补在最前面）----
      if (p && Array.isArray(p.items)) return actSetOrbitalItems(p.items);
      // ---- 路径 B：把当前正在编辑的轨道加进同屏（界面上的「＋」走这条）----
      if (p && p.add) return actAddCurrentOrbital(p.add);
      // ---- 路径 C：预设集合（原有语义，demo 脚本与既有测试都依赖它）----
      const setId = (p && p.set) || 'off';
      if (setId !== 'custom' && !setSeg('#multiSeg', 'data-s', setId)) return false;
      if (setId === 'custom') {
        setSeg('#multiSeg', 'data-s', 'custom');
        state.orbitalSet = 'custom';
        if (!state.orbitalMainColor) state.orbitalMainColor = ORB_PALETTE[0].slice();
        multiListBuiltFor = null;
        return true;
      }
      // ★ 先把 state 认下来：readFromControls 靠"state 与 DOM 不一致"判断
      //   "用户刚换了集合"，认下来它才不会把 visible 重置成全开 ——
      //   那会丢掉本条动作明确指定的 visible（例如明确要求只显示 [0]）。
      state.orbitalSet = setId;
      const def = (setId === 'off') ? null : Hybrids.set(setId);
      if (!def) { state.orbitalVisible = []; return true; }
      state.orbitalVisible = Array.isArray(p && p.visible)
        ? p.visible.slice()
        : def.labels.map((_, i) => i);
      state.orbitals = [];          // 预设档与自定义档互斥（见 readFromControls 的说明）
      state.orbitalColorOverride = {};
      multiListBuiltFor = null;
      if (StateEditor && StateEditor.applyPreset) StateEditor.applyPreset(def.id + '-1');
      return true;
    },

    /**
     * 改某个同屏轨道的颜色或显隐（key 由快照里的 orbitalItems 给出）。
     *
     * ★ 单独做一个动作、而不是塞进 setOrbitals：这条**不重建几何**（只重涂顶点色），
     *   而 setOrbitals 会重建。混在一个动作里，"改个颜色"就会顺带重跑十几秒的等值面。
     */
    setOrbitalStyle(p) {
      const key = p && p.key;
      if (!key) return false;
      if (p.color !== undefined) {
        const rgb = Array.isArray(p.color) ? p.color : hexToRgb(p.color);
        if (!rgb || rgb.length !== 3) return false;
        if (!applyOrbitalColor(key, rgb)) return false;
      }
      if (p.visible !== undefined) {
        if (!applyOrbitalVisible(key, !!p.visible)) return false;
      }
      multiListBuiltFor = null;
      return true;
    },

    /** 清空全部额外轨道（主轨道留下；等于回到"只看当前这一个"） */
    clearOrbitals() {
      state.orbitals = [];
      if (state.orbitalSet === 'custom') { state.orbitalSet = 'off'; setSeg('#multiSeg', 'data-s', 'off'); }
      multiListBuiltFor = null;
      return true;
    },

    /**
     * 恢复一整套视图状态（供演示「上一步」回退使用）。
     *
     * ★ 为什么不让回退去"反向执行"原来的动作：动作语义是有副作用的
     *   （例如 setQuantumNumbers 会顺手退出叠加态），反向执行不一定回到原处。
     *   直接写回快照才是严格可逆的。
     * ★ 这里刻意**只改控件与 state、不触发重算**——重算由 applyAction 统一做一次，
     *   否则一次回退会连着重算七八遍（等值面每次约 250ms，会明显卡顿）。
     */
    restoreState(p) {
      const s = p && p.state;
      if (!s) return false;
      const silentSeg = (segId, attr, val) => {
        const btn = document.querySelector(segId + ' .seg-btn[' + attr + '="' + (val == null ? '' : val) + '"]');
        if (!btn) return;
        btn.parentElement.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      };
      // ★ 直接写 value、不派发 input 事件 —— 所以不会触发 exitSuperposition
      //   （恢复一套含叠加态的状态时，若在这里退出叠加态就会把刚恢复的 terms 清掉）。
      if (els.zSlider) els.zSlider.value = s.nuclearCharge || 1;
      // 量子数：先设 n 再设 l/m，范围才正确
      if (els.nSlider) els.nSlider.value = s.n;
      syncRanges();
      if (els.lSlider) els.lSlider.value = s.l;
      syncRanges();
      if (els.mSlider) els.mSlider.value = s.m;
      syncRanges();
      if (els.nInput) els.nInput.value = s.n;
      if (els.lInput) els.lInput.value = s.l;
      if (els.mInput) els.mInput.value = s.m;

      silentSeg('#modeSeg', 'data-mode', s.wavefunction);
      silentSeg('#renderSeg', 'data-mode', s.render);
      silentSeg('#psiSeg', 'data-mode', s.psiCriterion);
      // ★ 轨道模型（氢型/Slater）也必须回退。它是快照字段、又决定等值面形状，
      //   漏掉这一行就会出现「上一步」按了、模型没回去 —— 画面与快照当场矛盾，
      //   而且不报错（这类"回退了大部分"最难查）。
      silentSeg('#orbModelSeg', 'data-model', s.orbitalModel);
      // 多轨道同屏也要回退。★ 可见集合**只存在 state 里**（那一行复选框是按集合
      //   生成的，没有稳定的 DOM 可读），所以这里必须直接写 state —— 只改 DOM 的话
      //   集合回去了、可见集合还停在上一步，画面半对半错且不报错。
      //   （后面 applyAction 会 recompute → readFromControls → syncMultiUI 重建那一行。）
      silentSeg('#multiSeg', 'data-s', s.orbitalSet);
      state.orbitalSet = s.orbitalSet || 'off';
      state.orbitalVisible = (typeof s.orbitalVisible === 'string' && s.orbitalVisible !== '')
        ? s.orbitalVisible.split(',').map(Number) : [];
      // ★ 自定义档的额外轨道也要回退，否则「上一步」会留下上一步才有的轨道 ——
      //   画面与快照当场矛盾，而且不报错（这类"回退了大部分"最难查）。
      state.orbitals = parseOrbitalItems(s.orbitalItems);
      state.orbitalMainVisible = true;
      state.orbitalMainColor = null;
      // 覆盖色不从快照恢复：orbitalItems 里已经带着**生效后的**颜色，
      // 而预设档的基准色由 Hybrids 给出 —— 两处都记会变成两个真源。
      state.orbitalColorOverride = {};
      multiListBuiltFor = null;
      if (els.orbZetaInput) {
        els.orbZetaInput.value = (s.orbitalZeta == null) ? '' : String(s.orbitalZeta);
        els.orbZetaInput.classList.remove('invalid');
      }
      silentSeg('#planeSeg', 'data-p', s.plane);
      silentSeg('#phaseSeg', 'data-mode', s.sectionMode);
      silentSeg('#yCritSeg', 'data-k', s.angularWhich);
      silentSeg('#targetSeg', 'data-target', s.viewTarget);
      // 球谐档要收起量子态入口（第 9 条）；这里只改控件不重算 —— 重算由 applyAction 统一做
      if (StateEditor && StateEditor.setAvailable) {
        StateEditor.setAvailable(s.viewTarget !== 'spherical');
      }
      // 径向曲线组是多选
      const want = s.radial || [];
      document.querySelectorAll('#radialSeg .seg-btn').forEach((b) => {
        b.classList.toggle('active', want.indexOf(b.getAttribute('data-k')) >= 0);
      });
      if (!document.querySelector('#radialSeg .seg-btn.active')) {
        const db = document.querySelector('#radialSeg .seg-btn[data-k="D"]');
        if (db) db.classList.add('active');
      }
      if (els.levelSlider) els.levelSlider.value = levelToSlider(s.levelFraction);
      if (els.pointCountSlider) els.pointCountSlider.value = s.pointCount;

      const cb = document.querySelector('#autoRotate');
      if (cb) {
        cb.checked = !!s.autoRotate;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 叠加态（含相对相位）
      state.terms = (s.terms || []).map((t) => ({
        n: t.n, l: t.l, m: t.m, mode: t.mode || 'real', c: { re: t.c.re, im: t.c.im },
      }));
      state.relPhase = s.relPhase || 0;
      return true;
    },
    setQuantumNumbers(p) {
      // ★ 指定了具体量子数即意味着"要看这个单一本征态" → 自动退出叠加态
      //   （判据与界面滑块共用 exitSuperposition，两条入口行为一致）。
      const given = (p.n != null) || (p.l != null) || (p.m != null);
      if (given) exitSuperposition();
      // n → l → m 依次设置，每步都收敛范围，避免越界被夹紧而丢失意图
      if (p.n != null) { setSlider(els.nSlider, p.n); syncRanges(); }
      if (p.l != null) { setSlider(els.lSlider, p.l); syncRanges(); }
      if (p.m != null) { setSlider(els.mSlider, p.m); syncRanges(); }
    },
    /**
     * 设置核电荷数 Z（类氢）。
     * ★ 与量子数不同，**换 Z 不退出叠加态** —— Z 是"原子"的属性，叠加态整体跟着
     *   缩放即可（psiSuperposition 已接受 Z），不需要退回纯态。
     */
    setNuclearCharge(p) {
      // ★ 范围从**控件本身**读，不另写一份 —— 两处各写一份就会像刚才那样：控件放开了、
      //   动作层还卡在 1–3，于是"界面上明明能拖到 5，动作却把 Z=5 拒了"。
      const lo = +els.zSlider.min, hi = +els.zSlider.max;
      const v = Math.round(+p.Z);
      if (!(v >= lo && v <= hi)) return false;
      setSlider(els.zSlider, v);
      return true;
    },
    setWavefunctionMode(p) { return setSeg('#modeSeg', 'data-mode', p.mode); },
    setRenderMode(p) { return setSeg('#renderSeg', 'data-mode', p.mode); },
    setPsiCriterion(p) { return setSeg('#psiSeg', 'data-mode', p.criterion); },
    setIsosurfaceLevel(p) {
      // ★ 滑块现在是 0–1000 的**对数刻度**（见 levelFromSlider），必须换算 ——
      //   把 fraction（0–1 的比值）直接写进滑块会落到刻度底部，阈值变得极小。
      //   setSlider 会派发 input，于是 levelUserAdjusted 自动置位：智能体明确指定过
      //   阈值，此后换轨道就不再套推荐值（否则会盖掉演示里设的值）。
      const f = Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, +p.fraction || LEVEL_MIN));
      return setSlider(els.levelSlider, levelToSlider(f));
    },
    setParticleCount(p) { return setSlider(els.pointCountSlider, p.count); },
    setAngularView(p) { return setSeg('#yCritSeg', 'data-k', p.which); },
    setViewTarget(p) {
      const ok = setSeg('#targetSeg', 'data-target', p.target);
      // 与界面点按钮同一条语义：切球谐档要退出叠加态并收起量子态入口（第 9 条）
      if (ok) applyViewTargetRules();
      return ok;
    },
    setSectionPlane(p) { return setSeg('#planeSeg', 'data-p', p.plane); },
    setSectionMode(p) { return setSeg('#phaseSeg', 'data-mode', p.mode); },
    showRadial(p) {
      const want = p.which || [];
      document.querySelectorAll('#radialSeg .seg-btn').forEach((b) => {
        b.classList.toggle('active', want.indexOf(b.getAttribute('data-k')) >= 0);
      });
      // 至少保留一条曲线，否则图表会空白
      if (!document.querySelector('#radialSeg .seg-btn.active')) {
        const d = document.querySelector('#radialSeg .seg-btn[data-k="D"]');
        if (d) d.classList.add('active');
      }
      return true;
    },
    setAutoRotate(p) {
      const cb = document.querySelector('#autoRotate');
      if (!cb) return false;
      cb.checked = !!p.on;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    /**
     * 径向图的特征标注（峰值 / 零点）—— 与曲线显隐是**同一套控件语义**：
     * 标线只画在"当前可见的曲线"上，关掉 R 曲线，R 的峰值线也跟着没了。
     * feature 为空表示清除标注。target='ALL' 时 R 与 D 各自用自己的颜色标。
     */
    setRadialMarks(p) {
      // ★ feature 支持**数组**（峰值与节点同屏，第 17 条）；传字符串时按"只标这一类"处理，
      //   保持向后兼容 —— 智能体沿用旧的单值写法依然有效。
      const raw = p && p.feature;
      const list = (raw == null) ? [] : (Array.isArray(raw) ? raw.slice() : [raw]);
      const target = (p && p.target) ? p.target : 'ALL';
      const seg = document.querySelector('#radialMarkSeg');
      if (seg) {
        seg.querySelectorAll('.seg-btn').forEach((b) => {
          b.classList.toggle('active', list.indexOf(b.getAttribute('data-m')) >= 0);
        });
      }
      if (Charts && Charts.setRadialHighlight) {
        Charts.setRadialHighlight(list.length ? target : null, list);
      }
      return true;
    },
    resetCamera() { Orbit3D.resetView(); return true; },
    /** 截面图的缩放/平移复位（智能体可用；对应图表角落的「复位缩放」小控件） */
    resetSectionView() { Charts.resetSectionView(); redrawSection(); return true; },

    // 公式按项高亮（'R'|'Y'|'L'|'P'|'N'|null）——三向联动的中枢
    setFormulaHighlight(p) { formulaHighlight = p.part || null; return true; },

    // ---- 叠加态（辅助功能）----
    setSuperposition(p) {
      const list = (p && p.terms) || [];
      state.terms = list.map(function (t) {
        return {
          n: t.n, l: t.l, m: t.m, mode: t.mode || 'real',
          c: t.c || { re: 1, im: 0 },
        };
      });
      state.relPhase = 0;
      return true;
    },
    clearSuperposition() { state.terms = []; state.relPhase = 0; state.chartTerm = 'super'; return true; },
    /**
     * 2D 图表画哪一份（第 G 批）：'super' = 叠加态整体（**只有截面图**能这么画），
     * 数字 = 叠加态中的第 i 个分量（从 0 起）。没有叠加态时该动作无效果。
     */
    setChartTerm(p) {
      const t = state.terms || [];
      if (!t.length) return false;
      const v = p && p.term;
      if (v === 'super' || v == null) { state.chartTerm = 'super'; return true; }
      const i = Number(v);
      if (!Number.isFinite(i) || i < 0 || i >= t.length) return false;
      state.chartTerm = Math.floor(i);
      return true;
    },
    setRelPhase(p) {
      const v = Number(p && p.phase);
      if (!Number.isFinite(v)) return false;
      state.relPhase = v;
      return true;
    },
    // ---- 演示脚本要用、而 main.js 的 ACTIONS 里没有的两个动作 ----
    // ★ 上游把它们实现在 `js/agent/scene-bridge.js`（动作执行层）里。chem-agent 的分镜
    //   队列由中枢的 storyboard 承担，所以这里只补"动作本身怎么落地"。

    /**
     * 把底部某张图放大到浮窗里讲（`target:'none'` 关闭）。
     *
     * ★ 上游把它做成**动作**而不是"脚本里直接调浮窗"：快照只记 OrbitApp 的状态，
     *   走动作后它天然进队列，按「上一步」回退时会被重放，浮窗开合与画面才能自洽。
     */
    /**
     * 三维参考环：把"径向分布图上的某个半径"落到画面上的位置。
     * ★ 上游把它实现在 scene-bridge 的扩展钩子里（`hooks.ringHighlight`），而钩子最终
     *   调的就是 `Orbit3D.ringHighlight`。这里直接接到视图上，少一层间接。
     * ★ `radius = 0` 表示清除。
     */
    linkRadialTo3D(p) {
      if (!Orbit3D || typeof Orbit3D.ringHighlight !== 'function') return false;
      const r = Number(p && p.radius);
      if (!Number.isFinite(r) || r < 0) return false;
      Orbit3D.ringHighlight(r);
      return true;
    },

    focusChart(p) {
      const t = (p && p.target) || 'none';
      if (t === 'none') {
        if (ChartOverlay && typeof ChartOverlay.close === 'function') ChartOverlay.close();
        return true;
      }
      if (!ChartOverlay || typeof ChartOverlay.open !== 'function') return false;
      return ChartOverlay.open(t) !== false;
    },

    /**
     * 阈值扫描：把等值面阈值从 `from` 平滑推过到 `to`（同步长扫描是本模块的核心演示手法）。
     *
     * ★ 每一步都走 `setIsosurfaceLevel`（与用户拖滑块**同一条通路**），于是图表、公式、
     *   感知痕迹都会跟着走；不另写一条"直接改 state"的快捷路径。
     * ★ 重复下发要先取消上一条，否则两条 rAF 会互相打架（阈值来回跳）。
     */
    animateIsosurfaceLevel(p) {
      const from = Number(p && p.from);
      const to = Number(p && p.to);
      const dur = Number(p && p.durationMs) || 1200;
      if (!Number.isFinite(from) || !Number.isFinite(to) || !(dur > 0)) return false;
      if (levelSweepRaf) { cancelAnimationFrame(levelSweepRaf); levelSweepRaf = null; }
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        ACTIONS.setIsosurfaceLevel({ fraction: from + (to - from) * k });
        if (k < 1) levelSweepRaf = requestAnimationFrame(step);
        else levelSweepRaf = null;
      };
      levelSweepRaf = requestAnimationFrame(step);
      return true;
    },
  };

  const actionListeners = [];

  const facade = {
    /** 只读状态快照（供 agent 的感知层使用） */
    getState() {
      const seg = (id, attr) => {
        const b = document.querySelector(id + ' .seg-btn.active');
        return b ? b.getAttribute(attr) : null;
      };
      return {
        n: state.n, l: state.l, m: state.m,
        nuclearCharge: state.Z,
        viewTarget: state.viewTarget,
        wavefunction: state.mode,
        render: state.renderMode,
        psiCriterion: state.psiCrit,
        levelFraction: state.level,
        pointCount: state.pointCount,
        plane: state.plane,
        sectionMode: state.sectionMode,
        angularWhich: state.angWhich,
        radial: state.radial.slice(),
        autoRotate: !!(document.querySelector('#autoRotate') || {}).checked,
        terms: state.terms.map(function (t) { return { n: t.n, l: t.l, m: t.m, mode: t.mode || 'real', c: { re: t.c.re, im: t.c.im } }; }),
        relPhase: state.relPhase,
        chartTerm: state.chartTerm,
        // 轨道模型也要进快照：模型每轮都在感知层做差分，
        // 而它决定的是"同一个 (n,l,m) 画成什么形状"——模型不知道它，就解释不了画面。
        orbitalModel: state.orbitalModel,
        orbitalZeta: state.orbitalZeta,
        // 多轨道同屏：字段**必须是顶层标量**。perception.js 的 diffStates 只比顶层，
        // 把可见性塞成嵌套对象会让痕迹退化成"每轮都说可见集合变了"。
        orbitalSet: state.orbitalSet,
        orbitalCount: (multiRenderSpec() || { items: [] }).items.length,
        orbitalVisible: state.orbitalVisible.join(','),
        orbitalShown: (multiRenderSpec() || { items: [] }).items
          .filter(function (it) { return it.visible !== false; }).length,
        /**
         * 同屏的**每一张面**：key|名字|可见|颜色|状态，用 ';' 连成一条标量串。
         *
         * ★ 必须是顶层标量：`perception.diffStates` 只比顶层，塞成嵌套对象会让痕迹
         *   退化成"每轮都说轨道清单变了"，而模型也读不到"我改了颜色之后画面变没变"。
         * ★ 为什么要把**颜色**也报给模型：用户这一轮要的正是"同屏时能改每个轨道的颜色"，
         *   而模型若读不到当前色，就没法回答"现在哪个是蓝的"，也就没法可靠地改它。
         * ★ 这里**只放稳定信息**（key / 名字 / 显隐 / 颜色 / 类型），
         *   不放"生成中/已生成"——那是瞬时的，排队建几张轨道时会翻好几次，
         *   而 diffStates 每轮都会把它当成"变化"记一笔，痕迹会被刷屏。
         *   进度单独走下面那个整数 orbitalBuilding。
         */
        orbitalItems: (function () {
          const spec = multiRenderSpec();
          if (!spec) return '';
          return spec.items.map(function (it) {
            return [it.key, it.label, it.visible === false ? '隐藏' : '显示',
              rgbToHex(it.color),
              it.terms ? ('叠加' + it.terms.length + '项') : '纯态'].join('|');
          }).join(';');
        })(),
        orbitalBuilding: (function () {
          const info = (Orbit3D.multiInfo ? Orbit3D.multiInfo() : null) || {};
          return info.pending || 0;
        })(),
      };
    },

    /** 应用一个受控动作。返回 { ok, error? } */
    applyAction(action) {
      // ★ 这几条错误信息**不进 DOM**（它们回给模型与调用方），扫描替换够不着，故走 t()。
      //   译文随界面语言走：英文界面下模型读到的失败原因也是英文，与提示词一致。
      if (!action || !action.action) return { ok: false, error: hostT('pages.orbit.err.missingAction') };
      const fn = ACTIONS[action.action];
      if (!fn) return { ok: false, error: hostT('pages.orbit.err.unknownAction', { action: action.action }) };
      let ok = true;
      try { ok = fn(action.params || {}) !== false; }
      catch (e) { return { ok: false, error: hostT('pages.orbit.err.threw', { message: (e && e.message) }) }; }
      if (!ok) return { ok: false, error: hostT('pages.orbit.err.invalidParams') };
      recompute();
      // 通知订阅者（量子态编辑器据此同步 UI；主动服务也可用）
      for (let i = 0; i < actionListeners.length; i++) {
        try { actionListeners[i](action); } catch (e) { /* 订阅者异常不影响主流程 */ }
      }
      return { ok: true };
    },

    /** 订阅视图变化（供主动服务与埋点使用） */
    onAction(fn) {
      if (typeof fn === 'function') actionListeners.push(fn);
      return () => {
        const i = actionListeners.indexOf(fn);
        if (i >= 0) actionListeners.splice(i, 1);
      };
    },

    /**
     * 把某张图按**当前状态**画进任意 canvas —— 供图表浮动窗复用同一条绘制路径。
     * ★ 卡片与浮窗必须共用这一条路径，否则两处的"当前状态"会各自漂移
     *   （浮窗里看到的可能不是卡片上那张图）。
     * ★ 这两个是**给浮窗模块直接调用的 API，不是动作** —— 它们先前被误加进了 ACTIONS
     *   表，而动作表只经 applyAction 派发；ChartOverlay 直接读的是 facade，于是拿到
     *   undefined、浮窗一直画不出内容（canvas 停在默认 300×150 空白）。
     */
    drawChartInto(target, canvas) {
      if (!canvas) return false;
      if (target === 'radial') {
        Charts.drawRadial(canvas, state.n, state.l, state.radial, state.Z);
        return true;
      }
      if (target === 'thetaPhi') {
        // ★ 与卡片路径（updateCharts）共用 chartTermState(false)：Θ/Φ 卡**画不了叠加态**
        //   （Σcᵢψᵢ 只有在各分量 n 相同时才能因子化出角度部分），两条路径必须取同一份，
        //   否则浮窗与卡片会显示两个不同的分量 —— 正是本文件开头警告的那种漂移。
        const rt = chartTermState(false);
        Charts.drawThetaPhi(canvas, rt.l, rt.m, rt.mode, deriveColorMode());
        return true;
      }
      if (target === 'section') {
        // ★ 必须与卡片路径（updateCharts）用**同一套参数**。原先这里直接传 state.n/l/m
        //   且**漏掉了 terms 与 relPhase**，于是有叠加态时浮窗里画的是纯态、卡片上画的
        //   是叠加态 —— 同一张图在两个地方长得不一样，而浮窗恰恰是"放大给学生看"的那份。
        //   chartTermState 是"该画哪一份"的唯一出口，两条路径都走它，别再各写一套。
        const st = chartTermState(true);
        Charts.drawSection(canvas, st.n, st.l, st.m, st.mode, state.plane, state.sectionMode, state.Z,
          (st.kind === 'super') ? st.terms : null, state.relPhase,
      state.psiCrit, state.level);   // 后两个参数供「等值面对应的那条线」换算阈值
        return true;
      }
      // 球谐曲面不是图表（它是主三维视图本身）；下面那张 Θ/Φ 卡片倒是普通 2D canvas，
      // 技术上可以支持浮窗，本轮先不开放，留作后续。
      return false;
    },

    /**
     * 给浮窗里的 canvas 绑上与卡片同一套交互（目前只有截面图有可交互的内容）。
     * 视图变化时**两处都要重画** —— sectionView 是两者共享的状态。
     */
    attachChartInteractions(target, canvas, onRedraw) {
      if (target !== 'section') return false;
      return attachSectionView(canvas, () => {
        redrawSection();                  // 卡片（含「复位缩放」小控件的显隐）
        if (onRedraw) onRedraw();         // 浮窗自己
      });
    },

    /**
     * 给一个「进阶」折叠区绑「展开即滚进视野」（第 2 条）。
     * ★ 必须导出：「量子态」那个折叠区是 state-editor.js 动态建的，它建完要调这里。
     */
    bindAdvScroll: bindAdvScroll,
    // ★ 拖动中"降档粗渲染"标记的**唯一所有者**（见 armPreview / disarmPreview）。
    //   量子态编辑器的相位滑块也要降档，让它走这两个出口而不是直接写
    //   window.__ORBIT_PREVIEW__ —— 那个标志现在还决定网格分辨率，一旦卡在 true，
    //   画面会永久停在粗档上（谁写的谁负责清，是这类标志唯一站得住的做法）。
    armPreview: armPreview,
    disarmPreview: disarmPreview,

    /** 导出当前视图为 PNG（教师备课用） */
    exportViewPNG() {
      try { return els.viewer.querySelector('canvas').toDataURL('image/png'); }
      catch (e) { return null; }
    },
  };

  // ---------------------------------------------------------------------------
  // 交给壳 + 依赖注入
  // ---------------------------------------------------------------------------
  // ★ 上游把 facade 挂到 `window.OrbitApp`，其它脚本再去全局里抓它。
  //   进了统一壳之后这条「互抓」的路径被彻底切断：
  //     · 壳通过 `deps.onReady(facade)` 拿到它（模块门面再包一层契约）
  //     · 下面三个模块改为**由页面注入**（方向反过来）
  Orbit3D.configure({ getState: () => facade.getState() });
  ChartOverlay.configure({ getApp: () => facade });
  StateEditor.configure({
    getApp: () => facade,
    getPanel: () => (deps && deps.panel) || null,
  });
  if (typeof deps.onReady === 'function') deps.onReady(facade);

  // ---- 启动 ---------------------------------------------------------------
  function start() {
    Orbit3D.init(els.viewer);
    bindEvent();
    // 进阶折叠区：展开后把新内容滚进可视区（第 2 条）。
    // ★ 这里管**静态**的那个（核电荷数）；「量子态」是 state-editor.js 动态建的，
    //   由它建完后自己调 OrbitApp.bindAdvScroll —— toggle 不冒泡，只能逐个绑。
    //   （原先还绑过一个「三维着色」折叠区，那个开关已按用户第 5 条删除。）
    bindAdvScroll(document.getElementById('zZone'));

    // ---- 页面级接线（上游在 js/agent/bootstrap.js 里做）----
    // ★ 漏掉这一段的症状是**功能静默缺失**，不是报错：
    //   · StateEditor 不 init → 叠加态编辑器整块不出现
    //   · orbit:reftable 无人监听 → 教材对照表入口点了没反应
    //   所以从上游移植时，main.js 与 bootstrap.js 要一起看——只搬 main.js 会缺这一层。
    if (StateEditor && typeof StateEditor.init === 'function') {
      try { StateEditor.init() } catch (e) { console.warn('[orbit] 量子态编辑器启动失败：', e) }
    }
    window.addEventListener('orbit:reftable', (ev) => {
      if (ReferenceTable && typeof ReferenceTable.toggle === 'function') {
        ReferenceTable.toggle((ev && ev.detail) || {})
      }
    });
    // 初始尺寸需要等布局稳定（slider 在 style 之后写回，重新布局）
    requestAnimationFrame(() => {
      recompute();
      Orbit3D.resize(els.viewer.clientWidth, els.viewer.clientHeight);
      animate();
    });
  }

  /**
   * 视口自适应。
   *
   * ★ 这一条是**独立版观感的一半**，而我们壳里原先整个缺了：
   *   两边的 CSS 都写着 `height: var(--viewer-h, 44vh)`，独立版有 layout.js 去算
   *   那个变量，我们没人算 —— 于是永远落在 44vh 这个**兜底值**上。
   *   实测：独立版画布 996×653，我们 996×353（宽度相同、高度不到一半）。
   *   同理 `--panel-h`（面板与三维卡片等高、内部自己滚）也没人算，
   *   面板便跟着自己的内容无限变高 —— 我们的面板比上游多了两组控件，
   *   同一行里三维卡片反被衬托得更矮。
   * ★ 选择器与上游一致（`#viewer` + `.topbar` / `.viewer-card .card-head`）：
   *   只观察"会改变画布顶端位置、又不受画布高度影响"的元素，避免自激。
   */
  const viewportFit = createViewport({
    viewerSelector: '#viewer',
    chromeSelectors: ['.topbar', '.viewer-card .card-head'],
  });
  viewportFit.init();

  // ★ 上游等 DOMContentLoaded，因为它是整页脚本。这里页面在 mount 时
  //   已经把 markup 注入容器，DOM 就绪，直接启动。
  start();

  /**
   * 语言变更后**只重画文案**（由壳在换语言时调用，见下面的 OrbitPage.onLangChange）。
   *
   * ★ 为什么需要它：走 `t()`/`hostT()` 取值的文案在**渲染那一刻**就把值算死了，
   *   DOM 扫描替换（restore + sweep）够不着 —— 它们不在 text 表里。
   *   静态文案由运行时自己处理，这里一个都不管。
   *
   * ★ **绝不调 recompute()**：那会重跑等值面流水线，本环境下**一张 10–15 秒**
   *   （无头软件渲染），换一次语言重建一次是不可接受的。下面每个函数都只改 DOM。
   *
   * ★ 缓存守卫要**先失效**再调：`sync*` 们各自记着"上次画的是什么"
   *   （realOrbL / lastPsiCritMode / multiListBuiltFor / lastZSummary），
   *   不清掉的话它们会以为"没变化"而直接 return —— 界面就停在旧语言上，且不报错。
   */
  function refreshI18n() {
    try { updateFormula(); } catch (e) { /* 公式区还没渲染 */ }
    try { updateOutputs(); } catch (e) { /* 控件未就绪 */ }
    try { syncOrbModelUI(); } catch (e) { /* 同上 */ }
    try { syncYCritHint(); } catch (e) { /* 同上 */ }
    try { lastPsiCritMode = null; syncPsiCritLabels(); } catch (e) { /* 同上 */ }
    try { realOrbL = -1; syncRealOrbitButtons(); } catch (e) { /* 同上 */ }
    try { lastZSummary = ''; syncZZoneSummary(); } catch (e) { /* 同上 */ }
    try { multiListBuiltFor = null; syncMultiUI(); } catch (e) { /* 同上 */ }
  }

  /**
   * 释放三维资源。
   * ★ `Orbit3D` 没有整体 dispose（它是按需建几何的），提供的是 `disposeGrid`；
   *   配上容器被清空，渲染器与几何都会随 canvas 一起被回收。
   */
  function dispose() {
    // ★ 必须先销毁视口适配器：它把 --viewer-h / --panel-h 写在 **documentElement** 上，
    //   是全局量 —— 不清掉的话切到点群页时，那边会顶着轨道页的画布高度。
    try { viewportFit.destroy(); } catch (e) { /* 忽略 */ }
    if (levelSweepRaf) { cancelAnimationFrame(levelSweepRaf); levelSweepRaf = null; }
    if (typeof offTheme === 'function') { try { offTheme() } catch (e) { /* 忽略 */ } offTheme = null; }
    try { Orbit3D.disposeGrid(); } catch (e) { /* 已经释放过了 */ }
    try { ChartOverlay.close(); } catch (e) { /* 浮窗本来就没开 */ }
    try { if (typeof deps.onDispose === 'function') deps.onDispose(); } catch (e) { /* 忽略 */ }
  }

  return { facade, dispose, refreshI18n };
}


// ---------------------------------------------------------------------------
// 壳里的一页
// ---------------------------------------------------------------------------
/**
 * 原子轨道的页面。
 *
 * ★ 与对称页的差别只有一处：orbit 的运行时是**这里的 bootOrbitPage 造出来的**，
 *   造完要交给模块（`onReady → module.attach`），卸载时要交还（`module.detach`）。
 *   否则门面会握着一个已经销毁的 DOM，动作全部打在空气上——
 *   而那种失败**不报错**，只表现为"智能体说它调了，画面没动"。
 */
export class OrbitPage {
  /**
   * @param {Object} ctx
   * @param {Object} ctx.module 由 orbit 的 createModule() 给出的模块包
   * @param {Object} [ctx.panel] 智能体面板（量子态编辑器发提示要用 addChip）
   */
  constructor(ctx = {}) {
    this._module = ctx.module || null
    this._panel = ctx.panel || null
    this._container = null
    this._api = null
  }

  mount(container) {
    this._container = container
    container.innerHTML = ORBIT_HTML

    this._api = bootOrbitPage({
      root: container,
      panel: this._panel,
      /**
       * 运行时造好了 → 交给模块。
       * ★ 这一步是"页面 ↔ 模块"的接缝：没有它，模块门面就没有状态可读、
       *   没有动作可下发（`canApplyActions()` 会一直是 false）。
       */
      onReady: (runtime) => {
        if (this._module && typeof this._module.attach === 'function') this._module.attach(runtime)
      },
    })
  }

  /**
   * 语言变更时由路由调用（见 shell/router.js 的 `_notifyLang`）。
   *
   * ★ 只重画**走 t() 的那几处文案**（徽标 / 阈值提示 / 同屏清单 / 错误信息…）。
   *   静态文案由运行时的 restore + sweep 处理；等值面几何与语言无关，
   *   **绝不重建**（一张要十几秒）—— 这一条是硬要求，见 router 与 HOWTO 的说明。
   */
  onLangChange() {
    if (this._api && typeof this._api.refreshI18n === 'function') {
      try { this._api.refreshI18n() } catch (e) { console.warn('[orbit] 语言变更重渲染失败：', e) }
    }
  }

  unmount() {
    // ★ 顺序：先解除模块对运行时的引用，再释放页面本身——
    //   反过来的话，dispose 过程中若触发一次动作通知，门面会去读已经拆了一半的 DOM。
    if (this._module && typeof this._module.detach === 'function') {
      try { this._module.detach() } catch (e) { /* 忽略 */ }
    }
    if (this._api && typeof this._api.dispose === 'function') {
      try { this._api.dispose() } catch (e) { /* 忽略 */ }
    }
    this._api = null
    if (this._container) this._container.innerHTML = ''
    this._container = null
  }
}

export default OrbitPage
