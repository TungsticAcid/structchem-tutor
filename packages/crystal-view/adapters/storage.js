/**
 * localStorage 封装（替代 wx.Storage）
 * 提供与微信 Storage API 兼容的接口
 */

const PREFIX = 'crystal_'

export function getStorageSync(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw || ''
  } catch (e) {
    console.error('[storage] 读取失败:', e)
    return ''
  }
}

export function setStorageSync(key, value) {
  try {
    localStorage.setItem(PREFIX + key, typeof value === 'string' ? value : JSON.stringify(value))
  } catch (e) {
    console.error('[storage] 保存失败:', e)
  }
}

export function removeStorageSync(key) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch (e) {
    console.error('[storage] 删除失败:', e)
  }
}

/** 获取 JSON 解析后的值 */
export function getJSONSync(key) {
  const raw = getStorageSync(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

export default { getStorageSync, setStorageSync, removeStorageSync, getJSONSync }
