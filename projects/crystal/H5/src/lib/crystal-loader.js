/**
 * 晶体数据加载器
 * 预加载所有晶体JSON到一个Map中
 */
import fcc from '../data/crystals/fcc.js'
import bcc from '../data/crystals/bcc.js'
import hcp from '../data/crystals/hcp.js'
import diamond from '../data/crystals/diamond.js'
import graphite from '../data/crystals/graphite.js'
import rhomboGraphite from '../data/crystals/rhomboGraphite.js'
import naCl from '../data/crystals/naCl.js'
import csCl from '../data/crystals/csCl.js'
import zincBlende from '../data/crystals/zincBlende.js'
import wurtzite from '../data/crystals/wurtzite.js'
import perovskite from '../data/crystals/perovskite.js'
import fluorite from '../data/crystals/fluorite.js'
import nias from '../data/crystals/nias.js'
import rutile from '../data/crystals/rutile.js'
import cdi2 from '../data/crystals/cdi2.js'
import pyrite from '../data/crystals/pyrite.js'
import reo3 from '../data/crystals/reo3.js'
import quartz from '../data/crystals/quartz.js'
import cristobalite from '../data/crystals/cristobalite.js'
import co2 from '../data/crystals/co2.js'
import ice from '../data/crystals/ice.js'
import i2 from '../data/crystals/i2.js'
import urea from '../data/crystals/urea.js'

/** 晶体数据映射表 */
const crystalMap = {
  fcc, bcc, hcp,
  naCl, csCl, fluorite, perovskite, nias, rutile, pyrite, reo3,
  diamond, zincBlende, wurtzite, quartz, cristobalite,
  co2, ice, i2, urea,
  graphite, rhomboGraphite, cdi2
}

/**
 * 通过ID获取晶体数据
 */
export function getCrystalData(crystalId) {
  return crystalMap[crystalId] || null
}

/**
 * 获取所有晶体ID列表
 */
export function getAllCrystalIds() {
  return Object.keys(crystalMap)
}

export default { getCrystalData, getAllCrystalIds }
