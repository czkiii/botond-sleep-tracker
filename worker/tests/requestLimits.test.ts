import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { consumeLimit, limitRequest } from '../src/requestLimits'
import { onRequest } from '../../functions/api/[[path]]'
import { readFileSync } from 'node:fs'

afterEach(() => vi.restoreAllMocks())
const allow = () => ({ limit: vi.fn(async () => ({ success: true })) })
const environment = () => ({ DB: { prepare: vi.fn(() => { throw new Error('must not touch D1') }) } as unknown as D1Database,
  TOKEN_PEPPER: 'test', ALLOWED_ORIGINS: 'https://solemi-sleep-internal.pages.dev', SOLEMI_ENVIRONMENT: 'staging',
  API_LIMITER: allow(), AUTH_LIMITER: allow(), INVITE_LIMITER: allow() })

describe('request budgets before database/provider work', () => {
  it.each(['API_LIMITER', 'AUTH_LIMITER', 'INVITE_LIMITER'] as const)('fails closed without %s', async name => {
    const env = environment(); delete (env as Partial<typeof env>)[name]
    const response = await worker.fetch(new Request('https://worker/v1/auth/challenge'), env)
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(env.DB.prepare).not.toHaveBeenCalled()
  })
  it.each(['/v1/auth/challenge', '/v1/auth/google', '/v1/auth/refresh', '/v1/auth/family/join',
    '/v1/auth/family/create', '/v1/auth/trial/activate', '/v1/auth/trial/bind', '/v1/join', '/v1/families'])('shares entry budget for %s, regardless of fake identity', async path => {
    const env = environment(); env.AUTH_LIMITER.limit.mockResolvedValue({ success: false })
    const response = await worker.fetch(new Request(`https://worker${path}`, {
      method: path.endsWith('challenge') ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer rotated', 'X-Forwarded-For': 'arbitrary' }
    }), env)
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } })
    expect(env.AUTH_LIMITER.limit).toHaveBeenCalledWith({ key: 'entry' })
    expect(env.DB.prepare).not.toHaveBeenCalled()
  })
  it('allows exactly the configured entry burst, then resumes after a new minute', async () => {
    const env = environment(); let count = 0
    env.AUTH_LIMITER.limit.mockImplementation(async () => ({ success: ++count <= 120 }))
    for (let i = 0; i < 120; i++) await limitRequest(new Request('https://worker/v1/auth/challenge'), env, '/v1/auth/challenge')
    await expect(limitRequest(new Request('https://worker/v1/auth/challenge'), env, '/v1/auth/challenge'))
      .rejects.toMatchObject({ status: 429 })
    count = 0
    await expect(limitRequest(new Request('https://worker/v1/auth/challenge'), env, '/v1/auth/challenge')).resolves.toBeUndefined()
  })
  it('does not charge entry budget for ordinary polls or logout', async () => {
    const env = environment()
    for (const path of ['/v1/sync', '/v1/auth/access', '/v1/auth/logout']) {
      await limitRequest(new Request(`https://worker${path}`, { method: path.endsWith('logout') ? 'POST' : 'GET' }), env, path)
    }
    expect(env.API_LIMITER.limit).toHaveBeenCalledTimes(3)
    expect(env.AUTH_LIMITER.limit).not.toHaveBeenCalled()
  })
  it('fails closed when the limiting service fails, without logging secrets', async () => {
    const env = environment(); const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    env.API_LIMITER.limit.mockRejectedValue(new Error('secret database token'))
    const response = await worker.fetch(new Request('https://worker/v1/sync'), env)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('secret')
    expect(log).not.toHaveBeenCalled()
    expect(env.DB.prepare).not.toHaveBeenCalled()
  })
  it('keeps health/preflight available when the application budget is exhausted', async () => {
    const env = environment(); env.API_LIMITER.limit.mockResolvedValue({ success: false })
    expect((await worker.fetch(new Request('https://worker/health'), env)).status).toBe(200)
    expect((await worker.fetch(new Request('https://worker/v1/sync', { method: 'OPTIONS' }), env)).status).toBe(204)
    expect(env.API_LIMITER.limit).not.toHaveBeenCalled()
  })
  it('redacts unexpected database failures', async () => {
    const env = environment(); const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await worker.fetch(new Request('https://worker/v1/sync', { headers: { Authorization: 'Bearer private-token' } }), env)
    expect(response.status).toBe(500)
    expect(log).toHaveBeenCalledExactlyOnceWith('SOLEMI_INTERNAL_ERROR')
    expect(await response.text()).not.toContain('private-token')
  })
  it('separates invitation budgets by verified family', async () => {
    const counts = new Map<string, number>()
    const limiter = { limit: async ({ key }: { key: string }) => {
      counts.set(key, (counts.get(key) ?? 0) + 1); return { success: counts.get(key)! <= 30 }
    } }
    for (let i = 0; i < 30; i++) await consumeLimit(limiter, 'invite:a')
    await expect(consumeLimit(limiter, 'invite:a')).rejects.toMatchObject({ status: 429 })
    await expect(consumeLimit(limiter, 'invite:b')).resolves.toBeUndefined()
  })
  it('ships isolated rate budgets without paid-only CPU overrides on the Free account', () => {
    const configs = ['wrangler.jsonc', 'wrangler.staging.jsonc'].map(file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')))
    const ids = configs.flatMap(c => c.ratelimits.map((r: { namespace_id: string }) => r.namespace_id))
    expect(new Set(ids).size).toBe(6)
    for (const config of configs) {
      expect(config.ratelimits.map((r: { simple: unknown }) => r.simple)).toEqual([6000, 120, 30].map(limit => ({ limit, period: 60 })))
      // Cloudflare rejects even a small explicit CPU limit on Workers Free (100328).
      // Omitting it retains the platform's Free-plan CPU limit.
      expect(config.limits?.cpu_ms).toBeUndefined()
    }
  })
})

describe('API response security headers', () => {
  it.each(['/api/unknown', '/api/v1/sync', '/api/v1/auth/challenge'])('also protects local proxy errors at %s', async path => {
    const response = await onRequest({ request: new Request(`https://unconfigured.example${path}`) })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
  })
  it('does not leak proxy upstream failure details', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('private token in URL'))
    const response = await onRequest({ request: new Request('https://solemi-sleep-internal.pages.dev/api/v1/sync') })
    expect(response.status).toBe(502)
    expect(await response.text()).toBe('Upstream unavailable')
  })
})
