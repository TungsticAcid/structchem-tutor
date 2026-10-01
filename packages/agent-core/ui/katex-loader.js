/**
 * katex-loader.js — 按需加载 KaTeX（公式渲染）
 *
 * ★ 为什么懒加载：`katex.min.js` 有 277 KB。它会被用到（晶体学的解析里有
 *   `ρ = Z·M/(N_A·V)` 这类公式），但不是每个学生会话都会用到——把它塞进首屏主包
 *   是让所有人都为一个多数人用不上的功能付出加载成本。
 *
 * ★ CSS 不懒加载（23 KB）：公式**样式错乱**比"稍晚出现"糟得多——KaTeX 的 HTML
 *   在无 CSS 时是一堆错位的 span，看起来像渲染坏了。故 CSS 在 index.html 里直接 link，
 *   JS 按需加载。加载完成前的公式会降级成 `<code>`（renderer.js 已实现该兜底）。
 *
 * ★ 失败不致命：加载失败时 renderer 的降级路径照常工作（公式显示为代码样式），
 *   而不是让整条消息渲染不出来。
 */

/** 缓存的加载 Promise（并发调用共用一次加载） */
let loadPromise = null

/**
 * 确保 KaTeX 可用。
 * @returns {Promise<Object|null>} window.katex 或 null（加载失败）
 */
export function loadKatex() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null)
  }
  if (window.katex && typeof window.katex.renderToString === 'function') {
    return Promise.resolve(window.katex)
  }
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve) => {
    // ★ 用 BASE_URL 而不是写死 './'：vite 的 base 若改动（如部署到子路径），
    //   写死的相对路径会 404，而 404 只表现为"公式没渲染"，不报错。
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './'
    const s = document.createElement('script')
    s.src = base + 'katex/katex.min.js'
    s.async = true
    s.onload = () => {
      const k = window.katex
      if (!k || typeof k.renderToString !== 'function') {
        console.warn('[katex] 脚本已加载但 window.katex 不可用，公式将降级显示')
        resolve(null)
        return
      }
      resolve(k)
    }
    s.onerror = () => {
      console.warn('[katex] 加载失败（公式将降级为代码样式）')
      resolve(null)
    }
    document.head.appendChild(s)
  })
  return loadPromise
}

/**
 * 在浏览器空闲时预加载（首屏不受影响，但用户第一次看到公式时多半已就绪）。
 * 面板打开后调用最合适——那时用户已经在用智能体了。
 */
export function preloadKatexIdle() {
  if (typeof window === 'undefined') return
  const run = () => loadKatex()
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 4000 })
  } else {
    setTimeout(run, 1200)
  }
}

export default { loadKatex, preloadKatexIdle }
