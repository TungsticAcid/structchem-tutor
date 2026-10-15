/**
 * test-demo-favorites.mjs — 收藏夹的**导出 / 导入**守卫
 *
 * 用户："收藏的演示是否能永久可重播？" → 选定"导出/导入"。
 * 判据（全部是行为，不看源码）：
 *   ① 导出 → 导入**回到空收藏夹** ⇒ 逐条回来（可携带性）
 *   ② 导入是**合并**：现有收藏不被删、同一条重复会被跳过
 *   ③ 坏数据不炸：非 JSON / 缺 favorites / 里面夹着坏条目 —— 都要如实报数
 *   ④ key **必须重新生成**（跨机器导入不得与本机撞号）
 *   ⑤ 上限仍然生效，且**如实报出丢了几条**（静默丢弃是刚修过的缺陷类型）
 *   ⑥ 步骤与模块归属逐字保留（回放靠它们）
 */
import { createDemoFavorites } from '../store/demo-favorites.js'

let ok = 0
let bad = 0
function check(name, cond, detail) {
  if (cond) { ok++; console.log('  ✓ ' + name) } else { bad++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')) }
}

/** 一个内存 storage（模拟 localStorage） */
function memStorage() {
  const data = {}
  return {
    getItem: (k) => (data[k] === undefined ? null : data[k]),
    setItem: (k, v) => { data[k] = String(v) },
    removeItem: (k) => { delete data[k] },
    _data: data,
  }
}

const STEPS_A = [
  { action: 'setQuantumNumbers', params: { n: 3, l: 1, m: 0 }, speech: '先切到 3pz', module: 'orbit' },
  { action: 'setRenderMode', params: { mode: 'surface' }, speech: '看等值面', module: 'orbit' },
]
const STEPS_B = [{ action: 'showSymElements', params: { on: true }, speech: '显示对称元素', module: 'symmetry' }]

// ── ① 导出 → 空收藏夹 → 导入 ⇒ 逐条回来 ─────────────────────────────────────
{
  const s1 = memStorage()
  const f1 = createDemoFavorites({ storage: s1, storageKey: 'k' })
  f1.save('演示甲', STEPS_A, { origin: 'agent', module: 'orbit' })
  f1.save('演示乙', STEPS_B, { origin: 'favorite', module: 'symmetry' })
  const out = f1.exportData()
  check('① 导出带应用标识与版本（便于将来迁移）',
    out.app === 'chem-agent' && out.kind === 'demo-favorites' && out.version === 1 && Array.isArray(out.favorites))
  check('① 导出内容条数正确', out.favorites.length === 2, `favorites=${out.favorites.length}`)

  // 换一个"全新的浏览器"（空 storage）导入
  const s2 = memStorage()
  const f2 = createDemoFavorites({ storage: s2, storageKey: 'k' })
  const r = f2.importData(JSON.stringify(out))
  check('① 导入成功且条数一致', r.ok && r.added === 2 && f2.count() === 2,
    `ok=${r.ok} added=${r.added} count=${f2.count()}`)
  const back = f2.list().find((x) => x.label === '演示甲')
  check('① 步骤逐字保留（回放靠它）',
    !!back && back.steps.length === 2 && back.steps[0].action === 'setQuantumNumbers'
      && back.steps[0].speech === '先切到 3pz',
    back ? JSON.stringify(back.steps[0]) : '没找到')
  check('① 模块归属保留（跨板块回放靠它）',
    !!back && back.module === 'orbit' && back.steps.every((s) => s.module === 'orbit'),
    back ? `module=${back.module} steps=${back.steps.map((s) => s.module).join(',')}` : '')
  check('① 标签与时间保留', !!back && back.label === '演示甲' && typeof back.at === 'number')
}

// ── ② 合并语义：不覆盖、去重 ────────────────────────────────────────────────
{
  const s = memStorage()
  const f = createDemoFavorites({ storage: s, storageKey: 'k' })
  f.save('本机已有', STEPS_A, { module: 'orbit' })
  const r = f.importData({ favorites: [
    { label: '换了名字的同一条', steps: STEPS_A, at: 1, module: 'orbit' },   // 动作序列与本机已有相同 → 重复
    { label: '演示乙', steps: STEPS_B, at: 2, module: 'symmetry' },
  ] })
  check('② 导入是合并：本机原有收藏**仍在**', f.count() === 2 && !!f.list().find((x) => x.label === '本机已有'),
    `count=${f.count()}`)
  /**
   * ★ 判据：重复按**动作序列**算，不按名字 —— 学生改了名字的那条仍然算同一条，
   *   否则反复导入同一份文件会越堆越多（这正是实机走查抓出来的缺陷）。
   */
  check('② 计数如实：同名内容跳过 1、真新增 1', r.ok && r.added === 1 && r.skipped === 1,
    `added=${r.added} skipped=${r.skipped}`)

  // 再导入同一份 ⇒ 全部重复
  const r2 = f.importData({ favorites: [
    { label: '演示甲', steps: STEPS_A, at: 1, module: 'orbit' },
    { label: '演示乙', steps: STEPS_B, at: 2, module: 'symmetry' },
  ] })
  check('② 同一份再导入：全部判为重复（不重复堆积）',
    r2.ok && r2.added === 0 && r2.skipped === 2 && f.count() === 2,
    `added=${r2.added} skipped=${r2.skipped} count=${f.count()}`)
}

// ── ③ 坏数据不炸、如实报数 ─────────────────────────────────────────────────
{
  const s = memStorage()
  const f = createDemoFavorites({ storage: s, storageKey: 'k' })
  const r1 = f.importData('这不是 JSON {{{')
  check('③ 非 JSON：ok=false 且带错误说明（不抛异常）',
    r1.ok === false && !!r1.error && r1.added === 0)
  const r2 = f.importData({ hello: 'world' })
  check('③ 缺 favorites 字段：ok=false', r2.ok === false && !!r2.error)
  const r3 = f.importData({ favorites: [
    { label: '好的', steps: STEPS_A, module: 'orbit' },
    { label: '坏的', steps: [] },                       // 空步骤 → 坏
    { label: '也坏', steps: 'not-array' },              // 非数组 → 坏
    null,
  ] })
  check('③ 夹着坏条目：好的进来、坏的计数（不整份失败）',
    r3.ok && r3.added === 1 && r3.bad === 3 && f.count() === 1,
    `added=${r3.added} bad=${r3.bad} count=${f.count()}`)
  const arr = f.importData([{ label: '数组形式', steps: STEPS_B, module: 'symmetry' }])
  check('③ 兼容"直接给数组"的手写文件', arr.ok && arr.added === 1 && f.count() === 2, `added=${arr.added}`)
}

// ── ④ key 必须重新生成（跨机器导入不得撞号） ────────────────────────────────
{
  const s = memStorage()
  const f = createDemoFavorites({ storage: s, storageKey: 'k' })
  f.save('本机', STEPS_A, { module: 'orbit' })
  const mineKey = f.list()[0].key
  f.importData({ favorites: [{ key: mineKey, label: '外来', steps: STEPS_B, module: 'symmetry' }] })
  const keys = f.list().map((x) => x.key)
  check('④ 导入条目的 key 被重新生成（不与本机撞号）',
    f.count() === 2 && new Set(keys).size === 2 && keys.filter((k) => k === mineKey).length === 1,
    `keys=${keys.join(',')}`)
}

// ── ⑤ 上限仍然生效，且如实报出丢弃数 ───────────────────────────────────────
{
  const s = memStorage()
  const f = createDemoFavorites({ storage: s, storageKey: 'k' })
  const many = { favorites: [] }
  for (let i = 0; i < f.MAX + 10; i++) {
    many.favorites.push({ label: '第' + i + '条', steps: [{ action: 'a' + i, params: {}, speech: 's' + i }] })
  }
  const r = f.importData(many)
  check('⑤ 超出上限时截到 MAX，并**如实报出**丢弃条数',
    f.count() === f.MAX && r.dropped === 10 && r.added === f.MAX,
    `count=${f.count()} dropped=${r.dropped} added=${r.added}`)
}

// ── ⑥ 配额满时不再假装成功（上一轮实测出的缺陷）────────────────────────────
{
  const failing = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError') },
    removeItem: () => {},
  }
  const f = createDemoFavorites({ storage: failing, storageKey: 'k' })
  const r = f.save('存不进去的', STEPS_A, { module: 'orbit' })
  check('⑥ ★ 配额满：save 必须**如实**报告失败（不能返回 ok 而实际没存）',
    r.ok === false, `ok=${r.ok} count=${f.count()}（修复前实测：ok=true 但 count=0）`)
}

console.log('\n结果：通过 ' + ok + ' 项，失败 ' + bad + ' 项')
process.exit(bad ? 1 : 0)
