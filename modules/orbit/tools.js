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

  const def = (name, description, properties, required) => ({
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties: properties || {}, required: required || [] } },
  })

  const defs = {
    read: [],
    query: [
      def('queryOrbital',
        '查询轨道的确定性事实（数值一律由程序计算，不得自行口算）。'
        + 'kind 取值：nodes=节点数；radialZeros=径向节点半径；radialPeaks=径向分布峰值半径；'
        + 'angularNodes=角度节面几何；energy=能级(eV)；degeneracy=简并度；'
        + 'normalization=归一化系数；shape=形状描述；compare=两个轨道对比；'
        + 'observables=力学量总览；meanR=平均半径等；angleToZ=角动量与 z 轴夹角；'
        + 'energySplit=能级分解；hybrids=杂化轨道集合（sp³/sp²/sp）的方向、杂化成分与两两夹角。', {
        kind: {
          type: 'string',
          enum: ['nodes', 'radialZeros', 'radialPeaks', 'angularNodes', 'energy', 'degeneracy',
            'normalization', 'shape', 'compare', 'observables', 'meanR', 'angleToZ', 'energySplit',
            'hybrids'],
        },
        n: { type: 'integer', description: '主量子数 1-6' },
        l: { type: 'integer', description: '角量子数 0..n-1' },
        m: { type: 'integer', description: '磁量子数 -l..l' },
        mode: { type: 'string', enum: ['real', 'complex'], description: '波函数形式，默认 real' },
        a: { type: 'object', description: 'kind=compare 时的第一个轨道 {n,l,m}' },
        b: { type: 'object', description: 'kind=compare 时的第二个轨道 {n,l,m}' },
        set: { type: 'string', enum: ['sp3', 'sp2', 'sp'], description: 'kind=hybrids 时限定集合，省略则全部返回' },
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
          if (needNL()) return { error: '需要 n 与 l' }
          return Object.assign(OM.nodes(n, l), {
            note: '径向节点 = n-l-1，角度节面 = l，总数 = n-1（全部由程序计算）',
          })
        case 'radialZeros':
          if (needNL()) return { error: '需要 n 与 l' }
          return { radii: OM.radialZeros(n, l), unit: 'a0', count: OM.radialZeros(n, l).length }
        case 'radialPeaks':
          if (needNL()) return { error: '需要 n 与 l' }
          return { radii: OM.radialPeaks(n, l), unit: 'a0', note: 'D(r)=r²R² 的局部极大（可能有多个）' }
        case 'angularNodes': {
          if (needNL()) return { error: '需要 n 与 l' }
          const a = OM.angularNodes(l, Math.abs(m == null ? 0 : m), mode)
          return {
            conesDeg: a.cones.map((t) => +((t * 180) / Math.PI).toFixed(2)),
            planesDeg: a.planes.map((t) => +((t * 180) / Math.PI).toFixed(2)),
            note: 'cones 为以 z 轴为轴的锥面（给出半顶角）；planes 为过 z 轴的平面（给出方位角）',
          }
        }
        case 'energy':
          if (n == null) return { error: '需要 n' }
          return { eV: +OM.energy(n).toFixed(4), formula: 'E_n = -13.6/n² eV' }
        case 'degeneracy':
          if (n == null) return { error: '需要 n' }
          return { withoutSpin: OM.degeneracy(n), withSpin: 2 * OM.degeneracy(n) }
        case 'normalization':
          if (needNL()) return { error: '需要 n 与 l' }
          return { note: '归一化系数由 formula.js 计算并已显示在公式区', Nrad: null }
        case 'shape':
          if (needNL() || m == null) return { error: '需要 n、l、m' }
          return OM.shapeDescribe(l, m, mode)

        // ---- 力学量（全部解析式，见 observables.js）----
        case 'observables': {
          if (needNL() || m == null) return { error: '需要 n、l、m' }
          return Object.assign({ note: '全部由解析式给出（长度单位 a₀，角动量单位 ħ）' }, Observables.report(n, l, m))
        }
        case 'meanR': {
          if (needNL()) return { error: '需要 n 与 l' }
          return {
            meanR: +Observables.meanR(n, l).toFixed(4),
            meanInvR: +Observables.meanInvR(n).toFixed(4),
            meanR2: +Observables.meanR2(n, l).toFixed(4),
            deltaR: +Observables.deltaR(n, l).toFixed(4),
            unit: 'a₀',
            formula: '⟨r⟩ = (a₀/2)[3n² − l(l+1)]；⟨1/r⟩ = 1/(n²a₀)（与 l 无关）',
            note: '⟨r⟩ 是对全空间加权的平均距离，比"概率最大半径"(≈n²a₀) 小',
          }
        }
        case 'energySplit': {
          if (n == null) return { error: '需要 n' }
          return Object.assign({ unit: 'eV' }, Observables.energyBreakdown(n))
        }
        case 'angleToZ': {
          if (l == null || m == null) return { error: '需要 l 与 m' }
          const a = Observables.angleToZ(l, m)
          if (!a.defined) return { defined: false, note: a.note }
          return {
            cosTheta: +a.cos.toFixed(6),
            thetaDeg: +a.deg.toFixed(3),
            formula: 'cosθ = m / √(l(l+1))',
            note: '常见错误是用 cosθ = m/l（分母应为 √(l(l+1))）',
          }
        }
        case 'compare': {
          if (!p.a || !p.b) return { error: '需要 a 与 b 两个轨道对象' }
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
            return { error: `未知的杂化集合 ${only}（可用：${Hybrids.setIds().join(' / ')}）` }
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
          return { error: '未知 kind：' + (p && p.kind) }
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
      def('generateQuestion', '针对某个知识点出一道题。返回的题目**不含答案**——'
        + '判定与解析由本地完成，你无法看到答案，也不要猜测。', {
        knowledgePoint: { type: 'string', description: '知识点编号（形如 orbit:K1）' },
        difficulty: { type: 'string', description: '可选难度' },
        exclude: { type: 'array', items: { type: 'string' }, description: '可选：要排除的题目 id' },
      }, ['knowledgePoint']),
      def('generateVariant', '基于刚做过的题生成**变式题**（同知识点，只变动一个维度）。', {
        questionId: { type: 'string' },
      }, ['questionId']),
      def('explainConcept', '取某个知识点的**结构化讲解**（定义、要点、例子）。', {
        knowledgePoint: { type: 'string' },
      }, ['knowledgePoint']),
      def('evaluateFeynman', '评估学生的一次费曼式复述：对照该知识点的评分要点，'
        + '指出讲对了什么、缺了什么。**不直接给答案**。', {
        knowledgePoint: { type: 'string' },
        transcript: { type: 'string', description: '学生的复述原文' },
      }, ['knowledgePoint', 'transcript']),
    )

    handlers.generateQuestion = (p) => {
      const kp = p && p.knowledgePoint
      if (!kp) return { error: 'knowledgePoint 必填' }
      const fn = quiz.askQuestion || quiz.generate
      if (typeof fn !== 'function') return { error: '出题引擎未提供 generate/askQuestion' }
      return fn.call(quiz, kp, p && p.difficulty, p && p.exclude)
    }
    handlers.generateVariant = (p) => {
      if (!p || !p.questionId) return { error: 'questionId 必填' }
      if (typeof quiz.variant !== 'function') return { error: '出题引擎未提供 variant' }
      return quiz.variant(p.questionId)
    }
    handlers.explainConcept = (p) => {
      if (!p || !p.knowledgePoint) return { error: 'knowledgePoint 必填' }
      if (typeof quiz.explain !== 'function') return { error: '出题引擎未提供 explain' }
      return quiz.explain(p.knowledgePoint, p)
    }
    handlers.evaluateFeynman = (p) => {
      if (!p || !p.knowledgePoint) return { error: 'knowledgePoint 必填' }
      if (typeof p.transcript !== 'string' || !p.transcript.trim()) return { error: 'transcript 必填' }
      if (typeof quiz.evaluateFeynman !== 'function') return { error: '出题引擎未提供 evaluateFeynman' }
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
      def('startFeynmanCheck', '发起一次费曼式复述：给出邀请语与**评分要点**，'
        + '让学生用自己的话讲一遍，之后用 evaluateFeynman 评估。', {
        knowledgePoint: { type: 'string' },
      }, ['knowledgePoint']),
    )
    handlers.startFeynmanCheck = (p) => {
      if (!p || !p.knowledgePoint) return { error: 'knowledgePoint 必填' }
      const s = skills.load('feynman')
      if (!s) return { error: '费曼技能未注册（技能目录里没有 feynman）' }
      return {
        skill: 'feynman',
        knowledgePoint: p.knowledgePoint,
        invitation: '试着用**你自己的话**说一遍，就当我是完全没学过的同学——不要背公式，讲你理解的那个版本。',
        rubric: (s.steps && s.steps.length) ? s.steps : [],
        note: '学生复述后调用 evaluateFeynman 评估',
      }
    }
  }

  if (diagnosis) {
    defs.teach.push(
      def('diagnoseError', '取某个错因对应的**可视化诊断动作序列**（同一错因的处方）。'
        + '通常在 checkAnswer 已经给过诊断动作时不必重复调用。', {
        questionId: { type: 'string' },
        chosenIndex: { type: 'integer' },
        correctIndex: { type: 'integer' },
      }, ['questionId']),
    )
    handlers.diagnoseError = (p) => {
      if (typeof diagnosis.diagnose !== 'function') return { error: '诊断模块未提供 diagnose' }
      return diagnosis.diagnose(p && p.questionId, p && p.chosenIndex, p && p.correctIndex)
    }
  }

  if (mastery) {
    defs.teach.push(
      def('updateMastery', '按学生这次作答的结果，更新该知识点的掌握度。', {
        knowledgePoint: { type: 'string' },
        delta: { type: 'number', description: '掌握度增量（答对 +1 / 答错 −1 之类由本地规则定）' },
      }, ['knowledgePoint']),
      def('recommendNext', '推荐下一个该练的知识点（依据本机学情）。', {
        count: { type: 'integer', description: '可选：要推荐几个' },
      }),
    )
    handlers.updateMastery = (p) => {
      if (!p || !p.knowledgePoint) return { error: 'knowledgePoint 必填' }
      if (typeof mastery.update !== 'function') return { error: '学情模型未提供 update' }
      return mastery.update(p.knowledgePoint, p.delta)
    }
    handlers.recommendNext = (p) => {
      if (typeof mastery.recommend !== 'function') return { error: '学情模型未提供 recommend' }
      return mastery.recommend(p && p.count)
    }
  }

  const names = () => Object.values(defs).flat().map((d) => d.function.name)

  return { defs, handlers, names }
}

export default createOrbitTools
