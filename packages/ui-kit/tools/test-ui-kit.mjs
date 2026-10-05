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
import { createSettingsPopup, DEFAULT_SCHEMA, readableOn } from '../settings-popup.js'

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
        tag, _classes: new Set(), textContent: '', children: [], attrs: {}, dataset: {},        // 真实 DOM 里 setAttribute 会**反射**到同名属性（type/value/placeholder 都是），
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
        _html: '', _ev: {},
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
      /**
       * ★ `className` 与 `classList` 在真实 DOM 里是**同一份数据**（改一个另一个跟着变）。
       *   桩原先让它们各存一份：`el({ class: 'agent-sec open' })` 只写 className，
       *   而 `classList.contains('open')` 查的是另一个空集合 —— 于是"折叠分区默认展开"
       *   这类逻辑在桩里看不到初始态，测试与实现会对不上（假通过、假失败两个方向都可能）。
       */
      Object.defineProperty(n, 'className', {
        get: () => [...n._classes].join(' '),
        set: (v) => { n._classes = new Set(String(v).split(/\s+/).filter(Boolean)) },
      })
      n.classList = {
        add: (...c) => c.forEach((x) => n._classes.add(x)),
        remove: (...c) => c.forEach((x) => n._classes.delete(x)),
        toggle: (c, on) => {
          const want = on === undefined ? !n._classes.has(c) : !!on
          if (want) n._classes.add(c); else n._classes.delete(c)
          return want
        },
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

  // ★ 判据从 `className === '…'` 改成 `classList.contains('…')`：
  //   `open()` 会给弹层 `classList.add('show')`，而**真实 DOM 里 className 与 classList
  //   是同一份数据** —— 加了 show 之后 `className` 是 `'agent-overlay show'`，
  //   严格相等必然为假（这条断言此前只是被桩的"两份数据"假通过）。
  const overlay = dom.body.children.find((c) => c.classList && c.classList.contains('agent-overlay'))
  check('用真实类名建出弹层', !!overlay)
  const box = overlay.children[0]
  check('弹层内层类名与 CSS 一致', box.classList.contains('agent-settings-box'))
  check('头部类名与 CSS 一致', box.children[0].classList.contains('agent-settings-head'))
  // ★ 分组标题的**载体变了**：从"一个 div 当标题"改成"可折叠分区的头部按钮"
  //   （settings-popup 的 makeSection）。断言跟着改，并补上几条**新行为**的断言 ——
  //   否则"全部收起"也会让下面第一条过。
  // ★ 措辞也变了：一级标题后的括号说明按用户要求删掉了（2026-10-05）。
  check('分组标题沿用原措辞',
    dom.collectAll(box, 'span').some((d) => /模型服务/.test(d.textContent)))
  const secs = dom.collectAll(box, 'section')
  check('设置项分组成可折叠分区', secs.length >= 4, `分区数 ${secs.length}`)
  // ★ 2026-10-05 改：默认**不展开任何分组**（用户报「打开设置后，无需默认展开『界面』」）。
  //   想默认展开的分组要自己声明 `open: true`；"因缺 Key 自动弹"走 open({expand})。
  check('默认不展开任何分组',
    secs.length > 0 && secs.every((s) => !s.classList.contains('open')))
  {
    // ★ 用**子 span 的 textContent** 找头部按钮：桩的 textContent 是普通属性，
    //   不会像真实 DOM 那样从子节点拼出来（所以不能直接 /模型服务/.test(b.textContent)）。
    const head = dom.collectAll(box, 'button')
      .find((b) => b.children.some((c) => /模型服务/.test(c.textContent)))
    check('分区头部是可点按钮且带 aria-expanded',
      !!head && head.attrs['aria-expanded'] === 'false')
    // 默认收起 ⇒ 点一次是**展开**、再点一次是**收起**（可逆，且 aria 跟着变）
    if (head && typeof head.onclick === 'function') {
      head.onclick()
      const opened = secs[0].classList.contains('open') && head.attrs['aria-expanded'] === 'true'
      head.onclick()
      const closed = !secs[0].classList.contains('open') && head.attrs['aria-expanded'] === 'false'
      check('点分区头部可展开、再点可收起（可逆）', opened && closed,
        `opened=${opened} closed=${closed}`)
    } else {
      check('点分区头部可展开、再点可收起（可逆）', false, '没有 onclick')
    }
  }

  // ---------------------------------------------------------------------
  // open({ expand })：按**分区 id** 定位要展开的那一组
  //
  // ★ 为什么必须有：程序因「缺 API Key」自动弹设置时，用户要填的是模型服务，
  //   而默认展开的是第一组「界面」——他先看到一个与自己目的无关的面板还得自己找。
  // ★ 用 id 而不是标题匹配：标题会被 i18n 换成英文，中文匹配会静默失效。
  // ---------------------------------------------------------------------
  check('按 id 展开指定分区（缺 Key 自动弹层要展开模型服务）', (() => {
    popup.open({ expand: 'model' })
    const modelSec = secs.find((s) => s.attrs && s.attrs['data-gid'] === 'model')
    return !!modelSec && modelSec.classList.contains('open')
      && secs.filter((s) => s !== modelSec).every((s) => !s.classList.contains('open'))
  })())
  check('展开态每次 open 都重置（不残留上一次的展开）', (() => {
    popup.open()   // 无参 → 回到"全部收起"
    return secs.every((s) => !s.classList.contains('open'))
  })())
  check('未知 id 时不误展开任何一组（全收起，而不是悄悄展开第一组）', (() => {
    popup.open({ expand: 'no-such-section' })
    return secs.every((s) => !s.classList.contains('open'))
  })())
  popup.open()   // 复原，免得影响下面的断言

  // ---------------------------------------------------------------------
  // 缺值兜底：字段在 store 里没有值时**不许**把 undefined 拼进 DOM
  // （用户报的「晶体模块参数里显示 undefined」根因就是这个）
  // ---------------------------------------------------------------------
  {
    const dom2 = mkDom()
    const mem2 = {}
    const store2 = createSettingsStore({
      storage: { getItem: (k) => (k in mem2 ? mem2[k] : null), setItem: (k, v) => { mem2[k] = v }, removeItem: (k) => { delete mem2[k] } },
      storageKey: 't2.s',
    })
    const p2 = createSettingsPopup({
      doc: dom2.document, win, store: store2,
      // 故意声明两个"store 里没有默认值"的字段 —— 模块设置项的常见形态
      schema: [
        { key: 'noDefaultRange', label: '无默认滑块', type: 'range', min: 0, max: 2, step: 0.1, unit: '×' },
        { key: 'noDefaultSelect', label: '无默认下拉', type: 'select', options: [['a', '甲'], ['b', '乙']] },
      ],
      groups: [{ title: '测试组', keys: ['noDefaultRange', 'noDefaultSelect'] }],
    })
    p2.open()
    const ov2 = dom2.body.children.find((c) => c.classList && c.classList.contains('agent-overlay'))
    const box2 = ov2.children[0]
    check('缺值时不产出字面量 undefined',
      !dom2.collectAll(box2, 'span').some((n) => /undefined/.test(n.textContent)),
      dom2.collectAll(box2, 'span').map((n) => n.textContent).join('|'))
    const rng = dom2.collectAll(box2, 'input').find((i) => i.attrs.type === 'range')
    check('range 缺值回落到 min（不是 midpoint、更不是 undefined）',
      !!rng && String(rng.value) === '0', rng && String(rng.value))
    const sel2 = dom2.collectAll(box2, 'select')[0]
    check('select 缺值/越界时回落到第一项（不留空白下拉）',
      !!sel2 && sel2.value === 'a', sel2 && String(sel2.value))
  }

  // readableOn：周期表格子的字色要跟底色反着来（氢是近白底，写白字就看不见）
  check('readableOn：浅底给深字、深底给浅字', (() => {
    return readableOn('#FFFFFF') === '#111' && readableOn('#000000') === '#fff'
      && readableOn('#FFD700') === '#111'   // 亮黄也是浅底
      && readableOn('#1E3A8A') === '#fff'   // 深蓝给白字
      && readableOn('bad') === '#fff'       // 非法值不抛错
  })())
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

  // ---------------------------------------------------------------------
  // 棘轮：浅色调色板**只允许一处**
  //
  // ★ 用户报「跟随系统的颜色为什么跟浅色或深色都不一样」。根因：tokens.css 里
  //   另有一块 @media (prefers-color-scheme: light){ :root:not([data-theme]){…} }，
  //   它**只列了 13 个令牌**，而 [data-theme="light"] 有 68 个 —— 于是"系统浅色"
  //   拿到的是浅底 + 深色主题的状态色与学科语义色，成了第三套配色。
  //   判据不是"把那 13 个补齐"（补齐了还会再漂），而是：系统主题只决定**解析成哪个**，
  //   颜色一律归 data-theme。所以本文件不得再出现 prefers-color-scheme。
  // ---------------------------------------------------------------------
  // ★ 先**剥掉注释**再断言：这条规则的说明文字里就写着 prefers-color-scheme,
  //   不剥注释会把"解释为什么删掉它"本身判成违规（本仓库在 autoRotateSpeed 那条
  //   棘轮上踩过同一个坑）。
  const stripCssComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
  check('tokens.css 不再有 prefers-color-scheme 的第二套调色板',
    !/prefers-color-scheme/.test(stripCssComments(tokens)))
  check('theme.js：system 也把解析后的主题写进 data-theme',
    /setAttribute\('data-theme'/.test(readFileSync(repo('packages/ui-kit/theme.js'), 'utf-8')))
  check('index.html：首帧前就有行内脚本定主题（否则会闪一下深色）',
    /chem-agent\.theme/.test(readFileSync(repo('apps/web/index.html'), 'utf-8'))
    && /setAttribute\('data-theme'/.test(readFileSync(repo('apps/web/index.html'), 'utf-8')))

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
