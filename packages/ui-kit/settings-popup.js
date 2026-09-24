/**
 * settings-popup.js — 设置弹层（**声明式字段**，非写死表单）
 *
 * ★ 为什么做成声明式：设置项有两类来源——智能体自身的（接入点/Key/模型/输出上限）
 *   与各模块自己的小参数（动画速度、标签字号、原子缩放、元素颜色…）。后者会随
 *   模块增加而增长，写死表单每加一项都要改 UI 代码。
 *   声明式 schema 让两件事共用同一套机制，也正好对上重构计划 B6b 的要求：
 *   「模型要知道小设置小参数的调用方法，但不能让参数表撑爆上下文」——
 *   同一份 schema 既渲染设置面板，也可导出为 listModuleSettings 的返回内容。
 *
 * ★ 保留的安全细节：API Key 输入框为 password，**永不回填完整密钥**（用掩码做
 *   placeholder），且只有用户确实输入过（dataset.touched）才覆盖原值——
 *   否则"打开设置再保存"会把已有密钥清掉。
 *
 * 来源：orbit/H5/js/agent/settings.js 的 buildOverlay/field/checkbox（第 60–236 行），
 * 2026-09-24 迁入并改为 schema 驱动。分组标题、提示文案与「测试连接」功能原样保留。
 */

import { el } from '../agent-core/ui/dom.js'

/**
 * 智能体自身的标准设置项。hint 可以是字符串，也可以是 (store) => string
 * （密钥那项需要按"是否已配置"给不同提示）。
 */
export const DEFAULT_SCHEMA = [
  {
    key: 'endpoint', label: '接入点 endpoint', type: 'text',
    placeholder: 'https://api.deepseek.com',
    hint: '任何 OpenAI 兼容服务均可。只填域名或 /v1 会自动补全为 /chat/completions。',
  },
  {
    key: 'apiKey', label: 'API Key（BYOK）', type: 'secret',
    placeholder: 'sk-...',
    hint: (store) => (store.hasKey()
      ? '已配置：' + store.mask(store.get().apiKey) + '　留空则保持不变'
      : '仅存本机，不上传服务器'),
  },
  {
    key: 'model', label: '模型名', type: 'text', placeholder: 'deepseek-flash',
    hint: '如 deepseek-flash / gpt-4o-mini / qwen-plus',
  },
  {
    key: 'effort', label: '推理强度 effort', type: 'select',
    options: [['', '服务端默认'], ['low', 'low（快）'], ['high', 'high'], ['max', 'max（强）']],
    hint: '可选；部分服务不支持则忽略',
  },
  {
    key: 'maxTokens', label: '输出上限 max_tokens', type: 'number', min: 1024, max: 65536, step: 1024,
    hint: '思考 + 正文共用。推理模型提问较长时若出现"没有正文"，把它调大',
  },
  { key: 'showReasoning', label: '显示"思考中"过程', type: 'checkbox' },
  { key: 'proactive', label: '启用主动服务（在检测到困惑时主动介入）', type: 'checkbox' },
  { key: 'animSpeed', label: '动画速度', type: 'range', min: 0.5, max: 2, step: 0.25, unit: '×' },
  {
    key: 'playback', label: '演示播放方式', type: 'select',
    options: [['manual', '手动：每步停下，点「下一步」继续'], ['auto', '自动：按节奏连续播放']],
    hint: '手动适合跟着讲解走；自动适合一次性放完。演示条上可临时切换。',
  },
]

const DEFAULT_GROUPS = [
  { title: '模型服务（改一次就不动）', keys: ['endpoint', 'apiKey', 'model', 'effort', 'maxTokens'], test: true },
  { title: '教学偏好（可能每次教学都调）', keys: ['showReasoning', 'proactive', 'animSpeed', 'playback'] },
]

/**
 * 创建设置弹层。
 *
 * @param {Object}   cfg
 * @param {Object}   cfg.store           createSettingsStore 的返回值
 * @param {Array}    [cfg.schema]        字段声明（默认 DEFAULT_SCHEMA；模块设置项可追加）
 * @param {Array}    [cfg.groups]        分组（默认 DEFAULT_GROUPS）；`test:true` 的分组会加「测试连接」
 * @param {Function} [cfg.testConnection] async (settings) => { model }，用于「测试连接」
 * @param {string}   [cfg.privacyNote]
 * @param {string}   [cfg.about]         关于信息（HTML）
 * @param {Object}   [cfg.doc]
 * @param {Object}   [cfg.win]
 * @param {Function} [cfg.onSaved]       (settings) => void
 */
export function createSettingsPopup(cfg = {}) {
  const doc = cfg.doc || (typeof document !== 'undefined' ? document : null)
  const win = cfg.win || (typeof window !== 'undefined' ? window : null)
  if (!doc) throw new Error('createSettingsPopup 需要 document（或用 cfg.doc 注入）')

  const store = cfg.store
  if (!store) throw new Error('createSettingsPopup 需要 cfg.store')

  const schema = cfg.schema || DEFAULT_SCHEMA
  const groups = cfg.groups || DEFAULT_GROUPS
  const byKey = Object.fromEntries(schema.map((f) => [f.key, f]))

  let overlay = null
  const inputs = {}   // key → { node, read, ... }

  function resolveHint(def) {
    return typeof def.hint === 'function' ? def.hint(store) : def.hint
  }

  function field(label, input, hint) {
    const f = el('div', { class: 'agent-field' }, undefined, doc)
    f.appendChild(el('label', { class: 'agent-flabel', text: label }, undefined, doc))
    f.appendChild(input)
    if (hint) f.appendChild(el('div', { class: 'agent-fhint', text: hint }, undefined, doc))
    return f
  }

  /** 按声明建控件。返回 { node, read(), bare?, touchedOnly?, input? } */
  function buildInput(def, s) {
    const v = s[def.key]
    switch (def.type) {
      case 'checkbox': {
        const input = el('input', { type: 'checkbox' }, undefined, doc)
        input.checked = !!v
        const row = el('label', { class: 'agent-check' }, [
          input, el('span', { text: ' ' + def.label }, undefined, doc),
        ], doc)
        // 复选框自带标签，故 bare=true 让调用方跳过外层 label
        return { node: row, read: () => input.checked, bare: true }
      }
      case 'select': {
        const sel = el('select', { class: 'agent-input' }, undefined, doc)
        for (const [val, text] of def.options || []) {
          const o = el('option', { value: val, text }, undefined, doc)
          if (String(v) === val) o.selected = 'selected'
          sel.appendChild(o)
        }
        sel.value = v == null ? '' : String(v)
        return { node: sel, read: () => sel.value }
      }
      case 'range': {
        const input = el('input', {
          class: 'agent-input', type: 'range',
          min: String(def.min), max: String(def.max), step: String(def.step || 1), value: String(v),
        }, undefined, doc)
        const out = el('span', { class: 'agent-fhint', text: (def.unit || '') + v }, undefined, doc)
        input.addEventListener('input', () => { out.textContent = (def.unit || '') + input.value })
        return { node: el('div', {}, [input, out], doc), read: () => +input.value }
      }
      case 'number': {
        const input = el('input', {
          class: 'agent-input', type: 'number',
          min: String(def.min), max: String(def.max), step: String(def.step || 1),
          value: String(v), placeholder: def.placeholder || '',
        }, undefined, doc)
        return { node: input, read: () => +input.value }
      }
      case 'secret': {
        // ★ 永不回填完整密钥：掩码只做 placeholder；且只有用户确实输入过才覆盖
        const input = el('input', {
          class: 'agent-input', type: 'password', autocomplete: 'off',
          placeholder: store.hasKey() ? store.mask(v) : (def.placeholder || ''),
        }, undefined, doc)
        input.addEventListener('input', () => { input.dataset.touched = '1' })
        return { node: input, read: () => null, touchedOnly: true, input }
      }
      default: {
        const input = el('input', {
          class: 'agent-input', type: 'text',
          value: v == null ? '' : String(v), placeholder: def.placeholder || '',
        }, undefined, doc)
        return { node: input, read: () => input.value.trim() }
      }
    }
  }

  function buildOverlay() {
    if (overlay) return overlay
    const s = store.get()

    const box = el('div', { class: 'agent-settings-box' }, undefined, doc)

    // --- 头部 ---
    const closeBtn = el('button', { class: 'agent-x', text: '✕' }, undefined, doc)
    closeBtn.onclick = close
    box.appendChild(el('div', { class: 'agent-settings-head' }, [
      el('span', { class: 'agent-settings-title', text: cfg.title || '设置' }, undefined, doc),
      closeBtn,
    ], doc))

    const body = el('div', { class: 'agent-settings-body' }, undefined, doc)

    for (const g of groups) {
      body.appendChild(el('div', { class: 'agent-sgroup-title', text: g.title }, undefined, doc))
      const gEl = el('div', { class: 'agent-sgroup' }, undefined, doc)
      for (const key of g.keys) {
        const def = byKey[key]
        if (!def) continue
        const built = buildInput(def, s)
        inputs[key] = built
        if (built.bare) gEl.appendChild(built.node)
        else gEl.appendChild(field(def.label, built.node, resolveHint(def)))
      }

      // 「测试连接」：先落库再测，测的就是用户刚填的这一组值
      if (g.test && typeof cfg.testConnection === 'function') {
        const testRow = el('div', { class: 'agent-row' }, undefined, doc)
        const testBtn = el('button', { class: 'agent-btn', text: '测试连接' }, undefined, doc)
        const testMsg = el('span', { class: 'agent-test-msg', text: '' }, undefined, doc)
        testBtn.onclick = async () => {
          testMsg.textContent = '测试中…'
          testMsg.className = 'agent-test-msg'
          const patch = collect()
          try {
            const r = await cfg.testConnection(patch)
            testMsg.textContent = '✓ 连接成功（模型：' + ((r && r.model) || patch.model) + '）'
            testMsg.className = 'agent-test-msg ok'
          } catch (e) {
            testMsg.textContent = '✗ ' + ((e && e.message) || '失败')
            testMsg.className = 'agent-test-msg bad'
          }
        }
        testRow.appendChild(testBtn)
        testRow.appendChild(testMsg)
        gEl.appendChild(testRow)
      }
      body.appendChild(gEl)
    }

    // --- 数据与隐私 ---
    body.appendChild(el('div', { class: 'agent-sgroup-title', text: '数据与隐私' }, undefined, doc))
    const g3 = el('div', { class: 'agent-sgroup' }, undefined, doc)
    g3.appendChild(el('div', { class: 'agent-note', text: cfg.privacyNote || (
      '· 学情与设置只存本机浏览器（localStorage），不上传。\n' +
      '· 对话内容不落库；只保留结构化动作序列用于复现与审计。\n' +
      '· API Key 只发往你填写的接入点，不经过任何第三方中转。'
    ) }, undefined, doc))
    const clearBtn = el('button', { class: 'agent-btn danger', text: '清除本机全部数据' }, undefined, doc)
    clearBtn.onclick = () => {
      if (win && win.confirm && !win.confirm('将清除本机的设置、学情与埋点数据，且不可恢复。确定？')) return
      store.clearAll()
      if (win && win.alert) win.alert('已清除。页面将刷新。')
      if (win && win.location && win.location.reload) win.location.reload()
    }
    g3.appendChild(clearBtn)
    body.appendChild(g3)

    // --- 关于 ---
    if (cfg.about) {
      body.appendChild(el('div', { class: 'agent-sgroup-title', text: '关于' }, undefined, doc))
      const g4 = el('div', { class: 'agent-sgroup' }, undefined, doc)
      g4.appendChild(el('div', { class: 'agent-note', html: cfg.about }, undefined, doc))
      body.appendChild(g4)
    }

    // --- 底部 ---
    const save = el('button', { class: 'agent-btn primary', text: '保存' }, undefined, doc)
    save.onclick = () => { collect(); close(); if (cfg.onSaved) cfg.onSaved(store.get()) }
    box.appendChild(body)
    box.appendChild(el('div', { class: 'agent-settings-foot' }, [save], doc))

    overlay = el('div', { class: 'agent-overlay' }, [box], doc)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
    doc.body.appendChild(overlay)
    return overlay
  }

  /** 收集表单值并落库。逐项按声明读取；未触及的密钥保留原值。 */
  function collect() {
    const patch = {}
    for (const def of schema) {
      const built = inputs[def.key]
      if (!built) continue
      if (built.touchedOnly) {
        const typed = built.input.value.trim()
        if (built.input.dataset.touched === '1' && typed) patch[def.key] = typed
        continue
      }
      let v = built.read()
      if (def.type === 'number') {
        const lo = def.min == null ? -Infinity : def.min
        const hi = def.max == null ? Infinity : def.max
        v = Math.max(lo, Math.min(hi, Math.round(v) || store.DEFAULTS[def.key]))
      }
      if (def.type === 'text' && !v) v = store.DEFAULTS[def.key]   // 空则回退默认
      patch[def.key] = v
    }
    return store.set(patch)
  }

  function open() { buildOverlay(); overlay.classList.add('show') }
  function close() { if (overlay) overlay.classList.remove('show') }

  return { open, close, collect, isOpen: () => !!(overlay && overlay.classList.contains('show')) }
}

export default createSettingsPopup
