import { afterEach, describe, expect, it, vi } from 'vitest'
import { runStagingSmoke } from '../scripts/staging-smoke.mjs'
import { stagingDeployArgs } from '../scripts/deploy-staging.mjs'
import worker from '../src/index'

const sha = 'a'.repeat(40)
const otherSha = 'b'.repeat(40)
const origin = 'https://solemi-sleep-internal.pages.dev'
const config = {
  apiBase: 'https://solemi-sleep-sync-staging.example.com',
  expectedBuildSha: sha, waitTimeoutMs: 30, pollIntervalMs: 10
}

function reply(path: string, build: string | null = sha) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': origin })
  if (build !== null) headers.set('X-Solemi-Build-Sha', build)
  return Response.json(path === '/health'
    ? { ok: true, data: { service: 'solemi-sleep-sync', status: 'ok', buildSha: build } }
    : { ok: false, error: { code: path.startsWith('/v1/auth/') ? 'SESSION_INVALID' : 'ACCOUNT_REQUIRED' } },
  { status: path === '/health' ? 200 : 401, headers })
}

function harness(respond = (url: URL) => reply(url.pathname)) {
  let elapsed = 0
  return {
    fetchImpl: vi.fn(async (url: URL, _init: RequestInit) => respond(url)),
    sleep: vi.fn(async (ms: number) => { elapsed += ms }),
    now: () => elapsed,
    log: vi.fn()
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('staging smoke commit gate', () => {
  it.each([undefined, '', 'a'.repeat(7), 'local', 'A'.repeat(40)])('rejects invalid expected SHA %s before any request', async (expectedBuildSha) => {
    const deps = harness()
    await expect(runStagingSmoke({ ...config, expectedBuildSha }, deps)).rejects.toThrow('SOLEMI_EXPECTED_BUILD_SHA')
    expect(deps.fetchImpl).not.toHaveBeenCalled()
  })

  it.each(['https://production.example.com', 'http://staging.example.com',
    'https://staging.example.com/api', 'https://staging.example.com/?test=1',
    'https://user:pass@staging.example.com'])('rejects unsafe origin %s', async (apiBase) => {
    const deps = harness()
    await expect(runStagingSmoke({ ...config, apiBase }, deps)).rejects.toThrow('non-staging')
    expect(deps.fetchImpl).not.toHaveBeenCalled()
  })

  it('waits through the old deployment and network errors before running auth probes', async () => {
    const deps = harness()
    deps.fetchImpl.mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(reply('/health', otherSha))
    await runStagingSmoke(config, deps)
    expect(deps.sleep).toHaveBeenCalledTimes(2)
    const paths = deps.fetchImpl.mock.calls.map(([url]) => url.pathname)
    expect(paths.slice(0, 3)).toEqual(['/health', '/health', '/health'])
    expect(paths).toContain('/v1/auth/test/plan')
    expect(paths.at(-1)).toBe('/health')
    for (const [, init] of deps.fetchImpl.mock.calls) {
      expect(init.cache).toBe('no-store')
      expect(init.redirect).toBe('error')
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it.each([null, 'local', otherSha])('times out without auth probes for a missing/wrong build: %s', async (build) => {
    const deps = harness((url) => reply(url.pathname, build))
    await expect(runStagingSmoke(config, deps)).rejects.toThrow(`Timed out waiting for staging commit ${sha}`)
    expect(deps.fetchImpl.mock.calls.map(([url]) => url.pathname)).toEqual(['/health', '/health', '/health'])
    expect(deps.log.mock.calls.some(([line]) => line.startsWith('PASS:'))).toBe(false)
  })

  it('rejects a stale health body even when the header matches', async () => {
    const deps = harness(() => {
      const response = reply('/health', otherSha)
      response.headers.set('X-Solemi-Build-Sha', sha)
      return response
    })
    await expect(runStagingSmoke(config, deps)).rejects.toThrow('Health body must match')
  })

  it.each(['/v1/families', '/v1/auth/access', '/v1/auth/test/plan'])('fails when deployment changes at %s', async (changedPath) => {
    const deps = harness((url) => reply(url.pathname, url.pathname === changedPath ? otherSha : sha))
    await expect(runStagingSmoke(config, deps)).rejects.toThrow('Worker commit must match')
    expect(deps.log.mock.calls.some(([line]) => line.startsWith('PASS:'))).toBe(false)
    expect(deps.sleep).not.toHaveBeenCalled()
  })

  it('fails if the final health check changes version', async () => {
    let healthChecks = 0
    const deps = harness((url) => reply(url.pathname,
      url.pathname === '/health' && ++healthChecks === 2 ? otherSha : sha))
    await expect(runStagingSmoke(config, deps)).rejects.toThrow('Worker commit must match')
    expect(deps.log.mock.calls.some(([line]) => line.startsWith('PASS:'))).toBe(false)
  })

  it('still fails on an auth regression from the correct commit', async () => {
    const deps = harness((url) => url.pathname === '/v1/auth/access'
      ? Response.json({ ok: true }, { headers: reply(url.pathname).headers }) : reply(url.pathname))
    await expect(runStagingSmoke(config, deps)).rejects.toThrow('/v1/auth/access')
    expect(deps.log.mock.calls.some(([line]) => line.startsWith('PASS:'))).toBe(false)
  })

  it('still requires internal-origin CORS from the correct commit', async () => {
    const deps = harness((url) => {
      const response = reply(url.pathname)
      response.headers.delete('Access-Control-Allow-Origin')
      return response
    })
    await expect(runStagingSmoke(config, deps)).rejects.toThrow('must allow the internal Pages origin')
  })

  it('passes against the actual Worker routes with the expected build and no database operations', async () => {
    vi.stubGlobal('__SOLEMI_BUILD_SHA__', sha)
    const databaseAccess = vi.fn(() => { throw new Error('Smoke must not access the diary database') })
    const env = { DB: new Proxy({}, { get: databaseAccess }) as D1Database,
      TOKEN_PEPPER: 'test', ALLOWED_ORIGINS: origin, GOOGLE_CLIENT_ID: 'test',
      AUTH_SECRET: 'test-secret-with-at-least-32-characters',
      ACCOUNT_FAMILY_BRIDGE: 'true', ENTITLEMENT_ENFORCEMENT: 'true',
      SOLEMI_ENVIRONMENT: 'staging', ENTITLEMENT_TEST_MODE: 'true' }
    const deps = harness()
    deps.fetchImpl.mockImplementation((url, init) => worker.fetch(new Request(url, init), env))
    await runStagingSmoke(config, deps)
    expect(databaseAccess).not.toHaveBeenCalled()
    expect(deps.fetchImpl).toHaveBeenCalledTimes(8)
    expect(deps.log).toHaveBeenCalledWith(`PASS: every response matched Worker commit ${sha}`)
  })
})

describe('Worker build identity', () => {
  const env = { DB: {} as D1Database, TOKEN_PEPPER: 'test', ALLOWED_ORIGINS: origin,
    ENTITLEMENT_ENFORCEMENT: 'true' }

  it('marks unstamped development builds as local', async () => {
    const response = await worker.fetch(new Request('https://test/health'), env)
    expect(response.headers.get('x-solemi-build-sha')).toBe('local')
    expect((await response.json()).data.buildSha).toBe('local')
  })

  it('includes the build on health, rejected mutations and preflight, without caching', async () => {
    vi.stubGlobal('__SOLEMI_BUILD_SHA__', sha)
    for (const [path, method, status] of [['/health', 'GET', 200], ['/v1/families', 'POST', 401], ['/health', 'OPTIONS', 204]] as const) {
      const response = await worker.fetch(new Request(`https://test${path}`, { method }), env)
      expect(response.status).toBe(status)
      expect(response.headers.get('x-solemi-build-sha')).toBe(sha)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })
})

describe('staging deployment identity', () => {
  it('embeds the checkout commit into the staging artifact', () => {
    const args = stagingDeployArgs({ head: sha, status: '', ciSha: sha })
    expect(args).toEqual(['deploy', '--config', 'wrangler.staging.jsonc', '--define', `__SOLEMI_BUILD_SHA__:"${sha}"`])
  })

  it.each([' M worker/src/index.ts', '?? worker/src/new-route.ts'])('refuses dirty deploys: %s', (status) => {
    expect(() => stagingDeployArgs({ head: sha, status })).toThrow('Commit all local changes')
    expect(stagingDeployArgs({ head: sha, status, dryRun: true })).toContain('__SOLEMI_BUILD_SHA__:"local"')
    expect(stagingDeployArgs({ head: sha, status, dryRun: true })).toContain('--dry-run')
  })

  it('refuses disagreement between Cloudflare and the checkout', () => {
    expect(() => stagingDeployArgs({ head: sha, status: '', ciSha: otherSha })).toThrow('does not match')
    expect(() => stagingDeployArgs({ head: 'short', status: '' })).toThrow('Cannot identify')
  })
})
