/**
 * dom.js — 极小的 DOM 构建工具
 *
 * 本文件存在的唯一理由是**去重**：orbit 里 panel.js 与 settings.js 各写了一份
 * **逐字相同**的 el()（已逐字节核对）。两份副本意味着同一处修改要做两遍，
 * 且很容易只改一处——正是本次重构要消除的那类重复。
 *
 * 语义与原实现完全一致，未做任何"顺手改进"：调用方（面板、设置弹层）依赖
 * 它的行为，尤其是 `html:` 会设置 innerHTML（调用方需自行保证内容可信）。
 *
 * 来源：orbit/H5/js/agent/panel.js:166-176 与 settings.js:62-72（两份相同），
 *       2026-09-24 迁入并合并。
 */

/**
 * 创建元素。
 *
 * @param {string} tag
 * @param {Object} [attrs] 特殊键：`class` → className，`text` → textContent，
 *                         `html` → innerHTML；其余走 setAttribute
 * @param {Node[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs, children) {
  const e = document.createElement(tag)
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      if (k === 'class') e.className = attrs[k]
      else if (k === 'text') e.textContent = attrs[k]
      else if (k === 'html') e.innerHTML = attrs[k]
      else e.setAttribute(k, attrs[k])
    }
  }
  ;(children || []).forEach((c) => e.appendChild(c))
  return e
}

/** 清空一个元素的子节点（比 innerHTML = '' 更明确，且不触发解析） */
export function clear(node) {
  if (!node) return node
  while (node.firstChild) node.removeChild(node.firstChild)
  return node
}

export default el
