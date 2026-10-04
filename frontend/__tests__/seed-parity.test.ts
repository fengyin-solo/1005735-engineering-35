import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { hashString, isValidRow, seedFingerprint, validateSeed } from '@/data/seed-rules'
import type { EntryRow } from '@/data/types'

// CLI 脚本（scripts/seed-lib.mjs）与浏览器数据层（src/data/seed-rules.ts）必须是同一套规则：
// npm run setup / reset:dev 装的数据和页面里读到的数据才可能完全一致。
const cli = await import('../scripts/seed-lib.mjs')
const here = dirname(fileURLToPath(import.meta.url))
const canonical = JSON.parse(
  readFileSync(resolve(here, '../sample/seed.json'), 'utf8'),
) as Record<string, EntryRow[]>

describe('CLI 与浏览器种子规则一致', () => {
  it('版本号一致', () => {
    expect(cli.SEED_VERSION).toBe('2026.10.0')
  })

  it('哈希与指纹算法一致', () => {
    for (const sample of ['', 'abc', '变电站台账样例1', JSON.stringify(canonical)]) {
      expect(cli.hashString(sample)).toBe(hashString(sample))
    }
    expect(cli.seedFingerprint(canonical)).toBe(seedFingerprint(canonical))
  })

  it('记录校验规则一致', () => {
    const legal = canonical.substation[0]
    const illegalCases: unknown[] = [
      null,
      {},
      { ...legal, id: '1' },
      { ...legal, id: 0 },
      { ...legal, id: 1.5 },
      { ...legal, pending: 'true' },
      { ...legal, pending: 1 },
      { ...legal, abnormal: undefined },
      { ...legal, status: '' },
    ]
    for (const value of [legal, ...illegalCases]) {
      expect(cli.isValidRow(value)).toBe(isValidRow(value))
    }
  })

  it('同一份 sample/seed.json 在两边都校验通过且条目数相同', () => {
    const fromCli = cli.validateSeed(canonical)
    const fromBrowser = validateSeed(canonical)
    expect(fromCli).toEqual(fromBrowser)
  })

  it('非法示例数据两边都拒绝', () => {
    const bad = structuredClone(canonical)
    bad.substation[1].abnormal = 1 as never
    expect(() => cli.validateSeed(bad)).toThrow()
    expect(() => validateSeed(bad)).toThrow()
  })
})
