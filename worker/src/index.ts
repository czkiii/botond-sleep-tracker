interface Env {
  DB: D1Database
  TOKEN_PEPPER: string
  ALLOWED_ORIGINS: string
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
const INVITE_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const INVITE_TTL_MS = 30 * 60 * 1000

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
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
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

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) throw new ApiError(400, 'INVALID_REQUEST', 'JSON body required.')
  try {
    const value = await request.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    return value as Record<string, unknown>
  } catch {
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
  const authorization = request.headers.get('Authorization')
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
  const name = requireString(input.name, 'child.name', 60)
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
  const name = 'name' in patch ? requireString(patch.name, 'name', 60) : current.name
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

async function startSleep(request: Request, env: Env, auth: DeviceAuth) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  const sessionId = requireString(body.sessionId, 'sessionId', 100)
  const childId = typeof body.childId === 'string' && body.childId.trim() ? requireString(body.childId, 'childId', 100) : legacyChildId(auth.familyId)
  await requireActiveChild(env, auth.familyId, childId)
  if (!isIsoDate(body.startTime)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid startTime.')
  const startTime = body.startTime
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
         VALUES (?, ?, ?, ?, NULL, '', NULL, ?, ?, NULL, (SELECT revision FROM families WHERE id = ?))`
      ).bind(sessionId, auth.familyId, childId, startTime, at, at, auth.familyId)
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
  if (existing.deleted_at) throw new ApiError(409, 'SESSION_DELETED')
  if (existing.end_time) return ok(request, env, {
    revision: await currentRevision(env, auth.familyId),
    session: sessionDto(existing),
    alreadyEnded: true
  })
  if (Date.parse(endTime) <= Date.parse(existing.start_time)) throw new ApiError(400, 'INVALID_TIME_RANGE')
  if (Date.parse(endTime) > Date.now() + 60_000) throw new ApiError(400, 'FUTURE_TIME')

  if (await existingOperation(env, operationId, auth, 'END_SLEEP')) {
    const current = await getSession(env, auth.familyId, sessionId)
    return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: current ? sessionDto(current) : null, idempotent: true })
  }

  const at = nowIso()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(operationId, auth.familyId, auth.deviceId, 'END_SLEEP', at),
    env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?').bind(auth.familyId),
    env.DB.prepare(
      `UPDATE sleep_sessions
       SET end_time = ?, updated_at = ?, revision = (SELECT revision FROM families WHERE id = ?)
       WHERE id = ? AND family_id = ? AND end_time IS NULL AND deleted_at IS NULL`
    ).bind(endTime, at, auth.familyId, sessionId, auth.familyId)
  ])

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

  if (await existingOperation(env, operationId, auth, 'PATCH_SLEEP')) {
    const existing = await getSession(env, auth.familyId, sessionId)
    return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: existing ? sessionDto(existing) : null, idempotent: true })
  }

  const assignments: string[] = []
  const params: unknown[] = []
  if ('startTime' in patch) { assignments.push('start_time = ?'); params.push(nextStart) }
  if ('endTime' in patch) { assignments.push('end_time = ?'); params.push(nextEnd) }
  if ('note' in patch) { assignments.push('note = ?'); params.push((patch.note as string).slice(0, 2000)) }
  if ('dayNightOverride' in patch) { assignments.push('day_night_override = ?'); params.push(patch.dayNightOverride) }
  const at = nowIso()
  assignments.push('updated_at = ?'); params.push(at)
  assignments.push('revision = (SELECT revision FROM families WHERE id = ?)'); params.push(auth.familyId)
  params.push(sessionId, auth.familyId)

  await env.DB.batch([
    env.DB.prepare('INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(operationId, auth.familyId, auth.deviceId, 'PATCH_SLEEP', at),
    env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?').bind(auth.familyId),
    env.DB.prepare(
      `UPDATE sleep_sessions SET ${assignments.join(', ')}
       WHERE id = ? AND family_id = ? AND deleted_at IS NULL`
    ).bind(...params as D1PreparedStatementParameters)
  ])

  const updated = await getSession(env, auth.familyId, sessionId)
  if (!updated || updated.deleted_at) throw new ApiError(409, 'SESSION_DELETED')
  return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(updated) })
}

async function deleteSleep(request: Request, env: Env, auth: DeviceAuth, sessionId: string) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  const current = await getSession(env, auth.familyId, sessionId)
  if (!current) throw new ApiError(404, 'SESSION_NOT_FOUND')
  if (current.deleted_at) return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(current), alreadyDeleted: true })

  if (await existingOperation(env, operationId, auth, 'DELETE_SLEEP')) {
    const existing = await getSession(env, auth.familyId, sessionId)
    return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: existing ? sessionDto(existing) : null, idempotent: true })
  }

  const at = nowIso()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(operationId, auth.familyId, auth.deviceId, 'DELETE_SLEEP', at),
    env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?').bind(auth.familyId),
    env.DB.prepare(
      `UPDATE sleep_sessions
       SET deleted_at = ?, updated_at = ?, revision = (SELECT revision FROM families WHERE id = ?)
       WHERE id = ? AND family_id = ? AND deleted_at IS NULL`
    ).bind(at, at, auth.familyId, sessionId, auth.familyId)
  ])

  const deleted = await getSession(env, auth.familyId, sessionId)
  if (!deleted) throw new ApiError(404, 'SESSION_NOT_FOUND')
  return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(deleted) })
}

async function route(request: Request, env: Env) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) })
  }

  if (request.method === 'GET' && path === '/health') {
    return ok(request, env, { service: 'solemi-sleep-sync', status: 'ok' })
  }

  if (request.method === 'POST' && path === '/v1/families') return createFamily(request, env)
  if (request.method === 'POST' && path === '/v1/join') return joinFamily(request, env)

  const auth = await authenticate(request, env)

  if (request.method === 'POST' && path === '/v1/invites') return createInvite(request, env, auth)
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
