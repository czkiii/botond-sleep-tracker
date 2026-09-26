import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const origin = 'https://solemi-sleep-internal.pages.dev'

export async function runStagingSmoke({
  apiBase, expectedBuildSha, waitTimeoutMs = 480_000, pollIntervalMs = 10_000
}, { fetchImpl = fetch, sleep = delay, now = () => performance.now(), log = console.log } = {}) {
  if (!apiBase) throw new Error('Set SOLEMI_STAGING_API_BASE to the staging Worker URL.')
  const base = new URL(apiBase)
  if (base.protocol !== 'https:' || !/staging/i.test(base.hostname) ||
    base.pathname !== '/' || base.search || base.hash || base.username || base.password) {
    throw new Error('Refusing to run against a non-staging HTTPS Worker origin.')
  }
  if (typeof expectedBuildSha !== 'string' || !/^[a-f0-9]{40}$/.test(expectedBuildSha)) {
    throw new Error('Set SOLEMI_EXPECTED_BUILD_SHA to the full 40-character checkout commit SHA.')
  }
  assert.ok(Number.isFinite(waitTimeoutMs) && waitTimeoutMs > 0, 'Invalid deployment wait timeout')
  assert.ok(Number.isFinite(pollIntervalMs) && pollIntervalMs > 0, 'Invalid polling interval')

  async function request(path, { method = 'GET', body } = {}, timeoutMs = 15_000) {
    const response = await fetchImpl(new URL(path, base), {
      method,
      headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs)))
    })
    try {
      assert.equal(response.headers.get('x-solemi-build-sha'), expectedBuildSha,
        `${method} ${path}: Worker commit must match ${expectedBuildSha}`)
      assert.equal(response.headers.get('access-control-allow-origin'), origin,
        `${method} ${path} must allow the internal Pages origin`)
    } catch (error) {
      // Release the connection while polling an old or unstamped deployment.
      await response.body?.cancel()
      throw error
    }
    const payload = await response.json()
    return { response, payload }
  }

  function verifyHealth({ response, payload }) {
    assert.equal(response.status, 200, 'Worker health must return 200')
    assert.equal(payload?.ok, true)
    assert.equal(payload?.data?.service, 'solemi-sleep-sync')
    assert.equal(payload?.data?.status, 'ok')
    assert.equal(payload?.data?.buildSha, expectedBuildSha, 'Health body must match the expected commit')
  }

  log(`Staging auth boundary smoke: ${base.origin}; expected commit ${expectedBuildSha}`)
  const deadline = now() + waitTimeoutMs
  let lastError
  let lastMessage
  while (true) {
    const remaining = deadline - now()
    if (remaining <= 0) {
      throw new Error(`Timed out waiting for staging commit ${expectedBuildSha}. Last check: ${lastError?.message ?? 'no response'}`)
    }
    try {
      verifyHealth(await request('/health', {}, Math.min(15_000, remaining)))
      assert.ok(now() < deadline, 'Deployment readiness deadline exceeded')
      break
    } catch (error) {
      lastError = error
      if (error.message !== lastMessage) {
        log(`Waiting for the expected deployment: ${error.message}`)
        lastMessage = error.message
      }
    }
    const pause = Math.min(pollIntervalMs, deadline - now())
    if (pause > 0) await sleep(pause)
  }

  async function expectRejected(path, status, code, options) {
    // Keep checking the SHA: a deployment can change after the health probe.
    const { response, payload } = await request(path, options)
    assert.equal(response.status, status, `${options?.method || 'GET'} ${path}: ${JSON.stringify(payload)}`)
    assert.equal(payload?.ok, false)
    assert.equal(payload?.error?.code, code)
  }

  // Empty bodies cannot create data even if enforcement is accidentally disabled.
  await expectRejected('/v1/families', 401, 'ACCOUNT_REQUIRED', { method: 'POST', body: {} })
  await expectRejected('/v1/join', 401, 'ACCOUNT_REQUIRED', { method: 'POST', body: {} })
  await expectRejected('/v1/auth/access', 401, 'SESSION_INVALID')
  await expectRejected('/v1/auth/family/create', 401, 'SESSION_INVALID', { method: 'POST', body: {} })
  await expectRejected('/v1/auth/family/join', 401, 'SESSION_INVALID', { method: 'POST', body: {} })
  await expectRejected('/v1/auth/test/plan', 401, 'SESSION_INVALID', { method: 'POST', body: { plan: 'familyPlus' } })
  verifyHealth(await request('/health'))

  log(`PASS: every response matched Worker commit ${expectedBuildSha}`)
  log('PASS: health and internal-origin CORS')
  log('PASS: legacy anonymous family creation and join are blocked')
  log('PASS: account access, family mutation and test plan require a session')
  log('Authenticated two-account Family Sync remains a separate staging acceptance test.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runStagingSmoke({
    apiBase: process.env.SOLEMI_STAGING_API_BASE,
    expectedBuildSha: process.env.SOLEMI_EXPECTED_BUILD_SHA
  })
}
