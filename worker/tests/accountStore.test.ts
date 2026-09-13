import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { AccountStore } from '../src/accountStore'

// Exercise production SQL and real constraints. Only D1's asynchronous binding
// shape and batch transaction are adapted; query results are never mocked.
function sqliteBinding(sqlite: DatabaseSync): D1Database {
  class Statement {
    private values: SQLInputValue[] = []
    constructor(private sql: string) {}
    bind(...values: SQLInputValue[]) { this.values = values; return this }
    async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.values) } }
    async run() {
      const result = sqlite.prepare(this.sql).run(...this.values)
      return { success: true, meta: { changes: Number(result.changes) } }
    }
  }
  return {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    }
  } as unknown as D1Database
}

const migration = readFileSync(new URL('../migrations/003_accounts_and_sessions.sql', import.meta.url), 'utf8')
const legacySchema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const now = 1_800_000_000_000
let sqlite: DatabaseSync
let store: AccountStore

function addAccount(id = 'acc_a', subject = id, email = 'shared@example.test') {
  return store.createGoogleAccount({ accountId: id, identityId: `identity_${id}`,
    issuer: 'https://accounts.google.com', subject, email, displayName: null,
    avatarUrl: null, locale: 'hu', now })
}
function device(id: string) {
  return { id, installationHash: `installation_hash_${id}`, credentialHash: `credential_hash_${id}`,
    name: id, platform: 'WEB' as const }
}
function session(id: string, accountId = 'acc_a', deviceId = 'dev_a') {
  return { id, accountId, deviceId, refreshHash: `refresh_hash_${id}`, now, expiresAt: now + 60_000 }
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(legacySchema)
  sqlite.exec(migration)
  store = new AccountStore(sqliteBinding(sqlite))
})
afterEach(() => sqlite.close())

describe('additive account migration', () => {
  it('preserves every legacy row and schema object, including revisions and tombstones', () => {
    using legacy = new DatabaseSync(':memory:')
    legacy.exec(legacySchema)
    legacy.exec(`
      INSERT INTO families VALUES ('fam_old', 'Family', 7, '2026-09-13');
      INSERT INTO devices VALUES ('dev_old', 'fam_old', 'old_hash', 'Phone', '2026-09-13', '2026-09-13', NULL);
      INSERT INTO invite_codes VALUES ('invite_hash', 'fam_old', 'dev_old', '2026-09-13', '2026-09-14', NULL);
      INSERT INTO children VALUES ('child_old', 'fam_old', 'Child', NULL, '2026-09-13', '2026-09-13', NULL, 3);
      INSERT INTO sleep_sessions VALUES ('sleep_old', 'fam_old', 'child_old', '2026-09-13T10:00:00Z',
        '2026-09-13T11:00:00Z', 'note', 'day', '2026-09-13', '2026-09-13', '2026-09-13', 7);
      INSERT INTO operations VALUES ('op_old', 'fam_old', 'dev_old', 'DELETE', '2026-09-13');
    `)
    const tables = ['families', 'devices', 'invite_codes', 'children', 'sleep_sessions', 'operations']
    const before = tables.map((table) => legacy.prepare(`SELECT * FROM ${table}`).all())
    const objects = legacy.prepare("SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all()
    legacy.exec(migration)
    expect(tables.map((table) => legacy.prepare(`SELECT * FROM ${table}`).all())).toEqual(before)
    for (const object of objects) {
      expect(legacy.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(object.name)).toEqual({ sql: object.sql })
    }
    expect(legacy.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(legacy.prepare('SELECT count(*) AS n FROM accounts').get()).toEqual({ n: 0 })
  })

  it('rejects a session belonging to a different device owner at the SQL boundary', async () => {
    await addAccount()
    await addAccount('acc_b')
    await store.registerDevice('acc_a', device('dev_a'), now)
    expect(() => sqlite.prepare(`INSERT INTO account_sessions
      (id, account_id, device_id, refresh_hash, created_at, last_used_at, expires_at)
      VALUES ('ses_bad', 'acc_b', 'dev_a', 'bad_hash', ?, ?, ?)`)
      .run(now, now, now + 1)).toThrow(/FOREIGN KEY/)
  })

  it('enforces the device limit for reactivation and account reassignment', async () => {
    await addAccount()
    await addAccount('acc_b')
    await store.registerDevice('acc_a', device('dev_a'), now)
    await store.revokeDevice('acc_a', 'dev_a', now)
    await store.registerDevice('acc_a', device('dev_b'), now)
    await store.registerDevice('acc_a', device('dev_c'), now)
    await store.registerDevice('acc_b', device('dev_other'), now)
    expect(() => sqlite.exec("UPDATE account_devices SET revoked_at = NULL, revoke_reason = NULL WHERE id = 'dev_a'"))
      .toThrow(/ACCOUNT_DEVICE_LIMIT/)
    expect(() => sqlite.exec("UPDATE account_devices SET account_id = 'acc_a' WHERE id = 'dev_other'"))
      .toThrow(/ACCOUNT_DEVICE_LIMIT/)
  })

  it('rejects duplicate identity ownership and invalid lifecycle values', async () => {
    await addAccount()
    expect(() => sqlite.exec(`INSERT INTO account_identities VALUES
      ('identity_second', 'acc_a', 'GOOGLE', 'https://accounts.google.com', 'other-sub', NULL, 1, 1, 1)`)).toThrow(/UNIQUE/)
    expect(() => sqlite.exec("UPDATE accounts SET status = 'DELETED' WHERE id = 'acc_a'")).toThrow(/CHECK/)
    await store.registerDevice('acc_a', device('dev_a'), now)
    expect(() => sqlite.exec("UPDATE account_devices SET revoked_at = 1 WHERE id = 'dev_a'")).toThrow(/CHECK/)
    await expect(store.createSession({ ...session('ses_bad'), expiresAt: now })).rejects.toThrow(/CHECK/)
  })
})

describe('account persistence', () => {
  it('uses Google issuer and subject rather than email as the identity', async () => {
    await addAccount()
    await addAccount('acc_b') // Same email, different Google subject.
    sqlite.exec("UPDATE accounts SET email = 'changed@example.test' WHERE id = 'acc_a'")
    expect((await store.findGoogleAccount('https://accounts.google.com', 'acc_a'))?.id).toBe('acc_a')
    expect((await store.findGoogleAccount('https://accounts.google.com', 'acc_b'))?.id).toBe('acc_b')
    expect(await store.findGoogleAccount('https://wrong.example', 'acc_a')).toBeNull()
  })

  it('rolls back the whole account creation when the identity already exists', async () => {
    await addAccount()
    await expect(addAccount('acc_duplicate', 'acc_a')).rejects.toThrow(/UNIQUE/)
    expect(sqlite.prepare("SELECT id FROM accounts WHERE id = 'acc_duplicate'").get()).toBeUndefined()
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('rejects a third device without evicting either existing device', async () => {
    await addAccount()
    await store.registerDevice('acc_a', device('dev_a'), now)
    await store.registerDevice('acc_a', device('dev_b'), now)
    await expect(store.registerDevice('acc_a', device('dev_c'), now)).rejects.toMatchObject({ code: 'ACCOUNT_DEVICE_LIMIT' })
    const active = await store.listActiveDevices('acc_a')
    expect(active.map((d) => d.id)).toEqual(['dev_a', 'dev_b'])
    expect(active[0]).not.toHaveProperty('credential_hash')
    await store.revokeDevice('acc_a', 'dev_a', now + 1)
    await store.registerDevice('acc_a', device('dev_c'), now + 2)
    expect((await store.listActiveDevices('acc_a')).map((d) => d.id)).toEqual(['dev_c', 'dev_b'])
  })

  it('rejects device registration for missing or inactive accounts', async () => {
    await expect(store.registerDevice('missing', device('dev_a'), now)).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
    await addAccount()
    sqlite.exec("UPDATE accounts SET status = 'DELETION_PENDING' WHERE id = 'acc_a'")
    await expect(store.registerDevice('acc_a', device('dev_a'), now)).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
  })

  it('rejects session creation for a missing, foreign or revoked device', async () => {
    await addAccount()
    await addAccount('acc_b')
    await store.registerDevice('acc_a', device('dev_a'), now)
    for (const input of [session('ses_missing', 'acc_a', 'missing'), session('ses_other', 'acc_b')]) {
      await expect(store.createSession(input)).rejects.toMatchObject({ code: 'DEVICE_UNAVAILABLE' })
    }
    await store.revokeDevice('acc_a', 'dev_a', now)
    await expect(store.createSession(session('ses_revoked'))).rejects.toMatchObject({ code: 'DEVICE_UNAVAILABLE' })
  })

  it('treats session expiry as an exclusive boundary and rejects a future session', async () => {
    await addAccount()
    await store.registerDevice('acc_a', device('dev_a'), now)
    await store.createSession(session('ses_a'))
    expect(await store.findActiveSession('refresh_hash_ses_a', now)).toMatchObject({ account_id: 'acc_a', device_id: 'dev_a' })
    expect(await store.findActiveSession('refresh_hash_ses_a', now - 1)).toBeNull()
    expect(await store.findActiveSession('refresh_hash_ses_a', now + 60_000)).toBeNull()
    expect(await store.findActiveSession('wrong_hash', now)).toBeNull()
  })

  it('revokes all sessions of the selected device without affecting another device', async () => {
    await addAccount()
    await store.registerDevice('acc_a', device('dev_a'), now)
    await store.registerDevice('acc_a', device('dev_b'), now)
    await store.createSession(session('ses_a'))
    await store.createSession(session('ses_a2'))
    await store.createSession(session('ses_b', 'acc_a', 'dev_b'))
    expect(await store.revokeDevice('other_account', 'dev_a', now)).toBe(false)
    expect(await store.findActiveSession('refresh_hash_ses_a', now)).not.toBeNull()
    expect(await store.revokeDevice('acc_a', 'dev_a', now)).toBe(true)
    expect(await store.findActiveSession('refresh_hash_ses_a', now)).toBeNull()
    expect(await store.findActiveSession('refresh_hash_ses_a2', now)).toBeNull()
    expect(await store.findActiveSession('refresh_hash_ses_b', now)).not.toBeNull()
    expect(await store.revokeDevice('acc_a', 'dev_a', now + 1)).toBe(false)
  })

  it('rolls back session revocation if device revocation fails', async () => {
    await addAccount()
    await store.registerDevice('acc_a', device('dev_a'), now)
    await store.createSession(session('ses_a'))
    sqlite.exec(`CREATE TRIGGER fail_revoke BEFORE UPDATE ON account_devices
      BEGIN SELECT RAISE(ABORT, 'SIMULATED_FAILURE'); END`)
    await expect(store.revokeDevice('acc_a', 'dev_a', now)).rejects.toThrow(/SIMULATED_FAILURE/)
    expect(await store.findActiveSession('refresh_hash_ses_a', now)).not.toBeNull()
  })

  it('rejects session use after account suspension or independent device/session revocation', async () => {
    await addAccount()
    await store.registerDevice('acc_a', device('dev_a'), now)
    await store.createSession(session('ses_a'))
    sqlite.exec("UPDATE accounts SET status = 'DELETION_PENDING' WHERE id = 'acc_a'")
    expect(await store.findActiveSession('refresh_hash_ses_a', now)).toBeNull()
    await expect(store.createSession(session('ses_pending'))).rejects.toMatchObject({ code: 'DEVICE_UNAVAILABLE' })
    sqlite.exec("UPDATE accounts SET status = 'ACTIVE' WHERE id = 'acc_a'")
    sqlite.exec("UPDATE account_devices SET revoked_at = 1, revoke_reason = 'SECURITY' WHERE id = 'dev_a'")
    expect(await store.findActiveSession('refresh_hash_ses_a', now)).toBeNull()
    sqlite.exec("UPDATE account_devices SET revoked_at = NULL, revoke_reason = NULL WHERE id = 'dev_a'")
    sqlite.exec("UPDATE account_sessions SET revoked_at = 1 WHERE id = 'ses_a'")
    expect(await store.findActiveSession('refresh_hash_ses_a', now)).toBeNull()
  })
})
