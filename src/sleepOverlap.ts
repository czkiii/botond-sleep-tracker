import type { SleepSession } from './types'

type Interval = { session: SleepSession; start: number; end: number }

// Strict overlap, not adjacency. Exclude the whole connected group when two
// overlapping manual labels disagree, so an automatic/duplicate copy cannot
// silently reintroduce the same disputed sleep. Never modify the raw diary.
export function conflictingSleepGroups(intervals: Interval[]): string[][] {
  const sorted = intervals.slice().sort((a, b) => a.session.childId.localeCompare(b.session.childId) || a.start - b.start || a.end - b.end)
  const result: string[][] = []
  let group: string[] = [], child = '', end = -Infinity
  let dayEnd = -Infinity, nightEnd = -Infinity, conflict = false
  const flush = () => { if (conflict) result.push(group) }
  for (const item of sorted) {
    if (item.session.childId !== child || item.start >= end) {
      flush()
      group = []; dayEnd = nightEnd = end = -Infinity; conflict = false
      child = item.session.childId
    }
    group.push(item.session.id)
    end = Math.max(end, item.end)
    if (item.session.dayNightOverride === 'day') {
      if (nightEnd > item.start) conflict = true
      dayEnd = Math.max(dayEnd, item.end)
    } else if (item.session.dayNightOverride === 'night') {
      if (dayEnd > item.start) conflict = true
      nightEnd = Math.max(nightEnd, item.end)
    }
  }
  flush()
  return result
}
