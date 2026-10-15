import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync, rmdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
// @ts-expect-error Operator script deliberately runs as plain Node ESM.
import { artifactDeadline, maintainRetainedFiles } from '../scripts/maintain-retained-files.mjs'
const now = Date.UTC(2026, 9, 15), day = 86400000
let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'solemi-retention-')) })
afterEach(() => { for (const file of readdirSync(root)) unlinkSync(join(root, file)); rmdirSync(root) })
function artifact(kind = 'backup', createdAt = now - 30 * day, path = 'managed.sql') {
  writeFileSync(join(root, path), 'fixture only')
  return { id: path, path, kind, createdAt, sha256: createHash('sha256').update('fixture only').digest('hex') }
}
const manifest = (...records: unknown[]) => ({ format: 'solemi-retained-files-v1', records })
describe('A17 operator-managed file retention', () => {
  it('previews by default and deletes only an explicitly registered expired file at 30 days', () => {
    const backup = artifact(); writeFileSync(join(root, 'user-export.json'), 'untouched')
    expect(maintainRetainedFiles(root, manifest(backup), { now }).expired).toEqual(['managed.sql'])
    expect(existsSync(join(root, 'managed.sql'))).toBe(true)
    expect(maintainRetainedFiles(root, manifest(backup), { now: now - 1, apply: true }).expired).toEqual([])
    expect(maintainRetainedFiles(root, manifest(backup), { now, apply: true }).absent).toEqual(['managed.sql'])
    expect(readFileSync(join(root, 'user-export.json'), 'utf8')).toBe('untouched')
    expect(maintainRetainedFiles(root, manifest(backup), { now, apply: true }).absent).toEqual(['managed.sql'])
  })
  it('uses event time for logs and incident closure for selected evidence, with open-incident review', () => {
    expect(artifactDeadline(artifact('log'))).toBe(now)
    const closed = { ...artifact('incident', now - 120 * day, 'incident.txt'), closedAt: now - 90 * day }
    const open = { ...artifact('incident', now - 100 * day, 'open.txt'), closedAt: null, reviewedAt: now - 31 * day }
    const result = maintainRetainedFiles(root, manifest(closed, open), { now, apply: true })
    expect(result.expired).toEqual(['incident.txt']); expect(result.reviewRequired).toEqual(['open.txt'])
    expect(existsSync(join(root, 'open.txt'))).toBe(true)
  })
  it('preserves the original age of copies instead of using filesystem modification time', () => {
    const original = artifact(); const copy = { ...artifact('backup', original.createdAt, 'copy.sql') }
    expect(maintainRetainedFiles(root, manifest(original, copy), { now, apply: true }).absent).toHaveLength(2)
  })
  it('validates every path and hash before deleting any file', () => {
    const first = artifact(); const changed = artifact('log', now - 40 * day, 'changed.log')
    writeFileSync(join(root, 'changed.log'), 'changed content')
    expect(() => maintainRetainedFiles(root, manifest(first, changed), { now, apply: true })).toThrow('ARTIFACT_CONTENT_CHANGED')
    expect(existsSync(join(root, first.path))).toBe(true)
    for (const path of ['../outside.sql', 'C:/outside.sql', 'managed.sql:stream'])
      expect(() => maintainRetainedFiles(root, manifest({ ...first, path }), { now, apply: true })).toThrow()
    expect(() => maintainRetainedFiles(root, manifest(first, first), { now, apply: true })).toThrow()
  })
  it('rejects symlinks instead of following them', () => {
    const original = artifact(); const target = join(root, 'alias.sql')
    // Windows may lack file-symlink permission. Junctions exercise the same
    // rejection before the tool attempts to read any target.
    symlinkSync(root, target, 'junction')
    try { expect(() => maintainRetainedFiles(root, manifest({ ...original, path: 'alias.sql', id: 'alias' }), { now, apply: true })).toThrow('ARTIFACT_LINK_FORBIDDEN') }
    finally { if (process.platform === 'win32') rmdirSync(target); else unlinkSync(target) }
  })
})
