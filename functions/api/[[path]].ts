const STAGING_API_ORIGIN = 'https://solemi-sleep-sync-staging.czki-adam.workers.dev'
const INTERNAL_APP_ORIGIN = 'https://solemi-sleep-internal.pages.dev'
const MAX_JSON_BODY_BYTES = 64 * 1024
// Keep this contract aligned with the Worker's explicit routes. A new auth
// endpoint must be reviewed here before it can receive browser credentials.
const ROUTES: Array<[RegExp, string[]]> = [
  [/^\/api\/v1\/auth\/(?:challenge|me|access|trial|family\/(?:members|dissolution-preview))$/, ['GET']],
  [/^\/api\/v1\/auth\/(?:google|refresh|logout|test\/plan|trial\/(?:activate|bind)|family\/(?:claim|create|bootstrap|join|leave|dissolve|data\/clear))$/, ['POST']],
  [/^\/api\/v1\/(?:sync|device)$/, ['GET']],
  [/^\/api\/v1\/(?:invites|device\/leave|children|sessions(?:\/start|\/[^/]+\/end)?)$/, ['POST']],
  [/^\/api\/v1\/(?:children|sessions)\/[^/]+$/, ['PATCH', 'DELETE']]
]

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

export async function onRequest(context: PagesContext) {
  let response: Response
  try { response = await proxyRequest(context) }
  catch { response = new Response('Upstream unavailable', { status: 502 }) }
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  return response
}

async function proxyRequest({ request, env }: PagesContext) {
  const incomingUrl = new URL(request.url)
  const methods = [...new Set(ROUTES.filter(([path]) => path.test(incomingUrl.pathname)).flatMap(([, methods]) => methods))]
  if (!methods.length) {
    return new Response('Not found', { status: 404 })
  }
  const appOrigin = incomingUrl.origin
  const apiOrigin = proxyTarget(appOrigin, env)
  if (!apiOrigin) return new Response('Proxy not configured', { status: 503 })

  if (!methods.includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers: { Allow: methods.join(', '), 'Cache-Control': 'no-store' } })
  }
  const origin = request.headers.get('Origin')
  const fetchSite = request.headers.get('Sec-Fetch-Site')
  if ((origin && origin !== appOrigin)
    || (fetchSite && fetchSite !== 'same-origin')
    || (!['GET', 'HEAD'].includes(request.method) && origin !== appOrigin)) {
    return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }

  const upstreamUrl = new URL(
    `${incomingUrl.pathname.slice('/api'.length)}${incomingUrl.search}`,
    apiOrigin
  )
  const headers = new Headers()
  for (const name of ['Accept', 'Content-Type', 'Authorization', 'X-Solemi-Family-Token']) {
    const value = request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  headers.set('Origin', appOrigin)
  if (/^\/api\/v1\/auth\/(?:refresh|logout)$/.test(incomingUrl.pathname)) {
    const cookies = (request.headers.get('Cookie') || '').split(';').map(value => value.trim())
      .filter(value => value.startsWith('solemi_refresh='))
    // Preserve duplicates so the Worker can reject ambiguous credentials.
    if (cookies.length) headers.set('Cookie', cookies.join('; '))
  }

  let body: ArrayBuffer | undefined
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const declaredLength = Number(request.headers.get('Content-Length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
      return new Response('Request too large', { status: 413 })
    }
    if (request.body) {
      const reader = request.body.getReader()
      const buffer = new Uint8Array(MAX_JSON_BODY_BYTES)
      let length = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (length + value.byteLength > MAX_JSON_BODY_BYTES) {
          await reader.cancel().catch(() => {})
          return new Response('Request too large', { status: 413 })
        }
        buffer.set(value, length)
        length += value.byteLength
      }
      body = buffer.slice(0, length).buffer as ArrayBuffer
    }
  }
  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(12_000)
  })

  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.set('Cache-Control', 'no-store')
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
