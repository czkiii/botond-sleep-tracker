# Solemi Sleep — belső verziótól a kiadásig

Utolsó frissítés: 2026-09-22

Ez az operatív lista a `SOLEMI_EXECUTION_PLAN.md` és a `SOLEMI_MASTER_ROADMAP.md` kiadási pontjait rendezi végrehajtási sorrendbe.

**2026-09-20 tulajdonosi pontosítás:** [OWNER_DECISIONS_REVIEW_2026-09-20.md](OWNER_DECISIONS_REVIEW_2026-09-20.md) és az ott hivatkozott öt TXT elsőbbséget élvez az eltérő régi termékígéretekkel szemben. PDF/Google+Apple login/havi+éves/trial V1-ben; emlékeztetők és életkori norma nélkül. A03 helyi implementációja elkészült, staging elfogadása nyitott. A saját domain megvásárlása rögzítve, bekötése és a privacy/retention tényleges megvalósítása még nyitott. Ettől auditkapu nem válik automatikusan teljesítetté.

## Elsődleges kiadási kapu — teljes audit, 2026-09-20

Részletes bizonyíték, súlyosság és lezárási feltétel:
[FULL_RELEASE_AUDIT_2026-09-20.md](FULL_RELEASE_AUDIT_2026-09-20.md), auditált SHA `e9374f4`.
Az alábbi lista a korábbi szakaszoknál elsőbbséget élvez. Nincs automatikus
„első frissítésben” halasztás. Minden tételhez javítási commit, sikeres próba
vagy kifejezett, indokolt termékdöntés kell; a puszta priorizálás nem lezárás.

- [x] A01 — Sérült helyi napló megőrzése, automatikus felülírás megakadályozása. 195/195 teszt, typecheck és két build sikeres.
- [x] A02 — Többlapos mentés, quota/crash és tartós napló–outbox egység. Egyetlen böngészőlap írhat; az atomi helyi envelope, hibainjektálás és kétlapos átvételi próba sikeres (198/198 teszt).
- [ ] A03 — Import/törlés családi hatása és visszaállítható biztonsági mentés. Implementáció, commit/push, staging Worker/Pages build és javított smoke kész; a kéttelefonos import/törlés/offline/pending/restore elfogadás folyamatban.
- [ ] A04 — Valódi account-szintű családi kilépés, pending adatok védelme. Implementáció, regresszió és `3114711` commit/push kész: külön eszközleválasztás/újracsatlakozás, account-kilépés, választható vagy automatikus adminátadás, utolsó tag blokkolása, régi device-tokenek visszavonása és utolsó fizető utáni pause. Staging kétaccountos elfogadás hiányzik.
- [ ] A05 — Fiókváltás/guest kapcsolat és helyi adatok elkülönítése. Implementáció, regresszió és `3665d25` commit/push kész: accountonként külön diary+sync workspace, explicit vendégnapló-átvétel, kijelentkezéskori megtartás/törlés, pending megőrzés, többtabos írózár, quota- és crash-helyreállítás. Staging A→logout→B/guest elfogadás hiányzik.
- [ ] A06 — Legacy API fizetős sync-megkerülés lezárása, kompatibilis átállás. Implementáció, regresszió és `eac16ef` commit/push kész: enforcement mellett kötelező account+device+membership+családi entitlement; atomi, fizetős accountos családlétrehozás; raw legacy create/join/sync és invite tiltás; meglévő család adatvesztés nélküli claimje. Staging build és kézi elfogadás nincs rögzítve.
- [ ] A07 — Production config/auth-proxy/entitlement és tesztkapcsolók elkülönítése. Helyi kiadási kapu és Free alapállapot elkészült: GitHub Pages production build blokkolva; a proxy éles hoston nem hív staginget; production Worker hiányos vagy tesztmódú konfigurációval 503-at ad. Frontend és Worker typecheck, 27 fájl / 232 teszt sikeres. Éles Cloudflare Pages host, OAuth origin/cookie, Worker secrets, D1 migráció és mobilos elfogadás még nyitott.
- [ ] A08 — Billing eseményverseny és sorrend javítása. Helyi atomi event-ütközésvédelem, visszavonás elsőbbsége és párhuzamos első vásárlás regressziói kész; a `008_billing_event_order.sql` csak helyben tesztelt, távoli D1-en nincs alkalmazva. Provider-szintű állapotverzió és éles adapteres verify/webhook/restore elfogadás hiányzik.
- [ ] A09 — Google linked-token csere és régi grantok visszavonása.
- [ ] A10 — Store sandbox/production környezeti kerítés.
- [ ] A11 — Hiteles store verify/restore/webhook/acknowledgement és paywall.
- [ ] A12 — Valós natív iOS/Android kiadás és megfelelő iOS-login.
- [ ] A13 — Új aktív alvás jegyzetének és kézi típusának szinkronja. Javítás, kliens–Worker–SQLite regresszió és `c5ccd23` commit/push kész; staging elfogadás hiányzik.
- [ ] A14 — Utolsó gyermek párhuzamos törlésének atomi védelme. Feltételes D1 batch, determinisztikus konkurens törlési regresszió és `c5ccd23` commit/push kész; staging elfogadás hiányzik.
- [ ] A15 — Nem üres helyi napló csatlakozása, gyermekkonfliktus és pull-határesetek.
- [ ] A16 — Offline fizetős hozzáférés, refresh race, harmadik eszköz próba.
- [ ] A17 — Accounttörlés, megőrzés, privacy és store adatkezelési tájékoztatás.
- [ ] A18 — Proxy eredeti Origin ellenőrzése és auth CSRF-határ.
- [ ] A19 — Rate/body/resource limitek, security headerek és függőségvizsgálat.
- [ ] A20 — Összehasonlítható konfliktusválasztás, akadálymentes és mobilos UX.
- [ ] A21 — Statisztikai összegek/szűrés és időpontjelzések egyeztetése.
- [ ] A22 — Telefonos teljesítményprofil, másodpercenkénti elemzés újraszámolás rendezése.
- [ ] A23 — Terv–funkciómátrix–ár/paywall ígéretek tételes lezárása a tulajdonossal.
- [ ] A24 — Lockfile, CI-hez kötött release, pontos SHA és PWA upgrade.
- [ ] A25 — Teljes sémaleltár, migrációs terv, staging restore és rollback főpróba.
- [ ] A26 — Support/monitoring, staging adatkezelés és két store beadási bizonyíték.
- [ ] A27 — Family+ számítási audit S01–S15 lezárása az alábbi bontásban.

**Jelenlegi döntés: nyilvános fizetős kiadás még nem engedhető tovább.**
Az audit 185 meglévő tesztje és buildjei sikeresek, de a fenti feladatok nyitottak.
A részletes jelentés megkülönbözteti a bizonyított hibát a további próbát igénylő
kockázattól. A történeti pipák nem jelentik az auditpontok lezárását.

## Family+ számítási kapu — A27 / S01–S15

Részletes bemenet, jelenlegi eredmény és elfogadási feltétel:
[FAMILY_PLUS_STATISTICS_AUDIT_2026-09-20.md](FAMILY_PLUS_STATISTICS_AUDIT_2026-09-20.md).
Vizsgált HEAD `3a0a687`, az alkalmazás forrása változatlan. A 72 sikeres helyi
próba az audit bizonyítéka, nem a hibák lezárása. Minden alábbi tétel nyitott.

- [ ] S01 — Másodpercpontos nappal/éjjel bontás, közös időhatár-kezelés.
- [ ] S02 — Megszakított éjszaka és valódi reggeli ébredés megkülönböztetése.
- [ ] S03 — Éjfél körüli óraidők körkörös statisztikája.
- [ ] S04 — Minimum mintaszám és kiemelt tipikus érték egyezése.
- [ ] S05 — Adatokhoz igazodó bizonyossági címke és pontos Q1–Q3 magyarázat.
- [ ] S06 — Becsléstípus és kiválasztott mintavételi időszak egyezése.
- [ ] S07 — Elavult ébredés/hiányos aktuális kontextus becslésének kezelése.
- [ ] S08 — Hasonló napok aktív alvás alatti állapotának javítása.
- [ ] S09 — Hasonlóság vagy legközelebbi elérhető nap következetes jelentése.
- [ ] S10 — Leghosszabb szakasz közös nevezője, nap-/hónap-hozzárendelése és felirata.
- [ ] S11 — Hiányos napló, teljes nap és nulla megkülönböztetése; 4/5 nap eltérés.
- [ ] S12 — Havi riport és összehasonlítás tényleges időszakának jelzése.
- [ ] S13 — Átfedés, duplikátum és ellentétes kézi típus egységes szabálya.
- [ ] S14 — Időzóna szerinti csoportosítás dokumentált döntése és próbája.
- [ ] S15 — Esti lefekvés és éjszakai visszaalvás külön mintacsoportja.

Javítás után közös tesztnapló minden kártyán, HU/EN/DE szövegek és célzott
kéttelefonos elfogadás szükséges. Nincs automatikus kiadás utáni halasztás;
az adatmegőrzési sorrend az A03 staging elfogadásával folytatódik.

## Célállapotok

### 1. Belső release candidate

Egy konkrét Git commitból reprodukálhatóan felépülő, külön URL-en megnyitható verzió, amely nem használja és nem módosítja automatikusan az éles D1/Worker környezetet.

### 2. Nyilvános kiadás

Az ellenőrzött release candidate kontrollált backend-migrációval, smoke testtel és dokumentált visszaállási ponttal kerül élesbe.

---

## A. Jelenlegi fejlesztési ág rendezése

- [x] Child Profile V4 és gyerekenkénti sessionmodell elkészült.
- [x] Multi-child Family Sync és D1 `002_children_v4.sql` migráció elkészült.
- [x] Profilkép, gyors időkorrekció, alvástípus-felülírás és alap adatminőségi jelzések elkészültek.
- [x] Wake window Insights-alap első szelete elkészült.
- [ ] A roadmap és execution plan kész státuszainak frissítése.
- [x] A PR leírásának frissítése az Insights változással és az aktuális ellenőrzési eredményekkel.
- [x] A Child Profile és az alap Insights ugyanabban a draft PR-ban marad a belső release candidate-ig.

**Kapu:** a PR scope-ja érthető, a dokumentáció nem állít elavult állapotot.

## B. Automatikus GitHub-ellenőrzés

- [ ] Reprodukálható dependency lock létrehozása/ellenőrzése a frontendhez és a Workerhez.
- [x] PR-re és branch pushra futó GitHub Actions workflow létrehozása.
- [x] Frontend TypeScript typecheck hozzáadása a CI-hez.
- [x] Worker TypeScript typecheck hozzáadása a CI-hez.
- [x] Production frontend build hozzáadása a CI-hez.
- [x] Az Insights számítási motorhoz automatizált tesztek hozzáadása:
  - [x] nincs adat;
  - [x] kevés adat;
  - [x] 3+ használható wake window;
  - [x] medián páros és páratlan mintaszámmal;
  - [x] aktív alvás;
  - [x] átfedő session;
  - [x] extrém hosszú session;
  - [x] hibás bejegyzés nem hidalható át két tiszta session között.
- [ ] Kötelező zöld checkek beállítása merge előtt.

**Kapu:** ugyanaz a commit minden GitHub-futásban zöld typechecket, tesztet és buildet ad.

## C. A fő app belső, GitHubról épülő verziója

A fejlesztés ugyanabban a repóban és ugyanazon a fő alkalmazáson folytatódik. A belső preview nem külön termék és nem külön forráskód: a feature ág pontos commitjának ideiglenesen hosztolt buildje. A jelenlegi GitHub Pages workflow csak a `main` ágat publikálja, ezért a feature ág ugyanoda deployolása felülírná a mostani verziót.

- [x] Belső hosting irány: ugyanazon GitHub-repó feature ágának preview buildje, forrásduplikáció nélkül.
- [x] Preview szolgáltató: külön Cloudflare Pages projekt, ugyanebből a GitHub-repóból és feature ágból.
- [ ] A preview hozzáférés-védelmének véglegesítése.
- [x] A frontend-only belső build ne töltse be a Family Sync réteget, így ne használja az éles Worker URL-jét.
- [x] Frontend-only tesztmódban a Family Sync kikapcsolása; staging Worker + D1 a későbbi teljes sync-teszthez szükséges.
- [x] A belső preview build workflow csak a `main` célú PR-ekből vagy manuálisan indítható.
- [x] A preview oldalon láthatóan jelezni: `INTERNAL / TEST`.
- [x] A pontos commit SHA megjelenítése vagy könnyű visszakereshetősége.
- [x] Belső preview URL: https://solemi-sleep-internal.pages.dev (`01905d8` első ellenőrzött deploy).

**Kapu:** a feature ág egy ismert commitja külön URL-en megnyitható, az éles adatokat nem érinti.

## D. Belső működési teszt

### Alapfunkciók

- [x] Új telepítés és első indítás a Cloudflare Pages belső preview-n.
- [x] Alvás indítása és leállítása.
- [x] Manuális alvás létrehozása.
- [x] Alvás szerkesztése az Előzményekben.
- [x] Reload után helyes állapot és megmaradó alvásadat.
- [ ] Háttérbe küldés és visszatérés után helyes állapot.
- [ ] Offline rögzítés és későbbi visszatérés online állapotba.
- [x] Éjfél átlépő alvás automatizált határteszttel.
- [x] Időzóna- és DST-próba 23 és 25 órás Europe/Budapest napokkal.

### Child Profile V4

- [x] Régi V3 adatok automatikus V4 migrációja adatvesztés nélkül, célzott regressziós teszttel.
- [x] Egygyerekes felület egyszerű marad.
- [x] Több gyerek létrehozása és váltása.
- [x] History, Sleeps és Insights együtt vált gyereket.
- [x] Két gyereknek párhuzamos aktív alvása lehet.
- [x] Profilkép eszközön marad és reload után megjelenik.
- [x] Export/import nem keveri össze a gyerekeket, kétprofilos round-trip regressziós teszttel.

### Family Sync staging környezetben

- [x] Külön staging Worker-konfiguráció elkészült, production erőforrás-hivatkozás nélkül.
- [x] Internal frontend csak explicit staging API URL esetén tölti be a Family Sync réteget.
- [x] Automatizált staging smoke teszt két gyerekkel és két készülékkel sikeresen lefutott.
- [x] Külön EU-jurisdictionös `solemi-sleep-db-staging` D1 létrehozása és a teljes `schema.sql` alkalmazása.
- [x] `solemi-sleep-sync-staging` Worker deploy és külön `TOKEN_PEPPER` secret beállítása.
- [x] Internal Pages `VITE_SYNC_API_BASE` beállítása a staging Worker URL-jére.
- [x] Új internal Pages buildben a `Family Sync staging` jelzés és a kapcsolódási felület ellenőrzése.
- [x] Két készülék összekapcsolása meghívókóddal.
- [x] Kétirányú aktív alvás start/stop szinkron ellenőrzése két böngészőkörnyezet között.
- [x] Két gyerek párhuzamos aktív alvása mindkét böngészőkörnyezetben helyesen megjelenik.
- [x] Profilnév módosítása mindkét irányban szinkronizálódik.
- [x] Profil create/update megjelenik mindkét készüléken.
- [x] Gyerekprofil törlése a hozzá tartozó alvásokkal együtt mindkét készüléken eltűnik.
- [x] Lezárt alvás szerkesztése szinkronizálódik a másik böngészőkörnyezetbe.
- [x] Gyerekenkénti start/stop/edit/delete szinkronizálódik.
- [x] Offline queue visszacsatlakozás után helyesen ürül, hálózatvesztést modellező egységteszttel.
- [x] Dupla Start, dupla Stop és szerkesztési konfliktus teszt a staging Workeren.
- [x] Egy gyerek hibája nem módosítja a másik gyerek adatait a teljes staging állapot ellenőrzésével.
- [x] Account–legacy family additív staging D1 migráció teljes before/after exporttal, változatlan legacy hash-ekkel és tiszta idegenkulcs-ellenőrzéssel.
- [x] Ugyanaz a Google-account a második saját böngészőben meghívókód nélkül visszakapja a már claimelt családot és annak adatait.
- [ ] Friss második böngészőben a családi profil átvétele eltávolítja az érintetlen névtelen kezdőprofilt, de valódi helyi profilt nem töröl.
- [x] Külön családtag saját Google-accounttal, accountos meghívóbeváltással csatlakozik.
- [x] Additív subscription/entitlement staging migráció teljes before/after exporttal, változatlan legacy hash-ekkel és tiszta idegenkulcs-ellenőrzéssel.
- [x] Szerveroldali Family Sync gate automatizált tesztje: Family+ fizető + Free tag aktív; az utolsó grant megszűnése pause-t ad és megőrzi a pending módosítást.
- [x] Ugyanez valódi két Google-accounttal az új internal Pages buildben elfogadva: Family+ + Free sync, Free + Free pause, Family+ reaktiválás és pending flush sikeres.
- [x] Kijelentkezés, helyi appadatok törlése és Google-belépés után a családi cloud adatok visszaállnak.
- [x] Pause alatt két eszközön ugyanazt az alvást érintő eltérő módosítás szerveroldali revision-conflictet ad, és egyik változatot sem írja felül csendben.
- [x] Kliensoldali választás: ezen a telefonon lévő vagy családi alvásváltozat megtartása.
- [x] Külön alvásokat érintő stale módosítások automatizált tesztje konfliktus nélkül sikeres.
- [x] Az alvásszintű konfliktusészlelés és mindkét feloldás valódi kéttelefonos staging elfogadása (2026-09-17).
  - [x] Családi változat megtartása: felhasználói választás után mindkét telefon adatai egyeznek (2026-09-17).
  - [x] Ezen a telefonon lévő változat megtartása: egyező adatok, egyetlen bejegyzés és reload utáni ellenőrzés (a teljes A/B jegyzetes lépéssor felhasználói visszaigazolása).
- [x] Kliens–Worker helyi integrációs próba: két készülék offline ugyanazt az alvást szerkeszti, mindkét konfliktusválasztás után egy rekord és egyező adat marad.
- [x] Lassú/párhuzamos szinkronválaszok és saját feltöltés utáni téves konfliktus célzott regressziós tesztjei.
- [x] `SESSION_NOT_FOUND` helyi integrációs próbája: régi hiányzó alvás elkülönítése után a normál kétirányú szinkron folytatódik, a helyi sor/pending megmarad; egyedi, idempotens megosztás explicit választással.
- [x] A beragadt feltöltés javítása utáni normál szinkron és visszajelzés telefonos elfogadása (2026-09-17; pozitív felhasználói visszajelzés, a konkrét Start/korrekció/Stop/reload lépések nincsenek külön részletezve).
- [x] Az opcionális hiányzóalvás-megosztás élő elfogadása a konfliktus rendezése után (2026-09-17; családi változat, majd korábbi helyi alvás megosztása után minden egyezik).
- [x] A jelzett duplikáció/eltérő telefonállapot miatti regressziós újrateszt az új internal buildben: mindkét konfliktusválasztás után egyező készülékadatok, helyi választás után egy sor és reload utáni egyezés elfogadva (`SYNC_RETEST_CHECKPOINT_2026-09-17.md`). Az eredeti régi rekordok történeti eredete nem bizonyított; automatikus deduplikáció nem történt.

### Insights és adatminőség

- [x] Aktuális ébrenléti idő helyes.
- [x] 14 napos jellemző wake window helyes mintákból számolódik.
- [x] Kevés adatnál nincs túlzott bizonyosság.
- [x] Átfedő és extrém session kimarad a számításból, és erről jelzés jelenik meg.
- [x] HU / EN / DE szövegek és mobil layout ellenőrzése.
- [x] Hasonló napok: a három találat és a későbbi elalvás kézi ellenőrzése ismert tesztadatokkal.
- [ ] Prediction Lite: közelgő, aktuális és elmúlt tartomány kézi ellenőrzése ismert tesztadatokkal.

**Kapu:** nincs ismert P0/P1 adatvesztési, migrációs vagy sync hiba.

## E. Kiadási funkcióscope lezárása

A belső RC és a nyilvános kiadás külön kapu. A felhasználó döntése szerint nincs
automatikus első frissítésre halasztás. A régi terv és az elfogadott termékirány
eltéréseit az A23 pontban, tételes döntéssel kell lezárni.

- [x] Wake window teljes V1 scope: 7/14/30 nap, medián, tipikus tartomány, megfelelő minimum minta és alvássorrend szerinti bontás.
- [x] Rutinminták V1: tipikus esti elalvás, reggeli ébredés, ±30 perces konzisztencia és nappali alvásszám legalább 3 tiszta megfigyelt napból.
- [x] Hasonló napok V1: 7/14/30 napos saját, tiszta napok összevetése nappali alvásszám, addigi összalvás és aktuális ébrenléti idő alapján; legalább 3 összehasonlítható nap és legfeljebb 3 magyarázható találat.
- [x] Prediction Lite V1: az aktuális alvássorrend legalább 3 tiszta wake-window mintájából medián és interkvartilis tartomány; látható bizonytalanság, elmúlt tartomány jelzése és orvosi állítást kizáró szöveg.
- [ ] Részletes adatminőségi motor:
  - [x] hibás és jövőbeli időpontok;
  - [x] túl rövid, túl hosszú és beragadt aktív sessionök;
  - [x] duplikációgyanú és átfedés;
  - [x] problémás sessionök determinisztikus kizárása az Insightsból;
  - [x] sérült, konfliktusos és árva importadat részletes diagnosztikája;
  - [x] bizonyíthatóan azonos duplikátumok veszteségmentes javítása;
  - [x] konfliktusos rekordok blokkolása csendes adateldobás helyett;
  - [ ] opcionális, alkalmazáson belüli vezetett szerkesztő a blokkolt importokhoz.
- [ ] Végleges navigáció: `Alvások · Előzmények · Insights`.
- [x] Free / Family / Family+ csomaghatár rögzítése a `FEATURE_ENTITLEMENT_MATRIX.md` fájlban.
- [x] Internal Free / Family / Family+ nézetváltó és Family+ Insights-zárolási előnézet implementálása.
- [x] Az `a43d936` commit GitHub CI és internal preview buildje sikeres (2026-09-13).
- [x] A csomagnézet kártyazárolásának telefonos vizuális elfogadása a felhasználó visszajelzése alapján (2026-09-13; a telefonos build SHA nincs külön rögzítve).
- [x] Internal Free nézetben a Family Sync zárolási előnézete, Family-előfizetéses magyarázata és hálózati leállítása elkészült (helyi, még nem publikált módosítás).
- [x] A családtagság és a fizetős aktív szinkron szerveroldali szétválasztása staging `MANUAL` entitlement forrással.
- [ ] Apple és Google Play provider által hitelesített subscription események bekötése ugyanebbe az entitlement modellbe.
  - [x] Közös proof-only provider contract, állapotmátrix és célzott helyi tesztek.
  - [x] Apple/Google/Capacitor integrációs sorrend és kötelező tesztmátrix dokumentálása (`STORE_BILLING_INTEGRATION_PLAN.md`).
  - [x] Additív billing account-link és store-state D1 persistence helyben (`007_store_billing_state.sql`; távoli D1-en még nincs alkalmazva).
  - [x] Additív eseménysorrend-követés helyben (`008_billing_event_order.sql`; távoli D1-en még nincs alkalmazva).
  - [ ] Teljesen idempotens, időrendvédett snapshot-alkalmazás: a soros tesztek sikeresek, de A08–A10 auditjavítás szükséges a párhuzamosság, linked token és környezeti kerítés miatt.
  - [ ] StoreKit 2 adapter és App Store Server Notifications V2.
  - [ ] Play Billing 9.x adapter, acknowledgement és RTDN.
  - [ ] Vásárlás-visszaállítás és sandbox/closed-test elfogadás.
- [x] Letisztult alvásnapló-termékirány és havi Free / Family 990 Ft / Family+ 1 490 Ft terv rögzítése (`PRODUCT_DIRECTION.md`).
- [x] Bármely aktív tag Family+ joga az összes aktív családtagnak biztosítja az Insights funkciókat is; saját grant és családi effektív jog külön marad (helyi kód és automatizált tesztek, 2026-09-19).
- [x] A teljes családi Family+ Insights-jog staging buildjének kéttelefonos elfogadása: Family+ + Free, Free + Free pause, Free + Family és fordított fizetőjű Free + Family+ esetek sikeresek (2026-09-19, `da4fef4`).

**Nyilvános kiadási feltétel:** az elfogadott funkciómátrix és az A01–A27 kapuk
lezárása; mindkét store indulási feltétel. A korábbi minimum-scope javaslat nem
engedélyez automatikus halasztást. A meglévő Prediction kommunikációját is auditálni kell.

## F. Release engineering, privacy és support

- [x] Staging és production Cloudflare erőforrások egyértelmű szétválasztása.
- [ ] D1 backup és restore eljárás dokumentálása és kipróbálása stagingen.
- [ ] Worker és frontend rollback eljárás dokumentálása.
- [ ] Hibalog/crash reporting döntés.
- [ ] Privacy Policy elkészítése.
- [ ] Terms/EULA szükségességének eldöntése.
- [ ] Adatmegőrzés és törlés szabályainak dokumentálása.
- [ ] Gyermekhez kapcsolódó adatok adatvédelmi áttekintése.
- [ ] Support elérhetőség és hibabejelentési folyamat.

**Kapu:** van biztonságos migrációs, visszaállítási, adatkezelési és támogatási folyamat.

## G. Éles kiadás — csak külön jóváhagyással

- [ ] Release commit SHA véglegesítése és megjelölése.
- [ ] Távoli production D1 mentése. 2026-09-20-i ellenőrzött pillanatfelvétel elkészült; a tényleges migráció előtt friss export kötelező.
- [ ] `worker/migrations/002_children_v4.sql` alkalmazása production D1-en.
- [ ] Az aktuális production séma alapján az account/billing 003–007 szükséges migrációinak jóváhagyott sorrendje; előbb staging restore és kompatibilitási próba (A25).
- [ ] Worker deploy pontosan a release commitból.
- [ ] Production Worker smoke test.
- [ ] PR review és draft állapot megszüntetése.
- [ ] PR merge a `main` ágba.
- [ ] GitHub Pages production deploy ellenőrzése.
- [ ] Production smoke test: új telepítés, upgrade, start/stop, multi-child és Family Sync.
- [ ] Monitoring az első kiadási időszakban.
- [ ] Szükség esetén dokumentált rollback végrehajtása.

**Kiadási szabály:** production D1-migráció, Worker deploy, PR merge és Pages deploy előtt mindig külön, egyértelmű jóváhagyás szükséges.

---

## Következő konkrét munkamenet

**Elsőbbség:** az A03–A06 staging elfogadása, amikor rendelkezésre áll két
telefon. Az A13–A14 és A04–A06 commit/push kész. Az A07 helyi kiadási kapu
elő van készítve; következik a tulajdonosi commit/push, majd a tényleges éles
host/proxy/OAuth/Worker konfiguráció külön kiadási munkamenetben. A staging
kézi próbák továbbra is szükségesek.
A billing HTTP/adapterszelet előtt A08–A10 javítás kötelező. Az alábbi korábbi
tételek történeti és további release-feladatok.

1. Account- és entitlement-állapotmodell előkészítése: személyes funkciók és családi sync külön döntésként — elkészült.
2. Free családtag, fizető családtag, lejáró jogosultság, másik megmaradó fizető és reaktiválási egyeztetés tesztesetei — elkészültek.
3. Additív account/session D1 migration és Worker-adatelérési réteg lokális elkészítése — elkészült; a 003/004 staging D1 próba before/after exporttal, FK-ellenőrzéssel és változatlan legacy hash-ekkel sikeres (2026-09-14).
4. Mobil háttérbe küldés/visszatérés és teljes offline felhasználói próba az internal oldalon.
5. Staging D1 backup/restore próba és rollback dokumentáció.
6. A Cloudflare Pages preview hozzáférés-védelmének véglegesítése.
7. Google-tokenellenőrzés és account/session szolgáltatás az új adatelérési rétegen; refresh-rotáció, token-újrafelhasználás és visszavonás tesztjei — elkészültek, a Google OAuth client és a staging Worker beállítva; a same-origin proxy utáni login, lapbezárás/újranyitás, logout és két böngészős bejelentkezés sikeres. Az interaktív eszközcsere helyben elkészült; harmadik böngészős staging próba szükséges.
