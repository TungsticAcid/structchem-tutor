/**
 * question-engine.js（orbit 模块 · 出题引擎）
 *
 * 本地出题 / 判分 / 讲解 / 费曼评估。题目与判定**全部本地**，不经模型。
 *
 * ★ 来自上游 `orbit/H5/js/agent/question-engine.js`（719 行）。转 ESM 时：
 *   自包含依赖（OM / Formula / Observables / MasteryModel）改 import；
 *   宿主相关（页面运行时 / 面板 / 分镜桥 / 知识库）改注入。
 *   算法与题库逐字未动。
 *
 * ---------------------------------------------------------------------------
 * i18n：题干 / 选项 / 解析 / 反馈 / 给模型的话（**都不进 DOM 扫描的范围**）
 * ---------------------------------------------------------------------------
 * 题库是"内容数据"，但它**不是静态 DOM**：题干与选项经 `renderRich()`（markdown +
 * KaTeX）渲染、被拆成好几个文本节点，解析经 `innerHTML` 出来；给模型的 runAgent
 * 提示词则根本不进 DOM。所以三条路都走不了 `text` 表，只能在这里显式接线：
 *   · 没有变量的整句（多半是**内容数据**：题干、选项、解析）→ 原文进
 *     `modules/orbit/i18n.js` 的 `text` 表，这里过 `t(原文)`；
 *   · 带变量/拼接的（`径向节点数 = n − l − 1 = {n} …`）→ 走 `zh/en` 的键。
 * ★ 取值一律发生在**出题/判分的那一刻**（每次 generate 都重新查表），
 *   绝不能在模块求值阶段算好 —— 那会把译文冻住且不报错。
 * ⚠ 本文件里 `t` 曾被用作局部循环变量（`const t = modes[0]`、`const t = rnd(list)`、
 *   `const t = String(transcript)`）——那些已改名，否则 i18n 的 `t()` 会变成
 *   "把对象当函数调"，而周围的 try/catch 会把它吞掉。
 */
import '../i18n.js'
import { t } from '../../../packages/i18n/index.js'
import { OM } from './math.js'
import { Formula } from './formula.js'
import { Observables } from './observables.js'
import { MasteryModel } from '../store/mastery.js'

/**
 * question-engine.js — 双通道出题引擎 + 练习闭环
 *
 * 通道 A（优先，~70%）：**数据驱动题** —— 题干与选项由计算层确定性生成，
 *   答案来自 math.js，从结构上杜绝幻觉。
 * 通道 B（兜底，~30%）：**概念题** —— 由模板生成，需通过自校验。
 *
 * 自校验（生成后自动执行）：选项去重、唯一正确、干扰项确实错误、数值与计算层一致；
 * 不通过即丢弃重生成。
 *
 * ★ 判定（GRADING）**不经过 LLM**：答案在出题时就已由计算层确定，判定只是比较下标。
 *   模型的任何解释都不参与对错判定——这是防幻觉的又一处结构性保障。
 */
const QuestionEngine = (function () {
  'use strict';

  // ★ 反向依赖端口（见文件顶部说明）：
  //   自包含的（OM / Formula / Observables / MasteryModel）走 import，
  //   宿主相关的（页面运行时 / 面板 / 分镜桥 / 知识库）走注入。
  let getApp = () => null;
  let getPanel = () => null;
  let getSceneBridge = () => null;
  let getKnowledge = () => null;

  const SUB = ['s', 'p', 'd', 'f', 'g', 'h'];
  const bank = Object.create(null);     // id → 题目
  const issued = [];                    // 本次会话已出的题 id
  let seq = 0;

  // 上游这里写 `const OM = () => window.OM;`；现在 OM 是 import 进来的，直接改用真名。
  const OMref = () => OM;
  const subOf = (n, l) => n + SUB[Math.min(l, SUB.length - 1)];
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];

  // ---------------------------------------------------------------------------
  // 选项装配 + 自校验
  // ---------------------------------------------------------------------------
  function assemble(stem, correct, distractorPool, explanation, meta) {
    const opts = [];
    const seen = Object.create(null);
    const key = (v) => String(v);
    opts.push(correct); seen[key(correct)] = 1;

    for (let i = 0; i < distractorPool.length && opts.length < 4; i++) {
      const d = distractorPool[i];
      if (d == null) continue;
      if (seen[key(d)]) continue;          // 自校验：干扰项不得与任何已有选项重复
      opts.push(d); seen[key(d)] = 1;
    }
    if (opts.length < 4) return null;      // 自校验不通过 → 丢弃重生成

    // 洗牌并记录正确下标
    const order = opts.map((v, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    const shuffled = order.map((i) => opts[i]);
    const answerIndex = order.indexOf(0);

    if (answerIndex < 0 || shuffled.length !== 4) return null;

    const id = 'q' + (++seq);
    const q = {
      id: id,
      kp: meta.kp,
      difficulty: meta.difficulty || 'core',
      stem: stem,
      options: shuffled,
      answerIndex: answerIndex,
      explanation: explanation,
      /** 答错时可据此把视图切到"暴露错误根源"的状态 */
      diagnosticHint: meta.diagnosticHint || null,
      presetView: meta.presetView || null,
      origin: meta.origin || 'A',
    };
    bank[id] = q;
    return q;
  }

  // ---------------------------------------------------------------------------
  // 通道 A：数据驱动题模板（答案全部来自计算层）
  // ---------------------------------------------------------------------------
  const BUILDERS = {
    /** 径向节点数 */
    radialNodes(pick) {
      const { n, l } = pick;
      const nd = OMref().nodes(n, l);
      const stem = t('orbit.qe.radialNodes.stem', { name: subOf(n, l) });
      return assemble(stem, nd.radial,
        [nd.angular, nd.total, nd.radial + 1, Math.max(0, nd.radial - 1)],
        t('orbit.qe.radialNodes.exp', { n: n, l: l, radial: nd.radial, angular: nd.angular, total: nd.total }),
        { kp: 'K5', difficulty: 'core', diagnosticHint: 'radial-nodes',
          // ★ level 一律按 **|ψ|² 语义**写（0.08 = 占 |ψ|² 峰值的 8%）。
          //   gotoStructure 会在下发前按当前判据换算，所以这里**不要**跟着默认判据去改 ——
          //   改了反而会被再平方一次。新增 presetView 也照此口径。
          presetView: { n: n, l: l, m: 0, radial: ['D'], render: 'surface', level: 0.08 } });
    },

    /** 角度节面数 */
    angularNodes(pick) {
      const { n, l } = pick;
      const nd = OMref().nodes(n, l);
      const stem = t('orbit.qe.angularNodes.stem', { name: subOf(n, l) });
      return assemble(stem, nd.angular,
        [nd.radial, nd.total, nd.angular + 1, Math.max(0, nd.angular - 1)],
        t('orbit.qe.angularNodes.exp', { angular: nd.angular }),
        { kp: 'K5', difficulty: 'basic',
          presetView: { n: n, l: l, m: 0, sectionMode: 'contour' } });
    },

    /** 总节点数 */
    totalNodes(pick) {
      const { n, l } = pick;
      const nd = OMref().nodes(n, l);
      const stem = t('orbit.qe.totalNodes.stem', { name: subOf(n, l) });
      return assemble(stem, nd.total,
        [nd.radial, nd.angular, nd.total + 1, n],
        t('orbit.qe.totalNodes.exp', { total: nd.total }),
        { kp: 'K5', difficulty: 'core' });
    },

    /** 能级 */
    energy(pick) {
      const n = pick.n;
      const E = OMref().energy(n);
      const stem = t('orbit.qe.energy.stem', { n: n });
      return assemble(stem, E.toFixed(2) + ' eV',
        [OMref().energy(n + 1).toFixed(2) + ' eV', OMref().energy(Math.max(1, n - 1)).toFixed(2) + ' eV',
         (-13.6).toFixed(2) + ' eV'],
        t('orbit.qe.energy.exp', { n: n, E: E.toFixed(2) }),
        { kp: 'K1', difficulty: 'basic' });
    },

    /** 简并度 */
    degeneracy(pick) {
      const n = pick.n;
      const d = OMref().degeneracy(n);
      const stem = t('orbit.qe.degeneracy.stem', { n: n });
      return assemble(stem, d, [2 * n + 1, n, 2 * d, d - 1],
        t('orbit.qe.degeneracy.exp', { d: d, d2: 2 * d }),
        { kp: 'K1', difficulty: 'basic' });
    },

    /** D(r) 峰值半径（函数辨析） */
    radialPeak(pick) {
      const { n, l } = pick;
      const peaks = OMref().radialPeaks(n, l);
      const main = peaks[peaks.length - 1];
      const stem = t('orbit.qe.radialPeak.stem', { name: subOf(n, l) });
      return assemble(stem, main.toFixed(1) + ' a₀',
        [(n * n).toFixed(1) + ' a₀', (0).toFixed(1) + ' a₀', (peaks[0]).toFixed(1) + ' a₀', (main * 1.8).toFixed(1) + ' a₀'],
        t('orbit.qe.radialPeak.exp', { main: main.toFixed(1) }),
        { kp: 'K3', difficulty: 'core', diagnosticHint: 'R-vs-D',
          presetView: { n: n, l: l, m: 0, radial: ['R', 'D'] } });
    },

    /** 1s 概率最大半径（特例，考点明确） */
    peak1s() {
      const peaks = OMref().radialPeaks(1, 0);
      const stem = t('对 **1s** 轨道，电子出现概率最大的半径是？（单位 a₀）');
      return assemble(stem, '1.0 a₀', [t('0（原子核处）'), '0.5 a₀', '2.0 a₀', t('无限远')],
        t('1s 的 D(r) = r²R² 峰值在 **r = 1 a₀**。常见的错选是「0」——因为 R(r) 确实在原点最大，但球壳体积 ∝ r²，两者相乘后原点处为零。'),
        { kp: 'K3', difficulty: 'basic', diagnosticHint: 'R-vs-D',
          presetView: { n: 1, l: 0, m: 0, radial: ['R', 'D'] } });
    },

    /** 角度节面几何（锥面 vs 平面） */
    angularGeometry(pick) {
      const { l, m } = pick;
      // 传带符号的 m（与 render3d 的节面渲染同一口径）：本函数只数**个数**，
      // 而 cos 型与 sin 型的零点个数相同（都是 |m| 个），所以这里改与不改结果一样 ——
      // 但几何**位置**不同，将来若要用到位置，取绝对值就会静默给错。
      const a = OMref().angularNodes(l, m, 'real');
      const nCones = a.cones.length, nPlanes = a.planes.length;
      const shape = (nCones && nPlanes) ? t('orbit.qe.angGeo.both', { cones: nCones, planes: nPlanes })
        : (nCones ? t('orbit.qe.angGeo.cones', { cones: nCones })
                  : t('orbit.qe.angGeo.planes', { planes: nPlanes }));
      // ★ 实轨道用**名字**指代，不写 m —— m 是复球谐的本征值指标，实解不是 L̂z 的
      //   本征函数，拿它当实轨道的代号等于贴上一个它不再拥有的量子数。
      const nm = (Formula && Formula.realOrbitalLabelPlain)
        ? Formula.realOrbitalLabelPlain(l, m) : (l + ',' + m);
      const stem = t('orbit.qe.angGeo.stem', { name: pick.n + nm });
      return assemble(stem, shape,
        [t('orbit.qe.angGeo.wPlanesCones', { planes: nPlanes }),
         t('orbit.qe.angGeo.wConesPlanes', { cones: nCones }),
         t('orbit.qe.angGeo.wAllCones', { n: nCones + nPlanes }),
         t('没有角度节面')],
        t('orbit.qe.angGeo.exp', { shape: shape }),
        { kp: 'K5', difficulty: 'challenge',
          presetView: { n: pick.n, l: l, m: m, sectionMode: 'contour' } });
    },

    /** R 与 D 的峰值位置辨析 */
    rVsD(pick) {
      const { n, l } = pick;
      const stem = t('orbit.qe.rVsD.stem', { name: subOf(n, l) });
      return assemble(stem, t('R(r) 的最大值出现在 r = 0，但概率最大的半径不是 0'),
        [t('R(r) 与 D(r) 的峰值半径总是相同'), t('D(r) 的最大值一定在 r = 0'),
         t('概率最大的半径与 n 无关')],
        t('R(r) 在原点最大（对 l=0），但 D(r) = r²R² 含球壳体积因子 r²，其峰值在 **r ≈ n²a₀**。\n★ "概率幅最大"与"概率最大"是两件事。'),
        { kp: 'K3', difficulty: 'core', diagnosticHint: 'R-vs-D',
          presetView: { n: n, l: l, m: 0, radial: ['R', 'D'] } });
    },

    /** |ψ| 与 |ψ|² 判据换算（双向出题，模板数翻倍） */
    psiVsPsi2() {
      const vals = [4, 9, 16, 25];                 // 取平方数，开方后答案干净
      const pct = vals[Math.floor(Math.random() * vals.length)];
      const root = Math.sqrt(pct / 100) * 100;
      if (Math.random() < 0.5) {
        // 正向：给 |ψ|²，问 |ψ|
        const stem = t('orbit.qe.psiVsPsi2.stemF', { pct: pct });
        return assemble(stem, root.toFixed(0) + '%',
          [(pct * 2).toFixed(0) + '%', (pct / 2).toFixed(0) + '%', (100 - pct).toFixed(0) + '%'],
          t('orbit.qe.psiVsPsi2.expF', { pct: pct, root: root.toFixed(0) }),
          { kp: 'K8', difficulty: 'core' });
      }
      // 反向：给 |ψ|，问 |ψ|²
      const stem = t('orbit.qe.psiVsPsi2.stemR', { pct: root.toFixed(0) });
      return assemble(stem, pct + '%',
        [(root * 2).toFixed(0) + '%', (100 - pct) + '%', (pct + 10) + '%'],
        t('orbit.qe.psiVsPsi2.expR', { root: root.toFixed(0), pct: pct }),
        { kp: 'K8', difficulty: 'core' });
    },

    /** 平均距离 ⟨r⟩（常见题型，解析式 + 已数值积分验证） */
    meanRadius(pick) {
      const { n, l } = pick;
      const OB = Observables;
      if (!OB) return null;
      const v = OB.meanR(n, l);
      const stem = t('orbit.qe.meanRadius.stem', { name: subOf(n, l) });
      const byR = v / 1.5, by2 = v * 1.5, byn2 = (n * n).toFixed(1) + ' a₀';
      return assemble(stem, v.toFixed(1) + ' a₀',
        [byR.toFixed(1) + ' a₀', by2.toFixed(1) + ' a₀', byn2, (0).toFixed(1) + ' a₀'],
        t('orbit.qe.meanRadius.exp', { n: n, l: l, l1: l + 1, v: v.toFixed(1) }),
        { kp: 'K3', difficulty: 'challenge',
          presetView: { n: n, l: l, m: 0, radial: ['D'] } });
    },

    /** 角动量与 z 轴的夹角（常见题型） */
    angleToZ(pick) {
      const { n, l, m } = pick;
      if (l === 0) return null;                    // l=0 角动量为零，夹角无定义
      const OB = Observables;
      if (!OB) return null;
      const a = OB.angleToZ(l, m);
      const correct = a.deg.toFixed(1) + '°';
      const deg = (x) => (Math.acos(Math.max(-1, Math.min(1, x))) * 180 / Math.PI).toFixed(1) + '°';
      // ★ LaTeX 片段**单独拼好再当变量传**：`$\psi_{n,l,m}$` 里的花括号会被 `t()` 的
      //   `{name}` 占位替换盯上（`${n}` 那种写法搬进译文表会变成"把 n 替换进去"）。
      const psiTex = '$\\psi_{' + n + ',' + l + ',' + m + '}$';
      const stem = t('orbit.qe.angleToZ.stem', { psi: psiTex });
      return assemble(stem, correct,
        [deg(m / l), deg(l / (l + 1)), (180 - a.deg).toFixed(1) + '°', '90.0°'],
        t('orbit.qe.angleToZ.exp', { m: m, l: l, l1: l + 1, correct: correct }),
        { kp: 'K9', difficulty: 'challenge' });
    },

    /** 由节面数反推量子数（常见反推题） */
    nodesReverse() {
      const wantR = 1, wantA = 2;          // 题面给定：径向节面 1 个、角度节面 2 个
      const stem = t('某氢原子波函数有 **一个径向节面**、**两个角度节面**。不查表，它的主量子数 n 与角量子数 l 分别是？');
      // ★ 选项里那个全角逗号（`n = 4，l = 2`）不是汉字，守卫看不见它 —— 但英文界面
      //   下它会原样留着。所以这一条也走键（中英的逗号不同）。
      const opt = (nn, ll) => t('orbit.qe.nodesReverse.opt', { n: nn, l: ll });
      const correct = opt(wantR + wantA + 1, wantA);
      return assemble(stem, correct,
        [opt(wantR + wantA, wantA),
         opt(wantA + 1, wantR),
         opt(wantR + 1, wantA),
         opt(wantR + wantA + 1, wantA + 1)],
        t('径向节面数 = n − l − 1，角度节面数 = l。\n由角度节面 2 个 ⇒ **l = 2**；代回 n − 2 − 1 = 1 ⇒ **n = 4**。\n★ 所以该态是 **4d**。检验：总节点数 = n − 1 = 3，与 1 + 2 = 3 一致。'),
        { kp: 'K5', difficulty: 'challenge',
          presetView: { n: 4, l: 2, m: 0, sectionMode: 'contour', spotlight: 'radial' } });
    },

    /** 能量分解：动能/势能平均值（维里定理） */
    energySplit(pick) {
      const n = pick.n;
      const OB = Observables;
      if (!OB) return null;
      const e = OB.energyBreakdown(n);
      const stem = t('orbit.qe.energySplit.stem', { n: n });
      return assemble(stem, e.V.toFixed(1) + ' eV',
        [e.T.toFixed(1) + ' eV', e.E.toFixed(1) + ' eV', (e.V * 0.5).toFixed(1) + ' eV', (-13.6).toFixed(1) + ' eV'],
        t('orbit.qe.energySplit.exp', { n: n, E: e.E.toFixed(2), V: e.V.toFixed(1), T: e.T.toFixed(1) }),
        { kp: 'K9', difficulty: 'challenge' });
    },


    complexSymmetry(pick) {
      const modes = [
        { q: t('**复函数**下轨道的密度为什么绕 z 轴对称？'),
          a: t('因为 |e^{imφ}| = 1，相位因子取模后消失'),
          w: [t('因为电子在绕 z 轴旋转'), t('因为复函数的 l 更小'), t('因为复函数没有角度节面')] },
      ];
      // ★ 变量不叫 `t`：本文件的 `t` 是 i18n 的取值函数（同名会把译文取值弄坏）。
      const md = modes[0];
      return assemble(md.q, md.a, md.w,
        t('|Y_l^m|² = N²·P²·|e^{imφ}|² = N²·P²，与 φ 无关 → 绕 z 轴旋转对称。\n实函数含 cos(mφ)/sin(mφ)，取模后仍依赖 φ → 呈定向的瓣。'),
        { kp: 'K6', difficulty: 'core' });
    },
  };

  // ---------------------------------------------------------------------------
  // 通道 B：概念题（模板 + 校验）
  //
  // ★ 这里存的是**键**而不是中文：本对象在**模块求值阶段**就构造好了，直接写
  //   `stem: t('…')` 会把译文冻在 import 那一刻（切语言不生效，且守卫照样绿）。
  //   取值放在 buildOnce 里，每次出题现取。
  // ---------------------------------------------------------------------------
  const CONCEPT = {
    K6: [
      {
        stem: 'orbit.qe.c.k6px.stem',
        correct: 'orbit.qe.c.k6px.correct',
        wrong: ['orbit.qe.c.k6px.w1', 'orbit.qe.c.k6px.w2', 'orbit.qe.c.k6px.w3'],
        exp: 'orbit.qe.c.k6px.exp',
      },
      {
        stem: 'orbit.qe.c.k6sym.stem',
        correct: 'orbit.qe.c.k6sym.correct',
        wrong: ['orbit.qe.c.k6sym.w1', 'orbit.qe.c.k6sym.w2', 'orbit.qe.c.k6sym.w3'],
        exp: 'orbit.qe.c.k6sym.exp',
      },
    ],
    K7: [
      {
        stem: 'orbit.qe.c.k7phase.stem',
        correct: 'orbit.qe.c.k7phase.correct',
        wrong: ['orbit.qe.c.k7phase.w1', 'orbit.qe.c.k7phase.w2', 'orbit.qe.c.k7phase.w3'],
        exp: 'orbit.qe.c.k7phase.exp',
      },
      {
        stem: 'orbit.qe.c.k7sign.stem',
        correct: 'orbit.qe.c.k7sign.correct',
        wrong: ['orbit.qe.c.k7sign.w1', 'orbit.qe.c.k7sign.w2', 'orbit.qe.c.k7sign.w3'],
        exp: 'orbit.qe.c.k7sign.exp',
      },
      {
        stem: 'orbit.qe.c.k7wind.stem',
        correct: 'orbit.qe.c.k7wind.correct',
        wrong: ['orbit.qe.c.k7wind.w1', 'orbit.qe.c.k7wind.w2', 'orbit.qe.c.k7wind.w3'],
        exp: 'orbit.qe.c.k7wind.exp',
      },
      {
        stem: 'orbit.qe.c.k7bond.stem',
        correct: 'orbit.qe.c.k7bond.correct',
        wrong: ['orbit.qe.c.k7bond.w1', 'orbit.qe.c.k7bond.w2', 'orbit.qe.c.k7bond.w3'],
        exp: 'orbit.qe.c.k7bond.exp',
      },
    ],
    K9: [
      {
        stem: 'orbit.qe.c.k9stat.stem',
        correct: 'orbit.qe.c.k9stat.correct',
        wrong: ['orbit.qe.c.k9stat.w1', 'orbit.qe.c.k9stat.w2', 'orbit.qe.c.k9stat.w3'],
        exp: 'orbit.qe.c.k9stat.exp',
      },
      {
        stem: 'orbit.qe.c.k9lz.stem',
        correct: 'orbit.qe.c.k9lz.correct',
        wrong: ['orbit.qe.c.k9lz.w1', 'orbit.qe.c.k9lz.w2', 'orbit.qe.c.k9lz.w3'],
        exp: 'orbit.qe.c.k9lz.exp',
      },
      {
        stem: 'orbit.qe.c.k9sp3.stem',
        correct: 'orbit.qe.c.k9sp3.correct',
        wrong: ['orbit.qe.c.k9sp3.w1', 'orbit.qe.c.k9sp3.w2', 'orbit.qe.c.k9sp3.w3'],
        exp: 'orbit.qe.c.k9sp3.exp',
      },
    ],
  };

  /** 概念题（通道 B）：把键解析成当前语言的题干 / 选项 / 解析 */
  function conceptOf(c) {
    return {
      stem: t(c.stem),
      correct: t(c.correct),
      wrong: c.wrong.map((k) => t(k)),
      exp: t(c.exp),
    };
  }

  // ---------------------------------------------------------------------------
  // 选点：为数据驱动题挑一组合适的量子数
  // ---------------------------------------------------------------------------
  function pickOrbital(kp) {
    const S = (getApp() && getApp().getState()) || { n: 3, l: 1, m: 0 };
    const cur = { n: S.n, l: S.l, m: S.m };
    switch (kp) {
      case 'K1': return { n: rnd([2, 3, 4]), l: 0 };
      case 'K3': return rnd([{ n: 1, l: 0 }, { n: 2, l: 0 }, { n: 3, l: 0 }, { n: 2, l: 1 }, cur]);
      case 'K5': return rnd([{ n: 3, l: 0 }, { n: 3, l: 1 }, { n: 3, l: 2 }, { n: 4, l: 2 }, { n: 5, l: 2 }, cur]);
      case 'K8': return cur;
      default: return cur;
    }
  }

  // ---------------------------------------------------------------------------
  // 对外：出题
  // ---------------------------------------------------------------------------
  /**
   * 按知识点构造一道题（不做去重）。
   * 返回 null 表示模板未能产出合法题目，交由调用方重试。
   */
  function buildOnce(kp, difficulty) {
    const pick = pickOrbital(kp);
    switch (kp) {
      case 'K1':
        return (Math.random() < 0.5 ? BUILDERS.energy(pick) : BUILDERS.degeneracy(pick));
      case 'K3':
        if (pick.n === 1 && pick.l === 0) return BUILDERS.peak1s();
        {
          const r = Math.random();
          if (r < 0.35) return BUILDERS.radialPeak(pick);
          if (r < 0.55) return BUILDERS.meanRadius(pick);      // ⟨r⟩：常见题型
          return BUILDERS.rVsD(pick);
        }
      case 'K5': {
        const r = Math.random();
        if (r < 0.2) return BUILDERS.nodesReverse();           // 由节面数反推 n、l
        return ([BUILDERS.radialNodes, BUILDERS.angularNodes, BUILDERS.totalNodes][Math.floor(Math.random() * 3)])(pick)
          || BUILDERS.angularGeometry({ n: 3, l: 2, m: rnd([0, 1, 2]) });
      }
      case 'K8':
        return BUILDERS.psiVsPsi2();
      case 'K9': {
        // 力学量数据题（答案完全来自 Observables 的解析式，零幻觉）
        if (Math.random() < 0.6) {
          const q = Math.random() < 0.5
            ? BUILDERS.energySplit({ n: rnd([1, 2, 3]) })
            : BUILDERS.angleToZ({ n: rnd([3, 4]), l: 2, m: rnd([-2, -1, 0, 1, 2]) });
          if (q) return q;
        }
        const c9 = conceptOf(rnd(CONCEPT.K9));
        const q9 = assemble(c9.stem, c9.correct, c9.wrong, c9.exp,
          { kp: 'K9', difficulty: difficulty || 'core', origin: 'B' });
        if (q9) q9.presetView = { advanced: true };
        return q9;
      }
      case 'K6': case 'K7': {
        const list = CONCEPT[kp] || CONCEPT.K6;
        // ★ 变量不叫 `t`：本文件的 `t` 是 i18n 的取值函数。
        const cq = conceptOf(rnd(list));
        return assemble(cq.stem, cq.correct, cq.wrong, cq.exp,
          { kp: kp, difficulty: difficulty || 'core', origin: 'B' });
      }
      default: {
        const pool = [BUILDERS.radialNodes, BUILDERS.angularNodes, BUILDERS.totalNodes, BUILDERS.radialPeak];
        return rnd(pool)(pick);
      }
    }
  }

  function generate(kp, difficulty, exclude) {
    // 去重只与**最近若干题**比较：概念题模板池有限，若与整个会话比较，
    // 出到第 5、6 题时会因"必然全部碰撞"而彻底无法出题。
    const avoid = (exclude || []).concat(issued.slice(-2));

    for (let i = 0; i < 14; i++) {
      const q = buildOnce(kp, difficulty);
      // 自校验：四选项、答案下标合法、题干不与最近出的重复
      if (!q || !q.options || q.options.length !== 4) continue;
      if (!(q.answerIndex >= 0 && q.answerIndex < 4)) continue;
      if (avoid.some((id) => bank[id] && bank[id].stem === q.stem)) continue;
      issued.push(q.id);
      return q;
    }

    // ★ 兜底：严格去重全部失败时，放开去重再试——
    //   宁可偶尔重复，也不能出现"出不了题"把教学流程卡死的情况。
    for (let k = 0; k < 6; k++) {
      const q2 = buildOnce(kp, difficulty);
      if (q2 && q2.options && q2.options.length === 4 && q2.answerIndex >= 0) {
        q2.duplicated = true;
        issued.push(q2.id);
        return q2;
      }
    }
    return { error: t('orbit.qe.err.buildFailed', { kp: kp }) };
  }

  /** 变式题：同知识点，变动一个维度 */
  function variant(questionId) {
    const q = bank[questionId];
    if (!q) return { error: t('orbit.qe.err.noOriginal', { id: questionId }) };
    const kp = q.kp;
    // 优先换量子数 / 换问法
    for (let i = 0; i < 8; i++) {
      const nq = generate(kp, q.difficulty, [questionId]);
      if (nq && !nq.error && nq.stem !== q.stem) {
        nq.isVariant = true;
        nq.fromQuestion = questionId;
        return nq;
      }
    }
    return { error: t('未能生成变式题') };
  }


  function get(id) { return bank[id] || null; }

  // ---------------------------------------------------------------------------
  // 讲解
  // ---------------------------------------------------------------------------
  function explain(kp, opts) {
    const K = getKnowledge();
    const entries = K ? K.byKnowledgePoint(kp) : [];
    const meta = MasteryModel ? MasteryModel.meta(kp) : null;
    return {
      knowledgePoint: kp,
      name: meta ? meta.name : kp,
      entries: entries.map((e) => ({ id: e.id, title: e.title, body: e.body, source: e.source,
        misconceptions: e.misconceptions })),
      presetView: opts && opts.presetView ? opts.presetView : (meta && meta.orbital ? meta.orbital[0] : null),
      tip: t('讲解时请按条目顺序组织，并配套 applySceneActions 把关键结论"演示"出来，而不是只念文字。'),
    };
  }

  // ---------------------------------------------------------------------------
  // 费曼复述评估（离线规则初筛，供模型参考）
  // ---------------------------------------------------------------------------
  /**
   * 费曼复述的评分要点（关键词组，命中一组得一分）。
   * ★ 这些中文**是匹配数据**，不是界面文案 —— 它们要和**学生自己打的字**比。所以
   *   逐词过 `t()`（原文登记在 `i18n.js` 的 `text` 表）：英文模式下学生用英文复述，
   *   拿中文关键词去 `indexOf` 会**全部落空**，表现为"复述缺少全部关键概念"且不报错。
   *   中文模式下 `t()` 原样返回原文（`tsrc` 在中文模式不替换），行为与从前一致。
   * ★ 纯 ASCII 的词（`n` / `l` / `r²` / `phi`）不过 `t()`：它们是符号或拉丁字母，
   *   翻译没有意义，而过一道没登记的表只会多一次查表、多一分被同名键误伤的机会。
   */
  const FEYNMAN_KEYS = {
    K3: [['r²', 'r方', '体积', '球壳'], ['峰值', '最大'], ['密度', '概率']],
    K5: [['节点', '节面'], ['径向', '角'], ['n', 'l']],
    K6: [['简并', '能量相同', '同能量'], ['组合', '叠加', '线性'], ['φ', 'phi', '相位', '轴对称']],
    K7: [['相位', '符号'], ['叠加', '干涉'], ['成键', '反键', '增强', '抵消']],
    K9: [['简并', '能量相同'], ['定态', '不随时间', '随时间'], ['系数', '模方', '概率']],
  };

  /** 复述评估用：把关键词表取成当前语言（纯 ASCII 的原样留着） */
  function feynmanKeys(kp) {
    return (FEYNMAN_KEYS[kp] || []).map((g) => g.map((k) => (/[^\x00-\x7F]/.test(k) ? t(k) : k)));
  }

  function evaluateFeynman(kp, transcript) {
    // ★ 变量不叫 `t`：本文件的 `t` 是 i18n 的取值函数（同名会把下面每一处取值弄坏）。
    const txt = String(transcript || '');
    const keys = feynmanKeys(kp);
    const groups = keys.map((g) => ({ hit: g.some((k) => txt.indexOf(k) >= 0), keys: g }));
    const hitCount = groups.filter((g) => g.hit).length;
    const missing = keys.filter((g, i) => !groups[i].hit).map((g) => g[0]);
    const verdict = hitCount >= keys.length ? 'complete'
      : (hitCount >= Math.ceil(keys.length / 2) ? 'partial' : 'insufficient');
    return {
      knowledgePoint: kp,
      verdict: verdict,
      coveredGroups: hitCount,
      totalGroups: keys.length,
      missingKeywords: missing,
      suggestedMasteryDelta: verdict === 'complete' ? 2 : (verdict === 'partial' ? 1 : 0),
      note: verdict === 'complete'
        ? t('复述覆盖了全部关键概念，可判定掌握。')
        : t('复述缺少部分关键概念，请针对缺失项追问（不要直接说出答案）。'),
    };
  }

  // ---------------------------------------------------------------------------
  // 练习闭环 UI（状态机由 panel/主干驱动）
  // ---------------------------------------------------------------------------
  const flow = { active: false, kp: null, current: null, stage: 'idle' };

  function startFlow(kp) {
    flow.active = true;
    flow.kp = kp || null;
    if (!kp) return pickKnowledgePoint();
    return launch(kp);
  }

  function pickKnowledgePoint() {
    const P = getPanel();
    const list = MasteryModel ? MasteryModel.allKnowledgePoints() : ['K1', 'K3', 'K5', 'K6', 'K7', 'K8', 'K9'];
    let html = '<b>' + t('选择要练习的知识点：') + '</b><div class="agent-picker">';
    list.forEach((k) => {
      const m = MasteryModel.meta(k);
      const s = MasteryModel.summary()[k];
      // 复用学情那两个键（同一件事只有一个说法；也免得再往 text 表里塞同义条目）
      const tag = s.mastered ? t('orbit.kp.mastered') : (s.wrong ? t('orbit.kp.review') : '');
      html += '<button class="agent-pick-btn" data-kp="' + k + '">' + k + ' · ' + m.name +
        (tag ? '<span class="agent-pick-tag">' + tag + '</span>' : '') + '</button>';
    });
    html += '</div>';
    P.addMsg(html, 'assistant');
    const last = P.addMsg;   // 绑定点击
    document.querySelectorAll('.agent-pick-btn').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('.agent-pick-btn').forEach((x) => { x.disabled = true; });
        launch(b.getAttribute('data-kp'));
      };
    });
    return { ok: true, awaiting: 'knowledgePoint' };
  }

  /** 进入某知识点的讲解（走 LLM 的讲解节点），结束后给出"出题"入口 */
  async function launch(kp) {
    flow.kp = kp;
    flow.active = true;
    const meta = MasteryModel.meta(kp);
    await getPanel().runAgent(
      t('orbit.qe.agent.explain', { kp: kp, name: meta.name })
    );

    // 讲解结束 → 给出出题入口（闭环的下一步）
    const P = getPanel();
    const card = P.addMsg('<button class="agent-btn primary agent-go-quiz">' + t('我懂了，出题吧 →') + '</button>', 'assistant');
    const btn = card.querySelector('.agent-go-quiz');
    if (btn) btn.onclick = function () { btn.disabled = true; btn.textContent = t('出题中…'); askQuestion(); };
    return { ok: true, kp: kp };
  }

  /**
   * 出题并渲染题目卡（判定完全本地）。
   * ★ 支持显式指定 知识点 / 难度 / 去重表：智能体的 generateQuestion 工具要用它 ——
   *   模型要考的知识点不一定等于 flow.kp（"接住刚才那条线"指的是**上一题**那条线）。
   *   无参调用时行为与从前完全一致（内部仍回落到 flow.kp）。
   */
  function askQuestion(kp, difficulty, exclude) {
    const q = generate(kp || flow.kp || 'K5', difficulty, exclude);
    renderQuestion(q);
    return q;
  }

  /** 渲染题目卡（判定完全本地，不经 LLM） */
  function renderQuestion(q) {
    if (!q || q.error) { getPanel().addMsg('<span class="agent-err">' + (q && q.error) + '</span>', 'assistant'); return; }
    flow.current = q;
    const P = getPanel();
    let html = '<div class="agent-q"><div class="agent-q-kp">' + t('orbit.qe.card.kp', { kp: q.kp, difficulty: q.difficulty }) + '</div>' +
      '<div class="agent-q-stem">' + P.renderRich(q.stem) + '</div><div class="agent-opts">';
    q.options.forEach((o, i) => {
      html += '<button class="agent-opt" data-i="' + i + '">' +
        String.fromCharCode(65 + i) + '. ' + P.renderRich(String(o)) + '</button>';
    });
    html += '</div></div>';
    P.addMsg(html, 'assistant');
    const card = document.querySelector('.agent-msg.assistant:last-of-type');
    card.querySelectorAll('.agent-opt').forEach((b) => {
      b.onclick = () => answer(q.id, +b.getAttribute('data-i'), card);
    });
  }

  /** 判定 —— 纯本地比较，不经过 LLM */
  function answer(questionId, chosenIndex, cardEl) {
    const q = bank[questionId];
    if (!q) return { error: t('题目不存在') };
    const correct = (chosenIndex === q.answerIndex);
    // 标记选项
    if (cardEl) {
      cardEl.querySelectorAll('.agent-opt').forEach((b) => {
        const i = +b.getAttribute('data-i');
        b.disabled = true;
        if (i === q.answerIndex) b.classList.add('right');
        if (i === chosenIndex && !correct) b.classList.add('wrong');
      });
    }
    // 掌握度
    if (MasteryModel) MasteryModel.update(q.kp, correct ? 1 : -1);

    const P = getPanel();
    let fb = '<div class="agent-fb ' + (correct ? 'ok' : 'bad') + '">' +
      '<b>' + (correct ? t('✓ 答对了') : t('✗ 不对')) + '</b>' +
      '<div class="agent-fb-exp">' + P.renderRich(q.explanation) + '</div>';
    if (q.presetView) {
      fb += '<button class="agent-btn agent-goto" data-qid="' + q.id + '">' + t('去看结构 →') + '</button>';
    }
    fb += '</div>';
    P.addMsg(fb, 'assistant');
    const fbEl = document.querySelector('.agent-msg.assistant:last-of-type .agent-goto');
    if (fbEl) fbEl.onclick = () => gotoStructure(q);

    // 答错 → 触发诊断节点（走 LLM，让它组织引导语并执行诊断动作）
    if (!correct) {
      P.runAgent(t('orbit.qe.agent.wrong', {
        id: q.id, chosen: chosenIndex + 1, correct: q.answerIndex + 1,
      }));
    } else {
      P.runAgent(t('orbit.qe.agent.right', { id: q.id }));
    }
    return { correct: correct, answerIndex: q.answerIndex };
  }

  /** 「去看结构」：一键溯源，且观察状态已预置 */
  function gotoStructure(q) {
    if (!q.presetView) return;
    const p = q.presetView;
    const actions = [];
    const qn = {};
    if (p.n != null) qn.n = p.n;
    if (p.l != null) qn.l = p.l;
    if (p.m != null) qn.m = p.m;
    if (Object.keys(qn).length) actions.push({ action: 'setQuantumNumbers', params: qn });
    if (p.render) actions.push({ action: 'setRenderMode', params: { mode: p.render } });
    // ★ presetView.level 是按 **|ψ|² 语义**手调的（见题库里那个 0.08 的标注）。而同一个读数
    //   在 ψ 判据下对应的绝对阈值是它的**平方**（|ψ|=f ⟹ |ψ|²=f²），差一个量级 ——
    //   直接下发会让"一键溯源"落到一张比预期大得多的面上。故按当前判据换算一次，
    //   保持**同一张面**；判据本身不动（免得顺带把颜色也换了）。
    if (p.level) {
      const crit = (getApp() && OrbitApp.getState)
        ? (getApp().getState().psiCriterion || 'psi2') : 'psi2';
      const fr = (crit === 'psi') ? Math.sqrt(p.level) : p.level;
      actions.push({ action: 'setIsosurfaceLevel', params: { fraction: fr } });
    }
    if (p.radial) actions.push({ action: 'showRadial', params: { which: p.radial } });
    if (p.sectionMode) actions.push({ action: 'setSectionMode', params: { mode: p.sectionMode } });
    getSceneBridge().applySequence(actions);
    getPanel().addChip(t('已切换到对应结构（观察状态已预置）'));
  }

  function next() { return generate(flow.kp || 'K5'); }

  /**
   * 注入宿主依赖（见文件顶部说明）。参数缺省时保持原值。
   */
  function configure(d) {
    d = d || {};
    if (typeof d.getApp === 'function') getApp = d.getApp;
    if (typeof d.getPanel === 'function') getPanel = d.getPanel;
    if (typeof d.getSceneBridge === 'function') getSceneBridge = d.getSceneBridge;
    if (typeof d.getKnowledge === 'function') getKnowledge = d.getKnowledge;
  }

  return { configure,
    generate, variant, get, explain, evaluateFeynman,
    startFlow, launch, askQuestion, renderQuestion, answer, gotoStructure, next,
    flow: flow,
    _bank: bank,
  };
})();
export { QuestionEngine }
export default QuestionEngine
