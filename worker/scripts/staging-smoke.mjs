import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const base = (process.env.SOLEMI_STAGING_API_BASE || '').replace(/\/$/, '')
if (!base) throw new Error('Set SOLEMI_STAGING_API_BASE to the staging Worker URL.')
if (!/staging/i.test(base)) throw new Error('Refusing to run: the URL must contain "staging".')

const origin = 'https://solemi-sleep-internal.pages.dev'
const run = randomUUID().replaceAll('-', '').slice(0, 12)
const childA = `child_smoke_a_${run}`
const childB = `child_smoke_b_${run}`
const sessionA = `sleep_smoke_a_${run}`
const sessionB = `sleep_smoke_b_${run}`

function operationId(label) {
  return `op_${label}_${randomUUID().replaceAll('-', '')}`
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { Origin: origin }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) {
    const detail = payload?.error ? `${payload.error.code}: ${payload.error.message}` : `HTTP ${response.status}`
    throw new Error(`${method} ${path} failed: ${detail}`)
  }
  return { response, data: payload.data }
}

console.log(`Staging smoke test: ${base}`)

const health = await api('/health')
assert.equal(health.data.status, 'ok')
assert.equal(health.response.headers.get('access-control-allow-origin'), origin)

const created = await api('/v1/families', {
  method: 'POST',
  body: {
    familyName: `Solemi staging smoke ${run}`,
    deviceName: 'smoke-primary',
    childId: childA,
    childName: 'Boti smoke',
    birthDate: '2025-08-23'
  }
})
const primaryToken = created.data.deviceToken
assert.ok(primaryToken)

await api('/v1/children', {
  method: 'POST',
  token: primaryToken,
  body: {
    operationId: operationId('create_child'),
    child: { id: childB, name: 'Frici smoke', birthDate: '2026-08-18' }
  }
})

const now = Date.now()
await Promise.all([
  api('/v1/sessions/start', {
    method: 'POST', token: primaryToken,
    body: { operationId: operationId('start_a'), sessionId: sessionA, childId: childA, startTime: new Date(now - 10 * 60_000).toISOString() }
  }),
  api('/v1/sessions/start', {
    method: 'POST', token: primaryToken,
    body: { operationId: operationId('start_b'), sessionId: sessionB, childId: childB, startTime: new Date(now - 8 * 60_000).toISOString() }
  })
])

let synced = (await api('/v1/sync?after=0', { token: primaryToken })).data
assert.equal(synced.children.filter((child) => !child.deletedAt).length, 2)
assert.equal(synced.sessions.filter((session) => !session.endTime && !session.deletedAt).length, 2)

await api(`/v1/children/${childB}`, {
  method: 'PATCH', token: primaryToken,
  body: { operationId: operationId('patch_child'), patch: { name: 'Frici staging' } }
})

const endTime = new Date().toISOString()
await Promise.all([
  api(`/v1/sessions/${sessionA}/end`, {
    method: 'POST', token: primaryToken,
    body: { operationId: operationId('end_a'), endTime }
  }),
  api(`/v1/sessions/${sessionB}/end`, {
    method: 'POST', token: primaryToken,
    body: { operationId: operationId('end_b'), endTime }
  })
])

await api(`/v1/sessions/${sessionA}`, {
  method: 'PATCH', token: primaryToken,
  body: { operationId: operationId('patch_sleep'), patch: { note: 'staging smoke verified', dayNightOverride: 'day' } }
})
await api(`/v1/sessions/${sessionB}`, {
  method: 'DELETE', token: primaryToken,
  body: { operationId: operationId('delete_sleep') }
})

const invite = await api('/v1/invites', { method: 'POST', token: primaryToken, body: {} })
const joined = await api('/v1/join', {
  method: 'POST',
  body: { code: invite.data.code, deviceName: 'smoke-secondary' }
})
assert.ok(joined.data.deviceToken)

synced = (await api('/v1/sync?after=0', { token: joined.data.deviceToken })).data
const syncedA = synced.sessions.find((session) => session.id === sessionA)
const syncedB = synced.sessions.find((session) => session.id === sessionB)
assert.equal(synced.children.find((child) => child.id === childB)?.name, 'Frici staging')
assert.equal(syncedA?.note, 'staging smoke verified')
assert.equal(syncedA?.dayNightOverride, 'day')
assert.ok(syncedB?.deletedAt)

console.log('PASS: health + CORS')
console.log('PASS: two child profiles + parallel active sleeps')
console.log('PASS: edit + delete tombstone')
console.log('PASS: invite + second-device sync')
console.log(`PASS: family ${created.data.familyId}, revision ${synced.revision}`)
