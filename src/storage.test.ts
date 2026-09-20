import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import demoBackup from '../test-data/solemi-demo-v4-2026-08-26.json'
import { DataStorageError, ImportValidationError, LEGACY_STORAGE_KEY, STORAGE_KEY, inspectBackup, loadData, loadDataResult, migrateV3, recoverData, saveData, saveRemoteData } from './storage'
import type { AppData, ChildProfile, SleepSession } from './types'

const child: ChildProfile = { id: 'child-1', name: 'Mira', birthDate: null, photoRef: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }
const sleep: SleepSession = { id: 'sleep-1', childId: child.id, startTime: '2026-08-20T10:00:00.000Z', endTime: '2026-08-20T11:00:00.000Z', note: '', dayNightOverride: null, createdAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T11:00:00.000Z' }

function backup(dataPatch: Partial<AppData> = {}) {
  const data: AppData = { version: 4, settings: { locale: 'hu', activeChildId: child.id, longSleepReminderEnabled: false }, children: [child], sessions: [sleep], ...dataPatch }
  return { format: 'solemi-sleep-backup', version: 4, exportedAt: '2026-08-25T12:00:00.000Z', data }
}

function expectCode(run: () => unknown, code: ImportValidationError['code']) {
  try { run(); throw new Error('Expected import to fail') } catch (error) {
    expect(error).toBeInstanceOf(ImportValidationError)
    expect((error as ImportValidationError).code).toBe(code)
  }
}

describe('inspectBackup', () => {
  it('accepts the bundled two-child demo backup', () => {
    const result = inspectBackup(demoBackup)

    expect(result.data.children.map((item) => item.name)).toEqual(['Boti', 'Frici'])
    expect(result.data.sessions).toHaveLength(154)
    expect(new Set(result.data.sessions.map((item) => item.childId))).toEqual(new Set(['child_demo_boti', 'child_demo_frici']))
    expect(result.diagnostics).toEqual([])
  })

  it('accepts a clean V4 backup', () => {
    const result = inspectBackup(backup())
    expect(result.data.sessions).toHaveLength(1)
    expect(result.diagnostics).toEqual([])
  })

  it('round-trips two children without mixing their sleep data', () => {
    const secondChild: ChildProfile = { ...child, id: 'child-2', name: 'Noel' }
    const secondSleep: SleepSession = { ...sleep, id: 'sleep-2', childId: secondChild.id, note: 'Második gyerek' }
    const source = backup({ children: [child, secondChild], sessions: [sleep, secondSleep] })
    const result = inspectBackup(JSON.parse(JSON.stringify(source)))

    expect(result.data.children.map((item) => item.id)).toEqual(['child-1', 'child-2'])
    expect(result.data.sessions.filter((item) => item.childId === 'child-1').map((item) => item.id)).toEqual(['sleep-1'])
    expect(result.data.sessions.filter((item) => item.childId === 'child-2').map((item) => item.id)).toEqual(['sleep-2'])
  })

  it('removes only fully identical duplicate records', () => {
    const result = inspectBackup(backup({ children: [child, child], sessions: [sleep, sleep] }))
    expect(result.data.children).toHaveLength(1)
    expect(result.data.sessions).toHaveLength(1)
    expect(result.diagnostics.map((item) => item.kind)).toEqual(['identical-children-removed', 'identical-sessions-removed'])
  })

  it('blocks conflicting records that share an ID', () => {
    expectCode(() => inspectBackup(backup({ sessions: [sleep, { ...sleep, note: 'different' }] })), 'duplicate-session-conflict')
  })

  it('blocks sessions pointing to a missing child', () => {
    expectCode(() => inspectBackup(backup({ sessions: [{ ...sleep, childId: 'missing' }] })), 'orphan-sessions')
  })

  it('reports the number of invalid sessions', () => {
    try { inspectBackup(backup({ sessions: [{ ...sleep, endTime: 'bad-date' }] })) } catch (error) {
      expect((error as ImportValidationError).code).toBe('invalid-sessions')
      expect((error as ImportValidationError).count).toBe(1)
    }
  })

  it('repairs a missing active child selection and reports it', () => {
    const result = inspectBackup(backup({ settings: { locale: 'hu', activeChildId: 'missing', longSleepReminderEnabled: false } }))
    expect(result.data.settings.activeChildId).toBe(child.id)
    expect(result.diagnostics[0].kind).toBe('active-child-reset')
  })
})

describe('migrateV3', () => {
  it('preserves every legacy sleep field and assigns one migrated child', () => {
    const legacySleep = {
      id: 'legacy-sleep',
      startTime: '2026-08-20T20:00:00.000Z',
      endTime: '2026-08-21T06:00:00.000Z',
      note: 'Régi megjegyzés',
      createdAt: '2026-08-20T20:00:00.000Z',
      updatedAt: '2026-08-21T06:00:00.000Z'
    }
    const migrated = migrateV3({ version: 3, settings: { childName: 'Régi profil', locale: 'hu' }, sessions: [legacySleep] })

    expect(migrated?.version).toBe(4)
    expect(migrated?.children).toHaveLength(1)
    expect(migrated?.children[0].name).toBe('Régi profil')
    expect(migrated?.sessions[0]).toEqual({ ...legacySleep, childId: migrated?.children[0].id, dayNightOverride: null })
  })
})

describe('protected local storage loading', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  let values: Map<string, string>
  let storage: Storage

  beforeEach(() => {
    values = new Map()
    storage = {
      get length() { return values.size },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => Array.from(values.keys())[index] ?? null,
      removeItem: (key) => { values.delete(key) },
      setItem: (key, value) => { values.set(key, String(value)) }
    }
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  })

  afterEach(() => {
    if (originalDescriptor) Object.defineProperty(globalThis, 'localStorage', originalDescriptor)
    else delete (globalThis as { localStorage?: Storage }).localStorage
  })

  it('keeps malformed V4 bytes and never falls back to legacy data', () => {
    const damaged = '{"version":4,"sessions":['
    values.set(STORAGE_KEY, damaged)
    values.set(LEGACY_STORAGE_KEY, JSON.stringify({ version: 3, settings: { childName: 'Legacy' }, sessions: [] }))

    const result = loadDataResult()

    expect(result.status).toBe('recovery-required')
    expect(result.error).toMatchObject({ code: 'corrupt-v4', source: 'v4', raw: damaged })
    expect(values.get(STORAGE_KEY)).toBe(damaged)
  })

  it('keeps structurally invalid V4 data instead of replacing it', () => {
    const damaged = JSON.stringify({ version: 4, settings: {}, children: [], sessions: [] })
    values.set(STORAGE_KEY, damaged)

    expect(loadDataResult()).toMatchObject({ status: 'recovery-required', error: { code: 'corrupt-v4', raw: damaged } })
    expect(values.get(STORAGE_KEY)).toBe(damaged)
  })

  it('keeps malformed V3 bytes and does not create a V4 diary', () => {
    const damaged = '{bad legacy json'
    values.set(LEGACY_STORAGE_KEY, damaged)

    expect(loadDataResult()).toMatchObject({ status: 'recovery-required', error: { code: 'corrupt-v3', source: 'v3', raw: damaged } })
    expect(values.get(LEGACY_STORAGE_KEY)).toBe(damaged)
    expect(values.has(STORAGE_KEY)).toBe(false)
  })

  it('migrates valid V3 data only after successful validation and storage', () => {
    values.set(LEGACY_STORAGE_KEY, JSON.stringify({ version: 3, settings: { childName: 'Legacy', locale: 'hu' }, sessions: [] }))

    const result = loadDataResult()

    expect(result.status).toBe('migrated')
    expect(result.data.children[0].name).toBe('Legacy')
    expect(JSON.parse(values.get(STORAGE_KEY)!)).toEqual(result.data)
  })

  it('reports inaccessible browser storage without attempting a write', () => {
    let writes = 0
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      ...storage,
      getItem: () => { throw new Error('blocked') },
      setItem: () => { writes += 1 }
    } })

    expect(loadDataResult()).toMatchObject({ status: 'recovery-required', error: { code: 'storage-unavailable', raw: null } })
    expect(writes).toBe(0)
  })

  it('keeps valid legacy data when the migrated V4 write fails', () => {
    const legacy = JSON.stringify({ version: 3, settings: { childName: 'Legacy', locale: 'hu' }, sessions: [] })
    values.set(LEGACY_STORAGE_KEY, legacy)
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      ...storage,
      getItem: storage.getItem.bind(storage),
      setItem: (key: string, value: string) => {
        if (key === STORAGE_KEY) throw new Error('quota')
        storage.setItem(key, value)
      }
    } })

    expect(loadDataResult()).toMatchObject({ status: 'recovery-required', error: { code: 'migration-write-failed', raw: legacy } })
    expect(values.get(LEGACY_STORAGE_KEY)).toBe(legacy)
    expect(values.has(STORAGE_KEY)).toBe(false)
  })

  it('blocks normal reads and saves while damaged bytes are present', () => {
    const damaged = '{broken'
    values.set(STORAGE_KEY, damaged)

    expect(() => loadData()).toThrow(DataStorageError)
    expect(() => saveData(backup().data)).toThrow(DataStorageError)
    expect(() => saveRemoteData(backup().data)).toThrow(DataStorageError)
    expect(values.get(STORAGE_KEY)).toBe(damaged)
  })

  it('replaces damaged bytes only through explicit recovery with valid data', () => {
    values.set(STORAGE_KEY, '{broken')

    recoverData(backup().data)

    expect(loadData()).toEqual(backup().data)
  })

  it('rejects invalid recovery and remote data without touching damaged bytes', () => {
    const damaged = '{broken'
    values.set(STORAGE_KEY, damaged)
    const invalid = { ...backup().data, children: [] }

    expect(() => recoverData(invalid)).toThrow(DataStorageError)
    expect(() => saveRemoteData(invalid)).toThrow(DataStorageError)
    expect(values.get(STORAGE_KEY)).toBe(damaged)
  })

  it('marks a missing diary as empty without writing during the read', () => {
    const result = loadDataResult()

    expect(result.status).toBe('empty')
    expect(result.data.sessions).toEqual([])
    expect(values.size).toBe(0)
  })
})
