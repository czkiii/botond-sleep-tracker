import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { TrialService, TRIAL_MS } from '../src/trialService'
import { EntitlementService } from '../src/entitlementService'
import { offlineEntitlement } from '../src/offlineEntitlement'
import { decodeJwt } from 'jose'
import { sqliteBinding } from './sqliteD1'

const now = 1800000000000, day = 86400000
let db: DatabaseSync, trial: TrialService, grants: EntitlementService, binding: D1Database
function account(id: string) {
  db.prepare(`INSERT INTO accounts (id, status, created_at, updated_at, last_login_at) VALUES (?, 'ACTIVE', ?, ?, ?)`)
    .run(id, now, now, now)
}
function family(id: string) { db.prepare('INSERT INTO families (id, name, revision, created_at) VALUES (?, ?, 0, ?)').run(id, id, new Date(now).toISOString()) }
function join(id: string, fam: string, time = now) {
  db.prepare(`INSERT INTO legacy_family_memberships (id, family_id, account_id, role, status, joined_at) VALUES (?, ?, ?, 'MEMBER', 'ACTIVE', ?)`)
    .run(crypto.randomUUID(), fam, id, time)
}
function leave(id: string, time = now) {
  db.prepare(`UPDATE legacy_family_memberships SET status = 'LEFT', ended_at = ? WHERE account_id = ? AND status = 'ACTIVE'`).run(time, id)
}
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  // 001/002 are already represented in schema.sql, just as in existing tests.
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(x => x.endsWith('.sql') && x >= '003').sort()) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  }
  binding = sqliteBinding(db); trial = new TrialService(binding); grants = new EntitlementService(binding)
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) account(id)
  family('one'); family('two')
})
afterEach(() => db.close())

describe('A11 account lifetime and atomic family trial limits', () => {
  it('backfills previous store trial usage without changing paid subscriptions or grants', async () => {
    using old = new DatabaseSync(':memory:')
    old.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
    for (const name of ['003_accounts_and_sessions.sql', '005_family_memberships.sql', '006_subscriptions_and_entitlements.sql']) {
      old.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
    }
    old.exec(`INSERT INTO accounts (id, status, created_at, updated_at, last_login_at) VALUES ('old', 'ACTIVE', 1, 1, 1);
      INSERT INTO subscriptions VALUES ('old-sub', 'old', 'APPLE', 'old-store', 'FAMILY', 'ACTIVE', 1, 604800001, 900000000, 900000000, 1, 700000000, NULL);
      INSERT INTO account_entitlements VALUES ('old-grant', 'old', 'PDF_EXPORT', 'SUBSCRIPTION', 'old-sub', 1, 900000000, NULL, 1, 1);`)
    const subscriptions = old.prepare('SELECT * FROM subscriptions').all(), entitlements = old.prepare('SELECT * FROM account_entitlements').all()
    old.exec(readFileSync(new URL('../migrations/010_account_trials.sql', import.meta.url), 'utf8'))
    expect(old.prepare('SELECT * FROM subscriptions').all()).toEqual(subscriptions)
    expect(old.prepare('SELECT * FROM account_entitlements').all()).toEqual(entitlements)
    expect(old.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    const migrated = new TrialService(sqliteBinding(old))
    expect(await migrated.state('old', 700000000)).toMatchObject({ usageOrigin: 'LEGACY_STORE', trial: null, used: true })
    await expect(migrated.activate('old', 'FAMILY_PLUS', 'new-request', 700000000)).rejects.toThrow('TRIAL_ACCOUNT_USED')
  })
  it.each(['FAMILY', 'FAMILY_PLUS'] as const)('grants exactly seven days for %s, including precise expiry', async product => {
    const state = await trial.activate('a', product, 'request-a', now)
    expect(state.trial).toMatchObject({ startedAt: now, endsAt: now + TRIAL_MS, familyId: null, active: true })
    expect(await grants.accountFeatures('a', now - 1)).toEqual([])
    expect(await grants.accountFeatures('a', now)).toHaveLength(product === 'FAMILY' ? 2 : 3)
    expect(await grants.accountFeatures('a', now + TRIAL_MS - 1)).toHaveLength(product === 'FAMILY' ? 2 : 3)
    expect(await grants.accountFeatures('a', now + TRIAL_MS)).toEqual([])
    expect((await trial.state('a', now + TRIAL_MS)).used).toBe(true)
  })
  it('replays the same operation without restarting, but rejects a new operation or changed plan', async () => {
    const original = await trial.activate('a', 'FAMILY', 'request-a', now)
    expect((await trial.activate('a', 'FAMILY', 'request-a', now + day)).trial).toEqual(original.trial)
    await expect(trial.activate('a', 'FAMILY_PLUS', 'request-a', now + day)).rejects.toThrow('TRIAL_ACCOUNT_USED')
    await expect(trial.activate('a', 'FAMILY', 'request-b', now + 10 * day)).rejects.toThrow('TRIAL_ACCOUNT_USED')
  })
  it('serializes identical and competing same-account requests', async () => {
    const same = await Promise.all(Array.from({ length: 8 }, () => trial.activate('a', 'FAMILY', 'same-request', now)))
    expect(same.every(r => r.used)).toBe(true)
    const outcomes = await Promise.allSettled(['request-1', 'request-2'].map(op => trial.activate('b', 'FAMILY_PLUS', op, now)))
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_trials').get()!.n).toBe(2)
  })
  it('allows only one active trial in a family without spending the losing account right', async () => {
    join('a', 'one'); join('b', 'one')
    const outcomes = await Promise.allSettled(['a', 'b'].map(id => trial.activate(id, 'FAMILY', `request-${id}`, now)))
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(r => r.status === 'rejected').map(r => r.reason.message)).toEqual(['TRIAL_FAMILY_ACTIVE'])
    const loser = (await trial.state('a', now)).used ? 'b' : 'a'
    expect((await trial.state(loser, now)).used).toBe(false)
    await trial.activate(loser, 'FAMILY', `request-${loser}`, now + TRIAL_MS)
    expect((await trial.state(loser, now + TRIAL_MS)).family?.used).toBe(2)
  })
  it('permits four sequential distinct accounts, then denies the fifth without consuming it', async () => {
    for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) {
      join(id, 'one', now + i * TRIAL_MS)
      await trial.activate(id, 'FAMILY', `request-${id}`, now + i * TRIAL_MS)
      leave(id, now + (i + 1) * TRIAL_MS)
    }
    join('e', 'one', now + 4 * TRIAL_MS)
    await expect(trial.activate('e', 'FAMILY_PLUS', 'request-e', now + 4 * TRIAL_MS)).rejects.toThrow('TRIAL_FAMILY_LIMIT')
    expect((await trial.state('e', now + 4 * TRIAL_MS)).used).toBe(false)
    leave('e', now + 4 * TRIAL_MS); join('e', 'two', now + 4 * TRIAL_MS)
    await expect(trial.activate('e', 'FAMILY', 'request-e', now + 4 * TRIAL_MS)).resolves.toMatchObject({ used: true })
  })
  it('two accounts racing for the fourth slot never create a fifth', async () => {
    for (const [i, id] of ['a', 'b', 'c'].entries()) { join(id, 'one'); await trial.activate(id, 'FAMILY', `request-${id}`, now + i * TRIAL_MS) }
    join('d', 'one'); join('e', 'one')
    const results = await Promise.allSettled(['d', 'e'].map(id => trial.activate(id, 'FAMILY', `request-${id}`, now + 3 * TRIAL_MS)))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect((await trial.state('d', now + 3 * TRIAL_MS)).family?.used).toBe(4)
  })
  it('binds an unassigned trial on joining, preserving its original deadline', async () => {
    await trial.activate('a', 'FAMILY_PLUS', 'request-a', now)
    join('a', 'one', now + 2 * day); join('b', 'one', now + 2 * day)
    const state = await trial.state('a', now + 2 * day)
    expect(state.trial).toMatchObject({ activationFamilyId: null, familyId: 'one', endsAt: now + TRIAL_MS })
    expect(state.family?.used).toBe(1)
    expect((await grants.accessState('b', now + 2 * day)).features).toHaveLength(3)
    await expect(trial.activate('a', 'FAMILY_PLUS', 'another-request', now + 2 * day)).rejects.toThrow('TRIAL_ACCOUNT_USED')
  })
  it('leaving or moving cannot transfer the bound grant or reset either counter', async () => {
    join('a', 'one'); join('b', 'one'); join('c', 'two')
    await trial.activate('a', 'FAMILY_PLUS', 'request-a', now)
    leave('a', now + day); join('a', 'two', now + day)
    await trial.bindToActiveFamily('a', now + day)
    expect(await grants.familyFeatures('one', now + day)).toEqual([])
    expect(await grants.familyFeatures('two', now + day)).toEqual([])
    expect((await trial.state('a', now + day)).trial?.familyId).toBe('one')
    expect((await trial.state('b', now + day)).family?.used).toBe(1)
    await expect(trial.activate('b', 'FAMILY', 'request-b', now + day)).rejects.toThrow('TRIAL_FAMILY_ACTIVE')
    leave('a', now + 2 * day); join('a', 'one', now + 2 * day)
    expect(await grants.familyFeatures('one', now + 2 * day)).toHaveLength(3)
  })
  it('a busy family accepts membership without spending a slot; later binding uses only remaining time', async () => {
    join('a', 'one'); await trial.activate('a', 'FAMILY', 'request-a', now)
    await trial.activate('b', 'FAMILY_PLUS', 'request-b', now + 2 * day)
    join('b', 'one', now + 3 * day)
    expect((await trial.state('b', now + 3 * day)).trial?.familyId).toBeNull()
    expect(await grants.familyFeatures('one', now + 3 * day)).not.toContain('FAMILY_PLUS_INSIGHTS')
    await trial.bindToActiveFamily('b', now + TRIAL_MS)
    expect((await trial.state('b', now + TRIAL_MS)).trial).toMatchObject({ familyId: 'one', endsAt: now + 9 * day })
    expect(await grants.familyFeatures('one', now + TRIAL_MS)).toHaveLength(3)
  })
  it('a full family cannot inherit an unassigned trial, even through explicit bind', async () => {
    for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) { join(id, 'one'); await trial.activate(id, 'FAMILY', `request-${id}`, now + i * TRIAL_MS) }
    const at = now + 4 * TRIAL_MS
    await trial.activate('e', 'FAMILY_PLUS', 'request-e', at); join('e', 'one', at)
    await trial.bindToActiveFamily('e', at)
    expect((await trial.state('e', at)).trial?.familyId).toBeNull()
    expect(await grants.familyFeatures('one', at)).toEqual([])
    expect(await grants.accountFeatures('e', at)).toHaveLength(3)
  })
  it('expired unassigned trials never bind or restart when joining later', async () => {
    await trial.activate('a', 'FAMILY', 'request-a', now)
    join('a', 'one', now + TRIAL_MS); await trial.bindToActiveFamily('a', now + TRIAL_MS)
    expect((await trial.state('a', now + TRIAL_MS)).family?.used).toBe(0)
    expect(await grants.familyFeatures('one', now + TRIAL_MS)).toEqual([])
  })
  it('family dissolution/new family and new device leave lifetime usage intact', async () => {
    join('a', 'one'); await trial.activate('a', 'FAMILY', 'request-a', now)
    db.prepare('DELETE FROM families WHERE id = ?').run('one')
    join('a', 'two', now + day)
    expect((await trial.state('a', now + day)).trial?.familyId).toBe('one')
    await expect(new TrialService(sqliteBinding(db)).activate('a', 'FAMILY', 'new-device', now + day)).rejects.toThrow('TRIAL_ACCOUNT_USED')
    expect(await grants.familyFeatures('two', now + day)).toEqual([])
  })
  it('rejects tampering with immutable duration, product, account or bound family', async () => {
    join('a', 'one'); await trial.activate('a', 'FAMILY', 'request-a', now)
    for (const assignment of ["account_id = 'b'", "product = 'FAMILY_PLUS'", 'ends_at = ends_at + 1', "family_id = 'two'", 'family_id = NULL, family_bound_at = NULL']) {
      expect(() => db.exec(`UPDATE account_trials SET ${assignment} WHERE account_id = 'a'`)).toThrow('TRIAL_IMMUTABLE')
    }
  })
  it('preserves usage after soft account deletion and prevents accidental hard-delete reset', async () => {
    await trial.activate('a', 'FAMILY', 'request-a', now)
    db.prepare("UPDATE accounts SET status = 'DELETED', deleted_at = ? WHERE id = 'a'").run(now)
    expect(await grants.accountFeatures('a', now)).toEqual([])
    expect((await trial.state('a', now)).used).toBe(true)
    expect(() => db.exec("DELETE FROM accounts WHERE id = 'a'")).toThrow()
  })
  it('rejects missing/inactive accounts and invalid client input without writes', async () => {
    await expect(trial.activate('missing', 'FAMILY', 'request-a', now)).rejects.toThrow('TRIAL_ACCOUNT_UNAVAILABLE')
    db.prepare("UPDATE accounts SET status = 'DELETED', deleted_at = ? WHERE id = 'a'").run(now)
    await expect(trial.activate('a', 'FAMILY', 'request-a', now)).rejects.toThrow('TRIAL_ACCOUNT_UNAVAILABLE')
    await expect(trial.activate('b', 'FAMILY', 'short', now)).rejects.toThrow('TRIAL_INVALID_REQUEST')
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_trials').get()!.n).toBe(0)
  })
  it('a failure in the enclosing D1 batch rolls back membership, family binding and slot', async () => {
    await trial.activate('a', 'FAMILY', 'request-a', now)
    await expect(binding.batch([
      binding.prepare(`INSERT INTO legacy_family_memberships (id, family_id, account_id, role, status, joined_at) VALUES ('race', 'one', 'a', 'MEMBER', 'ACTIVE', ?)`).bind(now),
      binding.prepare('INSERT INTO missing_table VALUES (1)')
    ])).rejects.toThrow()
    expect((await trial.state('a', now)).trial?.familyId).toBeNull()
    expect(db.prepare('SELECT COUNT(*) AS n FROM legacy_family_memberships').get()!.n).toBe(0)
  })
  it('paid entitlement still works after the trial expires', async () => {
    join('a', 'one'); join('b', 'one'); await trial.activate('a', 'FAMILY_PLUS', 'request-a', now)
    await grants.setManualTestPlan('b', 'family', now + TRIAL_MS)
    expect(await grants.familyFeatures('one', now + TRIAL_MS)).toEqual(['FAMILY_SYNC', 'PDF_EXPORT'])
  })
  it('signed offline access expires no later than the trial and cannot share it to another family', async () => {
    join('a', 'one'); join('b', 'one'); await trial.activate('a', 'FAMILY_PLUS', 'request-a', now)
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const privateKey = JSON.stringify(await crypto.subtle.exportKey('jwk', keys.privateKey))
    db.prepare(`INSERT INTO account_devices (id, account_id, installation_hash, credential_hash, created_at, last_seen_at) VALUES ('device', 'b', 'i', 'c', ?, ?)`).run(now, now)
    db.prepare(`INSERT INTO account_sessions (id, account_id, device_id, refresh_hash, created_at, last_used_at, expires_at) VALUES ('session', 'b', 'device', 'r', ?, ?, ?)`).run(now, now, now + 30 * day)
    const access = { account: { id: 'b' }, deviceId: 'device', sessionId: 'session' }
    const jwt = await offlineEntitlement(binding, privateKey, access, now)
    expect(decodeJwt(jwt!).exp).toBe((now + TRIAL_MS) / 1000)
    leave('a', now + day); join('a', 'two', now + day)
    expect(await offlineEntitlement(binding, privateKey, access, now + day)).toBeUndefined()
    expect(await offlineEntitlement(binding, privateKey, access, now + TRIAL_MS)).toBeUndefined()
  })
  it('records legacy store usage even if renewal later clears the old trial timestamp', async () => {
    db.prepare(`INSERT INTO subscriptions VALUES ('s', 'a', 'APPLE', 'old-store', 'FAMILY', 'ACTIVE', 1, ?, ?, ?, ?, ?, NULL)`)
      .run(now - day, now + day, now + day, now - TRIAL_MS, now)
    db.exec("UPDATE subscriptions SET trial_ends_at = NULL WHERE id = 's'")
    expect(await trial.state('a', now)).toMatchObject({ usageOrigin: 'LEGACY_STORE', trial: null, used: true })
    expect(await grants.accountFeatures('a', now)).toEqual([])
    await expect(trial.activate('a', 'FAMILY', 'request-a', now)).rejects.toThrow('TRIAL_ACCOUNT_USED')
  })
})
