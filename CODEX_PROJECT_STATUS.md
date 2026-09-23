# Solemi Sleep — Codex projektállapot

**Utolsó frissítés:** 2026-09-23
**Aktív fejlesztési ág:** `feat/child-profile-v4`
**Éles ág:** `main` (`a529a64`)
**Teljes audit alapja:** `e9374f4` (`Add verified store billing foundation`); az akkori helyi origin-refhez képest 0 ahead / 0 behind.
**Ellenőrzött HEAD:** `03190aa` a `feat/child-profile-v4` ágon; a 2026-09-23-i teszt előtt a munkafa tiszta volt. A két Google-fiókos Chrome+Edge staging próba igazolta a családi alvás indításának, leállításának és törlésének szinkronját, továbbá a helyi törlés elkülönített hatását és az eszköz újracsatlakozását. Az A03 teljes elfogadása továbbra is nyitott.

## Legfrissebb checkpoint — A03–A06 staging elfogadás, A07 helyi előkészítés

**Elsőként olvasandó kiegészítés:** [OWNER_DECISIONS_REVIEW_2026-09-20.md](OWNER_DECISIONS_REVIEW_2026-09-20.md), benne az öt eredeti tulajdonosi TXT linkje, auditkapcsolatok és az A03 folytatási sorrendje. Az új termékdöntések felülírják az eltérő korábbi terveket; a műszaki auditkapuk megmaradnak.

- A03 helyi implementáció elkészült: import/restore előnézet és visszaállítási pont; külön helyi törlés; külön, csak admin által indítható és szerveroldalon is ellenőrzött családi törlés; export és családnév-megerősítés.
- A helyi törlés egy atomi helyi írással leválasztja az eszközt és törli a naplót, cloud törlést nem képez. A családi törlés D1 batchben tombstone-olja a közös gyermek- és alvásadatokat, majd üres kezdőprofilt hoz létre. Törlés után rejtett safety backup nem marad; import/restore előtt igen.
- Az A03 commit/push megtörtént. A `6675fe2` Worker- és Pages-buildje sikeres; a régi smoke szkript revízió nélküli módosításai miatt bukott, amit a `c9d5af9` javított. A frissített smoke helyben a staging Worker ellen minden ponton átment.
- **A03 még nem lezárt:** a kéttelefonos import/törlés/offline/pending/restore elfogadás folyamatban van. Éles környezet nem változott.
- **2026-09-23, részleges kétböngészős staging elfogadás:** Edge-ben az admin és Chrome-ban a második családtag ugyanazt a Boti-profilt és 1799 alvást látta. Külön néven mindkét böngészőből export készült. Az alvás indítása, leállítása és törlése mindkét oldalon szinkronizált. Chrome-ban a helyi törlés után üres, leválasztott napló látszott, Edge-ben a családi 1799 alvás változatlan maradt. Chrome-ban az eszköz újracsatlakoztatása visszahozta Botit és az 1799 alvást; az átmeneti Névtelen profil eltűnt. A régi Edge-export importelőnézete változatlan naplón 0 eltérést, majd egy új tesztalvás után pontosan 1 törlést jelzett. A családi import után mindkét böngésző 1799 alvást mutatott; az Edge-en előtte készült 1800-as visszaállítási ponttal mindkét oldalon újra 1800 lett. A tesztalvás végső törlése után mindkét böngésző visszaállt 1799-re. A családi törlés előnézete helyesen 1799 alvás és Boti törlését, egy új kezdőprofil létrehozását, minden eszközre kiterjedő hatást, külön exportot és pontos családnév-megerősítést mutatott; a tagi Chrome-ban nem volt családi törlés gomb. A tényleges családi törlés még nyitott. A Chrome-ban őrzött 0 alvásos automatikus visszaállítási pontot nem szabad a családi naplóra alkalmazni.
- **2026-09-23, Chrome DevTools offline próba:** a Chrome-lap önálló Offline módjában egy helyi tesztalvás 1800-ra növelte a Chrome naplóját, míg az online Edge 1799-en maradt. Az offline családi importot az app „internetkapcsolat szükséges; a napló nem változott” üzenettel megállította. A Chrome hálózatának visszaállítása után a függő módosítás feltöltődött, mindkét böngésző 1800-at és friss szinkront mutatott; a tesztalvás törlése után mindkettő ismét 1799-et. Az offline tiltás és queue-flush elfogadva, de a külön, **online és még pending** állapotban végzett import-/törlésgát tesztje nyitott.
- A meglévő offline queue regressziót kiegészítettük azzal, hogy ugyanaz a családi adatcsere-védelem offline állapotban `offline`, a hálózat visszatérése után, de még ki nem ürült outbox mellett `pending`, sikeres flush után pedig `ready` állapotot ad. A célzott 29/29 teszt és a frontend typecheck sikeres; a külön online-pending **kézi** próba még nincs rögzítve.
- **A13–A14 commit/push kész:** a `c5ccd23` tartalmazza az aktív alvás jegyzetének/típusának atomi indítását és az utolsó gyermek párhuzamos törlésének védelmét. Staging telefonos regresszió még nincs rögzítve.
- **A04 commit/push kész (`3114711`):** az eszközleválasztás és az account-szintű családi kilépés külön művelet. Függő módosítás, konfliktus, sérült sync-állapot vagy offline helyzet nem dobható el csendben; sikertelen szerveres leválasztás megtartja a kapcsolatot. A leválasztott eszköz újratöltéskor nem csatlakozik vissza automatikusan, de külön gombbal újracsatlakoztatható.
- Account-kilépéskor minden account-owned legacy családi eszköz visszavonódik, a membership history `LEFT` állapotban megmarad, és a helyi napló a telefonon marad. Admin előbb választhat utódot; választás nélkül a legrégebbi aktív tag kapja az adminjogot. Az utolsó tag csak a külön családmegszüntetési folyamaton távozhat. Az utolsó fizető kilépése a syncet szünetelteti, az adatot nem törli.
- A nyers Family Sync hozzáférés már aktív membershipet is követel, ezért a kilépett account régi device-tokenje nem fér hozzá a családi adathoz.
- **A05 commit/push kész (`3665d25`):** a vendégmód és minden Solemi-account külön helyi napló- és Family Sync munkaterületet kap. Kijelentkezéskor a napló megtartható elkülönítve vagy csak az adott telefonról törölhető; másik account nem látja. A vendégnapló első belépéskor csak kifejezett választással kerül az accounthoz. A pending outbox, safety backup, leválasztási marker és utolsó sync időpont ugyanazzal a munkaterülettel mozog.
- A fiókváltás kis helyreállítási journalt használ; félbeszakadt váltás újraindításkor befejezhető, quota hiba pedig nem írja felül a látható naplót. A workspace-váltás csak a többtabos írózár megszerzése után indul. A függő családi módosítás kijelentkezéskor nem vész el, hanem a saját account munkaterületében marad.
- **A06 commit/push kész (`eac16ef`):** aktív entitlement enforcement mellett minden családi naplóolvasás és -írás egyidejűleg követel account sessiont, az accounthoz és családhoz rendelt device-tokent, aktív membershipet és családi `FAMILY_SYNC` jogosultságot. A régi `/v1/families` és `/v1/join` útvonal enforcement mellett nem használható; az új család fizető accountból, atomi `/v1/auth/family/create` művelettel jön létre. A meghívók létrehozása is ugyanazon jogosultsági kapun halad át.
- A meglévő legacy családok adatai változatlanok és egyszer továbbra is account alá igényelhetők. Az igényléshez nem kell előre adatot migrálni vagy törölni, de a régi token önmagában már nem ad naplóhozzáférést. Enforcement nélkül a régi kliensútvonalak a fokozatos production átállás idejére változatlanok maradnak.
- Ellenőrzés: frontend és Worker typecheck; teljes **26 fájl / 226 teszt**; production és auth-enabled internal build sikeres. Az atomi fizetős családlétrehozás, a kliens hitelesített útvonalválasztása, Free elutasítás mellékhatás nélkül, raw-token tiltás, jogosult account-hozzáférés és legacy claim regresszióval fedett. A bundle méretére Vite figyelmeztet, buildhiba nincs.
- V1: Google + Apple belépés, Family PDF; nincs push/emlékeztető vagy életkori normaösszehasonlítás. Egyetlen 7 napos trial választható Family/Family+ csomagra; havi és éves ajánlat.
- Accounttörlés/recovery/retention specifikáció megérkezett, nem elkészült funkció. A privacy dokumentum még kiadás előtti tervezet.
- `solemi-sleep.app` domain megvásárolva a tulajdonos közlése alapján; bekötés, e-mail, OAuth/origin és adatmigráció még nincs igazolva.
- **A07 helyi előkészítés:** a publikus, belépés nélküli frontend Free nézetből indul és nem indít fizetős szinkront. A release build kifejezett account-auth, éles HTTPS Worker és first-party Cloudflare Pages proxy beállítást követel; a jelenlegi GitHub Pages workflow e kapun megáll. Az internal proxy staginget csak az internal hoston használhatja, más host éles upstream nélkül 503-at kap. A production Worker konfiguráció hiányos vagy tesztmódú beállítás esetén `RELEASE_NOT_CONFIGURED` hibával áll meg. Az éles domain/proxy, OAuth origin, titkok, D1 migráció és kézi iOS-próba még hiányzik, így A07 nincs lezárva.
- **A07 helyi ellenőrzés:** frontend és Worker typecheck, 27 fájl / 232 teszt sikeres; a tényleges kiadási és kéttelefonos próbák még nyitottak.
- **A08 helyi javítás:** az eseményazonosító ütközése atomi batch-rollbacket okoz, azonos ellenőrzési időnél a REVOKED állapot elsőbbséget kap, és ugyanaz a token késői ACTIVE eseménnyel nem aktiválható újra. Az új `008_billing_event_order.sql` csak additív, helyben tesztelt séma; távoli D1-en nem futott. A párhuzamos első vásárlás, eltérő payload-hash, régi replay és jogosultság-visszavonás regressziói átmentek. A tényleges Apple/Google provider-állapotverzió és párhuzamos hálózati verify/webhook/restore elfogadása még hiányzik, ezért A08 nyitott.
- **A07–A08 commit/push:** `e725278` commit a feature ágon; a távoli staging eredményt és az éles konfigurációt nem igazoltuk, production művelet nem történt.
- **A09 helyi javítás:** a Google Play új tokenje által hivatkozott régi token grantjait ugyanabban a D1 batchben visszavonja. A `009_google_token_replacements.sql` additív tombstone táblája a még nem ismert régi token késői restore-ját is kizárja. A régi token tulajdonosa, környezete és account-aliasza ellenőrzött; eltérő account vagy másik új token ütközése nem kaphat jogot. Plus→Family, Family→Plus→Family, késői restore, ismeretlen régi token és rollback célzott próbája sikeres. A 009 migráció távoli D1-en nem futott, a valódi Google API adapter/RTDN és két store elfogadás továbbra is nyitott.
- **A09 ellenőrzés és commit:** frontend és Worker typecheck; 27 fájl / 244 teszt sikeres, benne a régi restore és új token párhuzamosságával. A tulajdonos `8cbebb4` commitja és pushja megtörtént; production adatbázis-módosítás nem történt.
- **Smoke-felülvizsgálat (2026-09-22):** az `8cbebb4` commitnál a staging Worker/Pages és CI ellenőrzések sikeresek, de a régi smoke ellenőrzés bukott. Oka: a szkript továbbra is névtelen `POST /v1/families` hívással kezdett, amelyet az A06 szerveroldali jogosultsági védelem helyesen `ACCOUNT_REQUIRED` hibával tilt. Az új smoke csak a staging health/CORS és a névtelen útvonalak tiltását ellenőrzi; helyben élő staging ellen átment. Nem teszteli a két hitelesített account közti tényleges szinkront: az külön staging elfogadási kapu marad. A smoke-javítás még nincs commitolva/pusholva.
- **A10 helyi szelet:** a store persistence szolgáltatás kötelező, szerver által kiválasztott `SANDBOX` vagy `PRODUCTION` környezetet kap; eltérő verified snapshotot elutasít, és meglévő provider-azonosító környezete nem írható át. A tényleges Apple/Google adapter-, csomagazonosító-, külön D1- és store sandbox/production elfogadás nyitott, tehát A10 nem lezárt.
- **Friss ellenőrzés:** frontend és Worker typecheck; teljes 27 fájl / 246 teszt sikeres; a módosított smoke élő staging Worker ellen átment. Éles deploy, main merge és production D1-módosítás nem történt.
- **A18 helyi javítás (2026-09-22):** a Pages proxy engedélyezett account- és családi naplóútvonalakat, valamint öt szükséges HTTP metódust továbbít. Idegen `Origin`, `cross-site`/`same-site` Fetch Metadata és Origin nélküli módosító kérés még a továbbítás előtt 403-at kap; csak a hitelesítéshez és szinkronhoz szükséges fejlécek jutnak a Workerhez. A kezdeti auth-only szűkítés staging regresszióját az alábbi checkpoint rögzíti; az A18 kiadási kapu nem lezárt.
- **A19 helyi részeredmény:** a Worker és a Pages account-proxy JSON-kérését egyaránt 64 KiB-re korlátoztuk; a Worker streamet olvas, így a hiányzó vagy hamis `Content-Length` sem kerüli meg a korlátot. Túlméretes kérés 413-at ad a feldolgozás/továbbítás előtt. Célzott Worker- és proxyregresszió készült. Rate limit, nagy bootstrap, headerek, CSP, függőség- és üzemeltetési ellenőrzés továbbra is nyitott.
- **A18–A19 helyi ellenőrzés:** frontend és Worker typecheck, 27 fájl / 254 teszt, frontend build és Pages Functions build sikeres. Az A18 staging böngészős próba továbbra is szükséges.
- **A18 staging regresszió és helyi korrekció:** a `d81a942` internal mobilpróbában a Google-belépés működött, de a `/api/v1/auth/`-ra szűkített proxy 404-gyel blokkolta a hitelesített családi `/v1/sync`, `/v1/invites` és naplómutációs kéréseket. A felhasználó telefonján a böngészési adatok törlése után üres helyi napló jelent meg; a felesége telefonján az adatok megmaradtak. A proxy engedélyezett családi útvonalai helyben helyreállítva, az Origin/Fetch Metadata és body-határ megtartásával; minden használt családi útvonalra proxyteszt készült. A teljes 27 fájl / 267 teszt, frontend typecheck és Pages Functions build sikeres. A staging visszaállítás és kéttelefonos újrapróba még szükséges. Nem történt szerveroldali családi törlés vagy production művelet.
- **Induláskori Family+ jogosultság helyi javítása (`1b59031` után):** a `FamilySyncLayer` az oldal újranyitásakor korábban csak az `ACCOUNT_STATE_EVENT`-re várta a szerveres hozzáférést. A fiók-visszaállítás eseménye a réteg mountja előtt is megtörténhetett, ekkor a jogosultság `null` maradt, és a felület tévesen előfizetési paywallt mutatott. Most mountkor is lekéri a már visszaállított fiókot, majd a staging tesztcsomagot, a szerveres jogosultságot és a meglévő családot egyezteti. Ellenőrzés közben frissítési, hiba esetén újrapróbálási állapot látszik; a fizetős szöveg Family és Family+ csomagot is megnevez. Frontend typecheck, 27 fájl / 267 teszt és build sikeres; staging mobilpróba szükséges.

### Production V3 adatok mentése és V4 migrációs próba

Részletes jegyzőkönyv: [PRODUCTION_V4_MIGRATION_READINESS_2026-09-20.md](PRODUCTION_V4_MIGRATION_READINESS_2026-09-20.md).

- Az `Opoczki-Klima` production család csak olvasási ellenőrzése megtörtént: revision 263, 102 aktív és 8 törölt alvás az export előtt és után is.
- A teljes production D1 SQL-export és a család Solemi V4 JSON-mentése a Gitből kizárt `.private-backups/production/` mappában van, SHA-256 értékük rögzítve.
- Az offline V3→V4 próba minden 113 adatbázis-szintű alvást értékazonosan vitt át; védett legacy táblák változatlanok, idegenkulcshiba 0. A családi JSON-t az app saját importálója elfogadta.
- A production adatbázis továbbra is V3 és változatlan. V4 Worker/main kiadás előtt friss export, kontrollált `002` migráció és ugyanabban az ablakban Worker-váltás kell; régi Worker és V4 DB együtt nem írható biztonságosan.

## Legfrissebb ellenőrzés — teljes kiadás előtti audit

**Elsőként olvasandó:** [FULL_RELEASE_AUDIT_2026-09-20.md](FULL_RELEASE_AUDIT_2026-09-20.md).
A jelentés A01–A27 pontja és a `RELEASE_CHECKLIST.md` új auditkapuja felülírja
az alábbi történeti következő-feladat javaslatokat. A termékirány/csomagok változatlanok.

- A02 után 198/198 teszt és frontend/Worker typecheck sikeres; production és
  auth-enabled internal helyi build sikeres.
- 14/14 külön auditpróba lefutott: 13 jelenlegi hibás vagy korlátozandó
  viselkedést igazoló próba, 1 teljesítménymérés. Ezek nem kijavított hibák.
- Bizonyított problémák többek között: sérült napló felülírása, többlapos
  adatvesztés, megmaradó tagság kilépés után, legacy entitlement-kivétel,
  billing eseményverseny/linked-token/környezeti kerítés, aktív alvás mezőinek
  kihagyása, utolsó gyermek párhuzamos törlése, proxy-origin átírás.
- A korábbi billing „idempotens/időrendvédett” állítás csak az akkori soros
  tesztesetekre igazolt. A08–A10 javítása nélkül ne kerüljön vásárlási HTTP API mögé.
- A működő staging alapfolyamat nem jelent production/store kiadási készültséget.
  Nincs automatikusan első frissítésre halasztott tétel.
- Bizonyíték és reprodukció: `audit/2026-09-20/README.md`. A `.ts.txt` próbaarchívum
  nem a normál tesztcsomag része; a hibás eredményt rögzíti, nem regressziós elvárás.

### Family+ számítási audit — 2026-09-20 kiegészítés

A teljes auditot a tulajdonos commitolta: `3a0a687`. A statisztikai kiegészítés
ezen a HEAD-en, az `e9374f4` óta változatlan alkalmazáskódon készült.
Jelentés: [FAMILY_PLUS_STATISTICS_AUDIT_2026-09-20.md](FAMILY_PLUS_STATISTICS_AUDIT_2026-09-20.md).

- Mind a hét Family+ kártya képlete, időszaka, mintája és megjelenítése átvizsgálva.
- 50 kapcsolódó meglévő teszt + 22 auditpróba = **72/72 sikeres**. Az auditpróbák
  7 kontrollt és 15 jelenlegi eltérést/értelmezési korlátot igazolnak, nem javítások.
- S01–S15: megszakított éjszakák ébredése/esti ablaka, eltérő havi nevező,
  aktív alvás és elavult becslés, hiányos napló, óraidő-medián, időszak,
  adatminőség, mintaszám/felirat és időzóna. Az A27 alatt külön kiadási kapu.
- A korábbi 5 perces alvás → heti 0 perc magyarázata javítva: 5/7 perc
  lefelé kerekítése, nem a rekord kiszűrése. A tényleges minimum 2 perc.
- A próbák `audit/2026-09-20/family-plus-statistics.probe.ts.txt` néven archiválva;
  nem részei a normál tesztcsomagnak. Csak dokumentáció és bizonyíték változott.
- Javítás, commit/push, deploy és adatbázis-módosítás nem történt.

**A01–A02 elkészült. Az A03–A06 staging elfogadása folyamatban; az A13–A14 és
A04–A06 commit/push kész. Az A07 kiadási konfiguráció helyi védelme elkészült,
de a production infrastruktúra nincs beállítva.** Következő kapu: az A07 helyi
commit/push és a staging ellenőrzés, majd a kéttelefonos elfogadás, amikor
rendelkezésre állnak a készülékek. Éles lépések külön engedéllyel.
Éles lépések külön engedéllyel.

### A02 lezárás — többlapos és atomi helyi mentés

- A napló és a Family Sync pending sor ugyanabban a `solemiSleep:v4` tárolási
  envelope-ban, egyetlen atomi helyi írással változik; a régi külön eseményes
  mentési út kikerült a produkciós folyamatból.
- Quota vagy más íráshiba sem a naplót, sem az outboxot nem fogadja el félig. Az
  app visszatölti az utolsó biztos állapotot, blokkolja a további szerkesztést,
  újrapróbálást és JSON-exportot kínál.
- Sérült szinkronállapot nem válik csendben üres sorrá; a napló megmarad, a mentés
  láthatóan leáll, és a felület figyelmeztet az oldaladatok megőrzésére.
- Web Locks alapján egy böngészőprofilon belül egyszerre egy Solemi lap írhat.
  A második lap csak tájékoztat, majd az első bezárásakor újratöltött állapottal
  automatikusan átveszi az írójogot.
- Helyi kétlapos böngészőpróba: első lap alvást indított, második lap zárolt maradt;
  az első bezárása után a második ugyanazt az aktív alvást mutatta és lezárta.
- Ellenőrzés: frontend és Worker typecheck; teljes **23 fájl / 198 teszt**;
  production és auth-enabled internal build; diff whitespace-ellenőrzés sikeres.
- Távoli környezet, adatbázis és production nem változott.

### A01 lezárás — sérült helyi napló védelme

- A betöltés megkülönbözteti a hiányzó, érvényes, migrált és helyreállítást
  igénylő tárolót; sérült V4 esetén nem esik vissza régebbi V3 adatra.
- Hibás JSON, szerkezetileg hibás V4/V3, blokkolt tárhely és sikertelen V3→V4
  írás esetén az eredeti tartalom változatlan, az automatikus mentés leáll.
- A szerverről érkező adatírás sem kerülheti meg a védelmet; a Family Sync
  helyreállításig nem indul el.
- A helyreállító képernyőn az eredeti sérült adat letölthető, ellenőrzött Solemi
  backup importálható, vagy külön figyelmeztetés után üres napló indítható.
- HU/EN/DE szövegek és mobilbarát sötét felület elkészült.
- Ellenőrzés: frontend és Worker typecheck; teljes **23 fájl / 195 teszt**;
  production és auth-enabled internal build. Az új tárolási csomag 19 tesztje
  a sérülési és helyreállítási ágakat is fedi. Diff whitespace-ellenőrzés sikeres.
- Távoli környezet, adatbázis és production nem változott.

Ez a fájl az új Codex-beszélgetések rövid belépési pontja. A pillanatnyi pontos commit mindig az a commit, amely ezt a fájlt tartalmazza; ellenőrzéshez futtasd a `git log -1 --oneline` parancsot.

## Új Codex-beszélgetés indítása

Elsőként:

1. olvasd el ezt a fájlt;
2. olvasd el a `RELEASE_CHECKLIST.md` és `FEATURE_ENTITLEMENT_MATRIX.md` fájlt;
3. ellenőrizd a branchet, a HEAD commitot és a munkafa állapotát;
4. ne módosíts production Cloudflare-erőforrást, D1-adatbázist vagy `main` ágat külön felhasználói jóváhagyás nélkül.

## Környezetek

- **Production frontend:** `main` ágból épülő GitHub Pages.
- **Internal frontend:** <https://solemi-sleep-internal.pages.dev>, a feature ág külön Cloudflare Pages buildje.
- **Internal Family Sync:** külön staging Worker és staging D1; az internal frontend csak explicit staging API URL-lel engedélyezi.
- **Production Worker/D1:** az éles migrációig változatlan.

## Elkészült alapok

- Child Profile V4 és több gyermek külön alvásadatai.
- V3 → V4 helyi adat- és backupmigráció.
- Többgyermekes Family Sync és staging ellenőrzések.
- Wake Window, rutinminták, hasonló napok, Prediction Lite, alvásfejlődés, változásfigyelés és havi riport számítások.
- HU / EN / DE lokalizáció.
- Free / Family / Family+ funkciómátrix lezárva.
- Free fiók nélkül, local-first módon használható.
- Family Sync és Family+ Insights effektív hozzáférése is az egész aktív család érvényes grantjaiból számolódik; a kétaccountos staging elfogadás sikeres.

## Elfogadott termékirány — 2026-09-17

A döntések forrása: `PRODUCT_DIRECTION.md`; a korábbi auditok alternatív javaslatok, nem jóváhagyott csomagváltások. Megmarad a Free / Family / Family+ felosztás, havi 0 / 990 / 1 490 Ft tervezett árral. Alvásra összpontosító, gyors, sötét felületű napló; nincs teljes babakövető, AI, kéretlen altatási tanács vagy eredményígéret. A Family közös napló, a Family+ leíró statisztika és visszatekinthető jelentések.

Bármely aktív családtag érvényes előfizetése az egész aktív családnak biztosítja az adott csomagot, a létrehozó személyétől függetlenül. A számlázás továbbra is a vásárló accounté. A helyi Worker és kliens már ezt a szabályt követi; App Store és Google Play induláskor szükséges, a vásárlási adapterek még hiányoznak.

Az alábbi korábbi fejlesztési szeletek történeti ellenőrzési eredmények; az aktuális helyi ellenőrzés és következő feladat a fájl végén található.

## Aktuális fejlesztési csomag

- Új `src/entitlements.ts` tartalmazza a csomagok alapvető kliensoldali döntéseit.
- Új tesztek ellenőrzik a Free, Family és Family+ határokat.
- Az internal build Statisztika oldalán Free / Family / Family+ nézet kapcsolható.
- Free és Family nézetben az alap statisztika látható, a hét Family+ Insights-kártya zárolt állapotot mutat.
- A kapcsoló csak internal buildben jelenik meg, és nem kerül az alvásadatokba vagy az exportba.
- Production buildben a jelenlegi Insights-megjelenés egyelőre változatlan.
- Ez még **nem valódi szerveres entitlement, account, paywall vagy vásárlás**.

## Ellenőrzési állapot

Az előző távoli commiton, a fejlesztő Windows/Node 22 környezetben:

- frontend typecheck: sikeres;
- tesztek: 67/67 sikeres;
- frontend build: sikeres;
- Worker typecheck: sikeres.

Az aktuális csomagon Codex-környezetben:

- frontend typecheck: sikeres;
- új entitlement tesztek: 4/4 sikeres;
- diff whitespace-ellenőrzés: sikeres;
- a teljes Vitest/PWA build lezárását a környezet Node/proxy hibája akadályozta.

Az `a43d936` commit GitHub `CI` (#75) és `Build internal preview` (#42) futása sikeres; ezt 2026-09-13-án a GitHub API alapján ellenőriztük.

A felhasználó 2026-09-13-án telefonon ellenőrizte az internal csomagnézetet, és visszaigazolta, hogy a kártyák zárolása megfelelő. A telefonon megnyitott build SHA-ját külön nem rögzítettük.

**Feltárt eltérés:** a jelenlegi prototípusban az új család létrehozása rögtön szinkronkapcsolatot és adatfeltöltést indít, szerveroldali account/entitlement-ellenőrzés nélkül. A célmodellben a családlétrehozás/tagság és a fizetős aktív szinkron külön döntés; Free tag is szinkronizálhat, ha van aktív Family/Family+ jogosultságú tag. Ez a már nyitott account/entitlement implementáció része.

Az internal tesztkapcsoló a `676f4f6` commitban már a Family Sync előnézetét is vezérli: Free nézetben zárolt kártyát és Family-előfizetéses magyarázatot mutat, nem engedi a család létrehozását/csatlakoztatását, és nem futtat hálózati szinkront; Family és Family+ nézetben elérhető. A HU / EN / DE szöveg ennek megfelelő. Ez még nem valódi szerveres entitlement.

Az `abfb2aa` commitban elkészült a tisztán tesztelhető account–membership–entitlement állapotmodell. Külön kezeli a személyes feature-jogosultságot és a család aktív szinkronját, valamint a `SIGNED_OUT`, `NO_ACTIVE_MEMBERSHIP`, `PAUSED`, `RECONCILIATION_REQUIRED` és `ACTIVE` állapotokat. Az `activeFeatures` már ellenőrzött jogosultságokat vár; a lejárat és a hitelesség ellenőrzése még a későbbi szerverréteg feladata.

Az előző, már commitolt helyi fejlesztési szelet:

- `worker/migrations/003_accounts_and_sessions.sql`: négy additív identity tábla; két aktív eszköz korlátja INSERT/UPDATE esetén; session és eszköz accountazonosságának adatbázis-ellenőrzése.
- `worker/src/accountStore.ts`: Google issuer+subject alapú lookup, atomi account/identity létrehozás, eszközregisztráció/listázás, session létrehozás/ellenőrzés, atomi eszköz/session-visszavonás.
- 13 új helyi SQLite-teszt: legacy adatok és séma megőrzése, eszközlimit, session-tulajdonos, lejárat, visszavonás, hibás tranzakció visszaállítása.
- Frontend és Worker typecheck sikeres; teljes tesztcsomag: 92/92. A tesztadapter valódi SQLite-on futtatja a SQL-t; távoli D1/runtime próba még hátravan.
- A modul nincs bekötve a Worker-végpontokba. Nincs Google-belépés, refresh-rotáció vagy szerveres entitlement enforcement. Távoli erőforrás nem módosult.

Az aktuális, még nem commitolt Google-auth fejlesztési szelet:

- Google ID token ellenőrzése forgó JWKS-kulcsokkal: RS256 aláírás, issuer, audience, `azp`, `exp`, `iat`, egyszer használható nonce és hitelesített e-mail.
- Account auth HTTP-végpontok, ötperces access token, 30 napos forgatott refresh token HttpOnly sütiben, logout és régi refresh token újrafelhasználásakor eszközszintű session-visszavonás.
- Két aktív eszköz határa; a harmadik eszköz nem dob ki automatikusan korábbi eszközt. Az interaktív eszközválasztó UI még nincs kész.
- Internal, feature flag mögötti HU/EN/DE Solemi-fiók kártya és Google Identity Services popup kliens.
- Teljes ellenőrzés: frontend és Worker typecheck, production és auth-funkcióval bekapcsolt internal frontend build, Worker dry-run bundle, 111/111 teszt.

Staging D1 próba 2026-09-14-én:

- migráció előtti export és helyi restore sikeres;
- a 003 és 004 additív migráció sikeresen lefutott kizárólag `solemi-sleep-db-staging` adatbázison;
- migráció utáni export és restore sikeres, `PRAGMA foreign_key_check` tiszta;
- mind a hat legacy tábla teljes tartalmi hash-e változatlan (10 family, 20 legacy device, 11 invite, 22 child, 180 sleep session, 254 operation);
- az új identity/auth táblák üresek; legacy claim nem történt;
- staging `AUTH_SECRET` létrejött. Production D1/Worker nem módosult.

A Google OAuth Web client létrejött, a publikus client ID bekerült a staging konfigurációba, és az auth-verzió `6d8e2f50-4927-438d-ae65-6450c7e366a4` verzióazonosítóval kikerült kizárólag a staging Workerre. Az élő health/challenge/CORS ellenőrzés és a teljes legacy Family Sync staging smoke teszt sikeres.

A `60d90f7` internal Pages buildben a felhasználó sikeresen belépett Google-fiókkal; a staging D1-ben egy aktív account, Google identity, eszköz és session jött létre. A lap teljes bezárása és újranyitása után a session nem állt vissza, mert a böngésző blokkolta a `pages.dev` → `workers.dev` cross-site refresh sütit. A `9508809` javítás egy `functions/api/[[path]].ts` Pages Function proxyn keresztül az internal oldal saját eredetére hozta az account API-t, és a sütit `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` értékre szűkítette. Az új deploy után a lapbezárás/újranyitás és a logout felhasználói próbája sikeres; a D1 két aktív account-eszközt, egy aktív és két visszavont sessiont mutatott. A teljes 113/113 teszt, a frontend typecheck/build, a Pages Functions build és a helyi Pages→staging challenge próba sikeres.

A második böngészőben a Google-belépés önmagában nem vitte át az alvásadatokat. A Free előzmény továbbra is local-first, viszont ugyanannak az accountnak az aktív családi tagságát a saját második eszközén meghívókód nélkül vissza kell kapnia. A `6433608` commit HU/EN/DE szövege ezt hétköznapi nyelven jelzi, a látható „Family Sync” elnevezést pedig „Családi megosztás” megfelelőkre cseréli.

A `6433608` kliensfelülete a harmadik account-eszköznél felsorolja a két aktív régi eszközt. A felhasználó kiválaszthatja a lecserélendőt, majd új Google-belépéssel bizonyítja az account tulajdonjogát; a backend a kijelölt eszköz sessionjeit atomikusan vonja vissza az új eszköz regisztrálásakor.

Az aktuális, még nem commitolt account–legacy family bridge szelet:

- az `005_family_memberships.sql` két additív átmeneti kapcsolótáblát hoz létre a meglévő Family Sync adatok módosítása nélkül;
- a már családhoz kapcsolt böngésző érvényes legacy eszközkulccsal és bejelentkezett accounttal claimeli a családot;
- ugyanannak az accountnak a második eszköze meghívókód nélkül új családi eszközkulcsot kap és lehúzza a családi adatokat;
- másik account nem claimelheti a már tulajdonossal rendelkező családot; számára a későbbi accountos meghívóbeváltás szükséges;
- a bridge kizárólag a staging Worker konfigurációjában engedélyezett, productionben nincs bekapcsolva;
- teljes helyi tesztcsomag: 115/115; frontend és Worker typecheck, internal build és Worker dry-run sikeres;
- a staging migráció before/after exporttal, változatlan legacy hash-ekkel és tiszta idegenkulcs-ellenőrzéssel sikeres;
- staging Worker verzió: `3a1853ad-02c5-4ee3-b06e-b1371b095d94`; a teljes legacy staging smoke teszt sikeres.

A bridge a `807081f` commitban felkerült az internal Pages oldalra. A valós kétböngészős próba igazolta az account-eszköz választót és a családi adatok meghívókód nélküli átvitelét ugyanazzal a Google-fiókkal. Feltárt klienshiba: a friss Chrome automatikusan létrehozott, névtelen kezdőprofilja a családi profil mellett megmaradt.

A `fee7a64` javítás a teljesen érintetlen, névtelen és alvásadat nélküli kezdőprofilt eltávolítja, amikor valódi családi profil érkezik. A már hibásan a családi profil mellett maradt üres kezdőprofilt a következő családi frissítés is kitakarítja. Elnevezett, kitöltött vagy alvásadattal rendelkező helyi profilt továbbra is megőriz.

A `807081f` GitHub frontend checkjeinek hibája külön CI-konfigurációs probléma volt: a gyökérből futó Vitest a Worker teszteket is betöltötte, de a frontend job nem telepítette a Worker `jose` függőségét. A `fee7a64` CI és internal preview workflow ezt külön telepíti; mindkét GitHub frontend check és build sikeres.

A Cloudflare Git-integráció `Workers Builds: solemi-sleep-sync-staging` hibáját a dashboard build-konfigurációjának javítása lezárta: root directory `/worker`, build command üres, deploy command `npm run deploy:staging`, production branch `feat/child-profile-v4`. A `fee7a64` újrafuttatott Workers Builds checkje sikeres; a commit minden ellenőrzése zöld.

Az aktuális, még nem commitolt accountos meghívóbeváltási szelet:

- az internal accountos környezetben a meghívókódot csak bejelentkezett Google-account válthatja be;
- a család létrehozójának előbb claimelnie kell a családot; a meghívott külön account `MEMBER` tagságot és saját családi eszközkulcsot kap;
- a meghívókód egyszer használható, és másik account már meglévő aktív családtagsága blokkolja a csatlakozást;
- a HU / EN / DE súgószöveg kimondja, hogy a másik családtag a saját Google-fiókjával lépjen be;
- account-eszköz cseréjekor a lecserélt böngésző legacy családi kulcsa is visszavonódik;
- teljes helyi tesztcsomag: 120/120; frontend és Worker typecheck, internal build és Worker dry-run sikeres;
- staging Worker verzió: `7835a861-a785-4c69-9c4d-5810352f1778`; a teljes legacy staging smoke teszt sikeres.

A felhasználó és a felesége két külön Google-fiókkal sikeresen végigtesztelte az
accountos meghívást és a kétirányú Family Syncet. A próba feltárta, hogy a régi
internal csomagkapcsoló a Free családtag saját böngészőjében leállította a
szinkront akkor is, amikor egy másik aktív tag Family+ nézetben volt.

A `9e5a381` commit szerveroldali entitlement szelete:

- a `006_subscriptions_and_entitlements.sql` providerfüggetlen `subscriptions`,
  `subscription_events` és `account_entitlements` táblákat hoz létre Apple,
  Google Play, Stripe és staging `MANUAL` forrás támogatásával;
- a Worker a Family Syncet a család összes aktív tagjának érvényes grantjai
  alapján engedélyezi, ezért Family/Family+ fizető + Free tag esetén mindketten
  szinkronizálhatnak;
- a `9e5a381` commit akkori állapotában a Family+ Insights még csak a fizető account személyes joga volt; ezt a későbbi `da4fef4` családi effektív jogosultságra váltotta;
- claimelt család raw sync kérése account sessiont és az adott account-eszközhöz
  rendelt családi kulcsot is igényel; kijelentkezett vagy eltérő account tiltott;
- pause esetén a kliens nem törli a helyi pending módosításokat, és 15 másodpercenként,
  illetve fókuszba visszatéréskor észleli egy másik családtag reaktiválását;
- a `MANUAL` csomagváltás kizárólag stagingben engedélyezett; production
  konfigurációhoz és adatbázishoz nem nyúltunk;
- teljes helyi ellenőrzés: frontend és Worker typecheck, 123/123 teszt, internal
  build és Worker dry-run sikeres;
- a 006 staging D1 migráció teljes before/after exporttal, változatlan legacy
  hash-ekkel és tiszta FK-ellenőrzéssel sikeres;
- staging Worker verzió: `4ff4309f-537d-43e5-8a39-d64de6a83b0a`; a teljes
  legacy staging smoke teszt sikeres.

A felhasználó 2026-09-15-én két valódi Google-accounttal elfogadta a staging
entitlement folyamatot. Family+ + Free mellett a kétirányú sync működött. Free +
Free alatt két helyi módosítás várakozott; amikor a másik account Family+ lett,
a család legfeljebb a 15 másodperces újraellenőrzés után reaktiválódott, és a
várakozó módosítások szinkronizálódtak. Kijelentkezés, minden helyi appadat
törlése és ismételt Google-belépés után a családi profilok és alvásadatok
visszatöltődtek. A személyes adat nélküli staging D1 összesítés egy aktív és egy
lejárt teszt-előfizetést, valamint egy aktív sync-jogosultságú accountos családot
mutatott. Adatvesztést nem tapasztaltunk.

Az aktuális, még nem commitolt reconciliation szelet minden kliensművelethez
rögzíti a legutóbb látott szerverrevisiont. A staging Worker az alvás lezárása,
szerkesztése és törlése előtt összeveti ezt az adott alvás aktuális
revisionjével. Ha ugyanazt az alvást közben másik eszköz módosította,
`SYNC_CONFLICT` választ és a szerver változatát adja vissza; eltérő alvás
módosítása továbbra is automatikusan felmehet. Az ellenőrzés és az írás D1
batchen belül is feltételes, ezért két közel egyszerre érkező mentés sem tudja
észrevétlenül felülírni egymást vagy hibásan előreléptetni a family revisiont.

A kliens konfliktusnál megtartja a helyi pending műveletet, nem húzza rá a
szerver változatát, és a Családi megosztás panelen explicit választást kér:
az ezen a telefonon lévő vagy a családi változat maradjon. A helyi változat
választásakor a kliens csak a megismert friss szerverrevisionnel próbálkozik
újra; a családi változat választásakor az adott alvás helyi pending műveleteit
eldobja és a szerverpéldányt alkalmazza. HU / EN / DE szöveg elkészült.

Teljes helyi ellenőrzés: frontend és Worker typecheck, 127/127 teszt, internal
frontend build és staging Worker dry-run sikeres. Új D1-migráció nincs. A
staging deploy a commit/push utáni azonos verziójú Pages- és Worker-buildre vár.

## Nyitott hiba — kéttelefonos konfliktusteszt, 2026-09-15

**Nem elfogadott; a következő kódolási feladat elsőbbséget élvez.** A felhasználó
beszámolója szerint a Family+ telefon előzményeiben az eredeti alvás, a saját
módosított időpontja és a másik telefon módosított időpontja külön bejegyzésként
jelent meg. A másik telefonon csak a saját módosítása látszott. A pontos okot
még nem vizsgáltuk; nem bizonyított, hogy azonos session ID-k duplikálódtak,
új azonosítók keletkeztek, vagy a megjelenítés/összefésülés hibás. A két telefon
pontos buildverzióját és a konfliktusválasztó megjelenését is ellenőrizni kell.

Folytatás: helyi és szerveroldali sessionazonosítók, pending műveletek és
időrendi lefutás összevetése; reprodukció; célzott regressziós teszt; csak ezután
javítás és kéttelefonos újrateszt. A meglévő tesztadatokat ne töröljük a diagnózis
előtt. A 127 sikeres automatizált teszt nem helyettesíti ezt az elbukott élő próbát.

A 2026-09-16-i audit elkészült: `MONETIZATION_AUDIT_2026-09-16.md` és
`PRODUCT_STRATEGY_AUDIT_2026-09-16.md`. A 2026-09-17-i beszélgetés megtartotta
a három csomagot és elfogadta a teljes családi prémiumhozzáférést; a hatályos
döntések a `PRODUCT_DIRECTION.md` fájlban vannak.

## Helyi szinkronjavítás — 2026-09-17

Reprodukált, célzott teszttel ellenőrzött klienshibák javítva:

- Az egyidejű feltöltés/letöltés/konfliktusfeloldás most sorban fut; ugyanaz a pending művelet nem indul kétszer ugyanazon az oldalon.
- Lassú feltöltési válasz nem írja rá a régebbi értéket az azóta helyben szerkesztett alvásra/profilra.
- Letöltés közben érkező helyi módosítás megmarad; a letöltési cursor sem lép előre az el nem fogadott snapshot alapján.
- Korábbi családi kapcsolat későn befutó válaszát a kliens elutasítja.
- A szerveradat az alkalmazás állapotát helyben frissíti; a rutin szinkron és konfliktusfeloldás nem tölti újra az oldalt. A nyitott szerkesztő megtartja a beírt, még el nem mentett értéket.
- A szerkesztő megjegyzi a megnyitáskor ismert revisiont; a háttérben frissült szerveradatot egy régi űrlap mentése sem írhatja felül csendben.
- A kliens alvásonként megjegyzi saját sikeresen feltöltött revisionjét, a globális letöltési cursort nem lépteti át más telefon változásain. Így a következő saját korrekció nem okoz téves önütközést.
- Párhuzamos Start elutasításakor a kliens átveszi az aktuális családi alvást, a visszautasított draft későbbi pending módosításait is eltávolítja.

Új tesztek: 6 kliens-egységteszt és 5 integrációs teszt a tényleges klienssel,
tényleges Workerrel és memóriabeli SQLite-tal. Két független készülékállapot
offline szerkesztése, mindkét konfliktusválasztás, azonos session ID és egyetlen
szerverrekord, régi űrlap, párhuzamos Start és saját feltöltés utáni korrekció
ellenőrizve. Több külön böngészőlap közötti zárolást ez a javítás nem vezet be.

Végső helyi ellenőrzés: **138/138 teszt**, frontend és Worker typecheck,
production és auth-enabled internal build sikeres. A build meglévő 500 kB-os
chunkméret-figyelmeztetése megmaradt. Helyi böngészőben a nyitott űrlap értéke
távoli frissítéskor megmaradt, mentése konfliktust adott; a javított gyors
Start → visszaállítás → Stop folyamat téves konfliktus nélkül ment végig,
és reload után egy új bejegyzés maradt a korábbi tesztsor mellett.

**Az eredeti három bejegyzés pontos oka továbbra sem bizonyított.** Azonos időpont
alapján nem deduplikálunk, meglévő családi adatot nem töröltünk. A telefonos
elfogadás továbbra is release-blokkoló. Részletes következő próba:
`SYNC_RETEST_CHECKPOINT_2026-09-17.md`.

Csak helyi munka történt: nincs commit/push, deploy vagy távoli D1-módosítás;
nincs új séma/migráció és nincs Worker-forrásváltozás. A kliens új sync-metadata
mezője hiányzó régi értékekből biztonságosan indul; régi konfliktusok explicit
feloldása továbbra is szükséges lehet.

## Élő Start-elakadás és helyi hibajelzés — 2026-09-17

A `bbac40b` élő próbáján az indított alvás nem jelent meg a másik telefonon.
A tulajdonos Family+ nézetet jelzett; a fotón `bbac40b`, Opo család, 6 várakozó
módosítás és „Adatok frissítése…” látszik, konfliktus nem látható ezen a képen.
A feleség Free nézetben „szinkron most” állapotot jelzett. A megnyitott családi
panel és a fogadó készülék buildazonosítója még egyeztetésre vár.

A kódvizsgálat és két előbb elbukó reprodukáló teszt igazolta: feltöltési 500-as
hiba után a kliens sikert jelző visszatérést adott, 401-es hibánál pedig kivette
a nem nyugtázott műveletet a sorból. **Ez nem bizonyítja a 6 várakozó tétel okát.**
A staging élő napló olvasása sikerült, a megfigyelési időben nem érkezett esemény;
ebből nem következtetünk a szerver egészségére vagy a telefon kérésének okára.
A naplókövetés leállítva. Távoli írás/deploy nem történt.

Új helyi kliensszelet: a nem nyugtázott feltöltési hibák megőrzik a pending
műveletet és felszínre kerülnek; a családi panel belső buildben biztonságos
hibakódot mutat (nincs token vagy személyes adat). Várakozó művelet/konfliktus
mellett nem frissül az utolsó sikeres szinkron időpontja. Az account- és sync
kérés, a JSON-válasz beolvasásával együtt, 15 másodperces határt kap; beragadt
kérés után a sor folytatható azonos operation ID-val. Nincs automatikus
eldobás vagy korábbi sorok adatjavítása. Permanens hibánál a sor megállhat és
diagnózist igényel; nem írjuk át vakon a visszautasított műveletet.

Ellenőrzés: **145/145 helyi teszt**, frontend typecheck, production és
auth-enabled internal helyi build sikeres. 7 új teszt ellenőrzi a hiba
megőrzését/jelzését, az azonos művelet biztonságos újrapróbálását, a beragadt
feltöltés utáni sorfolytatást, a request/body időkorlátot és a nem JSON választ.
A Worker forrása és sémája ebben a szeletben nem változott. Élő elfogadás nyitott.

## SESSION_NOT_FOUND — hiányzó alvás elkülönítése, 2026-09-17

A tulajdonos az új internal hibajelzésből ezt olvasta le:
„Nem sikerült frissíteni a családi adatokat. · SESSION_NOT_FOUND”. Ez azt
igazolja, hogy egy pending művelet a család szerveroldali naplójából hiányzó
alvásra hivatkozik. Az érintett ID/kérés törzse még nem ismert; az eredeti
duplikáció és a rekord hiányának történeti oka továbbra sem bizonyított.
Lehetséges előzmény a családhoz csatlakozás előtt megmaradt helyi sor vagy
korábban elvesztett létrehozási művelet; ezeket nem kezeljük tényként.

Helyi reprodukció igazolta a FIFO elakadást: régi hiányzó alvásra mutató PATCH
feltartotta az utána sorba állított új Startot és a másik telefon letöltését.
Új kliensjavítás megőrzi a hibás műveleteket és helyi alvást `missingSessions`
állapotban, és az érintett alváson kívül folytatja a feltöltést/letöltést.
A panel HU/EN/DE szöveggel, gyermekkel, időponttal és jegyzettel bemutatja az
érintett sort; elsőbbsége van a régi meghívókód nézetével szemben. Több elemnél
a panel görgethető. Nem állítjuk sikeresnek a teljes szinkront, amíg van
ellenőrizendő alvás.

A felhasználó külön `Ezt az alvást is megosztom` választására a kliens csak
az adott helyi alvás aktuális értékeit osztja meg az eredeti session ID-val.
A korábbi pending műveleteit csak a helyettesítő mentés szerveres nyugtája
után veszi ki. Aktív alvás jegyzete/típusfelülírása is megmarad. Elveszett
válasz után ugyanaz a persisted operation ID és body próbálható újra.
Elutasított helyreállítás megőrzi a sorát, de nem állítja le a többi alvást.
Más családhoz tartozó ID-t nem írunk át; nem készítünk helyette új azonosítót.
Szerveres tombstone nem válik hiányzó rekorddá vagy automatikus visszaállítássá.
Helyreállítás közbeni másik telefonos változás a meglévő explicit
helyi/családi konfliktusválasztást igényli. Ha a felhasználó később maga törli
a helyi hiányzó sort, a szerveren is igazolt hiány lezárja a törlését; ez nem
automatikus adatjavítás. Helyben sem elérhető alvást nem állítunk vissza.

Új ellenőrzés: **154/154 helyi teszt**, frontend typecheck, production és
auth-enabled internal helyi build sikeres. 9 új tényleges kliens–Worker–SQLite
integrációs teszt: hiányzó sor melletti kétirányú működés, lezárt/aktív
helyreállítás, elveszett válasz idempotens újrapróbálása, idegen családi ID,
tombstone, explicit későbbi törlés és helyreállítás közbeni mindkét
konfliktusválasztás. Böngészőben a hiányzó sor jelzése, a megosztási gomb,
a siker utáni megszűnő jelzés és egyetlen bejegyzéssel megmaradó reload
ellenőrizve, kizárólag eldobható helyi SQLite és tesztadat használatával.

Nincs Worker-forrás/sémaváltozás, távoli D1-írás, deploy, commit vagy push.
Az eredeti telefonos teszt továbbra is nyitott; az új kliens élő elfogadásra vár.

## Telefonos visszajelzés — normál szinkron működik, 2026-09-17

A tulajdonos: „Most szuper a szinkron és nagyon jó a visszajelzés is szerintem”.
A normál szinkron működését és a jelzés érthetőségét felhasználói visszajelzés
alapján elfogadottnak rögzítjük. A pontos Start/−5/Stop/reload lépések eredményét
nem részletezte. A repository HEAD `dec9987`; az új fotón a buildbanner/SHA nem
látható, így a két telefon futó SHA-jának azonosságát ebből nem igazoltuk.

A fotón a kéttelefonos ütközés választója és egy korábbi hiányzó helyi alvás
együtt látszott. A tulajdonos később a **családi változat megtartását** választotta,
majd a korábban csak nála meglevő alvást is megosztotta. Visszajelzése:
„most full jó a szinkron és minden egyezik”. A családi feloldási ág és az
egyedi hiányzóalvás-megosztás élőben elfogadva, egyező készülékadatokkal.
A pontos darabszámot és a reload utáni eredményt nem részletezte külön.
A tulajdonos ezután az **ezen a telefonon lévő változat megtartása** próbát
pontos lépéssorral végigvégezte, és visszajelezte: „Ahogy írtad úgy történt
tökéletesen működött a teszt”. Ugyanazon lezárt alvás két nyitott szerkesztője,
eltérő A/B jegyzet, második mentéskor explicit konfliktus, B helyi választása,
mindkét készüléken egy sor és B jegyzet, majd frissítés utáni egyezés elfogadva.
**A kéttelefonos szinkron-/konfliktus-regressziós kör lezárva**, mindkét
választási ággal és egyedi hiányzóalvás-megosztással. Az eredeti három régi
rekord pontos történeti oka nem bizonyított, azokat nem deduplikáltuk automatikusan.
Ebben a körben nincs alkalmazáskód-módosítás vagy új teszt/build/deploy.

### Teljes családi Family+ hozzáférés — stagingben elfogadva, 2026-09-19

A Worker `/v1/auth/access` válasza külön adja vissza a bejelentkezett account
saját grantjait (`accountFeatures`), az aktív családból származó feature-öket
(`familyFeatures`) és a kettő uniójaként használható effektív `features` listát.
Csak aktív tagságú, nem visszavont és időben érvényes grant számít. A
létrehozó/admin szerep nem feltétel. A kliens az effektív
`FAMILY_PLUS_INSIGHTS` jogból nyitja vagy zárja az elemzési kártyákat, és a
15 másodperces hozzáférés-frissítés ugyanazt az állapotot továbbítja az appnak.
A Google-sessiont az app induláskor helyreállítja; a párhuzamos helyreállítás
egy közös kérést használ.

Automatizált esetek: Family+ + Free megosztott Insights; kilépett vagy másik
családhoz tartozó fizető figyelmen kívül hagyása; megmaradó Family esetén sync
és PDF marad, Plus lezár; másik megmaradó Plus esetén Plus marad; utolsó
fizető megszűnésekor sync pause. A frontend és Worker typecheck sikeres, mind a
156 teszt átment, a production build sikeres. A build csak a korábban ismert
500 kB feletti chunk-figyelmeztetést adta. D1-sémamódosítás nem kellett.

A `da4fef4` commit automatikus internal Pages buildje és staging Worker buildje
sikeres. Az internal oldal mind a kanonikus, mind a commit-deployment URL-en a
`da4fef4` buildet szolgálta ki; a staging Worker health ellenőrzése 200-as
választ adott. Staging Worker verzió:
`a79b69b7-ee17-40eb-8c46-02254cea3464`.

A tulajdonos és a felesége két külön Google-accounttal, két telefonon elfogadta
az alábbi mátrixot:

- tulajdonos Family+ + másik tag Free: sync aktív, Insights mindkét telefonon nyitott;
- Free + Free: Insights mindkét telefonon zárt, sync szünetel, adatok megmaradnak;
- tulajdonos Free + másik tag Family: sync mindkét telefonon újracsatlakozás nélkül aktív, Insights zárt;
- tulajdonos Free + másik tag Family+: sync aktív és Insights mindkét telefonon nyitott.

Az utolsó eset igazolja, hogy a család létrehozója/adminja és a fizető személye
nem feltétel; a legmagasabb aktív családi csomag érvényesül. A 15 másodperces
hozzáférés-frissítés és a downgrade/pause viselkedés is élőben elfogadva.
Production erőforrás nem módosult.

### Store billing contract és persistence — helyben elkészült, 2026-09-19

A `worker/src/billingContract.ts` egységes Apple/Google szerződést vezet be:
provider és környezet, Family/Family+ termék, normalizált subscription státusz,
ellenőrzött store snapshot, eseményforrás és adapter interfész. A vásárlási
kérés proof-only: Apple esetén aláírt tranzakciót, Google Play esetén purchase
tokent fogad. A kliens által küldött account, csomag, fizetett állapot, státusz
vagy lejárat hibát ad, ezért ezekből nem keletkezhet jogosultság.

A közös termék-feature térképet a belső `MANUAL` tesztcsomag is használja.
Próbaidő, aktív, türelmi idő és a periódus végéig még érvényes lemondás adhat
hozzáférést; `PAST_DUE`, lejárt és visszavont állapot nem. Apple account linkhez
UUID, Google Playhez személyes adatot nem tartalmazó base64url alias szükséges.

A `007_store_billing_state.sql` additív migráció külön account-link és store
subscription state táblát ad a meglévő `006` adatai mellé. A
`StoreBillingService` aktív accounthoz stabil aliast készít, ellenőrzi a store
account-kapcsolatot és a subscription tulajdonosát, majd egy D1 batchben írja a
subscriptiont, provider state-et, eseményt és grantokat. Azonos esemény
idempotens; eltérő payload ugyanazzal az event ID-val hibás; régebbi provider
snapshot nem írhat felül frissebbet. Downgrade eltávolítja a Plus grantot,
refund/revoke minden subscription grantot azonnal visszavon. A Google purchase
acknowledgement külön `PENDING`/`ACKNOWLEDGED` állapotban követhető.

A `STORE_BILLING_INTEGRATION_PLAN.md` rögzíti a D1 persistence, idempotens
snapshot-alkalmazás, StoreKit 2, Play Billing 9.x, notification, restore,
Capacitor mobilhéj és sandbox elfogadás sorrendjét. A contract és persistence
célzott 29 tesztje és a teljes **185/185** helyi teszt sikeres; frontend és
Worker typecheck, valamint a diff whitespace-ellenőrzés is sikeres. Nem történt
távoli D1-módosítás, deploy, store-fiókbeállítás, commit vagy push.

## Fő nyitott blokkok a `main` migráció előtt

**2026-09-20 kiegészítés:** az alábbi korábbi lista nem teljes; az A01–A27
auditkapu az irányadó, különösen az adatmegőrzési és hozzáférési hibák miatt.

1. App Store / Google Play vásárlás-ellenőrzés és visszaállítás provider adapterei.
2. Paywall és upgrade/downgrade folyamat.
3. Az account/session eszközkezelő harmadik böngészős staging próbája.
4. Reprodukálható frontend- és Worker-lockfájlok.
5. Staging backup/restore és dokumentált rollback.
6. Privacy Policy, adatmegőrzés/törlés és support folyamat.
7. Production D1 mentés, V4 migráció, Worker deploy és csak ezután kontrollált `main` merge.

## Következő konkrét feladat

Az A03 tényleges családi törlését kis, elkülönített staging családon vagy ellenőrzött
szerveres restore mellett kell kipróbálni. A jelenlegi 1799 alvásos család exportjának
visszatöltése nem egy atomi szerveres rollback: a kliens külön sync műveleteket képez
a bejegyzésekhez, ezért az export önmagában nem elég garancia egy teljes törléses
próbához. A Cloudflare D1 Time Travel elvileg szerveres visszaállítási út, de a
2026-09-23-i olvasási staging D1-info próba lejárt/érvénytelen Wrangler OAuth-token
miatt `Authentication error [code: 10000]` hibát kapott; a konkrét staging DB
visszaállítási képessége nincs igazolva. Következő kapu: az A03 tényleges családi
törlés elkülönített staging próbája, ehhez a staging D1 hitelesítés és igazolt
rollback szükséges. A külön online-pending kézi gát és az A04–A06 kétfiókos
staging elfogadása szintén nyitott.
A valódi éles host, Worker, OAuth és cookie-környezet kialakításához külön
kiadási döntés és kézi iOS-próba kell.

A billing HTTP-bekötés előtt az A08–A10 még nyitott adapteres és környezeti
feltételeit teljesíteni kell. A `007`–`009` távoli staging migrációk előtt
export/restore és ellenőrzött munkamenet szükséges. Éles művelet külön
jóváhagyással; commit/push a tulajdonos feladata.

## Munkamegosztás

- **Codex:** architektúra, több fájlt/rendszert érintő fejlesztés, review és release-biztonság.
- **LOCAL AI DESK:** csak jól körülhatárolt, mechanikus részfeladatok; használata nem kötelező.
- **Felhasználó:** termékdöntések, telefonos vizuális teszt, commit és push a GitHub Desktopban, valamint éles műveletek jóváhagyása. Codex a helyi módosításokat és a javasolt commit Summary szöveget készíti el.

Minden érdemi commit után frissítsd ezt a fájlt, ha megváltozik az aktuális állapot, a következő feladat vagy valamelyik release-blokkoló.
