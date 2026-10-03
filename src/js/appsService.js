/**
 * Church apps catalogue.
 *
 * The apps live in the `church-apps/` folder of the main repo. This service
 * reads that folder over the GitHub Contents API rather than hard-coding a
 * list, so publishing a new app (by adding a file to that folder) makes it
 * appear on the Apps screen automatically - no redeploy needed.
 *
 * The folder is pinned to the commit referenced by the Products menu link, so
 * the catalogue cannot change under a visitor mid-session. `APPS_REF` is the
 * only thing to bump when a new app is published.
 */

export const APPS_REPO = 'Church62626/Church-in-Pakistan'
export const APPS_PATH = 'church-apps'

/**
 * Pinned to the commit the Products menu link points at. Using a branch here
 * would let the catalogue change without a deploy; pinning keeps what a visitor
 * sees stable.
 */
export const APPS_REF = '5ed70b2fb5a4514eba8fc8a5051ea5ab8795fdda'

export const APPS_BROWSER_URL =
  `https://github.com/${APPS_REPO}/tree/${APPS_REF}/${APPS_PATH}`

const CONTENTS_API =
  `https://api.github.com/repos/${APPS_REPO}/contents/${APPS_PATH}?ref=${APPS_REF}`

/**
 * Files that describe the folder rather than being an app. `church-apps.txt`
 * is currently the only entry in the folder and it is empty; it is a
 * placeholder, not a download, so it must never be rendered as one.
 */
const NON_APP_FILES = /^(readme|church-apps)\.(txt|md)$/i

/**
 * Platform detection from the file extension, so the Apps screen can show an
 * icon and a real download link without per-app metadata to maintain.
 */
function platformFor(name) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  if (['apk', 'aab', 'xapk'].includes(ext)) return { id: 'android', label: 'Android', icon: '🤖' }
  if (ext === 'ipa') return { id: 'ios', label: 'iOS', icon: '🍎' }
  if (['exe', 'msi', 'dmg', 'pkg', 'appimage', 'deb'].includes(ext)) {
    return { id: 'desktop', label: 'Desktop', icon: '💻' }
  }
  return { id: 'other', label: 'Download', icon: '📦' }
}

/** Human title from a file name: `lord-recovery-hymnal_v2.1.0.apk`
 *  -> `Lord Recovery Hymnal V2.1.0` */
function titleFor(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * List the downloadable apps in the folder.
 *
 * Resolves to `{ apps, problem }`. Failures are reported through `problem`
 * rather than thrown, because a network problem must not break the nav: the
 * caller renders an honest message plus a link to GitHub, which always works.
 * `problem` is one of 'unavailable' | 'rate-limited' | 'not-found' | 'unknown'.
 */
export async function fetchApps() {
  let res
  try {
    res = await fetch(CONTENTS_API, { headers: { Accept: 'application/vnd.github+json' } })
  } catch (err) {
    return { apps: [], problem: 'unavailable', detail: err?.message || '' }
  }

  if (res.status === 404) return { apps: [], problem: 'not-found', detail: '' }
  // GitHub rate-limits unauthenticated API calls. That is not our fault and it
  // is temporary, so it gets its own honest message instead of a generic error.
  if (res.status === 403 || res.status === 429) {
    return { apps: [], problem: 'rate-limited', detail: '' }
  }
  if (!res.ok) return { apps: [], problem: 'unknown', detail: `HTTP ${res.status}` }

  let entries
  try {
    entries = await res.json()
  } catch {
    return { apps: [], problem: 'unknown', detail: 'Malformed response' }
  }
  if (!Array.isArray(entries)) return { apps: [], problem: 'unknown', detail: '' }

  const apps = entries
    .filter((e) => e && e.type === 'file' && e.name && !NON_APP_FILES.test(e.name))
    .map((e) => ({
      id: e.name,
      name: titleFor(e.name),
      file: e.name,
      platform: platformFor(e.name),
      // `download_url` is GitHub's raw CDN link; `html_url` is the file's page
      // on github.com. Both are kept so a card can fall back to the page when
      // the raw link is blocked by a network.
      downloadUrl: e.download_url || '',
      pageUrl: e.html_url || APPS_BROWSER_URL,
      size: Number(e.size) || 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { apps, problem: '' }
}

/** Byte count to a short size label. Empty for an unknown size. */
export function formatSize(bytes) {
  const n = Number(bytes) || 0
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}


