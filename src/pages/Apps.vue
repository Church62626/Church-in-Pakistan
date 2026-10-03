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
            <h2 class="app-name">
              {{ app.name }}
              <span v-if="app.version" class="app-version">v{{ app.version }}</span>
            </h2>
            <p class="app-meta">
              <span class="app-platform">{{ app.platform.label }}</span>
              <span v-if="app.fileSize" class="app-size">&middot; {{ app.fileSize }}</span>
            </p>
            <p v-if="app.description" class="app-desc">{{ app.description }}</p>

            <!-- A manifest entry can name a file that was never uploaded. That
                 is a publishing gap, not the visitor's problem, so it is stated
                 plainly and no dead download link is offered. -->
            <p v-if="!app.downloadOk" class="app-pending">
              Not published yet — this build is still being prepared.
            </p>
          </div>

          <div class="app-actions">
            <a
              v-if="app.downloadOk"
              class="app-download"
              :href="app.downloadUrl"
              target="_blank"
              rel="noopener noreferrer"
              :download="app.file"
            >Download</a>
            <span v-else class="app-unavailable">Unavailable</span>
          </div>
        </li>
      </ul>

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
import { ref, onMounted } from 'vue'
import { fetchAppsRich, APPS_BROWSER_URL } from '../js/appsService.js'

const apps = ref([])
const loading = ref(true)
const problem = ref('')
const problemTitle = ref('')
const problemText = ref('')

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

onMounted(load)
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
  display: flex;
  align-items: flex-start;
  gap: 16px;
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
}

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
