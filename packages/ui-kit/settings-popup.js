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
 *
 * ★ 大部分文案**留在源码里的中文原文**即可：它们最终都以文本节点出现在 DOM 上，
 *   由宿主的 `startAutoSweep` 按 `text` 表替换（见 `packages/ui-kit/i18n.js`）。
 *   只有**拼出来的**（密钥掩码那句、测试连接的结果、取色提示）必须走 `t()` ——
 *   整段是运行时才成形的，扫描替换对不上。
 */
import { t } from '../i18n/index.js'
import './i18n.js'   // 副作用：把本区的中英词典注册进 @i18n 运行时

/**
 * 给定底色，返回一个**看得清**的文字颜色。
 *
 * ★ 为什么需要它：周期表格子的底色就是该元素的配色，而这 103 个颜色横跨
 *   "纯白（H）/ 近黑（C）/ 各种饱和色"。写死白字的话，氢（#FFFFFF）那格就是白底白字 ——
 *   看不见，而且不报错。判据用 WCAG 的相对亮度近似（0.2126R+0.7152G+0.0722B），
 *   阈值 150：比上游 `pages/settings.js` 那种"只特判 #ffffff/#cccccc"的两值写法稳，
 *   黄色（#FFD700，亮度约 200）这类"浅底深字"也能正确翻过来。
 */
export function readableOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex == null ? '' : hex).trim())
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 150 ? '#111' : '#fff'
}

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
      ? t('uikit.configuredHint', { mask: store.mask(store.get().apiKey) })
      : '仅存本机，不上传服务器'),
  },
  {
    key: 'model', label: '模型名', type: 'text', placeholder: 'deepseek-flash',
    // ★ 不再列别家的模型名。原先写的是「如 deepseek-flash / gpt-4o-mini / qwen-plus」——
    //   那种清单**一定会过时**（用户就报了这一点：gpt-4 早已不是 OpenAI 的主流），
    //   而过时的示例比没有示例更糟：读者会照抄一个已经下线的名字，然后拿到一个
    //   看不懂的 404。这里只保留**本工具自己的默认值**，其余交给服务商文档。
    hint: '填服务商文档里的模型名（本工具默认 deepseek-flash）。各家命名不同、且会随版本变化',
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

export const DEFAULT_GROUPS = [
  // ★ 标题**不带括号说明**（用户明确要求）：括号里那句是给开发者写使用场景的，
  //   放在一级标题后面既占宽度又像注释；真要解释，该写成该组第一项的 hint。
  // ★ `id` 供 `open({ expand })` 定位（缺 Key 自动弹层要展开这一组），别用标题匹配。
  { id: 'model', title: '模型服务', keys: ['endpoint', 'apiKey', 'model', 'effort', 'maxTokens'], test: true },
  { title: '教学偏好', keys: ['showReasoning', 'proactive', 'animSpeed', 'playback'] },
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
  /**
   * 建出来的折叠分区清单（`buildOverlay` 里重建）。
   * ★ 声明在**这个闭包**而不是 `buildOverlay` 内部：`open({expand})` 要用它，
   *   而 `open` 在 `buildOverlay` 之外（把它们放一起的写法会让 `open` 抛
   *   `ReferenceError: sections is not defined` —— 实测就这么崩过一次）。
   */
  let sections = []

  function resolveHint(def) {
    return typeof def.hint === 'function' ? def.hint(store) : def.hint
  }

  function field(label, input, hint) {
    const f = el('div', { class: 'agent-field' }, undefined, doc)
    f.appendChild(el('label', { class: 'agent-flabel', text: label }, undefined, doc))
    f.appendChild(input)
    if (hint) {
      const h = el('div', { class: 'agent-fhint', text: hint }, undefined, doc)
      // ★ 把 hint 元素记在 input 上，供 refreshHints() 重算。
      //   `hint` 可能是**函数**（如 API Key 的"已配置：sk-****"），它依赖 store 状态；
      //   而弹层只在打开时渲染一次——于是"测试连接成功"之后，那句提示还停在
      //   "仅存本机，不上传服务器"，用户看到的就是"连上了却还显示未配置"（实测反馈）。
      input._hintEl = h
      f.appendChild(h)
    }
    return f
  }

  /**
   * 重算所有依赖 store 状态的提示文案。
   * 在「测试连接」成功、以及「保存」之后调用——那两处都会改变 `store`，
   * 而界面上的文案不会自己跟着变。
   */
  function refreshHints() {
    for (const def of schema) {
      const built = inputs[def.key]
      if (!built || !built.input || !built.input._hintEl) continue
      const t = resolveHint(def)
      if (t) built.input._hintEl.textContent = t
      // 掩码占位符同理：配置过之后要从 `sk-...` 换成 `sk-ab****cd` 的样子
      if (def.type === 'secret' && built.input.placeholder != null) {
        built.input.placeholder = store.hasKey()
          ? store.mask(store.get()[def.key])
          : (def.placeholder || '')
      }
    }
  }

  /**
   * 按声明建控件。返回 { node, read(), bare?, touchedOnly?, noStore?, input? }
   *
   * ★ 两种"不进本 store"的字段（本文件支持的两条外挂通道）：
   *   · `def.get()` / `def.set(v)` —— 值的**真源在别处**（如模块自己的 localStorage）。
   *     弹层此时只是它的一个**视图**，不是又一份副本。若让这类字段也走本 store，
   *     同一份数据就有两个真源，改一处另一处不变——本仓库把这类问题记为头号隐患。
   *   · `noStore` —— 控件自己负责持久化（如元素颜色调色板：一格一元素，
   *     落库发生在点击时，没有"一个字段一个值"可言）。
   */
  function buildInput(def, s) {
    const v = def.get ? def.get() : s[def.key]
    const built = buildInputBody(def, s, v)
    /**
     * ★ 记下**渲染那一刻的原值**，供 `collect()` 判断"用户到底改没改"。
     *
     *   外挂字段（`def.set`，如配色/主题背景）写进模块存储后与"我们替用户写的"
     *   长得一模一样 —— 宿主靠 `touchedExternal()` 区分两者。原先那里是**无条件**
     *   加进去的：用户一个控件都没碰、只点了一次「保存」，8 个视觉颜色就全被写进
     *   模块存储、`bgColorOverridden` 被置 true，此后深色主题下画布**永远白着**
     *   （实测端到端复现）。有了 `initial` 才谈得上"改过才算"。
     */
    if (built && !('initial' in built)) built.initial = v
    return built
  }

  function buildInputBody(def, s, v) {
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
        /**
         * ★ 值不在 options 里（模块字段漏写默认值、或存储里是旧值）时，浏览器把
         *   `selectedIndex` 置为 -1，下拉显示**空白** —— 看起来像"这个控件坏了"。
         *   回落到第一项，至少给出一个合法值（实测「晶体模块参数」的「晶胞显示」原本就是空白）。
         * ★ 判据写成"显式比对 options"而不是读 `selectedIndex`：桩 DOM 没有 selectedIndex，
         *   用它判断会让这条兜底在测试里**永远走不到**（假绿）。
         */
        const opts = def.options || []
        if (!opts.some(([val2]) => String(val2) === sel.value)) {
          sel.value = opts.length ? String(opts[0][0]) : ''
        }
        /**
         * ★ 可选的 `def.onChange(v)`：**改完立即生效**，不等按「保存」。
         *   只有"所见即所得"的偏好才该用它（界面语言就是这样：改成英文要马上看到，
         *   否则用户会以为没生效而反复点）。默认不挂 —— 多数设置项应当在按保存时统一落库，
         *   边改边写会让"取消"（关掉弹层）失去意义。
         */
        if (typeof def.onChange === 'function') {
          sel.addEventListener('change', () => { try { def.onChange(sel.value, sel) } catch (e) { /* 单项失败不影响整层 */ } })
        }
        return { node: sel, read: () => sel.value }
      }
      case 'range': {
        /**
         * ★ 缺值兜底：`v == null` 时取 `def.min`（拿不到 min 就 0）。
         *   原实现把 `v` 直接拼进 `value=` 与读数文本，于是**没有一个字段漏写默认值**，
         *   界面上就会出现字面量 `value="undefined"` 与读数 `×undefined`
         *   （实测：「晶体模块参数」的三个滑块全是这样，中文界面下看着像乱码）。
         *   `undefined` 从来不是合法的滑块值：浏览器会把它丢弃、滑块滑到中点，
         *   用户不动任何东西按「保存」就把中点写进了存储 —— 一个静默的数据损坏。
         */
        const rv = v == null ? (def.min == null ? 0 : def.min) : v
        const input = el('input', {
          class: 'agent-input', type: 'range',
          min: String(def.min), max: String(def.max), step: String(def.step || 1), value: String(rv),
        }, undefined, doc)
        const out = el('span', { class: 'agent-fhint', text: (def.unit || '') + rv }, undefined, doc)
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
      case 'color': {
        // 取色器 + 十六进制文本。两者**双向同步**：文本比色块更便于"抄一个准确的色号"，
        // 而色块比文本更便于试色——教学中这两件事都会发生。
        const input = el('input', { class: 'agent-input agent-color', type: 'color', value: v || '#cccccc' }, undefined, doc)
        const hex = el('input', { class: 'agent-input agent-hex', type: 'text', value: v || '#cccccc' }, undefined, doc)
        input.addEventListener('input', () => { hex.value = input.value })
        hex.addEventListener('input', () => {
          const t = hex.value.trim()
          // 只在**合法**的 6 位十六进制时才回写取色器：否则用户打到一半就会被改掉
          if (/^#[0-9a-fA-F]{6}$/.test(t)) input.value = t
        })
        return {
          node: el('div', { class: 'agent-colorrow' }, [input, hex], doc),
          read: () => input.value,
        }
      }
      case 'palette': {
        /**
         * 调色板：**一格一元素**，点选后用下方取色器改色。
         *
         * ★ 为什么不是"每个元素一个取色器"：元素有 103 个，铺 103 个
         *   `<input type=color>` 会让这个弹层明显变卡，而绝大多数会话只会改其中一两个。
         *   一格一按钮 + 一个共享取色器，既保住"一眼看全配色"的用法，
         *   也不让开销随元素表规模线性增长。
         * ★ `noStore`：落库在点击时由 `def.set` 负责，没有"一个字段一个值"可言。
         *
         * ★ 2026-10-05 新增 `def.layout === 'periodic'` 分支（用户报"逐元素配色太不直观"）：
         *   原来是一块 16 列的密集色块阵列 —— 103 个纯色方块，**看不出哪格是哪个元素**，
         *   只能靠悬浮提示逐个试。改成**元素周期表**：位置本身就说明了身份
         *   （周期 = 行、族 = 列，镧系/锕系下挂两行），格子里再写上元素符号，
         *   并且**字色按底色亮度自动取深/浅**（H 是近白色底的，白字看不见）。
         *   位置数据来自 `def`（模块给的 `period`/`group`），弹层不自己排周期表 ——
         *   那是学科数据，属于模块。
         */
        const items = (typeof def.items === 'function' ? def.items() : (def.items || [])).slice()
        const periodic = def.layout === 'periodic'
        const grid = el('div', { class: 'agent-palette' + (periodic ? ' is-periodic' : '') }, undefined, doc)
        if (periodic) {
          // 行列数由数据给：格子用 `1fr` 均分，整张表随弹层宽度缩放
          grid.style.gridTemplateColumns = 'repeat(' + (def.layoutCols || 18) + ', minmax(0, 1fr))'
          grid.style.setProperty('--pt-rows', String(def.layoutRows || 10))
          grid.style.setProperty('--pt-gap-row', String(def.layoutGapRow || 0))
          for (const rl of (def.rowLabels || [])) {
            const lab = el('span', { class: 'agent-pt-rowlabel', text: rl.key }, undefined, doc)
            lab.style.gridRow = String(rl.row)
            lab.style.gridColumn = '1 / 3'
            grid.appendChild(lab)
          }
        }
        const picker = el('input', { class: 'agent-input agent-color', type: 'color' }, undefined, doc)
        const caption = el('span', { class: 'agent-fhint', text: '点一个格子选中元素，再取色' }, undefined, doc)
        let target = null
        const swatchOf = (key) => grid.querySelector('[data-el="' + String(key).replace(/"/g, '\\"') + '"]')
        for (const it of items) {
          const b = el('button', { class: 'agent-swatch', type: 'button', title: it.label, 'data-el': it.key }, undefined, doc)
          b.style.background = it.color
          if (periodic) {
            if (it.period && it.group) {
              b.style.gridRow = String(it.period)
              b.style.gridColumn = String(it.group)
            }
            b.style.color = readableOn(it.color)
            b.appendChild(el('span', { class: 'agent-swatch-txt', text: it.key }, undefined, doc))
            // ★ 中文元素名只有 1 个字（氢/氦/锂…），塞得进格子；英文名（Hydrogen）塞不下，
            //   硬塞会溢出到相邻格子。所以只在短名时补第二行，长名交给 title 提示。
            if (it.name && it.name.length <= 2) {
              b.appendChild(el('span', { class: 'agent-swatch-name', text: it.name }, undefined, doc))
            }
          }
          b.onclick = () => {
            target = it
            picker.value = it.color
            for (const n of grid.querySelectorAll('.agent-swatch')) n.classList.remove('active')
            b.classList.add('active')
            if (resetOneBtn) resetOneBtn.disabled = false   // 选中了才有"恢复这一个"可言
            caption.textContent = t('uikit.picked', { label: it.label })
          }
          grid.appendChild(b)
        }
        picker.addEventListener('input', () => {
          if (!target) { caption.textContent = '先点一个格子选中元素'; return }
          target.color = picker.value
          const n = swatchOf(target.key)
          if (n) {
            n.style.background = picker.value
            if (periodic) n.style.color = readableOn(picker.value)   // 换底色就要重算字色
          }
          if (typeof def.set === 'function') def.set(target.key, picker.value)
          caption.textContent = target.label + ' → ' + picker.value
        })
        /**
         * ★ 单元素恢复默认（用户要求「元素配色可单独恢复某一个元素的配色」）。
         *   原来只有整组「恢复默认配色」—— 103 个里改坏了**一个**也只能全清，
         *   把其余 102 个自定义一起丢掉。所以给**当前选中**的那个元素一个单独入口。
         *   ★ 只在模块提供了 `def.resetOne` 时才出现：没有就别给一个点了没反应的按钮
         *   （那正是本仓库反复记为缺陷的形态）。
         */
        let resetOneBtn = null
        if (typeof def.resetOne === 'function') {
          resetOneBtn = el('button', { class: 'agent-btn', type: 'button', text: '恢复本元素默认' }, undefined, doc)
          resetOneBtn.disabled = true
          resetOneBtn.onclick = () => {
            if (!target) return
            def.resetOne(target.key)
            const fresh = (typeof def.items === 'function' ? def.items() : []).find((x) => x.key === target.key)
            const n = swatchOf(target.key)
            if (fresh && n) {
              n.style.background = fresh.color
              if (periodic) n.style.color = readableOn(fresh.color)
            }
            caption.textContent = target.label + ' → ' + ((fresh && fresh.color) || '')
          }
        }
        const resetBtn = el('button', { class: 'agent-btn', type: 'button', text: '恢复默认配色' }, undefined, doc)
        resetBtn.onclick = () => {
          if (typeof def.reset === 'function') def.reset()
          const fresh = typeof def.items === 'function' ? def.items() : []
          for (const it of fresh) {
            const n = swatchOf(it.key)
            if (n) {
              n.style.background = it.color
              if (periodic) n.style.color = readableOn(it.color)
            }
          }
          target = null
          if (resetOneBtn) resetOneBtn.disabled = true
          caption.textContent = '已恢复默认配色'
        }
        return {
          node: el('div', {}, [
            grid,
            el('div', { class: 'agent-colorrow' }, [picker, caption], doc),
            el('div', { class: 'agent-row' }, resetOneBtn ? [resetOneBtn, resetBtn] : [resetBtn], doc),
          ], doc),
          read: () => null,
          noStore: true,
        }
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
    sections = []   // 重建时清空（弹层只建一次，但这条让"重建"这件事仍然成立）
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

    /**
     * ★ 必须用 **id** 而不是标题文本匹配：标题会被 i18n 的 DOM 扫描替换成英文
     *   （`main.js` 的 `startAutoSweep`），英文界面下用中文标题匹配会**静默失效** ——
     *   不报错，只是又回到"展开第一组"，正好是这次要修的那个现象。
     *   （清单本身是闭包级的 `sections`，见它声明处。）
     */

    /**
     * 造一个**可折叠**分区。
     *
     * ★ 为什么改成折叠：设置项分三类来源（模型服务 / 教学偏好 / 各模块自己的小参数），
     *   而模块越接越多、最后一项「逐元素配色」有 103 个格子 —— 全部平铺在一个滚动区里，
     *   用户要在一条长列表里找"动画速度"。折叠之后**每一类一眼可见**，展开才铺开细节。
     * ★ 用 `<section>` + 按钮头，而不是原生 `<details>`：头部样式要跟这套深色令牌走，
     *   而 `<details>/<summary>` 的默认三角在各浏览器里长得不一样（且不可控）。
     *   `aria-expanded` 照给，读屏用户仍能知道展开状态。
     */
    function makeSection(title, isOpen, id) {
      const sec = el('section', {
        class: 'agent-sec' + (isOpen ? ' open' : ''), 'data-gid': id || '',
      }, undefined, doc)
      const head = el('button', {
        class: 'agent-sec-head', type: 'button', 'aria-expanded': isOpen ? 'true' : 'false',
      }, [
        el('span', { class: 'agent-sec-title', text: title }, undefined, doc),
        el('span', { class: 'agent-sec-chev', text: '▸', 'aria-hidden': 'true' }, undefined, doc),
      ], doc)
      head.onclick = () => {
        const on = !sec.classList.contains('open')
        sec.classList.toggle('open', on)
        head.setAttribute('aria-expanded', on ? 'true' : 'false')
      }
      const content = el('div', { class: 'agent-sec-body' }, undefined, doc)
      sec.appendChild(head)
      sec.appendChild(content)
      body.appendChild(sec)
      sections.push({ id: id || '', sec })
      return content
    }

    groups.forEach((g, gi) => {
      // 缺省：第一组展开、其余收起；`g.open` 可显式指定
      // ★ 默认**不展开任何分组**（用户报「打开设置后，无需默认展开『界面』」）。
      //   想默认展开的分组自己声明 `open: true`；"因缺 Key 自动弹"那条路走 `open({expand})`。
      const gEl = makeSection(g.title, g.open === true, g.id)
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
            // ★ 文案要**说清"已保存"**：`collect()` 在测试之前就把表单落库了（见它的实现），
            //   但用户看不到这一点——只说"连接成功"会让人不确定密钥到底存没存，
            //   于是回到面板再发消息、看到"尚未配置 API Key"时就以为是 bug（实测反馈）。
            testMsg.textContent = t('uikit.testOk', { model: (r && r.model) || patch.model })
            testMsg.className = 'agent-test-msg ok'
            refreshHints()
            if (typeof cfg.onSaved === 'function') cfg.onSaved(store.get())
          } catch (e) {
            testMsg.textContent = t('uikit.testFail', { msg: (e && e.message) || t('uikit.testFailFallback') })
            testMsg.className = 'agent-test-msg bad'
          }
        }
        testRow.appendChild(testBtn)
        testRow.appendChild(testMsg)
        gEl.appendChild(testRow)
      }
    })

    // --- 数据与隐私（也是一个折叠分区；这类内容平时不该占版面）---
    const g3 = makeSection('数据与隐私', false, 'privacy')
    g3.appendChild(el('div', { class: 'agent-note', text: cfg.privacyNote || (
      '· 学情与设置只存本机浏览器（localStorage），不上传。\n' +
      '· 对话内容不落库；只保留结构化动作序列用于复现与审计。\n' +
      '· API Key 只发往你填写的接入点，不经过任何第三方中转。'
    ) }, undefined, doc))
    const clearBtn = el('button', { class: 'agent-btn danger', text: '清除本机全部数据' }, undefined, doc)
    clearBtn.onclick = () => {
      // ★ 原生对话框（confirm/alert）**不是 DOM 节点** —— 扫描替换碰不到它们。
      //   这两句必须走 t()，否则英文界面下弹出来的还是中文（且不报错）。
      if (win && win.confirm && !win.confirm(t('uikit.confirmClear'))) return
      store.clearAll()
      if (win && win.alert) win.alert(t('uikit.cleared'))
      if (win && win.location && win.location.reload) win.location.reload()
    }
    g3.appendChild(clearBtn)

    // --- 关于 ---
    if (cfg.about) {
      const g4 = makeSection('关于', false, 'about')
      g4.appendChild(el('div', { class: 'agent-note', html: cfg.about }, undefined, doc))
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
  /** 上一次 collect() 里被用户写过的外挂字段 key 集合（见 collect 的说明） */
  const externalTouched = new Set()

  function collect() {
    const patch = {}
    // ★ 记录本次保存里被**用户改过**的外挂字段（`def.set` 那条通道）。
    //   宿主要用它区分"用户显式选过"与"我们按主题替他写的"——
    //   两者在模块存储里长得一样，但语义完全不同：
    //   前者此后必须尊重，后者每次切主题都该重算。
    externalTouched.clear()
    for (const def of schema) {
      const built = inputs[def.key]
      if (!built) continue
      // ★ 自己负责持久化的控件（如元素颜色调色板）：不参与本 store 的读写
      if (built.noStore) continue
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
      /**
       * ★ 值的**真源在模块那边**（`def.set`）时，写进去、且**不**塞进本 store。
       *   塞了就等于同一份数据两个真源——"改了一处、另一处没变"是最难查的那类
       *   缺陷（本仓库已记过多次）。这里的 `patch` 只承载本 store 自己管的字段。
       *
       * ★★ 但**只有用户真的改过**才写回、才算 touched。
       *   原先这两步是无条件的 —— 后果（实测）：打开设置、一个控件都不碰、点一次
       *   「保存」，8 个视觉颜色就被写进模块存储，`bgColorOverridden` 置 true；
       *   此后切到深色主题，三维画布**永远是白的**（`applyThemeCanvasBg` 见到
       *   "用户表达过"就再不介入），而且从存储里**分不出**这是"用户真的选了白"还是
       *   "我们误写的"（main.js 的注释专门警告过这一点）。同一笔还会把滑块中点
       *   写进存储 —— 另一处已在 buildInput 的 range 分支修过，根因就是这里。
       */
      if (typeof def.set === 'function') {
        const dirty = !('initial' in built) || String(v) !== String(built.initial)
        if (dirty) { def.set(v); externalTouched.add(def.key) }
        continue
      }
      patch[def.key] = v
    }
    return store.set(patch)
  }

  /** 展开/收起一个分区，并把 `aria-expanded` 同步过去（两处状态必须一致） */
  function setSectionOpen(sec, on) {
    sec.classList.toggle('open', on)
    const head = sec.querySelector && sec.querySelector('.agent-sec-head')
    if (head && head.setAttribute) head.setAttribute('aria-expanded', on ? 'true' : 'false')
  }

  /**
   * 打开设置弹层。
   *
   * @param {Object} [opts]
   * @param {string} [opts.expand] 要**展开**的分区 id（见 `groups[].id`）。
   *        不传 = 默认行为：第一组展开、其余收起。
   *
   * ★ 为什么需要 `expand`：程序**因缺 API Key 自动弹设置**时，用户要填的是「模型服务」，
   *   而当时默认展开的是第一组「界面」——用户还得自己找。宿主在自动那条路径上
   *   传 `{ expand: 'model' }` 即可；手动打开仍走无参默认。
   * ★ 定位用 **id 而非标题文本**：标题会被 i18n 的 DOM 扫描替换成英文，
   *   英文界面下按中文标题匹配会静默失效（又回到"展开界面组"）。
   * ★ **每次 open 都重置一次展开态**：弹层只建一次并缓存（`buildOverlay` 的
   *   `if (overlay) return overlay`），不重置的话上一次手动展开的分区会留着，
   *   "自动弹出要展开模型服务"就会被用户的旧操作顶掉。
   */
  function open(opts) {
    buildOverlay()
    const want = opts && opts.expand
    // ★ 不传 `want` 时**全部收起**（见 buildOverlay 里的说明）；传了才展开指定的那一组。
    sections.forEach(({ id, sec }) => setSectionOpen(sec, want != null && id === want))
    overlay.classList.add('show')
    // 命中的分区可能在滚动区下方（弹层体是 overflow-y:auto），滚进视野才算"贴心"
    if (want) {
      const hit = sections.find((x) => x.id === want)
      if (hit && hit.sec.scrollIntoView) {
        try { hit.sec.scrollIntoView({ block: 'nearest' }) } catch (e) { /* 老浏览器不接受参数对象 */ }
      }
    }
  }
  function close() { if (overlay) overlay.classList.remove('show') }

  return {
    open, close, collect, isOpen: () => !!(overlay && overlay.classList.contains('show')),
    /** 上一次保存里用户显式改过的外挂字段（`def.set` 通道），供宿主区分"用户选的"与"我们写的" */
    touchedExternal: () => [...externalTouched],
  }
}

export default createSettingsPopup
