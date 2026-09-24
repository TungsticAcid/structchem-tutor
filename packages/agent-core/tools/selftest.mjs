#!/usr/bin/env node
/**
 * selftest.mjs — 共享核心自检
 *
 * 运行：node packages/agent-core/tools/selftest.mjs
 *
 * 验证三件事：
 *   ① 模块注册与路由表可用
 *   ② 节点约束按工具白名单正确生效
 *   ③ 关键禁令在结构上无法违反（出题节点拿不到手类工具）
 */
import { registerAll, buildRoutingTable, routeByText, listModules, collectTools }
  from '../registry/index.js';
import { NODES, resolveTools, buildNodePrompt, listNodes }
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
console.log('\n【② 节点约束：各节点实际可用的工具】');
const modTools = collectTools();
const resolved = {};
for (const node of listNodes()) {
  resolved[node] = resolveTools(node, modTools);
}
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
ok(!resolved.quiz.includes('checkAnswer'),
   '出题节点拿不到 checkAnswer → 出题与判卷职责分离');
ok(resolved.grade.includes('generateQuiz'),
   '判卷节点可出题（答错后需生成变式题检验）');

// 主动介入只能提议，不能执行
ok(!resolved.proactive.includes('applySceneActions'),
   '主动介入节点拿不到 applySceneActions → 只能提议不能执行');

// 判卷节点可以用手，但只能在诊断范围内（deny 了自由操控）
ok(resolved.grade.includes('diagnoseError'), '判卷节点可用 diagnoseError');
ok(!resolved.grade.includes('applySceneActions'),
   '判卷节点被 deny 掉自由操控，只能用诊断动作');

// 分流节点不产生教学内容
ok(!resolved.route.includes('generateQuiz') && !resolved.route.includes('applySceneActions'),
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

// ── 汇总 ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72));
console.log(`自检结果：通过 ${pass} 项，失败 ${fail} 项`);
console.log('═'.repeat(72));
process.exit(fail ? 1 : 0);
