// Read-only: restores exports into memory and compares legacy data without
// printing names, notes, tokens or other row contents. Never contacts D1.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const files = process.argv.slice(2)
if (files.length < 1 || files.length > 2) throw new Error('Usage: node verify-auth-backup.mjs before.sql [after.sql]')
const snapshots = files.map((file) => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(readFileSync(file, 'utf8'))
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [], 'Foreign key check failed')
    const result = {}
    for (const table of ['families', 'devices', 'invite_codes', 'children', 'sleep_sessions', 'operations']) {
      const rows = db.prepare(`SELECT * FROM ${table}`).all().map((row) => JSON.stringify(row)).sort()
      result[table] = { rows: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') }
    }
    return result
  } finally { db.close() }
})
if (snapshots.length === 2) assert.deepEqual(snapshots[1], snapshots[0], 'Legacy data changed between exports')
console.log(JSON.stringify({ restored: files.length, legacyDataUnchanged: snapshots.length === 2 ? true : null, tables: snapshots[0] }, null, 2))
