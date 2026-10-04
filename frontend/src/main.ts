import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { applyPendingDevReset } from './data/local-store'
import './styles/global.css'

// 开发环境复位页落下标记后，在任何页面读到数据前把本地数据收回初始状态。
applyPendingDevReset()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
