# Solemi Sleep — Feature Entitlement Matrix

Status: **LOCKED FOR ARCHITECTURE**  
Date: 2026-08-24

This file records the agreed commercial/feature split for the three-plan model. Raw child/session data stays on one canonical schema; plans gate product capabilities, not data formats.

## Plans

- **Free** — full core sleep tracker
- **Family** — Free + active family/multi-device synchronization + selected convenience/export value
- **Family+** — Family + advanced Insights/intelligence

## Core rules

1. All plans require a Solemi account; V1 identity provider is Google.
2. Login itself is free and is never a paid feature.
3. Free sleep history remains local-first; account does not imply automatic cloud backup.
4. Family Sync is enabled for the whole family while at least one member supplies an active Family or Family+ entitlement.
5. Family+ advanced Insights are personal entitlements; they are not gifted to other family members merely because shared sync is active.
6. Raw synchronized family data may exist on a Free member's device while paid views remain locked by entitlement.
7. If the last Family/Family+ entitlement lapses, cloud data and family membership are retained but active cross-device sync pauses. Reactivation resumes via safe reconciliation.
8. Server is entitlement authority; client may use a 30-day validated offline entitlement cache.
9. One account: maximum 2 active devices in the current product decision. No family-wide hard-coded device cap in the architecture.
10. One subscription applies to one family.

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
- Parent B remains on Free feature visibility;
- neither account gets Family+ Insights unless personally entitled.

### Parent A = Family+, Parent B = Free

- family sync: **active**;
- Parent A gets Family+ Insights;
- Parent B gets Free UI/features over the synchronized canonical data.

### Parent A = Family+, Parent B = Family

- family sync: **active**;
- Parent A gets Family+ Insights;
- Parent B gets Family feature set.

## Architectural consequence

Entitlements must expose at least two separate decisions:

```text
familyCanSync(familyId)
accountCanUse(featureKey, accountId)
```

Do not reduce the model to a single `plan` check on the current device.

Raw data synchronization and personal feature visibility are intentionally separate.