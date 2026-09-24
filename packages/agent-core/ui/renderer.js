/**
 * renderer.js — 极简 Markdown + LaTeX 渲染器
 *
 * 为什么自带而不引入 marked.js：模块要保持**离线可用**（file:// 双击打开），
 * 每引一个依赖就要多一份本地化的资源与版本负担。这个渲染器覆盖教学对话
 * 实际用到的语法（标题/列表/表格/引用/加粗/斜体/行内代码/公式），足够。
 *
 * ★ 本文件是从 orbit/H5/js/agent/panel.js 第 23–161 行抽出的，逻辑未改。
 *   唯一变化：KaTeX 由 `window.katex` 改为创建参数注入（便于测试与多端复用）。
 *
 * 来源：orbit/H5/js/agent/panel.js，2026-09-24 迁入。
 */

/**
 * 创建渲染器。
 * @param {Object} [opts]
 * @param {Object} [opts.katex] KaTeX 对象（需有 renderToString）。缺省取 globalThis.katex；
 *                              缺席时公式退化为等宽源码——**总比空白好**
 * @param {Object} [opts.katexOptions] 传给 KaTeX 的选项
 */
export function createRenderer(opts = {}) {
  const katex = opts.katex || (typeof globalThis !== 'undefined' ? globalThis.katex : null)
  const KATEX_OPTS = Object.assign(
    { throwOnError: false, trust: true, output: 'html' },
    opts.katexOptions || {},
  )

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  }

  /**
   * 裁掉"还没写完"的公式尾巴。
   *
   * ★ 这是流式输出下"公式很混乱"的主要来源：模型逐 token 吐字，在配对的
   *   $ 出现之前，整段 LaTeX 源码会以纯文本裸露出来（"系数各为 $\frac{1}{2"）。
   *   每写一个公式就闪一次源码，一行里两个公式就闪两次。
   *   做法：把未闭合的那一段整段截掉——宁可晚几十毫秒出现，也不要露源码。
   *   转义符 \$ 会被跳过，避免把正文里的美分符号当成公式起点。
   */
  function trimUnclosedFormula(text) {
    const t = String(text == null ? '' : text)
    let openAt = -1
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '\\') { i++; continue }        // 跳过转义字符
      if (t[i] !== '$') continue
      const isBlock = t[i + 1] === '$'
      if (openAt < 0) openAt = i                  // 开公式
      else { openAt = -1 }                        // 配对成功
      if (isBlock) i++
    }
    return openAt < 0 ? t : t.slice(0, openAt)
  }

  /** 单个公式 → KaTeX HTML；KaTeX 缺席或报错时退化为等宽源码 */
  function katexHtml(tex, display) {
    if (!katex) return '<code>' + escapeHtml(tex) + '</code>'
    try {
      return katex.renderToString(tex, Object.assign({ displayMode: display }, KATEX_OPTS))
    } catch (e) {
      return '<code>' + escapeHtml(tex) + '</code>'
    }
  }

  /**
   * 渲染消息正文为 HTML。
   *
   * ★ 次序很关键（原先就错在这里）：
   *   1) 先裁掉未闭合的公式（流式时）
   *   2) 把块级公式 $$…$$ 抽成占位符，**并在两侧强制断行**
   *   3) 再把行内公式 $…$ 抽成占位符
   *   4) 此时剩下的才是纯文本 → 可以安全地 escapeHtml（公式里的 & < > 不受影响）
   *   5) 逐行组装：块公式独占一行 div，行内公式留在流式文本里
   *
   *   若把公式分出来后各段单独走 md()，每段都会变成一个块级 div，
   *   一句话就会被行内公式切成好几行——正是之前"公式很混乱"的原因。
   *   而 $$…$$ 若夹在文字中间不强制断行，display 模式的公式会和文字挤在
   *   同一个 div 里，把行高撑成两倍、上下留白对不齐，同样显得杂乱。
   *
   * @param {string} text
   * @param {Object} [o] { streaming:true } 时裁掉未闭合公式（流式增量渲染用）
   */
  function renderRich(text, o) {
    let s = String(text == null ? '' : text)
    if (o && o.streaming) s = trimUnclosedFormula(s)

    // 块公式：连同其两侧的换行一起吃掉，改为「前后各一个换行」，
    // 这样无论模型写成独占一行还是夹在句中，落到的都是同一个块级位置
    const blocks = []
    s = s.replace(/\n*\$\$([\s\S]+?)\$\$\n*/g, (m, tex) => {
      blocks.push(tex)
      return '\n\u0001' + (blocks.length - 1) + '\u0001\n'
    })

    const inlines = []
    s = s.replace(/\$([^$\n]+?)\$/g, (m, tex) => {
      inlines.push(tex)
      return '\u0002' + (inlines.length - 1) + '\u0002'
    })

    s = escapeHtml(s)

    s = s.replace(/\u0002(\d+)\u0002/g, (m, i) => katexHtml(inlines[+i], false))

    return md(s, blocks)
  }

  /**
   * 逐行组装：标题 / 列表 / 表格 / 块公式 / 段落。
   * 每个内容行只包一个 div，因此行内的公式与文字能正常连成一句。
   */
  function md(src, blocks) {
    const lines = String(src).split('\n')
    const out = []
    let inList = false
    let inTable = false
    const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }
    const closeTable = () => { if (inTable) { out.push('</tbody></table>'); inTable = false } }
    const inline = (t) => t
      .replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*\w])\*([^*\n]+?)\*/g, '$1<i>$2</i>')
      .replace(/`([^`\n]+?)`/g, '<code>$1</code>')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // 块级公式：独占一行，左右居中、超宽可横向滚动（长公式不撑破抽屉）
      const bm = /^\s*\u0001(\d+)\u0001\s*$/.exec(line)
      if (bm) {
        closeList(); closeTable()
        out.push('<div class="md-math-block">' + katexHtml((blocks || [])[+bm[1]] || '', true) + '</div>')
        continue
      }

      if (/^\s*\|.*\|\s*$/.test(line)) {
        const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()))
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue
        const isHeader = !inTable
        if (!inTable) { out.push('<table class="md-table"><thead>'); inTable = true }
        if (isHeader) out.push('<tr>' + cells.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>')
        else out.push('<tr>' + cells.map((c) => '<td>' + c + '</td>').join('') + '</tr>')
        continue
      }
      closeTable()

      const h = /^(#{1,4})\s+(.*)$/.exec(line)
      if (h) { closeList(); out.push('<div class="md-h">' + inline(h[2]) + '</div>'); continue }

      const li = /^\s*[-*·]\s+(.*)$/.exec(line)
      if (li) {
        if (!inList) { out.push('<ul>'); inList = true }
        out.push('<li>' + inline(li[1]) + '</li>')
        continue
      }
      closeList()

      if (line.trim() === '') { out.push('<div class="md-gap"></div>'); continue }
      // 引用块
      if (/^&gt;\s?/.test(line)) { out.push('<div class="md-quote">' + inline(line.replace(/^&gt;\s?/, '')) + '</div>'); continue }
      out.push('<div class="md-line">' + inline(line) + '</div>')
    }
    closeList(); closeTable()
    return out.join('')
  }

  return { escapeHtml, trimUnclosedFormula, katexHtml, renderRich, md, mdInline, KATEX_OPTS }
}

/**
 * 轻量标记转换：**专用于「用 innerHTML 渲染的界面文案」**（不是助手消息）。
 *
 * ★ 与 renderRich 的分工，别混用：
 *   · 助手消息走 renderRich —— 有 Markdown 块级语法，且公式要过 KaTeX
 *   · 界面文案（预设说明、滑块旁注等）直接 innerHTML 注入，**既不过 Markdown
 *     也不过 KaTeX**，于是 `**加粗**` 会原样显示星号、`p_x` 会原样显示下划线。
 *     这类"静默显示成源码"的问题不影响逻辑、不报错，只有肉眼盯着那个界面才看得见。
 *
 * ★ 下标只认 s/p/d 前缀（`p_x`、`p_{xy}`），刻意不做通用的「任意字母_」：
 *   界面文案里出现下划线的场合（文件名、变量名）也不少，放宽会误伤。
 *   要支持更多前缀，用 opts.prefix 传入即可。
 *
 * @param {string} s
 * @param {Object} [opts]
 * @param {string} [opts.prefix='spd'] 允许作为下标主体的字母集
 * @returns {string} 可直接用于 innerHTML 的字符串
 */
export function mdInline(s, opts = {}) {
  const prefix = opts.prefix || 'spd'
  const cls = '[' + prefix + ']'
  return String(s == null ? '' : s)
    .replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>')
    .replace(new RegExp('(' + cls + ')_\\{([^}]+)\\}', 'g'), '$1<sub>$2</sub>')
    .replace(new RegExp('(' + cls + ')_([A-Za-z0-9])', 'g'), '$1<sub>$2</sub>')
}

export default createRenderer
