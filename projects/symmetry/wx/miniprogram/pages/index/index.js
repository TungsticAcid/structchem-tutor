// pages/index/index.js — 落地页（首页设计参考图）
import { i18n, t } from '../../lib/i18n.js'

Page({
  data: {
    lang: 'zh',
    name: '',
    sub: '',
    f1: '',
    f2: '',
    enter: ''
  },

  onLoad() {
    this._applyLang()
  },

  /** 根据当前语言刷新文案 */
  _applyLang() {
    this.setData({
      lang: i18n.lang,
      name: t('land.name'),
      sub: t('land.sub'),
      f1: t('land.f1'),
      f2: t('land.f2'),
      enter: t('land.enter')
    })
  },

  onTapZh() {
    i18n.setLang('zh')
    this._applyLang()
  },

  onTapEn() {
    i18n.setLang('en')
    this._applyLang()
  },

  onTapEnter() {
    wx.navigateTo({ url: '/pages/viewer/index' })
  },

  onShareAppMessage() {
    return { title: `${t('land.name')} · ${t('land.sub')}` }
  }
})
