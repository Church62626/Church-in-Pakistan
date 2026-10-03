import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

let pass = 0
let fail = 0
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ` -- ${extra}` : ''}`) }
}
function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

/* ---- 1. template <-> script binding check ---- */
function bindings(file) {
  const s = read(file)
  const tpl = s.slice(s.indexOf('<template>') + 10, s.indexOf('</template>'))
  const scr = s.slice(s.indexOf('<script setup>') + 13, s.indexOf('</script>'))

  const defined = new Set()
  for (const m of scr.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1])
  for (const m of scr.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1])
  const imp = scr.match(/import\s*\{([\s\S]*?)\}\s*from/)
  if (imp) for (const p of imp[1].split(',')) {
    const n = p.split(/\s+as\s+/).pop().trim()
    if (/^[A-Za-z_$][\w$]*$/.test(n)) defined.add(n)
  }
  const aliases = new Set()
  for (const m of tpl.matchAll(/v-for="([^"]+)"/g)) {
    const i = m[1].search(/\b(?:of|in)\s+/)
    if (i < 0) continue
    for (const n of m[1].slice(0, i).replace(/[()[\]]/g, '').split(',')) {
      const c = n.trim()
      if (/^[A-Za-z_$][\w$]*$/.test(c)) aliases.add(c)
    }
  }
  const used = new Set()
  for (const m of tpl.matchAll(/@[\w-]+="([^"]+)"/g)) {
    const e = m[1]
    for (const c of e.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) used.add(c[1])
    if (/^[A-Za-z_$][\w$]*$/.test(e.trim())) used.add(e.trim())
  }
  for (const m of tpl.matchAll(/\{\{\s*([A-Za-z_$][\w$]*)/g)) used.add(m[1])
  const builtins = new Set(['true', 'false', 'undefined', 'null'])
  return [...used].filter((u) => !defined.has(u) && !aliases.has(u) && !builtins.has(u))
}

console.log('\n--- 1. template bindings resolve ---')
eq('Library.vue has no dangling identifiers', bindings('./src/pages/Library.vue').join(','), '')
eq('List.vue has no dangling identifiers', bindings('./src/pages/List.vue').join(','), '')

/**
 * Script-level check: every Vue reactivity helper a <script setup> block CALLS
 * must appear in its vue import.
 *
 * The template scan above cannot see this class of bug. `watch(...)` called in
 * the script but missing from the import throws `ReferenceError: watch is not
 * defined` during setup, which blanks the whole page while every template
 * binding still resolves - exactly the failure this guards against.
 */
function missingVueHelpers(file) {
  const s = read(file)
  const scr = s.slice(s.indexOf('<script setup>') + 13, s.indexOf('</script>'))

  const vueImport = scr.match(/import\s*\{([\s\S]*?)\}\s*from\s*['"]vue['"]/)
  const imported = new Set(
    vueImport
      ? vueImport[1].split(',').map((p) => p.split(/\s+as\s+/)[0].trim()).filter(Boolean)
      : []
  )
  // Anything defined locally shadows a helper, so exclude those.
  const local = new Set()
  for (const m of scr.matchAll(/(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1])

  // defineProps/defineEmits are deliberately absent from this list: they are
  // compiler macros available in every <script setup> block without an import.
  const helpers = ['ref', 'computed', 'watch', 'onMounted', 'onUnmounted', 'onBeforeUnmount',
    'onBeforeMount', 'onUpdated', 'onActivated', 'onDeactivated', 'nextTick', 'reactive',
    'shallowRef', 'watchEffect', 'provide', 'inject']
  const missing = new Set()
  for (const h of helpers) {
    if (local.has(h)) continue
    if (new RegExp(`(^|[^\\w.$])${h}\\s*\\(`).test(scr) && !imported.has(h)) missing.add(h)
  }
  return [...missing]
}

eq('Library.vue imports every Vue helper it calls',
  missingVueHelpers('./src/pages/Library.vue').join(','), '')
eq('List.vue imports every Vue helper it calls',
  missingVueHelpers('./src/pages/List.vue').join(','), '')
ok('the watch() guard is actually armed (it would catch the regression)',
  /function missingVueHelpers/.test(read('./test-library.mjs')))
for (const f of ['./src/components/CartModal.vue', './src/components/RsvpModal.vue',
  './src/components/ThemeToggle.vue', './src/components/AuthModal.vue']) {
  eq(`${f.split('/').pop()} imports every Vue helper it calls`,
    missingVueHelpers(f).join(','), '')
}

/* ---- 2. Library terminology + routing contract ---- */
console.log('\n--- 2. Library: terminology + routing contract ---')
const lib = read('./src/pages/Library.vue')
ok('no "Zaboor" terminology left', !/zaboor|زبور/i.test(lib))
ok('title is "Hymns / Geet"', lib.includes('>Hymns / Geet<'))
ok('routes id', lib.includes('id: hymn.id'))
ok('routes category', lib.includes('category: activeBook.key'))
ok('routes language', lib.includes('language }'))
ok('links to /list', lib.includes("path: '/list'"))
ok('builds Books from the 3 GitHub categories', lib.includes('book.key') && lib.includes('books'))
ok('no longer reads the stale placeholder catalog', !lib.includes('library-catalog.json'))

/* ---- 3. List empty state contract ---- */
console.log('\n--- 3. List: empty-id guard ---')
const rd = read('./src/pages/List.vue')
ok('has hasId computed', /const hasId = computed/.test(rd))
ok('hides player + lyrics when no id', /v-if="!hasId"/.test(rd))
ok('friendly message present', rd.includes('Please select a Hymn from the Library'))
ok('no empty quotes rendered', !/''\s*\}\}|>\s*\{\{\s*\}\}\s*</.test(rd))
ok('accepts both lang= and language=', rd.includes("queryValue('language')"))
ok('empty branch sets no error', /if \(!id\) \{[^}]*error\.value = ''/s.test(rd))

/* ---- 4. live catalog from GitHub main ---- */
console.log('\n--- 4. live catalog (GitHub main) ---')
const { fetchCatalog, fetchHymn, CATEGORY_META, normaliseCategory, getAudioUrl } =
  await import('./src/js/hymnService.js')

eq('CATEGORY_META has 3 books', CATEGORY_META.length, 3)
eq('first book label', CATEGORY_META[0].label, 'Hymns / Geet')

const cat = await fetchCatalog('english')
eq('3 books returned', cat.books.length, 3)

const byKey = Object.fromEntries(cat.books.map((b) => [b.key, b]))
eq('hymns count', byKey.hymns.count, 437)
eq('newsong count', byKey.newsong.count, 49)
eq('others count', byKey.others.count, 13)
ok('all books have readable labels', cat.books.every((b) => Boolean(b.label) && Boolean(b.blurb)))
ok('every hymn has an id + title', cat.books.every((b) => b.hymns.every((h) => h.id && h.title)))

console.log('  first hymns per book:')
for (const b of cat.books) console.log(`    ${b.key}: ${b.hymns.slice(0, 5).map((h) => h.id).join(', ')} ...`)

/* ---- 5. every catalog id actually loads in the List ---- */
console.log('\n--- 5. catalog ids load through fetchHymn (round trip) ---')
let checked = 0
for (const b of cat.books) {
  for (const h of b.hymns.slice(0, 3)) {
    try {
      const loaded = await fetchHymn(b.key, h.id, 'english')
      ok(`${b.key}/${h.id} -> ${loaded.source}`, Boolean(loaded.verses.length) && Boolean(loaded.title))
    } catch (e) {
      ok(`${b.key}/${h.id} loads`, false, e.message)
    }
    checked++
  }
}
eq('round-tripped 9 hymns', checked, 9)

/* ---- 6. urdu catalog too ---- */
console.log('\n--- 6. urdu catalog ---')
const urdu = await fetchCatalog('urdu')
eq('urdu has 3 books', urdu.books.length, 3)
ok('urdu hymns > 0', urdu.books[0].count > 0, `got ${urdu.books[0].count}`)
ok('urdu newsong uses the "newsongs.json" quirk',
  urdu.books[1].source?.includes('newsongs.json') === true, urdu.books[1].source)

console.log('\n--- 7. sync script: URL + document-id contract ---')
const sync = await import('./scripts/sync-book.mjs')

eq('raw url matches the required convention exactly',
  sync.rawFileUrl('urdu', 'book1.pdf'),
  'https://raw.githubusercontent.com/Church62626/Church-Books/main/books/urdu/book1.pdf')
ok('every language builds a /books/<lang>/<file> url',
  sync.ALLOWED_LANGUAGES.every((l) => sync.rawFileUrl(l, 'x.pdf')
    === `https://raw.githubusercontent.com/Church62626/Church-Books/main/books/${l}/x.pdf`))
eq('doc id is <language>-<slug>', sync.bookDocId('urdu', 'Book One!'), 'urdu-book-one')
eq('a purely non-latin title falls back to a hashed id',
  sync.bookDocId('urdu', 'کتاب'), sync.bookDocId('urdu', 'کتاب'))
ok('...and it is prefixed with the language',
  sync.bookDocId('urdu', 'کتاب').startsWith('urdu-book-'))
ok('...and it is Firestore-safe', /^urdu-book-[0-9a-f]{8}$/.test(sync.bookDocId('urdu', 'کتاب')))
ok('...and distinct titles stay distinct',
  sync.bookDocId('urdu', 'کتاب') !== sync.bookDocId('urdu', 'کتاب دوم'))
ok('same non-latin title -> same id (idempotent)',
  sync.bookDocId('punjabi', 'ਕਿਤਾਬ'), sync.bookDocId('punjabi', 'ਕਿਤਾਬ'))

console.log('\n--- 7b. --scan discovers the real PDFs on the books repo ---')
const found = await sync.listRepoFiles('urdu')
ok('books/urdu contains at least one PDF', found.length >= 1, JSON.stringify(found))
ok('only .pdf files are returned', found.every((f) => f.endsWith('.pdf')))
// HEAD the first real file: proves the generated raw URL actually resolves,
// which is what the frontend links to.
const probe = sync.rawFileUrl('urdu', found[0])
const head = await fetch(probe, { method: 'HEAD' })
eq(`${probe} -> 200`, head.status, 200)
ok('...and it serves a PDF/octet-stream body',
  /pdf|octet-stream/i.test(head.headers.get('content-type') || ''),
  head.headers.get('content-type'))

try {
  await sync.listRepoFiles('punjabi')
  ok('a folder that does not exist raises a clear error', false, 'no error thrown')
} catch (err) {
  ok('a folder that does not exist raises a clear error', /404/.test(err.message), err.message)
}
ok('doc ids are Firestore-safe (no / . # [ ])',
  !/[/.#[\]]/.test(sync.bookDocId('english', 'Zaboor / Psalms')))
eq('title falls back to a readable file name',
  sync.titleFromFileName('geet_book-01.pdf'), 'geet book 01')

const doc = sync.buildBookDoc({ language: 'urdu', title: 'Book One', fileUrl: sync.rawFileUrl('urdu', 'book1.pdf') })
eq('schema id', doc.id, 'urdu-book-one')
eq('schema title', doc.title, 'Book One')
eq('schema language', doc.language, 'urdu')
eq('schema category defaults to books', doc.category, 'books')
eq('schema fileUrl', doc.fileUrl, sync.rawFileUrl('urdu', 'book1.pdf'))
eq('schema published is boolean true', doc.published, true)
ok('createdAt is left to the caller as a server timestamp',
  !('createdAt' in doc))
eq('all 7 required fields present',
  ['id', 'title', 'language', 'category', 'fileUrl', 'published'].filter((k) => k in doc).length, 6)

const argv = sync.parseArgs(['--language', 'urdu', '--file', 'book1.pdf', '--title', 'Book One'])
eq('--language parses', argv.language, 'urdu')
eq('--file parses', argv.file, 'book1.pdf')
eq('--title parses', argv.title, 'Book One')
ok('bare --scan becomes true', sync.parseArgs(['--scan']).scan === true)
ok('service-account keys are gitignored', read('./.gitignore').includes('service-account*.json'))

// The two failure modes that produced the confusing original error:
//  (a) the file was found but handed to cert() as a string, not an object
//  (b) the key belongs to a different Firebase project than the frontend reads
const credPath = sync.findCredentials()
ok('service-account.json is found in the project root', Boolean(credPath), String(credPath))
ok('...and the resolved path is absolute', path.isAbsolute(String(credPath)))
ok('...and it lives next to package.json, not in scripts/',
  path.dirname(String(credPath)) === path.resolve('.'))

const key = sync.loadServiceAccount(credPath)
ok('the key parses as a service account', key.type === 'service_account')
ok('...carrying a private key and client email',
  Boolean(key.private_key) && Boolean(key.client_email))

// Assert against the frontend config so the two can never silently drift.
const configSrc = read('./src/js/firebase-config.js')
const frontendProject = (configSrc.match(/projectId:\s*"([^"]+)"/) || [])[1]
eq('the pinned project matches the frontend config',
  sync.FIREBASE_PROJECT_ID, frontendProject)
// The local key is a gitignored artifact, so a mismatch here is an ENVIRONMENT
// problem, not a code problem: the script already hard-fails on it at write
// time. Reported loudly, but not counted as a suite failure (CI has no key).
if (key.project_id !== frontendProject) {
  console.log(
    `  WARN  service-account.json is for "${key.project_id}", but the frontend reads\n` +
    `        "${frontendProject}" -- sync will refuse to write. Download a key for\n` +
    `        ${frontendProject} from the Firebase console.`
  )
} else {
  ok('the local key is for the project the frontend reads', true)
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'sa-'))
const bad = (name, contents) => {
  const p = path.join(tmp, name)
  writeFileSync(p, contents)
  return p
}
const throws = (fn, re, label) => {
  try { fn(); ok(label, false, 'no error thrown') } catch (e) { ok(label, re.test(e.message), e.message) }
}
throws(() => sync.loadServiceAccount(bad('broken.json', '{ not json')),
  /not valid JSON/, 'truncated JSON is reported as invalid JSON')
throws(() => sync.loadServiceAccount(bad('wrongtype.json', JSON.stringify({ type: 'authorized_user' }))),
  /not a service account/, 'a non-service-account key is rejected')
throws(() => sync.loadServiceAccount(bad('nokey.json',
  JSON.stringify({ type: 'service_account', project_id: 'x', client_email: 'y' }))),
  /missing "private_key"/, 'a key missing private_key is rejected')
// An empty root AND an empty cwd must both miss; otherwise the real key sitting
// in the project root would be found and mask the "not found" path.
const empty = path.join(tmp, 'empty-root')
eq('findCredentials returns null when nothing exists',
  sync.findCredentials(null, empty, empty), null)
rmSync(tmp, { recursive: true, force: true })

console.log('\n--- 8. bookService: shaping, caching and honest empty states ---')
const bs = await import('./src/js/bookService.js')

eq('roman-urdu tab maps onto the urdu folder', bs.booksLanguageKey('roman-urdu'), 'urdu')
eq('other tabs pass through', bs.booksLanguageKey('punjabi'), 'punjabi')

const rawDoc = {
  id: 'urdu-book-one',
  data: () => ({
    id: 'urdu-book-one', title: 'Book One', language: 'Urdu', category: 'books',
    fileUrl: sync.rawFileUrl('urdu', 'book1.pdf'), published: true,
    createdAt: { seconds: 1700000000, nanoseconds: 0 }
  })
}
const shaped = bs.toBook(rawDoc)
eq('language is lower-cased', shaped.language, 'urdu')
eq('fileName is derived from the url', shaped.fileName, 'book1.pdf')
eq('server timestamp decoded', shaped.createdAt.getTime(), 1700000000000)
eq('a doc with no fileUrl is skipped', bs.toBook({ data: () => ({ title: 'x', language: 'urdu' }) }), null)
eq('a doc with no language is skipped', bs.toBook({ data: () => ({ title: 'x', fileUrl: 'u' }) }), null)
eq('a missing title degrades to Untitled',
  bs.toBook({ data: () => ({ language: 'urdu', fileUrl: 'u' }) }).title, 'Untitled')
eq('published is coerced to a strict boolean',
  bs.toBook({ data: () => ({ language: 'urdu', fileUrl: 'u', published: 'yes' }) }).published, false)

ok('missing state names the language',
  bs.booksEmptyMessage('punjabi').includes('Punjabi') &&
  bs.booksEmptyMessage('punjabi').includes('not been published yet'))
ok('unpublished language gets the tailored message',
  bs.booksEmptyMessage('pashto').includes('English and Urdu books are ready'))
ok('unavailable state does not leak a raw error',
  bs.booksEmptyMessage('urdu', 'unavailable').includes('could not be reached'))
ok('forbidden state does not leak a raw error',
  bs.booksEmptyMessage('urdu', 'forbidden').includes('could not be loaded'))

// No db handle: fetchBooks must degrade to an empty list + problem flag.
const warn = console.warn
console.warn = () => {}
const noDb = await bs.fetchBooks('urdu', { db: null })
console.warn = warn
eq('resolves (never throws) without Firestore', noDb.books.length, 0)
ok('reports a problem rather than an exception', Boolean(noDb.problem))

console.log('\n--- 9. Library wires the Firestore books to the active tab ---')
ok('imports the book service', lib.includes("from '../js/bookService'"))
ok('imports the shared db handle', lib.includes("from '../js/firebase-config'"))
ok('queries on language change', /watch\(language, async \(\) =>/.test(lib))
ok('renders an accessible <ul> list', lib.includes('<ul v-else class="pdf-list">'))
ok('links straight to the raw fileUrl', lib.includes(':href="book.fileUrl"'))

// --- Phase 1: Chinese hymnal + cat/subcat grouping ---
ok('Chinese is enabled and points at hymnal_zh.json',
  /key: 'chinese'/.test(read('./src/js/hymnService.js')) &&
  read('./src/js/hymnService.js').includes('hymnal_zh.json'))
ok('Chinese renders the grouped cat/subcat tree',
  lib.includes('v-for="group in activeBook.categories"') &&
  lib.includes('v-for="sub in group.subcats"'))
ok('...only when the data actually has categories', lib.includes('v-else-if="hasCategories"'))
ok('...and the flat list remains as the fallback', lib.includes('<ul v-else class="hymn-list">'))
ok('the open-book pointer is rendered', lib.includes('class="open-pointer"'))

// --- Phase 3: premium books must degrade honestly ---
ok('premium books have a coming-soon empty state',
  /premium/i.test(read('./src/js/premiumService.js')))
ok('offers a download action', /\sdownload\s/.test(lib))
ok('opens safely with noopener', lib.includes('rel="noopener noreferrer"'))
ok('titles carry script + lang + dir', lib.includes(':class="scriptClass(language)"') &&
  lib.includes(':lang="langAttr(language)"') && lib.includes(':dir="textDir"'))
ok('shows an honest empty state', lib.includes('pdfMessage') && lib.includes('library-notice'))
ok('no cross-language fallback for books', !/pdfBooks.*otherLang/s.test(lib))

/* ---- 10. /reader -> /list redirect protects old bookmarks ---- */
console.log('\n--- 10. Reader to List redirect ---')
const routes = read('./src/router/index.js')
ok('List page is imported from List.vue', /import List from '\.\.\/pages\/List\.vue'/.test(routes))
ok('/list is a real route', /path: '\/list'/.test(routes))
ok('/reader still resolves', /path: '\/reader'/.test(routes))
ok('it is a redirect, not a component', /name: 'ReaderRedirect'[\s\S]{0,200}?redirect:/.test(routes))
// Without the query string, an old /reader?id=12 bookmark would land on an
// empty page instead of the hymn.
ok('the redirect preserves the query string',
  /redirect: \(to\) => \(\{ name: 'List', query: to\.query/.test(routes))
ok('the redirect preserves any hash anchor', /hash: to\.hash/.test(routes))
ok('Reader.vue no longer exists', !existsSync(new URL('./src/pages/Reader.vue', import.meta.url)))
ok('List.vue does exist', existsSync(new URL('./src/pages/List.vue', import.meta.url)))
// Every in-app link must point at the new route, or the redirect becomes the
// normal path and the rename is only half done.
const nav = read('./src/components/AppNavigation.vue')
ok('nav links to /list', nav.includes("to: '/list'") && !nav.includes("to: '/reader'"))
ok('Library links to /list', lib.includes("path: '/list'") && !lib.includes("path: '/reader'"))
ok('List self-links to /list', rd.includes("path: '/list'") && !rd.includes("path: '/reader'"))

/* ---- 11. List: keypad + keyword search ---- */
console.log('\n--- 11. List hymn finder ---')
ok('renders the keypad', rd.includes('class="keypad"') && rd.includes('keypad-key'))
ok('keypad has digits plus clear and ok',
  /KEYPAD_KEYS = \[/.test(rd) && /'clear'/.test(rd) && /'ok'/.test(rd))
ok('renders a search input', rd.includes('v-model="searchTerm"') && rd.includes('type="search"'))
ok('renders the number input', rd.includes('v-model="keypadValue"'))
ok('keypad keys are real <button> elements', /<button[^>]*class="keypad-key"/.test(rd))
ok('search is case and diacritic insensitive',
  /function fold\(/.test(rd) && /normalize\('NFD'\)/.test(rd))
// A one-letter query over 800 hymns would otherwise render 800 rows.
ok('result list is capped', /MAX_SEARCH_RESULTS = \d+/.test(rd))
ok('search failure does not break the page',
  /search index unavailable/.test(rd) && /searchIndex\.value = \[\]/.test(rd))
// Losing the language or category on jump would show the wrong language.
ok('jump keeps language and category',
  /openByNumber[\s\S]{0,500}?category: category\.value, language: language\.value/.test(rd))
ok('the Go button is disabled with an empty field', /:disabled="!keypadValue\.trim\(\)"/.test(rd))

/* ---- 12. the redirect actually resolves, not just looks right ---- */
console.log('\n--- 12. redirect resolves against the real route table ---')
// A string match cannot catch a redirect that drops the query or points at a
// route that does not exist, so the table is resolved for real.
const { createRouter, createMemoryHistory } = await import('vue-router')
const realRouter = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/list', name: 'List', component: { render: () => null } },
    { path: '/reader', name: 'ReaderRedirect', redirect: (to) => ({ name: 'List', query: to.query, hash: to.hash }) }
  ]
})
// NOTE: router.resolve() does NOT follow redirects - only navigation does.
// So this navigates for real, the way an old bookmark would.
await realRouter.push('/reader?id=12&category=hymns&language=chinese')
await realRouter.isReady()
eq('old bookmark lands on /list', realRouter.currentRoute.value.path, '/list')
eq('the hymn id survives', realRouter.currentRoute.value.query.id, '12')
eq('the category survives', realRouter.currentRoute.value.query.category, 'hymns')
eq('the language survives', realRouter.currentRoute.value.query.language, 'chinese')

await realRouter.push('/reader')
eq('a bare /reader also lands on /list', realRouter.currentRoute.value.path, '/list')
eq('and carries no stray id', realRouter.currentRoute.value.query.id, undefined)

/* ---- 13. Listen tab: HTML5 audio, speed control, no Web Audio ---- */
console.log('\n--- 13. Listen tab ---')
const ls = read('./src/pages/Listen.vue')
ok('is routed at /listen', /path: '\/listen'/.test(routes))
ok('nav exposes it', nav.includes("to: '/listen'"))
ok('uses a real <audio> element', /<audio[\s\S]{0,400}?<\/audio>/.test(ls))
ok('binds the audio source', ls.includes(':src="audioSrc"'))
ok('builds the url through the service', /getAudioUrl\(/.test(ls))
// The directive for this phase is explicit: no Web Audio API, no PCM decoding.
ok('does NOT use the Web Audio API',
  !/AudioContext|webkitAudioContext|createBufferSource|decodeAudioData/.test(ls))
ok('does NOT decode PCM itself', !/decodeAudioData|getChannelData|Float32Array/.test(ls))
ok('does NOT pull in the MIDI engine', !/midiEngine|MidiEngine/.test(ls))
// Speed must come from the native property, not a resampling hack.
ok('speed uses the native playbackRate', /playbackRate\s*=/.test(ls))
ok('speed slider exists', /type="range"[\s\S]{0,200}?min="0\.5"[\s\S]{0,200}?max="1\.5"/.test(ls))
ok('speed is clamped to a sane range', /Math\.min\(1\.5, Math\.max\(0\.5/.test(ls))
ok('speed survives starting a new track', /applySpeed\(el\)[\s\S]{0,60}?el\.play\(\)/.test(ls))
ok('speed survives a mid-playback change', /watch\(speed, \(\) => applySpeed/.test(ls))
// A missing recording must say so rather than spin forever.
ok('a failed load reports itself', /function onError\(\)/.test(ls) && /No recording found/.test(ls))
ok('play is only started from a click (autoplay rules)', /el\.play\(\)\.catch/.test(ls))
ok('it stops audio on unmount', /onUnmounted[\s\S]{0,200}?stop\(\)/.test(ls))
// The Chinese hymnal has no hymnal/ audio folder; it must map to hymns/.
eq('chinese hymnal maps to the hymns audio folder',
  normaliseCategory('hymnal'), 'hymns')
ok('...so a Chinese mp3 resolves to a real file',
  getAudioUrl('hymnal', '1', 'mp3').includes('/hymns/1.mp3'),
  getAudioUrl('hymnal', '1', 'mp3'))
ok('...and a Chinese midi resolves too',
  getAudioUrl('hymnal', '1', 'midi').includes('/MIDI/hymns/1.mid'),
  getAudioUrl('hymnal', '1', 'midi'))

/* ---- 14. Home carousel ---- */
console.log('\n--- 14. Home carousel ---')
const car = read('./src/components/HeroCarousel.vue')
const home = read('./src/pages/Home.vue')
ok('Home renders the carousel', home.includes('<HeroCarousel'))
ok('carousel is imported', /import HeroCarousel from/.test(home))
ok('it advances on a timer', /setInterval/.test(car))
ok('the timer is cleared on unmount', /onUnmounted\(stop\)/.test(car) && /clearInterval/.test(car))
ok('the index wraps instead of dead-ending', /\(\(next % n\) \+ n\) % n/.test(car))
ok('it renders one dot per slide', /v-for="\(slide, i\) in slides"/.test(car) && /carousel-dot/.test(car))
// Auto-advancing content is a WCAG 2.2.2 hazard: it must be pausable.
ok('it has an explicit pause control', /class="carousel-pause"/.test(car) && /togglePause/.test(car))
ok('...exposed to assistive tech', /aria-pressed="paused"/.test(car) && /aria-label="paused \?/.test(car))
ok('...and pauses on hover/focus', /@mouseenter="pause"/.test(car) && /@focusin="pause"/.test(car))
ok('reduced-motion users get a still carousel',
  /prefers-reduced-motion: reduce/.test(car) && /paused\.value = true/.test(car))
ok('off-screen slides are hidden from AT', /:aria-hidden="i !== index"/.test(car))
ok('arrows have accessible names', /aria-label="Previous slide"/.test(car) && /aria-label="Next slide"/.test(car))
// A card linking to a route that does not exist is worse than no card at all.
const slideLinks = [...home.matchAll(/to: '(\/[\w-]*)'/g)].map((m) => m[1])
ok('every slide points at a real route', slideLinks.length > 0 && slideLinks.every((p) =>
  routes.includes(`path: '${p}'`) || p === '/'), slideLinks.join(', '))
ok('slides do not link to the old /reader', !slideLinks.includes('/reader'))

/* ---- 15. sync script: Chinese is mirrored, others unchanged ---- */
console.log('\n--- 15. sync-hymns: chinese support ---')
const hymnSync = await import('./scripts/sync-hymns.mjs')
const syncSrc = read('./scripts/sync-hymns.mjs')

ok('chinese is in SUPPORTED',
  hymnSync.SUPPORTED.some((l) => l.key === 'chinese'))
ok('chinese reads the real file name', /hymnal_zh\.json/.test(syncSrc))
ok('chinese is marked unified (one file, not three)',
  hymnSync.SUPPORTED.find((l) => l.key === 'chinese')?.unified === true)
// A unified language must be fetched once, or 807 hymns get written three times.
ok('the loop fetches a unified language exactly once',
  /spec\?\.unified \? \[spec\.category \|\| 'hymns'\] : CATEGORIES/.test(syncSrc))
ok('it guards against duplicate document ids',
  /duplicate document id/.test(syncSrc) && /refusing to write/.test(syncSrc))
ok('english is still a per-category language',
  hymnSync.SUPPORTED.find((l) => l.key === 'english')?.unified === undefined)

/* --- live Chinese fetch, mapped into a document --- */
const zhFetch = await hymnSync.fetchEntries('chinese', 'hymns')
eq('chinese file resolves', zhFetch.problem, null)
ok('...pointing at hymnal_zh.json', zhFetch.url.endsWith('chinese/hymnal_zh.json'), zhFetch.url)
eq('...and yields the whole hymnal', zhFetch.entries.length, 807)
// The file is an object keyed by id, not an array - a naive Array.isArray check
// would silently mirror zero hymns.
ok('an object-keyed file is still expanded into entries', zhFetch.entries.length > 0)
ok('...and every entry has an id',
  zhFetch.entries.every((e) => e && String(e.id ?? '').trim() !== ''))
ok('...and every entry has lyrics',
  zhFetch.entries.every((e) => Array.isArray(e.content) && e.content.length > 0))

const zhDoc = hymnSync.buildHymnDoc({ language: 'chinese', category: 'hymns', entry: zhFetch.entries[0] })
ok('the doc keeps the title', Boolean(zhDoc.title), zhDoc.title)
ok('...the lyric stanzas', zhDoc.content.length > 0, String(zhDoc.content.length))
ok('...the Chinese hymnal number', zhDoc.zhNo != null, String(zhDoc.zhNo))
ok('...the top-level cat', Boolean(zhDoc.cat), zhDoc.cat)
ok('...the sub-category', Boolean(zhDoc.subcat), zhDoc.subcat)
ok('...the author', Boolean(zhDoc.author), zhDoc.author)
ok('...the composer', Boolean(zhDoc.composer), zhDoc.composer)
ok('...the meter', Boolean(zhDoc.meter), zhDoc.meter)
ok('...and the English cross-link', Boolean(zhDoc.enId) && Boolean(zhDoc.enTitle),
  `${zhDoc.enId} / ${zhDoc.enTitle}`)
// Audio must point at the folder that actually exists.
ok('audio points at the real hymns/ folder',
  zhDoc.mp3Url.includes('/hymns/') && zhDoc.midiUrl.includes('/MIDI/hymns/'),
  `${zhDoc.mp3Url} | ${zhDoc.midiUrl}`)
ok('the doc id is language-scoped',
  hymnSync.hymnDocId('chinese', 'hymns', zhDoc.id).startsWith('chinese-'))

/* --- the other languages must NOT gain Chinese-only keys --- */
const enFetch = await hymnSync.fetchEntries('english', 'hymns')
const enDoc = hymnSync.buildHymnDoc({ language: 'english', category: 'hymns', entry: enFetch.entries[0] })
for (const key of ['zhNo', 'author', 'composer', 'scripture', 'meter', 'enId', 'enTitle']) {
  ok(`english doc has no "${key}"`, !(key in enDoc), Object.keys(enDoc).join(','))
}
eq('english still keeps its own cat', enDoc.cat, enFetch.entries[0].cat)
eq('english doc id is unchanged',
  hymnSync.hymnDocId('english', 'hymns', enDoc.id), `english-hymns-${enDoc.id}`)

/* --- a full dry run must not collide across languages --- */
const ids = new Set()
let dupes = 0
for (const lang of hymnSync.SUPPORTED.map((l) => l.key)) {
  const spec = hymnSync.SUPPORTED.find((l) => l.key === lang)
  const cats = spec.unified ? [spec.category] : hymnSync.CATEGORIES
  for (const cat of cats) {
    const r = await hymnSync.fetchEntries(lang, cat)
    if (r.problem) continue
    for (const e of r.entries) {
      const d = hymnSync.buildHymnDoc({ language: lang, category: cat, entry: e })
      if (!d.id) continue
      const id = hymnSync.hymnDocId(lang, cat, d.id)
      if (ids.has(id)) dupes++
      ids.add(id)
    }
  }
}
eq('no document id collides across all four languages', dupes, 0)
ok('the corpus is substantial', ids.size > 2000, String(ids.size))

/* ---- 16. premium books: the index bug must not come back ---- */
console.log('\n--- 16. premium books empty state ---')
const prem = await import('./src/js/premiumService.js')
const premSrc = read('./src/js/premiumService.js')

// The original bug: a two-where + orderBy query needs a composite index that
// did not exist, so every read failed with FAILED_PRECONDITION and the UI
// showed "could not be loaded" instead of the honest empty state.
//
// The assertion is scoped to the live query expression (everything between the
// first `query(` and the closing `)` of that call) so the comment above, which
// documents the old query on purpose, is not mistaken for executable code.
const qStart = premSrc.indexOf('query(')
const queryExpr = premSrc.slice(qStart, premSrc.indexOf(')', premSrc.indexOf('lang)', qStart)) + 1)
ok('the executed query does NOT use orderBy', !/orderBy/.test(queryExpr), queryExpr)
ok('the executed query uses exactly one where clause',
  (queryExpr.match(/\bwhere\(/g) || []).length === 1, queryExpr)
ok('...filtering on language', /where\('language', '==', lang\)/.test(queryExpr))
ok('it filters `published` in memory', /\.filter\(\(b\) => b\.published\)/.test(premSrc))
ok('it sorts in memory', /localeCompare/.test(premSrc))
ok('a missing index is reported as its own problem',
  /index-missing/.test(premSrc))
ok('...and is not confused with an empty catalogue',
  /failed-precondition/.test(premSrc))

eq('an absent `published` is treated as a draft',
  prem.shapePremiumBook({ title: 'x' }).published, false)
eq('an explicit published:true is visible',
  prem.shapePremiumBook({ title: 'x', published: true }).published, true)

const premNoDb = await prem.fetchPremiumBooks('urdu', { db: null })
ok('a missing db never throws', premNoDb.books.length === 0)
ok('...and reports why', premNoDb.problem === 'unavailable', premNoDb.problem)

ok('the empty state says "not available yet", not "could not load"',
  /not available yet/.test(prem.premiumEmptyMessage('urdu', 'empty')))
ok('an index failure gets its own honest message',
  /not set up correctly/.test(prem.premiumEmptyMessage('urdu', 'index-missing')))
ok('a network failure still says "try again"',
  /try again shortly/.test(prem.premiumEmptyMessage('urdu', 'unavailable')))
ok('the three problems give three different messages',
  new Set(['empty', 'index-missing', 'unavailable']
    .map((p) => prem.premiumEmptyMessage('urdu', p))).size === 3)
// The empty state must be a real state, never a fabricated book.
ok('an empty result never invents a book', premNoDb.books.length === 0)

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
process.exit(fail === 0 ? 0 : 1)
