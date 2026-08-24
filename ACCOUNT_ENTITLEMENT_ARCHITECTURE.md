# Solemi Sleep — Account & Entitlement Architecture

Status: **DESIGN IN PROGRESS — architecture pass, no production code yet**  
Date: 2026-08-24

This document turns the latest product decisions into a technical model before implementation. It intentionally separates identity, local sleep storage, Family Sync and paid feature visibility so that subscription logic does not contaminate the core sleep-data model.

## 1. Locked product direction

### Plans

Working commercial structure:

- **Free**
- **Family**
- **Family+**

The names are now the preferred direction. Exact pricing remains a later business decision.

### Identity

- V1 login provider: **Google only**.
- Login/account access itself is free and is not a paid feature.
- Every user has their own account.
- A family is shared by multiple accounts through a common `familyId` / membership model.
- One account may have at most **2 active devices** in the current product decision.
- Family-wide architecture must not hard-code a total family device limit; the per-account limit and family membership are separate concepts.
- A new phone can log into the same account and recover identity, entitlement and Family membership.

Google is an identity provider only. Solemi does not use Google as sleep-data storage.

## 2. Core architectural separation

The system must treat these as different layers:

```text
Google identity
      ↓
Solemi account
      ↓
Entitlements / Family membership
      ↓
Feature gates

Sleep data storage is separate:
Free      -> local-first/local sleep history
Family    -> local-first + shared cloud synchronization
Family+   -> same shared raw data + advanced derived features
```

Important rule:

> **Account != cloud sleep backup.**

A user can have an account while their Free sleep history remains local-first.

This preserves the current low-cost, offline-friendly architecture instead of uploading every Free user's raw sleep history merely because they logged in.

## 3. Proposed account records

Conceptual backend model:

```text
accounts
- id
- google_subject        unique stable Google identity key
- email                 informational / display, not primary identity key
- display_name          optional
- created_at
- last_login_at
- deleted_at

account_devices
- id
- account_id
- device_key/token hash
- created_at
- last_seen_at
- revoked_at

family_memberships
- family_id
- account_id
- role/status
- joined_at
- left_at

subscriptions
- id
- account_id
- product
- status
- trial_end
- current_period_end
- provider
- provider_reference
- updated_at

entitlements
- account_id
- feature_key
- active_until / status
- source
- updated_at
```

Exact schema will be finalized only after store/payment architecture is chosen.

## 4. Device tokens vs account identity

The existing Family Sync device token should not become the account identity.

Recommended hierarchy:

```text
Google login proves account identity
        ↓
backend issues/recognizes account session
        ↓
registered device receives its device credential
        ↓
Family Sync requests still identify the concrete device
```

Why keep both:

- account identity survives phone replacement;
- device credentials can be revoked independently;
- the 2-device-per-account rule can be enforced cleanly;
- Family Sync's existing device-aware idempotency/security model can be retained.

## 5. Free storage behavior

Current preferred direction:

- Free user is logged in.
- Sleep data remains local-first.
- No automatic full cloud sleep backup is required for Free.
- Export/backup remains available.
- Optional cloud backup may be considered later, but it must not be required by the V1 account architecture.

Consequence:

If a Free user loses the only device without an export/backup, the account alone does not magically reconstruct local sleep history.

This is acceptable only if the UI never falsely promises cloud backup for Free.

## 6. Upgrade to Family — safe bootstrap

When a Free/local user activates Family:

1. Validate account + active entitlement.
2. Create or attach the Family.
3. **Create an automatic local safety backup before migration.**
4. Preserve the local dataset untouched until cloud bootstrap succeeds.
5. Upload the canonical child profile(s) and sleep sessions.
6. Server acknowledges canonical Family state.
7. Client performs a verification sync.
8. Only then mark Family bootstrap complete.

If any step fails, local history remains available and bootstrap can be retried.

This replaces the current prototype behavior where Family creation clears local sessions.

## 7. Joining an existing Family

The already-locked collision rule remains:

- the Family creator's dataset is the initial canonical dataset;
- an invited phone does **not** blindly merge an unrelated local sleep database into the Family;
- the joining device adopts the Family cloud snapshot.

If we later want an explicit import/merge workflow, it must be a separate reviewed feature with duplicate detection. It must never happen silently.

## 8. Entitlement must gate features, not raw data formats

Raw child/session records use the same schema regardless of plan.

Do not create:

```text
FreeSleepSession
FamilySleepSession
FamilyPlusSleepSession
```

Instead:

```text
canonical raw data
        +
entitlement evaluator
        ↓
visible/usable features
```

This allows a non-paying family member to hold synchronized canonical data while their UI exposes only features available to their account.

Feature checks must be real application gates, not CSS-only hiding.

## 9. Current tier intent

### Free

Must remain genuinely usable:

- sleep start/stop/manual entry
- History
- basic statistics
- child profiles/basic multi-child local behavior if multi-child is considered a core data model capability
- account/login
- backup/export basics

### Family

Current intended primary value:

- Family Sync / multi-device shared family data
- shared child profiles and raw sleep history
- family membership/device workflow
- likely selected convenience features

### Family+

Current intended primary value:

- advanced Insights
- Wake Window personal analytics
- age-reference comparison where birth date exists
- next-sleep prediction range/confidence
- patterns/routines
- advanced trends
- similar-day analysis
- other high-value derived intelligence selected later

Exact feature allocation can still be refined before launch, but the architecture must support these three levels without data migration.

## 10. Important entitlement asymmetry — intentional

Latest product direction allows this scenario:

```text
Parent A: Family or Family+
Parent B: Free
```

Parent B may still receive the synchronized Family raw data after accepting the invitation, while their own UI remains restricted to their personal entitlement level.

Therefore **Family synchronization capability cannot be modeled only as `currentUser.plan >= Family` on every device**.

It needs two concepts:

1. **family sync entitlement** — whether this Family is currently allowed to operate shared sync;
2. **account feature entitlement** — which premium views/functions the current account may use.

Recommended rule:

```text
family.syncEnabled = true
if at least one active family member supplies an entitlement that enables Family Sync
```

while:

```text
account canUseAdvancedInsights
= current account has Family+ entitlement
```

This cleanly implements the idea that one paying family member can make shared data available, without automatically gifting all Family+ analytics to every invited account.

## 11. Subscription lapse — collision discovered

A previous decision said synchronization should continue after subscription expiry so that data remains available if the user resubscribes.

That conflicts with the newer tier design where **Family Sync is the main paid value of the Family tier**.

If full ongoing sync remained forever after one payment/trial, a user could activate Family once, cancel immediately and retain the core paid feature indefinitely.

The user's actual data-preservation goal does **not** require ongoing sync.

Recommended replacement behavior:

```text
No active Family/Family+ entitlement in the family
→ retain cloud canonical data
→ do not delete history
→ preserve Family membership
→ pause new cross-device synchronization
→ local tracking can continue on devices
→ on reactivation, reconcile/upload safely and resume sync
```

If another family member still has an active Family/Family+ entitlement, sync continues for the family.

This keeps historical data safe without destroying the business boundary.

**This is the most important remaining entitlement decision to lock.**

## 12. Offline entitlement

Locked direction:

- server-authoritative entitlement;
- client caches last validated entitlement for **30 days**;
- paid functionality therefore does not disappear simply because the user temporarily has no internet.

The cached state must include an expiry and must not be extendable by merely changing the device clock.

For high-value server actions, the backend may still verify current entitlement independently.

## 13. Trial/payment behavior already selected

- 7-day trial.
- Payment method is provided at trial activation where the store/provider flow supports that model.
- Trial converts to paid automatically unless cancelled.
- Monthly + annual subscription options.
- Annual target discount roughly equivalent to ~2 months free.
- No lifetime plan.
- Paywall appears in Settings and when the user intentionally enters a locked feature; no random disruptive startup paywall.
- Locked feature cards explain the feature rather than showing fabricated demo results or obscured pseudo-personal data.

Store-specific subscription mechanics remain subject to App Store / Play billing requirements at implementation time.

## 14. Account recovery behavior

Selected direction: login on a replacement phone should recover the account-level state without requiring the original phone.

Recoverable from the backend:

- account identity;
- subscription/entitlements;
- Family membership;
- registered device management;
- cloud Family canonical dataset when Family Sync is active/retained.

Not inherently recoverable for Free local-only history:

- sleep sessions never uploaded to cloud;
- local-only profile photo assets;
- other device-only preferences unless explicitly synced.

The product copy must reflect this distinction.

## 15. Profile photos

Current decision:

- real profile photo is supported;
- target size: 256×256;
- square crop, displayed circularly in UI;
- photo is device-local;
- photo does not Family-sync in V1;
- use IndexedDB/local app asset storage rather than stuffing image bytes into the main JSON/localStorage dataset.

A child profile therefore syncs identity/name/birth-date metadata, while each device may independently have or not have a local photo asset for that child.

This avoids cloud object-storage cost in V1.

## 16. Child delete semantics

Latest decision supersedes the earlier archive-first proposal:

- permanent delete is supported;
- deleting a child deletes that profile and its sleep sessions from active devices/cloud;
- no normal archived-child browsing flow is required;
- export/backup before destructive deletion should be offered or strongly encouraged;
- deletion needs explicit destructive confirmation and server tombstones long enough to propagate deletion to all paired devices.

A tombstone used for sync propagation is an implementation detail and is **not** a user-visible archive.

## 17. Cost-control principle

Architecture goal:

> **Near-zero fixed backend cost at small scale; infrastructure cost should grow mainly with actual usage/revenue.**

Cost-conscious consequences:

- Google identity instead of running password reset/email infrastructure in V1;
- Free sleep history not automatically uploaded merely because the user has an account;
- derived Insights calculated locally where possible;
- profile photos remain local in V1;
- reuse Cloudflare Worker + D1 rather than introducing unnecessary services;
- avoid storing derived analytics snapshots in the backend.

Zero cost forever cannot be guaranteed at scale, but the architecture should avoid unnecessary per-user storage and third-party SaaS costs.

## 18. Next architecture steps

Before V4 implementation:

1. Lock subscription-lapse Family Sync behavior.
2. Define Google login/session protocol and account-device registration.
3. Define `family_memberships` and who may invite/remove members.
4. Define Family entitlement aggregation (`at least one active subscriber` vs another rule).
5. Define safe resumption/reconciliation after Family entitlement was inactive.
6. Merge these decisions back into the main Product Design Lock / Technical Collision Audit.
7. Only then finalize D1 migration/API contracts.
