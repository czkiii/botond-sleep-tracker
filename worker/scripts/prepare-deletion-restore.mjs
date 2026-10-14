// Offline only. Never executes against D1 or overwrites an input/output file.
import { DatabaseSync, constants } from 'node:sqlite'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

function digest(text) { return createHash('sha256').update(text).digest('hex') }
function isolatedDatabase() {
  if (typeof DatabaseSync.prototype.setAuthorizer !== 'function') throw new Error('RESTORE_REQUIRES_NODE_24_10_OR_NEWER')
  const database = new DatabaseSync(':memory:', {allowExtension: false})
  database.setAuthorizer((action, first, second) => {
    if (action === constants.SQLITE_ATTACH || action === constants.SQLITE_DETACH) return constants.SQLITE_DENY
    if (action === constants.SQLITE_PRAGMA && !['foreign_keys','defer_foreign_keys','integrity_check','quick_check','foreign_key_check'].includes(first))
      return constants.SQLITE_DENY
    if (action === constants.SQLITE_FUNCTION && second === 'load_extension') return constants.SQLITE_DENY
    return constants.SQLITE_OK
  })
  return database
}
function binding(sqlite) {
  const prepare = sql => {
    let values = []
    const statement = {
      bind(...args) { values = args; return statement },
      async first() { return sqlite.prepare(sql).get(...values) ?? null },
      async all() { return {results: sqlite.prepare(sql).all(...values)} },
      async run() { const result = sqlite.prepare(sql).run(...values); return {meta: {changes: Number(result.changes)}} }
    }
    return statement
  }
  return {prepare, async batch(statements) {
    sqlite.exec('BEGIN')
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results }
    catch (e) { sqlite.exec('ROLLBACK'); throw e }
  }}
}
function literal(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'string') return value.includes('\0')
    ? "CAST(X'" + Buffer.from(value, 'utf8').toString('hex') + "' AS TEXT)"
    : "'" + value.replaceAll("'", "''") + "'"
  if (value instanceof Uint8Array) return "X'" + Buffer.from(value).toString('hex') + "'"
  throw new Error('UNSUPPORTED_SQL_VALUE')
}
function dump(sqlite) {
  const objects = sqlite.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type='table' DESC,name").all()
  const output = ['PRAGMA foreign_keys=OFF;']
  for (const object of objects.filter(x => x.type === 'table')) {
    const name = '"' + object.name.replaceAll('"','""') + '"'
    output.push(object.sql + ';')
    for (const row of sqlite.prepare(`SELECT * FROM ${name}`).all())
      output.push(`INSERT INTO ${name} VALUES (${Object.values(row).map(literal).join(',')});`)
  }
  for (const object of objects.filter(x => x.type !== 'table')) output.push(object.sql + ';')
  output.push('PRAGMA foreign_keys=ON;')
  return output.join('\n') + '\n'
}

export async function prepareDeletionRestore({backup, journal, environment, sourceDatabaseId, now = Date.now()}) {
  if (!['staging','production'].includes(environment) || !sourceDatabaseId) throw new Error('RESTORE_IDENTITY_REQUIRED')
  const db = isolatedDatabase(), log = isolatedDatabase()
  try {
    db.exec(backup); log.exec(journal)
    const identity = log.prepare('SELECT * FROM journal_identity WHERE id=1').get()
    if (!identity || identity.environment !== environment || identity.source_database_id !== sourceDatabaseId)
      throw new Error('RESTORE_IDENTITY_MISMATCH')
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='journal_identity'").get()) throw new Error('JOURNAL_NOT_INDEPENDENT')
    // Require the current schema, rather than silently interpreting an older schema.
    db.prepare('SELECT resolution,journaled_at,next_attempt_at FROM account_deletions LIMIT 0').all()
    for (const database of [db,log]) {
      if (database.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || database.prepare('PRAGMA foreign_key_check').all().length)
        throw new Error('RESTORE_INTEGRITY_FAILED')
    }
    const records = log.prepare('SELECT * FROM deletion_journal ORDER BY sequence').all()
    const latest = new Map()
    for (const row of records) {
      if (!Number.isSafeInteger(row.sequence) || row.sequence < 1 || !row.request_id || !row.account_id || !Number.isSafeInteger(row.requested_at) || row.requested_at < 0
        || row.requested_at > now || ![row.requested_at,row.requested_at + 2592000000].includes(row.purge_after)
        || !['PENDING','ERASE','RESTORE'].includes(row.state)
        || (row.state === 'PENDING' ? row.resolved_at !== null : !Number.isSafeInteger(row.resolved_at)
          || row.resolved_at < row.requested_at || row.resolved_at > now)
        || (row.state === 'RESTORE' && row.resolved_at >= row.purge_after)) throw new Error('RESTORE_JOURNAL_INVALID')
      latest.set(row.account_id, row)
    }
    // A pending local request absent from the external log is unresolved. Never publish it as active.
    for (const row of db.prepare("SELECT id,account_id FROM account_deletions WHERE state='PENDING'").all())
      if (!latest.has(row.account_id)) throw new Error('RESTORE_JOURNAL_INCOMPLETE')
    for (const row of db.prepare('SELECT account_id FROM erasure_receipts').all())
      if (latest.get(row.account_id)?.state !== 'ERASE') throw new Error('RESTORE_JOURNAL_INCOMPLETE')
    const {build} = require('esbuild')
    const module = await build({entryPoints:[resolve(dirname(fileURLToPath(import.meta.url)), '../src/accountDeletion.ts')],
      bundle:true, write:false, platform:'node', format:'esm', logLevel:'silent'})
    const {AccountDeletionService} = await import('data:text/javascript;base64,' + Buffer.from(module.outputFiles[0].text).toString('base64'))
    // Replay only modifies the isolated copy. The frozen external journal is never rewritten.
    const service = new AccountDeletionService(binding(db), {async write() {}})
    for (const row of latest.values()) await service.replayJournal(row, now)
    // Backup credentials must not revive even for otherwise unaffected accounts.
    db.exec(`UPDATE account_sessions SET revoked_at=COALESCE(revoked_at,${now});
      UPDATE devices SET revoked_at=COALESCE(revoked_at,'${new Date(now).toISOString()}');
      DELETE FROM invite_codes; DELETE FROM auth_challenges;`)
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('RESTORE_INTEGRITY_FAILED')
    const sql = dump(db)
    return {sql, report: {format:'solemi-deletion-restore-v1', environment, sourceDatabaseId, preparedAt:now,
      backupSha256:digest(backup), journalSha256:digest(journal), outputSha256:digest(sql),
      journalRecords:records.length, affectedAccounts:latest.size, remoteApplied:false}}
  } finally { db.close(); log.close() }
}

async function main() {
  const [backup, journal, environment, sourceDatabaseId, output, acknowledgement] = process.argv.slice(2)
  if (!backup || !journal || !output || acknowledgement !== '--traffic-frozen')
    throw new Error('Usage: prepare-deletion-restore.mjs backup.sql journal.sql staging|production source-db-id output.sql --traffic-frozen')
  const outputPath = resolve(output), reportPath = outputPath + '.report.json'
  if ([resolve(backup),resolve(journal)].includes(outputPath) || existsSync(outputPath) || existsSync(reportPath)) throw new Error('OUTPUT_MUST_BE_NEW')
  const result = await prepareDeletionRestore({backup:readFileSync(backup,'utf8'),journal:readFileSync(journal,'utf8'),environment,sourceDatabaseId})
  // Exclusive files: an interrupted report/output pair is never an approved artifact.
  writeFileSync(outputPath,result.sql,{flag:'wx',mode:0o600})
  writeFileSync(reportPath,JSON.stringify(result.report,null,2),{flag:'wx',mode:0o600})
  console.log(JSON.stringify(result.report))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => { console.error('Restore preparation failed. No remote changes. Keep traffic frozen and investigate locally.'); process.exitCode=1 })
