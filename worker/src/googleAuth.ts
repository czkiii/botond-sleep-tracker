import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { JWTVerifyGetKey } from 'jose'

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  timeoutDuration: 5000, cooldownDuration: 30_000, cacheMaxAge: 3_600_000
})

export type GoogleIdentity = {
  issuer: 'https://accounts.google.com'
  subject: string
  email: string
  name: string | null
  picture: string | null
}

export async function verifyGoogleToken(
  token: string, clientId: string, nonce: string,
  options: { key?: JWTVerifyGetKey; now?: number } = {}
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(token, options.key ?? googleKeys, {
    algorithms: ['RS256'], audience: clientId,
    issuer: ['accounts.google.com', 'https://accounts.google.com'],
    requiredClaims: ['sub', 'iss', 'aud', 'exp', 'iat', 'nonce'],
    maxTokenAge: 600, clockTolerance: 0,
    currentDate: new Date(options.now ?? Date.now())
  })
  if (payload.nonce !== nonce || payload.email_verified !== true
    || !payload.sub || payload.sub.length > 255 || typeof payload.email !== 'string'
    || payload.email.length > 320
    || (payload.azp !== undefined && payload.azp !== clientId)) {
    throw new Error('GOOGLE_TOKEN_INVALID')
  }
  return {
    issuer: 'https://accounts.google.com', subject: payload.sub, email: payload.email,
    name: typeof payload.name === 'string' ? payload.name.slice(0, 200) : null,
    picture: typeof payload.picture === 'string' && payload.picture.startsWith('https://')
      ? payload.picture.slice(0, 2048) : null
  }
}
