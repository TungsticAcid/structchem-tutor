/**
 * 应用入口
 * 统一加载分子/晶体结构 → 识别对称性 → 构建场景 + 对称元素 → 展示 + 信息面板 + 设置 + 精确变换
 */

/**
 * symmetry.js —— 分子对称性的页面（壳里的一页）
 *
 * ★ 本文件是**上游 `Symmetry Viewer/H5/src/main.js` 的忠实移植**：744 行里排布着
 *   20 多项功能（默认显隐策略、动画播放条、原子选中/虚化/轨道-稳定化子、
 *   σ 标签朝向、设置面板、中英双语、点群族排序、晶体分支…）。
 *   上一版壳里是**手写**的精简页面，只调了 `buildMoleculeScene` +
 *   `buildSymmetryElements` 两个函数——用户那句"对称性功能少了好多"说的就是它。
 *   所以这里改为移植 + 改 import：宁可保留上游的写法，也不重写一遍再丢一遍功能。
 *
 * ★ 与上游的两处**必要**差异（其余尽量逐字保留，便于将来对照）：
 *   1. DOM 顶层语句收进 `bootSymmetryPage()`，可以随路由反复挂载/卸载
 *      （上游是单页应用，只在加载时跑一次）
 *   2. 示例列表的点击经 `deps.onPickExample` 转交——这样**用户的操作与智能体的操作
 *      走同一条通路**，感知层看得见（主动介入的前提）
 *
 * ★ CSS 从上游 `index.html` 的 `<style>` 原样搬来，只做了**作用域化**：
 *   上游写的是 `:root` / `html, body, #app` / `body`，那是"整个文档只有我一个应用"
 *   的写法——放进多页壳里会改掉壳的 `--accent`、把 body 的背景与滚动整死。
 */
import { SYMMETRY_CSS, SYMMETRY_HTML } from './symmetry-markup.js'

import * as THREE from 'three'

import { SymmetryViewer } from '@modules/symmetry/render/viewer.js'
import { playSymmetryAnimation as playAnim, stopAnimation } from '@modules/symmetry/render/animation.js'
import { buildMoleculeScene, buildCrystalScene, buildAuxCube, buildAuxDihedral, computeCentroid } from '@modules/symmetry/render/scene-builder.js'
import { buildSymmetryElements } from '@modules/symmetry/render/symmetry-draw.js'
import { identifyPointGroup } from '@modules/symmetry/engine/pointGroup.js'
import { analyzeSpaceGroup, operationsToSymmetryElements } from '@modules/symmetry/space-group.js'
import { getCharacterTable } from '@modules/symmetry/engine/characterTables.js'
import { getUniqueElements } from '@modules/symmetry/core/structure.js'
import { EXAMPLES } from '@modules/symmetry/data/examples-index.js'
import { renderInfo } from '@modules/symmetry/ui/info.js'
import { getElementClassName, typeRank, findPrincipal, refineSymmetryElements } from '@modules/symmetry/engine/elementNaming.js'
import { t, i18n, groupName as i18nGroupName, applyStaticI18n, formatGroupSymbol, formatFormulaU } from '@modules/symmetry/i18n/index.js'
import { generateGroupOperations, orbit, stabilizer } from '@modules/symmetry/engine/groupOperations.js'
import {
  getVisualColor, setVisualColor,
  getAppearance, setAppearance,
  getElementColor, setElementColor,
  resetSettings,
  // 画布底色跟随主题要用它俩："用户显式挑过没有"是一个**事实**，得单独记
  isUserOverridden, markUserOverride,
} from '@modules/symmetry/data/settings.js'
import { resolvedTheme, onThemeChange } from '@ui-kit/theme.js'


/** 页面实例（一次只挂一个；unmount 时释放） */
let viewer = null
/** 当前示例 id（门面靠它对账） */
let currentExampleId = null
/** boot 返回的接口 */
let api = null

/**
 * 启动页面逻辑（上游 main.js 的正文）。
 *
 * @param {Object}   [deps]
 * @param {Function} [deps.onPickExample] (id) => void  用户在列表里点了某个示例
 * @returns {Object} { loadExampleById, currentExampleId, dispose }
 */
export function bootSymmetryPage(deps = {}) {
    const container = document.getElementById('viewer-container')
    viewer = new SymmetryViewer(container)

  /**
   * 模块门面（宿主注入）。有它时**它是显示状态的唯一真源**：
   * 页面只发动作、并按快照渲染。没有它（独立页）则退回本地状态，页面照样能用。
   */
  const facade = deps.facade || null

  let currentStructure = null
  let currentTitle = ''
  let currentSymmetryGroup = null
  let currentSymmetryItems = []
  let currentSymmetryElements = []
  let currentMoleculeGroup = null
  let currentAuxGroup = null
  let currentAtomMeshes = []
  let currentBondMeshes = []
  let currentSelectedAtom = null
  /**
   * ★ 显示状态**不再是页面的真源**。真源在模块里（`modules/symmetry/facade.js` 的 `display`），
   *   页面只是它的**渲染视图**：`renderFromState(snap)` 是唯一把状态落到画面的地方；
   *   复选框的 change 事件也只**发动作**，不改本地状态。
   *
   * 原先这里是 4 个 `let showXxx = …`，页面自己存——于是页面上那 20 多项功能
   * 全是"给人用的"，模型一个都改不动；而"模型改了状态、画面没跟上"这类不同步
   * 在结构上无法避免（两边各存一份，迟早分叉）。
   *
   * ★ `localState` 只在**没有门面**时使用（独立页场景），保证页面自身可用是底线；
   *   有门面时一切以快照为准。两条路径共用同一个 `renderFromState`。
   */
  const localState = {
    showSymmetry: true, showLabels: false, showAux: false, showAtomLabels: false,
    hiddenElements: '', playingKey: null, playToken: 0,
  }
  /** 最近一次渲染用的快照；播放防回声记的是上一次处理过的 token */
  let lastPlayToken = -1

  /** 当前显示状态：**有门面时以门面为准**（它是唯一真源），否则用本地状态。 */
  const currentState = () => (facade && typeof facade.getSnapshot === 'function')
    ? facade.getSnapshot()
    : localState

  // ==================== 示例选择下拉（自定义两列：点群/空间群 | 分子名） ====================
  const exampleWrap = document.getElementById('example-select')
  const exampleCurrent = document.getElementById('example-current')
  const exampleList = document.getElementById('example-list')

  /** 示例名称（按语言；英文用专业名 titleEn） */
  function exampleTitle(ex) {
    return i18n.lang === 'en' ? (ex.titleEn || ex.title) : ex.title
  }

  /** 示例显示文本：标题 + 化学式（Unicode 下标；纯文本，供 tooltip / current / 列表项） */
  function exampleDisplay(ex) {
    const t = exampleTitle(ex)
    const l = i18n.lang === 'en' ? ['(', ')'] : ['（', '）']
    return `${t}${l[0]}${formatFormulaU(ex.formula)}${l[1]}`
  }

  /** 结构标题（按语言；优先用示例库的精选名 title/titleEn，避免 XYZ 原始行 "过氧化氢 H2O2 (C2)"） */
  function structureTitle(structure) {
    const exMeta = EXAMPLES.find(e => e.structure === structure)
    if (exMeta) return i18n.lang === 'en' ? (exMeta.titleEn || exMeta.title) : exMeta.title
    return structure.title
  }

  /** 结构化学式（优先用示例库精选 formula；structure.formula 常为空——解析器未从 XYZ 推出） */
  function structureFormula(structure) {
    const exMeta = EXAMPLES.find(e => e.structure === structure)
    return (exMeta && exMeta.formula) || structure.formula || ''
  }

  /** 选中示例：更新当前显示 + 加载结构（current 附带点群符号并做下标） */
  function selectExample(ex) {
    // ★ 记下来：门面（facade.currentId）与页面必须对得上，否则智能体换过分子之后
    //   页面还停在上一个，"两边各说各话"。
    currentExampleId = (ex && ex.id) || null
    let html = exampleDisplay(ex)
    if (ex.category !== 'crystal') {
      const sym = identifyPointGroup(ex.structure).symbol
      html += `&nbsp;<span class="es-cur-sym">${formatGroupSymbol(sym)}</span>`
    }
    exampleCurrent.innerHTML = html
    exampleCurrent.dataset.id = ex.id
    for (const it of exampleList.querySelectorAll('.es-item')) {
      it.classList.toggle('selected', it.dataset.id === ex.id)
    }
    loadStructure(ex.structure, ex.title)
  }

  /** 点群族序号（需求7：C→D→T→O→I→S→Cs→Ci） */
  function familyOrder(symbol) {
    if (symbol === 'Cs') return 6
    if (symbol === 'Ci') return 7
    if (symbol === 'C1' || symbol === 'C∞v') return 0
    if (symbol.startsWith('D')) return 1
    if (symbol.startsWith('T')) return 2
    if (symbol.startsWith('O')) return 3
    if (symbol.startsWith('I')) return 4
    if (symbol.startsWith('S')) return 5
    if (symbol.startsWith('C')) return 0
    return 8
  }

  /** 族内子序：0=纯(单轴/无后缀)，1=含 h，2=含 v/d */
  function subOrder(symbol) {
    if (symbol.endsWith('h')) return 1
    if (symbol.endsWith('v') || symbol.endsWith('d')) return 2
    return 0
  }

  /** 从点群符号提取主阶数（C2v→2、D3d→3、S4→4；C∞ 视为大阶数） */
  function orderNumber(symbol) {
    const m = symbol.match(/^[CSTDIK]\D*(\d+)/)
    if (m) return parseInt(m[1], 10)
    if (symbol.includes('∞')) return 99
    return 0
  }

  /** 示例排序键：点群族序 C→D→T→O→I→S→Cs→Ci，族内按「子序×100 + 阶数」递增 */
  function pointGroupSortKey(symbol) {
    const family = familyOrder(symbol)
    const sub = subOrder(symbol)
    const n = orderNumber(symbol)
    return family * 1000 + sub * 100 + n
  }

  /**
   * 构建示例下拉（两列排布）
   * 分子组按点群族序 C→D→T→O→I→S→Cs→Ci 排序，晶体组置于末尾；
   * 分子同步识别点群；晶体异步分析空间群（WASM），先占位后填充
   */
  async function buildExampleSelect(selectFirst = true) {
    exampleList.innerHTML = ''   // 清空（语言切换重建时避免重复累加）
    // 分子示例按点群族排序，晶体示例放末
    const expOrdered = EXAMPLES.map(ex => {
      const sym = ex.category !== 'crystal' ? identifyPointGroup(ex.structure).symbol : ''
      return { ex, sym, order: pointGroupSortKey(sym) }
    })
    const molecules = expOrdered.filter(e => e.ex.category !== 'crystal')
      .sort((a, b) => a.order - b.order)
    const crystals = expOrdered.filter(e => e.ex.category === 'crystal')

    const renderGroup = (label, list) => {
      const group = document.createElement('div')
      group.className = 'es-group'
      const labelEl = document.createElement('div')
      labelEl.className = 'es-group-label'
      labelEl.textContent = label
      group.appendChild(labelEl)
      exampleList.appendChild(group)
      for (const { ex, sym } of list) {
        const isCrystal = ex.category === 'crystal'
        const item = document.createElement('div')
        item.className = 'es-item'
        item.dataset.id = ex.id
        const symEl = document.createElement('span')
        symEl.className = 'es-sym'
        const nameEl = document.createElement('span')
        nameEl.className = 'es-name'
        nameEl.textContent = exampleDisplay(ex)
        item.append(symEl, nameEl)
        // 点群/空间群符号（晶体走 WASM 异步分析）
        if (isCrystal) {
          symEl.textContent = '…'
          analyzeSpaceGroup(ex.structure)
            .then(r => { symEl.textContent = r.hmSymbol })
            .catch(() => { symEl.textContent = '?' })
        } else {
          symEl.innerHTML = formatGroupSymbol(sym)
        }
        item.title = exampleDisplay(ex)
        item.addEventListener('click', () => {
          exampleList.hidden = true
          exampleCurrent.classList.remove('open')
          // ★ 经壳给定的通路而不是直接 selectExample：用户的操作要能被感知层看见
          //   （主动介入的规则靠交互痕迹触发）。没给通路时就地选中，页面自身仍可用。
          if (typeof deps.onPickExample === 'function') deps.onPickExample(ex.id)
          else selectExample(ex)
        })
        group.appendChild(item)
      }
    }

    renderGroup(t('ex.molecule'), molecules)
    renderGroup(t('ex.crystal'), crystals)

    // 默认选中排序后第一个分子示例（仅首次调用；语言切换重建时不重选）
    if (selectFirst && molecules[0]) selectExample(molecules[0].ex)
  }

  // ==================== 默认显隐策略（需求3） ====================

  /**
   * 计算某点群默认应显示的对称元素 index 集合
   * 规则：有主轴的群默认只显示主轴；Cs 默认显示反映面；Ci 默认显示反演中心；
   *       Sn 群默认显示旋反轴；T/O/I 高阶群无单一主轴，默认显示全部。
   */
  function computeDefaultVisibleIndices(symbol, elements) {
    const p = findPrincipal(elements)
    if (p) return new Set([p.index])
    if (symbol === 'Cs') {
      return new Set(elements.map((el, i) => el.type.startsWith('sigma') ? i : -1).filter(i => i >= 0))
    }
    if (symbol === 'Ci') {
      return new Set(elements.map((el, i) => el.type === 'i' ? i : -1).filter(i => i >= 0))
    }
    if (symbol && symbol.startsWith('S')) {
      return new Set(elements.map((el, i) => el.type.startsWith('S') ? i : -1).filter(i => i >= 0))
    }
    // T/Td/Th/O/Oh/I/Ih 等：无单一主轴，默认显示全部
    return new Set(elements.map((_, i) => i))
  }

  /** 应用默认显隐：返回带 defaultVisible 标记的元素数组 */
  function applyDefaultVisibility(symbol, elements) {
    const set = computeDefaultVisibleIndices(symbol, elements)
    return elements.map((el, i) => ({ ...el, defaultVisible: set.has(i) }))
  }

  /** 播放对称操作教学动画（工作块 D） */
  function playSymmetryAnimation(index) {
    deselectAtom()   // 与原子选中态互斥
    if (!currentMoleculeGroup) return
    const el = currentSymmetryElements[index]
    if (!el) return
    playAnim({ root: viewer.getRoot(), moleculeGroup: currentMoleculeGroup, symmetryGroup: currentSymmetryGroup, auxGroup: currentAuxGroup, element: el })
  }

  // ==================== 原子选中 / 轨道·稳定化子（需求11） ====================

  // 材质虚化状态：记录每个被虚化材质的原始不透明度/透明/深度写标志，便于精确恢复
  const fadeStack = new Map()
  function applyFade(mat, opacity) {
    if (!mat) return
    if (!fadeStack.has(mat)) fadeStack.set(mat, { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite })
    mat.transparent = true
    mat.depthWrite = false     // 透明虚化不写深度：避免虚化物互相遮挡/个别显示异常
    mat.opacity = opacity
    mat.needsUpdate = true     // transparent 从 false→true 需重编译着色器，否则渲染仍按不透明态（"未虚化"根因）
  }
  function clearFades() {
    for (const [mat, base] of fadeStack) {
      mat.opacity = base.opacity
      mat.transparent = base.transparent
      mat.depthWrite = base.depthWrite
      mat.needsUpdate = true
    }
    fadeStack.clear()
  }

  /** 高亮选中原子，虚化其余原子/化学键/对称元素/辅助几何/标签 */
  /** 高亮选中原子，正常显示其轨道成员，虚化其余原子/键/对称元素/标签 */
  function setAtomHighlight(index, orbSet, stabIndexSet) {
    clearFades()
    const orb = new Set(orbSet || [])
    for (const mesh of currentAtomMeshes) {
      const ai = mesh.userData.atomIndex
      if (ai === index) {
        mesh.scale.setScalar(mesh.userData.baseScale * 1.3)
        mesh.renderOrder = 2   // 选中球最前
      } else if (orb.has(ai)) {
        mesh.scale.setScalar(mesh.userData.baseScale)
        mesh.renderOrder = 1   // 轨道成员（等价原子）正常显示，不虚化
      } else {
        mesh.scale.setScalar(mesh.userData.baseScale)
        applyFade(mesh.material, 0.15)
        mesh.renderOrder = 1
      }
    }
    // 键：两端均在轨道内的保持正常，其余虚化
    for (const b of currentBondMeshes) {
      const pair = b.userData.atomPair
      const orbBond = pair && orb.has(pair[0]) && orb.has(pair[1])
      if (!orbBond) applyFade(b.material, 0.1)
      b.renderOrder = 0
    }
    const stabIdx = stabIndexSet || new Set()
    for (let i = 0; i < currentSymmetryItems.length; i++) {
      if (stabIdx.has(i)) continue   // 稳定化子对应的对称元素保持显示
      currentSymmetryItems[i].mesh.traverse(o => { if (o.material) applyFade(o.material, 0.12) })
    }
    if (currentAuxGroup) currentAuxGroup.traverse(o => { if (o.material) applyFade(o.material, 0.15) })
    // 标签：选中原子与轨道成员的标签保持，其余虚化
    if (currentMoleculeGroup) {
      currentMoleculeGroup.traverse(o => {
        if (o.userData && o.userData.atomLabel && !orb.has(o.userData.atomIndex)) applyFade(o.material, 0.12)
      })
    }
  }

  /** 清除选中态：恢复缩放/材质/渲染顺序 */
  function clearAtomHighlight() {
    clearFades()
    for (const mesh of currentAtomMeshes) { mesh.scale.setScalar(mesh.userData.baseScale); mesh.renderOrder = 0 }
    for (const b of currentBondMeshes) b.renderOrder = 0
  }

  /** 原子序号（该原子是第几个同元素原子，1-based），用于标注 O1/O2… */
  function atomOrdinal(atoms, index) {
    let c = 0
    for (let i = 0; i <= index; i++) if (atoms[i].element === atoms[index].element) c++
    return c
  }

  /** 填充信息面板的轨道 / 稳定化子区（仅分子结构） */
  function fillOrbitInfo(atoms, index, orb, stab) {
    const wrap = document.getElementById('orbit-wrap')
    const body = document.getElementById('orbit-body')
    if (!wrap || !body || !atoms) return
    const lab = i => `${atoms[i].element}(${atomOrdinal(atoms, i)})`
    body.innerHTML =
      `<div class="orb-row"><span class="orb-label">${t('orb.orbit')}</span><span>${orb.map(lab).join(', ')}</span></div>` +
      `<div class="orb-row"><span class="orb-label">${t('orb.stabilizer')}（${t('orb.order')} ${stab.length}）</span><span>${stab.join(', ')}</span></div>`
    wrap.hidden = false
  }

  /** 选中原子（与动画互斥）：高亮 + 正常显示轨道成员与稳定化子对称元素 + 面板填充 */
  function selectAtom(index) {
    stopAnimation()
    currentSelectedAtom = index
    const atoms = currentStructure && currentStructure.atoms
    if (!currentStructure || currentStructure.kind !== 'molecule' || !atoms) return
    const ops = generateGroupOperations(atoms, currentSymmetryElements, 0.15)
    const orb = orbit(atoms, ops, index, 0.15)
    const stab = stabilizer(atoms, ops, index, currentSymmetryElements, 0.15)
    setAtomHighlight(index, orb, stab.indexSet)
    fillOrbitInfo(atoms, index, orb, stab.names)
  }

  // 每帧校正 σ 反映面标签朝向：位置不变（面内角），但朝向按观察者自适应（翻转/镜像，保持正读）
  const _labelQ = new THREE.Quaternion()
  const _labelM = new THREE.Matrix4()
  function updateSigmaLabelOrientation() {
    const basis = viewer.getViewBasis()
    for (const item of currentSymmetryItems) {
      const lm = item.labelSprite
      if (!lm || !lm.userData || !lm.userData.inPlane) continue
      const ud = lm.userData
      lm.parent.getWorldQuaternion(_labelQ)
      const vw = ud.v.clone().applyQuaternion(_labelQ)
      const nw = ud.n.clone().applyQuaternion(_labelQ)
      const flip = vw.dot(basis.up) < 0          // 文字倒 → 绕法向翻转 180
      const mirror = nw.dot(basis.look) < 0      // 面背面朝用户 → 水平镜像
      const u = ud.u.clone(), v = ud.v.clone()
      if (flip) { u.multiplyScalar(-1); v.multiplyScalar(-1) }
      lm.quaternion.setFromRotationMatrix(_labelM.makeBasis(u, v, ud.n))
      lm.scale.x = mirror ? -1 : 1
    }
  }

  /** 取消选中 */
  function deselectAtom() {
    clearAtomHighlight()
    currentSelectedAtom = null
    const wrap = document.getElementById('orbit-wrap')
    if (wrap) wrap.hidden = true
  }

  /** 切换原子名称标签可见性（不重建场景） */
  function setAtomLabelsVisible(v) {
    if (!currentMoleculeGroup) return
    currentMoleculeGroup.traverse(o => {
      if (o.userData && o.userData.atomLabel) o.visible = v
    })
  }

  // ==================== 核心加载逻辑 ====================

  /**
   * 构建结构的辅助几何（参考线框），无 aux 声明或类型未知时返回 null
   * @param {Object} structure - 分子结构
   * @returns {THREE.Group|null}
   */
  function buildAux(structure) {
    if (!structure.aux) return null
    const aux = structure.aux
    if (aux.type === 'cube') {
      // 辅助立方体：碳在中心、氢在 4 个顶点，便于观察 Td 对称元素
      return buildAuxCube(aux.halfSize, { atoms: structure.atoms })
    }
    if (aux.type === 'dihedral') {
      // 二面角双矩形：两个矩形各含一个端基键，共用中心键轴，夹角即二面角
      return buildAuxDihedral(structure.atoms, aux.indices)
    }
    return null
  }

  /**
   * 加载并展示一个结构（分子或晶体）
   */
  async function loadStructure(structure, title, options = {}) {
    stopAnimation()   // 切换结构时清除正在播放的对称操作动画/ghost
    deselectAtom()    // 清除旧结构的原子选中态
    const { preserveView = false } = options
    currentStructure = structure
    currentTitle = title

    const root = new THREE.Group()
    const atomScale = getAppearance('atomScale')
    const symmetryScale = getAppearance('symmetryScale')
    let radius = 3
    let symmetryElements = []
    let info = {}

    if (structure.kind === 'molecule') {
      const { group, radius: r } = buildMoleculeScene(structure, { modelType: 'ballStick', atomScale })
      root.add(group)
      currentMoleculeGroup = group
      // 收集原子/键 mesh（供选中态 VIRTUAL/虚化）
      currentAtomMeshes = []
      currentBondMeshes = []
      group.traverse(o => {
        if (o.isMesh) {
          if (o.userData && o.userData.atomIndex !== undefined) currentAtomMeshes.push(o)
          else if (o.userData && o.userData.bond) currentBondMeshes.push(o)
        }
      })
      setAtomLabelsVisible(currentState().showAtomLabels)
      radius = r

      const result = identifyPointGroup(structure)
      // 专业命名（σh/σv/σd、C2′/C2″、C2v 坐标、D2h 坐标、高阶群 σh/σd）+ 同共轭类序号
      const namedElems = refineSymmetryElements(result.symbol, result.elements, structure.atoms, computeCentroid(structure.atoms))
      symmetryElements = applyDefaultVisibility(result.symbol, namedElems)
      info = {
        title: structureTitle(structure) || title || structure.title || '分子',
        formula: structureFormula(structure),
        groupSymbol: result.symbol,
        groupName: i18nGroupName(result.symbol),
        meta: '',
        elements: symmetryElements,
        characterTable: getCharacterTable(result.symbol)
      }
      console.log(`[对称视界] ${info.title} → ${result.symbol}（${result.name}）`)
    } else {
      const { group, radius: r } = buildCrystalScene(structure, { atomScale })
      root.add(group)
      currentMoleculeGroup = null   // 晶体对称操作动画/原子拾取暂不启用
      currentAtomMeshes = []
      currentBondMeshes = []
      currentSelectedAtom = null
      radius = r

      const result = await analyzeSpaceGroup(structure)
      symmetryElements = operationsToSymmetryElements(result.operations)
      info = {
        title: structureTitle(structure) || title || structure.title || '晶体',
        formula: structureFormula(structure),
        groupSymbol: result.hmSymbol,
        groupName: `${result.number} 号空间群`,
        meta: `晶系 ${result.crystalSystem} · 点群 ${result.pointGroup}${result.pearsonSymbol ? ' · ' + result.pearsonSymbol : ''}`,
        elements: symmetryElements,
        characterTable: getCharacterTable(result.pointGroup)
      }
      console.log(`[对称视界] ${info.title} → ${result.hmSymbol}（${result.number} 号，${result.pointGroup}）`)
    }

    // 对称元素（每个元素独立 Group，支持独立显隐 + 标签）
    currentSymmetryElements = symmetryElements
    const labelFontSize = getAppearance('labelFontSize')
    // 标签记法固定不加撇（labelMode 默认 'plain'，不再读取 localStorage 旧值）
    const symResult = buildSymmetryElements(symmetryElements, radius,
      { symmetryScale, showLabels: currentState().showLabels, labelFontSize })
    currentSymmetryGroup = symResult.group
    currentSymmetryItems = symResult.items
    // 各元素的初始可见性由 `renderFromState` 统一设置（模块的隐藏集是真源，
    // 它已经按默认显隐策略初始化过）。这里**不再各算一次**——两边各算必然有一天分叉。
    root.add(currentSymmetryGroup)

    // 辅助几何（固定"辅助几何"开关，仅结构声明 aux 时构建）
    const auxToggle = document.getElementById('aux-toggle')
    const hasAux = !!(structure.aux && structure.kind === 'molecule')
    auxToggle.disabled = !hasAux
    auxToggle.parentElement.classList.toggle('disabled', !hasAux)
    if (hasAux) {
      currentAuxGroup = buildAux(structure)
      currentAuxGroup.visible = currentState().showAux
      auxToggle.checked = currentState().showAux
      root.add(currentAuxGroup)
    } else {
      currentAuxGroup = null
      auxToggle.checked = false
    }

    // 初始视角对齐方向：分子取主轴（无主轴则取对称面法向），使主轴垂直屏幕 / 对称面平行屏幕
    let alignDir = null
    if (structure.kind === 'molecule') {
      const p = findPrincipal(symmetryElements)
      if (p && p.el.axis) alignDir = p.el.axis
      else {
        const sig = symmetryElements.find(el => el.type.startsWith('sigma') && el.axis)
        if (sig) alignDir = sig.axis
      }
    }

    viewer.setContent(root, radius, { preserveView })
    if (!preserveView) viewer.alignToView(alignDir)
    renderInfo(info, {
      // ★ 人点勾选也**走动作通路**（与模型同源）：页面只发动作，由 renderFromState 落到画面。
      //   这样"模型改了状态、面板勾选没跟上"这类不同步在结构上不可能发生。
      onToggle: (index, visible) => {
        const it = currentSymmetryItems[index]
        if (!it || !it.key) return
        dispatchDisplay('setElementVisible', { key: it.key, visible }, null)
      },
      onPlay: (index) => {
        const it = currentSymmetryItems[index]
        if (!it || !it.key) return
        dispatchDisplay('playOperation', { key: it.key }, null)
      },
    })
    // ★ 场景刚重建（元素对象是新的），必须把模块状态**再应用一次**：
    //   否则"隐藏了某些元素"在换分子之后就丢了——画面比状态"多显示"了东西。
    renderFromState(currentState())
    // 设置面板若正打开，切换结构后也动态刷新其内容（无需重新打开设置）
    const settingsPanel = document.getElementById('settings-panel')
    if (settingsPanel && !settingsPanel.hidden) openSettings()
  }

  // ==================== UI 事件绑定 ====================

  // 导入结构文件功能已注释（高校教学应用）：解析器保留供后续复用

  // ==================== 显示状态：模块是真源，页面是它的渲染视图 ====================

  /**
   * **唯一**把显示状态落到画面的地方。
   *
   * ★ 为什么只留一个入口：状态有**两个**来源（人点复选框、模型下发动作），
   *   如果各写一条"改画面"的路径，两边迟早不一致——而那种不一致
   *   表现为"界面显示开、画面是关"（或反之），**不报错**。
   *   现在人那条路也走 `dispatchDisplay` → 门面 → 订阅回调 → 这里，
   *   与模型完全同源。
   */
  function renderFromState(snap) {
    if (!snap) return
    const showSym = snap.showSymmetry !== false
    const showLb = !!snap.showLabels
    const showAx = !!snap.showAux
    const showAtomLb = !!snap.showAtomLabels
    const hidden = new Set(String(snap.hiddenElements || '').split(',').filter(Boolean))

    if (currentSymmetryGroup) currentSymmetryGroup.visible = showSym
    for (const item of currentSymmetryItems) {
      // 标签精灵：只切显隐，不重建场景（重建会重置视角/缩放）
      if (item.labelSprite) item.labelSprite.visible = showLb
      // 逐个显隐：key 由模块发布（与它给模型的那份是同一套规则）
      if (item.mesh && item.key) item.mesh.visible = showSym && !hidden.has(item.key)
    }
    if (currentAuxGroup) currentAuxGroup.visible = showAx
    setAtomLabelsVisible(showAtomLb)

    // 复选框回填——人看到的勾选状态跟着真源走（模型改了也会跟着变）
    const sync = (id, v) => { const el = document.getElementById(id); if (el && el.checked !== v) el.checked = v }
    sync('symmetry-toggle', showSym)
    sync('labels-toggle', showLb)
    sync('aux-toggle', showAx)
    sync('atom-label-toggle', showAtomLb)

    // 播放：**只有 token 变了才真的播**。同一个操作连点两次时 playingKey 不变，
    // 没有 token 就会出现"第二次点了没反应"。
    if (typeof snap.playToken === 'number' && snap.playToken !== lastPlayToken) {
      lastPlayToken = snap.playToken
      if (snap.playingKey) {
        const i = currentSymmetryItems.findIndex((it) => it.key === snap.playingKey)
        if (i >= 0) playSymmetryAnimation(i)
      } else {
        stopAnimation()
      }
    }

    // 原子选中：key 形如 atom#N（由模块发布，见 facade 的 listAtoms）。
    // 只在**真的变了**时才动，避免每帧重复算轨道/稳定化子（那一步不便宜）。
    const wantAtom = snap.selectedAtomKey
      ? Number(String(snap.selectedAtomKey).replace('atom#', ''))
      : null
    const wantIdx = Number.isFinite(wantAtom) ? wantAtom : null
    if (wantIdx !== currentSelectedAtom) {
      if (wantIdx === null) deselectAtom()
      else selectAtom(wantIdx)
    }
  }

  /** 本地状态下的动作执行（只在没有门面时走这条路） */
  function applyLocal(name, p) {
    switch (name) {
      case 'setSymmetryVisible': localState.showSymmetry = p.visible; return
      case 'setLabelsVisible': localState.showLabels = p.visible; return
      case 'setAuxVisible': localState.showAux = p.visible; return
      case 'setAtomLabelsVisible': localState.showAtomLabels = p.visible; return
      default: /* 其余动作独立页不支持 */ return
    }
  }

  /**
   * 下发一个显示动作。
   * ★ 有门面时**必须经门面**——这样"人操作"与"模型操作"走同一条通路，
   *   感知层看得见（主动介入的规则靠交互痕迹触发），而且状态只有一个真源。
   * ★ 门面拒绝时把复选框**回滚**：不能让界面显示出"已经改了"的假象。
   *
   * @returns {boolean} 是否被受理
   */
  function dispatchDisplay(action, params, checkboxEl) {
    if (facade) {
      let r = null
      try { r = facade.applyActions([{ action, params }]) } catch (e) { r = null }
      if (!r || r.ok === false) {
        if (checkboxEl) checkboxEl.checked = !checkboxEl.checked
        return false
      }
      return true                       // 门面会经 subscribe 回调 → renderFromState
    }
    applyLocal(action, params)          // 独立页：就地生效
    renderFromState(localState)
    return true
  }

  document.getElementById('symmetry-toggle').addEventListener('change', (e) => {
    dispatchDisplay('setSymmetryVisible', { visible: e.target.checked }, e.target)
  })
  document.getElementById('labels-toggle').addEventListener('change', (e) => {
    dispatchDisplay('setLabelsVisible', { visible: e.target.checked }, e.target)
  })
  document.getElementById('aux-toggle').addEventListener('change', (e) => {
    dispatchDisplay('setAuxVisible', { visible: e.target.checked }, e.target)
  })
  document.getElementById('atom-label-toggle').addEventListener('change', (e) => {
    dispatchDisplay('setAtomLabelsVisible', { visible: e.target.checked }, e.target)
  })

  // ==================== 设置面板 ====================

  /** 对称元素类型 → 视觉颜色键（settings.js 存储键） */
  const TYPE_COLOR_KEY = {
    'C2': 'axisC2', 'C3': 'axisC3', 'C4': 'axisC4', 'C5': 'axisC5', 'C6': 'axisC6',
    'S3': 'axisS3', 'S4': 'axisS4', 'S5': 'axisS5', 'S6': 'axisS6', 'S8': 'axisS8', 'S10': 'axisS10', 'S∞': 'axisSInf',
    'C∞': 'axisCInf',
    'sigma': 'sigma', 'sigma_v': 'sigmaV', 'sigma_d': 'sigmaD', 'sigma_h': 'sigmaH',
    'i': 'inversionColor'
  }

  /** 收集当前结构识别出的对称元素类型及其数量（仅分子结构） */
  function collectSymmetryTypes(structure) {
    if (!structure || structure.kind !== 'molecule') return []
    const res = identifyPointGroup(structure)
    const countByType = {}
    for (const el of res.elements) {
      if (el.type === 'E') continue   // 恒等元素无空间几何，不参与颜色设置
      countByType[el.type] = (countByType[el.type] || 0) + 1
    }
    return Object.keys(countByType).map(type => ({ type, count: countByType[type] }))
  }

  /** 生成对称元素颜色设置项（按当前结构实际存在的对称元素动态显示） */
  function buildColorSettings() {
    const wrap = document.getElementById('set-symmetry-colors')
    wrap.innerHTML = ''
    const types = collectSymmetryTypes(currentStructure)
    if (types.length === 0) {
      wrap.innerHTML = '<div style="font-size:12px;color:#9aa3b5">' + t('set.emptyHint') + '</div>'
      return
    }
    // 按点群判断规则排序（主轴在前）
    const principalType = findPrincipal(identifyPointGroup(currentStructure).elements)?.el.type || null
    types.sort((a, b) => typeRank(a.type, 0, a.type === principalType) - typeRank(b.type, 0, b.type === principalType))
    for (const { type, count } of types) {
      const key = TYPE_COLOR_KEY[type] || type
      const label = getElementClassName(type, count)
      const row = document.createElement('div')
      row.className = 'color-row'
      const lab = document.createElement('label')
      lab.textContent = label
      const input = document.createElement('input')
      input.type = 'color'
      input.value = getVisualColor(key)
      input.addEventListener('input', () => {
        setVisualColor(key, input.value)
        if (currentStructure) loadStructure(currentStructure, currentTitle, { preserveView: true })
      })
      row.appendChild(lab)
      row.appendChild(input)
      wrap.appendChild(row)
    }
  }

  /** 生成元素颜色设置项（当前结构涉及的元素） */
  function buildElementColorSettings() {
    const wrap = document.getElementById('set-element-colors')
    wrap.innerHTML = ''
    const elements = currentStructure ? getUniqueElements(currentStructure) : []
    if (elements.length === 0) {
      wrap.innerHTML = '<div style="font-size:12px;color:#9aa3b5">' + t('set.emptyHint') + '</div>'
      return
    }
    for (const elem of elements) {
      const row = document.createElement('div')
      row.className = 'color-row'
      const lab = document.createElement('label')
      lab.textContent = elem
      const input = document.createElement('input')
      input.type = 'color'
      input.value = getElementColor(elem)
      input.addEventListener('input', () => {
        setElementColor(elem, input.value)
        if (currentStructure) loadStructure(currentStructure, currentTitle, { preserveView: true })
      })
      row.appendChild(lab)
      row.appendChild(input)
      wrap.appendChild(row)
    }
  }

  /** 打开设置面板并填充当前值 */
  function openSettings() {
    document.getElementById('set-bg').value = getVisualColor('bgColor')
    document.getElementById('set-atom-scale').value = getAppearance('atomScale')
    document.getElementById('set-scale-val').textContent = getAppearance('atomScale').toFixed(1)
    document.getElementById('set-stick-radius').value = getAppearance('stickRadius')
    document.getElementById('set-stick-val').textContent = getAppearance('stickRadius').toFixed(2)
    document.getElementById('set-symmetry-scale').value = getAppearance('symmetryScale')
    document.getElementById('set-sym-scale-val').textContent = getAppearance('symmetryScale').toFixed(1)
    document.getElementById('set-label-font-size').value = getAppearance('labelFontSize')
    document.getElementById('set-label-font-val').textContent = getAppearance('labelFontSize')
    document.getElementById('set-lang').value = i18n.lang
    document.getElementById('set-anim-speed').value = getAppearance('animAngularSpeed')
    document.getElementById('set-anim-speed-val').textContent = getAppearance('animAngularSpeed')
    document.getElementById('set-anim-duration').value = getAppearance('animDuration')
    document.getElementById('set-anim-dur-val').textContent = getAppearance('animDuration')
    buildElementColorSettings()
    buildColorSettings()
    document.getElementById('settings-panel').hidden = false
  }

  document.getElementById('settings-btn').addEventListener('click', () => {
    const panel = document.getElementById('settings-panel')
    if (panel.hidden) openSettings()
    else panel.hidden = true
  })

  document.getElementById('settings-close').addEventListener('click', () => {
    document.getElementById('settings-panel').hidden = true
  })

  document.getElementById('set-bg').addEventListener('input', (e) => {
    setVisualColor('bgColor', e.target.value)
    // ★ 记下"用户**显式**挑过背景色"这个事实：从此不再跟随界面主题。
    //   不记的话，主题一换就把用户挑的颜色覆盖掉——而"我们按主题写的值"
    //   与"用户挑的值"长得一模一样，事后分不出来。
    markUserOverride('bgColor')
    viewer.setBackground(e.target.value)
  })

  document.getElementById('set-atom-scale').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value)
    setAppearance('atomScale', val)
    document.getElementById('set-scale-val').textContent = val.toFixed(1)
    if (currentStructure) loadStructure(currentStructure, currentTitle, { preserveView: true })
  })

  document.getElementById('set-stick-radius').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value)
    setAppearance('stickRadius', val)
    document.getElementById('set-stick-val').textContent = val.toFixed(2)
    if (currentStructure) loadStructure(currentStructure, currentTitle, { preserveView: true })
  })

  document.getElementById('set-symmetry-scale').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value)
    setAppearance('symmetryScale', val)
    document.getElementById('set-sym-scale-val').textContent = val.toFixed(1)
    if (currentStructure) loadStructure(currentStructure, currentTitle, { preserveView: true })
  })

  document.getElementById('set-label-font-size').addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10)
    setAppearance('labelFontSize', val)
    document.getElementById('set-label-font-val').textContent = val
    if (currentStructure) loadStructure(currentStructure, currentTitle, { preserveView: true })
  })

  document.getElementById('set-reset').addEventListener('click', () => {
    resetSettings()
    if (currentStructure) loadStructure(currentStructure, currentTitle, { preserveView: true })
    openSettings()
  })

  document.getElementById('set-lang').addEventListener('change', (e) => {
    i18n.setLang(e.target.value)   // 派发 langchange → 全局重渲染
  })

  document.getElementById('set-anim-speed').addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10)
    setAppearance('animAngularSpeed', val)
    document.getElementById('set-anim-speed-val').textContent = val
  })

  document.getElementById('set-anim-duration').addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10)
    setAppearance('animDuration', val)
    document.getElementById('set-anim-dur-val').textContent = val
  })

  // ==================== 初始化（静态文案 + 事件 + 语言监听 + 构建下拉） ====================
  applyStaticI18n()
  // 原子拾取：单击选中/取消选中
  viewer.setAtomTapHandler((x, y) => {
    const idx = viewer.pickAtom(x, y)
    // ★ 用户点选也**走动作通路**（与模型同源）：页面只发动作，
    //   由 renderFromState 落到画面。否则模型与用户各存一份选中态，必然分叉。
    const key = idx === null ? null : `atom#${idx}`
    if (!dispatchDisplay('selectAtom', { key }, null)) {
      // 门面拒了（例如没有门面时的独立页）→ 就地生效，保证页面可用是底线
      if (idx !== null) selectAtom(idx); else deselectAtom()
    }
  })
  viewer.setFrameHook(updateSigmaLabelOrientation)
  exampleCurrent.addEventListener('click', (e) => {
    e.stopPropagation()
    exampleList.hidden = !exampleList.hidden
    exampleCurrent.classList.toggle('open', !exampleList.hidden)
  })
  document.addEventListener('click', () => {
    exampleList.hidden = true
    exampleCurrent.classList.remove('open')
  })
  window.addEventListener('langchange', () => {
    applyStaticI18n()
    buildExampleSelect(false)
    const curId = exampleCurrent.dataset.id
    exampleList.querySelectorAll('.es-item').forEach(it => {
      it.classList.toggle('selected', it.dataset.id === curId)
    })
    const sel = EXAMPLES.find(e => e.id === curId)
    if (sel) {
      let html = exampleDisplay(sel)
      if (sel.category !== 'crystal') {
        const sym = identifyPointGroup(sel.structure).symbol
        html += `&nbsp;<span class="es-cur-sym">${formatGroupSymbol(sym)}</span>`
      }
      exampleCurrent.innerHTML = html
    }
    if (currentStructure) loadStructure(currentStructure, currentTitle, { preserveView: true })
  })
  buildExampleSelect()

  // ==================== 画布底色跟随界面主题 ====================
  /**
   * ★ 语义：**用户没表达过偏好就跟随主题，表达过就一直接尊重**。
   *   难点不在"跟随"，而在"改过没有"——我们按主题写进去的值和用户挑的值
   *   长得一模一样，事后分不出来。所以让设置模块把"用户改过"记成一个**事实**
   *   （`isUserOverridden`），而不是每次去猜。
   *
   * ★ 与晶体模块的分工差别：晶体的背景色是**模块设置**（走宿主弹层），
   *   所以那段跟随逻辑在 main.js；而对称性的设置面板**在页面内部**，
   *   于是跟随也归页面——**谁持有控件谁负责**，免得两处各写一份。
   */
  const THEME_BG = { light: '#ffffff', dark: '#0b1020' }
  function applyThemeBg(resolved) {
    if (isUserOverridden('bgColor')) return
    const want = THEME_BG[resolved] || THEME_BG.light
    if (getVisualColor('bgColor') === want) return
    setVisualColor('bgColor', want)
    if (viewer) viewer.setBackground(want)
    const el = document.getElementById('set-bg')
    if (el) el.value = want
  }
  applyThemeBg(resolvedTheme())
  const offTheme = onThemeChange((_t, resolved) => applyThemeBg(resolved))

  // ---- 交给壳的接口 ----
  api = {
    /** 按 id 载入示例（门面状态变化时壳会调它） */
    loadExampleById(id) {
      const ex = EXAMPLES.find((e) => e.id === id)
      if (ex) selectExample(ex)
    },
    /** 当前示例 id（用于与门面对账，避免两边各说各话） */
    currentExampleId: () => currentExampleId,
    /**
     * 按模块状态渲染（壳在**每次**门面变化时调它）。
     * ★ 加它就是为了让"模型改了状态、画面没跟上"不可能发生：
     *   页面不再自己存显示状态，一切以快照为准。
     */
    renderFromState,
    /** 供壳判断"页面是否已渲染过某次播放"（调试与断言用，不参与渲染） */
    lastPlayToken: () => lastPlayToken,
    /** 释放三维资源 */
    dispose() {
      // ★ 取消主题订阅：不取消的话，页面卸载后主题一变仍会调进来，
      //   而那时 viewer 已是 null——本文件记过"事件不解绑"这一类泄漏。
      try { offTheme() } catch (e) { /* 已取消 */ }
      try { stopAnimation() } catch (e) { /* 没有在播的动画 */ }
      try { if (viewer) viewer.dispose() } catch (e) { /* 已释放 */ }
      viewer = null
    },
  }
  return api
}

// ---------------------------------------------------------------------------
// 壳里的一页
// ---------------------------------------------------------------------------
/**
 * 分子对称性的页面。
 *
 * ★ 它只做三件事：注入结构与样式、把 `bootSymmetryPage` 拉起来、在页面与门面之间
 *   **双向对齐**。所有学科逻辑都在上游移植过来的那 800 行里，本类不掺和。
 *
 * ★ 双向对齐为什么要防回声：用户点示例 → 通知门面 → 门面通知订阅者 → 若不做
 *   同值判断就又载入一次，而每次载入都会重建整个三维场景。表现为"点一下卡两下"，
 *   而且**不报错**——只是慢。故订阅回调里先比对"页面已是哪个分子"。
 */
export class SymmetryPage {
  /**
   * @param {Object} ctx
   * @param {Object} ctx.module 由 symmetry 的 createModule() 给出的模块包（含 facade）
   */
  constructor(ctx = {}) {
    this._module = ctx.module || null
    this._facade = (ctx.module && ctx.module.facade) || null
    this._container = null
    this._api = null
    this._off = null
  }

  mount(container) {
    this._container = container
    // 样式与结构一起注入。`<style>` 放在容器里是合法的，且 `.sym-page` 自带作用域，
    // 不会外泄到壳的其它页面。
    container.innerHTML = '<style>' + SYMMETRY_CSS + '</style>' + SYMMETRY_HTML

    this._api = bootSymmetryPage({
      // ★ 把门面交给页面：显示状态的**真源在模块里**，页面只是它的渲染视图
      facade: this._facade,
      /**
       * 用户在示例列表里点了某个分子。
       * ★ 经门面而不是直接载入：这样**用户的操作与智能体的操作走同一条通路**，
       *   感知层看得见（主动介入的规则靠交互痕迹触发）。
       * ★ 门面拒绝时（id 不在取值域、或模块未激活）就地载入，页面不因此卡死——
       *   页面自身可用是底线，集成只是加分项。
       */
      onPickExample: (id) => {
        if (this._facade) {
          try {
            const r = this._facade.applyActions([{ action: 'loadExample', params: { id } }])
            if (!r || r.ok !== false) return   // 门面会回调订阅者去真正载入
          } catch (e) { /* 落回就地载入 */ }
        }
        if (this._api) this._api.loadExampleById(id)
      },
    })

    // 智能体改状态 → 页面跟着改。
    // ★ 两件事合在一个订阅里：① 换分子（同值跳过，防回声）② 按显示状态渲染。
    //   原先这里只处理①——于是模型改了"显示/隐藏对称元素"这一类状态时，
    //   页面**完全不知道**：门面变了、画面纹丝不动，而且不报错。
    if (this._facade && typeof this._facade.subscribe === 'function') {
      this._off = this._facade.subscribe((snap) => {
        const want = typeof this._facade.currentId === 'function' ? this._facade.currentId() : null
        if (want && this._api && this._api.currentExampleId() !== want) {
          this._api.loadExampleById(want)
        }
        // 渲染显示状态（`loadExampleById` 内部会重建场景，因此放在它之后）
        if (this._api && typeof this._api.renderFromState === 'function') {
          this._api.renderFromState(snap || this._facade.getSnapshot())
        }
      })
    }

    // 让门面与页面**从第一帧起就对齐**：页面默认选中哪个分子是由"点群族排序"
    // 决定的（教学顺序），未必等于门面的初始 id。不对齐的话，模型第一轮看到的
    // 状态就是错的，它会让页面"切到水"，而学生明明看的是别的分子。
    const id = this._api && this._api.currentExampleId()
    if (id && this._facade) {
      try { this._facade.applyActions([{ action: 'loadExample', params: { id } }]) } catch (e) { /* 忽略 */ }
    }
  }

  unmount() {
    if (this._off) { try { this._off() } catch (e) { /* 忽略 */ } this._off = null }
    if (this._api && typeof this._api.dispose === 'function') {
      try { this._api.dispose() } catch (e) { /* 忽略 */ }
    }
    this._api = null
    if (this._container) this._container.innerHTML = ''
    this._container = null
  }
}

export default SymmetryPage
