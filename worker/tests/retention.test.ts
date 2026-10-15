import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { sqliteBinding } from './sqliteD1'
import { TrialIdentityRegistry, trialDigest, trialIdentity } from '../src/trialIdentity'
import { TrialService } from '../src/trialService'
import { AccountDeletionService } from '../src/accountDeletion'
import { AccountStore } from '../src/accountStore'
import { D1DeletionJournal } from '../src/deletionJournal'
import { RetentionService, addMonths, DAY_MS as day } from '../src/retention'
import { EntitlementService } from '../src/entitlementService'
// @ts-expect-error Operator script remains plain Node ESM.
import { trialProgramSql } from '../scripts/prepare-trial-program.mjs'

let db: DatabaseSync, registry: DatabaseSync, binding: D1Database, independent: D1Database
let identity: TrialIdentityRegistry, trial: TrialService, deletion: AccountDeletionService, retention: RetentionService
const now = Date.UTC(2026, 9, 15), secret = 'separate-trial-key-with-at-least-32-bytes'
let queries = 0
async function account(id: string, subject = id, email = 'same@example.test') {
  await new AccountStore(binding).createGoogleAccount({ accountId: id, identityId: 'identity-' + id,
    issuer: 'https://accounts.google.com', subject, email, displayName: 'Private name', avatarUrl: null, locale: 'hu', now })
}
async function erase(id = 'a', at = now + 1) {
  return deletion.request(id, 'IMMEDIATE', await deletion.preview(id), '', at)
}
beforeEach(async () => {
  queries = 0
  db = new DatabaseSync(':memory:'); registry = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(x => x.endsWith('.sql') && x >= '003').sort())
    db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'))
  registry.exec('PRAGMA foreign_keys=ON')
  for (const file of ['schema.sql', '002_retention.sql']) registry.exec(readFileSync(new URL('../erasure-journal/' + file, import.meta.url), 'utf8'))
  registry.exec("INSERT INTO journal_identity VALUES (1,'staging','source-db')")
  registry.prepare('INSERT INTO trial_program VALUES (1,1,?,?,?,NULL)').run('v1', await trialDigest(secret, 'solemi:trial-key-check:v1'), now)
  binding = sqliteBinding(db, () => queries++); independent = sqliteBinding(registry, () => queries++)
  identity = new TrialIdentityRegistry(binding, independent, secret, 'v1', 'staging', 'source-db')
  trial = new TrialService(binding, identity)
  deletion = new AccountDeletionService(binding, new D1DeletionJournal(independent, 'staging', 'source-db'), identity)
  retention = new RetentionService(binding, independent, 'staging', 'source-db')
  await account('a')
})
afterEach(() => { db.close(); registry.close() })

describe('A17 independent trial-use identity', () => {
  it('prepares a key check compatible with the Worker without outputting the secret', async () => {
    const sql = trialProgramSql({ secret, version: 'v1', reviewedAt: 1 })
    expect(sql).not.toContain(secret)
    expect(sql).toContain(await trialDigest(secret, 'solemi:trial-key-check:v1'))
    expect(() => trialProgramSql({ secret, version: "v1'); DROP TABLE accounts;--", reviewedAt: 1 })).toThrow()
  })
  it('blocks a fresh account with the same verified Google subject, without reviving old access', async () => {
    await trial.activate('a', 'FAMILY', 'original-operation', now)
    await erase()
    await account('new', 'a', 'changed@example.test')
    expect(await trial.state('new', now + 2)).toMatchObject({ used: true, trial: null, family: null })
    await expect(trial.activate('new', 'FAMILY_PLUS', 'another-operation', now + 2)).rejects.toThrow('TRIAL_ACCOUNT_USED')
    expect(await new EntitlementService(binding).accountFeatures('new', now + 2)).toEqual([])
    expect(registry.prepare('SELECT * FROM used_trial_identities').all()).toEqual([
      { digest: await trialDigest(secret, JSON.stringify(['solemi:used-trial:v1', 'GOOGLE', 'a'])), key_version: 'v1' }
    ])
    expect(db.prepare('SELECT * FROM account_identities WHERE account_id=?').all('a')).toEqual([])
  })
  it('does not burn an unused trial on deletion and never matches on email', async () => {
    await erase(); await account('new', 'a')
    expect(await identity.used('new')).toBe(false)
    await trial.activate('new', 'FAMILY', 'first-operation', now + 2)
    await erase('new', now + 3)
    await account('different')
    expect(await identity.used('different')).toBe(false)
    await expect(trial.activate('different', 'FAMILY', 'first-operation', now + 4)).resolves.toMatchObject({ used: true })
  })
  it('retains an existing family slot and never gives the recreated account leftover trial time', async () => {
    db.exec("INSERT INTO families VALUES ('f','Family',0,'date'); INSERT INTO legacy_family_memberships VALUES ('m','f','a','ADMIN','ACTIVE',1,NULL)")
    await account('b'); db.exec("INSERT INTO legacy_family_memberships VALUES ('n','f','b','MEMBER','ACTIVE',2,NULL)")
    await trial.activate('a', 'FAMILY', 'first-operation', now)
    await erase()
    await account('new', 'a')
    expect((await trial.state('b', now + 2)).family).toMatchObject({ used: 1 })
    expect((await trial.state('new', now + 2)).trial).toBeNull()
  })
  it('normalizes Google issuer aliases and rejects accidental key/environment replacement', async () => {
    await trial.activate('a', 'FAMILY', 'first-operation', now); await identity.preserve('a')
    db.exec("UPDATE account_identities SET issuer='accounts.google.com' WHERE account_id='a'")
    expect(await identity.used('a')).toBe(true)
    for (const changed of [new TrialIdentityRegistry(binding, independent, secret + 'wrong', 'v1', 'staging', 'source-db'),
      new TrialIdentityRegistry(binding, independent, secret, 'v2', 'staging', 'source-db'),
      new TrialIdentityRegistry(binding, independent, secret, 'v1', 'production', 'source-db')])
      await expect(changed.used('a')).rejects.toThrow('TRIAL_REGISTRY_UNAVAILABLE')
    expect(() => trialIdentity({ DB: binding, ERASURE_JOURNAL: binding })).toThrow('TRIAL_REGISTRY_UNAVAILABLE')
  })
  it('fails closed on registry outage, then retries erasure without duplicating markers', async () => {
    await trial.activate('a', 'FAMILY', 'first-operation', now)
    registry.exec("CREATE TRIGGER outage BEFORE INSERT ON used_trial_identities BEGIN SELECT RAISE(ABORT,'offline'); END")
    await expect(erase()).rejects.toThrow('offline')
    expect(db.prepare("SELECT status FROM accounts WHERE id='a'").get()!.status).toBe('DELETION_PENDING')
    expect(db.prepare('SELECT COUNT(*) AS n FROM account_identities').get()!.n).toBe(1)
    registry.exec('DROP TRIGGER outage')
    await deletion.maintain(now + 2)
    expect(registry.prepare('SELECT COUNT(*) AS n FROM used_trial_identities').get()!.n).toBe(1)
    expect(db.prepare("SELECT status FROM accounts WHERE id='a'").get()!.status).toBe('DELETED')
  })
  it('ends the programme by removing markers and rejecting new trials, with no implicit restart', async () => {
    await trial.activate('a', 'FAMILY', 'first-operation', now); await identity.preserve('a')
    expect(() => registry.exec('DELETE FROM used_trial_identities')).toThrow('TRIAL_PROGRAM_ACTIVE')
    registry.prepare('UPDATE trial_program SET active=0,ended_at=?').run(now + 1)
    expect(registry.prepare('SELECT * FROM used_trial_identities').all()).toEqual([])
    await account('b')
    await expect(trial.activate('b', 'FAMILY', 'first-operation', now + 2)).rejects.toThrow('TRIAL_PROGRAM_ENDED')
    await erase('a', now + 2)
    expect(() => registry.exec('UPDATE trial_program SET active=1,ended_at=NULL')).toThrow('TRIAL_PROGRAM_IMMUTABLE')
  })
  it('blocks trial activation, binding and cached grants in an unreconciled restored copy', async () => {
    await trial.activate('a', 'FAMILY', 'first-operation', now)
    db.exec('UPDATE retention_restore_gate SET blocked=1')
    await expect(trial.activate('a', 'FAMILY', 'first-operation', now + 1)).rejects.toThrow('TRIAL_RESTORE_RECONCILIATION_REQUIRED')
    await expect(trial.bindToActiveFamily('a', now + 1)).rejects.toThrow('TRIAL_RESTORE_RECONCILIATION_REQUIRED')
    expect(await new EntitlementService(binding).accountFeatures('a', now + 1)).toEqual([])
  })
  it('keeps protected erasure and retention work within the Free SQL query ceiling', async () => {
    db.exec(`INSERT INTO families VALUES ('f','Family',2,'date');
      INSERT INTO legacy_family_memberships VALUES ('m','f','a','ADMIN','ACTIVE',1,NULL);
      INSERT INTO children VALUES ('child','f','Baby','2026-01-01','date','date',NULL,1);
      INSERT INTO sleep_sessions VALUES ('sleep','f','child','date',NULL,'Private note',NULL,'date','date',NULL,2);`)
    await trial.activate('a', 'FAMILY', 'first-operation', now)
    const preview = await deletion.preview('a'); queries = 0
    await deletion.request('a', 'IMMEDIATE', preview, 'Family', now + 1)
    // Includes registry preflight and marker persistence; leaves room for HTTP auth.
    expect(queries).toBeLessThanOrEqual(46)
    queries = 0; await retention.journalStep(now + 2)
    expect(queries).toBeLessThanOrEqual(20)
  })
})

describe('A17 conditional journal retention', () => {
  function verified(until: number) { registry.prepare('INSERT OR REPLACE INTO retention_inventory (id,verified_until) VALUES (1,?)').run(until) }
  it('requires verified inventory and the provider horizon plus grace, exactly at the boundary', async () => {
    await erase('a', now)
    expect((await retention.journalStep(now)).inventoryRequired).toBe(true)
    verified(now + 100 * day)
    expect((await retention.journalStep(now + 60 * day - 1)).cleaned).toBe(0)
    expect((await retention.journalStep(now + 60 * day)).cleaned).toBe(1)
    expect(db.prepare('SELECT * FROM erasure_receipts').all()).toEqual([])
    expect(registry.prepare('SELECT * FROM deletion_journal').all()).toEqual([])
    expect(registry.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('blocks while an affected backup still exists, and waits after actual destruction', async () => {
    await erase('a', now); verified(now + 200 * day)
    await retention.journalStep(now)
    registry.prepare('INSERT INTO managed_backups VALUES (?,?,?,NULL)').run('backup', now - day, now + 29 * day)
    expect((await retention.journalStep(now + 100 * day)).cleaned).toBe(0)
    registry.prepare('UPDATE managed_backups SET destroyed_at=?').run(now + 100 * day)
    expect((await retention.journalStep(now + 130 * day - 1)).cleaned).toBe(0)
    expect((await retention.journalStep(now + 130 * day)).cleaned).toBe(1)
  })
  it('uses a verified shorter provider horizon without extending it to 30 days', async () => {
    await erase('a', now); verified(now + 100 * day)
    registry.prepare('UPDATE retention_inventory SET provider_window_ms=?').run(7 * day)
    await retention.journalStep(now)
    expect((await retention.journalStep(now + 37 * day - 1)).cleaned).toBe(0)
    expect((await retention.journalStep(now + 37 * day)).cleaned).toBe(1)
  })
  it('waits for pending restores and 30 days after they really complete', async () => {
    await erase('a', now); verified(now + 200 * day)
    await retention.journalStep(now)
    registry.prepare('INSERT INTO restore_jobs VALUES (?,?,NULL)').run('restore', now)
    expect((await retention.journalStep(now + 100 * day)).cleaned).toBe(0)
    registry.prepare('UPDATE restore_jobs SET completed_at=?').run(now + 100 * day)
    expect((await retention.journalStep(now + 130 * day)).cleaned).toBe(1)
  })
  it('never treats durable intent as completed physical deletion', async () => {
    const r = await deletion.request('a', 'RECOVERY', await deletion.preview('a'), '', now)
    registry.prepare("UPDATE deletion_journal SET state='ERASE',resolved_at=? WHERE request_id=?").run(now + 1, r.requestId)
    verified(now + 200 * day)
    expect((await retention.journalStep(now + 100 * day)).cleaned).toBe(0)
    expect(registry.prepare('SELECT * FROM deletion_completion').all()).toEqual([])
    expect(() => registry.exec('DELETE FROM deletion_journal')).toThrow('JOURNAL_RETENTION_REQUIRED')
  })
  it('does not let a copy or retry extend a backup creation time or expiry', () => {
    registry.prepare('INSERT INTO managed_backups VALUES (?,?,?,NULL)').run('b', now, now + 30 * day)
    expect(() => registry.prepare('UPDATE managed_backups SET created_at=?').run(now + day)).toThrow('BACKUP_AGE_IMMUTABLE')
    expect(() => registry.prepare('UPDATE managed_backups SET expires_at=?').run(now + 31 * day)).toThrow()
  })
  it('keeps the marker after obsolete account/trial details can be removed', async () => {
    await trial.activate('a', 'FAMILY', 'first-operation', now); await erase('a', now + 1)
    verified(now + 100 * day); await retention.journalStep(now + 1)
    await retention.journalStep(now + 61 * day); await retention.billingStep(now + 61 * day)
    expect(db.prepare('SELECT * FROM account_trials').all()).toEqual([])
    expect(db.prepare('SELECT * FROM accounts').all()).toEqual([])
    await account('new', 'a')
    expect(await identity.used('new')).toBe(true)
  })
  it('reports annual programme review instead of silently extending or erasing eligibility', async () => {
    await trial.activate('a', 'FAMILY', 'first-operation', now); await identity.preserve('a')
    expect((await retention.maintain(addMonths(now, 12))).trialReviewRequired).toBe(true)
    expect(await identity.used('a')).toBe(true)
  })
})

describe('A17 technical billing retention', () => {
  function subscription(status = 'EXPIRED') {
    db.prepare(`INSERT INTO subscriptions (id,account_id,provider,provider_subscription_id,product,status,auto_renews,
      current_period_ends_at,access_until,created_at,updated_at) VALUES ('s','a','MANUAL','provider-s','FAMILY',?,0,?,?,?,?)`)
      .run(status, now, now, now - day, now)
    db.exec("INSERT INTO subscription_events VALUES ('e','MANUAL','pe','s','EXPIRED',1,1,'hash',1,NULL)")
  }
  it('uses UTC calendar months including leap-day clamping', () => {
    expect(addMonths(Date.UTC(2024, 1, 29, 12, 34), 24)).toBe(Date.UTC(2026, 1, 28, 12, 34))
    expect(addMonths(Date.UTC(2026, 0, 31), 1)).toBe(Date.UTC(2026, 1, 28))
  })
  it('removes terminal records at 24 months without deleting the diary/account', async () => {
    subscription(); const deadline = addMonths(now, 24)
    expect((await retention.billingStep(deadline - 1)).cleaned).toBe(0)
    expect((await retention.billingStep(deadline)).cleaned).toBe(1)
    expect(db.prepare('SELECT * FROM subscriptions').all()).toEqual([])
    expect(db.prepare('SELECT * FROM subscription_events').all()).toEqual([])
    expect(db.prepare('SELECT * FROM accounts').all()).toHaveLength(1)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('preserves an open dispute and starts at closure; duplicate close events do not extend it', async () => {
    subscription(); await retention.dispute('s', true, now)
    expect((await retention.billingStep(addMonths(now, 30))).cleaned).toBe(0)
    await retention.dispute('s', false, now + day)
    await retention.dispute('s', false, now + 10 * day)
    expect(db.prepare('SELECT dispute_closed_at FROM billing_retention').get()!.dispute_closed_at).toBe(now + day)
    expect((await retention.billingStep(addMonths(now + day, 24))).cleaned).toBe(1)
  })
  it('remembers disputes opened before expiry and never deletes active or merely canceled access', async () => {
    subscription('ACTIVE'); await retention.dispute('s', true, now)
    expect((await retention.billingStep(addMonths(now, 30))).cleaned).toBe(0)
    db.exec("UPDATE subscriptions SET status='EXPIRED'")
    expect((await retention.billingStep(addMonths(now, 30))).cleaned).toBe(0)
    db.exec("UPDATE subscriptions SET status='CANCELED'")
    await retention.dispute('s', false, now + day)
    expect((await retention.billingStep(addMonths(now, 30))).cleaned).toBe(0)
  })
  it('repeated terminal callbacks do not restart the retention clock', async () => {
    subscription(); db.prepare('UPDATE subscriptions SET updated_at=?').run(now + 100 * day)
    expect(db.prepare('SELECT ended_at FROM billing_retention').get()!.ended_at).toBe(now)
    expect((await retention.billingStep(addMonths(now, 24))).cleaned).toBe(1)
  })
  it('starts revocation retention when access is revoked, not at a future nominal renewal date', async () => {
    subscription('ACTIVE')
    db.prepare("UPDATE subscriptions SET status='REVOKED',access_until=?,updated_at=?").run(now + 365 * day, now)
    db.prepare('UPDATE subscriptions SET updated_at=?').run(now + 100 * day)
    expect(db.prepare('SELECT ended_at FROM billing_retention').get()!.ended_at).toBe(now)
    expect((await retention.billingStep(addMonths(now, 24))).cleaned).toBe(1)
  })
  it('protects specifically documented legal holds and flags an overdue review', async () => {
    subscription()
    db.prepare('INSERT INTO billing_legal_holds VALUES (?,?,?,?,?,NULL)').run('s', 'documented-claim', 'responsible-role', now, now + day)
    expect((await retention.billingStep(addMonths(now, 24))).cleaned).toBe(0)
    expect((await retention.maintain(addMonths(now, 24))).legalHoldReviewsDue).toBe(1)
    db.prepare('UPDATE billing_legal_holds SET released_at=?').run(now + 2 * day)
    expect((await retention.billingStep(addMonths(now, 24))).cleaned).toBe(1)
  })
  it('ignores old dispute events after a documented closure', async () => {
    subscription(); await retention.dispute('s', true, now); await retention.dispute('s', false, now + day)
    await retention.dispute('s', true, now)
    expect((await retention.billingStep(addMonths(now + day, 24))).cleaned).toBe(1)
  })
})
