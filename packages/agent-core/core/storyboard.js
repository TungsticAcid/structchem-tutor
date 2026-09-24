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
 */

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
 * @param {Object}   [opts.vocabulary]  { actionName: { animated, concept, label } }
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
    validate, applyStep, vocabulary = {}, describe, capture, restore,
    getDefaultPlayback, onStop, timers,
  } = opts

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
   * ★ 只在手动模式可用。自动连播中回退会与正在往前跑的循环打架。
   */
  function prev() {
    if (!queue.length) return { ok: false, error: '当前没有可回退的演示' }
    if (!manual) return { ok: false, error: '自动连播中无法回退，请先切到手动逐步' }
    if (playing && !atGate) return { ok: false, error: '当前步骤正在播放，请稍候再回退' }
    if (qIndex <= 0) return { ok: false, error: '已经是第一步了' }
    qIndex--
    if (typeof restore === 'function') restore(snapshots[qIndex])
    if (!playing) {
      playing = true
      runQueue(generation, false, true)   // 先停在闸门上，不立刻执行
    }
    emitProgress({
      phase: 'back', index: qIndex, total: queue.length,
      step: queue[qIndex]
        ? { action: queue[qIndex].name, label: label(queue[qIndex].name, queue[qIndex].params), speech: queue[qIndex].speech }
        : null,
    })
    return { ok: true, index: qIndex, total: queue.length }
  }

  /** 供智能体/感知层查询当前播放状态 */
  function state() {
    return {
      playing,
      mode: manual ? 'manual' : 'auto',
      index: qIndex,                            // 已执行步数
      total: qTotal,
      waitingForUser: atGate,                   // 是否正停在「下一步」闸门上
      canPrev: manual && qIndex > 0 && (!playing || atGate),
      canNext: atGate && qIndex < queue.length,
      canReplay: !playing && queue.length > 0,  // 播完后可重播
      pending: queue.slice(qIndex).map((s) => ({ action: s.name, speech: s.speech || null })),
    }
  }

  /**
   * 下发一组动作。
   *
   * @param {Array}  actions [{ action, params, speech, holdMs }]
   * @param {Object} [o]
   * @param {boolean} [o.auto]       true=自动连播并等走完（脚本回放用）
   * @param {boolean} [o.noPacing]   auto 模式下不等停留
   */
  async function applySequence(actions, o) {
    o = o || {}
    const raw = (actions || []).slice(0, cfg.maxActionsPerTurn)
    const dropped = Math.max(0, (actions || []).length - cfg.maxActionsPerTurn)

    // ---- 先全部校验：参数错的步骤当场退回，不入队、不占用户的一次点击 ----
    const okSteps = []
    const failed = []
    for (const a of raw) {
      const name = a && a.action
      const v = validate(name, (a && a.params) || {})
      if (v.err) { failed.push({ action: name, error: v.err }); continue }
      okSteps.push({
        name,
        params: v.params,
        speech: a && a.speech,
        holdMs: clampNum(a && a.holdMs, cfg.minDwellMs, cfg.maxDwellMs),
        animated: !!(vocabulary[name] && vocabulary[name].animated),
      })
    }
    if (!okSteps.length) return { executed: [], failed, accepted: 0, dropped }

    // ---- 自动连播：走完再返回 ----
    if (o.auto) {
      stop()
      const gen = generation
      manual = false
      queue = okSteps
      qIndex = 0
      qTotal = okSteps.length
      playing = true
      const r = await runQueue(gen, !o.noPacing)
      return Object.assign(r, { failed: failed.concat(r.failed || []), dropped })
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
      queue = []
      qIndex = 0
      // 默认播放方式由模块设置决定；演示条上还能临时改成连播
      manual = (typeof getDefaultPlayback === 'function' ? getDefaultPlayback() : 'manual') !== 'auto'
    }
    const room = cfg.maxQueue - qIndex
    const taken = okSteps.slice(0, Math.max(0, room))
    const overflow = okSteps.length - taken.length
    queue = queue.concat(taken)
    qTotal = queue.length

    if (!playing) {
      playing = true
      const gen = generation
      runQueue(gen, false)             // 后台播放，不 await
    } else {
      emitProgress({ phase: 'queued', index: qIndex, total: qTotal, added: taken.length })
    }
    return {
      executed: [],
      failed,
      accepted: taken.length,
      queued: taken.length,
      overflow: overflow || undefined,
      dropped: dropped || undefined,
      manual,
      total: qTotal,
      // ★ 这段是给模型看的：告诉它不要重复下发同样的动作，并交代节奏控制手段。
      //   少了它，模型会在用户还没点「下一步」时把同一组动作再发一遍。
      note: '已入队 ' + taken.length + ' 步（共 ' + qTotal + ' 步）。'
        + (manual
          ? '正在等用户点「下一步」逐步确认——请不要重复下发同样的动作，并在回复里告诉学生可以用「下一步 / 连续播放 / 停止」控制节奏。'
          : '正在连续播放。'),
    }
  }

  /**
   * 后台播放循环。gen 是本轮的运行代号：stop() 会让它作废。
   * @returns {Promise<{executed:Array, failed:Array, aborted:boolean}>}
   */
  async function runQueue(gen, paced, parkImmediately) {
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

    while (qIndex < queue.length) {
      if (dead()) return { executed, failed, aborted: true }

      // ★ `&& manual` 不能少：自动连播时**绝不能**进闸门，否则第二步就会停在那里
      //   永远等一个没人会点的「下一步」——整个演示挂死。
      if (!skipGate && manual) {
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
        if (dead()) return { executed, failed, aborted: true }
      }
      skipGate = false

      const st = queue[qIndex]
      const v = vocabulary[st.name] || {}
      emitProgress({
        phase: 'step', index: qIndex + 1, total: queue.length, action: st.name,
        label: label(st.name, st.params), speech: st.speech,
        concept: v.concept, ok: true, manual,
      })

      // ★ 执行前先存快照：这是「上一步」能把画面退回原样的唯一依据
      if (typeof capture === 'function') snapshots[qIndex] = capture()

      const r = await applyStep(st.name, st.params, { isDead: dead })
      if (dead()) return { executed, failed, aborted: true }
      const one = r && r.ok ? { action: st.name } : { action: st.name, error: (r && r.error) || '执行失败' }
      ;(r && r.ok ? executed : failed).push(one)

      qIndex++
      if (dead()) return { executed, failed, aborted: true }

      if (!manual && paced && qIndex < queue.length) {
        // 自动连播：动画自带时长，播完只需落点停顿；瞬时动作按"看一眼"的时长停留
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
   * 「重新演示」：从第一步重播当前这条分镜。
   * 先把画面还原到演示开始前的样子，再从头走一遍。
   */
  function replay() {
    if (!queue.length) return { ok: false, error: '没有可重播的演示' }
    const q = queue.slice()
    const snaps = snapshots.slice()
    const man = manual
    stop()                               // 会清空队列并推进 generation
    queue = q
    snapshots = snaps
    qIndex = 0
    qTotal = q.length
    manual = man
    playing = true
    atGate = false
    if (typeof restore === 'function') restore(snaps[0])   // 回到"第一步之前"
    emitProgress({ phase: 'replay', total: q.length, manual })
    runQueue(generation, false)          // 后台播放，不 await
    return { ok: true, total: q.length }
  }

  return {
    onProgress, emitProgress,
    applySequence, stop, next, prev, autoPlay, replay, state,
    // 供面板/调试读取
    get queue() { return queue.slice() },
    get manual() { return manual },
  }
}

export default createStoryboard
