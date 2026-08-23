# Solemi Sleep — Product Design Lock

Status: **LOCKED FOR IMPLEMENTATION PLANNING**  
Locked: 2026-08-24

This document records the product decisions agreed before the next major implementation phase. The goal is to avoid repeated redesign during coding and to keep UX, data model, sync, analytics and business preparation aligned.

## 1. Child profile and multi-child

1. Birth date is **optional**, but clearly communicated as required for age-aware analytics and more accurate age-contextual estimates.
2. Child profile uses a **single name field**; no separate nickname field.
3. Profile management lives in **Settings → Gyerekek / Children**.
4. A child switcher appears only when there are **2+ child profiles**.
5. The child switcher lives in the **Alvások/Sleeps header near Settings**.
6. Switching child changes **Sleeps, History and Insights together**.
7. Multi-child is not artificially limited to two children in the data model.
8. Different children may have **simultaneous active sleeps**; the one-active-sleep rule becomes per child.
9. A future shared-sleep convenience action may start/stop multiple selected children at once, but the backend must still store separate sessions per child.
10. Child removal supports **archive + permanent delete with strong confirmation**.
11. Child profile photo is included in the first multi-child UX because it improves personal recognition.
12. No profile color system; name + profile image are the identifiers.

## 2. Wake windows and age context

13. Wake Window analytics combine:
   - the child's own recorded data; and
   - external age-based reference data.
14. These two sources must always be visually and textually separated. The UI must clearly distinguish **personal pattern** from **general age reference**.
15. Wake Window belongs under **Insights**, not on the main Sleeps screen by default.

## 3. Sleep prediction

16. Prediction output is a **time range plus confidence level**, not a single exact time.
17. Personalized prediction requires at least **7 days of usable own data**.
18. With insufficient own data, the app may show **age-based general reference estimates** using external data.
19. The UI must clearly label whether the estimate is based on:
   - age reference;
   - own recorded history; or
   - a combination of both.
20. The calculation explanation is available under **Részletek / Details**, not forced into the main view.
21. Prediction must never present certainty where only a probability/range exists.

## 4. Routine, patterns and trends

22. Routine/pattern recognition is included.
23. Pattern output uses **both human-readable text and visual charts**.
24. Trend analysis supports a **custom date range** rather than being restricted to a few fixed windows.
25. Similar-day comparison is a user-facing feature, not only an internal prediction input.
26. Sleep consistency is shown using **real statistical spread/range**, not a 0–100 Sleep Score.
27. No opaque Sleep Score is planned.

## 5. Day/night classification

28. Daytime/nighttime sleep is **automatically classified but user-overridable**.
29. Initial automatic classification uses a **fixed time rule**, not an adaptive learned boundary.
30. This classification rule must remain explicit and editable enough that statistics are not silently misleading.

## 6. Data quality and reminders

31. Automatic data-quality checks flag suspicious sleep records.
32. An optional **“Még alszik? / Still sleeping?”** reminder is supported for unusually long active sleep.
33. Initial long-sleep guardrail: **12+ hours active**.
34. Reminder strategy can be selected by the user:
   - adaptive based on personal patterns; or
   - manually configured fixed timing.
35. Reminders never auto-close a sleep session.

## 7. Quick entry and correction

36. Quick backdating supports **both preset corrections and a compact time picker**.
37. Preset examples may include ±5 / 10 / 15 minutes, while the picker handles arbitrary corrections.

## 8. Summary and export

38. Daily summary is initially **inside the app**.
39. First planned formal export format is **PDF**.
40. PDF export should be clear enough for a parent and also readable when shown to a doctor / health visitor / professional.
41. No separate “professional mode” export is required initially.

## 9. Main navigation

42. Main navigation becomes:

**Alvások / Sleeps · Előzmények / History · Insights**

43. The current Statistics functionality moves into Insights rather than becoming a fourth tab.
44. Insights uses a top-level segmented selector:

**Áttekintés / Overview · Trendek / Trends · Minták / Patterns**

45. Proposed content split:

### Overview
- current/near-term sleep picture
- next-sleep estimate
- day/night summary
- 24h timeline
- key current statistics

### Trends
- total sleep over time
- day/night sleep trends
- bedtime / wake-time trends
- number of naps
- custom date-range analysis

### Patterns
- Wake Window analytics
- routine detection
- consistency/spread
- similar days
- deeper prediction explanation / pattern evidence

46. The UI should retain the current app's fast, uncluttered feel. New intelligence features must not turn the main navigation into a dashboard maze.

## 10. Family Sync with multiple children

47. All child profiles in a family sync to **all paired devices**.
48. Every synced sleep session belongs to a child (`child_id`).
49. Active-sleep uniqueness changes from family-wide to **family + child**.
50. Child create/edit/archive/delete operations require server-authoritative revision/idempotency rules similar to sleep sessions.
51. Active child selection is local UI state; switching child on one phone does not force another phone to switch screens.
52. No technical device-count limit should be hard-coded into the architecture now; business entitlement may impose limits later.

## 11. Subscription-ready direction

53. Free vs Solemi Sleep Family is **not permanently finalized yet**.
54. During development, features may be tagged with likely Free / Family placement so entitlement architecture can be prepared.
55. Final packaging happens only after the full product value is visible and tested.
56. The Free app must remain genuinely useful; premium should add real value rather than undo artificial restrictions.

## 12. Research requirement

57. Before final pricing/release positioning, run a competitor audit covering:
   - Huckleberry
   - Napper
   - Baby Daybook
   - Nara Baby
   - Baby Tracker and other relevant apps
58. Research includes **features, pricing, trial models and store-review complaints / recurring user pain points**.
59. External age-reference data used by Solemi must be separately sourced, documented and reviewed before shipping age-based guidance.

## 13. Architectural consequences

The next data model must be designed for the whole locked product, not only for the first visible feature.

Required architectural properties:
- explicit `ChildProfile` entities;
- stable `childId` on every sleep session;
- per-child analytics contracts;
- multi-child-safe backup/import/export;
- per-child Family Sync state;
- room for profile image metadata;
- birth date available to analytics but optional for basic tracking;
- classification metadata for day/night override if needed;
- data-quality flags must not mutate source sleep data silently;
- prediction results should be derived, not stored as canonical truth;
- entitlement hooks must not be tangled directly into analytics calculations.

## 14. Implementation gate

**Do not start the major V4 implementation until the locked decisions have been checked against the current frontend, storage, backup, Worker API and D1 schema for contradictions.**

The next step is therefore a cross-system technical design pass that produces:
1. final V4+ domain model;
2. migration plan;
3. multi-child sync schema/API design;
4. Insights information architecture;
5. analytics input/output contracts;
6. external reference-data strategy;
7. implementation order with regression gates.

Only after that pass is accepted should the major code migration begin.
