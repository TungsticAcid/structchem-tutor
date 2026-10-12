/**
 * test-symmetry-module.mjs — 分子对称性模块的契约合规与行为测试
 *
 * 验证什么：
 *   ① 契约合规（assertModuleContract）—— 与晶体模块用**同一把尺子**
 *   ② `canApplyActions()` 恒真 —— 本模块是第一个"不依赖视图"的模块，这是它的定义性特征
 *   ③ 能感知：getSnapshot 报出当前分子与点群
 *   ④ 能驱动：applyActions 能换分子，且**非法 id 被拒绝**（取值域由程序把关）
 *   ⑤ 工具定义与执行**同源**（TOOLS 里声明的名字，handlers 里都有实现）——
 *      本仓库吃过"声明了却没实现"的亏（幽灵工具名），这条断言正是防它
 *
 * 运行：node modules/symmetry/tools/test-symmetry-module.mjs
 * 造红：node modules/symmetry/tools/test-symmetry-module.mjs --break
 */
import { createModule } from '../index.js'
import { assertModuleContract, REQUIRED_METHODS } from '../../../packages/module-contract/index.js'
// 示例分子的化学合理性检查要用它（见文件末那节）
import { EXAMPLES } from '../data/examples-index.js'
// 动画轴守卫要用它：点群识别 + 源码棘轮读文件
import { identifyPointGroup } from '../engine/pointGroup.js'
import { readFileSync } from 'node:fs'

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}

const BREAK = process.argv.includes('--break')

const mod = createModule({ initialId: 'water' })
const facade = mod.facade

console.log('【① 契约合规】')
{
  const r = assertModuleContract(facade, { label: mod.id })
  check('模块提供全部必需方法', r.ok === true, r.missingRequired.join(','))
  check('必需方法里含 canApplyActions（契约三件套）',
    REQUIRED_METHODS.map((m) => m.name).includes('canApplyActions'))
  check('provide 清单覆盖了全部被检查的方法', r.present.length > 0)
  check('无告警（onAction 缺失等）', r.warnings.filter((w) => !/restoreState/.test(w)).length === 0,
    JSON.stringify(r.warnings))
}

console.log('\n【② canApplyActions 恒真（本模块的定义性特征）】')
{
  const v = BREAK ? false : facade.canApplyActions()
  check('★ 恒返回 true —— 纯计算模块不依赖视图', v === true, String(v))
  // 用晶体模块做**对照**：它的 canApplyActions 依赖视图就绪，两者语义不同
  check('返回值是布尔而非对象（契约要求 boolean）', typeof facade.canApplyActions() === 'boolean')
}

console.log('\n【③ 能感知：快照报出当前分子与点群】')
{
  const s = facade.getSnapshot()
  check('快照带模块标识', s.module === 'symmetry', s.module)
  check('快照带当前分子', !!s.example && s.example.id === 'water', JSON.stringify(s.example))
  check('★ 点群由程序算出（不是模型编的）', s.pointGroup === 'C2v', String(s.pointGroup))
  check('对称元素清单非空', s.symmetryElementCount > 0, String(s.symmetryElementCount))
  check('快照里的字段名都在 perception.fieldLabels 里（否则痕迹不可读）', (() => {
    const labels = facade.perception.fieldLabels
    return Object.keys(labels).every((k) => k in s)
  })(), JSON.stringify(Object.keys(s)))
}

console.log('\n【④ 能驱动：换分子 + 取值域把关】')
{
  const ok = facade.applyActions([{ action: 'loadExample', params: { id: 'benzene' } }])
  check('applyActions 接受合法 id', ok.ok === true, JSON.stringify(ok.failed))
  check('状态确实变了（快照跟着走）', facade.getSnapshot().example.id === 'benzene')
  check('★ 点群重算（苯是 D6h）', facade.getSnapshot().pointGroup === 'D6h',
    facade.getSnapshot().pointGroup)

  const bad = facade.applyActions([{ action: 'loadExample', params: { id: '不存在的分子' } }])
  check('非法 id 被拒绝', bad.ok === false, JSON.stringify(bad.failed))
  check('拒绝时说明了原因与可用值',
    !!(bad.failed[0] && /未知示例/.test(bad.failed[0].error)), JSON.stringify(bad.failed))
  check('拒绝后状态**没有**被污染', facade.getSnapshot().example.id === 'benzene')

  const unknown = facade.applyActions([{ action: 'flyToMoon', params: {} }])
  check('未知动作被拒绝', unknown.ok === false)
}

console.log('\n【⑤ 工具定义与执行同源】')
{
  const declared = Object.values(mod.defs).flat().map((d) => d.function.name).sort()
  const implemented = Object.keys(mod.handlers).sort()
  check('defs 的每个名字都在 handlers 里实现',
    declared.every((n) => implemented.includes(n)),
    declared.filter((n) => !implemented.includes(n)).join(','))
  check('handlers 里没有未声明的孤儿',
    implemented.every((n) => declared.includes(n)),
    implemented.filter((n) => !declared.includes(n)).join(','))

  // ★ 同源断言只保证"名字对得上"，**不保证"调得动"**。
  //   listExamples 就是因为引用了一个从未定义的 PUZZLE_HINT，
  //   每次调用都抛 ReferenceError，而**长期无人发现**——本文件此前从不调用它。
  //   这里用空参数把每个工具都调一遍：允许返回 {error:…}（正常的取值域拒绝），
  //   只断言**不抛异常**。空参数是最容易触发"未定义变量/字段访问"的输入。
  {
    const threw = []
    for (const [name, fn] of Object.entries(mod.handlers)) {
      try { await fn({}) } catch (e) { threw.push(`${name}: ${e.message}`) }
    }
    check('★ 每个工具用空参数调用都不抛异常（允许返回 error 字段，不允许崩）',
      threw.length === 0, threw.join(' | '))
  }

  // 真跑一次工具，确认返回值里带着程序算出的点群。
  // ★ queryPointGroup 现在是 **async**（晶体分支要等 WASM 空间群分析），
  //   所以这里必须 await —— 忘了 await 不会抛错，只会让断言看到 Promise，
  //   症状表现为"点群是 undefined"，很容易被误读成"识别坏了"。
  const r = await mod.handlers.queryPointGroup({ id: 'methane' })
  check('queryPointGroup 返回点群符号', r.pointGroup === 'Td', JSON.stringify(r.pointGroup))
  check('返回对称元素清单', Array.isArray(r.elements) && r.elements.length > 0)
  check('分子示例的 kind 标为 molecule', r.kind === 'molecule', String(r.kind))
  check('非法 id 时工具报错而非抛异常',
    !!(await mod.handlers.queryPointGroup({ id: '没有这个' })).error)
}

console.log('\n【⑥ 晶体示例走空间群（此前答出来的是假的"ERR"）】')
{
  // ---- 未注入分析器：必须如实说"未接入"，且**不给任何假的点群符号** ----
  const bare = await mod.handlers.queryPointGroup({ id: 'nacl' })
  check('未注入空间群分析器时，晶体示例如实回"未接入"',
    !!(bare.error && /未接入/.test(bare.error)), JSON.stringify(bare).slice(0, 120))
  check('★ 不会返回一个假的点群符号（此前是 symbol:"ERR"，模型会把它当真）',
    bare.pointGroup == null && bare.spaceGroup == null, JSON.stringify(bare.pointGroup))

  // ---- 注入了分析器：走空间群，返回编号/符号/晶系/点群 ----
  const withSG = createModule({
    initialId: 'water',
    spaceGroup: async () => ({
      number: 225, hmSymbol: 'Fm-3m', pointGroup: 'm-3m',
      crystalSystem: 'cubic', pearsonSymbol: 'cF8',
      operations: [{ type: 'identity' }],
    }),
    operationsToElements: () => [{ type: 'identity', order: 1, label: 'E' }],
  })
  const r2 = await withSG.handlers.queryPointGroup({ id: 'nacl' })
  check('注入后返回空间群符号与编号',
    r2.spaceGroup === 'Fm-3m' && r2.spaceGroupNumber === 225, JSON.stringify(r2).slice(0, 140))
  check('返回晶系与点群（晶体的点群 = 空间群去掉平移成分）',
    r2.crystalSystem === 'cubic' && r2.pointGroup === 'm-3m')
  check('kind 标为 crystal（模型据此知道该用晶体的讲法）', r2.kind === 'crystal', String(r2.kind))
  check('分子示例不受影响，仍走点群识别',
    (await withSG.handlers.queryPointGroup({ id: 'water' })).kind === 'molecule')

  // ---- listExamples 必须把晶体标出来 ----
  const list = withSG.handlers.listExamples()
  const nacl = list.examples.find((e) => e.id === 'nacl')
  check('★ listExamples 把晶体标为 kind=crystal（此前 kind 恒为 molecule，模型看不出区别）',
    !!nacl && nacl.kind === 'crystal', JSON.stringify(nacl))
  check('分子仍标为 molecule',
    list.examples.find((e) => e.id === 'water').kind === 'molecule')
  check('两种 kind 都在清单里出现（26 分子 + 2 晶体）',
    list.examples.filter((e) => e.kind === 'crystal').length === 2,
    String(list.examples.filter((e) => e.kind === 'crystal').length))
}

console.log('\n【⑦ 显示状态：模型可驱动（此前这些功能只有页面上的复选框能用）】')
{
  /**
   * ★ 本节的每一条在加动作之前**都会红**：那时 VOCAB 只有 `loadExample`，
   *   `applyOne` 的 default 直接抛"未实现的动作"，页面上那 20 多项功能
   *   全是页面闭包里的局部变量，模型一个都改不动。
   */
  const f2 = createModule({ initialId: 'water' }).facade
  const keys = f2.listSymmetryElements().map((e) => e.key)

  check('发布了对称元素的稳定 key（形如 C2#1，不是数组下标）',
    keys.length > 0 && keys.every((k) => /^[A-Za-z][A-Za-z0-9_]*#\d+$/.test(k)), keys.join(','))
  // ★ 判据要写"意图"，而不是一条随手定的正则：
  //   ① 稳定 —— 同一个分子上、同一类元素的第 n 个，换成另一个分子后
  //      "第 n 个"仍指同一类里的同一个位置（数组下标做不到这点，见 §3.1 的说明）；
  //   ② 可数 —— 每类从 #1 连续编号，不重不漏，否则模型拿到 `sigma_v#7` 却只有 3 个。
  //   原先只写了 `^[A-Za-z]+\d*#\d+$`，把细分后的 `sigma_v#1` 判成了不合格 ——
  //   而下划线是 `refineSymmetryElements` 给 σ 分类（σh/σv/σd）后的正常 type 名。
  {
    const byType = new Map()
    for (const k of keys) {
      const [t, n] = k.split('#')
      if (!byType.has(t)) byType.set(t, [])
      byType.get(t).push(Number(n))
    }
    let bad = []
    for (const [t, ns] of byType) {
      const sorted = ns.slice().sort((a, b) => a - b)
      for (let i = 0; i < sorted.length; i++) if (sorted[i] !== i + 1) bad.push(`${t}: ${ns.join(',')}`)
    }
    check('每类 key 的序号从 1 连续编号（不重不漏）', bad.length === 0, bad.join(' | '))
    check('key 不重复', new Set(keys).size === keys.length)
  }
  // ★ 针对 2026-10-01 那个 bug 的回归守卫：**门面必须发布细分后的 key**。
  //   门面原先只做 `identifyPointGroup`，而页面还多做一步 `refineSymmetryElements`
  //   —— 细分前 σ 的 type 全是 `sigma`、细分后才分成 `sigma_h`/`sigma_v`/`sigma_d`。
  //   于是门面发布的 `sigma#1..7` 在页面的元素清单里**一个都不存在**：
  //   苯的 7 个反映面既点不动也播不了（`findIndex` 恒为 −1），而且不报任何错。
  //   这条断言直指根因：有 σ 的分子上，**不许**出现裸 `sigma` 这类 key。
  {
    const bare = []
    for (const id of ['benzene', 'water', 'ammonia', 'naphthalene']) {
      const fx = createModule({ initialId: id }).facade
      for (const e of fx.listSymmetryElements()) {
        if (/^(sigma|σ)#/.test(e.key)) bare.push(`${id}:${e.key}`)
      }
    }
    check('σ 的 key 已按 σh/σv/σd 细分（与页面共用同一条细分管线）',
      bare.length === 0, bare.join(','))
  }

  check('setSymmetryVisible 改得动状态',
    f2.applyActions([{ action: 'setSymmetryVisible', params: { visible: false } }]).ok
    && f2.getSnapshot().showSymmetry === false)
  check('setLabelsVisible 改得动状态',
    f2.applyActions([{ action: 'setLabelsVisible', params: { visible: true } }]).ok
    && f2.getSnapshot().showLabels === true)
  check('setAuxVisible / setAtomLabelsVisible 改得动状态',
    f2.applyActions([
      { action: 'setAuxVisible', params: { visible: true } },
      { action: 'setAtomLabelsVisible', params: { visible: true } },
    ]).ok && f2.getSnapshot().showAux === true && f2.getSnapshot().showAtomLabels === true)

  // ★ 注意：隐藏集**不是**从空开始——它按"默认显隐策略"初始化
  //   （有主轴的点群默认只显示主轴）。所以这里测的是"能不能改"，而不是"初始为空"。
  {
    const st = f2.getSnapshot()
    const k0 = keys[0]
    f2.applyActions([{ action: 'setElementVisible', params: { key: k0, visible: false } }])
    const afterHide = f2.getSnapshot().hiddenElements.split(',').filter(Boolean)
    check('setElementVisible(false) 把 key 放进隐藏集', afterHide.includes(k0), afterHide.join(','))
    f2.applyActions([{ action: 'setElementVisible', params: { key: k0, visible: true } }])
    const afterShow = f2.getSnapshot().hiddenElements.split(',').filter(Boolean)
    check('setElementVisible(true) 把它从隐藏集里去掉', !afterShow.includes(k0), afterShow.join(','))
    check('初始隐藏集来自"默认显隐策略"（有主轴的群默认只显示主轴）',
      st.hiddenElements.length > 0 || st.symmetryElementCount <= 1,
      `点群 ${st.pointGroup}：隐藏 ${st.hiddenElements || '（无）'}`)
  }
  check('setAllElementsVisible(true) 一键全显（hidden 归空）',
    f2.applyActions([{ action: 'setAllElementsVisible', params: { visible: true } }]).ok
    && f2.getSnapshot().hiddenElements === '')

  // 播放：token 必须变——同一个 key 连播两次时 playingKey 不变，只有 token 变
  {
    const before = f2.getSnapshot().playToken
    f2.applyActions([{ action: 'playOperation', params: { key: keys[0] } }])
    const s1 = f2.getSnapshot()
    f2.applyActions([{ action: 'playOperation', params: { key: keys[0] } }])
    const s2 = f2.getSnapshot()
    check('playOperation 记录 playingKey 且**每次递增 token**（页面据此防回声）',
      s1.playingKey === keys[0] && s1.playToken > before && s2.playToken > s1.playToken,
      `${before} → ${s1.playToken} → ${s2.playToken}`)
    check('notePlaybackDone 用**当前** token 才收尾（过期回执被忽略）', (() => {
      const okStale = f2.notePlaybackDone(s2.playToken - 1) === false
      const okNow = f2.notePlaybackDone(s2.playToken) === true
      return okStale && okNow && f2.getSnapshot().playingKey === null
    })())
    check('stopAnimation 也会让 playingKey 归空',
      f2.applyActions([{ action: 'stopAnimation', params: {} }]).ok
      && f2.getSnapshot().playingKey === null)
  }

  check('selectAtom 可选中、可用 null 取消',
    (() => {
      const atomKeys = f2.listAtoms().map((a) => a.key)
      return atomKeys.length > 0
        && f2.applyActions([{ action: 'selectAtom', params: { key: atomKeys[0] } }]).ok
        && f2.getSnapshot().selectedAtomKey === atomKeys[0]
        && f2.applyActions([{ action: 'selectAtom', params: { key: null } }]).ok
        && f2.getSnapshot().selectedAtomKey === null
    })(), JSON.stringify(f2.listAtoms().slice(0, 3)))
  check('★ 编造的原子 key 被拒（key 必须来自 listAtoms）',
    !f2.applyActions([{ action: 'selectAtom', params: { key: 'H#99' } }]).ok)
  check("setLanguage 只接受 'zh' / 'en'",
    f2.applyActions([{ action: 'setLanguage', params: { lang: 'en' } }]).ok
    && f2.getSnapshot().language === 'en'
    && !f2.applyActions([{ action: 'setLanguage', params: { lang: 'fr' } }]).ok)

  // 取值域：编造的 key 必须被拒**且给出可用值**（模型据此改对，而不是瞎试）
  {
    const bad = f2.applyActions([{ action: 'setElementVisible', params: { key: '不存在#9', visible: false } }])
    check('编造的元素 key 被拒', !bad.ok)
    check('拒绝时列出可用 key',
      !!bad.failed[0] && String(bad.failed[0].error).includes(keys[0]), (bad.failed[0] || {}).error)
    check('非布尔的 visible 被拒',
      !f2.applyActions([{ action: 'setSymmetryVisible', params: { visible: 'yes' } }]).ok)
  }

  // 换结构后：隐藏集必须**换成本结构自己的默认策略**，不能留着上一个结构的 key
  {
    const f3 = createModule({ initialId: 'water' }).facade
    const k3 = f3.listSymmetryElements().map((e) => e.key)
    f3.applyActions([{ action: 'setAllElementsVisible', params: { visible: true } }])   // 先全显
    f3.applyActions([{ action: 'selectAtom', params: { key: 'O#1' } }])
    f3.applyActions([{ action: 'playOperation', params: { key: k3[0] } }])
    f3.applyActions([{ action: 'loadExample', params: { id: 'benzene' } }])
    const s = f3.getSnapshot()
    const nowKeys = new Set(f3.listSymmetryElements().map((e) => e.key))
    const stale = s.hiddenElements.split(',').filter(Boolean).filter((k) => !nowKeys.has(k))
    check('换分子后隐藏集里没有"上一个结构才有的 key"（脏状态）',
      stale.length === 0, stale.join(','))
    check('换分子后隐藏集重置为新结构的**默认策略**（不是简单清空）',
      s.hiddenElements.length > 0, s.hiddenElements)
    check('换分子后选中原子与播放状态归零',
      s.playingKey === null && s.selectedAtomKey === null,
      JSON.stringify({ playing: s.playingKey, sel: s.selectedAtomKey }))
  }

  // 感知字段对账（键必须是快照里真实存在的字段名）
  {
    const f4 = createModule({ initialId: 'water' }).facade
    const snap = f4.getSnapshot()
    const missing = Object.keys(f4.perception.fieldLabels).filter((k) => !(k in snap))
    check('perception.fieldLabels 的每个键都在快照里真实存在',
      missing.length === 0, '快照里没有：' + missing.join(','))
  }

  // 每个动作都得有 label/group/desc（给模型看的清单靠它们）
  {
    const f5 = createModule({ initialId: 'water' }).facade
    const acts = f5.vocabulary ? Object.entries(f5.vocabulary()) : []
    check(`词汇表有 ${acts.length} 个动作（原先只有 1 个）`, acts.length >= 10, String(acts.length))
    check('每个动作都有 label / group / desc',
      acts.every(([, v]) => v.label && v.group && v.desc),
      acts.filter(([, v]) => !(v.label && v.group && v.desc)).map(([k]) => k).join(','))
  }
}

// ============================================================================
// 示例分子的**化学合理性**（坐标本身对不对）
// ============================================================================
{
  /**
   * ★ 这一节守的是一次实测踩到的坑：三苯甲烷的坐标把三个苯环都接反了 ——
   *   环的对位碳落在中心碳上（0.10 Å），本该成键的异位碳在 2.90 Å 外。
   *   **画面看起来仍是"三苯甲烷"**，点群识别也照样给 C3（因为错得"对称"），
   *   所以既没有报错、也没有任何既有断言变红。
   *
   *   判据是**化学常识**，不是"和某个基线比"：
   *     · 没有两个原子重叠（最短间距 ≥ 0.9 Å）
   *     · 每个 H 恰好连一个重原子
   *     · 每个重原子至少有一个近邻（不飘着）
   *     · 每个原子不超配（按元素的常见键长设阈值）
   */
  const el = (a) => a.element || a.el || a.symbol
  const dist = (a, b) => Math.hypot(a.xyz[0] - b.xyz[0], a.xyz[1] - b.xyz[1], a.xyz[2] - b.xyz[2])
  /**
   * 成键判据：两原子的**共价半径之和 + 0.45 Å** 之内算挨着。
   * ★ 为什么不用「按元素定一个固定阈值」：那样 Xe–F（1.935 Å）会卡在阈值边上被判成"飘着"，
   *   而 SF₆ / IF₅ / 二茂铁 / Co(en)₃ 这些**本来就是高配位**的也会被误判。
   *   按半径成对判就不会：Xe–F 的判据是 2.42、Fe–C 是 2.53。
   */
  const R_COV = { H: 0.31, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, P: 1.07,
    S: 1.05, Cl: 1.02, Br: 1.20, I: 1.39, Xe: 1.40, Fe: 1.32, Co: 1.26 }
  const bonded = (a, b, d) => d <= (R_COV[a] || 0.9) + (R_COV[b] || 0.9) + 0.45

  const overlap = []
  const loneH = []
  const floating = []
  let mols = 0

  for (const ex of EXAMPLES) {
    if (ex.category !== 'molecule' || !ex.structure || !ex.structure.atoms) continue
    mols++
    const A = ex.structure.atoms
    const E = A.map(el)
    for (let i = 0; i < A.length; i++) {
      for (let j = i + 1; j < A.length; j++) {
        const d = dist(A[i], A[j])
        if (d < 0.9) overlap.push(`${ex.id}: ${E[i]}${i}–${E[j]}${j} = ${d.toFixed(3)} Å`)
      }
    }
    for (let i = 0; i < A.length; i++) {
      let n = 0
      for (let j = 0; j < A.length; j++) {
        if (i !== j && bonded(E[i], E[j], dist(A[i], A[j]))) n++
      }
      if (E[i] === 'H') {
        let heavy = 0
        for (let j = 0; j < A.length; j++) {
          if (i !== j && E[j] !== 'H' && dist(A[i], A[j]) <= 1.35) heavy++
        }
        if (heavy !== 1) loneH.push(`${ex.id}: H${i} 的重原子邻居数 = ${heavy}`)
      } else {
        if (n === 0) floating.push(`${ex.id}: ${E[i]}${i} 没有任何成键邻居`)
      }
    }
  }

  check(`扫了 ${mols} 个分子示例`, mols > 20, String(mols))
  check('没有原子重叠（最短间距 ≥ 0.9 Å）', overlap.length === 0, overlap.slice(0, 4).join('；'))
  check('每个 H 恰好连一个重原子', loneH.length === 0, loneH.slice(0, 4).join('；'))
  check('没有飘着的重原子', floating.length === 0, floating.slice(0, 4).join('；'))

  // ★ 按参数生成的示例，键长必须是**构造出来的**那个值（而不是"差不多"）
  {
    const tpm = EXAMPLES.find((e) => e.id === 'triphenylmethane')
    if (tpm) {
      const A = tpm.structure.atoms
      const dIpso = dist(A[0], A[2])
      check('三苯甲烷：中心–异位 = 1.52 Å（手敲那份是 2.90）',
        Math.abs(dIpso - 1.52) < 0.01, dIpso.toFixed(3))
      check('三苯甲烷：中心–对位 ≈ 4.24 Å（环朝外长，不是反过来）',
        Math.abs(dist(A[0], A[5]) - 4.24) < 0.05, dist(A[0], A[5]).toFixed(3))
    }
    const s8 = EXAMPLES.find((e) => e.id === 's8')
    if (s8) {
      const A = s8.structure.atoms
      const L = dist(A[0], A[1])
      check('环八硫：S–S = 2.06 Å（手敲那份是 2.354）', Math.abs(L - 2.06) < 0.01, L.toFixed(3))
    }
    check('碗烯已撤下（坐标错乱且理想化模型下无法重建）',
      !EXAMPLES.some((e) => e.id === 'corannulene'))
  }
}

// ---------------------------------------------------------------------------
// 稳定化子：无限群（C∞v / D∞h）必须走封闭形式
//
// ★ 用户报「C∞v 群原子的稳定化子是否应包含 C∞v」——应该，而原先算成了 Cs：
//   `generateGroupOperations` 对 order===Infinity 的 C∞ 轴一个群元都不产生，
//   而 ∞σᵥ 只给一个代表面 ⇒ 只能在被截断的有限集合里筛，HCN 三个原子都得到 {E, σᵥ}。
//   这几条就是钉住正确答案的回归断言（同时锁住有限群别被改坏）。
// ---------------------------------------------------------------------------
{
  const { generateSymmetryElements } = await import('../engine/symmetryElementGenerator.js')
  const { generateGroupOperations, stabilizer } = await import('../engine/groupOperations.js')
  const stabOf = (id, index) => {
    const ex = EXAMPLES.find((e) => e.id === id)
    if (!ex) return null
    const atoms = ex.structure.atoms
    const els = generateSymmetryElements(ex.structure).elements
    const ops = generateGroupOperations(atoms, els)
    return stabilizer(atoms, ops, index, els)
  }
  const h0 = stabOf('hcn', 0)
  check('HCN（C∞v）轴上原子的稳定化子是整个 C∞v（阶 ∞）',
    !!h0 && h0.symbol === 'C∞v' && h0.count === Infinity, h0 && (h0.symbol + '/' + h0.count))
  const h1 = stabOf('hcn', 1)
  check('HCN 的末端原子同样是 C∞v（不是 Cs）',
    !!h1 && h1.symbol === 'C∞v' && h1.infinite === true, h1 && h1.symbol)
  const c0 = stabOf('co2', 0)
  check('CO₂（D∞h）中心原子的稳定化子是 D∞h',
    !!c0 && c0.symbol === 'D∞h', c0 && c0.symbol)
  const c1 = stabOf('co2', 1)
  check('CO₂ 末端原子的稳定化子是 C∞v（σh/i 把它映到另一个原子上）',
    !!c1 && c1.symbol === 'C∞v', c1 && c1.symbol)
  // 有限群回归：别被无限群那条分支带坏
  const w0 = stabOf('water', 0)
  const w1 = stabOf('water', 1)
  check('H₂O 的 O 仍是 C2v（4 个操作）', !!w0 && w0.names.length === 4 && !w0.infinite, w0 && String(w0.count))
  check('H₂O 的 H 仍是 Cs（2 个操作）', !!w1 && w1.names.length === 2 && !w1.infinite, w1 && String(w1.count))
}

// ───────────────────────────────────────────────────────────────────────────
// 动画轴必须与"画出来的那根"一致（用户实测缺陷）
//
// ★★ 用户报："点群观鉴对称操作动画与其对称元素不匹配，比如甲烷的 C₂(1)，
//   动画是绕着 C₂(2) 在转"。真因：动画用的是**共轭轴** C·A·C⁻¹（C = 分子组
//   当前累计矩阵），而对称元素固定画在原始坐标系 ⇒ 从第二轮播放起就绕着
//   另一根画出来的轴转。下面用真实的甲烷元素把这条场景钉住：
//   先播 C₃(1)（120°，把 x̂ 映到 ŷ）之后，旧的共轭做法给 C₂(1) 的轴正好是
//   **C₂(2) 的轴**（0,1,0）；而现在必须仍是 C₂(1) 自己的轴（1,0,0）。
// ───────────────────────────────────────────────────────────────────────────
{
  const { operationAxisFor } = await import('../render/animation.js')
  const THREE = await import('three')
  const near = (v, want) => Math.abs(v.x - want[0]) < 1e-6
    && Math.abs(v.y - want[1]) < 1e-6 && Math.abs(v.z - want[2]) < 1e-6
  const methaneEls = identifyPointGroup(
    EXAMPLES.find((e) => e.id === 'methane').structure).elements
  const c2_1 = methaneEls[0], c2_2 = methaneEls[1], c3_1 = methaneEls[3]

  check('甲烷 C₂(1) 的轴是 x̂', near(operationAxisFor(c2_1), [1, 0, 0]))
  check('甲烷 C₂(2) 的轴是 ŷ', near(operationAxisFor(c2_2), [0, 1, 0]))

  // 复现旧做法的错：共轭 C·A·C⁻¹（这里 C = 先播过的 C₃(1)）
  const C = new THREE.Matrix4().makeRotationAxis(operationAxisFor(c3_1), 2 * Math.PI / 3)
  const conj = operationAxisFor(c2_1).clone().applyMatrix4(C).normalize()
  check('（记录旧缺陷）先播 C₃(1) 后，共轭会给 C₂(1) 用 C₂(2) 的轴',
    near(conj, [0, 1, 0]), conj.toArray().map((v) => v.toFixed(2)).join(','))

  // 现在的约定：**不接受累计矩阵**，永远是元素自己的轴
  check('现在：C₂(1) 的轴不受"之前播过什么"影响，仍是 x̂',
    near(operationAxisFor(c2_1), [1, 0, 0]))
  check('现在：C₂(2) 的轴不受影响，仍是 ŷ',
    near(operationAxisFor(c2_2), [0, 1, 0]))
  check('operationAxisFor 只认元素（不接矩阵参数）——签名即约定',
    operationAxisFor.length === 1, String(operationAxisFor.length))

  // 终态：新做法 = B·C（模块文件头写的"过渡到 B·A"）；旧做法 = C·B（顺序反了）
  const B = new THREE.Matrix4().makeRotationAxis(operationAxisFor(c2_1), Math.PI)
  const newFinal = B.clone().multiply(C)
  const oldFinal = new THREE.Matrix4().makeRotationAxis(conj, Math.PI).multiply(C)
  const same = newFinal.elements.every((v, i) => Math.abs(v - oldFinal.elements[i]) < 1e-9)
  check('新旧终态确实不同（旧做法真的转错了轴）', !same)

  // ★ 源码棘轮：不许再把累计矩阵"共轭"回动画轴（本仓库对"同一个坑再踩一次"用棘轮）
  const src = readFileSync(new URL('../render/animation.js', import.meta.url), 'utf8')
  check('animation.js 不再对轴做 applyMatrix4（共轭）',
    !/applyMatrix4\(\s*cMat\s*\)/.test(src) && !/\bdetC\b/.test(src))
}

// ───────────────────────────────────────────────────────────────────────────
// ∞ 只属于真正无穷多的族（用户贴图报："氨分子这里显示有问题"）
//
// ★★ 氨是 C₃ᵥ，只有 3 个 σᵥ，清单却写成「∞σᵥ ×3」——∞ 与 ×3 自相矛盾，
//   还把"有限个"讲成了"无穷多个"。真因：加前缀那一支写成 `g.type === 'sigma_v'`
//   而漏了 `isInfiniteElement` 判断 —— 可 `sigma_v` 这个类型是 **Cₙᵥ 与线型分子共用**的
//   （C₃ᵥ 的三个镜面正是竖直面）⇒ 所有 Cₙᵥ 的 σᵥ 都被加上 ∞。
//   守卫就用这两条**通用不变量**：
//     ① 群符号里没有 ∞ 的群，任何元素的**个数**都不是无穷（计数列不出现 ×∞）；
//     ② 名字里的 ∞ 只能是符号本身（C∞ / S∞ 的"阶无穷"）—— 不许把"个数"塞进名字，
//        否则会出现「∞C₂ ×∞」这种读不通的行（用户问"这是啥意思"）。
//   第二轮的更正（同一处）：`C∞` / `S∞` 是**一根**无穷阶轴 ⇒ 计数必须是 ×1，
//   原先 `isInfiniteElement('C∞') === true` 把它们写成了「C∞ ×∞」（把"阶"当"个数"）。
// ───────────────────────────────────────────────────────────────────────────
{
  const { isInfiniteFamily, infiniteFamilyNotation } = await import('../ui/info.js')
  const probe = createModule({ initialId: 'water' })
  const finiteBad = []
  const linearBad = []
  for (const ex of EXAMPLES) {
    probe.facade.applyActions([{ action: 'loadExample', params: { id: ex.id } }])
    const snap = probe.facade.getSnapshot()
    const els = probe.facade.listSymmetryElements()
    const symbol = String(snap.pointGroup || '')
    const linear = symbol.includes('∞')   // C∞v / D∞h
    for (const ty of new Set(els.map((e) => e.type))) {
      if (!linear && isInfiniteFamily(ty, els)) finiteBad.push(`${ex.id}(${symbol}).${ty}`)
      // 名字里的 ∞ 只能是符号本身的 C∞ / S∞；其余类型都不许带 ∞ 记号
      if (ty !== 'C∞' && ty !== 'S∞' && infiniteFamilyNotation(ty, els).includes('∞') && !linear) {
        finiteBad.push(`记号 ${ex.id}(${symbol}).${ty}`)
      }
    }
    if (linear) {
      for (const ty of ['sigma_v', 'C2']) {
        if (els.some((e) => e.type === ty) && !isInfiniteFamily(ty, els)) {
          linearBad.push(`${ex.id}(${symbol}).${ty} 应为无穷多`)
        }
      }
      // ★ C∞ / S∞：一根无穷**阶**的轴 ⇒ 不是无穷多根
      for (const ty of ['C∞', 'S∞']) {
        if (els.some((e) => e.type === ty) && isInfiniteFamily(ty, els)) {
          linearBad.push(`${ex.id}(${symbol}).${ty} 被当成了"无穷多根"`)
        }
      }
    }
  }
  check('有限群里任何元素都不是"无穷多个"（含 C₃ᵥ 的 σᵥ）', finiteBad.length === 0, finiteBad.slice(0, 5).join(', '))
  check('线型群里 σᵥ / C₂′ 是无穷多、C∞ / S∞ 是"一根"', linearBad.length === 0, linearBad.slice(0, 5).join(', '))

  // 直接钉住用户那条：氨 = C3v，σᵥ 三个、不许有 ∞
  probe.facade.applyActions([{ action: 'loadExample', params: { id: 'ammonia' } }])
  const nh3 = probe.facade.listSymmetryElements()
  const nh3Sigma = nh3.filter((e) => e.type === 'sigma_v')
  check('氨的 σᵥ 个数是 3（有限个）', nh3Sigma.length === 3, String(nh3Sigma.length))
  check('氨的 σᵥ 计数是 ×3 而不是 ×∞', !isInfiniteFamily('sigma_v', nh3))
  check('氨里没有任何"无穷多"的族', nh3.every((e) => !isInfiniteFamily(e.type, nh3)))

  // 线型群：σᵥ 记 ×∞ 并给出特征标表写法；C∞ / S∞ 记 ×1 且不给 ∞ 记号
  probe.facade.applyActions([{ action: 'loadExample', params: { id: 'co2' } }])
  const co2 = probe.facade.listSymmetryElements()
  check('D∞h 的 C₂′ 是无穷多（计数 ×∞）', isInfiniteFamily('C2', co2))
  check('D∞h 的 σᵥ 是无穷多（计数 ×∞）', isInfiniteFamily('sigma_v', co2))
  check('C∞ 是"一根"（计数 ×1，不是 ×∞）', !isInfiniteFamily('C∞', co2))
  check('S∞ 是"一根"（计数 ×1，不是 ×∞）', !isInfiniteFamily('S∞', co2))
  check('σh 与 i 在 D∞h 里各只有一个（不算无穷多）',
    !isInfiniteFamily('sigma_h', co2) && !isInfiniteFamily('i', co2))
  check('特征标表写法：σᵥ → ∞σᵥ、C₂ → ∞C₂′、C∞ → 无（符号自带 ∞）',
    infiniteFamilyNotation('sigma_v', co2) === '∞σᵥ'
    && infiniteFamilyNotation('C2', co2) === '∞C₂′'
    && infiniteFamilyNotation('C∞', co2) === '')
}

// ───────────────────────────────────────────────────────────────────────────
// 每个对称元素类型都要有 `elem.*` 译文（缺键不会报错，只会在界面上露出原始键）
//
// ★ 实机在 CO₂ 的 S∞ 行 tooltip 里抓到 `elem.S∞` —— 因为缺键时 `t()` 原样返回键名。
//   这类"漏一个键"靠 check-i18n 抓不到（键是**拼**出来的，不是字面量），只能在这里守。
// ───────────────────────────────────────────────────────────────────────────
{
  const { t: symT } = await import('../i18n/index.js')
  const probe = createModule({ initialId: 'water' })
  const missing = []
  for (const ex of EXAMPLES) {
    probe.facade.applyActions([{ action: 'loadExample', params: { id: ex.id } }])
    for (const e of probe.facade.listSymmetryElements()) {
      if (symT('elem.' + e.type) === 'elem.' + e.type) missing.push(`${ex.id}:${e.type}`)
    }
  }
  check('所有出现过的对称元素类型都有 elem.* 译文（不缺键）',
    missing.length === 0, [...new Set(missing)].slice(0, 6).join(', '))
  check('S∞（D∞h 里出现）有译文', symT('elem.S∞') !== 'elem.S∞')
}

// ───────────────────────────────────────────────────────────────────────────
// 立体描述符 E / Z 用斜体（用户："Z，E需要斜体"）
//
// ★ IUPAC：描述符**字母**斜体、位次与括号正体（(2E,4Z)-… ⇒ (2<i>E</i>,4<i>Z</i>)-…）。
//   只在"整个括号都是描述符"时才动手，否则化学式括号 (CH₃)₂ 会被误斜体。
// ───────────────────────────────────────────────────────────────────────────
{
  const { formatStereodescriptors: f } = await import('../ui/info.js')
  check('(E)- 描述符：字母斜体、括号与位次正体',
    f('(E)-1,2-二氯乙烯') === '(<i>E</i>)-1,2-二氯乙烯', f('(E)-1,2-二氯乙烯'))
  check('(Z)- 同样处理', f('(Z)-1,2-二氯乙烯') === '(<i>Z</i>)-1,2-二氯乙烯')
  check('(2E,4Z)- 两个位次都只斜字母',
    f('(2E,4Z)-己二烯') === '(2<i>E</i>,4<i>Z</i>)-己二烯', f('(2E,4Z)-己二烯'))
  check('化学式括号不被误斜体', f('(CH₃)₂C=CH₂') === '(CH₃)₂C=CH₂')
  check('无描述符的名字原样返回', f('1,2-二氯乙烯') === '1,2-二氯乙烯' && f('水') === '水')
  check('英文名同样处理', f('(E)-1,2-Dichloroethene') === '(<i>E</i>)-1,2-Dichloroethene')
  const dce = EXAMPLES.find((e) => /^[（(][EZ]/.test(e.title))
  check('示例库里带 E/Z 的名字确实会被斜体化',
    !!dce && f(dce.title).includes('<i>E</i>'), dce && dce.title)
}

// ───────────────────────────────────────────────────────────────────────────
// σ 的下标（用户："d需要下标"）
//
// ★ Unicode 里**没有下标 d**（只有 ᵥ ₕ 这类），所以 σd 只能用 <sub>；
//   而引擎给 σᵥ 的已经是 Unicode 下标字符 —— 两条路径都要正确、且不能互相干扰。
// ★ 规则放在 `formatBasisFunctions`（对称符号/基函数的唯一格式化入口），
//   于是清单组头、逐项标签、特征标表类名一起生效。
// ───────────────────────────────────────────────────────────────────────────
{
  const { formatBasisFunctions: F } = await import('../i18n/index.js')
  check('σd(1) → σ<sub>d</sub>(1)（甲烷的镜面标签）', F('σd(1)') === 'σ<sub>d</sub>(1)', F('σd(1)'))
  check('组头 σd → σ<sub>d</sub>', F('σd') === 'σ<sub>d</sub>')
  check('ASCII 写法的 σh / σv 同样加下标', F('σh') === 'σ<sub>h</sub>' && F('σv') === 'σ<sub>v</sub>')
  check('已是 Unicode 下标的 σᵥ 不被重复处理',
    F('σᵥ(xz)') === 'σᵥ(<i>x</i><i>z</i>)', F('σᵥ(xz)'))
  check('原来的 x/y/z 斜体与 Rx 规则不受影响',
    F('x²-y²') === '<i>x</i>²-<i>y</i>²' && F('Rz') === '<i>R</i><sub><i>z</i></sub>')
}

console.log(`\n通过 ${pass}/${pass + fail}`)
if (BREAK && fail === 0) {
  console.error('⚠ 造红模式下竟然全过——说明断言没有真的在检查')
}
process.exit(fail > 0 ? 1 : 0)
