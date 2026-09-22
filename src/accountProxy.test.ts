import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from '../functions/api/[[path]]'

afterEach(() => vi.unstubAllGlobals())

describe('internal account proxy', () => {
  it('forwards auth requests to staging and converts the refresh cookie to first-party scope', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      expect(request.url).toBe('https://solemi-sleep-sync-staging.czki-adam.workers.dev/v1/auth/refresh?source=test')
      expect(request.headers.get('Origin')).toBe('https://solemi-sleep-internal.pages.dev')
      expect(request.headers.get('Cookie')).toBe('solemi_refresh=old-token')
      expect(await request.text()).toBe('{"refresh":true}')
      return new Response('{"ok":true}', {
        headers: { 'Set-Cookie': 'solemi_refresh=new-token; Path=/v1/auth; HttpOnly; Secure; SameSite=None' }
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await onRequest({ request: new Request(
      'https://solemi-sleep-internal.pages.dev/api/v1/auth/refresh?source=test',
      { method: 'POST', headers: { Cookie: 'solemi_refresh=old-token', Origin: 'https://solemi-sleep-internal.pages.dev', 'Sec-Fetch-Site': 'same-origin' }, body: '{"refresh":true}' }
    ) })

    expect(response.status).toBe(200)
    expect(response.headers.get('Set-Cookie')).toBe(
      'solemi_refresh=new-token; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax'
    )
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects paths outside the versioned API namespace', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await onRequest({ request: new Request('https://solemi-sleep-internal.pages.dev/api/private') })
    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses to send production-host traffic to the internal staging backend', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await onRequest({ request: new Request('https://solemi-sleep.app/api/v1/auth/refresh', {
      method: 'POST', body: '{}'
    }) })
    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses an explicitly configured production backend for the production host', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const forwarded = new Request(input, init)
      expect(forwarded.url).toBe('https://solemi-sleep-sync.czki-adam.workers.dev/v1/auth/refresh')
      expect(forwarded.headers.get('Origin')).toBe('https://solemi-sleep.app')
      return new Response('{"ok":true}', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const response = await onRequest({
      request: new Request('https://solemi-sleep.app/api/v1/auth/refresh', { method: 'POST', headers: { Origin: 'https://solemi-sleep.app' }, body: '{}' }),
      env: { SOLEMI_PROXY_ENV: 'production',
        SOLEMI_API_ORIGIN: 'https://solemi-sleep-sync.czki-adam.workers.dev' }
    })
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects a staging upstream in production configuration', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await onRequest({
      request: new Request('https://solemi-sleep.app/api/v1/auth/refresh'),
      env: { SOLEMI_PROXY_ENV: 'production',
        SOLEMI_API_ORIGIN: 'https://solemi-sleep-sync-staging.czki-adam.workers.dev' }
    })
    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'foreign Origin', headers: { Origin: 'https://foreign.example' } },
    { name: 'missing Origin', headers: {} },
    { name: 'cross-site fetch metadata', headers: { Origin: 'https://solemi-sleep-internal.pages.dev', 'Sec-Fetch-Site': 'cross-site' } },
    { name: 'same-site sibling', headers: { Origin: 'https://solemi-sleep-internal.pages.dev', 'Sec-Fetch-Site': 'same-site' } }
  ])('rejects a mutation with $name before forwarding credentials', async ({ headers }) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const requestHeaders = new Headers()
    for (const [name, value] of Object.entries(headers)) {
      if (value !== undefined) requestHeaders.set(name, value)
    }
    requestHeaders.set('Cookie', 'solemi_refresh=secret')
    const response = await onRequest({ request: new Request(
      'https://solemi-sleep-internal.pages.dev/api/v1/auth/refresh',
      { method: 'POST', headers: requestHeaders }
    ) })
    expect(response.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects cross-site reads and requests outside the allowed API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const crossSite = await onRequest({ request: new Request(
      'https://solemi-sleep-internal.pages.dev/api/v1/auth/me',
      { headers: { 'Sec-Fetch-Site': 'cross-site', Cookie: 'solemi_refresh=secret' } }
    ) })
    const syncPath = await onRequest({ request: new Request(
      'https://solemi-sleep-internal.pages.dev/api/v1/families',
      { headers: { Origin: 'https://solemi-sleep-internal.pages.dev' } }
    ) })
    expect(crossSite.status).toBe(403)
    expect(syncPath.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    { method: 'GET', path: '/v1/sync?after=0' },
    { method: 'GET', path: '/v1/device' },
    { method: 'POST', path: '/v1/device/leave' },
    { method: 'POST', path: '/v1/invites' },
    { method: 'POST', path: '/v1/children' },
    { method: 'PATCH', path: '/v1/children/child_1' },
    { method: 'POST', path: '/v1/sessions/start' },
    { method: 'POST', path: '/v1/sessions' },
    { method: 'POST', path: '/v1/sessions/sleep_1/end' },
    { method: 'PATCH', path: '/v1/sessions/sleep_1' },
    { method: 'DELETE', path: '/v1/sessions/sleep_1' },
    { method: 'DELETE', path: '/v1/children/child_1' }
  ])('forwards authenticated family $method $path through the protected proxy', async ({ method, path }) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const forwarded = new Request(input, init)
      expect(forwarded.url).toBe(`https://solemi-sleep-sync-staging.czki-adam.workers.dev${path}`)
      expect(forwarded.headers.get('Authorization')).toBe('Bearer account-token')
      expect(forwarded.headers.get('X-Solemi-Family-Token')).toBe('family-token')
      expect(forwarded.headers.get('Origin')).toBe('https://solemi-sleep-internal.pages.dev')
      return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const response = await onRequest({ request: new Request(
      `https://solemi-sleep-internal.pages.dev/api${path}`,
      { method, headers: { Origin: 'https://solemi-sleep-internal.pages.dev',
        Authorization: 'Bearer account-token', 'X-Solemi-Family-Token': 'family-token',
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }) },
      ...(method === 'GET' ? {} : { body: '{}' }) }
    ) })
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects a foreign-origin family mutation before forwarding its credentials', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await onRequest({ request: new Request(
      'https://solemi-sleep-internal.pages.dev/api/v1/invites',
      { method: 'POST', headers: { Origin: 'https://foreign.example',
        Authorization: 'Bearer account-token', 'X-Solemi-Family-Token': 'family-token' }, body: '{}' }
    ) })
    expect(response.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards only the account headers required by the backend', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const forwarded = new Request(input, init)
      expect(forwarded.headers.get('Authorization')).toBe('Bearer token')
      expect(forwarded.headers.get('X-Solemi-Family-Token')).toBe('family-token')
      expect(forwarded.headers.get('X-Forwarded-For')).toBeNull()
      expect(forwarded.headers.get('Sec-Fetch-Site')).toBeNull()
      return new Response('{}')
    })
    vi.stubGlobal('fetch', fetchMock)
    const response = await onRequest({ request: new Request(
      'https://solemi-sleep-internal.pages.dev/api/v1/auth/family/data/clear',
      { method: 'POST', headers: { Origin: 'https://solemi-sleep-internal.pages.dev',
        Authorization: 'Bearer token', 'X-Solemi-Family-Token': 'family-token',
        'X-Forwarded-For': 'spoofed', 'Sec-Fetch-Site': 'same-origin' } }
    ) })
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects oversized account requests before forwarding them', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await onRequest({ request: new Request(
      'https://solemi-sleep-internal.pages.dev/api/v1/auth/google',
      { method: 'POST', headers: { Origin: 'https://solemi-sleep-internal.pages.dev',
        'Content-Type': 'application/json' }, body: 'x'.repeat(64 * 1024 + 1) }
    ) })
    expect(response.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
