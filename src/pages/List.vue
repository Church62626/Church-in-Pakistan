<template>
  <div class="reader-page">
    <div class="reader-container">
      <!-- Floating reader controls -->
      <div class="reader-toolbar">
        <router-link to="/library" class="toolbar-back">
          <span aria-hidden="true">←</span>
          Back to Library
        </router-link>

        <div class="toolbar-fontsize">
          <button class="toolbar-btn" @click="adjustFontSize(-1)" aria-label="Decrease font size">
            A-
          </button>
          <span class="toolbar-label">{{ fontSizeLabel }}</span>
          <button class="toolbar-btn" @click="adjustFontSize(1)" aria-label="Increase font size">
            A+
          </button>
        </div>
      </div>

      <!-- Hymn finder: numeric keypad + keyword search.
           Lets someone jump straight to a hymn number without going back
           through the Library, which is how a hymnal is normally used. -->
      <section class="hymn-finder glass-card" aria-labelledby="finder-heading">
        <h2 id="finder-heading" class="finder-heading">Find a hymn</h2>

        <div class="finder-fields">
          <label class="finder-field">
            <span>Hymn number</span>
            <input
              v-model="keypadValue"
              class="finder-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="6"
              placeholder="e.g. 12"
              aria-describedby="finder-hint"
            />
          </label>

          <label class="finder-field finder-field-grow">
            <span>Search by title or keyword</span>
            <input
              v-model="searchTerm"
              class="finder-input"
              type="search"
              placeholder="Search hymns..."
            />
          </label>

          <button
            type="button"
            class="finder-go"
            :disabled="!keypadValue.trim()"
            @click="openByNumber"
          >
            Go
          </button>
        </div>

        <!-- Numeric keypad. Big targets: this is used one-handed on a phone. -->
        <div class="keypad" role="group" aria-label="Hymn number keypad">
          <button
            v-for="key in KEYPAD_KEYS"
            :key="key"
            type="button"
            class="keypad-key"
            :class="{ wide: key === 'clear' }"
            :aria-label="key === 'clear' ? 'Clear' : key"
            @click="pressKey(key)"
          >
            {{ key === 'clear' ? 'C' : key }}
          </button>
        </div>

        <p id="finder-hint" class="finder-hint">
          {{ searchResults.length }}
          {{ searchResults.length === 1 ? 'match' : 'matches' }}
          <template v-if="searchTerm.trim()"> for "{{ searchTerm.trim() }}"</template>
        </p>

        <ul v-if="searchResults.length" class="finder-results">
          <li v-for="r in searchResults" :key="`${r.id}-${r.title}`">
            <router-link
              class="finder-result"
              :to="{ path: '/list', query: { id: r.id, category, language } }"
            >
              <span class="finder-result-no">{{ r.no ?? r.id }}</span>
              <span class="finder-result-title" :class="scriptClass(language)">{{ r.title }}</span>
            </router-link>
          </li>
        </ul>
        <p v-else-if="searchTerm.trim()" class="finder-empty">
          No hymns match "{{ searchTerm.trim() }}".
        </p>
      </section>

      <!-- Language switcher. Every language in the service is listed, including
           regional ones whose content is not published yet - those stay
           selectable so the routing and typography are ready for content. -->
      <nav v-if="hasId" class="lang-switch" aria-label="Hymn language">
        <button
          v-for="lang in LANGUAGES"
          :key="lang.key"
          type="button"
          class="lang-btn glass-btn"
          :class="[
            scriptClass(lang.key),
            { 'is-active': language === lang.key, 'is-pending': !lang.published }
          ]"
          :lang="lang.lang"
          :dir="lang.dir"
          :aria-pressed="language === lang.key"
          :title="lang.published
            ? `${lang.label} (${lang.native})`
            : `${lang.label} - content not published yet`"
          @click="selectLanguage(lang.key)"
        >
          <span class="lang-label">{{ lang.label }}</span>
          <span v-if="lang.native !== lang.label" class="lang-native" :lang="lang.lang">
            {{ lang.native }}
          </span>
          <span v-if="!lang.published" class="lang-pending" aria-hidden="true" title="Content not published yet">•</span>
        </button>
      </nav>

      <header class="reader-header">
        <h1
          class="reader-title"
          :class="scriptClass(language)"
          :lang="langAttr(language)"
          :dir="textDir"
        >
          {{ hymn ? hymn.title : 'Hymn Reader' }}
        </h1>
        <div v-if="hasId" class="reader-meta">
          <span class="reader-badge">{{ categoryLabel }}</span>
          <span class="reader-badge" :lang="langAttr(language)" :dir="textDir">
            {{ languageLabel }}
          </span>
          <span v-if="hymn && hymn.number" class="reader-badge">No. {{ hymn.number }}</span>
          <span v-if="hasId && !langMeta?.published" class="reader-badge badge-pending">
            Content coming soon
          </span>
        </div>
      </header>

      <!-- No hymn id in the route: hide the player and the lyrics area entirely -->
      <div v-if="!hasId" class="reader-empty glass-card">
        <span class="empty-icon" aria-hidden="true">📖</span>
        <h2 class="empty-title">Please select a Hymn from the Library</h2>
        <p class="empty-text">
          This page needs a hymn number. Open the Library, pick a book, then choose a hymn
          to read its lyrics and play its audio.
        </p>
        <router-link to="/library" class="empty-cta">
          <span aria-hidden="true">📚</span>
          Browse Hymns / Geet
        </router-link>
      </div>

      <template v-else>
      <p v-if="isSample" class="reader-notice">
        Showing the bundled sample — the GitHub lyric files for this language have not been
        published yet.
      </p>

      <!-- Audio player -->
      <section class="audio-panel" aria-label="Audio player">
        <!-- MP3 only. `v-if` (not v-show) + a null src: an <audio src="">
             resolves to the document URL, so the browser would download the HTML
             page, fail to decode it, and fire a bogus error that clobbers the
             MIDI status message. -->
        <audio
          v-if="audioMode === 'mp3' && currentAudioUrl"
          ref="audioEl"
          :src="currentAudioUrl"
          preload="metadata"
          @loadedmetadata="onLoadedMetadata"
          @timeupdate="onTimeUpdate"
          @play="isPlaying = true"
          @pause="isPlaying = false"
          @ended="onEnded"
          @error="onAudioError"
        />

        <div class="audio-row">
          <button
            class="audio-play-btn"
            :class="{ 'is-busy': isBusy, 'is-blocked': !canPlay }"
            type="button"
            :aria-disabled="!canPlay"
            :aria-busy="isBusy"
            :aria-label="playButtonLabel"
            @click="togglePlay"
          >
            <span v-if="isBusy" class="spin" aria-hidden="true" />
            <span v-else-if="!isPlaying" class="play-icon">▶</span>
            <span v-else class="pause-icon">⏸</span>
          </button>

          <div class="audio-info">
            <span class="audio-title">
              {{ audioMode === 'midi' ? instrumentName : 'Vocals' }}
            </span>
            <span class="audio-time">{{ formattedCurrentTime }} / {{ formattedDuration }}</span>
          </div>

          <div class="audio-seek-container">
            <input
              type="range"
              class="audio-seek-slider"
              min="0"
              :max="duration || 0"
              step="0.1"
              :value="currentTime"
              :style="seekStyle"
              :class="{ 'is-blocked': !canPlay }"
              :aria-disabled="!canPlay"
              aria-label="Seek"
              @input="onSeek"
            />
          </div>
        </div>

        <!-- Instrument picker: MIDI only -->
        <div v-if="audioMode === 'midi'" class="instrument-row">
          <label class="instrument-label" for="midi-instrument">Instrument</label>
          <select
            id="midi-instrument"
            v-model="instrument"
            class="instrument-select glass-btn"
            :disabled="midiLoading"
            @change="onInstrumentChange"
          >
            <optgroup v-for="group in instrumentGroups" :key="group.label" :label="group.label">
              <option v-for="item in group.items" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </optgroup>
          </select>
        </div>

        <div class="audio-modes" role="group" aria-label="Audio source">
          <button
            type="button"
            class="mode-btn glass-btn"
            :class="{ 'is-active': audioMode === 'mp3' }"
            :aria-pressed="audioMode === 'mp3'"
            @click="selectAudioMode('mp3')"
          >
            Vocals (MP3)
          </button>
          <button
            type="button"
            class="mode-btn glass-btn"
            :class="{ 'is-active': audioMode === 'midi' }"
            :aria-pressed="audioMode === 'midi'"
            @click="selectAudioMode('midi')"
          >
            Music Only (MIDI)
          </button>
        </div>

        <p v-if="audioStatus" class="audio-status">{{ audioStatus }}</p>
      </section>

      <p v-if="loading" class="reader-status">Loading hymn...</p>
      <p v-else-if="error" class="reader-status reader-status-error">{{ error }}</p>

      <main
        v-else-if="hymn"
        class="reader-content"
        :class="scriptClass(language)"
        :lang="langAttr(language)"
        :dir="textDir"
        :style="readerStyle"
      >
        <p v-for="(stanza, index) in hymn.verses" :key="`verse-${index}`" class="stanza">
          {{ stanza }}
        </p>
        <p v-if="hymn.chorus" class="stanza stanza-chorus">
          <span class="chorus-label">Chorus</span>
          {{ hymn.chorus }}
        </p>
      </main>

      <p v-else class="reader-status">No hymn selected - choose one from the Library.</p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LANGUAGES,
  fetchHymn,
  getAudioUrlCandidates,
  getLanguage,
  normaliseCategory,
  scriptClass,
  langAttr,
  isRtl,
  isUnpublished,
  CATEGORY_META,
  fetchCatalog
} from '../js/hymnService'

const route = useRoute()
const router = useRouter()

/** Reads a single scalar value out of the current query string. */
function queryValue(name) {
  const raw = route.query[name]
  return (Array.isArray(raw) ? raw[0] : raw) || ''
}

/* ------------------------------------------------------------------ *
 * Reader state
 * ------------------------------------------------------------------ */

/* The Library passes `language=`, older links used `lang=` - accept both. */
const startLanguage = queryValue('lang') || queryValue('language')
const language = ref(getLanguage(startLanguage) ? startLanguage : 'urdu')
const requestedId = computed(() => queryValue('id'))
const category = computed(() =>
  normaliseCategory(queryValue('category') || queryValue('cat') || 'hymns')
)

const hymn = ref(null)
const loading = ref(true)
const error = ref('')
let loadToken = 0

const fontSize = ref(18)
const fontSizeLabel = computed(() => `${fontSize.value}px`)
const readerStyle = computed(() => ({ fontSize: `${fontSize.value}px` }))

const langMeta = computed(() => getLanguage(language.value))
/**
 * Nastaliq is Urdu-only. Regional Arabic-script languages (Pashto, Sindhi,
 * Balochi) are RTL too, so direction is derived from `dir` rather than from
 * the Nastaliq flag - that is what keeps them right-to-left.
 */
const isUrdu = computed(() => Boolean(langMeta.value && langMeta.value.nastaliq))
const textDir = computed(() => (langMeta.value && langMeta.value.dir) || 'ltr')
const languageLabel = computed(() => (langMeta.value && langMeta.value.label) || language.value)
/** Readable category name for the header badge. */
const categoryLabel = computed(() => CATEGORY_META.find((c) => c.key === category.value)?.label || category.value)
const isSample = computed(() => Boolean(hymn.value && hymn.value.source === 'local'))

/** True only when the route actually carries a hymn id (e.g. /list?id=12). */
const hasId = computed(() => Boolean(requestedId.value.trim()))

function adjustFontSize(delta) {
  const next = fontSize.value + delta * 2
  fontSize.value = Math.min(32, Math.max(12, next))
}

/* ------------------------------------------------------------------ *
 * Hymn finder: numeric keypad + keyword search
 * ------------------------------------------------------------------ */

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'ok']
const keypadValue = ref(requestedId.value.trim())
const searchTerm = ref('')
/** Cap the rendered result list so a one-letter query cannot build
 *  thousands of DOM nodes. */
const MAX_SEARCH_RESULTS = 50

/** Digit-only, capped at 6 so the field cannot grow unbounded. */
function pressKey(key) {
  if (key === 'clear') {
    keypadValue.value = ''
    return
  }
  if (key === 'ok') {
    openByNumber()
    return
  }
  if (keypadValue.value.length >= 6) return
  keypadValue.value += key
}

/** Navigate to the typed hymn number, keeping language and category. */
function openByNumber() {
  const id = keypadValue.value.trim()
  if (!id) return
  router.push({ path: '/list', query: { id, category: category.value, language: language.value } })
}

/** Every hymn in the current language, for searching. */
const searchIndex = ref([])

/**
 * Case- and diacritic-insensitive matching. Chinese has no case, and Arabic
 * script has no case distinction in these titles, so lowercasing plus NFD
 * accent stripping is enough to make "grace" find "Grace" without hiding a
 * title behind an accent.
 */
function fold(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const searchResults = computed(() => {
  const term = fold(searchTerm.value.trim())
  if (!term) return []
  const out = []
  for (const item of searchIndex.value) {
    if (fold(item.title).includes(term)) out.push(item)
    if (out.length >= MAX_SEARCH_RESULTS) break
  }
  return out
})

/** Load the searchable title list for a language. Failures are silent and
 *  leave the keypad working - search is an extra, not a requirement. */
async function loadSearchIndex(lang) {
  try {
    const catalog = await fetchCatalog(lang)
    const seen = new Set()
    const items = []
    for (const book of catalog?.books ?? []) {
      for (const h of book.hymns ?? []) {
        const key = `${h.id}:${h.title}`
        if (seen.has(key)) continue
        seen.add(key)
        items.push({ id: h.id, no: h.no ?? h.zh_no, title: h.title || h.id })
      }
    }
    searchIndex.value = items
  } catch (err) {
    console.warn('hymn search index unavailable:', err.message)
    searchIndex.value = []
  }
}

async function loadHymn() {
  const id = requestedId.value.trim()

  // Guard: the route must carry an id before we ask GitHub for anything.
  // The template renders the "Please select a Hymn from the Library" empty
  // state here - no fetch, no error, and no audio request is ever made.
  if (!id) {
    hymn.value = null
    loading.value = false
    error.value = ''
    audioLoading.value = false
    audioError.value = ''
    return
  }

  const token = ++loadToken
  loading.value = true
  error.value = ''

  try {
    const result = await fetchHymn(category.value, id, language.value)
    if (token !== loadToken) return
    hymn.value = result
  } catch (err) {
    if (token !== loadToken) return
    hymn.value = null
    error.value = err.message
  } finally {
    if (token === loadToken) loading.value = false
  }
}

/* ------------------------------------------------------------------ *
 * Audio player (MP3 vocals / MIDI music-only)
 * ------------------------------------------------------------------ */

import {
  MidiEngine,
  MIDI_INSTRUMENTS,
  DEFAULT_INSTRUMENT,
  instrumentGroups as buildInstrumentGroups,
  instrumentLabel,
  withTimeout
} from '../js/midiEngine'

/** Hard budget for one play click, so the spinner can never outlive it. */
const MIDI_START_TIMEOUT_MS = 15000
/** Hard budget for downloading + parsing the .mid itself. */
const MIDI_FILE_TIMEOUT_MS = 15000

const audioEl = ref(null)
const audioMode = ref('mp3')
const currentAudioUrl = ref('')
const audioCandidates = ref([])
const audioIndex = ref(0)
const audioStatus = ref('')
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)

/* ---- MIDI (Web Audio + SoundFont) ---- */
const instrument = ref(DEFAULT_INSTRUMENT)
const midiLoading = ref(false)
const midiReady = ref(false)
const mp3Loading = ref(false)
const instrumentGroups = buildInstrumentGroups()
const instrumentName = computed(() => instrumentLabel(instrument.value))

/**
 * Busy while a source is being prepared. The button stays clickable throughout
 * (no `disabled` attribute) so a failed fetch can never leave it wedged - it
 * just shows a spinner, and only reports unavailability once loading is done.
 */
const isBusy = computed(() =>
  audioMode.value === 'midi' ? midiLoading.value : mp3Loading.value
)

/** True once the active source is genuinely playable. */
const canPlay = computed(() => {
  if (isBusy.value) return false
  return audioMode.value === 'midi' ? midiReady.value : Boolean(currentAudioUrl.value)
})

const playButtonLabel = computed(() => {
  if (isBusy.value) return 'Loading audio'
  if (!canPlay.value) return `No ${modeLabel.value} audio available for this hymn`
  return isPlaying.value ? 'Pause' : 'Play'
})

/** One engine for the lifetime of the page; samples stay cached across hymns. */
const midi = new MidiEngine()
let rafId = null
let midiLoadToken = 0
let mp3Token = 0
/** Invalidates a late result from an abandoned MIDI play attempt. */
let midiPlayToken = 0

/** Clears both busy flags and both readiness flags. */
function resetAudioState() {
  midiReady.value = false
  midiLoading.value = false
  mp3Loading.value = false
  midiLoadToken += 1
  mp3Token += 1
  midiPlayToken += 1
}

midi.onTime = (time, total, ended) => {
  currentTime.value = time
  duration.value = total
  if (ended) isPlaying.value = false
}

// A note whose sample failed or timed out is reported once, but never blocks
// the transport and never rejects unhandled.
let sampleWarned = false
midi.onSampleError = (err) => {
  if (sampleWarned) return
  sampleWarned = true
  audioStatus.value = `Some instrument samples could not be loaded (${err.message}).`
  // Allow the warning to be shown again on the next play attempt.
  setTimeout(() => { sampleWarned = false }, 4000)
}

function syncMidiClock() {
  if (audioMode.value === 'midi' && midi.playing) {
    midi.reportTime()
    rafId = requestAnimationFrame(syncMidiClock)
  } else {
    rafId = null
  }
}

function startClock() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(syncMidiClock)
}

function stopClock() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

const formattedCurrentTime = computed(() => formatTime(currentTime.value))
const formattedDuration = computed(() => formatTime(duration.value))
const seekStyle = computed(() => {
  const total = duration.value
  const pct = total && isFinite(total) ? Math.min(100, (currentTime.value / total) * 100) : 0
  return { '--progress': `${pct}%` }
})

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const modeLabel = computed(() => (audioMode.value === 'midi' ? 'MIDI' : 'MP3'))

/** Rebuilds the candidate list for the current category/id/mode and points <audio> at the first. */
function applyAudioSource({ autoplay = false } = {}) {
  const id = requestedId.value.trim()

  audioCandidates.value = []
  audioIndex.value = 0
  currentAudioUrl.value = ''
  currentTime.value = 0
  duration.value = 0
  isPlaying.value = false

  // Leaving a mode must stop whatever transport is running.
  midi.stop()
  resetAudioState()
  stopClock()

  // Guard: no id means there is no audio URL to build.
  if (!id) {
    audioStatus.value = ''
    return
  }

  const list = getAudioUrlCandidates(category.value, id, audioMode.value)
  audioCandidates.value = list

  if (audioMode.value === 'midi') {
    loadMidi(list)
    return
  }

  if (!list.length) {
    audioStatus.value = `No ${modeLabel.value} file is registered for this hymn yet.`
    return
  }

  currentAudioUrl.value = list[0]
  audioStatus.value = ''

  // Probe the first candidate so a 404 falls through to the next location
  // instead of waiting for a click to discover the failure.
  verifyMp3(list)
}

/**
 * Walks the MP3 candidate list with a HEAD-free range probe and points the
 * <audio> element at the first location that actually serves audio. This keeps
 * a 404 from surfacing as a play error, and always clears `mp3Loading`.
 */
async function verifyMp3(list) {
  const token = ++mp3Token
  mp3Loading.value = true

  try {
    for (let i = 0; i < list.length; i++) {
      if (token !== mp3Token) return
      const url = list[i]
      try {
        // Bounded so a hung request cannot leave the spinner running.
        const response = await withTimeout(
          fetch(url, { headers: { Range: 'bytes=0-1023' } }),
          MIDI_FILE_TIMEOUT_MS,
          'Loading the audio file'
        )
        if (token !== mp3Token) return
        // 206 for a served range, 200 when the range is ignored - both are fine.
        if (response.ok) {
          audioIndex.value = i
          currentAudioUrl.value = url
          return
        }
      } catch {
        // Timeout/network/CORS error: fall through to the next candidate.
      }
    }

    if (token !== mp3Token) return
    currentAudioUrl.value = ''
    audioStatus.value = `No ${modeLabel.value} file could be loaded for hymn “${requestedId.value.trim()}”.`
  } finally {
    // Always release the spinner, on every path including a timeout.
    if (token === mp3Token) mp3Loading.value = false
  }
}

/** Downloads the .mid as an ArrayBuffer and hands it to the Web Audio engine. */
async function loadMidi(list) {
  const token = ++midiLoadToken

  if (!list.length) {
    midiStatus(`No ${modeLabel.value} file is registered for this hymn yet.`)
    return
  }

  midiLoading.value = true
  midiReady.value = false
  midiStatus('Preparing music…')

  try {
    for (const url of list) {
      if (token !== midiLoadToken) return
      try {
        // Bounded: a hung GitHub request must not spin forever.
        const response = await withTimeout(fetch(url), MIDI_FILE_TIMEOUT_MS, 'Loading the MIDI file')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const buffer = await withTimeout(response.arrayBuffer(), MIDI_FILE_TIMEOUT_MS, 'Downloading the MIDI file')
        if (token !== midiLoadToken) return

        const parsed = await withTimeout(midi.load(buffer), MIDI_FILE_TIMEOUT_MS, 'Reading the MIDI file')
        if (token !== midiLoadToken) return

        if (!parsed.notes.length) throw new Error('this MIDI file has no playable notes')

        midi.instrument = instrument.value
        midiReady.value = true
        currentTime.value = 0
        duration.value = parsed.duration
        midiStatus(
          `${parsed.notes.length} notes · ${instrumentLabel(instrument.value)} · rendered in your browser`
        )
        return
      } catch (err) {
        if (token !== midiLoadToken) return
        // Fall through to the next candidate URL.
        midiStatus(`Could not load that MIDI file (${err.message}).`)
      }
    }

    // Every candidate failed: report it. The finally block still clears the
    // spinner, so the button is immediately retryable.
    midiReady.value = false
    midiStatus(`No ${modeLabel.value} file could be loaded for hymn “${requestedId.value.trim()}”.`)
  } finally {
    if (token === midiLoadToken) midiLoading.value = false
  }
}

function midiStatus(message) {
  audioStatus.value = message
}

function onInstrumentChange() {
  midi.setInstrument(instrument.value)
  if (midiReady.value) {
    midiStatus(`${instrumentLabel(instrument.value)} · rendered in your browser`)
  }
}

function selectAudioMode(mode) {
  if (audioMode.value === mode) return
  const wasPlaying = isPlaying.value
  audioMode.value = mode
  // Never auto-play on a mode switch: an AudioContext created outside a user
  // gesture is blocked, and the previous code tried anyway.
  applyAudioSource({ autoplay: false })
  if (wasPlaying && mode === 'midi') midiStatus('Press play to start the music.')
}

/** Walks the candidate list so a missing file falls through to the next location. */
function onAudioError() {
  isPlaying.value = false

  if (audioMode.value !== 'mp3') return

  // The <audio> element only exists in MP3 mode, but guard anyway so a late
  // error event can never clobber the MIDI status line.
  if (audioIndex.value + 1 < audioCandidates.value.length) {
    audioIndex.value += 1
    currentAudioUrl.value = audioCandidates.value[audioIndex.value]
    return
  }

  // Every candidate has now failed: report it and leave the transport idle
  // rather than spinning forever.
  mp3Loading.value = false
  audioStatus.value = `No ${modeLabel.value} file found for hymn “${requestedId.value.trim()}”.`
}

/**
 * A play click must always produce sound. The AudioContext is created and
 * resumed lazily inside the click handler (browsers block an AudioContext that
 * was built earlier, outside a gesture) and the notes are pre-warmed so the
 * very first note is not gated on a download.
 */
async function togglePlay() {
  if (isBusy.value) return

  if (!canPlay.value) {
    // Nothing playable yet - retry the load rather than silently doing nothing,
    // so a transient network failure is recoverable from the same button.
    const id = requestedId.value.trim()
    if (id) {
      audioStatus.value = 'Retrying…'
      applyAudioSource()
    }
    return
  }

  if (audioMode.value === 'midi') {
    if (midi.playing) {
      midi.pause()
      isPlaying.value = false
      stopClock()
      return
    }

    // Hard guard: `midiLoading` drives the spinner. Any early return, throw, or
    // hung promise below MUST clear it, so the spinner can never outlive this
    // click. `playToken` invalidates a late result from an abandoned attempt.
    const token = ++midiPlayToken
    midiLoading.value = true

    const releaseSpinner = () => {
      if (token === midiPlayToken) midiLoading.value = false
    }

    try {
      // Total budget for this attempt. Exceeding it releases the spinner even
      // if something below never settles.
      const attempt = withTimeout(startMidiPlayback(), MIDI_START_TIMEOUT_MS, 'Starting MIDI playback')

      let report
      try {
        report = await attempt
      } catch (err) {
        if (token !== midiPlayToken) return
        releaseSpinner()
        isPlaying.value = false
        stopClock()
        midiStatus(`Failed to load instrument samples: ${err.message}. Press play to retry.`)
        return
      }

      if (token !== midiPlayToken) return

      if (report && report.timedOut) {
        releaseSpinner()
        isPlaying.value = false
        stopClock()
        midiStatus(`${report.message}. Press play to retry.`)
        return
      }

      // Some samples missing: still play what we have, but say so.
      if (report && report.failed) {
        midiStatus(`${report.message} Playing the notes that did load.`)
      }

      if (audioMode.value !== 'midi') return
      const started = midi.play()
      isPlaying.value = started
      if (started) startClock()
      else midiStatus('This MIDI file has no playable notes.')
    } catch (err) {
      if (token !== midiPlayToken) return
      midiStatus(`Could not start audio: ${err.message}`)
      isPlaying.value = false
      stopClock()
    } finally {
      // Belt and braces: even an unexpected throw clears the spinner.
      releaseSpinner()
    }
    return
  }

  const el = audioEl.value
  if (!el || !currentAudioUrl.value) {
    audioStatus.value = 'The audio player is not ready yet. Please try again.'
    return
  }

  if (el.paused) {
    // A rejected play() (autoplay policy) must not leave the button spinning.
    el.play()
      .then(() => { isPlaying.value = true })
      .catch((err) => {
        isPlaying.value = false
        audioStatus.value = `Playback was blocked by the browser: ${err.message}`
      })
  } else {
    el.pause()
  }
}

/**
 * One bounded attempt at preparing MIDI playback. Resolves with the engine's
 * preload report, or rejects if the AudioContext itself is unusable. Never
 * rejects because of a missing sample - those are counted in the report.
 */
async function startMidiPlayback() {
  // Must happen inside the click handler: browsers block an AudioContext that
  // was created before a user gesture.
  midi.ensureContext()
  return warmUpSamples()
}

/**
 * Downloads the samples the next few seconds need so playback starts clean.
 * The engine bounds this with PRELOAD_TIMEOUT_MS and resolves with a report
 * even when samples fail, so this can never hang.
 */
async function warmUpSamples() {
  const parsed = midi.parsed
  if (!parsed) return null
  const now = midi.offset
  const horizon = now + 3
  const wanted = parsed.notes.filter((n) => n.time >= now && n.time < horizon)
  return midi.preload(wanted)
}

function onTimeUpdate() {
  if (audioEl.value) currentTime.value = audioEl.value.currentTime
}

function onLoadedMetadata() {
  if (audioEl.value) {
    duration.value = isFinite(audioEl.value.duration) ? audioEl.value.duration : 0
    audioStatus.value = ''
  }
}

function onSeek(event) {
  const time = parseFloat(event.target.value)
  if (!Number.isFinite(time)) return

  if (audioMode.value === 'midi') {
    midi.seek(time)
    currentTime.value = time
    if (midi.playing) startClock()
    return
  }

  const el = audioEl.value
  if (!el) return
  el.currentTime = time
  currentTime.value = time
}

function onEnded() {
  isPlaying.value = false
  currentTime.value = 0
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

onMounted(() => {
  loadHymn()
  applyAudioSource()
  loadSearchIndex(language.value)
})

// Re-index when the language changes so search results stay in the language
// actually being read.
watch(language, (key) => {
  searchTerm.value = ''
  loadSearchIndex(key)
})

/**
 * Switching language keeps the hymn id and category, and writes the new
 * language into the URL so the view is shareable and survives a refresh.
 * `router.replace` avoids piling up history entries for every tap.
 */
function selectLanguage(key) {
  if (language.value === key) return
  if (!hasId.value) {
    // No hymn loaded: just switch, there is nothing to preserve.
    language.value = key
    return
  }

  router.replace({
    path: '/list',
    query: { ...route.query, language: key, id: requestedId.value, category: category.value }
  })
}

// Keep the ref in step with the route so a browser back/forward, a shared
// link, or a refresh all resolve the same language the URL advertises.
watch(
  () => route.query.language,
  (value) => {
    const next = getLanguage(value) ? value : 'urdu'
    if (next !== language.value) language.value = next
  }
)

watch(language, () => loadHymn())

watch(category, () => {
  loadHymn()
  applyAudioSource()
})

// The route id drives the reader: only fetch once it is present, and refetch
// whenever it changes (or appears) while already on /reader.
watch(
  () => route.query.id,
  () => {
    loadHymn()
    applyAudioSource()
  }
)

// Leaving the page must release the AudioContext-driven rAF loop.
onBeforeUnmount(() => {
  stopClock()
  midi.dispose()
})
</script>


<style scoped>
.reader-page {
  min-height: 100vh;
  padding: 24px 16px 120px;
}

.reader-container {
  max-width: 800px;
  margin: 0 auto;
}

/* ---- Toolbar ---- */
.reader-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--surface);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  margin-bottom: 16px;
}

.toolbar-back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}

.toolbar-back:hover {
  background: var(--primary-bg);
  border-color: var(--primary);
  color: var(--primary);
}

.toolbar-fontsize {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.toolbar-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.toolbar-btn:hover {
  background: var(--primary-bg);
  border-color: var(--primary);
  color: var(--primary);
}

.toolbar-label {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-secondary);
  min-width: 48px;
  text-align: center;
}

/* ---- Language switcher ---- */
.lang-switch {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.lang-btn {
  flex: 1 1 auto;
  min-width: 92px;
  padding: 11px 14px;
  border-radius: 12px;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  /* Each tab renders its own script (Gurmukhi, Shahmukhi, ...) so the button
     must not be locked to the Latin UI stack. */
  font-family: inherit;
}

/* Native script name under the English label (Gurmukhi, Shahmukhi, ...) */
.lang-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.lang-native {
  font-size: 0.78rem;
  font-weight: 500;
  opacity: 0.78;
  line-height: 1.5;
}

.lang-btn.is-active .lang-native {
  opacity: 0.92;
}

.lang-btn.is-active {
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  border-color: transparent;
  color: var(--text-inverse);
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
}

/* ---- Header ---- */
.reader-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.reader-title {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-primary);
}

.reader-title.script-arabic-nastaliq {
  font-family: var(--font-urdu-heading);
  line-height: 2;
}

.reader-title.script-arabic-naskh,
.reader-title.script-gurmukhi,
.reader-title.script-cjk {
  line-height: 1.75;
}

/* Languages with no published content yet are dimmed so the tab list stays
   honest about what is actually readable. */
.lang-btn.is-pending:not(.is-active) {
  opacity: 0.62;
}

.lang-btn.is-pending .lang-pending {
  color: var(--primary);
  font-size: 1.1em;
  line-height: 0;
}

.badge-pending {
  background: transparent;
  border: 1px dashed var(--border-color);
  color: var(--text-tertiary);
}

.reader-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.reader-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 500;
  text-transform: capitalize;
  background: var(--primary-bg);
  color: var(--primary);
  border: 1px solid rgba(79, 70, 229, 0.2);
}

.reader-notice {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--primary);
  background: var(--primary-bg);
  border: 1px dashed rgba(79, 70, 229, 0.35);
}

/* ---- Audio panel ---- */
.audio-panel {
  background: var(--surface);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  box-shadow: var(--shadow-md);
  padding: 16px;
  margin-bottom: 24px;
}

.audio-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.audio-play-btn {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  color: var(--text-inverse);
  font-size: 1.15rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
  transition: all 0.2s ease;
}

/*
 * Play button states.
 *
 * `is-blocked` (nothing playable) uses a muted cursor but NEVER the browser's
 * "prohibited" symbol, and the element is never given the `disabled` attribute -
 * a disabled button swallows pointer events, which is what produced the red
 * prohibition sign and left the transport wedged after a failed fetch.
 * `is-busy` (preparing a source) uses a progress cursor and stays clickable.
 */
.audio-play-btn.is-blocked {
  opacity: 0.45;
  cursor: default;
  box-shadow: none;
}

.audio-play-btn.is-busy {
  cursor: progress;
  opacity: 0.85;
}

.audio-play-btn.is-busy:hover {
  transform: none;
}

/* Keep :disabled working if it is ever reintroduced, without the red symbol. */
.audio-play-btn:disabled {
  opacity: 0.45;
  cursor: default;
  box-shadow: none;
}

.audio-seek-slider.is-blocked,
.audio-seek-slider:disabled {
  cursor: default;
}

.audio-seek-slider:not(.is-blocked):hover {
  cursor: pointer;
}

.audio-play-btn:not(.is-blocked):not(.is-busy):hover {
  transform: scale(1.05);
}

.play-icon {
  padding-left: 2px;
}

.audio-info {
  display: flex;
  flex-direction: column;
  min-width: 64px;
  flex-shrink: 0;
}

.audio-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.audio-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.audio-seek-container {
  flex: 1;
  min-width: 0;
}

.audio-seek-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(
    to right,
    var(--primary) 0%,
    var(--primary) var(--progress, 0%),
    var(--border-color) var(--progress, 0%),
    var(--border-color) 100%
  );
  outline: none;
  cursor: pointer;
}

.audio-seek-slider.is-blocked,
.audio-seek-slider:disabled {
  cursor: default;
}

.audio-seek-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.audio-seek-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.audio-modes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.mode-btn {
  flex: 1 1 auto;
  min-width: 140px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.mode-btn.is-active {
  background: var(--primary-bg);
  border-color: var(--primary);
  color: var(--primary);
}

/* ---- Instrument picker (MIDI only) ---- */
.instrument-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.instrument-label {
  flex: 0 0 auto;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--text-secondary);
}

.instrument-select {
  flex: 1 1 auto;
  min-width: 0;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 0.88rem;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--surface-hover);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: border-color 0.2s ease;
  appearance: none;
}

.instrument-select:hover:not(:disabled) {
  border-color: var(--primary);
}

.instrument-select:disabled {
  opacity: 0.55;
  cursor: default;
}

.instrument-select option,
.instrument-select optgroup {
  color: #1f2937;
  background: #ffffff;
}

.audio-play-btn.is-busy {
  cursor: progress;
  opacity: 0.85;
}

/* Spinner shown while the .mid is downloading / parsing */
.spin {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: midi-spin 0.7s linear infinite;
}

@keyframes midi-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation-duration: 2s;
  }
}

.audio-status {
  margin: 12px 0 0;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

/* ---- Content ---- */
.reader-status {
  padding: 32px 0;
  text-align: center;
  color: var(--text-secondary);
}

.reader-status-error {
  color: #ef4444;
  word-break: break-word;
}

.reader-content {
  background: var(--surface);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 32px;
  box-shadow: var(--shadow-md);
  line-height: 1.9;
  color: var(--text-primary);
  transition: font-size 0.2s ease;
}

.reader-content .stanza {
  margin: 0 0 1.6em;
  white-space: pre-line;
  text-align: justify;
}

.reader-content .stanza:last-child {
  margin-bottom: 0;
}

.stanza-chorus {
  padding-left: 14px;
  border-left: 3px solid var(--primary);
}

.chorus-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--primary);
  margin-bottom: 4px;
}

/* Script-specific reader typography.
   Direction is driven off the `dir` attribute that the service emits, so every
   RTL script (Urdu Nastaliq, Pashto, Sindhi, Balochi) is handled without
   needing a per-language CSS rule here. */
.reader-content[dir='rtl'] .stanza {
  text-align: right;
}

.reader-content[dir='rtl'] .stanza-chorus {
  padding-left: 0;
  padding-right: 14px;
  border-left: none;
  border-right: 3px solid var(--primary);
}

.reader-content.script-arabic-nastaliq .stanza,
.reader-content.script-gurmukhi .stanza,
.reader-content.script-cjk .stanza {
  text-align: start;
}

/* ---- Mobile ---- */
@media (max-width: 768px) {
  .reader-page {
    padding: 16px 12px 120px;
  }

  .reader-title {
    font-size: 1.6rem;
  }

  .reader-content {
    padding: 24px;
  }

  .lang-btn {
    min-width: calc(50% - 4px);
  }

  .audio-row {
    flex-wrap: wrap;
  }

  .audio-seek-container {
    flex-basis: 100%;
  }
}

/* ---- Empty state: no hymn id in the route ---- */
.reader-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 56px 32px;
  margin-top: 8px;
}

.empty-icon {
  font-size: 3rem;
  line-height: 1;
}

.empty-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
}

.empty-text {
  margin: 0;
  max-width: 46ch;
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

.empty-cta {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 26px;
  border-radius: 12px;
  font-size: 0.92rem;
  font-weight: 600;
  text-decoration: none;
  color: var(--text-inverse);
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
  transition: all 0.2s ease;
}

.empty-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
}

</style>


