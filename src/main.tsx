import React from 'react'
import ReactDOM from 'react-dom/client'
import { useEffect, useState } from 'react'
import { registerPwa } from './pwaRegistration'
import App from './App'
import type { WriteAccess } from './App'
import FamilySyncLayer from './FamilySyncLayer'
import { installAssetCssVariables } from './assetPaths'
import './styles.css'
import './ux-tuning.css'
import './today-fit.css'
import './copy-overrides.css'
import './background-theme.css'
import './family-sync.css'
import { STORAGE_RECOVERED_EVENT, loadDataResult } from './storage'
import { restoreAccount } from './accountAuth'
import { recoverAccountWorkspaceSwitch, flushPhotoErasure } from './accountWorkspace'
import { deleteChildPhoto } from './photoStore'
import { t } from './i18n'
import AccountCard from './AccountCard'
import { accountDeletionCopy } from './accountDeletionCopy'

const internalPreview = import.meta.env.VITE_INTERNAL_PREVIEW === 'true'
const internalStagingSync = internalPreview && Boolean(import.meta.env.VITE_SYNC_API_BASE)
const syncEnabled = !internalPreview || internalStagingSync
const accountAuthEnabled = import.meta.env.VITE_ACCOUNT_AUTH === 'true'
const buildSha = import.meta.env.VITE_BUILD_SHA?.slice(0, 7) || 'local'

installAssetCssVariables()
recoverAccountWorkspaceSwitch()

if (import.meta.env.VITE_NATIVE_APP === 'true' && import.meta.env.VITE_NATIVE_BILLING === 'true') {
  void import('./nativeBillingRuntime').then(module => module.startNativeBillingRecovery()).catch(() => {
    // Explicit Restore remains available; never expose raw native/store failures.
  })
}

if (!internalPreview && import.meta.env.VITE_NATIVE_APP !== 'true') void registerPwa(import.meta.env.BASE_URL, navigator.serviceWorker)

function SolemiRoot() {
  const [accountReady, setAccountReady] = useState(!accountAuthEnabled)
  const [accountStartupError, setAccountStartupError] = useState(false)
  const [storageReady, setStorageReady] = useState(() => loadDataResult().status !== 'recovery-required')
  const [writeAccess, setWriteAccess] = useState<WriteAccess>(() => 'locks' in navigator ? 'checking' : 'writer')
  useEffect(() => {
    if (!accountAuthEnabled) { setAccountReady(true); return }
    if (writeAccess === 'checking') return
    if (writeAccess === 'secondary') { setAccountReady(true); return }
    setAccountReady(false)
    setAccountStartupError(false)
    let stopped = false
    void restoreAccount().then(() => flushPhotoErasure(deleteChildPhoto)).then(() => {
      if (!stopped) {
        setStorageReady(loadDataResult().status !== 'recovery-required')
        setAccountReady(true)
      }
    }).catch(() => {
      if (!stopped) {
        setAccountStartupError(true)
        setAccountReady(true)
      }
    })
    return () => { stopped = true }
  }, [writeAccess])
  useEffect(() => {
    const onRecovered = () => setStorageReady(loadDataResult().status !== 'recovery-required')
    window.addEventListener(STORAGE_RECOVERED_EVENT, onRecovered)
    return () => window.removeEventListener(STORAGE_RECOVERED_EVENT, onRecovered)
  }, [])
  useEffect(() => {
    if (!('locks' in navigator)) return
    let stopped = false
    let releaseLock: (() => void) | undefined
    let retryId: number | undefined
    const attempt = async () => {
      await navigator.locks.request('solemi-sleep-local-writer', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (stopped) return
        if (!lock) {
          setWriteAccess('secondary')
          retryId = window.setTimeout(() => { void attempt() }, 1500)
          return
        }
        setWriteAccess('writer')
        await new Promise<void>((resolve) => { releaseLock = resolve })
      })
    }
    void attempt()
    return () => {
      stopped = true
      if (retryId !== undefined) window.clearTimeout(retryId)
      releaseLock?.()
    }
  }, [])
  if (!accountReady) return <div className="app-startup-loading" aria-label="Loading" />
  if (accountStartupError) {
    const locale = loadDataResult().data.settings.locale
    return <div className="app-startup-error"><strong>{t(locale, 'accountLocalStorageError')}</strong>
      <button type="button" onClick={() => window.location.reload()}>{t(locale, 'retry')}</button></div>
  }
  // The same authenticated self-service flow is reachable without installing an app.
  // Respect the existing single-writer lock; this page must not race another tab.
  if (accountAuthEnabled && import.meta.env.VITE_ACCOUNT_DELETION === 'true'
    && window.location.pathname.replace(/\/+$/, '').endsWith('/delete-account')) {
    const locale = loadDataResult().data.settings.locale
    if (writeAccess !== 'writer') return <main className="app-startup-error">
      <h1>{t(locale, 'tabAccessTitle')}</h1><p>{t(locale, 'tabAccessHint')}</p></main>
    const copy = accountDeletionCopy(locale)
    return <main className="settings-screen" style={{ maxWidth: 520, margin: '0 auto', padding: 16 }}>
      <h1>Solemi Sleep — {copy.title}</h1><p>{copy.explanation}</p>
      <AccountCard locale={locale} />
    </main>
  }
  return <>
    {internalPreview && <div className="internal-preview-banner">INTERNAL / TEST <span>Family Sync {internalStagingSync ? 'staging' : 'disabled'} · {buildSha}</span></div>}
    <App key={writeAccess} writeAccess={writeAccess} />
    {syncEnabled && storageReady && writeAccess === 'writer' && <FamilySyncLayer />}
  </>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SolemiRoot />
  </React.StrictMode>
)
