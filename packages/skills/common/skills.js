/**
 * skills.js — 通用教学法技能（6 个，**学科无关**）
 *
 * ★ 为什么放在 common 而不是某模块下：这 6 个技能不含任何学科内容，
 *   三个模块都能用（已核实全文无学科词）。CLAUDE.md §二 规定
 *   packages/skills/common/ 放通用教学法、学科专属教学法放各模块目录。
 *
 * ★ 技能与知识的分层策略**不同**，别混为一谈：
 *   知识条目只有 {id,kp,title,keywords} 进上下文，body 按需拉取；
 *   「何时该启用」的判断依据，故清单可常驻。
 *
 * ★ 迁自 projects/orbit/H5/skills/index.js（自注册 IIFE），2026-09-24。
 *   内容未改一字；仅由自注册改为 ESM 导出。过渡期同 entries.js。
 *
 * ---------------------------------------------------------------------------
 * ★ i18n（2026-10-01）：本文件的文案**全部走 `t()`**，中文原文与英文译文都在
 *   `packages/skills/i18n.js`
 * ---------------------------------------------------------------------------
 * 为什么不是 `text` 表：技能文案**不进 DOM** —— 清单（name/desc）由
 * `buildManifestText()` 拼进系统提示词发给模型，正文由 `loadSkill(name)` 按需拉取。
 * 扫描替换只看 DOM 文本节点，在这里**一个字符都换不掉**。
 *
 * 为什么字段是 **getter** 而不是当场求值的字符串：
 *   `t()` 在**取值那一刻**按当前语言返回文案。`catalog.load()` 返回的是条目对象
 *   **本身**（不是快照），所以只要字段是 getter，
 *     · 模型调 `loadSkill('feynman')` 拿到的就是当下的语言；
 *     · 每轮组系统提示词时 `index()` 现取 `desc`，切语言后下一轮就变。
 *   而 `loadSkill` 的工具实现（`agent-core/app.js`）只是转发的，**不需要改一行**
 *   —— 换语言不该要求改动中枢。
 *
 * 步骤/话术/注意事项用**一条一步的键**（`skills.feynman.step1` …），在取值时按语言
 * 组装成**数组**：形状不能从数组改成整块字符串，因为 `core/feynman.js` 与
 * `modules/orbit/tools.js` 都按数组消费它（`skill.steps.length` 当 rubric）。
 * 选它的理由写在 `../i18n.js` 顶部。
 */
import { t } from '../../i18n/index.js'
// ★ 导入字典本身就是"接线"：字典模块被求值时会 `registerDict('skills', …)`。
//   放在**这个文件**里（而不是只放 index.js），是为了保证"谁来加载技能正文，
//   字典就已经在了" —— getter 取值前字典必须注册好，否则 `t()` 会原样返回键名，
//   而那是**静默**的（不报错，模型只是收到一行键名）。
import { zh, en } from '../i18n.js'

/**
 * 技能定义：**只写机器用的 name 与各数组的条数**，文案一律在 `../i18n.js`。
 * 键的形状：`skills.<name>.<字段>`（数组字段带从 1 起的序号）。
 */
const DEFS = [
  { name: 'feynman', steps: 6, phrases: 3, cautions: 2 },
  { name: 'socratic', steps: 5, phrases: 3, cautions: 2 },
  { name: 'misconception-probe', steps: 6, phrases: 3, cautions: 1 },
  { name: 'worked-example', steps: 4, phrases: 2, cautions: 1 },
  { name: 'spaced-repetition', steps: 3, phrases: 1, cautions: 1 },
  { name: 'analogy', steps: 4, phrases: 2, cautions: 2 },
]

/**
 * 字段表：`[字段名, 键前缀]`，前缀为 null 表示标量字段。
 * ★ 顺序**照迁移前的字面量顺序**（title/desc/when/steps/phrases/exit/cautions）：
 *   消费方虽不依赖顺序，但让 `JSON.stringify` 出来的形状与上游一致，diff 才读得懂。
 */
const FIELDS = [
  ['title', null],
  ['desc', null],
  ['when', null],
  ['steps', 'step'],
  ['phrases', 'phrase'],
  ['exit', null],
  ['cautions', 'caution'],
]

const keyOf = (name, part) => `skills.${name}.${part}`
/** 1..n（步骤序号从 1 起，`step1` 而不是 `step0`） */
const seq = (n) => Array.from({ length: n }, (_, i) => i + 1)

/** 一个技能定义涉及的全部键 */
function keysOf(def) {
  const out = []
  for (const [field, prefix] of FIELDS) {
    if (prefix) for (const i of seq(def[field])) out.push(keyOf(def.name, prefix + i))
    else out.push(keyOf(def.name, field))
  }
  return out
}

/** 由定义造出一个技能条目：所有给人/模型看的字段都是 getter */
function materialize(def) {
  // ★ `name` 是**机器用的标识**（loadSkill 按它取、目录按它做键），不翻译
  const skill = { name: def.name }
  for (const [field, prefix] of FIELDS) {
    Object.defineProperty(skill, field, {
      // ★ 必须 enumerable：目录的 summarize() 用 Object.keys 拷字段，
      //   不可枚举的话清单里会**静默**少掉这些字段。
      enumerable: true,
      get() {
        return prefix
          ? seq(def[field]).map((i) => t(keyOf(def.name, prefix + i)))
          : t(keyOf(def.name, field))
      },
    })
  }
  return skill
}

export const SKILLS = DEFS.map(materialize)

/**
 * 加载期自检：定义表里的每个键，**中英两张表都要有**。
 *
 * ★ 为什么要有它：两处失效都不会报错，而且**覆盖率守卫都看不见**——
 *   ① 键打错（或步数写多、名字写错）：`t()` 会原样返回键名（i18n 运行时的刻意
 *      行为：漏译不该变成崩溃）。于是模型收到 `skills.feynman.step7` 这样一行：
 *      不报错、不崩，只是教学法少了一步。键不是中文、字典条目也照样算"已登记"，
 *      守卫因此全绿。
 *   ② 只有中文表有、英文表漏了：`t()` 会**静默回退到中文**（这正是运行时的设计），
 *      表现是"英文界面里模型仍读到中文步骤"。守卫只认"这个键登记过"，
 *      不认"两张表都有"，所以同样看不见。
 *   所以这里按**两张表的键集**自己查一遍；只警告不抛 —— 少一条译文不该让
 *   整个应用起不来。
 */
function reportMissingKeys() {
  // ★ 标记用 ASCII（`[zh]` / `[en]`）而不是中文：这段代码**不在 console 调用的括号里**，
  //   带中文会被覆盖率守卫当成"未覆盖文案"。给人看的那句话写在下面的 console.warn 里
  //   （守卫把 console.* 的实参当开发者文案，规则豁免，不是手工白名单）。
  const missing = []
  for (const def of DEFS) {
    for (const key of keysOf(def)) {
      if (zh[key] === undefined) missing.push(key + ' [zh]')
      if (en[key] === undefined) missing.push(key + ' [en]')
    }
  }
  if (missing.length) {
    console.warn('[skills] 下列文案键没有配齐（[zh]/[en] 标出缺哪张表），'
      + '模型会看到键名或中文：' + missing.join('、'))
  }
}
reportMissingKeys()

export default SKILLS
