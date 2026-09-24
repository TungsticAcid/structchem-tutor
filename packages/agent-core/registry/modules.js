/**
 * modules.js — 模块注册机制
 *
 * ★ 设计前提：大智能体 = 一个中枢 + N 个可插拔模块。
 *
 *   模块的规模差异极大：
 *     · 大的：晶体结构（23 种数据 + 完整 3D 渲染 + 出题引擎）
 *     · 中的：原子轨道、分子对称性
 *     · 小的：晶体场理论、休克尔分子轨道 —— 可能只是一个计算器 + 几十条知识
 *
 *   因此注册接口必须【轻量】到一个小工具也能挂上。凡是"大模块才用得上"的字段
 *   一律设为可选；一个最小模块只需给出 id / title / capabilities 三样。
 *
 * ★ 与约束层的关系：
 *   模块只声明自己【贡献】什么工具（tools），
 *   至于哪些节点能用这些工具，由 nodes/constraints.js 按类别裁决。
 *   模块无法自行越权——它只能往类别里放工具，不能决定谁有权限。
 */

// ============================================================================
// 注册表
// ============================================================================

/** @type {Map<string, Object>} 模块 id → 模块描述 */
const registry = new Map();

/**
 * 注册一个模块。
 *
 * @param {Object} mod
 * @param {string} mod.id          模块唯一标识，同时用作知识/技能 id 的命名空间
 * @param {string} mod.title       中文名，如「晶体结构」
 * @param {Object} mod.capabilities ★ 能力声明——路由节点据此把用户问题分派到本模块。
 *        键为意图类别，值为关键词数组。例：
 *        { structures: ['晶体', '晶胞', '点阵', '堆积', '配位', '空隙', '空间群'] }
 *        这是合并成 N 模块后，中枢唯一需要读的字段。
 *
 * ---- 以下均为可选，按规模取舍 ----
 * @param {string} [mod.entry]     模块前端入口（URL 或相对路径）
 * @param {string} [mod.knowledge] 知识条目目录（相对 packages/knowledge/）
 * @param {string} [mod.skills]    技能目录（相对 packages/skills/）
 * @param {Object} [mod.tools]     本模块贡献的工具，按类别分组
 *        { read: [...], query: [...], hand: [...], teach: [...] }
 * @param {Object} [mod.nodeOverrides] 覆盖通用节点约束（谨慎使用，需说明理由）
 * @param {Object} [mod.extraNodes]    模块专属决策节点
 * @param {Object} [mod.proactiveRules] 模块贡献的主动介入规则
 * @param {string} [mod.scale]     'full' | 'lite'，仅用于展示分组，不影响逻辑
 */
export function registerModule(mod) {
  if (!mod || !mod.id) throw new Error('模块必须有 id');
  if (!mod.title) throw new Error(`模块 ${mod.id} 必须有 title`);
  if (registry.has(mod.id)) throw new Error(`模块 id 重复：${mod.id}`);

  // 命名空间规范化：id 必须是安全的标识符，因为它会拼进知识条目 id
  if (!/^[a-z][a-z0-9-]*$/.test(mod.id)) {
    throw new Error(`模块 id 只能用小写字母、数字、连字符：${mod.id}`);
  }

  registry.set(mod.id, {
    scale: 'full',
    knowledge: [],
    skills: [],
    tools: { read: [], query: [], hand: [], teach: [] },
    nodeOverrides: {},
    extraNodes: {},
    proactiveRules: [],
    ...mod,
    capabilities: mod.capabilities || {},
  });
}

/** 取单个模块 */
export function getModule(id) {
  return registry.get(id) || null;
}

/** 列全部模块 */
export function listModules() {
  return [...registry.values()];
}

// ============================================================================
// 中枢需要的三个聚合视图
// ============================================================================

/**
 * 把全部模块的能力声明合并成一张路由表。
 * 路由节点只读这一张表，不需要了解任何模块的内部细节。
 *
 * @returns {{intent: string, modules: string[], keywords: string[]}[]}
 */
export function buildRoutingTable() {
  const byIntent = new Map();
  for (const m of registry.values()) {
    for (const [intent, keywords] of Object.entries(m.capabilities)) {
      if (!byIntent.has(intent)) byIntent.set(intent, { modules: [], keywords: new Set() });
      const entry = byIntent.get(intent);
      entry.modules.push(m.id);
      keywords.forEach((k) => entry.keywords.add(k));
    }
  }
  return [...byIntent.entries()].map(([intent, v]) => ({
    intent,
    modules: v.modules,
    keywords: [...v.keywords],
  }));
}

/**
 * 聚合全部模块贡献的工具，供 constraints.resolveTools 使用。
 * @param {string} [onlyModule] 只取某个模块（单模块运行时用）
 */
export function collectTools(onlyModule = null) {
  const acc = { read: [], query: [], hand: [], teach: [] };
  for (const m of registry.values()) {
    if (onlyModule && m.id !== onlyModule) continue;
    for (const cls of Object.keys(acc)) {
      acc[cls].push(...(m.tools[cls] || []));
    }
  }
  // 去重
  for (const cls of Object.keys(acc)) acc[cls] = [...new Set(acc[cls])];
  return acc;
}

/**
 * 聚合全部模块的主动介入规则。
 * 规则引擎（proactive-rules）是通用的，规则本身由各模块提供。
 */
export function collectProactiveRules() {
  return [...registry.values()].flatMap((m) =>
    (m.proactiveRules || []).map((r) => ({ ...r, module: m.id })),
  );
}

/**
 * 依据用户输入，给出候选模块（按命中关键词数排序）。
 * 这是"中枢"的核心动作——决定该把问题交给谁。
 *
 * @param {string} text
 * @param {number} [limit]
 * @returns {{module: string, title: string, score: number, hit: string[]}[]}
 */
export function routeByText(text, limit = 3) {
  const q = String(text || '').toLowerCase();
  const scored = [];
  for (const m of registry.values()) {
    const hit = [];
    for (const keywords of Object.values(m.capabilities || {})) {
      for (const k of keywords) {
        if (q.includes(String(k).toLowerCase())) hit.push(k);
      }
    }
    if (hit.length) scored.push({ module: m.id, title: m.title, score: hit.length, hit });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** 仅供测试：清空注册表 */
export function _reset() {
  registry.clear();
}
