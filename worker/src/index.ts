import { AuthError, AuthService, SESSION_MS } from './authService'
import { EntitlementService } from './entitlementService'
import type { TestPlan } from './entitlementService'

interface Env {
  DB: D1Database
  TOKEN_PEPPER: string
  ALLOWED_ORIGINS: string
  SOLEMI_ENVIRONMENT?: string
  GOOGLE_CLIENT_ID?: string
  AUTH_SECRET?: string
  ACCOUNT_FAMILY_BRIDGE?: string
  ENTITLEMENT_ENFORCEMENT?: string
  ENTITLEMENT_TEST_MODE?: string
  RECONCILIATION_CONFLICTS?: string
}

type DeviceAuth = {
  deviceId: string
  familyId: string
  familyName: string
  deviceName: string | null
  familyRevision: number
}

type SessionRow = {
  id: string
  family_id: string
  child_id: string
  start_time: string
  end_time: string | null
  note: string
  day_night_override: 'day' | 'night' | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  revision: number
}

type ChildRow = {
  id: string
  family_id: string
  name: string
  birth_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  revision: number
}

type OperationRow = {
  id: string
  family_id: string
  device_id: string
  operation_type: string
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = code,
    readonly data?: unknown
  ) {
    super(message)
  }
}

const encoder = new TextEncoder()
const MAX_JSON_BODY_BYTES = 64 * 1024
const INVITE_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const INVITE_TTL_MS = 30 * 60 * 1000

function assertWorkerEnvironment(env: Env) {
  if (env.SOLEMI_ENVIRONMENT !== 'production') return
  const validOrigins = env.ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean)
  if (env.ACCOUNT_FAMILY_BRIDGE !== 'true' || env.ENTITLEMENT_ENFORCEMENT !== 'true'
    || env.RECONCILIATION_CONFLICTS !== 'true' || env.ENTITLEMENT_TEST_MODE === 'true'
    || !env.GOOGLE_CLIENT_ID || !env.AUTH_SECRET || env.AUTH_SECRET.length < 32
    || !env.TOKEN_PEPPER || !validOrigins?.length
    || validOrigins.some((origin) => !origin.startsWith('https://')
      || /staging|internal|localhost|127\.0\.0\.1/i.test(origin))) {
    throw new ApiError(503, 'RELEASE_NOT_CONFIGURED', 'Production Worker configuration is incomplete.')
  }
}

function corsHeaders(request: Request, env: Env) {
  const origin = request.headers.get('Origin')
  const allowed = env.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  })

  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Solemi-Family-Token')
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    headers.set('Access-Control-Max-Age', '86400')
  }

  return headers
}

function json(request: Request, env: Env, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request, env)
  })
}

function ok(request: Request, env: Env, data: unknown, status = 200) {
  return json(request, env, { ok: true, data }, status)
}

function okWithCookie(request: Request, env: Env, data: unknown, cookie: string, status = 200) {
  const headers = corsHeaders(request, env)
  headers.append('Set-Cookie', cookie)
  return new Response(JSON.stringify({ ok: true, data }), { status, headers })
}

function fail(request: Request, env: Env, error: ApiError) {
  return json(request, env, {
    ok: false,
    error: { code: error.code, message: error.message },
    ...(error.data === undefined ? {} : { data: error.data })
  }, error.status)
}

function nowIso() {
  return new Date().toISOString()
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}

function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  let binary = ''
  for (const byte of buffer) binary += String.fromCharCode(byte)
  return `ss_dv_${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`
}

function randomInviteCode(length = 7) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => INVITE_CHARSET[value % INVITE_CHARSET.length]).join('')
}

async function hashSecret(secret: string, pepper: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${pepper}:${secret}`))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isBirthDate(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)))
}

function requireString(value: unknown, field: string, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new ApiError(400, 'INVALID_REQUEST', `Invalid ${field}.`)
  }
  return value.trim()
}

function childNameFrom(value: unknown) {
  // An unnamed profile is valid diary data (including the default profile
  // saved before a family import). Keep create and patch consistent with it.
  if (typeof value !== 'string' || value.length > 60) {
    throw new ApiError(400, 'INVALID_REQUEST', 'Invalid child.name.')
  }
  return value.trim()
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) throw new ApiError(400, 'INVALID_REQUEST', 'JSON body required.')
  const declaredLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw new ApiError(413, 'REQUEST_TOO_LARGE', 'JSON body is too large.')
  }
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400, 'INVALID_REQUEST', 'JSON body required.')
  const bytes = new Uint8Array(MAX_JSON_BODY_BYTES)
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (length + value.byteLength > MAX_JSON_BODY_BYTES) {
        await reader.cancel().catch(() => {})
        throw new ApiError(413, 'REQUEST_TOO_LARGE', 'JSON body is too large.')
      }
      bytes.set(value, length)
      length += value.byteLength
    }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    return value as Record<string, unknown>
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'INVALID_REQUEST', 'Invalid JSON body.')
  }
}

function sessionDto(row: SessionRow) {
  return {
    id: row.id,
    childId: row.child_id,
    startTime: row.start_time,
    endTime: row.end_time,
    note: row.note,
    dayNightOverride: row.day_night_override,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    revision: row.revision
  }
}

function childDto(row: ChildRow) {
  return {
    id: row.id,
    name: row.name,
    birthDate: row.birth_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    revision: row.revision
  }
}

async function getSession(env: Env, familyId: string, sessionId: string) {
  return env.DB.prepare(
    `SELECT id, family_id, child_id, start_time, end_time, note, day_night_override, created_at, updated_at, deleted_at, revision
     FROM sleep_sessions WHERE id = ? AND family_id = ?`
  ).bind(sessionId, familyId).first<SessionRow>()
}

async function getActiveSession(env: Env, familyId: string, childId: string) {
  return env.DB.prepare(
    `SELECT id, family_id, child_id, start_time, end_time, note, day_night_override, created_at, updated_at, deleted_at, revision
     FROM sleep_sessions
     WHERE family_id = ? AND child_id = ? AND end_time IS NULL AND deleted_at IS NULL
     LIMIT 1`
  ).bind(familyId, childId).first<SessionRow>()
}

async function getChild(env: Env, familyId: string, childId: string) {
  return env.DB.prepare(
    `SELECT id, family_id, name, birth_date, created_at, updated_at, deleted_at, revision
     FROM children WHERE id = ? AND family_id = ?`
  ).bind(childId, familyId).first<ChildRow>()
}

function legacyChildId(familyId: string) {
  return `child_legacy_${familyId}`
}

async function requireActiveChild(env: Env, familyId: string, childId: string) {
  const child = await getChild(env, familyId, childId)
  if (!child) throw new ApiError(404, 'CHILD_NOT_FOUND', 'Child profile not found.')
  if (child.deleted_at) throw new ApiError(409, 'CHILD_DELETED', 'Child profile was deleted.')
  return child
}

async function authenticate(request: Request, env: Env): Promise<DeviceAuth> {
  const familyToken = request.headers.get('X-Solemi-Family-Token')
  const authorization = familyToken ? `Bearer ${familyToken}` : request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new ApiError(401, 'INVALID_DEVICE_TOKEN', 'Device token required.')

  const token = authorization.slice(7).trim()
  if (!token) throw new ApiError(401, 'INVALID_DEVICE_TOKEN', 'Device token required.')
  const tokenHash = await hashSecret(token, env.TOKEN_PEPPER)

  const row = await env.DB.prepare(
    `SELECT d.id AS device_id, d.family_id, d.name, d.revoked_at, f.name AS family_name, f.revision
     FROM devices d
     JOIN families f ON f.id = d.family_id
     WHERE d.token_hash = ?`
  ).bind(tokenHash).first<{
    device_id: string
    family_id: string
    family_name: string
    name: string | null
    revoked_at: string | null
    revision: number
  }>()

  if (!row) throw new ApiError(401, 'INVALID_DEVICE_TOKEN', 'Invalid device token.')
  if (row.revoked_at) throw new ApiError(403, 'DEVICE_REVOKED', 'This device has been revoked.')

  await env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(nowIso(), row.device_id).run()

  return {
    deviceId: row.device_id,
    familyId: row.family_id,
    familyName: row.family_name,
    deviceName: row.name,
    familyRevision: row.revision
  }
}

async function existingOperation(env: Env, operationId: string, auth: DeviceAuth, expectedType: string) {
  const row = await env.DB.prepare(
    `SELECT id, family_id, device_id, operation_type FROM operations WHERE id = ?`
  ).bind(operationId).first<OperationRow>()

  if (!row) return false
  if (row.family_id !== auth.familyId || row.device_id !== auth.deviceId || row.operation_type !== expectedType) {
    throw new ApiError(409, 'OPERATION_ID_REUSED', 'Operation ID was already used for another operation.')
  }
  return true
}

function operationIdFrom(body: Record<string, unknown>) {
  return requireString(body.operationId, 'operationId', 100)
}

function baseRevisionFrom(body: Record<string, unknown>, env: Env) {
  if (env.RECONCILIATION_CONFLICTS !== 'true') return null
  const value = body.baseRevision
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ApiError(400, 'INVALID_BASE_REVISION', 'A non-negative baseRevision is required.')
  }
  return value as number
}

function requireCurrentSessionVersion(env: Env, body: Record<string, unknown>, current: SessionRow) {
  const baseRevision = baseRevisionFrom(body, env)
  if (baseRevision !== null && current.revision > baseRevision) {
    throw new ApiError(409, 'SYNC_CONFLICT', 'This sleep changed on another device.', {
      conflict: {
        entityType: 'SESSION',
        entityId: current.id,
        baseRevision,
        serverRevision: current.revision,
        serverValue: sessionDto(current)
      }
    })
  }
  return baseRevision
}

function insertSessionOperation(
  env: Env, auth: DeviceAuth, operationId: string, operationType: string,
  at: string, sessionId: string, baseRevision: number | null
) {
  if (baseRevision === null) {
    return env.DB.prepare('INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(operationId, auth.familyId, auth.deviceId, operationType, at)
  }
  return env.DB.prepare(`INSERT INTO operations (id, family_id, device_id, operation_type, created_at)
    SELECT ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM sleep_sessions
      WHERE id = ? AND family_id = ? AND revision <= ?
    )`).bind(operationId, auth.familyId, auth.deviceId, operationType, at,
      sessionId, auth.familyId, baseRevision)
}

function advanceFamilyForOperation(env: Env, auth: DeviceAuth, operationId: string) {
  return env.DB.prepare(`UPDATE families SET revision = revision + 1
    WHERE id = ? AND EXISTS (SELECT 1 FROM operations WHERE id = ? AND family_id = ?)`)
    .bind(auth.familyId, operationId, auth.familyId)
}

async function throwLatestSessionConflict(
  env: Env, auth: DeviceAuth, body: Record<string, unknown>, sessionId: string
) {
  const latest = await getSession(env, auth.familyId, sessionId)
  if (!latest) throw new ApiError(404, 'SESSION_NOT_FOUND')
  requireCurrentSessionVersion(env, body, latest)
  throw new ApiError(409, 'SYNC_CONFLICT', 'The sleep changed while saving.')
}

async function currentRevision(env: Env, familyId: string) {
  const row = await env.DB.prepare('SELECT revision FROM families WHERE id = ?').bind(familyId).first<{ revision: number }>()
  if (!row) throw new ApiError(404, 'FAMILY_NOT_FOUND')
  return row.revision
}

async function createFamily(request: Request, env: Env) {
  const body = await readJson(request)
  const familyName = requireString(body.familyName, 'familyName', 60)
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim().slice(0, 80) : null
  const familyId = newId('fam')
  const childId = typeof body.childId === 'string' && body.childId.trim() ? body.childId.trim().slice(0, 100) : legacyChildId(familyId)
  const childName = typeof body.childName === 'string' ? body.childName.trim().slice(0, 60) : ''
  const birthDate = body.birthDate === undefined ? null : body.birthDate
  if (!isBirthDate(birthDate)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid birthDate.')
  const deviceId = newId('dev')
  const token = randomToken()
  const tokenHash = await hashSecret(token, env.TOKEN_PEPPER)
  const createdAt = nowIso()

  await env.DB.batch([
    env.DB.prepare('INSERT INTO families (id, name, revision, created_at) VALUES (?, ?, 0, ?)').bind(familyId, familyName, createdAt),
    env.DB.prepare(
      `INSERT INTO children (id, family_id, name, birth_date, created_at, updated_at, deleted_at, revision)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0)`
    ).bind(childId, familyId, childName, birthDate, createdAt, createdAt),
    env.DB.prepare(
      `INSERT INTO devices (id, family_id, token_hash, name, created_at, last_seen_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`
    ).bind(deviceId, familyId, tokenHash, deviceName, createdAt, createdAt)
  ])

  return ok(request, env, {
    familyId,
    familyName,
    child: { id: childId, name: childName, birthDate },
    device: { id: deviceId, name: deviceName },
    deviceToken: token,
    revision: 0
  }, 201)
}

async function createInvite(request: Request, env: Env, auth: DeviceAuth) {
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomInviteCode()
    const codeHash = await hashSecret(code, env.TOKEN_PEPPER)
    try {
      await env.DB.prepare(
        `INSERT INTO invite_codes (code_hash, family_id, created_by_device_id, created_at, expires_at, used_at)
         VALUES (?, ?, ?, ?, ?, NULL)`
      ).bind(codeHash, auth.familyId, auth.deviceId, createdAt, expiresAt).run()
      return ok(request, env, { code, expiresAt }, 201)
    } catch {
      // Extremely unlikely code collision: generate another code.
    }
  }

  throw new ApiError(500, 'INVITE_CREATE_FAILED', 'Could not create invite code.')
}

async function joinFamily(request: Request, env: Env) {
  const body = await readJson(request)
  const code = requireString(body.code, 'code', 20).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim().slice(0, 80) : null
  const codeHash = await hashSecret(code, env.TOKEN_PEPPER)
  const invite = await env.DB.prepare(
    `SELECT i.family_id, i.expires_at, i.used_at, f.name AS family_name
     FROM invite_codes i
     JOIN families f ON f.id = i.family_id
     WHERE i.code_hash = ?`
  ).bind(codeHash).first<{ family_id: string; family_name: string; expires_at: string; used_at: string | null }>()

  if (!invite) throw new ApiError(404, 'INVITE_NOT_FOUND', 'Invite code not found.')
  if (invite.used_at) throw new ApiError(409, 'INVITE_ALREADY_USED', 'Invite code has already been used.')
  if (Date.parse(invite.expires_at) <= Date.now()) throw new ApiError(410, 'INVITE_EXPIRED', 'Invite code has expired.')

  const deviceId = newId('dev')
  const token = randomToken()
  const tokenHash = await hashSecret(token, env.TOKEN_PEPPER)
  const joinedAt = nowIso()

  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO devices (id, family_id, token_hash, name, created_at, last_seen_at, revoked_at)
       SELECT ?, family_id, ?, ?, ?, ?, NULL
       FROM invite_codes
       WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`
    ).bind(deviceId, tokenHash, deviceName, joinedAt, joinedAt, codeHash, joinedAt),
    env.DB.prepare(
      `UPDATE invite_codes SET used_at = ?
       WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
         AND EXISTS (SELECT 1 FROM devices WHERE id = ?)`
    ).bind(joinedAt, codeHash, joinedAt, deviceId)
  ])

  const inserted = Number(results[0]?.meta?.changes ?? 0) > 0
  if (!inserted) throw new ApiError(409, 'INVITE_ALREADY_USED', 'Invite code is no longer available.')

  const revision = await currentRevision(env, invite.family_id)
  return ok(request, env, {
    familyId: invite.family_id,
    familyName: invite.family_name,
    device: { id: deviceId, name: deviceName },
    deviceToken: token,
    revision
  }, 201)
}

async function sync(request: Request, env: Env, auth: DeviceAuth) {
  const url = new URL(request.url)
  const afterRaw = url.searchParams.get('after') ?? '0'
  const after = Number(afterRaw)
  if (!Number.isInteger(after) || after < 0) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid revision.')

  const [family, children, sessions] = await Promise.all([
    env.DB.prepare('SELECT name, revision FROM families WHERE id = ?').bind(auth.familyId).first<{ name: string; revision: number }>(),
    env.DB.prepare(
      `SELECT id, family_id, name, birth_date, created_at, updated_at, deleted_at, revision
       FROM children WHERE family_id = ? ORDER BY created_at ASC`
    ).bind(auth.familyId).all<ChildRow>(),
    env.DB.prepare(
      `SELECT id, family_id, child_id, start_time, end_time, note, day_night_override, created_at, updated_at, deleted_at, revision
       FROM sleep_sessions
       WHERE family_id = ? AND revision > ?
       ORDER BY revision ASC`
    ).bind(auth.familyId, after).all<SessionRow>()
  ])

  return ok(request, env, {
    familyName: family?.name ?? auth.familyName,
    revision: family?.revision ?? auth.familyRevision,
    children: children.results.map(childDto),
    sessions: sessions.results.map(sessionDto)
  })
}

async function getDevice(request: Request, env: Env, auth: DeviceAuth) {
  const revision = await currentRevision(env, auth.familyId)
  return ok(request, env, {
    id: auth.deviceId,
    name: auth.deviceName,
    familyId: auth.familyId,
    familyName: auth.familyName,
    revision
  })
}

async function leaveDevice(request: Request, env: Env, auth: DeviceAuth) {
  const at = nowIso()
  await env.DB.prepare('UPDATE devices SET revoked_at = ?, last_seen_at = ? WHERE id = ? AND family_id = ?')
    .bind(at, at, auth.deviceId, auth.familyId).run()
  return ok(request, env, { revoked: true })
}

async function createChildProfile(request: Request, env: Env, auth: DeviceAuth) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  const value = body.child
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid child.')
  const input = value as Record<string, unknown>
  const childId = requireString(input.id, 'child.id', 100)
  const name = childNameFrom(input.name)
  const birthDate = input.birthDate === undefined ? null : input.birthDate
  if (!isBirthDate(birthDate)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid child.birthDate.')

  if (await existingOperation(env, operationId, auth, 'CREATE_CHILD')) {
    const existing = await getChild(env, auth.familyId, childId)
    if (existing) return ok(request, env, { revision: await currentRevision(env, auth.familyId), child: childDto(existing), idempotent: true })
  }

  const at = nowIso()
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(operationId, auth.familyId, auth.deviceId, 'CREATE_CHILD', at),
      env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?').bind(auth.familyId),
      env.DB.prepare(
        `INSERT INTO children (id, family_id, name, birth_date, created_at, updated_at, deleted_at, revision)
         VALUES (?, ?, ?, ?, ?, ?, NULL, (SELECT revision FROM families WHERE id = ?))`
      ).bind(childId, auth.familyId, name, birthDate, at, at, auth.familyId)
    ])
  } catch {
    throw new ApiError(409, 'CHILD_CREATE_CONFLICT', 'Child profile ID already exists.')
  }

  const child = await getChild(env, auth.familyId, childId)
  if (!child) throw new ApiError(500, 'INTERNAL_ERROR')
  return ok(request, env, { revision: child.revision, child: childDto(child) }, 201)
}

async function patchChildProfile(request: Request, env: Env, auth: DeviceAuth, childId: string) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  const value = body.patch
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid patch.')
  const patch = value as Record<string, unknown>
  const keys = Object.keys(patch)
  if (!keys.length || keys.some((key) => !['name', 'birthDate'].includes(key))) throw new ApiError(400, 'INVALID_REQUEST', 'Unsupported patch fields.')
  const current = await requireActiveChild(env, auth.familyId, childId)
  const name = 'name' in patch ? childNameFrom(patch.name) : current.name
  const birthDate = 'birthDate' in patch ? patch.birthDate : current.birth_date
  if (!isBirthDate(birthDate)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid birthDate.')

  if (await existingOperation(env, operationId, auth, 'PATCH_CHILD')) {
    const existing = await getChild(env, auth.familyId, childId)
    return ok(request, env, { revision: await currentRevision(env, auth.familyId), child: existing ? childDto(existing) : null, idempotent: true })
  }

  const at = nowIso()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(operationId, auth.familyId, auth.deviceId, 'PATCH_CHILD', at),
    env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?').bind(auth.familyId),
    env.DB.prepare(
      `UPDATE children SET name = ?, birth_date = ?, updated_at = ?, revision = (SELECT revision FROM families WHERE id = ?)
       WHERE id = ? AND family_id = ? AND deleted_at IS NULL`
    ).bind(name, birthDate, at, auth.familyId, childId, auth.familyId)
  ])

  const child = await getChild(env, auth.familyId, childId)
  if (!child) throw new ApiError(404, 'CHILD_NOT_FOUND')
  return ok(request, env, { revision: child.revision, child: childDto(child) })
}

async function deleteChildProfile(request: Request, env: Env, auth: DeviceAuth, childId: string) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  const current = await getChild(env, auth.familyId, childId)
  if (!current) throw new ApiError(404, 'CHILD_NOT_FOUND')
  if (current.deleted_at) return ok(request, env, { revision: await currentRevision(env, auth.familyId), child: childDto(current), alreadyDeleted: true })

  if (await existingOperation(env, operationId, auth, 'DELETE_CHILD')) {
    const existing = await getChild(env, auth.familyId, childId)
    return ok(request, env, { revision: await currentRevision(env, auth.familyId), child: existing ? childDto(existing) : null, idempotent: true })
  }

  const at = nowIso()
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO operations (id, family_id, device_id, operation_type, created_at)
      SELECT ?, ?, ?, 'DELETE_CHILD', ?
      WHERE EXISTS (
        SELECT 1 FROM children WHERE id = ? AND family_id = ? AND deleted_at IS NULL
      ) AND (
        SELECT COUNT(*) FROM children WHERE family_id = ? AND deleted_at IS NULL
      ) > 1`)
      .bind(operationId, auth.familyId, auth.deviceId, at, childId, auth.familyId, auth.familyId),
    advanceFamilyForOperation(env, auth, operationId),
    env.DB.prepare(
      `UPDATE children
       SET deleted_at = ?, updated_at = ?, revision = (SELECT revision FROM families WHERE id = ?)
       WHERE id = ? AND family_id = ? AND deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM operations WHERE id = ? AND family_id = ?)`
    ).bind(at, at, auth.familyId, childId, auth.familyId, operationId, auth.familyId),
    env.DB.prepare(
      `UPDATE sleep_sessions
       SET deleted_at = ?, updated_at = ?, revision = (SELECT revision FROM families WHERE id = ?)
       WHERE child_id = ? AND family_id = ? AND deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM operations WHERE id = ? AND family_id = ?)`
    ).bind(at, at, auth.familyId, childId, auth.familyId, operationId, auth.familyId)
  ])

  if (results[0].meta.changes !== 1) {
    const latest = await getChild(env, auth.familyId, childId)
    if (latest?.deleted_at) return ok(request, env, {
      revision: await currentRevision(env, auth.familyId), child: childDto(latest), alreadyDeleted: true
    })
    throw new ApiError(409, 'LAST_CHILD', 'The final child profile cannot be deleted.')
  }

  const deleted = await getChild(env, auth.familyId, childId)
  if (!deleted) throw new ApiError(404, 'CHILD_NOT_FOUND')
  return ok(request, env, { revision: await currentRevision(env, auth.familyId), child: childDto(deleted) })
}

async function startSleep(request: Request, env: Env, auth: DeviceAuth) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  const sessionId = requireString(body.sessionId, 'sessionId', 100)
  const childId = typeof body.childId === 'string' && body.childId.trim() ? requireString(body.childId, 'childId', 100) : legacyChildId(auth.familyId)
  await requireActiveChild(env, auth.familyId, childId)
  if (!isIsoDate(body.startTime)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid startTime.')
  const startTime = body.startTime
  const note = typeof body.note === 'string' ? body.note.slice(0, 2000) : ''
  const dayNightOverride = body.dayNightOverride === 'day' || body.dayNightOverride === 'night' ? body.dayNightOverride : null
  if (Date.parse(startTime) > Date.now() + 60_000) throw new ApiError(400, 'FUTURE_TIME', 'Future start time is not allowed.')

  if (await existingOperation(env, operationId, auth, 'START_SLEEP')) {
    const existing = await getSession(env, auth.familyId, sessionId)
    if (existing) return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(existing), idempotent: true })
  }

  const active = await getActiveSession(env, auth.familyId, childId)
  if (active) throw new ApiError(409, 'ACTIVE_SLEEP_EXISTS', 'An active sleep session already exists.', {
    revision: await currentRevision(env, auth.familyId),
    activeSession: sessionDto(active)
  })

  const at = nowIso()
  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(operationId, auth.familyId, auth.deviceId, 'START_SLEEP', at),
      env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?').bind(auth.familyId),
      env.DB.prepare(
        `INSERT INTO sleep_sessions
         (id, family_id, child_id, start_time, end_time, note, day_night_override, created_at, updated_at, deleted_at, revision)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, (SELECT revision FROM families WHERE id = ?))`
      ).bind(sessionId, auth.familyId, childId, startTime, note, dayNightOverride, at, at, auth.familyId)
    ])
  } catch {
    const authoritative = await getActiveSession(env, auth.familyId, childId)
    if (authoritative) throw new ApiError(409, 'ACTIVE_SLEEP_EXISTS', 'An active sleep session already exists.', {
      revision: await currentRevision(env, auth.familyId),
      activeSession: sessionDto(authoritative)
    })
    throw new ApiError(409, 'SESSION_CREATE_CONFLICT', 'Could not create sleep session.')
  }

  const session = await getSession(env, auth.familyId, sessionId)
  if (!session) throw new ApiError(500, 'INTERNAL_ERROR')
  return ok(request, env, { revision: session.revision, session: sessionDto(session) }, 201)
}

async function createCompletedSleep(request: Request, env: Env, auth: DeviceAuth) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  const value = body.session
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid session.')
  const input = value as Record<string, unknown>
  const sessionId = requireString(input.id, 'session.id', 100)
  const childId = typeof input.childId === 'string' && input.childId.trim() ? requireString(input.childId, 'session.childId', 100) : legacyChildId(auth.familyId)
  await requireActiveChild(env, auth.familyId, childId)
  if (!isIsoDate(input.startTime) || !isIsoDate(input.endTime)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid sleep times.')
  const startTime = input.startTime
  const endTime = input.endTime
  const note = typeof input.note === 'string' ? input.note.slice(0, 2000) : ''
  const dayNightOverride = input.dayNightOverride === 'day' || input.dayNightOverride === 'night' ? input.dayNightOverride : null
  if (Date.parse(endTime) <= Date.parse(startTime)) throw new ApiError(400, 'INVALID_TIME_RANGE', 'Wake time must be after sleep time.')
  if (Math.max(Date.parse(startTime), Date.parse(endTime)) > Date.now() + 60_000) throw new ApiError(400, 'FUTURE_TIME')

  if (await existingOperation(env, operationId, auth, 'CREATE_SLEEP')) {
    const existing = await getSession(env, auth.familyId, sessionId)
    if (existing) return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(existing), idempotent: true })
  }

  const at = nowIso()
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(operationId, auth.familyId, auth.deviceId, 'CREATE_SLEEP', at),
      env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?').bind(auth.familyId),
      env.DB.prepare(
        `INSERT INTO sleep_sessions
         (id, family_id, child_id, start_time, end_time, note, day_night_override, created_at, updated_at, deleted_at, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, (SELECT revision FROM families WHERE id = ?))`
      ).bind(sessionId, auth.familyId, childId, startTime, endTime, note, dayNightOverride, at, at, auth.familyId)
    ])
  } catch {
    throw new ApiError(409, 'SESSION_CREATE_CONFLICT', 'Session ID already exists.')
  }

  const session = await getSession(env, auth.familyId, sessionId)
  if (!session) throw new ApiError(500, 'INTERNAL_ERROR')
  return ok(request, env, { revision: session.revision, session: sessionDto(session) }, 201)
}

async function endSleep(request: Request, env: Env, auth: DeviceAuth, sessionId: string) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  if (!isIsoDate(body.endTime)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid endTime.')
  const endTime = body.endTime

  const existing = await getSession(env, auth.familyId, sessionId)
  if (!existing) throw new ApiError(404, 'SESSION_NOT_FOUND')

  if (await existingOperation(env, operationId, auth, 'END_SLEEP')) {
    const current = await getSession(env, auth.familyId, sessionId)
    return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: current ? sessionDto(current) : null, idempotent: true })
  }
  const baseRevision = requireCurrentSessionVersion(env, body, existing)
  if (existing.deleted_at) throw new ApiError(409, 'SESSION_DELETED')
  if (existing.end_time) return ok(request, env, {
    revision: await currentRevision(env, auth.familyId),
    session: sessionDto(existing),
    alreadyEnded: true
  })
  if (Date.parse(endTime) <= Date.parse(existing.start_time)) throw new ApiError(400, 'INVALID_TIME_RANGE')
  if (Date.parse(endTime) > Date.now() + 60_000) throw new ApiError(400, 'FUTURE_TIME')

  const at = nowIso()
  const results = await env.DB.batch([
    insertSessionOperation(env, auth, operationId, 'END_SLEEP', at, sessionId, baseRevision),
    advanceFamilyForOperation(env, auth, operationId),
    env.DB.prepare(
      `UPDATE sleep_sessions
       SET end_time = ?, updated_at = ?, revision = (SELECT revision FROM families WHERE id = ?)
       WHERE id = ? AND family_id = ? AND end_time IS NULL AND deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM operations WHERE id = ? AND family_id = ?)`
    ).bind(endTime, at, auth.familyId, sessionId, auth.familyId, operationId, auth.familyId)
  ])
  if (baseRevision !== null && results[0].meta.changes !== 1) {
    await throwLatestSessionConflict(env, auth, body, sessionId)
  }

  const current = await getSession(env, auth.familyId, sessionId)
  if (!current) throw new ApiError(404, 'SESSION_NOT_FOUND')
  return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(current) })
}

async function patchSleep(request: Request, env: Env, auth: DeviceAuth, sessionId: string) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  const patchValue = body.patch
  if (!patchValue || typeof patchValue !== 'object' || Array.isArray(patchValue)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid patch.')
  const patch = patchValue as Record<string, unknown>
  const allowed = ['startTime', 'endTime', 'note', 'dayNightOverride']
  const keys = Object.keys(patch)
  if (!keys.length || keys.some((key) => !allowed.includes(key))) throw new ApiError(400, 'INVALID_REQUEST', 'Unsupported patch fields.')

  const current = await getSession(env, auth.familyId, sessionId)
  if (!current) throw new ApiError(404, 'SESSION_NOT_FOUND')

  if (await existingOperation(env, operationId, auth, 'PATCH_SLEEP')) {
    const existing = await getSession(env, auth.familyId, sessionId)
    return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: existing ? sessionDto(existing) : null, idempotent: true })
  }
  const baseRevision = requireCurrentSessionVersion(env, body, current)
  if (current.deleted_at) throw new ApiError(409, 'SESSION_DELETED')

  if (current.end_time === null && 'endTime' in patch) throw new ApiError(409, 'INVALID_SESSION_STATE', 'Use the end endpoint for an active sleep.')

  const nextStart = 'startTime' in patch ? patch.startTime : current.start_time
  const nextEnd = 'endTime' in patch ? patch.endTime : current.end_time
  if (!isIsoDate(nextStart)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid startTime.')
  if (nextEnd !== null && !isIsoDate(nextEnd)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid endTime.')
  if (nextEnd && Date.parse(nextEnd) <= Date.parse(nextStart)) throw new ApiError(400, 'INVALID_TIME_RANGE')
  if (Math.max(Date.parse(nextStart), nextEnd ? Date.parse(nextEnd) : 0) > Date.now() + 60_000) throw new ApiError(400, 'FUTURE_TIME')
  if ('note' in patch && typeof patch.note !== 'string') throw new ApiError(400, 'INVALID_REQUEST', 'Invalid note.')
  if ('dayNightOverride' in patch && patch.dayNightOverride !== null && patch.dayNightOverride !== 'day' && patch.dayNightOverride !== 'night') throw new ApiError(400, 'INVALID_REQUEST', 'Invalid dayNightOverride.')

  const assignments: string[] = []
  const params: unknown[] = []
  if ('startTime' in patch) { assignments.push('start_time = ?'); params.push(nextStart) }
  if ('endTime' in patch) { assignments.push('end_time = ?'); params.push(nextEnd) }
  if ('note' in patch) { assignments.push('note = ?'); params.push((patch.note as string).slice(0, 2000)) }
  if ('dayNightOverride' in patch) { assignments.push('day_night_override = ?'); params.push(patch.dayNightOverride) }
  const at = nowIso()
  assignments.push('updated_at = ?'); params.push(at)
  assignments.push('revision = (SELECT revision FROM families WHERE id = ?)'); params.push(auth.familyId)
  params.push(sessionId, auth.familyId, operationId, auth.familyId)

  const results = await env.DB.batch([
    insertSessionOperation(env, auth, operationId, 'PATCH_SLEEP', at, sessionId, baseRevision),
    advanceFamilyForOperation(env, auth, operationId),
    env.DB.prepare(
      `UPDATE sleep_sessions SET ${assignments.join(', ')}
       WHERE id = ? AND family_id = ? AND deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM operations WHERE id = ? AND family_id = ?)`
    ).bind(...params as D1PreparedStatementParameters)
  ])
  if (baseRevision !== null && results[0].meta.changes !== 1) {
    await throwLatestSessionConflict(env, auth, body, sessionId)
  }

  const updated = await getSession(env, auth.familyId, sessionId)
  if (!updated || updated.deleted_at) throw new ApiError(409, 'SESSION_DELETED')
  return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(updated) })
}

async function deleteSleep(request: Request, env: Env, auth: DeviceAuth, sessionId: string) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  const current = await getSession(env, auth.familyId, sessionId)
  if (!current) throw new ApiError(404, 'SESSION_NOT_FOUND')

  if (await existingOperation(env, operationId, auth, 'DELETE_SLEEP')) {
    const existing = await getSession(env, auth.familyId, sessionId)
    return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: existing ? sessionDto(existing) : null, idempotent: true })
  }
  const baseRevision = requireCurrentSessionVersion(env, body, current)
  if (current.deleted_at) return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(current), alreadyDeleted: true })

  const at = nowIso()
  const results = await env.DB.batch([
    insertSessionOperation(env, auth, operationId, 'DELETE_SLEEP', at, sessionId, baseRevision),
    advanceFamilyForOperation(env, auth, operationId),
    env.DB.prepare(
      `UPDATE sleep_sessions
       SET deleted_at = ?, updated_at = ?, revision = (SELECT revision FROM families WHERE id = ?)
       WHERE id = ? AND family_id = ? AND deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM operations WHERE id = ? AND family_id = ?)`
    ).bind(at, at, auth.familyId, sessionId, auth.familyId, operationId, auth.familyId)
  ])
  if (baseRevision !== null && results[0].meta.changes !== 1) {
    await throwLatestSessionConflict(env, auth, body, sessionId)
  }

  const deleted = await getSession(env, auth.familyId, sessionId)
  if (!deleted) throw new ApiError(404, 'SESSION_NOT_FOUND')
  return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(deleted) })
}

async function createAccountFamily(request: Request, env: Env, access: AccountAccess) {
  const service = entitlementService(env)
  if (env.ENTITLEMENT_ENFORCEMENT === 'true'
    && !(await service.accountFeatures(access.account.id)).includes('FAMILY_SYNC')) {
    throw new ApiError(403, 'FAMILY_SYNC_SUBSCRIPTION_REQUIRED')
  }
  const existingMembership = await service.activeMembership(access.account.id)
  if (existingMembership) throw new ApiError(409, 'ACCOUNT_ALREADY_IN_FAMILY')
  const staleMappingCleanup = await reusableAccountDeviceMapping(env, access)

  const body = await readJson(request)
  const familyName = requireString(body.familyName, 'familyName', 60)
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim().slice(0, 80) : null
  const familyId = newId('fam')
  const childId = typeof body.childId === 'string' && body.childId.trim()
    ? body.childId.trim().slice(0, 100) : legacyChildId(familyId)
  const childName = typeof body.childName === 'string' ? body.childName.trim().slice(0, 60) : ''
  const birthDate = body.birthDate === undefined ? null : body.birthDate
  if (!isBirthDate(birthDate)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid birthDate.')
  const deviceId = newId('dev')
  const membershipId = newId('mem')
  const token = randomToken()
  const tokenHash = await hashSecret(token, env.TOKEN_PEPPER)
  const now = Date.now()
  const createdAt = nowIso()

  await env.DB.batch([
    ...(staleMappingCleanup ? [staleMappingCleanup] : []),
    env.DB.prepare('INSERT INTO families (id, name, revision, created_at) VALUES (?, ?, 0, ?)')
      .bind(familyId, familyName, createdAt),
    env.DB.prepare(`INSERT INTO children
      (id, family_id, name, birth_date, created_at, updated_at, deleted_at, revision)
      VALUES (?, ?, ?, ?, ?, ?, NULL, 0)`)
      .bind(childId, familyId, childName, birthDate, createdAt, createdAt),
    env.DB.prepare(`INSERT INTO devices
      (id, family_id, token_hash, name, created_at, last_seen_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)`)
      .bind(deviceId, familyId, tokenHash, deviceName, createdAt, createdAt),
    env.DB.prepare(`INSERT INTO legacy_family_memberships
      (id, family_id, account_id, role, status, joined_at, ended_at)
      VALUES (?, ?, ?, 'ADMIN', 'ACTIVE', ?, NULL)`)
      .bind(membershipId, familyId, access.account.id, now),
    env.DB.prepare(`INSERT INTO account_family_devices
      (account_device_id, account_id, family_id, legacy_device_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(access.deviceId, access.account.id, familyId, deviceId, now, now)
  ])

  return ok(request, env, {
    membership: { familyId, familyName, role: 'ADMIN' as const },
    connection: { familyId, familyName, deviceId, deviceToken: token, revision: 0 },
    child: { id: childId, name: childName, birthDate }
  }, 201)
}

async function reusableAccountDeviceMapping(env: Env, access: AccountAccess) {
  const mapping = await env.DB.prepare(`SELECT afd.family_id, d.revoked_at,
      EXISTS (SELECT 1 FROM legacy_family_memberships m
        WHERE m.family_id = afd.family_id AND m.account_id = afd.account_id
          AND m.status = 'ACTIVE') AS active_membership
    FROM account_family_devices afd JOIN devices d ON d.id = afd.legacy_device_id
    WHERE afd.account_device_id = ? AND afd.account_id = ?`)
    .bind(access.deviceId, access.account.id)
    .first<{ family_id: string; revoked_at: string | null; active_membership: number }>()
  if (!mapping) return null
  if (!mapping.revoked_at || mapping.active_membership) {
    throw new ApiError(409, 'ACCOUNT_DEVICE_ALREADY_LINKED')
  }
  // Older leave operations left this row behind. Reuse only a device whose old
  // family token was revoked and whose account membership is no longer active.
  return env.DB.prepare(`DELETE FROM account_family_devices
    WHERE account_device_id = ? AND account_id = ? AND family_id = ?
      AND EXISTS (SELECT 1 FROM devices d
        WHERE d.id = account_family_devices.legacy_device_id AND d.revoked_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM legacy_family_memberships m
        WHERE m.family_id = account_family_devices.family_id
          AND m.account_id = account_family_devices.account_id AND m.status = 'ACTIVE')`)
    .bind(access.deviceId, access.account.id, mapping.family_id)
}

const REFRESH_COOKIE = 'solemi_refresh'

function accountAuth(env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'Account sign-in is not configured.')
  }
  return new AuthService(env.DB, { clientId: env.GOOGLE_CLIENT_ID, secret: env.AUTH_SECRET })
}

function requireAllowedAuthOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin')
  const allowed = env.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)
  if (!origin || !allowed.includes(origin)) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED')
}

function cookieValue(request: Request, name: string) {
  const prefix = `${name}=`
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const value = part.trim()
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length))
  }
  return null
}

function refreshCookie(token: string, maxAgeSeconds: number) {
  return `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/v1/auth; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=None`
}

function accountBearer(request: Request) {
  const header = request.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'SESSION_INVALID')
  return header.slice(7).trim()
}

function requireAccountFamilyBridge(env: Env) {
  if (env.ACCOUNT_FAMILY_BRIDGE !== 'true') {
    throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.')
  }
}

type AccountAccess = Awaited<ReturnType<AuthService['authenticate']>>

function entitlementService(env: Env) {
  return new EntitlementService(env.DB)
}

async function requireFamilySyncEntitlement(request: Request, env: Env, auth: DeviceAuth) {
  if (env.ENTITLEMENT_ENFORCEMENT !== 'true') return
  const service = entitlementService(env)
  if (!request.headers.get('X-Solemi-Family-Token')) throw new ApiError(401, 'SESSION_INVALID')
  const access = await accountAuth(env).authenticate(accountBearer(request))
  const mapping = await env.DB.prepare(`SELECT 1 AS linked
    FROM account_family_devices afd
    JOIN legacy_family_memberships m
      ON m.account_id = afd.account_id AND m.family_id = afd.family_id AND m.status = 'ACTIVE'
    WHERE afd.account_device_id = ? AND afd.account_id = ? AND afd.family_id = ? AND afd.legacy_device_id = ?`)
    .bind(access.deviceId, access.account.id, auth.familyId, auth.deviceId)
    .first<{ linked: number }>()
  if (!mapping) throw new ApiError(403, 'FAMILY_MEMBERSHIP_REQUIRED')
  if (!await service.familyCanSync(auth.familyId)) {
    throw new ApiError(403, 'FAMILY_SYNC_PAUSED', 'Family Sync is paused.')
  }
}

async function legacyFamilyByToken(env: Env, token: string) {
  const tokenHash = await hashSecret(token, env.TOKEN_PEPPER)
  return env.DB.prepare(`SELECT d.id AS device_id, d.family_id, d.revoked_at,
      f.name AS family_name, f.revision
    FROM devices d JOIN families f ON f.id = d.family_id
    WHERE d.token_hash = ?`).bind(tokenHash).first<{
      device_id: string; family_id: string; family_name: string
      revision: number; revoked_at: string | null
    }>()
}

async function claimAccountFamily(request: Request, env: Env, access: AccountAccess) {
  const body = await readJson(request)
  const familyDeviceToken = requireString(body.familyDeviceToken, 'familyDeviceToken', 200)
  const legacy = await legacyFamilyByToken(env, familyDeviceToken)
  if (!legacy) throw new ApiError(401, 'INVALID_DEVICE_TOKEN', 'Invalid device token.')
  if (legacy.revoked_at) throw new ApiError(403, 'DEVICE_REVOKED', 'This device has been revoked.')

  const accountId = access.account.id
  const activeForAccount = await env.DB.prepare(`SELECT family_id, role FROM legacy_family_memberships
    WHERE account_id = ? AND status = 'ACTIVE'`).bind(accountId)
    .first<{ family_id: string; role: 'ADMIN' | 'MEMBER' }>()
  if (activeForAccount && activeForAccount.family_id !== legacy.family_id) {
    throw new ApiError(409, 'ACCOUNT_ALREADY_IN_FAMILY')
  }

  const activeForFamily = await env.DB.prepare(`SELECT account_id FROM legacy_family_memberships
    WHERE family_id = ? AND status = 'ACTIVE' LIMIT 1`).bind(legacy.family_id)
    .first<{ account_id: string }>()
  if (!activeForAccount && activeForFamily && activeForFamily.account_id !== accountId) {
    throw new ApiError(409, 'ACCOUNT_INVITE_REQUIRED')
  }

  const deviceMapping = await env.DB.prepare(`SELECT family_id, legacy_device_id
    FROM account_family_devices WHERE account_device_id = ?`)
    .bind(access.deviceId).first<{ family_id: string; legacy_device_id: string }>()
  if (deviceMapping && (deviceMapping.family_id !== legacy.family_id
    || deviceMapping.legacy_device_id !== legacy.device_id)) {
    throw new ApiError(409, 'ACCOUNT_DEVICE_ALREADY_LINKED')
  }
  const legacyMapping = await env.DB.prepare(`SELECT account_device_id, account_id
    FROM account_family_devices WHERE legacy_device_id = ?`)
    .bind(legacy.device_id).first<{ account_device_id: string; account_id: string }>()
  if (legacyMapping && (legacyMapping.account_device_id !== access.deviceId
    || legacyMapping.account_id !== accountId)) {
    throw new ApiError(409, 'FAMILY_DEVICE_ALREADY_CLAIMED')
  }

  const now = Date.now()
  const statements: D1PreparedStatement[] = []
  if (!activeForAccount) {
    statements.push(env.DB.prepare(`INSERT INTO legacy_family_memberships
      (id, family_id, account_id, role, status, joined_at, ended_at)
      VALUES (?, ?, ?, 'ADMIN', 'ACTIVE', ?, NULL)`)
      .bind(newId('mem'), legacy.family_id, accountId, now))
  }
  if (!deviceMapping) {
    statements.push(env.DB.prepare(`INSERT INTO account_family_devices
      (account_device_id, account_id, family_id, legacy_device_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(access.deviceId, accountId, legacy.family_id, legacy.device_id, now, now))
  }
  if (statements.length) await env.DB.batch(statements)

  return ok(request, env, { familyId: legacy.family_id, familyName: legacy.family_name,
    role: activeForAccount?.role ?? 'ADMIN' })
}

async function bootstrapAccountFamily(request: Request, env: Env, access: AccountAccess) {
  const body = await readJson(request)
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim().slice(0, 80) : null
  const membership = await env.DB.prepare(`SELECT m.family_id, m.role, f.name AS family_name, f.revision
    FROM legacy_family_memberships m JOIN families f ON f.id = m.family_id
    WHERE m.account_id = ? AND m.status = 'ACTIVE'`)
    .bind(access.account.id).first<{
      family_id: string; family_name: string; role: 'ADMIN' | 'MEMBER'; revision: number
    }>()
  if (!membership) return ok(request, env, { membership: null })

  const token = randomToken()
  const tokenHash = await hashSecret(token, env.TOKEN_PEPPER)
  const now = Date.now()
  const seenAt = nowIso()
  const mapped = await env.DB.prepare(`SELECT afd.legacy_device_id
    FROM account_family_devices afd
    WHERE afd.account_device_id = ? AND afd.account_id = ? AND afd.family_id = ?`)
    .bind(access.deviceId, access.account.id, membership.family_id)
    .first<{ legacy_device_id: string }>()

  let deviceId = mapped?.legacy_device_id
  if (deviceId) {
    const result = await env.DB.prepare(`UPDATE devices
      SET token_hash = ?, name = ?, last_seen_at = ?, revoked_at = NULL
      WHERE id = ? AND family_id = ?`).bind(tokenHash, deviceName, seenAt,
        deviceId, membership.family_id).run()
    if (result.meta.changes !== 1) throw new ApiError(409, 'FAMILY_DEVICE_UNAVAILABLE')
    await env.DB.prepare('UPDATE account_family_devices SET updated_at = ? WHERE account_device_id = ?')
      .bind(now, access.deviceId).run()
  } else {
    deviceId = newId('dev')
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO devices
        (id, family_id, token_hash, name, created_at, last_seen_at, revoked_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL)`)
        .bind(deviceId, membership.family_id, tokenHash, deviceName, seenAt, seenAt),
      env.DB.prepare(`INSERT INTO account_family_devices
        (account_device_id, account_id, family_id, legacy_device_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(access.deviceId, access.account.id, membership.family_id, deviceId, now, now)
    ])
  }

  return ok(request, env, {
    membership: { familyId: membership.family_id, familyName: membership.family_name, role: membership.role },
    connection: { familyId: membership.family_id, familyName: membership.family_name,
      deviceId, deviceToken: token, revision: 0 }
  })
}

async function joinAccountFamily(request: Request, env: Env, access: AccountAccess) {
  const body = await readJson(request)
  const code = requireString(body.code, 'code', 20).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim().slice(0, 80) : null
  const codeHash = await hashSecret(code, env.TOKEN_PEPPER)
  const invite = await env.DB.prepare(`SELECT i.family_id, i.expires_at, i.used_at, f.name AS family_name
    FROM invite_codes i JOIN families f ON f.id = i.family_id
    WHERE i.code_hash = ?`).bind(codeHash).first<{
      family_id: string; family_name: string; expires_at: string; used_at: string | null
    }>()
  if (!invite) throw new ApiError(404, 'INVITE_NOT_FOUND', 'Invite code not found.')
  if (invite.used_at) throw new ApiError(409, 'INVITE_ALREADY_USED', 'Invite code has already been used.')
  if (Date.parse(invite.expires_at) <= Date.now()) {
    throw new ApiError(410, 'INVITE_EXPIRED', 'Invite code has expired.')
  }

  const existingMembership = await env.DB.prepare(`SELECT family_id FROM legacy_family_memberships
    WHERE account_id = ? AND status = 'ACTIVE'`).bind(access.account.id)
    .first<{ family_id: string }>()
  if (existingMembership) {
    throw new ApiError(409, existingMembership.family_id === invite.family_id
      ? 'ACCOUNT_ALREADY_IN_FAMILY' : 'ACCOUNT_ALREADY_IN_OTHER_FAMILY')
  }
  const owner = await env.DB.prepare(`SELECT id FROM legacy_family_memberships
    WHERE family_id = ? AND role = 'ADMIN' AND status = 'ACTIVE' LIMIT 1`)
    .bind(invite.family_id).first<{ id: string }>()
  if (!owner) throw new ApiError(409, 'FAMILY_OWNER_ACCOUNT_REQUIRED')
  const staleMappingCleanup = await reusableAccountDeviceMapping(env, access)

  const membershipId = newId('mem')
  const deviceId = newId('dev')
  const token = randomToken()
  const tokenHash = await hashSecret(token, env.TOKEN_PEPPER)
  const now = Date.now()
  const joinedAt = nowIso()
  try {
    const results = await env.DB.batch([
      ...(staleMappingCleanup ? [staleMappingCleanup] : []),
      env.DB.prepare(`INSERT INTO legacy_family_memberships
        (id, family_id, account_id, role, status, joined_at, ended_at)
        SELECT ?, i.family_id, ?, 'MEMBER', 'ACTIVE', ?, NULL
        FROM invite_codes i
        WHERE i.code_hash = ? AND i.used_at IS NULL AND i.expires_at > ?`)
        .bind(membershipId, access.account.id, now, codeHash, joinedAt),
      env.DB.prepare(`INSERT INTO devices
        (id, family_id, token_hash, name, created_at, last_seen_at, revoked_at)
        SELECT ?, i.family_id, ?, ?, ?, ?, NULL
        FROM invite_codes i
        WHERE i.code_hash = ? AND i.used_at IS NULL AND i.expires_at > ?
          AND EXISTS (SELECT 1 FROM legacy_family_memberships WHERE id = ?)`)
        .bind(deviceId, tokenHash, deviceName, joinedAt, joinedAt, codeHash, joinedAt, membershipId),
      env.DB.prepare(`INSERT INTO account_family_devices
        (account_device_id, account_id, family_id, legacy_device_id, created_at, updated_at)
        SELECT ?, ?, i.family_id, ?, ?, ? FROM invite_codes i
        WHERE i.code_hash = ? AND i.used_at IS NULL AND i.expires_at > ?
          AND EXISTS (SELECT 1 FROM devices WHERE id = ?)`)
        .bind(access.deviceId, access.account.id, deviceId, now, now, codeHash, joinedAt, deviceId),
      env.DB.prepare(`UPDATE invite_codes SET used_at = ?
        WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
          AND EXISTS (SELECT 1 FROM account_family_devices WHERE account_device_id = ?)`)
        .bind(joinedAt, codeHash, joinedAt, access.deviceId)
    ])
    if (results[results.length - 1].meta.changes !== 1) throw new ApiError(409, 'INVITE_ALREADY_USED')
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new ApiError(409, 'INVITE_ALREADY_USED')
    }
    throw error
  }

  const revision = await currentRevision(env, invite.family_id)
  return ok(request, env, {
    membership: { familyId: invite.family_id, familyName: invite.family_name, role: 'MEMBER' },
    connection: { familyId: invite.family_id, familyName: invite.family_name,
      deviceId, deviceToken: token, revision: 0 },
    familyRevision: revision
  }, 201)
}

async function listAccountFamilyMembers(request: Request, env: Env, access: AccountAccess) {
  const membership = await env.DB.prepare(`SELECT family_id
    FROM legacy_family_memberships
    WHERE account_id = ? AND status = 'ACTIVE'`)
    .bind(access.account.id).first<{ family_id: string }>()
  if (!membership) throw new ApiError(403, 'FAMILY_MEMBERSHIP_REQUIRED')
  const result = await env.DB.prepare(`SELECT m.account_id, m.role, m.joined_at,
      a.display_name, a.email
    FROM legacy_family_memberships m
    JOIN accounts a ON a.id = m.account_id
    WHERE m.family_id = ? AND m.status = 'ACTIVE' AND m.account_id <> ?
    ORDER BY m.joined_at ASC, m.id ASC`)
    .bind(membership.family_id, access.account.id)
    .all<{ account_id: string; role: 'ADMIN' | 'MEMBER'; joined_at: number;
      display_name: string | null; email: string | null }>()
  return ok(request, env, { members: result.results.map((member) => ({
    accountId: member.account_id,
    role: member.role,
    joinedAt: member.joined_at,
    name: member.display_name,
    email: member.email
  })) })
}

async function leaveAccountFamily(request: Request, env: Env, access: AccountAccess) {
  const membership = await env.DB.prepare(`SELECT id, family_id, role
    FROM legacy_family_memberships
    WHERE account_id = ? AND status = 'ACTIVE'`)
    .bind(access.account.id).first<{ id: string; family_id: string; role: 'ADMIN' | 'MEMBER' }>()
  if (!membership) return ok(request, env, { left: false, membership: null })

  const successor = await env.DB.prepare(`SELECT id FROM legacy_family_memberships
    WHERE family_id = ? AND account_id <> ? AND status = 'ACTIVE'
    ORDER BY joined_at ASC, id ASC LIMIT 1`)
    .bind(membership.family_id, access.account.id).first<{ id: string }>()
  if (!successor) {
    throw new ApiError(409, 'FAMILY_DISSOLUTION_REQUIRED',
      'The final family member must use the family dissolution flow.')
  }

  const body = request.headers.get('Content-Type')?.includes('application/json')
    ? await readJson(request) : {}
  const requestedSuccessor = typeof body.successorAccountId === 'string'
    ? body.successorAccountId.trim() : ''
  if (requestedSuccessor) {
    const selected = await env.DB.prepare(`SELECT id FROM legacy_family_memberships
      WHERE family_id = ? AND account_id = ? AND account_id <> ? AND status = 'ACTIVE'`)
      .bind(membership.family_id, requestedSuccessor, access.account.id).first<{ id: string }>()
    if (!selected) throw new ApiError(409, 'FAMILY_SUCCESSOR_INVALID')
  }

  const now = Date.now()
  const endedAt = now
  const revokedAt = nowIso()
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`UPDATE legacy_family_memberships
      SET status = 'LEFT', ended_at = ?
      WHERE id = ? AND account_id = ? AND family_id = ? AND status = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM legacy_family_memberships other
          WHERE other.family_id = ? AND other.account_id <> ? AND other.status = 'ACTIVE'
        )
        AND (? <> 'ADMIN' OR EXISTS (
          SELECT 1 FROM legacy_family_memberships successor
          WHERE successor.family_id = ? AND successor.account_id <> ?
            AND successor.status = 'ACTIVE'
            AND (? = '' OR successor.account_id = ?)
        ))`)
      .bind(endedAt, membership.id, access.account.id, membership.family_id,
        membership.family_id, access.account.id, membership.role,
        membership.family_id, access.account.id, requestedSuccessor, requestedSuccessor)
  ]
  if (membership.role === 'ADMIN') {
    statements.push(env.DB.prepare(`UPDATE legacy_family_memberships
      SET role = 'ADMIN'
      WHERE id = (
        SELECT id FROM legacy_family_memberships
        WHERE family_id = ? AND account_id <> ? AND status = 'ACTIVE'
          AND (? = '' OR account_id = ?)
        ORDER BY joined_at ASC, id ASC LIMIT 1
      ) AND family_id = ? AND status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM legacy_family_memberships admin
          WHERE admin.family_id = ? AND admin.role = 'ADMIN' AND admin.status = 'ACTIVE'
        )`)
      .bind(membership.family_id, access.account.id, requestedSuccessor, requestedSuccessor,
        membership.family_id, membership.family_id))
  }
  statements.push(
    env.DB.prepare(`UPDATE devices SET revoked_at = ?
      WHERE revoked_at IS NULL AND id IN (
        SELECT legacy_device_id FROM account_family_devices
        WHERE account_id = ? AND family_id = ?
      ) AND EXISTS (
        SELECT 1 FROM legacy_family_memberships
        WHERE id = ? AND status = 'LEFT'
      )`)
      .bind(revokedAt, access.account.id, membership.family_id, membership.id),
    env.DB.prepare(`UPDATE invite_codes SET expires_at = ?
      WHERE used_at IS NULL AND expires_at > ? AND created_by_device_id IN (
        SELECT legacy_device_id FROM account_family_devices
        WHERE account_id = ? AND family_id = ?
      ) AND EXISTS (
        SELECT 1 FROM legacy_family_memberships
        WHERE id = ? AND status = 'LEFT'
      )`)
      .bind(revokedAt, revokedAt, access.account.id, membership.family_id, membership.id)
  )
  statements.push(env.DB.prepare(`DELETE FROM account_family_devices
    WHERE account_id = ? AND family_id = ?
      AND EXISTS (SELECT 1 FROM legacy_family_memberships
        WHERE id = ? AND status = 'LEFT')`)
    .bind(access.account.id, membership.family_id, membership.id))

  const results = await env.DB.batch(statements)
  if (results[0].meta.changes !== 1) {
    const latest = await env.DB.prepare(`SELECT status FROM legacy_family_memberships WHERE id = ?`)
      .bind(membership.id).first<{ status: string }>()
    if (latest?.status === 'LEFT') return ok(request, env, { left: true, membership: null, idempotent: true })
    throw new ApiError(409, 'FAMILY_MEMBERSHIP_CHANGED')
  }
  if (membership.role === 'ADMIN' && results[1].meta.changes !== 1) {
    throw new ApiError(409, 'FAMILY_ADMIN_TRANSFER_FAILED')
  }
  return ok(request, env, {
    left: true, membership: null, adminTransferred: membership.role === 'ADMIN'
  })
}

async function soleFamilyAdmin(env: Env, accountId: string) {
  const family = await env.DB.prepare(`SELECT f.id, f.name, f.revision, m.role
    FROM families f JOIN legacy_family_memberships m ON m.family_id = f.id
    WHERE m.account_id = ? AND m.status = 'ACTIVE'`)
    .bind(accountId).first<{ id: string; name: string; revision: number; role: string }>()
  if (!family) throw new ApiError(403, 'FAMILY_MEMBERSHIP_REQUIRED')
  if (family.role !== 'ADMIN') throw new ApiError(403, 'FAMILY_ADMIN_REQUIRED')
  const other = await env.DB.prepare(`SELECT id FROM legacy_family_memberships
    WHERE family_id = ? AND status = 'ACTIVE' AND account_id <> ? LIMIT 1`)
    .bind(family.id, accountId).first()
  if (other) throw new ApiError(409, 'FAMILY_HAS_OTHER_MEMBERS')
  return family
}

async function previewFamilyDissolution(request: Request, env: Env, access: AccountAccess) {
  const family = await soleFamilyAdmin(env, access.account.id)
  const children = await env.DB.prepare(`SELECT * FROM children WHERE family_id = ? AND deleted_at IS NULL`)
    .bind(family.id).all<ChildRow>()
  const sessions = await env.DB.prepare(`SELECT * FROM sleep_sessions WHERE family_id = ? AND deleted_at IS NULL`)
    .bind(family.id).all<SessionRow>()
  // All diary mutations advance the revision. Reject a snapshot read across a write.
  const fresh = await soleFamilyAdmin(env, access.account.id)
  if (fresh.id !== family.id || fresh.revision !== family.revision || fresh.name !== family.name) {
    throw new ApiError(409, 'FAMILY_DISSOLUTION_CHANGED')
  }
  return ok(request, env, {
    familyId: family.id, familyName: family.name, revision: family.revision,
    children: children.results.map(childDto), sessions: sessions.results.map(sessionDto)
  })
}

async function dissolveAccountFamily(request: Request, env: Env, access: AccountAccess) {
  const body = await readJson(request)
  const familyId = requireString(body.familyId, 'familyId', 100)
  const name = requireString(body.expectedFamilyName, 'expectedFamilyName', 60)
  const revision = body.expectedRevision
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new ApiError(400, 'INVALID_REQUEST')
  }
  const exists = await env.DB.prepare('SELECT id FROM families WHERE id = ?').bind(familyId).first()
  // An acknowledged deletion can be retried after a lost response, without touching a new family.
  if (!exists) return ok(request, env, { dissolved: true, familyId })
  const family = await soleFamilyAdmin(env, access.account.id)
  if (family.id !== familyId) throw new ApiError(403, 'FAMILY_MEMBERSHIP_REQUIRED')
  if (family.name !== name || family.revision !== revision) throw new ApiError(409, 'FAMILY_DISSOLUTION_CHANGED')

  // Each statement uses the same guard inside one transaction. Memberships stay intact
  // until the final family delete, so a concurrent join or edit makes the entire batch a no-op.
  const guard = `EXISTS (SELECT 1 FROM families f
    JOIN legacy_family_memberships m ON m.family_id = f.id
    WHERE f.id = ? AND f.name = ? AND f.revision = ?
      AND m.account_id = ? AND m.role = 'ADMIN' AND m.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM legacy_family_memberships other
        WHERE other.family_id = f.id AND other.status = 'ACTIVE' AND other.account_id <> m.account_id))`
  const tables = ['operations', 'invite_codes', 'sleep_sessions', 'children', 'devices']
  const statements = tables.map((table) => env.DB.prepare(`DELETE FROM ${table} WHERE family_id = ? AND ${guard}`)
    .bind(familyId, familyId, name, revision, access.account.id))
  statements.push(env.DB.prepare(`DELETE FROM families WHERE id = ? AND ${guard}`)
    .bind(familyId, familyId, name, revision, access.account.id))
  const results = await env.DB.batch(statements)
  // D1 includes cascaded membership deletions in meta.changes. The guarded
  // primary-key DELETE succeeds with any positive count; zero means stale state.
  if (results[results.length - 1].meta.changes < 1) throw new ApiError(409, 'FAMILY_DISSOLUTION_CHANGED')
  return ok(request, env, { dissolved: true, familyId })
}

async function clearAccountFamilyData(request: Request, env: Env, access: AccountAccess) {
  const body = await readJson(request)
  const operationId = requireString(body.operationId, 'operationId', 100)
  const expectedFamilyName = requireString(body.expectedFamilyName, 'expectedFamilyName', 60)
  const replacementChildId = requireString(body.replacementChildId, 'replacementChildId', 100)
  const token = request.headers.get('X-Solemi-Family-Token')
  if (!token) throw new ApiError(401, 'SESSION_INVALID')
  const legacy = await legacyFamilyByToken(env, token)
  if (!legacy || legacy.revoked_at) throw new ApiError(401, 'SESSION_INVALID')

  const membership = await env.DB.prepare(`SELECT role FROM legacy_family_memberships
    WHERE family_id = ? AND account_id = ? AND status = 'ACTIVE'`)
    .bind(legacy.family_id, access.account.id).first<{ role: 'ADMIN' | 'MEMBER' }>()
  if (!membership) throw new ApiError(403, 'FAMILY_MEMBERSHIP_REQUIRED')
  if (membership.role !== 'ADMIN') throw new ApiError(403, 'FAMILY_ADMIN_REQUIRED')
  const mapping = await env.DB.prepare(`SELECT 1 AS linked FROM account_family_devices
    WHERE account_device_id = ? AND account_id = ? AND family_id = ? AND legacy_device_id = ?`)
    .bind(access.deviceId, access.account.id, legacy.family_id, legacy.device_id)
    .first<{ linked: number }>()
  if (!mapping) throw new ApiError(403, 'FAMILY_MEMBERSHIP_REQUIRED')
  if (legacy.family_name !== expectedFamilyName) throw new ApiError(409, 'FAMILY_NAME_CHANGED')

  const prior = await env.DB.prepare(`SELECT id FROM operations
    WHERE id = ? AND family_id = ? AND device_id = ? AND operation_type = 'CLEAR_FAMILY_DATA'`)
    .bind(operationId, legacy.family_id, legacy.device_id).first<{ id: string }>()
  if (!prior) {
    const at = nowIso()
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO operations (id, family_id, device_id, operation_type, created_at)
          VALUES (?, ?, ?, 'CLEAR_FAMILY_DATA', ?)`)
          .bind(operationId, legacy.family_id, legacy.device_id, at),
        env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?')
          .bind(legacy.family_id),
        env.DB.prepare(`UPDATE sleep_sessions
          SET deleted_at = ?, updated_at = ?, revision = (SELECT revision FROM families WHERE id = ?)
          WHERE family_id = ? AND deleted_at IS NULL`)
          .bind(at, at, legacy.family_id, legacy.family_id),
        env.DB.prepare(`UPDATE children
          SET deleted_at = ?, updated_at = ?, revision = (SELECT revision FROM families WHERE id = ?)
          WHERE family_id = ? AND deleted_at IS NULL`)
          .bind(at, at, legacy.family_id, legacy.family_id),
        env.DB.prepare(`INSERT INTO children
          (id, family_id, name, birth_date, created_at, updated_at, deleted_at, revision)
          VALUES (?, ?, '', NULL, ?, ?, NULL, (SELECT revision FROM families WHERE id = ?))`)
          .bind(replacementChildId, legacy.family_id, at, at, legacy.family_id)
      ])
    } catch (error) {
      const repeated = await env.DB.prepare(`SELECT id FROM operations
        WHERE id = ? AND family_id = ? AND device_id = ? AND operation_type = 'CLEAR_FAMILY_DATA'`)
        .bind(operationId, legacy.family_id, legacy.device_id).first<{ id: string }>()
      if (!repeated) throw error
    }
  }

  const child = await getChild(env, legacy.family_id, replacementChildId)
  if (!child || child.deleted_at) throw new ApiError(409, 'FAMILY_CLEAR_RETRY_MISMATCH')
  return ok(request, env, { revision: await currentRevision(env, legacy.family_id), child: childDto(child) })
}

async function accountAuthRoute(request: Request, env: Env, path: string) {
  const service = accountAuth(env)
  try {
    if (request.method === 'GET' && path === '/v1/auth/challenge') {
      return ok(request, env, { nonce: await service.challenge(), clientId: env.GOOGLE_CLIENT_ID })
    }
    if (request.method === 'POST' && path === '/v1/auth/google') {
      requireAllowedAuthOrigin(request, env)
      const body = await readJson(request)
      const result = await service.login({
        credential: requireString(body.credential, 'credential', 10_000),
        nonce: requireString(body.nonce, 'nonce', 64),
        installationSecret: requireString(body.installationSecret, 'installationSecret', 64),
        deviceName: typeof body.deviceName === 'string' ? body.deviceName : 'Web',
        replaceDeviceId: typeof body.replaceDeviceId === 'string' ? body.replaceDeviceId : undefined
      })
      const { refresh, ...data } = result
      return okWithCookie(request, env, data, refreshCookie(refresh, Math.floor(SESSION_MS / 1000)))
    }
    if (request.method === 'POST' && path === '/v1/auth/refresh') {
      requireAllowedAuthOrigin(request, env)
      const token = cookieValue(request, REFRESH_COOKIE)
      if (!token) throw new AuthError('SESSION_INVALID')
      const result = await service.refresh(token)
      const { refresh, ...data } = result
      const maxAge = Math.max(0, Math.floor((result.expiresAt - Date.now()) / 1000))
      return okWithCookie(request, env, data, refreshCookie(refresh, maxAge))
    }
    if (request.method === 'GET' && path === '/v1/auth/me') {
      return ok(request, env, await service.authenticate(accountBearer(request)))
    }
    if (request.method === 'GET' && path === '/v1/auth/access') {
      const access = await service.authenticate(accountBearer(request))
      return ok(request, env, await entitlementService(env).accessState(access.account.id))
    }
    if (request.method === 'POST' && path === '/v1/auth/test/plan') {
      requireAllowedAuthOrigin(request, env)
      if (env.ENTITLEMENT_TEST_MODE !== 'true') throw new ApiError(404, 'NOT_FOUND')
      const access = await service.authenticate(accountBearer(request))
      const body = await readJson(request)
      if (!['free', 'family', 'familyPlus'].includes(String(body.plan))) {
        throw new ApiError(400, 'INVALID_REQUEST', 'Invalid plan.')
      }
      return ok(request, env, await entitlementService(env)
        .setManualTestPlan(access.account.id, body.plan as TestPlan))
    }
    if (request.method === 'POST' && path === '/v1/auth/family/claim') {
      requireAccountFamilyBridge(env)
      requireAllowedAuthOrigin(request, env)
      const access = await service.authenticate(accountBearer(request))
      return claimAccountFamily(request, env, access)
    }
    if (request.method === 'POST' && path === '/v1/auth/family/create') {
      requireAccountFamilyBridge(env)
      requireAllowedAuthOrigin(request, env)
      const access = await service.authenticate(accountBearer(request))
      return createAccountFamily(request, env, access)
    }
    if (request.method === 'POST' && path === '/v1/auth/family/bootstrap') {
      requireAccountFamilyBridge(env)
      requireAllowedAuthOrigin(request, env)
      const access = await service.authenticate(accountBearer(request))
      return bootstrapAccountFamily(request, env, access)
    }
    if (request.method === 'POST' && path === '/v1/auth/family/join') {
      requireAccountFamilyBridge(env)
      requireAllowedAuthOrigin(request, env)
      const access = await service.authenticate(accountBearer(request))
      return joinAccountFamily(request, env, access)
    }
    if (request.method === 'GET' && path === '/v1/auth/family/members') {
      requireAccountFamilyBridge(env)
      const access = await service.authenticate(accountBearer(request))
      return listAccountFamilyMembers(request, env, access)
    }
    if (request.method === 'POST' && path === '/v1/auth/family/leave') {
      requireAccountFamilyBridge(env)
      requireAllowedAuthOrigin(request, env)
      const access = await service.authenticate(accountBearer(request))
      return leaveAccountFamily(request, env, access)
    }
    if (request.method === 'GET' && path === '/v1/auth/family/dissolution-preview') {
      requireAccountFamilyBridge(env)
      const access = await service.authenticate(accountBearer(request))
      return previewFamilyDissolution(request, env, access)
    }
    if (request.method === 'POST' && path === '/v1/auth/family/dissolve') {
      requireAccountFamilyBridge(env)
      requireAllowedAuthOrigin(request, env)
      const access = await service.authenticate(accountBearer(request))
      return dissolveAccountFamily(request, env, access)
    }
    if (request.method === 'POST' && path === '/v1/auth/family/data/clear') {
      requireAccountFamilyBridge(env)
      requireAllowedAuthOrigin(request, env)
      const access = await service.authenticate(accountBearer(request))
      return clearAccountFamilyData(request, env, access)
    }
    if (request.method === 'POST' && path === '/v1/auth/logout') {
      requireAllowedAuthOrigin(request, env)
      const token = cookieValue(request, REFRESH_COOKIE)
      if (token) await service.logout(token)
      return okWithCookie(request, env, { signedOut: true }, refreshCookie('', 0))
    }
    throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.')
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof AuthError) throw new ApiError(error.status, error.code, error.code, error.data)
    throw error
  }
}

async function route(request: Request, env: Env) {
  assertWorkerEnvironment(env)
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) })
  }

  if (request.method === 'GET' && path === '/health') {
    return ok(request, env, { service: 'solemi-sleep-sync', status: 'ok' })
  }

  if (path.startsWith('/v1/auth/')) return accountAuthRoute(request, env, path)

  if (request.method === 'POST' && path === '/v1/families') {
    if (env.ENTITLEMENT_ENFORCEMENT === 'true') throw new ApiError(401, 'ACCOUNT_REQUIRED')
    return createFamily(request, env)
  }
  if (request.method === 'POST' && path === '/v1/join') {
    if (env.ENTITLEMENT_ENFORCEMENT === 'true') throw new ApiError(401, 'ACCOUNT_REQUIRED')
    return joinFamily(request, env)
  }

  const auth = await authenticate(request, env)

  const isRawFamilyData = (request.method === 'GET' && path === '/v1/sync')
    || (request.method === 'POST' && (path === '/v1/children' || path === '/v1/sessions' || path === '/v1/sessions/start'))
    || (request.method === 'POST' && /^\/v1\/sessions\/[^/]+\/end$/.test(path))
    || ((request.method === 'PATCH' || request.method === 'DELETE')
      && (/^\/v1\/children\/[^/]+$/.test(path) || /^\/v1\/sessions\/[^/]+$/.test(path)))
  if (isRawFamilyData) await requireFamilySyncEntitlement(request, env, auth)
  if (request.method === 'POST' && path === '/v1/invites') {
    await requireFamilySyncEntitlement(request, env, auth)
    return createInvite(request, env, auth)
  }

  if (request.method === 'GET' && path === '/v1/sync') return sync(request, env, auth)
  if (request.method === 'GET' && path === '/v1/device') return getDevice(request, env, auth)
  if (request.method === 'POST' && path === '/v1/device/leave') return leaveDevice(request, env, auth)
  if (request.method === 'POST' && path === '/v1/children') return createChildProfile(request, env, auth)
  if (request.method === 'POST' && path === '/v1/sessions/start') return startSleep(request, env, auth)
  if (request.method === 'POST' && path === '/v1/sessions') return createCompletedSleep(request, env, auth)

  const endMatch = path.match(/^\/v1\/sessions\/([^/]+)\/end$/)
  if (request.method === 'POST' && endMatch) return endSleep(request, env, auth, decodeURIComponent(endMatch[1]))

  const childMatch = path.match(/^\/v1\/children\/([^/]+)$/)
  if (request.method === 'PATCH' && childMatch) return patchChildProfile(request, env, auth, decodeURIComponent(childMatch[1]))
  if (request.method === 'DELETE' && childMatch) return deleteChildProfile(request, env, auth, decodeURIComponent(childMatch[1]))

  const sessionMatch = path.match(/^\/v1\/sessions\/([^/]+)$/)
  if (request.method === 'PATCH' && sessionMatch) return patchSleep(request, env, auth, decodeURIComponent(sessionMatch[1]))
  if (request.method === 'DELETE' && sessionMatch) return deleteSleep(request, env, auth, decodeURIComponent(sessionMatch[1]))

  throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env)
    } catch (error) {
      if (error instanceof ApiError) return fail(request, env, error)
      console.error(error)
      return fail(request, env, new ApiError(500, 'INTERNAL_ERROR', 'Unexpected server error.'))
    }
  }
}
