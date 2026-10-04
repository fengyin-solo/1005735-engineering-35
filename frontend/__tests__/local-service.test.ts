import { beforeEach, describe, expect, it } from 'vitest'

import {
  countEntries,
  createEntry,
  listEntries,
  loadOverview,
  resetAllModules,
  resetModule,
  runAction,
  seedBaselineCounts,
} from '@/api/local-service'
import { resetAllRows } from '@/data/local-store'
import { MODULES } from '@/data/modules'
import { SEED_ROWS } from '@/data/seed'

beforeEach(() => {
  resetAllRows()
})

describe('运营概览与模块列表登记总量同步', () => {
  it('概览卡片的登记总量 = 各模块列表条目数之和', () => {
    const overview = loadOverview()
    const sumFromModules = MODULES.reduce((sum, meta) => sum + countEntries(meta.key), 0)
    const sumFromOverview = overview.modules.reduce((sum, item) => sum + item.created, 0)
    const totalCard = overview.cards.find((card) => card.label === '登记总量')?.value
    expect(totalCard).toBe(54)
    expect(sumFromOverview).toBe(totalCard)
    expect(sumFromModules).toBe(totalCard)
  })

  it('任一模块登记一条后，概览与该模块列表同时 +1', () => {
    const before = loadOverview().cards.find((card) => card.label === '登记总量')?.value as number
    const result = createEntry('substation', { 站名: '新变电站', 电压等级: '110kV' })
    expect(result.ok).toBe(true)
    const after = loadOverview()
    expect(countEntries('substation')).toBe(4)
    expect(after.modules.find((item) => item.name === '变电站台账')?.created).toBe(4)
    expect(after.cards.find((card) => card.label === '登记总量')?.value).toBe(before + 1)
  })
})

describe('登记的非法值挡回', () => {
  it('主标识为空时拒绝登记', () => {
    const result = createEntry('breaker', { 设备编号: '  ', 断路器型号: 'X' })
    expect(result.ok).toBe(false)
    expect(countEntries('breaker')).toBe(3)
  })

  it('新登记条目不能从外部指定 pending / abnormal，服务层固定给 true/false', () => {
    const result = createEntry('defect', {
      缺陷编号: 'DEFE-9999',
      // 即使调用方尝试混入标志位，服务层也不采信
      pending: 'false',
      abnormal: 'true',
    } as never)
    expect(result.ok).toBe(true)
    const rows = listEntries('defect').items
    const created = rows.find((row) => row.缺陷编号 === 'DEFE-9999')
    expect(created?.pending).toBe(true)
    expect(created?.abnormal).toBe(false)
    expect(created?.status).toBe('待处理')
  })

  it('往数据层直接写非法 abnormal 值会在下次读取时被挡回基线', () => {
    // 绕过服务层制造脏数据（模拟旧数据/外部写入）
    const raw = JSON.parse(window.localStorage.getItem('substation-protection:entries') as string)
    raw.data.defect[0].abnormal = 99
    window.localStorage.setItem('substation-protection:entries', JSON.stringify(raw))
    // 重新载入数据层
    resetAllRows()
    const overview = loadOverview()
    expect(overview.cards.find((card) => card.label === '异常量')?.value).toBe(
      MODULES.reduce((sum, meta) => sum + SEED_ROWS[meta.key].filter((r) => r.abnormal).length, 0),
    )
  })
})

describe('状态流转与异常量', () => {
  it('正常动作推进状态，往回走的动作把记录标为异常', () => {
    const ok = runAction('substation', 1, '提交投运')
    expect(ok.ok).toBe(true)
    const row = listEntries('substation').items.find((item) => item.id === 1)
    expect(row?.status).toBe('运行中')

    // settingvalue 的「作废定值」属于往回走动作
    const neg = runAction('settingvalue', 1, '作废定值')
    expect(neg.ok).toBe(true)
    const overview = loadOverview()
    expect(overview.modules.find((item) => item.name === '定值整定')?.abnormal).toBe(2)
  })

  it('未登记的动作被拒绝', () => {
    const result = runAction('substation', 1, '删除变电站')
    expect(result.ok).toBe(false)
  })
})

describe('复位后各模块待办回到起点', () => {
  it('整体复位：每模块回到 3 条、2 待办，且重复复位不产生多余条目', () => {
    createEntry('substation', { 站名: '多出来的站' })
    runAction('breaker', 1, '登记运行')
    let overview = resetAllModules()
    for (const meta of MODULES) {
      const line = overview.modules.find((item) => item.name === meta.name)
      expect(line?.created).toBe(seedBaselineCounts()[meta.key])
      expect(listEntries(meta.key).items.filter((row) => row.pending)).toHaveLength(2)
    }
    // 再来一次复位：数字完全不变
    overview = resetAllModules()
    expect(overview.cards.find((card) => card.label === '登记总量')?.value).toBe(54)
    expect(overview.modules.reduce((sum, item) => sum + item.pending, 0)).toBe(36)
  })

  it('单模块复位不影响概览里其他模块', () => {
    createEntry('patrol', { 巡视编号: 'PATR-9999', 巡视变电站: '某站' })
    resetModule('patrol')
    const overview = loadOverview()
    expect(overview.modules.find((item) => item.name === '设备巡视')?.created).toBe(3)
    expect(overview.cards.find((card) => card.label === '登记总量')?.value).toBe(54)
  })
})
