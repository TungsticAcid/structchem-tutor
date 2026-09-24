/**
 * 晶体数据加载器
 * 预加载所有晶体JSON到一个Map中（因为小程序不支持动态require路径）
 */
const fcc = require('../data/crystals/fcc.js')
const bcc = require('../data/crystals/bcc.js')
const hcp = require('../data/crystals/hcp.js')
const diamond = require('../data/crystals/diamond.js')
const graphite = require('../data/crystals/graphite.js')
const rhomboGraphite = require('../data/crystals/rhomboGraphite.js')
const naCl = require('../data/crystals/naCl.js')
const csCl = require('../data/crystals/csCl.js')
const zincBlende = require('../data/crystals/zincBlende.js')
const wurtzite = require('../data/crystals/wurtzite.js')
const perovskite = require('../data/crystals/perovskite.js')
const fluorite = require('../data/crystals/fluorite.js')
const nias = require('../data/crystals/nias.js')
const rutile = require('../data/crystals/rutile.js')
const cdi2 = require('../data/crystals/cdi2.js')
const pyrite = require('../data/crystals/pyrite.js')
const reo3 = require('../data/crystals/reo3.js')
const quartz = require('../data/crystals/quartz.js')
const cristobalite = require('../data/crystals/cristobalite.js')
const co2 = require('../data/crystals/co2.js')
const ice = require('../data/crystals/ice.js')
const i2 = require('../data/crystals/i2.js')
const urea = require('../data/crystals/urea.js')

/** 晶体数据映射表 */
const crystalMap = {
  // 金属晶体
  fcc, bcc, hcp,
  // 离子晶体
  naCl, csCl, fluorite, perovskite, nias, pyrite, reo3,
  // 共价晶体
  rutile, diamond, zincBlende, wurtzite, quartz, cristobalite,
  // 分子晶体
  co2, ice, i2, urea,
  // 混合键型晶体
  graphite, rhomboGraphite, cdi2
}

/**
 * 通过ID获取晶体数据
 * @param {string} crystalId - 晶体标识符
 * @returns {Object|null} 晶体JSON数据
 */
function getCrystalData(crystalId) {
  return crystalMap[crystalId] || null
}

/**
 * 获取所有晶体ID列表
 * @returns {string[]}
 */
function getAllCrystalIds() {
  return Object.keys(crystalMap)
}

module.exports = { getCrystalData, getAllCrystalIds }
