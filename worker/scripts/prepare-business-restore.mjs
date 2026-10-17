// Offline reconciliation. Both exports must come from an operator-verified,
// frozen capture. No network, provisioning, secrets or automatic deployment.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareDeletionRestore, isolatedDatabase, digest, dump } from './prepare-deletion-restore.mjs'

const tables = ['accounts', 'account_identities', 'legacy_family_memberships', 'account_trials',
  'subscriptions', 'subscription_events', 'billing_account_links', 'store_subscription_state',
  'google_token_replacements', 'billing_retention', 'billing_legal_holds', 'account_entitlements']
const scopes = {
  accounts: 'SELECT id,status FROM accounts',
  identities: 'SELECT id,account_id,provider,issuer,subject FROM account_identities',
  families: 'SELECT id,created_at FROM families',
  memberships: 'SELECT * FROM legacy_family_memberships'
}
const canonical = rows => JSON.stringify(rows.map(row => JSON.stringify(row)).sort())
const quote = name => '"' + name.replaceAll('"', '""') + '"'
const schema = db => canonical(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all())
const rows = (db, table) => db.prepare(`SELECT * FROM ${quote(table)}`).all()

function validateBusiness(db, environment, now, capturedAt) {
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('BUSINESS_FOREIGN_KEYS_INVALID')
  if (db.prepare('SELECT family_id FROM account_trials WHERE family_id IS NOT NULL GROUP BY family_id HAVING COUNT(*) > 4').get()
    || db.prepare(`SELECT a.account_id FROM account_trials a JOIN account_trials b ON a.account_id < b.account_id
      AND a.family_id=b.family_id AND a.family_bound_at < b.ends_at AND b.family_bound_at < a.ends_at`).get())
    throw new Error('BUSINESS_TRIAL_LIMIT_INVALID')
  const expectedEnvironment = environment === 'production' ? 'PRODUCTION' : 'SANDBOX'
  if (db.prepare('SELECT subscription_id FROM store_subscription_state WHERE environment <> ?').get(expectedEnvironment)
    || db.prepare('SELECT old_purchase_token FROM google_token_replacements WHERE environment <> ?').get(expectedEnvironment))
    throw new Error('BUSINESS_STORE_ENVIRONMENT_MISMATCH')
  // Read the full current ledger, not just currently active grants. Revocations,
  // event deduplication, replacement tokens, disputes and holds must all survive.
  for (const grant of rows(db, 'account_entitlements')) {
    if (grant.revoked_at !== null || grant.valid_until <= now) continue
    const account = db.prepare('SELECT status FROM accounts WHERE id=?').get(grant.account_id)
    if (account?.status !== 'ACTIVE') throw new Error('BUSINESS_ACCOUNT_UNAVAILABLE')
    if (grant.source_type !== 'SUBSCRIPTION') continue
    const sub = db.prepare('SELECT * FROM subscriptions WHERE id=? AND account_id=?').get(grant.source_id, grant.account_id)
    if (!sub || !['ACTIVE', 'TRIALING', 'GRACE_PERIOD', 'CANCELED'].includes(sub.status)
      || grant.valid_until > sub.access_until || (sub.product === 'FAMILY' && grant.feature_key === 'FAMILY_PLUS_INSIGHTS'))
      throw new Error('BUSINESS_GRANT_INCONSISTENT')
    if (sub.provider === 'MANUAL' && environment === 'staging') continue
    if (!['APPLE', 'GOOGLE_PLAY'].includes(sub.provider)) throw new Error('BUSINESS_PROVIDER_UNSUPPORTED')
    const state = db.prepare('SELECT * FROM store_subscription_state WHERE subscription_id=?').get(sub.id)
    if (!state || state.last_verified_at < now - 300000 || state.last_verified_at > capturedAt
      || state.last_applied_status !== sub.status || !state.last_applied_event_id
      || !db.prepare(`SELECT id FROM subscription_events WHERE subscription_id=? AND provider_event_id=?
        AND provider=? AND processed_at IS NOT NULL AND processing_error IS NULL`)
        .get(sub.id, state.last_applied_event_id, sub.provider)) throw new Error('BUSINESS_STORE_REFRESH_REQUIRED')
    if (sub.provider === 'GOOGLE_PLAY' && db.prepare('SELECT old_purchase_token FROM google_token_replacements WHERE old_purchase_token=?')
      .get(sub.provider_subscription_id)) throw new Error('BUSINESS_REPLACED_TOKEN_GRANT')
  }
}

export async function prepareBusinessRestore({backup, current, journal, metadata, environment, sourceDatabaseId, now = Date.now()}) {
  if (!Number.isSafeInteger(now) || !metadata || metadata.currentSha256 !== digest(current)
    || !Number.isSafeInteger(metadata.frozenAt) || metadata.frozenAt < now - 300000 || metadata.frozenAt > now
    || !Number.isSafeInteger(metadata.currentCapturedAt) || metadata.currentCapturedAt < metadata.frozenAt
    || metadata.currentCapturedAt > now || metadata.backupCreatedAt > metadata.currentCapturedAt
    || metadata.journalCapturedAt < metadata.frozenAt)
    throw new Error('BUSINESS_CAPTURE_INVALID')
  // Same journal and clock for both sides; erasures always precede reconciliation.
  const restored = await prepareDeletionRestore({backup, journal, metadata, environment, sourceDatabaseId, now})
  const fresh = await prepareDeletionRestore({backup:current, journal, environment, sourceDatabaseId, now,
    metadata:{...metadata, backupSha256:metadata.currentSha256, backupCreatedAt:metadata.currentCapturedAt}})
  const db = isolatedDatabase(), source = isolatedDatabase(), raw = isolatedDatabase(), log = isolatedDatabase()
  try {
    db.exec(restored.sql); source.exec(fresh.sql); raw.exec(current); log.exec(journal)
    // A fresh capture taken from an already blocked restore is not an authority.
    if (raw.prepare('SELECT blocked FROM retention_restore_gate WHERE id=1').get()?.blocked !== 0)
      throw new Error('BUSINESS_SOURCE_BLOCKED')
    const program = log.prepare('SELECT * FROM trial_program WHERE id=1').get()
    if (!program || log.prepare('SELECT digest FROM used_trial_identities WHERE key_version<>?').get(program.key_version)
      || (program.active === 0 && rows(log, 'used_trial_identities').length)) throw new Error('BUSINESS_TRIAL_REGISTRY_INVALID')
    if (schema(db) !== schema(source) || schema(source) !== schema(raw)) throw new Error('BUSINESS_SCHEMA_MISMATCH')
    for (const [name, sql] of Object.entries(scopes)) {
      if (canonical(db.prepare(sql).all()) !== canonical(source.prepare(sql).all()))
        throw new Error(`BUSINESS_SCOPE_CHANGED:${name}`)
    }
    for (const prior of rows(db, 'account_trials')) {
      const latest = source.prepare('SELECT * FROM account_trials WHERE account_id=?').get(prior.account_id)
      const immutable = ['operation_id','product','started_at','ends_at','activation_family_id','origin']
      if (!latest || immutable.some(key => latest[key] !== prior[key])
        || (prior.family_id !== null && (latest.family_id !== prior.family_id || latest.family_bound_at !== prior.family_bound_at)))
        throw new Error('BUSINESS_TRIAL_HISTORY_LOST')
    }
    // Recover ONLY fresh grants for accounts still active after journal replay.
    // Never salvage a grant from the old backup or reactivate an erased account.
    for (const grant of rows(raw, 'account_entitlements')) {
      if (source.prepare('SELECT status FROM accounts WHERE id=?').get(grant.account_id)?.status !== 'ACTIVE') continue
      const columns = Object.keys(grant)
      source.prepare(`INSERT INTO account_entitlements (${columns.map(quote)}) VALUES (${columns.map(() => '?')})`)
        .run(...columns.map(key => grant[key]))
    }
    validateBusiness(source, environment, now, metadata.currentCapturedAt)
    const untouched = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
      .map(row => row.name).filter(name => !tables.includes(name) && name !== 'retention_restore_gate')
    const before = new Map(untouched.map(name => [name, canonical(rows(db, name))]))
    const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all()
    // Reconstruct the verified snapshot, not replay historical INSERT events:
    // activation triggers would otherwise bind trials again or move deadlines.
    // Trigger suspension exists only in this in-memory transaction. Output always
    // restores the original triggers and constraints before it can be published.
    db.exec('PRAGMA foreign_keys=OFF; BEGIN;')
    try {
      for (const trigger of triggers) db.exec(`DROP TRIGGER ${quote(trigger.name)}`)
      for (const table of tables) {
        db.exec(`DELETE FROM ${quote(table)}`)
        for (const row of rows(source, table)) {
          const columns = Object.keys(row)
          db.prepare(`INSERT INTO ${quote(table)} (${columns.map(quote)}) VALUES (${columns.map(() => '?')})`)
            .run(...columns.map(key => row[key]))
        }
      }
      for (const trigger of triggers) db.exec(trigger.sql)
      for (const table of tables) if (canonical(rows(db, table)) !== canonical(rows(source, table))) throw new Error('BUSINESS_COPY_MISMATCH')
      for (const [table, value] of before) if (canonical(rows(db, table)) !== value) throw new Error('RESTORE_DIARY_CHANGED')
      if (db.prepare('PRAGMA foreign_key_check').all().length || db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok'
        || schema(db) !== schema(source)) throw new Error('BUSINESS_OUTPUT_INVALID')
      db.exec('UPDATE retention_restore_gate SET blocked=0 WHERE id=1; COMMIT; PRAGMA foreign_keys=ON;')
    } catch (error) { db.exec('ROLLBACK; PRAGMA foreign_keys=ON;'); throw error }
    const sql = dump(db)
    return {sql, report:{...restored.report, format:'solemi-business-restore-v1', currentSha256:digest(current),
      currentCapturedAt:metadata.currentCapturedAt, frozenAt:metadata.frozenAt, outputSha256:digest(sql),
      reconciledTables:tables.map(name => ({name, rows:rows(db, name).length})),
      trialRegistrySha256:digest(canonical(rows(log, 'trial_program')) + canonical(rows(log, 'used_trial_identities'))),
      businessReconciliationRequired:false, trafficMayResume:false, remoteApplied:false}}
  } finally { db.close(); source.close(); raw.close(); log.close() }
}

async function main() {
  const [backup, current, journal, environment, sourceDatabaseId, output, metadata, acknowledgement] = process.argv.slice(2)
  if (!backup || !current || !journal || !output || !metadata || acknowledgement !== '--traffic-frozen')
    throw new Error('Usage: prepare-business-restore.mjs backup.sql current.sql journal.sql staging|production source-db-id output.sql metadata.json --traffic-frozen')
  const outputPath = resolve(output), reportPath = outputPath + '.report.json'
  if (existsSync(outputPath) || existsSync(reportPath) || [backup,current,journal,metadata].map(x => resolve(x)).includes(outputPath))
    throw new Error('OUTPUT_MUST_BE_NEW')
  const result = await prepareBusinessRestore({backup:readFileSync(backup,'utf8'), current:readFileSync(current,'utf8'),
    journal:readFileSync(journal,'utf8'), metadata:JSON.parse(readFileSync(metadata,'utf8')), environment, sourceDatabaseId})
  writeFileSync(outputPath,result.sql,{flag:'wx',mode:0o600})
  writeFileSync(reportPath,JSON.stringify(result.report,null,2)+'\n',{flag:'wx',mode:0o600})
  console.log(JSON.stringify(result.report))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error('Business restore refused: ' + (/^(BUSINESS_[A-Z_]+|RESTORE_[A-Z_]+|JOURNAL_[A-Z_]+)(?::(accounts|identities|families|memberships))?$/.test(error.message)
    ? error.message : 'INVALID_INPUT') + '. No remote changes; keep traffic frozen.'); process.exitCode=1 })
