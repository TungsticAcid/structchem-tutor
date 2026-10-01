/**
 * agent-bridge.js — 页面 ↔ 统一核之间的接缝
 *
 * ★ 为什么需要这层：crystal 的页面（`index/viewer/compare.js`）原本 import 的是
 *   它自己那份 `../agent/view-registry.js`，那个版本是**单槽位**的
 *   （`let current = null`）。统一壳里同时挂载多个模块的视图，单槽位下
 *   后注册的会顶掉先注册的——表现为"切到另一个模块后，原模块的动作不生效了"。
 *
 *   统一核里的 `view-registry.js` 已改成按模块 id 索引。本文件把页面的
 *   旧调用形状（两参数、不带模块 id）**适配**到新形状（三参数），
 *   于是页面源码不必逐个改——它们本来也不该知道"自己是哪个模块的视图"之外的事。
 *
 * ★ 模块 id 写死为 'crystal' 是刻意的：这份 bridge 属于**晶体页面的接缝**。
 *   将来 orbit 的页面前缀会引入它自己的 bridge（或者直接调新 API 并传 'orbit'）。
 *   用一个共享的可变"当前模块"变量会更省事，但那正是单槽位的老路——
 *   两个模块的页面同时存在时就分不清了。
 */

import {
  registerView, unregisterView, getAdapter, getPage, hasView,
  listModulesWithView, onAdapterChange,
} from '@core/view-registry.js'

/** 本文件服务的模块 id */
const MODULE_ID = 'crystal'

/** 注册一个可驱动的视图页（crystal 页面的旧调用形状） */
export function registerViewerPage(page, adapter) {
  return registerView(MODULE_ID, page, adapter)
}

/** 注销（crystal 页面的旧调用形状） */
export function unregisterViewerPage(page) {
  return unregisterView(MODULE_ID, page)
}

/** 取晶体模块当前的适配器 */
export function getCrystalAdapter() {
  return getAdapter(MODULE_ID)
}

/** 取晶体模块当前注册的页面实例 */
export function getCrystalPage() {
  return getPage(MODULE_ID)
}

/** 晶体模块是否已有可驱动的视图 */
export function hasCrystalView() {
  return hasView(MODULE_ID)
}

export { onAdapterChange, listModulesWithView, getAdapter }
export default { registerViewerPage, unregisterViewerPage, getCrystalAdapter, getCrystalPage, hasCrystalView }
