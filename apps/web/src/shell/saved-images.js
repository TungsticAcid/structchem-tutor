/**
 * saved-images.js —— 「打开保存位置」里那一步**纯逻辑**：把目录里已保存的图片列出来。
 *
 * ★ 为什么单独一个文件、且**不 import 任何东西**：
 *   `shell/save-image.js` 引了 `@i18n/index.js` 这类**别名**，Node 里跑不起来；
 *   而"列目录、过滤图片、按时间排序、限条数"这件事**不需要浏览器**，抽出来就能单测
 *   （测试里给一个假的目录对象即可 —— 真的 FileSystemDirectoryHandle 造不出来）。
 *
 * ★ 浏览器限制（先讲清楚，免得期待错）：网页**没有**"打开系统资源管理器"的能力，
 *   也拿不到目录的绝对路径（句柄只给 `name`）。所以这个功能的形态是
 *   **应用内打开保存位置**：列缩略图、可预览/下载。真正弹出 Explorer 需要桌面壳的桥，
 *   网页里做不到。
 */

/** 认哪些扩展名（保存出来的都是 png；手动放进去的 jpg/webp 也一并列出来） */
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)$/i

/**
 * 列出一个目录句柄里的图片。
 *
 * @param {Object} dir   FileSystemDirectoryHandle（或测试用的同形假对象）
 * @param {Object} [opts]
 * @param {number} [opts.limit=60] 最多列多少条（目录可能很大；界面不做分页）
 * @returns {Promise<Array<{name:string, file:File, size:number, lastModified:number}>>}
 *          按修改时间**从新到旧**；目录不可读时返回空数组（不抛）
 */
export async function listSavedImages(dir, opts) {
  const limit = (opts && opts.limit) || 60
  if (!dir || typeof dir.values !== 'function') return []
  const out = []
  try {
    for await (const entry of dir.values()) {
      if (!entry) continue
      // 只认文件（子目录跳过）
      if (entry.kind && entry.kind !== 'file') continue
      if (!IMAGE_RE.test(entry.name || '')) continue
      try {
        const file = await entry.getFile()
        out.push({ name: entry.name, file, size: file.size || 0, lastModified: file.lastModified || 0 })
      } catch (e) { /* 单个文件读失败：跳过，不影响其余 */ }
      // ★ 早停：目录可能放着成百上千个文件，而我们只要最近的几十张
      if (out.length >= limit * 3) break
    }
  } catch (e) {
    return []
  }
  out.sort((a, b) => b.lastModified - a.lastModified)
  return out.slice(0, limit)
}

/** 人类可读的大小（缩略图旁边显示用） */
export function formatSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}
