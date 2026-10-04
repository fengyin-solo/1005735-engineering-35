import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { applyDevResetEpoch } from './data/local-store'
import './styles/global.css'

// 本地开发复位：npm run reset:dev 会把新的 epoch 写进 public/seed-reset.json。
// 应用挂载前先看一眼，epoch 变新就把本地数据收回示例基线，之后刷新读到的都是这一份。
// 仅开发构建请求该文件，生产构建不会带上复位通道。
async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV) {
    try {
      const resp = await fetch('/seed-reset.json', { cache: 'no-store' })
      // Vite 对不存在的文件会回退 index.html（200 + html），只认 JSON 响应。
      if (resp.ok && (resp.headers.get('content-type') ?? '').includes('application/json')) {
        const token = (await resp.json()) as { epoch?: number }
        await applyDevResetEpoch(Number(token.epoch))
      }
    } catch {
      // 复位令牌文件不存在（还没跑过 reset:dev）：什么都不做。
    }
  }

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
}

void bootstrap()
