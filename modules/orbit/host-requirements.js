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
// ★ 这些 note 会随 `hostReport.degraded` 交给宿主去报（见 packages/agent-core/app.js
//   的宿主降级告警），所以它们走 t() 而不是写死中文——写死的话英文界面的告警会是中文。
//   同文件里那句「字典要在任何 t() 之前注册」的说明见 index.js。
import './i18n.js'
import { t } from '../../packages/i18n/index.js'

export const HOST_REQUIREMENTS = [
  {
    key: 'quiz',
    required: false,
    note: t('orbit.host.quiz'),
  },
  {
    key: 'diagnosis',
    required: false,
    note: t('orbit.host.diagnosis'),
  },
  {
    key: 'mastery',
    required: false,
    note: t('orbit.host.mastery'),
  },
  {
    key: 'skills',
    required: false,
    note: t('orbit.host.skills'),
  },
]

export default HOST_REQUIREMENTS
