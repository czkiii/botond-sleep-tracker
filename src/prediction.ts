import { buildNightGroups, buildSleepBuckets, routineNightBounds } from './nightGroups'
import type { WakeBucket } from './nightGroups'
import type { SleepSession } from './types'
import { DEFAULT_DAY_START_MINUTES, DEFAULT_NIGHT_START_MINUTES, getDataQualityReport, splitDayNight } from './utils'

import { statisticsLookbackStart } from './statisticsCalendar'
const MIN_WAKE_WINDOW_MS = 5 * 60 * 1000
const MAX_WAKE_WINDOW_MS = 12 * 60 * 60 * 1000

export type PredictionBucket = WakeBucket

export type PredictionLite = {
  status: 'ready' | 'collecting' | 'unavailable'
  unavailableReason: 'missing-wake' | 'sleeping' | 'invalid-data' | 'stale-wake' | null
  lastWakeTime: number | null
  lookbackDays: 7 | 14 | 30
  bucket: PredictionBucket | null
  sampleCount: number
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

function nextBucket(sessions: SleepSession[], now: number, cutoff: number): PredictionBucket {
  const date = new Date(now)
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (minutes < DEFAULT_DAY_START_MINUTES || minutes >= DEFAULT_NIGHT_START_MINUTES) return 'night'
  const today = localDateKey(date.toISOString())
  const daytimeByDate = new Map<string, number>()
  sessions.forEach((session) => {
    if (Date.parse(session.startTime) > now) return
    const key = localDateKey(session.startTime)
    // Learn nap counts only from past calendar days fully inside the
    // selected rolling range. The cut-off day's fragment is not a whole
    // day. Today's count is current context, never a historical sample.
    if (key !== today && startOfLocalDay(new Date(session.startTime)) < cutoff) return
    const parts = splitDayNight(session, now)
    if (parts.day <= parts.night) return
    daytimeByDate.set(key, (daytimeByDate.get(key) ?? 0) + 1)
  })
  const daytimeCount = daytimeByDate.get(today) ?? 0
  const historicalCounts = Array.from(daytimeByDate.entries()).filter(([key]) => key !== today).map(([, count]) => count)
  const typicalDaytimeCount = historicalCounts.length >= 3 ? Math.max(1, Math.round(median(historicalCounts))) : null
  if (typicalDaytimeCount !== null && daytimeCount >= typicalDaytimeCount) return 'night'
  return daytimeCount === 0 ? 'day-1' : daytimeCount === 1 ? 'day-2' : 'day-3-plus'
}

export function buildPredictionLite(sessions: SleepSession[], now = Date.now(), lookbackDays: 7 | 14 | 30 = 14): PredictionLite {
  const empty = (status: 'collecting' | 'unavailable', details: Partial<Pick<PredictionLite, 'bucket' | 'sampleCount' | 'currentWakeMs' | 'lastWakeTime' | 'unavailableReason'>> = {}): PredictionLite => ({
    status, lookbackDays, bucket: null, sampleCount: 0, currentWakeMs: null, lastWakeTime: null, unavailableReason: null,
    typicalTime: null, windowStart: null, windowEnd: null, windowState: null, sourceSessionIds: [], ...details
  })
  const report = getDataQualityReport(sessions, now)
  const excluded = new Set(report.excludedSessionIds)
  const reference = new Date(now)
  const todayStart = startOfLocalDay(reference)
  const tomorrowStart = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1).getTime()
  const currentHasIssue = sessions.some((session) => excluded.has(session.id) && overlaps(session, todayStart, tomorrowStart, now))
  const active = sessions.some((session) => !session.endTime)
  // Unknown or future timestamps cannot establish the latest real waking.
  const unknownTiming = sessions.some(session => !Number.isFinite(Date.parse(session.startTime)) ||
    Date.parse(session.startTime) > now || (session.endTime !== null &&
      (!Number.isFinite(Date.parse(session.endTime)) || Date.parse(session.endTime) > now)))
  if (unknownTiming) return empty('unavailable', { unavailableReason: 'invalid-data' })
  if (active) return empty('unavailable', { unavailableReason: 'sleeping' })
  if (currentHasIssue) return empty('unavailable', { unavailableReason: 'invalid-data' })

  const allCompleted = sessions.filter((session) => session.endTime).slice().sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
  const cleanCompleted = allCompleted.filter((session) => !excluded.has(session.id))
  const lastCompleted = allCompleted.slice().sort((a, b) => Date.parse(b.endTime!) - Date.parse(a.endTime!))[0]
  if (!lastCompleted) return empty('unavailable', { unavailableReason: 'missing-wake' })
  if (excluded.has(lastCompleted.id)) return empty('unavailable', { unavailableReason: 'invalid-data' })
  const lastWake = Date.parse(lastCompleted.endTime!)
  // Calendar-based display eligibility, not a physiological wake-duration
  // limit. After midnight retain the preceding evening until day starts.
  const contextStart = new Date(todayStart)
  if (reference.getHours() * 60 + reference.getMinutes() < DEFAULT_DAY_START_MINUTES) {
    contextStart.setDate(contextStart.getDate() - 1)
    contextStart.setMinutes(DEFAULT_NIGHT_START_MINUTES)
  }
  if (lastWake < contextStart.getTime()) return empty('unavailable', { unavailableReason: 'stale-wake', lastWakeTime: lastWake })
  const currentWakeMs = now - lastWake
  const cutoff = statisticsLookbackStart(now, lookbackDays)
  let bucket = nextBucket(cleanCompleted, now, cutoff)
  const nightGroups = buildNightGroups(sessions, excluded, now)
  const currentNight = routineNightBounds(reference.toISOString())!
  const minutes = reference.getHours() * 60 + reference.getMinutes()
  if (bucket === 'night' && (minutes < DEFAULT_DAY_START_MINUTES || minutes >= DEFAULT_NIGHT_START_MINUTES)) {
    if (nightGroups.incomplete.has(currentNight.key)) return empty('unavailable', { unavailableReason: 'invalid-data' })
    if (nightGroups.nights.has(currentNight.key)) bucket = 'night-resettling'
  }

  const sleepBuckets = buildSleepBuckets(sessions, excluded, now, nightGroups)

  // Keep original adjacency and each day's actual sleep order: filtering
  // sessions first would invent gaps or relabel a boundary day's later nap.
  const samples: Array<{ durationMs: number; sessionIds: [string, string] }> = []
  for (let index = 0; index < allCompleted.length - 1; index += 1) {
    const previous = allCompleted[index]
    const next = allCompleted[index + 1]
    if (excluded.has(previous.id) || excluded.has(next.id)) continue
    const wake = Date.parse(previous.endTime!)
    const sleep = Date.parse(next.startTime)
    const durationMs = sleep - wake
    const sampleBucket = sleepBuckets.get(next.id)
    if (wake >= cutoff && durationMs >= MIN_WAKE_WINDOW_MS && durationMs <= MAX_WAKE_WINDOW_MS && sampleBucket === bucket) {
      samples.push({ durationMs, sessionIds: [previous.id, next.id] })
    }
  }
  if (samples.length < 3) return empty('collecting', { bucket, sampleCount: samples.length, currentWakeMs, lastWakeTime: lastWake })

  const durations = samples.map((sample) => sample.durationMs)
  const typicalTime = lastWake + median(durations)
  const windowStart = lastWake + quantile(durations, 0.25)
  const windowEnd = lastWake + quantile(durations, 0.75)
  const windowState = now < windowStart ? 'upcoming' : now <= windowEnd ? 'likely-now' : 'passed'
  return {
    status: 'ready', unavailableReason: null, lastWakeTime: lastWake, lookbackDays, bucket, sampleCount: samples.length, currentWakeMs,
    typicalTime, windowStart, windowEnd, windowState, sourceSessionIds: Array.from(new Set(samples.flatMap((sample) => sample.sessionIds)))
  }
}
