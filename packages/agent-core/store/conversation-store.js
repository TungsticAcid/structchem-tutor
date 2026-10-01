/**
 * store/conversation-store.js — 对话的本地持久化 + **分支树**
 *
 * 解决的问题很朴素：**刷新页面后对话就没了**。而学生在晶体视图里问了一半、
 * 切去别的页面再回来（或手机锁屏后浏览器回收了页面），回来时上下文全丢
 * ——这在移动端是常态，不是例外。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ★ 为什么从"扁平数组"改成"树"
 * ═══════════════════════════════════════════════════════════════════════
 * 扁平数组能存"一条线"，但存不下**分叉**：学生把某句提问改一下重问，原先的
 * 分支就该留着（他可能想对照两种问法的回答）。orbit 的做法是树：
 * `nodes` 字典 + 单亲 `parent` 指针 + 一个 `leaf` 指针，**切分支只是移一个指针**，
 * 一个字节都不删。
 *
 * ★★ 真正的难点不是 `parentId`，而是 `projection()`
 *   本文件的原注释说"加一个 parentId 字段即可承载分支"——那只对了"**存**"的一半。
 *   切分支之后必须重新投影出**工具调用成对**的 OpenAI messages：`assistant(tool_calls)`
 *   后面必须紧跟对应数量的 `tool` 消息，否则服务端直接判 400。
 *   所以投影做成**纯函数** `projection(leafId)`：从叶回溯到根，每次返回全新对象。
 *   纯函数的好处是"不可能出现裁剪后悬空"——因为根本不存在"裁"这一步。
 *
 * ★★ `replaceAll` 从"覆盖"改为"**对齐合并**（reconcile）"
 *   每轮对话结束后整体落盘（而不是逐条 append）这个设计必须保住：逐条写时用户
 *   中途刷新会留下悬空 `tool_calls`。但"覆盖"与树不相容（覆盖会丢掉分叉）。
 *   解法是利用一条已成立的性质——`conversation.js` 的 history **只追加、不重写**，
 *   故一轮结束后 `replaceAll(getHistory())` 拿到的 list **必然以"当前叶路径的投影"
 *   为前缀**。于是：取其与前缀的最长公共前缀，只把**尾部**挂成新节点。
 *   若历史反而变短了（极端情形），旧后缀留作**兄弟分支**，不静默丢内容。
 *
 *   ⚠️ 合并语义有一个后果必须记住：`replaceAll([])` **什么都不做**（公共前缀为空、
 *      尾部也为空）。所以"清空"必须走 `clear()`——它显式重建一棵空树。
 *
 * ★ 只存本机（localStorage），不上传；**不存 API Key**（那是 settings-store 的事）。
 *
 * 参考实现：orbit/H5/js/agent/conv-store.js（674 行）。本文件按本仓库的约束重写，
 * 但保留了它用真实故障换来的三条：编号水位要跟上、裁剪不能砍头、切分支先 stop 队列。
 */
// ★ 会话默认标题 `新对话` **刻意不在这里走 t()**：它是**存盘的数据**（用户可改名，
//   面板把它当文本节点渲染）。若在创建时取当前语言，中文下建的会话切到英文后标题就
//   永远停在中文；反过来更糟——英文下建的会话回不到中文。故它登记在 `./i18n.js`
//   的 `text` 表里，由 DOM 扫描替换按**当前语言**渲染，数据保持语言中立。
//   唯一需要翻译的是回灌给模型的那条占位说明（它进的是消息历史，不是 DOM）。
// ★ 自己 import 字典（副作用即 registerDict），不依赖入口替你注册
import '../i18n.js'
import { t } from '../../i18n/index.js'

/** 存储键前缀 */
const KEY_PREFIX = 'crystal.agent.conv'

/** 单会话最多保留多少个**节点**（不是消息条数——树里的节点多于当前路径） */
const MAX_NODES = 400

/** 最多保留多少个会话的历史 */
const MAX_SESSIONS = 20

/** 当前文档格式版本 */
const DOC_VERSION = 2

/** chainTo 的防环上限（正常树远小于它；真出现环也不至于死循环） */
const MAX_CHAIN = 1000

/**
 * @param {Object} [opts]
 * @param {Object} [opts.storage]   具备 getItem/setItem/removeItem（缺省 localStorage）
 * @param {string} [opts.prefix]
 * @param {number} [opts.maxNodes]
 * @param {number} [opts.maxSessions]
 */
export function createConversationStore(opts = {}) {
  const storage = opts.storage
    || (typeof localStorage !== 'undefined' ? localStorage : null)
  const prefix = opts.prefix || KEY_PREFIX
  const maxNodes = opts.maxNodes || MAX_NODES
  const maxSessions = opts.maxSessions || MAX_SESSIONS

  let currentId = null
  /** 当前会话的文档（树）。null 表示尚未加载 */
  let doc = null
  /**
   * 是否允许写盘。
   * ★ 读到**更高版本**的文档时置 false：旧代码不该把新格式写坏（只读更安全）。
   */
  let persist = true
  /** 变更订阅（面板据此刷新） */
  const listeners = new Set()

  const kIndex = `${prefix}.index`
  const kConv = (id) => `${prefix}.${id}`

  // ═══════════════════════════════════════════════════════════════════════
  // 读写
  // ═══════════════════════════════════════════════════════════════════════

  function read(key, fallback) {
    try {
      const raw = storage && storage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch (e) { return fallback }
  }

  function write(key, val) {
    if (!persist) return false
    try {
      if (storage) storage.setItem(key, JSON.stringify(val))
      return true
    } catch (e) {
      // ★ 写失败最常见的原因是**配额满**（localStorage 通常 5MB）。此时降级而不是崩：
      //   ① 先尝试修剪当前文档里"不在路径上"的节点（那是分叉留下的旧版本）
      //   ② 仍失败就淘汰最旧的**非活动**会话（最多 3 次）
      //   ③ 都不行就放弃本次持久化——对话在内存里仍完好，只是刷新后丢失
      try {
        if (val && val.nodes) {
          if (pruneOffPath(Math.floor(maxNodes / 2))) {
            const slim = JSON.stringify(val)
            storage.setItem(key, slim)
            return true
          }
        }
      } catch (e1) { /* 继续降级 */ }
      try {
        if (storage) {
          const list = index().filter((x) => x && x.id && x.id !== currentId)
          for (let i = 0; i < Math.min(3, list.length); i++) {
            const old = list[list.length - 1 - i]
            storage.removeItem(kConv(old.id))
          }
          storage.setItem(key, JSON.stringify(val))
          return true
        }
      } catch (e2) { /* 放弃持久化 */ }
      return false
    }
  }

  /** 会话索引：[{id, title, at, count, leaf}]，最近的在前 */
  function index() {
    const list = read(kIndex, [])
    return Array.isArray(list) ? list : []
  }

  function touchIndex(patch) {
    const list = index()
    const rec = list.find((x) => x && x.id === currentId)
    if (rec) {
      Object.assign(rec, patch, { at: Date.now() })
      // 最近的排到最前
      const i = list.indexOf(rec)
      if (i > 0) { list.splice(i, 1); list.unshift(rec) }
      write(kIndex, list)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 文档：新建 / 加载 / 迁移 / 保存
  // ═══════════════════════════════════════════════════════════════════════

  function blankDoc(id, title) {
    return {
      v: DOC_VERSION,
      id: id || null,
      seq: 0,
      leaf: null,
      title: title || '新对话',
      at: Date.now(),
      nodes: {},
    }
  }

  /**
   * 把任意版本的存档迁移成当前格式。
   * ★ 旧格式（v1）只有一个扁平 `{ messages: [], at }`——迁移就是把它们**顺序串成
   *   一条链**（首条 parent=null）。这不丢任何内容，且此后就能长出分支。
   * ★ 纯函数、可单测；`v > 当前版本` 时返回 null 并由调用方置只读。
   */
  function migrate(data, id) {
    if (!data || typeof data !== 'object') return blankDoc(id)
    if (data.v === DOC_VERSION) {
      if (!data.nodes || typeof data.nodes !== 'object') return blankDoc(id)
      return data
    }
    if (data.v != null && data.v > DOC_VERSION) return null   // 更高版本：只读
    // ---- v1 → v2 ----
    const out = blankDoc(id, data.title)
    out.at = data.at || Date.now()
    let parent = null
    for (const m of (Array.isArray(data.messages) ? data.messages : [])) {
      if (!m || !m.role) continue
      const nid = 'm' + (++out.seq)
      out.nodes[nid] = Object.assign({}, m, {
        id: nid, parent, seq: out.seq, ts: data.at || Date.now(), origin: m.origin || 'user',
      })
      parent = nid
    }
    out.leaf = parent
    return out
  }

  function loadDoc(id) {
    const raw = read(kConv(id), null)
    const migrated = migrate(raw, id)
    persist = migrated !== null
    // ★ 迁移过就立刻写回：否则旧格式永远留在盘上、每次打开都要再迁一遍，
    //   而且"迁移后的形态"从未被验证过（写回才是真正的迁移）。
    if (migrated && raw && raw.v !== DOC_VERSION) write(kConv(id), migrated)
    return migrated || blankDoc(id)
  }

  function save() {
    if (!doc) return false
    doc.at = Date.now()
    const ok = write(kConv(doc.id), doc)
    touchIndex({ count: Object.keys(doc.nodes).length, leaf: doc.leaf, title: doc.title })
    return ok
  }

  /** 确保有一个当前会话 */
  function ensure() {
    if (currentId && doc) return currentId
    const list = index()
    if (list.length) {
      currentId = list[0].id
      doc = loadDoc(currentId)
      return currentId
    }
    return create()
  }

  /** 新建一个会话并设为当前 */
  function create(title) {
    const id = `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
    const list = index().filter((x) => x && x.id)
    list.unshift({ id, title: title || '新对话', at: Date.now(), count: 0, leaf: null })
    // ★ 只保留最近若干个会话。淘汰时**连正文一起删**——只删索引会留下永远读不到的垃圾。
    while (list.length > maxSessions) {
      const dropped = list.pop()
      try { if (storage) storage.removeItem(kConv(dropped.id)) } catch (e) { /* ignore */ }
    }
    currentId = id
    doc = blankDoc(id, title)
    write(kIndex, list)
    write(kConv(id), doc)
    emit()
    return id
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 树核心
  // ═══════════════════════════════════════════════════════════════════════

  function nodeById(id) {
    return (doc && doc.nodes[id]) || null
  }

  /** 根 → 该节点的链（带 visited 防环） */
  function chainTo(leafId) {
    if (!doc) return []
    const out = []
    const seen = new Set()
    let cur = leafId
    let guard = 0
    while (cur && doc.nodes[cur] && guard++ < MAX_CHAIN) {
      if (seen.has(cur)) break
      seen.add(cur)
      out.push(doc.nodes[cur])
      cur = doc.nodes[cur].parent
    }
    return out.reverse()
  }

  /** 当前路径（根 → 叶） */
  function path(leafId) {
    return chainTo(leafId != null ? leafId : (doc && doc.leaf))
  }

  /**
   * 把当前路径投影成 OpenAI messages。
   *
   * ★ 三条纪律，缺一个都会出问题：
   *   ① `role:'card'` 的节点**留在链上、参与路径，但不进投影**——这样"题目卡、动作气泡"
   *      这类展示消息也能持久化，却不污染协议历史。
   *   ② **每次返回全新对象**。若共享引用，切到另一分支后两边会互相污染
   *      （原实现 `getHistory()` 返回 `history.slice()` 是浅拷贝，已有此隐患）。
   *   ③ `content` 必须是 `''` 而不是 undefined——助手只发工具调用时 content 为空。
   */
  function projection(leafId) {
    const chain = chainTo(leafId != null ? leafId : (doc && doc.leaf))
    const out = []
    for (const n of chain) {
      if (n.role === 'card') continue
      const m = { role: n.role, content: typeof n.content === 'string' ? n.content : '' }
      if (n.role === 'assistant' && Array.isArray(n.tool_calls) && n.tool_calls.length) {
        m.tool_calls = n.tool_calls.map((t) => ({
          id: t.id,
          type: t.type || 'function',
          function: { name: t.function.name, arguments: t.function.arguments },
        }))
      }
      if (n.role === 'tool' && n.tool_call_id) m.tool_call_id = n.tool_call_id
      out.push(m)
    }
    return out
  }

  /** 子节点 id 列表（按 seq 升序） */
  function childrenOf(id) {
    if (!doc) return []
    const key = id || '__root__'
    const out = []
    for (const k of Object.keys(doc.nodes)) {
      const p = doc.nodes[k].parent || '__root__'
      if (p === key) out.push(k)
    }
    return out.sort((a, b) => doc.nodes[a].seq - doc.nodes[b].seq)
  }

  /** 从某节点沿"最后一个孩子"走到底（切分支时用：切到某个分叉点 = 回到那条线的最新处） */
  function deepestLeaf(fromId) {
    let cur = fromId || null
    if (cur == null) {
      const roots = childrenOf(null)
      if (!roots.length) return null
      cur = roots[roots.length - 1]
    }
    let guard = 0
    while (guard++ < MAX_CHAIN) {
      const kids = childrenOf(cur)
      if (!kids.length) break
      cur = kids[kids.length - 1]
    }
    return cur
  }

  /** 兄弟节点（含自己）。根的兄弟 = 所有根 */
  function siblings(id) {
    const n = nodeById(id)
    if (!n) return []
    return childrenOf(n.parent)
  }

  /** 从根到该节点的深度（用于展示"分支 2 · 4 条"之类） */
  function branchDepth(id) {
    return chainTo(id).length
  }

  /** 分叉点清单：同一父节点下有 ≥2 个子节点的地方 */
  function forkPoints() {
    if (!doc) return []
    const out = []
    const roots = childrenOf(null)
    if (roots.length > 1) {
      out.push({ id: null, root: true, children: roots, seq: -1, at: doc.nodes[roots[0]].ts })
    }
    for (const k of Object.keys(doc.nodes)) {
      const kids = childrenOf(k)
      if (kids.length > 1) {
        out.push({ id: k, root: false, children: kids, seq: doc.nodes[k].seq, at: doc.nodes[k].ts })
      }
    }
    return out.sort((a, b) => a.seq - b.seq)
  }

  /**
   * 追加一个节点。
   * @param {Object} msg        { role, content, tool_calls?, tool_call_id?, origin?, reasoning?, kind?, meta? }
   * @param {string|null} [parentId] 缺省接到当前叶上；显式传 null 表示"作为新的根"
   * @returns {string|null} 节点 id
   */
  function appendNode(msg, parentId) {
    if (!doc || !msg || !msg.role) return null
    const id = 'm' + (++doc.seq)
    const parent = parentId === undefined ? doc.leaf : (parentId || null)
    const n = {
      id,
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : '',
      parent,
      seq: doc.seq,
      ts: Date.now(),
      origin: msg.origin || 'user',
    }
    if (msg.tool_calls && msg.tool_calls.length) n.tool_calls = msg.tool_calls
    if (msg.tool_call_id) n.tool_call_id = msg.tool_call_id
    // ★ 展示用字段存在**节点**上（不在 projection 里）——这正是"不存 messages 缓存"
    //   换来的好处：思考过程、卡片元信息可以随节点持久化，却不进协议历史。
    if (msg.reasoning) n.reasoning = msg.reasoning
    if (msg.kind) n.kind = msg.kind
    if (msg.meta) n.meta = msg.meta
    doc.nodes[id] = n
    doc.leaf = id
    return id
  }

  /** 追加一张**展示卡**（题目卡/反馈卡/主动提示卡）：留在链上、进投影时被过滤 */
  function appendCard(kind, meta) {
    return appendNode({ role: 'card', content: '', kind, meta: meta || {}, origin: 'card' })
  }

  /** 就地改节点的字段（题目卡的 answered、提示卡的 dismissed…） */
  function patchNode(id, fields) {
    const n = nodeById(id)
    if (!n || !fields) return false
    Object.assign(n, fields)
    return true
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 分叉 / 切换
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 从某节点分叉：把叶指针移过去，此后新增的消息都挂在那条线上。
   * ★ **不删任何节点**——原分支只是离开了当前路径，切回去原样还在。
   * ★ `nodeId` 允许为 **null**：编辑"第一条提问"时它的 parent 就是 null。
   */
  function branchFrom(nodeId) {
    if (!doc) return false
    if (nodeId != null && !doc.nodes[nodeId]) return false
    doc.leaf = nodeId == null ? null : nodeId
    save()
    emit()
    return true
  }

  /** 切到某节点所在的**那条线**（自动走到该线的最深处，否则会停在一个中途点） */
  function switchLeaf(nodeId) {
    if (!doc) return false
    if (nodeId != null && !doc.nodes[nodeId]) return false
    doc.leaf = deepestLeaf(nodeId)
    save()
    emit()
    return true
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 对齐合并（原 replaceAll 的语义）
  // ═══════════════════════════════════════════════════════════════════════

  /** 两条消息是否"同一条"（只比会进协议历史的字段；不比 reasoning） */
  function sameMsg(a, b) {
    if (!a || !b || a.role !== b.role) return false
    if ((a.content || '') !== (b.content || '')) return false
    if ((a.tool_call_id || null) !== (b.tool_call_id || null)) return false
    const ta = (a.tool_calls || []).map((t) => t && t.id).join(',')
    const tb = (b.tool_calls || []).map((t) => t && t.id).join(',')
    return ta === tb
  }

  function longestCommonPrefix(a, b) {
    const n = Math.min(a.length, b.length)
    let i = 0
    while (i < n && sameMsg(a[i], b[i])) i++
    return i
  }

  /**
   * 用一批消息与本会话的树**对齐**：公共前缀认作"已经在这条线上"，只把**多出来的
   * 尾部**挂成新节点。
   *
   * ★ 为什么不用"覆盖"：覆盖会丢掉分叉（学生编辑旧提问留下的那条分支）。
   * ★ 为什么敢用对齐：`conversation.js` 的 history **只追加不重写**（send 里一路 push），
   *   所以一轮结束后传进来的 list 必然以当前叶路径的投影为前缀。
   * ★ 历史反而**变短**时（n < 当前路径长度）：把旧后缀留作**兄弟分支**——叶指针退回
   *   公共前缀末端，旧的那条线原样保留，切得回去。
   *
   * ⚠️ 推论：`replaceAll([])` 什么也不做。清空请用 `clear()`。
   *
   * @returns {number} 本次新增的节点数
   */
  function replaceAll(list) {
    ensure()
    const arr = Array.isArray(list) ? list : []
    // ★ 空数组**什么都不做**：合并语义下它既没有"公共前缀"也没有"尾部"。
    //   若顺手把它当"清空"处理，就会静默把叶指针移到 null——节点其实还在，
    //   但当前路径空了（表现为"对话突然不见了、刷新后又回来"，极难排查）。
    //   清空请用 clear()，它显式重建一棵空树。
    if (!arr.length) return 0
    const chain = chainTo(doc.leaf)
    const cur = projection()
    const n = longestCommonPrefix(cur, arr)

    // 叶指针退到公共前缀的末端（为 null 表示回到"还没有消息"的状态）
    doc.leaf = n === 0 ? null : chain[n - 1].id

    let parent = doc.leaf
    let added = 0
    for (let i = n; i < arr.length; i++) {
      const id = appendNode(arr[i], parent)
      if (id) { parent = id; added++ }
    }
    trim()
    save()
    emit()
    return added
  }

  /** 追加一条消息（保留此 API；**不保证** tool_calls 成对，业务代码请用 replaceAll） */
  function append(msg) {
    ensure()
    const id = appendNode(msg)
    save()
    emit()
    return !!id
  }

  /**
   * 补上悬空的工具配对。
   * ★ 场景：本轮被中止、或历史来自一个更早的版本。`assistant(tool_calls)` 之后若缺少
   *   对应数量的 `tool` 消息，下一次请求会被服务端直接判 400——而 400 的表现是
   *   "突然不能说话了"，很难联想到是历史截面不合法。
   * @returns {number} 补了几条
   */
  function ensureValid() {
    if (!doc) return 0
    const chain = chainTo(doc.leaf)
    const pending = new Map()   // tool_call_id → 是否已配对
    for (const n of chain) {
      if (n.role === 'assistant' && Array.isArray(n.tool_calls)) {
        for (const t of n.tool_calls) if (t && t.id) pending.set(t.id, false)
      } else if (n.role === 'tool' && n.tool_call_id) {
        if (pending.has(n.tool_call_id)) pending.set(n.tool_call_id, true)
      }
    }
    let fixed = 0
    for (const [tid, paired] of pending) {
      if (paired) continue
      appendNode({
        role: 'tool', tool_call_id: tid,
        content: JSON.stringify({ aborted: true, note: t('agent.store.abortedPlaceholder') }),
      })
      fixed++
    }
    if (fixed) save()
    return fixed
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 裁剪（配额与体积）
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * 只删"不在当前路径上、且没有子节点"的最旧节点。
   * ★ **绝不能砍头**（把最早的节点删掉）——那会让后代的 parent 悬空，整条链断掉，
   *   表现为"刷新后对话只剩后半截"。原实现用 `list.splice(0, ...)` 砍的是数组头，
   *   在树里等价于砍根，是必须避免的。
   */
  function pruneOffPath(need) {
    if (!doc) return false
    const onPath = new Set(chainTo(doc.leaf).map((n) => n.id))
    const cand = Object.keys(doc.nodes)
      .filter((k) => !onPath.has(k))
      .sort((a, b) => doc.nodes[a].seq - doc.nodes[b].seq)
    let removed = 0
    for (const k of cand) {
      if (removed >= need) break
      if (childrenOf(k).length) continue       // 有后代的不删，否则它们会悬空
      delete doc.nodes[k]
      removed++
    }
    return removed > 0
  }

  function trim() {
    if (!doc) return false
    const total = Object.keys(doc.nodes).length
    if (total <= maxNodes) return false
    return pruneOffPath(total - maxNodes)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 多会话
  // ═══════════════════════════════════════════════════════════════════════

  function sessions() {
    return index().map((x) => ({
      id: x.id, title: x.title, at: x.at, count: x.count || 0,
      active: x.id === currentId,
    }))
  }

  function switchSession(id) {
    if (!id || (currentId && id === currentId)) return !!currentId
    if (!index().some((x) => x && x.id === id)) return false
    currentId = id
    doc = loadDoc(id)
    emit()
    return true
  }

  function renameSession(id, title) {
    const list = index()
    const rec = list.find((x) => x && x.id === id)
    if (!rec) return false
    rec.title = String(title || '').slice(0, 24) || '新对话'
    write(kIndex, list)
    if (doc && doc.id === id) { doc.title = rec.title; save() }
    emit()
    return true
  }

  function deleteSession(id) {
    const list = index().filter((x) => x && x.id !== id)
    try { if (storage) storage.removeItem(kConv(id)) } catch (e) { /* ignore */ }
    write(kIndex, list)
    if (currentId === id) {
      currentId = null
      doc = null
      ensure()
    }
    emit()
    return true
  }

  /** 开一个新会话（菜单里的「新对话」用它，而不是 clear——后者只是清空当前会话） */
  function newSession(title) {
    return create(title)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 兼容旧 API
  // ═══════════════════════════════════════════════════════════════════════

  /** 取当前会话的**投影**（即"当前分支"的 OpenAI messages） */
  function messages() {
    ensure()
    return projection()
  }

  /**
   * 清空**当前会话的消息**（保留会话本身，重置成一棵空树）。
   * ★ 必须显式重建树：合并语义下 `replaceAll([])` 是不动的，用它实现"清空"
   *   会出现"点了新对话、刷新之后全回来了"。
   */
  function clear() {
    ensure()
    doc = blankDoc(doc.id, '新对话')
    write(kConv(doc.id), doc)
    touchIndex({ count: 0, leaf: null, title: '新对话' })
    emit()
  }

  /** 删除全部本地数据（设置页的"清除本机数据"要用） */
  function clearAll() {
    for (const rec of index()) {
      try { if (storage) storage.removeItem(kConv(rec.id)) } catch (e) { /* ignore */ }
    }
    try { if (storage) storage.removeItem(kIndex) } catch (e) { /* ignore */ }
    currentId = null
    doc = null
    emit()
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 变更通知
  // ═══════════════════════════════════════════════════════════════════════

  function emit() {
    for (const cb of [...listeners]) {
      try { cb() } catch (e) { /* 单个订阅者异常不应影响存储 */ }
    }
  }

  /** 订阅变更，返回取消函数（**数组**而非单槽位——单槽位会被后注册者静默顶掉） */
  function onChange(fn) {
    if (typeof fn !== 'function') return () => {}
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  /** 统计（面板状态栏用） */
  function stats() {
    ensure()
    return {
      sessions: index().length,
      nodes: doc ? Object.keys(doc.nodes).length : 0,
      onPath: doc ? chainTo(doc.leaf).length : 0,
      forks: doc ? forkPoints().length : 0,
      persist,
    }
  }

  return {
    // ---- 兼容旧 API ----
    create, ensure, messages, append, replaceAll, clear, clearAll, index,
    get currentId() { return currentId },
    /** 供测试 */
    _setCurrent: (id) => {
      currentId = id
      doc = id ? loadDoc(id) : null
    },
    // ---- 树 ----
    path, projection, nodeById, activeLeafId: () => (doc ? doc.leaf : null),
    appendNode, appendCard, patchNode,
    childrenOf, siblings, branchDepth, forkPoints,
    branchFrom, switchLeaf, ensureValid,
    // ---- 多会话 ----
    newSession, switchSession, renameSession, deleteSession, sessions,
    // ---- 其它 ----
    onChange, stats, save,
    /** 当前会话标题（面板头部显示） */
    get title() { return doc ? doc.title : '' },
  }
}

export default createConversationStore
