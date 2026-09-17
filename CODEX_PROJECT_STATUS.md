# Solemi Sleep — Codex projektállapot

**Utolsó frissítés:** 2026-09-17
**Aktív fejlesztési ág:** `feat/child-profile-v4`
**Éles ág:** `main` (`a529a64`)
**Aktuálisan ellenőrzött fejlesztési HEAD:** `6ba91fa` (`Preserve failed sync operations and surface upload errors`); a munkamenet elején a munkafa tiszta volt. A tulajdonos az új hibajelzésből `SESSION_NOT_FOUND` választ jelzett. A hiányzó alvások alább dokumentált új helyi szelete még nincs commitolva.

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
- Family Sync már családi jogosultság. Az elfogadott új termékszabály szerint a Family+ Insights is az egész aktív családé; ez utóbbi kódátállítása még hátravan.

## Elfogadott termékirány — 2026-09-17

A döntések forrása: `PRODUCT_DIRECTION.md`; a korábbi auditok alternatív javaslatok, nem jóváhagyott csomagváltások. Megmarad a Free / Family / Family+ felosztás, havi 0 / 990 / 1 490 Ft tervezett árral. Alvásra összpontosító, gyors, sötét felületű napló; nincs teljes babakövető, AI, kéretlen altatási tanács vagy eredményígéret. A Family közös napló, a Family+ leíró statisztika és visszatekinthető jelentések.

Bármely aktív családtag érvényes előfizetése az egész aktív családnak biztosítja az adott csomagot, a létrehozó személyétől függetlenül. A számlázás továbbra is a vásárló accounté. A funkciómátrix aktualizálva; a személyes Insights-jogot családi jogra kell átállítani a szinkronhiba elfogadása után. App Store és Google Play induláskor szükséges; a vásárlási adapterek még hiányoznak.

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
- a Family+ Insights továbbra is csak a fizető account személyes joga;
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

## Fő nyitott blokkok a `main` migráció előtt

1. A kéttelefonos konfliktusteszt során jelzett duplikáció és eltérő előzmények kivizsgálása, javítása, majd staging elfogadása.
2. Az elfogadott teljes családi Family+ Insights-jog implementálása és tesztelése.
3. Az account/session eszközkezelő harmadik böngészős staging próbája.
4. App Store / Google Play vásárlás-ellenőrzés és visszaállítás provider adapterei.
5. Paywall és upgrade/downgrade folyamat.
6. Reprodukálható frontend- és Worker-lockfájlok.
7. Staging backup/restore és dokumentált rollback.
8. Privacy Policy, adatmegőrzés/törlés és support folyamat.
9. Production D1 mentés, V4 migráció, Worker deploy és csak ezután kontrollált `main` merge.

## Következő konkrét feladat

A `6ba91fa` hibajelzése feltárta a `SESSION_NOT_FOUND` elakadást. A fenti helyi
elkülönítési/javítási szeletet a tulajdonos commitolja/pusholja. Javasolt Summary:
`Isolate missing sleep operations and restore them explicitly`.
Az új internal buildben mindkét telefon SHA-jának ellenőrzése után először
a már elindított normál alvás megjelenését nézzük a másik telefonon. A régi
hiányzó alvást csak exportmentés és időpontellenőrzés után, az egyedi megosztási
gombbal osztjuk meg, ha a tulajdonos szeretné. Ha más hiba marad, leolvassuk
a panelt; nincs törlés vagy vak újrapárosítás. Utána a konfliktuskörök a
checkpoint szerint. Worker-kód/migráció nincs ehhez a szelethez, Codex nem
deployolt. Telefonos elfogadás után következő fejlesztés a Family+ Insights
teljes aktív családra kiterjesztése; előbb nem kezdünk vásárlási integrációt.

## Munkamegosztás

- **Codex:** architektúra, több fájlt/rendszert érintő fejlesztés, review és release-biztonság.
- **LOCAL AI DESK:** csak jól körülhatárolt, mechanikus részfeladatok; használata nem kötelező.
- **Felhasználó:** termékdöntések, telefonos vizuális teszt, commit és push a GitHub Desktopban, valamint éles műveletek jóváhagyása. Codex a helyi módosításokat és a javasolt commit Summary szöveget készíti el.

Minden érdemi commit után frissítsd ezt a fájlt, ha megváltozik az aktuális állapot, a következő feladat vagy valamelyik release-blokkoló.
