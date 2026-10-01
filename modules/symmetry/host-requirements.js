/**
 * host-requirements.js —— 对称性模块向**宿主**索取什么
 *
 * ★ 这份清单**刻意为空**，而这不是"还没写"——它本身就是一条结论，值得写下来：
 *
 *   本模块的动作全部落在**它自己的状态**上（"现在展示哪个分子"），
 *   点群识别、对称元素、特征标表全是从结构算出来的纯计算。
 *   所以它与晶体模块最本质的差别是：**它不需要视图**。
 *   页面在 mount 时自己造三维视图、自己订阅 `facade.subscribe` 重绘，
 *   模块层对"外面有没有人画我"一无所知，也不需要知道。
 *
 *   （这一点在上游已经踩过一次：symmetry 曾被写成一个只有两个函数调用的手写页面，
 *   看起来"功能少了好多"。原因是页面没接，而不是模块缺能力——
 *   正因契约是双向的，才能一眼分清该改哪一边。）
 *
 * ★ 空数组**不等于不校验**：`enforceHostRequirements` 仍会被调用（恒通过）。
 *   意义在于"将来要向宿主索取什么，只有这一个地方可写"——
 *   比起到时候四处找该在哪儿声明，这里留一个空位更便宜。
 *   2026-10-01：这里补上了第一条真实需求 `spaceGroup`（见下）。
 *
 * ★ 曾经在这里写着一个**幽灵参数** `onChange`（"状态变化回调，宿主用它驱动视图重绘"）：
 *   文档里有两处声明，实现里零处读取，壳里零处传参。
 *   它已被删除——而不是"补上实现"，因为 facade 已有 `subscribe`（并作为契约可选方法
 *   `onAction` 暴露），再开一条单槽位回调只会把"后注册者顶掉先注册者"的老坑重演一遍。
 */
export const HOST_REQUIREMENTS = [
  {
    key: 'spaceGroup',
    required: false,
    note: '晶体示例的空间群分析器 (structure) => Promise<{number, hmSymbol, pointGroup, '
      + 'crystalSystem, pearsonSymbol, operations}>，外加可选的 operationsToElements。'
      + '★ 为什么必须是注入：实现它的 modules/symmetry/space-group.js 依赖 @spglib/moyo-wasm，'
      + '且用 `…moyo_wasm_bg.wasm?url` 这种 **Vite 专有的导入后缀**，在 Node 里无法静态导入。'
      + '缺省时不报错，但**晶体示例只能回"未接入"**——'
      + '（此前缺省的表现更糟：identify() 返回 {symbol:"ERR"}，模型会把它当成一个真的点群符号。）',
  },
]

export default HOST_REQUIREMENTS
