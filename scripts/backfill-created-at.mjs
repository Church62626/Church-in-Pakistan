/**
 * One-off repair: the first sync-hymns run stamped createdAt for every document,
 * including ones that already existed. This rewrites it as a merge-only
 * backfill so future re-runs preserve the date (see main()).
 *
 *   node scripts/backfill-created-at.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const key = JSON.parse(readFileSync(join(ROOT, 'service-account.json'), 'utf8'))
const db = getFirestore(initializeApp({ credential: cert(key) }))

const BATCH = 300
let last = null
let total = 0
let fixed = 0

for (;;) {
  let q = db.collection('hymns').limit(BATCH)
  if (last) q = q.orderBy(FieldPath.documentId()).startAfter(last)
  const snap = await q.get()
  if (snap.empty) break

  const batch = db.batch()
  let pending = 0
  for (const doc of snap.docs) {
    total++
    if (!doc.data().createdAt) {
      batch.set(doc.ref, { createdAt: FieldValue.serverTimestamp() }, { merge: true })
      fixed++
      pending++
    }
  }
  if (pending) await batch.commit()
  last = snap.docs[snap.docs.length - 1].ref
  process.stdout.write(`  scanned ${total}\r`)
}

console.log(`\nscanned ${total} | backfilled createdAt on ${fixed}`)
process.exit(0)