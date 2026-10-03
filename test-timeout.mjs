/**
 * Behaviour tests for the MIDI timeout guards.
 *
 * These are runtime tests, not source greps: they stub `fetch` with a request
 * that HANGS (both abort-aware and abort-ignorant) and assert that `preload`
 * still resolves, reports the failure, and leaves the engine reusable.
 */
import { withTimeout, SAMPLE_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, MidiEngine } from './src/js/midiEngine.js'

let pass = 0
let fail = 0
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`) }
  else { fail++; console.log(`  FAIL  ${n}${x ? ` -- ${x}` : ''}`) }
}

const realFetch = globalThis.fetch

console.log('\n--- 1. withTimeout semantics ---')
ok('resolves a fast promise', (await withTimeout(Promise.resolve('ok'), 500)) === 'ok')
ok('rejects with a labelled timeout',
  await withTimeout(new Promise(() => {}), 60, 'Thing').then(() => false, (e) => e.message === 'Thing timed out after 60ms'))
ok('propagates a genuine rejection',
  await withTimeout(Promise.reject(new Error('boom')), 500).then(() => false, (e) => e.message === 'boom'))
console.log(`  SAMPLE_TIMEOUT_MS=${SAMPLE_TIMEOUT_MS}  PRELOAD_TIMEOUT_MS=${PRELOAD_TIMEOUT_MS}`)

const eng = new MidiEngine()
eng.ctx = { decodeAudioData: async () => ({}) }
eng.parsed = {
  duration: 10,
  tempo: 120,
  name: '',
  notes: [
    { midi: 60, time: 0, duration: 1 },
    { midi: 64, time: 1, duration: 1 }
  ]
}

console.log('\n--- 2. hung CDN that honours AbortSignal ---')
globalThis.fetch = (url, opts) =>
  new Promise((_, rej) => {
    if (opts?.signal) {
      opts.signal.addEventListener('abort', () =>
        rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }
  })
const t0 = Date.now()
const r1 = await eng.preload(eng.parsed.notes)
const ms1 = Date.now() - t0
console.log(`  ${JSON.stringify(r1)}  |  ${ms1}ms`)
ok('preload RESOLVED instead of hanging', r1 !== undefined)
ok('aborted samples are counted as failures', r1.failed === 2 && r1.loaded === 0)
ok('bounded by the per-request abort, faster than the outer guard',
  ms1 >= SAMPLE_TIMEOUT_MS - 800 && ms1 < PRELOAD_TIMEOUT_MS, `${ms1}ms`)
ok('failure is named', /Failed to load instrument samples/.test(r1.message), r1.message)
ok('engine remains reusable', (await eng.preload([])).total === 0)

console.log('\n--- 3. hung CDN that IGNORES AbortSignal (worst case) ---')
globalThis.fetch = () => new Promise(() => {})
const t1 = Date.now()
const r2 = await eng.preload(eng.parsed.notes)
const ms2 = Date.now() - t1
console.log(`  ${JSON.stringify(r2)}  |  ${ms2}ms`)
ok('still RESOLVES despite an uncancellable request', r2 !== undefined)
ok('flagged as timedOut', r2.timedOut === true)
ok('timeout message is helpful', /timed out/i.test(r2.message), r2.message)
ok('bounded by PRELOAD_TIMEOUT_MS', ms2 < PRELOAD_TIMEOUT_MS + 2500, `${ms2}ms`)

console.log('\n--- 4. HTTP 404 is not a timeout ---')
globalThis.fetch = async () => ({ ok: false, status: 404 })
const r3 = await eng.preload(eng.parsed.notes)
console.log(`  ${JSON.stringify(r3)}`)
ok('resolves with failures counted', r3.failed === 2 && r3.loaded === 0)
ok('timedOut is false for a fast 404', r3.timedOut === false)

console.log('\n--- 5. retry after failure succeeds ---')
globalThis.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) })
const r4 = await eng.preload(eng.parsed.notes)
console.log(`  ${JSON.stringify(r4)}`)
ok('retry loads every note', r4.loaded === 2 && r4.failed === 0)
ok('no stale failure message', r4.message === '')

globalThis.fetch = realFetch
console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
process.exit(fail === 0 ? 0 : 1)
