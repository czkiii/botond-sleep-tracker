import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { EntitlementService } from '../src/entitlementService'
import { TrialIdentityRegistry, trialDigest } from '../src/trialIdentity'
import { TrialService } from '../src/trialService'
import worker from '../src/index'
import { sqliteBinding } from './sqliteD1'
// @ts-expect-error Offline executable Node script.
import { prepareBusinessRestore } from '../scripts/prepare-business-restore.mjs'
// @ts-expect-error Offline executable Node script.
import { digest, dump } from '../scripts/prepare-deletion-restore.mjs'

const now = 1800000000000, week = 604800000
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8') + '\n' +
  readdirSync(new URL('../migrations/', import.meta.url)).filter(x => x.endsWith('.sql') && x >= '003').sort()
    .map(x => readFileSync(new URL('../migrations/' + x, import.meta.url), 'utf8')).join('\n')
const journal = readFileSync(new URL('../erasure-journal/schema.sql', import.meta.url), 'utf8') + '\n' +
  readFileSync(new URL('../erasure-journal/002_retention.sql', import.meta.url), 'utf8') + `
  INSERT INTO journal_identity VALUES (1,'staging','source-db');
  INSERT INTO trial_program VALUES (1,1,'v1','${'a'.repeat(64)}',${now-1000},NULL);
  INSERT INTO used_trial_identities VALUES ('${'b'.repeat(64)}','v1');`
function fixture(extra = '') {
  return schema + `
  INSERT INTO families VALUES ('f','Family',2,'created');
  INSERT INTO children VALUES ('child','f','Child',NULL,'created','updated',NULL,1);
  INSERT INTO sleep_sessions VALUES ('sleep','f','child','2026-10-01',NULL,'Original diary',NULL,'created','updated',NULL,2);
  INSERT INTO accounts (id,created_at,updated_at,last_login_at) VALUES ('a',1,1,1),('b',1,1,1),('c',1,1,1),('d',1,1,1),('e',1,1,1);
  INSERT INTO account_identities VALUES ('ia','a','GOOGLE','https://accounts.google.com','subject',NULL,1,1,1);
  INSERT INTO legacy_family_memberships VALUES ('ma','f','a','ADMIN','ACTIVE',1,NULL),('mb','f','b','MEMBER','ACTIVE',1,NULL),
    ('mc','f','c','MEMBER','ACTIVE',1,NULL),('md','f','d','MEMBER','ACTIVE',1,NULL),('me','f','e','MEMBER','ACTIVE',1,NULL);
  INSERT INTO account_devices VALUES ('device','a','install','credential','Phone','WEB',1,1,NULL,NULL);
  INSERT INTO account_sessions VALUES ('session','a','device','refresh',1,1,${now+week},NULL,0);
  INSERT INTO devices VALUES ('legacy','f','token','Phone','created','seen',NULL);
  INSERT INTO invite_codes VALUES ('invite','f','legacy','created','expires',NULL);
  ` + extra
}
function trial(id: string, start: number) {
  return `INSERT INTO account_trials VALUES ('${id}','op-${id}','FAMILY',${start},${start+week},'f','f',${start},'SOLEMI');`
}
function paid(status = 'ACTIVE', eventId = 'event1') {
  return `INSERT INTO billing_account_links VALUES ('a','GOOGLE_PLAY','abcdefghijklmnopqrstuvwx',1,1);
  INSERT INTO subscriptions VALUES ('sub','a','GOOGLE_PLAY','purchase','FAMILY','${status}',0,NULL,${now+week},${now+week},1,${now-10},NULL);
  INSERT INTO store_subscription_state VALUES ('sub','a','GOOGLE_PLAY','SANDBOX','transaction','abcdefghijklmnopqrstuvwx',
    ${now-10},'ACKNOWLEDGED',${now-10},NULL,1,${now-10},'${eventId}','${status}');
  INSERT INTO subscription_events VALUES ('event','GOOGLE_PLAY','${eventId}','sub','VERIFIED',${now-10},${now-10},'payload',${now-10},NULL);
  INSERT INTO account_entitlements VALUES ('grant','a','PDF_EXPORT','SUBSCRIPTION','sub',1,${now+week},NULL,1,${now-10});`
}
function meta(backup: string, current: string, log = journal, clock = now) {
  return {environment:'staging', sourceDatabaseId:'source-db', backupSha256:digest(backup), currentSha256:digest(current),
    journalSha256:digest(log), backupCreatedAt:clock-86400000, currentCapturedAt:clock, journalCapturedAt:clock, frozenAt:clock-1000}
}
function prepare(backup: string, current: string, log = journal) {
  return prepareBusinessRestore({backup,current,journal:log,metadata:meta(backup,current,log),environment:'staging',sourceDatabaseId:'source-db',now})
}
async function inspect(sql: string, run: (db: DatabaseSync) => void | Promise<void>) {
  const db = new DatabaseSync(':memory:')
  try { db.exec(sql); await run(db) } finally { db.close() }
}

describe('offline current business history reconciliation', () => {
  it('keeps all four consumed family slots, including expired trials, without replacing the older diary', async () => {
    const old = fixture(trial('a',now-4*week)), current = old + trial('b',now-3*week) + trial('c',now-2*week) + trial('d',now-week)
      + "UPDATE sleep_sessions SET note='Newer content, not chosen for restore';"
    const result = await prepare(old,current)
    await inspect(result.sql, db => {
      expect(db.prepare('SELECT COUNT(*) AS n FROM account_trials').get()!.n).toBe(4)
      expect(db.prepare('SELECT note FROM sleep_sessions').get()!.note).toBe('Original diary')
      expect(() => db.exec(trial('e',now))).toThrow('TRIAL_FAMILY_LIMIT')
      expect(db.prepare('SELECT blocked FROM retention_restore_gate').get()!.blocked).toBe(0)
      expect(db.prepare('SELECT revoked_at,revoke_reason FROM account_devices').get()).toEqual({revoked_at:now,revoke_reason:'SECURITY'})
      expect(db.prepare('SELECT revoked_at FROM account_sessions').get()!.revoked_at).toBe(now)
      expect(db.prepare('SELECT revoked_at FROM devices').get()!.revoked_at).not.toBeNull()
      expect(db.prepare('SELECT * FROM invite_codes').all()).toHaveLength(0)
    })
    expect(result.report.businessReconciliationRequired).toBe(false)
    expect(result.report.trafficMayResume).toBe(false)
    expect(result.report.remoteApplied).toBe(false)
    expect(result.report.outputSha256).toBe(digest(result.sql))
    expect(JSON.stringify(result.report)).not.toMatch(/Original diary|subject|credential|purchase/)
  })
  it('restores a later single family binding without starting a second trial', async () => {
    const old = fixture(`UPDATE legacy_family_memberships SET status='LEFT',ended_at=2 WHERE account_id='b';
      INSERT INTO account_trials VALUES ('b','op','FAMILY',${now-1000},${now-1000+week},NULL,NULL,NULL,'SOLEMI');`)
    // Binding requires a live membership; the capture below represents leaving
    // that same family again. The historical binding must still be retained.
    const db = new DatabaseSync(':memory:')
    let current: string
    try {
      db.exec(old)
      db.exec(`UPDATE legacy_family_memberships SET status='ACTIVE',ended_at=NULL WHERE account_id='b';
        UPDATE account_trials SET family_id='f',family_bound_at=${now-500} WHERE account_id='b';
        UPDATE legacy_family_memberships SET status='LEFT',ended_at=2 WHERE account_id='b';`)
      current=dump(db)
    } finally { db.close() }
    const result=await prepare(old,current)
    await inspect(result.sql, db => {
      expect(db.prepare('SELECT family_id,ends_at FROM account_trials').get()).toEqual({family_id:'f',ends_at:now-1000+week})
      expect(() => db.exec(`UPDATE account_trials SET ends_at=${now+2*week}`)).toThrow('TRIAL_IMMUTABLE')
    })
  })
  it('rejects a source that lost or rewrote previously consumed trial history', async () => {
    const old=fixture(trial('a',now-week))
    await expect(prepare(old,fixture())).rejects.toThrow('BUSINESS_TRIAL_HISTORY_LOST')
    await expect(prepare(old,fixture(trial('a',now-2*week)))).rejects.toThrow('BUSINESS_TRIAL_HISTORY_LOST')
  })
  it('uses the current refund/revocation, event order, dispute and legal hold instead of old access', async () => {
    const old=fixture(paid())
    const current=old+`UPDATE subscriptions SET status='REVOKED',updated_at=${now} WHERE id='sub';
      UPDATE account_entitlements SET revoked_at=${now},updated_at=${now};
      UPDATE store_subscription_state SET last_applied_status='REVOKED',last_applied_event_id='refund',last_verified_at=${now};
      INSERT INTO subscription_events VALUES ('refund','GOOGLE_PLAY','refund','sub','REFUND',${now},${now},'refund-hash',${now},NULL);
      UPDATE billing_retention SET dispute_open=1,dispute_event_at=${now};
      INSERT INTO billing_legal_holds VALUES ('sub','Documented dispute','operator',${now},${now+week},NULL);`
    const result=await prepare(old,current)
    await inspect(result.sql, async db => {
      expect(await new EntitlementService(sqliteBinding(db)).accountFeatures('a',now)).toEqual([])
      expect(db.prepare('SELECT status FROM subscriptions').get()!.status).toBe('REVOKED')
      expect(db.prepare('SELECT COUNT(*) AS n FROM subscription_events').get()!.n).toBe(2)
      expect(db.prepare('SELECT dispute_open FROM billing_retention').get()!.dispute_open).toBe(1)
      expect(db.prepare('SELECT * FROM billing_legal_holds').all()).toHaveLength(1)
    })
  })
  it('allows current verified store access and preserves duplicate-event protection', async () => {
    const current=fixture(paid()), result=await prepare(fixture(),current)
    await inspect(result.sql, async db => {
      expect(await new EntitlementService(sqliteBinding(db)).accountFeatures('a',now)).toEqual(['PDF_EXPORT'])
      expect(() => db.exec(`INSERT INTO subscription_events SELECT 'other',provider,provider_event_id,subscription_id,
        event_type,occurred_at,received_at,payload_hash,processed_at,processing_error FROM subscription_events`)).toThrow()
    })
    expect((await prepare(result.sql,current)).sql).toBe(result.sql)
  })
  it('preserves unseen linked-token tombstones and prevents old purchase reuse', async () => {
    const current=fixture(paid()) + `INSERT INTO google_token_replacements VALUES ('old-token','sub','a','SANDBOX','abcdefghijklmnopqrstuvwx',${now});`
    const result=await prepare(fixture(),current)
    await inspect(result.sql, db => expect(() => db.exec(`INSERT INTO subscriptions VALUES ('old','a','GOOGLE_PLAY','old-token','FAMILY',
      'ACTIVE',0,NULL,${now+week},${now+week},1,${now},NULL)`)).toThrow('REPLACED_GOOGLE_TOKEN'))
  })
  it('replays deletion before comparing scope and keeps the erased member family trial slot', async () => {
    const old=fixture(), current=fixture(trial('b',now-week))
    const log=journal+`INSERT INTO deletion_journal VALUES (1,'erase-b','b',NULL,${now-100},${now-100},'ERASE',${now-1});`
    const result=await prepare(old,current,log)
    await inspect(result.sql, db => {
      expect(db.prepare("SELECT status FROM accounts WHERE id='b'").get()!.status).toBe('DELETED')
      expect(db.prepare("SELECT family_id FROM account_trials WHERE account_id='b'").get()!.family_id).toBe('f')
      expect(db.prepare('SELECT * FROM sleep_sessions').all()).toHaveLength(1)
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    })
    expect(result.report.trialRegistrySha256).toHaveLength(64)
  })
  it('keeps the independent used-trial marker effective after restore and re-registration, with HTTP still frozen', async () => {
    const secret='local-rehearsal-only-independent-trial-secret'
    const log=journal.replace('a'.repeat(64),await trialDigest(secret,'solemi:trial-key-check:v1'))
      .replace('b'.repeat(64),await trialDigest(secret,JSON.stringify(['solemi:used-trial:v1','GOOGLE','old-subject'])))
    const result=await prepare(fixture(),fixture(),log)
    const independent=new DatabaseSync(':memory:')
    try {
      independent.exec(log)
      const unchanged=dump(independent)
      await inspect(result.sql,async db => {
        db.exec(`INSERT INTO accounts (id,created_at,updated_at,last_login_at) VALUES ('new-account',1,1,1);
          INSERT INTO account_identities VALUES ('new-identity','new-account','GOOGLE','https://accounts.google.com','old-subject',NULL,1,1,1);`)
        const binding=sqliteBinding(db), registry=sqliteBinding(independent)
        const guard=new TrialIdentityRegistry(binding,registry,secret,'v1','staging','source-db')
        await expect(new TrialService(binding,guard).activate('new-account','FAMILY','new-operation',now)).rejects.toThrow('TRIAL_ACCOUNT_USED')
        const env={DB:binding,TOKEN_PEPPER:'local-test-pepper',ALLOWED_ORIGINS:'https://app.test',RESTORE_MAINTENANCE:'true',
          RETENTION_MAINTENANCE:'true',ACCOUNT_DELETION_MAINTENANCE:'true'}
        const before=dump(db)
        expect((await worker.fetch(new Request('https://api.test/health'),env)).status).toBe(503)
        await worker.scheduled({},env)
        expect(dump(db)).toBe(before)
        expect(dump(independent)).toBe(unchanged)
      })
    } finally { independent.close() }
  })
  it.each([
    ["INSERT INTO accounts (id,created_at,updated_at,last_login_at) VALUES ('new',1,1,1)", 'accounts'],
    ["UPDATE legacy_family_memberships SET status='LEFT',ended_at=3 WHERE account_id='b'", 'memberships'],
    ["UPDATE account_identities SET subject='different'", 'identities'],
    ["INSERT INTO families VALUES ('new','New',0,'created')", 'families']
  ])('refuses structural drift rather than attach an old diary to a new owner: %s', async (change, scope) => {
    await expect(prepare(fixture(),fixture(change))).rejects.toThrow('BUSINESS_SCOPE_CHANGED:'+scope)
  })
  it.each([
    ['UPDATE store_subscription_state SET last_verified_at=1', 'BUSINESS_STORE_REFRESH_REQUIRED'],
    ["UPDATE store_subscription_state SET environment='PRODUCTION'", 'BUSINESS_STORE_ENVIRONMENT_MISMATCH'],
    ["UPDATE subscriptions SET status='REVOKED'", 'BUSINESS_GRANT_INCONSISTENT'],
    ['UPDATE account_entitlements SET valid_until=9999999999999', 'BUSINESS_GRANT_INCONSISTENT'],
    ['UPDATE retention_restore_gate SET blocked=1', 'BUSINESS_SOURCE_BLOCKED']
  ])('fails closed for inconsistent current access: %s', async (change, error) => {
    await expect(prepare(fixture(),fixture(paid()+change))).rejects.toThrow(error)
  })
  it('rejects wrong hashes, stale captures and captures before the freeze', async () => {
    const old=fixture(), current=fixture()
    const base=meta(old,current)
    for (const change of [{currentSha256:'wrong'},{frozenAt:now-300001},{currentCapturedAt:now+1},{journalCapturedAt:now-2000},
      {currentCapturedAt:now-500,backupCreatedAt:now}])
      await expect(prepareBusinessRestore({backup:old,current,journal,metadata:{...base,...change},environment:'staging',sourceDatabaseId:'source-db',now}))
        .rejects.toThrow('BUSINESS_CAPTURE_INVALID')
  })
  it('rejects SQL filesystem escape and unexpected schema in the current source', async () => {
    await expect(prepare(fixture(),fixture("ATTACH DATABASE ':memory:' AS other"))).rejects.toThrow()
    await expect(prepare(fixture(),fixture('CREATE TABLE unexpected (id TEXT)'))).rejects.toThrow('BUSINESS_SCHEMA_MISMATCH')
  })
  it('runs the full offline CLI, round-trips the result and refuses an existing output', () => {
    const directory=mkdtempSync(join(tmpdir(),'solemi-business-'))
    try {
      const clock=Date.now(), b=fixture(), c=fixture(), j=journal.replace(String(now-1000),String(clock-1000))
      for (const [name,value] of [['old.sql',b],['current.sql',c],['journal.sql',j],['meta.json',JSON.stringify(meta(b,c,j,clock))]])
        writeFileSync(join(directory,name),value)
      const output=join(directory,'output.sql')
      const args=[fileURLToPath(new URL('../scripts/prepare-business-restore.mjs',import.meta.url)),join(directory,'old.sql'),
        join(directory,'current.sql'),join(directory,'journal.sql'),'staging','source-db',output,join(directory,'meta.json'),'--traffic-frozen']
      const result=spawnSync(process.execPath,args,{encoding:'utf8'})
      expect(result.status,result.stderr).toBe(0)
      const report=JSON.parse(readFileSync(output+'.report.json','utf8'))
      expect(report.outputSha256).toBe(digest(readFileSync(output,'utf8')))
      expect(report.trafficMayResume).toBe(false)
      expect(spawnSync(process.execPath,args,{encoding:'utf8'}).status).not.toBe(0)
      expect(readFileSync(join(directory,'old.sql'),'utf8')).toBe(b)
    } finally {
      for (const file of readdirSync(directory)) unlinkSync(join(directory,file))
      rmdirSync(directory)
    }
  })
})
