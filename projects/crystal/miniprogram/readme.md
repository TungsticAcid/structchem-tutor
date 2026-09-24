# 晶体结构 3D 可视化

面向结构化学教学的微信小程序，以三维交互方式展示晶体结构、原子堆积方式、空隙位置、点阵型式与对称元素。

## 技术栈

- **框架**: 微信小程序原生
- **3D 引擎**: Three.js（[threejs-miniprogram](https://github.com/wechat-miniprogram/threejs-miniprogram) v0.0.8）
- **渲染**: WebGL Canvas
- **AI 能力**: 微信小程序 Agent Skills（晶体搜索、问答、结构对比）

## 项目结构

```
crystal/
├── app.js / app.json / app.wxss     # 小程序入口与全局配置
├── pages/
│   ├── index/                       # 首页 — 晶体列表、分类筛选
│   ├── viewer/                      # 3D 查看器 — Canvas 渲染与控制面板
│   ├── compare/                     # 对比视图 — 并排对比两个晶体结构
│   └── settings/                    # 全局设置 — 元素颜色自定义
├── components/
│   ├── viewer-canvas/               # 3D 画布 — Three.js 场景、交互、渲染循环
│   ├── layer-control/               # 控制面板 — 图层开关、滑块、视角按钮
│   ├── atom-info-popup/             # 原子/空隙信息弹窗
│   ├── crystal-card/                # 晶体缩略图卡片（首页）
│   └── navigation-bar/              # 自定义导航栏
├── lib/
│   ├── scene-builder.js             # 场景构建 — 原子/线框/键/空隙/对称/点阵点
│   ├── geometry-utils.js            # 晶格几何 — 分数坐标转换、线框顶点、六棱柱
│   ├── crystal-loader.js            # 晶体数据加载器
│   ├── touch-handler.js             # 触摸手势识别
│   └── three-adapter.js             # Three.js 小程序适配封装
├── data/
│   ├── crystalIndex.js              # 晶体元信息索引（23 种）
│   ├── elements.js                  # 元素属性数据库（89 种元素）
│   ├── settings.js                  # 用户设置持久化存储
│   └── crystals/                    # 晶体结构 JS 数据（23 种）
├── skills/
│   └── crystal-skill/               # AI Agent 技能 — 智能搜索/问答/对比
├── tools/                           # 辅助脚本（晶体数据生成、验证）
├── page-meta.json                   # 页面元数据（供 AI Agent 使用）
├── PRD.txt                          # 产品需求文档
└── package.json                     # 依赖配置
```

## 已配置晶体结构

### 金属晶体

| ID | 名称 | 化学式 | 晶系 | 空间群 | 说明 |
|------|------|------|------|------|------|
| `fcc` | Cu 型 | Cu | 立方 | Fm-3m | A1 立方最密堆积 (FCC) |
| `bcc` | α-Fe 型 | Fe | 立方 | Im-3m | A2 立方体心堆积 (BCC) |
| `hcp` | Mg 型 | Mg | 六方 | P6₃/mmc | A3 六方最密堆积 (HCP) |

### 离子晶体

| ID | 名称 | 化学式 | 晶系 | 空间群 |
|------|------|------|------|------|
| `naCl` | NaCl（岩盐）型 | NaCl | 立方 | Fm-3m |
| `csCl` | CsCl 型 | CsCl | 立方 | Pm-3m |
| `fluorite` | CaF₂（萤石）型 | CaF₂ | 立方 | Fm-3m |
| `perovskite` | CaTiO₃（钙钛矿）型 | CaTiO₃ | 立方 | Pm-3m |
| `pyrite` | FeS₂（黄铁矿）型 | FeS₂ | 立方 | Pa-3 |
| `reo3` | ReO₃ 型 | ReO₃ | 立方 | Pm-3m |

### 共价晶体

| ID | 名称 | 化学式 | 晶系 | 空间群 |
|------|------|------|------|------|
| `diamond` | 金刚石型 | C | 立方 | Fd-3m |
| `zincBlende` | 立方 ZnS（闪锌矿） | ZnS | 立方 | F-43m |
| `wurtzite` | 六方 ZnS（纤锌矿） | ZnS | 六方 | P6₃mc |
| `rutile` | TiO₂（金红石）型 | TiO₂ | 四方 | P4₂/mnm |
| `nias` | NiAs（红镍矿）型 | NiAs | 六方 | P6₃/mmc |
| `quartz` | α-石英 | SiO₂ | 三方 | P3₂21 |
| `cristobalite` | 方石英（白硅石） | SiO₂ | 立方 | Fd-3m |

### 分子晶体

| ID | 名称 | 化学式 | 晶系 | 空间群 |
|------|------|------|------|------|
| `co2` | 干冰 | CO₂ | 立方 | Pa-3 |
| `ice` | 冰 | H₂O | 六方 | P6₃/mmc |
| `i2` | 碘 | I₂ | 正交 | Cmca |
| `urea` | 尿素 | CO(NH₂)₂ | 四方 | P-42₁m |

### 混合键型晶体

| ID | 名称 | 化学式 | 晶系 | 空间群 |
|------|------|------|------|------|
| `graphite` | 六方石墨 | C | 六方 | P6₃/mmc |
| `rhomboGraphite` | 三方石墨 | C | 三方 | R-3m |
| `cdi2` | CdI₂ 型 | CdI₂ | 六方 | P-3m1 |

## 功能特性

### 显示模型
- **CPK 空间填充**：原子以范德华半径渲染，展示原子实际占位
- **球棍模型**：原子缩小，化学键以圆柱体连接，清晰展示配位关系

### 晶胞显示
- **对称基元**：仅显示不对称单元中的原子
- **完整晶胞**：展开显示完整晶胞所有原子（包含边界原子）

### 图层控制
- **原子**：整体显隐 + 每种元素独立显隐（如 NaCl 中只看 Cl⁻）
- **晶胞线框**：惯用胞线框（立方体/六棱柱）
- **空隙**：八面体空隙（橙色）、四面体空隙（蓝色），仅 A1-A4 堆积结构可用
- **对称元素**：旋转轴（彩色圆柱体）、镜面（半透明平面）
- **化学键**：自动检测最近邻成键（球棍模式）
- **点阵点**：自动识别 P/I/F/C/H 点阵型式，展示点阵点位置
- **坐标轴**：红(X)/绿(Y)/蓝(Z) 指示方向

### 交互操作
- **触摸**：单指旋转、双指缩放/平移、点击查看原子信息、双击重置视角
- **PC 鼠标**：左键拖动旋转、右键拖动平移、滚轮缩放

### 其他
- 预设视角（俯视/正视/侧视/等轴）
- 透视/正交投影切换
- 原子大小、透明度、化学键粗细可调
- 原子分数坐标平移
- 原子点击弹窗（元素名称、原子序数、电子排布、电负性等）
- **晶体对比**：并排展示两个晶体结构，支持联动/独立交互与独立样式控制
- **AI Agent 集成**：通过 `skills/crystal-skill` 提供晶体智能搜索、分类浏览、结构详情问答与对比推荐

## 晶体数据格式

```json
{
  "id": "naCl",
  "name": "NaCl（岩盐/氯化钠）",
  "formula": "NaCl",
  "crystalSystem": "cubic",
  "spaceGroup": "Fm-3m",
  "lattice": { "a": 5.62, "b": 5.62, "c": 5.62, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "Na",
      "color": "#4285F4",
      "radius": 1.02,
      "positions": [[0, 0, 0], [0, 0.5, 0.5], ...]
    }
  ],
  "interstices": {
    "octahedral": { "color": "#FFB74D", "radius": 0.5, "positions": [...] },
    "tetrahedral": { "color": "#4FC3F7", "radius": 0.35, "positions": [...] }
  },
  "symmetry": {
    "axes": [{ "type": "4-fold", "color": "#E91E63", "direction": [0,0,1], "position": [0,0,0] }],
    "mirrors": [{ "color": "rgba(255,255,255,0.3)", "normal": [1,0,0], "distance": 0 }]
  }
}
```

## 开发

### 环境要求
- 微信基础库 ≥ 2.20.0
- iOS 12+ / Android 8+
- 微信开发者工具

### 运行
1. 用微信开发者工具打开项目目录
2. 点击「编译」运行

### 添加新晶体
1. 在 `data/crystals/` 下创建 JS 文件，参照上述格式编写数据（原子坐标为分数坐标）
2. 在 `data/crystalIndex.js` 中添加索引条目（含分类、缩略图等元信息）
3. 在 `lib/crystal-loader.js` 中导入并注册到 `crystalMap`

## 许可

MIT License — 教学用途，非商业项目。
