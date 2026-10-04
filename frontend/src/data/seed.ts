// 示例数据的唯一权威源是 frontend/sample/seed.json：
// CLI（npm run setup / npm run reset:dev）和浏览器本地数据层都读这一份，
// 两条命令不会各装各的数据。
// 这里只做再导出，方便业务代码继续从 '@/data/seed' 引用。
import rawSeed from '../../sample/seed.json'
import { SEED_VERSION } from './seed-rules'
import type { EntryRow } from './types'

export const SEED_ROWS = rawSeed as Record<string, EntryRow[]>
export { SEED_VERSION }
