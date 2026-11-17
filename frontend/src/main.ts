import { createApp } from 'vue'
import 'element-plus/es/components/message/style/css'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/theme.scss'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.mount('#app')
