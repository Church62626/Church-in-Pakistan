<template>
  <teleport to="body">
    <div v-if="open" class="auth-overlay" @click.self="close">
      <div class="auth-modal glass-modal">
        <button class="auth-close" @click="close" aria-label="Close">×</button>

        <div class="auth-header">
          <h2 class="auth-title">{{ mode === 'login' ? 'Welcome back' : 'Get Started' }}</h2>
          <p class="auth-subtitle">
            {{ mode === 'login' ? 'Sign in to your account' : 'Create a new account' }}
          </p>
        </div>

        <form class="auth-form" @submit.prevent="submit">
          <label class="auth-label" for="auth-email">Email</label>
          <input
            id="auth-email"
            v-model="email"
            type="email"
            class="glass-input"
            placeholder="you@example.com"
            required
          />

          <label class="auth-label" for="auth-password">Password</label>
          <input
            id="auth-password"
            v-model="password"
            type="password"
            class="glass-input"
            placeholder="••••••••"
            required
          />

          <p v-if="error" class="auth-error">{{ error }}</p>

          <button type="submit" class="auth-submit glass-btn-primary" :disabled="loading || googleLoading">
            {{ loading ? 'Please wait...' : (mode === 'login' ? 'Login' : 'Create Account') }}
          </button>
        </form>

        <div class="auth-divider"><span>or</span></div>

        <button
          type="button"
          class="auth-google-btn glass-glow"
          :disabled="loading || googleLoading"
          @click="signInWithGoogle"
        >
          <svg class="auth-google-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          <span>{{ googleLoading ? 'Connecting to Google...' : 'Sign in with Google' }}</span>
        </button>

        <p class="auth-switch">
          {{ mode === 'login' ? "Don't have an account?" : 'Already have an account?' }}
          <button type="button" class="auth-switch-btn" @click="toggleMode">
            {{ mode === 'login' ? 'Sign up' : 'Log in' }}
          </button>
        </p>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { authMethods } from '../js/firebase-config.js'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  startMode: {
    type: String,
    default: 'login'
  }
})

const emit = defineEmits(['update:modelValue', 'authenticated'])

const open = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const mode = ref(props.startMode)
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const googleLoading = ref(false)

// Sync the form mode with the button that opened the modal
watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      mode.value = props.startMode
      error.value = ''
      loading.value = false
      googleLoading.value = false
    }
  }
)

function close() {
  open.value = false
  error.value = ''
}

function toggleMode() {
  mode.value = mode.value === 'login' ? 'signup' : 'login'
  error.value = ''
}

/**
 * Translate Firebase auth error codes into human readable messages.
 * Returns an empty string for user-cancelled actions (no message shown).
 */
function friendlyError(err) {
  const code = err && err.code ? err.code : ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return ''
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google pop-up. Please allow pop-ups for this site and try again.'
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised for Google sign-in. Add it under Authentication → Settings → Authorized domains in the Firebase console.'
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/user-not-found':
    case 'auth/user-disabled':
      return 'No account found with that email.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'That email is already registered. Try logging in instead.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in the Firebase console.'
    case 'auth/configuration-not-found':
      return 'Firebase auth is not configured for this project yet.'
    default:
      return err && err.message ? err.message : 'Something went wrong. Please try again.'
  }
}

/**
 * Google OAuth popup sign-in.
 */
async function signInWithGoogle() {
  error.value = ''
  googleLoading.value = true

  try {
    const credential = await authMethods.signInWithGoogle()

    emit('authenticated', {
      email: credential && credential.user && credential.user.email ? credential.user.email : ''
    })

    close()
  } catch (err) {
    error.value = friendlyError(err)
  } finally {
    googleLoading.value = false
  }
}

async function submit() {
  error.value = ''
  loading.value = true

  try {
    if (mode.value === 'signup') {
      await authMethods.signUp(email.value, password.value)
    } else {
      await authMethods.signIn(email.value, password.value)
    }

    emit('authenticated', {
      email: email.value
    })

    close()
  } catch (err) {
    error.value = friendlyError(err)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  padding: 24px;
}

.auth-modal {
  width: 100%;
  max-width: 420px;
  padding: 28px 24px 22px;
  border-radius: 20px;
  position: relative;
}

.auth-close {
  position: absolute;
  top: 12px;
  right: 14px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  padding: 6px;
}

.auth-close:hover {
  color: var(--text-primary);
}

.auth-header {
  margin-bottom: 18px;
}

.auth-title {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 0 0 6px;
  color: var(--text-primary);
}

.auth-subtitle {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.auth-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.auth-error {
  color: #ef4444;
  font-size: 0.9rem;
  margin: 0;
}

.auth-submit {
  margin-top: 4px;
  padding: 12px;
  border-radius: 12px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  color: white;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
}

.auth-submit:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
}

.auth-submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.auth-switch {
  text-align: center;
  margin-top: 14px;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.auth-switch-btn {
  background: transparent;
  border: none;
  color: var(--primary);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

/* "or" divider between the email form and Google sign-in */
.auth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0 14px;
  color: var(--text-tertiary);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

/* Google button - outlined glass so it reads as secondary to the gradient submit */
.auth-google-btn {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  font-family: inherit;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary);
  cursor: pointer;
  background: var(--surface);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
}

.auth-google-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.auth-google-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.auth-google-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
</style>
