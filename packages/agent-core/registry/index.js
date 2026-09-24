/**
 * index.js — 模块注册入口
 *
 * 新增模块只需两步：
 *   1. 在 descriptors/ 下新建描述文件（可复制 _template-lite.js）
 *   2. 在下方 MODULES 数组里加一行
 *
 * 模块规模从"完整应用"到"单个计算器"都支持，见 descriptors/_template-lite.js。
 */
import { registerModule, _reset } from './modules.js';

import crystal from './descriptors/crystal.js';
import orbit from './descriptors/orbit.js';
import symmetry from './descriptors/symmetry.js';
// 将来：晶体场、休克尔分子轨道等零散工具在此登记

/** 全部模块描述（顺序即展示顺序） */
const MODULES = [
  crystal,
  orbit,
  symmetry,
];

/** 注册全部模块（幂等：重复调用会先清空） */
export function registerAll() {
  _reset();
  for (const m of MODULES) registerModule(m);
  return MODULES.length;
}

export { _reset };
export * from './modules.js';
