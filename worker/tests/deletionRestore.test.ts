import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { RetentionService } from '../src/retention'
import { sqliteBinding } from './sqliteD1'
// @ts-expect-error Operational Node script intentionally remains executable without transpilation.
import { prepareDeletionRestore } from '../scripts/prepare-deletion-restore.mjs'
// @ts-expect-error Operational Node script.
import { deletionConfig } from '../scripts/prepare-deletion-config.mjs'

const now = 1800000000000, duration = 2592000000
function backup() {
  return readFileSync(new URL('../schema.sql',import.meta.url),'utf8') + '\n' +
    readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql') && x>='003').sort()
      .map(x=>readFileSync(new URL('../migrations/'+x,import.meta.url),'utf8')).join('\n') + `
    INSERT INTO accounts (id,email,created_at,updated_at,last_login_at) VALUES ('a','private@example.test',1,1,1),('b','keep@example.test',1,1,1);
    INSERT INTO account_identities VALUES ('ia','a','GOOGLE','https://accounts.google.com','subject','private@example.test',1,1,1);
    INSERT INTO families VALUES ('f','Family',2,'date');
    INSERT INTO legacy_family_memberships VALUES ('m','f','a','ADMIN','ACTIVE',1,NULL);
    INSERT INTO children VALUES ('child','f','Baby','2026-01-01','date','date',NULL,1);
    INSERT INTO sleep_sessions VALUES ('sleep','f','child','date',NULL,'Private note',NULL,'date','date',NULL,2);
    INSERT INTO account_devices VALUES ('ad','a','install','credential','Phone','WEB',1,1,NULL,NULL);
    INSERT INTO account_sessions VALUES ('session','a','ad','refresh',1,1,${now+duration},NULL,0);`
}
function journal(state = 'ERASE', family: string | null = 'f') {
  return readFileSync(new URL('../erasure-journal/schema.sql',import.meta.url),'utf8') + `
    INSERT INTO journal_identity VALUES (1,'staging','source-db');
    INSERT INTO deletion_journal VALUES (2,'request','a',${family === null ? 'NULL' : "'"+family+"'"},${now-100},${now-100+duration},'${state}',${state==='PENDING'?'NULL':now-1});`
}
const metadata = (b: string, j: string, at = now) => ({ environment:'staging', sourceDatabaseId:'source-db',
  backupCreatedAt:at-86400000, journalCapturedAt:at, backupSha256:createHash('sha256').update(b).digest('hex'),
  journalSha256:createHash('sha256').update(j).digest('hex') })
const prepare = (b=backup(), j=journal()) => prepareDeletionRestore({backup:b,journal:j,environment:'staging',sourceDatabaseId:'source-db',metadata:metadata(b,j),now})
function inspect(sql: string, fn: (db: DatabaseSync)=>void) { const db=new DatabaseSync(':memory:'); try { db.exec(sql); fn(db) } finally { db.close() } }

describe('offline erasure-aware restore preparation',()=>{
  it('retains the original final erasure request so scheduled retention can confirm completion', async () => {
    const log = journal() + '\n' + readFileSync(new URL('../erasure-journal/002_retention.sql', import.meta.url),'utf8')
    const result = await prepare(backup(),log)
    const restored = new DatabaseSync(':memory:'), registry = new DatabaseSync(':memory:')
    try {
      restored.exec(result.sql); registry.exec(log)
      expect(restored.prepare('SELECT id,mode,requested_at,purge_after,state FROM account_deletions').all()).toEqual([
        {id:'request',mode:'RECOVERY',requested_at:now-100,purge_after:now-100+duration,state:'FINALIZED'}
      ])
      await new RetentionService(sqliteBinding(restored),sqliteBinding(registry),'staging','source-db').journalStep(now)
      expect(registry.prepare('SELECT request_id,completed_at FROM deletion_completion').get()).toEqual({request_id:'request',completed_at:now})
      expect((await prepare(result.sql,log)).sql).toBe(result.sql)
    } finally { restored.close(); registry.close() }
  })

  it('rejects missing/stale metadata, 30-day-old backups and stale independent journal captures', async () => {
    const b = backup(), j = journal(), base = metadata(b, j)
    for (const meta of [undefined, { ...base, backupCreatedAt: now - duration },
      { ...base, journalCapturedAt: now - 300001 }, { ...base, backupSha256: 'wrong' }, { ...base, sourceDatabaseId: 'other' }]) {
      await expect(prepareDeletionRestore({ backup:b, journal:j, environment:'staging', sourceDatabaseId:'source-db', metadata:meta, now }))
        .rejects.toThrow('RESTORE_RETENTION_METADATA_INVALID')
    }
  })
  it('locks old trial/paid grants until current business history is reconciled', async () => {
    const result = await prepare()
    inspect(result.sql, db => expect(db.prepare('SELECT blocked FROM retention_restore_gate').get()!.blocked).toBe(1))
    expect(result.report.businessReconciliationRequired).toBe(true)
  })
  it('rejects attached databases, filesystem exports and unsafe pragmas in either SQL input',async()=>{
    for (const sql of ["ATTACH DATABASE ':memory:' AS other;", "VACUUM INTO ':memory:';", 'PRAGMA writable_schema=ON;']) {
      await expect(prepare(sql+backup())).rejects.toThrow()
      await expect(prepare(backup(),sql+journal())).rejects.toThrow()
    }
  })
  it('uses persistent request sequence even when export inserts older decisions last',async()=>{
    const older=`INSERT INTO deletion_journal VALUES (1,'older','a','f',${now-200},${now-200+duration},'RESTORE',${now-150});`
    const result=await prepare(backup(),journal('PENDING')+older)
    inspect(result.sql,db=>{
      expect(db.prepare("SELECT status FROM accounts WHERE id='a'").get()!.status).toBe('DELETION_PENDING')
      expect(db.prepare('SELECT id FROM account_deletions').get()!.id).toBe('request')
    })
  })
  it('preserves embedded zero bytes in unaffected text during the SQL round trip',async()=>{
    const result=await prepare(backup()+"UPDATE accounts SET display_name=CAST(X'610062' AS TEXT) WHERE id='b';")
    inspect(result.sql,db=>expect(db.prepare("SELECT hex(display_name) AS value FROM accounts WHERE id='b'").get()!.value).toBe('610062'))
  })
  it('runs the actual offline CLI and never overwrites an existing prepared artifact',()=>{
    const directory=mkdtempSync(join(tmpdir(),'solemi-erasure-'))
    const input=join(directory,'backup.sql'), external=join(directory,'journal.sql'), output=join(directory,'prepared.sql'), meta=join(directory,'metadata.json')
    try {
      writeFileSync(input,backup())
      // Fixtures must be in the past relative to the real CLI clock.
      const clock=Date.now()
      writeFileSync(external,journal().replaceAll(String(now-100),String(clock-2000))
        .replaceAll(String(now-100+duration),String(clock-2000+duration)).replaceAll(String(now-1),String(clock-1000)))
      writeFileSync(meta, JSON.stringify(metadata(readFileSync(input,'utf8'),readFileSync(external,'utf8'),clock)))
      const args=[fileURLToPath(new URL('../scripts/prepare-deletion-restore.mjs',import.meta.url)),input,external,'staging','source-db',output,meta,'--traffic-frozen']
      const result=spawnSync(process.execPath,args,{encoding:'utf8'})
      expect(result.status,result.stderr).toBe(0)
      const prepared=readFileSync(output,'utf8')
      expect(JSON.parse(readFileSync(output+'.report.json','utf8')).remoteApplied).toBe(false)
      expect(spawnSync(process.execPath,args,{encoding:'utf8'}).status).not.toBe(0)
      expect(readFileSync(output,'utf8')).toBe(prepared)
      expect(readFileSync(input,'utf8')).toBe(backup())
    } finally {
      for (const file of readdirSync(directory)) unlinkSync(join(directory,file))
      rmdirSync(directory)
    }
  })
  it('applies an independent final erasure to an older diary backup and creates content-free evidence',async()=>{
    const result=await prepare()
    inspect(result.sql,db=>{
      expect(db.prepare("SELECT email,status FROM accounts WHERE id='a'").get()).toEqual({email:null,status:'DELETED'})
      expect(db.prepare("SELECT email FROM accounts WHERE id='b'").get()!.email).toBe('keep@example.test')
      expect(db.prepare('SELECT * FROM sleep_sessions').all()).toHaveLength(0)
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    })
    expect(JSON.stringify(result.report)).not.toMatch(/private@example|Private note|refresh|Baby/)
    expect(result.report.remoteApplied).toBe(false)
    expect(result.report.outputSha256).toHaveLength(64)
  })
  it('keeps a still-recoverable request inactive with its original deadline',async()=>{
    const result=await prepare(backup(),journal('PENDING'))
    inspect(result.sql,db=>{
      expect(db.prepare("SELECT status FROM accounts WHERE id='a'").get()!.status).toBe('DELETION_PENDING')
      expect(db.prepare('SELECT purge_after FROM account_deletions').get()!.purge_after).toBe(now-100+duration)
      expect(db.prepare('SELECT * FROM children').all()).toHaveLength(1)
      expect(db.prepare('SELECT revoked_at FROM account_sessions').get()!.revoked_at).not.toBeNull()
    })
  })
  it('replays an already chosen recovery without resurrecting old access credentials',async()=>{
    const result=await prepare(backup(),journal('RESTORE'))
    inspect(result.sql,db=>{
      expect(db.prepare("SELECT status FROM accounts WHERE id='a'").get()!.status).toBe('ACTIVE')
      expect(db.prepare('SELECT * FROM children').all()).toHaveLength(1)
      expect(db.prepare('SELECT revoked_at FROM account_sessions').get()!.revoked_at).not.toBeNull()
      expect(db.prepare("SELECT COUNT(*) AS n FROM legacy_family_memberships WHERE status='ACTIVE'").get()!.n).toBe(1)
    })
    const again=await prepare(result.sql,journal('RESTORE'))
    expect(again.sql).toBe(result.sql)
  })
  it('does not guess when an expired pending journal has not been resolved',async()=>{
    await expect(prepare(backup(),journal('PENDING').replace(String(now-100+duration),String(now-100))))
      .rejects.toThrow('RESTORE_JOURNAL_UNRESOLVED_IMMEDIATE')
  })
  it('refuses another environment and an incomplete journal',async()=>{
    await expect(prepare(backup(),journal().replace("VALUES (1,'staging'","VALUES (1,'production'"))).rejects.toThrow('RESTORE_IDENTITY_MISMATCH')
    const incomplete=backup()+`INSERT INTO account_deletions (id,account_id,mode,requested_at,purge_after) VALUES ('missing','b','IMMEDIATE',1,1);`
    await expect(prepare(incomplete)).rejects.toThrow('RESTORE_JOURNAL_INCOMPLETE')
  })
  it('refuses to erase a different family scope instead of producing a publishable output',async()=>{
    const changed=backup()+"INSERT INTO legacy_family_memberships VALUES ('mb','f','b','MEMBER','ACTIVE',2,NULL);"
    await expect(prepare(changed)).rejects.toThrow('ERASURE_REPLAY_SCOPE_CHANGED')
  })
  it('does not ignore a deleted family when its owner did not exist in the older backup',async()=>{
    await expect(prepare(backup(),journal().replace("'request','a'","'request','missing-account'"))).rejects.toThrow('ERASURE_REPLAY_SCOPE_CHANGED')
  })
  it('generates an inactive candidate with a separate binding and an explicit cron',()=>{
    const base=JSON.parse(readFileSync(new URL('../wrangler.staging.jsonc',import.meta.url),'utf8'))
    base.d1_databases=base.d1_databases.filter((db:{binding:string})=>db.binding!=='ERASURE_JOURNAL')
    const candidate=deletionConfig(base,'11111111-1111-4111-8111-111111111111')
    expect(candidate.vars.ACCOUNT_DELETION_ENABLED).toBe('false')
    expect(candidate.vars.ACCOUNT_DELETION_MAINTENANCE).toBe('false')
    expect(candidate.triggers.crons).toContain('*/5 * * * *')
    expect(candidate.d1_databases).toHaveLength(2)
    expect(()=>deletionConfig(base,base.d1_databases[0].database_id)).toThrow('DISTINCT_JOURNAL_DATABASE_REQUIRED')
    expect(()=>deletionConfig(candidate,'22222222-2222-4222-8222-222222222222')).toThrow('JOURNAL_ALREADY_CONFIGURED')
  })
  it('keeps shared staging public activation off while wiring independent maintenance',()=>{
    const config=JSON.parse(readFileSync(new URL('../wrangler.staging.jsonc',import.meta.url),'utf8'))
    const primary=config.d1_databases.find((db:{binding:string})=>db.binding==='DB')
    const journal=config.d1_databases.find((db:{binding:string})=>db.binding==='ERASURE_JOURNAL')
    expect(config.vars.SOLEMI_ENVIRONMENT).toBe('staging')
    expect(journal.database_id).not.toBe(primary.database_id)
    expect(config.vars.DELETION_SOURCE_DATABASE_ID).toBe(primary.database_id)
    expect(config.vars.TRIAL_IDENTITY_KEY_VERSION).toBe('v1')
    expect(config.vars).not.toHaveProperty('TRIAL_IDENTITY_SECRET')
    expect(config.vars.ACCOUNT_DELETION_ENABLED).toBe('false')
    expect(config.vars.TRIAL_ENABLED).toBe('false')
    expect(config.vars.RESTORE_MAINTENANCE).toBe('false')
    expect(config.vars.ACCOUNT_DELETION_MAINTENANCE).toBe('true')
    expect(config.vars.RETENTION_MAINTENANCE).toBe('true')
    expect(config.triggers.crons).toEqual(['*/5 * * * *', '2-59/5 * * * *'])
    expect(config.vars.STORE_NOTIFICATIONS_ENABLED).toBe('false')
    expect(config.vars.STORE_RECONCILIATION_ENABLED).toBe('false')
  })
})
