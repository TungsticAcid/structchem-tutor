/**
 * store/demo-favorites.js — 演示收藏夹（存本机）
 *
 * 解决的问题：**一条讲得好的演示，学生想留着反复看**。
 * 演示记录（storyboard 的 `demos`）只活在一次会话里——刷新就没了，
 * 换一个会话也带不过去。而"哪条演示值得留着"是**人的判断**，程序猜不出来，
 * 所以要有显式的"收藏"动作。
 *
 * ★ 与演示记录（`demos`）的分工：
 *   · 演示记录 = "这次会话放过什么"（自动、易失、由对话历史重建）
 *   · 收藏夹   = "哪些值得留着"（手动、持久、跨会话）
 *   两者都要有：前者的价值是"刚才那条能重播"，后者的价值是"上周那条还在"。
 *
 * ★ 只存本机（localStorage），不上传——与 BYOK 的隐私姿态一致。
 * ★ 收藏的是**步骤清单**（action/params/speech），不是渲染结果：回放时按当前
 *   视图重新执行一遍，所以一年后回放仍然是对的（而截图会过时）。
 */
// ★ 两条文案都走 t() 而不是 `text` 表：默认名会被面板渲染成 `'★ ' + label`
//   （同一个文本节点里带了前缀），整段不等于原文，扫描替换匹配不上。
// ★ 自己 import 字典（副作用即 registerDict），不依赖入口替你注册
import '../i18n.js'
import { t } from '../../i18n/index.js'

/** 最多收藏多少条（每条几十步，50 条大约几十 KB，远在配额之内） */
const MAX_FAVORITES = 50

/**
 * @param {Object} [opts]
 * @param {Object} [opts.storage]    具备 getItem/setItem/removeItem（缺省 localStorage）
 * @param {string} [opts.storageKey]
 * @param {Function} [opts.now]      时间源（可注入以便测试）
 */
export function createDemoFavorites(opts = {}) {
  const storage = opts.storage
    || (typeof localStorage !== 'undefined' ? localStorage : null)
  // ★ 同 panel.js：存储键**必须由宿主注入**，没有缺省值。
  //   「中性缺省名」不算修好——只是把「悄悄共享」换成「悄悄各存各的」，两者都查不出来。
  if (!opts.storageKey) {
    throw new Error('createDemoFavorites 需要 opts.storageKey：'
      + '存储命名空间必须由宿主注入（契约 HOST_REQUIREMENTS_SHAPE.storage）')
  }
  const key = opts.storageKey
  const now = opts.now || Date.now

  function read() {
    try {
      const raw = storage && storage.getItem(key)
      const list = raw ? JSON.parse(raw) : []
      return Array.isArray(list) ? list.filter((x) => x && x.key && Array.isArray(x.steps)) : []
    } catch (e) { return [] }
  }

  /**
   * 写盘。**返回值必须可信**：调用方要据此如实告知"存进去了没有"。
   *
   * ★★ 2026-10-15（实测出的缺陷）：原先**一律 `return true`** —— 即使
   *   `setItem` 抛了 `QuotaExceededError`、什么都没写进去，调用方看到的也是成功。
   *   实测：假 storage 恒抛配额错时，`save()` 返回 `{ok:true}` 而 `count()` 是 **0**
   *   —— 界面上学生看到"★ 已收藏"，其实**一个字都没存**。这种"静默丢数据"
   *   正是本仓反复修的那一类，故一并修掉。
   * ★ 没有 storage 时返回 true：那是"内存态"（测试或纯内存运行），
   *   调用方**能立刻读到**自己写的东西，不算失败。
   */
  function write(list) {
    if (!storage) return true
    try {
      storage.setItem(key, JSON.stringify(list))
      return true
    } catch (e) {
      // ★ 配额满时降级：丢掉最旧的一半再试一次（收藏夹被砍总比整条链路报错好）
      try {
        if (list.length > 4) {
          const half = list.slice(0, Math.floor(list.length / 2))
          storage.setItem(key, JSON.stringify(half))
          return true
        }
      } catch (e2) { /* 仍然写不进去 */ }
      return false
    }
  }

  /** 全部收藏（最近收藏的在前） */
  function list() {
    return read().sort((a, b) => (b.at || 0) - (a.at || 0))
  }

  /** 取某一条 */
  function get(k) {
    return read().find((x) => x.key === k) || null
  }

  /**
   * 收藏一条演示。
   * @param {string} label 给学生看的名字（缺省用步骤里第一条旁白的前 20 字）
   * @param {Array}  steps 步骤清单（与 applySceneActions 的 actions 同形）
   * @param {Object} [meta] { origin, kp, crystalId }
   * @returns {{ok:boolean, key?:string, error?:string}}
   */
  function save(label, steps, meta) {
    const list = read()
    if (!Array.isArray(steps) || !steps.length) {
      return { ok: false, error: t('agent.fav.noSteps') }
    }
    const name = String(label || '').trim()
      || (steps.find((s) => s && s.speech) || {}).speech || t('agent.fav.untitled')
    const entry = {
      key: 'f' + now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      label: String(name).slice(0, 40),
      at: now(),
      origin: (meta && meta.origin) || 'agent',
      kp: (meta && meta.kp) || null,
      crystalId: (meta && meta.crystalId) || null,
      /**
       * ★★ 2026-10-08：**必须存模块归属**（用户预感的那个"潜在问题"正出在这里）。
       *
       *   收藏是跨会话、跨板块的清单。以前只存 action/params/speech，于是
       *   "在轨道板块收藏 → 切到晶体板块点播放"会把轨道的动作拿去套晶体的词汇表：
       *   要么报"不支持的动作"，要么**同名动作悄悄落到另一个板块**。
       *   现在记录里带 `module`，回放前宿主会先把该板块的页面叫回来（见 panel.js）。
       *   ★ 步骤级也存一份：整条记录与单个步骤的归属要一致，缺哪一个都会退化成猜。
       */
      module: (meta && meta.module) || null,
      steps: steps.map((s) => ({
        action: s.action, params: s.params, speech: s.speech,
        module: (s && s.module) || (meta && meta.module) || null,
      })),
    }
    list.unshift(entry)
    while (list.length > MAX_FAVORITES) list.pop()
    /**
     * ★ 写盘结果**必须如实返回**（见 write 的说明）：存不进去时 `ok:false`
     *   —— 面板据此显示"没存进去"，而不是骗学生一句"★ 已收藏"。
     */
    if (!write(list)) {
      return { ok: false, key: entry.key, label: entry.label, count: entry.steps.length, error: t('agent.fav.saveFailed') }
    }
    return { ok: true, key: entry.key, label: entry.label, count: entry.steps.length }
  }

  /** 改名 */
  function rename(k, label) {
    const list = read()
    const rec = list.find((x) => x.key === k)
    if (!rec) return false
    rec.label = String(label || '').slice(0, 40) || rec.label
    return write(list)
  }

  /** 删除一条 */
  function remove(k) {
    const list = read()
    const next = list.filter((x) => x.key !== k)
    if (next.length === list.length) return false
    return write(next)
  }

  function count() { return read().length }

  /**
   * ★★ 2026-10-15（用户："收藏的演示是否能永久可重播？" → 选定"导出/导入"）：
   *   **导出成一个文件**，学生自己保管；换浏览器、换设备、清过浏览器数据都能带回去。
   *
   *   为什么是"导出文件"而不是"同步到服务器"：本工具的 BYOK 姿态就是**不依赖服务器**
   *   （密钥只在本机、对话只在本机）——收藏也该如此。而且 localStorage 属于浏览器，
   *   我们无法阻止"清浏览器数据"，能做的只是**让学生手里有一份**。
   *
   *   ★ 导出的是**条目本身**（label/at/steps/module…），不是渲染结果：
   *     回放时按当时的视图重新执行，所以一年后导入回来仍然是对的。
   *   ★ 带 `app` / `version` / `exportedAt`：导入时能认出"这是不是本工具的收藏文件"，
   *     将来 schema 变化也有依据可迁移。
   */
  function exportData() {
    return {
      app: 'chem-agent',
      kind: 'demo-favorites',
      version: 1,
      exportedAt: now(),
      favorites: read(),
    }
  }

  /**
   * 导入一份导出数据（**合并**，不覆盖）。
   *
   * 三条纪律：
   *   ① **不覆盖**现有收藏 —— 学生导入是为了"把以前那份拿回来"，
   *      不是"把现在这份删掉"。同一条（label+steps 完全相同）视为重复，跳过。
   *   ② **上限仍然生效**：合并后超过 MAX_FAVORITES 时丢掉**最旧**的，并如实报出丢了几条
   *      （静默丢弃是上一轮刚修过的那类缺陷）。
   *   ③ 数据要**逐条校验**：坏条目跳过并计数，不因为一条坏的就整份失败。
   *
   * @param {Object|string} data 导出数据（对象或 JSON 文本）
   * @returns {{ok:boolean, added:number, skipped:number, bad:number, dropped:number, total:number, error?:string}}
   */
  function importData(data) {
    let obj = data
    if (typeof data === 'string') {
      try { obj = JSON.parse(data) } catch (e) { return { ok: false, added: 0, skipped: 0, bad: 0, dropped: 0, total: count(), error: t('agent.fav.import.badJson') } }
    }
    if (!obj || typeof obj !== 'object') {
      return { ok: false, added: 0, skipped: 0, bad: 0, dropped: 0, total: count(), error: t('agent.fav.import.badShape') }
    }
    // 兼容"直接给数组"的手写文件
    const incoming = Array.isArray(obj) ? obj : obj.favorites
    if (!Array.isArray(incoming)) {
      return { ok: false, added: 0, skipped: 0, bad: 0, dropped: 0, total: count(), error: t('agent.fav.import.badShape') }
    }
    const list = read()
    /**
     * 重复判据 = **动作序列**（action + speech 序列），**不含 label**。
     *
     * ★ 实测抓到的缺陷：第一版把 label 也拼进签名，于是"同一条演示、只是名字不同"
     *   不会被判重复 ⇒ 反复导入同一份文件就会**越堆越多**（用户要的"导入把以前那份
     *   拿回来"变成了"每次多一份"）。名字是学生随手改的，**内容才是身份**。
     */
    const sig = (x) => JSON.stringify((x.steps || []).map((s) => [s && s.action, s && s.speech]))
    const seen = new Set(list.map(sig))
    let skipped = 0
    let bad = 0
    const fresh = []
    for (const item of incoming) {
      if (!item || !Array.isArray(item.steps) || !item.steps.length) { bad++; continue }
      if (seen.has(sig(item))) { skipped++; continue }
      /**
       * key 一律**重新生成**：文件可能在另一台机器上导出，直接沿用旧 key 会与
       * 本机已有条目撞号（撞号的表现是"删一条，另一条也没了"）。
       */
      const entry = {
        key: 'f' + now().toString(36) + Math.floor(Math.random() * 1e4).toString(36) + 'i',
        label: String(item.label || t('agent.fav.untitled')).slice(0, 40),
        at: Number(item.at) || now(),
        origin: item.origin || 'import',
        kp: item.kp || null,
        crystalId: item.crystalId || null,
        module: item.module || null,
        steps: item.steps.map((s) => ({
          action: s && s.action, params: (s && s.params) || {}, speech: s && s.speech,
          module: (s && s.module) || item.module || null,
        })),
      }
      seen.add(sig(item))
      fresh.push(entry)
    }
    /**
     * ★ `added` 与 `dropped` 必须**按最终留下来的算**。
     *   实测抓到的缺陷：第一版先 `added++` 再截断，于是导入 60 条、上限 50 时
     *   报的是"新增 60、丢弃 10" —— 学生按这个数字清理，怎么算都对不上。
     */
    const merged = fresh.concat(list)
    while (merged.length > MAX_FAVORITES) merged.pop()
    const dropped = Math.max(0, fresh.length + list.length - merged.length)
    const added = fresh.filter((e) => merged.indexOf(e) >= 0).length
    if (!write(merged)) {
      return {
        ok: false, added: 0, skipped, bad, dropped: 0, total: count(),
        error: t('agent.fav.import.saveFailed'),
      }
    }
    return { ok: true, added, skipped, bad, dropped, total: merged.length }
  }

  return { list, get, save, rename, remove, count, exportData, importData, MAX: MAX_FAVORITES }
}

export default createDemoFavorites
