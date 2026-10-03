<template>
  <div class="listen-page">
    <div class="listen-container">
      <header class="listen-header">
        <h1 class="listen-title">Listen</h1>
        <p class="listen-sub">Play the hymnal with a simple audio player.</p>
      </header>

      <!-- Player: standard HTML5 <audio>. Deliberately no Web Audio API and no
           PCM decoding - the browser's own decoder handles MP3 far more
           efficiently, and `playbackRate` gives speed control for free. -->
      <section class="player glass-card" aria-label="Audio player">
        <div class="player-track">
          <p class="player-title" :class="scriptClass(language)">
            {{ current ? current.title : 'No hymn selected' }}
          </p>
          <p v-if="current" class="player-meta">
            {{ languageLabel }}
            <template v-if="current.subcat"> &middot; {{ current.subcat }}</template>
          </p>
        </div>

        <audio
          ref="audioEl"
          :src="audioSrc"
          preload="metadata"
          @loadedmetadata="onLoaded"
          @timeupdate="onTime"
          @ended="onEnded"
          @error="onError"
        ></audio>

        <p v-if="status" class="player-status" :class="{ error: isError }" role="status">
          {{ status }}
        </p>

        <div class="player-controls">
          <button
            type="button"
            class="pbtn"
            :aria-label="isPlaying ? 'Pause' : 'Play'"
            :disabled="!audioSrc || isLoading"
            @click="togglePlay"
          >{{ isPlaying ? '⏸' : '▶' }}</button>

          <button
            type="button"
            class="pbtn"
            aria-label="Previous hymn"
            :disabled="!canStep(-1)"
            @click="step(-1)"
          >⏮</button>

          <button
            type="button"
            class="pbtn"
            aria-label="Next hymn"
            :disabled="!canStep(1)"
            @click="step(1)"
          >⏭</button>

          <span class="player-time">{{ timeLabel }}</span>
        </div>

        <input
          class="player-seek"
          type="range"
          min="0"
          max="1000"
          step="1"
          :value="seekValue"
          :disabled="!audioSrc"
          aria-label="Seek"
          @input="onSeek"
        />

        <!-- Playback speed -->
        <div class="speed">
          <label class="speed-label" for="speed-range">
            <span>Speed</span>
            <strong>{{ speedLabel }}</strong>
          </label>
          <input
            id="speed-range"
            v-model.number="speed"
            class="speed-range"
            type="range"
            min="0.5"
            max="1.5"
            step="0.05"
            aria-describedby="speed-hint"
          />
          <div class="speed-ticks" aria-hidden="true">
            <span>0.5&times;</span><span>1&times;</span><span>1.5&times;</span>
          </div>
          <p id="speed-hint" class="speed-hint">
            Useful for learning a hymn slowly, or for a faster review.
          </p>
        </div>
      </section>

      <section class="listen-list" aria-labelledby="listen-list-heading">
        <h2 id="listen-list-heading" class="section-heading">Choose a hymn</h2>
        <p v-if="loading" class="library-status">Loading hymns...</p>
        <p v-else-if="!tracks.length" class="library-notice">
          No hymns are available to play in {{ languageLabel }} yet.
        </p>
        <ul v-else class="track-list">
          <li v-for="t in tracks" :key="`${t.id}-${t.title}`">
            <button
              type="button"
              class="track"
              :class="{ active: current && current.id === t.id }"
              @click="play(t)"
            >
              <span class="track-no">{{ t.no ?? t.id }}</span>
              <span class="track-title" :class="scriptClass(language)">{{ t.title }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  fetchCatalog,
  getAudioUrl,
  getLanguage,
  getActiveLanguage,
  onLanguageChange as subscribeLanguage,
  scriptClass
} from '../js/hymnService'

const language = ref(getActiveLanguage())
const langMeta = computed(() => getLanguage(language.value))
const languageLabel = computed(() => (langMeta.value && langMeta.value.label) || language.value)

const tracks = ref([])
const loading = ref(true)
const current = ref(null)

const audioEl = ref(null)
const isPlaying = ref(false)
const isLoading = ref(false)
const isError = ref(false)
const status = ref('')
const duration = ref(0)
const position = ref(0)
const seekValue = ref(0)

/** Playback speed. HTML5 `playbackRate` - no Web Audio, no PCM decoding. */
const speed = ref(1)
const speedLabel = computed(() => {
  const n = Number(speed.value) || 1
  return `${parseFloat(n.toFixed(2))}&times;`
})

const audioSrc = computed(() =>
  current.value ? getAudioUrl('hymns', current.value.id, 'mp3') : ''
)

const timeLabel = computed(() =>
  duration.value
    ? `${formatTime(position.value)} / ${formatTime(duration.value)}`
    : '0:00'
)

function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Flatten the catalog into a playable list. */
function flatten(catalog) {
  const out = []
  const seen = new Set()
  for (const book of catalog?.books ?? []) {
    for (const h of book.hymns ?? []) {
      const key = `${h.id}:${h.title}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ id: h.id, no: h.no ?? h.zh_no, title: h.title || h.id, subcat: h.subcat || '' })
    }
  }
  return out
}

async function load(lang) {
  loading.value = true
  try {
    tracks.value = flatten(await fetchCatalog(lang))
  } catch (err) {
    console.warn('listen: catalog unavailable:', err.message)
    tracks.value = []
  } finally {
    loading.value = false
  }
}

/** A track is only ever started from a click, because browsers block
 *  autoplay until the user has interacted with the page. */
function play(track) {
  if (!track) return
  stop()
  current.value = track
  isError.value = false
  status.value = ''
  isLoading.value = true
  nextTick(() => {
    const el = audioEl.value
    if (!el) return
    applySpeed(el)
    el.play().catch((err) => {
      isLoading.value = false
      isError.value = true
      status.value = `Could not play hymn ${track.id}. The recording may not be available.`
      console.warn('listen: play failed', err.message)
    })
  })
}

function stop() {
  const el = audioEl.value
  if (el) {
    el.pause()
    el.removeAttribute('src')
    el.load()
  }
  isPlaying.value = false
  isLoading.value = false
  duration.value = 0
  position.value = 0
  seekValue.value = 0
}

function applySpeed(el) {
  if (!el) return
  // Some browsers clamp or ignore out-of-range rates.
  el.playbackRate = Math.min(1.5, Math.max(0.5, Number(speed.value) || 1))
}

function togglePlay() {
  const el = audioEl.value
  if (!el || !audioSrc.value) return
  if (el.paused) {
    applySpeed(el)
    el.play().catch(() => {
      isError.value = true
      status.value = 'Playback was blocked by the browser. Tap play again.'
    })
  } else {
    el.pause()
  }
}

function onLoaded() {
  const el = audioEl.value
  isLoading.value = false
  duration.value = el && Number.isFinite(el.duration) ? el.duration : 0
  applySpeed(el)
}

function onTime() {
  const el = audioEl.value
  if (!el) return
  position.value = el.currentTime
  seekValue.value = duration.value ? (el.currentTime / duration.value) * 1000 : 0
}

function onEnded() {
  isPlaying.value = false
  // Roll on to the next track, which is how a hymnal is normally sung through.
  if (!step(1)) status.value = 'End of the hymnal.'
}

function onError() {
  isLoading.value = false
  isPlaying.value = false
  isError.value = true
  status.value = current.value
    ? `No recording found for hymn ${current.value.id}.`
    : 'The recording could not be loaded.'
}

function onSeek(event) {
  const el = audioEl.value
  if (!el || !duration.value) return
  const ratio = Number(event.target.value) / 1000
  el.currentTime = ratio * duration.value
  position.value = el.currentTime
}

/** Move through the list. Returns false at the ends. */
function step(delta) {
  if (!tracks.value.length || !current.value) return false
  const i = tracks.value.findIndex((t) => t.id === current.value.id)
  const next = tracks.value[i + delta]
  if (!next) return false
  play(next)
  return true
}

function canStep(delta) {
  if (!tracks.value.length || !current.value) return false
  const i = tracks.value.findIndex((t) => t.id === current.value.id)
  return i >= 0 && i + delta >= 0 && i + delta < tracks.value.length
}

// Keep the speed on the live element even if the user drags mid-playback.
watch(speed, () => applySpeed(audioEl.value))
watch(language, (key) => {
  current.value = null
  stop()
  load(key)
})

let unsubscribe = null
onMounted(() => {
  load(language.value)
  unsubscribe = subscribeLanguage((key) => {
    if (key !== language.value) language.value = key
  })
  const el = audioEl.value
  if (el) {
    el.addEventListener('play', () => { isPlaying.value = true })
    el.addEventListener('pause', () => { isPlaying.value = false })
    el.addEventListener('waiting', () => { isLoading.value = true })
    el.addEventListener('canplay', () => { isLoading.value = false })
  }
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
  stop()
})
</script>

<style scoped>
.listen-page { padding: 28px 16px 90px; }

.listen-container {
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.listen-header { text-align: center; }

.listen-title {
  font-size: 2rem;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 4px;
}

.listen-sub {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.player {
  padding: 22px;
  border-radius: 18px;
}

.player-track { text-align: center; margin-bottom: 14px; }

.player-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.player-meta {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.player-status {
  text-align: center;
  font-size: 0.88rem;
  color: var(--text-secondary);
  margin: 0 0 10px;
}

.player-status.error { color: #c0392b; }

.player-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 12px;
}

.pbtn {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid rgba(127, 127, 127, 0.3);
  background: rgba(127, 127, 127, 0.12);
  color: var(--text-primary);
  font-size: 1.1rem;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.pbtn:hover:not(:disabled) { background: rgba(127, 127, 127, 0.24); }
.pbtn:active:not(:disabled) { transform: scale(0.94); }
.pbtn:disabled { opacity: 0.4; cursor: default; }

.pbtn:focus-visible,
.track:focus-visible,
.player-seek:focus-visible,
.speed-range:focus-visible {
  outline: 2px solid var(--primary-color, #4f7cff);
  outline-offset: 2px;
}

.player-time {
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  color: var(--text-secondary);
  min-width: 10ch;
  text-align: center;
}

.player-seek,
.speed-range {
  width: 100%;
  accent-color: var(--primary-color, #4f7cff);
  cursor: pointer;
}

.speed {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(127, 127, 127, 0.2);
}

.speed-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.speed-ticks {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-secondary);
  opacity: 0.8;
}

.speed-hint {
  margin: 8px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-style: italic;
}

.track-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 420px;
  overflow-y: auto;
}

.track {
  display: flex;
  align-items: baseline;
  gap: 14px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.track:hover { background: rgba(127, 127, 127, 0.14); }
.track.active { background: rgba(79, 124, 255, 0.16); font-weight: 600; }

.track-no {
  min-width: 3.5ch;
  text-align: right;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

@media (max-width: 480px) {
  .listen-page { padding: 20px 12px 80px; }
  .player { padding: 18px 14px; }
}
</style>