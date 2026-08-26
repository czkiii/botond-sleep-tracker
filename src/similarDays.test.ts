import { describe, expect, it } from 'vitest'
import { buildSimilarDaysInsight } from './similarDays'
import type { SleepSession } from './types'

const NOW = Date.parse('2026-08-25T16:00:00.000Z')

function session(id: string, start: string, end: string): SleepSession {
  return { id, childId: 'child-1', startTime: start, endTime: end, note: '', dayNightOverride: null, createdAt: start, updatedAt: end }
}

describe('buildSimilarDaysInsight', () => {
  it('collects data until three comparable historical days exist', () => {
    const result = buildSimilarDaysInsight([
      session('today-night', '2026-08-24T20:00:00.000Z', '2026-08-25T06:00:00.000Z'),
      session('old-night', '2026-08-23T20:00:00.000Z', '2026-08-24T06:00:00.000Z')
    ], NOW)
    expect(result.status).toBe('collecting')
    expect(result.matches).toEqual([])
  })

  it('ranks the closest clean historical day first', () => {
    const result = buildSimilarDaysInsight([
      session('today-night', '2026-08-24T20:00:00.000Z', '2026-08-25T06:00:00.000Z'),
      session('today-nap', '2026-08-25T10:00:00.000Z', '2026-08-25T11:00:00.000Z'),
      session('d1-night', '2026-08-23T20:00:00.000Z', '2026-08-24T06:00:00.000Z'),
      session('d1-nap', '2026-08-24T10:00:00.000Z', '2026-08-24T11:00:00.000Z'),
      session('d2-night', '2026-08-22T19:00:00.000Z', '2026-08-23T05:00:00.000Z'),
      session('d2-nap', '2026-08-23T09:00:00.000Z', '2026-08-23T09:30:00.000Z'),
      session('d3-night', '2026-08-21T21:00:00.000Z', '2026-08-22T07:00:00.000Z'),
      session('d3-nap', '2026-08-22T12:00:00.000Z', '2026-08-22T13:00:00.000Z')
    ], NOW)
    expect(result.status).toBe('ready')
    expect(result.matches[0].dateKey).toBe('2026-08-24')
    expect(result.matches[0].differences.totalSleepMs).toBe(0)
    expect(result.matches[0].differences.awakeMs).toBe(0)
  })

  it('excludes an entire historical day containing a quality issue', () => {
    const result = buildSimilarDaysInsight([
      session('today-night', '2026-08-24T20:00:00.000Z', '2026-08-25T06:00:00.000Z'),
      session('bad-a', '2026-08-23T20:00:00.000Z', '2026-08-24T06:00:00.000Z'),
      session('bad-b', '2026-08-24T05:00:00.000Z', '2026-08-24T07:00:00.000Z')
    ], NOW)
    expect(result.candidateCount).toBe(0)
  })

  it('does not compare a day while sleep was active at the cutoff', () => {
    const result = buildSimilarDaysInsight([
      session('old-night', '2026-08-23T20:00:00.000Z', '2026-08-24T06:00:00.000Z'),
      session('active-at-cutoff', '2026-08-24T15:00:00.000Z', '2026-08-24T17:00:00.000Z'),
      session('today-night', '2026-08-24T20:00:00.000Z', '2026-08-25T06:00:00.000Z')
    ], NOW)
    expect(result.status).toBe('collecting')
    expect(result.candidateCount).toBe(0)
  })
})
