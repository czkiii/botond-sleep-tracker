import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from 'jose'
import { AppleSignInLifecycle, verifyAppleNotice } from '../src/appleSignInLifecycle'
import { AppleSignInError, AppleSignInProvider, appleSignInConfig, type AppleSignInEnv } from '../src/appleSignInProvider'
import { AuthService } from '../src/authService'
import { AccountDeletionService, RECOVERY_MS } from '../src/accountDeletion'
import { deletionJournal } from '../src/deletionJournal'
import { trialIdentity } from '../src/trialIdentity'
import { TrialService } from '../src/trialService'
import { sqliteBinding } from './sqliteD1'
import { trialRegistryFixture } from './trialRegistryFixture'
import type { AppleIdentity } from '../src/appleAuth'
const now = 1_800_000_000_000
const identity: AppleIdentity = { issuer: 'https://appleid.apple.com', subject: 'apple-sub', email: 'relay@example.test', name: null, picture: null, authenticatedAt: now }
let db: DatabaseSync, journal: DatabaseSync, env: AppleSignInEnv, lifecycle: AppleSignInLifecycle, service: AuthService, deletion: AccountDeletionService, trial: TrialService
let provider: { exchange: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> }
beforeEach(async () => {
  db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON')
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(x => x.endsWith('.sql') && x >= '003').sort())
    db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'))
  const fixture = await trialRegistryFixture(); journal = fixture.db
  env = { NATIVE_APPLE_CLIENT_ID: 'app.solemi.sleep', APPLE_SIGN_IN_TEAM_ID: 'TEAM123456', APPLE_SIGN_IN_KEY_ID: 'KEY1234567',
    APPLE_SIGN_IN_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----', APPLE_SIGN_IN_TOKEN_KEY: 'a'.repeat(64), APPLE_SIGN_IN_LIFECYCLE_ENABLED: 'true' }
  provider = { exchange: vi.fn(async () => ({ token: 'private-apple-refresh', identity })), revoke: vi.fn(async () => {}) }
  lifecycle = new AppleSignInLifecycle(sqliteBinding(db), env, provider)
  const full = { ...fixture.env, DB: sqliteBinding(db) }, guard = trialIdentity(full), log = deletionJournal(full)
  deletion = new AccountDeletionService(full.DB, log, guard); trial = new TrialService(full.DB, guard)
  service = new AuthService(full.DB, { clientId: 'web', secret: 'long-test-secret-at-least-32-characters', appleClientId: env.NATIVE_APPLE_CLIENT_ID,
    appleLifecycle: lifecycle, deletionJournal: log, trialIdentity: guard }, undefined, async () => identity)
})
afterEach(() => { db.close(); journal.close(); vi.restoreAllMocks() })
async function login(at = now, installation = 'a') {
  const proof = { ...identity, authenticatedAt: at }
  provider.exchange.mockResolvedValue({ token: 'private-apple-refresh', identity: proof })
  const auth = new AuthService(sqliteBinding(db), { clientId: 'web', secret: 'long-test-secret-at-least-32-characters', appleClientId: env.NATIVE_APPLE_CLIENT_ID,
    appleLifecycle: lifecycle }, undefined, async () => proof)
  return auth.loginNative({ provider: 'APPLE', platform: 'IOS', credential: 'apple-jwt', authorizationCode: 'single-use-code',
    nonce: await auth.challenge(at, 'native:APPLE:IOS'), installationSecret: installation.repeat(64), deviceName: 'Phone' }, at)
}
const credentials = () => db.prepare('SELECT * FROM apple_signin_credentials').all() as any[]
describe('Apple sign-in lifecycle', () => {
  it('stores encrypted refresh credentials before a session and excludes them from the account export', async () => {
    const session = await login()
    expect(credentials()[0]).toMatchObject({ account_id: session.account.id, state: 'ACTIVE' })
    expect(JSON.stringify(credentials())).not.toContain('private-apple-refresh')
    expect(JSON.stringify(await deletion.exportAccount(session.account.id, now))).not.toContain('ciphertext')
    expect(db.prepare('SELECT apple_auth_time FROM account_sessions').get()).toEqual({ apple_auth_time: now })
  })
  it('finishes Solemi erasure despite Apple outage, retries durably, and then removes the encrypted key', async () => {
    const session = await login()
    await trial.activate(session.account.id, 'FAMILY', 'trial-once', now)
    provider.revoke.mockRejectedValueOnce(new Error('secret-provider-response'))
    await deletion.request(session.account.id, 'IMMEDIATE', await deletion.preview(session.account.id), '', now + 1)
    expect(db.prepare('SELECT status,email FROM accounts').get()).toEqual({ status: 'DELETED', email: null })
    expect(credentials()[0].state).toBe('REVOKE')
    await expect(service.authenticate(session.accessToken, now + 2)).rejects.toMatchObject({ code: 'SESSION_INVALID' })
    expect(await lifecycle.maintain(now + 2)).toEqual({ processed: 0, failed: 1, pending: 1 })
    expect(credentials()[0].last_error).toBe('APPLE_SIGN_IN_RETRY')
    expect(JSON.stringify(credentials())).not.toContain('secret-provider-response')
    expect(await lifecycle.maintain(now + 3)).toEqual({ processed: 0, failed: 0, pending: 1 })
    expect(await lifecycle.maintain(now + 60_002)).toEqual({ processed: 1, failed: 0, pending: 0 })
    expect(provider.revoke).toHaveBeenLastCalledWith('private-apple-refresh')
    expect(credentials()).toEqual([])
    expect(journal.prepare('SELECT COUNT(*) AS n FROM used_trial_identities').get()).toEqual({ n: 1 })
  })
  it('does not revoke the provider during the recovery window, but queues final erasure', async () => {
    const session = await login()
    const result = await deletion.request(session.account.id, 'RECOVERY', await deletion.preview(session.account.id), '', now + 1)
    expect(credentials()[0].state).toBe('ACTIVE')
    await lifecycle.maintain(now + 2); expect(provider.revoke).not.toHaveBeenCalled()
    await deletion.finalize(result.requestId, now + RECOVERY_MS + 1)
    expect(credentials()[0].state).toBe('REVOKE')
  })
  it('cleans up an abandoned authorization exchange without ever issuing a session', async () => {
    await lifecycle.stage('code', 'nonce', identity, now)
    expect(await lifecycle.maintain(now + 599_999)).toMatchObject({ processed: 0 })
    expect(await lifecycle.maintain(now + 600_000)).toMatchObject({ processed: 1 })
    expect(db.prepare('SELECT count(*) AS n FROM account_sessions').get()).toEqual({ n: 0 })
  })
  it('does not send a token whose authenticated ciphertext was tampered with', async () => {
    await lifecycle.stage('code', 'nonce', identity, now)
    db.exec("UPDATE apple_signin_credentials SET issued_at=issued_at+1")
    expect(await lifecycle.maintain(now + 600_000)).toMatchObject({ failed: 1, pending: 1 })
    expect(provider.revoke).not.toHaveBeenCalled()
    expect(credentials()[0].last_error).toBe('APPLE_CREDENTIAL_UNAVAILABLE')
  })
  it('drops an abandoned duplicate token without revoking the attached Apple grant', async () => {
    const session = await login()
    await lifecycle.stage('code', 'nonce', identity, now)
    expect(await lifecycle.maintain(now + 600_000)).toEqual({ processed: 1, failed: 0, pending: 0 })
    expect(provider.revoke).not.toHaveBeenCalled()
    await expect(service.refresh(session.refresh, now + 600_001)).resolves.toHaveProperty('accessToken')
    expect(credentials()).toHaveLength(1)
  })
  it('blocks re-registration while erasure revocation is pending, then requires fresh authorization', async () => {
    const session = await login()
    await deletion.request(session.account.id, 'IMMEDIATE', await deletion.preview(session.account.id), '', now + 1)
    await expect(login(now + 1000)).rejects.toMatchObject({ code: 'APPLE_AUTHORIZATION_REVOKED' })
    expect(await lifecycle.maintain(now + 2000)).toMatchObject({ processed: 1, pending: 0 })
    await expect(login(now + 3000)).resolves.toHaveProperty('accessToken')
  })
  it('confirms each distinct token and prevents concurrent scheduler calls from claiming the same work', async () => {
    const session = await login()
    provider.exchange.mockResolvedValue({ token: 'second-private-refresh', identity })
    const second = await lifecycle.stage('second-code', 'nonce', identity, now)
    await lifecycle.bind(second, session.account.id, now)
    await deletion.request(session.account.id, 'IMMEDIATE', await deletion.preview(session.account.id), '', now + 1)
    let finish!: () => void
    provider.revoke.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const first = lifecycle.maintain(now + 2)
    await vi.waitFor(() => expect(provider.revoke).toHaveBeenCalledTimes(1))
    // The second token can be processed independently; the leased token cannot.
    expect(await lifecycle.maintain(now + 2)).toMatchObject({ processed: 1, pending: 1 })
    expect(await lifecycle.maintain(now + 2)).toMatchObject({ processed: 0, pending: 1 })
    finish(); expect(await first).toMatchObject({ processed: 1, pending: 0 })
    expect(new Set(provider.revoke.mock.calls.map(x => x[0])).size).toBe(2)
  })
  it('rolls back receipt and access changes together if notification persistence fails', async () => {
    const session = await login()
    db.exec("CREATE TRIGGER fail_apple_notice BEFORE DELETE ON apple_signin_credentials BEGIN SELECT RAISE(ABORT,'simulated'); END")
    const notice = { id: 'retry', subject: identity.subject, type: 'consent-revoked' as const, at: now + 1000 }
    await expect(lifecycle.notification(notice, now + 2000)).rejects.toThrow()
    expect(db.prepare('SELECT COUNT(*) AS n FROM apple_signin_notices').get()).toEqual({ n: 0 })
    await expect(service.authenticate(session.accessToken, now + 2001)).resolves.toHaveProperty('account')
    db.exec('DROP TRIGGER fail_apple_notice')
    await lifecycle.notification(notice, now + 3000)
    await expect(service.authenticate(session.accessToken, now + 3001)).rejects.toMatchObject({ code: 'SESSION_INVALID' })
  })
  it('revokes Apple-backed sessions on consent change without deleting diary or subscription data', async () => {
    const first = await login()
    await lifecycle.notification({ id: 'event', subject: identity.subject, type: 'consent-revoked', at: now + 1000 }, now + 2000)
    await expect(service.authenticate(first.accessToken, now + 2001)).rejects.toMatchObject({ code: 'SESSION_INVALID' })
    await expect(service.refresh(first.refresh, now + 2001)).rejects.toMatchObject({ code: 'SESSION_INVALID' })
    expect(db.prepare('SELECT status FROM accounts').get()).toEqual({ status: 'ACTIVE' })
    expect(db.prepare('SELECT count(*) AS n FROM account_deletions').get()).toEqual({ n: 0 })
    expect(credentials()).toEqual([])
  })
  it('does not let delayed or duplicate notices revoke a newer authentication', async () => {
    const first = await login()
    const later = await login(now + 10_000)
    const event = { id: 'delayed', subject: identity.subject, type: 'consent-revoked' as const, at: now + 1000 }
    await lifecycle.notification(event, now + 20_000); await lifecycle.notification(event, now + 21_000)
    await expect(service.authenticate(later.accessToken, now + 21_001)).resolves.toMatchObject({ account: { id: first.account.id } })
    expect(db.prepare('SELECT count(*) AS n FROM apple_signin_notices').get()).toEqual({ n: 1 })
    expect(credentials().map(x => x.issued_at)).toEqual([now + 10_000])
  })
  it('blocks proof issued before a revocation, including a notification arriving before first sign-in', async () => {
    await lifecycle.notification({ id: 'early', subject: identity.subject, type: 'consent-revoked', at: now }, now)
    await expect(login()).rejects.toMatchObject({ code: 'APPLE_AUTHORIZATION_REVOKED' })
    expect(db.prepare('SELECT count(*) AS n FROM account_sessions').get()).toEqual({ n: 0 })
    await expect(login(now + 2000)).resolves.toHaveProperty('accessToken')
  })
  it('treats an Apple account deletion as permanent credential revocation, not Solemi diary deletion', async () => {
    const session = await login()
    await lifecycle.notification({ id: 'delete', subject: identity.subject, type: 'account-deleted', at: now + 1000 }, now + 2000)
    await expect(service.authenticate(session.accessToken, now + 3000)).rejects.toMatchObject({ code: 'SESSION_INVALID' })
    await expect(login(now + 5000)).rejects.toMatchObject({ code: 'APPLE_AUTHORIZATION_REVOKED' })
    expect(db.prepare('SELECT status FROM accounts').get()).toEqual({ status: 'ACTIVE' })
  })
  it('records email preferences in order without changing authentication', async () => {
    const session = await login()
    await lifecycle.notification({ id: 'off', subject: identity.subject, type: 'email-disabled', at: now + 2000 }, now + 3000)
    await lifecycle.notification({ id: 'old-on', subject: identity.subject, type: 'email-enabled', at: now + 1000 }, now + 4000)
    expect(db.prepare('SELECT email_enabled FROM apple_signin_state').get()).toEqual({ email_enabled: 0 })
    await expect(service.authenticate(session.accessToken, now + 4001)).resolves.toHaveProperty('account')
  })
  it('does not affect an unrelated Google account', async () => {
    await login()
    const google = new AuthService(sqliteBinding(db), { clientId: 'web', secret: 'long-test-secret-at-least-32-characters' }, async () => ({
      issuer: 'https://accounts.google.com', subject: identity.subject, email: identity.email!, name: null, picture: null }))
    const session = await google.login({ credential: 'google', nonce: await google.challenge(now), installationSecret: 'b'.repeat(64), deviceName: 'Other' }, now)
    await lifecycle.notification({ id: 'apple-only', subject: identity.subject, type: 'account-deleted', at: now + 1000 }, now + 2000)
    await expect(google.authenticate(session.accessToken, now + 3000)).resolves.toHaveProperty('account')
  })
})

describe('Apple signed notification verification', () => {
  async function signed(claims: Record<string, unknown> = {}) {
    const key = await generateKeyPair('RS256')
    return { key: async () => key.publicKey, token: await new SignJWT({ iss: 'https://appleid.apple.com', aud: 'app.solemi.sleep', iat: now / 1000, jti: 'notice',
      events: { type: 'consent-revoked', sub: 'apple-sub', event_time: now / 1000 }, ...claims }).setProtectedHeader({ alg: 'RS256' }).sign(key.privateKey) }
  }
  it('accepts the documented no-exp payload and a JSON string events envelope', async () => {
    for (const events of [{ type: 'account-deleted', sub: 'apple-sub', event_time: now / 1000 }, JSON.stringify({ type: 'consent-revoked', sub: 'apple-sub', event_time: now / 1000 })]) {
      const proof = await signed({ events })
      expect(await verifyAppleNotice(proof.token, 'app.solemi.sleep', now + 10 * 86_400_000, proof.key)).toMatchObject({ subject: 'apple-sub', at: now })
    }
  })
  it.each([{ iss: 'https://evil.test' }, { aud: 'another.app' }, { iat: now / 1000 + 61 }, { jti: '' }, { events: '{' },
    { events: { type: 'consent-revoked', sub: '', event_time: now / 1000 } }, { events: { type: 'consent-revoked', sub: 'a', event_time: now / 1000 + 61 } }])('rejects invalid notification %j', async claims => {
    const proof = await signed(claims)
    await expect(verifyAppleNotice(proof.token, 'app.solemi.sleep', now, proof.key)).rejects.toMatchObject({ code: 'APPLE_NOTIFICATION_INVALID' })
  })
  it('rejects a valid-looking token signed by a different key', async () => {
    const proof = await signed(), other = await generateKeyPair('RS256')
    await expect(verifyAppleNotice(proof.token, 'app.solemi.sleep', now, async () => other.publicKey)).rejects.toMatchObject({ code: 'APPLE_NOTIFICATION_INVALID' })
  })
})

describe('Apple token endpoint adapter', () => {
  it('signs a short client secret and exchanges the one-use code only on the server', async () => {
    const key = await generateKeyPair('ES256', { extractable: true })
    env.APPLE_SIGN_IN_PRIVATE_KEY = await exportPKCS8(key.privateKey)
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const form = new URLSearchParams(String(init!.body)), secret = form.get('client_secret')!
      const { payload } = await jwtVerify(secret, key.publicKey, { currentDate: new Date(now), issuer: env.APPLE_SIGN_IN_TEAM_ID, audience: 'https://appleid.apple.com' })
      expect(payload.sub).toBe(env.NATIVE_APPLE_CLIENT_ID); expect(payload.exp! - payload.iat!).toBe(300)
      expect(form.get('code')).toBe('code'); expect(init?.redirect).toBe('error')
      return Response.json({ refresh_token: 'private', id_token: 'signed-returned-id' })
    })
    const adapter = new AppleSignInProvider(appleSignInConfig(env), request, async () => identity)
    expect(await adapter.exchange('code', 'nonce', identity, now)).toMatchObject({ token: 'private' })
    expect(request.mock.calls[0][0]).toBe('https://appleid.apple.com/auth/token')
  })
  it('accepts only a confirmed 200 revocation; a provider error remains retryable without leaking its body', async () => {
    env.APPLE_SIGN_IN_PRIVATE_KEY = await exportPKCS8((await generateKeyPair('ES256', { extractable: true })).privateKey)
    const request = vi.fn(async () => new Response(null, { status: 200 }))
    const adapter = new AppleSignInProvider(appleSignInConfig(env), request)
    await adapter.revoke('private')
    request.mockResolvedValueOnce(new Response('sensitive-provider-body', { status: 400 }))
    await expect(adapter.revoke('private')).rejects.toMatchObject({ code: 'APPLE_SIGN_IN_PROVIDER_UNAVAILABLE' })
  })
  it('rejects a code exchange for a different Apple user', async () => {
    env.APPLE_SIGN_IN_PRIVATE_KEY = await exportPKCS8((await generateKeyPair('ES256', { extractable: true })).privateKey)
    const adapter = new AppleSignInProvider(appleSignInConfig(env), async () => Response.json({ refresh_token: 'private', id_token: 'different' }), async () => ({ ...identity, subject: 'other' }))
    await expect(adapter.exchange('code', 'nonce', identity, now)).rejects.toBeInstanceOf(AppleSignInError)
  })
})
