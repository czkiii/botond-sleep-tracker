const internalAccountProxy = import.meta.env.VITE_INTERNAL_PREVIEW === 'true'
  && import.meta.env.VITE_ACCOUNT_AUTH === 'true' ? '/api' : ''
const API_BASE = (import.meta.env.VITE_ACCOUNT_API_BASE || internalAccountProxy
  || import.meta.env.VITE_SYNC_API_BASE
  || 'https://solemi-sleep-sync.czki-adam.workers.dev').replace(/\/$/, '')
const ACCESS_KEY = 'solemiSleep:accountAccess'
const INSTALLATION_KEY = 'solemiSleep:installationSecret'
export const ACCOUNT_STATE_EVENT = 'solemi-account-state'

export type SignedInAccount = { id: string; email: string | null; name: string | null }
export type AccountDevice = { id: string; name: string | null; platform: 'WEB' | 'IOS' | 'ANDROID' | 'OTHER' | null; last_seen_at: number }
type AccessResponse = { account: SignedInAccount; deviceId: string; sessionId?: string;
  accessToken: string; accessExpiresAt: number; expiresAt: number }
type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string }; data?: unknown }

export class AccountAuthError extends Error {
  constructor(readonly code: string, readonly data?: unknown) { super(code) }
}

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, credentials: 'include', cache: 'no-store' })
  const envelope = await response.json() as ApiEnvelope<T>
  if (!response.ok || !envelope.ok) {
    const failure = envelope as Extract<ApiEnvelope<T>, { ok: false }>
    throw new AccountAuthError(failure.error?.code || 'ACCOUNT_AUTH_FAILED', failure.data)
  }
  return envelope.data
}

function announceAccount(account: SignedInAccount | null) {
  window.dispatchEvent(new CustomEvent(ACCOUNT_STATE_EVENT, { detail: { account } }))
}

function saveAccess(data: AccessResponse) {
  sessionStorage.setItem(ACCESS_KEY, JSON.stringify(data))
  announceAccount(data.account)
  return data.account
}

function readAccess(): AccessResponse | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(ACCESS_KEY) || 'null') as AccessResponse | null
    return data?.accessToken && data?.account?.id ? data : null
  } catch { return null }
}

function installationSecret() {
  const current = localStorage.getItem(INSTALLATION_KEY)
  if (/^[a-f0-9]{64}$/.test(current || '')) return current!
  const value = Array.from(crypto.getRandomValues(new Uint8Array(32)),
    (byte) => byte.toString(16).padStart(2, '0')).join('')
  localStorage.setItem(INSTALLATION_KEY, value)
  return value
}

export async function restoreAccount() {
  const saved = readAccess()
  if (saved && saved.accessExpiresAt > Date.now() + 5_000) {
    try {
      const current = await request<{ account: SignedInAccount }>('/v1/auth/me', {
        headers: { Authorization: `Bearer ${saved.accessToken}` }
      })
      announceAccount(current.account)
      return current.account
    } catch { sessionStorage.removeItem(ACCESS_KEY) }
  }
  try {
    return saveAccess(await request<AccessResponse>('/v1/auth/refresh', { method: 'POST' }))
  } catch { return null }
}

export async function beginGoogleSignIn(
  target: HTMLElement, onSuccess: (account: SignedInAccount) => void,
  onError: (error: AccountAuthError) => void, replaceDeviceId?: string
) {
  const { nonce, clientId } = await request<{ nonce: string; clientId: string }>('/v1/auth/challenge')
  await loadGoogleIdentity()
  target.replaceChildren()
  window.google!.accounts.id.initialize({
    client_id: clientId,
    nonce,
    callback: async ({ credential }) => {
      try {
        const data = await request<AccessResponse>('/v1/auth/google', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential, nonce, installationSecret: installationSecret(),
            deviceName: browserDeviceName(),
            ...(replaceDeviceId ? { replaceDeviceId } : {}) })
        })
        onSuccess(saveAccess(data))
      } catch (error) {
        onError(error instanceof AccountAuthError ? error : new AccountAuthError('ACCOUNT_AUTH_FAILED'))
      }
    }
  })
  window.google!.accounts.id.renderButton(target, { theme: 'filled_black', size: 'large', shape: 'pill', width: 280 })
}

function browserDeviceName() {
  const ua = navigator.userAgent
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\//i.test(ua) ? 'Opera'
      : /CriOS|Chrome\//i.test(ua) ? 'Chrome'
        : /FxiOS|Firefox\//i.test(ua) ? 'Firefox'
          : /Safari\//i.test(ua) ? 'Safari' : 'Browser'
  const platform = /iPhone/i.test(ua) ? 'iPhone'
    : /iPad/i.test(ua) ? 'iPad'
      : /Android/i.test(ua) ? 'Android'
        : /Windows/i.test(ua) ? 'Windows'
          : /Macintosh|Mac OS X/i.test(ua) ? 'Mac'
            : /Linux/i.test(ua) ? 'Linux' : 'Web'
  return `${browser} · ${platform}`
}

export async function signOutAccount() {
  await request('/v1/auth/logout', { method: 'POST' })
  sessionStorage.removeItem(ACCESS_KEY)
  announceAccount(null)
  window.google?.accounts.id.disableAutoSelect()
}

let refreshPromise: Promise<AccessResponse | null> | null = null

async function usableAccess() {
  const saved = readAccess()
  if (saved && saved.accessExpiresAt > Date.now() + 5_000) return saved
  if (!refreshPromise) {
    refreshPromise = request<AccessResponse>('/v1/auth/refresh', { method: 'POST' })
      .then((data) => { saveAccess(data); return data })
      .catch(() => { sessionStorage.removeItem(ACCESS_KEY); announceAccount(null); return null })
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

export async function accountRequest<T>(path: string, options: RequestInit = {}) {
  const access = await usableAccess()
  if (!access) throw new AccountAuthError('SESSION_INVALID')
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${access.accessToken}`)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return request<T>(path, { ...options, headers })
}

export function accountDeviceName() { return browserDeviceName() }

let googleScript: Promise<void> | null = null
function loadGoogleIdentity() {
  if (window.google?.accounts.id) return Promise.resolve()
  if (googleScript) return googleScript
  googleScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => { googleScript = null; reject(new AccountAuthError('GOOGLE_SCRIPT_FAILED')) }
    document.head.appendChild(script)
  })
  return googleScript
}
