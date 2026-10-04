/**
 * settings-visual.js —— 晶体模块的**视觉设置**（`settings-popup` 的声明式 schema 片段）
 *
 * 上游的独立应用用一整个 `pages/settings.js`（379 行）做这件事：8 项视觉颜色 +
 * 103 个元素的逐元素配色（带周期表视图）+ 自定义取色器。壳里此前**一项都没有**。
 *
 * ★ 这里不搬那个页面，而是把它拆成**声明式 schema**，复用 `ui-kit` 的设置弹层。
 *   理由：弹层已经是"智能体设置 + 界面主题 + 模块参数"的统一入口，
 *   再引入第二个设置界面会有两套交互与两处样式，而且用户要记住"哪个设置在哪个界面"。
 *
 * ★ 值的**真源在模块自己的 localStorage**（`projects/crystal/H5/src/data/settings.js`
 *   的 `crystal_settings` 键），不是宿主的 `chem-agent.settings`。
 *   所以每一项都用 `get`/`set` 外挂过去，弹层只是它的一个**视图**——
 *   若把颜色再存进宿主 store，同一份数据就有两个真源，改一处另一处不变。
 *   （`settings-popup.js` 的 `buildInput`/`collect` 支持这条外挂通道，注释在那边。）
 *
 * ★ 副作用：改了颜色之后**三维场景必须重建**才会生效（颜色是建场景时读的）。
 *   重建由宿主在保存后调用适配器的 `refreshScene()` 完成——
 *   见 `adapters/viewer-page-adapter.js` 里那段说明。
 */
import { t, tr } from './i18n-live.js'
import {
  getVisualColor, setVisualColor, resetVisualColors,
  getElementColor, setElementColor, resetElementColors, getElementColorOverrides,
} from '../../projects/crystal/H5/src/data/settings.js'
import elementsData from '../../projects/crystal/H5/src/data/elements.js'
import { PERIODIC_POS, PERIODIC_COLS, PERIODIC_ROWS, PERIODIC_GAP_ROW, PERIODIC_ROW_LABELS } from './periodic-layout.js'

/**
 * 8 项视觉颜色。键名与 `data/settings.js` 的 `DEFAULT_VISUAL_COLORS` 一一对应
 * （对不上不会报错，只会"改了没反应"——所以这里逐项列出，不靠遍历猜）。
 */
export const VISUAL_COLOR_KEYS = [
  { key: 'bgColor', label: '三维背景色', hint: '讲密堆积时浅底更接近教材插图；但近白色的元素（氢）会看不清' },
  { key: 'wireframeColor', label: '晶胞线框色', hint: '晶胞棱的颜色' },
  { key: 'octahedralColor', label: '八面体空隙色', hint: '打开「八面体空隙」图层后看到的多面体' },
  { key: 'tetrahedralColor', label: '四面体空隙色', hint: '打开「四面体空隙」图层后看到的多面体' },
  { key: 'latticePointColor', label: '点阵点色', hint: '只有"点"没有"球"的那一层——点阵型式的直观来源' },
  { key: 'auxiliaryLineBodyColor', label: '体对角线色', hint: '立方晶系判定的关键线' },
  { key: 'auxiliaryLineFaceColor', label: '面对角线色', hint: '面心立方的"面对角线相切"靠它讲' },
  { key: 'hydrogenBondColor', label: '氢键色', hint: '冰、氢氟酸等分子晶体里的虚线' },
]

/**
 * 逐元素配色。
 *
 * ★ 覆盖的取值语义（与上游一致）：置空字符串表示"取消覆盖、回到默认 CPK 配色"，
 *   而不是"把颜色设成黑色"。`getElementColor()` 的实现正是
 *   「用户覆盖 > 默认」，所以取消覆盖只需删掉那一项。
 *
 * ★ 2026-10-05：除颜色外**多带三个字段**（`name` / `period` / `group`），
 *   供弹层把格子摆成**元素周期表**并在格子里写元素符号：
 *   · `name`   元素中文名（已翻译）—— 用作 tooltip 与格子内的第二行
 *   · `period` / `group` 来自 `periodic-layout.js` 的行列；缺位置时为 undefined，
 *     弹层会退化成原来的密集网格（不会因为位置表缺一项就画不出来）。
 *
 * @returns {{key:string,label:string,color:string,name:string,period:number|undefined,group:number|undefined}[]}
 */
export function elementColorItems() {
  const overrides = getElementColorOverrides()
  return Object.keys(elementsData)
    .map((sym) => {
      const e = elementsData[sym] || {}
      // ★ 这一串是**拼出来的**（符号 + 元素名 + 原子序数 + 自定义标记），
      //   所以整串过不了字典，必须逐段走 t()/tr()：
      //   「（1号）」在英文里要写成「(No. 1)」，靠翻译一个"号）"是拼不出来的。
      const mark = overrides[sym] ? tr(' · 已自定义') : ''
      const pos = PERIODIC_POS[sym]
      return {
        key: sym,
        label: e.atomicNumber
          ? t('crystal.elem.item', { sym, name: tr(e.name || ''), n: e.atomicNumber }) + mark
          : (sym + ' ' + tr(e.name || '')).trim() + mark,
        color: getElementColor(sym),
        order: e.atomicNumber || 999,
        name: tr(e.name || ''),
        period: pos ? pos[0] : undefined,
        group: pos ? pos[1] : undefined,
      }
    })
    .sort((a, b) => a.order - b.order)
}

/**
 * 组装成模块的 `settings` 片段。
 *
 * @returns {Object[]} schema 条目（喂给 ui-kit 的 settings-popup）
 */
export function visualSettings() {
  const colors = VISUAL_COLOR_KEYS.map(({ key, label, hint }) => ({
    key: 'vc_' + key,
    label,
    type: 'color',
    hint,
    // 外挂到模块自己的存储：弹层是视图，不是副本
    get: () => getVisualColor(key),
    set: (v) => setVisualColor(key, v),
  }))

  colors.push({
    key: 'elementColors',
    label: '逐元素配色',
    type: 'palette',
    hint: '按周期表点一个元素选中它，再取色即生效；「恢复默认配色」清空全部自定义',
    items: () => elementColorItems(),
    set: (sym, color) => setElementColor(sym, color),
    reset: () => resetElementColors(),
    /**
     * ★ 布局提示：让弹层把格子摆成**周期表**（而不是原来的 16 列密集网格）。
     *   原先 103 个纯色块看不出"哪格是哪个元素"，只能靠悬浮提示逐个试 ——
     *   用户报的就是这一点。周期表自带"位置即身份"，再在格子内写上元素符号就够了。
     */
    layout: 'periodic',
    layoutCols: PERIODIC_COLS,
    layoutRows: PERIODIC_ROWS,
    layoutGapRow: PERIODIC_GAP_ROW,
    rowLabels: PERIODIC_ROW_LABELS,
  })

  return colors
}

/** 「重置全部视觉颜色」——供宿主在需要时提供一键还原 */
export function resetVisual() {
  resetVisualColors()
}

export default visualSettings
