// Prepares reviewable local files only. No Cloudflare calls or deployments.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import { resolve, dirname, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const names = {source:'solemi-a17-rehearsal-source', journal:'solemi-a17-rehearsal-journal', restore:'solemi-a17-rehearsal-restore'}
const workerName = 'solemi-sleep-a17-rehearsal-staging'
const protectedIds = new Set(['1fdd9f64-ea4b-4499-9b6e-636462d51d37','8ace71f6-9c2d-445f-8788-a76bedcdd7bc'])
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const hash = text => createHash('sha256').update(text).digest('hex')

export function retentionRehearsal(resources) {
  if (!resources || Object.keys(resources).sort().join(',') !== 'journal,restore,source') throw new Error('EXACT_REHEARSAL_RESOURCES_REQUIRED')
  const ids = new Set()
  for (const role of Object.keys(names)) {
    const db = resources[role]
    if (!db || db.name !== names[role] || typeof db.id !== 'string' || !uuid.test(db.id)
      || protectedIds.has(db.id) || ids.has(db.id)) throw new Error('ISOLATED_REHEARSAL_DATABASES_REQUIRED')
    ids.add(db.id)
  }
  const files = ['schema.sql', ...readdirSync(resolve(workerRoot,'migrations')).filter(x => x.endsWith('.sql') && x >= '003').sort().map(x=>'migrations/'+x)]
  // schema.sql already represents V4. Reapplying 001/002 on a new database
  // would duplicate existing columns/tables. Existing staging is NEVER seeded.
  const sourceSql = files.map(file=>readFileSync(resolve(workerRoot,file),'utf8')).join('\n')
  const journalSql = ['erasure-journal/schema.sql','erasure-journal/002_retention.sql']
    .map(file=>readFileSync(resolve(workerRoot,file),'utf8')).join('\n')
    + `\nINSERT INTO journal_identity VALUES (1,'staging','${resources.source.id}');\n`
  const config = role => ({
    name:workerName, main:resolve(workerRoot,'src/index.ts'), compatibility_date:'2026-08-22', compatibility_flags:['nodejs_compat'],
    workers_dev:false, preview_urls:false,
    vars:{SOLEMI_ENVIRONMENT:'staging', ALLOWED_ORIGINS:'https://solemi-a17-rehearsal.invalid',
      ACCOUNT_FAMILY_BRIDGE:'true', ENTITLEMENT_ENFORCEMENT:'true', ENTITLEMENT_TEST_MODE:'false',
      RECONCILIATION_CONFLICTS:'true', ACCOUNT_DELETION_ENABLED:'false', ACCOUNT_DELETION_MAINTENANCE:'false',
      RETENTION_MAINTENANCE:'false', TRIAL_IDENTITY_KEY_VERSION:'v1',
      // The journal tracks the logical source even when DB points at its restore.
      DELETION_SOURCE_DATABASE_ID:resources.source.id, RESTORE_MAINTENANCE:'true'},
    triggers:{crons:[]},
    ratelimits:[['API_LIMITER','19310',6000],['AUTH_LIMITER','19311',120],['INVITE_LIMITER','19312',30]]
      .map(([name,namespace_id,limit])=>({name,namespace_id,simple:{limit,period:60}})),
    d1_databases:[{binding:'DB',database_name:resources[role].name,database_id:resources[role].id},
      {binding:'ERASURE_JOURNAL',database_name:resources.journal.name,database_id:resources.journal.id}]
  })
  const plan = {format:'solemi-a17-isolated-rehearsal-v1', workerName, resources,
    remoteApplied:false, deploymentAuthorized:false,
    requiredSecretNames:['AUTH_SECRET','TOKEN_PEPPER','TRIAL_IDENTITY_SECRET'],
    requiredBeforeRemote:['Verify all three remote IDs and exact names, source/journal empty and restore target empty',
      'Commit reviewed source; record full SHA and successful checks',
      'Approve this isolated resource/deployment scope; do not deploy the shared staging config',
      'Use independent rehearsal-only secrets; verify programme/key identity before activation'],
    sourceSchemaFiles:files, sourceSchemaSha256:hash(sourceSql), journalSchemaSha256:hash(journalSql),
    phases:['Provision three isolated databases', 'Import source schema and independent journal schema only into their named empty targets',
      'Deploy frozen source candidate with a full commit SHA; provision separate secrets and trial programme',
      'Enable maintenance and five-minute cron on isolated Worker; prove a real scheduled run using synthetic requests',
      'Freeze all writers; capture current source and independent journal with hashes and original backup timestamps',
      'Prepare business restore offline; import output into the empty restore target, never the journal or shared staging',
      'Deploy frozen restored candidate; verify bindings, programme, effective grants, erasures, old credentials and integrity',
      'Reopen only isolated test traffic after checks; prove maintenance resumes; disable cron at completion'],
    restoreTargetInitialization:'Do not seed: import the complete verified restore SQL into this empty database',
    journalRestoration:'Never rewind or clone an old journal over the current independent journal',
    rollback:'Freeze first; source database and independent journal remain intact. Reconcile any writes before switching back.',
    cleanup:'Disable isolated cron and endpoints, record completion, remove only these exact resources after separate review; retain artifacts under the approved retention policy'}
  return {'source-schema.sql':sourceSql,'journal-schema.sql':journalSql,
    'source.frozen.jsonc':JSON.stringify(config('source'),null,2)+'\n',
    'restored.frozen.jsonc':JSON.stringify(config('restore'),null,2)+'\n',
    'plan.json':JSON.stringify(plan,null,2)+'\n'}
}

function main() {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) throw new Error('Usage: prepare-retention-rehearsal.mjs resources.json new-output-directory')
  const root=resolve(workerRoot,'..'), destination=resolve(output), rel=relative(root,destination)
  if (!rel || isAbsolute(rel) || rel.startsWith('..') || resolve(root,rel)!==destination || !rel.split(/[\\/]/).includes('.private-backups'))
    throw new Error('USE_NEW_PRIVATE_BACKUPS_DIRECTORY_IN_REPOSITORY')
  if (existsSync(destination)) throw new Error('OUTPUT_DIRECTORY_MUST_BE_NEW')
  let ancestor=dirname(destination)
  while (!existsSync(ancestor)) ancestor=dirname(ancestor)
  const physicalRel=relative(realpathSync(root),realpathSync(ancestor))
  if (isAbsolute(physicalRel) || physicalRel.startsWith('..')) throw new Error('OUTPUT_PARENT_OUTSIDE_REPOSITORY')
  const artifacts=retentionRehearsal(JSON.parse(readFileSync(input,'utf8')))
  mkdirSync(destination,{recursive:true})
  for (const [name,content] of Object.entries(artifacts)) writeFileSync(resolve(destination,name),content,{flag:'wx',mode:0o600})
  console.log('Isolated rehearsal files prepared. No remote resources created; all activation flags and schedules remain off.')
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
  try { main() } catch { console.error('Rehearsal preparation refused. Check resource identities and a new private output directory.'); process.exitCode=1 }
