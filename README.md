# chem-agent

结构化学教学智能体 —— **一个中枢 + N 个可插拔教学工具**。

> 本仓库由 `crystal`、`orbit`、`symmetry` 三个独立项目于 2026-09-24 合并而来。
> 当前三个模块都已接入统一前端。

仓库：<https://github.com/TungsticAcid/structchem-tutor>

---

## 现在是什么形态

| 层 | 说明 |
|---|---|
| 统一前端 | `apps/web`：首页门户、模块页、对比页、库页；深浅主题、中英双语、响应式布局 |
| 智能体中枢 | `packages/agent-core`：LLM 客户端 · 对话循环 · 感知 · 分镜 · 工具注册 · 决策节点权限 |
| 三个教学模块 | `modules/crystal`、`modules/orbit`、`modules/symmetry`：数据 · 门面 · 工具 · 动作词汇表 |
| 共享表现层 | `packages/ui-kit`（令牌/构件/设置）+ `packages/viewer`（相机/手势/晶体几何） |
| 内容资产 | `packages/knowledge`（三模块知识条目）+ `packages/skills`（通用与模块专属技能） |

三个模块的定位：

- **轨道视界**：氢原子/类氢轨道、量子数与节点、实轨道与复轨道、电子云与概率密度；
- **点群观鉴**：分子对称性、对称元素与操作、点群判定、特征标表与群论练习；
- **晶典在线**：23 种晶体结构、晶胞与点阵、图层/截面/配位、晶体对比。

智能体面板提供讲解、出题、判卷、演示编排与主动建议；权限由决策节点决定，不由模块自行决定。

---

## 目录结构

```text
chem-agent/
├── apps/
│   └── web/                    统一前端：Vite 入口 + shell（路由/主题/智能体面板）+ pages + 测试
├── packages/
│   ├── agent-core/             智能体中枢：core / nodes / registry / ui / store / tools
│   ├── module-contract/        模块能力契约与宿主需求校验
│   ├── i18n/                   多语言运行时
│   ├── knowledge/              crystal / orbit / symmetry / shared 知识条目
│   ├── skills/                 common + 各模块专属教学技能
│   ├── ui-kit/                 设计令牌 · 基础构件 · 设置弹层
│   └── viewer/                 三维外壳：四元数相机 · 指针手势 · 晶体几何
├── modules/                    ★ 三个模块的活实现（纯逻辑可在 Node 直接测试）
│   ├── crystal/                data · adapters · demo · quiz · store · tools
│   ├── orbit/                  core · render · demo · store · tools
│   └── symmetry/               core · data · engine · render · store · tools · ui · i18n
├── projects/                   三个原项目代码（过渡期；crystal 的部分视图仍被 apps/web 复用）
├── tools/                      仓库级脚本：构建 · 截图 · i18n · 验收
└── LICENSE
```

> `projects/` 是合并初期的原样代码，不是新增功能的入口；活的模块实现、门面与工具都在
> `modules/`。
>
> 仓库只发布程序与用户可见内容；设计、备案与运维资料只保留在维护者本地，不随仓库发布。

---

## 三个核心概念

### 1. 模块（Module）

一个教学工具 = 一个模块。模块可以是 `full`（完整数据集 + 三维渲染 + 出题引擎 + 专属教学法，
如现有三个模块），也可以是 `lite`（计算器 + 少量知识条目）。

模块通过 `packages/module-contract` 的可执行契约接入中枢：
必须提供 `getSnapshot`、`applyActions` 等门面能力；能力缺失时**如实降级**，而不是假装可用。
模块只声明"我能做什么"，**不决定"谁有权限调用我"**。

新增模块的落点与接入清单见 `packages/module-contract/index.js`，不要在 README 里另抄一份。

### 2. 决策节点（Decision Node）

一次教学交互会经过若干决策点，每个节点有独立的工具白名单与禁止项：

| 节点 | 职责 |
|---|---|
| `route` | 意图分流 |
| `explain` | 知识讲解（可边讲边演示） |
| `quiz` | 出题（不能操控视图） |
| `grade` | 判卷与错因诊断 |
| `demo` | 演示编排（每步必须写旁白） |
| `teach` | 教学法执行（受技能自身的 when/exit/cautions 约束） |
| `proactive` | 主动介入（只提议，不执行） |
| `compare` | 结构对比（id 禁止编造） |

节点定义与权限的唯一真源：`packages/agent-core/nodes/constraints.js`。

### 3. 工具白名单（Tool Whitelist）

> **每个决策节点的能力边界，由它能调用哪些工具来定义。**

约束不在提示词里写"请不要…"，而是在工具注册阶段过滤：出题节点的工具列表里根本没有
`applySceneActions`，模型看不到、调不到，"出题时不要乱动画面"因此不需要靠文字提醒。

| 类别 | 含义 | 授权策略 |
|---|---|---|
| `read` | 感知状态与行为轨迹 | 无副作用，默认全开 |
| `query` | 取事实（数据、知识、技能） | 无副作用，默认全开 |
| `hand` | 改变用户眼前的画面 | 按节点授权 |
| `teach` | 教学流程（出题/判分/诊断/评估） | 按节点授权 |

模块只能往类别里放工具，权限由中枢裁决。

---

## 快速开始

```bash
# 依赖（three + vite 装在仓库根：源码分布在 packages/ modules/ projects/ apps/ 下）
npm install

# 全部自检：密钥守卫 · i18n · 共享核 · ui-kit · viewer · 数据 · 三模块 · 统一壳
npm test

# 统一前端（Vite 配置里端口固定为 3001）
cd apps/web
npm run dev                       # → http://localhost:3001

# 生产构建：输出静态站点 apps/web/dist
node tools/build-web.mjs
```

实机验证（真实浏览器：截图 / 抓控制台报错 / 执行表达式）：

```bash
node tools/screenshot.mjs --console
node tools/screenshot.mjs --wait-for "window.__chemAgent" --out tmp/shot.png
```

逐项功能验收（**会调用真实 LLM、消耗额度，故不进 `npm test`**）：

```bash
npm run verify:live -- --key-file "<仓库外的密钥文件>" --dry   # 零额度：只验接线
npm run verify:live -- --key-file "<仓库外的密钥文件>"          # 真跑三层断言
```

> 密钥只从仓库外的文件读取，不写入仓库、不打印到输出。

---

## 知识库与命名

知识条目按模块存放：`packages/knowledge/<module>/entries/`（或该模块约定的单文件）。
每个知识库"该写什么、来源在哪"写在各目录的 `README.md`，不在根 README 重复。

条目 id 一律带命名空间：

```text
crystal:C4-2     晶体模块
orbit:K3-1       轨道模块
symmetry:P2-3    对称模块
shared:S1-2      总知识库
```

> `orbit` 用 `K1`–`K10` 表示原子轨道知识点；晶体模块此前也用 `K`，已于 2026-09-24 改为
> `C1`–`C8`，避免两套 K 撞名。

通用教学技能不带命名空间，放在 `packages/skills/common/`，供各模块共用。

---

## 内容与契约

| 位置 | 内容 |
|---|---|
| `packages/knowledge/<module>/README.md` | 各知识库的骨架、素材来源与写作要求 |
| `packages/module-contract/index.js` | 模块必须提供的能力契约（可执行，不只是文档） |
| `packages/skills/` | 通用教学技能与各模块专属技能 |

> 设计、备案与运维资料在维护者本地保存，不随仓库发布，因此 README 不引用它们。

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
| 统一前端 | ✅ 首页门户 + 三模块页 + 对比页/库页；深浅主题、中英双语；真实浏览器已验证 |
| 三个教学模块 | ✅ 全部接入统一壳（crystal / orbit / symmetry） |
| 中枢与共享层 | ✅ 模块契约 · 决策节点 · 模块注册 · 对话/分镜 · 面板 · ui-kit · viewer |
| 内容资产 | ✅ 三模块知识条目与技能已入库 |
| 测试 | ✅ `npm test` 全绿（单项与断言数以命令输出为准） |
| 构建/部署 | ✅ `node tools/build-web.mjs` 产出静态 `apps/web/dist` |

---

## License

MIT
