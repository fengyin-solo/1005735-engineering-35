import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 示例数据版本与校验规则：与 frontend/scripts/seed-lib.mjs 保持同一套实现，
// 由 __tests__/seed-parity.test.ts 钉住两边行为一致。
// CLI 装数据和浏览器读数据都走这些规则，运营概览与模块列表才能对得齐。

export const SEED_VERSION = '2026.10.0'

// 轻量字符串哈希：同样的数据在 Node 脚本与浏览器里算出同一个指纹，
// 用来判断 localStorage 里那份数据是不是当前示例数据。
export function hashString(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function seedFingerprint(seedRows: Record<string, EntryRow[]>): string {
  return hashString(JSON.stringify(seedRows))
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 单条记录是否合法：id 必须是正整数，pending / abnormal 必须是真正的布尔值，
// status 必须是非空字符串。非法记录一律挡在数据层外面。
export function isValidRow(row: unknown): row is EntryRow {
  if (!isRecord(row)) return false
  const id = Number((row as EntryRow).id)
  if (!Number.isInteger(id) || id <= 0) return false
  if (typeof row.status !== 'string' || row.status.trim() === '') return false
  if (typeof row.pending !== 'boolean') return false
  if (typeof row.abnormal !== 'boolean') return false
  return true
}

export function sanitizeRows(rows: unknown): EntryRow[] {
  if (!Array.isArray(rows)) return []
  return rows.filter(isValidRow)
}

export function validateSeed(seedRows: unknown): {
  moduleCount: number
  totalRows: number
  fingerprint: string
} {
  if (!isRecord(seedRows)) {
    throw new Error('示例数据必须是以模块 key 为键的对象')
  }
  const errors: string[] = []
  for (const [key, rows] of Object.entries(seedRows)) {
    if (!Array.isArray(rows)) {
      errors.push(`模块 ${key} 的示例数据不是数组`)
      continue
    }
    const seenIds = new Set<number>()
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
  const typed = seedRows as Record<string, EntryRow[]>
  return {
    moduleCount: Object.keys(typed).length,
    totalRows: Object.values(typed).reduce((sum, rows) => sum + rows.length, 0),
    fingerprint: seedFingerprint(typed),
  }
}

export const SEED_FINGERPRINT = seedFingerprint(SEED_ROWS)
