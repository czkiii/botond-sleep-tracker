import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
// @ts-expect-error Offline operational script.
import { productionPackage, writePrivatePackage } from '../scripts/prepare-production-v4.mjs'
// @ts-expect-error Offline operational script.
import { transitionAccess } from '../scripts/prepare-transition-access.mjs'
import { assertProductionReleaseConfiguration } from '../../src/releaseConfiguration'
import { EntitlementService } from '../src/entitlementService'
import { sqliteBinding } from './sqliteD1'

const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const input={databaseId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',journalId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  workerOrigin:'https://solemi-sleep-sync-v4.example.workers.dev',googleClientId:'123-example.apps.googleusercontent.com',
  publicJwk:key.publicKey.export({format:'jwk'}),buildSha:'a'.repeat(40)}
const accountId='acc_'+ '1'.repeat(32), secondId='acc_'+ '2'.repeat(32), startsAt=1800000000000
const access={accountId,verifiedEmail:'owner@example.test',startsAt}
const artifacts=productionPackage(input)
function database() {
  const db=new DatabaseSync(':memory:')
  db.exec(artifacts['source-schema.sql'])
  for (const id of [accountId,secondId]) {
    db.prepare("INSERT INTO accounts(id,status,created_at,updated_at,last_login_at) VALUES (?,'ACTIVE',?,?,?)").run(id,startsAt,startsAt,startsAt)
    db.prepare(`INSERT INTO account_identities VALUES (?,?,'GOOGLE','https://accounts.google.com',?,? ,1,?,?)`)
      .run('identity_'+id,id,id,'owner@example.test',startsAt,startsAt)
  }
  return db
}
describe('new production preparation',()=>{
  it('aligns app origin, proxy, frontend and new isolated resources with activation frozen',()=>{
    const config=JSON.parse(artifacts['worker.frozen.jsonc']), manifest=JSON.parse(artifacts['manifest.json'])
    expect(config.name).toBe('solemi-sleep-sync-v4')
    expect(config.vars).toMatchObject({SOLEMI_ENVIRONMENT:'production',ALLOWED_ORIGINS:'https://app.solemi-sleep.app',
      RESTORE_MAINTENANCE:'true',TRIAL_ENABLED:'false',ENTITLEMENT_TEST_MODE:'false',ACCOUNT_DELETION_ENABLED:'false',
      ACCOUNT_DELETION_MAINTENANCE:'false',RETENTION_MAINTENANCE:'false',DELETION_SOURCE_DATABASE_ID:input.databaseId})
    expect(config.triggers.crons).toEqual([])
    expect(config.preview_urls).toBe(false)
    expect(config.limits).toBeUndefined()
    expect(config.ratelimits.map((x: {namespace_id:string})=>x.namespace_id)).toEqual(['19400','19401','19402'])
    expect(config.d1_databases.map((x: {database_id:string})=>x.database_id)).toEqual([input.databaseId,input.journalId])
    const frontend=Object.fromEntries(artifacts['frontend.env.local'].trim().split('\n').map((line:string)=>{
      const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)]
    }))
    expect(()=>assertProductionReleaseConfiguration(frontend)).not.toThrow()
    expect(frontend.VITE_SYNC_API_BASE).toBe(JSON.parse(artifacts['pages-production-vars.json']).SOLEMI_API_ORIGIN)
    expect(JSON.parse(frontend.VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK).d).toBeUndefined()
    expect(manifest.remoteApplied).toBe(false)
    expect(config.vars.AUTH_SECRET).toBeUndefined()
  })
  it.each(['8ace71f6-9c2d-445f-8788-a76bedcdd7bc','1fdd9f64-ea4b-4499-9b6e-636462d51d37','2d932996-4b9b-4a78-87fb-34a79acfd700'])('rejects existing DB %s in either role',id=>{
    for (const role of ['databaseId','journalId']) expect(()=>productionPackage({...input,[role]:id})).toThrow()
  })
  it('rejects duplicate/placeholder IDs, legacy upstream, private keys and uncommitted release identity',()=>{
    for (const changes of [{journalId:input.databaseId},{databaseId:'NEW_UUID'},
      {workerOrigin:'https://solemi-sleep-sync.example.workers.dev'},
      {workerOrigin:input.workerOrigin+'/api'}, {buildSha:'local'},
      {publicJwk:key.privateKey.export({format:'jwk'})}, {googleClientId:'example\nSECRET=value'}])
      expect(()=>productionPackage({...input,...changes})).toThrow()
    expect(()=>writePrivatePackage('public/production-package',artifacts)).toThrow()
  })
  it('initializes separate fresh schemas with production journal identity and unprovisioned programme',()=>{
    const source=new DatabaseSync(':memory:'), journal=new DatabaseSync(':memory:')
    try {
      source.exec(artifacts['source-schema.sql']);journal.exec(artifacts['journal-schema.sql'])
      expect(source.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(source.prepare("SELECT name FROM sqlite_master WHERE name='journal_identity'").get()).toBeUndefined()
      expect(journal.prepare('SELECT * FROM journal_identity').get()).toMatchObject({environment:'production',source_database_id:input.databaseId})
      expect(journal.prepare('SELECT * FROM trial_program').all()).toEqual([])
      expect(JSON.parse(artifacts['manifest.json']).sourceSchemaFiles).not.toContain('migrations/002_children_v4.sql')
    } finally {source.close();journal.close()}
  })
})
describe('one-off transition access',()=>{
  it('grants all three features for exactly 90 days without billing or trial records',async()=>{
    const db=database()
    try {
      db.exec(transitionAccess(access)['grant.sql'])
      const rows=db.prepare('SELECT * FROM account_entitlements').all()
      expect(rows).toHaveLength(3)
      for (const row of rows) expect(row).toMatchObject({account_id:accountId,source_type:'ADMIN',valid_from:startsAt,valid_until:startsAt+90*86400000,revoked_at:null})
      expect(db.prepare('SELECT * FROM account_trials').all()).toEqual([])
      expect(db.prepare('SELECT * FROM subscriptions').all()).toEqual([])
      const service=new EntitlementService(sqliteBinding(db))
      expect(await service.accountFeatures(accountId,startsAt-1)).toHaveLength(0)
      expect(await service.accountFeatures(accountId,startsAt)).toHaveLength(3)
      expect(await service.accountFeatures(accountId,startsAt+90*86400000-1)).toHaveLength(3)
      expect(await service.accountFeatures(accountId,startsAt+90*86400000)).toHaveLength(0)
      db.exec("INSERT INTO families VALUES ('family','Example',0,'2026-10-22')")
      db.prepare("INSERT INTO legacy_family_memberships VALUES ('admin','family',?,'ADMIN','ACTIVE',?,NULL)").run(accountId,startsAt)
      db.prepare("INSERT INTO legacy_family_memberships VALUES ('member','family',?,'MEMBER','ACTIVE',?,NULL)").run(secondId,startsAt)
      expect((await service.accessState(secondId,startsAt)).features).toEqual(['FAMILY_PLUS_INSIGHTS','FAMILY_SYNC','PDF_EXPORT'])
      db.exec("UPDATE legacy_family_memberships SET status='LEFT',ended_at=1800000000000 WHERE id='admin'")
      expect((await service.accessState(secondId,startsAt)).features).toHaveLength(0)
      db.prepare('UPDATE account_entitlements SET revoked_at=?,updated_at=?').run(startsAt,startsAt)
      expect(await service.accountFeatures(accountId,startsAt)).toHaveLength(0)
    } finally {db.close()}
  })
  it('refuses replay, renewed end time and a second recipient without changing the original grant',()=>{
    const db=database()
    try {
      db.exec(transitionAccess(access)['grant.sql'])
      const before=db.prepare('SELECT * FROM account_entitlements').all()
      for (const candidate of [access,{...access,startsAt:startsAt+86400000},{...access,accountId:secondId}])
        expect(()=>db.exec(transitionAccess(candidate)['grant.sql'])).toThrow()
      expect(db.prepare('SELECT * FROM account_entitlements').all()).toEqual(before)
    } finally {db.close()}
  })
  it.each(['wrong_email','unverified','pending','restore_blocked','missing_identity'])('rejects %s atomically',scenario=>{
    const db=database()
    try {
      if (scenario==='unverified') db.exec('UPDATE account_identities SET email_verified=0')
      if (scenario==='pending') db.exec("UPDATE accounts SET status='DELETION_PENDING'")
      if (scenario==='restore_blocked') db.exec('UPDATE retention_restore_gate SET blocked=1')
      if (scenario==='missing_identity') db.exec('DELETE FROM account_identities')
      const candidate=scenario==='wrong_email'?{...access,verifiedEmail:'other@example.test'}:access
      expect(()=>db.exec(transitionAccess(candidate)['grant.sql'])).toThrow()
      expect(db.prepare('SELECT * FROM account_entitlements').all()).toEqual([])
    } finally {db.close()}
  })
})
