export type JournalRecord = {
  request_id: string; account_id: string; family_id: string | null
  requested_at: number; purge_after: number
  state: 'PENDING' | 'ERASE' | 'RESTORE'; resolved_at: number | null
}
export interface DeletionJournal {
  write(record: JournalRecord): Promise<void>
}

export class D1DeletionJournal implements DeletionJournal {
  constructor(private db: D1Database, private environment: string, private sourceDatabaseId: string) {}
  async write(record: JournalRecord) {
    const identity = await this.db.prepare('SELECT environment, source_database_id FROM journal_identity WHERE id = 1')
      .first<{ environment: string; source_database_id: string }>()
    if (!identity || identity.environment !== this.environment || identity.source_database_id !== this.sourceDatabaseId)
      throw new Error('DELETION_JOURNAL_IDENTITY_MISMATCH')
    await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO deletion_journal
        (request_id, account_id, family_id, requested_at, purge_after, state, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(record.request_id, record.account_id, record.family_id, record.requested_at, record.purge_after, record.state, record.resolved_at),
      this.db.prepare(`UPDATE deletion_journal SET state = ?, resolved_at = ? WHERE request_id = ? AND state = 'PENDING'
        AND account_id = ? AND family_id IS ? AND requested_at = ? AND purge_after = ? AND ? <> 'PENDING'`)
        .bind(record.state, record.resolved_at, record.request_id, record.account_id, record.family_id, record.requested_at, record.purge_after, record.state)
    ])
    const saved = await this.db.prepare('SELECT * FROM deletion_journal WHERE request_id = ?').bind(record.request_id).first<JournalRecord>()
    if (!saved || saved.account_id !== record.account_id || saved.family_id !== record.family_id
      || saved.requested_at !== record.requested_at || saved.purge_after !== record.purge_after
      || (record.state !== 'PENDING' && (saved.state !== record.state || saved.resolved_at !== record.resolved_at)))
      throw new Error('DELETION_JOURNAL_CONFLICT')
  }
}

export function deletionJournal(env: {
  DB: D1Database; ERASURE_JOURNAL?: D1Database; SOLEMI_ENVIRONMENT?: string; DELETION_SOURCE_DATABASE_ID?: string
}): DeletionJournal | undefined {
  if (!env.ERASURE_JOURNAL || env.ERASURE_JOURNAL === env.DB || !env.DELETION_SOURCE_DATABASE_ID
    || !['staging', 'production'].includes(env.SOLEMI_ENVIRONMENT || '')) return undefined
  return new D1DeletionJournal(env.ERASURE_JOURNAL, env.SOLEMI_ENVIRONMENT!, env.DELETION_SOURCE_DATABASE_ID)
}
