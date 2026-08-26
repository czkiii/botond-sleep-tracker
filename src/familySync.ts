import type { AppData, ChildProfile, SleepSession } from './types'
import { STORAGE_KEY, loadData } from './storage'

const API_BASE = (import.meta.env.VITE_SYNC_API_BASE || 'https://solemi-sleep-sync.czki-adam.workers.dev').replace(/\/$/, '')
const SYNC_KEY = 'solemiSleep:sync:v1'

export type SyncConnection = {
  familyId: string
  familyName: string
  deviceId: string
  deviceToken: string
  revision: number
}

type PendingOperation = {
  id: string
  method: 'POST' | 'PATCH' | 'DELETE'
  path: string
  body: Record<string, unknown>
  sessionId?: string
  childId?: string
}

type SyncStore = {
  connection: SyncConnection | null
  pending: PendingOperation[]
}

type RemoteSession = Omit<SleepSession, 'childId' | 'dayNightOverride'> & {
  childId?: string
  dayNightOverride?: SleepSession['dayNightOverride']
  deletedAt: string | null
  revision: number
}

type RemoteChild = Omit<ChildProfile, 'photoRef'> & {
  deletedAt: string | null
  revision: number
}

type MutationResult = {
  revision?: number
  session?: RemoteSession | null
  child?: RemoteChild | null
}

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string }; data?: any }

const defaultStore = (): SyncStore => ({ connection: null, pending: [] })

function readStore(): SyncStore {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    if (!raw) return defaultStore()
    const parsed = JSON.parse(raw) as SyncStore
    if (!parsed || typeof parsed !== 'object') return defaultStore()
    const connection = parsed.connection && typeof parsed.connection.deviceToken === 'string'
      ? { ...parsed.connection, familyName: typeof parsed.connection.familyName === 'string' ? parsed.connection.familyName : '' }
      : null
    return { connection, pending: Array.isArray(parsed.pending) ? parsed.pending : [] }
  } catch {
    return defaultStore()
  }
}

function writeStore(store: SyncStore) {
  localStorage.setItem(SYNC_KEY, JSON.stringify(store))
  window.dispatchEvent(new CustomEvent('solemi-sync-state'))
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, cache: 'no-store' })
  const payload = await response.json() as ApiEnvelope<T>
  if (!response.ok || !payload.ok) {
    const error = new Error(!payload.ok ? payload.error.message : `HTTP ${response.status}`) as Error & { code?: string; data?: any; status?: number }
    if (!payload.ok) { error.code = payload.error.code; error.data = payload.data }
    error.status = response.status
    throw error
  }
  return payload.data
}

function opId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}

function toRemoteLocal(session: RemoteSession): SleepSession {
  return {
    id: session.id,
    childId: session.childId || loadData().settings.activeChildId,
    startTime: session.startTime,
    endTime: session.endTime,
    note: session.note || '',
    dayNightOverride: session.dayNightOverride ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  }
}

function toLocalChild(child: RemoteChild, existing?: ChildProfile): ChildProfile {
  return {
    id: child.id,
    name: child.name,
    birthDate: child.birthDate,
    // Profile photos deliberately remain device-local in the first multi-child release.
    photoRef: existing?.photoRef ?? null,
    createdAt: child.createdAt,
    updatedAt: child.updatedAt
  }
}

export function mergeRemote(data: AppData, sessions: RemoteSession[], children: RemoteChild[] = []) {
  const childMap = new Map(data.children.map((child) => [child.id, child]))
  const deletedChildIds = new Set<string>()
  for (const remote of children) {
    if (remote.deletedAt) {
      childMap.delete(remote.id)
      deletedChildIds.add(remote.id)
    } else {
      childMap.set(remote.id, toLocalChild(remote, childMap.get(remote.id)))
    }
  }

  const map = new Map(data.sessions.filter((session) => !deletedChildIds.has(session.childId)).map((session) => [session.id, session]))
  for (const remote of sessions) {
    if (remote.deletedAt || (remote.childId && deletedChildIds.has(remote.childId))) map.delete(remote.id)
    else map.set(remote.id, toRemoteLocal(remote))
  }
  const mergedChildren = Array.from(childMap.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const activeChildId = childMap.has(data.settings.activeChildId)
    ? data.settings.activeChildId
    : (mergedChildren[0]?.id ?? data.settings.activeChildId)

  return {
    ...data,
    settings: { ...data.settings, activeChildId },
    children: mergedChildren,
    sessions: Array.from(map.values()).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  }
}

function writeRemoteData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function applyAuthoritativeSession(session?: RemoteSession | null) {
  if (!session) return false
  const current = loadData()
  const merged = mergeRemote(current, [session])
  const changed = JSON.stringify(merged.sessions) !== JSON.stringify(current.sessions)
  if (changed) writeRemoteData(merged)
  return changed
}

export function getSyncStore() { return readStore() }
export function isFamilyConnected() { return Boolean(readStore().connection) }

export async function createFamily(familyName: string, deviceName: string) {
  const local = loadData()
  const primaryChild = local.children.find((child) => child.id === local.settings.activeChildId) ?? local.children[0]
  const created = await request<{ familyId: string; familyName: string; device: { id: string; name: string | null }; deviceToken: string; revision: number }>('/v1/families', {
    method: 'POST',
    body: JSON.stringify({
      familyName: familyName.trim(),
      deviceName,
      childId: primaryChild?.id,
      childName: primaryChild?.name ?? '',
      birthDate: primaryChild?.birthDate ?? null
    })
  })
  const connection: SyncConnection = { familyId: created.familyId, familyName: created.familyName, deviceId: created.device.id, deviceToken: created.deviceToken, revision: created.revision }
  const baseline = { ...local, children: primaryChild ? [primaryChild] : [], sessions: [] }
  writeStore({ connection, pending: makeOperations(baseline, local) })
  await flushPending()
  return createInvite()
}

function applyAuthoritativeChild(child?: RemoteChild | null) {
  if (!child) return false
  const current = loadData()
  const merged = mergeRemote(current, [], [child])
  const changed = JSON.stringify(merged) !== JSON.stringify(current)
  if (changed) writeRemoteData(merged)
  return changed
}

export async function joinFamily(code: string, deviceName: string) {
  const joined = await request<{ familyId: string; familyName: string; device: { id: string; name: string | null }; deviceToken: string; revision: number }>('/v1/join', {
    method: 'POST', body: JSON.stringify({ code: code.trim().toUpperCase(), deviceName })
  })
  const connection: SyncConnection = { familyId: joined.familyId, familyName: joined.familyName, deviceId: joined.device.id, deviceToken: joined.deviceToken, revision: 0 }
  writeStore({ connection, pending: [] })

  // Merge the cloud family into the device without silently discarding an
  // existing local diary. A dedicated, confirmed import flow can resolve any
  // unrelated pre-pairing data in a later release.
  return pullRemote()
}

export async function refreshFamilyInfo() {
  const store = readStore()
  if (!store.connection) return null
  const info = await request<{ id: string; name: string | null; familyId: string; familyName: string; revision: number }>('/v1/device', {}, store.connection.deviceToken)
  const fresh = readStore()
  if (!fresh.connection) return null
  fresh.connection.familyName = info.familyName || fresh.connection.familyName
  // Do not advance the sync cursor here. Only /v1/sync may move revision,
  // otherwise changes from another device can be skipped permanently.
  writeStore(fresh)
  return info
}

export async function createInvite() {
  const store = readStore()
  if (!store.connection) throw new Error('Family Sync is not connected.')
  return request<{ code: string; expiresAt: string }>('/v1/invites', { method: 'POST', body: '{}' }, store.connection.deviceToken)
}

export async function leaveFamily() {
  const store = readStore()
  if (store.connection) {
    try { await request('/v1/device/leave', { method: 'POST', body: '{}' }, store.connection.deviceToken) } catch {}
  }
  writeStore(defaultStore())
}

export function makeOperations(previous: AppData, next: AppData): PendingOperation[] {
  const beforeChildren = new Map(previous.children.map((child) => [child.id, child]))
  const afterChildren = new Map(next.children.map((child) => [child.id, child]))
  const removedChildIds = new Set(previous.children.filter((child) => !afterChildren.has(child.id)).map((child) => child.id))
  const before = new Map(previous.sessions.map((session) => [session.id, session]))
  const after = new Map(next.sessions.map((session) => [session.id, session]))
  const operations: PendingOperation[] = []

  for (const child of next.children) {
    const old = beforeChildren.get(child.id)
    if (!old) {
      operations.push({
        id: opId('op_child_create'),
        method: 'POST',
        path: '/v1/children',
        childId: child.id,
        body: { operationId: opId('mut'), child: { id: child.id, name: child.name, birthDate: child.birthDate } }
      })
      continue
    }

    const patch: Record<string, unknown> = {}
    if (old.name !== child.name) patch.name = child.name
    if (old.birthDate !== child.birthDate) patch.birthDate = child.birthDate
    if (Object.keys(patch).length) {
      operations.push({
        id: opId('op_child_patch'),
        method: 'PATCH',
        path: `/v1/children/${encodeURIComponent(child.id)}`,
        childId: child.id,
        body: { operationId: opId('mut'), patch }
      })
    }
  }

  for (const child of previous.children) {
    if (removedChildIds.has(child.id)) {
      operations.push({ id: opId('op_child_delete'), method: 'DELETE', path: `/v1/children/${encodeURIComponent(child.id)}`, childId: child.id, body: { operationId: opId('mut') } })
    }
  }

  for (const session of next.sessions) {
    const old = before.get(session.id)
    if (!old) {
      if (session.endTime) {
        operations.push({ id: opId('op_create'), method: 'POST', path: '/v1/sessions', sessionId: session.id, body: { operationId: opId('mut'), session: { id: session.id, childId: session.childId, startTime: session.startTime, endTime: session.endTime, note: session.note, dayNightOverride: session.dayNightOverride } } })
      } else {
        operations.push({ id: opId('op_start'), method: 'POST', path: '/v1/sessions/start', sessionId: session.id, body: { operationId: opId('mut'), sessionId: session.id, childId: session.childId, startTime: session.startTime } })
      }
      continue
    }

    const patch: Record<string, unknown> = {}
    if (old.startTime !== session.startTime) patch.startTime = session.startTime
    if (old.note !== session.note) patch.note = session.note
    if (old.dayNightOverride !== session.dayNightOverride) patch.dayNightOverride = session.dayNightOverride

    if (!old.endTime && session.endTime) {
      operations.push({ id: opId('op_end'), method: 'POST', path: `/v1/sessions/${encodeURIComponent(session.id)}/end`, sessionId: session.id, body: { operationId: opId('mut'), endTime: session.endTime } })
    } else if (old.endTime !== session.endTime && old.endTime && session.endTime) {
      patch.endTime = session.endTime
    }

    if (Object.keys(patch).length) {
      operations.push({ id: opId('op_patch'), method: 'PATCH', path: `/v1/sessions/${encodeURIComponent(session.id)}`, sessionId: session.id, body: { operationId: opId('mut'), patch } })
    }
  }

  for (const session of previous.sessions) {
    if (!after.has(session.id) && !removedChildIds.has(session.childId)) operations.push({ id: opId('op_delete'), method: 'DELETE', path: `/v1/sessions/${encodeURIComponent(session.id)}`, sessionId: session.id, body: { operationId: opId('mut') } })
  }
  return operations
}

export function queueLocalChange(previous: AppData, next: AppData) {
  const store = readStore()
  if (!store.connection) return
  const operations = makeOperations(previous, next)
  if (!operations.length) return
  writeStore({ ...store, pending: [...store.pending, ...operations] })
  void flushPending()
}

function removeLocalSession(sessionId?: string) {
  if (!sessionId) return
  const data = loadData()
  writeRemoteData({ ...data, sessions: data.sessions.filter((session) => session.id !== sessionId) })
}

export async function flushPending() {
  let store = readStore()
  if (!store.connection || !store.pending.length || !navigator.onLine) return false
  let changedLocal = false
  while (store.connection && store.pending.length) {
    const operation = store.pending[0]
    try {
      const result = await request<MutationResult>(operation.path, { method: operation.method, body: JSON.stringify(operation.body) }, store.connection.deviceToken)
      if (applyAuthoritativeSession(result?.session)) changedLocal = true
      if (applyAuthoritativeChild(result?.child)) changedLocal = true

      store = readStore()
      if (!store.connection) return changedLocal
      // Mutation responses can have a newer family revision than this device has pulled.
      // Advancing the cursor here would skip intervening changes from another phone.
      store.pending = store.pending.filter((item) => item.id !== operation.id)
      writeStore(store)
    } catch (error) {
      const apiError = error as Error & { code?: string; data?: any; status?: number }
      if (apiError.code === 'ACTIVE_SLEEP_EXISTS') {
        removeLocalSession(operation.sessionId)
        changedLocal = true
        store = readStore()
        store.pending = store.pending.filter((item) => item.id !== operation.id)
        writeStore(store)
        await pullRemote(true)
        continue
      }
      if (apiError.status && apiError.status >= 400 && apiError.status < 500 && apiError.code !== 'INTERNAL_ERROR') {
        store = readStore()
        store.pending = store.pending.filter((item) => item.id !== operation.id)
        writeStore(store)
        continue
      }
      break
    }
  }
  return changedLocal
}

export async function pullRemote(forceFromZero = false) {
  const store = readStore()
  if (!store.connection || !navigator.onLine) return false
  await flushPending()
  const fresh = readStore()
  if (!fresh.connection) return false
  const after = forceFromZero ? 0 : fresh.connection.revision
  const result = await request<{ revision: number; familyName?: string; children?: RemoteChild[]; sessions: RemoteSession[] }>(`/v1/sync?after=${after}`, {}, fresh.connection.deviceToken)
  const latest = readStore()
  if (!latest.connection) return false
  const current = loadData()
  const merged = mergeRemote(current, result.sessions, result.children ?? [])
  const changed = JSON.stringify(merged) !== JSON.stringify(current)
  if (changed) writeRemoteData(merged)
  // /v1/sync is the only authoritative place allowed to advance the cursor.
  latest.connection.revision = result.revision
  if (result.familyName) latest.connection.familyName = result.familyName
  writeStore(latest)
  return changed
}
