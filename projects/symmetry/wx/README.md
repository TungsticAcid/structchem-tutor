# 对称视界 · 微信小程序版（Symmetry Viewer Mini Program）

由 `H5`（three.js 网页版）迁移而来的微信小程序：识别并 3D 展示**分子对称元素、点群**，面向微信小程序（Android / iOS / 鸿蒙 / PC·Mac 微信客户端 / 开发者工具）。
纯前端、无后端、纯 WebGL（`threejs-miniprogram` 适配版 three.js）。

> 教学定位参考 `fig/预期效果图`：「36 分子 · 18 点群」。本版内置全部 26 个有机/无机分子示例，覆盖 C1/C2/Cs/Ci、Cnv/Cnh/Dn/Dnh/Dnd、Sₙ、Td/Oh/Ih、C∞v/D∞h 等点群。

## 目录结构

```
wx/
├── project.config.json          # 微信项目配置（含 npm 构建 packNpmRelationList）
├── verify-logic.mjs             # Node 纯逻辑回归自测（点群识别，无需微信）
└── miniprogram/
    ├── app.js / app.json / app.wxss
    ├── miniprogram_npm/threejs-miniprogram/   # 已构建的 npm（three 适配版）
    ├── package.json             # 依赖声明（threejs-miniprogram），"type":"module"
    ├── lib/                     # 业务逻辑 + 渲染（由 H5 移植/适配）
    │   ├── three-context.js     # scoped THREE 单例（ESM 活绑定）
    │   ├── canvas.js            # wx.createOffscreenCanvas 文字精灵
    │   ├── materials.js / scene-builder.js / symmetry-draw.js / animation.js
    │   ├── settings.js / i18n.js / app-state.js / app-logic.js / panel-data.js / orbit-info.js
    │   ├── structure.js / lattice.js / elements.js
    │   ├── parsers/             # XYZ 解析器
    │   └── symmetry/            # 点群识别/命名/特征标表/群操作（纯逻辑，1:1 移植）
    ├── data/examples.js         # 内置分子示例（仅分子，去晶体）
    ├── components/viewer-canvas/ # 3D 查看器组件（三.js WebGL，触摸+鼠标）
    ├── pages/index/             # 落地页
    ├── pages/viewer/            # 主查看器（3D + 面板 + 底部五页签 + 设置 + 动画）
    └── images/logo.png
```

## 运行（微信开发者工具）

1. **导入项目**：微信开发者工具 → 导入 → 选择 `wx/` 目录（AppID 用 `wx/wx.project.config.json` 中的 `wxa0d3a5ad42a980b6`，或改为你自己的）。
2. **构建 npm**：由于 `miniprogram_npm/threejs-miniprogram` 已随仓库提供，通常可直接运行；若需重建：工具 → 构建 npm（`project.config.json` 已配置 `packNpmRelationList` 指向 `miniprogram/`）。
3. **编译预览**：落地页 →「进入」→ 主查看器。

## 功能与操作

- **落地页**：logo / 标题 / 特性 / 中英切换 / 进入。
- **主查看器**（底部五页签）：
  - `分子 Molecules`：分子库（按点群族排序，点群列 + 分子名列），点击切换。
  - `元素 Elements`：信息面板（名称/化学式/点群符号/对称元素分组树，勾选显隐、▶ 播放）。
  - `操作 Operations`：播放对称操作教学动画（▶/⏸、⏮ 逆变换、⏭ 再次操作、⟲ 重置、✕ 关闭 + 进度拖拽）。
  - `点群 Point Group`：点群符号 + 特征标表。
  - `更多 More`：外观设置（语言/背景/原子缩放/键粗细/对称元素大小/标签字号/旋转速度/动画时长/元素·对称元素颜色/恢复默认）+ 显示开关。
- **3D 手势**：单指旋转 · 双指缩放/平移/滚转 · 双击复位；PC/开发者工具支持鼠标左键旋转、右键平移、滚轮缩放。
- **单击原子**：高亮该原子，显示**等价原子（轨道）**与**稳定化子**，其余虚化。

## 逻辑回归自测（无需微信）

```bash
cd wx
node verify-logic.mjs        # 断言 19 个示例分子的点群识别结果
```

迁移将 `symmetry/*`、`core/*`、`data/elements.js` 等**零浏览器依赖**的纯逻辑 1:1 复制，渲染层（scene-builder / symmetry-draw / animation）改用 `threejs-miniprogram` 的 scoped THREE 与 `wx.createOffscreenCanvas` 文字精灵；引用源：`H5/src`。

## 多端适配

- 布局使用 `rpx` + flex；底部导航与浮层采用 `env(safe-area-inset-*)` 适配刘海屏。
- 画布尺寸经 `createSelectorQuery().boundingClientRect()` + 设备 `pixelRatio` 动态计算。
- 小程序随微信客户端覆盖 Android / iOS / 鸿蒙 / Windows / macOS；触摸 + 鼠标双通道。
