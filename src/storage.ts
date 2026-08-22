import { detectLocale, t } from './i18n'
import type { Locale } from './i18n'
import type { AppData, SleepBackupV3, SleepSession } from './types'

export const STORAGE_KEY = 'solemiSleep:v3'

export const createDefaultData = (locale: Locale = detectLocale()): AppData => ({
  version: 3,
  settings: {
    childName: '',
    locale
  },
  sessions: []
})

const isValidDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const isLocale = (value: unknown): value is Locale => value === 'hu' || value === 'en' || value === 'de'

function isValidSession(value: unknown): value is SleepSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<SleepSession>
  if (typeof session.id !== 'string' || !session.id.trim()) return false
  if (!isValidDate(session.startTime)) return false
  if (session.endTime !== null && !isValidDate(session.endTime)) return false
  if (session.endTime && new Date(session.endTime).getTime() <= new Date(session.startTime).getTime()) return false
  if (typeof session.note !== 'string') return false
  if (!isValidDate(session.createdAt) || !isValidDate(session.updatedAt)) return false
  return true
}

function normalizeAppData(value: unknown): AppData | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Partial<AppData>
  if (data.version !== 3 || !Array.isArray(data.sessions)) return null
  if (!data.sessions.every(isValidSession)) return null

  return {
    version: 3,
    settings: {
      childName: typeof data.settings?.childName === 'string' ? data.settings.childName : '',
      locale: isLocale(data.settings?.locale) ? data.settings.locale : detectLocale()
    },
    sessions: data.sessions
  }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultData()
    const parsed = normalizeAppData(JSON.parse(raw))
    return parsed ?? createDefaultData()
  } catch {
    return createDefaultData()
  }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function createSession(startTime: string, endTime: string | null = null): SleepSession {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    startTime,
    endTime,
    note: '',
    createdAt: now,
    updatedAt: now
  }
}

export function exportData(data: AppData) {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const backup: SleepBackupV3 = {
    format: 'solemi-sleep-backup',
    version: 3,
    exportedAt: now.toISOString(),
    data
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `solemi-sleep-backup-v3-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importData(file: File, locale: Locale): Promise<AppData> {
  const text = await file.text()
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(t(locale, 'invalidJson'))
  }

  if (!parsed || typeof parsed !== 'object') throw new Error(t(locale, 'invalidBackup'))
  const backup = parsed as Partial<SleepBackupV3>
  if (backup.format !== 'solemi-sleep-backup' || backup.version !== 3 || !isValidDate(backup.exportedAt)) {
    throw new Error(t(locale, 'wrongBackup'))
  }

  const data = normalizeAppData(backup.data)
  if (!data) throw new Error(t(locale, 'corruptBackup'))
  return data
}
