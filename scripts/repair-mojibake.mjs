/**
 * Repair mojibake: repair-mojibake.mjs
 *
 * Some .vue files were written through a lossy shell pipeline that decoded
 * UTF-8 bytes as Windows-1252 and then re-encoded them as UTF-8. That turns a
 * single emoji into 2-4 mangled characters, e.g. U+1F3B5 (MUSICAL NOTE) became
 *
 *     F0 9F 8E B5  ->  decoded as cp1252  ->  U+00F0 U+0178 U+017D U+00B5
 *     rendered as   ->  "ðŸŽµ"
 *
 * <meta charset="UTF-8"> is present and correct, and the bytes on disk are valid
 * UTF-8, so this is NOT a missing-charset problem - the damage is already baked
 * into the source text and has to be undone character by character.
 *
 * The fix is the exact inverse: re-encode each mangled character back to the
 * single byte cp1252 produced, then decode that byte sequence as UTF-8. This
 * restores the original character precisely, without guessing.
 *
 *   node scripts/repair-mojibake.mjs            # report only
 *   node scripts/repair-mojibake.mjs --write    # rewrite the files
 *
 * Safe to re-run: once repaired there is nothing left to convert, so a second
 * pass is a no-op rather than double-encoding.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Characters that can appear as a result of the corruption.
 *
 * A mangled emoji is a *run* of characters, and the run can contain characters
 * from several blocks: the C1 controls (U+0080..U+009F, which are what UTF-8
 * continuation bytes become under cp1252), Latin-1 supplement, Latin
 * Extended-A, and the General Punctuation (U+2000..U+206F) and Currency
 * Symbols (U+20A0..U+20CF) blocks, where cp1252 puts U+201C, U+201D, U+2026,
 * U+203A and the euro sign U+20AC.
 *
 * The upper bound therefore has to reach U+22FF. If a run is cut short, the
 * partial bytes fail the UTF-8 round-trip check and the sequence is left
 * unrepaired - which is exactly the "STILL BROKEN" symptom. The euro sign is
 * the concrete case: an ellipsis arrives as U+00E2 U+20AC U+00A6, so leaving
 * U+20AC outside the range splits that run in two and neither half decodes.
 *
 * The candidate run is only *committed* if it decodes to valid UTF-8 and
 * round-trips exactly, so accented text such as "Jose" or "nu" is left
 * untouched despite falling in the same range.
 */
function isSuspect(ch) {
  const c = ch.codePointAt(0)
  // The BOM is its own character. A PowerShell `Set-Content -Encoding UTF8`
  // writes prepends one, and left in place Vue treats it as a stray text node
  // at the top of the template. It is stripped alongside the mojibake.
  if (c === 0xfeff) return true
  return c >= 0x80 && c <= 0x22ff
}

/** cp1252 high range -> Unicode, the inverse of Node's cp1252 decoder. */
const CP1252 = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
  0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
  0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178
}
/** Unicode -> cp1252 byte. Only the characters where cp1252 DIFFERS from
 *  Latin-1 need an entry: cp1252 keeps 0xA0-0xFF as Latin-1, but remaps
 *  0x80-0x9F to printable characters. Including the whole 0x80-0x9F range here
 *  is safe, and everything outside it takes the Latin-1 identity path. */
const CP1252_REVERSE = new Map()
for (const [byte, uni] of Object.entries(CP1252)) {
  CP1252_REVERSE.set(String.fromCodePoint(uni), Number(byte))
}

/** One mangled character -> the single byte cp1252 produced for it.
 *
 *  Order matters: the cp1252 table must be consulted BEFORE the plain
 *  Latin-1 identity. U+0178 and U+017D are above 0xFF, so a naive
 *  "if (code <= 0xFF) return code" test would hand back 0x178 instead of the
 *  byte 0x9F that cp1252 actually emitted - and the whole run would then fail
 *  to decode. Only genuinely Latin-1 characters (0x00..0xFF) take the identity
 *  path, and the C1 controls 0x80..0x9F map to themselves.
 */
function toByte(ch) {
  if (CP1252_REVERSE.has(ch)) return CP1252_REVERSE.get(ch)
  const c = ch.codePointAt(0)
  if (c <= 0xff) return c
  return null
}

/**
 * Attempt to decode a run of suspect characters back to what it originally was.
 * Returns null unless the result is valid, self-consistent UTF-8 - a run that
 * does not decode cleanly is genuine text and is left untouched.
 */
export function repairRun(run) {
  // A run made only of a BOM repairs to nothing - that is the intent, and it
  // must not fall through to the byte-rebuild path with an empty buffer.
  if (run === '\uFEFF') return ''

  const bytes = []
  for (const ch of run) {
    const b = toByte(ch)
    if (b === null) return null
    bytes.push(b)
  }

  const buf = Buffer.from(bytes)
  const decoded = buf.toString('utf8')

  // Round-trip check: re-encoding must give the same bytes. This rejects any
  // run that is real text rather than mojibake.
  if (!Buffer.from(decoded, 'utf8').equals(buf)) return null
  // Reject a decode that still carries the classic mojibake *lead* bytes.
  // A single Latin-1 letter such as "e-acute" (U+00E9) is legitimate text and
  // must not trip this check - only U+00F0/U+00E2/U+00C3 followed by the
  // U+0178 / quote range signals real damage.
  if (/[\u00F0\u00E2\u00C3][\u0178\u2018\u2019\u201A\u0152\u0153\u00A0-\u00BF]/.test(decoded)) {
    return null
  }
  return decoded
}

/** Repair a whole string, scanning maximal runs of suspect characters. */
export function repairText(text) {
  let out = ''
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (!isSuspect(ch)) { out += ch; i++; continue }

    let j = i
    while (j < text.length && isSuspect(text[j])) j++
    const run = text.slice(i, j)
    const fixed = repairRun(run)
    out += fixed === null ? run : fixed
    i = j
  }
  return out
}

/** True when the text still contains classic mojibake. */
export function hasMojibake(text) {
  return /[\u00F0\u00E2\u00C3][\u0178\u2018\u2019\u201A\u0152\u0153\u00A0-\u00BF]/.test(text)
}

export const TARGETS = [
  'src/components/AppNavigation.vue',
  'src/pages/Library.vue',
  'src/pages/List.vue'
]

export function main(argv = process.argv.slice(2)) {
  const write = argv.includes('--write')
  let totalFixed = 0
  let changed = 0

  for (const rel of TARGETS) {
    const path = join(ROOT, rel)
    const original = readFileSync(path, 'utf8')
    if (!hasMojibake(original)) {
      console.log(`  clean  ${rel}`)
      continue
    }
    const repaired = repairText(original)
    const before = (original.match(/[\u00F0\u00E2\u00C3][\u0178\u2018\u2019\u201A]/g) || []).length
    const after = hasMojibake(repaired)
    console.log(`  FIXED  ${rel}  ${before} sequences -> ${after ? 'STILL BROKEN' : 'clean'}`)
    totalFixed += before
    if (repaired !== original) {
      changed++
      if (write) writeFileSync(path, repaired, 'utf8')
    }
  }

  console.log(`\n${totalFixed} mojibake sequence(s) found across ${changed} file(s).`)
  if (totalFixed && !write) {
    console.log('Nothing written. Re-run with --write to apply.')
  } else if (write) {
    console.log('Written.')
  }
  return totalFixed
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
