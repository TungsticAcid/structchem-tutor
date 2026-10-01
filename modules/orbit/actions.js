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
  // 多轨道同屏：要同屏的等价轨道集合。'off' 关闭；其余取自 core/hybrids.js
  orbitalSet: ['off'].concat(Hybrids.setIds()),
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
    label: '设置量子数', group: '电子态', animated: true,
    desc: '设置主量子数 n / 角量子数 l / 磁量子数 m。指定的量子数会被自动夹紧到合法范围'
      + '（l ≤ n−1、|m| ≤ l）。**给了任一量子数即意味着"要看这个单一本征态"**，会自动退出叠加态。',
    params: { n: '1..6', l: '0..n−1', m: '−l..l' },
  },
  setNuclearCharge: {
    label: '设置核电荷', group: '电子态', animated: true,
    desc: '设置核电荷数 Z（1..36，类氢离子）。★ 与量子数不同，换 Z **不退出**叠加态。',
    params: { Z: '1..36' },
  },
  setWavefunctionMode: {
    label: '实/复轨道', group: '电子态', animated: true,
    desc: '实轨道（real，方向性明确，教学常用）或复轨道（complex，m 是好量子数）。',
    params: { mode: ENUMS.wavefunction.join('|') },
  },
  setRenderMode: {
    label: '渲染模式', group: '三维', animated: true,
    desc: '粒子云（points，按 |ψ|² 重要性采样）或等值面（surface，同密度的曲面）。',
    params: { mode: ENUMS.render.join('|') },
  },
  setPsiCriterion: {
    label: '阈值判据', group: '三维', animated: true,
    desc: '等值面/粒子云按哪个量取阈值：|ψ|²（psi2，密度）或 |ψ|（psi，幅度）。',
    params: { criterion: ENUMS.psiCriterion.join('|') },
  },

  setOrbitalModel: {
    label: '轨道模型（氢型/Slater）', group: '电子态', animated: true,
    desc: '切换**径向函数**：hydrogenic = 真实类氢（默认；2s 在 r≈2a₀ 有径向节点，'
      + '所以 sp³ 的等值面外层干涉反向、形状与教材插图不同）；'
      + 'slater = Slater 型（STO；径向形式 r^(n−1)e^(−ζr)，2s 与 2p 共用、无径向节点，'
      + '于是 sp³ 退化成纯角度形状 = 教材那个干净的定向瓣）。'
      + '两者都是真实的物理模型，切换本身就是一课。'
      + '★ zeta 可选：省略则 ζ = Z/n；想用 Slater 规则给出的值就直接填（碳的 2s/2p 是 1.625）。',
    params: { model: ENUMS.orbitalModel.join('|'), zeta: '（可选）正数' },
  },

  setOrbitals: {
    label: '多轨道同屏', group: '电子态', animated: true,
    desc: '把一组**等价**杂化轨道同时画出来（sp³ 四个 / sp² 三个 / sp 两个），'
      + '每个一个颜色。set 取 off 关闭。'
      + 'visible 可选：给出要显示的下标（0 起），省略＝全显示 —— '
      + '想"只留一个看形状"就写 [0]，想"关掉第三个"就写 [0,1,3]。'
      + '★ 与叠加态是两回事：叠加态是**一个**态由多项组成（干涉项是物理的一部分，'
      + '只能画成一个面）；这里是场景里挂**多个各自独立**的态。'
      + '★ 四个 sp³ 指向正四面体，两两夹角 109.47°；sp² 三个共面、120°；sp 两个成 180°。',
    params: {
      set: ENUMS.orbitalSet.join('|'),
      visible: '（可选）下标数组，如 [0,2]；省略＝全部',
    },
  },
  setIsosurfaceLevel: {
    label: '等值面阈值', group: '三维', animated: true,
    desc: '等值面取在峰值的哪个比例上（0..1 的比值，内部走对数刻度）。'
      + '**不指定时程序会按轨道给推荐值**；一旦显式指定，此后换轨道不再套推荐值。',
    params: { fraction: '0..1' },
  },
  setParticleCount: {
    label: '粒子数', group: '三维', animated: false,
    desc: '粒子云的采样点数（8000..80000）。点数越多越细腻，也越吃性能。',
    params: { count: '8000..80000（1000 的倍数）' },
  },
  setAngularView: {
    label: '角度分布', group: '二维', animated: false,
    desc: '角度分布图画的是 Y（球谐本身）或 Y²（概率密度）。',
    params: { which: ENUMS.angularWhich.join('|') },
  },
  setViewTarget: {
    label: '视图目标', group: '三维', animated: true,
    desc: '主三维视图画什么：spherical = 球谐曲面（角度部分），wave = 完整波函数（电子云/等值面）。'
      + '★ 切到球谐档会收起量子态入口（叠加态只对完整波函数有意义）。',
    params: { target: ENUMS.viewTarget.join('|') },
  },
  setSectionPlane: {
    label: '截面', group: '二维', animated: false,
    desc: '截面图取哪个坐标面：xy / xz / yz（化学约定 z 为量化轴，xz 面最常用来讲"角度节面"）。',
    params: { plane: ENUMS.plane.join('|') },
  },
  setSectionMode: {
    label: '截面显示', group: '二维', animated: false,
    desc: '截面图画什么：intensity（|ψ|² 强度）/ phase（相位，正负用颜色区分）/ contour（等值线）。',
    params: { mode: ENUMS.sectionMode.join('|') },
  },
  showRadial: {
    label: '径向曲线', group: '二维', animated: false,
    desc: '径向图显示哪几条曲线（**多选**）：R（径向波函数，有正负）、R²（径向概率密度）、'
      + 'D = r²R²（径向分布函数，讲"电子最常出现在哪"用它）。至少保留一条，否则图表空白。',
    params: { which: '数组，元素 ∈ ' + ENUMS.radial.join('|') },
  },
  setRadialMarks: {
    label: '径向标注', group: '二维', animated: false,
    desc: '在径向图上标出 peak（峰值）或 zeros（节点）。**feature 可为数组**（两者同屏）；'
      + '传 null 表示清除标注。标的线**只画在当前可见的曲线**上。',
    params: { feature: 'peak|zeros 或其数组|null', target: 'R|R2|D|ALL（缺省 ALL）' },
  },
  setAutoRotate: {
    label: '自动旋转', group: '三维', animated: false,
    desc: '三维视图是否自动旋转。讲"这个轨道长什么样"时开着，方便学生看清整体形状。',
    params: { on: 'true|false' },
  },
  resetCamera: {
    label: '复位视角', group: '三维', animated: true,
    desc: '相机回到初始朝向与距离。',
    params: {},
  },
  resetSectionView: {
    label: '复位截面', group: '二维', animated: false,
    desc: '截面图的缩放与平移回到初始（等同图表角上那个「复位缩放」小控件）。',
    params: {},
  },
  setFormulaHighlight: {
    label: '公式高亮', group: '公式', animated: false,
    desc: '按项高亮公式（R 径向 / Y 角度 / L 拉盖尔 / P 关联勒让德 / N 归一化）。'
      + '这是三维—公式—图表三向联动的中枢：讲哪一项就点亮哪一项。传 null 取消高亮。',
    params: { part: 'R|Y|L|P|N|null' },
  },
  setSuperposition: {
    label: '设置叠加态', group: '叠加态', animated: true,
    desc: '把电子态设为若干本征态的线性组合。terms 是数组，每项 {n,l,m,c:{re,im}}（c 缺省为 1）。'
      + '★ 教学要点：叠加态 |ψ|² 里**有干涉项**，这正是它与"概率简单相加"的本质区别。',
    params: { terms: '[{n,l,m,mode?,\"c\":{re,im}}]' },
  },
  clearSuperposition: {
    label: '清除叠加态', group: '叠加态', animated: true,
    desc: '回到单一本征态。',
    params: {},
  },
  setChartTerm: {
    label: '图表对象', group: '叠加态', animated: false,
    desc: '二维图表画叠加态的哪一份：\'super\' = 整体（**只有截面图支持**），数字 = 第 i 个分量（从 0 起）。',
    params: { term: 'super|整数下标' },
  },
  linkRadialTo3D: {
    label: '径向环联动', group: '三维', animated: false,
    desc: '在三维视图里画一个半径 = `radius`（a₀）的参考环，用来把"径向分布图上的某个半径"'
      + '**落到画面上的位置**。讲"这个峰在离核多远"时用它把二维读数与三维尺度对上。'
      + '传 0 表示清除。',
    params: { radius: '0..200（a₀），0 表示清除' },
  },
  focusChart: {
    label: '放大图表讲解', group: '二维', animated: false,
    desc: '把页面底部那张图放大到**浮窗**里讲（径向分布 / 截面密度 / 角度分布），'
      + '`none` 表示关掉浮窗。★ 讲底部图表时**先用它**——否则图在页面下方、'
      + '而讲解在别处，学生看不到你在说哪张。'
      + '还要注意顺序：**先换轨道、再 focusChart**；浮窗放大的是"当前"那张图。',
    params: { target: 'radial|section|thetaPhi|none' },
  },
  animateIsosurfaceLevel: {
    label: '扫描等值面阈值', group: '三维', animated: true,
    desc: '把等值面阈值从 from 平滑推过到 to（各取 0.003..0.8 的比值）。'
      + '★ 这是讲"同心壳层"的核心手法：阈值一路降下去，内层壳依次冒出来。'
      + '**但要在截面图里讲**——三维是实体渲染，外层壳会把内层整个包住，'
      + '降阈值只会让颜色变、形状看上去还是同一个球。',
    params: { from: '0.003..0.8', to: '0.003..0.8', durationMs: '300..6000，缺省 1200' },
  },
  setRelPhase: {
    label: '相对相位', group: '叠加态', animated: true,
    desc: '叠加态分量的相对相位（弧度）。改变它会让干涉图样旋转/变形——是"相位是物理的"最直观的演示。',
    params: { phase: '弧度数值' },
  },
  restoreState: {
    label: '恢复状态', group: '内部', animated: false,
    desc: '写回一整套快照（供分镜的「上一步」回退）。**不经用户通路**，是严格可逆的还原。',
    params: { state: '快照对象' },
  },
  recomputeOnly: {
    label: '重算', group: '内部', animated: false,
    desc: '只重算重绘，不改任何参数（叠加态系数/相位变化后触发一次）。',
    params: {},
  },
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

const isInt = (v) => typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v

/** 枚举校验：给了非空值但不在取值域内 ⇒ 报错并**列出合法值** */
function enumErr(name, key, v, allowed) {
  if (v == null) return null
  if (allowed.indexOf(v) >= 0) return null
  return { err: `${name} 的 ${key} 只能是 ${allowed.join(' / ')}，收到 ${JSON.stringify(v)}` }
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
        if (!isInt(p[k])) return { err: `setQuantumNumbers 的 ${k} 必须是整数，收到 ${JSON.stringify(p[k])}` }
        if (p[k] < 0) return { err: `setQuantumNumbers 的 ${k} 不能为负` }
        out[k] = p[k]
      }
      if (!Object.keys(out).length) return { err: 'setQuantumNumbers 至少要给 n / l / m 其中之一' }
      if (out.n != null && (out.n < 1 || out.n > RANGES.n[1])) {
        return { err: `n 只能是 ${RANGES.n[0]}..${RANGES.n[1]}，收到 ${out.n}` }
      }
      if (out.l != null && out.n != null && out.l > out.n - 1) {
        return { err: `l 必须 ≤ n−1（n=${out.n} 时 l ≤ ${out.n - 1}），收到 l=${out.l}` }
      }
      if (out.m != null && out.l != null && Math.abs(out.m) > out.l) {
        return { err: `|m| 必须 ≤ l（l=${out.l} 时 |m| ≤ ${out.l}），收到 m=${out.m}` }
      }
      return { params: out }
    }

    case 'setNuclearCharge': {
      if (p.Z == null) return { err: 'setNuclearCharge 需要 Z' }
      if (!isInt(p.Z)) return { err: `Z 必须是整数，收到 ${JSON.stringify(p.Z)}` }
      const [lo, hi] = RANGES.Z
      if (p.Z < lo || p.Z > hi) return { err: `Z 只能是 ${lo}..${hi}，收到 ${p.Z}` }
      return { params: { Z: p.Z } }
    }

    case 'setWavefunctionMode': return pick(name, p, 'mode', ENUMS.wavefunction)
    case 'setOrbitalModel': {
      const base = pick(name, p, 'model', ENUMS.orbitalModel)
      if (base.err) return base
      if (p.zeta === undefined || p.zeta === null) return base
      const z = Number(p.zeta)
      if (!Number.isFinite(z) || z <= 0 || z > 20) {
        return { err: 'setOrbitalModel 的 zeta 需要 (0, 20] 的正数'
          + '（省略则用 Z/n；碳的 2s/2p 标准值是 1.625）' }
      }
      return { params: { model: base.params.model, zeta: z } }
    }
    case 'setOrbitals': {
      const base = pick(name, p, 'set', ENUMS.orbitalSet)
      if (base.err) return base
      const setId = base.params.set
      if (setId === 'off') {
        // 关闭时不再理会 visible —— 但也不静默吞掉一个显然写错的下标
        if (p.visible !== undefined && !Array.isArray(p.visible)) {
          return { err: 'setOrbitals 的 visible 要么省略，要么是下标数组，如 [0,2]' }
        }
        return { params: { set: 'off' } }
      }
      const def = Hybrids.set(setId)
      if (!def) return { err: `内部不一致：${setId} 在枚举里但取不到定义` }
      if (p.visible === undefined || p.visible === null) return { params: { set: setId } }
      if (!Array.isArray(p.visible)) {
        return { err: `setOrbitals 的 visible 要是下标数组（${def.label} 有 ${def.count} 个，`
          + '如 [0,2]）；只想留一个就写 [0]' }
      }
      const bad = p.visible.filter((x) => !Number.isInteger(x) || x < 0 || x >= def.count)
      if (bad.length) {
        return { err: `${def.label} 只有 ${def.count} 个等价轨道，下标要在 0..${def.count - 1}；`
          + `收到越界的 ${JSON.stringify(bad)}` }
      }
      // 去重并排序：既让快照稳定（同样的意图给出同样的标量串），也避免重复项
      const uniq = Array.from(new Set(p.visible)).sort((a, b) => a - b)
      if (!uniq.length) return { err: `${def.label} 至少要留一个轨道可见；要全关请用 set:'off'` }
      return { params: { set: setId, visible: uniq } }
    }
    case 'setRenderMode': return pick(name, p, 'mode', ENUMS.render)
    case 'setPsiCriterion': return pick(name, p, 'criterion', ENUMS.psiCriterion)
    case 'setAngularView': return pick(name, p, 'which', ENUMS.angularWhich)
    case 'setViewTarget': return pick(name, p, 'target', ENUMS.viewTarget)
    case 'setSectionPlane': return pick(name, p, 'plane', ENUMS.plane)
    case 'setSectionMode': return pick(name, p, 'mode', ENUMS.sectionMode)

    case 'setIsosurfaceLevel': {
      if (p.fraction == null) return { err: 'setIsosurfaceLevel 需要 fraction（0..1 的比值）' }
      const f = Number(p.fraction)
      if (!Number.isFinite(f) || f <= 0 || f > 1) {
        return { err: `fraction 只能是 (0, 1] 内的数，收到 ${JSON.stringify(p.fraction)}` }
      }
      return { params: { fraction: f } }
    }

    case 'setParticleCount': {
      if (!isInt(p.count)) return { err: 'setParticleCount 需要整数 count' }
      const [lo, hi] = RANGES.pointCount
      if (p.count < lo || p.count > hi) return { err: `count 只能是 ${lo}..${hi}，收到 ${p.count}` }
      return { params: { count: p.count } }
    }

    case 'showRadial': {
      const raw = p.which
      const list = Array.isArray(raw) ? raw : (raw == null ? [] : [raw])
      const bad = list.filter((x) => ENUMS.radial.indexOf(x) < 0)
      if (bad.length) return { err: `径向曲线只能是 ${ENUMS.radial.join(' / ')}，收到 ${JSON.stringify(bad)}` }
      return { params: { which: list } }
    }

    case 'setRadialMarks': {
      const raw = p.feature
      if (raw == null) return { params: { feature: [], target: p.target || 'ALL' } }
      const list = Array.isArray(raw) ? raw : [raw]
      const bad = list.filter((x) => ENUMS.radialMark.indexOf(x) < 0)
      if (bad.length) return { err: `标注只能是 ${ENUMS.radialMark.join(' / ')}，收到 ${JSON.stringify(bad)}` }
      return { params: { feature: list, target: p.target || 'ALL' } }
    }

    case 'setAutoRotate':
      return { params: { on: !!p.on } }

    case 'setFormulaHighlight': {
      const v = p.part == null ? null : p.part
      if (v != null && ENUMS.formulaPart.indexOf(v) < 0) {
        return { err: `公式高亮只能是 ${ENUMS.formulaPart.filter(Boolean).join(' / ')} 或 null，收到 ${JSON.stringify(v)}` }
      }
      return { params: { part: v } }
    }

    case 'setSuperposition': {
      const list = p.terms
      if (!Array.isArray(list) || !list.length) return { err: 'setSuperposition 需要非空的 terms 数组' }
      for (const t of list) {
        if (!t || !isInt(t.n) || !isInt(t.l) || !isInt(t.m)) {
          return { err: 'terms 的每一项都要有整数 n / l / m，收到 ' + JSON.stringify(t) }
        }
        if (t.n < 1 || t.n > RANGES.n[1]) return { err: `terms 里的 n 只能是 1..${RANGES.n[1]}，收到 ${t.n}` }
        if (t.l < 0 || t.l > t.n - 1) return { err: `terms 里必须 l ≤ n−1（n=${t.n}），收到 l=${t.l}` }
        if (Math.abs(t.m) > t.l) return { err: `terms 里必须 |m| ≤ l（l=${t.l}），收到 m=${t.m}` }
      }
      return { params: { terms: list } }
    }

    case 'setChartTerm': {
      const v = p.term
      if (v === 'super' || v == null) return { params: { term: 'super' } }
      if (!isInt(v) || v < 0) return { err: `setChartTerm 的 term 只能是 'super' 或非负整数，收到 ${JSON.stringify(v)}` }
      return { params: { term: v } }
    }

    case 'linkRadialTo3D': {
      const v = Number(p.radius)
      if (!Number.isFinite(v) || v < 0 || v > 200) {
        return { err: `linkRadialTo3D 的 radius 只能是 0..200（a₀），收到 ${JSON.stringify(p.radius)}` }
      }
      return { params: { radius: v } }
    }

    case 'focusChart': {
      const t = (p.target == null) ? 'none' : p.target
      if (['radial', 'section', 'thetaPhi', 'none'].indexOf(t) < 0) {
        return { err: `focusChart 的 target 只能是 radial / section / thetaPhi / none，收到 ${JSON.stringify(p.target)}` }
      }
      return { params: { target: t } }
    }

    case 'animateIsosurfaceLevel': {
      const f = Number(p.from)
      const t2 = Number(p.to)
      if (!Number.isFinite(f) || !Number.isFinite(t2)) {
        return { err: 'animateIsosurfaceLevel 需要数值 from 与 to（0.003..0.8 的比值）' }
      }
      if (f < 0.003 || f > 0.8 || t2 < 0.003 || t2 > 0.8) {
        return { err: `from/to 只能在 0.003..0.8，收到 ${f} → ${t2}` }
      }
      const d = (p.durationMs == null) ? 1200 : Number(p.durationMs)
      if (!Number.isFinite(d) || d < 300 || d > 6000) {
        return { err: `durationMs 只能是 300..6000，收到 ${JSON.stringify(p.durationMs)}` }
      }
      return { params: { from: f, to: t2, durationMs: d } }
    }

    case 'setRelPhase': {
      const v = Number(p.phase)
      if (!Number.isFinite(v)) return { err: `setRelPhase 需要数值 phase，收到 ${JSON.stringify(p.phase)}` }
      return { params: { phase: v } }
    }

    case 'restoreState': {
      if (!p.state || typeof p.state !== 'object') return { err: 'restoreState 需要 state 对象' }
      return { params: { state: p.state } }
    }

    default:
      return { err: `orbit 模块不支持动作：${name}` }
  }
}

/** 单值枚举动作的通用校验 */
function pick(name, p, key, allowed) {
  const e = enumErr(name, key, p[key], allowed)
  if (e) return e
  if (p[key] == null) return { err: `${name} 需要 ${key}（${allowed.join(' / ')}）` }
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
