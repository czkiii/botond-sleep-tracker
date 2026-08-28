import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPending, getSyncStore, makeOperations, mergeRemote, queueLocalChange } from './familySync'
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
})
