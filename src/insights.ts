import type { SleepSession } from './types'
import { EXTREME_SLEEP_DURATION_MS, durationOf, getDataQualityReport, splitDayNight } from './utils'

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_WAKE_WINDOW_MS = 5 * 60 * 1000
const MAX_WAKE_WINDOW_MS = 12 * 60 * 60 * 1000

export type WakeWindowInsight = {
  status: 'ready' | 'collecting' | 'unavailable'
  currentMs: number | null
  typicalMs: number | null
  typicalRange: { lowMs: number; highMs: number } | null
  sampleCount: number
  confidence: 'low' | 'medium' | null
  lookbackDays: 7 | 14 | 30
  sourceSessionIds: string[]
  breakdown: Array<{
    key: 'day-1' | 'day-2' | 'day-3-plus' | 'night'
    typicalMs: number
    lowMs: number
    highMs: number
    sampleCount: number
  }>
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

function quantile(values: number[], position: number) {
  const sorted = values.slice().sort((a, b) => a - b)
  if (!sorted.length) return null
  const index = (sorted.length - 1) * position
  const lower = Math.floor(index)
  const fraction = index - lower
  return sorted[lower + 1] === undefined ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower])
}

function localDateKey(iso: string) {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function buildInsightsFoundation(sessions: SleepSession[], now = Date.now(), options: { lookbackDays?: 7 | 14 | 30 } = {}): InsightsFoundation {
  const lookbackDays = options.lookbackDays ?? 14
  const report = getDataQualityReport(sessions, now)
  const excludedIds = new Set(report.excludedSessionIds)
  const allCompleted = sessions
    .filter((session) => session.endTime)
    .slice()
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
  const completed = allCompleted.filter((session) => !excludedIds.has(session.id) && durationOf(session, now) < EXTREME_SLEEP_DURATION_MS)

  const dayOrder = new Map<string, 'day-1' | 'day-2' | 'day-3-plus'>()
  const dayGroups = new Map<string, SleepSession[]>()
  completed.forEach((session) => {
    const parts = splitDayNight(session, now)
    if (parts.day <= parts.night) return
    const key = localDateKey(session.startTime)
    dayGroups.set(key, [...(dayGroups.get(key) ?? []), session])
  })
  dayGroups.forEach((items) => items.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)).forEach((session, index) => {
    dayOrder.set(session.id, index === 0 ? 'day-1' : index === 1 ? 'day-2' : 'day-3-plus')
  }))

  const recentCutoff = now - lookbackDays * DAY_MS
  const samples: Array<{ durationMs: number; sessionIds: [string, string]; bucket: 'day-1' | 'day-2' | 'day-3-plus' | 'night' }> = []
  for (let index = 0; index < allCompleted.length - 1; index += 1) {
    const previous = allCompleted[index]
    const next = allCompleted[index + 1]
    if (excludedIds.has(previous.id) || excludedIds.has(next.id)) continue
    const wakeTime = Date.parse(previous.endTime!)
    const nextSleep = Date.parse(next.startTime)
    const window = nextSleep - wakeTime
    if (wakeTime >= recentCutoff && window >= MIN_WAKE_WINDOW_MS && window <= MAX_WAKE_WINDOW_MS) {
      samples.push({ durationMs: window, sessionIds: [previous.id, next.id], bucket: dayOrder.get(next.id) ?? 'night' })
    }
  }

  const lastCompleted = allCompleted[allCompleted.length - 1]
  const active = sessions.find((session) => !session.endTime)
  const currentMs = !active && lastCompleted && !excludedIds.has(lastCompleted.id) ? Math.max(0, now - Date.parse(lastCompleted.endTime!)) : null
  const windows = samples.map((sample) => sample.durationMs)
  const typicalMs = median(windows)
  const lowMs = quantile(windows, 0.25)
  const highMs = quantile(windows, 0.75)
  const sampleCount = windows.length
  const status = currentMs === null ? 'unavailable' : sampleCount >= 3 ? 'ready' : 'collecting'
  const breakdown = (['day-1', 'day-2', 'day-3-plus', 'night'] as const).flatMap((key) => {
    const values = samples.filter((sample) => sample.bucket === key).map((sample) => sample.durationMs)
    const middle = median(values)
    const low = quantile(values, 0.25)
    const high = quantile(values, 0.75)
    return values.length >= 3 && middle !== null && low !== null && high !== null ? [{ key, typicalMs: middle, lowMs: low, highMs: high, sampleCount: values.length }] : []
  })

  return {
    wakeWindow: {
      status,
      currentMs,
      typicalMs,
      typicalRange: lowMs !== null && highMs !== null ? { lowMs, highMs } : null,
      sampleCount,
      confidence: sampleCount >= 7 ? 'medium' : sampleCount >= 3 ? 'low' : null,
      lookbackDays,
      sourceSessionIds: Array.from(new Set(samples.flatMap((sample) => sample.sessionIds))),
      breakdown
    },
    quality: {
      usableSessionCount: report.usableCompletedSessionCount,
      excludedSessionCount: excludedIds.size,
      warningCount: report.issues.length
    }
  }
}
