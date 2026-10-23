/**
 * Hash 路由器
 * 支持路由模式：/ /viewer/:id /compare/:id /settings
 */
class Router {
  constructor() {
    this._routes = []
    this._currentPage = null
    this._container = null
    window.addEventListener('hashchange', () => this._handleRoute())
  }

  /** 注册路由 */
  on(pattern, handler) {
    // 将 :param 转为命名捕获组
    const paramNames = []
    const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name)
      return '([^/]+)'
    })
    this._routes.push({
      regex: new RegExp('^' + regexStr + '$'),
      paramNames,
      handler
    })
    return this
  }

  /** 设置渲染容器 */
  setContainer(el) {
    this._container = el
    return this
  }

  /** 启动路由（处理当前 hash） */
  start() {
    this._handleRoute()
    // 如果没有 hash，默认跳转到首页
    if (!location.hash || location.hash === '#') {
      location.hash = '#/'
    }
  }

  /** 导航到指定路径 */
  navigate(path) {
    location.hash = '#' + path
  }

  /** 返回上一页 */
  back() {
    history.back()
  }

  /** 处理当前路由 */
  _handleRoute() {
    const hash = location.hash.slice(1) || '/'
    const path = hash.split('?')[0] // 去掉查询参数
    const queryStr = hash.includes('?') ? hash.split('?')[1] : ''
    const query = {}
    if (queryStr) {
      queryStr.split('&').forEach(pair => {
        const [k, v] = pair.split('=')
        query[decodeURIComponent(k)] = decodeURIComponent(v || '')
      })
    }

    for (const route of this._routes) {
      const match = path.match(route.regex)
      if (match) {
        const params = {}
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1]
        })

        // 卸载旧页面
        if (this._currentPage && this._currentPage.unmount) {
          this._currentPage.unmount()
        }

        // 加载新页面
        if (this._container) {
          this._container.innerHTML = ''
        }
        this._currentPage = route.handler({ params, query })
        return
      }
    }

    // 未匹配任何路由
    console.warn('[Router] 未匹配路由:', path)
    if (this._container) {
      this._container.innerHTML = '<div style="text-align:center;padding-top:100px;color:#999;">页面不存在</div>'
    }
  }
}

/** 全局单例 */
export const router = new Router()

export default Router
