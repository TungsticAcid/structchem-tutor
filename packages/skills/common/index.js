/**
 * packages/skills/common/index.js —— 通用教学法技能（学科无关）
 *
 * 技能正文在 skills.js；本文件提供「装进目录」的接线。
 */
import { SKILLS } from './skills.js'

export { SKILLS }

/**
 * 把通用技能装进一个目录（createCatalog({key:'name'}) 的返回值）。
 * 技能不用命名空间：它们学科无关，全模块共用同一套。
 *
 * @param {ReturnType<import('../../agent-core/core/catalog.js').createCatalog>} catalog
 * @returns {number} 装入条数
 */
export function registerInto(catalog) {
  return catalog.register(SKILLS)
}

export default SKILLS
