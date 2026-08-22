import type { AppData, SleepSession } from './types'

export const STORAGE_KEY = 'sleepTracker:v1'

export const defaultData: AppData = {
  version: 1,
  settings: {
    childName: 'Botond',
    dayStart: '06:00',
    nightStart: '19:00'
  },
  sessions: []
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultData
    const parsed = JSON.parse(raw) as AppData
    if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) return defaultData
    return {
      ...defaultData,
      ...parsed,
      settings: { ...defaultData.settings, ...parsed.settings }
    }
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
  const date = new Date().toISOString().slice(0, 10)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `botond-sleep-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importData(file: File): Promise<AppData> {
  const text = await file.text()
  const parsed = JSON.parse(text) as AppData
  if (parsed.version !== 1 || !parsed.settings || !Array.isArray(parsed.sessions)) {
    throw new Error('Érvénytelen mentés.')
  }
  return parsed
}
