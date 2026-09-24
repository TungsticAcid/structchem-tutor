/**
 * main.js — 统一前端的入口：装配「一个中枢 + 当前模块」并接上界面
 *
 * ★ 本文件只做**胶水**：真正的装配逻辑在 packages/agent-core/app.js（那边可无头测试，
 *   已被 test-app.mjs 用真实模块 + 真实共享核验证过 40 条断言）。
 *   这里负责三件只有浏览器能做的事：构造三维视图、拼界面控件、把 DOM 事件接到动作通路。
 *
 * ★ 一条贯穿的约定：**用户的操作与智能体的操作走同一条通路**（facade.applyActions）。
 *   这样界面状态与实际画面不会分叉，感知层也能把用户的操作记进交互痕迹——
 *   智能体"看得见"用户自己点了什么（这是主动介入的前提）。
 */
import '@ui-kit/tokens.css'
import '@ui-kit/components.css'
import '@ui-kit/settings-popup.css'
import '@core/ui/panel.css'

import { createAgentApp } from '@core/app.js'
import { createCatalog } from '@core/core/catalog.js'
import * as LLMClient from '@core/core/llm-client.js'
import { createPanel } from '@core/ui/panel.js'
import { createViewport } from '@ui-kit/viewport.js'
import { createSettingsStore } from '@ui-kit/settings-store.js'
import { createSettingsPopup, DEFAULT_SCHEMA, DEFAULT_GROUPS } from '@ui-kit/settings-popup.js'
import { registerInto as regOrbitKnowledge } from '@knowledge/orbit/index.js'
import { registerInto as regCommonSkills } from '@skills/common/index.js'
import { createModule as createCrystalModule } from '@modules/crystal/index.js'
import { LAYER_NOTES, VIEW_DIRECTIONS, VIEW_NOTES, CELL_MODES, CELL_MODE_NOTES } from '@modules/crystal/actions.js'
import { createCrystalView, CATALOG, getCrystalData } from './crystal-view.js'

const $ = (sel) => document.querySelector(sel)

// ---------------------------------------------------------------------------
// 1. 视口自适应（先启动：它注册的 rAF 要排在首次绘制之前）
// ---------------------------------------------------------------------------
const viewport = createViewport({
  viewerSelector: '#viewer',
  chromeSelectors: ['.topbar', '.card-head'],
})
viewport.init()

// ---------------------------------------------------------------------------
// 2. 三维视图（浏览器专用，隔离在 crystal-view.js）
// ---------------------------------------------------------------------------
const view = createCrystalView({ container: $('#viewer'), props: { crystalId: 'naCl' } })

// ---------------------------------------------------------------------------
// 3. 模块（纯逻辑，可在 Node 测）
// ---------------------------------------------------------------------------
const crystal = createCrystalModule({ view, catalog: CATALOG, loadData: getCrystalData })

// ---------------------------------------------------------------------------
// 4. 设置（BYOK）
// ---------------------------------------------------------------------------
const settings = createSettingsStore({
  storageKey: 'chem-agent.settings',
  clearKeys: ['chem-agent.panel.fabPos'],
})

const settingsPopup = createSettingsPopup({
  store: settings,
  // 智能体自身的设置 + **模块自己的小参数**用同一套声明式 schema
  schema: DEFAULT_SCHEMA.concat(crystal.settings),
  groups: DEFAULT_GROUPS.concat([{
    title: '晶体模块参数（模块自己声明的）',
    keys: ['atomScale', 'stickRadius', 'opacity', 'cellDisplayMode'],
  }]),
  testConnection: LLMClient.testConnection,
  about: '<b>结构化学教学智能体</b><br>纯前端 · 计算层确定性求值（防幻觉）<br>'
    + '模型由使用者自备（BYOK），本工具不提供额度',
  onSaved: (s) => {
    // ★ 模块参数要**落回视图**，且走动作通路（这样感知层能记进痕迹）
    crystal.facade.applyActions([
      { action: 'setAppearance', params: { atomScale: s.atomScale, stickRadius: s.stickRadius, opacity: s.opacity } },
      { action: 'setCellDisplayMode', params: { mode: s.cellDisplayMode } },
    ])
  },
})

// ---------------------------------------------------------------------------
// 5. 内容库（知识/技能目录）
// ---------------------------------------------------------------------------
const knowledge = createCatalog({ key: 'id' })
const skills = createCatalog({ key: 'name' })
regOrbitKnowledge(knowledge)     // 34 条（id 形如 orbit:K3-1）
regCommonSkills(skills)          // 6 个通用教学法

// ---------------------------------------------------------------------------
// 6. 智能体（中枢 + 模块）
// ---------------------------------------------------------------------------
const app = createAgentApp({
  modules: [crystal],
  settings,
  llm: LLMClient,
  knowledge,
  skills,
  node: 'explain',
  prompts: {
    role: '你是结构化学教学智能体，服务于结构化学课程的教与学。'
      + '你不是问答机器人，而是能感知用户在做什么、能动手把话演示出来的教学智能体——'
      + '凡是可以用视图演示的，都要用 applySceneActions 演示，而不是只用文字描述。',
  },
})

// ---------------------------------------------------------------------------
// 7. 面板（对话 + 演示控制条）
// ---------------------------------------------------------------------------
const panel = createPanel({
  title: '教学智能体',
  placeholder: '问晶体结构的问题，或让我演示…（Enter 发送，Shift+Enter 换行）',
  menu: [{ label: '设置', onClick: () => settingsPopup.open() }],
  greeting: [
    '<b>我是结构化学教学智能体</b><br>',
    '我能感知你此刻在看哪个晶体，也能动手把话演示出来。<br><br>',
    '试试：<br>',
    '· 「NaCl 的密度是多少」<br>',
    '· 「打开八面体空隙，让我数一数」<br>',
    '· 「为什么 CsCl 是简单立方而不是体心立方」',
  ].join(''),
  actionLabels: crystal.actionLabels,
  sequenceToolName: 'applySceneActions',
  getShowReasoning: () => settings.get().showReasoning,
  storyboard: app.storyboard,
  send: (text, handlers) => app.send(text, handlers),
  onStop: () => app.stop(),
  hasKey: () => settings.hasKey(),
  openSettings: () => settingsPopup.open(),
  storageKey: 'chem-agent.panel.fabPos',
})
panel.init()

// ---------------------------------------------------------------------------
// 8. 界面控件：全部走模块的动作通路（见文件头那条约定）
// ---------------------------------------------------------------------------
/** 一个分段按钮；点击时把选中态与动作一起交给模块 */
function segButton(label, active, onClick, title) {
  const b = document.createElement('button')
  b.className = 'seg-btn' + (active ? ' active' : '')
  b.type = 'button'
  b.textContent = label
  if (title) b.title = title
  b.onclick = onClick
  return b
}

/** 以"先取真实状态、再渲染"的方式重建控件，避免控件与实际画面分叉 */
function rerenderControls() {
  const snap = crystal.facade.getSnapshot()
  const on = new Set(snap.layersOn || [])

  // 模块切换（目前只有一个；其余接入后自动出现）
  const modSeg = $('#moduleSeg')
  modSeg.innerHTML = ''
  for (const id of app.listModules()) {
    modSeg.appendChild(segButton(
      id, app.activeModule === id,
      () => { app.setActiveModule(id); rerenderControls() },
    ))
  }

  // 晶体选择
  const cSeg = $('#crystalSeg')
  cSeg.innerHTML = ''
  for (const c of CATALOG) {
    cSeg.appendChild(segButton(
      c.name, snap.crystal && snap.crystal.id === c.id,
      () => { crystal.facade.applyActions([{ action: 'loadCrystal', params: { crystalId: c.id } }]); rerenderControls() },
      c.subtitle || c.formula,
    ))
  }
  $('#viewerTitle').textContent = snap.crystal ? (snap.crystal.name + ' · ' + snap.crystal.systemName) : '晶体结构'

  // 图层（空隙两类的显隐受总开关控制，故一并展示；这是 C5 最需要看清的一组）
  const lBar = $('#layerBar')
  lBar.innerHTML = ''
  for (const [layer, note] of Object.entries(LAYER_NOTES)) {
    lBar.appendChild(segButton(
      layer, on.has(layer),
      () => {
        const next = !on.has(layer)
        crystal.facade.applyActions([{ action: 'setLayer', params: { layer, visible: next } }])
        rerenderControls()
      },
      note,
    ))
  }

  // 视角
  const vBar = $('#viewBar')
  vBar.innerHTML = ''
  for (const d of VIEW_DIRECTIONS) {
    vBar.appendChild(segButton(d, false,
      () => { crystal.facade.applyActions([{ action: 'setView', params: { direction: d } }]); rerenderControls() },
      VIEW_NOTES[d]))
  }
  vBar.appendChild(segButton('复位', false,
    () => { crystal.facade.applyActions([{ action: 'resetView', params: {} }]); rerenderControls() }))

  // 晶胞显示（惯用 / 原胞）——C1/C2 的辨析要用
  const ab = $('#appearanceBar')
  ab.innerHTML = '<div class="card-title" style="margin-bottom:6px">晶胞显示</div>'
  const cellSeg = document.createElement('div')
  cellSeg.className = 'seg small'
  for (const m of CELL_MODES) {
    cellSeg.appendChild(segButton(
      m === 'primitive' ? '原胞' : '惯用晶胞', snap.cellDisplayMode === m,
      () => { crystal.facade.applyActions([{ action: 'setCellDisplayMode', params: { mode: m } }]); rerenderControls() },
      CELL_MODE_NOTES[m]))
  }
  ab.appendChild(cellSeg)
}

$('#settingsBtn').onclick = () => settingsPopup.open()
rerenderControls()

// 模块动作改变了状态 → 控件跟着走（否则用户手动改了、控件还显示旧态）
app.storyboard.onProgress(() => rerenderControls())
crystal.facade.onAction(() => rerenderControls())

// 窗口尺寸变化：正交相机要重算视景体，否则窗口变大后模型会显得很小
window.addEventListener('resize', () => {
  view.resize()
  viewport.schedule()
})

// ---------------------------------------------------------------------------
// 9. 起动
// ---------------------------------------------------------------------------
app.start()

// 无密钥时先提示一次（点发送也会提示，但提前说不至于让人白等）
if (!settings.hasKey()) {
  panel.renderEmptyState()
  panel.addChip('尚未配置 API Key：点右上角「设置」填写你自己的模型密钥', 'warn')
}

// 调试用把手（只读为主）
window.__chemAgent = { app, panel, crystal, view, settings, viewport }
