/**
 * app-state.js — 壳的共享状态
 *
 * ★ 为什么要单独一个模块，而不是像 crystal 应用那样放在 `main.js` 里：
 *   在 crystal 应用里，页面是 `import { globalData } from '../main.js'` 拿到它的。
 *   那造成一条**反向依赖**：页面（被入口创建）反过来依赖入口。
 *   后果是入口一改，所有页面都得跟着动；而且入口里还会顺带 import 路由、页面、
 *   智能体——循环依赖随时可能成形。提到独立模块后方向是单向的：
 *   入口 → 页面 → 状态。
 */

export const globalData = {
  /** 晶体索引缓存（页面首次用到时惰性填充） */
  crystalIndex: [],
  /** 已加载的晶体数据缓存（避免同一晶体反复解析） */
  crystalCache: {},
  /** 对比页的预设（从库页跳过去时带上） */
  comparePreset: null,
}

export default globalData
