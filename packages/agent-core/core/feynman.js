/**
 * feynman.js — 费曼式复述的发起
 *
 * 费曼式复述的教学动作是学科无关的（「用你自己的话讲一遍」），
 * 故放在共享层；而它的评分要点来自技能库里的 feynman 技能正文
 * （由技能库提供，各模块可覆盖），故这里只做组合，不自带内容。
 *
 * 来源：orbit/H5/js/agent/skills.js 的 startFeynman，2026-09-24 迁入。
 */
// ★ 三处文案都会回到模型或界面（邀请语经工具回执给模型、note 是给模型的下一步提示），
//   故走 t()，不进 `text` 表。
// ★ 自己 import 字典：`modules/crystal/teach-tools.js` 直接引用本文件（不经 app.js）
import '../i18n.js'
import { t } from '../../i18n/index.js'

/**
 * 发起一次费曼式复述。
 *
 * @param {ReturnType<import('./catalog.js').createCatalog>} skillsCatalog 技能目录
 * @param {string} knowledgePoint 本次要复述的知识点 id（可为空，表示未指定）
 * @returns {{skill: string, knowledgePoint: string, invitation: string, rubric: any[], note: string}
 *          | {error: string}}
 */
export function startFeynman(skillsCatalog, knowledgePoint) {
  const skill = skillsCatalog.load('feynman')
  if (!skill) return { error: t('agent.feynman.notRegistered') }

  return {
    skill: 'feynman',
    knowledgePoint: knowledgePoint || '',
    // 邀请语刻意强调"别背公式"——这是费曼法的要点：暴露的是理解缺口，不是记忆缺口
    invitation: t('agent.feynman.invitation'),
    // 评分要点取自技能正文的 steps；技能库怎么定义，这里就怎么用
    rubric: (skill.steps && skill.steps.length) ? skill.steps : [],
    note: t('agent.feynman.note'),
  }
}

export default startFeynman
