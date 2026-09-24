/**
 * 晶体搜索/过滤工具函数
 * 为 crystal-skill 的 API 提供数据查询能力
 */
const crystalIndex = require('../../data/crystalIndex.js')
const { getCrystalData } = require('../../lib/crystal-loader')

/** 晶系中文名映射 */
const CRYSTAL_SYSTEM_CN = {
  cubic: '立方晶系',
  hexagonal: '六方晶系',
  tetragonal: '四方晶系',
  orthorhombic: '正交晶系',
  monoclinic: '单斜晶系',
  triclinic: '三斜晶系',
  trigonal: '三方晶系'
}

/** 分类中文名映射 */
const CATEGORY_CN = {
  metal: '金属晶体',
  ionic: '离子晶体',
  covalent: '共价晶体',
  molecular: '分子晶体',
  mixed: '混合键型'
}

/** 用于搜索的关键词到分类的映射 */
const KEYWORD_CATEGORY_MAP = {
  '金属': 'metal',
  '离子': 'ionic',
  '共价': 'covalent',
  '分子': 'molecular',
  '混合': 'mixed',
  '混合键型': 'mixed'
}

/** 用于搜索的关键词到晶系的映射 */
const KEYWORD_SYSTEM_MAP = {
  '立方': 'cubic',
  '六方': 'hexagonal',
  '四方': 'tetragonal',
  '正交': 'orthorhombic',
  '单斜': 'monoclinic',
  '三斜': 'triclinic',
  '三方': 'trigonal'
}

/**
 * 按关键词搜索晶体
 * 支持匹配：晶体名、化学式、subtitle（结构类型）、分类、晶系
 * @param {string} keyword - 搜索关键词
 * @returns {Array} 匹配的晶体索引项列表
 */
function searchCrystals(keyword) {
  if (!keyword || typeof keyword !== 'string') return []
  const kw = keyword.toLowerCase().trim()

  // 检查是否为分类关键词
  const categoryMatch = KEYWORD_CATEGORY_MAP[Object.keys(KEYWORD_CATEGORY_MAP).find(k => kw.includes(k))]
  // 检查是否为晶系关键词
  const systemMatch = KEYWORD_SYSTEM_MAP[Object.keys(KEYWORD_SYSTEM_MAP).find(k => kw.includes(k))]

  return crystalIndex.filter(c => {
    // 精确匹配分类
    if (categoryMatch && c.category === categoryMatch) return true
    // 精确匹配晶系
    if (systemMatch && c.crystalSystem === systemMatch) return true
    // 模糊匹配名称
    if (c.name.toLowerCase().includes(kw)) return true
    // 匹配化学式（大小写不敏感）
    if (c.formula.toLowerCase().includes(kw)) return true
    // 匹配 subtitle（结构类型描述）
    if (c.subtitle && c.subtitle.toLowerCase().includes(kw)) return true
    // 匹配晶系中文名
    if (c.systemName && c.systemName.includes(keyword)) return true
    // 匹配常见别名
    if (matchAlias(c.id, kw)) return true
    return false
  })
}

/**
 * 按分类筛选晶体
 * @param {string} category - 分类key
 * @returns {Array}
 */
function filterByCategory(category) {
  if (!category || category === 'all') return [...crystalIndex]
  return crystalIndex.filter(c => c.category === category)
}

/**
 * 按晶系筛选晶体
 * @param {string} system - 晶系key
 * @returns {Array}
 */
function filterByCrystalSystem(system) {
  if (!system) return [...crystalIndex]
  return crystalIndex.filter(c => c.crystalSystem === system)
}

/**
 * 获取推荐晶体列表
 * @param {string} scenario - 推荐场景：'default' / 'metal' / 'ionic' / 'covalent' / 'molecular' / 'mixed'
 * @param {number} count - 返回数量，默认5
 * @returns {Array} 推荐晶体列表
 */
function getRecommendedCrystals(scenario = 'default', count = 5) {
  let pool = crystalIndex

  if (scenario && scenario !== 'default' && CATEGORY_CN[scenario]) {
    pool = crystalIndex.filter(c => c.category === scenario)
  }

  // 精选代表晶体：优先展示教学中最常用的结构
  const priorityIds = ['fcc', 'bcc', 'hcp', 'naCl', 'csCl', 'diamond', 'zincBlende', 'perovskite', 'graphite', 'ice']
  const priority = []
  const rest = []
  for (const c of pool) {
    if (priorityIds.includes(c.id)) {
      priority.push(c)
    } else {
      rest.push(c)
    }
  }

  // 优先晶体在前，其他在后
  const sorted = [...priority, ...rest]
  const result = sorted.slice(0, count)

  return result.map(c => ({
    ...c,
    systemName: c.systemName || CRYSTAL_SYSTEM_CN[c.crystalSystem] || c.crystalSystem,
    categoryName: CATEGORY_CN[c.category] || c.category,
    recommendationReason: getRecommendationReason(c)
  }))
}

/**
 * 获取推荐理由
 * @param {Object} crystal - 晶体索引项
 * @returns {string} 推荐理由
 */
function getRecommendationReason(crystal) {
  const reasons = {
    fcc: '最典型的立方最密堆积结构，A1堆积代表',
    bcc: '体心立方堆积代表，α-Fe的晶体结构',
    hcp: '六方最密堆积代表，A3堆积',
    naCl: '最经典的离子晶体结构，配位数6:6',
    csCl: '简单立方离子晶体，配位数8:8',
    diamond: '共价晶体代表，A4堆积，展示四面体配位',
    zincBlende: '闪锌矿结构，与金刚石类似但含两种元素',
    perovskite: '钙钛矿型结构，功能材料重要结构原型',
    graphite: '层状结构代表，展示混合键型特征',
    ice: '氢键分子晶体代表，展示冰的六方结构'
  }
  return reasons[crystal.id] || `${CRYSTAL_SYSTEM_CN[crystal.crystalSystem] || crystal.crystalSystem}的${CATEGORY_CN[crystal.category] || crystal.category}代表`
}

/**
 * 匹配晶体别名
 * @param {string} id - 晶体ID
 * @param {string} keyword - 搜索关键词
 * @returns {boolean}
 */
function matchAlias(id, keyword) {
  const aliases = {
    fcc: ['面心立方', 'a1', '铜型', 'cu', '最密堆积', '立方最密', 'ccp'],
    bcc: ['体心立方', 'a2', '铁型', 'fe', 'α-fe'],
    hcp: ['六方最密', 'a3', '镁型', 'mg', '六方密堆积'],
    naCl: ['氯化钠', '岩盐', '食盐', 'nacl'],
    csCl: ['氯化铯', 'cscl'],
    diamond: ['金刚石', '钻石', 'a4'],
    zincBlende: ['闪锌矿', 'zns'],
    wurtzite: ['纤锌矿', '六方zns'],
    perovskite: ['钙钛矿', 'catio3'],
    graphite: ['石墨', '六方石墨'],
    quartz: ['石英', 'sio2', '二氧化硅'],
    fluorite: ['萤石', 'caf2', '氟化钙'],
    ice: ['冰', '水', 'h2o'],
    co2: ['干冰', '二氧化碳'],
    rutile: ['金红石', 'tio2', '二氧化钛'],
    pyrite: ['黄铁矿', 'fes2'],
    i2: ['碘'],
    urea: ['尿素']
  }
  const list = aliases[id]
  if (!list) return false
  return list.some(a => keyword.includes(a) || a.includes(keyword))
}

/**
 * 获取全部分类信息（含每类晶体数量）
 * @returns {Array} 分类列表
 */
function getCategoryList() {
  const categories = ['metal', 'ionic', 'covalent', 'molecular', 'mixed']
  return categories.map(key => ({
    key,
    name: CATEGORY_CN[key],
    count: crystalIndex.filter(c => c.category === key).length,
    samples: crystalIndex.filter(c => c.category === key).slice(0, 3).map(c => ({
      id: c.id,
      name: c.name,
      formula: c.formula
    }))
  }))
}

/**
 * 获取晶体详细信息（从完整数据中提取教学关键信息）
 * @param {string} crystalId - 晶体ID
 * @returns {Object|null} 详细信息
 */
function getCrystalDetailInfo(crystalId) {
  const meta = crystalIndex.find(c => c.id === crystalId)
  if (!meta) return null

  const data = getCrystalData(crystalId)
  const lattice = data.lattice

  // 提取原子种类和数量
  const atomSummary = data.atoms ? data.atoms.map(group => {
    const count = (group.positions || (group.position ? [group.position] : [])).length
    return {
      element: group.element,
      count,
      radius: group.radius || null,
      color: group.color || null
    }
  }) : []

  // 空隙类型
  // interstices 实际是对象格式 { octahedral: {...}, tetrahedral: {...} }，key 即为 type 名称
  const intersticeTypes = data.interstices
    ? Object.keys(data.interstices)
    : []

  return {
    id: crystalId,
    name: data.name || meta.name,
    formula: data.formula || meta.formula,
    crystalSystem: data.crystalSystem || meta.crystalSystem,
    crystalSystemCN: CRYSTAL_SYSTEM_CN[data.crystalSystem] || meta.systemName || '',
    category: meta.category,
    categoryName: CATEGORY_CN[meta.category] || '',
    subtitle: meta.subtitle || '',
    spaceGroup: data.spaceGroup || '',
    latticeType: data.latticeType || '',
    structuralUnit: data.structuralUnit || '',
    coordination: data.coordination || '',
    spaceUtilization: data.spaceUtilization || '',
    packingDescription: data.packingDescription || '',
    lattice: lattice ? {
      a: lattice.a, b: lattice.b, c: lattice.c,
      alpha: lattice.alpha, beta: lattice.beta, gamma: lattice.gamma
    } : null,
    atomSummary,
    intersticeTypes,
    hasSymmetry: !!(data.symmetry && (data.symmetry.axes || data.symmetry.mirrors)),
    hasBonds: !!(data.bonds && data.bonds.length > 0),
    hasHydrogenBonds: !!(data.hydrogenBonds && data.hydrogenBonds.length > 0)
  }
}

/**
 * 按ID查找晶体索引
 * @param {string} crystalId
 * @returns {Object|null}
 */
function findCrystalById(crystalId) {
  return crystalIndex.find(c => c.id === crystalId) || null
}

module.exports = {
  searchCrystals,
  filterByCategory,
  filterByCrystalSystem,
  getRecommendedCrystals,
  getCategoryList,
  getCrystalDetailInfo,
  findCrystalById,
  CRYSTAL_SYSTEM_CN,
  CATEGORY_CN
}
