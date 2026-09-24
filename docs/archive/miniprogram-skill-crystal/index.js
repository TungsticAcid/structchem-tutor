/**
 * crystal-skill 注册入口
 * 注册所有原子接口，使微信 Agent 可通过 MCP 协议调用
 *
 * 规范：必须使用 createSkill 创建 skill 实例后通过 skill.registerAPI 注册，
 * 这样才能使用中间件机制（skill.use），且符合文档规范。
 */
const searchCrystals = require('./apis/searchCrystals.js')
const getCrystalDetail = require('./apis/getCrystalDetail.js')
const openCrystalViewer = require('./apis/openCrystalViewer.js')
const getRecommendedCrystals = require('./apis/getRecommendedCrystals.js')
const getCrystalCategories = require('./apis/getCrystalCategories.js')
const compareCrystals = require('./apis/compareCrystals.js')

// 创建 skill 实例，path 需与 app.json 中 agent.skills[].path 一致
const skill = wx.modelContext.createSkill('skills/crystal-skill')

// 注册原子接口，name 需与 mcp.json 中声明的一致
skill.registerAPI('searchCrystals', searchCrystals)
skill.registerAPI('getCrystalDetail', getCrystalDetail)
skill.registerAPI('openCrystalViewer', openCrystalViewer)
skill.registerAPI('getRecommendedCrystals', getRecommendedCrystals)
skill.registerAPI('getCrystalCategories', getCrystalCategories)
skill.registerAPI('compareCrystals', compareCrystals)

console.log('[crystal-skill] APIs registered via createSkill')
