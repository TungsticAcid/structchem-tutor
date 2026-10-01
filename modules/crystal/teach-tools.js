/**
 * teach-tools.js — 晶体模块的 teach 类工具（出题 / 判分 / 诊断 / 学情）
 *
 * 这些工具把 `quiz/` 引擎暴露给模型调用。它们与 `tools.js` 的 query 类工具有个
 * 根本区别：**query 只读事实，teach 会推进教学流程**（出题、判定、诊断、记录掌握度），
 * 故它们的可见性由决策节点严格裁决：
 *
 *   · `generateQuiz`  只在 **quiz 节点**可见（经 `allowExtra` 单点放行）
 *   · `checkAnswer` / `diagnoseError` / `generateVariant` / `recordLearningEvent`
 *     只在 **grade 节点**可见（它本就有 teach 授权）
 *
 * ★ 为什么给 quiz 节点用 `allowExtra: ['generateQuiz']` 而不是 `grants: [..., 'teach']`：
 *   后者会连带把 `checkAnswer` 一起放开——**出题节点就获得了判卷能力**，
 *   它可能"顺手"把答案判了，绕过学生作答这一环。单点放行才符合
 *   "能用权限表达的就不要用文字表达"（CLAUDE.md §一.1）。
 *
 * ★ 这些工具**都不返回答案**（除 checkAnswer 判分后），因为答案冻结在引擎的题库里。
 *   模型拿到的题目只有题干与选项文本——**结构上无法泄题**。
 */

import { startFeynman } from '../../packages/agent-core/core/feynman.js'
import { evaluateTranscript } from './quiz/data/feynman-keys.js'

const def = (name, description, properties, required) => ({
  type: 'function',
  function: {
    name, description,
    parameters: { type: 'object', properties: properties || {}, required: required || [] },
  },
})

/** 把 'C5' / 'crystal:C5' 统一为 'crystal:C5' */
const normKp = (kp) => {
  const s = String(kp || '').trim()
  return s.includes(':') ? s : `crystal:${s}`
}

/**
 * 创建 teach 类工具。
 *
 * @param {Object} opts
 * @param {Object} opts.quiz     createQuizEngine 的返回值
 * @param {Object} [opts.facade] 晶体模块门面（诊断动作用它校验 id）
 * @param {Object} [opts.mastery] 掌握度模型（缺省则不记学情，工具会如实说明）
 * @param {Object} [opts.skills]  技能目录（发起费曼复述要用 feynman 技能正文）
 */
export function createTeachTools(opts = {}) {
  const quiz = opts.quiz
  if (!quiz) throw new Error('createTeachTools 需要 opts.quiz')
  const mastery = opts.mastery || null
  const skills = opts.skills || null
  // ★ facade 原先没解构（老的 handler 用不到），但 recommendNext 要用它取"当前晶体"
  //   来算关联度——漏了它会在调用时报 ReferenceError（被本地测试当场抓到）。
  const facade = opts.facade || null

  const defs = {
    teach: [
      def('generateQuiz',
        '出一道练习题。**返回的题目不含答案**——答案已由程序算定并冻结在本地，你无法看到它，也不要猜测。请把题干与 4 个选项原样呈现给学生（选项是固定顺序的文本数组，按 A/B/C/D 编号），然后等学生作答。学生作答后调用 checkAnswer，判定与解析由本地完成。kptopic 可选：同一知识点可能有多个题型（如 C7 有 cellVolume/density/nearestNeighbor）。', {
        kp: { type: 'string', description: '知识点 id，如 crystal:C5（也可写 C5）' },
        crystalId: { type: 'string', description: '可选：指定晶体；缺省按能力矩阵选强关联的' },
        topic: { type: 'string', description: '可选：指定题型，如 density / intersticesInCell' },
        difficulty: { type: 'string', description: '可选：L1–L4' },
      }, ['kp']),

      def('checkAnswer',
        '判定学生的作答并返回解析。**判定完全在本地完成，不经模型**——你不需要（也不应该）自己判断对错。答错时会一并给出错因与一组**诊断动作**：请按 grade 节点的纪律，把这些动作下发到视图上，引导学生自己看出矛盾，**不要直接说出正确答案**。', {
        questionId: { type: 'string', description: 'generateQuiz 返回的 id' },
        chosenIndex: { type: 'number', description: '学生所选选项的下标（0 起）' },
      }, ['questionId', 'chosenIndex']),

      def('diagnoseError',
        '取某个错因对应的**可视化诊断动作序列**（同一错因的处方）。通常在 checkAnswer 已经给过诊断动作时不必重复调用；当你需要针对学生自己说出的错误认知（而非选项）做诊断时用它。', {
        causeId: { type: 'string', description: '错因 id，如 E-A1（可由 checkAnswer 返回的 causeId 得到）' },
      }, ['causeId']),

      def('generateVariant',
        '基于刚做过的题生成**变式题**（同知识点，只变动一个维度）。★ 变动的维度由**答错的错因类型**决定：概念混淆→换对象、计数错误→换问法、计算失误→换参数、空间想象偏差→换晶体并回头三维。所以尽量把 causeId 一起传进来（它在 checkAnswer 的返回里）——否则只会单调地换晶体。变式题同样**不含答案**，学生作答后仍走 checkAnswer 判分。', {
        questionId: { type: 'string', description: '刚做过的题的 id（generateQuiz 返回的）' },
        causeId: { type: 'string', description: '可选：刚答错时的错因 id，给了才能按错因类型选变式维度' },
      }, ['questionId']),

      def('recordLearningEvent',
        '记录一次学习事件（答对/答错/复述通过），用于掌握度与后续推荐。**每次判分后都应调用一次**，否则学情画像不会更新。delta 的约定：答对 +1、答错 −1、复述通过 +2（连续 2 次答对即标记为已掌握）。', {
        kp: { type: 'string', description: '知识点 id' },
        correct: { type: 'boolean', description: '是否正确（等价于 delta = +1 / −1）' },
        delta: { type: 'number', description: '可选：直接给增量（复述通过传 +2）' },
        causeId: { type: 'string', description: '可选：答错时的错因 id' },
      }, ['kp']),

      def('startFeynmanCheck',
        '发起一次**费曼式复述**：请学生用自己的话讲一遍某个知识点。返回邀请语与**评分要点（rubric）**——请照邀请语提问，并记住这些要点，等学生讲完后用 evaluateFeynman 评估。★ 复述的价值在于暴露理解缺口（而非记忆缺口），故邀请语要强调"别背公式"。', {
        kp: { type: 'string', description: '要复述的知识点 id' },
      }, ['kp']),

      def('evaluateFeynman',
        '评估学生的费曼式复述。返回**关键词匹配**的结果（覆盖了哪几组要点、漏了哪些）与评估指引。★ 匹配结果是**参考而非判决**——它可能漏判同义表述，请结合语义给出最终评价；若确属缺失，针对缺失项追问，但**不要直接说出答案**。', {
        kp: { type: 'string', description: '知识点 id' },
        transcript: { type: 'string', description: '学生复述的原文' },
      }, ['kp', 'transcript']),

      def('recommendNext',
        '推荐下一个该练的知识点。依据是**掌握度最低者优先，同分时优先与当前晶体关联度高的**（关联度取自能力矩阵，不另维护映射表）。', {
        count: { type: 'number', description: '推荐几个（1–3，缺省 1）' },
      }, []),
    ],
  }

  const handlers = {
    generateQuiz(p) {
      const r = quiz.generate({
        kp: p && p.kp,
        crystalId: p && p.crystalId,
        topic: p && p.topic,
        difficulty: p && p.difficulty,
      })
      if (r.error) return r
      // ★ 题目卡已由界面渲染（含 4 个可点击选项）。这里明确告诉模型该做什么、
      //   以及**不该**做什么——实测发现：不说的话，模型出完题一个字也不讲
      //   （它认为"卡片本身就是内容"），学生会觉得莫名其妙多了一张卡。
      return Object.assign({}, r, {
        instruction: '题目卡已经显示给学生了（含 4 个可点击选项）。请用**一句话**说明这道题在考查什么，然后停下来等学生作答。**不要**在文字里重复题干与选项（卡片里已经有了），**不要**提示或暗示答案，也不要自己判分——学生点选后由 checkAnswer 本地判定。',
      })
    },

    checkAnswer(p) {
      const r = quiz.check({ questionId: p && p.questionId, chosenIndex: p && p.chosenIndex })
      if (r.error) return r
      // ★ 判分结果里带上"下一步该做什么"，把 grade 节点的纪律说在前面，
      //   而不是等模型自由发挥
      return Object.assign({}, r, {
        instruction: r.correct
          ? '学生答对了。**不要**只说"答对了"就结束——建议用费曼式复述（loadSkill 取 feynman 技能）请他用自己的话讲一遍，把识别性掌握推进到生成性掌握。'
          : '学生答错了。按 grade 节点纪律：先把 diagnosticActions 下发到视图上，引导他自己看出矛盾，**不要直接说出正确答案**；也不要用"你错了"开头。然后可用 generateVariant 出一道变式题检验是否真正纠正。',
      })
    },

    diagnoseError(p) {
      const id = p && p.causeId
      if (!id) {
        return { error: '需要 causeId（错因编号，如 E-B1）——它来自 checkAnswer 的返回。' }
      }
      // ★ 走引擎**正式导出**的 diagnose。此前这里调的是 `quiz._cause`，而引擎从未
      //   导出过它，于是本工具恒定返回"未找到错因"：白名单放行、模型调得到、
      //   却永远不工作（不报错的那一类缺陷）。
      return quiz.diagnose(id)
    },

    generateVariant(p) {
      const qid = p && p.questionId
      if (!qid) return { error: '需要 questionId（generateQuiz 返回的 id）' }
      return quiz.variant({ questionId: qid, causeId: p && p.causeId })
    },

    recordLearningEvent(p) {
      const kp = p && p.kp
      if (!kp) return { error: '需要 kp' }
      // delta 优先；只给 correct 时按 +1/−1 折算（复述通过请显式传 delta: 2）
      const delta = (p && p.delta != null) ? Number(p.delta) : (p && p.correct ? 1 : -1)
      if (!mastery) {
        return { ok: true, kp, delta, note: '（本次未接入掌握度模型，学情未持久化）' }
      }
      const r = mastery.update(kp, delta)
      if (r.error) return r
      const rec = mastery.recommend(2)
      return Object.assign({}, r, {
        summary: mastery.toText(),
        suggest: r.mastered
          ? '★ 已标记为掌握（连续两次答对）。可以换一个知识点，或请他用复述再巩固一次。'
          : (r.score < 0 ? '掌握度为负，建议回到讲解而不是继续刷题。' : ''),
        nextSuggest: rec.recommended,
      })
    },

    startFeynmanCheck(p) {
      const kp = p && p.kp
      if (!kp) return { error: '需要 kp（要复述哪个知识点）' }
      if (!skills) return { error: '技能库未接入，无法发起费曼复述' }
      const r = startFeynman(skills, normKp(kp))
      if (r.error) return r
      return Object.assign({}, r, {
        instruction: '请**照 invitation 的原话**向学生提问，然后停下来等他说完。★ 中途不要打断纠正（会打击表达意愿）；他讲完后调用 evaluateFeynman({ kp, transcript }) 做评估。',
      })
    },

    evaluateFeynman(p) {
      const kp = p && p.kp
      const t = p && p.transcript
      if (!kp || !t) return { error: '需要 kp 与 transcript（学生复述的原文）' }
      const r = evaluateTranscript(kp, t)
      return Object.assign({}, r, {
        instruction: '请结合语义给出**最终评价**（下面的关键词匹配只是参考，可能漏判同义表述）：① 先明确说出"你讲对了哪一点"——正向确认比泛泛表扬有效；② 再针对确实缺失的要点**追问**，不要直接说出答案；③ 评价完调用 recordLearningEvent 记录（复述通过传 delta: 2）。',
      })
    },

    recommendNext(p) {
      if (!mastery) return { error: '掌握度模型未接入，无法推荐' }
      const snap = facade && typeof facade.getSnapshot === 'function' ? facade.getSnapshot() : null
      const curId = snap && snap.crystal ? snap.crystal.id : null
      return mastery.recommend((p && p.count) || 1, curId)
    },
  }

  /** 工具名清单（供 descriptor 对账） */
  const names = () => defs.teach.map((d) => d.function.name)

  return { defs, handlers, names }
}

export default createTeachTools
