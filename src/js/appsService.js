/**
 * Church apps catalogue.
 *
 * The apps live in the `church-apps/` folder of the main repo. This service
 * reads that folder over the GitHub Contents API rather than hard-coding a
 * list, so publishing a new app (by adding a file to that folder) makes it
 * appear on the Apps screen automatically - no redeploy needed.
 *
 * The folder is pinned to the commit referenced by the Products menu link, so
 * the catalogue cannot change under a visitor mid-session. `APPS_REF` is the
 * only thing to bump when a new app is published.
 */

export const APPS_REPO = 'Church62626/Church-in-Pakistan'
export const APPS_PATH = 'church-apps'

/**
 * Pinned to the commit that publishes the Hymns Android app, so the catalogue
 * cannot change under a visitor mid-session. `APPS_REF` is the only thing to
 * bump when a new build is published.
 */
export const APPS_REF = 'fe0da0390ecf8ca1194b399d19bd5afd72459c8c'

export const APPS_BROWSER_URL =
  `https://github.com/${APPS_REPO}/tree/${APPS_REF}/${APPS_PATH}`

const CONTENTS_API =
  `https://api.github.com/repos/${APPS_REPO}/contents/${APPS_PATH}?ref=${APPS_REF}`

/**
 * Files that describe the folder rather than being an app. `church-apps.txt`
 * is currently the only entry in the folder and it is empty; it is a
 * placeholder, not a download, so it must never be rendered as one.
 */
const NON_APP_FILES = /^(readme|church-apps)\.(txt|md)$/i

/**
 * Platform detection from the file extension, so the Apps screen can show an
 * icon and a real download link without per-app metadata to maintain.
 */
function platformFor(name) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  if (['apk', 'aab', 'xapk'].includes(ext)) return { id: 'android', label: 'Android', icon: '🤖' }
  if (ext === 'ipa') return { id: 'ios', label: 'iOS', icon: '🍎' }
  if (['exe', 'msi', 'dmg', 'pkg', 'appimage', 'deb'].includes(ext)) {
    return { id: 'desktop', label: 'Desktop', icon: '💻' }
  }
  return { id: 'other', label: 'Download', icon: '📦' }
}

/** Human title from a file name: `lord-recovery-hymnal_v2.1.0.apk`
 *  -> `Lord Recovery Hymnal V2.1.0` */
function titleFor(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * List the downloadable apps in the folder.
 *
 * Resolves to `{ apps, problem }`. Failures are reported through `problem`
 * rather than thrown, because a network problem must not break the nav: the
 * caller renders an honest message plus a link to GitHub, which always works.
 * `problem` is one of 'unavailable' | 'rate-limited' | 'not-found' | 'unknown'.
 */
export async function fetchApps() {
  let res
  try {
    res = await fetch(CONTENTS_API, { headers: { Accept: 'application/vnd.github+json' } })
  } catch (err) {
    return { apps: [], problem: 'unavailable', detail: err?.message || '' }
  }

  if (res.status === 404) return { apps: [], problem: 'not-found', detail: '' }
  // GitHub rate-limits unauthenticated API calls. That is not our fault and it
  // is temporary, so it gets its own honest message instead of a generic error.
  if (res.status === 403 || res.status === 429) {
    return { apps: [], problem: 'rate-limited', detail: '' }
  }
  if (!res.ok) return { apps: [], problem: 'unknown', detail: `HTTP ${res.status}` }

  let entries
  try {
    entries = await res.json()
  } catch {
    return { apps: [], problem: 'unknown', detail: 'Malformed response' }
  }
  if (!Array.isArray(entries)) return { apps: [], problem: 'unknown', detail: '' }

  const apps = entries
    .filter((e) => e && e.type === 'file' && e.name && !NON_APP_FILES.test(e.name))
    .map((e) => ({
      id: e.name,
      name: titleFor(e.name),
      file: e.name,
      platform: platformFor(e.name),
      // `download_url` is GitHub's raw CDN link; `html_url` is the file's page
      // on github.com. Both are kept so a card can fall back to the page when
      // the raw link is blocked by a network.
      downloadUrl: e.download_url || '',
      pageUrl: e.html_url || APPS_BROWSER_URL,
      size: Number(e.size) || 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { apps, problem: '' }
}

/** Byte count to a short size label. Empty for an unknown size. */
export function formatSize(bytes) {
  const n = Number(bytes) || 0
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/* ======================================================================
   Bible quiz

   Source (verified live, 186 real questions):
     https://raw.githubusercontent.com/Church62626/Church-in-Pakistan/
       9bab97bed02f03f2a6130a1eaa7d55f9957b842a/bible-quiz/bible-quiz.json

   ACTUAL schema (checked, not assumed):
     {
       oldTestament: { languages: { english: [...], urdu: [...], chinese: [...] } },
       newTestament: { languages: { english: [...], urdu: [...], chinese: [...] } }
     }

   Each question: { id, question, options[4], correctAnswerIndex, explanation }

   One real quirk: every language array begins with a PLACEHOLDER STRING such
   as "@@OT_EN@@" - a build marker, not a question. It has no `question` field
   and no `options`, so `normaliseQuestion` rejects it. It must not be treated
   as data or the UI would render a blank, unanswerable card.
   ====================================================================== */

export const QUIZ_REPO = 'Church62626/Church-in-Pakistan'
export const QUIZ_PATH = 'bible-quiz/bible-quiz.json'
export const QUIZ_REF = '9bab97bed02f03f2a6130a1eaa7d55f9957b842a'

/** The two sections the quiz is split into. */
export const TESTAMENTS = ['Old Testament', 'New Testament']

/** Languages the quiz is authored in. */
export const QUIZ_LANGUAGES = ['english', 'urdu', 'chinese']

/** The JSON keys that hold each testament's questions. */
const TESTAMENT_KEYS = { 'Old Testament': 'oldTestament', 'New Testament': 'newTestament' }

const QUIZ_URL =
  `https://raw.githubusercontent.com/${QUIZ_REPO}/${QUIZ_REF}/${QUIZ_PATH}`

/**
 * Validate and normalise one question.
 *
 * Every field is checked rather than trusted: a question whose
 * `correctAnswerIndex` points past the end of `options` would render a quiz
 * that nobody can answer correctly. Bad entries return null and are dropped.
 */
export function normaliseQuestion(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null

  const options = Array.isArray(raw.options)
    ? raw.options.map((o) => String(o ?? '').trim()).filter((o) => o.length > 0)
    : []
  if (options.length < 2) return null

  const answer = Number(raw.correctAnswerIndex)
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return null

  const question = String(raw.question ?? '').trim()
  if (!question) return null

  const testament = TESTAMENTS.includes(raw.testament) ? raw.testament : TESTAMENTS[0]
  const language = QUIZ_LANGUAGES.includes(raw.language) ? raw.language : 'english'

  return {
    id: String(raw.id ?? `${testament}-${index}`),
    testament,
    language,
    question,
    options,
    correctAnswerIndex: answer,
    explanation: String(raw.explanation ?? '').trim()
  }
}

/**
 * Load the quiz questions from the nested
 * `{ oldTestament: { languages: {...} }, newTestament: { languages: {...} } }`
 * structure, flattening it into one list where each question carries its own
 * testament and language.
 *
 * Resolves to `{ questions, problem }` and never throws: a missing or empty
 * data file is a normal state for the screen to explain, not an exception.
 * `problem` is one of 'unavailable' | 'empty' | 'unknown'.
 */
export async function fetchQuizQuestions() {
  let parsed
  try {
    const res = await fetch(QUIZ_URL)
    if (res.status === 404) return { questions: [], problem: 'not-found' }
    if (!res.ok) return { questions: [], problem: 'unavailable' }
    const text = (await res.text()).trim()
    if (!text) return { questions: [], problem: 'empty' }
    parsed = JSON.parse(text)
  } catch {
    return { questions: [], problem: 'unavailable' }
  }
  if (!parsed || typeof parsed !== 'object') return { questions: [], problem: 'unknown' }

  const questions = []
  for (const [testament, key] of Object.entries(TESTAMENT_KEYS)) {
    const langs = parsed?.[key]?.languages
    if (!langs || typeof langs !== 'object') continue
    for (const language of QUIZ_LANGUAGES) {
      const list = Array.isArray(langs[language]) ? langs[language] : []
      for (const raw of list) {
        // normaliseQuestion rejects the "@@OT_EN@@" placeholder strings and any
        // entry with no options or an out-of-range answer, so a build marker
        // can never become an unanswerable card in the UI.
        const q = normaliseQuestion(raw, questions.length)
        if (q) questions.push({ ...q, testament, language })
      }
    }
  }

  if (!questions.length) return { questions: [], problem: 'empty' }
  return { questions, problem: '' }
}

/** Questions for one testament, in file order. */
export function questionsFor(questions, testament) {
  return (questions || []).filter((q) => q.testament === testament)
}

/** Honest, blame-free copy for each empty / failed state. */
export const QUIZ_EMPTY_COPY = {
  empty: {
    title: 'No questions available',
    text: 'There are no questions for this section and language yet. Try another combination - the other testament or another language may have them.'
  },
  'not-found': {
    title: 'Quiz questions are not published yet',
    text: 'The quiz data file could not be found. Once it is published, every question in it will appear here automatically.'
  },
  unavailable: {
    title: 'Could not load the quiz',
    text: 'The questions are stored on GitHub and the request did not go through. Check your connection and try again.'
  },
  unknown: {
    title: 'Could not load the quiz',
    text: 'Something unexpected happened while reading the questions. Please try again in a moment.'
  }
}

/* ======================================================================
   E-Books
   Books live in the Church-Books repo (`books/<folder>/`). Verified: the
   `urdu` folder currently holds `book1.pdf` (2.4 MB) plus a `book1.txt`
   placeholder; `urdu-paid` / `urdu-purchase` hold only .txt placeholders.

   So there IS a real PDF to read, but no written metadata yet. The screen
   reads whatever PDFs are present and shows a description only when the
   companion text actually has content - it never invents a summary.
   ====================================================================== */

const BOOKS_API =
  'https://api.github.com/repos/Church62626/Church-Books/contents/books'

/**
 * List the e-books in a folder.
 *
 * Resolves to `{ books, problem }` and never throws. Each book is
 * `{ id, file, title, description, pdfUrl, pageUrl, size }`.
 */
export async function fetchEBooks(folder = 'urdu') {
  let entries
  try {
    const res = await fetch(`${BOOKS_API}/${encodeURIComponent(folder)}`, {
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (res.status === 404) return { books: [], problem: 'not-found' }
    if (!res.ok) return { books: [], problem: 'unavailable' }
    entries = await res.json()
  } catch {
    return { books: [], problem: 'unavailable' }
  }
  if (!Array.isArray(entries)) return { books: [], problem: 'unknown' }

  const books = entries
    .filter((e) => e && e.type === 'file' && /\.pdf$/i.test(e.name || ''))
    .map((e) => ({
      id: `${folder}/${e.name}`,
      file: e.name,
      title: titleFor(e.name),
      // The published .txt companions are 1-byte placeholders, so an empty
      // description is the truthful answer rather than a defect.
      description: '',
      pdfUrl: e.download_url || '',
      pageUrl: e.html_url || '',
      size: Number(e.size) || 0
    }))
    .sort((a, b) => a.title.localeCompare(b.title))

  if (!books.length) return { books: [], problem: 'empty' }
  return { books, problem: '' }
}

/* ======================================================================
   Reading bookmarks

   A bookmark is `{ bookId, file, title, savedAt, page? }` where `page` is
   optional and only present when the viewer can report one.

   IMPORTANT LIMIT: the browser's native PDF viewer (used by <object>) does not
   expose the current page to JavaScript, so automatic page-position saving is
   not possible without bundling a full PDF engine (pdf.js). The bookmark
   therefore records the book and the time, which is honest and still useful,
   rather than a page number that would always be wrong.

   Storage: Firestore per user when signed in; localStorage otherwise, so a
   visitor who is not logged in keeps their bookmarks on the device instead of
   silently losing them.

   NOTE: the Firestore imports live in bookmarkStore.js, not here. Pulling
   firebase/app into this module would make every test that imports the apps
   catalogue fail under bare Node, because that package only resolves through
   the bundler. Keeping them apart leaves this file dependency-free.
   ====================================================================== */

const BOOKMARKS_COLLECTION = 'bookmarks'
const LOCAL_KEY = 'cip.ebookBookmarks'

/** Read the anonymous, device-local bookmarks. Never throws. */
export function localBookmarks() {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocalBookmarks(list) {
  try {
    globalThis.localStorage?.setItem(LOCAL_KEY, JSON.stringify(list))
  } catch {
    // Private mode / storage disabled: the bookmark simply will not persist.
  }
}

/**
 * Bookmark one book, without touching Firestore.
 *
 * Always writes to the device first, so a bookmark survives a network failure
 * and can be pushed to the cloud later. `saveBookmark` in bookmarkStore.js
 * layers the Firestore write on top of this.
 *
 * Returns `{ ok, reason }`.
 */
export function saveBookmarkLocal(book) {
  if (!book || !book.id) return { ok: false, reason: 'no-book' }
  const entry = {
    bookId: book.id,
    file: book.file || '',
    title: book.title || '',
    savedAt: Date.now()
  }
  const next = [entry, ...localBookmarks().filter((b) => b.bookId !== book.id)]
  writeLocalBookmarks(next)
  return { ok: true, reason: 'local', entry }
}

/** Read a single device-local bookmark, or null. */
export function readBookmarkLocal(bookId) {
  return localBookmarks().find((b) => b.bookId === bookId) || null
}

/** Remove a bookmark from the device store. */
export function removeBookmarkLocal(bookId) {
  writeLocalBookmarks(localBookmarks().filter((b) => b.bookId !== bookId))
}


/* ======================================================================
   LS Audio (Life-Study broadcasts)

   Verified: `hymns-audio-/LS` contains exactly ONE file, `urdu-ls.txt`,
   which is EMPTY (1 byte). There is no `life-study.json` and no
   `life-study1.mp3` in that folder, on either the pinned commit or main.

   The screen is wired to that folder so it fills itself the moment the
   broadcasts are uploaded. Until then it shows an honest empty state -
   inventing message titles or speakers would be fabricating content.
   ====================================================================== */

export const LS_REF = 'f5c472a8a083ddbf0f848e596e6d2cb21c43ea7e'

const LS_API =
  `https://api.github.com/repos/Church62626/hymns-audio-/contents/LS?ref=${LS_REF}`

/** Message number from a file name: `life-study12.mp3` -> 12 */
function lsNumber(file) {
  const m = String(file).match(/(\d+)(?=\.[a-z0-9]+$)/i)
  return m ? Number(m[1]) : null
}

/**
 * List the Life-Study broadcasts, pairing each audio file with its entry in
 * `life-study.json` when that metadata file exists.
 *
 * Resolves to `{ episodes, metaFound, problem }` and never throws.
 */
export async function fetchLsAudio() {
  let entries
  try {
    const res = await fetch(LS_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (res.status === 404) return { episodes: [], metaFound: false, problem: 'not-found' }
    if (!res.ok) return { episodes: [], metaFound: false, problem: 'unavailable' }
    entries = await res.json()
  } catch {
    return { episodes: [], metaFound: false, problem: 'unavailable' }
  }
  if (!Array.isArray(entries)) return { episodes: [], metaFound: false, problem: 'unknown' }

  const files = entries.filter((e) => e && e.type === 'file')

  // Metadata is optional: the broadcasts are still playable and are listed by
  // file name when `life-study.json` has not been published.
  let meta = null
  const metaFile = files.find((e) => /life[-_]?study\.json$/i.test(e.name || ''))
  if (metaFile?.download_url) {
    try {
      const res = await fetch(metaFile.download_url)
      const text = (await res.text()).trim()
      if (text) {
        const parsed = JSON.parse(text)
        meta = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.messages)
            ? parsed.messages
            : Array.isArray(parsed?.episodes)
              ? parsed.episodes
              : null
      }
    } catch {
      meta = null
    }
  }

  const audio = files.filter((e) => /\.(mp3|m4a|ogg|wav)$/i.test(e.name || ''))

  const episodes = audio
    .map((e) => {
      const no = lsNumber(e.name)
      const entry = Array.isArray(meta)
        ? meta.find((m) => Number(m.number ?? m.no ?? m.message) === no) || null
        : null
      return {
        id: e.name,
        number: no,
        file: e.name,
        title: entry?.title || `Life-Study ${no ?? e.name}`,
        speaker: entry?.speaker || '',
        description: entry?.description || entry?.notes || '',
        date: entry?.date || '',
        audioUrl: e.download_url || '',
        size: Number(e.size) || 0
      }
    })
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))

  if (!episodes.length) return { episodes: [], metaFound: Boolean(meta), problem: 'empty' }
  return { episodes, metaFound: Boolean(meta), problem: '' }
}



