import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { JWTVerifyGetKey } from 'jose'

const keys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'), {
  timeoutDuration: 5000, cooldownDuration: 30_000, cacheMaxAge: 3_600_000
})
export type AppleIdentity = { issuer: 'https://appleid.apple.com'; subject: string;
  email: string | null; name: null; picture: null }
export async function appleNonce(nonce: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
export async function verifyAppleToken(token: string, clientId: string, nonce: string,
  options: { key?: JWTVerifyGetKey; now?: number } = {}): Promise<AppleIdentity> {
  const { payload } = await jwtVerify(token, options.key ?? keys, {
    algorithms: ['RS256'], issuer: 'https://appleid.apple.com', audience: clientId,
    requiredClaims: ['sub', 'iss', 'aud', 'exp', 'iat', 'nonce'], maxTokenAge: 600,
    clockTolerance: 0, currentDate: new Date(options.now ?? Date.now())
  })
  if (!payload.sub || payload.sub.length > 255 || payload.nonce !== await appleNonce(nonce)
    || (payload.email !== undefined && (typeof payload.email !== 'string' || payload.email.length > 320
      || ![true, 'true'].includes(payload.email_verified as boolean | string)))) throw new Error('APPLE_TOKEN_INVALID')
  // Apple's name is not in the signed ID token. Do not trust profile fields from JS.
  return { issuer: 'https://appleid.apple.com', subject: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null, name: null, picture: null }
}
