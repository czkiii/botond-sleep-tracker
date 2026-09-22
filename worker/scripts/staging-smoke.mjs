import assert from 'node:assert/strict'

const configuredBase = process.env.SOLEMI_STAGING_API_BASE
if (!configuredBase) throw new Error('Set SOLEMI_STAGING_API_BASE to the staging Worker URL.')
const base = new URL(configuredBase)
if (base.protocol !== 'https:' || !/staging/i.test(base.hostname) ||
  base.pathname !== '/' || base.search || base.hash || base.username || base.password) {
  throw new Error('Refusing to run against a non-staging HTTPS Worker origin.')
}

const origin = 'https://solemi-sleep-internal.pages.dev'

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000)
  })
  const payload = await response.json()
  assert.equal(response.headers.get('access-control-allow-origin'), origin,
    `${method} ${path} must allow the internal Pages origin`)
  return { response, payload }
}

async function expectRejected(path, status, code, options) {
  const { response, payload } = await request(path, options)
  assert.equal(response.status, status, `${options?.method || 'GET'} ${path}: ${JSON.stringify(payload)}`)
  assert.equal(payload?.ok, false)
  assert.equal(payload?.error?.code, code)
}

console.log(`Staging auth boundary smoke: ${base.origin}`)

const health = await request('/health')
assert.equal(health.response.status, 200)
assert.equal(health.payload?.ok, true)
assert.equal(health.payload?.data?.status, 'ok')

// Empty bodies cannot create data even if a deployment accidentally disables
// enforcement. The expected ACCOUNT_REQUIRED response also detects that drift.
await expectRejected('/v1/families', 401, 'ACCOUNT_REQUIRED',
  { method: 'POST', body: {} })
await expectRejected('/v1/join', 401, 'ACCOUNT_REQUIRED',
  { method: 'POST', body: {} })

await expectRejected('/v1/auth/access', 401, 'SESSION_INVALID')
await expectRejected('/v1/auth/family/create', 401, 'SESSION_INVALID',
  { method: 'POST', body: {} })
await expectRejected('/v1/auth/family/join', 401, 'SESSION_INVALID',
  { method: 'POST', body: {} })
await expectRejected('/v1/auth/test/plan', 401, 'SESSION_INVALID',
  { method: 'POST', body: { plan: 'familyPlus' } })

console.log('PASS: health and internal-origin CORS')
console.log('PASS: legacy anonymous family creation and join are blocked')
console.log('PASS: account access, family mutation and test plan require a session')
console.log('Authenticated two-account Family Sync remains a separate staging acceptance test.')
