/**
 * settings-store.js — 设置与持久化（BYOK）
 *
 * ★ 安全约定（不可放宽）：
 *   · API Key 只存浏览器 localStorage，**只发往用户自己填写的 endpoint**，无任何中转。
 *   · 界面上**永不显示完整密钥**（只显示掩码；输入框为 password 且需"用户确实动过"才覆盖）。
 *   · 任何日志输出前必须经 redact()（见 core/llm-client.js）。
 *   · 默认不赠送额度；未配置 Key 时引导用户填写自己的。
 *
 * ★★ 2026-12-02（用户："加一个『仅在本次保存』开关"）：
 *   localStorage 是**明文落盘**的（Chromium 存在 profile 的 LevelDB 里，没有钥匙串加密），
 *   所以"共用电脑 / 机房"这类场景需要一条"别落到磁盘上"的路。`keySessionOnly` 打开后：
 *     · 密钥只写 **sessionStorage**（关掉标签页/浏览器即没了），localStorage 里那份**立即擦掉**；
 *     · 其它偏好（模型名、接入点、界面）照旧落 localStorage —— 否则用户一开这个开关，
 *       连主题和字号都会回到默认，反而像"设置没保存"。
 *   实现上**只有一个真源**：密钥在哪个存储里，由这个开关决定（不是"两边各存一份、
 *   谁新用谁"）。切换方向都是**搬家**：open→ 写 session 并删磁盘；close→ 写磁盘并删 session。
 *   ★ 名字刻意叫"仅在本次保存"而不是"仅本次会话" —— 后者与本工具的"会话（对话）"
 *     撞词，看起来像"开了它就不能切会话"。
 *
 * 来源：orbit/H5/js/agent/settings.js 的 get/set/mask/hasKey（第 15–55 行），
 * 2026-09-24 迁入并把存储键与默认值提为配置。
 */

/** 默认值。LLM 相关项是整个智能体共用的，模块行为项各模块可覆盖 */
export const DEFAULT_SETTINGS = {
  endpoint: 'https://api.deepseek.com',
  apiKey: '',
  /**
   * 密钥"仅在本次保存"：true 时 apiKey 只进 sessionStorage。
   * ★ 这个开关本身必须留在 localStorage（否则下次启动读不到它，
   *   就会把密钥又写回磁盘 —— 那正是本开关要防的事）。
   */
  keySessionOnly: false,
  model: 'deepseek-flash',
  effort: '',              // '' = 用服务端默认；可选 low / high / max
  showReasoning: true,     // 是否显示"思考中"
  proactive: true,         // 主动服务开关
  animSpeed: 1.0,          // 动画速度倍率
  // 演示播放方式：'manual' 每步停下等用户点「下一步」；'auto' 按节奏自动连播。
  // 默认手动——一步一确认，用户才有时间看清画面到底变了什么。
  playback: 'manual',
  // 单次回复的输出上限（思考 + 正文共用）。推理模型在写正文前会先花掉一大段思考，
  // 给太小会导致"正文一个字没写就截断"，界面上表现为空白回复。
  maxTokens: 8192,
}

/**
 * 创建设置存储。
 *
 * @param {Object}   [opts]
 * @param {string}   [opts.storageKey='chem-agent.settings']
 * @param {Object}   [opts.defaults]       覆盖/扩展默认值
 * @param {string[]} [opts.clearKeys]      「清除本机全部数据」时要一并清除的其它 localStorage 键
 * @param {Function} [opts.onClearAll]     「清除本机全部数据」时的额外清理（用于**动态键**：
 *                                         如对话存储的"索引 + 每会话一键"，静态列表表达不了）
 * @param {Object}   [opts.storage]        localStorage（可注入，便于测试）
 * @param {Object}   [opts.sessionStorage] sessionStorage（`keySessionOnly` 时密钥的去处；可注入）
 */
export function createSettingsStore(opts = {}) {
  // ★ 同 panel.js：存储键**必须由宿主注入**，没有缺省值。
  //   「中性缺省名」不算修好——只是把「悄悄共享」换成「悄悄各存各的」，两者都查不出来。
  if (!opts.storageKey) {
    throw new Error('createSettingsStore 需要 opts.storageKey：'
      + '存储命名空间必须由宿主注入（契约 HOST_REQUIREMENTS_SHAPE.storage）')
  }
  const KEY = opts.storageKey
  const DEFAULTS = Object.assign({}, DEFAULT_SETTINGS, opts.defaults || {})
  const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  const session = opts.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  /** sessionStorage 里那份密钥的键：**只存密钥本身**，不复制整份设置 */
  const SESSION_KEY = KEY + '.session-key'

  let cache = null

  function readSessionKey() {
    try { return (session && session.getItem(SESSION_KEY)) || '' } catch (e) { return '' }
  }
  function writeSessionKey(k) {
    try {
      if (!session) return
      if (k) session.setItem(SESSION_KEY, k)
      else session.removeItem(SESSION_KEY)
    } catch (e) { /* 隐私模式可能禁用 */ }
  }
  function writePersisted(obj) {
    try { storage.setItem(KEY, JSON.stringify(obj)) } catch (e) { /* 隐私模式可能禁用 */ }
  }
  /** 磁盘那份**永远不带 apiKey**（只在 keySessionOnly 时用） */
  function withoutKey(obj) {
    const o = Object.assign({}, obj)
    delete o.apiKey
    return o
  }

  function get() {
    if (cache) return cache
    let saved = {}
    try { saved = JSON.parse((storage && storage.getItem(KEY)) || '{}') || {} } catch (e) { saved = {} }
    cache = Object.assign({}, DEFAULTS, saved)
    if (cache.keySessionOnly) {
      const fromSession = readSessionKey()
      const fromDisk = (saved.apiKey || '').trim()
      if (!fromSession && fromDisk) {
        // 迁移（老版本用过、或用户刚手工改了存储）：搬进本次会话，再把磁盘那份擦掉
        writeSessionKey(fromDisk)
        cache.apiKey = fromDisk
      } else {
        // ★ 本次会话里没有 ⇒ 就是没有。**不回落**到磁盘上的旧值：那等于开关没生效。
        cache.apiKey = fromSession
      }
      if (fromDisk) writePersisted(withoutKey(cache))
    }
    return cache
  }

  function set(patch) {
    const next = Object.assign({}, get(), patch || {})
    cache = next
    if (next.keySessionOnly) {
      // 打开：密钥进 sessionStorage，磁盘那份就地擦掉
      writeSessionKey(next.apiKey)
      writePersisted(withoutKey(next))
    } else {
      // 关闭：密钥搬回 localStorage，sessionStorage 里的那份删掉
      writeSessionKey('')
      writePersisted(next)
    }
    return cache
  }

  /**
   * 掩码显示：`sk-a****mnop`。
   *
   * ★★ 2026-12-02（用户："mask() 收紧"）：原先露**前 7 位**（`sk-abcd1****mnop`）。
   *   真实密钥的前几位常常带账号/项目短标识，7 位足够被用来做指纹；
   *   而"认出这是哪把钥匙"只要 4 位（尾巴 4 位同样是行业惯例）。
   */
  function mask(key) {
    const k = (key || '').trim()
    if (!k) return '（未配置）'
    if (k.length <= 10) return k.slice(0, 3) + '****'
    return k.slice(0, 4) + '****' + k.slice(-4)
  }

  function hasKey() { return !!(get().apiKey || '').trim() }

  /**
   * 清除本机全部数据。
   * ★ 三样都要清，缺一都会留下残余：① 设置本身；② 调用方声明的**静态键**
   *   （学情、悬浮球位置…）；③ 调用方自己管的**动态键**——对话存储有"索引 + 每个
   *   会话一个键"，静态列表表达不了，故走 `onClearAll` 回调。
   *   漏掉 ②③ 的表现是"点了清除本机数据，隐私数据其实还在"，且**不报任何错**。
   * ★ 2026-12-02：密钥可能只存在 sessionStorage 里 —— 它也必须一并清掉，
   *   否则"清除本机数据"之后本次会话里密钥仍然可用（用户看到的是"没清干净"）。
   */
  function clearAll() {
    try {
      storage.removeItem(KEY)
      for (const k of opts.clearKeys || []) storage.removeItem(k)
    } catch (e) { /* 忽略 */ }
    writeSessionKey('')
    try { if (typeof opts.onClearAll === 'function') opts.onClearAll() } catch (e) { /* 忽略 */ }
    cache = null
  }

  return { get, set, mask, hasKey, clearAll, DEFAULTS, KEY }
}

export default createSettingsStore
