// Offline adapter for an already reconciled business restore. No remote writes.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isolatedDatabase, loadSqlExport, digest } from './prepare-deletion-restore.mjs'

const quote = value => '"' + value.replaceAll('"', '""') + '"'
function literal(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'string') return value.includes('\0')
    ? "CAST(X'" + Buffer.from(value).toString('hex') + "' AS TEXT)"
    : "'" + value.replaceAll("'", "''") + "'"
  if (value instanceof Uint8Array) return "X'" + Buffer.from(value).toString('hex') + "'"
  throw new Error('D1_RESTORE_VALUE_UNSUPPORTED')
}

export function prepareD1Restore(sql, report) {
  if (!report || report.format !== 'solemi-business-restore-v1' || report.outputSha256 !== digest(sql)
    || report.businessReconciliationRequired !== false || report.trafficMayResume !== false)
    throw new Error('D1_RESTORE_VERIFIED_INPUT_REQUIRED')
  const db = isolatedDatabase(), verify = new DatabaseSync(':memory:')
  try {
    loadSqlExport(db, sql)
    if (db.prepare("SELECT name FROM sqlite_master WHERE name='journal_identity'").get())
      throw new Error('D1_RESTORE_JOURNAL_FORBIDDEN')
    if (db.prepare('SELECT blocked FROM retention_restore_gate WHERE id=1').get()?.blocked !== 0)
      throw new Error('D1_RESTORE_BUSINESS_BLOCKED')
    const objects = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    const pending = objects.filter(object => object.type === 'table'), tables = [], created = new Set()
    // D1 validates parent definitions during import, even with deferred checks.
    // Put referenced tables first, then all unique indexes before any data.
    while (pending.length) {
      const index = pending.findIndex(object => db.prepare('PRAGMA foreign_key_list(' + quote(object.name) + ')').all()
        .every(foreignKey => foreignKey.table === object.name || created.has(foreignKey.table)))
      if (index < 0) throw new Error('D1_RESTORE_CYCLIC_SCHEMA_UNSUPPORTED')
      const [next] = pending.splice(index, 1)
      tables.push(next); created.add(next.name)
    }
    const parts = ['PRAGMA defer_foreign_keys=ON;', ...tables.map(object => object.sql + ';'),
      ...objects.filter(object => object.type === 'index').map(object => object.sql + ';')]
    for (const table of tables) {
      for (const row of db.prepare('SELECT * FROM ' + quote(table.name)).all())
        parts.push('INSERT INTO ' + quote(table.name) + ' VALUES(' + Object.values(row).map(literal).join(',') + ');')
    }
    // Creating triggers after the rows prevents replaying historical effects.
    parts.push(...objects.filter(object => object.type === 'trigger' || object.type === 'view').map(object => object.sql + ';'))
    const output = parts.join('\n') + '\n'
    verify.exec('PRAGMA foreign_keys=ON; BEGIN;')
    verify.exec(output)
    verify.exec('COMMIT;')
    if (verify.prepare('PRAGMA foreign_key_check').all().length
      || verify.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('D1_RESTORE_FOREIGN_KEYS_INVALID')
    for (const table of tables) {
      const query = 'SELECT * FROM ' + quote(table.name)
      if (JSON.stringify(verify.prepare(query).all()) !== JSON.stringify(db.prepare(query).all()))
        throw new Error('D1_RESTORE_DATA_MISMATCH')
    }
    return {sql: output, report: {format: 'solemi-d1-restore-v1', inputSha256: digest(sql), outputSha256: digest(output),
      trafficMayResume: false, remoteApplied: false}}
  } finally { db.close(); verify.close() }
}

function main() {
  const [input, reportFile, output] = process.argv.slice(2)
  if (!input || !reportFile || !output) throw new Error('D1_RESTORE_ARGUMENTS_REQUIRED')
  if (existsSync(output) || existsSync(output + '.report.json')) throw new Error('D1_RESTORE_OUTPUT_MUST_BE_NEW')
  const prepared = prepareD1Restore(readFileSync(input, 'utf8'), JSON.parse(readFileSync(reportFile, 'utf8')))
  writeFileSync(output, prepared.sql, {flag: 'wx', mode: 0o600})
  writeFileSync(output + '.report.json', JSON.stringify(prepared.report, null, 2) + '\n', {flag: 'wx', mode: 0o600})
  console.log('Verified D1 import prepared locally. Import only into the verified empty restore target; traffic remains frozen.')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch {
    console.error('D1 restore preparation refused. Check verified inputs and new output paths.')
    process.exitCode = 1
  }
}
