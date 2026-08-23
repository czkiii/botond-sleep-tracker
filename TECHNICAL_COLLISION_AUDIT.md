# Solemi Sleep — Technical Collision Audit

Status: architecture review before V4 implementation  
Date: 2026-08-24

This document checks the locked product direction against the current V3 code, Family Sync model and D1 schema. No production behavior is changed by this audit.

## 1. Executive summary

The Product Design Lock is implementable, but V4 must be treated as one coordinated architecture migration rather than a sequence of isolated UI features.

The most important findings are:

1. **Child IDs must be canonical before multi-child sync is enabled.** A local-only device may generate its own child ID, but an already connected family cannot allow each phone to independently invent the V3→V4 child ID.
2. **Family creation currently clears local sessions.** This is acceptable for the current prototype/test flow but is not acceptable for a release product. V4 Family creation must preserve and upload the existing active child's history.
3. **Profile changes are not currently part of sync change detection.** `saveData()` only dispatches the sync event when sessions change.
4. **The backend currently has one active sleep per family.** Multi-child requires one active sleep per `(family_id, child_id)`.
5. **Profile photos need a deliberate storage strategy.** Raw photos must not be placed into the normal AppData/session sync payload.
6. **Reliable background reminders are not guaranteed by the current iOS PWA.** In-app reminders are possible now; native scheduled notifications become reliable after store packaging/native bridge work.
7. **Prediction/reference data must be versioned and sourced separately from personal calculations.** Derived insights should remain local/client-side where possible and should not become synced database records.

No blocker requires abandoning any locked product feature.

---

## 2. Current V3 architecture

### Local domain

Current data is effectively:

```text
AppData
├── settings
│   ├── childName
│   └── locale
└── sessions[]
```

There is no child entity and no `childId` on sessions.

### Sync domain

Current cloud model is effectively:

```text
family
├── devices
├── invite codes
└── sleep sessions
```

The family itself is the sleep namespace.

### Current sync trigger

`saveData()` emits `solemi-data-saved` only when `sessions` changed. Family Sync builds operations by diffing only sessions.

### Current active-sleep rule

D1 has a unique partial index on `sleep_sessions(family_id)` where the session is active.

---

## 3. Target V4 domain model

Recommended core model:

```ts
export type ChildProfile = {
  id: string
  name: string
  birthDate: string | null
  photoRef: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type SleepKind = 'day' | 'night' | null

export type SleepSession = {
  id: string
  childId: string
  startTime: string
  endTime: string | null
  note: string
  sleepKindOverride: SleepKind
  createdAt: string
  updatedAt: string
}

export type AppData = {
  version: 4
  settings: {
    locale: Locale
    activeChildId: string
  }
  children: ChildProfile[]
  sessions: SleepSession[]
}
```

### Why `sleepKindOverride` belongs in the base model

The product decision says day/night classification is automatic but manually overridable. If the override is postponed until Insights work, backup/sync/domain migration would need to change again. Adding the nullable override field in V4 prevents that second migration.

### Why `archivedAt` belongs in the base model

Archive + permanent delete is already locked. Child archival is domain state, not only UI state, and should therefore be represented from the start.

---

## 4. Storage migration strategy

### Recommendation: new local key

Use:

```text
solemiSleep:v4
```

and keep V3 read fallback during the migration period.

Do **not** overwrite the only V3 copy as the first migration action.

Safe local migration:

1. Try valid V4.
2. If absent, read valid V3.
3. Produce V4 entirely in memory.
4. Validate all child/session references.
5. Write V4.
6. Leave V3 untouched initially as rollback insurance.
7. After the migration has been stable for a later release, old-key cleanup may be considered.

This is safer than mutating `solemiSleep:v3` in place.

### Backup

Recommended backup format becomes V4, while V3 import remains supported.

V3 backup import creates one child and assigns every imported session to it.

V4 validation must reject orphan sessions whose `childId` does not reference an imported child.

---

## 5. Critical Family Sync migration issue: canonical child identity

### The collision

If Phone A and Phone B are already paired and both independently migrate their V3 data, they could generate:

```text
Phone A -> child_A
Phone B -> child_B
```

for the same real child.

That would split one baby's history into two profiles.

### Required solution

For an existing connected family, the **server owns the migration child ID**.

Recommended cloud migration:

1. Add a `children` table.
2. Create exactly one initial child for every existing family that does not yet have one.
3. Assign every existing cloud sleep session in that family to that server-created child.
4. `/v1/sync` returns children as well as sessions.
5. A connected V3 client upgrading to V4 adopts the server child ID/profile during bootstrap.
6. Only local-only/non-family V3 installations generate a local migration child ID themselves.

This keeps the server-authoritative sync model intact.

---

## 6. D1 target schema

### New `children` table

Conceptually:

```sql
children (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  name TEXT NOT NULL,
  birth_date TEXT,
  photo_ref TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  revision INTEGER NOT NULL
)
```

Indexes:

```text
(family_id, revision)
(family_id, archived_at)
```

### Sleep sessions

Add:

```text
child_id TEXT NOT NULL -> children(id)
sleep_kind_override TEXT NULL
```

The active-sleep uniqueness rule becomes:

```text
UNIQUE (family_id, child_id)
WHERE end_time IS NULL AND deleted_at IS NULL
```

This implements the locked decision that multiple children can sleep simultaneously while each child can have only one active session.

### Operations

The existing global operation table can remain, but child mutations need new operation types such as:

```text
CREATE_CHILD
PATCH_CHILD
ARCHIVE_CHILD
DELETE_CHILD
```

They must use the same idempotency principles as sleep mutations.

---

## 7. Sync protocol target

`/v1/sync?after=N` should become one revision stream containing at minimum:

```json
{
  "revision": 123,
  "children": [],
  "sessions": []
}
```

### Why one family revision is still good

A separate revision cursor per child would complicate clients and conflict handling unnecessarily. One monotonically increasing family revision remains simple and correct as long as both child and sleep mutations participate in it.

### Pending operations

Client pending operations must include child operations. A child must exist authoritatively before sessions referencing that child are uploaded.

Dependency rule:

```text
CREATE_CHILD must complete before CREATE/START_SLEEP for that new child.
```

### Full sync

A join/re-pair/full-bootstrap still treats cloud state as canonical, but it must replace both:

```text
children
sessions
```

not sessions only.

---

## 8. Existing Family creation behavior that must change before release

Current frontend Family creation clears local sessions immediately after creating the cloud family.

That creates an unacceptable production scenario:

> A parent tracks weeks of sleep locally → turns on Family → history disappears.

### V4 target behavior

When a local user creates a Family:

1. Create cloud family.
2. Create/upload the current local child profile(s).
3. Upload existing local sleep history with their child IDs.
4. Only mark initial bootstrap complete after the server has acknowledged the data.
5. If bootstrap fails, local data remains untouched and retryable.

Joining an **existing** family remains different: cloud is canonical and unrelated pre-join local data must not silently merge into the joined family.

This distinction must stay explicit.

---

## 9. Child profile photo architecture

The locked product direction includes an actual profile photo in the first multi-child version.

### Do not

- store an original camera photo inside `AppData` as a base64 string;
- place image bytes into every `/sync` response;
- duplicate image data in every sleep backup record path.

### Recommended model

`ChildProfile.photoRef` stores only a reference.

Preferred release architecture:

```text
original photo selected on device
→ client crop + resize
→ small avatar asset
→ dedicated image storage
→ child.photoRef
```

Cloudflare R2 or another object store is a better long-term fit than D1 for image bytes.

For a local-only user, a small avatar may temporarily use IndexedDB/local asset storage with a local reference. Family Sync later resolves it to a cloud photo reference.

Profile image work should therefore be a separate implementation sub-block, not embedded into the JSON domain migration.

---

## 10. Analytics architecture

### Rule

**Raw sleep/profile data syncs. Derived analytics does not.**

Wake windows, trends, routine detection, consistency, similar-day matching and predictions should be calculated from local canonical data.

Benefits:

- no derived-result synchronization conflicts;
- less D1 storage;
- algorithm updates automatically recompute historical insights;
- Free/Family entitlement can control display/availability without changing raw history.

### Child isolation

Every analytics entry point must either:

```text
accept childId
```

or receive a pre-filtered child session collection.

No analytics function may implicitly aggregate all children.

---

## 11. Day/night classification collision

Current code classifies roughly:

```text
day: 06:00–19:00
night: 19:00–06:00
```

The Product Design Lock selected:

- automatic classification;
- manual override;
- a fixed default boundary rather than learning the boundary from personal patterns.

### Remaining product constant

The exact fixed night boundary must still be locked before implementation. It is currently not fully specified by the decision set.

Recommendation for the architecture: keep it as a centralized versioned constant/config rather than burying hour checks inside statistics code.

Example:

```ts
DEFAULT_NIGHT_START_MINUTES
DEFAULT_NIGHT_END_MINUTES
```

This allows a later evidence/research decision without another data migration.

---

## 12. Prediction architecture

Locked behavior:

- predicted **range**, not a fake exact minute;
- confidence level;
- personal prediction after enough data;
- minimum target: 7 days personal data;
- before enough personal data, show age-based external reference;
- calculation explanation under Details.

### Three layers must remain separate

```text
1. Reference layer
   age-based external population/reference data

2. Personal feature layer
   wake windows, sleep lengths, time-of-day, recent routine

3. Prediction layer
   combines personal features and outputs a range/confidence
```

The UI must label which layer produced the current information.

Example:

```text
Age reference
vs.
Based on the last 14 days of your child's data
```

### External reference data

Do not hardcode anonymous internet averages into business logic.

Before implementation, research must choose defensible sources and store metadata with the dataset:

```text
source
publication/version
age band
metric definition
last reviewed date
```

This is both a product-trust and maintenance requirement.

---

## 13. Reminder architecture

Locked behavior:

- optional "Still sleeping?" reminder;
- 12+ hour extreme-duration protection;
- user can choose adaptive or fixed behavior.

### PWA limitation

The app cannot assume a closed iOS PWA will execute JavaScript at the exact desired future time.

Therefore split the feature:

**PWA phase**
- in-app stale-active-sleep detection when the app becomes active/focused;
- optional notification only where platform capability is genuinely available.

**Store/native phase**
- scheduled local notifications through the native wrapper/bridge.

No sleep is automatically ended by the reminder.

---

## 14. Insights navigation

Locked main navigation:

```text
Alvások · Előzmények · Insights
```

Locked internal Insights switcher:

```text
Áttekintés · Trendek · Minták
```

Recommended ownership:

### Áttekintés
- current/near-term state
- next sleep estimate/reference
- current wake window
- current day summary
- existing 24h visualization where useful

### Trendek
- free date range
- total sleep
- day/night split
- bedtime/wake time
- nap count
- wake-window evolution

### Minták
- routine detection
- consistency/range
- similar days
- deeper prediction explanation
- data-quality findings where contextually useful

The existing day/week/month chart logic can be reused conceptually but should not dictate the new analytics API.

---

## 15. Similar-day feature

This can remain entirely client-side.

Recommended first algorithm should be transparent and deterministic rather than ML-heavy. Compare normalized features such as:

```text
wake time
number of naps
nap start times
nap durations
total daytime sleep
bedtime
```

A weighted distance can identify historical nearest days. This can later feed prediction without storing extra cloud records.

---

## 16. Data-quality checks

Implement as derived warnings, not modifications.

Examples:

- active sleep > 12h;
- end before/equal start (should already be rejected at write/import boundary);
- overlapping sessions for the same child;
- impossible/orphan child references;
- suspiciously extreme duration.

A warning must never silently rewrite history.

---

## 17. PDF export

The locked output is a readable PDF suitable for a parent and also useful to show a doctor/health visitor.

Recommended architecture: client-side generated PDF from the selected child's canonical local data and selected date range.

No cloud PDF storage is required.

Include:

- child name and age if birth date is provided;
- selected period;
- totals/trends;
- sleep list or summarized timeline;
- clear note that predictions/references are informational, not a diagnosis.

Profile photo should not be required for PDF generation.

---

## 18. Entitlement readiness

Do not duplicate raw data between Free and Family plans.

Recommended model later:

```text
family.plan
entitlements
trial/status
limits
```

Raw child/sleep data remains the same. Features check entitlement separately.

Likely candidate labels may be added during implementation, but the final commercial split remains intentionally unlocked.

---

## 19. Release ordering / dependency graph

Recommended technical order after architecture lock:

```text
A. V4 local domain + safe migration
        ↓
B. Child profile management + active-child filtering
        ↓
C. D1 children + child_id migration
        ↓
D. Child-aware Family Sync
        ↓
E. Multi-child two-device chaos tests
        ↓
F. Classification + analytics calculation layer
        ↓
G. Insights UI
        ↓
H. External reference dataset
        ↓
I. Prediction engine
        ↓
J. Reminders / data quality
        ↓
K. PDF export
        ↓
L. Entitlement-ready layer
        ↓
M. Store/release hardening
```

Profile-photo asset storage can be developed alongside B–D but must not block raw child/session model migration.

---

## 20. Architecture gates before coding

### Gate 1 — no unresolved domain contradiction

Must lock:
- exact day/night default boundary;
- profile photo storage direction;
- permanent child-delete retention semantics.

### Gate 2 — migration plan tested on paper

Must cover:
- local-only V3 → V4;
- existing Family V3 → V4;
- create Family from an existing local history;
- join existing V4 Family from a device containing unrelated local history;
- V3 backup → V4 import.

### Gate 3 — sync protocol contract written

Before Worker changes, define:
- child DTO;
- sync envelope;
- child operation bodies;
- conflict behavior;
- deletion/archive rules;
- bootstrap sequence.

### Gate 4 — rollback / backup

Before the first V4 production deploy:
- preserve V3 local key during migration;
- export a test backup;
- take D1 backup/export or otherwise have a rollback copy;
- do not perform destructive schema changes as the first migration step.

---

## 21. Current risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Different phones invent different child IDs | Critical | Server-authoritative family migration child |
| Existing local history lost when enabling Family | Critical | Replace current createFamily clearing behavior with bootstrap upload |
| Session assigned to wrong child | Critical | Mandatory childId + validation + child-aware tests |
| One child's stats include another child's data | High | Analytics child isolation contract |
| Multi-child simultaneous sleep blocked by DB | High | Unique active index per family+child |
| Profile photo bloats sync/localStorage | High | photoRef + dedicated asset storage |
| Closed iOS PWA reminder does not fire | Medium | capability-aware PWA behavior + native scheduled notifications later |
| Prediction looks more certain than evidence | High | ranges + confidence + source label + details |
| External averages become stale/unsourced | High | versioned reference dataset with provenance |
| V4 migration damages only copy of V3 data | Critical | new storage key + V3 fallback/preservation |

---

## 22. Audit conclusion

The locked product can be built without redesigning the project from scratch.

The biggest architectural change is not Insights or prediction: it is turning **child** into a first-class entity across local storage, backups and Family Sync. Once that layer is correct, almost every planned intelligence feature can remain a client-side calculation over clean per-child history.

The architecture should therefore be locked before code changes, then implemented in coordinated migrations rather than feature-by-feature data-model patches.
