import { describe, expect, it } from 'vitest'
import { buildInsightsFoundation } from './insights'
import type { SleepSession } from './types'

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-08-25T18:00:00.000Z')

function session(id: string, start: string, end: string | null): SleepSession {
  return {
    id,
    childId: 'child-1',
    startTime: start,
    endTime: end,
    note: '',
    dayNightOverride: null,
    createdAt: start,
    updatedAt: end ?? start
  }
}

describe('buildInsightsFoundation', () => {
  it('returns an unavailable insight without sleep data', () => {
    const result = buildInsightsFoundation([], NOW)
    expect(result.wakeWindow).toEqual({ status: 'unavailable', currentMs: null, typicalMs: null, sampleCount: 0, confidence: null })
  })

  it('keeps collecting until three clean wake windows exist', () => {
    const result = buildInsightsFoundation([
      session('a', '2026-08-24T08:00:00.000Z', '2026-08-24T09:00:00.000Z'),
      session('b', '2026-08-24T11:00:00.000Z', '2026-08-24T12:00:00.000Z')
    ], NOW)
    expect(result.wakeWindow.status).toBe('collecting')
    expect(result.wakeWindow.typicalMs).toBe(2 * HOUR)
    expect(result.wakeWindow.sampleCount).toBe(1)
  })

  it('uses the median and becomes ready after three clean windows', () => {
    const result = buildInsightsFoundation([
      session('a', '2026-08-23T06:00:00.000Z', '2026-08-23T07:00:00.000Z'),
      session('b', '2026-08-23T09:00:00.000Z', '2026-08-23T10:00:00.000Z'),
      session('c', '2026-08-23T13:00:00.000Z', '2026-08-23T14:00:00.000Z'),
      session('d', '2026-08-23T18:00:00.000Z', '2026-08-23T19:00:00.000Z')
    ], NOW)
    expect(result.wakeWindow.status).toBe('ready')
    expect(result.wakeWindow.typicalMs).toBe(3 * HOUR)
    expect(result.wakeWindow.sampleCount).toBe(3)
    expect(result.wakeWindow.confidence).toBe('low')
  })

  it('averages the two middle values for an even-sized median', () => {
    const result = buildInsightsFoundation([
      session('a', '2026-08-22T04:00:00.000Z', '2026-08-22T05:00:00.000Z'),
      session('b', '2026-08-22T06:00:00.000Z', '2026-08-22T07:00:00.000Z'),
      session('c', '2026-08-22T09:00:00.000Z', '2026-08-22T10:00:00.000Z'),
      session('d', '2026-08-22T13:00:00.000Z', '2026-08-22T14:00:00.000Z'),
      session('e', '2026-08-22T18:00:00.000Z', '2026-08-22T19:00:00.000Z')
    ], NOW)
    expect(result.wakeWindow.typicalMs).toBe(2.5 * HOUR)
    expect(result.wakeWindow.sampleCount).toBe(4)
  })

  it('does not expose a current wake window while sleep is active', () => {
    const result = buildInsightsFoundation([
      session('a', '2026-08-25T10:00:00.000Z', '2026-08-25T11:00:00.000Z'),
      session('active', '2026-08-25T16:00:00.000Z', null)
    ], NOW)
    expect(result.wakeWindow.status).toBe('unavailable')
    expect(result.wakeWindow.currentMs).toBeNull()
  })

  it('excludes overlapping entries and never bridges across them', () => {
    const result = buildInsightsFoundation([
      session('a', '2026-08-24T08:00:00.000Z', '2026-08-24T10:00:00.000Z'),
      session('overlap', '2026-08-24T09:00:00.000Z', '2026-08-24T11:00:00.000Z'),
      session('c', '2026-08-24T14:00:00.000Z', '2026-08-24T15:00:00.000Z')
    ], NOW)
    expect(result.wakeWindow.sampleCount).toBe(0)
    expect(result.quality.excludedSessionCount).toBe(2)
  })

  it('excludes an extreme session and never bridges across it', () => {
    const result = buildInsightsFoundation([
      session('a', '2026-08-22T06:00:00.000Z', '2026-08-22T07:00:00.000Z'),
      session('extreme', '2026-08-22T08:00:00.000Z', '2026-08-23T04:00:00.000Z'),
      session('c', '2026-08-23T06:00:00.000Z', '2026-08-23T07:00:00.000Z')
    ], NOW)
    expect(result.wakeWindow.sampleCount).toBe(0)
    expect(result.quality.excludedSessionCount).toBe(1)
  })
})
