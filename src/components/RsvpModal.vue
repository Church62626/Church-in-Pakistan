<template>
  <teleport to="body">
    <div v-if="modelValue" class="rsvp-overlay" @click.self="close">
      <div class="rsvp-modal glass-modal">
        <button type="button" class="rsvp-close" @click="close" aria-label="Close">×</button>

        <!-- Success -->
        <div v-if="submitted" class="rsvp-success">
          <div class="success-icon" aria-hidden="true">✓</div>
          <h2 class="rsvp-title">Your RSVP has been received</h2>
          <p class="success-message">
            Thank you, {{ submittedName }}. You are registered for
            <strong>{{ eventTitle }}</strong>. An usher will confirm your seat before
            the meeting begins.
          </p>
          <button type="button" class="rsvp-submit-btn" @click="close">Done</button>
        </div>

        <!-- Form -->
        <template v-else>
          <div class="rsvp-header">
            <span class="rsvp-eyebrow">RSVP</span>
            <h2 class="rsvp-title">{{ eventTitle }}</h2>
            <p v-if="eventMeta" class="rsvp-subtitle">{{ eventMeta }}</p>
          </div>

          <form class="rsvp-form" @submit.prevent="submitRsvp">
            <label class="field-label" for="rsvp-name">Full Name</label>
            <input
              id="rsvp-name"
              v-model="form.fullName"
              type="text"
              class="glass-input"
              placeholder="Your full name"
              required
            />

            <label class="field-label" for="rsvp-phone">Phone Number</label>
            <input
              id="rsvp-phone"
              v-model="form.phone"
              type="tel"
              class="glass-input"
              placeholder="03xx xxxxxxx"
              required
            />

            <label class="field-label" for="rsvp-attendees">Number of Attendees</label>
            <input
              id="rsvp-attendees"
              v-model.number="form.attendees"
              type="number"
              class="glass-input"
              min="1"
              max="50"
              step="1"
              required
            />
            <p class="field-hint">
              Include yourself and any family members coming with you, so the ushers
              can arrange seating.
            </p>

            <p v-if="error" class="rsvp-error">{{ error }}</p>

            <button
              type="submit"
              class="rsvp-submit-btn"
              :disabled="submitting || !canSubmit"
            >
              {{ submitting ? 'Submitting...' : 'Confirm RSVP' }}
            </button>
          </form>
        </template>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../js/firebase-config.js'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  event: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'rsvp-created'])

const submitted = ref(false)
const submitting = ref(false)
const error = ref('')
const submittedName = ref('')

const emptyForm = () => ({
  fullName: '',
  phone: '',
  attendees: 1
})

const form = ref(emptyForm())

const eventTitle = computed(() =>
  props.event && props.event.title ? props.event.title : 'Church Event'
)

const eventMeta = computed(() => {
  if (!props.event) return ''
  return [props.event.date, props.event.time].filter(Boolean).join(' · ')
})

const canSubmit = computed(() => {
  const current = form.value
  if (!current.fullName.trim() || !current.phone.trim()) return false
  const count = Number(current.attendees)
  return Number.isInteger(count) && count >= 1 && count <= 50
})

let successTimer = null

function clearSuccessTimer() {
  if (successTimer) {
    clearTimeout(successTimer)
    successTimer = null
  }
}

function close() {
  clearSuccessTimer()
  emit('update:modelValue', false)
}

/** Friendly wording for Firestore / network failures. */
function friendlyRsvpError(err) {
  const code = err && err.code ? err.code : ''
  switch (code) {
    case 'permission-denied':
      return 'We could not record your RSVP. Please speak to an usher and we will add you to the list.'
    case 'unauthenticated':
      return 'Your session has expired. Please sign in again and resubmit.'
    case 'unavailable':
      return 'Connection problem. Please check your internet and try once more.'
    case 'resource-exhausted':
      return 'Too many requests right now. Please wait a moment and try again.'
    case 'invalid-argument':
      return 'Some details were not accepted. Please review the form and try again.'
    default:
      return err && err.message ? err.message : 'Something went wrong. Please try again.'
  }
}

async function submitRsvp() {
  error.value = ''

  if (!canSubmit.value) {
    error.value = 'Please complete all the required fields.'
    return
  }

  submitting.value = true

  try {
    const rsvp = {
      eventId: props.event && props.event.id ? props.event.id : '',
      eventTitle: eventTitle.value,
      name: form.value.fullName.trim(),
      phone: form.value.phone.trim(),
      attendees: Number(form.value.attendees),
      timestamp: serverTimestamp()
    }

    await addDoc(collection(db, 'rsvps'), rsvp)

    submittedName.value = rsvp.name
    emit('rsvp-created', { eventId: rsvp.eventId, attendees: rsvp.attendees })
    form.value = emptyForm()
    submitted.value = true
    successTimer = setTimeout(close, 6000)
  } catch (err) {
    console.error('RSVP submission failed', err)
    error.value = friendlyRsvpError(err)
  } finally {
    submitting.value = false
  }
}

// Reset the form each time the modal is opened for an event
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      submitted.value = false
      submitting.value = false
      error.value = ''
      submittedName.value = ''
      form.value = emptyForm()
    }
  }
)

onUnmounted(clearSuccessTimer)
</script>

<style scoped>
.rsvp-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.rsvp-modal {
  width: 100%;
  max-width: 480px;
  max-height: 86vh;
  overflow-y: auto;
  padding: 26px 24px 24px;
  border-radius: 20px;
  position: relative;
}

.rsvp-close {
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

.rsvp-close:hover {
  color: var(--text-primary);
}

.rsvp-header {
  margin-bottom: 18px;
  padding-right: 28px;
}

.rsvp-eyebrow {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--primary);
  margin-bottom: 8px;
}

.rsvp-title {
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.35;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.rsvp-subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.rsvp-form {
  display: flex;
  flex-direction: column;
}

.field-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 12px 0 6px;
}

.field-label:first-child {
  margin-top: 0;
}

.rsvp-form .glass-input {
  width: 100%;
  font-family: inherit;
  font-size: 0.95rem;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text-tertiary);
}

.rsvp-error {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  font-size: 0.85rem;
}

.rsvp-submit-btn {
  width: 100%;
  margin-top: 18px;
  padding: 12px;
  border: none;
  border-radius: 12px;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-inverse);
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
  cursor: pointer;
  transition: all 0.2s ease;
}

.rsvp-submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
}

.rsvp-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Success state */
.rsvp-success {
  text-align: center;
  padding: 12px 0 4px;
}

.success-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-inverse);
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.35);
}

.success-message {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.65;
  color: var(--text-secondary);
}
</style>