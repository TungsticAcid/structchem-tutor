/**
 * actions.js（orbit 模块）—— 动作词汇表与参数校验
 *
 * ★ 真源是上游 `orbit/H5/js/main.js` 的 `ACTIONS` 对象（23 个），此后又按需求扩充。
 *   **权威的条数以 `Object.keys(VOCAB).length` 为准** —— 这里不再写死一个数：
 *   写死的数字每次加动作就落后一次，而"注释说的和实际对不上"比没有注释更糟。
 *   本文件把它们的**取值域**逐条写下来（合法值取自 `index.html` 里各 seg 控件的
 *   `data-*` 与滑块的 min/max），供两件事用：
 *     · `listSceneActions` 按需把清单交给模型（**不进常驻上下文**）
 *     · `validate()` 在动作下发前把关——CLAUDE.md §一.2：数值一律程序算，
 *       模型不得口算或编造，所以取值域必须由程序判，而不是靠提示词劝
 *
 * ★ 为什么校验要写在这里、而不是让运行时的 `applyAction` 自己挡：
 *   上游的 `applyAction` 对**类型错**（如 n 给了字符串）只是 `return false`，
 *   拿不到"为什么不合法、合法值有哪些"。模型收到一句 "动作参数无效"
 *   只能瞎猜；带上取值域它下一步就能改对。
 */

// ★ 等价轨道集合（sp³/sp²/sp）的**唯一**定义在 core/hybrids.js —— 这里只取 id 列表。
//   把集合 id 再抄一遍，就会出现"词汇表认得的集合"与"渲染层画得出的集合"两份真源。
import { Hybrids } from './core/hybrids.js'
// ★ 字典的副作用 import 必须**排在使用 t() 的语句之前**：本文件的 `VOCAB` 是模块级常量，
//   它的 group / desc / params 在**模块求值阶段**就调 t() —— 那时若字典还没注册，
//   `t()` 会原样返回键名（不报错），模型收到的就是 `orbit.act.…desc` 这种字符串。
//   与 index.js 的那行是同一个目的，两处都留着是刻意的：谁先被 import 都不会踩空。
import './i18n.js'
import { t } from '../../packages/i18n/index.js'

/* 各 seg 控件的合法取值（逐条取自 index.html 的 data-* 属性） */
export const ENUMS = {
  wavefunction: ['real', 'complex'],      // #modeSeg  data-mode
  render: ['points', 'surface'],          // #renderSeg data-mode
  psiCriterion: ['psi2', 'psi'],          // #psiSeg   data-mode
  plane: ['xy', 'xz', 'yz'],              // #planeSeg data-p
  sectionMode: ['intensity', 'phase', 'contour'], // #phaseSeg data-mode
  angularWhich: ['Y', 'Y2'],              // #yCritSeg data-k
  viewTarget: ['spherical', 'wave'],      // #targetSeg data-target
  radial: ['R', 'R2', 'D'],               // #radialSeg data-k（多选）
  radialMark: ['peak', 'zeros'],          // #radialMarkSeg data-m
  formulaPart: ['R', 'Y', 'L', 'P', 'N', null], // 公式按项高亮
  // 轨道模型：氢型（真实类氢，2s 有径向节点）| Slater 型（STO，无径向节点）
  orbitalModel: ['hydrogenic', 'slater'],
  // 多轨道同屏：要同屏的等价轨道集合。'off' 关闭；其余取自 core/hybrids.js。
  // ★ 必须**含 'custom'**：页面早就实现了这个档（`setId === 'custom'` 分支，进自定义清单
  //   再从「＋ 加入当前轨道」逐个加），而枚举里没有它 —— 于是"模型要求进自定义档"会被
  //   validate 判为非法值。页面能做的事、动作层说做不到，这种不一致迟早会被踩到
  //   （快照里 `orbitalSet` 本来就会是 'custom'，撤销/回放也要能把它设回去）。
  orbitalSet: ['off', 'custom'].concat(Hybrids.setIds()),
}

/**
 * **临时停用的动作**（2026-10-06：用户要求「先隐藏多轨道同屏功能，对智能体也隐藏此功能」；
 * 2026-10-10：用户要求「隐藏切换 slater 功能」）。
 *
 * ★ 停用的语义要说清：不是删实现，而是**从模型看得见的地方撤下来** ——
 *   `modules/orbit/index.js` 导出 vocabulary / actionLabels 时按这张表过滤，
 *   于是 `listSceneActions` 里没有它们、模型也无从"看见即调用"。
 *   实现、取值域校验、渲染层通路**全部保留**：重新启用只需把名字从这张表里删掉。
 *
 * ★ 为什么界面藏了、模型也必须藏：只藏界面而让模型照旧下发，会出现
 *   "界面里根本没有这个面板、画面却自己在变"的鬼状态 —— 那是最难自查的一类。
 */
export const DISABLED_ACTIONS = ['setOrbitals', 'setOrbitalStyle', 'setOrbitalModel']

/**
 * 轨道模型（氢型 / Slater 型）这一档是否已隐藏。
 *
 * ★ 这是**从上面那张表推出来的**，不是第二份事实：页面（`apps/web/src/pages/orbit.js`）
 *   与动作层必须用同一个判据，否则会出现"界面藏了、状态还允许 slater"的半藏状态。
 * ★ 页面侧还要靠它做**状态兜底**：老会话 / 老快照里可能留着 `orbitalModel: 'slater'`，
 *   而隐藏后界面再也切不回来 —— 那种情况下学生会一直看到 STO 形状、却找不到开关。
 */
export const ORBITAL_MODEL_HIDDEN = DISABLED_ACTIONS.indexOf('setOrbitalModel') >= 0

/** 某个动作是否已停用（导出层与守卫共用一处判据） */
export function isActionDisabled(name) {
  return DISABLED_ACTIONS.indexOf(name) >= 0
}

/** 同一套判据，作用于演示脚本：整段依赖停用动作的脚本也一并撤下 */
export const DISABLED_DEMOS = ['sp3Tetrahedron']

/**
 * 同屏轨道条数的上限。
 *
 * ★ 为什么要有上限：每多一条就要**真跑一遍等值面流水线**（本环境一张 10–15 秒），
 *   所以"任意数量"在工程上必须有个封顶，否则模型一次下发 50 条等于把页面冻死几分钟。
 *   12 条已经远超教学场景（sp³ 才 4 条），所以这个上限**不构成能力损失**，
 *   而它挡住的是"一次把页面锁死"这一类真实的坏结果。
 */
export const MAX_MULTI_ORBITALS = 12

/** 颜色：接受 "#rrggbb" 或 [r,g,b]（0..1），统一回 [r,g,b] */
function checkColor(v) {
  if (Array.isArray(v)) {
    if (v.length !== 3 || v.some((x) => typeof x !== 'number' || !(x >= 0 && x <= 1))) {
      return { err: t('orbit.act.err.colorTriple', { v: JSON.stringify(v) }) }
    }
    return { params: { color: v.slice() } }
  }
  if (typeof v === 'string') {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(v.trim())
    if (!m) {
      return { err: t('orbit.act.err.colorHex', { v: JSON.stringify(v) }) }
    }
    const n = parseInt(m[1], 16)
    return { params: { color: [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] } }
  }
  return { err: t('orbit.act.err.colorType') }
}

/** 单项量子数：l ≤ n−1、|m| ≤ l。与滑块那条路共用同一套约束口径。 */
function checkNlm(it, where) {
  const g = (k) => it[k]
  const n = g('n'), l = g('l'), m = g('m')
  for (const [k, v, rng] of [['n', n, RANGES.n], ['l', l, RANGES.l], ['m', m, RANGES.m]]) {
    if (!Number.isInteger(v) || v < rng[0] || v > rng[1]) {
      return { err: t('orbit.act.err.nlmInt',
        { where, k, lo: rng[0], hi: rng[1], v: JSON.stringify(v) }) }
    }
  }
  if (l > n - 1) return { err: t('orbit.act.err.nlmL', { where, n, l }) }
  if (Math.abs(m) > l) return { err: t('orbit.act.err.nlmM', { where, l, m }) }
  return null
}

/**
 * 校验 `setOrbitals({items})` 的数组。
 *
 * ★ 每一项允许**两种给法**：纯态给 (n,l,m)，叠加态给 terms 数组。
 *   两者都给时以 terms 为准（叠加态是更强的描述）—— 这一点必须写进错误信息之外的
 *   说明里，否则模型会以为"给了 n/l/m 又被忽略"是 bug。
 */
function checkOrbitalItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return { err: t('orbit.act.err.itemsEmpty') }
  }
  if (items.length > MAX_MULTI_ORBITALS) {
    return { err: t('orbit.act.err.itemsTooMany', { max: MAX_MULTI_ORBITALS, n: items.length }) }
  }
  const out = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const where = 'items[' + i + ']'
    if (!it || typeof it !== 'object') return { err: t('orbit.act.err.itemObject', { where }) }
    const row = {}
    if (Array.isArray(it.terms) && it.terms.length) {
      if (it.terms.length > 8) {
        return { err: t('orbit.act.err.itemTermsMany', { where, n: it.terms.length }) }
      }
      const terms = []
      for (let k = 0; k < it.terms.length; k++) {
        // ★ 变量名不叫 `t`：本文件的 `t` 是 i18n 的取值函数，同名会把下面的报错取值
        //   悄悄改成"读一个 term 对象当函数调"（不报错、只是抛 TypeError 被吞）。
        const term = it.terms[k] || {}
        const bad = checkNlm(term, where + '.terms[' + k + ']')
        if (bad) return bad
        if (term.mode !== undefined && ENUMS.wavefunction.indexOf(term.mode) < 0) {
          return { err: t('orbit.act.err.itemMode',
            { where, i: k, allowed: ENUMS.wavefunction.join('|') }) }
        }
        const c = term.c || { re: 1, im: 0 }
        if (typeof c.re !== 'number' || typeof c.im !== 'number'
            || !Number.isFinite(c.re) || !Number.isFinite(c.im)) {
          return { err: t('orbit.act.err.itemComplex', { where, i: k }) }
        }
        terms.push({ n: term.n, l: term.l, m: term.m, mode: term.mode || 'real',
          c: { re: c.re, im: c.im } })
      }
      row.terms = terms
    } else {
      const bad = checkNlm(it, where)
      if (bad) return bad
      row.n = it.n; row.l = it.l; row.m = it.m
      if (it.mode !== undefined) {
        if (ENUMS.wavefunction.indexOf(it.mode) < 0) {
          return { err: t('orbit.act.err.itemModeTop',
            { where, allowed: ENUMS.wavefunction.join('|') }) }
        }
        row.mode = it.mode
      }
    }
    if (it.color !== undefined) {
      const c = checkColor(it.color)
      if (c.err) return c
      row.color = c.params.color
    }
    if (it.label !== undefined) {
      if (typeof it.label !== 'string' || !it.label.trim()) {
        return { err: t('orbit.act.err.itemLabel', { where }) }
      }
      row.label = it.label.slice(0, 40)
    }
    if (it.visible !== undefined) {
      if (typeof it.visible !== 'boolean') return { err: t('orbit.act.err.itemVisible', { where }) }
      row.visible = it.visible
    }
    out.push(row)
  }
  return { params: { items: out } }
}

/** 数值范围（逐条取自 index.html 的滑块 min/max） */
export const RANGES = {
  Z: [1, 36],
  n: [1, 6],
  // ★ l 与 m 的上界**随 n 变**（l ≤ n−1、|m| ≤ l），所以这里是绝对上界，
  //   相对约束在 validate 里按 n 判——只写死一个 [0,2] 会让 n=5 时 l=3 被误拒。
  l: [0, 5],
  m: [-5, 5],
  pointCount: [8000, 80000],
  levelFraction: [0, 1],
}

/**
 * 惰性文案的**标记**。
 *
 * ★ 为什么 VOCAB 里写的不是 `t(...)` 而是 `lazyT(...)`：
 *   VOCAB 是模块级常量，`t(...)` 在 **import 时**就求值 —— 那会把当时的语言
 *   固化进去：用户切到英文之后，模型拿到的动作说明（group / desc / params）
 *   仍然是中文，而**守卫照样是绿的**（键登记过、字面量也确实没了）。
 *   这类"接了线但值被冻住"的失效不报错，只能靠实测发现（本轮就是先写了
 *   tmp/i18n/smoke-orbit-i18n.mjs，才发现 desc 没跟着语言变）。
 *   `lazyT` 只记下键，稍后由 `installLazyText()` 在 VOCAB 上装**取值器**，
 *   读取的那一刻（`listSceneActions` 序列化时）才取译文。
 */
const lazyT = (key, vars) => ({ __i18nKey: key, __i18nVars: vars })

/** 英文名 → 中文短标签（面板的动作气泡用） */
export const LABELS = {
  recomputeOnly: '重算',
  restoreState: '恢复状态',
  setQuantumNumbers: '设置量子数',
  setNuclearCharge: '设置核电荷',
  setWavefunctionMode: '实/复轨道',
  setRenderMode: '渲染模式',
  setPsiCriterion: '阈值判据',
  setIsosurfaceLevel: '等值面阈值',
  setParticleCount: '粒子数',
  setAngularView: '角度分布',
  setViewTarget: '视图目标',
  setSectionPlane: '截面',
  setSectionMode: '截面显示',
  showRadial: '径向曲线',
  setAutoRotate: '自动旋转',
  // 三维里的参考线（坐标轴 + 赤道参考圆环）显隐
  setAxesVisible: '参考线',
  setRadialMarks: '径向标注',
  resetCamera: '复位视角',
  resetSectionView: '复位截面',
  setFormulaHighlight: '公式高亮',
  setSuperposition: '设置叠加态',
  clearSuperposition: '清除叠加态',
  setChartTerm: '图表对象',
  setRelPhase: '相对相位',
  focusChart: '放大图表讲解',
  linkRadialTo3D: '径向环联动',
  animateIsosurfaceLevel: '扫描等值面阈值',
}

/**
 * 动作词汇表。
 *
 * 字段含义（与 crystal 的 actions.js 对齐，便于壳统一处理）：
 *   label    短标签；group 分组；desc 给模型看的说明（**只在 listSceneActions 时下发**）
 *   params   参数名 → 取值域描述
 *   animated 是否是一次"看得见的动画"（分镜队列据此决定要不要配旁白停顿）
 */
export const VOCAB = {
  setQuantumNumbers: {
    label: '设置量子数', group: lazyT('orbit.group.state'), animated: true,
    desc: lazyT('orbit.act.setQuantumNumbers.desc'),
    params: { n: '1..6', l: '0..n−1', m: '−l..l' },
  },
  setNuclearCharge: {
    label: '设置核电荷', group: lazyT('orbit.group.state'), animated: true,
    desc: lazyT('orbit.act.setNuclearCharge.desc'),
    params: { Z: '1..36' },
  },
  setWavefunctionMode: {
    label: '实/复轨道', group: lazyT('orbit.group.state'), animated: true,
    desc: lazyT('orbit.act.setWavefunctionMode.desc'),
    params: { mode: ENUMS.wavefunction.join('|') },
  },
  setRenderMode: {
    label: '渲染模式', group: lazyT('orbit.group.threeD'), animated: true,
    desc: lazyT('orbit.act.setRenderMode.desc'),
    params: { mode: ENUMS.render.join('|') },
  },
  setPsiCriterion: {
    label: '阈值判据', group: lazyT('orbit.group.threeD'), animated: true,
    desc: lazyT('orbit.act.setPsiCriterion.desc'),
    params: { criterion: ENUMS.psiCriterion.join('|') },
  },

  setOrbitalModel: {
    label: '轨道模型（氢型/Slater）', group: lazyT('orbit.group.state'), animated: true,
    desc: lazyT('orbit.act.setOrbitalModel.desc'),
    params: { model: ENUMS.orbitalModel.join('|'), zeta: lazyT('orbit.act.setOrbitalModel.param.zeta') },
  },

  setOrbitals: {
    label: '多轨道同屏', group: lazyT('orbit.group.state'), animated: true,
    desc: lazyT('orbit.act.setOrbitals.desc'),
    params: {
      set: ENUMS.orbitalSet.join('|'),
      visible: lazyT('orbit.act.setOrbitals.param.visible'),
      add: lazyT('orbit.act.setOrbitals.param.add'),
      items: lazyT('orbit.act.setOrbitals.param.items'),
    },
  },
  setOrbitalStyle: {
    label: '改同屏轨道的颜色/显隐', group: lazyT('orbit.group.state'), animated: false,
    desc: lazyT('orbit.act.setOrbitalStyle.desc'),
    params: {
      key: lazyT('orbit.act.setOrbitalStyle.param.key'),
      color: lazyT('orbit.act.setOrbitalStyle.param.color'),
      visible: lazyT('orbit.act.setOrbitalStyle.param.visible'),
    },
  },
  clearOrbitals: {
    label: '收起全部同屏轨道', group: lazyT('orbit.group.state'), animated: false,
    desc: lazyT('orbit.act.clearOrbitals.desc'),
    params: {},
  },
  setIsosurfaceLevel: {
    label: '等值面阈值', group: lazyT('orbit.group.threeD'), animated: true,
    desc: lazyT('orbit.act.setIsosurfaceLevel.desc'),
    params: { fraction: '0..1' },
  },
  setParticleCount: {
    label: '粒子数', group: lazyT('orbit.group.threeD'), animated: false,
    desc: lazyT('orbit.act.setParticleCount.desc'),
    params: { count: lazyT('orbit.act.setParticleCount.param.count') },
  },
  setAngularView: {
    label: '角度分布', group: lazyT('orbit.group.twoD'), animated: false,
    desc: lazyT('orbit.act.setAngularView.desc'),
    params: { which: ENUMS.angularWhich.join('|') },
  },
  setViewTarget: {
    label: '视图目标', group: lazyT('orbit.group.threeD'), animated: true,
    desc: lazyT('orbit.act.setViewTarget.desc'),
    params: { target: ENUMS.viewTarget.join('|') },
  },
  setSectionPlane: {
    label: '截面', group: lazyT('orbit.group.twoD'), animated: false,
    desc: lazyT('orbit.act.setSectionPlane.desc'),
    params: { plane: ENUMS.plane.join('|') },
  },
  setSectionMode: {
    label: '截面显示', group: lazyT('orbit.group.twoD'), animated: false,
    desc: lazyT('orbit.act.setSectionMode.desc'),
    params: { mode: ENUMS.sectionMode.join('|') },
  },
  showRadial: {
    label: '径向曲线', group: lazyT('orbit.group.twoD'), animated: false,
    desc: lazyT('orbit.act.showRadial.desc'),
    params: { which: lazyT('orbit.act.showRadial.param.which', { list: ENUMS.radial.join('|') }) },
  },
  setRadialMarks: {
    label: '径向标注', group: lazyT('orbit.group.twoD'), animated: false,
    desc: lazyT('orbit.act.setRadialMarks.desc'),
    params: {
      feature: lazyT('orbit.act.setRadialMarks.param.feature'),
      target: lazyT('orbit.act.setRadialMarks.param.target'),
    },
  },
  setAutoRotate: {
    label: '自动旋转', group: lazyT('orbit.group.threeD'), animated: false,
    desc: lazyT('orbit.act.setAutoRotate.desc'),
    params: { on: 'true|false' },
  },
  /**
   * 参考线显隐（坐标轴 + 赤道参考圆环）。
   * ★ 对照"哪个方向是 x、方位角多少"时要用它；想看清曲面本身时又要能关掉 ——
   *   原先这两条线**没有开关**（用户报「黑色辅助线也可以设置显示/隐藏」）。
   */
  setAxesVisible: {
    label: '参考线', group: lazyT('orbit.group.threeD'), animated: false,
    desc: lazyT('orbit.act.setAxesVisible.desc'),
    params: { visible: 'true|false' },
  },
  resetCamera: {
    label: '复位视角', group: lazyT('orbit.group.threeD'), animated: true,
    desc: lazyT('orbit.act.resetCamera.desc'),
    params: {},
  },
  resetSectionView: {
    label: '复位截面', group: lazyT('orbit.group.twoD'), animated: false,
    desc: lazyT('orbit.act.resetSectionView.desc'),
    params: {},
  },
  setFormulaHighlight: {
    label: '公式高亮', group: lazyT('orbit.group.formula'), animated: false,
    desc: lazyT('orbit.act.setFormulaHighlight.desc'),
    params: { part: 'R|Y|L|P|N|null' },
  },
  setSuperposition: {
    label: '设置叠加态', group: lazyT('orbit.group.super'), animated: true,
    desc: lazyT('orbit.act.setSuperposition.desc'),
    params: { terms: '[{n,l,m,mode?,\"c\":{re,im}}]' },
  },
  clearSuperposition: {
    label: '清除叠加态', group: lazyT('orbit.group.super'), animated: true,
    desc: lazyT('orbit.act.clearSuperposition.desc'),
    params: {},
  },
  setChartTerm: {
    label: '图表对象', group: lazyT('orbit.group.super'), animated: false,
    desc: lazyT('orbit.act.setChartTerm.desc'),
    params: { term: lazyT('orbit.act.setChartTerm.param.term') },
  },
  linkRadialTo3D: {
    label: '径向环联动', group: lazyT('orbit.group.threeD'), animated: false,
    desc: lazyT('orbit.act.linkRadialTo3D.desc'),
    params: { radius: lazyT('orbit.act.linkRadialTo3D.param.radius') },
  },
  focusChart: {
    label: '放大图表讲解', group: lazyT('orbit.group.twoD'), animated: false,
    desc: lazyT('orbit.act.focusChart.desc'),
    params: { target: 'radial|section|thetaPhi|none' },
  },
  animateIsosurfaceLevel: {
    label: '扫描等值面阈值', group: lazyT('orbit.group.threeD'), animated: true,
    desc: lazyT('orbit.act.animateIsosurfaceLevel.desc'),
    params: {
      from: '0.003..0.8',
      to: '0.003..0.8',
      durationMs: lazyT('orbit.act.animateIsosurfaceLevel.param.durationMs'),
    },
  },
  setRelPhase: {
    label: '相对相位', group: lazyT('orbit.group.super'), animated: true,
    desc: lazyT('orbit.act.setRelPhase.desc'),
    params: { phase: lazyT('orbit.act.setRelPhase.param.phase') },
  },
  restoreState: {
    label: '恢复状态', group: lazyT('orbit.group.internal'), animated: false,
    desc: lazyT('orbit.act.restoreState.desc'),
    params: { state: lazyT('orbit.act.restoreState.param.state') },
  },
  recomputeOnly: {
    label: '重算', group: lazyT('orbit.group.internal'), animated: false,
    desc: lazyT('orbit.act.recomputeOnly.desc'),
    params: {},
  },
}

// ---------------------------------------------------------------------------
// 把 lazyT() 标记换成取值器（见 lazyT 的说明）
// ---------------------------------------------------------------------------

/**
 * 就地遍历：把 `{__i18nKey}` 标记的属性换成取值器；普通对象继续往下钻
 * （`params` 就是嵌套一层）。
 * @param {Object} obj
 */
function installLazyText(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (!v || typeof v !== 'object') continue
    if (typeof v.__i18nKey === 'string') {
      const key = v.__i18nKey
      const vars = v.__i18nVars
      Object.defineProperty(obj, k, {
        enumerable: true, configurable: true, get: () => t(key, vars),
      })
    } else {
      installLazyText(v)
    }
  }
}
for (const v of Object.values(VOCAB)) installLazyText(v)

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

const isInt = (v) => typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v

/** 枚举校验：给了非空值但不在取值域内 ⇒ 报错并**列出合法值** */
function enumErr(name, key, v, allowed) {
  if (v == null) return null
  if (allowed.indexOf(v) >= 0) return null
  return { err: t('orbit.act.err.enum',
    { name, key, allowed: allowed.join(' / '), v: JSON.stringify(v) }) }
}

/**
 * 校验并夹紧一个动作的参数。
 *
 * @param {string} name
 * @param {Object} params
 * @returns {{params?:Object, err?:string}}
 */
export function validate(name, params) {
  const p = params || {}
  switch (name) {
    case 'recomputeOnly':
    case 'clearSuperposition':
    case 'resetCamera':
    case 'resetSectionView':
      return { params: {} }

    case 'setQuantumNumbers': {
      const out = {}
      for (const k of ['n', 'l', 'm']) {
        if (p[k] == null) continue
        if (!isInt(p[k])) {
          return { err: t('orbit.act.err.int', { k, v: JSON.stringify(p[k]) }) }
        }
        if (p[k] < 0) return { err: t('orbit.act.err.negative', { k }) }
        out[k] = p[k]
      }
      if (!Object.keys(out).length) return { err: t('orbit.act.err.qnNeedsOne') }
      if (out.n != null && (out.n < 1 || out.n > RANGES.n[1])) {
        return { err: t('orbit.act.err.nRange', { lo: RANGES.n[0], hi: RANGES.n[1], v: out.n }) }
      }
      if (out.l != null && out.n != null && out.l > out.n - 1) {
        return { err: t('orbit.act.err.lRange', { n: out.n, max: out.n - 1, l: out.l }) }
      }
      if (out.m != null && out.l != null && Math.abs(out.m) > out.l) {
        return { err: t('orbit.act.err.mRange', { l: out.l, m: out.m }) }
      }
      return { params: out }
    }

    case 'setNuclearCharge': {
      if (p.Z == null) return { err: t('orbit.act.err.zNeeded') }
      if (!isInt(p.Z)) return { err: t('orbit.act.err.zInt', { v: JSON.stringify(p.Z) }) }
      const [lo, hi] = RANGES.Z
      if (p.Z < lo || p.Z > hi) return { err: t('orbit.act.err.zRange', { lo, hi, v: p.Z }) }
      return { params: { Z: p.Z } }
    }

    case 'setWavefunctionMode': return pick(name, p, 'mode', ENUMS.wavefunction)
    case 'setOrbitalModel': {
      const base = pick(name, p, 'model', ENUMS.orbitalModel)
      if (base.err) return base
      if (p.zeta === undefined || p.zeta === null) return base
      const z = Number(p.zeta)
      if (!Number.isFinite(z) || z <= 0 || z > 20) {
        return { err: t('orbit.act.err.zeta') }
      }
      return { params: { model: base.params.model, zeta: z } }
    }
    case 'setOrbitals': {
      // ---- 分支 A：任意轨道数组（纯态或叠加态，数量任意）----
      if (p.items !== undefined) return checkOrbitalItems(p.items)
      // ---- 分支 B：把当前正在编辑的轨道加进同屏 ----
      if (p.add === true || p.add === false) {
        if (!p.add) return { err: t('orbit.act.err.addOnlyTrue') }
        const out = { add: true }
        if (p.color !== undefined) {
          const c = checkColor(p.color)
          if (c.err) return c
          out.color = c.params.color
        }
        if (p.label !== undefined) {
          if (typeof p.label !== 'string' || !p.label.trim()) {
            return { err: t('orbit.act.err.labelEmpty') }
          }
          out.label = p.label.slice(0, 40)
        }
        if (p.visible !== undefined) out.visible = !!p.visible
        return { params: out }
      }
      const base = pick(name, p, 'set', ENUMS.orbitalSet)
      if (base.err) return base
      const setId = base.params.set
      if (setId === 'off') {
        // 关闭时不再理会 visible —— 但也不静默吞掉一个显然写错的下标
        if (p.visible !== undefined && !Array.isArray(p.visible)) {
          return { err: t('orbit.act.err.visibleArray') }
        }
        return { params: { set: 'off' } }
      }
      const def = Hybrids.set(setId)
      if (!def) return { err: t('orbit.act.err.setMissingDef', { setId }) }
      if (p.visible === undefined || p.visible === null) return { params: { set: setId } }
      if (!Array.isArray(p.visible)) {
        return { err: t('orbit.act.err.visibleShape', { label: def.label, count: def.count }) }
      }
      const bad = p.visible.filter((x) => !Number.isInteger(x) || x < 0 || x >= def.count)
      if (bad.length) {
        return { err: t('orbit.act.err.visibleOutOfRange',
          { label: def.label, count: def.count, max: def.count - 1, bad: JSON.stringify(bad) }) }
      }
      // 去重并排序：既让快照稳定（同样的意图给出同样的标量串），也避免重复项
      const uniq = Array.from(new Set(p.visible)).sort((a, b) => a - b)
      if (!uniq.length) return { err: t('orbit.act.err.visibleEmpty', { label: def.label }) }
      return { params: { set: setId, visible: uniq } }
    }
    case 'setRenderMode': return pick(name, p, 'mode', ENUMS.render)
    case 'setPsiCriterion': return pick(name, p, 'criterion', ENUMS.psiCriterion)
    case 'setAngularView': return pick(name, p, 'which', ENUMS.angularWhich)
    case 'setViewTarget': return pick(name, p, 'target', ENUMS.viewTarget)
    case 'setSectionPlane': return pick(name, p, 'plane', ENUMS.plane)
    case 'setSectionMode': return pick(name, p, 'mode', ENUMS.sectionMode)

    case 'setIsosurfaceLevel': {
      if (p.fraction == null) return { err: t('orbit.act.err.fractionNeeded') }
      const f = Number(p.fraction)
      if (!Number.isFinite(f) || f <= 0 || f > 1) {
        return { err: t('orbit.act.err.fractionRange', { v: JSON.stringify(p.fraction) }) }
      }
      return { params: { fraction: f } }
    }

    case 'setParticleCount': {
      if (!isInt(p.count)) return { err: t('orbit.act.err.countInt') }
      const [lo, hi] = RANGES.pointCount
      if (p.count < lo || p.count > hi) {
        return { err: t('orbit.act.err.countRange', { lo, hi, v: p.count }) }
      }
      return { params: { count: p.count } }
    }

    case 'showRadial': {
      const raw = p.which
      const list = Array.isArray(raw) ? raw : (raw == null ? [] : [raw])
      const bad = list.filter((x) => ENUMS.radial.indexOf(x) < 0)
      if (bad.length) {
        return { err: t('orbit.act.err.radialEnum',
          { allowed: ENUMS.radial.join(' / '), bad: JSON.stringify(bad) }) }
      }
      return { params: { which: list } }
    }

    case 'setRadialMarks': {
      const raw = p.feature
      if (raw == null) return { params: { feature: [], target: p.target || 'ALL' } }
      const list = Array.isArray(raw) ? raw : [raw]
      const bad = list.filter((x) => ENUMS.radialMark.indexOf(x) < 0)
      if (bad.length) {
        return { err: t('orbit.act.err.markEnum',
          { allowed: ENUMS.radialMark.join(' / '), bad: JSON.stringify(bad) }) }
      }
      return { params: { feature: list, target: p.target || 'ALL' } }
    }

    case 'setAutoRotate':
      return { params: { on: !!p.on } }

    // 参考线显隐：**默认显示**，所以缺参时按"显示"处理（而不是当非法参数拒掉）
    case 'setAxesVisible':
      return { params: { visible: p.visible !== false } }

    case 'setFormulaHighlight': {
      const v = p.part == null ? null : p.part
      if (v != null && ENUMS.formulaPart.indexOf(v) < 0) {
        return { err: t('orbit.act.err.formulaEnum',
          { allowed: ENUMS.formulaPart.filter(Boolean).join(' / '), v: JSON.stringify(v) }) }
      }
      return { params: { part: v } }
    }

    case 'setSuperposition': {
      const list = p.terms
      if (!Array.isArray(list) || !list.length) return { err: t('orbit.act.err.termsEmpty') }
      // ★ 循环变量不叫 `t`：本文件的 `t` 是 i18n 的取值函数（同名会把报错取值改成
      //   "把一个 term 当函数调"，抛出的 TypeError 还会盖掉本来要说清的那句话）。
      for (const term of list) {
        if (!term || !isInt(term.n) || !isInt(term.l) || !isInt(term.m)) {
          return { err: t('orbit.act.err.termsInt', { v: JSON.stringify(term) }) }
        }
        if (term.n < 1 || term.n > RANGES.n[1]) {
          return { err: t('orbit.act.err.termsN', { max: RANGES.n[1], v: term.n }) }
        }
        if (term.l < 0 || term.l > term.n - 1) {
          return { err: t('orbit.act.err.termsL', { n: term.n, l: term.l }) }
        }
        if (Math.abs(term.m) > term.l) {
          return { err: t('orbit.act.err.termsM', { l: term.l, m: term.m }) }
        }
      }
      return { params: { terms: list } }
    }

    case 'setChartTerm': {
      const v = p.term
      if (v === 'super' || v == null) return { params: { term: 'super' } }
      if (!isInt(v) || v < 0) {
        return { err: t('orbit.act.err.chartTerm', { v: JSON.stringify(v) }) }
      }
      return { params: { term: v } }
    }

    case 'linkRadialTo3D': {
      const v = Number(p.radius)
      if (!Number.isFinite(v) || v < 0 || v > 200) {
        return { err: t('orbit.act.err.radius', { v: JSON.stringify(p.radius) }) }
      }
      return { params: { radius: v } }
    }

    case 'focusChart': {
      // ★ 同样避开 `t` 这个变量名（见 setSuperposition 处的说明）
      const target = (p.target == null) ? 'none' : p.target
      if (['radial', 'section', 'thetaPhi', 'none'].indexOf(target) < 0) {
        return { err: t('orbit.act.err.focusTarget', { v: JSON.stringify(p.target) }) }
      }
      return { params: { target } }
    }

    case 'animateIsosurfaceLevel': {
      const f = Number(p.from)
      const t2 = Number(p.to)
      if (!Number.isFinite(f) || !Number.isFinite(t2)) {
        return { err: t('orbit.act.err.animNumbers') }
      }
      if (f < 0.003 || f > 0.8 || t2 < 0.003 || t2 > 0.8) {
        return { err: t('orbit.act.err.animRange', { from: f, to: t2 }) }
      }
      const d = (p.durationMs == null) ? 1200 : Number(p.durationMs)
      if (!Number.isFinite(d) || d < 300 || d > 6000) {
        return { err: t('orbit.act.err.animDuration', { v: JSON.stringify(p.durationMs) }) }
      }
      return { params: { from: f, to: t2, durationMs: d } }
    }

    case 'setRelPhase': {
      const v = Number(p.phase)
      if (!Number.isFinite(v)) {
        return { err: t('orbit.act.err.phase', { v: JSON.stringify(p.phase) }) }
      }
      return { params: { phase: v } }
    }

    case 'setOrbitalStyle': {
      if (typeof p.key !== 'string' || !p.key) {
        return { err: t('orbit.act.err.styleKey') }
      }
      const out = { key: p.key }
      let any = false
      if (p.color !== undefined) {
        const c = checkColor(p.color)
        if (c.err) return c
        out.color = c.params.color
        any = true
      }
      if (p.visible !== undefined) {
        if (typeof p.visible !== 'boolean') {
          return { err: t('orbit.act.err.styleVisible') }
        }
        out.visible = p.visible
        any = true
      }
      if (!any) {
        return { err: t('orbit.act.err.styleNeedsOne') }
      }
      return { params: out }
    }

    case 'clearOrbitals': {
      const extra = Object.keys(p).filter((k) => p[k] !== undefined && p[k] !== null)
      if (extra.length) {
        return { err: t('orbit.act.err.clearOrbitalsArgs', { extra: extra.join(',') }) }
      }
      return { params: {} }
    }

    case 'restoreState': {
      if (!p.state || typeof p.state !== 'object') {
        return { err: t('orbit.act.err.restoreNeedsState') }
      }
      return { params: { state: p.state } }
    }

    default:
      return { err: t('orbit.act.err.unknownAction', { name }) }
  }
}

/** 单值枚举动作的通用校验 */
function pick(name, p, key, allowed) {
  const e = enumErr(name, key, p[key], allowed)
  if (e) return e
  if (p[key] == null) {
    return { err: t('orbit.act.err.pickNeeded', { name, key, allowed: allowed.join(' / ') }) }
  }
  return { params: { [key]: p[key] } }
}

/** 动作清单（给 listSceneActions 用；**不进常驻上下文**） */
export function listActions() {
  return Object.entries(VOCAB).map(([action, v]) => ({
    action, label: v.label, group: v.group, desc: v.desc, params: v.params, animated: !!v.animated,
  }))
}

/** 动作名 → 短标签（面板的动作气泡用） */
export function labels() {
  return Object.assign({}, LABELS)
}

export default { VOCAB, ENUMS, RANGES, LABELS, validate, listActions, labels }
