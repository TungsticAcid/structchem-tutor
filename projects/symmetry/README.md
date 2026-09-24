# 对称视界 · Symmetry Viewer

面向**高校教学**的应用：识别分子 / 晶体的对称元素、点群、空间群，并以 3D 方式精细展示对称元素。

## 目录结构

| 目录 | 说明 |
|---|---|
| `H5/` | Web 网页应用（Vite + three.js 纯前端，内置示例库 + 46 分子点群/230 空间群识别 + **确定性对称元素检测**（原子几何候选 + 验证，参考 SYVA） + **专业对称元素命名**（σh/σv/σd、C₂′/C₂″、等价原子/稳定化子群阶） + **对称操作教学动画** + 中英双语 + 原子拾取/标签 + 辅助几何参考） |
| `theory/` | 理论推导文档（LaTeX，如绕视线轴滚转的完备性证明） |
| `python/` | 预留（未来 spglib/pymatgen 后端或桌面版） |

## 运行

```bash
cd H5
npm install
npm run dev      # 开发模式 http://localhost:5173
npm run build    # 生产构建
```

## 理论文档编译

```bash
cd theory
bash build.sh    # 需 TeX Live（xelatex），生成 main.pdf
```

详见 `H5/README.md`。
