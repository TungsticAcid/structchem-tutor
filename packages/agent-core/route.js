/**
 * route.js — 意图路由：把用户的话映射到**决策节点**
 *
 * 现状缺口（移植时发现的）：`nodes/constraints.js` 的 8 个节点约束表已实现且有测试，
 * 但**运行时没有任何代码切换节点**——所有对话永远停在 `explain`，
 * 于是"出题""演示""复述"这些节点的工具白名单从来没生效过。
 *
 * ★ 三层判定，逐层降本：
 *
 *   ① **显式 UI 意图**（0 token，确定性）
 *      面板上的节点菜单 / 题目卡上的「出题」按钮 → 直接 setNode
 *
 *   ② **本地关键词先筛**（0 token，本文件）
 *      命中 → 切节点并给用户一句可见的反馈
 *      **未命中 → 保持当前节点**，不做猜测
 *
 *   ③ **模型判定**（一次工具调用，仅当 ② 未命中且当前在 explain）
 *      切到 route 节点，让模型用 `declareIntent` 工具输出结构化意图
 *
 * ★ 为什么本地先筛而不是直接上模型：这是本项目已有的惯例——
 *   `proactive` 节点就是"本地规则先筛、未命中零 token"。路由与主动介入是同一类问题
 *   （"判断用户想干什么"），用同一套纪律。且路由对延迟敏感：用户发一句话要等一次
 *   额外的模型往返才知道该用哪个节点，体感上是"卡了一下"。
 *
 * ★ 关键词表与 `descriptor.capabilities` **不是一回事，不要合并**：
 *   · capabilities 回答"这个问题属于哪个**模块**"（模块级，将来多模块时才用得上）
 *   · 本表回答"这个意图属于哪个**决策节点**"（节点级）
 *   单模块部署下两者不会冲突，但语义不同，混在一张表里将来接第二个模块时会糊。
 */

import { NODES } from './nodes/constraints.js'

/**
 * 意图规则表。
 *
 * `re` 按顺序匹配，**先命中者胜**——所以把更具体的放在前面
 * （"考考我"要能命中 quiz，不能因为含"我"就被后面的规则抢走）。
 */
const RULES = [
  // ---- 出题 ----
  { node: 'quiz', re: /出题|考考我|考一考|练一练|来道题|来几道|测一测|检验一下|做道题|做题/ },
  // ---- 演示 ----
  { node: 'demo', re: /演示|演一遍|演一下|给我看|走一遍|展开看|放一遍|动画/ },
  // ---- 教学法技能（走 teach 节点，带 skill 槽位）----
  { node: 'teach', skill: 'feynman', re: /费曼|我来讲|我来说|复述|讲给你听|用我的话/ },
  { node: 'teach', skill: 'socratic', re: /苏格拉底|别告诉我答案|不要直接说|引导我|让我自己想/ },
  { node: 'teach', skill: 'analogy', re: /打个比方|类比|比喻|举个生活/ },
  { node: 'teach', skill: 'spaced-repetition', re: /复习|回顾|温习|上次的/ },
  { node: 'teach', skill: 'worked-example', re: /例题|范例|示范一遍|带我做一个/ },
  { node: 'teach', skill: 'misconception-probe', re: /我错在哪|哪里错了|为什么不(对|行)/ },
  // ---- 对比 ----
  { node: 'compare', re: /对比|比较.*(和|与|跟)|有什么(区别|不同|差别)/ },
  // ---- 讲解（兜底，也是默认节点）----
  { node: 'explain', re: /为什么|怎么理解|解释一下|讲讲|讲解|是什么意思|什么叫/ },
]

/** 稳定的规则快照（供测试与面板展示） */
export const ROUTE_RULES = RULES.map((r) => ({ node: r.node, skill: r.skill, source: String(r.re) }))

/**
 * 按用户文本猜节点。
 *
 * @param {string} text
 * @returns {{node:string, skill?:string, matched:string}|null} 未命中返回 null
 */
export function guessNode(text) {
  const s = String(text || '').trim()
  if (!s) return null
  for (const r of RULES) {
    if (r.re.test(s)) {
      // 该节点必须真实存在（防止规则表与 constraints 漂移）
      if (!NODES[r.node]) continue
      return { node: r.node, skill: r.skill, matched: s.match(r.re)[0] }
    }
  }
  return null
}

/**
 * 是否值得交给模型判定。
 *
 * ★ 只在**当前停在 explain 且本地未命中**时才上模型：
 *   · 已经在 quiz/grade/teach 等专门节点里，就该待在原地——用户接着说的一句
 *     "那第二个选项呢" 不该把节点切走
 *   · 本地已命中就不必花这次调用
 */
export function shouldAskModel(node, text) {
  if (node !== 'explain') return false
  return guessNode(text) === null
}

/**
 * 本文件只做**判定**；实际切换由 app.js 的 send 包装统一执行
 * （那里还要做节点切换的清理动作，如中止在播的演示）。
 */
export default { ROUTE_RULES, guessNode, shouldAskModel }
