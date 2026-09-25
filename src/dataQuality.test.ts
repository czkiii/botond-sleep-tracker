import { describe, expect, it } from 'vitest'
import { getDataQualityReport } from './utils'
import type { SleepSession } from './types'

const NOW = Date.parse('2026-08-25T18:00:00.000Z')

function session(id: string, start: string, end: string | null): SleepSession {
  return { id, childId: 'child-1', startTime: start, endTime: end, note: '', dayNightOverride: null, createdAt: start, updatedAt: end ?? start }
}

describe('getDataQualityReport', () => {
  it('accepts ordinary completed sessions', () => {
    const report = getDataQualityReport([session('a', '2026-08-25T10:00:00.000Z', '2026-08-25T11:00:00.000Z')], NOW)
    expect(report.issues).toEqual([])
    expect(report.usableCompletedSessionCount).toBe(1)
  })

  it('rejects invalid time ranges', () => {
    const report = getDataQualityReport([session('a', '2026-08-25T11:00:00.000Z', '2026-08-25T10:00:00.000Z')], NOW)
    expect(report.issues[0].kind).toBe('invalid-time')
  })

  it('rejects future sessions outside the tolerance', () => {
    const report = getDataQualityReport([session('a', '2026-08-25T19:00:00.000Z', '2026-08-25T20:00:00.000Z')], NOW)
    expect(report.issues[0].kind).toBe('future-time')
  })

  it('flags completed sleeps shorter than two minutes', () => {
    const report = getDataQualityReport([session('a', '2026-08-25T10:00:00.000Z', '2026-08-25T10:01:00.000Z')], NOW)
    expect(report.issues[0].kind).toBe('suspiciously-short')
  })

  it('flags active sleeps running for twelve hours', () => {
    const report = getDataQualityReport([session('a', '2026-08-25T05:00:00.000Z', null)], NOW)
    expect(report.issues[0].kind).toBe('stale-active')
  })

  it('distinguishes probable duplicates from general overlaps', () => {
    const duplicate = getDataQualityReport([
      session('a', '2026-08-25T10:00:00.000Z', '2026-08-25T11:00:00.000Z'),
      session('b', '2026-08-25T10:01:00.000Z', '2026-08-25T11:01:00.000Z')
    ], NOW)
    expect(duplicate.issues[duplicate.issues.length - 1]?.kind).toBe('possible-duplicate')

    const overlap = getDataQualityReport([
      session('a', '2026-08-25T10:00:00.000Z', '2026-08-25T12:00:00.000Z'),
      session('b', '2026-08-25T11:00:00.000Z', '2026-08-25T13:00:00.000Z')
    ], NOW)
    expect(overlap.issues[overlap.issues.length - 1]?.kind).toBe('overlap')
  })

  it('returns unique excluded IDs even when one session has multiple issues', () => {
    const report = getDataQualityReport([
      session('a', '2026-08-24T10:00:00.000Z', '2026-08-25T05:00:00.000Z'),
      session('b', '2026-08-25T04:00:00.000Z', '2026-08-25T06:00:00.000Z')
    ], NOW)
    expect(report.excludedSessionIds.sort()).toEqual(['a', 'b'])
    expect(report.usableCompletedSessionCount).toBe(0)
  })
})
