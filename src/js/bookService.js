/**
 * Book (PDF) service - reads the Firestore `books` collection.
 *
 * The write path lives in `scripts/sync-book.mjs`: push a PDF to
 * Church62626/Church-Books at `books/<language>/<fileName>.pdf`, then run the
 * sync script, which registers the document this module reads. Reading is
 * deliberately defensive - a malformed document is skipped rather than
 * blanking the whole list.
 */

import { getLanguage } from './hymnService.js'

export const BOOKS_COLLECTION = 'books'

/** Mirrors scripts/sync-book.mjs so bad input is rejected at write time. */
export const BOOK_LANGUAGES = [
  'urdu', 'roman-urdu', 'english', 'punjabi', 'pashto', 'sindhi', 'balochi', 'chinese'
]

/** `roman-urdu` is a reading variant with no folder of its own on the books repo. */
export const booksLanguageKey = (tab) => (tab === 'roman-urdu' ? 'urdu' : tab)

const booksCache = new Map()

/** Firestore server timestamps arrive as { seconds, nanoseconds }. */
export function toDate(value) {
  try {
    if (!value) return null
    if (typeof value.toDate === 'function') return value.toDate()
    if (value.seconds != null) return new Date(value.seconds * 1000)
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value)
      return Number.isNaN(d.getTime()) ? null : d
    }
  } catch {
    /* fall through */
  }
  return null
}

/** Turn one raw Firestore snapshot into a render-ready book, or null if unusable. */
export function toBook(doc) {
  const data = (doc && typeof doc.data === 'function' ? doc.data() : doc) || {}
  const fileUrl = typeof data.fileUrl === 'string' ? data.fileUrl.trim() : ''
  const title = (typeof data.title === 'string' ? data.title.trim() : '') || 'Untitled'
  const language = typeof data.language === 'string' ? data.language.toLowerCase() : ''
  if (!fileUrl || !language) return null

  return {
    id: String(data.id || doc.id || '').trim() || fileUrl,
    title,
    language,
    category: typeof data.category === 'string' ? data.category : 'books',
    fileUrl,
    published: data.published === true,
    fileName: typeof data.fileName === 'string' ? data.fileName : fileUrl.split('/').pop(),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt)
  }
}

/** Newest first, with a title tiebreak so the order is stable across loads. */
function sortBooks(list) {
  return list.sort((a, b) => {
    const at = a.createdAt ? a.createdAt.getTime() : 0
    const bt = b.createdAt ? b.createdAt.getTime() : 0
    if (at !== bt) return bt - at
    return a.title.localeCompare(b.title)
  })
}

/**
 * fetchBooks(language) -> { language, books, source, problem }
 *
 * `problem` is null for a successful-but-empty language, which the caller shows
 * as "content coming soon" - an empty collection is an expected state, not a
 * fault. Resolves (never throws) so one bad tab cannot break the page.
 */
export async function fetchBooks(language, options = {}) {
  const key = booksLanguageKey(language || 'english')
  const { force = false, db = options.db } = options
  if (!force && booksCache.has(key)) return booksCache.get(key)

  let books = []
  let source = null
  let problem = null

  try {
    if (!db) throw new Error('No Firestore handle supplied')
    // Dynamic on purpose: this module is imported by the Node test suites, where
    // the browser-only Firestore SDK must not be pulled in just to shape docs.
    const { collection, query, where, getDocs } = await import('firebase/firestore')
    const snap = await getDocs(
      query(
        collection(db, BOOKS_COLLECTION),
        // Both clauses are equality filters, so Firestore serves this from
        // single-field indexes - no composite index required.
        where('language', '==', key),
        where('published', '==', true)
      )
    )
    books = sortBooks(snap.docs.map(toBook).filter(Boolean))
    source = 'firestore'
  } catch (err) {
    const message = err?.message || String(err)
    problem = /permission|insufficient|unauth|missing or insufficient/i.test(message)
      ? 'forbidden'
      : 'unavailable'
    if (typeof console !== 'undefined') console.warn(`[books] ${key}: ${problem} - ${message}`)
  }

  const result = { language: key, books, source, problem }
  booksCache.set(key, result)
  return result
}

export function clearBooksCache() {
  booksCache.clear()
}

/** Honest copy for the empty / unavailable states - never a raw error. */
export function booksEmptyMessage(language, problem = 'missing') {
  const meta = getLanguage(language)
  const label = meta?.label || 'This language'

  if (problem === 'forbidden') {
    return `The ${label} book list could not be loaded. Please try again in a moment.`
  }
  if (problem === 'unavailable') {
    return `The ${label} book list could not be reached right now. Please try again shortly.`
  }
  if (meta && !meta.published) {
    return `${label} books have not been published yet. English and Urdu books are ready to read.`
  }
  return `No ${label} books have been published yet. Check back soon.`
}

export function formatBookDate(value) {
  const d = toDate(value)
  if (!d) return ''
  try {
    return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })
  } catch {
    return d.toISOString().slice(0, 10)
  }
}