#!/usr/bin/env node
// 只给本地开发环境用，把数据收回初始状态：npm run reset:dev
//
// 与 npm run setup 使用同一份示例数据（sample/seed.json，先校验再用）。
// 做法是往 public/seed-reset.json 原子写入一个新的 epoch：
//   - dev server 下打开/刷新页面时，应用读到更大的 epoch，
//     会把 localStorage 里各模块数据全量覆盖回示例基线（覆盖而非追加，不会多出一条）；
//   - 重复执行只会让 epoch 变大，数据始终是这一份示例数据，不会多装载出第二份；
//   - 复位令牌先写临时文件再改名，写一半中断不会留下半截 JSON，重跑即可接着走。
//
// 该文件只在开发构建被请求（main.ts 里 import.meta.env.DEV 守门），不进生产包逻辑。

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { validateSeed } from './seed-lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const seedPath = resolve(root, 'sample/seed.json')
const tokenPath = resolve(root, 'public/seed-reset.json')
const tmpPath = resolve(root, 'public/.seed-reset.tmp')

const seedRows = JSON.parse(readFileSync(seedPath, 'utf8'))
const info = validateSeed(seedRows)

const previous = existsSync(tokenPath)
  ? (() => {
      try {
        return Number(JSON.parse(readFileSync(tokenPath, 'utf8')).epoch)
      } catch {
        return 0
      }
    })()
  : 0
const epoch = Math.max(previous + 1, Date.now())

const payload = JSON.stringify({ epoch, fingerprint: info.fingerprint, createdAt: new Date().toISOString() }, null, 2)
writeFileSync(tmpPath, `${payload}\n`)
renameSync(tmpPath, tokenPath)

console.log(`已发出本地开发复位令牌（epoch=${epoch}）`)
console.log(`示例数据指纹：${info.fingerprint}，共 ${info.moduleCount} 个模块 / ${info.totalRows} 条记录`)
console.log('保持 npm run dev 运行，刷新页面即收回示例初始数据；各模块待办条目回到起点。')
