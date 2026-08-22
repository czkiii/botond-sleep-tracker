import type { Locale } from './i18n'

export type SleepSession = {
  id: string
  startTime: string
  endTime: string | null
  note: string
  createdAt: string
  updatedAt: string
}

export type Settings = {
  childName: string
  locale: Locale
}

export type AppData = {
  version: 3
  settings: Settings
  sessions: SleepSession[]
}

export type SleepBackupV3 = {
  format: 'solemi-sleep-backup'
  version: 3
  exportedAt: string
  data: AppData
}

export type Page = 'today' | 'history' | 'stats' | 'settings'
