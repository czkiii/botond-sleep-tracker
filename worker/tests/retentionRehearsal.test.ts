import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
// @ts-expect-error Offline operational Node script.
import { retentionRehearsal } from '../scripts/prepare-retention-rehearsal.mjs'

const resources={
  source:{name:'solemi-a17-rehearsal-source',id:'11111111-1111-4111-8111-111111111111'},
  journal:{name:'solemi-a17-rehearsal-journal',id:'22222222-2222-4222-8222-222222222222'},
  restore:{name:'solemi-a17-rehearsal-restore',id:'33333333-3333-4333-8333-333333333333'}
}
describe('isolated A17 staging rehearsal preparation',()=>{
  it.each(['1fdd9f64-ea4b-4499-9b6e-636462d51d37','8ace71f6-9c2d-445f-8788-a76bedcdd7bc'])('refuses existing shared or production D1 %s',id=>{
    for (const role of ['source','journal','restore'] as const)
      expect(()=>retentionRehearsal({...resources,[role]:{...resources[role],id}})).toThrow('ISOLATED_REHEARSAL_DATABASES_REQUIRED')
  })
  it('rejects aliases, duplicate IDs, missing roles and unrelated resources',()=>{
    for (const input of [{...resources,journal:{...resources.journal,id:resources.source.id}},
      {...resources,source:{...resources.source,name:'solemi-sleep-db-staging'}},
      {...resources,restore:undefined},{...resources,other:resources.source}]) expect(()=>retentionRehearsal(input)).toThrow()
  })
  it('keeps both candidates frozen with no public endpoint, shared login, cron or copied secrets',()=>{
    const artifacts=retentionRehearsal(resources)
    for (const file of ['source.frozen.jsonc','restored.frozen.jsonc']) {
      const config=JSON.parse(artifacts[file])
      expect(config.name).toBe('solemi-sleep-a17-rehearsal-staging')
      expect(config.workers_dev).toBe(false)
      expect(config.preview_urls).toBe(false)
      expect(config.triggers.crons).toEqual([])
      expect(config.vars).toMatchObject({RESTORE_MAINTENANCE:'true',ACCOUNT_DELETION_ENABLED:'false',
        ACCOUNT_DELETION_MAINTENANCE:'false',RETENTION_MAINTENANCE:'false',ENTITLEMENT_TEST_MODE:'false'})
      expect(config.vars.AUTH_SECRET).toBeUndefined()
      expect(config.vars.GOOGLE_CLIENT_ID).toBeUndefined()
      expect(config.d1_databases[1].database_id).toBe(resources.journal.id)
      expect(config.vars.DELETION_SOURCE_DATABASE_ID).toBe(resources.source.id)
    }
    expect(JSON.parse(artifacts['restored.frozen.jsonc']).d1_databases[0].database_id).toBe(resources.restore.id)
    expect(JSON.parse(artifacts['plan.json']).deploymentAuthorized).toBe(false)
  })
  it('builds the entire fresh source and independent registry without replaying V4 migrations twice',()=>{
    const artifacts=retentionRehearsal(resources), source=new DatabaseSync(':memory:'), journal=new DatabaseSync(':memory:')
    try {
      source.exec(artifacts['source-schema.sql']); journal.exec(artifacts['journal-schema.sql'])
      expect(source.prepare('SELECT blocked FROM retention_restore_gate').get()!.blocked).toBe(0)
      expect(source.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(journal.prepare('SELECT source_database_id FROM journal_identity').get()!.source_database_id).toBe(resources.source.id)
      expect(journal.prepare('SELECT * FROM trial_program').all()).toEqual([])
      expect(source.prepare("SELECT name FROM sqlite_master WHERE name='journal_identity'").get()).toBeUndefined()
      expect(journal.prepare("SELECT name FROM sqlite_master WHERE name='accounts'").get()).toBeUndefined()
      expect(Object.keys(artifacts)).not.toContain('restore-schema.sql')
      expect(JSON.parse(artifacts['plan.json']).sourceSchemaFiles).not.toContain('migrations/002_children_v4.sql')
    } finally { source.close(); journal.close() }
  })
})
