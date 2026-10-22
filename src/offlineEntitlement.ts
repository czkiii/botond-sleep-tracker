import { getActiveAccountWorkspaceId } from './accountWorkspace'

const KEY = 'solemiSleep:offlineEntitlement:v1'
const DEVICE_KEY = 'solemiSleep:offlineDevice:v1'
const MAX_MS = 30 * 24 * 60 * 60 * 1000
const CLOCK_TOLERANCE_MS = 60_000
type Receipt = { token: string; seenAt: number }
type Claims = { sub: string; deviceId: string; features: Array<'PDF_EXPORT' | 'FAMILY_PLUS_INSIGHTS'>; iat: number; exp: number }
let clock: { wall: number; monotonic: number } | null = null

function decode(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}

async function verify(token: string): Promise<Claims | null> {
  try {
    const publicJwk = JSON.parse(import.meta.env.VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK || 'null')
    if (!publicJwk || publicJwk.d) return null
    const [header, payload, signature, extra] = token.split('.')
    if (!header || !payload || !signature || extra !== undefined) return null
    const h = JSON.parse(new TextDecoder().decode(decode(header)))
    if (h.alg !== 'ES256' || h.typ !== 'JWT') return null
    const key = await crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, decode(signature),
      new TextEncoder().encode(`${header}.${payload}`))) return null
    const c = JSON.parse(new TextDecoder().decode(decode(payload)))
    if (c.version !== 1 || c.iss !== 'solemi-offline' || c.aud !== 'solemi-local-features'
      || typeof c.sub !== 'string' || typeof c.deviceId !== 'string'
      || !Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp) || c.exp <= c.iat
      || (c.exp - c.iat) * 1000 > MAX_MS || !Array.isArray(c.features) || !c.features.length
      || c.features.some((f: unknown) => f !== 'PDF_EXPORT' && f !== 'FAMILY_PLUS_INSIGHTS')) return null
    return c
  } catch { return null }
}

export function clearOfflineEntitlement() {
  localStorage.removeItem(KEY)
  clock = null
}

export function bindOfflineDevice(accountId: string, deviceId: string) {
  const binding = JSON.stringify({ accountId, deviceId })
  if (localStorage.getItem(DEVICE_KEY) !== binding) clearOfflineEntitlement()
  localStorage.setItem(DEVICE_KEY, binding)
}

export async function saveOfflineEntitlement(token: string | undefined, accountId: string, deviceId: string) {
  const epoch = localStorage.getItem('solemiSleep:authEpoch:v1')
  clearOfflineEntitlement()
  if (!token) return
  const c = await verify(token)
  if (!c || c.sub !== accountId || c.deviceId !== deviceId || getActiveAccountWorkspaceId() !== accountId
    || localStorage.getItem('solemiSleep:authEpoch:v1') !== epoch) return
  bindOfflineDevice(accountId, deviceId)
  // A successful online validation starts a fresh clock anchor. An incorrectly
  // configured local clock cannot extend the server's signed expiry.
  const now = Date.now()
  if (now < c.iat * 1000 - CLOCK_TOLERANCE_MS || now >= c.exp * 1000) return
  localStorage.setItem(KEY, JSON.stringify({ token, seenAt: Math.max(now, c.iat * 1000) }))
  clock = { wall: Math.max(now, c.iat * 1000), monotonic: performance.now() }
}

export async function readOfflineEntitlement() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Receipt
    const c = await verify(saved.token)
    // Verification is asynchronous: logout/account switching may have happened meanwhile.
    if (localStorage.getItem(KEY) !== raw) return null
    const binding = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null')
    if (!c || c.sub !== getActiveAccountWorkspaceId() || binding?.accountId !== c.sub || binding?.deviceId !== c.deviceId
      || !Number.isFinite(saved.seenAt) || saved.seenAt < c.iat * 1000) return null
    const wall = Date.now()
    const elapsed = clock ? clock.wall + Math.max(0, performance.now() - clock.monotonic) : wall
    const now = Math.max(wall, elapsed, saved.seenAt)
    if (wall < saved.seenAt - CLOCK_TOLERANCE_MS || wall < elapsed - CLOCK_TOLERANCE_MS || now >= c.exp * 1000) {
      clearOfflineEntitlement()
      return null
    }
    clock = { wall: now, monotonic: performance.now() }
    localStorage.setItem(KEY, JSON.stringify({ token: saved.token, seenAt: now }))
    return { features: c.features, accountFeatures: [], familyFeatures: [], membership: null,
      familySync: { status: 'NO_ACTIVE_MEMBERSHIP' as const, canSync: false }, offlineUntil: c.exp * 1000 }
  } catch { return null }
}
