/**
 * theme-boot.js — 首帧前定主题（**必须**在解析 body 之前同步执行）
 *
 * ★ 它在 index.html 的 <head> 里以**阻塞脚本**（无 defer / 无 async）引用：
 *   晚一步执行，第一帧就会按默认主题画出来，然后跳一下 —— 也就是"闪一下深色"。
 *
 * ★★ 2026-12-02：这段逻辑**原本是 index.html 里的行内 <script>**，为了加 CSP 才搬出来。
 *   搬家的理由值得写清，因为"为什么不能留在行内"经常被误解成"行内不安全"：
 *
 *   加了 `script-src 'self'` 之后，浏览器会**拒绝执行**行内脚本（这是 CSP 拦 XSS 的
 *   主要方式：注入进来的 `<script>` 与 `onerror=` 都算行内脚本）。要让行内脚本继续
 *   跑，只有两条路：
 *     · `'unsafe-inline'` —— 等于把这条防线整个撤掉，做了白做；
 *     · `'sha256-…'` 哈希白名单 —— 可行，但**哈希算的是文档里的原始字节**。
 *       本仓库在 Windows 上检出时是 CRLF、CI 上是 LF，同一份文件两种字节序，
 *       哈希只对得上一边。表现是"我这儿好好的，部署上去主题闪一下"——
 *       而且不报任何错（CSP 只会往控制台写一行 violation，没人看）。
 *   ⇒ 放成外部文件，`script-src 'self'` 就够，没有哈希要维护，也没有换行符陷阱。
 *   代价是一次很小的额外请求（~500 B），换来的是"改这段代码永远不会静默失效"。
 *
 * ★ 与 @ui-kit/theme.js 是**同一套判据**：显式选的直接写，'system' 交给 matchMedia
 *   解析 —— 解析结果同样写进 `data-theme`。属性是**唯一**真源，CSS 里不再有
 *   prefers-color-scheme 那一份"第二套浅色调色板"（那正是"跟随系统"看起来
 *   跟浅色/深色都不一样的根因）。
 *
 * ★ 用 IIFE + var：这是**经典脚本**（不是模块），要在任何浏览器里同步跑完。
 */
(function () {
  try {
    var t = localStorage.getItem('chem-agent.theme') || 'system'
    var resolved = (t === 'dark' || t === 'light')
      ? t
      : ((window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark')
    document.documentElement.setAttribute('data-theme', resolved)
  } catch (e) { /* 隐私模式等：交给运行时，最多闪一下 */ }
})()
