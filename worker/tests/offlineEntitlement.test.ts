import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { offlineEntitlement } from '../src/offlineEntitlement'
import { sqliteBinding } from './sqliteD1'
import { SignJWT } from 'jose'
import worker from '../src/index'

class MemoryStorage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}
const now = 1_800_000_000_000, day = 86400_000
const workspaceKey = 'solemiSleep:activeWorkspace:v1'
const cacheKey = 'solemiSleep:offlineEntitlement:v1'
const deviceKey = 'solemiSleep:offlineDevice:v1'
const access = { account: { id: 'owner' }, deviceId: 'device', sessionId: 'session' }
let db: DatabaseSync, privateJwk: string
let client: typeof import('../../src/offlineEntitlement')

beforeEach(async () => {
  vi.resetModules()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('sessionStorage', new MemoryStorage())
  vi.stubGlobal('navigator', { onLine: false, language: 'hu-HU' })
  vi.stubGlobal('window', new EventTarget())
  localStorage.setItem(workspaceKey, JSON.stringify({ kind: 'account', accountId: 'owner' }))
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  privateJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', keys.privateKey))
  vi.stubEnv('VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK', JSON.stringify(await crypto.subtle.exportKey('jwk', keys.publicKey)))
  db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  for (const name of ['003_accounts_and_sessions.sql', '004_auth_challenges_and_refresh_history.sql',
    '005_family_memberships.sql', '006_subscriptions_and_entitlements.sql', '010_account_trials.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
  }
  db.prepare(`INSERT INTO accounts (id, status, created_at, updated_at, last_login_at) VALUES ('owner', 'ACTIVE', ?, ?, ?)`).run(now, now, now)
  db.prepare(`INSERT INTO account_devices (id, account_id, installation_hash, credential_hash, created_at, last_seen_at)
    VALUES ('device', 'owner', 'installation', 'credential', ?, ?)`).run(now, now)
  db.prepare(`INSERT INTO account_sessions (id, account_id, device_id, refresh_hash, created_at, last_used_at, expires_at)
    VALUES ('session', 'owner', 'device', 'refresh', ?, ?, ?)`).run(now, now, now + 40 * day)
  db.prepare(`INSERT INTO account_entitlements (id, account_id, feature_key, source_type, source_id, valid_from, valid_until, created_at, updated_at)
    VALUES ('grant', 'owner', 'FAMILY_PLUS_INSIGHTS', 'SUBSCRIPTION', 'source', ?, ?, ?, ?)`)
    .run(now, now + 5 * day, now, now)
  client = await import('../../src/offlineEntitlement')
})
afterEach(() => { db.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
async function issue() { return offlineEntitlement(sqliteBinding(db), privateJwk, access, now) }
async function save() {
  const token = await issue()
  expect(token).toBeTypeOf('string')
  await client.saveOfflineEntitlement(token, 'owner', 'device')
  return token!
}

describe('server-signed offline entitlement and client validation', () => {
  it('issues a verifiable receipt through the authenticated access route, never from a receipt used as bearer', async () => {
    // The route uses real time for authentication, matching the fixed test clock.
    const token = await new SignJWT({ sid: 'session', did: 'device' }).setProtectedHeader({ alg: 'HS256' })
      .setIssuer('solemi-auth').setAudience('solemi-account').setSubject('owner')
      .setIssuedAt(now / 1000).setExpirationTime(now / 1000 + 300)
      .sign(new TextEncoder().encode('test-secret-with-at-least-32-characters'))
    const env = { DB: sqliteBinding(db), TOKEN_PEPPER: 'test-pepper', ALLOWED_ORIGINS: 'https://local.test',
      GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com', AUTH_SECRET: 'test-secret-with-at-least-32-characters',
      OFFLINE_ENTITLEMENT_PRIVATE_JWK: privateJwk }
    const response = await worker.fetch(new Request('https://local.test/v1/auth/access', { headers: { Authorization: `Bearer ${token}` } }), env)
    expect(response.status).toBe(200)
    const body = await response.json() as { data: { offlineGrant: string } }
    await client.saveOfflineEntitlement(body.data.offlineGrant, 'owner', 'device')
    expect((await client.readOfflineEntitlement())?.features).toEqual(['FAMILY_PLUS_INSIGHTS'])
    const denied = await worker.fetch(new Request('https://local.test/v1/auth/access', {
      headers: { Authorization: `Bearer ${body.data.offlineGrant}` }
    }), env)
    expect(denied.status).toBe(401)
  })

  it('includes an active family payer but excludes that grant after leaving the family', async () => {
    db.prepare(`INSERT INTO accounts (id, status, created_at, updated_at, last_login_at) VALUES ('payer', 'ACTIVE', ?, ?, ?)`).run(now, now, now)
    db.prepare(`INSERT INTO families VALUES ('family', 'Family', 0, '2026-10-04')`).run()
    db.prepare(`INSERT INTO legacy_family_memberships VALUES ('m1', 'family', 'owner', 'ADMIN', 'ACTIVE', ?, NULL)`).run(now)
    db.prepare(`INSERT INTO legacy_family_memberships VALUES ('m2', 'family', 'payer', 'MEMBER', 'ACTIVE', ?, NULL)`).run(now)
    db.prepare(`UPDATE account_entitlements SET account_id = 'payer'`).run()
    await save()
    expect((await client.readOfflineEntitlement())?.features).toEqual(['FAMILY_PLUS_INSIGHTS'])
    db.prepare(`UPDATE legacy_family_memberships SET status = 'LEFT', ended_at = ? WHERE account_id = 'owner'`).run(now)
    expect(await issue()).toBeUndefined()
  })

  it('restores only local paid features after a cold offline start without authenticating the account', async () => {
    await save()
    vi.resetModules()
    const auth = await import('../../src/accountAuth')
    const accountEvents: unknown[] = [], accessEvents: unknown[] = []
    window.addEventListener(auth.ACCOUNT_STATE_EVENT, e => accountEvents.push((e as CustomEvent).detail.account))
    window.addEventListener(auth.ACCOUNT_ACCESS_EVENT, e => accessEvents.push((e as CustomEvent).detail.access))
    vi.stubGlobal('fetch', vi.fn())
    expect(await auth.restoreAccount()).toBeNull()
    expect(accountEvents).toEqual([null])
    expect(accessEvents).toEqual([expect.objectContaining({ features: ['FAMILY_PLUS_INSIGHTS'],
      familySync: { canSync: false, status: 'NO_ACTIVE_MEMBERSHIP' }, offlineUntil: now + 5 * day })])
    expect((await auth.getAccountAccess()).features).toEqual(['FAMILY_PLUS_INSIGHTS'])
    expect(fetch).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('solemiSleep:accountAccess')).toBeNull()
  })

  it.each(['grant', 'session', 'thirty-days'])('caps expiry at %s', async (limit) => {
    if (limit !== 'grant') db.prepare('UPDATE account_entitlements SET valid_until = ?').run(now + 60 * day)
    if (limit === 'session') db.prepare('UPDATE account_sessions SET expires_at = ?').run(now + 2 * day)
    await save()
    const expected = now + (limit === 'grant' ? 5 : limit === 'session' ? 2 : 30) * day
    expect((await client.readOfflineEntitlement())?.offlineUntil).toBe(expected)
    vi.spyOn(Date, 'now').mockReturnValue(expected)
    expect(await client.readOfflineEntitlement()).toBeNull()
  })

  it.each(['payload', 'signature', 'wrong-key', 'missing-key', 'account', 'device'])(
    'rejects an invalid %s', async (state) => {
      const token = await save()
      if (state === 'payload' || state === 'signature') {
        const parts = token.split('.')
        if (state === 'payload') {
          const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
          claims.exp += 86400
          parts[1] = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
        } else parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1)
        localStorage.setItem(cacheKey, JSON.stringify({ token: parts.join('.'), seenAt: now }))
      }
      if (state === 'wrong-key') {
        const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
        vi.stubEnv('VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK', JSON.stringify(await crypto.subtle.exportKey('jwk', keys.publicKey)))
      }
      if (state === 'missing-key') vi.stubEnv('VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK', '')
      if (state === 'account') localStorage.setItem(workspaceKey, JSON.stringify({ kind: 'account', accountId: 'other' }))
      if (state === 'device') localStorage.setItem(deviceKey, JSON.stringify({ accountId: 'owner', deviceId: 'other' }))
      expect(await client.readOfflineEntitlement()).toBeNull()
    })

  it('rejects clock rollback after reopening and does not recover the receipt by putting the clock back', async () => {
    await save()
    vi.spyOn(Date, 'now').mockReturnValue(now + day)
    expect(await client.readOfflineEntitlement()).not.toBeNull()
    vi.resetModules(); client = await import('../../src/offlineEntitlement')
    vi.spyOn(Date, 'now').mockReturnValue(now)
    expect(await client.readOfflineEntitlement()).toBeNull()
    vi.spyOn(Date, 'now').mockReturnValue(now + day)
    expect(await client.readOfflineEntitlement()).toBeNull()
  })

  it('uses elapsed monotonic time even if the wall clock stops', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
    await save()
    vi.spyOn(performance, 'now').mockReturnValue(6 * day)
    expect(await client.readOfflineEntitlement()).toBeNull()
  })

  it.each(['revoked', 'future', 'session-revoked', 'no-signing-key'])(
    'does not issue a receipt for %s', async (state) => {
      if (state === 'revoked') db.prepare('UPDATE account_entitlements SET revoked_at = ?').run(now)
      if (state === 'future') db.prepare('UPDATE account_entitlements SET valid_from = ?').run(now + day)
      if (state === 'session-revoked') db.prepare('UPDATE account_sessions SET revoked_at = ?').run(now)
      expect(await offlineEntitlement(sqliteBinding(db), state === 'no-signing-key' ? undefined : privateJwk, access, now)).toBeUndefined()
    })

  it('clears previous offline rights on a fresh online Free response', async () => {
    await save()
    vi.stubGlobal('navigator', { onLine: true, language: 'hu-HU' })
    sessionStorage.setItem('solemiSleep:accountAccess', JSON.stringify({ account: { id: 'owner' }, deviceId: 'device',
      accessToken: 'access', accessExpiresAt: now + 300000 }))
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, data: {
      features: [], accountFeatures: [], familyFeatures: [], membership: null, familySync: { status: 'NO_ACTIVE_MEMBERSHIP', canSync: false }
    } })))
    const auth = await import('../../src/accountAuth')
    expect((await auth.getAccountAccess()).features).toEqual([])
    expect(await client.readOfflineEntitlement()).toBeNull()
  })

  it('preserves signed local rights during throttling without enabling cloud sync', async () => {
    await save()
    vi.stubGlobal('navigator', { onLine: true, language: 'hu-HU' })
    sessionStorage.setItem('solemiSleep:accountAccess', JSON.stringify({ account: { id: 'owner' }, deviceId: 'device',
      accessToken: 'access', accessExpiresAt: now + 300000 }))
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, error: { code: 'RATE_LIMITED' } },
      { status: 429, headers: { 'Retry-After': '60' } })))
    const auth = await import('../../src/accountAuth')
    const result = await auth.getAccountAccess()
    expect(result.features).toEqual(['FAMILY_PLUS_INSIGHTS'])
    expect(result.familySync.canSync).toBe(false)
    expect(await client.readOfflineEntitlement()).not.toBeNull()
  })

  it('preserves verified local rights on transport failure but clears them on a revoked session', async () => {
    await save()
    vi.stubGlobal('navigator', { onLine: true, language: 'hu-HU' })
    sessionStorage.setItem('solemiSleep:accountAccess', JSON.stringify({ account: { id: 'owner' }, deviceId: 'device',
      accessToken: 'access', accessExpiresAt: now + 300000 }))
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Network unavailable'))
    vi.stubGlobal('fetch', fetchMock)
    const auth = await import('../../src/accountAuth')
    expect((await auth.getAccountAccess()).features).toEqual(['FAMILY_PLUS_INSIGHTS'])
    fetchMock.mockResolvedValueOnce(Response.json({ ok: false, error: { code: 'SESSION_INVALID' } }, { status: 401 }))
    await expect(auth.getAccountAccess()).rejects.toMatchObject({ code: 'SESSION_INVALID' })
    expect(await client.readOfflineEntitlement()).toBeNull()
  })
})
