/**
 * Guards against the mojibake regression.
 *
 * A lossy shell write once turned every emoji in three .vue files into 2-4
 * mangled characters. These tests pin the decoder to real byte sequences and
 * assert no source file can drift back into that state.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { repairText, hasMojibake } from './scripts/repair-mojibake.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

let pass = 0
let fail = 0
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}${extra ? ` -- ${extra}` : ''}`) }
}
const eq = (label, actual, expected) =>
  ok(label, actual === expected,
    `\n        got:  ${JSON.stringify(actual)}\n        want: ${JSON.stringify(expected)}`)

/** Re-create mojibake the way the broken shell pipeline did. */
const corrupt = (text) => Buffer.from(text, 'utf8').toString('latin1')

console.log('\n--- 1. decoder inverts the corruption exactly ---')
// Every character that actually appears in the damaged files, plus the
// typographic punctuation used across the app.
const pairs = [
  '\u{1F3B5}', // musical note   (nav: List)
  '\u{1F4D6}', // open book      (nav: Library, List)
  '\u{1F4E6}', // books          (Library)
  '\u{1F6D2}', // shopping cart  (nav: Store)
  '\u{1F4C5}', // calendar       (nav: Events)
  '\u{2139}\u{FE0F}', // information (nav: About)
  '\u{1F4C8}', // chart
  '\u{1F4C9}', // page
  '\u{1F3A7}', // headphone
  '\u{1F441}\u{FE0F}', // eyes
  '\u{1F4C1}', // file folder
  '\u{1F4C4}', // floppy disk
  '\u{1F3A4}', // microphone
  '\u{1F441}', // eye
  '\u2190',    // left arrow
  '\u2192',    // right arrow
  '\u2014',    // em dash
  '\u2026',    // ellipsis
  '\u201C',    // left double quote
  '\u00D7',    // multiplication sign
  '\u25B6',    // play
  '\u23F8',    // pause
  '\u2039',    // single left angle quote
  '\u203A',    // single right angle quote
  '\u00A7',    // section sign
  '\u266A',    // eighth note
  '\u2713',    // check mark
  '\u2022'     // bullet
]
for (const good of pairs) {
  eq(`${JSON.stringify(good)} survives a round trip`, repairText(corrupt(good)), good)
}

console.log('\n--- 2. real text is never mangled ---')
// The decoder must not "repair" ordinary accented text just because it is
// non-ASCII. Failing here would silently corrupt real content.
for (const text of ['Jos\u00E9', 'na\u00EFve', '\u00C0\u00E7\u00E3o', 'Ma\u00F1ana', 'Stra\u00DFe']) {
  eq(`leaves ${text} alone`, repairText(text), text)
}
eq('leaves pure ASCII alone', repairText('Hello, world! 123'), 'Hello, world! 123')
eq('handles a mixed sentence', repairText('Caf\u00E9 ' + corrupt('\u2615')), 'Caf\u00E9 \u2615')
eq('is idempotent (safe to run twice)',
  repairText(repairText(corrupt('\u{1F3B5}'))), '\u{1F3B5}')

console.log('\n--- 3. whole strings round trip ---')
const sentence = `Welcome ${corrupt('\u{1F3B5}')} to the ${corrupt('\u{1F4D6}')} library \u2014 enjoy!`
eq('a realistic line is fully restored', repairText(sentence),
  `Welcome \u{1F3B5} to the \u{1F4D6} library \u2014 enjoy!`)

console.log('\n--- 4. no source file contains mojibake ---')
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(vue|js|mjs|css|html|json)$/.test(name)) out.push(full)
  }
  return out
}
const files = walk(join(ROOT, 'src')).concat([
  join(ROOT, 'index.html'),
  join(ROOT, 'scripts', 'sync-hymns.mjs')
])
const dirty = files.filter((f) => hasMojibake(readFileSync(f, 'utf8')))
ok(`all ${files.length} source files are free of mojibake`, dirty.length === 0,
  dirty.map((f) => relative(ROOT, f)).join(', '))

console.log('\n--- 5. the damaged files are genuinely clean ---')
// "No mojibake" alone is not enough - the emoji must actually be present.
for (const [file, emoji] of [
  ['src/components/AppNavigation.vue', '\u{1F3B5}'],
  ['src/pages/Library.vue', '\u{1F4D6}'],
  ['src/pages/List.vue', '\u2190']
]) {
  const text = read(file)
  ok(`${file} contains ${JSON.stringify(emoji)}`, text.includes(emoji))
  ok(`${file} has no mojibake`, !hasMojibake(text))
}

console.log('\n--- 5b. no leftover corruption anywhere, byte for byte ---')
// A half-repaired sequence leaves isolated lead bytes such as U+00E2 behind,
// which looks harmless in review but is still broken output. The reliable
// signal is not a hand-written allowlist - emoji legitimately vary - but the
// two things corruption always leaves behind: a C1 control character, and a
// Latin-1 lead byte (U+00F0/U+00E2/U+00C3) sitting next to the U+0178/quote
// range that only appears when UTF-8 has been misread.
const CORRUPTION_MARKERS = /[\u0080-\u009F\u00F0\u00E2\u00C3]/
for (const file of [
  'src/components/AppNavigation.vue',
  'src/pages/Library.vue',
  'src/pages/List.vue'
]) {
  const text = read(file)

  const controls = [...text].filter((c) => {
    const v = c.codePointAt(0)
    return v >= 0x80 && v <= 0x9f
  })
  ok(`${file} has no C1 control characters`, controls.length === 0, String(controls.length))

  const leads = [...text].filter((c) => /[\u00F0\u00E2\u00C3]/.test(c))
  ok(`${file} has no stray UTF-8 lead bytes`, leads.length === 0,
    leads.map((c) => `U+${c.codePointAt(0).toString(16)}`).join(' '))

  ok(`${file} has no corruption marker at all`, !CORRUPTION_MARKERS.test(text))
  ok(`${file} has no byte-order mark`, text.charCodeAt(0) !== 0xfeff)

  // Sanity: real emoji and punctuation must still be present, proving the
  // repair decoded content rather than deleting it.
  const nonAscii = [...text].filter((c) => c.codePointAt(0) > 0x7f).length
  ok(`${file} still contains its real non-ASCII content`, nonAscii > 0, String(nonAscii))
}

console.log('\n--- 6. index.html declares UTF-8 ---')
const html = read('index.html')
ok('has a charset meta tag', /<meta\s+charset=["']?UTF-8/i.test(html))
const headStart = html.indexOf('<head>')
const charsetAt = html.indexOf('charset')
ok('charset appears inside <head>', headStart !== -1 && charsetAt > headStart)

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
process.exit(fail === 0 ? 0 : 1)