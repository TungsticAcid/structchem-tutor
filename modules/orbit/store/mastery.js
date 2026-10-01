/**
 * mastery.js（orbit 模块 · 学情）
 *
 * 每个知识点独立维护掌握度（答对 +1 / 答错 −1 / 复述通过 +2；连续两次答对
 * 标记已掌握）。只存本机 localStorage，不上传。
 *
 * ★ 来自上游 `orbit/H5/js/agent/mastery-model.js`。两处改造：
 *   ① 存储键改成**注入**（缺省值不得指向具体命名空间）
 *   ② 读当前轨道从 `window.OrbitApp.getState()` 改成注入
 */
/**
 * mastery-model.js — 掌握度追踪与知识点推荐
 *
 * 每个知识点独立维护掌握度（简单可解释的加减规则，避免黑箱）：
 *   答对 +1　答错 −1　费曼复述通过 +2
 * 连续 2 次答对同一知识点 → 标记「已掌握」。
 *
 * 推荐依据：掌握度最低 + 与当前轨道的关联度（取自知识点—轨道映射矩阵）。
 * 数据只存本机 localStorage，不上传。
 */
import '../i18n.js'
import { t } from '../../../packages/i18n/index.js'

const MasteryModel = (function () {
  'use strict';

  // ★ 存储键由宿主注入：**缺省值不得指向某个具体命名空间**（模块契约里对
  //   storage 的要求）。壳用的是 `chem-agent.*`，写上上游的 `orbit.mastery`
  //   会让同一台机器出现两套互不相认的学情。
  let STORAGE_KEY = 'orbit.mastery';
  // ★ 反向依赖端口：上游直接读 `window.OrbitApp.getState()` 取当前轨道。
  let getApp = () => null;

  // （键名改由 configure 注入，见上）

  /**
   * 知识点元信息。
   *
   * ★ `name` 是取值器而不是常量：它既进 `toText()`（给模型看），也进
   *   core/question-engine.js 的知识点选择按钮（进 DOM）—— 两处都必须跟着当前语言走。
   *   写成常量就会把 import 时的语言固化下来。
   */
  const KP_META = {
    K1: { get name() { return t('orbit.kp.K1') }, orbital: [{ n: 1, l: 0, m: 0 }, { n: 2, l: 1, m: 0 }, { n: 3, l: 2, m: 0 }] },
    K2: { get name() { return t('orbit.kp.K2') }, orbital: [{ n: 3, l: 1, m: 0 }] },
    K3: { get name() { return t('orbit.kp.K3') }, orbital: [{ n: 1, l: 0, m: 0 }, { n: 3, l: 0, m: 0 }] },
    K4: { get name() { return t('orbit.kp.K4') }, orbital: [{ n: 2, l: 1, m: 0 }, { n: 3, l: 2, m: 1 }] },
    K5: { get name() { return t('orbit.kp.K5') }, orbital: [{ n: 3, l: 0, m: 0 }, { n: 3, l: 1, m: 0 }, { n: 3, l: 2, m: 0 }] },
    K6: { get name() { return t('orbit.kp.K6') }, orbital: [{ n: 2, l: 1, m: 1 }] },
    K7: { get name() { return t('orbit.kp.K7') }, orbital: [{ n: 3, l: 2, m: 2 }] },
    K8: { get name() { return t('orbit.kp.K8') }, orbital: [{ n: 1, l: 0, m: 0 }] },
    K9: { get name() { return t('orbit.kp.K9') }, orbital: [{ n: 3, l: 2, m: 0 }] },
  };

  let state = null;

  function load() {
    if (state) return state;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { saved = null; }
    state = saved && typeof saved === 'object' ? saved : {};
    Object.keys(KP_META).forEach(function (kp) {
      if (!state[kp]) state[kp] = { score: 0, right: 0, wrong: 0, streak: 0, mastered: false, lastAt: 0 };
    });
    return state;
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 隐私模式 */ }
  }

  function update(kp, delta) {
    load();
    if (!state[kp]) return { error: t('orbit.kp.unknown', { kp }) };
    const s = state[kp];
    s.score += Number(delta) || 0;
    s.lastAt = Date.now();
    if (delta > 0) {
      s.right++; s.streak++;
      if (s.streak >= 2) s.mastered = true;
    } else if (delta < 0) {
      s.wrong++; s.streak = 0; s.mastered = false;
    }
    save();
    return { knowledgePoint: kp, score: s.score, mastered: s.mastered, streak: s.streak };
  }

  /** 总览（进快照，供模型判断学情） */
  function summary() {
    load();
    const out = {};
    Object.keys(KP_META).forEach(function (kp) {
      out[kp] = { score: state[kp].score, mastered: state[kp].mastered };
    });
    return out;
  }

  /** 给模型看的紧凑文本 */
  function toText() {
    load();
    return Object.keys(KP_META).map(function (kp) {
      const s = state[kp];
      const tag = s.mastered ? t('orbit.kp.mastered')
        : (s.score > 0 ? t('orbit.kp.learning') : (s.wrong ? t('orbit.kp.review') : t('orbit.kp.untouched')));
      return kp + '(' + KP_META[kp].name + '):' + tag + '/' + s.score;
    }).join('；');
  }

  function meta(kp) { return KP_META[kp] || null; }
  function allKnowledgePoints() { return Object.keys(KP_META); }

  /**
   * 推荐下一个知识点：优先掌握度最低的；同分时优先与当前轨道关联度高的。
   */
  function recommend(count, currentOrbital) {
    load();
    const cur = currentOrbital || (getApp() ? getApp().getState() : null);
    const list = Object.keys(KP_META).map(function (kp) {
      const s = state[kp];
      let relevance = 0;
      if (cur) {
        (KP_META[kp].orbital || []).forEach(function (o) {
          if (o.n === cur.n && o.l === cur.l) relevance += 2;
          else if (o.l === cur.l) relevance += 1;
        });
      }
      return { kp: kp, name: KP_META[kp].name, score: s.score, mastered: s.mastered, relevance: relevance };
    }).filter(function (x) { return !x.mastered; });

    list.sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;        // 掌握度低者优先
      return b.relevance - a.relevance;                          // 再按关联度
    });

    const n = Math.max(1, Math.min(count || 1, 3));
    return {
      recommended: list.slice(0, n),
      note: t('orbit.mastery.recommendNote'),
    };
  }

  function reset() {
    state = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    load(); save();
  }

  /**
   * 注入宿主依赖（见文件顶部说明）。参数缺省时保持原值。
   * @param {Object}   d
   * @param {string}   [d.storageKey] 学情存储键
   * @param {Function} [d.getApp]     取页面运行时（读当前轨道）
   */
  function configure(d) {
    d = d || {};
    if (typeof d.storageKey === 'string' && d.storageKey) STORAGE_KEY = d.storageKey;
    if (typeof d.getApp === 'function') getApp = d.getApp;
  }

  return { configure, update, summary, toText, recommend, meta, allKnowledgePoints, reset, load };
})();
export { MasteryModel }
export default MasteryModel
