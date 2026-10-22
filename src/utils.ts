import type { Locale } from './i18n'
import { localeTag } from './i18n'
import type { SleepSession } from './types'
import { mergeSleepIntervals, splitSleepTime } from './sleepTime'
import { conflictingSleepGroups } from './sleepOverlap'
export { DEFAULT_DAY_START_MINUTES, DEFAULT_NIGHT_START_MINUTES } from './sleepTime'

export const LONG_SLEEP_GUARDRAIL_MS = 12 * 60 * 60 * 1000
export const EXTREME_SLEEP_DURATION_MS = 18 * 60 * 60 * 1000
export const MIN_ANALYTICS_SLEEP_MS = 2 * 60 * 1000
export const DUPLICATE_TOLERANCE_MS = 2 * 60 * 1000
export const FUTURE_TOLERANCE_MS = 60 * 1000

export type DataQualityIssueKind = 'invalid-time' | 'future-time' | 'suspiciously-short' | 'stale-active' | 'extreme-duration' | 'possible-duplicate' | 'overlap' | 'classification-conflict'

export type DataQualityIssue = {
  kind: DataQualityIssueKind
  severity: 'warning' | 'error'
  sessionIds: string[]
  excludesFromInsights: boolean
}

export type DataQualityReport = {
  issues: DataQualityIssue[]
  excludedSessionIds: string[]
  usableCompletedSessionCount: number
}

export const msToParts = (ms: number) => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return { hours, minutes }
}

export const formatDuration = (ms: number, locale: Locale = 'hu') => {
  if (ms > 0 && ms < 60000) return locale === 'hu' ? '<1 p' : locale === 'de' ? '<1 Min.' : '<1 min'
  const { hours, minutes } = msToParts(ms)
  if (locale === 'de') {
    if (!hours) return `${minutes} Min.`
    return `${hours} Std. ${minutes} Min.`
  }
  if (locale === 'en') {
    if (!hours) return `${minutes} min`
    return `${hours} hr ${minutes} min`
  }
  if (!hours) return `${minutes} p`
  return `${hours} ó ${minutes} p`
}

export const formatTimer = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

export const formatTime = (iso: string, locale: Locale = 'hu') => new Intl.DateTimeFormat(localeTag(locale), {
  hour: '2-digit', minute: '2-digit'
}).format(new Date(iso))

export const formatDateHeader = (date = new Date(), locale: Locale = 'hu') => new Intl.DateTimeFormat(localeTag(locale), {
  month: 'short', day: 'numeric', weekday: 'long'
}).format(date)

export function durationOf(session: SleepSession, now = Date.now()) {
  const start = new Date(session.startTime).getTime()
  const end = session.endTime ? new Date(session.endTime).getTime() : now
  return Math.max(0, end - start)
}

export function isSameLocalDay(iso: string, date = new Date()) {
  const d = new Date(iso)
  return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate()
}

export function todaySessions(sessions: SleepSession[], date = new Date()) {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
  return sessions.filter(session => {
    const start = Date.parse(session.startTime), end = session.endTime ? Date.parse(session.endTime) : date.getTime()
    return isSameLocalDay(session.startTime, date) || (start < endOfDay && end > startOfDay && end > start)
  })
}

export function totalToday(sessions: SleepSession[], now = new Date()) {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  const intervals = sessions.flatMap(session => {
    const start = new Date(session.startTime).getTime()
    const end = session.endTime ? new Date(session.endTime).getTime() : now.getTime()
    if (start > now.getTime() + FUTURE_TOLERANCE_MS || end > now.getTime() + FUTURE_TOLERANCE_MS) return []
    return [{ start: Math.max(start, startOfDay), end: Math.min(end, endOfDay) }]
  })
  return mergeSleepIntervals(intervals).reduce((sum, interval) => sum + interval.end - interval.start, 0)
}

export function awakeSince(sessions: SleepSession[], now = Date.now()) {
  const completed = sessions.filter(s => s.endTime).sort((a, b) => new Date(b.endTime!).getTime() - new Date(a.endTime!).getTime())
  if (!completed.length) return 0
  return Math.max(0, now - new Date(completed[0].endTime!).getTime())
}

export function splitDayNight(session: SleepSession, now = Date.now()) {
  const start = new Date(session.startTime).getTime()
  const end = session.endTime ? new Date(session.endTime).getTime() : now
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { day: 0, night: 0 }
  const duration = end - start
  if (session.dayNightOverride === 'day') return { day: duration, night: 0 }
  if (session.dayNightOverride === 'night') return { day: 0, night: duration }
  let day = 0, night = 0
  for (const segment of splitSleepTime(start, end)) {
    if (segment.kind === 'day') day += segment.end - segment.start
    else night += segment.end - segment.start
  }
  return { day, night }
}

export function getDataQualityReport(sessions: SleepSession[], now = Date.now()): DataQualityReport {
  const issues: DataQualityIssue[] = []
  const validIntervals: Array<{ session: SleepSession; start: number; end: number }> = []

  for (const session of sessions) {
    const start = Date.parse(session.startTime)
    const end = session.endTime ? Date.parse(session.endTime) : now
    // A new active record can precede the display clock's next second tick.
    // Zero elapsed time is valid; genuinely future starts still get a warning.
    if (!session.endTime && Number.isFinite(start) && start >= now && start <= now + FUTURE_TOLERANCE_MS) continue
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      issues.push({ kind: 'invalid-time', severity: 'error', sessionIds: [session.id], excludesFromInsights: true })
      continue
    }
    if (start > now + FUTURE_TOLERANCE_MS || (session.endTime && end > now + FUTURE_TOLERANCE_MS)) {
      issues.push({ kind: 'future-time', severity: 'error', sessionIds: [session.id], excludesFromInsights: true })
      continue
    }

    const duration = end - start
    if (!session.endTime && duration >= LONG_SLEEP_GUARDRAIL_MS) {
      issues.push({ kind: 'stale-active', severity: 'warning', sessionIds: [session.id], excludesFromInsights: true })
    } else if (session.endTime && duration < MIN_ANALYTICS_SLEEP_MS) {
      issues.push({ kind: 'suspiciously-short', severity: 'warning', sessionIds: [session.id], excludesFromInsights: true })
    } else if (duration >= EXTREME_SLEEP_DURATION_MS) {
      issues.push({ kind: 'extreme-duration', severity: 'warning', sessionIds: [session.id], excludesFromInsights: true })
    }
    validIntervals.push({ session, start, end })
  }

  const sorted = validIntervals.sort((a, b) => a.start - b.start)
  for (let index = 0; index < sorted.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1) {
      const current = sorted[index]
      const next = sorted[nextIndex]
      if (next.start >= current.end) break
      if (current.session.childId !== next.session.childId) continue
      const sameEndState = Boolean(current.session.endTime) === Boolean(next.session.endTime)
      const nearSameTimes = Math.abs(current.start - next.start) <= DUPLICATE_TOLERANCE_MS && Math.abs(current.end - next.end) <= DUPLICATE_TOLERANCE_MS
      issues.push({
        kind: sameEndState && nearSameTimes ? 'possible-duplicate' : 'overlap',
        severity: 'error',
        sessionIds: [current.session.id, next.session.id],
        excludesFromInsights: true
      })
    }
  }

  for (const sessionIds of conflictingSleepGroups(validIntervals)) {
    issues.push({ kind: 'classification-conflict', severity: 'error', sessionIds, excludesFromInsights: true })
  }
  const excluded = new Set(issues.filter((issue) => issue.excludesFromInsights).flatMap((issue) => issue.sessionIds))
  return {
    issues,
    excludedSessionIds: Array.from(excluded),
    usableCompletedSessionCount: sessions.filter((session) => session.endTime && !excluded.has(session.id)).length
  }
}

export function getDataQualityWarnings(sessions: SleepSession[], now = Date.now()) {
  return getDataQualityReport(sessions, now).issues
}
