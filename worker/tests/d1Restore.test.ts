import {describe,it,expect} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
// @ts-expect-error Operational Node script.
import {isolatedDatabase,loadSqlExport,dump,digest} from '../scripts/prepare-deletion-restore.mjs'
// @ts-expect-error Operational Node script.
import {prepareD1Restore} from '../scripts/prepare-d1-restore.mjs'
const cloudExport=`PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE z_accounts(id TEXT PRIMARY KEY,provider TEXT NOT NULL);
INSERT INTO z_accounts VALUES('a','GOOGLE');
CREATE TABLE a_devices(id TEXT PRIMARY KEY,account_id TEXT,provider TEXT,FOREIGN KEY(account_id,provider) REFERENCES z_accounts(id,provider));
INSERT INTO a_devices VALUES('d','a','GOOGLE');
CREATE UNIQUE INDEX account_provider ON z_accounts(id,provider);
CREATE TABLE retention_restore_gate(id INTEGER PRIMARY KEY,blocked INTEGER);
INSERT INTO retention_restore_gate VALUES(1,0);
CREATE VIEW active_accounts AS SELECT id FROM z_accounts;
CREATE TRIGGER keep_history BEFORE DELETE ON z_accounts BEGIN SELECT RAISE(ABORT,'KEEP_HISTORY'); END;`
function verified(sql:string){return {format:'solemi-business-restore-v1',outputSha256:digest(sql),businessReconciliationRequired:false,trafficMayResume:false}}
describe('Cloudflare export and D1 restore import',()=>{
 it('loads a real D1 export order with late unique indexes, then enforces foreign keys',()=>{
  const db=isolatedDatabase();try{loadSqlExport(db,cloudExport);expect(db.prepare('PRAGMA foreign_keys').get().foreign_keys).toBe(1);expect(()=>db.exec("INSERT INTO a_devices VALUES('bad','missing','GOOGLE')")).toThrow();}finally{db.close()}
 })
 it('rejects orphan data rather than making a corrupt export acceptable',()=>{
  const db=isolatedDatabase();try{expect(()=>loadSqlExport(db,cloudExport.replace("'d','a'","'d','missing'"))).toThrow('RESTORE_INTEGRITY_FAILED');}finally{db.close()}
 })
 it('rejects an unfinished input transaction that would leave foreign keys disabled',()=>{
  const db=isolatedDatabase();try{expect(()=>loadSqlExport(db,'BEGIN;'+cloudExport)).toThrow('RESTORE_INTEGRITY_FAILED');}finally{db.close()}
 })
 it('refuses cyclic cross-table dependencies instead of emitting an unproven D1 order',()=>{
  const sql=`CREATE TABLE a(id TEXT PRIMARY KEY,b_id TEXT REFERENCES b(id));
    CREATE TABLE b(id TEXT PRIMARY KEY,a_id TEXT REFERENCES a(id));
    CREATE TABLE retention_restore_gate(id INTEGER PRIMARY KEY,blocked INTEGER);
    INSERT INTO retention_restore_gate VALUES(1,0);`
  expect(()=>prepareD1Restore(sql,verified(sql))).toThrow('D1_RESTORE_CYCLIC_SCHEMA_UNSUPPORTED')
 })
 it('orders schema before rows and restores views/triggers with D1 foreign keys always on',()=>{
  const db=isolatedDatabase(),target=new DatabaseSync(':memory:');try{
   loadSqlExport(db,cloudExport);const sql=dump(db), result=prepareD1Restore(sql,verified(sql));
   expect(result.sql).not.toContain('foreign_keys=OFF');
   expect(result.sql.indexOf('CREATE TABLE z_accounts')).toBeLessThan(result.sql.indexOf('CREATE TABLE a_devices'));
   expect(result.sql.indexOf('CREATE UNIQUE INDEX')).toBeLessThan(result.sql.indexOf('INSERT INTO'));
   expect(result.sql.indexOf('CREATE TRIGGER')).toBeGreaterThan(result.sql.lastIndexOf('INSERT INTO'));
   target.exec('PRAGMA foreign_keys=ON; BEGIN;');target.exec(result.sql);target.exec('COMMIT;');
   expect(target.prepare('SELECT * FROM active_accounts').all()).toEqual([{id:'a'}]);
   expect(target.prepare('SELECT * FROM a_devices').all()).toEqual(db.prepare('SELECT * FROM a_devices').all());
   expect(()=>target.exec("DELETE FROM z_accounts WHERE id='a'")).toThrow('KEEP_HISTORY');
   expect(result.report).toMatchObject({inputSha256:digest(sql),outputSha256:digest(result.sql),trafficMayResume:false,remoteApplied:false});
  }finally{db.close();target.close()}
 })
 it('refuses a mismatched/unreconciled report, a business gate and an independent journal',()=>{
  const db=isolatedDatabase();try{
   loadSqlExport(db,cloudExport);let sql=dump(db);
   for(const report of [null,{...verified(sql),outputSha256:'wrong'},{...verified(sql),businessReconciliationRequired:true},{...verified(sql),trafficMayResume:true}])expect(()=>prepareD1Restore(sql,report)).toThrow('D1_RESTORE_VERIFIED_INPUT_REQUIRED');
   db.exec('UPDATE retention_restore_gate SET blocked=1;');sql=dump(db);expect(()=>prepareD1Restore(sql,verified(sql))).toThrow('D1_RESTORE_BUSINESS_BLOCKED');
   db.exec('UPDATE retention_restore_gate SET blocked=0;CREATE TABLE journal_identity(id INTEGER);');sql=dump(db);expect(()=>prepareD1Restore(sql,verified(sql))).toThrow('D1_RESTORE_JOURNAL_FORBIDDEN');
  }finally{db.close()}
 })
})
