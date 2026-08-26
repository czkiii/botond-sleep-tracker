# Solemi Sleep — belső verziótól a kiadásig

Utolsó frissítés: 2026-08-26

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

### Insights és adatminőség

- [x] Aktuális ébrenléti idő helyes.
- [x] 14 napos jellemző wake window helyes mintákból számolódik.
- [x] Kevés adatnál nincs túlzott bizonyosság.
- [x] Átfedő és extrém session kimarad a számításból, és erről jelzés jelenik meg.
- [ ] HU / EN / DE szövegek és mobil layout ellenőrzése.
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
- [ ] Free / Family csomaghatár rögzítése legalább a kiadott funkciókra.

**Javasolt első kiadási minimum:** Child Profile V4 + stabil Family Sync + wake window V1 + átlátható adatminőség. Prediction csak akkor legyen blokkoló, ha megfelelő saját tesztadat és érthető bizonytalansági kommunikáció áll rendelkezésre.

## F. Release engineering, privacy és support

- [ ] Staging és production Cloudflare erőforrások egyértelmű szétválasztása.
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

1. Mobil háttérbe küldés/visszatérés és teljes offline felhasználói próba az internal oldalon.
2. HU / EN / DE mobil layout gyors ellenőrzése.
3. Prediction Lite állapotainak kézi ellenőrzése ismert tesztadatokkal.
4. Staging D1 backup/restore próba és rollback dokumentáció.
5. A Cloudflare Pages preview hozzáférés-védelmének véglegesítése.
