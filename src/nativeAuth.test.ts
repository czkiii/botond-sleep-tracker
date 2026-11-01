import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ platform: 'ios', native: true, storage: new Map<string, string>(),
  fetch: vi.fn(), login: vi.fn(), initialize: vi.fn(), setKeyPrefix: vi.fn(), setSynchronize: vi.fn(), setAccess: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mocks.native, getPlatform: () => mocks.platform } }))
vi.mock('./apiTransport', () => ({ fetchJson: mocks.fetch }))
vi.mock('@capgo/capacitor-social-login', () => ({ SocialLogin: { initialize: mocks.initialize, login: mocks.login } }))
vi.mock('@aparajita/capacitor-secure-storage', () => ({ KeychainAccess: { whenUnlockedThisDeviceOnly: 'thisDevice' }, SecureStorage: {
  setKeyPrefix: mocks.setKeyPrefix, setSynchronize: mocks.setSynchronize, setDefaultKeychainAccess: mocks.setAccess,
  getItem: async (key: string) => mocks.storage.get(key), setItem: async (key: string, value: string) => { mocks.storage.set(key, value) }
} }))
const challenge = { nonce: 'a'.repeat(64), googleWebClientId: 'web', googleIosClientId: 'ios' }
const loggedIn = { account: { id: 'account', email: null, name: null }, deviceId: 'device', accessToken: 'short-access',
  accessExpiresAt: 100, expiresAt: 200, refreshToken: 'b'.repeat(64) }
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); mocks.storage.clear(); mocks.native = true; mocks.platform = 'ios'
  const local = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => local.set(key, value) })
  for (const [key, value] of Object.entries({ VITE_NATIVE_APP: 'true', VITE_NATIVE_AUTH: 'true', VITE_NATIVE_APPLE_AUTH: 'true', VITE_ACCOUNT_API_BASE: 'https://api.example' })) vi.stubEnv(key, value)
  mocks.login.mockResolvedValue({ result: { idToken: 'provider-proof', accessToken: null, authorizationCode: 'apple-authorization-code' } })
  mocks.fetch.mockImplementation(async (url: string) => ({ response: { ok: true, status: 200 },
    body: { ok: true, data: url.endsWith('/challenge') ? challenge : loggedIn } }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('native login bridge', () => {
  it('never falls back to web mock storage or native login when running in a browser', async () => {
    mocks.native = false
    const auth = await import('./nativeAuth')
    expect(auth.nativeAuthAvailable()).toBe(false)
    await expect(auth.nativeSession()).rejects.toMatchObject({ code: 'NATIVE_AUTH_NOT_CONFIGURED' })
    await expect(auth.nativeSignIn('GOOGLE', () => {})).rejects.toMatchObject({ code: 'NATIVE_AUTH_NOT_CONFIGURED' })
    expect(mocks.setKeyPrefix).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('passes the server nonce to Google and stores only the app refresh in device-only protected storage', async () => {
    const auth = await import('./nativeAuth')
    const result = await auth.nativeSignIn('GOOGLE', () => {})
    expect(mocks.login).toHaveBeenCalledWith({ provider: 'google', options: { nonce: challenge.nonce, scopes: ['email', 'profile'], forcePrompt: true } })
    expect(mocks.initialize).toHaveBeenCalledWith({ google: { webClientId: 'web', iOSClientId: 'ios', iOSServerClientId: 'web', mode: 'online' } })
    expect(mocks.setSynchronize).toHaveBeenCalledWith(false); expect(mocks.setAccess).toHaveBeenCalledWith('thisDevice')
    expect(result).not.toHaveProperty('refreshToken')
    expect(JSON.parse(mocks.storage.get('session')!).refreshToken).toBe(loggedIn.refreshToken)
    for (const [, request] of mocks.fetch.mock.calls) expect(request).toMatchObject({ credentials: 'omit', cache: 'no-store' })
    const body = JSON.parse(mocks.fetch.mock.calls[1][1].body)
    expect(body).toMatchObject({ provider: 'GOOGLE', nonce: challenge.nonce, credential: 'provider-proof' })
    expect(body.installationSecret).toMatch(/^[a-f0-9]{64}$/)
  })
  it('sends Apple the nonce digest while the server receives the original challenge', async () => {
    const auth = await import('./nativeAuth'); await auth.nativeSignIn('APPLE', () => {})
    expect(mocks.initialize).toHaveBeenCalledWith({ apple: { useProperTokenExchange: true } })
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(challenge.nonce))), x => x.toString(16).padStart(2, '0')).join('')
    expect(mocks.login).toHaveBeenCalledWith({ provider: 'apple', options: { nonce: digest, scopes: ['email'] } })
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toMatchObject({ provider: 'APPLE', nonce: challenge.nonce, authorizationCode: 'apple-authorization-code' })
  })
  it('does not complete login after a cancelled provider sheet or account change', async () => {
    const auth = await import('./nativeAuth'); mocks.login.mockRejectedValueOnce({ code: 'USER_CANCELLED' })
    await expect(auth.nativeSignIn('GOOGLE', () => {})).rejects.toMatchObject({ code: 'USER_CANCELLED' })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    mocks.fetch.mockClear(); let current = true
    mocks.login.mockImplementationOnce(async () => { current = false; return { result: { idToken: 'stale-proof' } } })
    await expect(auth.nativeSignIn('GOOGLE', () => { if (!current) throw new Error('context changed') })).rejects.toThrow('context changed')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(mocks.storage.get('session') || 'null')?.refreshToken).toBeFalsy()
  })
  it('prevents Apple activation on Android or without its separate switch', async () => {
    const auth = await import('./nativeAuth'); mocks.platform = 'android'
    await expect(auth.nativeSignIn('APPLE', () => {})).rejects.toMatchObject({ code: 'NATIVE_AUTH_NOT_CONFIGURED' })
    mocks.platform = 'ios'; vi.stubEnv('VITE_NATIVE_APPLE_AUTH', 'false')
    await expect(auth.nativeSignIn('APPLE', () => {})).rejects.toMatchObject({ code: 'NATIVE_AUTH_NOT_CONFIGURED' })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
