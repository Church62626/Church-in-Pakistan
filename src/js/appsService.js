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
export const APPS_REF = '12c30250568ef447e5c37b1b12439f9f629a907e'

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

/**
 * Split the messages into the newest one and the archive.
 *
 * There is NO date field in `life-study.json` (verified: id, messageNumber,
 * page, title, duration, youtubeUrl, imagePath), so "newest" cannot mean most
 * recently added. `messageNumber` is the only monotonic ordering the data
 * offers - it is the book's own message sequence - so the highest number is
 * treated as the current daily message and the rest become history.
 *
 * With a single message published, that message is the current one and the
 * archive is legitimately empty rather than invented.
 */
export function splitLatestAndHistory(episodes) {
  const list = Array.isArray(episodes) ? episodes.slice() : []
  if (!list.length) return { latest: null, history: [] }

  // Already sorted by number in fetchLsAudio; take the last, but sort defensively
  // in case a hand-edited file arrives out of order.
  const ordered = list.slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  const latest = ordered[ordered.length - 1]
  const history = ordered.slice(0, -1).reverse()
  return { latest, history }
}

/**
 * Church content modules: Store, Events, About.
 *
 * Each is a hand-authored JSON read at runtime, so publishing an update needs
 * no redeploy:
 *   Store/store.json    { books:  [ { id, title, author, price, coverImage,
 *                                     description, downloadUrl } ] }
 *   Events/events.json  { events: [ { id, title, date, time, location,
 *                                     googleMapUrl, coordinates:{lat,lng},
 *                                     description, bannerImage } ] }
 *   About/about-us.json { organizationName, tagline, mission, history,
 *                         contact:{ email, phone, address } }
 *
 * Two verified quirks drive this design:
 *
 * 1. The image/PDF paths these files name do NOT exist yet (checked: all 404).
 *    Linking them would give visitors broken images and dead downloads, so the
 *    UI falls back to a placeholder instead of a broken icon.
 *
 * 2. `about-us.json` has NO leadership field, and deliberately so: the church
 *    holds there are no formal positions and all believers are simply brothers
 *    and sisters. No role rendering is added here - doing so would contradict
 *    the content. Any stale `leadership` key is ignored, never displayed.
 * ====================================================================== */

export const CONTENT_REF = 'main'
const CONTENT_RAW =
  `https://raw.githubusercontent.com/Church62626/Church-in-Pakistan/${CONTENT_REF}/`

const MODULES = {
  store: 'Store/store.json',
  events: 'Events/events.json',
  about: 'About/about-us.json'
}

async function loadJson(path) {
  try {
    const res = await fetch(CONTENT_RAW + path)
    if (!res.ok) return null
    const text = (await res.text()).trim()
    if (!text) return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * A "Get directions" link for an event.
 *
 * `coordinates` is preferred because it is unambiguous; otherwise the
 * author's `googleMapUrl` is used. Anything that is not a real maps link
 * yields '' so the control is hidden rather than pointing somewhere wrong.
 */
export function directionsUrl(event) {
  const lat = Number(event?.coordinates?.lat)
  const lng = Number(event?.coordinates?.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  }
  const raw = String(event?.googleMapUrl || '').trim()
  return /^https:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i.test(raw)
    ? raw
    : ''
}

/** Store books. */
export async function fetchStore() {
  const data = await loadJson(MODULES.store)
  const books = Array.isArray(data?.books) ? data.books : []
  return {
    books: books.map((b) => ({
      id: String(b?.id ?? b?.title ?? ''),
      title: String(b?.title || 'Untitled'),
      author: String(b?.author || ''),
      price: String(b?.price || ''),
      description: String(b?.description || ''),
      coverImage: b?.coverImage
        ? CONTENT_RAW + String(b.coverImage).replace(/^\/+/, '')
        : '',
      downloadUrl: b?.downloadUrl
        ? CONTENT_RAW + String(b.downloadUrl).replace(/^\/+/, '')
        : ''
    })),
    ok: Boolean(data)
  }
}

/** Church events, latest date first. */
export async function fetchEvents() {
  const data = await loadJson(MODULES.events)
  const events = Array.isArray(data?.events) ? data.events : []
  const out = events.map((e) => ({
    id: String(e?.id ?? e?.title ?? ''),
    title: String(e?.title || 'Untitled event'),
    date: String(e?.date || ''),
    time: String(e?.time || ''),
    location: String(e?.location || ''),
    description: String(e?.description || ''),
    directionsUrl: directionsUrl(e),
    bannerImage: e?.bannerImage
      ? CONTENT_RAW + String(e.bannerImage).replace(/^\/+/, '')
      : ''
  }))
  // Newest first. Undated entries sort last rather than jumping to the top.
  out.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return { events: out, ok: Boolean(data) }
}

/** About content. No leadership/roles are surfaced, by design. */
export async function fetchAbout() {
  const data = await loadJson(MODULES.about)
  if (!data) return { about: null, ok: false }
  return {
    about: {
      organizationName: String(data.organizationName || 'Church in Pakistan'),
      tagline: String(data.tagline || ''),
      mission: String(data.mission || ''),
      history: String(data.history || ''),
      contact: {
        email: String(data.contact?.email || ''),
        phone: String(data.contact?.phone || ''),
        address: String(data.contact?.address || '')
      }
    },
    ok: true
  }
}
export function formatSize(bytes) {
  const n = Number(bytes) || 0
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/* ======================================================================
   Apps manifest (apps.json)

   `church-apps/apps.json` is the richer, hand-authored catalogue:

     { apps: [ { id, appName, version, platform, description,
                 fileSize, downloadUrl, iconPath } ] }

   It carries the version, description and icon that a bare file listing
   cannot. When present it is the source of truth; otherwise the service falls
   back to listing the folder, so the Apps screen is never blank just because a
   manifest has not been written yet.

   IMPORTANT (verified): an entry may reference a file that is NOT in the
   folder - `apps.json` lists `lifestudy-v2.0.1.apk` and
   `icons/lifestudy-icon.png`, neither of which exists. Linking those blindly
   gives visitors a dead Download button, so every entry is checked against the
   real folder listing and `downloadOk` / `iconOk` report the result.
   ====================================================================== */

const APPS_MANIFEST_RAW =
  `https://raw.githubusercontent.com/${APPS_REPO}/${APPS_REF}/church-apps/apps.json`

/** Icons live under church-apps/ on GitHub's raw host. */
const APPS_ICON_RAW =
  `https://raw.githubusercontent.com/${APPS_REPO}/${APPS_REF}/church-apps/`

/** True when the manifest's downloadUrl points at a file that actually exists. */
function manifestFileExists(downloadUrl, filesInFolder) {
  if (!downloadUrl) return false
  // Compare the final path segment: the manifest may use an absolute raw URL,
  // a blob URL, or a bare file name.
  const tail = String(downloadUrl).split('/').pop().split('?')[0]
  return filesInFolder.includes(tail)
}

/** File names present in church-apps/ and church-apps/icons/. Never throws. */
async function listFolderFileNames() {
  const names = new Set()
  const add = async (url) => {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
      if (!res.ok) return
      const entries = await res.json()
      if (Array.isArray(entries)) {
        for (const e of entries) if (e && e.type === 'file') names.add(e.name)
      }
    } catch {
      // A failed listing just means fewer known files; never fatal.
    }
  }
  await add(CONTENTS_API)
  // Icons live in a subdirectory, so they are not in the top-level listing.
  await add(`${CONTENTS_API.replace('/contents/church-apps?', '/contents/church-apps/icons?')}`)
  return [...names]
}

/**
 * Load the hand-authored manifest, or null when absent/unreadable.
 * Never throws: a missing manifest is a normal state, not an error.
 */
export async function fetchAppsManifest() {
  try {
    const res = await fetch(APPS_MANIFEST_RAW)
    if (!res.ok) return null
    const text = (await res.text()).trim()
    if (!text) return null
    const parsed = JSON.parse(text)
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.apps) ? parsed.apps : [])
    return list.length ? list : null
  } catch {
    return null
  }
}

/**
 * The apps to show, preferring the manifest.
 *
 * Each entry keeps everything the manifest gave plus `downloadOk`, so the UI
 * can mark an app whose binary is missing instead of linking to a 404. APKs
 * found as loose files and not claimed by the manifest are appended, so a newly
 * dropped APK still shows up before someone writes a manifest entry for it.
 */
export async function fetchAppsRich() {
  const [manifest, fileNames] = await Promise.all([fetchAppsManifest(), listFolderFileNames()])
  const apks = fileNames.filter((n) => /\.apk$/i.test(n) && !NON_APP_FILES.test(n))

  const out = []
  const claimed = new Set()

  if (manifest) {
    for (const raw of manifest) {
      if (!raw || typeof raw !== 'object') continue
      const downloadUrl = String(raw.downloadUrl || '').trim()
      const tail = downloadUrl.split('/').pop().split('?')[0]
      if (tail) claimed.add(tail)
      const platformLabel = String(raw.platform || 'Download').trim()
      const lower = platformLabel.toLowerCase()
      const iconName = String(raw.iconPath || '').split('/').pop()
      out.push({
        id: String(raw.id ?? raw.appName ?? tail),
        name: String(raw.appName || raw.name || tail || 'App').trim(),
        version: String(raw.version || '').trim(),
        platform: {
          id: lower,
          label: platformLabel,
          icon: lower.includes('ios') ? '🍎' : lower.includes('android') ? '🤖' : '📦'
        },
        description: String(raw.description || '').trim(),
        fileSize: String(raw.fileSize || '').trim(),
        size: 0,
        downloadUrl,
        pageUrl: '',
        // An icon only counts when the file it names is really there.
        icon: iconName ? APPS_ICON_RAW + String(raw.iconPath).replace(/^\/+/, '') : '',
        iconOk: Boolean(iconName) && fileNames.includes(iconName),
        file: tail,
        downloadOk: manifestFileExists(downloadUrl, fileNames)
      })
    }
  }

  // Anything dropped into the folder that the manifest has not claimed yet.
  for (const name of apks) {
    if (claimed.has(name)) continue
    out.push({
      id: name,
      name: titleFor(name),
      version: '',
      platform: platformFor(name),
      description: '',
      fileSize: '',
      size: 0,
      downloadUrl:
        `https://raw.githubusercontent.com/${APPS_REPO}/${APPS_REF}/church-apps/${encodeURIComponent(name)}`,
      pageUrl: '',
      icon: '',
      iconOk: false,
      file: name,
      downloadOk: true
    })
  }

  return { apps: out, fromManifest: Boolean(manifest) }
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

   Source: `hymns-audio-/LS` at commit 5ca9a2e, which now contains:
     life-study.json          - the metadata for every message
     philippians-msg-20.jpg   - a companion image asset

   ACTUAL schema of life-study.json (checked, not assumed):
     { bookTitle, testament, language,
       messages: [ { id, messageNumber, page, title, duration,
                     youtubeUrl, imagePath } ] }

   So messages come from the JSON, NOT from scanning for audio files: the
   folder holds no .mp3 at all. Each message is played from its `youtubeUrl`
   in an embedded player.

   IMAGE PATH QUIRK (verified): the JSON's `imagePath` ("genesis-msg-01.jpg")
   does NOT match a file in the folder ("philippians-msg-20.jpg"), and the
   message is number 20. Rather than link a 404, `resolveImage` prefers an
   asset whose name contains the message number and only falls back to
   `imagePath` when nothing matches - so the Read button works today and keeps
   working if the data is later corrected.
   ====================================================================== */

export const LS_REF = '5ca9a2e0be130e5cfec15ef33ec80817bf2314b4'

const LS_API =
  `https://api.github.com/repos/Church62626/hymns-audio-/contents/LS?ref=${LS_REF}`

const LS_RAW_BASE =
  `https://raw.githubusercontent.com/Church62626/hymns-audio-/${LS_REF}/LS`

/** Message number from a file name: `philippians-msg-20.jpg` -> 20 */
function numberFromName(file) {
  const m = String(file).match(/msg[-_]?(\d+)/i)
  return m ? Number(m[1]) : null
}

/**
 * Resolve a message's companion image.
 *
 * The published `imagePath` is currently wrong, so an asset matching the
 * message number wins. Returns '' when nothing matches, which the UI shows as
 * "no image" rather than a broken image icon.
 */
function resolveImage(rawPath, messageNumber, assets) {
  // `assets` is a list of file NAMES, so match on the entry itself. Reading
  // `a.name` here silently yielded undefined and no image ever resolved.
  const byNumber = assets.find((name) => numberFromName(name) === messageNumber)
  if (byNumber) return byNumber
  if (rawPath && assets.includes(rawPath)) return rawPath
  return ''
}

/** Turn a YouTube watch/share URL into an embeddable one. '' if unusable. */
export function youtubeEmbedUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  // watch?v=ID
  let m = raw.match(/[?&]v=([A-Za-z0-9_-]{6,})/)
  if (m) return `https://www.youtube.com/embed/${m[1]}`
  // youtu.be/ID or /embed/ID or /shorts/ID
  m = raw.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) ||
      raw.match(/\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{6,})/)
  if (m) return `https://www.youtube.com/embed/${m[1]}`
  return ''
}

/**
 * List the Life-Study messages with their companion image.
 *
 * Resolves to `{ episodes, book, problem }` and never throws. `problem` is one
 * of 'unavailable' | 'not-found' | 'empty' | 'unknown'.
 */
export async function fetchLsAudio() {
  let entries
  try {
    const res = await fetch(LS_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (res.status === 404) return { episodes: [], book: null, problem: 'not-found' }
    if (!res.ok) return { episodes: [], book: null, problem: 'unavailable' }
    entries = await res.json()
  } catch {
    return { episodes: [], book: null, problem: 'unavailable' }
  }
  if (!Array.isArray(entries)) return { episodes: [], book: null, problem: 'unknown' }

  const files = entries.filter((e) => e && e.type === 'file')
  const assets = files
    .filter((e) => /\.(jpe?g|png|webp)$/i.test(e.name || ''))
    .map((e) => e.name)

  const metaFile = files.find((e) => /life[-_]?study\.json$/i.test(e.name || ''))
  if (!metaFile?.download_url) {
    return { episodes: [], book: null, problem: 'empty' }
  }

  let data
  try {
    const text = (await (await fetch(metaFile.download_url)).text()).trim()
    if (!text) return { episodes: [], book: null, problem: 'empty' }
    data = JSON.parse(text)
  } catch {
    return { episodes: [], book: null, problem: 'unknown' }
  }

  const list = Array.isArray(data) ? data : (Array.isArray(data?.messages) ? data.messages : [])
  const book = {
    title: data?.bookTitle || 'Life-Study',
    testament: data?.testament || '',
    language: data?.language || 'english'
  }

  const episodes = list
    .map((m) => {
      const no = Number(m?.messageNumber ?? m?.number ?? m?.id)
      const image = resolveImage(m?.imagePath, Number.isFinite(no) ? no : null, assets)
      return {
        id: String(m?.id ?? no ?? Math.random()),
        number: Number.isFinite(no) ? no : null,
        title: m?.title || (Number.isFinite(no) ? `Message ${no}` : 'Untitled message'),
        duration: m?.duration || '',
        page: m?.page ?? null,
        // The embed URL is precomputed and validated here; an unusable link
        // never reaches the template, so no iframe with a broken src is built.
        embedUrl: youtubeEmbedUrl(m?.youtubeUrl),
        youtubeUrl: m?.youtubeUrl || '',
        imageName: image,
        imageUrl: image ? `${LS_RAW_BASE}/${encodeURI(image)}` : ''
      }
    })
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))

  if (!episodes.length) return { episodes: [], book, problem: 'empty' }
  return { episodes, book, problem: '' }
}



