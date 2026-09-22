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
      { method: 'POST', headers: { Cookie: 'solemi_refresh=old-token' }, body: '{"refresh":true}' }
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
      request: new Request('https://solemi-sleep.app/api/v1/auth/refresh', { method: 'POST', body: '{}' }),
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
})
