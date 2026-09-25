# Staging account/auth D1 próba — 2026-09-14

- Cél: `solemi-sleep-db-staging` (`1fdd9f64-ea4b-4499-9b6e-636462d51d37`)
- Régió a próba idején: `EEUR`
- Production erőforrás nem érintett.
- Migráció előtt a `PRAGMA foreign_key_check` üres eredményt adott.
- A teljes migráció előtti export helyben, a Git által figyelmen kívül hagyott `worker/.wrangler/auth-staging-20260914/before.sql` fájlban készült el és memóriabeli SQLite-ba hibamentesen visszatölthető volt.
- A `003_accounts_and_sessions.sql` sikeresen lefutott; Cloudflare bookmark: `0000001b-00000005-000050e6-48a82c43e3b4dcc9c421e11279242555`.
- A `004_auth_challenges_and_refresh_history.sql` sikeresen lefutott; Cloudflare bookmark: `0000001b-0000000b-000050e6-7ebcbbe90f7907667afda7f4c4f8d59e`.
- A migráció utáni teljes export a `worker/.wrangler/auth-staging-20260914/after.sql` fájlba került és hibamentesen visszatölthető volt.
- A migráció utáni `PRAGMA foreign_key_check` üres eredményt adott.
- Mind a hat legacy tábla teljes, rendezett tartalmának SHA-256 lenyomata egyezett a migráció előtti exporttal.

| Legacy tábla | Sor |
|---|---:|
| `families` | 10 |
| `devices` | 20 |
| `invite_codes` | 11 |
| `children` | 22 |
| `sleep_sessions` | 180 |
| `operations` | 254 |

Az új `accounts`, `account_identities`, `account_devices`, `account_sessions`, `auth_challenges` és `used_refresh_tokens` táblák a migráció után üresek voltak. Ez elvárt: legacy account-claim és automatikus paid grant nem történt.

A staging Workerhez külön, véletlen `AUTH_SECRET` secret létrejött; az értéke nem került fájlba vagy naplóba. A Google OAuth Web client ID beállítása után az auth-verzió `6d8e2f50-4927-438d-ae65-6450c7e366a4` verzióazonosítóval kikerült kizárólag a staging Workerre. Az élő health/challenge/CORS ellenőrzés és a teljes legacy Family Sync staging smoke teszt sikeres. Valódi Google-fiókos smoke test még nem történt, és az internal account UI nincs engedélyezve.
