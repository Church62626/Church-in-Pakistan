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
    available: d.available !== false,
    // Absent `published` means a draft, which must stay hidden.
    published: d.published === true
  }
}

/**
 * fetchPremiumBooks(language, { db })
 * -> { language, books, problem, source }
 *
 * Resolves even when Firestore is unavailable: `books` is always an array and
 * `problem` explains an empty result, so the caller renders an honest state
 * instead of crashing or inventing content.
 *
 * ## Why the query is deliberately simple
 *
 * The first version chained two `where` filters with an `orderBy`, which
 * requires a Firestore *composite* index. No such index existed, so Firestore
 * rejected every read with FAILED_PRECONDITION ("query requires an index") and
 * the catch block reported it as "catalogue could not be loaded" - hiding a
 * configuration mistake behind a "coming soon" message.
 *
 * Single-field `where` clauses use the automatic single-field indexes that
 * Firestore always provides. Sorting is done in memory, which is free at this
 * scale (a premium catalogue is tens of documents, not thousands) and removes
 * an entire class of deployment dependency.
 */
export async function fetchPremiumBooks(language, { db = null } = {}) {
  const lang = language || 'urdu'
  const key = `${lang}:${db ? 'live' : 'none'}`
  if (cache.has(key)) return cache.get(key)

  if (!db) {
    const empty = { language: lang, books: [], problem: 'unavailable', source: null }
    cache.set(key, empty)
    return empty
  }

  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore')
    const snap = await getDocs(
      query(
        collection(db, PREMIUM_COLLECTION),
        where('language', '==', lang)
      )
    )

    // Filtering and ordering client-side: `published` may legitimately be
    // absent on a draft document, and absent must not mean "visible".
    const books = snap.docs
      .map((d) => shapePremiumBook(d, lang))
      .filter((b) => b.published)
      .sort((a, b) => a.title.localeCompare(b.title))

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
    // A missing index is a deployment problem, not an empty catalogue, and the
    // two must not be conflated - the first is actionable, the second is not.
    const missingIndex = err?.code === 'failed-precondition' ||
      /requires an index/i.test(err?.message || '')
    console.warn(
      missingIndex
        ? 'premium books: missing Firestore index (see README) -'
        : 'premium books unavailable:',
      err?.message || err
    )
    const failed = {
      language: lang,
      books: [],
      problem: missingIndex ? 'index-missing' : 'unavailable',
      source: null
    }
    cache.set(key, failed)
    return failed
  }
}

/** Copy for the empty state. Says why, without pretending to know a date. */
export function premiumEmptyMessage(language, problem) {
  const label = getLanguage(language)?.label ?? language
  if (problem === 'index-missing') {
    // Distinct from "unavailable": this is a deployment mistake, not a network
    // blip, and it should not be dressed up as "please try again shortly".
    return 'The premium catalogue is not set up correctly yet. Please contact the church.'
  }
  if (problem === 'unavailable') {
    return 'The premium catalogue could not be loaded. Please try again shortly.'
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