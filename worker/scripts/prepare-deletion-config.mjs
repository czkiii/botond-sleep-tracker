// Creates a reviewable local candidate. Does not provision resources or deploy.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
export function deletionConfig(base, journalId) {
  const environment = base.vars?.SOLEMI_ENVIRONMENT
  const primary = base.d1_databases?.find(db => db.binding === 'DB')
  if (!['staging','production'].includes(environment) || !primary
    || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(journalId)
    || base.d1_databases.some(db => db.database_id === journalId)) throw new Error('DISTINCT_JOURNAL_DATABASE_REQUIRED')
  if (base.d1_databases.some(db => db.binding === 'ERASURE_JOURNAL')) throw new Error('JOURNAL_ALREADY_CONFIGURED')
  return {...base, vars:{...base.vars, ACCOUNT_DELETION_ENABLED:'false', ACCOUNT_DELETION_MAINTENANCE:'false',
    RETENTION_MAINTENANCE:'false', TRIAL_IDENTITY_KEY_VERSION:'v1',
    DELETION_SOURCE_DATABASE_ID:primary.database_id},
    triggers:{...base.triggers, crons:[...new Set([...(base.triggers?.crons || []),'*/5 * * * *'])]},
    d1_databases:[...base.d1_databases,{binding:'ERASURE_JOURNAL',database_name:`solemi-erasure-journal-${environment}`,database_id:journalId}]}
}
function main() {
  const [input, journalId, output] = process.argv.slice(2)
  if (!input || !journalId || !output) throw new Error('Usage: prepare-deletion-config.mjs base.jsonc journal-uuid candidate.jsonc')
  // Existing checked-in configs are strict JSON. Comments in a custom file must be removed first.
  const config = deletionConfig(JSON.parse(readFileSync(input,'utf8')),journalId)
  if (dirname(resolve(input)) !== dirname(resolve(output))) throw new Error('KEEP_CONFIG_IN_SAME_DIRECTORY_FOR_RELATIVE_PATHS')
  writeFileSync(output,JSON.stringify(config,null,2)+'\n',{flag:'wx'})
  console.log('Candidate prepared with both deletion flags disabled. No remote changes.')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
