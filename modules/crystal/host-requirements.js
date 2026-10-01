/**
 * host-requirements.js —— 晶体模块向**宿主**索取什么
 *
 * 方向：模块 → 宿主（与 facade.js 的「模块提供什么」正好相反）。
 * 由 `createModule` 在装配期经 `enforceHostRequirements` 校验：
 *   · required: true   缺失 → **直接抛错**（不启动，而不是启动后某个功能悄悄不生效）
 *   · required: false  缺失 → 不抛错，但会列入 degraded 清单如实报给宿主
 *
 * ★ 判据：一条需求该不该标 required，看**缺了它模块还能不能被驱动**，
 *   而不是看"理想情况下应该有"。所以这里每条都对着实现核过：
 *     view      → facade 构造时即抛错（且依赖它的 5 个方法）
 *     catalog   → 缺了则 crystalIds 为空集，任何 id 都被判为"未知"，模块等于废的
 *     loadData  → createCrystalTools 构造时即抛错
 *   其余几条是**设计好的降级**（工具如实回"未接入"，而不是给假结果），故为 false。
 *
 * ★ 为什么这些必须是**读取时**校验而不是写进文档：晶体模块要装进两个宿主
 *   （统一壳 `apps/web` 与它自己的独立页）。独立页少接一条，
 *   症状是"某个工具永远不存在"——不报错、不崩、只是能力少一块，谁都不会发现。
 */
export const HOST_REQUIREMENTS = [
  {
    key: 'view',
    required: true,
    note: '视图句柄，须提供 setProps / getProps / setView / resetView / getViewState。'
      + '★ 契约要点：setProps 必须走宿主自己的意图通路（晶体线由 page.applyIntent 保证），'
      + '否则"用户操作"与"智能体操作"会走两条路，撤回、练习守卫都会失效。',
  },
  {
    key: 'catalog',
    required: true,
    note: '晶体索引（crystalIndex：[{id, name, ...}]）。模块用它校验 id 合法性、'
      + '生成 id 清单（listIds）。缺了它，openCrystal 会把每一个 id 都判为"未知"，'
      + '模块看起来在跑，其实一句都答不上来。',
  },
  {
    key: 'loadData',
    required: true,
    note: '(crystalId) => 晶体数据对象。createCrystalTools 构造时即要求它是函数。',
  },
  {
    key: 'quiz',
    required: false,
    note: '出题引擎（createQuizEngine 的返回值）。缺省时 teach 类工具**如实为空**，'
      + '而不是塞一批"尚未实现"的占位工具——交给模型调不动的名字，它只会反复调用然后失败。',
  },
  {
    key: 'compute',
    required: false,
    note: '确定性计算（必须是 tools.js 那一批：密度里有 Z 陷阱守卫，另写一份就会丢）。'
      + '缺省时双晶体对比工具为空。',
  },
  {
    key: 'mastery',
    required: false,
    note: '掌握度模型。缺省时费曼复述评估仍可走，但学情不落盘'
      + '（工具会如实回"本次未接入掌握度模型"）。',
  },
  {
    key: 'skills',
    required: false,
    note: '技能目录。缺省时"发起费曼复述"会如实回"技能库未接入"。',
  },
  {
    key: 'practiceGuard',
    required: false,
    note: '() => Set<图层名>：练习未作答时不许打开的图层。'
      + '★ 缺省时**没有这道闸**——这是刻意的：它不是"能力"，是宿主自己要不要设的纪律。'
      + '但宿主应当知道，不给它就没有结构性防护（提示词劝不住模型）。',
  },
]

export default HOST_REQUIREMENTS
