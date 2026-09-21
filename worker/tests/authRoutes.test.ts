import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import worker from '../src/index'
import { sqliteBinding } from './sqliteD1'
import { SignJWT } from 'jose'

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const migrations = ['003_accounts_and_sessions.sql', '004_auth_challenges_and_refresh_history.sql',
  '005_family_memberships.sql', '006_subscriptions_and_entitlements.sql']
  .map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')).join('\n')
const origin = 'https://solemi-sleep-internal.pages.dev'
let sqlite: DatabaseSync
let env: { DB: D1Database; TOKEN_PEPPER: string; ALLOWED_ORIGINS: string;
  GOOGLE_CLIENT_ID?: string; AUTH_SECRET?: string; ACCOUNT_FAMILY_BRIDGE?: string;
  ENTITLEMENT_ENFORCEMENT?: string; ENTITLEMENT_TEST_MODE?: string;
  RECONCILIATION_CONFLICTS?: string }

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

  it('moves admin to the oldest remaining member and revokes every device when an account leaves', async () => {
    const legacyToken = 'ss_dv_leave_owner'
    const inviteCode = 'LEAVE01'
    await seedLegacyFamily(legacyToken)
    const owner = await accountAccess('acc_owner', 'adev_owner_first', 'leave_owner_first')
    expect((await fetch('/v1/auth/family/claim', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyDeviceToken: legacyToken })
    })).status).toBe(200)

    const ownerSecond = await accountAccess('acc_owner', 'adev_owner_second', 'leave_owner_second')
    const restored = await fetch('/v1/auth/family/bootstrap', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${ownerSecond}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: 'Owner second phone' })
    })
    const restoredBody = await restored.json() as { data: { connection: { deviceToken: string } } }
    await seedInvite(inviteCode)
    const member = await accountAccess('acc_member', 'adev_member', 'leave_member')
    expect((await fetch('/v1/auth/family/join', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${member}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inviteCode, deviceName: 'Member phone' })
    })).status).toBe(201)

    const left = await fetch('/v1/auth/family/leave', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${owner}` }
    })
    expect(left.status).toBe(200)
    expect(await left.json()).toMatchObject({ data: { left: true, membership: null, adminTransferred: true } })
    expect(sqlite.prepare(`SELECT account_id, role, status FROM legacy_family_memberships ORDER BY account_id`).all())
      .toEqual([
        { account_id: 'acc_member', role: 'ADMIN', status: 'ACTIVE' },
        { account_id: 'acc_owner', role: 'ADMIN', status: 'LEFT' }
      ])
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM devices d
      JOIN account_family_devices afd ON afd.legacy_device_id = d.id
      WHERE afd.account_id = 'acc_owner' AND d.revoked_at IS NOT NULL`).get()).toEqual({ count: 2 })

    const noReconnect = await fetch('/v1/auth/family/bootstrap', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${ownerSecond}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: 'Owner second phone' })
    })
    expect(await noReconnect.json()).toMatchObject({ data: { membership: null } })
    const revokedSync = await fetch('/v1/sync?after=0', {
      headers: { Authorization: `Bearer ${restoredBody.data.connection.deviceToken}` }
    })
    expect(revokedSync.status).toBe(403)
    expect(await revokedSync.json()).toMatchObject({ error: { code: 'DEVICE_REVOKED' } })
  })

  it('lists possible successors and honors the admin selected for transfer', async () => {
    const legacyToken = 'ss_dv_selected_successor'
    await seedLegacyFamily(legacyToken)
    const owner = await accountAccess('acc_owner', 'adev_owner', 'selected_owner')
    expect((await fetch('/v1/auth/family/claim', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyDeviceToken: legacyToken })
    })).status).toBe(200)
    await accountAccess('acc_oldest', 'adev_oldest', 'selected_oldest')
    await accountAccess('acc_chosen', 'adev_chosen', 'selected_chosen')
    sqlite.prepare(`UPDATE accounts SET display_name = 'Older member' WHERE id = 'acc_oldest'`).run()
    sqlite.prepare(`UPDATE accounts SET display_name = 'Chosen member' WHERE id = 'acc_chosen'`).run()
    sqlite.prepare(`INSERT INTO legacy_family_memberships
      (id, family_id, account_id, role, status, joined_at, ended_at)
      VALUES ('mem_oldest', 'fam_test', 'acc_oldest', 'MEMBER', 'ACTIVE', 10, NULL),
             ('mem_chosen', 'fam_test', 'acc_chosen', 'MEMBER', 'ACTIVE', 20, NULL)`).run()

    const members = await fetch('/v1/auth/family/members', {
      headers: { Authorization: `Bearer ${owner}` }
    })
    expect(members.status).toBe(200)
    expect(await members.json()).toMatchObject({ data: { members: [
      { accountId: 'acc_oldest', name: 'Older member' },
      { accountId: 'acc_chosen', name: 'Chosen member' }
    ] } })

    const invalid = await fetch('/v1/auth/family/leave', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ successorAccountId: 'acc_not_a_member' })
    })
    expect(invalid.status).toBe(409)
    expect(await invalid.json()).toMatchObject({ error: { code: 'FAMILY_SUCCESSOR_INVALID' } })
    expect(sqlite.prepare(`SELECT status FROM legacy_family_memberships WHERE account_id = 'acc_owner'`).get())
      .toEqual({ status: 'ACTIVE' })

    const left = await fetch('/v1/auth/family/leave', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ successorAccountId: 'acc_chosen' })
    })
    expect(left.status).toBe(200)
    expect(sqlite.prepare(`SELECT account_id FROM legacy_family_memberships
      WHERE family_id = 'fam_test' AND status = 'ACTIVE' AND role = 'ADMIN'`).get())
      .toEqual({ account_id: 'acc_chosen' })
  })

  it('requires the separate dissolution flow when the final member tries to leave', async () => {
    const legacyToken = 'ss_dv_last_member'
    await seedLegacyFamily(legacyToken)
    const owner = await accountAccess('acc_owner', 'adev_owner', 'last_member')
    expect((await fetch('/v1/auth/family/claim', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyDeviceToken: legacyToken })
    })).status).toBe(200)

    const rejected = await fetch('/v1/auth/family/leave', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${owner}` }
    })
    expect(rejected.status).toBe(409)
    expect(await rejected.json()).toMatchObject({ error: { code: 'FAMILY_DISSOLUTION_REQUIRED' } })
    expect(sqlite.prepare(`SELECT role, status, ended_at FROM legacy_family_memberships`).get())
      .toEqual({ role: 'ADMIN', status: 'ACTIVE', ended_at: null })
    expect(sqlite.prepare(`SELECT revoked_at FROM devices`).get()).toEqual({ revoked_at: null })
  })

  it('pauses family sync when the leaving member was the final payer', async () => {
    env.ENTITLEMENT_ENFORCEMENT = 'true'
    env.ENTITLEMENT_TEST_MODE = 'true'
    const legacyToken = 'ss_dv_payer_leave_owner'
    const inviteCode = 'PAYLEFT'
    await seedLegacyFamily(legacyToken)
    const owner = await accountAccess('acc_owner', 'adev_owner', 'payer_leave_owner')
    expect((await fetch('/v1/auth/family/claim', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyDeviceToken: legacyToken })
    })).status).toBe(200)
    await seedInvite(inviteCode)

    const payer = await accountAccess('acc_payer', 'adev_payer', 'payer_leave_member')
    const joined = await fetch('/v1/auth/family/join', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${payer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inviteCode, deviceName: 'Payer phone' })
    })
    expect(joined.status).toBe(201)
    expect((await fetch('/v1/auth/test/plan', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${payer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'family' })
    })).status).toBe(200)

    const before = await fetch('/v1/auth/access', { headers: { Authorization: `Bearer ${owner}` } })
    expect(await before.json()).toMatchObject({ data: {
      familySync: { status: 'ACTIVE', canSync: true, familyId: 'fam_test' }
    } })

    const left = await fetch('/v1/auth/family/leave', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${payer}` }
    })
    expect(left.status).toBe(200)
    const ownerAfter = await fetch('/v1/auth/access', { headers: { Authorization: `Bearer ${owner}` } })
    expect(await ownerAfter.json()).toMatchObject({ data: {
      membership: { familyId: 'fam_test', role: 'ADMIN' },
      familyFeatures: [],
      familySync: { status: 'PAUSED', canSync: false, familyId: 'fam_test' }
    } })
    const payerAfter = await fetch('/v1/auth/access', { headers: { Authorization: `Bearer ${payer}` } })
    expect(await payerAfter.json()).toMatchObject({ data: {
      membership: null,
      accountFeatures: ['FAMILY_SYNC', 'PDF_EXPORT'],
      familyFeatures: [],
      familySync: { status: 'NO_ACTIVE_MEMBERSHIP', canSync: false }
    } })
  })

  it('shares the highest active family plan and pauses after the last grant ends', async () => {
    env.ENTITLEMENT_ENFORCEMENT = 'true'
    env.ENTITLEMENT_TEST_MODE = 'true'
    const legacyToken = 'ss_dv_entitlement-owner-token'
    const inviteCode = 'SOLEMI9'
    await seedLegacyFamily(legacyToken)
    const owner = await accountAccess('acc_owner', 'adev_owner', 'ent_owner')
    expect((await fetch('/v1/auth/family/claim', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyDeviceToken: legacyToken })
    })).status).toBe(200)
    await seedInvite(inviteCode)

    const member = await accountAccess('acc_member', 'adev_member', 'ent_member')
    const joined = await fetch('/v1/auth/family/join', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${member}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inviteCode, deviceName: 'Chrome · Android' })
    })
    const joinedBody = await joined.json() as { data: { connection: { deviceToken: string } } }

    const setPlan = (access: string, plan: 'free' | 'family' | 'familyPlus') => fetch('/v1/auth/test/plan', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan })
    })
    expect((await setPlan(owner, 'familyPlus')).status).toBe(200)
    const freeMember = await setPlan(member, 'free')
    expect(freeMember.status).toBe(200)
    expect(await freeMember.json()).toMatchObject({ data: {
      features: ['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT'],
      accountFeatures: [],
      familyFeatures: ['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT'],
      familySync: { status: 'ACTIVE', canSync: true, familyId: 'fam_test' }
    } })

    const memberSync = await fetch('/v1/sync?after=0', {
      headers: { Authorization: `Bearer ${member}`,
        'X-Solemi-Family-Token': joinedBody.data.connection.deviceToken }
    })
    expect(memberSync.status).toBe(200)

    const signedOutSync = await fetch('/v1/sync?after=0', {
      headers: { Authorization: `Bearer ${joinedBody.data.connection.deviceToken}` }
    })
    expect(signedOutSync.status).toBe(401)
    expect(await signedOutSync.json()).toMatchObject({ error: { code: 'SESSION_INVALID' } })

    const mismatchedAccount = await fetch('/v1/sync?after=0', {
      headers: { Authorization: `Bearer ${owner}`,
        'X-Solemi-Family-Token': joinedBody.data.connection.deviceToken }
    })
    expect(mismatchedAccount.status).toBe(403)
    expect(await mismatchedAccount.json()).toMatchObject({ error: { code: 'FAMILY_MEMBERSHIP_REQUIRED' } })

    const ownerAccess = await fetch('/v1/auth/access', {
      headers: { Authorization: `Bearer ${owner}` }
    })
    expect(await ownerAccess.json()).toMatchObject({ data: {
      features: ['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT'],
      accountFeatures: ['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT'],
      familyFeatures: ['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT'],
      familySync: { status: 'ACTIVE', canSync: true }
    } })

    expect((await setPlan(member, 'familyPlus')).status).toBe(200)
    expect((await setPlan(owner, 'free')).status).toBe(200)
    const inheritedFromMember = await fetch('/v1/auth/access', {
      headers: { Authorization: `Bearer ${owner}` }
    })
    expect(await inheritedFromMember.json()).toMatchObject({ data: {
      features: ['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT'],
      accountFeatures: [],
      familyFeatures: ['FAMILY_PLUS_INSIGHTS', 'FAMILY_SYNC', 'PDF_EXPORT']
    } })

    const downgradedMember = await setPlan(member, 'family')
    expect(await downgradedMember.json()).toMatchObject({ data: {
      features: ['FAMILY_SYNC', 'PDF_EXPORT'],
      accountFeatures: ['FAMILY_SYNC', 'PDF_EXPORT'],
      familyFeatures: ['FAMILY_SYNC', 'PDF_EXPORT'],
      familySync: { status: 'ACTIVE', canSync: true }
    } })

    expect((await setPlan(member, 'free')).status).toBe(200)
    const paused = await fetch('/v1/sync?after=0', {
      headers: { Authorization: `Bearer ${member}`,
        'X-Solemi-Family-Token': joinedBody.data.connection.deviceToken }
    })
    expect(paused.status).toBe(403)
    expect(await paused.json()).toMatchObject({ error: { code: 'FAMILY_SYNC_PAUSED' } })
  })

  it('does not expose the manual plan endpoint outside the staging test mode', async () => {
    const access = await accountAccess('acc_owner', 'adev_owner', 'no_test_mode')
    const response = await fetch('/v1/auth/test/plan', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'familyPlus' })
    })
    expect(response.status).toBe(404)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM subscriptions').get()).toEqual({ count: 0 })
  })

  it('lets only the active family admin clear the shared diary and keeps retries idempotent', async () => {
    const adminFamilyToken = 'ss_dv_admin_clear'
    await seedLegacyFamily(adminFamilyToken)
    const adminAccess = await accountAccess('acc_admin', 'adev_admin', 'admin_clear')
    const claim = await fetch('/v1/auth/family/claim', {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${adminAccess}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyDeviceToken: adminFamilyToken })
    })
    expect(claim.status).toBe(200)

    const memberFamilyToken = 'ss_dv_member_clear'
    const memberAccess = await accountAccess('acc_member', 'adev_member', 'member_clear')
    const at = '2026-09-20T10:00:00.000Z'
    sqlite.prepare(`INSERT INTO devices (id, family_id, token_hash, name, created_at, last_seen_at, revoked_at)
      VALUES ('dev_member', 'fam_test', ?, 'Chrome', ?, ?, NULL)`)
      .run(await sha256(`${env.TOKEN_PEPPER}:${memberFamilyToken}`), at, at)
    sqlite.prepare(`INSERT INTO legacy_family_memberships
      (id, family_id, account_id, role, status, joined_at, ended_at)
      VALUES ('mem_member', 'fam_test', 'acc_member', 'MEMBER', 'ACTIVE', ?, NULL)`).run(Date.parse(at))
    sqlite.prepare(`INSERT INTO account_family_devices
      (account_device_id, account_id, family_id, legacy_device_id, created_at, updated_at)
      VALUES ('adev_member', 'acc_member', 'fam_test', 'dev_member', ?, ?)`).run(Date.parse(at), Date.parse(at))
    sqlite.prepare(`INSERT INTO children
      (id, family_id, name, birth_date, created_at, updated_at, deleted_at, revision)
      VALUES ('child_clear', 'fam_test', 'Baba', NULL, ?, ?, NULL, 0)`).run(at, at)
    sqlite.prepare(`INSERT INTO sleep_sessions
      (id, family_id, child_id, start_time, end_time, note, day_night_override,
       created_at, updated_at, deleted_at, revision)
      VALUES ('sleep_clear', 'fam_test', 'child_clear', ?, ?, '', NULL, ?, ?, NULL, 0)`)
      .run(at, '2026-09-20T11:00:00.000Z', at, at)

    const clear = (access: string, familyToken: string, operationId: string, replacementChildId: string) =>
      fetch('/v1/auth/family/data/clear', {
        method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${access}`,
          'X-Solemi-Family-Token': familyToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId, expectedFamilyName: 'Teszt család', replacementChildId })
      })

    const denied = await clear(memberAccess, memberFamilyToken, 'clear_member', 'child_member_blank')
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ error: { code: 'FAMILY_ADMIN_REQUIRED' } })
    expect(sqlite.prepare(`SELECT deleted_at FROM sleep_sessions WHERE id = 'sleep_clear'`).get())
      .toEqual({ deleted_at: null })

    env.ENTITLEMENT_ENFORCEMENT = 'true'
    const completed = await clear(adminAccess, adminFamilyToken, 'clear_admin', 'child_after_clear')
    expect(completed.status).toBe(200)
    expect(await completed.json()).toMatchObject({ data: { revision: 1, child: { id: 'child_after_clear', name: '' } } })
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM sleep_sessions WHERE deleted_at IS NULL`).get())
      .toEqual({ count: 0 })
    expect(sqlite.prepare(`SELECT id FROM children WHERE deleted_at IS NULL`).all())
      .toEqual([{ id: 'child_after_clear' }])

    const retry = await clear(adminAccess, adminFamilyToken, 'clear_admin', 'child_after_clear')
    expect(retry.status).toBe(200)
    expect((await retry.json() as { data: { revision: number } }).data.revision).toBe(1)
  })

  it('rejects a stale edit of the same sleep but accepts an unrelated sleep edit', async () => {
    env.RECONCILIATION_CONFLICTS = 'true'
    const firstToken = 'ss_dv_conflict_first'
    const secondToken = 'ss_dv_conflict_second'
    await seedLegacyFamily(firstToken)
    const at = '2026-09-14T18:00:00.000Z'
    sqlite.prepare(`INSERT INTO devices
      (id, family_id, token_hash, name, created_at, last_seen_at, revoked_at)
      VALUES ('dev_second', 'fam_test', ?, 'Chrome', ?, ?, NULL)`)
      .run(await sha256(`${env.TOKEN_PEPPER}:${secondToken}`), at, at)
    sqlite.prepare(`INSERT INTO children
      (id, family_id, name, birth_date, created_at, updated_at, deleted_at, revision)
      VALUES ('child_test', 'fam_test', 'Baba', NULL, ?, ?, NULL, 1)`).run(at, at)
    sqlite.prepare(`INSERT INTO sleep_sessions
      (id, family_id, child_id, start_time, end_time, note, day_night_override,
       created_at, updated_at, deleted_at, revision)
      VALUES ('sleep_shared', 'fam_test', 'child_test', ?, ?, '', NULL, ?, ?, NULL, 2),
             ('sleep_other', 'fam_test', 'child_test', ?, ?, '', NULL, ?, ?, NULL, 2)`)
      .run('2026-09-14T10:00:00.000Z', '2026-09-14T11:00:00.000Z', at, at,
        '2026-09-14T12:00:00.000Z', '2026-09-14T13:00:00.000Z', at, at)
    sqlite.prepare(`UPDATE families SET revision = 2 WHERE id = 'fam_test'`).run()

    const patch = (token: string, id: string, operationId: string, note: string) => fetch(`/v1/sessions/${id}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId, baseRevision: 2, patch: { note } })
    })
    const first = await patch(firstToken, 'sleep_shared', 'op_first', 'Első telefon')
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ data: { session: { note: 'Első telefon', revision: 3 } } })

    const conflict = await patch(secondToken, 'sleep_shared', 'op_second', 'Második telefon')
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({
      error: { code: 'SYNC_CONFLICT' },
      data: { conflict: { entityType: 'SESSION', entityId: 'sleep_shared',
        baseRevision: 2, serverRevision: 3, serverValue: { note: 'Első telefon' } } }
    })
    expect(sqlite.prepare(`SELECT note FROM sleep_sessions WHERE id = 'sleep_shared'`).get())
      .toEqual({ note: 'Első telefon' })

    const unrelated = await patch(secondToken, 'sleep_other', 'op_other', 'Másik alvás')
    expect(unrelated.status).toBe(200)
    expect(await unrelated.json()).toMatchObject({ data: { session: { note: 'Másik alvás' } } })
  })
})
