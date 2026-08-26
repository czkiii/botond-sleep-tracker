import type { SleepSession } from './types'
import { DEFAULT_DAY_START_MINUTES, DEFAULT_NIGHT_START_MINUTES, getDataQualityReport, splitDayNight } from './utils'

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_WAKE_WINDOW_MS = 5 * 60 * 1000
const MAX_WAKE_WINDOW_MS = 12 * 60 * 60 * 1000

export type PredictionBucket = 'day-1' | 'day-2' | 'day-3-plus' | 'night'

export type PredictionLite = {
  status: 'ready' | 'collecting' | 'unavailable'
  lookbackDays: 7 | 14 | 30
  bucket: PredictionBucket | null
  sampleCount: number
  confidence: 'low' | 'medium' | null
  currentWakeMs: number | null
  typicalTime: number | null
  windowStart: number | null
  windowEnd: number | null
  windowState: 'upcoming' | 'likely-now' | 'passed' | null
  sourceSessionIds: string[]
}

function localDateKey(iso: string) {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function overlaps(session: SleepSession, start: number, end: number, now: number) {
  const sessionStart = Date.parse(session.startTime)
  const sessionEnd = session.endTime ? Date.parse(session.endTime) : now
  return sessionStart < end && sessionEnd > start
}

function median(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function quantile(values: number[], position: number) {
  const sorted = values.slice().sort((a, b) => a - b)
  const index = (sorted.length - 1) * position
  const lower = Math.floor(index)
  const fraction = index - lower
  return sorted[lower + 1] === undefined ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower])
}

function nextBucket(sessions: SleepSession[], now: number): PredictionBucket {
  const date = new Date(now)
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (minutes < DEFAULT_DAY_START_MINUTES || minutes >= DEFAULT_NIGHT_START_MINUTES) return 'night'
  const today = localDateKey(date.toISOString())
  const daytimeCount = sessions.filter((session) => {
    if (Date.parse(session.startTime) > now || localDateKey(session.startTime) !== today) return false
    const parts = splitDayNight(session, now)
    return parts.day > parts.night
  }).length
  return daytimeCount === 0 ? 'day-1' : daytimeCount === 1 ? 'day-2' : 'day-3-plus'
}

export function buildPredictionLite(sessions: SleepSession[], now = Date.now(), lookbackDays: 7 | 14 | 30 = 14): PredictionLite {
  const empty = (status: 'collecting' | 'unavailable', bucket: PredictionBucket | null, sampleCount = 0, currentWakeMs: number | null = null): PredictionLite => ({
    status, lookbackDays, bucket, sampleCount, confidence: null, currentWakeMs, typicalTime: null, windowStart: null, windowEnd: null, windowState: null, sourceSessionIds: []
  })
  const report = getDataQualityReport(sessions, now)
  const excluded = new Set(report.excludedSessionIds)
  const reference = new Date(now)
  const todayStart = startOfLocalDay(reference)
  const tomorrowStart = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1).getTime()
  const currentHasIssue = sessions.some((session) => excluded.has(session.id) && overlaps(session, todayStart, tomorrowStart, now))
  const active = sessions.some((session) => !session.endTime)
  if (active || currentHasIssue) return empty('unavailable', null)

  const allCompleted = sessions.filter((session) => session.endTime).slice().sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
  const cleanCompleted = allCompleted.filter((session) => !excluded.has(session.id))
  const lastCompleted = allCompleted.slice().sort((a, b) => Date.parse(b.endTime!) - Date.parse(a.endTime!))[0]
  if (!lastCompleted || excluded.has(lastCompleted.id)) return empty('unavailable', null)
  const currentWakeMs = Math.max(0, now - Date.parse(lastCompleted.endTime!))
  const bucket = nextBucket(cleanCompleted, now)

  const dayOrder = new Map<string, Exclude<PredictionBucket, 'night'>>()
  const dayGroups = new Map<string, SleepSession[]>()
  cleanCompleted.forEach((session) => {
    const parts = splitDayNight(session, now)
    if (parts.day <= parts.night) return
    const key = localDateKey(session.startTime)
    dayGroups.set(key, [...(dayGroups.get(key) ?? []), session])
  })
  dayGroups.forEach((items) => items.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)).forEach((session, index) => {
    dayOrder.set(session.id, index === 0 ? 'day-1' : index === 1 ? 'day-2' : 'day-3-plus')
  }))

  const cutoff = now - lookbackDays * DAY_MS
  const samples: Array<{ durationMs: number; sessionIds: [string, string] }> = []
  for (let index = 0; index < allCompleted.length - 1; index += 1) {
    const previous = allCompleted[index]
    const next = allCompleted[index + 1]
    if (excluded.has(previous.id) || excluded.has(next.id)) continue
    const wake = Date.parse(previous.endTime!)
    const sleep = Date.parse(next.startTime)
    const durationMs = sleep - wake
    const nextParts = splitDayNight(next, now)
    const sampleBucket: PredictionBucket = nextParts.day > nextParts.night ? dayOrder.get(next.id) ?? 'day-3-plus' : 'night'
    if (wake >= cutoff && durationMs >= MIN_WAKE_WINDOW_MS && durationMs <= MAX_WAKE_WINDOW_MS && sampleBucket === bucket) {
      samples.push({ durationMs, sessionIds: [previous.id, next.id] })
    }
  }
  if (samples.length < 3) return empty('collecting', bucket, samples.length, currentWakeMs)

  const durations = samples.map((sample) => sample.durationMs)
  const lastWake = Date.parse(lastCompleted.endTime!)
  const typicalTime = lastWake + median(durations)
  const windowStart = lastWake + quantile(durations, 0.25)
  const windowEnd = lastWake + quantile(durations, 0.75)
  const windowState = now < windowStart ? 'upcoming' : now <= windowEnd ? 'likely-now' : 'passed'
  return {
    status: 'ready', lookbackDays, bucket, sampleCount: samples.length, confidence: samples.length >= 7 ? 'medium' : 'low', currentWakeMs,
    typicalTime, windowStart, windowEnd, windowState, sourceSessionIds: Array.from(new Set(samples.flatMap((sample) => sample.sessionIds)))
  }
}
