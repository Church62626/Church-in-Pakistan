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
        <!-- Global language selector -->
        <LanguageSelector v-model="language" @change="onLanguageChange" />

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
          <LanguageSelector v-model="language" @change="onLanguageChange" />
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

    <!-- Logo Dialog (teleported so the nav's backdrop-filter
         cannot trap the fixed overlay) -->
    <teleport to="body">
      <transition name="fade">
        <div
          v-if="logoOpen"
          class="logo-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logo-dialog-title"
          @click.self="logoOpen = false"
          @keydown.esc="logoOpen = false"
        >
          <div class="logo-modal">
            <button
              type="button"
              class="logo-close"
              aria-label="Close"
              @click="logoOpen = false"
            >
              <span aria-hidden="true">âœ•</span>
            </button>

            <img :src="logoImage" alt="Church in Pakistan Logo" class="logo-modal-img" />

            <h2 id="logo-dialog-title" class="logo-modal-title">Lord's Recovery Church</h2>
            <p class="logo-modal-sub">Pakistan</p>

            <nav class="logo-links" aria-label="Church information">
              <router-link to="/about" class="logo-link" @click="logoOpen = false">
                <span aria-hidden="true">â„¹ï¸</span> About Us
              </router-link>
              <a
                class="logo-link"
                :href="`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Feedback - Lord\'s Recovery Church app')}`"
              >
                <span aria-hidden="true">âœ‰ï¸</span> Feedback
              </a>
            </nav>
          </div>
        </div>
      </transition>
    </teleport>
  </nav>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import AppLogo from './AppLogo.vue'
import ThemeToggle from './ThemeToggle.vue'
import AuthModal from './AuthModal.vue'
import LanguageSelector from './LanguageSelector.vue'
import { authMethods } from '../js/firebase-config.js'
import { useRouter } from 'vue-router'
import {
  getLanguage,
  setActiveLanguage,
  resolveInitialLanguage as initialLanguage
} from '../js/hymnService.js'
import logoImage from '../assets/logo.png'

const FEEDBACK_EMAIL = 'churchpakistan52@gmail.com'
const LANG_STORAGE_KEY = 'cip.language'

const mobileMenuOpen = ref(false)
const authOpen = ref(false)
const authMode = ref('login')
const logoOpen = ref(false)

/** Global language. Seeded from localStorage, then from the ?lang= query so a
 *  shared link lands in the right language, then the default. */
const router = useRouter()

/** Apply the resolved language to the store on boot, so pages that read the
 *  global store agree with the selector on first paint. */
const language = ref(initialLanguage())
setActiveLanguage(language.value)

const user = ref(null)

const navItems = [
  { title: 'Home', to: '/', icon: 'ðŸ ' },
  { title: 'Reader', to: '/reader', icon: 'ðŸŽµ' },
  { title: 'Library', to: '/library', icon: 'ðŸ“š' },
  { title: 'Store', to: '/store', icon: 'ðŸ›ï¸' },
  { title: 'Events', to: '/events', icon: 'ðŸ“…' },
  { title: 'About', to: '/about', icon: 'â„¹ï¸' }
]

/** Keep the whole app on one language, and reflect it in the URL when the
 *  current route cares about the language (Library / Reader / List). */
function onLanguageChange(key) {
  setActiveLanguage(key)
  mobileMenuOpen.value = false

  const route = router.currentRoute.value
  if (!route?.name) return
  const wantsLanguage = ['library', 'reader', 'list'].includes(String(route.name))
  if (!wantsLanguage) return

  const query = { ...route.query, language: key }
  // Keep whichever alias the route was already using so old links stay stable.
  if (route.query.lang !== undefined) query.lang = key
  router.replace({ path: route.path, query })
}

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
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px 28px 24px;
  border-radius: 20px;
  width: min(340px, calc(100vw - 48px));
  background: var(--surface);
  backdrop-filter: blur(24px) saturate(200%);
  -webkit-backdrop-filter: blur(24px) saturate(200%);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  animation: modal-pop 0.28s ease;
}

@keyframes modal-pop {
  from { opacity: 0; transform: scale(0.92) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .logo-modal { animation: none; }
}

.logo-close {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(127, 127, 127, 0.16);
  color: var(--text-primary);
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s ease;
}

.logo-close:hover,
.logo-close:focus-visible {
  background: rgba(127, 127, 127, 0.3);
  outline: none;
}

.logo-modal-img {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 50%;
  display: block;
  /* Seal fills 91-95% of the photo frame; zoom just enough to sit flush
     against the circular edge without cropping the outer rim/text. */
  transform: scale(1.06);
}

.logo-modal-title {
  margin: 14px 0 2px;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--text-primary);
  text-align: center;
}

.logo-modal-sub {
  margin: 0 0 16px;
  font-size: 0.82rem;
  color: var(--text-secondary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.logo-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.logo-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: 11px;
  border: 1px solid rgba(127, 127, 127, 0.24);
  background: rgba(127, 127, 127, 0.08);
  color: var(--text-primary);
  font-size: 0.95rem;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.logo-link:hover,
.logo-link:focus-visible {
  background: rgba(127, 127, 127, 0.18);
  border-color: var(--primary-color, #4f7cff);
  outline: none;
}

/* Teleported to <body>, so these transition classes are global, not scoped. */
:global(.fade-enter-active),
:global(.fade-leave-active) {
  transition: opacity 0.22s ease;
}

:global(.fade-enter-from),
:global(.fade-leave-to) {
  opacity: 0;
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
