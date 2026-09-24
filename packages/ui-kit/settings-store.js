/**
 * settings-store.js — 设置与持久化（BYOK）
 *
 * ★ 安全约定（不可放宽）：
 *   · API Key 只存浏览器 localStorage，**只发往用户自己填写的 endpoint**，无任何中转。
 *   · 界面上**永不显示完整密钥**（只显示掩码；输入框为 password 且需"用户确实动过"才覆盖）。
 *   · 任何日志输出前必须经 redact()（见 core/llm-client.js）。
 *   · 默认不赠送额度；未配置 Key 时引导用户填写自己的。
 *
 * 来源：orbit/H5/js/agent/settings.js 的 get/set/mask/hasKey（第 15–55 行），
 * 2026-09-24 迁入并把存储键与默认值提为配置。
 */

/** 默认值。LLM 相关项是整个智能体共用的，模块行为项各模块可覆盖 */
export const DEFAULT_SETTINGS = {
  endpoint: 'https://api.deepseek.com',
  apiKey: '',
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
 * @param {Object}   [opts.storage]        localStorage（可注入，便于测试）
 */
export function createSettingsStore(opts = {}) {
  const KEY = opts.storageKey || 'chem-agent.settings'
  const DEFAULTS = Object.assign({}, DEFAULT_SETTINGS, opts.defaults || {})
  const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null)

  let cache = null

  function get() {
    if (cache) return cache
    let saved = {}
    try { saved = JSON.parse((storage && storage.getItem(KEY)) || '{}') || {} } catch (e) { saved = {} }
    cache = Object.assign({}, DEFAULTS, saved)
    return cache
  }

  function set(patch) {
    cache = Object.assign(get(), patch || {})
    try { storage.setItem(KEY, JSON.stringify(cache)) } catch (e) { /* 隐私模式可能禁用 */ }
    return cache
  }

  /** 掩码显示：sk-abcd****wxyz（保留首尾便于辨识，中间全掩） */
  function mask(key) {
    const k = (key || '').trim()
    if (!k) return '（未配置）'
    if (k.length <= 10) return k.slice(0, 3) + '****'
    return k.slice(0, 7) + '****' + k.slice(-4)
  }

  function hasKey() { return !!(get().apiKey || '').trim() }

  /** 清除本机全部数据（设置 + 调用方声明的其它键） */
  function clearAll() {
    try {
      storage.removeItem(KEY)
      for (const k of opts.clearKeys || []) storage.removeItem(k)
    } catch (e) { /* 忽略 */ }
    cache = null
  }

  return { get, set, mask, hasKey, clearAll, DEFAULTS, KEY }
}

export default createSettingsStore
