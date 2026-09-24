/**
 * 国际化模块（小程序版，中英双语）
 * 由 H5 移植：localStorage → wx 存储；window.CustomEvent → bus.emit('langchange')；
 * 删除 applyStaticI18n（DOM 遍历），由各页把 t(key) 写入 data 做 WXML 绑定。
 */
import { POINT_GROUP_NAMES } from './symmetry/groupTable.js'
import { bus } from './app-state.js'

const LANG_KEY = 'symmetry_viewer_lang'

/** 界面文案（zh 为默认，亦作回退） */
const MESSAGES = {
  zh: {
    brand: '对称视界',
    hint: '单指拖动旋转 · 双指缩放 · 单击原子查看轨道',
    'tool.symmetry': '对称元素',
    'tool.labels': '标签',
    'tool.aux': '辅助几何',
    'tool.auxTitle': '显示当前结构的辅助几何参考（立方体/二面角矩形），部分结构支持',
    'tool.atomLabel': '原子标签',
    'tool.settings': '设置',
    'tool.settingsTitle': '自定义外观与颜色',
    'ex.molecule': '分子示例',
    'info.symSection': '对称元素',
    'info.none': '（无）',
    'ct.title': '特征标表',
    'ct.irreps': '不可约表示',
    'ct.linear': '线性 & 旋转',
    'ct.quad': '二次函数',
    'set.title': '外观设置',
    'set.lang': '语言',
    'set.bg': '背景色',
    'set.atomScale': '原子缩放',
    'set.stick': '键粗细',
    'set.symScale': '对称元素大小',
    'set.labelFont': '标签字号',
    'set.elemColorSec': '元素颜色',
    'set.symColorSec': '对称元素颜色',
    'set.reset': '恢复默认设置',
    'set.emptyHint': '（加载分子后可设置）',
    'anim.toggle': '播放/暂停',
    'anim.reset': '重置变换',
    'anim.inverse': '逆变换',
    'anim.again': '再次操作',
    'anim.close': '关闭动画',
    'anim.progress': '动画进度',
    'anim.speed': '旋转角速度（°/s）',
    'anim.dur': '反映/反演时长（ms）',
    'orb.orbit': '等价原子',
    'orb.stabilizer': '稳定化子',
    'orb.order': '群阶',
    'elem.C2': '二重旋转轴', 'elem.C3': '三重旋转轴', 'elem.C4': '四重旋转轴',
    'elem.C5': '五重旋转轴', 'elem.C6': '六重旋转轴', 'elem.C∞': '分子主轴（无限阶）',
    'elem.S4': '四重旋反轴', 'elem.S5': '五重旋反轴', 'elem.S6': '六重旋反轴', 'elem.S8': '八重旋反轴',
    'elem.sigma': '对称面', 'elem.sigma_v': '竖直对称面', 'elem.sigma_d': '对角对称面', 'elem.sigma_h': '水平对称面',
    'elem.i': '反演中心', 'elem.E': '恒等元素',
    'nav.molecules': '分子', 'nav.elements': '元素', 'nav.operations': '操作',
    'nav.pointgroup': '点群', 'nav.more': '更多',
    'pg.title': '点群信息',
    'pg.orders': '操作阶数', 'pg.character': '特征标表',
    'land.name': '对称视界',
    'land.sub': '分子对称性教学 · 微信小程序',
    'land.f1': '3D 可视化',
    'land.f2': '对称操作',
    'land.enter': '进入',
    'about': '关于'
  },
  en: {
    brand: 'Symmetry Viewer',
    hint: 'Drag to rotate · Pinch to zoom · Tap an atom to inspect',
    'tool.symmetry': 'Symmetry elements',
    'tool.labels': 'Labels',
    'tool.aux': 'Aux geometry',
    'tool.auxTitle': 'Show auxiliary reference geometry (cube/dihedral planes), where supported',
    'tool.atomLabel': 'Atom labels',
    'tool.settings': 'Settings',
    'tool.settingsTitle': 'Customize appearance & colors',
    'ex.molecule': 'Molecule examples',
    'info.symSection': 'Symmetry elements',
    'info.none': '(none)',
    'ct.title': 'Character table',
    'ct.irreps': 'Irreducible reps.',
    'ct.linear': 'Linear & rotation',
    'ct.quad': 'Quadratic',
    'set.title': 'Appearance',
    'set.lang': 'Language',
    'set.bg': 'Background',
    'set.atomScale': 'Atomic scale',
    'set.stick': 'Bond radius',
    'set.symScale': 'Symmetry element size',
    'set.labelFont': 'Label font size',
    'set.elemColorSec': 'Element colors',
    'set.symColorSec': 'Symmetry element colors',
    'set.reset': 'Restore defaults',
    'set.emptyHint': '(load a molecule to customize)',
    'anim.toggle': 'Play/Pause',
    'anim.reset': 'Reset transform',
    'anim.inverse': 'Inverse operation',
    'anim.again': 'Apply again',
    'anim.close': 'Close animation',
    'anim.progress': 'Animation progress',
    'anim.speed': 'Rotation speed (°/s)',
    'anim.dur': 'Reflection/inversion duration (ms)',
    'orb.orbit': 'Equivalent atoms',
    'orb.stabilizer': 'Stabilizer',
    'orb.order': 'order',
    'elem.C2': 'twofold rotation axis', 'elem.C3': 'threefold rotation axis', 'elem.C4': 'fourfold rotation axis',
    'elem.C5': 'fivefold rotation axis', 'elem.C6': 'sixfold rotation axis', 'elem.C∞': 'principal axis (infinite order)',
    'elem.S4': 'fourfold improper rotation axis', 'elem.S5': 'fivefold improper rotation axis',
    'elem.S6': 'sixfold improper rotation axis', 'elem.S8': 'eightfold improper rotation axis',
    'elem.sigma': 'mirror plane', 'elem.sigma_v': 'vertical mirror plane', 'elem.sigma_d': 'dihedral mirror plane', 'elem.sigma_h': 'horizontal mirror plane',
    'elem.i': 'inversion center', 'elem.E': 'identity element',
    'nav.molecules': 'Molecules', 'nav.elements': 'Elements', 'nav.operations': 'Operations',
    'nav.pointgroup': 'Point Group', 'nav.more': 'More',
    'pg.title': 'Point group',
    'pg.orders': 'Order', 'pg.character': 'Character table',
    'land.name': 'Symmetry Viewer',
    'land.sub': 'Molecular symmetry · WeChat Mini Program',
    'land.f1': '3D Visualization',
    'land.f2': 'Symmetry Operations',
    'land.enter': 'Enter',
    'about': 'About'
  }
}

/** 点群英文名（zh 通返回上 groupTable 的中文名） */
const EN_GROUP_NAMES = {
  'C1': 'Trivial / identity group', 'Ci': 'Inversion group', 'Cs': 'Mirror group',
  'C2': 'twofold rotation group', 'C3': 'threefold rotation group', 'C4': 'fourfold rotation group', 'C6': 'sixfold rotation group',
  'C2v': 'C₂ᵥ group (twofold rotation + vertical mirrors)', 'C3v': 'C₃ᵥ group (threefold rotation + vertical mirrors)',
  'C4v': 'C₄ᵥ group (fourfold rotation + vertical mirrors)', 'C6v': 'C₆ᵥ group (sixfold rotation + vertical mirrors)',
  'C2h': 'C₂ₕ group (twofold rotation + horizontal mirror)', 'C3h': 'C₃ₕ group (threefold rotation + horizontal mirror)',
  'C4h': 'C₄ₕ group (fourfold rotation + horizontal mirror)', 'C6h': 'C₆ₕ group (sixfold rotation + horizontal mirror)',
  'D2': 'dihedral group', 'D3': 'dihedral group', 'D4': 'dihedral group', 'D6': 'dihedral group',
  'D2h': 'D₂ₕ group (dihedral + horizontal mirror)', 'D3h': 'D₃ₕ group (dihedral + horizontal mirror)',
  'D4h': 'D₄ₕ group (dihedral + horizontal mirror)', 'D6h': 'D₆ₕ group (dihedral + horizontal mirror)',
  'D2d': 'D₂d group (dihedral + diagonal mirrors)', 'D3d': 'D₃d group (dihedral + diagonal mirrors)',
  'D4d': 'D₄d group (dihedral + diagonal mirrors)', 'D6d': 'D₆d group (dihedral + diagonal mirrors)',
  'S4': 'fourfold improper rotation group', 'S6': 'sixfold improper rotation group', 'S8': 'eightfold improper rotation group',
  'C5': 'fivefold rotation group', 'C5v': 'C₅ᵥ group (fivefold rotation + vertical mirrors)',
  'C5h': 'C₅ₕ group (fivefold rotation + horizontal mirror)',
  'D5': 'dihedral group (5-fold)', 'D5h': 'D₅ₕ group (dihedral + horizontal mirror)', 'D5d': 'D₅d group (dihedral + diagonal mirrors)',
  'T': 'tetrahedral rotation group', 'Td': 'full tetrahedral group', 'Th': 'tetrahedral with inversion group',
  'O': 'octahedral rotation group', 'Oh': 'full octahedral group',
  'I': 'icosahedral rotation group', 'Ih': 'full icosahedral group',
  'C∞v': 'linear group (non-centrosymmetric)', 'D∞h': 'linear group (centrosymmetric)', 'Kh': 'spherical group (free atom)'
}

/** 读取语言（wx 存储，回退 zh） */
function loadLang() {
  try {
    const v = (typeof wx !== 'undefined' && wx.getStorageSync) ? wx.getStorageSync(LANG_KEY) : ''
    return v === 'en' || v === 'zh' ? v : 'zh'
  } catch (e) {
    return 'zh'
  }
}

let currentLang = loadLang()

export const i18n = {
  get lang() { return currentLang },
  setLang(lang) {
    if (lang !== currentLang) {
      currentLang = lang
      try {
        if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(LANG_KEY, lang)
      } catch (e) { /* ignore */ }
      bus.emit('langchange', lang)   // 各页监听后重算 data
    }
  }
}

/** 取当前语言文本（缺失回退 zh，再回退 key） */
export function t(key) {
  const dict = MESSAGES[currentLang] || MESSAGES.zh
  if (dict[key] !== undefined) return dict[key]
  if (MESSAGES.zh[key] !== undefined) return MESSAGES.zh[key]
  return key
}

/** 点群名（zh 用 groupTable 中文；en 用英文映射） */
export function groupName(symbol) {
  if (!symbol) return ''
  return currentLang === 'en' ? (EN_GROUP_NAMES[symbol] || symbol) : (POINT_GROUP_NAMES[symbol] || symbol)
}

/**
 * 群符号 HTML 化（Schönflies 记号：主字母斜体、下标数字/字母正体）
 * 'C3v' → <i>C</i><sub>3v</sub>；'D∞h' → <i>D</i><sub>∞h</sub>
 * 小程序用 <rich-text nodes> 渲染。
 */
export function formatGroupSymbol(symbol) {
  if (!symbol) return '—'
  const m = String(symbol).match(/^([A-Za-z])(.*)$/)
  if (!m) return symbol
  return `<i>${m[1]}</i><sub>${m[2]}</sub>`
}

/** 不可约表示符号 HTML 化（主字母斜体、下标正体）'E1u' → <i>E</i><sub>1u</sub> */
export function formatIrrepLabel(label) {
  const m = String(label).match(/^([A-Za-z])(.*)$/)
  if (!m) return label
  return `<i>${m[1]}</i><sub>${m[2]}</sub>`
}

const SUB_DIGITS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' }
/** 化学式数字 → Unicode 下标（C12H10 → C₁₂H₁₀，上标 ⁻/³⁺ 保留）—— 纯文本即可显示 */
export function formatFormulaU(f) {
  return String(f).replace(/(\d+)/g, d => d.split('').map(c => SUB_DIGITS[c] || c).join(''))
}
