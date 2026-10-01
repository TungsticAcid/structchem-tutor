/**
 * packages/skills/common/index.js —— 通用教学法技能（学科无关）
 *
 * 技能正文在 skills.js；本文件提供「装进目录」的接线。
 */
// ★ 字典要**被真的 import** 才生效：技能文案走 `t()`（清单进系统提示词、
//   正文由 loadSkill 拉取，都不进 DOM），没有这一步 `t()` 只会原样返回键名。
//   `skills.js` 自己也 import 了一次——两处都要，理由不同：
//   这里是"本包被加载"的入口保证，那里是"取值前字典已就绪"的保证（ESM 只会求值一次）。
import '../i18n.js'
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
