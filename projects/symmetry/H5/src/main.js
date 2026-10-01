/**
 * 应用入口
 * 统一加载分子/晶体结构 → 识别对称性 → 构建场景 + 对称元素 → 展示 + 信息面板 + 设置 + 精确变换
 */
import * as THREE from 'three'
import { inject } from '@vercel/analytics'
import { SymmetryViewer } from './render/viewer.js'
import { playSymmetryAnimation as playAnim, stopAnimation } from './render/animation.js'
import { buildMoleculeScene, buildCrystalScene, buildAuxCube, buildAuxDihedral, computeCentroid } from './render/scene-builder.js'
import { buildSymmetryElements } from './render/symmetry-draw.js'
import { identifyPointGroup } from './symmetry/pointGroup.js'
import { analyzeSpaceGroup, operationsToSymmetryElements } from './symmetry/spaceGroup.js'
import { getCharacterTable } from './symmetry/characterTables.js'
import { getUniqueElements } from './core/structure.js'
import { EXAMPLES } from './data/examples-index.js'
// 导入结构文件功能已注释（高校教学应用）：解析器保留供后续复用
// import { parseStructure } from './core/parsers/index.js'
import { renderInfo } from './ui/info.js'
import { getElementClassName, typeRank, findPrincipal, refineSymmetryElements } from './symmetry/elementNaming.js'
import { t, i18n, groupName as i18nGroupName, applyStaticI18n, formatGroupSymbol, formatFormulaU } from './i18n/index.js'
import { generateGroupOperations, orbit, stabilizer } from './symmetry/groupOperations.js'
import {
  getVisualColor, setVisualColor,
  getAppearance, setAppearance,
  getElementColor, setElementColor,
  resetSettings
} from './data/settings.js'

inject()

const container = document.getElementById('viewer-container')
const viewer = new SymmetryViewer(container)

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
let showSymmetry = true
let showLabels = false
let showAux = false
let showAtomLabels = false

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
        selectExample(ex)
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
    setAtomLabelsVisible(showAtomLabels)
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
    console.log(`[点群观鉴] ${info.title} → ${result.symbol}（${result.name}）`)
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
    console.log(`[点群观鉴] ${info.title} → ${result.hmSymbol}（${result.number} 号，${result.pointGroup}）`)
  }

  // 对称元素（每个元素独立 Group，支持独立显隐 + 标签）
  currentSymmetryElements = symmetryElements
  const labelFontSize = getAppearance('labelFontSize')
  // 标签记法固定不加撇（labelMode 默认 'plain'，不再读取 localStorage 旧值）
  const symResult = buildSymmetryElements(symmetryElements, radius, { symmetryScale, showLabels, labelFontSize })
  currentSymmetryGroup = symResult.group
  currentSymmetryItems = symResult.items
  // 按默认显隐策略设置各元素初始可见性（用户可勾选重新显示）
  for (let i = 0; i < currentSymmetryItems.length; i++) {
    const defVisible = symmetryElements[i]?.defaultVisible ?? true
    currentSymmetryItems[i].mesh.visible = showSymmetry && defVisible
  }
  root.add(currentSymmetryGroup)

  // 辅助几何（固定"辅助几何"开关，仅结构声明 aux 时构建）
  const auxToggle = document.getElementById('aux-toggle')
  const hasAux = !!(structure.aux && structure.kind === 'molecule')
  auxToggle.disabled = !hasAux
  auxToggle.parentElement.classList.toggle('disabled', !hasAux)
  if (hasAux) {
    currentAuxGroup = buildAux(structure)
    currentAuxGroup.visible = showAux
    auxToggle.checked = showAux
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
    onToggle: (index, visible) => {
      if (currentSymmetryItems[index]) currentSymmetryItems[index].mesh.visible = visible
    },
    onPlay: (index) => playSymmetryAnimation(index)
  })
  // 设置面板若正打开，切换结构后也动态刷新其内容（无需重新打开设置）
  const settingsPanel = document.getElementById('settings-panel')
  if (settingsPanel && !settingsPanel.hidden) openSettings()
}

// ==================== UI 事件绑定 ====================

// 导入结构文件功能已注释（高校教学应用）：解析器保留供后续复用

document.getElementById('symmetry-toggle').addEventListener('change', (e) => {
  showSymmetry = e.target.checked
  if (currentSymmetryGroup) currentSymmetryGroup.visible = showSymmetry
})

document.getElementById('labels-toggle').addEventListener('change', (e) => {
  showLabels = e.target.checked
  // 只切换标签精灵显隐，不重建场景（避免重置视角/缩放）
  for (const item of currentSymmetryItems) {
    if (item.labelSprite) item.labelSprite.visible = showLabels
  }
})

document.getElementById('aux-toggle').addEventListener('change', (e) => {
  showAux = e.target.checked
  // 只切换辅助几何显隐，不重建场景（避免重置视角/缩放）
  if (currentAuxGroup) currentAuxGroup.visible = showAux
})

document.getElementById('atom-label-toggle').addEventListener('change', (e) => {
  showAtomLabels = e.target.checked
  setAtomLabelsVisible(showAtomLabels)
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
  if (idx !== null) selectAtom(idx)
  else deselectAtom()
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
