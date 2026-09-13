# Solemi Sleep — Codex projektállapot

**Utolsó frissítés:** 2026-09-13  
**Aktív fejlesztési ág:** `feat/child-profile-v4`  
**Éles ág:** `main` (`a529a64`)  
**A státusz előtti utolsó távoli fejlesztési commit:** `70b29ab`

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

Az internal tesztkapcsoló helyben már a Family Sync előnézetét is vezérli: Free nézetben zárolt kártyát és Family-előfizetéses magyarázatot mutat, nem engedi a család létrehozását/csatlakoztatását, és nem futtat hálózati szinkront; Family és Family+ nézetben elérhető. A HU / EN / DE szöveg ennek megfelelő. Ez még nem valódi szerveres entitlement, és a módosítás nincs commitolva vagy publikálva.

Az aktuális helyi módosításokon a frontend typecheck, a teljes 71 teszt és a production build sikeres. A diff whitespace-ellenőrzése szintén sikeres.

## Fő nyitott blokkok a `main` migráció előtt

1. A családlétrehozás/tagság és az aktív Family Sync jogosultságának szétválasztása a meglévő architektúraterv szerint.
2. Valódi account/session rendszer és Google-belépés.
3. Szerveroldali entitlement-ellenőrzés.
4. App Store / Google Play előfizetés és visszaállítás.
5. Paywall és upgrade/downgrade folyamat.
6. Reprodukálható frontend- és Worker-lockfájlok.
7. Staging backup/restore és dokumentált rollback.
8. Privacy Policy, adatmegőrzés/törlés és support folyamat.
9. Production D1 mentés, V4 migráció, Worker deploy és csak ezután kontrollált `main` merge.

## Következő konkrét feladat

A következő fejlesztési szelet az account- és entitlement-állapotmodell előkészítése az `ACCOUNT_ENTITLEMENT_ARCHITECTURE.md` alapján. Külön döntés kell a személyes funkcióhozzáférésre és a család aktív szinkronjára; a Free tag hozzáférését nem szabad pusztán a saját csomagja alapján tiltani. Elsőként tiszta, tesztelhető állapotmodellt kell készíteni (fiók nélkül / bejelentkezve; tagság nélkül / aktív tagság; szinkron szünetel / engedélyezett), a meglévő sync-protokoll átállítása előtt. Kötelező esetek: Free + Free → nincs aktív sync; Family + Free → mindkettő szinkronizálhat; Family+ + Free → csak az előfizető kap prémium Insightsot; utolsó fizető jogosultságának lejárata → sync szünetel, adatok és tagság megmaradnak.

## Munkamegosztás

- **Codex:** architektúra, több fájlt/rendszert érintő fejlesztés, review és release-biztonság.
- **LOCAL AI DESK:** csak jól körülhatárolt, mechanikus részfeladatok; használata nem kötelező.
- **Felhasználó:** termékdöntések, telefonos vizuális teszt és éles műveletek jóváhagyása.

Minden érdemi commit után frissítsd ezt a fájlt, ha megváltozik az aktuális állapot, a következő feladat vagy valamelyik release-blokkoló.
