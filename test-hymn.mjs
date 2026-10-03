import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(root, p), 'utf8')
const realFetch = globalThis.fetch
let fetchCount = 0

// '/data/...' only resolves inside a browser, so map it onto the local file.
globalThis.fetch = async (url, opts) => {
  const target = String(url)
  if (target.startsWith('/data/')) {
    const body = readFileSync(join(root, 'public', target.slice(1)), 'utf8')
    return { ok: true, status: 200, json: async () => JSON.parse(body) }
  }
  fetchCount += 1
  return realFetch(url, opts)
}

const svc = await import('./src/js/hymnService.js')
const {
  JSON_BASE_URL, AUDIO_BASE_URL, getAudioUrl, getAudioUrlCandidates, findHymn,
  normalizeHymn, fetchHymn, buildJsonUrls, isUrdu, LANGUAGES, stripLetters,
  normaliseCategory, fetchCatalog, categoriesFor, groupByCategory,
  getActiveLanguage, setActiveLanguage, onLanguageChange, resolveInitialLanguage
} = svc

let pass = 0
let fail = 0
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}  ${extra}`) }
}
const eq = (label, actual, expected) =>
  ok(label, actual === expected, `\n        got:  ${actual}\n        want: ${expected}`)

const J = 'https://raw.githubusercontent.com/Church62626/Church-in-Pakistan/main/Hymns-contents/'
const A = 'https://raw.githubusercontent.com/Church62626/hymns-audio-/main/'
const HASH = /[0-9a-f]{40}/

console.log('\n--- 1. base URLs point at main, no commit hashes ---')
eq('JSON_BASE_URL', JSON_BASE_URL, J)
eq('AUDIO_BASE_URL', AUDIO_BASE_URL, A)
ok('no hash in JSON_BASE_URL', !HASH.test(JSON_BASE_URL))
ok('no hash in AUDIO_BASE_URL', !HASH.test(AUDIO_BASE_URL))
ok('no hash anywhere in the service source',
  !HASH.test(readFileSync(join(root, 'src/js/hymnService.js'), 'utf8')))

console.log('\n--- 2. path construction matches the files that actually exist ---')
eq('english/hymns', buildJsonUrls('hymns', 'english')[0], J + 'english/hymns_en.json')
eq('urdu/hymns', buildJsonUrls('hymns', 'urdu')[0], J + 'urdu/hymns.json')
eq('roman-urdu/hymns', buildJsonUrls('hymns', 'roman-urdu')[0], J + 'roman-urdu/hymns_ru.json')
// Chinese publishes ONE unified hymnal (verified on main), not three files.
eq('chinese/hymns', buildJsonUrls('hymns', 'chinese')[0], J + 'chinese/hymnal_zh.json')
eq('urdu/newsong -> newsongs.json (has an s)', buildJsonUrls('newsong', 'urdu')[0], J + 'urdu/newsongs.json')
eq('english/newsong', buildJsonUrls('newsong', 'english')[0], J + 'english/newsong_en.json')
eq('roman-urdu/newsong', buildJsonUrls('newsong', 'roman-urdu')[0], J + 'roman-urdu/newsong_ru.json')
eq('urdu/others', buildJsonUrls('others', 'urdu')[0], J + 'urdu/others.json')
eq('english/others', buildJsonUrls('others', 'english')[0], J + 'english/others_en.json')
eq('roman-urdu/others', buildJsonUrls('others', 'roman-urdu')[0], J + 'roman-urdu/others_ru.json')
ok('no cross-language fallback candidate',
  buildJsonUrls('hymns', 'chinese').every((u) => u.includes('/chinese/')),
  JSON.stringify(buildJsonUrls('hymns', 'chinese')))

console.log('\n--- 3. every generated JSON URL returns the expected status ---')
const expectedStatus = [
  ['hymns', 'english', 200], ['hymns', 'urdu', 200], ['hymns', 'roman-urdu', 200],
  ['hymns', 'chinese', 200], ['newsong', 'english', 200], ['newsong', 'urdu', 200],
  ['newsong', 'roman-urdu', 200], ['newsong', 'chinese', 200],
  ['others', 'english', 200], ['others', 'urdu', 200], ['others', 'roman-urdu', 200]
]
for (const [cat, lang, want] of expectedStatus) {
  const url = buildJsonUrls(cat, lang)[0]
  let got = 0
  try { got = (await realFetch(url, { method: 'HEAD' })).status } catch (e) { got = String(e) }
  eq(`${lang}/${cat}`, got, want)
}

console.log('\n--- 4. audio base URL ---')
eq('hymns mp3', getAudioUrl('hymns', '1', 'mp3'), `${A}hymns/1.mp3`)
eq('hymns midi', getAudioUrl('hymns', '1', 'midi'), `${A}MIDI/hymns/1.mid`)
eq('others mp3 strips prefix', getAudioUrl('others', 'C273', 'mp3'), `${A}another/273.mp3`)
eq('others midi keeps prefix', getAudioUrl('others', 'C273', 'midi'), `${A}another/C273.mid`)
for (const [cat, id, type] of [['hymns', '1', 'mp3'], ['hymns', '1', 'midi'],
                                ['newsong', '102', 'mp3'], ['others', 'C273', 'midi']]) {
  const url = getAudioUrl(cat, id, type)
  let got = 0
  try { got = (await realFetch(url, { method: 'HEAD' })).status } catch (e) { got = String(e) }
  eq(`${cat}/${id}/${type} is live`, got, 200)
}

console.log('\n--- 5. empty id guard: throws WITHOUT touching the network ---')
for (const bad of ['', '   ', null, undefined]) {
  const before = fetchCount
  let code = null
  try { await fetchHymn('hymns', bad, 'urdu') } catch (e) { code = e.code }
  eq(`id=${JSON.stringify(bad)} -> HYMN_ID_REQUIRED`, code, 'HYMN_ID_REQUIRED')
  eq(`id=${JSON.stringify(bad)} made 0 requests`, fetchCount - before, 0)
}

console.log('\n--- 6. shape tolerance (unchanged) ---')
const flatNorm = normalizeHymn(findHymn([{ id: '1', title: 'T', lyrics: 'a\nb' }], '1'), '1')
eq('flat lyrics -> 1 stanza', flatNorm.verses.length, 1)
eq('lyrics preserved', flatNorm.verses[0], 'a\nb')

const keyed = normalizeHymn(findHymn({
  '1': { id: '1', title: ['Line A', 'Line B'], chorus: [], content: [['x', 'y'], ['z']] }
}, '1'), '1')
eq('title array joined', keyed.title, 'Line A\nLine B')
eq('content -> 2 stanzas', keyed.verses.length, 2)
eq('stanza joins inner array', keyed.verses[0], 'x\ny')
eq('empty chorus', keyed.chorus, '')
eq('missing id -> null', findHymn({ '1': { id: '1' } }, '999'), null)
eq('C273 -> 273', stripLetters('C273'), '273')

console.log('\n--- 7. live fetch: real data from main branch ---')
const urduHymn = await fetchHymn('hymns', '1', 'urdu')
eq('urdu source = remote', urduHymn.source, 'remote')
ok('urdu title is non-empty', urduHymn.title.trim().length > 0, urduHymn.title)
ok('urdu has verses', urduHymn.verses.length >= 1, `got ${urduHymn.verses.length}`)
ok('urdu source url is on main', urduHymn.sourceUrl.includes('/main/'), urduHymn.sourceUrl)

const englishHymn = await fetchHymn('hymns', '1', 'english')
eq('english source = remote', englishHymn.source, 'remote')
ok('english has verses', englishHymn.verses.length >= 1)

const newsongHymn = await fetchHymn('newsong', '6', 'urdu')
eq('urdu newsong source = remote', newsongHymn.source, 'remote')
ok('urdu newsong has verses', newsongHymn.verses.length >= 1, `got ${newsongHymn.verses.length}`)

const englishNewsong = await fetchHymn('newsong', '6', 'english')
eq('english newsong source = remote', englishNewsong.source, 'remote')

const othersHymn = await fetchHymn('others', 'C273', 'urdu')
eq('urdu others source = remote', othersHymn.source, 'remote')
eq('urdu others title present', othersHymn.title.length > 0, true)

console.log('\n--- 8. category isolation: does not fall through to another file ---')
let isoError = null
try { await fetchHymn('others', 'zzzz-does-not-exist', 'urdu') } catch (e) { isoError = e }
eq('throws HYMN_NOT_FOUND', isoError && isoError.code, 'HYMN_NOT_FOUND')
eq('only 1 attempt (stopped after load)', isoError && isoError.attempts.length, 1)
ok('attempt was others.json',
  isoError && isoError.attempts[0].includes('urdu/others.json'),
  isoError && JSON.stringify(isoError.attempts))
ok('did NOT fall through to hymns.json',
  isoError && !isoError.attempts.some((a) => a.includes('hymns.json')),
  isoError && JSON.stringify(isoError.attempts))

console.log('\n--- 9. chinese: the unified hymnal and its cat/subcat tree ---')
const zhCat = await fetchCatalog('chinese')
eq('chinese exposes ONE book, not three duplicates', zhCat.books.length, 1)
eq('...keyed hymnal', zhCat.books[0].key, 'hymnal')
ok('...with no problem reported', zhCat.books[0].problem === null, String(zhCat.books[0].problem))
ok('...holding the whole hymnal', zhCat.books[0].count >= 800, String(zhCat.books[0].count))
ok('...grouped into many real categories',
  zhCat.books[0].categories.length > 20, String(zhCat.books[0].categories.length))
ok('...each group carries sub-categories',
  zhCat.books[0].categories.every((g) => Array.isArray(g.subcats) && g.subcats.length > 0))
eq('group counts add up to the total',
  zhCat.books[0].categories.reduce((n, g) => n + g.count, 0), zhCat.books[0].count)
ok('sub-category hymn counts add up too',
  zhCat.books[0].categories.every((g) =>
    g.subcats.reduce((n, s) => n + s.count, 0) === g.count))

const zh = await fetchHymn('hymns', '1', 'chinese')
eq('chinese now loads for real', zh.verses.length > 0, true)
eq('...and reports the Chinese hymnal number', zh.zhNo, 1)
ok('...with the author from the richer schema', Boolean(zh.author), zh.author)
ok('...and a cross-link to the English title', Boolean(zh.enTitle), zh.enTitle)
ok('...pointing at the English hymn id', Boolean(zh.enId), String(zh.enId))

ok('no bundled fallback file is referenced any more',
  !read('./src/js/hymnService.js').includes('hymns-fallback.json'))
ok('the fallback data file itself is gone',
  !existsSync(new URL('./public/data/hymns-fallback.json', import.meta.url)))
ok('Library no longer renders the sample notice',
  !read('./src/pages/Library.vue').includes('bundled sample'))

console.log('\n--- 9b. english keeps its three flat books (no regression) ---')
const enCat = await fetchCatalog('english')
eq('english still exposes three books', enCat.books.length, 3)
eq('...hymns first', enCat.books[0].key, 'hymns')
ok('...all populated',
  enCat.books.every((b) => b.count > 0),
  JSON.stringify(enCat.books.map((b) => `${b.key}:${b.count}`)))

console.log('\n--- 10. corrupt upstream JSON is reported, never masked ---')
// roman-urdu/newsong_ru.json contains a raw TAB inside a string literal.
let corrupt = null
try { await fetchHymn('newsong', '6', 'roman-urdu') } catch (e) { corrupt = e }
eq('code = HYMN_DATA_INVALID', corrupt && corrupt.code, 'HYMN_DATA_INVALID')
ok('message says the file is not valid JSON',
  Boolean(corrupt) && /not valid JSON/.test(corrupt.message), corrupt && corrupt.message)
ok('did NOT silently fall through to hymns_ru.json',
  Boolean(corrupt) && !corrupt.attempts.some((a) => a.includes('hymns_ru.json')),
  corrupt && JSON.stringify(corrupt.attempts))

console.log('\n--- 11. original bug: empty id no longer produces a 404 attempt ---')
let emptyErr = null
try { await fetchHymn('hymns', '', 'urdu') } catch (e) { emptyErr = e }
eq('code', emptyErr && emptyErr.code, 'HYMN_ID_REQUIRED')
ok('no URLs were tried', Boolean(emptyErr) && emptyErr.attempts.length === 0,
  emptyErr && JSON.stringify(emptyErr.attempts))
ok('message does not mention 404', Boolean(emptyErr) && !/404/.test(emptyErr.message))

console.log('\n--- 12. global language store ---')
// The nav bar's LanguageSelector is the single source of truth.
eq('defaults to urdu', getActiveLanguage(), 'urdu')
eq('setActiveLanguage applies a published language',
  setActiveLanguage('chinese'), 'chinese')
eq('getActiveLanguage reflects it', getActiveLanguage(), 'chinese')

ok('unknown key is rejected, previous value kept',
  setActiveLanguage('klingon') === 'chinese' && getActiveLanguage() === 'chinese',
  getActiveLanguage())

ok('unpublished language is rejected',
  setActiveLanguage('punjabi') === 'chinese' && getActiveLanguage() === 'chinese',
  getActiveLanguage())

let notified = null
const off = onLanguageChange((k) => { notified = k })
setActiveLanguage('english')
eq('listeners are notified', notified, 'english')
off()
setActiveLanguage('urdu')
eq('unsubscribed listener is not called again', notified, 'english')

ok('a throwing listener does not break the others', (() => {
  let reached = false
  const a = onLanguageChange(() => { throw new Error('boom') })
  const b = onLanguageChange(() => { reached = true })
  setActiveLanguage('roman-urdu')
  a(); b()
  return reached === true
})(), 'second listener still ran')

ok('resolveInitialLanguage falls back for an unknown language',
  resolveInitialLanguage('klingon') === 'urdu', resolveInitialLanguage('klingon'))
ok('resolveInitialLanguage accepts a valid language',
  resolveInitialLanguage('chinese') === 'chinese', resolveInitialLanguage('chinese'))

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
process.exit(fail === 0 ? 0 : 1)

