import { createRouter, createWebHistory } from 'vue-router'
import Home from '../pages/Home.vue'
import List from '../pages/List.vue'
import Listen from '../pages/Listen.vue'
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
    path: '/list',
    name: 'List',
    component: List
  },
  {
    // The Reader page was renamed to List. Existing bookmarks, shared links and
    // QR codes pointing at /reader must keep working, so this redirect keeps
    // the whole query string (id, category, language) intact.
    path: '/reader',
    name: 'ReaderRedirect',
    redirect: (to) => ({ name: 'List', query: to.query, hash: to.hash })
  },
  {
    path: '/listen',
    name: 'Listen',
    component: Listen
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
