/**
 * BaseComponent 基类
 * 模拟微信小程序的 Component 体系
 *
 * 用法：
 *   class MyComp extends BaseComponent {
 *     static properties = { ... }
 *     static data = { ... }
 *     methods = { ... }
 *     lifetimes = { attached() {}, detached() {} }
 *     render() { return '<div>...</div>' }
 *   }
 */
export class BaseComponent {
  /** 子类覆盖：静态属性定义 */
  static properties = {}

  /** 子类覆盖：初始数据 */
  static data = {}

  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - 挂载容器
   * @param {Object} options.props - 外部传入属性
   * @param {Object} options.events - 事件监听 { eventName: handler }
   */
  constructor(options = {}) {
    const ctor = this.constructor

    // 初始化属性
    this._props = {}
    const propDefs = ctor.properties || {}
    for (const [key, def] of Object.entries(propDefs)) {
      const defVal = (typeof def === 'object' && def !== null) ? (def.value !== undefined ? def.value : null) : def
      this._props[key] = (options.props && options.props[key] !== undefined) ? options.props[key] : defVal
    }

    // ★ 传了但**没声明**的属性会被静默丢掉：上面只遍历已声明的键，而 setProps() 照单全收。
    //   症状是"首渲染少一个值、动一下又正常"，极难反查——实测踩过：LayerControl 的
    //   atomScale / opacity 漏声明，滑块首渲染回落到 min 显示成 0.30，拖一下才变成真实的
    //   1.00。这里直接报警，让下一个漏声明的键当场可见，而不是等谁来肉眼发现。
    if (options.props) {
      const undeclared = Object.keys(options.props).filter((k) => !(k in propDefs))
      if (undeclared.length) {
        console.warn(
          `[${ctor.name}] 属性 ${undeclared.map((k) => `"${k}"`).join('、')}`
          + ' 未在 static properties 中声明，构造函数会丢掉它们（只有 setProps 认得）'
        )
      }
    }

    // 初始化数据
    this._data = { ...(ctor.data || {}) }

    // 事件映射
    this._events = options.events || {}

    // 容器
    this._container = options.container || null

    // 属性观察者
    this._observers = {}
    for (const [key, def] of Object.entries(propDefs)) {
      if (typeof def === 'object' && def !== null && def.observer) {
        this._observers[key] = def.observer
      }
    }

    // 方法绑定：延迟到派生类实例字段（methods/lifetimes）初始化完成后再执行。
    // 派生类字段在 super() 返回后才初始化，构造函数体内访问 this.methods 会得到 undefined。
    setTimeout(() => this._ensureBound(), 0)
    // 自动调用 attached 生命周期
    setTimeout(() => {
      this._ensureBound()
      if (this.lifetimes && this.lifetimes.attached) {
        this.lifetimes.attached.call(this)
      }
      // ready 生命周期（模拟组件 ready）
      if (this.lifetimes && this.lifetimes.ready) {
        this.lifetimes.ready.call(this)
      }
    }, 0)
  }

  /** 绑定 methods 中的方法到实例（幂等，避免派生类字段未初始化导致绑定失效） */
  _ensureBound() {
    if (this._methodsBound || !this.methods) return
    for (const [name, fn] of Object.entries(this.methods)) {
      if (typeof this[name] === 'undefined') {
        this[name] = fn.bind(this)
      }
    }
    this._methodsBound = true
  }

  /** 获取属性值 */
  getProp(key) {
    return this._props[key]
  }

  /** 获取所有属性 */
  get properties() {
    return this._props
  }

  /** 获取数据值 */
  getData(key) {
    return key ? this._data[key] : this._data
  }

  /** 获取所有数据 */
  get data() {
    return this._data
  }

  /**
   * 更新数据并重新渲染
   * 模拟小程序的 setData
   */
  setData(updates) {
    Object.assign(this._data, updates)
    this._updateView()
  }

  /**
   * 设置属性（从外部）
   */
  setProps(updates) {
    for (const [key, val] of Object.entries(updates)) {
      const oldVal = this._props[key]
      this._props[key] = val
      // 触发观察者
      if (this._observers[key] && oldVal !== val) {
        this[this._observers[key]](val)
      }
    }
    this._updateView()
  }

  /**
   * 触发事件（模拟小程序的 triggerEvent）
   */
  triggerEvent(name, detail = {}) {
    const handler = this._events[name]
    if (handler) {
      handler({ detail })
    }
  }

  /**
   * 获取容器 DOM 元素
   */
  getContainer() {
    return this._container
  }

  /**
   * 在容器中查找元素（模拟 createSelectorQuery）
   */
  querySelector(selector) {
    if (this._container) {
      return this._container.querySelector(selector)
    }
    return null
  }

  /**
   * 类似 createSelectorQuery().select().node()
   * 返回 DOM 元素（非小程序 canvas 节点）
   */
  createSelectorQuery() {
    const container = this._container
    return {
      select: (sel) => ({
        node: () => ({
          exec: (cb) => {
            const el = container ? container.querySelector(sel) : null
            cb([{ node: el }])
          }
        })
      })
    }
  }

  /**
   * 挂载到指定容器
   */
  mount(container) {
    this._container = container
    this._ensureBound()
    this._render()
    // 调用 ready 生命周期
    if (this.lifetimes && this.lifetimes.ready) {
      this.lifetimes.ready.call(this)
    }
  }

  /**
   * 卸载组件
   */
  unmount() {
    if (this.lifetimes && this.lifetimes.detached) {
      this.lifetimes.detached.call(this)
    }
    if (this._container) {
      this._container.innerHTML = ''
    }
    this._container = null
  }

  /**
   * 子类覆盖：返回 HTML 字符串
   */
  render() {
    return ''
  }

  // ====== 内部方法 ======

  /** 重新渲染视图（保留标记容器的滚动位置，避免重渲染后回到顶部） */
  _updateView() {
    const keepSel = '[data-scroll-keep]'
    const oldScrollEl = this._container ? this._container.querySelector(keepSel) : null
    const scrollTop = oldScrollEl ? oldScrollEl.scrollTop : 0
    this._render()
    if (scrollTop > 0) {
      const newScrollEl = this._container ? this._container.querySelector(keepSel) : null
      if (newScrollEl) newScrollEl.scrollTop = scrollTop
    }
  }

  /** 执行渲染 */
  _render() {
    if (!this._container) return
    const html = this.render()
    if (html !== this._lastHtml) {
      this._container.innerHTML = html
      this._lastHtml = html
      // 绑定事件
      this._bindEvents()
      // 调用渲染后回调
      if (this.lifetimes && this.lifetimes.ready) {
        // 不重复调用 ready
      }
    }
  }

  /** 绑定事件处理器 */
  _bindEvents() {
    if (!this._container) return
    // 确保方法已绑定到实例（data-action 直接使用 this[action] 作为监听器）
    this._ensureBound()

    // data-action 系列
    const actionEls = this._container.querySelectorAll('[data-action]')
    actionEls.forEach(el => {
      const action = el.dataset.action
      if (action && typeof this[action] === 'function') {
        el.addEventListener('click', this[action])
      }
    })

    // data-tap 系列（模拟 bindtap）
    const tapEls = this._container.querySelectorAll('[data-tap]')
    tapEls.forEach(el => {
      const method = el.dataset.tap
      if (method && this[method]) {
        el.addEventListener('click', (e) => {
          const dataset = {}
          for (const key of Object.keys(el.dataset)) {
            dataset[key] = el.dataset[key]
          }
          // 模拟 e.currentTarget.dataset
          e.currentTarget = { dataset }
          this[method](e)
        })
      }
    })

    // data-change 系列（checkbox / switch 的 change 事件）
    // 使用容器级事件委托：checkbox 在重渲染（innerHTML 重建）后仍能正常触发，
    // 避免对 checkbox 逐个绑定在重建后丢失
    if (!this._container._changeBound) {
      this._container.addEventListener('change', (e) => {
        const el = e.target && e.target.closest ? e.target.closest('[data-change]') : null
        if (!el) return
        const action = el.dataset.change
        // 直接用 methods 中的原始方法并绑定 this 调用，不依赖实例上的绑定方法
        const handler = this.methods && this.methods[action]
        if (action && typeof handler === 'function') {
          // 原生 Event 的 currentTarget 是只读属性，无法覆盖；
          // 构造轻量事件对象传递 dataset（currentTarget 模拟 + target 保留实际控件）
          handler.call(this, {
            currentTarget: { dataset: el.dataset },
            target: e.target
          })
        }
      })
      this._container._changeBound = true
    }

    // data-input 系列（range 滑块等**需要边拖边响应**的控件）
    // ★ 为什么单列一套：`change` 对 range 只在**松手**时触发，拖动过程中完全静默；
    //   而调"原子透明度"这类参数时用户要边拖边看效果（松手才变会让人以为坏了）。
    //   机制与 data-change 完全一致，只是监听 `input`。
    if (!this._container._inputBound) {
      this._container.addEventListener('input', (e) => {
        const el = e.target && e.target.closest ? e.target.closest('[data-input]') : null
        if (!el) return
        const action = el.dataset.input
        const handler = this.methods && this.methods[action]
        if (action && typeof handler === 'function') {
          handler.call(this, {
            currentTarget: { dataset: el.dataset },
            target: e.target
          })
        }
      })
      this._container._inputBound = true
    }
  }
}

export default BaseComponent
