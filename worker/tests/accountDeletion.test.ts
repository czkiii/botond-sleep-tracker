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
  binding=sqliteBinding(db); service=new AccountDeletionService(binding)
  account('a'); account('b')
})
afterEach(()=>db.close())

describe('A17 account erasure and recovery',()=>{
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
    const env={DB:binding,TOKEN_PEPPER:'pepper',ALLOWED_ORIGINS:'https://app.test',GOOGLE_CLIENT_ID:'client',AUTH_SECRET:secret,ACCOUNT_DELETION_ENABLED:'true'}
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
