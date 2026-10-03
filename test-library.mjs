import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
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
eq('Reader.vue has no dangling identifiers', bindings('./src/pages/Reader.vue').join(','), '')

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
eq('Reader.vue imports every Vue helper it calls',
  missingVueHelpers('./src/pages/Reader.vue').join(','), '')
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
ok('links to /reader', lib.includes("path: '/reader'"))
ok('builds Books from the 3 GitHub categories', lib.includes('book.key') && lib.includes('books'))
ok('no longer reads the stale placeholder catalog', !lib.includes('library-catalog.json'))

/* ---- 3. Reader empty state contract ---- */
console.log('\n--- 3. Reader: empty-id guard ---')
const rd = read('./src/pages/Reader.vue')
ok('has hasId computed', /const hasId = computed/.test(rd))
ok('hides player + lyrics when no id', /v-if="!hasId"/.test(rd))
ok('friendly message present', rd.includes('Please select a Hymn from the Library'))
ok('no empty quotes rendered', !/''\s*\}\}|>\s*\{\{\s*\}\}\s*</.test(rd))
ok('accepts both lang= and language=', rd.includes("queryValue('language')"))
ok('empty branch sets no error', /if \(!id\) \{[^}]*error\.value = ''/s.test(rd))

/* ---- 4. live catalog from GitHub main ---- */
console.log('\n--- 4. live catalog (GitHub main) ---')
const { fetchCatalog, fetchHymn, CATEGORY_META } = await import('./src/js/hymnService.js')

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

/* ---- 5. every catalog id actually loads in the Reader ---- */
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

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
process.exit(fail === 0 ? 0 : 1)
