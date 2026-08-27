import type { SleepSession } from './types'
import { DEFAULT_DAY_START_MINUTES, DEFAULT_NIGHT_START_MINUTES, EXTREME_SLEEP_DURATION_MS, FUTURE_TOLERANCE_MS, MIN_ANALYTICS_SLEEP_MS } from './utils'

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
  averageLongestBlockMs: number
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

function dateKey(time: number) {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function nextLocalBoundary(time: number, minutes: number) {
  const date = new Date(time)
  const candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60).getTime()
  if (candidate > time) return candidate
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, Math.floor(minutes / 60), minutes % 60).getTime()
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
  const result: ClassifiedInterval[] = []
  let cursor = start
  while (cursor < end) {
    const nextMidnight = nextLocalBoundary(cursor, 0)
    const nextDayStart = nextLocalBoundary(cursor, DEFAULT_DAY_START_MINUTES)
    const nextNightStart = nextLocalBoundary(cursor, DEFAULT_NIGHT_START_MINUTES)
    const segmentEnd = Math.min(end, nextMidnight, nextDayStart, nextNightStart)
    const date = new Date(cursor)
    const minutes = date.getHours() * 60 + date.getMinutes()
    const automaticKind: SleepKind = minutes >= DEFAULT_DAY_START_MINUTES && minutes < DEFAULT_NIGHT_START_MINUTES ? 'day' : 'night'
    result.push({
      start: cursor,
      end: segmentEnd,
      kind: session.dayNightOverride ?? automaticKind,
      priority: session.dayNightOverride ? 2 : 1
    })
    cursor = segmentEnd
  }
  return result
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

export function buildSleepDevelopment(sessions: SleepSession[], now = Date.now(), rangeMonths: 3 | 6 | 12 = 12): SleepDevelopment {
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

  byDay.forEach((pieces, key) => {
    const [year, monthNumber] = key.split('-').map(Number)
    const keyMonth = monthKey(year, monthNumber - 1)
    const classified = classifyUnion(pieces)
    const episodes = episodeStartsByDay.get(key) ?? []
    const previous = monthTotals.get(keyMonth) ?? { year, month: monthNumber - 1, recordedDays: 0, total: 0, day: 0, night: 0, longest: 0, longestDays: 0, episodes: 0 }
    previous.recordedDays += 1
    previous.total += classified.day + classified.night
    previous.day += classified.day
    previous.night += classified.night
    previous.episodes += episodes.length
    if (episodes.length) {
      previous.longest += Math.max(...episodes)
      previous.longestDays += 1
    }
    monthTotals.set(keyMonth, previous)
  })

  const current = new Date(now)
  const firstIncludedMonth = new Date(current.getFullYear(), current.getMonth() - rangeMonths + 1, 1)
  const months = Array.from(monthTotals.entries())
    .filter(([, value]) => new Date(value.year, value.month, 1) >= firstIncludedMonth && value.recordedDays >= 3)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]): SleepDevelopmentMonth => ({
      key: monthKey(value.year, value.month),
      year: value.year,
      month: value.month,
      recordedDays: value.recordedDays,
      averageTotalMs: value.total / value.recordedDays,
      averageDayMs: value.day / value.recordedDays,
      averageNightMs: value.night / value.recordedDays,
      averageLongestBlockMs: value.longestDays ? value.longest / value.longestDays : 0,
      averageEpisodeCount: value.episodes / value.recordedDays
    }))

  const first = months[0] ?? null
  const latest = months[months.length - 1] ?? null
  const milestones: SleepDevelopmentMilestone[] = []
  if (first && latest && first !== latest) {
    const nightDelta = latest.averageNightMs - first.averageNightMs
    const longestDelta = latest.averageLongestBlockMs - first.averageLongestBlockMs
    const episodeDelta = latest.averageEpisodeCount - first.averageEpisodeCount
    const dayDelta = latest.averageDayMs - first.averageDayMs
    if (nightDelta >= MILESTONE_DURATION_MS) milestones.push({ kind: 'night-longer', delta: nightDelta })
    if (longestDelta >= MILESTONE_DURATION_MS) milestones.push({ kind: 'longest-longer', delta: longestDelta })
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
    usableSessionCount: intervals.length
  }
}
