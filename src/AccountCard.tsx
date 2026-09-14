import { useEffect, useRef, useState } from 'react'
import { AccountAuthError, beginGoogleSignIn, restoreAccount, signOutAccount } from './accountAuth'
import type { SignedInAccount } from './accountAuth'
import { t } from './i18n'
import type { Locale } from './i18n'

export default function AccountCard({ locale }: { locale: Locale }) {
  const button = useRef<HTMLDivElement>(null)
  const [account, setAccount] = useState<SignedInAccount | null>(null)
  const [status, setStatus] = useState<'loading' | 'signedOut' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

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
    void beginGoogleSignIn(target, (current) => {
      if (!cancelled) { setAccount(current); setStatus('ready'); setError('') }
    }, (failure) => {
      if (!cancelled) { setStatus('error'); setError(authError(locale, failure)) }
    }).catch((failure) => {
      if (!cancelled) { setStatus('error'); setError(authError(locale, failure)) }
    })
    return () => { cancelled = true; target.replaceChildren() }
  }, [locale, status])

  const logout = async () => {
    setStatus('loading'); setError('')
    try { await signOutAccount(); setAccount(null); setStatus('signedOut') }
    catch { setStatus('ready'); setError(t(locale, 'accountNetworkError')) }
  }

  return <div className="settings-card account-card">
    <div className="account-card-head"><span>G</span><div><strong>{t(locale, 'solemiAccount')}</strong><small>{account ? t(locale, 'signedInAs', { email: account.email || account.name || '' }) : t(locale, 'accountHint')}</small></div></div>
    {status === 'loading' && <small className="account-state">{t(locale, 'accountLoading')}</small>}
    {status === 'signedOut' && <div ref={button} className="google-signin-button" />}
    {status === 'ready' && <button type="button" className="account-signout" onClick={logout}>{t(locale, 'signOut')}</button>}
    {status === 'error' && <button type="button" className="account-retry" onClick={() => setStatus('signedOut')}>{t(locale, 'retry')}</button>}
    {error && <small className="account-error">{error}</small>}
    <small className="account-data-note">{t(locale, 'accountDataLocal')}</small>
  </div>
}

function authError(locale: Locale, error: unknown) {
  const code = error instanceof AccountAuthError ? error.code : 'ACCOUNT_AUTH_FAILED'
  if (code === 'AUTH_NOT_CONFIGURED') return t(locale, 'accountNotConfigured')
  if (code === 'DEVICE_LIMIT_REACHED') return t(locale, 'accountDeviceLimit')
  if (code === 'GOOGLE_TOKEN_INVALID' || code === 'LOGIN_CHALLENGE_INVALID') return t(locale, 'googleSignInExpired')
  return t(locale, 'accountNetworkError')
}
