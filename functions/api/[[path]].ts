const STAGING_API_ORIGIN = 'https://solemi-sleep-sync-staging.czki-adam.workers.dev'
const INTERNAL_APP_ORIGIN = 'https://solemi-sleep-internal.pages.dev'

type PagesContext = { request: Request }

export async function onRequest({ request }: PagesContext) {
  const incomingUrl = new URL(request.url)
  if (!incomingUrl.pathname.startsWith('/api/v1/')) {
    return new Response('Not found', { status: 404 })
  }

  const upstreamUrl = new URL(
    `${incomingUrl.pathname.slice('/api'.length)}${incomingUrl.search}`,
    STAGING_API_ORIGIN
  )
  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.set('Origin', INTERNAL_APP_ORIGIN)

  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer()
  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body,
    redirect: 'manual'
  })

  const responseHeaders = new Headers(upstream.headers)
  const cookie = responseHeaders.get('Set-Cookie')
  if (cookie) {
    responseHeaders.set('Set-Cookie', cookie
      .replace(/Path=\/v1\/auth(?=;|$)/i, 'Path=/api/v1/auth')
      .replace(/SameSite=None/i, 'SameSite=Lax'))
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  })
}
