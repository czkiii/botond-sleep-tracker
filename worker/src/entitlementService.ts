import { featuresForSubscriptionProduct } from './billingContract'

export const entitlementFeatures = ['FAMILY_SYNC', 'PDF_EXPORT', 'FAMILY_PLUS_INSIGHTS'] as const
export type EntitlementFeature = typeof entitlementFeatures[number]
export type TestPlan = 'free' | 'family' | 'familyPlus'

type MembershipRow = { family_id: string; role: 'ADMIN' | 'MEMBER' }
type FeatureRow = { feature_key: EntitlementFeature }

export class EntitlementService {
  constructor(private db: D1Database) {}

  async accountFeatures(accountId: string, now = Date.now()) {
    const result = await this.db.prepare(`SELECT DISTINCT feature_key
      FROM account_entitlements
      WHERE account_id = ? AND revoked_at IS NULL
        AND valid_from <= ? AND valid_until > ?
      ORDER BY feature_key`).bind(accountId, now, now).all<FeatureRow>()
    return result.results.map((row) => row.feature_key)
  }

  async activeMembership(accountId: string) {
    return this.db.prepare(`SELECT family_id, role FROM legacy_family_memberships
      WHERE account_id = ? AND status = 'ACTIVE'`).bind(accountId).first<MembershipRow>()
  }

  async familyFeatures(familyId: string, now = Date.now()) {
    const result = await this.db.prepare(`SELECT DISTINCT e.feature_key
      FROM legacy_family_memberships m
      JOIN account_entitlements e ON e.account_id = m.account_id
      WHERE m.family_id = ? AND m.status = 'ACTIVE'
        AND e.revoked_at IS NULL AND e.valid_from <= ? AND e.valid_until > ?
      ORDER BY e.feature_key`).bind(familyId, now, now).all<FeatureRow>()
    return result.results.map((row) => row.feature_key)
  }

  async familyCanSync(familyId: string, now = Date.now()) {
    return (await this.familyFeatures(familyId, now)).includes('FAMILY_SYNC')
  }

  async familyHasAccountMembers(familyId: string) {
    const row = await this.db.prepare(`SELECT EXISTS (
      SELECT 1 FROM legacy_family_memberships
      WHERE family_id = ? AND status = 'ACTIVE'
    ) AS found`).bind(familyId).first<{ found: number }>()
    return row?.found === 1
  }

  async accessState(accountId: string, now = Date.now()) {
    const [accountFeatures, membership] = await Promise.all([
      this.accountFeatures(accountId, now),
      this.activeMembership(accountId)
    ])
    const familyFeatures = membership ? await this.familyFeatures(membership.family_id, now) : []
    const features = [...new Set([...accountFeatures, ...familyFeatures])].sort()
    const familySync = familyFeatures.includes('FAMILY_SYNC')
    return {
      features,
      accountFeatures,
      familyFeatures,
      membership: membership ? { familyId: membership.family_id, role: membership.role } : null,
      familySync: {
        status: !membership ? 'NO_ACTIVE_MEMBERSHIP' : familySync ? 'ACTIVE' : 'PAUSED',
        canSync: familySync,
        ...(membership ? { familyId: membership.family_id } : {})
      }
    }
  }

  async setManualTestPlan(accountId: string, plan: TestPlan, now = Date.now()) {
    const subscriptionId = `sub_manual_${accountId}`
    const accessUntil = now + 365 * 24 * 60 * 60 * 1000
    if (plan === 'free') {
      await this.db.batch([
        this.db.prepare(`UPDATE account_entitlements SET revoked_at = ?, updated_at = ?
          WHERE account_id = ? AND source_type = 'SUBSCRIPTION' AND source_id = ? AND revoked_at IS NULL`)
          .bind(now, now, accountId, subscriptionId),
        this.db.prepare(`UPDATE subscriptions SET status = 'EXPIRED', auto_renews = 0,
          current_period_ends_at = ?, access_until = ?, updated_at = ?, canceled_at = ?
          WHERE id = ? AND provider = 'MANUAL'`).bind(now, now, now, now, subscriptionId)
      ])
      return this.accessState(accountId, now)
    }

    const product = plan === 'familyPlus' ? 'FAMILY_PLUS' : 'FAMILY'
    const wanted: EntitlementFeature[] = featuresForSubscriptionProduct(product)
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`INSERT INTO subscriptions
        (id, account_id, provider, provider_subscription_id, product, status, auto_renews,
         trial_ends_at, current_period_ends_at, access_until, created_at, updated_at, canceled_at)
        VALUES (?, ?, 'MANUAL', ?, ?, 'ACTIVE', 1, NULL, ?, ?, ?, ?, NULL)
        ON CONFLICT(provider, provider_subscription_id) DO UPDATE SET
          product = excluded.product, status = 'ACTIVE', auto_renews = 1,
          current_period_ends_at = excluded.current_period_ends_at,
          access_until = excluded.access_until, updated_at = excluded.updated_at, canceled_at = NULL`)
        .bind(subscriptionId, accountId, accountId, product, accessUntil, accessUntil, now, now),
      this.db.prepare(`UPDATE account_entitlements SET revoked_at = ?, updated_at = ?
        WHERE account_id = ? AND source_type = 'SUBSCRIPTION' AND source_id = ? AND revoked_at IS NULL`)
        .bind(now, now, accountId, subscriptionId)
    ]
    for (const feature of wanted) {
      statements.push(this.db.prepare(`INSERT INTO account_entitlements
        (id, account_id, feature_key, source_type, source_id, valid_from, valid_until,
         revoked_at, created_at, updated_at)
        VALUES (?, ?, ?, 'SUBSCRIPTION', ?, ?, ?, NULL, ?, ?)
        ON CONFLICT(account_id, feature_key, source_type, source_id) DO UPDATE SET
          valid_from = excluded.valid_from, valid_until = excluded.valid_until,
          revoked_at = NULL, updated_at = excluded.updated_at`)
        .bind(`ent_manual_${accountId}_${feature.toLowerCase()}`, accountId, feature,
          subscriptionId, now, accessUntil, now, now))
    }
    await this.db.batch(statements)
    return this.accessState(accountId, now)
  }
}
