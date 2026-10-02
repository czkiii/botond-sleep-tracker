import { afterEach, describe, expect, it } from 'vitest'
import { buildInsightsFoundation } from './insights'
import { buildSleepDaySummaries } from './sleepDevelopment'
import type { SleepSession } from './types'

const HOUR = 3600000
const env = (globalThis as any).process.env
const originalTz = env.TZ
afterEach(() => { if (originalTz === undefined) delete env.TZ; else env.TZ = originalTz })
const time = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).toISOString()
function sleep(id: string, startTime: string, endTime: string | null, dayNightOverride: SleepSession['dayNightOverride'] = null): SleepSession {
  return { id, childId: 'child', startTime, endTime, dayNightOverride, note: '', createdAt: startTime, updatedAt: endTime ?? startTime }
}
function nights() {
  return [20, 21, 22].flatMap(day => [
    sleep(`${day}-first`, time(day, 20), time(day + 1, 1)),
    sleep(`${day}-last`, time(day + 1, 1, 30), time(day + 1, 6)),
  ])
}
const now = () => Date.parse(time(23, 14))

describe('night-level routine samples', () => {
  it('uses three nights, not four start dates, and the final 06:00 waking', () => {
    const routine = buildInsightsFoundation(nights(), now()).routine
    expect(routine.bedtime).toMatchObject({ typicalMinutes: 1200, sampleCount: 3 })
    expect(routine.wakeTime).toMatchObject({ typicalMinutes: 360, sampleCount: 3 })
    expect(routine.observedDayCount).toBe(3)
  })

  it('groups a night that begins after midnight without borrowing the following evening', () => {
    const sessions = [21, 22, 23].flatMap(day => [
      sleep(`${day}-a`, time(day, 0, 30), time(day, 3)),
      sleep(`${day}-b`, time(day, 3, 30), time(day, 7), 'night'),
    ])
    const routine = buildInsightsFoundation(sessions, now()).routine
    expect(routine.bedtime).toMatchObject({ typicalMinutes: 30, sampleCount: 3 })
    expect(routine.wakeTime).toMatchObject({ typicalMinutes: 420, sampleCount: 3 })
  })

  it('does not call many fragments of one night three routine samples', () => {
    const sessions = [20, 22].map(hour => sleep(`evening-${hour}`, time(22, hour), time(22, hour + 1)))
    sessions.push(sleep('dawn', time(23, 2), time(23, 6)))
    expect(buildInsightsFoundation(sessions, now()).routine.wakeTime).toBeNull()
    expect(buildInsightsFoundation(sessions, now()).routine.observedDayCount).toBe(1)
  })

  it.each([2, 7])('does not finalize the current night at %s:00, even between fragments', hour => {
    const sessions = nights().filter(item => Date.parse(item.endTime!) <= Date.parse(time(23, hour)))
    const routine = buildInsightsFoundation(sessions, Date.parse(time(23, hour))).routine
    expect(routine.wakeTime).toBeNull() // Only two closed noon-to-noon groups.
  })

  it('does not use a partial night whose last segment is still active after noon', () => {
    const sessions = nights()
    sessions[sessions.length - 1].endTime = null
    expect(buildInsightsFoundation(sessions, now()).routine.wakeTime).toBeNull()
  })

  it('adds the closed night exactly at noon, not one millisecond earlier', () => {
    const noon = Date.parse(time(23, 12))
    expect(buildInsightsFoundation(nights(), noon - 1).routine.wakeTime).toBeNull()
    expect(buildInsightsFoundation(nights(), noon).routine.wakeTime?.sampleCount).toBe(3)
  })

  it('keeps completed historical nights while another night is active', () => {
    const sessions = [...nights(), sleep('next-active', time(23, 20), null)]
    expect(buildInsightsFoundation(sessions, Date.parse(time(23, 22))).routine.wakeTime)
      .toMatchObject({ typicalMinutes: 360, sampleCount: 3 })
  })

  it('does not substitute the earlier waking when the last segment has an invalid end', () => {
    const sessions = nights()
    sessions[sessions.length - 1].endTime = 'invalid'
    expect(buildInsightsFoundation(sessions, now()).routine.wakeTime).toBeNull()
  })

  it('excludes nights wholly outside the selected lookback', () => {
    const sessions = nights()
    expect(buildInsightsFoundation(sessions, Date.parse(time(30, 14)), { lookbackDays: 7 }).routine.wakeTime).toBeNull()
    expect(buildInsightsFoundation(sessions, Date.parse(time(30, 14)), { lookbackDays: 14 }).routine.wakeTime?.sampleCount).toBe(3)
  })

  it('rejects a whole night when a night segment is excluded for overlap', () => {
    const sessions = nights()
    sessions.push(sleep('overlap', time(23, 2), time(23, 4)))
    expect(buildInsightsFoundation(sessions, now()).routine.wakeTime).toBeNull()
  })

  it('keeps the first bedtime when the rolling lookback cuts through a night', () => {
    const sessions = nights()
    // Cutoff: Sep 20 at 22:00. The first night must not become a 01:30 bedtime.
    const routine = buildInsightsFoundation(sessions, Date.parse(time(27, 22)), { lookbackDays: 7 }).routine
    expect(routine.bedtime).toMatchObject({ typicalMinutes: 1200, sampleCount: 3 })
    expect(routine.wakeTime?.sampleCount).toBe(3)
  })

  it('honors day overrides and keeps morning naps out of the final night waking', () => {
    const sessions = nights()
    for (const day of [21, 22, 23]) {
      sessions.push(sleep(`nap-${day}`, time(day, 9), time(day, 10)))
      sessions.push(sleep(`manual-day-${day}`, time(day, 6, 30), time(day, 7), 'day'))
    }
    const routine = buildInsightsFoundation(sessions, now()).routine
    expect(routine.wakeTime).toMatchObject({ typicalMinutes: 360, sampleCount: 3 })
    expect(routine.daytimeSleepCount?.typicalCount).toBe(2)
  })

  it('never adds gaps to sleep totals or merges fragments into continuous sleep', () => {
    const sessions = nights()
    const original = JSON.stringify(sessions)
    buildInsightsFoundation(sessions, now())
    expect(JSON.stringify(sessions)).toBe(original)
    const days = buildSleepDaySummaries(sessions, now())
    expect(days.reduce((sum, day) => sum + day.totalMs, 0)).toBe(3 * 9.5 * HOUR)
    expect(Math.max(...days.map(day => day.longestBlockMs))).toBe(5 * HOUR)
    expect(days.reduce((sum, day) => sum + day.episodeCount, 0)).toBe(6)
  })

  it('is independent of input order', () => {
    expect(buildInsightsFoundation(nights().reverse(), now()).routine)
      .toEqual(buildInsightsFoundation(nights(), now()).routine)
  })

  it.each(['Europe/Budapest', 'America/New_York', 'Australia/Lord_Howe'])('uses calendar nights over DST in %s', zone => {
    env.TZ = zone
    // Include the autumn transition in each zone (spring in Lord Howe).
    const [month, day] = zone === 'Europe/Budapest' ? [9, 25] : zone === 'America/New_York' ? [10, 1] : [9, 4]
    const local = (offset: number, hour: number, minute = 0) => new Date(2026, month, day + offset, hour, minute).toISOString()
    const sessions = [-1, 0, 1].flatMap(offset => [
      sleep(`${offset}-first`, local(offset - 1, 20), local(offset, 1)),
      sleep(`${offset}-last`, local(offset, 3, 30), local(offset, 6)),
    ])
    const routine = buildInsightsFoundation(sessions, Date.parse(local(1, 14))).routine
    expect(routine.bedtime).toMatchObject({ typicalMinutes: 1200, sampleCount: 3 })
    expect(routine.wakeTime).toMatchObject({ typicalMinutes: 360, sampleCount: 3 })
    expect(routine.observedDayCount).toBe(3)
  })
})
