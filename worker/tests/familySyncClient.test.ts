import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import worker from '../src/index'
import { sqliteBinding } from './sqliteD1'
import { flushPending, getSyncStore, pullRemote, queueLocalChange, resolveSyncConflict } from '../../src/familySync'
import { REMOTE_DATA_EVENT, STORAGE_KEY, loadData, saveData } from '../../src/storage'
import type { AppData } from '../../src/types'

class DeviceStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const at = '2026-08-26T10:00:00.000Z'
const initial: AppData = {
  version: 4, settings: { locale: 'hu', activeChildId: 'child-a', longSleepReminderEnabled: false },
  children: [{ id: 'child-a', name: 'Baba', birthDate: null, photoRef: null, createdAt: at, updatedAt: at }],
  sessions: [{ id: 'shared-sleep', childId: 'child-a', startTime: at, endTime: '2026-08-26T11:00:00.000Z',
    note: '', dayNightOverride: null, createdAt: at, updatedAt: at }]
}

let sqlite: DatabaseSync
let env: { DB: D1Database; TOKEN_PEPPER: string; ALLOWED_ORIGINS: string; RECONCILIATION_CONFLICTS: string }
let devices: { storage: DeviceStorage; window: EventTarget; displayed: AppData; updates: number }[]

beforeEach(async () => {
  vi.stubEnv('VITE_ACCOUNT_AUTH', 'false')
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  env = { DB: sqliteBinding(sqlite), TOKEN_PEPPER: 'local-test-only', ALLOWED_ORIGINS: '', RECONCILIATION_CONFLICTS: 'true' }
  sqlite.prepare('INSERT INTO families (id, name, revision, created_at) VALUES (?, ?, ?, ?)')
    .run('family-a', 'Teszt', 2, at)
  sqlite.prepare(`INSERT INTO children
    (id, family_id, name, birth_date, created_at, updated_at, deleted_at, revision)
    VALUES ('child-a', 'family-a', 'Baba', NULL, ?, ?, NULL, 1)`).run(at, at)
  sqlite.prepare(`INSERT INTO sleep_sessions
    (id, family_id, child_id, start_time, end_time, note, day_night_override, created_at, updated_at, deleted_at, revision)
    VALUES ('shared-sleep', 'family-a', 'child-a', ?, ?, '', NULL, ?, ?, NULL, 2)`)
    .run(at, initial.sessions[0].endTime, at, at)
  devices = []
  for (const index of [0, 1]) {
    const token = `test-device-token-${index}`
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.TOKEN_PEPPER}:${token}`))
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    sqlite.prepare(`INSERT INTO devices (id, family_id, token_hash, name, created_at, last_seen_at, revoked_at)
      VALUES (?, 'family-a', ?, ?, ?, ?, NULL)`).run(`device-${index}`, hash, `Phone ${index}`, at, at)
    const device = { storage: new DeviceStorage(), window: new EventTarget(), displayed: structuredClone(initial), updates: 0 }
    device.storage.setItem(STORAGE_KEY, JSON.stringify(initial))
    device.storage.setItem('solemiSleep:sync:v1', JSON.stringify({
      connection: { familyId: 'family-a', familyName: 'Teszt', deviceId: `device-${index}`, deviceToken: token, revision: 2 },
      pending: [], conflicts: []
    }))
    device.window.addEventListener('solemi-data-saved', (event) => {
      const { previous, next, baseRevision } = (event as CustomEvent<{ previous: AppData; next: AppData; baseRevision?: number }>).detail
      queueLocalChange(previous, next, baseRevision)
    })
    device.window.addEventListener(REMOTE_DATA_EVENT, () => {
      device.displayed = loadData()
      device.updates += 1
    })
    devices.push(device)
  }
  // Transport goes straight to the actual Worker and SQLite adapter; no network or remote D1.
  vi.stubGlobal('fetch', (url: string, options: RequestInit) => worker.fetch(new Request(url, options), env))
})

afterEach(() => {
  sqlite.close()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function useDevice(index: number, online: boolean) {
  vi.stubGlobal('localStorage', devices[index].storage)
  vi.stubGlobal('window', devices[index].window)
  vi.stubGlobal('navigator', { onLine: online, language: 'hu-HU' })
}

async function editOffline(index: number, startTime: string, note: string) {
  useDevice(index, false)
  const data = loadData()
  devices[index].displayed = { ...data, sessions: data.sessions.map((sleep) => ({ ...sleep, startTime, note, updatedAt: new Date().toISOString() })) }
  saveData(devices[index].displayed)
  // Let the queued offline flush settle before switching the simulated browser globals.
  await pullRemote()
}

describe('two device client + Worker reconciliation', () => {
  it('accepts a second edit after this device uploaded the first edit but has not polled yet', async () => {
    await editOffline(0, '2026-08-26T09:50:00.000Z', 'Első saját javítás')
    useDevice(0, true)
    await flushPending()
    expect(getSyncStore().connection?.revision).toBe(2)
    expect(getSyncStore().pending).toEqual([])
    await editOffline(0, '2026-08-26T09:40:00.000Z', 'Második saját javítás')
    useDevice(0, true)
    await pullRemote()
    expect(getSyncStore().conflicts).toEqual([])
    expect(getSyncStore().pending).toEqual([])
    expect(sqlite.prepare("SELECT start_time, note FROM sleep_sessions WHERE id = 'shared-sleep'").get())
      .toEqual({ start_time: '2026-08-26T09:40:00.000Z', note: 'Második saját javítás' })
  })

  it('conflicts a stale open editor even after its device has downloaded the newer diary', async () => {
    useDevice(1, false)
    const openedRevision = getSyncStore().connection!.revision
    const opened = loadData()
    await editOffline(0, '2026-08-26T09:50:00.000Z', 'Másik telefon javítása')
    useDevice(0, true)
    await pullRemote()
    useDevice(1, true)
    await pullRemote()
    expect(getSyncStore().connection!.revision).toBeGreaterThan(openedRevision)

    useDevice(1, false)
    saveData({ ...opened, sessions: opened.sessions.map((sleep) => ({ ...sleep, note: 'Régebben megnyitott űrlap' })) }, openedRevision)
    await pullRemote()
    useDevice(1, true)
    await pullRemote()
    expect(getSyncStore().conflicts).toHaveLength(1)
    expect(getSyncStore().conflicts[0].baseRevision).toBe(openedRevision)
    expect(sqlite.prepare("SELECT note FROM sleep_sessions WHERE id = 'shared-sleep'").get())
      .toEqual({ note: 'Másik telefon javítása' })
  })

  it.each(['local', 'family'] as const)('converges to one sleep after choosing the %s version', async (choice) => {
    await editOffline(0, '2026-08-26T09:50:00.000Z', 'Első telefon')
    await editOffline(1, '2026-08-26T09:40:00.000Z', 'Második telefon')
    await editOffline(1, '2026-08-26T09:35:00.000Z', 'Második telefon újabb javítása')

    useDevice(0, true)
    await pullRemote()
    expect(getSyncStore().pending).toEqual([])

    useDevice(1, true)
    await pullRemote()
    expect(getSyncStore().conflicts).toHaveLength(1)
    expect(loadData().sessions[0].startTime).toBe('2026-08-26T09:35:00.000Z')
    const conflict = getSyncStore().conflicts[0]
    await resolveSyncConflict(conflict.operationId, choice)
    expect(getSyncStore().pending).toEqual([])
    expect(getSyncStore().conflicts).toEqual([])
    const expected = choice === 'local' ? '2026-08-26T09:35:00.000Z' : '2026-08-26T09:50:00.000Z'
    expect(loadData().sessions).toHaveLength(1)
    expect(devices[1].displayed.sessions[0].startTime).toBe(expected)

    useDevice(0, true)
    await pullRemote()
    expect(loadData().sessions).toHaveLength(1)
    expect(loadData().sessions[0].id).toBe('shared-sleep')
    expect(loadData().sessions[0].startTime).toBe(expected)
    expect(loadData().sessions).toEqual(JSON.parse(devices[1].storage.getItem(STORAGE_KEY)!).sessions)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM sleep_sessions WHERE deleted_at IS NULL').get())
      .toEqual({ count: 1 })

    // Re-saving the displayed authoritative data must not upload it as a fresh edit.
    saveData(devices[0].displayed)
    expect(getSyncStore().pending).toEqual([])
  })

  it('adopts the existing active sleep without recursively running the upload queue', async () => {
    sqlite.prepare(`UPDATE sleep_sessions SET end_time = NULL WHERE id = 'shared-sleep'`).run()
    useDevice(1, true)
    await pullRemote(true)
    useDevice(0, false)
    const data = loadData()
    devices[0].displayed = { ...data, sessions: [...data.sessions, { ...data.sessions[0], id: 'competing-start', endTime: null }] }
    saveData(devices[0].displayed)
    await pullRemote()
    useDevice(0, true)
    await pullRemote()
    expect(getSyncStore().pending).toEqual([])
    expect(loadData().sessions).toHaveLength(1)
    expect(loadData().sessions[0]).toMatchObject({ id: 'shared-sleep', endTime: null })
    // The rendered state must forget the rejected draft too, otherwise the next
    // unrelated edit would save it again and queue a second creation.
    saveData(devices[0].displayed)
    expect(getSyncStore().pending).toEqual([])
    expect(loadData().sessions).toHaveLength(1)
  })
})
