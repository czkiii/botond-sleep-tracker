# Solemi Sleep — Codex projektállapot

**Utolsó frissítés:** 2026-09-14
**Aktív fejlesztési ág:** `feat/child-profile-v4`
**Éles ág:** `main` (`a529a64`)
**A munkamenet elején ellenőrzött fejlesztési HEAD:** `94e3554` (`Add account and session database foundation`)

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
- Family Sync családi jogosultság; Family+ Insights az előfizető személyes jogosultsága.

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

Blokkoló: még nincs Google OAuth Web client ID. Emiatt a staging Worker auth-verziója nincs deployolva, az internal account UI nincs engedélyezve, és valódi Google-fiókos belépési próba nem történt. Beállítás: `GOOGLE_AUTH_SETUP.md`.

## Fő nyitott blokkok a `main` migráció előtt

1. A családlétrehozás/tagság és az aktív Family Sync jogosultságának szétválasztása a meglévő architektúraterv szerint.
2. A helyben elkészült account/session rendszer valódi Google-belépési staging próbája és eszközkezelő UI-ja.
3. Szerveroldali entitlement-ellenőrzés.
4. App Store / Google Play előfizetés és visszaállítás.
5. Paywall és upgrade/downgrade folyamat.
6. Reprodukálható frontend- és Worker-lockfájlok.
7. Staging backup/restore és dokumentált rollback.
8. Privacy Policy, adatmegőrzés/törlés és support folyamat.
9. Production D1 mentés, V4 migráció, Worker deploy és csak ezután kontrollált `main` merge.

## Következő konkrét feladat

Hozd létre a Google OAuth Web client ID-t a `GOOGLE_AUTH_SETUP.md` szerint. Ezután állítsd be a staging Worker `GOOGLE_CLIENT_ID` változóját, deployold a staging Workert, kapcsold be az internal frontend `VITE_ACCOUNT_AUTH=true` buildjét, majd végezd el a valódi Google login/reload/logout és két-/háromeszközös smoke tesztet. Mobilon külön ellenőrizni kell, hogy a `pages.dev` → `workers.dev` cross-site HttpOnly refresh sütit nem blokkolja-e a böngésző; production előtt az API számára azonos webhely alatti saját domain javasolt.

## Munkamegosztás

- **Codex:** architektúra, több fájlt/rendszert érintő fejlesztés, review és release-biztonság.
- **LOCAL AI DESK:** csak jól körülhatárolt, mechanikus részfeladatok; használata nem kötelező.
- **Felhasználó:** termékdöntések, telefonos vizuális teszt, commit és push a GitHub Desktopban, valamint éles műveletek jóváhagyása. Codex a helyi módosításokat és a javasolt commit Summary szöveget készíti el.

Minden érdemi commit után frissítsd ezt a fájlt, ha megváltozik az aktuális állapot, a következő feladat vagy valamelyik release-blokkoló.
