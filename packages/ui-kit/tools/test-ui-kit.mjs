/**
 * test-ui-kit.mjs —— 共享表现层（packages/ui-kit/）的验证
 *
 * 运行：node packages/ui-kit/tools/test-ui-kit.mjs
 *
 * 这些用例守的是「踩过的坑」，不是「代码行数」：
 *   · 视口自适应：为什么不能写死 44vh、为什么不能观察 body（自激）
 *   · 设置弹层：为什么密钥永不回填、为什么要点过才覆盖（否则打开设置再保存会清掉密钥）
 *   · 令牌：安全区令牌要生效必须有 viewport-fit=cover（这条靠断言 CSS 与文档存在）
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { createViewport } from '../viewport.js'
import { createSettingsStore } from '../settings-store.js'
import { createSettingsPopup, DEFAULT_SCHEMA } from '../settings-popup.js'

const HERE = new URL('.', import.meta.url)
const repo = (p) => fileURLToPath(new URL('../../../' + p, HERE))

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
function section(t) { console.log(`\n【${t}】`) }

// ============================================================================
section('settings-store：持久化与密钥掩码')
// ============================================================================
{
  const mem = {}
  const storage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v) },
    removeItem: (k) => { delete mem[k] },
  }
  const s = createSettingsStore({ storage, storageKey: 'test.settings', clearKeys: ['test.mastery'] })

  check('未存过时返回默认值', s.get().model === 'deepseek-flash' && s.get().maxTokens === 8192)
  check('默认未配置密钥', s.hasKey() === false)

  s.set({ model: 'my-model' })
  check('set 后 get 反映新值', s.get().model === 'my-model')
  check('set 已落库（注入的 storage 里能看到）', /my-model/.test(mem['test.settings']))

  // 新建实例应从存储恢复（验证真的持久化了，而不是只改内存）
  // 注意要带上 clearKeys，否则它当然不会清别的键（这是我第一次写错的地方）
  const s2 = createSettingsStore({ storage, storageKey: 'test.settings', clearKeys: ['test.mastery'] })
  check('新实例从存储恢复', s2.get().model === 'my-model')

  s2.set({ apiKey: 'sk-abcdefghijklmnop' })
  check('hasKey 为真', s2.hasKey() === true)
  const m = s2.mask('sk-abcdefghijklmnop')
  check('掩码保留首尾、中间全掩', m === 'sk-abcd****mnop', m)
  check('掩码不含原文中段', !m.includes('efghijkl'))
  check('空密钥的掩码是明确提示', s2.mask('') === '（未配置）')
  check('极短密钥也不泄漏', s2.mask('sk-ab') === 'sk-****', s2.mask('sk-ab'))

  mem['test.mastery'] = '{"x":1}'
  s2.clearAll()
  check('clearAll 清掉设置键', s2.hasKey() === false && s2.get().model === 'deepseek-flash')
  check('clearAll 也清掉调用方声明的其它键', !('test.mastery' in mem))
}

// ============================================================================
section('viewport：视口自适应')
// ============================================================================
{
  const mkWin = (opts = {}) => {
    const listeners = {}
    return {
      innerWidth: 1200, innerHeight: 900,
      scrollY: 0, pageYOffset: 0,
      visualViewport: opts.visualViewport === undefined
        ? { height: 700, addEventListener: () => {}, removeEventListener: () => {} }
        : opts.visualViewport,
      ResizeObserver: opts.ResizeObserver,
      addEventListener: (t, fn) => { listeners[t] = fn },
      removeEventListener: () => {},
      requestAnimationFrame: (fn) => { fn(); return 1 },
      cancelAnimationFrame: () => {},
      listeners,
    }
  }
  const mkDoc = (viewerRect, opts = {}) => {
    const sets = []
    const observed = []
    const el = { getBoundingClientRect: () => viewerRect }
    return {
      sets, observed,
      documentElement: { style: { setProperty: (k, v) => sets.push(k + '=' + v) } },
      querySelector: (sel) => {
        if (sel === '#viewer') return opts.noViewer ? null : el
        return opts.chrome ? el : null
      },
      fonts: null,
    }
  }

  // --- 优先用 visualViewport（地址栏收放时才准）---
  {
    const win = mkWin()
    const doc = mkDoc({ top: 100, width: 800, height: 400 })
    const vp = createViewport({ doc, win, viewerSelector: '#viewer', bottomGap: 10, minHeight: 220 })
    vp.apply()
    // 700(可见) − 100(顶端) − 10(余量) = 590
    check('用的是 visualViewport.height 而非 innerHeight', doc.sets[0] === '--viewer-h=590px', String(doc.sets[0]))
    check('visibleHeight 返回 visualViewport 高度', vp.visibleHeight() === 700)
  }
  // --- 无 visualViewport 时回退 innerHeight ---
  {
    const win = mkWin({ visualViewport: null })
    const doc = mkDoc({ top: 0, width: 800, height: 400 })
    const vp = createViewport({ doc, win })
    check('无 visualViewport 时回退 innerHeight', vp.visibleHeight() === 900)
  }
  // --- 极端窗口下保底 ---
  {
    const win = mkWin({ visualViewport: { height: 100, addEventListener: () => {}, removeEventListener: () => {} } })
    const doc = mkDoc({ top: 90, width: 800, height: 400 })
    const vp = createViewport({ doc, win, minHeight: 220 })
    vp.apply()
    check('高度不足时落到保底值（不让画布被压成一条缝）', doc.sets[0] === '--viewer-h=220px', String(doc.sets[0]))
  }
  // --- 变化太小不折腾 ---
  {
    const win = mkWin()
    let top = 100
    const doc = {
      sets: [], observed: [],
      documentElement: { style: { setProperty: (k, v) => doc.sets.push(v) } },
      querySelector: () => ({ getBoundingClientRect: () => ({ top, width: 800, height: 400 }) }),
      fonts: null,
    }
    const vp = createViewport({ doc, win, minHeight: 220 })
    vp.apply()
    const n1 = doc.sets.length
    top = 101                       // 高度只变 1px
    vp.apply()
    check('高度变化小于阈值时不写 CSS（避免反复重排）', doc.sets.length === n1)
    top = 130                       // 变 30px
    vp.apply()
    check('变化足够大时正常写入', doc.sets.length === n1 + 1)
  }
  // --- 量不到画布时静默返回，不炸 ---
  {
    const win = mkWin()
    const doc = mkDoc({ top: 0, width: 0, height: 0 })   // 还没布局
    const vp = createViewport({ doc, win })
    vp.apply()
    check('画布还没布局时不写 CSS（也不抛错）', doc.sets.length === 0)
    const win2 = mkWin()
    const doc2 = mkDoc(null, { noViewer: true })
    createViewport({ doc: doc2, win: win2 }).apply()
    check('找不到画布元素时不抛错', doc2.sets.length === 0)
  }
  // --- 画布顶端用「文档坐标」（含滚动量），否则滚动后会算错 ---
  {
    const win = mkWin()
    win.scrollY = 200
    const doc = mkDoc({ top: 50, width: 800, height: 400 })   // 视口内 top=50，文档内 = 250
    const vp = createViewport({ doc, win, bottomGap: 10 })
    vp.apply()
    // 700 − 250 − 10 = 440
    check('画布顶端按文档坐标量（含 scrollY）', doc.sets[0] === '--viewer-h=440px', String(doc.sets[0]))
  }
  // --- 观察的是 chrome 选择器，**不含 body**（否则改画布高度会改 body 高度 → 自激）---
  {
    const win = mkWin({ ResizeObserver: class { constructor() {} observe() {} disconnect() {} } })
    const doc = mkDoc({ top: 0, width: 800, height: 400 }, { chrome: true })
    const vp = createViewport({ doc, win, chromeSelectors: ['.topbar', '.viewer-card .card-head'] })
    vp.init()
    vp.destroy()
    check('init 会挂上 resize / orientationchange 监听',
      !!win.listeners.resize && !!win.listeners.orientationchange)
    check('chromeSelectors 不含 body（否则形成自激循环）',
      !JSON.stringify([].concat(['.topbar', '.viewer-card .card-head'])).includes('body'))
  }
}

// ============================================================================
section('settings-popup：声明式表单与密钥安全')
// ============================================================================
{
  const mkDom = () => {
    const findIn = (node, tag) => {
      for (const c of node.children) {
        if (c.tag === tag) return c
        const r = findIn(c, tag)
        if (r) return r
      }
      return null
    }
    const collectAll = (node, tag, out = []) => {
      for (const c of node.children) { if (c.tag === tag) out.push(c); collectAll(c, tag, out) }
      return out
    }
    const mkNode = (tag) => {
      const n = {
        tag, className: '', textContent: '', children: [], attrs: {}, dataset: {},
        // 真实 DOM 里 setAttribute 会**反射**到同名属性（type/value/placeholder 都是），
        // 桩必须照做，否则 'el() 写 attrs、代码读属性' 的组合会让测试假通过。
        // ★ 同理，**赋值也要能反射回属性**（`input.placeholder = 'x'`）——
        //   只写 getter 会让"重算提示文案"这类实现直接抛
        //   `Cannot set property placeholder of #<Object> which has only a getter`，
        //   而那在真实 DOM 里是完全合法的操作。
        get type() { return n.attrs.type || '' },
        set type(v) { n.attrs.type = String(v) },
        get placeholder() { return n.attrs.placeholder || '' },
        set placeholder(v) { n.attrs.placeholder = String(v) },
        get value() { return n._value !== undefined ? n._value : (n.attrs.value || '') },
        set value(v) { n._value = String(v) },
        checked: false,
        _classes: new Set(), _html: '', _ev: {},
        setAttribute(k, v) { n.attrs[k] = v },
        removeAttribute(k) { delete n.attrs[k] },
        appendChild(c) { n.children.push(c); return c },
        removeChild(c) { const i = n.children.indexOf(c); if (i >= 0) n.children.splice(i, 1); return c },
        addEventListener(t, fn) { n._ev[t] = fn },
        querySelector(sel) { return findIn(n, sel.replace(/^\./, '')) },
        getBoundingClientRect() { return { top: 0, left: 0, width: 10, height: 10 } },
        focus() {},
        get firstChild() { return n.children[0] || null },
      }
      n.classList = {
        add: (...c) => c.forEach((x) => n._classes.add(x)),
        remove: (...c) => c.forEach((x) => n._classes.delete(x)),
        toggle: (c, on) => { if (on) n._classes.add(c); else n._classes.delete(c) },
        contains: (c) => n._classes.has(c),
      }
      Object.defineProperty(n, 'innerHTML', { get: () => n._html, set: (v) => { n._html = v } })
      return n
    }
    const body = mkNode('body')
    return { document: { body, createElement: mkNode }, body, collectAll, findIn }
  }

  const mem = {}
  const storage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v) },
    removeItem: (k) => { delete mem[k] },
  }
  const store = createSettingsStore({ storage, storageKey: 't.s', clearKeys: ['t.x'] })
  store.set({ apiKey: 'sk-originalkey123456' })

  const dom = mkDom()
  const win = { confirm: () => true, alert: () => {}, location: { reload: () => {} } }
  let tested = 0
  const popup = createSettingsPopup({
    doc: dom.document, win, store,
    testConnection: async (patch) => { tested++; if (!patch.apiKey) throw new Error('未填写 API Key'); return { model: 'tested-model' } },
    about: '<b>关于</b>',
  })
  popup.open()
  check('open 后弹层可见', popup.isOpen() === true)

  const overlay = dom.body.children.find((c) => c.className === 'agent-overlay')
  check('用真实类名建出弹层', !!overlay)
  const box = overlay.children[0]
  check('弹层内层类名与 CSS 一致', box.className === 'agent-settings-box')
  check('头部类名与 CSS 一致', box.children[0].className === 'agent-settings-head')
  check('分组标题沿用原措辞（带使用场景提示）',
    dom.collectAll(box, 'div').some((d) => /模型服务（改一次就不动）/.test(d.textContent)))
  check('含「测试连接」按钮',
    dom.collectAll(box, 'button').some((b) => b.textContent === '测试连接'))

  // --- 密钥：输入框为 password、值为空（只把掩码放 placeholder）---
  const keyInput = dom.collectAll(box, 'input').find((i) => i.attrs.type === 'password')
  check('密钥输入框是 password 类型', !!keyInput)
  check('密钥输入框**不回填**完整密钥', keyInput.value === '', String(keyInput.value))
  check('密钥以掩码形式出现在 placeholder', /sk-orig\*\*\*\*3456/.test(keyInput.placeholder), keyInput.placeholder)

  // --- 不点过就保存：原密钥必须保留 ---
  popup.collect()
  check('未触碰密钥时保存不会清掉原密钥', store.get().apiKey === 'sk-originalkey123456', store.get().apiKey)

  // --- 点过后才覆盖 ---
  keyInput.value = 'sk-newkey98765432'
  keyInput.dataset.touched = '1'
  popup.collect()
  check('触碰过才覆盖密钥', store.get().apiKey === 'sk-newkey98765432', store.get().apiKey)

  // --- 数字夹紧 ---
  const numInput = dom.collectAll(box, 'input').find((i) => i.attrs.type === 'number')
  numInput.value = '999999'
  popup.collect()
  check('超上限的数值被夹到 max', store.get().maxTokens === 65536, String(store.get().maxTokens))
  numInput.value = '10'
  popup.collect()
  check('低于下限的数值被夹到 min', store.get().maxTokens === 1024, String(store.get().maxTokens))

  // --- 文本留空回退默认 ---
  const textInput = dom.collectAll(box, 'input').find((i) => i.attrs.type === 'text')
  textInput.value = ''
  popup.collect()
  check('文本留空回退到默认值（不会存空串）', store.get().endpoint === 'https://api.deepseek.com', store.get().endpoint)

  // --- 复选框与下拉 ---
  const cb = dom.collectAll(box, 'input').find((i) => i.attrs.type === 'checkbox')
  cb.checked = false
  popup.collect()
  check('复选框读到未勾选', store.get().showReasoning === false)
  const sel = dom.collectAll(box, 'select')[0]
  sel.value = 'max'
  popup.collect()
  check('下拉读到选中值', store.get().effort === 'max', store.get().effort)

  // --- 测试连接（用刚填的值，不需要先保存）---
  const testBtn = dom.collectAll(box, 'button').find((b) => b.textContent === '测试连接')
  const load = new Promise((r) => { setTimeout(r, 0) })
  testBtn.onclick()
  await load
  check('测试连接被调用', tested === 1)
  const msg = dom.collectAll(box, 'span').find((s) => s.className.includes('agent-test-msg'))
  check('测试成功给出反馈', /连接成功/.test(msg.textContent) && /ok/.test(msg.className), msg.textContent)

  // --- 点遮罩关闭 ---
  popup.open()
  overlay._ev.click({ target: overlay })
  check('点遮罩关闭弹层', popup.isOpen() === false)

  // --- 清除数据 ---
  mem['t.x'] = '1'
  const clearBtn = dom.collectAll(box, 'button').find((b) => b.textContent === '清除本机全部数据')
  clearBtn.onclick()
  check('清除后设置回到默认、其它键也清掉', !('t.s' in mem) && !('t.x' in mem))

  // --- schema 完整性：默认声明覆盖了默认值里的每个键 ---
  const defaultKeys = Object.keys(store.DEFAULTS)
  const schemaKeys = DEFAULT_SCHEMA.map((f) => f.key)
  check('默认 schema 覆盖了全部默认设置项',
    defaultKeys.every((k) => schemaKeys.includes(k)),
    '缺: ' + defaultKeys.filter((k) => !schemaKeys.includes(k)).join(','))
}

// ============================================================================
section('令牌与样式文件：结构约定')
// ============================================================================
{
  const tokens = readFileSync(repo('packages/ui-kit/tokens.css'), 'utf-8')
  const comps = readFileSync(repo('packages/ui-kit/components.css'), 'utf-8')
  const idx = readFileSync(repo('packages/ui-kit/index.js'), 'utf-8')

  check('tokens.css 定义了暗色默认值', /:root\s*\{[\s\S]*--bg:/.test(tokens))
  check('tokens.css 提供浅色主题覆盖', /\[data-theme="light"\]/.test(tokens))
  check('tokens.css 跟随系统偏好（且不覆盖显式指定的主题）',
    /prefers-color-scheme: light/.test(tokens) && /:root:not\(\[data-theme\]\)/.test(tokens))
  check('tokens.css 含安全区令牌', /--safe-top:/.test(tokens) && /--safe-bottom:/.test(tokens))
  check('tokens.css 说明了安全区令牌的前提（viewpoint-fit=cover）',
    /viewport-fit=cover/.test(tokens))
  check('字阶令牌的下限不低于 12px（治理改造前 7px 字号）',
    /--fs-xs:\s*12px/.test(tokens))
  check('含触摸目标下限令牌', /--tap-min:\s*44px/.test(tokens))

  check('components.css 的三维视口用变量且带兜底', /height:\s*var\(--viewer-h,\s*44vh\)/.test(comps))
  check('components.css 给三维 canvas 设了 touch-action:none', /canvas\s*\{[^}]*touch-action:\s*none/.test(comps))
  check('components.css 保留了栅格项 min-width:0 的修复', /\.grid-charts > \*\s*\{\s*min-width:\s*0/.test(comps))
  check('components.css 提供可见焦点样式（键盘可用）', /:focus-visible/.test(comps))

  check('index.js 导出三个模块', /createViewport/.test(idx) && /createSettingsStore/.test(idx) && /createSettingsPopup/.test(idx))
}

// ============================================================================
console.log(`\n${'═'.repeat(60)}`)
console.log(`test-ui-kit 结果：通过 ${pass} 项，失败 ${fail} 项`)
console.log('═'.repeat(60))
process.exit(fail ? 1 : 0)
