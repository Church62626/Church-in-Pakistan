/**
 * Mirror the REAL hymn corpus into the Firestore `hymns` collection.
 *
 * Source of truth is the same GitHub raw content the site already serves:
 *   lyrics : Church62626/Church-in-Pakistan -> Hymns-contents/<lang>/<category>[_xx].json
 *   media  : Church62626/hymns-audio-       -> <category>/<id>.mp3 , MIDI/<category>/<id>.mid
 *
 * Nothing is invented here: every field comes from the published JSON, and the
 * media URLs follow the same candidate rules as src/js/hymnService.js so a
 * mirrored document and a served document agree on which file to try.
 *
 * Usage
 *   node scripts/sync-hymns.mjs                 # every language/category
 *   node scripts/sync-hymns.mjs --language urdu  # just one language
 *   node scripts/sync-hymns.mjs --dry-run        # report only, write nothing
 *
 * Re-running is idempotent: document IDs are `<language>-<category>-<id>`, so
 * the same hymn always overwrites the same document and createdAt is preserved.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

export const LYRICS_BASE =
  'https://raw.githubusercontent.com/Church62626/Church-in-Pakistan/main/Hymns-contents/'
export const AUDIO_BASE = 'https://raw.githubusercontent.com/Church62626/hymns-audio-/main/'

/** Must match projectId in src/js/firebase-config.js. */
export const FIREBASE_PROJECT_ID = 'church-in-pakistan-web'
export const HYMNS_COLLECTION = 'hymns'

/**
 * Languages that actually have a lyrics file published on the repo.
 *
 * `file(category)` is the single source of truth for the file name. `unified`
 * marks a language published as ONE combined file rather than one per category:
 * Chinese ships a single `hymnal_zh.json` holding all 807 hymns, and its own
 * `cat`/`subcat` fields carry the real grouping. Mirroring it as three
 * documents-per-category would be wrong, so it is fetched once and written with
 * the `hymns` category - which is also the only audio folder that exists.
 */
export const SUPPORTED = [
  { key: 'english', file: (c) => `${c}_en.json` },
  { key: 'urdu', file: (c) => (c === 'newsong' ? 'newsongs.json' : `${c}.json`) },
  { key: 'roman-urdu', file: (c) => `${c}_ru.json` },
  { key: 'chinese', file: () => 'hymnal_zh.json', unified: true, category: 'hymns' }
]
export const CATEGORIES = ['hymns', 'newsong', 'others']

/** Stable document ID. The category is included so hymn "1" never collides across books. */
export function hymnDocId(language, category, id) {
  return `${language}-${category}-${String(id).trim()}`
}

/* --- media URL rules, mirrored from src/js/hymnService.js ----------------- */

/** 'C273' -> '273'. Only mp3 file names drop the letter prefix. */
export function stripLetters(id) {
  const key = String(id == null ? '' : id).trim()
  const stripped = key.replace(/^[^\d]+/, '')
  return stripped.length > 0 ? stripped : key
}

export function mediaUrls(category, id) {
  const key = String(id == null ? '' : id).trim()
  if (!key) return { mp3Url: '', midiUrl: '' }
  const numeric = stripLetters(key)

  const midi = category === 'others'
    ? [`${AUDIO_BASE}another/${key}.mid`, `${AUDIO_BASE}MIDI/others/${key}.mid`]
    : [`${AUDIO_BASE}MIDI/${category}/${key}.mid`, `${AUDIO_BASE}MIDI/${category}/${numeric}.mid`]

  const folder = category === 'others' ? 'another' : category
  const mp3 = [`${AUDIO_BASE}${folder}/${numeric}.mp3`, `${AUDIO_BASE}${numeric}.mp3`]

  return { mp3Url: mp3[0], midiUrl: midi[0] }
}

/**
 * Firestore rejects nested arrays, but the published lyrics store each stanza as
 * an array of lines: content = [[line, line], [line, line]]. Stanzas are joined
 * into single strings here, preserving the exact text and the stanza boundaries,
 * so no lyric line is lost and the document stays legal.
 */
export function normaliseContent(value) {
  if (!Array.isArray(value)) return []
  return value.map((stanza) => {
    if (Array.isArray(stanza)) return stanza.join('\n')
    return stanza == null ? '' : String(stanza)
  })
}

/**
 * Shape one published entry into a Firestore document.
 * Titles/choruses arrive as arrays of lines; they are joined for display, and
 * `content` keeps every stanza verbatim.
 *
 * The Chinese hymnal carries a much richer schema than the other three
 * languages (verified on main): zh_no, author, composer, scripture, meter and
 * an en_id/en_title cross-link back to the English hymnal. Those are mapped
 * here rather than discarded. They are omitted entirely for the other
 * languages, whose entries have no such fields - so no empty keys are written
 * and the existing English/Urdu documents are byte-for-byte unchanged.
 */
export function buildHymnDoc({ language, category, entry }) {
  const id = String(entry?.id ?? '').trim()
  const lines = (v) => (Array.isArray(v) ? v.join('\n') : v == null ? '' : String(v))
  const { mp3Url, midiUrl } = mediaUrls(category, id)
  const text = (v) => {
    const s = v == null ? '' : String(v).trim()
    return s === '' ? null : s
  }

  const doc = {
    id,
    language,
    category,
    title: lines(entry?.title),
    chorus: lines(entry?.chorus),
    content: normaliseContent(entry?.content),
    subcat: entry?.subcat ?? null,
    mp3Url,
    midiUrl,
    published: true
  }

  // Chinese-only metadata. `cat` is the top-level hymnal section, which is
  // distinct from the app's `category` (which is the audio/book folder).
  if (entry?.cat != null) doc.cat = text(entry.cat)
  if (entry?.zh_no != null) doc.zhNo = Number(entry.zh_no) || entry.zh_no
  if (entry?.author != null) doc.author = text(entry.author)
  if (entry?.composer != null) doc.composer = text(entry.composer)
  if (entry?.scripture != null) doc.scripture = text(entry.scripture)
  if (entry?.meter != null) doc.meter = text(entry.meter)
  if (entry?.en_id != null) doc.enId = text(entry.en_id)
  if (entry?.en_title != null) doc.enTitle = text(entry.en_title)

  return doc
}

/* --- credentials ---------------------------------------------------------- */

export function findCredentials(explicit, root = ROOT, cwd = process.cwd()) {
  const candidates = [
    explicit,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    join(root, 'service-account.json'),
    resolve(cwd, 'service-account.json')
  ].filter(Boolean)
  return [...new Set(candidates.map((p) => resolve(p)))]
    .find((p) => existsSync(p)) || null
}

export function loadServiceAccount(credPath) {
  const raw = readFileSync(credPath, 'utf8')
  let json
  try {
    json = JSON.parse(raw)
  } catch (err) {
    throw new Error(`${credPath} is not valid JSON: ${err.message}`)
  }
  for (const field of ['project_id', 'client_email', 'private_key']) {
    if (!json[field]) throw new Error(`${credPath} is missing "${field}"`)
  }
  return json
}

/* --- fetch + flatten ------------------------------------------------------ */

/**
 * A source file that fails to parse is reported and skipped, never guessed at.
 */
export async function fetchEntries(language, category, fetchImpl = fetch) {
  const spec = SUPPORTED.find((l) => l.key === language)
  if (!spec) throw new Error(`Unsupported language "${language}"`)
  const url = `${LYRICS_BASE}${language}/${spec.file(category)}`

  const res = await fetchImpl(url)
  if (!res.ok) return { entries: [], url, problem: `HTTP ${res.status}` }

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch (err) {
    // Reported, never silently skipped: a corrupt upstream file is a real bug
    // and must be fixed in the lyrics repo, not papered over here.
    return { entries: [], url, problem: `invalid JSON - ${err.message}` }
  }

  const arr = Array.isArray(data) ? data : Object.values(data).flat()
  return { entries: arr, url, problem: null }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const key = String(argv[i]).replace(/^--/, '')
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) { out[key] = next; i++ } else out[key] = true
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dryRun = Boolean(args['dry-run'])
  const languages = args.language ? [String(args.language)] : SUPPORTED.map((l) => l.key)

  const docs = []
  const problems = []

  for (const language of languages) {
    const spec = SUPPORTED.find((l) => l.key === language)
    // A unified language (Chinese) publishes ONE file, so it is fetched once
    // under its real book category instead of once per category - which would
    // otherwise write the same 807 hymns three times under three doc-id
    // prefixes, two of which would be duplicates of content that does not
    // exist as a separate book.
    const categories = spec?.unified ? [spec.category || 'hymns'] : CATEGORIES

    for (const category of categories) {
      const { entries, url, problem } = await fetchEntries(language, category)
      if (problem) {
        problems.push(`${language}/${category}: ${problem} (${url})`)
        continue
      }
      let added = 0
      let skippedNoId = 0
      for (const entry of entries) {
        const doc = buildHymnDoc({ language, category, entry })
        if (!doc.id) { skippedNoId++; continue }
        docs.push({ docId: hymnDocId(language, category, doc.id), ...doc })
        added++
      }
      console.log(`  ${language}/${category}: ${added} hymns` +
        (skippedNoId ? ` (${skippedNoId} skipped: no id)` : ''))
    }
  }

  console.log(`\nCollected ${docs.length} hymns from the real published lyrics.`)
  for (const p of problems) console.log(`  ! ${p}`)

  // A duplicate document id means two languages would overwrite each other, and
  // the loser's lyrics would silently vanish. The id already includes the
  // language, so this should be empty; it is checked rather than assumed.
  const seenIds = new Set()
  const dupes = []
  for (const d of docs) {
    if (seenIds.has(d.docId)) dupes.push(d.docId)
    seenIds.add(d.docId)
  }
  if (dupes.length) {
    console.error(`\nError: ${dupes.length} duplicate document id(s), refusing to write:`)
    for (const d of dupes.slice(0, 10)) console.error(`  - ${d}`)
    process.exit(1)
  }
  console.log(`  ${seenIds.size} unique document ids (no collisions).`)

  if (dryRun) {
    console.log('\n--dry-run: nothing written.')
    return
  }

  const credPath = findCredentials(args.credentials)
  if (!credPath) {
    console.error('Error: no service-account.json found. Place it in the project root.')
    process.exit(1)
  }
  const key = loadServiceAccount(credPath)
  if (key.project_id !== FIREBASE_PROJECT_ID) {
    console.error(
      `Error: ${credPath} is for "${key.project_id}" but the frontend reads ` +
      `"${FIREBASE_PROJECT_ID}". Refusing to write to the wrong Firestore.`
    )
    process.exit(1)
  }

  const { initializeApp, cert } = await import('firebase-admin/app')
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore')
  const db = getFirestore(initializeApp({ credential: cert(key) }))
  const col = db.collection(HYMNS_COLLECTION)

  const BATCH = 400 // Firestore's hard limit is 500 writes per batch.
  let created = 0

  for (let i = 0; i < docs.length; i += BATCH) {
    const slice = docs.slice(i, i + BATCH)
    // Which of these documents are new? Read BEFORE writing, otherwise every
    // document already exists by stamp time and createdAt never gets set.
    const newRefs = await db.runTransaction(async (tx) => {
      const reads = await Promise.all(slice.map((d) => tx.get(col.doc(d.docId))))
      return reads.filter((s) => !s.exists).map((s) => s.ref)
    })

    const batch = db.batch()
    for (const d of slice) {
      batch.set(col.doc(d.docId), {
        id: d.id,
        language: d.language,
        category: d.category,
        title: d.title,
        chorus: d.chorus,
        content: d.content,
        subcat: d.subcat,
        // Chinese-only metadata. Written only when present so existing
        // English/Urdu documents are untouched by this change.
        ...(d.cat != null ? { cat: d.cat } : {}),
        ...(d.zhNo != null ? { zhNo: d.zhNo } : {}),
        ...(d.author != null ? { author: d.author } : {}),
        ...(d.composer != null ? { composer: d.composer } : {}),
        ...(d.scripture != null ? { scripture: d.scripture } : {}),
        ...(d.meter != null ? { meter: d.meter } : {}),
        ...(d.enId != null ? { enId: d.enId } : {}),
        ...(d.enTitle != null ? { enTitle: d.enTitle } : {}),
        mp3Url: d.mp3Url,
        midiUrl: d.midiUrl,
        published: true,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true })
    }
    // createdAt is stamped ONLY on documents that did not exist, so a re-run
    // refreshes the lyrics but preserves the original publish date.
    for (const ref of newRefs) {
      batch.set(ref, { createdAt: FieldValue.serverTimestamp() }, { merge: true })
    }
    created += newRefs.length
    await batch.commit()
    process.stdout.write(`  wrote ${Math.min(i + BATCH, docs.length)}/${docs.length}\r`)
  }

  console.log(
    `\nDone. ${docs.length} hymns synced to "${HYMNS_COLLECTION}" ` +
    `(${created} new, ${docs.length - created} refreshed).`
  )
  if (problems.length) {
    console.log(`\n${problems.length} file(s) skipped - fix them upstream and re-run:`)
    for (const p of problems) console.log(`  - ${p}`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`\nSync failed: ${err.message}`)
    process.exit(1)
  })
}