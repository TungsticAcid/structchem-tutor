/**
 * tools.js（orbit 模块）—— 模块专属工具
 *
 * ★ 这里只放**模块专属**的工具。`getSnapshot` / `listSceneActions` /
 *   `applySceneActions` / `loadKnowledge` / `loadSkill` / `reviseDemo` 语义与模块无关，
 *   由中枢实现一次并分派给当前激活模块（见 `packages/agent-core/app.js`）。
 *   上游的 `tool-registry.js` 里把这 15 个混在一张表里，搬进来时按这条界线分开。
 *
 * ★ `queryOrbital` 是**防幻觉的核心**（CLAUDE.md §一.2：数值一律程序算，模型不得口算）。
 *   它把"3d 有几个节面""2p 的径向峰在哪"这类问题变成一次确定性查询。
 *   上游实现里的 `note` / `formula` 字段**逐字保留**——它们不是装饰：
 *   比如 `angleToZ` 的那句"常见错误是用 cosθ = m/l（分母应为 √(l(l+1))）"，
 *   正是学生最常犯的错，写进工具结果里模型才能对症解释。
 */
import { OM } from './core/math.js'
import { Observables } from './core/observables.js'
import { Hybrids } from './core/hybrids.js'
// ★ 字典的副作用 import：下面的 def() 里那些说明文字在**模块求值阶段**就要取译文。
import './i18n.js'
import { t } from '../../packages/i18n/index.js'

/**
 * 创建 orbit 模块的工具层。
 *
 * @param {Object} opts
 * @param {Object} opts.facade  模块门面（取当前状态用）
 * @param {Object} [opts.quiz]  出题引擎（教学类工具，未注入则**如实为空**）
 * @param {Object} [opts.mastery] 掌握度模型
 * @param {Object} [opts.skills]  技能目录
 * @param {Object} [opts.diagnosis] 错因诊断
 * @returns {{defs, handlers, names}}
 */
export function createOrbitTools(opts = {}) {
  const facade = opts.facade

  /**
   * 给对象装一个字段：值是函数时装成**取值器**，否则直接赋值。
   *
   * ★ 为什么工具说明要惰性求值：工具定义在**模块装配时**构造一次，而语言可以在
   *   会话中途切换 —— 写成普通字符串就会把装配时的语言固化进 schema，
   *   切到英文后模型看到的仍是一份中文工具说明，而这不报错。
   *   取值器在每次组装请求体（`JSON.stringify(tools)`）时才求值。
   *   已核对链路：`tool-registry.definitions()` 返回的是**原对象**（不克隆、不冻结），
   *   而 `llm-client.buildBody()` 每轮都对新请求体做一次 `JSON.stringify` ⇒ 每轮都会重新取。
   */
  const lazy = (obj, key, value) => {
    if (typeof value === 'function') {
      Object.defineProperty(obj, key, { enumerable: true, configurable: true, get: value })
    } else {
      obj[key] = value
    }
  }

  const def = (name, description, properties, required) => {
    const fn = { name, parameters: { type: 'object', properties: {}, required: required || [] } }
    lazy(fn, 'description', description)
    for (const [k, v] of Object.entries(properties || {})) {
      const prop = {}
      for (const [pk, pv] of Object.entries(v)) lazy(prop, pk, pv)
      fn.parameters.properties[k] = prop
    }
    return { type: 'function', function: fn }
  }

  const defs = {
    read: [],
    query: [
      def('queryOrbital', () => t('orbit.tool.queryOrbital.desc'), {
        kind: {
          type: 'string',
          enum: ['nodes', 'radialZeros', 'radialPeaks', 'angularNodes', 'energy', 'degeneracy',
            'normalization', 'shape', 'compare', 'observables', 'meanR', 'angleToZ', 'energySplit',
            'hybrids'],
        },
        n: { type: 'integer', description: () => t('orbit.tool.queryOrbital.p.n') },
        l: { type: 'integer', description: () => t('orbit.tool.queryOrbital.p.l') },
        m: { type: 'integer', description: () => t('orbit.tool.queryOrbital.p.m') },
        mode: { type: 'string', enum: ['real', 'complex'],
          description: () => t('orbit.tool.queryOrbital.p.mode') },
        a: { type: 'object', description: () => t('orbit.tool.queryOrbital.p.a') },
        b: { type: 'object', description: () => t('orbit.tool.queryOrbital.p.b') },
        set: { type: 'string', enum: ['sp3', 'sp2', 'sp'],
          description: () => t('orbit.tool.queryOrbital.p.set') },
      }, ['kind']),
    ],
    hand: [],
    teach: [],
  }

  const handlers = {
    /**
     * 确定性查询。**逐字移植上游实现**——包括每条 note 与 formula。
     *
     * ★ 参数缺省时的报错要说清"需要什么"，而不是笼统的"参数无效"：
     *   模型据此能立刻改对，不必再试一轮。
     */
    queryOrbital(p) {
      const n = p && p.n
      const l = p && p.l
      const m = p && p.m
      const mode = (p && p.mode) || 'real'
      const needNL = () => (n == null || l == null)

      switch (p && p.kind) {
        case 'nodes':
          if (needNL()) return { error: t('orbit.tool.err.needNL') }
          return Object.assign(OM.nodes(n, l), { note: t('orbit.tool.note.nodes') })
        case 'radialZeros':
          if (needNL()) return { error: t('orbit.tool.err.needNL') }
          return { radii: OM.radialZeros(n, l), unit: 'a0', count: OM.radialZeros(n, l).length }
        case 'radialPeaks':
          if (needNL()) return { error: t('orbit.tool.err.needNL') }
          return { radii: OM.radialPeaks(n, l), unit: 'a0', note: t('orbit.tool.note.radialPeaks') }
        case 'angularNodes': {
          if (needNL()) return { error: t('orbit.tool.err.needNL') }
          const a = OM.angularNodes(l, Math.abs(m == null ? 0 : m), mode)
          return {
            conesDeg: a.cones.map((th) => +((th * 180) / Math.PI).toFixed(2)),
            planesDeg: a.planes.map((th) => +((th * 180) / Math.PI).toFixed(2)),
            note: t('orbit.tool.note.angularNodes'),
          }
        }
        case 'energy':
          if (n == null) return { error: t('orbit.tool.err.needN') }
          return { eV: +OM.energy(n).toFixed(4), formula: 'E_n = -13.6/n² eV' }
        case 'degeneracy':
          if (n == null) return { error: t('orbit.tool.err.needN') }
          return { withoutSpin: OM.degeneracy(n), withSpin: 2 * OM.degeneracy(n) }
        case 'normalization':
          if (needNL()) return { error: t('orbit.tool.err.needNL') }
          return { note: t('orbit.tool.note.normalization'), Nrad: null }
        case 'shape':
          if (needNL() || m == null) return { error: t('orbit.tool.err.needNLM') }
          return OM.shapeDescribe(l, m, mode)

        // ---- 力学量（全部解析式，见 observables.js）----
        case 'observables': {
          if (needNL() || m == null) return { error: t('orbit.tool.err.needNLM') }
          return Object.assign({ note: t('orbit.tool.note.observables') },
            Observables.report(n, l, m))
        }
        case 'meanR': {
          if (needNL()) return { error: t('orbit.tool.err.needNL') }
          return {
            meanR: +Observables.meanR(n, l).toFixed(4),
            meanInvR: +Observables.meanInvR(n).toFixed(4),
            meanR2: +Observables.meanR2(n, l).toFixed(4),
            deltaR: +Observables.deltaR(n, l).toFixed(4),
            unit: 'a₀',
            formula: t('orbit.tool.formula.meanR'),
            note: t('orbit.tool.note.meanR'),
          }
        }
        case 'energySplit': {
          if (n == null) return { error: t('orbit.tool.err.needN') }
          return Object.assign({ unit: 'eV' }, Observables.energyBreakdown(n))
        }
        case 'angleToZ': {
          if (l == null || m == null) return { error: t('orbit.tool.err.needLM') }
          const a = Observables.angleToZ(l, m)
          if (!a.defined) return { defined: false, note: a.note }
          return {
            cosTheta: +a.cos.toFixed(6),
            thetaDeg: +a.deg.toFixed(3),
            formula: 'cosθ = m / √(l(l+1))',
            note: t('orbit.tool.note.angleToZ'),
          }
        }
        case 'compare': {
          if (!p.a || !p.b) return { error: t('orbit.tool.err.needAB') }
          const A = p.a
          const B = p.b
          const na = OM.nodes(A.n, A.l)
          const nb = OM.nodes(B.n, B.l)
          return {
            a: { n: A.n, l: A.l, m: A.m, nodes: na, energy: +OM.energy(A.n).toFixed(4) },
            b: { n: B.n, l: B.l, m: B.m, nodes: nb, energy: +OM.energy(B.n).toFixed(4) },
            diff: {
              radialNodes: na.radial - nb.radial,
              angularNodes: na.angular - nb.angular,
              energy_eV: +(OM.energy(A.n) - OM.energy(B.n)).toFixed(4),
            },
          }
        }
        case 'hybrids': {
          // ★ 这里的方向与夹角都是**由系数反解**出来的，不写死 109.47：
          //   · 实球谐的坐标对应已核实为 m=+1↔p_x、m=−1↔p_y、m=0↔p_z（见 core/hybrids.js），
          //     所以把三项 p 的实系数当成矢量的三个分量即可得到指向；
          //   · 夹角取 arccos(dᵢ·dⱼ)。
          //   写死数值就等于让模型背一个常量 —— 而 CLAUDE.md §一.2 要的正是
          //   "数值由程序算"，否则它改一条系数，回答里还是那个老夹角。
          const only = (p && p.set) || null
          const list = only ? [Hybrids.set(only)] : Hybrids.SETS
          if (only && !list[0]) {
            return { error: t('orbit.tool.err.unknownHybridSet',
              { only, list: Hybrids.setIds().join(' / ') }) }
          }
          const out = list.map((set) => {
            const orbitals = []
            for (let i = 0; i < set.count; i++) {
              const terms = set.terms(i)
              const pickP = (mm) => {
                const t = terms.find((u) => u.l === 1 && u.m === mm)
                return t ? t.c.re : 0
              }
              const v = [pickP(1), pickP(-1), pickP(0)]     // p_x, p_y, p_z
              const nv = Math.hypot(v[0], v[1], v[2]) || 1
              let s2 = 0, p2 = 0
              for (const t of terms) {
                const w = t.c.re * t.c.re + t.c.im * t.c.im
                if (t.l === 0) s2 += w; else p2 += w
              }
              orbitals.push({
                index: i,
                label: set.labels[i],
                direction: v.map((x) => +(x / nv).toFixed(6)),
                sCharacter: +s2.toFixed(6),
                pCharacter: +p2.toFixed(6),
              })
            }
            const angles = []
            for (let i = 0; i < orbitals.length; i++) {
              for (let j = i + 1; j < orbitals.length; j++) {
                const a = orbitals[i].direction, b = orbitals[j].direction
                const c = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
                angles.push({ pair: [i, j], deg: +(Math.acos(c) * 180 / Math.PI).toFixed(3) })
              }
            }
            return { set: set.id, label: set.label, count: set.count, orbitals, angles }
          })
          return { hybrids: out }
        }
        default:
          return { error: t('orbit.tool.err.unknownKind', { kind: p && p.kind }) }
      }
    },
  }

  /**
   * 教学类工具：**定义与实现必须同生共死**。
   *
   * ★ 上游 `tool-registry.js` 里有过反例：`generateQuestion` 只在 TOOLS 里声明、
   *   EXEC 里没实现，于是模型每次调用都收到"未知工具"，只好把题目写进正文里讲，
   *   界面上既没有卡片也没有选项（它的注释把这件事记下来了）。
   *   本仓库也记过同一条教训（"注册了不等于生效"）。
   *   所以下面把 def 与 handler 写在**同一个 if 里**，缺引擎就两者都没有——
   *   **如实为空**，而不是给模型一个调不动的名字。
   */
  const quiz = opts.quiz
  const diagnosis = opts.diagnosis
  const mastery = opts.mastery

  if (quiz) {
    defs.teach.push(
      def('generateQuestion', () => t('orbit.tool.generateQuestion.desc'), {
        knowledgePoint: { type: 'string',
          description: () => t('orbit.tool.generateQuestion.p.knowledgePoint') },
        difficulty: { type: 'string',
          description: () => t('orbit.tool.generateQuestion.p.difficulty') },
        exclude: { type: 'array', items: { type: 'string' },
          description: () => t('orbit.tool.generateQuestion.p.exclude') },
      }, ['knowledgePoint']),
      def('generateVariant', () => t('orbit.tool.generateVariant.desc'), {
        questionId: { type: 'string' },
      }, ['questionId']),
      def('explainConcept', () => t('orbit.tool.explainConcept.desc'), {
        knowledgePoint: { type: 'string' },
      }, ['knowledgePoint']),
      def('evaluateFeynman', () => t('orbit.tool.evaluateFeynman.desc'), {
        knowledgePoint: { type: 'string' },
        transcript: { type: 'string',
          description: () => t('orbit.tool.evaluateFeynman.p.transcript') },
      }, ['knowledgePoint', 'transcript']),
    )

    handlers.generateQuestion = (p) => {
      const kp = p && p.knowledgePoint
      if (!kp) return { error: t('orbit.tool.err.kpRequired') }
      const fn = quiz.askQuestion || quiz.generate
      if (typeof fn !== 'function') return { error: t('orbit.tool.err.noQuizGenerate') }
      return fn.call(quiz, kp, p && p.difficulty, p && p.exclude)
    }
    handlers.generateVariant = (p) => {
      if (!p || !p.questionId) return { error: t('orbit.tool.err.qidRequired') }
      if (typeof quiz.variant !== 'function') return { error: t('orbit.tool.err.noQuizVariant') }
      return quiz.variant(p.questionId)
    }
    handlers.explainConcept = (p) => {
      if (!p || !p.knowledgePoint) return { error: t('orbit.tool.err.kpRequired') }
      if (typeof quiz.explain !== 'function') return { error: t('orbit.tool.err.noQuizExplain') }
      return quiz.explain(p.knowledgePoint, p)
    }
    handlers.evaluateFeynman = (p) => {
      if (!p || !p.knowledgePoint) return { error: t('orbit.tool.err.kpRequired') }
      if (typeof p.transcript !== 'string' || !p.transcript.trim()) {
        return { error: t('orbit.tool.err.transcriptRequired') }
      }
      if (typeof quiz.evaluateFeynman !== 'function') {
        return { error: t('orbit.tool.err.noQuizFeynman') }
      }
      return quiz.evaluateFeynman(p.knowledgePoint, p.transcript)
    }
  }

  /**
   * 费曼复述的入口：要**技能目录**（取 `feynman` 技能的评分要点）。
   * ★ 与 `evaluateFeynman` 分属两个引擎（入口在技能库、评估在出题引擎），
   *   所以两个 if 分开写——缺哪个就少哪个，各自如实。
   */
  const skills = opts.skills
  if (skills && typeof skills.load === 'function') {
    defs.teach.push(
      def('startFeynmanCheck', () => t('orbit.tool.startFeynmanCheck.desc'), {
        knowledgePoint: { type: 'string' },
      }, ['knowledgePoint']),
    )
    handlers.startFeynmanCheck = (p) => {
      if (!p || !p.knowledgePoint) return { error: t('orbit.tool.err.kpRequired') }
      const s = skills.load('feynman')
      if (!s) return { error: t('orbit.tool.err.noFeynmanSkill') }
      return {
        skill: 'feynman',
        knowledgePoint: p.knowledgePoint,
        invitation: t('orbit.tool.feynmanInvitation'),
        rubric: (s.steps && s.steps.length) ? s.steps : [],
        note: t('orbit.tool.feynmanNote'),
      }
    }
  }

  if (diagnosis) {
    defs.teach.push(
      def('diagnoseError', () => t('orbit.tool.diagnoseError.desc'), {
        questionId: { type: 'string' },
        chosenIndex: { type: 'integer' },
        correctIndex: { type: 'integer' },
      }, ['questionId']),
    )
    handlers.diagnoseError = (p) => {
      if (typeof diagnosis.diagnose !== 'function') return { error: t('orbit.tool.err.noDiagnosis') }
      return diagnosis.diagnose(p && p.questionId, p && p.chosenIndex, p && p.correctIndex)
    }
  }

  if (mastery) {
    defs.teach.push(
      def('updateMastery', () => t('orbit.tool.updateMastery.desc'), {
        knowledgePoint: { type: 'string' },
        delta: { type: 'number', description: () => t('orbit.tool.updateMastery.p.delta') },
      }, ['knowledgePoint']),
      def('recommendNext', () => t('orbit.tool.recommendNext.desc'), {
        count: { type: 'integer', description: () => t('orbit.tool.recommendNext.p.count') },
      }),
    )
    handlers.updateMastery = (p) => {
      if (!p || !p.knowledgePoint) return { error: t('orbit.tool.err.kpRequired') }
      if (typeof mastery.update !== 'function') return { error: t('orbit.tool.err.noMasteryUpdate') }
      return mastery.update(p.knowledgePoint, p.delta)
    }
    handlers.recommendNext = (p) => {
      if (typeof mastery.recommend !== 'function') {
        return { error: t('orbit.tool.err.noMasteryRecommend') }
      }
      return mastery.recommend(p && p.count)
    }
  }

  const names = () => Object.values(defs).flat().map((d) => d.function.name)

  return { defs, handlers, names }
}

export default createOrbitTools
