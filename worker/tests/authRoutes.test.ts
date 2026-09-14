import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import worker from '../src/index'
import { sqliteBinding } from './sqliteD1'

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const migrations = ['003_accounts_and_sessions.sql', '004_auth_challenges_and_refresh_history.sql']
  .map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')).join('\n')
const origin = 'https://solemi-sleep-internal.pages.dev'
let sqlite: DatabaseSync
let env: { DB: D1Database; TOKEN_PEPPER: string; ALLOWED_ORIGINS: string;
  GOOGLE_CLIENT_ID?: string; AUTH_SECRET?: string }

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(schema)
  sqlite.exec(migrations)
  env = { DB: sqliteBinding(sqlite), TOKEN_PEPPER: 'test-pepper', ALLOWED_ORIGINS: origin,
    GOOGLE_CLIENT_ID: 'solemi.apps.googleusercontent.com',
    AUTH_SECRET: 'test-secret-with-at-least-32-characters' }
})
afterEach(() => sqlite.close())

function fetch(path: string, init: RequestInit = {}) {
  return worker.fetch(new Request(`https://sync.example${path}`, init), env)
}

describe('account auth routes', () => {
  it('returns a stored one-use challenge and public client ID with credentialed CORS', async () => {
    const response = await fetch('/v1/auth/challenge', { headers: { Origin: origin } })
    const body = await response.json() as { data: { nonce: string; clientId: string } }
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(body.data.clientId).toBe(env.GOOGLE_CLIENT_ID)
    expect(body.data.nonce).toMatch(/^[a-f0-9]{64}$/)
    expect(sqlite.prepare('SELECT nonce_hash FROM auth_challenges').get()).not.toEqual({ nonce_hash: body.data.nonce })
  })

  it('keeps health available while account auth is not configured', async () => {
    delete env.GOOGLE_CLIENT_ID
    delete env.AUTH_SECRET
    expect((await fetch('/health')).status).toBe(200)
    const response = await fetch('/v1/auth/challenge')
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: 'AUTH_NOT_CONFIGURED' } })
  })

  it('rejects cross-origin cookie mutations and missing refresh cookies', async () => {
    const foreign = await fetch('/v1/auth/refresh', { method: 'POST', headers: { Origin: 'https://attacker.example' } })
    expect(foreign.status).toBe(403)
    expect(await foreign.json()).toMatchObject({ error: { code: 'ORIGIN_NOT_ALLOWED' } })
    const missing = await fetch('/v1/auth/refresh', { method: 'POST', headers: { Origin: origin } })
    expect(missing.status).toBe(401)
    expect(await missing.json()).toMatchObject({ error: { code: 'SESSION_INVALID' } })
  })

  it('advertises credential support only to allowed origins', async () => {
    const response = await fetch('/v1/auth/refresh', { method: 'OPTIONS', headers: { Origin: origin } })
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
  })
})
