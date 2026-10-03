<template>
  <section class="random-section" aria-labelledby="random-heading">
    <div class="container">
      <div class="random-head">
        <h2 id="random-heading" class="random-title">Listen to something random</h2>
        <p class="random-sub">
          A hymn from the collection, in whichever language comes up. Tap it to
          start playing straight away.
        </p>
      </div>

      <p v-if="loading" class="random-status" role="status">Picking a hymn...</p>
      <p v-else-if="!card" class="random-status">
        No hymns are available to play right now.
      </p>

      <template v-else>
        <!-- A <button>, not a div: it performs an action (start playback), so it
             must be reachable by keyboard and announced as a control. -->
        <button
          type="button"
          class="random-card glass-card"
          :aria-label="`Play hymn ${card.no ?? card.id}: ${card.title}`"
          @click="playCurrent"
        >
          <div class="random-icon" aria-hidden="true">
            <span class="random-spin" :class="{ spinning: isPlaying }">💿</span>
          </div>

          <div class="random-body">
            <p class="random-eyebrow">
              <span class="random-lang" :class="scriptClass(card.language)">
                {{ languageName(card.language) }}
              </span>
              <span class="random-no">No. {{ card.no ?? card.id }}</span>
            </p>
            <p class="random-title-line" :class="scriptClass(card.language)">
              {{ card.title }}
            </p>
          </div>

          <span class="random-play" aria-hidden="true">{{ isPlaying ? '⏸' : '▶' }}</span>
        </button>

        <div class="random-actions">
          <button type="button" class="random-btn" @click="shuffle">
            <span aria-hidden="true">🔀</span> Pick another
          </button>
          <router-link
            class="random-btn random-btn-ghost"
            :to="{ path: '/list', query: { id: card.id, category: card.category, language: card.language } }"
          >
            Open the lyrics
          </router-link>
        </div>
      </template>

      <!-- Only one audio element, and it is only given a src by a click. -->
      <audio ref="audioEl" preload="none"></audio>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  fetchCatalog,
  getAudioUrl,
  getLanguage,
  PUBLISHED_LANGUAGES,
  scriptClass
} from '../js/hymnService'

const card = ref(null)
const loading = ref(true)
const isPlaying = ref(false)
const audioEl = ref(null)

function languageName(key) {
  return getLanguage(key)?.label || key
}

/** Flatten one language's catalog into playable picks. */
function flatten(catalog, language) {
  const out = []
  for (const book of catalog?.books ?? []) {
    for (const h of book.hymns ?? []) {
      const id = String(h.id ?? '').trim()
      if (!id) continue
      out.push({
        id,
        no: h.no ?? h.zh_no,
        title: h.title || id,
        category: book.key || 'hymns',
        language
      })
    }
  }
  return out
}

/**
 * Round-robin across languages rather than one uniform random pick.
 *
 * A purely random hymn would show Urdu and English constantly, because they
 * dominate the catalog, and the Chinese edition would almost never appear.
 * Rotating the language guarantees the multilingual range is actually
 * represented, then picks randomly *within* that language.
 */
const rotation = ref(0)
const languageOrder = computed(() => PUBLISHED_LANGUAGES.map((l) => l.key))

async function pick(langKey) {
  try {
    const picks = flatten(await fetchCatalog(langKey), langKey)
    if (!picks.length) return null
    return picks[Math.floor(Math.random() * picks.length)]
  } catch (err) {
    console.warn('random hymn: catalog unavailable:', err.message)
    return null
  }
}

/** Load one hymn per language, so switching between them needs no new fetch. */
const byLanguage = ref({})

async function preload() {
  const entries = await Promise.all(languageOrder.value.map((k) => pick(k)))
  const map = {}
  entries.forEach((entry, i) => {
    if (entry) map[languageOrder.value[i]] = entry
  })
  byLanguage.value = map
  const keys = Object.keys(map)
  card.value = keys.length ? map[keys[0]] : null
  loading.value = false
}

function shuffle() {
  const keys = Object.keys(byLanguage.value)
  if (!keys.length) return
  const next = (rotation.value + 1) % keys.length
  rotation.value = next
  card.value = byLanguage.value[keys[next]]
  // Changing hymn must not leave the previous one still playing.
  stop()
}

function stop() {
  const el = audioEl.value
  if (el) {
    el.pause()
    el.removeAttribute('src')
    el.load()
  }
  isPlaying.value = false
}

/** Play (or restart) the current pick. Always from a click, so autoplay is fine. */
function playCurrent() {
  const c = card.value
  const el = audioEl.value
  if (!c || !el) return
  el.src = getAudioUrl(c.category, c.id, 'mp3')
  el.play()
    .then(() => { isPlaying.value = true })
    .catch((err) => {
      isPlaying.value = false
      console.warn('random hymn: playback blocked', err.message)
    })
}

onMounted(preload)
onUnmounted(stop)
</script>

<style scoped>
.random-section { padding: 56px 0; }

.random-head { text-align: center; margin-bottom: 22px; }

.random-title {
  margin: 0 0 8px;
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text-primary);
}

.random-sub {
  margin: 0 auto;
  max-width: 52ch;
  color: var(--text-secondary);
  line-height: 1.6;
}

.random-status { text-align: center; color: var(--text-secondary); }

.random-card {
  display: flex;
  align-items: center;
  gap: 18px;
  width: 100%;
  max-width: 620px;
  margin: 0 auto;
  padding: 22px;
  border-radius: 20px;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.random-card:hover { transform: translateY(-2px); }

.random-card:focus-visible {
  outline: 2px solid var(--primary-color, #4f7cff);
  outline-offset: 3px;
}

.random-icon { font-size: 40px; line-height: 1; flex-shrink: 0; }

.random-spin.spining { display: inline-block; animation: random-spin 3s linear infinite; }

@keyframes random-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .random-card:hover { transform: none; }
  .random-spin.spining { animation: none; }
}

.random-body { flex: 1; min-width: 0; }

.random-eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 5px;
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}

.random-lang { font-weight: 700; }

.random-title-line {
  margin: 0;
  font-size: 1.18rem;
  font-weight: 700;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.random-play {
  flex-shrink: 0;
  font-size: 1.5rem;
  color: var(--primary-color, #4f7cff);
}

.random-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}

.random-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 42px;
  padding: 9px 18px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary, rgba(127, 127, 127, 0.08));
  color: var(--text-primary);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.random-btn:hover { background: rgba(127, 127, 127, 0.16); }

.random-btn-ghost { background: transparent; }
</style>
