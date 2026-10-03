<template>
  <div class="library-page">
    <div class="container">
      <header class="library-header">
        <h1 class="library-title">Hymns / Geet</h1>
        <p class="library-subtitle">
          Books and hymns from Lord's Recovery Church, Pakistan
        </p>
      </header>

      <!-- Language selector. Mirrors the Reader tabs: every language the service
           knows about, including regional ones awaiting content. -->
      <div class="filter-tabs" role="tablist" aria-label="Choose language">
        <button
          v-for="lang in LANGUAGES"
          :key="lang.key"
          type="button"
          role="tab"
          class="filter-tab lang-tab"
          :class="[
            scriptClass(lang.key),
            { active: language === lang.key, 'is-pending': !lang.published }
          ]"
          :lang="lang.lang"
          :dir="lang.dir"
          :aria-selected="language === lang.key"
          :title="lang.published
            ? `${lang.label} (${lang.native})`
            : `${lang.label} - content not published yet`"
          @click="selectLanguage(lang.key)"
        >
          <span class="lang-tab-label">{{ lang.label }}</span>
          <span v-if="lang.native !== lang.label" class="lang-tab-native" :lang="lang.lang">
            {{ lang.native }}
          </span>
        </button>
      </div>

      <p v-if="loading" class="library-status">Loading books...</p>
      <p v-else-if="error" class="library-status library-status-error">{{ error }}</p>

      <template v-else>
        <!-- Books: the three GitHub JSON categories -->
        <section aria-labelledby="books-heading">
          <h2 id="books-heading" class="section-heading">Books</h2>

          <div class="library-grid">
            <article
              v-for="book in books"
              :key="book.key"
              class="library-card glass-card"
              :class="{ 'is-open': openBook === book.key }"
            >
              <div class="card-cover">
                <div class="card-cover-fallback" aria-hidden="true">{{ book.emoji }}</div>
              </div>

              <div class="card-body">
                <div class="card-badges">
                  <span class="badge badge-type">Book</span>
                  <span class="badge badge-language">{{ languageLabel }}</span>
                  <span class="badge badge-count">{{ book.count }} hymns</span>
                </div>

                <h3 class="card-title">{{ book.label }}</h3>
                <p class="card-summary">{{ book.blurb }}</p>

                <button type="button" class="card-read-btn" @click="toggleBook(book.key)">
                  <span aria-hidden="true">📖</span>
                  {{ openBook === book.key ? 'Close book' : 'Open book' }}
                </button>

                <!-- Animated pointer: appears only while a book is open, so the
                     eye is drawn to the contents that just loaded below. -->
                <span
                  v-if="openBook === book.key"
                  class="open-pointer"
                  aria-hidden="true"
                >▼</span>
              </div>
            </article>
          </div>
        </section>

        <!-- PDF books: Firestore `books` collection, filtered to this tab -->
        <section aria-labelledby="pdf-books-heading">
          <div class="section-heading-row">
            <h2 id="pdf-books-heading" class="section-heading">
              Books &amp; Literature
              <span v-if="pdfBooks.length" class="section-count">{{ pdfBooks.length }}</span>
            </h2>
          </div>

          <p v-if="pdfLoading" class="library-status">Loading {{ languageLabel }} books...</p>

          <!-- Honest empty state: same layout as the loaded list, no broken grid -->
          <p v-else-if="!pdfBooks.length" class="library-notice">
            {{ pdfMessage }}
          </p>

          <ul v-else class="pdf-list">
            <li
              v-for="book in pdfBooks"
              :key="book.id"
              class="pdf-row glass-card"
            >
              <div class="pdf-icon" aria-hidden="true">📕</div>

              <div class="pdf-body">
                <h3
                  class="pdf-title"
                  :class="scriptClass(language)"
                  :lang="langAttr(language)"
                  :dir="textDir"
                >
                  {{ book.title }}
                </h3>
                <p class="pdf-meta">
                  <span class="badge badge-language">{{ languageLabel }}</span>
                  <span class="badge badge-count">{{ book.category }}</span>
                  <span v-if="dateOf(book)" class="pdf-date">{{ dateOf(book) }}</span>
                </p>
              </div>

              <div class="pdf-actions">
                <!-- target=_blank is safe here: the href is always the
                     raw.githubusercontent.com host we built server-side. -->
                <a
                  class="pdf-btn pdf-btn-primary"
                  :href="book.fileUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="`View ${book.title} (PDF)`"
                >
                  <span aria-hidden="true">👁</span> View
                </a>
                <a
                  class="pdf-btn"
                  :href="`${book.fileUrl}?raw=1`"
                  download
                  :aria-label="`Download ${book.title} (PDF)`"
                >
                  <span aria-hidden="true">⬇</span> Download
                </a>
              </div>
            </li>
          </ul>
        </section>

        <!-- Premium books: purchase wall + order/request form -->
        <section aria-labelledby="premium-heading">
          <div class="section-heading-row">
            <h2 id="premium-heading" class="section-heading">
              Premium Books
              <span v-if="premiumBooks.length" class="section-count">{{ premiumBooks.length }}</span>
            </h2>
          </div>

          <p v-if="premiumLoading" class="library-status">Loading premium books...</p>

          <!-- Upstream has not published any premium books yet, so this is the
               normal state rather than an error. -->
          <p v-else-if="!premiumBooks.length" class="library-notice">
            {{ premiumMessage }}
          </p>

          <ul v-else class="pdf-list">
            <li v-for="book in premiumBooks" :key="book.id" class="pdf-row glass-card">
              <div class="pdf-icon" aria-hidden="true">🔒</div>

              <div class="pdf-body">
                <h3
                  class="pdf-title"
                  :class="scriptClass(language)"
                  :lang="langAttr(language)"
                  :dir="textDir"
                >
                  {{ book.title }}
                </h3>
                <p v-if="book.titleEn" class="pdf-meta">{{ book.titleEn }}</p>
                <p v-if="book.description" class="pdf-desc">{{ book.description }}</p>

                <ul v-if="book.highlights.length" class="pdf-highlights">
                  <li v-for="(h, i) in book.highlights" :key="i">{{ h }}</li>
                </ul>

                <p class="pdf-meta">
                  <span class="badge badge-language">{{ languageLabel }}</span>
                  <span v-if="book.price" class="badge badge-count">
                    {{ formatPrice(book.price, book.currency) }}
                  </span>
                </p>
              </div>

              <div class="pdf-actions">
                <button
                  type="button"
                  class="pdf-btn pdf-btn-primary"
                  :disabled="!book.available"
                  @click="openRequest(book)"
                >
                  Request access
                </button>
              </div>
            </li>
          </ul>

          <!-- Order / request form for one premium book -->
          <form
            v-if="requestedBook"
            class="premium-form glass-card"
            @submit.prevent="submitRequest"
          >
            <h3 class="premium-form-title">Request access</h3>
            <p class="premium-form-sub">
              {{ requestedBook.title }}
              <span v-if="requestedBook.price">
                — {{ formatPrice(requestedBook.price, requestedBook.currency) }}
              </span>
            </p>

            <label class="premium-field">
              <span>Your name</span>
              <input v-model="requestForm.name" type="text" required maxlength="80"
                     autocomplete="name" placeholder="Full name" />
            </label>

            <label class="premium-field">
              <span>Email or phone</span>
              <input v-model="requestForm.contact" type="text" required maxlength="120"
                     autocomplete="email" placeholder="How should we reach you?" />
            </label>

            <label class="premium-field">
              <span>Message (optional)</span>
              <textarea v-model="requestForm.note" rows="3" maxlength="500"
                        placeholder="Anything we should know?" />
            </label>

            <p v-if="premiumSubmitError" class="premium-error">{{ premiumSubmitError }}</p>
            <p v-else-if="premiumSubmitOk" class="premium-ok" role="status">
              Thank you. Your reference is <strong>{{ premiumReference }}</strong>.
              We will contact you shortly.
            </p>

            <div class="premium-form-actions">
              <button type="submit" class="pdf-btn pdf-btn-primary" :disabled="premiumSubmitting">
                {{ premiumSubmitting ? 'Sending...' : 'Send request' }}
              </button>
              <button type="button" class="pdf-btn" @click="requestedBook = null">
                Cancel
              </button>
            </div>
          </form>
        </section>

        <!-- Hymn list for the open book -->
        <section v-if="activeBook" class="hymn-section" aria-labelledby="hymn-list-heading">
          <div class="section-heading-row">
            <h2 id="hymn-list-heading" class="section-heading">
              {{ activeBook.label }}
              <span class="section-count">{{ activeBook.count }}</span>
            </h2>
            <button type="button" class="back-btn" @click="openBook = null">
              ← All books
            </button>
          </div>

          <p v-if="activeBook.count === 0" class="library-status">
            {{ emptyMessage(activeBook) }}
          </p>

          <!-- Languages that publish their own cat/subcat fields (Chinese) render a
               grouped tree instead of one flat list. -->
          <template v-else-if="hasCategories">
            <section
              v-for="group in activeBook.categories"
              :key="group.cat"
              class="hymn-group"
            >
              <h3 class="hymn-group-title" :class="scriptClass(language)">
                {{ group.cat }}
                <span class="section-count">{{ group.count }}</span>
              </h3>

              <div
                v-for="sub in group.subcats"
                :key="sub.subcat"
                class="hymn-subgroup"
              >
                <h4 class="hymn-subgroup-title" :class="scriptClass(language)">
                  {{ sub.subcat }}
                  <span class="section-count">{{ sub.count }}</span>
                </h4>

                <ul class="hymn-list">
                  <li v-for="hymn in sub.hymns" :key="hymn.id">
                    <router-link
                      class="hymn-row"
                      :to="{
                        path: '/list',
                        query: { id: hymn.id, category: activeBook.key, language }
                      }"
                    >
                      <span class="hymn-number">{{ hymn.id }}</span>
                      <span
                        class="hymn-title"
                        :class="scriptClass(language)"
                        :lang="langAttr(language)"
                        :dir="textDir"
                      >
                        {{ hymn.title }}
                      </span>
                      <span class="hymn-cta" aria-hidden="true">Read →</span>
                    </router-link>
                  </li>
                </ul>
              </div>
            </section>
          </template>

          <ul v-else class="hymn-list">
            <li v-for="hymn in activeBook.hymns" :key="hymn.id">
              <router-link
                class="hymn-row"
                :to="{
                  path: '/list',
                  query: { id: hymn.id, category: activeBook.key, language }
                }"
              >
                <span class="hymn-number">{{ hymn.id }}</span>
                <span
                  class="hymn-title"
                  :class="scriptClass(language)"
                  :lang="langAttr(language)"
                  :dir="textDir"
                >
                  {{ hymn.title }}
                </span>
                <span class="hymn-cta" aria-hidden="true">Read →</span>
              </router-link>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
// `watch` is required: the PDF book list re-queries whenever the language tab
// changes. Omitting it from this import throws a ReferenceError during setup and
// blanks the entire page.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  LANGUAGES,
  getLanguage,
  fetchCatalog,
  scriptClass,
  getActiveLanguage,
  onLanguageChange as subscribeLanguage
} from '../js/hymnService'
import { fetchBooks, booksEmptyMessage, formatBookDate } from '../js/bookService'
import {
  fetchPremiumBooks,
  premiumEmptyMessage,
  formatPremiumPrice
} from '../js/premiumService'
import { db } from '../js/firebase-config'

// The nav bar's LanguageSelector is the single source of truth. This page
// follows the global store and also honours ?language=/?lang= so a shared
// Library link opens in the right language.
const language = ref(getActiveLanguage())
const catalog = ref(null)
const loading = ref(true)
const error = ref('')
const openBook = ref(null)

const books = computed(() => catalog.value?.books ?? [])
const activeBook = computed(() => books.value.find((b) => b.key === openBook.value) || null)
// Languages that publish their own cat/subcat tree (Chinese) get grouped
// headings; everyone else keeps the original flat list.
const hasCategories = computed(() => (activeBook.value?.categories?.length ?? 0) > 1)
const languageLabel = computed(() => getLanguage(language.value)?.label ?? language.value)
const langMeta = computed(() => getLanguage(language.value))
const textDir = computed(() => langMeta.value?.dir || 'ltr')
const langAttr = (key) => getLanguage(key)?.lang || 'en'

async function loadCatalog(lang) {
  loading.value = true
  error.value = ''

  try {
    catalog.value = await fetchCatalog(lang)
  } catch (err) {
    catalog.value = null
    error.value = `Could not load the hymn catalog: ${err.message}`
  } finally {
    loading.value = false
  }
}

function selectLanguage(key) {
  if (language.value === key) return
  language.value = key
  openBook.value = null
  loadCatalog(key)
}

function toggleBook(key) {
  openBook.value = openBook.value === key ? null : key
}

// --- PDF books (Firestore) ---
const pdfBooks = ref([])
const pdfLoading = ref(true)
const pdfProblem = ref(null)

let unsubscribeLanguage = null

onMounted(() => {
  // A ?language=/?lang= in the URL wins on first load, so a shared Library
  // link opens in the language it was shared in.
  const route = useRoute()
  const fromQuery = route.query.language || route.query.lang
  if (getLanguage(fromQuery) && fromQuery !== language.value) {
    language.value = fromQuery
  } else {
    // Otherwise follow the nav bar's global selector.
    unsubscribeLanguage = subscribeLanguage((key) => {
      if (key !== language.value) language.value = key
    })
  }
})

onUnmounted(() => {
  if (unsubscribeLanguage) unsubscribeLanguage()
})

// Re-query whenever the tab changes. No cross-language fallback: a Punjabi tab
// with no books shows the empty state rather than quietly listing Urdu ones.
watch(language, async () => {
  pdfLoading.value = true
  const res = await fetchBooks(language.value, { db })
  pdfBooks.value = res.books
  pdfProblem.value = res.problem
  pdfLoading.value = false

  await loadPremium(language.value)
}, { immediate: true })

const pdfMessage = computed(() =>
  booksEmptyMessage(language.value, pdfProblem.value || 'missing')
)
const dateOf = (book) => formatBookDate(book.updatedAt || book.createdAt)

// --- Premium books (purchase wall) ---------------------------------
const premiumBooks = ref([])
const premiumLoading = ref(true)
const premiumProblem = ref(null)
const premiumMessage = computed(() =>
  premiumEmptyMessage(language.value, premiumProblem.value)
)
const formatPrice = formatPremiumPrice

async function loadPremium(lang) {
  premiumLoading.value = true
  const res = await fetchPremiumBooks(lang, { db })
  premiumBooks.value = res.books
  premiumProblem.value = res.problem
  premiumLoading.value = false
}

const requestedBook = ref(null)
const requestForm = ref({ name: '', contact: '', note: '' })
const premiumSubmitting = ref(false)
const premiumSubmitError = ref('')
const premiumSubmitOk = ref(false)
const premiumReference = ref('')

function openRequest(book) {
  requestedBook.value = book
  requestForm.value = { name: '', contact: '', note: '' }
  premiumSubmitError.value = ''
  premiumSubmitOk.value = false
  premiumReference.value = ''
}

async function submitRequest() {
  if (!requestedBook.value || premiumSubmitting.value) return
  premiumSubmitting.value = true
  premiumSubmitError.value = ''

  try {
    const { collection, addDoc, serverTimestamp } = await import('firebase/firestore')
    const payload = {
      bookId: requestedBook.value.id,
      bookTitle: requestedBook.value.title,
      language: requestedBook.value.language,
      price: requestedBook.value.price,
      currency: requestedBook.value.currency,
      name: requestForm.value.name.trim(),
      contact: requestForm.value.contact.trim(),
      note: requestForm.value.note.trim(),
      status: 'requested',
      timestamp: serverTimestamp()
    }
    const docRef = await addDoc(collection(db, 'bookRequests'), payload)
    // The returned id is the user's reference - shown so they can quote it.
    premiumReference.value = docRef && docRef.id ? docRef.id.slice(0, 8).toUpperCase() : '—'
    premiumSubmitOk.value = true
  } catch (err) {
    // Surface the reason without leaking a raw Firestore error code.
    premiumSubmitError.value =
      'Your request could not be sent. Please check your connection and try again.'
  } finally {
    premiumSubmitting.value = false
  }
}

const emptyMessage = (book) => {
  if (book.problem === 'corrupt') {
    return 'This book exists, but its lyric file could not be read right now. Please try again later.'
  }
  const lang = getLanguage(language.value)
  if (lang && !lang.published) {
    return `${lang.label} hymn books have not been published yet. The English, Urdu and Roman Urdu selections are ready to read.`
  }
  return 'This book has no hymns published for the selected language yet.'
}

onMounted(() => loadCatalog(language.value))
</script>

<style scoped>
/* PART1 */
.library-page {
  min-height: 100vh;
  padding: 40px 0 80px;
  background: var(--bg-primary);
}

.library-header {
  margin-bottom: 28px;
}

.library-title {
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.library-subtitle {
  color: var(--text-secondary);
  font-size: 1rem;
}

/* Filter tabs */
.filter-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 28px;
}

.filter-tab {
  padding: 10px 20px;
  border-radius: 12px;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--surface);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-tab:hover {
  color: var(--primary);
  border-color: var(--primary);
  transform: translateY(-1px);
}

.filter-tab.active {
  color: var(--text-inverse);
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  border-color: transparent;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
}

/* Status messages */
.library-status {
  padding: 40px 0;
  text-align: center;
  color: var(--text-secondary);
}

.library-status-error {
  color: #ef4444;
}

/* Responsive card grid */
.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 24px;
}

@media (max-width: 768px) {
  .library-page {
    padding: 28px 0 64px;
  }

  .library-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .filter-tab {
    padding: 9px 16px;
    font-size: 0.9rem;
  }
}

/* PART2 */
.library-card {
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
  flex-wrap: wrap;
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

.badge-language {
  background: var(--surface-hover);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.card-title {
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.35;
  color: var(--text-primary);
  margin: 0;
}

/* Nastaliq needs extra leading - override the tighter LTR defaults.
   Script classes (script-*) carry the font, so this only tunes spacing. */
.card-title.script-arabic-nastaliq {
  line-height: 2;
}

.card-title.script-arabic-naskh,
.card-title.script-gurmukhi {
  line-height: 1.85;
}

.card-title-roman {
  margin: -4px 0 0;
  font-size: 0.85rem;
  color: var(--text-tertiary);
}

.card-author {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.card-summary {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--text-secondary);
  flex: 1;
}

.card-read-btn {
  align-self: flex-start;
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  color: var(--text-inverse);
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
  transition: all 0.2s ease;
}

.card-read-btn:hover {
  background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
  transform: translateY(-2px);
}

/* ---- Language tabs (multi-script) ---- */
.lang-tab {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  /* Not locked to the Latin UI stack - each label renders in its own script. */
  font-family: inherit;
  line-height: 1.35;
}

.lang-tab-native {
  font-size: 0.72rem;
  font-weight: 500;
  opacity: 0.8;
  line-height: 1.5;
}

.lang-tab.active .lang-tab-native {
  opacity: 0.95;
}

/* Languages awaiting content are dimmed rather than hidden, so the route and
   typography stay exercised and ready for the real drop-in. */
.lang-tab.is-pending:not(.active) {
  opacity: 0.6;
}

/* ---- PDF book list (Firestore) ---- */
.pdf-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.pdf-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  border-radius: 14px;
  flex-wrap: wrap;
}

.pdf-icon {
  flex: 0 0 auto;
  font-size: 1.6rem;
  line-height: 1;
}

.pdf-body {
  flex: 1 1 240px;
  min-width: 0;
}

.pdf-title {
  margin: 0 0 6px;
  font-size: 1rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.pdf-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0;
}

.pdf-date {
  font-size: 0.76rem;
  color: var(--text-tertiary);
}

.pdf-actions {
  display: flex;
  gap: 8px;
  flex: 0 0 auto;
  margin-inline-start: auto;
}

.pdf-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 0.83rem;
  font-weight: 600;
  text-decoration: none;
  color: var(--text-primary);
  background: var(--surface-hover);
  border: 1px solid var(--border-color);
  transition: all 0.18s ease;
}

.pdf-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.pdf-btn-primary {
  color: var(--text-inverse);
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  border-color: transparent;
}

.pdf-btn-primary:hover {
  color: var(--text-inverse);
  filter: brightness(1.08);
}

@media (max-width: 768px) {
  .pdf-actions {
    width: 100%;
    margin-inline-start: 0;
  }

  .pdf-btn {
    flex: 1 1 auto;
    justify-content: center;
  }
}

/* ---- Books + hymn list ---- */
.section-heading {
  margin: 36px 0 18px;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  background: var(--primary-bg);
  color: var(--primary);
  border: 1px solid rgba(79, 70, 229, 0.2);
}

.badge-count {
  background: var(--surface-hover);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.library-card.is-open {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.25);
}

.library-notice {
  margin: 0 0 16px;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--text-secondary);
  background: var(--surface-hover);
  border: 1px dashed var(--border-color);
}

.back-btn {
  padding: 9px 18px;
  border-radius: 10px;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--surface-hover);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.hymn-section {
  margin-top: 8px;
}

/* --- animated "contents are below" pointer --------------------------- */
.open-pointer {
  display: block;
  margin-top: 10px;
  text-align: center;
  font-size: 1.1rem;
  color: var(--accent-color, var(--text-primary));
  animation: pointer-bounce 1.1s ease-in-out infinite;
}

@keyframes pointer-bounce {
  0%, 100% { transform: translateY(0); opacity: 1; }
  50% { transform: translateY(7px); opacity: 0.55; }
}

/* Respect the OS setting: a decorative bouncing arrow is exactly the kind of
   motion that causes trouble for vestibular disorders. */
@media (prefers-reduced-motion: reduce) {
  .open-pointer { animation: none; }
}

/* --- cat / subcat grouping (Chinese hymnal) ------------------------- */
.hymn-group {
  margin-top: 26px;
}

.hymn-group-title {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, rgba(127, 127, 127, 0.25));
}

.hymn-subgroup {
  margin-top: 16px;
}

.hymn-subgroup-title {
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* --- premium books --------------------------------------------------- */
.pdf-desc {
  color: var(--text-secondary);
  font-size: 0.92rem;
  margin: 6px 0;
}

.pdf-highlights {
  list-style: none;
  margin: 8px 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pdf-highlights li {
  font-size: 0.8rem;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.14);
  color: var(--text-secondary);
}

.premium-form {
  margin-top: 18px;
  padding: 18px;
  border-radius: 14px;
  max-width: 520px;
}

.premium-form-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.premium-form-sub {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 14px;
}

.premium-field {
  display: block;
  margin-bottom: 12px;
}

.premium-field > span {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 5px;
}

.premium-field input,
.premium-field textarea {
  width: 100%;
  padding: 9px 11px;
  border-radius: 9px;
  border: 1px solid rgba(127, 127, 127, 0.35);
  background: var(--bg-secondary, transparent);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.95rem;
}

.premium-field input:focus-visible,
.premium-field textarea:focus-visible {
  outline: 2px solid var(--accent-color, #4f7cff);
  outline-offset: 1px;
}

.premium-form-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.premium-error {
  color: #c0392b;
  font-size: 0.88rem;
}

.premium-ok {
  color: #1e7e46;
  font-size: 0.9rem;
}

.hymn-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.hymn-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 18px;
  border-radius: 12px;
  text-decoration: none;
  color: var(--text-primary);
  background: var(--surface);
  border: 1px solid var(--border-color);
  transition: all 0.18s ease;
}

.hymn-row:hover {
  border-color: var(--primary);
  background: var(--primary-bg);
  transform: translateX(3px);
}

.hymn-number {
  flex: 0 0 auto;
  min-width: 52px;
  padding: 3px 8px;
  border-radius: 8px;
  text-align: center;
  font-size: 0.82rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--primary);
  background: var(--primary-bg);
  border: 1px solid rgba(79, 70, 229, 0.2);
}

.hymn-title {
  flex: 1 1 auto;
  font-size: 0.98rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.hymn-cta {
  flex: 0 0 auto;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-tertiary);
}

.hymn-row:hover .hymn-cta {
  color: var(--primary);
}

@media (max-width: 768px) {
  .section-heading-row {
    align-items: flex-start;
  }

  .hymn-row {
    padding: 12px 14px;
    gap: 10px;
  }

  .hymn-number {
    min-width: 44px;
  }

  .hymn-cta {
    display: none;
  }
}

</style>

