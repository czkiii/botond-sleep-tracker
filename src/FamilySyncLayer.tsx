import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Locale } from './i18n'
import { loadData } from './storage'
import { createFamily, createInvite, getSyncStore, joinFamily, leaveFamily, pullRemote, reconcileAccountFamily, refreshFamilyInfo, resolveSyncConflict, restoreMissingSession } from './familySync'
import { ACCOUNT_STATE_EVENT, getAccountAccess, setInternalTestPlan } from './accountAuth'
import { INTERNAL_PLAN_PREVIEW_EVENT, INTERNAL_PLAN_PREVIEW_KEY, canUseFamilySync, parseProductPlan } from './entitlements'
import type { ProductPlan } from './entitlements'

const LAST_INVITE_KEY = 'solemiSleep:lastInvite'
const LAST_SYNC_KEY = 'solemiSleep:lastSyncAt'
const internalPreview = import.meta.env.VITE_INTERNAL_PREVIEW === 'true'

function loadInternalPlanPreview(): ProductPlan {
  if (!internalPreview) return 'familyPlus'
  try {
    return parseProductPlan(window.localStorage.getItem(INTERNAL_PLAN_PREVIEW_KEY)) ?? 'familyPlus'
  } catch {
    return 'familyPlus'
  }
}

const copy = {
  hu: {
    title: 'Családi megosztás', connected: 'A családi adatok megosztva', disconnected: 'Nincs család összekapcsolva',
    intro: 'Kapcsold össze a család telefonjait, hogy ugyanazokat az alvásadatokat lássátok.', create: 'Új család létrehozása', join: 'Csatlakozás kóddal',
    familyName: 'Család neve', familyNamePlaceholder: 'Pl. Kovács család', createButton: 'Család létrehozása',
    codePlaceholder: 'Meghívókód', joinButton: 'Csatlakozás', cancel: 'Mégse', close: 'Bezárás',
    inviteTitle: 'Meghívókód', inviteHelp: 'A másik családtag lépjen be a saját Google-fiókjával, majd írja be ezt a kódot. 30 percig érvényes.',
    newInvite: 'Új meghívókód', copyCode: 'Kód másolása', copied: 'Másolva ✓', leave: 'Eszköz leválasztása',
    leaveConfirm: 'Leválasztod ezt a telefont a közös családi adatokról?', syncing: 'Adatok frissítése…', offline: 'Offline', error: 'Nem sikerült frissíteni a családi adatokat.',
    settingsHintConnected: 'A család eszközei ugyanazokat az alvásadatokat látják.', settingsHintDisconnected: 'Párosíts egy másik telefont meghívókóddal.', familyConnected: 'Család összekapcsolva',
    pendingOne: '1 módosítás várakozik', pendingMany: (count: number) => `${count} módosítás várakozik`,
    conflictOne: '1 módosítás ütközik egy másik telefon változatával', conflictMany: (count: number) => `${count} módosítás ütközik egy másik telefon változatával`,
    conflictTitle: 'Ugyanezt az alvást két telefonon módosítottátok.', conflictHelp: 'Válaszd ki, melyik változat maradjon meg. Egyiket sem írjuk felül a döntésed nélkül.', keepLocal: 'Ezen a telefonon lévő maradjon', keepFamily: 'A családi változat maradjon',
    missingTitle: 'Egy korábbi alvás nincs meg a családi naplóban.', missingHelp: 'A helyi alvás és módosításai megmaradnak. A többi alvás szinkronizálása folytatódik. Ha ezt is meg szeretnéd osztani, ellenőrizd az időpontjait, és válaszd a megosztást.', shareMissing: 'Ezt az alvást is megosztom', retryMissing: 'Megosztás újrapróbálása', missingLocal: 'A telefon naplójában sem található; automatikusan nem állítjuk vissza.', activeSleep: 'Még alszik', missingCount: (count: number) => `${count} korábbi alvás megosztása ellenőrzést igényel`,
    offlineHint: 'A módosításokat elmentjük, és internetkapcsolatnál elküldjük.', syncIssue: 'Szinkron ellenőrzése szükséges',
    lastSyncNow: 'Utolsó szinkron: most', lastSyncMinutes: (minutes: number) => `Utolsó szinkron: ${minutes} perce`, lastSyncLongAgo: 'Utolsó szinkron: régebben',
    inviteNotFound: 'A meghívókód nem található. Ellenőrizd a kódot, vagy kérj újat.', inviteUsed: 'Ezt a meghívókódot már felhasználták. Kérj egy új kódot.', inviteExpired: 'A meghívókód lejárt. Kérj egy új kódot.',
    deviceRevoked: 'Ez a telefon már le lett választva a családról.', invalidToken: 'A készülék kapcsolata már nem érvényes. Párosítsd újra a telefont.', accountRequired: 'A meghívókód használatához előbb lépj be a saját Google-fiókoddal.', ownerAccountRequired: 'A család létrehozójának előbb össze kell kapcsolnia a családot a Solemi-fiókjával.', alreadyInFamily: 'Ez a Google-fiók már egy családhoz tartozik.', networkError: 'Nincs kapcsolat a Solemi Sleep szerverével. Próbáld újra később.',
    locked: 'Zárolva', lockedHint: 'Ehhez a funkcióhoz Family előfizetés szükséges.', lockedDescription: 'A Family csomaggal összekapcsolhatod a család telefonjait, hogy ugyanazokat az alvásadatokat lássátok.',
    paused: 'A családi szinkron szünetel', pausedHint: 'A családban jelenleg nincs aktív Family vagy Family+ előfizetés. A helyi módosításaid megmaradnak.'
  },
  en: {
    title: 'Family sharing', connected: 'Family data is shared', disconnected: 'No family connected',
    intro: 'Connect the family’s phones so everyone sees the same sleep data.', create: 'Create a new family', join: 'Join with a code',
    familyName: 'Family name', familyNamePlaceholder: 'e.g. Smith family', createButton: 'Create family',
    codePlaceholder: 'Invite code', joinButton: 'Join', cancel: 'Cancel', close: 'Close',
    inviteTitle: 'Invite code', inviteHelp: 'The other family member should sign in with their own Google account, then enter this code. It is valid for 30 minutes.',
    newInvite: 'New invite code', copyCode: 'Copy code', copied: 'Copied ✓', leave: 'Disconnect this device',
    leaveConfirm: 'Disconnect this phone from the shared family data?', syncing: 'Updating family data…', offline: 'Offline', error: 'Could not update family data.',
    settingsHintConnected: 'Family devices see the same sleep data.', settingsHintDisconnected: 'Pair another phone with an invite code.', familyConnected: 'Family connected',
    pendingOne: '1 change waiting', pendingMany: (count: number) => `${count} changes waiting`,
    conflictOne: '1 change conflicts with another phone’s version', conflictMany: (count: number) => `${count} changes conflict with another phone’s version`,
    conflictTitle: 'The same sleep was changed on two phones.', conflictHelp: 'Choose which version to keep. Neither is overwritten without your decision.', keepLocal: 'Keep this phone’s version', keepFamily: 'Keep the family version',
    missingTitle: 'An earlier sleep is missing from the family diary.', missingHelp: 'Your local sleep and changes are kept. Other sleeps continue to sync. To share this one too, check its times and choose to share it.', shareMissing: 'Share this sleep too', retryMissing: 'Retry sharing', missingLocal: 'It is also missing from this phone’s diary; it will not be restored automatically.', activeSleep: 'Still sleeping', missingCount: (count: number) => `Sharing ${count} earlier sleeps needs review`,
    offlineHint: 'Changes are saved and will be sent when the internet connection returns.', syncIssue: 'Sync needs attention',
    lastSyncNow: 'Last sync: now', lastSyncMinutes: (minutes: number) => `Last sync: ${minutes} min ago`, lastSyncLongAgo: 'Last sync: earlier',
    inviteNotFound: 'Invite code not found. Check the code or request a new one.', inviteUsed: 'This invite code has already been used. Request a new code.', inviteExpired: 'This invite code has expired. Request a new code.',
    deviceRevoked: 'This phone has already been disconnected from the family.', invalidToken: 'This device connection is no longer valid. Pair the phone again.', accountRequired: 'Sign in with your own Google account before using an invite code.', ownerAccountRequired: 'The family creator must connect the family to their Solemi account first.', alreadyInFamily: 'This Google account already belongs to a family.', networkError: 'Cannot reach the Solemi Sleep server. Try again later.',
    locked: 'Locked', lockedHint: 'A Family subscription is required for this feature.', lockedDescription: 'With the Family plan, you can connect the family’s phones so everyone sees the same sleep data.',
    paused: 'Family sync is paused', pausedHint: 'No family member currently has an active Family or Family+ subscription. Your local changes are kept.'
  },
  de: {
    title: 'Familienfreigabe', connected: 'Familiendaten werden geteilt', disconnected: 'Keine Familie verbunden',
    intro: 'Verbinde die Telefone der Familie, damit alle dieselben Schlafdaten sehen.', create: 'Neue Familie erstellen', join: 'Mit Code beitreten',
    familyName: 'Familienname', familyNamePlaceholder: 'z. B. Familie Müller', createButton: 'Familie erstellen',
    codePlaceholder: 'Einladungscode', joinButton: 'Beitreten', cancel: 'Abbrechen', close: 'Schließen',
    inviteTitle: 'Einladungscode', inviteHelp: 'Das andere Familienmitglied meldet sich mit dem eigenen Google-Konto an und gibt dann diesen Code ein. Er ist 30 Minuten gültig.',
    newInvite: 'Neuer Einladungscode', copyCode: 'Code kopieren', copied: 'Kopiert ✓', leave: 'Dieses Gerät trennen',
    leaveConfirm: 'Dieses Telefon von den gemeinsamen Familiendaten trennen?', syncing: 'Familiendaten werden aktualisiert…', offline: 'Offline', error: 'Familiendaten konnten nicht aktualisiert werden.',
    settingsHintConnected: 'Familiengeräte sehen dieselben Schlafdaten.', settingsHintDisconnected: 'Verbinde ein weiteres Telefon per Einladungscode.', familyConnected: 'Familie verbunden',
    pendingOne: '1 Änderung wartet', pendingMany: (count: number) => `${count} Änderungen warten`,
    conflictOne: '1 Änderung steht im Konflikt mit der Version eines anderen Telefons', conflictMany: (count: number) => `${count} Änderungen stehen im Konflikt mit der Version eines anderen Telefons`,
    conflictTitle: 'Derselbe Schlaf wurde auf zwei Telefonen geändert.', conflictHelp: 'Wähle aus, welche Version bleiben soll. Keine wird ohne deine Entscheidung überschrieben.', keepLocal: 'Version dieses Telefons behalten', keepFamily: 'Familienversion behalten',
    missingTitle: 'Ein früherer Schlaf fehlt im Familientagebuch.', missingHelp: 'Dein lokaler Schlaf und deine Änderungen bleiben erhalten. Andere Schlafdaten werden weiter synchronisiert. Prüfe die Zeiten, bevor du auch diesen Schlaf teilst.', shareMissing: 'Diesen Schlaf auch teilen', retryMissing: 'Teilen erneut versuchen', missingLocal: 'Auch im Tagebuch dieses Telefons fehlt der Schlaf; er wird nicht automatisch wiederhergestellt.', activeSleep: 'Schläft noch', missingCount: (count: number) => `Das Teilen von ${count} früheren Schlafzeiten muss geprüft werden`,
    offlineHint: 'Änderungen werden gespeichert und bei Internetverbindung übertragen.', syncIssue: 'Sync muss geprüft werden',
    lastSyncNow: 'Letzter Sync: gerade eben', lastSyncMinutes: (minutes: number) => `Letzter Sync: vor ${minutes} Min.`, lastSyncLongAgo: 'Letzter Sync: vor längerer Zeit',
    inviteNotFound: 'Einladungscode nicht gefunden. Prüfe den Code oder fordere einen neuen an.', inviteUsed: 'Dieser Einladungscode wurde bereits verwendet. Fordere einen neuen an.', inviteExpired: 'Dieser Einladungscode ist abgelaufen. Fordere einen neuen an.',
    deviceRevoked: 'Dieses Telefon wurde bereits von der Familie getrennt.', invalidToken: 'Diese Geräteverbindung ist nicht mehr gültig. Kopple das Telefon erneut.', accountRequired: 'Melde dich mit deinem eigenen Google-Konto an, bevor du einen Einladungscode verwendest.', ownerAccountRequired: 'Der Ersteller der Familie muss die Familie zuerst mit dem Solemi-Konto verbinden.', alreadyInFamily: 'Dieses Google-Konto gehört bereits zu einer Familie.', networkError: 'Der Solemi-Sleep-Server ist nicht erreichbar. Versuche es später erneut.',
    locked: 'Gesperrt', lockedHint: 'Für diese Funktion ist ein Family-Abo erforderlich.', lockedDescription: 'Mit dem Family-Abo kannst du die Telefone der Familie verbinden, damit alle dieselben Schlafdaten sehen.',
    paused: 'Familiensynchronisierung pausiert', pausedHint: 'Derzeit hat kein Familienmitglied ein aktives Family- oder Family+-Abo. Lokale Änderungen bleiben erhalten.'
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
  const [conflictCount, setConflictCount] = useState(() => getSyncStore().conflicts.length)
  const [missingSessions, setMissingSessions] = useState(() => getSyncStore().missingSessions)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [lastSyncAt, setLastSyncAt] = useState(() => Number(localStorage.getItem(LAST_SYNC_KEY) || 0))
  const [syncIssue, setSyncIssue] = useState(false)
  const [uploadFailure, setUploadFailure] = useState(() => getSyncStore().failure?.code || '')
  const [, setClock] = useState(0)
  const [settingsTarget, setSettingsTarget] = useState<Element | null>(() => document.querySelector('.settings-screen'))
  const [connectionName, setConnectionName] = useState(() => getSyncStore().connection?.familyName || '')
  const [previewPlan, setPreviewPlan] = useState<ProductPlan>(() => loadInternalPlanPreview())
  const [serverFamilySync, setServerFamilySync] = useState<boolean | null>(null)
  const [serverPaused, setServerPaused] = useState(false)
  const locale = loadData().settings.locale as Locale
  const text = copy[locale]
  const familySyncAvailable = serverFamilySync ?? (!internalPreview || canUseFamilySync(previewPlan))

  const friendlyError = (err: unknown) => {
    const apiError = err as SyncError
    if (apiError?.code === 'INVITE_NOT_FOUND') return text.inviteNotFound
    if (apiError?.code === 'INVITE_ALREADY_USED') return text.inviteUsed
    if (apiError?.code === 'INVITE_EXPIRED') return text.inviteExpired
    if (apiError?.code === 'DEVICE_REVOKED') return text.deviceRevoked
    if (apiError?.code === 'INVALID_DEVICE_TOKEN') return text.invalidToken
    if (apiError?.code === 'SESSION_INVALID') return text.accountRequired
    if (apiError?.code === 'FAMILY_OWNER_ACCOUNT_REQUIRED') return text.ownerAccountRequired
    if (apiError?.code === 'ACCOUNT_ALREADY_IN_FAMILY' || apiError?.code === 'ACCOUNT_ALREADY_IN_OTHER_FAMILY') return text.alreadyInFamily
    if (!navigator.onLine || err instanceof TypeError || apiError?.code === 'API_TIMEOUT' || apiError?.code === 'NETWORK_ERROR') return text.networkError
    return text.error
  }

  const markSynced = () => {
    const store = getSyncStore()
    setPendingCount(store.pending.length)
    setConflictCount(store.conflicts.length)
    setMissingSessions(store.missingSessions)
    setUploadFailure(store.failure?.code || '')
    setSyncIssue(Boolean(store.failure))
    if (store.pending.length || store.conflicts.length || store.failure || store.missingSessions.length) return
    const now = Date.now()
    localStorage.setItem(LAST_SYNC_KEY, String(now))
    setLastSyncAt(now)
    setSyncIssue(false)
  }

  useEffect(() => {
    if (!internalPreview) return
    const onPlanChange = (event: Event) => {
      const plan = parseProductPlan((event as CustomEvent<unknown>).detail)
      if (plan) {
        setPreviewPlan(plan)
        void setInternalTestPlan(plan).then((access) => {
          setServerFamilySync(access.familySync.canSync)
          setServerPaused(access.familySync.status === 'PAUSED')
        }).catch(() => {})
      }
    }
    window.addEventListener(INTERNAL_PLAN_PREVIEW_EVENT, onPlanChange)
    return () => window.removeEventListener(INTERNAL_PLAN_PREVIEW_EVENT, onPlanChange)
  }, [])

  useEffect(() => {
    if (!familySyncAvailable || import.meta.env.VITE_ACCOUNT_AUTH !== 'true') return
    let running = false
    const reconcile = async (event: Event) => {
      if (!(event as CustomEvent<{ account?: unknown }>).detail?.account || running) return
      running = true
      try {
        if (internalPreview) await setInternalTestPlan(previewPlan)
        const result = await reconcileAccountFamily()
        const access = await getAccountAccess()
        setServerFamilySync(access.familySync.canSync)
        setServerPaused(access.familySync.status === 'PAUSED')
        if (result.connected) {
          const next = getSyncStore().connection
          setConnected(Boolean(next))
          setConnectionName(next?.familyName || '')
          markSynced()
        }
      } catch {
        setSyncIssue(true)
      } finally { running = false }
    }
    window.addEventListener(ACCOUNT_STATE_EVENT, reconcile)
    return () => window.removeEventListener(ACCOUNT_STATE_EVENT, reconcile)
  }, [previewPlan])

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
      setMode(missingSessions.length || conflictCount ? 'home' : 'invite')
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
      setConflictCount(store.conflicts.length)
      setMissingSessions(store.missingSessions)
      if (store.missingSessions.length || store.conflicts.length) setMode('home')
      setUploadFailure(store.failure?.code || '')
      setSyncIssue(Boolean(store.failure))
    }
    window.addEventListener('solemi-sync-state', onState)
    return () => {
      window.removeEventListener('solemi-sync-state', onState)
    }
  }, [])

  useEffect(() => {
    if (!familySyncAvailable || !connected || connectionName) return
    void refreshFamilyInfo().catch(() => {})
  }, [familySyncAvailable, connected, connectionName])

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
    if (import.meta.env.VITE_ACCOUNT_AUTH !== 'true' || !connected) return
    let stopped = false
    const refreshAccess = async () => {
      if (!navigator.onLine || stopped) return
      try {
        const access = await getAccountAccess()
        if (stopped) return
        setServerFamilySync(access.familySync.canSync)
        setServerPaused(access.familySync.status === 'PAUSED')
      } catch { /* account restoration and the sync loop surface connection errors */ }
    }
    void refreshAccess()
    const interval = window.setInterval(refreshAccess, 15000)
    const onFocus = () => void refreshAccess()
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

  useEffect(() => {
    const interval = window.setInterval(() => setClock((value) => value + 1), 30000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!familySyncAvailable || !connected) return
    let stopped = false
    const run = async () => {
      if (!navigator.onLine || stopped) return
      try {
        await pullRemote()
        if (stopped) return
        markSynced()
      } catch (error) {
        if (!stopped) {
          const apiError = error as SyncError
          if (apiError.code === 'FAMILY_SYNC_PAUSED') {
            setServerFamilySync(false)
            setServerPaused(true)
          }
          setSyncIssue(true)
        }
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
  }, [familySyncAvailable, connected])

  const lastSyncLabel = useMemo(() => {
    if (!lastSyncAt) return ''
    const minutes = Math.floor((Date.now() - lastSyncAt) / 60000)
    if (minutes <= 0) return text.lastSyncNow
    if (minutes < 60) return text.lastSyncMinutes(minutes)
    return text.lastSyncLongAgo
  }, [lastSyncAt, text])

  const status = useMemo(() => {
    if (serverPaused) return text.paused
    if (!familySyncAvailable) return text.locked
    if (!connected) return text.disconnected
    if (!online) return text.offline
    if (conflictCount) return text.syncIssue
    if (missingSessions.length) return text.syncIssue
    if (syncIssue) return text.syncIssue
    if (pendingCount) return text.syncing
    return text.connected
  }, [serverPaused, familySyncAvailable, connected, online, conflictCount, missingSessions, pendingCount, syncIssue, text])

  const detailHint = useMemo(() => {
    if (serverPaused) return text.pausedHint
    if (!familySyncAvailable) return text.lockedHint
    if (!connected) return text.settingsHintDisconnected
    if (!online) return text.offlineHint
    if (conflictCount === 1) return text.conflictOne
    if (conflictCount > 1) return text.conflictMany(conflictCount)
    if (missingSessions.length) return text.missingCount(missingSessions.length)
    if (pendingCount === 1) return text.pendingOne
    if (pendingCount > 1) return text.pendingMany(pendingCount)
    if (syncIssue) return text.syncIssue
    return lastSyncLabel || text.settingsHintConnected
  }, [serverPaused, familySyncAvailable, connected, online, conflictCount, missingSessions, pendingCount, syncIssue, lastSyncLabel, text])

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

  const handleConflict = async (resolution: 'local' | 'family') => {
    const conflict = getSyncStore().conflicts[0]
    if (!conflict) return
    setBusy(true); setError('')
    try {
      await resolveSyncConflict(conflict.operationId, resolution)
      markSynced()
    } catch (err) {
      setError(friendlyError(err))
    }
    finally { setBusy(false) }
  }

  const openPanel = () => { setOpen(true); setMode(!missingSessions.length && !conflictCount && inviteCode ? 'invite' : 'home'); setError('') }

  const handleMissing = async (sessionId: string) => {
    setBusy(true); setError('')
    try { await restoreMissingSession(sessionId); markSynced() }
    catch (err) { setError(friendlyError(err)) }
    finally { setBusy(false) }
  }

  const settingsEntry = settingsTarget ? createPortal(
    <div className="settings-card family-sync-settings-card">
      <button className="family-sync-settings-button" onClick={openPanel} aria-label={text.title}>
        <span className={`family-sync-settings-icon ${familySyncAvailable && connected ? 'connected' : ''} ${!familySyncAvailable ? 'locked' : ''}`}>{familySyncAvailable ? '☁' : '🔒'}</span>
        <span className="family-sync-settings-copy">
          <strong>{connected && connectionName ? connectionName : text.title}</strong>
          <small>{detailHint}</small>
        </span>
        <span className={`family-sync-settings-state ${familySyncAvailable && connected && online && !syncIssue ? 'connected' : ''}`}>{status}</span>
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
        {!familySyncAvailable && <div className="family-sync-content family-sync-locked">
          <div className="family-sync-lock-icon">🔒</div>
          <strong>{serverPaused ? text.paused : text.lockedHint}</strong>
          <p>{serverPaused ? text.pausedHint : text.lockedDescription}</p>
        </div>}
        {familySyncAvailable && mode === 'home' && !connected && <div className="family-sync-content">
          <p>{text.intro}</p>
          <button className="family-sync-primary" onClick={() => setMode('create')} disabled={busy}>{text.create}</button>
          <button className="family-sync-secondary" onClick={() => setMode('join')} disabled={busy}>{text.join}</button>
        </div>}
        {familySyncAvailable && mode === 'create' && !connected && <div className="family-sync-content">
          <p>{text.familyName}</p>
          <input className="family-sync-name-input" value={familyName} onChange={(event) => setFamilyName(event.target.value.slice(0, 60))} placeholder={text.familyNamePlaceholder} autoCorrect="off" />
          <button className="family-sync-primary" onClick={handleCreate} disabled={busy || !familyName.trim()}>{busy ? text.syncing : text.createButton}</button>
          <button className="family-sync-link" onClick={() => setMode('home')} disabled={busy}>{text.cancel}</button>
        </div>}
        {familySyncAvailable && mode === 'join' && !connected && <div className="family-sync-content">
          <p>{text.join}</p>
          <input className="family-sync-code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} placeholder={text.codePlaceholder} autoCapitalize="characters" autoCorrect="off" />
          <button className="family-sync-primary" onClick={handleJoin} disabled={busy || !code.trim()}>{busy ? text.syncing : text.joinButton}</button>
          <button className="family-sync-link" onClick={() => setMode('home')} disabled={busy}>{text.cancel}</button>
        </div>}
        {familySyncAvailable && mode === 'home' && connected && conflictCount > 0 && <div className="family-sync-content">
          <div className="family-sync-status-card"><span>!</span><div><strong>{text.conflictTitle}</strong><small>{text.conflictHelp}</small></div></div>
          <button className="family-sync-primary" onClick={() => handleConflict('local')} disabled={busy}>{text.keepLocal}</button>
          <button className="family-sync-secondary" onClick={() => handleConflict('family')} disabled={busy}>{text.keepFamily}</button>
        </div>}
        {familySyncAvailable && mode === 'home' && connected && conflictCount === 0 && <div className="family-sync-content">
          <div className="family-sync-status-card"><span>{missingSessions.length ? '!' : online && !syncIssue ? '✓' : '↻'}</span><div><strong>{connectionName || text.connected}</strong><small>{detailHint}</small></div></div>
          {!missingSessions.length && <>
            <button className="family-sync-primary" onClick={handleInvite} disabled={busy || !online}>{busy ? text.syncing : text.newInvite}</button>
            <button className="family-sync-link danger" onClick={handleLeave} disabled={busy}>{text.leave}</button>
          </>}
        </div>}
        {familySyncAvailable && mode === 'invite' && <div className="family-sync-content invite-view">
          {connectionName && <strong className="family-sync-family-name">{connectionName}</strong>}
          <p>{text.inviteHelp}</p>
          <button className="invite-code" onClick={handleCopy}>{inviteCode}</button>
          <button className="family-sync-primary" onClick={handleCopy}>{copied ? text.copied : text.copyCode}</button>
          {connected && <button className="family-sync-link" onClick={() => { setInviteCode(''); setMode('home') }}>{text.close}</button>}
        </div>}
        {error && <div className="family-sync-error">{error}</div>}
        {familySyncAvailable && mode === 'home' && connected && missingSessions.map((missing) => {
          const local = loadData().sessions.find((item) => item.id === missing.sessionId)
          const reviewed = missing.repairOperationIds?.length ? missing.localValue : local
          const format = (value: string) => Number.isFinite(Date.parse(value))
            ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'
          return <div className="family-sync-content family-sync-missing" key={missing.sessionId}>
            <strong>{text.missingTitle}</strong>
            <p>{text.missingHelp}</p>
            {reviewed && <div className="family-sync-status-card"><div>
              <strong>{loadData().children.find((child) => child.id === reviewed.childId)?.name || '—'}</strong>
              <small>{format(reviewed.startTime)} – {reviewed.endTime ? format(reviewed.endTime) : text.activeSleep}</small>
              {reviewed.note && <small>{reviewed.note}</small>}
            </div></div>}
            {local ? <button className="family-sync-primary" disabled={busy || !online || conflictCount > 0}
              onClick={() => handleMissing(missing.sessionId)}>
              {missing.repairOperationIds?.length ? text.retryMissing : text.shareMissing}
            </button> : <p>{text.missingLocal}</p>}
            {missing.errorCode && <div className="family-sync-error">
              {friendlyError({ code: missing.errorCode })}{internalPreview && <small> · {missing.errorCode}</small>}
            </div>}
          </div>
        })}
        {uploadFailure && !error && <div className="family-sync-error">
          {friendlyError({ code: uploadFailure })}
          {internalPreview && <small> · {uploadFailure}</small>}
        </div>}
      </section>
    </div>}
  </>
}
