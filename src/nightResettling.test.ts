import { afterEach, describe, expect, it } from 'vitest'
import type { SleepSession } from './types'
import { buildInsightsFoundation } from './insights'
import { buildPredictionLite } from './prediction'
import { buildSleepBuckets, buildNightGroups, routineNightBounds } from './nightGroups'
import { buildSleepDaySource } from './sleepDevelopment'
import { getDataQualityReport } from './utils'

const HOUR = 3600000, MINUTE = 60000
const env = (globalThis as any).process.env, originalZone = env.TZ
afterEach(() => { if (originalZone === undefined) delete env.TZ; else env.TZ = originalZone })
const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).getTime()
function sleep(id: string, start: number, end: number | null, kind: SleepSession['dayNightOverride'] = null): SleepSession {
  const startTime = new Date(start).toISOString(), endTime = end === null ? null : new Date(end).toISOString()
  return { id, childId: 'a', startTime, endTime, dayNightOverride: kind, note: '', createdAt: startTime, updatedAt: endTime ?? startTime }
}
const night = (day: number) => [
  sleep(`${day}-nap`, at(day, 12), at(day, 13)),
  sleep(`${day}-bed`, at(day, 20), at(day + 1, 0)),
  sleep(`${day}-back1`, at(day + 1, 0, 15), at(day + 1, 3)),
  sleep(`${day}-back2`, at(day + 1, 3, 15), at(day + 1, 6)),
]
const history = [26, 27, 28].flatMap(night)
const nap = sleep('today', at(30, 12), at(30, 13))
const evening = at(30, 19)
const currentNight = sleep('current-night', at(30, 20), at(31, 0))

describe('first night sleep and resettling evidence', () => {
  it('separates the audit three seven-hour bedtime gaps from six fifteen-minute resettlings', () => {
    const data = [...history, nap], original = structuredClone(data)
    const insight = buildInsightsFoundation(data, evening)
    expect(insight.wakeWindow.breakdown).toContainEqual(expect.objectContaining({ key: 'night', typicalMs: 7 * HOUR, sampleCount: 3 }))
    expect(insight.wakeWindow.breakdown).toContainEqual(expect.objectContaining({ key: 'night-resettling', typicalMs: 15 * MINUTE, sampleCount: 6 }))
    expect(insight.wakeWindow.typicalMs).toBe(7 * HOUR)
    expect(insight.routine.bedtime).toMatchObject({ typicalMinutes: 20 * 60, sampleCount: 3 })
    expect(insight.routine.wakeTime).toMatchObject({ typicalMinutes: 6 * 60, sampleCount: 3 })
    expect(data).toEqual(original)
  })

  it('predicts bedtime from the first-night group, not the short interruptions', () => {
    const result = buildPredictionLite([...history, nap], evening)
    expect(result).toMatchObject({ status: 'ready', bucket: 'night', sampleCount: 3, windowStart: at(30, 20), windowEnd: at(30, 20) })
    expect(result.sourceSessionIds.some(id => id.includes('back'))).toBe(false)
  })

  it('predicts after midnight from resettling evidence in the same noon-to-noon group', () => {
    const result = buildPredictionLite([...history, nap, currentNight], at(31, 0, 5))
    expect(result).toMatchObject({ status: 'ready', bucket: 'night-resettling', sampleCount: 6, windowStart: at(31, 0, 15), windowEnd: at(31, 0, 15) })
    expect(result.sourceSessionIds.some(id => id.includes('nap'))).toBe(false)
    const insight = buildInsightsFoundation([...history, nap, currentNight], at(31, 0, 5))
    const group = insight.wakeWindow.breakdown.find(item => item.key === result.bucket)!
    expect(group.sampleCount).toBe(result.sampleCount)
    expect(group.typicalMs).toBe(result.typicalTime! - result.lastWakeTime!)
  })

  it('does not replace insufficient bedtime evidence with abundant resettling samples', () => {
    const data = [...[27, 28].flatMap(night), nap]
    expect(buildPredictionLite(data, evening)).toMatchObject({ status: 'collecting', bucket: 'night', sampleCount: 2 })
    const breakdown = buildInsightsFoundation(data, evening).wakeWindow.breakdown
    expect(breakdown.some(item => item.key === 'night')).toBe(false)
    expect(breakdown.find(item => item.key === 'night-resettling')?.sampleCount).toBe(4)
  })

  it('does not replace insufficient resettling evidence with bedtime history', () => {
    const data = history.filter(item => !item.id.includes('back'))
    expect(buildPredictionLite([...data, nap, currentNight], at(31, 0, 5))).toMatchObject({ status: 'collecting', bucket: 'night-resettling', sampleCount: 0 })
  })

  it('uses the first recorded sleep even if it begins after midnight', () => {
    const data = [sleep('nap', at(26, 12), at(26, 13)), sleep('first', at(27, 0, 30), at(27, 3)), sleep('later', at(27, 3, 15), at(27, 6))]
    const buckets = buildSleepBuckets(data, new Set(), evening)
    expect(buckets.get('first')).toBe('night')
    expect(buckets.get('later')).toBe('night-resettling')
  })

  it('returns to the daytime group at 06:00 and starts a new night at the next evening', () => {
    const data = [...history, nap, sleep('last', at(30, 20), at(31, 6))]
    expect(buildPredictionLite(data, at(31, 6)).bucket).toBe('day-1')
    expect(buildPredictionLite([...data, sleep('next-nap', at(31, 12), at(31, 13))], at(31, 19)).bucket).toBe('night')
  })

  it('respects manual daytime classification at night and never invents a night group from it', () => {
    const data = [sleep('manual-day', at(30, 20), at(30, 21), 'day')]
    expect(buildPredictionLite(data, at(30, 22)).bucket).toBe('night')
    expect(buildSleepBuckets(data, new Set(), at(30, 22)).get('manual-day')).toBe('day-1')
  })

  it('keeps invalid and unfinished night groups out of both historical night buckets', () => {
    for (const problem of [sleep('bad', at(27, 3), at(27, 2)), sleep('active', at(27, 3), null)]) {
      const data = [...night(26).slice(0, 2), problem]
      const excluded = new Set(getDataQualityReport(data, evening).excludedSessionIds)
      const buckets = buildSleepBuckets(data, excluded, evening)
      expect(buckets.has('26-bed')).toBe(false)
      expect(buildInsightsFoundation(data, evening).wakeWindow.breakdown).toEqual([])
    }
  })

  it('retains original adjacency so an invalid middle record cannot create a clean resettling gap', () => {
    const data = [sleep('first', at(26, 20), at(26, 22)), sleep('invalid', at(26, 23), at(26, 22)), sleep('later', at(27, 0), at(27, 3))]
    expect(buildInsightsFoundation(data, evening).wakeWindow.sampleCount).toBe(0)
  })

  it('preserves raw sleep totals and excludes the awake gaps from sleep time', () => {
    const data = night(26), source = buildSleepDaySource(data, evening)
    expect(source.days.reduce((sum, day) => sum + day.totalMs, 0)).toBe(10.5 * HOUR)
    expect(buildPredictionLite([...history, nap, { ...currentNight, endTime: null }], at(31, 0, 5)).unavailableReason).toBe('sleeping')
  })

  it('is invariant to input ordering and retains full grouping across the lookback boundary', () => {
    const data = [...history, nap, currentNight]
    expect(buildPredictionLite([...data].reverse(), at(31, 0, 5))).toEqual(buildPredictionLite(data, at(31, 0, 5)))
    const boundary = at(24, 0, 5)
    const older = [sleep('before', at(23, 20), boundary), sleep('after', at(24, 0, 20), at(24, 3))]
    expect(buildPredictionLite([...older, ...data], at(31, 0, 5), 7).sampleCount).toBe(7)
    older[0] = { ...older[0], endTime: new Date(boundary - 1).toISOString() }
    expect(buildPredictionLite([...older, ...data], at(31, 0, 5), 7).sampleCount).toBe(6)
  })

  it.each([['2026-03-28T22:00Z', '2026-03-29T00:45Z', '2026-03-29T01:15Z', '2026-03-29T04:00Z'],
    ['2026-10-24T21:00Z', '2026-10-25T00:45Z', '2026-10-25T01:15Z', '2026-10-25T05:00Z']])('keeps DST resettling in one night and measures real elapsed gaps (%s)', (start, wake, back, end) => {
    env.TZ = 'Europe/Budapest'
    const data = [sleep('first', Date.parse(start), Date.parse(wake)), sleep('back', Date.parse(back), Date.parse(end))]
    const now = Date.parse(end) + 8 * HOUR
    const groups = buildNightGroups(data, new Set(), now)
    expect(groups.nights.size).toBe(1)
    expect(buildSleepBuckets(data, new Set(), now).get('back')).toBe('night-resettling')
    expect(Date.parse(back) - Date.parse(wake)).toBe(30 * MINUTE)
    expect(buildInsightsFoundation(data, now).wakeWindow.sampleCount).toBe(0) // Resettling is not general evidence.
    expect(routineNightBounds(start)?.key).toBe(routineNightBounds(back)?.key)
  })
})
