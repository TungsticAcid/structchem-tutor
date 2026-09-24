/**
 * _template-lite.js — 小模块模板
 *
 * ★ 这个文件存在的意义：证明「小工具也能挂上」。
 *
 *   将来要加的零散工具（晶体场理论、休克尔分子轨道、配位数计算器…）
 *   规模远小于晶体结构：可能只是一个计算器 + 几十条知识条目 + 一个节点。
 *   它们不需要 3D 渲染、不需要出题引擎、不需要分镜演示。
 *
 *   复制本文件，改掉带 ★ 的四处，就是一个能用的新模块。
 *
 * 用法：
 *   1. 复制为 descriptors/<你的模块id>.js
 *   2. 在 descriptors/index.js 中 import 并加入列表
 *   3. 在 packages/knowledge/<模块id>/ 放知识条目
 */

export default {
  // ★ 1. 模块标识（小写字母、数字、连字符；会作为知识条目 id 的命名空间前缀）
  id: 'crystal-field',
  title: '晶体场理论',

  // 小模块标记：仅用于面板展示分组，不影响任何逻辑
  scale: 'lite',

  // ★ 2. 能力声明 —— 中枢据此把问题路由过来。
  //      这是小模块唯一【必填】的内容字段，写清"用户说什么时会用到我"。
  capabilities: {
    crystalField: ['晶体场', '配位场', '分裂能', 'd轨道分裂', '八面体场',
                   '四面体场', '强场', '弱场', '高自旋', '低自旋',
                   '光谱化学序列', 'CFSE', '晶体场稳定化能'],
  },

  // ★ 3. 贡献的工具。小模块通常只需要"查"（无副作用的计算/查询）。
  //      不需要 read / hand / teach 时应留空数组——空数组意味着
  //      该模块在出题、演示等节点上完全不参与，这是正确且安全的。
  tools: {
    read: [],
    query: ['calcCrystalFieldSplitting'],   // 本模块自己的计算工具
    hand: [],                                // 小模块往往不需要操作画面
    teach: [],
  },

  // ★ 4. 知识条目目录（放 packages/knowledge/crystal-field/ 下）
  knowledge: 'crystal-field',

  // 技能：小模块通常无专属教学法，留空即可
  skills: [],

  // extraNodes / nodeOverrides / proactiveRules 均可省略
};
