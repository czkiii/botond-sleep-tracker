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
}

export type AppData = {
  version: 2
  settings: Settings
  sessions: SleepSession[]
}

export type SleepBackupV2 = {
  format: 'botond-sleep-backup'
  version: 2
  exportedAt: string
  data: AppData
}

export type Page = 'today' | 'history' | 'stats' | 'settings'
