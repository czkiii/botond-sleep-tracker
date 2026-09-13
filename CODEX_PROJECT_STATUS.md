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

**Következő kapu:** GitHub CI Node 22-n teljes typecheck + 71 teszt + build, majd az internal Cloudflare build kézi vizuális ellenőrzése.

## Fő nyitott blokkok a `main` migráció előtt

1. A csomagnézet és a zárolt kártyák vizuális elfogadása.
2. Valódi account/session rendszer és Google-belépés.
3. Szerveroldali entitlement-ellenőrzés.
4. App Store / Google Play előfizetés és visszaállítás.
5. Paywall és upgrade/downgrade folyamat.
6. Reprodukálható frontend- és Worker-lockfájlok.
7. Staging backup/restore és dokumentált rollback.
8. Privacy Policy, adatmegőrzés/törlés és support folyamat.
9. Production D1 mentés, V4 migráció, Worker deploy és csak ezután kontrollált `main` merge.

## Következő konkrét feladat

Várd meg a GitHub CI eredményét. Ha zöld, nyisd meg az internal oldalt mobilon, válts végig Free / Family / Family+ nézeten, és ellenőrizd, hogy az alap statisztikák minden csomagban látszanak, a Family+ elemzések pedig csak Family+ nézetben jelennek meg.

## Munkamegosztás

- **Codex:** architektúra, több fájlt/rendszert érintő fejlesztés, review és release-biztonság.
- **LOCAL AI DESK:** csak jól körülhatárolt, mechanikus részfeladatok; használata nem kötelező.
- **Felhasználó:** termékdöntések, telefonos vizuális teszt és éles műveletek jóváhagyása.

Minden érdemi commit után frissítsd ezt a fájlt, ha megváltozik az aktuális állapot, a következő feladat vagy valamelyik release-blokkoló.
