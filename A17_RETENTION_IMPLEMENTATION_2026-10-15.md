# A17 — trialjelölés és megőrzési határidők technikai érvényesítése

Dátum: 2026-10-15. Kiinduló commit: `c85845e` (`Finalize retention and post-deletion trial policies`), ág: `feat/child-profile-v4`. A megkezdett 2026-10-14-i munkát használati korlát után folytattuk. GPT-6 Astra · erős; kézi tulajdonosi teszt nélkül.

## Eredmény és pontos határ

A jóváhagyott [termékszabályok](A17_RETENTION_DECISIONS_2026-10-14.md) helyi kódja és gépi ellenőrzése elkészült. A trialjelölés, a törlési nyilvántartás feltételes takarítása és a technikai billing határideje a Workerhez bekötve; az üzemeltetői fájlokhoz külön, alapból csak előnézetet adó takarító készült. A HU/EN/DE törlési magyarázat frissült.

**Nem történt commit/push/deploy, távoli migráció, valódi fióktörlés vagy funkcióaktiválás.** A külön adatbázis, titkos kulcs, ütemezés és szolgáltatói megőrzés távoli bekötése/főpróbája még szükséges. A helyi teszt nem igazolja a távoli konfigurációt. A teljes A17 kiadási kapu és a jogi/könyvelői véglegesítés nyitott.

## Mi működik helyben?

- **Azonos Google-belépés:** csak a korábban felhasznált trial után készül minimális HMAC-jelölés a naplóadatbázistól független nyilvántartásban. Nincs e-mail, nyers Google-azonosító, gyermekadat vagy token a jelölésben. E-mail-egyezés nem kapcsol össze fiókokat; a Google issuer két megengedett alakja ugyanazt a stabil subjectet jelenti. Az új regisztráció új fiók, nem kapja vissza a korábbi trial hátralévő idejét.
- **Megszakítás és hiányzó konfiguráció:** új törlési kérés előtt a jelölési nyilvántartást ellenőrizzük; felhasznált trialnál a jelölés tartós elmentése megelőzi a belépési azonosság eltávolítását. Hiba után a fiók szünetel és újrapróbálható. Hiányzó, téves környezetű vagy megváltozott kulcsú nyilvántartás nem ad új próbát. A korábbi, fel nem használt próba nem fogy el a fióktörléstől.
- **Program életciklusa:** a kulcsverzió és ellenőrző érték nem írható át egyszerű frissítéssel; az éves felülvizsgálat esedékességét a karbantartás jelzi. A program lezárása törli a jelöléseket és leállítja az új trialkiadást. A lezárt program nem kapcsolható vissza egy egyszerű állapotváltással. A felülvizsgálat tartalmát ember végzi; a dátumot a rendszer nem újítja meg magától.
- **Törlési nyilvántartás:** az ERASE szándék még nem befejezett törlés. A takarító külön ellenőrzi a fő adatbázis befejezett állapotát. Csak igazolt mentésleltár, ténylegesen megsemmisült érintett másolatok és lezárt helyreállítások mellett járhat le a rekord, a szükséges további 30 nap elteltével. A szolgáltató ellenőrzött, legfeljebb 30 napos ablaka paraméterezett; rövidebb ablakot nem növelünk mesterségesen. Nyitott vagy elakadt döntés nem törlődik.
- **Billing:** lezárt EXPIRED/REVOKED jog, majd az esetleges vita későbbi lezárása után 24 naptári hónap, UTC szerinti hónapvégi igazítással. Ismételt webhook nem indítja újra. Visszavonásnál nem egy távoli névleges megújulási dátum számít. A nyitott vita, aktív jog és konkrétan dokumentált jogi megőrzés védett; a lejárt felülvizsgálat figyelmeztetést ad. A kapcsolódó technikai események/jogosultságok is törlődnek; a gyermeknapló nem része ennek a műveletnek. Számviteli bizonylattár nem került ebbe a takarítóba.
- **Lejárt fiókrészletek:** a már nem szükséges törölt account/trial-részletek is takaríthatók, de élő Family felhasznált trialhelyeit megőrizzük. A külön HMAC-jelölés ettől nem tűnik el.
- **Üzemeltetői fájlok:** a `maintain-retained-files.mjs` csak az explicit leltárban szereplő fájlokat kezeli. Mentés és normál napló 30 nap; kijelölt incidensbizonyíték a lezárástól 90 nap; nyitott incidens felülvizsgálati jelzést kap. Másolatnál az eredeti idő számít. A teljes terv ellenőrzése megelőzi a törlést; útvonalkilépés, junction/symlink, változott tartalom és duplikált tétel elutasítva. Felhasználói exportokat nem keres és nem töröl automatikusan.

## Migráció és bekötési sorrend — még nem végrehajtott távoli lépések

1. A fő DB-n a korábbi 011/012 után `worker/migrations/013_retention.sql`; a külön journalban `schema.sql` után **csak ott** `002_retention.sql`. Meglévő journalra az alap `schema.sql` nem futtatandó újra. A 013 a jogosultsági nézetbe is beköti a helyreállítási zárolást.
2. Külön, legalább 32 karakteres, biztonságosan létrehozott `TRIAL_IDENTITY_SECRET`; nem lehet az auth secret vagy a token pepper. `TRIAL_IDENTITY_KEY_VERSION` egyezzen a journalban rögzítettel. Kulcsot nem írunk a Gitbe. Elveszett/lecserélt kulcs nem minősül új trialprogramnak; külön migráció nélkül a kiadás tiltva marad.
3. A `prepare-trial-program.mjs <verzió> <dokumentált-review-UTC-ms> <új-output.sql>` csak helyi SQL-t készít. A titkot a folyamat `TRIAL_IDENTITY_SECRET` környezeti változójából olvassa; az output csak ellenőrző HMAC-ot tartalmaz. A szükségességi/jogalapi felülvizsgálat tényleges dátumát kell megadni, nem kitalált dátumot. A létrehozott SQL meglévő programme sort nem ír felül.
4. A `prepare-deletion-config.mjs` továbbra is kikapcsolt candidate-et ad: `ACCOUNT_DELETION_ENABLED`, `ACCOUNT_DELETION_MAINTENANCE`, `RETENTION_MAINTENANCE` hamis; kulcsverzió `v1`, elkülönített DB-kötés és ötperces cron. Új törlési kérés mindkét karbantartási kapcsolót igényli. Korábban elfogadott törlés a felületi kapcsoló kikapcsolása után is feldolgozható.
5. A karbantartás külön időrésekben dolgozik a törlésen, journalon és billingen, hogy ne adódjanak össze a Free lekérdezési korlátig. Az összesítő jelzi az elavult leltárt, éves trial-review-t és jogi hold-review-t; a hibajelzésekre üzemeltetői riasztást kell kötni. Ez nem automatikusan létrehozott riasztási szolgáltatás.
6. A `retention_inventory` csak az összes mentési hely és tényleges szolgáltatói ablak ellenőrzése után kapjon `verified_until` időt és `provider_window_ms` értéket. A `managed_backups` minden kézi másolatot az eredeti keletkezési idővel tartalmazzon. A `destroyed_at` csak igazolt eltávolítás után tölthető ki. A függő restore-t kezdés előtt fel kell venni a `restore_jobs` táblába; lezárását tényleges befejezés után rögzítjük. Nem a takarító találja ki ezeket a tényeket.
7. A fájltakarító külön üzemeltetői ütemezést igényel. `node worker/scripts/maintain-retained-files.mjs <kezelt-könyvtár> <manifest.json>` előnézet; `--apply` végrehajtás. Manifest: `{ "format": "solemi-retained-files-v1", "records": [...] }`; tételenként `id`, relatív `path`, `sha256`, `kind` (`backup`/`log`/`incident`), eredeti `createdAt`; incidensnél `closedAt`, nyitottnál `closedAt: null` és `reviewedAt`. A manifest ne a kezelt mentés egyetlen példányában legyen. Másolatnál az eredeti dátumot kell átvinni. A hiányzó fájlról adott jelentést csak az összes másolat ellenőrzése után szabad DB-s megsemmisítési igazolásként használni.
8. A store-adapter a hiteles vitaeseményekkel hívja a belső `RetentionService.dispute` műveletet; nincs nyilvános HTTP-adminvégpont. A korábbi eseményidőket a rendszer elutasítja, az ismételt lezárás nem hosszabbít. Jogi kivétel csak konkrét subscriptionre, indokkal, felelőssel és review-határidővel kerülhet `billing_legal_holds` alá. Store/Apple adapter és a szolgáltatói logretention tényleges bekötése a külön kiadási munka része.

## Visszaállítás: ami elkészült és ami még kapu

A restore-eszköz v2 immár kötelező hash-hez kötött metaadatot kér: `environment`, `sourceDatabaseId`, `backupSha256`, `journalSha256`, eredeti `backupCreatedAt`, friss `journalCapturedAt`. A 30 napos vagy régebbi mentést és az öt percnél régebben rögzített journalt elutasítja. A metaadatot megbízható üzemeltetői leltárból kell készíteni; a hash az összetartozást bizonyítja, nem az operator által megadott dátum igazságát.

Parancs: `node worker/scripts/prepare-deletion-restore.mjs backup.sql journal.sql staging|production source-db-id output.sql metadata.json --traffic-frozen`. Minden író forgalmát és a függő kéréseket előbb le kell állítani; a journal önálló, friss példány marad.

A kimenet elvégzi a törlési visszajátszást és a régi belépések visszavonását, eltávolítja az elavult grantokat, majd `retention_restore_gate.blocked=1` állapotot állít be. Ez trialindítást/kötést és a korábbi fizetős/trial grantok használatát is megakadályozza. A report `businessReconciliationRequired: true` jelzése szándékos.

**A legfrissebb account-/Family-trialkeret és store-jogosultság teljes, automatikus visszaegyeztetése még nem készült el.** A zárolást tilos pusztán az SQL-import sikeressége miatt feloldani. A következő gépi helyreállítási főpróba része az aktuális üzleti előzmények ellenőrzött átvitele és a feloldás bizonyítása. A mostani védelem bizonytalan előzményekből nem enged új próbát vagy hozzáférést; nem állítjuk, hogy a teljes szolgáltatás-visszaállítás már elfogadott.

## Gépi bizonyíték

- Teljes tesztcsomag: **62 fájl, 874/874 teszt PASS**. Új esetek: azonos/másik Google-identitás, azonos e-mail, kulcs/környezet hiba, outage/retry, programlezárás, Family-keret, mentési/restore feltételek, lejárati határpillanat, 24 naptári hónap/szökőnap, vita/hold, visszavonás és fájlútvonal-védelem.
- Frontend és Worker typecheck: **PASS**.
- Frontend build/PWA: **PASS**; meglévő chunkméret-figyelmeztetés megmarad.
- Worker staging **dry-run PASS**, feltöltés/kiadás nélkül.
- Elkülönített, helyi Edge-próba: **6 HU/EN/DE fióktörlési UI-eset és a `/delete-account` belépő PASS**; mesterséges adatok, nem valódi fiók.
- A védett, utolsó családtagos törlési próba legfeljebb 46 SQL-lekérdezéses keretben marad, HTTP-authnak hagyott tartalékkal. Ez gépi lekérdezésszám-ellenőrzés, nem távoli CPU-terhelésmérés.
- A Windows sandbox a teszt junctionját és az elkülönített böngészőindítást tiltotta; ugyanezek a helyi tesztek engedélyezett futtatással sikeresek. Új csomag telepítése nem kellett.

## Folytatás és GitHub Desktop

**Következő: A17 — a helyreállítás üzleti előzményeinek egyeztetése és a staging bekötés gépi főpróbájának előkészítése. GPT-6 Astra · erős; kézi app-teszt nélkül indítható.** Az öt termékdöntés változatlan; nem kérdezzük újra. A távoli aktiválás, a tényleges backup/log üzemeltetés és a jogi/könyvelői kapu ettől külön marad.

Summary: `Enforce trial identity and retention safeguards`

Description: Preserve consumed trials across Google account deletion and re-registration using an independent HMAC registry. Add conditional journal cleanup, calendar-based billing retention, managed-file expiry tools and restore safeguards. Update HU/EN/DE deletion notices and cover the changes with automated tests. Remote provisioning and full business-ledger restore reconciliation remain gated.
