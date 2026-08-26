import { describe, expect, it } from 'vitest'
import demoBackup from '../test-data/solemi-demo-v4-2026-08-26.json'
import { buildPredictionLite } from './prediction'
import type { SleepSession } from './types'

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-08-25T09:00:00.000Z')

function session(id: string, start: string, end: string | null): SleepSession {
  return { id, childId: 'child-1', startTime: start, endTime: end, note: '', dayNightOverride: null, createdAt: start, updatedAt: end ?? start }
}

describe('buildPredictionLite', () => {
  it('does not predict without a current wake time', () => {
    expect(buildPredictionLite([], NOW).status).toBe('unavailable')
  })

  it('collects at least three matching sleep-order samples', () => {
    const result = buildPredictionLite([
      session('night-a', '2026-08-23T20:00:00.000Z', '2026-08-24T06:00:00.000Z'),
      session('nap-a', '2026-08-24T08:00:00.000Z', '2026-08-24T09:00:00.000Z'),
      session('night-b', '2026-08-24T20:00:00.000Z', '2026-08-25T06:00:00.000Z')
    ], NOW)
    expect(result).toMatchObject({ status: 'collecting', bucket: 'day-1', sampleCount: 1, currentWakeMs: 3 * HOUR })
  })

  it('returns a deterministic range instead of a point-only prediction', () => {
    const result = buildPredictionLite([
      session('night-a', '2026-08-20T20:00:00.000Z', '2026-08-21T06:00:00.000Z'),
      session('nap-a', '2026-08-21T08:00:00.000Z', '2026-08-21T09:00:00.000Z'),
      session('night-b', '2026-08-21T20:00:00.000Z', '2026-08-22T06:00:00.000Z'),
      session('nap-b', '2026-08-22T09:00:00.000Z', '2026-08-22T10:00:00.000Z'),
      session('night-c', '2026-08-22T20:00:00.000Z', '2026-08-23T06:00:00.000Z'),
      session('nap-c', '2026-08-23T10:00:00.000Z', '2026-08-23T11:00:00.000Z'),
      session('today-night', '2026-08-24T20:00:00.000Z', '2026-08-25T06:00:00.000Z')
    ], NOW)
    expect(result.status).toBe('ready')
    expect(result.sampleCount).toBe(3)
    expect(result.typicalTime).toBe(Date.parse('2026-08-25T09:00:00.000Z'))
    expect(result.windowStart).toBe(Date.parse('2026-08-25T08:30:00.000Z'))
    expect(result.windowEnd).toBe(Date.parse('2026-08-25T09:30:00.000Z'))
    expect(result.windowState).toBe('likely-now')
    expect(result.confidence).toBe('low')
  })

  it('marks a learned window as passed instead of moving it forward', () => {
    const result = buildPredictionLite([
      session('night-a', '2026-08-20T20:00:00.000Z', '2026-08-21T06:00:00.000Z'),
      session('nap-a', '2026-08-21T07:00:00.000Z', '2026-08-21T08:00:00.000Z'),
      session('night-b', '2026-08-21T20:00:00.000Z', '2026-08-22T06:00:00.000Z'),
      session('nap-b', '2026-08-22T07:00:00.000Z', '2026-08-22T08:00:00.000Z'),
      session('night-c', '2026-08-22T20:00:00.000Z', '2026-08-23T06:00:00.000Z'),
      session('nap-c', '2026-08-23T07:00:00.000Z', '2026-08-23T08:00:00.000Z'),
      session('today-night', '2026-08-24T20:00:00.000Z', '2026-08-25T06:00:00.000Z')
    ], NOW)
    expect(result.windowState).toBe('passed')
    expect(result.windowEnd).toBe(Date.parse('2026-08-25T07:00:00.000Z'))
  })

  it('switches to night prediction after the typical daily nap count is reached', () => {
    const botiSessions = demoBackup.data.sessions.filter((item) => item.childId === 'child_demo_boti') as SleepSession[]
    const result = buildPredictionLite(botiSessions, Date.parse('2026-08-26T16:09:00+02:00'), 14)

    expect(result.status).toBe('ready')
    expect(result.bucket).toBe('night')
    expect(result.sampleCount).toBeGreaterThanOrEqual(3)
  })

  it('withholds a prediction when today contains a quality issue', () => {
    const result = buildPredictionLite([
      session('a', '2026-08-25T05:00:00.000Z', '2026-08-25T07:00:00.000Z'),
      session('b', '2026-08-25T06:00:00.000Z', '2026-08-25T08:00:00.000Z')
    ], NOW)
    expect(result.status).toBe('unavailable')
  })

  it('does not fall back to an older wake when the latest session is excluded', () => {
    const result = buildPredictionLite([
      session('clean', '2026-08-23T20:00:00.000Z', '2026-08-24T06:00:00.000Z'),
      session('too-short', '2026-08-24T12:00:00.000Z', '2026-08-24T12:01:00.000Z')
    ], NOW)
    expect(result.status).toBe('unavailable')
    expect(result.currentWakeMs).toBeNull()
  })
})
