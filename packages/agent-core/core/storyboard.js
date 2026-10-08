/**
 * storyboard.js — 分镜队列引擎：把「一次下发多个动作」变成「用户掌握节奏的分步演示」
 *
 * ★ 为什么需要队列：演示必须由用户点「下一步」推进，而用户的点击可能在几秒后、
 *   也可能几分钟后才来。工具调用不能干等——那会把整条对话循环一起冻住。
 *   所以改成「入队 + 立即返回」，播放交给后台，节奏由用户掌握。
 *
 * ★ 本文件是从 orbit/H5/js/agent/scene-bridge.js 抽出的**通用部分**（约第 175–885 行）。
 *   抽掉的是 orbit 私有的：20 个动作的 VOCAB、validate 的 switch、applyInstant/
 *   applyAnimated 的实现、中文动作名表、以及它对 window.OrbitApp / Orbit3D /
 *   Settings 的引用。这些全部改由创建参数注入。
 *
 * 保留下来的是真正的机制，且每一条都对应一个踩过的坑（注释里标了原因）：
 *   1. 每步执行前存快照 → 「上一步」靠快照还原，不靠反向执行（动作带副作用）
 *   2. 闸门放在**执行之前** → 让循环能从任意一步恢复（含"播完后回退"）
 *   3. stop() 必须唤醒**所有**等待中的 Promise（停留／动画／闸门），否则 await 永久挂住
 *   4. onProgress 订阅用**数组**，单槽位会被后注册者静默顶掉
 *   5. 只保留**动作数**上限，刻意不设挂钟上限（挂钟上限在自动连播下必然误伤）
 *   6. 播完保留队列与快照，才能「重新演示」与回退重看
 *   7. **演示记录独立于播放队列** → 停止/播完之后仍能重播、整改、被引用
 *   8. 分几次下发的步骤**并入同一条记录**（而非每次新开）→ 否则回放只播后半段
 *   9. 每一步有**稳定编号**（不是数组下标）→ "整改第 3 步"才指得准
 */
// ★ 本文件的文案有两类去向，且**都不进 DOM**：
//   ① 工具回执里的 `note`（告诉模型"已入队、别重复下发"）→ 进模型上下文
//   ② 拒绝理由（`{ ok:false, error }`）→ 由面板渲染成气泡文字、也可能被模型读到
//   故全部走 t()；`text` 表在这里无用。
// ★ 自己 import 字典（副作用即 registerDict），不依赖入口替你注册
import '../i18n.js'
import { t } from '../../i18n/index.js'

/** 默认配置（数值来自 orbit 原实现，均为实测调过的值） */
export const STORYBOARD_DEFAULTS = {
  maxActionsPerTurn: 12,   // 单轮动作数上限
  maxQueue: 24,            // 播放队列上限（分几次下发时的累计步数）
  defaultDwellMs: 1200,    // 自动连播时，瞬时动作的"看一眼"停留
  minDwellMs: 350,
  maxDwellMs: 5000,
  afterAnimatedMs: 450,    // 动画播完后的落点停顿
}

/**
 * 创建分镜引擎。
 *
 * @param {Object}   opts
 * @param {Function} opts.validate      必需：(name, params) => { params } | { err }
 *                                      参数错的步骤**当场退回，不入队、不占用户的一次点击**
 * @param {Function} opts.applyStep     必需：(name, params, ctx) => { ok, error? } | Promise<同>
 *                                      ctx = { isDead() }，长动画应周期性检查它并在作废时提前退出
 * @param {Object}   [opts.vocabulary]  { actionName: { animated, concept, label } }；
 *                                      可后续用 setVocabulary() 更换（切模块时）
 *                                      animated=true 的步骤走 applyStep 的异步路径
 * @param {Function} [opts.describe]    (name, params) => 给人看的中文动作名。默认取 vocabulary.label 或原名
 * @param {Function} [opts.capture]     () => snapshot|null，抓一份"足以完整还原视图"的快照
 * @param {Function} [opts.restore]     (snapshot) => boolean，还原快照
 * @param {Function} [opts.getDefaultPlayback] () => 'manual' | 'auto'，默认 'manual'
 * @param {Function} [opts.onStop]      可选：stop() 时通知模块取消自己的在飞动画
 * @param {Object}   [opts.timers]      可选：{ setTimeout, clearTimeout }，便于测试注入假时钟
 */
export function createStoryboard(opts = {}) {
  const {
    validate, applyStep, describe, capture, restore,
    getDefaultPlayback, onStop, timers,
  } = opts
  /**
   * 动作词汇表。★ 可变：多模块共用一个引擎时，切换模块必须换词汇表——
   * 否则模型看到的是上一个模块的动作，animated/concept 判定也会串台。
   */
  let vocabulary = opts.vocabulary || {}

  if (typeof validate !== 'function') throw new Error('createStoryboard 需要 opts.validate')
  if (typeof applyStep !== 'function') throw new Error('createStoryboard 需要 opts.applyStep')

  const cfg = Object.assign({}, STORYBOARD_DEFAULTS, opts.config || {})
  const setT = (timers && timers.setTimeout) || setTimeout
  const clearT = (timers && timers.clearTimeout) || clearTimeout

  const clampNum = (v, lo, hi) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null
  }
  const label = (name, params) => {
    if (typeof describe === 'function') return describe(name, params)
    const v = vocabulary[name]
    return (v && v.label) || name
  }

  // ---------------------------------------------------------------------------
  // 运行状态
  // ---------------------------------------------------------------------------
  let generation = 0            // 运行代号：区分"哪一次播放"
  let dwellTimer = null         // 自动连播的停留定时器
  let pendingWait = null        // 连播停留的 resolve（stop() 必须唤醒它）
  let gateResolve = null        // 「下一步」闸门的 resolve（最要紧的一个）
  const progressHooks = []      // 播放进度回调（**数组**，见文件头第 4 条）

  // ---- 播放列表（分镜）----
  let queue = []                // [{ name, params, speech, holdMs, animated }]
  let qIndex = 0                // 下一步待执行的下标
  let qTotal = 0                // 本轮播放的总步数
  let playing = false
  let manual = true             // true=等用户点「下一步」；false=自动连播
  let atGate = false            // 是否正停在闸门上（只有此时才允许回退）
  let snapshots = []            // 每步执行前的快照，专供「上一步」

  /**
   * **演示前**的完整状态，供「回到演示前」一键还原。
   *
   * ★ 与 `snapshots[0]` 的区别（两者语义相近但生命周期不同）：
   *   `snapshots` 会被 `stop()` 清空，而 `stop()` 恰恰是"学生中途放弃"的常见结局
   *   ——那时更该让他回到演示前。故单存一份，**不随 stop 清理**；
   *   只在**下一轮演示开始**时被覆盖。
   */
  let beforeSnap = null

  /**
   * 步骤**稳定编号**。★ 不能用数组下标——下标会随播放、插入、删除漂移，
   * 而"整改第几步"必须有一个不动的锚：模型说的"第 3 步"与学生看到的"第 3 步"
   * 必须始终指同一步，无论它当时在队列的第几位。
   */
  let stepSeq = 0

  /**
   * ★ **演示记录**（独立于播放队列）。
   *
   *   为什么必须有这一层：`stop()` 会清空 `queue` 与 `snapshots`，而 `replay()`
   *   原先正是靠它们工作——于是**「结束」之后就无法回放**（实测：点结束后 queue
   *   变空，再点「重新演示」什么也不发生，只是静默无效）。
   *
   *   参考实现（orbit 的 scene-bridge）的做法是：**队列只是演示记录的一次放映**。
   *   `demos[id] = { steps, mode, ts }` 在入队时存一份，此后无论播完、停止还是
   *   被新演示顶掉，都能从记录里重新放映。chem-agent 把它抽成共享 storyboard 时
   *   漏掉了这一层，此处补齐。
   *
   *   demoId 形如 `d1`/`d2`，且**取号前与现有记录比对**——纯递增计数器在
   *   刷新后会撞号（orbit 实测过：8 步的记录被追加成 16 步）。
   */
  const demos = new Map()
  let demoSeq = 0
  /**
   * 当前**正在写入**的记录号。null 表示"下一次 applySequence 会新开一条"。
   * ★ 由 stop() 清空：stop() 意味着这一轮演示到此为止，之后再来的是新演示。
   *   正在播时不调 stop()，于是分几次下发的步骤会续写进同一条记录——
   *   这正是"长流程分次下发"（constraints.js 明确要求）不会把一条演示拆成两条的原因。
   */
  let curDemoId = null

  /** 取一个未被占用的演示编号 */
  function nextDemoId() {
    let n = demoSeq + 1
    while (demos.has('d' + n)) n++
    demoSeq = n
    return 'd' + n
  }

  /** 最近一次演示记录 */
  function latestDemo() {
    let best = null
    for (const rec of demos.values()) {
      if (!best || rec.ts > best.ts) best = rec
    }
    return best
  }

  /**
   * 注册播放进度回调：(evt) => void，返回取消订阅函数。
   * ★ 用数组而不是单个槽位：单槽位时后注册者会**静默顶掉**先注册者
   *   （面板就是先注册的那个），表现为"进度条突然不更新了"，极难排查。
   */
  function onProgress(fn) {
    if (typeof fn !== 'function') return function () {}
    progressHooks.push(fn)
    return function off() {
      const i = progressHooks.indexOf(fn)
      if (i >= 0) progressHooks.splice(i, 1)
    }
  }

  function emitProgress(evt) {
    for (let i = 0; i < progressHooks.length; i++) {
      try { progressHooks[i](evt) } catch (e) { /* 单个订阅者异常不应影响演示 */ }
    }
  }

  /**
   * 中止当前播放。
   * ★ 必须同时做到五件事，缺一不可：① 播放循环作废 ② 清空队列
   *   ③ 取消停留定时器 ④ **唤醒所有等待中的 Promise** ⑤ 通知面板收起进度条
   *   第 ④ 条最容易被漏掉：只 clearTimeout 而不 resolve，对应的 await 会永远挂住。
   *   闸门尤其致命——点「停止」本意是退出，结果反而锁死。
   */
  function stop() {
    generation++                                  // 旧循环下次检查时自行退出
    queue = []
    qIndex = 0
    qTotal = 0
    playing = false
    atGate = false
    snapshots = []
    curDemoId = null              // 这一轮演示到此为止，之后再来的是新演示
    if (dwellTimer) { clearT(dwellTimer); dwellTimer = null }
    if (pendingWait) { const r = pendingWait; pendingWait = null; r() }
    if (gateResolve) { const r = gateResolve; gateResolve = null; r() }
    if (typeof onStop === 'function') { try { onStop() } catch (e) { /* 忽略 */ } }
    emitProgress({ phase: 'stopped' })
  }

  /** 可被 stop() 立刻唤醒的停留（自动连播模式用） */
  function wait(ms) {
    return new Promise((resolve) => {
      if (ms <= 0) return resolve()
      pendingWait = () => { pendingWait = null; resolve() }
      dwellTimer = setT(() => {
        dwellTimer = null
        const r = pendingWait
        pendingWait = null
        if (r) r()
      }, ms)
    })
  }

  /** 「下一步」闸门：一直等到用户点按钮、或切连播、或点停止 */
  function waitGate() {
    return new Promise((resolve) => { gateResolve = resolve })
  }
  function releaseGate() { if (gateResolve) { const r = gateResolve; gateResolve = null; r() } }

  /** 用户点了「下一步」 */
  function next() { atGate = false; releaseGate() }

  /** 用户点了「连续播放」：后续步骤不再等确认 */
  function autoPlay() {
    manual = false
    atGate = false
    if (playing) emitProgress({ phase: 'auto', index: qIndex + 1, total: qTotal })
    releaseGate()
  }

  /**
   * 用户点了「上一步」：回到上一步执行**之前**的状态。
   *
   * ★ 停在闸门上时：只改下标与画面，**刻意不释放闸门**——闸门一放开，循环就会
   *   立刻重新执行那一步，等于白退。
   * ★ 演示已结束时：说明循环已退出，于是重新起一个循环并 parkImmediately=true
   *   让它先停在闸门上。这样"播完之后还能退回去重看"才成立。
   * ★ 判据是「**是否真的在连播中**」，不是「是否手动模式」。
   *   原实现硬要求 `manual`，而连播结束后 `manual` 仍是 false —— 于是"播完了想
   *   倒回去重看某一步"被直接拒掉（实测反馈：连续播放结束后点「上一步」没反应）。
   *   此刻演示已经停了，学生想回退是明确意图，自动切回手动逐步即可。
   */
  function prev() {
    if (!queue.length) return { ok: false, error: t('agent.sb.noPrev') }
    if (playing && !manual && !atGate) {
      return { ok: false, error: t('agent.sb.prevAuto') }
    }
    if (playing && !atGate) return { ok: false, error: t('agent.sb.prevPlaying') }
    if (qIndex <= 0) return { ok: false, error: t('agent.sb.prevFirst') }
    if (!manual) manual = true          // 播完回退 → 回到手动逐步，canPrev/canNext 同步一致
    qIndex--
    if (typeof restore === 'function') restore(snapshots[qIndex])
    if (!playing) {
      playing = true
      runQueue(generation, false, true)   // 先停在闸门上，不立刻执行
    }
    emitProgress({
      phase: 'back', index: qIndex, total: queue.length,
      /**
       * ★ 两个字段分开，别混为一个：
       *   · `at` —— 退回之后画面**停在**哪一步（该步已执行、效果还在）。主文字要显示它，
       *     否则会出现"点一下上一步、文字没变"：done 时显示的是最后一步的旁白，
       *     而 `step`（下一步要重播的那步）恰好也是那一步的旁白，看起来像没动
       *     （实测反馈：要退两下文字才变）。
       *   · `step` —— 下一步会**重播**的那步（给学生"点下一步会发生什么"的预告）。
       */
      at: queue[qIndex - 1]
        ? { action: queue[qIndex - 1].name, label: label(queue[qIndex - 1].name, queue[qIndex - 1].params), speech: queue[qIndex - 1].speech }
        : null,
      step: queue[qIndex]
        ? { action: queue[qIndex].name, label: label(queue[qIndex].name, queue[qIndex].params), speech: queue[qIndex].speech }
        : null,
    })
    return { ok: true, index: qIndex, total: queue.length }
  }

  /** 供智能体/感知层查询当前播放状态 */
  function state() {
    const rec = curDemoId ? demos.get(curDemoId) : null
    return {
      playing,
      mode: manual ? 'manual' : 'auto',
      index: qIndex,                            // 已执行步数
      total: qTotal,
      waitingForUser: atGate,                   // 是否正停在「下一步」闸门上
      // ★ 不再要求 `manual`：判据是"有没有停着可供回退的状态"。
      //   连播中（playing 且不在闸门）自然为 false；播完后为 true，与 prev() 的
      //   新判据一致 —— 否则会出现"按钮灰着但命令其实允许"或反之的不一致。
      canPrev: qIndex > 0 && (!playing || atGate),
      canNext: atGate && qIndex < queue.length,
      canReplay: !playing && queue.length > 0,  // 播完后可重播
      /**
       * ★ 是否可以「回到演示前」。
       *   判据是"有没有捕获到演示前状态"，**与当前是否在播放无关**——
       *   演示播完、或中途 stop 掉，都能回到之前的样子（这正是学生最需要的时刻：
       *   演示动了他费心调好的图层与视角，而他已经不想看了）。
       */
      canRestoreBefore: beforeSnap != null,
      demoId: curDemoId,
      origin: rec ? rec.origin : null,
      /**
       * ★ 整条演示的**完整清单**（不只未来步骤）——这是"整改第 M 步"能成立的前提。
       *   原实现只给 `queue.slice(qIndex)` 的 `{action, speech}`：已执行的看不到、
       *   没有参数、没有稳定步号，于是模型说不出"第 3 步把配位数标成了几"，
       *   整改也就无从谈起。
       *   `i` 是**当前队列下标**（会随插删漂移，仅供面板定位），
       *   `id` 才是**稳定步号**（修订时用它指认，不随插删变化）。
       */
      steps: queue.map((s, i) => ({
        i, id: s.id, action: s.name, params: s.params,
        speech: s.speech || null, done: i < qIndex,
      })),
      pending: queue.slice(qIndex).map((s) => ({ action: s.name, speech: s.speech || null })),
    }
  }

  /**
   * 切到「自动连播」或「逐步」。
   * ★ 必须有一个**从连播切回逐步的出口**：orbit 实测过——`manual` 原先只降不升，
   *   于是学生点过一次「连续播放」之后，此后所有演示都只能一路播完，
   *   而界面上没有任何按钮能把节奏改回来。
   */
  function setManual(v) {
    const on = v !== false
    if (manual === on) return { ok: true, manual }
    manual = on
    if (manual) {
      emitProgress({ phase: 'manual', index: qIndex, total: queue.length })
    } else {
      autoPlay()
    }
    return { ok: true, manual }
  }

  /** 队列清单（给面板与修订用）：含稳定步号与执行状态 */
  function queueInfo() {
    return queue.map((s, i) => ({
      i, id: s.id, action: s.name, params: s.params,
      speech: s.speech || null, holdMs: s.holdMs, done: i < qIndex,
    }))
  }

  /** 取队列里第 i 步（含稳定步号） */
  function getStep(i) {
    const n = Number(i)
    if (!Number.isInteger(n) || n < 0 || n >= queue.length) return null
    return queueInfo()[n]
  }

  /**
   * 下发一组动作。
   *
   * @param {Array}  actions [{ action, params, speech, holdMs }]
   * @param {Object} [o]
   * @param {boolean} [o.auto]       true=自动连播并等走完（脚本回放用）
   * @param {boolean} [o.noPacing]   auto 模式下不等停留
   * @param {string}  [o.origin]     'agent' | 'script' | 'proactive'，记进演示记录
   * @param {string}  [o.label]      演示标题（缺省时从首条有旁白的步骤里取）
   */
  async function applySequence(actions, o) {
    o = o || {}
    const raw = (actions || []).slice(0, cfg.maxActionsPerTurn)
    const dropped = Math.max(0, (actions || []).length - cfg.maxActionsPerTurn)
    const origin = o.origin || 'agent'

    // ---- 先全部校验：参数错的步骤当场退回，不入队、不占用户的一次点击 ----
    // ★ 同时产出 `perAction`：**与模型原始数组下标一一对应**的受理表（含失败项）。
    //   为什么需要它：动作气泡渲染的是模型给的**原始**数组，而队列里只有校验通过的
    //   部分，两者会错位（模型发了 6 个动作、其中 2 个参数非法，气泡仍有 6 行，
    //   队列只有 4 步）。「引用第 M 步」这个功能完全靠它——气泡上第 i 行要靠
    //   `perAction[i].stepIndex` 才知道自己在演示里是第几步。
    //   它随工具回执一并存档，所以**刷新之后引用依然准确**。
    const okSteps = []
    const failed = []
    const perAction = []
    /**
     * ★★ 2026-10-08：整批动作**绑定到"下发时所在的模块"**。
     *
     *   用户报「在思考中时返回主界面，会导致动作请求失败」：动作是在轨道模块下组好的，
     *   但用户切回门户后模块页面卸载，播放时 `applyActions` 只会回一句
     *   「不在页面上」——于是整轮以失败收场。
     *   根因是步骤里**没有模块归属**，播放时只能拿"此刻的模块"去套，切了板块就套错。
     *   现在每步都带 `module`，播放前据此把目标模块就位（见 app.js 的 applyStep）。
     */
    const batchModule = o.module || null
    for (let i = 0; i < raw.length; i++) {
      const a = raw[i]
      const name = a && a.action
      const stepModule = batchModule || (a && a.module) || null
      const v = validate(name, (a && a.params) || {}, stepModule)
      if (v.err) {
        failed.push({ action: name, error: v.err, i })
        perAction.push({ i, action: name, ok: false, error: v.err })
        continue
      }
      perAction.push({ i, action: name, ok: true, okIndex: okSteps.length })
      okSteps.push({
        id: ++stepSeq,
        name,
        params: v.params,
        speech: a && a.speech,
        holdMs: clampNum(a && a.holdMs, cfg.minDwellMs, cfg.maxDwellMs),
        animated: !!(vocabulary[name] && vocabulary[name].animated),
        module: stepModule,
      })
    }
    /**
     * 把 `okIndex`（在"通过校验的动作序列"里的下标）换算成 `stepIndex`
     * （在这条演示里的**绝对**步号），并给被队列上限截掉的项改判为失败。
     * @param {number} start    本批第一步的绝对步号
     * @param {number} accepted 本批实际入队的步数
     */
    function bindPerAction(start, accepted) {
      for (const pa of perAction) {
        if (!pa.ok) continue
        if (pa.okIndex >= accepted) {
          pa.ok = false
          pa.error = t('agent.sb.overflow', { max: cfg.maxQueue })
        } else {
          pa.stepIndex = start + pa.okIndex
        }
      }
      return perAction
    }
    if (!okSteps.length) return { executed: [], failed, perAction, accepted: 0, dropped }

    // ★ 捕获"演示前状态"（供「回到演示前」用）。
    //   位置很关键：必须在 stop() **之后**——stop 会清空队列与快照，
    //   而我们要记的是"这一轮演示开始之前"的视图状态。
    //   只在**全新一轮**（!playing）时捕获：分次下发的续写要共用同一个起点，
    //   否则"回到演示前"会退到中途某个状态。
    const captureBefore = () => {
      if (typeof capture === 'function') {
        try { beforeSnap = capture() } catch (e) { beforeSnap = null }
      }
    }

    // ---- 自动连播：走完再返回 ----
    if (o.auto) {
      stop()
      captureBefore()
      const gen = generation
      // ★ `manual` 必须**保存后恢复**（try/finally）。这是 orbit 实测过的坑：原先直接
      //   置 false 且不恢复，于是"跑过一次内置演示（连播）之后，学生再让智能体演示
      //   任何东西都只能一路播完"——而界面上没有任何入口能改回逐步。
      //   本项目目前没有调用方传 `auto: true`（playDemo / 主动服务都走手动），
      //   属于潜伏缺陷；既然动到这块就一并修好，并用断言守住。
      const prevManual = manual
      manual = false
      queue = okSteps
      qIndex = 0
      qTotal = okSteps.length
      playing = true
      const demoId = noteSteps(okSteps, origin, o.label)
      bindPerAction(0, okSteps.length)
      try {
        const r = await runQueue(gen, !o.noPacing)
        return Object.assign(r, {
          failed: failed.concat(r.failed || []), dropped, perAction, demoId, total: qTotal,
        })
      } finally {
        manual = prevManual
      }
    }

    // ---- 手动模式（默认）：入队 + 立即返回 ----
    // ★ 「入队即返回」不等于「什么都不执行」：正常路径下**第一个动作立即执行**，
    //   闸门出现在它之后（见 runQueue 里 skipGate = !parkImmediately）。
    //   效果是模型的第一笔立刻可见（用户不必先点一次才看到反应），其余步骤再逐步确认。
    //   只有 prev() 重启循环时会传 parkImmediately=true，让它先停在闸门上而不执行。
    //   这个 off-by-one 在测试里踩过一次，故在此写明。
    // 正在播就追加（分几次下发也能接成一条完整的分镜），否则重开一轮
    if (!playing) {
      stop()
      captureBefore()
      queue = []
      qIndex = 0
      // 默认播放方式由模块设置决定；演示条上还能临时改成连播
      manual = (typeof getDefaultPlayback === 'function' ? getDefaultPlayback() : 'manual') !== 'auto'
    }
    const room = cfg.maxQueue - qIndex
    const taken = okSteps.slice(0, Math.max(0, room))
    const overflow = okSteps.length - taken.length
    const startIndex = queue.length       // 本批第一步在这条演示里的**绝对**步号
    queue = queue.concat(taken)
    qTotal = queue.length

    if (!playing) {
      playing = true
      const gen = generation
      runQueue(gen, false)             // 后台播放，不 await
    } else {
      emitProgress({ phase: 'queued', index: qIndex, total: qTotal, added: taken.length })
    }

    // ★ 把本批步骤**并入当前这条演示记录**（而不是每次新开一条）。
    //   见 noteSteps 的注释：这是"分几次下发的同一条演示不会被拆成两条"的关键。
    const demoId = noteSteps(taken, origin, o.label)
    bindPerAction(startIndex, taken.length)

    return {
      executed: [],
      failed,
      perAction,
      accepted: taken.length,
      queued: taken.length,
      overflow: overflow || undefined,
      dropped: dropped || undefined,
      manual,
      total: qTotal,
      demoId,
      // ★ 这段是给模型看的：告诉它不要重复下发同样的动作，并交代节奏控制手段。
      //   少了它，模型会在用户还没点「下一步」时把同一组动作再发一遍。
      note: t('agent.sb.queued', { queued: taken.length, total: qTotal })
        + (manual ? t('agent.sb.queuedManual') : t('agent.sb.queuedAuto')),
    }
  }

  /**
   * 把一批已校验的步骤**新建或续写**到演示记录里，返回记录号。
   *
   * ★ 为什么是"续写"而不是"每次新建"：constraints.js 明确要求长流程**分几次下发**
   *   （单次 4–8 步）。若每次 applySequence 都新开一条记录，队列是连续的一条、
   *   记录却被拆成 d1（前 4 步）+ d2（后 4 步）——于是 `replay(demoId)` **只重播
   *   后半段**，而且**不会报任何错**，只是放出来的东西少了一半。
   *
   * ★ `rec.ts` 每次都要刷新：`latestDemo()` 靠 ts 取最近一条，不刷新的话
   *   `replay()`（省略 demoId 时）会指到别的记录上去。
   *
   * @param {Array}  steps  已校验的步骤（带 id）
   * @param {string} origin 'agent' | 'script' | 'proactive'
   * @param {string} [label] 演示标题；缺省从首条有旁白的步骤里取（截 28 字）
   * @returns {string|null} demoId
   */
  function noteSteps(steps, origin, label) {
    if (!steps || !steps.length) return null
    let rec = curDemoId ? demos.get(curDemoId) : null
    if (!rec) {
      const id = nextDemoId()
      rec = {
        id,
        origin: origin || 'agent',
        label: '',
        live: true,          // live=true：本次会话内产生的记录（区别于从历史重建的）
        ts: Date.now(),
        mode: manual ? 'manual' : 'auto',
        steps: [],
      }
      demos.set(id, rec)
      curDemoId = id
    }
    for (const s of steps) rec.steps.push(Object.assign({}, s))
  // ★ 记录级的模块归属（见 loadDemo 那段说明）：本批第一步属于哪个模块就记哪个。
  if (!rec.module) {
    const withMod = steps.find((s) => s && s.module)
    if (withMod) rec.module = withMod.module
  }
    if (!rec.label) {
      if (label) rec.label = String(label).slice(0, 28)
      else {
        const withSpeech = rec.steps.find((s) => s.speech)
        if (withSpeech) rec.label = String(withSpeech.speech).slice(0, 28)
      }
    }
    rec.mode = manual ? 'manual' : 'auto'
    rec.ts = Date.now()
    return rec.id
  }

  /**
   * 后台播放循环。gen 是本轮的运行代号：stop() 会让它作废。
   * @param {boolean} paced          是否在自动连播时插入停留
   * @param {boolean} parkImmediately 首次就停在闸门上（prev() 重启循环时用）
   * @param {number}  [ffTo]         快进到第几步（整改后重播用）
   * @returns {Promise<{executed:Array, failed:Array, aborted:boolean}>}
   */
  async function runQueue(gen, paced, parkImmediately, ffTo) {
    const executed = []
    const failed = []
    const dead = () => gen !== generation
    // ★ 刻意不设"总时长上限"。曾有过一条 25 秒的单轮上限，但它在自动连播下必然误伤：
    //   24 步 × 1.2 秒本来就 > 25 秒，一段正常的长演示会被从中间砍掉。
    //   现在只保留**动作数**上限——能用步数表达的约束就不用挂钟表达：步数是确定的，
    //   时长取决于设备与动画时长，不可预期。要提前结束，用户点「停止」即可。
    // ★ 闸门放在**执行之前**（而不是执行完之后）。两种写法在逐步前进时等价，
    //   但"先闸门"让循环能从任意一步恢复：从已结束状态点「上一步」时重启循环
    //   并 parkImmediately=true，就会先停在闸门上而不会立刻执行。
    let skipGate = !parkImmediately

    // ★ **快进**（整改某一步之后的重播要用）。三条必须同时成立：
    //   ① 快进段**照常执行、照常存快照**，只是不留停留——不能"跳过不执行"，
    //      否则到达改动点时画面是错的，而「上一步」也会退到一个错的状态；
    //   ② 到达改动点后**强制停一次闸门**——连播模式下闸门本不会打开，
    //      可学生正等着看"这一步改成了什么样"；
    //   ③ 强制只生效一次（过闸即清），否则后面每一步都会停下来。
    const fastTo = Math.max(0, Math.min(Number(ffTo) || 0, queue.length))
    let forceGate = fastTo > 0
    if (forceGate) emitProgress({ phase: 'fastforward', to: fastTo, total: queue.length })

    while (qIndex < queue.length) {
      if (dead()) return { executed, failed, aborted: true }
      const ff = qIndex < fastTo          // 本步是否处于快进段

      // ★ `&& manual` 不能少：自动连播时**绝不能**进闸门，否则第二步就会停在那里
      //   永远等一个没人会点的「下一步」——整个演示挂死。
      //   `!ff` 同样不能少：快进途中开闸就会停在第一步，"快进"就失去意义了。
      if (!skipGate && !ff && (manual || forceGate)) {
        atGate = true
        emitProgress({
          phase: 'waiting', index: qIndex, total: queue.length, canPrev: qIndex > 0,
          next: {
            action: queue[qIndex].name,
            label: label(queue[qIndex].name, queue[qIndex].params),
            speech: queue[qIndex].speech,
          },
        })
        await waitGate()
        atGate = false
        forceGate = false                 // 一次性：过了这道闸就不再强制停
        if (dead()) return { executed, failed, aborted: true }
      }
      skipGate = false

      const st = queue[qIndex]
      const v = vocabulary[st.name] || {}
      emitProgress({
        phase: 'step', index: qIndex + 1, total: queue.length, action: st.name,
        label: label(st.name, st.params), speech: st.speech,
        concept: v.concept, ok: true, manual, fast: ff,
      })

      // ★ 执行前先存快照：这是「上一步」能把画面退回原样的唯一依据。
      //   快进段**同样要存**——否则整改后从快进点往回退会退到错的状态。
      if (typeof capture === 'function') snapshots[qIndex] = capture()

      const r = await applyStep(st.name, st.params, Object.assign({}, st, { isDead: dead }))
      if (dead()) return { executed, failed, aborted: true }
      const one = r && r.ok ? { action: st.name } : { action: st.name, error: (r && r.error) || t('agent.sb.execFailed') }
      ;(r && r.ok ? executed : failed).push(one)

      qIndex++
      if (dead()) return { executed, failed, aborted: true }

      // 快进段不留停留；自动连播时：动画自带时长，播完只需落点停顿；
      // 瞬时动作按"看一眼"的时长停留
      if (!manual && paced && !ff && qIndex < queue.length) {
        const hold = st.holdMs || (st.animated ? cfg.afterAnimatedMs : cfg.defaultDwellMs)
        await wait(hold)
        if (dead()) return { executed, failed, aborted: true }
      }
    }

    // ★ 播完**保留队列与快照**：不清掉才能让用户「重新演示」或退回去重看。
    //   真正的清理交给 stop()。
    playing = false
    atGate = false
    qIndex = queue.length
    emitProgress({ phase: 'done', total: qTotal, canReplay: queue.length > 0, canPrev: qIndex > 0 })
    return { executed, failed, aborted: false }
  }

  /**
   * 把一个外部步骤对象校验并转成内部步骤。
   * @returns {{err:string}|{id:number,name:string,params:Object,speech:string,holdMs:number|null,animated:boolean}}
   */
  function toStep(s) {
    // ★ 同时认两种形状：外部/工具给的是 `action`，而**演示记录里存的是内部步骤**（`name`）。
    //   回放与整改都是从记录取步骤，只认 `action` 会让它们全部校验失败——
    //   表现为"点重播什么也没发生"，且不报错（这一条被 test-agent-core 的
    //   "stop() 之后仍能回放"断言抓住过）。
    const name = s && (s.action || s.name)
    // ★ 模块归属跟着步骤走：收藏/历史回放时才把该模块的页面叫起来（以前只有 name/params，
    //   切了板块再回放，动作就被拿去套**另一个模块**的词汇表 —— 报"不支持的动作"）。
    const mod = (s && s.module) || null
    const v = validate(name, (s && s.params) || {}, mod)
    if (v.err) return { err: v.err }
    return {
      id: ++stepSeq,
      name,
      params: v.params,
      module: mod,
      speech: s && s.speech,
      // ★ `!= null` 不能省：`clampNum(null)` 会返回**下限**（Number(null)===0 是有限数），
      //   于是"没指定停留时长"会被静默改成 350ms；只有 undefined 才走 null 分支。
      holdMs: (s && s.holdMs != null) ? clampNum(s.holdMs, cfg.minDwellMs, cfg.maxDwellMs) : null,
      animated: !!(vocabulary[name] && vocabulary[name].animated),
    }
  }

  /**
   * 把一份步骤清单装载成当前演示并开始播放。
   *
   * ★ 抽出来的理由：`replay`（原样重播）与 `reviseDemo`（整改后重播）是同一件事的
   *   两种触发，后者只多一个 `fastForwardTo`。分开写会让"整改后快进"与回放逻辑漂移
   *   ——那会表现为"改完从头又放了一遍，学生得重看"。
   *
   * @param {Array}  steps 步骤清单（**逐条重新校验**，非法的收进 invalid 而不中断）
   * @param {Object} [o]   { demoId, origin, reason, fastForwardTo }
   */
  function loadDemo(steps, o) {
    o = o || {}
    const valid = []
    const invalid = []
    for (const s of (steps || [])) {
      const it = toStep(s)
      if (it.err) { invalid.push({ action: s && s.action, error: it.err }); continue }
      valid.push(it)
    }
    if (!valid.length) {
      return { ok: false, error: t('agent.sb.noSteps'), invalid: invalid.length ? invalid : undefined }
    }

    stop()                               // 清空队列并推进 generation（旧的播放循环作废）
    const hasRec = o.demoId != null && demos.has(String(o.demoId))
    const demoId = hasRec ? String(o.demoId) : nextDemoId()
    const rec = demos.get(demoId) || { id: demoId, origin: o.origin || 'agent', label: '', live: true, mode: 'manual', ts: 0, steps: [] }
    rec.origin = o.origin || rec.origin || 'agent'
    rec.live = true
    /**
     * ★ 记录级的模块归属：`重播这个演示` / 收藏 都靠它知道该把哪个模块的页面叫起来。
     *   优先取显式传入的，其次取第一步自带的（从收藏/历史重建时就是这条路径）。
     */
    rec.module = o.module || rec.module || (valid[0] && valid[0].module) || null
    rec.steps = valid.map((s) => Object.assign({}, s))
    rec.ts = Date.now()
    demos.set(demoId, rec)
    curDemoId = demoId                   // 之后若再追加，会接到这条记录上

    queue = valid.map((s) => Object.assign({}, s))
    snapshots = []                       // 回放时快照会重新生成
    qIndex = 0
    qTotal = queue.length
    manual = rec.mode !== 'auto'
    playing = true
    atGate = false

    const ff = Math.max(0, Math.min(Number(o.fastForwardTo) || 0, queue.length - 1))
    emitProgress({ phase: 'replay', demoId, reason: o.reason || 'replay', fastForwardTo: ff, total: qTotal, manual })
    // ★ paced 一律传 true（除非显式 noPacing）。曾经的写法是这里传 false，后果是
    //   "学生一旦中途点「连续播放」，剩下的步骤会一个停顿都没有地瞬间播完"
    //   （orbit 实测 0.6 秒过掉 5 步）。停留只由 manual 决定，不由入队方式决定。
    // ★ ff === 0 时也要 parkImmediately=true：改的是第一步时先停下来再执行，
    //   否则它一上来就播出来，学生来不及看清改了什么。
    runQueue(generation, o.noPacing !== true, ff === 0, ff)
    return { ok: true, demoId, total: qTotal, fastForwardTo: ff, invalid: invalid.length ? invalid : undefined }
  }

  /**
   * 「重新演示」：从记录里原样重播一条演示（省略 demoId 则重播最近一条）。
   * ★ 从**演示记录**取，而不是从队列——队列在 stop() 之后已经空了。这正是
   *   "结束演示后无法回放"的根因（原先 `if (!queue.length) return 失败` 在结束之后
   *   必然成立，于是点「重新演示」只会静默无效）。
   */
  function replay(demoId) {
    const rec = (demoId != null) ? demos.get(String(demoId)) : latestDemo()
    if (!rec || !rec.steps || !rec.steps.length) {
      return { ok: false, error: t('agent.sb.noReplay') }
    }
    // ★ 把记录的**模块归属**一并传下去：切了板块再点「重播这个演示」时，
    //   宿主据此把该板块的页面叫回来，而不是把动作套到此刻的模块上
    //   （用户预感的那个"潜在问题"就是这个）。
    const r = loadDemo(rec.steps, { demoId: rec.id, origin: rec.origin, reason: 'replay', module: rec.module || null })
    return r.ok ? Object.assign(r, { title: rec.label || '' }) : r
  }

  /** 就地改之后把队列写回记录（否则记录与画面不一致，重播会放回旧版本） */
  function syncRecordFromQueue(rec) {
    if (!rec) return
    rec.steps = queue.map((s) => Object.assign({}, s))
    rec.ts = Date.now()
  }

  /** 跳回队列中的第 i 步（手动、且当前没在跑时才允许） */
  function jumpTo(i) {
    const n = Number(i)
    if (!queue.length) return { ok: false, error: t('agent.sb.noJump') }
    if (!manual) return { ok: false, error: t('agent.sb.jumpAuto') }
    if (playing && !atGate) return { ok: false, error: t('agent.sb.jumpPlaying') }
    if (!Number.isInteger(n) || n < 0 || n >= queue.length) return { ok: false, error: t('agent.sb.stepRange') }
    qIndex = n
    if (typeof restore === 'function' && snapshots[n]) restore(snapshots[n])
    if (!playing) {
      playing = true
      runQueue(generation, false, true)   // 先停在闸门上，与 prev() 同理
    }
    emitProgress({
      phase: 'back', index: n, total: queue.length,
      step: queue[n]
        ? { action: queue[n].name, label: label(queue[n].name, queue[n].params), speech: queue[n].speech }
        : null,
    })
    return { ok: true, index: n, total: queue.length }
  }

  /**
   * 整改**某一条**演示：替换某步 / 在某步后插入 / 删除某步 / 跳回某步。
   *
   * ★ 学生说"刚才那个演示第 3 步不对、换个说法"时用它——**不要**用 applySceneActions
   *   把整条重发一遍：重发会开一条**新**演示，学生已经看过、确认过的其他步骤全部丢掉。
   *
   * ★ 分两条路径（这不是重复实现，是两种教学场景）：
   *   · **就地改**（正在播、同一条、且改的是尚未播到的步骤）：改队列并回写记录，
   *     学生不必重看已经看过的步骤，也保住了「上一步」的快照链；
   *   · **整份重载**（演示已播完 / 要改已看过的步骤 / 改别的演示）：从记录取完整
   *     清单改一处，重新装载并**快进到被改那一步停下**——其余步骤一个不少，
   *     学生又正好能看到"改成了什么样"。**已播完的演示同样可改**，这是最常见的情形。
   *
   * @param {string|number} id  演示号（省略 → 改当前这条）
   * @param {string} op         'replace' | 'insert' | 'remove' | 'jump'
   * @param {number} index      步号（0 起）
   * @param {Object} [step]     op=replace/insert 时的新步骤 { action, params, speech }
   */
  function reviseDemo(id, op, index, step) {
    const rec = (id != null && id !== '')
      ? demos.get(String(id))
      : (curDemoId ? demos.get(curDemoId) : latestDemo())
    if (!rec) {
      return { ok: false, error: t('agent.sb.noDemo', { ids: [...demos.keys()].join(', ') || t('agent.sb.none') }) }
    }
    const i = Number(index)
    if (!Number.isInteger(i) || i < 0) return { ok: false, error: t('agent.sb.indexInvalid') }
    if (op !== 'insert' && i >= rec.steps.length) {
      return { ok: false, error: t('agent.sb.stepRangeDemo', { n: rec.steps.length }) }
    }
    if ((op === 'replace' || op === 'insert') && (!step || !step.action)) {
      return { ok: false, error: t('agent.sb.needAction', { op }) }
    }
    if (op === 'jump') {
      if (!playing || rec.id !== curDemoId) return { ok: false, error: t('agent.sb.jumpOnlyLive') }
      const r = jumpTo(i)
      return Object.assign(r, { demoId: rec.id, mode: 'inplace' })
    }

    // ---- 就地改：正在播同一条，且改的是尚未播到的步骤 ----
    if (playing && rec.id === curDemoId && i >= qIndex) {
      if (op === 'replace') {
        if (i >= queue.length) return { ok: false, error: t('agent.sb.stepRange') }
        const it = toStep(step)
        if (it.err) return { ok: false, error: it.err }
        queue[i] = it
      } else if (op === 'insert') {
        const it = toStep(step)
        if (it.err) return { ok: false, error: it.err }
        queue.splice(i + 1, 0, it)
      } else if (op === 'remove') {
        if (queue.length <= 1) return { ok: false, error: t('agent.sb.cannotEmpty') }
        queue.splice(i, 1)
      }
      qTotal = queue.length
      syncRecordFromQueue(rec)
      emitProgress({ phase: 'revised', mode: 'inplace', demoId: rec.id, index: i, total: queue.length })
      return { ok: true, op, demoId: rec.id, index: i, mode: 'inplace', total: queue.length, steps: queueInfo() }
    }

    // ---- 整份重载 ----
    const steps = rec.steps.map((s) => Object.assign({}, s))
    let target = i
    if (op === 'replace') {
      steps[i] = Object.assign({}, steps[i], step)
    } else if (op === 'insert') {
      steps.splice(i + 1, 0, Object.assign({}, step))
      target = i + 1
    } else if (op === 'remove') {
      if (steps.length <= 1) return { ok: false, error: t('agent.sb.cannotEmpty') }
      steps.splice(i, 1)
      target = Math.min(i, steps.length - 1)
    } else {
      return { ok: false, error: t('agent.sb.unknownOp', { op }) }
    }
    const r = loadDemo(steps, { demoId: rec.id, origin: rec.origin, reason: 'revise', fastForwardTo: target, module: rec.module || null })
    if (!r.ok) return r
    return {
      ok: true, op, demoId: rec.id, index: i, mode: 'reload',
      resumedAt: r.fastForwardTo, total: r.total, steps: queueInfo(),
    }
  }

  /**
   * 从对话历史**幂等重建**演示记录。
   *
   * ★ 为什么需要：刷新之后 `demos` 是空的，于是「↻ 重播这个演示」与「引用」全部失效。
   *   而对话历史里本来就存着每次 applySceneActions 的动作数组、以及回执里的
   *   `demoId`——那就是重建所需的全部信息，**不需要额外持久化**。
   *
   * ★ 幂等 + 保留 live：面板每次渲染路径都会调它，逐条累积必然重复，故**整体重建**；
   *   但本次会话内产生的记录（live）必须保留——历史是"模型说过什么"，
   *   不是"演示现在是什么"，后者归 live 记录。
   *
   * @param {Array} list [{ demoId, actions, origin, label, mode, ts }]
   * @returns {number} 重建后的记录条数
   */
  function syncDemosFromHistory(list) {
    const live = new Map([...demos.entries()].filter(([, r]) => r.live))
    demos.clear()
    for (const [k, v] of live) demos.set(k, v)
    for (const item of (list || [])) {
      const id = item && item.demoId != null ? String(item.demoId) : null
      if (!id || demos.has(id)) continue
      const steps = []
      for (const a of (item.actions || [])) {
        const it = toStep(a)
        if (it.err) continue
        steps.push(it)
      }
      if (!steps.length) continue
      demos.set(id, {
        id,
        origin: item.origin || 'agent',
        label: item.label || '',
        live: false,                      // 从历史重建的，不是本次会话产生的
        ts: item.ts || Date.now(),
        mode: item.mode || 'manual',
        steps,
      })
    }
    // ★ 编号水位必须跟上：否则下一条新演示会撞上刚重建出来的号，
    //   而撞号的表现是"新步骤被追加进旧记录"（orbit 实测过 8 步变 16 步）。
    for (const k of demos.keys()) {
      const n = parseInt(String(k).replace(/^d/, ''), 10)
      if (Number.isFinite(n) && n > demoSeq) demoSeq = n
    }
    return demos.size
  }

  /** 取某条演示记录（含完整步骤，供回放/修订） */
  function getDemo(id) {
    return demos.get(String(id)) || null
  }

  /**
   * 当前队列/记录**属于哪个模块**（没有队列时为 null）。
   *
   * ★ 2026-10-08：切模块时用它判断"要不要中止在播的演示"。
   *   只在**真的换到另一个模块**时中止：把页面叫回来（宿主为播放动作而导航）
   *   会再次触发 setActiveModule(同一模块)，若无条件 stop() 会把正要播的队列清空，
   *   表现为"只播了第一步，其余没了"，且界面上没有任何提示。
   */
  function currentModule() {
    if (queue.length && queue[0] && queue[0].module) return queue[0].module
    const rec = curDemoId ? demos.get(curDemoId) : null
    return (rec && rec.module) || null
  }

  /** 列出全部演示记录（最近的在前） */
  function listRecords() {
    return [...demos.values()]
      .sort((a, b) => b.ts - a.ts)
      .map((r) => ({
        id: r.id, title: r.label || '', label: r.label || '', origin: r.origin,
        // ★ 带上模块归属：模型/面板据此知道这条演示属于哪个板块（跨板块回放要切回去）
        module: r.module || null,
        live: !!r.live, mode: r.mode, steps: r.steps.length, ts: r.ts,
      }))
  }

  /**
   * 更换动作词汇表（切模块时调用）。
   * ★ 顺带 stop()：正在播的分镜属于上一个模块，跨模块继续播没有意义，
   *   而且词汇表一换，queue 里那些动作名的 animated/concept 就查不到了。
   *
   * ★★ 2026-10-08：**但"同一个模块再设一次"不能停**。
   *   宿主为了播放动作会把模块页面叫回来（ensureModuleReady），路由挂载会再调
   *   setActiveModule(同一模块) → 再调本函数。无条件 stop() 会把**正要播的那条队列**
   *   清空（generation 也推进），表现是"只执行了第一步、其余消失"，且界面上看不出原因。
   *   判据与 setActiveModule 那边共用 `currentModule()`：真的换板块才停。
   *
   * @param {Object} v          新词汇表
   * @param {string} [moduleId] 这份词汇表属于哪个模块（缺省时保持旧行为：无条件停）
   */
  function setVocabulary(v, moduleId) {
    const from = currentModule()
    const target = moduleId || null
    // 缺少模块归属信息时按旧行为停（宁可保守），只有"明确是同一个模块"才留队列
    if (!(target && from && target === from)) stop()
    vocabulary = v || {}
    return vocabulary
  }

  /**
   * 「回到演示前」：把视图还原到**这一轮演示开始之前**的样子。
   *
   * ★ 与「上一步」的区别：
   *   `prev()` 是**逐步**退（一次退一格，且退不到队列之外的状态）；
   *   本函数是**一键**退回起点，而且演示被 `stop()` 掉之后依然可用
   *   ——那正是最需要它的时刻（学生中途不想看了，但画面已经被改过）。
   *
   * @returns {{ok:boolean, error?:string}}
   */
  function restoreBefore() {
    if (beforeSnap == null) return { ok: false, error: t('agent.sb.noBefore') }
    if (typeof restore !== 'function') return { ok: false, error: t('agent.sb.restoreUnsupported') }
    let done = false
    try {
      done = restore(beforeSnap)
    } catch (e) {
      return { ok: false, error: t('agent.sb.restoreFailed', { msg: (e && e.message) || e }) }
    }
    return done ? { ok: true } : { ok: false, error: t('agent.sb.restoreNoEffect') }
  }

  /**
   * 取"演示前"的快照。面板用它做两件事：
   *   ① 判断要不要显示「↩ 回到演示前」按钮（`canRestoreBefore` 已够，但取到 route
   *      才能在恢复前**先跳回演示前所在的页面**——演示可能跳去了对比页）；
   *   ② 读出 `route` 做那个跳转。
   */
  function beforeSnapshot() { return beforeSnap }

  return {
    onProgress, emitProgress, setVocabulary,
    applySequence, stop, next, prev, autoPlay, replay, state,
    // ★ 当前队列/记录属于哪个模块（切模块时判断"要不要中止"，见 currentModule 的说明）
    currentModule,
    // 演示的"可寻址"三件套：整改 / 从历史重建 / 节奏切换
    setManual, reviseDemo, syncDemosFromHistory,
    // 队列可寻址：面板与修订用
    queueInfo, getStep, jumpTo, loadDemo,
    getDemo, listRecords,
    // "回到演示前"：一键还原到这一轮演示开始之前的视图与视角
    restoreBefore, beforeSnapshot,
    // 供面板/调试读取
    get queue() { return queue.slice() },
    get manual() { return manual },
  }
}

export default createStoryboard
