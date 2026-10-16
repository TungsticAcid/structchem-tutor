/**
 * question-engine.js — 点群观鉴的**练习闭环**（照轨道模块 `core/question-engine.js` 的流程做）。
 *
 * 用户要求（2026-10-12 第 7 条）：「点群观鉴的练习部分套用轨道视界的流程，缺少的内容你自己补齐」。
 * 于是这里补齐两样东西：
 *   ① **题库**：P1–P5 五个知识点的题目生成器
 *   ② **流程**：知识点选择 → 讲解（走 LLM）→ 出题卡（4 选项）→ 本地判定 → 讲评 → 追问
 *      （与轨道逐字同形：`startFlow / launch / pickKnowledgePoint / askQuestion / answer / next`）
 *
 * ★★ 铁律：**题目的答案一律由程序算**（`identifyPointGroup` / `generateGroupOperations` /
 *   `getCharacterTable`），模型不参与出题、也不参与判分。这与仓库里"数值一律程序算"同一条：
 *   让模型口算点群或特征标，错了看不出来，而且解析会为错答案编一套自洽的理由。
 * ★ 因此本文件**没有任何写死的化学事实**（唯一例外是 P5 的三道概念题 —— 空间群那部分
 *   需要 WASM，生成题目时不能异步等它；那三题按知识条目 P5-1/P5-3/P5-6 写成选项，
 *   并在 `cite` 里注明条目，方便对账）。
 * ★ 题目自带 `cite`（知识条目 id）：**只用于对账与测试**（守卫会独立重算并核对条目）。
 *   ★★ 2026-10-14（用户："用户不需要知道来源、知识条目"）：这行**不再渲染到学生界面上** ✗
 *     （原先讲评卡上有一行「依据：知识条目 symmetry:P2-3」，学生不需要也读不懂内部 id）。
 */
import '../i18n/index.js'
import { t } from '../../../packages/i18n/index.js'
import { EXAMPLES } from '../data/examples-index.js'
import { identifyPointGroup } from '../engine/pointGroup.js'
import { generateGroupOperations } from '../engine/groupOperations.js'
import { getCharacterTable } from '../engine/characterTables.js'
import { MasteryModel } from '../store/mastery.js'

const QuestionEngine = (function () {
  'use strict';

  // 反向依赖端口（上游靠 window 互抓；这里改成注入，见文件顶部的说明）
  let getPanel = () => null;
  let getApp = () => null;
  let getKnowledge = () => null;
  /** 「去看这个分子 →」怎么落地：宿主注入（模块内不 import 自己的 facade，否则循环依赖） */
  let gotoExample = () => null;

  const bank = Object.create(null);   // id → 题目
  const issued = [];                  // 本次会话已出过的题 id（去重用）
  let seq = 0;

  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const DIFFS = ['basic', 'core', 'challenge'];

  // ---------------------------------------------------------------------------
  // 选项装配 + 自校验（与轨道同一套判据）
  // ---------------------------------------------------------------------------
  /**
   * 把「正确答案 + 干扰项池」拼成 4 个不重复选项，洗牌并记下正确下标。
   * ★ 干扰项不足 4 个时**返回 null**（调用方换一题重生成），而不是硬凑 ——
   *   凑出来的选项会重复，学生一眼就知道答案在哪。
   */
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
    if (opts.length < 4) return null;      // 自校验不通过 → 丢弃重生
    const order = opts.map((v, i) => i);
    for (let i = order.length - 1; i > 0; i--) {          // Fisher–Yates
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    const shuffled = order.map((i) => opts[i]);
    const answerIndex = order.indexOf(0);
    if (answerIndex < 0) {
      const idx = shuffled.map(key).indexOf(key(correct));
      if (idx < 0) return null;
      return finish(stem, shuffled, idx, explanation, meta);
    }
    return finish(stem, shuffled, answerIndex, explanation, meta);
  }

  function finish(stem, options, answerIndex, explanation, meta) {
    if (!stem || !explanation) return null;
    if (!Array.isArray(options) || options.length !== 4) return null;
    const uniq = new Set(options.map((o) => String(o)));
    if (uniq.size !== 4) return null;      // 双保险：选项必须两两不同
    return {
      id: 'q-' + (++seq) * 7919,           // 与轨道同款：自增种子，题目因此每次不同
      stem: stem,
      options: options,
      answerIndex: answerIndex,
      explanation: explanation,
      kp: (meta && meta.kp) || null,
      difficulty: (meta && meta.difficulty) || 'core',
      exampleId: (meta && meta.exampleId) || null,
      cite: (meta && meta.cite) || null,
    };
  }

  /**
   * ★ 给模型的视图：**抹掉答案**（与晶体模块 `quiz/index.js`、轨道模块
   *   `orbit/core/question-engine.js` 的同名函数一致）。
   *
   * 为什么投影写在引擎里、而不是工具层：投影规则必须与题目对象的形状**放在同一个文件**。
   *   分开写的话，将来给题目加一个字段，投影那一处不会有任何提示 ——
   *   而漏掉的字段往往正好是答案。下面这份白名单就是"允许模型看见的全部字段"。
   *
   * ★ 本模块的 `options` 是**纯字符串数组**（见 `finish`），与晶体模块的对象数组不同 ——
   *   所以直接复制，**不要**照抄晶体的 `o => o.text`。
   *
   * @param {Object} q 引擎内部的题目对象（含 answerIndex / explanation）
   * @returns {Object} 只含题面与中性信息的安全对象
   */
  function toModelView(q) {
    if (!q || q.error) return q
    return {
      id: q.id,
      kp: q.kp,
      difficulty: q.difficulty,
      stem: q.stem,
      options: Array.isArray(q.options) ? q.options.slice() : [],
      note: t('symmetry.tool.generateQuestion.note'),
    }
  }

  // ---------------------------------------------------------------------------
  // 事实层：**全部由引擎算**（缓存：27 个示例各识别一次）
  // ---------------------------------------------------------------------------
  const facts = Object.create(null);

  /**
   * ★ 只用**分子**示例：`nacl` / `cscl` 是晶体（structure 带点阵、没有分子式的那套坐标），
   *   `identifyPointGroup` 对它们会抛 `a.xyz is not iterable` —— 晶体的对称性是**空间群**，
   *   不是点群（`queryPointGroup` 工具那条注释里也写明了同一件事）。
   *   判据用"能不能识别出点群"，而不是给示例表加一个 kind 字段：示例表是上游数据，别为了
   *   出题去改它；而且"识别失败就不出题"本身也是自校验。
   */
  function moleculeExamples() {
    if (!moleculeCache) {
      moleculeCache = [];
      EXAMPLES.forEach((ex) => {
        try {
          const r = identifyPointGroup(ex.structure);
          if (r && r.symbol) moleculeCache.push(ex);
        } catch (e) { /* 晶体示例：跳过（见上） */ }
      });
    }
    return moleculeCache;
  }
  let moleculeCache = null;

  function factsOf(ex) {
    if (!facts[ex.id]) {
      const r = identifyPointGroup(ex.structure);
      const ops = generateGroupOperations(ex.structure.atoms, r.elements);
      facts[ex.id] = {
        id: ex.id,
        title: ex.title,
        formula: ex.formula,
        symbol: r.symbol,
        name: r.name,
        elements: r.elements || [],
        order: ops.length,
        opNames: ops.map((o) => o.name),
        /**
         * ★★ **是否是有限群**：C∞v / D∞h 的阶是 ∞，而 `generateGroupOperations`
         *   只能给出**代表元**（∞C∞、∞σv 各取一个）。拿它去问"这个群有几阶""有几个
         *   对称元素"是**错的**（学生会背下一个假数字）——所以凡涉及计数/枚举的题，
         *   一律只在有限群里出。判据就是符号里有没有 ∞。
         */
        finite: String(r.symbol || '').indexOf('∞') < 0,
      };
    }
    return facts[ex.id];
  }

  /** 全部**分子**示例的事实（首次调用时算一次） */
  let allFacts = null;
  function all() {
    if (!allFacts) allFacts = moleculeExamples().map(factsOf);
    return allFacts;
  }

  function tableOf(symbol) { return getCharacterTable(symbol) || null; }

  // ---------------------------------------------------------------------------
  // 五类题目的生成器（每个返回 {stem, correct, distractors, explanation, meta} 或 null）
  // ---------------------------------------------------------------------------

  /** P1-a：这个分子有几个对称元素（不含恒等操作 E） */
  function q1ElementCount() {
    const f = rnd(all().filter((x) => x.finite && x.elements.length > 0));
    if (!f) return null;
    const n = f.elements.length;
    const correct = String(n);
    const pool = [String(n + 1), String(n - 1), String(n + 2), String(n - 2)]
      .filter((v) => Number(v) > 0);
    const kinds = f.elements.map((e) => e.labelPlain || e.label).join('、');
    return {
      stem: t('symmetry.q1.count.stem', { title: f.title, symbol: f.symbol }),
      correct: correct,
      distractors: pool,
      explanation: t('symmetry.q1.count.exp', { title: f.title, n: n, kinds: kinds, symbol: f.symbol }),
      meta: { kp: 'P1', difficulty: 'basic', exampleId: f.id, cite: 'symmetry:P1-1' },
    };
  }

  /** P1-b：最高次主轴是几重轴 */
  function q1MainAxis() {
    // ★ 同样只在**有限群**里出题：C∞v 的"最高次轴"是 ∞，问"几重轴"没有意义
    const cands = all().filter((f) => f.finite && f.elements.some((e) => /^C\d+$/.test(e.type)));
    const f = rnd(cands);
    if (!f) return null;
    const axes = f.elements.filter((e) => /^C\d+$/.test(e.type)).map((e) => Number(e.type.slice(1)));
    const n = Math.max.apply(null, axes);
    const correct = t('symmetry.q1.axis.opt', { n: n });
    const pool = [2, 3, 4, 6].filter((v) => v !== n).map((v) => t('symmetry.q1.axis.opt', { n: v }));
    return {
      stem: t('symmetry.q1.axis.stem', { title: f.title, symbol: f.symbol }),
      correct: correct,
      distractors: pool,
      explanation: t('symmetry.q1.axis.exp', { title: f.title, symbol: f.symbol, n: n }),
      meta: { kp: 'P1', difficulty: 'basic', exampleId: f.id, cite: 'symmetry:P1-2' },
    };
  }

  /** P1-c：下列哪一项**不是**该点群的对称操作 */
  function q1NotAnOperation() {
    const ALL_OPS = ['E', 'C2', 'C3', 'C4', 'C6', 'σ', 'i', 'S4', 'S6'];
    const cands = all().filter((f) => f.finite && f.opNames.length >= 3 && f.order < 48);
    const f = rnd(cands);
    if (!f) return null;
    const inGroup = ALL_OPS.filter((o) => f.opNames.indexOf(o) >= 0);
    const outGroup = ALL_OPS.filter((o) => f.opNames.indexOf(o) < 0);
    if (inGroup.length < 3 || !outGroup.length) return null;
    const wrong = rnd(outGroup);
    const correct = t('symmetry.q1.notop.opt', { op: wrong });
    const pool = inGroup.slice(0, 3).map((o) => t('symmetry.q1.notop.opt', { op: o }));
    return {
      stem: t('symmetry.q1.notop.stem', { title: f.title, symbol: f.symbol }),
      correct: correct,
      distractors: pool,
      explanation: t('symmetry.q1.notop.exp', {
        title: f.title, symbol: f.symbol, wrong: wrong, list: f.opNames.join('、'),
      }),
      meta: { kp: 'P1', difficulty: 'core', exampleId: f.id, cite: 'symmetry:P1-1' },
    };
  }

  /** P2-a：分子属于哪个点群 */
  function q2PointGroup() {
    const f = rnd(all());
    if (!f) return null;
    const others = Array.from(new Set(all().map((x) => x.symbol))).filter((s) => s !== f.symbol);
    const pool = [];
    while (pool.length < 3 && others.length) {
      const i = Math.floor(Math.random() * others.length);
      pool.push(others.splice(i, 1)[0]);
    }
    return {
      stem: t('symmetry.q2.group.stem', { title: f.title, formula: f.formula || '' }),
      correct: f.symbol,
      distractors: pool,
      explanation: t('symmetry.q2.group.exp', { title: f.title, symbol: f.symbol, name: f.name || '' }),
      meta: { kp: 'P2', difficulty: 'basic', exampleId: f.id, cite: 'symmetry:P2-2' },
    };
  }

  /** P2-b：该点群的阶（= 对称操作的个数） */
  function q2Order() {
    const f = rnd(all().filter((x) => x.finite && x.order >= 2 && x.order <= 24));
    if (!f) return null;
    const n = f.order;
    const correct = String(n);
    const pool = Array.from(new Set([n + 2, n - 2, n * 2, n + 4])).filter((v) => v > 0).map(String);
    return {
      stem: t('symmetry.q2.order.stem', { title: f.title, symbol: f.symbol }),
      correct: correct,
      distractors: pool,
      explanation: t('symmetry.q2.order.exp', { n: n, symbol: f.symbol, ops: f.opNames.join('、') }),
      meta: { kp: 'P2', difficulty: 'core', exampleId: f.id, cite: 'symmetry:P2-1' },
    };
  }

  /** P3-a：某个线性基函数（x/y/z）属于哪个不可约表示 */
  function q3LinearIrrep() {
    const SAMPLES = ['C2v', 'C3v', 'D2h', 'D3h', 'Td', 'D6h', 'C2h'];
    const symbol = rnd(SAMPLES);
    const tb = tableOf(symbol);
    if (!tb || !Array.isArray(tb.irreps)) return null;
    // 找一个"恰好属于某一个不可约表示"的坐标方向
    const axes = ['x', 'y', 'z'];
    const axis = rnd(axes);
    const hit = tb.irreps.filter((r) => String(r.linear || '').split(/[,，\s]+/).indexOf(axis) >= 0);
    if (hit.length !== 1) return null;    // 归属不唯一 → 换一题（不冒险）
    const correct = hit[0].label;
    const pool = tb.irreps.filter((r) => r.label !== correct).map((r) => r.label);
    return {
      stem: t('symmetry.q3.linear.stem', { symbol: symbol, axis: axis }),
      correct: correct,
      distractors: pool,
      explanation: t('symmetry.q3.linear.exp', {
        symbol: symbol, axis: axis, label: correct,
      }),
      meta: { kp: 'P3', difficulty: 'core', cite: 'symmetry:P3-3' },
    };
  }

  /** P3-b：读特征标表的某一格 */
  function q3CharRead() {
    const SAMPLES = ['C2v', 'C3v', 'D2h', 'C2h', 'D3h'];
    const symbol = rnd(SAMPLES);
    const tb = tableOf(symbol);
    if (!tb || !Array.isArray(tb.irreps) || !Array.isArray(tb.classes)) return null;
    const ir = rnd(tb.irreps);
    const ci = Math.floor(Math.random() * tb.classes.length);
    const v = ir.characters ? ir.characters[ci] : null;
    if (v == null) return null;
    const correct = String(v);
    const pool = Array.from(new Set([String(-v), String(v + 1), String(v - 1), String(v * 2)]))
      .filter((x) => x !== correct);
    return {
      stem: t('symmetry.q3.char.stem', { symbol: symbol, cls: tb.classes[ci], label: ir.label }),
      correct: correct,
      distractors: pool,
      explanation: t('symmetry.q3.char.exp', {
        symbol: symbol, cls: tb.classes[ci], label: ir.label, v: v,
      }),
      meta: { kp: 'P3', difficulty: 'basic', cite: 'symmetry:P3-3' },
    };
  }

  /** P4-a：哪个不可约表示是**红外活性**的（与 x/y/z 之一同类） */
  function q4IrActive() {
    const SAMPLES = ['C2v', 'C3v', 'D2h', 'D3h', 'Td', 'C2h'];
    const symbol = rnd(SAMPLES);
    const tb = tableOf(symbol);
    if (!tb || !Array.isArray(tb.irreps)) return null;
    const active = tb.irreps.filter((r) => String(r.linear || '').trim() !== '');
    const silent = tb.irreps.filter((r) => String(r.linear || '').trim() === '');
    if (!active.length || !silent.length) return null;   // 该群没有"红外非活性"的表示 → 换一题
    const correct = rnd(active).label;
    const pool = silent.map((r) => r.label);
    return {
      stem: t('symmetry.q4.ir.stem', { symbol: symbol }),
      correct: correct,
      distractors: pool,
      explanation: t('symmetry.q4.ir.exp', { symbol: symbol, label: correct }),
      meta: { kp: 'P4', difficulty: 'core', cite: 'symmetry:P4-1' },
    };
  }

  /** P4-b：哪个不可约表示是**拉曼活性**的（与二次项之一同类） */
  function q4RamanActive() {
    const SAMPLES = ['C2v', 'C3v', 'D3h', 'Td', 'D6h'];
    const symbol = rnd(SAMPLES);
    const tb = tableOf(symbol);
    if (!tb || !Array.isArray(tb.irreps)) return null;
    const active = tb.irreps.filter((r) => String(r.quadratic || '').trim() !== '');
    const silent = tb.irreps.filter((r) => String(r.quadratic || '').trim() === '');
    const correct = rnd(active).label;
    const pool = silent.map((r) => r.label);
    if (pool.length < 3) return null;
    return {
      stem: t('symmetry.q4.raman.stem', { symbol: symbol }),
      correct: correct,
      distractors: pool,
      explanation: t('symmetry.q4.raman.exp', { symbol: symbol, label: correct }),
      meta: { kp: 'P4', difficulty: 'challenge', cite: 'symmetry:P4-2' },
    };
  }

  /** P4-c：这个群有没有反演中心，红外与拉曼是否互斥（互斥 ⇔ 有 i） */
  function q4MutualExclusion() {
    const withI = all().filter((f) => f.elements.some((e) => e.type === 'i'));
    const withoutI = all().filter((f) => !f.elements.some((e) => e.type === 'i') && f.elements.length > 1);
    if (!withI.length || !withoutI.length) return null;
    const yesCase = Math.random() < 0.5;
    const f = yesCase ? rnd(withI) : rnd(withoutI);
    const hasI = yesCase;
    const correct = hasI ? t('symmetry.q4.mutex.yes') : t('symmetry.q4.mutex.no');
    const pool = [
      hasI ? t('symmetry.q4.mutex.no') : t('symmetry.q4.mutex.yes'),
      t('symmetry.q4.mutex.always'),
      t('symmetry.q4.mutex.never'),
    ];
    return {
      stem: t('symmetry.q4.mutex.stem', { title: f.title, symbol: f.symbol }),
      correct: correct,
      distractors: pool,
      explanation: hasI
        ? t('symmetry.q4.mutex.expYes', { symbol: f.symbol })
        : t('symmetry.q4.mutex.expNo', { symbol: f.symbol }),
      meta: { kp: 'P4', difficulty: 'core', exampleId: f.id, cite: 'symmetry:P4-3' },
    };
  }

  /**
   * P5：空间群那部分的三道**概念题**。
   * ★ 为什么是写死的选项而不是程序算：空间群分析要 WASM（异步），出题时不能等；
   *   而这三问的答案来自知识条目 P5-1/P5-2/P5-3，逐条对过账（`cite` 写在 meta 里）。
   *   题目里**没有任何数值**，所以不违反"数值一律程序算"。
   */
  function q5Concept() {
    const items = [
      {
        stem: 'symmetry.q5.trans.stem',
        correct: 'symmetry.q5.trans.opt.ok',
        pool: ['symmetry.q5.trans.opt.a', 'symmetry.q5.trans.opt.b', 'symmetry.q5.trans.opt.c'],
        exp: 'symmetry.q5.trans.exp',
        cite: 'symmetry:P5-1',
      },
      {
        stem: 'symmetry.q5.point.stem',
        correct: 'symmetry.q5.point.opt.ok',
        pool: ['symmetry.q5.point.opt.a', 'symmetry.q5.point.opt.b', 'symmetry.q5.point.opt.c'],
        exp: 'symmetry.q5.point.exp',
        cite: 'symmetry:P5-2',
      },
      {
        stem: 'symmetry.q5.screw.stem',
        correct: 'symmetry.q5.screw.opt.ok',
        pool: ['symmetry.q5.screw.opt.a', 'symmetry.q5.screw.opt.b', 'symmetry.q5.screw.opt.c'],
        exp: 'symmetry.q5.screw.exp',
        cite: 'symmetry:P5-3',
      },
    ];
    const it = rnd(items);
    return {
      stem: t(it.stem),
      correct: t(it.correct),
      distractors: it.pool.map((k) => t(k)),
      explanation: t(it.exp),
      meta: { kp: 'P5', difficulty: 'basic', cite: it.cite },
    };
  }

  const TEMPLATES = {
    P1: [q1ElementCount, q1MainAxis, q1NotAnOperation],
    P2: [q2PointGroup, q2Order],
    P3: [q3LinearIrrep, q3CharRead],
    P4: [q4IrActive, q4RamanActive, q4MutualExclusion],
    P5: [q5Concept],
  };

  // ---------------------------------------------------------------------------
  // 出题
  // ---------------------------------------------------------------------------
  /**
   * 生成一道题。
   * @param {string} kp        知识点（P1–P5）
   * @param {string} [difficulty] 只用来标注难度，不影响事实
   * @param {string[]} [exclude]  要排除的题目 id（"再来一道"用）
   * @returns {Object|{error:string}}
   */
  function generate(kp, difficulty, exclude) {
    const list = TEMPLATES[kp];
    if (!list) return { error: t('symmetry.qe.err.unknownKp', { kp: kp, list: Object.keys(TEMPLATES).join(' / ') }) };
    const skip = Array.isArray(exclude) ? exclude.concat(issued) : issued.slice();
    // ★ 多试几次：模板可能因为"该群的干扰项不够/归属不唯一"而返回 null（那是自校验在起作用）
    for (let attempt = 0; attempt < 40; attempt++) {
      const raw = rnd(list)();
      if (!raw) continue;
      const q = assemble(raw.stem, raw.correct, raw.distractors, raw.explanation, raw.meta);
      if (!q) continue;
      if (skip.indexOf(q.id) >= 0) continue;
      if (difficulty) q.difficulty = difficulty;
      bank[q.id] = q;
      issued.push(q.id);
      if (issued.length > 30) issued.shift();
      return q;
    }
    return { error: t('symmetry.qe.err.generateFailed', { kp: kp }) };
  }

  function get(id) { return bank[id] || null; }

  // ---------------------------------------------------------------------------
  // 练习闭环 UI（状态机由面板驱动，与轨道同一套）
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
    if (!P) return { error: t('symmetry.qe.err.noPanel') };
    const list = MasteryModel ? MasteryModel.allKnowledgePoints() : ['P1', 'P2', 'P3', 'P4', 'P5'];
    const sum = MasteryModel ? MasteryModel.summary() : {};
    let html = '<b>' + t('symmetry.qe.pick.title') + '</b><div class="agent-picker">';
    list.forEach((k) => {
      const m = MasteryModel.meta(k);
      const s = sum[k] || {};
      const tag = s.mastered ? t('symmetry.kp.mastered') : (s.score < 0 ? t('symmetry.kp.review') : '');
      html += '<button class="agent-pick-btn" data-kp="' + k + '">' + k + ' · ' + (m ? m.name : k) +
        (tag ? '<span class="agent-pick-tag">' + tag + '</span>' : '') + '</button>';
    });
    html += '</div>';
    const el = P.addMsg(html, 'assistant');
    const btns = el ? el.querySelectorAll('.agent-pick-btn') : document.querySelectorAll('.agent-pick-btn');
    btns.forEach((b) => {
      b.onclick = () => {
        btns.forEach((x) => { x.disabled = true; });
        launch(b.getAttribute('data-kp'));
      };
    });
    return { ok: true, awaiting: 'knowledgePoint' };
  }

  /** 进入某知识点的讲解（走 LLM 的讲解节点），讲完给出"出题"入口 */
  async function launch(kp) {
    const P = getPanel();
    if (!P) return { error: t('symmetry.qe.err.noPanel') };
    flow.kp = kp;
    flow.active = true;
    const m = MasteryModel.meta(kp);
    await P.runAgent(t('symmetry.qe.agent.explain', { kp: kp, name: m ? m.name : kp }));

    const card = P.addMsg('<button class="agent-btn primary agent-go-quiz">' + t('symmetry.qe.goQuiz') + '</button>', 'assistant');
    const btn = card ? card.querySelector('.agent-go-quiz') : null;
    if (btn) {
      btn.onclick = function () {
        btn.disabled = true;
        btn.textContent = t('symmetry.qe.asking');
        askQuestion();
      };
    }
    return { ok: true, kp: kp };
  }

  /** 出题并渲染题目卡（判定完全本地） */
  function askQuestion(kp, difficulty, exclude) {
    const q = generate(kp || flow.kp || 'P2', difficulty, exclude);
    renderQuestion(q);
    return q;
  }

  /** 渲染题目卡（判定完全本地，不经 LLM） */
  function renderQuestion(q) {
    const P = getPanel();
    if (!P) return;
    if (!q || q.error) {
      P.addMsg('<span class="agent-err">' + (q && q.error) + '</span>', 'assistant');
      return;
    }
    flow.current = q;
    let html = '<div class="agent-q"><div class="agent-q-kp">' +
      t('symmetry.qe.card.kp', { kp: q.kp, difficulty: t('symmetry.qe.diff.' + q.difficulty) }) +
      '</div><div class="agent-q-stem">' + P.renderRich(q.stem) + '</div><div class="agent-opts">';
    q.options.forEach((o, i) => {
      html += '<button class="agent-opt" data-i="' + i + '">' +
        String.fromCharCode(65 + i) + '. ' + P.renderRich(String(o)) + '</button>';
    });
    html += '</div></div>';
    const card = P.addMsg(html, 'assistant');
    if (!card) return;
    card.querySelectorAll('.agent-opt').forEach((b) => {
      b.onclick = () => answer(q.id, +b.getAttribute('data-i'), card);
    });
  }

  /** 判定 —— 纯本地比较，不经过 LLM */
  function answer(questionId, chosenIndex, cardEl) {
    const q = bank[questionId];
    if (!q) return { error: t('symmetry.qe.err.noQuestion') };
    const correct = (chosenIndex === q.answerIndex);
    if (cardEl) {
      cardEl.querySelectorAll('.agent-opt').forEach((b) => {
        const i = +b.getAttribute('data-i');
        b.disabled = true;
        if (i === q.answerIndex) b.classList.add('right');
        if (i === chosenIndex && !correct) b.classList.add('wrong');
      });
    }
    if (MasteryModel) MasteryModel.update(q.kp, correct ? 1 : -1);

    const P = getPanel();
    if (P) {
      let fb = '<div class="agent-fb ' + (correct ? 'ok' : 'bad') + '">' +
        '<b>' + (correct ? t('symmetry.qe.fb.ok') : t('symmetry.qe.fb.bad')) + '</b>' +
        '<div class="agent-fb-exp">' + P.renderRich(q.explanation) + '</div>';
      /**
       * ★★ 2026-10-14（用户："用户不需要知道来源、知识条目"）：
       *   原先这里会渲染一行「依据：知识条目 symmetry:P2-3」✗ —— 学生不需要、也读不懂内部 id。
       *   与提示词里那条"内部出处不进学生正文"同一口径（数值仍由程序算，只是不摆出处）。
       */
      if (q.exampleId) fb += '<button class="agent-btn agent-goto" data-qid="' + q.id + '">' + t('symmetry.qe.goto') + '</button>';
      fb += '</div>';
      const el = P.addMsg(fb, 'assistant');
      const go = el ? el.querySelector('.agent-goto') : null;
      if (go) go.onclick = () => gotoStructure(q);

      // 追问交给模型组织引导语（判定与讲评已经在上面本地完成了）
      /**
       * ★★ 2026-10-14（用户："智能体为何看不了题目？"）：
       *
       *   原先只把**题号**发给模型（`{id}` + 选了第几项）✗ —— 而题目卡是**本地渲染**的
       *   （不在对话树里），模型手里既没有题干也没有选项 ⇒ 学生回头问"这道题我为什么选错"，
       *   它只能泛泛而谈（实测：它自己说"我这里看不到 q-7919 的题面和四个选项"✗）。
       *   改：把**题干、四个选项、学生选的原文**一并带上 —— 上下文齐了，追问才有落点。
       *   ★ 正确答案本来就已经在卡片上标出来了，所以这里给全信息**不会泄题**。
       */
      const optText = (q.options || []).map((o, i) => (i + 1) + '. ' + String(o).replace(/\s+/g, ' ').trim()).join('；')
      const chosenText = (q.options && q.options[chosenIndex] != null) ? String(q.options[chosenIndex]).replace(/\s+/g, ' ').trim() : ''
      const rightText = (q.options && q.options[q.answerIndex] != null) ? String(q.options[q.answerIndex]).replace(/\s+/g, ' ').trim() : ''
      const stem = String(q.stem || '').replace(/\s+/g, ' ').trim()
      P.runAgent(correct
        ? t('symmetry.qe.agent.right', { id: q.id, stem: stem, options: optText })
        : t('symmetry.qe.agent.wrong', {
          id: q.id, chosen: chosenIndex + 1, correct: q.answerIndex + 1,
          chosenText: chosenText, correctText: rightText, stem: stem, options: optText,
        }));
    }
    return { correct: correct, answerIndex: q.answerIndex };
  }

  /** 「去看这个分子」：把该示例切到视图里（宿主注入的落点） */
  function gotoStructure(q) {
    if (!q || !q.exampleId) return { error: t('symmetry.qe.err.noExample') };
    try {
      const r = gotoExample(q.exampleId);
      if (getPanel()) getPanel().addChip(t('symmetry.qe.gotoDone', { id: q.exampleId }));
      return { ok: true, id: q.exampleId, result: r };
    } catch (e) {
      return { error: t('symmetry.qe.err.gotoFailed', { msg: e.message }) };
    }
  }

  /** 再来一道（排除刚出过的） */
  function next() {
    const kp = flow.kp || (flow.current && flow.current.kp) || 'P2';
    const exclude = flow.current ? [flow.current.id] : [];
    return askQuestion(kp, null, exclude);
  }

  /** 讲解用的知识条目清单（给模型的提示，不编条目号） */
  function explain(kp) {
    const map = { P1: ['symmetry:P1-1', 'symmetry:P1-2'], P2: ['symmetry:P2-2', 'symmetry:P2-3'],
      P3: ['symmetry:P3-3'], P4: ['symmetry:P4-1', 'symmetry:P4-2', 'symmetry:P4-3'], P5: ['symmetry:P5-1', 'symmetry:P5-2'] };
    const ids = map[kp] || [];
    return { knowledgePoint: kp, entries: ids, note: t('symmetry.qe.explainNote') };
  }

  /** 掌握度文本（工具用） */
  function masteryText() { return MasteryModel ? MasteryModel.toText() : ''; }
  function recommend(count) { return MasteryModel ? MasteryModel.recommend(count) : { recommended: [] }; }

  function configure(d) {
    d = d || {};
    if (typeof d.getPanel === 'function') getPanel = d.getPanel;
    if (typeof d.getApp === 'function') getApp = d.getApp;
    if (typeof d.getKnowledge === 'function') getKnowledge = d.getKnowledge;
    if (typeof d.gotoExample === 'function') gotoExample = d.gotoExample;
  }

  return {
    configure,
    generate, get, askQuestion, renderQuestion, answer, next, startFlow, launch,
    explain, masteryText, recommend, gotoStructure, toModelView,
    flow: flow,
    _bank: bank,
    /** 供测试：把缓存清掉（示例事实是惰性算的） */
    _resetFacts: () => { allFacts = null; Object.keys(facts).forEach((k) => { delete facts[k]; }); },
  };
})();

export { QuestionEngine }
export default QuestionEngine
