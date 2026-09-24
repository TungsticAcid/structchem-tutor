# crystal-skill 晶体结构查询与3D可视化

## 业务流程图

```
用户意图
  │
  ├─ 模糊意图（"推荐几个"、"有什么好玩的"、"看看晶体"）
  │     └─→ getRecommendedCrystals → 推荐卡片（crystal-category-card）
  │
  ├─ 关键词意图（"NaCl"、"面心立方"、"离子晶体"、"立方晶系"）
  │     └─→ searchCrystals → 搜索结果卡片（crystal-result-card）
  │                                    │
  │                         用户点击卡片上的"查看3D"按钮
  │                                    ↓
  │                            openCrystalViewer → 导航到 viewer 页面
  │
  ├─ 查看详情（"这个晶体的配位数"、"NaCl的晶格参数"、"空间群是什么"）
  │     └─→ getCrystalDetail → 晶体详情卡片（crystal-detail-card）
  │                                    │
  │                         用户点击"在3D查看器中打开"
  │                                    ↓
  │                            openCrystalViewer
  │
  ├─ 对比意图（"对比NaCl和CsCl"、"fcc和hcp有什么区别"）
  │     └─→ compareCrystals → 对比卡片（crystal-detail-card 复用）
  │
  ├─ 分类浏览（"有哪些金属晶体"、"离子晶体有哪些"）
  │     └─→ getCrystalCategories → 分类列表卡片（crystal-category-card）
  │
  └─ 导航意图（已确认具体晶体，直接要查看3D）
        └─→ openCrystalViewer → 导航到 viewer 页面
```

> **核心约束**：
> - Agent 不能跳过 searchCrystals/getRecommendedCrystals 直接调用 openCrystalViewer——必须先有有效的 crystalId。
> - Agent 不能跳过搜索结果卡片直接调用 getCrystalDetail——必须先让用户从卡片确认具体晶体。
> - crystalId 必须来自上游接口返回的 structuredContent.items[].id 原值，禁止编造。

## 原子接口依赖关系

| 接口 | 作用 | 组件 | 前置条件 |
|------|------|------|----------|
| searchCrystals | 按关键词搜索晶体 | crystal-result-card | 用户提供了关键词 |
| getRecommendedCrystals | 模糊意图时展示精选晶体 | crystal-category-card | — |
| getCrystalDetail | 查看晶体属性详情 | crystal-detail-card | 已有 crystalId（来自搜索/推荐） |
| openCrystalViewer | 跳转3D查看器 | — | 已有 crystalId（来自搜索/推荐/详情） |
| compareCrystals | 对比两个晶体 | crystal-detail-card | 已有两个 crystalId |
| getCrystalCategories | 查看全部分类 | crystal-category-card | 用户询问分类 |

## 业务约束（跨接口铁律）

### 1. 输出形态
- 所有成功返回且绑定了组件的接口，**必须展示卡片**，禁止以纯文本列出卡片中的详情数据。
- Agent 回复时可附加简短引导话术（如"找到了3个匹配的晶体，点击卡片查看3D结构"），但**禁止把晶体名、化学式、参数等以 markdown 列表形式展开**。

### 2. 执行顺序
- `openCrystalViewer` 的 crystalId 必须来自 searchCrystals / getRecommendedCrystals / getCrystalDetail 返回值。
- `getCrystalDetail` 的 crystalId 必须来自 searchCrystals / getRecommendedCrystals 返回值。
- `compareCrystals` 的两个 crystalId 均须来自上游接口返回值。

### 3. 数据来源
- `crystalId` 必须来自 `searchCrystals` / `getRecommendedCrystals` 返回的 `items[].id` 原值，禁止编造。
- 晶系英文枚举值（cubic/hexagonal等）来自接口返回，禁止从中文推断。

## 用户意图分流

### 直接意图（触发本 SKILL）
- "我想看NaCl"
- "面心立方结构"
- "有什么金属晶体"
- "推荐几个立方晶系的"
- "冰的晶体结构"
- "对比一下fcc和bcc"
- "这个晶体的配位数是多少"
- "查看金刚石的3D结构"

### 意图分流规则
- 用户只说"推荐/有什么/看看"等模糊表达 → `getRecommendedCrystals`
- 用户说出具体晶体名/化学式/结构类型 → `searchCrystals`
- 用户在搜索结果中点击某晶体 → `getCrystalDetail`（crystalId 由卡片 sendFollowUpMessage 传入）
- 用户询问晶体的属性（配位数/空间群/晶格参数） → `getCrystalDetail`
- 用户说"对比/比较/区别"带两个晶体名 → `compareCrystals`
- 用户确认要查看3D → `openCrystalViewer`
- 用户询问分类/品类 → `getCrystalCategories`
- 用户表达歧义短语（如"那个"）→ 先反问澄清，禁止猜测
