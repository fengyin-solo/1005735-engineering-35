import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SEED_FINGERPRINT } from '@/data/seed-rules'
import { SEED_ROWS, SEED_VERSION } from '@/data/seed'
import { MODULES } from '@/data/modules'
import type { EntryRow } from '@/data/types'

type StoreModule = typeof import('@/data/local-store')

const KEY = 'substation-protection:entries'

// 每个用例拿到一份全新的数据模块（模块内有读取缓存），
// 配合 localStorage 清空，等价于「重新打开页面」。
async function freshStore(): Promise<StoreModule> {
  vi.resetModules()
  return await import('@/data/local-store')
}

function seedPending(key: string): number {
  return SEED_ROWS[key].filter((row) => row.pending).length
}

function writeRaw(value: string): void {
  window.localStorage.setItem(KEY, value)
}

function readPayload(): { version: string; fingerprint: string; data: Record<string, EntryRow[]> } {
  return JSON.parse(window.localStorage.getItem(KEY) as string)
}

let store: StoreModule

beforeEach(async () => {
  window.localStorage.clear()
  store = await freshStore()
  store.resetAllRows()
})

describe('播种', () => {
  it('首次打开播种示例数据并持久化，刷新后还是同一份', async () => {
    window.localStorage.clear()
    store = await freshStore()
    const first = store.allRows()
    expect(Object.keys(first)).toHaveLength(MODULES.length)
    const stored = readPayload()
    expect(stored.version).toBe(SEED_VERSION)
    expect(stored.fingerprint).toBe(SEED_FINGERPRINT)

    // 模拟刷新：重新读取 localStorage
    const reopened = await freshStore()
    expect(reopened.allRows()).toEqual(first)
  })

  it('反复播种不重复：再次进入仍是每模块 3 条', () => {
    store.resetAllRows()
    store.resetAllRows()
    for (const meta of MODULES) {
      expect(store.listRows(meta.key)).toHaveLength(3)
    }
  })
})

describe('旧版本数据', () => {
  it('上月旧结构（无版本信封）被整体替换，而不是合并', async () => {
    // 旧版存储直接就是 { module: rows }
    const stale = { substation: SEED_ROWS.substation, ghost: [{ id: 1 }] }
    writeRaw(JSON.stringify(stale))
    store = await freshStore()
    const rows = store.allRows()
    expect(rows.substation).toEqual(SEED_ROWS.substation)
    expect('ghost' in rows).toBe(false)
    expect(Object.keys(rows)).toHaveLength(MODULES.length)
    expect(readPayload().version).toBe(SEED_VERSION)
  })

  it('版本号对不上时整体替换为当前示例数据', async () => {
    writeRaw(JSON.stringify({
      version: '2026.09.0',
      fingerprint: 'deadbeef',
      data: { substation: [{ ...SEED_ROWS.substation[0], id: 999 }] },
    }))
    store = await freshStore()
    const rows = store.allRows()
    expect(rows.substation).toEqual(SEED_ROWS.substation)
    expect(rows.substation.some((row) => row.id === 999)).toBe(false)
  })
})

describe('装到一半断了能接着走', () => {
  it('JSON 被截断时重建为示例数据', async () => {
    const full = window.localStorage.getItem(KEY) as string
    writeRaw(full.slice(0, Math.floor(full.length / 2)))
    store = await freshStore()
    expect(() => store.allRows()).not.toThrow()
    expect(store.allRows().substation).toEqual(SEED_ROWS.substation)
  })

  it('某个模块混进非法记录时只挡回该模块，合法模块上的操作保留', async () => {
    // 先在 breaker 上做一次合法状态流转
    const breaker = store.listRows('breaker').map((row) =>
      row.id === 1 ? { ...row, status: '运行中' } : row,
    )
    store.saveRows('breaker', breaker)

    // 再把 substation 塞进非法数据（异常量不是布尔值）
    const payload = readPayload()
    payload.data.substation = [
      ...payload.data.substation,
      { ...payload.data.substation[0], id: 4, abnormal: '是' as never },
    ]
    writeRaw(JSON.stringify(payload))

    store = await freshStore()
    const rows = store.allRows()
    // substation 被挡回基线：非法追加的第 4 条不留存
    expect(rows.substation).toEqual(SEED_ROWS.substation)
    // breaker 的正常业务数据保留
    expect(rows.breaker.find((row) => row.id === 1)?.status).toBe('运行中')
  })
})

describe('复位', () => {
  it('整体复位后各模块条目数、待办条目数严格回到起点，不多一条', () => {
    // 先制造改动：追加一条
    store.saveRows('substation', [
      ...store.listRows('substation'),
      { id: 99, status: '待投运', pending: true, abnormal: false, 站名: '临时站' },
    ])
    expect(store.listRows('substation')).toHaveLength(4)

    const restored = store.resetAllRows()
    for (const meta of MODULES) {
      expect(restored[meta.key]).toEqual(SEED_ROWS[meta.key])
      expect(store.listRows(meta.key)).toHaveLength(SEED_ROWS[meta.key].length)
      const pending = store.listRows(meta.key).filter((row) => row.pending).length
      expect(pending).toBe(seedPending(meta.key))
    }
  })

  it('单模块复位只影响该模块', () => {
    store.saveRows('breaker', [
      ...store.listRows('breaker'),
      { id: 99, status: '待保养', pending: true, abnormal: false, 设备编号: 'X' },
    ])
    store.resetRows('breaker')
    expect(store.listRows('breaker')).toEqual(SEED_ROWS.breaker)
    expect(store.listRows('substation')).toEqual(SEED_ROWS.substation)
  })

  it('开发复位令牌：epoch 变新才复位，同一 epoch 不重复复位', async () => {
    store.saveRows('substation', [
      ...store.listRows('substation'),
      { id: 99, status: '待投运', pending: true, abnormal: false, 站名: '临时站' },
    ])
    expect(await store.applyDevResetEpoch(1)).toBe(true)
    expect(store.listRows('substation')).toHaveLength(3)

    // 再登记一条，旧 epoch 不触发复位
    store.saveRows('substation', [
      ...store.listRows('substation'),
      { id: 99, status: '待投运', pending: true, abnormal: false, 站名: '临时站' },
    ])
    expect(await store.applyDevResetEpoch(1)).toBe(false)
    expect(store.listRows('substation')).toHaveLength(4)

    // 更大的 epoch 才复位
    expect(await store.applyDevResetEpoch(2)).toBe(true)
    expect(store.listRows('substation')).toHaveLength(3)
  })
})

describe('正常业务数据', () => {
  it('状态流转后的合法数据不会被重新播种覆盖', () => {
    const rows = store.listRows('substation').map((row) =>
      row.id === 1 ? { ...row, status: '运行中', pending: true } : row,
    )
    store.saveRows('substation', rows)
    const payload = readPayload()
    expect(payload.data.substation.find((row) => row.id === 1)?.status).toBe('运行中')
    expect(payload.fingerprint).toBe(SEED_FINGERPRINT)
  })
})
