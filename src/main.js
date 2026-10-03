import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'

// Firebase (auth + firestore) is initialized as a side effect of this import.
// See src/js/firebase-config.js for the project credentials.
import './js/firebase-config.js'

// Create Vue app
const app = createApp(App)

app.use(router)

// Mount app
app.mount('#app')

// Expose for debugging (remove in production)
console.log('🚀 Lord\'s Recovery Church - Pakistan')
console.log('📖 Digital Reader | 🛍️ Store | 🎵 Hymns | 📅 Events')
console.log('🔥 Firebase authentication ready')

