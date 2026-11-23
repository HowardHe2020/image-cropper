import { createApp } from 'vue'
import { ElButton, ElIcon, ElSlider } from 'element-plus'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/icon/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/slider/style/css'
import './style.css'
import App from './App.vue'

createApp(App)
  .component('ElButton', ElButton)
  .component('ElIcon', ElIcon)
  .component('ElSlider', ElSlider)
  .mount('#app')
