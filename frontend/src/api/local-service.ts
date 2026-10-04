import { MODULE_BY_KEY } from '@/data/modules'
import {
  allRows,
  listRows,
  resetAllRows,
  resetRows,
  saveRows,
} from '@/data/local-store'
import { SEED_ROWS } from '@/data/seed'
import { isValidRow } from '@/data/seed-rules'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

// 各业务模块「登记总量」的唯一口径：无筛选时直接取该模块的条目数。
// 运营概览汇总各模块时也用同一个函数，两处数字必须对得齐。
export function countEntries(key: string): number {
  return listRows(key).length
}

// 登记新条目：非法值在写入前挡回，绝不落进本地数据。
// pending / abnormal 由服务层按既有规则给出，不接受调用方塞进来的值。
export function createEntry(key: string, form: Record<string, string>): ActionResult {
  const meta = moduleMeta(key)
  const values: Record<string, string> = {}
  for (const field of meta.fields) {
    const value = String(form[field] ?? '').trim()
    values[field] = value
  }
  // 第一个字段是该业务对象的主标识（站名/装置编号/定值单号……），不允许空登记。
  const primary = meta.fields[0]
  if (values[primary] === '') {
    return { ok: false, message: `${primary}不能为空，${meta.entity}没有登记成功` }
  }
  const rows = listRows(key)
  const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const firstStatus = meta.statuses[0]
  const row: EntryRow = {
    id: nextId,
    status: firstStatus,
    pending: true,
    abnormal: false,
    ...values,
  }
  if (!isValidRow(row)) {
    // 兜底：任何不符合数据层契约的记录都不允许写入。
    return { ok: false, message: `${meta.entity}登记内容含有非法值，已挡回` }
  }
  saveRows(key, [...rows, row])
  return { ok: true, message: `${meta.entity}已登记，当前状态「${firstStatus}」` }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

// 全部模块复位：一次性把各模块待办清单收回示例起点（全量覆盖，不追加）。
export function resetAllModules(): OverviewResult {
  resetAllRows()
  return loadOverview()
}

// 示例起点下每个模块的条目数：复位结果与这份基线对齐，多一条少一条都算复位失败。
export function seedBaselineCounts(): Record<string, number> {
  return Object.fromEntries(Object.keys(SEED_ROWS).map((key) => [key, SEED_ROWS[key].length]))
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    // 与模块列表页同一个数据源、同一个计数口径（countEntries）。
    const entries = allRows()[meta.key] ?? []
    return {
      name: meta.name,
      created: countEntries(meta.key),
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
