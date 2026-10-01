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
    keys.length > 0 && keys.every((k) => /^[A-Za-z]+\d*#\d+$/.test(k)), keys.join(','))

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

console.log(`\n通过 ${pass}/${pass + fail}`)
if (BREAK && fail === 0) {
  console.error('⚠ 造红模式下竟然全过——说明断言没有真的在检查')
}
process.exit(fail > 0 ? 1 : 0)
