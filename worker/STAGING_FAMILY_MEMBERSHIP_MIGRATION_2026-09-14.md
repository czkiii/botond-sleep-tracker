# Staging account–family bridge D1 próba — 2026-09-14

- Cél: `solemi-sleep-db-staging` (`1fdd9f64-ea4b-4499-9b6e-636462d51d37`).
- Production erőforrás nem érintett.
- A teljes migráció előtti export a Git által figyelmen kívül hagyott `worker/.wrangler/family-membership-staging-20260914/before.sql` fájlba került, és memóriabeli SQLite-ba hibamentesen visszatölthető volt.
- A migráció előtti `PRAGMA foreign_key_check` üres eredményt adott.
- A `005_family_memberships.sql` additív migráció sikeresen lefutott. Cloudflare bookmark: `00000029-00000005-000050e6-4b6ce9147d1653f453bafc62d3507545`.
- A migráció utáni teljes export az ugyanott található `after.sql` fájlba került, és hibamentesen visszatölthető volt.
- A migráció utáni `PRAGMA foreign_key_check` üres eredményt adott.
- A hat legacy tábla teljes, rendezett tartalmának SHA-256 lenyomata egyezett a migráció előtti exporttal.

| Legacy tábla | Sor |
|---|---:|
| `families` | 14 |
| `devices` | 27 |
| `invite_codes` | 14 |
| `children` | 29 |
| `sleep_sessions` | 1983 |
| `operations` | 2084 |

Az új `legacy_family_memberships` és `account_family_devices` táblák üresen jöttek létre. A migráció önmagában nem rendelt családot egyetlen accounthoz sem.

A staging Worker `3a1853ad-02c5-4ee3-b06e-b1371b095d94` verziója engedélyezi a bridge végpontokat. A teljes legacy staging smoke teszt ezután sikeresen lefutott. A valódi böngészős claim/bootstrap próba az internal Pages következő buildje után következik.
