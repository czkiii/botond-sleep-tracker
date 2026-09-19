# Staging subscription és entitlement D1 próba — 2026-09-15

- Cél: `solemi-sleep-db-staging` (`1fdd9f64-ea4b-4499-9b6e-636462d51d37`).
- Production erőforrás nem érintett.
- A teljes migráció előtti export a Git által figyelmen kívül hagyott
  `worker/.wrangler/entitlement-staging-20260915/before.sql` fájlba került,
  és memóriabeli SQLite-ba hibamentesen visszatölthető volt.
- A `006_subscriptions_and_entitlements.sql` additív migráció sikeresen lefutott.
  Cloudflare bookmark: `00000031-00000006-000050e7-8bda364e7a216de06e313bfe7daa35ac`.
- A migráció utáni teljes export ugyanott `after.sql` néven található és
  hibamentesen visszatölthető.
- A migráció utáni `PRAGMA foreign_key_check` üres eredményt adott.
- A hat legacy tábla teljes, rendezett tartalmának SHA-256 lenyomata egyezett
  a migráció előtti exporttal.
- Az új `subscriptions`, `subscription_events` és `account_entitlements`
  táblák üresen jöttek létre; a migráció nem adott automatikus fizetős jogot.

| Legacy tábla | Sor |
|---|---:|
| `families` | 18 |
| `devices` | 38 |
| `invite_codes` | 20 |
| `children` | 37 |
| `sleep_sessions` | 1997 |
| `operations` | 2136 |

A staging Worker `4ff4309f-537d-43e5-8a39-d64de6a83b0a` verziója szerveroldalon
ellenőrzi a család közös Family Sync jogosultságát. A `MANUAL` tesztforrás és a
csomagváltó végpont csak a staging konfigurációban engedélyezett. Claimelt
család nyers alvásadata csak érvényes account session és az account eszközéhez
rendelt családi eszközkulcs együttesével érhető el. A teljes legacy staging
smoke teszt sikeres.

## Valódi két-accountos elfogadás

Az internal Pages `9e5a381` buildjét a felhasználó és a felesége két külön
Google-accounttal ellenőrizte. Family+ + Free mellett a sync működött. Free +
Free alatt a módosítások várakoztak, majd a másik account Family+ aktiválása
után a kliens újraellenőrzési ciklusában mindkét eszköz szinkronizált.
Kijelentkezés, a teljes helyi appadat törlése és Google-belépés után a cloud
családi adatok visszatöltődtek.

A személyes adat nélküli D1 összesítés ekkor egy aktív és egy lejárt `MANUAL`
Family+ subscriptiont, egy aktív `FAMILY_SYNC` grantot és egy syncre jogosult
accountos családot mutatott. Ez megfelel a teszt végállapotának: az egyik tag
Free, a másik Family+, a családi sync aktív.

Alkalmazás-visszaállításkor a korábbi Worker-verzió újratelepíthető; az additív,
kezdetben üres táblák helyükön maradhatnak. Production rollbacket ez a próba nem
érint és nem helyettesít.
