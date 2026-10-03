<template>
  <div class="events-page">
    <div class="container">
      <header class="events-header">
        <span class="events-eyebrow">Lord's Recovery Church · Pakistan</span>
        <h1 class="events-title">Gatherings &amp; Events</h1>
        <p class="events-subtitle">
          Worship, Bible study, youth fellowship and days of prayer. Let us know you
          are coming so the ushers can arrange seating and materials for you.
        </p>
      </header>

      <p v-if="loading" class="events-status">Loading upcoming gatherings...</p>
      <p v-else-if="error" class="events-status events-status-error">{{ error }}</p>
      <p v-else-if="events.length === 0" class="events-status">
        No gatherings have been scheduled yet. Please check back soon.
      </p>

      <div v-else class="events-list">
        <article
          v-for="event in events"
          :key="event.id"
          class="event-card glass-card"
        >
          <div class="event-cover">
            <img
              v-if="!failedCovers[event.id]"
              :src="event.coverImage"
              :alt="event.title"
              class="event-cover-img"
              loading="lazy"
              @error="markCoverFailed(event.id)"
            />
            <div v-else class="event-cover-fallback" aria-hidden="true">📅</div>
          </div>

          <div class="event-body">
            <div class="event-date-badge">
              <span class="date-month">{{ monthOf(event.date) }}</span>
              <span class="date-day">{{ dayOf(event.date) }}</span>
            </div>

            <div class="event-main">
              <h2 class="event-title">{{ event.title }}</h2>

              <ul class="event-meta">
                <li>
                  <span aria-hidden="true">🕒</span>
                  {{ event.time }}
                </li>
                <li>
                  <span aria-hidden="true">📍</span>
                  {{ event.location }}
                </li>
              </ul>

              <p class="event-description">{{ event.description }}</p>

              <div class="event-footer">
                <span v-if="rsvpCountFor(event.id) > 0" class="event-rsvp-badge">
                  ✓ You have registered · {{ rsvpCountFor(event.id) }}
                  {{ rsvpCountFor(event.id) === 1 ? 'attendee' : 'attendees' }}
                </span>

                <button class="event-rsvp-btn" @click="openRsvp(event)">
                  <span aria-hidden="true">✓</span>
                  RSVP
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- RSVP dialog -->
    <RsvpModal v-model="rsvpOpen" :event="selectedEvent" @rsvp-created="onRsvpCreated" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import RsvpModal from '../components/RsvpModal.vue'

const events = ref([])
const loading = ref(true)
const error = ref('')
const rsvpOpen = ref(false)
const selectedEvent = ref(null)
const failedCovers = ref({})
/** eventId -> attendees already registered from this browser session */
const rsvpTotals = ref({})

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
]

function monthOf(date) {
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? '' : MONTHS[parsed.getMonth()]
}

function dayOf(date) {
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? '' : String(parsed.getDate()).padStart(2, '0')
}

function rsvpCountFor(id) {
  return rsvpTotals.value[id] || 0
}

function markCoverFailed(id) {
  failedCovers.value = { ...failedCovers.value, [id]: true }
}

function openRsvp(event) {
  selectedEvent.value = event
  rsvpOpen.value = true
}

/** Track locally registered attendees so the card can confirm the RSVP. */
function onRsvpCreated(payload) {
  if (!payload || !payload.eventId) return
  const current = rsvpTotals.value[payload.eventId] || 0
  rsvpTotals.value = {
    ...rsvpTotals.value,
    [payload.eventId]: current + Number(payload.attendees || 0)
  }
}

async function loadEvents() {
  loading.value = true
  error.value = ''

  try {
    const response = await fetch('/data/events.json')
    if (!response.ok) {
      throw new Error(`Events request failed (${response.status})`)
    }
    const data = await response.json()
    events.value = Array.isArray(data) ? data : []
  } catch (err) {
    console.error(err)
    error.value = 'Sorry, the events could not be loaded.'
  } finally {
    loading.value = false
  }
}

onMounted(loadEvents)
</script>

<style scoped>
.events-page {
  min-height: 100vh;
  padding: 40px 0 80px;
  background: var(--bg-primary);
}

.events-header {
  margin-bottom: 32px;
  max-width: 760px;
}

.events-eyebrow {
  display: inline-block;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--primary);
  margin-bottom: 10px;
}

.events-title {
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.events-subtitle {
  color: var(--text-secondary);
  font-size: 1rem;
  line-height: 1.7;
}

.events-status {
  padding: 40px 0;
  text-align: center;
  color: var(--text-secondary);
}

.events-status-error {
  color: #ef4444;
}

/* Event list */
.events-list {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.event-card {
  display: flex;
  overflow: hidden;
  padding: 0;
}

.event-cover {
  position: relative;
  flex: 0 0 240px;
  min-height: 190px;
  overflow: hidden;
  background: var(--bg-tertiary);
}

.event-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.event-cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 3rem;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
}

.event-body {
  display: flex;
  gap: 18px;
  flex: 1;
  min-width: 0;
  padding: 22px 24px;
}

/* Date chip */
.event-date-badge {
  flex: 0 0 auto;
  width: 62px;
  height: 62px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--primary-bg);
  border: 1px solid rgba(79, 70, 229, 0.22);
}

.date-month {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--primary);
}

.date-day {
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1.1;
  color: var(--primary);
}

.event-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event-title {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.35;
  color: var(--text-primary);
  margin: 0;
}

.event-meta {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.event-meta li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.event-description {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.65;
  color: var(--text-secondary);
  flex: 1;
}

.event-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.event-rsvp-badge {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--primary);
}

.event-rsvp-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
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

.event-rsvp-btn:hover {
  background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
}

/* Mobile: stack the cover above the details */
@media (max-width: 768px) {
  .events-page {
    padding: 28px 0 64px;
  }

  .event-card {
    flex-direction: column;
  }

  .event-cover {
    flex: none;
    width: 100%;
    min-height: 0;
    aspect-ratio: 16 / 9;
  }

  .event-body {
    flex-direction: column;
    gap: 14px;
    padding: 18px 20px 20px;
  }

  .event-date-badge {
    width: 54px;
    height: 54px;
    border-radius: 14px;
  }

  .event-rsvp-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>