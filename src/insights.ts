import type { SleepSession } from './types'
import { EXTREME_SLEEP_DURATION_MS, durationOf, getDataQualityReport, splitDayNight } from './utils'

import { statisticsLookbackStart } from './statisticsCalendar'
const MIN_WAKE_WINDOW_MS = 5 * 60 * 1000
const MAX_WAKE_WINDOW_MS = 12 * 60 * 60 * 1000
const MIN_WAKE_WINDOW_SAMPLES = 3

export type WakeWindowInsight = {
  status: 'ready' | 'collecting' | 'unavailable'
  currentMs: number | null
  typicalMs: number | null
  typicalRange: { lowMs: number; highMs: number } | null
  sampleCount: number
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
  routine: RoutineInsight
  quality: {
    usableSessionCount: number
    excludedSessionCount: number
    warningCount: number
  }
}

export type RoutineInsight = {
  status: 'ready' | 'collecting'
  lookbackDays: 7 | 14 | 30
  observedDayCount: number
  bedtime: ClockPattern | null
  wakeTime: ClockPattern | null
  bedtimeVariable: boolean
  wakeTimeVariable: boolean
  daytimeSleepCount: CountPattern | null
}

export type ClockPattern = {
  typicalMinutes: number
  lowMinutes: number
  highMinutes: number
  rangeCrossesMidnight: boolean
  sampleCount: number
  consistentCount: number
}

export type CountPattern = {
  typicalCount: number
  lowCount: number
  highCount: number
  sampleCount: number
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

function clockMinutes(iso: string) {
  const date = new Date(iso)
  return date.getHours() * 60 + date.getMinutes()
}

function circularDistance(a: number, b: number) {
  const difference = Math.abs(a - b) % 1440
  return Math.min(difference, 1440 - difference)
}

// Cut the clock at its largest empty gap, then calculate the median and
// Q1–Q3 along the occupied arc. A span of half a day or more has no unique
// short direction. Also require a strict majority within the existing
// ±30-minute consistency band: separated modes must not invent a midpoint.
export function buildClockPattern(values: number[]): ClockPattern | null {
  if (values.length < 3 || values.some(value => !Number.isFinite(value))) return null
  const normalize = (value: number) => ((value % 1440) + 1440) % 1440
  const sorted = values.map(normalize).sort((a, b) => a - b)
  let largestGap = -1
  let startIndex = 0
  sorted.forEach((value, index) => {
    const next = index + 1 < sorted.length ? sorted[index + 1] : sorted[0] + 1440
    if (next - value > largestGap) {
      largestGap = next - value
      startIndex = (index + 1) % sorted.length
    }
  })
  if (1440 - largestGap >= 720) return null
  const origin = sorted[startIndex]
  const unwrapped = sorted.map(value => value < origin ? value + 1440 : value)
  const middle = median(unwrapped)!
  const consistentCount = sorted.filter(value => circularDistance(value, normalize(middle)) <= 30).length
  if (consistentCount <= values.length / 2) return null
  const lowMinutes = normalize(Math.round(quantile(unwrapped, 0.25)!))
  const highMinutes = normalize(Math.round(quantile(unwrapped, 0.75)!))
  return {
    typicalMinutes: normalize(Math.round(middle)),
    lowMinutes,
    highMinutes,
    rangeCrossesMidnight: lowMinutes > highMinutes,
    sampleCount: values.length,
    consistentCount,
  }
}

// The existing bedtime clock uses noon as its wrap point. Use that same
// calendar boundary for night samples, so post-midnight resettling belongs
// to the previous evening, including on 23/25-hour DST days.
function routineNightBounds(iso: string) {
  const start = new Date(iso)
  if (!Number.isFinite(start.getTime())) return null
  if (start.getHours() < 12) start.setDate(start.getDate() - 1)
  start.setHours(12, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { key: start.getTime(), end: end.getTime() }
}

function completedRoutineNights(sessions: SleepSession[], excludedIds: Set<string>, now: number, cutoff: number) {
  const nights = new Map<number, { first: SleepSession; last: SleepSession; closesAt: number }>()
  const incomplete = new Set<number>()
  for (const session of sessions) {
    const bounds = routineNightBounds(session.startTime)
    if (!bounds) continue
    // A rejected or unfinished fragment must not leave an earlier fragment
    // masquerading as the final waking. Keep the entire sample out.
    if (!session.endTime || excludedIds.has(session.id)) {
      incomplete.add(bounds.key)
      if (session.endTime) {
        const endBounds = routineNightBounds(session.endTime)
        if (endBounds) incomplete.add(endBounds.key)
      }
      continue
    }
    const parts = splitDayNight(session, now)
    if (parts.night <= parts.day) continue
    if (Date.parse(session.endTime) > bounds.end) {
      incomplete.add(bounds.key)
      continue
    }
    const existing = nights.get(bounds.key)
    if (!existing) nights.set(bounds.key, { first: session, last: session, closesAt: bounds.end })
    else {
      if (Date.parse(session.startTime) < Date.parse(existing.first.startTime)) existing.first = session
      if (Date.parse(session.endTime) > Date.parse(existing.last.endTime!)) existing.last = session
    }
  }
  // Wait until the noon boundary: before then a recorded waking can still
  // be a pause in the current night. Filter whole groups, not fragments.
  return Array.from(nights.entries())
    .filter(([key, night]) => !incomplete.has(key) && night.closesAt <= now && Date.parse(night.last.endTime!) >= cutoff)
    .map(([, night]) => night)
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

  const recentCutoff = statisticsLookbackStart(now, lookbackDays)
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
  const sampleCount = windows.length
  // Historical evidence has its own minimum, independent of whether the
  // child is currently asleep. Consumers must not promote partial samples.
  const hasPattern = sampleCount >= MIN_WAKE_WINDOW_SAMPLES
  const typicalMs = hasPattern ? median(windows) : null
  const lowMs = hasPattern ? quantile(windows, 0.25) : null
  const highMs = hasPattern ? quantile(windows, 0.75) : null
  const status = currentMs === null ? 'unavailable' : hasPattern ? 'ready' : 'collecting'
  const breakdown = (['day-1', 'day-2', 'day-3-plus', 'night'] as const).flatMap((key) => {
    const values = samples.filter((sample) => sample.bucket === key).map((sample) => sample.durationMs)
    const middle = median(values)
    const low = quantile(values, 0.25)
    const high = quantile(values, 0.75)
    return values.length >= MIN_WAKE_WINDOW_SAMPLES && middle !== null && low !== null && high !== null ? [{ key, typicalMs: middle, lowMs: low, highMs: high, sampleCount: values.length }] : []
  })

  const routineCutoff = statisticsLookbackStart(now, lookbackDays)
  const recentCompleted = completed.filter((session) => Date.parse(session.endTime!) >= routineCutoff)
  const routineNights = completedRoutineNights(sessions, excludedIds, now, routineCutoff)
  const daytimeByDay = new Map<string, SleepSession[]>()
  recentCompleted.forEach((session) => {
    const parts = splitDayNight(session, now)
    if (parts.night <= parts.day) {
      const key = localDateKey(session.startTime)
      daytimeByDay.set(key, [...(daytimeByDay.get(key) ?? []), session])
    }
  })

  const bedtimeValues = routineNights.map((night) => clockMinutes(night.first.startTime))
  const wakeValues = routineNights.map((night) => clockMinutes(night.last.endTime!))
  const observedDays = new Set<string>([
    ...routineNights.map((night) => localDateKey(night.last.endTime!)),
    ...Array.from(daytimeByDay.keys())
  ])
  // Missing daytime entries cannot establish a true zero nap count.
  // Use recorded counts on past calendar dates with daytime entries only.
  const todayKey = localDateKey(new Date(now).toISOString())
  const napCountValues = Array.from(daytimeByDay.entries())
    .filter(([key]) => key < todayKey)
    .map(([, entries]) => entries.length)

  const countMiddle = median(napCountValues)
  const countLow = quantile(napCountValues, 0.25)
  const countHigh = quantile(napCountValues, 0.75)
  const daytimeSleepCount = napCountValues.length >= 3 && countMiddle !== null && countLow !== null && countHigh !== null ? {
    typicalCount: countMiddle,
    lowCount: countLow,
    highCount: countHigh,
    sampleCount: napCountValues.length
  } : null
  const bedtime = buildClockPattern(bedtimeValues)
  const wakeTime = buildClockPattern(wakeValues)
  const routine: RoutineInsight = {
    status: bedtime || wakeTime || daytimeSleepCount ? 'ready' : 'collecting',
    lookbackDays,
    observedDayCount: observedDays.size,
    bedtime,
    wakeTime,
    bedtimeVariable: bedtimeValues.length >= 3 && bedtime === null,
    wakeTimeVariable: wakeValues.length >= 3 && wakeTime === null,
    daytimeSleepCount
  }

  return {
    wakeWindow: {
      status,
      currentMs,
      typicalMs,
      typicalRange: lowMs !== null && highMs !== null ? { lowMs, highMs } : null,
      sampleCount,
      lookbackDays,
      sourceSessionIds: Array.from(new Set(samples.flatMap((sample) => sample.sessionIds))),
      breakdown
    },
    routine,
    quality: {
      usableSessionCount: report.usableCompletedSessionCount,
      excludedSessionCount: excludedIds.size,
      warningCount: report.issues.length
    }
  }
}
