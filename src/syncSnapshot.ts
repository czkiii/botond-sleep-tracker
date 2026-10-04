// Accumulate in memory; callers retain their old diary/cursor until all pages
// describe the same revision. Old servers without nextOffset still work.
export async function downloadSyncSnapshot<T extends { revision: number; sessions: unknown[]; nextOffset?: number | null }>(
  after: number, fetchPage: (path: string) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let offset = 0
      let result: T | undefined
      while (true) {
        const page: T = await fetchPage(`/v1/sync?after=${after}&paged=1&offset=${offset}`
          + (result ? `&snapshot=${result.revision}` : ''))
        if (!Array.isArray(page.sessions) || !Number.isSafeInteger(page.revision)
          || page.revision < 0 || (result && page.revision !== result.revision)) {
          throw new Error('SYNC_SNAPSHOT_INVALID')
        }
        result = result ? { ...result, sessions: [...result.sessions, ...page.sessions] } : { ...page }
        if (result.sessions.length > 10000) throw new Error('SYNC_SNAPSHOT_TOO_LARGE')
        if (page.nextOffset === undefined || page.nextOffset === null) return result
        if (page.nextOffset === 10000) throw new Error('SYNC_SNAPSHOT_TOO_LARGE')
        if (page.sessions.length !== 500 || page.nextOffset !== offset + 500 || page.nextOffset >= 10000) {
          throw new Error('SYNC_SNAPSHOT_INVALID')
        }
        offset = page.nextOffset
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'SYNC_SNAPSHOT_CHANGED' || attempt === 2) throw error
    }
  }
  throw new Error('SYNC_SNAPSHOT_CHANGED')
}
