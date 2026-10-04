import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { onRequest } from '../../functions/api/[[path]]'
import worker from '../src/index'
import { AuthService } from '../src/authService'
import { EntitlementService } from '../src/entitlementService'
import { sqliteBinding } from './sqliteD1'

const app = 'https://solemi-sleep-internal.pages.dev'
const api = 'https://solemi-sleep-sync-staging.czki-adam.workers.dev'
const mutations = ['google', 'refresh', 'logout', 'test/plan', 'family/claim', 'family/create',
  'family/bootstrap', 'family/join', 'family/leave', 'family/dissolve', 'family/data/clear']
let db: DatabaseSync, env: Parameters<typeof worker.fetch>[1]
let session: Awaited<ReturnType<AuthService['login']>>, service: AuthService
let forwarded: ReturnType<typeof vi.fn>

beforeEach(async () => {
  db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  for (const file of ['003_accounts_and_sessions.sql', '004_auth_challenges_and_refresh_history.sql',
    '005_family_memberships.sql', '006_subscriptions_and_entitlements.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  }
  env = { DB: sqliteBinding(db), TOKEN_PEPPER: 'test-pepper', ALLOWED_ORIGINS: app,
    AUTH_SECRET: 'local-test-secret-with-at-least-32-characters', GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com',
    ACCOUNT_FAMILY_BRIDGE: 'true', ENTITLEMENT_ENFORCEMENT: 'true' }
  service = new AuthService(env.DB, { clientId: env.GOOGLE_CLIENT_ID!, secret: env.AUTH_SECRET! }, async () => ({
    issuer: 'https://accounts.google.com', subject: 'fixture', email: 'fixture@example.test', name: 'Fixture', picture: null
  }))
  session = await service.login({ credential: 'fixture', nonce: await service.challenge(), installationSecret: 'a'.repeat(64), deviceName: 'Fixture' })
  forwarded = vi.fn((input: RequestInfo | URL, init?: RequestInit) => worker.fetch(new Request(input, init), env))
  vi.stubGlobal('fetch', forwarded)
})
afterEach(() => { db.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

function request(path: string, headers: HeadersInit = {}, method = 'POST', body = '{}') {
  return new Request(`${app}/api/v1/auth/${path}`, { method,
    headers: { Cookie: `solemi_refresh=${session.refresh}`, Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json', ...headers }, ...(method === 'GET' ? {} : { body }) })
}
const snapshot = () => ['account_sessions', 'used_refresh_tokens', 'account_devices', 'auth_challenges',
  'families', 'legacy_family_memberships', 'account_entitlements'].map(table => db.prepare(`SELECT * FROM ${table}`).all())

describe('A18 proxy and Worker authentication boundary', () => {
  it.each([undefined, 'null', 'https://foreign.example', 'https://sibling.solemi-sleep-internal.pages.dev',
    `${app}.attacker.example`, `${app}/`, 'http://solemi-sleep-internal.pages.dev'])(
    'rejects Origin %s before forwarding or changing any account state', async origin => {
      const before = snapshot()
      for (const path of mutations) {
        const response = await onRequest({ request: request(path, origin === undefined ? {} : { Origin: origin }) })
        expect(response.status, path).toBe(403)
        expect(response.headers.get('Set-Cookie')).toBeNull()
      }
      expect(forwarded).not.toHaveBeenCalled()
      expect(snapshot()).toEqual(before)
    })

  it.each(['cross-site', 'same-site', 'none'])('rejects contradictory Fetch Metadata %s even with a matching Origin', async site => {
    const before = snapshot()
    for (const path of mutations) {
      expect((await onRequest({ request: request(path, { Origin: app, 'Sec-Fetch-Site': site }) })).status).toBe(403)
    }
    expect(forwarded).not.toHaveBeenCalled()
    expect(snapshot()).toEqual(before)
  })

  it('also enforces Origin at the Worker when the proxy is bypassed', async () => {
    const before = snapshot()
    for (const path of mutations) {
      for (const origin of [undefined, 'null', 'https://foreign.example']) {
        const source = request(path, origin ? { Origin: origin } : {})
        const response = await worker.fetch(new Request(`${api}/v1/auth/${path}`, source), env)
        expect(response.status, path).toBe(403)
        expect(await response.json()).toMatchObject({ error: { code: 'ORIGIN_NOT_ALLOWED' } })
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
      }
    }
    expect(snapshot()).toEqual(before)
  })

  it('rotates and clears the real session cookie through the proxy while retaining its browser protections', async () => {
    const response = await onRequest({ request: request('refresh', { Origin: app, 'Sec-Fetch-Site': 'same-origin' }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const cookie = response.headers.get('Set-Cookie')!
    expect(cookie).toContain('Path=/api/v1/auth; Max-Age=')
    expect(cookie).toContain('HttpOnly; Secure; SameSite=Lax')
    const data = await response.json() as { data: { accessToken: string } }
    await expect(service.authenticate(data.data.accessToken)).resolves.toMatchObject({ account: { id: session.account.id } })
    const out = await onRequest({ request: request('logout', { Origin: app, Cookie: cookie.split(';')[0] }) })
    expect(out.status).toBe(200)
    expect(out.headers.get('Set-Cookie')).toContain('Path=/api/v1/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax')
    await expect(service.authenticate(data.data.accessToken)).rejects.toMatchObject({ code: 'SESSION_INVALID' })
  })

  it.each(['%', '%E0%A4%A', 'duplicate'])(
    'rejects malformed or ambiguous refresh cookie %s without a 500 or session mutation', async value => {
      const before = snapshot()
      const cookie = value === 'duplicate' ? `solemi_refresh=${session.refresh}; solemi_refresh=other` : `solemi_refresh=${value}`
      for (const path of ['refresh', 'logout']) {
        const response = await onRequest({ request: request(path, { Origin: app, Cookie: cookie }) })
        expect(response.status).toBe(401)
        expect(await response.json()).toMatchObject({ error: { code: 'SESSION_INVALID' } })
      }
      expect(snapshot()).toEqual(before)
    })

  it('requires an account bearer on reads even when a valid refresh cookie is present', async () => {
    for (const path of ['me', 'access', 'family/members', 'family/dissolution-preview']) {
      const source = request(path, { Origin: app }, 'GET')
      source.headers.delete('Authorization')
      const response = await onRequest({ request: source })
      expect(response.status, path).toBe(401)
      const upstreamHeaders = forwarded.mock.calls.at(-1)![1].headers as Headers
      expect(upstreamHeaders.get('Cookie')).toBeNull()
    }
  })

  it('supports the actual frontend access request through proxy and Worker without leaking unrelated cookies', async () => {
    await new EntitlementService(env.DB).setManualTestPlan(session.account.id, 'familyPlus')
    const storage = new Map<string, string>()
    const local = { getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }
    vi.stubGlobal('localStorage', local)
    vi.stubGlobal('sessionStorage', local)
    vi.stubGlobal('window', new EventTarget())
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubEnv('VITE_ACCOUNT_API_BASE', `${app}/api`)
    local.setItem('solemiSleep:activeWorkspace:v1', JSON.stringify({ kind: 'account', accountId: session.account.id }))
    local.setItem('solemiSleep:accountAccess', JSON.stringify(session))
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith(api)) return forwarded(input, init)
      const source = new Request(input, init)
      source.headers.set('Origin', app)
      source.headers.set('Sec-Fetch-Site', 'same-origin')
      source.headers.set('Cookie', `unrelated=private; solemi_refresh=${session.refresh}`)
      return onRequest({ request: source })
    })
    const auth = await import('../../src/accountAuth')
    expect((await auth.getAccountAccess()).features).toContain('FAMILY_PLUS_INSIGHTS')
    expect(forwarded).toHaveBeenCalledOnce()
    expect(forwarded.mock.calls[0][1].headers.get('Cookie')).toBeNull()
  })
})
