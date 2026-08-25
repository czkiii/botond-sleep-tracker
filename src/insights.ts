import type { SleepSession } from './types'
import { EXTREME_SLEEP_DURATION_MS, durationOf, getDataQualityWarnings } from './utils'

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_WAKE_WINDOW_MS = 5 * 60 * 1000
const MAX_WAKE_WINDOW_MS = 12 * 60 * 60 * 1000

export type WakeWindowInsight = {
  status: 'ready' | 'collecting' | 'unavailable'
  currentMs: number | null
  typicalMs: number | null
  sampleCount: number
  confidence: 'low' | 'medium' | null
}

export type InsightsFoundation = {
  wakeWindow: WakeWindowInsight
  quality: {
    usableSessionCount: number
    excludedSessionCount: number
    warningCount: number
  }
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function buildInsightsFoundation(sessions: SleepSession[], now = Date.now()): InsightsFoundation {
  const warnings = getDataQualityWarnings(sessions, now)
  const excludedIds = new Set(warnings.flatMap((warning) => warning.sessionIds))
  const allCompleted = sessions
    .filter((session) => session.endTime)
    .slice()
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
  const completed = allCompleted.filter((session) => !excludedIds.has(session.id) && durationOf(session, now) < EXTREME_SLEEP_DURATION_MS)

  const recentCutoff = now - 14 * DAY_MS
  const windows: number[] = []
  for (let index = 0; index < allCompleted.length - 1; index += 1) {
    const previous = allCompleted[index]
    const next = allCompleted[index + 1]
    if (excludedIds.has(previous.id) || excludedIds.has(next.id)) continue
    const wakeTime = Date.parse(previous.endTime!)
    const nextSleep = Date.parse(next.startTime)
    const window = nextSleep - wakeTime
    if (wakeTime >= recentCutoff && window >= MIN_WAKE_WINDOW_MS && window <= MAX_WAKE_WINDOW_MS) windows.push(window)
  }

  const lastCompleted = completed[completed.length - 1]
  const active = sessions.find((session) => !session.endTime)
  const currentMs = !active && lastCompleted ? Math.max(0, now - Date.parse(lastCompleted.endTime!)) : null
  const typicalMs = median(windows)
  const sampleCount = windows.length
  const status = currentMs === null ? 'unavailable' : sampleCount >= 3 ? 'ready' : 'collecting'

  return {
    wakeWindow: {
      status,
      currentMs,
      typicalMs,
      sampleCount,
      confidence: sampleCount >= 7 ? 'medium' : sampleCount >= 3 ? 'low' : null
    },
    quality: {
      usableSessionCount: completed.length,
      excludedSessionCount: excludedIds.size,
      warningCount: warnings.length
    }
  }
}
