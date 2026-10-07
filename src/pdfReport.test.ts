import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPdfReport, MAX_PDF_ROWS } from './pdfReport'
import type { AppData, SleepSession } from './types'

afterEach(() => { vi.unstubAllEnvs() })
const now = new Date('2026-11-01T12:00:00Z').getTime()
const sleep = (startTime: string, endTime: string | null, id = 'one'): SleepSession => ({ id, childId: 'a', startTime, endTime, note: 'PRIVATE-NOTE', dayNightOverride: 'night', createdAt: startTime, updatedAt: startTime })
const diary = (sessions: SleepSession[]): AppData => ({ version: 4,
  children: [{ id: 'a', name: 'Árvíztűrő', birthDate: '2025-01-01', photoRef: 'private-photo', createdAt: '', updatedAt: '' }],
  sessions, settings: { locale: 'hu', activeChildId: 'a', longSleepReminderEnabled: false } })
const options = { childId: 'a', from: '2026-10-01', to: '2026-10-01', includeNotes: false }

describe('PDF diary selection', () => {
  it('clips cross-boundary records and counts duplicate/overlapping time once, retaining raw rows', () => {
    vi.stubEnv('TZ', 'UTC')
    const data = diary([sleep('2026-09-30T23:00Z', '2026-10-01T01:00Z'), sleep('2026-10-01T00:30Z', '2026-10-01T02:00Z', 'two'), sleep('2026-10-01T00:30Z', '2026-10-01T02:00Z', 'duplicate')])
    const result = buildPdfReport(data, options, now)
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].duration).toBe(3600000)
    expect(result.total).toBe(7200000)
    expect(result.rows[0].startTime).toBe('2026-09-30T23:00Z')
  })
  it.each([['2026-03-29', 23], ['2026-10-25', 25]] as const)('uses calendar boundaries on Budapest DST day %s', (day, hours) => {
    vi.stubEnv('TZ', 'Europe/Budapest')
    const result = buildPdfReport(diary([sleep(`${day}T00:00:00`, `${day}T23:59:59`)]), { ...options, from: day, to: day }, now)
    expect(result.total).toBe(hours * 3600000 - 1000)
    expect(result.timeZone).toBe('Europe/Budapest')
  })
  it('uses the current viewing timezone at a month boundary', () => {
    vi.stubEnv('TZ', 'America/New_York')
    expect(buildPdfReport(diary([sleep('2026-10-01T02:00Z', '2026-10-01T03:00Z')]), { ...options, from: '2026-09-30', to: '2026-09-30' }, now).rows).toHaveLength(1)
    expect(buildPdfReport(diary([sleep('2026-10-01T02:00Z', '2026-10-01T03:00Z')]), options, now).rows).toHaveLength(0)
  })
  it('freezes active sleep at generation time, excluding other children and boundary-touching rows', () => {
    vi.stubEnv('TZ', 'UTC')
    const result = buildPdfReport(diary([sleep('2026-10-01T10:00Z', null), { ...sleep('2026-10-01T00:00Z', null), childId: 'other' }, sleep('2026-09-30T23:00Z', '2026-10-01T00:00Z')]), options, Date.parse('2026-10-01T12:00Z'))
    expect(result.rows).toHaveLength(1)
    expect(result.total).toBe(7200000)
    expect(result.rows[0].endTime).toBeNull()
  })
  it('exports an explicit allowlist, with notes opt-in and no identifiers/photos/birthday/tokens', () => {
    const data = diary([sleep('2026-10-01T10:00Z', '2026-10-01T11:00Z')])
    const report = buildPdfReport(data, options, now)
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE-NOTE|private-photo|2025-01-01|childId|createdAt|updatedAt/)
    expect(buildPdfReport(data, { ...options, includeNotes: true }, now).rows[0].note).toBe('PRIVATE-NOTE')
    expect(data.sessions[0].note).toBe('PRIVATE-NOTE')
  })
  it('reports invalid and future timestamps without inventing durations', () => {
    const result = buildPdfReport(diary([sleep('bad', null), sleep('2026-10-01T11:00Z', '2026-10-01T10:00Z'), sleep('2027-01-01T10:00Z', null)]), options, now)
    expect(result.omitted).toBe(3); expect(result.rows).toEqual([]); expect(result.total).toBe(0)
  })
  it.each([['2026-02-30', '2026-03-01'], ['2026-10-02', '2026-10-01'], ['2025-01-01', '2026-10-01'], ['2026-10-01', '2027-01-01'], ['x', '2026-10-01']])('rejects invalid/overlong/future period %s–%s', (from, to) => {
    expect(() => buildPdfReport(diary([]), { ...options, from, to }, now)).toThrow('PDF_RANGE')
  })
  it('rejects a removed child and oversized exports without silently truncating', () => {
    expect(() => buildPdfReport(diary([]), { ...options, childId: 'gone' }, now)).toThrow('PDF_CHANGED')
    expect(() => buildPdfReport(diary(Array.from({ length: MAX_PDF_ROWS + 1 }, () => sleep('2026-10-01T10:00Z', '2026-10-01T11:00Z'))), options, now)).toThrow('PDF_LARGE')
    expect(() => buildPdfReport(diary([{ ...sleep('2026-10-01T10:00Z', '2026-10-01T11:00Z'), note: 'x'.repeat(500001) }]), { ...options, includeNotes: true }, now)).toThrow('PDF_LARGE')
  })
})
