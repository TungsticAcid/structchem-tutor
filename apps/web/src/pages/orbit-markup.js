/**
 * orbit-markup.js —— 原子轨道页面的结构
 *
 * 取自上游 `orbit/H5/index.html` 的 `<body>`（去掉 `<script>` 与注释块），
 * 外面套了一层 `<div class="orbit-page">` —— 样式的作用域挂靠点。
 * 样式在 `orbit-page.css`（同样被作用域化了，见那里的说明）。
 */
export const ORBIT_HTML = `<div class="orbit-page">
<header data-page-topbar class="topbar">
    <div class="brand">
      <span class="logo">⚛</span>
      <h1>原子轨道三维可视化</h1>
      <span class="subtitle">Hydrogen-like Atomic Orbital Visualizer</span>
    </div>
    <div class="top-meta">
      <span id="orbitTitle" class="orbit-title">1s</span>
      <span id="modeBadge" class="badge">实函数</span>
    </div>
  </header>

  <main class="layout">
<section class="grid-main">
      <div class="card viewer-card">
        <div class="card-head">
          <span class="card-title">三维视图</span>
          <div class="card-head-right">
<button id="nodeBtn" class="btn btn-ghost" title="把节面画出来：径向节面（球壳）+ 角度节面（锥面 / 平面）">◇ 节面</button>
            <button id="resetView" class="btn btn-ghost" title="重置视角">⟳ 复位</button>
            <label class="chk"><input type="checkbox" id="autoRotate" checked /> 自动旋转</label>
          </div>
        </div>
        <div id="viewer" class="viewer"></div>
      </div>

      <aside class="card panel">
        <div class="card-head"><span class="card-title">量子数 / 显示模式</span></div>
<div class="panel-body">
<details class="adv-zone" id="zZone">
          <summary class="adv-summary">核电荷数 Z = 1</summary>
          <div class="set">
            <div class="row"><label for="zInput">核电荷数 <i>Z</i></label>
              <input type="number" id="zInput" class="num-val" min="1" max="36" step="1" value="1" /></div>
            <input type="range" id="zSlider" min="1" max="36" step="1" value="1" />
            <div class="hint"><i>Z</i> 价类氢离子（只含一个电子）写作 <i>X</i><sup>(<i>Z</i>−1)+</sup> ——
              1 氢 H · 2 氦离子 He⁺ · 3 锂离子 Li²⁺ · 4 铍离子 Be³⁺ · 6 碳离子 C⁵⁺ … 到 36 氪离子 Kr³⁵⁺<br>
              （换 <i>Z</i> 只缩放径向与能级，<b>不改轨道形状</b>；本模块按非相对论处理，<i>Z</i> 越大相对论效应越显著）</div>
          </div>
        </details>
        <div class="set">
          <div class="row"><label for="nInput">主量子数 <i>n</i></label>
            <input type="number" id="nInput" class="num-val" min="1" max="6" step="1" value="3" /></div>
          <input type="range" id="nSlider" min="1" max="6" step="1" value="3" />
        </div>
        <div class="set">
          <div class="row"><label for="lInput">角量子数 <i>l</i></label>
            <input type="number" id="lInput" class="num-val" min="0" max="2" step="1" value="1" /></div>
          <input type="range" id="lSlider" min="0" max="2" step="1" value="1" />
        </div>
        <div class="set" id="mSet">
          <div class="row"><label for="mInput">磁量子数 <i>m</i></label>
            <input type="number" id="mInput" class="num-val" min="-1" max="1" step="1" value="0" /></div>
          <input type="range" id="mSlider" min="-1" max="1" step="1" value="0" />
        </div>
<div class="set" id="realOrbSet" style="display:none">
          <div class="divider"><span>实轨道</span></div>
          <div class="seg wrap center" id="realOrbSeg"></div>
          <div class="hint" id="realOrbHint"></div>
        </div>

        <div class="divider"><span>视图对象</span></div>
<div class="seg center" id="targetSeg">
          <button class="seg-btn" data-target="spherical">球谐函数</button>
          <button class="seg-btn active" data-target="wave">空间波函数</button>
        </div>
<div class="set" id="yCritSet" style="display:none">
          <div class="row"><label>球谐判据</label>
            <div class="seg small" id="yCritSeg">
<button class="seg-btn active" data-k="Y">|<i>Y</i>|</button>
              <button class="seg-btn" data-k="Y2">|<i>Y</i>|²</button>
            </div>
          </div>
<div class="hint" id="yCritHint">|<i>Y</i>|² 的曲面比 |<i>Y</i>| 的"瘦"</div>
        </div>
        <div class="divider"><span>波函数形式</span></div>
        <div class="seg center" id="modeSeg">
          <button class="seg-btn active" data-mode="real"
                  title="波函数的实数解：由 ±m 两个复数解组合而来，不再是 L̂z 的本征函数；用实轨道名标记（p_x、d_xy…）">实数解</button>
          <button class="seg-btn" data-mode="complex"
                  title="波函数的复数解 ψ_{n,l,m}：L̂z 与 L̂² 的共同本征函数，用磁量子数 m 标记">复数解</button>
        </div>

        <div class="divider"><span>轨道模型</span></div>
        <div class="seg center" id="orbModelSeg">
          <button class="seg-btn active" data-model="hydrogenic"
                  title="真实类氢波函数：R(r) 是拉盖尔多项式乘 e^(−Zr/n)，2s 在 r = 2a₀ 处有一个径向节点。这是氢原子的解析解，也是知识条目与题库的基准。">氢型</button>
          <button class="seg-btn" data-model="slater"
                  title="Slater 型轨道（STO，最小基组）：R ∝ r^(n−1)·e^(−ζr)，2s 与 2p 共用同一个径向因子、**没有径向节点**，于是形状退化成纯角度分布 —— 这正是教材上那个干净的 sp³ 四瓣。计算化学用的就是这一族基函数。">Slater 型</button>
        </div>
        <div class="set" id="orbZetaSet" style="display:none">
          <div class="row"><label for="orbZetaInput"><i>ζ</i>（空＝<i>Z</i>/<i>n</i>）</label>
            <input type="number" id="orbZetaInput" class="num-val" min="0.05" max="20" step="0.005" placeholder="自动" /></div>
          <div class="hint">碳的 2s/2p 按 Slater 规则是 1.625（本页不自动算 σ，需手工填）</div>
        </div>
        <div class="hint" id="orbModelHint">氢型：真实类氢，2s 在 <i>r</i> = 2<i>a</i>₀ 处有径向节点</div>

        <div class="divider"><span>多轨道同屏</span></div>
        <div class="seg center" id="multiSeg">
          <button class="seg-btn active" data-s="off"
                  title="一次只看一个量子态（默认）">关闭</button>
          <button class="seg-btn" data-s="sp3"
                  title="四个等价 sp³ 同屏：指向正四面体，两两夹角 109.47°">sp³</button>
          <button class="seg-btn" data-s="sp2"
                  title="三个等价 sp² 同屏：共面、互成 120°">sp²</button>
          <button class="seg-btn" data-s="sp"
                  title="两个等价 sp 同屏：成 180° 直线">sp</button>
        </div>
        <div class="set" id="multiChkSet" style="display:none">
          <div class="row"><label>显示哪几个</label>
            <div class="seg small" id="multiChkSeg"></div></div>
        </div>
        <div class="hint" id="multiHint">开启后，一组等价轨道同时显示，每个一个颜色</div>
<div id="renderGroup">
          <div class="divider"><span>三维渲染</span></div>
          <div class="seg center" id="renderSeg">
            <button class="seg-btn" data-mode="points">电子云</button>
            <button class="seg-btn active" data-mode="surface">等值面</button>
          </div>
        </div>
<div class="set" id="psiCritSet">
          <div class="row"><label>等值面判据</label>
            <div class="seg small" id="psiSeg">
              <button class="seg-btn" data-mode="psi2"
                      title="画 |ψ|² 的等值面。函数处处非负，没有正负可谈 —— 曲面为纯色。">|<i>ψ</i>|²</button>
              <button class="seg-btn active" data-mode="psi"
                      title="画 ψ 本身的等值面（有正负）。实解在此双色。"><i>ψ</i></button>
            </div>
          </div>
        </div>

        <div class="set" id="levelSet">
<div class="row"><label for="levelInput">等值面阈值（%）</label>
            <input type="number" id="levelInput" class="num-val" min="0.3" max="80" step="0.01" value="21.8" /></div>
          <input type="range" id="levelSlider" min="0" max="1000" step="1" value="767" />
          <div class="hint" id="psiHint">阈值＝占 |ψ| 峰值的比例</div>
        </div>
        <div class="set" id="pointSet" style="display:none">
          <div class="row"><label for="pointCountInput">粒子数（万）</label>
            <input type="number" id="pointCountInput" class="num-val" min="0.8" max="8" step="0.1" value="5" /></div>
          <input type="range" id="pointCountSlider" min="8000" max="80000" step="1000" value="50000" />
        </div>

</div>
</aside>
    </section>
<section class="card formula-card">
      <div class="formula-head">
        <span class="card-title" id="formulaTitle">3p 轨道 · 波函数实数解</span>
      </div>
      <div id="formulaBox" class="formula-box"></div>
      <div id="formulaNote" class="formula-note"></div>
    </section>
<section class="grid-charts">
      <div class="card chart-card">
        <div class="card-head">
          <span class="card-title">径向分布</span>
          <div class="card-head-right">
            <div class="seg small" id="radialSeg">
              <button class="seg-btn active" data-k="R"><i>R</i></button>
              <button class="seg-btn active" data-k="R2"><i>R</i>²</button>
              <button class="seg-btn active" data-k="D"><i>D</i></button>
            </div>
            <div class="seg small" id="radialMarkSeg" title="在选中曲线上标出峰值 / 节点半径（两类可同时开）">
              <button class="seg-btn" data-m="peak">峰值</button>
              <button class="seg-btn" data-m="zeros">节点</button>
            </div>
          </div>
        </div>
<div class="hint" id="radialTermBar" style="display:none">
          显示的是叠加态中的
          <select class="chart-term" id="radialTermSel"></select>
          分量 —— 叠加态本身请看三维视图
        </div>
        <canvas id="radialChart" class="chart"></canvas>
        <div class="hint">各曲线分别按自身峰值归一化，故看形状与峰值位置、不比绝对高度；竖线标的是选中曲线的峰值 / 节点半径（峰值实线、节点虚线）</div>
      </div>

      <div class="card chart-card">
        <div class="card-head">
          <span class="card-title">角度部分的两个因子</span>
        </div>
        <div class="hint" style="margin-top:2px"><i>Y</i>(<i>θ</i>,<i>φ</i>) = <i>Θ</i>(<i>θ</i>) · <i>Φ</i>(<i>φ</i>)　—　左图极角自 +<i>z</i> 起，右图自 +<i>x</i> 起</div>
        <div class="hint" id="thetaPhiTermBar" style="display:none">
          显示的是叠加态中的
          <select class="chart-term" id="thetaPhiTermSel"></select>
          分量 —— 叠加态本身请看三维视图
        </div>
        <canvas id="thetaPhiChart" class="chart"></canvas>
        <div class="hint">上面三维里看到的是两者相乘的结果；这里看两个因子各自长什么样</div>
</div>
<div class="card chart-card" id="sectionCard">
        <div class="card-head">
          <span class="card-title">截面</span>
          <div class="seg small" id="planeSeg">
            <button class="seg-btn" data-p="xy"><i>xy</i></button>
            <button class="seg-btn active" data-p="xz"><i>xz</i></button>
            <button class="seg-btn" data-p="yz"><i>yz</i></button>
          </div>
        </div>
<div class="hint" id="sectionTermBar" style="display:none">
          显示
          <select class="chart-term" id="sectionTermSel"></select>
        </div>
<div class="seg small" id="phaseSeg" style="margin:2px 0 6px">
          <button class="seg-btn active" data-mode="intensity"
                  title="按该点 |ψ|² 的大小填色：越亮 = 密度越大 = 越可能在这里找到电子">|ψ|²</button>
          <button class="seg-btn" data-mode="phase"
                  title="按该点 ψ 的相位填色：实数解只有 0 与 π 两种色（即正负），复数解绕原点一周走完整圈">ψ</button>
          <button class="seg-btn" data-mode="contour"
                  title="|ψ|² 的等高线，白线标出节面（ψ = 0）—— 最适合用来数节面">等高线</button>
        </div>
        <canvas id="sectionChart" class="chart"></canvas>
<div class="chart-chip" id="sectionResetChip" style="display:none">⟲ 复位缩放</div>
      </div>
    </section>
  </main>
<footer class="foot">电子云按 |<i>ψ</i>|² 重要性采样（统计上即真实的电子分布）· 等值面是同一密度的等值面 · 手机 / 平板 / 桌面自适配</footer>
</div>`

export default ORBIT_HTML
