import type { SleepSession } from './types'
import { getDataQualityReport, splitDayNight } from './utils'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MAX_HISTORY_DAYS = 730

export type DaySnapshot = {
  dateKey: string
  daytimeSleepCount: number
  totalSleepMs: number
  awakeMs: number | null
  sourceSessionIds: string[]
}

export type SimilarDayMatch = {
  dateKey: string
  snapshot: DaySnapshot
  differences: {
    daytimeSleepCount: number
    totalSleepMs: number
    awakeMs: number
  }
  nextSleep: { startTime: string; durationMs: number; sessionId: string } | null
}

export type SimilarDaysInsight = {
  status: 'ready' | 'collecting' | 'unavailable'
  lookbackDays: 7 | 14 | 30
  current: DaySnapshot | null
  candidateCount: number
  matches: SimilarDayMatch[]
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function cutoffForDay(date: Date, reference: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), reference.getHours(), reference.getMinutes(), reference.getSeconds(), reference.getMilliseconds()).getTime()
}

function overlapsDay(session: SleepSession, dayStart: number, dayEnd: number, now: number) {
  const start = Date.parse(session.startTime)
  const end = session.endTime ? Date.parse(session.endTime) : now
  return start < dayEnd && end > dayStart
}

function snapshotForDay(sessions: SleepSession[], date: Date, reference: Date, now: number): DaySnapshot | null {
  const dayStart = startOfLocalDay(date)
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
  const cutoff = Math.min(cutoffForDay(date, reference), dayEnd)
  const relevant = sessions.filter((session) => overlapsDay(session, dayStart, cutoff, now))
  if (!relevant.length) return null

  let totalSleepMs = 0
  const sourceSessionIds: string[] = []
  relevant.forEach((session) => {
    const start = Date.parse(session.startTime)
    const end = session.endTime ? Date.parse(session.endTime) : now
    const overlap = Math.max(0, Math.min(end, cutoff) - Math.max(start, dayStart))
    if (overlap > 0) {
      totalSleepMs += overlap
      sourceSessionIds.push(session.id)
    }
  })

  const daytimeSleepCount = sessions.filter((session) => {
    const start = Date.parse(session.startTime)
    if (start < dayStart || start >= cutoff) return false
    const parts = splitDayNight(session, now)
    return parts.day > parts.night
  }).length
  const sleepingAtCutoff = sessions.some((session) => {
    const start = Date.parse(session.startTime)
    const end = session.endTime ? Date.parse(session.endTime) : now
    return start <= cutoff && end > cutoff
  })
  const lastWake = sessions
    .filter((session) => {
      if (!session.endTime) return false
      const end = Date.parse(session.endTime)
      return end >= dayStart && end <= cutoff
    })
    .sort((a, b) => Date.parse(b.endTime!) - Date.parse(a.endTime!))[0]
  const awakeMs = sleepingAtCutoff || !lastWake ? null : Math.max(0, cutoff - Date.parse(lastWake.endTime!))
  return { dateKey: dateKey(date), daytimeSleepCount, totalSleepMs, awakeMs, sourceSessionIds }
}

export function buildSimilarDaysInsight(sessions: SleepSession[], now = Date.now(), lookbackDays: 7 | 14 | 30 = 14): SimilarDaysInsight {
  const reference = new Date(now)
  const report = getDataQualityReport(sessions, now)
  const excluded = new Set(report.excludedSessionIds)
  const clean = sessions.filter((session) => !excluded.has(session.id))
  const currentDayStart = startOfLocalDay(reference)
  const currentDayEnd = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1).getTime()
  const currentHasIssue = sessions.some((session) => excluded.has(session.id) && overlapsDay(session, currentDayStart, currentDayEnd, now))
  const current = currentHasIssue ? null : snapshotForDay(clean, reference, reference, now)
  if (!current || current.awakeMs === null) return { status: 'unavailable', lookbackDays, current, candidateCount: 0, matches: [] }

  const candidates: Array<{ snapshot: DaySnapshot; distance: number; nextSleep: SimilarDayMatch['nextSleep'] }> = []
  const earliestStart = clean.reduce((earliest, session) => Math.min(earliest, Date.parse(session.startTime)), now)
  const availableHistoryDays = Math.max(1, Math.ceil((currentDayStart - startOfLocalDay(new Date(earliestStart))) / DAY_MS))
  const searchDays = Math.min(MAX_HISTORY_DAYS, availableHistoryDays)
  for (let offset = 1; offset <= searchDays; offset += 1) {
    const date = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - offset)
    const dayStart = startOfLocalDay(date)
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
    if (sessions.some((session) => excluded.has(session.id) && overlapsDay(session, dayStart, dayEnd, now))) continue
    const snapshot = snapshotForDay(clean, date, reference, now)
    if (!snapshot || snapshot.awakeMs === null) continue
    const cutoff = cutoffForDay(date, reference)
    const next = clean
      .filter((session) => Date.parse(session.startTime) >= cutoff && Date.parse(session.startTime) < dayEnd)
      .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))[0]
    const nextSleep = next ? {
      startTime: next.startTime,
      durationMs: Math.max(0, (next.endTime ? Date.parse(next.endTime) : dayEnd) - Date.parse(next.startTime)),
      sessionId: next.id
    } : null
    const differences = {
      daytimeSleepCount: Math.abs(snapshot.daytimeSleepCount - current.daytimeSleepCount),
      totalSleepMs: Math.abs(snapshot.totalSleepMs - current.totalSleepMs),
      awakeMs: Math.abs(snapshot.awakeMs - current.awakeMs)
    }
    const distance = differences.daytimeSleepCount * 2 + differences.totalSleepMs / (2 * HOUR_MS) + differences.awakeMs / HOUR_MS
    candidates.push({ snapshot, distance, nextSleep })
  }

  const matches = candidates.sort((a, b) => a.distance - b.distance).slice(0, 3).map(({ snapshot, nextSleep }) => ({
    dateKey: snapshot.dateKey,
    snapshot,
    differences: {
      daytimeSleepCount: Math.abs(snapshot.daytimeSleepCount - current.daytimeSleepCount),
      totalSleepMs: Math.abs(snapshot.totalSleepMs - current.totalSleepMs),
      awakeMs: Math.abs(snapshot.awakeMs! - current.awakeMs!)
    },
    nextSleep
  }))
  return { status: candidates.length >= 3 ? 'ready' : 'collecting', lookbackDays, current, candidateCount: candidates.length, matches: candidates.length >= 3 ? matches : [] }
}
