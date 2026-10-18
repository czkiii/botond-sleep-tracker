# A17 — staging leltár és elkülönített bekötési főpróba

Lezárás: 2026-10-17. A távoli olvasási leltár 2026-10-16-án készült. GPT-6 Astra · erős; kézi app-teszt nem szükséges ehhez a blokkhoz.

**Utókövetés, 2026-10-18:** az alábbi csomag alapján a külön környezet létrejött és a gépi főpróba sikeresen lezárult. [Tényleges erőforrások, javítások és bizonyítékok](A17_ISOLATED_REHEARSAL_RESULT_2026-10-18.md). Az alábbi „következő” lépések az eredeti előkészítési állapotot rögzítik.

**Ez az előkészítési feladat kész.** A következő konkrét munka az alább megnevezett próba-erőforrások létrehozása és a gépi főpróba végrehajtása. Most nem történt távoli létrehozás, migráció, telepítés, kulcsbeállítás vagy aktiválás. A korábbi [üzleti restore-egyeztetés](A17_BUSINESS_RESTORE_CHECKPOINT_2026-10-16.md) eredménye megmarad.

## Ellenőrzött távoli állapot

| Tétel | Olvasással igazolt eredmény |
| --- | --- |
| Staging Worker | `solemi-sleep-sync-staging` |
| Aktív verzió | `ab7da45f-952a-4685-964b-519e69369358`, 100%; 2026-10-16 19:13:22 UTC |
| Deployment | `66dd70e0-448e-4cd6-b3c7-243ad1bdcb15`, 2026-10-16 19:13:24 UTC |
| Health / build | HTTP 200; body és build-fejléc: `af7ae44aa5a5948f7386730657b133229ce23954` |
| Staging D1 | `solemi-sleep-db-staging`, `1fdd9f64-ea4b-4499-9b6e-636462d51d37` |
| Production D1, kizárási azonosító | `solemi-sleep-db`, `8ace71f6-9c2d-445f-8788-a76bedcdd7bc`; csak az erőforráslistában azonosítva, tartalma nem lekérdezve |
| Meglévő erőforrások | Két Worker és két D1; külön A17-próba vagy journal nincs a leltárban |
| Staging séma | A 008–010 állapot nyomai megvannak: store-event mezők, tokenreplacement, account-trial és védőtriggerek. Nincs `d1_migrations` napló; a tényleges sémát ellenőriztük. |
| A17 sémahiány | 011–013 nincs alkalmazva: többek között nincs `account_deletions`, `erasure_receipts`, `deletion_maintenance_runs`, `billing_retention`, `billing_legal_holds`, `retention_restore_gate`. |
| Összesített állapot | 37 család, 3 account, 0 account-trial. Személyes napló- és accounttartalmat nem olvastunk. |
| DB-binding | Csak `DB`; nincs `ERASURE_JOURNAL` |
| Titkos beállítások nevei | `AUTH_SECRET`, `TOKEN_PEPPER`; nincs `TRIAL_IDENTITY_SECRET`. Titkos érték nem került a leltárba. |
| Ütemező | A Cloudflare schedules API üres listát adott. |
| Kapcsolók | Account/family bridge, entitlement enforcement, entitlement test mode és konfliktuskezelés true. A17 törlési/retention/restore kapcsolók és programmegkötés nincsenek beállítva. |

A D1-ellenőrzések csak SELECT/sémalekérdezések voltak, nulla írt sorral. A staging nem eldobható: a 37 család jelenléte miatt ott nem hajtunk végre visszatöltési főpróbát. A szolgáltatói mentési/logmegőrzési beállítások és a termelési konfiguráció részletes ellenőrzése nem része ennek az igazolt leltárnak.

## Konkrét elkülönítés

| Erőforrás | Név | Szerep |
| --- | --- | --- |
| Worker | `solemi-sleep-a17-rehearsal-staging` | Csak mesterséges próbaadatot kezel |
| D1 source | `solemi-a17-rehearsal-source` | Friss, üresből létrehozott teljes 013-as próbaséma |
| D1 journal | `solemi-a17-rehearsal-journal` | Önálló törlési/trial nyilvántartás; nem töltjük vissza régi másolatból |
| D1 restore | `solemi-a17-rehearsal-restore` | Üres cél a teljes, helyben ellenőrzött restore SQL számára |

A valódi UUID-k csak a későbbi létrehozás után ismerhetők. A mostani minták szándékosan szintetikusak, nem telepíthetők. Külön három secret szükséges: `AUTH_SECRET`, `TOKEN_PEPPER`, `TRIAL_IDENTITY_SECRET`; meglévő staging/production kulcsot és Google-clientet nem másolunk át. A 19310/19311/19312 rate-limit namespace eltér a helyi production 19100–19102 és staging 19200–19202 beállításaitól; ezt a végrehajtás előtti távoli leltárban is ellenőrizni kell.

## Elkészült helyi csomag

`worker/scripts/prepare-retention-rehearsal.mjs` hálózati művelet nélkül előállítja a két sémafájlt, két lezárt konfigurációt és a hash-eket/továbblépési feltételeket tartalmazó tervet. Az erőforrás-bemenet pontosan source/journal/restore mezőket és a fenti neveket tartalmazza. Azonos UUID, ismert közös staging/production UUID vagy más célnevek esetén megáll.

```json
{
  "source": {"name":"solemi-a17-rehearsal-source","id":"11111111-1111-4111-8111-111111111111"},
  "journal": {"name":"solemi-a17-rehearsal-journal","id":"22222222-2222-4222-8222-222222222222"},
  "restore": {"name":"solemi-a17-rehearsal-restore","id":"33333333-3333-4333-8333-333333333333"}
}
```

Ez kizárólag a helyi ellenőrzés példája. Távoli végrehajtás előtt mindhárom valódi név/UUID párost külön össze kell vetni a Cloudflare-leltárral: a generátor önmagában nem tudja igazolni egy tetszőleges UUID tulajdonosát.

```text
node worker/scripts/prepare-retention-rehearsal.mjs resources.json worker/.private-backups/a17-approved-candidate
```

Csak új, repo alatti `.private-backups` könyvtárba ír, meglévő kimenetet nem ír felül. Az ellenőrzött mintacsomag: `worker/.private-backups/a17-isolated-preparation-2026-10-17/candidate/` (Gitből kizárva).

- `source-schema.sql`: friss `schema.sql` és 003–013 migrációk. A schema már V4, ezért 001/002 ismételt alkalmazása hibás lenne. Csak az új, üres source célba importálható.
- `journal-schema.sql`: külön schema + 002 retention és staging/source-UUID identitás. A programmegkötést még nem aktiválja.
- `source.frozen.jsonc`, `restored.frozen.jsonc`: ugyanaz a külön Worker, más elsődleges DB. A journal és a logikai `DELETION_SOURCE_DATABASE_ID` változatlan marad.
- `plan.json`: erőforrások, sémahash-ek, sorrend, visszalépési feltételek; `remoteApplied:false`, `deploymentAuthorized:false`.

Mindkét konfigurációban `RESTORE_MAINTENANCE=true`, a három törlési/retention kapcsoló false, nincs cron, nincs publikus workers.dev/preview végpont, az allowed origin nem működő `.invalid` próbacím. Nincs automatikus telepítő. A közös `npm run deploy:staging` parancsot ehhez **nem** használjuk, mert az a közösen használt Workert célozza.

## A következő főpróba végrehajtási sorrendje

1. A jelenlegi kódváltozásokat commitolni kell; a tiszta checkout teljes SHA-ját és ellenőrzéseit rögzíteni. Az előbbi leltár időközbeni változását ellenőrizni. A távoli művelet terjedelme a fenti egy Worker és három új adatbázis, szintetikus adatokkal. A mostani előkészítés ezt még nem hajtotta végre.
2. A három külön D1 létrehozása; a kapott név/UUID párok ellenőrzése és valós `resources.json` összeállítása. Új csomag generálása. A célok ürességét alkalmazástáblák szintjén is igazolni, nem csak méret alapján.
3. Source- és journal-séma importja a hozzájuk tartozó új célba. A restore cél üres marad. `PRAGMA foreign_key_check`, integritás, a 013-as gate és a journal-identity ellenőrzése. A source sémában a business gate kezdetben 0; a külső forgalmat a Worker maintenance-zára tartja lezárva.
4. A source frozen jelölt telepítése kizárólag az új Workerre, a teljes commitot beégető `__SOLEMI_BUILD_SHA__` define-nal. Három új próbakulcs beállítása titkos csatornán. A `prepare-trial-program.mjs` által előállított, e külön HMAC-kulcshoz és dokumentált felülvizsgálati időhöz kötött programmegkötés importja csak az új journalba. Kulcs, bearer token nem kerül fájlba/Gitbe/jegyzőkönyvbe.
5. Mesterséges account/család/napló és lejárt törlési kérés létrehozása. A próba bekötési bizonyítékait a meglévő `businessRestore.test.ts`, `retention.test.ts`, `accountDeletion.test.ts` eseteihez igazítani. Valódi Google-account és felhasználói napló nem kell; szintetikus store-rekord nem igazol valódi bolti fizetést.
6. Külön felülvizsgált aktív próbajelölt: csak e Workeren `ACCOUNT_DELETION_MAINTENANCE=true`, `RETENTION_MAINTENANCE=true`, `RESTORE_MAINTENANCE=false`, ötperces cron. A kérelmek API-s próbájához `ACCOUNT_DELETION_ENABLED=true` is kell. Publikus végpont csak az elkülönített HTTP-próba idejére, külön hitelesítőkkel és explicit próba-origin megadásával nyitható; valós app nem kapcsolódik hozzá. A cron bejegyzése önmagában nem PASS: egy tényleges futásnak előre kell vinnie a mesterséges kérés állapotát és a `deletion_maintenance_runs.completed_at` értékét.
7. Régi próba-backup rögzítése, majd friss üzleti változások (trial, lejárat/visszavonás, törlés). A backup eredeti dátuma és hash-e megmarad. Minden írót fagyasztani, cron kikapcsolása + RESTORE_MAINTENANCE visszakapcsolása, folyamatban lévő írások lezárása. Friss source/journal export és capture-metaadat: a korábbi restore-eszköz ötperces capture- és 30 napos backup-korlátjának betartásával.
8. `prepare-business-restore.mjs` futtatása helyben, az előző checkpoint parancsával. A sikeres kimenet és hash-egyező riport ezután a `prepare-d1-restore.mjs restored.sql restored.sql.report.json restored.d1.sql` bemenete. A D1-hez előbb a szülőtáblákat és egyedi indexeket, az adatok után pedig a triggereket kell létrehozni; a köztes, `foreign_keys=OFF` sort tartalmazó általános SQL nem közvetlen D1-import. Hibánál nincs távoli import. Kizárólag az ellenőrzött üres restore célba kerülhet az adapter teljes jóváhagyott SQL-je. Az eredeti source és az aktuális journal megmarad. Ugyanazon Worker átállítása a restored frozen konfigurációra; az eredeti logikai source-UUID nem változik. [A végrehajtás eredménye és a feltárt javítások](A17_ISOLATED_REHEARSAL_RESULT_2026-10-18.md).
9. Gépi elfogadás: alábbi bizonyítékok rögzítése. Csak ezek után nyitható az elkülönített próbaforgalom és igazolható az ütemező újraindulása. Befejezéskor ismét lezárt végpont és kikapcsolt cron; `restore_jobs.completed_at` csak a tényleges befejezési idő lehet. A három erőforrás későbbi törlése külön, pontos név/UUID szerinti takarítás, nem rekurzív vagy általános cloud-törlés.

## Gépi elfogadási bizonyíték

| Kapu | Elvárt eredmény |
| --- | --- |
| Izoláció | Source/restore/journal valódi név és UUID; közös staging/production nincs a bindingokban |
| Verzió | Telepített teljes commit egyezik a tiszta checkouttal; source és restore ugyanazt a kódot futtatja |
| Ütemezés | Valós cronfutás időpontja, feldolgozott tesztkérés, nincs függő hibás törlés |
| Freeze | HTTP és scheduled írás zárva; exportok tényleges freeze után; idők/hash-ek igazoltak |
| Restore | Import sikeres, FK/integritás rendben, kiválasztott régi napló megmaradt |
| Üzleti állapot | Friss trialkeret, refund/lejárat és tokenreplacement megmaradt; régi grant nem éled fel |
| Törlés és identitás | Törölt adat nem éled fel; trial-marker és programmegkötés változatlan; régi belépési hitelesítők visszavontak |
| Újranyitás | Kizárólag izolált gépi forgalom; visszaállított adat és journal egyezése; karbantartás újra működik |
| Lezárás | Cron/endpoints kikapcsolva, próbaeredmény és mentési leltár rögzítve |

Hibánál először fagyasztás, nem azonnali visszakapcsolás a régi source-ra. Ha a restore cél már új írást fogadott, azt visszalépés előtt egyeztetni kell. A journal régi mentéssel való felülírása sem előre-, sem visszalépésként nem megengedett.

## Helyi ellenőrzések és határ

- Teljes gépi csomag: **64 fájl, 899/899 PASS**.
- A bővített `npm run test:recovery`: **6 fájl, 99/99 PASS**; frontend és Worker típusellenőrzés PASS.
- Öt új előkészítési eset: közös/prod DB kizárása, hibás célok, lezárt konfiguráció, mindkét független séma teljes importja.
- Source és restored konfiguráció Wrangler dry-run: mindkettő PASS, 199,99 KiB / gzip 40,43 KiB; feltöltés nélkül.
- Szintaxisellenőrzés és a valódi helyi generátor futása sikeres. A csomag szintetikus UUID-kat tartalmaz.

Az elkülönített távoli főpróba, a valódi staging későbbi bekötése, a szolgáltatói mentés/logmegőrzés és a jogi/könyvelői ellenőrzés továbbra is nyitott. A main napi használójának V3→V4 migrációja és a teljes kiadási elfogadás külön munkablokk. Az előkészítés nem növeli ezek számát.

**Következő:** A17 — az elkülönített staging erőforrások létrehozása és a bekötési/helyreállítási gépi főpróba végrehajtása a fenti terjedelemben. **GPT-6 Astra · erős; kézi app-teszt nem szükséges.**

GitHub Desktop Summary (az előző, még helyi üzleti restore-változásokkal együtt): `Prepare business recovery and isolated A17 staging rehearsal`

Description: Reconcile current business history after erasure replay. Add isolated source/journal/restore preparation with protected database checks and frozen Worker candidates. Record the read-only staging inventory and concrete remote rehearsal gates. Local tests and both packaging checks pass; no remote resources or user data changed.
