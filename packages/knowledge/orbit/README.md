# 原子轨道模块 · 知识条目

## 现状

**orbit 项目已有现成的知识库**，位于 `projects/orbit/H5/knowledge/entries/index.js`，
含 36 条条目（知识点 K1–K9）。

## 要做的事

迁移时把条目 id 加命名空间前缀：

```
K3-1  →  orbit:K3-1
```

原项目用 `K` 前缀表示原子轨道知识点，**这个 K 保留**（它在 orbit 里已经是这个含义）。
冲突的是晶体模块——晶体模块的编号须改为 `C`，见 [../crystal/README.md](../crystal/README.md)。

## 知识点骨架（来自 orbit）

| 编号 | 知识点 |
|---|---|
| `orbit:K1` | 量子数与轨道命名 |
| `orbit:K2` | 波函数与分离变量 |
| `orbit:K3` | 径向函数辨析 |
| `orbit:K4` | 角度分布与轨道形状 |
| `orbit:K5` | 节面与节点 |
| `orbit:K6` | 实函数与复函数 |
| `orbit:K7` | 相位与符号 |
| `orbit:K8` | 概率诠释 |
| `orbit:K9` | 叠加态 / 杂化 / 力学量 |

**状态**：⏳ 待从 orbit 迁移（内容现成，主要是加命名空间）
