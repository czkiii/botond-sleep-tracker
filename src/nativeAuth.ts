import { Capacitor } from '@capacitor/core'
import { fetchJson } from './apiTransport'
import { NativeSession, NativeSessionError } from './nativeSession'
import type { NativeSessionData, NativeVaultRecord } from './nativeSession'

export type NativeProvider = 'GOOGLE' | 'APPLE'
export function isNativeApp() {
  return import.meta.env.VITE_NATIVE_APP === 'true' && Capacitor.isNativePlatform()
    && ['ios', 'android'].includes(Capacitor.getPlatform())
}
export function nativeAuthAvailable() { return isNativeApp() && import.meta.env.VITE_NATIVE_AUTH === 'true' }
export function invalidateNativeSession() {
  if (!nativeAuthAvailable()) return
  // Block rehydration immediately, including if secure storage removal fails.
  localStorage.setItem(`solemi.auth.${new URL(apiBase()).hostname}.disabled`, 'true')
  void nativeSession().then(value => value.invalidate()).catch(() => {})
}
function apiBase() {
  const url = new URL(import.meta.env.VITE_ACCOUNT_API_BASE || '')
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new NativeSessionError('NATIVE_AUTH_NOT_CONFIGURED')
  return url.origin
}
async function post<T>(path: string, data: object): Promise<T> {
  if (!nativeAuthAvailable()) throw new NativeSessionError('NATIVE_AUTH_NOT_CONFIGURED')
  const { response, body } = await fetchJson<{ ok: boolean; data: T; error?: { code: string } }>(`${apiBase()}${path}`, {
    method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  })
  if (!response.ok || !body.ok) throw new NativeSessionError(body.error?.code || 'ACCOUNT_AUTH_FAILED', response.status, body.data)
  return body.data
}
let session: Promise<NativeSession> | undefined
export function nativeSession() {
  if (!nativeAuthAvailable()) return Promise.reject(new NativeSessionError('NATIVE_AUTH_NOT_CONFIGURED'))
  session ??= (async () => {
    const { SecureStorage, KeychainAccess } = await import('@aparajita/capacitor-secure-storage')
    const prefix = `solemi.auth.${new URL(apiBase()).hostname}.`
    await SecureStorage.setKeyPrefix(prefix)
    await SecureStorage.setSynchronize(false)
    await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly)
    const markerKey = `${prefix}container`
    let marker = localStorage.getItem(markerKey)
    if (!marker) { marker = crypto.randomUUID(); localStorage.setItem(markerKey, marker) }
    return new NativeSession({
      read: async () => {
        const value = await SecureStorage.getItem('session')
        return value ? JSON.parse(value) as NativeVaultRecord : null
      },
      write: record => SecureStorage.setItem('session', JSON.stringify(record)),
      marker: () => marker!, disabled: () => localStorage.getItem(`${prefix}disabled`) === 'true',
      disable: value => localStorage.setItem(`${prefix}disabled`, String(value)),
      randomSecret: () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join(''), post
    })
  })().catch(error => { session = undefined; throw error })
  return session
}
export async function nativeSignIn(provider: NativeProvider, check: () => void, replaceDeviceId?: string) {
  if (!nativeAuthAvailable() || (provider === 'APPLE' && (Capacitor.getPlatform() !== 'ios'
    || import.meta.env.VITE_NATIVE_APPLE_AUTH !== 'true'))) throw new NativeSessionError('NATIVE_AUTH_NOT_CONFIGURED')
  const vault = await nativeSession(); check()
  const challenge = await post<{ nonce: string; googleWebClientId?: string; googleIosClientId?: string }>('/v1/auth/native/challenge', { provider }); check()
  const { SocialLogin } = await import('@capgo/capacitor-social-login'); check()
  await SocialLogin.initialize(provider === 'GOOGLE' ? { google: {
    webClientId: challenge.googleWebClientId, iOSClientId: challenge.googleIosClientId,
    iOSServerClientId: challenge.googleWebClientId, mode: 'online'
  } } : { apple: {} }); check()
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(challenge.nonce)); check()
  const nonce = provider === 'APPLE' ? Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('') : challenge.nonce
  const response = provider === 'GOOGLE'
    ? await SocialLogin.login({ provider: 'google', options: { nonce, scopes: ['email', 'profile'], forcePrompt: true } })
    : await SocialLogin.login({ provider: 'apple', options: { nonce, scopes: ['email'] } })
  check()
  const credential = 'idToken' in response.result ? response.result.idToken : null
  if (!credential) throw new NativeSessionError('NATIVE_ID_TOKEN_MISSING')
  const installationSecret = await vault.installationSecret(); check()
  const data = await post<NativeSessionData>('/v1/auth/native/login', { provider, credential, nonce: challenge.nonce,
    installationSecret, deviceName: `Solemi · ${Capacitor.getPlatform()}`, ...(replaceDeviceId ? { replaceDeviceId } : {}) }); check()
  return vault.accept(data, check)
}

// Native UI only; web never imports/calls a provider's mock implementation.
export function mountNativeSignIn(target: HTMLElement, locale: 'hu' | 'en' | 'de',
  login: (provider: NativeProvider) => Promise<void>) {
  const labels = { hu: ['Belépés Google-fiókkal', 'Belépés Apple-fiókkal'], en: ['Sign in with Google', 'Sign in with Apple'], de: ['Mit Google anmelden', 'Mit Apple anmelden'] }[locale]
  target.replaceChildren()
  for (const [index, provider] of (Capacitor.getPlatform() === 'ios' && import.meta.env.VITE_NATIVE_APPLE_AUTH === 'true' ? ['GOOGLE', 'APPLE'] : ['GOOGLE']).entries()) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = labels[index]
    button.className = 'native-signin'
    button.onclick = async () => {
      target.querySelectorAll('button').forEach(b => { b.disabled = true })
      try { await login(provider as NativeProvider) }
      finally { target.querySelectorAll('button').forEach(b => { b.disabled = false }) }
    }
    target.appendChild(button)
  }
}
