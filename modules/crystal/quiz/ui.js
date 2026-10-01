/**
 * ui.js — 出题与判分的**界面**：题目卡、反馈卡、「去看结构」
 *
 * 它接在面板与引擎之间：
 *   模型调 generateQuiz → 工具结果里带题目 → 本模块渲染题目卡（4 个大按钮）
 *   学生点选项 → **直接调本地的 checkAnswer**（不经模型）→ 渲染反馈卡
 *   「去看结构」→ 把 presetView 的动作序列下发到分镜队列
 *
 * ★ 三处刻意的设计：
 *
 *   ① **选项点击不经模型**：判定本来就是纯本地的（`quiz/check` 只比较下标）。
 *      绕一圈发给模型再等它回应，既慢又引入不确定性，还可能被它"顺手"说出答案。
 *      这里直接 `module.handlers.checkAnswer(...)`——**与模型调的是同一个函数**，
 *      但省掉一次往返。
 *
 *   ② **卡片的类名复用 panel.css 里已有的**（`.agent-q` / `.agent-opt` / `.agent-fb` /
 *      `.agent-goto`）。这些样式是从参考实现的 panel.css 原样保留的，本仓库无需新写
 *      CSS——只需补齐与类名对应的 JS 渲染。这也避免了"新写一套样式与面板主题打架"。
 *
 *   ③ **`addCard` 返回元素引用**，不用 `querySelector` 回找。参考实现用
 *      `.agent-msg.assistant:last-of-type` 找回卡片元素，一旦模型在同一轮又插了
 *      一条 assistant 消息，四个按钮就全绑不上，而页面不报错。
 */

import { judgmentFor, shortFor } from './data/practice-questions.js'

/** HTML 转义（题干与选项都可能含学生可读的化学式，但绝不能让其破坏结构） */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {Object} deps
 * @param {Object} deps.panel   面板（需有 addCard / renderRich / addChip）
 * @param {Object} deps.app     智能体（取 storyboard、setNode）
 * @param {Object} deps.module  晶体模块（handlers.checkAnswer）
 * @param {Object} [deps.quiz]  出题引擎（取 _bank 读题干，用于「去看结构」时补上下文）
 */
export function createQuizUI(deps = {}) {
  const panel = deps.panel
  const app = deps.app
  const module_ = deps.module
  if (!panel || !app || !module_) throw new Error('createQuizUI 需要 panel / app / module')

  /** 尚未作答的题：questionId → 模型视图（题干、选项、presetView） */
  const pending = new Map()
  /** 已渲染过反馈卡、避免重复渲染 */
  const answered = new Set()

  /**
   * 拦截工具结果：识别出题与判分，渲染对应卡片。
   * 由 assemble.js 包装 send 时调用（见那里的说明）。
   */
  function handleToolResult(info) {
    if (!info || !info.result) return
    const { name, result } = info
    if (result.error) return

    if (name === 'generateQuiz' && result.id && Array.isArray(result.options)) {
      renderQuestion(result)
    } else if (name === 'checkAnswer' && result.answerText !== undefined) {
      renderFeedback(result)
    }
  }

  /** 渲染题目卡（固定的 4 个大按钮，无需输入——移动端可点击作答） */
  function renderQuestion(q) {
    pending.set(q.id, q)
    const kpLabel = String(q.kp || '').replace(/^crystal:/, '')
    const meta = [kpLabel, q.difficulty, q.crystalId].filter(Boolean).join(' · ')

    const optHtml = q.options.map((text, i) => {
      const letter = 'ABCD'[i] || String(i + 1)
      return `<button class="agent-opt" type="button" data-i="${i}">${letter}. ${esc(text)}</button>`
    }).join('')

    const html = `
      <div class="agent-q">
        <div class="agent-q-kp">${esc(meta)}</div>
        <div class="agent-q-stem">${panel.renderRich ? panel.renderRich(q.stem) : esc(q.stem)}</div>
        <div class="agent-opts">${optHtml}</div>
      </div>`

    const card = panel.addCard(html, 'agent-question')
    for (const btn of card.querySelectorAll('.agent-opt')) {
      btn.addEventListener('click', () => answer(q.id, Number(btn.dataset.i), card))
    }
    return card
  }

  /** 学生点选：直接走本地判定，不经模型 */
  function answer(questionId, chosenIndex, cardEl) {
    if (answered.has(questionId)) return
    const q = pending.get(questionId)
    if (!q) return

    // ★ 直接调本地 handler——与模型调的是同一个函数，但省掉一次往返
    const r = module_.handlers.checkAnswer({ questionId, chosenIndex })
    if (r && r.error) {
      panel.addChip(`判分失败：${r.error}`, 'warn')
      return
    }
    answered.add(questionId)
    pending.delete(questionId)

    // 在题目卡上标出正误（CSS 已备 `.agent-opt.right` / `.agent-opt.wrong`）
    if (cardEl) {
      for (const btn of cardEl.querySelectorAll('.agent-opt')) {
        btn.disabled = true
        const i = Number(btn.dataset.i)
        if (i === r.answerIndex) btn.classList.add('right')
        else if (i === chosenIndex) btn.classList.add('wrong')
      }
    }

    renderFeedback(r)
  }

  /** 渲染反馈卡：正误 + 解析 +（答错时）诊断 + 「去看结构」 */
  function renderFeedback(r) {
    const okCls = r.correct ? 'ok' : 'bad'
    const head = r.correct
      ? '✓ 答对了'
      : `✗ 答错了　正确答案是 <b>${esc(r.answerText)}</b>`

    const exp = r.explanation
      ? `<div class="agent-fb-exp">${panel.renderRich ? panel.renderRich(r.explanation) : esc(r.explanation)}</div>`
      : ''

    const gotoBtn = r.presetView
      ? '<button class="agent-goto" type="button">去看结构 →</button>'
      : ''

    const html = `
      <div class="agent-fb ${okCls}">
        <div class="agent-fb-head">${head}</div>
        ${exp}
        ${gotoBtn}
      </div>`

    const card = panel.addCard(html, 'agent-feedback')

    const goto = card.querySelector('.agent-goto')
    if (goto && r.presetView) {
      goto.addEventListener('click', () => gotoStructure(r.presetView))
    }

    // 答错时把错因与引导话术交给模型，让 grade 节点接着说。
    // ★ 不把题目 id 发给模型：它不需要，内部 id 泄露也无益——错因与话术足够它接上话。
    // ★ 诊断动作**不在这里自动执行**：那会让画面在学生还没看懂时就变了。
    //   按 grade 节点的纪律，动作应由模型编排并逐步下发（学生点「下一步」）。
    if (!r.correct) {
      panel.addChip(`错因：${r.causeLabel || '待诊断'}`, 'warn')
      if (r.followUp && typeof panel.runAgent === 'function') {
        panel.runAgent(
          '学生刚刚答错了一道题。'
          + `错因类型：${r.causeType || '未归类'}（${r.causeLabel || ''}）。`
          + '请按 grade 节点的纪律引导他：先下发诊断动作让他自己看出矛盾，'
          + '**不要直接说出正确答案**，也不要用"你错了"开头。'
          + `可参考的引导话术：${r.followUp}`,
        )
      }
    }
  }

  /** 把一道题的预设观察状态下发到视图 */
  function gotoStructure(presetView) {
    const actions = (presetView && presetView.actions) || []
    if (!actions.length) return
    // ★ 若当前停在 quiz 节点，先切回 explain：quiz 节点结构上没有 hand 授权，
    //   且（P5 之后）storyboard 在 quiz 期间会冻结写入——那会把这次合法的演示也拦掉。
    if (app.node === 'quiz' || app.node === 'grade') {
      try { app.setNode('explain') } catch (e) { /* 节点名固定合法，忽略 */ }
    }
    app.storyboard.applySequence(actions, { auto: false }).then((r) => {
      if (r && r.failed && r.failed.length) {
        panel.addChip(`有 ${r.failed.length} 个动作没被接受`, 'warn')
      }
    }).catch(() => { panel.addChip('下发演示动作失败', 'warn') })
  }

  // ==========================================================================
  // 练习模式（纯本地：出题、判分、提示、答案都不经过模型）
  //
  // ★ 为什么必须是本地的：练习的诉求是"**只给用户看题目**，然后他作答"。
  //   上一版是发一句"请讲解 X 讲完给我出几道题"让模型自由发挥，结果模型按
  //   explain 节点的纪律做了演示、却没出题——学生看到的只有画面在动，
  //   没有题干也没有选项（实测反馈）。出题引擎与题库本就是本地的，
  //   直接调用即可：既快（零 token），也不受模型是否配合的影响。
  //
  // ★ 三种题型：选择题（引擎生成，答案程序算定）/ 判断题 / 问答题（人工题库）。
  //   轮换出现，避免一路只做同一种。
  // ==========================================================================

  /** 当前练习会话；null 表示不在练习中 */
  let session = null

  /** 开始一次练习。@param {string} kp 知识点 id（如 crystal:C1） */
  function startPractice(kp) {
    const meta = deps.kpLabel ? deps.kpLabel(kp) : String(kp || '').replace(/^crystal:/, '')
    session = { kp, kpLabel: meta, index: 0, correct: 0, kindCursor: 0 }
    panel.addChip(`开始练习：${meta}（共 3 种题型轮换，随时可退出）`, 'info')
    nextPracticeQuestion()
  }

  /** 结束练习 */
  function endPractice(silent) {
    if (!session) return
    const s = session
    session = null
    if (!silent) {
      panel.addChip(`练习结束：共作答 ${s.index} 题，答对 ${s.correct} 题`, 'info')
    }
  }

  /** 出下一题。题型按 选择 → 判断 → 问答 轮换；某类题用尽时自动跳下一类。 */
  function nextPracticeQuestion() {
    if (!session) return
    const { kp } = session
    // 轮换顺序：0 选择、1 判断、2 问答
    for (let attempt = 0; attempt < 3; attempt++) {
      const kind = ['choice', 'judge', 'short'][session.kindCursor % 3]
      session.kindCursor++
      const q = buildQuestion(kind, kp)
      if (q) { session.index++; return renderPracticeQuestion(q) }
    }
    // 三类都取不到（该知识点的题已用完）
    panel.addChip('这个知识点的题目已经出完了，换个知识点或退出练习吧', 'warn')
    endPractice(true)
  }

  /**
   * 按题型组一道题。
   * ★ 选择题走引擎（`module_.handlers.generateQuiz` —— 与模型调用的是同一个函数）；
   *   判断题/问答题从人工题库取，并**跳过本次会话已经出过的**（避免同一题重复出现）。
   */
  function buildQuestion(kind, kp) {
    if (kind === 'choice') {
      const r = module_.handlers.generateQuiz({ kp })
      if (!r || r.error || !Array.isArray(r.options)) return null
      // ★ 出题时下发**中性题境演示**（`questionView`）——这就是"出题时的演示"：
      //   切到这道题的晶体、开原子与线框、调 iso 视角。学生点「下一步」能建立题境，
      //   而画面**不含**任何指向答案的图层（对称元素 / 空隙 / 点阵点）。
      //   它与普通演示走同一条分镜队列（同样逐步、同样有旁白），只是内容中性——
      //   即"在普通演示基础上为练习系统做的改动"。
      //   ★ 揭示答案的 `presetView` 留在本地（见 peek），只在答后 / 点「去看结构」时用。
      if (r.questionView && Array.isArray(r.questionView.actions) && app.storyboard) {
        try {
          app.storyboard.applySequence(r.questionView.actions, { auto: false })
        } catch (e) { /* 题境演示失败不应影响出题本身 */ }
      }
      return { kind: 'choice', kp, id: r.id, stem: r.stem, options: r.options }
    }
    const pool = kind === 'judge' ? judgmentFor(kp) : shortFor(kp)
    if (!pool.length) return null
    const used = (session.used = session.used || {})
    const key = (q) => kind + ':' + q.text
    const fresh = pool.filter((q) => !used[key(q)])
    const pick = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length ? fresh.length : pool.length))]
    if (!pick) return null
    used[key(pick)] = true
    return Object.assign({ kind }, pick)
  }

  /** 渲染一道练习题（含退出 / 提示 / 看答案） */
  function renderPracticeQuestion(q) {
    const s = session
    const kindTag = { choice: '选择题', judge: '判断题', short: '问答题' }[q.kind]
    // ★ 题型标签放在**顶栏**，不放在题干里：放题干里会被 textContent 连成一串
    //   （"…是什么？选择题"），「复制原文」拿到的东西就脏了。
    const head = `
      <div class="agent-practice-head">
        <span class="agent-practice-kp">${esc(s.kpLabel)}</span>
        <span class="agent-practice-kind">${kindTag}</span>
        <span class="agent-practice-idx">第 ${s.index} 题</span>
        <button class="agent-practice-exit" type="button">退出练习</button>
      </div>`

    const stem = `<div class="agent-q-stem">${panel.renderRich ? panel.renderRich(q.stem || q.text) : esc(q.stem || q.text)}</div>`

    let body = ''
    if (q.kind === 'choice') {
      body = '<div class="agent-opts">' + q.options.map((text, i) =>
        `<button class="agent-opt" type="button" data-i="${i}">${'ABCD'[i] || i + 1}. ${esc(text)}</button>`
      ).join('') + '</div>'
    } else if (q.kind === 'judge') {
      body = `<div class="agent-opts agent-judge">
        <button class="agent-opt" type="button" data-j="1">✓ 正确</button>
        <button class="agent-opt" type="button" data-j="0">✗ 错误</button>
      </div>`
    } else {
      body = `<div class="agent-short">
        <textarea class="agent-short-input" rows="3" placeholder="用自己的话写下来，再对照参考答案…"></textarea>
        <button class="agent-short-submit" type="button">提交作答</button>
      </div>`
    }

    const tools = `
      <div class="agent-practice-tools">
        <button class="agent-practice-hint" type="button">💡 提示</button>
        <button class="agent-practice-show" type="button">看答案</button>
      </div>`

    const card = panel.addCard(
      `<div class="agent-practice">${head}${stem}${body}${tools}</div>`, 'agent-practice-card')

    card.querySelector('.agent-practice-exit').addEventListener('click', () => {
      card.querySelectorAll('button, textarea').forEach((b) => { b.disabled = true })
      panel.addChip('已退出练习', 'info')
      endPractice(true)
    })
    card.querySelector('.agent-practice-hint').addEventListener('click', (e) => {
      e.currentTarget.disabled = true
      panel.addChip('提示：' + hintFor(q), 'info')
    })
    card.querySelector('.agent-practice-show').addEventListener('click', (e) => {
      e.currentTarget.disabled = true
      revealAnswer(card, q)
    })

    if (q.kind === 'choice') {
      card.querySelectorAll('.agent-opt').forEach((btn) => {
        btn.addEventListener('click', () => answerChoice(q, Number(btn.dataset.i), card))
      })
    } else if (q.kind === 'judge') {
      card.querySelectorAll('.agent-opt').forEach((btn) => {
        btn.addEventListener('click', () => answerJudge(q, btn.dataset.j === '1', card))
      })
    } else {
      card.querySelector('.agent-short-submit').addEventListener('click', () => {
        const ta = card.querySelector('.agent-short-input')
        if (!ta.value.trim()) { panel.addChip('先写点什么再提交吧', 'warn'); return }
        ta.disabled = true
        card.querySelector('.agent-short-submit').disabled = true
        revealAnswer(card, q, ta.value.trim())
      })
    }
    return card
  }

  /** 提示文本：选择题给"看哪个量"的指引，判断/问答题由题库自带或按需生成 */
  function hintFor(q) {
    if (q.kind === 'choice') return '回到题目里找出"要求的是哪个量"，注意区分"晶胞内含"与"每个球周围"。'
    if (q.kind === 'judge') return '先找出这句话里**最关键的术语**，再想它的定义是否真如这句话所说。'
    return '先想清楚涉及的概念定义，再按"定义 → 应用到本题"的顺序组织回答。'
  }

  /** 展开参考答案 / 解析（选择与判断题即判分） */
  function revealAnswer(card, q, studentAnswer) {
    let bodyHtml = ''
    if (q.kind === 'choice') {
      // ★ 走**只读的 peek**，不走 checkAnswer —— 后者要求合法下标且会记一次"作答"，
      //   用它实现"看答案"等于伪造作答记录（见 quiz/index.js 的 peek 说明）。
      const p = deps.quiz && deps.quiz.peek ? deps.quiz.peek(q.id) : { error: '答案暂不可用' }
      if (p.error) return panel.addChip(p.error, 'warn')
      bodyHtml = `<div class="agent-fb-head">正确答案：<b>${esc(p.answerText)}</b></div>`
        + (p.explanation ? `<div class="agent-fb-exp">${panel.renderRich ? panel.renderRich(p.explanation) : esc(p.explanation)}</div>` : '')
    } else if (q.kind === 'judge') {
      bodyHtml = `<div class="agent-fb-head">正确答案：<b>${q.answer ? '正确' : '错误'}</b></div>
        <div class="agent-fb-exp">${panel.renderRich ? panel.renderRich(q.exp) : esc(q.exp)}</div>`
    } else {
      const mine = studentAnswer
        ? `<div class="agent-fb-exp agent-short-mine">你的作答：${esc(studentAnswer)}</div>` : ''
      bodyHtml = mine
        + '<div class="agent-fb-head">参考答案</div>'
        + `<div class="agent-fb-exp">${panel.renderRich ? panel.renderRich(q.answer) : esc(q.answer)}</div>`
        + (q.keyPoints && q.keyPoints.length
          ? `<div class="agent-fb-exp agent-short-points">要点：${q.keyPoints.map(esc).join('；')}</div>` : '')
    }
    // 看过答案后禁止再点选项（否则"先看答案再选对"会污染正确率）
    card.querySelectorAll('.agent-opt, .agent-short-submit').forEach((b) => { b.disabled = true })
    // 看答案 = 答案已揭晓 ⇒ 可以给"答案视角"（选择题才有）
    appendPracticeFeedback(card, bodyHtml, q.kind === 'choice' ? answerViewOf(q.id) : null)
  }

  /** 选择题作答：走与本地面板同一条判分链（不经模型） */
  function answerChoice(q, chosenIndex, card) {
    const r = module_.handlers.checkAnswer({ questionId: q.id, chosenIndex })
    if (r && r.error) return panel.addChip(`判分失败：${r.error}`, 'warn')
    card.querySelectorAll('.agent-opt').forEach((btn) => {
      btn.disabled = true
      const i = Number(btn.dataset.i)
      if (i === r.answerIndex) btn.classList.add('right')
      else if (i === chosenIndex) btn.classList.add('wrong')
    })
    if (session) { if (r.correct) session.correct++ }
    const head = r.correct
      ? '✓ 答对了'
      : `✗ 答错了　正确答案是 <b>${esc(r.answerText)}</b>`
    const exp = r.explanation
      ? `<div class="agent-fb-exp">${panel.renderRich ? panel.renderRich(r.explanation) : esc(r.explanation)}</div>` : ''
    // ★ 此刻答案已经揭晓，可以给"答案视角"了（答前给就是泄题）
    appendPracticeFeedback(card, `<div class="agent-fb-head">${head}</div>${exp}`,
      r.presetView || answerViewOf(q.id))
  }

  /** 判断题作答：本地比较布尔值 */
  function answerJudge(q, chosen, card) {
    const correct = (chosen === q.answer)
    card.querySelectorAll('.agent-opt').forEach((btn) => {
      btn.disabled = true
      const b = btn.dataset.j === '1'
      if (b === q.answer) btn.classList.add('right')
      else if (b === chosen) btn.classList.add('wrong')
    })
    if (session) { if (correct) session.correct++ }
    const head = correct ? '✓ 答对了' : `✗ 答错了　正确答案是 <b>${q.answer ? '正确' : '错误'}</b>`
    const exp = q.exp
      ? `<div class="agent-fb-exp">${panel.renderRich ? panel.renderRich(q.exp) : esc(q.exp)}</div>` : ''
    appendPracticeFeedback(card, `<div class="agent-fb-head">${head}</div>${exp}`)
  }

  /**
   * 把反馈块接到题目卡下方，并给一个「下一题」。
   * ★ 反馈块**接在卡片内**（而不是新开一张卡）：题目与反馈并排看才有复盘价值，
   *   分成两条消息会因为滚动而错开。
   * @param {Object} [presetView] 答后的"答案视角"——只在**答完/看过答案之后**才传进来
   *   （它就是 `buildPresetView` 的产物，会打开对称元素/空隙/点阵点等图层，即答案本身）
   */
  function appendPracticeFeedback(card, bodyHtml, presetView) {
    const old = card.querySelector('.agent-practice-fb')
    if (old) old.remove()
    const fb = document.createElement('div')
    fb.className = 'agent-practice-fb'
    const goto = (presetView && presetView.actions && presetView.actions.length)
      ? '<button class="agent-goto" type="button">去看结构 →</button>' : ''
    fb.innerHTML = bodyHtml + goto
      + '<div class="agent-practice-next-row"><button class="agent-next" type="button">下一题 →</button></div>'
    card.querySelector('.agent-practice').appendChild(fb)
    const gb = fb.querySelector('.agent-goto')
    if (gb) gb.addEventListener('click', () => { gb.disabled = true; gotoStructure(presetView) })
    fb.querySelector('.agent-next').addEventListener('click', () => {
      fb.querySelector('.agent-next').disabled = true
      nextPracticeQuestion()
    })
    // 滚到反馈处（题目卡可能较长）
    if (fb.scrollIntoView) { try { fb.scrollIntoView({ block: 'nearest' }) } catch (e) { /* 忽略 */ } }
  }

  /** 取某道题的"答案视角"（本地数据，仅供答后使用）；取不到返回 null */
  function answerViewOf(questionId) {
    if (!deps.quiz || !deps.quiz.peek) return null
    const p = deps.quiz.peek(questionId)
    return p && !p.error ? p.presetView : null
  }

  return {
    handleToolResult, renderQuestion, renderFeedback, gotoStructure,
    // 练习模式
    startPractice, endPractice, nextPracticeQuestion,
    _pending: pending,
    /** 供测试：当前是否在练习中 */
    _session: () => session,
  }
}

export default createQuizUI
