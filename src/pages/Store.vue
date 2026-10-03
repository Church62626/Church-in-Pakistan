<template>
  <div class="resource-page">
    <div class="container">
      <header class="resource-header">
        <span class="resource-eyebrow">Lord's Recovery Church · Pakistan</span>
        <h1 class="resource-title">Literature Resource Center</h1>
        <p class="resource-subtitle">
          Request Bibles, Zaboor &amp; Geet books and Sunday School material for your
          fellowship, family or congregation. Items are prepared after the
          contribution has been verified by the church office.
        </p>
      </header>

      <!-- Cart summary -->
      <div class="resource-bar glass-card">
        <div class="bar-summary">
          <span class="bar-count">
            {{ cartStore.count }} {{ cartStore.count === 1 ? 'item' : 'items' }} requested
          </span>
          <span class="bar-total">{{ formatPkr(cartStore.total) }}</span>
        </div>
        <button class="bar-cart-btn" :disabled="cartStore.count === 0" @click="openCart">
          Review Request
        </button>
      </div>

      <p v-if="loading" class="resource-status">Loading available literature...</p>
      <p v-else-if="error" class="resource-status resource-status-error">{{ error }}</p>

      <!-- Literature grid -->
      <div v-else class="resource-grid">
        <article
          v-for="item in items"
          :key="item.id"
          class="resource-card glass-card"
        >
          <div class="card-cover">
            <img
              v-if="!failedCovers[item.id]"
              :src="item.coverImage"
              :alt="item.title"
              class="card-cover-img"
              loading="lazy"
              @error="markCoverFailed(item.id)"
            />
            <div v-else class="card-cover-fallback" aria-hidden="true">📖</div>
          </div>

          <div class="card-body">
            <div class="card-badges">
              <span class="badge badge-type">
                {{ item.type === 'physical' ? 'Physical' : 'Digital' }}
              </span>
            </div>

            <h2 class="card-title">{{ item.title }}</h2>
            <p class="card-price">{{ formatPkr(item.price) }}</p>
            <p class="card-description">{{ item.description }}</p>

            <div class="card-footer">
              <span v-if="qtyOf(item.id) > 0" class="card-qty">
                In request · {{ qtyOf(item.id) }}
              </span>

              <button class="card-add-btn" @click="cartStore.add(item)">
                <span aria-hidden="true">＋</span>
                {{ qtyOf(item.id) > 0 ? 'Add Another' : 'Add to Cart' }}
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- Cart & checkout -->
    <CartModal v-model="cartOpen" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { cartStore, formatPkr } from '../js/cartStore.js'
import CartModal from '../components/CartModal.vue'

const items = ref([])
const loading = ref(true)
const error = ref('')
const cartOpen = ref(false)
const failedCovers = ref({})

function qtyOf(id) {
  const entry = cartStore.items.find((item) => item.id === id)
  return entry ? entry.quantity : 0
}

function markCoverFailed(id) {
  failedCovers.value = { ...failedCovers.value, [id]: true }
}

function openCart() {
  cartOpen.value = true
}

async function loadCatalog() {
  loading.value = true
  error.value = ''

  try {
    const response = await fetch('/data/store-catalog.json')
    if (!response.ok) {
      throw new Error(`Catalog request failed (${response.status})`)
    }
    const data = await response.json()
    items.value = Array.isArray(data) ? data : []
  } catch (err) {
    console.error(err)
    error.value = 'Sorry, the literature catalog could not be loaded.'
  } finally {
    loading.value = false
  }
}

onMounted(loadCatalog)
</script>

<style scoped>
/* PART1 */
.resource-page {
  min-height: 100vh;
  padding: 40px 0 80px;
  background: var(--bg-primary);
}

.resource-header {
  margin-bottom: 24px;
  max-width: 760px;
}

.resource-eyebrow {
  display: inline-block;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--primary);
  margin-bottom: 10px;
}

.resource-title {
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.resource-subtitle {
  color: var(--text-secondary);
  font-size: 1rem;
  line-height: 1.7;
}

/* Cart summary bar */
.resource-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  padding: 14px 18px;
  margin-bottom: 28px;
}

.bar-summary {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
}

.bar-count {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.bar-total {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.bar-cart-btn {
  padding: 10px 22px;
  border-radius: 12px;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-inverse);
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  border: none;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
  cursor: pointer;
  transition: all 0.2s ease;
}

.bar-cart-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
}

.bar-cart-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.resource-status {
  padding: 40px 0;
  text-align: center;
  color: var(--text-secondary);
}

.resource-status-error {
  color: #ef4444;
}

/* Literature grid */
.resource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 24px;
}

@media (max-width: 768px) {
  .resource-page {
    padding: 28px 0 64px;
  }

  .resource-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .resource-bar {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
  }

  .bar-summary {
    justify-content: center;
  }
}

/* PART2 */
.resource-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}

.card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: var(--bg-tertiary);
}

.card-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.card-cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 3rem;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
}

.card-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 8px;
  padding: 18px 20px 20px;
}

.card-badges {
  display: flex;
  gap: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.badge-type {
  background: var(--primary-bg);
  color: var(--primary);
  border: 1px solid rgba(79, 70, 229, 0.2);
}

.card-title {
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.35;
  color: var(--text-primary);
  margin: 0;
}

.card-price {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--primary);
}

.card-description {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--text-secondary);
  flex: 1;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.card-qty {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.card-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: 12px;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-inverse);
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  border: none;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
  cursor: pointer;
  transition: all 0.2s ease;
}

.card-add-btn:hover {
  background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
  transform: translateY(-2px);
}

</style>
