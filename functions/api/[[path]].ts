const STAGING_API_ORIGIN = 'https://solemi-sleep-sync-staging.czki-adam.workers.dev'
const INTERNAL_APP_ORIGIN = 'https://solemi-sleep-internal.pages.dev'

type PagesContext = { request: Request; env?: {
  SOLEMI_PROXY_ENV?: string
  SOLEMI_API_ORIGIN?: string
} }

function proxyTarget(appOrigin: string, env: PagesContext['env']) {
  if (appOrigin === INTERNAL_APP_ORIGIN) {
    if (env?.SOLEMI_PROXY_ENV === 'production') return null
    return STAGING_API_ORIGIN
  }
  if (env?.SOLEMI_PROXY_ENV !== 'production' || !env.SOLEMI_API_ORIGIN) return null
  let upstream: URL
  try { upstream = new URL(env.SOLEMI_API_ORIGIN) } catch { return null }
  if (upstream.protocol !== 'https:' || upstream.username || upstream.password
    || upstream.pathname !== '/' || upstream.search || upstream.hash
    || /staging|internal|localhost|127\.0\.0\.1/i.test(upstream.hostname)) return null
  return upstream.origin
}

export async function onRequest({ request, env }: PagesContext) {
  const incomingUrl = new URL(request.url)
  if (!incomingUrl.pathname.startsWith('/api/v1/')) {
    return new Response('Not found', { status: 404 })
  }
  const appOrigin = incomingUrl.origin
  const apiOrigin = proxyTarget(appOrigin, env)
  if (!apiOrigin) return new Response('Proxy not configured', { status: 503 })

  const upstreamUrl = new URL(
    `${incomingUrl.pathname.slice('/api'.length)}${incomingUrl.search}`,
    apiOrigin
  )
  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.set('Origin', appOrigin)

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
