/**
 * doc-scroll.js —— 文档级滚动策略（壳的职责）
 *
 * ★ 为什么要有这个文件：
 *   壳 import 了晶体项目的 `global.css`，而它写死了
 *     `html, body { width:100%; height:100%; overflow:hidden }`
 *   —— 那是**晶体全屏查看器**要的（满屏拖拽旋转，不该有页面滚动）。但壳里还有
 *   **文档流页面**（原子轨道：三维卡片 + 公式卡 + 三张图表卡纵向排下去），
 *   实测内容高 1691px、可见 807px，而滚动被锁死 → 公式卡与三张图表卡
 *   **整块够不着**，右栏底部也被切掉。用户报的"缺少滚动条、看不到径向/角度/截面"
 *   就是这个。
 *
 * ★ 为什么不让各页面自己声明"我要滚动"：
 *   页面作者很容易忘（轨道页就是这么漏的），而漏了之后**不报错**，只是内容消失。
 *   这里改成**内容驱动**：量一下内容有没有超出视口，超出就允许滚动。
 *   于是"以后新加的页面比视口高"在结构上就不可能够不着。
 *
 * ★ 为什么可以"锁着量"：`overflow:hidden` 只影响能否滚动，**不影响 `scrollHeight`
 *   的读数** —— 实测锁死状态下 body.scrollHeight 仍如实报 1691。所以先量再决定，
 *   不存在"要解开才量得准、量完又得锁上"的循环。
 */
export function createDocScroll(win, doc, opts = {}) {
  const root = doc.documentElement
  const body = doc.body
  const CLASS = 'doc-scroll'
  /** 允许的舍入余量：全屏页面常因 1–2px 的取整"超出"，那不该长出滚动条 */
  const SLACK = opts.slack == null ? 4 : opts.slack

  let last = null
  let rafId = null

  /** 量一次并同步类名；返回本次是否允许滚动（便于测试与诊断） */
  function sync() {
    rafId = null
    const vh = win.innerHeight || 0
    if (!vh) return root.classList.contains(CLASS)
    // 取两者较大：不同类型页面把内容撑在不同元素上（有的撑 body，有的撑 html）
    const contentH = Math.max(body ? body.scrollHeight : 0, root.scrollHeight)
    const need = contentH > vh + SLACK
    if (need !== last) {
      last = need
      root.classList.toggle(CLASS, need)
    }
    return need
  }

  /** 合并到下一帧再量，避免 resize 风暴里反复重排 */
  function schedule() {
    if (rafId) return
    rafId = win.requestAnimationFrame(sync)
  }

  /**
   * 观察页面容器：路由切换会整块换内容，resize 观察器能自动抓到高度变化。
   * ★ 刻意**不观察 body** —— 同步类名会改 body 的高度，观察它会形成自激循环
   *   （这与 viewport.js 里那条"刻意不观察 body"是同一个坑）。
   */
  let ro = null
  const host = doc.querySelector('#app') || body
  if (typeof win.ResizeObserver === 'function' && host) {
    ro = new win.ResizeObserver(schedule)
    ro.observe(host)
  }

  /**
   * ★★ 2026-11-26（用户：微信 / QQ 浏览器打开首页后无法下滑，只能看到首屏）：
   *
   *   `#app` 的 border-box 高度恒为 100%（继承全屏布局），内容变高时**只是
   *   scrollHeight 变大，盒子本身不变** —— ResizeObserver 观察 border-box，
   *   因此首页从「首幕」切到「探索态」、模块卡长出来后**不会触发**上面的 RO。
   *   表现就是：body.scrollHeight 已是 1528，html 却始终没有 `.doc-scroll`，
   *   页面被锁在首屏。
   *
   *   用 MutationObserver 盯住内容树的**类名变化**（is-intro → is-explored、
   *   路由换页）来补一次测量。仍然只观察 `#app` 子树、不观察 body，避免
   *   "同步类名 → 改 body 高度 → 再触发观察"的自激循环。
   */
  let mo = null
  if (typeof win.MutationObserver === 'function' && host) {
    mo = new win.MutationObserver(schedule)
    mo.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    })
  }

  win.addEventListener('resize', schedule)

  return {
    sync,
    schedule,
    /** 当前是否允许整页滚动（供诊断/测试） */
    isScrollable: () => root.classList.contains(CLASS),
    dispose() {
      win.removeEventListener('resize', schedule)
      if (ro) ro.disconnect()
      if (mo) mo.disconnect()
    },
  }
}

export default createDocScroll
