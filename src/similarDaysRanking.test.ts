import { describe, expect, it } from 'vitest'
import { buildSimilarDaysInsight } from './similarDays'
import type { SleepSession } from './types'

const HOUR = 3600000
const at = (offset: number, hour: number) => new Date(2026, 8, 30 - offset, hour).getTime()
const now = at(0, 12)
function sleep(id: string, offset: number, from: number, to: number): SleepSession {
  const startTime = new Date(at(offset, from)).toISOString(), endTime = new Date(at(offset, to)).toISOString()
  return { id, childId: 'a', startTime, endTime, note: '', dayNightOverride: null, createdAt: startTime, updatedAt: endTime }
}
const today = sleep('today', 0, 8, 9)

describe('closest available days, not a similarity guarantee', () => {
  it('retains the audit example with ten-hour differences explicitly quantified', () => {
    const data = [today, ...[1, 2, 3].map(day => sleep(`far-${day}`, day, 0, 11))]
    const original = JSON.stringify(data)
    const result = buildSimilarDaysInsight(data, now)
    expect(result.status).toBe('ready')
    expect(result.current).toMatchObject({ totalSleepMs: HOUR, awakeMs: 3 * HOUR, daytimeSleepCount: 1 })
    expect(result.matches).toHaveLength(3)
    for (const match of result.matches) {
      expect(match.snapshot).toMatchObject({ totalSleepMs: 11 * HOUR, awakeMs: HOUR, daytimeSleepCount: 0 })
      expect(match.differences).toEqual({ totalSleepMs: 10 * HOUR, awakeMs: 2 * HOUR, daytimeSleepCount: 1 })
    }
    expect(JSON.stringify(data)).toBe(original)
  })

  it('ranks an older exact match ahead of recent distant days regardless of the insights range', () => {
    const data = [today, ...[1, 2, 3].map(day => sleep(`far-${day}`, day, 0, 11)), sleep('older-exact', 100, 8, 9)]
    const results = ([7, 14, 30] as const).map(range => buildSimilarDaysInsight(data, now, range))
    for (const result of results) {
      expect(result.candidateCount).toBe(4)
      expect(result.matches).toHaveLength(3)
      expect(result.matches[0].snapshot.sourceSessionIds).toEqual(['older-exact'])
      expect(result.matches[0].differences).toEqual({ totalSleepMs: 0, awakeMs: 0, daytimeSleepCount: 0 })
      expect(result.matches[1].differences.totalSleepMs).toBe(10 * HOUR)
      expect(result.matches).toEqual(results[0].matches)
    }
  })

  it('includes the 730th prior calendar day but does not promise unlimited history', () => {
    const result = buildSimilarDaysInsight([today, ...[1, 2, 730, 731].map(day => sleep(`day-${day}`, day, 8, 9))], now)
    expect(result.candidateCount).toBe(3)
    expect(result.matches.flatMap(match => match.snapshot.sourceSessionIds)).toEqual(['day-1', 'day-2', 'day-730'])
  })
})
