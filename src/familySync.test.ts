import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPending, getSyncStore, isEmptyStarterData, makeOperations, mergeRemote, pullRemote, queueLocalChange, resolveSyncConflict } from './familySync'
import { STORAGE_KEY } from './storage'
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
  fetch: Object.getOwnPropertyDescriptor(globalThis, 'fetch')
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
  vi.restoreAllMocks()
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

    const offlineSleep = { ...sleep('offline-sleep', 'a'), note: 'Offline teszt' }
    const next = { ...previous, sessions: [...previous.sessions, offlineSleep] }
    queueLocalChange(previous, next)

    expect(getSyncStore().pending).toHaveLength(1)
    expect(getSyncStore().pending[0]).toMatchObject({ method: 'POST', path: '/v1/sessions', sessionId: 'offline-sleep' })

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { revision: 2, session: null } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    online = true

    await flushPending()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getSyncStore().pending).toEqual([])
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
