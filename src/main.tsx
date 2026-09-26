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
import { recoverAccountWorkspaceSwitch } from './accountWorkspace'
import { t } from './i18n'

const internalPreview = import.meta.env.VITE_INTERNAL_PREVIEW === 'true'
const internalStagingSync = internalPreview && Boolean(import.meta.env.VITE_SYNC_API_BASE)
const syncEnabled = !internalPreview || internalStagingSync
const accountAuthEnabled = import.meta.env.VITE_ACCOUNT_AUTH === 'true'
const buildSha = import.meta.env.VITE_BUILD_SHA?.slice(0, 7) || 'local'

installAssetCssVariables()
recoverAccountWorkspaceSwitch()

if (!internalPreview) void registerPwa(import.meta.env.BASE_URL, navigator.serviceWorker)

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
    void restoreAccount().then(() => {
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
