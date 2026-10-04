import { MODULES } from './modules'
import { SEED_ROWS, SEED_VERSION, seedRowsOf } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'substation-protection:entries'
// 只在本地开发环境使用：重置页落下这枚标记，main.ts 在挂载前完成数据收回。
const RESET_FLAG_KEY = 'substation-protection:dev-reset'

// 待办尾迹：开发环境复位后，每个业务模块的待办清单会多出这一条，
// 让人能看出「数据是被复位操作收回的」而不是首次播种。
export const RESET_TODO_TITLE = '开发环境数据已复位'

type StoreEnvelope = {
  version: string
  // 已完成播种的模块：装到一半断了再进来，只补没装过的模块，已装的不会重复。
  seeded: string[]
  data: Record<string, EntryRow[]>
}

// 复位信封：每个模块复位后追加一条待办尾迹，用 nonce 保证尾迹唯一。
type ResetEnvelope = {
  nonce: number
  done: string[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

// 行级合法性：登记总量是按行累加的，脏数据一律不放行（异常量非法值挡回）。
export function isValidEntryRow(value: unknown): value is EntryRow {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const row = value as Record<string, unknown>
  return (
    Number.isFinite(row.id) &&
    typeof row.status === 'string' &&
    typeof row.pending === 'boolean' &&
    typeof row.abnormal === 'boolean'
  )
}

function isValidModuleRows(value: unknown): value is EntryRow[] {
  return Array.isArray(value) && value.every(isValidEntryRow)
}

const MODULE_KEYS = MODULES.map((item) => item.key)

// 把一份外部数据收敛成可信信封：非法模块整体退回示例数据，未知模块丢弃。
function sanitizeEnvelope(raw: unknown): StoreEnvelope | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }
  const envelope = raw as Record<string, unknown>
  if (typeof envelope.version !== 'string' || typeof envelope.data !== 'object' || envelope.data === null) {
    return null
  }
  const seededInput = Array.isArray(envelope.seeded) ? envelope.seeded.filter((k) => typeof k === 'string') : []
  const data: Record<string, EntryRow[]> = {}
  const seeded: string[] = []
  let valid = true
  for (const key of MODULE_KEYS) {
    const rows = (envelope.data as Record<string, unknown>)[key]
    if (!isValidModuleRows(rows)) {
      valid = false
      continue
    }
    data[key] = rows
    if (seededInput.includes(key)) {
      seeded.push(key)
    }
  }
  if (!valid) {
    // 沿用既有本地做法：读到坏数据不抛出、不带病工作，整份回到示例数据。
    return null
  }
  return { version: envelope.version, seeded, data }
}

function freshEnvelope(): StoreEnvelope {
  const data: Record<string, EntryRow[]> = {}
  for (const key of MODULE_KEYS) {
    data[key] = clone(SEED_ROWS[key] ?? [])
  }
  return { version: SEED_VERSION, seeded: [], data }
}

function persist(envelope: StoreEnvelope): void {
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  }
}

// 浏览器启动时跑一遍：版本升级/上月旧数据只重补有差异的模块，并完成可续跑播种。
function bootstrapEnvelope(): StoreEnvelope {
  let envelope: StoreEnvelope | null = null
  if (canUseStorage()) {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw !== null) {
      try {
        envelope = sanitizeEnvelope(JSON.parse(raw))
      } catch {
        envelope = null
      }
    }
  }
  if (envelope === null) {
    envelope = freshEnvelope()
  }
  const stale = envelope.version !== SEED_VERSION
  envelope.version = SEED_VERSION
  let changed = stale
  if (stale) {
    // 旧版本的播种进度作废，所有模块都要按新示例数据补一遍，防止迁移中断后续跑漏补。
    envelope.seeded = []
  }
  for (const key of MODULE_KEYS) {
    // 版本对不上时所有模块都按示例数据重补；同版本只补没装完的，支持断后续跑。
    if (stale || !envelope.seeded.includes(key)) {
      envelope.data[key] = seedRowsOf(key)
      if (!envelope.seeded.includes(key)) {
        envelope.seeded.push(key)
      }
      changed = true
      // 逐模块落盘：装到一半断掉，已装的模块仍然在。
      persist(envelope)
    }
  }
  if (changed) {
    persist(envelope)
  }
  return envelope
}

let cache: StoreEnvelope | null = null

function currentEnvelope(): StoreEnvelope {
  if (cache === null) {
    cache = bootstrapEnvelope()
  }
  return cache
}

export function allRows(): Record<string, EntryRow[]> {
  return currentEnvelope().data
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

// 写回前再挡一道：异常量/待办/状态等非法结构不允许落进本地数据。
export function saveRows(key: string, rows: EntryRow[]): void {
  if (!MODULE_KEYS.includes(key)) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  if (!isValidModuleRows(rows)) {
    throw new Error(`${key} 的待办条目含非法值，已挡回，未写入本地数据`)
  }
  const envelope = currentEnvelope()
  envelope.data[key] = clone(rows)
  if (!envelope.seeded.includes(key)) {
    envelope.seeded.push(key)
  }
  persist(envelope)
}

// 单个模块回到示例数据（模块页原有做法，不追加复位尾迹）。
export function resetRows(key: string): EntryRow[] {
  const rows = seedRowsOf(key)
  saveRows(key, rows)
  return rows
}

function buildResetTodo(key: string, nonce: number): EntryRow {
  const meta = MODULES.find((item) => item.key === key)
  const firstField = meta?.fields[0] ?? '名称'
  const row: EntryRow = {
    // 尾迹 id 取负数，与正常登记（正整数自增）区分开，反复复位也只留一条。
    id: -nonce,
    status: meta?.statuses[0] ?? '待办',
    pending: true,
    abnormal: false,
    [firstField]: RESET_TODO_TITLE,
  }
  return row
}

// 开发环境全量复位：逐模块落位「示例数据 + 一条待办尾迹」，
// 每步都落盘，断了重进会从 done 之后接着走，且尾迹不会重复追加。
function applyDevReset(flag: ResetEnvelope): void {
  const envelope = bootstrapEnvelope()
  for (const key of MODULE_KEYS) {
    if (flag.done.includes(key)) {
      continue
    }
    const rows = seedRowsOf(key)
    if (!rows.some((row) => row.id === -flag.nonce)) {
      rows.push(buildResetTodo(key, flag.nonce))
    }
    envelope.data[key] = rows
    if (!envelope.seeded.includes(key)) {
      envelope.seeded.push(key)
    }
    flag.done.push(key)
    persist(envelope)
    if (canUseStorage()) {
      window.localStorage.setItem(RESET_FLAG_KEY, JSON.stringify(flag))
    }
  }
  if (canUseStorage()) {
    window.localStorage.removeItem(RESET_FLAG_KEY)
  }
}

// 应用挂载前调用：复位页只在开发环境可达，这里也再守一道环境判断。
export function applyPendingDevReset(): void {
  if (!canUseStorage() || import.meta.env.DEV !== true) {
    return
  }
  const raw = window.localStorage.getItem(RESET_FLAG_KEY)
  if (raw === null) {
    return
  }
  let flag: ResetEnvelope | null = null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Number.isFinite((parsed as ResetEnvelope).nonce) &&
      Array.isArray((parsed as ResetEnvelope).done)
    ) {
      flag = {
        nonce: (parsed as ResetEnvelope).nonce,
        done: (parsed as ResetEnvelope).done.filter((item) => typeof item === 'string'),
      }
    }
  } catch {
    flag = null
  }
  if (flag === null) {
    window.localStorage.removeItem(RESET_FLAG_KEY)
    return
  }
  cache = null
  applyDevReset(flag)
  cache = null
}

// 运营概览与模块列表共用的计数口径：两处登记总量永远同源同步。
export function moduleCounts(rows: EntryRow[]): { created: number; pending: number; abnormal: number } {
  return {
    created: rows.length,
    pending: rows.filter((row) => row.pending === true).length,
    abnormal: rows.filter((row) => row.abnormal === true).length,
  }
}

export function storageKey(): string {
  return STORAGE_KEY
}

export function devResetFlagKey(): string {
  return RESET_FLAG_KEY
}
