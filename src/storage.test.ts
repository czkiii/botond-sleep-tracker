import { describe, expect, it } from 'vitest'
import demoBackup from '../test-data/solemi-demo-v4-2026-08-26.json'
import { ImportValidationError, inspectBackup } from './storage'
import type { AppData, ChildProfile, SleepSession } from './types'

const child: ChildProfile = { id: 'child-1', name: 'Mira', birthDate: null, photoRef: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }
const sleep: SleepSession = { id: 'sleep-1', childId: child.id, startTime: '2026-08-20T10:00:00.000Z', endTime: '2026-08-20T11:00:00.000Z', note: '', dayNightOverride: null, createdAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T11:00:00.000Z' }

function backup(dataPatch: Partial<AppData> = {}) {
  const data: AppData = { version: 4, settings: { locale: 'hu', activeChildId: child.id, longSleepReminderEnabled: false }, children: [child], sessions: [sleep], ...dataPatch }
  return { format: 'solemi-sleep-backup', version: 4, exportedAt: '2026-08-25T12:00:00.000Z', data }
}

function expectCode(run: () => unknown, code: ImportValidationError['code']) {
  try { run(); throw new Error('Expected import to fail') } catch (error) {
    expect(error).toBeInstanceOf(ImportValidationError)
    expect((error as ImportValidationError).code).toBe(code)
  }
}

describe('inspectBackup', () => {
  it('accepts the bundled two-child demo backup', () => {
    const result = inspectBackup(demoBackup)

    expect(result.data.children.map((item) => item.name)).toEqual(['Boti', 'Frici'])
    expect(result.data.sessions).toHaveLength(154)
    expect(new Set(result.data.sessions.map((item) => item.childId))).toEqual(new Set(['child_demo_boti', 'child_demo_frici']))
    expect(result.diagnostics).toEqual([])
  })

  it('accepts a clean V4 backup', () => {
    const result = inspectBackup(backup())
    expect(result.data.sessions).toHaveLength(1)
    expect(result.diagnostics).toEqual([])
  })

  it('removes only fully identical duplicate records', () => {
    const result = inspectBackup(backup({ children: [child, child], sessions: [sleep, sleep] }))
    expect(result.data.children).toHaveLength(1)
    expect(result.data.sessions).toHaveLength(1)
    expect(result.diagnostics.map((item) => item.kind)).toEqual(['identical-children-removed', 'identical-sessions-removed'])
  })

  it('blocks conflicting records that share an ID', () => {
    expectCode(() => inspectBackup(backup({ sessions: [sleep, { ...sleep, note: 'different' }] })), 'duplicate-session-conflict')
  })

  it('blocks sessions pointing to a missing child', () => {
    expectCode(() => inspectBackup(backup({ sessions: [{ ...sleep, childId: 'missing' }] })), 'orphan-sessions')
  })

  it('reports the number of invalid sessions', () => {
    try { inspectBackup(backup({ sessions: [{ ...sleep, endTime: 'bad-date' }] })) } catch (error) {
      expect((error as ImportValidationError).code).toBe('invalid-sessions')
      expect((error as ImportValidationError).count).toBe(1)
    }
  })

  it('repairs a missing active child selection and reports it', () => {
    const result = inspectBackup(backup({ settings: { locale: 'hu', activeChildId: 'missing', longSleepReminderEnabled: false } }))
    expect(result.data.settings.activeChildId).toBe(child.id)
    expect(result.diagnostics[0].kind).toBe('active-child-reset')
  })
})
