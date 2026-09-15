import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import worker from '../src/index'
import { sqliteBinding } from './sqliteD1'
import { SignJWT } from 'jose'

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const migrations = ['003_accounts_and_sessions.sql', '004_auth_challenges_and_refresh_history.sql', '005_family_memberships.sql']
  .map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')).join('\n')
const origin = 'https://solemi-sleep-internal.pages.dev'
let sqlite: DatabaseSync
let env: { DB: D1Database; TOKEN_PEPPER: string; ALLOWED_ORIGINS: string;
  GOOGLE_CLIENT_ID?: string; AUTH_SECRET?: string; ACCOUNT_FAMILY_BRIDGE?: string }

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(schema)
  sqlite.exec(migrations)
  env = { DB: sqliteBinding(sqlite), TOKEN_PEPPER: 'test-pepper', ALLOWED_ORIGINS: origin,
    GOOGLE_CLIENT_ID: 'solemi.apps.googleusercontent.com',
    AUTH_SECRET: 'test-secret-with-at-least-32-characters', ACCOUNT_FAMILY_BRIDGE: 'true' }
})
afterEach(() => sqlite.close())

function fetch(path: string, init: RequestInit = {}) {
  return worker.fetch(new Request(`https://sync.example${path}`, init), env)
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function accountAccess(accountId: string, deviceId: string, suffix: string) {
  const now = Date.now()
  const sessionId = `ses_${suffix}`
  sqlite.prepare(`INSERT OR IGNORE INTO accounts
    (id, email, display_name, avatar_url, locale, status, created_at, updated_at, last_login_at, deleted_at)
    VALUES (?, ?, NULL, NULL, NULL, 'ACTIVE', ?, ?, ?, NULL)`)
    .run(accountId, `${accountId}@example.com`, now, now, now)
  sqlite.prepare(`INSERT INTO account_devices
    (id, account_id, installation_hash, credential_hash, name, platform, created_at, last_seen_at, revoked_at, revoke_reason)
    VALUES (?, ?, ?, ?, 'Test browser', 'WEB', ?, ?, NULL, NULL)`)
    .run(deviceId, accountId, `installation_${suffix}`, `credential_${suffix}`, now, now)
  sqlite.prepare(`INSERT INTO account_sessions
    (id, account_id, device_id, refresh_hash, created_at, last_used_at, expires_at, revoked_at, rotation_counter)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0)`)
    .run(sessionId, accountId, deviceId, `refresh_${suffix}`, now, now, now + 60_000)
  return new SignJWT({ sid: sessionId, did: deviceId }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('solemi-auth').setAudience('solemi-account').setSubject(accountId)
    .setIssuedAt(Math.floor(now / 1000)).setExpirationTime(Math.floor(now / 1000) + 300)
    .sign(new TextEncoder().encode(env.AUTH_SECRET!))
}

async function seedLegacyFamily(token: string) {
  const now = new Date().toISOString()
  sqlite.prepare(`INSERT INTO families (id, name, revision, created_at)
    VALUES ('fam_test', 'Teszt család', 0, ?)`).run(now)
  sqlite.prepare(`INSERT INTO devices (id, family_id, token_hash, name, created_at, last_seen_at, revoked_at)
    VALUES ('dev_legacy', 'fam_test', ?, 'Safari', ?, ?, NULL)`)
    .run(await sha256(`${env.TOKEN_PEPPER}:${token}`), now, now)
}

async function seedInvite(code: string) {
  const now = new Date()
  sqlite.prepare(`INSERT INTO invite_codes
    (code_hash, family_id, created_by_device_id, created_at, expires_at, used_at)
    VALUES (?, 'fam_test', 'dev_legacy', ?, ?, NULL)`)
    .run(await sha256(`${env.TOKEN_PEPPER}:${code}`), now.toISOString(),
      new Date(now.getTime() + 30 * 60 * 1000).toISOString())
}

describe('account auth routes', () => {
  it('returns a stored one-use challenge and public client ID with credentialed CORS', async () => {
    const response = await fetch('/v1/auth/challenge', { headers: { Origin: origin } })
    const body = await response.json() as { data: { nonce: string; clientId: string } }
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(body.data.clientId).toBe(env.GOOGLE_CLIENT_ID)
    expect(body.data.nonce).toMatch(/^[a-f0-9]{64}$/)
    expect(sqlite.prepare('SELECT nonce_hash FROM auth_challenges').get()).not.toEqual({ nonce_hash: body.data.nonce })
  })

  it('keeps health available while account auth is not configured', async () => {
    delete env.GOOGLE_CLIENT_ID
    delete env.AUTH_SECRET
    expect((await fetch('/health')).status).toBe(200)
    const response = await fetch('/v1/auth/challenge')
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: 'AUTH_NOT_CONFIGURED' } })
  })

  it('rejects cross-origin cookie mutations and missing refresh cookies', async () => {
    const foreign = await fetch('/v1/auth/refresh', { method: 'POST', headers: { Origin: 'https://attacker.example' } })
    expect(foreign.status).toBe(403)
    expect(await foreign.json()).toMatchObject({ error: { code: 'ORIGIN_NOT_ALLOWED' } })
    const missing = await fetch('/v1/auth/refresh', { method: 'POST', headers: { Origin: origin } })
    expect(missing.status).toBe(401)
    expect(await missing.json()).toMatchObject({ error: { code: 'SESSION_INVALID' } })
  })

  it('advertises credential support only to allowed origins', async () => {
    const response = await fetch('/v1/auth/refresh', { method: 'OPTIONS', headers: { Origin: origin } })
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
  })

  it('claims a legacy family once and restores it on the same account second device', async () => {
    const legacyToken = 'ss_dv_existing-family-token'
    await seedLegacyFamily(legacyToken)
    const firstAccess = await accountAccess('acc_owner', 'adev_safari', 'first')

    const claimed = await fetch('/v1/auth/family/claim', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${firstAccess}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyDeviceToken: legacyToken })
    })
    expect(claimed.status).toBe(200)
    expect(await claimed.json()).toMatchObject({ data: { familyId: 'fam_test', role: 'ADMIN' } })
    expect(sqlite.prepare(`SELECT family_id, account_id, role, status FROM legacy_family_memberships`).get())
      .toEqual({ family_id: 'fam_test', account_id: 'acc_owner', role: 'ADMIN', status: 'ACTIVE' })

    const secondAccess = await accountAccess('acc_owner', 'adev_chrome', 'second')
    const restored = await fetch('/v1/auth/family/bootstrap', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${secondAccess}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: 'Chrome · Windows' })
    })
    expect(restored.status).toBe(200)
    const restoredBody = await restored.json() as { data: { connection: { familyId: string; deviceToken: string } } }
    expect(restoredBody.data.connection.familyId).toBe('fam_test')
    expect(restoredBody.data.connection.deviceToken).toMatch(/^ss_dv_/)

    const sync = await fetch('/v1/sync?after=0', {
      headers: { Authorization: `Bearer ${restoredBody.data.connection.deviceToken}` }
    })
    expect(sync.status).toBe(200)
    expect(await sync.json()).toMatchObject({ data: { familyName: 'Teszt család', revision: 0 } })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM account_family_devices').get()).toEqual({ count: 2 })
  })

  it('does not let a different account claim an already owned legacy family', async () => {
    const legacyToken = 'ss_dv_existing-family-token'
    await seedLegacyFamily(legacyToken)
    const owner = await accountAccess('acc_owner', 'adev_owner', 'owner')
    const other = await accountAccess('acc_other', 'adev_other', 'other')
    const request = (access: string) => fetch('/v1/auth/family/claim', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyDeviceToken: legacyToken })
    })
    expect((await request(owner)).status).toBe(200)
    const rejected = await request(other)
    expect(rejected.status).toBe(409)
    expect(await rejected.json()).toMatchObject({ error: { code: 'ACCOUNT_INVITE_REQUIRED' } })
  })

  it('redeems an invite as a member account and returns a working family connection', async () => {
    const legacyToken = 'ss_dv_existing-family-token'
    const inviteCode = 'SOLEMI7'
    await seedLegacyFamily(legacyToken)
    const owner = await accountAccess('acc_owner', 'adev_owner', 'owner')
    const claim = await fetch('/v1/auth/family/claim', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyDeviceToken: legacyToken })
    })
    expect(claim.status).toBe(200)
    await seedInvite(inviteCode)

    const member = await accountAccess('acc_member', 'adev_member', 'member')
    const joined = await fetch('/v1/auth/family/join', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${member}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inviteCode, deviceName: 'Chrome · Android' })
    })
    expect(joined.status).toBe(201)
    const body = await joined.json() as { data: { membership: { role: string }; connection: { deviceToken: string } } }
    expect(body.data.membership.role).toBe('MEMBER')
    expect(sqlite.prepare(`SELECT role, status FROM legacy_family_memberships
      WHERE account_id = 'acc_member'`).get()).toEqual({ role: 'MEMBER', status: 'ACTIVE' })
    expect(sqlite.prepare(`SELECT family_id FROM account_family_devices
      WHERE account_device_id = 'adev_member'`).get()).toEqual({ family_id: 'fam_test' })

    const sync = await fetch('/v1/sync?after=0', {
      headers: { Authorization: `Bearer ${body.data.connection.deviceToken}` }
    })
    expect(sync.status).toBe(200)

    const reused = await fetch('/v1/auth/family/join', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${member}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inviteCode, deviceName: 'Chrome · Android' })
    })
    expect(reused.status).toBe(409)
    expect(await reused.json()).toMatchObject({ error: { code: 'INVITE_ALREADY_USED' } })
  })

  it('requires the family creator to claim the family before an account invite can be redeemed', async () => {
    const legacyToken = 'ss_dv_existing-family-token'
    const inviteCode = 'SOLEMI8'
    await seedLegacyFamily(legacyToken)
    await seedInvite(inviteCode)
    const member = await accountAccess('acc_member', 'adev_member', 'unclaimed')
    const response = await fetch('/v1/auth/family/join', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${member}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inviteCode, deviceName: 'Firefox · Windows' })
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: 'FAMILY_OWNER_ACCOUNT_REQUIRED' } })
    expect(sqlite.prepare('SELECT used_at FROM invite_codes').get()).toEqual({ used_at: null })
  })
})
