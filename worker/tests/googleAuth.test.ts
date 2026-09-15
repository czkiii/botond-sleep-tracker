import { describe, expect, it } from 'vitest'
import { SignJWT, generateKeyPair } from 'jose'
import { verifyGoogleToken } from '../src/googleAuth'

const now = 1_800_000_000_000
const clientId = 'solemi.apps.googleusercontent.com'
const nonce = 'a'.repeat(64)

async function token(overrides: Record<string, unknown> = {}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const claims = {
    iss: 'https://accounts.google.com', aud: clientId, sub: 'google-subject',
    email: 'parent@example.test', email_verified: true, nonce,
    iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 300,
    ...overrides
  }
  return {
    value: await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(privateKey),
    key: async () => publicKey
  }
}

describe('Google ID token verification', () => {
  it('accepts a signed token with the configured audience and nonce', async () => {
    const signed = await token({ name: 'Parent', picture: 'https://example.test/avatar.png' })
    await expect(verifyGoogleToken(signed.value, clientId, nonce, { key: signed.key, now })).resolves.toEqual({
      issuer: 'https://accounts.google.com', subject: 'google-subject', email: 'parent@example.test',
      name: 'Parent', picture: 'https://example.test/avatar.png'
    })
  })

  it.each([
    ['audience', { aud: 'attacker.apps.googleusercontent.com' }],
    ['issuer', { iss: 'https://attacker.example' }],
    ['expiry', { exp: Math.floor(now / 1000) - 1 }],
    ['issued-at age', { iat: Math.floor(now / 1000) - 601 }],
    ['nonce', { nonce: 'b'.repeat(64) }],
    ['verified email', { email_verified: false }],
    ['authorized party', { azp: 'another.apps.googleusercontent.com' }]
  ])('rejects an invalid %s', async (_label, overrides) => {
    const signed = await token(overrides)
    await expect(verifyGoogleToken(signed.value, clientId, nonce, { key: signed.key, now })).rejects.toThrow()
  })
})
