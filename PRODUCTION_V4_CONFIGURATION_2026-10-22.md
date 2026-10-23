# Új éles Solemi-környezet — bekötési csomag

**2026-10-22 — a végrehajtás levéve a soron következő feladatok közül.** A tulajdonos Android/iOS-kiadást kér, külön nyilvános webappot nem. Az alábbi Pages/app-aldomain terv történeti előkészítés, nem végrehajtandó kiadási feltétel. A háttérrendszerhez és a 90 napos hozzáféréshez készített eszközök megmaradnak későbbi felhasználásra; a mobilos belépés/API végleges megoldásához igazítandók. Most a mainre került funkciók összevont tesztje következik a meglévő tesztkörnyezetben, utána fizetés, mobilcsomagolás és kiadás. Ez a pontosítás felülírja a lap alján szereplő korábbi „Következő” lépést.

2026-10-22. **Előkészítés, távoli módosítás nélkül.** A main-merge kész; az új éles környezet létrehozása és a család költöztetése külön végrehajtási lépés. A meglévő staging/helyreállítási főpróbát nem ismételjük.

## Jóváhagyott döntések

- App: **https://app.solemi-sleep.app**. A megvett domain aldomainje; a **https://solemi-sleep.app** bemutatkozó oldal marad.
- Az átálló család **90 nap Family+** hozzáférést kap a tényleges átállástól. Nem trial, nem előfizetés, nem indul automatikus fizetés.
- Az admin Google-belépését a tulajdonos kiválasztotta. Címe a Gitből kizárt `worker/.private-backups/production-config-2026-10-22/decisions.json` fájlban van. A tényleges új account ID még nincs meg; jogosultság most nem keletkezett.
- A hozzáférés a kiválasztott fióké, és annak aktív családjával megosztódik a meglévő jogosultsági szabály szerint. A másik családtag meghívással csatlakozik; nem kap második 90 napot. A jogosult kilépésekor a család elveszíti az általa biztosított hozzáférést. Ez nem családhoz kötött trial.

## Pontos célok és helyi csomag

| Erőforrás | Új cél | Kiinduló állapot |
|---|---|---|
| Pages | `solemi-sleep-app` | Új projekt; root `/`, build `npm run build`, kimenet `dist`; kiadási ág `main`, automatikus kiadás még tiltva. |
| Worker | `solemi-sleep-sync-v4` | Új Worker, preview URL tiltva, karbantartási zárolás aktív, cron kikapcsolva. |
| App D1 | `solemi-sleep-db-v4` | Új, üres adatbázis, még kiosztandó azonosítóval. |
| Törlési/trial nyilvántartás D1 | `solemi-erasure-journal-production-v4` | Másik új, üres D1; nem a naplóval együtt visszaállítandó. |
| API | `https://solemi-sleep-sync-v4.czki-adam.workers.dev` | Tervezett cím; létrehozáskor igazolni kell. |
| Kéréskorlát | `19400`, `19401`, `19402` | API 6000/60s, belépés 120/60s, meghívás 30/60s; bekötéskor ellenőrizni, hogy a névterek szabadok. |

A legacy és staging konfigurációja változatlan. **Az általános `npm --prefix worker run deploy` a régi Workert célozza, ehhez az átálláshoz nem használható.** Nincs Free csomagon tiltott `limits.cpu_ms`.

Kész eszközök:

- `worker/scripts/prepare-production-v4.mjs`: ellenőrzött bemenetből privát, zárolt konfigurációs csomagot készít. Nem hív Cloudflare API-t és nem telepít.
- `worker/production-v4.inputs.example.json`: a kitöltendő bemenet; a helyőrzők szándékosan nem elfogadhatók.
- `worker/scripts/prepare-transition-access.mjs`: a tényleges új fiókhoz 90 napos, három funkciót tartalmazó ADMIN-jogosultság SQL-je és ellenőrző lekérdezése.

A csomag létrehozása a repo gyökeréből, a valódi erőforrások kiosztása után:

```powershell
node worker/scripts/prepare-production-v4.mjs worker/.private-backups/production-v4-inputs.json worker/.private-backups/production-v4-ready
```

Az output új könyvtár legyen. A generátor nem írja felül a korábbi bizonyítékot, és csak a repo privát mentési könyvtárába ír. Tiltja a jelenlegi legacy/staging D1-azonosítókat és az azonos app/journal célokat. Az új UUID-k valódiságát/nem próbakörnyezethez tartozását a távoli erőforrás-leltárral kell ellenőrizni; a helyi generátor ezt nem tudja igazolni.

Kimenetek: `worker.frozen.jsonc`, `frontend.env.local`, `pages-production-vars.json`, `source-schema.sql`, `journal-schema.sql`, `manifest.json` (azonosítók, fájlhash-ek, még nyitott aktiválási lépések). A Worker belépési útvonala abszolút helyi fájlút; másik gépen a csomag újragenerálandó.

## Pages, bejelentkezés és titkok

1. A Pages **production buildváltozói** a `frontend.env.local` tartalma. A buildcsatorna production, a belső tesztjelölés és tesztcsomag-váltás kikapcsolt, az app útvonala `/`, belépési proxy `/api`. A Worker/API és a frontend ugyanazt a végleges, tiszta **main SHA-t** kapja. A mostani előkészítő kódot is commitolni és a védett mainre bevinni kell a kiadás előtt; nem a régi merge teljes tesztkörét kezdjük újra.
2. A Pages **production Functions-változói**: `SOLEMI_PROXY_ENV=production`, `SOLEMI_API_ORIGIN` az új Worker eredete. A repo `functions/` könyvtárát is ki kell adni, nem elegendő csak egy statikus `dist` feltöltése. Preview build/production backend öröklés marad tiltva; ne adjuk a production proxy-változókat a preview környezetnek.
3. A Pages Custom domains alatt az `app.solemi-sleep.app` címet ehhez az új projekthez kell rendelni, a hozzá tartozó DNS-t és TLS-t ellenőrizni. A fődomain/`www` bemutatkozó oldalához nem nyúlunk. A `pages.dev` alternatív cím irányítson az appcímre; ne adjuk hozzá automatikusan az engedélyezett eredetekhez.
4. A Google webes OAuth-kliens engedélyezett JavaScript-originje legyen **https://app.solemi-sleep.app**. A frontend a Worker által adott kliensazonosítót használja. A régi/staging origin eltávolítása nem része ennek a lépésnek; a kliensazonosító nyilvános adat, nem titok.
5. Új, egymástól és a stagingtől különböző `TOKEN_PEPPER`, `AUTH_SECRET`, `TRIAL_IDENTITY_SECRET` szükséges, legalább 32 véletlen bájtból. Új ES256/P-256 kulcspár: a privát JWK csak az új Worker `OFFLINE_ENTITLEMENT_PRIVATE_JWK` titka, a nyilvános fele a frontend `VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK` változója. A generátor elutasítja a privát kulcsot a frontend bemenetében. Titok nem kerül Gitbe vagy képernyőképre.

Cloudflare hivatkozások: [Pages egyedi domainek](https://developers.cloudflare.com/pages/configuration/custom-domains/), [production/preview konfiguráció](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

## Végrehajtási sorrend a következő munkához

1. Külön jelzett létrehozás: kizárólag a fenti új erőforrások; tényleges nevek/azonosítók és üres app/journal ellenőrzése. Legacy és staging mentések/visszaút megmaradnak.
2. Valódi adatokkal csomaggenerálás. Az appba csak `source-schema.sql`: a V4 alapséma és **003–013**, nem 001/002. A külön journalba csak `journal-schema.sql`, amely production környezetet és az új app D1 ID-ját rögzíti. Semelyik teljes séma nem futtatható már használt adatbázison.
3. Új titkok bekötése, trial-program kulcsellenőrző rekord előkészítése a meglévő `prepare-trial-program.mjs` eszközzel, retention inventory és a tényleges szolgáltatói megőrzés igazolása. Az előírt 30 napos mentési szabály itt is érvényes. A public trial aktiválás egyelőre **false** marad; a programrekord nem indít trialt.
4. A zárolt Worker csomagolása, majd külön jelzett telepítése **kifejezett `--config` útvonallal** az új célra. A végleges SHA egyezzen a telepített tiszta forrással. A `RESTORE_MAINTENANCE=true` üzleti kéréseket tilt; ez előkészítési állapot, nem kész app.
5. A korábban elkészült A17 működés bekötése: maintenance/retention engedélyezése és `*/5 * * * *` cron az új Workerben a titok/journal ellenőrzése után. Ezután zárolás feloldása az ellenőrzött belépéshez, fióktörlés engedélyezése az ismert A17 ellenőrzésekkel. Ne maradjon meg véletlenül a zárolt vagy karbantartás nélküli konfiguráció az átadott appban.
6. Pages és OAuth bekötés, gépi ellenőrzés: kiadási SHA, HTTPS, proxy, CORS, anonim hozzáférés tiltása, tesztcsomag-váltás tiltása, journal-kötés és ütemezés. A már sikeres helyreállítási főpróba ismétlése nem feltétel.
7. Csak az átálláskor: friss naplóexport, új Google-belépés, az account ID és hitelesített Google-azonosság egyeztetése a privát döntéssel; ekkor indul a 90 nap. Új család, ellenőrzött naplóimport, másik családtag meghívása. Ez a későbbi rövid tulajdonosi belépési/importellenőrzés része, nem mostani kézi teszt.

## 90 napos hozzáférés alkalmazási lapja

A privát bemenet: `accountId` (a valódi új `acc_…` azonosító), `verifiedEmail` (a döntés szerinti Google-belépés), `startsAt` (a tényleges átállás epoch ezredmásodpercben). Most sem dátumot, sem account ID-t nem találunk ki.

```powershell
node worker/scripts/prepare-transition-access.mjs worker/.private-backups/transition-account.json worker/.private-backups/transition-access-ready
```

A `grant.sql` alkalmazása később **csak az új app D1-en**, a pontos cél és fiók egyeztetése után történik. Egyetlen atomi művelet mindhárom jogosultságra; hibás/inaktív/nem hitelesített Google-fiók, blokkolt helyreállítás vagy korábban kiosztott átállási jog esetén elutasítás. Ismétlés és második kedvezményezett sem hosszabbít vagy indít új 90 napot. `source_id=production-v4-transition-2026`, a vége pontosan kezdés + 90×24 óra. Nincs subscription- vagy trial-rekord.

Alkalmazás után `verify.sql`: pontosan három rekord, azonos account, kezdés/vég, `ADMIN`, nulla visszavonás; az app `/api/v1/auth/access` ellenőrzése a jogosulttal és a családtaggal. A grant a meglévő üzleti helyreállítási nyilvántartás része; egy régi mentés nem írhatja felül az aktuális jogosultsági előzményt.

Visszaút: hibás kiosztáskor a kampány három grantját közösen visszavonni (`revoked_at` és `updated_at` az egyeztetett időpont), nem törölni/újraaktiválni. Aktív offline igazolás a meglévő lejárati szabály szerint élhet; azonnali online hozzáférés-megvonás nem jelent távoli offline-adattörlést. A tényleges naplóátállás visszaútja továbbra is a [main-átállási terv](MAIN_TRANSITION_PLAN_2026-10-19.md): új írások zárolása és mentése, eltérések egyeztetése, a régi napló csak egyeztetett állapotból folytatható.

## Ellenőrzés és lezárás

**PASS: 33/33 célzott próba** (production előkészítés 13, meglévő proxy- és buildkapu-próbákkal együtt); a generált zárolt Worker **dry-run PASS**, a production frontend build **PASS**. A build meglévő 500 kB feletti chunk-figyelmeztetése megmaradt, nem buildhiba. Helyi bizonyíték: `worker/.private-backups/production-config-2026-10-22/`; távoli erőforrást nem módosítottunk. A korábbi teljes 915 tesztes CI-t nem állítjuk újrafuttatottnak.

A célzott tesztfájl: `worker/tests/productionPreparation.test.ts`. A helyi csomagolási bizonyíték szintetikus D1-azonosítókat, eldobható nyilvános kulcsot és nulla SHA-t használ; **nem kiadható konfiguráció**, nem bizonyít élő Google-belépést/DNS-t vagy létrejött Cloudflare-erőforrást. A tényleges éles azonosítók a következő lépésben lesznek elérhetők.

**Következő:** az új éles Cloudflare-erőforrások létrehozása és a zárolt bekötés végrehajtása a most elkészült csomaggal. **GPT-6 Astra · erős; kézi app-teszt nélkül indítható.** A tényleges létrehozást/telepítést előre jelezzük; a család importja és a régi rendszer esetleges törlése nem automatikus része ennek.
