import seedJson from './seed.json'
import type { EntryRow } from './types'

// 示例数据的唯一出处是 seed.json：安装脚本、重置脚本、浏览器播种都读它，
// 不会出现「脚本装的」和「页面用的」是两份数据的情况。
// version 变化后，浏览器里的旧数据会被判成上月那份，按模块重新播种。
export const SEED_VERSION: string = seedJson.version

export const SEED_ROWS: Record<string, EntryRow[]> =
  seedJson.modules as Record<string, EntryRow[]>

// 深拷贝一份，避免调用方改到这份只读的规范数据。
export function seedRowsOf(key: string): EntryRow[] {
  return JSON.parse(JSON.stringify(SEED_ROWS[key] ?? [])) as EntryRow[]
}
