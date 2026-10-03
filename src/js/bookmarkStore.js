/**
 * Cloud bookmark storage for the E-Book reader.
 *
 * Split out of appsService.js on purpose: that module is imported by the test
 * suite under bare Node, and `firebase/app` only resolves through the bundler,
 * so a firebase import there breaks every test that touches the apps
 * catalogue. Keeping the Firestore layer here leaves appsService dependency-free.
 *
 * Every function degrades rather than throws: the device-local copy in
 * appsService.js is written first, so a network failure, a Firestore rules
 * error or an offline visitor never loses a bookmark.
 */
import { auth, db } from './firebase-config.js'
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore/lite'
import {
  saveBookmarkLocal,
  readBookmarkLocal,
  removeBookmarkLocal
} from './appsService.js'

const COLLECTION = 'bookmarks'

/** The signed-in user's email, or '' when signed out. */
export function currentUserEmail() {
  return auth?.currentUser?.email || ''
}

/** Document id for one user's copy of one book. Stable, so re-saving updates. */
function docIdFor(email, bookId) {
  return `${encodeURIComponent(email)}__${bookId}`
}

/**
 * Save a bookmark. Writes to the device first, then mirrors to Firestore when
 * signed in. Returns `{ ok, reason }` where reason is 'cloud' | 'local'.
 */
export async function saveBookmark(book) {
  const local = saveBookmarkLocal(book)
  if (!local.ok) return local

  const email = currentUserEmail()
  if (!email) return { ok: true, reason: 'local' }

  try {
    await setDoc(
      doc(db, COLLECTION, docIdFor(email, book.id)),
      { ...local.entry, owner: email },
      { merge: true }
    )
    return { ok: true, reason: 'cloud' }
  } catch (err) {
    // Never surface a raw Firestore error to the reader; the device copy stands.
    console.warn('ebooks: cloud bookmark failed, keeping local copy:', err?.message)
    return { ok: true, reason: 'local' }
  }
}

/** Read a bookmark, preferring the cloud copy but falling back to the device. */
export async function readBookmark(bookId) {
  const local = readBookmarkLocal(bookId)
  const email = currentUserEmail()
  if (!email) return local
  try {
    const snap = await getDoc(doc(db, COLLECTION, docIdFor(email, bookId)))
    if (!snap.exists()) return local
    return { ...snap.data(), bookId }
  } catch {
    return local
  }
}

/** Remove a bookmark from both stores. */
export async function removeBookmark(bookId) {
  removeBookmarkLocal(bookId)
  const email = currentUserEmail()
  if (!email) return
  try {
    await deleteDoc(doc(db, COLLECTION, docIdFor(email, bookId)))
  } catch (err) {
    console.warn('ebooks: could not remove cloud bookmark:', err?.message)
  }
}
