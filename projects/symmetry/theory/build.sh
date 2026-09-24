#!/bin/bash
# 「对称视界」理论文档编译脚本
# 用 xelatex 编译两次（处理目录与交叉引用）
cd "$(dirname "$0")"
xelatex -interaction=nonstopmode main.tex
xelatex -interaction=nonstopmode main.tex
echo "编译完成：$(pwd)/main.pdf"
