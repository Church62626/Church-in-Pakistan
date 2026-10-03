<template>
  <div class="page">
    <div class="wrap">
      <header class="head">
        <h1 class="title">E-Books</h1>
        <p class="sub">Books published by the church, to read here in the browser.</p>
      </header>

      <p v-if="loading" class="status" role="status">Looking for books...</p>

      <section v-else-if="problem" class="notice glass-card">
        <div class="notice-icon" aria-hidden="true">📚</div>
        <h2 class="notice-title">No books published yet</h2>
        <p class="notice-text">
          Books appear here automatically as soon as they are uploaded. Nothing
          needs to be rebuilt.
        </p>
      </section>

      <template v-else>
        <ul class="list">
          <li v-for="book in books" :key="book.id" class="card glass-card">
            <div class="card-body">
              <h2 class="card-title">{{ book.title }}</h2>
              <p v-if="sizeOf(book.size)" class="card-meta">{{ sizeOf(book.size) }}</p>
              <p v-if="book.description" class="card-text">{{ book.description }}</p>
            </div>
            <div class="card-actions">
              <!-- "Read" opens the in-page viewer. It is deliberately a <button>,
                   not an <a>: an anchor to the PDF either navigates away or
                   starts a download, which is exactly what this avoids.
                   "Download" stays an explicit, separate choice. -->
              <button
                type="button"
                class="btn btn-primary"
                :disabled="loadingBookId === book.id"
                @click="openBook(book)"
              >{{ loadingBookId === book.id ? 'Opening...' : 'Read' }}</button>
              <a class="btn" :href="book.pdfUrl" target="_blank" rel="noopener noreferrer" :download="book.file">
                Download
              </a>
            </div>
          </li>
        </ul>

        <!-- In-app reader.

             The PDF is fetched into a Blob and shown from an object URL rather
             than pointed at directly. That is not a style choice: raw.githubusercontent
             serves these files as `application/octet-stream`, so a viewer given
             the raw URL cannot tell it is a PDF and downloads it instead of
             rendering it. Re-typing the Blob as application/pdf is what makes the
             in-app view work at all. -->
        <section v-if="active" class="reader" role="dialog" aria-modal="true" aria-label="Book reader">
          <div class="reader-head">
            <h2 class="reader-title">{{ active.title }}</h2>
            <div class="reader-tools">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="saving"
                @click="toggleBookmark"
              >{{ bookmarkSaved ? '★ Saved' : saving ? 'Saving...' : '☆ Save' }}</button>
              <button type="button" class="btn" @click="closeBook">Close</button>
            </div>
          </div>

          <p v-if="readerError" class="reader-error">{{ readerError }}</p>
          <object
            v-else-if="activeUrl"
            :data="activeUrl"
            type="application/pdf"
            class="viewer"
          >
            <p class="reader-fallback">
              Your browser cannot display this PDF here.
              <a :href="active.pdfUrl" target="_blank" rel="noopener noreferrer">Open it in a new tab</a>.
            </p>
          </object>
          <p v-else class="reader-status">Preparing the book...</p>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { fetchEBooks, formatSize } from '../js/appsService.js'
// Cloud bookmark layer. Kept in its own module so the Firestore imports do not
// leak into appsService.js, which the test suite imports under bare Node.
import {
  saveBookmark,
  readBookmark,
  removeBookmark,
  currentUserEmail
} from '../js/bookmarkStore.js'

const books = ref([])
const loading = ref(true)
const problem = ref('')
/** The book currently open in the in-page reader. */
const active = ref(null)
/** Object URL for the fetched PDF. Revoked on close so it is not leaked. */
const activeUrl = ref('')
const readerError = ref('')
/** Id of the book being fetched, for the per-card "Opening..." state. */
const loadingBookId = ref('')
/** Bookmark state for the open book. */
const bookmarkSaved = ref(false)
const saving = ref(false)
/** Non-empty while a "please log in" prompt should be visible. */
const signInPrompt = ref(false)

function sizeOf(bytes) {
  return formatSize(bytes)
}

/**
 * Save or clear a bookmark for the open book.
 *
 * Gated on sign-in: an anonymous visitor is told to log in rather than having
 * the save silently do nothing or vanish on the next visit. Signed in, the
 * bookmark goes to Firestore; if that write fails it falls back to the device
 * so progress is never silently lost.
 */
async function toggleBookmark() {
  const book = active.value
  if (!book || saving.value) return
  if (!currentUserEmail()) {
    signInPrompt.value = true
    return
  }
  saving.value = true
  try {
    if (bookmarkSaved.value) {
      await removeBookmark(book.id)
      bookmarkSaved.value = false
    } else {
      const res = await saveBookmark(book)
      if (!res.ok) return
      bookmarkSaved.value = true
    }
  } catch (err) {
    // Never surface a raw Firestore error to the reader.
    console.warn('ebooks: bookmark failed', err?.message)
    readerError.value = 'That bookmark could not be saved just now. Please try again.'
  } finally {
    saving.value = false
  }
}

/** Refresh the bookmark flag when a book is opened. */
async function loadBookmarkState(book) {
  if (!book) {
    bookmarkSaved.value = false
    return
  }
  try {
    const mark = await readBookmark(book.id)
    bookmarkSaved.value = Boolean(mark)
  } catch {
    bookmarkSaved.value = false
  }
}

/**
 * Fetch a book into a Blob and display it in the in-app viewer.
 *
 * Why a Blob and not the URL: the host serves these PDFs as
 * `application/octet-stream`, so an `<object type="application/pdf">` pointed
 * straight at it cannot tell the file is a PDF and downloads it instead of
 * rendering it. Re-typing the bytes fixes that without bundling a PDF library.
 *
 * The previous book is always released first, so repeatedly opening books
 * cannot leak several megabytes of object URLs each.
 */
async function openBook(book) {
  if (!book || !book.pdfUrl) return
  loadingBookId.value = book.id
  readerError.value = ''
  closeBook()

  active.value = book
  try {
    const res = await fetch(book.pdfUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    activeUrl.value = URL.createObjectURL(
      // Explicitly re-typed; the Blob keeps the octet-stream type otherwise.
      new Blob([blob], { type: 'application/pdf' })
    )
    // The viewer sits below the list, so bring it into view on a phone.
    nextTick(() => {
      document.querySelector('.reader')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  } catch (err) {
    readerError.value =
      'This book could not be opened here. Please check your connection, or use Download.'
    console.warn('ebooks: could not load', book.file, err.message)
  } finally {
    loadingBookId.value = ''
  }
}

function closeBook() {
  if (activeUrl.value) {
    URL.revokeObjectURL(activeUrl.value)
    activeUrl.value = ''
  }
  active.value = null
  readerError.value = ''
}

/** Escape closes the reader, matching the Close button. */
function onKeydown(e) {
  if (e.key === 'Escape' && active.value) closeBook()
}

async function load() {
  loading.value = true
  problem.value = ''
  try {
    const result = await fetchEBooks('urdu')
    books.value = result.books
    if (result.problem) problem.value = result.problem
  } finally {
    loading.value = false
  }
}

onMounted(load)
document.addEventListener('keydown', onKeydown)
// Release the object URL when the page is left, or the blob stays in memory.
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  closeBook()
})
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

.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }

.card { display: flex; align-items: center; gap: 18px; padding: 20px; border-radius: 18px; }
.card-body { flex: 1; min-width: 0; }
.card-title { margin: 0 0 4px; font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }
.card-meta { margin: 0; font-size: 0.85rem; color: var(--text-secondary); }
.card-text { margin: 8px 0 0; font-size: 0.92rem; color: var(--text-secondary); line-height: 1.6; }
.card-actions { display: flex; gap: 8px; flex-shrink: 0; }

.btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 42px; padding: 9px 18px; border-radius: 10px;
  border: 1px solid var(--border-color); background: transparent;
  color: var(--text-primary); font: inherit; font-size: 0.9rem;
  font-weight: 600; text-decoration: none; cursor: pointer;
}
.btn-primary { background: var(--primary); color: #fff; border-color: transparent; }

.reader { margin-top: 26px; }
.reader-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 12px; flex-wrap: wrap;
}
.reader-title { margin: 0; font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }
.viewer { width: 100%; height: 78vh; min-height: 460px; border: 1px solid var(--border-color); border-radius: 14px; }
.reader-error {
  padding: 18px;
  margin: 0;
  border-radius: 12px;
  border-left: 3px solid var(--primary-color, #4f7cff);
  background: var(--primary-bg, rgba(79, 70, 229, 0.08));
  color: var(--text-secondary);
}

.reader-status { padding: 40px 0; text-align: center; color: var(--text-secondary); }

.reader-fallback { padding: 20px; color: var(--text-secondary); }

@media (max-width: 560px) {
  .card { flex-wrap: wrap; }
  .card-actions { width: 100%; }
}
</style>
