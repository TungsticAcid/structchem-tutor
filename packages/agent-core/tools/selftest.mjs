#!/usr/bin/env node
/**
 * selftest.mjs — 共享核心自检
 *
 * 运行：node packages/agent-core/tools/selftest.mjs
 *
 * 验证五件事：
 *   ① 模块注册与路由表可用
 *   ② 节点约束按工具白名单正确生效
 *   ③ 关键禁令在结构上无法违反（出题节点拿不到手类工具）
 *   ④ 节点提示生成
 *   ⑤ descriptor 声明的工具与模块**实际实现**是否对得上（对账）
 *
 * ★ 关于 ③ 与 ⑤ 的分工（B5 对账后修正的一处方法论问题）：
 *   constraints.resolveTools() 回答的是**权限**问题（哪些工具允许被这个节点使用），
 *   它会把 `allowExtra` 里尚未实现的工具也一并列出。而模型实际能看到的是
 *   「权限 ∩ 实现」——本自检断言的是后者（`effective()`）。
 *
 *   修正前的自检断言的是权限清单，且与 descriptor 用了**同一批幽灵名字**
 *   （例如两者都写 generateQuiz，而 orbit 实际实现的是 generateQuestion）：
 *   测试与被测对象犯同一个错，于是互相印证，一直绿着却什么也没守住。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { registerAll, buildRoutingTable, routeByText, listModules,
         collectTools, collectPlannedTools }
  from '../registry/index.js';
import { NODES, CORE_TOOLS, resolveTools, buildNodePrompt, listNodes }
  from '../nodes/constraints.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? (pass++, console.log(`  ✓ ${msg}`)) : (fail++, console.log(`  ✗ ${msg}`)); };

console.log('═'.repeat(72));
console.log('共享智能体核心 · 自检');
console.log('═'.repeat(72));

// ── ① 模块注册 ────────────────────────────────────────────────────────────
console.log('\n【① 模块注册】');
const n = registerAll();
ok(n === 3, `注册了 ${n} 个模块`);

const mods = listModules();
console.log(mods.map((m) => `      ${m.id.padEnd(12)} ${m.title.padEnd(8)} [${m.scale}]`).join('\n'));

console.log('\n  路由表（中枢据此分派问题）：');
for (const r of buildRoutingTable()) {
  console.log(`      ${r.intent.padEnd(22)} → ${r.modules.join(', ')}  (${r.keywords.length} 个关键词)`);
}

console.log('\n  路由测试：');
for (const q of ['NaCl 的配位数是多少', '为什么 3d 有 5 个轨道', '这个分子是什么点群',
                 '八面体场分裂能怎么算', '今天天气不错']) {
  const hits = routeByText(q);
  const desc = hits.length ? hits.map((h) => `${h.module}(${h.score})`).join(' ') : '无命中 → 走通用澄清';
  console.log(`      「${q}」→ ${desc}`);
}
ok(routeByText('NaCl 的配位数是多少')[0]?.module === 'crystal', '晶体问题路由到 crystal');
ok(routeByText('为什么 3d 有 5 个轨道')[0]?.module === 'orbit', '轨道问题路由到 orbit');
ok(routeByText('今天天气不错').length === 0, '无关问题不误路由');

// ── ② 节点约束 ────────────────────────────────────────────────────────────
const modTools = collectTools();
const coreNames = new Set(Object.values(CORE_TOOLS).flat());
const declared = new Set(Object.values(modTools).flat());
/** 模型实际能看到的工具 = 权限 ∩ 实现 */
const provided = new Set([...coreNames, ...declared]);
const effective = (node) => resolveTools(node, modTools).filter((t) => provided.has(t));
/** 权限允许、但没有任何模块实现的名字（应尽量为空） */
const allowedButMissing = (node) =>
  resolveTools(node, modTools).filter((t) => !provided.has(t));

console.log('\n【② 节点约束：各节点实际可用的工具（权限 ∩ 实现）】');
const resolved = {};
for (const node of listNodes()) resolved[node] = effective(node);
for (const [node, tools] of Object.entries(resolved)) {
  const short = tools.map((t) => t.replace(/([A-Z])/g, (m) => m.toLowerCase()));
  console.log(`      ${node.padEnd(11)} (${String(tools.length).padStart(2)} 个)  ${short.join(', ')}`);
}

// ── ③ 关键禁令：结构上无法违反 ─────────────────────────────────────────────
console.log('\n【③ 关键禁令是否在结构上成立】');

// 出题节点绝不能操控视图
ok(!resolved.quiz.includes('applySceneActions'),
   '出题节点拿不到 applySceneActions → 出题时动不了画面');
ok(!resolved.quiz.includes('highlightAtoms'),
   '出题节点拿不到 highlightAtoms');
// 出题节点也拿不到任何"教"类工具（判卷/诊断是 grade 的职责）
const handLike = ['applySceneActions', 'highlightAtoms', 'navigateTo', 'openCompareView'];
ok(!resolved.quiz.some((t) => handLike.includes(t)),
   '出题节点拿不到任何手类工具（按实际实现核对，不是按名字清单）');
ok(resolved.grade.includes('generateQuestion'),
   '判卷节点可出题（答错后需生成变式题检验）');

// 主动介入只能提议，不能执行
ok(!resolved.proactive.includes('applySceneActions'),
   '主动介入节点拿不到 applySceneActions → 只能提议不能执行');

// 判卷节点可以用手，但只能在诊断范围内（deny 了自由操控）
ok(resolved.grade.includes('diagnoseError'), '判卷节点可用 diagnoseError');
ok(!resolved.grade.includes('applySceneActions'),
   '判卷节点被 deny 掉自由操控，只能用诊断动作');

// 分流节点不产生教学内容
ok(!resolved.route.includes('generateQuestion') && !resolved.route.includes('applySceneActions'),
   '分流节点既不能出题也不能动画面');

// 讲解与演示节点应具备完整操控权
ok(resolved.explain.includes('applySceneActions'), '讲解节点有完整操控权');
ok(resolved.demo.includes('applySceneActions'), '演示节点有完整操控权');

// 只读节点不应拿到任何有副作用的工具
for (const node of ['route', 'proactive']) {
  ok(!resolved[node].includes('applySceneActions'), `${node} 无副作用工具`);
}

// ── ④ 节点提示生成 ────────────────────────────────────────────────────────
console.log('\n【④ 节点提示生成（节选：quiz）】');
const prompt = buildNodePrompt('quiz');
console.log(prompt.split('\n').map((l) => '      ' + l).join('\n'));
ok(prompt.includes('不得操控当前视图'), 'quiz 提示含关键禁令');
ok(prompt.includes('分离生成'), 'quiz 提示含答案解析分离要求');

// ── ⑤ descriptor 对账 ─────────────────────────────────────────────────────
console.log('\n【⑤ descriptor 与实现的对账】');

// ⑤-1 权限允许但没有实现的名字（幽灵名）。理想为空；不为空则应尽快补齐或撤回声明。
let ghostTotal = 0;
for (const node of listNodes()) {
  const miss = allowedButMissing(node);
  ghostTotal += miss.length;
}
console.log(`      权限允许但无人实现的名字：${ghostTotal} 处`);
if (ghostTotal) {
  for (const node of listNodes()) {
    const miss = allowedButMissing(node);
    if (miss.length) console.log(`        ${node.padEnd(11)} ${miss.join(', ')}`);
  }
  console.log('      （这些词来自 nodes 的 allowExtra；模型实际看不到它们，但应尽快实现或撤回）');
}

// ⑤-2 CORE_TOOLS 里的名字必须由核心实现（这里只做「不是模块专属名」的粗校验）
const CORE_IMPLEMENTED = ['loadKnowledge', 'loadSkill'];
const coreNotImplemented = [...coreNames].filter((t) => !CORE_IMPLEMENTED.includes(t));
ok(coreNotImplemented.length === 0,
   'CORE_TOOLS 只列核心确实提供的工具',
   coreNotImplemented.join(','));

// ⑤-3 orbit 的 descriptor 工具名必须与它实际实现的一致（可核对到源码）
{
  const orbit = listModules().find((m) => m.id === 'orbit');
  const orbitDeclared = Object.values(orbit.tools || {}).flat().sort();
  const actual = orbitActualToolNames();
  const notImplemented = orbitDeclared.filter((t) => !actual.includes(t));
  ok(notImplemented.length === 0,
     `orbit descriptor 声明的 ${orbitDeclared.length} 个工具都已实现`,
     '未实现：' + notImplemented.join(','));
  const undeclared = actual.filter((t) => !orbitDeclared.includes(t) && !CORE_IMPLEMENTED.includes(t));
  ok(undeclared.length === 0,
     'orbit 已实现的工具都已在 descriptor 里声明',
     '漏声明：' + undeclared.join(','));
}

// ⑤-4 同一工具不得既在 tools 又在 plannedTools；plannedCapabilities 必须是已声明的能力
for (const m of mods) {
  const impl = new Set(Object.values(m.tools || {}).flat());
  const planned = new Set(Object.values(m.plannedTools || {}).flat());
  const both = [...planned].filter((t) => impl.has(t));
  ok(both.length === 0, `${m.id}: tools 与 plannedTools 不重叠`, both.join(','));
  const badCap = (m.plannedCapabilities || []).filter((k) => !(k in (m.capabilities || {})));
  ok(badCap.length === 0, `${m.id}: plannedCapabilities 都是已声明的能力键`, badCap.join(','));
}

// ⑤-5 计划中的工具与能力（进度展示，供人工核对）
const plannedTools = collectPlannedTools();
console.log(`\n      计划中（尚未实现，不参与白名单）：${plannedTools.length} 个工具`);
for (const m of mods) {
  const pt = plannedTools.filter((p) => p.module === m.id);
  if (!pt.length) continue;
  const byCls = {};
  for (const p of pt) (byCls[p.cls] || (byCls[p.cls] = [])).push(p.tool);
  console.log(`        ${m.id}: ` + Object.entries(byCls).map(([c, l]) => `${c}[${l.length}]`).join(' '));
  for (const cap of m.plannedCapabilities || []) {
    console.log(`          ⚠ 能力「${cap}」已声明但未实现，回答该领域问题会失败`);
  }
}

// ── 汇总 ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72));
console.log(`自检结果：通过 ${pass} 项，失败 ${fail} 项`);
console.log('═'.repeat(72));
process.exit(fail ? 1 : 0);

// ============================================================================
/** 取 orbit 模块**实际实现**的工具名（读它的 tool-registry.js，与 descriptor 对账） */
function orbitActualToolNames() {
  const p = fileURLToPath(new URL('../../../projects/orbit/H5/js/agent/tool-registry.js', import.meta.url));
  const win = {};
  new Function('window', readFileSync(p, 'utf-8'))(win);   // 该文件是普通脚本，挂 window.ToolRegistry
  return win.ToolRegistry.names();
}
