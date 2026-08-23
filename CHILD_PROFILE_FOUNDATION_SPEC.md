# Solemi Sleep — Child Profile Foundation Spec

Status: Draft for joint product/UX decision

## Why this is the next foundation

The current app stores one `settings.childName` string while every sleep session is globally attached to the app dataset. That works for one child, but it is not a safe base for multi-child, age-aware analytics, Family Sync per child, or future prediction.

This milestone therefore changes the model before adding intelligence features.

## Current technical reality

- App data is `version: 3`.
- `settings.childName` is the only child-specific field.
- `SleepSession` has no `childId`.
- Backup format is V3.
- Family Sync currently treats the family as one shared sleep stream.
- UI has three main tabs: Alvások, Előzmények, Statisztika; Settings is separate.

## Proposed V4 domain model

```ts
export type ChildProfile = {
  id: string
  name: string
  nickname?: string
  birthDate: string | null // YYYY-MM-DD
  createdAt: string
  updatedAt: string
}

export type SleepSession = {
  id: string
  childId: string
  startTime: string
  endTime: string | null
  note: string
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

### Important design rule

No artificial child-count limit in the data model. The UI should remain optimized for one child, but the storage/backend architecture must support multiple profiles.

## V3 → V4 migration proposal

Migration must be automatic and lossless.

1. Read existing `settings.childName`.
2. Create one child profile with a generated stable `childId`.
3. Assign every existing sleep session to that child.
4. Set that child as `activeChildId`.
5. Preserve locale and all sleep timestamps/notes unchanged.
6. Write V4 only after a valid V4 object has been produced.

If the existing child name is blank, create the profile with an empty/default display name and ask for completion through UI later; do not discard sessions.

## Birth date

### Product value

Birth date enables transparent calculations such as:
- exact age in days/weeks/months;
- age context for wake-window analytics;
- age-segmented personal trends;
- better future prediction inputs.

### Proposed rule

Birth date should be strongly requested but not technically mandatory for basic tracking.

Reason: tracking must still work if a parent skips it, but age-aware analytics can clearly state that a birth date is required before they become available.

No medical claims should be derived from birth date alone.

## Profile fields — proposed first release

Required for profile usability:
- name

Optional:
- nickname
- birth date

Deferred:
- photo/avatar
- profile color/theme
- gender/sex (not needed for planned calculations)
- weight/height/medical data (not needed for the product goal)

## Multi-child UX principles

### One child

Nothing should feel more complicated than today.
- No child switcher is visible.
- Alvások opens directly to the active child.
- History and Statistics automatically use that child.

### Two or more children

A child switcher becomes visible.

Proposed behavior:
- changing the active child changes Alvások, Előzmények and Statisztika together;
- active sleep is child-specific;
- each child can have one active sleep at a time;
- different children may have active sleeps simultaneously if the product later needs that behavior.

The exact switcher placement is not decided in this document.

## Navigation constraint

Do not add a new permanent main tab just for profiles.

Preferred first approach:
- profile management lives in Settings;
- child switcher is contextual and only visible for 2+ profiles;
- keep the current three-tab navigation until actual Insights content proves that a navigation redesign is better.

## Family Sync implications

Current Family Sync must evolve from:

`family -> sleep sessions`

to:

`family -> children -> sleep sessions`

Required future backend properties:
- child records belong to a family;
- every synced session has `child_id`;
- server uniqueness changes from one active sleep per family to one active sleep per family + child;
- invite pairing shares all family child profiles;
- switching active child is local UI state, not necessarily a family-wide state;
- child create/edit/delete operations need revision/idempotency rules just like sessions.

## Delete/archive child safety

Deleting a child profile is destructive because it owns sleep history.

Recommended rule:
- do not hard-delete child history immediately;
- first implementation should use archive/soft-delete semantics;
- confirmation must explicitly state how many sleep records are affected;
- active child cannot disappear without selecting/falling back to another profile.

## Backup implications

V4 backup should include:
- all child profiles;
- active child id;
- all sessions with child id;
- locale;
- version metadata.

Import must validate that every session references an existing child.

V3 backup import should remain supported by migrating it into V4 on import.

## Analytics contract

Every analytics function must receive or resolve a `childId`; no future statistic should accidentally aggregate children together unless it is explicitly a family-level metric.

This is a hard architectural rule.

## Proposed Definition of Done — foundation only

The milestone is complete when:

- V3 local data migrates to V4 without losing sessions.
- One-child users see essentially the same simple workflow.
- Settings can create/edit child profiles.
- Birth date can be entered/edited and validated.
- 2+ children cause a child switcher to appear.
- Every main screen filters by the active child.
- New sleep sessions are always assigned to the active child.
- Backup/export/import supports the V4 model and old V3 backups.
- Family Sync schema/API is designed for `child_id` before we enable multi-child cloud sync.
- Regression tests prove one child's data never appears under another child.

## Questions to decide together before implementation

1. Birth date: optional-but-strongly-requested, or mandatory during profile creation?
2. Keep nickname in V1 profile, or name + birth date only?
3. Where should the 2+ child switcher live visually?
4. Adding a child: Settings only, or also from the switcher menu?
5. Child removal: archive only initially?
6. Should different children be allowed to have simultaneous active sleeps? Proposed: yes, because the one-active-sleep rule should be per child.
7. Family Sync: should every paired device always receive all child profiles? Proposed: yes for the first version.

## Recommended implementation order after decisions

1. Finalize these seven product decisions.
2. Implement local V4 types + migration + V3 backup compatibility.
3. Implement profile management UI without changing main navigation.
4. Add active-child filtering and switcher.
5. Regression test local multi-child behavior.
6. Design/migrate D1 child schema.
7. Upgrade Family Sync operations to child-aware sync.
8. Run two-device multi-child chaos tests.
9. Only then build wake-window/prediction features on top.
