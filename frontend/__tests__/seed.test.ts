import { describe, expect, it } from 'vitest'

import seedRows from '../sample/seed.json'
import { MODULES } from '@/data/modules'
import {
  SEED_FINGERPRINT,
  SEED_VERSION,
  hashString,
  isValidRow,
  seedFingerprint,
  validateSeed,
} from '@/data/seed-rules'
import type { EntryRow } from '@/data/types'

const rows = seedRows as Record<string, EntryRow[]>

describe('示例数据', () => {
  it('覆盖全部 18 个业务模块且每模块 3 条基线数据', () => {
    expect(MODULES).toHaveLength(18)
    for (const meta of MODULES) {
      expect(rows[meta.key], `模块 ${meta.key} 缺少示例数据`).toHaveLength(3)
    }
    expect(Object.keys(rows)).toHaveLength(MODULES.length)
  })

  it('校验通过并给出稳定指纹', () => {
    const info = validateSeed(rows)
    expect(info.moduleCount).toBe(18)
    expect(info.totalRows).toBe(54)
    expect(info.fingerprint).toMatch(/^[0-9a-f]{8}$/)
    expect(seedFingerprint(rows)).toBe(SEED_FINGERPRINT)
    expect(SEED_VERSION).toBe('2026.10.0')
  })

  it('每条记录结构合法，模块内 id 不重复', () => {
    for (const list of Object.values(rows)) {
      const ids = new Set<number>()
      for (const row of list) {
        expect(isValidRow(row)).toBe(true)
        expect(ids.has(row.id)).toBe(false)
        ids.add(row.id)
      }
    }
  })

  it('每个模块起点都有 2 条待办（id 1、2 待办，id 3 已完结）', () => {
    for (const [key, list] of Object.entries(rows)) {
      const pending = list.filter((row) => row.pending).length
      expect(pending, `模块 ${key} 起点待办数应为 2`).toBe(2)
    }
  })

  it('同一数据的指纹稳定且与数据内容绑定', () => {
    expect(seedFingerprint(rows)).toBe(SEED_FINGERPRINT)
    const changed = structuredClone(rows)
    changed.substation[0].站名 = '别的站名'
    expect(seedFingerprint(changed)).not.toBe(SEED_FINGERPRINT)
    expect(hashString('abc')).toBe(hashString('abc'))
  })
})
