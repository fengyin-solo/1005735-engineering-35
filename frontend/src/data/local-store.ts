import { SEED_FINGERPRINT, sanitizeRows } from './seed-rules'
import { SEED_ROWS, SEED_VERSION } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
// 存储结构带版本（示例数据指纹）：
// - 本机留着上个月的旧数据时，版本对不上会被整体替换成当前示例数据（绝不增量追加）；
// - 单个模块混进非法记录时，只把该模块收回示例基线（正常的状态流转会保留，不算损坏）；
// - JSON 被截断 / 装到一半中断导致解析失败时，以示例数据整体重建；
// - 反复播种不会多出一份，下次打开继续校验、接着收敛，直到结构完全合法。
const STORAGE_KEY = 'substation-protection:entries'
const RESET_EPOCH_KEY = 'substation-protection:reset-epoch'

type StorePayload = {
  version: string
  fingerprint: string
  data: Record<string, EntryRow[]>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seedPayload(): StorePayload {
  // version 标识示例数据版本，fingerprint 是示例数据指纹：二者来自同一份权威种子。
  // 用户做状态流转后指纹会与内容不符，这是正常的业务数据，不触发重播；
  // 重播只看版本是否对得上、结构是否合法。
  const data = clone(SEED_ROWS)
  return { version: SEED_VERSION, fingerprint: SEED_FINGERPRINT, data }
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

function persist(payload: StorePayload): void {
  // 只写一次：整个数据层的落库都是单 key 全量覆盖，不存在写一半多出半截数据的窗口。
  if (hasStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }
}

function isStorePayload(value: unknown): value is StorePayload {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.version === 'string' &&
    typeof record.fingerprint === 'string' &&
    typeof record.data === 'object' &&
    record.data !== null
  )
}

// 把任意来源的数据收敛成「恰好包含示例模块、记录全部合法」的形态。
// 返回收敛后的 payload 与是否发生过修复；调用方据此决定是否落库，
// 修复动作天然可重入：上次中断了，下次进来接着收敛即可。
function reconcile(stored: StorePayload): { payload: StorePayload; repaired: boolean } {
  if (stored.version !== SEED_VERSION || stored.fingerprint !== SEED_FINGERPRINT) {
    // 示例数据换了版本（本机还留着上月那份）：整体替换，不与旧数据合并。
    return { payload: seedPayload(), repaired: true }
  }
  let repaired = false
  const next: Record<string, EntryRow[]> = {}
  for (const key of Object.keys(SEED_ROWS)) {
    const rawRows = stored.data[key]
    if (!Array.isArray(rawRows)) {
      repaired = true
      next[key] = clone(SEED_ROWS[key])
      continue
    }
    const clean = sanitizeRows(rawRows)
    if (clean.length !== rawRows.length) {
      // 混进了非法记录（异常量/待办不是布尔值、id 非法等）：挡回该模块的示例基线。
      repaired = true
      next[key] = clone(SEED_ROWS[key])
    } else {
      next[key] = clean
    }
  }
  for (const key of Object.keys(stored.data)) {
    if (!(key in SEED_ROWS)) {
      // 不属于任何业务模块的数据（重复播种可能多出的部分）：剔除。
      repaired = true
    }
  }
  return {
    payload: { version: SEED_VERSION, fingerprint: SEED_FINGERPRINT, data: next },
    repaired,
  }
}

let cache: Record<string, EntryRow[]> | null = null

function ensureSeeded(): Record<string, EntryRow[]> {
  const fallback = seedPayload().data
  if (!hasStorage()) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) {
    // 首次打开（或被清库）：播种当前示例数据。
    const payload = seedPayload()
    persist(payload)
    return payload.data
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    const payload = seedPayload()
    persist(payload)
    return payload.data
  }
  if (!isStorePayload(parsed)) {
    // 旧版本（无版本信封、上个月那份）数据：整体替换，不与新数据合并。
    const payload = seedPayload()
    persist(payload)
    return payload.data
  }
  const { payload, repaired } = reconcile(parsed)
  if (repaired) {
    persist(payload)
  }
  return payload.data
}

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = ensureSeeded()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (hasStorage()) {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SEED_VERSION, fingerprint: SEED_FINGERPRINT, data: next }),
    )
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

// 全部模块一次性收回示例基线：每个模块的待办条目数与播种时严格一致。
// 实现是全量覆盖而不是追加，复位后不会多出一条。
export function resetAllRows(): Record<string, EntryRow[]> {
  const payload = seedPayload()
  cache = payload.data
  persist(payload)
  return payload.data
}

// 本地开发命令（npm run reset:dev）在 public/seed-reset.json 里写入新的 epoch；
// 应用启动时发现 epoch 变新，就把本地数据全部收回示例基线。刷新后读到的仍是这一份。
export async function applyDevResetEpoch(epoch: number): Promise<boolean> {
  if (!hasStorage()) return false
  const seen = Number(window.localStorage.getItem(RESET_EPOCH_KEY) ?? '0')
  if (Number.isFinite(epoch) && epoch > seen) {
    resetAllRows()
    window.localStorage.setItem(RESET_EPOCH_KEY, String(epoch))
    return true
  }
  return false
}

export function storageKey(): string {
  return STORAGE_KEY
}
