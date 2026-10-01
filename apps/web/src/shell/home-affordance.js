/**
 * home-affordance.js —— 把「回门户」的入口**统一装在壳这一层**
 *
 * ★ 为什么不让各页面自己加（这是本次的教训）：
 *   晶体查看器与对比页有上游自带的返回箭头（它们是多页应用，本来就需要），
 *   而**对称页没有**——上游的 Symmetry Viewer 是**单页应用**，整页就是全部，
 *   根本没有"返回别处"这个概念。移植进统一壳后，它就成了一个**死路**：
 *   用户点进去之后没有任何办法回到门户。用户报的"无法退出到主菜单"就是它。
 *
 *   逐页去加会一直漏（新模块、新页面都要记着加一次）。而"怎么离开一条路由"
 *   本来就是**路由的职责**——路由在壳里，所以出口也该在壳里。
 *
 * ★ 装法：优先**塞进页面自己的顶栏**（`.page-nav` / `#toolbar` …），
 *   那样它看起来是页面的一部分；页面没有顶栏时退化为固定悬浮。
 *   页面**自带**返回控件时（查看器/对比页）不插手——两个返回箭头只会让人犹豫。
 *
 * ★ 它只做一件事：`location.hash = '#/'`。用 hash 赋值而不是 `history.back()`：
 *   back 依赖浏览历史，而直接深链进来（`#/viewer/fcc` 作为首个地址）时历史是空的，
 *   back 会什么都不做——那正是"点了没反应"这类最难自查的失效。
 */
// ★ 样式**不在这里 import**：模块要能在 Node 里被测试（见 tools/test-shell.mjs），
//   而 Node 不认 `.css`。样式由 apps/web/src/main.js 统一引。

/**
 * 可作为落点的顶栏（按优先级）。
 *
 * ★ 第一条 `[data-page-topbar]` 是**显式声明**，其余是历史遗留的类名枚举。
 *
 * ★ 为什么加了显式声明（2026-10-01 的真实事故）：orbit 页的顶栏类名是
 *   **`topbar`**（无连字符），而这张表里写的是 **`.top-bar`**（有连字符）——
 *   差一个字符，四个锚点**全军覆没**，于是走了本该只属于"整页没有顶栏"的
 *   `position:fixed` 兜底：按钮被钉在视口左上角，**压在 ⚛ logo 和标题上**。
 *   而它"看起来还是能用的"（按钮在、点得动），所以没人发现是选择器没匹配上。
 *
 *   教训不是"补一个 `.topbar`"——那样下一个页面还会踩。**显式声明**才是正解：
 *   新页面在顶栏元素上写 `data-page-topbar` 即可，不必去猜哪张类名表里有它。
 *   （`.topbar` 仍然保留，因为它已经存在了。）
 */
const ANCHORS = ['[data-page-topbar]', '.page-nav', '#toolbar', '.topbar', '.top-bar', '.cp-top-bar']

/** 页面已自带返回控件时的标记（含壳自己注入过的那种） */
const EXISTING = ['[data-shell-home]', '.back-btn', '.cp-back', '#backBtn', '#cpBack']

/** 已经报过"退化为悬浮"的路径。同一条路由反复挂载时不该刷屏。 */
const FLOAT_REPORTED = new Set()

/**
 * 在页面里装上「回门户」入口。
 *
 * @param {HTMLElement} root 路由容器（页面已挂载其中）
 * @returns {boolean} 是否装上了
 */
export function installHomeButton(root) {
  if (!root) return false
  // 已装过（钩子在同一次挂载里被调两次之类）→ 不重复
  if (root.querySelector('[data-shell-home]')) return false
  // 页面自己有返回控件 → 不插手
  for (const sel of EXISTING) {
    if (root.querySelector(sel)) return false
  }

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'shell-home'
  btn.setAttribute('data-shell-home', '')
  btn.title = '返回门户（首页）'
  // 箭头的 aria-hidden：它只是视觉提示，读屏用户听到的是"返回门户"
  btn.innerHTML = '<span class="shell-home__arrow" aria-hidden="true">←</span>'
    + '<span class="shell-home__label">门户</span>'
  btn.addEventListener('click', () => { location.hash = '#/' })

  const anchor = ANCHORS.map((s) => root.querySelector(s)).find(Boolean)
  if (anchor) {
    // 顶栏都是 display:flex，插到最前面就自然成为第一项
    anchor.insertBefore(btn, anchor.firstChild)
  } else {
    // 兜底：页面没有可命中的顶栏结构。固定悬浮，仍然给得出去路。
    btn.classList.add('shell-home--float')
    root.appendChild(btn)
    // ★ 兜底必须**发得出声音**。它是"这个页面没有顶栏"与"这张表里没写它的类名"
    //   两种情况共用的分支，而后者是缺陷（按钮会压在标题上）——
    //   只靠"按钮看起来在"是发现不了的（它毕竟点了还能用）。
    //   这条 warn 有现成的闭环：`node tools/screenshot.mjs --console` 会收走 warning
    //   并以非零退出码结束，于是实机跑一次就能把它变成红。
    const key = location.hash || '(无 hash)'
    if (!FLOAT_REPORTED.has(key)) {
      FLOAT_REPORTED.add(key)
      console.warn('[home-affordance] 页面里没有可命中的顶栏，回门户按钮退化为悬浮：' + key
        + '。若该页其实有顶栏，请给它加 data-page-topbar；若确实没有，忽略本行。')
    }
  }
  return true
}

export default installHomeButton
