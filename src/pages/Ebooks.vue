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
              <!-- The PDF renders in-app via the native browser viewer, so a
                   visitor never has to leave the site to read. -->
              <a class="btn btn-primary" :href="book.pdfUrl" target="_blank" rel="noopener noreferrer">
                Read
              </a>
              <a class="btn" :href="book.pdfUrl" target="_blank" rel="noopener noreferrer" :download="book.file">
                Download
              </a>
            </div>
          </li>
        </ul>

        <!-- In-app reader. An <object>/<embed> is used rather than an <iframe>
             so the PDF fills the page and the browser's own viewer handles
             paging; no PDF.js bundle is needed. -->
        <section v-if="active" class="reader">
          <div class="reader-head">
            <h2 class="reader-title">{{ active.title }}</h2>
            <button type="button" class="btn" @click="active = null">Close</button>
          </div>
          <object :data="active.pdfUrl" type="application/pdf" class="viewer">
            <p class="reader-fallback">
              Your browser cannot display this PDF here.
              <a :href="active.pdfUrl" target="_blank" rel="noopener noreferrer">Open it in a new tab</a>.
            </p>
          </object>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { fetchEBooks, formatSize } from '../js/appsService.js'

const books = ref([])
const loading = ref(true)
const problem = ref('')
/** The book currently open in the in-page reader. */
const active = ref(null)

function sizeOf(bytes) {
  return formatSize(bytes)
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
.reader-fallback { padding: 20px; color: var(--text-secondary); }

@media (max-width: 560px) {
  .card { flex-wrap: wrap; }
  .card-actions { width: 100%; }
}
</style>
