import { afterEach, describe, expect, it, vi } from 'vitest'
import { conflictLocalValue, conflictReviewKey } from './conflictPreview'
import { getSyncStore, resolveSyncConflict } from './familySync'
import type { SyncConflict } from './familySync'
import type { AppData } from './types'
import { loadData, STORAGE_KEY } from './storage'

const at = '2026-10-01T21:30:00.000Z'
const child = { id: 'child', name: 'Baby', birthDate: null, photoRef: null, createdAt: at, updatedAt: at }
const session = { id: 'sleep', childId: child.id, startTime: at, endTime: null, dayNightOverride: null, note: 'Family', createdAt: at, updatedAt: at }
const data: AppData = { version: 4, children: [child], sessions: [session], settings: { locale: 'en', activeChildId: child.id, longSleepReminderEnabled: false } }
const conflict: SyncConflict = { operationId: 'op', entityType: 'SESSION', entityId: session.id, baseRevision: 1, serverRevision: 2, serverValue: { ...session, revision: 2, deletedAt: null } }
const operation = { id: 'op', method: 'PATCH' as const, path: '/v1/sessions/sleep', sessionId: session.id, body: { baseRevision: 1, patch: { note: 'Local' } } }
const store = { connection: { familyId: 'family', familyName: 'Test', deviceId: 'device', deviceToken: 'test-only', revision: 1 }, pending: [operation], conflicts: [conflict], missingSessions: [] }

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('reviewed conflict choices', () => {
  it('shows only pending local fields over the current family value, retaining active sleep and family times', () => {
    expect(conflictLocalValue(conflict, store.pending)).toEqual({ ...conflict.serverValue, note: 'Local' })
    expect(conflict.serverValue.note).toBe('Family')
  })
  it('includes queued ending, later corrections and explicit automatic classification, but not other sleeps', () => {
    const endTime = '2026-10-02T05:10:11.000Z'
    const pending = [operation,
      { ...operation, id: 'end', method: 'POST' as const, path: '/v1/sessions/sleep/end', body: { endTime } },
      { ...operation, id: 'correction', body: { patch: { dayNightOverride: null, note: 'Long\n<script>literal</script>' } } },
      { ...operation, id: 'unrelated', sessionId: 'another', body: { patch: { note: 'Other' } } }]
    expect(conflictLocalValue(conflict, pending)).toMatchObject({ endTime, dayNightOverride: null, note: 'Long\n<script>literal</script>' })
  })
  it('shows a pending deletion explicitly instead of resurrecting the earlier fields', () => {
    expect(conflictLocalValue(conflict, [operation, { ...operation, method: 'DELETE' }, operation])).toBeNull()
  })
  it('applies child field edits without replacing an untouched family birthday', () => {
    const c: SyncConflict = { ...conflict, entityType: 'CHILD', entityId: child.id, serverValue: { ...child, birthDate: '2025-08-01', revision: 2, deletedAt: null } }
    expect(conflictLocalValue(c, [{ ...operation, sessionId: undefined, childId: child.id, body: { patch: { name: 'New name' } } }]))
      .toMatchObject({ name: 'New name', birthDate: '2025-08-01' })
  })
  it.each(['local', 'family'] as const)('rejects a stale %s review before sending or discarding data', async resolution => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
    vi.stubGlobal('navigator', { onLine: false, language: 'en' })
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    values.set(STORAGE_KEY, JSON.stringify({ ...data, __solemiLocal: { familySyncV1: store } }))
    const reviewed = conflictReviewKey(getSyncStore(), loadData(), 'op')
    const changed = structuredClone(store)
    changed.conflicts[0].serverRevision = 3
    values.set(STORAGE_KEY, JSON.stringify({ ...data, __solemiLocal: { familySyncV1: changed } }))
    const before = values.get(STORAGE_KEY)
    await expect(resolveSyncConflict('op', resolution, reviewed)).rejects.toThrow('SYNC_CONFLICT_CHANGED')
    expect(values.get(STORAGE_KEY)).toBe(before)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('keeps the review stable for unrelated changes but invalidates edits to this entry', () => {
    const key = conflictReviewKey(store, data, 'op')
    expect(conflictReviewKey({ ...store, pending: [...store.pending, { ...operation, sessionId: 'other' }] }, data, 'op')).toBe(key)
    expect(conflictReviewKey({ ...store, pending: [{ ...operation, body: { patch: { note: 'Newer local edit' } } }] }, data, 'op')).not.toBe(key)
    expect(conflictReviewKey({ ...store, connection: { ...store.connection, familyId: 'another' } }, data, 'op')).not.toBe(key)
    expect(conflictReviewKey({ ...store, conflicts: [] }, data, 'op')).toBe('')
  })
})
