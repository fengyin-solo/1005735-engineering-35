// 数据层关键语义的无浏览器冒烟测试：esbuild 打包成单文件，
// 每个「页面加载」用独立 vm realm 执行（模块缓存归零），共用同一个 localStorage 替身。
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'

const HARNESS = `
import { allRows, listRows, saveRows, resetRows, applyPendingDevReset, moduleCounts, devResetFlagKey } from '@/data/local-store'
import { MODULES } from '@/data/modules'
import { SEED_ROWS, SEED_VERSION as SEED_VERSION_REF } from '@/data/seed'

const results = []
const check = (name, cond) => results.push([name, !!cond])
const MODULE_KEYS = MODULES.map(m => m.key)
const KEY = 'substation-protection:entries'
const totalOf = (rows) => MODULE_KEYS.reduce((s, k) => s + rows[k].length, 0)
const pendingOf = (rows) => MODULE_KEYS.reduce((s, k) => s + rows[k].filter(r => r.pending).length, 0)
const firstFieldOf = (k) => MODULES.find(m => m.key === k).fields[0]

// 场景由 __scenario 指定：每次 import 都是一次“刷新”
const scenario = globalThis.__scenario

if (scenario === 'initial') {
  check('首次播种总量=54', totalOf(allRows()) === 54)
}

if (scenario === 'repeat') {
  check('重复装载不增量', totalOf(allRows()) === 54)
}

if (scenario === 'resume-seed') {
  // 上一次只装完 5 个模块就断了
  const raw = JSON.parse(localStorage.getItem(KEY))
  raw.seeded = raw.seeded.slice(0, 5)
  localStorage.setItem(KEY, JSON.stringify(raw))
  const rows = allRows()
  check('断后续跑补齐且不重复', totalOf(rows) === 54)
  check('续跑后18个模块全部标记播种', JSON.parse(localStorage.getItem(KEY)).seeded.length === 18)
}

if (scenario === 'stale-version') {
  // 上月那份：版本旧、还多塞了一条
  const stale = JSON.parse(localStorage.getItem(KEY))
  stale.version = '2025.09.01'
  stale.data[MODULE_KEYS[0]].push({ id: 999, status: 'x', pending: true, abnormal: false })
  localStorage.setItem(KEY, JSON.stringify(stale))
  const rows = allRows()
  check('旧版本数据被重补，总量回到54', totalOf(rows) === 54)
  check('旧版本里的多余条目被清掉', rows[MODULE_KEYS[0]].every(r => r.id !== 999))
}

if (scenario === 'bad-rows') {
  const bad = JSON.parse(localStorage.getItem(KEY))
  bad.data[MODULE_KEYS[0]] = [{ id: 'oops', status: 1, pending: 'yes', abnormal: null }]
  localStorage.setItem(KEY, JSON.stringify(bad))
  check('非法值整份挡回示例数据', totalOf(allRows()) === 54)
}

if (scenario === 'broken-json') {
  localStorage.setItem(KEY, '{not json')
  check('损坏JSON安全回退', totalOf(allRows()) === 54)
}

if (scenario === 'save-guard') {
  let blockedBad = false
  try { saveRows(MODULE_KEYS[0], [{ id: 1, status: 'a', pending: 'x', abnormal: false }]) } catch { blockedBad = true }
  let blockedUnknown = false
  try { saveRows('not-a-module', []) } catch { blockedUnknown = true }
  check('saveRows 挡回非法结构', blockedBad)
  check('saveRows 挡回未知模块', blockedUnknown)
  check('挡回后数据原样仍=54', totalOf(allRows()) === 54)
}

if (scenario === 'stale-resume-prep') {
  // 构造迁移到第 6 个模块时中断后的存储现场：版本号已更新，
  // 前 6 个模块已换成新示例数据，后 12 个仍是旧内容（含多余条目），seeded 只记了 6 个。
  const current = JSON.parse(localStorage.getItem(KEY))
  const partial = {
    version: SEED_VERSION_REF,
    seeded: MODULE_KEYS.slice(0, 6),
    data: { ...current.data },
  }
  for (const k of MODULE_KEYS.slice(0, 6)) {
    partial.data[k] = SEED_ROWS[k].map(r => ({ ...r }))
  }
  partial.data[MODULE_KEYS[6]].push({ id: 998, status: '旧条目', pending: true, abnormal: false })
  localStorage.setItem(KEY, JSON.stringify(partial))
  results.push(['迁移中断现场已构造', partial.seeded.length === 6])
}

if (scenario === 'stale-resume-finish') {
  const rows = allRows()
  check('迁移中断续跑后总量=54', totalOf(rows) === 54)
  check('续跑后18个模块全部播种', JSON.parse(localStorage.getItem(KEY)).seeded.length === 18)
  check('未迁模块的旧条目被清掉', rows[MODULE_KEYS[6]].every(r => r.id !== 998))
  check('已迁模块保持新示例数据', rows[MODULE_KEYS[0]].length === SEED_ROWS[MODULE_KEYS[0]].length)
}

if (scenario === 'overview-sync') {
  // 模拟运营概览：卡片登记总量 = 各模块列表长度之和（同一存储、同一口径）
  const rows = allRows()
  const sumFromLists = MODULE_KEYS.reduce((s, k) => s + listRows(k).length, 0)
  const sumFromCounts = MODULE_KEYS.reduce((s, k) => s + moduleCounts(rows[k]).created, 0)
  check('概览登记总量=模块列表之和', sumFromCounts === 54)
  check('两种取数口径完全一致', sumFromLists === sumFromCounts)
  // 某模块被动作流转改了一条（pending 变化），两处仍一致
  const changed = rows[MODULE_KEYS[1]].map(r => ({ ...r }))
  changed[0].pending = false
  saveRows(MODULE_KEYS[1], changed)
  const pendingLists = MODULE_KEYS.reduce((s, k) => s + listRows(k).filter(r => r.pending).length, 0)
  const pendingCounts = MODULE_KEYS.reduce((s, k) => s + moduleCounts(allRows()[k]).pending, 0)
  check('流转后待处理两处仍同步', pendingLists === pendingCounts)
}

if (scenario === 'counts') {
  const rows = listRows(MODULE_KEYS[0])
  check('moduleCounts 与列表同源', moduleCounts(rows).created === rows.length)
}

if (scenario === 'reset-run') {
  const before = pendingOf(allRows())
  localStorage.setItem(devResetFlagKey(), JSON.stringify({ nonce: 1750000000000, done: [] }))
  applyPendingDevReset()
  check('复位标记被消费', localStorage.getItem(devResetFlagKey()) === null)
  const rows = allRows()
  check('复位后每模块待办多一条(共+18)', pendingOf(rows) === before + 18)
  check('复位后总量=54+18=72', totalOf(rows) === 72)
  check('每个模块都有复位尾迹', MODULE_KEYS.every(k => rows[k].some(r => r[firstFieldOf(k)] === '开发环境数据已复位')))
  check('尾迹均为待办且非异常', MODULE_KEYS.every(k => rows[k].some(r => r.id < 0 && r.pending && !r.abnormal)))
}

if (scenario === 'reset-resume') {
  // 前 7 个模块已复位、标记停在 done=7，模拟装到一半断了
  const mid = JSON.parse(localStorage.getItem(KEY))
  const nonce = 1750000000001
  for (const k of MODULE_KEYS.slice(0, 7)) {
    mid.data[k].push({ id: -nonce, status: MODULES.find(m => m.key === k).statuses[0], pending: true, abnormal: false, [firstFieldOf(k)]: '开发环境数据已复位' })
  }
  localStorage.setItem(KEY, JSON.stringify(mid))
  localStorage.setItem(devResetFlagKey(), JSON.stringify({ nonce, done: MODULE_KEYS.slice(0, 7) }))
  applyPendingDevReset()
  const rows = allRows()
  check('中断复位续跑后总量=72', totalOf(rows) === 72)
  check('每模块恰好一条本轮尾迹', MODULE_KEYS.every(k => rows[k].filter(r => r.id === -nonce).length === 1))
}

if (scenario === 'reset-repeat') {
  // 再来一轮复位：尾迹随数据重置，只保留当前轮那一条，不叠加
  const nonce = 1750000000002
  localStorage.setItem(devResetFlagKey(), JSON.stringify({ nonce, done: [] }))
  applyPendingDevReset()
  const rows = allRows()
  check('新一轮复位后总量仍=72', totalOf(rows) === 72)
  check('旧尾迹不叠加，每模块恰好一条负id尾迹', MODULE_KEYS.every(k => rows[k].filter(r => r.id < 0).length === 1 && rows[k].some(r => r.id === -nonce)))
}

if (scenario === 'single-reset') {
  const one = resetRows(MODULE_KEYS[0])
  check('单模块复位回示例条数', one.length === SEED_ROWS[MODULE_KEYS[0]].length)
  check('单模块复位不带尾迹', one.every(r => r.id > 0))
}

globalThis.__results = results
`

const outDir = mkdtempSync(join(tmpdir(), 'store-test-'))
const outfile = join(outDir, 'test.js')
await build({
  stdin: { contents: HARNESS, loader: 'ts', resolveDir: process.cwd() },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  define: { 'import.meta.env.DEV': 'true' },
  alias: { '@': join(process.cwd(), 'src') },
  outfile,
  write: true,
})

// 持久 KV：所有“页面加载”共用这一份，刷新后读到的还是同一份。
const kv = new Map()
const sharedLocalStorage = {
  getItem: (k) => (kv.has(k) ? kv.get(k) : null),
  setItem: (k, v) => kv.set(k, String(v)),
  removeItem: (k) => kv.delete(k),
  clear: () => kv.clear(),
}

const bundleSource = await import('node:fs').then((fs) => fs.readFileSync(outfile, 'utf8'))

async function load(scenario) {
  const sandbox = {
    console,
    localStorage: sharedLocalStorage,
    window: { localStorage: sharedLocalStorage },
    __scenario: scenario,
    __results: [],
  }
  vm.createContext(sandbox)
  // 打包为 iife 会直接执行；用 new Function 在该上下文求值。
  vm.runInContext(bundleSource, sandbox, { filename: 'harness.js' })
  return sandbox.__results
}

const scenarios = [
  'initial',
  'repeat',
  'resume-seed',
  'stale-version',
  'stale-resume',
  'bad-rows',
  'broken-json',
  'save-guard',
  'counts',
  'overview-sync',
  'reset-run',
  'reset-resume',
  'reset-repeat',
  'single-reset',
]

function report(label, results, failedRef) {
  for (const [name, ok] of results) {
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  [${label}] ${name}\n`)
    if (!ok) failedRef.value++
  }
}

const failed = { value: 0 }
for (const scenario of scenarios) {
  kv.clear()
  await load('initial')
  if (scenario === 'repeat') {
    await load('repeat')
    report(scenario, await load('repeat'), failed)
    continue
  }
  if (scenario === 'stale-resume') {
    report('stale-resume-prep', await load('stale-resume-prep'), failed)
    report('stale-resume-finish', await load('stale-resume-finish'), failed)
    continue
  }
  report(scenario, await load(scenario), failed)
}
process.exit(failed.value ? 1 : 0)
