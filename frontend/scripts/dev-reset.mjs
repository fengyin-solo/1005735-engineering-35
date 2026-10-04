#!/usr/bin/env node
// 只给本地开发环境用：把浏览器里的本地数据收回初始状态。
//
// 复位动作必须发生在浏览器里（数据在 localStorage），所以这个脚本：
//   1. 确认 dev server 在跑（没跑就在后台拉起来，只起这一个）；
//   2. 确认 /__dev_reset 复位入口存在（该入口只在 dev server 挂载，生产构建没有）；
//   3. 给出复位地址，用浏览器打开即完成复位。
//
// 复位后每个业务模块回到示例数据，且待办清单多出一条「开发环境数据已复位」尾迹；
// 重复复位不叠加尾迹，复位过程中断（关页面/断网）后重开页面会接着走完。
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 5173)
const base = `http://${host}:${port}`
const resetUrl = `${base}/__dev_reset`

function log(message) {
  process.stdout.write(`${message}\n`)
}

async function checkServer() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    const res = await fetch(resetUrl, { method: 'GET', signal: controller.signal })
    clearTimeout(timer)
    if (res.status !== 200) {
      return { alive: true, ready: false }
    }
    const body = await res.text()
    return { alive: true, ready: body.includes('substation-protection:dev-reset') }
  } catch {
    return { alive: false, ready: false }
  }
}

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const status = await checkServer()
    if (status.ready) {
      return true
    }
    await delay(500)
  }
  return false
}

async function main() {
  let status = await checkServer()
  if (status.alive && !status.ready) {
    log(`==> ${base} 已被其他程序占用，且不是本项目的 dev server（没有 /__dev_reset 入口）`)
    log('    请先停掉占用进程，或用 PORT=其他端口 npm run dev，再执行本命令。')
    process.exit(1)
  }
  if (!status.alive) {
    log(`==> dev server 未运行，先在后台拉起（npm run dev，${base}）`)
    const child = spawn('npm', ['run', 'dev', '--', '--host', host, '--port', String(port)], {
      cwd: new URL('..', import.meta.url).pathname,
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    const ready = await waitForServer()
    if (!ready) {
      log('==> dev server 启动超时，请先手动执行 npm run dev，再执行 npm run db:reset。')
      process.exit(1)
    }
  }

  log('')
  log('==============================================================')
  log(' 本地数据复位入口（仅开发环境有效）：')
  log(`   ${resetUrl}`)
  log(' 用浏览器打开即完成复位，页面会自动跳回运营概览。')
  log(' 复位后：各模块回到示例数据，待办清单各多出一条复位尾迹。')
  log('==============================================================')
  log('')
}

main().catch((error) => {
  process.stderr.write(`db:reset 失败：${error?.message ?? error}\n`)
  process.exit(1)
})
