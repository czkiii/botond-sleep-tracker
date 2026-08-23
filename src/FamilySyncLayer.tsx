import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppData } from './types'
import type { Locale } from './i18n'
import { loadData } from './storage'
import { createFamily, createInvite, getSyncStore, joinFamily, leaveFamily, pullRemote, queueLocalChange, refreshFamilyInfo } from './familySync'

const LAST_INVITE_KEY = 'solemiSleep:lastInvite'
const LAST_SYNC_KEY = 'solemiSleep:lastSyncAt'

const copy = {
  hu: {
    title: 'Családi szinkron', connected: 'Szinkron aktív', disconnected: 'Nincs összekapcsolva',
    intro: 'Kapcsold össze a két telefont fiók és jelszó nélkül.', create: 'Új család létrehozása', join: 'Csatlakozás kóddal',
    familyName: 'Család neve', familyNamePlaceholder: 'Pl. Kovács család', createButton: 'Család létrehozása',
    codePlaceholder: 'Meghívókód', joinButton: 'Csatlakozás', cancel: 'Mégse', close: 'Bezárás',
    inviteTitle: 'Meghívókód', inviteHelp: 'Ezt a kódot írd be a másik telefonon. 30 percig érvényes.',
    newInvite: 'Új meghívókód', copyCode: 'Kód másolása', copied: 'Másolva ✓', leave: 'Eszköz leválasztása',
    leaveConfirm: 'Leválasztod ezt a telefont a családi szinkronról?', syncing: 'Szinkronizálás…', offline: 'Offline', error: 'Nem sikerült a szinkronizálás.',
    settingsHintConnected: 'A család eszközei ugyanazokat az alvásadatokat látják.', settingsHintDisconnected: 'Párosíts egy másik telefont meghívókóddal.', familyConnected: 'Család összekapcsolva',
    pendingOne: '1 módosítás várakozik', pendingMany: (count: number) => `${count} módosítás várakozik`,
    offlineHint: 'A módosításokat elmentjük, és internetkapcsolatnál elküldjük.', syncIssue: 'Szinkron ellenőrzése szükséges',
    lastSyncNow: 'Utolsó szinkron: most', lastSyncMinutes: (minutes: number) => `Utolsó szinkron: ${minutes} perce`, lastSyncLongAgo: 'Utolsó szinkron: régebben',
    inviteNotFound: 'A meghívókód nem található. Ellenőrizd a kódot, vagy kérj újat.', inviteUsed: 'Ezt a meghívókódot már felhasználták. Kérj egy új kódot.', inviteExpired: 'A meghívókód lejárt. Kérj egy új kódot.',
    deviceRevoked: 'Ez a telefon már le lett választva a családról.', invalidToken: 'A készülék kapcsolata már nem érvényes. Párosítsd újra a telefont.', networkError: 'Nincs kapcsolat a Solemi Sleep szerverével. Próbáld újra később.'
  },
  en: {
    title: 'Family Sync', connected: 'Sync active', disconnected: 'Not connected',
    intro: 'Connect two phones without an account or password.', create: 'Create a new family', join: 'Join with a code',
    familyName: 'Family name', familyNamePlaceholder: 'e.g. Smith family', createButton: 'Create family',
    codePlaceholder: 'Invite code', joinButton: 'Join', cancel: 'Cancel', close: 'Close',
    inviteTitle: 'Invite code', inviteHelp: 'Enter this code on the other phone. It is valid for 30 minutes.',
    newInvite: 'New invite code', copyCode: 'Copy code', copied: 'Copied ✓', leave: 'Disconnect this device',
    leaveConfirm: 'Disconnect this phone from Family Sync?', syncing: 'Syncing…', offline: 'Offline', error: 'Sync failed.',
    settingsHintConnected: 'Family devices see the same sleep data.', settingsHintDisconnected: 'Pair another phone with an invite code.', familyConnected: 'Family connected',
    pendingOne: '1 change waiting', pendingMany: (count: number) => `${count} changes waiting`,
    offlineHint: 'Changes are saved and will be sent when the internet connection returns.', syncIssue: 'Sync needs attention',
    lastSyncNow: 'Last sync: now', lastSyncMinutes: (minutes: number) => `Last sync: ${minutes} min ago`, lastSyncLongAgo: 'Last sync: earlier',
    inviteNotFound: 'Invite code not found. Check the code or request a new one.', inviteUsed: 'This invite code has already been used. Request a new code.', inviteExpired: 'This invite code has expired. Request a new code.',
    deviceRevoked: 'This phone has already been disconnected from the family.', invalidToken: 'This device connection is no longer valid. Pair the phone again.', networkError: 'Cannot reach the Solemi Sleep server. Try again later.'
  },
  de: {
    title: 'Familien-Sync', connected: 'Sync aktiv', disconnected: 'Nicht verbunden',
    intro: 'Verbinde zwei Telefone ohne Konto oder Passwort.', create: 'Neue Familie erstellen', join: 'Mit Code beitreten',
    familyName: 'Familienname', familyNamePlaceholder: 'z. B. Familie Müller', createButton: 'Familie erstellen',
    codePlaceholder: 'Einladungscode', joinButton: 'Beitreten', cancel: 'Abbrechen', close: 'Schließen',
    inviteTitle: 'Einladungscode', inviteHelp: 'Gib diesen Code auf dem anderen Telefon ein. Er ist 30 Minuten gültig.',
    newInvite: 'Neuer Einladungscode', copyCode: 'Code kopieren', copied: 'Kopiert ✓', leave: 'Dieses Gerät trennen',
    leaveConfirm: 'Dieses Telefon vom Familien-Sync trennen?', syncing: 'Synchronisieren…', offline: 'Offline', error: 'Synchronisierung fehlgeschlagen.',
    settingsHintConnected: 'Familiengeräte sehen dieselben Schlafdaten.', settingsHintDisconnected: 'Verbinde ein weiteres Telefon per Einladungscode.', familyConnected: 'Familie verbunden',
    pendingOne: '1 Änderung wartet', pendingMany: (count: number) => `${count} Änderungen warten`,
    offlineHint: 'Änderungen werden gespeichert und bei Internetverbindung übertragen.', syncIssue: 'Sync muss geprüft werden',
    lastSyncNow: 'Letzter Sync: gerade eben', lastSyncMinutes: (minutes: number) => `Letzter Sync: vor ${minutes} Min.`, lastSyncLongAgo: 'Letzter Sync: vor längerer Zeit',
    inviteNotFound: 'Einladungscode nicht gefunden. Prüfe den Code oder fordere einen neuen an.', inviteUsed: 'Dieser Einladungscode wurde bereits verwendet. Fordere einen neuen an.', inviteExpired: 'Dieser Einladungscode ist abgelaufen. Fordere einen neuen an.',
    deviceRevoked: 'Dieses Telefon wurde bereits von der Familie getrennt.', invalidToken: 'Diese Geräteverbindung ist nicht mehr gültig. Kopple das Telefon erneut.', networkError: 'Der Solemi-Sleep-Server ist nicht erreichbar. Versuche es später erneut.'
  }
} as const

type SyncError = Error & { code?: string; status?: number }

function deviceName() {
  const platform = navigator.platform || ''
  if (/iPhone|iPad|iPod/i.test(platform) || /iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'iPhone'
  if (/Android/i.test(navigator.userAgent)) return 'Android'
  return 'Solemi device'
}

export default function FamilySyncLayer() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'home' | 'create' | 'join' | 'invite'>('home')
  const [code, setCode] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [inviteCode, setInviteCode] = useState(() => sessionStorage.getItem(LAST_INVITE_KEY) || '')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(() => Boolean(getSyncStore().connection))
  const [pendingCount, setPendingCount] = useState(() => getSyncStore().pending.length)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [lastSyncAt, setLastSyncAt] = useState(() => Number(localStorage.getItem(LAST_SYNC_KEY) || 0))
  const [syncIssue, setSyncIssue] = useState(false)
  const [, setClock] = useState(0)
  const [settingsTarget, setSettingsTarget] = useState<Element | null>(() => document.querySelector('.settings-screen'))
  const [connectionName, setConnectionName] = useState(() => getSyncStore().connection?.familyName || '')
  const locale = loadData().settings.locale as Locale
  const text = copy[locale]

  const friendlyError = (err: unknown) => {
    const apiError = err as SyncError
    if (apiError?.code === 'INVITE_NOT_FOUND') return text.inviteNotFound
    if (apiError?.code === 'INVITE_ALREADY_USED') return text.inviteUsed
    if (apiError?.code === 'INVITE_EXPIRED') return text.inviteExpired
    if (apiError?.code === 'DEVICE_REVOKED') return text.deviceRevoked
    if (apiError?.code === 'INVALID_DEVICE_TOKEN') return text.invalidToken
    if (!navigator.onLine || err instanceof TypeError) return text.networkError
    return text.error
  }

  const markSynced = () => {
    const now = Date.now()
    localStorage.setItem(LAST_SYNC_KEY, String(now))
    setLastSyncAt(now)
    setSyncIssue(false)
    setPendingCount(getSyncStore().pending.length)
  }

  useEffect(() => {
    const refreshTarget = () => setSettingsTarget(document.querySelector('.settings-screen'))
    refreshTarget()
    const observer = new MutationObserver(refreshTarget)
    observer.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (inviteCode) {
      sessionStorage.removeItem(LAST_INVITE_KEY)
      setMode('invite')
      setOpen(true)
    }
  }, [])

  useEffect(() => {
    const onState = () => {
      const store = getSyncStore()
      const next = store.connection
      setConnected(Boolean(next))
      setConnectionName(next?.familyName || '')
      setPendingCount(store.pending.length)
    }
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ previous: AppData; next: AppData }>).detail
      if (detail?.previous && detail?.next) {
        queueLocalChange(detail.previous, detail.next)
        setPendingCount(getSyncStore().pending.length)
      }
    }
    window.addEventListener('solemi-sync-state', onState)
    window.addEventListener('solemi-data-saved', onSaved)
    return () => {
      window.removeEventListener('solemi-sync-state', onState)
      window.removeEventListener('solemi-data-saved', onSaved)
    }
  }, [])

  useEffect(() => {
    if (!connected || connectionName) return
    void refreshFamilyInfo().catch(() => {})
  }, [connected, connectionName])

  useEffect(() => {
    const refreshNetwork = () => setOnline(navigator.onLine)
    window.addEventListener('online', refreshNetwork)
    window.addEventListener('offline', refreshNetwork)
    return () => {
      window.removeEventListener('online', refreshNetwork)
      window.removeEventListener('offline', refreshNetwork)
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setClock((value) => value + 1), 30000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!connected) return
    let stopped = false
    const run = async () => {
      if (!navigator.onLine || stopped) return
      try {
        const changed = await pullRemote()
        if (stopped) return
        markSynced()
        if (changed) window.location.reload()
      } catch {
        if (!stopped) setSyncIssue(true)
      }
    }
    void run()
    const interval = window.setInterval(run, 15000)
    const onFocus = () => void run()
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      stopped = true
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [connected])

  const lastSyncLabel = useMemo(() => {
    if (!lastSyncAt) return ''
    const minutes = Math.floor((Date.now() - lastSyncAt) / 60000)
    if (minutes <= 0) return text.lastSyncNow
    if (minutes < 60) return text.lastSyncMinutes(minutes)
    return text.lastSyncLongAgo
  }, [lastSyncAt, text])

  const status = useMemo(() => {
    if (!connected) return text.disconnected
    if (!online) return text.offline
    if (pendingCount) return text.syncing
    if (syncIssue) return text.syncIssue
    return text.connected
  }, [connected, online, pendingCount, syncIssue, text])

  const detailHint = useMemo(() => {
    if (!connected) return text.settingsHintDisconnected
    if (!online) return text.offlineHint
    if (pendingCount === 1) return text.pendingOne
    if (pendingCount > 1) return text.pendingMany(pendingCount)
    if (syncIssue) return text.syncIssue
    return lastSyncLabel || text.settingsHintConnected
  }, [connected, online, pendingCount, syncIssue, lastSyncLabel, text])

  const handleCreate = async () => {
    if (!familyName.trim()) return
    setBusy(true); setError('')
    try {
      const invite = await createFamily(familyName, deviceName())
      sessionStorage.setItem(LAST_INVITE_KEY, invite.code)
      window.location.reload()
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  const handleJoin = async () => {
    if (!code.trim()) return
    setBusy(true); setError('')
    try {
      await joinFamily(code, deviceName())
      markSynced()
      window.location.reload()
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  const handleInvite = async () => {
    setBusy(true); setError('')
    try {
      const invite = await createInvite()
      setInviteCode(invite.code); setMode('invite')
    } catch (err) {
      setError(friendlyError(err))
    } finally { setBusy(false) }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  const handleLeave = async () => {
    if (!window.confirm(text.leaveConfirm)) return
    setBusy(true)
    await leaveFamily()
    localStorage.removeItem(LAST_SYNC_KEY)
    window.location.reload()
  }

  const openPanel = () => { setOpen(true); setMode(inviteCode ? 'invite' : 'home'); setError('') }

  const settingsEntry = settingsTarget ? createPortal(
    <div className="settings-card family-sync-settings-card">
      <button className="family-sync-settings-button" onClick={openPanel} aria-label={text.title}>
        <span className={`family-sync-settings-icon ${connected ? 'connected' : ''}`}>☁</span>
        <span className="family-sync-settings-copy">
          <strong>{connected && connectionName ? connectionName : text.title}</strong>
          <small>{detailHint}</small>
        </span>
        <span className={`family-sync-settings-state ${connected && online && !syncIssue ? 'connected' : ''}`}>{status}</span>
        <span className="family-sync-settings-chevron">›</span>
      </button>
    </div>,
    settingsTarget
  ) : null

  return <>
    {settingsEntry}
    {open && <div className="family-sync-overlay" onClick={() => !busy && setOpen(false)}>
      <section className="family-sync-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="family-sync-handle" />
        <header><div><small>{status}</small><h2>{text.title}</h2></div><button onClick={() => setOpen(false)} disabled={busy}>×</button></header>
        {mode === 'home' && !connected && <div className="family-sync-content">
          <p>{text.intro}</p>
          <button className="family-sync-primary" onClick={() => setMode('create')} disabled={busy}>{text.create}</button>
          <button className="family-sync-secondary" onClick={() => setMode('join')} disabled={busy}>{text.join}</button>
        </div>}
        {mode === 'create' && !connected && <div className="family-sync-content">
          <p>{text.familyName}</p>
          <input className="family-sync-name-input" value={familyName} onChange={(event) => setFamilyName(event.target.value.slice(0, 60))} placeholder={text.familyNamePlaceholder} autoCorrect="off" />
          <button className="family-sync-primary" onClick={handleCreate} disabled={busy || !familyName.trim()}>{busy ? text.syncing : text.createButton}</button>
          <button className="family-sync-link" onClick={() => setMode('home')} disabled={busy}>{text.cancel}</button>
        </div>}
        {mode === 'join' && !connected && <div className="family-sync-content">
          <p>{text.join}</p>
          <input className="family-sync-code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} placeholder={text.codePlaceholder} autoCapitalize="characters" autoCorrect="off" />
          <button className="family-sync-primary" onClick={handleJoin} disabled={busy || !code.trim()}>{busy ? text.syncing : text.joinButton}</button>
          <button className="family-sync-link" onClick={() => setMode('home')} disabled={busy}>{text.cancel}</button>
        </div>}
        {mode === 'home' && connected && <div className="family-sync-content">
          <div className="family-sync-status-card"><span>{online && !syncIssue ? '✓' : '↻'}</span><div><strong>{connectionName || text.connected}</strong><small>{detailHint}</small></div></div>
          <button className="family-sync-primary" onClick={handleInvite} disabled={busy || !online}>{busy ? text.syncing : text.newInvite}</button>
          <button className="family-sync-link danger" onClick={handleLeave} disabled={busy}>{text.leave}</button>
        </div>}
        {mode === 'invite' && <div className="family-sync-content invite-view">
          {connectionName && <strong className="family-sync-family-name">{connectionName}</strong>}
          <p>{text.inviteHelp}</p>
          <button className="invite-code" onClick={handleCopy}>{inviteCode}</button>
          <button className="family-sync-primary" onClick={handleCopy}>{copied ? text.copied : text.copyCode}</button>
          {connected && <button className="family-sync-link" onClick={() => { setInviteCode(''); setMode('home') }}>{text.close}</button>}
        </div>}
        {error && <div className="family-sync-error">{error}</div>}
      </section>
    </div>}
  </>
}
