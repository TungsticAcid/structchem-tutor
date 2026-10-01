/**
 * demo/scripts.js — 内置演示脚本（**零 token**）
 *
 * 每段演示是一串预置的「动作 + 旁白」，播放时直接交给分镜队列，
 * **完全不经模型**。三处价值：
 *
 *   ① **零 token**：演示内容不花任何 API 额度——教室网络差或没配 Key 时也能用
 *   ② **流程可控**：参赛演示视频需要"每次演出来都一样"，而模型即时生成有随机性
 *   ③ **质量有保证**：脚本是精心编排的教学序列，不会出现模型偶尔的编排失误
 *
 * ★ 与"模型编排演示"的关系是互补而非替代：
 *   预置脚本覆盖**最核心的几个教学点**（每个都对应一个经典易错处），
 *   模型则负责应付学生临时提出的、脚本没覆盖的请求。
 *   面板上的入口写的是"标准演示"，语义是"这门课最该看的那几段"。
 *
 * ★ 每步都用**已实现的受控动作**（见 module/actions.js 的 VOCAB）——
 *   脚本里不会出现做不到的动作，这是写的时候就要保证的。
 */

/**
 * 脚本库。
 *
 * `steps` 的每一项 = 一个动作 + 一句旁白（与 applySceneActions 的参数同形）。
 * 顺序有意为之：先安置视图与图层，最后调视角（setView 会重置缩放与平移）。
 */
export const DEMO_SCRIPTS = [
  // --------------------------------------------------------------------------
  {
    id: 'nacl-6',
    title: 'NaCl 为什么是 6 配位',
    kp: 'crystal:C4',
    crystalId: 'naCl',
    desc: '从球棍到八面体配位的完整演示（对应演示脚本场景 A）',
    steps: [
      { action: 'loadCrystal', params: { crystalId: 'naCl' }, speech: '我们来看 NaCl 型。先把它调出来。' },
      { action: 'setLayers', params: { layers: { atoms: true, bonds: true, wireframe: true, hydrogenBonds: false, axes: true } }, speech: '关掉与离子配位无关的图层，只留原子、化学键与晶胞框。' },
      { action: 'setView', params: { direction: 'front' }, speech: '先沿一个晶轴方向正视：与中心离子共面的有 4 个异号离子，另外 2 个沿视线方向前后夹住它——这就是 4+2。' },
      { action: 'highlightAtoms', params: { elements: ['Na'] }, speech: '把 Na⁺ 高亮。注意它们自己构成一套面心立方排列。' },
      { action: 'setAtomVisibility', params: { element: 'Cl', visible: false }, speech: '暂时把 Cl⁻ 藏起来，只看 Na⁺ 这一套子晶格。' },
      { action: 'setAtomVisibility', params: { element: 'Cl', visible: true }, speech: '把 Cl⁻ 恢复——现在看中心那个 Na⁺，它被 6 个 Cl⁻ 围成正八面体。' },
      { action: 'setView', params: { direction: 'top' }, speech: '换一个晶轴方向再看一次，仍然是 4+2 的格局——说明 6 不是视角造成的错觉。' },
      { action: 'setView', params: { direction: 'iso' }, speech: '' },
      { action: 'highlightAtoms', params: { elements: [] }, speech: '回到立体视角，取消高亮。6 配位、正八面体构型，这就是 NaCl 型的特点。' },
    ],
  },

  // --------------------------------------------------------------------------
  {
    id: 'fcc-holes',
    title: '最密堆积里的空隙分布',
    kp: 'crystal:C5',
    crystalId: 'fcc',
    desc: '打开空隙图层并区分"晶胞内"与"每个球周围"两种数法（C5 的最高危混淆）',
    steps: [
      { action: 'loadCrystal', params: { crystalId: 'fcc' }, speech: '以 Cu 型（立方最密堆积）为例看空隙。' },
      { action: 'setLayers', params: { layers: { atoms: true, wireframe: true, bonds: false, interstices: true, octahedral: true, tetrahedral: false } }, speech: '打开空隙图层与八面体空隙——注意空隙有个总开关，只开子层是不显示的。' },
      { action: 'setView', params: { direction: 'iso' }, speech: '这些位置上一个原子都没有，它们夹在球与球之间。' },
      { action: 'setView', params: { direction: 'top' }, speech: '从上方看，同一层的空隙位置最清楚——先数**晶胞内**共有几个：是 4 个。' },
      { action: 'setAppearance', params: { atomScale: 0.55 }, speech: '把原子缩小一点，空隙的位置更明显。' },
      { action: 'setView', params: { direction: 'front' }, speech: '现在换个问法：盯住**一个球**，它周围有几个八面体空隙？注意相邻晶胞里的也要算进来——是 6 个，上下各 3 个。' },
      { action: 'setAppearance', params: { atomScale: 1.0 }, speech: '恢复原子大小。' },
      { action: 'setLayers', params: { layers: { tetrahedral: true } }, speech: '再打开四面体空隙作对照：它更小，由 4 个球围成，数目与八面体不同。' },
    ],
  },

  // --------------------------------------------------------------------------
  {
    id: 'cscl-lattice',
    title: 'CsCl 为什么是简单立方而不是体心立方',
    kp: 'crystal:C1',
    crystalId: 'csCl',
    desc: '用点阵点图层揭示本源（C1 最经典的一处混淆）',
    steps: [
      { action: 'loadCrystal', params: { crystalId: 'csCl' }, speech: 'CsCl 型：顶点上是 Cs⁺，体心上是 Cl⁻。先看它的点阵型式是什么。' },
      { action: 'setLayers', params: { layers: { atoms: true, wireframe: true, bonds: false, latticePoints: false } }, speech: '先看清原子：顶点一组、体心一组，它们确实是**不同种**离子。' },
      { action: 'setLayers', params: { layers: { latticePoints: true } }, speech: '★ 关键一步：打开点阵点图层。点阵点只落在顶点上——体心**没有**点阵点。' },
      { action: 'setView', params: { direction: 'iso' }, speech: '为什么？点阵点必须是能靠**平移**互相重合的位置，而 Cs⁺ 与 Cl⁻ 之间做不到。' },
      { action: 'loadCrystal', params: { crystalId: 'bcc' }, speech: '对照 α-Fe 型（真正的体心立方）：顶点与体心都是**同一种**原子。' },
      { action: 'setLayers', params: { layers: { latticePoints: true } }, speech: '它的点阵点才既在顶点、又在体心——这才是体心立方。' },
      { action: 'loadCrystal', params: { crystalId: 'csCl' }, speech: '回到 CsCl：所以它的点阵型式是**简单立方(cP)**，"体心"只是这一组离子排列的外观。' },
    ],
  },

  // --------------------------------------------------------------------------
  {
    id: 'diamond-motif',
    title: '金刚石的结构基元为什么是 C₂',
    kp: 'crystal:C2',
    crystalId: 'diamond',
    desc: '8 个碳原子环境相同，却分成两套（C2 的经典易错点）',
    steps: [
      { action: 'loadCrystal', params: { crystalId: 'diamond' }, speech: '金刚石的晶胞里有 8 个碳原子。' },
      { action: 'setLayers', params: { layers: { atoms: true, bonds: true, wireframe: true } }, speech: '每个碳都是 sp³ 杂化、都连 4 个碳——它们**化学环境完全相同**。' },
      { action: 'setLayers', params: { layers: { latticePoints: true } }, speech: '★ 但打开点阵点看：面心立方的点阵点只有 4 个，而原子有 8 个。' },
      { action: 'setView', params: { direction: 'iso' }, speech: '平移操作只能把点阵点映到点阵点，所以 8 个碳被分成**两组**，每组 4 个。' },
      { action: 'setAppearance', params: { atomScale: 0.5 }, speech: '把球缩小，看出两组原子在空间里是交错的两套面心立方。' },
      { action: 'setAppearance', params: { atomScale: 1.0 }, speech: '恢复。' },
      { action: 'setView', params: { direction: 'front' }, speech: '所以结构基元含 8÷4 = **2** 个原子，即 C₂。"环境相同"不等于"被平移联系"。' },
    ],
  },

  // --------------------------------------------------------------------------
  {
    id: 'graphite-layers',
    title: '石墨的层状结构与各向异性',
    kp: 'crystal:C8',
    crystalId: 'graphite',
    desc: '层内共价、层间范德华——性质差异的结构根源',
    steps: [
      { action: 'loadCrystal', params: { crystalId: 'graphite' }, speech: '石墨：同样是碳，性质却与金刚石迥异。' },
      { action: 'setLayers', params: { layers: { atoms: true, bonds: true, wireframe: false } }, speech: '打开化学键——层内每个碳连 3 个碳，这是共价键。' },
      { action: 'setView', params: { direction: 'front' }, speech: '从侧面看，层与层之间**没有**化学键，只有较弱的范德华力。' },
      { action: 'setView', params: { direction: 'top' }, speech: '从上方看层内：密排的六元环网，剩余的 p 电子形成离域 π 键——所以石墨能导电。' },
      { action: 'setAppearance', params: { atomScale: 0.6 }, speech: '把球缩小，层的结构更清楚。' },
      { action: 'setView', params: { direction: 'iso' }, speech: '层内强、层间弱，这个"强—弱交替"就是石墨润滑性与导电各向异性的根源。' },
      { action: 'setAppearance', params: { atomScale: 1.0 }, speech: '恢复原子大小。' },
    ],
  },
]

/** 按 id 取脚本 */
export function demoById(id) {
  return DEMO_SCRIPTS.find((d) => d.id === id) || null
}

/** 按知识点取相关脚本 */
export function demosForKnowledgePoint(kp) {
  const key = String(kp || '').includes(':') ? String(kp) : `crystal:${kp}`
  return DEMO_SCRIPTS.filter((d) => d.kp === key)
}

/** 清单（给模型看的紧凑形式：只有 id/标题/知识点，不含步骤） */
export function demoManifest() {
  return DEMO_SCRIPTS.map((d) => ({ id: d.id, title: d.title, kp: d.kp, crystalId: d.crystalId, desc: d.desc }))
}

export default { DEMO_SCRIPTS, demoById, demosForKnowledgePoint, demoManifest }
