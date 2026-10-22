# Solemi — konkrét main-átállási terv

**Lezárás, 2026-10-22:** [PR #3](https://github.com/czkiii/botond-sleep-tracker/pull/3) összevonva; main **`2462e27ec49073104cb48f0b2663087ee8fee91c`**, helyi és origin/main egyezik. A main-védelem aktív, a végleges feature öt ellenőrzése és a main saját Frontend/Worker CI-je sikeres. **65 fájl / 915 teszt PASS**, nulla audit-találat. A régi Pages HTML változatlan (HTTP 200, azonos hash), automatikus kiadása letiltva maradt; production deploy, adatátvitel vagy wipe nem történt. A feature ág megmaradt. Support-kérés nincs a tervben.

**Új éles konfiguráció előkészítve, 2026-10-22:** [bekötési csomag és végrehajtási lap](PRODUCTION_V4_CONFIGURATION_2026-10-22.md). Jóváhagyott appcím: `app.solemi-sleep.app`; a bemutatkozó oldal marad. Az átálló család kiválasztott adminfiókja 90 nap Family+ hozzáférést kap majd a tényleges átállástól, trial és automatikus fizetés nélkül. Helyi csomaggenerátor, privát fiókhoz kötött egyszeri grant, 33/33 célzott próba, Worker dry-run és production frontend build PASS. A csomagolási próbában szintetikus ID/kulcs/SHA szerepelt; éles erőforrás, DNS, secret, adatátvitel és grant alkalmazás nem történt.

**Következő:** az új éles Cloudflare-erőforrások létrehozása és a zárolt bekötés végrehajtása a kész csomaggal. **GPT-6 Astra · erős; kézi app-teszt nélkül indítható.** A tényleges létrehozást és telepítést külön előre jelezzük; a korábbi merge-et és főpróbát nem kezdjük újra.

**Az alábbi korábbi állapotok és lépések történeti előkészítés; a fenti lezárás az irányadó.**

**Aktuális állapot, 2026-10-21 — előkészítés lezárva:** [main-merge végrehajtási lap](MAIN_MERGE_READY_2026-10-21.md). A main tiszta (`a529a64`), a Pages automatikus kiadása tiltva; a friss merge-előnézet feloldva pontosan a feature fájlfáját adja. A 907/907 próbához képest csak dokumentáció változott. **Tulajdonosi döntés: GitHub Support-kérést nem küldünk; a régi PR/cache esetleges elérhetősége ismert maradvány, nem merge-kapu.** Ág-védelem aktiválása, konfliktusfeloldó commit/feltöltés és külön jelzett main-merge következik; production bekötés utána. Most nincs távoli módosítás vagy kézi app-teszt.

Dátum: 2026-10-19, Europe/Budapest. Feladat: a terv elkészítése, nem az átállás végrehajtása.

**Történeti frissítés, 2026-10-20 (az azóta teljesült teendőket a fenti aktuális állapot felülírja):** a [helyi előzménytisztítás és merge-előkészítés](REPOSITORY_CLEANUP_CHECKPOINT_2026-10-20.md) elkészült: az alkalmazáskód megőrzésével pontosan négy mentés távolítható el; külön merge-jelölt 907/907 teszt, két typecheck, build, dry-run és audit PASS. A lockfile és a teljes tesztes workflow-k Node-verziója rendezve; új CI-védelem a követett mentések ellen. Az alábbi terv ezekre vonatkozó előkészítési teendői teljesültek. A távoli tisztítás/merge nincs végrehajtva: Cloudflare Builds kapcsolóolvasás 403, majd konkrét távoli main-átírási jóváhagyás kell. A végleges új production konfigurációs build külön marad.

**Döntés:** új, üres V4-környezet; a megőrzendő napló ellenőrzött importja; új belépés és új család. A régi production adatbázist nem alakítjuk helyben V4-re. A „wipe” lehetőségét elfogadta a tulajdonos, de a régi környezet törlése az átállás utolsó, külön engedélyezett lépése. A staging főpróbát és a 195 bejegyzéses exportpróbát nem ismételjük meg.

**A main összevonása és a felhasználó átköltözése két külön esemény.** A merge csak ellenőrzött kiadási kapcsolók mellett történhet; önmagában nem indíthat production deployt. A jelen dokumentum nem változtatja meg a fizetési/store és a teljes kiadás többi feltételét.

## 1. Október 19-i kiindulási leltár — történeti állapot

| Tétel | Megfigyelt állapot és következmény |
|---|---|
| Main | Helyben és GitHubon `57357fd8c049bcd061f3154a299dafe4a5db7ec8`. |
| Fejlesztési ág | A terv kezdetén `feat/child-profile-v4`, `5a24cbd946c793bf36cf25ce8b27107d830a244d`, tiszta munkafa. Ez a dokumentáció alapja, nem előre rögzített végső kiadási SHA. |
| Main saját commitjai | `a529a64`: régi frontend lockfile. `57357fd`: négy fájl a `.private-backups/` alatt, köztük napló- és SQL-mentések. Új appfunkció nincs bennük. |
| Összevonási előnézet | A helyi, írás nélküli háromutas `git merge-tree` előnézetben szöveges konfliktus a `package-lock.json` fájlban van. A végleges merge-jelöltet ettől függetlenül ellenőrizni kell. |
| Repository-védelem | GitHub: public repository; main `protected:false`, repository rulesets `[]`. A kötelező CI-kaput a merge előtt be kell állítani/igazolni. |
| Régi frontend | A main GitHub Pages workflow-ja pushra kiad. A fejlesztési ág változata csak kézzel indul, és az új production buildkapu GitHub Pagesen szándékosan nem enged kiadást. A ténylegesen kiszolgált régi artifact külön rögzítendő; a main SHA nem automatikus bizonyítéka annak. |
| Régi Worker | `solemi-sleep-sync`, D1 `solemi-sleep-db` / `8ace71f6-9c2d-445f-8788-a76bedcdd7bc`. A 22:00 CEST GET-leltárban régi konfiguráció: DB, TOKEN_PEPPER, GitHub Pages/localhost origin; utolsó Worker-módosítás augusztus 24. Ezt a konfigurációt nem szabad az új kóddal felülírni. |
| Napló | A korábbi, ugyanezen esti olvasási leltárban 11 családrekord, egy frissen használt család 195 nem törölt alvással. Nem állítjuk, hogy a DB-ben csak egy család létezik. |
| Export | Október 19., 21:52:46 CEST: V3→V4, 195/195 alvás mezőnként azonos, egy profil, nulla aktív alvás; újramentés/újraimport PASS. Ez a fájl és a helyi tárolás bizonyítéka, nem teljes távoli rekordegyezés. |
| Belső Pages | `solemi-sleep-internal.pages.dev`; production branch `feat/child-profile-v4`, automatikus kiadás bekapcsolva, preview `all`. A leltárkor canonical frontend `5a24cbd`. Staging cél marad. |
| Marketingoldal | `solemi-sleep.app` és `www.solemi-sleep.app` a külön `solemi-sleep-site` repo/Pages projekthez tartozik. Ezt nem cseréljük le az appra. |
| Új éles app | A leltárban még nincs hozzá külön Pages projekt/Worker. Az alábbi nevek javasolt, még nem létrehozott célok. |

Távoli olvasási bizonyítékok: GitHub repository/branch/rulesets API; privát `worker/.private-backups/production-transition-2026-10-19/release-settings.json`. Cloudflare Worker Builds branch/triggerek, GitHub Pages aktív artifact és OAuth-originek teljes távoli ellenőrzése még nincs kész; ezek a kiadásvezérlés egyetlen fennmaradó leltárkörébe tartoznak. Titokérték nem került a jelentésbe.

### Nyilvános mentések — azóta végrehajtott rendezés előzménye

A main négy `.private-backups/` fájlja már a nyilvános repository része. A fejlesztési ág aktuális fájlfájában nincsenek, de egy szokásos merge a main-en lévő hozzáadásokat megtarthatja. A `.gitignore` a már követett fájlokra nem védelem.

- A merge-jelölt követett fájljai között nulla ilyen mentés maradhat. Csak a Git-indexből kell kizárni őket; a szükséges helyi eredetit nem szabad törölni.
- Ez nem távolítja el a meglévő Git-előzményt. Külön, konkrét repository-adatvédelmi rendezés szükséges: hozzáférés korlátozásának megtervezése, érintett commitok/fájlok leltára, helyi mentés után előzménytisztítás és a távoli referenciák ellenőrzése. A hozzáférés korlátozásánál a régi GitHub Pages működése is ellenőrizendő.
- A mentésekben esetleg szereplő használható belépési titkokat külön kell azonosítani és szükség esetén visszavonni; a puszta fájlnévből nem állítjuk, hogy titok is kiszivárgott. Külső másolatok törlése nem igazolható egy Git-tisztítással.
- Ebben a munkamenetben nincs repository-láthatóság-váltás, history rewrite, force push vagy jogosultság-visszavonás. Az előzményrendezés megváltoztathatja a main azonosítóját, ezért utána az összevonási alapot újra rögzítjük.

## 2. Célkörnyezet és lezárandó döntések

Javasolt célok, létrehozás előtt név- és erőforrásazonosság-ellenőrzéssel:

| Erőforrás | Javaslat | Elválasztás |
|---|---|---|
| App webcíme | `app.solemi-sleep.app` | A marketingoldal változatlan. Tulajdonosi URL-döntés és DNS/OAuth beállítás kell. |
| Pages projekt | `solemi-sleep-app`, build `dist`, base `/` | Új projekt; a main automatikus publikálása az átállásig tiltva. Preview nem kap éles titkot vagy éles adatkapcsolatot. |
| Worker | `solemi-sleep-sync-v4` | Új, pontos commitazonosítós deploy; a régi `solemi-sleep-sync` nem célpont. |
| App D1 | `solemi-sleep-db-v4` | Új üres adatbázis; sem staging-, sem legacy production-azonosító nem használható. |
| Törlési journal D1 | `solemi-erasure-journal-production-v4` | Független az app D1-től; saját séma és új production source-azonosság. |

**Egy külön üzleti döntés marad az átálló családhoz:** az új szerver a családlétrehozáshoz és a szinkronhoz valódi `FAMILY_SYNC` jogot kér. A régi V3-napló ilyen jogot nem tartalmaz. Javaslat: az átálló tesztcsalád adminja kapjon kifejezetten jóváhagyott, lejáratos átmeneti hozzáférést, amely nem fogyaszt trialt. Az időtartam, pontos fiók, valamint az auditált kiadás/visszavonás módja még meghatározandó; nincs késznek állított production admineszköz. Alternatíva a már működő valódi előfizetés. Productionben nem kapcsoljuk be emiatt a tesztcsomag-választót és nem kapcsoljuk ki a jogosultságellenőrzést. Ezt a döntést a terv most nem hozza meg a tulajdonos helyett.

### Konfigurációs szerződés

Nem futtatható deploy-parancs, hanem ellenőrzendő értéklista. Csak ellenőrzött új erőforrásazonosítókkal készülhet belőle kiadási csomag.

- Frontend: `VITE_RELEASE_CHANNEL=production`, `VITE_HOSTING_PLATFORM=cloudflare-pages`, `VITE_BASE_PATH=/`, `VITE_ACCOUNT_AUTH=true`, `VITE_INTERNAL_PREVIEW=false`, `VITE_ACCOUNT_API_BASE=/api`, `VITE_SYNC_API_BASE=<új production Worker HTTPS origin>`, `VITE_ENTITLEMENT_TEST_MODE=false`, `VITE_BUILD_SHA=<végső 40 karakteres SHA>`.
- Offline hozzáférés: külön production aláíró kulcspár; frontendben csak `VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK`, Workerben a hozzá tartozó `OFFLINE_ENTITLEMENT_PRIVATE_JWK`. Privát kulcs VITE-változóba nem kerülhet.
- Pages Functions: `SOLEMI_PROXY_ENV=production`, `SOLEMI_API_ORIGIN=<ugyanaz az új Worker origin>`. Az első félhez tartozó `/api` proxy és a cookie/Origin ellenőrzése szükséges; statikus HTML feltöltése önmagában nem teljes kiadás.
- Worker: `SOLEMI_ENVIRONMENT=production`, `ACCOUNT_FAMILY_BRIDGE=true`, `ENTITLEMENT_ENFORCEMENT=true`, `RECONCILIATION_CONFLICTS=true`, `ENTITLEMENT_TEST_MODE=false`; csak a jóváhagyott HTTPS app-originek. Google kliens és originregisztráció; külön `TOKEN_PEPPER`, legalább 32 karakteres `AUTH_SECRET`, `TRIAL_IDENTITY_SECRET`, verziózott trialkulcs és helyreállítható külső kulcsletét.
- `DB` és `ERASURE_JOURNAL` külön új D1. `DELETION_SOURCE_DATABASE_ID` az új app D1 logikai azonosítója; journal identity: `production` és ugyanaz az azonosító. A retention inventory ezt a production forrást és a tényleges mentési/logmegőrzést írja le.
- API/AUTH/INVITE rate-limit kötések külön production namespace-ekkel; Free csomagon nincs kézzel beállított `limits.cpu_ms`. Nem másoljuk át vakon a staging namespace-eket.
- Előkészítés alatt törlés/trial nyilvános aktiválása tiltott. `ACCOUNT_DELETION_MAINTENANCE`, `RETENTION_MAINTENANCE`, ötperces cron és restore-kapu az ellenőrzött production üzemeltetési sorrendben kerül bekötésre. A nyilvános trial/törlés kapcsolóinak és a frontend törlési vezérlőnek a végső állapotát külön rögzítjük; a teljes V1-kapu nem zárható le hiányos funkcióval vagy tájékoztatóval.
- A régi `worker/wrangler.jsonc` és az általános `npm run deploy` nem használható az új célra. Külön, az új D1-azonosítókat és build-SHA-t ellenőrző production csomag kell. Jelenleg csak a staging deploy-wrapper létezik.

### Új üres adatbázis létrehozási sorrendje

Az app adatbázisa: `worker/schema.sql`, utána `worker/migrations/003_accounts_and_sessions.sql`–`013_retention.sql` név szerinti sorrendben. Az új V4 alapsémára **nem** futtatjuk az 001/002 legacy átalakítást.

A külön journal: `worker/erasure-journal/schema.sql`, majd `002_retention.sql`, végül az ellenőrzött production source identity bejegyzése. A szükséges registry/retention üzemeltetési rekordok és kulcsok ezután következnek a már meglévő A17 eljárás szerint; az üres séma önmagában nem jelenti ezek bekötését.

Ezt a konkrét sémasorrendet most két üres, memóriabeli SQLite adatbázison lefuttattuk: **27 app-tábla, nulla idegenkulcs-hiba mindkét adatbázisban**. Nem távoli D1-próba és nem titok/registry-beállítás. Privát bizonyíték: `empty-schema-preflight.json` a fenti leltárkönyvtárban.

## 3. Végrehajtási sorrend — öt lezárható lépés

### I. Előkészítés kész; kontrollált main-merge

A friss bizonyítékokat és a pontos végrehajtást a [lezárt merge-előkészítés](MAIN_MERGE_READY_2026-10-21.md) tartalmazza. A lockfile feloldása és a Node-verziók próbája kész; a main-tisztítás és a kiadási kapcsolóleltár lezárt. Ezeket nem indítjuk újra.

Következik: a dokumentáció commitja, a main előzményeinek feature ágba emelése a kipróbált konfliktusfeloldással, feltöltés, a végső SHA-n szokásos CI, a kész main-védelem aktiválása és visszaolvasása, majd külön jelzett/jóváhagyott PR-merge. A legacy kiadás tiltva marad. Új production konfiguráció vagy appcím-döntés nem szükséges a kiadás nélküli kódösszevonáshoz.

**Kész, ha:** az új kód mainen van, azonosított SHA-val és sikeres CI-vel; a régi app tovább működik. Most kézi app-teszt nem szükséges.

### II. Új környezet bekötése, a main-merge után

Az appcím és az átálló család átmeneti hozzáférésének döntése után az új D1/journal, kulcsok, sémák, Worker, Pages/proxy és OAuth-origin a fenti konfigurációs szerződés szerint készül el. Előbb a tényleges production konfigurációs build és dry-run, majd külön jelzett/jóváhagyott bekötés; a marketing és a legacy rendszer nem változik.

Célzott gépi ellenőrzés: main-SHA/buildazonosság, health, proxy/CORS, belépés nélküli védelem, tesztkapcsolók tiltása, journal identity és cron. Az új hozzáférési és importút bekötését külön ártalmatlan adatokkal igazoljuk; a kész staging helyreállítási főpróbát nem ismételjük.

**Kész, ha:** az új app és szerver azonosított main-kódot futtat, a hozzáférés használható, és a régi rendszer még működik. Ezután következhet az egyszeri felhasználói költözés.

### III. Végső mentés és rövid naplózási szünet

1. Egyeztetett időpontban a régi család minden érintett eszközét listázzuk: URL, böngésző/PWA, utolsó sync, függő írás, aktív alvás. Ez egy egyszeri átállási kör, nem az M1–M6 újrajátszása. Aktív alvást nem zárunk le mesterségesen; az átállási ablakot ehhez igazítjuk.
2. Minden eszköz függő változását rendezzük; eltérő helyi naplónál külön export és egyeztetés, nincs automatikus összeöntés. Írási szünet kezdete és utolsó szerverre került változás rögzítve. A régi kliensek visszaírását műszakilag is tiltani kell, vagy igazoltan leválasztani őket: a CORS-változtatás önmagában nem ilyen védelem.
3. Friss végső felhasználói export, SHA-256 és rekordleltár; külön teljes legacy D1 SQL-mentés, hash, időbélyeg, séma/sorszám és olvashatóság. A végső felhasználói exportot a fagyasztott szervernapló megfelelő családjával mezőnként egyeztetjük; eltérésnél nincs wipe/átlépés. A mostani 195-ös darabszám ekkor már lehet más.
4. Régi Worker tényleges verzió/artifact, route/binding/cron beállítások, frontend kiszolgált artifact és régi URL megőrzése. Puszta Git-tag nem állít helyre titkot vagy adatbázist. A kulcsok külön védett letétbe kerülnek; Gitbe sem SQL, sem napló, sem titok nem kerül.
5. A szükséges mentés kapjon ellenőrzött, a munkagéptől független védett másolatot. A Solemi által kezelt teljes mentések lejárata legfeljebb 30 nap az eredeti készítéstől; másoláskor ez nem indul újra. A felhasználó saját exportja külön kategória. Az előírt retention inventoryban a dátumokat és a helyreállítási függést rögzítjük.

**Megállás:** sérült/hiányzó mentés, eltérő napló, újraindult régi írás, tisztázatlan aktív alvás vagy hiányzó hozzáférés esetén nincs felhasználói váltás és nincs törlés.

### IV. Egyetlen napló importja és célzott elfogadás

1. Tiszta új app-origin, az érintett admin saját Google-belépése. Előbb bejelentkezés, utána a saját fiókmunkaterületre a friss mentés importja: ezzel elkerüljük a vendégnapló/fiók közti szükségtelen választást. Ismeretlen vagy már meglévő család esetén megállunk.
2. Még család nélkül az importelőnézet és a helyi napló egyezésének ellenőrzése; a V3-ban nem lévő születési dátumot/képet nem találjuk ki. A korábbi V3→V4 ellenőrző eljárás a friss végső fájlra fut.
3. A jóváhagyott `FAMILY_SYNC` jog ellenőrzése után új család létrehozása ebből a naplóból. A jelenlegi `createFamily` a helyi gyermekazonosítóval indítja a családot, majd a helyi alvásokat feltöltendő műveletekként küldi. Megvárjuk az üres függő sort; megszakadás esetén nem hozunk létre újabb családot, hanem a már létrejött kapcsolatot ellenőrizzük.
4. Második családtag csak ezután, új meghívóval csatlakozik és a már feltöltött családi naplót választja. Ugyanazt az exportot nem importáljuk újra külön-külön minden csatlakozott eszközön.
5. Egyezés: alvás-ID, kezdés/vég, jegyzet és gyermekkapcsolat, darabszám, lezárt/aktív állapot; nulla függő művelet/konfliktus, újratöltés után is ugyanaz. Az új család/account/device azonosítói és szerveres revisionök szándékosan újak. A régi létrehozási/módosítási időket az export és a helyi import megőrzi; a jelenlegi `createCompletedSleep` viszont a szerveres `created_at`/`updated_at` mezőket a feltöltés idejére állítja. Ezért ezeket nem nevezzük az eredeti szerveres előzmény megőrzésének; az eredeti időbélyegek a megőrzött exportban maradnak. Ha ezeknek az új szerveren is eredetinek kell maradniuk, az általános import helyett külön, auditált importút szükséges. A tényleges alvási kezdés/vég nem változhat. A mostani fájlban nincs 2000 karakternél hosszabb jegyzet, 100 karakternél hosszabb alvás-ID, 60 karakternél hosszabb profilnév vagy jövőbeli alvás, így az ellenőrzött szerveres mezőkorlátok nem csonkolnák ezt a pillanatfelvételt.
6. Rövid tulajdonosi használati ellenőrzés: helyes napló, egyik eszközről végzett változás megjelenése a másikon, újranyitás. Ezt később az összevont főteszthez dokumentáljuk, nem kérjük újra ugyanazt a kört. Ekkor szűnik meg az írási szünet, és ettől kezdve az új napló az irányadó.

### V. Régi rendszer lezárása, majd a már tervezett főteszt

A régi PWA-kat/ablakokat bezárjuk, az új webcímet rögzítjük. A régi címen egyértelmű költözési tájékoztatás kell; az offline cache miatt ez önmagában nem kapcsol le minden régi klienst. Az API régi íróhozzáférése tiltva marad. Helyi régi adatot nem törlünk a mentés és a sikeres átvitel igazolása előtt.

A régi DB/Worker végleges törlése csak a napló egyezése, a hozzáférés működése, a visszaút/mentések és a törlendő erőforrások név+ID szerinti jóváhagyása után történhet. A wipe nem az új környezet létrehozásának előfeltétele. Törlés után már nem ígérünk azonnali, régi szerverre visszakapcsolást.

Ezután a meglévő összevont webes főteszt következik: tényleges készülék/PWA, A27, PDF, megjelenítés és kiadási kapcsolók. A belső sárga tesztcsík production buildből hiányozzon. A store-integráció a későbbi Android/iOS blokk része marad.

## 4. Visszaút — attól függ, mikor történt a hiba

| Helyzet | Eljárás | Adatmegőrzési feltétel |
|---|---|---|
| Merge/új környezet hibás, felhasználó még a régin | Az új kiadást megállítjuk; a régi frontend/Worker/DB változatlan. Szükség esetén csak az új kiadási jelöltet javítjuk. | Nincs napló-visszatöltés és nincs régi DB-revert. |
| Import közben hiba, az új oldalon még nincs a végső exporton túli valós naplóírás | Új írások leállítása, új állapot/export megőrzése; bizonyítjuk, hogy nincs új vagy módosított valódi bejegyzés. A régi írásvédelem feloldható, a régi család ugyanott folytatja. | A változatlanságot tartalom alapján ellenőrizzük, nem csak azonos darabszámból. Új accountokat sem törlünk csendben. |
| Már keletkezett új V4 naplóbejegyzés vagy szerkesztés | Új rendszeren írási szünet, minden eszköz függő sorának/exportjának mentése, friss V4 DB + journal/üzleti előzmények megőrzése. Elsődleges út a V4 javítása vagy kompatibilis V4 visszaállítás. | Régi V3 visszakapcsolása önmagában adatvesztést okozna. V4→V3 visszaimport nincs most igazolva; ilyet csak külön, mezőnként ellenőrzött átalakítással és a V4-többletadatok megőrzésével lehet engedni. |
| Új V4 DB helyreállítása kell | A meglévő A17 restore-eljárás: külön aktuális journal, friss üzleti előzmény, törlések újraalkalmazása, jogosultság/retention ellenőrzés, addig forgalom és cron fagyasztva. | A journal nem állítható vissza a régi naplómentéssel együtt; törölt fiók/trial/fizetési előzmény nem éledhet vissza. A főpróba bizonyítékát használjuk; az új production resource identity és mentés tényleges olvashatósága külön ellenőrzendő. |

A visszaút első két esete az eredeti környezet megtartására épül. Új valós V4-adatok után a régi export egyszerű visszatöltése nem elfogadott rollback. A felhasználónak ezt az átállási ablak előtt jelezzük; nem ígérünk nem tesztelt, veszteségmentes V4→V3 automatizmust.

## 5. Aktuális rövid lista

- **Előkészítés kész:** main-tisztítás, kiadási kapcsolóleltár, konkrét main-védelmi beállítás, egyetlen lockfile-konfliktus megoldása és a 907/907 bizonyíték aktuális kódhoz egyeztetése. Support-küldés nincs a tervben.
- **Következő végrehajtás:** konfliktusfeloldó commit/feltöltés, main-védelem aktiválása, végső CI és külön jelzett main-merge. [Pontos lépések](MAIN_MERGE_READY_2026-10-21.md).
- **Utána:** app-URL és átmeneti családi hozzáférés véglegesítése; új production csomag és bekötés; friss mentéses egyszeri költözés a III–IV. lépés szerint; összevont főteszt.

**Következő: a kész main-merge végrehajtási lap alkalmazása. GPT-6 Astra · erős; kézi app-teszt nem szükséges.** A tényleges merge és élesítés előtt külön jelzés/jóváhagyás marad.
