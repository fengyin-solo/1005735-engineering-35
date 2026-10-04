// 示例数据的唯一权威源与校验逻辑：
// CLI（npm run setup / reset:dev）与浏览器（src/data/local-store.ts）共用这一份数据、同一套规则。
//
// 注意：本文件同时被 Node 脚本和浏览器打包读取，不能依赖 node:fs 之外的运行期 API，
// 文件读取统一由调用方完成，这里只做纯数据处理。

export const SEED_VERSION = '2026.10.0'

// 与浏览器侧一致的轻量字符串哈希：同样的数据在 Node 与浏览器算出同一个版本指纹，
// 用来判断 localStorage 里那份数据是不是当前示例数据。
export function hashString(input) {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function seedFingerprint(seedRows) {
  return hashString(JSON.stringify(seedRows))
}

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 单条记录是否合法：id 必须是正整数，pending / abnormal 必须是真正的布尔值，
// status 必须是非空字符串。非法值不允许进数据层（「异常量非法值的挡回」）。
export function isValidRow(row) {
  if (!isRecord(row)) return false
  const id = Number(row.id)
  if (!Number.isInteger(id) || id <= 0) return false
  if (typeof row.status !== 'string' || row.status.trim() === '') return false
  if (typeof row.pending !== 'boolean') return false
  if (typeof row.abnormal !== 'boolean') return false
  return true
}

export function validateSeed(seedRows) {
  const errors = []
  if (!isRecord(seedRows)) {
    throw new Error('示例数据必须是以模块 key 为键的对象')
  }
  for (const [key, rows] of Object.entries(seedRows)) {
    if (!Array.isArray(rows)) {
      errors.push(`模块 ${key} 的示例数据不是数组`)
      continue
    }
    const seenIds = new Set()
    rows.forEach((row, index) => {
      if (!isValidRow(row)) {
        errors.push(`模块 ${key} 第 ${index + 1} 条记录结构非法（id / status / pending / abnormal 不合法）`)
        return
      }
      if (seenIds.has(row.id)) {
        errors.push(`模块 ${key} 存在重复 id：${row.id}`)
      }
      seenIds.add(row.id)
    })
  }
  if (errors.length > 0) {
    throw new Error(`示例数据校验未通过：\n- ${errors.join('\n- ')}`)
  }
  return {
    moduleCount: Object.keys(seedRows).length,
    totalRows: Object.values(seedRows).reduce((sum, rows) => sum + rows.length, 0),
    fingerprint: seedFingerprint(seedRows),
  }
}
