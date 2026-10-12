/**
 * mastery.js — 点群观鉴的**学情模型**（掌握度）。
 *
 * ★ 与轨道模块的 `store/mastery.js` **同一套接口**（`configure / update / summary /
 *   toText / recommend / meta / allKnowledgePoints / reset`）：练习闭环与快照都按那套接口写，
 *   两个板块共用一份"学情怎么用"的知识。差别只有两点：
 *     · 知识点是点群的 P1–P5（见 `apps/web/src/main.js` 注册的五段知识）
 *     · 关联度按"当前示例所属的点群族"算，而不是按轨道量子数
 *
 * ★ 存储键由宿主注入（模块契约：**缺省值不得指向某个具体命名空间**）。
 */
import { t } from '../../../packages/i18n/index.js'

const MasteryModel = (function () {
  'use strict';

  let STORAGE_KEY = 'symmetry.mastery';
  /** 反向依赖端口：读当前选中的示例（宿主注入；没有就只按分数推荐） */
  let getApp = () => null;

  /**
   * 知识点元信息。
   *
   * ★ `name` 是**取值器**而不是常量：它既进 `toText()`（给模型看），也进题目卡上方的
   *   知识点标签与知识点选择按钮（进 DOM）—— 两处都必须跟着当前语言走。
   *   写成常量会把 import 那一刻的语言固化下来。
   * ★ `groups` 是该知识点覆盖的点群族（`recommend` 用它算关联度）。
   */
  const KP_META = {
    P1: { get name() { return t('symmetry.kp.P1') }, groups: ['C1', 'Cs', 'Ci', 'C2', 'C2v', 'C3v', 'C2h'] },
    P2: { get name() { return t('symmetry.kp.P2') }, groups: ['C2v', 'C3v', 'D2h', 'D3h', 'D6h', 'Td', 'Oh', 'D∞h', 'C∞v'] },
    P3: { get name() { return t('symmetry.kp.P3') }, groups: ['C2v', 'C3v', 'D2h', 'Td', 'D6h'] },
    P4: { get name() { return t('symmetry.kp.P4') }, groups: ['C2v', 'C3v', 'D2h', 'Td', 'D6h'] },
    P5: { get name() { return t('symmetry.kp.P5') }, groups: [] },
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

  /** 判一次对错。delta>0 记对、<0 记错；连对 2 次算"掌握"（与轨道同一判据） */
  function update(kp, delta) {
    load();
    if (!state[kp]) return { error: t('symmetry.kp.unknown', { kp }) };
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
      const tag = s.mastered ? t('symmetry.kp.mastered')
        : (s.score > 0 ? t('symmetry.kp.learning') : (s.wrong ? t('symmetry.kp.review') : t('symmetry.kp.untouched')));
      return kp + '(' + KP_META[kp].name + '):' + tag + '/' + s.score;
    }).join('；');
  }

  function meta(kp) { return KP_META[kp] || null; }
  function allKnowledgePoints() { return Object.keys(KP_META); }

  /**
   * 推荐下一个知识点：优先掌握度最低的；同分时优先与**当前示例的点群**关联度高的。
   * ★ 关联度判据只有一处：`KP_META[kp].groups` 是否包含当前点群符号。
   */
  function recommend(count, currentGroup) {
    load();
    let group = currentGroup || null;
    if (!group && getApp()) {
      try {
        const st = getApp().getState ? getApp().getState() : null;
        group = st && st.symbol ? st.symbol : null;
      } catch (e) { group = null; }
    }
    const list = Object.keys(KP_META).map(function (kp) {
      const s = state[kp];
      const groups = KP_META[kp].groups || [];
      const relevance = (group && groups.indexOf(group) >= 0) ? 2 : 1;
      return { kp: kp, name: KP_META[kp].name, score: s.score, mastered: s.mastered, relevance: relevance };
    }).filter(function (x) { return !x.mastered; });

    list.sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;   // 掌握度低者优先
      return b.relevance - a.relevance;                     // 再按与当前点群的关联度
    });

    const n = Math.max(1, Math.min(count || 1, 3));
    return { recommended: list.slice(0, n), note: t('symmetry.mastery.recommendNote') };
  }

  function reset() {
    state = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    load(); save();
  }

  /**
   * 注入宿主依赖。参数缺省时保持原值。
   * @param {Object}   d
   * @param {string}   [d.storageKey] 学情存储键
   * @param {Function} [d.getApp]     取页面运行时（读当前示例的点群）
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
