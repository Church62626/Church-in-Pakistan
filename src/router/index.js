import { createRouter, createWebHistory } from 'vue-router'
import Home from '../pages/Home.vue'
import Reader from '../pages/Reader.vue'
import Library from '../pages/Library.vue'
import Store from '../pages/Store.vue'
import Events from '../pages/Events.vue'
import About from '../pages/About.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/reader',
    name: 'Reader',
    component: Reader
  },
  {
    path: '/library',
    name: 'Library',
    component: Library
  },
  {
    path: '/store',
    name: 'Store',
    component: Store
  },
  {
    path: '/events',
    name: 'Events',
    component: Events
  },
  {
    path: '/about',
    name: 'About',
    component: About
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
