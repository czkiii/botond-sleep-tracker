import {
  featuresForSubscriptionProduct,
  subscriptionGrantsAccess,
  validateExternalAccountToken,
  validateVerifiedStoreEvent,
  validateVerifiedStoreSubscription,
  type StoreProvider,
  type VerifiedStoreEvent,
  type VerifiedStoreSubscription
} from './billingContract'

type AccountLinkRow = {
  account_id: string
  provider: StoreProvider
  external_account_token: string
}

type ExistingEventRow = {
  payload_hash: string
  processed_at: number | null
}

type ExistingSubscriptionRow = {
  id: string
  account_id: string
  last_verified_at: number | null
  provider_transaction_id: string | null
  last_applied_event_id: string | null
  environment: string | null
  external_account_token: string | null
}

type GoogleReplacementRow = {
  replacement_subscription_id: string
  account_id: string
  environment: string
  external_account_token: string
}

export type StoreBillingApplyResult = {
  outcome: 'APPLIED' | 'DUPLICATE' | 'STALE'
  subscriptionId: string | null
}

export type StoreBillingServiceErrorCode =
  | 'ACCOUNT_UNAVAILABLE'
  | 'ACCOUNT_LINK_MISMATCH'
  | 'EVENT_ID_REUSED'
  | 'PROVIDER_MISMATCH'
  | 'SUBSCRIPTION_OWNERSHIP_MISMATCH'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'LINKED_SUBSCRIPTION_OWNERSHIP_MISMATCH'
  | 'LINKED_SUBSCRIPTION_CONFLICT'

export class StoreBillingServiceError extends Error {
  constructor(readonly code: StoreBillingServiceErrorCode, message: string) {
    super(message)
    this.name = 'StoreBillingServiceError'
  }
}

type TokenFactory = {
  appleAccountToken(): string
  googleAccountToken(): string
  id(prefix: 'sub' | 'evt' | 'ent'): string
}

const defaultTokenFactory: TokenFactory = {
  appleAccountToken: () => crypto.randomUUID(),
  googleAccountToken: () => randomBase64Url(32),
  id: (prefix) => `${prefix}_${crypto.randomUUID()}`
}

export class StoreBillingService {
  constructor(
    private readonly db: D1Database,
    private readonly tokens: TokenFactory = defaultTokenFactory
  ) {}

  async getOrCreateAccountLink(accountId: string, provider: StoreProvider, now = Date.now()) {
    const existing = await this.findAccountLink(accountId, provider)
    if (existing) return existing.external_account_token

    const account = await this.db.prepare(
      `SELECT id FROM accounts WHERE id = ? AND status = 'ACTIVE'`
    ).bind(accountId).first<{ id: string }>()
    if (!account) {
      throw new StoreBillingServiceError('ACCOUNT_UNAVAILABLE', 'Active account is required')
    }

    const token = provider === 'APPLE'
      ? this.tokens.appleAccountToken()
      : this.tokens.googleAccountToken()
    validateExternalAccountToken(provider, token)

    try {
      await this.db.prepare(`INSERT INTO billing_account_links
        (account_id, provider, external_account_token, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`)
        .bind(accountId, provider, token, now, now).run()
      return token
    } catch (error) {
      const raced = await this.findAccountLink(accountId, provider)
      if (raced) return raced.external_account_token
      throw error
    }
  }

  async applyVerifiedSubscription(input: {
    accountId: string
    event: VerifiedStoreEvent
    subscription: VerifiedStoreSubscription
  }, firstPurchaseRetry = true): Promise<StoreBillingApplyResult> {
    const event = validateVerifiedStoreEvent(input.event)
    const subscription = validateVerifiedStoreSubscription(input.subscription)
    if (event.provider !== subscription.provider ||
      event.providerSubscriptionId !== subscription.providerSubscriptionId) {
      throw new StoreBillingServiceError(
        'PROVIDER_MISMATCH',
        'Event and subscription provider identities must match'
      )
    }

    const link = await this.findAccountLink(input.accountId, subscription.provider)
    if (!link || link.external_account_token !== subscription.externalAccountToken) {
      throw new StoreBillingServiceError(
        'ACCOUNT_LINK_MISMATCH',
        'Verified store account token does not belong to the signed-in account'
      )
    }

    const priorEvent = await this.db.prepare(`SELECT payload_hash, processed_at
      FROM subscription_events WHERE provider = ? AND provider_event_id = ?`)
      .bind(event.provider, event.providerEventId).first<ExistingEventRow>()
    if (priorEvent) {
      if (priorEvent.payload_hash !== event.payloadHash) {
        throw new StoreBillingServiceError(
          'EVENT_ID_REUSED',
          'Provider event ID was reused with a different payload'
        )
      }
      if (priorEvent.processed_at !== null) {
        const priorSubscription = await this.findSubscription(
          subscription.provider,
          subscription.providerSubscriptionId
        )
        return { outcome: 'DUPLICATE', subscriptionId: priorSubscription?.id ?? null }
      }
    }

    if (subscription.provider === 'GOOGLE_PLAY') {
      const replaced = await this.findGoogleReplacement(subscription.providerSubscriptionId)
      if (replaced) {
        const old = await this.findSubscription('GOOGLE_PLAY', subscription.providerSubscriptionId)
        return { outcome: 'STALE', subscriptionId: old?.id ?? null }
      }
    }

    const oldToken = subscription.replacementProviderSubscriptionId
    let linkedBefore: GoogleReplacementRow | null = null
    if (oldToken) {
      linkedBefore = await this.findGoogleReplacement(oldToken)
      const old = await this.findSubscription('GOOGLE_PLAY', oldToken)
      if (old && (old.account_id !== input.accountId ||
        old.environment !== subscription.environment ||
        old.external_account_token !== subscription.externalAccountToken)) {
        throw new StoreBillingServiceError('LINKED_SUBSCRIPTION_OWNERSHIP_MISMATCH',
          'Linked Google token belongs to another account or environment')
      }
      if (linkedBefore && (linkedBefore.account_id !== input.accountId ||
        linkedBefore.environment !== subscription.environment ||
        linkedBefore.external_account_token !== subscription.externalAccountToken)) {
        throw new StoreBillingServiceError('LINKED_SUBSCRIPTION_OWNERSHIP_MISMATCH',
          'Linked Google token belongs to another account or environment')
      }
    }

    const existing = await this.findSubscription(
      subscription.provider,
      subscription.providerSubscriptionId
    )
    if (existing && existing.account_id !== input.accountId) {
      throw new StoreBillingServiceError(
        'SUBSCRIPTION_OWNERSHIP_MISMATCH',
        'Store subscription is already linked to another account'
      )
    }

    const subscriptionId = existing?.id ?? this.tokens.id('sub')
    if (linkedBefore && linkedBefore.replacement_subscription_id !== subscriptionId) {
      throw new StoreBillingServiceError('LINKED_SUBSCRIPTION_CONFLICT',
        'Linked Google token was already replaced by another subscription')
    }
    const canceledAt = subscription.status === 'CANCELED' ? event.occurredAt : null
    const acknowledgement = subscription.provider === 'APPLE' ? 'NOT_REQUIRED' : 'PENDING'
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`INSERT INTO subscriptions
        (id, account_id, provider, provider_subscription_id, product, status, auto_renews,
         trial_ends_at, current_period_ends_at, access_until, created_at, updated_at, canceled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_subscription_id) DO UPDATE SET
          product = excluded.product,
          status = excluded.status,
          auto_renews = excluded.auto_renews,
          trial_ends_at = excluded.trial_ends_at,
          current_period_ends_at = excluded.current_period_ends_at,
          access_until = excluded.access_until,
          updated_at = excluded.updated_at,
          canceled_at = excluded.canceled_at
        WHERE subscriptions.account_id = excluded.account_id
          AND (subscriptions.status <> 'REVOKED' OR excluded.status = 'REVOKED')
          AND (
            NOT EXISTS (SELECT 1 FROM store_subscription_state current_state
              WHERE current_state.subscription_id = subscriptions.id)
            OR EXISTS (SELECT 1 FROM store_subscription_state current_state
              WHERE current_state.subscription_id = subscriptions.id
                AND (current_state.last_verified_at < ?
                  OR (current_state.last_verified_at = ?
                    AND excluded.status = 'REVOKED'
                    AND subscriptions.status <> 'REVOKED')))
          )`)
        .bind(subscriptionId, input.accountId, subscription.provider,
          subscription.providerSubscriptionId, subscription.product, subscription.status,
          subscription.autoRenews ? 1 : 0, subscription.trialEndsAt,
          subscription.currentPeriodEndsAt, subscription.accessUntil, subscription.startedAt,
          event.receivedAt, canceledAt, subscription.verifiedAt, subscription.verifiedAt),
      this.db.prepare(`INSERT INTO store_subscription_state
        (subscription_id, account_id, provider, environment, provider_transaction_id,
         external_account_token, last_verified_at, acknowledgement_state, acknowledged_at,
         replacement_provider_subscription_id, created_at, updated_at,
         last_applied_event_id, last_applied_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
        ON CONFLICT(subscription_id) DO UPDATE SET
          environment = excluded.environment,
          provider_transaction_id = excluded.provider_transaction_id,
          external_account_token = excluded.external_account_token,
          last_verified_at = excluded.last_verified_at,
          acknowledgement_state = CASE
            WHEN store_subscription_state.acknowledgement_state = 'ACKNOWLEDGED'
              THEN 'ACKNOWLEDGED'
            ELSE excluded.acknowledgement_state
          END,
          acknowledged_at = store_subscription_state.acknowledged_at,
          replacement_provider_subscription_id = excluded.replacement_provider_subscription_id,
          updated_at = excluded.updated_at,
          last_applied_event_id = excluded.last_applied_event_id,
          last_applied_status = excluded.last_applied_status
        WHERE (excluded.last_verified_at > store_subscription_state.last_verified_at
          OR (excluded.last_verified_at = store_subscription_state.last_verified_at
            AND excluded.last_applied_status = 'REVOKED'
            AND store_subscription_state.last_applied_status IS NOT 'REVOKED'))
          AND store_subscription_state.account_id = excluded.account_id
          AND EXISTS (SELECT 1 FROM subscriptions applied
            WHERE applied.id = excluded.subscription_id
              AND applied.status = ?)`)
        .bind(subscriptionId, input.accountId, subscription.provider, subscription.environment,
          subscription.providerTransactionId, subscription.externalAccountToken,
          subscription.verifiedAt, acknowledgement,
          subscription.replacementProviderSubscriptionId, event.receivedAt, event.receivedAt,
          event.providerEventId, subscription.status, subscription.status),
      this.db.prepare(`UPDATE account_entitlements
        SET revoked_at = ?, updated_at = ?
        WHERE account_id = ? AND source_type = 'SUBSCRIPTION' AND source_id = ?
          AND revoked_at IS NULL
          AND EXISTS (SELECT 1 FROM store_subscription_state current_state
            WHERE current_state.subscription_id = ?
              AND current_state.last_verified_at = ?
              AND current_state.last_applied_event_id = ?)`)
        .bind(event.receivedAt, event.receivedAt, input.accountId, subscriptionId,
          subscriptionId, subscription.verifiedAt, event.providerEventId)
    ]

    if (subscriptionGrantsAccess(subscription, event.receivedAt)) {
      for (const feature of featuresForSubscriptionProduct(subscription.product)) {
        statements.push(this.db.prepare(`INSERT INTO account_entitlements
          (id, account_id, feature_key, source_type, source_id, valid_from, valid_until,
           revoked_at, created_at, updated_at)
          SELECT ?, ?, ?, 'SUBSCRIPTION', ?, ?, ?, NULL, ?, ?
          WHERE EXISTS (SELECT 1 FROM store_subscription_state current_state
            WHERE current_state.subscription_id = ?
              AND current_state.last_verified_at = ?
              AND current_state.last_applied_event_id = ?)
          ON CONFLICT(account_id, feature_key, source_type, source_id) DO UPDATE SET
            valid_from = CASE WHEN account_entitlements.revoked_at IS NULL
              THEN account_entitlements.valid_from ELSE excluded.valid_from END,
            valid_until = excluded.valid_until,
            revoked_at = NULL,
            updated_at = excluded.updated_at`)
          .bind(this.tokens.id('ent'), input.accountId, feature, subscriptionId,
            event.receivedAt, subscription.accessUntil, event.receivedAt, event.receivedAt,
            subscriptionId, subscription.verifiedAt, event.providerEventId))
      }
    }

    if (oldToken && !linkedBefore) {
      statements.push(this.db.prepare(`UPDATE subscriptions
        SET status = 'REVOKED', auto_renews = 0, updated_at = ?, canceled_at = ?
        WHERE provider = 'GOOGLE_PLAY' AND provider_subscription_id = ?
          AND account_id = ?
          AND EXISTS (SELECT 1 FROM store_subscription_state old_state
            WHERE old_state.subscription_id = subscriptions.id
              AND old_state.environment = ?
              AND old_state.external_account_token = ?)
          AND EXISTS (SELECT 1 FROM store_subscription_state new_state
            WHERE new_state.subscription_id = ?
              AND new_state.last_applied_event_id = ?)`)
        .bind(event.receivedAt, event.receivedAt, oldToken, input.accountId,
          subscription.environment, subscription.externalAccountToken,
          subscriptionId, event.providerEventId))
      statements.push(this.db.prepare(`UPDATE account_entitlements
        SET revoked_at = ?, updated_at = ?
        WHERE account_id = ? AND source_type = 'SUBSCRIPTION' AND revoked_at IS NULL
          AND source_id IN (SELECT id FROM subscriptions
            WHERE provider = 'GOOGLE_PLAY' AND provider_subscription_id = ?
              AND account_id = ?)
          AND EXISTS (SELECT 1 FROM store_subscription_state new_state
            WHERE new_state.subscription_id = ?
              AND new_state.last_applied_event_id = ?)`)
        .bind(event.receivedAt, event.receivedAt, input.accountId, oldToken,
          input.accountId, subscriptionId, event.providerEventId))
      statements.push(this.db.prepare(`INSERT INTO google_token_replacements
        (old_purchase_token, replacement_subscription_id, account_id,
         environment, external_account_token, created_at)
        SELECT ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM store_subscription_state new_state
          WHERE new_state.subscription_id = ?
            AND new_state.last_applied_event_id = ?)
        ON CONFLICT(old_purchase_token) DO NOTHING`)
        .bind(oldToken, subscriptionId, input.accountId, subscription.environment,
          subscription.externalAccountToken, event.receivedAt,
          subscriptionId, event.providerEventId))
    }

    statements.push(this.insertProcessedEvent(event, subscriptionId))
    try {
      await this.db.batch(statements)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('LINKED_TOKEN_OWNER_MISMATCH')) {
        throw new StoreBillingServiceError('LINKED_SUBSCRIPTION_OWNERSHIP_MISMATCH',
          'Linked Google token belongs to another account or environment')
      }
      if (message.includes('LINKED_TOKEN_ALREADY_REPLACED')) {
        throw new StoreBillingServiceError('LINKED_SUBSCRIPTION_CONFLICT',
          'Linked Google token was already replaced by another subscription')
      }
      if (message.includes('REPLACED_GOOGLE_TOKEN')) {
        if (oldToken) {
          const winningLink = await this.findGoogleReplacement(oldToken)
          if (winningLink) {
            const winningSubscription = await this.findSubscription(
              subscription.provider, subscription.providerSubscriptionId
            )
            if (winningLink.replacement_subscription_id !== winningSubscription?.id) {
              throw new StoreBillingServiceError('LINKED_SUBSCRIPTION_CONFLICT',
                'Linked Google token was already replaced by another subscription')
            }
            if (firstPurchaseRetry) return this.applyVerifiedSubscription(input, false)
          }
        }
        const replaced = await this.findSubscription('GOOGLE_PLAY', subscription.providerSubscriptionId)
        return { outcome: 'STALE', subscriptionId: replaced?.id ?? null }
      }
      const racedEvent = await this.db.prepare(`SELECT payload_hash, processed_at
        FROM subscription_events WHERE provider = ? AND provider_event_id = ?`)
        .bind(event.provider, event.providerEventId).first<ExistingEventRow>()
      if (racedEvent && racedEvent.payload_hash !== event.payloadHash) {
        throw new StoreBillingServiceError('EVENT_ID_REUSED',
          'Provider event ID was reused with a different payload')
      }
      if (racedEvent?.processed_at !== null && racedEvent?.processed_at !== undefined) {
        const committed = await this.findSubscription(
          subscription.provider, subscription.providerSubscriptionId
        )
        return { outcome: 'DUPLICATE', subscriptionId: committed?.id ?? null }
      }
      if (!existing && firstPurchaseRetry) {
        const racedSubscription = await this.findSubscription(
          subscription.provider, subscription.providerSubscriptionId
        )
        if (racedSubscription && racedSubscription.id !== subscriptionId) {
          return this.applyVerifiedSubscription(input, false)
        }
      }
      throw error
    }
    const appliedState = await this.findSubscription(
      subscription.provider,
      subscription.providerSubscriptionId
    )
    const outcome = appliedState?.last_applied_event_id === event.providerEventId
      ? 'APPLIED'
      : 'STALE'
    return { outcome, subscriptionId }
  }

  async markGoogleAcknowledged(providerSubscriptionId: string, acknowledgedAt = Date.now()) {
    const result = await this.db.prepare(`UPDATE store_subscription_state
      SET acknowledgement_state = 'ACKNOWLEDGED', acknowledged_at = ?, updated_at = ?
      WHERE provider = 'GOOGLE_PLAY' AND subscription_id = (
        SELECT id FROM subscriptions
        WHERE provider = 'GOOGLE_PLAY' AND provider_subscription_id = ?
      )`).bind(acknowledgedAt, acknowledgedAt, providerSubscriptionId).run()
    if ((result.meta?.changes ?? 0) === 0) {
      throw new StoreBillingServiceError(
        'SUBSCRIPTION_NOT_FOUND',
        'Google Play subscription was not found'
      )
    }
  }

  private findAccountLink(accountId: string, provider: StoreProvider) {
    return this.db.prepare(`SELECT account_id, provider, external_account_token
      FROM billing_account_links WHERE account_id = ? AND provider = ?`)
      .bind(accountId, provider).first<AccountLinkRow>()
  }

  private findSubscription(provider: StoreProvider, providerSubscriptionId: string) {
    return this.db.prepare(`SELECT s.id, s.account_id, st.last_verified_at,
        st.provider_transaction_id, st.last_applied_event_id,
        st.environment, st.external_account_token
      FROM subscriptions s
      LEFT JOIN store_subscription_state st ON st.subscription_id = s.id
      WHERE s.provider = ? AND s.provider_subscription_id = ?`)
      .bind(provider, providerSubscriptionId).first<ExistingSubscriptionRow>()
  }

  private findGoogleReplacement(oldToken: string) {
    return this.db.prepare(`SELECT replacement_subscription_id, account_id,
        environment, external_account_token
      FROM google_token_replacements WHERE old_purchase_token = ?`)
      .bind(oldToken).first<GoogleReplacementRow>()
  }

  private insertProcessedEvent(event: VerifiedStoreEvent, subscriptionId: string) {
    return this.db.prepare(`INSERT INTO subscription_events
      (id, provider, provider_event_id, subscription_id, event_type, occurred_at,
       received_at, payload_hash, processed_at, processing_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
      .bind(this.tokens.id('evt'), event.provider, event.providerEventId, subscriptionId,
        event.eventType, event.occurredAt, event.receivedAt, event.payloadHash,
        event.receivedAt)
  }

}

function randomBase64Url(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
