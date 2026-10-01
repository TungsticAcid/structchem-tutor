/**
 * error-causes.js — 错因库
 *
 * 一个字段同时服务三个节点（这是它最值得花力气的原因）：
 *   · `quiz`  出题时 → `distractor` 用作干扰项来源（**每个错误选项都带诊断信息**，
 *             学生选错时立刻知道错在哪一类，而不是"随便蒙错了"）
 *   · `grade` 判卷时 → `diagnosticActions` 把画面切到能揭示错误根源的状态
 *   · `explain` 讲解时 → `oneLine` 提前点出易错处
 *
 * ★ 干扰项为什么不能用随机数：学生在选项上**花的时间**就是教学信号。
 *   正确选项之外的三个位置若只是凑数的邻近值，学生答错后我们无从知道他是
 *   "概念不清"还是"算错一步"——而这两种错需要完全不同的补救。
 *   故本表的每条错因都必须绑定一个具体的错误认知，且该认知要在真实学生身上常见。
 *
 * ★ 数据来源（两类，用途不同）：
 *   1. 《出题引擎技术设计》§5.2 的错因种子（E-A1…E-C2）—— 教学设计
 *   2. **2026-09-22 晶体数据核查中发现的真实易错点**（csCl 的点阵型式、
 *      金刚石的结构基元、石墨的层内配位数）—— 这些是**学科内部**长期存在的混淆，
 *      教材与学生都会踩，参考 `crystal/activity/数据核查报告.md`
 *
 * ★ 版权：错因是**教学判断**（"学生常犯什么错"），不是教材文字。
 *   `misconceptions` 字段在知识条目里另有自然语言版本，两者通过 `id` 互引
 *   （见 tools/test-knowledge.mjs 的双向互引断言）。
 */

/** 四级错误类型（《出题引擎技术设计》§5.1） */
export const CAUSE_TYPES = {
  'E-A': '概念混淆',
  'E-B': '计数错误',
  'E-C': '计算失误',
  'E-D': '空间想象偏差',
}

/**
 * 错因库。
 *
 * 字段说明：
 *   kps              该错因涉及的知识点（用于按知识点筛选题与诊断）
 *   wrongBelief      错误认知的一句话表述（**给学生看的不是这句**，这是内部描述）
 *   distractor       出题时用作干扰项的**可直接选的值**（数值，或"体心立方(cI)"这类概念名）
 *
 *   ★ `distractor: null` 的含义：**该错因的干扰项依赖题目上下文，由模板按上下文提供**。
 *     例如"把 A1 与 A3 的层序记反"——它的干扰项是**相对正确答案**的一次互换，
 *     没有脱离题目的固定取值。模板在生成时给出选项并打上本错因的 id
 *     （见 templates.js 的 c3-stacking）。
 *
 *     这个约定是**被一次真实缺陷逼出来的**：原先这些字段写的是给模板的指引文字
 *     （"在 12 与 6 之间互换"、"Z 倍偏大的密度值"），而 `distractorsFromCauses()`
 *     直接把字段值当选项文本用，于是学生看到的选项是
 *     "在 12 与 6 之间互换"——一句说明，而不是一个可以选的答案。
 *     凡是**相对**的描述都要设 null，凡是**绝对**的值才能留在这里。
 *
 *   oneLine          答错时的**一句话点破**（不含答案）
 *   diagnosticActions 诊断动作序列（走 applySceneActions，每步必须带 speech 旁白）
 *   avoid            诊断时**不该说**的话（grade 节点的禁令）
 *   followUp         引导话术
 *
 * ★ 诊断动作只用**已实现的动作词汇表**（见 modules/crystal/actions.js 的 VOCAB）。
 *   需要"高亮某些原子"的地方暂用 `setAtomVisibility` 的反向操作（隐藏其他元素、
 *   突出目标）达到相近的教学效果——`highlightAtoms` 在 P4 加入后这些位置会更直接。
 */
export const ERROR_CAUSES = [
  // ==========================================================================
  // E-A 概念混淆
  // ==========================================================================
  {
    id: 'E-A1',
    type: 'E-A',
    kps: ['crystal:C5'],
    label: '把八面体的面数当成空隙数',
    wrongBelief: '正八面体有 8 个面，所以每个球周围有 8 个八面体空隙',
    distractor: 8,
    oneLine: '这是正八面体的**面数**，不是空隙的个数——空隙数由堆积方式决定，与多面体有几个面无关。',
    diagnosticActions: [
      { action: 'setLayers', params: { layers: { interstices: true, octahedral: true, atoms: true } }, speech: '我把八面体空隙打开，你数一数中间这个球周围有几个。' },
      { action: 'setView', params: { direction: 'iso' }, speech: '先看整体：注意它们分居中心球的上下两侧。' },
    ],
    avoid: '不要直接说出正确答案是 6',
    followUp: '上下各几个？加起来是多少？',
  },
  {
    id: 'E-A2',
    type: 'E-A',
    kps: ['crystal:C3'],
    label: '把 A1 与 A3 的层序记反',
    wrongBelief: '立方最密是 ABAB…、六方最密是 ABCABC…',
    distractor: null,
    oneLine: '层序的记法有个便于记忆的对应：**立方的英文 C 提示它要走到第三层（ABC）**，六方只有两层重复（AB）。',
    diagnosticActions: [
      { action: 'loadCrystal', params: { crystalId: 'fcc' }, speech: '先看 Cu 型（立方最密）。' },
      { action: 'setLayers', params: { layers: { atoms: true, wireframe: true, bonds: false } }, speech: '注意第三层与第一层的相对位置。' },
      { action: 'setView', params: { direction: 'front' }, speech: '从侧面看密置层的堆叠。' },
    ],
    avoid: '不要用"你记反了"这种否定式开头',
    followUp: '如果把第三层盖上去，它与第一层是对齐的还是错开的？',
  },
  {
    id: 'E-A3',
    type: 'E-A',
    kps: ['crystal:C1'],
    label: '把点阵型式与晶系混为一谈',
    wrongBelief: '立方晶系就是面心立方；"面心立方"是一种晶系',
    distractor: null,
    oneLine: '晶系说的是**晶胞形状**（a、b、c 与三个夹角的关系），点阵型式说的是**点阵点怎么排布**——同一晶系可以有多种点阵型式。',
    diagnosticActions: [
      { action: 'setLayers', params: { layers: { latticePoints: true, wireframe: true } }, speech: '打开点阵点图层：现在画面里只剩点阵点，晶系对应的晶胞形状还看得见吗？' },
    ],
    avoid: '不要只说"这是两个不同的概念"就结束',
    followUp: '立方晶系一共有几种点阵型式？它们都属于同一个晶系吗？',
  },
  {
    id: 'E-A4',
    type: 'E-A',
    kps: ['crystal:C4', 'crystal:C5'],
    label: '把配位数与空隙数混淆',
    wrongBelief: '配位数和"每个球周围的空隙数"是同一个量',
    distractor: 12,
    oneLine: '配位数数的是**近邻原子**的个数，空隙数数的是**球与球之间的空位**——两者都在球周围，但数的是不同的东西。',
    diagnosticActions: [
      { action: 'setLayers', params: { layers: { atoms: true, bonds: true, interstices: false } }, speech: '先只看原子：中心球周围紧挨着几个球？这就是配位数。' },
      { action: 'setLayers', params: { layers: { interstices: true, octahedral: true } }, speech: '现在打开空隙：这些位置上一个原子都没有，它们在球与球之间的凹陷处。' },
    ],
    avoid: '不要在没有区分两者的前提下直接给数值',
    followUp: '一个是"有几个球"，一个是"有几个空位"，分别数一数。',
  },
  {
    id: 'E-A5',
    type: 'E-A',
    kps: ['crystal:C1'],
    label: '★ 把 CsCl 型说成体心立方',
    wrongBelief: 'CsCl 是体心立方结构，所以点阵型式是体心立方(cI)',
    distractor: '体心立方(cI)',
    oneLine: 'Cs⁺ 与 Cl⁻ 是**不同种**离子——体心点阵要求顶点与体心的**环境完全相同**（能靠平移互相重合），而 Cs⁺ 与 Cl⁻ 显然不满足。所以它的点阵型式是**简单立方(cP)**，"体心"只是这一组离子的排列外观。',
    diagnosticActions: [
      { action: 'loadCrystal', params: { crystalId: 'csCl' }, speech: '看 CsCl 型：顶点上是 Cs⁺，体心是 Cl⁻。' },
      { action: 'setLayers', params: { layers: { latticePoints: true, atoms: false } }, speech: '打开点阵点图层——请注意点阵点只落在顶点上，体心**没有**点阵点。' },
      { action: 'setView', params: { direction: 'iso' }, speech: '点阵点是"能靠平移互相重合的位置"，Cs⁺ 与 Cl⁻ 之间不能这样重合。' },
    ],
    avoid: '不要只说"答案错了"——要让学生看见点阵点的分布',
    followUp: '如果把体心的 Cl⁻ 换成 Cs⁺，点阵型式会变成什么？（对照 bcc 晶体）',
  },
  {
    id: 'E-A6',
    type: 'E-A',
    kps: ['crystal:C2'],
    label: '★ 把"原子环境相同"当成"被点阵平移联系"',
    wrongBelief: '金刚石晶胞里 8 个碳原子完全等效，所以结构基元就是一个碳原子',
    distractor: 'C（1 个原子）',
    oneLine: '"环境相同"与"被点阵平移联系"不是一回事。金刚石的 8 个碳**确实**环境相同，但点阵平移只能联系其中一半——结构基元是 **C₂**，不是 C。',
    diagnosticActions: [
      { action: 'loadCrystal', params: { crystalId: 'diamond' }, speech: '看金刚石：晶胞里 8 个碳。' },
      { action: 'setLayers', params: { layers: { latticePoints: true, atoms: true } }, speech: '打开点阵点：点阵点数只有 4 个（面心立方），而原子有 8 个。' },
    ],
    avoid: '不要说"你概念不清"，要说"这两个说法差在哪里"',
    followUp: '8 个原子 ÷ 4 个点阵点 = 每个点阵点代表几个原子？',
  },
  {
    id: 'E-A7',
    type: 'E-A',
    kps: ['crystal:C4'],
    label: '★ 把石墨的层内配位数当成"无经典配位数"',
    wrongBelief: '石墨和干冰一样是分子晶体，所以也"无经典配位数"',
    distractor: '无经典配位数（分子晶体）',
    oneLine: '干冰是**分子间**靠范德华力结合的**分子晶体**；石墨层内是**共价键**，每个碳在层内连 3 个碳——它有明确的层内配位数 3，只是层与层之间靠范德华力。两者不是一回事。',
    diagnosticActions: [
      { action: 'loadCrystal', params: { crystalId: 'graphite' }, speech: '看石墨：先注意同一层内的碳。' },
      { action: 'setLayers', params: { layers: { bonds: true, atoms: true, wireframe: false } }, speech: '打开化学键：层内每个碳连着三个碳，这是共价键。' },
      { action: 'loadCrystal', params: { crystalId: 'co2' }, speech: '再对比干冰：分子之内是共价键，分子之间没有化学键。' },
    ],
    avoid: '不要把"无经典配位数"当成分子晶体的统一定义',
    followUp: '石墨层内、层间的结合力分别是什么？',
  },

  // ==========================================================================
  // E-B 计数错误
  // ==========================================================================
  {
    id: 'E-B1',
    type: 'E-B',
    kps: ['crystal:C5'],
    label: '★ 用晶胞内总数代替"每个球周围"的数目',
    wrongBelief: 'Cu 型晶胞里有 4 个八面体空隙，所以每个球周围有 4 个八面体空隙',
    distractor: 4,
    oneLine: '"晶胞内共有几个"与"每个球周围有几个"是**两个问题**：前者是晶胞这个盒子里的总数（4），后者是盯着一个球看它周围（6）。同一个晶体，答案不同。',
    diagnosticActions: [
      { action: 'loadCrystal', params: { crystalId: 'fcc' }, speech: '看 Cu 型，先数晶胞内一共有几个八面体空隙。' },
      { action: 'setLayers', params: { layers: { interstices: true, octahedral: true } }, speech: '打开八面体空隙——晶胞内共 4 个位置。' },
      { action: 'setView', params: { direction: 'iso' }, speech: '现在换个问法：只盯着中间这一个球，它周围有几个？注意相邻晶胞里也有。' },
    ],
    avoid: '不要在没讲清两个问法的区别前给出第二个数值',
    followUp: '数的时候要不要把相邻晶胞里的也算进来？',
  },
  {
    id: 'E-B2',
    type: 'E-B',
    kps: ['crystal:C2'],
    label: '忘记除以结构基元的原子数',
    wrongBelief: '结构基元数 = 晶胞内原子数',
    distractor: null,
    oneLine: '结构基元数 = 晶胞原子数 ÷ 每个基元含的原子数。这两个数只在"基元恰好含 1 个原子"时才相等。',
    diagnosticActions: [
      { action: 'setLayers', params: { layers: { atoms: true, latticePoints: true } }, speech: '同时打开原子与点阵点，对照着数。' },
    ],
    avoid: '不要跳过"每个基元含几个原子"这一步',
    followUp: '一个点阵点代表几个原子？',
  },
  {
    id: 'E-B3',
    type: 'E-B',
    kps: ['crystal:C2', 'crystal:C7'],
    label: '把顶点/棱/面上的原子整个算作晶胞内的',
    wrongBelief: '晶胞里有 8 个顶点原子 + 6 个面心原子 = 14 个原子',
    distractor: 14,
    oneLine: '顶点上的原子被 8 个晶胞共有、面上的被 2 个共有——先按"分摊"折算，再相加。',
    diagnosticActions: [
      { action: 'setLayers', params: { layers: { atoms: true, wireframe: true, auxiliaryBody: true } }, speech: '看晶胞线框：顶点这个球，其实伸到了相邻晶胞里。' },
    ],
    avoid: '不要只给折算结果，要让学生看到"共享"这件事',
    followUp: '顶点原子有几个晶胞共用？面心呢？',
  },

  // ==========================================================================
  // E-C 计算失误
  // ==========================================================================
  {
    id: 'E-C1',
    type: 'E-C',
    kps: ['crystal:C7'],
    label: '★ 密度公式里的 Z 取成了晶胞原子数',
    wrongBelief: 'ρ = (晶胞原子数)·M / (N_A·V)',
    distractor: null,
    oneLine: '公式里的 Z 是**化学式单位数**，不是晶胞里的原子个数。NaCl 晶胞含 8 个原子，但只有 **4 个** NaCl 单位——取 8 会算出接近两倍的密度。',
    diagnosticActions: [
      { action: 'loadCrystal', params: { crystalId: 'naCl' }, speech: '看 NaCl 晶胞：4 个 Na⁺ + 4 个 Cl⁻ = 8 个原子。' },
      { action: 'setLayers', params: { layers: { atoms: true, bonds: true } }, speech: '但"一个 NaCl 单位"包含 1 个 Na 和 1 个 Cl——所以是 8 ÷ 2 = 4 个单位。' },
    ],
    avoid: '不要只说"公式代错了"',
    followUp: '每个化学式单位里含几个原子？',
  },
  {
    id: 'E-C2',
    type: 'E-C',
    kps: ['crystal:C7'],
    label: '体积公式误用立方特例',
    wrongBelief: '任何晶胞的体积都用 a³',
    distractor: null,
    oneLine: 'V = abc·√(1−cos²α−cos²β−cos²γ+2cosαcosβcosγ) 是通用式；只有立方晶系才能退化成 a³。',
    diagnosticActions: [
      { action: 'loadCrystal', params: { crystalId: 'hcp' }, speech: '看 Mg 型（六方晶体）：它的三个晶胞参数不都相等。' },
      { action: 'setLayers', params: { layers: { wireframe: true } }, speech: '看它的晶胞形状——不是正方体。' },
    ],
    avoid: '不要直接给公式，先让他看出晶胞不是立方体',
    followUp: '这个晶胞的三个边长分别是什么关系？',
  },
  {
    id: 'E-C3',
    type: 'E-C',
    kps: ['crystal:C7'],
    label: '最近邻距离漏算相邻晶胞里的原子',
    wrongBelief: '在同一晶胞内找最近的同种原子即可',
    distractor: null,
    oneLine: '晶胞边界上的原子，它的最近邻**常常在相邻晶胞里**——只在当前晶胞内找会系统性偏大。',
    diagnosticActions: [
      { action: 'setLayers', params: { layers: { atoms: true, auxiliaryFace: true } }, speech: '看面对角线：相切的两个球，其中一个的邻居在盒子的外侧。' },
    ],
    avoid: '不要说"要考虑周期性"就结束',
    followUp: '这个球在晶胞边界上，它对面的那个球在盒子里面还是外面？',
  },

  // ==========================================================================
  // E-D 空间想象偏差
  // ==========================================================================
  {
    id: 'E-D1',
    type: 'E-D',
    kps: ['crystal:C4'],
    label: '以为 4 配位是平面正方形的',
    wrongBelief: '4 个配位原子与中心原子在同一平面上',
    distractor: '平面正方形',
    oneLine: '4 配位可以有两种构型：**平面正方形**（如某些配合物）与**正四面体**（如金刚石、S²⁻ 的配位）。要看具体的成键方式。',
    diagnosticActions: [
      { action: 'loadCrystal', params: { crystalId: 'zincBlende' }, speech: '看立方 ZnS：中心原子周围 4 个配位原子。' },
      { action: 'setLayers', params: { layers: { bonds: true, auxiliaryBody: true } }, speech: '打开辅助体——注意这 4 个位置构成的是四面体，不是平面。' },
      { action: 'setView', params: { direction: 'iso' }, speech: '转一下视角，看它们是否共面。' },
    ],
    avoid: '不要断言"就是四面体"，让学生自己看出不共面',
    followUp: '把这 4 个原子连起来，得到的是什么形状？',
  },
  {
    id: 'E-D2',
    type: 'E-D',
    kps: ['crystal:C5'],
    label: '把层间距离当成了最近邻',
    wrongBelief: '石墨中碳的最近邻是层间相对的那个碳',
    distractor: null,
    oneLine: '最近邻要看**实际距离**，不是"看起来正对着"。层间是范德华力，距离比层内的共价键长得多。',
    diagnosticActions: [
      { action: 'loadCrystal', params: { crystalId: 'graphite' }, speech: '看石墨：层内与层间的距离明显不同。' },
      { action: 'setView', params: { direction: 'front' }, speech: '从侧面看，层与层的间隙比层内原子间距大得多。' },
    ],
    avoid: '不要说"那是范德华力所以不算"，要先让他看出距离差异',
    followUp: '哪个距离更短？',
  },
]

// ============================================================================
// 查询接口
// ============================================================================

/** 按 id 取一条 */
export function causeById(id) {
  return ERROR_CAUSES.find((c) => c.id === id) || null
}

/** 取与某知识点相关的错因 */
export function causesForKnowledgePoint(kp) {
  const key = String(kp).includes(':') ? String(kp) : `crystal:${kp}`
  return ERROR_CAUSES.filter((c) => (c.kps || []).includes(key))
}

/** 取与某晶体相关的错因（经能力矩阵映射到知识点） */
export function causesForCrystal(crystalId, matrix) {
  if (!matrix) return []
  const row = matrix[crystalId]
  if (!row) return []
  const kps = new Set(Object.keys(row).filter((k) => row[k] === 'strong'))
  return ERROR_CAUSES.filter((c) => (c.kps || []).some((k) => kps.has(k)))
}

/** 全部错因 id（供知识条目互引校验） */
export function allCauseIds() {
  return ERROR_CAUSES.map((c) => c.id)
}

export default { CAUSE_TYPES, ERROR_CAUSES, causeById, causesForKnowledgePoint, causesForCrystal, allCauseIds }
