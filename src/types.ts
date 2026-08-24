import type { Locale } from './i18n'

export type DayNightOverride = 'day' | 'night' | null

export type ChildProfile = {
  id: string
  name: string
  birthDate: string | null
  photoRef: string | null
  createdAt: string
  updatedAt: string
}

export type SleepSession = {
  id: string
  childId: string
  startTime: string
  endTime: string | null
  note: string
  dayNightOverride: DayNightOverride
  createdAt: string
  updatedAt: string
}

export type Settings = {
  locale: Locale
  activeChildId: string
}

export type AppData = {
  version: 4
  settings: Settings
  children: ChildProfile[]
  sessions: SleepSession[]
}

export type LegacyAppDataV3 = {
  version: 3
  settings: {
    childName: string
    locale: Locale
  }
  sessions: Array<Omit<SleepSession, 'childId' | 'dayNightOverride'>>
}

export type SleepBackupV3 = {
  format: 'solemi-sleep-backup'
  version: 3
  exportedAt: string
  data: LegacyAppDataV3
}

export type SleepBackupV4 = {
  format: 'solemi-sleep-backup'
  version: 4
  exportedAt: string
  data: AppData
}

export type Page = 'today' | 'history' | 'stats' | 'settings'
