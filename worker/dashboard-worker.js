class ApiError extends Error {
  constructor(status, code, message = code, data) {
    super(message)
    this.status = status
    this.code = code
    this.data = data
  }
}

const encoder = new TextEncoder()
const INVITE_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const INVITE_TTL_MS = 30 * 60 * 1000

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin')
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean)
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

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request, env) })
}

function ok(request, env, data, status = 200) {
  return json(request, env, { ok: true, data }, status)
}

function fail(request, env, error) {
  return json(request, env, {
    ok: false,
    error: { code: error.code, message: error.message },
    ...(error.data === undefined ? {} : { data: error.data })
  }, error.status)
}

function nowIso() { return new Date().toISOString() }
function newId(prefix) { return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}` }

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

async function hashSecret(secret, pepper) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${pepper}:${secret}`))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function isIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function requireString(value, field, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new ApiError(400, 'INVALID_REQUEST', `Invalid ${field}.`)
  }
  return value.trim()
}

async function readJson(request) {
  const contentType = request.headers.get('Content-Type') || ''
  if (!contentType.includes('application/json')) throw new ApiError(400, 'INVALID_REQUEST', 'JSON body required.')
  try {
    const value = await request.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    return value
  } catch {
    throw new ApiError(400, 'INVALID_REQUEST', 'Invalid JSON body.')
  }
}

function sessionDto(row) {
  return {
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    revision: row.revision
  }
}

async function getSession(env, familyId, sessionId) {
  return env.DB.prepare(`SELECT id, family_id, start_time, end_time, note, created_at, updated_at, deleted_at, revision
    FROM sleep_sessions WHERE id = ? AND family_id = ?`).bind(sessionId, familyId).first()
}

async function getActiveSession(env, familyId) {
  return env.DB.prepare(`SELECT id, family_id, start_time, end_time, note, created_at, updated_at, deleted_at, revision
    FROM sleep_sessions WHERE family_id = ? AND end_time IS NULL AND deleted_at IS NULL LIMIT 1`).bind(familyId).first()
}

async function currentRevision(env, familyId) {
  const row = await env.DB.prepare('SELECT revision FROM families WHERE id = ?').bind(familyId).first()
  if (!row) throw new ApiError(404, 'FAMILY_NOT_FOUND')
  return row.revision
}

async function authenticate(request, env) {
  const authorization = request.headers.get('Authorization')
  if (!authorization || !authorization.startsWith('Bearer ')) throw new ApiError(401, 'INVALID_DEVICE_TOKEN', 'Device token required.')
  const token = authorization.slice(7).trim()
  if (!token) throw new ApiError(401, 'INVALID_DEVICE_TOKEN', 'Device token required.')
  const tokenHash = await hashSecret(token, env.TOKEN_PEPPER)
  const row = await env.DB.prepare(`SELECT d.id AS device_id, d.family_id, d.name, d.revoked_at, f.revision
    FROM devices d JOIN families f ON f.id = d.family_id WHERE d.token_hash = ?`).bind(tokenHash).first()
  if (!row) throw new ApiError(401, 'INVALID_DEVICE_TOKEN', 'Invalid device token.')
  if (row.revoked_at) throw new ApiError(403, 'DEVICE_REVOKED', 'This device has been revoked.')
  await env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(nowIso(), row.device_id).run()
  return { deviceId: row.device_id, familyId: row.family_id, deviceName: row.name, familyRevision: row.revision }
}

async function existingOperation(env, operationId, auth, expectedType) {
  const row = await env.DB.prepare('SELECT id, family_id, device_id, operation_type FROM operations WHERE id = ?').bind(operationId).first()
  if (!row) return false
  if (row.family_id !== auth.familyId || row.device_id !== auth.deviceId || row.operation_type !== expectedType) {
    throw new ApiError(409, 'OPERATION_ID_REUSED', 'Operation ID was already used for another operation.')
  }
  return true
}

function operationIdFrom(body) { return requireString(body.operationId, 'operationId', 100) }

async function createFamily(request, env) {
  const body = await readJson(request)
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim().slice(0, 80) : null
  const familyId = newId('fam')
  const deviceId = newId('dev')
  const token = randomToken()
  const tokenHash = await hashSecret(token, env.TOKEN_PEPPER)
  const createdAt = nowIso()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO families (id, revision, created_at) VALUES (?, 0, ?)').bind(familyId, createdAt),
    env.DB.prepare(`INSERT INTO devices (id, family_id, token_hash, name, created_at, last_seen_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)`).bind(deviceId, familyId, tokenHash, deviceName, createdAt, createdAt)
  ])
  return ok(request, env, { familyId, device: { id: deviceId, name: deviceName }, deviceToken: token, revision: 0 }, 201)
}

async function createInvite(request, env, auth) {
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomInviteCode()
    const codeHash = await hashSecret(code, env.TOKEN_PEPPER)
    try {
      await env.DB.prepare(`INSERT INTO invite_codes (code_hash, family_id, created_by_device_id, created_at, expires_at, used_at)
        VALUES (?, ?, ?, ?, ?, NULL)`).bind(codeHash, auth.familyId, auth.deviceId, createdAt, expiresAt).run()
      return ok(request, env, { code, expiresAt }, 201)
    } catch {}
  }
  throw new ApiError(500, 'INVITE_CREATE_FAILED', 'Could not create invite code.')
}

async function joinFamily(request, env) {
  const body = await readJson(request)
  const code = requireString(body.code, 'code', 20).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim().slice(0, 80) : null
  const codeHash = await hashSecret(code, env.TOKEN_PEPPER)
  const invite = await env.DB.prepare('SELECT family_id, expires_at, used_at FROM invite_codes WHERE code_hash = ?').bind(codeHash).first()
  if (!invite) throw new ApiError(404, 'INVITE_NOT_FOUND', 'Invite code not found.')
  if (invite.used_at) throw new ApiError(409, 'INVITE_ALREADY_USED', 'Invite code has already been used.')
  if (Date.parse(invite.expires_at) <= Date.now()) throw new ApiError(410, 'INVITE_EXPIRED', 'Invite code has expired.')
  const deviceId = newId('dev')
  const token = randomToken()
  const tokenHash = await hashSecret(token, env.TOKEN_PEPPER)
  const joinedAt = nowIso()
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO devices (id, family_id, token_hash, name, created_at, last_seen_at, revoked_at)
      SELECT ?, family_id, ?, ?, ?, ?, NULL FROM invite_codes
      WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`).bind(deviceId, tokenHash, deviceName, joinedAt, joinedAt, codeHash, joinedAt),
    env.DB.prepare(`UPDATE invite_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
      AND EXISTS (SELECT 1 FROM devices WHERE id = ?)`).bind(joinedAt, codeHash, joinedAt, deviceId)
  ])
  if (Number(results[0]?.meta?.changes || 0) <= 0) throw new ApiError(409, 'INVITE_ALREADY_USED', 'Invite code is no longer available.')
  return ok(request, env, {
    familyId: invite.family_id,
    device: { id: deviceId, name: deviceName },
    deviceToken: token,
    revision: await currentRevision(env, invite.family_id)
  }, 201)
}

async function sync(request, env, auth) {
  const after = Number(new URL(request.url).searchParams.get('after') || '0')
  if (!Number.isInteger(after) || after < 0) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid revision.')
  const [family, sessions] = await Promise.all([
    env.DB.prepare('SELECT revision FROM families WHERE id = ?').bind(auth.familyId).first(),
    env.DB.prepare(`SELECT id, family_id, start_time, end_time, note, created_at, updated_at, deleted_at, revision
      FROM sleep_sessions WHERE family_id = ? AND revision > ? ORDER BY revision ASC`).bind(auth.familyId, after).all()
  ])
  return ok(request, env, { revision: family?.revision ?? auth.familyRevision, sessions: sessions.results.map(sessionDto) })
}

async function getDevice(request, env, auth) {
  return ok(request, env, { id: auth.deviceId, name: auth.deviceName, familyId: auth.familyId, revision: await currentRevision(env, auth.familyId) })
}

async function leaveDevice(request, env, auth) {
  const at = nowIso()
  await env.DB.prepare('UPDATE devices SET revoked_at = ?, last_seen_at = ? WHERE id = ? AND family_id = ?').bind(at, at, auth.deviceId, auth.familyId).run()
  return ok(request, env, { revoked: true })
}

async function startSleep(request, env, auth) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  const sessionId = requireString(body.sessionId, 'sessionId', 100)
  if (!isIsoDate(body.startTime)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid startTime.')
  const startTime = body.startTime
  if (Date.parse(startTime) > Date.now() + 60000) throw new ApiError(400, 'FUTURE_TIME')
  if (await existingOperation(env, operationId, auth, 'START_SLEEP')) {
    const existing = await getSession(env, auth.familyId, sessionId)
    if (existing) return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(existing), idempotent: true })
  }
  const active = await getActiveSession(env, auth.familyId)
  if (active) throw new ApiError(409, 'ACTIVE_SLEEP_EXISTS', 'An active sleep session already exists.', {
    revision: await currentRevision(env, auth.familyId), activeSession: sessionDto(active)
  })
  const at = nowIso()
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)').bind(operationId, auth.familyId, auth.deviceId, 'START_SLEEP', at),
      env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?').bind(auth.familyId),
      env.DB.prepare(`INSERT INTO sleep_sessions (id, family_id, start_time, end_time, note, created_at, updated_at, deleted_at, revision)
        VALUES (?, ?, ?, NULL, '', ?, ?, NULL, (SELECT revision FROM families WHERE id = ?))`).bind(sessionId, auth.familyId, startTime, at, at, auth.familyId)
    ])
  } catch {
    const authoritative = await getActiveSession(env, auth.familyId)
    if (authoritative) throw new ApiError(409, 'ACTIVE_SLEEP_EXISTS', 'An active sleep session already exists.', {
      revision: await currentRevision(env, auth.familyId), activeSession: sessionDto(authoritative)
    })
    throw new ApiError(409, 'SESSION_CREATE_CONFLICT')
  }
  const session = await getSession(env, auth.familyId, sessionId)
  if (!session) throw new ApiError(500, 'INTERNAL_ERROR')
  return ok(request, env, { revision: session.revision, session: sessionDto(session) }, 201)
}

async function createCompletedSleep(request, env, auth) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  const input = body.session
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid session.')
  const sessionId = requireString(input.id, 'session.id', 100)
  if (!isIsoDate(input.startTime) || !isIsoDate(input.endTime)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid sleep times.')
  const startTime = input.startTime
  const endTime = input.endTime
  const note = typeof input.note === 'string' ? input.note.slice(0, 2000) : ''
  if (Date.parse(endTime) <= Date.parse(startTime)) throw new ApiError(400, 'INVALID_TIME_RANGE')
  if (Math.max(Date.parse(startTime), Date.parse(endTime)) > Date.now() + 60000) throw new ApiError(400, 'FUTURE_TIME')
  if (await existingOperation(env, operationId, auth, 'CREATE_SLEEP')) {
    const existing = await getSession(env, auth.familyId, sessionId)
    if (existing) return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(existing), idempotent: true })
  }
  const at = nowIso()
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)').bind(operationId, auth.familyId, auth.deviceId, 'CREATE_SLEEP', at),
      env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?').bind(auth.familyId),
      env.DB.prepare(`INSERT INTO sleep_sessions (id, family_id, start_time, end_time, note, created_at, updated_at, deleted_at, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, (SELECT revision FROM families WHERE id = ?))`).bind(sessionId, auth.familyId, startTime, endTime, note, at, at, auth.familyId)
    ])
  } catch { throw new ApiError(409, 'SESSION_CREATE_CONFLICT') }
  const session = await getSession(env, auth.familyId, sessionId)
  if (!session) throw new ApiError(500, 'INTERNAL_ERROR')
  return ok(request, env, { revision: session.revision, session: sessionDto(session) }, 201)
}

async function endSleep(request, env, auth, sessionId) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  if (!isIsoDate(body.endTime)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid endTime.')
  const endTime = body.endTime
  const existing = await getSession(env, auth.familyId, sessionId)
  if (!existing) throw new ApiError(404, 'SESSION_NOT_FOUND')
  if (existing.deleted_at) throw new ApiError(409, 'SESSION_DELETED')
  if (existing.end_time) return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(existing), alreadyEnded: true })
  if (Date.parse(endTime) <= Date.parse(existing.start_time)) throw new ApiError(400, 'INVALID_TIME_RANGE')
  if (Date.parse(endTime) > Date.now() + 60000) throw new ApiError(400, 'FUTURE_TIME')
  if (await existingOperation(env, operationId, auth, 'END_SLEEP')) {
    const current = await getSession(env, auth.familyId, sessionId)
    return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: current ? sessionDto(current) : null, idempotent: true })
  }
  const at = nowIso()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)').bind(operationId, auth.familyId, auth.deviceId, 'END_SLEEP', at),
    env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?').bind(auth.familyId),
    env.DB.prepare(`UPDATE sleep_sessions SET end_time = ?, updated_at = ?, revision = (SELECT revision FROM families WHERE id = ?)
      WHERE id = ? AND family_id = ? AND end_time IS NULL AND deleted_at IS NULL`).bind(endTime, at, auth.familyId, sessionId, auth.familyId)
  ])
  const current = await getSession(env, auth.familyId, sessionId)
  if (!current) throw new ApiError(404, 'SESSION_NOT_FOUND')
  return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(current) })
}

async function patchSleep(request, env, auth, sessionId) {
  const body = await readJson(request)
  const operationId = operationIdFrom(body)
  const patch = body.patch
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid patch.')
  const allowed = ['startTime', 'endTime', 'note']
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
  if (Math.max(Date.parse(nextStart), nextEnd ? Date.parse(nextEnd) : 0) > Date.now() + 60000) throw new ApiError(400, 'FUTURE_TIME')
  if ('note' in patch && typeof patch.note !== 'string') throw new ApiError(400, 'INVALID_REQUEST', 'Invalid note.')
  if (await existingOperation(env, operationId, auth, 'PATCH_SLEEP')) {
    const existing = await getSession(env, auth.familyId, sessionId)
    return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: existing ? sessionDto(existing) : null, idempotent: true })
  }
  const assignments = []
  const params = []
  if ('startTime' in patch) { assignments.push('start_time = ?'); params.push(nextStart) }
  if ('endTime' in patch) { assignments.push('end_time = ?'); params.push(nextEnd) }
  if ('note' in patch) { assignments.push('note = ?'); params.push(patch.note.slice(0, 2000)) }
  const at = nowIso()
  assignments.push('updated_at = ?'); params.push(at)
  assignments.push('revision = (SELECT revision FROM families WHERE id = ?)'); params.push(auth.familyId)
  params.push(sessionId, auth.familyId)
  await env.DB.batch([
    env.DB.prepare('INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)').bind(operationId, auth.familyId, auth.deviceId, 'PATCH_SLEEP', at),
    env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?').bind(auth.familyId),
    env.DB.prepare(`UPDATE sleep_sessions SET ${assignments.join(', ')} WHERE id = ? AND family_id = ? AND deleted_at IS NULL`).bind(...params)
  ])
  const updated = await getSession(env, auth.familyId, sessionId)
  if (!updated || updated.deleted_at) throw new ApiError(409, 'SESSION_DELETED')
  return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(updated) })
}

async function deleteSleep(request, env, auth, sessionId) {
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
    env.DB.prepare('INSERT INTO operations (id, family_id, device_id, operation_type, created_at) VALUES (?, ?, ?, ?, ?)').bind(operationId, auth.familyId, auth.deviceId, 'DELETE_SLEEP', at),
    env.DB.prepare('UPDATE families SET revision = revision + 1 WHERE id = ?').bind(auth.familyId),
    env.DB.prepare(`UPDATE sleep_sessions SET deleted_at = ?, updated_at = ?, revision = (SELECT revision FROM families WHERE id = ?)
      WHERE id = ? AND family_id = ? AND deleted_at IS NULL`).bind(at, at, auth.familyId, sessionId, auth.familyId)
  ])
  const deleted = await getSession(env, auth.familyId, sessionId)
  if (!deleted) throw new ApiError(404, 'SESSION_NOT_FOUND')
  return ok(request, env, { revision: await currentRevision(env, auth.familyId), session: sessionDto(deleted) })
}

async function route(request, env) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) })
  if (request.method === 'GET' && path === '/health') return ok(request, env, { service: 'solemi-sleep-sync', status: 'ok' })
  if (request.method === 'POST' && path === '/v1/families') return createFamily(request, env)
  if (request.method === 'POST' && path === '/v1/join') return joinFamily(request, env)
  const auth = await authenticate(request, env)
  if (request.method === 'POST' && path === '/v1/invites') return createInvite(request, env, auth)
  if (request.method === 'GET' && path === '/v1/sync') return sync(request, env, auth)
  if (request.method === 'GET' && path === '/v1/device') return getDevice(request, env, auth)
  if (request.method === 'POST' && path === '/v1/device/leave') return leaveDevice(request, env, auth)
  if (request.method === 'POST' && path === '/v1/sessions/start') return startSleep(request, env, auth)
  if (request.method === 'POST' && path === '/v1/sessions') return createCompletedSleep(request, env, auth)
  const endMatch = path.match(/^\/v1\/sessions\/([^/]+)\/end$/)
  if (request.method === 'POST' && endMatch) return endSleep(request, env, auth, decodeURIComponent(endMatch[1]))
  const sessionMatch = path.match(/^\/v1\/sessions\/([^/]+)$/)
  if (request.method === 'PATCH' && sessionMatch) return patchSleep(request, env, auth, decodeURIComponent(sessionMatch[1]))
  if (request.method === 'DELETE' && sessionMatch) return deleteSleep(request, env, auth, decodeURIComponent(sessionMatch[1]))
  throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.')
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env)
    } catch (error) {
      if (error instanceof ApiError) return fail(request, env, error)
      console.error(error)
      return fail(request, env, new ApiError(500, 'INTERNAL_ERROR', 'Unexpected server error.'))
    }
  }
}
