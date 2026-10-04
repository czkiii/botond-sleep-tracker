import { importJWK, SignJWT } from 'jose'

const MAX_OFFLINE_MS = 30 * 24 * 60 * 60 * 1000

// This receipt authorizes local features only. Every cloud request still uses
// the current session, membership and entitlement checks.
export async function offlineEntitlement(db: D1Database, privateJwk: string | undefined,
  access: { account: { id: string }; deviceId: string; sessionId: string }, now = Date.now()) {
  if (!privateJwk) return undefined
  const grants = await db.prepare(`SELECT e.feature_key, MAX(e.valid_until) AS until_at
    FROM account_entitlements e
    WHERE e.revoked_at IS NULL AND e.valid_from <= ? AND e.valid_until > ?
      AND e.feature_key IN ('PDF_EXPORT', 'FAMILY_PLUS_INSIGHTS')
      AND (e.account_id = ? OR e.account_id IN (
        SELECT payer.account_id FROM legacy_family_memberships mine
        JOIN legacy_family_memberships payer ON payer.family_id = mine.family_id AND payer.status = 'ACTIVE'
        WHERE mine.account_id = ? AND mine.status = 'ACTIVE'))
    GROUP BY e.feature_key`).bind(now, now, access.account.id, access.account.id)
    .all<{ feature_key: string; until_at: number }>()
  const session = await db.prepare(`SELECT expires_at FROM account_sessions
    WHERE id = ? AND account_id = ? AND device_id = ? AND revoked_at IS NULL AND expires_at > ?`)
    .bind(access.sessionId, access.account.id, access.deviceId, now).first<{ expires_at: number }>()
  if (!session || !grants.results.length) return undefined
  const until = Math.min(now + MAX_OFFLINE_MS, session.expires_at, ...grants.results.map(row => row.until_at))
  const key = await importJWK(JSON.parse(privateJwk), 'ES256')
  return new SignJWT({ version: 1, deviceId: access.deviceId, features: grants.results.map(row => row.feature_key) })
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' }).setIssuer('solemi-offline')
    .setAudience('solemi-local-features').setSubject(access.account.id)
    .setIssuedAt(Math.floor(now / 1000)).setExpirationTime(Math.floor(until / 1000)).sign(key)
}
