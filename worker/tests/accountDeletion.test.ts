import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { sqliteBinding } from './sqliteD1'
import { AccountDeletionService, RECOVERY_MS, recoveryProof, verifyRecoveryProof } from '../src/accountDeletion'
import { TrialService } from '../src/trialService'
import { AuthService } from '../src/authService'
import worker from '../src/index'
import { SignJWT } from 'jose'
import { StoreBillingService } from '../src/storeBillingService'
import { D1DeletionJournal } from '../src/deletionJournal'

let journalDb: DatabaseSync, journalBinding: D1Database, journalService: D1DeletionJournal
let queries = 0
let db: DatabaseSync, service: AccountDeletionService, binding: D1Database
const now = 1800000000000, secret = 'test-secret-at-least-32-characters-long'
function count(table: string) { return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n) }
function account(id: string) {
  db.prepare(`INSERT INTO accounts (id,email,display_name,avatar_url,locale,created_at,updated_at,last_login_at)
    VALUES (?,?,'Name','https://photo','hu',?,?,?)`).run(id, `${id}@example.test`, now, now, now)
  db.prepare(`INSERT INTO account_identities VALUES (?,?,'GOOGLE','https://accounts.google.com',?,?,1,?,?)`).run(id,id,id,`${id}@example.test`,now,now)
}
function family(two = false) {
  db.exec(`INSERT INTO families VALUES ('f','Family',2,'date');
    INSERT INTO legacy_family_memberships VALUES ('ma','f','a','ADMIN','ACTIVE',1,NULL);
    INSERT INTO devices VALUES ('d','f','secret-device','Laptop','date','date',NULL);
    INSERT INTO children VALUES ('child','f','Baby','2026-01-01','date','date',NULL,1);
    INSERT INTO sleep_sessions VALUES ('sleep','f','child','date',NULL,'Private note',NULL,'date','date',NULL,2);`)
  if (two) db.exec("INSERT INTO legacy_family_memberships VALUES ('mb','f','b','MEMBER','ACTIVE',2,NULL)")
}
function device() {
  db.prepare(`INSERT INTO account_devices VALUES ('ad','a','install','credential','Phone','WEB',?,?,NULL,NULL)`).run(now,now)
  db.prepare(`INSERT INTO account_sessions VALUES ('s','a','ad','refresh',?,?,?,NULL,0)`).run(now,now,now+RECOVERY_MS)
  db.exec(`INSERT INTO account_family_devices VALUES ('ad','a','f','d',1,1);
    INSERT INTO invite_codes VALUES ('invite','f','d','date','z',NULL);`)
}
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(x=>x.endsWith('.sql') && x >= '003').sort())
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
    journalDb = new DatabaseSync(':memory:')
  journalDb.exec(readFileSync(new URL('../erasure-journal/schema.sql', import.meta.url),'utf8'))
  journalDb.exec("INSERT INTO journal_identity VALUES (1,'staging','source-db')")
  queries = 0
  journalBinding = sqliteBinding(journalDb,()=>queries++)
  journalService = new D1DeletionJournal(journalBinding,'staging','source-db')
  binding=sqliteBinding(db,()=>queries++); service=new AccountDeletionService(binding,journalService)
  account('a'); account('b')
})
afterEach(()=>{db.close(); journalDb.close()})

describe('A17 account erasure and recovery',()=>{
  it('bounds the SQL count for immediate erasure and a full maintenance run below the Free ceiling',async()=>{
    family(); device()
    const preview=await service.preview('a')
    queries=0
    await service.request('a','IMMEDIATE',preview,'Family',now)
    // Keep headroom for HTTP authentication; batch statements count individually here.
    expect(queries).toBeLessThanOrEqual(44)
    await service.request('b','RECOVERY',await service.preview('b'),'',now)
    for(let i=0;i<51;i++) db.prepare('INSERT INTO auth_challenges VALUES (?,?,?)').run('old'+i,now-2,now-1)
    queries=0
    await service.maintain(now+RECOVERY_MS)
    expect(queries).toBeLessThanOrEqual(44)
    expect(count('auth_challenges')).toBe(1)
  })
  it('requires an independent journal before accepting a deletion', async()=>{
    const unconfigured = new AccountDeletionService(binding)
    await expect(unconfigured.request('a','IMMEDIATE',await service.preview('a'),'',now)).rejects.toThrow('DELETION_JOURNAL_UNAVAILABLE')
    expect(count('account_deletions')).toBe(0)
  })
  it('does not erase before the independent journal confirms, and resumes after outage', async()=>{
    family()
    const r = await service.request('a','RECOVERY',await service.preview('a'),'Family',now)
    const offline = new AccountDeletionService(binding,{async write(){throw new Error('offline')}})
    await expect(offline.finalize(r.requestId,now+1)).rejects.toThrow('offline')
    expect(count('children')).toBe(1)
    await expect(service.restore('a',r.requestId,now+2)).rejects.toThrow('RECOVERY_UNAVAILABLE')
    await service.finalize(r.requestId,now+3)
    expect(count('children')).toBe(0)
    expect(journalDb.prepare('SELECT state,resolved_at FROM deletion_journal').get()).toEqual({state:'ERASE',resolved_at:now+1})
  })
  it('records the irreversible decision before a failed local purge, idempotently',async()=>{
    family()
    const r=await service.request('a','RECOVERY',await service.preview('a'),'Family',now)
    db.exec("CREATE TRIGGER failure BEFORE DELETE ON children BEGIN SELECT RAISE(ABORT,'failed'); END")
    await expect(service.finalize(r.requestId,now+1)).rejects.toThrow('failed')
    expect(journalDb.prepare('SELECT state FROM deletion_journal').get()!.state).toBe('ERASE')
    await expect(service.restore('a',r.requestId,now+2)).rejects.toThrow('RECOVERY_UNAVAILABLE')
    db.exec('DROP TRIGGER failure')
    await service.maintain(now+3)
    expect(count('children')).toBe(0)
    expect(journalDb.prepare('SELECT COUNT(*) AS n FROM deletion_journal').get()!.n).toBe(1)
  })
  it('resumes a recovery chosen before expiry after journal outage, without a conflicting purge',async()=>{
    const r=await service.request('a','RECOVERY',await service.preview('a'),'',now)
    const offline=new AccountDeletionService(binding,{async write(){throw new Error('offline')}})
    await expect(offline.restore('a',r.requestId,now+1)).rejects.toThrow('offline')
    await expect(service.finalize(r.requestId,now+2)).rejects.toThrow('RECOVERY_IN_PROGRESS')
    expect(await service.maintain(now+RECOVERY_MS+1)).toMatchObject({processed:1,failed:0,dueRemaining:0})
    expect(db.prepare("SELECT status FROM accounts WHERE id='a'").get()!.status).toBe('ACTIVE')
    expect(journalDb.prepare('SELECT state,resolved_at FROM deletion_journal').get()).toEqual({state:'RESTORE',resolved_at:now+1})
  })
  it('retries an unacknowledged request whose initial journal write failed',async()=>{
    const offline=new AccountDeletionService(binding,{async write(){throw new Error('offline')}})
    await expect(offline.request('a','RECOVERY',await service.preview('a'),'',now)).rejects.toThrow('offline')
    expect(journalDb.prepare('SELECT COUNT(*) AS n FROM deletion_journal').get()!.n).toBe(0)
    await service.maintain(now+1)
    expect(journalDb.prepare('SELECT state FROM deletion_journal').get()!.state).toBe('PENDING')
    expect((await service.pending('a'))?.purge_after).toBe(now+RECOVERY_MS)
  })
  it('rejects another environment journal and prevents journal changes after resolution',async()=>{
    const wrong = new AccountDeletionService(binding,new D1DeletionJournal(journalBinding,'production','source-db'))
    await expect(wrong.request('a','RECOVERY',await service.preview('a'),'',now)).rejects.toThrow('DELETION_JOURNAL_IDENTITY_MISMATCH')
    const pending=await service.pending('a')
    await service.finalize(pending!.id,now+1)
    expect(()=>journalDb.exec("UPDATE deletion_journal SET state='RESTORE'")).toThrow('JOURNAL_IMMUTABLE')
    expect(()=>journalDb.exec('DELETE FROM deletion_journal')).toThrow('JOURNAL_APPEND_ONLY')
  })
  it('limits each maintenance run and lets later accounts proceed after a failure',async()=>{
    await service.request('a','RECOVERY',await service.preview('a'),'',now)
    await service.request('b','RECOVERY',await service.preview('b'),'',now+1)
    db.exec("CREATE TRIGGER broken BEFORE DELETE ON account_identities WHEN OLD.account_id='a' BEGIN SELECT RAISE(ABORT,'failed'); END")
    expect(await service.maintain(now+RECOVERY_MS+2)).toMatchObject({processed:0,failed:1,dueRemaining:2})
    expect(await service.maintain(now+RECOVERY_MS+3)).toMatchObject({processed:1,failed:0,dueRemaining:1})
    expect(db.prepare("SELECT status FROM accounts WHERE id='b'").get()!.status).toBe('DELETED')
    expect(db.prepare('SELECT due_remaining FROM deletion_maintenance_runs').get()!.due_remaining).toBe(1)
  })
  it('blocks HTTP and scheduled work during a database restore',async()=>{
    const env={DB:binding,TOKEN_PEPPER:'pepper',ALLOWED_ORIGINS:'https://app.test',RESTORE_MAINTENANCE:'true',ACCOUNT_DELETION_MAINTENANCE:'true'}
    expect((await worker.fetch(new Request('https://api.test/health'),env)).status).toBe(503)
    await worker.scheduled({},env)
    expect(count('deletion_maintenance_runs')).toBe(0)
  })
  it('continues accepted deletion work with the UI flag off and fails closed without the journal',async()=>{
    await service.request('a','RECOVERY',await service.preview('a'),'',Date.now()-RECOVERY_MS-1)
    const env={DB:binding,TOKEN_PEPPER:'pepper',ALLOWED_ORIGINS:'https://app.test',ACCOUNT_DELETION_ENABLED:'false',
      ACCOUNT_DELETION_MAINTENANCE:'true',ERASURE_JOURNAL:journalBinding,SOLEMI_ENVIRONMENT:'staging',DELETION_SOURCE_DATABASE_ID:'source-db'}
    await expect(worker.scheduled({}, {...env,ERASURE_JOURNAL:undefined})).rejects.toThrow('DELETION_JOURNAL_UNAVAILABLE')
    expect(db.prepare("SELECT status FROM accounts WHERE id='a'").get()!.status).toBe('DELETION_PENDING')
    await worker.scheduled({},env)
    expect(db.prepare("SELECT status FROM accounts WHERE id='a'").get()!.status).toBe('DELETED')
  })
  it('makes competing restore and finalization choose exactly one durable decision',async()=>{
    const r=await service.request('a','RECOVERY',await service.preview('a'),'',now)
    let release!: ()=>void, started!: ()=>void
    const ready=new Promise<void>(resolve=>{started=resolve})
    const wait=new Promise<void>(resolve=>{release=resolve})
    const slow=new AccountDeletionService(binding,{async write(record){started(); await wait; await journalService.write(record)}})
    const erase=slow.finalize(r.requestId,now+1)
    await ready
    await expect(service.restore('a',r.requestId,now+2)).rejects.toThrow('RECOVERY_UNAVAILABLE')
    release(); await erase
    expect(journalDb.prepare('SELECT state FROM deletion_journal').get()!.state).toBe('ERASE')
    expect(db.prepare("SELECT status FROM accounts WHERE id='a'").get()!.status).toBe('DELETED')
  })
  it('erases a sole family and identity without resetting its trial ledger', async()=>{
    family(); device()
    const trial = new TrialService(binding)
    await trial.activate('a','FAMILY','trial-op',now)
    await service.request('a','IMMEDIATE',await service.preview('a'),'Family',now+1)
    for (const table of ['families','children','sleep_sessions','account_identities','account_devices','account_sessions','invite_codes'])
      expect(count(table)).toBe(table === 'account_identities' ? 1 : 0)
    expect(db.prepare("SELECT status,email,display_name,avatar_url,locale FROM accounts WHERE id='a'").get())
      .toEqual({status:'DELETED',email:null,display_name:null,avatar_url:null,locale:null})
    expect(count('account_trials')).toBe(1)
    expect(db.prepare('SELECT * FROM erasure_receipts').get()).toMatchObject({account_id:'a',family_id:'f'})
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('keeps another member diary and transfers admin, revoking both auth and legacy tokens',async()=>{
    family(true); device()
    const diary=db.prepare('SELECT * FROM sleep_sessions').all()
    await service.request('a','IMMEDIATE',await service.preview('a'),'',now)
    expect(db.prepare('SELECT * FROM sleep_sessions').all()).toEqual(diary)
    expect(db.prepare("SELECT role FROM legacy_family_memberships WHERE account_id='b'").get()!.role).toBe('ADMIN')
    expect(db.prepare("SELECT name,token_hash,revoked_at FROM devices WHERE id='d'").get()).toEqual({name:null,token_hash:'erased:d',revoked_at:new Date(now).toISOString()})
    expect(count('account_sessions')).toBe(0)
    expect(count('invite_codes')).toBe(0)
  })
  it('offers restricted recovery proof after fresh Google proof, never a normal session',async()=>{
    family(); device()
    const r=await service.request('a','RECOVERY',await service.preview('a'),'Family',now)
    const auth=new AuthService(binding,{secret,clientId:'client'},async()=>({issuer:'https://accounts.google.com',subject:'a',email:'a@example.test',name:'Name',picture:null}))
    const nonce=await auth.challenge(now+1)
    let failure: any
    try { await auth.login({nonce,credential:'proof',installationSecret:'a'.repeat(64),deviceName:'Phone'},now+1) } catch(e) { failure=e }
    expect(failure.code).toBe('ACCOUNT_RECOVERY_REQUIRED')
    expect(await verifyRecoveryProof(secret,failure.data.recoveryToken,now+2)).toEqual({accountId:'a',requestId:r.requestId})
    await expect(auth.authenticate(failure.data.recoveryToken,now+2)).rejects.toThrow('SESSION_INVALID')
    expect(count('account_sessions')).toBe(1)
    expect(db.prepare('SELECT revoked_at FROM account_sessions').get()!.revoked_at).toBe(now)
  })
  it('restores only its suspended sole family, keeps trial deadline and old credentials revoked',async()=>{
    family(); device()
    await new TrialService(binding).activate('a','FAMILY','trial-op',now)
    db.prepare(`INSERT INTO account_entitlements VALUES ('grant','a','PDF_EXPORT','ADMIN','test',?,?,NULL,?,?)`).run(now,now+RECOVERY_MS,now,now)
    const r=await service.request('a','RECOVERY',await service.preview('a'),'Family',now+1)
    expect((await service.preview('b')).family).toBeNull()
    await service.restore('a',r.requestId,now+2)
    expect((await service.preview('a')).family?.id).toBe('f')
    expect(db.prepare('SELECT revoked_at FROM account_sessions').get()!.revoked_at).toBe(now+1)
    expect(db.prepare('SELECT revoked_at FROM account_entitlements').get()!.revoked_at).toBe(now+1)
    expect(db.prepare('SELECT ends_at FROM account_trials').get()!.ends_at).toBe(now+7*86400000)
    await expect(service.restore('a',r.requestId,now+3)).rejects.toThrow('RECOVERY_UNAVAILABLE')
  })
  it('does not rejoin a shared family on recovery',async()=>{
    family(true)
    const r=await service.request('a','RECOVERY',await service.preview('a'),'',now)
    await service.restore('a',r.requestId,now+1)
    expect((await service.preview('a')).family).toBeNull()
    expect(count('children')).toBe(1)
  })
  it('purges at the exact deadline and never extends it through retries',async()=>{
    family()
    const r=await service.request('a','RECOVERY',await service.preview('a'),'Family',now)
    expect(await service.purgeDue(now+RECOVERY_MS-1)).toBe(0)
    await expect(service.restore('a',r.requestId,now+RECOVERY_MS)).rejects.toThrow('RECOVERY_EXPIRED')
    expect(count('children')).toBe(0)
    await service.finalize(r.requestId,now+RECOVERY_MS+1)
    expect(count('erasure_receipts')).toBe(1)
  })
  it('can finalize recovery early and the old recovery proof cannot restore later requests',async()=>{
    const r=await service.request('a','RECOVERY',await service.preview('a'),'',now)
    await service.finalize(r.requestId,now+1)
    await expect(service.restore('a',r.requestId,now+2)).rejects.toThrow('RECOVERY_UNAVAILABLE')
    const token=await recoveryProof(secret,'a',r.requestId,now)
    await expect(verifyRecoveryProof(secret,token,now+600000)).rejects.toThrow('RECOVERY_PROOF_INVALID')
  })
  it.each(['join','write','leave'])('rejects a changed %s snapshot without partial revocation',async(change)=>{
    family(); device()
    const preview=await service.preview('a')
    if(change==='join') db.exec("INSERT INTO legacy_family_memberships VALUES ('mb','f','b','MEMBER','ACTIVE',2,NULL)")
    if(change==='write') db.exec('UPDATE families SET revision=revision+1')
    if(change==='leave') db.exec("UPDATE legacy_family_memberships SET status='LEFT',ended_at=1")
    await expect(service.request('a','IMMEDIATE',preview,'Family',now)).rejects.toThrow('DELETION_PREVIEW_CHANGED')
    expect(count('account_deletions')).toBe(0)
    expect(db.prepare("SELECT status FROM accounts WHERE id='a'").get()!.status).toBe('ACTIVE')
    expect(db.prepare('SELECT revoked_at FROM account_sessions').get()!.revoked_at).toBeNull()
  })
  it('rolls back a purge SQL failure and can retry the retained pending request',async()=>{
    family(); device()
    const r=await service.request('a','RECOVERY',await service.preview('a'),'Family',now)
    db.exec("CREATE TRIGGER fail_purge BEFORE DELETE ON children BEGIN SELECT RAISE(ABORT,'test-failure'); END")
    await expect(service.finalize(r.requestId,now+1)).rejects.toThrow('test-failure')
    expect((await service.pending('a'))?.id).toBe(r.requestId)
    expect(count('sleep_sessions')).toBe(1)
    expect(count('erasure_receipts')).toBe(0)
    db.exec('DROP TRIGGER fail_purge')
    await service.finalize(r.requestId,now+2)
    expect(count('children')).toBe(0)
  })
  it('exports account and shared diary without tokens, identities or other adults private data',async()=>{
    family(true); device()
    const result=await service.exportAccount('a',now), json=JSON.stringify(result)
    expect(result.sleeps).toHaveLength(1)
    for (const value of ['b@example.test','secret-device','credential','refresh','installation_hash','subject']) expect(json).not.toContain(value)
    expect(result.includesLocalDiaryOrPhotos).toBe(false)
  })
  it('keeps public deletion routes disabled until release configuration is ready',async()=>{
    const env={DB:binding,TOKEN_PEPPER:'pepper',ALLOWED_ORIGINS:'https://app.test',GOOGLE_CLIENT_ID:'client',AUTH_SECRET:secret}
    const response=await worker.fetch(new Request('https://api.test/v1/auth/account/delete',{method:'POST',headers:{Origin:'https://app.test'}}),env)
    expect(response.status).toBe(404)
  })
  it('replays a separately retained erasure receipt after restoring an older backup',async()=>{
    family(); device()
    const receipts = [{account_id:'a',family_id:'f',erased_at:now}]
    await service.replayErasure(receipts[0])
    expect(count('children')).toBe(0)
    expect(db.prepare("SELECT status,email FROM accounts WHERE id='a'").get()).toEqual({status:'DELETED',email:null})
    await service.replayErasure(receipts[0])
    expect(count('erasure_receipts')).toBe(1)
  })
  it('fails closed on a restore whose family scope differs from the receipt',async()=>{
    family(true)
    await expect(service.replayErasure({account_id:'a',family_id:'f',erased_at:now})).rejects.toThrow('ERASURE_REPLAY_SCOPE_CHANGED')
    expect(count('children')).toBe(1)
    expect(count('account_deletions')).toBe(0)
  })
  it('drains only due deletions, expires old auth data and keeps active accounts untouched',async()=>{
    await service.request('a','RECOVERY',await service.preview('a'),'',now)
    db.prepare('INSERT INTO auth_challenges VALUES (?,?,?)').run('old',now-2,now-1)
    db.prepare('INSERT INTO auth_challenges VALUES (?,?,?)').run('new',now,now+2*RECOVERY_MS)
    expect(await service.purgeDue(now+RECOVERY_MS)).toBe(1)
    expect(count('auth_challenges')).toBe(1)
    expect(db.prepare("SELECT status FROM accounts WHERE id='b'").get()!.status).toBe('ACTIVE')
  })
  it('enforces the authenticated endpoint, origin, confirmation, and recovery-only proof boundary',async()=>{
    family(); device()
    const time=Date.now()
    db.prepare("UPDATE account_sessions SET created_at=?,expires_at=?").run(time-1000,time+600000)
    const token=await new SignJWT({sid:'s',did:'ad'}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setIssuer('solemi-auth')
      .setAudience('solemi-account').setSubject('a').setIssuedAt(Math.floor(time/1000)).setExpirationTime(Math.floor(time/1000)+300).sign(new TextEncoder().encode(secret))
    const env={DB:binding,TOKEN_PEPPER:'pepper',ALLOWED_ORIGINS:'https://app.test',GOOGLE_CLIENT_ID:'client',AUTH_SECRET:secret,ACCOUNT_DELETION_ENABLED:'true',ACCOUNT_DELETION_MAINTENANCE:'true',ERASURE_JOURNAL:journalBinding,SOLEMI_ENVIRONMENT:'staging',DELETION_SOURCE_DATABASE_ID:'source-db',API_LIMITER:{limit:async()=>({success:true})},AUTH_LIMITER:{limit:async()=>({success:true})},INVITE_LIMITER:{limit:async()=>({success:true})}}
    const call=(path:string,method='GET',data?:unknown,auth=token,origin='https://app.test')=>worker.fetch(new Request(`https://api.test/v1/auth/account/${path}`,
      {method,headers:{Origin:origin,Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),env)
    expect((await call('export','GET',undefined,'bad')).status).toBe(401)
    const preview=await service.preview('a')
    expect((await call('delete','POST',{mode:'IMMEDIATE',preview,familyName:'Family'},token,'https://evil.test')).status).toBe(403)
    expect((await call('delete','POST',{mode:'IMMEDIATE',preview,familyName:'wrong'})).status).toBe(400)
    const response=await call('delete','POST',{mode:'RECOVERY',preview,familyName:'Family'})
    expect(response.status).toBe(200)
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect((await call('export')).status).toBe(401)
    const pending=await service.pending('a'), proof=await recoveryProof(secret,'a',pending!.id,time)
    expect((await call('export','GET',undefined,proof)).status).toBe(401)
    expect((await call('restore','POST',{},token)).status).toBe(401)
    expect((await call('restore','POST',{},proof)).status).toBe(200)
    expect(count('account_family_devices')).toBe(0)
    expect((await call('restore','POST',{},proof)).status).toBe(409)
  })
  it('does not expose a retained billing alias or accept a late grant while recovery is pending',async()=>{
    const billing=new StoreBillingService(binding,'SANDBOX')
    await billing.getOrCreateAccountLink('a','APPLE',now)
    const r=await service.request('a','RECOVERY',await service.preview('a'),'',now+1)
    await expect(billing.getOrCreateAccountLink('a','APPLE',now+2)).rejects.toThrow('Active account is required')
    expect(()=>db.prepare(`INSERT INTO account_entitlements VALUES ('late','a','PDF_EXPORT','ADMIN','test',?,?,NULL,?,?)`)
      .run(now,now+RECOVERY_MS,now,now)).toThrow('ACCOUNT_UNAVAILABLE')
    await service.restore('a',r.requestId,now+3)
    expect(count('account_entitlements')).toBe(0)
  })
  it('does not reset the family trial count after permanent account deletion',async()=>{
    family(true)
    await new TrialService(binding).activate('a','FAMILY','trial-op',now)
    await service.request('a','IMMEDIATE',await service.preview('a'),'',now+1)
    const state=await new TrialService(binding).state('b',now+7*86400000)
    expect(state).toMatchObject({used:false})
    expect(db.prepare("SELECT COUNT(*) AS n FROM account_trials WHERE family_id='f'").get()!.n).toBe(1)
    expect(db.prepare("SELECT * FROM account_identities WHERE subject='a'").get()).toBeUndefined()
  })
})
