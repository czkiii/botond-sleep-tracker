import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import worker from '../src/index'
import { AuthService } from '../src/authService'
import { verifyGoogleToken } from '../src/googleAuth'
import { verifyAppleToken } from '../src/appleAuth'
import { sqliteBinding } from './sqliteD1'
import { trialRegistryFixture } from './trialRegistryFixture'
import { onRequest } from '../../functions/api/[[path]]'
vi.mock('../src/googleAuth', () => ({ verifyGoogleToken: vi.fn() }))
vi.mock('../src/appleAuth', () => ({ verifyAppleToken: vi.fn() }))
const google = { issuer: 'https://accounts.google.com', subject: 'stable-google', email: 'same@example.test', name: 'Parent', picture: null }
const apple = { issuer: 'https://appleid.apple.com' as const, subject: 'stable-apple', email: 'same@example.test', name: null, picture: null }
let db: DatabaseSync, registry: DatabaseSync, env: Parameters<typeof worker.fetch>[1], service: AuthService
beforeEach(async () => {
  vi.mocked(verifyGoogleToken).mockResolvedValue(google); vi.mocked(verifyAppleToken).mockResolvedValue(apple)
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(x => x.endsWith('.sql') && x >= '003').sort()) {
    db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'))
  }
  const fixture = await trialRegistryFixture(); registry = fixture.db
  env = { ...fixture.env, DB: sqliteBinding(db), TOKEN_PEPPER: 'test-pepper', AUTH_SECRET: 'secret-at-least-32-characters-for-test',
    ALLOWED_ORIGINS: 'https://solemi-sleep-internal.pages.dev', GOOGLE_CLIENT_ID: 'web', NATIVE_AUTH_ENABLED: 'true',
    NATIVE_GOOGLE_WEB_CLIENT_ID: 'web', NATIVE_GOOGLE_IOS_CLIENT_ID: 'ios', NATIVE_APPLE_CLIENT_ID: 'app.solemi.sleep', NATIVE_APPLE_AUTH_ENABLED: 'true' }
  service = new AuthService(env.DB, { clientId: 'web', secret: env.AUTH_SECRET!, nativeGoogleClientId: 'web', appleClientId: 'app.solemi.sleep' })
})
afterEach(() => { db.close(); registry.close(); vi.clearAllMocks(); vi.unstubAllGlobals() })
function post(path: string, body: object = {}, origin: string | null = 'capacitor://localhost', extra: HeadersInit = {}) {
  return worker.fetch(new Request(`https://api.example/v1/auth/${path}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...extra }, body: JSON.stringify(body) }), env)
}
async function login(provider = 'GOOGLE', origin = 'capacitor://localhost', installation = 'a') {
  const challenge = await post('native/challenge', { provider }, origin)
  expect(challenge.status).toBe(200)
  const { data } = await challenge.json() as { data: { nonce: string } }
  return post('native/login', { provider, nonce: data.nonce, credential: 'signed', installationSecret: installation.repeat(64) }, origin)
}
describe('native auth integration', () => {
  it('preserves the existing Google account and records the native platform', async () => {
    const web = await service.login({ credential: 'signed', nonce: await service.challenge(), installationSecret: 'b'.repeat(64), deviceName: 'Web' })
    const response = await login()
    expect(response.status).toBe(200); expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost')
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    const { data } = await response.json() as any
    expect(data.account.id).toBe(web.account.id); expect(data.refreshToken).toMatch(/^[a-f0-9]{64}$/)
    expect(db.prepare('SELECT platform FROM account_devices WHERE id=?').get(data.deviceId)).toEqual({ platform: 'IOS' })
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('creates a separate Apple identity even with the same verified email', async () => {
    const g = await (await login()).json() as any, a = await (await login('APPLE')).json() as any
    expect(a.data.account.id).not.toBe(g.data.account.id)
    expect(db.prepare('SELECT provider FROM account_identities ORDER BY provider').all()).toEqual([{ provider: 'APPLE' }, { provider: 'GOOGLE' }])
  })
  it('rotates body credentials, rejects replay, and never sets a browser cookie', async () => {
    const { data } = await (await login('GOOGLE', 'https://localhost')).json() as any
    const response = await post('native/refresh', { refreshToken: data.refreshToken }, 'https://localhost')
    expect(response.status).toBe(200); expect(response.headers.get('Set-Cookie')).toBeNull()
    const rotated = await response.json() as any
    expect(rotated.data.refreshToken).not.toBe(data.refreshToken)
    expect((await post('native/refresh', { refreshToken: data.refreshToken })).status).toBe(401)
    expect((await post('native/refresh', { refreshToken: rotated.data.refreshToken })).status).toBe(401)
  })
  it('revokes the mobile session on logout', async () => {
    const { data } = await (await login()).json() as any
    expect((await post('native/logout', { refreshToken: data.refreshToken })).status).toBe(200)
    await expect(service.authenticate(data.accessToken)).rejects.toMatchObject({ code: 'SESSION_INVALID' })
  })
  it.each([null, 'null', 'https://solemi-sleep-internal.pages.dev', 'http://localhost', 'capacitor://localhost.evil', 'https://localhost/'])('rejects native credential responses to Origin %s', async origin => {
    for (const route of ['challenge', 'login', 'refresh', 'logout']) expect((await post('native/' + route, { provider: 'GOOGLE', refreshToken: 'a'.repeat(64) }, origin)).status).toBe(403)
  })
  it('keeps native auth off by default and separately gates unfinished Apple provisioning', async () => {
    env.NATIVE_AUTH_ENABLED = 'false'
    expect((await post('native/challenge', { provider: 'GOOGLE' })).status).toBe(404)
    env.NATIVE_AUTH_ENABLED = 'true'; env.NATIVE_APPLE_AUTH_ENABLED = 'false'
    expect((await post('native/challenge', { provider: 'APPLE' })).status).toBe(503)
    env.NATIVE_GOOGLE_IOS_CLIENT_ID = undefined
    expect((await post('native/challenge', { provider: 'GOOGLE' })).status).toBe(503)
    expect((await post('native/challenge', { provider: 'APPLE' }, 'https://localhost')).status).toBe(400)
  })
  it('does not accept refresh secrets from a native cookie or from a web request body', async () => {
    const { data } = await (await login()).json() as any
    expect((await post('native/refresh', {}, 'capacitor://localhost', { Cookie: `solemi_refresh=${data.refreshToken}` })).status).toBe(400)
    expect((await post('refresh', { refreshToken: data.refreshToken }, 'https://solemi-sleep-internal.pages.dev')).status).toBe(401)
  })
  it('scopes single-use challenges to provider, platform and web/native transport', async () => {
    const nonce = await service.challenge(Date.now(), 'native:GOOGLE:IOS')
    const input = { nonce, credential: 'signed', installationSecret: 'a'.repeat(64), deviceName: 'Phone' }
    await expect(service.login(input)).rejects.toMatchObject({ code: 'LOGIN_CHALLENGE_INVALID' })
    await expect(service.loginNative({ ...input, provider: 'APPLE', platform: 'IOS' })).rejects.toMatchObject({ code: 'LOGIN_CHALLENGE_INVALID' })
    await expect(service.loginNative({ ...input, provider: 'GOOGLE', platform: 'ANDROID' })).rejects.toMatchObject({ code: 'LOGIN_CHALLENGE_INVALID' })
    await service.loginNative({ ...input, provider: 'GOOGLE', platform: 'IOS' })
    await expect(service.loginNative({ ...input, provider: 'GOOGLE', platform: 'IOS' })).rejects.toMatchObject({ code: 'LOGIN_CHALLENGE_INVALID' })
  })
  it('uses the same two-device limit and authenticated replacement for phones', async () => {
    await login('GOOGLE', 'capacitor://localhost', 'a'); await login('GOOGLE', 'https://localhost', 'b')
    const response = await login('GOOGLE', 'capacitor://localhost', 'c')
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: 'DEVICE_LIMIT_REACHED' }, data: { devices: expect.any(Array) } })
  })
  it('applies the existing auth rate limit before native login work', async () => {
    env.AUTH_LIMITER = { limit: vi.fn(async () => ({ success: false })) }
    for (const route of ['challenge', 'login', 'refresh', 'logout']) expect((await post('native/' + route)).status).toBe(429)
    expect(verifyGoogleToken).not.toHaveBeenCalled()
  })
  it('does not proxy native secret-bearing routes through the public web app', async () => {
    const forwarded = vi.fn(); vi.stubGlobal('fetch', forwarded)
    const response = await onRequest({ request: new Request('https://solemi-sleep-internal.pages.dev/api/v1/auth/native/refresh', {
      method: 'POST', headers: { Origin: 'https://solemi-sleep-internal.pages.dev' }, body: '{}' }) })
    expect(response.status).toBe(404); expect(forwarded).not.toHaveBeenCalled()
  })
})
