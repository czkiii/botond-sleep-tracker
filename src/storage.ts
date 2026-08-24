import { detectLocale, t } from './i18n'
import type { Locale } from './i18n'
import type { AppData, ChildProfile, DayNightOverride, LegacyAppDataV3, SleepBackupV3, SleepBackupV4, SleepSession } from './types'

export const STORAGE_KEY = 'solemiSleep:v4'
export const LEGACY_STORAGE_KEY = 'solemiSleep:v3'

const nowIso = () => new Date().toISOString()

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
    settings: { locale, activeChildId: child.id },
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
  if (data.sessions.some((session) => !childIds.has(session.childId))) return null
  const requestedActive = data.settings?.activeChildId
  const activeChildId = typeof requestedActive === 'string' && childIds.has(requestedActive) ? requestedActive : data.children[0].id
  return {
    version: 4,
    settings: {
      locale: isLocale(data.settings?.locale) ? data.settings.locale : detectLocale(),
      activeChildId
    },
    children: data.children,
    sessions: data.sessions
  }
}

export function migrateV3(value: unknown): AppData | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Partial<LegacyAppDataV3>
  if (data.version !== 3 || !Array.isArray(data.sessions) || !data.sessions.every(isValidLegacySession)) return null
  const locale = isLocale(data.settings?.locale) ? data.settings.locale : detectLocale()
  const child = createChild(typeof data.settings?.childName === 'string' ? data.settings.childName : '', null, migratedChildId())
  return {
    version: 4,
    settings: { locale, activeChildId: child.id },
    children: [child],
    sessions: data.sessions.map((session) => ({ ...session, childId: child.id, dayNightOverride: null }))
  }
}

export function loadData(): AppData {
  try {
    const currentRaw = localStorage.getItem(STORAGE_KEY)
    if (currentRaw) {
      const current = normalizeAppData(JSON.parse(currentRaw))
      if (current) return current
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacyRaw) {
      const migrated = migrateV3(JSON.parse(legacyRaw))
      if (migrated) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
        return migrated
      }
    }
  } catch {}
  return createDefaultData()
}

export function saveData(data: AppData) {
  const previous = loadData()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  if (typeof window !== 'undefined' && JSON.stringify(previous) !== JSON.stringify(data)) {
    window.dispatchEvent(new CustomEvent('solemi-data-saved', { detail: { previous, next: data } }))
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

export async function importData(file: File, locale: Locale): Promise<AppData> {
  const text = await file.text()
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error(t(locale, 'invalidJson')) }
  if (!parsed || typeof parsed !== 'object') throw new Error(t(locale, 'invalidBackup'))
  const backup = parsed as Partial<SleepBackupV3 | SleepBackupV4>
  if (backup.format !== 'solemi-sleep-backup' || !isValidDate(backup.exportedAt)) throw new Error(t(locale, 'wrongBackup'))
  const data = backup.version === 4 ? normalizeAppData(backup.data) : backup.version === 3 ? migrateV3(backup.data) : null
  if (!data) throw new Error(backup.version === 3 || backup.version === 4 ? t(locale, 'corruptBackup') : t(locale, 'wrongBackup'))
  return data
}
