import { describe, expect, it } from 'vitest'
import { buildSimilarDaysInsight } from './similarDays'
import type { SleepSession } from './types'

const at = (day: number, hour: number) => new Date(2026, 8, day, hour).getTime()
const now = at(30, 12)
function sleep(id: string, start: number, end: number | null): SleepSession {
  const startTime = new Date(start).toISOString(), endTime = end === null ? null : new Date(end).toISOString()
  return { id, childId: 'a', startTime, endTime, dayNightOverride: null, note: '', createdAt: startTime, updatedAt: endTime ?? startTime }
}
const history = [23, 24, 25].flatMap(day => [sleep(`morning${day}`, at(day, 8), at(day, 9)), sleep(`noon${day}`, at(day, 11), at(day, 12))])
const base = [...history, sleep('today', at(30, 8), at(30, 9))]

describe('similar days during active sleep', () => {
  it.each([now - 3600000, now - 1, now])('withholds matches and awake evidence when sleep starts at %i', start => {
    expect(buildSimilarDaysInsight(base, now).status).toBe('ready')
    const data = [...base, sleep('active', start, null)]
    const original = JSON.stringify(data)
    expect(buildSimilarDaysInsight(data, now)).toMatchObject({ status: 'unavailable', current: null, candidateCount: 0, matches: [] })
    expect(JSON.stringify(data)).toBe(original)
  })

  it('recalculates from the recorded waking when the active sleep ends', () => {
    const active = sleep('active', at(30, 11), null)
    expect(buildSimilarDaysInsight([...base, active], now).matches).toEqual([])
    const result = buildSimilarDaysInsight([...base, { ...active, endTime: new Date(now).toISOString() }], now)
    expect(result.status).toBe('ready')
    expect(result.current).toMatchObject({ awakeMs: 0, totalSleepMs: 2 * 3600000, daytimeSleepCount: 2 })
    expect(result.matches).toHaveLength(3)
    for (const match of result.matches) expect(match.differences).toEqual({ awakeMs: 0, totalSleepMs: 0, daytimeSleepCount: 0 })
    expect(buildSimilarDaysInsight([...base, active], now).status).toBe('unavailable')
  })

  it.each(['invalid', 'future', 'stale', 'multiple'] as const)('cannot recover a false awake snapshot by filtering a %s active record', kind => {
    const active = sleep('active', kind === 'future' ? at(31, 11) : kind === 'stale' ? at(28, 11) : at(30, 11), null)
    if (kind === 'invalid') active.startTime = 'invalid'
    const data = [...base, active, ...(kind === 'multiple' ? [sleep('second-active', at(30, 11), null)] : [])]
    expect(buildSimilarDaysInsight(data, now)).toMatchObject({ status: 'unavailable', current: null, candidateCount: 0, matches: [] })
  })

  it('keeps overnight sleep unavailable at midnight and on the following day', () => {
    const data = [...base, sleep('overnight', at(30, 23), null)]
    for (const time of [at(31, 0) - 1, at(31, 0), at(31, 1)]) {
      expect(buildSimilarDaysInsight(data, time)).toMatchObject({ status: 'unavailable', current: null, matches: [] })
    }
  })

  it('preserves the closed historical interval boundary: wake at cutoff qualifies, later wake does not', () => {
    const crossing = sleep('crossing', at(24, 11), now - (6 * 24 * 3600000) + 1)
    const data = base.filter(session => session.id !== 'noon24')
    const result = buildSimilarDaysInsight([...data, crossing], now)
    expect(result).toMatchObject({ status: 'collecting', candidateCount: 2 })
    const closed = { ...crossing, endTime: new Date(at(24, 12)).toISOString() }
    expect(buildSimilarDaysInsight([...data, closed], now)).toMatchObject({ status: 'ready', candidateCount: 3 })
  })
})
