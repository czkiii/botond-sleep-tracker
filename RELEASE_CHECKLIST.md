# Solemi Sleep — belső verziótól a kiadásig

Utolsó frissítés: 2026-08-25

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
- [ ] A PR leírásának frissítése az Insights változással és az aktuális ellenőrzési eredményekkel.
- [ ] Eldönteni, hogy a Child Profile és az Insights ugyanabban a PR-ban marad-e. Javaslat: a release candidate-ig maradjon együtt, de új nagy Insights-funkció már külön PR-ba kerüljön.

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
- [ ] Preview szolgáltató és hozzáférési mód véglegesítése a tényleges bekötés előtt.
- [ ] A belső frontend környezet ne az éles Worker URL-jét használja.
- [ ] Staging Worker + staging D1 környezet létrehozása vagy a Family Sync ideiglenes kikapcsolása a frontend-only körben.
- [ ] A preview deploy workflow-t csak manuális indítással vagy kijelölt branchről engedélyezni.
- [ ] A preview oldalon láthatóan jelezni: `INTERNAL / TEST`.
- [ ] A pontos commit SHA megjelenítése vagy könnyű visszakereshetősége.
- [ ] Belső preview URL rögzítése ebben a dokumentumban.

**Kapu:** a feature ág egy ismert commitja külön URL-en megnyitható, az éles adatokat nem érinti.

## D. Belső működési teszt

### Alapfunkciók

- [ ] Új telepítés és első indítás.
- [ ] Alvás indítása, leállítása, manuális létrehozása és szerkesztése.
- [ ] Reload, háttérbe küldés és visszatérés után helyes állapot.
- [ ] Offline rögzítés és későbbi visszatérés online állapotba.
- [ ] Éjfél átlépő alvás.
- [ ] Időzóna- és DST-próba.

### Child Profile V4

- [ ] Régi V3 adatok automatikus V4 migrációja adatvesztés nélkül.
- [ ] Egygyerekes felület egyszerű marad.
- [ ] Több gyerek létrehozása és váltása.
- [ ] History, Sleeps és Insights együtt vált gyereket.
- [ ] Két gyereknek párhuzamos aktív alvása lehet.
- [ ] Profilkép eszközön marad és reload után megjelenik.
- [ ] Export/import nem keveri össze a gyerekeket.

### Family Sync staging környezetben

- [ ] Két készülék összekapcsolása meghívókóddal.
- [ ] Profil create/update megjelenik mindkét készüléken.
- [ ] Gyerekenkénti start/stop/edit/delete szinkronizálódik.
- [ ] Offline queue visszacsatlakozás után helyesen ürül.
- [ ] Dupla Start, dupla Stop és szerkesztési konfliktus teszt.
- [ ] Egy gyerek hibája nem módosítja a másik gyerek adatait.

### Insights és adatminőség

- [ ] Aktuális ébrenléti idő helyes.
- [ ] 14 napos jellemző wake window helyes mintákból számolódik.
- [ ] Kevés adatnál nincs túlzott bizonyosság.
- [ ] Átfedő és extrém session kimarad a számításból, és erről jelzés jelenik meg.
- [ ] HU / EN / DE szövegek és mobil layout ellenőrzése.

**Kapu:** nincs ismert P0/P1 adatvesztési, migrációs vagy sync hiba.

## E. Kiadási funkcióscope lezárása

Nem minden tervezett Insights-funkció szükséges az első belső RC-hez. Külön döntés kell arról, mi blokkolja a nyilvános kiadást.

- [x] Wake window teljes V1 scope: 7/14/30 nap, medián, tipikus tartomány, megfelelő minimum minta és alvássorrend szerinti bontás.
- [x] Rutinminták V1: tipikus esti elalvás, reggeli ébredés, ±30 perces konzisztencia és nappali alvásszám legalább 3 tiszta megfigyelt napból.
- [ ] Hasonló napok V1 vagy későbbi kiadásra halasztás.
- [ ] Prediction Lite V1 vagy későbbi kiadásra halasztás.
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

1. GitHub CI és automatizált Insights-tesztek.
2. Ugyanebből a repóból épülő belső preview bekötése.
3. Staging Worker/D1 vagy frontend-only tesztmód bekötése.
4. Belső preview deploy.
5. A D szakasz tesztmátrixának végigjárása.
