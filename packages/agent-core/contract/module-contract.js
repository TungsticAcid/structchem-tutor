/**
 * module-contract.js — 模块契约：一个教学模块要接入统一智能体，必须提供什么
 *
 * ★ 为什么需要一份可执行的契约：三个模块的内部结构差异极大——
 *   · crystal 的 `viewer-canvas.js` 是 894 行的类、状态在实例字段里，
 *     `main.js` 只管路由；**它没有任何"动作"层**，视图变化靠直接改 Three.js 对象
 *   · orbit 的 `main.js` 有 `OrbitApp` facade（getState/applyAction/onAction/
 *     exportViewPNG），是全项目唯一已成型的模块契约，本契约以它为蓝本
 *   · symmetry 的 `main.js` 是 744 行不导出任何东西的单体，连状态都取不到
 *   若只写一段文档说"请实现这些方法"，三者仍会各写各的。故把契约做成
 *   **可校验的函数**：模块自己能在开发期 assertModuleContract(自己的 facade)，
 *   立刻看到缺什么；共享核也能据此给出一份"各模块接入进度"的实况。
 *
 * ★ 契约的分工（别混淆）：
 *   · 契约管**能力**：这个模块能读什么状态、能被人怎样驱动、能导出什么
 *   · constraints.js 管**权限**：哪个决策节点能调用哪些工具
 *   模块只声明能力，权限由节点裁决——模块无法自行越权（CLAUDE.md §一.1）。
 *
 * 参考蓝本：projects/orbit/H5/js/main.js 的 OrbitApp facade（第 479–537 行）。
 */

/** 必需：缺任何一个，模块就无法被智能体驱动 */
export const REQUIRED_METHODS = [
  {
    name: 'getSnapshot',
    sig: '() => Object',
    why: '感知的入口。智能体每轮对话前都要知道"用户此刻在看什么"。'
      + '返回值会被 core/perception.js 深拷贝后差分，故可返回活引用或嵌套对象。',
  },
  {
    name: 'applyActions',
    sig: '(actions: Array<{action, params, speech?}>) => { ok, error?, accepted? } | Promise<同>',
    why: '唯一的"动手"途径。动作**必须**经此方法进入模块，才能被分镜队列编排、'
      + '被快照回退、被 speech 旁白串起来。模块内部直接改视图而不走这里，'
      + '学生就会看到"画面莫名跳了一下"。',
  },
]

/** 可选：有则更好，没有则对应能力不可用（应如实报告，不要假装支持） */
export const OPTIONAL_METHODS = [
  {
    name: 'getInteractionTrace',
    sig: '() => { idleMs, toggleCounts, dwellMs, recentActions }',
    why: '若不提供，感知层仍能从 getSnapshot 的差分得到痕迹（那是默认路径）；'
      + '提供它可给出更精确的停留时长与切换计数。',
  },
  {
    name: 'highlightAtoms',
    sig: '(ids: string[]) => { ok }',
    why: '错因诊断要用（"高亮这几个原子让学生自己看出矛盾"）。'
      + 'grade 节点的诊断动作依赖它。',
  },
  {
    name: 'navigateTo',
    sig: '(target: {view?: string, id?: string}) => { ok }',
    why: '跨视图跳转（如出题后"去看结构"）。compare 节点与 presetView 依赖它。',
  },
  {
    name: 'exportViewPNG',
    sig: '() => dataURL',
    why: '录制演示素材与埋点截图用。',
  },
  {
    name: 'onAction',
    sig: '(cb) => off()',
    why: '订阅视图变化。★ 实现必须支持**多个订阅者**（返回取消函数），'
      + '单槽位会被后注册者静默顶掉——orbit 的 SceneBridge 就踩过这个坑。',
  },
  {
    name: 'sceneVocabulary',
    sig: 'Object 或 () => Promise<Object>',
    why: '动作词汇表。**不进常驻上下文**，由 listSceneActions 一类工具按需拉取'
      + '（这是 token 效率的关键，见重构计划 B6b 的两层工具设计）。',
  },
  {
    name: 'settings',
    sig: 'Array<字段声明>',
    why: '模块自己的小参数（动画速度、标签字号、原子缩放、元素颜色…）。'
      + '用 ui-kit 的 settings-popup 声明式 schema 表达，同一份 schema 既渲染'
      + '设置面板，也可导出为 listModuleSettings 的返回内容。',
  },
  {
    name: 'prompts',
    sig: '{ role?: string, nodeOverrides?: Object }',
    why: '模块的系统提示片段（人格、动作速查、示范脚本）。'
      + '节点约束由 constraints.js 保证，提示里只补"此刻该怎么做"。',
  },
]

/** 全部方法名（供快速查找） */
export const ALL_METHODS = [...REQUIRED_METHODS, ...OPTIONAL_METHODS].map((m) => m.name)

/**
 * 校验一个模块 facade 是否符合契约。
 *
 * @param {Object} facade
 * @param {Object} [opts]
 * @param {string} [opts.label]  模块名（用于错误信息）
 * @returns {{ok: boolean, label: string, missing: string[], missingRequired: string[],
 *            present: string[], warnings: string[]}}
 */
export function assertModuleContract(facade, opts = {}) {
  const label = opts.label || (facade && (facade.id || facade.title)) || '(未命名模块)'
  const missing = []
  const present = []
  const warnings = []

  if (!facade || typeof facade !== 'object') {
    return {
      ok: false,
      label,
      missing: ALL_METHODS.slice(),
      missingRequired: REQUIRED_METHODS.map((m) => m.name),
      present: [],
      warnings: ['facade 不是对象'],
    }
  }

  for (const m of ALL_METHODS) {
    if (typeof facade[m] === 'function' || m === 'sceneVocabulary' || m === 'settings' || m === 'prompts') {
      // 非函数类（词汇表/设置/提示）只要有值即算提供
      if (m === 'sceneVocabulary' || m === 'settings' || m === 'prompts') {
        if (facade[m] != null) present.push(m)
        else missing.push(m)
      } else if (typeof facade[m] === 'function') {
        present.push(m)
      } else {
        missing.push(m)
      }
    } else {
      missing.push(m)
    }
  }

  const missingRequired = REQUIRED_METHODS.map((m) => m.name).filter((n) => missing.includes(n))

  // 常见实现错误的提醒（不是硬性失败，但值得当场指出）
  if (typeof facade.onAction === 'function' && facade.onAction.length === 1) {
    warnings.push('onAction 只声明了一个参数——若内部用单槽位保存回调，'
      + '第二个订阅者会静默顶掉第一个。请改为数组并把取消函数返回给调用方。')
  }
  if (facade.applyActions && !facade.getSnapshot) {
    warnings.push('有 applyActions 但没有 getSnapshot：分镜队列无法在每步前抓快照，'
      + '「上一步」将无法精确还原。')
  }
  if (facade.sceneVocabulary == null && facade.applyActions) {
    warnings.push('缺 sceneVocabulary：模型只能靠猜动作名。')
  }

  return {
    ok: missingRequired.length === 0,
    label,
    missing,
    missingRequired,
    present,
    warnings,
  }
}

/** 契约的文本说明（供文档与开发期打印） */
export function describeContract() {
  const lines = ['模块契约', '═'.repeat(60), '', '必需：']
  for (const m of REQUIRED_METHODS) lines.push(`  ${m.name}${m.sig}`, `      ${m.why}`, '')
  lines.push('可选：')
  for (const m of OPTIONAL_METHODS) lines.push(`  ${m.name}${m.sig}`, `      ${m.why}`, '')
  return lines.join('\n')
}

export default { assertModuleContract, describeContract, REQUIRED_METHODS, OPTIONAL_METHODS, ALL_METHODS }
