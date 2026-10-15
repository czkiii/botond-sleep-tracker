import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { sqliteBinding } from './sqliteD1'
import { trialDigest } from '../src/trialIdentity'
export async function trialRegistryFixture() {
  const db = new DatabaseSync(':memory:')
  for (const file of ['schema.sql', '002_retention.sql']) db.exec(readFileSync(new URL('../erasure-journal/' + file, import.meta.url), 'utf8'))
  db.exec("INSERT INTO journal_identity VALUES (1,'staging','source-db')")
  const secret = 'independent-trial-secret-at-least-32-bytes'
  db.prepare('INSERT INTO trial_program VALUES (1,1,?,?,?,NULL)')
    .run('v1', await trialDigest(secret, 'solemi:trial-key-check:v1'), Date.now())
  return { db, env: { ERASURE_JOURNAL: sqliteBinding(db), SOLEMI_ENVIRONMENT: 'staging',
    API_LIMITER: { limit: async () => ({ success: true }) }, AUTH_LIMITER: { limit: async () => ({ success: true }) },
    INVITE_LIMITER: { limit: async () => ({ success: true }) },
    DELETION_SOURCE_DATABASE_ID: 'source-db', TRIAL_IDENTITY_SECRET: secret, TRIAL_IDENTITY_KEY_VERSION: 'v1' } }
}
