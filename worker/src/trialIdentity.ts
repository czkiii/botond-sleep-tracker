// Independent of diary backups. Never use email, authentication keys or device IDs.
export class TrialIdentityError extends Error {}
export interface TrialIdentityGuard {
  ready?(): Promise<void>
  used(accountId: string): Promise<boolean>
  preserve(accountId: string): Promise<void>
}
const encoder = new TextEncoder()
export async function trialDigest(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
export class TrialIdentityRegistry implements TrialIdentityGuard {
  constructor(private source: D1Database, private registry: D1Database, private secret: string,
    private version: string, private environment: string, private sourceId: string) {}
  async ready() { await this.program() }

  private async program() {
    if (this.source === this.registry) throw new TrialIdentityError('TRIAL_REGISTRY_UNAVAILABLE')
    const row = await this.registry.prepare(`SELECT p.*, j.environment, j.source_database_id
      FROM trial_program p JOIN journal_identity j ON j.id = p.id WHERE p.id = 1`)
      .first<{ active: number; key_version: string; key_check: string; environment: string; source_database_id: string }>()
    if (!row || row.key_version !== this.version || row.environment !== this.environment || row.source_database_id !== this.sourceId
      || row.key_check !== await trialDigest(this.secret, 'solemi:trial-key-check:v1'))
      throw new TrialIdentityError('TRIAL_REGISTRY_UNAVAILABLE')
    return row
  }
  private async identity(accountId: string) {
    const row = await this.source.prepare(`SELECT provider, issuer, subject FROM account_identities
      WHERE account_id = ? AND provider = 'GOOGLE'`).bind(accountId).first<{ provider: string; issuer: string; subject: string }>()
    if (!row || !['accounts.google.com', 'https://accounts.google.com'].includes(row.issuer) || !row.subject)
      throw new TrialIdentityError('TRIAL_IDENTITY_UNAVAILABLE')
    // Google permits two issuer spellings; both represent the same stable subject.
    return trialDigest(this.secret, JSON.stringify(['solemi:used-trial:v1', 'GOOGLE', row.subject]))
  }
  async used(accountId: string) {
    if (!(await this.program()).active) throw new TrialIdentityError('TRIAL_PROGRAM_ENDED')
    const digest = await this.identity(accountId)
    return Boolean(await this.registry.prepare('SELECT digest FROM used_trial_identities WHERE digest = ? AND key_version = ?')
      .bind(digest, this.version).first())
  }
  async preserve(accountId: string) {
    const program = await this.program()
    if (!program.active) return // A terminated programme cannot issue trials and retains no markers.
    const used = await this.source.prepare('SELECT account_id FROM account_trials WHERE account_id = ?').bind(accountId).first()
    if (!used) return // Deleting an unused account does not consume a trial.
    const digest = await this.identity(accountId)
    await this.registry.prepare(`INSERT OR IGNORE INTO used_trial_identities (digest, key_version)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM trial_program WHERE id = 1 AND active = 1 AND key_version = ?)`)
      .bind(digest, this.version, this.version).run()
    // Confirm persistence before allowing the source identity to disappear.
    const confirmation = await this.registry.prepare(`SELECT active,
      EXISTS (SELECT 1 FROM used_trial_identities WHERE digest = ? AND key_version = ?) AS saved
      FROM trial_program WHERE id = 1`).bind(digest, this.version).first<{ active: number; saved: number }>()
    if (!confirmation || (confirmation.active && !confirmation.saved)) throw new TrialIdentityError('TRIAL_REGISTRY_UNAVAILABLE')
  }
}
export function trialIdentity(env: { DB: D1Database; ERASURE_JOURNAL?: D1Database; TRIAL_IDENTITY_SECRET?: string;
  TRIAL_IDENTITY_KEY_VERSION?: string; SOLEMI_ENVIRONMENT?: string; DELETION_SOURCE_DATABASE_ID?: string;
  AUTH_SECRET?: string; TOKEN_PEPPER?: string }): TrialIdentityRegistry {
  if (!env.ERASURE_JOURNAL || env.ERASURE_JOURNAL === env.DB || !env.TRIAL_IDENTITY_SECRET || env.TRIAL_IDENTITY_SECRET.length < 32
    || env.TRIAL_IDENTITY_SECRET === env.AUTH_SECRET || env.TRIAL_IDENTITY_SECRET === env.TOKEN_PEPPER
    || !env.TRIAL_IDENTITY_KEY_VERSION || !env.DELETION_SOURCE_DATABASE_ID || !['staging', 'production'].includes(env.SOLEMI_ENVIRONMENT || ''))
    throw new TrialIdentityError('TRIAL_REGISTRY_UNAVAILABLE')
  return new TrialIdentityRegistry(env.DB, env.ERASURE_JOURNAL, env.TRIAL_IDENTITY_SECRET,
    env.TRIAL_IDENTITY_KEY_VERSION, env.SOLEMI_ENVIRONMENT!, env.DELETION_SOURCE_DATABASE_ID)
}
