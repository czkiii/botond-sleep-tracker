# A17 — közös staging bekötése

Dátum: 2026-10-19. A tulajdonos által kért közös staging-bekötés; az október 18-án lezárt elkülönített főpróbát nem ismételtük meg.

## Célok és tényleges beállítások

| Erőforrás | Azonosító |
|---|---|
| Worker | `solemi-sleep-sync-staging` |
| Meglévő fő adatbázis | `solemi-sleep-db-staging` / `1fdd9f64-ea4b-4499-9b6e-636462d51d37` |
| Új, független törlési nyilvántartás | `solemi-erasure-journal-staging` / `2d932996-4b9b-4a78-87fb-34a79acfd700` |
| Futó alkalmazáskód | `75ecaa7a2300531723159da1929dc4b879a6ec74` |
| Visszakapcsolt Worker-verzió | `4f6b7823-3f4b-4a26-b15c-30f9c978eb23` |
| Konfiguráció | [worker/wrangler.staging.jsonc](worker/wrangler.staging.jsonc) |

A futó kód az induláskor tiszta checkoutból származik. A külön előkészített és ellenőrzött konfigurációval történt telepítés; a runtime-commit nem állítás arról, hogy az új konfiguráció már commitolva van. A végleges konfiguráció normalizált JSON SHA-256 értéke: `6bad0194b733b76e793384c968b50a14d42e706cbaffe3e1ac8ee3b3719fe23f`. A követett fájlt a ténylegesen telepített változattal külön összevetjük.

- `ERASURE_JOURNAL` külön D1-re mutat; a journal identitása `staging` és a fenti fő adatbázis UUID-ja.
- Új, független `TRIAL_IDENTITY_SECRET`, `v1` kulcsverzió és hozzá illeszkedő programme-ellenőrzőérték került be. A meglévő `AUTH_SECRET` és `TOKEN_PEPPER` nem változott.
- `ACCOUNT_DELETION_MAINTENANCE=true`, `RETENTION_MAINTENANCE=true`, cron: `*/5 * * * *`.
- `RESTORE_MAINTENANCE=false`: a rövid migrációs karbantartás véget ért, a szolgáltatás elérhető.
- **`ACCOUNT_DELETION_ENABLED=false`, `TRIAL_ENABLED=false`.** A bekötés az üzemeltetési alapot kapcsolja be. Nyilvános törlés/trial, frontend-kapcsoló és teljes kiadási elfogadás nem lett automatikusan engedélyezve.
- A meglévő környezet-, origin-, Google-, jogosultság- és kéréskorlát-beállítások megmaradtak. Production, main és a lezárt próba-erőforrások nem változtak.

## Mentés és migráció

A friss távoli leltár igazolta, hogy 011–013 még hiányzott, trial nem volt. Az előzetes teljes SQL-mentést elkülönített memóriabeli adatbázisba töltöttük; a három migráció helyi próbája minden régi sort és jogosultságot megőrzött.

A tényleges alkalmazás előtt HTTP 503-as karbantartás és üres cronlista lépett életbe. Két egymást követő fagyasztott export azonos hash-e igazolta a stabil bemenetet. Az egyesített 011–013 migráció kizárólag a fő staging D1-re került; a journal kizárólag saját `schema.sql` + `002_retention.sql` sémáját kapta. Régi mentést nem töltöttünk a journalra.

| Bizonyíték | SHA-256 / eredmény |
|---|---|
| Előzetes és stabil fagyasztott fő DB | `83fa2c211ab5d20d5a0e16e1c5c00eb46a2e4319f1e07c42db5ffb5742e6a484` |
| Alkalmazott 011–013 SQL | `b375d10ada69626748bc594715925afa27798b163cb4c3726e9d3dd2cb9fcd5e` |
| Migráció utáni fő DB | `36cea8d82f817aeef5072db3685f238c96a70cfa9092fbb485e7368b75413569` |
| Összes meglévő alkalmazástábla | **21/21 teljes adattartalma azonos a migráció előtt/után** |
| Jogosultsági nézet | Változatlan; 9 meglévő entitlement megmaradt |
| Fontos darabszámok | 3 account, 37 család, 75 gyermekrekord, 2052 alvásrekord, 2306 művelet, 3 előfizetés, 0 trial |
| Új retention-alap | 3 billing-retention sor, restore gate = 0; nulla törlési kérelem |
| Integritás / idegen kulcsok | Helyi visszatöltés és távoli FK-ellenőrzés sikeres |

A darabszámok adatbázisrekordokat jelentenek, a korábbi törölt/tombstone sorokkal együtt. Nem a felületen látható aktív gyermekek száma.

## Ellenőrzés

- A visszakapcsolás után health, belső origin CORS és a bejelentkezést igénylő hozzáférési/családi/csomagvégpontok védelme PASS; minden válasz azonosította a fenti runtime-commitot.
- A tényleges Pages-proxyn át az `/api/v1/auth/access` bejelentkezés nélkül HTTP 401 / `SESSION_INVALID` választ adott, ugyanazzal a runtime-commit fejléccel. Az `/api/health` nincs a proxy engedélyezett útvonalai között; az első, arra irányuló ellenőrzés 404-et kapott, majd a valós auth-útvonal ellenőrzése sikeres lett.
- Új konfiguráció feltöltés nélküli csomagpróbája PASS; a követett konfiguráció normalizált tartalma egyezik a telepítettel.
- **907/907 teszt, 65 fájl; frontend és Worker típusellenőrzés PASS.** Az új regresszió a nyilvános aktiválás tiltását, külön journal-bindingot és tényleges maintenance-konfigurációt ellenőrzi. A generátor meglévő journal felülkonfigurálását továbbra is tiltja.
- Az első helyi tesztindítást Windows ideiglenesfájl-jogosultság akadályozta, a következőt a sandbox junction-tiltása. A teljes csomag megfelelő helyi futtatási jogosultsággal újrafuttatva sikeres; termékkódot emiatt nem módosítottunk.
- Tényleges retention-cron: **2026-10-19 18:40:13.988 UTC**, `outcome=ok`, `cleaned=0`, `inventoryRequired=true`, `trialReviewRequired=true`, lejárt legal-hold felülvizsgálat: 0. A hiányzó teljes leltár és felülvizsgálat jelzése elvárt védelmi állapot.
- Tényleges törlési cron: **2026-10-19 18:45:12.650 UTC**, `outcome=ok`, `processed=0`, `failed=0`, `dueRemaining=0`; a fő DB heartbeat sora is ezt igazolta.
- A záró exportban a 18 tartós üzleti/napló/hozzáférési tábla és a jogosultsági nézet teljes tartalma változatlan. A karbantartás 12 már lejárt sessiont és az ezekhez kapcsolódó 52 régi refresh-token-előzményt törölt; minden eltávolított sort az eredeti mentés lejárati idejéhez és sessionkapcsolatához ellenőriztünk. Érvényes session nem tűnt el, új trial/törlési kérelem nem keletkezett. Az üres challenge-tábla változatlan.
- Záró fő DB SHA-256: `159d1097f8d3a060879b1f1f0276b0975c48cc2ca37895ad505f9904bc3a9367`; külön journal-mentés: `cb347eea989903e0dc96ce0b5e7b4cd126db3eb5a6a3e793d95fb7172be2fb8e`. A hét mentési fájl manifest-ellenőrzése sikeres; hat fő DB-export szerepel a független backup-nyilvántartásban, a journal külön snapshotként marad meg.
- A használati korlát miatti megszakítás után, **2026-10-19 19:35 UTC** a staging health ismét HTTP 200-at és ugyanazt a runtime-commitot igazolta. A feladathoz tartozó helyi naplófigyelő már nem futott, a vezérlőfolyamat lezárva; a kész migrációkat és teszteket nem ismételtük meg.

## Mentések, kulcs és megőrzési határok

A részletes, személyes adatot is tartalmazó SQL-ek és gépi bizonyítékok kizárólag a Gitből kizárt `worker/.private-backups/a17-shared-staging-2026-10-19/` könyvtárban vannak. Az október 18-i előzetes mentés eredeti dátumát megőriztük. A fő DB-mentések a független `managed_backups` nyilvántartásba kerültek, legfeljebb 30 napos lejárattal; a végső állományjegyzék a tényleges fájlhash-eket és eredeti létrehozási időket tartalmazza.

A trialkulcs titkosított helyi példánya `trial-identity-key.dpapi`: Windows DPAPI CurrentUser védelem, sikeres titkosítás/visszafejtés-egyezés. A kulcs nem került SQL-be, konfigurációba, naplóba vagy Gitbe. Ez a példány az adott Windows-felhasználó/gép védelméhez kötött; **nem helyettesíti a gép elvesztésekor is elérhető üzemeltetői kulcsletétet**. A kulcsot később nem szabad egyszerűen újragenerálni, mert a korábbi trialjelölések felismerhetőségét elveszítenénk.

A `trial_program.reviewed_at=0` tudatosan megőrzi a szükségességi felülvizsgálat jelzését; nem rögzítettünk el nem végzett jogi ellenőrzést. A `retention_inventory` nincs hitelesítettnek jelölve: a teljes szolgáltatói és helyi mentésleltár még nem zárult le. Emiatt a journal takarítása biztonságosan vár. A manifest és a lejárati rekord **nem jelenti**, hogy a helyi fájlok automatikus törlésének ütemezése vagy a külső riasztás már működik.

## Mi kész, mi következik?

**A kért közös staging-bekötés és gépi ellenőrzése lezárva.** Ez a 2. munkablokk közös staging-infrastruktúrájának bekötése. A teljes A17/kiadási kapuhoz még tényleges mentés-/logmegőrzési üzemeltetés, külső kulcsletét/riasztási cél, szükségességi/jogi és bizonylati véglegesítés, majd ellenőrzött nyilvános aktiválás szükséges. A store-függő esetek az áruházi integráció részei maradnak.

**Következő javasolt feladat:** a main-átállás olvasási leltára és a meglévő felhasználó másolatos migrációs tervének konkrét előkészítése; merge és éles adatváltoztatás nélkül. **GPT-6 Astra · erős; kezdetben kézi app-teszt nélkül.** A már elkészült A17 főpróbát és bekötést nem ismételjük meg.

GitHub Desktop Summary: `Wire A17 shared staging journal and scheduled maintenance`

Description: `Apply staging migrations 011–013 with verified backups and preserved diary/access data. Configure an independent erasure journal and maintenance cron, keep public deletion/trial activation disabled, and record machine verification and remaining operational gates.`

A hét fájlt érintő konfiguráció, teszt és dokumentáció commit/push művelete a tulajdonosnál marad. A következő normál staging kiadás előtt ezeket együtt kell commitolni; a telepítési script tiszta munkafa-ellenőrzése változatlan.
