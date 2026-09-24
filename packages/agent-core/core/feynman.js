/**
 * feynman.js — 费曼式复述的发起
 *
 * 费曼式复述的教学动作是学科无关的（「用你自己的话讲一遍」），
 * 故放在共享层；而它的评分要点来自技能库里的 feynman 技能正文
 * （由技能库提供，各模块可覆盖），故这里只做组合，不自带内容。
 *
 * 来源：orbit/H5/js/agent/skills.js 的 startFeynman，2026-09-24 迁入。
 */

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
  if (!skill) return { error: '费曼技能未注册' }

  return {
    skill: 'feynman',
    knowledgePoint: knowledgePoint || '',
    // 邀请语刻意强调"别背公式"——这是费曼法的要点：暴露的是理解缺口，不是记忆缺口
    invitation:
      '试着用**你自己的话**说一遍，就当我是完全没学过的同学——不要背公式，讲你理解的那个版本。',
    // 评分要点取自技能正文的 steps；技能库怎么定义，这里就怎么用
    rubric: (skill.steps && skill.steps.length) ? skill.steps : [],
    note: '学生复述后调用 evaluateFeynman 评估',
  }
}

export default startFeynman
