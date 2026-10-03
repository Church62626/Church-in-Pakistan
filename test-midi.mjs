import { readFileSync } from 'node:fs'

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

/* ---- 1. note naming: flats only (sharps are 404 upstream) ---- */
console.log('\n--- 1. midiNoteName uses flats, never sharps ---')
const { midiNoteName, soundfontUrl, MIDI_INSTRUMENTS, instrumentGroups, instrumentLabel,
        DEFAULT_INSTRUMENT, parseMidi } = await import('./src/js/midiEngine.js')

const { LANGUAGES, getLanguage, scriptClass, langAttr, isRtl, buildJsonUrls, JSON_BASE_URL } =
  await import('./src/js/hymnService.js')

eq('60 -> C4', midiNoteName(60), 'C4')
eq('61 -> Db4 (not C#4)', midiNoteName(61), 'Db4')
eq('63 -> Eb4 (not D#4)', midiNoteName(63), 'Eb4')
eq('66 -> Gb4 (not F#4)', midiNoteName(66), 'Gb4')
eq('70 -> Bb4 (not A#4)', midiNoteName(70), 'Bb4')
eq('69 -> A4', midiNoteName(69), 'A4')
eq('36 -> C2', midiNoteName(36), 'C2')
eq('0 clamps to C-1', midiNoteName(-5), 'C-1')
eq('127 clamps to G9', midiNoteName(200), 'G9')
eq('rounds fractional', midiNoteName(60.4), 'C4')

const allNames = []
for (let n = 0; n < 128; n++) allNames.push(midiNoteName(n))
ok('no note name contains "#"', !allNames.some((s) => s.includes('#')))
ok('only C, Db, D, Eb, E, F, Gb, G, Ab, A, Bb, B pitch classes are used',
  [...new Set(allNames.map((s) => s.replace(/-?\d+$/, '')))]
    .every((p) => ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'].includes(p)))

/* ---- 2. instrument list + URL shape ---- */
console.log('\n--- 2. instruments and soundfont URLs ---')
ok('has 32 instruments', MIDI_INSTRUMENTS.length === 32, `got ${MIDI_INSTRUMENTS.length}`)
ok('includes piano', MIDI_INSTRUMENTS.some((i) => i.value === 'acoustic_grand_piano'))
ok('includes flute', MIDI_INSTRUMENTS.some((i) => i.value === 'flute'))
ok('includes acoustic guitar', MIDI_INSTRUMENTS.some((i) => i.value === 'acoustic_guitar_nylon'))
ok('default instrument exists in the list',
  MIDI_INSTRUMENTS.some((i) => i.value === DEFAULT_INSTRUMENT), DEFAULT_INSTRUMENT)
ok('all values are unique',
  new Set(MIDI_INSTRUMENTS.map((i) => i.value)).size === MIDI_INSTRUMENTS.length)
ok('all have a label and group',
  MIDI_INSTRUMENTS.every((i) => i.label && i.group))

const groups = instrumentGroups()
ok('groups are formed', groups.length >= 8, `got ${groups.length}`)
ok('every group is non-empty', groups.every((g) => g.items.length > 0))
eq('label lookup', instrumentLabel('flute'), 'Flute')
eq('unknown label falls back', instrumentLabel('nope'), 'nope')

ok('url points at FluidR3_GM on jsDelivr',
  soundfontUrl('flute', 'C4') ===
  'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@master/FluidR3_GM/flute-mp3/C4.mp3',
  soundfontUrl('flute', 'C4'))

/* ---- 3. Reader wiring ---- */
console.log('\n--- 3. Reader integrates the engine ---')
const rd = read('./src/pages/List.vue')
ok('imports MidiEngine', /import\s*\{[^}]*MidiEngine[^}]*\}\s*from '\.\.\/js\/midiEngine'/.test(rd))
ok('builds a single engine', /new MidiEngine\(\)/.test(rd))
ok('audio tag is MP3-only (v-if)', /v-if="audioMode === 'mp3' && currentAudioUrl"/.test(rd))
ok('audio src is never blanked to a page URL', /:src="currentAudioUrl"/.test(rd))
ok('fetches the .mid as ArrayBuffer', /response\.arrayBuffer\(\)/.test(rd))
ok('hands the buffer to the engine', /await withTimeout\(midi\.load\(buffer\)/.test(rd))
ok('has an instrument dropdown', /id="midi-instrument"/.test(rd))
ok('dropdown is MIDI-only', /v-if="audioMode === 'midi'" class="instrument-row"/.test(rd))
ok('dropdown uses optgroups', /<optgroup/.test(rd))
ok('togglePlay branches on mode', /if \(audioMode\.value === 'midi'\)/.test(rd))
ok('seek branches on mode', /midi\.seek\(time\)/.test(rd))
ok('instrument change reaches engine', /midi\.setInstrument\(instrument\.value\)/.test(rd))
ok('rAF clock started', /requestAnimationFrame\(syncMidiClock\)/.test(rd))
ok('rAF clock stopped on unmount', /onBeforeUnmount\(\(\) => \{[\s\S]*?stopClock\(\)/.test(rd))
ok('play button reflects loading state',
  /'is-busy': isBusy, 'is-blocked': !canPlay/.test(rd))
ok('no audio element bound to a .mid', !/:src="currentAudioUrl"[\s\S]{0,80}midi/i.test(rd))

/* ---- 4. the red prohibition sign is gone, and nothing stays disabled ---- */
console.log('\n--- 4. play button is never `disabled`, never not-allowed ---')
ok('no :disabled on the play button', !/:class="\{[^}]*\}?"[\s\S]{0,120}audio-play-btn[\s\S]{0,200}?:\s*disabled/.test(rd) && !/<button[^>]*class="audio-play-btn"[\s\S]{0,300}?\s:disabled=/.test(rd))
ok('play button uses :aria-disabled instead',
  /class="audio-play-btn"[\s\S]{0,300}?:aria-disabled="!canPlay"/.test(rd))
ok('seek slider uses :aria-disabled instead',
  /class="audio-seek-slider"[\s\S]{0,300}?:aria-disabled="!canPlay"/.test(rd))
ok('no cursor: not-allowed anywhere in Reader.vue', !/not-allowed/.test(rd))
ok('blocked state uses cursor: default', /\.audio-play-btn\.is-blocked[\s\S]{0,160}?cursor:\s*default/.test(rd))
ok('busy state uses cursor: progress', /\.audio-play-btn\.is-busy[\s\S]{0,120}?cursor:\s*progress/.test(rd))
ok('has isBusy computed', /const isBusy = computed/.test(rd))
ok('has playButtonLabel computed', /const playButtonLabel = computed/.test(rd))
ok('spinner driven by isBusy (not midiLoading alone)',
  /:class="\{[^}]*'is-busy': isBusy/.test(rd) && /v-if="isBusy" class="spin"/.test(rd))

console.log('\n--- 5. flags always reset (no permanent wedge) ---')
ok('resetAudioState clears both busy flags',
  /function resetAudioState\(\)[\s\S]*?midiLoading\.value = false[\s\S]*?mp3Loading\.value = false/.test(rd))
ok('resetAudioState bumps both tokens',
  /function resetAudioState\(\)[\s\S]*?midiLoadToken \+= 1[\s\S]*?mp3Token \+= 1/.test(rd))
ok('applyAudioSource calls resetAudioState', /midi\.stop\(\)\s*\n\s*resetAudioState\(\)/.test(rd))
ok('loadMidi always clears midiLoading', /finally \{[\s\S]{0,120}?midiLoading\.value = false/.test(rd))
ok('togglePlay retries when nothing is playable',
  /if \(!canPlay\.value\) \{[\s\S]{0,400}?applyAudioSource\(\)/.test(rd))
ok('no silently-swallowed play() rejection',
  /el\.play\(\)\s*\n?\s*\.then\([\s\S]{0,200}?\.catch\(/.test(rd))
ok('mode switch does not autoplay', /applyAudioSource\(\{ autoplay: false \}\)/.test(rd))

console.log('\n--- 5b. verifyMp3 releases the spinner in a finally ---')
ok('verifyMp3 has a finally that clears mp3Loading',
  /async function verifyMp3[\s\S]*?\} finally \{[\s\S]*?mp3Loading\.value = false/.test(rd))
ok('<audio> is v-if guarded on mp3 + url', /v-if="audioMode === 'mp3' && currentAudioUrl"/.test(rd))
ok('audio src is never an empty string', !/:src="audioMode === 'mp3' \? currentAudioUrl : ''"/.test(rd))
ok('onAudioError ignores non-mp3 modes', /function onAudioError\(\)[\s\S]{0,200}?if \(audioMode\.value !== 'mp3'\) return/.test(rd))
ok('MP3 candidate list is probed with a range GET', /fetch\(url, \{ headers: \{ Range: 'bytes=0-1023' \} \}\)/.test(rd))
ok('onAudioError clears mp3Loading on final failure',
  /mp3Loading\.value = false[\s\S]{0,120}?audioStatus\.value = `No \$\{modeLabel/.test(rd))

console.log('\n--- 7. MIDI engine cannot throw unhandled ---')
const eng = read('./src/js/midiEngine.js')
ok('preload() resolves instead of rejecting', /async preload\(notes\)[\s\S]{0,300}?return report/.test(eng))
ok('preload() uses allSettled', /Promise\.allSettled/.test(eng))
ok('preload() is bounded end to end', /PRELOAD_TIMEOUT_MS,\s*\n\s*'Loading instrument samples'/.test(eng))
ok('exported timeouts are numeric', /export const SAMPLE_TIMEOUT_MS = \d+/.test(eng) && /export const PRELOAD_TIMEOUT_MS = \d+/.test(eng))
ok('withTimeout is exported', /export function withTimeout\(promise, ms, label = 'Operation'\)/.test(eng))
ok('withTimeout clears its timer', /Promise\.race\(\[promise, guard\]\)\.finally\(\(\) => clearTimeout\(timer\)\)/.test(eng))
ok('fetch is abort-bounded', /fetchWithTimeout[\s\S]{0,200}?signal: controller\.signal/.test(eng))
ok('AbortError is translated to a message', /err\.name === 'AbortError'\) throw new Error\(`Request timed out after \$\{ms\}ms`\)/.test(eng))
ok('a hung retry is not poisoned by a stale pending entry',
  /if \(pending\.has\(key\)\) pending\.delete\(key\)/.test(eng))
ok('pending is cleared only for the current job',
  /if \(pending\.get\(key\) === job\) pending\.delete\(key\)/.test(eng))
ok('decodeAudioData is bounded', /withTimeout\(ctx\.decodeAudioData\(bytes\), SAMPLE_TIMEOUT_MS/.test(eng))
ok('engine tracks failed notes', /this\.noteErrors = 0/.test(eng) && /get failedNotes\(\)/.test(eng))
ok('failedNotes resets on load', /async load\(arrayBuffer\)[\s\S]{0,120}?this\.noteErrors = 0/.test(eng))
ok('fire() guards a null context', /fire\(note, when\) \{\s*\n\s*const ctx = this\.ctx\s*\n\s*if \(!ctx \|\| !this\.master\) return/.test(eng))
ok('fire() wraps start/stop in try', /try \{\s*\n\s*src\.start\(when\)/.test(eng))
ok('fire() surfaces sample failures via onSampleError',
  /src\.onended = \(\) => this\.active\.delete\(src\)\s*\n\s*\}\)\s*\n\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*\.catch\(\(err\) => \{\s*\n\s*this\.noteErrors \+= 1\s*\n\s*if \(this\.onSampleError\) this\.onSampleError\(err, note\)/.test(eng))
ok('fire() re-checks playing after await', /if \(!this\.playing \|\| !this\.ctx\) return/.test(eng))
ok('Reader warms samples before play',
  /async function startMidiPlayback\(\)[\s\S]{0,200}?midi\.ensureContext\(\)[\s\S]{0,80}?return warmUpSamples\(\)/.test(rd))
ok('play attempt awaits startMidiPlayback', /withTimeout\(startMidiPlayback\(\), MIDI_START_TIMEOUT_MS/.test(rd))
ok('warmUpSamples filters a 3s window', /n\.time >= now && n\.time < horizon/.test(rd))

console.log('\n--- 7. the spinner can never outlive a play attempt ---')
ok('withTimeout is imported', /withTimeout[\s\S]{0,200}?from '\.\.\/js\/midiEngine'/.test(rd))
ok('start attempt has a hard budget', /const MIDI_START_TIMEOUT_MS = \d+/.test(rd))
ok('play attempt is wrapped in withTimeout',
  /withTimeout\(startMidiPlayback\(\), MIDI_START_TIMEOUT_MS/.test(rd))
ok('spinner released in a finally', /finally \{[\s\S]{0,80}?releaseSpinner\(\)/.test(rd))
ok('releaseSpinner is token-guarded', /if \(token === midiPlayToken\) midiLoading\.value = false/.test(rd))
ok('every early return validates the token', (rd.match(/if \(token !== midiPlayToken\) return/g) || []).length >= 3)
ok('midiPlayToken bumped by resetAudioState',
  /function resetAudioState\(\)[\s\S]{0,200}?midiPlayToken \+= 1/.test(rd))
ok('timeout shows a recovery message',
  /Failed to load instrument samples: \$\{err\.message\}\. Press play to retry\./.test(rd))
ok('timedOut report offers a retry',
  /report\.timedOut[\s\S]{0,200}?Press play to retry\./.test(rd))
ok('partial failure still plays what loaded',
  /report\.failed[\s\S]{0,160}?Playing the notes that did load\./.test(rd))

console.log('\n--- 8. the .mid download and the MP3 probe are bounded too ---')
ok('MIDI file has its own timeout', /const MIDI_FILE_TIMEOUT_MS = \d+/.test(rd))
ok('loadMidi wraps fetch', /withTimeout\(fetch\(url\), MIDI_FILE_TIMEOUT_MS/.test(rd))
ok('loadMidi wraps arrayBuffer', /withTimeout\(response\.arrayBuffer\(\), MIDI_FILE_TIMEOUT_MS/.test(rd))
ok('loadMidi wraps midi.load', /withTimeout\(midi\.load\(buffer\), MIDI_FILE_TIMEOUT_MS/.test(rd))
ok('loadMidi clears the spinner in finally',
  /async function loadMidi[\s\S]*?\} finally \{\s*\n\s*if \(token === midiLoadToken\) midiLoading\.value = false/.test(rd))
ok('verifyMp3 clears the spinner in finally',
  /async function verifyMp3[\s\S]*?\} finally \{\s*\n\s*\/\/[^\n]*\n\s*if \(token === mp3Token\) mp3Loading\.value = false/.test(rd))
ok('verifyMp3 fetch is bounded', /withTimeout\(\s*\n\s*fetch\(url, \{ headers: \{ Range: 'bytes=0-1023' \} \}\)/.test(rd))
ok('sample failures are surfaced without rejecting',
  /midi\.onSampleError = \(err\) =>/.test(rd) && /if \(this\.onSampleError\) this\.onSampleError\(err, note\)/.test(eng))

/* ---- Language tests ---- */
console.log('\n--- L. only the active languages are registered ---')
const keys = LANGUAGES.map((l) => l.key)
// Punjabi, Pashto, Sindhi and Balochi were removed: their lyric folders were
// never published, so they only ever rendered an empty tab. They are asserted
// GONE here, because the failure mode of "hide in the UI but keep in the config"
// is that they quietly reappear somewhere else.
ok('urdu present', keys.includes('urdu'))
ok('roman-urdu present', keys.includes('roman-urdu'))
ok('english present', keys.includes('english'))
ok('chinese present', keys.includes('chinese'))
ok('punjabi is gone', !keys.includes('punjabi'))
ok('pashto is gone', !keys.includes('pashto'))
ok('sindhi is gone', !keys.includes('sindhi'))
ok('balochi is gone', !keys.includes('balochi'))
ok('exactly the four active languages', keys.length === 4, keys.join(','))
ok('every active language is published', LANGUAGES.every((l) => l.published))
ok('no duplicate keys', new Set(keys).size === keys.length)
ok('all have label + native + folder + suffix + lang + script',
  LANGUAGES.every((l) => l.label && l.native && l.folder && l.suffix !== undefined && l.lang && l.script))
ok('every language has a file() resolver', LANGUAGES.every((l) => typeof l.file === 'function'))

console.log('\n--- M. script + direction mapping ---')
eq('urdu -> nastaliq', scriptClass('urdu'), 'script-arabic-nastaliq')
eq('chinese -> cjk', scriptClass('chinese'), 'script-cjk')
eq('english -> latin', scriptClass('english'), 'script-latin')
eq('roman-urdu -> latin', scriptClass('roman-urdu'), 'script-latin')
ok('urdu is RTL', isRtl('urdu'))
ok('chinese is LTR', !isRtl('chinese'))
ok('unknown key -> latin', scriptClass('klingon') === 'script-latin')
// A removed language must degrade to the neutral default rather than throw.
ok('a removed key falls back to latin', scriptClass('punjabi') === 'script-latin')
ok('a removed key is not RTL', !isRtl('pashto'))
ok('getLanguage returns null for a removed key', getLanguage('sindhi') === null)
eq('lang attr urdu', langAttr('urdu'), 'ur')
eq('lang attr chinese', langAttr('chinese'), 'zh')

console.log('\n--- N. Nastaliq stays Urdu-only ---')
ok('only urdu is nastaliq', LANGUAGES.filter((l) => l.nastaliq).map((l) => l.key).join(',') === 'urdu')

console.log('\n--- O. active languages resolve to the expected URLs ---')
eq('urdu still uses the plural newsongs.json',
  buildJsonUrls('newsong', 'urdu')[0],
  `${JSON_BASE_URL}urdu/newsongs.json`)
eq('english newsong url',
  buildJsonUrls('newsong', 'english')[0],
  `${JSON_BASE_URL}english/newsong_en.json`)
eq('roman-urdu hymns url',
  buildJsonUrls('hymns', 'roman-urdu')[0],
  `${JSON_BASE_URL}roman-urdu/hymns_ru.json`)
eq('chinese collapses to its single hymnal file',
  buildJsonUrls('others', 'chinese')[0],
  `${JSON_BASE_URL}chinese/hymnal_zh.json`)

console.log('\n--- P. UI wiring ---')
const libTxt = read('./src/pages/Library.vue')
const fontsTxt = read('./src/css/fonts.css')
ok('Reader tabs loop over LANGUAGES', /v-for="lang in LANGUAGES"/.test(rd))
ok('Library tabs loop over LANGUAGES', /v-for="lang in LANGUAGES"/.test(libTxt))
ok('Reader applies scriptClass', (rd.match(/scriptClass\(/g) || []).length >= 2)
ok('Library applies scriptClass', /scriptClass\(lang\.key\)/.test(libTxt))
ok('Reader sets lang attr from the service', /:lang="langAttr\(language\)"/.test(rd))
ok('language switch writes to the route', /router\.replace\(\{[\s\S]{0,160}?language: key, id: requestedId\.value, category: category\.value/.test(rd))
ok('route language is watched', /watch\(\s*\n\s*\(\) => route\.query\.language/.test(rd))
ok('switching preserves id AND category', /id: requestedId\.value, category: category\.value/.test(rd))
ok('no leftover urdu-text in Reader', !/urdu-text/.test(rd))
ok('no leftover urdu-text in Library', !/urdu-text/.test(libTxt))
ok('pending languages are dimmed, not hidden', /is-pending/.test(rd) && /is-pending/.test(libTxt))
ok('unpublished language gets an honest message', /have not been published yet/.test(libTxt))
ok('Reader flags unpublished content', /badge-pending/.test(rd))

console.log('\n--- Q. fonts loaded for every script ---')
const htmlTxt = read('./index.html')
ok('Gurmukhi font is linked', /Noto\+Sans\+Gurmukhi/.test(htmlTxt))
ok('Naskh Arabic font is linked', /Noto\+Naskh\+Arabic/.test(htmlTxt))
ok('Nastaliq Urdu font is still linked', /Noto\+Nastaliq\+Urdu/.test(htmlTxt))
ok('CJK font is linked', /Noto\+Sans\+SC/.test(htmlTxt))
ok('fonts.css defines a gurmukhi stack', /--font-gurmukhi-body/.test(fontsTxt))
ok('fonts.css defines an arabic naskh stack', /--font-arabic-body/.test(fontsTxt))
ok('fonts.css defines a cjk stack', /--font-cjk-body/.test(fontsTxt))
ok('fonts.css has a .script-gurmukhi rule', /\.script-gurmukhi \{/.test(fontsTxt))
ok('fonts.css has a .script-arabic-naskh rule', /\.script-arabic-naskh \{/.test(fontsTxt))

/* ---- R. live GET reachability of both formats ---- */
console.log('\n--- 8. live GET on every MP3 + MIDI candidate ---')
const A = 'https://raw.githubusercontent.com/Church62626/hymns-audio-/main/'
const { getAudioUrlCandidates } = await import('./src/js/hymnService.js')

for (const [cat, id] of [['hymns', '1'], ['newsong', '102'], ['others', 'C273']]) {
  for (const type of ['mp3', 'midi']) {
    const list = getAudioUrlCandidates(cat, id, type)
    const statuses = await Promise.all(
      list.map((u) => fetch(u).then((r) => r.status).catch(() => 'ERR'))
    )
    const firstOk = statuses.findIndex((s) => s === 200)
    ok(`${cat}/${id} ${type}: first candidate resolves`,
      firstOk >= 0, list.map((u, i) => u.replace(A, '') + '=' + statuses[i]).join(' '))
  }
}

/* ---- 9. live .mid fetch + parse (real GitHub file) ---- */
console.log('\n--- 9. live .mid fetch + parse ---')

const MIDI_URL =
  'https://raw.githubusercontent.com/Church62626/hymns-audio-/main/MIDI/hymns/1.mid'

const response = await fetch(MIDI_URL)
eq('MIDI file is live', response.status, 200)
const buffer = await response.arrayBuffer()
ok('is a real MIDI file (>1KB)', buffer.byteLength > 1024, `${buffer.byteLength} bytes`)
eq('has the MThd header', String.fromCharCode(...new Uint8Array(buffer.slice(0, 4))), 'MThd')

const parsed = parseMidi(buffer)
ok('duration > 0', parsed.duration > 0, `${parsed.duration}`)
ok('notes were extracted', parsed.notes.length > 10, `${parsed.notes.length}`)
ok('notes are time-sorted',
  parsed.notes.every((n, i) => i === 0 || n.time >= parsed.notes[i - 1].time))
ok('every note has a valid midi number',
  parsed.notes.every((n) => n.midi >= 0 && n.midi <= 127))
ok('every note has positive duration',
  parsed.notes.every((n) => n.duration > 0))
ok('tempo is sane', parsed.tempo > 20 && parsed.tempo < 400, `${parsed.tempo}`)

/* ---- 5. soundfont samples actually resolve for this tune ---- */
console.log('\n--- 5. soundfont samples for the real note range ---')
const seen = new Set()
for (const n of parsed.notes) seen.add(midiNoteName(n.midi))
const names = [...seen].sort()
console.log(`  ${names.length} distinct notes: ${names.slice(0, 14).join(' ')}${names.length > 14 ? ' ...' : ''}`)
ok('note range is within the soundfont C1..C8 range',
  parsed.notes.every((n) => n.midi >= 24 && n.midi <= 96),
  `range ${Math.min(...parsed.notes.map((n) => n.midi))}-${Math.max(...parsed.notes.map((n) => n.midi))}`)

const probes = ['C4', 'Db4', 'Eb4', 'F4', 'Gb4', 'Bb4', 'A4', 'G4']
const results = await Promise.all(
  probes.map(async (name) => {
    try { return [name, (await fetch(soundfontUrl('acoustic_grand_piano', name))).status] }
    catch (e) { return [name, `ERR ${e.message}`] }
  })
)
for (const [name, status] of results) eq(`piano sample ${name}`, status, 200)

const flute = await fetch(soundfontUrl('flute', 'C4'))
eq('flute sample loads', flute.status, 200)
const guitar = await fetch(soundfontUrl('acoustic_guitar_nylon', 'C4'))
eq('guitar sample loads', guitar.status, 200)

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
process.exit(fail === 0 ? 0 : 1)
