import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { ACCESS_SECONDS, AuthService, SESSION_MS, secretHash } from '../src/authService'
import type { GoogleIdentity } from '../src/googleAuth'
import { sqliteBinding } from './sqliteD1'

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const migrations = ['003_accounts_and_sessions.sql', '004_auth_challenges_and_refresh_history.sql']
  .map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')).join('\n')
const now = 1_800_000_000_000
const config = { clientId: 'solemi.apps.googleusercontent.com', secret: 'test-secret-with-at-least-32-characters' }
const identity: GoogleIdentity = {
  issuer: 'https://accounts.google.com', subject: 'google-subject', email: 'parent@example.test',
  name: 'Parent', picture: 'https://example.test/avatar.png'
}
let sqlite: DatabaseSync
let verify: ReturnType<typeof vi.fn>
let service: AuthService

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(schema)
  sqlite.exec(migrations)
  verify = vi.fn(async () => identity)
  service = new AuthService(sqliteBinding(sqlite), config, verify)
})
afterEach(() => sqlite.close())

async function login(installation = 'a'.repeat(64), overrides: { replaceDeviceId?: string } = {}) {
  const nonce = await service.challenge(now)
  return service.login({ credential: 'signed-google-token', nonce, installationSecret: installation,
    deviceName: 'Phone', ...overrides }, now)
}

describe('account authentication service', () => {
  it('consumes a challenge once and stores only keyed hashes of browser secrets', async () => {
    const nonce = await service.challenge(now)
    const input = { credential: 'signed-google-token', nonce, installationSecret: 'a'.repeat(64), deviceName: 'Phone' }
    const result = await service.login(input, now)
    expect(result.account).toMatchObject({ email: identity.email, name: identity.name })
    expect(result.accessExpiresAt).toBe(now + ACCESS_SECONDS * 1000)
    expect(result.expiresAt).toBe(now + SESSION_MS)
    expect(verify).toHaveBeenCalledWith(input.credential, config.clientId, nonce, { now })
    expect(sqlite.prepare('SELECT count(*) AS n FROM auth_challenges').get()).toEqual({ n: 0 })
    expect(sqlite.prepare('SELECT refresh_hash, installation_hash FROM account_sessions JOIN account_devices USING (account_id)').get())
      .not.toMatchObject({ refresh_hash: result.refresh, installation_hash: input.installationSecret })
    await expect(service.login(input, now)).rejects.toMatchObject({ code: 'LOGIN_CHALLENGE_INVALID' })
  })

  it('resolves the same Google subject to one account and one browser device', async () => {
    const first = await login()
    const second = await login()
    expect(second.account.id).toBe(first.account.id)
    expect(second.deviceId).toBe(first.deviceId)
    expect(sqlite.prepare('SELECT count(*) AS n FROM accounts').get()).toEqual({ n: 1 })
    expect(sqlite.prepare('SELECT count(*) AS n FROM account_devices').get()).toEqual({ n: 1 })
    expect(sqlite.prepare('SELECT count(*) AS n FROM account_sessions WHERE revoked_at IS NULL').get()).toEqual({ n: 1 })
  })

  it('returns safe device summaries when a third browser reaches the limit', async () => {
    await login('a'.repeat(64))
    await login('b'.repeat(64))
    await expect(login('c'.repeat(64))).rejects.toMatchObject({
      code: 'DEVICE_LIMIT_REACHED', status: 409,
      data: { devices: expect.arrayContaining([expect.objectContaining({ name: 'Phone', platform: 'WEB' })]) }
    })
    expect(sqlite.prepare('SELECT count(*) AS n FROM account_devices WHERE revoked_at IS NULL').get()).toEqual({ n: 2 })
  })

  it('atomically replaces a selected device after fresh Google proof', async () => {
    const first = await login('a'.repeat(64))
    await login('b'.repeat(64))
    const third = await login('c'.repeat(64), { replaceDeviceId: first.deviceId })
    expect(third.deviceId).not.toBe(first.deviceId)
    expect(sqlite.prepare('SELECT revoke_reason FROM account_devices WHERE id = ?').get(first.deviceId))
      .toEqual({ revoke_reason: 'USER_REPLACED' })
    expect(sqlite.prepare('SELECT count(*) AS n FROM account_devices WHERE revoked_at IS NULL').get()).toEqual({ n: 2 })
  })

  it('rotates refresh tokens and revokes the browser on reuse', async () => {
    const loggedIn = await login()
    const rotated = await service.refresh(loggedIn.refresh, now + 1)
    expect(rotated.refresh).not.toBe(loggedIn.refresh)
    await expect(service.refresh(loggedIn.refresh, now + 2)).rejects.toMatchObject({ code: 'REFRESH_REUSED' })
    await expect(service.refresh(rotated.refresh, now + 3)).rejects.toMatchObject({ code: 'SESSION_INVALID' })
    await expect(service.authenticate(rotated.accessToken, now + 3)).rejects.toMatchObject({ code: 'SESSION_INVALID' })
  })

  it('rejects expired access tokens, unknown refresh tokens and signed-out sessions', async () => {
    const loggedIn = await login()
    await expect(service.authenticate(loggedIn.accessToken, now + ACCESS_SECONDS * 1000)).rejects.toMatchObject({ code: 'SESSION_INVALID' })
    await expect(service.refresh('f'.repeat(64), now)).rejects.toMatchObject({ code: 'SESSION_INVALID' })
    await service.logout(loggedIn.refresh, now + 1)
    await expect(service.refresh(loggedIn.refresh, now + 2)).rejects.toMatchObject({ code: 'SESSION_INVALID' })
  })

  it('binds installation hashes to an account and the server secret', async () => {
    const loggedIn = await login()
    const row = sqlite.prepare('SELECT installation_hash FROM account_devices WHERE id = ?').get(loggedIn.deviceId) as { installation_hash: string }
    expect(row.installation_hash).toBe(await secretHash(`installation:${loggedIn.account.id}:${'a'.repeat(64)}`, config.secret))
  })
})
