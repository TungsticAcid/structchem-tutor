# chem-agent 项目约定

结构化学教学智能体 —— **一个中枢 + N 个可插拔教学工具**。

> 完整结构说明见 [README.md](README.md)。本文件只写"必须遵守的约定"。

---

## 〇、当前待办（新会话从这里接手）

> **主线是 [docs/重构计划.md](docs/重构计划.md)**。进度见下方「已完成」。

| # | 任务 | 说明 | 位置 |
|---|---|---|---|
| 1 | **orbit 接入统一壳** | 照 crystal 的样板做 orbit 的模块层（facade/tools/actions）。orbit 是全局脚本、无 ESM，故需先做 B4 去全局化，或先写一层包 `window.OrbitApp` 的视图适配器 | 重构计划 B4/B6 |
| 2 | **symmetry 收进 modules/** | 引擎 2733 行仍在 `projects/symmetry/H5/src/symmetry/`；对称性的 UI 壳要重写、接口层要新建（阶段 C） | 重构计划 B7 收尾/阶段 C |
| 3 | **写知识条目** | 晶体约 44 条（C1–C8）＋ 对称 30–45 条（P1–P5）＋ 总库对称性基础；从 `D:\xjl\study\books\化学电子书籍` 重写（关键两本是**扫描件无文字层**，须用 pymupdf 渲染成图后读图重写） | [packages/knowledge/](packages/knowledge/)、重构计划 D |
| 4 | **晶体模块继续打磨** | 三维展示已修好（光照/布局/背景/按需渲染，见下「已完成」）。仍有打磨空间：模型在画面里偏小（正交取景可再收紧）、首页卡片缩略图未验证、径向/角度/截面三张图表尚未接入统一壳 | `modules/crystal/`、`apps/web/` |

**验证手段已升级**：本环境**可以**在真实浏览器里截图、抓控制台报错、执行表达式了
（`node tools/screenshot.mjs`，见 §四）。此前文档里写的「本环境无法执行 WebGL」
已不成立——接手时不要再据此跳过实机验证。

**任务 3 的完整清单与流程已写在作业现场**——打开 `packages/knowledge/crystal/README.md`
就能看到 C1–C8 每个知识点该覆盖什么、计划多少条、以及从哪些书蒸馏。

### 已完成（2026-09-25，27 个提交，`npm test` 546 项断言全绿）

| 阶段 | 内容 |
|---|---|
| **0 / 0b** | 基线提交（此前零 commit）；移除两套微信小程序并抢救 4 类跨平台资产；three 统一到 0.170 |
| **A** | 编号 K→C 迁移（5 份文档；orbit 的 245 处 K 与两个 lockfile 零触碰） |
| **B1** | 抽通用管道到 `packages/agent-core/core/`：llm-client · catalog · feynman · **perception** · **storyboard** · **conversation** · tool-registry；`ui/`：renderer · dom · panel —— **每一项都与 orbit 原实现双跑比对**（含过程事件序列、applyAction 调用序列逐一对齐） |
| **B2** | `packages/ui-kit/`：设计令牌（暗/浅主题）· 基础构件 · viewport · settings-store · **声明式** settings-popup |
| **B3** | `packages/viewer/`：四元数相机（双模式 + 正交/透视两处抽象）· 指针手势层 · 晶体几何 —— 一并修掉 8 处实测缺陷 |
| **B5** | descriptor 与实现对账，撤掉一批幽灵工具名（**自检曾与 descriptor 用同一批错名字而互相印证**） |
| **B6** | 模块契约 · crystal 的 facade/tools/actions（**首个契约合规模块**）· 装配层 `app.js`（中枢工具 + 模块工具按节点裁决）· 统一前端 `apps/web` |
| **B7** | 元素表真源+守卫 · orbit 的 34 条知识条目与 6 个通用技能迁入 · symmetry 特征标表与点群表迁入 |
| **展示修复** | 三维展示的**两个根因**：① 场景里一盏灯都没有（集成时漏传 `lightConfig`，Phong 材质无光即纯黑 → 表现为「原子没颜色、没质感」）② 栅格项缺 `min-width:0`（canvas 固有宽度撑破栅格 → 「展示区太宽、模型不居中、右栏被挤出屏幕」）。另把三维背景改深色（按 103 个元素色的亮度分布定的：浅底会丢 13 个近白色元素含纯白的氢） |
| **渲染循环** | 原是无条件 rAF 满速重绘（静止时也烧），改为按需重绘 + 1 Hz 兜底。**实测静止 2 秒渲染帧数 120 → 2**；这也是无头截图把 CPU 打满的根因 |
| **新工具** | `tools/screenshot.mjs`：一条命令在真实浏览器里截图/抓控制台报错/执行表达式 |
| 其余 | 修复 `check-crystal-data.mjs`（此前从任何目录都跑不起来）· 修复氢键渲染崩溃（three 旧 API `addAttribute`）· 迁移用户在 orbit 上的 9 处修复并抽出 4 条跨模块设计原则 |

**踩过的三类坑，接手时值得先读**：
1. **断言要断言实现，不是名字**——selftest 与 descriptor 用了同一批幽灵工具名，互相印证一直绿着却什么也没守住
2. **注入式验证先确认注入真的生效**——两次因引号/字段格式写错导致"守卫通过"是假象
3. **Windows 上比对文件必须先规范化行尾**——CRLF 差异会被误读成整文件内容分叉

---

## 一、三条硬约定（违反即为缺陷）

### 1. 约束靠工具白名单，不靠提示词劝说

节点能做什么，由 `packages/agent-core/nodes/constraints.js` 声明，
**在工具注册阶段过滤**——模型看不到不允许的工具，结构上无法越权。

```js
// ✓ 正确：出题节点没有 hand 授权，拿不到 applySceneActions
quiz: { grants: ['read', 'query'], ... }

// ✗ 错误：在提示词里写"出题时请不要操控视图"
```

凡是能用权限表达的约束，都不该用文字表达。

### 2. 数值一律程序算，模型不得口算

涉及配位数、空隙数、晶胞参数、密度、能级等一切数值，
必须经工具从晶体数据或知识条目取得，**禁止模型自行推导或记忆**。

**答案与解析必须分离生成**：先冻结答案，再写解析。
否则答案错了，解析会为错误答案编造一套自洽的理由，这类错误极难发现。

### 3. id 一律带命名空间

```
crystal:C4-2     晶体模块
orbit:K3-1       轨道模块
shared:S1-2      总知识库
symmetry:P2-3    对称模块
```

**✅ 已迁移（2026-09-24）**：晶体模块的知识点编号此前是 `K1`–`K8`，与 orbit 的
`K1`–`K9` 含义冲突（两套 `K` 指完全不同的东西）。现已改为 `C1`–`C8`，条目 id
形如 `crystal:C1-1`。

**orbit 的 `K` 保持不变**——它是活数据，被 localStorage 掌握度键、错因映射、
题目模板分支、工具 schema 描述文本等多处消费，改名成本远高于收益。让位的应是
后加入者，这就是晶体改用 `C` 的原因。

---

## 二、目录约定

| 路径 | 放什么 | 不放什么 |
|---|---|---|
| `packages/agent-core/core/` | 智能体运行时（对话循环、模型客户端、面板） | 任何学科内容 |
| `packages/agent-core/nodes/` | 决策节点约束规格 | 模块专属节点（放模块描述里） |
| `packages/agent-core/registry/descriptors/` | 每个模块一个描述文件 | 模块实现代码 |
| `packages/knowledge/<模块id>/` | 知识条目 | 教材原文摘录 |
| `packages/skills/common/` | 通用教学法（不依赖学科） | 学科专属教学法 |
| `projects/<模块id>/` | 工具本体（原样，内部结构不动） | 共享逻辑 |

**新增一个模块两步**：在 `registry/descriptors/` 建描述文件（小模块可复制
`_template-lite.js`，必填只有 `id`/`title`/`capabilities`），在 `registry/index.js` 加一行。

**模块只能往工具类别里放工具，不能决定谁有权限** —— 权限由 `nodes/constraints.js` 裁决。

---

## 三、版权红线

从教材蒸馏知识条目时 **必须重写，不得摘录**：

- ✅ 吸收事实与逻辑，用自己的语言组织
- ✅ `source` 字段标注教材与章节（属引用）
- ❌ 不复制原文表述、不收录教材习题原文、不上传扫描页

**判据**：如果一条目的正文能被搜索引擎匹配到教材原文，说明改写不充分。

相关赛事淘汰红线明确包含「知识产权争议」。

---

## 四、常用命令

```bash
# 共享核心自检（改完节点约束/模块描述后必跑）
node packages/agent-core/tools/selftest.mjs

# 晶体数据自检（改完晶体数据后必跑）
node projects/crystal/tools/check-crystal-data.mjs

# 全部自检（改完任何共享层/模块代码后必跑；约 543 项断言）
npm test

# 统一前端（一个入口，晶体模块已接通）
cd apps/web && npm run dev        # dev server；首次需在仓库根 npm install

# 单独跑某一层
npm run test:core      # 共享核自检 + test-core + test-app（装配层端到端）
npm run test:ui        # ui-kit
npm run test:viewer    # 三维外壳（用真实 three.js 驱动）
npm run test:shared    # 数据真源一致性守卫
npm run test:modules   # crystal 模块（门面 + 工具）
npm run test:data      # 晶体数据语义校验

# 原模块独立页（过渡期仍在，B4/B6 完成后逐步退役）
cd projects/crystal/H5 && npm install && npm run dev
```

### 实机验证（在真实浏览器里截图 / 抓报错 / 执行表达式）

```bash
node tools/screenshot.mjs --out tmp/shot.png                 # 截图（默认 http://localhost:3001）
node tools/screenshot.mjs --console                          # 只看控制台 error/warning
node tools/screenshot.mjs --eval "window.__chemAgent.view.getProps()"
node tools/screenshot.mjs --wait-for "window.__chemAgent" \
     --before "…先改状态…" --out tmp/x.png                    # 同一次会话里先改状态再截图
```

它自己起 Edge（Chromium 内核）、连 CDP、收尾自动关浏览器，无需装 puppeteer。

⚠️ **软件渲染 + 动画循环 = CPU 炸弹**（这是真实事故，不是理论风险：一次验证把 CPU 打满，
而当时页面只是一个静态晶体）。三道保险已在工具里，但值得知道原理：
1. 截图前把 `requestAnimationFrame` **节流**到 250ms——**不能**换成空函数"冻死"它：
   按需渲染的应用，渲染本身就发生在 rAF 回调里，冻死等于画面全空（曾据此误判
   "渲染修复把晶体弄没了"）
2. **空闲端口 + 导航后校验地址**——写死端口曾连到一个更早的实例上，
   于是"截图我的应用"实际截的是另一个页面，而且全程不报错
3. **硬超时**（默认 60s），到时无条件关浏览器——"忘了关"正是上次 CPU 打满的直接原因

**关于验证的一条经验**（本仓库反复踩到）：凡有"通过"的检查，**先看它红过一次**再信任它。
注入式验证时要先确认注入真的生效——两次因引号/字段格式写错而得到"守卫通过"的假象。
同理，**验证手段本身也可能出错**：截图工具一次把 rAF 冻死、一次连错浏览器，
两次都产出了"看起来正常、其实不是你要的"结果。

---

## 五、数据副本注意事项

> **2026-09-24 变更**：两套微信小程序（`projects/crystal/miniprogram/`、
> `projects/symmetry/wx/`）已从本仓库移除——先完善网页版，之后再处理。
> 原版在 `D:\xjl\program\` 与 GitHub 有备份，另可在 git 历史中取回。
> 移除前抢救出的跨平台资产见 `docs/archive/` 与下表。

晶体数据由「三份 JS 副本」变为**单份 JS 源 + 上游 CIF**：

| 内容 | 位置 | 说明 |
|---|---|---|
| 晶体数据（唯一的 JS 源） | `projects/crystal/H5/src/data/crystals/` | `export default` 语法 |
| **上游权威源**：23 个 CIF | `modules/crystal/data/cod/` | 取自 Crystallography Open Database |
| COD 比对报告 | `modules/crystal/data/cod/COD_COMPARISON_REPORT.md` | 逐晶体与 COD 的偏差与文献出处 |

**改数据时以 H5 那一份为准**。此前本节只登记了三份 JS 副本，**漏了上游 CIF**——
而那一份才是数据的真正来源。

✅ `check-crystal-data.mjs` 已修好（2026-09-24）：改为以**脚本自身位置**为锚点，
从任何目录都能跑。三副本一致性检查已随小程序移除而废止，保留的是 8 项逐晶体语义校验
（配位数格式、点阵型式↔晶胞点阵点数、空间群首字母↔点阵记号、结构基元自洽性、
空间利用率交叉验证、晶胞非空等——它当年正是靠这些发现了 wurtzite 的结构基元错误）。

📌 **元素表与知识/技能库另有守卫**：`packages/knowledge/tools/check-shared-data.mjs`
逐字段比对"真源 ↔ 各模块的本地副本"，并校验 44 个群的特征标表**每行字符数 == 共轭类数**。
过渡期用（模块改为直接引用真源后，副本与对应守卫条目一并退役）。

---

## 六、设计文档索引

| 文档 | 位置 |
|---|---|
| **重构计划（当前主线）** | `docs/重构计划.md` |
| **orbit 变更待评估** | `docs/orbit变更待评估.md`（用户在 `D:\xjl\program\orbit` 上的 15 处改动，待评估后按层迁移） |
| 智能体知识资产设计 | `projects/crystal/activity/智能体知识资产设计.md` |
| AI 智能体建设方案 | `projects/crystal/activity/AI智能体建设方案.md` |
| 出题引擎技术设计 | `projects/crystal/activity/出题引擎技术设计.md` |
| **参赛执行清单** | `projects/crystal/activity/参赛执行清单.md`（§五.1 是 C1–C8 知识点定义的权威出处） |
| 数据核查报告 | `projects/crystal/activity/数据核查报告.md` |
| COD 数据比对报告 | `modules/crystal/data/cod/COD_COMPARISON_REPORT.md` |

> ⚠️ `projects/orbit/activity/` 下**另有一份同名但内容完全不同的**《AI智能体建设方案.md》
> （句子重合度 0.0%，是 orbit 模块自己的方案，55 KB vs 39 KB）。**按文件名去重会丢掉其中一份。**

---

## 七、当前状态

| 部分 | 状态 |
|---|---|
| 节点约束规格表 | ✅ 已实现，27 项自检通过 |
| 模块注册机制 | ✅ 已实现 |
| 智能体运行时（对话循环等） | ✅ 已实现（`packages/agent-core/core/`，7 个模块，与 orbit 原实现双跑比对） |
| 模块契约与装配层 | ✅ 已实现（`contract/module-contract.js` + `app.js`），装配层有 40 条无头端到端断言 |
| 共享表现层 | ✅ 已实现（`ui-kit` 令牌/构件/设置 · `viewer` 相机/手势/几何） |
| 知识库 | ⏳ 骨架已建；orbit 34 条已迁入，晶体 44 条与对称 30–45 条待蒸馏 |
| 技能库 | ✅ 通用 6 个已迁入 `packages/skills/common/` |
| **晶体模块** | ✅ 门面 + 工具 + 动作词汇表已建，统一壳已接通（`apps/web`）且三维展示已修好（光照/布局/背景/按需渲染） |
| **轨道模块** | ⏳ 需先做 B4 去全局化（10.6k 行、28 个全局脚本）才有模块层 |
| **对称模块** | ⏳ 引擎与知识资产已在 packages/；UI 壳重写、接口层、P4 计算待做（阶段 C） |

**关于复用 orbit 的经验已被验证**：它的 `llm-client`、面板渲染、分镜队列、感知快照
确与学科无关，**直接搬**是对的（它们处理了流式解析、中断、max_tokens 截断续写等真实的坑）；
而 `scene-bridge`、`question-engine`、`error-diagnosis` 是学科耦合的，**必须重写**。
搬完之后，其中三样被进一步抽成**跨模块资产**（见重构计划与 `contract/module-contract.js`
的 `DESIGN_PRINCIPLES`）：可撤回性、标注跟随系列、多网格外观更新、一控件多场景。


