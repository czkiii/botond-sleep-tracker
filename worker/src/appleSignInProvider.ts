import { importPKCS8, SignJWT } from 'jose'
import { verifyAppleToken } from './appleAuth'
import type { AppleIdentity } from './appleAuth'

export class AppleSignInError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code) }
}
export interface AppleSignInEnv {
  NATIVE_APPLE_CLIENT_ID?: string
  APPLE_SIGN_IN_TEAM_ID?: string
  APPLE_SIGN_IN_KEY_ID?: string
  APPLE_SIGN_IN_PRIVATE_KEY?: string
  APPLE_SIGN_IN_TOKEN_KEY?: string
  APPLE_SIGN_IN_LIFECYCLE_ENABLED?: string
}
export function appleSignInConfig(env: AppleSignInEnv) {
  if (env.APPLE_SIGN_IN_LIFECYCLE_ENABLED !== 'true' || !env.NATIVE_APPLE_CLIENT_ID
    || !/^[A-Z0-9]{10}$/.test(env.APPLE_SIGN_IN_TEAM_ID || '')
    || !/^[A-Z0-9]{10}$/.test(env.APPLE_SIGN_IN_KEY_ID || '')
    || !env.APPLE_SIGN_IN_PRIVATE_KEY?.includes('BEGIN PRIVATE KEY')
    || !/^[a-f0-9]{64}$/.test(env.APPLE_SIGN_IN_TOKEN_KEY || '')) throw new AppleSignInError('APPLE_SIGN_IN_NOT_CONFIGURED')
  return { clientId: env.NATIVE_APPLE_CLIENT_ID, teamId: env.APPLE_SIGN_IN_TEAM_ID!, keyId: env.APPLE_SIGN_IN_KEY_ID!,
    privateKey: env.APPLE_SIGN_IN_PRIVATE_KEY, tokenKey: env.APPLE_SIGN_IN_TOKEN_KEY! }
}
export type AppleSignInConfig = ReturnType<typeof appleSignInConfig>
export interface AppleSignInExchange {
  exchange(code: string, nonce: string, expected: AppleIdentity, now: number): Promise<{ token: string; identity: AppleIdentity }>
  revoke(token: string): Promise<void>
}
export class AppleSignInProvider implements AppleSignInExchange {
  constructor(private config: AppleSignInConfig, private transport: typeof fetch = fetch,
    private verify = verifyAppleToken) {}
  async clientSecret(now = Date.now()) {
    const key = await importPKCS8(this.config.privateKey, 'ES256')
    return new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: this.config.keyId })
      .setIssuer(this.config.teamId).setSubject(this.config.clientId).setAudience('https://appleid.apple.com')
      .setIssuedAt(Math.floor(now / 1000)).setExpirationTime(Math.floor(now / 1000) + 300).sign(key)
  }
  private async call(path: 'token' | 'revoke', values: Record<string, string>, now = Date.now()) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 5000)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const body = new URLSearchParams({ ...values, client_id: this.config.clientId, client_secret: await this.clientSecret(now) })
      const response = await this.transport(`https://appleid.apple.com/auth/${path}`, { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'error', signal: controller.signal })
      if (response.status !== 200) throw new AppleSignInError('APPLE_SIGN_IN_PROVIDER_UNAVAILABLE')
      // Revoke is idempotent: Apple also returns 200 for an already invalid token.
      if (path === 'revoke') { await response.body?.cancel(); return {} as Record<string, unknown> }
      reader = response.body?.getReader(); let text = '', size = 0; const decoder = new TextDecoder()
      while (reader) {
        const part = await reader.read(); if (part.done) break
        size += part.value.byteLength; if (size > 32_768) throw new AppleSignInError('APPLE_SIGN_IN_RESPONSE_INVALID')
        text += decoder.decode(part.value, { stream: true })
      }
      const data = JSON.parse(text + decoder.decode())
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppleSignInError('APPLE_SIGN_IN_RESPONSE_INVALID')
      return data as Record<string, unknown>
    } catch (error) {
      if (error instanceof AppleSignInError) throw error
      throw new AppleSignInError('APPLE_SIGN_IN_PROVIDER_UNAVAILABLE')
    } finally { clearTimeout(timeout); await reader?.cancel().catch(() => {}) }
  }
  async exchange(code: string, nonce: string, expected: AppleIdentity, now: number) {
    if (!code || code.length > 4096) throw new AppleSignInError('APPLE_AUTHORIZATION_CODE_REQUIRED', 400)
    const data = await this.call('token', { grant_type: 'authorization_code', code }, now)
    if (typeof data.refresh_token !== 'string' || !data.refresh_token || data.refresh_token.length > 8192
      || typeof data.id_token !== 'string' || data.id_token.length > 16_384) throw new AppleSignInError('APPLE_SIGN_IN_RESPONSE_INVALID')
    let identity: AppleIdentity
    try {
      identity = await this.verify(data.id_token, this.config.clientId, nonce, { now })
      if (identity.subject !== expected.subject) throw new Error('mismatch')
    } catch { throw new AppleSignInError('APPLE_TOKEN_INVALID', 401) }
    return { token: data.refresh_token, identity }
  }
  async revoke(token: string) { await this.call('revoke', { token, token_type_hint: 'refresh_token' }) }
}
