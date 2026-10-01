/**
 * index.js — 出题引擎
 *
 * 对外四个能力，都对应 `module/tools.js` 的 teach 类工具：
 *   generate  → generateQuiz         出题（通道 A 数据驱动）
 *   check     → checkAnswer          判分（★ 纯本地下标比较，不经模型）
 *   diagnose  → diagnoseError        错因诊断（把画面切到能揭示错误的状态）
 *   explain   → （随 check 一并返回）  解析
 *
 * ★ 三条不可动摇的约定：
 *
 *   ① **发给模型的题目不含答案。**
 *      generate 返回的 options 只有文本，没有 `answerIndex`、没有"哪项正确"的标记。
 *      答案冻结在引擎内的题库里（`bank`），只有 check 能碰。这样模型**结构上无法泄题**
 *      —— 而不是靠提示词叮嘱它"不要说出答案"。
 *
 *   ② **判定不经模型**：check 只是比较下标。答案在出题时就由程序算定，
 *      模型参与判定只会引入不确定性，且在数值题上毫无必要。
 *
 *   ③ **解析在判分之后才给**：generate 时已生成好解析文本并存在题库里，
 *      但**不返回**给模型；check 之后才随判分结果一并返回。这样"边答边被提示"
 *      不可能发生。
 *
 * ★ 两个通道各司其职（机制见 concept.js）：
 *   · **通道 A（数据驱动题）**——数值由计算层算出，答案**物理上不可能错**，是主力；
 *   · **通道 B（概念题）**——题干与干扰项**人工写定**（`data/concept-questions.js`），
 *     这里只做组装、不做生成。它服务两类情形：① 该知识点没有数值模板
 *     （如 C8 结构—性能关联）；② 调用方显式要求（`channel: 'B'`）。
 *   两者共用同一套自校验、冻结答案、入库与防泄题边界（见 `finalizeConcept`）。
 */

import { TEMPLATES, fillExplanation } from './templates.js'
import { selfCheck } from './selfcheck.js'
import { crystalsForKnowledgePoint, KP_CRYSTAL_MATRIX } from './data/kp-crystal-matrix.js'
import { causesForKnowledgePoint, causeById } from './data/error-causes.js'
import { buildConcept } from './concept.js'
import { buildPresetView, buildQuestionView } from './preset-view.js'

/** 把 'C5' / 'crystal:C5' 统一为 'crystal:C5' */
function normalizeKp(kp) {
  const s = String(kp || '').trim()
  if (!s) return ''
  return s.includes(':') ? s : `crystal:${s}`
}

/** 一次生成最多尝试几个（晶体 × 模板）组合 */
const MAX_ATTEMPTS = 8

/**
 * 创建出题引擎。
 *
 * @param {Object} deps
 * @param {Function} deps.loadData (crystalId) => 晶体数据
 * @param {Object}   deps.compute  确定性计算：{ cellVolume, atomCount, computeDensity, nearestSameAtomDistance, parseFormula }
 * @param {Array}    [deps.catalog] 晶体索引
 */
export function createQuizEngine(deps = {}) {
  const loadData = deps.loadData
  const compute = deps.compute
  if (typeof loadData !== 'function') throw new Error('createQuizEngine 需要 deps.loadData')
  if (!compute || typeof compute.computeDensity !== 'function') {
    throw new Error('createQuizEngine 需要 deps.compute（来自 module/tools.js，不得另写一份）')
  }
  const catalog = deps.catalog || []

  /** 题库：id → 完整题目（含答案与解析）——**只有 check/explain 能读** */
  const bank = new Map()
  let seq = 0
  /** 各题被答过的次数（供变式题避重） */
  const attemptLog = []

  /**
   * 出一道题。
   *
   * @param {Object} opts
   * @param {string} opts.kp          知识点（'crystal:C5' 或 'C5'）
   * @param {string} [opts.crystalId] 指定晶体；缺省则按能力矩阵选强关联的
   * @param {string} [opts.difficulty] 难度层级
   * @param {string} [opts.excludeId] 避免与这道题重复（变式题用）
   * @returns {Object} 题目（**不含答案**）或 { error }
   */
  function generate(opts = {}) {
    const kp = normalizeKp(opts.kp)
    if (!kp) return { error: '需要知识点 id（如 crystal:C5）' }

    // ---- 通道 B 判定 ----
    // ★ 该知识点**没有数据模板**时（如 C8）走概念题；调用方也可以显式要求
    //   （`channel: 'B'`）。概念题的题干与干扰项都是人工写定的，见 concept.js——
    //   它**不生成文本**，所以不会给"答案对不对"新开风险面。
    const hasDataTemplates = TEMPLATES.some((t) => t.kp === kp)
    if (!hasDataTemplates || opts.channel === 'B') {
      const c = buildConcept({
        kp,
        topic: opts.topic,
        seed: (++seq) * 7919,
        exclude: opts.exclude,
      })
      if (c && !c.error) return finalizeConcept(c)
      // 本来就没有数据模板 → 概念题也出不来，如实报能力边界
      if (!hasDataTemplates) return { error: c.error || `知识点 ${kp} 暂无可用题型` }
      // 有数据模板、只是显式要 B 而 B 不可用 → 落回通道 A（下面继续）
    }

    // ---- 选候选模板 ----
    let templates = TEMPLATES.filter((t) => t.kp === kp)
    // ★ 允许指定题型：同一知识点可能有多个题型模板（如 C7 有体积/密度/最近邻），
    //   不指定时按 attempt 轮转"碰"一个，那不是模型能控制的行为。
    //   模型说"出一道密度题"时，必须能真的出密度题。
    if (opts.topic) {
      const byTopic = templates.filter((t) => t.topic === opts.topic)
      if (!byTopic.length) {
        const avail = templates.map((t) => t.topic).join('、')
        return { error: `知识点 ${kp} 没有题型「${opts.topic}」${avail ? `（可用：${avail}）` : ''}` }
      }
      templates = byTopic
    }
    if (!templates.length) {
      return { error: `知识点 ${kp} 暂无可用题型模板（通道 A 已实现：点阵型式/结构基元/堆积方式/配位环境/空隙分布/空间群/晶胞参数）` }
    }
    if (opts.difficulty) {
      const f = templates.filter((t) => t.difficulty === opts.difficulty)
      if (f.length) templates = f
    }

    // ---- 选候选晶体 ----
    let candidates
    if (opts.crystalId) {
      candidates = [opts.crystalId]
    } else {
      candidates = crystalsForKnowledgePoint(kp)          // 矩阵里的强关联晶体
    }
    if (!candidates.length) {
      return { error: `知识点 ${kp} 在能力矩阵里没有强关联的晶体` }
    }

    const seedBase = (++seq) * 7919
    let lastErr = null
    let attempted = []

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const crystalId = candidates[attempt % candidates.length]
      const tpl = templates[attempt % templates.length]
      const data = loadData(crystalId)
      if (!data) { lastErr = `未找到晶体 ${crystalId}`; continue }
      if (!tpl.applies(data)) { lastErr = `${data.name} 不适用题型「${tpl.topic}」`; continue }

      const key = `${crystalId}:${tpl.id}`
      if (attempted.includes(key) && attempted.length < candidates.length * templates.length) {
        // 这个组合试过了，换下一个
        continue
      }
      attempted.push(key)

      const r = tpl.build({ data, compute, seed: seedBase + attempt })
      if (r.error) { lastErr = r.error; continue }
      const q = r.question
      q.id = `q-${seedBase + attempt}`
      q.kp = kp
      q.source = 'data'
      q.reviewStatus = 'generated'

      // ---- 自校验（含与内置知识表的交叉校验）----
      const sc = selfCheck(q)
      if (!sc.ok) {
        lastErr = '自校验未通过：' + sc.problems.join('；')
        continue
      }

      // ---- ★ 冻结答案 → 用只读引用填解析（顺序不可颠倒）----
      const frozen = { answerText: q.answerText, answerValue: q.answerValue }
      q.answerFrozen = frozen
      q.explanation = fillExplanation(q, frozen)

      bank.set(q.id, q)
      return toModelView(q)
    }

    return { error: lastErr || `无法为 ${kp} 生成题目（已尝试 ${attempted.length} 个组合）` }
  }

  /**
   * 通道 B 的收尾：与通道 A **共用**同一套自校验、冻结答案、入库与防泄题边界。
   *
   * ★ 为什么共用：通道 B 的文本虽是人写的，但"选项是否唯一正确、解析是否与答案矛盾"
   *   这些**结构性**检查一条都不能少——人工写的东西同样会出低级错误，而它一旦成为
   *   题目，学生就会把它当标准答案记住。共用同一条出口，也保证了 `check()`/`explain()`
   *   不需要区分题目来自哪个通道。
   */
  function finalizeConcept(q) {
    q.id = `qb-${++seq}`
    q.reviewStatus = 'generated'
    // 概念题不针对某个晶体，但「去看结构」仍需要一个落点：取该知识点的强关联晶体
    if (!q.crystalId) q.crystalId = crystalsForKnowledgePoint(q.kp)[0] || null
    if (!q.presetView && q.crystalId) {
      try { q.presetView = buildPresetView(q.kp, { crystalId: q.crystalId }) } catch (e) { q.presetView = null }
    }
    const sc = selfCheck(q)
    if (!sc.ok) return { error: '概念题自校验未通过：' + sc.problems.join('；') }
    bank.set(q.id, q)
    return toModelView(q)
  }

  /**
   * ★ 给模型的视图：**抹掉答案**。
   * 只保留题干、选项文本、知识点、晶体，以及**题境视图**（中性、可安全下发）。
   *
   * ★ `presetView`（揭示答案的观察状态）**绝不进这里**。
   *   它按知识点打开"指向答案"的图层——C6（空间群）开对称元素、C5（空隙）开空隙子层、
   *   C1（点阵型式）开点阵点。此前它随回执发给模型，模型完全可以把它编排成演示下发，
   *   学生点「下一步」就一步步看到了答案（实测反馈）。
   *   现在模型拿到的是 `questionView`：只切晶体 + 开原子与线框 + iso 视角，
   *   无论题目问什么都一样，因此"出题时也有演示"与"不泄露答案"可以同时成立。
   *   揭示答案的那份留在 `bank` 里，由前端在答后（或点「去看结构」）使用。
   */
  function toModelView(q) {
    // 题境视图：惰性构建一次（两个通道都经此处，故不必各自构建）
    if (!q.questionView && q.crystalId) {
      try { q.questionView = buildQuestionView(q.kp, { crystalId: q.crystalId }) } catch (e) { q.questionView = null }
    }
    return {
      id: q.id,
      kp: q.kp,
      crystalId: q.crystalId,
      difficulty: q.difficulty,
      stem: q.stem,
      options: q.options.map((o) => o.text),
      // ★ 中性题境视图（可演示）；**不是** presetView
      questionView: q.questionView
        ? { crystalId: q.questionView.crystalId, actions: q.questionView.actions, revealsAnswer: false }
        : null,
      note: '答案已由程序算定并冻结在本地。请把题干与 4 个选项原样呈现给学生，**不要猜测或提示答案**；'
        + '学生作答后调用 checkAnswer({questionId, chosenIndex})，判定与解析由本地完成。'
        + '★ questionView 可以下发作"题境演示"（它只切晶体、开原子与线框）；'
        + '但**作答前不得打开对称元素 / 空隙 / 点阵点 / 辅助几何等图层**——'
        + '那会让学生从画面上直接读出答案，等于泄题。',
    }
  }

  /**
   * 判分（★ 纯本地下标比较，不经模型）。
   *
   * @param {Object} args { questionId, chosenIndex }
   * @returns {Object} 判分结果（含解析；若答错还含错因与诊断动作）
   */
  function check({ questionId, chosenIndex } = {}) {
    const q = bank.get(questionId)
    if (!q) return { error: `未找到题目 ${questionId}（可能已过期，请重新出题）` }
    const idx = Number(chosenIndex)
    if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length) {
      return { error: `选项下标非法：${chosenIndex}` }
    }

    const correct = idx === q.answerIndex
    const chosen = q.options[idx]
    const right = q.options[q.answerIndex]
    attemptLog.push({ questionId, correct, ts: Date.now() })
    // ★ 标记已作答：**练习守卫**据此判断"还有没有未揭晓的题"（见 revealLayerSet）
    q.answered = true

    const out = {
      correct,
      answerIndex: q.answerIndex,
      answerText: right.text,
      chosenText: chosen.text,
      explanation: q.explanation,
      presetView: q.presetView,
    }

    if (!correct) {
      // 错因来自干扰项自带的标签；没有标签时退回"通用诊断"
      const causeId = chosen.errorCause
      const cause = causeId ? causeById(causeId) : null
      out.causeId = causeId || null
      out.causeLabel = cause ? cause.label : '（未归类的错误）'
      out.causeType = cause ? cause.type : null
      out.diagnosticActions = cause ? cause.diagnosticActions : genericDiagnosis(q)
      out.avoid = cause ? cause.avoid : '不要直接说出正确答案'
      out.followUp = cause ? cause.followUp : '先说说你是怎么想的？'
    } else {
      out.nextStep = '答对了。可用 feynman 技能邀请他用自己的话复述一遍，把识别性掌握推进到生成性掌握。'
    }

    return out
  }

  /** 通用诊断：错因未归类时，展示相关结构 + 开放式提问 */
  function genericDiagnosis(q) {
    return [
      {
        action: 'loadCrystal',
        params: { crystalId: q.crystalId },
        speech: '我们再回到这个结构上看一看。',
      },
      {
        action: 'setLayers',
        params: { layers: { atoms: true, wireframe: true } },
        speech: '把视图恢复到一个干净的状态，你注意看结构本身。',
      },
    ]
  }

  /**
   * 变式题：按错因类型选变式维度（《出题引擎技术设计》§7）。
   *
   *   错因是 E-A（概念混淆）→ 换晶体，检验概念是否泛化
   *   错因是 E-B（计数错误）→ 换个问法（若模板支持），直接检验是否分清了两种问法
   *   错因是 E-C（计算失误）→ 换参数，检验公式是否掌握
   *   错因是 E-D（空间想象）→ 换晶体 + 强制看三维
   *
   * @param {Object} args { questionId, causeId }
   */
  function variant({ questionId, causeId } = {}) {
    const q = bank.get(questionId)
    if (!q) return { error: `未找到题目 ${questionId}` }

    const type = causeId ? (causeById(causeId) || {}).type : null
    let strategy = '换晶体'
    if (type === 'E-B') strategy = '换问法（同一知识点、另一种问法）'
    else if (type === 'E-C') strategy = '换参数（同题型、换晶体）'
    else if (type === 'E-D') strategy = '换晶体 + 强制看三维'

    // 候选：同知识点的其它强关联晶体，排除刚用过的那一个
    const others = crystalsForKnowledgePoint(q.kp).filter((c) => c !== q.crystalId)
    if (!others.length) {
      return { error: `知识点 ${q.kp} 没有其它可换的晶体，无法出变式题` }
    }

    // ★ 换问法：若该知识点有多个题型模板，优先换模板（同一晶体、另一种问法）
    if (type === 'E-B') {
      const sameKp = TEMPLATES.filter((t) => t.kp === q.kp && t.topic !== q.topic)
      if (sameKp.length) {
        const data = loadData(q.crystalId)
        const tpl = sameKp[0]
        if (data && tpl.applies(data)) {
          const seed = Date.now() % 100000 + 31
          const r = tpl.build({ data, compute, seed })
          if (!r.error) {
            const nq = r.question
            nq.id = `q-v${seed}`
            nq.kp = q.kp
            nq.source = 'data'
            const sc = selfCheck(nq)
            if (sc.ok) {
              nq.answerFrozen = { answerText: nq.answerText, answerValue: nq.answerValue }
              nq.explanation = fillExplanation(nq, nq.answerFrozen)
              bank.set(nq.id, nq)
              const mv = toModelView(nq)
              mv.variantOf = q.id
              mv.variantStrategy = strategy
              return mv
            }
          }
        }
      }
    }

    const next = others[0]
    const r = generate({ kp: q.kp, crystalId: next, excludeId: q.id })
    if (r.error) return r
    r.variantOf = q.id
    r.variantStrategy = strategy
    r.note += `（这是变式题：${strategy}——用于检验是否真正纠正了认知，而不是记住了上一题的答案）`
    return r
  }

  /** 取解析（判分后调用；未判分时不给，避免"边答边被提示"） */
  function explain({ questionId } = {}) {
    const q = bank.get(questionId)
    if (!q) return { error: `未找到题目 ${questionId}` }
    const answered = attemptLog.some((a) => a.questionId === questionId)
    if (!answered) {
      return { error: '该题尚未作答。请先让学生作答并调用 checkAnswer——解析是为作答后的复盘准备的。' }
    }
    return { explanation: q.explanation, answerText: q.answerText }
  }

  /** 列出可出题的知识点及其可用晶体（供模型/调试了解能力边界） */
  function capabilities() {
    const out = {}
    for (const tpl of TEMPLATES) {
      if (!out[tpl.kp]) out[tpl.kp] = { topics: [], crystals: [] }
      if (!out[tpl.kp].topics.includes(tpl.topic)) out[tpl.kp].topics.push(tpl.topic)
    }
    for (const kp of Object.keys(out)) {
      out[kp].crystals = crystalsForKnowledgePoint(kp)
    }
    return out
  }

  /**
   * 只读查看一道题的**答案与解析**，不改任何状态。
   *
   * ★ 为什么需要它（而不是复用 `checkAnswer`）：练习模式有「看答案」按钮——
   *   学生有权在放弃作答时直接看答案。而 `check` 要求传一个**合法的选项下标**，
   *   并且会把它记进 `attemptLog`、把题目标成"已作答"；拿它实现"看答案"
   *   等于**伪造了一次作答**（统计里多一条不该有的记录）。故单列一个纯读取的 `peek`。
   *
   * @param {string} questionId
   * @returns {{error:string}|{stem,options,answerIndex,answerText,explanation,presetView}}
   */
  function peek(questionId) {
    const q = bank.get(questionId)
    if (!q) return { error: `未找到题目 ${questionId}（可能已过期，请重新出题）` }
    return {
      stem: q.stem,
      options: q.options.map((o) => o.text),
      answerIndex: q.answerIndex,
      answerText: q.options[q.answerIndex].text,
      explanation: q.explanation,
      presetView: q.presetView,
    }
  }

  /**
   * 练习守卫：**当前未作答**的题目里，"揭示答案"要打开哪些图层。
   *
   * ★ 为什么需要它（而不是只靠提示词叮嘱"别开对称元素"）：
   *   模型在 explain 节点**有 hand 授权**，它完全可以自行下发 `setLayers({symmetry:true})`
   *   把答案摆在画面上——尤其当学生在练习中直接问"这题答案是啥"的时候。
   *   提示词只能劝，挡不住；这道闸是**结构性**的：`facade.applyActions` 会拒绝
   *   任何打开这些图层的动作，并把原因写进 `failed` 让模型看见。
   *
   * ★ 只管**模型下发**的动作（facade 路径）。学生自己在图层面板上开图层**不受限**——
   *   那是他主动探索，本来就该允许。
   *
   * @returns {Set<string>} 被禁的图层名（无未作答题时为空集 ⇒ 不限制）
   */
  function revealLayerSet() {
    const banned = new Set()
    for (const q of bank.values()) {
      if (q.answered) continue
      const pv = q.presetView
      if (!pv || !pv.revealsAnswer) continue
      for (const a of (pv.actions || [])) {
        if (a.action === 'setLayers') {
          for (const [k, v] of Object.entries(a.params.layers || {})) if (v) banned.add(k)
        } else if (a.action === 'setLayer' && a.params.visible !== false) {
          banned.add(a.params.layer)
        }
      }
    }
    return banned
  }

  /**
   * 错因诊断：按错因 id 取"能揭示错误根源的**视图状态**"。
   *
   * ★ 给出的不是答案，是视图——答错时的教学动作是把画面切到能让学生自己看出
   *   矛盾的状态（见 `data/error-causes.js` 里每条错因的 `diagnosticActions`）。
   *
   * ★ 这个导出**此前缺失**：`module/teach-tools.js` 的 `diagnoseError` 一直在调
   *   `quiz._cause(id)`，而返回面里没有它——于是白名单放行了 `diagnoseError`、
   *   模型也调得到，却**恒定返回"未找到错因"**。属于"不报错、只是永远不工作"
   *   的那一类缺陷，靠 `tools/test-module.mjs` 的【3c】新断言守住。
   */
  function diagnose(causeId) {
    const cause = causeById(causeId)
    if (!cause) {
      return {
        error: '未找到错因 ' + causeId
          + '。可用 checkAnswer 的返回里携带的 diagnosticActions。',
      }
    }
    return {
      causeId: cause.id,
      label: cause.label,
      type: cause.type,
      actions: cause.diagnosticActions,
      avoid: cause.avoid,
      followUp: cause.followUp,
      note: '请用这些动作把视图切到能揭示错误根源的状态；**不要直接说出正确答案**。',
    }
  }

  return {
    generate, check, variant, explain, capabilities, diagnose,
    /** 只读看答案（练习模式的「看答案」按钮用，不改作答状态） */
    peek,
    /** 练习守卫：未作答题目的"答案图层"集合（facade 据此拒绝泄题动作） */
    revealLayerSet,
    /** 供测试：直接取题库里的完整题目（含答案） */
    _bank: bank,
    _attemptLog: attemptLog,
  }
}

export default createQuizEngine
