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

  function write(list) {
    try {
      if (storage) storage.setItem(key, JSON.stringify(list))
      return true
    } catch (e) {
      // ★ 配额满时降级：丢掉最旧的一半再试一次（收藏夹被砍总比整条链路报错好）
      try {
        if (storage && list.length > 4) {
          storage.setItem(key, JSON.stringify(list.slice(0, Math.floor(list.length / 2))))
          return true
        }
      } catch (e2) { /* 放弃持久化 */ }
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
      steps: steps.map((s) => ({
        action: s.action, params: s.params, speech: s.speech,
      })),
    }
    list.unshift(entry)
    while (list.length > MAX_FAVORITES) list.pop()
    write(list)
    return { ok: true, key: entry.key, label: entry.label, count: entry.steps.length }
  }

  /** 改名 */
  function rename(k, label) {
    const list = read()
    const rec = list.find((x) => x.key === k)
    if (!rec) return false
    rec.label = String(label || '').slice(0, 40) || rec.label
    write(list)
    return true
  }

  /** 删除一条 */
  function remove(k) {
    const list = read()
    const next = list.filter((x) => x.key !== k)
    if (next.length === list.length) return false
    write(next)
    return true
  }

  function count() { return read().length }

  return { list, get, save, rename, remove, count, MAX: MAX_FAVORITES }
}

export default createDemoFavorites
