import { fetchJson } from './apiTransport'
import { activateRestoredAccountWorkspace, activateSignedOutWorkspace, getActiveAccountWorkspaceId } from './accountWorkspace'
import { bindOfflineDevice, clearOfflineEntitlement, readOfflineEntitlement, saveOfflineEntitlement } from './offlineEntitlement'

const internalAccountProxy = import.meta.env.VITE_INTERNAL_PREVIEW === 'true'
  && import.meta.env.VITE_ACCOUNT_AUTH === 'true' ? '/api' : ''
const API_BASE = (import.meta.env.VITE_ACCOUNT_API_BASE || internalAccountProxy
  || import.meta.env.VITE_SYNC_API_BASE
  || 'https://solemi-sleep-sync.czki-adam.workers.dev').replace(/\/$/, '')
const ACCESS_KEY = 'solemiSleep:accountAccess'
const INSTALLATION_KEY = 'solemiSleep:installationSecret'
const EPOCH_KEY = 'solemiSleep:authEpoch:v1'
export const ACCOUNT_STATE_EVENT = 'solemi-account-state'
export const ACCOUNT_ACCESS_EVENT = 'solemi-account-access'

export type SignedInAccount = { id: string; email: string | null; name: string | null }
export type AccountDevice = { id: string; name: string | null; platform: 'WEB' | 'IOS' | 'ANDROID' | 'OTHER' | null; last_seen_at: number }
export type AccountAccessState = {
  offlineGrant?: string
  offlineUntil?: number
  features: Array<'FAMILY_SYNC' | 'PDF_EXPORT' | 'FAMILY_PLUS_INSIGHTS'>
  accountFeatures: Array<'FAMILY_SYNC' | 'PDF_EXPORT' | 'FAMILY_PLUS_INSIGHTS'>
  familyFeatures: Array<'FAMILY_SYNC' | 'PDF_EXPORT' | 'FAMILY_PLUS_INSIGHTS'>
  membership: null | { familyId: string; role: 'ADMIN' | 'MEMBER' }
  familySync: { status: 'NO_ACTIVE_MEMBERSHIP' | 'ACTIVE' | 'PAUSED'; canSync: boolean; familyId?: string }
}
type AccessResponse = { account: SignedInAccount; deviceId: string; sessionId?: string;
  accessToken: string; accessExpiresAt: number; expiresAt: number }
type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string }; data?: unknown }

export class AccountAuthError extends Error {
  constructor(readonly code: string, readonly data?: unknown, readonly status?: number) { super(code) }
}

async function request<T>(path: string, options: RequestInit = {}) {
  const { response, body: envelope } = await fetchJson<ApiEnvelope<T>>(`${API_BASE}${path}`, {
    ...options, credentials: 'include', cache: 'no-store'
  })
  if (!response.ok || !envelope.ok) {
    const failure = envelope as Extract<ApiEnvelope<T>, { ok: false }>
    throw new AccountAuthError(failure.error?.code || 'ACCOUNT_AUTH_FAILED', failure.data, response.status)
  }
  return envelope.data
}

function announceAccount(account: SignedInAccount | null) {
  window.dispatchEvent(new CustomEvent(ACCOUNT_STATE_EVENT, { detail: { account } }))
}

function announceAccess(access: AccountAccessState | null) {
  window.dispatchEvent(new CustomEvent(ACCOUNT_ACCESS_EVENT, { detail: { access } }))
}

function saveAccess(data: AccessResponse) {
  bindOfflineDevice(data.account.id, data.deviceId)
  sessionStorage.setItem(ACCESS_KEY, JSON.stringify(data))
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

let restorePromise: Promise<SignedInAccount | null> | null = null
let restoreCompleted = false
let restoredAccount: SignedInAccount | null = null

export function restoreAccount() {
  if (restoreCompleted) return Promise.resolve(restoredAccount)
  if (!restorePromise) {
    restorePromise = restoreAccountOnce().finally(() => { restorePromise = null })
  }
  return restorePromise
}

async function restoreAccountOnce() {
  const epoch = authEpoch()
  if (!navigator.onLine) return deferAccountRestore()
  const saved = readAccess()
  if (saved && saved.accessExpiresAt > Date.now() + 5_000) {
    let current: { account: SignedInAccount } | null = null
    try {
      current = await request<{ account: SignedInAccount }>('/v1/auth/me', {
        headers: { Authorization: `Bearer ${saved.accessToken}` }
      })
    } catch (error) {
      assertEpoch(epoch)
      if (!isRejectedSession(error)) return deferAccountRestore()
      sessionStorage.removeItem(ACCESS_KEY)
    }
    if (current) {
      assertEpoch(epoch)
      activateRestoredAccountWorkspace(current.account.id)
      restoredAccount = current.account
      restoreCompleted = true
      announceAccount(current.account)
      return current.account
    }
  }
  let refreshed: AccessResponse
  try {
    refreshed = await refreshAccess()
  } catch (error) {
    assertEpoch(epoch)
    if (!isRejectedSession(error)) return deferAccountRestore()
    rejectSession()
    return null
  }
  return refreshed.account
}

function isRejectedSession(error: unknown) {
  return error instanceof AccountAuthError && error.status === 401
    && (error.code === 'SESSION_INVALID' || error.code === 'REFRESH_REUSED')
}

async function deferAccountRestore() {
  // A failed network check is not a logout. Keep the active account's diary
  // and outbox visible. Only a valid signed receipt can restore local paid features.
  // A later online attempt must be able to retry instead of caching a logout.
  restoredAccount = null
  restoreCompleted = false
  announceAccount(null)
  announceAccess(await readOfflineEntitlement())
  return null
}

export async function beginGoogleSignIn(
  target: HTMLElement, onSuccess: (account: SignedInAccount) => void | Promise<void>,
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
        const epoch = beginAuthChange()
        const data = await sessionLock(() => request<AccessResponse>('/v1/auth/google', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential, nonce, installationSecret: installationSecret(),
            deviceName: browserDeviceName(),
            ...(replaceDeviceId ? { replaceDeviceId } : {}) })
        }))
        assertEpoch(epoch)
        const account = saveAccess(data)
        await onSuccess(account)
        assertEpoch(epoch)
        restoredAccount = account
        restoreCompleted = true
        announceAccount(account)
      } catch (error) {
        onError(error instanceof AccountAuthError ? error : new AccountAuthError('LOCAL_WORKSPACE_FAILED'))
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

export async function signOutAccount(deleteLocalData = false) {
  const epoch = beginAuthChange()
  await sessionLock(() => request('/v1/auth/logout', { method: 'POST' }))
  assertEpoch(epoch)
  sessionStorage.removeItem(ACCESS_KEY)
  restoredAccount = null
  restoreCompleted = true
  let workspace: ReturnType<typeof activateSignedOutWorkspace>
  try {
    workspace = activateSignedOutWorkspace(deleteLocalData)
  } catch (error) {
    announceAccess(null)
    announceAccount(null)
    window.location.reload()
    throw error
  }
  announceAccess(null)
  announceAccount(null)
  window.google?.accounts.id.disableAutoSelect()
  return workspace
}

function authEpoch() { return localStorage.getItem(EPOCH_KEY) || '' }
function assertEpoch(epoch: string) {
  if (authEpoch() !== epoch) throw new AccountAuthError('ACCOUNT_CONTEXT_CHANGED')
}
function beginAuthChange() {
  const epoch = crypto.randomUUID()
  localStorage.setItem(EPOCH_KEY, epoch)
  clearOfflineEntitlement()
  announceAccess(null)
  return epoch
}
function rejectSession() {
  sessionStorage.removeItem(ACCESS_KEY)
  clearOfflineEntitlement()
  activateSignedOutWorkspace()
  restoredAccount = null
  restoreCompleted = true
  announceAccess(null)
  announceAccount(null)
}

async function sessionLock<T>(action: () => Promise<T>): Promise<T> {
  // The refresh cookie is shared by tabs. The browser applies Set-Cookie before
  // this lock is released, so the next tab rotates the new token, not its parent.
  if (navigator.locks) return navigator.locks.request('solemi-account-session', action)
  return action()
}

let refreshPromise: Promise<AccessResponse> | null = null
function refreshAccess() {
  if (!refreshPromise) {
    const epoch = authEpoch()
    refreshPromise = sessionLock(async () => {
      assertEpoch(epoch)
      const data = await request<AccessResponse>('/v1/auth/refresh', { method: 'POST' })
      assertEpoch(epoch)
      saveAccess(data)
      activateRestoredAccountWorkspace(data.account.id)
      restoredAccount = data.account
      restoreCompleted = true
      announceAccount(data.account)
      return data
    }).finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

async function usableAccess() {
  if (!navigator.onLine) throw new AccountAuthError('ACCOUNT_OFFLINE')
  const saved = readAccess()
  if (saved && saved.accessExpiresAt > Date.now() + 5_000) return saved
  const epoch = authEpoch()
  try { return await refreshAccess() }
  catch (error) {
    assertEpoch(epoch)
    if (isRejectedSession(error)) rejectSession()
    // Transport failures are retryable and must not erase credentials or diary.
    throw error
  }
}

export async function accountRequest<T>(path: string, options: RequestInit = {}) {
  const originalWorkspace = getActiveAccountWorkspaceId()
  const access = await usableAccess()
  const epoch = authEpoch()
  const workspace = getActiveAccountWorkspaceId()
  if (workspace !== access.account.id || (originalWorkspace && workspace !== originalWorkspace)) throw new AccountAuthError('ACCOUNT_CONTEXT_CHANGED')
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${access.accessToken}`)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const checkContext = () => {
    assertEpoch(epoch)
    if (getActiveAccountWorkspaceId() !== workspace) throw new AccountAuthError('ACCOUNT_CONTEXT_CHANGED')
  }
  try {
    const result = await request<T>(path, { ...options, headers })
    checkContext()
    if (options.method === 'POST' && path.startsWith('/v1/auth/')) clearOfflineEntitlement()
    return result
  } catch (error) {
    checkContext()
    if (isRejectedSession(error) && readAccess()?.accessToken === access.accessToken) rejectSession()
    throw error
  }
}

export async function getAccountAccess(): Promise<AccountAccessState> {
  try {
    const access = await accountRequest<AccountAccessState>('/v1/auth/access')
    const epoch = authEpoch()
    const workspace = getActiveAccountWorkspaceId()
    const saved = readAccess()
    if (saved) {
      try { await saveOfflineEntitlement(access.offlineGrant, saved.account.id, saved.deviceId) }
      catch { /* Cache persistence must not hide a successful online entitlement check. */ }
    }
    assertEpoch(epoch)
    if (getActiveAccountWorkspaceId() !== workspace) throw new AccountAuthError('ACCOUNT_CONTEXT_CHANGED')
    announceAccess(access)
    return access
  } catch (error) {
    const transient = !(error instanceof AccountAuthError) || error.code === 'ACCOUNT_OFFLINE' || (error.status ?? 0) >= 500
    if (transient) {
      const offline = await readOfflineEntitlement()
      if (offline) { announceAccess(offline); return offline }
    }
    throw error
  }
}

export function setInternalTestPlan(plan: 'free' | 'family' | 'familyPlus') {
  return accountRequest<AccountAccessState>('/v1/auth/test/plan', {
    method: 'POST', body: JSON.stringify({ plan })
  }).then((access) => {
    announceAccess(access)
    return access
  })
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
