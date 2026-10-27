const destination = 'https://solemi-sleep-internal.pages.dev/'
const status = document.querySelector('#status')
const backup = document.querySelector('#backup')
const downloads = document.querySelector('#downloads')
const go = document.querySelector('#continue')
const markerKey = 'solemiSleep:legacy-entry-ack:v1'
const snapshots = []
let storageUnavailable = false
for (const version of [4, 3]) {
  try {
    const raw = localStorage.getItem(`solemiSleep:v${version}`)
    if (raw !== null) snapshots.push({ version, raw })
  } catch { storageUnavailable = true }
}

// Never export sync credentials, account tokens, or unrelated localStorage keys.
for (const { version, raw } of snapshots) {
  let output = raw
  let recoverable = false
  try {
    const stored = JSON.parse(raw)
    if (stored.version !== version || !stored.settings || !Array.isArray(stored.sessions)
      || (version === 4 && !Array.isArray(stored.children))) throw new Error('Invalid diary')
    const data = { version, settings: stored.settings, ...(version === 4 ? { children: stored.children } : {}), sessions: stored.sessions }
    output = JSON.stringify({ format: 'solemi-sleep-backup', version, exportedAt: new Date().toISOString(), data }, null, 2)
    recoverable = true
  } catch { /* Preserve unreadable diary bytes for local recovery, never erase them. */ }
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = recoverable ? `Régi napló letöltése (V${version})` : `Sérült napló mentése helyreállításhoz (V${version})`
  button.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([output], { type: recoverable ? 'application/json' : 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `solemi-sleep-${recoverable ? 'backup' : 'recovery'}-v${version}-${new Date().toISOString().slice(0, 10)}.${recoverable ? 'json' : 'txt'}`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  })
  downloads.append(button)
}

// A changed old diary must be offered again; acknowledgement never edits it.
let fingerprint = null
try {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshots)))
  fingerprint = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('')
} catch { /* No fingerprint means no automatic bypass for stored diaries. */ }
go.addEventListener('click', () => {
  if (fingerprint && !storageUnavailable) {
    try { localStorage.setItem(markerKey, fingerprint) } catch { /* Navigation still works. */ }
  }
})
let acknowledged = false
try { acknowledged = fingerprint !== null && localStorage.getItem(markerKey) === fingerprint } catch { storageUnavailable = true }
const wantsBackup = new URLSearchParams(location.search).get('backup') === '1'
backup.hidden = snapshots.length === 0
status.textContent = storageUnavailable
  ? 'A böngésző helyi tárhelyét most nem lehet elolvasni. Ha itt naplóztál, továbblépés előtt mentsd a régi appból az adataidat.'
  : snapshots.length ? 'A továbblépés előtt a régi naplód mentését is letöltheted.'
    : wantsBackup ? 'Ebben a böngészőben nem találtunk régi helyi naplót.' : 'Átirányítás az új alkalmazásra…'

if ('serviceWorker' in navigator) {
  // Replaces only this app's SW. No forced takeover, cache deletion or storage clear.
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).catch(() => {})
}
if (!wantsBackup && !storageUnavailable && (snapshots.length === 0 || acknowledged)) location.replace(destination)
