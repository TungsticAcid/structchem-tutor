/**
 * 晶体**能力**判据 —— 只此一处。
 *
 * ★★ 2026-10-12（用户："没空隙显示功能的结构，设置中就不要显示空隙显示了；
 *   有氢键的结构，设置中也应可控制氢键的显隐"）：
 *   这条要求对**查看页**与**对比页**都成立，而两页原先各自判断：
 *     · 查看页 viewer.js：`TEACHING_STACKING_IDS = ['fcc','hcp']`（写死的白名单）；
 *     · 对比页 compare.js：空隙项**无条件显示** ✗、氢键用**左侧**晶体的标志 ✗。
 *   ⇒ 抽到这里，两边都消费同一个判据（"同一个事实写两处"是本仓库反复踩的坑）。
 *
 * ★ 判据取自**晶体数据本身**，能不用白名单就不用：
 *   · `octahedral` / `tetrahedral` —— 只有最密堆积（fcc / hcp）的数据里才有；
 *     没有这些数据的结构（NaCl、冰…）就算打开了空隙图层也什么都看不见 ✗。
 *   · `hydrogenBonds` —— 只有真的含氢键的晶体才有这一项数据。
 *   ★ 唯一保留的白名单是"分子晶体"：它是**分类**而不是某块数据里的字段，
 *     而 `hydrogenBonds` 不能代替它（CO2 / I2 是分子晶体但不含氢键）。
 */

/** 分子晶体（决定"键"开关显不显示：分子内是共价键、绘制方式不同） */
export const MOLECULAR_CRYSTAL_IDS = ['co2', 'ice', 'i2', 'urea']

/**
 * 一块晶体的能力。
 * @param {string} id    晶体 id
 * @param {Object} data  晶体数据（可为空）
 * @returns {{interstices:boolean, hydrogenBonds:boolean, molecular:boolean}}
 */
export function crystalCaps(id, data) {
  const d = data || {}
  // ★ 空隙数据是**嵌套**的：`interstices: { octahedral: {...}, tetrahedral: {...} }`（实测）
  //   —— 第一版我按顶层字段判，结果 fcc 也显示"没有空隙图层" ✗（正例当场抓到）。
  //   两种形状都兼容，免得数据搬家又静默失效。
  const it = d.interstices || {}
  const interstices = !!(it.octahedral || it.tetrahedral || d.octahedral || d.tetrahedral)
  return {
    interstices,
    hydrogenBonds: !!(d.hydrogenBonds && d.hydrogenBonds.length),
    molecular: MOLECULAR_CRYSTAL_IDS.includes(id),
  }
}

/** 这块晶体有没有空隙图层可显示（面板上要不要给"八面体/四面体空隙"开关） */
export function hasIntersticeData(id, data) {
  return crystalCaps(id, data).interstices
}

export default crystalCaps
