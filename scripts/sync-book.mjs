/**
 * Register (or refresh) a PDF book in the Firestore `books` collection.
 *
 * Usage
 *   node scripts/sync-book.mjs --language urdu --file book1.pdf [--title "Book One"]
 *   node scripts/sync-book.mjs --scan                       # walk the repo via the GitHub API
 *
 * Credentials are read from the project root, in this order:
 *   1. --credentials <path>
 *   2. ./service-account.json          (next to package.json)
 *   3. GOOGLE_APPLICATION_CREDENTIALS
 *   4. Application Default Credentials (gcloud auth application-default login)
 *
 * The project is pinned to the one the frontend reads (see
 * src/js/firebase-config.js). If the service account belongs to a different
 * project the script refuses to write, because a stray document in an
 * unrelated Firestore is far worse than a clear error.
 *
 * The Firestore document is the single source of truth for the frontend, so
 * re-running this for an existing file is safe and idempotent: the same
 * document ID is recomputed and merged, and `createdAt` is preserved.
 *
 * Run it AFTER the PDF is pushed to the `main` branch, otherwise the raw URL
 * 404s until GitHub has the blob.
 */

/* cspell:ignore firestore serviceaccount */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

export const BOOKS_REPO = 'Church62626/Church-Books'
export const BOOKS_BRANCH = 'main'
export const BOOKS_COLLECTION = 'books'

/** Exact raw-content URL convention the frontend links to. */
export function rawFileUrl(language, fileName) {
  return `https://raw.githubusercontent.com/${BOOKS_REPO}/${BOOKS_BRANCH}/books/${language}/${fileName}`
}

/**
 * Clean, stable document ID: `<language>-<slugified-title>`.
 *
 * The title is used (not the file name) so renaming `book1.pdf` to something
 * meaningful later does not orphan the Firestore document. Titles in Urdu,
 * Punjabi and Pashto are mostly non-Latin, which would slugify down to an empty
 * string, so a short content hash is appended to keep the ID unique and to make
 * re-running the script land on the same document.
 */
export function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip Latin accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function bookDocId(language, title) {
  const slug = slugify(title)
  if (slug) return `${language}-${slug}`
  const hash = createHash('sha1').update(`${language}/${title}`).digest('hex').slice(0, 8)
  return `${language}-book-${hash}`
}

/** Title derived from a PDF file name when --title is not supplied. */
export function titleFromFileName(fileName) {
  return basename(String(fileName), '.pdf').replace(/[_-]+/g, ' ').trim() || 'Untitled'
}

/** Only the languages the frontend actually renders are accepted. */
export const ALLOWED_LANGUAGES = [
  'urdu', 'roman-urdu', 'english', 'punjabi', 'pashto', 'sindhi', 'balochi', 'chinese'
]
export const ALLOWED_CATEGORIES = ['books', 'hymns', 'zaboor', 'bible', 'others']

/**
 * Build the document body. `createdAt` is deliberately left to the caller
 * (a Firestore FieldValue) so this stays a pure, testable function.
 */
export function buildBookDoc({ language, title, category = 'books', fileUrl }) {
  return {
    id: bookDocId(language, title),
    title: String(title).trim(),
    language,
    category,
    fileUrl,
    published: true
  }
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) { out[key] = next; i++ } else out[key] = true
  }
  return out
}

/**
 * Must match projectId in src/js/firebase-config.js. A document written into
 * any other project is invisible to the frontend.
 */
export const FIREBASE_PROJECT_ID = 'church-in-pakistan-web'

/**
 * Locate a service-account JSON without ever printing its contents.
 *
 * Each candidate is resolved against the PROJECT ROOT, not process.cwd(): the
 * script lives in scripts/, so a cwd-relative lookup misses the file whenever
 * it is run from anywhere other than the project root.
 */
export function findCredentials(explicit, root = ROOT, cwd = process.cwd()) {
  const candidates = [
    explicit,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    // The project root first, then the caller's cwd, then scripts/.
    // ROOT is the reliable anchor; cwd is honoured in case the key is kept
    // somewhere else and the script is run from there.
    join(root, 'service-account.json'),
    resolve(cwd, 'service-account.json'),
    join(root, 'scripts', 'service-account.json')
  ].filter(Boolean)
  // resolve() so a relative --credentials or env value is anchored, and
  // dedupe so the same file is never tested twice.
  return [...new Set(candidates.map((p) => resolve(p)))]
    .find((p) => existsSync(p)) || null
}

/**
 * Parse a service-account file and fail loudly on anything that would otherwise
 * surface deep inside the Google auth library as an opaque error.
 */
export function loadServiceAccount(credPath) {
  let raw
  try {
    raw = readFileSync(credPath, 'utf8')
  } catch (err) {
    throw new Error(`Could not read service account at ${credPath}: ${err.message}`)
  }

  let json
  try {
    json = JSON.parse(raw)
  } catch (err) {
    throw new Error(`${credPath} is not valid JSON: ${err.message}`)
  }

  if (json.type !== 'service_account') {
    throw new Error(`${credPath} is not a service account (type is "${json.type ?? 'missing'}")`)
  }
  for (const field of ['project_id', 'client_email', 'private_key']) {
    if (!json[field]) throw new Error(`${credPath} is missing "${field}"`)
  }
  return json
}

/** List the PDFs actually present in `books/<language>` on the repo. */
export async function listRepoFiles(language, fetchImpl = fetch) {
  const url = `https://api.github.com/repos/${BOOKS_REPO}/contents/books/${language}?ref=${BOOKS_BRANCH}`
  const res = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) {
    throw new Error(`GitHub listing for books/${language} failed: ${res.status} ${res.statusText}`)
  }
  const items = await res.json()
  if (!Array.isArray(items)) return []
  return items.filter((f) => f.type === 'file' && /\.pdf$/i.test(f.name)).map((f) => f.name)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 13).join('\n'))
    return
  }

  if (!args.language) {
    console.error('Error: --language is required (e.g. --language urdu)')
    process.exit(1)
  }
  const language = String(args.language).toLowerCase()
  if (!ALLOWED_LANGUAGES.includes(language)) {
    console.error(`Error: unknown language "${language}". Allowed: ${ALLOWED_LANGUAGES.join(', ')}`)
    process.exit(1)
  }

  const category = String(args.category || 'books').toLowerCase()
  if (!ALLOWED_CATEGORIES.includes(category)) {
    console.error(`Error: unknown category "${category}". Allowed: ${ALLOWED_CATEGORIES.join(', ')}`)
    process.exit(1)
  }

  // --scan discovers every PDF in the folder; otherwise register one file.
  let targets = []
  if (args.scan) {
    targets = (await listRepoFiles(language)).map((name) => ({
      fileName: name,
      title: args.title ? String(args.title) : titleFromFileName(name)
    }))
    if (targets.length === 0) {
      console.log(`No PDFs found in books/${language} - nothing to do.`)
      return
    }
  } else {
    if (!args.file) {
      console.error('Error: --file is required (or use --scan to sync every PDF in the folder)')
      process.exit(1)
    }
    const fileName = basename(String(args.file))
    if (!/\.pdf$/i.test(fileName)) {
      console.error(`Error: "${fileName}" is not a .pdf`)
      process.exit(1)
    }
    targets = [{ fileName, title: args.title ? String(args.title) : titleFromFileName(fileName) }]
  }

  const credPath = findCredentials(args.credentials)
  if (!credPath) {
    console.error(
      'Error: no service-account.json found.\n' +
      `       Looked in: ${join(ROOT, 'service-account.json')}\n` +
      '       Place the downloaded key there (it is gitignored), or pass\n' +
      '       --credentials <path>, or set GOOGLE_APPLICATION_CREDENTIALS.'
    )
    process.exit(1)
  }
  console.log(`Using credentials: ${credPath}`)

  // Imported lazily so the pure helpers above can be unit-tested without
  // firebase-admin or any credentials present.
  const { initializeApp, cert } = await import('firebase-admin/app')
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore')

  // `cert()` wants the PARSED OBJECT. Passing the raw file contents (a string)
  // is silently accepted and later treated as a file path, which surfaces as
  // "no such file or directory, open '{ \"type\": \"service_account\", ... }'".
  const key = loadServiceAccount(credPath)

  // Guard against writing into the wrong project's Firestore: the frontend
  // only ever reads FIREBASE_PROJECT_ID, so a document written anywhere else
  // is invisible and effectively a silent data leak.
  if (key.project_id !== FIREBASE_PROJECT_ID) {
    console.error(
      `Error: ${credPath} belongs to project "${key.project_id}",\n` +
      `       but the frontend reads "${FIREBASE_PROJECT_ID}"\n` +
      '       (src/js/firebase-config.js). Refusing to write to the wrong Firestore.\n' +
      '       Download a service account for ' + FIREBASE_PROJECT_ID + ' from\n' +
      '       https://console.firebase.google.com/project/' + FIREBASE_PROJECT_ID + '/serviceaccounts'
    )
    process.exit(1)
  }

  const app = initializeApp({ credential: cert(key) })
  const db = getFirestore(app)
  const col = db.collection(BOOKS_COLLECTION)

  let created = 0
  let updated = 0

  for (const t of targets) {
    const doc = buildBookDoc({
      language,
      title: t.title,
      category,
      fileUrl: rawFileUrl(language, t.fileName)
    })

    const ref = col.doc(doc.id)
    const existing = await ref.get()
    // Preserve the original publish date on re-sync, but only stamp
    // createdAt the first time the document appears.
    const payload = {
      ...doc,
      fileName: t.fileName,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() })
    }

    await ref.set(payload, { merge: true })
    existing.exists ? updated++ : created++
    console.log(`${existing.exists ? 'updated' : 'created'}  ${doc.id}`)
    console.log(`          ${payload.fileUrl}`)
  }

  console.log(`\nDone. ${created} created, ${updated} updated in "${BOOKS_COLLECTION}".`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`\nSync failed: ${err.message}`)
    process.exit(1)
  })
}