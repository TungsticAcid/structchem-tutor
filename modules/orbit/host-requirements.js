/**
 * host-requirements.js —— 原子轨道模块向**宿主**索取什么
 *
 * ★ 这份清单**全都是 required:false**，而这同样是实测结论，不是偷懒：
 *   本模块的结构性特征是"运行时由页面创建"（见 facade.js 与重构计划 P7）。
 *   模块自己不 new 任何东西，全部教学类能力都是**注入**进去的；
 *   不注入时工具**如实为空**（`test-orbit-module.mjs` 有一条断言守着这件事：
 *   `createModule({})` 里必须没有 generateQuestion 这个名字）。
 *
 *   所以"必需能力"这个概念在本模块里几乎不适用——
 *   宿主少给一样，模块少一块能力，但**永远能跑**，且自己会说清楚少了什么。
 *   这正适合放进 degraded 清单报给宿主，而不是当成启动失败。
 *
 * ★ 三个方向别混淆（本模块三者都有，这与另两个模块不同）：
 *   ① 宿主 → 模块（本文件）：createModule 的 opts，装配期一次性校验
 *   ② 模块 ← 页面：`attach(runtime)` —— 运行时**后到**，故不在本清单里
 *      （放进来的话会被永久判为"缺失"，因为装配时它必然还没有）
 *   ③ 模块 → 宿主（facade.js）：模块提供什么
 */
export const HOST_REQUIREMENTS = [
  {
    key: 'quiz',
    required: false,
    note: '出题引擎。缺省时 generateQuestion / 判分 / 错因诊断那 8 个 teach 类工具'
      + '**如实为空**——descriptor 里也相应地把它们放在 plannedTools。',
  },
  {
    key: 'diagnosis',
    required: false,
    note: '错因诊断（通常给 core/error-diagnosis.js 的实例）。缺省时 diagnoseError 不存在。',
  },
  {
    key: 'mastery',
    required: false,
    note: '掌握度模型。缺省时 updateMastery / 推荐不存在。'
      + '★ 注意它自身还需要一个 storageKey（见 modules/orbit/store/mastery.js 的 configure），'
      + '存储命名空间**必须由宿主注入**，没有缺省值。',
  },
  {
    key: 'skills',
    required: false,
    note: '技能目录。费曼复述的入口要用它取评分要点；缺省时费曼类工具不存在。',
  },
]

export default HOST_REQUIREMENTS
