import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearLocalDiary, createFamily, flushPending, getFamilyReplacementReadiness, getSyncStore, isEmptyStarterData, leaveFamily, makeOperations, mergeRemote, pullRemote, reconcileAccountFamily, resolveSyncConflict, saveLocalData } from './familySync'
import { DataStorageError, STORAGE_KEY, createDefaultData, loadData, loadSafetyBackup, saveSafetyBackup } from './storage'
import { API_TIMEOUT_MS } from './apiTransport'
import type { AppData, ChildProfile, SleepSession } from './types'

const at = '2026-08-26T10:00:00.000Z'
const child = (id: string): ChildProfile => ({ id, name: id, birthDate: null, photoRef: null, createdAt: at, updatedAt: at })
const sleep = (id: string, childId: string): SleepSession => ({ id, childId, startTime: at, endTime: '2026-08-26T11:00:00.000Z', note: '', dayNightOverride: null, createdAt: at, updatedAt: at })
const previous: AppData = {
  version: 4,
  settings: { locale: 'hu', activeChildId: 'b', longSleepReminderEnabled: false },
  children: [child('a'), child('b')],
  sessions: [sleep('sleep-a', 'a'), sleep('sleep-b', 'b')]
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

const originalDescriptors = {
  localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
  navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  fetch: Object.getOwnPropertyDescriptor(globalThis, 'fetch'),
  sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
}

function restoreGlobal(name: keyof typeof originalDescriptors) {
  const descriptor = originalDescriptors[name]
  if (descriptor) Object.defineProperty(globalThis, name, descriptor)
  else Reflect.deleteProperty(globalThis, name)
}

afterEach(() => {
  restoreGlobal('localStorage')
  restoreGlobal('navigator')
  restoreGlobal('window')
  restoreGlobal('fetch')
  restoreGlobal('sessionStorage')
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('account-owned family creation', () => {
  it('uses the authenticated atomic route and sends the account session for the first invite', async () => {
    vi.stubEnv('VITE_ACCOUNT_AUTH', 'true')
    const storage = new MemoryStorage()
    const session = new MemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: vi.fn() } })
    const local = { ...previous, children: [previous.children[1]], sessions: [] }
    storage.setItem(STORAGE_KEY, JSON.stringify(local))
    session.setItem('solemiSleep:accountAccess', JSON.stringify({
      account: { id: 'account-1', email: null, name: null }, deviceId: 'account-device-1',
      accessToken: 'account-token', accessExpiresAt: Date.now() + 60_000, expiresAt: Date.now() + 120_000
    }))
    const fetchMock = vi.fn().mockImplementation((url: string, options: RequestInit) => {
      if (String(url).includes('/v1/auth/family/create')) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, data: { connection: {
          familyId: 'family-1', familyName: 'Teszt', deviceId: 'family-device-1',
          deviceToken: 'family-token', revision: 0
        } } }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      }
      if (String(url).includes('/v1/invites')) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, data: {
          code: 'SOLEMI7', expiresAt: '2026-09-21T22:00:00.000Z'
        } }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      }
      throw new Error(`Unexpected request: ${url} ${options.method}`)
    })
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })

    await expect(createFamily('Teszt', 'Safari')).resolves.toMatchObject({ code: 'SOLEMI7' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/auth/family/create')
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('/v1/families')
    const createHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(createHeaders.get('Authorization')).toBe('Bearer account-token')
    const inviteHeaders = new Headers(fetchMock.mock.calls[1][1]?.headers)
    expect(inviteHeaders.get('Authorization')).toBe('Bearer account-token')
    expect(inviteHeaders.get('X-Solemi-Family-Token')).toBe('family-token')
    expect(getSyncStore().connection).toMatchObject({ familyId: 'family-1', deviceId: 'family-device-1' })
  })
})

describe('Family Sync child deletion', () => {
  it('queues one child delete and lets the server cascade its sleep data', () => {
    const next = { ...previous, children: [previous.children[0]], sessions: [previous.sessions[0]], settings: { ...previous.settings, activeChildId: 'a' } }
    const operations = makeOperations(previous, next)
    expect(operations.map((operation) => `${operation.method} ${operation.path}`)).toEqual(['DELETE /v1/children/b'])
  })

  it('applies a remote child tombstone and removes that child’s local sessions', () => {
    const merged = mergeRemote(previous, [], [{ ...child('b'), deletedAt: at, revision: 3 }])
    expect(merged.children.map((item) => item.id)).toEqual(['a'])
    expect(merged.sessions.map((item) => item.id)).toEqual(['sleep-a'])
    expect(merged.settings.activeChildId).toBe('a')
  })
})

describe('local-only diary deletion', () => {
  it('clears the diary and sync connection without creating family delete operations or retaining the safety backup', async () => {
    const storage = new MemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: vi.fn() } })
    storage.setItem(STORAGE_KEY, JSON.stringify(previous))
    storage.setItem('solemiSleep:sync:v1', JSON.stringify({
      connection: { familyId: 'family-1', familyName: 'Teszt', deviceId: 'device-1', deviceToken: 'token-1', revision: 4 },
      pending: [], conflicts: [], missingSessions: []
    }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, data: { left: true } }), { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) })
    saveSafetyBackup(previous, 'before-import')

    await clearLocalDiary(createDefaultData('hu'))

    expect(loadData().sessions).toEqual([])
    expect(loadSafetyBackup()).toBeNull()
    expect(getSyncStore()).toMatchObject({ connection: null, pending: [], conflicts: [], missingSessions: [] })
    expect(storage.getItem('solemiSleep:detachedFamily')).toBe('family-1')
  })

  it('does not discard pending changes when disconnecting one device', async () => {
    const storage = new MemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: vi.fn() } })
    storage.setItem('solemiSleep:sync:v1', JSON.stringify({
      connection: { familyId: 'family-1', familyName: 'Teszt', deviceId: 'device-1', deviceToken: 'token-1', revision: 4 },
      pending: [{ id: 'pending-1', method: 'PATCH', path: '/v1/sessions/sleep-a',
        body: { operationId: 'mutation-1', baseRevision: 4, patch: { note: 'Megőrzendő' } } }],
      conflicts: [], missingSessions: []
    }))
    const fetchMock = vi.fn()
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })

    await expect(leaveFamily()).rejects.toThrow('FAMILY_DETACH_PENDING')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(getSyncStore().connection?.familyId).toBe('family-1')
    expect(getSyncStore().pending).toHaveLength(1)
    expect(storage.getItem('solemiSleep:detachedFamily')).toBeNull()
  })

  it('keeps the connection when the server cannot revoke the device', async () => {
    const storage = new MemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: vi.fn() } })
    storage.setItem('solemiSleep:sync:v1', JSON.stringify({
      connection: { familyId: 'family-1', familyName: 'Teszt', deviceId: 'device-1', deviceToken: 'token-1', revision: 4 },
      pending: [], conflicts: [], missingSessions: []
    }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: vi.fn().mockRejectedValue(new TypeError('offline')) })

    await expect(leaveFamily()).rejects.toThrow()

    expect(getSyncStore().connection?.deviceId).toBe('device-1')
    expect(storage.getItem('solemiSleep:detachedFamily')).toBeNull()
  })

  it('does not reconnect a deliberately detached device after reload', async () => {
    const storage = new MemoryStorage()
    const session = new MemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: vi.fn() } })
    storage.setItem('solemiSleep:detachedFamily', 'family-1')
    session.setItem('solemiSleep:accountAccess', JSON.stringify({
      account: { id: 'account-1', email: null, name: null }, deviceId: 'account-device-1',
      accessToken: 'account-token', accessExpiresAt: Date.now() + 60_000, expiresAt: Date.now() + 120_000
    }))
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: {
      membership: { familyId: 'family-1', role: 'MEMBER' }
    } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })

    await expect(reconcileAccountFamily()).resolves.toMatchObject({ connected: false, detached: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/auth/access')
    expect(getSyncStore().connection).toBeNull()
    expect(storage.getItem('solemiSleep:detachedFamily')).toBe('family-1')
  })
})

describe('Family Sync slow responses', () => {
  function setup(pending: unknown[] = []) {
    const storage = new MemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: vi.fn() } })
    storage.setItem(STORAGE_KEY, JSON.stringify(previous))
    storage.setItem('solemiSleep:sync:v1', JSON.stringify({
      connection: { familyId: 'family-1', familyName: 'Teszt', deviceId: 'device-1', deviceToken: 'token-1', revision: 4 },
      pending, conflicts: []
    }))
    return storage
  }

  const patch = { id: 'op-slow', method: 'PATCH', path: '/v1/sessions/sleep-a', sessionId: 'sleep-a',
    body: { operationId: 'mut-slow', baseRevision: 4, patch: { note: 'Első mentés' } } }
  const remote = { ...previous.sessions[0], note: 'Első mentés', deletedAt: null, revision: 5 }
  const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })

  it('sends a queued mutation only once when two flushes overlap', async () => {
    setup([patch])
    let release!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    const first = flushPending()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    // Keep separate releases so the pre-fix implementation can finish too.
    const releaseFirst = release
    const second = flushPending()
    await Promise.resolve()
    const calls = fetchMock.mock.calls.length
    releaseFirst(ok({ revision: 5, session: remote }))
    if (calls > 1) release(ok({ revision: 5, session: remote }))
    await Promise.all([first, second])
    expect(calls).toBe(1)
    expect(getSyncStore().pending).toEqual([])
  })

  it('does not replace a newer local edit with an older mutation response', async () => {
    const storage = setup([patch])
    let release!: (response: Response) => void
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve }))
      .mockRejectedValue(new Error('Temporarily offline'))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    const running = flushPending()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
    const next = { ...previous, sessions: previous.sessions.map((item) => item.id === 'sleep-a'
      ? { ...item, note: 'Újabb mentés' } : item) }
    saveLocalData(previous, next)
    release(ok({ revision: 5, session: remote }))
    await running
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).sessions.find((item: SleepSession) => item.id === 'sleep-a').note)
      .toBe('Újabb mentés')
    expect(getSyncStore().pending).toHaveLength(1)
    expect(getSyncStore().pending[0].body.baseRevision).toBe(5)
  })

  it('reports data changed by flushing even when the following download is empty', async () => {
    setup([patch])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ revision: 5, session: remote }))
      .mockResolvedValueOnce(ok({ revision: 5, sessions: [], children: [] }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    expect(await pullRemote()).toBe(true)
  })

  it('keeps edits made during a download and leaves the cursor available for reconciliation', async () => {
    const storage = setup()
    let release!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    const running = pullRemote()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
    const next = { ...previous, sessions: previous.sessions.map((item) => item.id === 'sleep-a'
      ? { ...item, note: 'Letöltés közben javítottam' } : item) }
    saveLocalData(previous, next)
    release(ok({ revision: 5, sessions: [{ ...remote, note: 'Másik telefon' }], children: [] }))
    await running
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).sessions.find((item: SleepSession) => item.id === 'sleep-a').note)
      .toBe('Letöltés közben javítottam')
    expect(getSyncStore().connection?.revision).toBe(4)
    expect(getSyncStore().pending).toHaveLength(1)
  })

  it('serializes overlapping downloads so an older response cannot roll the diary back', async () => {
    const storage = setup()
    let release!: (response: Response) => void
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve }))
      .mockResolvedValueOnce(ok({ revision: 6, sessions: [{ ...remote, note: 'Legújabb', revision: 6 }], children: [] }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    const first = pullRemote()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const second = pullRemote()
    await Promise.resolve()
    const callsBeforeRelease = fetchMock.mock.calls.length
    release(ok({ revision: 5, sessions: [remote], children: [] }))
    await Promise.all([first, second])
    expect(callsBeforeRelease).toBe(1)
    expect(getSyncStore().connection?.revision).toBe(6)
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).sessions.find((item: SleepSession) => item.id === 'sleep-a').note)
      .toBe('Legújabb')
  })

  it('does not apply an old family response after the connection changes', async () => {
    const storage = setup([patch])
    let release!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    const running = flushPending()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const newStore = { ...getSyncStore(), connection: { ...getSyncStore().connection!, familyId: 'family-2', deviceToken: 'token-2' }, pending: [] }
    storage.setItem('solemiSleep:sync:v1', JSON.stringify(newStore))
    release(ok({ revision: 5, session: remote }))
    await running
    expect(getSyncStore().connection?.familyId).toBe('family-2')
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).sessions[0].note).toBe('')
  })

  it.each([500, 401])('preserves and surfaces a failed upload (HTTP %s) instead of claiming success', async (status) => {
    setup([patch])
    const code = status === 401 ? 'SESSION_INVALID' : 'INTERNAL_ERROR'
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: false, error: { code, message: 'Test failure' }
    }), { status, headers: { 'Content-Type': 'application/json' } }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    await expect(pullRemote()).rejects.toMatchObject({ code })
    expect(getSyncStore().pending).toHaveLength(1)
    expect(getSyncStore().connection?.revision).toBe(4)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries the exact failed operation and clears the failure only after acknowledgement', async () => {
    setup([patch])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Test failure' } }), { status: 500 }))
      .mockResolvedValueOnce(ok({ revision: 5, session: remote }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    await expect(flushPending()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
    expect(getSyncStore().failure?.code).toBe('INTERNAL_ERROR')
    await flushPending()
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body)
    expect(getSyncStore().pending).toEqual([])
    expect(getSyncStore().failure).toBeUndefined()
  })

  it('releases the serialized queue after a hung upload and safely retries it', async () => {
    vi.useFakeTimers()
    setup([patch])
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(ok({ revision: 5, session: remote }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    const checked = expect(flushPending()).rejects.toMatchObject({ code: 'API_TIMEOUT' })
    const retry = flushPending()
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS)
    await checked
    await retry
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body)
    expect(getSyncStore().pending).toEqual([])
    expect(getSyncStore().failure).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('Family Sync first family download', () => {
  const starter: AppData = {
    version: 4,
    settings: { locale: 'hu', activeChildId: 'starter', longSleepReminderEnabled: false },
    children: [{ ...child('starter'), name: '' }],
    sessions: []
  }

  it('replaces the untouched unnamed starter profile with the family profile', () => {
    expect(isEmptyStarterData(starter)).toBe(true)
    const merged = mergeRemote(starter, [], [{ ...child('family-child'), deletedAt: null, revision: 1 }])
    expect(merged.children.map((item) => item.id)).toEqual(['family-child'])
    expect(merged.settings.activeChildId).toBe('family-child')
  })

  it('keeps a real local profile when family data arrives', () => {
    const named = { ...starter, children: [{ ...starter.children[0], name: 'Helyi baba' }] }
    expect(isEmptyStarterData(named)).toBe(false)
    const merged = mergeRemote(named, [], [{ ...child('family-child'), deletedAt: null, revision: 1 }])
    expect(merged.children.map((item) => item.id)).toEqual(['starter', 'family-child'])
  })

  it('cleans up a starter profile left beside an already downloaded family profile', () => {
    const previouslyMerged = {
      ...starter,
      children: [starter.children[0], child('family-child')],
      settings: { ...starter.settings, activeChildId: 'family-child' }
    }
    const merged = mergeRemote(previouslyMerged, [], [{ ...child('family-child'), deletedAt: null, revision: 2 }])
    expect(merged.children.map((item) => item.id)).toEqual(['family-child'])
    expect(merged.settings.activeChildId).toBe('family-child')
  })
})

describe('Family Sync offline queue', () => {
  it('keeps an offline change and flushes it after connectivity returns', async () => {
    const storage = new MemoryStorage()
    let online = false
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online } } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: vi.fn() } })

    storage.setItem('solemiSleep:sync:v1', JSON.stringify({
      connection: { familyId: 'family-1', familyName: 'Teszt', deviceId: 'device-1', deviceToken: 'token-1', revision: 1 },
      pending: []
    }))
    storage.setItem(STORAGE_KEY, JSON.stringify(previous))

    const offlineSleep = { ...sleep('offline-sleep', 'a'), note: 'Offline teszt' }
    const next = { ...previous, sessions: [...previous.sessions, offlineSleep] }
    saveLocalData(previous, next)

    expect(getSyncStore().pending).toHaveLength(1)
    expect(getSyncStore().pending[0]).toMatchObject({ method: 'POST', path: '/v1/sessions', sessionId: 'offline-sleep' })
    expect(getFamilyReplacementReadiness()).toMatchObject({ scope: 'family', ready: false, reason: 'offline' })

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { revision: 2, session: null } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    online = true
    expect(getFamilyReplacementReadiness()).toMatchObject({ scope: 'family', ready: false, reason: 'pending' })

    await flushPending()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getSyncStore().pending).toEqual([])
    expect(getFamilyReplacementReadiness()).toMatchObject({ scope: 'family', ready: true })
  })

  it('creates operations only for the child whose data changed', () => {
    const next = {
      ...previous,
      sessions: previous.sessions.map((item) => item.childId === 'a' ? { ...item, note: 'Csak A változott' } : item)
    }
    const operations = makeOperations(previous, next)
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({ method: 'PATCH', path: '/v1/sessions/sleep-a', sessionId: 'sleep-a' })
    expect(JSON.stringify(operations[0])).not.toContain('sleep-b')
  })

  it('keeps queued changes when the server pauses Family Sync', async () => {
    const storage = new MemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: vi.fn() } })
    storage.setItem('solemiSleep:sync:v1', JSON.stringify({
      connection: { familyId: 'family-1', familyName: 'Teszt', deviceId: 'device-1', deviceToken: 'token-1', revision: 1 },
      pending: [{ id: 'op-paused', method: 'PATCH', path: '/v1/sessions/sleep-a',
        sessionId: 'sleep-a', body: { operationId: 'mut-paused', patch: { note: 'Megőrzendő' } } }]
    }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: vi.fn(async () => new Response(JSON.stringify({
      ok: false, error: { code: 'FAMILY_SYNC_PAUSED', message: 'Family Sync is paused.' }
    }), { status: 403, headers: { 'Content-Type': 'application/json' } })) })

    await flushPending()

    expect(getSyncStore().pending).toHaveLength(1)
    expect(getSyncStore().pending[0].id).toBe('op-paused')
  })

  it('keeps a stale local edit and records an explicit server conflict', async () => {
    const storage = new MemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: vi.fn() } })
    storage.setItem('solemiSleep:sync:v1', JSON.stringify({
      connection: { familyId: 'family-1', familyName: 'Teszt', deviceId: 'device-1', deviceToken: 'token-1', revision: 4 },
      pending: [{ id: 'op-conflict', method: 'PATCH', path: '/v1/sessions/sleep-a',
        sessionId: 'sleep-a', body: { operationId: 'mut-conflict', baseRevision: 4, patch: { note: 'Helyi változat' } } }],
      conflicts: []
    }))
    storage.setItem(STORAGE_KEY, JSON.stringify(previous))
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: { code: 'SYNC_CONFLICT', message: 'This sleep changed on another device.' },
      data: { conflict: { entityType: 'SESSION', entityId: 'sleep-a', baseRevision: 4,
        serverRevision: 5, serverValue: { note: 'Másik telefon változata' } }
      }
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })

    await pullRemote()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getSyncStore().pending).toHaveLength(1)
    expect(getSyncStore().conflicts).toEqual([{
      operationId: 'op-conflict', entityType: 'SESSION', entityId: 'sleep-a',
      baseRevision: 4, serverRevision: 5,
      serverValue: { note: 'Másik telefon változata' }
    }])
  })

  it('retries with the server revision only after choosing the local version', async () => {
    const storage = new MemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: vi.fn() } })
    storage.setItem('solemiSleep:sync:v1', JSON.stringify({
      connection: { familyId: 'family-1', familyName: 'Teszt', deviceId: 'device-1', deviceToken: 'token-1', revision: 4 },
      pending: [{ id: 'op-conflict', method: 'PATCH', path: '/v1/sessions/sleep-a',
        sessionId: 'sleep-a', body: { operationId: 'mut-conflict', baseRevision: 4, patch: { note: 'Helyi változat' } } }],
      conflicts: [{ operationId: 'op-conflict', entityType: 'SESSION', entityId: 'sleep-a',
        baseRevision: 4, serverRevision: 5, serverValue: { id: 'sleep-a', childId: 'a',
          startTime: at, endTime: '2026-08-26T11:00:00.000Z', note: 'Családi változat',
          dayNightOverride: null, createdAt: at, updatedAt: at, deletedAt: null, revision: 5 } }]
    }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { revision: 6 } }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: {
        revision: 6, familyName: 'Teszt', children: [], sessions: []
      } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })

    await resolveSyncConflict('op-conflict', 'local')

    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(sent.baseRevision).toBe(5)
    expect(getSyncStore().pending).toEqual([])
    expect(getSyncStore().conflicts).toEqual([])
  })

  it('discards local operations for that sleep after choosing the family version', async () => {
    const storage = new MemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: vi.fn() } })
    storage.setItem(STORAGE_KEY, JSON.stringify(previous))
    const serverValue = { id: 'sleep-a', childId: 'a', startTime: at,
      endTime: '2026-08-26T11:00:00.000Z', note: 'Családi változat', dayNightOverride: null,
      createdAt: at, updatedAt: at, deletedAt: null, revision: 5 }
    storage.setItem('solemiSleep:sync:v1', JSON.stringify({
      connection: { familyId: 'family-1', familyName: 'Teszt', deviceId: 'device-1', deviceToken: 'token-1', revision: 4 },
      pending: [
        { id: 'op-conflict', method: 'PATCH', path: '/v1/sessions/sleep-a', sessionId: 'sleep-a',
          body: { operationId: 'mut-conflict', baseRevision: 4, patch: { note: 'Helyi változat' } } },
        { id: 'op-later', method: 'PATCH', path: '/v1/sessions/sleep-a', sessionId: 'sleep-a',
          body: { operationId: 'mut-later', baseRevision: 4, patch: { startTime: at } } }
      ],
      conflicts: [{ operationId: 'op-conflict', entityType: 'SESSION', entityId: 'sleep-a',
        baseRevision: 4, serverRevision: 5, serverValue }]
    }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, data: {
        revision: 5, familyName: 'Teszt', children: [], sessions: []
      } }), { status: 200, headers: { 'Content-Type': 'application/json' } })) })

    await resolveSyncConflict('op-conflict', 'family')

    expect(getSyncStore().pending).toEqual([])
    expect(getSyncStore().conflicts).toEqual([])
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).sessions.find((item: SleepSession) => item.id === 'sleep-a').note)
      .toBe('Családi változat')
  })
})

describe('Family Sync crash-safe local persistence', () => {
  function install(storage: Storage, online = false) {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: online, language: 'hu-HU' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: vi.fn() } })
  }

  function connectedStore() {
    return {
      connection: { familyId: 'family-1', familyName: 'Teszt', deviceId: 'device-1', deviceToken: 'token-1', revision: 4 },
      pending: [], conflicts: []
    }
  }

  it('commits the diary change and its durable outbox in one storage value', () => {
    const storage = new MemoryStorage()
    install(storage)
    storage.setItem(STORAGE_KEY, JSON.stringify(previous))
    storage.setItem('solemiSleep:sync:v1', JSON.stringify(connectedStore()))
    const added = { ...sleep('sleep-new', 'a'), note: 'Atomi mentés' }
    const next = { ...previous, sessions: [...previous.sessions, added] }

    saveLocalData(previous, next)

    const envelope = JSON.parse(storage.getItem(STORAGE_KEY)!)
    expect(envelope.sessions.some((item: SleepSession) => item.id === 'sleep-new')).toBe(true)
    expect(envelope.__solemiLocal.familySyncV1.pending).toHaveLength(1)
    expect(envelope.__solemiLocal.familySyncV1.pending[0]).toMatchObject({ method: 'POST', sessionId: 'sleep-new' })
    expect(storage.getItem('solemiSleep:sync:v1')).toBeNull()
  })

  it('accepts neither the diary edit nor the outbox operation when quota rejects the atomic write', () => {
    const backing = new MemoryStorage()
    backing.setItem(STORAGE_KEY, JSON.stringify(previous))
    const legacy = JSON.stringify(connectedStore())
    backing.setItem('solemiSleep:sync:v1', legacy)
    const quotaStorage: Storage = {
      get length() { return backing.length },
      clear: () => backing.clear(),
      getItem: (key) => backing.getItem(key),
      key: (index) => backing.key(index),
      removeItem: (key) => backing.removeItem(key),
      setItem: (key, value) => {
        if (key === STORAGE_KEY) throw new Error('quota')
        backing.setItem(key, value)
      }
    }
    install(quotaStorage)
    const next = { ...previous, sessions: [...previous.sessions, sleep('sleep-rejected', 'a')] }

    expect(() => saveLocalData(previous, next)).toThrow(DataStorageError)
    expect(JSON.parse(backing.getItem(STORAGE_KEY)!).sessions).toEqual(previous.sessions)
    expect(backing.getItem('solemiSleep:sync:v1')).toBe(legacy)
  })

  it('blocks saving when the durable outbox is damaged instead of silently discarding it', () => {
    const storage = new MemoryStorage()
    install(storage)
    const originalDiary = JSON.stringify(previous)
    storage.setItem(STORAGE_KEY, originalDiary)
    storage.setItem('solemiSleep:sync:v1', '{broken')
    const next = { ...previous, sessions: [...previous.sessions, sleep('sleep-blocked', 'a')] }

    expect(getSyncStore().failure?.code).toBe('LOCAL_SYNC_STORE_CORRUPT')
    expect(() => saveLocalData(previous, next)).toThrow('LOCAL_SYNC_STORE_CORRUPT')
    expect(storage.getItem(STORAGE_KEY)).toBe(originalDiary)
    expect(storage.getItem('solemiSleep:sync:v1')).toBe('{broken')
  })
})
