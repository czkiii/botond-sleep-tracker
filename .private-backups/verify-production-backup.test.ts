import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { inspectBackup } from '../src/storage'

describe('private production family backup', () => {
  it('is accepted without repair by the Solemi V4 importer', () => {
    const raw = JSON.parse(readFileSync(new URL('./production/Opoczki-Klima-v4-2026-09-20.json', import.meta.url), 'utf8'))
    const inspected = inspectBackup(raw)

    expect(inspected.sourceVersion).toBe(4)
    expect(inspected.data.children).toHaveLength(1)
    expect(inspected.data.sessions).toHaveLength(102)
    expect(inspected.diagnostics).toEqual([])
  })
})
