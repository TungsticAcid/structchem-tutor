/**
 * save-image.js —— 把「保存图片」统一装在壳这一层
 *
 * 用户要求：「增加保存图片功能，支持对各个可视化窗口截图，可设置是否隐藏文字内容，
 * 可设置图片保存位置。」
 *
 * ★ 为什么装在壳里而不是各页各加一条：这与「回门户」是同一类问题 ——
 *   "把当前这一屏存成图"是**每一页**都该有的能力，逐页去加必然漏（新模块、新页面）。
 *   壳里装一次，所有带画布的路由都有了。
 *
 * ★★ 为什么不能直接 `canvas.toDataURL()`（这一条是实打实的坑，本仓库已被咬两次）：
 *   three.js 默认 `preserveDrawingBuffer: false` —— 画布内容在**合成之后就被丢弃**，
 *   在 rAF 回调之外读回来是**空白**（上一轮我用它做过指纹判据，八次采样得到同一张 20 KB
 *   空白 PNG，于是"前后相同"恒真）。所以这里**必须**排在应用自己那一帧渲染之后读：
 *   用**双层 rAF**（第一层让应用先渲染，第二层再读缓冲）。
 *
 * ★ "隐藏文字内容"分两类，两类都要管：
 *   · **DOM 浮层**（徽标/提示条/顶栏/面板）：抓图前给 <html> 加一个类，用一条 CSS 全隐掉；
 *   · **画在画布里的文字**（点群页的标签精灵、晶体的原子标签、轨道图表的坐标与标题）：
 *     CSS 管不到，只能请页面自己关 —— 用 CustomEvent `chem-agent:hide-text` 通知，
 *     页面收到后把自己的标签开关关掉（已经接线的是对称页与晶体页）。
 *
 * ★ "设置图片保存位置"：能用 File System Access API（`showSaveFilePicker`，Chromium 有）
 *   就让用户**选目录与文件名**；不支持时退化为普通的下载（下载目录由浏览器设置决定）——
 *   提示里说明这一点，不假装能选。
 */
// ★ 样式不在这里 import：本模块要能在 Node 里被测试，而 Node 不认 .css。见 main.js。
// ★ i18n 同理：这里**只**为"带变量的动态串"引 `t()`（静态字面量走 DOM 扫描替换，
//   登记在 shell 区字典里）—— 按本仓库的判据：会不会以整段文本节点出现在 DOM 上。
import { t } from '@i18n/index.js'

/** 可作为落点的顶栏（与 home-affordance 同一张表——两处不同步会让两个按钮分开） */
const ANCHORS = ['[data-page-topbar]', '.page-nav', '#toolbar', '.topbar', '.top-bar', '.cp-top-bar']

/** 抓图时一律隐藏的浮层（顶栏/徽标/提示/悬浮球/壳自己的按钮） */
export const HIDE_SELECTORS = [
  '.shell-home', '.shell-save', '.shell-save-menu', '.agent-fab', '.agent-drawer',
  '.page-nav', '#toolbar', '.topbar', '.top-bar', '.cp-top-bar', '.settings-entry',
  '.viewer-chips', '.orbit-topbar', '.hint', '.badge', '.loading-mask',
]

/**
 * 在页面里装上「保存图片」入口。
 * @param {HTMLElement} root 路由容器
 * @returns {boolean} 是否装上了
 */
export function installSaveButton(root) {
  if (!root) return false
  if (root.querySelector('[data-shell-save]')) return false
  const canvas = pickCanvas(root)
  if (!canvas) return false   // 这条路由没有画布 → 不该给一个点了没用的按钮

  const wrap = document.createElement('div')
  wrap.className = 'shell-save-wrap'
  wrap.setAttribute('data-shell-save', '')

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'shell-save'
  btn.title = '把当前视图保存成图片'
  btn.innerHTML = '<span aria-hidden="true">⤓</span><span class="shell-save__label">图片</span>'

  const menu = document.createElement('div')
  menu.className = 'shell-save-menu'
  menu.hidden = true
  menu.innerHTML = ''
    + '<label class="shell-save-row"><input type="checkbox" data-role="hide-text"> 隐藏文字内容</label>'
    + '<div class="shell-save-acts">'
    + '<button type="button" class="shell-save-go" data-role="save">保存图片</button>'
    + '<button type="button" class="shell-save-as" data-role="saveas">另存为…</button>'
    + '</div>'
    + '<div class="shell-save-tip" data-role="tip"></div>'

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    menu.hidden = !menu.hidden
  })
  // 点别处收起
  document.addEventListener('click', (ev) => {
    if (wrap.contains(ev.target)) return
    menu.hidden = true
  })

  const tip = (msg) => { menu.querySelector('[data-role="tip"]').textContent = msg || '' }

  menu.querySelector('[data-role="save"]').addEventListener('click', async () => {
    const url = await captureWith(canvas, root, menu)
    if (!url) { tip('抓图失败：画布还没画好，稍等一下再试'); return }
    download(url, fileName())
    tip('已保存到浏览器的下载目录')
  })
  menu.querySelector('[data-role="saveas"]').addEventListener('click', async () => {
    if (typeof window.showSaveFilePicker !== 'function') {
      // ★ 不假装能选位置：说清浏览器不支持，并给出退路
      const url = await captureWith(canvas, root, menu)
      if (url) download(url, fileName())
      tip('本浏览器不支持选保存位置，已放到下载目录')
      return
    }
    const url = await captureWith(canvas, root, menu)
    if (!url) { tip('抓图失败：画布还没画好，稍等一下再试'); return }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName(),
        types: [{ description: 'PNG 图片', accept: { 'image/png': ['.png'] } }],
      })
      const blob = await (await fetch(url)).blob()
      const w = await handle.createWritable()
      await w.write(blob)
      await w.close()
      tip('已保存')
    } catch (err) {
      // 用户取消不算失败
      // ★ 这一条走 `t()`：它拼了错误信息，运行时的文本节点是**整句**，
      //   登记进扫描替换表（按 `保存失败：` 前缀）是查不到的 —— 那正是
      //   本仓库记过的"插值外的静态中文只能改写走 t()"。
      if (err && err.name !== 'AbortError') tip(t('shell.save.failed', { msg: err.message || err.name }))
    }
  })

  wrap.appendChild(btn)
  wrap.appendChild(menu)
  const anchor = ANCHORS.map((s) => root.querySelector(s)).find(Boolean)
  if (anchor) anchor.appendChild(wrap)
  else { wrap.classList.add('shell-save-wrap--float'); root.appendChild(wrap) }
  return true
}

/** 页面里最像"主视图"的那块画布（多个画布时取面积最大的） */
export function pickCanvas(root) {
  const list = Array.from(root.querySelectorAll('canvas')).filter((c) => {
    const r = c.getBoundingClientRect()
    return r.width > 80 && r.height > 80
  })
  if (!list.length) return null
  list.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
    return (rb.width * rb.height) - (ra.width * ra.height)
  })
  return list[0]
}

/**
 * 隐藏/恢复"文字内容"。
 * @param {boolean} hide
 */
export function setTextHidden(hide) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  if (!html) return
  if (hide) html.classList.add('export-hide-text')
  else html.classList.remove('export-hide-text')
  // ★ 画在画布里的文字只能请页面自己关（CSS 管不到）
  try {
    window.dispatchEvent(new CustomEvent('chem-agent:hide-text', { detail: { hide } }))
  } catch (e) { /* 老浏览器没有 CustomEvent 构造器：忽略，DOM 那部分仍然生效 */ }
}

/**
 * 抓一张画布当前画面（双层 rAF，见文件头说明）。
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} root
 * @param {HTMLElement} menu 用来读"隐藏文字"那个勾
 * @returns {Promise<string>} dataURL（失败返回空串）
 */
export function captureWith(canvas, root, menu) {
  const box = menu && menu.querySelector('[data-role="hide-text"]')
  const hide = !!(box && box.checked)
  return new Promise((resolve) => {
    setTextHidden(hide)
    const read = () => {
      let url = ''
      try { url = canvas.toDataURL('image/png') } catch (e) { url = '' }
      setTextHidden(false)
      resolve(url)
    }
    // 第一层 rAF：应用自己的渲染回调先跑（它排在前面）；
    // 第二层 rAF：确保读的时候缓冲里**确实是刚画完的那一帧**。
    requestAnimationFrame(() => requestAnimationFrame(read))
  })
}

/** 文件名：页面标题 + 时间戳（同名文件在下载目录里不会互相覆盖） */
export function fileName() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
    + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
  const title = String((typeof document !== 'undefined' && document.title) || 'chem-agent')
    .replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)
  return title + '-' + stamp + '.png'
}

/** 触发一次下载 */
export function download(url, name) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export default installSaveButton
/** 别名：宿主那侧读起来更顺（installSaveImage(app)） */
export const installSaveImage = installSaveButton
