import type { Locale } from './i18n'
import { localeTag } from './i18n'
import type { SleepSession } from './types'

export const msToParts = (ms: number) => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return { hours, minutes }
}

export const formatDuration = (ms: number, locale: Locale = 'hu') => {
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
  return sessions.filter(s => isSameLocalDay(s.startTime, date) || (s.endTime && isSameLocalDay(s.endTime, date)))
}

export function totalToday(sessions: SleepSession[], now = new Date()) {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  return sessions.reduce((sum, session) => {
    const start = new Date(session.startTime).getTime()
    const end = session.endTime ? new Date(session.endTime).getTime() : now.getTime()
    const overlap = Math.max(0, Math.min(end, endOfDay) - Math.max(start, startOfDay))
    return sum + overlap
  }, 0)
}

export function awakeSince(sessions: SleepSession[], now = Date.now()) {
  const completed = sessions.filter(s => s.endTime).sort((a, b) => new Date(b.endTime!).getTime() - new Date(a.endTime!).getTime())
  if (!completed.length) return 0
  return Math.max(0, now - new Date(completed[0].endTime!).getTime())
}

export function splitDayNight(session: SleepSession, now = Date.now()) {
  const start = new Date(session.startTime).getTime()
  const end = session.endTime ? new Date(session.endTime).getTime() : now
  let day = 0, night = 0
  for (let t = start; t < end; t += 60000) {
    const d = new Date(t)
    const mins = d.getHours() * 60 + d.getMinutes()
    const bucket = Math.min(60000, end - t)
    if (mins >= 360 && mins < 1140) day += bucket
    else night += bucket
  }
  return { day, night }
}
