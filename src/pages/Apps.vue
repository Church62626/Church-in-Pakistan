<template>
  <div class="apps-page">
    <div class="apps-container">
      <header class="apps-header">
        <h1 class="apps-title">Apps</h1>
        <p class="apps-sub">
          Take the hymnal with you. These builds are published straight from the
          church repository, so this list is always the current one.
        </p>
      </header>

      <p v-if="loading" class="apps-status" role="status">Checking for apps...</p>

      <!-- A failed lookup must never look like "there are no apps". Those are
           different facts, and the visitor is told which one happened. -->
      <section v-else-if="problem" class="apps-notice glass-card">
        <p class="apps-notice-title">{{ problemTitle }}</p>
        <p class="apps-notice-text">{{ problemText }}</p>
        <a class="apps-btn" :href="APPS_BROWSER_URL" target="_blank" rel="noopener noreferrer">
          Open the apps folder on GitHub
        </a>
      </section>

      <section v-else-if="!apps.length" class="apps-notice glass-card">
        <div class="apps-notice-icon" aria-hidden="true">📦</div>
        <p class="apps-notice-title">No apps published yet</p>
        <p class="apps-notice-text">
          The apps folder is currently empty. When a build is added to it, it will
          appear here automatically.
        </p>
        <a class="apps-btn" :href="APPS_BROWSER_URL" target="_blank" rel="noopener noreferrer">
          View the apps folder on GitHub
        </a>
      </section>

      <ul v-else class="apps-grid">
        <!-- Uniform card geometry: a fixed row height plus a clamped description
             means one app with a long blurb cannot make the grid ragged. -->
          <li v-for="app in apps" :key="app.id" class="app-card glass-card">
          <!-- A real icon when the manifest names one that exists, otherwise the
               platform glyph. A broken <img> would look worse than no image. -->
          <img
            v-if="app.icon && app.iconOk"
            :src="app.icon"
            :alt="`${app.name} icon`"
            class="app-icon-img"
            loading="lazy"
          />
          <div v-else class="app-icon" aria-hidden="true">{{ app.platform.icon }}</div>

          <div class="app-body">
            <h2 class="app-name">{{ app.name }}</h2>
            <p class="app-meta">
              <span class="app-size">{{ app.fileSize || app.platform.label }}</span>
            </p>
            <p v-if="app.version" class="app-version-line">Version {{ app.version }}</p>
          </div>

          <div class="app-actions">
            <!-- Download is a <button>, not an <a>: the click is intercepted to
                 check sign-in first, which an anchor cannot do. -->
            <button
              type="button"
              class="app-download app-download-btn"
              :disabled="!app.downloadOk"
              @click="download(app)"
            >Download</button>

            <button type="button" class="app-details" @click="detail = app">Details</button>
          </div>
        </li>
      </ul>

      <!-- Full details for one app, opened from its Details button. -->
      <section
        v-if="detail"
        class="detail"
        role="dialog"
        aria-modal="true"
        :aria-label="`${detail.name} details`"
      >
        <div class="detail-head">
          <h2 class="detail-title">{{ detail.name }}</h2>
          <button type="button" class="btn" @click="detail = null">Close</button>
        </div>

        <img
          v-if="detail.icon && detail.iconOk"
          :src="detail.icon"
          :alt="`${detail.name} icon`"
          class="detail-icon"
        />

        <dl class="detail-specs">
          <div class="detail-row"><dt>Platform</dt><dd>{{ detail.platform.label }}</dd></div>
          <div v-if="detail.version" class="detail-row">
            <dt>Version</dt><dd>{{ detail.version }}</dd>
          </div>
          <div v-if="detail.fileSize" class="detail-row">
            <dt>File size</dt><dd>{{ detail.fileSize }}</dd>
          </div>
          <div class="detail-row">
            <dt>File</dt><dd class="detail-file">{{ detail.file || '—' }}</dd>
          </div>
          <div class="detail-row">
            <dt>Availability</dt>
            <dd>{{ detail.downloadOk ? 'Ready to download' : 'Not published yet' }}</dd>
          </div>
        </dl>

        <h3 class="detail-sub">About this app</h3>
        <p v-if="detail.description" class="detail-desc">{{ detail.description }}</p>
        <p v-else class="detail-desc detail-desc-muted">
          No description has been published for this app yet.
        </p>

        <div class="detail-actions">
          <a
            v-if="detail.downloadOk"
            class="btn btn-primary"
            :href="detail.downloadUrl"
            target="_blank"
            rel="noopener noreferrer"
            :download="detail.file"
          >Download</a>
          <span v-else class="app-unavailable">Not available yet</span>
        </div>
      </section>

      <!-- Sign-in gate for downloads. An overlay (not a bar) because it must be
           unmissable and must not let the page behind be read by accident. -->
      <div
        v-if="signInPrompt"
        class="signin-overlay"
        @click.self="signInPrompt = false"
      >
        <div class="signin-modal" role="dialog" aria-modal="true" aria-labelledby="signin-title">
          <h2 id="signin-title" class="signin-title">Please log in to download applications</h2>
          <p class="signin-text">
            Logging in lets us keep track of which version you have and makes sure you
            always get the latest one.
          </p>
          <div class="signin-actions">
            <router-link to="/" class="btn btn-primary" @click="signInPrompt = false">
              Go to Log in
            </router-link>
            <button type="button" class="btn" @click="signInPrompt = false">Not now</button>
          </div>
        </div>
      </div>

      <footer class="apps-foot">
        <p class="apps-foot-text">
          Apps are hosted on GitHub. You can browse the folder yourself:
          <a :href="APPS_BROWSER_URL" target="_blank" rel="noopener noreferrer">
            Church62626/Church-in-Pakistan &rarr; church-apps
          </a>
        </p>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { fetchAppsRich, APPS_BROWSER_URL } from '../js/appsService.js'
import { authMethods } from '../js/firebase-config.js'

const apps = ref([])
const loading = ref(true)
const problem = ref('')
const problemTitle = ref('')
const problemText = ref('')
/** The app whose details panel is open, or null. */
const detail = ref(null)
/** True while the "log in to download" prompt is showing. */
const signInPrompt = ref(false)

/** Escape closes the details panel. */
function onKeydown(e) {
  if (e.key !== 'Escape') return
  if (detail.value) detail.value = null
  if (signInPrompt.value) signInPrompt.value = false
}

/** Signed-in email, or '' when signed out. Kept in sync with Firebase auth. */
const user = ref(null)
authMethods.onAuthChange((u) => { user.value = u ? { email: u.email } : null })

/**
 * Download, gated on being signed in.
 *
 * The button is a <button> rather than an <a> precisely so the click can be
 * intercepted: an anchor would start the download immediately and there would
 * be no point at which the sign-in check could run. Signed out, the visitor is
 * asked to log in instead of silently getting nothing.
 */
function download(app) {
  if (!app || !app.downloadOk) return
  if (!user.value) {
    signInPrompt.value = true
    return
  }
  // Only reached when signed in and the binary really exists.
  window.open(app.downloadUrl, '_blank', 'noopener')
}

/** Honest copy per failure. None of these blame the visitor. */
const PROBLEM_COPY = {
  unavailable: {
    title: 'Could not reach GitHub',
    text: 'The app list is served from GitHub and the request did not go through. Check your connection and try again.'
  },
  empty: {
    title: 'No apps published yet',
    text: 'The apps folder is currently empty. When a build is added to it, it will appear here automatically.'
  },
  'rate-limited': {
    title: 'Too many requests',
    text: 'GitHub has temporarily limited how often the app list can be fetched. Please try again in a few minutes.'
  },
  'not-found': {
    title: 'Apps folder not found',
    text: 'The apps folder could not be found on the repository. It may have been moved or renamed.'
  },
  unknown: {
    title: 'Could not load the app list',
    text: 'Something unexpected happened while reading the apps folder. You can browse it directly on GitHub instead.'
  }
}

async function load() {
  loading.value = true
  problem.value = ''
  try {
    // The manifest carries version, description and icon; loose APK files are
    // merged in by fetchAppsRich, so a newly dropped build still shows up even
    // before someone writes a manifest entry for it.
    const result = await fetchAppsRich()
    apps.value = result.apps
    if (!result.apps.length) {
      const copy = PROBLEM_COPY.empty || PROBLEM_COPY.unknown
      problem.value = 'empty'
      problemTitle.value = copy.title
      problemText.value = copy.text
    }
  } catch {
    problem.value = 'unavailable'
    problemTitle.value = PROBLEM_COPY.unavailable.title
    problemText.value = PROBLEM_COPY.unavailable.text
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
.apps-page { padding: 40px 0 64px; }

.apps-container {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 24px;
}

.apps-header { margin-bottom: 28px; }

.apps-title {
  margin: 0 0 8px;
  font-size: 2rem;
  font-weight: 800;
  color: var(--text-primary);
}

.apps-sub {
  margin: 0;
  max-width: 60ch;
  color: var(--text-secondary);
  line-height: 1.6;
}

.apps-status { color: var(--text-secondary); }

.apps-notice {
  padding: 28px;
  text-align: center;
  border-radius: 18px;
}

.apps-notice-icon { font-size: 44px; margin-bottom: 10px; }

.apps-notice-title {
  margin: 0 0 8px;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.apps-notice-text {
  margin: 0 auto 18px;
  max-width: 52ch;
  color: var(--text-secondary);
  line-height: 1.6;
}

.apps-btn {
  display: inline-block;
  padding: 11px 20px;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  text-decoration: none;
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.app-card {
  /* Uniform height on every card, so one app with a long description cannot
     make the grid ragged. The description is clamped to fit inside it. */
  display: flex;
  align-items: flex-start;
  gap: 16px;
  min-height: 190px;
  padding: 20px;
  border-radius: 18px;
}

.app-icon-img {
  width: 52px;
  height: 52px;
  object-fit: contain;
  border-radius: 12px;
  flex-shrink: 0;
  background: var(--bg-secondary, rgba(127, 127, 127, 0.08));
}

.app-icon { font-size: 38px; line-height: 1; flex-shrink: 0; }

.app-version {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.18);
  font-size: 0.7rem;
  font-weight: 700;
  vertical-align: middle;
}

.app-desc {
  margin: 8px 0 0;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--text-secondary);
  /* Clamped so a long description cannot stretch the card past the fixed
     height. The full text is always available in the Details panel. */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Details button: same size as Download so the pair reads as one control. */
.app-details {
  padding: 9px 16px;
  border-radius: 9px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
}

.app-details:hover { background: rgba(127, 127, 127, 0.16); }

/* ---- details panel --------------------------------------------------- */
.detail {
  margin-top: 24px;
  padding: 26px;
  border-radius: 20px;
  background: var(--surface-solid);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.detail-title { margin: 0; font-size: 1.3rem; font-weight: 800; color: var(--text-primary); }

.detail-icon {
  width: 64px;
  height: 64px;
  object-fit: contain;
  border-radius: 14px;
  margin-bottom: 16px;
  background: var(--bg-secondary, rgba(127, 127, 127, 0.08));
}

.detail-specs {
  margin: 0 0 20px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--bg-secondary, rgba(127, 127, 127, 0.08));
}

.detail-row {
  display: flex;
  gap: 12px;
  padding: 5px 0;
  font-size: 0.92rem;
}

.detail-row dt {
  flex-shrink: 0;
  width: 108px;
  font-weight: 600;
  color: var(--text-secondary);
}

.detail-row dd { margin: 0; color: var(--text-primary); }

.detail-file { overflow-wrap: anywhere; }

.detail-sub {
  margin: 0 0 8px;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.detail-desc { margin: 0 0 20px; font-size: 0.95rem; line-height: 1.7; color: var(--text-primary); }

.detail-desc-muted { color: var(--text-secondary); font-style: italic; }

/* ---- sign-in gate ---------------------------------------------------- */
/* Opaque rather than translucent: the dialog must fully mask the page behind
   it, otherwise text underneath bleeds through and becomes unreadable. */
.signin-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.55);
}

.signin-modal {
  width: min(100%, 440px);
  padding: 26px;
  border-radius: 18px;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  text-align: center;
}

.signin-title {
  margin: 0 0 10px;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.signin-text {
  margin: 0 0 20px;
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.signin-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* The download button is now a <button>, so it needs the anchor's look. */
.app-download-btn {
  border: none;
  font: inherit;
  cursor: pointer;
}

.app-download-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.app-version-line {
  margin: 4px 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.detail-actions { display: flex; gap: 10px; }

/* A manifest entry whose binary was never uploaded. Informational, not an
   error: the visitor did nothing wrong. */
.app-pending {
  margin: 8px 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
  opacity: 0.9;
}

.app-unavailable {
  padding: 9px 16px;
  border-radius: 9px;
  border: 1px dashed var(--border-color);
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}

.app-body { flex: 1; min-width: 0; }

.app-name {
  margin: 0 0 4px;
  font-size: 1.08rem;
  font-weight: 700;
  color: var(--text-primary);
  /* Long file-derived names must wrap, not stretch the card. */
  overflow-wrap: anywhere;
}

.app-meta {
  margin: 0 0 4px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.app-platform { font-weight: 600; }

.app-file {
  margin: 0;
  font-size: 0.76rem;
  color: var(--text-tertiary, var(--text-secondary));
  overflow-wrap: anywhere;
}

.app-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.app-download {
  padding: 9px 16px;
  border-radius: 9px;
  background: var(--primary);
  color: #fff;
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none;
  text-align: center;
}

.app-page {
  font-size: 0.82rem;
  color: var(--text-secondary);
  text-align: center;
}

.apps-foot {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.apps-foot-text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

@media (max-width: 560px) {
  .app-card { flex-wrap: wrap; }
  .app-actions { flex-direction: row; width: 100%; }
  .app-download { flex: 1; }
}
</style>
