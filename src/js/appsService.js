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
 * Pinned to the commit the Products menu link points at. Using a branch here
 * would let the catalogue change without a deploy; pinning keeps what a visitor
 * sees stable.
 */
export const APPS_REF = '5ed70b2fb5a4514eba8fc8a5051ea5ab8795fdda'

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
   The questions live in `bible-quiz/` in the main repo and are read at
   runtime, so publishing questions needs no redeploy.

   Schema:
     { questions: [ {
         id, testament: 'Old Testament' | 'New Testament',
         language: 'english' | 'urdu' | 'chinese',
         question, options: [4 strings],
         correctAnswerIndex: 0..3,
         explanation
     } ] }

   IMPORTANT: `bible-quiz/bible-quiz.json` is currently EMPTY (1 byte) on both
   the pinned commit and main. The screen therefore renders an honest "no
   questions published yet" state. It deliberately does NOT ship invented
   questions - fabricating scripture, and especially an answer key someone is
   then taught from, is not something to do silently.
   ====================================================================== */

export const QUIZ_REPO = 'Church62626/Church-in-Pakistan'
export const QUIZ_PATH = 'bible-quiz'
export const QUIZ_REF = '1927c8e95dcadb6161acc990aaa8250005e694cd'

/** The two sections the quiz is split into. */
export const TESTAMENTS = ['Old Testament', 'New Testament']

/** Languages the quiz is authored in. */
export const QUIZ_LANGUAGES = ['english', 'urdu', 'chinese']

const QUIZ_API =
  `https://api.github.com/repos/${QUIZ_REPO}/contents/${QUIZ_PATH}?ref=${QUIZ_REF}`

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
 * Load the quiz questions.
 *
 * Resolves to `{ questions, problem }` and never throws: an empty or missing
 * data file is a normal state for the screen to explain, not an exception.
 * `problem` is one of 'unavailable' | 'not-found' | 'empty' | 'unknown'.
 */
export async function fetchQuizQuestions() {
  let entries
  try {
    const res = await fetch(QUIZ_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (res.status === 404) return { questions: [], problem: 'not-found' }
    if (!res.ok) return { questions: [], problem: 'unavailable' }
    entries = await res.json()
  } catch {
    return { questions: [], problem: 'unavailable' }
  }
  if (!Array.isArray(entries)) return { questions: [], problem: 'unknown' }

  const files = entries
    .filter((e) => e && e.type === 'file' && /\.json$/i.test(e.name || ''))
    .map((e) => ({ url: e.download_url || '', name: e.name }))

  if (!files.length) return { questions: [], problem: 'not-found' }

  const loaded = await Promise.all(
    files.map(async (f) => {
      if (!f.url) return []
      try {
        const res = await fetch(f.url)
        // An empty file returns 200 with an empty body. That is "nothing here",
        // not a parse failure, so the message stays accurate.
        const text = (await res.text()).trim()
        if (!text) return []
        const parsed = JSON.parse(text)
        if (Array.isArray(parsed)) return parsed
        return Array.isArray(parsed?.questions) ? parsed.questions : []
      } catch {
        // One unreadable file must not blank the rest of the quiz.
        return []
      }
    })
  )

  const questions = loaded
    .flat()
    .map((raw, i) => normaliseQuestion(raw, i))
    .filter(Boolean)

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
    title: 'No questions published yet',
    text: 'The quiz data file exists but is still empty. Questions will appear here automatically as soon as they are added.'
  },
  'not-found': {
    title: 'Quiz questions are not published yet',
    text: 'There is no quiz data file in the repository yet. Once one is added, every question in it will show up here.'
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



