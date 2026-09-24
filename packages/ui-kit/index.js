/**
 * @chem-agent/ui-kit —— 共享表现层：设计令牌 + 基础构件
 *
 * 职责边界（别放错地方）：
 *   · 只放**学科无关**的界面基础件：令牌、按钮/卡片/分段控件/表单、视口自适应、设置弹层
 *   · 不放任何模块专属的样式或逻辑（那些进 modules/<id>/views）
 *   · 不放智能体运行时（那个在 packages/agent-core）
 *
 * 样式入口（按顺序引入）：
 *   tokens.css → components.css → settings-popup.css
 *   面板样式在 packages/agent-core/ui/panel.css（它随面板组件走）
 */

export { createViewport, MIN_VIEWER_H, BOTTOM_GAP, MIN_CHANGE } from './viewport.js'
export { createSettingsStore, DEFAULT_SETTINGS } from './settings-store.js'
export { createSettingsPopup, DEFAULT_SCHEMA } from './settings-popup.js'
