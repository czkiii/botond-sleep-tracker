import { useEffect, useRef, useState } from 'react'
import { AccountAuthError, beginGoogleSignIn, restoreAccount, signOutAccount } from './accountAuth'
import type { AccountDevice, SignedInAccount } from './accountAuth'
import { accountWorkspaceNeedsGuestChoice, activateInteractiveAccountWorkspace } from './accountWorkspace'
import { deleteChildPhoto } from './photoStore'
import { localeTag, t } from './i18n'
import type { Locale } from './i18n'

export default function AccountCard({ locale }: { locale: Locale }) {
  const button = useRef<HTMLDivElement>(null)
  const [account, setAccount] = useState<SignedInAccount | null>(null)
  const [status, setStatus] = useState<'loading' | 'signedOut' | 'ready' | 'signOutChoice' | 'deviceLimit' | 'error'>('loading')
  const [error, setError] = useState('')
  const [devices, setDevices] = useState<AccountDevice[]>([])
  const [replacement, setReplacement] = useState<AccountDevice | null>(null)

  useEffect(() => {
    let cancelled = false
    void restoreAccount().then((current) => {
      if (cancelled) return
      setAccount(current)
      setStatus(current ? 'ready' : 'signedOut')
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (status !== 'signedOut' || !button.current) return
    let cancelled = false
    const target = button.current
    void beginGoogleSignIn(target, async (current) => {
      const adoptGuest = accountWorkspaceNeedsGuestChoice(current.id)
        ? window.confirm(t(locale, 'accountGuestAdopt')) : false
      activateInteractiveAccountWorkspace(current.id, adoptGuest)
      if (!cancelled) { setAccount(current); setReplacement(null); setDevices([]); setStatus('ready'); setError('') }
    }, (failure) => {
      if (cancelled) return
      const choices = deviceChoices(failure)
      if (choices.length) { setDevices(choices); setReplacement(null); setStatus('deviceLimit'); setError('') }
      else { setStatus('error'); setError(authError(locale, failure)) }
    }, replacement?.id).catch((failure) => {
      if (!cancelled) { setStatus('error'); setError(authError(locale, failure)) }
    })
    return () => { cancelled = true; target.replaceChildren() }
  }, [locale, replacement, status])

  const logout = async (deleteLocalData: boolean) => {
    if (deleteLocalData && !window.confirm(t(locale, 'signOutDeleteConfirm'))) return
    setStatus('loading'); setError('')
    try {
      const result = await signOutAccount(deleteLocalData)
      await Promise.allSettled(result.deletedPhotoRefs.map((ref) => deleteChildPhoto(ref)))
      setAccount(null); setStatus('signedOut')
    }
    catch { setStatus('ready'); setError(t(locale, 'accountNetworkError')) }
  }

  return <div className="settings-card account-card">
    <div className="account-card-head"><span>G</span><div><strong>{t(locale, 'solemiAccount')}</strong><small>{account ? t(locale, 'signedInAs', { email: account.email || account.name || '' }) : t(locale, 'accountHint')}</small></div></div>
    {status === 'loading' && <small className="account-state">{t(locale, 'accountLoading')}</small>}
    {replacement && status === 'signedOut' && <small className="account-replace-confirm">{t(locale, 'accountReplaceConfirm', { device: replacement.name || t(locale, 'unknownDevice') })}</small>}
    {status === 'signedOut' && <div ref={button} className="google-signin-button" />}
    {status === 'ready' && <button type="button" className="account-signout" onClick={() => setStatus('signOutChoice')}>{t(locale, 'signOut')}</button>}
    {status === 'signOutChoice' && <div className="account-signout-choice">
      <strong>{t(locale, 'signOutChoiceTitle')}</strong>
      <small>{t(locale, 'signOutChoiceHint')}</small>
      <button type="button" onClick={() => logout(false)}>{t(locale, 'signOutKeepLocal')}</button>
      <button type="button" className="danger" onClick={() => logout(true)}>{t(locale, 'signOutDeleteLocal')}</button>
      <button type="button" className="link" onClick={() => setStatus('ready')}>{t(locale, 'cancel')}</button>
    </div>}
    {status === 'deviceLimit' && <div className="account-device-limit">
      <small>{t(locale, 'accountDeviceLimit')}</small>
      <div className="account-device-list">{devices.map((device) => <button type="button" key={device.id} onClick={() => { setReplacement(device); setStatus('signedOut') }}>
        <strong>{device.name || t(locale, 'unknownDevice')}</strong>
        <span>{t(locale, 'accountReplaceDevice')} · {formatLastSeen(locale, device.last_seen_at)}</span>
      </button>)}</div>
    </div>}
    {status === 'error' && <button type="button" className="account-retry" onClick={() => setStatus('signedOut')}>{t(locale, 'retry')}</button>}
    {error && <small className="account-error">{error}</small>}
    <small className="account-data-note">{t(locale, 'accountDataLocal')}</small>
  </div>
}

function deviceChoices(error: AccountAuthError) {
  if (error.code !== 'DEVICE_LIMIT_REACHED' || !error.data || typeof error.data !== 'object') return []
  const raw = (error.data as { devices?: unknown }).devices
  if (!Array.isArray(raw)) return []
  return raw.filter((device): device is AccountDevice => Boolean(device && typeof device === 'object'
    && typeof (device as AccountDevice).id === 'string'
    && typeof (device as AccountDevice).last_seen_at === 'number'))
}

function formatLastSeen(locale: Locale, value: number) {
  try { return new Intl.DateTimeFormat(localeTag(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(value) }
  catch { return '' }
}

function authError(locale: Locale, error: unknown) {
  const code = error instanceof AccountAuthError ? error.code : 'ACCOUNT_AUTH_FAILED'
  if (code === 'AUTH_NOT_CONFIGURED') return t(locale, 'accountNotConfigured')
  if (code === 'DEVICE_LIMIT_REACHED') return t(locale, 'accountDeviceLimit')
  if (code === 'GOOGLE_TOKEN_INVALID' || code === 'LOGIN_CHALLENGE_INVALID') return t(locale, 'googleSignInExpired')
  if (code === 'LOCAL_WORKSPACE_FAILED') return t(locale, 'accountLocalStorageError')
  return t(locale, 'accountNetworkError')
}
