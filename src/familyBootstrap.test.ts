import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptFamilyBootstrap, flushPending, getSyncStore, joinFamily, prepareFamilyBootstrap, pullRemote, reconcileAccountFamily, saveLocalData } from './familySync'
import { createDefaultData, loadData, loadSafetyBackup, saveRemoteData, STORAGE_KEY } from './storage'
import type { AppData } from './types'

class MemoryStorage implements Storage {
  values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(i: number) { return [...this.values.keys()][i] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}
const at = '2026-08-26T10:00:00.000Z'
const child = (id: string) => ({ id, name: 'Boti', birthDate: '2025-08-23', photoRef: null, createdAt: at, updatedAt: at })
const sleep = (id: string, childId: string) => ({ id, childId, startTime: at, endTime: null, note: 'Helyi aktív alvás', dayNightOverride: null, createdAt: at, updatedAt: at })
const diary: AppData = { version: 4, settings: { locale: 'hu', activeChildId: 'local-child', longSleepReminderEnabled: false },
  children: [child('local-child')], sessions: [sleep('local-sleep', 'local-child')] }
const connection = { familyId: 'family', familyName: 'Család', deviceId: 'device', deviceToken: 'token', revision: 40 }
let storage: MemoryStorage
let snapshot: { revision: number; familyName: string; children: unknown[]; sessions: unknown[] }
let fetchMock: ReturnType<typeof vi.fn>
const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200 })

beforeEach(() => {
  vi.stubEnv('VITE_ACCOUNT_AUTH', 'false')
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('sessionStorage', new MemoryStorage())
  vi.stubGlobal('navigator', { onLine: true, language: 'hu-HU' })
  vi.stubGlobal('window', new EventTarget())
  storage.setItem(STORAGE_KEY, JSON.stringify(diary))
  snapshot = { revision: 40, familyName: 'Család', children: [{ ...child('remote-child'), revision: 1, deletedAt: null }],
    sessions: [{ ...sleep('remote-sleep', 'remote-child'), note: 'Családi alvás', revision: 40, deletedAt: null }] }
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/v1/join')) return ok({ ...connection, device: { id: connection.deviceId } })
    if (url.endsWith('/v1/auth/family/bootstrap')) return ok({ membership: { familyId: 'family' }, connection })
    if (url.includes('/v1/sync?')) return ok(snapshot)
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('existing local diary joining a family', () => {
  it('keeps same-name children separate until review and keeps the active local sleep in a backup', async () => {
    expect(await joinFamily('abcd', 'Phone')).toMatchObject({ connected: false, needsReview: true })
    expect(loadData()).toEqual(diary)
    expect(getSyncStore()).toMatchObject({ connection: null, bootstrapConnection: { familyId: 'family' }, pending: [] })
    const preview = await prepareFamilyBootstrap()
    expect(preview.local.children[0].id).toBe('local-child')
    expect(preview.data.children.map(c => c.id)).toEqual(['remote-child'])
    expect(loadData()).toEqual(diary)
    acceptFamilyBootstrap(preview)
    expect(loadData().sessions.map(s => s.id)).toEqual(['remote-sleep'])
    expect(loadSafetyBackup()?.data).toEqual(diary)
    expect(getSyncStore()).toMatchObject({ connection: { revision: 40 }, pending: [] })
    expect(getSyncStore().bootstrapConnection).toBeUndefined()
    expect(fetchMock.mock.calls.map(call => String(call[0]).split('/v1/')[1])).toEqual(['join', 'sync?after=0'])
  })

  it('does not upload local edits while the family diary choice is postponed', async () => {
    await joinFamily('abcd', 'Phone')
    const edited = { ...diary, children: diary.children.map(c => ({ ...c, name: 'Helyi új név' })) }
    saveLocalData(diary, edited)
    await flushPending(); await pullRemote()
    expect(loadData()).toEqual(edited)
    expect(getSyncStore().pending).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const preview = await prepareFamilyBootstrap()
    expect(preview.local).toEqual(edited)
  })

  it('requires review even with identical IDs and preserves the local variant in the backup', async () => {
    snapshot.children = [{ ...child('local-child'), name: 'Családi név', revision: 1, deletedAt: null }]
    snapshot.sessions = [{ ...sleep('local-sleep', 'local-child'), note: 'Családi változat', revision: 40, deletedAt: null }]
    await joinFamily('abcd', 'Phone')
    const preview = await prepareFamilyBootstrap()
    expect(loadData()).toEqual(diary)
    acceptFamilyBootstrap(preview)
    expect(loadData().children[0].name).toBe('Családi név')
    expect(loadSafetyBackup()?.data.sessions[0].note).toBe('Helyi aktív alvás')
  })

  it('does not consume the code again after a failed initial download and resumes from saved credentials', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(createDefaultData()))
    const before = loadData()
    fetchMock.mockImplementationOnce(async () => ok({ ...connection, device: { id: 'device' } }))
      .mockImplementationOnce(async () => { throw new TypeError('network lost') })
    await expect(joinFamily('abcd', 'Phone')).rejects.toThrow()
    expect(loadData()).toEqual(before)
    expect(getSyncStore().connection).toBeNull()
    expect(getSyncStore().bootstrapConnection?.deviceToken).toBe('token')
    expect(await joinFamily('abcd', 'Phone')).toMatchObject({ connected: true })
    expect(fetchMock.mock.calls.filter(c => String(c[0]).endsWith('/v1/join'))).toHaveLength(1)
    expect(loadData().sessions[0].id).toBe('remote-sleep')
  })

  it.each(['download', 'confirmation'])('rejects a stale %s when local data changes', async phase => {
    await joinFamily('abcd', 'Phone')
    const edited = { ...diary, sessions: diary.sessions.map(s => ({ ...s, note: 'Új helyi jegyzet' })) }
    if (phase === 'download') {
      fetchMock.mockImplementationOnce(async () => { saveRemoteData(edited); return ok(snapshot) })
      await expect(prepareFamilyBootstrap()).rejects.toThrow('FAMILY_BOOTSTRAP_CHANGED')
    } else {
      const preview = await prepareFamilyBootstrap()
      saveRemoteData(edited)
      expect(() => acceptFamilyBootstrap(preview)).toThrow('FAMILY_BOOTSTRAP_CHANGED')
    }
    expect(loadData()).toEqual(edited)
    expect(getSyncStore().connection).toBeNull()
  })

  it('does not enable sync when a local edit arrives during the empty starter download', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(createDefaultData()))
    fetchMock.mockImplementationOnce(async () => ok({ ...connection, device: { id: 'device' } }))
      .mockImplementationOnce(async () => { saveRemoteData(diary); return ok(snapshot) })
    await expect(joinFamily('abcd', 'Phone')).rejects.toThrow('FAMILY_BOOTSTRAP_CHANGED')
    expect(loadData()).toEqual(diary)
    expect(getSyncStore().connection).toBeNull()
  })

  it.each([1, 2])('keeps diary and credentials when write %s fails during confirmation', async failedWrite => {
    await joinFamily('abcd', 'Phone')
    const preview = await prepareFamilyBootstrap()
    const original = storage.setItem.bind(storage)
    let writes = 0
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (++writes === failedWrite) throw new Error('quota')
      original(key, value)
    })
    expect(() => acceptFamilyBootstrap(preview)).toThrow()
    expect(loadData()).toEqual(diary)
    expect(getSyncStore().connection).toBeNull()
    expect(getSyncStore().bootstrapConnection?.deviceToken).toBe('token')
    acceptFamilyBootstrap(preview)
    expect(loadData().sessions[0].id).toBe('remote-sleep')
  })

  it('rejects an orphaned family snapshot without changing the local diary', async () => {
    await joinFamily('abcd', 'Phone')
    snapshot.children = [{ ...child('different'), revision: 1, deletedAt: null }]
    await expect(prepareFamilyBootstrap()).rejects.toThrow('orphan-sessions')
    expect(loadData()).toEqual(diary)
    expect(getSyncStore().connection).toBeNull()
  })

  it('blocks a join while old family operations remain', async () => {
    storage.setItem('solemiSleep:sync:v1', JSON.stringify({ connection: null, pending: [
      { id: 'pending', method: 'POST', path: '/v1/sessions', body: {} }
    ], conflicts: [], missingSessions: [] }))
    await expect(joinFamily('abcd', 'Phone')).rejects.toThrow('FAMILY_BOOTSTRAP_BLOCKED')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getSyncStore().pending).toHaveLength(1)
  })

  it('stops a late join result from being stored in another account workspace', async () => {
    fetchMock.mockImplementationOnce(async () => {
      storage.setItem('solemiSleep:activeWorkspace:v1', JSON.stringify({ kind: 'account', accountId: 'other' }))
      return ok({ ...connection, device: { id: 'device' } })
    })
    await expect(joinFamily('abcd', 'Phone')).rejects.toThrow('FAMILY_BOOTSTRAP_CHANGED')
    expect(getSyncStore().bootstrapConnection).toBeUndefined()
    expect(loadData()).toEqual(diary)
  })

  it('also stages automatic authenticated account bootstrap without merging its nonempty diary', async () => {
    vi.stubEnv('VITE_ACCOUNT_AUTH', 'true')
    sessionStorage.setItem('solemiSleep:accountAccess', JSON.stringify({ account: { id: 'account' }, deviceId: 'auth-device',
      accessToken: 'account-token', accessExpiresAt: Date.now() + 60_000, expiresAt: Date.now() + 120_000 }))
    expect(await reconcileAccountFamily()).toMatchObject({ connected: false, needsReview: true })
    expect(loadData()).toEqual(diary)
    expect(await reconcileAccountFamily()).toMatchObject({ connected: false, needsReview: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses the authenticated join route and family token when reviewing an account family', async () => {
    vi.stubEnv('VITE_ACCOUNT_AUTH', 'true')
    sessionStorage.setItem('solemiSleep:accountAccess', JSON.stringify({ account: { id: 'account' }, deviceId: 'auth-device',
      accessToken: 'account-token', accessExpiresAt: Date.now() + 60_000, expiresAt: Date.now() + 120_000 }))
    fetchMock.mockImplementationOnce(async () => ok({ connection }))
    expect(await joinFamily('abcd', 'Phone')).toMatchObject({ needsReview: true })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/auth/family/join')
    const preview = await prepareFamilyBootstrap()
    const options = fetchMock.mock.calls[1][1] as RequestInit
    expect(new Headers(options.headers).get('X-Solemi-Family-Token')).toBe('token')
    acceptFamilyBootstrap(preview)
    expect(loadSafetyBackup()?.data).toEqual(diary)
  })

  it('downloads a large family including every profile and sleep from revision zero', async () => {
    snapshot.children = ['one', 'two'].map(id => ({ ...child(id), revision: 1, deletedAt: null }))
    snapshot.sessions = Array.from({ length: 2000 }, (_, i) => ({ ...sleep(`sleep-${i}`, i % 2 ? 'one' : 'two'),
      endTime: '2026-08-26T11:00:00.000Z', revision: i + 2, deletedAt: null }))
    snapshot.revision = 2001
    await joinFamily('abcd', 'Phone')
    acceptFamilyBootstrap(await prepareFamilyBootstrap())
    expect(loadData().children).toHaveLength(2)
    expect(loadData().sessions).toHaveLength(2000)
    expect(getSyncStore().connection?.revision).toBe(2001)
    expect(loadSafetyBackup()?.data).toEqual(diary)
  })

  it('keeps downloaded records and their cursor together if a later local write fails', async () => {
    await joinFamily('abcd', 'Phone')
    acceptFamilyBootstrap(await prepareFamilyBootstrap())
    const before = loadData()
    snapshot.revision = 41
    snapshot.sessions = [{ ...sleep('remote-sleep', 'remote-child'), note: 'Új szerveres jegyzet', revision: 41, deletedAt: null }]
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => { throw new Error('quota') })
    await expect(pullRemote()).rejects.toThrow()
    expect(loadData()).toEqual(before)
    expect(getSyncStore().connection?.revision).toBe(40)
    await pullRemote()
    expect(loadData().sessions[0].note).toBe('Új szerveres jegyzet')
    expect(getSyncStore().connection?.revision).toBe(41)
  })
})
