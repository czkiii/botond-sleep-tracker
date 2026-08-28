import { describe, expect, it } from 'vitest'
import demoBackup from '../test-data/solemi-demo-v4-2026-08-26.json'
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
    expect(result.wakeWindow).toMatchObject({ status: 'unavailable', currentMs: null, typicalMs: null, typicalRange: null, sampleCount: 0, confidence: null, lookbackDays: 14 })
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
    expect(result.wakeWindow.typicalRange).toEqual({ lowMs: 1.75 * HOUR, highMs: 3.25 * HOUR })
  })

  it('respects the selected 7, 14 or 30 day lookback', () => {
    const sessions = [
      session('old-a', '2026-08-05T08:00:00.000Z', '2026-08-05T09:00:00.000Z'),
      session('old-b', '2026-08-05T11:00:00.000Z', '2026-08-05T12:00:00.000Z'),
      session('new-a', '2026-08-24T08:00:00.000Z', '2026-08-24T09:00:00.000Z'),
      session('new-b', '2026-08-24T11:00:00.000Z', '2026-08-24T12:00:00.000Z')
    ]
    expect(buildInsightsFoundation(sessions, NOW, { lookbackDays: 7 }).wakeWindow.sampleCount).toBe(1)
    expect(buildInsightsFoundation(sessions, NOW, { lookbackDays: 30 }).wakeWindow.sampleCount).toBe(2)
  })

  it('shows the demo wake-window trend across 7, 14 and 30 days', () => {
    const botiSessions = demoBackup.data.sessions.filter((item) => item.childId === 'child_demo_boti') as SleepSession[]
    const now = Date.parse('2026-08-26T16:33:00+02:00')
    const nightTypical = (days: 7 | 14 | 30) => buildInsightsFoundation(botiSessions, now, { lookbackDays: days }).wakeWindow.breakdown.find((item) => item.key === 'night')?.typicalMs ?? 0

    expect(nightTypical(7)).toBeGreaterThan(nightTypical(14))
    expect(nightTypical(14)).toBeGreaterThan(nightTypical(30))
  })

  it('shows a sleep-order breakdown only after three matching samples', () => {
    const result = buildInsightsFoundation([
      session('night-a', '2026-08-21T20:00:00.000Z', '2026-08-22T05:00:00.000Z'),
      session('nap-a', '2026-08-22T07:00:00.000Z', '2026-08-22T08:00:00.000Z'),
      session('night-b', '2026-08-22T20:00:00.000Z', '2026-08-23T05:00:00.000Z'),
      session('nap-b', '2026-08-23T07:00:00.000Z', '2026-08-23T08:00:00.000Z'),
      session('night-c', '2026-08-23T20:00:00.000Z', '2026-08-24T05:00:00.000Z'),
      session('nap-c', '2026-08-24T07:00:00.000Z', '2026-08-24T08:00:00.000Z')
    ], NOW)
    const firstNap = result.wakeWindow.breakdown.find((item) => item.key === 'day-1')
    expect(firstNap?.sampleCount).toBe(3)
    expect(firstNap?.typicalMs).toBe(2 * HOUR)
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

  it('collects routine patterns only after three observed nights', () => {
    const result = buildInsightsFoundation([
      session('night-a', '2026-08-23T20:00:00.000Z', '2026-08-24T06:00:00.000Z'),
      session('night-b', '2026-08-24T20:00:00.000Z', '2026-08-25T06:00:00.000Z')
    ], NOW)
    expect(result.routine.status).toBe('collecting')
    expect(result.routine.bedtime).toBeNull()
  })

  it('derives bedtime, wake-up and nap-count routines from clean days', () => {
    const result = buildInsightsFoundation([
      session('night-a', '2026-08-21T20:00:00.000Z', '2026-08-22T06:00:00.000Z'),
      session('nap-a1', '2026-08-22T10:00:00.000Z', '2026-08-22T11:00:00.000Z'),
      session('nap-a2', '2026-08-22T14:00:00.000Z', '2026-08-22T15:00:00.000Z'),
      session('night-b', '2026-08-22T20:15:00.000Z', '2026-08-23T06:15:00.000Z'),
      session('nap-b', '2026-08-23T10:00:00.000Z', '2026-08-23T11:00:00.000Z'),
      session('night-c', '2026-08-23T19:45:00.000Z', '2026-08-24T05:45:00.000Z'),
      session('nap-c1', '2026-08-24T10:00:00.000Z', '2026-08-24T11:00:00.000Z'),
      session('nap-c2', '2026-08-24T14:00:00.000Z', '2026-08-24T15:00:00.000Z')
    ], NOW)
    expect(result.routine.status).toBe('ready')
    expect(result.routine.bedtime?.typicalMinutes).toBe(20 * 60)
    expect(result.routine.wakeTime?.typicalMinutes).toBe(6 * 60)
    expect(result.routine.daytimeSleepCount?.typicalCount).toBe(2)
    expect(result.routine.bedtime?.consistentCount).toBe(3)
  })
})
