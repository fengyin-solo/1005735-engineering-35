import { fileURLToPath, URL } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 纯前端应用：没有后端，也就没有 /api 代理，数据全部走 src/api/local-service.ts。

// 仅本地开发环境挂载的复位入口：npm run db:reset 会引导浏览器打开这个地址。
// 页面本身不改数据，只落一枚复位标记，跳回应用后由 main.ts 统一完成数据收回，
// 这样复位逻辑与页面读写用的是同一套 localStorage 数据层。
function devResetEntry(): Plugin {
  return {
    name: 'local-dev-reset-entry',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__dev_reset', (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(RESET_PAGE_HTML)
      })
    },
  }
}

const RESET_PAGE_HTML = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><title>本地数据复位</title></head>
<body>
  <p>正在把本地示例数据收回初始状态……</p>
  <p>若没有自动跳转，请打开 <a href="/">首页</a>。</p>
  <script>
    // nonce 用时间戳：每执行一次复位就是新的一轮，待办尾迹按它去重，重复执行不叠加。
    localStorage.setItem('substation-protection:dev-reset', JSON.stringify({ nonce: Date.now(), done: [] }))
    location.replace('/')
  </script>
</body>
</html>`

export default defineConfig({
  plugins: [vue(), devResetEntry()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // 关掉自动打开页面：起服务时只打印地址，不拉起浏览器
    open: false,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
