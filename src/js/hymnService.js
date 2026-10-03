/**
 * Hymn data service + GitHub CDN media URL generators.
 *
 * Two GitHub sources are used, both tracked on their `main` branch (verified as
 * the default branch for both repos) so newly published files are picked up
 * without another code change:
 *  - Lyrics JSON : Church62626/Church-in-Pakistan -> Hymns-contents/<lang>/<category>[_xx].json
 *  - Audio       : Church62626/hymns-audio-       -> <category>/<id>.mp3
 *                                                  -> MIDI/<category>/<id>.mid
 *
 * Verified file-name quirks (HTTP-checked against main):
 *   urdu uses `newsongs.json` (with an "s") while english/roman-urdu use
 *   `newsong_en.json` / `newsong_ru.json`, and the chinese folder currently
 *   publishes no JSON at all.
 */

export const JSON_BASE_URL =
  'https://raw.githubusercontent.com/Church62626/Church-in-Pakistan/main/Hymns-contents/'

export const AUDIO_BASE_URL =
  'https://raw.githubusercontent.com/Church62626/hymns-audio-/main/'

export const CATEGORIES = ['hymns', 'newsong', 'others']

/* ======================================================================
   Global language store
   The nav bar's LanguageSelector is the single source of truth for the
   app's language. Pages subscribe via activeLanguageRef / onLanguageChange
   instead of each keeping a private copy, so changing the language in one
   place updates the Library, the Reader and the media categories at once.
   ====================================================================== */

const ACTIVE_LANGUAGE_KEY = 'cip.activeLanguage'

/** Plain holder so non-component code (scripts, tests) can read it. */
let activeLanguage = 'urdu'
const languageListeners = new Set()

function readStoredLanguage() {
  try {
    return globalThis.localStorage?.getItem(ACTIVE_LANGUAGE_KEY) || ''
  } catch {
    // Private mode / disabled storage: fall through to the default.
    return ''
  }
}

/** Stored value, else ?lang=/?language= from the URL, else the fallback. */
export function resolveInitialLanguage(fallback = 'urdu') {
  const stored = typeof window !== 'undefined' ? readStoredLanguage() : ''
  if (getLanguage(stored)) return stored
  if (typeof window !== 'undefined') {
    try {
      const q = new URLSearchParams(window.location.search)
      const fromUrl = q.get('lang') || q.get('language')
      if (getLanguage(fromUrl)) return fromUrl
    } catch {
      // Malformed URL: ignore.
    }
  }
  // The fallback is validated too, so an unknown key can never become the
  // active language. This matters outside the browser (tests, scripts).
  return getLanguage(fallback) ? fallback : 'urdu'
}

/** The current global language key. */
export function getActiveLanguage() {
  return activeLanguage
}

/**
 * Set the global language.
 * Returns the applied key. Invalid or unpublished keys are ignored and the
 * previous value is returned, so a bad value can never blank the UI.
 */
export function setActiveLanguage(key) {
  const lang = getLanguage(key)
  if (!lang || !lang.published) return activeLanguage
  if (lang.key === activeLanguage) return activeLanguage
  activeLanguage = lang.key
  try {
    globalThis.localStorage?.setItem(ACTIVE_LANGUAGE_KEY, lang.key)
  } catch {
    // Non-fatal: the language still applies for this session.
  }
  for (const fn of languageListeners) {
    try {
      fn(lang.key)
    } catch (err) {
      console.warn('language listener failed', err)
    }
  }
  return activeLanguage
}

/** Subscribe to language changes. Returns an unsubscribe function. */
export function onLanguageChange(fn) {
  languageListeners.add(fn)
  return () => languageListeners.delete(fn)
}

/**
 * Language switcher order matches the Reader buttons: Urdu | Roman | English | 中文
 * `file` builds the JSON file name for a given category.
 */
/**
 * Every language the app can render.
 *
 * `folder` / `suffix` describe where the lyric JSON will live on GitHub:
 *   <JSON_BASE_URL><folder>/<category><suffix>.json
 * so adding a regional language is purely a data drop-in - publish
 * `Hymns-contents/punjabi/hymns_pa.json` and the tab starts working with no
 * code change.
 *
 * `published: false` marks a language whose folders do not exist on the repo
 * yet. Those tabs stay visible and selectable (so the routing, fonts and
 * layout are all exercised and ready for content), but they render an honest
 * "not published yet" state instead of silently falling back to English.
 */
export const LANGUAGES = [
  {
    key: 'urdu',
    label: 'Urdu',
    native: 'اردو',
    folder: 'urdu',
    suffix: '',
    dir: 'rtl',
    lang: 'ur',
    script: 'arabic-nastaliq',
    nastaliq: true,
    fontVar: '--font-urdu-body',
    published: true,
    // Verified quirk: the urdu newsong file is plural.
    file: (c) => (c === 'newsong' ? 'newsongs.json' : `${c}.json`)
  },
  {
    key: 'roman-urdu',
    label: 'Roman Urdu',
    native: 'Roman Urdu',
    folder: 'roman-urdu',
    suffix: '_ru',
    dir: 'ltr',
    lang: 'ur-Latn',
    script: 'latin',
    nastaliq: false,
    fontVar: '--font-reader',
    published: true,
    file: (c) => `${c}_ru.json`
  },
  {
    key: 'english',
    label: 'English',
    native: 'English',
    folder: 'english',
    suffix: '_en',
    dir: 'ltr',
    lang: 'en',
    script: 'latin',
    nastaliq: false,
    fontVar: '--font-reader',
    published: true,
    file: (c) => `${c}_en.json`
  },
  {
    key: 'chinese',
    label: 'Chinese',
    native: '中文',
    folder: 'chinese',
    suffix: '_zh',
    dir: 'ltr',
    lang: 'zh',
    script: 'cjk',
    nastaliq: false,
    fontVar: '--font-cjk-body',
    published: true,
    // Verified quirk: the Chinese hymnal is a SINGLE file, not one per category,
    // and it is named `hymnal_zh.json` (not `hymns_zh.json`). It carries all 807
    // hymns at once, so every category resolves to the same file.
    file: () => 'hymnal_zh.json',
    // The hymnal carries its own category fields, so the three app-level
    // categories collapse into one and the real cat/subcat tree is used instead.
    unified: true
  }
]

/** Languages whose lyric files are actually published on the repo. */
export const PUBLISHED_LANGUAGES = LANGUAGES.filter((l) => l.published)

/** The languages most used in Pakistani churches, shown first in selectors. */
export const PRIMARY_LANGUAGES = LANGUAGES.filter(
  (l) => l.key === 'urdu' || l.key === 'roman-urdu' || l.key === 'english'
)

export function getLanguage(key) {
  return LANGUAGES.find((l) => l.key === key) || null
}

/** Nastaliq is reserved for Urdu - regional Arabic-script languages stay Naskh. */
export function isUrdu(key) {
  return key === 'urdu'
}

/** RTL is a property of the language, not of whether it uses Nastaliq. */
export function isRtl(key) {
  return getLanguage(key)?.dir === 'rtl'
}

/**
 * CSS class that applies the right font + direction for a language's script.
 * Replaces the old binary `urdu-text` toggle so Gurmukhi and Shahmukhi get
 * their own typography instead of inheriting the Latin reader font.
 */
export function scriptClass(key) {
  const script = getLanguage(key)?.script || 'latin'
  return script === 'latin' ? 'script-latin' : `script-${script}`
}

/** The BCP-47 tag for the <html lang> / element lang attribute. */
export function langAttr(key) {
  return getLanguage(key)?.lang || 'en'
}

/** The CSS custom property holding this language's font stack. */
export function fontVar(key) {
  return getLanguage(key)?.fontVar || '--font-reader'
}

/** True when the repo does not yet publish lyric files for this language. */
export function isUnpublished(key) {
  return getLanguage(key)?.published === false
}

/** Normalises every category spelling the app might receive down to hymns|newsong|others. */
export function normaliseCategory(category) {
  const raw = String(category || 'hymns').trim().toLowerCase()
  if (raw === 'hymn') return 'hymns'
  if (raw === 'new' || raw === 'newsongs') return 'newsong'
  if (raw === 'other' || raw === 'another') return 'others'
  // The Chinese hymnal is exposed in the UI as one book called "hymnal", but
  // the audio repo has no hymnal/ folder - its recordings live in hymns/.
  // Mapping here means Chinese MP3/MIDI requests resolve to real files instead
  // of 404ing on a folder that will never exist.
  if (raw === 'hymnal') return 'hymns'
  return raw
}

/** 'C273' -> '273', 'F1' -> '1', '102' -> '102'. Used only for mp3 file names. */
export function stripLetters(id) {
  const key = String(id == null ? '' : id).trim()
  const stripped = key.replace(/^[^\d]+/, '')
  return stripped.length > 0 ? stripped : key
}

/**
 * Ordered candidate URLs. The first entry is the URL to use; the rest are
 * fallbacks tried in order by the player when the first one 404s.
 *
 * Verified layout (hymns-audio- @ 1e99cf9):
 *   mp3  : hymns/<id>.mp3 | newsong/<id>.mp3 | another/<id-without-letters>.mp3
 *   midi : MIDI/hymns/<id>.mid | MIDI/newsong/<id>.mid
 *          others MIDI lives in another/<full-id>.mid (MIDI/others/ is still an
 *          empty placeholder folder), so `another` is tried first for others.
 *   Root-level <id>.mp3 files also exist and are used as a last resort.
 */
export function getAudioUrlCandidates(category, id, type) {
  const cat = normaliseCategory(category)
  const key = String(id == null ? '' : id).trim()
  if (!key) return []

  const numeric = stripLetters(key)
  const wanted = String(type || 'mp3').toLowerCase() === 'midi' ? 'midi' : 'mp3'
  const urls = []
  const push = (url) => {
    if (url && !urls.includes(url)) urls.push(url)
  }

  if (wanted === 'midi') {
    if (cat === 'others') {
      push(`${AUDIO_BASE_URL}another/${key}.mid`)
      push(`${AUDIO_BASE_URL}MIDI/others/${key}.mid`)
      if (numeric !== key) push(`${AUDIO_BASE_URL}MIDI/others/${numeric}.mid`)
    } else {
      push(`${AUDIO_BASE_URL}MIDI/${cat}/${key}.mid`)
      if (numeric !== key) push(`${AUDIO_BASE_URL}MIDI/${cat}/${numeric}.mid`)
    }
  } else {
    const folder = cat === 'others' ? 'another' : cat
    push(`${AUDIO_BASE_URL}${folder}/${numeric}.mp3`)
    if (numeric !== key) push(`${AUDIO_BASE_URL}${folder}/${key}.mp3`)
    push(`${AUDIO_BASE_URL}${numeric}.mp3`)
  }

  return urls
}

/** Primary (first candidate) media URL for the given category/id/type. */
export function getAudioUrl(category, id, type) {
  return getAudioUrlCandidates(category, id, type)[0] || ''
}

/* ------------------------------------------------------------------ *
 * JSON location
 * ------------------------------------------------------------------ */

/**
 * Candidate JSON URLs for a (category, language) pair, most specific first.
 * Falls back to the main hymns file of the SAME language only when the
 * category file is missing entirely - never across languages, so 中文 never
 * silently renders English text.
 */
export function buildJsonUrls(category, language) {
  const lang = getLanguage(language) || getLanguage('english')
  const cat = normaliseCategory(category)
  const folder = `${JSON_BASE_URL}${lang.key}/`

  const urls = [folder + lang.file(cat)]
  if (cat !== 'hymns') urls.push(folder + lang.file('hymns'))
  return [...new Set(urls)]
}

/* ------------------------------------------------------------------ *
 * Normalisation - tolerant of every shape the data may arrive in
 * ------------------------------------------------------------------ */

const asArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value])

/** string | string[] | string[][] -> array of stanza strings (newlines preserved). */
function toStanzas(value) {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value
      .map((entry) => (Array.isArray(entry) ? entry.filter(Boolean).join('\n') : String(entry)))
      .filter((entry) => entry && entry.trim().length > 0)
  }
  const text = String(value).trim()
  return text ? [text] : []
}

/** string | string[] -> single string (embedded newlines kept). */
function toText(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return asArray(value).filter(Boolean).join('\n')
  return String(value)
}

function matchesId(entry, wanted) {
  if (!entry || typeof entry !== 'object') return false
  const keys = ['id', 'number', 'no', 'num', 'hymnId', 'hymn_id', 'slug']
  const target = String(wanted).trim().toLowerCase()
  return keys.some((key) => {
    const value = entry[key]
    return value != null && String(value).trim().toLowerCase() === target
  })
}

/**
 * Finds one hymn in whatever shape the file used:
 *   - a flat array            [{ id, title, lyrics }]
 *   - a stanza array          [{ id, title, stanzas: [...] }]
 *   - an object keyed by id   { "1": { cat, id, title: [], chorus: [], content: [[]] } }
 */
export function findHymn(data, id) {
  const wanted = String(id == null ? '' : id).trim()
  if (!data || !wanted) return null

  if (Array.isArray(data)) return data.find((entry) => matchesId(entry, wanted)) || null
  if (typeof data !== 'object') return null

  const variants = [...new Set([wanted, wanted.toLowerCase(), wanted.toUpperCase()])]

  const buckets = [
    ...asArray(data.hymns),
    ...asArray(data.songs),
    ...asArray(data.items),
    ...asArray(data.data),
    ...asArray(data.results)
  ]
  const fromBucket = buckets.find((entry) => matchesId(entry, wanted))
  if (fromBucket) return fromBucket

  for (const variant of variants) {
    const direct = data[variant]
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct
  }

  return Object.values(data).find((entry) => matchesId(entry, wanted)) || null
}

/** Converts a raw record into the shape the Reader renders. */
export function normalizeHymn(raw, id, meta = {}) {
  const verses = toStanzas(raw.stanzas ?? raw.verses ?? raw.content ?? raw.lyrics ?? raw.body ?? raw.lines)
  const title = toText(raw.title ?? raw.name ?? raw.heading)

  return {
    id: raw.id ?? raw.number ?? id,
    number: raw.number ?? raw.id ?? id,
    category: raw.category ?? raw.cat ?? meta.category ?? '',
    title: title || `Hymn ${id}`,
    titleLines: title ? title.split(/\r?\n/) : [`Hymn ${id}`],
    chorus: toStanzas(raw.chorus ?? raw.refrain).join('\n'),
    verses,
    language: meta.language || '',
    source: meta.source || 'remote',
    sourceUrl: meta.url || '',
    // Chinese hymnal extras. Harmless (empty) for every other language, so the
    // Reader can show them only when they are actually populated.
    zhNo: raw.zh_no ?? null,
    subcat: raw.subcat ?? '',
    author: toText(raw.author),
    composer: toText(raw.composer),
    scripture: toText(raw.scripture),
    meter: toText(raw.meter),
    // Cross-language link back to the English hymnal (Chinese only).
    enId: raw.en_id ?? null,
    enTitle: toText(raw.en_title)
  }
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

const cache = new Map()

/**
 * Remove raw control characters that JSON forbids inside string literals.
 *
 * The published `roman-urdu/newsong_ru.json` contains one literal TAB inside a
 * lyric string, so `response.json()` throws and the whole file - ~50 hymns -
 * becomes unreachable. Each offending character becomes a single space so the
 * words it separated do not run together.
 *
 * Scope is deliberately narrow: only TAB, VT and FF are touched. Newlines and
 * carriage returns are legal outside strings and carry the stanza layout, so
 * they are always preserved. Mirrors scripts/sync-hymns.mjs so the app and the
 * Firestore mirror repair the identical text.
 */
export function sanitiseLyricJson(text) {
  return String(text).replace(/[\t]/g, ' ')
}

async function getJson(url) {
  if (cache.has(url)) return cache.get(url)
  const response = await fetch(url)
  if (!response.ok) {
    const error = new Error(`${response.status}`)
    error.kind = 'http'
    error.status = response.status
    throw error
  }
  // Read the body as text ONCE and parse from that. Reading `response.json()`
  // first would consume the stream, making the repair path below impossible
  // ("Body has already been read"), so parsing always goes through the text.
  let text
  try {
    text = await response.text()
  } catch (err) {
    const error = new Error(`${err.message}`)
    error.kind = 'http'
    error.status = response.status
    throw error
  }

  let data
  try {
    data = JSON.parse(text)
  } catch (err) {
    // The file exists but is malformed. Retry once with raw control characters
    // removed.
    //
    // `roman-urdu/newsong_ru.json` contains a single literal TAB inside a lyric
    // string, which JSON forbids. Without this, every Roman Urdu "New Song"
    // hymn is unreachable in the app even though the file downloads fine. The
    // upstream owner cannot fix it right now, so the read path repairs the text
    // in memory; the published file is never modified.
    try {
      data = JSON.parse(sanitiseLyricJson(text))
      console.warn(`Repaired a raw control character in ${url}; worth fixing upstream.`)
    } catch (err2) {
      // Still unparseable: callers must NOT treat this like a 404.
      const error = new Error(`invalid JSON (${err2.message})`)
      error.kind = 'parse'
      error.status = response.status
      throw error
    }
  }
  cache.set(url, data)
  return data
}

/**
 * fetchHymn(category, id, language)
 *
 * Downloads the language/category JSON, finds the hymn whose id matches and
 * returns a normalised { title, chorus, verses, ... } object.
 * Falls back to the bundled sample only when every remote candidate is missing.
 */
export async function fetchHymn(category, id, language) {
  const wanted = String(id == null ? '' : id).trim()

  // Guard: never touch the network until the route actually carries an id.
  if (!wanted) {
    const error = new Error('No hymn id was provided, so nothing was fetched.')
    error.code = 'HYMN_ID_REQUIRED'
    error.attempts = []
    throw error
  }

  const cat = normaliseCategory(category)
  const lang = language || 'english'
  const attempts = []
  let remoteFailed = false
  let parseFailed = false
  let loadedButMissing = false

  for (const url of buildJsonUrls(cat, lang)) {
    let data
    try {
      data = await getJson(url)
    } catch (err) {
      if (err.kind === 'parse') {
        // Corrupt upstream file: stop rather than silently serving a hymn
        // from a different category's file.
        attempts.push(`${url} -> ${err.message}`)
        parseFailed = true
        break
      }
      remoteFailed = true
      attempts.push(`${url} -> ${err.message}`)
      continue
    }

    const found = findHymn(data, wanted)
    if (found) return normalizeHymn(found, wanted, { language: lang, category: cat, url })

    // The file downloaded fine but has no such id - stop here instead of
    // silently returning a hymn from a different category's file.
    attempts.push(`${url} -> loaded, but hymn "${wanted}" is not in it`)
    loadedButMissing = true
    break
  }

  // No bundled sample any more: an unpublished language resolves to an honest
  // error rather than silently rendering a placeholder hymn.
  let reason = 'No lyric file could be loaded.'
  if (loadedButMissing) reason = 'The lyric file loaded but contains no such hymn.'
  else if (parseFailed) reason = 'The lyric file downloaded but is not valid JSON and needs fixing upstream.'
  else if (remoteFailed) reason = 'The GitHub lyric files for this language are not published yet.'

  const error = new Error(
    `Hymn "${wanted}" could not be loaded for ${lang}/${cat}. ${reason} Tried: ${attempts.join(' | ')}`
  )
  error.code = loadedButMissing
    ? 'HYMN_NOT_FOUND'
    : parseFailed
      ? 'HYMN_DATA_INVALID'
      : 'HYMN_DATA_MISSING'
  error.attempts = attempts
  throw error
}

export const FALLBACK_DATA_URL = null

/* ------------------------------------------------------------------ *
 * Library catalog
 *
 * The Library no longer reads the old static placeholder catalog (which
 * contained fake ids like "zaboor-1" that exist in no lyric file). It now
 * builds its "Books" straight from the three GitHub category JSONs, so every
 * id it renders is one the Reader can actually load.
 * ------------------------------------------------------------------ */

/** Readable "Book" labels for the three GitHub JSON categories.
 *  `short` is the button-sized label; `label` is the fuller heading form. */
export const CATEGORY_META = [
  {
    key: 'hymns',
    label: 'Hymns / Geet',
    short: 'Hymns',
    emoji: '🎵',
    blurb: 'The main hymnal - the songs we sing most in our gatherings.'
  },
  {
    key: 'newsong',
    label: 'New Songs',
    short: 'New Songs',
    emoji: '🎶',
    blurb: 'Newer songs and choruses recently added to the church songbook.'
  },
  {
    key: 'others',
    label: 'Others',
    short: 'Others',
    emoji: '📖',
    blurb: 'Supplementary songs, choruses and special-number items.'
  }
]

/** Numeric-aware sort: 1, 2, 7, 11 ... then C273, F1 style ids. */
function sortEntries(list) {
  return list.sort((a, b) =>
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' })
  )
}

/** Short display title for a catalog row (never throws). */
function listTitle(entry, id) {
  try {
    const raw = entry && typeof entry === 'object' ? entry : null
    return toText(raw?.title ?? raw?.name ?? raw?.heading) || `Hymn ${id}`
  } catch {
    return `Hymn ${id}`
  }
}

/**
 * Which category books a language actually exposes.
 *
 * Chinese publishes one unified hymnal rather than the standard three files, so
 * showing three identical books would be a lie. It gets a single book whose
 * contents are grouped by the hymnal's own cat/subcat tree instead.
 */
export function categoriesFor(language) {
  const lang = getLanguage(language)
  if (lang?.unified) {
    return [{
      key: 'hymnal',
      label: 'Hymnal',
      emoji: '📖',
      blurb: 'The complete Chinese hymnal, grouped by category and sub-category.'
    }]
  }
  return CATEGORY_META
}

/** Flatten one category JSON file into [{ id, title, cat, subcat }]. */
function entriesFrom(data) {
  if (Array.isArray(data)) {
    return data.map((entry, index) => {
      const id = String(entry?.id ?? index).trim() || String(index)
      return {
        id,
        title: listTitle(entry, id),
        cat: entry?.cat ?? '',
        subcat: entry?.subcat ?? ''
      }
    })
  }
  if (data && typeof data === 'object') {
    return Object.entries(data).map(([key, entry]) => {
      const rawId = entry && typeof entry === 'object' && entry.id != null ? String(entry.id).trim() : ''
      const id = rawId || key
      return {
        id,
        title: listTitle(entry, key),
        cat: entry?.cat ?? '',
        subcat: entry?.subcat ?? ''
      }
    })
  }
  return []
}

/**
 * Group flat entries into a cat -> subcat -> hymns tree, preserving the order
 * the data arrived in so the hymnal reads in its intended sequence.
 *
 * Groups with an empty label are folded into a single "Uncategorised" bucket
 * rather than creating a nameless heading.
 */
export function groupByCategory(entries) {
  const root = new Map()
  for (const entry of entries) {
    const cat = String(entry.cat ?? '').trim() || 'Uncategorised'
    const sub = String(entry.subcat ?? '').trim() || 'General'
    if (!root.has(cat)) root.set(cat, new Map())
    const subs = root.get(cat)
    if (!subs.has(sub)) subs.set(sub, [])
    subs.get(sub).push({ id: entry.id, title: entry.title })
  }

  return [...root.entries()].map(([cat, subs]) => ({
    cat,
    count: [...subs.values()].reduce((n, list) => n + list.length, 0),
    subcats: [...subs.entries()].map(([subcat, hymns]) => ({
      subcat,
      count: hymns.length,
      hymns
    }))
  }))
}

const catalogCache = new Map()

/**
 * fetchCatalog(language) -> { language, books: [{ key, label, blurb, emoji,
 *   count, hymns: [{ id, title }], source, problem }] }
 *
 * Loads only each category's OWN file - never a cross-category fallback -
 * otherwise the "Others" book would list every hymn.
 * Resolves even when a file is unpublished/corrupt; those books come back with
 * `count: 0` and `problem` set so the Library can explain itself.
 */
export async function fetchCatalog(language) {
  const lang = language || 'english'
  if (catalogCache.has(lang)) return catalogCache.get(lang)

  const books = await Promise.all(
    categoriesFor(lang).map(async (meta) => {
      const url = buildJsonUrls(meta.key, lang)[0]
      let source = null
      let problem = null
      let detail = ''
      let hymns = []
      let categories = []

      // Network/HTTP/parse failure comes from getJson; a failure while shaping
      // the rows is reported separately so neither is mistaken for the other.
      let data = null
      try {
        data = await getJson(url)
      } catch (err) {
        problem = err.kind === 'parse' ? 'corrupt' : 'missing'
        detail = err.message
      }

      if (data !== null) {
        try {
          const entries = sortEntries(entriesFrom(data))
          hymns = entries
          // Grouped tree for languages that publish their own cat/subcat fields.
          // Chinese is the first; other languages simply get an empty tree and
          // the Library renders a flat list exactly as before.
          categories = groupByCategory(entries)
          source = url
        } catch (err) {
          problem = 'corrupt'
          detail = err.message
          hymns = []
          categories = []
        }
      }

      // No fallback to a bundled sample: an unpublished book stays empty so the
      // Library can explain itself instead of listing placeholder hymns.
      return {
        ...meta,
        language: lang,
        count: hymns.length,
        hymns,
        categories,
        source,
        problem,
        detail
      }
    })
  )

  const result = { language: lang, books }
  catalogCache.set(lang, result)
  return result
}



