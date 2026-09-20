import { detectLocale, t } from './i18n'
import type { Locale } from './i18n'
import type { AppData, ChildProfile, DayNightOverride, LegacyAppDataV3, SleepBackupV3, SleepBackupV4, SleepSession } from './types'

export const REMOTE_DATA_EVENT = 'solemi-remote-data-applied'

export type ImportDiagnostic = {
  kind: 'migrated-v3' | 'active-child-reset' | 'identical-children-removed' | 'identical-sessions-removed' | 'local-photos-not-included'
  count: number
}

export type ImportInspection = {
  data: AppData
  sourceVersion: 3 | 4
  diagnostics: ImportDiagnostic[]
}

export class ImportValidationError extends Error {
  constructor(public code: 'invalid-envelope' | 'unsupported-version' | 'invalid-children' | 'invalid-sessions' | 'duplicate-child-conflict' | 'duplicate-session-conflict' | 'orphan-sessions', public count = 0) {
    super(code)
  }
}

export const STORAGE_KEY = 'solemiSleep:v4'
export const LEGACY_STORAGE_KEY = 'solemiSleep:v3'
export const STORAGE_RECOVERED_EVENT = 'solemi-storage-recovered'

export type DataStorageErrorCode = 'corrupt-v4' | 'corrupt-v3' | 'storage-unavailable' | 'migration-write-failed' | 'storage-write-failed'

export class DataStorageError extends Error {
  constructor(public code: DataStorageErrorCode, public source: 'v4' | 'v3' | 'storage', public raw: string | null = null) {
    super(code)
    this.name = 'DataStorageError'
  }
}

export type DataLoadResult =
  | { status: 'ready' | 'empty' | 'migrated'; data: AppData; error: null }
  | { status: 'recovery-required'; data: AppData; error: DataStorageError }

const nowIso = () => new Date().toISOString()
const LOCAL_METADATA_KEY = '__solemiLocal'
const SAFETY_BACKUP_KEY = 'safetyBackupV1'

type StoredEnvelope = AppData & { [LOCAL_METADATA_KEY]?: Record<string, unknown> }
export type SafetyBackupReason = 'before-import' | 'before-clear' | 'before-restore' | 'before-family-bootstrap'
export type SafetyBackup = SleepBackupV4 & { reason: SafetyBackupReason }

function newChildId() {
  return `child_${crypto.randomUUID().replaceAll('-', '')}`
}

function migratedChildId() {
  try {
    const raw = localStorage.getItem('solemiSleep:sync:v1')
    const familyId = raw ? JSON.parse(raw)?.connection?.familyId : null
    if (typeof familyId === 'string' && familyId) return `child_legacy_${familyId}`
  } catch {}
  return newChildId()
}

export function createChild(name = '', birthDate: string | null = null, id = newChildId()): ChildProfile {
  const now = nowIso()
  return { id, name: name.trim(), birthDate, photoRef: null, createdAt: now, updatedAt: now }
}

export const createDefaultData = (locale: Locale = detectLocale()): AppData => {
  const child = createChild()
  return {
    version: 4,
    settings: { locale, activeChildId: child.id, longSleepReminderEnabled: false },
    children: [child],
    sessions: []
  }
}

const isValidDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const isBirthDate = (value: unknown): value is string | null => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)))
const isLocale = (value: unknown): value is Locale => value === 'hu' || value === 'en' || value === 'de'
const isDayNightOverride = (value: unknown): value is DayNightOverride => value === null || value === 'day' || value === 'night'

function isValidChild(value: unknown): value is ChildProfile {
  if (!value || typeof value !== 'object') return false
  const child = value as Partial<ChildProfile>
  return typeof child.id === 'string' && Boolean(child.id.trim())
    && typeof child.name === 'string'
    && isBirthDate(child.birthDate)
    && (child.photoRef === null || typeof child.photoRef === 'string')
    && isValidDate(child.createdAt)
    && isValidDate(child.updatedAt)
}

function isValidSessionV4(value: unknown): value is SleepSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<SleepSession>
  if (typeof session.id !== 'string' || !session.id.trim()) return false
  if (typeof session.childId !== 'string' || !session.childId.trim()) return false
  if (!isValidDate(session.startTime)) return false
  if (session.endTime !== null && !isValidDate(session.endTime)) return false
  if (session.endTime && new Date(session.endTime).getTime() <= new Date(session.startTime).getTime()) return false
  if (typeof session.note !== 'string' || !isDayNightOverride(session.dayNightOverride)) return false
  return isValidDate(session.createdAt) && isValidDate(session.updatedAt)
}

function isValidLegacySession(value: unknown): value is LegacyAppDataV3['sessions'][number] {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<LegacyAppDataV3['sessions'][number]>
  if (typeof session.id !== 'string' || !session.id.trim() || !isValidDate(session.startTime)) return false
  if (session.endTime !== null && !isValidDate(session.endTime)) return false
  if (session.endTime && new Date(session.endTime).getTime() <= new Date(session.startTime).getTime()) return false
  return typeof session.note === 'string' && isValidDate(session.createdAt) && isValidDate(session.updatedAt)
}

export function normalizeAppData(value: unknown): AppData | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Partial<AppData>
  if (data.version !== 4 || !Array.isArray(data.children) || !data.children.length || !Array.isArray(data.sessions)) return null
  if (!data.children.every(isValidChild) || !data.sessions.every(isValidSessionV4)) return null
  const childIds = new Set(data.children.map((child) => child.id))
  if (childIds.size !== data.children.length) return null
  const sessionIds = new Set(data.sessions.map((session) => session.id))
  if (sessionIds.size !== data.sessions.length) return null
  if (data.sessions.some((session) => !childIds.has(session.childId))) return null
  const requestedActive = data.settings?.activeChildId
  const activeChildId = typeof requestedActive === 'string' && childIds.has(requestedActive) ? requestedActive : data.children[0].id
  return {
    version: 4,
    settings: {
      locale: isLocale(data.settings?.locale) ? data.settings.locale : detectLocale(),
      activeChildId,
      longSleepReminderEnabled: data.settings?.longSleepReminderEnabled === true
    },
    children: data.children,
    sessions: data.sessions
  }
}

export function migrateV3(value: unknown): AppData | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Partial<LegacyAppDataV3>
  if (data.version !== 3 || !Array.isArray(data.sessions) || !data.sessions.every(isValidLegacySession)) return null
  if (new Set(data.sessions.map((session) => session.id)).size !== data.sessions.length) return null
  const locale = isLocale(data.settings?.locale) ? data.settings.locale : detectLocale()
  const child = createChild(typeof data.settings?.childName === 'string' ? data.settings.childName : '', null, migratedChildId())
  return {
    version: 4,
    settings: { locale, activeChildId: child.id, longSleepReminderEnabled: false },
    children: [child],
    sessions: data.sessions.map((session) => ({ ...session, childId: child.id, dayNightOverride: null }))
  }
}

export function loadDataResult(): DataLoadResult {
  let currentRaw: string | null
  try {
    currentRaw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return { status: 'recovery-required', data: createDefaultData(), error: new DataStorageError('storage-unavailable', 'storage') }
  }

  if (currentRaw !== null) {
    try {
      const current = normalizeAppData(JSON.parse(currentRaw))
      if (current) return { status: 'ready', data: current, error: null }
    } catch { /* reported below without replacing the original bytes */ }
    return { status: 'recovery-required', data: createDefaultData(), error: new DataStorageError('corrupt-v4', 'v4', currentRaw) }
  }

  let legacyRaw: string | null
  try {
    legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY)
  } catch {
    return { status: 'recovery-required', data: createDefaultData(), error: new DataStorageError('storage-unavailable', 'storage') }
  }

  if (legacyRaw !== null) {
    try {
      const migrated = migrateV3(JSON.parse(legacyRaw))
      if (migrated) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
        } catch {
          return { status: 'recovery-required', data: createDefaultData(), error: new DataStorageError('migration-write-failed', 'v3', legacyRaw) }
        }
        return { status: 'migrated', data: migrated, error: null }
      }
    } catch { /* reported below without replacing the original bytes */ }
    return { status: 'recovery-required', data: createDefaultData(), error: new DataStorageError('corrupt-v3', 'v3', legacyRaw) }
  }

  return { status: 'empty', data: createDefaultData(), error: null }
}

export function loadData(): AppData {
  const result = loadDataResult()
  if (result.status === 'recovery-required') throw result.error
  return result.data
}

export function recoverData(data: AppData) {
  const normalized = normalizeAppData(data)
  if (!normalized) throw new DataStorageError('corrupt-v4', 'v4')
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    throw new DataStorageError('storage-unavailable', 'storage')
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STORAGE_RECOVERED_EVENT))
}

function currentLocalMetadata() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return {}
  const parsed = JSON.parse(raw) as StoredEnvelope
  return parsed[LOCAL_METADATA_KEY] && typeof parsed[LOCAL_METADATA_KEY] === 'object'
    ? parsed[LOCAL_METADATA_KEY] as Record<string, unknown> : {}
}

export function getLocalMetadata(key: string): unknown {
  try {
    // A fresh install has no envelope yet. Reading optional metadata must not
    // create a different default child or depend on browser locale support.
    if (localStorage.getItem(STORAGE_KEY) === null) return undefined
    loadData()
    return currentLocalMetadata()[key]
  } catch {
    throw new DataStorageError('corrupt-v4', 'v4', localStorage.getItem(STORAGE_KEY))
  }
}

export function saveDataWithMetadata(data: AppData, key: string, value: unknown) {
  loadData()
  const normalized = normalizeAppData(data)
  if (!normalized) throw new DataStorageError('corrupt-v4', 'v4')
  const envelope: StoredEnvelope = { ...normalized, [LOCAL_METADATA_KEY]: { ...currentLocalMetadata(), [key]: value } }
  try {
    // The diary and its durable outbox are one localStorage value, so this
    // browser operation either replaces both or neither.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    throw new DataStorageError('storage-write-failed', 'storage')
  }
}

export function saveDataAfterDeletion(data: AppData, key: string, value: unknown) {
  loadData()
  const normalized = normalizeAppData(data)
  if (!normalized) throw new DataStorageError('corrupt-v4', 'v4')
  const metadata = { ...currentLocalMetadata(), [key]: value }
  delete metadata[SAFETY_BACKUP_KEY]
  const envelope: StoredEnvelope = { ...normalized, [LOCAL_METADATA_KEY]: metadata }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    throw new DataStorageError('storage-write-failed', 'storage')
  }
}

export function saveLocalMetadata(key: string, value: unknown) {
  saveDataWithMetadata(loadData(), key, value)
}

export function saveSafetyBackup(data: AppData, reason: SafetyBackupReason): SafetyBackup {
  const normalized = normalizeAppData(data)
  if (!normalized) throw new DataStorageError('corrupt-v4', 'v4')
  const backup: SafetyBackup = {
    format: 'solemi-sleep-backup', version: 4, exportedAt: nowIso(), data: normalized, reason
  }
  saveLocalMetadata(SAFETY_BACKUP_KEY, backup)
  return backup
}

export function loadSafetyBackup(): SafetyBackup | null {
  const value = getLocalMetadata(SAFETY_BACKUP_KEY)
  if (!value || typeof value !== 'object') return null
  const backup = value as Partial<SafetyBackup>
  const reasons: SafetyBackupReason[] = ['before-import', 'before-clear', 'before-restore', 'before-family-bootstrap']
  if (backup.format !== 'solemi-sleep-backup' || backup.version !== 4
    || typeof backup.exportedAt !== 'string' || !Number.isFinite(Date.parse(backup.exportedAt))
    || !reasons.includes(backup.reason as SafetyBackupReason)) return null
  const data = normalizeAppData(backup.data)
  return data ? { format: 'solemi-sleep-backup', version: 4, exportedAt: backup.exportedAt,
    data, reason: backup.reason as SafetyBackupReason } : null
}

export function saveRemoteData(data: AppData) {
  // A remote merge must not become an implicit recovery action. Reading first
  // makes a damaged current diary block the write just like a local save.
  const normalized = normalizeAppData(data)
  if (!normalized) throw new DataStorageError('corrupt-v4', 'v4')
  loadData()
  const metadata = currentLocalMetadata()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...normalized, [LOCAL_METADATA_KEY]: metadata }))
  } catch {
    throw new DataStorageError('storage-write-failed', 'storage')
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(REMOTE_DATA_EVENT))
}

export function exportDamagedData(error: DataStorageError) {
  if (error.raw === null) return false
  const date = new Date().toISOString().slice(0, 10)
  const blob = new Blob([error.raw], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `solemi-sleep-damaged-${error.source}-${date}.txt`
  a.click()
  URL.revokeObjectURL(url)
  return true
}

export function saveData(data: AppData) {
  loadData()
  const normalized = normalizeAppData(data)
  if (!normalized) throw new DataStorageError('corrupt-v4', 'v4')
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...normalized, [LOCAL_METADATA_KEY]: currentLocalMetadata() }))
  } catch {
    throw new DataStorageError('storage-write-failed', 'storage')
  }
}

export function createSession(childId: string, startTime: string, endTime: string | null = null): SleepSession {
  const now = nowIso()
  return { id: crypto.randomUUID(), childId, startTime, endTime, note: '', dayNightOverride: null, createdAt: now, updatedAt: now }
}

export function exportData(data: AppData) {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const backup: SleepBackupV4 = { format: 'solemi-sleep-backup', version: 4, exportedAt: now.toISOString(), data }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `solemi-sleep-backup-v4-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function dedupeIdentical<T extends { id: string }>(items: T[]) {
  const unique: T[] = []
  const seen = new Map<string, string>()
  let removed = 0
  let conflicts = 0
  items.forEach((item) => {
    const serialized = JSON.stringify(item)
    const previous = seen.get(item.id)
    if (previous === undefined) {
      seen.set(item.id, serialized)
      unique.push(item)
    } else if (previous === serialized) removed += 1
    else conflicts += 1
  })
  return { unique, removed, conflicts }
}

export function inspectBackup(parsed: unknown): ImportInspection {
  if (!parsed || typeof parsed !== 'object') throw new ImportValidationError('invalid-envelope')
  const backup = parsed as Partial<SleepBackupV3 | SleepBackupV4>
  if (backup.format !== 'solemi-sleep-backup' || !isValidDate(backup.exportedAt)) throw new ImportValidationError('invalid-envelope')
  if (backup.version !== 3 && backup.version !== 4) throw new ImportValidationError('unsupported-version')

  if (backup.version === 3) {
    const data = migrateV3(backup.data)
    if (!data) throw new ImportValidationError('invalid-sessions')
    return { data, sourceVersion: 3, diagnostics: [{ kind: 'migrated-v3', count: data.sessions.length }] }
  }

  if (!backup.data || typeof backup.data !== 'object') throw new ImportValidationError('invalid-envelope')
  const raw = backup.data as Partial<AppData>
  if (raw.version !== 4 || !Array.isArray(raw.children) || !raw.children.length) throw new ImportValidationError('invalid-children')
  if (!Array.isArray(raw.sessions)) throw new ImportValidationError('invalid-sessions')
  const invalidChildren = raw.children.filter((child) => !isValidChild(child)).length
  if (invalidChildren) throw new ImportValidationError('invalid-children', invalidChildren)
  const invalidSessions = raw.sessions.filter((session) => !isValidSessionV4(session)).length
  if (invalidSessions) throw new ImportValidationError('invalid-sessions', invalidSessions)

  const children = dedupeIdentical(raw.children)
  if (children.conflicts) throw new ImportValidationError('duplicate-child-conflict', children.conflicts)
  const sessions = dedupeIdentical(raw.sessions)
  if (sessions.conflicts) throw new ImportValidationError('duplicate-session-conflict', sessions.conflicts)
  const childIds = new Set(children.unique.map((child) => child.id))
  const orphanCount = sessions.unique.filter((session) => !childIds.has(session.childId)).length
  if (orphanCount) throw new ImportValidationError('orphan-sessions', orphanCount)

  const requestedActive = raw.settings?.activeChildId
  const activeChildReset = typeof requestedActive !== 'string' || !childIds.has(requestedActive)
  const photoCount = children.unique.filter((child) => child.photoRef).length
  const data = normalizeAppData({ ...raw, children: children.unique, sessions: sessions.unique })
  if (!data) throw new ImportValidationError('invalid-envelope')
  const diagnostics: ImportDiagnostic[] = []
  if (children.removed) diagnostics.push({ kind: 'identical-children-removed', count: children.removed })
  if (sessions.removed) diagnostics.push({ kind: 'identical-sessions-removed', count: sessions.removed })
  if (activeChildReset) diagnostics.push({ kind: 'active-child-reset', count: 1 })
  if (photoCount) diagnostics.push({ kind: 'local-photos-not-included', count: photoCount })
  return { data, sourceVersion: 4, diagnostics }
}

function importValidationMessage(error: ImportValidationError, locale: Locale) {
  const keys = {
    'invalid-envelope': 'invalidBackup',
    'unsupported-version': 'wrongBackup',
    'invalid-children': 'importInvalidChildren',
    'invalid-sessions': 'importInvalidSessions',
    'duplicate-child-conflict': 'importChildConflict',
    'duplicate-session-conflict': 'importSessionConflict',
    'orphan-sessions': 'importOrphanSessions'
  } as const
  return t(locale, keys[error.code], { count: error.count })
}

export async function importData(file: File, locale: Locale): Promise<ImportInspection> {
  const text = await file.text()
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error(t(locale, 'invalidJson')) }
  try { return inspectBackup(parsed) } catch (error) {
    if (error instanceof ImportValidationError) throw new Error(importValidationMessage(error, locale))
    throw error
  }
}
