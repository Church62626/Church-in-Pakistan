<template>
  <div class="page">
    <div class="wrap">
      <header class="head">
        <h1 class="title">LS Audio</h1>
        <p class="sub">Life-Study messages to listen to.</p>
      </header>

      <p v-if="loading" class="status" role="status">Loading messages...</p>

      <section v-else-if="problem" class="notice glass-card">
        <div class="notice-icon" aria-hidden="true">🎙️</div>
        <h2 class="notice-title">No broadcasts published yet</h2>
        <p class="notice-text">
          The Life-Study recordings have not been uploaded yet. Each message
          will appear here with its title and notes as soon as it is published.
        </p>
      </section>

      <template v-else>
        <ul class="list">
          <li
            v-for="ep in episodes"
            :key="ep.id"
            class="ep"
            :class="{ 'is-current': current && current.id === ep.id }"
          >
            <!-- A <button> per episode: selecting one plays it, so it is an
                 action, and must be keyboard reachable. -->
            <button
              type="button"
              class="ep-btn"
              :aria-current="current && current.id === ep.id ? 'true' : undefined"
              @click="play(ep)"
            >
              <span class="ep-play" aria-hidden="true">{{ isPlaying(ep) ? '⏸' : '▶' }}</span>
              <span class="ep-body">
                <span class="ep-title">{{ ep.title }}</span>
                <span v-if="ep.speaker || ep.date" class="ep-meta">
                  {{ [ep.speaker, ep.date].filter(Boolean).join(' · ') }}
                </span>
                <span v-if="ep.description" class="ep-desc">{{ ep.description }}</span>
              </span>
            </button>

            <audio
              v-if="current && current.id === ep.id"
              :key="ep.id"
              ref="playerEl"
              :src="ep.audioUrl"
              controls
              preload="metadata"
              @play="playingId = ep.id"
              @pause="playingId = playingId === ep.id ? null : playingId"
              @ended="playingId = null"
              @error="onError(ep)"
            ></audio>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { fetchLsAudio } from '../js/appsService.js'

const episodes = ref([])
const loading = ref(true)
const problem = ref('')
/** The episode whose <audio> element is mounted. Only one at a time. */
const current = ref(null)
const playingId = ref(null)
const playerEl = ref(null)

function isPlaying(ep) {
  return playingId.value === ep.id
}

function play(ep) {
  if (current.value?.id === ep.id) {
    const el = playerEl.value
    if (el) {
      if (el.paused) el.play().catch(() => {})
      else el.pause()
    }
    return
  }
  // Switching episodes must stop the previous one rather than play over it.
  if (playerEl.value) playerEl.value.pause()
  current.value = ep
  playingId.value = null
}

function onError(ep) {
  // A missing recording is a data gap, not something the visitor did.
  playingId.value = null
  console.warn(`ls-audio: could not play ${ep.file}`)
}

async function load() {
  loading.value = true
  problem.value = ''
  try {
    const result = await fetchLsAudio()
    episodes.value = result.episodes
    if (result.problem) problem.value = result.problem
  } finally {
    loading.value = false
  }
}

onUnmounted(() => {
  if (playerEl.value) playerEl.value.pause()
})

load()
</script>

<style scoped>
.page { padding: 40px 0 64px; }
.wrap { max-width: 780px; margin: 0 auto; padding: 0 24px; }
.head { margin-bottom: 26px; }
.title { margin: 0 0 8px; font-size: 2rem; font-weight: 800; color: var(--text-primary); }
.sub { margin: 0; color: var(--text-secondary); }
.status { color: var(--text-secondary); }
.notice { padding: 30px 24px; text-align: center; border-radius: 20px; }
.notice-icon { font-size: 40px; margin-bottom: 10px; }
.notice-title { margin: 0 0 8px; font-size: 1.15rem; font-weight: 700; color: var(--text-primary); }
.notice-text { margin: 0 auto; max-width: 46ch; color: var(--text-secondary); line-height: 1.6; }

.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.ep { border: 1px solid var(--border-color); border-radius: 14px; background: var(--surface); }
.ep.is-current { border-color: var(--primary-color, #4f7cff); }

.ep-btn {
  display: flex; align-items: flex-start; gap: 14px; width: 100%;
  padding: 16px 18px; border: none; border-radius: 14px;
  background: transparent; color: var(--text-primary);
  font: inherit; text-align: left; cursor: pointer;
}
.ep-btn:hover { background: rgba(127, 127, 127, 0.12); }
.ep-btn:focus-visible { outline: 2px solid var(--primary-color, #4f7cff); outline-offset: -2px; }

.ep-play { flex-shrink: 0; font-size: 1.1rem; line-height: 1.5; }
.ep-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ep-title { font-size: 1.05rem; font-weight: 700; }
.ep-meta { font-size: 0.82rem; color: var(--text-secondary); }
.ep-desc { font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6; }

audio { display: block; width: 100%; padding: 0 18px 16px; }
</style>
