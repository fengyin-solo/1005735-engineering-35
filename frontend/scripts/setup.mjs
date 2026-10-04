#!/usr/bin/env node
// 一条命令把依赖与示例数据一起装到位：npm run setup
//
// 做两件事，两件都可重复执行、中断后重跑能接着走：
//   1. 按 package-lock.json 精确安装依赖（npm ci）；本机装残了（缺可选二进制等）
//      会自动修复一次，版本不会再对不上。
//   2. 校验示例数据 sample/seed.json，打印版本/指纹/条目数。
//      示例数据由前端直接打包，首次打开或发现旧数据时自动播种进 localStorage。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

import { SEED_VERSION, validateSeed } from './seed-lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })
}

// 依赖是否「真的能用」：npm ls 查不出可选依赖（rollup 平台二进制）漏装的老问题，
// 直接让 rollup 跑一次装载探测（会按当前平台加载原生二进制），装残了就能发现。
function depsHealthy() {
  const probe =
    "import('rollup').then((m) => { if (typeof m.rollup !== 'function') process.exit(1) }).catch(() => process.exit(1))"
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

console.log('== [1/2] 安装依赖（按锁文件精确安装） ==')
const hasLock = (() => {
  try {
    readFileSync(resolve(root, 'package-lock.json'))
    return true
  } catch {
    return false
  }
})()

if (hasLock) {
  // 真实装载探测：缺包 / 缺 rollup 平台二进制（npm 可选依赖老 bug）都算装残，
  // 让 npm ci 从头装一遍；npm ci 本身可安全重入，中断后重跑能接着收敛。
  if (depsHealthy()) {
    console.log('依赖可正常装载，跳过安装（重跑不会重复装）')
  } else {
    console.log('发现依赖缺失或版本不一致，按锁文件全新安装……')
    try {
      run('npm', ['ci', '--no-audit'])
    } catch {
      // npm 历史上有可选依赖漏装的 bug（rollup 平台二进制），
      // ci 失败时退回 install 补齐一次，再用 ci 收敛回锁文件版本。
      console.log('npm ci 未完成，改用 npm install 补齐可选依赖后重试……')
      run('npm', ['install', '--no-audit'])
      run('npm', ['ci', '--no-audit'])
    }
    if (!depsHealthy()) {
      console.error('依赖安装后仍无法装载 rollup，请清除 node_modules 后重试 npm run setup')
      process.exit(1)
    }
  }
} else {
  // 没有锁文件就退化为 install（仓库本身应当提交锁文件，这只是兜底）。
  console.log('未找到 package-lock.json，使用 npm install（建议把生成的锁文件提交进仓库）')
  run('npm', ['install', '--no-audit'])
}

console.log('')
console.log('== [2/2] 校验示例数据 sample/seed.json ==')
const seedRows = JSON.parse(readFileSync(resolve(root, 'sample/seed.json'), 'utf8'))
const info = validateSeed(seedRows)
console.log(`示例数据版本：${SEED_VERSION}`)
console.log(`数据指纹：${info.fingerprint}`)
console.log(`业务模块：${info.moduleCount} 个，登记总量：${info.totalRows} 条`)
console.log('')
console.log('依赖与示例数据均已就位。执行 npm run dev 启动，首次打开自动播种；')
console.log('需要把本机数据收回初始状态时执行：npm run reset:dev（仅本地开发）。')
