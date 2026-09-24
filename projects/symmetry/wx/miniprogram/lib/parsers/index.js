/**
 * 文件解析统一入口（小程序仅保留 XYZ；示例库内建分子均为 XYZ 文本）
 */
import { parseXYZ } from './xyz.js'

/** 支持的文件扩展名 */
export const SUPPORTED_EXTENSIONS = ['.xyz']

/**
 * 解析结构文本（小程序仅支持 XYZ）
 * @param {string} text - XYZ 文件内容
 * @param {string} filename - 文件名（可选）
 * @returns {Object} 分子结构
 */
export function parseStructure(text, filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  if (ext === 'xyz' || /^\d+\s*$/.test((text || '').trim().split(/\r?\n/)[0])) {
    return parseXYZ(text)
  }
  throw new Error('小程序版仅支持 XYZ 格式')
}
