# Solemi Sleep — teljes kiadás előtti audit

**Dátum:** 2026-09-19–20. **Vizsgált commit:** `e9374f4` — `Add verified store billing foundation`.
**Ág:** `feat/child-profile-v4`. Az audit kezdetén tiszta munkafa; a folytatáskor
csak az audit ideiglenes próbafájlja volt új. Ez a jelentés alkalmazáskód-javítást
nem tartalmaz. Commit/push a tulajdonos feladata.

## Döntés

**A jelenlegi verzió működő, értékes belső teszttermék, de nyilvános, fizetős
App Store / Google Play kiadásra még nem kész.** Nem a termékötletet vagy a
Free / Family / Family+ felosztást kell újrakezdeni. A kiadásig adatbiztonsági,
hozzáférési és fizetési hibákat kell lezárni, majd a hiányzó áruházi és
üzemeltetési folyamatokat végigvinni.

A sikeres korábbi kéttelefonos tesztek érvényesek a kipróbált helyzetekre.
Nem bizonyítják a kilépés, több böngészőlap, fiókváltás, sérült tárhely vagy
bolti visszatérítés helyességét. **A korábbi „idempotens, időrendvédett billing”
megfogalmazást szűkíteni kell:** a soros tesztek átmentek, de az audit egyidejű
eseménykezelési és csere-előfizetési hibákat igazolt. A fizetési réteg még
nincs publikus HTTP-vásárlásként bekötve, így ezek nem bizonyított élő fizetési
visszaélések; a bekötés előtt javítandó hibák.

**Semmit nem soroltunk automatikusan az első frissítésre.** Minden alábbi
azonosítónak kiadás előtt javítással, bizonyító ellenőrzéssel vagy a tulajdonos
kifejezett, dokumentált termékdöntésével kell lezárulnia. Ismert adatvesztést,
hozzáférési hibát vagy kötelező áruházi hiányt nem helyettesít egy elfogadó pipa.

## Módszer, bizonyíték és korlát

**Family+ kiegészítés, 2026-09-20:** a `3a0a687` dokumentációs commit után,
változatlan alkalmazáskódon elkészült a
[részletes statisztikai audit](FAMILY_PLUS_STATISTICS_AUDIT_2026-09-20.md).
Az A27 alatt kapcsolt S01–S15 tételek a hét kártya számításait vizsgálják.
Külön 22 auditpróba és a kapcsolódó 50 meglévő teszt sikeres; a próbák között
hibareprodukciók is vannak, ez nem jelenti a számítási hibák javítását.

Áttekintett területek: termékdöntések és funkciómátrix; React felület és
HU/EN/DE szövegek; helyi tárolás/import/export/fotó; szinkron és konfliktusok;
Google-account/session; családi tagság és entitlement; billing contract,
persistence, migrációk; PWA/build/CI; áruházi, adatvédelmi és üzemeltetési kapuk.

- Meglévő **185/185 teszt**, frontend és Worker típusellenőrzés sikeres.
- **14/14 célzott auditpróba**: 13 viselkedési reprodukció, 1 teljesítménymérés.
  Ezek a rossz jelenlegi eredményt igazoló próbák, nem 14 kijavított hiba.
- Production és auth-enabled internal helyi build sikeres.
- Helyi böngészős alvásindítás, korrekció, újratöltés, lezárás, előzmény,
  statisztika és profilszerkesztő ellenőrzése; 390 × 844 méretű vizuális minta.
- Aktuális Apple/Google szabályokhoz hivatalos dokumentációt használtunk.

Részletes futási eredmények és megismételhető próbák:
[audit/2026-09-20/README.md](audit/2026-09-20/README.md).

**Nem állítjuk ellenőrzöttnek:** élő Cloudflare dashboard/secret/WAF-beállítások,
aktuális production DB-tartalom, távoli rollback/restore, natív iOS/Android
build és vásárlás, teljes VoiceOver/TalkBack/kontrasztmátrix, valós telefonos
terhelés, független penetrációs teszt vagy jogi megfelelőségi tanúsítás. Friss
dependency-advisory vizsgálat sem készült; lockfile nélkül nincs rögzített
kiadási függőségfa. Ezek a jelentésben nyitott kapuk, nem feltételezett sikerek.
Nem történt távoli adatírás, deploy vagy main merge.

Bizonyosság: **R** = helyben reprodukált; **K** = forrásból közvetlenül igazolt;
**V** = kockázat, célzott további próba szükséges; **H** = hiányzó kiadási elem.
**P1** = kiadást blokkoló vagy elsőként javítandó; **P2** = szintén kiadás előtt
lezárandó, a P1 munkák után. Nem azonos a kihasználhatóság/CVSS minősítésével.

## Ami megtartandó és már értéket ad

- A főképernyő nagy gombja, sötét megjelenése, utólagos 5/10/15 perces
  korrekciója pontosan támogatja az „előbb a gyermek” termékirányt.
- Free fiók nélkül is használható; több gyermek, javítható előzmények,
  JSON-mentés és importdiagnosztika létezik.
- A saját adatokból számolt elemzések külön modulokban vannak, vannak
  minimum mintaszámok, adatminőségi jelzések és időhatár/DST tesztek.
- A szinkron műveletazonosítókat, várakozási sort és explicit konfliktusfeloldást
  használ. A korábbi kéttelefonos, offline és hiányzórekord-tesztek érdemiek.
- A családi effektív jog már bármely aktív fizetőt figyelembe vesz. A Free +
  Family/Family+ és az utolsó fizető megszűnésének alapmátrixa tesztelt.
- A Google-token szerveres ellenőrzése, nonce, rövid access token, refresh
  rotáció és eszközlimit már létező védelem. A billing klienskérés nem fogad
  szabadon bemondott csomagot vagy lejáratot.
- Staging és production D1 külön van konfigurálva. A migrációk és a helyi
  SQLite-integrációs tesztek jó alapot adnak a további munkához.

Nem indokolt teljes újraírás vagy további babagondozási funkciók hozzáadása.

## Funkció- és termékígéret-leltár

| Terület | Jelenlegi állapot | Kiadásig szükséges |
|---|---|---|
| Alvás start/stop, kézi javítás, több gyermek | Megvan; alapfolyamat működik | A01–A05, A13–A15 adatbiztonság |
| Alapstatisztika, nap/hét/hónap/egyedi nézet | Megvan | A21 egységes számlálási szabály és magyarázat |
| Family közös napló | Stagingben kipróbált | A04–A07, A15–A16, A25 |
| Family+ elemzések, fejlődés, havi jelentés | Számítás és megjelenítés megvan | A27/S01–S15 számítási audit; valódi entitlement, offline viselkedés, minőség/teljesítmény |
| Fizetős hozzáférés az egész aktív családnak | MANUAL staging-forrással működik | Tagsági életciklus + valódi store-forrás |
| Vásárlás, visszaállítás, lemondáskezelés | Contract/persistence alap; end-to-end nincs | A08–A12 |
| Paywall, bolti árak, éves opció, 7 nap trial | Terv; a belső csomagváltó nem paywall | Valódi bolti termékek, trial jogosultság, megújulási tájékoztatás |
| PDF export | Feature-kulcs/terv; JSON export nem PDF | Megvalósítás és Family-jog teszt, vagy explicit termékdöntés |
| Fix/adaptív emlékeztető | Nincs ilyen ütemezett értesítési megoldás | Régi mátrix lezárása; a 12h képernyős jelzés nem push |
| Életkorhoz viszonyított wake window | Régi mátrixban szerepel; nincs kész összevetés | Termékirány-konfliktus eldöntése, nem automatikus fejlesztés |
| 30 nap validált offline jogcache | A mátrix megengedi; nincs implementálva | Fizető offline hozzáférésének konkrét szabálya |
| Automatikus biztonsági mentés első cloud-bootstrap előtt | Mátrixban ígért, tartósan nem igazolt | A03/A25 lezárás |
| Insights / Overview / Trends / Patterns navigáció | Régi terv; jelenleg Statisztika + hosszú kártyasor | Dokumentáció/UI egyeztetése, nem kötelező újratervezés |
| App Store és Google Play alkalmazás | Jelenleg web/PWA; natív projekt nincs | A12 és tényleges kétplatformos elfogadás |

A `PRODUCT_DIRECTION.md` elsőbbséget élvez a régi ötletlistákkal szemben.
Az árterv változatlan: Free / Family **990 Ft/hó** / Family+ **1490 Ft/hó**.
A mátrixból történő tudatos kivétel csak külön tulajdonosi döntés lehet;
az audit nem halasztott el funkciót és nem vont össze csomagot.

## Részletes megállapítások

### A01 — P1 / R — Sérült helyi napló csendes felülírása

**Forrás:** `src/storage.ts:133`, `src/storage.ts:153`, `src/App.tsx:96`.
A betöltés bármely parse/validálási hibára alapértelmezett üres naplót adhat;
a React indulási effekt ezt visszamenti ugyanarra a kulcsra. A sérült eredeti
nem kerül karanténba. A próba hibás JSON után üres sessionlistát és az eredeti
érték felülírását igazolta. Régi V3 fallback esetén régebbi állapot is léphet
az új helyére.
**Teendő:** külön „nincs adat” és „nem olvasható adat”; eredeti bájtok megőrzése,
helyreállítási/exportálási lehetőség, hibaállapotban automatikus mentés tiltása.
**Lezárás:** hibás JSON, hibás V4, sikertelen migráció és storage-hozzáférési
hiba után nincs felülírás; a felhasználó érthető helyreállítási utat kap.

**Lezárva a `5bfdcd6` utáni munkafában, 2026-09-20:** a betöltés külön kezeli
a hiányzó, érvényes, migrált és helyreállítást igénylő naplót. Sérült V4/V3,
tárhelyhiba vagy sikertelen migráció blokkolja a helyi és távoli mentést,
valamint a Family Sync indulását. Az eredeti bájtok változatlanok maradnak és
letölthetők; csak ellenőrzött backup importja vagy külön megerősített üres
újrakezdés írhatja felül őket. A célzott hibainjektálás, a teljes 195 teszt,
frontend/Worker typecheck és mindkét frontend build sikeres. A01 kész;
a következő adatmegőrzési szelet A02.

### A02 — P1 / R+K — Több böngészőlap és nem atomi napló/outbox mentés

**Forrás:** `src/App.tsx:84`, `src/storage.ts:153`, `src/familySync.ts:90`, `:412`.
Két külön betöltött állapot egymás után mentve elveszíti az első lap önálló
új alvását: teljes snapshot felülírás történik. Nincs lapok közötti koordináció.
A napló és a pending queue külön localStorage-írás; a kettő közötti összeomlás
vagy tárhelyhiba nem kezelt tranzakció. A sérült sync-store szintén alapállapotra
eshet vissza. A crash/quota ág még nem injektált futási próba.
**Teendő:** verziózott/koordinált módosítások és tartós outbox, vagy bizonyított
egylapos írómodell; célszerű tranzakcióképes tárolást mérlegelni.
**Lezárás:** két lap egyidejű start/edit/delete, quota és mentés közbeni megszakítás
után minden elfogadott változás megvan vagy láthatóan visszautasított.

**Lezárva a `5ac2913` utáni munkafában, 2026-09-20:** a napló és a Family Sync
outbox ugyanabban a validált `solemiSleep:v4` envelope-ban, egyetlen
`localStorage.setItem` művelettel íródik. Quota/íráshiba esetén egyik fél sem
változik, az app visszatölti az utolsó biztos állapotot és blokkoló, exportot is
engedő hibaképernyőt mutat. A hibás sync-store többé nem esik csendben üres
állapotra. Web Locks alapján origin/böngészőprofilonként egy lap kap írójogot;
a többi lap csak tájékoztat, majd az író lap bezárásakor automatikusan újratöltve
átveszi a jogot. Célzott atomi/quota/sérülési tesztek, teljes **198/198** teszt,
frontend és Worker typecheck, production és auth-enabled internal build sikeres.
A helyi kétlapos böngészőpróbában az indított aktív alvás az íróvá előlépő második
lapon változatlanul megjelent és lezárható volt. A02 kész; következik A03.

### A03 — P1 / K — Import és törlés félreérthető családi hatása

**Forrás:** `src/App.tsx:533`, `:563`, `:579`; `src/familySync.ts:335`.
Importkor a teljes helyi napló cserélődik; csatlakozott állapotban ebből
családi törlések/létrehozások képződhetnek. Az „összes alvásadat törlése” is
megy a sync-diffbe. A képernyő közben mindig azt írja, hogy az adatok csak ezen
az eszközön vannak. Az automatikusan elindított JSON-letöltés nem igazolt,
tartós biztonsági mentés.
**Teendő:** külön helyi törlés/közös törlés fogalom; import előnézet gyermek- és
sessionazonosítókkal, családi hatás egyértelmű megerősítése és visszaállítható mentés.
**Lezárás:** két eszköz, import/törlés, offline pending és visszaállítás próbája;
szülő nem tud egy „helyinek” hitt művelettel meglepetésszerű családi törlést indítani.

### A04 — P1 / R+K — A „család elhagyása” nem zárja le a tagságot

**Forrás:** `worker/src/index.ts:491`, `:966`; `src/familySync.ts:327`.
A leave végpont csak a legacy eszközt vonja vissza. A reprodukcióban a tagság
`ACTIVE` maradt. A bootstrap ezt a tagságot újra megtalálja, az eszközt újra
aktiválhatja. A kliens hiba esetén is eldobja a kapcsolatot és a pending sort.
**Hatás:** a felhasználó hiába hiszi magát kilépettnek; az előfizetés családi
hozzájárulása sem a kívánt módon szűnik meg.
**Teendő:** account-szintű atomi kilépés és külön eszközleválasztás; pending adatok
megőrzése; utolsó admin/tag és fizető kilépésének szabálya.
**Lezárás:** minden eszközön megszűnt tagság/hozzáférés, újbóli belépés nem
csatlakoztat vissza automatikusan; utolsó fizető kilépése pause-t okoz.

### A05 — P1 / K+V — Fiókváltáskor nincs elkülönített helyi napló és kapcsolat

**Forrás:** `src/storage.ts:26`, `src/accountAuth.ts:141`, `src/familySync.ts:226`.
A logout eltávolítja az access állapotot, de a napló és a családi token közös
böngészőtárban marad. Új accountnál a reconcile a meglévő családi kapcsolat
claimjével kezd, nem egy accountazonosítóhoz kötött kiválasztással.
**Biztos következmény:** a korábbi helyi napló tovább látható a böngészőben.
**Nem bizonyított:** más account adatai automatikusan más családhoz feltöltődnének;
ezt nem állítjuk. A szerver tagsági korlátai több ilyen lépést elutasítanak.
**Teendő/lezárás:** explicit eszközön maradás/törlés döntés és account/családhoz
kötött tároló; A→logout→B külön család, guest→account, pending→logout és újratelepítés
teszt. Idegen napló nem kapcsolható be észrevétlenül másik fiókba.

### A06 — P1 / R — A legacy API megkerüli a fizetős sync feltételét

**Forrás:** `worker/src/index.ts:880`, `:1188`.
Enforcement mellett az aktív accounttag nélküli családok kivételt kapnak;
az anonim `/v1/families` és `/v1/join` nyitva maradt. A próba enforcement=true
mellett account/előfizetés nélkül családot, alvást hozott létre és szinkronizált.
Ez szándékos átmeneti kompatibilitás, de nyilvános fizetős kapunak elégtelen.
Az invite/device/leave kezelés nem ugyanazon account-kapun keresztül fut.
**Teendő:** verziózott legacy migráció, új anonim cloud-családok útjának lezárása,
teljes végpontengedélyezési mátrix. A Free helyi naplóját ez ne korlátozza.
**Lezárás:** account és érvényes családi jog nélkül a nyers cloud API sem kerülhető
meg; kilépett/revoked eszköz új meghívót sem készíthet. Régi jogos felhasználó
ellenőrzött, adatvesztésmentes átállási utat kap.

### A07 — P1 / K — A production konfiguráció még nem a tesztelt termék

**Forrás:** `src/App.tsx:35`, `:175`; `src/FamilySyncLayer.tsx:121`;
`worker/wrangler.jsonc`, `worker/wrangler.staging.jsonc`, `functions/api/[[path]].ts`.
Auth nélkül a nem internal frontend Family+ hozzáférést ad; a production
workflow nem állítja be a bejelentkezést. A production Worker-fájlban hiányzik
az account bridge, entitlement enforcement és új konfliktuskezelés bekapcsolása.
A first-party auth proxy fix staging backendhez kötött; a GitHub Pages nem
futtatja ezt a Pages Functiont. A mobilon javított Safari-session működés ezért
nem öröklődik automatikusan productionre.
**Teendő:** explicit production/staging konfiguráció, hibás vagy hiányzó értéknél
biztonságos leállás; production auth-domain/proxy kialakítás; internal csomagváltó
és MANUAL-jogforrás leválasztása a store sandbox tesztekről. A UI-váltó elrejtése
önmagában nem elég. Az internal banner jelenleg pusztán a nem üres URL-ből ír staginget.
**Lezárás:** tényleges release-konfigurációval guest/Free/Family/Plus; server
tesztvégpont tiltott, nincs MANUAL grant; OAuth-origin és cookie működik iOS-en;
ellenőrzött backendhez beszél a megfelelő frontend.

### A08 — P1 / R — Billing sorrend és eseményfoglalás versenyhelyzete

**Forrás:** `worker/src/storeBillingService.ts:120`, `:179`, `:248`, `:304`.
Két reprodukció: azonos verifiedAt és tranzakció mellett REVOKED után ACTIVE
visszaadta a jogot; az előellenőrzés után közben beszúrt, azonos ID-jű eltérő
esemény mellett a grantmódosítás lefutott, az event-upsert pedig csendes no-op lett.
A batch atomi, de a batch előtti olvasás és az eseményfeltétel nem védi együtt
az egész döntést. A friss ellenőrzési idő önmagában nem provider-eseménysorrend.
**Teendő:** authoritative provider állapot/version, atomi eseményfoglalás és
állapotváltás; azonos időpont ellentmondásának explicit kezelése.
**Lezárás:** párhuzamos verify/restore/webhook; replay, régi ACTIVE új refund után,
azonos timestamp, eltérő hash, első vásárlás verseny; ismételt esemény nem változtat jogot.

### A09 — P1 / R — Csere-előfizetésnél megmarad a régi Google-grant

**Forrás:** `worker/src/storeBillingService.ts:205`.
A replacementProviderSubscriptionId csak eltárolódik. Új tokennel Family-re
váltott Google Family+ után a régi Plus grant aktív maradt, két aktív subscriptionnel.
**Teendő:** ellenőrzött linked token ownership és régi grantok atomi lezárása.
**Lezárás:** tokenváltás/upgrade/downgrade/restore után csak az aktuális jogok élnek,
családon belül is. A linkedPurchaseToken régi jogosultságának visszavonását a
[Google hivatalos útmutatója](https://developer.android.com/google/play/billing/security) is előírja.

### A10 — P1 / R+H — Sandbox/production környezeti kerítés hiánya a billingben

**Forrás:** `worker/src/storeBillingService.ts:190`; `worker/src/billingContract.ts`.
Az environment adatmező, nem elvárt szerverkörnyezethez ellenőrzött határ.
Ugyanazon provider-azonosító PRODUCTION állapota SANDBOX-ra átírható volt a
szolgáltatást közvetlenül hívva. A jövőbeli adapter feladata lehet védeni ezt,
de ma nincs ilyen adapter. Ez nem bizonyított publikus vásárlási exploit.
**Teendő/lezárás:** ellenőrzött bundle/package/product/environment és elkülönített
adattár/azonosítók; sandbox proof production környezetben nem adhat jogot;
sem kliens, sem értesítés nem választhatja meg a szerver környezetét.

### A11 — P1 / H — A valódi vásárlási életciklus még nincs kész

**Forrás:** `worker/src/billingContract.ts`, `worker/src/storeBillingService.ts`,
`worker/src/index.ts`, `STORE_BILLING_INTEGRATION_PLAN.md`.
Nincs bekötött store-verify/restore HTTP-folyamat, Apple/Google provider ellenőrző,
natív vásárlás, hitelesített notification/RTDN, retry/reconciliation és valódi
Google acknowledgement. A JWS alakjának ellenőrzése nem aláírás-ellenőrzés.
**Teendő:** az A08–A10 javítása után hiteles adapterek és végpontok, majd
paywall/restore/manage-subscription felület; árak az áruházból, családi effektív
jog külön a saját előfizetéstől. Aktív családi csomagnál ne kínáljunk szükségtelen
második vásárlást alapértelmezett megoldásként.
**Lezárás:** vásárlás/trial/pending/cancel/expiry/refund/grace/hold/upgrade/downgrade,
offline fizetés utáni újranyitás, visszaállítás, duplázott/kimaradt értesítés,
másik Solemi-account és Apple→Android családi hozzáférés teszt. Google oldalon
server verify és acknowledgement bizonyíték; [hivatalos követelmények](https://developer.android.com/google/play/billing/security).

### A12 — P1 / H — Natív kiadás és iOS-login nincs elkészítve

**Forrás:** `package.json`, `src/accountAuth.ts`, `worker/migrations/003_accounts_and_sessions.sql`.
A repo web/PWA, nincs kész iOS/Android héj vagy StoreKit/Play Billing kliens.
A Google webes Identity gombja nem bizonyítja a natív WebView login működését.
A Google-only identity-séma bővítést igényelhet.
**Teendő:** natív csomag, biztonságos token- és fájlkezelés, deep link,
háttér/visszatérés, export/share és store billing; iOS-en megfelelő alternatív
login. A Sign in with Apple kézenfekvő megoldás, az Apple 4.8 pontosan megfelelő
adatvédelmi tulajdonságú egyenértékű alternatívát kér, kivételekkel.
**Lezárás:** aláírt iOS és Android build valós készüléken; belépés/fiókegyesítés,
vásárlás, restore, offline és visszatérés; érdemi mobilos működés, review-hozzáférés.
[Apple 4.8 és review-követelmények](https://developer.apple.com/app-store/review/guidelines/).

### A13 — P1 / R — Új aktív alvás jegyzete és kézi típusa nem kerül a start műveletbe

**Forrás:** `src/familySync.ts:377`; `worker/src/index.ts:607`.
Új, még le nem zárt session esetén az outbox csak ID/gyermek/kezdés mezőt küld.
A próba jegyzettel és night-felülírással egyetlen, ezeket nem tartalmazó műveletet
kapott. Kézi aktív bevitel/import érintett; a korábbi missing-session repair
külön kezeli e mezőket, az nem javítja ezt az általános utat.
**Teendő/lezárás:** start + mezők atomi mentése vagy tartós kapcsolt patch;
új aktív session note/típus mindkét eszközön, újrapróbálás és reload után is egyezzen.

### A14 — P1 / R — Két gyermek egyidejű törlése megkerüli az utolsóprofil-védelmet

**Forrás:** `worker/src/index.ts:569`; `src/App.tsx:94`.
A darabszámellenőrzés a törlési batch előtt történik. A reprodukció két
gyermeknél közbeiktatott második törléssel mindkettőt törölte. A kliens
aktívgyermek-választása nem üres children listára készült.
**Teendő:** az invariáns a tranzakcióban/adatbázisban is érvényesüljön; kliens
legyen védett az üres távoli gyermeklistától.
**Lezárás:** két eszköz egyidejű törlése után legalább egy aktív profil megmarad,
a vesztes művelet érthetően elutasított; sessionök nem vesznek el mellékhatásként.

### A15 — P1 / K+V — A szinkron további határesetei még nem lezártak

**Forrás:** `src/familySync.ts:285`, `:335`; `worker/src/index.ts:453`, `:534`.
Csatlakozáskor a nem üres helyi napló összefésülése nincs külön, megerősített
importfolyamatként megoldva; a komment „later release”-re utal. Ezt a döntést
a jelenlegi kérés felülírja. A gyermekpatch nem használ a sessionéhez hasonló
revision-feltételt; az előzetesen kiolvasott másik mezővel is teljes sort ír.
A sync cursor és a rekordok több külön SELECT-ből jönnek, snapshot-egyezésük
párhuzamos D1-terhelés alatt nem igazolt.
**Teendő/lezárás:** pre-existing napló választása/backup; gyermek név+szuletési
dátum párhuzamos módosítása; gyermek törlés vs alvásindítás; pull közbeni írás;
lezárt→aktív import; nagy bootstrap, kapcsolatvesztés és visszatérés.
A cursor-adatvesztést és tényleges D1 lekérdezési sorrendet itt nem reprodukáltuk,
ez kifejezetten vizsgálandó kockázat, nem megállapított adatvesztés.

### A16 — P1 / K+V — Offline jogosultság és párhuzamos session-frissítés

**Forrás:** `src/accountAuth.ts:73`, `:79`, `:152`; `src/App.tsx:113`;
`worker/src/authService.ts` refresh/rejectReplay.
Hálózati hibánál a kliens null account/access állapotot hirdet; offline induláskor
a fizetős Insights bezárhat. Nincs validált offline entitlement cache.
A restore és usableAccess külön promise-zárat használ, böngészőlapok között nincs
koordináció; közös refresh-cookie újrahasználatát a szerver visszavonásnak tekinti.
**Teendő:** hálózati hiba ≠ kijelentkezés; közös refresh-koordináció és tudatos
replay-politika, offline hozzáférés lejárati/óravisszaállítási szabályokkal.
**Lezárás:** airplane-mode hidegindítás, tokenlejárat két lapon, elveszett refresh
válasz, logout, másik eszköz visszavonása és kétaktív-eszköz limit harmadik
böngészős próbája. A véletlen többlapos kijelentkeztetés még célzottan igazolandó.

### A17 — P1 / H — Fióktörlés és adatkezelési életciklus hiányzik

**Forrás:** `src/AccountCard.tsx`, `worker/src/index.ts`, kiadási dokumentumok.
A logout és az alvásadat-törlés nem accounttörlés. Nincs végigvezetett törlési
végpont/felület, megőrzési szabály, publikált privacy/support dokumentum ebben
a repóban. A megosztott gyermekadat, törlő/fennmaradó tag és vásárlási bizonylat
viszonyát külön meg kell tervezni; az account státusza a jogaggregációban is számítson.
**Teendő:** adatkatalógus (Google profil, gyermek név/születés/alvás/jegyzet,
helyi fotó, tokenek, billing, logok), cél/megőrzés/törlés/export, szolgáltatók,
hozzáférések és backupból való visszaállítás utáni törlésérvényesítés. A szülői
app és a gyermekeknek szánt app kategóriáját nem szabad automatikusan összekeverni.
**Lezárás:** appon belüli accounttörlés, működő webes törléskérési út,
privacy/support oldalak és valós működéssel egyező store adatvédelmi adatlap.
[Apple accounttörlés](https://developer.apple.com/app-store/review/guidelines/),
[Google appon belüli és webes törlési követelmény](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
A jogalapok és megőrzési határidők véglegesítése külön adatvédelmi/jogi feladat;
az audit nem állít jogi megfelelőséget.

### A18 — P1 / R — A Pages proxy megbízható Originra írja át az idegen origint

**Forrás:** `functions/api/[[path]].ts`; `src/accountProxy.test.ts`.
Egy foreign.example Originú POST változatlanul továbbment, de már az engedélyezett
internal Origin fejléccel. A Worker így nem az eredeti böngésző-eredetet látja.
A Lax cookie és a JSON Content-Type csökkenthet bizonyos böngészős támadási
utakat; **hitelesített CSRF exploitot nem igazoltunk**. A határ megkerülése ettől tény.
**Teendő/lezárás:** a proxy saját Origin/Fetch Metadata ellenőrzése, szűk
metódus/útvonal/header továbbítás és cookie-s authhoz megfelelő CSRF-védelem;
idegen origin kérése ne váljon megbízhatóvá. Frontend–proxy–Worker teszt együtt.

### A19 — P2 / K+V — Erőforrásvédelem és biztonsági üzemeltetés nincs igazolva

**Forrás:** `worker/src/index.ts:159`, challenge/family/invite/sync útvonalak;
`worker/wrangler*.jsonc`, publikus webes kiszolgálás.
A kódban nincs alkalmazásszintű rate limit, olvasás előtti JSON-méretkorlát,
vagy lapozott nagy sync-bootstrap. Anonim D1-írást végző útvonalak vannak.
Nem láttunk rögzített CSP/egyéb webes biztonsági header-konfigurációt.
Külső Cloudflare-védelem létezhet, de ebben az auditban nem ellenőriztük.
**Teendő/lezárás:** konkrét visszaélési limit és mérés, túlméretes body elutasítása,
meghívó/challenge korlátozás, titokrotáció és logredakció, Google-kompatibilis
CSP, storage/XSS határok, nagy bootstrap határteszt; dependency/security review
a végleges lockfájlok alapján. A CORS nem account- vagy költségvédelem.

### A20 — P2 / K+R — Konfliktusválasztás és használhatóság hiányai

**Forrás:** `src/FamilySyncLayer.tsx:402`, `:470`; `src/App.tsx:577`, `:732`.
A konfliktusnál két választógomb látszik, a helyi és távoli idő/jegyzet értékei
nem kerülnek egymás mellé; a kód az első konfliktust oldja. A felhasználó nem
látja pontosan, mit tart meg. A missing-session kártya már jóval informatívabb.
A profilszerkesztő billentyűs Enter aktiválása és Escape bezárása a helyi
böngészőpróbában nem működött; név nélküli ikonvezérlők és hiányos dialog/fókusz
kezelés vannak. A háttér a modálisnak szánt szerkesztő mellett hozzáférhető.
**Teendő/lezárás:** gyermek/dátum/idő/jegyzet mindkét változatról, konfliktusszám;
valódi buttonök, nevek, fókuszcsapda/visszaadás, Escape, VoiceOver/TalkBack és
nagy betűméret teszt. Sötét kontraszt, alsó navigáció, billentyűzet, safe-area,
kis kijelző HU/EN/DE próbája; teljes vizuális megfelelőséget most nem állítunk.

### A21 — P2 / R+K — Statisztikai összegek és jelzések eltérő szabályokat követnek

**Forrás:** `src/utils.ts:80`, `:114`; `src/sleepDevelopment.ts:121`;
`src/App.tsx:136`, `:313`.
Reprodukció: 12:00–13:00 és 12:30–13:30 bejegyzésnél a főoldal 120 percet,
a statisztika uniója 90 percet számol. A helyi böngészőteszt 5 perces alvása
a főoldalon megvolt, a heti statisztikában 0-nak látszott. **Pontosítás a
Family+ audit alapján:** ez nem kiszűrés, hanem az 5/7 perces napi átlag
lefelé kerekítése. Az elemzési minimum 2 perc, az 5 perces rekord megmarad.
Közvetlen startkor az előző timer-tick miatt pillanatnyi „hibás időpont” jelzés
is reprodukálható. Az egyik elemzés kizár, másik összevon; ezt a felület nem
mindenütt magyarázza meg.
**Teendő/lezárás:** közös, dokumentált alapösszeg és elemzési szűrés; nyers/használható
adat külön érthető jelzése; indulási téves figyelmeztetés megszüntetése.
Éjfél, 23/25 órás nap, rövid/átfedő/aktív alvás, hiányos nap, időzónaváltás
és ritka minta ugyanazzal a tesztadattal minden érintett képernyőn ellenőrzött.
A meglévő DST-tesztek pozitívak, a teljes készülékidőzóna-mátrix még nem.

### A22 — P2 / K+mérés — Statisztikák újraszámolása minden másodpercben

**Forrás:** `src/App.tsx:136`, `:313`, `:339`; `src/utils.ts:97`.
A teljes Statisztika nézet több memoizált számítása függ a másodpercenként
változó now-tól; zárolt kártyáknál is kiszámolódnak. Több modul újra feldolgozza
ugyanazt a történetet, a day/night függvény perces léptetésű. 1800 mesterséges
sessionre az egyszeri függvénycsoport 91 ms volt ezen a gépen; ebből telefonos
lassulás mértéke nem állapítható meg. A fő bundle kb. 661 kB, gzip203 kB.
**Teendő/lezárás:** stopper és történeti elemzések frissítése külön; közös
előfeldolgozás, szükség szerinti kódbontás. Mért profil gyengébb telefonon
1800/5000 sessionnel, hosszú használat/alacsony hálózat mellett; elfogadható
interakció- és akkumulátorterhelés. A chunk-warning önmagában nem kiadási hiba.

### A23 — P1 / H+K — Funkcióígéretek és paywall szövegek lezárása

**Forrás:** `FEATURE_ENTITLEMENT_MATRIX.md`, `PRODUCT_DIRECTION.md`, `src/i18n.ts`,
`src/entitlements.ts` és a fenti funkcióleltár.
PDF, fix/adaptív értesítés, életkori összehasonlítás, trial/éves ajánlat és
navigáció között több terv–implementáció eltérés van. A személyes előfizetésnek
hangzó zárolásszöveg nem magyarázza a családtagtól kapott jogot.
**Teendő:** egyetlen aktuális, végrehajtható funkciómátrix; havi csomagok
megtartása, Family+-nak valós, leíró többlet. A Prediction Lite saját múltbeli
minta legyen, ne előírás; minden HU/EN/DE marketing/paywall szöveg ezt kövesse.
**Lezárás:** minden meghirdetett funkció kipróbálható; a még nem jóváhagyott régi
ígéretekről explicit döntés született. Trial/éves ár és áruházi jogosultság,
lemondás/megújulás és családi öröklés félreérthetetlen. Nem minden régi tervet
kell automatikusan hozzáépíteni; semmit nem hagyhatunk csendben „majd”-ra.

### A24 — P1 / K — Reprodukálható és jóváhagyáshoz kötött kiadás hiányai

**Forrás:** `.github/workflows/ci.yml`, `deploy-pages.yml`, `internal-preview.yml`,
`staging-smoke.yml`; `vite.config.ts`; `index.html:11`.
Nincs tracked frontend/Worker lockfile, CI `npm install`-t futtat. A production
Pages workflow nem függ a CI eredményétől; workflow_dispatch-hoz a fájlban nincs
main-only feltétel. Külső GitHub environment/branch protection nincs auditálva.
Az internal CI artifact nem állít auth/sync flaget, így nem az élő internal
beállítást vizsgálja. A staging smoke nem vár bizonyítottan ugyanazon commit
deployjára. Az internal kikapcsolja a SW regisztrációját, production autoUpdate
SW-t használ: a telefonos internal teszt nem SW-frissítési teszt.
**Teendő/lezárás:** rögzített lock + ci install; tesztelt SHA/artifact és manuális
éles kapu, environment-validálás, pontos backend-verzióval futó smoke; régi→új
PWA upgrade és rollback megőrzött aktív alvással/pending sorral.
A root-base internal build HTML ikonlinkje változatlan `/botond-sleep-tracker/`;
az ikonútvonalak/méretek és telepíthetőség ellenőrzése is szükséges.

### A25 — P1 / H — Production migráció/backup/restore még nincs lezárva

**Forrás:** `RELEASE_CHECKLIST.md`, `worker/migrations/002`–`007`, állapotnapló.
A régi éles lista csak a 002 migrációt emeli ki, miközben account/billinghez
újabb táblák is kellenek. A 007 helyi, távoli állapotát nem ellenőriztük újra.
Korábbi before/after export nem azonos bizonyított teljes visszaállítási próbával.
**Teendő:** tényleges production sémaleltár olvasással; kompatibilis migrációs
sorrend, backup titkos tárolása/megőrzése, elkülönített staging restore, FK- és
rekordellenőrzés, kliens/Worker/D1 visszaállási forgatókönyv. Schema.sql nem
helyettesítheti vakon a migrációt egy meglévő adatbázison.
**Lezárás:** próbált helyreállítás, mért idő/adatvesztési ablak, régi kliens és
új backend együttélése, név szerint rögzített SHA és adatbázis. Az éles lépés
csak külön jóváhagyott konkrét tervvel történhet.

### A26 — P2 / H+V — Üzemeltetési, support- és store-beadási bizonyítékok

Hiányzó lezárások: felelős support cím, hibakód/buildazonosítóval küldhető
adatminimalizált hibajelentés; API/sync/billing hibák és költségek figyelése;
értesítési újrapróbálások és elakadt queue helyreállítása; staging hozzáférés és
valós gyermekadat kezelése; belépési/billing titkok rotációja; App Store/Play
listázás, képernyőképek, privacy adatlap, review instrukciók és demo hozzáférés.
Nem kell mindehhez bonyolult analytics SDK: minimális, adatvédelmi szempontból
átgondolt üzemeltetési jelzés is lehet elegendő.
**Lezárás:** teszthibára valóban reagáló riasztás/support, titkot/naplót nem
kiszivárogtató riport, lezárt store beadási ellenőrzés. Ha a Play-fiók
2023-11-13 után létrehozott személyes fiók, jelenleg legalább 12 tesztelő
14 napos folyamatos closed-test részvétele kell a production hozzáférés
kérelmezéséhez; a felhasználó fióktípusa nem ismert.
[Google hivatalos tesztelési feltételek](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

### A27 — P1/P2 / R+K — Family+ számítások és a mutatók jelentése

A [Family+ statisztikai audit](FAMILY_PLUS_STATISTICS_AUDIT_2026-09-20.md)
S01–S15 pontja részletezi a bizonyítékokat és a lezárást. Megszakított
éjszakák hibás ébredési/ébrenléti mintát adnak; eltér a leghosszabb alvás
átlagának nevezője; aktív alvás és elavult ébredés mellett is képződhet
félrevezető eredmény. Hiányos naplóból nem igazolható teljes napi alvásváltozás.
További tételek: időhatár, óraidő-medián, mintavételi ablak, adatminőségi
politika, időzóna, mintaszám és jelentésfeliratok.
**Lezárás:** mind a 15 tételhez javítás vagy explicit, ellenőrzött számítási
szabály és a kívánt viselkedést rögzítő próba. Az A01 elkészült;
a statisztikai problémák sem halasztódnak automatikusan kiadás utánra.

## Kiadás előtti végrehajtási sorrend

1. **Adatmegőrzés és helyi mentés:** A01–A02 elkészült; következik A03,
   majd A13 és A14. Következő szelet: import/törlés családi hatása és visszaállítás.
2. **Család és account életciklus:** A04–A06, A15–A16; A17 törlési adatmodell.
   Kilépés, fiókváltás, több lap, offline és pending egyszerre is tesztelt legyen.
3. **Szerver/környezet:** A07, A18–A19; autentikált API, megfelelő origin és
   production konfiguráció. A24 reproducible build már ekkor rendezendő.
4. **Fizetés:** A08–A11 domainhibák → mock end-to-end → hiteles provider → restore
   és notification életciklus. MANUAL entitlement nem bizonyít store vásárlást.
5. **Mobil és termékfelület:** A12, A17, A20–A23, A27/S01–S15. Natív technikai próba korán
   is indulhat, de nyilvános csomag csak a stabil adatrétegen készüljön.
6. **Kiadási főpróba:** A24–A26, két platform, teljes elfogadási mátrix,
   backup/restore, üzemi beállítások, pontos SHA. Ezután külön production döntés.

Ez munkasorrend, nem határidőígéret. A heti 5–8 órába illő kis lezárt szeleteket
érdemes vállalni, minden szelethez rövid telefonos feladatlappal, amikor szükséges.

## Kötelező végső elfogadási mátrix

| Csoport | Bizonyítandó esetek |
|---|---|
| Free helyi használat | Új telepítés fiók nélkül; offline start/stop/edit; több gyermek; reload; sérült/quota tároló; import/export |
| Párhuzamosság | Két lap, két eszköz; start/start, edit/edit, edit/delete, gyermekpatch/delete; elveszett válasz és retry |
| Családi jog | Free+Free pause; Family+Free; Plus+Free; fordított fizető; utolsó fizető kilép/lejár/refund; megmaradó fizető |
| Account | Google/megfelelő iOS-login; cold restore; offline; refresh race; logout; A→B; harmadik eszköz; accounttörlés |
| Billing | Mindkét store sandbox; családi cross-platform jog; trial; restore; pending; refund; renewal; token replacement; replay |
| Elemzés | Kevés adat, rövid/átfedő/hiányos nap, éjfél/DST/időzóna; azonos alapösszeg; nincs hamis tanács/eredményígéret |
| UI | HU/EN/DE, kis kijelző, nagy betű, sötét kontraszt, VoiceOver/TalkBack, billentyűzet/fókusz, offline/hiba/üres állapot |
| Release | Ugyanazon SHA CI+artifact+Worker; régi PWA frissítés; friss natív telepítés; migráció; restore; rollback; support |

A korábbi normál kéttelefonos elfogadást nem kell ok nélkül újra elvégezni
minden dokumentációs változásnál. Adat-/auth-/sync-/billing-javítás után az érintett
ágakat, a végső release candidate-en pedig ezt a teljes mátrixot kell igazolni.

## Amit most a tulajdonostól nem kérünk

Nem szükséges most telefont tesztelni, fizetési adatot vagy secretet küldeni,
productionre tenni az ágat. Az A01–A02 helyi javítása elkészült; következik az A03
fejlesztési szelet. Később célzott döntés kell a régi funkcióígéretekről,
offline jogról/megőrzésről, iOS-loginról és a store fiókok konkrét beállításáról.
A jelentés ezeket nem dönti el a tulajdonos helyett.
