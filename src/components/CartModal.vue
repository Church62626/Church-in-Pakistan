<template>
  <teleport to="body">
    <div v-if="modelValue" class="cart-overlay" @click.self="close">
      <div class="cart-modal glass-modal">
        <button type="button" class="cart-close" @click="close" aria-label="Close">×</button>

        <!-- Success -->
        <div v-if="submitted" class="cart-success">
          <div class="success-icon" aria-hidden="true">✓</div>
          <h2 class="cart-title">Request received</h2>
          <p class="success-message">
            Your request has been submitted and is pending verification.
          </p>
          <p class="success-reference">Reference: {{ lastReference }}</p>
          <button type="button" class="cart-submit-btn" @click="close">Done</button>
        </div>

        <!-- Cart list -->
        <template v-else-if="step === 'cart'">
          <div class="cart-header">
            <h2 class="cart-title">Your Request</h2>
            <p class="cart-subtitle">
              Materials are set aside once your contribution has been verified.
            </p>
          </div>

          <p v-if="cartStore.count === 0" class="cart-empty">
            Your request is empty. Add literature from the Resource Center to begin.
          </p>

          <ul v-else class="cart-list">
            <li v-for="item in cartStore.items" :key="item.id" class="cart-line">
              <div class="line-info">
                <span class="line-title">{{ item.title }}</span>
                <span class="line-meta">
                  {{ formatPkr(item.price) }} each ·
                  {{ item.type === 'physical' ? 'Physical' : 'Digital' }}
                </span>
              </div>

              <div class="line-controls">
                <button
                  type="button"
                  class="qty-btn"
                  :aria-label="'Decrease ' + item.title"
                  @click="cartStore.decrement(item.id)"
                >−</button>
                <span class="qty-value">{{ item.quantity }}</span>
                <button
                  type="button"
                  class="qty-btn"
                  :aria-label="'Increase ' + item.title"
                  @click="cartStore.increment(item.id)"
                >+</button>
              </div>

              <span class="line-total">{{ formatPkr(item.price * item.quantity) }}</span>

              <button
                type="button"
                class="line-remove"
                :aria-label="'Remove ' + item.title"
                @click="cartStore.remove(item.id)"
              >×</button>
            </li>
          </ul>

          <div v-if="cartStore.count > 0" class="cart-summary">
            <span>Total contribution</span>
            <strong>{{ formatPkr(cartStore.total) }}</strong>
          </div>

          <button
            v-if="cartStore.count > 0"
            type="button"
            class="cart-proceed-btn"
            @click="goToCheckout"
          >
            Proceed
          </button>
        </template>

        <!-- Checkout form -->
        <template v-else>
          <div class="cart-header">
            <h2 class="cart-title">Delivery &amp; Payment Details</h2>
            <p class="cart-subtitle">
              Total contribution: <strong>{{ formatPkr(cartStore.total) }}</strong>
            </p>
          </div>

          <form class="checkout-form" @submit.prevent="submitOrder">
            <label class="field-label" for="co-name">Full Name</label>
            <input
              id="co-name"
              v-model="form.fullName"
              type="text"
              class="glass-input"
              placeholder="Your full name"
              required
            />

            <label class="field-label" for="co-phone">Phone Number</label>
            <input
              id="co-phone"
              v-model="form.phone"
              type="tel"
              class="glass-input"
              placeholder="03xx xxxxxxx"
              required
            />

            <template v-if="needsAddress">
              <label class="field-label" for="co-address">Delivery Address</label>
              <textarea
                id="co-address"
                v-model="form.address"
                class="glass-input"
                rows="3"
                placeholder="House, street, city and postal code"
                required
              ></textarea>
            </template>

            <label class="field-label" for="co-payment">Payment / Offering Method</label>
            <select id="co-payment" v-model="form.paymentMethod" class="glass-input" required>
              <option value="" disabled>Select a method</option>
              <option v-for="method in paymentOptions" :key="method" :value="method">
                {{ method }}
              </option>
            </select>

            <label class="field-label" for="co-transaction">Transaction ID</label>
            <input
              id="co-transaction"
              v-model="form.transactionId"
              type="text"
              class="glass-input"
              placeholder="Reference from your payment confirmation"
              required
            />
            <p class="field-hint">
              The church office will match this ID against the EasyPaisa, JazzCash or
              bank statement before releasing your request.
            </p>

            <p v-if="error" class="checkout-error">{{ error }}</p>

            <button type="submit" class="cart-submit-btn" :disabled="submitting || !canSubmit">
              {{ submitting ? 'Submitting...' : 'Submit Request' }}
            </button>

            <button type="button" class="cart-back-btn" :disabled="submitting" @click="step = 'cart'">
              Back to request
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
import { cartStore, formatPkr } from '../js/cartStore.js'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const step = ref('cart') // 'cart' | 'checkout'
const submitted = ref(false)
const submitting = ref(false)
const error = ref('')
const lastReference = ref('')

const paymentOptions = ['EasyPaisa', 'JazzCash', 'Bank Transfer']

const emptyForm = () => ({
  fullName: '',
  phone: '',
  address: '',
  paymentMethod: '',
  transactionId: ''
})

const form = ref(emptyForm())

// A delivery address is only meaningful when a printed item is requested
const needsAddress = computed(() => cartStore.hasPhysicalItems)

const canSubmit = computed(() => {
  const current = form.value
  if (!current.fullName.trim() || !current.phone.trim()) return false
  if (!current.paymentMethod || !current.transactionId.trim()) return false
  if (needsAddress.value && !current.address.trim()) return false
  return true
})

let successTimer = null

function close() {
  if (successTimer) {
    clearTimeout(successTimer)
    successTimer = null
  }
  emit('update:modelValue', false)
}

function goToCheckout() {
  error.value = ''
  step.value = 'checkout'
}

/** Friendly wording for Firestore / network failures. */
function friendlyOrderError(err) {
  const code = err && err.code ? err.code : ''
  switch (code) {
    case 'permission-denied':
      return 'We could not save your request. Please contact the church office directly and we will assist you.'
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

async function submitOrder() {
  error.value = ''

  if (!canSubmit.value) {
    error.value = 'Please complete all the required fields.'
    return
  }

  submitting.value = true

  try {
    const order = {
      fullName: form.value.fullName.trim(),
      phone: form.value.phone.trim(),
      address: needsAddress.value ? form.value.address.trim() : '',
      paymentMethod: form.value.paymentMethod,
      transactionId: form.value.transactionId.trim(),
      items: cartStore.items.map((item) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        type: item.type,
        quantity: item.quantity
      })),
      itemCount: cartStore.count,
      totalAmount: cartStore.total,
      status: 'pending',
      timestamp: serverTimestamp()
    }

    const docRef = await addDoc(collection(db, 'orders'), order)

    lastReference.value = docRef && docRef.id ? docRef.id : '—'
    cartStore.clear()
    form.value = emptyForm()
    submitted.value = true
    step.value = 'cart'
    successTimer = setTimeout(close, 6000)
  } catch (err) {
    console.error('Order submission failed', err)
    error.value = friendlyOrderError(err)
  } finally {
    submitting.value = false
  }
}

// Reset the flow each time the modal is opened
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      step.value = 'cart'
      submitted.value = false
      error.value = ''
      submitting.value = false
    }
  }
)

onUnmounted(() => {
  if (successTimer) clearTimeout(successTimer)
})

</script>

<style scoped>
.cart-overlay {
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

.cart-modal {
  width: 100%;
  max-width: 520px;
  max-height: 86vh;
  overflow-y: auto;
  padding: 26px 24px 24px;
  border-radius: 20px;
  position: relative;
}

.cart-close {
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

.cart-close:hover {
  color: var(--text-primary);
}

.cart-header {
  margin-bottom: 16px;
}

.cart-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
}

.cart-subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.cart-empty {
  padding: 24px 0;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

/* Requested lines */
.cart-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cart-line {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-secondary);
}

.line-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.line-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-meta {
  font-size: 0.78rem;
  color: var(--text-tertiary);
}

.line-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.qty-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--surface);
  color: var(--text-primary);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.qty-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.qty-value {
  min-width: 20px;
  text-align: center;
  font-weight: 700;
  font-size: 0.9rem;
}

.line-total {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-primary);
  min-width: 76px;
  text-align: right;
}

.line-remove {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0 2px;
}

.line-remove:hover {
  color: #ef4444;
}

.cart-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
  font-size: 0.95rem;
  color: var(--text-secondary);
}

.cart-summary strong {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--text-primary);
}

/* Buttons */
.cart-proceed-btn,
.cart-submit-btn {
  width: 100%;
  margin-top: 16px;
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

.cart-proceed-btn:hover,
.cart-submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
}

.cart-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cart-back-btn {
  width: 100%;
  margin-top: 8px;
  padding: 11px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.cart-back-btn:hover:not(:disabled) {
  color: var(--primary);
  border-color: var(--primary);
}

/* Checkout form */
.checkout-form {
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

.checkout-form .glass-input {
  width: 100%;
  resize: vertical;
  font-family: inherit;
  font-size: 0.95rem;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text-tertiary);
}

.checkout-error {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  font-size: 0.85rem;
}

/* Success state */
.cart-success {
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
  margin: 0 0 8px;
  font-size: 1rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.success-reference {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-tertiary);
  word-break: break-all;
}

</style>
