/**
 * router.js — Hash 路由器（壳自己的，与任何模块无关）
 *
 * 蓝本：crystal 的 adapters/router.js（100 行）。相比它有三处改动，都对应真实问题：
 *
 * ★ ① 路由带**模块命名空间**：`#/crystal/viewer/naCl` 而不是 `#/viewer/naCl`。
 *   原先的格式假设"整个应用只有一个模块"。统一壳里三个模块各有自己的视图页，
 *   不带命名空间就无法知道该由谁处理这条路由。
 *
 * ★ ② 未匹配时**回落首页并打日志**，而不是渲染"页面不存在"。
 *   理由：`navigateTo` 由模型触发，模型偶尔会给出格式不对的路径。
 *   让人看到一句"页面不存在"的裸文字，用户只会以为应用坏了；
 *   回落首页至少还在一张能用的界面上，而日志里留了证据。
 *
 * ★ ③ 处理函数**必须返回页面实例**。蓝本里踩过这个坑并留了长注释：
 *   写成 `() => new X().mount(c)` 时，箭头函数返回的是 `mount()` 的返回值，
 *   而各页面的 `mount()` 都没有 return 语句 → `_currentPage` 恒为 undefined
 *   → 旧页面**从不卸载**。后果是每次进出视图都泄漏一个 WebGLRenderer
 *   与 ResizeObserver，且泄漏的 renderer 仍在渲染循环里跑（画布已移出 DOM）。
 *   这个缺陷不报错、只是内存与 GPU 占用持续增长，极难察觉。
 *   故这里**在调用后校验**返回值，而不只是靠注释提醒。
 */

class Router {
  constructor() {
    this._routes = []
    this._currentPage = null
    this._container = null
    /** 回落目标（未匹配路由时用它） */
    this._fallback = null
    /** 卸载前/后的钩子（壳用它做面板与视图注册表的同步） */
    this._onBeforeUnmount = []
    this._onAfterMount = []
    // ★ 监听 hashchange —— 这一行**必须**在这里。
    //   漏掉它的后果极隐蔽：`location.hash = '#/viewer/x'` 会把地址改掉、事件也正常派发，
    //   但没有任何处理器去响应，于是**页面不换、控制台不报错**。
    //   （实测踩到：从库页点卡片后地址栏已变，界面还停在库页；
    //     而单测抓不到——无头测试不涉及路由。）
    window.addEventListener('hashchange', () => this._handleRoute())
    // ★ 语言变更通知当前页面（见 `_notifyLang` 的说明：由页面决定重画哪一块，
    //   而不是无条件 remount —— 轨道页的等值面重建要十几秒）。
    //   这里订阅 window 事件而不是 import i18n：路由器不该依赖 i18n 包 ——
    //   它俩一个管"去哪一页"、一个管"文案是什么"，耦合起来会让 router 无法单独测。
    window.addEventListener('langchange', () => this._notifyLang())
  }

  /** 注册路由。pattern 形如 `/crystal/viewer/:crystal`，`:name` 为命名参数 */
  on(pattern, handler) {
    const paramNames = []
    const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name)
      return '([^/]+)'
    })
    this._routes.push({ pattern, regex: new RegExp('^' + regexStr + '$'), paramNames, handler })
    return this
  }

  /** 设置渲染容器 */
  setContainer(el) { this._container = el; return this }

  /** 设置回落路径（未匹配时导航到它） */
  setFallback(path) { this._fallback = path; return this }

  /** 注册卸载前钩子（在旧页面 unmount 之前调用） */
  onBeforeUnmount(fn) { this._onBeforeUnmount.push(fn); return this }

  /** 注册挂载后钩子（在新页面 mount 之后调用，参数为页面实例） */
  onAfterMount(fn) { this._onAfterMount.push(fn); return this }

  /** 启动（处理当前 hash） */
  start() {
    if (!location.hash || location.hash === '#') location.hash = '#/'
    this._handleRoute()
  }

  /** 导航到指定路径 */
  navigate(path) { location.hash = '#' + path }

  /** 返回上一页 */
  back() { history.back() }

  /** 当前页面实例（诊断用） */
  get currentPage() { return this._currentPage }

  /** 当前路径（如 '/crystal/viewer/naCl'） */
  get currentPath() { return (location.hash.slice(1) || '/').split('?')[0] }

  /**
   * **重挂当前路由**：卸载再按当前 hash 挂一次。
   *
   * ★ 什么时候需要它：`sweep()` 是**单向**的（中文原文 → 译文），字典里没有反路。
   *   运行时在换语言时会自己把替换过的节点还原成中文再重扫（见 packages/i18n
   *   的 `restore`），所以**静态文案**不需要重挂。需要重挂的是那些**走 `t()` 取值**
   *   的文案 —— 它们的值是在渲染那一刻算出来的，DOM 扫描够不着。
   * ★ 但重挂有代价（轨道页会重建十几秒的等值面），所以**默认不要用它**：
   *   页面若能只重画自己的一小块，就实现 `onLangChange()` —— 见下面的 `_notifyLang`。
   */
  remount() { this._handleRoute() }

  /**
   * 通知当前页面"语言变了"。
   *
   * ★ 为什么不直接 remount：轨道的等值面流水线在这个无头环境里要 10–15 秒，
   *   换语言重建它既慢又没必要（几何与语言无关）。所以由**页面自己**决定
   *   "要重画哪一块"；没实现 `onLangChange` 的页面什么都不用做 ——
   *   静态文案已经由运行时的 restore + sweep 处理过了。
   */
  _notifyLang() {
    const p = this._currentPage
    if (p && typeof p.onLangChange === 'function') {
      try { p.onLangChange() } catch (e) { console.warn('[router] 语言变更重渲染失败：', e) }
    }
  }

  _handleRoute() {
    const hash = location.hash.slice(1) || '/'
    const path = hash.split('?')[0]
    const queryStr = hash.includes('?') ? hash.split('?')[1] : ''
    const query = {}
    if (queryStr) {
      for (const pair of queryStr.split('&')) {
        const [k, v] = pair.split('=')
        query[decodeURIComponent(k)] = decodeURIComponent(v || '')
      }
    }

    for (const route of this._routes) {
      const match = path.match(route.regex)
      if (!match) continue
      const params = {}
      route.paramNames.forEach((name, i) => { params[name] = match[i + 1] })

      // ---- 卸载旧页面（钩子先行：壳要借机注销视图注册表）----
      if (this._currentPage) {
        for (const fn of this._onBeforeUnmount) {
          try { fn(this._currentPage) } catch (e) { console.warn('[router] 卸载前钩子异常：', e) }
        }
        if (typeof this._currentPage.unmount === 'function') this._currentPage.unmount()
      }
      if (this._container) this._container.innerHTML = ''

      // ---- 挂载新页面 ----
      const page = route.handler({ params, query })
      // ★ 校验处理函数确实返回了页面实例（见文件头第 ③ 条）
      if (page == null) {
        console.error(
          `[router] 路由「${route.pattern}」的处理函数没有返回页面实例——`
          + '旧页面将无法卸载（泄漏渲染器与观察者）。请写成 `{ const p = new X(); p.mount(c); return p }`',
        )
      }
      this._currentPage = page || null
      if (this._currentPage) {
        for (const fn of this._onAfterMount) {
          try { fn(this._currentPage) } catch (e) { console.warn('[router] 挂载后钩子异常：', e) }
        }
      }
      return
    }

    // ---- 未匹配：回落首页（见文件头第 ② 条）----
    console.warn('[router] 未匹配路由，回落首页：', path)
    if (this._fallback && path !== this._fallback) {
      this.navigate(this._fallback)
      return
    }
    if (this._container) {
      this._container.innerHTML = '<div class="page-missing">页面不存在</div>'
    }
  }
}

/** 全局单例 */
export const router = new Router()

export default Router
