#!/usr/bin/env node
// 一键装到位：钉死版本的依赖 + 校验示例数据。
//
// 做两件事：
//   1. 按 package-lock.json 安装依赖（npm ci），所有人、本机与 CI 拿到的版本完全一致；
//   2. 校验 src/data/seed.json 与模块元数据一一对应，保证两条命令、浏览器播种
//      读到的都是同一份示例数据，并落一枚安装戳记记录「装到位」的版本。
//
// 可反复执行：npm ci 本身幂等，校验与戳记写入也是幂等的，不会多出一份数据。
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const seedPath = join(root, 'src', 'data', 'seed.json')
const modulesPath = join(root, 'src', 'data', 'modules.ts')
const stampPath = join(root, '.install-stamp.json')

function log(message) {
  process.stdout.write(`${message}\n`)
}

function fail(message) {
  process.stderr.write(`setup 失败：${message}\n`)
  process.exit(1)
}

// 1) 依赖：有锁文件用 npm ci 严格按锁装；第一次没有锁文件时退回 npm install 生成锁。
const hasLock = existsSync(join(root, 'package-lock.json'))
const installCmd = hasLock ? 'npm ci' : 'npm install'
log(`==> 安装依赖（${installCmd}），版本以 package-lock.json 为准`)
try {
  execSync(installCmd, { cwd: root, stdio: 'inherit' })
} catch {
  fail('依赖安装中断。依赖安装本身可断点续跑：修好网络后重新执行 npm run setup 即可，已装好的包不会重复下载。')
}
if (!hasLock) {
  log('==> 已生成 package-lock.json，请把它提交进仓库，之后所有人都会按这份锁安装')
}

// 2) 示例数据：校验 seed.json 覆盖全部业务模块，结构合法、计数自洽。
log('==> 校验示例数据 src/data/seed.json')
let seed
try {
  seed = JSON.parse(readFileSync(seedPath, 'utf8'))
} catch (error) {
  fail(`seed.json 无法解析：${error.message}`)
}
if (!seed || typeof seed.version !== 'string' || typeof seed.modules !== 'object' || seed.modules === null) {
  fail('seed.json 结构应为 { version: string, modules: Record<string, EntryRow[]> }')
}

const modulesSource = readFileSync(modulesPath, 'utf8')
const declaredKeys = [...modulesSource.matchAll(/\n\s*key:\s*"([^"]+)"/g)].map((match) => match[1])
if (declaredKeys.length === 0) {
  fail('没能从 modules.ts 解析出模块 key')
}

let totalRows = 0
const problems = []
for (const key of declaredKeys) {
  const rows = seed.modules[key]
  if (!Array.isArray(rows)) {
    problems.push(`模块 ${key} 在 seed.json 中缺失或不是数组`)
    continue
  }
  const ids = new Set()
  rows.forEach((row, index) => {
    if (typeof row !== 'object' || row === null) {
      problems.push(`${key}[${index}] 不是对象`)
      return
    }
    if (!Number.isFinite(row.id)) {
      problems.push(`${key}[${index}] 的 id 非法`)
    } else if (ids.has(row.id)) {
      problems.push(`${key}[${index}] 的 id=${row.id} 重复，反复装载会被当成同一条`)
    }
    ids.add(row.id)
    if (typeof row.status !== 'string') problems.push(`${key}#${row.id ?? index} 的 status 非法`)
    if (typeof row.pending !== 'boolean') problems.push(`${key}#${row.id ?? index} 的 pending 非法`)
    if (typeof row.abnormal !== 'boolean') problems.push(`${key}#${row.id ?? index} 的 abnormal 非法`)
  })
  totalRows += rows.length
}
for (const key of Object.keys(seed.modules)) {
  if (!declaredKeys.includes(key)) {
    problems.push(`seed.json 含 modules.ts 未登记的模块 ${key}，会让登记总量对不上`)
  }
}
if (problems.length > 0) {
  fail(`示例数据校验未通过：\n - ${problems.join('\n - ')}`)
}

// 3) 安装戳记：原子写入，重复执行只覆盖同一份，不会多出来。
const checksum = createHash('sha256').update(readFileSync(seedPath)).digest('hex')
const stamp = {
  installedAt: new Date().toISOString(),
  seedVersion: seed.version,
  seedChecksum: checksum,
  moduleCount: declaredKeys.length,
  totalRows,
}
const tmp = `${stampPath}.tmp`
writeFileSync(tmp, `${JSON.stringify(stamp, null, 2)}\n`)
renameSync(tmp, stampPath)

log(`==> 完成：${declaredKeys.length} 个模块、${totalRows} 条示例数据（seed ${seed.version}）`)
log('    首次打开页面时浏览器会按这份数据播种；装到一半断了重开页面会接着补，重复装载不增量。')
