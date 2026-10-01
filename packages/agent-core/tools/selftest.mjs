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
import { createModule as createOrbitModule } from '../../../modules/orbit/index.js'
import { createModule as createCrystalModule } from '../../../modules/crystal/index.js'
import { createModule as createSymmetryModule } from '../../../modules/symmetry/index.js'
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { registerAll, buildRoutingTable, routeByText, listModules,
         collectTools, collectPlannedTools }
  from '../registry/index.js';
import { NODES, CORE_TOOLS, resolveTools, buildNodePrompt, listNodes }
  from '../nodes/constraints.js';
import { createShellTools } from '../app.js';

let pass = 0, fail = 0;
/**
 * 断言助手。
 *
 * ★ 原先只接两个参数（cond, msg），第三个 detail 被**静默丢弃**——
 *   于是各处精心拼出来的"未实现：xxx / 漏声明：xxx"在失败时根本不会显示，
 *   看到的只有一句"✗ 某模块已实现的工具都已在 descriptor 里声明"，
 *   完全不知道是哪个名字。排查的人只能自己去复现一遍。
 *   现已让 detail 在失败时显示（成功时不显示，保持输出干净）。
 */
const ok = (cond, msg, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); return }
  fail++
  console.log(`  ✗ ${msg}${detail ? ' — ' + detail : ''}`)
};

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
const coreNames = new Set(Object.values(CORE_TOOLS).flat());

/**
 * ★ 按**模块**解析，不用全模块并集。
 *
 * `roles`（见 constraints.js 的 ROLE_SPEC）是**每模块一份**的绑定：
 * crystal 的 `quizGen` → `generateQuiz`，orbit 的 → `generateQuestion`。
 * 把并集喂给 resolveTools 在语义上就是错的——那会让 A 模块的角色解析出
 * B 模块的工具名，于是"某个模块在某个节点拿不到工具"这类缺陷**永远不会显形**。
 */
const BUILT = new Map(['crystal', 'orbit', 'symmetry'].map((id) => [id, moduleBuilt(id)]))
/** 某节点在某模块下真正可见的工具（权限 ∩ 该模块的实现 ∪ 中枢工具） */
function toolsFor(moduleId, node) {
  const b = BUILT.get(moduleId)
  return resolveTools(node, b.defsByClass, b.roles)
    .filter((t) => b.impl.has(t) || coreNames.has(t))
}
/** 并集视角：**任何**一个模块在该节点能看到什么（③ 的结构性禁令用它，与模块无关） */
const resolved = {};
for (const node of listNodes()) {
  const s = new Set();
  for (const id of BUILT.keys()) for (const t of toolsFor(id, node)) s.add(t);
  resolved[node] = [...s].sort();
}
const modTools = collectTools();
const declared = new Set(Object.values(modTools).flat());
const provided = new Set([...coreNames, ...declared]);
/** 权限允许、但没有任何模块实现的名字（应尽量为空） */
const allowedButMissing = (node) =>
  resolveTools(node, modTools).filter((t) => !provided.has(t));

console.log('\n【② 节点约束：各节点实际可用的工具（权限 ∩ 实现，按模块）】');
for (const id of BUILT.keys()) {
  console.log(`      ── ${id} ──`);
  for (const node of listNodes()) {
    const tools = toolsFor(id, node);
    const short = tools.map((t) => t.replace(/([A-Z])/g, (m) => m.toLowerCase()));
    console.log(`      ${node.padEnd(11)} (${String(tools.length).padStart(2)} 个)  ${short.join(', ')}`);
  }
}

// ★ 这条在改角色映射**之前是红的**（orbit 的 quiz 节点只有 queryOrbital）——
//   它抓的就是"节点里写死晶体专名"那个缺陷。
ok(toolsFor('orbit', 'quiz').includes('generateQuestion'),
   '★ orbit 在 quiz 节点拿得到出题工具（generateQuestion，靠角色解析）',
   '实际：' + toolsFor('orbit', 'quiz').join(', '))
ok(toolsFor('crystal', 'quiz').includes('generateQuiz'),
   '★ crystal 在 quiz 节点拿得到出题工具（generateQuiz）',
   '实际：' + toolsFor('crystal', 'quiz').join(', '))
ok(toolsFor('orbit', 'teach').includes('updateMastery'),
   '★ orbit 在 teach 节点拿得到"记学情"（它的名字是 updateMastery，不是 recordLearningEvent）',
   '实际：' + toolsFor('orbit', 'teach').join(', '))

// ── G1：每个已实现的工具都要**可达**（否则它永远调不到）──
{
  const unreachable = [];
  for (const [id, b] of BUILT) {
    const reachable = new Set();
    for (const node of listNodes()) for (const t of toolsFor(id, node)) reachable.add(t);
    for (const t of b.impl) if (!reachable.has(t)) unreachable.push(`${id}:${t}`);
  }
  ok(unreachable.length === 0,
     'G1：每个模块已实现的工具都至少能被某个节点取到（否则模型永远看不到它）',
     unreachable.join(', '));
}

// ── G2：角色覆盖缺口必须与显式清单**逐项一致**（双向棘轮）──
//
// ★ 为什么要"双向"：单向（只查"实际缺口 ⊆ 清单"）的清单会慢慢变成
//   "一堆没人看的豁免"；双向（两者必须相等）则**补上一个缺口却忘了删清单条目也会红**，
//   于是清单不会腐烂。
// ★ 也正因为有它，"某模块没有某能力"与"忘了声明"才区分得开。
{
  // ★ 首次运行这条时，我按"设计意图"写的清单里有 answerCheck/diagnose/variant，
  //   G2 立刻报出实测不符——那三个角色**没有任何节点在索要**（grade 节点靠 grants 里的
  //   'teach' 类已经把全部 teach 工具放开了，不必再按角色点名）。
  //   这正是双向棘轮的价值：它逼着清单与**实际**对齐，而不是与"我以为"对齐。
  const KNOWN_ROLE_GAPS = {
    crystal: ['explainConcept'],   // 晶体没有 explainConcept 工具（它的讲解不走这个工具）
    orbit: [],                     // 节点索要的六项它全有 —— ★ 修复前这里是拿不到 quizGen 的
    symmetry: ['quizGen', 'explainConcept', 'feynmanStart', 'feynmanEval',
               'recommend', 'learningEvent'],  // 阶段 C 待补：本模块还没有这些教学工具
  };
  const bad = [];
  for (const [id, b] of BUILT) {
    const wanted = new Set();
    for (const node of listNodes()) for (const r of (NODES[node].roles || [])) wanted.add(r);
    const got = [...wanted].filter((r) => !b.roles[r]).sort().join(',');
    const want = (KNOWN_ROLE_GAPS[id] || []).slice().sort().join(',');
    if (want !== got) bad.push(`${id}: 清单=[${want}] 实际=[${got}]`);
  }
  ok(bad.length === 0,
     'G2：各模块的角色覆盖缺口与 KNOWN_ROLE_GAPS 逐项相等（补上了要同步删清单条目）',
     bad.join(' | '));
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

// ⑤-2 CORE_TOOLS 里的名字必须由中枢**实际实现**
//
// ★ 名单从实现读，不在这里手抄一份。手抄的话，改了 createShellTools 却忘了改这里，
//   断言仍然绿着，而它本该守住的东西已经漂走了——本文件头部记的"测试与被测对象
//   犯同一个错、于是互相印证"就是这个形态。
//
// ★ 但"从实现读"单独用会变成自证（实现写错了名字，断言也跟着认为对）。
//   故配一份**显式清单** CORE_MUST_HAVE：少一个要有响声，防止悄悄缩水。
const shellImplemented = (() => {
  // 用桩 ctx 调一次真实实现，收集它给出的工具名。
  // 桩要提供"能开出全部工具"的能力（routes → navigateTo；demos → 演示四件套）。
  const stub = {
    getActive: () => ({ facade: { listIds: () => ['x'] } }),
    storyboard: {}, knowledge: { load: () => null }, skills: { load: () => null },
    demos: { list: () => [], manifest: () => [], byId: () => null },
    onIntent: () => ({ ok: true }),
  }
  const s = createShellTools(stub)
  return new Set(['read', 'query', 'hand', 'teach']
    .flatMap((c) => (s.defs[c] || []).map((d) => d.function.name)))
})()

const CORE_MUST_HAVE = ['getSnapshot', 'listSceneActions', 'loadKnowledge', 'loadSkill', 'applySceneActions']
const missingCore = CORE_MUST_HAVE.filter((n) => !shellImplemented.has(n))
ok(missingCore.length === 0,
   '中枢实现了全部约定工具（从实现读，不是手抄）',
   missingCore.join(','));

const coreNotImplemented = [...coreNames].filter((t) => !shellImplemented.has(t));
ok(coreNotImplemented.length === 0,
   'CORE_TOOLS 只列核心确实提供的工具',
   coreNotImplemented.join(','));

// ⑤-3 三个模块的 descriptor 工具名必须与实现一致（双向）
{
  //
  // ★ 这道检查原先**只对 orbit 做**——那正是晶体与对称性的声明能悄悄漂移的原因：
  //   晶体把 8 个已经实现的 teach 工具连同 compareCrystals 一直挂在 plannedTools 里
  //   自称"尚未实现"，对称性则漏报了已实现的 listExamples / queryPointGroup。
  //   两个方向都错，而没有东西会红。守卫只覆盖一个模块时，
  //   其余模块的漂移就是**必然**的，不是偶然。
  for (const m of mods) {
    const declared = Object.values(m.tools || {}).flat().sort();
    const actual = moduleActualToolNames(m.id);

    // 正向：声明了的必须真实现了（否则白名单会放行一个调不动的名字）
    const notImplemented = declared.filter((t) => !actual.includes(t));
    ok(notImplemented.length === 0,
       `${m.id} descriptor 声明的 ${declared.length} 个工具都已实现`,
       '未实现：' + notImplemented.join(','));
    // 反向：实现了的必须声明（否则模型看不到它——功能存在却不可用）
    //   ★ 中枢提供的名字不必在 descriptor 里声明（它们归中枢）
    const undeclared = actual.filter((t) => !declared.includes(t) && !shellImplemented.has(t));
    ok(undeclared.length === 0,
       `${m.id} 已实现的工具都已在 descriptor 里声明`,
       '漏声明：' + undeclared.join(','));
  }
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
/**
 * 某个模块**真实实现**的工具名（按壳的装配方式把它建出来，再读它的 defs）。
 *
 * ★ 这里曾经读的是 `projects/orbit/H5/js/agent/tool-registry.js` —— 那是**上游的死副本**
 *   （重构计划 P0：本地那份是陈旧的 11.6k 行，上游才是活的 17.2k 行）。
 *   于是这条断言比对的是一份**已经不参与运行**的名字清单。它当时之所以"绿"，
 *   是因为旧 descriptor 里手抄的 9 个名字恰好在那份清单里 —— 自检与实现
 *   各自引用同一份陈旧来源，**互相印证却什么也没守住**（本仓库记过这条教训）。
 *
 *   现在改为**构造真实模块**（与壳的装配方式一致：注入引擎）再读它的 defs。
 *   这才是"descriptor ⊆ 实现"该有的方向：比的是**跑起来的东西**。
 *
 * ★ 从"只给 orbit 写一个"变成"三个模块共用"，是因为**只覆盖一个的守卫等于没有守卫**：
 *   晶体与对称性的声明就在这道检查的盲区里漂了很远（见 ⑤-3 的说明）。
 *
 * ★ 桩的注入要与**壳的实际接法**一致（见 apps/web/src/main.js）：
 *   壳给晶体注入了 quiz/compute/mastery/skills，给轨道注入了
 *   quiz/diagnosis/mastery/skills；对称性什么都不注入（它的能力不依赖注入）。
 *   给少了 → 反向检查会误报"漏声明"；给多了 → 正向检查会放过幽灵名字。
 */
function moduleActualToolNames(id) {
  return Object.values(moduleBuilt(id).defsByClass).flat()
}

/**
 * 按**壳的装配方式**把某个模块建出来，返回它的分类工具与角色映射。
 *
 * ★ 为什么要"按模块"而不是用所有模块的并集：`roles` 是**每模块一份**的绑定
 *   （crystal 的 quizGen → generateQuiz，orbit 的 → generateQuestion）。
 *   并集 + 角色在语义上就错了——那会让 A 模块的角色解析出 B 模块的工具名。
 */
function moduleBuilt(id) {
  const stub = new Proxy({}, { get: () => () => ({}) })
  let mod
  if (id === 'crystal') {
    mod = createCrystalModule({
      view: {
        setProps() {}, getProps() { return {} }, setView() {}, resetView() {},
        getViewState() { return {} }, isReady() { return true },
      },
      catalog: [{ id: 'fcc' }],
      loadData: () => ({}),
      quiz: stub, compute: stub, mastery: stub, skills: stub,
      practiceGuard: () => new Set(),
    })
  } else if (id === 'symmetry') {
    mod = createSymmetryModule({ initialId: 'water' })
  } else if (id === 'orbit') {
    mod = createOrbitModule({
      quiz: { generate() {}, variant() {}, explain() {}, askQuestion() {}, evaluateFeynman() {} },
      diagnosis: { diagnose() {} },
      mastery: { update() {}, recommend() {} },
      skills: { load() { return null } },
    })
  } else {
    throw new Error(`moduleBuilt：未知模块 ${id}——`
      + '新模块必须在这里给出"按壳的接法建出来"的构造方式，'
      + '否则它的 descriptor 与角色映射都无人对账')
  }
  const defsByClass = {}
  for (const [cls, list] of Object.entries(mod.defs)) {
    defsByClass[cls] = (list || []).map((d) => d.function.name)
  }
  return { defsByClass, roles: mod.roles || {}, impl: new Set(Object.values(defsByClass).flat()) }
}
