# A17 — üzleti előzmények és staging főpróba előkészítése

Dátum: 2026-10-16. GPT-6 Astra · erős. Kézi app-teszt nélkül, mesterséges adatokkal. Az 1. kiadási munkablokk helyi eredménye; nem a teljes A17 vagy a távoli kiadás lezárása.

## Eredmény

A korábbi `prepare-deletion-restore.mjs` továbbra is zárolt, törlési döntésekkel egyeztetett mentést készít. Az új `worker/scripts/prepare-business-restore.mjs` ugyanazt a törlési visszajátszást végzi a régi mentésen és az aktuális, befagyasztott adatbázis pillanatképén, majd kompatibilis fiók-/családi kör esetén átveszi a friss üzleti előzményeket.

Átvett tartalom: aktuális accountprofil/identitás, változatlan tagsági kör, account-trialok és családi felhasználások, előfizetések, eseményazonosítók és sorrend, billing accountkapcsolatok, ellenőrzött store-állapot, lecserélt Google-tokenek, megőrzési/vita/jogi kivétel rekordok, friss jogosultságok. A kiválasztott régi napló tartalma nem cserélődik a friss naplóra. A végleges törlési döntések mindkét bemeneten elsőbbséget élveznek.

- Nem adódik össze a régi és új trialkeret: a friss teljes előzmény az irányadó, a régi ismert felhasználás elvesztése vagy átírása hibát ad. A későbbi egyszeri családhoz kötés megmarad, az eredeti hét nap nem indul újra.
- Négy felhasznált családi hely után az ötödik trial továbbra is tiltott; törölt tag történeti helye is megmarad.
- Aktív store-hozzáféréshez friss, legfeljebb ötperces, a capture előtt ellenőrzött store-állapot és feldolgozott esemény szükséges. A forrásból nem hozunk létre kitalált vásárlást. A platformadapterek tényleges bekötését ez az offline eszköz nem helyettesíti.
- A visszavont/lejárt jogok, ismételt események és lecserélt vásárlási tokenek nem kapnak új érvényt a régi mentésből. Eltérő store-környezet vagy ellentmondó grant esetén nincs kimenet.
- Minden régi account-session, account-device hitelesítő és családi device-token visszavont. Meghívók és belépési challenge-ek kiürülnek. Új hiteles belépés kell; a régi account-device credential sem használható megmaradt aktív eszközként.
- A törlési/trial nyilvántartás külön marad, nem írjuk felül és nem csomagoljuk a napló SQL-ébe. A report ellenőrző hash-t tartalmaz a program-/markerállapotról, személyes tartalmat és titkos kulcsot nem.
- Az eredményben az üzleti zárolás csak ellenőrzött másolás, sémaegyezés, idegenkulcs/integritás és naplóváltozatlanság után oldódik fel. A SQL importja újra létrehozza az összes eredeti triggert; történeti trialbeszúrások nem aktiválódnak újra a másolás során.
- A jelentés `businessReconciliationRequired: false`, de **`trafficMayResume: false` és `remoteApplied: false`**. Az újranyitáshoz külön operátori ellenőrzés kell; a Worker `RESTORE_MAINTENANCE=true` továbbra is blokkolja a HTTP-t és az ütemezőt.

## Bemenetek és bizalmi határ

Node >=24.10 szükséges. A bemenet megbízható üzemeltető által leltározott teljes SQL-export, nem felhasználói JSON-mentés. A dátumok és a forrás adatbázis azonosságának igazságát az exportfolyamatnak kell biztosítania; a hash az állományok összetartozását bizonyítja, nem az operator állításainak hitelességét.

```text
node worker/scripts/prepare-business-restore.mjs backup.sql current.sql journal.sql staging source-db-id output.sql metadata.json --traffic-frozen
```

`metadata.json` mezői: `environment`, `sourceDatabaseId`, `backupSha256`, `currentSha256`, `journalSha256`, `backupCreatedAt`, `frozenAt`, `currentCapturedAt`, `journalCapturedAt`. Idők UTC epoch milliszekundumban. A backup eredeti létrejötte legfeljebb 30 napon belüli lehet; másoláskor nem kap új életkort. A freeze és mindkét aktuális capture legfeljebb ötperces, a capture-ek a freeze után történnek; a friss üzleti forrás nem lehet régebbi a kiválasztott mentésnél. Az aktuális üzleti forrás nem lehet korábbi, még zárolt restore eredménye.

A forgalom leállítása minden írót érint: HTTP, cron, store-eseményfeldolgozás és kézi DB-műveletek; a folyamatban lévő írásokat is le kell zárni. A fagyasztás alatt beérkező store-értesítéseket meg kell őrizni és a platformos folyamatban később újra fel kell dolgozni. Az offline eszköz nem állít le vagy indít el szolgáltatást.

Ha nincs aktuális, megbízható account-/családi trialleltár vagy friss store-állapot, az üzleti zárolás nem oldható fel. Egy régi mentés puszta átnevezése `current.sql`-re nem elfogadott eljárás. A független trialjelölés önmagában nem tartalmazza a teljes családi négyes keretet.

## Tudatos megállási feltételek

A két törléssel egyeztetett másolatnak azonos accountazonosító-/státuszkört, Google-identitás-kötéseket, családazonosítókat és tagsági történetet kell tartalmaznia. Eltéréskor `BUSINESS_SCOPE_CHANGED:accounts|identities|families|memberships`; ilyenkor nincs automatikus összekeverés vagy publishálható kimenet. Új account, új/megszűnt család, tagsági/adminváltás esetén kompatibilis frissebb mentést vagy külön felülvizsgált adat-egyeztetést kell választani. Ez nem általános, minden történeti topológiát összeolvasztó migrátor.

A séma is pontosan egyezzen a jelenlegi A17 sémával (fő DB 013-ig, külön nyilvántartás schema + 002). Régebbi sémájú mentést előbb elkülönített másolaton kell megfelelően migrálni. A main V3→V4 felhasználói átállás külön kiadási munkablokk.

A napló visszaállítása utáni klienskurzor/PWA/offline sor egyeztetése és a visszaállítás után érkezett új bejegyzések védelme továbbra is az A25 tényleges visszaállítási tervének része. Az üzleti zárolás feloldása ezt nem kerüli meg.

## Staging bekötés gépi főpróbájának menete

1. **Távoli változtatás nélküli előkészítés:** az aktuális staging Worker/D1 verzió és migrációk olvasási leltára; külön, eldobható próba-adatbázisok és külön próba-Worker terve. A már használt staging családok naplóját nem töltjük vissza próbaként.
2. **Bekötési feltételek:** fő DB szükséges migrációi, önálló `ERASURE_JOURNAL`, ellenőrzött `journal_identity`, külön HMAC secret/program-azonosság, mentési leltár és ütemezés. A titkos kulcs nem kerül konfigurációs fájlba/Gitbe. A mintában szereplő UUID-k nem valódi létrehozott erőforrások.
3. **Konfigurációs jelölt:** a meglévő `prepare-deletion-config.mjs` állítja elő a két DB-bindingot és az ötperces cron-tervet. Valódi Wrangler-próbához `.json` vagy `.jsonc` fájlt kell használni. Az aktiválási kapcsolók maradnak kikapcsolva. A forgalomzár a restore idejére külön szükséges; a cron puszta jelenléte nem igazolja működését.
4. **Gépi helyi próba:** `npm run test:recovery`. Régi napló + frissebb négy trial, refund, tokenreplacement, jogi hold, törlés és újraregisztráció; hibás/stale bemenetek; valódi offline CLI, importálható SQL, ismételhetőség, eredeti állományok megőrzése, HTTP/cron zár. Szintetikus adatokkal.
5. **Későbbi elkülönített távoli próba:** a jóváhagyott erőforrásokon ellenőrzött telepítés, mesterséges account/napló, freeze és friss capture, helyi SQL-előkészítés, üres cél DB import, integritás/hash/előzmények egyezése. A független journal eredeti példánya változatlan. A közösen használt staging DB-re nem végzünk Time Travel próbát.
6. **Újranyitási kapu:** azonos Worker/schema, helyes valódi kulcs és programmegyezés, trial/refund/törlés helyes eredménye, új belépés és kliensnapló egyeztetése, friss store-események rendezése, valós cronfutás és hibafigyelés. Csak ezután forgalomnyitás és a próba lezárása. A `restore_jobs` lezárási ideje csak tényleges befejezést követhet.

Az 1–4. pont helyi technikai előkészítése ebben a blokkban elkészült; az 1. pont friss **távoli leltára**, az erőforrások létrehozása és az 5–6. pont távoli végrehajtása még nem történt meg.

## Ellenőrzési eredmények

- Teljes gépi csomag: **63 fájl, 894/894 teszt PASS**; 20 új üzleti helyreállítási eset.
- Célzott helyreállítási parancs: **5 fájl, 94/94 PASS**. Az utolsó capture-időhatár pontosítása után az érintett üzleti csomag ismét **20/20 PASS**.
- Frontend és Worker typecheck: PASS. Frontend build/PWA: PASS, a meglévő nagy-csomag figyelmeztetéssel.
- Két bindingos, szintetikus DB-azonosítós, letiltott aktiválású staging konfiguráció helyi Worker dry-run: PASS, 199,89 KiB / gzip 40,43 KiB. Feltöltés nem történt. Helyi jelölt a Gitből kizárt `worker/.private-backups/a17-rehearsal/wrangler.jsonc` alatt; nem telepítendő konfiguráció.
- A teljes első sandboxfutás 892 sikeres teszt mellett a meglévő Windows junction létrehozási korláton állt meg. Engedélyezett helyi futtatással, új próba hozzáadása után 894/894 sikeres; a fájlvédelmi tesztet nem kapcsoltuk ki.

## Következő és GitHub Desktop

**2026-10-17-es folytatás:** az itt következőként megnevezett leltár és elkülönített előkészítés már elkészült. [Leltár és végrehajtási csomag](A17_STAGING_REHEARSAL_PREPARATION_2026-10-17.md). A lenti dátumozott eredmények az előző blokk bizonyítékai; aktuális következő az elkülönített távoli gépi főpróba.

**Következő: A17 — staging erőforrás- és konfigurációleltár, majd az elkülönített bekötési főpróba konkrét előkészítése. GPT-6 Astra · erős; kézi app-teszt nélkül indítható.** Az olvasási leltár után lehet pontosan megnevezni a létrehozandó erőforrásokat és a végrehajtandó távoli műveleteket. Az öt elfogadott termékdöntés változatlan. Távoli kiadás/aktiválás, valódi mentés- és logüzemeltetés, jogi/könyvelői véglegesítés továbbra is külön kapu.

Summary: `Reconcile current business history during backup recovery`

Description: Add offline reconciliation of current trial, subscription, event, token-replacement and retention ledgers after erasure replay. Reject incompatible scopes, stale store proof and inconsistent grants; revoke restored device credentials and keep traffic reopening separate. Add 20 regression cases and a repeatable recovery test command. Prepare the isolated staging rehearsal; no remote deployment or real account changes.
