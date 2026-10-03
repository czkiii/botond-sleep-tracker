import type { SleepSession } from './types'
import { splitDayNight } from './utils'

// The existing bedtime clock uses noon as its wrap point. Use that same
// calendar boundary for night samples, so post-midnight resettling belongs
// to the previous evening, including on 23/25-hour DST days.
export function routineNightBounds(iso: string) {
  const start = new Date(iso)
  if (!Number.isFinite(start.getTime())) return null
  if (start.getHours() < 12) start.setDate(start.getDate() - 1)
  start.setHours(12, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { key: start.getTime(), end: end.getTime() }
}

export function buildNightGroups(sessions: SleepSession[], excludedIds: Set<string>, now: number) {
  const nights = new Map<number, { first: SleepSession; last: SleepSession; closesAt: number; sessions: SleepSession[] }>()
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
    if (!existing) nights.set(bounds.key, { first: session, last: session, closesAt: bounds.end, sessions: [session] })
    else {
      existing.sessions.push(session)
      if (Date.parse(session.startTime) < Date.parse(existing.first.startTime)) existing.first = session
      if (Date.parse(session.endTime) > Date.parse(existing.last.endTime!)) existing.last = session
    }
  }
  return { nights, incomplete }
}

export type WakeBucket = 'day-1' | 'day-2' | 'day-3-plus' | 'night' | 'night-resettling'

export function buildSleepBuckets(sessions: SleepSession[], excluded: Set<string>, now: number, groups = buildNightGroups(sessions, excluded, now)) {
  const buckets = new Map<string, WakeBucket>()
  const daytime = new Map<string, SleepSession[]>()
  for (const session of sessions) {
    if (!session.endTime || excluded.has(session.id)) continue
    const parts = splitDayNight(session, now)
    if (parts.day <= parts.night) continue
    const date = new Date(session.startTime)
    const key = date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate()
    daytime.set(key, [...(daytime.get(key) ?? []), session])
  }
  for (const entries of daytime.values()) entries.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)).forEach((item, index) => {
    buckets.set(item.id, index === 0 ? 'day-1' : index === 1 ? 'day-2' : 'day-3-plus')
  })
  for (const [key, night] of groups.nights) {
    if (groups.incomplete.has(key)) continue
    for (const session of night.sessions) buckets.set(session.id, session.id === night.first.id ? 'night' : 'night-resettling')
  }
  return buckets
}
