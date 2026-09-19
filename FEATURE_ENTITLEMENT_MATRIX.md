# Solemi Sleep — Feature Entitlement Matrix

Status: **LOCKED FOR ARCHITECTURE**  
Date: 2026-08-24

**Product decision update — 2026-09-17; staging accepted — 2026-09-19:** `PRODUCT_DIRECTION.md` is authoritative. Keep Free / Family (990 HUF/month) / Family+ (1490 HUF/month). Every active family member inherits the paid capabilities granted by any active member's valid subscription, regardless of creator/admin role. Family+ analytics are no longer subscriber-only. Worker and client implementation plus the two-account, two-phone staging matrix are accepted.

This file records the agreed commercial/feature split for the three-plan model. Raw child/session data stays on one canonical schema; plans gate product capabilities, not data formats.

## Plans

- **Free** — full core sleep tracker
- **Family** — Free + active family/multi-device synchronization + selected convenience/export value
- **Family+** — Family + advanced Insights/intelligence

## Core rules

1. Free can be used local-first without a Solemi account. The V1 identity provider for account-based features is Google.
2. Login itself is free but optional for the Free plan; account required only for sync/restoration/commerce.
3. Free sleep history remains local-first; account does not imply automatic cloud backup.
4. One active family subscription enables whole-family sync for that family; at least one member must hold Family or Family+ entitlement for sync to be active.
5. Family+ advanced Insights are available to every active family member when any active member holds a valid Family+ subscription.
6. Raw synchronized family data and the corresponding paid capabilities are available to every active member; their own billing plan may remain Free.
7. If the last Family/Family+ entitlement lapses, cloud data and family membership are retained but active cross-device sync pauses. Reactivation resumes via safe reconciliation.
8. Server is entitlement authority; client may use a 30-day validated offline entitlement cache.
9. One account: maximum 2 active devices in the current product decision. No family-wide hard-coded device cap in the architecture.
10. A subscription belongs to its purchaser account and contributes paid capabilities through that account's active family membership. The family creator need not be the purchaser.

## Feature matrix

| Feature | Free | Family | Family+ |
|---|:---:|:---:|:---:|
| Sleep start/stop/manual entry | ✅ | ✅ | ✅ |
| Full History | ✅ | ✅ | ✅ |
| Current Day/Week/Month basic statistics | ✅ | ✅ | ✅ |
| Multiple child profiles | ✅ | ✅ | ✅ |
| Child profile photo (device-local) | ✅ | ✅ | ✅ |
| Automatic day/night classification | ✅ | ✅ | ✅ |
| Manual day/night override | ✅ | ✅ | ✅ |
| Quick ±5/10/15 minute corrections | ✅ | ✅ | ✅ |
| Compact time picker correction | ✅ | ✅ | ✅ |
| Basic data-quality warnings | ✅ | ✅ | ✅ |
| 12+ hour “Still sleeping?” guardrail | ✅ | ✅ | ✅ |
| Fixed/manual reminder | ✅ | ✅ | ✅ |
| Family / multi-device sync | — | ✅ | ✅ |
| Shared family child profiles and raw history | — | ✅ | ✅ |
| PDF export | — | ✅ | ✅ |
| Personal Wake Window analytics | — | — | ✅ |
| Age-reference Wake Window comparison | — | — | ✅ |
| Wake Window trend | — | — | ✅ |
| Next-sleep prediction range + confidence | — | — | ✅ |
| Routine/pattern recognition | — | — | ✅ |
| Similar-day analysis | — | — | ✅ |
| Custom date-range advanced trends | — | — | ✅ |
| Adaptive reminder based on personal pattern | — | — | ✅ |
| Advanced Insights / Patterns | — | — | ✅ |

## Insights navigation

The main app navigation is the same for every plan:

**Sleeps · History · Insights**

Inside Insights:

**Overview · Trends · Patterns**

Free users see their included basic statistics plus locked premium cards where relevant. Locked cards show a short honest description of the unavailable feature; they do not show fabricated sample results or obscured pseudo-personal results.

Family users see the same structure, with Family+ cards still locked where applicable.

## Paywall behavior

- Paywall is available from Settings.
- Paywall also appears when a user intentionally opens a locked feature.
- No random startup/interruption paywall.
- 7-day trial targets **Family+**, so the user can evaluate the complete product.
- Trial uses payment method / auto-renew where the platform flow supports it.
- If trial ends without paid continuation, account returns to Free.
- Monthly + annual options.
- Annual target discount: roughly 2 months free.
- No lifetime plan.

## Upgrade / downgrade rules

### Free -> Family

- create/activate Family entitlement;
- make automatic local safety backup before first cloud bootstrap;
- upload canonical local family dataset;
- verify sync before marking bootstrap complete.

### Free/Family -> Family+

- advanced Insights unlock immediately;
- derived analytics recalculate locally from already available canonical raw data;
- no raw-data migration is needed.

### Family+ -> Family

- Family Sync remains active;
- advanced Insights lock;
- raw family data is untouched.

### Family/Family+ -> Free when no other family member pays

- active cross-device sync pauses;
- cloud canonical data is retained;
- Family membership is retained;
- devices may continue local tracking;
- reactivation performs safe reconciliation before normal sync resumes.

If another family member still has an active Family/Family+ entitlement, family sync remains active.

## Family-member examples

### Parent A = Family, Parent B = Free

- family sync: **active**;
- both devices receive the canonical shared raw data;
- both accounts get Family capabilities;
- neither account gets Family+ Insights without an active Family+ contribution.

### Parent A = Family+, Parent B = Free

- family sync: **active**;
- both accounts get Family+ Insights and other Family+ capabilities.

### Parent A = Family+, Parent B = Family

- family sync: **active**;
- both accounts get Family+ Insights and other Family+ capabilities.

## Architectural consequence

Entitlements must expose at least two separate decisions:

```text
familyCanSync(familyId)
memberCanUse(featureKey, accountId, activeFamilyId)
```

Do not reduce the model to a single `plan` check on the current device.

Raw data synchronization and capability visibility remain separate decisions, but both must reflect the valid contributions of all active members. Subscription ownership is not the same as effective family access.
