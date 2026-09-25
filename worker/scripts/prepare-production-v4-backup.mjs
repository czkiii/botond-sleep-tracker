import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [sourceArg, familyName, outputArg] = process.argv.slice(2)
if (!sourceArg || !familyName || !outputArg) {
  throw new Error('Usage: node prepare-production-v4-backup.mjs source.sql family-name output.json')
}

const source = resolve(sourceArg)
const output = resolve(outputArg)
const database = new DatabaseSync(':memory:')

function rows(sql, ...params) {
  return database.prepare(sql).all(...params)
}

function tableExists(name) {
  return Boolean(database.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name))
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function tableDigest(table, orderBy) {
  return digest(rows(`SELECT * FROM ${table} ORDER BY ${orderBy}`))
}

try {
  database.exec(readFileSync(source, 'utf8'))
  const required = ['families', 'devices', 'invite_codes', 'sleep_sessions', 'operations']
  for (const table of required) if (!tableExists(table)) throw new Error(`Missing source table: ${table}`)

  const legacySessions = rows(`SELECT id, family_id, start_time, end_time, note,
    created_at, updated_at, deleted_at, revision FROM sleep_sessions ORDER BY id`)
  const protectedBefore = Object.fromEntries([
    ['families', tableDigest('families', 'id')],
    ['devices', tableDigest('devices', 'id')],
    ['invite_codes', tableDigest('invite_codes', 'code_hash')],
    ['operations', tableDigest('operations', 'id')]
  ])

  let migrated = false
  if (!tableExists('children')) {
    database.exec(readFileSync(new URL('../migrations/002_children_v4.sql', import.meta.url), 'utf8'))
    migrated = true
  }

  const protectedAfter = Object.fromEntries([
    ['families', tableDigest('families', 'id')],
    ['devices', tableDigest('devices', 'id')],
    ['invite_codes', tableDigest('invite_codes', 'code_hash')],
    ['operations', tableDigest('operations', 'id')]
  ])
  if (JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfter)) {
    throw new Error('Migration changed a protected legacy table.')
  }

  const migratedSessions = rows(`SELECT id, family_id, start_time, end_time, note,
    created_at, updated_at, deleted_at, revision FROM sleep_sessions ORDER BY id`)
  if (digest(legacySessions) !== digest(migratedSessions)) {
    throw new Error('Migration changed legacy sleep values.')
  }
  const invalidLinks = database.prepare(`SELECT COUNT(*) AS count FROM sleep_sessions s
    LEFT JOIN children c ON c.family_id = s.family_id AND c.id = s.child_id
    WHERE c.id IS NULL`).get().count
  const foreignKeyErrors = rows('PRAGMA foreign_key_check')
  if (invalidLinks !== 0 || foreignKeyErrors.length !== 0) {
    throw new Error(`V4 relationship validation failed: links=${invalidLinks}, foreignKeys=${foreignKeyErrors.length}`)
  }

  const families = rows('SELECT id, name FROM families WHERE name = ?', familyName)
  if (families.length !== 1) throw new Error(`Expected one family named ${familyName}, found ${families.length}.`)
  const family = families[0]
  const children = rows(`SELECT id, name, birth_date, created_at, updated_at
    FROM children WHERE family_id = ? AND deleted_at IS NULL ORDER BY created_at, id`, family.id)
  if (children.length === 0) throw new Error('The selected family has no active child after migration.')
  const sessions = rows(`SELECT id, child_id, start_time, end_time, note, day_night_override,
    created_at, updated_at FROM sleep_sessions
    WHERE family_id = ? AND deleted_at IS NULL ORDER BY start_time DESC, id`, family.id)

  const exportedAt = new Date().toISOString()
  const backup = {
    format: 'solemi-sleep-backup',
    version: 4,
    exportedAt,
    data: {
      version: 4,
      settings: { locale: 'hu', activeChildId: children[0].id, longSleepReminderEnabled: false },
      children: children.map((child) => ({
        id: child.id, name: child.name, birthDate: child.birth_date,
        photoRef: null, createdAt: child.created_at, updatedAt: child.updated_at
      })),
      sessions: sessions.map((session) => ({
        id: session.id, childId: session.child_id, startTime: session.start_time,
        endTime: session.end_time, note: session.note,
        dayNightOverride: session.day_night_override,
        createdAt: session.created_at, updatedAt: session.updated_at
      }))
    }
  }
  writeFileSync(output, `${JSON.stringify(backup, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })

  process.stdout.write(`${JSON.stringify({
    source,
    output,
    migrated,
    familyName,
    databaseFamilies: rows('SELECT id FROM families').length,
    sourceSessions: legacySessions.length,
    activeFamilyChildren: children.length,
    activeFamilySessions: sessions.length,
    deletedFamilySessionsExcluded: database.prepare(`SELECT COUNT(*) AS count FROM sleep_sessions
      WHERE family_id = ? AND deleted_at IS NOT NULL`).get(family.id).count,
    foreignKeyErrors: foreignKeyErrors.length,
    protectedTableDigestsUnchanged: true,
    familyBackupSha256: digest(backup)
  }, null, 2)}\n`)
} finally {
  database.close()
}
