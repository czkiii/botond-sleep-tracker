import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import worker from '../src/index'
import { sqliteBinding } from './sqliteD1'
import { acceptFamilyBootstrap, flushPending, getSyncStore, joinFamily, prepareFamilyBootstrap, pullRemote, resolveSyncConflict, restoreMissingSession, saveLocalData } from '../../src/familySync'
import { REMOTE_DATA_EVENT, STORAGE_KEY, loadData, loadSafetyBackup } from '../../src/storage'
import type { AppData } from '../../src/types'
import { prepareFamilyReplacement } from '../../src/dataReplacement'

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
  saveLocalData(data, devices[index].displayed)
  // Let the queued offline flush settle before switching the simulated browser globals.
  await pullRemote()
}

describe('two device client + Worker reconciliation', () => {
  const api = (path: string, method: string, body: unknown) => worker.fetch(new Request(`https://sync.example${path}`, {
    method, headers: { Authorization: 'Bearer test-device-token-0', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }), env)

  it('joins a real family without uploading or mixing a different same-name local child', async () => {
    const response = await api('/v1/invites', 'POST', {})
    const invite = await response.json() as { data: { code: string } }
    useDevice(1, true)
    devices[1].storage.removeItem('solemiSleep:sync:v1')
    const local: AppData = { ...initial, children: [{ ...initial.children[0], id: 'foreign-child' }],
      settings: { ...initial.settings, activeChildId: 'foreign-child' },
      sessions: [{ ...initial.sessions[0], id: 'foreign-sleep', childId: 'foreign-child', endTime: null }] }
    devices[1].storage.setItem(STORAGE_KEY, JSON.stringify(local))
    expect(await joinFamily(invite.data.code, 'New phone')).toMatchObject({ needsReview: true })
    const preview = await prepareFamilyBootstrap()
    expect(loadData()).toEqual(local)
    expect(preview.data.children.map(c => c.id)).toEqual(['child-a'])
    acceptFamilyBootstrap(preview)
    await pullRemote()
    expect(loadData().sessions.map(s => s.id)).toEqual(['shared-sleep'])
    expect(loadSafetyBackup()?.data).toEqual(local)
    expect(sqlite.prepare('SELECT id FROM children WHERE deleted_at IS NULL').all()).toEqual([{ id: 'child-a' }])
    expect(sqlite.prepare('SELECT id FROM sleep_sessions WHERE deleted_at IS NULL').all()).toEqual([{ id: 'shared-sleep' }])
  })

  it('preserves both fields when another child patch commits after the first request read', async () => {
    const originalBatch = env.DB.batch.bind(env.DB)
    let injected = false
    env.DB.batch = async statements => {
      if (!injected) {
        injected = true
        expect((await api('/v1/children/child-a', 'PATCH', { operationId: 'birthday', baseRevision: 2, expected: { birthDate: null }, patch: { birthDate: '2025-08-23' } })).status).toBe(200)
      }
      return originalBatch(statements)
    }
    expect((await api('/v1/children/child-a', 'PATCH', { operationId: 'rename', baseRevision: 2, expected: { name: 'Baba' }, patch: { name: 'Boti' } })).status).toBe(200)
    expect(sqlite.prepare("SELECT name, birth_date FROM children WHERE id = 'child-a'").get())
      .toEqual({ name: 'Boti', birth_date: '2025-08-23' })
    useDevice(0, true); await pullRemote()
    expect(loadData().children[0]).toMatchObject({ name: 'Boti', birthDate: '2025-08-23' })
  })

  it.each(['start', 'completed', 'patch-child'])('rejects %s if the child was deleted between validation and commit', async kind => {
    await api('/v1/children', 'POST', { operationId: 'add-b', child: { id: 'child-b', name: 'Másik' } })
    const originalBatch = env.DB.batch.bind(env.DB)
    let injected = false
    let revisionAfterDelete = 0
    env.DB.batch = async statements => {
      if (!injected) {
        injected = true
        expect((await api('/v1/children/child-a', 'DELETE', { operationId: 'remove-a' })).status).toBe(200)
        revisionAfterDelete = Number(sqlite.prepare("SELECT revision FROM families WHERE id = 'family-a'").get()!.revision)
      }
      return originalBatch(statements)
    }
    const response = kind === 'patch-child'
      ? await api('/v1/children/child-a', 'PATCH', { operationId: 'losing-op', baseRevision: 3, patch: { name: 'Too late' } })
      : kind === 'start'
        ? await api('/v1/sessions/start', 'POST', { operationId: 'losing-op', sessionId: 'new-sleep', childId: 'child-a', startTime: at })
        : await api('/v1/sessions', 'POST', { operationId: 'losing-op', session: { ...initial.sessions[0], id: 'new-sleep' } })
    expect(response.status).toBe(kind === 'patch-child' ? 409 : 404)
    expect(await response.json()).toMatchObject({ error: { code: kind === 'patch-child' ? 'CHILD_DELETED' : 'CHILD_NOT_FOUND' } })
    expect(sqlite.prepare("SELECT id FROM operations WHERE id = 'losing-op'").get()).toBeUndefined()
    expect(sqlite.prepare("SELECT id FROM sleep_sessions WHERE child_id = 'child-a' AND deleted_at IS NULL").all()).toEqual([])
    expect(Number(sqlite.prepare("SELECT revision FROM families WHERE id = 'family-a'").get()!.revision)).toBe(revisionAfterDelete)
  })

  it('includes a start committed just before a child deletion in the cascade', async () => {
    await api('/v1/children', 'POST', { operationId: 'add-b', child: { id: 'child-b', name: 'Másik' } })
    const originalBatch = env.DB.batch.bind(env.DB)
    let injected = false
    env.DB.batch = async statements => {
      if (!injected) {
        injected = true
        expect((await api('/v1/sessions/start', 'POST', { operationId: 'start-first', sessionId: 'new-sleep', childId: 'child-a', startTime: at })).status).toBe(201)
      }
      return originalBatch(statements)
    }
    expect((await api('/v1/children/child-a', 'DELETE', { operationId: 'delete-after-start' })).status).toBe(200)
    expect(sqlite.prepare("SELECT deleted_at FROM sleep_sessions WHERE id = 'new-sleep'").get()!.deleted_at).not.toBeNull()
  })

  it.each(['local', 'family'] as const)('resolves two offline edits of the same child name by explicit %s choice', async choice => {
    for (const index of [0, 1]) {
      useDevice(index, false)
      const before = loadData()
      saveLocalData(before, { ...before, children: before.children.map(c => ({ ...c, name: index === 0 ? 'Első név' : 'Második név' })) })
      await flushPending()
    }
    useDevice(0, true); await pullRemote()
    useDevice(1, true); await pullRemote()
    const conflict = getSyncStore().conflicts[0]
    expect(conflict).toMatchObject({ entityType: 'CHILD', entityId: 'child-a', serverValue: { name: 'Első név' } })
    expect(loadData().children[0].name).toBe('Második név')
    expect(getSyncStore().pending).toHaveLength(1)
    await resolveSyncConflict(conflict.operationId, choice)
    expect(getSyncStore().conflicts).toEqual([])
    expect(getSyncStore().pending).toEqual([])
    expect(loadData().children[0].name).toBe(choice === 'local' ? 'Második név' : 'Első név')
    useDevice(0, true); await pullRemote()
    expect(loadData().children[0].name).toBe(choice === 'local' ? 'Második név' : 'Első név')
    expect(loadData().sessions).toHaveLength(1)
  })

  it('detects a same-field write committed after child validation without consuming the losing operation', async () => {
    const originalBatch = env.DB.batch.bind(env.DB)
    let injected = false
    env.DB.batch = async statements => {
      if (!injected) {
        injected = true
        await api('/v1/children/child-a', 'PATCH', { operationId: 'winner', baseRevision: 2,
          expected: { name: 'Baba' }, patch: { name: 'Másik telefon' } })
      }
      return originalBatch(statements)
    }
    const response = await api('/v1/children/child-a', 'PATCH', { operationId: 'loser', baseRevision: 2,
      expected: { name: 'Baba' }, patch: { name: 'Helyi név' } })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ data: { conflict: { entityType: 'CHILD', serverValue: { name: 'Másik telefon' } } } })
    expect(sqlite.prepare("SELECT id FROM operations WHERE id = 'loser'").get()).toBeUndefined()
    expect(sqlite.prepare("SELECT revision FROM families WHERE id = 'family-a'").get()!.revision).toBe(3)
  })

  it('uses the revision guard for queued child patches from the previous client version', async () => {
    await api('/v1/children/child-a', 'PATCH', { operationId: 'first', baseRevision: 2, patch: { name: 'Új név' } })
    const stale = await api('/v1/children/child-a', 'PATCH', { operationId: 'old-client', baseRevision: 2, patch: { name: 'Régi változat' } })
    expect(stale.status).toBe(409)
    expect(sqlite.prepare("SELECT name FROM children WHERE id = 'child-a'").get()!.name).toBe('Új név')
  })

  it('imports a formerly completed sleep as active and converges on both devices', async () => {
    useDevice(0, false)
    const before = loadData()
    const incoming = { ...before, sessions: before.sessions.map(s => ({ ...s, endTime: null, note: 'Visszaállított aktív alvás' })) }
    const next = prepareFamilyReplacement(before, incoming)
    expect(next.sessions[0].id).not.toBe(before.sessions[0].id)
    saveLocalData(before, next)
    await flushPending()
    useDevice(0, true); await pullRemote()
    expect(getSyncStore().pending).toEqual([])
    expect(loadData().sessions).toHaveLength(1)
    expect(loadData().sessions[0]).toMatchObject({ endTime: null, note: 'Visszaállított aktív alvás' })
    const activeId = loadData().sessions[0].id
    useDevice(1, true); await pullRemote()
    expect(loadData().sessions).toHaveLength(1)
    expect(loadData().sessions[0]).toMatchObject({ id: activeId, endTime: null })
    expect(sqlite.prepare("SELECT deleted_at FROM sleep_sessions WHERE id = 'shared-sleep'").get()!.deleted_at).not.toBeNull()
  })

  it.each(['before', 'after'])('keeps the cursor consistent with a write immediately %s the download snapshot', async boundary => {
    useDevice(0, true)
    const originalBatch = env.DB.batch.bind(env.DB)
    let injected = false
    const mutate = () => {
      sqlite.prepare("UPDATE families SET revision = 3 WHERE id = 'family-a'").run()
      sqlite.prepare("UPDATE sleep_sessions SET note = 'Next revision', revision = 3 WHERE id = 'shared-sleep'").run()
    }
    env.DB.batch = async statements => {
      if (injected) return originalBatch(statements)
      injected = true
      if (boundary === 'before') mutate()
      const result = await originalBatch(statements)
      if (boundary === 'after') mutate()
      return result
    }
    await pullRemote()
    expect(injected).toBe(true)
    expect(getSyncStore().connection?.revision).toBe(boundary === 'before' ? 3 : 2)
    expect(loadData().sessions[0].note).toBe(boundary === 'before' ? 'Next revision' : '')
    await pullRemote()
    expect(loadData().sessions[0].note).toBe('Next revision')
    expect(getSyncStore().connection?.revision).toBe(3)
  })

  it('accepts clearing a child name while preserving its sleep on both devices', async () => {
    useDevice(0, false)
    const before = loadData()
    saveLocalData(before, { ...before, children: before.children.map((child) => ({ ...child, name: '' })) })
    await flushPending()
    useDevice(0, true)
    await pullRemote()
    expect(getSyncStore().pending).toEqual([])
    useDevice(1, true)
    await pullRemote()
    expect(loadData().children[0].name).toBe('')
    expect(loadData().sessions).toHaveLength(1)
  })

  it('still rejects missing, non-string and oversized child names without writing data', async () => {
    const request = (path: string, method: string, body: unknown) => worker.fetch(new Request(`https://sync.example${path}`, {
      method, headers: { Authorization: 'Bearer test-device-token-0', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }), env)
    for (const name of [undefined, null, 123, {}, [], 'a'.repeat(61)]) {
      const create = await request('/v1/children', 'POST', {
        operationId: 'invalid-child-create', child: { id: 'invalid-child', name }
      })
      expect(create.status).toBe(400)
      const patch = await request('/v1/children/child-a', 'PATCH', {
        operationId: 'invalid-child-patch', patch: { name }
      })
      expect(patch.status).toBe(400)
    }
    expect(sqlite.prepare('SELECT id, name FROM children').all()).toEqual([{ id: 'child-a', name: 'Baba' }])
    expect(sqlite.prepare('SELECT revision FROM families').get()).toEqual({ revision: 2 })
    expect(sqlite.prepare('SELECT id FROM operations').all()).toEqual([])
  })

  it('restores an unnamed empty diary and can import and restore it again on both devices', async () => {
    const empty: AppData = {
      ...structuredClone(initial),
      settings: { ...initial.settings, activeChildId: 'old-empty-child' },
      children: [{ ...initial.children[0], id: 'old-empty-child', name: '' }],
      sessions: []
    }
    // The saved empty profile was deleted by the preceding import.
    sqlite.prepare(`INSERT INTO children
      (id, family_id, name, birth_date, created_at, updated_at, deleted_at, revision)
      VALUES ('old-empty-child', 'family-a', '', NULL, ?, ?, ?, 2)`).run(at, at, at)

    for (const snapshot of [empty, initial, empty]) {
      useDevice(0, false)
      const before = loadData()
      const next = prepareFamilyReplacement(before, snapshot)
      expect(next.children[0].id).not.toBe(snapshot.children[0].id)
      saveLocalData(before, next)
      await flushPending()
      useDevice(0, true)
      await pullRemote()
      expect(getSyncStore().pending).toEqual([])
      expect(getSyncStore().failure).toBeUndefined()
      expect(loadData().children.map((child) => child.name)).toEqual([snapshot.children[0].name])
      expect(loadData().sessions).toHaveLength(snapshot.sessions.length)

      useDevice(1, true)
      await pullRemote()
      expect(loadData().children).toEqual(devices[0].displayed.children)
      expect(loadData().sessions).toEqual(devices[0].displayed.sessions)
      expect(loadData().sessions).toHaveLength(snapshot.sessions.length)
    }
  })

  it('retries the already persisted two-operation restore after the Worker accepts empty names', async () => {
    useDevice(0, false)
    const before = loadData()
    const next = prepareFamilyReplacement(before, {
      ...before, children: [{ ...before.children[0], id: 'saved-empty', name: '' }], sessions: []
    })
    saveLocalData(before, next)
    await flushPending()
    const queued = structuredClone(getSyncStore().pending)
    expect(queued).toHaveLength(2)
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({
      ok: false, error: { code: 'INVALID_REQUEST', message: 'Invalid child.name.' }
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })))
    useDevice(0, true)
    await expect(pullRemote()).rejects.toThrow()
    expect(getSyncStore().pending).toEqual(queued)
    expect(getSyncStore().failure).toMatchObject({ code: 'INVALID_REQUEST', status: 400 })
    expect(sqlite.prepare('SELECT id FROM children WHERE deleted_at IS NULL').all()).toEqual([{ id: 'child-a' }])

    // A Worker-only update must accept the original request IDs and payloads.
    const retried: unknown[] = []
    vi.stubGlobal('fetch', (url: string, options: RequestInit) => {
      if (options.method === 'POST' || options.method === 'DELETE') retried.push(JSON.parse(String(options.body)))
      return worker.fetch(new Request(url, options), env)
    })
    await pullRemote()
    expect(retried).toEqual(queued.map((operation) => operation.body))
    expect(getSyncStore().pending).toEqual([])
    expect(getSyncStore().failure).toBeUndefined()
    useDevice(1, true)
    await pullRemote()
    expect(loadData().children.map((child) => child.name)).toEqual([''])
    expect(loadData().sessions).toEqual([])
  })

  it('creates an active sleep with its note and manual type in the first start operation', async () => {
    useDevice(0, false)
    const local = loadData()
    const active = {
      ...local.sessions[0], id: 'active-with-fields', endTime: null,
      note: 'Első művelettel megőrzött jegyzet', dayNightOverride: 'night' as const
    }
    saveLocalData(local, { ...local, sessions: [...local.sessions, active] })
    await pullRemote()

    expect(getSyncStore().pending).toHaveLength(1)
    expect(getSyncStore().pending[0]).toMatchObject({
      method: 'POST', path: '/v1/sessions/start',
      body: { note: active.note, dayNightOverride: 'night' }
    })

    useDevice(0, true)
    await pullRemote()

    expect(getSyncStore().pending).toEqual([])
    expect(sqlite.prepare(`SELECT end_time, note, day_night_override
      FROM sleep_sessions WHERE id = 'active-with-fields'`).get()).toEqual({
      end_time: null, note: active.note, day_night_override: 'night'
    })
  })

  it('keeps one child when another deletion commits after the last-child check', async () => {
    const token = 'test-device-token-0'
    const request = (path: string, method: string, body: unknown) => worker.fetch(new Request(`https://sync.example${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }), env)
    expect((await request('/v1/children', 'POST', {
      operationId: 'create-child-b', child: { id: 'child-b', name: 'Második baba' }
    })).status).toBe(201)

    const binding = env.DB as D1Database & { batch: D1Database['batch'] }
    const originalBatch = binding.batch.bind(binding)
    let injected = false
    binding.batch = async (statements) => {
      if (!injected) {
        injected = true
        expect((await request('/v1/children/child-b', 'DELETE', { operationId: 'delete-child-b' })).status).toBe(200)
      }
      return originalBatch(statements)
    }

    const losingDelete = await request('/v1/children/child-a', 'DELETE', { operationId: 'delete-child-a' })
    expect(losingDelete.status).toBe(409)
    expect(await losingDelete.json()).toMatchObject({ error: { code: 'LAST_CHILD' } })
    expect(sqlite.prepare('SELECT id FROM children WHERE deleted_at IS NULL').all()).toEqual([{ id: 'child-a' }])
    expect(sqlite.prepare("SELECT deleted_at FROM sleep_sessions WHERE id = 'shared-sleep'").get())
      .toEqual({ deleted_at: null })
  })

  it.each(['local', 'family'] as const)('requires an explicit %s choice if another phone changes an active repair', async (choice) => {
    sqlite.prepare("DELETE FROM sleep_sessions WHERE id = 'shared-sleep'").run()
    useDevice(0, false)
    const local = loadData()
    saveLocalData(local, { ...local, sessions: initial.sessions.map((row) => ({ ...row, endTime: null, note: 'Helyi jegyzet' })) })
    await pullRemote()
    useDevice(0, true)
    await pullRemote()
    vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
      const response = await worker.fetch(new Request(url, options), env)
      if (url.endsWith('/v1/sessions/start') && response.status === 201) {
        sqlite.prepare("UPDATE families SET revision = revision + 1 WHERE id = 'family-a'").run()
        sqlite.prepare(`UPDATE sleep_sessions SET note = 'Másik telefon jegyzete',
          revision = (SELECT revision FROM families WHERE id = 'family-a') WHERE id = 'shared-sleep'`).run()
      }
      return response
    })
    await restoreMissingSession('shared-sleep')
    expect(getSyncStore().conflicts).toHaveLength(1)
    await resolveSyncConflict(getSyncStore().conflicts[0].operationId, choice)
    expect(getSyncStore().conflicts).toEqual([])
    expect(getSyncStore().missingSessions).toEqual([])
    expect(getSyncStore().pending).toEqual([])
    expect(sqlite.prepare("SELECT note FROM sleep_sessions WHERE id = 'shared-sleep'").get())
      .toEqual({ note: choice === 'local' ? 'Helyi jegyzet' : 'Másik telefon jegyzete' })
  })

  it('retries a repair with the same operation after the server committed but the response was lost', async () => {
    sqlite.prepare("DELETE FROM sleep_sessions WHERE id = 'shared-sleep'").run()
    await editOffline(0, '2026-08-26T09:50:00.000Z', 'Megőrzendő')
    useDevice(0, true)
    await pullRemote()
    const sent: string[] = []
    let loseResponse = true
    vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
      const response = await worker.fetch(new Request(url, options), env)
      if (url.endsWith('/v1/sessions') && options.method === 'POST') {
        sent.push(String(options.body))
        if (loseResponse) { loseResponse = false; throw new TypeError('Response lost') }
      }
      return response
    })
    await restoreMissingSession('shared-sleep')
    expect(getSyncStore().missingSessions[0].repairEnabled).toBe(false)
    expect(getSyncStore().pending).toHaveLength(2)
    await restoreMissingSession('shared-sleep')
    expect(sent).toHaveLength(2)
    expect(sent[0]).toBe(sent[1])
    expect(getSyncStore().missingSessions).toEqual([])
    expect(getSyncStore().pending).toEqual([])
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM sleep_sessions').get()).toEqual({ count: 1 })
  })

  it('keeps a rejected repair isolated when its ID belongs to another family', async () => {
    sqlite.prepare("INSERT INTO families (id, name, revision, created_at) VALUES ('other-family', 'Other', 1, ?)").run(at)
    sqlite.prepare(`INSERT INTO children (id, family_id, name, created_at, updated_at, revision)
      VALUES ('other-child', 'other-family', 'Other', ?, ?, 1)`).run(at, at)
    sqlite.prepare("UPDATE sleep_sessions SET family_id = 'other-family', child_id = 'other-child' WHERE id = 'shared-sleep'").run()
    await editOffline(0, '2026-08-26T09:50:00.000Z', 'Másik családban levő ID')
    useDevice(0, true)
    await pullRemote()
    await restoreMissingSession('shared-sleep')
    expect(getSyncStore().missingSessions[0].errorCode).toBe('SESSION_CREATE_CONFLICT')
    useDevice(0, false)
    const local = loadData()
    saveLocalData(local, { ...local, sessions: [...local.sessions, { ...local.sessions[0], id: 'independent-start', endTime: null }] })
    await pullRemote()
    useDevice(0, true)
    await pullRemote()
    expect(sqlite.prepare("SELECT family_id, note FROM sleep_sessions WHERE id = 'shared-sleep'").get())
      .toEqual({ family_id: 'other-family', note: '' })
    expect(sqlite.prepare("SELECT family_id FROM sleep_sessions WHERE id = 'independent-start'").get()).toEqual({ family_id: 'family-a' })
  })

  it('acknowledges an explicit later local deletion of an already missing sleep', async () => {
    sqlite.prepare("DELETE FROM sleep_sessions WHERE id = 'shared-sleep'").run()
    await editOffline(0, '2026-08-26T09:50:00.000Z', 'Régi helyi javítás')
    useDevice(0, true)
    await pullRemote()
    useDevice(0, false)
    const local = loadData()
    saveLocalData(local, { ...local, sessions: [] })
    await pullRemote()
    useDevice(0, true)
    await pullRemote()
    expect(getSyncStore().missingSessions).toEqual([])
    expect(getSyncStore().pending).toEqual([])
    expect(loadData().sessions).toEqual([])
  })

  it('quarantines a missing old sleep without blocking a newer start or other phone changes', async () => {
    sqlite.prepare("DELETE FROM sleep_sessions WHERE id = 'shared-sleep'").run()
    await editOffline(0, '2026-08-26T09:50:00.000Z', 'Csak helyben meglevő alvás')
    useDevice(0, false)
    const local = loadData()
    saveLocalData(local, { ...local, sessions: [...local.sessions, { ...local.sessions[0], id: 'new-start', endTime: null, note: '' }] })
    await pullRemote()
    useDevice(0, true)
    await pullRemote()
    expect(getSyncStore().missingSessions).toHaveLength(1)
    expect(getSyncStore().pending.map((op) => op.sessionId)).toEqual(['shared-sleep'])
    expect(loadData().sessions.find((row) => row.id === 'shared-sleep')?.note).toBe('Csak helyben meglevő alvás')
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM sleep_sessions WHERE id = 'shared-sleep'").get()).toEqual({ count: 0 })
    useDevice(1, true)
    await pullRemote()
    expect(loadData().sessions.find((row) => row.id === 'new-start')?.endTime).toBeNull()
    useDevice(1, false)
    const other = loadData()
    saveLocalData(other, { ...other, sessions: other.sessions.map((row) => row.id === 'new-start' ? { ...row, note: 'Másik telefon' } : row) })
    await pullRemote()
    useDevice(1, true)
    await pullRemote()
    useDevice(0, true)
    await pullRemote()
    expect(loadData().sessions.find((row) => row.id === 'new-start')?.note).toBe('Másik telefon')
    expect(loadData().sessions.find((row) => row.id === 'shared-sleep')?.note).toBe('Csak helyben meglevő alvás')
  })

  it('shares only the reviewed missing sleep with its original ID and latest local values', async () => {
    sqlite.prepare("DELETE FROM sleep_sessions WHERE id = 'shared-sleep'").run()
    await editOffline(0, '2026-08-26T09:50:00.000Z', 'Első helyi változat')
    await editOffline(0, '2026-08-26T09:40:00.000Z', 'Legújabb helyi változat')
    useDevice(0, true)
    await pullRemote()
    expect(getSyncStore().pending).toHaveLength(2)
    await restoreMissingSession('shared-sleep')
    expect(getSyncStore().missingSessions).toEqual([])
    expect(getSyncStore().pending).toEqual([])
    expect(sqlite.prepare("SELECT id, start_time, note FROM sleep_sessions").all()).toEqual([
      { id: 'shared-sleep', start_time: '2026-08-26T09:40:00.000Z', note: 'Legújabb helyi változat' }
    ])
    useDevice(1, true)
    await pullRemote()
    expect(loadData().sessions).toHaveLength(1)
    expect(loadData().sessions[0].note).toBe('Legújabb helyi változat')
  })

  it('restores an explicitly reviewed active sleep including its note and override', async () => {
    sqlite.prepare("DELETE FROM sleep_sessions WHERE id = 'shared-sleep'").run()
    useDevice(0, false)
    const data = loadData()
    saveLocalData(data, { ...data, sessions: data.sessions.map((row) => ({ ...row, endTime: null, note: 'Aktív helyi alvás', dayNightOverride: 'night' })) })
    await pullRemote()
    useDevice(0, true)
    await pullRemote()
    await restoreMissingSession('shared-sleep')
    expect(getSyncStore().pending).toEqual([])
    expect(getSyncStore().missingSessions).toEqual([])
    expect(sqlite.prepare("SELECT id, end_time, note, day_night_override FROM sleep_sessions").get())
      .toEqual({ id: 'shared-sleep', end_time: null, note: 'Aktív helyi alvás', day_night_override: 'night' })
  })

  it('does not resurrect a server tombstone as a missing sleep', async () => {
    sqlite.prepare("UPDATE sleep_sessions SET deleted_at = ?, revision = 3 WHERE id = 'shared-sleep'").run(at)
    sqlite.prepare('UPDATE families SET revision = 3').run()
    await editOffline(0, '2026-08-26T09:50:00.000Z', 'Régi űrlap')
    useDevice(0, true)
    await pullRemote()
    expect(getSyncStore().conflicts).toHaveLength(1)
    expect(getSyncStore().missingSessions).toEqual([])
    expect(sqlite.prepare("SELECT deleted_at FROM sleep_sessions WHERE id = 'shared-sleep'").get()).toEqual({ deleted_at: at })
  })

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
    const current = loadData()
    saveLocalData(current, { ...opened, sessions: opened.sessions.map((sleep) => ({ ...sleep, note: 'Régebben megnyitott űrlap' })) }, openedRevision)
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
    saveLocalData(loadData(), devices[0].displayed)
    expect(getSyncStore().pending).toEqual([])
  })

  it('adopts the existing active sleep without recursively running the upload queue', async () => {
    sqlite.prepare(`UPDATE sleep_sessions SET end_time = NULL WHERE id = 'shared-sleep'`).run()
    useDevice(1, true)
    await pullRemote(true)
    useDevice(0, false)
    const data = loadData()
    devices[0].displayed = { ...data, sessions: [...data.sessions, { ...data.sessions[0], id: 'competing-start', endTime: null }] }
    saveLocalData(data, devices[0].displayed)
    await pullRemote()
    useDevice(0, true)
    await pullRemote()
    expect(getSyncStore().pending).toEqual([])
    expect(loadData().sessions).toHaveLength(1)
    expect(loadData().sessions[0]).toMatchObject({ id: 'shared-sleep', endTime: null })
    // The rendered state must forget the rejected draft too, otherwise the next
    // unrelated edit would save it again and queue a second creation.
    saveLocalData(loadData(), devices[0].displayed)
    expect(getSyncStore().pending).toEqual([])
    expect(loadData().sessions).toHaveLength(1)
  })
})
