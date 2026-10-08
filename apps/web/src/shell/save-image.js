/**
 * save-image.js —— 把「保存图片」统一装在壳这一层
 *
 * 用户要求：「支持对各个可视化窗口截图，可设置是否隐藏文字内容，可设置图片保存位置。」
 * 后续又提了三条：①「第一次下载图片需要设置下载路径，之后也应可随时修改下载路径」；
 * ②「浅色模式下，点群观鉴中，下载图片的对话框里的字看不清」；
 * ③「晶典在线保存的图片是空的」。
 *
 * ★ 为什么装在壳里而不是各页各加一条：这与「回门户」是同一类问题 ——
 *   "把当前这一屏存成图"是**每一页**都该有的能力，逐页去加必然漏。
 *
 * ★★ 为什么不能直接 `canvas.toDataURL()`（咬过两次的坑）：
 *   three.js 默认 `preserveDrawingBuffer: false` —— 画布内容在**合成之后就被丢弃**。
 *   本仓库两次踩到：一次是判据恒真（八次采样得到同一张空白 PNG），
 *   一次就是用户报的「晶典在线保存的图片是空的」。
 *   两种情形要分开治：
 *     · **每帧都渲染**的页（轨道视界 / 点群观鉴）：排到应用那一帧之后读就行（双层 rAF）；
 *     · **按需渲染**的页（晶典在线：invalidate + 1 Hz 兜底）：可能整帧都没画过，
 *       缓冲里什么都没有 ⇒ 抓图前必须**先请它渲染一帧**
 *       （`chem-agent:before-capture` 事件 → 页面调 `invalidate()`），再读。
 *
 * ★ 保存位置：用 File System Access API 让用户**挑一个文件夹并记住它**
 *   （`showDirectoryPicker` + IndexedDB 存句柄）。菜单里随时能改。
 *   不支持该 API 的浏览器退化为普通下载，并**如实说明**（不假装能选）。
 */
// ★ 样式不在这里 import：本模块要能在 Node 里被测试，而 Node 不认 .css。见 main.js。
// ★ i18n 同理：只为"带变量的动态串"引 `t()`（静态字面量走 DOM 扫描替换）。
import { t } from '@i18n/index.js'

/** 可作为落点的顶栏（与 home-affordance 同一张表——两处不同步会让两个按钮分开） */
const ANCHORS = ['[data-page-topbar]', '.page-nav', '#toolbar', '.topbar', '.top-bar', '.cp-top-bar']

/** 抓图时一律隐藏的浮层（顶栏/徽标/提示/悬浮球/壳自己的按钮） */
export const HIDE_SELECTORS = [
  '.shell-home', '.shell-save', '.shell-save-menu', '.agent-fab', '.agent-drawer',
  '.page-nav', '#toolbar', '.topbar', '.top-bar', '.cp-top-bar', '.settings-entry',
  '.viewer-chips', '.orbit-topbar', '.hint', '.badge', '.loading-mask',
]

// ---------------------------------------------------------------------------
// 保存位置的记忆（IndexedDB 存目录句柄；FileSystemHandle 可结构化克隆）
// ---------------------------------------------------------------------------
const IDB_NAME = 'chem-agent-fs'
const IDB_STORE = 'handles'
const IDB_KEY = 'imageDir'

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no-idb'))
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key) {
  try {
    const db = await idbOpen()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const rq = tx.objectStore(IDB_STORE).get(key)
      rq.onsuccess = () => resolve(rq.result || null)
      rq.onerror = () => reject(rq.error)
    })
  } catch (e) { return null }
}

async function idbSet(key, val) {
  try {
    const db = await idbOpen()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(val, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return true
  } catch (e) { return false }
}

/** 记住的目录句柄（内存缓存 + IndexedDB 持久化） */
let dirHandleCache
async function getDirHandle() {
  if (dirHandleCache !== undefined) return dirHandleCache
  dirHandleCache = (typeof window !== 'undefined' && window.showDirectoryPicker)
    ? await idbGet(IDB_KEY)
    : null
  return dirHandleCache
}
async function setDirHandle(h) {
  dirHandleCache = h
  await idbSet(IDB_KEY, h)
}

/** 当前保存位置的可读名字（没设过就返回空串） */
export async function currentDirName() {
  const h = await getDirHandle()
  return h ? String(h.name || '') : ''
}

/**
 * 挑一个保存文件夹（必须在用户手势里调用；不支持该 API 时返回 null）。
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function pickDir() {
  if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') return null
  const h = await window.showDirectoryPicker({ id: 'chem-agent-images', mode: 'readwrite' })
  await setDirHandle(h)
  return h
}

/** 保证句柄可写（浏览器可能把上次的授权降级了；必须在用户手势里请求） */
async function ensureWritable(h) {
  try {
    if (typeof h.queryPermission === 'function') {
      const q = await h.queryPermission({ mode: 'readwrite' })
      if (q === 'granted') return true
    }
    if (typeof h.requestPermission === 'function') {
      return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
    }
    return true
  } catch (e) { return false }
}

/**
 * 把"写权限"提前到**用户手势还活着**的时候拿。
 *
 * ★★ 2026-10-08 修（用户报：有的机器保存图片报
 *   「Failed to execute 'createWritable' on 'FileSystemFileHandle':
 *    The request is not allowed by the user agent or the platform in the current context.」）：
 *
 *   这是 Chromium 的 `NotAllowedError` —— 它的判据是**瞬时用户激活**（transient activation，
 *   约 5 秒），而 File System Access 的"要权限"动作（showSaveFilePicker / showDirectoryPicker /
 *   requestPermission / 未授权句柄上的 createWritable）**必须在激活期内调用**。
 *   原先的顺序是：**先抓图（异步：等一帧渲染 + 编码 PNG + 解码自检，慢机器上可能好几秒，
 *   空白还会重试到 3 次）→ 再叫选择器/写文件**。于是：
 *     · 快机器（<5 秒）→ 一切正常（用户自己那台就是这种）；
 *     · 慢机器 / 大画布 / 走了一次重试 → 激活早已过期，`createWritable` 直接抛这个错。
 *   现在把顺序倒过来：**先拿句柄与可写流（还在手势里）→ 再抓图 → 最后写**。
 *
 * @returns {Promise<FileSystemWritableFileStream|null>} 拿不到就返回 null（调用方走兜底）
 */
async function openWritableFor(handle, name) {
  if (!handle) return null
  try {
    if (!(await ensureWritable(handle))) return null
    const fh = await handle.getFileHandle(name, { create: true })
    return await fh.createWritable()
  } catch (e) {
    return null
  }
}

/** 把这次失败**如实**告诉用户，并给出可操作的下一步（不再甩英文异常原文） */
function describeSaveError(err) {
  const name = (err && err.name) || ''
  if (name === 'NotAllowedError') return t('shell.save.notAllowed')
  if (name === 'SecurityError') return t('shell.save.notAllowed')
  if (name === 'QuotaExceededError') return t('shell.save.noSpace')
  return t('shell.save.failed', { msg: (err && (err.message || err.name)) || '' })
}

// ---------------------------------------------------------------------------
// 安装按钮
// ---------------------------------------------------------------------------

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
    + '<label class="shell-save-row" title="勾上 = 图片没有底色（透明的，可直接贴到课件任意背景上）；取消 = 用当前页面的底色铺一层"><input type="checkbox" data-role="transparent" checked> 透明背景</label>'
    + '<div class="shell-save-acts">'
    + '<button type="button" class="shell-save-go" data-role="save">保存图片</button>'
    + '<button type="button" class="shell-save-as" data-role="saveas">另存为…</button>'
    + '</div>'
    + '<div class="shell-save-acts"><button type="button" data-role="pick-dir">设置保存位置…</button></div>'
    + '<div class="shell-save-tip" data-role="tip"></div>'

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    menu.hidden = !menu.hidden
    if (!menu.hidden) void refreshDirTip(menu)
  })
  document.addEventListener('click', (ev) => {
    if (wrap.contains(ev.target)) return
    menu.hidden = true
  })

  const tip = (msg) => { menu.querySelector('[data-role="tip"]').textContent = msg || '' }

  menu.querySelector('[data-role="save"]').addEventListener('click', async () => {
    /**
     * ★★ 顺序很重要（见 openWritableFor 的长注释）：**先拿可写流，再抓图**。
     *   抓图是异步且可能好几秒的，而"要权限/开可写流"必须在瞬时用户激活期内完成。
     */
    let dir = await getDirHandle()
    if (!dir && typeof window.showDirectoryPicker === 'function') {
      // ★ 第一次：先让用户**挑一个文件夹**（用户要求的"首次需要设置下载路径"）
      try { dir = await pickDir() } catch (e) { dir = null }   // 取消不算错
    }
    const name = fileName()
    // 打开可写流（此刻还在手势里；句柄无效/被拒 → null，走兜底）
    let writable = dir ? await openWritableFor(dir, name) : null

    const url = await captureWith(canvas, root, menu)
    if (!url) {
      try { if (writable) await writable.abort() } catch (e) { /* 忽略 */ }
      tip(t('shell.save.failedCapture'))
      return
    }

    if (writable) {
      try {
        const blob = await (await fetch(url)).blob()
        await writable.write(blob)
        await writable.close()
        tip(t('shell.save.savedTo', { dir: (dir && dir.name) || '' }))
        return
      } catch (e) {
        try { await writable.abort() } catch (e2) { /* 忽略 */ }
        // ★ 写失败要**说清楚原因**，再如实降级为下载（不能只丢一句"权限不足"）
        download(url, name)
        tip(describeSaveError(e) + ' ' + t('shell.save.fellBackToDownload'))
        return
      }
    }
    if (dir) {
      // 有目录却拿不到可写流：多半是浏览器把上次的授权降级了（或平台不允许）
      download(url, name)
      tip(t('shell.save.notAllowed') + ' ' + t('shell.save.fellBackToDownload'))
      return
    }
    // 走到这里 = 浏览器不支持该 API，或用户取消了选择
    download(url, name)
    tip(t('shell.save.downloaded'))
  })

  menu.querySelector('[data-role="saveas"]').addEventListener('click', async () => {
    /**
     * ★★ 同理：**先叫选择器并开可写流**（都在手势里），**再抓图**。
     *   原先是"抓图 → showSaveFilePicker → fetch(dataURL) → createWritable"：
     *   选择器本身会**消耗**用户激活，后面那次 `createWritable` 就可能在激活耗尽时抛
     *   `NotAllowedError`——正是用户截图里那句话。
     */
    if (typeof window.showSaveFilePicker !== 'function') {
      const url0 = await captureWith(canvas, root, menu)
      if (!url0) { tip(t('shell.save.failedCapture')); return }
      download(url0, fileName())
      tip(t('shell.save.noDirApi'))
      return
    }
    let handle = null
    let writable = null
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: fileName(),
        types: [{ description: 'PNG 图片', accept: { 'image/png': ['.png'] } }],
      })
      writable = await handle.createWritable()
    } catch (err) {
      if (err && err.name === 'AbortError') return          // 用户取消：什么都不做
      // 选择器/可写流失败 → 仍然把图给出去，并说明原因
      const url0 = await captureWith(canvas, root, menu)
      if (!url0) { tip(t('shell.save.failedCapture')); return }
      download(url0, fileName())
      tip(describeSaveError(err) + ' ' + t('shell.save.fellBackToDownload'))
      return
    }
    const url = await captureWith(canvas, root, menu)
    if (!url) {
      try { await writable.abort() } catch (e) { /* 忽略 */ }
      tip(t('shell.save.failedCapture'))
      return
    }
    try {
      const blob = await (await fetch(url)).blob()
      await writable.write(blob)
      await writable.close()
      tip(t('shell.save.saved'))
    } catch (err) {
      try { await writable.abort() } catch (e) { /* 忽略 */ }
      download(url, fileName())
      tip(describeSaveError(err) + ' ' + t('shell.save.fellBackToDownload'))
    }
  })

  menu.querySelector('[data-role="pick-dir"]').addEventListener('click', async () => {
    if (typeof window.showDirectoryPicker !== 'function') { tip(t('shell.save.noDirApi')); return }
    try {
      const h = await pickDir()
      tip(t('shell.save.dirSet', { dir: (h && h.name) || '' }))
    } catch (err) {
      if (err && err.name !== 'AbortError') tip(describeSaveError(err))
    }
  })

  wrap.appendChild(btn)
  wrap.appendChild(menu)
  const anchor = ANCHORS.map((s) => root.querySelector(s)).find(Boolean)
  if (anchor) anchor.appendChild(wrap)
  else { wrap.classList.add('shell-save-wrap--float'); root.appendChild(wrap) }
  return true
}

/** 菜单里那行小字：当前保存位置 */
async function refreshDirTip(menu) {
  const el = menu.querySelector('[data-role="tip"]')
  if (!el) return
  if (typeof window.showDirectoryPicker !== 'function') {
    el.textContent = t('shell.save.noDirApiHint')
    return
  }
  const name = await currentDirName()
  el.textContent = name ? t('shell.save.currentDir', { dir: name }) : t('shell.save.pickFirst')
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
 * 抓一张画布当前画面。
 *
 * ★★ 读的时机是这件事的关键（本仓库在这上面栽过三次，其中两次给的是"通过"）：
 *
 *   `preserveDrawingBuffer: false`（three 默认）时，画布内容**在每帧合成之后被丢弃**。
 *   所以必须在**同一帧内**"先渲染、再读"：
 *     · 先派发 `chem-agent:before-capture`，请页面**为下一帧**排一次渲染
 *       （按需渲染的页如晶典在线本来可能整帧不画，那样缓冲里什么都没有）；
 *     · 然后**只排一层 rAF**：这次的读回调注册在页面那次渲染回调**之后**，
 *       于是同一帧内先渲染、后读 —— 读得到真实画面。
 *
 *   ⚠️ 曾经写成"两层 rAF"（第一层让应用渲染、第二层再读）：第二层已经跨过了
 *   **合成边界**，缓冲被清空 ⇒ 抓出来是一张**单色空白图**（实测：1414×807 的图
 *   只有 1 种颜色，而字节数 25 KB 看着"很正常"——"看文件大小"是个会骗人的判据）。
 *
 * ★ 因此这里加了**非空白自检**（下采样后数颜色数）：单色就重试，最多 3 次。
 *   验证手段自己会错，所以验证要能说话。
 *
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} root
 * @param {HTMLElement} menu 用来读"隐藏文字"那个勾
 * @returns {Promise<string>} dataURL（失败返回空串）
 */
export async function captureWith(canvas, root, menu) {
  const hideBox = menu && menu.querySelector('[data-role="hide-text"]')
  const hide = !!(hideBox && hideBox.checked)
  /**
   * ★ 「透明背景」默认**开**（用户报「晶典在线导出的图片仍然有底色」）：
   *   默认给的就是一张没有底色的图 —— 贴到课件、试卷、任意背景上都合用。
   *   取消勾选才铺一层页面底色（少数场景需要"所见即所得"）。
   */
  const alphaBox = menu && menu.querySelector('[data-role="transparent"]')
  const transparent = alphaBox ? !!alphaBox.checked : true
  setTextHidden(hide)
  try {
    let last = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      last = await captureOnce(canvas, transparent)
      if (last && !(await looksBlank(last))) return last
    }
    return last
  } finally {
    setTextHidden(false)
  }
}

/** 排一层 rAF 后读（见 captureWith 的长注释） */
function captureOnce(canvas, transparent) {
  return new Promise((resolve) => {
    // detail 里带上打算：页面据此决定要不要把清屏 alpha 设成 0（晶典/点群）
    try {
      window.dispatchEvent(new CustomEvent('chem-agent:before-capture', { detail: { transparent: !!transparent } }))
    } catch (e) { /* 忽略 */ }
    requestAnimationFrame(() => {
      let url = ''
      try {
        url = transparent ? canvas.toDataURL('image/png') : flattenOnBackground(canvas)
      } catch (e) {
        try { url = canvas.toDataURL('image/png') } catch (e2) { url = '' }
      }
      // ★ 抓完立刻请页面**恢复**清屏 alpha（否则屏幕上那张图一直透明着，露出页面底色）
      try { window.dispatchEvent(new CustomEvent('chem-agent:after-capture')) } catch (e) { /* 忽略 */ }
      resolve(url)
    })
  })
}

/**
 * 把画布**合成到页面底色**上再导出。
 *
 * ★ 用户问：「为什么点群观鉴和轨道视界保存的图片无背景色，而晶典在线保存的图片有背景色」。
 *   答案在三维渲染器的构造参数上：
 *     · 轨道视界 `new THREE.WebGLRenderer({ alpha: true })` ⇒ 画布**真透明**，
 *       `toDataURL()` 出来就是一张没有底色的图；
 *     · 点群观鉴的渲染器虽然不透明，但它的 clearColor 是模块自己的 `bgColor`
 *       （浅色档是纯白），而页面底色是一条渐变 —— 存下来是一片死白，看着也像"没背景"；
 *     · 晶典在线用 `alpha: false` + `setClearColor(bgColor)`，底色是跟着主题走的，
 *       所以它的图看着"有背景色"。
 *   ⇒ 与其去改三个渲染器（那会牵动它们在屏幕上的观感），不如在**导出这一步**统一：
 *     取画布背后那一层的实际底色（最近的、足够不透明的祖先背景，或渐变端点），
 *     先铺底再把画布画上去。这样"存下来的 = 屏幕上看到的"。
 *
 * ★ 必须在**同一帧内**做（见 captureWith）：`drawImage` 读的正是那块
 *   `preserveDrawingBuffer:false` 的缓冲，跨帧就空了。
 */
export function flattenOnBackground(canvas) {
  const w = canvas.width, h = canvas.height
  const off = document.createElement('canvas')
  off.width = w; off.height = h
  const ctx = off.getContext('2d')
  ctx.fillStyle = effectiveBackground(canvas)
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(canvas, 0, 0)
  return off.toDataURL('image/png')
}

/** 画布背后那一层的实际底色（够不透明的祖先背景 > 渐变端点 > 壳的 --bg > 白） */
function effectiveBackground(el) {
  let n = el && el.parentElement
  while (n && n.nodeType === 1) {
    const cs = getComputedStyle(n)
    const c = parseColor(cs.backgroundColor)
    if (c && c.a >= 0.9) return 'rgb(' + c.rgb.join(',') + ')'
    // 渐变：取**最后一个**颜色端点（径向渐变的外圈就是页面底色）
    const bi = cs.backgroundImage
    if (bi && bi.indexOf('gradient') >= 0) {
      const all = bi.match(/rgba?\([^)]+\)/g)
      if (all && all.length) {
        const last = parseColor(all[all.length - 1])
        if (last) return 'rgb(' + last.rgb.join(',') + ')'
      }
    }
    n = n.parentElement
  }
  const root = getComputedStyle(document.documentElement)
  const bg = (root.getPropertyValue('--bg') || '').trim()
  return bg || '#ffffff'
}

function parseColor(s) {
  const m = /rgba?\(([^)]+)\)/.exec(s || '')
  if (!m) return null
  const p = m[1].split(',').map(parseFloat)
  return { rgb: [p[0], p[1], p[2]].map((v) => Math.round(v || 0)), a: p.length > 3 ? p[3] : 1 }
}

/**
 * 判断这张图是不是"整幅同色"（= 空白 / 被清空的缓冲）。
 * ★ 不解整幅 PNG（慢）：画进一个 32×32 的小画布再数颜色。
 * ★ 解码是异步的 —— 用 `img.decode()`/onload 等，**不能**同步读（同步读会因
 *   `img.complete === false` 而永远判"不空白"，那等于没有自检）。
 * @returns {Promise<boolean>} true = 看起来是空白
 */
function looksBlank(url) {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      const done = () => {
        try {
          const c = document.createElement('canvas')
          c.width = 32; c.height = 32
          const ctx = c.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(img, 0, 0, 32, 32)
          const d = ctx.getImageData(0, 0, 32, 32).data
          // ★ 连 **alpha** 一起比：透明背景模式下"整幅全透明"才是空白，
          //   只看 RGB 会把"透明底 + 白色分子"误判成单色。
          const first = d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3]
          for (let i = 4; i < d.length; i += 4) {
            if (d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3] !== first) { resolve(false); return }
          }
          resolve(true)
        } catch (e) { resolve(false) }   // 判不了就当它不是空白，别把好图丢掉
      }
      img.onload = done
      img.onerror = () => resolve(false)
      img.src = url
    } catch (e) { resolve(false) }
  })
}

/** 文件名：页面标题 + 时间戳（同名文件不会互相覆盖） */
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
