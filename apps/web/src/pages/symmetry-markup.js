/**
 * symmetry-markup.js —— 分子对称性页面的结构与样式
 *
 * 直接取自上游 `Symmetry Viewer/H5/index.html`（`<style>` 与 `<body>` 两段），
 * **唯一改动是作用域化**：上游的 `:root` / `html, body, #app` / `body` 收进
 * `.sym-page`——那些选择器在单页应用里没问题，放进多页壳会改掉壳自己的令牌
 * （`--accent` 撞名、body 的 background 与 overflow 被顶掉）。
 *
 * ★ 单独成文件而不是内联进 symmetry.js：这样与上游的 diff 只需看这一个文件，
 *   而 symmetry.js 的正文可以逐字对照上游 main.js。
 */

/** 页面的样式（原 `index.html` 的 `<style>` 块） */
export const SYMMETRY_CSS = `    .sym-page {
      /**
       * ★★ 2026-10-05：面板底色/前景色改为**跟随全局主题**。
       *
       *   原先这里写死深色（rgba(30,34,48,.88) + 浅字）—— 那是上游单页应用的做法，
       *   而它进了统一壳之后，浅色主题下顶栏与信息面板**仍是两块黑的**
       *   （用户报「浅色模式下，点群观鉴中，部分背景仍为黑色」）。
       *   改用壳的令牌：深浅两套自动生效，本文件下面几十处 var(--panel-bg) 一处都不用改。
       *
       * ★ 但**不要**在这里重绑 --accent：--accent 取 var(--accent) 是**自引用**，
       *   整条声明会被判无效（不只是"没生效"，是 CSS 解析层面的循环）。
       *   删掉那一行，让壳的强调色透下来即可 —— 它本来就是随主题取的。
       *
       * ★★ 本文件整段是一个**模板字符串**：注释里**不能出现反引号**，
       *   那会当场把字符串截断、整个页面白屏（本轮又踩了一次，已是第五次）。
       *   判据：改完这里立刻跑 apps/web/tools/test-shell.mjs（它会解析每个前端源文件）。
       */
      --panel-bg: var(--card-2, #1b2237);
      --panel-fg: var(--text, #e8eaf0);
      --border: var(--line, rgba(255, 255, 255, 0.12));
      /**
       * ★★ 深色主题下"浮动 UI 没有浅色下清晰"（用户报）—— **不是对比度问题**
       *   （实测两套主题的文字对比度扫描都是 0 处低于 3.5:1），而是**面板与背景分不开**：
       *   面板底色与三维视口底色都是深色、明度接近，边界糊成一片；浅色主题下白面板
       *   压在浅灰画布上天然有分界，所以看着更清楚。
       *   修法不是把面板调亮（那会破坏主题），而是给它**边界**：深色用重投影 + 略亮一档底色，
       *   浅色用轻投影（见文件末尾的 [data-theme="light"] 覆盖）。
       */
      --panel-shadow: var(--elevation-1, 0 10px 30px rgba(0, 0, 0, 0.55));
      /* 面板内部控件（下拉/输入）的底：深色主题下是"比面板略亮一点"，
         浅色主题下是"比面板略暗一点" —— 两套都由 --bg-2 给出 */
      --panel-item-bg: var(--bg-2, rgba(255, 255, 255, 0.08));
      /* 次级文字：原先写死的 #9aa3b5（浅字配深底），随主题取 text-dim */
      --panel-dim: var(--text-dim, #9aa3b5);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    /* ★ 原本是 html/body/#app —— 收进页面根：壳的 body 不能被某个页面锁死滚动 */
    .sym-page { position: relative; width: 100%; height: 100%; overflow: hidden; }
    /* ★ 原本写在 body 上：会覆盖壳的主题底色。改为页面根，并跟随主题令牌 */
    .sym-page {
      background: var(--bg, #eeeeee);
      font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    #viewer-container { position: absolute; inset: 0; }
    #viewer-container canvas { display: block; }

    /* 顶部工具栏 */
    #toolbar {
      position: absolute;
      top: 12px; left: 12px; right: 12px;
      display: flex; align-items: center; gap: 10px;
      /* ★ 允许换行：中文的「对称元素 / 标签 / 辅助几何 / 原子标签 / 设置」在窄屏能排一行，
       *   英文（Symmetry elements / Labels / Aux geometry / Atom labels / Settings）
       *   会一路挤出右边界 —— 而 #toolbar 是绝对定位浮层，溢出的按钮**没有任何滚动条能救**
       *   （实测 420px 下 5 个开关全部 right-out）。换行是这里唯一不损失可发现性的做法。 */
      flex-wrap: wrap;
      padding: 8px 12px;
      background: var(--panel-bg);
      color: var(--panel-fg);
      border-radius: 10px;
      border: 1px solid var(--border);
      backdrop-filter: blur(8px);
      /* ★ 浮起感（见 --panel-shadow 的说明）：深色主题下这条是**能不能看清面板边界**的关键 */
      box-shadow: var(--panel-shadow);
      z-index: 30; /* 需高于 info/settings/transform 面板，使展开的下拉不被遮挡 */
    }
    #toolbar .brand { font-weight: 700; font-size: 15px; letter-spacing: 1px; }
    #toolbar .brand span { color: var(--accent); }
    #toolbar select, #toolbar button {
      background: rgba(255,255,255,0.08);
      color: var(--panel-fg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 13px;
      cursor: pointer;
    }
    #toolbar select option { color: #222; }
    #toolbar .spacer { flex: 1; }
    #toolbar label.toggle { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
    #toolbar input[type="checkbox"] { accent-color: var(--accent); }
    #toolbar label.toggle.disabled { opacity: 0.35; pointer-events: none; }

    /* 自定义示例下拉（两列：点群 | 分子名） */
    .example-select { position: relative; min-width: 230px; }
    .example-select .es-current {
      display: flex; justify-content: space-between; align-items: center;
      background: var(--panel-item-bg); color: var(--panel-fg);
      border: 1px solid var(--border); border-radius: 6px;
      padding: 6px 10px; font-size: 13px; cursor: pointer;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .example-select .es-cur-sym { color: var(--accent); font-weight: 600; font-size: 12px; font-family: "Segoe UI", "PingFang SC", sans-serif; }
    .example-select .es-current::after { content: '▾'; color: var(--panel-dim, #9aa3b5); font-size: 11px; margin-left: 8px; }
    .example-select .es-current.open::after { content: '▴'; }
    .example-select .es-list {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0;
      max-height: 340px; overflow-y: auto;
      background: var(--panel-bg); color: var(--panel-fg);
      border-radius: 8px; border: 1px solid var(--border);
      backdrop-filter: blur(8px); z-index: 30; padding: 4px 0;
    }
    .example-select .es-group-label {
      font-size: 11px; color: var(--panel-dim, #9aa3b5); padding: 8px 10px 4px;
      text-transform: uppercase; letter-spacing: 1px;
    }
    .example-select .es-item {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 10px; font-size: 13px; cursor: pointer;
    }
    .example-select .es-item:hover { background: var(--panel-item-bg); }
    .example-select .es-item.selected { background: rgba(124,156,245,0.18); }
    .example-select .es-sym {
      width: 66px; flex-shrink: 0; text-align: center;
      color: var(--accent); font-weight: 600; font-size: 12px;
      font-family: "Segoe UI", "PingFang SC", sans-serif;
    }
    .example-select .es-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* 信息面板 */
    #info-panel {
      position: absolute;
      top: 68px; left: 12px;
      width: 300px;
      max-height: calc(100% - 90px);
      overflow-y: auto;
      background: var(--panel-bg);
      color: var(--panel-fg);
      border-radius: 10px;
      border: 1px solid var(--border);
      backdrop-filter: blur(8px);
      box-shadow: var(--panel-shadow);
      padding: 14px;
      z-index: 10;
    }
    #info-panel .struct-title { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
    #info-panel .struct-formula { font-size: 12px; color: var(--panel-dim, #9aa3b5); margin-bottom: 10px; }
    #info-panel .group-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
    #info-panel .group-symbol {
      font-size: 26px; font-weight: 800; color: var(--accent); letter-spacing: 0.5px;
    }
    #info-panel .group-name { font-size: 13px; color: var(--panel-fg, #c2c9d8); }
    #info-panel .meta { font-size: 12px; color: var(--panel-dim, #9aa3b5); margin: 4px 0 10px; }
    #info-panel h4 {
      font-size: 12px; color: var(--panel-dim, #9aa3b5); font-weight: 600;
      margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 1px;
    }
    #info-panel .elem-item {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 6px; font-size: 13px;
      border-radius: 5px; cursor: default;
    }
    #info-panel .elem-item:hover { background: var(--panel-item-bg); }
    #info-panel .elem-dot {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
    }
    #info-panel .elem-count { margin-left: auto; color: var(--panel-dim, #9aa3b5); font-size: 12px; }

    /* 设置面板 */
    #settings-panel {
      position: absolute;
      top: 68px; right: 12px;
      width: 240px;
      max-height: calc(100% - 90px);
      overflow-y: auto;
      background: var(--panel-bg);
      color: var(--panel-fg);
      border-radius: 10px;
      border: 1px solid var(--border);
      backdrop-filter: blur(8px);
      box-shadow: var(--panel-shadow);
      z-index: 20;
      overflow: hidden;
    }
    #settings-panel .settings-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 14px; font-weight: 600; font-size: 13px;
      border-bottom: 1px solid var(--border);
    }
    #settings-panel .settings-header button {
      background: none; border: none; color: var(--panel-fg); cursor: pointer; font-size: 14px;
    }
    #settings-panel .settings-body { padding: 12px 14px; }
    #settings-panel .setting-row {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 10px; font-size: 13px;
    }
    #settings-panel .setting-row input[type="range"] { width: 110px; }
    #settings-panel input[type="color"] {
      width: 40px; height: 26px; border: 1px solid var(--border); border-radius: 4px; background: none; cursor: pointer;
    }
    #settings-panel h4 {
      font-size: 12px; color: var(--panel-dim, #9aa3b5); margin: 10px 0 6px; text-transform: uppercase; letter-spacing: 1px;
    }
    #settings-panel .color-row {
      display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 13px;
    }
    #settings-panel .color-row label { flex: 1; }
    #settings-panel .danger {
      width: 100%; margin-top: 12px; padding: 8px;
      background: rgba(239,83,80,0.15); color: var(--danger, #ef5350);
      border: 1px solid rgba(239,83,80,0.4); border-radius: 6px; cursor: pointer; font-size: 13px;
    }

    /* 对称元素列表（可展开分组） */
    #info-panel .elem-group-header {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 6px; font-size: 13px;
      border-radius: 5px; cursor: pointer; user-select: none;
    }
    #info-panel .elem-group-header:hover { background: var(--panel-item-bg); }
    #info-panel .elem-arrow { margin-left: auto; color: var(--panel-dim, #9aa3b5); font-size: 11px; }
    #info-panel .elem-group-body { padding-left: 14px; margin-bottom: 2px; }
    #info-panel .elem-group-body .elem-item { display: flex; align-items: center; gap: 8px; padding: 3px 6px; font-size: 12px; }
    #info-panel .elem-group-body input[type="checkbox"] { accent-color: var(--accent); }
    #info-panel .elem-label { flex: 1; min-width: 0; }
    #info-panel .elem-play {
      width: 20px; height: 20px; flex-shrink: 0; margin-left: auto;
      background: rgba(124,156,245,0.18); color: var(--accent);
      border: 1px solid rgba(124,156,245,0.4); border-radius: 50%;
      font-size: 10px; line-height: 1; cursor: pointer; padding: 0;
    }
    #info-panel .elem-play:hover { background: rgba(124,156,245,0.35); }
    #info-panel .orb-row { display: flex; gap: 8px; padding: 3px 6px; font-size: 12px; word-break: break-word; }
    #info-panel .orb-row .orb-label { color: var(--panel-dim, #9aa3b5); flex-shrink: 0; }

    /* 特征标表 */
    #character-table-wrap .ct-header {
      font-size: 12px; color: var(--panel-dim, #9aa3b5); font-weight: 600;
      padding: 8px 6px; cursor: pointer; user-select: none;
      border-top: 1px solid var(--border); margin-top: 12px;
    }
    #character-table-wrap .ct-table { border-collapse: collapse; width: 100%; font-size: 11px; margin-top: 6px; }
    #character-table-wrap .ct-table th, #character-table-wrap .ct-table td {
      border: 1px solid var(--border); padding: 3px 4px; text-align: center;
    }
    #character-table-wrap .ct-table th { color: var(--panel-dim, #9aa3b5); font-weight: 600; }
    #character-table-wrap .ct-irrep { font-weight: 600; color: var(--accent); }
    #character-table-wrap .ct-basis { text-align: left; font-size: 10px; color: var(--panel-dim, #9aa3b5); }

    #hint {
      position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
      font-size: 12px; color: var(--panel-dim, #7a8090); background: var(--card, rgba(255,255,255,0.7));
      padding: 5px 14px; border-radius: 20px; z-index: 10; pointer-events: none;
    }

    /* 中英文长度差异适配 */
    #info-panel .group-name, #info-panel .group-symbol, #info-panel .struct-title, #info-panel .meta { word-break: break-word; }
    #settings-panel .setting-row { flex-wrap: wrap; gap: 4px 8px; }
    #settings-panel .setting-row label span[data-i18n] { word-break: break-word; }
    #toolbar label.toggle span, #toolbar button span { white-space: nowrap; }

    /* 动画进度条 */
    #anim-progress-wrap {
      position: absolute; bottom: 46px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      background: var(--panel-bg); color: var(--panel-fg);
      border: 1px solid var(--border); border-radius: 10px;
      padding: 8px 14px; z-index: 15; backdrop-filter: blur(8px);
      width: min(440px, 88vw);
    }
    #anim-progress-wrap[hidden] { display: none; }
    #anim-progress-wrap .anim-label { font-size: 12px; color: var(--panel-dim, #9aa3b5); white-space: nowrap; flex-shrink: 0; }
    #anim-progress-wrap button { flex-shrink: 0; }
    #anim-progress-wrap input[type="range"] { flex: 1 1 120px; min-width: 80px; accent-color: var(--accent); }
    #anim-progress-wrap button {
      background: none; border: none; color: var(--panel-fg); cursor: pointer; font-size: 14px; padding: 0 2px;
    }

    /**
     * 浅色/深色的投影差异由 --elevation-1 令牌自己带（见 tokens.css），
     * 这里不再各写一套 —— 原先那份"浅色覆盖"已经没有存在的必要。
     */
  `

/** 页面的结构（原 `index.html` 的 `<body>`，去掉 <script> 一行） */
export const SYMMETRY_HTML = `  <div class="sym-page">
    <div id="viewer-container"></div>

    <!-- 顶部工具栏 -->
    <div data-page-topbar id="toolbar">
      <div class="brand" data-i18n="brand">点群观鉴</div>
      <div class="example-select" id="example-select">
        <div class="es-current" id="example-current">选择示例</div>
        <div class="es-list" id="example-list" hidden></div>
      </div>
      <!-- 导入结构文件功能已注释（高校教学应用，以内置示例库为核心）
      <button id="import-btn" title="导入 XYZ / GJF / XSD / CIF / POSCAR 文件">📂 导入文件</button>
      <input type="file" id="file-input" accept=".xyz,.gjf,.com,.xsd,.cif,.vasp,.poscar" hidden />
      -->
      <div class="spacer"></div>
      <label class="toggle"><input type="checkbox" id="symmetry-toggle" checked /><span data-i18n="tool.symmetry">对称元素</span></label>
      <label class="toggle"><input type="checkbox" id="labels-toggle" /><span data-i18n="tool.labels">标签</span></label>
      <label class="toggle" data-i18n-title="tool.auxTitle" title="显示当前结构的辅助几何参考（立方体/二面角矩形），部分结构支持">
        <input type="checkbox" id="aux-toggle" /><span data-i18n="tool.aux">辅助几何</span>
      </label>
      <label class="toggle" title="在原子球心显示元素符号标签"><input type="checkbox" id="atom-label-toggle" /><span data-i18n="tool.atomLabel">原子标签</span></label>
      <button id="settings-btn" data-i18n-title="tool.settingsTitle" title="自定义外观与颜色"><span data-i18n="tool.settings">设置</span></button>
    </div>

    <!-- 信息面板 -->
    <div id="info-panel">
      <div class="struct-title" id="struct-title">—</div>
      <div class="struct-formula" id="struct-formula"></div>
      <div class="group-row">
        <div class="group-symbol" id="group-symbol">—</div>
        <div class="group-name" id="group-name"></div>
      </div>
      <div class="meta" id="group-meta"></div>
      <h4 data-i18n="info.symSection">对称元素</h4>
      <div id="elements-list"></div>
      <div id="orbit-wrap" hidden>
        <h4 data-i18n="orb.title">原子轨道 / 稳定化子</h4>
        <div id="orbit-body"></div>
      </div>
      <div id="character-table-wrap"></div>
    </div>

    <!-- 设置面板 -->
    <div id="settings-panel" hidden>
      <div class="settings-header"><span data-i18n="set.title">外观设置</span><button id="settings-close">✕</button></div>
      <div class="settings-body">
        <!-- ★ 2026-10-05 删掉了这里的「语言」下拉（用户要求）：
             全站 i18n 已经接管界面文案，语言入口在**设置弹层的「界面」组**
             （每一页都能打开），页面自己再来一个只会让人不知道该信哪个。
             ⚠ 只删这一行的 markup 不够，逻辑侧的两处（openSettings 里的回填、
             set-lang 的 change 监听）也一并删了 —— 留着会在 boot 期因为
             getElementById 拿到 null 而抛 TypeError，整页起不来。
             ⚠ 本文件整份是一个模板字符串：注释里写反引号会把模板截断成语法错误。 -->
        <div class="setting-row"><label><span data-i18n="set.bg">背景色</span></label><input type="color" id="set-bg" /></div>
        <div class="setting-row"><label><span data-i18n="set.atomScale">原子缩放</span> <span id="set-scale-val">1.0</span></label><input type="range" id="set-atom-scale" min="0.5" max="2" step="0.1" value="1" /></div>
        <div class="setting-row"><label><span data-i18n="set.stick">键粗细</span> <span id="set-stick-val">0.1</span></label><input type="range" id="set-stick-radius" min="0.03" max="0.3" step="0.01" value="0.1" /></div>
        <div class="setting-row"><label><span data-i18n="set.symScale">对称元素大小</span> <span id="set-sym-scale-val">1.0</span></label><input type="range" id="set-symmetry-scale" min="0.5" max="2" step="0.1" value="1" /></div>
        <div class="setting-row"><label><span data-i18n="set.labelFont">标签字号</span> <span id="set-label-font-val">40</span></label><input type="range" id="set-label-font-size" min="20" max="72" step="2" value="40" /></div>
        <div class="setting-row"><label><span data-i18n="anim.speed">旋转角速度（°/s）</span> <span id="set-anim-speed-val">60</span></label><input type="range" id="set-anim-speed" min="10" max="240" step="10" value="60" /></div>
        <div class="setting-row"><label><span data-i18n="anim.dur">反映/反演时长（ms）</span> <span id="set-anim-dur-val">3000</span></label><input type="range" id="set-anim-duration" min="500" max="10000" step="500" value="3000" /></div>
        <h4 data-i18n="set.elemColorSec">元素颜色</h4>
        <div id="set-element-colors"></div>
        <h4 data-i18n="set.symColorSec">对称元素颜色</h4>
        <div id="set-symmetry-colors"></div>
        <button id="set-reset" class="danger"><span data-i18n="set.reset">恢复默认设置</span></button>
      </div>
    </div>

    <div id="hint" data-i18n="hint">左键拖动旋转 · 右键拖动平移 · 滚轮缩放 · 双击复位</div>
    <div id="anim-progress-wrap" hidden>
      <div class="anim-label" data-i18n="anim.progress">动画进度</div>
      <button id="anim-toggle" data-i18n-title="anim.toggle" title="播放/暂停">▶</button>
      <button id="anim-inverse" data-i18n-title="anim.inverse" title="逆变换">⏮</button>
      <button id="anim-again" data-i18n-title="anim.again" title="再次操作">⏭</button>
      <input type="range" id="anim-progress" min="0" max="100" step="0.1" value="0" />
      <button id="anim-reset" data-i18n-title="anim.reset" title="重置变换">⟲</button>
      <button id="anim-close" data-i18n-title="anim.close" title="关闭动画">✕</button>
    </div>
  </div>`

export default { SYMMETRY_CSS, SYMMETRY_HTML }