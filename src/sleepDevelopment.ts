import type { SleepSession } from './types'
import { EXTREME_SLEEP_DURATION_MS, FUTURE_TOLERANCE_MS, MIN_ANALYTICS_SLEEP_MS } from './utils'
import { splitSleepTime } from './sleepTime'

const MILESTONE_DURATION_MS = 45 * 60 * 1000

type SleepKind = 'day' | 'night'

type ClassifiedInterval = {
  start: number
  end: number
  kind: SleepKind
  priority: number
}

export type SleepDevelopmentMonth = {
  key: string
  year: number
  month: number
  recordedDays: number
  averageTotalMs: number
  averageDayMs: number
  averageNightMs: number
  averageLongestBlockMs: number | null
  longestBlockSampleDays: number
  averageEpisodeCount: number
}

export type SleepDevelopmentMilestone = {
  kind: 'night-longer' | 'longest-longer' | 'episodes-fewer' | 'day-shorter'
  delta: number
}

export type SleepDevelopment = {
  status: 'ready' | 'collecting'
  rangeMonths: 3 | 6 | 12
  months: SleepDevelopmentMonth[]
  first: SleepDevelopmentMonth | null
  latest: SleepDevelopmentMonth | null
  milestones: SleepDevelopmentMilestone[]
  usableSessionCount: number
}

export type SleepDaySummary = {
  key: string
  year: number
  month: number
  day: number
  totalMs: number
  dayMs: number
  nightMs: number
  // Full duration of the longest episode starting on this date; null if none starts.
  longestBlockMs: number | null
  episodeCount: number
}

function dateKey(time: number) {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function mergeIntervals(intervals: Array<{ start: number; end: number }>) {
  const sorted = intervals.slice().sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Array<{ start: number; end: number }> = []
  sorted.forEach((interval) => {
    const previous = merged[merged.length - 1]
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end)
    else merged.push({ ...interval })
  })
  return merged
}

function splitClassified(session: SleepSession, start: number, end: number) {
  return splitSleepTime(start, end, session.dayNightOverride).map((segment): ClassifiedInterval => ({
    ...segment, priority: session.dayNightOverride ? 2 : 1
  }))
}

function classifyUnion(pieces: ClassifiedInterval[]) {
  const points = Array.from(new Set(pieces.flatMap((piece) => [piece.start, piece.end]))).sort((a, b) => a - b)
  let day = 0
  let night = 0
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    const covering = pieces.filter((piece) => piece.start < end && piece.end > start)
    if (!covering.length) continue
    const highestPriority = Math.max(...covering.map((piece) => piece.priority))
    const candidates = covering.filter((piece) => piece.priority === highestPriority)
    const kind: SleepKind = candidates.some((piece) => piece.kind === 'night') ? 'night' : 'day'
    if (kind === 'day') day += end - start
    else night += end - start
  }
  return { day, night }
}

// One render snapshot can share this preparation across the chart and reports.
// Consumers must use the same sessions/now and must not mutate the result.
export function buildSleepDaySource(sessions: SleepSession[], now: number) {
  const intervals = sessions.flatMap((session) => {
    if (!session.endTime) return []
    const start = Date.parse(session.startTime)
    const end = Date.parse(session.endTime)
    const duration = end - start
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
    if (start > now + FUTURE_TOLERANCE_MS || end > now + FUTURE_TOLERANCE_MS) return []
    if (duration < MIN_ANALYTICS_SLEEP_MS || duration >= EXTREME_SLEEP_DURATION_MS) return []
    return [{ session, start, end }]
  })

  const byDay = new Map<string, ClassifiedInterval[]>()
  intervals.forEach(({ session, start, end }) => {
    splitClassified(session, start, end).forEach((piece) => {
      const key = dateKey(piece.start)
      byDay.set(key, [...(byDay.get(key) ?? []), piece])
    })
  })

  const episodeStartsByDay = new Map<string, number[]>()
  mergeIntervals(intervals.map(({ start, end }) => ({ start, end }))).forEach((episode) => {
    const key = dateKey(episode.start)
    episodeStartsByDay.set(key, [...(episodeStartsByDay.get(key) ?? []), episode.end - episode.start])
  })

  const days = Array.from(byDay.entries()).map(([key, pieces]): SleepDaySummary => {
    const [year, monthNumber, day] = key.split('-').map(Number)
    const classified = classifyUnion(pieces)
    const episodes = episodeStartsByDay.get(key) ?? []
    return {
      key,
      year,
      month: monthNumber - 1,
      day,
      totalMs: classified.day + classified.night,
      dayMs: classified.day,
      nightMs: classified.night,
      longestBlockMs: episodes.length ? Math.max(...episodes) : null,
      episodeCount: episodes.length
    }
  }).sort((left, right) => left.key.localeCompare(right.key))

  return { days, usableSessionCount: intervals.length }
}

export function buildSleepDaySummaries(sessions: SleepSession[], now = Date.now()) {
  return buildSleepDaySource(sessions, now).days
}

// Totals use every recorded date; daily maxima use only dates with episode starts.
// Full episode duration belongs to its local start date, even across months.
export function summarizeSleepMonths(days: SleepDaySummary[]): SleepDevelopmentMonth[] {
  const monthTotals = new Map<string, {
    year: number
    month: number
    recordedDays: number
    total: number
    day: number
    night: number
    longest: number
    longestDays: number
    episodes: number
  }>()

  days.forEach((day) => {
    const keyMonth = monthKey(day.year, day.month)
    const previous = monthTotals.get(keyMonth) ?? { year: day.year, month: day.month, recordedDays: 0, total: 0, day: 0, night: 0, longest: 0, longestDays: 0, episodes: 0 }
    previous.recordedDays += 1
    previous.total += day.totalMs
    previous.day += day.dayMs
    previous.night += day.nightMs
    previous.episodes += day.episodeCount
    if (day.longestBlockMs !== null) {
      previous.longest += day.longestBlockMs
      previous.longestDays += 1
    }
    monthTotals.set(keyMonth, previous)
  })

  return Array.from(monthTotals.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]): SleepDevelopmentMonth => ({
      key: monthKey(value.year, value.month),
      year: value.year,
      month: value.month,
      recordedDays: value.recordedDays,
      averageTotalMs: value.total / value.recordedDays,
      averageDayMs: value.day / value.recordedDays,
      averageNightMs: value.night / value.recordedDays,
      averageLongestBlockMs: value.longestDays ? value.longest / value.longestDays : null,
      longestBlockSampleDays: value.longestDays,
      averageEpisodeCount: value.episodes / value.recordedDays
    }))
}

export function buildSleepDevelopment(sessions: SleepSession[], now = Date.now(), rangeMonths: 3 | 6 | 12 = 12, customRange?: { startMonth: string; endMonth: string }, source = buildSleepDaySource(sessions, now)): SleepDevelopment {
  const current = new Date(now)
  const firstIncludedMonth = new Date(current.getFullYear(), current.getMonth() - rangeMonths + 1, 1)
  const months = summarizeSleepMonths(source.days).filter(value => {
    const inRange = customRange ? value.key >= customRange.startMonth && value.key <= customRange.endMonth : new Date(value.year, value.month, 1) >= firstIncludedMonth
    return inRange && value.recordedDays >= 3
  })

  const first = months[0] ?? null
  const latest = months[months.length - 1] ?? null
  const milestones: SleepDevelopmentMilestone[] = []
  if (first && latest && first !== latest) {
    const nightDelta = latest.averageNightMs - first.averageNightMs
    const longestDelta = latest.averageLongestBlockMs !== null && first.averageLongestBlockMs !== null
      ? latest.averageLongestBlockMs - first.averageLongestBlockMs : null
    const episodeDelta = latest.averageEpisodeCount - first.averageEpisodeCount
    const dayDelta = latest.averageDayMs - first.averageDayMs
    if (nightDelta >= MILESTONE_DURATION_MS) milestones.push({ kind: 'night-longer', delta: nightDelta })
    if (longestDelta !== null && longestDelta >= MILESTONE_DURATION_MS) milestones.push({ kind: 'longest-longer', delta: longestDelta })
    if (episodeDelta <= -0.75) milestones.push({ kind: 'episodes-fewer', delta: episodeDelta })
    if (dayDelta <= -MILESTONE_DURATION_MS) milestones.push({ kind: 'day-shorter', delta: dayDelta })
  }

  return {
    status: months.length >= 2 ? 'ready' : 'collecting',
    rangeMonths,
    months,
    first,
    latest,
    milestones,
    usableSessionCount: source.usableSessionCount
  }
}
