/**
 * tool-registry.js — 工具注册表（两层设计 + 节点白名单执行）
 *
 * ★ 本文件是「约束靠工具白名单，不靠提示词劝说」这条硬约定的落地点。
 *   constraints.js 声明了每个决策节点能做什么；本文件负责让它**在结构上成立**：
 *     · 注册阶段：按节点过滤工具定义 → 模型**看不到**不允许的工具
 *     · 执行阶段：再次比对白名单 → 即使模型凭空吐出被禁的名字，也执行不了
 *   两道关卡是刻意的。只做第一道，一旦模型从别处（历史消息、知识条目）
 *   学到一个工具名，就仍然可能调用；只做第二道，则白名单形同虚设于上下文，
 *   模型会不断尝试被拒的工具，浪费轮次。
 *
 * ★ 两层工具设计（token 效率与选择准确率的关键）：
 *   第一层：语义清晰的少量工具，常驻上下文（查 / 演 / 教 / 评）。
 *   第二层：动作词汇表（~20 个操控动作）**不进常驻上下文**，模型需要时用
 *           listSceneActions 一类工具按需拉取。参数字典同理（listModuleSettings）。
 *   词汇表全塞进系统提示是灾难；按需拉取才是渐进式披露在"动作层"的落点。
 *
 * ★ 防幻觉的结构性保障：工具返回的是"事实"（由程序确定性计算），
 *   模型只负责组织语言。依赖未就绪时返回明确的不可用信息，而不是编造结果——
 *   这条约定由调用方提供的 handler 保证，注册表负责"不吞掉错误、不伪造成功"。
 *
 * 来源：orbit/H5/js/agent/tool-registry.js（443 行）的 execute/need 机制与两层设计；
 * 新增了节点白名单过滤与执行期二次拒签（orbit 原实现 14 个工具无条件全暴露，
 * 没有按节点授权裁剪——这是接入共享核时必须补上的一环）。
 */
// ★ 这里的每一段文字都会作为**工具结果回灌给模型**（拒绝理由、异常说明），
//   不是 DOM 文本 ⇒ 全部走 t()。
// ★ 自己 import 字典（副作用即 registerDict），不依赖入口替你注册
import '../i18n.js'
import { t } from '../../i18n/index.js'
import { resolveTools } from '../nodes/constraints.js'

/**
 * 创建工具注册表。
 *
 * @param {Object}   opts
 * @param {Object}   opts.tools     本模块贡献的工具定义，按类别分组：
 *                                  { read: [...], query: [...], hand: [...], teach: [...] }
 *                                  每项为 OpenAI function-calling 格式（{type:'function',function:{...}}）
 * @param {Object}   opts.handlers  { 工具名: (args) => result }。result 为 null 视为 {ok:true}
 * @param {Function} [opts.onMissing] 可选：发现"白名单允许但本模块未实现"的工具时回调，便于暴露偏差
 */
export function createToolRegistry(opts = {}) {
  const tools = opts.tools || {}
  const handlers = opts.handlers || {}

  /** name → 定义 */
  const defs = new Map()
  /** name → 类别（read/query/hand/teach） */
  const classOf = new Map()
  for (const [cls, list] of Object.entries(tools)) {
    for (const d of list || []) {
      const name = d && d.function && d.function.name
      if (!name) continue
      defs.set(name, d)
      classOf.set(name, cls)
    }
  }

  /** 本模块按类别贡献的工具名 */
  const namesByClass = {}
  for (const [name, cls] of classOf) (namesByClass[cls] || (namesByClass[cls] = [])).push(name)

  let currentNode = null
  let allowed = null   // Set<string> | null
  /**
   * ★ **本轮**工具白名单的快照（由 `freezeRound` / `endRound` 划定边界）。
   *
   * 为什么要快照：它让"**模型看到的工具**"与"**执行期放行的工具**"在一批
   *   `tool_calls` 内保持一致。否则模型可以在**同一条 assistant 消息**里先调用能改节点的
   *   工具（`declareIntent`）把自己提到 demo / teach 节点，紧接着调用原本拿不到的
   *   `applySceneActions` —— 执行期读的是已被改写的 `allowed`，于是"注册时看不到的、
   *   执行时被放行"。**"结构上无法越权"正是断在这里。**
   *   快照之后，节点切换只对**下一轮**生效。
   *   反方向的错配（宿主 UI 为了拿到 hand 权限而切节点、用户中途"回门户"导致注册表重建）
   *   也一并被它解决。
   */
  let frozen = null

  /**
   * 设定当前决策节点，据此裁决本次可用的工具。
   *
   * @param {string} nodeName  见 constraints.js 的 NODES
   * @param {Object} [extraByClass] 额外注入的工具名（按类别），用于**受控的跨模块联动**：
   *        例如在 explain / compare 节点上把关联模块的 query 工具一并放开。
   *        默认不注入 → 其余模块的工具不可见（避免模型答非所问地跨模块乱调）。
   * @returns {string[]} 本节点允许且本模块实现了的工具名
   */
  function setNode(nodeName, extraByClass) {
    currentNode = nodeName
    // ★ roles 是**当前模块**的角色映射（见 constraints.js 的 ROLE_SPEC）。
    //   必须与 tools 同源：注册表是按当前模块重建的，角色也跟着换，
    //   否则会出现"工具换了、角色还是上一个模块的"这种半新半旧状态。
    const names = resolveTools(nodeName, contribute(extraByClass), opts.roles || {})
    allowed = new Set(names)
    // 白名单允许但本模块没实现的，主动报出来（见 missing 的说明）
    const miss = missing()
    if (miss.length && typeof opts.onMissing === 'function') {
      try { opts.onMissing(miss, nodeName) } catch (e) { /* 探针失败不应影响注册 */ }
    }
    return available()
  }

  /** 把本模块贡献的工具名与额外注入的合并成 resolveTools 需要的形状 */
  function contribute(extraByClass) {
    const out = {}
    for (const cls of Object.keys(namesByClass)) out[cls] = namesByClass[cls].slice()
    for (const [cls, list] of Object.entries(extraByClass || {})) {
      out[cls] = (out[cls] || []).concat(list || [])
    }
    return out
  }

  /**
   * 白名单允许、但本模块**没有实现**的工具名。
   * ★ 这是给"声明与实现脱节"留的探针：descriptor 声明的能力若在代码里不存在，
   *   会在这里现形，而不是等到模型调用时才发现。
   */
  function missing(extraByClass) {
    if (!allowed) return []
    return [...allowed].filter((n) => !defs.has(n)).sort()
  }

  /** 本节点允许且已实现的工具名（排序，便于比对与 diff） */
  function available() {
    if (!allowed) return []
    return [...allowed].filter((n) => defs.has(n)).sort()
  }

  /**
   * 交给 LLM 的工具定义数组（**已按节点过滤**）。
   * 未设定节点时抛错而不是返回全集——宁可明确失败，也不要悄悄把全部工具交出去。
   */
  function definitions() {
    if (!allowed) throw new Error('尚未指定决策节点：工具白名单未裁决，拒绝暴露任何工具')
    return available().map((n) => defs.get(n))
  }

  /**
   * ★ 冻结 / 解冻**本轮**的白名单快照（见 `frozen` 的说明）。
   *
   * 由对话循环在"执行一批 tool_calls"的前后调用（见 core/conversation.js）。
   *
   * ★ 为什么边界的判据是**轮次**、而不是"下发了工具定义"：曾经把冻结绑在
   *   `definitions()` 上（想省掉一个调用点），结果是**任何"只 setNode 不 definitions
   *   就直接 execute"的调用方都会拿到过期快照** —— 测试里 `grade` 节点明明允许
   *   `diagnoseError` 却被拒，正是这么撞出来的。绑定在一个"通常会被调到"的函数上，
   *   就是在赌调用方的习惯；轮次是这件事**本身**的边界。
   */
  function freezeRound() { frozen = allowed ? new Set(allowed) : null }
  function endRound() { frozen = null }

  /**
   * 执行一个工具调用，返回可回灌给模型的结果对象。
   * ★ 永不抛异常：工具失败也作为**结果**回灌，让模型自行应对下一次尝试。
   *   把异常抛进对话循环会中断整轮，而模型本来是有机会改主意的。
   */
  async function execute(name, argsJson) {
    // 第一道之外的第二道：执行期再比对白名单。
    // ★ 读的是**本轮快照**（`frozen`）而不是当前的 `allowed`：本轮的工具定义正是按快照发出去的，
    //   执行期必须与它对齐。否则模型能在同一批 tool_calls 里先 `declareIntent` 切节点、
    //   紧接着调用原本拿不到的 `applySceneActions`（审计实证的一条提权通路）。
    const gate = frozen || allowed
    if (!gate || !gate.has(name)) {
      return {
        error: t('agent.tool.notAllowed', { name })
          + (currentNode ? t('agent.tool.notAllowedNode', { node: currentNode }) : '')
          + t('agent.tool.notAllowedAvailable', { tools: available().join(', ') }),
      }
    }
    const fn = handlers[name]
    if (typeof fn !== 'function') return { error: t('agent.tool.notImplemented', { name }) }

    let args
    try {
      args = typeof argsJson === 'string' ? JSON.parse(argsJson || '{}') : (argsJson || {})
    } catch (e) {
      return { error: t('agent.tool.badJson', { msg: (e && e.message) }) }
    }

    try {
      const r = await fn(args)
      return r == null ? { ok: true } : r
    } catch (err) {
      return { error: t('agent.tool.execError', { msg: (err && err.message ? err.message : String(err)) }) }
    }
  }

  return {
    setNode, definitions, execute, available, missing, freezeRound, endRound,
    names: () => [...defs.keys()].sort(),
    get node() { return currentNode },
    /** 供测试/调试：本轮冻结的白名单快照（未冻结时为空数组） */
    frozenNames: () => (frozen ? [...frozen].sort() : []),
    /** 供测试/调试：绕过白名单直接用某个 handler（**不要**在业务代码里用） */
    _raw: (name, args) => (handlers[name] ? handlers[name](args) : undefined),
  }
}

export default createToolRegistry
