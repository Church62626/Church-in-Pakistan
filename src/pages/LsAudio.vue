<template>
  <div class="page">
    <div class="wrap">
      <header class="head">
        <h1 class="title">{{ book?.title || 'LS Audio' }}</h1>
        <p class="sub">Life-Study messages to watch and read.</p>
      </header>

      <p v-if="loading" class="status" role="status">Loading messages...</p>

      <section v-else-if="!episodes.length" class="notice glass-card">
        <div class="notice-icon" aria-hidden="true">🎙️</div>
        <h2 class="notice-title">No broadcasts published yet</h2>
        <p class="notice-text">
          There are no Life-Study messages available right now. Each message will
          appear here with its video and notes as soon as it is published.
        </p>
      </section>

      <template v-else>
        <!-- Today's message, featured. `latest` is the highest messageNumber,
             which is the only ordering the data carries. -->
        <section v-if="latest" class="featured glass-card">
          <p class="featured-eyebrow">Latest message</p>
          <p class="featured-title">
            <span v-if="latest.number" class="ep-no">Message {{ latest.number }}</span>
            {{ latest.title }}
          </p>
          <p v-if="latest.duration || latest.page" class="featured-meta">
            <span v-if="latest.duration">{{ latest.duration }}</span>
            <span v-if="latest.page">Page {{ latest.page }}</span>
          </p>
          <div class="featured-actions">
            <button v-if="latest.imageUrl" type="button" class="btn" @click="reading = latest">
              Read
            </button>
            <button
              v-if="latest.embedUrl"
              type="button"
              class="btn btn-primary"
              @click="toggleVideo(latest)"
            >{{ playingId === latest.id ? 'Hide' : 'Watch' }}</button>
          </div>
          <div v-if="playingId === latest.id && latest.embedUrl" class="ep-player">
            <iframe
              :key="latest.id"
              :src="latest.embedUrl"
              :title="latest.title"
              class="ep-frame"
              loading="lazy"
              referrerpolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
            ></iframe>
          </div>
        </section>

        <!-- Everything before it, kept as an archive rather than a flat list. -->
        <section v-if="history.length" class="history">
          <h2 class="history-title">History ({{ history.length }})</h2>
          <ul class="list">
            <li v-for="ep in history" :key="ep.id" class="ep">
              <div class="ep-head">
                <div class="ep-body">
                  <p class="ep-title">
                    <span v-if="ep.number" class="ep-no">Message {{ ep.number }}</span>
                    {{ ep.title }}
                  </p>
                  <p v-if="ep.duration || ep.page" class="ep-meta">
                    <span v-if="ep.duration">{{ ep.duration }}</span>
                    <span v-if="ep.page">Page {{ ep.page }}</span>
                  </p>
                </div>
                <div class="ep-actions">
                  <button v-if="ep.imageUrl" type="button" class="btn" @click="reading = ep">
                    Read
                  </button>
                  <button
                    v-if="ep.embedUrl"
                    type="button"
                    class="btn btn-primary"
                    :aria-pressed="playingId === ep.id"
                    @click="toggleVideo(ep)"
                  >{{ playingId === ep.id ? 'Hide' : 'Watch' }}</button>
                </div>
              </div>
              <div v-if="playingId === ep.id && ep.embedUrl" class="ep-player">
                <iframe
                  :key="ep.id"
                  :src="ep.embedUrl"
                  :title="ep.title"
                  class="ep-frame"
                  loading="lazy"
                  referrerpolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowfullscreen
                ></iframe>
              </div>
            </li>
          </ul>
        </section>
      </template>

      <!-- Companion image viewer, opened by the "Read" button. -->
      <section
        v-if="reading"
        class="reader"
        role="dialog"
        aria-modal="true"
        aria-label="Message notes"
      >
        <div class="reader-head">
          <h2 class="reader-title">{{ reading.title }}</h2>
          <button type="button" class="btn" @click="reading = null">Close</button>
        </div>
        <img :src="reading.imageUrl" :alt="`Notes for ${reading.title}`" class="reader-img" />
      </section>
    </div>
  </div>
</template>
@@S@@
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { fetchLsAudio, splitLatestAndHistory } from '../js/appsService.js'

const episodes = ref([])
const book = ref(null)
const loading = ref(true)
/** The newest message, featured at the top. */
const latest = ref(null)
/** Every earlier message, newest first, kept as an archive. */
const history = ref([])
/** Id of the message whose video is mounted, or '' for none. */
const playingId = ref('')
/** The message whose image is open, or null. */
const reading = ref(null)

function toggleVideo(ep) {
  playingId.value = playingId.value === ep.id ? '' : ep.id
}

/** Escape closes the image viewer. */
function onKeydown(e) {
  if (e.key === 'Escape' && reading.value) reading.value = null
}

async function load() {
  loading.value = true
  try {
    const result = await fetchLsAudio()
    episodes.value = result.episodes
    book.value = result.book
    // The newest message is featured; everything before it becomes history, so
    // adding a daily entry never grows the active list.
    const split = splitLatestAndHistory(result.episodes)
    latest.value = split.latest
    history.value = split.history
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.page { padding: 40px 0 64px; }
.wrap { max-width: 860px; margin: 0 auto; padding: 0 24px; }
.head { margin-bottom: 26px; }
.title { margin: 0 0 8px; font-size: 2rem; font-weight: 800; color: var(--text-primary); }
.sub { margin: 0; color: var(--text-secondary); }
.status { color: var(--text-secondary); }

.notice { padding: 30px 24px; text-align: center; border-radius: 20px; }
.notice-icon { font-size: 40px; margin-bottom: 10px; }
.notice-title { margin: 0 0 8px; font-size: 1.15rem; font-weight: 700; color: var(--text-primary); }
.notice-text { margin: 0 auto; max-width: 46ch; color: var(--text-secondary); line-height: 1.6; }

/* ---- featured (latest) message -------------------------------------- */
.featured {
  padding: 24px;
  border-radius: 20px;
  margin-bottom: 28px;
  /* A subtle accent edge so the current message reads as distinct from the
     archive without shouting about it. */
  border-left: 3px solid var(--primary-color, #4f7cff);
}

.featured-eyebrow {
  margin: 0 0 8px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--primary-color, #4f7cff);
}

.featured-title {
  margin: 0 0 6px;
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1.4;
  color: var(--text-primary);
}

.featured-meta {
  margin: 0 0 14px;
  display: flex;
  gap: 12px;
  font-size: 0.86rem;
  color: var(--text-secondary);
}

.featured-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* ---- history archive ------------------------------------------------- */
.history { margin-top: 8px; }

.history-title {
  margin: 0 0 14px;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--text-secondary);
}

.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }

.ep { border: 1px solid var(--border-color); border-radius: 16px; background: var(--surface); }

.ep-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px;
  flex-wrap: wrap;
}

.ep-body { flex: 1; min-width: 0; }

.ep-title { margin: 0 0 4px; font-size: 1.08rem; font-weight: 700; color: var(--text-primary); }

.ep-no {
  display: inline-block;
  margin-right: 8px;
  padding: 2px 9px;
  border-radius: 999px;
  background: rgba(79, 124, 255, 0.16);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ep-meta { margin: 0; display: flex; gap: 12px; font-size: 0.84rem; color: var(--text-secondary); }

.ep-actions { display: flex; gap: 8px; flex-shrink: 0; }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 8px 18px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.btn:hover { background: rgba(127, 127, 127, 0.14); }

.btn-primary { background: var(--primary); color: #fff; border-color: transparent; }

.ep-player { padding: 0 18px 18px; }

/* 16:9 so the player does not letterbox or overflow on a phone. */
.ep-frame {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: none;
  border-radius: 12px;
  background: #000;
}

.reader { margin-top: 26px; }

.reader-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.reader-title { margin: 0; font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }

/* Notes images are long scans; scaled to the column and never upscaled
   beyond their natural size so text stays legible. */
.reader-img { display: block; width: 100%; height: auto; border-radius: 12px; }

@media (max-width: 560px) {
  .ep-head { align-items: flex-start; }
  .ep-actions { width: 100%; }
  .ep-actions .btn { flex: 1; }
}
</style>