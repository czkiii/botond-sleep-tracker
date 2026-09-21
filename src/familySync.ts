import type { AppData, ChildProfile, SleepSession } from './types'
import { getLocalMetadata, loadData, saveDataAfterDeletion, saveDataWithMetadata, saveLocalMetadata, saveRemoteData, saveSafetyBackup } from './storage'
import { accountDeviceName, accountRequest } from './accountAuth'
import { fetchJson } from './apiTransport'

const API_BASE = (import.meta.env.VITE_SYNC_API_BASE || 'https://solemi-sleep-sync.czki-adam.workers.dev').replace(/\/$/, '')
const SYNC_KEY = 'solemiSleep:sync:v1'
const SYNC_METADATA_KEY = 'familySyncV1'
const DETACHED_FAMILY_KEY = 'solemiSleep:detachedFamily'
const CORRUPT_SYNC_STORE = 'LOCAL_SYNC_STORE_CORRUPT'

// Local edits can queue immediately, but upload, download and conflict resolution
// must not apply competing server responses to the same device at the same time.
let syncTail: Promise<void> = Promise.resolve()
function serializeSync<T>(work: () => Promise<T>): Promise<T> {
  const result = syncTail.then(work)
  syncTail = result.then(() => {}, () => {})
  return result
}

function sameConnection(first: SyncConnection | null, second: SyncConnection | null) {
  return Boolean(first && second && first.familyId === second.familyId
    && first.deviceId === second.deviceId && first.deviceToken === second.deviceToken)
}

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
  repairsMissingSession?: string
  replacesOperationIds?: string[]
}

export type MissingSession = {
  sessionId: string
  localValue: SleepSession | null
  repairOperationIds?: string[]
  repairEnabled?: boolean
  errorCode?: string
}

export type SyncConflict = {
  operationId: string
  entityType: 'SESSION'
  entityId: string
  baseRevision: number
  serverRevision: number
  serverValue: RemoteSession
}

type SyncStore = {
  connection: SyncConnection | null
  pending: PendingOperation[]
  conflicts: SyncConflict[]
  sessionRevisions?: Record<string, number>
  failure?: { code: string; status?: number }
  missingSessions: MissingSession[]
  corrupt?: boolean
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

const defaultStore = (): SyncStore => ({ connection: null, pending: [], conflicts: [], missingSessions: [] })

function corruptStore(): SyncStore {
  return { ...defaultStore(), corrupt: true, failure: { code: CORRUPT_SYNC_STORE } }
}

function validPendingOperation(value: unknown): value is PendingOperation {
  if (!value || typeof value !== 'object') return false
  const operation = value as Partial<PendingOperation>
  return typeof operation.id === 'string' && Boolean(operation.id)
    && (operation.method === 'POST' || operation.method === 'PATCH' || operation.method === 'DELETE')
    && typeof operation.path === 'string' && operation.path.startsWith('/')
    && Boolean(operation.body) && typeof operation.body === 'object' && !Array.isArray(operation.body)
}

function parseStore(value: unknown): SyncStore {
  if (!value || typeof value !== 'object') return corruptStore()
  const parsed = value as SyncStore
  if (parsed.connection !== null && parsed.connection !== undefined) {
    if (typeof parsed.connection !== 'object'
      || typeof parsed.connection.familyId !== 'string'
      || typeof parsed.connection.deviceId !== 'string'
      || typeof parsed.connection.deviceToken !== 'string'
      || !Number.isInteger(parsed.connection.revision)) return corruptStore()
  }
  if (!Array.isArray(parsed.pending) || !parsed.pending.every(validPendingOperation)
    || (parsed.conflicts !== undefined && !Array.isArray(parsed.conflicts))
    || (parsed.missingSessions !== undefined && !Array.isArray(parsed.missingSessions))) return corruptStore()
  const connection = parsed.connection && typeof parsed.connection.deviceToken === 'string'
    ? { ...parsed.connection, familyName: typeof parsed.connection.familyName === 'string' ? parsed.connection.familyName : '' }
    : null
  const pending = parsed.pending.map((operation) => ({
    ...operation,
    body: { ...operation.body, baseRevision: Number.isInteger(operation.body?.baseRevision)
      ? operation.body.baseRevision : (connection?.revision ?? 0) }
  }))
  const sessionRevisions = Object.fromEntries(Object.entries(parsed.sessionRevisions ?? {})
    .filter(([, revision]) => Number.isInteger(revision) && revision >= 0))
  const failure = parsed.failure && /^[A-Z_0-9]{1,64}$/.test(parsed.failure.code)
    ? { code: parsed.failure.code, status: parsed.failure.status } : undefined
  const missingSessions = (parsed.missingSessions ?? []).filter((item) => item && typeof item.sessionId === 'string')
  return { connection, pending, conflicts: parsed.conflicts ?? [], sessionRevisions, failure, missingSessions }
}

function readStore(): SyncStore {
  try {
    const embedded = getLocalMetadata(SYNC_METADATA_KEY)
    if (embedded !== undefined) return parseStore(embedded)
    const raw = localStorage.getItem(SYNC_KEY)
    if (!raw) return defaultStore()
    return parseStore(JSON.parse(raw))
  } catch {
    return corruptStore()
  }
}

function writeStore(store: SyncStore) {
  if (readStore().corrupt) throw new Error(CORRUPT_SYNC_STORE)
  const { corrupt: _corrupt, ...persisted } = store
  saveLocalMetadata(SYNC_METADATA_KEY, persisted)
  try { localStorage.removeItem(SYNC_KEY) } catch { /* embedded copy is authoritative */ }
  window.dispatchEvent(new CustomEvent('solemi-sync-state'))
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token && import.meta.env.VITE_ACCOUNT_AUTH === 'true') {
    headers.set('X-Solemi-Family-Token', token)
    return accountRequest<T>(path, { ...options, headers })
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const { response, body: payload } = await fetchJson<ApiEnvelope<T>>(`${API_BASE}${path}`, {
    ...options, headers, cache: 'no-store'
  })
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
  const remoteChildIds = new Set(children.filter((child) => !child.deletedAt).map((child) => child.id))
  const sessionChildIds = new Set(data.sessions.map((session) => session.childId))
  const localChildren = remoteChildIds.size ? data.children.filter((child) =>
    remoteChildIds.has(child.id) || !isEmptyLocalProfile(child) || sessionChildIds.has(child.id)) : data.children
  const childMap = new Map(localChildren.map((child) => [child.id, child]))
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
  saveRemoteData(data)
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
export function getSessionSyncRevision(sessionId: string) {
  const store = readStore()
  if (!store.connection) return undefined
  return Math.max(store.connection.revision, store.sessionRevisions?.[sessionId] ?? 0)
}
export function isFamilyConnected() { return Boolean(readStore().connection) }

export type FamilyReplacementReadiness = {
  scope: 'local' | 'family'
  ready: boolean
  reason?: 'offline' | 'pending' | 'attention'
  familyName?: string
}

export function getFamilyReplacementReadiness(): FamilyReplacementReadiness {
  const store = readStore()
  if (store.corrupt) return { scope: store.connection ? 'family' : 'local', ready: false, reason: 'attention', familyName: store.connection?.familyName }
  if (!store.connection) return { scope: 'local', ready: true }
  const familyName = store.connection.familyName
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { scope: 'family', ready: false, reason: 'offline', familyName }
  if (store.pending.length) return { scope: 'family', ready: false, reason: 'pending', familyName }
  if (store.corrupt || store.failure || store.conflicts.length || store.missingSessions.length) {
    return { scope: 'family', ready: false, reason: 'attention', familyName }
  }
  return { scope: 'family', ready: true, familyName }
}

export async function reconcileAccountFamily() {
  const store = readStore()
  if (store.connection) {
    await accountRequest('/v1/auth/family/claim', {
      method: 'POST', body: JSON.stringify({ familyDeviceToken: store.connection.deviceToken })
    })
    return { claimed: true, connected: true, changed: false }
  }

  const detachedFamilyId = localStorage.getItem(DETACHED_FAMILY_KEY)
  if (detachedFamilyId) {
    const access = await accountRequest<{ membership: null | { familyId: string } }>('/v1/auth/access')
    if (access.membership?.familyId === detachedFamilyId) {
      return { claimed: false, connected: false, changed: false, detached: true }
    }
    localStorage.removeItem(DETACHED_FAMILY_KEY)
  }

  saveSafetyBackup(loadData(), 'before-family-bootstrap')
  const result = await accountRequest<{
    membership: null | { familyId: string; familyName: string; role: 'ADMIN' | 'MEMBER' }
    connection?: SyncConnection
  }>('/v1/auth/family/bootstrap', {
    method: 'POST', body: JSON.stringify({ deviceName: accountDeviceName() })
  })
  if (!result.membership || !result.connection) return { claimed: false, connected: false, changed: false }
  writeStore({ connection: result.connection, pending: [], conflicts: [], missingSessions: [] })
  const changed = await pullRemote(true)
  return { claimed: false, connected: true, changed }
}

export async function reconnectAccountFamily() {
  localStorage.removeItem(DETACHED_FAMILY_KEY)
  return reconcileAccountFamily()
}

export function isEmptyStarterData(data: AppData) {
  if (data.sessions.length !== 0 || data.children.length !== 1) return false
  return isEmptyLocalProfile(data.children[0])
}

function isEmptyLocalProfile(child: ChildProfile) {
  return child.name.trim() === '' && child.birthDate === null && child.photoRef === null
}

export async function createFamily(familyName: string, deviceName: string) {
  const local = loadData()
  saveSafetyBackup(local, 'before-family-bootstrap')
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
  localStorage.removeItem(DETACHED_FAMILY_KEY)
  const baseline = { ...local, children: primaryChild ? [primaryChild] : [], sessions: [] }
  writeStore({ connection, pending: makeOperations(baseline, local, connection.revision), conflicts: [], missingSessions: [] })
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
  const normalizedCode = code.trim().toUpperCase()
  saveSafetyBackup(loadData(), 'before-family-bootstrap')
  let connection: SyncConnection
  if (import.meta.env.VITE_ACCOUNT_AUTH === 'true') {
    const joined = await accountRequest<{ connection: SyncConnection }>('/v1/auth/family/join', {
      method: 'POST', body: JSON.stringify({ code: normalizedCode, deviceName: accountDeviceName() })
    })
    connection = joined.connection
  } else {
    const joined = await request<{ familyId: string; familyName: string; device: { id: string; name: string | null }; deviceToken: string; revision: number }>('/v1/join', {
      method: 'POST', body: JSON.stringify({ code: normalizedCode, deviceName })
    })
    connection = { familyId: joined.familyId, familyName: joined.familyName,
      deviceId: joined.device.id, deviceToken: joined.deviceToken, revision: 0 }
  }
  localStorage.removeItem(DETACHED_FAMILY_KEY)
  writeStore({ connection, pending: [], conflicts: [], missingSessions: [] })

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
  const readiness = getFamilyReplacementReadiness()
  if (!readiness.ready) throw new Error(`FAMILY_DETACH_${readiness.reason?.toUpperCase() || 'BLOCKED'}`)
  if (store.connection) {
    await request('/v1/device/leave', { method: 'POST', body: '{}' }, store.connection.deviceToken)
    localStorage.setItem(DETACHED_FAMILY_KEY, store.connection.familyId)
  }
  writeStore(defaultStore())
}

export type FamilyMemberChoice = {
  accountId: string
  role: 'ADMIN' | 'MEMBER'
  joinedAt: number
  name: string | null
  email: string | null
}

export async function getAccountFamilyMembers() {
  const result = await accountRequest<{ members: FamilyMemberChoice[] }>('/v1/auth/family/members')
  return result.members
}

export async function leaveAccountFamily(successorAccountId?: string) {
  const readiness = getFamilyReplacementReadiness()
  if (!readiness.ready) throw new Error(`FAMILY_LEAVE_${readiness.reason?.toUpperCase() || 'BLOCKED'}`)
  await accountRequest('/v1/auth/family/leave', {
    method: 'POST', body: JSON.stringify(successorAccountId ? { successorAccountId } : {})
  })
  localStorage.removeItem(DETACHED_FAMILY_KEY)
  writeStore(defaultStore())
  announceDiaryReplacement()
}

function announceDiaryReplacement() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('solemi-sync-state'))
  window.dispatchEvent(new CustomEvent('solemi-remote-data-applied'))
}

export async function clearLocalDiary(next: AppData) {
  const store = readStore()
  if (store.connection) {
    try { await request('/v1/device/leave', { method: 'POST', body: '{}' }, store.connection.deviceToken) } catch {}
    localStorage.setItem(DETACHED_FAMILY_KEY, store.connection.familyId)
  }
  saveDataAfterDeletion(next, SYNC_METADATA_KEY, defaultStore())
  try { localStorage.removeItem(SYNC_KEY) } catch { /* embedded copy is authoritative */ }
  announceDiaryReplacement()
}

export async function clearFamilyDiary(next: AppData, expectedFamilyName: string) {
  const store = readStore()
  if (!store.connection) throw new Error('FAMILY_NOT_CONNECTED')
  const connection = store.connection
  const replacementChild = next.children[0]
  const result = await accountRequest<{ revision: number; child: RemoteChild }>('/v1/auth/family/data/clear', {
    method: 'POST',
    headers: { 'X-Solemi-Family-Token': connection.deviceToken },
    body: JSON.stringify({
      operationId: opId('clear_family'),
      expectedFamilyName,
      replacementChildId: replacementChild.id
    })
  })
  const latest = readStore()
  if (!sameConnection(connection, latest.connection)) throw new Error('FAMILY_CLEAR_LOCAL_REFRESH_REQUIRED')
  const cleared: AppData = {
    ...next,
    settings: { ...next.settings, activeChildId: result.child.id },
    children: [toLocalChild(result.child)],
    sessions: []
  }
  const nextStore: SyncStore = {
    connection: { ...connection, revision: result.revision },
    pending: [], conflicts: [], missingSessions: [], sessionRevisions: {}
  }
  try {
    saveDataAfterDeletion(cleared, SYNC_METADATA_KEY, nextStore)
  } catch {
    throw new Error('FAMILY_CLEAR_LOCAL_REFRESH_REQUIRED')
  }
  try { localStorage.removeItem(SYNC_KEY) } catch { /* embedded copy is authoritative */ }
  announceDiaryReplacement()
  return cleared
}

export function makeOperations(previous: AppData, next: AppData, baseRevision = 0): PendingOperation[] {
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
        operations.push({ id: opId('op_start'), method: 'POST', path: '/v1/sessions/start', sessionId: session.id, body: { operationId: opId('mut'), sessionId: session.id, childId: session.childId, startTime: session.startTime, note: session.note, dayNightOverride: session.dayNightOverride } })
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
  return operations.map((operation) => ({
    ...operation,
    body: { ...operation.body, baseRevision }
  }))
}

export function saveLocalData(previous: AppData, next: AppData, baseRevision?: number) {
  const store = readStore()
  if (store.corrupt) throw new Error(CORRUPT_SYNC_STORE)
  const operations = store.connection ? makeOperations(previous, next, baseRevision ?? store.connection.revision).map((operation) => ({
    ...operation,
    body: { ...operation.body, baseRevision: baseRevision ?? Math.max(store.connection!.revision,
      operation.sessionId ? store.sessionRevisions?.[operation.sessionId] ?? 0 : 0) }
  })) : []
  const nextStore = operations.length ? { ...store, pending: [...store.pending, ...operations] } : store
  // One localStorage replacement contains both the diary and its outbox.
  // A quota failure therefore accepts neither half of the change.
  saveDataWithMetadata(next, SYNC_METADATA_KEY, nextStore)
  try { localStorage.removeItem(SYNC_KEY) } catch { /* embedded copy is authoritative */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('solemi-sync-state'))
  if (operations.length) void flushPending().catch(() => {})
}

function removeLocalSession(sessionId?: string) {
  if (!sessionId) return
  const data = loadData()
  writeRemoteData({ ...data, sessions: data.sessions.filter((session) => session.id !== sessionId) })
}

export function flushPending() {
  return serializeSync(flushPendingNow)
}

function blockedByMissingSession(store: SyncStore, operation: PendingOperation) {
  const missing = store.missingSessions.find((item) => item.sessionId === operation.sessionId)
  if (!missing) return false
  if (operation.method === 'DELETE' && !loadData().sessions.some((item) => item.id === operation.sessionId)) return false
  return !(missing.repairEnabled && missing.repairOperationIds?.includes(operation.id))
}

// Sharing an unacknowledged local sleep is an explicit action, never a blanket
// upload of pre-pairing history. Persist its operation IDs before sending it.
export function restoreMissingSession(sessionId: string) {
  return serializeSync(async () => {
    const store = readStore()
    const missing = store.missingSessions.find((item) => item.sessionId === sessionId)
    if (!store.connection || !missing) return false
    const data = loadData()
    const session = data.sessions.find((item) => item.id === sessionId)
    if (!session) throw new Error('LOCAL_SESSION_NOT_FOUND')
    if (missing.repairOperationIds?.some((id) => store.pending.some((op) => op.id === id))) {
      missing.repairEnabled = true
      missing.errorCode = undefined
    } else {
      const baseline = { ...data, sessions: data.sessions.filter((item) => item.id !== sessionId) }
      const operations: PendingOperation[] = makeOperations(baseline, data, store.connection.revision)
        .map((operation) => ({ ...operation, repairsMissingSession: sessionId }))
      if (!session.endTime && (session.note || session.dayNightOverride)) {
        operations.push({ id: opId('op_repair_patch'), method: 'PATCH',
          path: `/v1/sessions/${encodeURIComponent(sessionId)}`, sessionId, repairsMissingSession: sessionId,
          body: { operationId: opId('mut'), baseRevision: store.connection.revision,
            patch: { note: session.note, dayNightOverride: session.dayNightOverride } } })
      }
      operations[operations.length - 1].replacesOperationIds = store.pending
        .filter((op) => op.sessionId === sessionId).map((op) => op.id)
      missing.localValue = session
      missing.repairOperationIds = operations.map((op) => op.id)
      missing.repairEnabled = true
      missing.errorCode = undefined
      store.pending = [...operations, ...store.pending]
    }
    writeStore(store)
    return pullRemoteNow()
  })
}

async function flushPendingNow() {
  let store = readStore()
  if (!store.connection || !store.pending.length || store.conflicts.length || !navigator.onLine) return false
  let changedLocal = false
  while (store.connection && store.pending.length && !store.conflicts.length && navigator.onLine) {
    const operation = store.pending.find((item) => !blockedByMissingSession(store, item))
    if (!operation) break
    try {
      const result = await request<MutationResult>(operation.path, { method: operation.method, body: JSON.stringify(operation.body) }, store.connection.deviceToken)
      const resultRevision = result?.session?.revision ?? result?.child?.revision ?? result?.revision
      const latest = readStore()
      if (!sameConnection(store.connection, latest.connection)) return changedLocal
      store = latest
      if (!store.pending.some((item) => item.id === operation.id)) return changedLocal
      const hasLaterSameEntity = store.pending.filter((item) => item.id !== operation.id
        && !operation.replacesOperationIds?.includes(item.id)).some((item) =>
        (operation.sessionId && item.sessionId === operation.sessionId)
        || (operation.childId && item.childId === operation.childId))
      if (!hasLaterSameEntity && applyAuthoritativeSession(result?.session)) changedLocal = true
      if (!hasLaterSameEntity && applyAuthoritativeChild(result?.child)) changedLocal = true

      store = readStore()
      if (!store.connection) return changedLocal
      // Mutation responses can have a newer family revision than this device has pulled.
      // Advancing the cursor here would skip intervening changes from another phone.
      store.pending = store.pending.filter((item) => item.id !== operation.id
        && !operation.replacesOperationIds?.includes(item.id))
      if (operation.replacesOperationIds) {
        store.missingSessions = store.missingSessions.filter((item) => item.sessionId !== operation.repairsMissingSession)
      }
      store.failure = undefined
      if (Number.isInteger(resultRevision)) {
        if (operation.sessionId) {
          // Remember our acknowledged write without skipping changes to other
          // sleeps that the global download cursor has not fetched yet.
          store.sessionRevisions = { ...store.sessionRevisions, [operation.sessionId]: resultRevision! }
        }
        store.pending = store.pending.map((item) => {
          const sameEntity = (operation.sessionId && item.sessionId === operation.sessionId)
            || (operation.childId && item.childId === operation.childId)
          return sameEntity ? { ...item, body: { ...item.body, baseRevision: resultRevision } } : item
        })
      }
      store.conflicts = store.conflicts.filter((item) => item.operationId !== operation.id)
      writeStore(store)
    } catch (error) {
      const apiError = error as Error & { code?: string; data?: any; status?: number }
      if (!sameConnection(store.connection, readStore().connection)) return changedLocal
      if (apiError.code === 'SESSION_NOT_FOUND' && operation.sessionId && !operation.repairsMissingSession) {
        store = readStore()
        const localValue = loadData().sessions.find((item) => item.id === operation.sessionId) ?? null
        if (operation.method === 'DELETE' && !localValue) {
          // Both sides already agree on absence. This acknowledges a deletion,
          // it does not discard a local edit or recreate a deleted record.
          const deleteIndex = store.pending.findIndex((item) => item.id === operation.id)
          store.pending = store.pending.filter((item, index) => item.sessionId !== operation.sessionId || index > deleteIndex)
          if (!store.pending.some((item) => item.sessionId === operation.sessionId)) {
            store.missingSessions = store.missingSessions.filter((item) => item.sessionId !== operation.sessionId)
          }
        } else if (!store.missingSessions.some((item) => item.sessionId === operation.sessionId)) {
          store.missingSessions.push({ sessionId: operation.sessionId, localValue })
        }
        store.failure = undefined
        writeStore(store)
        continue
      }
      if (operation.repairsMissingSession && apiError.code !== 'FAMILY_SYNC_PAUSED' && apiError.code !== 'SYNC_CONFLICT') {
        store = readStore()
        const missing = store.missingSessions.find((item) => item.sessionId === operation.repairsMissingSession)
        if (missing) {
          missing.repairEnabled = false
          missing.errorCode = apiError.code && /^[A-Z_0-9]{1,64}$/.test(apiError.code) ? apiError.code : 'NETWORK_ERROR'
          writeStore(store)
          // A rejected repair must not re-block unrelated new sleep data.
          continue
        }
      }
      if (apiError.code === 'ACTIVE_SLEEP_EXISTS') {
        removeLocalSession(operation.sessionId)
        changedLocal = true
        store = readStore()
        store.pending = store.pending.filter((item) => item.sessionId !== operation.sessionId)
        store.failure = undefined
        writeStore(store)
        if (applyAuthoritativeSession(apiError.data?.activeSession)) changedLocal = true
        continue
      }
      if (apiError.code === 'FAMILY_SYNC_PAUSED' || apiError.code === 'RECONCILIATION_REQUIRED') break
      if (apiError.code === 'SYNC_CONFLICT') {
        const conflict = apiError.data?.conflict as Omit<SyncConflict, 'operationId'> | undefined
        if (conflict) {
          store = readStore()
          store.failure = undefined
          store.conflicts = [...store.conflicts.filter((item) => item.operationId !== operation.id),
            { ...conflict, operationId: operation.id }]
          writeStore(store)
        }
        break
      }
      // Authentication, proxy and server failures are not acknowledgements.
      // Keep the exact mutation for a safe retry and surface the actual failure.
      store = readStore()
      store.failure = {
        code: apiError.code && /^[A-Z_0-9]{1,64}$/.test(apiError.code) ? apiError.code : 'NETWORK_ERROR',
        ...(apiError.status ? { status: apiError.status } : {})
      }
      writeStore(store)
      throw error
    }
  }
  return changedLocal
}

export function resolveSyncConflict(operationId: string, resolution: 'local' | 'family') {
  return serializeSync(() => resolveSyncConflictNow(operationId, resolution))
}

async function resolveSyncConflictNow(operationId: string, resolution: 'local' | 'family') {
  let store = readStore()
  const conflict = store.conflicts.find((item) => item.operationId === operationId)
  const operation = store.pending.find((item) => item.id === operationId)
  if (!store.connection || !conflict || !operation) return false
  let changedLocal = false

  if (resolution === 'local') {
    store.pending = store.pending.map((item) => item.id === operationId
      ? { ...item, body: { ...item.body, baseRevision: conflict.serverRevision } }
      : item)
    store.conflicts = store.conflicts.filter((item) => item.operationId !== operationId)
    writeStore(store)
  } else {
    store.pending = store.pending.filter((item) => item.sessionId !== conflict.entityId)
    store.conflicts = store.conflicts.filter((item) => item.entityId !== conflict.entityId)
    store.missingSessions = store.missingSessions.filter((item) => item.sessionId !== conflict.entityId)
    store.sessionRevisions = { ...store.sessionRevisions, [conflict.entityId]: conflict.serverRevision }
    writeStore(store)
    changedLocal = applyAuthoritativeSession(conflict.serverValue)
  }

  return (await pullRemoteNow()) || changedLocal
}

export function pullRemote(forceFromZero = false) {
  return serializeSync(() => pullRemoteNow(forceFromZero))
}

async function pullRemoteNow(forceFromZero = false) {
  const store = readStore()
  if (!store.connection || !navigator.onLine) return false
  const changedLocal = await flushPendingNow()
  const fresh = readStore()
  if (!sameConnection(store.connection, fresh.connection) || !fresh.connection
    || fresh.conflicts.length || fresh.pending.some((op) => !blockedByMissingSession(fresh, op)) || !navigator.onLine) return changedLocal
  const after = forceFromZero ? 0 : fresh.connection.revision
  const result = await request<{ revision: number; familyName?: string; children?: RemoteChild[]; sessions: RemoteSession[] }>(`/v1/sync?after=${after}`, {}, fresh.connection.deviceToken)
  const latest = readStore()
  // Edits made while this snapshot was in flight must be uploaded/conflicted
  // against the old cursor before any downloaded values replace them.
  if (!sameConnection(fresh.connection, latest.connection) || !latest.connection
    || latest.pending.some((op) => !blockedByMissingSession(latest, op)) || latest.conflicts.length
    || fresh.pending.map((op) => op.id).join() !== latest.pending.map((op) => op.id).join()) return changedLocal
  const current = loadData()
  const protectedIds = new Set(latest.missingSessions.map((item) => item.sessionId))
  const protectedChildIds = new Set(current.sessions.filter((item) => protectedIds.has(item.id)).map((item) => item.childId))
  const merged = mergeRemote(current, result.sessions.filter((item) => !protectedIds.has(item.id)),
    (result.children ?? []).filter((item) => !item.deletedAt || !protectedChildIds.has(item.id)))
  const changed = JSON.stringify(merged) !== JSON.stringify(current)
  if (changed) writeRemoteData(merged)
  // /v1/sync is the only authoritative place allowed to advance the cursor.
  latest.connection.revision = result.revision
  if (result.familyName) latest.connection.familyName = result.familyName
  writeStore(latest)
  return changed || changedLocal
}
