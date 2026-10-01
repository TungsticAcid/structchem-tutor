# chem-agent

结构化学教学智能体 —— 一个中枢 + N 个可插拔教学工具。

> 本仓库由三个独立项目整合而来（2026-09-24），目标是把分散的化学教学可视化工具
> 汇聚到一个统一的智能体之下，让用户不需要知道"这个功能在哪个工具里"。

---

## 目录结构

```
chem-agent/
├── packages/                     共享层（所有模块共用，学科无关）
│   ├── agent-core/               智能体中枢
│   │   ├── app.js                ★ 装配层：一个中枢 + N 个模块
│   │   ├── core/                 运行时：llm-client · catalog · perception ·
│   │   │                         storyboard · conversation · tool-registry · params
│   │   ├── ui/                   面板 · Markdown+KaTeX 渲染器 · DOM 工具
│   │   ├── contract/             ★ 模块接入契约（必需/可选方法 + 设计原则）
│   │   ├── nodes/constraints.js  ★ 决策节点约束规格表
│   │   ├── registry/             模块注册机制 + 各模块描述（descriptors/）
│   │   └── tools/                自检与测试（selftest · test-core · test-app）
│   ├── ui-kit/                   设计令牌 · 基础构件 · viewport · 设置弹层
│   ├── viewer/                   三维外壳：四元数相机 · 指针手势 · 晶体几何
│   ├── knowledge/                知识库（shared 总库 + 各模块条目）
│   └── skills/                   技能库（common 通用教学法 + 各模块专属）
│
├── modules/                      ★ 模块实现：数据 · 门面 · 工具 · 动作词汇表
│   └── crystal/
│       ├── data/cod/             晶体数据的上游 CIF（取自 COD）与比对报告
│       ├── actions.js            受控动作词汇表 + 参数校验
│       ├── facade.js             模块契约的实现（智能体的"手和眼"）
│       ├── tools.js              工具定义与执行（含程序计算的密度/体积/最近邻）
│       └── index.js              装配入口（交给统一壳的完整模块包）
│
├── apps/
│   └── web/                      ★ 统一前端：一个入口 + 模块视图 + 智能体面板
│
├── projects/                     各教学工具本体（原样，内部结构未动）
│   ├── crystal/                  H5 网页版（视图与数据仍被 apps/web 复用，过渡期）
│   ├── orbit/                    原子轨道工具（待 B4 去全局化后接入）
│   └── symmetry/                 分子对称性工具（待阶段 C 接入）
│
├── docs/                         重构计划 · 变更待评估 · 归档
└── archive/                      （见 docs/archive/）
```

> **过渡期的形态**：`projects/` 下的原项目代码尚未全部收进 `modules/`，
> `apps/web` 通过 `@crystal` 别名引用 crystal 的视图与数据。收编进度见
> [docs/重构计划.md](docs/重构计划.md)。

---

## 三个核心概念

### 1. 模块（Module）

一个教学工具 = 一个模块。模块的规模差异很大：

| 规模 | 例子 | 特征 |
|---|---|---|
| `full` | 晶体结构、原子轨道、分子对称性 | 完整数据集 + 3D 渲染 + 出题引擎 + 专属教学法 |
| `lite` | 晶体场理论、休克尔分子轨道（规划中） | 可能只是一个计算器 + 几十条知识条目 |

**新增一个模块只要两步**：在 `packages/agent-core/registry/descriptors/` 下建一个描述文件
（可复制 `_template-lite.js`），然后在 `registry/index.js` 的数组里加一行。

小模块的必填字段只有三个：`id`、`title`、`capabilities`。

### 2. 决策节点（Decision Node）

一次教学交互会经过若干决策点，每个决策点是一个"节点"：

| 节点 | 职责 | 权限特点 |
|---|---|---|
| `route` | 意图分流 | 只读，不产生教学内容 |
| `explain` | 知识讲解 | 有完整操控权（边讲边演示） |
| `quiz` | 出题 | **不能操控视图** |
| `grade` | 判卷与错因诊断 | 可触发诊断动作，但不得直接给答案 |
| `demo` | 演示编排 | 有完整操控权，每步必须写旁白 |
| `teach` | 教学法执行 | 受技能自身的 when/exit/cautions 约束 |
| `proactive` | 主动介入 | **只提议，不执行** |
| `compare` | 结构对比 | id 禁止编造 |

节点清单与约束定义在 `packages/agent-core/nodes/constraints.js`。

### 3. 工具白名单（Tool Whitelist）—— 约束的实现方式

> **每个决策节点的能力边界，由它能调用哪些工具来定义。**

这是本架构的核心设计。约束不写在提示词的"请不要…"里，而是**在工具注册阶段过滤**：

```
出题节点的工具列表里根本没有 applySceneActions
  → 模型看不到它
  → 也就调不到它
  → 「出题时不要乱动画面」这句话不需要写，因为做不到
```

工具分四类：

| 类别 | 含义 | 授权策略 |
|---|---|---|
| `read` | 感知状态与行为轨迹 | 无副作用，默认全开 |
| `query` | 取事实（数据、知识、技能） | 无副作用，默认全开 |
| `hand` | **改变用户眼前的画面** | 按节点授权 |
| `teach` | 教学流程（出题/判分/诊断/评估） | 按节点授权 |

**模块只能往类别里放工具，不能决定谁有权限** —— 权限由 `nodes/constraints.js` 裁决，
模块无法自行越权。

---

## 快速开始

```bash
# 依赖（three + vite 装在仓库根，因为源码分布在 packages/ modules/ projects/ apps/ 下）
npm install

# 全部自检（1438 项断言：共享核 · ui-kit · viewer · 数据真源 · 模块 · 装配层 · 壳）
npm test

# 统一前端：一个入口，三个模块都已接通
cd apps/web && npm run dev        # → http://localhost:3001

# 实机验证（真实浏览器：截图 / 抓报错 / 执行表达式）
node tools/screenshot.mjs --console
node tools/screenshot.mjs --wait-for "window.__chemAgent" --out tmp/shot.png

# 逐项功能检验（**打真实 LLM，消耗额度，故不进 npm test**）
npm run verify:live -- --key-file "<仓库外的密钥文件>" --dry      # 零额度：只验接线
npm run verify:live -- --key-file "<仓库外的密钥文件>"             # 真跑三层断言
```

> 原模块独立页（过渡期仍在）：`cd projects/crystal/H5 && npm run dev`。
> orbit 已不再需要独立启动 —— 它已是统一壳里的一个模块。

---

## 设计文档

| 文档 | 位置 | 内容 |
|---|---|---|
| 智能体知识资产设计 | `D:\xjl\program\crystal\activity\智能体知识资产设计.md` | 三层知识资产架构、节点约束设计、知识库蒸馏流程 |
| AI 智能体建设方案 | `D:\xjl\program\crystal\activity\AI智能体建设方案.md` | 晶体模块的完整建设方案 |
| 出题引擎技术设计 | `D:\xjl\program\crystal\activity\出题引擎技术设计.md` | 题型模板、干扰项生成、错因体系 |
| 数据核查报告 | `D:\xjl\program\crystal\activity\数据核查报告.md` | 23 种晶体数据的审计与格式化记录 |

> ⚠️ 这四份**在仓库之外**（`D:\xjl\program\crystal\activity\`），不进版本控制 ——
> 它们是参赛材料而非运行代码，而本仓库是公开的。原因详见 `CLAUDE.md` §六。

---

## 命名规范

**知识条目与技能 id 一律带命名空间**，为多模块共存与将来的合并做准备：

```
crystal:C4-2     晶体模块的知识条目
orbit:K3-1       轨道模块的知识条目
shared:S1-2      总知识库
symmetry:P2-3    对称模块
```

> ✅ **已消歧（2026-09-24）**：orbit 用 `K1`–`K9` 表示原子轨道知识点，晶体模块
> 此前也用 `K1`–`K8` 表示晶体知识点 —— 两套 K 含义完全不同。晶体模块已改为
> `C1`–`C8`（条目 id 形如 `crystal:C4-2`），orbit 的 K 保持不变。详见
> 《智能体知识资产设计》§2.2。

---

## 版权约定

知识条目从教材蒸馏时 **必须重写，不得摘录原文**：

- ✅ 吸收事实与逻辑，用自己的语言组织
- ✅ `source` 字段标注教材与章节（属引用）
- ❌ 不复制原文表述、不收录教材习题原文、不上传扫描页

**实操判据**：如果一条目的正文能被搜索引擎匹配到教材原文，说明改写不充分。

---

## 状态

| 部分 | 状态 |
|---|---|
| 三个工具本体 | 已搬入（crystal 网页版已上线；orbit 已上线含完整智能体；symmetry 无智能体） |
| 共享核心：节点约束 | ✅ 27 项自检通过 |
| 共享核心：模块注册 | ✅ 已实现 |
| 共享核心：对话循环等运行时 | ✅ 已从 orbit 抽取，**每项都与原实现双跑比对** |
| 模块契约与装配层 | ✅ 已实现（装配层有 40 条无头端到端断言） |
| 共享表现层 | ✅ ui-kit（令牌/构件/设置）+ viewer（相机/手势/几何） |
| 统一前端 | ✅ `apps/web` 可构建可服务；**浏览器实机渲染待确认** |
| 知识库 | ⏳ orbit 34 条已迁入；晶体 44 条与对称 30–45 条待蒸馏 |
| 技能库 | ✅ 通用 6 个已迁入 |
| **晶体模块** | ✅ 门面 + 工具 + 动作词汇表，已接通统一壳 |
| **轨道模块** | ⏳ 待去全局化（10.6k 行） |
| **对称模块** | ⏳ 引擎与知识资产已在 packages/；UI 壳与接口层待做 |
