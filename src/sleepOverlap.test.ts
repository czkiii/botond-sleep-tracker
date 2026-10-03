import { describe, expect, it } from 'vitest'
import type { SleepSession } from './types'
import { getDataQualityReport } from './utils'
import { buildSleepDaySource, buildSleepDevelopment } from './sleepDevelopment'
import { buildMonthlyFamilyReport } from './monthlyReport'
import { buildSleepChangeInsight } from './sleepChange'
import { buildInsightsFoundation } from './insights'
import { buildPredictionLite } from './prediction'
import { buildSimilarDaysInsight } from './similarDays'

const HOUR = 3600000
const now = new Date(2026, 9, 3, 18).getTime()
function sleep(id: string, start = 12, end = 14, kind: SleepSession['dayNightOverride'] = 'day', day = 3): SleepSession {
  const startTime = new Date(2026, 9, day, start).toISOString(), endTime = new Date(2026, 9, day, end).toISOString()
  return { id, childId: 'a', startTime, endTime, dayNightOverride: kind, note: '', createdAt: startTime, updatedAt: endTime }
}
const conflicts = (data: SleepSession[]) => getDataQualityReport(data, now).issues.filter(issue => issue.kind === 'classification-conflict').flatMap(issue => issue.sessionIds).sort()

describe('overlap and manual classification policy', () => {
  it('excludes the audit pair from every statistics consumer without deleting either record', () => {
    const data = [sleep('day'), sleep('night', 12, 14, 'night')], original = structuredClone(data)
    const source = buildSleepDaySource(data, now)
    expect(source.days).toEqual([])
    expect(source.usableSessionCount).toBe(0)
    expect(conflicts(data)).toEqual(['day', 'night'])
    expect(buildInsightsFoundation(data, now).quality.usableSessionCount).toBe(0)
    expect(buildInsightsFoundation(data, now).wakeWindow.currentMs).toBeNull()
    expect(buildPredictionLite(data, now).status).toBe('unavailable')
    expect(buildSimilarDaysInsight(data, now).status).toBe('unavailable')
    expect(buildSleepDevelopment(data, now).months).toEqual([])
    expect(buildMonthlyFamilyReport(data, now).month).toBeNull()
    expect(buildSleepChangeInsight(data, now).recentSampleCount).toBe(0)
    expect(data).toEqual(original)
  })

  it('excludes entire partially overlapping records, not a fabricated pair of clean tails', () => {
    const data = [sleep('day', 10, 13), sleep('night', 12, 15, 'night'), sleep('clean', 16, 17)]
    expect(buildSleepDaySource(data, now).days[0]).toMatchObject({ totalMs: HOUR, dayMs: HOUR, nightMs: 0, longestBlockMs: HOUR, episodeCount: 1 })
  })

  it('excludes automatic and duplicate aliases in the connected conflict group, independent of order', () => {
    const data = [sleep('day', 8, 11), sleep('night', 10, 12, 'night'), sleep('bridge', 11, 14, null), sleep('tail', 13, 15)]
    for (const items of [data, [...data].reverse(), [data[2], data[0], data[3], data[1]]]) {
      expect(conflicts(items)).toEqual(['bridge', 'day', 'night', 'tail'])
      expect(buildSleepDaySource(items, now).days).toEqual([])
    }
  })

  it('does not invent a manual conflict when opposite labels only connect through an automatic record', () => {
    const data = [sleep('day', 8, 10), sleep('auto', 9, 13, null), sleep('night', 12, 14, 'night')]
    expect(conflicts(data)).toEqual([])
    expect(buildSleepDaySource(data, now).days[0]).toMatchObject({ totalMs: 6 * HOUR, dayMs: 4 * HOUR, nightMs: 2 * HOUR })
  })

  it('counts exact same-type duplicates once in totals while excluding them from sequence samples', () => {
    const data = [sleep('a'), sleep('copy')]
    expect(conflicts(data)).toEqual([])
    expect(buildSleepDaySource(data, now).days[0]).toMatchObject({ totalMs: 2 * HOUR, dayMs: 2 * HOUR, nightMs: 0, episodeCount: 1, longestBlockMs: 2 * HOUR })
    expect(buildInsightsFoundation(data, now).quality.usableSessionCount).toBe(0)
    expect(getDataQualityReport(data, now).issues[0].kind).toBe('possible-duplicate')
  })

  it('preserves union totals for same-type partial and contained overlaps', () => {
    const source = buildSleepDaySource([sleep('a', 8, 12), sleep('b', 11, 14), sleep('contained', 9, 10)], now)
    expect(source.days[0]).toMatchObject({ totalMs: 6 * HOUR, episodeCount: 1, longestBlockMs: 6 * HOUR })
    expect(source.conflictSessionIds).toEqual([])
  })

  it('keeps the manual override ahead of automatic clock classification in either input order', () => {
    const data = [sleep('auto', 12, 14, null), sleep('manual', 12, 14, 'night')]
    for (const items of [data, [...data].reverse()]) {
      expect(conflicts(items)).toEqual([])
      expect(buildSleepDaySource(items, now).days[0]).toMatchObject({ totalMs: 2 * HOUR, nightMs: 2 * HOUR, dayMs: 0 })
    }
  })

  it('does not treat touching endpoints or separate children as classification conflicts', () => {
    const touching = [sleep('a', 10, 12), sleep('b', 12, 14, 'night')]
    expect(getDataQualityReport(touching, now).issues).toEqual([])
    expect(buildSleepDaySource(touching, now).days[0]).toMatchObject({ dayMs: 2 * HOUR, nightMs: 2 * HOUR, episodeCount: 1 })
    const otherChild = [sleep('a'), { ...sleep('b', 12, 14, 'night'), childId: 'b' }]
    expect(getDataQualityReport(otherChild, now).issues).toEqual([])
  })

  it('also protects completed statistics from an opposing active record', () => {
    const data = [sleep('done'), { ...sleep('active', 13, 15, 'night'), endTime: null }]
    expect(conflicts(data)).toEqual(['active', 'done'])
    expect(buildSleepDaySource(data, now).days).toEqual([])
  })

  it('ignores invalid and future records as conflict sources without admitting them as observations', () => {
    const good = sleep('good')
    const data = [good, { ...sleep('invalid', 12, 14, 'night'), startTime: 'invalid' }, sleep('future', 12, 14, 'night', 5)]
    expect(conflicts(data)).toEqual([])
    expect(buildSleepDaySource(data, now).days[0].totalMs).toBe(2 * HOUR)
  })

  it('recovers derived totals when the user resolves the conflicting label', () => {
    const data = [sleep('day'), sleep('night', 12, 14, 'night')]
    expect(buildSleepDaySource(data, now).days).toEqual([])
    const resolved = data.map(item => ({ ...item, dayNightOverride: 'day' as const }))
    expect(buildSleepDaySource(resolved, now).days[0].totalMs).toBe(2 * HOUR)
    expect(conflicts(resolved)).toEqual([])
    // It remains a duplicate until the user fixes the second raw record.
    expect(buildInsightsFoundation(resolved, now).quality.excludedSessionCount).toBe(2)
    expect(buildInsightsFoundation(resolved.slice(0, 1), now).quality.excludedSessionCount).toBe(0)
  })

  it('cannot create monthly eligibility or daily change evidence from repeated conflicts', () => {
    const data = Array.from({ length: 60 }, (_, day) => [sleep(`${day}-a`, 12, 14, 'day', -day), sleep(`${day}-b`, 12, 14, 'night', -day)]).flat()
    const source = buildSleepDaySource(data, now)
    expect(source.days).toEqual([])
    expect(buildMonthlyFamilyReport(data, now, source.days).status).toBe('collecting')
    expect(buildSleepDevelopment(data, now, 12, undefined, source).months).toEqual([])
    expect(buildSleepChangeInsight(data, now, source.days)).toMatchObject({ recentSampleCount: 0, baselineSampleCount: 0, signals: [] })
  })
})
