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
  dayStart: string
  nightStart: string
}

export type AppData = {
  version: 1
  settings: Settings
  sessions: SleepSession[]
}

export type Page = 'today' | 'history' | 'stats' | 'settings'
