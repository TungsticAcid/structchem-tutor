# chem-agent 项目约定

结构化学教学智能体 —— **一个中枢 + N 个可插拔教学工具**。

> 完整结构说明见 [README.md](README.md)。本文件只写"必须遵守的约定"。

---

## 〇、当前待办（新会话从这里接手）

按优先级排列：

| # | 任务 | 说明 | 位置 |
|---|---|---|---|
| 1 | **编号 K→C 迁移** | 晶体模块知识点编号目前仍是 `K1`–`K8`，与 orbit 的 `K1`–`K9` 冲突，须改为 `C1`–`C8`。散落在 `projects/crystal/activity/` 的各文档中 | 见 §一.3 |
| 2 | **抽通用管道** | 从 `projects/orbit/H5/js/agent/` 搬 `llm-client`、面板渲染、分镜队列、感知快照到 `packages/agent-core/core/` | 见 §七 |
| 3 | **写晶体知识条目** | 约 44 条，从 `D:\xjl\study\books\化学电子书籍` 重写 | [packages/knowledge/crystal/](packages/knowledge/crystal/) |
| 4 | **平移通用技能** | 6 个通用教学法从 orbit 移到 `packages/skills/common/` | [packages/skills/](packages/skills/) |

**任务 3 的完整清单与流程已写在作业现场**——打开 `packages/knowledge/crystal/README.md`
就能看到 C1–C8 每个知识点该覆盖什么、计划多少条、以及从哪些书蒸馏。

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

**⚠️ 未完成的迁移**：晶体模块的知识点编号目前仍是 `K1`–`K8`（散落在
`projects/crystal/activity/` 的文档中），与 orbit 的 `K1`–`K9` 含义冲突。
**须改为 `C1`–`C8`**。改动会波及方案文档、知识条目、出题引擎设计——越晚越麻烦。

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

# 各模块网页版
cd projects/crystal/H5 && npm install && npm run dev
```

---

## 五、数据副本注意事项

晶体数据有**三份副本**，内容必须一致，仅模块语法不同：

| 副本 | 模块语法 |
|---|---|
| `projects/crystal/H5/src/data/crystals/` | `export default` |
| `projects/crystal/miniprogram/data/crystals/` | `module.exports =` |
| `projects/crystal/miniprogram/skills/data/crystals/` | `module.exports =` |

**改数据时三处都要同步**，然后用 `check-crystal-data.mjs` 验证一致性。

---

## 六、设计文档索引

| 文档 | 位置 |
|---|---|
| 智能体知识资产设计 | `projects/crystal/activity/智能体知识资产设计.md` |
| AI 智能体建设方案 | `projects/crystal/activity/AI智能体建设方案.md` |
| 出题引擎技术设计 | `projects/crystal/activity/出题引擎技术设计.md` |
| 数据核查报告 | `projects/crystal/activity/数据核查报告.md` |

---

## 七、当前状态

| 部分 | 状态 |
|---|---|
| 节点约束规格表 | ✅ 已实现，18 项自检通过 |
| 模块注册机制 | ✅ 已实现 |
| 智能体运行时（对话循环等） | ⏳ 待从 `projects/orbit/H5/js/agent/` 抽取通用管道 |
| 知识库 | ⏳ 骨架已建，内容待蒸馏 |
| 技能库 | ⏳ 骨架已建，通用 6 个待从 orbit 平移 |
| 晶体模块的智能体 | ⏳ 进行中 |

**关于复用 orbit**：它的 `llm-client`、面板渲染、分镜队列、感知快照等
与学科无关，**直接搬**（它们处理了流式解析、中断、max_tokens 截断续写等真实的坑）；
而 `scene-bridge`、`question-engine`、`error-diagnosis` 是学科耦合的，**必须重写**。
