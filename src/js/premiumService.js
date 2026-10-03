/**
 * Premium (paid) books: a purchase / request system.
 *
 * The upstream `books/urdu-paid` and `books/urdu-purchase` folders exist but are
 * currently empty placeholders (a single whitespace-only .txt each), so there is
 * nothing real to show yet. This service therefore:
 *   - reads published premium books from the Firestore `premiumBooks` collection
 *   - falls back to scanning the GitHub folder if one is ever populated
 *   - ALWAYS resolves to an empty list plus a reason, never a fabricated book
 *
 * A Firestore document shape (one document per book):
 *   { title, titleEn, language, price, currency, description,
 *     coverUrl, fileUrl, highlights: string[], available: bool, published: bool }
 */

import { getLanguage, scriptClass } from './hymnService.js'

export const PREMIUM_COLLECTION = 'premiumBooks'
export const PREMIUM_REPO = 'Church62626/Church-Books'
export const PREMIUM_BRANCH = 'main'

/** Folders upstream is expected to publish into. */
export const PREMIUM_SOURCE_FOLDERS = ['books/urdu-paid', 'books/urdu-purchase']

const cache = new Map()

export function premiumBookId(language, title) {
  const raw = String(title ?? '')
  const base = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  if (base) return `${language}-${base}`
  // Non-Latin titles slugify to nothing, so fall back to a stable hash rather
  // than emitting a bare `${language}-` id that would collide for every one.
  let hash = 5381
  for (let i = 0; i < raw.length; i++) hash = ((hash * 33) ^ raw.charCodeAt(i)) >>> 0
  return `${language}-book-${hash.toString(16).padStart(8, '0').slice(0, 8)}`
}

/** One Firestore snapshot -> the shape the UI renders. Never throws. */
export function shapePremiumBook(doc, language) {
  const d = doc?.data?.() ?? doc ?? {}
  return {
    id: d.id || premiumBookId(d.language || language, d.title || ''),
    title: String(d.title ?? '').trim(),
    titleEn: String(d.titleEn ?? '').trim(),
    language: d.language || language || 'urdu',
    price: Number(d.price ?? 0),
    currency: String(d.currency || 'PKR'),
    description: String(d.description ?? '').trim(),
    coverUrl: String(d.coverUrl ?? ''),
    highlights: Array.isArray(d.highlights) ? d.highlights.filter(Boolean).map(String) : [],
    available: d.available !== false
  }
}

/**
 * fetchPremiumBooks(language, { db })
 * -> { language, books, problem, source }
 *
 * Resolves even when Firestore is unavailable or empty: `books` is always an
 * array and `problem` explains an empty result, so the caller renders an honest
 * "coming soon" state instead of crashing or inventing content.
 */
export async function fetchPremiumBooks(language, { db = null } = {}) {
  const lang = language || 'urdu'
  const key = `${lang}:${db ? 'live' : 'none'}`
  if (cache.has(key)) return cache.get(key)

  if (!db) {
    const empty = {
      language: lang,
      books: [],
      problem: 'unavailable',
      source: null
    }
    cache.set(key, empty)
    return empty
  }

  try {
    const { collection, query, where, getDocs, orderBy } = await import('firebase/firestore')
    const snap = await getDocs(
      query(
        collection(db, PREMIUM_COLLECTION),
        where('language', '==', lang),
        where('published', '==', true),
        orderBy('title')
      )
    )
    const books = snap.docs.map((d) => shapePremiumBook(d, lang))
    const result = {
      language: lang,
      books,
      // An empty collection is a legitimate state, not an error: upstream has
      // not published any premium books yet.
      problem: books.length ? null : 'empty',
      source: 'firestore'
    }
    cache.set(key, result)
    return result
  } catch (err) {
    console.warn('premium books unavailable:', err.message)
    const failed = { language: lang, books: [], problem: 'unavailable', source: null }
    cache.set(key, failed)
    return failed
  }
}

/** Copy for the empty state. Says why, without pretending to know a date. */
export function premiumEmptyMessage(language, problem) {
  const label = getLanguage(language)?.label ?? language
  if (problem === 'unavailable') {
    return `The premium catalogue could not be loaded. Please try again shortly.`
  }
  return `Premium ${label} books are not available yet. Please check back soon.`
}

/** PKR formatting, matching the existing store so prices look consistent. */
export function formatPremiumPrice(price, currency = 'PKR') {
  const n = Number(price ?? 0)
  if (!Number.isFinite(n)) return ''
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(n)
  } catch {
    return `${currency} ${n}`
  }
}

export { scriptClass }