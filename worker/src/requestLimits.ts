// Service-level ceilings shared across routes; no client-supplied identity can
// rotate around them. Cloudflare counters are per PoP, not global billing caps.
export interface LimitBinding { limit(options: { key: string }): Promise<{ success: boolean }> }
export interface LimitEnv {
  SOLEMI_ENVIRONMENT?: string
  API_LIMITER?: LimitBinding
  AUTH_LIMITER?: LimitBinding
  INVITE_LIMITER?: LimitBinding
}
export class RequestLimitError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
export async function consumeLimit(binding: LimitBinding | undefined, key: string) {
  if (!binding) return
  let success: boolean
  try { ({ success } = await binding.limit({ key })) }
  catch { throw new RequestLimitError(503, 'RATE_LIMIT_UNAVAILABLE') }
  if (!success) throw new RequestLimitError(429, 'RATE_LIMITED')
}
export async function limitRequest(request: Request, env: LimitEnv, path: string) {
  if (['staging', 'production'].includes(env.SOLEMI_ENVIRONMENT ?? '')
    && (!env.API_LIMITER || !env.AUTH_LIMITER || !env.INVITE_LIMITER)) {
    throw new RequestLimitError(503, 'RATE_LIMIT_NOT_CONFIGURED')
  }
  await consumeLimit(env.API_LIMITER, 'api')
  if ((request.method === 'GET' && path === '/v1/auth/challenge')
    || (request.method === 'POST' && ['/v1/auth/google', '/v1/auth/refresh',
      '/v1/auth/trial/activate', '/v1/auth/trial/bind', '/v1/auth/family/create', '/v1/auth/family/join', '/v1/families', '/v1/join'].includes(path))) {
    await consumeLimit(env.AUTH_LIMITER, 'entry')
  }
}
