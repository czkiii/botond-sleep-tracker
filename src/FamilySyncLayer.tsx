import { useEffect, useMemo, useState } from 'react'
import type { AppData } from './types'
import type { Locale } from './i18n'
import { loadData } from './storage'
import { createFamily, createInvite, getSyncStore, joinFamily, leaveFamily, pullRemote, queueLocalChange } from './familySync'

const LAST_INVITE_KEY = 'solemiSleep:lastInvite'

const copy = {
  hu: {
    title: 'Családi szinkron', connected: 'Szinkron aktív', disconnected: 'Nincs összekapcsolva',
    intro: 'Kapcsold össze a két telefont fiók és jelszó nélkül.', create: 'Új család létrehozása', join: 'Csatlakozás kóddal',
    codePlaceholder: 'Meghívókód', joinButton: 'Csatlakozás', cancel: 'Mégse', close: 'Bezárás',
    inviteTitle: 'Meghívókód', inviteHelp: 'Ezt a kódot írd be a másik telefonon. 30 percig érvényes.',
    newInvite: 'Új meghívókód', copyCode: 'Kód másolása', copied: 'Másolva ✓', leave: 'Eszköz leválasztása',
    leaveConfirm: 'Leválasztod ezt a telefont a családi szinkronról?', syncing: 'Szinkronizálás…', offline: 'Offline – a változások később szinkronizálódnak.', error: 'Nem sikerült a szinkronizálás.'
  },
  en: {
    title: 'Family Sync', connected: 'Sync active', disconnected: 'Not connected',
    intro: 'Connect two phones without an account or password.', create: 'Create a new family', join: 'Join with a code',
    codePlaceholder: 'Invite code', joinButton: 'Join', cancel: 'Cancel', close: 'Close',
    inviteTitle: 'Invite code', inviteHelp: 'Enter this code on the other phone. It is valid for 30 minutes.',
    newInvite: 'New invite code', copyCode: 'Copy code', copied: 'Copied ✓', leave: 'Disconnect this device',
    leaveConfirm: 'Disconnect this phone from Family Sync?', syncing: 'Syncing…', offline: 'Offline – changes will sync later.', error: 'Sync failed.'
  },
  de: {
    title: 'Familien-Sync', connected: 'Sync aktiv', disconnected: 'Nicht verbunden',
    intro: 'Verbinde zwei Telefone ohne Konto oder Passwort.', create: 'Neue Familie erstellen', join: 'Mit Code beitreten',
    codePlaceholder: 'Einladungscode', joinButton: 'Beitreten', cancel: 'Abbrechen', close: 'Schließen',
    inviteTitle: 'Einladungscode', inviteHelp: 'Gib diesen Code auf dem anderen Telefon ein. Er ist 30 Minuten gültig.',
    newInvite: 'Neuer Einladungscode', copyCode: 'Code kopieren', copied: 'Kopiert ✓', leave: 'Dieses Gerät trennen',
    leaveConfirm: 'Dieses Telefon vom Familien-Sync trennen?', syncing: 'Synchronisieren…', offline: 'Offline – Änderungen werden später synchronisiert.', error: 'Synchronisierung fehlgeschlagen.'
  }
} as const

function deviceName() {
  const platform = navigator.platform || ''
  if (/iPhone|iPad|iPod/i.test(platform) || /iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'iPhone'
  if (/Android/i.test(navigator.userAgent)) return 'Android'
  return 'Solemi device'
}

export default function FamilySyncLayer() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'home' | 'join' | 'invite'>('home')
  const [code, setCode] = useState('')
  const [inviteCode, setInviteCode] = useState(() => sessionStorage.getItem(LAST_INVITE_KEY) || '')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(() => Boolean(getSyncStore().connection))
  const locale = loadData().settings.locale as Locale
  const text = copy[locale]
  const pending = getSyncStore().pending.length

  useEffect(() => {
    if (inviteCode) {
      sessionStorage.removeItem(LAST_INVITE_KEY)
      setMode('invite')
      setOpen(true)
    }
  }, [])

  useEffect(() => {
    const onState = () => setConnected(Boolean(getSyncStore().connection))
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ previous: AppData; next: AppData }>).detail
      if (detail?.previous && detail?.next) queueLocalChange(detail.previous, detail.next)
    }
    window.addEventListener('solemi-sync-state', onState)
    window.addEventListener('solemi-data-saved', onSaved)
    return () => {
      window.removeEventListener('solemi-sync-state', onState)
      window.removeEventListener('solemi-data-saved', onSaved)
    }
  }, [])

  useEffect(() => {
    if (!connected) return
    let stopped = false
    const run = async () => {
      if (!navigator.onLine || stopped) return
      try {
        const changed = await pullRemote()
        if (changed && !stopped) window.location.reload()
      } catch {}
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

  const status = useMemo(() => {
    if (!connected) return text.disconnected
    if (!navigator.onLine) return text.offline
    if (pending) return text.syncing
    return text.connected
  }, [connected, pending, text])

  const handleCreate = async () => {
    setBusy(true); setError('')
    try {
      const invite = await createFamily(deviceName())
      sessionStorage.setItem(LAST_INVITE_KEY, invite.code)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : text.error)
      setBusy(false)
    }
  }

  const handleJoin = async () => {
    if (!code.trim()) return
    setBusy(true); setError('')
    try {
      await joinFamily(code, deviceName())
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : text.error)
      setBusy(false)
    }
  }

  const handleInvite = async () => {
    setBusy(true); setError('')
    try {
      const invite = await createInvite()
      setInviteCode(invite.code); setMode('invite')
    } catch (err) {
      setError(err instanceof Error ? err.message : text.error)
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
    window.location.reload()
  }

  const openPanel = () => { setOpen(true); setMode(inviteCode ? 'invite' : 'home'); setError('') }

  return <>
    <button className={`family-sync-pill ${connected ? 'connected' : ''}`} onClick={openPanel} aria-label={text.title}>
      <span className="family-sync-cloud">☁</span><span>{connected ? 'Sync' : text.title}</span><i />
    </button>
    {open && <div className="family-sync-overlay" onClick={() => !busy && setOpen(false)}>
      <section className="family-sync-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="family-sync-handle" />
        <header><div><small>{status}</small><h2>{text.title}</h2></div><button onClick={() => setOpen(false)} disabled={busy}>×</button></header>
        {mode === 'home' && !connected && <div className="family-sync-content">
          <p>{text.intro}</p>
          <button className="family-sync-primary" onClick={handleCreate} disabled={busy}>{busy ? text.syncing : text.create}</button>
          <button className="family-sync-secondary" onClick={() => setMode('join')} disabled={busy}>{text.join}</button>
        </div>}
        {mode === 'join' && !connected && <div className="family-sync-content">
          <p>{text.join}</p>
          <input className="family-sync-code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} placeholder={text.codePlaceholder} autoCapitalize="characters" autoCorrect="off" />
          <button className="family-sync-primary" onClick={handleJoin} disabled={busy || !code.trim()}>{busy ? text.syncing : text.joinButton}</button>
          <button className="family-sync-link" onClick={() => setMode('home')} disabled={busy}>{text.cancel}</button>
        </div>}
        {mode === 'home' && connected && <div className="family-sync-content">
          <div className="family-sync-status-card"><span>✓</span><div><strong>{text.connected}</strong><small>{getSyncStore().connection?.familyId.slice(0, 12)}…</small></div></div>
          <button className="family-sync-primary" onClick={handleInvite} disabled={busy}>{busy ? text.syncing : text.newInvite}</button>
          <button className="family-sync-link danger" onClick={handleLeave} disabled={busy}>{text.leave}</button>
        </div>}
        {mode === 'invite' && <div className="family-sync-content invite-view">
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
