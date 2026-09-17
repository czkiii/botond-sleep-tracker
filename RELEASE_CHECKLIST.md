# Solemi Sleep — belső verziótól a kiadásig

Utolsó frissítés: 2026-09-17

Ez az operatív lista a `SOLEMI_EXECUTION_PLAN.md` és a `SOLEMI_MASTER_ROADMAP.md` kiadási pontjait rendezi végrehajtási sorrendbe.

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
- [ ] Az alvásszintű konfliktusészlelés és mindkét feloldás valódi kéttelefonos staging elfogadása.
- [x] Kliens–Worker helyi integrációs próba: két készülék offline ugyanazt az alvást szerkeszti, mindkét konfliktusválasztás után egy rekord és egyező adat marad.
- [x] Lassú/párhuzamos szinkronválaszok és saját feltöltés utáni téves konfliktus célzott regressziós tesztjei.
- [x] `SESSION_NOT_FOUND` helyi integrációs próbája: régi hiányzó alvás elkülönítése után a normál kétirányú szinkron folytatódik, a helyi sor/pending megmarad; egyedi, idempotens megosztás explicit választással.
- [ ] A telefonon jelzett 6 várakozó módosítás melletti normál Start és az opcionális hiányzóalvás-megosztás élő elfogadása az új internal buildben.
- [ ] A jelzett három előzménysor és eltérő telefonállapot újratesztje az új internal buildben (`SYNC_RETEST_CHECKPOINT_2026-09-17.md`).

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

Nem minden tervezett Insights-funkció szükséges az első belső RC-hez. Külön döntés kell arról, mi blokkolja a nyilvános kiadást.

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
- [x] Letisztult alvásnapló-termékirány és havi Free / Family 990 Ft / Family+ 1 490 Ft terv rögzítése (`PRODUCT_DIRECTION.md`).
- [ ] Bármely aktív tag Family+ joga az összes aktív családtagnak biztosítsa az Insights funkciókat is; a jelenlegi személyes gate átállítása még hátravan.

**Javasolt első kiadási minimum:** Child Profile V4 + stabil Family Sync + wake window V1 + átlátható adatminőség. Prediction csak akkor legyen blokkoló, ha megfelelő saját tesztadat és érthető bizonytalansági kommunikáció áll rendelkezésre.

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
- [ ] Távoli production D1 mentése.
- [ ] `worker/migrations/002_children_v4.sql` alkalmazása production D1-en.
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

**Elsőbbség:** a 2026-09-17-i helyi kliensjavítás commit/push utáni internal buildjének kéttelefonos elfogadása a `SYNC_RETEST_CHECKPOINT_2026-09-17.md` alapján. Utána teljes családi Family+ Insights-jog; az alábbi korábbi tételek történeti és további release-feladatok.

1. Account- és entitlement-állapotmodell előkészítése: személyes funkciók és családi sync külön döntésként — elkészült.
2. Free családtag, fizető családtag, lejáró jogosultság, másik megmaradó fizető és reaktiválási egyeztetés tesztesetei — elkészültek.
3. Additív account/session D1 migration és Worker-adatelérési réteg lokális elkészítése — elkészült; a 003/004 staging D1 próba before/after exporttal, FK-ellenőrzéssel és változatlan legacy hash-ekkel sikeres (2026-09-14).
4. Mobil háttérbe küldés/visszatérés és teljes offline felhasználói próba az internal oldalon.
5. Staging D1 backup/restore próba és rollback dokumentáció.
6. A Cloudflare Pages preview hozzáférés-védelmének véglegesítése.
7. Google-tokenellenőrzés és account/session szolgáltatás az új adatelérési rétegen; refresh-rotáció, token-újrafelhasználás és visszavonás tesztjei — elkészültek, a Google OAuth client és a staging Worker beállítva; a same-origin proxy utáni login, lapbezárás/újranyitás, logout és két böngészős bejelentkezés sikeres. Az interaktív eszközcsere helyben elkészült; harmadik böngészős staging próba szükséges.
