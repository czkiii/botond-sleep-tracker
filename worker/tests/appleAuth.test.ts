import { describe, expect, it } from 'vitest'
import { generateKeyPair, SignJWT } from 'jose'
import { appleNonce, verifyAppleToken } from '../src/appleAuth'
const now = 1_800_000_000_000, nonce = 'a'.repeat(64), clientId = 'app.solemi.sleep'
async function signed(overrides: Record<string, unknown> = {}) {
  const keys = await generateKeyPair('RS256')
  const value = await new SignJWT({ iss: 'https://appleid.apple.com', aud: clientId, sub: 'stable-apple-subject',
    nonce: await appleNonce(nonce), email: 'relay@privaterelay.appleid.com', email_verified: 'true',
    iat: now / 1000, exp: now / 1000 + 300, ...overrides }).setProtectedHeader({ alg: 'RS256' }).sign(keys.privateKey)
  return { value, key: async () => keys.publicKey }
}
describe('Apple native proof', () => {
  it('accepts signed private relay email but does not trust client profile names', async () => {
    const s = await signed({ name: 'untrusted name' })
    await expect(verifyAppleToken(s.value, clientId, nonce, { key: s.key, now })).resolves.toEqual({
      issuer: 'https://appleid.apple.com', subject: 'stable-apple-subject', email: 'relay@privaterelay.appleid.com', name: null, picture: null })
  })
  it('allows an omitted email; identity is the signed stable subject', async () => {
    const s = await signed({ email: undefined, email_verified: undefined })
    expect((await verifyAppleToken(s.value, clientId, nonce, { key: s.key, now })).email).toBeNull()
  })
  it.each([{ aud: 'wrong.bundle' }, { iss: 'https://evil.invalid' }, { nonce }, { nonce: undefined },
    { exp: now / 1000 - 1 }, { iat: now / 1000 - 601 }, { sub: '' }, { email_verified: false }])('rejects invalid claims %j', async overrides => {
    const s = await signed(overrides)
    await expect(verifyAppleToken(s.value, clientId, nonce, { key: s.key, now })).rejects.toThrow()
  })
  it('rejects a different signing key', async () => {
    const s = await signed(), other = await generateKeyPair('RS256')
    await expect(verifyAppleToken(s.value, clientId, nonce, { key: async () => other.publicKey, now })).rejects.toThrow()
  })
})
