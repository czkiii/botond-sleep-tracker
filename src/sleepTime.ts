import type { DayNightOverride } from './types'

export const DEFAULT_DAY_START_MINUTES = 6 * 60
export const DEFAULT_NIGHT_START_MINUTES = 19 * 60

export type SleepTimeSegment = { start: number; end: number; kind: 'day' | 'night' }

// Shared half-open union for diary totals and analytical daily totals.
// Callers choose the eligible records; overlapping time is counted once.
export function mergeSleepIntervals(intervals: Array<{ start: number; end: number }>) {
  const sorted = intervals.filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .slice().sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Array<{ start: number; end: number }> = []
  for (const interval of sorted) {
    const previous = merged[merged.length - 1]
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end)
    else merged.push({ ...interval })
  }
  return merged
}

function nextLocalBoundary(time: number, minutes: number) {
  const date = new Date(time)
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  if (date.getTime() <= time) date.setDate(date.getDate() + 1)
  // At the maximum representable date there is no following calendar day.
  return Number.isFinite(date.getTime()) ? date.getTime() : Infinity
}

// Half-open [start, end) segments in the device's local calendar. Advance by
// midnight / 06:00 / 19:00, never by 24 elapsed hours or rounded minute buckets.
// Subtract timestamps so DST nights retain their actual elapsed duration.
export function splitSleepTime(start: number, end: number, override: DayNightOverride = null): SleepTimeSegment[] {
  if (!Number.isFinite(new Date(start).getTime()) || !Number.isFinite(new Date(end).getTime()) || end <= start) return []
  const result: SleepTimeSegment[] = []
  let cursor = start
  while (cursor < end) {
    const date = new Date(cursor)
    const minutes = date.getHours() * 60 + date.getMinutes()
    const kind = override ?? (minutes >= DEFAULT_DAY_START_MINUTES && minutes < DEFAULT_NIGHT_START_MINUTES ? 'day' : 'night')
    const segmentEnd = Math.min(end, nextLocalBoundary(cursor, 0),
      nextLocalBoundary(cursor, DEFAULT_DAY_START_MINUTES), nextLocalBoundary(cursor, DEFAULT_NIGHT_START_MINUTES))
    result.push({ start: cursor, end: segmentEnd, kind })
    cursor = segmentEnd
  }
  return result
}
