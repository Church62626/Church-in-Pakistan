<template>
  <nav class="glass-nav">
    <div class="nav-container">
      <!-- Logo -->
      <AppLogo @click="logoOpen = true" />

      <!-- Desktop Navigation Links -->
      <div class="nav-links">
        <router-link
          v-for="item in navItems"
          :key="item.title"
          :to="item.to"
          class="nav-link"
          active-class="active"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          {{ item.title }}
        </router-link>
      </div>

      <!-- Right Actions -->
      <div class="nav-actions">
        <!-- Theme Toggle -->
        <ThemeToggle />

        <!-- User Menu / Auth Button -->
        <template v-if="user">
          <span class="user-email" :title="user.email">{{ user.email }}</span>
          <button class="btn btn-small btn-outline" @click="logout">Logout</button>
        </template>
        <template v-else>
          <button class="nav-link login-link" @click="openAuth('login')">Login</button>
          <button class="btn btn-small btn-primary" @click="openAuth('signup')">
            Get Started
          </button>
        </template>

        <!-- Mobile Menu Button -->
        <button class="mobile-menu-btn" @click="mobileMenuOpen = !mobileMenuOpen">
          <span class="hamburger" :class="{ open: mobileMenuOpen }">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </div>
    </div>

    <!-- Mobile Navigation Menu -->
    <transition name="slide">
      <div v-if="mobileMenuOpen" class="mobile-menu">
        <router-link
          v-for="item in navItems"
          :key="item.title"
          :to="item.to"
          class="mobile-link"
          active-class="active"
          @click="mobileMenuOpen = false"
        >
          <span class="mobile-icon">{{ item.icon }}</span>
          {{ item.title }}
        </router-link>
        <div class="mobile-actions">
          <ThemeToggle />
          <div class="mobile-auth">
            <template v-if="user">
              <span class="user-email">{{ user.email }}</span>
              <button class="btn btn-small btn-outline" @click="logoutFromMobile">Logout</button>
            </template>
            <template v-else>
              <button class="btn btn-small btn-outline" @click="authFromMobile('login')">
                Login
              </button>
              <button class="btn btn-small btn-primary" @click="authFromMobile('signup')">
                Get Started
              </button>
            </template>
          </div>
        </div>
      </div>
    </transition>

    <!-- Auth Modal -->
    <AuthModal v-model="authOpen" :start-mode="authMode" @authenticated="onAuthenticated" />

    <!-- Circular Logo Modal (teleported so the nav's backdrop-filter
         cannot trap the fixed overlay) -->
    <teleport to="body">
      <transition name="fade">
        <div v-if="logoOpen" class="logo-overlay" @click.self="logoOpen = false">
          <div class="logo-modal">
            <img :src="logoImage" alt="Church in Pakistan Logo" class="logo-modal-img" />
          </div>
        </div>
      </transition>
    </teleport>
  </nav>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import AppLogo from './AppLogo.vue'
import ThemeToggle from './ThemeToggle.vue'
import AuthModal from './AuthModal.vue'
import { authMethods } from '../js/firebase-config.js'
import logoImage from '../assets/logo.png'

const mobileMenuOpen = ref(false)
const authOpen = ref(false)
const authMode = ref('login')
const logoOpen = ref(false)

const user = ref(null)

const navItems = [
  { title: 'Home', to: '/', icon: '🏠' },
  { title: 'Reader', to: '/reader', icon: '🎵' },
  { title: 'Library', to: '/library', icon: '📚' },
  { title: 'Store', to: '/store', icon: '🛍️' },
  { title: 'Events', to: '/events', icon: '📅' },
  { title: 'About', to: '/about', icon: 'ℹ️' }
]

function openAuth(mode) {
  authMode.value = mode
  authOpen.value = true
}

function authFromMobile(mode) {
  mobileMenuOpen.value = false
  openAuth(mode)
}

function logoutFromMobile() {
  mobileMenuOpen.value = false
  logout()
}

function onAuthenticated(payload) {
  user.value = {
    email: payload.email
  }
}

async function logout() {
  try {
    await authMethods.logout()
  } catch (e) {
    console.warn('Logout failed', e)
  } finally {
    user.value = null
  }
}

let unsubscribeAuth = null

onMounted(() => {
  // Keep the navbar in sync with the Firebase session
  unsubscribeAuth = authMethods.onAuthChange((firebaseUser) => {
    user.value = firebaseUser ? { email: firebaseUser.email } : null
  })
})

onUnmounted(() => {
  if (unsubscribeAuth) {
    unsubscribeAuth()
    unsubscribeAuth = null
  }
})
</script>

<style scoped>
.nav-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.95rem;
  font-family: inherit;
  border: none;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-link:hover {
  background: var(--primary-bg);
  color: var(--primary);
}

.nav-link.active {
  color: var(--primary);
  background: var(--primary-bg);
}

.nav-icon {
  font-size: 1.1rem;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.login-link {
  margin-right: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 22px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  font-family: inherit;
  text-decoration: none;
  cursor: pointer;
  border: none;
  transition: all 0.25s ease;
  white-space: nowrap;
}

.btn-small {
  padding: 8px 18px;
  font-size: 0.9rem;
}

.btn-primary {
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  color: var(--text-inverse);
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
}

.btn-primary:hover {
  background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
  transform: translateY(-2px);
}

.btn-outline {
  background: transparent;
  color: var(--primary);
  border: 1px solid var(--primary);
}

.btn-outline:hover {
  background: var(--primary-bg);
  transform: translateY(-1px);
}

.user-email {
  background: transparent;
  border: none;
  font-family: inherit;
  color: var(--text-secondary);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.user-email:hover {
  background: var(--primary-bg);
  color: var(--primary);
}

.mobile-menu-btn {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  z-index: 1001;
}

.hamburger {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 24px;
}

.hamburger span {
  display: block;
  width: 100%;
  height: 2px;
  background: var(--text-primary);
  border-radius: 2px;
  transition: all 0.3s ease;
}

.hamburger.open span:nth-child(1) {
  transform: rotate(45deg) translate(5px, 5px);
}

.hamburger.open span:nth-child(2) {
  opacity: 0;
}

.hamburger.open span:nth-child(3) {
  transform: rotate(-45deg) translate(5px, -5px);
}

.mobile-menu {
  position: fixed;
  top: 64px;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-primary);
  backdrop-filter: blur(20px) saturate(180%);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 1000;
}

.mobile-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  color: var(--text-primary);
  text-decoration: none;
  font-size: 1.1rem;
  font-weight: 500;
  border-radius: 12px;
  transition: all 0.2s ease;
}

.mobile-link:hover {
  background: var(--primary-bg);
  color: var(--primary);
}

.mobile-icon {
  font-size: 1.3rem;
}

.mobile-actions {
  margin-top: auto;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.mobile-auth {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.mobile-auth .btn {
  width: 100%;
  max-width: 320px;
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Circular logo modal - zero sharp corners */
.logo-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
  padding: 24px;
}

.logo-modal {
  width: min(280px, 78vw);
  height: min(280px, 78vw);
  border-radius: 50%;
  background: var(--surface);
  backdrop-filter: blur(24px) saturate(200%);
  -webkit-backdrop-filter: blur(24px) saturate(200%);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: hidden;
}

.logo-modal-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
  /* Seal fills 91-95% of the photo frame; zoom just enough to sit flush
     against the circular edge without cropping the outer rim/text. */
  transform: scale(1.06);
}

/* Mobile responsive */
@media (max-width: 768px) {
  .mobile-menu-btn {
    display: block;
  }

  .nav-links,
  .login-link,
  .nav-actions .user-email,
  .nav-actions .btn {
    display: none;
  }
}
</style>
