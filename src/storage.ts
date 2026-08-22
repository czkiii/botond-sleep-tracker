import type { AppData, SleepBackupV2, SleepSession } from './types'

export const STORAGE_KEY = 'sleepTracker:v2'
const LEGACY_STORAGE_KEY = 'sleepTracker:v1'

export const defaultData: AppData = {
  version: 2,
  settings: {
    childName: 'Botond'
  },
  sessions: []
}

const isValidDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))

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
  if (data.version !== 2 || !Array.isArray(data.sessions)) return null
  if (!data.sessions.every(isValidSession)) return null

  return {
    version: 2,
    settings: {
      childName: typeof data.settings?.childName === 'string' ? data.settings.childName : 'Botond'
    },
    sessions: data.sessions
  }
}

export function loadData(): AppData {
  // V2 is an intentional clean start. Remove the old test-era V1 data once.
  localStorage.removeItem(LEGACY_STORAGE_KEY)

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultData
    const parsed = normalizeAppData(JSON.parse(raw))
    return parsed ?? defaultData
  } catch {
    return defaultData
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
  const backup: SleepBackupV2 = {
    format: 'botond-sleep-backup',
    version: 2,
    exportedAt: now.toISOString(),
    data
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `botond-sleep-backup-v2-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importData(file: File): Promise<AppData> {
  const text = await file.text()
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('A fájl nem érvényes JSON mentés.')
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('Érvénytelen mentés.')
  const backup = parsed as Partial<SleepBackupV2>
  if (backup.format !== 'botond-sleep-backup' || backup.version !== 2 || !isValidDate(backup.exportedAt)) {
    throw new Error('Ez nem V2 Botond alváskövető mentés.')
  }

  const data = normalizeAppData(backup.data)
  if (!data) throw new Error('A mentés sérült vagy hiányos alvásadatot tartalmaz.')
  return data
}
