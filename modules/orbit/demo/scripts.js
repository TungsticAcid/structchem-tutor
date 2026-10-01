// ★ 旁白与标题走 t() 现取（见本文件上方说明与 tmp/i18n/gen-orbit-demo-zh.mjs）。
import '../i18n.js'
import { t } from '../../../packages/i18n/index.js'

/**
 * demo/scripts.js（orbit 模块）—— 内置演示脚本（**零 token**）
 *
 * 每段演示是一串预置的「动作 + 旁白」，播放时直接交给分镜队列，**完全不经模型**。
 * 与 crystal 的 `modules/crystal/demo/scripts.js` 同一套约定（脚本属模块、播放属中枢）：
 *   · 零 token —— 教室网络差或没配 Key 时也能用
 *   · 流程可控 —— 参赛演示要"每次演出来都一样"，模型即时生成有随机性
 *   · 质量有保证 —— 脚本是精心编排的教学序列
 *
 * ★ 从上游 `js/agent/demo-mode.js` 的 `const SCRIPTS` **原样搬运**（对象键即 id），
 *   下面那段文件头注释一并保留：它记着两条**实测得来**的硬规矩，
 *   以及"本轮就这么错过一次"的记录——那种注释丢了就重建不出来了。
 *
 * ★ 四段脚本各自对应一个经典易错点，写脚本前先读它们自己的注释。
 */

/* ============================================================================
   以下为上游文件的头部注释（原文保留）
   ============================================================================ */

/**
 * demo-mode.js — 课堂演示模式（脚本回放，零 token）
 *
 * ★ 为什么演示回放不走 LLM：
 *   课堂上不能容忍"每点一次下一步就等模型 3 秒"。演示脚本在**首次生成时**由人/模型
 *   编排一次，之后存为脚本反复回放——既保证课堂流畅，也支撑"演示脚本可保存复用"
 *   这一推广卖点。
 *
 * 每个脚本 = 若干步，每步 = 一句讲解 + 一组受控动作。
 * 内置脚本的物理内容已核对（如 3d 的径向节点是 0 个而非 2 个）。
 *
 * ★★ 两条**实测得出**的硬规矩，改脚本前务必先读（都踩过，都有截图）：
 *
 *  ① 阈值读数按 |ψ| 判据写，且每一步的"可见壳层数"都与旁白核对过 ——
 *     核对办法是拿 shellPeakFractions 与 iso = f² 比：径向壳的峰值高于阈值才会显出来。
 *     例如 3s 的 0.012 这个读数，就是为了让三层壳都显出来（旁白要讲"两层内壳"）。
 *     ⚠️ 别按"绝对值等价"去做开方换算：那会把 iso 抬高一两个量级、外层壳全被切掉，
 *     "两层内壳"这句旁白当场就不成立（本轮就这么错过一次）。
 *     → 所以每个脚本的第一步都**显式下发 setPsiCriterion{psi}**，把判据钉死：
 *       脚本里的数字只在 ψ 判据下有那个含义，学生当前若停在 |ψ|² 档，
 *       同一个 0.08 会被平方解释，画面完全对不上。
 *
 *  ② **同心壳必须在截面里讲，不能在三维里讲** —— 这是本轮改写的核心。
 *     径向节点对应的"内层壳"是**同心的**，三维等值面又是实体渲染：外层壳必然把内层
 *     整个包住，降阈值只会让**颜色**变（phase 着色按 sign ψ），形状看上去还是同一个球。
 *     实测：3s 的 0.08 → 0.012，三维截图两张几乎一模一样，而同参数下的 xz 截面从
 *     "一个圈"变成"三圈同心圆"，套娃一目了然。
 *     ⚠️ 由此得到一条更一般的判据：**"旁白声称的现象"才是验收标准，不是"状态值对不对"**。
 *       状态（阈值、壳层数）全对、旁白"看到了吗？像套娃一样出现了内层壳"仍可能是空话。
 *     ⚠️ 顺带实测证伪的两条老路，别再用：
 *       · spotlightNodes{radial} 画的节面球面 —— 标着"×2"，可见的只有最外面那个；
 *       · linkRadialTo3D 的参考球 —— 半径小于等值面时被整个包住，只剩左下角标签可见。
 *       参考球要用得先**把阈值收高**让等值面缩进去（见 rVsD 第 3 步，那里阈值收到 0.45）。
 */

/* ============================================================================
   脚本数据
   ============================================================================ */

export const DEMO_SCRIPTS = {
    /* --------------------------------------------------------------- */
    nodeDistribution: {
      get title() { return t('orbit.demo.nodeDistribution.title') },
      points: ['K5', 'K2'],
      steps: [
        {
          // 钉判据 + 铺好三维语境：3s 是球，角度节面 0 个
          get speech() { return t('orbit.demo.nodeDistribution.s0') },
          actions: [
            { action: 'setPsiCriterion', params: { criterion: 'psi' } },
            { action: 'setWavefunctionMode', params: { mode: 'real' } },
            { action: 'setRenderMode', params: { mode: 'surface' } },
            { action: 'setQuantumNumbers', params: { n: 3, l: 0, m: 0 } },
            { action: 'setIsosurfaceLevel', params: { fraction: 0.08 } },
          ],
        },
        {
          // ★ 必须在**截面**里讲"套娃"，且要先开窗再改图（focusChart 要排最前）
          get speech() { return t('orbit.demo.nodeDistribution.s1') },
          actions: [
            { action: 'focusChart', params: { target: 'section' } },
            { action: 'setSectionPlane', params: { plane: 'xz' } },
            { action: 'setSectionMode', params: { mode: 'intensity' } },
            { action: 'animateIsosurfaceLevel', params: { from: 0.08, to: 0.012, durationMs: 1200 } },
          ],
        },
        {
          // 形状变（三维）+ 壳层少（剖面）—— 一次改两个通道，学生同屏对照
          get speech() { return t('orbit.demo.nodeDistribution.s2') },
          actions: [
            { action: 'setQuantumNumbers', params: { n: 3, l: 1, m: 0 } },
            { action: 'setIsosurfaceLevel', params: { fraction: 0.05 } },
          ],
        },
        {
          get speech() { return t('orbit.demo.nodeDistribution.s3') },
          actions: [
            { action: 'setQuantumNumbers', params: { n: 3, l: 2, m: 0 } },
            { action: 'setIsosurfaceLevel', params: { fraction: 0.10 } },
          ],
        },
        {
          // 切回 3s —— 让"两层内壳"与"D(r) 的两个零点"在同一屏上焊起来
          get speech() { return t('orbit.demo.nodeDistribution.s4') },
          actions: [
            { action: 'focusChart', params: { target: 'radial' } },
            { action: 'setQuantumNumbers', params: { n: 3, l: 0, m: 0 } },
            { action: 'setIsosurfaceLevel', params: { fraction: 0.012 } },
            { action: 'showRadial', params: { which: ['D'] } },
            { action: 'setRadialMarks', params: { target: 'D', feature: 'zeros' } },
          ],
        },
        {
          get speech() { return t('orbit.demo.nodeDistribution.s5') },
          actions: [
            { action: 'focusChart', params: { target: 'none' } },
            { action: 'setRadialMarks', params: { target: 'D', feature: null } },
            { action: 'setAutoRotate', params: { on: false } },
          ],
        },
      ],
    },

    /* --------------------------------------------------------------- */
    rVsD: {
      get title() { return t('orbit.demo.rVsD.title') },
      points: ['K3'],
      steps: [
        {
          get speech() { return t('orbit.demo.rVsD.s0') },
          actions: [
            { action: 'focusChart', params: { target: 'radial' } },
            { action: 'setQuantumNumbers', params: { n: 1, l: 0, m: 0 } },
            { action: 'setWavefunctionMode', params: { mode: 'real' } },
            { action: 'setRenderMode', params: { mode: 'surface' } },
            { action: 'showRadial', params: { which: ['R'] } },
          ],
        },
        {
          get speech() { return t('orbit.demo.rVsD.s1') },
          actions: [
            { action: 'showRadial', params: { which: ['R', 'D'] } },
            { action: 'setRadialMarks', params: { target: 'D', feature: 'peak' } },
          ],
        },
        {
          // ★ 参考球要可见，前提是它落在等值面**外面** —— 故把阈值收到 0.45（1s 的面缩到 1 a₀ 以内）
          get speech() { return t('orbit.demo.rVsD.s2') },
          actions: [
            { action: 'focusChart', params: { target: 'none' } },
            { action: 'setIsosurfaceLevel', params: { fraction: 0.45 } },
            { action: 'linkRadialTo3D', params: { radius: 1 } },
            { action: 'setAutoRotate', params: { on: true } },
          ],
        },
        {
          get speech() { return t('orbit.demo.rVsD.s3') },
          actions: [
            { action: 'setAutoRotate', params: { on: false } },
            // 演示结束顺手撤掉参考球、把阈值放回去：辅助几何用完不收会把画面一直弄脏
            { action: 'linkRadialTo3D', params: { radius: 0 } },
            { action: 'setIsosurfaceLevel', params: { fraction: 0.10 } },
          ],
        },
      ],
    },

    /* --------------------------------------------------------------- */
    complexReal: {
      get title() { return t('orbit.demo.complexReal.title') },
      points: ['K6', 'K7'],
      steps: [
        {
          // ★ 为什么第 1、2 步必须用 2p（l = 1）：
          //   相位缠绕 mφ 只在**绕 z 轴转一圈**（即 xy 平面）上看得见。
          //   而 Θ_l^m ∝ sin^|m|θ · P(cosθ)，当 l − |m| 为**奇数**时含 cosθ 因子，
          //   xy 平面（θ = 90°）就**一定是节面**。l=2, m=1 正是这种情况 ——
          //   实测：3d + m=1 + xy 相位图上整张全是黑的（写着"本平面为节面 |ψ|² ≈ 0"）。
          //   l=1, m=1 时 l − m = 0 为偶，sinθ 在 θ=90° 取极大，缠绕才看得见。
          get speech() { return t('orbit.demo.complexReal.s0') },
          actions: [
            { action: 'focusChart', params: { target: 'none' } },
            { action: 'setPsiCriterion', params: { criterion: 'psi' } },
            { action: 'setQuantumNumbers', params: { n: 2, l: 1, m: 1 } },
            { action: 'setWavefunctionMode', params: { mode: 'complex' } },
            { action: 'setRenderMode', params: { mode: 'surface' } },
            { action: 'setAutoRotate', params: { on: true } },
          ],
        },
        {
          get speech() { return t('orbit.demo.complexReal.s1') },
          actions: [
            { action: 'focusChart', params: { target: 'section' } },
            { action: 'setSectionPlane', params: { plane: 'xy' } },
            { action: 'setSectionMode', params: { mode: 'phase' } },
          ],
        },
        {
          // ★ 跨轨道是物理决定的，不是偷懒：l−1 与 l−2 一奇一偶，
          //   没有任何一个 l 能让 |m|=1 和 |m|=2 同时在 xy 平面上有值。
          //   所以这里**明说换了轨道**，绝不写"能量没变"（n 从 2 变到 3，能量确实变了）。
          get speech() { return t('orbit.demo.complexReal.s2') },
          actions: [
            { action: 'setQuantumNumbers', params: { n: 3, l: 2, m: 2 } },
          ],
        },
        {
          get speech() { return t('orbit.demo.complexReal.s3') },
          actions: [
            { action: 'setAutoRotate', params: { on: false } },
            { action: 'setWavefunctionMode', params: { mode: 'real' } },
          ],
        },
        {
          get speech() { return t('orbit.demo.complexReal.s4') },
          actions: [
            { action: 'focusChart', params: { target: 'none' } },
          ],
        },
      ],
    },

    /* --------------------------------------------------------------- */
    sectionModes: {
      get title() { return t('orbit.demo.sectionModes.title') },
      points: ['K5', 'K7'],
      steps: [
        {
          get speech() { return t('orbit.demo.sectionModes.s0') },
          actions: [
            { action: 'focusChart', params: { target: 'section' } },
            { action: 'setPsiCriterion', params: { criterion: 'psi' } },
            { action: 'setWavefunctionMode', params: { mode: 'real' } },
            { action: 'setQuantumNumbers', params: { n: 3, l: 2, m: 0 } },
            { action: 'setSectionPlane', params: { plane: 'xz' } },
            { action: 'setSectionMode', params: { mode: 'intensity' } },
          ],
        },
        {
          get speech() { return t('orbit.demo.sectionModes.s1') },
          actions: [
            { action: 'setSectionMode', params: { mode: 'phase' } },
          ],
        },
        {
          get speech() { return t('orbit.demo.sectionModes.s2') },
          actions: [
            { action: 'setSectionMode', params: { mode: 'contour' } },
          ],
        },
        {
          get speech() { return t('orbit.demo.sectionModes.s3') },
          actions: [
            { action: 'focusChart', params: { target: 'none' } },
          ],
        },
      ],
    },

    /* --------------------------------------------------------------- */
    /**
     * 杂化与正四面体。
     *
     * ★ 这一段是 2026-10-01 随「杂化恢复 + 多轨道同屏」一起补的。补它的理由：
     *   原有四段脚本**一段都没用到叠加态或杂化**，而这恰恰是"原子轨道 → 分子形状"
     *   的桥。学生对"甲烷为什么是正四面体"的疑问，只有这里回答得了。
     *
     * ★ 脚本里的物理都是核对过的，不是顺手写的：
     *   · sp³ 的节锥半张角 = arccos(−1/3) = 109.471°，与四个瓣之间的夹角**是同一个数**
     *     ——因为一个杂化轨道的节锥正好穿过另外三个的方向。这不是巧合，可以当堂验算。
     *   · 单个 sp³ 的前瓣与后瓣符号相反、同半径处大小比恰好 2:1
     *     （(1/√3+√3):(√3−1/√3)），由 test-orbit-core ⑪ 的 ψ(+d)/ψ(−d) = −2 钉住。
     *   · 四个方向的夹角 109.471°、sp² 的 120°、sp 的 180° 由 queryOrbital(hybrids)
     *     从**系数反解**得到（test-orbit-module ⑤ 钉住），不是这里写死的。
     *
     * ★ 第 3 步为什么要切 Slater 型：氢型下 s 分量把每个轨道撑得很胖（前瓣张角 109.47°、
     *   后瓣 70.53°，两者连成一体），四个叠在一起看着像四个球。Slater 型（最小基组）
     *   的 2s 与 2p 共用径向函数、没有径向节点，形状是纯角度的 —— 教材上那个干净的
     *   四面体就是它。**这一步本身就是一课**：同一个分子形状，两种基组画出来不一样。
     */
    sp3Tetrahedron: {
      get title() { return t('orbit.demo.sp3Tetrahedron.title') },
      points: ['K9'],
      steps: [
        {
          // 第一步照例把判据钉死：脚本里的数字只在 ψ 判据下有那个含义（见文件头规矩①）
          get speech() { return t('orbit.demo.sp3Tetrahedron.s0') },
          actions: [
            { action: 'setPsiCriterion', params: { criterion: 'psi' } },
            { action: 'setWavefunctionMode', params: { mode: 'real' } },
            { action: 'setViewTarget', params: { target: 'wave' } },
            { action: 'setRenderMode', params: { mode: 'surface' } },
            { action: 'setQuantumNumbers', params: { n: 2, l: 0, m: 0 } },
          ],
        },
        {
          get speech() { return t('orbit.demo.sp3Tetrahedron.s1') },
          actions: [
            { action: 'setQuantumNumbers', params: { n: 2, l: 1, m: 0 } },
          ],
        },
        {
          get speech() { return t('orbit.demo.sp3Tetrahedron.s2') },
          actions: [
            { action: 'setOrbitalModel', params: { model: 'slater' } },
            { action: 'setOrbitals', params: { set: 'sp3', visible: [0] } },
          ],
        },
        {
          get speech() { return t('orbit.demo.sp3Tetrahedron.s3') },
          actions: [
            { action: 'setOrbitals', params: { set: 'sp3' } },
          ],
        },
        {
          get speech() { return t('orbit.demo.sp3Tetrahedron.s4') },
          actions: [
            { action: 'setOrbitals', params: { set: 'sp3', visible: [0, 1] } },
          ],
        },
        {
          get speech() { return t('orbit.demo.sp3Tetrahedron.s5') },
          actions: [
            { action: 'setOrbitals', params: { set: 'sp2' } },
          ],
        },
      ],
    },
  }

/** 按 id 取脚本（给 playDemo / 收藏夹重播用） */
export function demoById(id) {
  const d = (id && DEMO_SCRIPTS[id]) ? DEMO_SCRIPTS[id] : null
  if (!d) return null
  return {
    id: id,
    title: d.title,
    points: d.points || [],
    // ★ 展平：上游的"一步"是「一句旁白 + 一组动作」（`{speech, actions:[…]}`），
    //   而分镜队列的"一步"是**一个动作**（`{action, params, speech}`，见
    //   packages/agent-core/core/storyboard.js 的 applySequence）。
    //   两个粒度不同，必须在这里对齐——否则整个脚本会被当成一个非法步骤丢掉。
    //   展平规则：组内**第一个动作带上那句旁白**，其余不带（旁白重复 N 遍更糟）。
    //   并行提示：队列支持自动播放，"一组动作一次点击"的节奏由 auto 模式保住。
    steps: flatten(d.steps),
  }
}

/** 把「旁白 + 动作组」展平成分镜队列认的「一步一动作」 */
function flatten(steps) {
  const out = []
  ;(steps || []).forEach(function (s, si) {
    const acts = s.actions || (s.action ? [s] : [])
    acts.forEach(function (a, ai) {
      out.push({
        action: a.action,
        params: a.params || {},
        speech: (ai === 0) ? (s.speech || '') : '',
        srcStep: si,          // 保留"原属哪一组"，便于排查与将来恢复分组
      })
    })
  })
  return out
}

/**
 * 全部脚本的**清单**（给模型看的那一份）。
 * ★ 只有 id / 标题 / 知识点 / 步数，**不含每步的动作与旁白** —— 渐进式披露：
 *   模型要选择播哪一段，不需要先把几十步旁白读一遍。
 */
export function demoManifest() {
  return Object.keys(DEMO_SCRIPTS).map(function (id) {
    const d = DEMO_SCRIPTS[id]
    return {
      id: id,
      title: d.title,
      points: d.points || [],
      steps: flatten(d.steps).length,
    }
  })
}

export default { DEMO_SCRIPTS, demoById, demoManifest }
